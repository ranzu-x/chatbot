import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * useState that lives in the URL query (?key=value), so a refresh, a shared
 * link or the browser Back button returns to the same tab / account / page.
 *
 *   const [tab, setTab] = useUrlState('tab', 'overview');
 *   const [page, setPage] = useUrlState('page', 1, { type: 'number' });
 *
 * The default value is kept out of the URL. Updates replace the history entry
 * (no extra Back steps). Several setters called in the same event all apply:
 * each one reads the address bar as it is right now, not the last render's.
 * `allowed` (optional list) — any other value in the URL reads as the default.
 */
export default function useUrlState(key, defaultValue, { type = 'string', allowed = null } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const allowedKey = allowed ? allowed.join('|') : '';

  const decode = useCallback((raw) => {
    if (raw === null || raw === undefined) return defaultValue;
    if (type === 'number') {
      const n = Number(raw);
      return Number.isFinite(n) ? n : defaultValue;
    }
    if (allowedKey && !allowedKey.split('|').includes(raw)) return defaultValue;
    return raw;
  }, [defaultValue, type, allowedKey]);

  const value = decode(searchParams.get(key));

  const setValue = useCallback((next) => {
    const params = new URLSearchParams(window.location.search);
    const current = decode(params.get(key));
    const resolved = typeof next === 'function' ? next(current) : next;
    if (resolved === current) return;
    if (resolved === defaultValue || resolved === null || resolved === undefined || resolved === '') params.delete(key);
    else params.set(key, String(resolved));
    // Keep any router state the page was opened with (e.g. a "back to" label).
    setSearchParams(params, { replace: true, state: window.history.state?.usr });
  }, [key, defaultValue, decode, setSearchParams]);

  return [value, setValue];
}

/**
 * Removes query keys (e.g. a nested panel's own tab when its parent tab
 * changes, so it doesn't reopen later). Returns a stable function.
 */
export function useClearUrlParams() {
  const [, setSearchParams] = useSearchParams();
  return useCallback((keys) => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    for (const k of keys) if (params.has(k)) { params.delete(k); changed = true; }
    if (changed) setSearchParams(params, { replace: true, state: window.history.state?.usr });
  }, [setSearchParams]);
}
