import pool from "../db.js";
import { sendPlatformMessage, sendTypingIndicator } from "./platformSender.js";
import { emitToAgency, emitToConversation } from "./socket.js";
import { logBotError, extractErrorMessage } from "./botLogger.js";
import { applyLabelToContact, removeLabelFromContact } from "../routes/labels.js";
import { sendWebhook } from "./outboundWebhook.js";
import * as googleSheetsUtil from "./googleSheets.js";
import { resolveNextNodeId, resolveNextStepNodeId, expandMessageBlocks } from "./flowGraph.js";
import { enrollContactsInSequence, unsubscribeContactFromSequence } from "../routes/sequences.js";
import { executeHttpApiCampaign } from "../services/httpApiExecutor.js";
import { scheduleFlowDelayResume } from "./flowDelayScheduler.js";
import { getBusinessHoursStatus } from "./businessHours.js";
import { handleAppointmentBooking } from "./appointmentBookingEngine.js";

// BOT SCOPE (see utils/botScope.js): a flow may only use Sequences, User Input Flows and
// other Flows of ITS OWN bot account (same integration_id) — every lookup below is scoped
// to the running flow's integration, so even bad data saved some other way can't cross bots.

// Mirrors FlowBuilderPage.jsx's TYPING_ELIGIBLE_NODE_TYPES — only node types
// that actually send a message to the contact offer "Show typing before
// sending", so this is the same list on the engine side.
const TYPING_ELIGIBLE_TYPES = new Set([
  "text", "interactive", "image", "video", "audio", "file",
  "buttons", "quickReplies", "listMenu", "carousel", "card",
]);

/**
 * Helper to find matching flow based on triggers
 */
export async function findMatchingFlow(agencyId, platform, conversationId, integration, incomingMsgBody, msgType = "TEXT", extraContext = {}) {
  const msgText = (typeof incomingMsgBody === "string" ? incomingMsgBody : "").trim().toLowerCase();
  const upperMsgType = (msgType || "TEXT").toUpperCase();
  const isMedia = ["IMAGE", "VIDEO", "AUDIO", "VOICE", "DOCUMENT", "FILE"].includes(upperMsgType);
  
  const integId = integration?.id || null;
  const query = integId
    ? `SELECT * FROM flows 
       WHERE agency_id = ? AND platform = ? AND is_active = 1 
         AND integration_id = ?
       ORDER BY (trigger_type = 'KEYWORD') DESC, created_at DESC`
    : `SELECT * FROM flows 
       WHERE agency_id = ? AND platform = ? AND is_active = 1 
         AND integration_id IS NULL
       ORDER BY (trigger_type = 'KEYWORD') DESC, created_at DESC`;
  const queryParams = integId ? [agencyId, platform, integId] : [agencyId, platform];
  const [flows] = await pool.query(query, queryParams);

  // Business Hours (utils/businessHours.js): "Allow Bot/Flow Replies outside
  // business hours" turned off — skip normal trigger matching for a brand-new
  // session entirely; only the off-hours flow fallback further down may start one.
  if (!extraContext?.suppressNewTrigger) {
  if (msgText) {
    const contextPrefill = (extraContext?.widgetPrefillMessage || "").trim().toLowerCase();
    const isWidgetStartMsg = msgText === "start a conversation" || msgText === "start" || msgText === "hello" || msgText === "hi";
    if (extraContext?.widgetFlowId && (isWidgetStartMsg || (contextPrefill && (msgText === contextPrefill || msgText.startsWith(contextPrefill))) || !contextPrefill)) {
      let targetFlow = flows.find(f => f.id === extraContext.widgetFlowId);
      if (!targetFlow && extraContext?.widgetFlowId) {
        const [[fRow]] = await pool.query("SELECT * FROM flows WHERE id = ? AND is_active = 1", [extraContext.widgetFlowId]);
        if (fRow) targetFlow = fRow;
      }
      if (targetFlow) {
        let widgetNodes = [];
        try { widgetNodes = JSON.parse(targetFlow.nodes_json || "[]"); } catch {}
        const widgetStart = widgetNodes.find(n => n.type === "start");
        if (widgetStart) {
          return {
            flow: targetFlow,
            ...expandMessageBlocks(widgetNodes, JSON.parse(targetFlow.edges_json || "[]")),
            startNode: widgetStart,
          };
        }
      }
    }

    for (const f of flows) {
      let widgetNodes = [];
      try { widgetNodes = JSON.parse(f.nodes_json || "[]"); } catch { continue; }
      const widgetStart = widgetNodes.find(n => n.type === "start");
      if (!widgetStart) continue;
      if (!widgetStart.data?.chatWidgetStart && f.trigger_type !== "CHAT_WIDGET") continue;

      const prefill = (widgetStart.data?.prefillMessage || "").trim().toLowerCase();
      // startsWith, not equality — the prefilled text is editable in WhatsApp
      // and visitors routinely type extra onto the end before sending.
      if (prefill && (msgText === prefill || msgText.startsWith(prefill))) {
        return {
          flow: f,
          ...expandMessageBlocks(widgetNodes, JSON.parse(f.edges_json || "[]")),
          startNode: widgetStart,
        };
      }
    }
  }

  for (const f of flows) {
    let flowNodes = [];
    try { flowNodes = JSON.parse(f.nodes_json || "[]"); } catch { flowNodes = []; }
    const startNode = flowNodes.find(n => n.type === "start");
    if (!startNode) continue;

    // Multi-trigger support: check if startNode has `triggers` array
    let triggersList = startNode.data?.triggers;
    if (!Array.isArray(triggersList) || triggersList.length === 0) {
      // A Chat Widget's Start node is launched by the widget/deep-link, never
      // by keyword — force this regardless of any stale `data.trigger_type`
      // left over from the node's properties panel (that field is hidden for
      // chat-widget starts, see FlowBuilderPage.jsx's validateNodeData, but
      // can still hold an old value from before a flow was linked to a widget).
      const isChatWidgetStart = Boolean(startNode.data?.chatWidgetStart) || f.trigger_type === "CHAT_WIDGET";
      triggersList = [
        {
          type: isChatWidgetStart ? "chat_widget" : (startNode.data?.trigger_type || f.trigger_type || "keyword"),
          match_type: startNode.data?.match_type || "contains",
          keywords: startNode.data?.keywords || (f.trigger_keyword ? f.trigger_keyword.split(",") : []),
        }
      ];
    }

    let isMatch = false;
    for (const trig of triggersList) {
      const tType = (trig.type || trig.trigger_type || "keyword").toLowerCase();

      if (tType === "keyword" || tType === "user_sends_message" || tType === "message") {
        if (isMedia && !msgText) continue;

        const rawKws = trig.keywords || (trig.trigger_keyword ? trig.trigger_keyword.split(",") : []);
        const keywords = (Array.isArray(rawKws) ? rawKws : [rawKws])
          .map(k => (typeof k === "string" ? k.trim().toLowerCase() : ""))
          .filter(Boolean);

        const mType = (trig.match_type || trig.matchType || "contains").toLowerCase();

        // 1. Message is thumbs up
        if (mType === "thumbs_up" || mType === "thumbsup" || mType === "is_thumbs_up") {
          const thumbsList = ["👍", "thumbs up", "(y)", "like", "👍🏻", "👍🏼", "👍🏽", "👍🏾", "👍🏿"];
          if (thumbsList.includes(msgText)) {
            isMatch = true;
            break;
          }
          continue;
        }

        if (keywords.length === 0) continue;

        // 2. Message is (exact match)
        if (mType === "is" || mType === "exact") {
          if (keywords.some(kw => msgText === kw)) {
            isMatch = true;
            break;
          }
        }
        // 3. Message begins with
        else if (mType === "begins_with" || mType === "starts_with") {
          if (keywords.some(kw => msgText.startsWith(kw))) {
            isMatch = true;
            break;
          }
        }
        // 4. Message contains whole word
        else if (mType === "contains_whole_word" || mType === "whole_word") {
          const matched = keywords.some(kw => {
            const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return new RegExp(`(^|\\s|[.,!?;:])${escaped}($|\\s|[.,!?;:])`, "i").test(msgText);
          });
          if (matched) {
            isMatch = true;
            break;
          }
        }
        // 5. Message doesn't contain
        else if (mType === "does_not_contain" || mType === "not_contains") {
          if (msgText && keywords.every(kw => !msgText.includes(kw))) {
            isMatch = true;
            break;
          }
        }
        // 6. Message contains (default)
        else {
          if (msgText && keywords.some(kw => msgText.includes(kw))) {
            isMatch = true;
            break;
          }
        }
      } else if (tType === "first_contact" || tType === "first_message" || tType === "chat_widget" || tType === "chatwidget") {
        if (conversationId) {
          // Count only INBOUND messages from the visitor so initial greeting
          // messages (e.g. sent by webchat/init) don't inflate the count.
          const [msgCount] = await pool.query(
            "SELECT COUNT(*) as count FROM messages WHERE conversation_id = ? AND direction = 'INBOUND'",
            [conversationId]
          );
          if (msgCount[0]?.count <= 1) {
            isMatch = true;
            break;
          }
        } else {
          isMatch = true;
          break;
        }
      } else if (tType === "any" || tType === "any_message") {
        isMatch = true;
        break;
      } else if (tType === "fallback" || tType === "default") {
        if (isMedia && !msgText) {
          isMatch = true;
          break;
        }
      }
    }

    if (isMatch) {
      return {
        flow: f,
        ...expandMessageBlocks(flowNodes, JSON.parse(f.edges_json || "[]")),
        startNode,
      };
    }
  }
  } // !extraContext?.suppressNewTrigger

  // If no trigger matched yet, but this is a chat widget conversation on its first
  // inbound message and has a designated widget flow, launch that flow!
  if (extraContext?.widgetFlowId && conversationId) {
    const [inboundCount] = await pool.query(
      "SELECT COUNT(*) as count FROM messages WHERE conversation_id = ? AND direction = 'INBOUND'",
      [conversationId]
    );
    if (inboundCount[0]?.count <= 1) {
      let widgetFlow = flows.find(f => f.id === extraContext.widgetFlowId);
      if (!widgetFlow) {
        const [[fRow]] = await pool.query("SELECT * FROM flows WHERE id = ? AND is_active = 1", [extraContext.widgetFlowId]);
        if (fRow) widgetFlow = fRow;
      }
      if (widgetFlow) {
        let fNodes = [];
        try { fNodes = JSON.parse(widgetFlow.nodes_json || "[]"); } catch {}
        const sNode = fNodes.find(n => n.type === "start");
        if (sNode) {
          return {
            flow: widgetFlow,
            ...expandMessageBlocks(fNodes, JSON.parse(widgetFlow.edges_json || "[]")),
            startNode: sNode,
          };
        }
      }
    }
  }

  if (extraContext?.offHoursFlowId) {
    let offHoursFlow = flows.find((f) => f.id === extraContext.offHoursFlowId);
    if (!offHoursFlow) {
      const [[fRow]] = await pool.query(
        "SELECT * FROM flows WHERE id = ? AND agency_id = ? AND integration_id = ? AND is_active = 1",
        [extraContext.offHoursFlowId, agencyId, integId]
      );
      if (fRow) offHoursFlow = fRow;
    }
    if (offHoursFlow) {
      let ohNodes = [];
      try { ohNodes = JSON.parse(offHoursFlow.nodes_json || "[]"); } catch {}
      const ohStart = ohNodes.find((n) => n.type === "start");
      if (ohStart) {
        return {
          flow: offHoursFlow,
          ...expandMessageBlocks(ohNodes, JSON.parse(offHoursFlow.edges_json || "[]")),
          startNode: ohStart,
        };
      }
    }
  }

  return null;
}

/**
 * Main Flow Engine Processor
 * Returns true if a flow was processed/executed (so the webhook knows NOT to run standard bot rules).
 */
