/* 가족 여행 플래너 — 진입점: 상태, 라우팅, 동기화, 홈·설정 화면 */
import { h, clear, $, clone, same, toast, nowIn, fmtDate, download, RE_DATE, daysBetween, onColor } from './util.js';
import { db, kvGet, kvSet, LS, repoConfig, setRepoConfig, getToken, setToken, secretsFor, adoptLegacySecrets,
  getProfile, setProfile, DEFAULT_PROFILE } from './store.js';
import { getFile, putFile, checkRepo, hasToken } from './github.js';
import { badgeDict, phase, indexEntry } from './model.js';
import { validateTrip } from './validate.js';
import { openSheet, ask, btn, field, input, select, section, empty, pill, closeAllSheets } from './ui.js';
import { viewToday, viewPlan, viewPlaces, viewPrep, viewSos } from './v-trip.js';
import { viewMore } from './v-more.js';
import { viewNew, openImportSheet, saveImported } from './v-import.js';

const APP_VERSION = '1.1.0';
const S = {
  trips: new Map(),        // id → { id, data, base, sha, syncedAt }
  dsRecs: new Map(),       // id → { id, data, base, sha }
  datasets: {},            // id → data
  index: null, indexSha: null,
  status: {},              // tripId → 동기화 메시지
  conflict: {},            // tripId → 원격 파일
  homeMsg: '',
  here: null,
  busy: false,
  lastRouteKey: '',
};

/* ── 기록 ─────────────────────────────────────────── */
const stripTs = (t) => { if (!t) return t; const c = { ...t }; delete c.updatedAt; return c; };
export const isDirty = (rec) => !rec.base || !same(stripTs(rec.data), stripTs(rec.base));
async function putRec(rec) { await db.put('trips', rec); S.trips.set(rec.id, rec); }
async function saveTrip(rec) { rec.data.updatedAt = new Date().toISOString(); await putRec(rec); }
async function putDs(rec) { await db.put('datasets', rec); S.dsRecs.set(rec.id, rec); S.datasets[rec.id] = rec.data; }

/* ── 동기화 ───────────────────────────────────────── */
const tripPath = (id) => `trips/${id}.json`;

async function fetchTrip(id, file) {
  const f = await getFile(file || tripPath(id));
  if (!f || !f.json) return null;
  const rec = { id, data: f.json, base: clone(f.json), sha: f.sha, syncedAt: Date.now() };
  await putRec(rec);
  await ensureDatasets(rec.data);
  return rec;
}
async function fetchDataset(id, file) {
  const f = await getFile(file || `datasets/${id}.json`);
  if (!f || !f.json) return null;
  const rec = { id, data: f.json, base: clone(f.json), sha: f.sha };
  await putDs(rec);
  return rec;
}
async function ensureDatasets(trip) {
  for (const id of (trip.meta && trip.meta.datasets) || []) {
    const r = S.dsRecs.get(id);
    if (!hasToken()) continue;
    try {
      if (!r) await fetchDataset(id);
      else if (!r.base || same(r.data, r.base)) {         // 커밋 안 된 변경이 없을 때만 새 버전 반영
        const f = await getFile(`datasets/${id}.json`);
        if (f && f.json && f.sha !== r.sha) await putDs({ id, data: f.json, base: clone(f.json), sha: f.sha });
      }
    } catch { /* 오프라인 */ }
  }
}

async function syncIndex(manual) {
  if (!hasToken()) { if (manual) toast('저장소 연결이 없어요. [설정]에서 토큰을 넣으세요.'); return; }
  S.busy = true; S.homeMsg = '저장소 확인 중…'; render();
  try {
    const f = await getFile('trips/index.json');
    if (f && f.json) { S.index = f.json; S.indexSha = f.sha; await kvSet('index', S.index); }
    else { S.index = { schema: 'index/v1', trips: [], datasets: [] }; S.indexSha = null; }
    let got = 0;
    for (const e of S.index.trips || []) {
      const rec = S.trips.get(e.id);
      if (!rec) { if (await fetchTrip(e.id, e.file)) got++; }
      else await pullTrip(rec, false, true);
    }
    for (const d of S.index.datasets || []) if (!S.dsRecs.has(d.id)) await fetchDataset(d.id, d.file);
    S.homeMsg = '저장소와 맞췄어요 · ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      + (got ? ` · 새 여행 ${got}개` : '') + (f ? '' : ' · 저장소에 아직 여행 목록이 없어요');
  } catch (e) { S.homeMsg = e.message; if (manual) toast(e.message, 4000); }
  S.busy = false; render();
}

