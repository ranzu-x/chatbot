import pool from "../db.js";
import { sendPlatformMessage } from "./platformSender.js";
import { emitToAgency, emitToConversation } from "./socket.js";

/**
 * Main Flow Engine Processor
 * Returns true if a flow was processed/executed (so the webhook knows NOT to run standard bot rules).
 */
export async function processFlow(agencyId, platform, conversation, contact, incomingMsgBody, integration) {
  const conversationId = conversation.id;

  try {
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
        return false;
      }
    } else {
      // 2. Look for matching flow trigger
      const msgText = (incomingMsgBody || "").trim().toLowerCase();
      
      // Match by keyword trigger or first contact
      const [flows] = await pool.query(
        `SELECT * FROM flows 
         WHERE agency_id = ? AND platform = ? AND is_active = 1 
         ORDER BY (trigger_type = 'KEYWORD') DESC, created_at DESC`,
        [agencyId, platform]
      );

      // Find first flow that matches
      for (const f of flows) {
        let isMatch = false;
        if (f.trigger_type === "KEYWORD" && f.trigger_keyword) {
          const keywords = f.trigger_keyword.toLowerCase().split(",").map(k => k.trim());
          if (keywords.includes(msgText)) {
            isMatch = true;
          }
        } else if (f.trigger_type === "ANY") {
          isMatch = true;
        } else if (f.trigger_type === "FIRST_CONTACT") {
          // Check if this is the first message in the conversation
          const [msgCount] = await pool.query(
            "SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?",
            [conversationId]
          );
          if (msgCount[0].count <= 1) {
            isMatch = true;
          }
        }

        if (isMatch) {
          flow = f;
          nodes = JSON.parse(flow.nodes_json || "[]");
          edges = JSON.parse(flow.edges_json || "[]");
          
          // Find start node
          const startNode = nodes.find(n => n.type === "start");
          if (!startNode) continue; // Flow has no start node, skip

          // Create new session
          const [newSess] = await pool.query(
            "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
            [agencyId, conversationId, flow.id, startNode.id, JSON.stringify({})]
          );

          session = {
            id: newSess.insertId,
            agency_id: agencyId,
            conversation_id: conversationId,
            flow_id: flow.id,
            current_node_id: startNode.id,
            variables: {},
            status: "ACTIVE"
          };
          break;
        }
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
      }
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
      else if (currentNode.type === "buttons") {
        const choice = (incomingMsgBody || "").trim().toLowerCase();
        // Find if user reply matches button text/payload
        const btns = currentNode.data?.buttons || [];
        const matchedBtn = btns.find(b => b.title.toLowerCase() === choice || (b.payload && b.payload.toLowerCase() === choice));
        
        if (matchedBtn) {
          nextNodeId = getNextNodeId(currentNodeId, matchedBtn.id);
        } else {
          // If no button matched, we can either re-send the options or just follow the default edge
          nextNodeId = getNextNodeId(currentNodeId);
        }
      }
      else if (currentNode.type === "quickReplies") {
        const choice = (incomingMsgBody || "").trim().toLowerCase();
        const replies = currentNode.data?.quickReplies || [];
        const matchedQr = replies.find(r => r.title.toLowerCase() === choice || (r.payload && r.payload.toLowerCase() === choice));
        
        if (matchedQr) {
          nextNodeId = getNextNodeId(currentNodeId, matchedQr.id);
        } else {
          nextNodeId = getNextNodeId(currentNodeId);
        }
      }
      else if (currentNode.type === "listMenu") {
        const choice = (incomingMsgBody || "").trim().toLowerCase();
        const items = currentNode.data?.items || [];
        const matchedItem = items.find(item => item.title.toLowerCase() === choice || (item.payload && item.payload.toLowerCase() === choice));
        
        if (matchedItem) {
          nextNodeId = getNextNodeId(currentNodeId, matchedItem.id);
        } else {
          nextNodeId = getNextNodeId(currentNodeId);
        }
      }
      else {
        nextNodeId = getNextNodeId(currentNodeId);
      }

      currentNodeId = nextNodeId;
    }

    // Main Execution Loop
    while (currentNodeId && !stopFlow) {
      const node = nodes.find(n => n.id === currentNodeId);
      if (!node) {
        break; // Node not found in flow, exit
      }

      console.log(`Executing Flow Node: ${node.type} (${node.id})`);

      switch (node.type) {
        case "start": {
          currentNodeId = getNextNodeId(node.id);
          break;
        }

        case "text": {
          const textBody = replaceVariables(node.data?.text || "", variables, contact);
          await sendMsg(agencyId, conversation, textBody, "TEXT", integration);
          
          currentNodeId = getNextNodeId(node.id);
          break;
        }

        case "buttons": {
          const textBody = replaceVariables(node.data?.text || "Select an option:", variables, contact);
          const rawButtons = node.data?.buttons || [];
          
          await sendMsg(agencyId, conversation, textBody, "TEXT", integration, {
            buttons: rawButtons.map((btn, idx) => ({
              id: btn.id || `btn_${idx}`,
              title: btn.title,
              payload: btn.payload || btn.title
            }))
          });

          // Stop execution and wait for user button click/reply
          stopFlow = true;
          break;
        }

        case "quickReplies": {
          const textBody = replaceVariables(node.data?.text || "Choose options:", variables, contact);
          const rawQr = node.data?.quickReplies || [];

          await sendMsg(agencyId, conversation, textBody, "TEXT", integration, {
            quickReplies: rawQr.map((qr, idx) => ({
              id: qr.id || `qr_${idx}`,
              title: qr.title,
              payload: qr.payload || qr.title
            }))
          });

          stopFlow = true;
          break;
        }

        case "listMenu": {
          const textBody = replaceVariables(node.data?.text || "Select from menu:", variables, contact);
          const items = node.data?.items || [];

          await sendMsg(agencyId, conversation, textBody, "TEXT", integration, {
            listMenu: {
              buttonText: node.data?.buttonText || "Options",
              title: node.data?.title || "Menu",
              items: items.map((item, idx) => ({
                id: item.id || `item_${idx}`,
                title: item.title,
                description: item.description || ""
              }))
            }
          });

          stopFlow = true;
          break;
        }

        case "card": {
          const title = replaceVariables(node.data?.title || "", variables, contact);
          const subtitle = replaceVariables(node.data?.subtitle || "", variables, contact);
          const imageUrl = node.data?.imageUrl || "";

          await sendMsg(agencyId, conversation, title, "IMAGE", integration, {
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
          
          await sendMsg(agencyId, conversation, "Sent carousel card options", "TEXT", integration, {
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
          const prompt = replaceVariables(node.data?.text || "Please enter details:", variables, contact);
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

  // Send via platform API
  let externalMsgId = null;
  try {
    const [contactRows] = await pool.query("SELECT * FROM contacts WHERE id = ?", [conversation.contact_id]);
    const contact = contactRows[0];

    externalMsgId = await sendPlatformMessage(conversation.platform || integration.platform, integration, contact.external_id, {
      type,
      body: bodyText,
      ...extraFields
    });
  } catch (apiErr) {
    console.error("API flow send failed:", apiErr.message);
  }

  // Insert message in DB
  const [msgResult] = await pool.query(
    `INSERT INTO messages (conversation_id, direction, type, body, external_msg_id, created_at)
     VALUES (?, 'OUTBOUND', ?, ?, ?, NOW())`,
    [conversationId, type, bodyText, externalMsgId]
  );

  // Update conversation last_message_at
  await pool.query(
    "UPDATE conversations SET last_message_at = NOW() WHERE id = ?",
    [conversationId]
  );

  const [savedMsg] = await pool.query("SELECT * FROM messages WHERE id = ?", [msgResult.insertId]);
  const message = savedMsg[0];

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
