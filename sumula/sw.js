/* Guarda a súmula no aparelho para abrir sem internet.
   Com internet, sempre busca a versão mais nova (espera no máximo 3,5 s e usa a guardada se a rede estiver lenta).
   Nunca guarda nem intercepta as chamadas ao Apps Script (script.google.com). */
var CACHE = 'sumula-am-0.7.1';
var BASE = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(BASE.map(function (u) { return c.add(u).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;
  var u = new URL(r.url);
  var ok = u.origin === self.location.origin || u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  if (!ok) return;
  e.respondWith(
    new Promise(function (resolve) {
      var done = false;
      var fromCache = function () { return caches.match(r, { ignoreSearch: true }).then(function (m) { return m || (r.mode === 'navigate' ? caches.match('index.html') : null); }); };
      var timer = setTimeout(function () { fromCache().then(function (m) { if (m && !done) { done = true; resolve(m); } }); }, 3500);
      fetch(r).then(function (res) {
        clearTimeout(timer);
        if (res && (res.ok || res.type === 'opaque')) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, cp); }); }
        if (!done) { done = true; resolve(res); }
      }).catch(function () {
        clearTimeout(timer);
        fromCache().then(function (m) { if (!done) { done = true; resolve(m || Response.error()); } });
      });
    })
  );
});