async function pullTrip(rec, manual, quiet) {
  if (!hasToken()) { if (manual) toast('저장소 연결이 없어요. [설정]에서 토큰을 넣으세요.'); return; }
  try {
    const f = await getFile(tripPath(rec.id));
    if (!f || !f.json) { S.status[rec.id] = '저장소에 아직 없는 여행이에요. [커밋]하면 올라가요.'; if (!quiet) render(); return; }
    await ensureDatasets(f.json);
    if (f.sha === rec.sha) {
      S.status[rec.id] = '저장소 확인 ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      delete S.conflict[rec.id];
      if (manual) toast('이미 최신이에요.');
    } else if (!isDirty(rec)) {
      Object.assign(rec, { data: f.json, base: clone(f.json), sha: f.sha, syncedAt: Date.now() });
      await putRec(rec);
      delete S.conflict[rec.id];
      S.status[rec.id] = '저장소의 새 버전을 반영했어요';
      if (!quiet) toast('저장소의 새 버전을 반영했어요.');
    } else {
      S.conflict[rec.id] = f;
      S.status[rec.id] = '저장소에 새 버전이 있지만 이 기기에 커밋 안 된 변경이 있어 자동 반영하지 않았어요.';
      if (manual) await resolveConflict(rec);
    }
  } catch (e) { S.status[rec.id] = e.message; if (manual) toast(e.message, 4000); }
  if (!quiet) render();
}
async function resolveConflict(rec) {
  const f = S.conflict[rec.id]; if (!f) return;
  const remoteAt = f.json.updatedAt ? new Date(f.json.updatedAt).toLocaleString('ko-KR') : '알 수 없음';
  const v = await ask(`저장소 버전(${remoteAt})과 이 기기의 커밋 안 된 변경이 달라요.\n저장소 것으로 바꾸면 이 기기의 변경은 사라져요.`,
    [{ label: '이 기기 것 유지', value: 'local' }, { label: '저장소 것으로 바꾸기', value: 'remote', danger: true }], '동기화 충돌');
  if (v === 'remote') {
    Object.assign(rec, { data: f.json, base: clone(f.json), sha: f.sha, syncedAt: Date.now() });
    await putRec(rec); toast('저장소 내용으로 바꿨어요.');
  } else if (v === 'local') {
    Object.assign(rec, { base: clone(f.json), sha: f.sha });   // 이제 기준은 저장소 최신본, 커밋하면 이 기기 내용이 올라감
    await putRec(rec); toast('이 기기 내용을 유지했어요. [커밋]하면 저장소에 반영돼요.');
  } else return;
  delete S.conflict[rec.id];
  S.status[rec.id] = '';
  render();
}

