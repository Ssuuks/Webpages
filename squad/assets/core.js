import { HEROES, heroLerp } from './roster.js';
import { CAL } from './caltable.js';

/* 숫자부대 돌격 — 시뮬레이션 코어 (DOM 없음)
   - 고정 틱 DT, 시드 난수(mulberry32). 상태는 평범한 객체라 structuredClone으로 복제된다.
   - 화면·소리·진동은 state.ev(이번 틱에 생긴 일)만 보고 반응한다.
   - 레벨은 레벨 번호로 정해진다(모두에게 같다). 보정은 그 레벨에서 사람들이 '실제로 들고 오는 힘'(EXPECT: 기대 강화 +
     기대 영웅의 상시 효과)을 단 기준 봇으로 한다. 판 중 위협도 그 힘으로 출발한 골든 패스로 정한다.
   - 레벨 태그(levelTag): 5레벨마다 어려움, 10레벨마다 매우 어려움, 그 다음 레벨은 쉼.
     일반·쉼 레벨의 보스는 기준 병력 × m, 어려움·매우 어려움은 기준 봇(스킬·상자·특수병을 다 쓰는)이 겨우 이기는 체력 H*에서 여유를 뺀다. */

export const DT = 1 / 60;
export const ROAD = 5;            // 도로 반폭
export const EDGE = 4.4;          // 분대 중심이 갈 수 있는 끝
export const SOLDIER_HP = 10;     // 부딪히면 남은 체력 10마다 병사 1명을 잃는다
export const MAX_N = 9999;
export const START_N = 12;
export const VOLLEY_HZ = 10;
export const BULLET_SPEED = 48;
export const BULLET_RANGE = 30;
export const WEAPON = [1, 1.35, 1.7, 2.1];
export const WAKE = 45;           // 이 거리 안에 들어온 적이 다가오기 시작
export const BOSS_GAP = 28;       // 보스가 나타나는 거리
export const VERSION = 'squad-v1';   // 레벨 배치의 소금 — 바꾸지 않는다(바꾸면 모든 레벨이 달라진다)
export const SIM = 5;                // 규칙이 바뀌면 올린다(이어하기 스냅숏·보정 표는 같은 SIM에서만 쓴다)
/* 보스: 피하기에 대가가 있게 — 좌우로 천천히 따라오고(초당 m), 총알은 가운데 ±BOSS_HIT m 안만 맞고, 첫 내려찍기는 빨리 온다 */
export const BOSS_TRACK = 0.6;
export const BOSS_HIT = 1.8;
export const BOSS_FIRST_SLAM = 1.2;
export const SLAM_HIT = 0.25;   // 내려찍기에 맞으면 병력의 이만큼(예고를 보고 피하면 0)
export const SLAM_OTHER = 0.1;  // 내려찍기가 분대가 없는 칸을 노리는 확률(나머지는 분대가 선 칸 — 가만히 서 있으면 맞는다)
export const BOSS_WALK_DIST = BOSS_GAP - 2.5;   // 나타나는 거리 − 닿는 거리(대략). 걷는 속도 = 이 거리 / (c × bossKill)

/* 메커닉이 처음 나오는 레벨 */
export const UNLOCK = {
  mul: 2, shoot: 2, wall: 3, summon: 3, hero: 3, crate: 4, runner: 4, spit: 5, cage: 5, medic: 5, saw: 6, brute: 7, div: 8,
  recruit: 9, sniper: 9, triple: 10, mul3: 10, rocket: 13,
};

/* 특수병과 수치(이름·소개는 roster.js) */
export const SP_MAX = 3;      // 분대에 최대 3명
export const SP_ESCORT = 4;   // 병사가 특수병 수 × 4보다 적으면 가장 늦게 온 특수병이 떠난다
export const SP = {
  medic: { share: 0.6 },
  sniper: { every: 1.2, dmg: 0.35, near: 2, far: 36 },
  rocket: { every: 2.4, dmg: 0.6, r: 2.2, speed: 30, near: 8, far: 30 },
};
export const SP_KINDS = Object.keys(SP);
export const BONUS_CAP = 0.1;
export const NABI_CAP = 0.02;   // 나비 레벨 1당 보스전 추가 피해 한도
const has = (L, m) => L >= UNLOCK[m];

