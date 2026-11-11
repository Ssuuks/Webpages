/* 진행 저장 — 키는 'squad.v1' 그대로, v2는 필드를 더하기만 한다(옛 탭이 저장해도 새 필드가 남는다).
   localStorage가 막혀 있으면(사생활 보호 모드 등) 메모리로 계속 돈다. */
import { HERO_IDS, HERO_MAX_LV, HERO_LV_HARD, heroesEarned, heroCap } from './roster.js';

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
    set: { sound: true, music: true, vibe: true, shake: true, low: false, preview: false, autoSkill: false, hitbox: false },
    tips: {},         // 한 번 본 안내
    fails: {},        // 레벨 → 연속 실패 수
    plays: 0,
    heroes: { sel: '', lv: {} },     // 합류한 영웅 → 레벨
    seenHeroes: [],                  // 합류 안내를 본 영웅
    codex: { foe: [], unit: [], hero: [], biome: [] },
    stats: { wins: 0, kills: 0, bossKills: 0, maxN: 0, spGot: 0, heroUses: 0, resumes: 0, spUp: 0, flips: 0 },   // spUp·flips: SIM 9(특수병 레벨 업·빨간 게이트 역전)
    lastRunId: '',
    backupAt: 0,
    nagged: 0,
    updated: 0,
    /* 엔드게임(ENDGAME.md) — 모두 필드 추가다. 1회차의 진행은 위 maxL·cur·stars·best·fails 그대로(옛 탭이 읽고 써도 깨지지 않는다) */
    cycle: 1,                        // 지금 하는 회차(1부터)
    endSeen: 0,                      // 엔딩 화면을 본 가장 높은 회차
    cyc: {},                         // 2회차부터의 진행: { '2': { maxL, cur, stars, best, fails } }
    upgX: { start: 0, fire: 0, coin: 0 },   // 10단계 위로 산 강화(upg는 옛 탭이 0~10으로 자르므로 따로 둔다)
    heroX: {},                       // 영웅마다 Lv5 위로 올린 레벨(heroes.lv는 옛 탭이 5로 자른다)
    endless: { best: 0, bestN: 0, runs: 0 },   // 무한모드 최고 기록(잡은 보스 수·최대 병력)과 판 수
  };
}
/* 회차 하나는 L1~CYCLE_LEVELS. 그 회차의 L60을 깨면(maxL > 60) 끝난 회차다 */
export const CYCLE_LEVELS = 60;
const newProg = () => ({ maxL: 1, cur: 1, stars: {}, best: {}, fails: {} });
/* 회차 c의 진행 { maxL, cur, stars, best, fails } — 1회차는 저장 그 자체(옛 필드), 2회차부터는 data.cyc[c](없으면 만든다) */
export function prog(d, c = d.cycle) {
  const k = Math.max(1, c | 0);
  if (k <= 1) return d;
  if (!d.cyc[k]) d.cyc[k] = newProg();
  return d.cyc[k];
}
/* 끝낸(엔딩을 본 것으로 치는) 가장 높은 회차. 예전에 L60을 넘긴 저장(maxL > 60)은 1회차를 끝낸 것 */
export function endedCycles(d) {
  let c = 0;
  while ((c === 0 ? d.maxL : d.cyc && d.cyc[c + 1] ? d.cyc[c + 1].maxL : 0) > CYCLE_LEVELS) c++;
  return c;
}
/* 열린 가장 높은 회차 */
export const maxCycle = (d) => endedCycles(d) + 1;
/* 강화 단계(10단계 위 포함)와 영웅 레벨(Lv5 위 포함) */
export const upgLv = (d, id) => (d.upg[id] | 0) + (d.upgX ? d.upgX[id] | 0 : 0);
export function addUpg(d, id) { if ((d.upg[id] | 0) < 10) d.upg[id] = (d.upg[id] | 0) + 1; else d.upgX[id] = (d.upgX[id] | 0) + 1; }
export const heroLvOf = (d, id) => { const l = d.heroes.lv[id] | 0; return l + (l >= HERO_MAX_LV && d.heroX ? d.heroX[id] | 0 : 0); };
export function addHeroLv(d, id) { if ((d.heroes.lv[id] | 0) < HERO_MAX_LV) d.heroes.lv[id] = (d.heroes.lv[id] | 0) + 1; else d.heroX[id] = (d.heroX[id] | 0) + 1; }

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
    cyc: {},
    upgX: { ...d.upgX, ...(o.upgX && typeof o.upgX === 'object' ? o.upgX : {}) },
    heroX: { ...(o.heroX && typeof o.heroX === 'object' ? o.heroX : {}) },
    endless: { ...d.endless, ...(o.endless && typeof o.endless === 'object' ? o.endless : {}) },
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
  // 엔드게임 필드: 10단계 위 강화는 10단계를 채운 강화에만, Lv5 위 영웅 레벨은 Lv5인 영웅에만(산 것은 깎지 않는다)
  for (const k of Object.keys(out.upgX)) out.upgX[k] = out.upg[k] >= 10 ? clampInt(out.upgX[k], 0, 10000) : 0;
  for (const id of Object.keys(out.heroX)) {
    if (!HERO_IDS.includes(id) || (out.heroes.lv[id] | 0) < HERO_MAX_LV) delete out.heroX[id];
    else out.heroX[id] = clampInt(out.heroX[id], 0, HERO_LV_HARD - HERO_MAX_LV);
  }
  // 회차 진행: 앞 회차를 끝낸 데까지만 읽는다
  const src = o.cyc && typeof o.cyc === 'object' ? o.cyc : {};
  for (let c = 2; src[c] && typeof src[c] === 'object' && endedCycles(out) >= c - 1; c++) {
    const p = src[c];
    const q = { maxL: clampInt(p.maxL, 1, CYCLE_LEVELS + 1), cur: 1, stars: { ...(p.stars || {}) }, best: { ...(p.best || {}) }, fails: { ...(p.fails || {}) } };
    q.cur = clampInt(p.cur, 1, Math.min(CYCLE_LEVELS, q.maxL));
    for (const k of Object.keys(q.stars)) q.stars[k] = clampInt(q.stars[k], 0, 3);
    out.cyc[c] = q;
  }
  out.cycle = clampInt(out.cycle, 1, maxCycle(out));
  out.endSeen = clampInt(out.endSeen, 0, endedCycles(out));
  for (const k of ['best', 'bestN', 'runs']) out.endless[k] = Math.max(0, Math.floor(num(out.endless[k])));
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
/* 값: 1~10단계는 40·1.5^단계(그대로). 11단계부터는 열 단계마다 같은 걸음을 되풀이하되 회차만큼 비싸다 —
   40·1.5^(단계 % 10) × (1 + UPG_CYCLE_K·⌊단계/10⌋): 11단계 68, 20단계 2614, 21단계 96 …
   회차 c의 +10단계 × 3종 = 13,600 × (1 + 0.7·(c−1))코인. 보급(코인 +10%/단계)이 회차마다 +100%p씩 벌이를 키우는 것과 걸음이 맞는다
   (1회차의 '벌어서 사는 순서'가 회차마다 되풀이된다 — core.expectAt(L, c)의 가정) */
export const UPG_CYCLE_K = 0.7;
export const upgCost = (lv) => Math.round(40 * Math.pow(1.5, lv % 10) * (1 + UPG_CYCLE_K * Math.floor(lv / 10)));

/* 모은 별: 모든 회차의 합(예전에 L61+에서 받은 별도 남는다) */
export function totalStars(d) {
  let n = 0;
  for (const k in d.stars) n += d.stars[k] | 0;
  if (d.cyc) for (const c in d.cyc) for (const k in d.cyc[c].stars) n += d.cyc[c].stars[k] | 0;
  return n;
}
/* 회차 c에서 받은 별(L1~60) */
export function cycleStars(d, c) {
  const st = (c <= 1 ? d.stars : d.cyc && d.cyc[c] ? d.cyc[c].stars : null) || {};
  let n = 0;
  for (let L = 1; L <= CYCLE_LEVELS; L++) n += st[L] | 0;
  return n;
}

/* 도감·통계 기록 */
export function seen(data, kind, id) {
  const list = data.codex[kind];
  if (list && !list.includes(id)) { list.push(id); return true; }
  return false;
}
