import pool from "../db.js";
import { sendPlatformMessage } from "./platformSender.js";
import { emitToAgency, emitToConversation } from "./socket.js";
import { logBotError, extractErrorMessage } from "./botLogger.js";

/**
 * Helper to find matching flow based on triggers
 */
export async function findMatchingFlow(agencyId, platform, conversationId, integration, incomingMsgBody, msgType = "TEXT") {
  const msgText = (incomingMsgBody || "").trim().toLowerCase();
  const upperMsgType = (msgType || "TEXT").toUpperCase();
  const isMedia = ["IMAGE", "VIDEO", "AUDIO", "VOICE", "DOCUMENT", "FILE"].includes(upperMsgType);
  
  const integId = integration?.id || null;
  const [flows] = await pool.query(
    `SELECT * FROM flows 
     WHERE agency_id = ? AND platform = ? AND is_active = 1 
       AND (integration_id IS NULL OR integration_id = ?)
     ORDER BY (integration_id <=> ?) DESC, (trigger_type = 'KEYWORD') DESC, created_at DESC`,
    [agencyId, platform, integId, integId]
  );

  for (const f of flows) {
    let flowNodes = [];
    try { flowNodes = JSON.parse(f.nodes_json || "[]"); } catch { flowNodes = []; }
    const startNode = flowNodes.find(n => n.type === "start");
    if (!startNode) continue;

    // Multi-trigger support: check if startNode has `triggers` array
    let triggersList = startNode.data?.triggers;
    if (!Array.isArray(triggersList) || triggersList.length === 0) {
      triggersList = [
        {
          type: startNode.data?.trigger_type || f.trigger_type || "keyword",
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
      } else if (tType === "first_contact" || tType === "first_message") {
        if (conversationId) {
          const [msgCount] = await pool.query(
            "SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?",
            [conversationId]
          );
          if (msgCount[0]?.count <= 1) {
            isMatch = true;
            break;
          }
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
        nodes: flowNodes,
        edges: JSON.parse(f.edges_json || "[]"),
        startNode,
      };
    }
  }

  return null;
}

/**
 * Main Flow Engine Processor
 * Returns true if a flow was processed/executed (so the webhook knows NOT to run standard bot rules).
 */
export async function processFlow(agencyId, platform, conversation, contact, incomingMsgBody, integration, msgType = "TEXT") {
  const conversationId = conversation.id;

  try {
    // Check if bot is paused for this conversation or contact
    if (conversation?.bot_paused || contact?.bot_paused) {
      console.log(`🤖 [Flow Engine] Bot/Flow is paused for conversation ${conversationId} or contact ${contact?.id}`);
      return false;
    }

    // 1. Check for active flow session
    const [sessions] = await pool.query(
      "SELECT * FROM flow_sessions WHERE conversation_id = ? AND status = 'ACTIVE' LIMIT 1",
      [conversationId]
    );

    let session = sessions[0];
    let flow = null;
    let nodes = [];
    let edges = [];

    if (session) {
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
        "SELECT * FROM flows WHERE id = ? AND is_active = 1 LIMIT 1",
        [session.flow_id]
      );
      flow = flows[0];
      if (flow) {
        nodes = JSON.parse(flow.nodes_json || "[]");
        edges = JSON.parse(flow.edges_json || "[]");
      } else {
        // Flow deleted or inactive, close session
        await pool.query("UPDATE flow_sessions SET status = 'COMPLETED' WHERE id = ?", [session.id]);
        session = null;
      }
    }

    if (!session) {
      // 2. Look for matching flow trigger
      const match = await findMatchingFlow(agencyId, platform, conversationId, integration, incomingMsgBody, msgType);
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
      }
    }

    if (!session || !flow) {
      return false; // No flow triggered or active
    }

    // Parse variables if it's a string
    let variables = typeof session.variables === "string" ? JSON.parse(session.variables) : (session.variables || {});

    // 3. Resume and Execute Flow Node Loop
    let currentNodeId = session.current_node_id;
    let nextNodeId = null;
    let stopFlow = false;

    // Helper to get next node ID based on edge connections
    const getNextNodeId = (sourceId, sourceHandle = null) => {
      let matchedEdge = null;
      if (sourceHandle) {
        matchedEdge = edges.find(e => e.source === sourceId && e.sourceHandle === sourceHandle);
        return matchedEdge ? matchedEdge.target : null;
      }
      matchedEdge = edges.find(e => e.source === sourceId && !e.sourceHandle);
      if (!matchedEdge) {
        matchedEdge = edges.find(e => e.source === sourceId);
      }
      return matchedEdge ? matchedEdge.target : null;
    };

    // If resuming from a node that was waiting for input
    const currentNode = nodes.find(n => n.id === currentNodeId);
    if (currentNode && session.created_at !== session.updated_at) {
      // We had already executed this node in a previous step and were waiting for input.
      // Now process the user's input.
      if (currentNode.type === "collectInput") {
        const varName = currentNode.data?.variableName || "last_input";
        variables[varName] = incomingMsgBody;
        
        // Save variables
        await pool.query("UPDATE flow_sessions SET variables = ? WHERE id = ?", [JSON.stringify(variables), session.id]);
        
        // Follow default outgoing handle
        nextNodeId = getNextNodeId(currentNodeId);
      } 
      else if (currentNode.type === "buttons" || (currentNode.type === "image" && (currentNode.data?.buttons || []).length > 0)) {
        const choice = (incomingMsgBody || "").trim().toLowerCase();
        const btns = currentNode.data?.buttons || [];
        let matchedIdx = -1;
        let matchedHandleId = null;

        for (let i = 0; i < btns.length; i++) {
          const btn = btns[i];
          const title = typeof btn === "string" ? btn : (btn.title || btn.label || "");
          const payload = typeof btn === "string" ? btn : (btn.payload || "");
          const id = typeof btn === "string" ? `btn-${i}` : (btn.id || `btn-${i}`);
          const altId = `btn_${i}`;

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
                       getNextNodeId(currentNodeId, `btn-${matchedIdx}`) ||
                       getNextNodeId(currentNodeId, `btn_${matchedIdx}`);
          
          if (!nextNodeId) {
            // Button reached a leaf, mark session completed
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
        const items = currentNode.data?.items || [];
        const matchedItem = items.find((item, idx) => 
          (item.title && item.title.toLowerCase() === choice) ||
          (item.payload && item.payload.toLowerCase() === choice) ||
          (item.id && item.id.toLowerCase() === choice) ||
          `item_${idx}` === choice ||
          `item-${idx}` === choice
        );
        
        if (matchedItem) {
          nextNodeId = getNextNodeId(currentNodeId, matchedItem.id);
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
    }

    // Main Execution Loop
    while (currentNodeId && !stopFlow) {
      const node = nodes.find(n => n.id === currentNodeId);
      if (!node) {
        console.log(`[Flow Engine] Node with id ${currentNodeId} not found. Exiting.`);
        break; // Node not found in flow, exit
      }

      console.log(`🤖 [Flow Engine] Executing Flow Node: ${node.type} (${node.id})`);

      switch (node.type) {
        case "start": {
          currentNodeId = getNextNodeId(node.id);
          break;
        }

        case "text": {
          const textBody = replaceVariables(node.data?.message || node.data?.text || node.data?.body || "", variables, contact);
          if (textBody) {
            await sendMsg(agencyId, conversation, textBody, "TEXT", integration, {
              flowId: flow?.id || session?.flow_id || null,
              nodeId: node.id,
              contactIdentifier: contact?.external_id || contact?.phone || null,
            });
          }
          
          currentNodeId = getNextNodeId(node.id);
          break;
        }

        case "image": {
          const caption = replaceVariables(node.data?.caption || node.data?.message || node.data?.text || "", variables, contact);
          const mediaUrl = (node.data?.imageUrl || node.data?.mediaUrl || node.data?.url || "").trim();
          const rawButtons = node.data?.buttons || [];
          const formattedButtons = rawButtons.map((btn, idx) => ({
            id: typeof btn === "string" ? `btn-${idx}` : (btn.id || `btn-${idx}`),
            title: typeof btn === "string" ? btn : (btn.title || btn.label || `Button ${idx + 1}`),
            payload: typeof btn === "string" ? btn : (btn.payload || btn.title || `btn_${idx}`),
            type: typeof btn === "object" && btn.type === "URL" ? "URL" : "POSTBACK",
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
          
          if (formattedButtons.length > 0) {
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
            id: typeof btn === "string" ? `btn-${idx}` : (btn.id || `btn-${idx}`),
            title: typeof btn === "string" ? btn : (btn.title || btn.label || `Button ${idx + 1}`),
            payload: typeof btn === "string" ? btn : (btn.payload || btn.title || `btn_${idx}`),
            type: typeof btn === "object" && btn.type === "URL" ? "URL" : "POSTBACK",
            url: typeof btn === "object" ? btn.url : null,
          }));

          await sendMsg(agencyId, conversation, textBody, "TEXT", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            buttons: formattedButtons,
          });

          // Stop execution and wait for user button click/reply
          stopFlow = true;
          break;
        }

        case "quickReplies": {
          const textBody = replaceVariables(node.data?.message || node.data?.text || "Choose options:", variables, contact);
          const rawQr = node.data?.quickReplies || node.data?.replies || [];

          const formattedQr = rawQr.map((qr, idx) => ({
            id: typeof qr === "string" ? `qr-${idx}` : (qr.id || `qr-${idx}`),
            title: typeof qr === "string" ? qr : (qr.title || qr.label || `Option ${idx + 1}`),
            payload: typeof qr === "string" ? qr : (qr.payload || qr.title || `qr_${idx}`)
          }));

          await sendMsg(agencyId, conversation, textBody, "TEXT", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            quickReplies: formattedQr,
          });

          stopFlow = true;
          break;
        }

        case "listMenu": {
          const textBody = replaceVariables(node.data?.message || node.data?.text || "Select from menu:", variables, contact);
          const items = node.data?.items || [];

          await sendMsg(agencyId, conversation, textBody, "TEXT", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            listMenu: {
              buttonText: node.data?.buttonText || "Options",
              title: node.data?.title || "Menu",
              items: items.map((item, idx) => ({
                id: typeof item === "string" ? `item_${idx}` : (item.id || `item_${idx}`),
                title: typeof item === "string" ? item : (item.title || `Item ${idx + 1}`),
                description: typeof item === "object" ? (item.description || "") : ""
              }))
            }
          });

          stopFlow = true;
          break;
        }

        case "card": {
          const title = replaceVariables(node.data?.title || "", variables, contact);
          const subtitle = replaceVariables(node.data?.subtitle || "", variables, contact);
          const imageUrl = node.data?.imageUrl || node.data?.mediaUrl || "";

          await sendMsg(agencyId, conversation, title || "Card", "IMAGE", integration, {
            flowId: flow?.id || session?.flow_id || null,
            nodeId: node.id,
            contactIdentifier: contact?.external_id || contact?.phone || null,
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
              imageUrl: c.imageUrl || "",
              buttons: c.buttons || []
            }))
          });

          currentNodeId = getNextNodeId(node.id);
          break;
        }

        case "collectInput": {
          const prompt = replaceVariables(node.data?.message || node.data?.text || "Please enter details:", variables, contact);
          await sendMsg(agencyId, conversation, prompt, "TEXT", integration);

          // Stop execution and wait for input
          stopFlow = true;
          break;
        }

        case "condition": {
          const varName = node.data?.variable;
          const operator = node.data?.operator || "equals";
          const matchValue = (node.data?.value || "").toLowerCase().trim();
          const userValue = String(variables[varName] || "").toLowerCase().trim();

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
          const delaySecs = parseInt(node.data?.seconds || "2");
          // Simple delay execution for up to 5 seconds.
          if (delaySecs > 0 && delaySecs <= 5) {
            await new Promise(resolve => setTimeout(resolve, delaySecs * 1000));
          }
          
          currentNodeId = getNextNodeId(node.id);
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
            "UPDATE flow_sessions SET status = 'COMPLETED', current_node_id = ? WHERE id = ?",
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
            "UPDATE flow_sessions SET status = 'COMPLETED', current_node_id = ? WHERE id = ?",
            [node.id, session.id]
          );

          stopFlow = true;
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
      // Flow completed because it hit a leaf node
      await pool.query(
        "UPDATE flow_sessions SET status = 'COMPLETED', current_node_id = ? WHERE id = ?",
        [currentNodeId, session.id]
      );
    } else if (session.status === "ACTIVE") {
      await pool.query(
        "UPDATE flow_sessions SET current_node_id = ?, variables = ? WHERE id = ?",
        [currentNodeId, JSON.stringify(variables), session.id]
      );
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

/**
 * Replace template variables with actual values
 * Syntax: {{variable}} or {{contact.name}}
 */
function replaceVariables(text, variables, contact) {
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
 * Save and send message to external channel, then emit to socket
 */
async function sendMsg(agencyId, conversation, bodyText, type, integration, extraFields = {}) {
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