/* ---------- 난수 ---------- */
export function hash(...xs) {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    const s = String(x);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x9e; h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
export function rand(o) {
  o.rs = (o.rs + 0x6D2B79F5) >>> 0;
  let t = o.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const U = (o, a, b) => a + (b - a) * rand(o);
const chance = (o, p) => rand(o) < p;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- 공통 수식 ---------- */
export function dps(n, tier = 0, fireLv = 0) {
  if (n <= 0) return 0;
  return 6 * Math.pow(n, 0.8) * WEAPON[clamp(tier, 0, 3)] * (1 + 0.05 * fireLv);
}
export function radius(n) { return Math.min(2.4, 0.35 + 0.18 * Math.sqrt(Math.max(1, n))); }
export function volleySize(n) { return Math.min(12, 2 + Math.floor(Math.sqrt(Math.max(1, n)))); }

/* 보기 좋은 숫자로 반올림 */
export function nice(x) {
  const a = Math.abs(x);
  const s = x < 0 ? -1 : 1;
  let r;
  if (a < 20) r = Math.round(a);
  else if (a < 100) r = Math.round(a / 5) * 5;
  else if (a < 1000) r = Math.round(a / 10) * 10;
  else r = Math.round(a / 50) * 50;
  return s * r;
}

/* 게이트 연산. 결과가 0 이하면 전멸(덧셈만 가능, 나눗셈은 올림이라 0이 되지 않는다) */
export function applyOp(n, op, v) {
  let r;
  if (op === 'add' || op === 'unit') r = n + v;
  else if (op === 'mul') r = n * v;
  else r = Math.ceil(n / v);
  return Math.min(MAX_N, r);
}
export function cellLabel(c) {
  if (c.op === 'add' || c.op === 'unit') return (c.v >= 0 ? '+' : '−') + Math.abs(c.v);
  if (c.op === 'mul') return '×' + c.v;
  return '÷' + c.v;
}
/* 게이트가 이로운지(파랑) 해로운지(빨강) — 숫자만으로 정한다 */
export function cellGood(c) {
  if (c.op === 'unit') return 1;
  if (c.op === 'add') return c.v > 0 ? 1 : c.v < 0 ? -1 : 0;
  if (c.op === 'mul') return c.v > 1 ? 1 : 0;
  return -1;
}
/* 접촉 비용: 남은 체력 10마다 병사 1명 */
export const contactCost = (hp) => Math.max(1, Math.ceil(hp / SOLDIER_HP));

/* ---------- 레벨 태그 ----------
   L%10==0 매우 어려움(지역 끝), L%5==0 어려움, 그 바로 다음 레벨은 쉼. L1-4는 태그 없음.
   coinMul: 그 레벨에서 받는 기본 코인 배수(coinsFor가 곱한다 — 화면은 배수만 보여 준다) */
const TAG_INFO = {
  '': { tag: '', label: '', coinMul: 1 },
  hard: { tag: 'hard', label: '어려움', coinMul: 1.5 },
  super: { tag: 'super', label: '매우 어려움', coinMul: 2 },
  rest: { tag: 'rest', label: '쉼', coinMul: 1 },
};
export function levelTag(L) {
  const l = Math.max(1, Math.floor(L));
  let t = '';
  if (l >= 5) {
    if (l % 10 === 0) t = 'super';
    else if (l % 5 === 0) t = 'hard';
    else if (l % 5 === 1) t = 'rest';
  }
  return { ...TAG_INFO[t] };
}
/* 태그 전체 효과(청크 ×0.75, 모든 청크의 위협 배수)는 L15부터. L5·L10은 소개 청크를 지키려고 보스와 마지막 두 청크에만 */
export const TAG_FULL_FROM = 15;
export const HARD_CHUNKS = 0.5;   // 어려움·매우 어려움(L15+)의 청크 수 배수
/* 판 중 위협 배수(적·벽·상자·철창 체력) */
const TAG_THREAT = { '': 1, hard: 1.15, super: 1.3, rest: 0.85 };

/* 보스 정하는 법(레벨 태그·구간별). 상수는 tools/bench.mjs로 difficulty_targets 구간에 맞췄다.
   mode 'ref': 체력 = dps(m × 기준 병력, 기대 화력) × bossKill — 상자·특수병 없이 기준 병력으로 깰 수 있는지 보정에서 확인한다.
   mode 'pop'(어려움·매우 어려움): 사람 흉내 봇 무리(POP)를 경기장까지 돌려 각자 이길 수 있는 가장 큰 체력을 잰 뒤, 무리의 승률이
   band에 가장 가깝게 되는 체력. 단 H*(기준 봇이 기대 강화·영웅, 스킬 자동, 상자·특수병을 다 써서 도착 병력의 10%를 남기고 이기는
   가장 큰 체력)를 넘지 않는다 — 기준 봇은 늘 이긴다. 상자·철창을 쓰지 않으면 어려울 수 있다(일반 레벨은 없이도 깬다).
   qaKeep('ref'만): 배치 검사에 걸리면(서 있기만 해도 이기면) 보스를 조금씩 세게 하되, 사람 흉내 무리의 산만한 사람(sl3)이 이만큼은 이기는 데까지만.
   c: 보스가 분대에 닿기까지 c × bossKill 초(격앙 전 걸음 기준) */
export const BOSS_SPEC = {
  onboard: { mode: 'ref', m: 0.9, c: 1.6, qaKeep: 0.94 },
  early: { mode: 'ref', m: 0.88, c: 0.95, qaKeep: 0.72 },    // L5-10 일반
  normal: { mode: 'ref', m: 0.9, c: 0.95, qaKeep: 0.58 },   // L11+ 일반
  rest: { mode: 'ref', m: 0.65, c: 1.15, qaKeep: 0.9 },
  // band: 사람 흉내 무리(POP)의 첫 시도 승률 목표 [하한, 상한] — on 집중(스킬 씀), off 집중(스킬 안 씀), sl3 산만
  // band.w를 주면 POP의 w 대신 그 가중치로 벌점을 매긴다
  hard5: { mode: 'pop', c: 0.9, band: { on: [0.7, 0.78], off: [0.6, 1], sl3: [0.45, 0.58] } },
  super10: { mode: 'pop', c: 0.9, band: { on: [0.58, 0.68], off: [0.45, 1], sl3: [0.22, 0.38] } },
  hard: { mode: 'pop', c: 0.9, band: { on: [0.5, 0.62], off: [0.4, 1], sl3: [0.18, 0.38] } },
  super: { mode: 'pop', c: 0.9, band: { on: [0.32, 0.48], off: [0.2, 1], sl3: [0, 0.24] } },
};
export function bossSpecFor(L, tag = levelTag(L).tag) {
  const l = Math.max(1, Math.floor(L));
  if (tag === 'super') return BOSS_SPEC[l < TAG_FULL_FROM ? 'super10' : 'super'];
  if (tag === 'hard') return BOSS_SPEC[l < TAG_FULL_FROM ? 'hard5' : 'hard'];
  if (tag === 'rest') return BOSS_SPEC.rest;
  if (l <= 4) return BOSS_SPEC.onboard;
  return BOSS_SPEC[l <= 10 ? 'early' : 'normal'];
}

/* ---------- 레벨 기준값 ---------- */
export function levelParams(L) {
  const l = Math.max(1, Math.floor(L));
  const kt = Math.min(l - 1, 29) / 29;          // 시간에 걸린 값(속도·보스·내려찍기): L1→0, L30 이후→1
  const over = Math.max(0, l - 30);
  const k = kt + Math.min(0.6, 0.01 * over);     // 위협 쪽 값은 L30 뒤에도 천천히 오른다
  const tg = levelTag(l);
  const tagFull = !!tg.tag && l >= TAG_FULL_FROM;
  const hardish = tg.tag === 'hard' || tg.tag === 'super';
  const baseChunks = Math.min(12, 7 + Math.floor(l / 3));
  const bossKill = 7 + 6 * kt + Math.min(2, over * 0.05);   // 기준 병력이 보스를 잡는 데 걸리는 초(m=1)
  const spec = bossSpecFor(l, tg.tag);
  return {
    L: l,
    k,
    kt,
    tag: tg.tag,
    tagFull,
    threat: TAG_THREAT[tg.tag] || 1,            // tagFull이 아니면 마지막 두 청크에만
    speed: 8.5 + 1.5 * kt,
    P: Math.round(30 + 8 * Math.pow(l - 1, 1.15)),    // 무난한 플레이로 보스에 도착하는 병력(강화 없을 때 추정)
    chunks: hardish && tagFull ? Math.round(baseChunks * HARD_CHUNKS) : baseChunks,   // 어려운 판은 짧게(L5·L10은 소개 레벨이라 그대로)
    pressure: Math.min(1.8, 0.55 + 0.65 * k + 0.005 * over),
    maxMul: l < UNLOCK.mul ? 0 : l < 10 ? 2 : 3,
    bossKill,
    boss: spec,
    bossWalk: BOSS_WALK_DIST / (spec.c * bossKill),
    slamEvery: 3.2 - 1.0 * kt,
    slamWarn: 1.25 - 0.4 * kt,
    slamThird: l >= UNLOCK.triple,
  };
}

/* ---------- 기대 강화(EXPECT) ----------
   EXPECT(L) = sloppy0.1 봇이 L1부터 코인으로 가장 싼 강화·영웅 레벨을 사며(재도전·지원 포함) 돈 캠페인에서, L 첫 시도 때 강화의
   중앙값(tools/caltable.mjs가 두 번 되풀이해 굳힌 뒤 caltable.js에 적는다). 표 밖 레벨은 마지막 값에서 늘려 잡는다.
   start·fire·coin은 강화 단계(시작 병력 = 12 + 2·start, 화력 +5%·fire). hero는 그때 가장 많이 데려가는 영웅과 레벨. */
let CALT = CAL;
/* 도구용: 보정 표를 통째로 바꾼다({ sim, expect, levels }). 캐시도 비운다 */
export function useCal(t) { CALT = t || { sim: -1, levels: {} }; cache.clear(); parCache.clear(); for (const k in ratioCache) delete ratioCache[k]; }
export const calTable = () => CALT;
const heroCapAt = (L) => Math.min(5, 2 + Math.floor((Math.max(1, L) - 1) / 10));   // roster.heroCap과 같다
function draftExpect(l) {
  const u = Math.min(10, Math.floor((l - 1) / 5));
  return { start: u, fire: u, coin: u, hero: l >= UNLOCK.hero ? 'mungchi' : '', heroLv: l >= UNLOCK.hero ? Math.max(1, heroCapAt(l) - 1) : 0 };
}
export function expectAt(L) {
  const l = Math.max(1, Math.floor(L));
  const T = CALT && CALT.sim === SIM && CALT.expect;
  if (!T) return draftExpect(l);
  const e = T[l];
  if (e) return { start: e.start | 0, fire: e.fire | 0, coin: e.coin | 0, hero: e.hero || '', heroLv: e.heroLv | 0 };
  // 표 밖: 가장 큰 레벨의 값에서 10레벨마다 1단계씩(최대 10), 영웅 레벨은 상한까지
  let top = 0;
  for (const k in T) if (+k > top && +k < l) top = +k;
  if (!top) return draftExpect(l);
  const b = T[top];
  const up = Math.floor((l - top) / 10);
  return {
    start: Math.min(10, (b.start | 0) + up), fire: Math.min(10, (b.fire | 0) + up), coin: Math.min(10, (b.coin | 0) + up),
    hero: b.hero || (l >= UNLOCK.hero ? 'mungchi' : ''), heroLv: b.hero || l >= UNLOCK.hero ? Math.min(heroCapAt(l), Math.max(1, (b.heroLv | 0) + up)) : 0,
  };
}
/* EXPECT(L)을 newGame 옵션으로 { start, fire, hero } */
export function expectLoadout(L) {
  const e = expectAt(L);
  const hero = Math.floor(L) >= UNLOCK.hero && e.hero && e.heroLv > 0 && HEROES[e.hero] ? { id: e.hero, lv: e.heroLv } : null;
  return { start: START_N + 2 * e.start, fire: e.fire, hero };
}
/* 지금 진행(열린 가장 높은 레벨 maxL)에서 코인으로 '새로' 살 수 있는 강화 단계 상한 = EXPECT(maxL) + 1.
   이미 더 산 저장은 그대로 둔다(상한은 새로 사는 것만 막는다). 세 강화 모두 같은 값 */
export function upgCap(maxL) {
  const e = expectAt(maxL);
  return clamp(Math.max(e.start, e.fire, e.coin) + 1, 1, 10);
}

/* ---------- 레벨 생성 ---------- */
/* 청크 종류: gate(게이트 줄) shoot(통짜 마이너스 게이트) guard(좋은 칸을 지키는 장애물) wave(좀비 무리)
   wall(바리케이드) crate(보급 상자) spit(독침 좀비) saw(톱날) rest(숨 돌리기) */
const GROW_KINDS = ['gate', 'guard'];
const THREAT_KINDS = ['wave', 'shoot', 'wall', 'crate', 'spit', 'saw'];
const KIND_UNLOCK = { gate: 1, wave: 1, rest: 1, shoot: UNLOCK.shoot, guard: UNLOCK.wall, wall: UNLOCK.wall, crate: UNLOCK.crate, spit: UNLOCK.spit, saw: UNLOCK.saw };
const KIND_WEIGHT = { gate: 3, guard: 1.3, wave: 2.6, shoot: 1, wall: 1, crate: 1.1, spit: 0.9, saw: 1.1 };
/* 레벨마다 처음 소개하는 청크 */
const INTRO = { 2: 'shoot', 3: 'wall', 4: 'crate', 5: 'spit', 6: 'saw' };
const FOE_INTRO = [UNLOCK.runner, UNLOCK.brute];

function weighted(o, kinds, L, avoid) {
  let list = kinds.filter((k) => L >= KIND_UNLOCK[k] && k !== avoid);
  if (!list.length) list = kinds.filter((k) => L >= KIND_UNLOCK[k]);
  let sum = 0;
  for (const k of list) sum += KIND_WEIGHT[k];
  let r = rand(o) * sum;
  for (const k of list) { r -= KIND_WEIGHT[k]; if (r <= 0) return k; }
  return list[list.length - 1];
}

function planChunks(p, g) {
  const K = p.chunks;
  const plan = [];
  const intro = INTRO[p.L];
  let lastThreat = '';
  for (let i = 0; i < K; i++) {
    let kind;
    if (i === 0) kind = 'gate';
    else if (i === K - 1) kind = 'gate';
    else if (intro && i === 1) kind = intro;
    else if (FOE_INTRO.includes(p.L) && i === 3) kind = 'wave';
    else if (i % 5 === 4) kind = 'rest';
    else if (GROW_KINDS.includes(plan[i - 1])) kind = weighted(g, THREAT_KINDS, p.L, p.L < 10 ? lastThreat : '');
    else kind = weighted(g, GROW_KINDS, p.L, '');
    if (THREAT_KINDS.includes(kind)) lastThreat = kind;
    plan.push(kind);
  }
  return plan;
}

function lanes(count) {
  const out = [];
  const w = (2 * ROAD) / count;
  for (let i = 0; i < count; i++) out.push({ x0: -ROAD + i * w, x1: -ROAD + (i + 1) * w });
  return out;
}

export function makeCell(op, v, ng, x0, x1, fire = 0) {
  const c = { op, v, v0: v, x0, x1, step: 0, acc: 0, cap: v, hitT: -9 };
  if (op === 'add') {
    // 사거리에 들어온 뒤로 끊김 없이 쏘면(약 3초) 기준 병력의 40%쯤 오른다(기대 화력 기준)
    c.step = (dps(ng, 0, fire) * 3.2) / (0.4 * Math.max(ng, 6));
    c.cap = v + Math.max(10, nice(ng * 0.6));
  }
  return c;
}
/* 레벨 생성 중 위협 체력의 기준 화력: 골든 패스 병력 × 기대 화력 × 그 청크의 태그 배수 */
const threatD = (lv, ng) => dps(ng, 0, lv.fireE || 0) * (lv.thr || 1);

/* 기준 플레이(골든 패스)가 이 칸을 고르면 몇 명이 되나 — 덧셈 칸은 쏴서 올린다고 본다 */
function goldenValue(n, c) {
  const v = c.op === 'add' ? Math.min(c.cap, c.v + Math.floor(0.3 * n)) : c.v;
  return applyOp(n, c.op, v);
}

function addFoe(lv, g, kind, x, z, hp) {
  const base = {
    grunt: { r: 0.42, spd: 2.6, home: 0.9, homeDist: 18 },
    runner: { r: 0.36, spd: 6.2, home: 2.8, homeDist: 26 },
    brute: { r: 0.95, spd: 1.6, home: 0.5, homeDist: 20 },
    spit: { r: 0.5, spd: 0, home: 0, homeDist: 0 },
  }[kind];
  const f = { id: lv.nextId++, kind, x: clamp(x, -4.6, 4.6), z, hp: Math.max(1, Math.round(hp)), max: 0, alive: true, awake: false, hitT: -9, cd: 0, seed: (rand(g) * 1000) | 0, ...base };
  f.max = f.hp;
  if (kind === 'spit') f.cd = 0.6 + rand(g) * 1.2;
  lv.foes.push(f);
  return f;
}

function spawnWave(lv, g, p, z, ng, scale, opt = {}) {
  const D = threatD(lv, ng);
  const hp = 0.15 * D;
  let m = Math.max(3, Math.round(13 * p.pressure * scale * U(g, 0.85, 1.15)));
  const placed = [];
  const lane = opt.lane;   // {x0,x1} 이면 그 차선에만
  const x0 = lane ? lane.x0 + 0.6 : -4.4;
  const x1 = lane ? lane.x1 - 0.6 : 4.4;
  let budget = m;
  const forced = lv.force;
  if (has(p.L, 'brute') && (forced.has('brute') || (!opt.noBrute && chance(g, 0.35 + 0.2 * p.k)))) {
    forced.delete('brute');
    placed.push(addFoe(lv, g, 'brute', U(g, x0, x1), z + U(g, 4, 8), hp * 10));
    budget -= 6;
  }
  if (has(p.L, 'runner') && (forced.has('runner') || (!opt.noRunner && chance(g, 0.5)))) {
    forced.delete('runner');
    const rn = Math.min(8, Math.max(2, Math.round(budget * 0.3)));
    for (let i = 0; i < rn; i++) placed.push(addFoe(lv, g, 'runner', U(g, -4, 4), z + 10 + i * 1.6, hp * 0.55));
    budget -= Math.ceil(rn / 2);
  }
  for (let i = 0; i < Math.max(2, budget); i++) placed.push(addFoe(lv, g, 'grunt', U(g, x0, x1), z + U(g, 0, 9), hp));
  return placed;
}

/* 무리가 기준 화력에 얼마나 새어 들어오나(손실 병력 추정) */
function waveLeak(foes, ng, approach = 2.4, fire = 0) {
  let total = 0;
  let cost = 0;
  for (const f of foes) total += f.hp;
  let cap = 0.75 * dps(ng, 0, fire) * approach;
  const sorted = foes.slice().sort((a, b) => a.hp - b.hp);
  for (const f of sorted) {
    if (cap >= f.hp) { cap -= f.hp; continue; }
    cost += contactCost(f.hp - Math.max(0, cap));
    cap = 0;
  }
  return Math.min(cost, Math.max(0, ng - 1));
}

function makeRow(lv, z, cells, ng, src = 'gate') {
  const row = { id: lv.nextId++, z, cells, done: false, chosen: -1, ng, src };
  lv.rows.push(row);
  return row;
}

function gateChoices(g, p, ng, target, ctx) {
  const ratio = target / ng;
  const out = [];
  const third = (has(p.L, 'triple') && chance(g, 0.3)) || ctx.force.has('triple');
  ctx.force.delete('triple');
  const wantMul = ctx.force.has('mul') || ctx.force.has('mul3');
  if (ctx.last && ctx.mulLeft > 0 && ng <= 3000) {
    // 보스 직전의 큰 한 방: ×2 대 쏴서 키우는 +
    ctx.mulLeft--;
    out.push(['mul', 2]);
    out.push(['add', Math.max(10, nice(ng * U(g, 0.6, 0.85)))]);
  } else if (ctx.mulLeft > (ctx.last ? 0 : ctx.reserve) && (wantMul || (ng <= 300 && (ratio > 1.4 || chance(g, 0.25))))) {
    ctx.mulLeft--;
    const m = ctx.force.has('mul3') || (has(p.L, 'mul3') && ng < 150 && chance(g, 0.3)) ? 3 : 2;
    ctx.force.delete('mul');
    if (m === 3) ctx.force.delete('mul3');
    out.push(['mul', m]);
    out.push(['add', Math.max(5, nice(ng * U(g, 0.45, 0.85)))]);
  } else if (ctx.force.has('div')) {
    ctx.force.delete('div');
    out.push(['add', Math.max(5, nice(ng * clamp(ratio - 1, 0.25, 1.5) * U(g, 0.85, 1.2)))]);
    out.push(['div', 2]);
  } else {
    const a = Math.max(5, nice(ng * clamp(ratio - 1, 0.25, 1.5) * U(g, 0.85, 1.2)));
    out.push(['add', a]);
    const r = rand(g);
    if (has(p.L, 'div') && r < 0.25) out.push(['div', 2]);
    else if (r < 0.65) out.push(['add', -Math.max(3, nice(ng * U(g, 0.2, 0.45)))]);
    else out.push(['add', Math.max(2, nice(a * U(g, 0.3, 0.6)))]);
  }
  if (third) {
    const r = rand(g);
    if (r < 0.5) out.push(['add', -Math.max(3, nice(ng * U(g, 0.3, 0.6)))]);
    else out.push(['add', Math.max(3, nice(ng * U(g, 0.15, 0.35)))]);
  }
  // '덜 나쁜 쪽' 줄: −a 대 ÷2 (L8부터 가끔, 마지막 두 청크에는 없음)
  if (has(p.L, 'div') && ctx.lessBad > 0 && !ctx.late && out.length === 2 && !out.some((o) => o[0] === 'div') && chance(g, 0.18)) {
    ctx.lessBad--;
    if (out.some((o) => o[0] === 'mul')) ctx.mulLeft++;
    out.length = 0;
    out.push(['div', 2]);
    out.push(['add', -Math.max(5, nice(ng * U(g, 0.25, 0.4)))]);
  }
  // 섞기
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand(g) * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/* 고정 위치 할당량(P03): 판 내내 한 자리에 서 있는 분대(x = −4.4·−2.5 → 왼쪽 무리, 0 → 가운데, +2.5·+4.4 → 오른쪽 무리)가
   얻는 몫이 어느 한 무리에 몰리지 않게 칸 순서를 고른다. 몫은 그 무리가 지나는 칸의 결과(덧셈 칸은 서서 쏘아 올린 값)로 본 성장 log(결과/병력)의 합 —
   정답 칸의 '수'가 아니라 '크기'로 맞춰야 ×2 한 줄이 작은 줄 셋을 이기지 않는다.
   두 칸 줄에서 x=0은 왼쪽 칸을 지난다(경계 규칙). 세 칸 줄의 가운데 정답은 세 칸 줄의 1/3 이하.
   점수가 같으면 원래(난수로 섞은) 순서를 쓴다. ctx.hold = [왼, 가운데, 오른] 성장 합, ctx.mid3 = 세 칸 줄 가운데 정답 수 */
const HOLD_X = [-2.5, 0, 2.5];
function holdBalance(ch, ng, ctx, fire = 0, goodIdx = -1) {
  const n = ch.length;
  if (n < 2) return ch;
  const perms = n === 2 ? [[0, 1], [1, 0]] : [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const ln = lanes(n);
  const hold = ctx.hold;
  const n0 = Math.max(1, ng);
  let best = null;
  perms.forEach((pm, pi) => {
    const cells = pm.map((j, i) => makeCell(ch[j][0], ch[j][1], ng, ln[i].x0, ln[i].x1, fire));
    // 서 있는 분대는 앞의 덧셈 칸을 3초쯤 쏘아 올린다(약 +0.45·병력)
    const val = cells.map((c) => (c.op === 'add' ? applyOp(ng, 'add', Math.min(c.cap, c.v + Math.floor(0.45 * ng))) : goldenValue(ng, c)));
    let bi = 0;
    for (let i = 1; i < n; i++) if (val[i] > val[bi]) bi = i;
    if (goodIdx >= 0) { bi = pm.indexOf(goodIdx); val[bi] = Math.max(val[bi], ...val) + 1; }   // guard 줄: 정해 둔 좋은 칸
    const row = { cells };
    const idx = HOLD_X.map((x) => pickCell(row, x));
    const g = idx.map((i) => Math.log(Math.max(1, val[i]) / n0));
    let sc = Math.max(...g.map((v, c) => hold[c] + v));
    if (n === 3 && idx[1] === bi && ctx.mid3 + 1 > Math.ceil((ctx.rows3 + 1) / 3)) sc += 0.5;
    sc += pi * 1e-6;   // 같으면 원래(난수) 순서
    if (!best || sc < best.sc) best = { sc, pm, g, mid: idx[1] === bi };
  });
  best.g.forEach((v, c) => { hold[c] += v; });
  if (n === 3) { ctx.rows3++; if (best.mid) ctx.mid3++; }
  return best.pm.map((j) => ch[j]);
}

const CHUNK = {
  rest(lv, g, p, z, ng) {
    return { len: 30, ng };
  },

  gate(lv, g, p, z, ng, target, ctx) {
    const rowZ = z + 30;
    // 첫 판 첫 줄은 고르기 쉬운 +10 대 −5
    let ch = p.L === 1 && !lv.rows.length ? [['add', 10], ['add', -5]] : gateChoices(g, p, ng, target, ctx);
    if (ch.length >= 2 && (lv.rows.length || p.L > 1)) {
      if (p.L === 1) {
        // 첫 판은 둘째 줄부터 늘 오른쪽이 정답(튜토리얼)
        if (applyOp(ng, ch[0][0], ch[0][1]) > applyOp(ng, ch[1][0], ch[1][1])) ch.reverse();
      } else ch = holdBalance(ch, ng, ctx, lv.fireE);
    }
    const ln = lanes(ch.length);
    const cells = ch.map(([op, v], i) => makeCell(op, v, ng, ln[i].x0, ln[i].x1, lv.fireE));
    makeRow(lv, rowZ, cells, ng);
    // 게이트 앞을 지키는 졸개 몇 명(L2부터)
    if (p.L >= 2 && chance(g, 0.35)) {
      const m = Math.round(U(g, 3, 6));
      const hp = 0.15 * threatD(lv, ng);
      for (let i = 0; i < m; i++) addFoe(lv, g, 'grunt', U(g, -4.2, 4.2), rowZ - 14 + U(g, 0, 4), hp);
      ng -= Math.min(2, Math.floor(m / 3));
    }
    let best = -Infinity;
    for (const c of cells) best = Math.max(best, goldenValue(ng, c));
    return { len: 48, ng: Math.max(1, best) };
  },

  shoot(lv, g, p, z, ng) {
    const rowZ = z + 34;
    const v0 = -Math.max(5, nice(ng * U(g, 0.15, 0.3)));
    makeRow(lv, rowZ, [makeCell('add', v0, ng, -ROAD, ROAD, lv.fireE)], ng, 'shoot');
    return { len: 50, ng: Math.max(1, goldenValue(ng, { op: 'add', v: v0, cap: v0 + ng })) };
  },

  guard(lv, g, p, z, ng, target, ctx) {
    const rowZ = z + 34;
    const ratio = target / ng;
    let good;
    if (ctx.mulLeft > ctx.reserve && ng <= 300) { ctx.mulLeft--; good = ['mul', 2]; }
    else good = ['add', Math.max(8, nice(ng * clamp(ratio - 1, 0.5, 1.5) * U(g, 1.2, 1.5)))];
    const poor = ['add', Math.max(2, nice(ng * U(g, 0.08, 0.22)))];
    // 좋은 칸의 쪽은 고정 위치 할당량(holdBalance)으로 — 같은 점수면 난수로 뽑은 쪽
    const order = chance(g, 0.5) ? [good, poor] : [poor, good];
    const pick = holdBalance(order, ng, ctx, lv.fireE, order.indexOf(good));
    const goodLeft = pick[0] === good;
    const ln = lanes(2);
    const cells = goodLeft
      ? [makeCell(good[0], good[1], ng, ln[0].x0, ln[0].x1, lv.fireE), makeCell(poor[0], poor[1], ng, ln[1].x0, ln[1].x1, lv.fireE)]
      : [makeCell(poor[0], poor[1], ng, ln[0].x0, ln[0].x1, lv.fireE), makeCell(good[0], good[1], ng, ln[1].x0, ln[1].x1, lv.fireE)];
    makeRow(lv, rowZ, cells, ng, 'guard');
    const lane = goodLeft ? ln[0] : ln[1];
    let loss = 0;
    if (chance(g, 0.5)) {
      // 바리케이드가 좋은 칸을 막는다
      const hp = threatD(lv, ng) * U(g, 0.8, 1.3);
      lv.props.push({ id: lv.nextId++, kind: 'wall', x0: lane.x0 + 0.15, x1: lane.x1 - 0.15, z: rowZ - 11, hp: Math.round(hp), max: Math.round(hp), alive: true, hitT: -9 });
    } else {
      const foes = spawnWave(lv, g, p, rowZ - 20, ng, 0.7, { lane, noBrute: p.L < 12 });
      loss = waveLeak(foes, ng, 2.4, lv.fireE);
    }
    const n2 = Math.max(1, ng - loss);
    return { len: 52, ng: Math.max(n2, goldenValue(n2, good[0] === 'mul' ? { op: 'mul', v: 2 } : { op: 'add', v: good[1], cap: good[1] })) };
  },

  wave(lv, g, p, z, ng) {
    let foes;
    if (chance(g, 0.45)) {
      foes = spawnWave(lv, g, p, z + 26, ng, 1);
    } else {
      // 양쪽으로 나뉜 무리 — 한쪽은 적다
      const ln = lanes(2);
      const big = chance(g, 0.5) ? 0 : 1;
      foes = spawnWave(lv, g, p, z + 26, ng, 0.75, { lane: ln[big] });
      foes = foes.concat(spawnWave(lv, g, p, z + 28, ng, 0.35, { lane: ln[1 - big], noBrute: true, noRunner: true }));
      foes = foes.filter((f) => (big === 0 ? f.x > 0 : f.x < 0) || f.kind === 'runner');
    }
    return { len: 46, ng: Math.max(1, ng - waveLeak(foes, ng, 2.4, lv.fireE)) };
  },

  wall(lv, g, p, z, ng) {
    const D = threatD(lv, ng);
    // 세 칸 벽은 분대가 작을 때만(큰 분대는 한 칸에 다 못 들어간다)
    const n = has(p.L, 'triple') && radius(ng) <= 1.4 && chance(g, 0.5) ? 3 : 2;
    const ln = lanes(n);
    const open = Math.floor(rand(g) * n);
    const wz = z + 30;
    ln.forEach((l, i) => {
      // 한 칸은 약한 벽(쏘면 금방 뚫림), 나머지는 단단하다
      const hp = i === open ? D * U(g, 0.5, 0.8) : D * U(g, 2.2, 3.4);
      lv.props.push({ id: lv.nextId++, kind: 'wall', x0: l.x0 + 0.15, x1: l.x1 - 0.15, z: wz, hp: Math.round(hp), max: Math.round(hp), alive: true, hitT: -9 });
    });
    if (p.L >= 5 && chance(g, 0.5)) {
      const hp = 0.15 * D;
      for (let i = 0; i < 4; i++) addFoe(lv, g, 'grunt', U(g, -4, 4), wz + 6 + U(g, 0, 6), hp);
    }
    return { len: 46, ng };
  },

  crate(lv, g, p, z, ng) {
    const D = threatD(lv, ng);
    const ln = lanes(2);
    const side = chance(g, 0.5) ? 0 : 1;
    const l = ln[side];
    const cz = z + 32;
    const r = rand(g);
    const reward = r < 0.5 ? { type: 'gun' } : r < 0.85 ? { type: 'men', v: Math.max(5, nice(ng * U(g, 0.25, 0.4))) } : { type: 'coin', v: 10 + 2 * p.L };
    const cx = (l.x0 + l.x1) / 2;
    const hp = Math.round(D * U(g, 1.0, 1.6));
    lv.props.push({ id: lv.nextId++, kind: 'crate', x0: cx - 1.1, x1: cx + 1.1, z: cz, hp, max: hp, alive: true, hitT: -9, reward });
    // 반대쪽에는 위협
    const other = ln[1 - side];
    if (has(p.L, 'saw') && chance(g, 0.4)) {
      lv.saws.push({ id: lv.nextId++, z: cz - 6, x: other.x0 + 1, xa: other.x0 + 0.6, xb: other.x1 - 0.6, spd: 3.5 + 1.5 * p.k, dir: 1, w: 1.1 });
    } else {
      spawnWave(lv, g, p, cz - 4, ng, 0.45, { lane: other, noBrute: true });
    }
    return { len: 48, ng: reward.type === 'men' ? ng + Math.round(reward.v * 0.6) : ng };
  },

  spit(lv, g, p, z, ng) {
    const D = threatD(lv, ng);
    const n = p.L >= 12 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const x = -3.4 + (6.8 * (i + 0.5)) / n + U(g, -0.6, 0.6);
      addFoe(lv, g, 'spit', x, z + 40 + U(g, -2, 2), 0.5 * D);
    }
    spawnWave(lv, g, p, z + 30, ng, 0.35, { noBrute: true });
    return { len: 50, ng: Math.max(1, ng - Math.ceil(ng * 0.03)) };
  },

  saw(lv, g, p, z, ng) {
    const n = p.L >= 14 && chance(g, 0.5) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const full = chance(g, 0.5);
      const half = chance(g, 0.5) ? -1 : 1;
      const xa = full ? -ROAD + 0.6 : half < 0 ? -ROAD + 0.6 : 0.2;
      const xb = full ? ROAD - 0.6 : half < 0 ? -0.2 : ROAD - 0.6;
      lv.saws.push({ id: lv.nextId++, z: z + 24 + i * 14, x: U(g, xa, xb), xa, xb, spd: 3.5 + 1.5 * p.k, dir: chance(g, 0.5) ? 1 : -1, w: 1.1 });
    }
    return { len: 46, ng: Math.max(1, ng - Math.ceil(ng * 0.03)) };
  },
};

/* 특수병 배치 — 기존 배치를 바꾸지 않도록 레벨 생성이 끝난 뒤 별도 난수 흐름으로 넣는다.
   쉼 청크에 철창(L5+), 일부 'men' 상자를 철창으로(L5+), 게이트 줄의 가장 덜 좋은 칸을 금색 특수병 칸으로(L9+). */
function placeSpecials(lv, p) {
  const kinds = SP_KINDS.filter((k) => p.L >= UNLOCK[k]);
  if (!kinds.length || p.L < UNLOCK.cage) return;
  const sg = { rs: hash(VERSION, 'sp', p.L, lv.attempt) };
  const intro = kinds.find((k) => UNLOCK[k] === p.L);
  let last = '';
  const pickKind = () => {
    let list = kinds.filter((k) => k !== last);
    if (!list.length) list = kinds;
    const k = list[Math.floor(rand(sg) * list.length)];
    last = k;
    return k;
  };
  let introPlaced = !intro;
  // 1) 쉼 청크의 철창
  for (const c of lv.chunks) {
    if (c.kind !== 'rest') continue;
    const force = !introPlaced;
    // 철창이 처음 나온 뒤 금색 칸이 열리기 전까지(L6~8)도 철창 하나는 꼭 둔다
    const early = p.L < UNLOCK.recruit && !lv.props.some((q) => q.kind === 'cage');
    if (!force && !early && !chance(sg, 0.5)) continue;
    const k = force ? intro : pickKind();
    if (force) { introPlaced = true; last = k; }
    const cx = chance(sg, 0.5) ? -2.5 : 2.5;
    const hp = Math.round(0.9 * dps(c.ng, 0, lv.fireE) * (c.thr || 1));
    lv.props.push({ id: lv.nextId++, kind: 'cage', x0: cx - 1, x1: cx + 1, z: c.z + 14, hp, max: hp, alive: true, hitT: -9, reward: { type: 'unit', k } });
  }
  // 2) 지원병 상자 일부를 철창으로
  for (const pr of lv.props) {
    if (pr.kind !== 'crate' || pr.reward.type !== 'men' || !chance(sg, 0.35)) continue;
    pr.kind = 'cage';
    pr.reward = { type: 'unit', k: pickKind() };
  }
  // 3) 금색 특수병 칸(L9+): 마지막·1칸·'덜 나쁜 쪽' 줄은 빼고, 레벨당 최대 2줄
  if (p.L >= UNLOCK.recruit) {
    let made = 0;
    const gold = [0, 0, 0];   // 고정 위치 무리(HOLD_X)마다 금색 칸을 지난 수 — 한 자리에 서 있기만 해서 금색을 둘 얻지 않게
    for (let i = 0; i < lv.rows.length - 1 && made < 2; i++) {
      const row = lv.rows[i];
      if (row.cells.length < 2 || row.cells.every((c) => cellGood(c) < 0) || !chance(sg, 0.45)) continue;
      // 가장 나쁜 칸을 금색으로 — 단, 가만히 선 분대(x=0)가 지나는 칸이면 이 줄은 건너뛴다(서 있기만 해도 얻으면 안 된다)
      let worst = 0;
      for (let j = 1; j < row.cells.length; j++) if (goldenValue(row.ng, row.cells[j]) < goldenValue(row.ng, row.cells[worst])) worst = j;
      if (worst === pickCell(row, 0)) continue;
      const by = HOLD_X.map((x) => pickCell(row, x) === worst);
      if (by.some((b, c) => b && gold[c] > 0)) continue;
      by.forEach((b, c) => { if (b) gold[c]++; });
      // 값은 가장 좋은 다른 칸보다 병력 30%만큼 적게 — 특수병과 병사 사이의 진짜 선택이 되게
      let best = -Infinity;
      for (let j = 0; j < row.cells.length; j++) if (j !== worst) best = Math.max(best, goldenValue(row.ng, row.cells[j]));
      const old = row.cells[worst];
      const v = Math.max(3, nice(best - row.ng - 0.3 * row.ng));
      row.cells[worst] = { ...makeCell('unit', v, row.ng, old.x0, old.x1, lv.fireE), k: pickKind() };
      made++;
      // 두 칸 줄의 금색은 늘 오른쪽(x=0은 왼쪽 칸을 지나므로) — 오른쪽에 서 있기만 해도 덕을 보지 않게, 오른쪽이 정답인
      // 다른 두 칸 게이트 줄 하나를 좌우로 바꿔 정답 하나를 왼쪽에 돌려준다(마지막 줄·금색 줄 제외, 뒤쪽 줄부터)
      if (row.cells.length === 2 && worst === 1) {
        for (let j = lv.rows.length - 2; j >= 0; j--) {
          const r = lv.rows[j];
          if (j === i || r.src !== 'gate' || r.cells.length !== 2 || r.cells.some((c) => c.op === 'unit')) continue;
          if (goldenValue(r.ng, r.cells[1]) <= goldenValue(r.ng, r.cells[0])) continue;
          const [a, b] = r.cells;
          r.cells = [{ ...b, x0: a.x0, x1: a.x1 }, { ...a, x0: b.x0, x1: b.x1 }];
          break;
        }
      }
    }
  }
}

export function buildLevel(L, attempt = 0) {
  const p = levelParams(L);
  const g = { rs: hash(VERSION, p.L, attempt) };
  // 골든 패스는 기대 강화(EXPECT)의 시작 병력·화력으로 출발한다 — 판 중 위협이 '실제로 들고 오는 힘'에 맞게
  const E = expectLoadout(p.L);
  const lv = {
    L: p.L, attempt, seed: hash(VERSION, 'run', p.L, attempt), speed: p.speed, params: p, tag: p.tag,
    rows: [], foes: [], props: [], saws: [], plan: [], golden: [], chunks: [], nextId: 1,
    arenaZ: 0, bossHp: 0, par: 0, arrive: 0, helpStart: 0,
    startE: E.start, fireE: E.fire, heroE: E.hero,
  };
  const plan = planChunks(p, g);
  lv.plan = plan;
  // 그 레벨에서 처음 소개하는 것은 반드시 한 번 나오게
  const force = new Set();
  for (const m of ['mul', 'runner', 'brute', 'div', 'triple', 'mul3']) if (UNLOCK[m] === p.L) force.add(m);
  lv.force = force;
  // ×는 하나를 보스 직전 줄 몫으로 남겨 둔다(L3부터)
  const reserve = p.maxMul >= 2 ? 1 : 0;
  const ctx = { mulLeft: p.maxMul, reserve, lessBad: p.L >= UNLOCK.div ? 1 : 0, late: false, last: false, force, hold: [0, 0, 0], rows3: 0, mid3: 0 };
  let z = 34;
  const n0 = E.start;
  let ng = n0;
  // 강화로 시작 병력이 늘면 도착 병력도 늘어난다(대략 √배)
  const PE = p.P * Math.sqrt(n0 / START_N);
  for (let i = 0; i < plan.length; i++) {
    ctx.late = i >= plan.length - 2;
    ctx.last = i === plan.length - 1 && reserve > 0;
    // 태그 위협 배수: 쉼은 모든 청크, 어려움·매우 어려움은 L15부터 모든 청크(L5·L10은 마지막 두 청크만 — 소개 청크를 지킨다)
    lv.thr = p.tag === 'rest' || p.tagFull || i >= plan.length - 2 ? p.threat : 1;
    const target = n0 * Math.pow(PE / n0, (i + 1) / plan.length);
    // 너무 앞서가면 다음 줄은 덜 주고, 처지면 더 준다
    const t = ng > target * 1.25 ? target * 0.9 : ng < target * 0.8 ? target * 1.15 : target;
    const rowsBefore = lv.rows.length;
    const r = CHUNK[plan[i]](lv, g, p, z, ng, t, ctx);
    lv.chunks.push({ kind: plan[i], z, len: r.len, ng, rows: lv.rows.length - rowsBefore, thr: lv.thr });
    z += r.len;
    ng = Math.max(1, Math.round(r.ng));
    lv.golden.push(ng);
  }
  lv.arenaZ = z + 12;
  placeSpecials(lv, p);
  lv.foes.sort((a, b) => a.z - b.z || a.id - b.id);
  lv.missing = [...force];   // 끝까지 못 넣은 소개 항목(테스트에서 비어 있어야 함)
  delete lv.force;
  delete lv.thr;
  return lv;
}

/* ---------- 게임 상태 ---------- */
export function newGame(lv, opt = {}) {
  const start = opt.start ?? START_N;
  const s = {
    L: lv.L, rs: lv.seed >>> 0, tick: 0, t: 0,
    phase: 'run', endT: 0, cause: '',
    speed: lv.speed, arenaZ: lv.arenaZ, stopZ: lv.arenaZ + 6,
    fireLv: opt.fire ?? 0,
    params: lv.params,
    squad: {
      x: 0, vx: 0, z: 0, vz: lv.speed, n: start, peak: start, tier: 0, fireAcc: 0, volley: 0, lossAcc: 0, hurtT: -9, lastGain: 0,
      sp: [], pool: 0, healAcc: 0, recent: 0, lossFrac: 0,
    },
    rockets: [],
    hero: opt.hero && HEROES[opt.hero.id] ? { id: opt.hero.id, lv: Math.max(1, Math.min(5, opt.hero.lv | 0 || 1)), charge: 0.35, act: 0, T: 0, cd: 0, shot: 0 } : null,
    rows: structuredClone(lv.rows),
    foes: structuredClone(lv.foes),
    props: structuredClone(lv.props),
    saws: structuredClone(lv.saws),
    spits: [],
    bullets: [],
    boss: null,
    bossHp: lv.bossHp,
    bossRef: lv.arrive || lv.params.P,
    refFire: lv.fireE || 0,
    nextId: lv.nextId + 1,
    ev: [],
    stats: { kills: 0, killHp: 0, lost: 0, gained: 0, coins: 0, crates: 0, gates: 0, bossT: 0, spawned: start, healed: 0, spGot: 0, spLost: 0, heroUses: 0, healedAtArena: 0 },
  };
  if (s.hero) {
    const h = s.hero;
    if (h.id === 'mungchi') {
      // 패시브 '집합 나팔': 덧셈 게이트가 빨리 오른다 — 칸마다 한 번에 반영
      const mul = heroLerp(1.1, 1.25, h.lv);
      for (const row of s.rows) for (const c of row.cells) if (c.op === 'add') c.step /= mul;
    }
  }
  return s;
}

/* 판 중간 저장: 상태는 평범한 JSON이라 그대로 복제한다(이번 틱 이벤트만 비운다) */
export function snapshot(s) {
  const o = JSON.parse(JSON.stringify(s));
  o.ev = [];
  return o;
}
export function restore(o) {
  const ok = o && typeof o === 'object' && o.squad && Array.isArray(o.rows) && Array.isArray(o.foes) && Array.isArray(o.props)
    && Array.isArray(o.saws) && Array.isArray(o.bullets) && Array.isArray(o.spits) && typeof o.squad.n === 'number' && o.params;
  if (!ok) return null;
  o.ev = [];
  const q = o.squad;
  const num0 = (obj, keys) => { for (const k of keys) if (typeof obj[k] !== 'number' || !Number.isFinite(obj[k])) obj[k] = 0; };
  if (!Array.isArray(o.rockets)) o.rockets = [];
  if (!Array.isArray(q.sp)) q.sp = [];
  num0(q, ['pool', 'healAcc', 'recent', 'lossFrac']);
  if (o.hero === undefined) o.hero = null;
  if (o.hero) num0(o.hero, ['charge', 'act', 'T', 'cd', 'shot']);
  if (o.boss) num0(o.boss, ['bonus']);
  if (typeof o.refFire !== 'number') o.refFire = 0;
  for (const b of o.bullets) if (typeof b.hm !== 'number') b.hm = 1;
  return o;
}

function emit(s, e) { s.ev.push(e); }

/* 병사를 잃는다. 게이트·톱날이 아닌 손실은 보리 스킬로 줄고, 일부는 회복 풀(의무병·보리)로 간다.
   한 번에 크게 맞거나 내려찍기에 맞으면 가장 늦게 온 특수병이 쓰러진다. */
function lose(s, k, cause, x, z, sub) {
  const q = s.squad;
  if (k <= 0 || q.n <= 0) return;
  const soft = cause !== 'gate' && cause !== 'saw';
  const h = s.hero;
  if (soft && h && h.id === 'bori' && h.act > 0) {
    const a = k * 0.3 + q.lossFrac;
    k = Math.floor(a);
    q.lossFrac = a - k;
    if (k <= 0) return;
  }
  const before = q.n;
  const real = Math.min(q.n, k);
  q.n -= real;
  q.hurtT = s.t;
  s.stats.lost += real;
  emit(s, { t: 'loss', n: real, cause, x: x ?? q.x, z: z ?? q.z });
  if (q.n <= 0) { s.cause = cause; return; }
  if (cause !== 'gate') {
    q.recent += real;
    // 짓밟기(보스가 닿은 뒤)로 잃은 병사는 회복 풀로 가지 않는다 — 닿기 전에 잡는 것이 보스전의 목표
    const share = sub === 'stomp' ? 0 : Math.min(0.8, (hasSp(q, 'medic') ? SP.medic.share : 0) + (h && h.id === 'bori' ? heroLerp(0.12, 0.3, h.lv) : 0));
    q.pool += real * share;
  }
  if (soft && q.sp.length && (sub === 'slam' || real >= Math.max(3, Math.ceil(0.15 * before)))) spDrop(s, 'hit');
  escort(s);
}

const hasSp = (q, k) => q.sp.some((m) => m.k === k);

function spDrop(s, cause) {
  const q = s.squad;
  const m = q.sp.pop();
  if (!m) return;
  s.stats.spLost++;
  emit(s, { t: 'spLose', k: m.k, cause, x: q.x, z: q.z });
}

/* 병사가 너무 적으면 특수병이 떠난다 */
function escort(s) {
  const q = s.squad;
  while (q.sp.length && q.n < SP_ESCORT * q.sp.length) spDrop(s, 'escort');
}

/* 특수병 합류. 자리가 없거나 같은 병과가 있으면 병사로 바꿔 준다 */
function addSpecial(s, k, via, x, z) {
  const q = s.squad;
  if (q.sp.length >= SP_MAX || hasSp(q, k) || q.n < SP_ESCORT * (q.sp.length + 1)) {
    const n = Math.max(5, nice(0.12 * q.n));
    gain(s, n, x, z, 'spFull');
    emit(s, { t: 'spFull', k, n, x: x ?? q.x, z: z ?? q.z });
    return;
  }
  q.sp.push({ id: s.nextId++, k, cd: 0.6 });
  s.stats.spGot++;
  emit(s, { t: 'spGet', k, via, x: x ?? q.x, z: z ?? q.z });
  const h = s.hero;
  if (h && HEROES[h.id].match === k) chargeHero(s, 0.25);
}

function gain(s, k, x, z, why) {
  const q = s.squad;
  const before = q.n;
  q.n = Math.min(MAX_N, q.n + k);
  s.stats.gained += q.n - before;
  q.peak = Math.max(q.peak, q.n);
  emit(s, { t: 'gain', n: q.n - before, why, x: x ?? q.x, z: z ?? q.z });
}

/* 입력: { dir: -1|0|1, tx: 목표 x 또는 null, skill: 영웅 스킬 버튼(이번 틱에 눌림) } */
export function step(s, input) {
  s.ev.length = 0;
  if (s.phase === 'won' || s.phase === 'lost') { s.endT += DT; s.tick++; s.t += DT; return s; }
  s.tick++;
  s.t += DT;
  const q = s.squad;
  const R = radius(q.n);

  /* 좌우 이동 */
  const tx = input && input.tx != null ? clamp(input.tx, -EDGE, EDGE) : null;
  if (tx != null) {
    const want = clamp((tx - q.x) * 12, -16, 16);
    q.vx = want;
  } else {
    const dir = input ? input.dir | 0 : 0;
    if (dir) q.vx = clamp(q.vx + dir * 80 * DT, -11, 11);
    else q.vx = Math.abs(q.vx) <= 100 * DT ? 0 : q.vx - Math.sign(q.vx) * 100 * DT;
    if (dir && Math.sign(q.vx) !== dir && q.vx !== 0) q.vx += dir * 60 * DT;   // 방향 전환은 더 빠르게
  }
  q.x += q.vx * DT;
  if (q.x < -EDGE) { q.x = -EDGE; if (q.vx < 0) q.vx = 0; }
  if (q.x > EDGE) { q.x = EDGE; if (q.vx > 0) q.vx = 0; }

  /* 전진 */
  if (s.phase === 'run') {
    q.vz = s.speed;
    q.z += q.vz * DT;
    if (q.z >= s.arenaZ) enterArena(s);
  } else if (s.phase === 'arena') {
    const left = s.stopZ - q.z;
    q.vz = left > 0 ? Math.min(s.speed, Math.max(1.5, left * 2.2)) : 0;
    q.z = Math.min(s.stopZ, q.z + q.vz * DT);
  }

  rowsUpdate(s);
  propsUpdate(s, R);
  sawsUpdate(s, R);
  foesUpdate(s, R);
  spitsUpdate(s, R);
  if (wiped(s)) return s;
  if (s.hero) heroUpdate(s, input);
  if (s.boss) {
    // 특수병·영웅이 보스에게 더 줄 수 있는 몫: 병사 화력의 +BONUS_CAP까지(나비는 레벨마다 +NABI_CAP)
    const cap = BONUS_CAP + (s.hero && s.hero.id === 'nabi' ? NABI_CAP * (s.hero.lv - 1) : 0);
    const base = cap * dps(q.n, q.tier, s.fireLv);
    s.boss.bonus = Math.min(s.boss.bonus + base * DT, base * 1.5);
  }
  fire(s, R);
  bulletsUpdate(s);
  specialsUpdate(s, R);
  if (s.boss) bossUpdate(s, R);
  wiped(s);
  return s;
}

/* 병사가 모두 쓰러졌으면 그 틱에서 바로 끝낸다(날아가던 총알이 보스를 잡거나 상자로 되살아나지 않게) */
function wiped(s) {
  const q = s.squad;
  if (q.n > 0 || s.phase === 'lost') return false;
  q.n = 0;
  s.phase = 'lost';
  s.endT = 0;
  s.bullets.length = 0;
  if (!s.cause) s.cause = 'foe';
  emit(s, { t: 'lose', cause: s.cause });
  return true;
}

function enterArena(s) {
  s.phase = 'arena';
  const p = s.params;
  const hp = s.bossHp > 0 ? s.bossHp : Math.round(dps(s.bossRef, 0, s.refFire || 0) * p.bossKill);
  s.boss = {
    z: s.stopZ + BOSS_GAP, x: 0, hp, max: hp, r: 2.5, walk: p.bossWalk || 1.3, hitT: -9,
    slam: null, slamCd: BOSS_FIRST_SLAM, summonCd: 4.5, enraged: false, clashCd: 0, clash: false, t: 0, bonus: 0,
  };
  s.stats.healedAtArena = s.stats.healed;
  // 경기장 입장 +0.5 — 스킬이 켜져 있어도 쌓아 두고, 끝나면 이어서 찬다
  const h = s.hero;
  if (h && h.charge < 1) {
    h.charge = Math.min(1, h.charge + 0.5);
    if (h.charge >= 1 && h.act <= 0) emit(s, { t: 'heroReady', id: h.id });
  }
  // 남은 잡몹은 정리한다(경기장에서는 보스에게 집중)
  for (const f of s.foes) if (f.alive && f.z > s.stopZ + 4) f.alive = false;
  emit(s, { t: 'boss' });
}

/* 분대 중심이 지나는 칸. 경계 위(출발 자리 x=0 포함)는 왼쪽 칸 — 화면의 칸 강조도 같은 규칙을 쓴다 */
export function pickCell(row, x) {
  let idx = 0;
  for (let i = 1; i < row.cells.length; i++) if (x > row.cells[i].x0) idx = i;
  return idx;
}

function rowsUpdate(s) {
  const q = s.squad;
  for (const row of s.rows) {
    if (row.done || q.z < row.z) continue;
    row.done = true;
    const idx = pickCell(row, q.x);
    row.chosen = idx;
    const c = row.cells[idx];
    const before = q.n;
    const after = applyOp(before, c.op, c.v);
    s.stats.gates++;
    // alt: 이 순간 줄의 칸마다 결과(쏴서 올린 값 그대로) — 근소한 패배 화면의 '다른 칸이었다면'
    emit(s, { t: 'gate', op: c.op, v: c.v, k: c.k, before, after, good: after >= before, x: (c.x0 + c.x1) / 2, z: row.z, row: row.id, alt: row.cells.map((d) => applyOp(before, d.op, d.v)) });
    if (after > before) gain(s, after - before, q.x, row.z, 'gate');
    else if (after < before) {
      if (after <= 0) { lose(s, before, 'gate'); }
      else lose(s, before - after, 'gate');
    }
    if (c.op === 'unit' && q.n > 0) addSpecial(s, c.k, 'gate', q.x, row.z);
  }
}

function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

function propsUpdate(s, R) {
  const q = s.squad;
  for (const p of s.props) {
    if (!p.alive || p.passed) continue;
    if (q.z + 0.55 * R < p.z) continue;
    const ov = overlap(q.x - R, q.x + R, p.x0, p.x1) / (2 * R);
    // 비켜 간 벽·상자는 그대로 남아 뒤로 지나간다(그리기만 한다)
    if (ov <= 0) { p.passed = true; continue; }
    p.alive = false;
    if (p.kind === 'crate') { emit(s, { t: 'crateMiss', x: (p.x0 + p.x1) / 2, z: p.z }); continue; }
    if (p.kind === 'cage') { emit(s, { t: 'cageMiss', k: p.reward.k, x: (p.x0 + p.x1) / 2, z: p.z }); continue; }
    const k = Math.ceil((p.hp / SOLDIER_HP) * Math.min(1, ov * 2));
    emit(s, { t: 'wallCrash', x: (p.x0 + p.x1) / 2, z: p.z, n: k });
    lose(s, Math.max(1, k), 'wall');
  }
}

function sawsUpdate(s, R) {
  const q = s.squad;
  for (const w of s.saws) {
    w.x += w.dir * w.spd * DT;
    if (w.x > w.xb) { w.x = w.xb; w.dir = -1; }
    if (w.x < w.xa) { w.x = w.xa; w.dir = 1; }
    if (Math.abs(w.z - q.z) < 0.55 * R + 0.35 && Math.abs(w.x - q.x) < R + w.w / 2) {
      q.lossAcc += (4 + 0.35 * q.n) * DT;
      if (q.lossAcc >= 1) {
        const k = Math.floor(q.lossAcc);
        q.lossAcc -= k;
        lose(s, k, 'saw', w.x, w.z);
      }
    }
  }
}

function foesUpdate(s, R) {
  const q = s.squad;
  for (const f of s.foes) {
    if (!f.alive) continue;
    const dz = f.z - q.z;
    if (!f.awake) {
      if (dz < WAKE) f.awake = true;
      else continue;
    }
    if (f.kind === 'spit') {
      if (s.phase === 'run' && dz < 32 && dz > 6) {
        f.cd -= DT;
        if (f.cd <= 0) {
          f.cd = 2.4;
          const T = 1.0;
          s.spits.push({ id: s.nextId++, x: q.x, z: q.z + q.vz * T, sx: f.x, sz: f.z, t: T, T });
          emit(s, { t: 'spitFire', x: f.x, z: f.z });
        }
      }
    } else {
      f.z -= f.spd * DT;
      if (dz < f.homeDist) {
        const d = q.x - f.x;
        const m = f.home * DT;
        f.x += d > m ? m : d < -m ? -m : d;
      }
    }
    if (Math.abs(f.z - q.z) < 0.55 * R + f.r && Math.abs(f.x - q.x) < R + f.r * 0.8) {
      f.alive = false;
      emit(s, { t: 'bite', kind: f.kind, x: f.x, z: f.z });
      lose(s, contactCost(f.hp), s.phase === 'arena' ? 'summon' : f.kind === 'brute' ? 'brute' : 'foe', f.x, f.z);
      continue;
    }
    if (f.z < q.z - 4) f.alive = false;   // 지나쳐 갔다
  }
  // 죽은 적은 가끔 걸러낸다
  if ((s.tick & 63) === 0) s.foes = s.foes.filter((f) => f.alive || f.z > q.z + 60);
}

function spitsUpdate(s, R) {
  const q = s.squad;
  for (const sp of s.spits) {
    sp.t -= DT;
    if (sp.t > 0) continue;
    const ov = overlap(q.x - R, q.x + R, sp.x - 1.2, sp.x + 1.2) / (2 * R);
    const hit = ov > 0 && Math.abs(sp.z - q.z) < R + 1.5;
    emit(s, { t: 'spitHit', x: sp.x, z: sp.z, hit });
    if (hit) lose(s, Math.max(1, Math.ceil(0.3 * ov * q.n)), 'spit', sp.x, sp.z);
  }
  if (s.spits.length) s.spits = s.spits.filter((sp) => sp.t > 0);
}

function fire(s, R) {
  const q = s.squad;
  if (q.n <= 0) return;
  q.fireAcc += DT;
  const per = 1 / VOLLEY_HZ;
  while (q.fireAcc >= per) {
    q.fireAcc -= per;
    q.volley++;
    const b = volleySize(q.n);
    const hm = heroDmg(s);
    const dmg = (dps(q.n, q.tier, s.fireLv) * hm) / (VOLLEY_HZ * b);
    const span = R + 0.3;
    for (let i = 0; i < b; i++) {
      // 고르게 퍼뜨리되 매번 조금씩 어긋나게(황금비 수열 — 난수를 쓰지 않는다)
      const j = ((q.volley * 0.618034 + i * 0.381966) % 1) - 0.5;
      const x = q.x - span + ((i + 0.5 + j * 0.8) / b) * 2 * span;
      s.bullets.push({ x, z: q.z + 0.4 * R, d: 0, dmg, hm });
    }
    emit(s, { t: 'shot', b });
  }
}

function bulletsUpdate(s) {
  const q = s.squad;
  const adv = BULLET_SPEED * DT;
  const list = s.bullets;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const z0 = b.z;
    const z1 = z0 + adv;
    let bestZ = Infinity;
    let hitKind = 0;
    let hitObj = null;
    let hitCell = null;
    // 게이트(덧셈 칸만 총알을 받는다)
    for (const row of s.rows) {
      if (row.done || row.z <= z0 || row.z > z1 + 0.0001) continue;
      for (const c of row.cells) {
        if (c.op !== 'add' || b.x < c.x0 || b.x >= c.x1) continue;
        if (row.z < bestZ) { bestZ = row.z; hitKind = 1; hitObj = row; hitCell = c; }
      }
    }
    for (const p of s.props) {
      if (!p.alive || p.passed || p.z <= z0 - 0.4 || p.z > z1 + 0.4 || b.x < p.x0 || b.x > p.x1) continue;
      if (p.z < bestZ) { bestZ = p.z; hitKind = 2; hitObj = p; }
    }
    for (const f of s.foes) {
      if (!f.alive || f.z < z0 - f.r || f.z > z1 + f.r) continue;
      if (Math.abs(f.x - b.x) > f.r + 0.12) continue;
      if (f.z < bestZ) { bestZ = f.z; hitKind = 3; hitObj = f; }
    }
    const bo = s.boss;
    if (bo && bo.hp > 0 && bo.z - 1 <= z1 && Math.abs(bo.x - b.x) < BOSS_HIT && bo.z - 1 < bestZ) { bestZ = bo.z - 1; hitKind = 4; hitObj = bo; }

    if (hitKind === 1) {
      const c = hitCell;
      c.acc += b.dmg;
      c.hitT = s.t;
      let ticks = 0;
      while (c.acc >= c.step && c.v < c.cap) { c.acc -= c.step; c.v++; ticks++; }
      if (c.v >= c.cap) c.acc = 0;
      if (ticks) emit(s, { t: 'tick', row: hitObj.id, v: c.v, x: b.x, z: hitObj.z });
      continue;
    }
    if (hitKind === 2) { hitProp(s, hitObj, b.dmg); continue; }
    if (hitKind === 3) { hitFoe(s, hitObj, b.dmg, 'gun'); continue; }
    if (hitKind === 4) {
      // 뭉치 스킬로 늘어난 몫은 특수병·영웅 보너스 예산에서만 들어간다(보스가 너무 빨리 녹지 않게)
      const base = b.hm > 1 ? b.dmg / b.hm : b.dmg;
      bo.hp -= base;
      if (base < b.dmg) hitBossBonus(s, b.dmg - base);
      bo.hitT = s.t;
      continue;
    }
    b.z = z1;
    b.d += adv;
    if (b.d < BULLET_RANGE) list[w++] = b;
  }
  list.length = w;
  void q;
}

/* 피해 공용 처리(총알·저격·로켓·영웅) */
function hitProp(s, p, dmg) {
  p.hp -= dmg;
  p.hitT = s.t;
  if (p.hp > 0) return;
  p.alive = false;
  if (p.kind === 'wall') emit(s, { t: 'wallBreak', x: (p.x0 + p.x1) / 2, z: p.z });
  else openCrate(s, p);
}
function hitFoe(s, f, dmg, by) {
  f.hp -= dmg;
  f.hitT = s.t;
  if (f.hp > 0) return false;
  f.alive = false;
  s.stats.kills++;
  s.stats.killHp += f.max;
  emit(s, { t: 'kill', kind: f.kind, x: f.x, z: f.z, by });
  chargeHero(s, 0.01);
  return true;
}
/* 특수병·영웅이 보스에게 주는 피해는 병사 화력의 +BONUS_CAP(10%)까지(쌓인 몫 b.bonus 안에서) */
function hitBossBonus(s, dmg) {
  const b = s.boss;
  if (!b || b.hp <= 0) return 0;
  const d = Math.min(dmg, b.bonus);
  if (d <= 0) return 0;
  b.bonus -= d;
  b.hp -= d;
  b.hitT = s.t;
  return d;
}

function openCrate(s, p) {
  const q = s.squad;
  const r = p.reward;
  s.stats.crates++;
  const x = (p.x0 + p.x1) / 2;
  if (r.type === 'unit') {
    emit(s, { t: 'cageOpen', k: r.k, x, z: p.z });
    addSpecial(s, r.k, 'cage', x, p.z);
    return;
  }
  if (r.type === 'gun') {
    if (q.tier < 3) { q.tier++; emit(s, { t: 'crate', type: 'gun', tier: q.tier, x, z: p.z }); }
    else { gain(s, Math.max(5, nice(q.n * 0.2)), x, p.z, 'crate'); emit(s, { t: 'crate', type: 'men', x, z: p.z }); }
  } else if (r.type === 'men') {
    gain(s, r.v, x, p.z, 'crate');
    emit(s, { t: 'crate', type: 'men', v: r.v, x, z: p.z });
  } else {
    s.stats.coins += r.v;
    emit(s, { t: 'crate', type: 'coin', v: r.v, x, z: p.z });
  }
}

function bossUpdate(s, R) {
  const q = s.squad;
  const b = s.boss;
  const p = s.params;
  if (b.hp <= 0) {
    if (s.phase !== 'won') {
      s.phase = 'won';
      s.endT = 0;
      s.stats.bossT = b.t;
      emit(s, { t: 'bossDead', x: b.x, z: b.z });
      emit(s, { t: 'win' });
    }
    return;
  }
  b.t += DT;
  if (!b.enraged && b.hp < b.max * 0.5) { b.enraged = true; emit(s, { t: 'enrage' }); }
  // 분대 쪽으로 천천히 따라온다(피하면 한동안 총알이 덜 맞는다)
  const d = q.x - b.x;
  const m = BOSS_TRACK * DT;
  b.x = clamp(b.x + (d > m ? m : d < -m ? -m : d), -2.5, 2.5);
  const reach = q.z + 0.55 * R + b.r * 0.6;
  if (b.z > reach) {
    b.z = Math.max(reach, b.z - b.walk * (b.enraged ? 1.25 : 1) * DT);
  } else if (!b.clash) {
    b.clash = true;
    b.slam = null;
    b.clashCd = 0.3;
    emit(s, { t: 'clash' });
  }
  if (b.clash) {
    b.clashCd -= DT;
    if (b.clashCd <= 0) {
      b.clashCd = 0.5;
      emit(s, { t: 'stomp', x: b.x, z: b.z });
      lose(s, Math.ceil(0.12 * q.n) + 1, 'boss', undefined, undefined, 'stomp');
    }
    return;
  }
  // 내려찍기
  if (b.slam) {
    b.slam.t -= DT;
    if (b.slam.t <= 0) {
      const hit = q.x >= b.slam.x0 && q.x <= b.slam.x1;
      emit(s, { t: 'slam', x0: b.slam.x0, x1: b.slam.x1, hit });
      if (hit) lose(s, Math.ceil(SLAM_HIT * q.n), 'boss', q.x, q.z, 'slam');
      b.slam = null;
      b.slamCd = p.slamEvery * (b.enraged ? 0.8 : 1);
    }
  } else {
    b.slamCd -= DT;
    if (b.slamCd <= 0) {
      const parts = p.slamThird ? 3 : 2;
      const ln = lanes(parts);
      let idx = 0;
      for (let i = 0; i < parts; i++) if (q.x >= ln[i].x0) idx = i;
      if (rand(s) < SLAM_OTHER) idx = (idx + 1 + Math.floor(rand(s) * (parts - 1))) % parts;
      const warn = p.slamWarn;
      b.slam = { x0: ln[idx].x0, x1: ln[idx].x1, t: warn, T: warn };
      emit(s, { t: 'slamWarn', x0: ln[idx].x0, x1: ln[idx].x1 });
    }
  }
  // 졸개 소환
  if (s.L >= UNLOCK.summon) {
    b.summonCd -= DT;
    if (b.summonCd <= 0 && b.z - q.z > 9) {
      b.summonCd = 5.5;
      const m = Math.min(8, 3 + Math.floor(s.L / 5));
      const hp = 0.08 * dps(s.bossRef, 0, s.refFire || 0);
      for (let i = 0; i < m; i++) {
        const f = { id: s.nextId++, kind: 'grunt', x: clamp(b.x + (rand(s) - 0.5) * 6, -4.4, 4.4), z: Math.max(q.z + 0.55 * R + 5, b.z - 2 - rand(s) * 3), hp: Math.max(1, Math.round(hp)), max: 0, alive: true, awake: true, hitT: -9, cd: 0, seed: (rand(s) * 1000) | 0, r: 0.42, spd: 2.6, home: 0.9, homeDist: 18 };
        f.max = f.hp;
        s.foes.push(f);
      }
      emit(s, { t: 'summon', n: m });
    }
  }
}

/* ---------- 영웅 ---------- */
function chargeHero(s, a) {
  const h = s.hero;
  if (!h || h.act > 0 || h.charge >= 1) return;
  h.charge = Math.min(1, h.charge + a);
  if (h.charge >= 1) emit(s, { t: 'heroReady', id: h.id });
}

export function heroDmg(s) {
  const h = s.hero;
  return h && h.id === 'mungchi' && h.act > 0 ? heroLerp(1.25, 1.4, h.lv) : 1;
}

function heroUpdate(s, input) {
  const h = s.hero;
  const H = HEROES[h.id];
  if (h.act > 0) {
    h.act -= DT;
    if (h.act <= 0) { h.act = 0; emit(s, { t: 'heroEnd', id: h.id }); }
  }
  if (h.act <= 0 && h.charge < 1) chargeHero(s, DT / (H.skill.cd * (1 - 0.06 * (h.lv - 1))));
  if (input && input.skill && h.charge >= 1 && h.act <= 0) castHero(s);
}

function castHero(s) {
  const h = s.hero;
  const q = s.squad;
  const H = HEROES[h.id];
  h.charge = 0;
  h.T = H.skill.dur;
  h.act = h.T;
  h.shot = 0;
  s.stats.heroUses++;
  emit(s, { t: 'heroCast', id: h.id, x: q.x, z: q.z });
  if (h.id === 'bori') {
    const k = Math.round(heroLerp(0.5, 0.7, h.lv) * q.recent);
    q.recent = 0;
    if (k > 0) {
      q.pool = Math.max(0, q.pool - k);
      s.stats.healed += k;
      gain(s, k, q.x, q.z, 'hero');
      emit(s, { t: 'heal', n: k, x: q.x, z: q.z });
    }
  }
}

/* 스킬을 지금 쓰면 좋은가 — 자동 발동 설정과 봇이 같은 규칙을 쓴다 */
export function heroWants(s) {
  const h = s.hero;
  if (!h || h.charge < 1 || h.act > 0 || (s.phase !== 'run' && s.phase !== 'arena')) return false;
  const q = s.squad;
  const boss = s.boss && s.boss.hp > 0;
  if (h.id === 'bori') return q.recent >= Math.max(4, 0.12 * q.n) || !!(s.boss && s.boss.clash);
  if (boss) return true;
  if (h.id === 'mungchi') {
    const D = dps(q.n, q.tier, s.fireLv);
    const R = radius(q.n);
    let threat = 0;
    for (const f of s.foes) if (f.alive && f.z > q.z && f.z - q.z < 25 && Math.abs(f.x - q.x) < R + 1.5) threat += f.hp;
    if (threat >= 1.2 * D) return true;
    for (const row of s.rows) {
      const dz = row.z - q.z;
      if (row.done || dz < 10 || dz > 30) continue;
      const c = row.cells[pickCell(row, q.x)];
      if (c.op === 'add' && c.v < c.cap) return true;
    }
    return false;
  }
  if (h.id === 'nabi') {
    for (const f of s.foes) if (f.alive && (f.kind === 'spit' || f.kind === 'brute') && f.z - q.z > 2 && f.z - q.z < 36) return true;
  }
  return false;
}

/* ---------- 특수병 ---------- */
const SNIPE_W = { spit: 4, brute: 2, runner: 1.5, grunt: 1 };

/* 저격 표적: 독침 > 거구 > 질주 > 졸개(남은 체력 × 가중치), 없으면 보스 */
function snipeTarget(s, near, far) {
  const q = s.squad;
  let best = null;
  let bestScore = -1;
  for (const f of s.foes) {
    if (!f.alive) continue;
    const dz = f.z - q.z;
    if (dz < near || dz > far) continue;
    const sc = f.hp * (SNIPE_W[f.kind] || 1);
    if (sc > bestScore || (sc === bestScore && f.id < best.o.id)) { bestScore = sc; best = { kind: 'foe', o: f }; }
  }
  if (best) return best;
  // 상자·철창은 쏘지 않는다(보상은 분대가 직접 쏴서 얻는 것)
  if (s.boss && s.boss.hp > 0 && s.boss.z - q.z < far) return { kind: 'boss', o: s.boss };
  return null;
}

function snipe(s, dmg, src) {
  const q = s.squad;
  const t = snipeTarget(s, SP.sniper.near, SP.sniper.far);
  if (!t) return false;
  let kill = false;
  let x1;
  let z1;
  if (t.kind === 'foe') { x1 = t.o.x; z1 = t.o.z; kill = hitFoe(s, t.o, dmg, src === 'hero' ? 'hero' : 'sniper'); }
  else if (t.kind === 'prop') { x1 = (t.o.x0 + t.o.x1) / 2; z1 = t.o.z; hitProp(s, t.o, dmg); kill = !t.o.alive; }
  else { x1 = t.o.x; z1 = t.o.z - 1; hitBossBonus(s, dmg); }
  emit(s, { t: 'snipe', x0: q.x, z0: q.z, x1, z1, src, kill });
  return true;
}

/* 로켓 표적: 8–30m 안 반경 안의 체력 합이 가장 큰 무리(0.3D 이상) → 분대 통로의 벽 → 보스 */
function rocketTarget(s, D) {
  const q = s.squad;
  const R = radius(q.n);
  const r = SP.rocket.r;
  let best = null;
  let bestHp = 0.3 * D;
  for (const f of s.foes) {
    if (!f.alive) continue;
    const dz = f.z - q.z;
    if (dz < SP.rocket.near || dz > SP.rocket.far) continue;
    let sum = 0;
    for (const g of s.foes) if (g.alive && Math.abs(g.x - f.x) < r && Math.abs(g.z - f.z) < r) sum += g.hp;
    if (sum > bestHp) { bestHp = sum; best = { x: f.x, z: f.z, fid: f.id }; }
  }
  if (best) return best;
  for (const p of s.props) {
    if (!p.alive || p.passed || p.kind !== 'wall') continue;
    const dz = p.z - q.z;
    if (dz < 4 || dz > SP.rocket.far || overlap(q.x - R, q.x + R, p.x0, p.x1) <= 0) continue;
    if (!best || p.z < best.z) best = { x: clamp(q.x, p.x0, p.x1), z: p.z, fid: -1 };
  }
  if (best) return best;
  if (s.boss && s.boss.hp > 0) return { x: s.boss.x, z: s.boss.z - 1, fid: -1 };
  return null;
}

function specialsUpdate(s, R) {
  const q = s.squad;
  if (q.n <= 0) return;
  const D = dps(q.n, q.tier, s.fireLv) * heroDmg(s);
  // 회복 풀(의무병·보리)
  q.recent *= 1 - DT / 4;
  if (q.pool > 0) {
    q.healAcc += Math.max(1.5, 0.35 * q.pool) * DT;
    const k = Math.floor(Math.min(q.healAcc, q.pool));
    if (k >= 1) {
      q.pool -= k;
      q.healAcc -= k;
      s.stats.healed += k;
      gain(s, k, q.x, q.z, 'heal');
      emit(s, { t: 'heal', n: k, x: q.x, z: q.z });
    } else if (q.pool < 1) q.healAcc = 0;   // 1명이 안 되는 몫은 남겨 두고 다음 손실과 합친다
  }
  const h = s.hero;
  const nabiBoost = h && h.id === 'nabi' ? 1 + heroLerp(0.3, 0.5, h.lv) : 1;
  for (const m of q.sp) {
    m.cd -= DT;
    if (m.cd > 0) continue;
    if (m.k === 'sniper') m.cd = snipe(s, SP.sniper.dmg * D * nabiBoost, 'sniper') ? SP.sniper.every : 0.25;
    else if (m.k === 'rocket') {
      const t = rocketTarget(s, D);
      if (!t) { m.cd = 0.25; continue; }
      const T = Math.max(0.25, (t.z - q.z) / SP.rocket.speed);
      const rk = { id: s.nextId++, x0: q.x, z0: q.z + 0.5, x: t.x, z: t.z, t: T, T, r: SP.rocket.r, dmg: SP.rocket.dmg * D, fid: t.fid };
      s.rockets.push(rk);
      emit(s, { t: 'rocket', id: rk.id, x0: rk.x0, z0: rk.z0, x: rk.x, z: rk.z });
      m.cd = SP.rocket.every;
    } else m.cd = 1;
  }
  // 영웅 나비: 패시브 직접 저격(저격수가 없을 때), 스킬 중에는 연속 저격
  if (h && h.id === 'nabi') {
    if (h.act > 0) {
      h.shot -= DT;
      if (h.shot <= 0) { h.shot = 0.25; snipe(s, heroLerp(0.4, 0.6, h.lv) * D, 'hero'); }
    } else if (!hasSp(q, 'sniper')) {
      h.cd -= DT;
      if (h.cd <= 0) h.cd = snipe(s, heroLerp(0.18, 0.28, h.lv) * D, 'hero') ? 1.8 : 0.25;
    }
  }
  // 날아가는 로켓
  if (s.rockets.length) {
    for (const rk of s.rockets) {
      if (rk.fid >= 0) {
        const f = s.foes.find((g) => g.id === rk.fid);
        if (f && f.alive) { rk.x = f.x; rk.z = f.z; }
      }
      rk.t -= DT;
      if (rk.t > 0) continue;
      for (const f of s.foes) if (f.alive && Math.abs(f.x - rk.x) < rk.r + f.r && Math.abs(f.z - rk.z) < rk.r + f.r) hitFoe(s, f, rk.dmg, 'rocket');
      for (const p of s.props) {
        if (!p.alive || p.passed || Math.abs(p.z - rk.z) > rk.r || overlap(rk.x - rk.r, rk.x + rk.r, p.x0, p.x1) <= 0) continue;
        hitProp(s, p, rk.dmg);
      }
      const b = s.boss;
      if (b && b.hp > 0 && Math.abs(b.z - 1 - rk.z) < rk.r + 1 && Math.abs(b.x - rk.x) < rk.r + b.r) hitBossBonus(s, rk.dmg);
      emit(s, { t: 'boom', x: rk.x, z: rk.z, r: rk.r });
    }
    s.rockets = s.rockets.filter((rk) => rk.t > 0);
  }
  void R;
}

/* ---------- 봇 ---------- */
/* 목표 x → 좌우 누르기 입력. 봇도 좌우 누르기만으로 깰 수 있어야 한다. */
export function steer(s, tx, dead = 0.15) {
  const q = s.squad;
  const d = tx - q.x;
  // 멈추는 데 걸리는 거리를 생각해 미리 놓는다
  const stopDist = (q.vx * q.vx) / (2 * 100);
  if (Math.abs(d) < dead) return { dir: 0, tx: null };
  if (Math.sign(d) === Math.sign(q.vx) && Math.abs(d) <= stopDist) return { dir: 0, tx: null };
  return { dir: d > 0 ? 1 : -1, tx: null };
}

function cellCenter(c) { return clamp((c.x0 + c.x1) / 2, -EDGE, EDGE); }

/* 기준 봇: 몇 군데 x 후보를 놓고 '다음 게이트 결과 − 벽·무리 피해 + 상자 보상'을 따져 가장 나은 곳으로 간다.
   그 위치에서 쏘는 총알이 게이트·벽·상자에 맞는 것도 셈에 넣는다. 톱날·독침·내려찍기는 피한다.
   opt.pump=false 면 게이트를 쏴서 올리는 효과를 셈하지 않고(겉보기 숫자로만 고른다), opt.crates=false 면 상자를 무시한다. */
const CANDS = [-4.2, -3.6, -2.5, -1.25, -0.45, 0.45, 1.25, 2.5, 3.6, 4.2];

export function botTarget(s, opt = {}) {
  const q = s.squad;
  const R = radius(q.n);
  const sight = opt.sight ?? 40;
  if (s.phase === 'arena' && s.boss) return bossDodge(s, R);
  const D = dps(q.n, q.tier, s.fireLv);
  const vz = Math.max(1, q.vz);
  const span = R + 0.3;
  const cover = (x, x0, x1) => overlap(x - span, x + span, x0, x1) / (2 * span);
  let row = null;
  for (const r of s.rows) if (!r.done && r.z > q.z && r.z - q.z < sight) { if (!row || r.z < row.z) row = r; }
  const horizon = row ? row.z : q.z + 34;
  let best = -Infinity;
  let bestX = q.x;
  for (let ci = 0; ci <= CANDS.length; ci++) {
    const x = ci === CANDS.length ? clamp(q.x, -EDGE, EDGE) : CANDS[ci];
    const travel = Math.abs(x - q.x) / 10 + 0.15;
    let val = -Math.abs(x - q.x) * 0.02;
    if (row) {
      const tReach = (row.z - q.z) / vz;
      // 제때 못 가면 지금 칸을 지나게 된다
      const at = travel < tReach ? x : q.x;
      const c = row.cells[pickCell(row, at)];
      let v = c.v;
      if (c.op === 'add' && opt.pump !== false) {
        const shoot = Math.max(0, tReach - travel - 0.2);
        v = Math.min(c.cap, c.v + Math.floor((D * cover(at, c.x0, c.x1) * shoot / c.step) * 0.9));
      }
      const after = applyOp(q.n, c.op, v);
      val += after <= 0 ? -q.n * 2 : after - q.n;
      if (c.op === 'unit' && opt.specials !== false) val += spWorth(s, c.k);
    }
    // 벽: 그 자리에서 쏴서 못 부수면 남은 만큼 잃는다
    for (const p of s.props) {
      if (!p.alive || p.passed || p.z < q.z || p.z > horizon + 0.5 || p.z - q.z > 34) continue;
      const t = (p.z - q.z) / vz;
      const shot = D * cover(x, p.x0, p.x1) * Math.max(0, t - travel) * 0.85;
      if (p.kind === 'wall') {
        const ov = overlap(x - R, x + R, p.x0, p.x1) / (2 * R);
        if (ov <= 0) continue;
        const left = p.hp - shot;
        if (left > 0) val -= contactCost(left) * Math.min(1, ov * 2) + 1;
      } else if (!row && shot >= p.hp) {
        const r = p.reward;
        if (r.type === 'unit') { if (opt.specials !== false) val += spWorth(s, r.k); }
        else if (opt.crates !== false) val += r.type === 'gun' ? (q.tier < 3 ? q.n * 0.25 + 3 : 2) : r.type === 'men' ? r.v : 2;
      }
    }
    // 무리: 이 자리 앞에 몰린 적 중 쏴서 못 잡는 만큼
    let threat = 0;
    for (const f of s.foes) {
      if (!f.alive || f.z < q.z || f.z - q.z > 32) continue;
      const reachX = f.x + clamp(x - f.x, -f.home * 1.5, f.home * 1.5);
      if (Math.abs(reachX - x) < R + f.r + 0.4) threat += f.hp;
    }
    if (threat > 0) val -= Math.max(0, threat - D * 1.6) / SOLDIER_HP;
    if (val > best + 1e-9) { best = val; bestX = x; }
  }
  let tx = bestX;
  // 다음 줄의 칸 경계에 서지 않는다
  if (row) {
    for (let i = 1; i < row.cells.length; i++) {
      const x0 = row.cells[i].x0;
      if (Math.abs(tx - x0) < 0.4) tx = tx >= x0 ? x0 + 0.4 : x0 - 0.4;
    }
  }
  // 톱날 피하기
  for (const w of s.saws) {
    const dz = w.z - q.z;
    if (dz < -1 || dz > 14) continue;
    const sweepLo = w.xa - w.w / 2;
    const sweepHi = w.xb + w.w / 2;
    if (tx + R > sweepLo && tx - R < sweepHi) {
      const cands = [sweepLo - R - 0.2, sweepHi + R + 0.2].filter((x) => x >= -EDGE && x <= EDGE);
      if (cands.length) { cands.sort((a, b) => Math.abs(a - tx) - Math.abs(b - tx)); tx = cands[0]; }
      else {
        // 피할 곳이 없으면 톱날이 멀어지는 쪽으로
        const t = Math.max(0, dz / vz);
        const sawAt = clamp(w.x + w.dir * w.spd * t, w.xa, w.xb);
        tx = sawAt > 0 ? -EDGE : EDGE;
      }
    }
  }
  // 독침 피하기
  for (const sp of s.spits) {
    if (sp.t > 0.95) continue;
    if (Math.abs(tx - sp.x) < R + 1.3) {
      tx = sp.x + (tx >= sp.x ? 1 : -1) * (R + 1.5);
      if (tx > EDGE) tx = sp.x - (R + 1.5);
      if (tx < -EDGE) tx = sp.x + (R + 1.5);
    }
  }
  return clamp(tx, -EDGE, EDGE);
}

/* 보스전: 보스 정면(총알이 맞는 곳)에 서고, 내려찍기 예고가 뜨면 구역 밖으로. 비켜설 곳이 둘이면 제때 닿는 곳 중 보스에 가까운 쪽 */
function bossDodge(s, R) {
  const q = s.squad;
  const b = s.boss;
  let tx = clamp(b.x, -EDGE, EDGE);
  if (b.slam) {
    const pad = 0.4;
    const inZone = (x) => x >= b.slam.x0 - pad && x <= b.slam.x1 + pad;
    if (inZone(q.x) || inZone(tx)) {
      const cands = [b.slam.x0 - pad - 0.3, b.slam.x1 + pad + 0.3].filter((x) => x >= -EDGE && x <= EDGE);
      const late = (x) => (Math.abs(x - q.x) / 10 + 0.2 > b.slam.t ? 100 : 0);
      cands.sort((a, c) => late(a) + Math.abs(a - b.x) * 0.5 + Math.abs(a - q.x) * 0.3 - (late(c) + Math.abs(c - b.x) * 0.5 + Math.abs(c - q.x) * 0.3));
      if (cands.length) tx = cands[0];
    }
  }
  void R;
  return tx;
}

export function botInput(s, opt) {
  const inp = steer(s, botTarget(s, opt));
  inp.skill = heroWants(s);
  return inp;
}

/* 특수병 한 명이 병사 몇 명 몫인가(봇 판단용) */
export function spWorth(s, k) {
  const q = s.squad;
  if (q.sp.length >= SP_MAX || hasSp(q, k) || q.n < SP_ESCORT * (q.sp.length + 1)) return Math.max(5, nice(0.12 * q.n));
  return 3 + q.n * { medic: 0.1, sniper: 0.09, rocket: 0.12 }[k];
}

/* ---------- 보정 ----------
   레벨마다 기준 봇을 '그 레벨의 기대 강화(EXPECT) + 기대 영웅의 상시 효과'로 돌려 보스 체력·별 기준·지원 병력을 정한다.
   기준 봇이 보정에 실패하면(경기장에 못 가거나 정한 보스를 못 이기면) 다른 시드로 다시 만든다.
   L1~120은 미리 계산한 표(caltable.js)를 쓰고, 그 뒤는 처음 열 때 계산한다. */
const cache = new Map();
export const CAL_FIELDS = ['attempt', 'bossHp', 'arrive', 'arriveStrong', 'arriveWeak', 'par', 'calTier', 'helpStart', 'Hstar', 'qa'];
export function prepareLevel(L) {
  const key = Math.max(1, Math.floor(L));
  if (cache.has(key)) return cache.get(key);
  const pre = CALT && CALT.sim === SIM && CALT.levels && CALT.levels[key];
  if (pre) {
    const lv = buildLevel(key, pre.attempt);
    for (const f of CAL_FIELDS) lv[f] = pre[f];
    cache.set(key, lv);
    return lv;
  }
  const lv = calibrateLevel(key);
  cache.set(key, lv);
  return lv;
}

/* 보정 표를 쓰지 않고 실제로 보정한다(표 만들기·검증·L121+용) */
export function calibrateLevel(key) {
  let lv = null;
  let firstOk = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    lv = buildLevel(key, attempt);
    const cal = calibrate(lv, { last: attempt === 7 });
    if (cal.ok) {
      Object.assign(lv, cal.lv);
      // 배치 검사: 한 자리에 서 있기만 해서는 이기지 못해야 한다. 못 넘으면 보스를 조금 세게(qaBoost), 그래도 안 되면 다른 배치로.
      // 끝까지 못 넘으면 처음 보정된 배치를 쓴다(lv.qa = false — 테스트가 어느 레벨인지 본다)
      if (!firstOk) firstOk = lv;
      if (standStillLoses(lv) || (key <= POP_MAX && qaBoost(lv))) { lv.qa = true; break; }
      lv.qa = false;
      if (attempt === 7) lv = firstOk;
      continue;
    }
    lv.failed = true;
    if (attempt === 7 && firstOk) lv = firstOk;
  }
  if (lv.failed) {
    // 끝까지 실패하면 추정치로 보스를 약하게 둔다
    lv.arrive = Math.max(START_N, lv.golden[lv.golden.length - 1] || START_N);
    lv.arriveStrong = lv.arriveWeak = lv.arrive;
    lv.bossHp = Math.round(dps(lv.arrive, 0, lv.fireE || 0) * lv.params.bossKill * 0.6);
    lv.par = Math.max(1, Math.round(lv.arrive * 0.5));
    lv.calTier = 0;
    lv.Hstar = 0;
    lv.helpStart = Math.max(5, nice(0.2 * lv.arrive));
  }
  return lv;
}

