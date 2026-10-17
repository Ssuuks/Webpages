/* 오프라인 캐시 — 엔진 파일은 네트워크 우선(실패하면 캐시), 라이브러리·폰트는 캐시 우선.
   여행 데이터는 IndexedDB에 있으므로 GitHub API·날씨·지도 타일은 여기서 다루지 않는다. */
const VERSION = 'travel-v1.0.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './assets/style.css', './assets/app.js', './assets/util.js', './assets/store.js', './assets/github.js',
  './assets/model.js', './assets/validate.js', './assets/importer.js', './assets/prompts.js', './assets/ics.js',
  './assets/weather.js', './assets/map.js', './assets/ui.js', './assets/v-trip.js', './assets/v-more.js', './assets/v-import.js',
  './assets/prompts/new-trip.txt', './assets/prompts/edit-trip.txt', './assets/prompts/add-places.txt',
  './assets/prompts/bookings.txt', './assets/prompts/past-trip.txt',
  './assets/icon.svg', './assets/icon-192.png', './assets/icon-180.png',
  './samples/demo.json', './schema/trip.v1.json',
  './vendor/leaflet-1.9.4/leaflet.js', './vendor/leaflet-1.9.4/leaflet.css',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('travel-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONT_HOSTS.includes(url.hostname)) { e.respondWith(cacheFirst(req)); return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/vendor/')) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
function cacheFirst(req) {
  return caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  }));
}
