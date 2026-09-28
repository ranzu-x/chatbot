import { useEffect, useState } from 'react';
import { publicSiteAPI } from '../services/api';

/**
 * What this address is (chatbot_api/routes/resellerSite.js GET /public/site):
 *   { loading, kind: 'MAIN' | 'RESELLER', brand?, site?, plans?, allowRegistration? }
 * A Reseller's domain shows its own landing page, pricing and branding; the
 * main-domain blog is not shown there. Fetched once per page load and shared.
 */
let cached = null;
let pending = null;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A failed lookup is retried and never cached: showing the platform's own page
// on a Reseller's address because of one network hiccup would be wrong.
async function fetchWithRetry() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await publicSiteAPI.get();
      cached = { kind: 'MAIN', ...res.data };
      return cached;
    } catch {
      if (attempt < 2) await wait(700 * (attempt + 1));
    }
  }
  return { kind: 'MAIN', error: true };
}

function load() {
  if (cached) return Promise.resolve(cached);
  if (!pending) pending = fetchWithRetry().finally(() => { pending = null; });
  return pending;
}

export default function usePublicSite() {
  const [state, setState] = useState(() => (cached ? { loading: false, ...cached } : { loading: true, kind: 'MAIN' }));
  useEffect(() => {
    if (cached) return undefined;
    let alive = true;
    load().then((data) => { if (alive) setState({ loading: false, ...data }); });
    return () => { alive = false; };
  }, []);
  return state;
}