const maxTicksOf = (lv) => Math.ceil((lv.arenaZ / lv.speed + 60) / DT);
/* 배치 검사(P03의 뒷받침): 판 내내 한 자리(QA_XS)에 서 있는 분대가 — 기대 강화로도, 그 진행에서 살 수 있는 최대 강화로도 — 이기면 안 된다.
   L1은 튜토리얼(둘째 줄부터 오른쪽이 정답)이라 뺀다 */
export const QA_XS = [-4.4, -2.5, 0, 2.5, 4.4];
export function capLoadout(L) {
  const u = upgCap(L);
  return { start: START_N + 2 * u, fire: u, hero: L >= UNLOCK.hero ? { id: 'mungchi', lv: heroCapAt(L) } : null };
}
/* 서 있기만 해도 이기는 배치('ref' 보스): 보스 체력을 ×QA_MULS 차례로 올려 다시 보정해 본다. 산만한 사람(sl3)이 qaKeep 아래로
   떨어지거나 기준 봇이 못 이기면 그만둔다(원래 값으로 되돌림) */
const QA_MULS = [1.1, 1.2, 1.32, 1.45, 1.6];
function qaBoost(lv) {
  const spec = lv.params.boss;
  if (spec.mode !== 'ref' || !spec.qaKeep) return false;
  const keep = {};
  for (const f of CAL_FIELDS) keep[f] = lv[f];
  const sl3 = popCaps(lv, expectLoadout(lv.L), maxTicksOf(lv), ['sl3']).sl3;
  for (const mul of QA_MULS) {
    const cal = calibrate(lv, { hpMul: mul });
    if (!cal.ok || sl3.filter((c) => c >= cal.lv.bossHp).length < spec.qaKeep * sl3.length) break;
    Object.assign(lv, cal.lv);
    if (standStillLoses(lv)) return true;
  }
  Object.assign(lv, keep);
  return false;
}
export function standStillLoses(lv) {
  if (lv.L <= 1) return true;
  const maxTicks = maxTicksOf(lv);
  // 그 자리에서 보정하는 레벨(L > POP_MAX)은 휴대폰에서도 빠르게: 기대 강화로, 가장 자주 이기는 자리(±2.5, 0)만
  const fast = lv.L > POP_MAX;
  for (const co of fast ? [expectLoadout(lv.L)] : [expectLoadout(lv.L), capLoadout(lv.L)]) {
    for (const x of fast ? [-2.5, 0, 2.5] : QA_XS) {
      const s = runTo(newGame(lv, co), (t) => { const inp = steer(t, x); inp.skill = heroWants(t); return inp; }, maxTicks);
      if (s.phase === 'won') return false;
    }
  }
  return true;
}
const WEAK = { pump: false, crates: false, specials: false };
/* 봇 정책: 기준 봇(스킬 on/off), 약한 기준(쏘아 올리기·상자·특수병 모름, 스킬 끔) */
const polStrong = (skill) => (s) => { const inp = steer(s, botTarget(s)); inp.skill = skill ? heroWants(s) : false; return inp; };
const polWeak = (s) => ({ ...steer(s, botTarget(s, WEAK)), skill: false });
function runTo(s, pol, maxTicks, arenaOnly) {
  while ((s.phase === 'run' || (!arenaOnly && s.phase === 'arena')) && s.tick < maxTicks) step(s, pol(s));
  return s;
}
/* 경기장 입장 상태에서 보스 체력만 바꿔 끝까지 */
function fightFrom(a, pol, hp, maxTicks, mod) {
  const s = structuredClone(a);
  s.boss.hp = s.boss.max = hp;
  if (mod) mod(s);
  while (s.phase === 'arena' && s.tick < maxTicks) step(s, pol(s));
  return s;
}