async function commitTrip(rec) {
  if (!hasToken()) {
    if (await ask('저장소 연결(토큰)이 없어서 커밋할 수 없어요. 지금은 이 기기에만 저장돼 있어요.', [{ label: '닫기', value: false }, { label: '설정 열기', value: true, primary: true }])) location.hash = '#/settings';
    return;
  }
  const v = validateTrip(rec.data, { datasets: S.datasets, skipChecks: true });
  if (!v.ok) {
    await ask('검사 오류가 있어 커밋하지 않았어요.\n' + v.errors.slice(0, 6).map((e) => '· ' + e.msg).join('\n'), [{ label: '닫기', value: true, primary: true }], '커밋 불가');
    return;
  }
  S.busy = true; render();
  try {
    const path = tripPath(rec.id);
    const f = await getFile(path);
    if (f && f.sha !== rec.sha) {
      const ok = await ask('저장소에 이 기기가 모르는 변경이 있어요(다른 기기에서 커밋됨). 이 기기 내용으로 덮어쓸까요?\n취소하고 [불러오기]로 먼저 확인할 수도 있어요.',
        [{ label: '취소', value: false }, { label: '덮어쓰기', value: true, danger: true }], '덮어쓰기 확인');
      if (!ok) return;
    }
    rec.data.updatedAt = new Date().toISOString();
    const isNew = !f;
    const sha = await putFile(path, rec.data, f ? f.sha : null, `${rec.data.meta.title || rec.id} ${isNew ? '추가' : '갱신'} ${new Date().toLocaleString('ko-KR')}`);
    Object.assign(rec, { sha, base: clone(rec.data), syncedAt: Date.now() });
    await putRec(rec);
    for (const id of rec.data.meta.datasets || []) await commitDataset(id);
    await updateIndex([rec.data]);
    delete S.conflict[rec.id];
    S.status[rec.id] = '커밋함 ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    toast('저장소에 커밋했어요.');
  } catch (e) { toast(e.message, 5000); S.status[rec.id] = e.message; }
  finally { S.busy = false; render(); }
}
async function commitDataset(id) {
  const r = S.dsRecs.get(id);
  if (!r || (r.base && same(r.data, r.base) && r.sha)) return;
  const path = `datasets/${id}.json`;
  const f = await getFile(path);
  const sha = await putFile(path, r.data, f ? f.sha : null, `데이터셋 ${r.data.title || id} ${f ? '갱신' : '추가'}`);
  await putDs({ ...r, base: clone(r.data), sha });
}
async function updateIndex(trips) {
  const f = await getFile('trips/index.json');
  const idx = (f && f.json) || { schema: 'index/v1', trips: [], datasets: [] };
  const before = JSON.stringify(idx);
  idx.trips = idx.trips || []; idx.datasets = idx.datasets || [];
  for (const t of trips) {
    const e = indexEntry(t), i = idx.trips.findIndex((x) => x.id === t.id);
    if (i < 0) idx.trips.push(e); else idx.trips[i] = { ...idx.trips[i], ...e };
    for (const id of t.meta.datasets || []) {
      const d = S.datasets[id];
      if (d && !idx.datasets.some((x) => x.id === id)) idx.datasets.push({ id, title: d.title || id, file: `datasets/${id}.json` });
    }
  }
  idx.trips.sort((a, b) => String(b.start).localeCompare(String(a.start)));
  if (JSON.stringify(idx) === before && f) return;
  idx.updatedAt = new Date().toISOString();
  S.indexSha = await putFile('trips/index.json', idx, f ? f.sha : null, '여행 목록 갱신');
  S.index = idx; await kvSet('index', idx);
}
/* 이 기기의 커밋 안 된 여행·데이터셋 전부 커밋 (가져온 묶음 올리기) */
async function commitAll() {
  if (!hasToken()) { toast('먼저 저장소 연결(토큰)을 설정하세요.'); return; }
  const dirty = [...S.trips.values()].filter(isDirty);
  if (!dirty.length && ![...S.dsRecs.values()].some((r) => !r.sha)) { toast('커밋할 변경이 없어요.'); return; }
  if (!(await ask(`이 기기의 커밋 안 된 여행 ${dirty.length}개${[...S.dsRecs.values()].some((r) => !r.sha) ? '와 데이터셋' : ''}을 저장소에 올릴까요?`))) return;
  for (const rec of dirty) await commitTrip(rec);
  for (const r of S.dsRecs.values()) if (!r.sha) { try { await commitDataset(r.id); } catch (e) { toast(e.message, 4000); } }
  render();
}

