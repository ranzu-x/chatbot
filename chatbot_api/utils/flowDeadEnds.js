/**
 * Buttons, quick replies and list items that do nothing when tapped: set to
 * "Continue Flow" (the default action) but with no wire from their handle.
 * A flow with any of them can't be saved (PUT /flows/:id — decided with the
 * user); the Flow Builder checks the same thing first
 * (chatbot_ui/src/utils/flowChannelRules.js findDeadEndOptions — keep in step).
 *
 * Handles: btn-<i> (text / buttons / interactive / image / video),
 * qr-<i> (quick replies, not the special "share phone/email" kinds),
 * item-<n> (list items, numbered across all lists); inside a Send Message
 * block they are prefixed with "<block item id>:".
 */
import { normalizeListMenuData } from "./flowEngine.js";

const BUTTON_TYPES = new Set(["text", "buttons", "interactive", "image", "video"]);
const title = (b) => (typeof b === "string" ? b : (b?.title || "")).trim();
const continues = (b) => typeof b === "string" || !b?.action || b.action === "flow";
const isSpecialReply = (r) => r && typeof r === "object" && r.kind && r.kind !== "text";

export function findDeadEndOptions(nodes, edges) {
  const wired = new Set((Array.isArray(edges) ? edges : []).map((e) => `${e?.source}|${e?.sourceHandle || ""}`));
  const out = [];
  const check = (node, type, data, prefix, itemId) => {
    const miss = (handle, what) => {
      if (!wired.has(`${node.id}|${prefix}${handle}`)) {
        out.push({ nodeId: node.id, itemId, message: `${node.data?.label || type}: ${what} is set to continue the flow but isn't connected to a next step` });
      }
    };
    if (BUTTON_TYPES.has(type)) {
      (data?.buttons || []).forEach((b, i) => { if (continues(b)) miss(`btn-${i}`, `Button "${title(b) || i + 1}"`); });
    } else if (type === "quickReplies") {
      (data?.replies || []).forEach((r, i) => { if (!isSpecialReply(r) && continues(r)) miss(`qr-${i}`, `Quick reply "${title(r) || i + 1}"`); });
    } else if (type === "listMenu") {
      let gi = 0;
      for (const list of normalizeListMenuData(data || {})) {
        for (const item of list.items || []) {
          if (continues(item)) miss(`item-${gi}`, `List item "${title(item) || gi + 1}"`);
          gi += 1;
        }
      }
    }
  };
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== "object") continue;
    if (node.type === "messageBlock") {
      for (const item of node.data?.items || []) check(node, item?.type, item?.data, `${item?.id}:`, item?.id || null);
    } else {
      check(node, node.type, node.data, "", null);
    }
  }
  return out;
}