/* 3패 지원: 시작 병력에 더하면 '약한 기준'의 도착 병력이 HELP_GAIN만큼 늘어나는 수(×게이트를 거치며 불어나는 몫을 뺀다).
   지원 판은 별 1개까지(main.js) */
export const HELP_GAIN = { '': 0.6, rest: 0.25, hard: 1.5, super: 0.7 };
function helpFor(lv, co, w, maxTicks) {
  const gain = HELP_GAIN[lv.tag || ''] ?? 0.25;
  const arr0 = w.squad.n;
  // 약한 기준이 지난 칸들의 곱(시작 병력 1명이 도착 때 몇 명이 되나)
  let M = 1;
  for (const r of w.rows) {
    if (!r.done || r.chosen < 0) continue;
    const c = r.cells[r.chosen];
    if (c.op === 'mul') M *= c.v; else if (c.op === 'div') M /= c.v;
  }
  let h = Math.max(5, Math.round((gain * arr0) / Math.max(1, M)));
  const t = runTo(newGame(lv, { ...co, start: co.start + h }), polWeak, maxTicks, true);
  if (t.phase === 'arena' && arr0 > 0) {
    const got = t.squad.n / arr0 - 1;
    if (got > 0.01) h = clamp(Math.round((h * gain) / got), Math.ceil(h / 3), h * 3);
    else h *= 3;
  }
  return Math.max(5, nice(h));
}

