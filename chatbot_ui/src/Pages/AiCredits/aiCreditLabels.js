// Shared wording for AI Credits screens (customer page + Super Admin page).

export const FEATURE_LABELS = {
  ai_reply: 'AI Reply',
  ai_rewrite: 'AI Rewrite',
  inbox_suggest: 'Suggested replies',
  inbox_summary: 'Chat summary',
  translation: 'Translation',
  transcription: 'Voice transcription',
  knowledge_index: 'Knowledge indexing',
  comment_reply: 'Comment reply',
  agent_test: 'Agent test chat',
  agent_routing: 'Agent routing',
  ai_text: 'AI text',
  ai_vision: 'AI image',
  ai_video: 'AI video',
  ai_embeddings: 'AI embeddings',
  ai_transcription: 'AI transcription',
};
export const featureLabel = (f) => FEATURE_LABELS[f] || f || '—';

export const TRANSACTION_LABELS = {
  PACKAGE_CREDIT_GRANTED: 'Plan credits granted',
  PACKAGE_CREDIT_RESET: 'Plan credits renewed',
  ADDON_PURCHASE: 'Credits purchased',
  AI_USAGE: 'AI usage',
  ADMIN_ADJUSTMENT: 'Adjustment by support',
  REFUND: 'Refund',
  PLATFORM_CREDIT_ADDED: 'Platform credits added',
  PLATFORM_CREDIT_REMOVED: 'Platform credits removed',
};
export const transactionLabel = (t) => TRANSACTION_LABELS[t] || t;

export const BUCKET_LABELS = { PACKAGE: 'Plan', PURCHASED: 'Purchased', PLATFORM: 'Platform' };

export const fmtCredits = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString());
export const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const fmtMoney = (amount, currency) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency || ''}`.trim();
  }
};
