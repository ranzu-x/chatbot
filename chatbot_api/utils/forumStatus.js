/**
 * Per-category resolution-status workflow — the confirmed mapping. Shared
 * by routes/forum.js's admin status-update endpoint (validates against
 * this) and served to the frontend as-is so the status dropdown can never
 * offer an illegal option for a thread's category.
 *
 * Announcement carries no workflow — it's an admin-authored post, not a
 * tracked item — so it's absent from this map on purpose; treat "no entry"
 * as "this category has no status workflow" rather than "falls back to
 * something".
 */
export const STATUS_OPTIONS_BY_CATEGORY = {
  BUG: ["OPEN", "IN_PROCESS", "RESOLVED"],
  FEATURE_REQUEST: ["OPEN", "CONSIDERED", "IN_PROCESS", "IMPLEMENTED"],
  DISCUSSION: ["OPEN", "COMPLETED"],
};

export const CATEGORIES = ["BUG", "FEATURE_REQUEST", "DISCUSSION", "ANNOUNCEMENT"];

export function isValidCategory(category) {
  return CATEGORIES.includes(category);
}

export function isValidStatusForCategory(category, status) {
  const options = STATUS_OPTIONS_BY_CATEGORY[category];
  return Array.isArray(options) && options.includes(status);
}
