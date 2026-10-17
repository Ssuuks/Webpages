/* 공통 도구 — DOM 생성, 안전한 텍스트, 시간·거리 계산, 지도 링크 */

/* ── DOM ───────────────────────────────────────────── */
/* h('div.cls#id', {attrs}, ...children). 문자열 자식은 항상 텍스트 노드. innerHTML은 쓰지 않는다. */
export function h(tag, attrs, ...kids) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, v) => {
    if (t === '.') el.classList.add(v); else el.id = v;
  });
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs); attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
      }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'href' || k === 'src') {
        const safe = k === 'href' ? safeUrl(v) : v;
        if (safe) el.setAttribute(k, safe);
      } else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export const $ = (sel, root = document) => root.querySelector(sel);

/* 짧은 서식: **굵게** 또는 *굵게*, 줄바꿈, {{secret:키}} 치환. 결과는 노드 배열. */
export function rich(text, secrets) {
  const out = [];
  const lines = String(text == null ? '' : text).split('\n');
  lines.forEach((line, li) => {
    if (li) out.push(document.createElement('br'));
    const re = /\{\{secret:([\w.-]+)\}\}|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;
    let last = 0, m;
    while ((m = re.exec(line))) {
      if (m.index > last) out.push(document.createTextNode(line.slice(last, m.index)));
      if (m[1]) {
        const v = secrets && secrets[m[1]];
        out.push(v ? h('span.secret', v) : h('span.secret.miss', { title: '비밀값 ' + m[1] + ' 미입력' }, '···'));
      } else out.push(h('b', m[2] || m[3]));
      last = re.lastIndex;
    }
    if (last < line.length) out.push(document.createTextNode(line.slice(last)));
  });
  return out;
}
/* 서식 없는 평문(공유·클립보드용) */
export function plain(text, secrets) {
  return String(text == null ? '' : text)
    .replace(/\{\{secret:([\w.-]+)\}\}/g, (_, k) => (secrets && secrets[k]) || '···')
    .replace(/\*\*([^*]+)\*\*|\*([^*\n]+)\*/g, (_, a, b) => a || b);
}

/* 링크 스킴 허용 목록 */
const SAFE_SCHEMES = ['http:', 'https:', 'tel:', 'nmap:', 'kakaomap:'];
export function safeUrl(u) {
  if (u == null) return null;
  const s = String(u).trim();
  if (!s) return null;
  if (s.startsWith('#') || s.startsWith('./') || s.startsWith('../')) return s;
  try {
    const url = new URL(s, location.href);
    return SAFE_SCHEMES.includes(url.protocol) ? s : null;
  } catch { return null; }
}
export function telHref(phone) {
  const p = String(phone || '').replace(/[^\d+]/g, '');
  return p ? 'tel:' + p : null;
}

/* ── 데이터 ─────────────────────────────────────────── */
export const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
export function stable(o) {             // 키 순서와 무관한 비교용 문자열
  return JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((a, kk) => { a[kk] = v[kk]; return a; }, {}) : v));
}
export const same = (a, b) => stable(a) === stable(b);
export function uid(prefix = 'x') {
  return prefix + '-' + Math.random().toString(36).slice(2, 8);
}
export const byId = (arr, id) => (arr || []).find((x) => x && x.id === id) || null;

