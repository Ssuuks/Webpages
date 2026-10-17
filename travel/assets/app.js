/* 가족 여행 플래너 — 진입점: 상태, 라우팅, 동기화, 홈·설정 화면 */
import { h, clear, $, clone, same, toast, nowIn, fmtDate, download, RE_DATE, daysBetween, onColor, copyText, utf8ToB64, b64ToUtf8, sealText, openText } from './util.js';
import { db, kvGet, kvSet, LS, repoConfig, setRepoConfig, getToken, setToken, secretsFor, adoptLegacySecrets,
  getProfile, setProfile, DEFAULT_PROFILE, settings, pushHistory } from './store.js';
import { merge3, resolveConflicts, showValue } from './sync.js';
import { flushDocs } from './docs.js';
import { getFile, putFile, checkRepo, hasToken } from './github.js';
import { badgeDict, phase, indexEntry } from './model.js';
import { validateTrip } from './validate.js';
import { openSheet, ask, btn, field, input, select, section, empty, pill, closeAllSheets, textarea, checkbox } from './ui.js';
import { viewToday, viewPlan, viewPlaces, viewPrep, viewSos } from './v-trip.js';
import { viewMore } from './v-more.js';
import { viewNew, openImportSheet, saveImported } from './v-import.js';

const APP_VERSION = '1.2.0';
const S = {
  trips: new Map(),        // id → { id, data, base, sha, syncedAt }
  dsRecs: new Map(),       // id → { id, data, base, sha }
  datasets: {},            // id → data
  index: null, indexSha: null,
  status: {},              // tripId → 동기화 메시지
  conflict: {},            // tripId → { remote, merged, conflicts } | { remote, whole }
  pending: {},             // tripId → 올릴 변경 있음
  syncing: {},             // tripId → 동기화 중
  lastPull: {},
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

/* ── 동기화 엔진 ─────────────────────────────────────
   저장소에서 받아 3방향 병합(서로 다른 곳을 고쳤으면 자동으로 합침) → 필요하면 올린다.
   여행마다 한 번에 하나씩(잠금), 자동 동기화는 편집이 멈춘 뒤 잠시 기다렸다가. */
const timers = {}, locks = {};
const autosync = () => settings.autosync() && hasToken();
const hhmmNow = () => new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
function scheduleSync(id, delay = 40000) {
  if (!autosync()) return;
  S.pending[id] = true;
  clearTimeout(timers[id]);
  timers[id] = setTimeout(() => { delete timers[id]; syncTrip(id, { auto: true, quiet: true }); }, delay);
}
function lock(id, fn) {
  const prev = locks[id] || Promise.resolve();
  const run = prev.then(fn, fn);
  locks[id] = run.catch(() => {});
  return run;
}
/* mode: 'pull'(받기만) | 'commit'(받고 합친 뒤 올리기) */
function syncTrip(id, opts = {}) {
  const mode = opts.mode || 'commit';
  return lock(id, async () => {
    const rec = S.trips.get(id);
    if (!rec || !hasToken()) return 'skip';
    if (S.conflict[id]) return 'conflict';
    if (!navigator.onLine) { S.status[id] = '오프라인 · 연결되면 맞춰요'; if (isDirty(rec)) S.pending[id] = true; softRender(); return 'offline'; }
    S.syncing[id] = true; softRender();
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const f = await getFile(tripPath(id));
        if (f && f.json) await ensureDatasets(f.json);
        if (f && f.json && f.sha !== rec.sha) {
          if (!isDirty(rec)) {
            await pushHistory(id, rec.data, '저장소 새 버전 받기 전');
            Object.assign(rec, { data: f.json, base: clone(f.json), sha: f.sha, syncedAt: Date.now() });
            await putRec(rec);
            S.status[id] = '다른 기기의 변경을 받았어요 · ' + hhmmNow();
            delete S.pending[id];
            return 'pulled';
          }
          if (!rec.base) { S.conflict[id] = { remote: f, whole: true }; S.status[id] = '저장소에 같은 id의 다른 여행이 있어요. 하나를 고르세요.'; return 'conflict'; }
          const { merged, conflicts } = merge3(rec.base, rec.data, f.json);
          if (conflicts.length) { S.conflict[id] = { remote: f, merged, conflicts }; S.status[id] = `두 기기가 같은 곳을 다르게 고쳤어요 (${conflicts.length}건)`; return 'conflict'; }
          await pushHistory(id, rec.data, '다른 기기 변경과 합치기 전', true);
          Object.assign(rec, { data: merged, base: clone(f.json), sha: f.sha });
          await putRec(rec);
          S.status[id] = '다른 기기의 변경과 합쳤어요 · ' + hhmmNow();
        }
        if (mode === 'pull') {
          if (!f) S.status[id] = '저장소에 아직 없는 여행이에요';
          else if (!isDirty(rec)) S.status[id] = '저장소와 같음 · ' + hhmmNow();
          if (isDirty(rec)) scheduleSync(id, 3000);
          return 'pulled';
        }
        if (!isDirty(rec)) { delete S.pending[id]; S.status[id] = '저장소와 같음 · ' + hhmmNow(); await flushDocs(rec); return 'clean'; }
        const v = validateTrip(rec.data, { datasets: S.datasets, skipChecks: true });
        if (!v.ok) {
          S.status[id] = '검사 오류가 있어 올리지 않았어요 · [데이터 → 데이터 점검]';
          if (!opts.auto) await ask('검사 오류가 있어 커밋하지 않았어요.\n' + v.errors.slice(0, 6).map((e) => '· ' + e.msg).join('\n'), [{ label: '닫기', value: true, primary: true }], '커밋 불가');
          return 'invalid';
        }
        const isNew = !f;
        rec.data.updatedAt = new Date().toISOString();
        try {
          const sha = await putFile(tripPath(id), rec.data, f ? f.sha : null,
            `${rec.data.meta.title || id} ${isNew ? '추가' : opts.auto ? '자동 동기화' : '갱신'} ${new Date().toLocaleString('ko-KR')}`);
          Object.assign(rec, { sha, base: clone(rec.data), syncedAt: Date.now() });
          await putRec(rec);
        } catch (e) {
          if ((e.status === 409 || e.status === 422) && attempt < 2) continue;   // 그사이 다른 기기가 올림 → 다시 받아 합치기
          throw e;
        }
        for (const dsId of rec.data.meta.datasets || []) await commitDataset(dsId);
        await updateIndex([rec.data]);
        await flushDocs(rec);
        delete S.pending[id];
        S.status[id] = (opts.auto ? '자동으로 올렸어요 · ' : '커밋했어요 · ') + hhmmNow();
        return 'committed';
      }
      return 'error';
    } catch (e) {
      S.status[id] = e.message;
      if (isDirty(rec)) S.pending[id] = true;
      if (!opts.quiet) toast(e.message, 5000);
      return 'error';
    } finally { S.syncing[id] = false; softRender(); }
  });
}
async function pullTrip(rec, manual, quiet) {
  if (!hasToken()) { if (manual) toast('저장소 연결이 없어요. [설정]에서 토큰을 넣으세요.'); return; }
  S.lastPull[rec.id] = Date.now();
  const r = await syncTrip(rec.id, { mode: 'pull', quiet: !manual });
  if (!manual) return r;
  if (r === 'conflict') await resolveConflict(rec);
  else if (r === 'pulled') toast(S.status[rec.id] || '저장소를 확인했어요.');
  return r;
}
async function commitTrip(rec) {
  if (!hasToken()) {
    if (await ask('저장소 연결(토큰)이 없어서 커밋할 수 없어요. 지금은 이 기기에만 저장돼 있어요.', [{ label: '닫기', value: false }, { label: '설정 열기', value: true, primary: true }])) location.hash = '#/settings';
    return;
  }
  clearTimeout(timers[rec.id]); delete timers[rec.id];
  const r = await syncTrip(rec.id, { mode: 'commit' });
  if (r === 'committed') toast('저장소에 커밋했어요.');
  else if (r === 'clean') toast('이미 저장소와 같아요.');
  else if (r === 'pulled') toast(S.status[rec.id]);
  else if (r === 'conflict') await resolveConflict(rec);
  return r;
}
/* 충돌 해결: 항목마다 이 기기 값 / 저장소 값을 고른다 */
async function resolveConflict(rec) {
  const c = S.conflict[rec.id]; if (!c) return;
  if (c.whole) {
    const f = c.remote;
    const v = await ask(`저장소에 같은 id(${rec.id})의 여행이 따로 있어요(${f.json.updatedAt ? new Date(f.json.updatedAt).toLocaleString('ko-KR') : '시각 모름'}).\n어느 쪽을 남길까요? 남기지 않은 쪽은 기기 기록에 보관돼요.`,
      [{ label: '이 기기 것', value: 'local' }, { label: '저장소 것', value: 'remote', danger: true }], '동기화 충돌');
    if (!v) return;
    await pushHistory(rec.id, v === 'remote' ? rec.data : f.json, '충돌로 버린 버전', true);
    if (v === 'remote') Object.assign(rec, { data: f.json, base: clone(f.json), sha: f.sha });
    else Object.assign(rec, { base: clone(f.json), sha: f.sha });
    await putRec(rec);
    delete S.conflict[rec.id]; S.status[rec.id] = '';
    if (v === 'local') syncTrip(rec.id, { mode: 'commit' });
    render();
    return;
  }
  const choices = c.conflicts.map(() => 'local');
  const rows = c.conflicts.map((cf, i) => {
    const name = 'cf' + i;
    const opt = (val, title, v) => {
      const r = h('input', { type: 'radio', name, value: val });
      r.checked = choices[i] === val;
      r.addEventListener('change', () => { if (r.checked) choices[i] = val; });
      return h('label.cf-opt', r, h('span', h('b', title), ' ', showValue(v)));
    };
    return h('div.cf-row', h('div.cf-label', cf.label), opt('local', '이 기기', cf.local), opt('remote', '저장소', cf.remote));
  });
  const s = openSheet('동기화 충돌', h('div',
    h('p.hint', '두 기기가 같은 곳을 다르게 고쳤어요. 남길 값을 고르세요. 나머지 변경은 이미 자동으로 합쳤어요.'),
    rows,
    h('div.btnrow', btn('적용', async () => {
      const data = resolveConflicts(c.merged, c.conflicts, choices);
      await pushHistory(rec.id, rec.data, '충돌 해결 전', true);
      Object.assign(rec, { data, base: clone(c.remote.json), sha: c.remote.sha });
      await putRec(rec);
      delete S.conflict[rec.id];
      S.status[rec.id] = '충돌을 해결했어요';
      s.close();
      if (hasToken()) await syncTrip(rec.id, { mode: 'commit' });
      render();
    }, 'primary'))));
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
  for (const rec of dirty) await syncTrip(rec.id, { mode: 'commit' });
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
    /* opts.undo: 지우기 같은 동작 — 토스트에 [되돌리기], 기기 기록에 바로 남김 */
    async save(mut, msg, opts = {}) {
      const prev = clone(rec.data);
      if (mut) mut(rec.data);
      await saveTrip(rec);
      pushHistory(rec.id, prev, opts.label || msg || '편집', !!opts.undo);
      scheduleSync(rec.id);
      if (msg) toast(msg, opts.undo ? { action: '되돌리기', onAction: async () => { rec.data = prev; await saveTrip(rec); scheduleSync(rec.id); render(); toast('되돌렸어요.'); } } : undefined);
      render();
    },
    async replace(data, msg) {
      await pushHistory(rec.id, rec.data, msg || '바꾸기 전', true);
      rec.data = data; await saveTrip(rec); scheduleSync(rec.id);
      if (msg) toast(msg); render();
    },
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
  afterImport: (id) => scheduleSync(id, 3000),
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
  const chip = (() => {
    if (S.conflict[rec.id]) return h('button.chip.warn', { type: 'button', onclick: () => resolveConflict(rec) }, '⚠ 충돌 · 해결');
    if (!tok) return h('a.chip', { href: '#/settings' }, dirty ? '기기에만 저장' : '기기 사본');
    if (S.syncing[rec.id]) return h('button.chip', { type: 'button', disabled: true }, '동기화 중…');
    if (dirty && !navigator.onLine) return h('button.chip', { type: 'button', onclick: () => toast('오프라인이에요. 연결되면 자동으로 올려요.') }, '오프라인 · 대기');
    if (dirty && autosync()) return h('button.chip.accent', { type: 'button', onclick: () => commitTrip(rec), title: '곧 자동으로 올라가요. 누르면 바로 올려요.' }, '곧 동기화 ☁');
    if (dirty) return h('button.chip.accent', { type: 'button', onclick: () => commitTrip(rec) }, '커밋 ☁');
    return h('button.chip', { type: 'button', onclick: () => pullTrip(rec, true) }, '저장소와 같음 ↻');
  })();
  chip.classList.add('sync-chip');
  return chip;
}
/* 입력 중이면 화면 전체를 다시 그리지 않고 동기화 표시만 바꾼다 */
function softRender() {
  const a = document.activeElement;
  const typing = a && a.closest && a.closest('#app') && a.matches('input,textarea,select');
  const r = route();
  if (typing || document.body.classList.contains('sheet-open')) {
    const old = document.querySelector('#app .sync-chip');
    const rec = r.view === 'trip' && S.trips.get(r.id);
    if (old && rec) old.replaceWith(syncChip(rec));
    return;
  }
  render();
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
      !tok ? h('div.banner', '저장소 연결이 없어 이 기기에만 저장돼요. ', h('a', { href: '#/settings' }, '설정에서 연결하기'),
        ' · ', h('button.linkish', { type: 'button', onclick: () => openLinkImport() }, '다른 기기의 연결 코드 붙여넣기')) : null,
      safetyBanners(items),
      S.homeMsg ? h('p.hint.center', S.homeMsg) : null,
      tok && anyDirty ? h('div.banner.accent', '커밋 안 된 여행이 있어요. ', btn('모두 커밋', () => commitAll(), 'small')) : null,
      list('진행 중', groups.ongoing), list('다가오는 여행', groups.upcoming), list('지난 여행', groups.past),
      !items.length ? empty('아직 여행이 없어요. [새 여행]으로 AI와 만든 일정을 붙여넣거나, 받은 JSON 파일을 [가져오기] 하세요.',
        btn('데모 여행 열어보기', loadDemo)) : null));
}
/* 데이터 안전 안내: 아이폰 홈 화면 설치, 토큰 만료, 오프라인 대기 */
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function safetyBanners(items) {
  const out = [];
  if (isIOS() && !standalone() && !LS.get('ta:iosHint')) {
    out.push(h('div.banner.warn', h('b', '아이폰은 홈 화면에 추가해서 쓰세요. '),
      '사파리에서만 쓰면 한동안 안 열었을 때 토큰·비밀값·커밋 안 한 변경이 지워질 수 있어요. 공유 버튼 → [홈 화면에 추가]. ',
      h('button.linkish', { type: 'button', onclick: () => { LS.set('ta:iosHint', '1'); render(); } }, '알겠어요')));
  }
  const exp = settings.tokenExp();
  if (hasToken() && exp) {
    const left = daysBetween(nowIn('Asia/Seoul').date, exp);
    const clash = items.find((it) => it.end && it.end >= exp && phase({ start: it.start, end: it.end }, 'Asia/Seoul').key !== 'past');
    if (left < 0) out.push(h('div.banner.warn', h('b', '토큰이 만료됐어요. '), '새 토큰을 만들어 [설정]에 넣으세요. ', h('a', { href: '#/settings' }, '설정')));
    else if (left <= 14 || clash) out.push(h('div.banner.warn', h('b', `토큰이 ${left}일 뒤(${fmtDate(exp)}) 만료돼요. `),
      clash ? `'${(clash.t && clash.t.meta.title) || clash.entry.title}' 여행 중이거나 그 전이에요. 떠나기 전에 새 토큰으로 바꾸세요. ` : '', h('a', { href: '#/settings' }, '설정')));
  }
  const waiting = Object.keys(S.pending).filter((id) => S.trips.get(id) && isDirty(S.trips.get(id)));
  if (waiting.length && !navigator.onLine) out.push(h('div.banner', `오프라인이에요. 올릴 변경이 있는 여행 ${waiting.length}개 — 연결되면 자동으로 올려요.`));
  return out;
}

