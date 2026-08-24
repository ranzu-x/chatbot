import { useState, useEffect, useCallback } from 'react';
import { metaAppAPI } from '../services/api';

/**
 * Loads the Facebook JS SDK dynamically and initialises it with the
 * agency's App ID fetched from the backend.
 *
 * Returns:
 *   fbReady   – true once window.FB is available and initialised
 *   appId     – the Meta App ID (or null if not configured)
 *   sdkError  – error message if App ID is missing / SDK fails
 *   login     – function(scope, callback) — wraps FB.login
 */
export default function useFacebookSDK() {
  const [fbReady, setFbReady]   = useState(false);
  const [appId, setAppId]       = useState(null);
  const [sdkError, setSdkError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Fetch App ID from backend
      try {
        const res = await metaAppAPI.getAppId();
        if (cancelled) return;
        const id = res.data.appId;
        setAppId(id);

        // 2. Load FB SDK if not already loaded
        if (!window.FB) {
          await new Promise((resolve, reject) => {
            window.fbAsyncInit = () => {
              window.FB.init({ appId: id, cookie: true, xfbml: false, version: 'v19.0' });
              resolve();
            };
            const script = document.createElement('script');
            script.src = 'https://connect.facebook.net/en_US/sdk.js';
            script.async = true;
            script.defer = true;
            script.onerror = reject;
            document.body.appendChild(script);
          });
        } else {
          // Already loaded — re-init with current appId
          window.FB.init({ appId: id, cookie: true, xfbml: false, version: 'v19.0' });
        }

        if (!cancelled) setFbReady(true);
      } catch (err) {
        if (!cancelled) setSdkError(err.response?.data?.message || 'Failed to load Facebook SDK');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const login = useCallback((scope, callback) => {
    if (!window.FB) return;
    window.FB.login((response) => {
      if (response.authResponse) {
        callback(null, response.authResponse.accessToken, response.authResponse);
      } else {
        callback(response.status === 'not_authorized'
          ? 'Please authorise the app to continue.'
          : 'Login was cancelled.');
      }
    }, { scope, return_scopes: true });
  }, []);

  return { fbReady, appId, sdkError, login };
}
