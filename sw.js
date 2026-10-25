/* LifeLink service worker: offline fallback, light caching, and web push (iPhone, Android browser, desktop).
   Never caches Supabase, Paystack, map tiles or any other site: only files from this site. */
var VERSION = 'll-v1';
var STATIC = 'll-static-' + VERSION;
var PRECACHE = ['offline.html', 'images/lifelink-logo.png', 'images/pwa/icon-192.png'];
var SAFE_LINK = /^[a-z0-9_-]+\.html(?:\?[a-z0-9_=&%.\-]*)?$/i;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(STATIC).then(function (c) {
    return Promise.all(PRECACHE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('ll-static-') === 0 && k !== STATIC; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // Supabase, Paystack, maps: always straight to the network
  if (/\/sw\.js$/.test(url.pathname)) return;
  var isAsset = /\.(?:png|jpe?g|webp|svg|gif|woff2?|ico)$/i.test(url.pathname);
  if (isAsset) {                                                    // pictures and fonts: cache first
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(STATIC).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
    return;
  }
  e.respondWith(fetch(req).then(function (res) {                    // pages, scripts, styles: network first, cache as backup
    if (res && res.ok) { var copy = res.clone(); caches.open(STATIC).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) {
      return hit || (req.mode === 'navigate' ? caches.match('offline.html') : Response.error());
    });
  }));
});

/* ---- web push ---- every push must show a notification (iOS cancels the subscription otherwise) ---- */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { try { d = { body: e.data.text() }; } catch (e2) {} }
  var title = String(d.title || 'LifeLink').slice(0, 100);
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body ? String(d.body).slice(0, 200) : '',
    icon: 'images/pwa/icon-192.png',
    badge: 'images/pwa/icon-192.png',
    tag: d.notification_id ? String(d.notification_id) : undefined,
    data: { link: d.link || '', title: d.title || '' }
  }));
});

function targetFor(data) {
  var link = String((data && data.link) || '').replace(/^\//, '');
  if (!SAFE_LINK.test(link)) return 'home.html';
  var m = /^booking\.html\?id=([^&#]+)/.exec(link);
  if (m && /provider is on the way/i.test((data && data.title) || '')) return 'tracking.html?id=' + m[1];
  return link;
}
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var target = new URL(targetFor(e.notification.data), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
        return c.focus().then(function (w) { return (w && 'navigate' in w) ? w.navigate(target) : null; });
      }
    }
    return self.clients.openWindow(target);
  }));
});
