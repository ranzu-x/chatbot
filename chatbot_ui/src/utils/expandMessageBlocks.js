/**
 * Message Block expansion for the browser (the phone preview walks the canvas
 * client-side). Mirror of chatbot_api/utils/flowGraph.js expandMessageBlocks —
 * keep the two in step. A "messageBlock" node becomes a chain of the plain nodes
 * it holds (ids "<blockId>~<itemId>"); an edge INTO the block enters the first
 * element, its "next-step" edge leaves the last one, and an element's own
 * connector ("<itemId>:btn-0") is re-pointed at that element.
 */
const ITEM_TYPES = new Set([
  'text', 'image', 'video', 'audio', 'file', 'card', 'carousel', 'delay',
  'buttons', 'quickReplies', 'listMenu', 'interactive',
]);

export function expandMessageBlocks(nodes, edges) {
  if (!Array.isArray(nodes) || !nodes.some((n) => n.type === 'messageBlock')) {
    return { nodes, edges };
  }

  const outNodes = [];
  const firstId = {};
  const lastId = {};
  const chainEdges = [];

  for (const n of nodes) {
    if (n.type !== 'messageBlock') { outNodes.push(n); continue; }

    let items = (Array.isArray(n.data?.items) ? n.data.items : []).filter((it) => it && it.id && ITEM_TYPES.has(it.type));

    // Quick replies with no text of their own attach to the plain message before them.
    if (items.length >= 2) {
      const last = items[items.length - 1];
      const prev = items[items.length - 2];
      const plain = (it) => (it.type === 'buttons' || it.type === 'text')
        && (it.data?.message || '').trim() && !(it.data?.buttons || []).length;
      if (last.type === 'quickReplies' && !(last.data?.message || '').trim() && plain(prev)) {
        items = [...items.slice(0, -2), { ...last, data: { ...last.data, message: prev.data.message } }];
      }
    }

    if (items.length === 0) {
      outNodes.push({ id: n.id, type: 'actions', position: n.position, data: { actions: [] } });
      firstId[n.id] = n.id;
      lastId[n.id] = n.id;
      continue;
    }

    const ids = items.map((it) => `${n.id}~${it.id}`);
    items.forEach((it, idx) => {
      const data = { ...(it.data || {}) };
      if (idx === 0) {
        if (n.data?.delay) data.delay = n.data.delay;
        if (n.data?.showTyping) data.showTyping = true;
      }
      outNodes.push({ id: ids[idx], type: it.type, position: n.position, data });
      if (idx > 0) {
        chainEdges.push({ id: `chain-${ids[idx - 1]}-${ids[idx]}`, source: ids[idx - 1], target: ids[idx], sourceHandle: 'next-step' });
      }
    });
    firstId[n.id] = ids[0];
    lastId[n.id] = ids[ids.length - 1];
  }

  const outEdges = (edges || []).map((e) => {
    const next = { ...e };
    if (firstId[e.target]) next.target = firstId[e.target];
    if (lastId[e.source]) {
      const handle = e.sourceHandle || '';
      const colon = handle.indexOf(':');
      if (colon > 0) {
        next.source = `${e.source}~${handle.slice(0, colon)}`;
        next.sourceHandle = handle.slice(colon + 1);
      } else {
        next.source = lastId[e.source];
      }
    }
    return next;
  });

  return { nodes: outNodes, edges: [...outEdges, ...chainEdges] };
}