// `resumeContext` (only ever set by utils/flowDelayScheduler.js) resumes a
// session that a per-node Delay paused — there is no fresh inbound message to
// interpret, the flow just continues exactly where the paused node left off.
// Shaped as `{ session, skipDelayForNodeId }`: `session` slots into the
// existing `forcedSession` mechanism (so the session-lookup query and the 24h
// staleness check are skipped exactly like a decoded-button-route session
// already skips them — a session legitimately paused for up to 48h must not
// be mistaken for one merely gone quiet), and `skipDelayForNodeId` tells the
// Main Execution Loop below not to re-pause on the very node whose delay just
// expired (every other node's own Delay, reached later in this same pass,
// still applies normally).
export async function processFlow(agencyId, platform, conversation, contact, incomingMsgBody, integration, msgType = "TEXT", buttonRoute = null, resumeContext = null, extraContext = null) {
  const conversationId = conversation.id;
  let session = null;
  let flow = null;
  let currentNodeId = null;

  try {
    // Check if bot is paused for this conversation or contact
    if (conversation?.bot_paused || contact?.bot_paused) {
      console.log(`🤖 [Flow Engine] Bot/Flow is paused for conversation ${conversationId} or contact ${contact?.id}`);
      return false;
    }

    // 0. Direct button routing. Every button this engine sends now carries an
    // encoded "which flow, which node, which button index sent it" token as its
    // own id/payload (see encodeButtonRoute below) — Meta doesn't disable old
    // buttons after one is clicked, so a customer can legitimately tap ANY
    // previously-sent button at ANY time, not just the one belonging to
    // whatever the conversation's session happens to be parked at right now.
    // When we recognize one of our own tokens, it always wins: resolve it
    // directly by flow+node+button-index and start fresh execution there,
    // superseding whatever session currently exists — independent of whether
    // that session already moved on, completed, or belongs to a different flow.
    let forcedSession = resumeContext ? resumeContext.session : null;
    // A Delay resume has no inbound message/button tap to decode — skip
    // straight past all of step 0 below.
    const decodedRoute = resumeContext ? null : (decodeButtonRoute(buttonRoute) || decodeButtonRoute(incomingMsgBody));
    if (decodedRoute) {
      const [[routedFlow]] = await pool.query(
        "SELECT * FROM flows WHERE id = ? AND agency_id = ? AND is_active = 1",
        [decodedRoute.flowId, agencyId]
      );
      if (routedFlow) {
        const { nodes: routedNodes, edges: routedEdges } = expandMessageBlocks(
          JSON.parse(routedFlow.nodes_json || "[]"),
          JSON.parse(routedFlow.edges_json || "[]")
        );
        const sourceNode = routedNodes.find((n) => n.id === decodedRoute.nodeId);
        if (sourceNode) {
          // A listMenu node's items now live under data.lists (see
          // normalizeListMenuData below) rather than a flat data.items — flatten
          // them here too so the single-option fallback right below still counts
          // correctly for a node using the new shape.
          const flatListCount = Array.isArray(sourceNode.data?.lists)
            ? sourceNode.data.lists.reduce((sum, l) => sum + (l.items?.length || 0), 0)
            : 0;
          const optionCount = (sourceNode.data?.buttons || sourceNode.data?.replies || sourceNode.data?.quickReplies || sourceNode.data?.items || []).length || flatListCount;

          // The tapped option's object — a button (data.buttons[idx]) or, for
          // a listMenu node, the item at the same flat index across all its
          // sections (see flattenListMenuItems) — used below for the two
          // capabilities that don't route through a canvas wire at all: "Go
          // to Existing Flow" and "Also enroll in a Sequence".
          let tappedButton = (sourceNode.data?.buttons || [])[decodedRoute.idx];
          if (!tappedButton && sourceNode.type === "listMenu") {
            const flatItems = flattenListMenuItems(normalizeListMenuData(sourceNode.data));
            tappedButton = flatItems.find((f) => f.globalIndex === decodedRoute.idx)?.item;
          }

          // "Also enroll in a Sequence": independent of whatever the tap's
          // primary action does (continue the flow, jump elsewhere, open a
          // link) — fires first, same additive relationship the Start node's
          // own Attach Sequence branch already has to the rest of that flow.
          if (tappedButton?.sequenceId) {
            try {
              await enrollContactsInSequence(tappedButton.sequenceId, agencyId, { contactId: contact?.id, enrolledVia: "button-tap", integrationId: routedFlow.integration_id ?? null });
            } catch (err) {
              console.error(`[Flow Engine] Attach-Sequence ${tappedButton.sequenceId} on button tap failed:`, err.message);
            }
          }

          // "Also remove from a Sequence": the mirror of the enroll above — stops
          // the contact's enrollment in a DIFFERENT sequence the moment this is
          // tapped (e.g. a "Yes, I'm interested" button that both enrolls in the
          // sales-follow-up sequence AND drops the contact out of an abandoned-
          // cart one). Independent of enrollment above; both can fire on one tap.
          if (tappedButton?.removeSequenceId) {
            try {
              await unsubscribeContactFromSequence(tappedButton.removeSequenceId, agencyId, contact?.id, { integrationId: routedFlow.integration_id ?? null });
            } catch (err) {
              console.error(`[Flow Engine] Remove-Sequence ${tappedButton.removeSequenceId} on button tap failed:`, err.message);
            }
          }

          // "Tag with Label": same additive, independent-of-the-action
          // relationship as the Sequence enrollment above — applyLabelToContact
          // already catches/logs its own errors, so no extra try/catch needed.
          if (Array.isArray(tappedButton?.labelIds) && contact?.id) {
            for (const labelId of tappedButton.labelIds) {
              await applyLabelToContact(agencyId, contact.id, labelId);
            }
          }

          // "Remove Label": the mirror of the tag-with-label above — un-tags the
          // contact the moment this is tapped, independent of any label(s) just
          // added by the same tap (removeLabelFromContact also catches/logs its
          // own errors).
          if (Array.isArray(tappedButton?.removeLabelIds) && contact?.id) {
            for (const labelId of tappedButton.removeLabelIds) {
              await removeLabelFromContact(agencyId, contact.id, labelId);
            }
          }

          // "Go to Existing Flow" button: jumps straight into another flow's
          // start node, independent of any canvas wire on THIS flow — that's
          // the whole point of the action, so it's resolved before (and takes
          // priority over) the same-flow edge lookup below.
          if (tappedButton?.action === "goToFlow" && tappedButton?.flowId) {
            const [[targetFlow]] = await pool.query(
              "SELECT * FROM flows WHERE id = ? AND agency_id = ? AND integration_id = ? AND is_active = 1",
              [tappedButton.flowId, agencyId, routedFlow.integration_id ?? null]
            );
            const targetStart = targetFlow
              ? JSON.parse(targetFlow.nodes_json || "[]").find((n) => n.type === "start")
              : null;
            if (targetStart) {
              await pool.query(
                "UPDATE flow_sessions SET status = 'COMPLETED' WHERE conversation_id = ? AND status = 'ACTIVE'",
                [conversationId]
              );
              const [newSessRes] = await pool.query(
                "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
                [agencyId, conversationId, targetFlow.id, targetStart.id, JSON.stringify({})]
              );
              forcedSession = {
                id: newSessRes.insertId,
                agency_id: agencyId,
                conversation_id: conversationId,
                flow_id: targetFlow.id,
                current_node_id: targetStart.id,
                variables: {},
                status: "ACTIVE",
              };
            }
            // Else: target flow was deleted/deactivated, or has no start node,
            // since the button was sent — falls through to normal handling
            // below exactly like a same-flow dead-end click does.
          }

          if (!forcedSession) {
            let targetId = routedEdges.find((e) => e.source === decodedRoute.nodeId &&
              (e.sourceHandle === `btn-${decodedRoute.idx}` || e.sourceHandle === `btn_${decodedRoute.idx}` ||
               e.sourceHandle === `qr-${decodedRoute.idx}` || e.sourceHandle === `qr_${decodedRoute.idx}` ||
               e.sourceHandle === `item_${decodedRoute.idx}` || e.sourceHandle === `item-${decodedRoute.idx}`)
            )?.target;
            // Single-option nodes may only have a plain unlabeled edge (see the
            // strict-routing notes below) — unambiguous, safe to use here too.
            if (!targetId && optionCount === 1) {
              targetId = routedEdges.find((e) => e.source === decodedRoute.nodeId)?.target;
            }

            if (targetId) {
              await pool.query(
                "UPDATE flow_sessions SET status = 'COMPLETED' WHERE conversation_id = ? AND status = 'ACTIVE'",
                [conversationId]
              );
              const [newSessRes] = await pool.query(
                "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
                [agencyId, conversationId, routedFlow.id, targetId, JSON.stringify({})]
              );
              forcedSession = {
                id: newSessRes.insertId,
                agency_id: agencyId,
                conversation_id: conversationId,
                flow_id: routedFlow.id,
                current_node_id: targetId,
                variables: {},
                status: "ACTIVE",
                // created_at/updated_at deliberately omitted (same as any other
                // freshly-created session below) so the "was this already
                // executed and now waiting for input" resume check further down
                // (created_at !== updated_at) naturally reads as false here.
                // flow/nodes/edges aren't attached here — the existing "load flow
                // details" step right below re-derives them from flow_id exactly
                // the same way it does for any other session.
              };
            }
            // Else: this specific button has nothing wired for it — a legitimate
            // no-op click (dead end by design). Fall through to normal handling;
            // it's very unlikely incomingMsgBody/buttonRoute also happens to match
            // a real keyword trigger, so this typically just quietly does nothing.
          }
        }
      }
      // Flow deleted/deactivated since the button was sent — falls through to
      // normal handling below rather than erroring.
    }

    // 1. Check for active flow session
    const [sessions] = forcedSession ? [[]] : await pool.query(
      "SELECT * FROM flow_sessions WHERE conversation_id = ? AND status = 'ACTIVE' LIMIT 1",
      [conversationId]
    );

    session = forcedSession || sessions[0];
    flow = null;
    let nodes = [];
    let edges = [];

    if (session && !forcedSession) {
      // Expire session if older than 24 hours
      const sessionAgeMs = Date.now() - new Date(session.updated_at).getTime();
      if (sessionAgeMs > 24 * 60 * 60 * 1000) {
        await pool.query("UPDATE flow_sessions SET status = 'EXPIRED' WHERE id = ?", [session.id]);
        session = null;
      }
    }

    if (session) {
      // Load flow details
      const [flows] = await pool.query(
        "SELECT * FROM flows WHERE id = ? AND agency_id = ? AND is_active = 1 LIMIT 1",
        [session.flow_id, agencyId]
      );
      flow = flows[0];
      if (flow) {
        ({ nodes, edges } = expandMessageBlocks(JSON.parse(flow.nodes_json || "[]"), JSON.parse(flow.edges_json || "[]")));
      } else {
        // Flow deleted or inactive, close session
        await pool.query("UPDATE flow_sessions SET status = 'COMPLETED', delay_next_run_at = NULL WHERE id = ?", [session.id]);
        session = null;
      }
    }

    if (!session) {
      // 2. Look for matching flow trigger
      const match = await findMatchingFlow(agencyId, platform, conversationId, integration, incomingMsgBody, msgType, extraContext);
      if (match) {
        flow = match.flow;
        nodes = match.nodes;
        edges = match.edges;

        const [newSess] = await pool.query(
          "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
          [agencyId, conversationId, flow.id, match.startNode.id, JSON.stringify({})]
        );

        session = {
          id: newSess.insertId,
          agency_id: agencyId,
          conversation_id: conversationId,
          flow_id: flow.id,
          current_node_id: match.startNode.id,
          variables: {},
          status: "ACTIVE"
        };

        // Start node's own optional "Tag with Label" — applied once, right
        // when the flow's trigger actually fires (same idea as the User
        // Input Flow Start node's labelIds, applied further below).
        const startLabelIds = Array.isArray(match.startNode.data?.labelIds) ? match.startNode.data.labelIds : [];
        if (startLabelIds.length > 0 && contact?.id) {
          for (const labelId of startLabelIds) {
            await applyLabelToContact(agencyId, contact.id, labelId);
          }
        }
      }
    }

    if (!session || !flow) {
      return false; // No flow triggered or active
    }

    // Parse variables if it's a string
    let variables = typeof session.variables === "string" ? JSON.parse(session.variables) : (session.variables || {});

    // ── User Input Flow (sub-flow) call/return tracking ─────────────────────
    // `mainNodes`/`mainEdges` are always the top-level bot Flow's own nodes — kept
    // around so a "Final Answer" node inside a User Input Flow can pop back to
    // them. `nodes`/`edges` (below) point at whichever is *active* right now:
    // the main flow normally, or the running User Input Flow's own nodes while
    // a "Run User Input Flow" node has handed off control.
    let mainNodes = nodes;
    let mainEdges = edges;
    let inUIF = false;
    let activeUifId = session.user_input_flow_id || null;
    let returnNodeId = session.return_node_id || null;
    let mainParkedNodeId = session.current_node_id;

    if (session.active_context === "USER_INPUT_FLOW" && session.user_input_flow_id) {
      const [[uifRow]] = await pool.query(
        "SELECT * FROM user_input_flows WHERE id = ? AND agency_id = ? AND integration_id = ? AND is_active = 1",
        [session.user_input_flow_id, agencyId, flow?.integration_id ?? null]
      );
      if (uifRow) {
        nodes = JSON.parse(uifRow.nodes_json || "[]");
        edges = JSON.parse(uifRow.edges_json || "[]");
        inUIF = true;
      } else {
        console.warn(`[Flow Engine] User Input Flow ${session.user_input_flow_id} missing/inactive; resuming main flow instead.`);
      }
    }

    const originalSessionId = session.id;

    // 3. Resume and Execute Flow Node Loop
    let currentNodeId = inUIF ? session.uif_current_node_id : session.current_node_id;
    let nextNodeId = null;
    let stopFlow = false;

    // Helper to get next node ID based on edge connections (always resolves
    // against whichever node set is currently active — see `nodes`/`edges`
    // above). Delegates to flowGraph.js so the Sequence runner walks its own
    // canvas with identical edge-resolution logic instead of a second
    // implementation that could drift out of sync.
    const getNextNodeId = (sourceId, sourceHandle = null) => resolveNextNodeId(edges, sourceId, sourceHandle);

    // Strictly whatever is wired to this node's own "Next Step" handle — never a
    // button / quick-reply / list-item branch, and deliberately NOT falling back
    // to "any edge from this node" the way getNextNodeId does (that fallback
    // would happily grab a btn-0 edge and fire button 1's reply with nobody
    // having clicked anything). The Flow Builder gives every option-bearing node
    // its own "Next Step" handle whose edges are always tagged exactly
    // "next-step", so this match is unambiguous.
    const getNextStepNodeId = (sourceId) => resolveNextStepNodeId(edges, sourceId);

    // If resuming from a node that was waiting for input
    const currentNode = nodes.find(n => n.id === currentNodeId);

    // If the node no longer exists in flow (e.g. user deleted it while session was active)
    if (!currentNode) {
      console.log(`🤖 [Flow Engine] Node "${currentNodeId}" not found in flow ${flow?.id}. Stale session ${session.id} will be completed.`);
      await pool.query("UPDATE flow_sessions SET status = 'COMPLETED', delay_next_run_at = NULL WHERE id = ?", [session.id]);
      session = null;
      // Check if incoming message starts a new flow
      const newMatch = await findMatchingFlow(agencyId, platform, conversationId, integration, incomingMsgBody, msgType, extraContext);
      if (newMatch) {
        console.log(`🤖 [Flow Engine] User input "${incomingMsgBody}" triggered new flow "${newMatch.flow.name}".`);
        flow = newMatch.flow;
        nodes = newMatch.nodes;
        edges = newMatch.edges;
        const [newSess] = await pool.query(
          "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
          [agencyId, conversationId, flow.id, newMatch.startNode.id, JSON.stringify({})]
        );
        session = {
          id: newSess.insertId,
          agency_id: agencyId,
          conversation_id: conversationId,
          flow_id: flow.id,
          current_node_id: newMatch.startNode.id,
          variables: {},
          status: "ACTIVE"
        };
        variables = {};
        currentNodeId = newMatch.startNode.id;
        nextNodeId = newMatch.startNode.id;
      } else {
        return false;
      }
    } else if (!resumeContext && session.created_at !== session.updated_at) {
      // (A Delay resume never reaches here — there's no fresh input to
      // interpret, it's simply continuing the paused node below.)
      // We had already executed this node in a previous step and were waiting for input.
      // Now process the user's input.
      if (currentNode.type === "collectInput" || currentNode.type === "question") {
        const isQuestion = currentNode.type === "question";

        // A "question" (User Input Flow) node is identified ONLY by its Custom
        // Field — no separate variable name to keep in sync with it. Look the
        // field up live (not the Flow Builder's mirrored fieldKey/fieldLabel,
        // which only exist so the canvas card has something to show without a
        // full field list) so a field renamed after this question was built is
        // still reflected correctly here. A plain "collectInput" node (main
        // flow) is unaffected — it still uses its own free-typed variable name.
        let questionField = null;
        if (isQuestion && currentNode.data?.saveToFieldId) {
          const [[fieldRow]] = await pool.query(
            "SELECT id, name, field_key FROM custom_field_definitions WHERE id = ? AND agency_id = ?",
            [currentNode.data.saveToFieldId, agencyId]
          );
          questionField = fieldRow || null;
        }

        // Note: the Flow Builder UI saves the variable name to `data.variable` — this used to
        // read `data.variableName` (never set by the UI), so every captured answer silently
        // fell back to the generic "last_input" key regardless of what was configured.
        const varName = isQuestion
          ? (questionField?.field_key || currentNode.data?.fieldKey || currentNode.data?.variable || "last_input")
          : (currentNode.data?.variable || currentNode.data?.variableName || "last_input");
        const inputType = (currentNode.data?.inputType || "text").toLowerCase();
        let rawInput = (incomingMsgBody || "").trim();

        // Multiple Choice questions validate against their own option list instead
        // of an input-type format — a tapped button's reply arrives as its title
        // text (WhatsApp/Facebook/Telegram all echo the button's title as the
        // message body in this codebase's webhook parsing), so a plain
        // case-insensitive match against the configured options handles a real
        // tap and someone just typing the option's name identically.
        const isChoice = isQuestion && currentNode.data?.answerType === "choice";
        const choiceOptions = isChoice
          ? (currentNode.data?.options || []).map((o) => (typeof o === "string" ? o : (o.title || o.label || ""))).filter(Boolean)
          : [];

        if (isChoice) {
          const matched = choiceOptions.find((opt) => opt.toLowerCase() === rawInput.toLowerCase());
          if (!matched) {
            const invalidMsg = currentNode.data?.invalidMessage?.trim()
              || `Please choose one of: ${choiceOptions.join(", ")}`;
            await sendMsg(agencyId, conversation, invalidMsg, "TEXT", integration, {
              flowId: flow?.id || session?.flow_id || null,
              nodeId: currentNode.id,
              contactIdentifier: contact?.external_id || contact?.phone || null,
            });
            return true; // stay on this node; wait for another reply
          }
          rawInput = matched; // normalize to the option's exact configured text/casing
        } else if (!isValidCollectedInput(rawInput, inputType)) {
          // Re-ask instead of silently accepting/advancing on bad input — works identically
          // on every channel since it's driven by the same plain-text reply path they all share.
          const invalidMsg = currentNode.data?.invalidMessage?.trim() || DEFAULT_INVALID_INPUT_MESSAGE[inputType]
            || DEFAULT_INVALID_INPUT_MESSAGE.text;
          await sendMsg(agencyId, conversation, invalidMsg, "TEXT", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: currentNode.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
          });
          return true; // stay on this node; wait for another reply
        }

        variables[varName] = rawInput;

        // Save the flow-session variable (as before) ...
        await pool.query("UPDATE flow_sessions SET variables = ? WHERE id = ?", [JSON.stringify(variables), session.id]);

        // ... and, if this node is configured to save into a real Custom Field, persist it
        // there too so it shows up on the subscriber's profile in the Inbox, not just for the
        // lifetime of this flow session.
        const saveFieldId = currentNode.data?.saveToFieldId;
        if (saveFieldId && conversation?.contact_id) {
          try {
            await pool.query(
              `INSERT INTO contact_custom_field_values (contact_id, field_id, value)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
              [conversation.contact_id, saveFieldId, rawInput]
            );
            emitToAgency(agencyId, "contact_custom_field_updated", {
              contactId: conversation.contact_id,
              fieldId: Number(saveFieldId),
              value: rawInput,
            });
          } catch (cfErr) {
            console.warn(`[Flow Engine] Failed to save collectInput value to custom field ${saveFieldId}:`, cfErr.message);
          }
        }

        // "question" nodes (User Input Flow only) also accumulate into the running
        // Q&A trail used to build the full submission once the flow completes —
        // see completeUserInputFlowResponse. A plain "collectInput" node (main flow)
        // has no such submission to build, so it's excluded.
        if (isQuestion) {
          if (!Array.isArray(variables.__uifAnswers)) variables.__uifAnswers = [];
          variables.__uifAnswers.push({
            label: questionField?.name || currentNode.data?.fieldLabel || "Answer",
            message: currentNode.data?.message || "",
            value: rawInput,
          });
          await pool.query("UPDATE flow_sessions SET variables = ? WHERE id = ?", [JSON.stringify(variables), session.id]);
        }

        if (currentNode.type === "question" && currentNode.data?.endFlow) {
          // This question is configured to end the User Input Flow itself — an
          // inline shortcut for the common case, instead of always needing a
          // separate "Final Answer" node wired after it. Same completion path,
          // just triggered here instead of from a dedicated node.
          const finalMsg = replaceVariables(
            currentNode.data?.finalMessage || "Thanks — that's everything I needed!",
            variables, contact
          );
          if (finalMsg) {
            await sendMsg(agencyId, conversation, finalMsg, "TEXT", integration, {
              flowId: flow?.id || session?.flow_id || null,
              nodeId: currentNode.id,
              contactIdentifier: contact?.external_id || contact?.phone || null,
            });
          }

          if (activeUifId) {
            await completeUserInputFlowResponse({
              agencyId,
              uifId: activeUifId,
              uifStartData: nodes.find(n => n.type === "start")?.data,
              variables,
              contact,
              conversation,
              mainFlowId: flow?.id || null,
            });
          }

          if (inUIF && returnNodeId) {
            nodes = mainNodes;
            edges = mainEdges;
            nextNodeId = returnNodeId;
            inUIF = false;
            activeUifId = null;
            returnNodeId = null;
          } else {
            // Defensive: a User Input Flow isn't directly triggerable, so this
            // shouldn't happen, but end the session cleanly if it ever does.
            await pool.query("UPDATE flow_sessions SET status = 'COMPLETED', current_node_id = ? WHERE id = ?", [currentNode.id, session.id]);
            return true;
          }
        } else {
          // Follow default outgoing handle (Next Question / Next Step)
          nextNodeId = getNextNodeId(currentNodeId);
        }
      }
      else if (currentNode.type === "buttons" || currentNode.type === "interactive" || ((currentNode.type === "image" || currentNode.type === "text") && (currentNode.data?.buttons || []).length > 0)) {
        const choice = (incomingMsgBody || "").trim().toLowerCase();
        const btns = currentNode.data?.buttons || [];
        let matchedIdx = -1;
        let matchedHandleId = null;

        for (let i = 0; i < btns.length; i++) {
          const btn = btns[i];
          const title = typeof btn === "string" ? btn : (btn.title || btn.label || "");
          const replyText = typeof btn === "object" ? (btn.reply_text || "") : "";
          const payload = typeof btn === "string" ? btn : (btn.payload || "");
          const id = typeof btn === "string" ? `btn-${i}` : (btn.id || `btn-${i}`);
          const altId = `btn_${i}`;

          if (
            (title && title.toLowerCase() === choice) ||
            (replyText && replyText.toLowerCase() === choice) ||
            (payload && payload.toLowerCase() === choice) ||
            (id && id.toLowerCase() === choice) ||
            (altId && altId.toLowerCase() === choice)
          ) {
            matchedIdx = i;
            matchedHandleId = id;
            break;
          }
        }

        if (matchedIdx !== -1) {
          // Only ever follow THIS button's own edge (tried under its few possible
          // handle-naming variants) — never fall back to the node's generic
          // "next-step" edge or any other edge. That fallback used to mean a
          // button with no edge of its own would silently hijack whatever
          // "next step" happened to be wired for a completely different purpose
          // (e.g. the plain no-buttons continuation path), sending the user down
          // a path that had nothing to do with the button they actually clicked.
          nextNodeId = getNextNodeId(currentNodeId, matchedHandleId) ||
                       getNextNodeId(currentNodeId, `btn-${matchedIdx}`) ||
                       getNextNodeId(currentNodeId, `btn_${matchedIdx}`);

          // A node with only ONE button is unambiguous — the Flow Builder often
          // draws its single outgoing edge as a plain unlabeled/"default" edge
          // rather than tagging it "btn-0", since there's nothing else it could
          // mean. Only fall back to that generic edge in this single-button case;
          // with 2+ buttons this stays strict (that's the actual fix from before).
          if (!nextNodeId && btns.length === 1) {
            nextNodeId = getNextNodeId(currentNodeId);
          }

          if (!nextNodeId) {
            // This specific button has no edge wired at all — dead end, complete.
            await pool.query("UPDATE flow_sessions SET status = 'COMPLETED', current_node_id = ? WHERE id = ?", [currentNodeId, session.id]);
            return true;
          }
        } else {
          // User sent text that did NOT match any button on this node.
          // Check if this incoming message matches another flow (or restarts this flow)
          const newMatch = await findMatchingFlow(agencyId, platform, conversationId, integration, incomingMsgBody, msgType);
          if (newMatch) {
            console.log(`🤖 [Flow Engine] User input "${incomingMsgBody}" triggered new flow "${newMatch.flow.name}". Completing previous session ${session.id}.`);
            await pool.query("UPDATE flow_sessions SET status = 'COMPLETED' WHERE id = ?", [session.id]);

            flow = newMatch.flow;
            nodes = newMatch.nodes;
            edges = newMatch.edges;

            const [newSess] = await pool.query(
              "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
              [agencyId, conversationId, flow.id, newMatch.startNode.id, JSON.stringify({})]
            );

            session = {
              id: newSess.insertId,
              agency_id: agencyId,
              conversation_id: conversationId,
              flow_id: flow.id,
              current_node_id: newMatch.startNode.id,
              variables: {},
              status: "ACTIVE"
            };
            variables = {};
            currentNodeId = newMatch.startNode.id;
            nextNodeId = newMatch.startNode.id;
          } else {
            console.log(`🤖 [Flow Engine] User input "${incomingMsgBody}" did not match buttons on node ${currentNode.id}, nor any flow trigger.`);
            // Do NOT execute button 1! Return false to allow bot rules / AI fallback to handle it.
            return false;
          }
        }
      }
      else if (currentNode.type === "quickReplies") {
        const choice = (incomingMsgBody || "").trim().toLowerCase();
        const replies = currentNode.data?.quickReplies || currentNode.data?.replies || [];
        let matchedIdx = -1;
        let matchedHandleId = null;

        for (let i = 0; i < replies.length; i++) {
          const r = replies[i];
          const title = typeof r === "string" ? r : (r.title || r.label || "");
          const payload = typeof r === "string" ? r : (r.payload || "");
          const id = typeof r === "string" ? `qr-${i}` : (r.id || `qr-${i}`);
          const altId = `qr_${i}`;

          if (
            (title && title.toLowerCase() === choice) ||
            (payload && payload.toLowerCase() === choice) ||
            (id && id.toLowerCase() === choice) ||
            (altId && altId.toLowerCase() === choice)
          ) {
            matchedIdx = i;
            matchedHandleId = id;
            break;
          }
        }

        if (matchedIdx !== -1) {
          nextNodeId = getNextNodeId(currentNodeId, matchedHandleId) ||
                       getNextNodeId(currentNodeId, `qr-${matchedIdx}`) ||
                       getNextNodeId(currentNodeId, `qr_${matchedIdx}`);

          // Same single-option exception as buttons above — unambiguous when
          // there's only one quick reply to begin with.
          if (!nextNodeId && replies.length === 1) {
            nextNodeId = getNextNodeId(currentNodeId);
          }

          if (!nextNodeId) {
            await pool.query("UPDATE flow_sessions SET status = 'COMPLETED', current_node_id = ? WHERE id = ?", [currentNodeId, session.id]);
            return true;
          }
        } else {
          const newMatch = await findMatchingFlow(agencyId, platform, conversationId, integration, incomingMsgBody, msgType);
          if (newMatch) {
            console.log(`🤖 [Flow Engine] User input "${incomingMsgBody}" triggered new flow "${newMatch.flow.name}". Completing previous session ${session.id}.`);
            await pool.query("UPDATE flow_sessions SET status = 'COMPLETED' WHERE id = ?", [session.id]);

            flow = newMatch.flow;
            nodes = newMatch.nodes;
            edges = newMatch.edges;

            const [newSess] = await pool.query(
              "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
              [agencyId, conversationId, flow.id, newMatch.startNode.id, JSON.stringify({})]
            );

            session = {
              id: newSess.insertId,
              agency_id: agencyId,
              conversation_id: conversationId,
              flow_id: flow.id,
              current_node_id: newMatch.startNode.id,
              variables: {},
              status: "ACTIVE"
            };
            variables = {};
            currentNodeId = newMatch.startNode.id;
            nextNodeId = newMatch.startNode.id;
          } else {
            console.log(`🤖 [Flow Engine] User input "${incomingMsgBody}" did not match quickReplies on node ${currentNode.id}, nor any flow trigger.`);
            return false;
          }
        }
      }
      else if (currentNode.type === "listMenu") {
        const choice = (incomingMsgBody || "").trim().toLowerCase();
        // Flatten every list's items into one array — a tap arrives as the
        // row's own title text (per how each channel's webhook extracts
        // msgBody, same as buttons/quickReplies), and a typed reply is matched
        // the same way, so both resolve identically regardless of which of the
        // N sent lists the option actually lived in.
        const flatTitles = [];
        normalizeListMenuData(currentNode.data).forEach((list) => {
          (list.items || []).forEach((item) => {
            flatTitles.push(typeof item === "string" ? item : (item?.title || item?.label || ""));
          });
        });
        const matchedIdx = flatTitles.findIndex((title, idx) =>
          (title && title.toLowerCase() === choice) ||
          `item_${idx}` === choice ||
          `item-${idx}` === choice
        );

        if (matchedIdx !== -1) {
          nextNodeId = getNextNodeId(currentNodeId, `item-${matchedIdx}`);

          // Same single-option exception as buttons/quickReplies above.
          if (!nextNodeId && flatTitles.length === 1) {
            nextNodeId = getNextNodeId(currentNodeId);
          }

          if (!nextNodeId) {
            await pool.query("UPDATE flow_sessions SET status = 'COMPLETED', current_node_id = ? WHERE id = ?", [currentNodeId, session.id]);
            return true;
          }
        } else {
          const newMatch = await findMatchingFlow(agencyId, platform, conversationId, integration, incomingMsgBody, msgType);
          if (newMatch) {
            console.log(`🤖 [Flow Engine] User input "${incomingMsgBody}" triggered new flow "${newMatch.flow.name}". Completing previous session ${session.id}.`);
            await pool.query("UPDATE flow_sessions SET status = 'COMPLETED' WHERE id = ?", [session.id]);

            flow = newMatch.flow;
            nodes = newMatch.nodes;
            edges = newMatch.edges;

            const [newSess] = await pool.query(
              "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
              [agencyId, conversationId, flow.id, newMatch.startNode.id, JSON.stringify({})]
            );

            session = {
              id: newSess.insertId,
              agency_id: agencyId,
              conversation_id: conversationId,
              flow_id: flow.id,
              current_node_id: newMatch.startNode.id,
              variables: {},
              status: "ACTIVE"
            };
            variables = {};
            currentNodeId = newMatch.startNode.id;
            nextNodeId = newMatch.startNode.id;
          } else {
            console.log(`🤖 [Flow Engine] User input "${incomingMsgBody}" did not match listMenu on node ${currentNode.id}, nor any flow trigger.`);
            return false;
          }
        }
      }
      else {
        nextNodeId = getNextNodeId(currentNodeId);
      }

      currentNodeId = nextNodeId || currentNodeId;

      // Any of the fallback paths above may have started a brand-new top-level
      // flow match (a different session.id) — that always begins fresh in the
      // MAIN context, since a User Input Flow is never a trigger target itself.
      if (session.id !== originalSessionId) {
        inUIF = false;
        activeUifId = null;
        returnNodeId = null;
        mainNodes = nodes;
        mainEdges = edges;
        mainParkedNodeId = currentNodeId;
      }
    }

    // Lazily fetched (and cached for the rest of this run) only if some node
    // actually has "Show typing" on — most runs never need it. WhatsApp's
    // typing indicator has to anchor to a specific inbound message id (see
    // sendTypingIndicator), so this is that anchor.
    let lastInboundExternalMsgId;
    const getLastInboundExternalMsgId = async () => {
      if (lastInboundExternalMsgId !== undefined) return lastInboundExternalMsgId;
      const [[row]] = await pool.query(
        "SELECT external_msg_id FROM messages WHERE conversation_id = ? AND direction = 'INBOUND' ORDER BY id DESC LIMIT 1",
        [conversationId]
      );
      lastInboundExternalMsgId = row?.external_msg_id || null;
      return lastInboundExternalMsgId;
    };

    // Main Execution Loop
    while (currentNodeId && !stopFlow) {
      const node = nodes.find(n => n.id === currentNodeId);
      if (!node) {
        console.log(`[Flow Engine] Node with id ${currentNodeId} not found. Exiting.`);
        break; // Node not found in flow, exit
      }

      console.log(`🤖 [Flow Engine] Executing Flow Node: ${node.type} (${node.id})`);

      // Per-node "Delay before this step" — scheduled, never a blocking
      // sleep (utils/flowDelayScheduler.js resumes exactly this session, at
      // exactly this node, once due). Every node type can carry one except
      // `start` (a trigger, not a runtime step) and `wait` (a Sequence's own
      // dedicated delay node already IS this). `resumeContext.skipDelayForNodeId`
      // is set to this exact node id when the scheduler itself is the one
      // resuming it — without that check, resuming would just immediately
      // re-pause on the same node forever.
      if (node.type !== "start" && node.type !== "wait" && node.id !== resumeContext?.skipDelayForNodeId) {
        const delayCfg = node.data?.delay;
        const delaySeconds = delayCfg && typeof delayCfg === "object"
          ? (Number(delayCfg.hours) || 0) * 3600 + (Number(delayCfg.minutes) || 0) * 60 + (Number(delayCfg.seconds) || 0)
          // Legacy standalone Delay nodes saved before this field existed only
          // have a flat `data.seconds` — still honored here.
          : (node.type === "delay" ? (Number(node.data?.seconds) || 0) : 0);
        if (delaySeconds > 0) {
          if (inUIF) {
            await pool.query(
              `UPDATE flow_sessions
               SET active_context = 'USER_INPUT_FLOW', user_input_flow_id = ?, uif_current_node_id = ?,
                   return_node_id = ?, current_node_id = ?, variables = ?, delay_next_run_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
               WHERE id = ?`,
              [activeUifId, node.id, returnNodeId, mainParkedNodeId, JSON.stringify(variables), delaySeconds, session.id]
            );
          } else {
            await pool.query(
              `UPDATE flow_sessions
               SET active_context = 'MAIN', user_input_flow_id = NULL, uif_current_node_id = NULL, return_node_id = NULL,
                   current_node_id = ?, variables = ?, delay_next_run_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
               WHERE id = ?`,
              [node.id, JSON.stringify(variables), delaySeconds, session.id]
            );
          }
          console.log(`⏱️ [Flow Engine] Node ${node.id} delayed ${delaySeconds}s — session ${session.id} paused.`);
          scheduleFlowDelayResume(session.id, delaySeconds);
          return true;
        }
      }

      // "Show typing before sending" — a short, real per-platform typing
      // action right before this node's message goes out. Never blocks the
      // real send below if it fails.
      if (node.data?.showTyping && TYPING_ELIGIBLE_TYPES.has(node.type) && contact?.external_id) {
        try {
          await sendTypingIndicator(platform, integration, contact.external_id, {
            lastInboundExternalMsgId: await getLastInboundExternalMsgId(),
          });
        } catch (err) {
          console.error(`[Flow Engine] Typing indicator failed for node ${node.id}:`, err.message);
        }
      }

      switch (node.type) {
        case "start": {
          // "Also Start a Sequence" (Start node's own properties panel) is a
          // plain field on the Start node's own data (attachSequenceId) —
          // not a real branch on the canvas, so there's no edge to exclude
          // here: fire the enrollment as a side effect, then resolve the
          // real continuation off Start's normal "then"/next-step edge as
          // usual.
          const attachSequenceId = node.data?.attachSequenceId;
          if (attachSequenceId) {
            try {
              await enrollContactsInSequence(attachSequenceId, agencyId, { contactId: contact?.id, enrolledVia: "flow-start", integrationId: flow?.integration_id ?? null });
            } catch (err) {
              console.error(`[Flow Engine] Auto-attach Sequence ${attachSequenceId} on flow start failed:`, err.message);
            }
          }
          currentNodeId = resolveNextNodeId(edges, node.id);
          break;
        }

        case "text": {
          const textBody = replaceVariables(node.data?.message || node.data?.text || node.data?.body || "", variables, contact);
          // The Flow Builder lets buttons be attached directly to a plain Text node
          // (same as Image/Interactive) — this used to be silently dropped since
          // this case never read node.data.buttons at all.
          const rawTextButtons = node.data?.buttons || [];
          const formattedTextButtons = rawTextButtons.map((btn, idx) => ({
            // .id and .payload both carry the same route token — WhatsApp echoes
            // back .id, Facebook/Instagram echo back .payload, Telegram uses
            // .payload as callback_data — so whichever the platform returns,
            // the click resolves directly by flow+node+index (see decodeButtonRoute).
            id: encodeButtonRoute(flow.id, node.id, idx),
            title: typeof btn === "string" ? btn : (btn.title || btn.label || `Button ${idx + 1}`),
            payload: encodeButtonRoute(flow.id, node.id, idx),
            type: normalizeButtonType(btn),
            url: typeof btn === "object" ? btn.url : null,
          }));

          if (textBody || formattedTextButtons.length > 0) {
            await sendMsg(agencyId, conversation, textBody, "TEXT", integration, {
              flowId: flow?.id || session?.flow_id || null,
              nodeId: node.id,
              contactIdentifier: contact?.external_id || contact?.phone || null,
              buttons: formattedTextButtons.length > 0 ? formattedTextButtons : undefined,
            });
          }

          // A node that shows buttons used to ALWAYS stop here and wait for a
          // click, which silently killed the node's own "Next Step" wiring: the
          // rest of the sequence the user drew after it (an image, a video, more
          // text) simply never sent. That wait is no longer necessary — every
          // button now carries its own routing token (see step 0) and resolves
          // whenever it's clicked, regardless of where the session has moved on
          // to. So an explicit "Next Step" connection is followed immediately
          // and the buttons stay live; we only park when there's nothing else
          // wired to do.
          const textNextStep = getNextStepNodeId(node.id);
          if (textNextStep) {
            currentNodeId = textNextStep;
          } else if (hasWaitableButtons(formattedTextButtons, platform)) {
            stopFlow = true;
          } else {
            currentNodeId = getNextNodeId(node.id);
          }
          break;
        }

        case "image": {
          const caption = replaceVariables(node.data?.caption || node.data?.message || node.data?.text || "", variables, contact);
          const mediaUrl = (node.data?.imageUrl || node.data?.mediaUrl || node.data?.url || "").trim();
          const rawButtons = node.data?.buttons || [];
          const formattedButtons = rawButtons.map((btn, idx) => ({
            // .id and .payload both carry the same route token — WhatsApp echoes
            // back .id, Facebook/Instagram echo back .payload, Telegram uses
            // .payload as callback_data — so whichever the platform returns,
            // the click resolves directly by flow+node+index (see decodeButtonRoute).
            id: encodeButtonRoute(flow.id, node.id, idx),
            title: typeof btn === "string" ? btn : (btn.title || btn.label || `Button ${idx + 1}`),
            payload: encodeButtonRoute(flow.id, node.id, idx),
            type: normalizeButtonType(btn),
            url: typeof btn === "object" ? btn.url : null,
          }));

          if (!mediaUrl) {
            console.warn(`[Flow Engine] Image node "${node.id}" has no image URL/mediaUrl configured.`);
            await logBotError({
              agencyId,
              flowId: flow?.id || session?.flow_id || null,
              integrationId: integration?.id || conversation?.integration_id || null,
              platform: conversation.platform || integration?.platform || contact?.platform || "WHATSAPP",
              contactId: conversation.contact_id,
              contactIdentifier: contact?.external_id || contact?.phone || null,
              nodeId: node.id,
              customMessage: `Flow "${flow?.name || 'Bot Flow'}" image node "${node.data?.label || node.id}" has no image URL or file configured.`,
            });
            currentNodeId = getNextNodeId(node.id);
            break;
          }

          await sendMsg(agencyId, conversation, caption, "IMAGE", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            mediaUrl,
            caption,
            buttons: formattedButtons.length > 0 ? formattedButtons : undefined,
          });

          // See the "Next Step" note on the text case above — an explicit
          // continuation wins over parking, since the buttons stay clickable.
          const imageNextStep = getNextStepNodeId(node.id);
          if (imageNextStep) {
            currentNodeId = imageNextStep;
          } else if (hasWaitableButtons(formattedButtons, platform)) {
            stopFlow = true;
          } else {
            currentNodeId = getNextNodeId(node.id);
          }
          break;
        }

        case "video": {
          const caption = replaceVariables(node.data?.caption || node.data?.message || node.data?.text || "", variables, contact);
          const mediaUrl = node.data?.mediaUrl || node.data?.url || "";
          await sendMsg(agencyId, conversation, caption, "VIDEO", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            mediaUrl,
          });
          
          currentNodeId = getNextNodeId(node.id);
          break;
        }

        case "audio": {
          const mediaUrl = node.data?.mediaUrl || node.data?.url || "";
          await sendMsg(agencyId, conversation, "[Audio]", "AUDIO", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            mediaUrl,
          });
          
          currentNodeId = getNextNodeId(node.id);
          break;
        }

        case "file":
        case "document": {
          const filename = replaceVariables(node.data?.filename || node.data?.title || "Document", variables, contact);
          const mediaUrl = node.data?.mediaUrl || node.data?.url || "";
          await sendMsg(agencyId, conversation, filename, "DOCUMENT", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            mediaUrl,
          });
          
          currentNodeId = getNextNodeId(node.id);
          break;
        }

        case "buttons": {
          const textBody = replaceVariables(node.data?.message || node.data?.text || "Please select an option:", variables, contact);
          const rawButtons = node.data?.buttons || [];
          
          const formattedButtons = rawButtons.map((btn, idx) => ({
            // .id and .payload both carry the same route token — WhatsApp echoes
            // back .id, Facebook/Instagram echo back .payload, Telegram uses
            // .payload as callback_data — so whichever the platform returns,
            // the click resolves directly by flow+node+index (see decodeButtonRoute).
            id: encodeButtonRoute(flow.id, node.id, idx),
            title: typeof btn === "string" ? btn : (btn.title || btn.label || `Button ${idx + 1}`),
            payload: encodeButtonRoute(flow.id, node.id, idx),
            type: normalizeButtonType(btn),
            url: typeof btn === "object" ? btn.url : null,
          }));

          await sendMsg(agencyId, conversation, textBody, "TEXT", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            buttons: formattedButtons.length > 0 ? formattedButtons : undefined,
          });

          // See the "Next Step" note on the text case above — an explicit
          // continuation wins over parking, since the buttons stay clickable.
          const buttonsNextStep = getNextStepNodeId(node.id);
          if (buttonsNextStep) {
            currentNodeId = buttonsNextStep;
          } else if (hasWaitableButtons(formattedButtons, platform)) {
            // Stop execution and wait for user button click/reply
            stopFlow = true;
          } else {
            // No buttons actually configured on this node (or only URL ones, which never
            // reply to the bot) — previously this stopped and waited for a reply
            // regardless, permanently parking the session, which then silently swallowed
            // the next unrelated inbound message (e.g. a stray click on an earlier
            // message's button).
            currentNodeId = getNextNodeId(node.id);
          }
          break;
        }

        case "interactive": {
          const textBody = replaceVariables(node.data?.message || node.data?.text || node.data?.body || "Please select an option:", variables, contact);
          const headerType = (node.data?.headerType || "text").toLowerCase();
          const headerText = replaceVariables(node.data?.headerText || "", variables, contact);
          const headerMediaUrl = (node.data?.headerMediaUrl || node.data?.imageUrl || node.data?.mediaUrl || "").trim();
          const footerText = replaceVariables(node.data?.footerText || "", variables, contact);
          const rawButtons = node.data?.buttons || [];

          const formattedButtons = rawButtons.map((btn, idx) => ({
            // .id and .payload both carry the same route token — WhatsApp echoes
            // back .id, Facebook/Instagram echo back .payload, Telegram uses
            // .payload as callback_data — so whichever the platform returns,
            // the click resolves directly by flow+node+index (see decodeButtonRoute).
            id: encodeButtonRoute(flow.id, node.id, idx),
            title: typeof btn === "string" ? btn : (btn.title || btn.label || btn.reply_text || `Button ${idx + 1}`),
            payload: encodeButtonRoute(flow.id, node.id, idx),
            type: normalizeButtonType(btn),
            url: typeof btn === "object" ? btn.url : null,
          }));

          await sendMsg(agencyId, conversation, textBody, "TEXT", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            headerType,
            headerText,
            headerMediaUrl,
            footerText,
            buttons: formattedButtons,
          });

          // See the "Next Step" note on the text case above — an explicit
          // continuation wins over parking, since the buttons stay clickable.
          const interactiveNextStep = getNextStepNodeId(node.id);
          if (interactiveNextStep) {
            currentNodeId = interactiveNextStep;
          } else if (hasWaitableButtons(formattedButtons, platform)) {
            stopFlow = true;
          } else {
            currentNodeId = getNextNodeId(node.id);
          }
          break;
        }

        case "quickReplies": {
          const textBody = replaceVariables(node.data?.message || node.data?.text || "Choose options:", variables, contact);
          const rawQr = node.data?.quickReplies || node.data?.replies || [];

          // `kind` selects a special, non-free-text Quick Reply per each
          // channel's own docs (Messenger/Instagram "Ask for Phone Number"/
          // "Ask for Email", Telegram "Request Contact"/"Request Location") —
          // see platformSender.js for how each is actually built and sent.
          // Defaults to "text" for every reply saved before this existed.
          const formattedQr = rawQr.map((qr, idx) => ({
            id: encodeButtonRoute(flow.id, node.id, idx),
            title: typeof qr === "string" ? qr : (qr.title || qr.label || `Option ${idx + 1}`),
            payload: encodeButtonRoute(flow.id, node.id, idx),
            kind: (typeof qr === "object" && qr?.kind) || "text",
          }));

          await sendMsg(agencyId, conversation, textBody, "TEXT", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            quickReplies: formattedQr.length > 0 ? formattedQr : undefined,
          });

          // See the "Next Step" note on the text case above — quick replies also
          // carry their own routing token, so an explicit continuation wins.
          const qrNextStep = getNextStepNodeId(node.id);
          if (qrNextStep) {
            currentNodeId = qrNextStep;
          } else if (formattedQr.length > 0) {
            stopFlow = true;
          } else {
            currentNodeId = getNextNodeId(node.id);
          }
          break;
        }

        case "listMenu": {
          const textBody = replaceVariables(node.data?.message || node.data?.text || "Select from menu:", variables, contact);
          const lists = normalizeListMenuData(node.data);

          // Each configured list sends as its OWN sequential message (WhatsApp:
          // a separate interactive list message per list, since Meta caps rows
          // at 10 total per message even across sections; Facebook/Instagram: a
          // separate Generic Template carousel each, see platformSender.js;
          // Telegram: a separate inline-keyboard message each) — this is what
          // lets an author offer more options than any single channel's native
          // list supports. Sections group items WITHIN one list's message
          // (WhatsApp's own native "sections" concept — a different axis from
          // `lists`). Every item across every section of every list shares ONE
          // flat index space (flattenListMenuItems) — the SAME order
          // ListMenuNode's canvas handle ids (item-{gi}) use, so a tap always
          // resolves to the right outgoing edge regardless of section grouping.
          const flatEntries = flattenListMenuItems(lists);
          let totalItems = 0;
          for (let li = 0; li < lists.length; li++) {
            const list = lists[li];
            const entriesForList = flatEntries.filter((f) => f.listIndex === li && (f.item?.title || "").trim());
            if (entriesForList.length === 0) continue;

            const sectionsMap = new Map();
            entriesForList.forEach((f) => {
              if (!sectionsMap.has(f.sectionIndex)) {
                sectionsMap.set(f.sectionIndex, { title: list.sections[f.sectionIndex]?.title || "", rows: [] });
              }
              sectionsMap.get(f.sectionIndex).rows.push({
                id: encodeButtonRoute(flow.id, node.id, f.globalIndex),
                title: f.item.title,
                description: f.item.description || "",
              });
            });
            const sections = Array.from(sectionsMap.values());
            totalItems += entriesForList.length;

            await sendMsg(
              agencyId, conversation,
              // Only the first list's message carries the actual prompt text —
              // the rest are the continuation of the same logical question.
              li === 0 ? textBody : (list.title || "More options:"),
              "TEXT", integration,
              {
                flowId: flow?.id || session?.flow_id || null,
                nodeId: node.id,
                contactIdentifier: contact?.external_id || contact?.phone || null,
                listMenu: { buttonText: list.buttonText || "Options", title: list.title || "Menu", sections },
              }
            );
          }

          // See the "Next Step" note on the text case above — list items also
          // carry their own routing token, so an explicit continuation wins.
          const listNextStep = getNextStepNodeId(node.id);
          if (listNextStep) {
            currentNodeId = listNextStep;
          } else if (totalItems > 0) {
            stopFlow = true;
          } else {
            currentNodeId = getNextNodeId(node.id);
          }
          break;
        }

        case "card": {
          const title = replaceVariables(node.data?.title || "", variables, contact);
          const subtitle = replaceVariables(node.data?.subtitle || "", variables, contact);
          const imageUrl = node.data?.imageUrl || node.data?.mediaUrl || node.data?.image || "";

          await sendMsg(agencyId, conversation, title || "Card", "IMAGE", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            mediaUrl: imageUrl,
            card: {
              title,
              subtitle,
              imageUrl,
              buttons: node.data?.buttons || []
            }
          });

          currentNodeId = getNextNodeId(node.id);
          break;
        }

        case "carousel": {
          const cards = node.data?.cards || [];
          
          await sendMsg(agencyId, conversation, "Carousel options", "TEXT", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            carousel: cards.map(c => ({
              title: replaceVariables(c.title || "", variables, contact),
              subtitle: replaceVariables(c.subtitle || "", variables, contact),
              imageUrl: c.imageUrl || c.mediaUrl || c.image || "",
              buttons: c.buttons || []
            }))
          });

          currentNodeId = getNextNodeId(node.id);
          break;
        }

        case "collectInput":
        case "question": {
          // "question" is the node type used inside a User Input Flow — behaves
          // identically to "collectInput" (same resume-branch handles both above).
          const prompt = replaceVariables(node.data?.message || node.data?.text || "Please enter details:", variables, contact);

          // Multiple Choice: within the channel's real button-tap cap, send as
          // buttons (fastest UX, renders inline with no extra message). Past
          // that cap, send as a list message instead (same mechanism the
          // listMenu node case above uses) so every option — not just the
          // first few — stays genuinely tappable rather than degrading into
          // "type the option's name". Either way the resume branch above
          // matches purely by the option's text, so which one was used here
          // doesn't matter there. Plain "keyboard" questions send just the
          // prompt, as before.
          const rawOptions = node.data?.answerType === "choice" ? (node.data?.options || []) : [];
          const validOptions = rawOptions.filter((opt) => (typeof opt === "string" ? opt : opt?.title || "").trim());
          const buttonCap = getButtonTapCap(platform);

          if (validOptions.length > 0 && validOptions.length > buttonCap) {
            const listItems = validOptions.slice(0, 10).map((opt, idx) => ({
              id: encodeButtonRoute(flow.id, node.id, idx),
              title: typeof opt === "string" ? opt : (opt.title || opt.label || `Option ${idx + 1}`),
              description: "",
            }));
            await sendMsg(agencyId, conversation, prompt, "TEXT", integration, {
              flowId: flow?.id || session?.flow_id || null,
              nodeId: node.id,
              contactIdentifier: contact?.external_id || contact?.phone || null,
              listMenu: { buttonText: "Choose", title: "Options", items: listItems },
            });
          } else {
            const formattedOptions = validOptions.map((opt, idx) => {
              const title = typeof opt === "string" ? opt : (opt.title || opt.label || `Option ${idx + 1}`);
              return { id: `opt-${idx}`, title, payload: title, type: "POSTBACK" };
            });

            await sendMsg(agencyId, conversation, prompt, "TEXT", integration, {
              flowId: flow?.id || session?.flow_id || null,
              nodeId: node.id,
              contactIdentifier: contact?.external_id || contact?.phone || null,
              buttons: formattedOptions.length > 0 ? formattedOptions : undefined,
            });
          }

          // Stop execution and wait for input
          stopFlow = true;
          break;
        }

        // Runs a reusable User Input Flow (its own Question/Final Answer sequence)
        // as a sub-flow call: park the main flow's position, hand off execution to
        // the referenced flow's own nodes/edges, and resume here once its "Final
        // Answer" node completes — same mechanism on every channel.
        case "runUserInputFlow": {
          const uifId = node.data?.userInputFlowId;
          if (!uifId) {
            console.warn(`[Flow Engine] "Run User Input Flow" node "${node.id}" has no flow selected.`);
            currentNodeId = getNextNodeId(node.id);
            break;
          }

          const [[uifRow]] = await pool.query(
            "SELECT * FROM user_input_flows WHERE id = ? AND agency_id = ? AND integration_id = ? AND is_active = 1",
            [uifId, agencyId, flow?.integration_id ?? null]
          );
          if (!uifRow) {
            console.warn(`[Flow Engine] "Run User Input Flow" node "${node.id}" references missing/inactive flow ${uifId}.`);
            currentNodeId = getNextNodeId(node.id);
            break;
          }

          const uifNodes = JSON.parse(uifRow.nodes_json || "[]");
          const uifEdges = JSON.parse(uifRow.edges_json || "[]");
          const uifStart = uifNodes.find(n => n.type === "start") || uifNodes[0];
          if (!uifStart) {
            console.warn(`[Flow Engine] User Input Flow "${uifRow.name}" (${uifId}) has no nodes.`);
            currentNodeId = getNextNodeId(node.id);
            break;
          }

          // Resolve the return point against the MAIN flow's edges (still active —
          // we swap `nodes`/`edges` to the sub-flow's own right after this).
          returnNodeId = getNextNodeId(node.id);
          activeUifId = uifId;
          inUIF = true;
          mainParkedNodeId = node.id;
          nodes = uifNodes;
          edges = uifEdges;
          currentNodeId = uifStart.id;

          // Each run starts a fresh Q&A trail. Without this reset, a conversation
          // that runs a second User Input Flow later (or re-runs this one) would
          // append onto the previous run's answers and submit both sets together.
          variables.__uifAnswers = [];

          // Start node's optional "auto-tag with this label" setting — applied once,
          // right when the sub-flow actually begins (not on every question inside it).
          const labelIds = Array.isArray(uifStart.data?.labelIds) ? uifStart.data.labelIds : [];
          for (const labelId of labelIds) {
            await applyLabelToContact(agencyId, contact.id, labelId);
          }
          break;
        }

        // Only ever reached inside a User Input Flow — sends the closing message
        // and pops back to wherever the main flow left off.
        case "finalAnswer": {
          const closingMsg = replaceVariables(node.data?.message || "Thanks — that's everything I needed!", variables, contact);
          if (closingMsg) {
            await sendMsg(agencyId, conversation, closingMsg, "TEXT", integration, {
              flowId: flow?.id || session?.flow_id || null,
              nodeId: node.id,
              contactIdentifier: contact?.external_id || contact?.phone || null,
            });
          }

          if (activeUifId) {
            const uifStartNode = nodes.find(n => n.type === "start");
            await completeUserInputFlowResponse({
              agencyId,
              uifId: activeUifId,
              uifStartData: uifStartNode?.data,
              variables,
              contact,
              conversation,
              mainFlowId: flow?.id || null,
            });
          }

          if (inUIF && returnNodeId) {
            nodes = mainNodes;
            edges = mainEdges;
            currentNodeId = returnNodeId;
            inUIF = false;
            activeUifId = null;
            returnNodeId = null;
          } else {
            // Defensive: a User Input Flow isn't directly triggerable, but if this
            // is ever reached with no parent context, just end the session cleanly.
            await pool.query("UPDATE flow_sessions SET status = 'COMPLETED', current_node_id = ? WHERE id = ?", [node.id, session.id]);
            stopFlow = true;
            currentNodeId = null;
          }
          break;
        }

        case "condition": {
          const operator = node.data?.operator || "equals";
          const matchValue = (node.data?.value || "").toLowerCase().trim();

          let rawCompareValue;
          if (node.data?.compareSource === "customField" && node.data?.customFieldId) {
            // Prefer whatever's already in this session's variables — if a
            // Question node earlier in THIS exact flow just saved this same
            // field, that's the freshest value and matches what the visible
            // conversation actually just did. Otherwise fall back to the
            // contact's persisted value, so a condition can branch on a field
            // captured at any point in the past, not just earlier in this run.
            const [[fieldRow]] = await pool.query(
              "SELECT field_key FROM custom_field_definitions WHERE id = ? AND agency_id = ?",
              [node.data.customFieldId, agencyId]
            );
            const fieldKey = fieldRow?.field_key;
            if (fieldKey && variables[fieldKey] !== undefined) {
              rawCompareValue = variables[fieldKey];
            } else if (contact?.id) {
              const [[valueRow]] = await pool.query(
                "SELECT value FROM contact_custom_field_values WHERE contact_id = ? AND field_id = ?",
                [contact.id, node.data.customFieldId]
              );
              rawCompareValue = valueRow?.value;
            }
          } else {
            rawCompareValue = variables[node.data?.variable];
          }
          const userValue = String(rawCompareValue || "").toLowerCase().trim();

          let conditionMet = false;
          if (operator === "equals") {
            conditionMet = userValue === matchValue;
          } else if (operator === "contains") {
            conditionMet = userValue.includes(matchValue);
          } else if (operator === "startsWith") {
            conditionMet = userValue.startsWith(matchValue);
          }

          const handleId = conditionMet ? "yes" : "no";
          currentNodeId = getNextNodeId(node.id, handleId);
          break;
        }

        case "delay": {
          // The actual wait already happened above (the generic per-node
          // Delay pause/resume, which a Delay node's own `data.delay` — or
          // legacy `data.seconds` — feeds into just like any other node
          // type) — reaching this case at all means that wait is already
          // over, so it's just a pass-through to whatever comes next.
          currentNodeId = getNextNodeId(node.id);
          break;
        }

        case "startSequenceAction": {
          const sequenceId = node.data?.sequenceId;
          if (sequenceId) {
            try {
              await enrollContactsInSequence(sequenceId, agencyId, { contactId: contact?.id, enrolledVia: "flow-node", integrationId: flow?.integration_id ?? null });
            } catch (seqErr) {
              console.error(`[Flow Engine] Start Sequence node "${node.id}" failed:`, seqErr.message);
            }
          } else {
            console.warn(`[Flow Engine] Start Sequence node "${node.id}" has no sequence selected.`);
          }
          currentNodeId = getNextNodeId(node.id);
          break;
        }

        case "stopSequenceAction": {
          const sequenceId = node.data?.sequenceId;
          if (sequenceId) {
            try {
              await unsubscribeContactFromSequence(sequenceId, agencyId, contact?.id, { integrationId: flow?.integration_id ?? null });
            } catch (seqErr) {
              console.error(`[Flow Engine] Stop Sequence node "${node.id}" failed:`, seqErr.message);
            }
          } else {
            console.warn(`[Flow Engine] Stop Sequence node "${node.id}" has no sequence selected.`);
          }
          currentNodeId = getNextNodeId(node.id);
          break;
        }

        // Actions node: an ordered list of silent side-effects (labels, sequences,
        // custom fields), then straight on to the next step. One failing action is
        // logged and skipped so it can't stop the rest of the flow.
        case "actions": {
          const actionList = Array.isArray(node.data?.actions) ? node.data.actions : [];
          for (const act of actionList) {
            try {
              switch (act?.type) {
                case "add_label":
                  if (act.labelId && contact?.id) await applyLabelToContact(agencyId, contact.id, act.labelId);
                  break;
                case "remove_label":
                  if (act.labelId && contact?.id) await removeLabelFromContact(agencyId, contact.id, act.labelId);
                  break;
                case "add_sequence":
                  if (act.sequenceId) await enrollContactsInSequence(act.sequenceId, agencyId, { contactId: contact?.id, enrolledVia: "flow-actions", integrationId: flow?.integration_id ?? null });
                  break;
                case "remove_sequence":
                  if (act.sequenceId) await unsubscribeContactFromSequence(act.sequenceId, agencyId, contact?.id, { integrationId: flow?.integration_id ?? null });
                  break;
                case "set_field":
                case "clear_field": {
                  if (!act.fieldId || !contact?.id) break;
                  const [[fieldDef]] = await pool.query(
                    "SELECT id FROM custom_field_definitions WHERE id = ? AND agency_id = ?",
                    [act.fieldId, agencyId]
                  );
                  if (!fieldDef) break;
                  if (act.type === "set_field") {
                    const newValue = replaceVariables(String(act.value ?? ""), variables, contact);
                    await pool.query(
                      `INSERT INTO contact_custom_field_values (contact_id, field_id, value)
                       VALUES (?, ?, ?)
                       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
                      [contact.id, act.fieldId, newValue]
                    );
                    emitToAgency(agencyId, "contact_custom_field_updated", { contactId: contact.id, fieldId: Number(act.fieldId), value: newValue });
                  } else {
                    await pool.query(
                      "DELETE FROM contact_custom_field_values WHERE contact_id = ? AND field_id = ?",
                      [contact.id, act.fieldId]
                    );
                    emitToAgency(agencyId, "contact_custom_field_updated", { contactId: contact.id, fieldId: Number(act.fieldId), value: null });
                  }
                  break;
                }
                default:
                  break;
              }
            } catch (actErr) {
              console.error(`[Flow Engine] Actions node "${node.id}" action "${act?.type}" failed:`, actErr.message);
            }
          }
          currentNodeId = getNextNodeId(node.id);
          break;
        }

        // Start Automation: ends this flow's session and begins another existing
        // flow from its Start node, in the same conversation. Session/nodes/edges
        // are swapped in place so the loop keeps running the new flow; the hop
        // counter stops two flows that start each other from looping forever.
        case "startAutomation": {
          const targetFlowId = node.data?.flowId;
          const hops = Number(variables.__automationHops || 0);
          if (!targetFlowId) {
            console.warn(`[Flow Engine] Start Automation node "${node.id}" has no flow selected.`);
            currentNodeId = null;
            break;
          }
          if (hops >= 5) {
            console.warn(`[Flow Engine] Start Automation node "${node.id}" stopped: too many chained automations.`);
            currentNodeId = null;
            break;
          }
          const [[targetFlow]] = await pool.query(
            "SELECT * FROM flows WHERE id = ? AND agency_id = ? AND integration_id = ? AND is_active = 1",
            [targetFlowId, agencyId, flow?.integration_id ?? null]
          );
          const { nodes: targetNodes, edges: targetEdges } = targetFlow
            ? expandMessageBlocks(JSON.parse(targetFlow.nodes_json || "[]"), JSON.parse(targetFlow.edges_json || "[]"))
            : { nodes: [], edges: [] };
          const targetStart = targetNodes.find((n) => n.type === "start");
          if (!targetStart) {
            console.warn(`[Flow Engine] Start Automation node "${node.id}" target flow ${targetFlowId} is missing, inactive or has no Start node.`);
            currentNodeId = null;
            break;
          }

          await pool.query(
            "UPDATE flow_sessions SET status = 'COMPLETED', delay_next_run_at = NULL, current_node_id = ? WHERE id = ?",
            [node.id, session.id]
          );
          variables.__automationHops = hops + 1;
          const [handoverSess] = await pool.query(
            "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
            [agencyId, conversationId, targetFlow.id, targetStart.id, JSON.stringify(variables)]
          );
          session = {
            id: handoverSess.insertId,
            agency_id: agencyId,
            conversation_id: conversationId,
            flow_id: targetFlow.id,
            current_node_id: targetStart.id,
            variables,
            status: "ACTIVE",
          };
          flow = targetFlow;
          nodes = targetNodes;
          edges = targetEdges;
          mainNodes = targetNodes;
          mainEdges = targetEdges;
          inUIF = false;
          activeUifId = null;
          returnNodeId = null;
          mainParkedNodeId = targetStart.id;

          // Same as a fresh trigger: the target's own Start-node label is applied.
          const targetLabelIds = Array.isArray(targetStart.data?.labelIds) ? targetStart.data.labelIds : [];
          if (contact?.id) {
            for (const labelId of targetLabelIds) {
              await applyLabelToContact(agencyId, contact.id, labelId);
            }
          }
          currentNodeId = getNextNodeId(targetStart.id);
          break;
        }

        case "handoff": {
          const handoffMsg = replaceVariables(node.data?.message || "Transferring you to a live agent. Please wait.", variables, contact);
          await sendMsg(agencyId, conversation, handoffMsg, "TEXT", integration);

          // Update conversation to open and assign status
          await pool.query(
            "UPDATE conversations SET status = 'OPEN', assigned_to_id = NULL WHERE id = ?",
            [conversationId]
          );

          // Complete flow session
          await pool.query(
            "UPDATE flow_sessions SET status = 'COMPLETED', delay_next_run_at = NULL, current_node_id = ? WHERE id = ?",
            [node.id, session.id]
          );

          emitToAgency(agencyId, "conversation_updated", {
            conversationId: conversationId,
            status: "OPEN",
            assignedToId: null
          });

          stopFlow = true;
          break;
        }

        case "end": {
          const closingMsg = replaceVariables(node.data?.message || "Thank you! The flow has ended.", variables, contact);
          if (closingMsg) {
            await sendMsg(agencyId, conversation, closingMsg, "TEXT", integration);
          }

          // Complete flow session
          await pool.query(
            "UPDATE flow_sessions SET status = 'COMPLETED', delay_next_run_at = NULL, current_node_id = ? WHERE id = ?",
            [node.id, session.id]
          );

          stopFlow = true;
          break;
        }

        case "httpApi": {
          // Calls a saved HTTP API Campaign (Automation module) by id —
          // see services/httpApiExecutor.js for the actual request and its
          // response -> custom field mapping. Two output handles let a flow
          // branch on whether the call actually succeeded, same pattern as
          // "condition" above (getNextNodeId(node.id, handleId)).
          const campaignId = node.data?.campaignId;
          if (!campaignId) {
            console.warn(`[Flow Engine] httpApi node ${node.id} has no campaignId configured — skipping.`);
            currentNodeId = getNextNodeId(node.id, "fail");
            break;
          }

          const [[campaign]] = await pool.query(
            "SELECT * FROM http_api_campaigns WHERE id = ? AND agency_id = ? AND is_active = 1",
            [campaignId, agencyId]
          );

          if (!campaign) {
            console.warn(`[Flow Engine] httpApi node ${node.id} references missing/inactive campaign ${campaignId}.`);
            currentNodeId = getNextNodeId(node.id, "fail");
            break;
          }

          const httpResult = await executeHttpApiCampaign(campaign, {
            agencyId,
            contact,
            variables,
            replaceVariables,
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
          });

          // Persist the (possibly field-updated) session variables, same as
          // every other node that can mutate them (see collectInput above).
          await pool.query("UPDATE flow_sessions SET variables = ? WHERE id = ?", [JSON.stringify(variables), session.id]);

          currentNodeId = getNextNodeId(node.id, httpResult.success ? "success" : "fail");
          break;
        }

        case "appointment": {
          const aptRoute = node.data?.serviceId ? `apt:svc:${node.data.serviceId}` : "book_appointment";
          await handleAppointmentBooking(agencyId, platform, conversation, contact, "book appointment", integration, "TEXT", aptRoute);
          stopFlow = true; // Wait for customer's interactive appointment slot selection
          break;
        }

        default: {
          currentNodeId = getNextNodeId(node.id);
          break;
        }
      }
    }

    // 4. Update flow session current node & variables in DB if active
    if (!stopFlow && !currentNodeId) {
      // Flow completed because it hit a leaf node. Clear the sub-flow context too —
      // a session that finished while it happened to be inside (or just returned
      // from) a User Input Flow would otherwise be left permanently stamped with a
      // stale active_context/user_input_flow_id. Harmless to execution, since only
      // ACTIVE sessions are ever resumed, but it makes a completed row lie about
      // where it ended.
      await pool.query(
        `UPDATE flow_sessions
         SET status = 'COMPLETED', delay_next_run_at = NULL, current_node_id = ?, variables = ?,
             active_context = 'MAIN', user_input_flow_id = NULL,
             uif_current_node_id = NULL, return_node_id = NULL
         WHERE id = ?`,
        [currentNodeId, JSON.stringify(variables), session.id]
      );
    } else if (session.status === "ACTIVE") {
      if (inUIF) {
        // Paused mid-way through a User Input Flow (e.g. a Question node awaiting a
        // reply) — the MAIN flow's own position stays parked at `mainParkedNodeId`.
        await pool.query(
          `UPDATE flow_sessions
           SET active_context = 'USER_INPUT_FLOW', user_input_flow_id = ?, uif_current_node_id = ?,
               return_node_id = ?, current_node_id = ?, variables = ?
           WHERE id = ?`,
          [activeUifId, currentNodeId, returnNodeId, mainParkedNodeId, JSON.stringify(variables), session.id]
        );
      } else {
        await pool.query(
          `UPDATE flow_sessions
           SET active_context = 'MAIN', user_input_flow_id = NULL, uif_current_node_id = NULL, return_node_id = NULL,
               current_node_id = ?, variables = ?
           WHERE id = ?`,
          [currentNodeId, JSON.stringify(variables), session.id]
        );
      }
    }

    return true; // Flow was successfully executed
  } catch (err) {
    console.error("Flow engine error:", err);
    await logBotError({
      agencyId,
      flowId: flow?.id || session?.flow_id || null,
      integrationId: integration?.id || conversation?.integration_id || null,
      platform: platform || conversation?.platform || "WHATSAPP",
      contactId: contact?.id || conversation?.contact_id || null,
      contactIdentifier: contact?.external_id || contact?.phone || null,
      nodeId: currentNodeId || null,
      error: err,
      customMessage: `Flow execution error in "${flow?.name || 'Bot Flow'}": ${extractErrorMessage(err)}`,
    });
    return false;
  }
}

