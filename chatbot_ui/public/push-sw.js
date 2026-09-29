/* Service worker for dashboard browser notifications (chatbot_ui/src/utils/browserPush.js,
 * chatbot_api/utils/webPush.js). It only handles push + notification clicks — no caching. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'New notification', body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    // A dashboard window the person is looking at already shows the in-app alert.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(data.title || 'New notification', {
      body: data.body || '',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      icon: '/favicon.svg',
      data: { url: data.url || '/inbox' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || '/inbox';
  const target = new URL(path.startsWith('/') && !path.startsWith('//') ? path : '/inbox', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
        await w.focus();
        if ('navigate' in w) { try { await w.navigate(target); } catch { /* cross-scope */ } }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
