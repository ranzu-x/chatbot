// Single source of truth for "what host do I fetch dashboard-uploaded assets
// (chat widget logos, etc) from" — six components used to compute this
// independently via `import.meta.env.VITE_API_URL?.replace('/api/v1', '')`,
// which silently breaks whenever VITE_API_URL is set to a relative path
// (e.g. `/api/v1`, used behind a reverse proxy): `'/api/v1'.replace('/api/v1',
// '')` is `''`, a falsy string, so every one of those components fell back to
// a hardcoded `http://localhost:5000` regardless of the real deployed host.
// This is why a widget's logo could preview correctly in production's actual
// live embed (widget.js derives its own base URL from its own <script src>
// at runtime, independent of this env var entirely) while still rendering
// broken in the dashboard's own preview/thumbnail.
export function getBackendOrigin() {
  const raw = import.meta.env.VITE_API_URL;
  if (!raw) return window.location.origin;
  try {
    // Absolute form, e.g. "http://localhost:5000/api/v1" -> origin only.
    return new URL(raw).origin;
  } catch {
    // Relative form, e.g. "/api/v1" -> same-origin as this page, which is
    // exactly where a same-origin-proxied backend actually lives.
    return window.location.origin;
  }
}

// Resolves a possibly-relative asset URL (as stored in the DB, e.g.
// "/uploads/file-123.png") against the real backend origin. Absolute URLs
// and data: URIs pass through unchanged.
export function resolveAssetUrl(url) {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return `${getBackendOrigin()}${url.startsWith('/') ? '' : '/'}${url}`;
}
