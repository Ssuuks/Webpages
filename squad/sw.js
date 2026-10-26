/* 오프라인 캐시 — 게임 파일은 네트워크 우선(실패하면 캐시), 글꼴은 캐시 우선 */
const VERSION = 'squad-v2.0.0';
/* 게임이 불러오는 모든 파일 — tests/run.mjs가 main.js의 import를 따라가며 빠진 것이 없는지 확인한다 */
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './assets/main.js', './assets/core.js', './assets/render.js', './assets/view.js', './assets/sprites.js',
  './assets/audio.js', './assets/music.js', './assets/store.js', './assets/save.js', './assets/roster.js', './assets/caltable.js',
  './assets/icon.svg', './assets/icon-180.png', './assets/icon-192.png', './assets/icon-512.png',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('squad-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONT_HOSTS.includes(url.hostname)) { e.respondWith(cacheFirst(req)); return; }
  if (url.origin !== self.location.origin || !url.pathname.includes('/squad/')) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : null))
    .then((r) => r || Response.error())));
});
function cacheFirst(req) {
  return caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  }));
}