const BUTTON_ROUTE_PREFIX = "FBTN";

/**
 * Encodes "which flow, which node, which option index" into a short token used
 * as a button's own id/payload — so a click can be resolved directly by flow +
 * node + index, independent of the conversation's current session state. Node
 * ids are our own (Flow Builder-generated) and don't contain the `:` separator,
 * so this is safe to split on.
 */
export function encodeButtonRoute(flowId, nodeId, idx) {
  return `${BUTTON_ROUTE_PREFIX}:${flowId}:${nodeId}:${idx}`;
}

/** Reverses encodeButtonRoute(); returns null if `value` isn't one of our tokens. */
function decodeButtonRoute(value) {
  if (!value || typeof value !== "string" || !value.startsWith(`${BUTTON_ROUTE_PREFIX}:`)) return null;
  const parts = value.split(":");
  if (parts.length !== 4) return null;
  const flowId = Number(parts[1]);
  const idx = Number(parts[3]);
  if (!Number.isInteger(flowId) || !Number.isInteger(idx)) return null;
  return { flowId, nodeId: parts[2], idx };
}

/**
 * A list item used to be a plain string; it's now an object with the same
 * action shape a button has (plus `description`) — coerces either into the
 * current shape, defaulting to 'flow' so an old item (wired only by its
 * canvas edge) keeps behaving exactly as before.
 */