/* ── 위치 (버튼을 눌렀을 때만, 저장·전송하지 않음) ─── */
function getHere() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { toast('이 브라우저는 위치를 지원하지 않아요.'); resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { S.here = { k: 'here', l: '현재 위치', lat: p.coords.latitude, lng: p.coords.longitude }; resolve(S.here); },
      (e) => { toast(e.code === 1 ? '위치 권한이 거부됐어요. 브라우저 설정에서 허용하세요.' : '위치를 가져오지 못했어요.'); resolve(null); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}

/* ── 라우팅 ───────────────────────────────────────── */
const TABS = [
  { id: 'today', label: '오늘', icon: '◉' }, { id: 'plan', label: '일정', icon: '☰' }, { id: 'places', label: '장소', icon: '⌖' },
  { id: 'prep', label: '준비', icon: '✓' }, { id: 'sos', label: '비상', icon: '✚' }, { id: 'more', label: '더보기', icon: '⋯' },
];
function route() {
  const p = (location.hash || '#/').slice(2).split('/').map(decodeURIComponent);
  if (p[0] === 't' && p[1]) return { view: 'trip', id: p[1], tab: p[2] || 'auto', sub: p[3] || null };
  if (p[0] === 'new') return { view: 'new', id: p[1] || null };
  if (p[0] === 'settings') return { view: 'settings' };
  return { view: 'home' };
}
export const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

function ctxFor(rec, r) {
  const trip = rec.data;
  const tz = (trip.meta && trip.meta.timezone) || 'Asia/Seoul';
  const ctx = {
    S, rec, trip, tz, tab: r.tab, sub: r.sub,
    datasets: S.datasets,
    secrets: secretsFor(rec.id),
    badges: badgeDict(trip, S.datasets),
    dirty: isDirty(rec),
    base: rec.base,
    phase: phase(trip.meta, tz),
    now: nowIn(tz),
    async save(mut, msg) { if (mut) mut(rec.data); await saveTrip(rec); if (msg) toast(msg); render(); },
    async replace(data, msg) { rec.data = data; await saveTrip(rec); if (msg) toast(msg); render(); },
    render, go,
    commit: () => commitTrip(rec),
    pull: (manual) => pullTrip(rec, manual),
    getHere: async () => { const x = await getHere(); render(); return x; },
    here: () => S.here,
    async saveDataset(ds) { const r = S.dsRecs.get(ds.id); await putDs({ id: ds.id, data: ds, base: r ? r.base : null, sha: r ? r.sha : null }); },
    async deleteLocal() {
      await db.del('trips', rec.id); S.trips.delete(rec.id); go('#/'); toast('이 기기에서 지웠어요. 저장소의 파일은 그대로예요.');
    },
    async addTrip(data, secretValues) { const nr = await saveImported(api, data, secretValues); return nr; },
    allTrips: () => [...S.trips.values()].map((x) => x.data),
  };
  return ctx;
}

/* 앱 전역 API (가져오기 화면 등에서 사용) */
const api = {
  S, isDirty, putRec, putDs, saveTrip, render, go, commitAll, syncIndex,
  allTrips: () => [...S.trips.values()].map((x) => x.data),
};

/* ── 그리기 ───────────────────────────────────────── */
export function render() {
  const app = $('#app');
  const r = route();
  const key = JSON.stringify(r);
  const keepScroll = key === S.lastRouteKey ? window.scrollY : 0;
  S.lastRouteKey = key;
  document.documentElement.style.removeProperty('--accent');
  document.documentElement.style.removeProperty('--on-accent');
  let node;
  try {
    if (r.view === 'trip') node = renderTrip(r);
    else if (r.view === 'new') node = viewNew(api, r);
    else if (r.view === 'settings') node = renderSettings();
    else node = renderHome();
  } catch (e) {
    console.error(e);
    node = h('main.page', section('화면을 그리다 문제가 생겼어요', h('p', String(e && e.message || e)),
      h('p.hint', '여행 데이터의 형식이 어긋났을 수 있어요. [데이터] 화면에서 JSON을 내보내 확인하거나 저장소에서 다시 불러오세요.'),
      btn('홈으로', () => go('#/'))));
  }
  clear(app).appendChild(node);
  window.scrollTo(0, keepScroll);
}

function syncChip(rec) {
  const dirty = isDirty(rec);
  const tok = hasToken();
  if (S.conflict[rec.id]) return h('button.chip.warn', { type: 'button', onclick: () => resolveConflict(rec) }, '⚠ 충돌 · 해결');
  if (!tok) return h('a.chip', { href: '#/settings' }, dirty ? '기기에만 저장' : '기기 사본');
  if (dirty) return h('button.chip.accent', { type: 'button', disabled: S.busy, onclick: () => commitTrip(rec) }, S.busy ? '커밋 중…' : '커밋 ☁');
  return h('button.chip', { type: 'button', disabled: S.busy, onclick: () => pullTrip(rec, true) }, S.busy ? '확인 중…' : '저장소와 같음 ↻');
}

function renderTrip(r) {
  const rec = S.trips.get(r.id);
  if (!rec) {
    const inIndex = S.index && (S.index.trips || []).find((e) => e.id === r.id);
    if (inIndex && hasToken()) {
      fetchTrip(r.id, inIndex.file).then((x) => { if (x) render(); else toast('여행 파일을 찾지 못했어요.'); }).catch((e) => toast(e.message));
      return h('main.page', empty('저장소에서 여행을 내려받는 중이에요…'));
    }
    return h('main.page', empty('이 기기에 없는 여행이에요.', btn('홈으로', () => go('#/'))));
  }
  const trip = rec.data;
  const ph = phase(trip.meta, trip.meta.timezone);
  let tab = r.tab;
  if (tab === 'auto') tab = LS.json('ta:lastTab', {})[rec.id] || (ph.key === 'ongoing' ? 'today' : 'plan');
  if (!TABS.some((t) => t.id === tab)) tab = 'today';
  const lt = LS.json('ta:lastTab', {}); lt[rec.id] = tab; LS.setJson('ta:lastTab', lt);
  LS.set('ta:lastTrip', rec.id);
  const ctx = ctxFor(rec, { ...r, tab });
  const accent = /^#[0-9a-f]{6}$/i.test(trip.meta.accent || '') ? trip.meta.accent : '#EE8A1E';
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--on-accent', onColor(accent));
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', accent);
  document.title = trip.meta.title + ' · 여행';

  const view = { today: viewToday, plan: viewPlan, places: viewPlaces, prep: viewPrep, sos: viewSos, more: viewMore }[tab];
  const sub = ph.key === 'upcoming' ? `D-${ph.dday}` : ph.key === 'ongoing' ? `${ph.dayNo}일째` : '지난 여행';
  const header = h('header.trip-head',
    h('a.icon-btn.back', { href: '#/', 'aria-label': '여행 목록' }, '‹'),
    h('div.trip-title', h('h1', trip.meta.title), h('div.trip-sub', `${fmtDate(trip.meta.start)} – ${fmtDate(trip.meta.end)} · ${sub}`)),
    syncChip(rec));
  const banner = S.conflict[rec.id]
    ? h('div.banner.warn', S.status[rec.id] || '', ' ', btn('해결', () => resolveConflict(rec), 'small'))
    : null;
  const main = h('main.page.tab-' + tab, banner, view(ctx));
  const nav = h('nav.tabbar', { 'aria-label': '여행 탭' }, TABS.map((t) => h('a.tab', {
    href: `#/t/${encodeURIComponent(rec.id)}/${t.id}`, 'aria-current': t.id === tab ? 'page' : null,
  }, h('span.tab-ico', { 'aria-hidden': 'true' }, t.icon), h('span', t.label))));
  return h('div.trip', header, main, nav);
}

/* ── 홈: 여행 목록 ────────────────────────────────── */
function tripCard(t, rec, entry) {
  const m = (t && t.meta) || entry || {};
  const ph = phase({ start: m.start, end: m.end }, m.timezone || 'Asia/Seoul');
  const id = (t && t.id) || entry.id;
  const accent = /^#[0-9a-f]{6}$/i.test(m.accent || '') ? m.accent : '#8B9092';
  const tag = ph.key === 'upcoming' ? (ph.dday === 0 ? '오늘 출발' : 'D-' + ph.dday) : ph.key === 'ongoing' ? `여행 중 · ${ph.dayNo}일째` : (m.status === 'done' ? '다녀옴' : '지난 여행');
  const marks = [];
  if (rec && isDirty(rec)) marks.push(pill(rec.sha ? '커밋 안 됨' : '기기에만', 'warn'));
  if (!rec) marks.push(pill('저장소에만 · 열면 내려받음', 'info'));
  if (S.conflict[id]) marks.push(pill('충돌', 'warn'));
  const nights = RE_DATE.test(m.start || '') && RE_DATE.test(m.end || '') ? daysBetween(m.start, m.end) : null;
  return h('a.ticket', { href: `#/t/${encodeURIComponent(id)}`, style: { '--tk': accent, '--tk-on': onColor(accent) } },
    h('div.ticket-stub', h('span.ticket-tag', tag)),
    h('div.ticket-body',
      h('h3', m.title || id),
      h('div.ticket-dates', `${fmtDate(m.start)} – ${fmtDate(m.end)}` + (nights != null ? ` · ${nights}박 ${nights + 1}일` : '')),
      m.summary ? h('p.ticket-sum', m.summary) : null,
      marks.length ? h('div.ticket-marks', marks) : null));
}
function renderHome() {
  document.title = '가족 여행';
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.setAttribute('content', '#2E3336');
  const recs = [...S.trips.values()];
  const items = recs.map((rec) => ({ t: rec.data, rec, start: rec.data.meta.start, end: rec.data.meta.end, tz: rec.data.meta.timezone }));
  for (const e of (S.index && S.index.trips) || []) if (!S.trips.has(e.id)) items.push({ entry: e, start: e.start, end: e.end });
  const groups = { ongoing: [], upcoming: [], past: [] };
  for (const it of items) groups[phase({ start: it.start, end: it.end }, it.tz || 'Asia/Seoul').key].push(it);
  groups.upcoming.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  groups.past.sort((a, b) => String(b.start).localeCompare(String(a.start)));
  const tok = hasToken();
  const list = (title, arr) => arr.length ? h('section.home-group', h('h2.group-title', title), arr.map((it) => tripCard(it.t, it.rec, it.entry))) : null;
  const anyDirty = recs.some(isDirty);
  return h('div.home',
    h('header.home-head',
      h('div', h('h1.brand', '가족 여행'), h('p.brand-sub', '티켓북 · 일정 · 장소 · 준비')),
      h('a.icon-btn', { href: '#/settings', 'aria-label': '설정' }, '⚙')),
    h('main.page',
      h('div.home-actions',
        btn('＋ 새 여행', () => go('#/new'), 'primary'),
        btn('가져오기', () => openImportSheet(api)),
        tok ? btn(S.busy ? '동기화 중…' : '동기화 ↻', () => syncIndex(true), '', { disabled: S.busy }) : null),
      !tok ? h('div.banner', '저장소 연결이 없어 이 기기에만 저장돼요. ', h('a', { href: '#/settings' }, '설정에서 연결하기')) : null,
      S.homeMsg ? h('p.hint.center', S.homeMsg) : null,
      tok && anyDirty ? h('div.banner.accent', '커밋 안 된 여행이 있어요. ', btn('모두 커밋', () => commitAll(), 'small')) : null,
      list('진행 중', groups.ongoing), list('다가오는 여행', groups.upcoming), list('지난 여행', groups.past),
      !items.length ? empty('아직 여행이 없어요. [새 여행]으로 AI와 만든 일정을 붙여넣거나, 받은 JSON 파일을 [가져오기] 하세요.',
        btn('데모 여행 열어보기', loadDemo)) : null));
}
async function loadDemo() {
  try {
    const res = await fetch('./samples/demo.json');
    const t = await res.json();
    const rec = { id: t.id, data: t, base: null, sha: null };
    await putRec(rec); go('#/t/' + encodeURIComponent(t.id));
  } catch (e) { toast('데모를 불러오지 못했어요: ' + e.message); }
}

/* ── 설정 ─────────────────────────────────────────── */
function renderSettings() {
  document.title = '설정 · 가족 여행';
  const c = repoConfig();
  const owner = input(c.owner, { autocapitalize: 'off' }), repo = input(c.repo, { autocapitalize: 'off' }), branch = input(c.branch, { autocapitalize: 'off' });
  const token = input('', { type: 'password', placeholder: getToken() ? '등록됨 (바꾸려면 새로 입력)' : 'github_pat_…', autocapitalize: 'off' });
  const repoMsg = h('p.hint', S.repoMsg || (getToken() ? '토큰이 이 기기에 저장돼 있어요.' : '토큰 없음 — 기기 저장소만으로 동작해요.'));
  const saveRepo = async () => {
    setRepoConfig({ owner: owner.value.trim() || 'Ssuuks', repo: repo.value.trim() || 'travel-data', branch: branch.value.trim() || 'main' });
    if (token.value.trim()) setToken(token.value.trim());
    token.value = '';
    repoMsg.textContent = '확인 중…';
    try {
      const info = await checkRepo();
      repoMsg.textContent = S.repoMsg = `연결됨: ${info.full} (${info.private ? '비공개' : '⚠ 공개 저장소'}${info.canPush ? ', 쓰기 가능' : ', 읽기만 가능'})`;
      if (!info.private) toast('공개 저장소예요. 여행 날짜·숙소가 누구에게나 보여요.', 5000);
      syncIndex(false);
    } catch (e) { repoMsg.textContent = S.repoMsg = e.message; }
  };

  const prof = getProfile();
  const memberRows = h('div.members');
  const drawMembers = () => {
    clear(memberRows);
    prof.members.forEach((m, i) => {
      const lab = input(m.label, { 'aria-label': '이름' }); lab.addEventListener('input', () => { m.label = lab.value; });
      const role = select([{ value: 'adult', label: '어른' }, { value: 'child', label: '아이' }], m.role, { 'aria-label': '구분' });
      role.addEventListener('change', () => { m.role = role.value; });
      const birth = input(m.birth, { type: 'date', 'aria-label': '생년월일' }); birth.addEventListener('change', () => { m.birth = birth.value; });
      memberRows.appendChild(h('div.member-row', lab, role, birth,
        h('button.icon-btn', { type: 'button', 'aria-label': '삭제', onclick: () => { prof.members.splice(i, 1); drawMembers(); } }, '✕')));
    });
  };
  drawMembers();
  const memb = input(prof.memberships), likes = input(prof.likes), dislikes = input(prof.dislikes), fallback = input(prof.fallbackAges);

  return h('div.settings',
    h('header.home-head', h('a.icon-btn.back', { href: '#/', 'aria-label': '여행 목록' }, '‹'), h('h1.brand', '설정')),
    h('main.page',
      section('저장소 연결',
        h('p.hint', '여행 데이터는 비공개 GitHub 저장소에 둡니다. fine-grained 토큰을 그 저장소 하나에만, Contents 읽기/쓰기 권한으로, 만료 90일로 만드세요. 토큰은 이 기기 브라우저에만 저장돼요.'),
        h('div.grid3', field('소유자', owner), field('저장소', repo), field('브랜치', branch)),
        field('토큰', token),
        h('div.btnrow', btn('저장하고 확인', saveRepo, 'primary'),
          getToken() ? btn('토큰 지우기', () => { setToken(''); toast('토큰을 지웠어요.'); render(); }, 'danger') : null),
        repoMsg,
        h('details.help', h('summary', '처음 설정하는 방법'),
          h('ol',
            h('li', 'GitHub에서 비공개 저장소 travel-data를 만듭니다(README로 초기화).'),
            h('li', 'Settings → Developer settings → Fine-grained tokens → Generate. Repository access는 travel-data만, Permissions → Contents: Read and write, 만료 90일.'),
            h('li', '위 칸에 토큰을 넣고 [저장하고 확인].'),
            h('li', '받은 여행 JSON(묶음 파일)을 홈의 [가져오기]로 넣고 [모두 커밋]하면 저장소에 trips/와 datasets/가 만들어져요.'),
            h('li', '다른 기기에서는 같은 설정 후 홈의 [동기화]로 불러옵니다.')))),
      section('가족 프로필 (기기 전용)',
        h('p.hint', '생년월일은 이 기기에만 저장돼요. AI 프롬프트에는 여행 시점 나이만 들어갑니다.'),
        memberRows,
        btn('＋ 구성원', () => { prof.members.push({ key: 'm' + Date.now(), label: '', role: 'child', birth: '' }); drawMembers(); }, 'small'),
        field('멤버십', memb), field('선호', likes), field('비선호', dislikes), field('생년월일이 없을 때 나이 설명', fallback),
        h('div.btnrow',
          btn('프로필 저장', () => {
            prof.members.forEach((m) => { if (!m.key) m.key = 'm' + Math.random().toString(36).slice(2, 6); });
            setProfile({ ...prof, memberships: memb.value, likes: likes.value, dislikes: dislikes.value, fallbackAges: fallback.value });
            toast('프로필을 저장했어요.');
          }, 'primary'),
          btn('초기값으로', () => { setProfile(DEFAULT_PROFILE); render(); }))),
      section('백업',
        h('p.hint', '여행과 데이터셋 전체를 파일 하나로 내려받아요. 토큰·비밀값·가족 생년월일은 들어가지 않아요.'),
        h('div.btnrow',
          btn('전체 백업 내보내기', () => {
            const out = { schema: 'bundle/v1', exportedAt: new Date().toISOString(),
              trips: [...S.trips.values()].map((r) => r.data), datasets: [...S.dsRecs.values()].map((r) => r.data) };
            download('travel-backup-' + nowIn('Asia/Seoul').date + '.json', JSON.stringify(out, null, 2));
          }),
          btn('가져오기', () => openImportSheet(api)))),
      section('앱',
        h('p.hint', `버전 ${APP_VERSION} · 오프라인 캐시: ${'serviceWorker' in navigator ? (navigator.serviceWorker.controller ? '켜짐' : '준비 중') : '지원 안 함'}`),
        h('p.hint#storage-est', ''),
        h('div.btnrow',
          btn('새 버전 확인', async () => {
            const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
            if (reg) { await reg.update(); toast('확인했어요. 새 버전이 있으면 다시 열 때 적용돼요.'); } else location.reload();
          })))));
}

/* ── 시작 ─────────────────────────────────────────── */
async function boot() {
  adoptLegacySecrets();
  try {
    for (const r of await db.all('trips')) S.trips.set(r.id, r);
    for (const r of await db.all('datasets')) { S.dsRecs.set(r.id, r); S.datasets[r.id] = r.data; }
    S.index = (await kvGet('index')) || null;
  } catch (e) { console.warn('IndexedDB', e); }
  window.addEventListener('hashchange', () => { closeAllSheets(); render(); });
  window.addEventListener('online', () => { toast('다시 온라인이에요.'); if (hasToken()) syncIndex(false); });
  window.addEventListener('offline', () => toast('오프라인이에요. 기기 사본으로 보여줘요.'));
  if (!location.hash || location.hash === '#/' || location.hash === '#') {
    const last = LS.get('ta:lastTrip');
    const rec = last && S.trips.get(last);
    if (rec && phase(rec.data.meta, rec.data.meta.timezone).key === 'ongoing') location.replace('#/t/' + encodeURIComponent(last) + '/today');
  }
  render();
  if (hasToken() && navigator.onLine) {
    const r = route();
    if (r.view === 'trip' && S.trips.get(r.id)) { pullTrip(S.trips.get(r.id), false); syncIndex(false); }
    else syncIndex(false);
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  setInterval(() => { const r = route(); if (r.view === 'trip' && ['today', 'more'].includes(r.tab) && !document.body.classList.contains('sheet-open') && !document.activeElement.matches('input,textarea,select')) render(); }, 60000);
}
boot();
