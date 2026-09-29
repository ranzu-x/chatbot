// Browser (desktop) notifications for this dashboard user — per browser.
// Registers public/push-sw.js, subscribes with the server's VAPID key and
// stores the subscription (POST /me/push/subscribe). The server only pushes
// while the person has no dashboard tab open (chatbot_api/utils/webPush.js).
import { myNotificationsAPI } from '../services/api';

const SW_URL = '/push-sw.js';

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    && window.isSecureContext;
}

/** 'unsupported' | 'denied' | 'on' | 'off' */
export async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyToBytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Asks for permission (must run from a click) and subscribes. Returns the new state. */
export async function enablePush() {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;
  const { data } = await myNotificationsAPI.pushKey();
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with an older server key can't receive — replace it.
  const wanted = keyToBytes(data.publicKey);
  const current = sub?.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
  if (sub && current && (current.length !== wanted.length || current.some((b, i) => b !== wanted[i]))) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
  await myNotificationsAPI.pushSubscribe(sub.toJSON());
  return 'on';
}

export async function disablePush() {
  if (!pushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await myNotificationsAPI.pushUnsubscribe(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
  }
  return 'off';
}

/**
 * On sign-in: if this browser is already subscribed, re-send it so it is
 * linked to whoever is signed in now (another person may have used this
 * browser before). Never asks for permission.
 */
export async function syncPushSubscription() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) await myNotificationsAPI.pushSubscribe(sub.toJSON());
  } catch { /* best effort */ }
}

/** On sign-out: this browser stops getting the previous person's alerts. */
export async function forgetPushSubscription() {
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await myNotificationsAPI.pushUnsubscribe(sub.endpoint).catch(() => {});
      await sub.unsubscribe();
    }
  } catch { /* best effort */ }
}
