/* 진행 저장 — 키는 'squad.v1' 그대로, v2는 필드를 더하기만 한다(옛 탭이 저장해도 새 필드가 남는다).
   localStorage가 막혀 있으면(사생활 보호 모드 등) 메모리로 계속 돈다. */
import { HERO_IDS, HERO_MAX_LV, heroesEarned, heroCap } from './roster.js';

const KEY = 'squad.v1';
const BAK = 'squad.bak';
const CORRUPT = 'squad.corrupt';
export const SAVE_V = 2;

export function defaults() {
  return {
    v: SAVE_V,
    maxL: 1,          // 열린 가장 높은 레벨
    cur: 1,           // 다음에 할 레벨
    stars: {},        // 레벨 → 별(0~3)
    best: {},         // 레벨 → 최고 남은 병력
    coins: 0,
    upg: { start: 0, fire: 0, coin: 0 },
    set: { sound: true, music: true, vibe: true, shake: true, low: false, preview: false, autoSkill: false },
    tips: {},         // 한 번 본 안내
    fails: {},        // 레벨 → 연속 실패 수
    plays: 0,
    heroes: { sel: '', lv: {} },     // 합류한 영웅 → 레벨
    seenHeroes: [],                  // 합류 안내를 본 영웅
    codex: { foe: [], unit: [], hero: [], biome: [] },
    stats: { wins: 0, kills: 0, bossKills: 0, maxN: 0, spGot: 0, heroUses: 0, resumes: 0 },
    lastRunId: '',
    backupAt: 0,
    nagged: 0,
    updated: 0,
  };
}

let memory = null;
let mode = 'ok';       // ok | memory | full
export const storageMode = () => mode;

/* 저장소를 실제로 쓸 수 있는지 한 번 확인한다 */
export function probe() {
  try {
    localStorage.setItem('squad.probe', '1');
    localStorage.removeItem('squad.probe');
    mode = 'ok';
  } catch (e) {
    mode = e && (e.name === 'QuotaExceededError' || e.code === 22) ? 'full' : 'memory';
  }
  return mode;
}

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.floor(num(v, a))));

/* 값 범위를 고치고, 지난 진행으로 얻었어야 할 영웅을 채운다 */
export function normalize(o) {
  const d = defaults();
  const out = {
    ...d, ...o,
    upg: { ...d.upg, ...(o.upg || {}) },
    set: { ...d.set, ...(o.set || {}) },
    stars: { ...(o.stars || {}) },
    best: { ...(o.best || {}) },
    tips: { ...(o.tips || {}) },
    fails: { ...(o.fails || {}) },
    heroes: { sel: (o.heroes && o.heroes.sel) || '', lv: { ...((o.heroes && o.heroes.lv) || {}) } },
    codex: { ...d.codex, ...(o.codex || {}) },
    stats: { ...d.stats, ...(o.stats || {}) },
    seenHeroes: Array.isArray(o.seenHeroes) ? o.seenHeroes.slice() : [],
  };
  if (num(o.v, 1) > SAVE_V) out.v = num(o.v);   // 더 새 버전의 저장은 버전을 낮추지 않는다
  else out.v = SAVE_V;
  out.coins = Math.max(0, Math.floor(num(out.coins)));
  out.maxL = clampInt(out.maxL, 1, 100000);
  out.cur = clampInt(out.cur, 1, out.maxL);
  out.plays = Math.max(0, Math.floor(num(out.plays)));
  for (const k of Object.keys(out.stars)) out.stars[k] = clampInt(out.stars[k], 0, 3);
  for (const k of Object.keys(out.upg)) out.upg[k] = clampInt(out.upg[k], 0, 10);
  for (const k of Object.keys(out.codex)) if (!Array.isArray(out.codex[k])) out.codex[k] = [];
  // 영웅: 모르는 id는 버리고, 레벨은 1..상한, 진행으로 얻은 영웅은 채운다
  const cap = heroCap(out.maxL);
  for (const id of Object.keys(out.heroes.lv)) {
    if (!HERO_IDS.includes(id)) delete out.heroes.lv[id];
    else out.heroes.lv[id] = clampInt(out.heroes.lv[id], 1, Math.min(HERO_MAX_LV, Math.max(cap, out.heroes.lv[id] | 0)));
  }
  for (const id of heroesEarned(out.maxL, totalStars(out))) if (!out.heroes.lv[id]) out.heroes.lv[id] = 1;
  if (!out.heroes.lv[out.heroes.sel]) out.heroes.sel = Object.keys(out.heroes.lv)[0] || '';
  return out;
}

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { raw = memory; }
  if (!raw) return normalize(defaults());
  try {
    return normalize(JSON.parse(raw));
  } catch {
    // 읽지 못한 원본은 지우지 않고 옆에 둔다
    try { localStorage.setItem(CORRUPT, raw); } catch { /* 무시 */ }
    const d = normalize(defaults());
    d.corrupt = true;
    return d;
  }
}

export function save(data) {
  data.updated = Date.now();
  const copy = { ...data };
  delete copy.corrupt;
  const raw = JSON.stringify(copy);
  memory = raw;
  try { localStorage.setItem(KEY, raw); mode = 'ok'; } catch (e) {
    mode = e && (e.name === 'QuotaExceededError' || e.code === 22) ? 'full' : 'memory';
    if (mode === 'full') {
      // 부수적인 칸부터 비우고 한 번 더
      // 되돌리기용 보관(BAK)은 남긴다 — 방금 약속한 되돌리기가 사라지지 않게
      try { localStorage.removeItem('squad.run.v1'); localStorage.removeItem(CORRUPT); localStorage.setItem(KEY, raw); mode = 'ok'; } catch { /* 메모리에만 */ }
    }
  }
}

export function wipe() {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
  return normalize(defaults());
}

/* 가져오기·초기화 전에 지금 진행을 한 칸 보관(되돌리기용). 저장소에 못 쓰면 이 탭 동안만 메모리에 둔다. */
let bakMemory = null;
let bakMemoryOnly = false;
export function keepBackup(data) {
  bakMemory = { at: Date.now(), data: JSON.parse(JSON.stringify(data)) };
  try { localStorage.setItem(BAK, JSON.stringify(bakMemory)); bakMemoryOnly = false; } catch { bakMemoryOnly = true; }
  return true;
}
export function readBackup() {
  let raw;
  try { raw = localStorage.getItem(BAK); } catch { return bakMemory; }
  if (!raw) return bakMemoryOnly ? bakMemory : null;
  try {
    const o = JSON.parse(raw);
    return o && o.data ? o : null;
  } catch { return null; }
}
export function dropBackup() { bakMemory = null; bakMemoryOnly = false; try { localStorage.removeItem(BAK); } catch { /* 무시 */ } }

/* 강화 */
export const UPGRADES = [
  { id: 'start', name: '시작 병력', max: 10, effect: (lv) => `${12 + 2 * lv}명으로 출발` },
  { id: 'fire', name: '화력', max: 10, effect: (lv) => `총알 피해 +${5 * lv}%` },
  { id: 'coin', name: '보급', max: 10, effect: (lv) => `받는 코인 +${10 * lv}%` },
];
export const upgCost = (lv) => Math.round(40 * Math.pow(1.5, lv));

export function totalStars(d) {
  let n = 0;
  for (const k in d.stars) n += d.stars[k] | 0;
  return n;
}

/* 도감·통계 기록 */
export function seen(data, kind, id) {
  const list = data.codex[kind];
  if (list && !list.includes(id)) { list.push(id); return true; }
  return false;
}
