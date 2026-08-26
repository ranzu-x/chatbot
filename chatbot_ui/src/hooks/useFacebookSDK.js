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
  const [configId, setConfigId] = useState(null);
  const [sdkError, setSdkError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1. Fetch App ID & Config ID from backend
        const res = await metaAppAPI.getAppId();
        if (cancelled) return;
        const id = res.data.appId;
        const cfgId = res.data.configId || null;
        setAppId(id);
        setConfigId(cfgId);

        if (!id) {
          setSdkError('Meta App ID is not configured');
          return;
        }

        // 2. Prepare fbAsyncInit hook
        window.fbAsyncInit = function () {
          if (window.FB) {
            window.FB.init({
              appId: id,
              cookie: true,
              xfbml: false,
              version: 'v21.0',
            });
            if (!cancelled) setFbReady(true);
          }
        };

        // 3. If window.FB is already available, init directly
        if (window.FB) {
          window.FB.init({
            appId: id,
            cookie: true,
            xfbml: false,
            version: 'v21.0',
          });
          if (!cancelled) setFbReady(true);
          return;
        }

        // 4. Inject Facebook SDK script if not present
        if (!document.getElementById('facebook-jssdk')) {
          const script = document.createElement('script');
          script.id = 'facebook-jssdk';
          script.src = 'https://connect.facebook.net/en_US/sdk.js';
          script.async = true;
          script.defer = true;
          script.onload = () => {
            if (window.FB) {
              window.FB.init({
                appId: id,
                cookie: true,
                xfbml: false,
                version: 'v21.0',
              });
              if (!cancelled) setFbReady(true);
            }
          };
          script.onerror = () => {
            if (!cancelled) setSdkError('Failed to load Meta SDK from connect.facebook.net');
          };
          document.head.appendChild(script);
        }
      } catch (err) {
        if (!cancelled) setSdkError(err.response?.data?.message || 'Meta App not configured');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const login = useCallback((scope, callback) => {
    if (!window.FB) {
      if (callback) callback('Facebook SDK is not ready yet. Please refresh the page.');
      return;
    }
    try {
      window.FB.login((response) => {
        if (response && response.authResponse) {
          callback(null, response.authResponse.accessToken, response.authResponse);
        } else {
          callback(response?.status === 'not_authorized'
            ? 'Please authorise the app to continue.'
            : 'Login was cancelled or closed.');
        }
      }, { scope, return_scopes: true, auth_type: 'rerequest' });
    } catch (err) {
      console.error('FB.login error:', err);
      if (callback) callback(err?.message || 'Failed to initiate Facebook Login');
    }
  }, []);

  return { fbReady, appId, configId, sdkError, login };
}
