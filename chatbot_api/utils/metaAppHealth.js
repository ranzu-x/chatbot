/** Validates a Meta app's credentials against the Graph API — shared by the
 * manual "Test Connection" button (routes/metaapp.js, routes/metaapppool.js)
 * and the periodic health-check scheduler (utils/metaAppHealthScheduler.js). */
export async function testMetaAppCredentials(appId, appSecret) {
  if (!appId || !appSecret) {
    return { healthy: false, error: { message: "App ID and App Secret are required" } };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${appId}?access_token=${appId}|${appSecret}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    if (data.error) {
      return { healthy: false, error: data.error, isDisabled: classifyAppDisabledError(data.error) };
    }
    return { healthy: true, appName: data.name };
  } catch (err) {
    return { healthy: false, error: { message: err.message } };
  }
}

/** Best-effort classification of a Graph API error on the app's own
 * self-lookup call as "app is disabled/restricted" vs some other transient
 * failure. Meta doesn't document an authoritative error code for a disabled
 * app, so this is a heuristic — treat as a hint, refine once real payloads
 * are observed in production, not as ground truth. */
function classifyAppDisabledError(error) {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  return (
    msg.includes("disabled") ||
    msg.includes("restricted") ||
    msg.includes("has been blocked") ||
    error.code === 190 ||
    error.code === 10
  );
}

/** Best-effort detection that an Embedded Signup / onboarding failure is
 * Tech-Provider-scoped rather than a generic app/token error — matches the
 * observed real-world pattern: existing connections keep working, only NEW
 * onboarding is rejected. Not authoritative; the manual admin toggle
 * (PATCH /settings/meta-app-pool/:id/onboarding-block) is the reliable path.
 * Refine these substrings once a real captured Meta error payload is
 * available. */
export function looksLikeTechProviderSuspension(graphError) {
  if (!graphError) return false;
  const msg = (graphError.message || "").toLowerCase();
  return (
    msg.includes("tech provider") ||
    msg.includes("solution partner") ||
    msg.includes("not permitted to onboard") ||
    (msg.includes("onboard") && msg.includes("restrict"))
  );
}