function normalizeListItem(item) {
  if (typeof item === "string") return { title: item, action: "flow" };
  return { action: "flow", ...item };
}

/**
 * Mirrors normalizeListMenuData() in FlowBuilderPage.jsx (frontend/backend can't
 * share a module in this codebase — hand-kept in sync). Upgrades a listMenu
 * node's data to the current `lists: [{title, buttonText, sections:
 * [{title, items}]}]` shape — `sections` is WhatsApp's own native grouping
 * (up to 10 sections, 10 rows total, all in ONE message), a different axis
 * from `lists` itself (each *list* is a separate sequential MESSAGE, used to
 * go past that 10-row cap). A list saved before section support only has a
 * flat `items` array, which becomes one untitled section; a flat top-level
 * `items` (pre-multi-list data) becomes a single list with one section — so
 * old data keeps working with zero migration.
 */
export function normalizeListMenuData(data) {
  let lists;
  if (Array.isArray(data?.lists) && data.lists.length > 0) {
    lists = data.lists;
  } else if (Array.isArray(data?.items)) {
    lists = [{ title: data?.title || "Menu Options", buttonText: data?.buttonText || "Options", items: data.items }];
  } else {
    lists = [];
  }

  return lists.map((list) => {
    const rawSections = Array.isArray(list.sections) && list.sections.length > 0
      ? list.sections
      : [{ title: "", items: list.items || [] }];
    const sections = rawSections.map((s) => ({ ...s, items: (s.items || []).map(normalizeListItem) }));
    return { ...list, sections, items: sections.flatMap((s) => s.items) };
  });
}

