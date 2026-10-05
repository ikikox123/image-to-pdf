/* 離線快取（cache-first），保證「HTML 與 JS 永遠同一版」：
 * - 所有資源網址都帶 ?v=版本（與 index.html 一致），舊版快取裡的檔案不可能被新版頁面拿到。
 * - 安裝時用 cache:'reload' 直接向伺服器拿，並檢查 index.html／app.js 的版本號；不一致就安裝失敗、繼續用舊版整套。
 * - 改版：用 tools/bump_version.py 一次改 index.html、app.js、sw.js 的版本號。 */
var V = '2.2';
var VERSION = 'pdf-tool-v' + V;
var ASSETS = [
  'style.css?v=' + V, 'app.js?v=' + V, 'vendor/pdf-lib.min.js?v=' + V, 'vendor/Sortable.min.js?v=' + V, 'manifest.webmanifest?v=' + V,
  'icons/icon-192.png', 'icons/icon-512.png',
  'licenses/index.html', 'licenses/pdf-lib.LICENSE.txt', 'licenses/pdf-lib-standard-fonts.LICENSE.txt',
  'licenses/pdf-lib-upng.LICENSE.txt', 'licenses/pako.LICENSE.txt', 'licenses/tslib.LICENSE.txt', 'licenses/sortablejs.LICENSE.txt'
];
function get(url) {
  return fetch(new Request(url, { cache: 'reload' })).then(function (r) {
    if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
    return r;
  });
}
function mustContain(resp, needle, what) {
  return resp.clone().text().then(function (t) {
    if (t.indexOf(needle) < 0) throw new Error(what + ' 不是 v' + V + '（伺服器或 CDN 還沒更新完），這次不安裝');
    return resp;
  });
}
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    // 版本號放在網址裡（?v=），即使瀏覽器不支援 cache:'reload' 也不會拿到 HTTP 快取裡的舊檔
    var html = get('index.html?v=' + V).then(function (r) { return mustContain(r, '<meta name="app-version" content="' + V + '">', 'index.html'); });
    var js = get('app.js?v=' + V).then(function (r) { return mustContain(r, "APP_VERSION = '" + V + "'", 'app.js'); });
    var others = ASSETS.filter(function (u) { return u.indexOf('app.js') !== 0; }).map(function (u) { return get(u).then(function (r) { return [u, r]; }); });
    return Promise.all([html, js].concat(others)).then(function (rs) {
      var htmlResp = rs[0], jsResp = rs[1];
      return Promise.all([
        c.put('./', htmlResp.clone()), c.put('./index.html', htmlResp.clone()), c.put('app.js?v=' + V, jsResp)
      ].concat(rs.slice(2).map(function (p) { return c.put(p[0], p[1]); })));
    });
  }).then(function () { return self.skipWaiting(); })
    .catch(function (err) { return caches.delete(VERSION).then(function () { throw err; }); }));
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
    if (req.mode === 'navigate') {
      // 頁面：一律用本版快取的 HTML（授權頁等其他頁面照原網址找）；離線時任何站內網址都回主頁
      return c.match(req, { ignoreSearch: true }).then(function (r) { return r || c.match('./index.html'); })
        .then(function (r) { return r || fetch(req); });
    }
    // 其他資源：網址（含 ?v=）必須完全相符，避免拿到別版的檔案
    return c.match(req).then(function (r) { return r || fetch(req); });
  }));
});