/* ---------- 사람 흉내 무리(어려움·매우 어려움 보스 체력) ----------
   humanBot: tests/bots.mjs의 sloppy와 같은 규칙(같은 시드면 같은 입력 — 테스트로 확인) — 0.3초(18틱) 늦은 반응, 게이트를 쏴서 올리는
   효과·상자를 모르고 겉보기 숫자로 고르며, 1초마다 err 확률로 0.5~1.15초 동안 엉뚱한 곳으로 간다. skill이면 heroWants 규칙으로 스킬.
   상태는 f.st(평범한 객체), f.clone()으로 그 자리부터 복제한다. */
function nextRnd(st) {
  st.a = (st.a + 0x6D2B79F5) >>> 0;
  let t = st.a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function humanBot(seed, err = 0.1, skill = false) {
  const st = { a: seed >>> 0, hist: [], wrongUntil: -1, wrongX: 0 };
  const f = (s) => {
    st.hist.push(botTarget(s, { pump: false, crates: false }));
    if (st.hist.length > 40) st.hist.splice(0, st.hist.length - 20);
    let tx = st.hist.length > 18 ? st.hist[st.hist.length - 19] : 0;
    if (s.tick % 60 === 0 && nextRnd(st) < err) { st.wrongUntil = s.tick + 30 + Math.floor(nextRnd(st) * 40); st.wrongX = (nextRnd(st) * 2 - 1) * 4; }
    if (s.tick < st.wrongUntil) tx = st.wrongX;
    const inp = steer(s, tx);
    if (skill) inp.skill = heroWants(s);
    return inp;
  };
  f.st = st;
  f.clone = () => { const g = humanBot(seed, err, skill); Object.assign(g.st, structuredClone(st)); return g; };
  return f;
}
/* 무리: on 집중한 사람(스킬 씀), off 집중했지만 스킬을 안 누르는 사람, sl3 산만한 사람. 종류마다 POP_K판 */
export const POP = [{ id: 'on', err: 0.1, skill: true, w: 1.5 }, { id: 'off', err: 0.1, skill: false, w: 0.6 }, { id: 'sl3', err: 0.3, skill: true, w: 0.5 }];
/* 무리가 원하는 체력이 H*의 POP_OVER배를 넘으면(기준 봇이 사람 흉내보다 크게 못한 배치) 다른 배치로 다시 만든다 */
export const POP_OVER = 1.08;
export const POP_K = 24;
export const POP_MAX = 120;   // 여기까지는 무리로 맞춘다(caltable.js). 그 뒤는 H* × popRatio
/* 무리 한 판씩: 경기장까지 돈 뒤, 이 사람이 이길 수 있는 가장 큰 보스 체력(이분 탐색 7번, 기하 평균) */
export function popCaps(lv, co, maxTicks = maxTicksOf(lv), ids = null) {
  const out = {};
  for (const t of POP) {
    if (ids && !ids.includes(t.id)) continue;
    out[t.id] = [];
    for (let j = 0; j < POP_K; j++) {
      const pol = humanBot(hash(VERSION, 'cal', lv.L, lv.attempt, t.id, j), t.err, t.skill);
      const a = runTo(newGame(lv, co), pol, maxTicks, true);
      if (a.phase !== 'arena') { out[t.id].push(0); continue; }
      const base = dps(a.squad.n, a.squad.tier, a.fireLv) * lv.params.bossKill;
      const wins = (h) => fightFrom(a, pol.clone(), Math.max(1, Math.round(h)), maxTicks).phase === 'won';
      let lo = 0.3;
      let hi = 3;
      if (!wins(base * lo)) { out[t.id].push(0); continue; }
      if (wins(base * hi)) lo = hi;
      else for (let i = 0; i < 7; i++) { const mid = Math.sqrt(lo * hi); if (wins(base * mid)) lo = mid; else hi = mid; }
      out[t.id].push(Math.round(base * lo));
    }
  }
  return out;
}
/* 무리의 '이길 수 있는 체력'들 → 승률이 band에 가장 가까운 체력. 체력 h에서 이기는 사람 = cap ≥ h.
   cap 사이 구간마다 벌점(구간 밖으로 벗어난 만큼의 제곱 × 가중치)을 매기고, 벌점이 가장 작은 구간들 중 가운데 구간의 기하 중점 */
export function popPick(caps, band) {
  const all = [...new Set(Object.values(caps).flat().filter((c) => c > 0))].sort((a, b) => a - b);
  if (!all.length) return 0;
  const score = (h) => {
    let sc = 0;
    for (const t of POP) {
      const a = caps[t.id];
      const b = band[t.id];
      if (!a || !a.length || !b) continue;
      const win = a.filter((c) => c >= h).length / a.length;
      const d = win < b[0] ? b[0] - win : win > b[1] ? win - b[1] : 0;
      sc += ((band.w && band.w[t.id]) ?? t.w) * d * d;
    }
    return sc;
  };
  // 구간 k: (all[k-1], all[k]] — 그 안의 h에서 이기는 사람은 cap ≥ all[k]. 마지막 구간(all[m-1], ∞)은 아무도 못 이긴다
  const mids = all.map((u, k) => (k ? Math.sqrt(all[k - 1] * u) : u * 0.9));
  mids.push(all[all.length - 1] * 1.1);
  const ups = [...all, Infinity];
  let best = Infinity;
  let pick = [];
  ups.forEach((u, k) => {
    const sc = score(u === Infinity ? Infinity : u);
    if (sc < best - 1e-12) { best = sc; pick = [k]; } else if (Math.abs(sc - best) <= 1e-12) pick.push(k);
  });
  return { h: mids[pick[Math.floor((pick.length - 1) / 2)]], score: best };
}
export function popHp(lv, co, band, maxTicks) {
  return popPick(popCaps(lv, co, maxTicks), band);
}
/* L(POP_MAX+1)부터: 표(caltable.js)에서 같은 태그 레벨들(L61~POP_MAX)의 '체력 / H*' 중앙값. 표가 없으면 기본값 */
const POP_RATIO0 = { hard: 0.85, super: 0.9 };
const ratioCache = {};
export function popRatio(tag) {
  if (ratioCache[tag] != null) return ratioCache[tag];
  const T = CALT && CALT.sim === SIM && CALT.levels;
  const r = [];
  if (T) for (const k in T) if (+k > 60 && levelTag(+k).tag === tag && T[k].Hstar > 0) r.push(T[k].bossHp / T[k].Hstar);
  r.sort((a, b) => a - b);
  ratioCache[tag] = r.length >= 3 ? r[Math.floor(r.length / 2)] : POP_RATIO0[tag] ?? 0.9;
  return ratioCache[tag];
}

/* 정면에 선 분대의 총알 중 보스에 맞는 몫(퍼짐 ±(반지름+0.3) 중 ±BOSS_HIT 안) */
export const bossHitFrac = (n) => Math.min(1, BOSS_HIT / (radius(n) + 0.3));
/* H*는 '이기면서 도착 병력의 H_KEEP 이상을 남기는' 가장 큰 체력 — 병사 한두 명으로 겨우 이기는 판을 기준으로 삼지 않게(별 기준이 무너지지 않게) */
export const H_KEEP = 0.1;
/* 어려운 레벨의 별 기준: 스킬 없는 기준 봇이 도착 병력의 PAR_KEEP 이상 남기고 이기면 그 수, 아니면(겨우 이기거나 지면) 스킬을 쓴 쪽 */
export const PAR_KEEP = 0.25;

export function calibrate(lv, opt = {}) {
  const maxTicks = maxTicksOf(lv);
  const co = expectLoadout(lv.L);
  const spec = lv.params.boss;
  const fire = co.fire;
  const kill = lv.params.bossKill;
  // 약한 기준: 게이트를 쏴서 올릴 줄 모르고 상자·특수병도 안 챙기는(그래도 피하기는 하는) 플레이
  const w = runTo(newGame(lv, co), polWeak, maxTicks, true);
  if (w.phase !== 'arena') return { ok: false };
  // 기준 봇(스킬 끔 — 스킬을 안 누르는 사람 기준)
  const s = runTo(newGame(lv, co), polStrong(false), maxTicks, true);
  if (s.phase !== 'arena') return { ok: false };
  const arrive = s.squad.n;
  // 기준 병력: 의무병이 되살린 몫은 빼고, 약한 기준의 두 배를 넘지 않게(쏘아 올리기·상자에 기대는 레벨)
  const ref = Math.max(co.start, Math.min(arrive - s.stats.healedAtArena, 2 * w.squad.n));
  // 보스가 부르는 졸개의 체력은 기준 병력(lv.arrive)을 따른다 — 보정의 싸움도 실제 판과 같게
  lv.arrive = ref;
  s.bossRef = ref;
  let hp;
  let par;
  let Hstar = 0;
  if (spec.mode === 'pop') {
    // H*: 스킬·상자·특수병을 다 쓰는 기준 봇이 도착 병력의 10%를 남기고 이기는 가장 큰 체력(이분 탐색 10번) — 보스 체력의 상한
    const sk = runTo(newGame(lv, co), polStrong(true), maxTicks, true);
    if (sk.phase !== 'arena') return { ok: false };
    sk.bossRef = ref;
    const base = dps(sk.squad.n, 0, fire) * kill;
    const keep = Math.max(1, Math.ceil(H_KEEP * sk.squad.n));
    const wins = (h) => { const t = fightFrom(sk, polStrong(true), Math.round(h), maxTicks); return t.phase === 'won' && t.squad.n >= keep; };
    let lo = 0.3;
    let hi = 6;
    if (!wins(base * lo)) return { ok: false };
    if (wins(base * hi)) lo = hi;
    else for (let i = 0; i < 10; i++) { const mid = (lo + hi) / 2; if (wins(base * mid)) lo = mid; else hi = mid; }
    Hstar = Math.round(base * lo);
    // L1~POP_MAX: 사람 흉내 무리로 맞춘 체력. 그 뒤(그 자리에서 보정하는 레벨)는 표의 같은 태그 레벨들의 '체력 / H*' 중앙값을 곱한다
    const pop = lv.L <= POP_MAX ? popHp(lv, co, spec.band, maxTicks) : { h: Hstar * popRatio(lv.tag), score: 0 };
    const want = pop.h;
    if (want > Hstar * POP_OVER && !opt.last) return { ok: false };
    hp = Math.max(30, Math.round(Math.min(want, Hstar)));
    // 이기는지 다시 확인(이분 탐색은 단조가 아닐 수 있다)
    let won = null;
    for (let i = 0; i < 12; i++) {
      const t = fightFrom(sk, polStrong(true), hp, maxTicks);
      if (t.phase === 'won' && t.squad.n >= keep) { won = t; break; }
      hp = Math.round(hp * 0.96);
    }
    if (!won) return { ok: false };
    // 별 기준: 스킬을 안 쓴 기준 봇 — 지거나 겨우 이기면(도착 병력의 PAR_KEEP 아래) 스킬을 쓴 쪽
    const t = fightFrom(s, polStrong(false), hp, maxTicks);
    par = t.phase === 'won' && t.squad.n >= Math.ceil(PAR_KEEP * s.squad.n) ? t.squad.n : won.squad.n;
  } else {
    // m은 '정면에 선 기준 병력이 bossKill초 동안 주는 피해'의 배수
    hp = Math.max(30, Math.round(dps(ref * spec.m, 0, fire) * kill * bossHitFrac(ref) * (opt.hpMul || 1)));
    // 상자·특수병 없이도: 무기 단계 0, 특수병 없이, 기준 병력으로 시작해 이길 수 있어야 한다 — 못 이기면 이길 때까지 조금씩 낮춘다
    const bareMod = (x) => {
      x.squad.n = Math.min(x.squad.n, ref); x.squad.peak = x.squad.n; x.squad.tier = 0; x.squad.sp = []; x.squad.pool = 0; x.rockets = [];
    };
    let bare = false;
    for (let i = 0; i < 16 && !bare; i++) {
      if (fightFrom(s, polStrong(false), hp, maxTicks, bareMod).phase === 'won') bare = true;
      else hp = Math.max(30, Math.round(hp * 0.95));
    }
    if (!bare) return { ok: false };
    const t = fightFrom(s, polStrong(false), hp, maxTicks);
    if (t.phase !== 'won') return { ok: false };
    par = t.squad.n;
  }
  const helpStart = helpFor(lv, co, w, maxTicks);
  return { ok: true, lv: { bossHp: hp, arrive: ref, arriveStrong: arrive, arriveWeak: w.squad.n, par, calTier: s.squad.tier, Hstar, helpStart } };
}

/* 별 기준 병력: 기준 봇이 '그 플레이어의 강화와 출격 영웅'을 달고 돌았을 때 남기는 병력.
   영웅은 상시 효과만 — 스킬은 쓰지 않는다(스킬을 안 누르는 사람이 영웅 때문에 별을 덜 받지 않게).
   스킬 없이 지는 판(어려운 레벨에서 강화가 모자랄 때)은 스킬을 쓴 결과, 그래도 지면 그 레벨의 기준(lv.par).
   강화·영웅은 이기기 쉽게 해 주지만 별은 실력으로. */
const parCache = new Map();
const sameHero = (a, b) => (!a && !b) || (a && b && a.id === b.id && (a.lv | 0) === (b.lv | 0));
export function parFor(lv, start = START_N, fire = 0, hero = null) {
  const E = expectLoadout(lv.L);
  if (start === E.start && fire === E.fire && sameHero(hero, E.hero)) return lv.par;
  const key = `${lv.L}:${lv.attempt}:${start}:${fire}:${hero ? hero.id + hero.lv : '-'}`;
  if (parCache.has(key)) return parCache.get(key);
  const maxTicks = maxTicksOf(lv);
  let par = lv.par;
  const a = runTo(newGame(lv, { start, fire, hero }), polStrong(false), maxTicks);
  if (a.phase === 'won') par = a.squad.n;
  else if (hero) {
    const b = runTo(newGame(lv, { start, fire, hero }), polStrong(true), maxTicks);
    if (b.phase === 'won') par = b.squad.n;
  }
  par = Math.max(1, par);
  parCache.set(key, par);
  return par;
}

/* 별: 이기면 1개, 기준 병력(par)의 STAR_TWO 이상이면 2개, STAR_THREE 이상이면 3개.
   문턱은 기대 강화의 sloppy0.1이 이긴 판 중 3★ 25-45%, 2★ 이상 60-80%가 되게 bench로 맞췄다(par는 스킬 없는 기준 봇 그대로).
   lv를 주면 그 레벨 태그의 문턱을 쓴다(없으면 일반 레벨 문턱) */
export const STARS = {
  '': { two: 0.45, three: 0.9 },
  rest: { two: 0.45, three: 0.9 },
  hard: { two: 0.45, three: 0.9 },
  super: { two: 0.45, three: 0.9 },
};
export function starGoals(par, lv) {
  const st = STARS[(lv && (lv.tag ?? (lv.params && lv.params.tag))) || ''] || STARS[''];
  return { two: Math.max(2, Math.round(par * st.two)), three: Math.max(3, Math.round(par * st.three)) };
}
export function starsFor(par, n, won, lv) {
  if (!won) return 0;
  const g = starGoals(par, lv);
  if (n >= g.three) return 3;
  if (n >= g.two) return 2;
  return 1;
}

/* 판이 끝났을 때 받는 코인. 기본 몫에 레벨 태그 배수(levelTag(L).coinMul)를 곱한다 */
export function coinsFor(lv, s, won, stars, bonusPct = 0) {
  const mul = levelTag(lv.L).coinMul;
  const base = (won ? 10 + 2 * lv.L + 5 * stars : Math.floor((10 + 2 * lv.L) * 0.25)) * mul;
  const kills = Math.floor(s.stats.kills / 10);
  const sp = won ? 3 * s.squad.sp.length : 0;   // 살아남은 특수병 1명당 3코인
  return Math.round((base + kills) * (1 + bonusPct / 100)) + s.stats.coins + sp;
}

/* 3패 지원 병력(시작 병력에 더한다): 보정 표의 helpStart(산만한 사람도 대부분 이기지만 늘 이기지는 않게 태그별 HELP_GAIN으로 맞춘 수).
   지원 판은 별 1개까지(main.js) */
export function supportFor(lv) {
  if (lv && lv.helpStart > 0) return lv.helpStart;
  return Math.max(5, nice(0.2 * ((lv && lv.arrive) || 30)));
}

/* 보스가 분대에 닿기까지 남은 초(지금 걸음으로). 보스가 없거나 이미 닿았거나 쓰러졌으면 null */
export function bossEta(s) {
  const b = s && s.boss;
  if (!b || b.hp <= 0 || b.clash || s.phase !== 'arena') return null;
  const q = s.squad;
  const reach = q.z + 0.55 * radius(q.n) + b.r * 0.6;
  const v = b.walk * (b.enraged ? 1.25 : 1);
  if (!(v > 0)) return null;
  return Math.max(0, (b.z - reach) / v);
}

/* 진행률(0~1) — 보스전이면 보스 체력으로 */
export function progress(s) {
  if (s.boss) return 1;
  return clamp(s.squad.z / s.arenaZ, 0, 1);
}

/* 상태 해시 — 결정성 테스트용 */
export function stateHash(s) {
  const q = s.squad;
  let h = hash(s.tick, q.n, q.x.toFixed(6), q.z.toFixed(6), s.phase);
  for (const f of s.foes) if (f.alive) h = hash(h, f.id, f.hp.toFixed(4), f.x.toFixed(4), f.z.toFixed(4));
  for (const r of s.rows) for (const c of r.cells) h = hash(h, c.v, c.acc.toFixed(4));
  if (s.boss) h = hash(h, s.boss.hp.toFixed(4), s.boss.z.toFixed(4));
  for (const m of q.sp) h = hash(h, m.k, m.cd.toFixed(4));
  h = hash(h, q.pool.toFixed(4), q.recent.toFixed(4), q.healAcc.toFixed(4), q.lossFrac.toFixed(4));
  if (s.boss) h = hash(h, s.boss.bonus.toFixed(4));
  for (const rk of s.rockets) h = hash(h, rk.x.toFixed(4), rk.z.toFixed(4), rk.t.toFixed(4));
  if (s.hero) h = hash(h, s.hero.charge.toFixed(4), s.hero.act.toFixed(4), s.hero.cd.toFixed(4), s.hero.shot.toFixed(4));
  return h;
}
