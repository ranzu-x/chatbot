/**
 * The one line under a subscriber's name in the Inbox chat header: their
 * phone number when there is one, otherwise their username, email, or the
 * channel's own id — whatever best identifies them on that channel.
 */
const isHiddenWaId = (v) => /^[A-Z]{2}\.\d/.test(String(v || '')); // a WhatsApp username's business-scoped id

function profileUsername(profile) {
  let p = profile;
  if (typeof p === 'string') {
    try { p = JSON.parse(p); } catch { p = null; }
  }
  const u = p && typeof p === 'object' ? (p.username || p.user_name || p.ig_username || null) : null;
  return u ? String(u).replace(/^@/, '') : null;
}

export function chatHeaderIdentifier(conv) {
  if (!conv) return '';
  const platform = String(conv.platform || conv.integrationPlatform || conv.contactPlatform || '').toUpperCase();
  const phone = conv.contactPhone || conv.phone_number || null;
  if (phone) return String(phone).startsWith('+') ? phone : `+${String(phone).replace(/^\+/, '')}`;

  const username = conv.contactUsername || profileUsername(conv.contactPlatformProfile);
  if (username) return `@${String(username).replace(/^@/, '')}`;

  const ext = conv.contactExternalId || conv.external_id || '';
  // A WhatsApp id is the number itself, unless the person hides it behind a username.
  if (platform === 'WHATSAPP' && ext && /^\d{6,}$/.test(ext) && !isHiddenWaId(ext)) return `+${ext}`;
  if (conv.contactEmail) return conv.contactEmail;
  if (platform === 'WEBCHAT') return 'Website visitor';
  if (platform === 'WHATSAPP' && isHiddenWaId(ext)) return 'Number hidden';
  return ext ? `ID ${ext}` : '';
}