/**
 * Flat [{ item, listIndex, sectionIndex, itemIndex, globalIndex }] view across
 * every section of every list — globalIndex is the same flat index space the
 * canvas handle ids (`item-{gi}`) and the routing token encoded into each
 * option both use, so a tap on item 11 (the 1st item of the 2nd list) still
 * resolves to the right outgoing edge regardless of which section it's
 * grouped under.
 */
function flattenListMenuItems(lists) {
  const flat = [];
  let globalIndex = -1;
  lists.forEach((list, listIndex) => {
    (list.sections || []).forEach((section, sectionIndex) => {
      (section.items || []).forEach((item, itemIndex) => {
        globalIndex += 1;
        flat.push({ item, listIndex, sectionIndex, itemIndex, globalIndex });
      });
    });
  });
  return flat;
}

/**
 * How many options fit as real tappable buttons (vs. needing to fall back to a
 * list message) on a given channel — mirrors the button caps already hardcoded
 * in platformSender.js (WhatsApp/Facebook: 3) and PLATFORM_RULES in
 * FlowBuilderPage.jsx. Instagram has no standalone button node and TikTok has
 * no button/list support at all (isValidCollectedInput's typed-text matching
 * is the only path there), so both return 0 — a Multiple Choice question on
 * either always sends as a list (Instagram) or falls back to typed text
 * entirely once past the caller's own list-cap check (TikTok).
 */
