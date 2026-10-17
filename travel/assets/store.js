/* 저장 계층
   - IndexedDB: 여행·데이터셋 사본(data)과 마지막 커밋본(base), sha
   - IndexedDB blobs: 서류함 파일 사본(오프라인용)
   - localStorage(기기 전용): 토큰, 비밀값, 가족 프로필, 화면 설정 — 내보내기·커밋에 절대 넣지 않는다 */
import { same } from './util.js';

const DB_NAME = 'travel-app', DB_VER = 2;
let dbp = null;
const mem = { trips: new Map(), datasets: new Map(), kv: new Map(), blobs: new Map() };   // IndexedDB가 막힌 환경용

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VER); } catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('trips')) db.createObjectStore('trips', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('datasets')) db.createObjectStore('datasets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'path' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbp;
}
/* IndexedDB 요청 하나를 프라미스로. DB가 없으면 메모리 Map으로 대신한다. */
async function run(store, mode, idbFn, memFn) {
  const d = await open();
  if (!d) return memFn(mem[store]);
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const r = idbFn(t.objectStore(store));
    let out;
    r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const keyOf = (v) => v.id || v.k || v.path;

export const db = {
  get: (store, key) => run(store, 'readonly', (s) => s.get(key), (m) => m.get(key)),
  all: (store) => run(store, 'readonly', (s) => s.getAll(), (m) => [...m.values()]).then((v) => v || []),
  put: (store, val) => run(store, 'readwrite', (s) => s.put(val), (m) => { m.set(keyOf(val), val); }),
  del: (store, key) => run(store, 'readwrite', (s) => s.delete(key), (m) => { m.delete(key); }),
};
export async function kvGet(k) { const r = await db.get('kv', k); return r ? r.v : undefined; }
export function kvSet(k, v) { return db.put('kv', { k, v }); }

/* 서류함 파일 사본 */
export const blobs = {
  get: (path) => db.get('blobs', path),
  put: (path, blob, mime) => db.put('blobs', { path, blob, mime, at: Date.now() }),
  del: (path) => db.del('blobs', path),
};

/* 기기 안 버전 기록: 여행마다 최근 10개. 잦은 편집은 2분에 한 번만 남긴다 */
const noTs = (t) => { if (!t) return t; const c = { ...t }; delete c.updatedAt; return c; };
export async function pushHistory(tripId, data, label, force) {
  if (!data) return;
  const k = 'hist:' + tripId;
  const list = (await kvGet(k)) || [];
  const last = list[0];
  if (last && same(noTs(last.data), noTs(data))) return;
  if (!force && last && Date.now() - last.at < 120000) return;
  list.unshift({ at: Date.now(), label: label || '편집', data });
  await kvSet(k, list.slice(0, 10));
}
export async function getHistory(tripId) { return (await kvGet('hist:' + tripId)) || []; }

/* ── localStorage ─────────────────────────────────── */
const lsMem = {};
export const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return lsMem[k] ?? null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { lsMem[k] = v; } },
  del(k) { try { localStorage.removeItem(k); } catch { delete lsMem[k]; } },
  json(k, dflt) { try { const v = LS.get(k); return v ? JSON.parse(v) : dflt; } catch { return dflt; } },
  setJson(k, v) { LS.set(k, JSON.stringify(v)); },
};

export const K = {
  token: 'ta:token',
  repo: 'ta:repo',
  secrets: 'ta:secrets',
  profile: 'ta:profile',
  ui: 'ta:ui',
  autosync: 'ta:autosync',
  tokenExp: 'ta:tokenExp',
};

/* 설정 */
export const settings = {
  autosync: () => LS.get(K.autosync) !== '0',             // 기본 켬
  setAutosync: (on) => LS.set(K.autosync, on ? '1' : '0'),
  tokenExp: () => (LS.get(K.tokenExp) || '').slice(0, 10),
  setTokenExp: (v) => (v ? LS.set(K.tokenExp, v) : LS.del(K.tokenExp)),
};

/* 저장소 설정 */
export function repoConfig() {
  const c = LS.json(K.repo, null) || {};
  return { owner: c.owner || 'Ssuuks', repo: c.repo || 'travel-data', branch: c.branch || 'main' };
}
export function setRepoConfig(c) { LS.setJson(K.repo, c); }
export const getToken = () => LS.get(K.token) || '';
export const setToken = (t) => (t ? LS.set(K.token, t) : LS.del(K.token));

/* 비밀값: { tripId: { key: value } } */
export function secretsFor(tripId) {
  const all = LS.json(K.secrets, {});
  return Object.assign({}, all[tripId] || {});
}
export function setSecret(tripId, key, value) {
  const all = LS.json(K.secrets, {});
  all[tripId] = all[tripId] || {};
  if (value) all[tripId][key] = value; else delete all[tripId][key];
  LS.setJson(K.secrets, all);
}
export function setSecrets(tripId, obj) {
  for (const [k, v] of Object.entries(obj || {})) if (v != null && v !== '') setSecret(tripId, k, String(v));
}
export function clearSecrets(tripId) {
  const all = LS.json(K.secrets, {}); delete all[tripId]; LS.setJson(K.secrets, all);
}
/* 나트랑 앱이 이 기기에 남긴 비밀값(pnr, parking, car)을 같은 키로 이어받는다 */
export function adoptLegacySecrets() {
  const legacy = LS.json('nhatrang2026:secrets', null);
  if (!legacy) return;
  const cur = secretsFor('2026-10-nhatrang');
  for (const [k, v] of Object.entries(legacy)) if (v && !cur[k]) setSecret('2026-10-nhatrang', k, v);
}

/* 가족 프로필 (기기 전용) */
export const DEFAULT_PROFILE = {
  members: [
    { key: 'adult1', label: '어른1', role: 'adult', birth: '' },
    { key: 'adult2', label: '어른2', role: 'adult', birth: '' },
    { key: 'child1', label: '첫째', role: 'child', birth: '' },
    { key: 'child2', label: '둘째', role: 'child', birth: '' },
  ],
  memberships: '메리어트 본보이 플래티넘: 라운지·조식·레이트체크아웃을 적극 활용',
  likes: '호텔 프로그램을 즐기고 하루 외출은 1~2곳. 큰 테마파크 두 곳을 하루에 넣는 건 무리. 돈을 아끼진 않지만 억지로 비싼 선택은 피하고, 무료만 고집하지도 않는다.',
  dislikes: '방어(아이·배우자), 붐비는 축제',
  fallbackAges: '2026년 11월 기준 아이 5세와 3세(36개월을 막 넘김)',
  /* 가족 규칙 점검 기준 */
  rules: { maxOutings: 2, maxDriveMin: 90, maxLegMin: 60, bedtime: '20:30', mealGapH: 6 },
};
export function getProfile() {
  const saved = LS.json(K.profile, {});
  return Object.assign({}, DEFAULT_PROFILE, saved, { rules: { ...DEFAULT_PROFILE.rules, ...(saved.rules || {}) } });
}
export function setProfile(p) { LS.setJson(K.profile, p); }

export function ui() { return LS.json(K.ui, {}); }
export function setUi(patch) { LS.setJson(K.ui, Object.assign(ui(), patch)); }