/* ── 시간 ───────────────────────────────────────────── */
export const WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const WEEK_KO = { sun: '일', mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토' };
export const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const RE_TIME = /^([01]\d|2[0-4]):[0-5]\d$/;
export const RE_DT = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

export function mins(t) {
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}
export function hhmm(min) {
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}
export function normTime(t) {
  const m = /^\s*(\d{1,2})\s*[:.]?\s*(\d{2})\s*$/.exec(t || '');
  return m ? m[1].padStart(2, '0') + ':' + m[2] : (t || '').trim();
}
export function weekday(date) {          // 'YYYY-MM-DD' → 'mon'
  const [y, mo, d] = date.split('-').map(Number);
  return WEEK[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
}
export function addDays(date, n) {
  const [y, mo, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export function daysBetween(a, b) {      // b - a (일)
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
export function dateRange(start, end) {
  const out = []; if (!RE_DATE.test(start || '') || !RE_DATE.test(end || '')) return out;
  for (let d = start, i = 0; d <= end && i < 400; d = addDays(d, 1), i++) out.push(d);
  return out;
}
export function fmtDate(date, withWeek = true) {   // '11.21 (토)'
  if (!date) return '';
  const [, mo, d] = date.split('-');
  return (+mo) + '.' + (+d) + (withWeek ? ' (' + WEEK_KO[weekday(date)] + ')' : '');
}
export function fmtDT(dt) {              // '11.20 (금) 15:45'
  if (!dt) return '';
  const [d, t] = dt.split('T');
  return fmtDate(d) + (t ? ' ' + t : '');
}

/* 시간대: 현지 벽시계 시각 ↔ epoch */
const dtfCache = {};
function dtf(tz) {
  return dtfCache[tz] || (dtfCache[tz] = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }));
}
function partsOf(epoch, tz) {
  const p = {}; for (const x of dtf(tz).formatToParts(new Date(epoch))) p[x.type] = x.value;
  return p;
}
export function nowIn(tz, epoch = Date.now()) {    // {date, time, min, dt}
  let p;
  try { p = partsOf(epoch, tz || 'UTC'); } catch { p = partsOf(epoch, 'UTC'); }
  const hh = p.hour === '24' ? '00' : p.hour;
  const date = `${p.year}-${p.month}-${p.day}`, time = `${hh}:${p.minute}`;
  return { date, time, min: (+hh) * 60 + (+p.minute), dt: date + 'T' + time };
}
export function toEpoch(dt, tz) {        // 'YYYY-MM-DDTHH:MM' (tz 현지) → ms
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(dt || '');
  if (!m) return NaN;
  const guess = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
  let t = guess;
  for (let i = 0; i < 2; i++) {          // 오프셋 보정 두 번이면 DST 경계도 수렴
    const n = nowIn(tz, t);
    const shown = Date.UTC(+n.date.slice(0, 4), n.date.slice(5, 7) - 1, +n.date.slice(8, 10), n.min / 60 | 0, n.min % 60);
    t += guess - shown;
  }
  return t;
}
export function fromEpoch(ms, tz) { return nowIn(tz, ms).dt; }
export function fmtDur(ms) {
  if (ms <= 0) return '0분';
  const m = Math.round(ms / 60000), d = Math.floor(m / 1440), hr = Math.floor((m % 1440) / 60), mi = m % 60;
  return (d ? d + '일 ' : '') + (hr ? hr + '시간 ' : '') + (d ? '' : mi + '분');
}

/* ── 거리 ───────────────────────────────────────────── */
export function hav(a, b, c, d) {
  const t = Math.PI / 180, x = (c - a) * t, y = (d - b) * t;
  const q = Math.sin(x / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(y / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(q));
}
export const hasXY = (p) => p && typeof p.lat === 'number' && typeof p.lng === 'number';
export function distKm(a, b) { return hasXY(a) && hasXY(b) ? hav(a.lat, a.lng, b.lat, b.lng) : null; }
export function fmtKm(k) {
  if (k == null) return '';
  return k < 1 ? Math.round(k * 100) * 10 + 'm' : (k < 20 ? k.toFixed(1) + 'km' : Math.round(k) + 'km');
}
export const estMin = (km) => Math.round(km * 1.3 / 40 * 60);   // 직선 × 1.3, 시속 40km
export function fmtLeg(km) {
  return km == null ? '' : fmtKm(km) + ' · 추정 ' + Math.max(1, estMin(km)) + '분';
}

/* ── 지도 링크 ──────────────────────────────────────── */
export function mapLinks(p) {
  const name = p.name || '';
  const n = encodeURIComponent(name);
  const xy = hasXY(p);
  const out = [];
  if (xy) out.push({ label: '카카오맵', href: `https://map.kakao.com/link/to/${n},${p.lat},${p.lng}` });
  else out.push({ label: '카카오맵', href: `https://map.kakao.com/link/search/${n}` });
  if (xy) out.push({
    label: '네이버지도',
    href: `nmap://route/car?dlat=${p.lat}&dlng=${p.lng}&dname=${n}&appname=${encodeURIComponent(location.hostname || 'travel-app')}`,
    fallback: `https://map.naver.com/p/search/${n}`,
  });
  else out.push({ label: '네이버지도', href: `https://map.naver.com/p/search/${n}` });
  let g;
  if (xy) g = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  else if (p.links && p.links.map) g = p.links.map;
  else g = `https://www.google.com/maps/search/?api=1&query=${n}`;
  out.push({ label: '구글맵', href: g });
  return out;
}
export function googlePlaceUrl(p) {
  if (p.pid) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.name) + '&query_place_id=' + encodeURIComponent(p.pid);
  if (hasXY(p)) return 'https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lng;
  if (p.links && p.links.map) return p.links.map;
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.name || '');
}

/* 구글 지도 링크 해석 (나트랑 앱 로직) */
export function parseMapLink(u) {
  const r = { url: (u || '').trim() };
  let t = r.url, m;
  try { t = decodeURIComponent(t); } catch { /* 그대로 */ }
  if (/maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs/.test(t)) { r.short = true; return r; }
  if ((m = t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/))) { r.lat = +m[1]; r.lng = +m[2]; }
  else if ((m = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/))) { r.lat = +m[1]; r.lng = +m[2]; }
  else if ((m = t.match(/[?&](?:query|q|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/))) { r.lat = +m[1]; r.lng = +m[2]; }
  if ((m = t.match(/\/maps\/place\/([^/@?]+)/))) r.name = m[1].replace(/\+/g, ' ').trim();
  else if ((m = t.match(/[?&](?:query|q)=([^&]+)/)) && !/^-?\d+\.\d+,/.test(m[1])) r.name = m[1].replace(/\+/g, ' ').trim();
  if ((m = t.match(/query_place_id=([A-Za-z0-9_-]+)/)) || (m = t.match(/place_id:([A-Za-z0-9_-]+)/))) r.pid = m[1];
  return r;
}

/* ── 브라우저 ───────────────────────────────────────── */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 폴백 */ }
  const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove(); return ok;
}
export function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type: type + ';charset=utf-8' });
  const a = h('a', { download: name });
  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
let toastTimer;
export function toast(msg, ms = 2600) {
  let el = document.getElementById('toast');
  if (!el) { el = h('div#toast', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(el); }
  el.textContent = msg; el.dataset.on = '1';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.dataset.on = '0'; }, ms);
}
export function utf8ToB64(s) {
  const bytes = new TextEncoder().encode(s); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function b64ToUtf8(b) {
  const bin = atob(String(b).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* 강조색 위 글자색: 밝은 색이면 진한 글자, 어두운 색이면 흰 글자 (WCAG 상대 휘도) */
export function onColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#1E2224';
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const n = parseInt(m[1], 16);
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (L + 0.05) / (0.0144 + 0.05) >= (1.05) / (L + 0.05) ? '#1E2224' : '#FFFFFF';
}