function getButtonTapCap(platform) {
  const p = (platform || "WEBCHAT").toUpperCase();
  if (p === "WHATSAPP" || p === "FACEBOOK") return 3;
  if (p === "INSTAGRAM" || p === "TIKTOK") return 0;
  return Infinity; // Telegram, Webchat: no real platform-enforced cap
}

/**
 * The Flow Builder stores a button's action under `.action` ('flow' | 'url' | 'phone'),
 * not `.type` — normalizes either into the "URL" / "PHONE" / "POSTBACK" values the
 * rest of the engine (and platformSender.js) expects.
 */
export function normalizeButtonType(btn) {
  if (typeof btn !== "object" || !btn) return "POSTBACK";
  const action = (btn.action || btn.type || "").toString().toLowerCase();
  if (action === "url") return "URL";
  if (action === "phone" || action === "call") return "PHONE";
  return "POSTBACK";
}

/**
 * True if at least one of these formatted buttons can actually generate a reply
 * back to the bot. A URL-type button just opens a link client-side — it never
 * messages the bot — so a node whose buttons are *all* URL-type has nothing to
 * wait for and should continue immediately instead of parking the session on a
 * reply that structurally can never arrive.
 */
function hasWaitableButtons(formattedButtons, platform) {
  if (formattedButtons.length === 0) return false;
  if (platform === "WHATSAPP") {
    // platformSender.js sends a single URL-type button as a real CTA-URL message
    // (see sendPlatformMessage) — that genuinely opens a link and never replies to
    // the bot. Any other combination (2-3 buttons, or one non-URL button) still
    // uses WhatsApp's plain reply-button type, which always replies regardless of
    // the configured action — so only the exact single-URL-button case doesn't wait.
    const isSingleUrlButton = formattedButtons.length === 1 && formattedButtons[0].type === "URL";
    return !isSingleUrlButton;
  }
  // Telegram: platformSender.js's current inline keyboard implementation always
  // sends a callback (reply) button, never a real `url` button, regardless of the
  // configured action — so every Telegram button still replies.
  if (platform === "TELEGRAM") return true;
  // Facebook/Instagram web_url buttons genuinely open a link and generate no reply.
  return formattedButtons.some((b) => b.type !== "URL" && b.type !== "PHONE");
}