/* ── 기기 연결 코드: 저장소 설정·토큰·비밀값·가족 프로필을 다른 기기로 ── */
const LINK = 'TA-LINK1:', LINK_E = 'TA-LINK1E:';
async function openLinkExport() {
  const incRepo = checkbox(true, '저장소 설정과 토큰'), incSec = checkbox(true, '비밀값(모든 여행의 예약번호 등)'), incProf = checkbox(true, '가족 프로필(생년월일 포함)');
  const pass = input('', { type: 'password', placeholder: '선택: 암호를 정하면 코드가 암호화돼요', autocomplete: 'new-password' });
  const out = h('div');
  const s = openSheet('다른 기기 연결 코드', h('div',
    h('p.hint', '배우자 폰 같은 다른 기기에 이 코드를 붙여넣으면 같은 저장소·비밀값으로 바로 쓸 수 있어요. 코드에는 토큰이 들어 있어 저장소 전체를 읽고 쓸 수 있으니, 본인·가족 기기끼리만 옮기세요.'),
    h('div.field', incRepo, incSec, incProf), field('암호 (선택)', pass, '메신저로 보낼 거라면 암호를 정하고, 암호는 말로 알려 주세요.'),
    h('div.btnrow', btn('코드 만들기', async () => {
      const on = (c) => c.querySelector('input').checked;
      const data = { v: 1, at: new Date().toISOString() };
      if (on(incRepo)) { data.repo = repoConfig(); data.token = getToken(); data.tokenExp = settings.tokenExp(); data.autosync = settings.autosync(); }
      if (on(incSec)) data.secrets = LS.json('ta:secrets', {});
      if (on(incProf)) data.profile = LS.json('ta:profile', null);
      const json = JSON.stringify(data);
      const code = pass.value ? LINK_E + await sealText(json, pass.value) : LINK + utf8ToB64(json);
      clear(out).appendChild(h('div', textarea(code, { rows: 5, readonly: true, class: 'mono' }),
        h('div.btnrow', btn('복사', async () => toast((await copyText(code)) ? '복사했어요. 붙여넣은 뒤에는 대화방에서 지우세요.' : '복사하지 못했어요. 칸을 길게 눌러 복사하세요.'), 'primary'))));
    }, 'primary')), out));
  void s;
}
function openLinkImport() {
  const ta = textarea('', { rows: 5, class: 'mono', placeholder: 'TA-LINK1…', autocapitalize: 'off', spellcheck: 'false' });
  const pass = input('', { type: 'password', placeholder: '코드를 만들 때 정한 암호(있으면)', autocomplete: 'off' });
  const s = openSheet('연결 코드로 설정', h('div', field('코드', ta), field('암호', pass),
    h('div.btnrow', btn('설정하기', async () => {
      const raw = ta.value.trim();
      let data;
      try {
        if (raw.startsWith(LINK_E)) data = JSON.parse(await openText(raw.slice(LINK_E.length), pass.value));
        else if (raw.startsWith(LINK)) data = JSON.parse(b64ToUtf8(raw.slice(LINK.length)));
        else throw new Error('form');
      } catch (e) {
        toast(raw.startsWith(LINK_E) ? '암호가 틀렸거나 코드가 잘렸어요.' : 'TA-LINK1 로 시작하는 코드 전체를 붙여넣으세요.', 4000); return;
      }
      const done = [];
      if (data.repo) { setRepoConfig(data.repo); done.push('저장소'); }
      if (data.token) { setToken(data.token); done.push('토큰'); }
      if (data.tokenExp) settings.setTokenExp(data.tokenExp);
      if (data.autosync != null) settings.setAutosync(data.autosync);
      if (data.secrets) {
        const cur = LS.json('ta:secrets', {});
        for (const [tid, vals] of Object.entries(data.secrets)) cur[tid] = { ...(cur[tid] || {}), ...vals };
        LS.setJson('ta:secrets', cur); done.push('비밀값');
      }
      if (data.profile) { setProfile(data.profile); done.push('가족 프로필'); }
      s.close();
      toast(`${done.join('·')}을(를) 이 기기에 설정했어요.`, 4000);
      S.repoMsg = '';
      if (hasToken()) syncIndex(true); else render();
    }, 'primary'))));
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
  const expIn = input(settings.tokenExp(), { type: 'date' });
  expIn.addEventListener('change', () => { settings.setTokenExp(expIn.value); toast('만료일을 저장했어요.'); });
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
  const R = prof.rules;
  const rOut = input(R.maxOutings, { type: 'number', min: 0, max: 9, inputmode: 'numeric' }), rDrive = input(R.maxDriveMin, { type: 'number', min: 0, step: 10, inputmode: 'numeric' });
  const rLeg = input(R.maxLegMin, { type: 'number', min: 0, step: 5, inputmode: 'numeric' }), rBed = input(R.bedtime, { type: 'time' });
  const rMeal = input(R.mealGapH, { type: 'number', min: 0, max: 12, inputmode: 'numeric' });

  return h('div.settings',
    h('header.home-head', h('a.icon-btn.back', { href: '#/', 'aria-label': '여행 목록' }, '‹'), h('h1.brand', '설정')),
    h('main.page',
      section('저장소 연결',
        h('p.hint', '여행 데이터는 비공개 GitHub 저장소에 둡니다. fine-grained 토큰을 그 저장소 하나에만, Contents 읽기/쓰기 권한으로, 만료 90일로 만드세요. 토큰은 이 기기 브라우저에만 저장돼요.'),
        h('div.grid3', field('소유자', owner), field('저장소', repo), field('브랜치', branch)),
        field('토큰', token),
        field('토큰 만료일', expIn, 'GitHub에서 토큰을 만들 때 정한 날짜. 만료 2주 전과 여행 중 만료되면 홈에 알려요.'),
        checkbox(settings.autosync(), '자동 동기화 — 고친 뒤 잠시 지나면 저장소에 올리고, 앱을 열면 받아요', (v) => { settings.setAutosync(v); toast(v ? '자동 동기화를 켰어요.' : '자동 동기화를 껐어요. [커밋]으로 올리세요.'); }),
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
      section('다른 기기 연결',
        h('p.hint', '배우자 폰에 같은 설정을 손으로 반복하지 않도록, 저장소·토큰·비밀값·가족 프로필을 코드 하나로 옮겨요.'),
        h('div.btnrow', btn('연결 코드 만들기', openLinkExport, 'primary'), btn('연결 코드 붙여넣기', openLinkImport))),
      section('가족 프로필 (기기 전용)',
        h('p.hint', '생년월일은 이 기기에만 저장돼요. AI 프롬프트에는 여행 시점 나이만 들어갑니다.'),
        memberRows,
        btn('＋ 구성원', () => { prof.members.push({ key: 'm' + Date.now(), label: '', role: 'child', birth: '' }); drawMembers(); }, 'small'),
        field('멤버십', memb), field('선호', likes), field('비선호', dislikes), field('생년월일이 없을 때 나이 설명', fallback),
        h('h4', '가족 규칙 점검 기준 (0이면 끔)'),
        h('div.grid3', field('하루 고정 외출', rOut), field('하루 운전(분)', rDrive), field('한 번 이동(분)', rLeg)),
        h('div.grid2', field('아이 취침 시각', rBed), field('식사 간격(시간)', rMeal)),
        h('div.btnrow',
          btn('프로필 저장', () => {
            prof.members.forEach((m) => { if (!m.key) m.key = 'm' + Math.random().toString(36).slice(2, 6); });
            const n = (el, d) => (el.value === '' || isNaN(+el.value) ? d : +el.value);
            setProfile({ ...prof, memberships: memb.value, likes: likes.value, dislikes: dislikes.value, fallbackAges: fallback.value,
              rules: { maxOutings: n(rOut, 2), maxDriveMin: n(rDrive, 90), maxLegMin: n(rLeg, 60), bedtime: rBed.value || '20:30', mealGapH: n(rMeal, 6) } });
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
        storageInfo(),
        h('div.btnrow',
          btn('새 버전 확인', async () => {
            const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
            if (reg) { await reg.update(); toast('확인했어요. 새 버전이 있으면 다시 열 때 적용돼요.'); } else location.reload();
          })))));
}

function storageInfo() {
  const el = h('p.hint', '저장 공간 확인 중…');
  (async () => {
    try {
      const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      const used = est ? (est.usage / 1024 / 1024).toFixed(1) + 'MB 사용' : '';
      el.textContent = `기기 저장소: ${persisted ? '영구 보관(브라우저가 임의로 지우지 않음)' : '일반(공간이 부족하면 지워질 수 있음)'}${used ? ' · ' + used : ''}`
        + (isIOS() && !standalone() ? ' · 아이폰은 홈 화면에 추가하면 더 안전해요' : '');
      if (!persisted && navigator.storage && navigator.storage.persist) {
        el.appendChild(document.createTextNode(' '));
        el.appendChild(h('button.linkish', { type: 'button', onclick: async () => { const ok = await navigator.storage.persist(); toast(ok ? '영구 보관으로 바꿨어요.' : '브라우저가 허용하지 않았어요. 홈 화면에 추가한 뒤 다시 시도하세요.'); render(); } }, '영구 보관 요청'));
      }
    } catch { el.textContent = ''; }
  })();
  return el;
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
  window.addEventListener('online', () => {
    toast('다시 온라인이에요.');
    if (!hasToken()) return;
    for (const id of Object.keys(S.pending)) syncTrip(id, { auto: true, quiet: true });
    syncIndex(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (!hasToken()) return;
    if (document.visibilityState === 'hidden') {          // 앱을 내리면 기다리지 않고 바로 올리기
      for (const id of Object.keys(timers)) { clearTimeout(timers[id]); delete timers[id]; syncTrip(id, { auto: true, quiet: true }); }
    } else {
      const r = route(), rec = r.view === 'trip' && S.trips.get(r.id);
      if (rec && Date.now() - (S.lastPull[rec.id] || 0) > 30000) pullTrip(rec, false, true);
    }
  });
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
