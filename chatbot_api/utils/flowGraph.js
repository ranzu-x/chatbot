/**
 * Shared node/edge graph resolution — the same edge-lookup rules flowEngine.js
 * has always used for a Flow/User Input Flow session, extracted here so the
 * Sequence runner (utils/sequenceRunner.js) walks its own node/edge canvas
 * with the identical, already-correct logic instead of a second
 * implementation that could drift out of sync.
 */

/**
 * Resolves the next node id from `sourceId`, optionally down one specific
 * handle (a particular button/option/branch). With no handle, prefers an
 * explicit "next-step"/"default" edge, then falls back to whatever edge
 * exists from that node.
 */
export function resolveNextNodeId(edges, sourceId, sourceHandle = null) {
  if (sourceHandle) {
    const matchedEdge = edges.find((e) => e.source === sourceId && e.sourceHandle === sourceHandle);
    return matchedEdge ? matchedEdge.target : null;
  }
  let matchedEdge = edges.find((e) => e.source === sourceId && (!e.sourceHandle || e.sourceHandle === "next-step" || e.sourceHandle === "default"));
  if (!matchedEdge) {
    matchedEdge = edges.find((e) => e.source === sourceId);
  }
  return matchedEdge ? matchedEdge.target : null;
}

/**
 * Strictly whatever is wired to a node's own "Next Step" handle — never a
 * button/option branch, and does NOT fall back to "any edge from this node".
 */
/** True for a button / quick-reply / list-item handle (btn-0, qr_1, item-2) — wires that only run on a tap. */
export function isOptionHandle(handle) {
  return typeof handle === "string" && /^(btn|qr|item)[-_]\d+$/.test(handle);
}

export function resolveNextStepNodeId(edges, sourceId) {
  const matchedEdge = edges.find((e) => e.source === sourceId && e.sourceHandle === "next-step");
  return matchedEdge ? matchedEdge.target : null;
}

/**
 * Validates that a node/edge graph is a single linear chain with no
 * branching — every node has at most one outgoing edge. Used for Sequences,
 * which are strictly one-way broadcasts (no branching, no waiting for a
 * reply mid-sequence — see the Sequence Messages plan). Returns the id of
 * the first node found with more than one outgoing edge, or null if the
 * graph is already linear.
 */
export function findFirstBranchingNodeId(nodes, edges) {
  const outgoingCount = new Map();
  for (const edge of edges) {
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) || 0) + 1);
  }
  for (const node of nodes) {
    if ((outgoingCount.get(node.id) || 0) > 1) return node.id;
  }
  return null;
}

/**
 * Message Block support.
 *
 * A "messageBlock" node (Flow Builder) holds an ordered list of ordinary message
 * elements — data.items = [{ id, type, data }]. Rather than teach the engine a
 * second way to send every element, a block is expanded here, at load time, into
 * a chain of the plain nodes it stands for (text, image, buttons, ...), so every
 * element is sent by the exact same code (and per-channel formatting/limits) as
 * when it sits on the canvas by itself.
 *
 *   - node ids:  "<blockId>~<itemId>"   (no ":" — button routes split on it)
 *   - an edge INTO the block enters the first element
 *   - the block's own "next-step" edge leaves from the last element
 *   - an edge from the element's own connector uses sourceHandle
 *     "<itemId>:<handle>" (e.g. "it_ab12:btn-0") and is re-pointed at that element
 *
 * Buttons on a text/image element do NOT stop the chain: the engine already treats
 * an explicit "next-step" edge as "keep going, the buttons stay tappable" (and a
 * button tap is routed by its own token at any time). Only the last element may
 * wait for a reply (quick replies / list / interactive); the builder enforces that.
 */
export const BLOCK_ITEM_SEPARATOR = "~";
const BLOCK_ITEM_TYPES = new Set([
  "text", "image", "video", "audio", "file", "card", "carousel", "delay",
  "buttons", "quickReplies", "listMenu", "interactive",
]);

export function expandMessageBlocks(nodes, edges) {
  if (!Array.isArray(nodes) || !nodes.some((n) => n.type === "messageBlock")) {
    return { nodes, edges };
  }

  const outNodes = [];
  const firstId = {};
  const lastId = {};
  const chainEdges = [];

  for (const n of nodes) {
    if (n.type !== "messageBlock") { outNodes.push(n); continue; }

    let items = (Array.isArray(n.data?.items) ? n.data.items : [])
      .filter((it) => it && it.id && BLOCK_ITEM_TYPES.has(it.type));

    // Quick replies with no text of their own attach to the plain message right before them
    // (one message with the reply chips under it, like ManyChat) instead of sending a second bubble.
    if (items.length >= 2) {
      const last = items[items.length - 1];
      const prev = items[items.length - 2];
      const isPlainText = (it) => (it.type === "buttons" || it.type === "text")
        && (it.data?.message || "").trim() && !(it.data?.buttons || []).length;
      if (last.type === "quickReplies" && !(last.data?.message || "").trim() && isPlainText(prev)) {
        items = [...items.slice(0, -2), { ...last, data: { ...last.data, message: prev.data.message } }];
      }
    }

    if (items.length === 0) {
      // An empty block just passes straight through to whatever follows.
      outNodes.push({ id: n.id, type: "actions", position: n.position, data: { actions: [] } });
      firstId[n.id] = n.id;
      lastId[n.id] = n.id;
      continue;
    }

    const ids = items.map((it) => n.id + BLOCK_ITEM_SEPARATOR + it.id);
    items.forEach((it, idx) => {
      const data = { ...(it.data || {}) };
      // The block's own "delay before" / typing indicator apply to its first element.
      if (idx === 0) {
        if (n.data?.delay) data.delay = n.data.delay;
        if (n.data?.showTyping) data.showTyping = true;
      }
      outNodes.push({ id: ids[idx], type: it.type, position: n.position, data });
      if (idx > 0) {
        chainEdges.push({
          id: "chain-" + ids[idx - 1] + "-" + ids[idx],
          source: ids[idx - 1],
          target: ids[idx],
          sourceHandle: "next-step",
        });
      }
    });
    firstId[n.id] = ids[0];
    lastId[n.id] = ids[ids.length - 1];
  }

  const outEdges = (edges || []).map((e) => {
    const next = { ...e };
    if (firstId[e.target]) next.target = firstId[e.target];
    if (lastId[e.source]) {
      const handle = e.sourceHandle || "";
      const colon = handle.indexOf(":");
      if (colon > 0) {
        next.source = e.source + BLOCK_ITEM_SEPARATOR + handle.slice(0, colon);
        next.sourceHandle = handle.slice(colon + 1);
      } else {
        next.source = lastId[e.source];
      }
    }
    return next;
  });

  return { nodes: outNodes, edges: [...outEdges, ...chainEdges] };
}
