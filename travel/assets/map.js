/* 지도 — Leaflet 1.9.4(저장소에 고정 포함) + OpenStreetMap 타일. 출처 표기 필수. */
import { h, hasXY, onColor } from './util.js';

let loading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;
  const base = new URL('../vendor/leaflet-1.9.4/', import.meta.url).href;
  loading = new Promise((resolve, reject) => {
    document.head.appendChild(h('link', { rel: 'stylesheet', href: base + 'leaflet.css' }));
    const s = h('script', { src: base + 'leaflet.js' });
    s.onload = () => resolve(window.L);
    s.onerror = () => { loading = null; reject(new Error('지도 라이브러리를 불러오지 못했어요 (오프라인이면 한 번 온라인에서 지도를 열어야 해요)')); };
    document.head.appendChild(s);
  });
  return loading;
}

/* points: [{lat,lng,label,color,onClick,num}], route: true면 순서대로 선 연결 */
export async function drawMap(el, points, opts = {}) {
  const L = await loadLeaflet();
  if (el._map) { el._map.remove(); el._map = null; }
  const pts = points.filter(hasXY);
  const map = L.map(el, { zoomControl: true, attributionControl: true });
  el._map = map;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const color = opts.color || '#EE8A1E';
  const latlngs = [];
  pts.forEach((p) => {
    const ll = [p.lat, p.lng]; latlngs.push(ll);
    let m;
    if (p.num != null) {
      m = L.marker(ll, { icon: L.divIcon({ className: 'mapnum', html: '', iconSize: [26, 26] }), title: p.label, keyboard: true });
      m.on('add', () => { const e = m.getElement(); if (e) { e.textContent = String(p.num); e.style.background = p.color || color; e.style.color = onColor(p.color || color); } });
    } else {
      m = L.circleMarker(ll, { radius: p.big ? 9 : 7, color: '#fff', weight: 2, fillColor: p.color || color, fillOpacity: 0.95 });
    }
    const pop = h('div.mappop', h('b', p.label || ''), p.sub ? h('div', p.sub) : null);
    if (p.onClick) pop.appendChild(h('button.linkish', { type: 'button', onclick: () => p.onClick() }, '자세히'));
    m.bindPopup(pop);
    m.addTo(map);
  });
  if (opts.route && latlngs.length > 1) L.polyline(latlngs, { color, weight: 3, opacity: 0.8, dashArray: '6 6' }).addTo(map);
  if (opts.here && hasXY(opts.here)) L.circleMarker([opts.here.lat, opts.here.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).bindPopup('내 위치').addTo(map);
  if (latlngs.length) map.fitBounds(latlngs, { padding: [28, 28], maxZoom: 15 });
  else map.setView(opts.center || [33.38, 126.55], 9);
  setTimeout(() => map.invalidateSize(), 50);
  return map;
}
