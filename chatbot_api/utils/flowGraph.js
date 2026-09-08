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