/**
 * Validate a "Collect Input" node's captured reply against its configured input type.
 * Deliberately lenient (this is a plain-text reply on a messaging channel, not a form field) —
 * only rejects clearly-wrong input for email/phone, everything else passes.
 */
function isValidCollectedInput(value, inputType) {
  if (!value) return false;
  if (inputType === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (inputType === "phone") return /^\+?[0-9\s\-().]{7,20}$/.test(value);
  if (inputType === "number") return /^-?\d+(\.\d+)?$/.test(value.trim());
  if (inputType === "date") return !isNaN(Date.parse(value));
  return true; // name / custom / text — accept anything non-empty
}

const DEFAULT_INVALID_INPUT_MESSAGE = {
  email: "That doesn't look like a valid email address. Could you try again?",
  phone: "That doesn't look like a valid phone number. Could you try again?",
  number: "That doesn't look like a number. Could you try again?",
  date: "That doesn't look like a valid date. Could you try again?",
  text: "Sorry, I didn't quite catch that. Could you try again?",
};

/**
 * Maps a Collect Input / Question node's `inputType` to the matching Custom
 * Field `field_type`, so its "save to custom field" picker only offers
 * fields that actually make sense for the kind of answer being collected.
 */
export function inputTypeToFieldType(inputType) {
  if (inputType === "number") return "NUMBER";
  if (inputType === "date") return "DATE";
  return "TEXT"; // name / email / phone / custom
}

/**
 * Replace template variables with actual values
 * Syntax: {{variable}} or {{contact.name}}
 */
export function replaceVariables(text, variables, contact) {
  if (!text) return "";
  let result = text;
  
  // Replace contact fields
  result = result.replace(/\{\{contact\.name\}\}/gi, contact.name || "Customer");
  result = result.replace(/\{\{contact\.phone\}\}/gi, contact.phone || "");
  result = result.replace(/\{\{contact\.email\}\}/gi, contact.email || "");

  // Replace custom variables
  const matches = result.match(/\{\{([a-zA-Z0-9_-]+)\}\}/g);
  if (matches) {
    for (const match of matches) {
      const varName = match.replace(/[{}]/g, "");
      if (variables[varName] !== undefined) {
        result = result.replace(match, variables[varName]);
      }
    }
  }

  return result;
}

/**
 * Called whenever a User Input Flow run actually finishes — either its
 * "Final Answer" node, or a "question" node configured to end the flow
 * itself. Records the full Q&A trail (`variables.__uifAnswers`, built up by
 * the "question" resume branch above) as one row, so a subscriber's complete
 * submission is visible in the Inbox regardless of whether any individual
 * question was also mapped to a Custom Field, then fires the Start node's
 * optional Webhook/Google Sheet export. Neither export can ever block the
 * subscriber's flow from completing — both are logged on failure, never thrown.
 */
async function completeUserInputFlowResponse({
  agencyId,
  uifId,
  uifStartData,
  variables,
  contact,
  conversation,
  mainFlowId,
}) {
  const answers = Array.isArray(variables.__uifAnswers) ? variables.__uifAnswers : [];

  try {
    const [res] = await pool.query(
      `INSERT INTO user_input_flow_responses (agency_id, user_input_flow_id, contact_id, conversation_id, flow_id, answers)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [agencyId, uifId, contact?.id || null, conversation?.id || null, mainFlowId || null, JSON.stringify(answers)]
    );
    emitToAgency(agencyId, "user_input_flow_response_saved", {
      id: res.insertId,
      userInputFlowId: uifId,
      contactId: contact?.id || null,
      answers,
    });
  } catch (err) {
    console.error("[Flow Engine] Failed to save User Input Flow response:", err.message);
  }

  const contactIdentifier = contact?.external_id || contact?.phone || null;

  if (uifStartData?.webhookUrl) {
    await sendWebhook(
      uifStartData.webhookUrl,
      {
        userInputFlowId: uifId,
        contact: { id: contact?.id || null, name: contact?.name || null, identifier: contactIdentifier },
        answers,
        completedAt: new Date().toISOString(),
      },
      { agencyId, contactId: contact?.id || null, contactIdentifier }
    );
  }

  if (uifStartData?.googleSheetId && uifStartData?.googleSheetTab) {
    try {
      const row = [
        new Date().toISOString(),
        contact?.name || "",
        contactIdentifier || "",
        ...answers.map((a) => (a && a.value !== undefined && a.value !== null ? String(a.value) : "")),
      ];
      await googleSheetsUtil.appendRow(agencyId, uifStartData.googleSheetId, uifStartData.googleSheetTab, row);
    } catch (err) {
      await logBotError({
        agencyId,
        contactId: contact?.id || null,
        contactIdentifier,
        customMessage: `User Input Flow Google Sheet export failed: ${err.message}`,
      });
    }
  }
}

/**
 * Save and send message to external channel, then emit to socket. Exported
 * so utils/sequenceRunner.js can send Sequence steps through the exact same
 * path a Flow does — before this, drip sends bypassed it entirely and never
 * showed up in the Inbox message timeline.
 */
export async function sendMsg(agencyId, conversation, bodyText, type, integration, extraFields = {}) {
  const conversationId = conversation.id;

  let activeIntegration = integration;
  if (!activeIntegration && conversation.integration_id) {
    try {
      const [integRows] = await pool.query("SELECT * FROM integrations WHERE id = ?", [conversation.integration_id]);
      activeIntegration = integRows[0];
    } catch (e) {}
  }

  // Send via platform API
  let externalMsgId = null;
  let contact = null;
  let targetPlatform = conversation.platform || activeIntegration?.platform || "WHATSAPP";

  try {
    const [contactRows] = await pool.query("SELECT * FROM contacts WHERE id = ?", [conversation.contact_id]);
    contact = contactRows[0];

    targetPlatform = conversation.platform || activeIntegration?.platform || contact?.platform || "WHATSAPP";

    if (activeIntegration && contact?.external_id) {
      externalMsgId = await sendPlatformMessage(targetPlatform, activeIntegration, contact.external_id, {
        type,
        body: bodyText,
        ...extraFields
      });
    } else if (targetPlatform !== "WEBCHAT") {
      const reason = !activeIntegration
        ? `No active channel account found for conversation #${conversationId}. Please verify your channel integration.`
        : `Contact has no valid external recipient ID.`;
      console.warn(`[Flow Engine] ${reason}`);
      await logBotError({
        agencyId,
        flowId: extraFields?.flowId || null,
        integrationId: activeIntegration?.id || conversation?.integration_id || null,
        platform: targetPlatform,
        contactId: conversation.contact_id,
        contactIdentifier: extraFields?.contactIdentifier || contact?.external_id || contact?.phone || null,
        nodeId: extraFields?.nodeId || null,
        customMessage: `Flow delivery failed: ${reason}`,
      });
    }
  } catch (apiErr) {
    console.error("API flow send failed:", apiErr.message || apiErr);
    await logBotError({
      agencyId,
      flowId: extraFields?.flowId || null,
      integrationId: activeIntegration?.id || conversation?.integration_id || null,
      platform: targetPlatform,
      contactId: conversation.contact_id,
      contactIdentifier: extraFields?.contactIdentifier || contact?.external_id || contact?.phone || null,
      nodeId: extraFields?.nodeId || null,
      error: apiErr,
      customMessage: `Flow delivery failed: ${extractErrorMessage(apiErr)}`,
    });
  }

  // Prepare metadata for buttons/interactive elements & sender attribution
  const metadataObj = {
    senderType: "BOT",
    senderName: "Bot",
  };
  if (extraFields?.buttons?.length) metadataObj.buttons = extraFields.buttons;
  if (extraFields?.quickReplies?.length) metadataObj.quickReplies = extraFields.quickReplies;
  if (extraFields?.listMenu) metadataObj.listMenu = extraFields.listMenu;
  if (extraFields?.card) metadataObj.card = extraFields.card;
  if (extraFields?.carousel) metadataObj.carousel = extraFields.carousel;
  if (extraFields?.headerType) metadataObj.headerType = extraFields.headerType;
  if (extraFields?.headerText) metadataObj.headerText = extraFields.headerText;
  if (extraFields?.headerMediaUrl) metadataObj.headerMediaUrl = extraFields.headerMediaUrl;
  if (extraFields?.footerText) metadataObj.footerText = extraFields.footerText;
  const metadataJson = JSON.stringify(metadataObj);

  // Insert message in DB
  const [msgResult] = await pool.query(
    `INSERT INTO messages (conversation_id, direction, type, body, media_url, metadata, external_msg_id, created_at)
     VALUES (?, 'OUTBOUND', ?, ?, ?, ?, ?, NOW())`,
    [conversationId, type, bodyText, extraFields?.mediaUrl || null, metadataJson, externalMsgId]
  );

  // Update conversation last_message_at
  await pool.query(
    "UPDATE conversations SET last_message_at = NOW() WHERE id = ?",
    [conversationId]
  );

  const [savedMsg] = await pool.query("SELECT * FROM messages WHERE id = ?", [msgResult.insertId]);
  const message = savedMsg[0];
  message.metadata = metadataObj;

  // Emit sockets
  emitToAgency(agencyId, "new_message", {
    conversationId,
    message
  });
  emitToConversation(conversationId, "new_message", {
    conversationId,
    message
  });

  return message;
}
