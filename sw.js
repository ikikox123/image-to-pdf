/* 離線快取：只快取站內檔案，cache-first。
 * 改版時務必把 VERSION 改掉：瀏覽器發現 sw.js 內容變了才會安裝新版，並在 activate 時刪掉舊版快取。 */
var VERSION = 'pdf-tool-v2.1';
var FILES = [
  './', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './vendor/pdf-lib.min.js', './vendor/Sortable.min.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './licenses/index.html', './licenses/pdf-lib.LICENSE.txt', './licenses/pdf-lib-standard-fonts.LICENSE.txt',
  './licenses/pdf-lib-upng.LICENSE.txt', './licenses/pako.LICENSE.txt', './licenses/tslib.LICENSE.txt',
  './licenses/sortablejs.LICENSE.txt'
];
self.addEventListener('install', function (e) {
  // cache: 'reload' 確保抓的是伺服器上的新檔，不是瀏覽器 HTTP 快取裡的舊檔
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('pdf-tool-') === 0 && k !== VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (r) {
      if (r) return r;
      if (req.mode === 'navigate') return c.match('./index.html');   // 離線時任何站內網址都回主頁
      return fetch(req);
    });
  }));
});
