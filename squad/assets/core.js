import { HEROES, UNITS, heroVal, unitVal, synergyOf, SP_LV_MAX, heroEff, heroCapC, HERO_LV_HARD, PETS, petP, PET_MAX_LV , AMMO, AMMO_IDS, AMMO_IDS2, FX_NEW, fxK, FX_SLOTS, FX_BASE_LV, fxVal, COMBOS, COMBO_IDS, RELICS, RELIC_IDS, MUTATIONS, MUT_IDS, MUT_MAX_LV, FOG_X, FX_HEAT, EGG, OBSTACLES, OBSTACLE_IDS, BUILD, fx2Val, SP_EVO, SP_EVO2, awk, FX_FREEZE, ENH, enhStr, legK, FX_CHAIN, COMBO_IDS2, comboV, BOSS_PAT, BOSS_PAT_IDS, BOSS_PAT_UPTEXT, BOSS_KNOCK, SUPPLY, BOSS_FLOOR, GUNS, GUN_IDS, gunVal, HORN } from './roster.js';
import { CAL } from './caltable.js';
import { CYC } from './cyctable.js';

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
/* 병력 상한: 캠페인은 MAX_N, 무한모드는 ENDLESS.maxN(사실상 없음 — 9999에서 멈추면 게이트·증원 카드가 헛돌아 위협만 커진다).
   NCAP: 레벨·구간을 만드는 동안의 상한(applyOp의 기본값 — buildSegment가 잠깐 올린다). 판 안에서는 nMax(s)를 넘긴다 */
let NCAP = MAX_N;
export const nMax = (s) => (s && s.endless ? ENDLESS.maxN : MAX_N);
/* 큰 수를 짧게: 9999까지는 그대로, 그 위는 만·억·조(세 자리 유효숫자 — 1.23만, 45.6만, 789만, 1.23억) */
export function fmtN(n) {
  const a = Math.abs(n), sg = n < 0 ? '−' : '';
  if (!(a >= 10000)) return sg + String(a);
  const [d, u] = a >= 1e12 ? [1e12, '조'] : a >= 1e8 ? [1e8, '억'] : [1e4, '만'];
  const v = a / d;
  const txt = v >= 100 ? String(Math.floor(v)) : v >= 10 ? (Math.floor(v * 10) / 10).toFixed(1) : (Math.floor(v * 100) / 100).toFixed(2);
  return sg + txt.replace(/\.?0+$/, (m) => (txt.includes('.') ? '' : m)) + u;
}
export const START_N = 12;
export const VOLLEY_HZ = 10;
export const BULLET_SPEED = 48;
export const BULLET_RANGE = 30;
export const WEAPON = [1, 1.35, 1.7, 2.1, 2.5, 2.8, 3.1, 3.4, 3.7, 4];   // 무기 단계 0~3(캠페인·보통 판), 넷째 값은 과부하 코일(무한모드 유물). 개편 판은 이것이 총 ★1~10(ENDGAME.md 18.3 — ★마다 약 +30%: 다섯째 값 뒤는 +0.3씩) [초안]
export const TIER_MAX = 3;        // 보통 판의 무기 단계 상한(유물이 올리면 tierMax(s))
/* 총 ★(개편 판 — 무기 단계 tier = ★ − 1): 상자와 카드가 모두 ★를 올린다. 상한은 ★5(바퀴 1~3), 19구간(바퀴 4)부터 ★10. 과부하 코일이면 +1 */
export const STAR = { cap: 5, capLate: 10, lateFrom: 13 };   // 총 ★ 상한: ★5 → lateFrom구간부터 ★10(예전 19 — ENDGAME.md 20절)
export const THREAT_TIER = 3;     // 무한모드 위협 식(buildSegment)이 보는 무기 단계 상한 — 코일의 넷째 단계는 위협에 안 들어가 오래 남는 이득이다
export const WAKE = 45;           // 이 거리 안에 들어온 적이 다가오기 시작
export const BOSS_GAP = 28;       // 보스가 나타나는 거리
export const VERSION = 'squad-v1';   // 레벨 배치의 소금 — 바꾸지 않는다(바꾸면 모든 레벨이 달라진다)
export const SIM = 11;               // 규칙이 바뀌면 올린다(이어하기 스냅숏·보정 표는 같은 SIM에서만 쓴다)
/* SIM 11(배치의 벽 검사): 시뮬레이션 규칙은 그대로이고 보정이 배치를 고르는 기준만 늘었다 — 일반·쉼 레벨은 사람 흉내 봇이 경기장까지 가야 한다(WALL).
   무리·지킨 줄·몰이가 가까이 몰린 배치(L43·44·47 …)는 보스 체력을 아무리 맞춰도 달리기에서 사람 봇이 절반 넘게 죽는 '벽'이었다. 표의 배치가 몇 곳 바뀐다 */
/* SIM 9(파고들기): 빨간(−) 덧셈 칸의 끝(cap)이 같은 줄 파랑 칸의 끝보다 높다(RED_OVER) — 오르는 빠르기는 그대로라 기대 강화로는 끝까지 못 올리고,
   화력 강화·뭉치(쏘아 올리기·스킬)·그 칸 앞에 서서 몰아 쏘기가 있어야 닿는다. 같은 특수병을 또 구하면 그 특수병의 레벨이 오른다(Lv3까지) */
/* 보스: 피하기에 대가가 있게 — 좌우로 천천히 따라오고(초당 m), 총알은 가운데 ±BOSS_HIT m 안만 맞고, 첫 내려찍기는 빨리 온다 */
export const BOSS_TRACK = 0.6;
export const BOSS_HIT = 1.8;      // 몸통(팔 안쪽 — 보라 옷·허리띠·다리 폭). 그 밖의 총알은 보스 옆(팔 아래)으로 지나간다 — 화면은 보스 뒤로 그린다
/* 충돌 크기(SIM 8): 분대가 실제로 맞는 몸은 그린 무리(가장자리 병사 그림 끝 = 반지름 R, 앞뒤 ±SQUAD_DEPTH·R)보다
   옆으로 CONTACT_GRACE m 안쪽(hitHalf) — 화면에서 스치기만 한 것(2px 안팎)은 안 맞는다. 적·톱날·독침·벽·상자·철창이 모두 이 몸으로 잰다.
   봇·레벨 생성·독침 공정성(spitEscape)은 그린 크기(R)로 판단한다(사람이 보고 피하는 크기 — 은혜는 덤) */
export const CONTACT_GRACE = 0.12;
export const SQUAD_DEPTH = 0.55;
/* 병사 한 명(R = radius(1) = 0.53)은 그림 한 장이 전부라 그 그림의 반폭(가장 작게 그리는 화면에서 0.35m)까지만 — 셋 이하일 때만 걸린다 */
export const SOLO_HALF = 0.34;
export const hitHalf = (R) => Math.min(R - CONTACT_GRACE, SOLO_HALF + 1.5 * (R - 0.53));
/* 분대 몸(옆 ±hx, 앞뒤 ±hz 네모)과 땅 위 타원(가운데에서 dx·dz 떨어진, 반지름 a·b — 좀비·톱날의 발밑, 그림자 크기)이 겹치나.
   네모와 타원이 겹치는 것과 똑같다(모서리는 둥글다 — 좀비가 분대 모서리를 비스듬히 지나갈 때 그림이 닿아야 문다) */
export function touches(dx, dz, hx, hz, a, b) {
  const ex = Math.max(0, Math.abs(dx) - hx) / a;
  const ez = Math.max(0, Math.abs(dz) - hz) / b;
  return ex * ex + ez * ez < 1;
}
export const BOSS_FIRST_SLAM = 1.2;
export const SLAM_HIT = 0.25;   // 내려찍기에 맞으면 병력의 이만큼(예고를 보고 피하면 0)
export const SLAM_OTHER = 0.1;  // 내려찍기가 분대가 없는 칸을 노리는 확률(나머지는 분대가 선 칸 — 가만히 서 있으면 맞는다)
/* 내려찍기는 분대의 몸(반지름 R) 기준: 중심이 빨간 구역에서 SLAM_EDGE·R 안쪽이면 맞는다(큰 분대는 더 멀리 비켜야 한다) */
export const SLAM_EDGE = 0.4;
export const BOSS_WALK_DIST = BOSS_GAP - 2.5;   // 나타나는 거리 − 닿는 거리(대략). 걷는 속도 = 이 거리 / (c × bossKill)
/* 한 손 조작(좌우 누르기)으로 x를 d m 옮기는 데 걸리는 초 — 서 있다가 가속 80m/s², 최고 11m/s(step의 이동 상수와 같다).
   공정성 규칙(P14): 한 칸 넘게 움직여야 피하는 예고는 moveTime + REACT_FAR 이상, 옆 칸 회피 예고도 WARN_MIN 이상 */
export const ACCEL = 80;
export const VMAX = 11;
export const REACT_FAR = 0.45;
export const WARN_MIN = 0.7;
export function moveTime(d) {
  const a = Math.abs(d);
  const d1 = (VMAX * VMAX) / (2 * ACCEL);
  return a <= d1 ? Math.sqrt((2 * a) / ACCEL) : VMAX / ACCEL + (a - d1) / VMAX;
}
/* 지금 vx m/s로 움직이는 분대가 x를 d m(부호 있음) 옮기는 데 걸리는 초 — 반대로 가고 있으면 먼저 멈춘다(방향 전환 가속 ACCEL+60) */
export const TURN = ACCEL + 60;
export function moveTimeFrom(d, vx = 0) {
  if (!vx || Math.sign(vx) === Math.sign(d) || d === 0) {
    // 같은 쪽으로 이미 움직이는 중: 서 있을 때보다 빠르거나 같다(보수적으로 서 있을 때 값)
    return moveTime(d);
  }
  const v = Math.abs(vx);
  return v / TURN + moveTime(Math.abs(d) + (v * v) / (2 * TURN));
}
/* 공정한 예고 시간: 안전한 곳까지 d m를 움직여야 하고 칸 너비가 laneW m일 때 — 옆 칸이면 WARN_MIN, 한 칸 넘게면 moveTime(d) + REACT_FAR.
   turn = 반대쪽으로 움직이던 분대가 멈추고 돌아서는 데 더 드는 초(fairWarnFrom이 더한다) */
export function fairWarn(d, laneW) {
  if (d <= 0) return 0;
  return d > laneW ? Math.max(WARN_MIN, moveTime(d) + REACT_FAR) : WARN_MIN;
}
/* 내려찍기 구역이 맞히는 범위: 분대 중심이 [x0 − SLAM_EDGE·R, x1 + SLAM_EDGE·R] 안이면 맞는다. 화면도 이 범위를 빨갛게 그린다(길 밖은 자른다) */
export function slamZone(slam, R) {
  return { x0: Math.max(-ROAD, slam.x0 - SLAM_EDGE * R), x1: Math.min(ROAD, slam.x1 + SLAM_EDGE * R) };
}
/* 예고 중인 내려찍기의 맞는 범위 밖에 있던 분대가 멈추는 자리(가장자리에서 이만큼 밖) */
export const SLAM_STOP = 0.02;
/* 내려찍기 구역 [x0, x1]을 피하려면 분대 중심이 움직여야 하는 거리(맞는 자리가 아니면 0). 길 끝을 넘는 쪽으로는 못 간다 */
export function slamDodgeDist(x, R, x0, x1) {
  const a = x0 - SLAM_EDGE * R;
  const b = x1 + SLAM_EDGE * R;
  if (x < a || x > b) return 0;
  const left = a - 0.01 >= -EDGE ? x - (a - 0.01) : Infinity;
  const right = b + 0.01 <= EDGE ? b + 0.01 - x : Infinity;
  return Math.min(left, right);
}
/* 움직이는 분대의 공정한 내려찍기 예고(P14, 3단계): 양쪽 출구마다 '반대로 가던 속도를 멈추는 시간 + 그 사이 밀린 거리'를 더해 가장 짧은 쪽 */
export function slamFairWarn(x, vx, R, x0, x1, laneW) {
  const a = x0 - SLAM_EDGE * R;
  const b = x1 + SLAM_EDGE * R;
  if (x < a || x > b) return 0;
  let best = Infinity;
  for (const [ok, d] of [[a - 0.01 >= -EDGE, -(x - (a - 0.01))], [b + 0.01 <= EDGE, b + 0.01 - x]]) {
    if (!ok) continue;
    const away = vx && Math.sign(vx) !== Math.sign(d);
    const v = Math.abs(vx);
    const turn = away ? v / TURN : 0;
    const extra = away ? (v * v) / (2 * TURN) : 0;
    best = Math.min(best, fairWarn(Math.abs(d) + extra, laneW) + turn);
  }
  return best === Infinity ? WARN_MIN : best;
}

/* 메커닉이 처음 나오는 레벨 */
export const UNLOCK = {
  mul: 2, shoot: 2, wall: 3, summon: 3, hero: 3, crate: 4, runner: 4, spit: 5, cage: 5, medic: 5, saw: 6, brute: 7, div: 8,
  recruit: 9, sniper: 9, triple: 10, mul3: 10, rocket: 13,
  toxic: 11, split: 21,   // 정예 좀비(SIM 10): 둘째·셋째 지역의 첫 레벨
};

/* 특수병과 수치(이름·소개·레벨별 수치는 roster.js — 여기 SP의 share·every·dmg·r은 Lv1 값) */
export const SP_MAX = 3;      // 분대에 최대 3명
export const SP_ESCORT = 4;   // 병사가 특수병 수 × 4보다 적으면 가장 늦게 온 특수병이 떠난다
export { SP_LV_MAX };         // 같은 병과를 또 구하면 Lv2·Lv3(SIM 9) — 그 뒤로는 병사로(캠페인)
/* 특수병 레벨 상한: 캠페인은 SP_LV_MAX(3), 무한모드는 없다(Lv4부터는 roster.js의 over 규칙 — unitVal). LV_SANE: 저장을 읽을 때만 쓰는 울타리 */
export const LV_SANE = 999;
/* 카드 강화(roster.ENH): 대상 id의 희귀('r')·전설('l') 강화를 몇 번 뽑았나 */
export const enhN = (s, id, kind) => { const B = s && s.endless && s.endless.bld; const e = B && B.enh && B.enh[id]; return e ? e[kind] | 0 : 0; };
const enhV = (s, id, kind) => { const n = enhN(s, id, kind); return n ? enhStr(n) : 0; };   // 강화 배수(없으면 0)
const legKs = () => 1;   // 34절: 전설 강화는 더 이상 핵심 수치를 키우지 않는다(새 규칙 — legOn·legK2). 부르는 자리는 그대로 1
/* 34절 전설 강화: 켜졌나 · 세기(한 장 1, 두 장 1.5, 세 장 2) */
const legOn = (s, id) => !!bldOf(s) && enhN(s, id, 'l') > 0;
const legK2 = (s, id) => enhStr(enhN(s, id, 'l'));
/* 총 Lv 카드가 나올 수 있나: 각성 전에는 Lv5가 상한(탄과 같다) */
export const gunLvCan = (s) => { const B = s && s.endless && s.endless.bld; if (!B || !B.gt) return false; const lv = (B.gl && B.gl[B.gt]) || 1; return awakeOn(s) || lv < BUILD.evo; };
/* 개편 판의 총(ENDGAME.md 21절): { id, lv, v } — v는 그 총 Lv의 사격 규칙(roster.gunVal) + 총 강화(희귀·전설). 개편 판이 아니면 null(예전 총 그대로) */
export function gunOf(s) {
  const B = s && s.endless && s.endless.bld;
  if (!B) return null;
  const id = GUNS[B.gt] ? B.gt : 'rifle', lv = (B.gl && B.gl[id]) || 1;
  const v = { ...gunVal(id, lv) };
  const r = enhV(s, id, 'r'), ln = enhN(s, id, 'l'), lk = legK(ln);
  if (id === 'rifle') {
    if (r) v.hz = Math.round(v.hz * (1 + (ENH.rifle.rare.v - 1) * r) * 1000) / 1000;
    void ln; void lk;   // 34절: 소총 전설은 '집중 사격'(hitFoe)
  } else if (id === 'shotgun') {
    if (r) { v.spread += ENH.shotgun.rare.v * r; v.pel *= 1 + (ENH.shotgun.rare.pel - 1) * r; }
    // 34절: 산탄총 전설은 '밀쳐내기'(총알이 좀비를 맞힐 때)
  } else {
    if (r) v.aim += ENH.marksman.rare.v * r;
    // 34절: 저격총 전설은 '처형'(hitFoe)
  }
  return { id, lv, v };
}
export const awakeOn = (s) => !!(s && s.endless && s.endless.bld && s.endless.seg >= BUILD.awakeFrom);   // 각성·숙련이 열렸나(첫 대왕 뒤부터 — BUILD.awakeFrom)
export const spLvMax = (s) => (s && s.endless ? (s.endless.bld && !awakeOn(s) ? BUILD.evo : LV_SANE) : SP_LV_MAX);   // 개편 판의 특수병은 각성이 열리기 전 Lv5가 상한, 그 뒤는 끝없음(숙련)   // 개편 판의 특수병은 Lv5(고유 능력)가 상한 — 각성은 4단계
export const SP = {
  medic: { share: unitVal('medic', 'share', 1) },
  sniper: { every: unitVal('sniper', 'every', 1), dmg: unitVal('sniper', 'dmg', 1), near: 2, far: 36 },
  rocket: { every: unitVal('rocket', 'every', 1), dmg: 0.6, r: unitVal('rocket', 'r', 1), speed: 30, near: 8, far: 30 },
  // 화염병(단계 해금 4단계 — 화염병 줄을 연 무한모드 판에만, SP_KINDS 밖): near~far m 앞에서 지대(폭 × 길이) 안 체력 합이 min·D 넘는 가장 큰 무리
  // (로켓병과 같은 고르기 — crowdAt), 보스전에서는 보스 발밑. 레벨별 간격·크기·유지·초당 피해는 roster.js UNITS.flame.lv
  flame: { every: unitVal('flame', 'every', 1), dmg: unitVal('flame', 'dmg', 1), w: unitVal('flame', 'w', 1), len: unitVal('flame', 'len', 1), T: unitVal('flame', 'T', 1), near: 8, far: 20, min: 0.3 },
};
/* 회복 풀로 가는 몫의 상한(의무병 + 보리). SIM 9: 0.8 → 0.9 — 의무병 Lv2·Lv3과 보리 짝 효과가 쌓일 자리(Lv1 의무병 + 보리 Lv5 = 0.78은 그대로) */
export const SHARE_MAX = 0.9;
/* 캠페인·화염병 줄을 안 연 판의 병과(이 순서 그대로 — 철창·금색 칸·카드의 병과 뽑기가 이 목록의 길이·차례로 고른다. 늘리면 캠페인 배치와 앞 단계 지문이 바뀐다).
   SP_FLAME: 화염병 줄(4단계)을 연 무한모드 판의 병과 — 판마다 spKindsOf(s) */
export const SP_KINDS = ['medic', 'sniper', 'rocket'];
export const SP_FLAME = [...SP_KINDS, 'flame'];
export const BONUS_CAP = 0.1;
export const NABI_CAP = 0.02;   // 나비 레벨 1당 보스전 추가 피해 한도
export const SP_LV_CAP = 0.02;  // 저격수·로켓병·화염병의 레벨 1당(Lv1 위로) 보스전 추가 피해 한도(SIM 9 — 레벨 오른 특수병이 보스전에서도 세게)
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
  return 6 * Math.pow(n, 0.8) * WEAPON[clamp(tier, 0, WEAPON.length - 1)] * (1 + 0.05 * fireLv);   // 캠페인 단계는 3을 넘지 않는다(값 그대로)
}
/* 몸 반지름 상한: 보통 2.4m, 개편 판은 BUILD.narrow(세 칸 길 — 갈림 벽·세 칸 게이트·세 칸 내려찍기 — 한 칸(3.3m)에 몸이 들어가게, ENDGAME.md 20.2).
   step·buildSegment·botTarget이 그 판에 맞춰 정한다(화면은 마지막 step의 값을 쓴다) */
const R_MAX = 2.4;
let RCAP = R_MAX;
export const radiusCap = () => RCAP;
const capFor = (s) => (s && s.endless && s.endless.bld ? BUILD.narrow : R_MAX);
export function radius(n) { return Math.min(RCAP, 0.35 + 0.18 * Math.sqrt(Math.max(1, n))); }
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
export function applyOp(n, op, v, max = NCAP) {
  let r;
  if (op === 'add' || op === 'unit') r = n + v;
  else if (op === 'mul') r = n * v;
  else r = Math.ceil(n / v);
  return Math.min(max, r);
}
export function cellLabel(c) {
  if (c.op === 'add' || c.op === 'unit') return (c.v >= 0 ? '+' : '−') + fmtN(Math.abs(c.v));
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
/* 태그 전체 효과(청크 ×0.5, 모든 청크의 위협 배수, 열쇠 상자, 상자 접촉 50%)는 L15부터. L5·L10은 소개 레벨이라 보스만 어렵다(2단계 — 1단계는 마지막 두 청크도) */
export const TAG_FULL_FROM = 15;
export const HARD_CHUNKS = 0.5;   // 어려움·매우 어려움(L15+)의 청크 수 배수
/* 판 중 위협 배수(적·벽·상자·철창 체력).
   SIM 8: 어려움 1.2 → 1.25 — 스치기가 안 물어 집중한 사람이 어려운 판(L15+)의 달리기에서 덜 죽었다(경기장 전 실패 35 → 29%, 스킬 안 누르는 사람 승률 +9%p).
   SIM 7의 승률·경기장 전 실패에 맞춘다(매우 어려움은 그대로 맞았다) */
const TAG_THREAT = { '': 1, hard: 1.25, super: 1.5, rest: 0.55 };
/* 2단계(P08): 무리 수 배수(태그), 졸개 체력(D의 몫 — 어려운 태그는 더 단단하다), 무리 압력 상한 */
const TAG_WAVE = { '': 1, hard: 1.2, super: 1.5, rest: 0.55 };
export const GRUNT_HP = { onboard: 0.15, early: 0.18, normal: 0.19, hard: 0.27 };
const gruntHpOf = (l, hardish) => (hardish ? GRUNT_HP.hard : l <= 4 ? GRUNT_HP.onboard : l <= 10 ? GRUNT_HP.early : GRUNT_HP.normal);
export const PRESSURE_MAX = 1.8;
export const BRUTE_X = 5;   // 거구 체력 = 졸개 × BRUTE_X
/* 단, 그대로 부딪혀도 골든 패스 병력의 이만큼까지만 잃게(작은 분대가 거구 하나에 몰살되지 않게).
   SIM 8: 0.4 → 0.55 — SIM 7 거구 접촉 손실의 반 넘게(53%)가 그림 끝에서 0.12m 안쪽 스치기였다(CONTACT_GRACE로 이제 안 문다).
   스친 것 대신 제대로 맞은 거구가 더 아프게 해 판 중 긴장(낙폭)을 SIM 7과 같게 둔다 */
export const BRUTE_CAP = 0.55;
/* P10: 못 부순 상자·철창에 부딪히면 남은 체력의 이만큼(10마다 1명)을 잃는다 */
export const CRATE_HIT = { normal: 0.25, hard: 0.5 };
/* 화면에 한꺼번에 보이는 좀비 수 상한(360×640에서 읽히게): 40m 구간 안 FOE_CAP마리. 넘치면 수를 줄이고 체력을 몰아 준다 */
export const FOE_CAP = 34;
export const FOE_WIN = 40;

/* 보스 정하는 법(레벨 태그·구간별). 상수는 tools/bench.mjs로 difficulty_targets 구간에 맞췄다.
   mode 'ref': 체력 = dps(m × 기준 병력, 기대 화력) × bossKill — 상자·특수병 없이 기준 병력으로 깰 수 있는지 보정에서 확인한다.
   mode 'pop'(어려움·매우 어려움): 사람 흉내 봇 무리(POP)를 경기장까지 돌려 각자 이길 수 있는 가장 큰 체력을 잰 뒤, 무리의 승률이
   band에 가장 가깝게 되는 체력. 단 H*(기준 봇이 기대 강화·영웅, 스킬 자동, 상자·특수병을 다 써서 도착 병력의 10%를 남기고 이기는
   가장 큰 체력)를 넘지 않는다 — 기준 봇은 늘 이긴다. 상자·철창을 쓰지 않으면 어려울 수 있다(일반 레벨은 없이도 깬다).
   qaKeep('ref'만): 배치 검사에 걸리면(서 있기만 해도 이기면) 보스를 조금씩 세게 하되, 사람 흉내 무리의 산만한 사람(sl3)이 이만큼은 이기는 데까지만.
   c: 보스가 분대에 닿기까지 c × bossKill 초(격앙 전 걸음 기준) */
export const BOSS_SPEC = {
  onboard: { mode: 'ref', m: 0.65, c: 1.6, qaKeep: 0.92 },
  early: { mode: 'ref', m: 0.95, c: 1.2, qaKeep: 0.75 },    // L5-10 일반
  // L11+ 일반 — 2단계: 판 중 위협이 세져 m을 낮추고, 보스가 늦게 닿게(c↑ — 이긴 판의 20~50%만 맞붙게).
  // SIM 8: 0.55 → 0.565 — 스치기가 안 물어 사람 흉내 봇이 기준 봇보다 조금 더 남겨 온다(산만한 사람 +4%p). SIM 7의 승률·보스 접촉에 맞춘다
  normal: { mode: 'ref', m: 0.565, c: 1.04, qaKeep: 0.45 },
  rest: { mode: 'ref', m: 0.42, c: 1.4, qaKeep: 0.88 },
  // band: 사람 흉내 무리(POP)의 첫 시도 승률 목표 [하한, 상한] — on 집중(스킬 씀), off 집중(스킬 안 씀), sl3 산만
  // band.w를 주면 POP의 w 대신 그 가중치로 벌점을 매긴다
  // pump(3단계): 덧셈 칸을 쏘아 올리는 집중한 사람 — 쏘아 올리지 않는 사람(on)과 숙련자(expert) 구간 사이
  // L5(첫 어려움): 산만한 사람의 하한과 집중한 사람의 상한을 한 체력으로 둘 다 맞출 수 없다 — 집중한 사람 쪽을 지킨다(sl3 가중치 0.25, README 알려진 차이)
  hard5: { mode: 'pop', c: 0.9, band: { on: [0.72, 0.8], off: [0.6, 1], sl3: [0.42, 0.58], pump: [0.75, 0.88], w: { on: 1.5, off: 0.6, sl3: 0.25, pump: 1 } } },
  super10: { mode: 'pop', c: 0.9, band: { on: [0.55, 0.65], off: [0.45, 1], sl3: [0.22, 0.38], pump: [0.6, 0.8] } },
  // 어려움 L11+: 산만한 사람 가중치 1(무리 기본 0.5) — 새 표본에서 산만한 사람이 구간 아래(13%)로 떨어졌다
  hard: { mode: 'pop', c: 0.9, band: { on: [0.5, 0.62], off: [0.38, 1], sl3: [0.18, 0.38], pump: [0.58, 0.74], w: { on: 1.5, off: 0.6, sl3: 1, pump: 1 } } },
  super: { mode: 'pop', c: 0.9, band: { on: [0.32, 0.48], off: [0.2, 1], sl3: [0, 0.24], pump: [0.38, 0.6] } },
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
    threat: TAG_THREAT[tg.tag] || 1,            // 쉼 레벨과 tagFull(L15+ 어려운 태그)에만
    speed: 8.5 + 1.5 * kt,
    P: Math.round(30 + 8 * Math.pow(l - 1, 1.15)),    // 무난한 플레이로 보스에 도착하는 병력(강화 없을 때 추정)
    chunks: hardish && tagFull ? Math.round(baseChunks * HARD_CHUNKS) : baseChunks,   // 어려운 판은 짧게(L5·L10은 소개 레벨이라 그대로)
    pressure: Math.min(PRESSURE_MAX, 0.55 + 0.65 * k + 0.005 * over),
    hardish,
    waveMul: TAG_WAVE[tg.tag] || 1,
    gruntHp: gruntHpOf(l, hardish),
    gruntBase: gruntHpOf(l, false),
    crateHit: hardish && tagFull ? CRATE_HIT.hard : CRATE_HIT.normal,
    maxMul: l < UNLOCK.mul ? 0 : l < 10 ? 4 : 5,   // 2단계: ×·÷ 비중을 올린다(곱셈은 차이를 보존한다, 생각 줄도 ×를 쓴다)
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
/* 회차 표(cyctable.js — 2회차부터의 L1~60 보정 결과). 도구용: 통째로 바꾼다({ sim, cycles: { 2: { levels } } }) */
let CYCT = CYC;
export function useCyc(t) { CYCT = t || { sim: -1, cycles: {} }; cache.clear(); parCache.clear(); }
export const cycTable = () => CYCT;
const heroCapAt = (L, c = 1) => (c > 1 ? heroCapC(c, L) : Math.min(5, 2 + Math.floor((Math.max(1, L) - 1) / 10)));   // roster.heroCap(C)과 같다
function draftExpect(l) {
  const u = Math.min(10, Math.floor((l - 1) / 5));
  return { start: u, fire: u, coin: u, hero: l >= UNLOCK.hero ? 'mungchi' : '', heroLv: l >= UNLOCK.hero ? Math.max(1, heroCapAt(l) - 1) : 0 };
}
/* 회차 c(2부터)의 기대 강화 = 1회차 EXPECT + 10·(c−1)단계, 영웅 +2·(c−1)레벨(ENDGAME.md 4절) — 앞 회차에서 다 올린 레벨(5 + 2·(c−2)) 아래로는 보지 않는다.
   회차의 값 곡선(store.upgCost)이 1회차의 걸음을 되풀이하게 되어 있어 강화가 붙는 순서도 1회차와 같다고 본다 */
export const CYCLE_UPG = 10;
export const CYCLE_HERO = 2;
export function expectAt(L, c = 1) {
  if (c > 1) {
    const b = expectAt(L);
    const up = CYCLE_UPG * (c - 1);
    return { start: b.start + up, fire: b.fire + up, coin: b.coin + up, hero: b.hero || 'mungchi', heroLv: Math.max((b.heroLv | 0) + CYCLE_HERO * (c - 1), 5 + CYCLE_HERO * (c - 2)) };
  }
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
export function expectLoadout(L, c = 1) {
  const e = expectAt(L, c);
  // 2회차부터는 영웅이 L1부터 함께 간다
  const hero = (c > 1 || Math.floor(L) >= UNLOCK.hero) && e.hero && e.heroLv > 0 && HEROES[e.hero] ? { id: e.hero, lv: e.heroLv } : null;
  return { start: START_N + 2 * e.start, fire: e.fire, hero };
}
/* 지금 진행(열린 가장 높은 레벨 maxL)에서 코인으로 '새로' 살 수 있는 강화 단계 상한 = EXPECT(maxL) + 1.
   이미 더 산 저장은 그대로 둔다(상한은 새로 사는 것만 막는다). 세 강화 모두 같은 값 */
/* 회차 c(열린 가장 높은 회차)에서는 10·(c−1) + (그 회차 진행 maxL에 따른 1회차 식) — 회차마다 +10단계가 진행에 따라 풀린다 */
export function upgCap(maxL, c = 1) {
  const e = expectAt(maxL);
  return (c > 1 ? CYCLE_UPG * (c - 1) : 0) + clamp(Math.max(e.start, e.fire, e.coin) + 1, 1, 10);
}

/* ---------- 레벨 생성 ---------- */
/* 청크 종류: gate(게이트 줄) shoot(통짜 마이너스 게이트) guard(좋은 칸을 지키는 장애물) trap(×3 뒤 ÷2 함정, 한 청크 두 줄)
   wave(좀비 무리) wall(바리케이드) crate(보급 상자) spit(독침 좀비) saw(톱날) rest(숨 돌리기)
   2단계: surge(마지막 게이트 앞 몰이 — 양옆에서 몰려오는 무리), key(어려운 레벨의 열쇠 상자), crisis(L3·L4의 한 번의 위기) */
const GROW_KINDS = ['gate', 'guard', 'trap'];
const THREAT_KINDS = ['wave', 'shoot', 'wall', 'crate', 'spit', 'saw'];
export const TRAP_FROM = 8;     // ×3(L10 전에는 ×2) 바로 뒤 ÷2 함정
export const SURGE_FROM = 5;    // 마지막 게이트 앞 몰이 청크
export const JACK_FROM = 4;     // 빨강 잭팟 줄
export const THINK_FROM = 5;    // 생각 줄(×2 대 +a, 겉보기 ±15%)
export const CRISIS_LEVELS = [3, 4];
const KIND_UNLOCK = { gate: 1, wave: 1, rest: 1, shoot: UNLOCK.shoot, guard: UNLOCK.wall, trap: TRAP_FROM, wall: UNLOCK.wall, crate: UNLOCK.crate, spit: UNLOCK.spit, saw: UNLOCK.saw };
const KIND_WEIGHT = { gate: 5, guard: 2, trap: 0.6, wave: 2.4, shoot: 1, wall: 1, crate: 1.1, spit: 1.3, saw: 1.1 };
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

/* 청크 순서. 정해진 자리(먼저 정한 것이 이긴다): 첫·마지막 = gate, 소개 청크 = 1번, 새 적 소개 무리 = 3번, 5번째마다 rest,
   마지막 바로 앞 = crisis(L3·L4) 또는 surge(L5+), 어려움·매우 어려움은 surge 바로 앞 = key(열쇠 상자) */
function planChunks(p, g) {
  const K = p.chunks;
  const plan = [];
  const intro = INTRO[p.L];
  const crisis = CRISIS_LEVELS.includes(p.L);
  const surge = p.L >= SURGE_FROM && K >= 5 && p.tag !== 'rest';
  const keyAt = p.hardish && p.tagFull && surge ? K - 3 : -1;   // 열쇠는 태그 전체가 걸리는 L15부터(L5·L10은 보스 한정 어려움)
  let lastThreat = '';
  for (let i = 0; i < K; i++) {
    let kind;
    if (i === 0) kind = 'gate';
    else if (i === K - 1) kind = 'gate';
    else if (intro && i === 1) kind = intro;
    else if (FOE_INTRO.includes(p.L) && i === 3) kind = 'wave';
    else if (crisis && i === K - 2) kind = 'crisis';
    else if (surge && i === K - 2) kind = 'surge';
    else if (i === keyAt) kind = 'key';
    else if (i % 5 === 4) kind = 'rest';
    else if (GROW_KINDS.includes(plan[i - 1])) kind = weighted(g, THREAT_KINDS, p.L, p.L < 10 ? lastThreat : '');
    else kind = weighted(g, GROW_KINDS, p.L, '');
    if (THREAT_KINDS.includes(kind)) lastThreat = kind;
    plan.push(kind);
  }
  // 무한모드 2구간부터 구간마다 갈림길 하나를 끼운다(다른 청크를 대신하지 않는다 — 구간의 성장·위협 흐름은 그대로)
  if (p.endless && p.seg >= FORK_FROM) plan.splice(2, 0, 'fork');
  if (p.chain) plan.splice(3, 0, 'fork');   // 연속 갈림길(바퀴 5부터): 앞 선택이 다음 선택을 묶는다
  if (p.maze && chance(g, LANES.mazeP)) plan.splice(plan.length - 3, 0, 'maze');   // 칸막이(22절 — 개편 판만): 보스 앞 몰이 전에
  if (p.luck && chance(g, p.luckP || LANES.luckP)) plan.splice(1, 0, 'luck');   // 행운의 동전(유물)이면 p.luckP
  if (p.rush && p.rushRoll < RUSH.p) plan.splice(Math.max(1, plan.length - 2), 0, 'rush');   // 게이트 몰이(39.5): 굴림은 따로(p.rushRoll — 위 배치가 밀리지 않게), 마지막 게이트·몰이 앞
  if (p.gaunt) {   // 함정 길(46.4): 굴림은 따로 — 첫 게이트 뒤 · 마지막 두 청크 앞 아무 데나, 구간마다 하나(GAUNT.two부터 둘)
    const gg = { rs: hash(VERSION, 'gauntPlan', p.gauntSeed >>> 0, p.seg) };
    for (let i = p.seg >= GAUNT.two ? 2 : 1; i > 0; i--) {
      let at = 1 + Math.floor(rand(gg) * Math.max(1, plan.length - 3));
      while (plan[at - 1] === 'fork' && plan[at] === 'fork') at++;   // 연속 갈림길(25구간~) 사이에는 끼지 않는다
      plan.splice(at, 0, 'gaunt');
    }
  }
  return plan;
}

/* 가속 발판·특별 구간 기록(46.1·46.3 — 개편 판 생성만) */
function addPad(lv, x0, x1, z, len, mul) { (lv.pads || (lv.pads = [])).push({ id: lv.nextId++, x0, x1, z, len, mul }); }
function addZone(lv, k, z0, z1) { (lv.zones || (lv.zones = [])).push({ id: lv.nextId++, k, z0, z1 }); }

function lanes(count) {
  const out = [];
  const w = (2 * ROAD) / count;
  for (let i = 0; i < count; i++) out.push({ x0: -ROAD + i * w, x1: -ROAD + (i + 1) * w });
  return out;
}

/* 덧셈 칸: 쏘면 오른다. rise = 기대 화력으로 PUMP_T초 쏘면 오르는 몫(그 줄 병력 ng의 비율), cap = 오를 수 있는 끝.
   파랑(+) 칸은 v + 0.35·ng까지(P07: 덧셈이 차이를 메우지 않게), 빨강(−) 칸은 v + 0.6·ng까지.
   SIM 9(파고들기): 같은 줄에 파랑 덧셈 칸이 있으면 빨강 칸의 끝은 그 줄 파랑 칸 끝의 최댓값 + RED_OVER·ng(최소 RED_OVER_MIN) 이상 —
   오르는 빠르기(step)는 그대로라 끝까지 가려면 오래 쏴야 한다(기대 강화로 다가오는 동안에는 못 닿는다 — tests/run.mjs).
   끝을 직접 정한 칸(o.cap: 잭팟·생각·위기·보스 직전·지킨 줄의 쏴서 키우는 +)과 파랑 덧셈 칸이 없는 줄(× 대 −a 판돈 줄, 통짜 마이너스)은 그대로.
   골든 패스·고정 위치 할당량은 다가오는 동안 오르는 만큼만 보고(goldenValue·holdVal — 새 끝에 닿지 않는다) 레벨 배치는 SIM 8과 같다.
   o = { rise, cap, jack } — jack: 빨강 잭팟(몰아 쏘면 빨리 올라 그 줄의 최선이 된다) */
export const PUMP_T = 3.2;
export const PUMP_RISE = 0.4;
export const CAP_BLUE = 0.35;
export const CAP_RED = 0.6;
export const RED_OVER = 0.25;
export const RED_OVER_MIN = 4;
/* 무한모드 구간을 만드는 동안만 1보다 작다(buildSegment가 걸었다 푼다): 덧셈 칸의 이득(+a, 쏘아 올리는 몫, 지원병 상자)을 이 배수로 줄여
   한 구간의 순성장을 묶는다(ENDLESS.gk). 캠페인 생성에서는 늘 1 — x·1 = x라 배치·숫자가 그대로다 */
let GK = 1;
const G = (x) => x * GK;
const blueCapOf = (ng) => Math.max(GK < 1 ? 2 : 6, nice(G(ng * CAP_BLUE)));
export function makeCell(op, v, ng, x0, x1, fire = 0, o = {}) {
  const c = { op, v, v0: v, x0, x1, step: 0, acc: 0, cap: v, hitT: -9 };
  if (op === 'add') {
    const rise = o.rise ?? G(PUMP_RISE);
    c.step = (dps(ng, 0, fire) * PUMP_T) / (rise * Math.max(ng, 6));
    c.cap = o.cap ?? v + (v < 0 ? Math.max(10, nice(ng * CAP_RED)) : blueCapOf(ng));
    c.rise = rise;
    if (o.jack) c.jack = true;
  }
  return c;
}
/* 한 줄의 칸들(ch = [[op, v, o], …] — cells와 같은 순서)에 빨강 칸의 높은 끝(RED_OVER)을 매긴다 */
function redOver(cells, ch, ng) {
  let blue = -Infinity;
  for (const c of cells) if (c.op === 'add' && c.v > 0 && c.cap > blue) blue = c.cap;
  if (blue === -Infinity) return cells;
  const top = blue + Math.max(RED_OVER_MIN, nice(ng * RED_OVER));
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const o = ch[i][2];
    // cap0: 높이기 전 끝(SIM 8의 끝 — 기대 화력으로 4.8초쯤 몰아 쏘면 닿는다). 화면은 이 칸에 'MAX'를, 측정 봇 trueworst는 이 끝을 본다
    if (c.op === 'add' && c.v < 0 && !(o && o.cap != null) && c.cap < top) { c.cap0 = c.cap; c.cap = top; }
  }
  return cells;
}
/* SIM 9(파고들기) 마무리: 높인 빨간 칸은 빨리 오른다(c.fast배, RED_FAST_MIN~RED_FAST_MAX) — 대신 정말 닿는 칸에만 남긴다.
   레벨을 다 만든 뒤 칸마다 '앞 줄을 지나면 그 칸 앞에 서서 몰아 쏘기(기대 강화, 영웅 없음)'를 실제로 돌려 보고(focusPass),
   지날 때 값이 같은 줄 파란 칸의 끝을 RED_WIN만큼 넘게 하는 가장 작은 배수(0.5 단위)를 그 칸의 빠르기로 삼는다 —
   기대 강화로 몰아 쏘면 파랑보다 조금 낫고, 끝(MAX)까지는 화력 강화·뭉치·스킬이 있어야 닿는다.
   RED_FAST_MAX배로도 못 넘는 깊은 빨간 칸과 L1~RED_FROM−1(첫 안내 레벨)은 SIM 8 그대로(끝·빠르기 모두) — 화면의 MAX 표시가 거짓말이 되지 않게.
   레벨 배치(골든 패스·고정 위치 할당량)는 이 전에 끝나 SIM 8과 같다 */
export const RED_FROM = 5;
export const RED_FAST_MIN = 2;
export const RED_FAST_MAX = 4;
export const redWin = (blue, ng) => blue + Math.max(2, Math.ceil(0.05 * ng));
function redFast(lv) {
  const cand = [];
  lv.rows.forEach((r, i) => r.cells.forEach((c, j) => { if (c.cap0 != null) cand.push([i, j]); }));
  const off = (c) => { c.cap = c.cap0; delete c.cap0; };
  if (!cand.length) return;
  if (lv.L < RED_FROM) { for (const [i, j] of cand) off(lv.rows[i].cells[j]); return; }
  const co = expectLoadout(lv.L, lv.cycle || 1);
  for (const [i, j] of cand) {
    const row = lv.rows[i];
    const c = row.cells[j];
    const need = redWin(Math.max(...row.cells.filter((d) => d.op === 'add' && d.v0 > 0).map((d) => d.cap)), row.ng);
    const step0 = c.step;
    const at = (f) => { c.step = step0 / f; const v = focusPass(lv, co, i, j); return v != null && v >= need ? v : null; };
    const top = at(RED_FAST_MAX);
    if (top == null) { c.step = step0; off(c); continue; }
    // 오르는 몫은 배수에 거의 비례 — 넘는 데 드는 배수를 어림하고(0.5 단위로 올림) 확인, 모자라면 한 칸씩 올린다
    const rise = Math.max(1, (top - c.v0) / RED_FAST_MAX);
    let f = Math.min(RED_FAST_MAX, Math.max(RED_FAST_MIN, Math.ceil(((need - c.v0) / rise) * 2) / 2));
    while (f < RED_FAST_MAX && at(f) == null) f += 0.5;
    c.fast = f;
    c.step = step0 / f;
  }
}
/* 몰아 쏘기 한 번: 그 줄의 기준 병력(골든 패스 ng, 기대 강화, 영웅 없음)이 앞 줄(i−1)을 막 지나(사거리 30m보다 멀면 30m 앞에서) 칸 (i, j) 가운데에 서서
   쏘며 다가간다 — 그 사이의 적·소품·톱날만 남긴다(총알을 막고 분대를 문다). 그 칸을 지날 때의 값(못 지나거나 다른 칸이면 null) */
export function focusPass(lv, co, i, j) {
  const row = lv.rows[i];
  const c = row.cells[j];
  const z0 = Math.max(i > 0 ? lv.rows[i - 1].z + 0.5 : 0, row.z - BULLET_RANGE);
  const near = (z) => z > z0 && z < row.z + 2;
  const s = newGame({ ...lv, rows: [row], foes: lv.foes.filter((f) => near(f.z)), props: lv.props.filter((p) => near(p.z)), saws: lv.saws.filter((w) => near(w.z)), marks: [] },
    { start: row.ng, fire: co.fire });
  const q = s.squad;
  const cx = (c.x0 + c.x1) / 2;
  q.z = z0;
  q.x = cx;
  const id = s.rows[0].id;
  const max = Math.ceil((row.z - z0 + 4) / Math.max(1, lv.speed) / DT);
  while (s.phase === 'run' && s.tick < max) {
    step(s, steer(s, cx));
    for (const e of s.ev) if (e.t === 'gate' && e.row === id) return e.x >= c.x0 - 1e-6 && e.x <= c.x1 + 1e-6 ? e.v : null;
  }
  return null;
}

/* 레벨 생성 중 위협 체력의 기준 화력: 골든 패스 병력 × 기대 화력 × 그 청크의 태그 배수 */
/* 첫 레벨들(L1~4)은 위협을 골든 패스의 ONBOARD_REF배 병력 기준으로 — 뒤처진 초보도 살아남게 */
export const ONBOARD_REF = 0.75;
const threatD = (lv, ng) => dps(lv.L <= 4 ? ng * ONBOARD_REF : ng, 0, lv.fireE || 0) * (lv.thr || 1);
/* 다가오는 동안 쏠 수 있는 초: 총알이 닿는 30m를 분대(그리고 다가오는 적)가 좁히는 시간 */
const approachT = (p, foeSpd = 0) => (BULLET_RANGE - 2) / (p.speed + foeSpd);

/* 기준 플레이(골든 패스)가 이 칸을 고르면 몇 명이 되나 — 덧셈 칸은 2.4초쯤 쏴서 올린다고 본다(칸마다 오르는 빠르기대로) */
function goldenValue(n, c) {
  const v = c.op === 'add' ? Math.min(c.cap, c.v + Math.floor(0.75 * (c.rise ?? G(PUMP_RISE)) * n)) : c.v;
  return applyOp(n, c.op, v);
}

/* 좀비가 맞는 몸: 땅 위 타원 — 옆으로 ±FOE_HX·r(그 거리에서 그린 그림 폭 — 졸개 0.34m, 거구 0.76m), 앞뒤 ±r(그림자). 총알은 ±(r + 0.12)(멀리서 그린 크기) */
export const FOE_HX = 0.8;
/* 톱날이 맞는 몸: 땅 위 타원 — 옆으로 ±w.w/2(그린 날 폭), 앞뒤 ±SAW_HD */
export const SAW_HD = 0.35;
/* 톱날 피해(49절 — 개편 판만): 톱날마다 처음 닿는 순간 병력의 bite 몫을 한 번에 잃고, 닿아 있는 동안 초당 flat + rate × 병력.
   캠페인·앞 단계 판은 예전 그대로 초당 4 + 0.35 × 병력(보정표·지문이 그 규칙으로 잰 값) */
export const SAW2 = { bite: 0.08, flat: 6, rate: 0.55 };
export const FOE_BASE = {
  grunt: { r: 0.42, spd: 3.2, home: 0.9, homeDist: 24 },
  runner: { r: 0.36, spd: 6.2, home: 2.8, homeDist: 26 },
  brute: { r: 0.95, spd: 1.6, home: 0.5, homeDist: 20 },
  spit: { r: 0.5, spd: 0, home: 0, homeDist: 0 },
};
function addFoe(lv, g, kind, x, z, hp, extra) {
  const f = { id: lv.nextId++, kind, x: clamp(x, -4.6, 4.6), z, hp: Math.max(1, Math.round(hp)), max: 0, alive: true, awake: false, hitT: -9, cd: 0, seed: (rand(g) * 1000) | 0, ...FOE_BASE[kind], ...extra };
  f.max = f.hp;
  if (kind === 'spit') f.cd = 0.6 + rand(g) * 1.2;
  lv.foes.push(f);
  return f;
}
/* 화면 상한: z0~z1에 새로 둘 수 있는 좀비 수(이미 있는 것 포함 FOE_WIN m 창마다 FOE_CAP) */
function foeRoom(lv, z0, z1) {
  let n = 0;
  for (const f of lv.foes) if (f.z > z0 - FOE_WIN / 2 && f.z < z1 + FOE_WIN / 2) n++;
  return Math.max(2, FOE_CAP - n);
}
/* 졸개 한 마리 체력 = gruntHp × D(어려운 태그는 단단하다) */
const gruntHp = (lv, ng) => (lv.gh || lv.params.gruntBase) * threatD(lv, ng);

function spawnWave(lv, g, p, z, ng, scale, opt = {}) {
  let hp = gruntHp(lv, ng);
  const m = Math.max(3, Math.round(13 * p.pressure * (lv.wm || 1) * scale * U(g, 0.85, 1.15)));
  const placed = [];
  const lane = opt.lane;   // {x0,x1} 이면 그 차선에만
  const x0 = lane ? lane.x0 + 0.6 : -4.4;
  const x1 = lane ? lane.x1 - 0.6 : 4.4;
  let budget = m;
  const forced = lv.force;
  if (has(p.L, 'brute') && (forced.has('brute') || (!opt.noBrute && chance(g, 0.35 + 0.2 * p.k)))) {
    forced.delete('brute');
    placed.push(addFoe(lv, g, 'brute', U(g, x0, x1), z + U(g, 4, 8), Math.min(hp * BRUTE_X, BRUTE_CAP * ng * SOLDIER_HP)));
    budget -= 6;
  }
  if (has(p.L, 'runner') && (forced.has('runner') || (!opt.noRunner && chance(g, 0.5)))) {
    forced.delete('runner');
    // 질주 좀비는 길 가장자리에서 비스듬히 파고든다(P08 — 정면 사격에 늦게 들어온다)
    const rn = Math.min(8, Math.max(2, Math.round(budget * 0.3)));
    const side = chance(g, 0.5) ? -1 : 1;
    for (let i = 0; i < rn; i++) {
      const sd = lane ? (lane.x0 + lane.x1 < 0 ? -1 : 1) : i % 2 ? side : -side;
      placed.push(addFoe(lv, g, 'runner', sd * U(g, 4.1, 4.6), z + 10 + i * 1.6, hp * 0.55));
    }
    budget -= Math.ceil(rn / 2);
  }
  // 화면 상한: 넘치면 수를 줄이고 체력을 몰아 준다(총량은 같다)
  let k = Math.max(2, budget);
  const room = Math.max(2, foeRoom(lv, z, z + 9) - placed.length);
  if (k > room) { hp *= k / room; k = room; }
  const grunts = [];
  for (let i = 0; i < k; i++) grunts.push(addFoe(lv, g, 'grunt', U(g, x0, x1), z + U(g, 0, 9), hp));
  for (const f of grunts) placed.push(f);
  if (p.endless && !opt.noElite) makeElites(g, p, grunts, ng);
  if (lv.og && !opt.noElite) makeShield(lv.og, grunts);
  return placed;
}
/* 2단계 장애물(4구간부터 — lv.og가 있는 구간만): 무리의 앞쪽 졸개 하나를 방패 정예로(앞줄에서 총알을 막는다). 체력은 그대로 — 총알만 덜 들어간다.
   장애물 전용 난수(lv.og)라 무리의 자리·체력·다른 정예는 장애물이 없는 구간과 같다 */
function makeShield(og, grunts) {
  const pool = grunts.filter((f) => !f.elite).sort((a, b) => a.z - b.z || a.id - b.id);
  for (let i = OBST.shield.n; i > 0 && pool.length > 2; i--) pool.splice((rand(og) * Math.min(4, pool.length)) | 0, 1)[0].elite = 'shield';
}
/* 무한모드: 무리의 졸개 몇을 정예로 바꾼다(체력 × ELITE.hp — 무리가 그만큼 단단해진다). 뒤쪽(먼) 졸개부터 — 앞줄 졸개를 잡는 동안 보인다 */
function makeElites(g, p, grunts, ng) {
  const pool = grunts.slice().sort((a, b) => b.z - a.z || a.id - b.id);
  for (const k of ['toxic', 'split']) {
    const E = ELITE[k];
    if (p.seg < E.from) continue;
    for (let i = E.n(p.seg); i > 0 && pool.length > 2; i--) setElite(pool.splice((rand(g) * Math.min(4, pool.length)) | 0, 1)[0], k, ng);
  }
}
function placeElites(lv, p) {
  if (p.endless || p.L < UNLOCK.toxic) return;
  const g = { rs: hash(VERSION, 'elite', p.L, lv.attempt) };
  // 그 레벨에서 처음 나오는 정예를 먼저 고른다(작은 무리에서도 빠지지 않게)
  const kinds = ['toxic', 'split'].filter((k) => p.L >= UNLOCK[k]).sort((x, y) => (UNLOCK[y] === p.L) - (UNLOCK[x] === p.L));
  const got = {};
  const pass = (min, only) => {
    for (const ch of lv.chunks) {
      const pool = lv.foes.filter((f) => f.kind === 'grunt' && !f.elite && !f.flank && f.z >= ch.z && f.z < ch.z + ch.len).sort((a, b) => b.z - a.z || a.id - b.id);
      if (pool.length < min) continue;
      for (const k of kinds) {
        if (only && k !== only) continue;
        for (let i = ELITE[k].nL(p.L, pool.length); i > 0 && pool.length > 2; i--) { setElite(pool.splice((rand(g) * Math.min(4, pool.length)) | 0, 1)[0], k, ch.ng); got[k] = 1; }
      }
      if (only && got[only]) return;
    }
  };
  pass(ELITE_WAVE);
  for (const k of kinds) if (!got[k]) pass(3, k);   // 무리가 작은 레벨(쉼 따위)에도 하나는 나오게
}
function setElite(f, k, ng) {
  const E = ELITE[k];
  f.elite = k;
  f.hp = f.max = Math.max(1, Math.round(Math.min(f.hp * E.hp, Math.max(f.hp, E.cap * ng * SOLDIER_HP))));
  return f;
}

/* 무리가 기준 화력에 얼마나 새어 들어오나(손실 병력 추정). 기준 봇과 같은 모형(foeLeftover): 몇 자리 중 가장 덜 잃는 자리에 선
   분대가, 닿을 적(옆으로 따라붙는 만큼 포함)의 체력 중 쏴서 못 잡는 몫을 맞는다. 골든 패스는 '무난한 사람'이라 LEAK_K배 */
export const LEAK_K = 1.35;
const LEAK_XS = [-3.8, -2.5, -1.25, 0, 1.25, 2.5, 3.8];
/* 개편 판(BKON): 골든 패스의 화력도 위협 배수만큼(무리 체력이 lv.thr로 커지니 같은 잣대로 — 아니면 18구간쯤부터 '몰이 한 번에 전멸'로 읽혀
   보스 체력이 병사 몇 명 기준으로 무너지고 무리는 20%로 깎였다, ENDGAME.md 20.1). buildSegment가 청크마다 정한다 */
let LEAKT = 1;
function waveLeak(foes, ng, p, fire = 0, xs = LEAK_XS) {
  if (!foes.length) return 0;
  const D = dps(ng, 0, fire) * LEAKT;
  const R = radius(ng);
  let best = Infinity;
  for (const x of xs) best = Math.min(best, foeLeftover(foes, x, R, R + 0.3, D, p.speed, null));
  return Math.min(Math.max(0, ng - 1), Math.ceil((LEAK_K * best) / SOLDIER_HP));
}

/* 한 청크가 골든 패스에서 앗아 가는 병력의 상한(병력 비율): 넘으면 무리 체력을 줄인다 — 작은 분대가 한 무리에 몰살되는 배치를 막는다.
   몰이(surge)는 그 레벨의 가장 센 무리라 상한이 조금 높다 */
export const LEAK_CAP = { wave: 0.3, surge: 0.4 };
function capLeak(foes, ng, p, fire, cap, xs) {
  let loss = waveLeak(foes, ng, p, fire, xs);
  for (let i = 0; i < 10 && loss > Math.max(2, cap * ng); i++) {
    for (const f of foes) { f.hp = f.max = Math.max(1, Math.round(f.hp * 0.85)); }
    loss = waveLeak(foes, ng, p, fire, xs);
  }
  return loss;
}

function makeRow(lv, z, cells, ng, src = 'gate', kind = 'plain') {
  const row = { id: lv.nextId++, z, cells, done: false, chosen: -1, ng, src, kind };
  lv.rows.push(row);
  return row;
}

/* 게이트 줄 고르기(P07). 줄 종류(row.kind):
   - stake 판돈 줄: 틀리면 판이 기운다 — ×m 대 큰 −a(또는 ÷2), ×가 없으면 +A 대 큰 −B(또는 ÷2)
   - think 생각 줄(L5+): ×2 대 +a(겉보기 ±15%, 덧셈 칸은 거의 안 오른다) — 지금 병력에 따라 답이 바뀐다
   - jack 빨강 잭팟(L4+): −a 칸을 약 2.5초 몰아 쏘면 그 줄의 최선, 아니면 손해. 옆은 작은 +b
   - plain 보통 줄: +a 대 −b / ÷2 / 작은 +c
   - last 보스 직전 줄: ×2 대 큰 +a
   음수 칸 없는 줄이 적게(계획: 65% → 35% 이하). 세 칸 줄(L10+)은 셋째 칸을 더한다 */
const ROW_MIX = {
  early: { stake: 0.55, jack: 0.15, plain: 0.3 },
  main: { stake: 0.05, think: 0.25, jack: 0.6, plain: 0.1 },
  // 어려움·매우 어려움(L15+, 3단계): 잭팟(몰아 쏘면 겉보기 최악이 최선)을 줄이고 판돈·생각 줄을 늘린다 — 쏘아 올리기만 아는 사람이
  // 어려운 판을 쉽게 넘지 않게, '늘 겉보기 최악 칸'이 잭팟 전략이 되지 않게
  hard: { stake: 0.3, think: 0.35, jack: 0.25, plain: 0.1 },
};
/* 어려움·매우 어려움(L15+)의 보스 직전 줄이 생각 줄인 몫(일반은 LAST_THINK) */
export const LAST_THINK_HARD = 0.6;
function rowKind(g, p, canMul) {
  const mix = p.mix ? p.mix : p.L < THINK_FROM ? ROW_MIX.early : p.hardish && p.tagFull ? ROW_MIX.hard : ROW_MIX.main;
  let sum = 0;
  const ok = (k) => (k !== 'jack' || p.L >= JACK_FROM) && (k !== 'think' || (p.L >= THINK_FROM && (canMul || has(p.L, 'div'))));
  for (const k in mix) if (ok(k)) sum += mix[k];
  let r = rand(g) * sum;
  for (const k in mix) { if (!ok(k)) continue; r -= mix[k]; if (r <= 0) return k; }
  return 'plain';
}
/* 생각 줄의 덧셈 칸: a = ng × (1 ± lo~hi) — ×2(=2·ng)와 겉보기로 lo/2~hi/2 차이. 천천히 오른다(rise 0.05) */
export const THINK_GAP = [0.16, 0.3];
export const LAST_THINK = 0.3;
export const THINK_EVIL = 0.5;   // L8+ 생각 줄 중 '덜 나쁜 쪽'(÷2 대 −a) 몫
export const LAST_CAP = 0.5;     // 보스 직전 '쏴서 키우는 +' 칸이 오를 수 있는 몫(병력 비율) — 끝까지 쏘면 ×2보다 낫기도 하다   // 보스 직전 줄이 생각 줄인 몫(L5+)
function thinkAdd(g, ng, lo, hi) {
  const a = Math.max(5, nice(ng * (1 + (chance(g, 0.5) ? 1 : -1) * U(g, lo, hi))));
  return ['add', a, { rise: 0.05, cap: a + Math.max(1, nice(0.03 * ng)) }];
}
const badCell = (g, p, ng, lo, hi, divP) => (has(p.L, 'div') && chance(g, divP) ? ['div', 2] : ['add', -Math.max(3, nice(ng * U(g, lo, hi)))]);
/* 빨강 잭팟 칸: blueCap(옆 파랑 칸이 쏴서 닿는 끝)보다 0.2·ng 높은 데까지, 기대 화력으로 JACK_T초 몰아 쏘면 닿는다 */
export const JACK_T = 2.5;
function jackCell(g, ng, blueCap) {
  const a = Math.max(3, nice(ng * U(g, 0.12, 0.25)));
  const cap = blueCap + Math.max(4, nice(G(0.2 * ng)));
  const rise = ((a + cap) / Math.max(ng, 6)) * (PUMP_T / JACK_T);
  return ['add', -a, { rise, cap, jack: true }];
}
function gateChoices(g, p, ng, target, ctx) {
  const ratio = target / ng;
  const out = [];
  let kind = 'plain';
  const third = (has(p.L, 'triple') && chance(g, 0.3)) || ctx.force.has('triple');
  ctx.force.delete('triple');
  const canMul = ctx.mulLeft > ctx.reserve && ng <= 3000;
  const forceMul = ctx.force.has('mul') || ctx.force.has('mul3');
  const mulOf = () => {
    const m = ctx.force.has('mul3') || (has(p.L, 'mul3') && ng < 150 && chance(g, 0.35)) ? 3 : 2;
    ctx.force.delete('mul');
    if (m === 3) ctx.force.delete('mul3');
    ctx.mulLeft--;
    return ['mul', m];
  };
  if (ctx.last && ctx.mulLeft > 0 && ng <= 3000) {
    // 보스 직전의 큰 한 방: ×2 대 쏴서 키우는 +, 또는(L5+, LAST_THINK) ×2 대 거의 안 오르는 +a(겉보기 차이 8~15% — 계산이 곧 보스전 병력)
    ctx.mulLeft--;
    kind = 'last';
    if (p.L >= THINK_FROM && chance(g, p.hardish && p.tagFull ? LAST_THINK_HARD : LAST_THINK)) out.push(['mul', 2], thinkAdd(g, ng, THINK_GAP[0], THINK_GAP[1]));
    else { const a = Math.max(10, nice(ng * U(g, 0.7, 0.9))); out.push(['mul', 2], ['add', a, { cap: a + Math.max(6, nice(ng * LAST_CAP)) }]); }
  } else if (ctx.force.has('div')) {
    ctx.force.delete('div');
    kind = 'stake';
    out.push(['add', Math.max(5, nice(ng * clamp(ratio - 1, 0.3, 1.2) * U(g, 0.85, 1.2)))], ['div', 2]);
  } else {
    // 어려움·매우 어려움(L15+)의 첫 게이트 줄은 늘 판돈 줄(3단계): 겉보기로 나쁜 칸이 실제로도 크게 나쁘다
    const firstHard = p.hardish && p.tagFull && ctx.rows === 0;
    kind = (forceMul && canMul) || firstHard ? 'stake' : rowKind(g, p, canMul);
    if (kind === 'stake') {
      const [lo, hi] = p.L <= 4 ? [0.2, 0.35] : [0.3, 0.5];
      if (canMul && (forceMul || ratio > 1.1 || chance(g, 0.6))) out.push(mulOf(), badCell(g, p, ng, lo, hi, 0.5));
      else out.push(['add', Math.max(5, nice(G(ng * clamp(ratio - 1, 0.35, 1.2) * U(g, 0.9, 1.2))))], badCell(g, p, ng, lo + 0.05, hi + 0.05, 0.4));
    } else if (kind === 'think') {
      // 겉보기 차이 8~15% — 어느 쪽이 큰지 계산해야 한다. 덧셈 칸은 거의 오르지 않아(천천히 오른다) 겉보기가 곧 답이다.
      // L8+는 THINK_EVIL만큼 '덜 나쁜 쪽' 계산: ÷2 대 −a(a ≈ 병력의 절반 ± 8~15%, 거의 안 오른다)
      // '덜 나쁜 쪽'은 레벨당 한 줄(ctx.lessBad와 같은 몫 — 두 칸 다 빨간 줄이 여럿이면 판이 너무 출렁인다)
      if (has(p.L, 'div') && ctx.lessBad > 0 && (!canMul || chance(g, THINK_EVIL))) {
        ctx.lessBad--;
        const a = Math.max(3, nice(ng * (0.5 + (chance(g, 0.5) ? 1 : -1) * U(g, 0.08, 0.15))));
        out.push(['div', 2], ['add', -a, { rise: 0.05, cap: -a + Math.max(1, nice(0.03 * ng)) }]);
      } else if (canMul) {
        ctx.mulLeft--;
        out.push(['mul', 2], thinkAdd(g, ng, THINK_GAP[0], THINK_GAP[1]));
      } else {
        // ×도 '덜 나쁜 쪽'도 남지 않았으면 보통 줄
        kind = 'plain';
        const a = Math.max(5, nice(G(ng * clamp(ratio - 1, 0.25, 1.5) * U(g, 0.85, 1.2))));
        out.push(['add', a], ['add', -Math.max(3, nice(ng * U(g, 0.2, 0.45)))]);
      }
    } else if (kind === 'jack') {
      const b = Math.max(3, nice(G(ng * U(g, 0.2, 0.35))));
      out.push(['add', b], jackCell(g, ng, b + blueCapOf(ng)));
    } else {
      const a = Math.max(5, nice(G(ng * clamp(ratio - 1, 0.25, 1.5) * U(g, 0.85, 1.2))));
      out.push(['add', a]);
      const r = rand(g);
      if (has(p.L, 'div') && ctx.rows > 0 && r < 0.15) out.push(['div', 2]);
      else if (r < 0.75) out.push(['add', -Math.max(3, nice(ng * U(g, 0.2, 0.45)))]);
      else out.push(['add', Math.max(2, nice(a * U(g, 0.3, 0.6)))]);
    }
  }
  if (third) {
    const r = rand(g);
    if (r < 0.6 || kind === 'last') out.push(['add', -Math.max(3, nice(ng * U(g, 0.3, 0.6)))]);
    else out.push(['add', Math.max(3, nice(G(ng * U(g, 0.15, 0.35))))]);
  }
  // '덜 나쁜 쪽' 줄: −a 대 ÷2 (L8부터 가끔, 마지막 두 청크에는 없음)
  if (has(p.L, 'div') && ctx.lessBad > 0 && !ctx.late && out.length === 2 && !out.some((o) => o[0] === 'div') && chance(g, 0.18)) {
    ctx.lessBad--;
    if (out.some((o) => o[0] === 'mul')) ctx.mulLeft++;
    out.length = 0;
    kind = 'stake';
    out.push(['div', 2]);
    out.push(['add', -Math.max(5, nice(ng * U(g, 0.25, 0.4)))]);
  }
  // 섞기
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand(g) * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  out.kind = kind;
  return out;
}

/* 고정 위치 할당량(P03): 판 내내 한 자리에 서 있는 분대(x = −4.4·−2.5 → 왼쪽 무리, 0 → 가운데, +2.5·+4.4 → 오른쪽 무리)가
   얻는 몫이 어느 한 무리에 몰리지 않게 칸 순서를 고른다. 몫은 그 무리가 지나는 칸의 결과(덧셈 칸은 서서 쏘아 올린 값)로 본 성장 log(결과/병력)의 합 —
   정답 칸의 '수'가 아니라 '크기'로 맞춰야 ×2 한 줄이 작은 줄 셋을 이기지 않는다.
   두 칸 줄에서 x=0은 왼쪽 칸을 지난다(경계 규칙). 세 칸 줄의 가운데 정답은 세 칸 줄의 1/3 이하.
   점수가 같으면 원래(난수로 섞은) 순서를 쓴다. ctx.hold = [왼, 가운데, 오른] 성장 합, ctx.mid3 = 세 칸 줄 가운데 정답 수.
   cost(i)를 주면 칸 i 쪽 차선에 따로 드는 손실(지키는 벽·무리)을 뺀다 */
const HOLD_X = [-2.5, 0, 2.5];
const holdVal = (c, ng) => (c.op === 'add' ? applyOp(ng, 'add', Math.min(c.cap, c.v + Math.floor(1.1 * (c.rise ?? G(PUMP_RISE)) * ng))) : goldenValue(ng, c));
function holdBalance(ch, ng, ctx, fire = 0, goodIdx = -1, cost = null) {
  const n = ch.length;
  if (n < 2) return ch;
  const perms = n === 2 ? [[0, 1], [1, 0]] : [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const ln = lanes(n);
  const hold = ctx.hold;
  const n0 = Math.max(1, ng);
  let best = null;
  perms.forEach((pm, pi) => {
    const cells = redOver(pm.map((j, i) => makeCell(ch[j][0], ch[j][1], ng, ln[i].x0, ln[i].x1, fire, ch[j][2])), pm.map((j) => ch[j]), ng);
    // 서 있는 분대는 앞의 덧셈 칸을 3.5초쯤 쏘아 올린다
    const val = cells.map((c, i) => holdVal(c, ng) - (cost ? cost(pm[i]) : 0));
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
  const out = best.pm.map((j) => ch[j]);
  out.kind = ch.kind;
  out.perm = best.pm;
  return out;
}
const cellsOf = (ch, ng, fire) => { const ln = lanes(ch.length); return redOver(ch.map(([op, v, o], i) => makeCell(op, v, ng, ln[i].x0, ln[i].x1, fire, o)), ch, ng); };
const bestGolden = (cells, ng) => { let b = -Infinity; for (const c of cells) b = Math.max(b, goldenValue(ng, c)); return b; };
const wallProp = (lv, x0, x1, z, hp, extra) => {
  const h = Math.max(1, Math.round(hp));
  const w = { id: lv.nextId++, kind: 'wall', x0, x1, z, hp: h, max: h, alive: true, hitT: -9, ...extra };
  lv.props.push(w);
  return w;
};
/* 무리 체력 합을 total로 맞춘다(비율 그대로) */
function scaleFoes(foes, total) {
  const sum = foes.reduce((a, f) => a + f.hp, 0);
  if (sum <= 0) return;
  for (const f of foes) { f.hp = f.max = Math.max(1, Math.round((f.hp * total) / sum)); }
}

/* 몰이(surge) 무리 체력: 그 구간 기대 화력 × 쏠 수 있는 시간 × 이 배수(어려움·매우 어려움은 '가장 센 무리') */
export const SURGE_K = { normal: 0.6, hard: 1.3, super: 1.6 };
/* 위기(L3·L4): ÷2 대 −a, a = 병력 × (CRISIS_LOSS ± 0.05) — 어느 쪽이 덜 나쁜지는 지금 병력에 따라 다르다 */
export const CRISIS_LOSS = 0.5;
/* 열쇠(어려운 레벨): 30m 구간 안 보상(열쇠 상자 + 다른 보상) 체력 합 = 그 구간에서 쏠 수 있는 양의 1.05~1.35배 — 다 가질 수 없다 */
export const KEY_WIN = [0.45, 0.6];   // 3단계: 0.72~0.85 → 0.45~0.6(산만하지 않은 사람도 거의 못 깨서 열쇠가 쓸모없었다)
/* 지킨 줄의 '쏴서 키우는 +' 칸이 JACK_T초 몰아 쏘면 오르는 몫(병력 비율) */
export const GUARD_PUMP = [0.8, 1.0];
export const RIVAL_WIN = [0.6, 0.75];

/* 갈림길(분리대) 상수. nose: 청크 시작부터 코까지, FORK_TAPER: 코에서 완전히 갈릴 때까지(이 사이에 분대 몸이 가운데에서 밀려난다),
   wall: 완전히 갈린 뒤 벽까지, after: 벽 뒤 분리대 끝까지(보상 상자는 벽 7m 뒤), men: 지원병 상자 크기(병력 몫) */
export const FORK_FROM = 2;
/* 지형(ENDGAME.md 18.7 — 빌드 개편 판만, 바퀴 3·4·5부터): 늦게 보이는 길(갈림길 위험한 쪽의 벽·문 숫자가 HIDE_DIST m 안에서야 보인다, 대신 병사 보상 ×HIDE_BONUS),
   촘촘한 함정(쉼 줄이 30 → TIGHT_REST m, 톱날 하나 더), 연속 갈림길(갈림길 바로 뒤에 또 하나). 세 갈래는 분대 몸(반지름 2.4m)이 칸(3.3m)에 안 들어가 넣지 않는다 [수치는 초안] */
export const TERRAIN = { hideFrom: 13, hideDist: 16, hideBonus: 1.3, tightFrom: 19, tightRest: 16, chainFrom: 25 };
/* 칸막이 구간(ENDGAME.md 22절 — 개편 판만, 몸이 좁아(BUILD.narrow) 세 칸에 들어간다): 길을 칸막이 둘(LANE_X)로 세 칸으로 나눈다.
   s.lanes = [{ id, k: 'luck'|'maze', z0, z1, open: [[칸막이 번호, za, zb], …] }] — 열린 곳(open)에서만 옆 칸으로 한 칸씩 건넌다. 분대·좀비 모두 칸을 못 넘는다.
   - luck 행운 길(luckFrom구간부터 luckP): 세 칸 모두 가려진 상자(소·중·대가 무작위) — 손해는 없고 무엇이 나올지가 운(18.8)
   - maze 칸막이 미로(mazeFrom구간부터 mazeP): stretch토막, 토막마다 칸막이 하나에 열린 곳(open m) — 막힌 칸(벽)·좀비 칸, 늘 이어지는 빈 칸이 있다 */
export const LANE_X = [-ROAD / 3, ROAD / 3];
export const LANES = { luckFrom: 13, luckP: 0.35, mazeFrom: 9, mazeP: 0.4, luckLen: 48, mazeLen: 84, stretch: 4, open: 7, wallP: 0.75, trap: 0.3, big: 0.6, foeN: [4, 7] };   // 39.4: 행운 길 34 → 48m(들어가며 고르고 오래 간다) · 39.6: 꽝(trap — 병력 −15%) · 대는 병력 +60% · 49절: 꽝 −15 → −30%, 미로 좀비 칸 foeN마리(3~5 → 4~6)
/* 게이트 몰이(39.5 — 개편 판만): rushFrom구간부터 rushP로 보스 앞 몰이 전에 한 번. 게이트 n줄이 gap m 간격으로(45절: 11 → 7 → 3.5m, 줄은 모두 세 칸 — 끝 칸에서 반대쪽 끝 칸까지(5m)는 손가락 끌기(초당 16m)로도 0.31초라 달리는 동안(6구간 초당 12m) 3.75m — 한 줄 사이에 끝에서 끝으로는 못 간다, 옆 칸까지만) — 쏴서 올리는 덧셈 칸이 많고, 큰 + 줄 하나(51절 전 ×2)·÷2 줄 하나.
   숫자는 그 구간 기준 병력(bkScale)으로, 굴림은 따로(hash — 다른 청크의 배치가 밀리지 않게). 골든 값은 늘리지 않는다(잘 고르면 앞서 나가고, 못 고르면 뒤처진다)
   51절: 몰이의 ×2 줄은 큰 + 줄(jack — 기준 병력의 몫)로 — ×는 앞선 병력일수록 크게 불어나(덧셈 칸은 기준 병력이라 그대로) 한 번만 지나도 판이 뻥튀기됐다
   미로 게이트(39.5): 미로 토막 끝마다 칸마다 게이트 — 빈 칸 = 작은 +, 좀비 칸 뒤·벽 뒤 = 큰 +(마지막 토막은 더 큰 + — 51절 전 ×2), 벽 칸 몇은 벽 대신 ÷2 */
export const RUSH = { from: 6, p: 0.3, n: [10, 14], gap: 7, boost: 2, add: [0.2, 0.45], sub: [0.2, 0.4], jack: [0.8, 1.1], mazeAdd: 0.15, mazeBig: 0.4, mazeEnd: 0.8, mazeDiv: 0.6 };   // 49절: 미로 벽 자리의 ÷2 몫 0.4 → 0.6(빌드와 상관없는 페널티 — 벽·좀비 체력을 올리면 총을 덜 키운 빌드만 크게 졌다) · 46.2: 간격 3.5 → 7m + 들머리 길 전체 가속 발판 ×boost — 줄 사이 시간(0.29초)은 같고, 앞 줄 판이 뒷줄 숫자를 안 가린다
/* 가속 발판(46.1 — 개편 판만): 분대 몸 가운데가 판의 x 범위 안에서 판 줄을 지나면 앞으로 달리는 속도 ×mul, len m 동안. 옆 빠르기는 그대로.
   gaunt·fork·spit·wave: 함정 길(가속 톱날)·갈림길 위험한 쪽·독침 앞·무리 앞에 놓는 판의 배수 · 열리는 구간 · 몫 · 길이 */
export const PAD = {
  gaunt: 1.7, gauntLen: 32,
  fork: { mul: 1.6, from: 10, p: 0.35, len: 16 },
  spit: { mul: 1.5, from: 8, p: 0.4, len: 30 },
  wave: { mul: 1.5, from: 12, p: 0.25, len: 22 },
};
/* 함정 길(46.4 — 개편 판만): from구간부터 구간마다 하나(two구간부터 둘). pats = [패턴, 열리는 구간] — 열린 것 중 무작위.
   pair 쌍 톱날(반쪽 둘이 거울처럼) · zig 엇갈린 톱날(반쪽 셋 지그재그) · boost 가속 톱날 · guard 톱날 문지기(좋은 칸 앞 톱날 + 반쪽 가속) · double 겹 쌍 톱날.
   gate: 마지막 톱날에서 게이트 줄까지(m), add·sub: 세 칸 게이트의 +a · −b(그 구간 기준 병력 몫) */
export const GAUNT = { from: 4, two: 16, pats: [['pair', 4], ['zig', 7], ['boost', 10], ['guard', 13], ['double', 19]], gate: 6, add: [0.25, 0.5], sub: [0.2, 0.4] };
/* 새 적 셋(46.6 — 개편 판만, 무리의 졸개를 바꾼다 — 따로 굴림):
   bomb 자폭 좀비(질주 몸): 닿으면 병력 hit + 제 체력 몫, 총에 쓰러지면 둘레 r m 좀비에게 지금 화력 × dmg초 몫, 분대가 그 안이면 병력 near
   leap 도약 좀비: at m 안에 오면 crouch초 웅크렸다가 dist m 앞으로(분대 x 쪽으로) T초에 뛴다
   thief 게이트 도둑: 가장 좋은 덧셈 칸 ahead m 앞에 서서, 분대가 near m 안이면 그 칸을 초당 원래 값의 drain씩 빨아 먹는다(0 아래로) */
export const FOE2 = {
  bomb: { from: 5, two: 14, hp: 1.2, spd: 4.4, home: 1.8, hit: 0.08, near: 0.03, r: 2.2, dmg: 1.5 },
  leap: { from: 10, n: 2, three: 20, hp: 1.5, at: 11, crouch: 0.45, dist: 6, T: 0.35 },
  thief: { from: 14, two: 24, hp: 1.2, ahead: 4, near: 40, drain: 0.35 },
};
/* 구간 성격(39.6 — 개편 판만, 2구간부터): 풍요(rich — 좋은 칸 ×good·나쁜 칸 ×bad) · 보통 · 기근(lean). 시드·구간으로 정해 카드 화면에서 다음 구간 것을 미리 보인다 */
export const MOOD = { from: 2, rich: { p: 0.2, good: 1.6, bad: 0.7, rare: true }, lean: { p: 0.25, good: 0.5, bad: 1.6 } };
export function segMood(seed, k) {
  if (k < MOOD.from) return '';
  const r = rand({ rs: hash(VERSION, 'mood', seed >>> 0, k) });
  return r < MOOD.rich.p ? 'rich' : r < MOOD.rich.p + MOOD.lean.p ? 'lean' : '';
}
export const laneCell = (x) => (x < LANE_X[0] ? 0 : x < LANE_X[1] ? 1 : 2);
const laneOpen = (l, di, z) => l.open.some((o) => o[0] === di && z >= o[1] && z <= o[2]);
export function laneAt(s, z) { if (!s.lanes) return null; for (const l of s.lanes) if (z >= l.z0 && z <= l.z1) return l; return null; }
/* 칸 c에서 몸(반폭 pad)이 갈 수 있는 x 범위: 닫힌 칸막이 쪽은 칸막이 − pad(입구·열린 곳이 끝난 뒤 FORK_TAPER m에 걸쳐 0 → pad), 열린 쪽은 길 끝까지 */
export function laneBounds(l, c, z, pad) {
  const tp = (di) => { let from = l.z0; for (const o of l.open) if (o[0] === di && o[2] <= z && o[2] > from) from = o[2]; return pad * clamp((z - from) / FORK_TAPER, 0, 1); };
  const lo = c === 0 || laneOpen(l, c - 1, z) ? -EDGE : LANE_X[c - 1] + tp(c - 1);
  const hi = c === 2 || laneOpen(l, c, z) ? EDGE : LANE_X[c] - tp(c);
  return [lo, Math.max(lo, hi)];
}
export const FORK_TAPER = 8;
export const FORK = { nose: 22, wall: 26, after: 14, men: 0.15, safe: 0.3, tail: 16 };
export const FORK_WALL = [0.85, 1.0];
/* 갈림길의 위험한 쪽 패턴: 'wall'(벽) · 'horde'(차선을 메운 좀비 떼 — 거구 하나 + 분열 좀비 + 졸개). FORK_HORDE_P: 떼가 나올 몫(3구간부터 — 첫 갈림길은 벽),
   FORK_HORDE: 떼의 체력 합 = 벽 체력 식 × 이 범위(다가오는 적은 벽보다 쏠 시간이 짧다) */
export const FORK_HORDE_FROM = 3;
export const FORK_HORDE_P = 0.5;
export const FORK_HORDE = [0.6, 0.75];

/* 정예 좀비(무한모드 — 캠페인 레벨에는 없다: 배치·난수·해시 그대로). 졸개 몸에 f.elite가 붙는다. 총·저격·로켓·스킬로 '잡았을 때'만 일이 난다(물려서 사라지면 아무 일 없다)
   - toxic(오염 좀비): 잡힌 자리에 오염 웅덩이. POOL_T초 동안은 예고(해 없음 — 바로 앞에서 잡았으면 그대로 지나간다), 그 뒤 POOL_LIFE초 동안 밟으면 한 번
     병력의 POOL_HIT × 겹친 몫을 잃는다. 폭·예고 시간은 독침과 같다(±POOL_R, 1초 — 같은 '옆 칸으로 비켜서기'). 갈림길 안에는 생기지 않는다(옆으로 못 피한다)
   - split(분열 좀비): 잡히면 질주 좀비 kids마리로 갈라진다(한 마리 체력 = 제 체력 × kidHp). 멀리서 잡으면 다가오는 동안 마저 잡히고, 코앞에서 잡으면 문다
   from: 나오기 시작하는 구간, hp: 졸개 체력 배수, cap: 체력 상한(병력 몫 — 부딪히면 그만큼 잃는다), n(k): 무리 하나에 섞이는 수 */
export const ELITE = {
  toxic: { from: 2, hp: 2, cap: 0.3, n: (k) => 1 + (k >= 6), nL: (L, m) => 1 + (L >= 41 && m >= 12) },
  split: { from: 3, hp: 1.6, cap: 0.25, kids: 2, kidHp: 0.3, n: (k) => 1 + (k >= 9), nL: (L, m) => 1 + (L >= 51 && m >= 12) },
};
/* 캠페인(SIM 10): 오염 좀비 L11(UNLOCK.toxic)부터, 분열 좀비 L21(UNLOCK.split)부터 — 무리(졸개 ELITE_WAVE마리 이상인 청크)마다 한 마리씩(오염 L41·분열 L51부터, 졸개 12마리 이상인 큰 무리에는 둘씩 — nL).
   레벨 생성이 끝난 뒤 따로 난수 흐름으로 고른다(placeElites) — 게이트·적·상자의 자리와 숫자는 SIM 9 그대로이고 졸개 몇의 체력과 표식만 달라진다.
   늘어난 위협은 보정(보스 체력·별 기준)이 다시 재서 맞춘다 */
export const ELITE_WAVE = 6;
export const POOL_T = 1.0;
export const POOL_R = 1.2;
export const POOL_LIFE = 4;
export const POOL_HIT = 0.2;
/* 분대가 지금 갇힌(또는 lead m 안에 들어설) 분리대 */
export function divAt(s, lead = 0) {
  if (!s.divs) return null;
  const z = s.squad.z;
  for (const d of s.divs) if (z + lead >= d.z0 && z <= d.z1) return d;
  return null;
}
/* 분리대 안에서 분대 중심이 가운데에서 떨어져 있어야 하는 거리: 코에서 0, FORK_TAPER m 뒤부터 분대 반지름 R(몸이 통째로 제 쪽에) */
export const divPad = (d, z, R) => R * clamp((z - d.z0) / FORK_TAPER, 0, 1);

const CHUNK = {
  rest(lv, g, p, z, ng) {
    return { len: p.tight ? TERRAIN.tightRest : 30, ng };
  },

  gate(lv, g, p, z, ng, target, ctx) {
    const rowZ = z + 30;
    // 첫 판 첫 줄은 고르기 쉬운 +10 대 −5
    let ch = p.L === 1 && !lv.rows.length ? Object.assign([['add', 10], ['add', -5]], { kind: 'plain' }) : gateChoices(g, p, ng, target, ctx);
    if (ch.length >= 2 && (lv.rows.length || p.L > 1)) {
      if (p.L === 1) {
        // 첫 판은 둘째 줄부터 늘 오른쪽이 정답(튜토리얼)
        if (applyOp(ng, ch[0][0], ch[0][1]) > applyOp(ng, ch[1][0], ch[1][1])) { const k = ch.kind; ch.reverse(); ch.kind = k; }
      } else ch = holdBalance(ch, ng, ctx, lv.fireE);
    }
    const cells = cellsOf(ch, ng, lv.fireE);
    makeRow(lv, rowZ, cells, ng, 'gate', ch.kind || 'plain');
    // 게이트 앞을 지키는 졸개 몇 명(L2부터)
    if (p.L >= 2 && chance(g, 0.35)) {
      const m = Math.round(U(g, 3, 6));
      const hp = gruntHp(lv, ng);
      for (let i = 0; i < m; i++) addFoe(lv, g, 'grunt', U(g, -4.2, 4.2), rowZ - 14 + U(g, 0, 4), hp);
      ng -= Math.min(2, Math.floor(m / 3));
    }
    return { len: 48, ng: Math.max(1, bestGolden(cells, ng)) };
  },

  shoot(lv, g, p, z, ng) {
    const rowZ = z + 34;
    const v0 = -Math.max(5, nice(ng * U(g, 0.15, 0.3)));
    const c = makeCell('add', v0, ng, -ROAD, ROAD, lv.fireE);
    makeRow(lv, rowZ, [c], ng, 'shoot', 'shoot');
    return { len: 50, ng: Math.max(1, goldenValue(ng, c)) };
  },

  /* 지켜진 칸(P07): 좋은 칸(×2·×3, 없으면 큰 +) 앞을 벽이나 무리가 막는다. 체력은 다가오는 동안 녹일 수 있는 양의 0.9~1.1배.
     옆 칸은 70% 판돈(−a), 30% 몰아 쏘면 오르는 작은 + */
  guard(lv, g, p, z, ng, target, ctx) {
    const rowZ = z + 34;
    const ratio = target / ng;
    let good;
    if (ctx.mulLeft > ctx.reserve && ng <= 3000) { ctx.mulLeft--; good = ['mul', has(p.L, 'mul3') && ng < 150 && chance(g, 0.3) ? 3 : 2]; }
    else good = ['add', Math.max(8, nice(G(ng * clamp(ratio - 1, 0.5, 1.5) * U(g, 1.2, 1.5))))];
    const stake = has(p.L, 'shoot') && chance(g, 0.7);
    // 판돈이 아니면 '쏴서 키우는 +'(L4+): 작게 보이지만 몰아 쏘면 ×2와 비슷해진다 — 벽을 뚫고 ×2냐, 열린 칸을 키우냐
    let poor;
    // 판돈 칸 −a는 판돈 줄의 나쁜 칸과 같은 크기(병력의 30~50% — SIM 8: 20~35%에서 올렸다. 스치기가 안 물어 잘못 고른 뒤 무너지는 판이 줄어,
    // 판돈 줄 최악 칸의 손해·승→패 뒤집힘이 SIM 7보다 낮아졌다 — 갈라 보기 시드 8로 0.22·22% → 0.23·23%, SIM 7과 같다)
    if (stake) poor = ['add', -Math.max(3, nice(ng * U(g, 0.2, 0.35)))];
    else if (p.L >= JACK_FROM) {
      const c = Math.max(2, nice(G(ng * U(g, 0.08, 0.2))));
      const cap = c + Math.max(6, nice(G(ng * U(g, GUARD_PUMP[0], GUARD_PUMP[1]))));
      poor = ['add', c, { rise: ((cap - c) / Math.max(ng, 6)) * (PUMP_T / JACK_T), cap }];
    } else poor = ['add', Math.max(2, nice(G(ng * U(g, 0.08, 0.22))))];
    const wall = chance(g, 0.5);
    const D = threatD(lv, ng);
    const melt = D * 0.85 * (wall ? approachT(p) : approachT(p, FOE_BASE.grunt.spd));
    const hp = melt * (p.L <= 4 ? U(g, 0.55, 0.75) : p.L <= 10 || !p.hardish ? U(g, 0.75, 0.95) : U(g, 0.9, 1.1));
    // 좋은 칸의 쪽은 고정 위치 할당량(holdBalance)으로 — 서 있는 분대도 막는 것을 쏘므로 손실은 남는 몫만
    const order = chance(g, 0.5) ? [good, poor] : [poor, good];
    const left = Math.max(0, hp - D * 0.85 * approachT(p) * 1.1);
    const pick = holdBalance(order, ng, ctx, lv.fireE, order.indexOf(good), (j) => (order[j] === good ? contactCost(left) : 0));
    const goodLeft = pick[0] === good;
    const cells = cellsOf(pick, ng, lv.fireE);
    makeRow(lv, rowZ, cells, ng, 'guard', 'guard');
    const lane = lanes(2)[goodLeft ? 0 : 1];
    let loss = 0;
    if (wall) {
      wallProp(lv, lane.x0 + 0.15, lane.x1 - 0.15, rowZ - 11, hp, { guard: true });
      loss = hp > melt ? contactCost(hp - melt) : 0;
    } else {
      const foes = spawnWave(lv, g, p, rowZ - 22, ng, 0.6, { lane, noBrute: p.L < 12 });
      scaleFoes(foes, hp);
      loss = capLeak(foes, ng, p, lv.fireE, LEAK_CAP.wave, [(lane.x0 + lane.x1) / 2]);
    }
    const n2 = Math.max(1, ng - loss);
    const gi = goodLeft ? 0 : 1;
    return { len: 52, ng: Math.max(n2, goldenValue(n2, cells[gi]), goldenValue(ng, cells[1 - gi])) };
  },

  /* ×3(L10 전에는 ×2) 바로 뒤 ÷2 함정(P07): 첫 줄 ×m | +a, 18m 뒤 둘째 줄은 × 쪽 차선이 ÷2, 다른 쪽은 작은 +b.
     ×를 고르면 곧바로 옆으로 비켜야 한다. ×가 남지 않았으면 보통 게이트 줄 */
  trap(lv, g, p, z, ng, target, ctx) {
    if (!(ctx.mulLeft > ctx.reserve && ng <= 3000)) return CHUNK.gate(lv, g, p, z, ng, target, ctx);
    ctx.mulLeft--;
    const m = has(p.L, 'mul3') && ng < 400 ? 3 : 2;
    const a = Math.max(5, nice(ng * U(g, 0.5, 0.8)));
    const ch = Object.assign(chance(g, 0.5) ? [['mul', m], ['add', a]] : [['add', a], ['mul', m]], { kind: 'trap' });
    const pick = holdBalance(ch, ng, ctx, lv.fireE);
    const mi = pick[0][0] === 'mul' ? 0 : 1;
    const c1 = cellsOf(pick, ng, lv.fireE);
    const z1 = z + 26;
    makeRow(lv, z1, c1, ng, 'gate', 'trap');
    const nMul = applyOp(ng, 'mul', m);
    const nAdd = goldenValue(ng, c1[1 - mi]);
    const b = Math.max(3, nice(Math.min(nMul, nAdd) * U(g, 0.1, 0.2)));
    const ch2 = [];
    ch2[mi] = has(p.L, 'div') ? ['div', 2] : ['add', -Math.max(5, nice(nMul * U(g, 0.4, 0.5)))];
    ch2[1 - mi] = ['add', b];
    // 둘째 줄의 값은 첫 줄 뒤 병력 기준 — 서 있는 분대 할당량은 그대로 둔다(× 쪽에 서 있으면 ÷2를 맞는다)
    const c2 = cellsOf(ch2, Math.round((nMul + nAdd) / 2), lv.fireE);
    makeRow(lv, z1 + 18, c2, Math.round((nMul + nAdd) / 2), 'gate', 'trap');
    const viaMul = goldenValue(nMul, c2[1 - mi]);
    const viaAdd = goldenValue(nAdd, c2[1 - mi]);
    return { len: 64, ng: Math.max(1, viaMul, viaAdd) };
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
    return { len: 46, ng: Math.max(1, ng - capLeak(foes, ng, p, lv.fireE, LEAK_CAP.wave)) };
  },

  /* 바리케이드: 한 칸은 약한 벽, 나머지는 단단하다. 약한 칸은 톱날(L6+)이나 독침(L5+)이 지킨다(P08 — 쉬운 길에 반응 시험) */
  wall(lv, g, p, z, ng) {
    const D = threatD(lv, ng);
    // 세 칸 벽은 분대가 작을 때만(큰 분대는 한 칸에 다 못 들어간다)
    const n = has(p.L, 'triple') && radius(ng) <= 1.4 && chance(g, 0.5) ? 3 : 2;
    const ln = lanes(n);
    const open = Math.floor(rand(g) * n);
    const wz = z + 30;
    ln.forEach((l, i) => {
      const hp = i === open ? D * U(g, 0.5, 0.8) : D * U(g, 2.2, 3.4);
      wallProp(lv, l.x0 + 0.15, l.x1 - 0.15, wz, hp);
    });
    let loss = 0;
    const ol = ln[open];
    if (has(p.L, 'saw') && chance(g, 0.5)) {
      // 약한 칸 앞을 오가는 톱날
      lv.saws.push({ id: lv.nextId++, z: wz - 7, x: U(g, ol.x0 + 0.6, ol.x1 - 0.6), xa: ol.x0 + 0.6, xb: ol.x1 - 0.6, spd: 3.5 + 1.5 * p.k, dir: chance(g, 0.5) ? 1 : -1, w: 1.1, guard: true });
      loss += Math.ceil(ng * 0.03);
    } else if (has(p.L, 'spit') && chance(g, 0.6)) {
      // 약한 칸 뒤에 독침 좀비(분대가 지나갈 자리를 노린다)
      addFoe(lv, g, 'spit', (ol.x0 + ol.x1) / 2 + U(g, -0.6, 0.6), wz + 9, 0.5 * D, { guard: true });
      loss += Math.ceil(ng * 0.03);
    }
    if (p.L >= 5 && chance(g, 0.5)) {
      const hp = gruntHp(lv, ng);
      for (let i = 0; i < 4; i++) addFoe(lv, g, 'grunt', U(g, -4, 4), wz + 6 + U(g, 0, 6), hp);
    }
    return { len: 46, ng: Math.max(1, ng - loss) };
  },

  crate(lv, g, p, z, ng) {
    const D = threatD(lv, ng);
    const ln = lanes(2);
    const side = chance(g, 0.5) ? 0 : 1;
    const l = ln[side];
    const cz = z + 32;
    const r = rand(g);
    const reward = r < 0.5 ? { type: 'gun' } : r < 0.85 ? { type: 'men', v: Math.max(5, nice(G(ng * U(g, 0.25, 0.4)))) } : { type: 'coin', v: 10 + 2 * p.L };
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
    return { len: 50, ng: Math.max(1, ng - Math.ceil(ng * 0.04)) };
  },

  saw(lv, g, p, z, ng) {
    const n = (p.L >= 14 && chance(g, 0.5) ? 2 : 1) + (p.tight ? 1 : 0);   // 촘촘한 함정(바퀴 4부터): 톱날 하나 더
    for (let i = 0; i < n; i++) {
      const full = chance(g, 0.5);
      const half = chance(g, 0.5) ? -1 : 1;
      const xa = full ? -ROAD + 0.6 : half < 0 ? -ROAD + 0.6 : 0.2;
      const xb = full ? ROAD - 0.6 : half < 0 ? -0.2 : ROAD - 0.6;
      lv.saws.push({ id: lv.nextId++, z: z + 24 + i * 14, x: U(g, xa, xb), xa, xb, spd: 3.5 + 1.5 * p.k, dir: chance(g, 0.5) ? 1 : -1, w: 1.1 });
    }
    return { len: 46, ng: Math.max(1, ng - Math.ceil(ng * 0.04)) };
  },

  /* 몰이(P08): 마지막 게이트 앞. 정면 무리 + 길 양옆 가장자리에서 파고드는 두 줄. 어려움·매우 어려움은 그 레벨의 가장 센 무리 */
  surge(lv, g, p, z, ng) {
    const D = threatD(lv, ng);
    const K = p.hardish && p.tagFull ? SURGE_K[p.tag] : SURGE_K.normal;   // L5·L10(소개 레벨)은 보통 몰이(태그 배수만)
    const front = spawnWave(lv, g, p, z + 30, ng, 0.5, { noRunner: true });
    const side = [];
    const per = Math.max(3, Math.round(4 * p.pressure * (lv.wm || 1)));
    for (const sd of [-1, 1]) {
      for (let i = 0; i < per; i++) side.push(addFoe(lv, g, 'grunt', sd * U(g, 4.1, 4.6), z + 14 + (i * 22) / per + U(g, -1, 1), 1, { home: 1.7, homeDist: 26, flank: true }));
    }
    const tA = approachT(p, FOE_BASE.grunt.spd);
    // 정면은 쏠 시간이 다 있고, 옆줄은 분대 쪽으로 파고든 뒤에야 맞는다
    scaleFoes(front, K * 0.55 * D * tA);
    scaleFoes(side, K * 0.45 * D * tA);
    // 양옆 뒤쪽에서 독침(병력에 비례해 깎는다 — 약한 분대도 한 번에 무너지지 않는다)
    if (has(p.L, 'spit')) for (const sd of [-1, 1]) addFoe(lv, g, 'spit', sd * U(g, 3.2, 3.9), z + 44 + U(g, -2, 2), 0.5 * D, { flank: true });
    lv.marks.push({ t: 'surge', z });
    const loss = capLeak(front.concat(side), ng, p, lv.fireE, LEAK_CAP.surge);
    return { len: 50, ng: Math.max(1, ng - loss) };
  },

  /* 위기(P09, L3·L4): 두 칸 다 빨간 줄 ÷2 | −a(a ≈ 골든 병력의 절반). 누구나 병력이 크게 준다
     (비율로 줄어 약한 분대도 살아남는다). −a는 빨간 칸이라 처음부터 몰아 쏘면 ÷2보다 덜 잃는다. 바로 뒤 마지막 줄의 ×2로 회복 */
  crisis(lv, g, p, z, ng, target, ctx) {
    const rowZ = z + 32;
    const a = Math.max(5, nice(ng * (CRISIS_LOSS + U(g, -0.08, 0.02))));
    const minus = ['add', -a, { rise: 0.05, cap: -Math.max(2, nice(a * 0.8)) }];   // 거의 오르지 않는다(쏴서 메우는 위기가 아니다)
    const ch = Object.assign(chance(g, 0.5) ? [['div', 2], minus] : [minus, ['div', 2]], { kind: 'crisis' });
    const pick = holdBalance(ch, ng, ctx, lv.fireE);
    const cells = cellsOf(pick, ng, lv.fireE);
    makeRow(lv, rowZ, cells, ng, 'gate', 'crisis');
    return { len: 46, ng: Math.max(1, bestGolden(cells, ng)) };
  },

  /* 갈림길(ARSENAL.md 5절 — 무한모드): 길 가운데 분리대. 코(z0)부터 좌우가 갈리고 끝(z1)까지 옆 칸으로 못 넘어간다.
     위험한 쪽: 차선을 통째로 막은 벽(체력 숫자) → 뚫으면 바로 뒤 보상 상자(무기 강화 또는 큰 지원병). 못 뚫으면 벽 규칙대로 부딪혀 잃는다.
     안전한 쪽: 약한 졸개 몇. 갈린 뒤에는 옆으로 피할 것이 없다(톱날·독침 없음, 독침 좀비도 그동안 쏘지 않는다).
     벽 체력 = 그 차선을 달리며 쏟는 화력(위협 기준 — 구간이 오를수록 커진다)의 FORK_WALL배: 앞 구간은 넉넉히 뚫리고, 뒤로 갈수록
     강화·무기 단계·스킬·특수병이 받쳐 줘야 뚫린다(들어가기 전에 벽 숫자를 보고 고른다). 골든 패스는 안전한 쪽(병력 그대로) */
  fork(lv, g, p, z, ng) {
    // 2단계 장애물(4구간부터): 위험한 쪽이 셋에 하나꼴로 장갑문(셋째 패턴). 장애물 전용 난수로 먼저 정하고 벽·떼는 그대로 만든 뒤 바꾼다 —
    // 구간의 나머지(게이트·적·상자의 자리·숫자·id, 판의 난수 흐름)가 장애물이 없는 구간과 같게
    const door = !!lv.og && chance(lv.og, OBST.door.p);
    const D = threatD(lv, ng);
    const risk = chance(g, 0.5) ? 1 : -1;
    const z0 = z + FORK.nose, zf = z0 + FORK_TAPER, wz = zf + FORK.wall, z1 = wz + FORK.after;
    const lane = (sd) => (sd > 0 ? { x0: 0, x1: ROAD } : { x0: -ROAD, x1: 0 });
    const rl = lane(risk);
    const hp = D * ((BULLET_RANGE - 2) / p.speed) * U(g, FORK_WALL[0], FORK_WALL[1]);
    const cx = (rl.x0 + rl.x1) / 2;
    const reward = chance(g, 0.6) ? { type: 'gun' } : { type: 'men', v: Math.max(6, nice(ng * FORK.men)) };
    const ch = Math.max(1, Math.round(hp * 0.12));
    const horde = p.seg >= FORK_HORDE_FROM && chance(g, FORK_HORDE_P);
    const hidden = !!p.hide && !horde && chance(g, 0.5);   // 늦게 보이는 길(바퀴 3부터): 벽·문 숫자가 가까이 가야 보인다 — 대신 병사 보상이 크다
    if (hidden && reward.type === 'men') reward.v = Math.round(reward.v * TERRAIN.hideBonus);
    const div = { id: 0, z0, z1, risk, wall: 0 };
    let doorId = 0;
    if (horde) {
      // 좀비 떼: 벽 대신 차선을 메운 무리(거구 하나 + 분열 좀비 둘 + 졸개). 체력 합 H — 못 잡은 만큼 물린다(벽과 같은 '남은 체력 10마다 1명')
      const f0 = lv.foes.length;
      const H = hp * U(g, FORK_HORDE[0], FORK_HORDE[1]);
      const xr = () => U(g, rl.x0 + 0.8, rl.x1 - 0.8);
      addFoe(lv, g, 'brute', cx + U(g, -0.6, 0.6), wz - 2, H * 0.3, { fork: true });
      const K = ELITE.split;
      for (let i = 0; i < 2; i++) {
        const f = addFoe(lv, g, 'grunt', xr(), zf + 16 + i * 6 + U(g, -1, 1), (H * 0.1) / (1 + K.kids * K.kidHp), { fork: true });
        f.elite = 'split';
      }
      const m = 10;
      for (let i = 0; i < m; i++) addFoe(lv, g, 'grunt', xr(), zf + 6 + (i * (FORK.wall - 8)) / m + U(g, -0.8, 0.8), (H * 0.5) / m, { fork: true });
      if (door) doorId = lv.foes.splice(f0)[0].id;   // 장갑문 자리: 만든 떼를 거두고 그 첫 id(거구)를 문에 준다
      else { div.kind = 'horde'; div.hp = Math.round(H); }
    } else {
      div.wall = wallProp(lv, rl.x0 + 0.15, rl.x1 - 0.15, wz, hp, { fork: true }).id;
    }
    if (door) {
      // 장갑문: 벽 자리에 체력 = 벽 식 × OBSTACLES.door.hp. 받는 피해는 총알 종류마다 다르다(doorMul — 보통 총알은 덜, 관통·작렬·로켓은 더)
      const h = Math.max(1, Math.round(hp * OBSTACLES.door.hp));
      const w = div.wall ? lv.props.find((q) => q.id === div.wall) : null;
      if (w) { w.kind = 'door'; w.hp = w.max = h; }
      else { lv.props.push({ id: doorId, kind: 'door', x0: rl.x0 + 0.15, x1: rl.x1 - 0.15, z: wz, hp: h, max: h, alive: true, hitT: -9, fork: true }); div.wall = doorId; }
      div.kind = 'door';
    }
    if (hidden) { div.hidden = true; const w = lv.props.find((q) => q.id === div.wall); if (w) w.hide = true; }
    lv.props.push({ id: lv.nextId++, kind: 'crate', x0: cx - 1.1, x1: cx + 1.1, z: wz + 7, hp: ch, max: ch, alive: true, hitT: -9, reward, fork: true });
    const sl = lane(-risk);
    // 안전한 쪽 졸개 다섯: 체력 합이 그 차선에서 다가오는 동안 쏟는 양의 FORK.safe배 — 서서 쏘기만 해도 다 잡힌다
    const gh = (D * approachT(p, FOE_BASE.grunt.spd) * FORK.safe) / 5;
    for (let i = 0; i < 5; i++) addFoe(lv, g, 'grunt', U(g, sl.x0 + 0.8, sl.x1 - 0.8), zf + 12 + i * 4 + U(g, -1, 1), gh);
    div.id = lv.nextId++;
    (lv.divs || (lv.divs = [])).push(div);
    return { len: z1 - z + FORK.tail, ng };
  },

  /* 게이트 몰이(39.5 — RUSH): 게이트 줄이 연달아(모두 세 칸). +a 대 −b 줄 사이에 큰 + 줄 하나(51절 전 ×2), ÷2 줄 하나. 굴림은 따로(g2) */
  rush(lv, g, p, z, ng) {
    const g2 = { rs: hash(VERSION, 'rush', Math.round(z * 10), ng | 0, p.seg | 0) };
    const n = RUSH.n[0] + Math.floor(rand(g2) * (RUSH.n[1] - RUSH.n[0] + 1));
    const iMul = 1 + Math.floor(rand(g2) * (n - 2)), iDiv = (iMul + 1 + Math.floor(rand(g2) * (n - 2))) % n;
    const A = () => Math.max(2, nice(ng * U(g2, RUSH.add[0], RUSH.add[1]))), Bv = () => -Math.max(2, nice(ng * U(g2, RUSH.sub[0], RUSH.sub[1])));
    for (let i = 0; i < n; i++) {
      const rowZ = z + 20 + i * RUSH.gap;
      const edges = [-ROAD, LANE_X[0], LANE_X[1], ROAD];   // 45절: 늘 세 칸(두 칸이면 가운데 선 하나만 넘으면 돼 끝에서 끝이 짧다)
      const ops = i === iMul ? [['add', Math.max(4, nice(ng * U(g2, RUSH.jack[0], RUSH.jack[1])))], ['add', Bv()], ['add', Bv()]] : i === iDiv ? [['div', 2], ['add', A()], ['add', Bv()]] : [['add', A()], ['add', Bv()], rand(g2) < 0.5 ? ['add', A()] : ['add', Bv()]];
      shuffle(g2, ops);
      const cells = ops.map(([op, v], c) => makeCell(op, v, ng, edges[c], edges[c + 1], lv.fireE));
      makeRow(lv, rowZ, cells, ng, 'gate', 'rush');
    }
    const zEnd = z + 20 + (n - 1) * RUSH.gap;
    (lv.rush || (lv.rush = [])).push({ z0: z + 20, z1: zEnd });
    // 46.2 가속 몰이: 첫 줄 8m 앞에 길 전체 가속 발판 — 마지막 줄을 지나 3m까지
    addPad(lv, -ROAD - 1, ROAD + 1, z + 12, zEnd + 3 - (z + 12), RUSH.boost);
    addZone(lv, 'rush', z + 19, zEnd + 1);
    return { len: 20 + n * RUSH.gap + 10, ng };
  },

  /* 함정 길(46.4 — GAUNT): 반쪽 톱날 둘이 한 줄에(거울처럼) · 지그재그 · 가속 발판 · 좋은 칸 앞 톱날 — 그리고 바로 뒤 세 칸 게이트. 굴림은 모두 따로(g2) */
  gaunt(lv, g, p, z, ng) {
    const g2 = { rs: hash(VERSION, 'gaunt', Math.round(z * 10), ng | 0, p.seg | 0) };
    const open = GAUNT.pats.filter(([, from]) => p.seg >= from).map(([k]) => k);
    const pat = open[Math.floor(rand(g2) * open.length)] || 'pair';
    const spd = 3.5 + 1.5 * p.k;
    const edges = [-ROAD, LANE_X[0], LANE_X[1], ROAD];
    const half = (zz, side, u) => {   // 반쪽 톱날: side −1 왼쪽 반 · +1 오른쪽 반, u = 시작 자리(0 가운데 쪽 ~ 1 가장자리)
      const xa = side < 0 ? -ROAD + 0.6 : 0.2, xb = side < 0 ? -0.2 : ROAD - 0.6;
      const x = side < 0 ? xb - u * (xb - xa) : xa + u * (xb - xa);
      lv.saws.push({ id: lv.nextId++, z: zz, x, xa, xb, spd, dir: side, w: 1.1, trap: 1 });   // 가장자리 쪽으로 출발
    };
    const pair = (zz, u) => { half(zz, -1, u); half(zz, 1, u); };   // 거울: 같은 u에서 서로 반대로 — 가운데에서 만났다 갈라진다
    const full = (zz) => lv.saws.push({ id: lv.nextId++, z: zz, x: U(g2, -ROAD + 0.6, ROAD - 0.6), xa: -ROAD + 0.6, xb: ROAD - 0.6, spd, dir: rand(g2) < 0.5 ? 1 : -1, w: 1.1, trap: 1 });
    const A = () => Math.max(2, nice(ng * U(g2, GAUNT.add[0], GAUNT.add[1]))), Bv = () => -Math.max(2, nice(ng * U(g2, GAUNT.sub[0], GAUNT.sub[1])));
    let last = z + 20, ops = null, guard = -1;
    if (pat === 'pair') pair(last, rand(g2));
    else if (pat === 'zig') { const sd = rand(g2) < 0.5 ? -1 : 1; for (let i = 0; i < 3; i++) half(z + 18 + 5 * i, i & 1 ? -sd : sd, rand(g2)); last = z + 28; }
    else if (pat === 'boost') { addPad(lv, -ROAD - 1, ROAD + 1, z + 8, PAD.gauntLen, PAD.gaunt); pair(z + 20, rand(g2)); full(z + 28); last = z + 28; }
    else if (pat === 'double') { const u = rand(g2); pair(z + 20, u); pair(z + 26, (u + 0.5) % 1); last = z + 26; ops = [['add', 2 * A()], ['div', 2], ['add', A()]]; }   // 51절: ×2 → 큰 +
    if (pat === 'guard') {   // 톱날 문지기: 좋은 칸 4m 앞을 그 칸 폭만 오가는 톱날, 좋은 칸 쪽 반에 반쪽 가속 발판
      guard = Math.floor(rand(g2) * 3);
      ops = [['add', Bv()], ['add', Bv()], ['add', Bv()]];
      ops[guard] = ['add', 2 * A()];   // 51절: 좋은 칸은 늘 큰 +(예전 반은 ×2)
      pair(z + 16, rand(g2));   // 가속된 채 쌍 톱날부터
      last = z + 24;
    } else if (!ops) ops = shuffle(g2, [['add', A()], ['add', Bv()], rand(g2) < 0.5 ? ['add', A()] : ['add', Bv()]]);
    else shuffle(g2, ops);
    const rowZ = last + GAUNT.gate;
    const cells = ops.map(([op, v], c) => makeCell(op, v, ng, edges[c], edges[c + 1], lv.fireE));
    makeRow(lv, rowZ, cells, ng, 'gate', 'gaunt');
    if (guard >= 0) {
      const c = cells[guard];
      lv.saws.push({ id: lv.nextId++, z: rowZ - 4, x: U(g2, c.x0 + 0.4, c.x1 - 0.4), xa: c.x0 + 0.4, xb: c.x1 - 0.4, spd, dir: rand(g2) < 0.5 ? 1 : -1, w: 1.1, trap: 1 });
      const side = guard === 1 ? (rand(g2) < 0.5 ? -1 : 1) : guard === 0 ? -1 : 1;
      addPad(lv, side < 0 ? -ROAD - 1 : 0, side < 0 ? 0 : ROAD + 1, rowZ - 24, 22, PAD.gaunt);
    }
    addZone(lv, 'gaunt', z + 8, rowZ + 1);
    lv.marks.push({ t: 'gaunt', z: z + 8, pat });
    // 골든 값은 늘리지 않는다(몰이와 같다 — 잘 지나면 앞서고, 못 지나면 뒤처진다. 늘리면 보스 체력·뒤 청크 위협이 함께 커진다)
    return { len: rowZ - z + 14, ng };
  },

  /* 행운 길(22절): 칸막이로 나뉜 세 칸 끝에 가려진 상자 셋 — 소·중·대가 무작위(어느 칸이든 손해는 없다). 상자는 약하다(지나가며 쏘면 열린다) */
  luck(lv, g, p, z, ng) {
    const D = threatD(lv, ng);
    const z0 = z + 14, z1 = z0 + LANES.luckLen;
    const sizes = shuffle(g, [0, 2, 3]);   // 39.6: 꽝 · 중 · 대(예전 소 · 중 · 대) — 손해 보는 칸이 하나 있다
    const lg = lv.nextId++;   // 39.4: 셋 중 하나(같은 lg의 상자는 하나만 열린다)
    for (let c = 0; c < 3; c++) {
      const x0 = c === 0 ? -ROAD : LANE_X[c - 1], x1 = c === 2 ? ROAD : LANE_X[c], cx = (x0 + x1) / 2;
      const hp = Math.max(1, Math.round(D * 0.06));   // 아주 약하게 — 칸에서 못 비키니 지나가며 쏘면 늘 열린다
      lv.props.push({ id: lv.nextId++, kind: 'crate', x0: cx - 1.0, x1: cx + 1.0, z: z1 - 8, hp, max: hp, alive: true, hitT: -9, reward: { type: 'lucky', size: sizes[c] }, luck: true, lg });
    }
    (lv.lanes || (lv.lanes = [])).push({ id: lv.nextId++, k: 'luck', z0, z1, open: [] });
    addZone(lv, 'luck', z0, z1);
    return { len: z1 - z + 10, ng };
  },
  /* 칸막이 미로(22절): stretch토막. 토막이 바뀌는 곳마다 칸막이 하나가 LANES.open m 열린다(한 칸씩만 건넌다). 토막마다 '빈 칸'(벽 없음)이 하나 있고
     다음 토막의 빈 칸은 그 옆이나 그대로 — 열린 곳을 따라가면 늘 벽 없이 지난다. 나머지 칸은 단단한 벽(wallP)이나 좀비 무리 */
  maze(lv, g, p, z, ng) {
    const D = threatD(lv, ng);
    const z0 = z + 10, z1 = z0 + LANES.mazeLen, n = LANES.stretch, sl = (z1 - z0 - FORK_TAPER) / n;
    const lane = { id: 0, k: 'maze', z0, z1, open: [] };
    let free = Math.floor(rand(g) * 3);
    const hp = gruntHp(lv, ng);
    const g2 = p.mazeGates ? { rs: hash(VERSION, 'mazeGate', Math.round(z0 * 10), ng | 0) } : null;   // 미로 게이트(39.5): 굴림은 따로
    for (let i = 0; i < n; i++) {
      const za = z0 + FORK_TAPER + i * sl;
      const kinds = ['', '', ''];
      if (i > 0) {
        const nb = free === 0 ? 1 : free === 2 ? 1 : chance(g, 0.5) ? 0 : 2;   // 옆 칸
        lane.open.push([Math.min(free, nb), za - 2, za + LANES.open]);
        if (chance(g, 0.75)) free = nb;
      }
      for (let c = 0; c < 3; c++) {
        const x0 = c === 0 ? -ROAD : LANE_X[c - 1], x1 = c === 2 ? ROAD : LANE_X[c];
        if (c !== free && chance(g, i === 0 ? 0.5 : LANES.wallP)) {
          const wh = D * U(g, 2.2, 3.4);
          if (g2 && rand(g2) < RUSH.mazeDiv) kinds[c] = 'div';   // 벽 대신 ÷2 칸(벽은 없다)
          else { wallProp(lv, x0 + 0.15, x1 - 0.15, za + sl * 0.62, wh, { maze: true }); kinds[c] = 'wall'; }
        } else if (c !== free || chance(g, 0.5)) {
          if (c !== free) kinds[c] = 'foe';
          const m = LANES.foeN[0] + Math.floor(rand(g) * (LANES.foeN[1] - LANES.foeN[0]));   // 49절: 3~5 → 4~6마리
          for (let k = 0; k < m; k++) addFoe(lv, g, 'grunt', U(g, x0 + 0.6, x1 - 0.6), za + 3 + U(g, 0, sl - 6), hp, { maze: true });
          // 미로 보상(28절): 빈 칸이 아닌 좀비 칸은 무리 뒤에 작은 행운 상자 — 뚫고 가면 얻는다(굴림 없이 — 뒤 배치가 밀리지 않게)
          if (c !== free && i > 0) lv.props.push({ id: lv.nextId++, kind: 'crate', x0: (x0 + x1) / 2 - 0.9, x1: (x0 + x1) / 2 + 0.9, z: za + sl - 1.5, hp: Math.max(1, Math.round(D * 0.06)), max: Math.max(1, Math.round(D * 0.06)), alive: true, hitT: -9, reward: { type: 'lucky', size: 1 }, luck: true, mazeBox: true });
        }
      }
      if (g2) {   // 토막 끝 게이트 줄: 칸마다 한 칸 — 빈 칸 작은 +, 좀비·벽 뒤 큰 +(마지막 토막은 더 큰 + — 51절 전 ×2), 벽 대신 ÷2
        const last = i === n - 1;
        const cells = [0, 1, 2].map((c) => {
          const x0 = c === 0 ? -ROAD : LANE_X[c - 1], x1 = c === 2 ? ROAD : LANE_X[c];
          if (kinds[c] === 'div') return makeCell('div', 2, ng, x0, x1, lv.fireE);
          if (kinds[c] === 'foe' || kinds[c] === 'wall') return makeCell('add', Math.max(2, nice(ng * (last ? RUSH.mazeEnd : RUSH.mazeBig) * U(g2, 0.8, 1.2))), ng, x0, x1, lv.fireE);
          return makeCell('add', Math.max(1, nice(ng * RUSH.mazeAdd * U(g2, 0.8, 1.2))), ng, x0, x1, lv.fireE);
        });
        makeRow(lv, za + sl - 3, cells, ng, 'gate', 'maze');
      }
    }
    // 미로 끝 보물(28절): 열린 곳을 따라온 마지막 빈 칸 끝에 행운 상자 중·대(길을 읽은 보상). 크기는 따로 굴린다(뒤 배치가 밀리지 않게)
    { const x0 = free === 0 ? -ROAD : LANE_X[free - 1], x1 = free === 2 ? ROAD : LANE_X[free], cx = (x0 + x1) / 2, hp = Math.max(1, Math.round(D * 0.06));
      const big = hash(VERSION, 'mazeTreasure', Math.round(z0 * 10), ng) % 3 === 0 ? 3 : 2;
      lv.props.push({ id: lv.nextId++, kind: 'crate', x0: cx - 1.0, x1: cx + 1.0, z: z1 - 4, hp, max: hp, alive: true, hitT: -9, reward: { type: 'lucky', size: big }, luck: true, mazeBox: true, treasure: true }); }
    lane.id = lv.nextId++;
    (lv.lanes || (lv.lanes = [])).push(lane);
    addZone(lv, 'maze', z0, z1);
    return { len: z1 - z + 12, ng };
  },

  /* 열쇠(P10, 어려움·매우 어려움): 한 차선에 표시된 열쇠 상자(무기 강화), 다른 차선에 다른 보상(지원병 상자). 같은 거리라 둘 다는 못 깬다.
     열쇠는 그 레벨의 가장 센 무리(몰이) 두 청크 앞 */
  key(lv, g, p, z, ng) {
    const D = threatD(lv, ng);
    // 30m를 지나는 동안 상자 하나에 쏟을 수 있는 양: 총알은 분대 폭(±(R+0.3))에 고르게 퍼지고 상자는 2.2m 폭이다
    const fireWin = D * (30 / p.speed) * Math.min(1, 2.2 / (2 * (radius(ng) + 0.3))) * 0.85;
    const ln = lanes(2);
    const side = chance(g, 0.5) ? 0 : 1;
    const cz = z + 32;
    const put = (l, hp, reward, extra) => {
      const cx = (l.x0 + l.x1) / 2;
      const h = Math.max(1, Math.round(hp));
      lv.props.push({ id: lv.nextId++, kind: 'crate', x0: cx - 1.1, x1: cx + 1.1, z: cz, hp: h, max: h, alive: true, hitT: -9, reward, ...extra });
    };
    put(ln[side], fireWin * U(g, KEY_WIN[0], KEY_WIN[1]), { type: 'gun' }, { key: true });
    put(ln[1 - side], fireWin * U(g, RIVAL_WIN[0], RIVAL_WIN[1]), { type: 'men', v: Math.max(5, nice(G(ng * U(g, 0.3, 0.45)))) });
    return { len: 50, ng };
  },
};

/* 특수병 배치 — 기존 배치를 바꾸지 않도록 레벨 생성이 끝난 뒤 별도 난수 흐름으로 넣는다.
   쉼 청크에 철창(L5+), 일부 'men' 상자를 철창으로(L5+), 게이트 줄의 가장 덜 좋은 칸을 금색 특수병 칸으로(L9+).
   금색 칸은 보통·생각·판돈 줄에만(함정·잭팟·지킨 줄의 뜻을 바꾸지 않게) — 바뀐 줄은 kind 'gold'.
   SIM 9: 철창·금색 칸의 수·자리·확률은 SIM 8 그대로(억지로 늘리지 않는다). 병과만 '바로 앞과 다른 병과' 규칙 없이 무작위 —
   같은 병과가 자연스럽게 두 번 나오면 두 번째는 병사 대신 레벨 업 */
const GOLD_KINDS = ['plain', 'think', 'stake'];
/* flame(무한모드 — 화염병 줄(4단계)을 연 판만): 열린 병과 끝에 화염병을 더한다. 철창·금색 칸 하나에 rand 한 번은 그대로라 수·자리는 같고 병과만 넷 중에서
   (화염병 줄을 안 연 판은 예전 그대로 — 앞 단계 지문). 화염병에는 소개 레벨이 없다(intro가 되지 않는다) */
function placeSpecials(lv, p, bare = false, seed = null, flame = false) {
  const kinds = SP_KINDS.filter((k) => p.L >= UNLOCK[k]);
  if (flame) kinds.push('flame');
  if (!kinds.length || p.L < UNLOCK.cage) return;
  const sg = { rs: seed ?? hash(VERSION, 'sp', p.L, lv.attempt) };
  const intro = kinds.find((k) => UNLOCK[k] === p.L);
  let last = '';
  // SIM 9: 같은 병과를 또 구하면 레벨이 오르므로 '바로 앞과 다른 병과' 규칙(SIM 8 — 겹치면 병사로 바뀌어 쓸모없던 때)을 없애고
  // 열린 병과 중 그냥 무작위로 — 같은 rand 한 번이라 철창·금색 칸의 수·자리는 SIM 8과 같다(병과만 다를 수 있다). bare는 SIM 8 그대로
  const pickKind = () => {
    let list = bare ? kinds.filter((k) => k !== last) : kinds;
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
      // 어려움·매우 어려움(L15+)의 첫 판돈 줄은 금색으로 바꾸지 않는다(3단계 — 금색 칸이 나쁜 칸의 대가를 지워 '늘 진짜 최악 칸'이 이기던 곳)
      if (i === 0 && p.hardish && p.tagFull) continue;
      if (row.cells.length < 2 || !GOLD_KINDS.includes(row.kind) || row.cells.every((c) => cellGood(c) < 0) || !chance(sg, 0.45)) continue;
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
      row.kind = 'gold';
      made++;
      // 두 칸 줄의 금색은 늘 오른쪽(x=0은 왼쪽 칸을 지나므로) — 오른쪽에 서 있기만 해도 덕을 보지 않게, 오른쪽이 정답인
      // 다른 두 칸 게이트 줄 하나를 좌우로 바꿔 정답 하나를 왼쪽에 돌려준다(마지막 줄·금색 줄 제외, 뒤쪽 줄부터)
      if (row.cells.length === 2 && worst === 1) {
        for (let j = lv.rows.length - 2; j >= 0; j--) {
          const r = lv.rows[j];
          if (j === i || r.src !== 'gate' || r.kind === 'trap' || r.cells.length !== 2 || r.cells.some((c) => c.op === 'unit')) continue;
          if (goldenValue(r.ng, r.cells[1]) <= goldenValue(r.ng, r.cells[0])) continue;
          const [a, b] = r.cells;
          r.cells = [{ ...b, x0: a.x0, x1: a.x1 }, { ...a, x0: b.x0, x1: b.x1 }];
          break;
        }
      }
    }
  }
}

/* bare(SIM 9): 그 배치를 SIM 8처럼 — MAX 칸 없이(높인 끝을 cap0으로 되돌리고 빠르기도 그대로), 특수병 병과도 SIM 8 규칙(바로 앞과 다른 병과).
   보정(calibrateLevel)이 '이 배치에서 MAX 칸 때문에 서 있기만 해도 이기게 됐다'고 볼 때만 쓴다(표의 bare) */
/* cycle(회차, 2부터): 배치의 난수 흐름은 1회차와 같고(같은 청크·같은 종류·같은 자리), 골든 패스만 그 회차의 기대 강화로 출발한다 —
   게이트 숫자·적 체력이 회차의 힘에 맞게 커진다(병력에 따라 갈리는 몇 곳 — ×3은 150명 아래, 세 칸 벽은 작은 분대 — 은 달라질 수 있다) */
export function buildLevel(L, attempt = 0, bare = false, cycle = 1) {
  const p = levelParams(L);
  const g = { rs: hash(VERSION, p.L, attempt) };
  // 골든 패스는 기대 강화(EXPECT)의 시작 병력·화력으로 출발한다 — 판 중 위협이 '실제로 들고 오는 힘'에 맞게
  const E = expectLoadout(p.L, cycle);
  const lv = {
    L: p.L, attempt, seed: hash(VERSION, 'run', p.L, attempt), speed: p.speed, params: p, tag: p.tag,
    rows: [], foes: [], props: [], saws: [], plan: [], golden: [], chunks: [], nextId: 1,
    arenaZ: 0, bossHp: 0, par: 0, arrive: 0, helpStart: 0,
    startE: E.start, fireE: E.fire, heroE: E.hero, marks: [], bare: !!bare,
  };
  if (cycle > 1) lv.cycle = cycle;
  const plan = planChunks(p, g);
  lv.plan = plan;
  // 그 레벨에서 처음 소개하는 것은 반드시 한 번 나오게
  const force = new Set();
  for (const m of ['mul', 'runner', 'brute', 'div', 'triple', 'mul3']) if (UNLOCK[m] === p.L) force.add(m);
  lv.force = force;
  // ×는 하나를 보스 직전 줄 몫으로 남겨 둔다(L3부터)
  const reserve = p.maxMul >= 2 ? 1 : 0;
  const ctx = { mulLeft: p.maxMul, reserve, lessBad: p.L >= UNLOCK.div ? 1 : 0, late: false, last: false, force, hold: [0, 0, 0], rows3: 0, mid3: 0, rows: 0 };
  let z = 34;
  const n0 = E.start;
  let ng = n0;
  // 강화로 시작 병력이 늘면 도착 병력도 늘어난다(대략 √배)
  const PE = p.P * Math.sqrt(n0 / START_N);
  for (let i = 0; i < plan.length; i++) {
    ctx.late = i >= plan.length - 2;
    ctx.last = i === plan.length - 1 && reserve > 0;
    // 태그 위협 배수: 쉼은 모든 청크, 어려움·매우 어려움은 L15부터 모든 청크(L5·L10은 마지막 두 청크만 — 소개 청크를 지킨다)
    // 2단계: L5·L10(소개 레벨)은 보스만 어렵다(P09) — 판 중 위협 배수는 쉼 레벨과 L15+ 어려운 태그에만
    const tagged = p.tag === 'rest' || p.tagFull;
    lv.thr = tagged ? p.threat : 1;
    lv.wm = tagged ? p.waveMul : 1;
    lv.gh = tagged ? p.gruntHp : p.gruntBase;
    const target = n0 * Math.pow(PE / n0, (i + 1) / plan.length);
    // 너무 앞서가면 다음 줄은 덜 주고, 처지면 더 준다
    const t = ng > target * 1.25 ? target * 0.9 : ng < target * 0.8 ? target * 1.15 : target;
    const rowsBefore = lv.rows.length;
    const foesBefore = lv.foes.length;
    const r = CHUNK[plan[i]](lv, g, p, z, ng, t, ctx);
    // 거구 상한(무리 체력을 맞추느라 늘었어도): 그대로 부딪혀도 이 청크 골든 병력의 BRUTE_CAP까지만
    for (let j = foesBefore; j < lv.foes.length; j++) {
      const f = lv.foes[j];
      if (f.kind === 'brute') f.hp = f.max = Math.max(1, Math.min(f.hp, Math.floor(BRUTE_CAP * ng * SOLDIER_HP)));
    }
    ctx.rows = lv.rows.length;
    lv.chunks.push({ kind: plan[i], z, len: r.len, ng, rows: lv.rows.length - rowsBefore, thr: lv.thr });
    z += r.len;
    ng = Math.max(1, Math.round(r.ng));
    lv.golden.push(ng);
  }
  lv.arenaZ = z + 12;
  placeSpecials(lv, p, bare);
  placeElites(lv, p);
  // 높인 끝은 레벨 생성(골든 패스·고정 위치 할당량)에 쓰이지 않으므로(tests/run.mjs) 되돌리면 SIM 8의 칸과 같다
  if (bare) for (const r of lv.rows) for (const c of r.cells) if (c.cap0 != null) { c.cap = c.cap0; delete c.cap0; }
  lv.foes.sort((a, b) => a.z - b.z || a.id - b.id);
  lv.missing = [...force];   // 끝까지 못 넣은 소개 항목(테스트에서 비어 있어야 함)
  delete lv.force;
  delete lv.thr;
  delete lv.wm;
  delete lv.gh;
  if (!bare) redFast(lv);
  return lv;
}

/* ---------- 무한모드(ENDGAME.md 5절) ----------
   한 판이 끝나지 않는다: 구간(달리기 + 보스 하나)을 잇달아 붙인다. 보스를 잡으면 결과 화면 없이 다음 구간이 이어지고,
   병력·무기 단계·특수병·영웅 게이지·회복 풀을 그대로 들고 간다. 죽을 때까지.
   - 구간 k(1부터): 지역은 차례로(모래 고개 → … → 한밤 놀이공원 → 다시), 3번째는 정예, 6번째(한 바퀴의 끝)는 대왕.
     렌더러·화면은 s.L(그 지역·등급의 가상 레벨 61~120)만 보고 지역 그림·왕관·이름을 고른다.
   - 다음 구간은 '보스가 쓰러진 순간 들고 있는 병력·무기 단계'로 만든다(게이트 숫자·적 체력). 보정은 돌리지 않는다 — 식으로만 정한다.
     위협 = 그 병력의 화력(기준 화력 단계 ENDLESS.fire) × segMul(k). 구간마다 커져 언젠가는 무너진다.
     병력이 바닥선(segFloor — 무난한 진행의 병력)보다 적으면 위협은 바닥선 병력 기준이다: 뒤처지면 적이 그만큼 약해지지 않아 손실이 쌓인다.
   - 예고는 캠페인 L30+ 값 그대로. 달리는 속도만 구간마다 조금씩 빨라진다(segSpeed — 상한 1.4배, ARSENAL.md 9절): 줄 사이에 고를 시간이 줄어든다.
     함정 줄(18m 뒤 ÷2)은 가장 빠를 때도 옆 칸으로 비킬 시간(이동 + 0.45초)이 남는다(테스트).
   - 한 구간의 순성장: 보스 직전 줄의 ×2 하나 + 작은 덧셈(GK = ENDLESS.gk). 병력 상한은 ENDLESS.maxN(사실상 없음 — 캠페인만 MAX_N 9999).
   - 상태는 평범한 JSON(s.endless) — 다음 구간은 상태와 시드만으로 정해진다. 캠페인 판에는 s.endless가 없다(stateHash 그대로) */
export const ENDLESS = {
  maxN: 999999999999,       // 병력 상한(9999억 — 화면은 만·억으로 줄여 적는다, fmtN). 구간당 ×2 안팎이라 30구간을 넘겨도 닿지 않는다
  fire: 10,                 // 위협을 만드는 기준 화력 단계(1회차 끝의 기대 강화) — 화력 강화가 이보다 높으면 그만큼 더 멀리 간다
  floor0: START_N + 20,     // 바닥선의 밑(시작 병력 강화 10단계의 출발 병력)
  floorGrow: 1.6,           // 바닥선은 구간마다 이만큼(무난한 진행의 순성장 아래쪽)
  grow: 1.7,                // 골든 패스 목표 순성장(구간당 — 덧셈 칸 크기를 정한다. 보스 직전 ×2까지 실제로는 ×2 안팎)
  gk: 0.2,                  // 덧셈 이득 배수(생성 중 GK)
  chunks: { '': 7, hard: 6, super: 7 },
  threat: { hard: 1.15, super: 1.3 },   // 정예·대왕 구간의 판 중 위협 배수(캠페인 어려움 1.25·매우 어려움 1.5보다 낮다 — 이미 segMul이 곱해진다)
  wave: { hard: 1.1, super: 1.3 },
  mul0: 0.65, mulStep: 1.15,   // 판 중 위협 배수 segMul(k) = mul0 × mulStep^(k−1)
  bossMul0: 0.85, bossStep: 1.06,   // 보스 체력 배수 = bossMul0 × bossStep^(k−1) — 달리기보다 높게 시작한다(가만히 서 있는 분대가 첫 보스를 못 넘게)
  bossM: { '': 0.7, hard: 0.7, super: 0.75 },   // 보스 체력 = 골든 도착 병력 × m의 화력 × bossKill초 × 보스 배수
  bossKill: { '': 12, hard: 13, super: 14 },
  bossC: 1.05,              // 보스가 닿기까지 c × bossKill초
  speedStep: 0.04, speedMax: 1.4,   // 달리는 속도: 구간마다 +4%, 1.4배(10 → 14m/s, 11구간)에서 멈춘다 — 예고·옆 이동 속도는 그대로라 고를 시간이 준다
  wait: 1.2,                // 보스가 쓰러진 뒤 다음 구간이 이어지기까지(초) — 쓰러지는 연출
  lead: 6,                  // 다음 구간의 첫 청크까지 더 두는 거리(m)
  coinBase: 10, coinStep: 20, coinTag: { '': 1, hard: 1.5, super: 2 }, coinLoop: 0.25,
};
/* 덧셈 칸을 구간 기준 병력 B(k)에 비례하게(ENDGAME.md 18.8): 좋은 칸(+)과 나쁜 칸(−) 모두, 크기 = 만들 때 병력 기준 값 × f(f = B(k) / 그때 병력). 같은 구간이면 누구에게나 같은 숫자.
   쏴서 올리는 폭(step)도 B(k)에 맞춘다 — 1칸 올리는 데 드는 피해 ÷ f(오르는 시간은 그대로) */
function bkScale(lv, f) {
  const sc = (x) => Math.sign(x) * Math.max(1, Math.round(Math.abs(x) * f));
  for (const r of lv.rows) {
    for (const c of r.cells) {
      if (c.op !== 'add') continue;
      c.v0 = sc(c.v0);
      c.v = c.v0;
      c.cap = Math.max(c.v0, sc(c.cap));
      c.step = c.step / f;
    }
  }
}
/* 구간 k(1부터)의 지역·등급·가상 레벨 */
export function segInfo(k) {
  const n = Math.max(1, Math.floor(k));
  const bi = (n - 1) % 6;
  const tag = n % 6 === 0 ? 'super' : n % 6 === 3 ? 'hard' : '';
  return { k: n, loop: Math.floor((n - 1) / 6), biome: bi, tag, L: 60 + 10 * bi + (tag === 'super' ? 10 : tag === 'hard' ? 5 : 2) };
}
/* 보스 b마리를 잡은 판에서 쓰러뜨린 대왕 수(6구간마다 대왕 — segInfo와 같은 규칙) */
export const segKings = (bosses) => Math.floor(Math.max(0, bosses | 0) / 6);
/* 구간 k의 달리는 속도 배수: 구간마다 speedStep씩 빨라지고 speedMax에서 멈춘다(ARSENAL.md 9절) */
export const segSpeed = (k) => Math.min(ENDLESS.speedMax, 1 + ENDLESS.speedStep * (Math.max(1, k) - 1));
export const segMul = (k) => ENDLESS.mul0 * Math.pow(ENDLESS.mulStep, Math.max(1, k) - 1);
/* 바닥선: 1구간에는 없다(누구나 제 병력 기준으로 출발한다), 2구간부터 floor0 × floorGrow^(k−1) */
export const segFloor = (k) => (k <= 1 ? 0 : Math.min(ENDLESS.maxN, Math.round(ENDLESS.floor0 * Math.pow(ENDLESS.floorGrow, k - 1))));
/* 구간 기준 병력 B(k)(개편 판 — 덧셈 칸의 크기, 18.8): 바닥선(1구간은 floor0) × BUILD.bk.mul */
export const segBk = (k) => (segFloor(k) || ENDLESS.floor0) * BUILD.bk.mul;
/* 개편 판 자동 보급(51절 — 절대치): 방금 잡은 구간 k의 B(k) × BUILD.supply[등급]. 지금 병력과 상관없다(예전 병력 +20% · 대왕 +50%는 앞선 판일수록 크게 불었다) */
export const segSupply = (k) => Math.max(1, Math.round(segBk(k) * BUILD.supply[segInfo(k).tag]));
/* 구간 k의 보스를 잡으면 적립되는 코인: 그 지역의 기본 몫 × 등급 × (1 + 0.25·바퀴 수). 죽어도·포기해도 받는다 */
export function segCoins(k) {
  const i = segInfo(k);
  return Math.round((ENDLESS.coinBase + ENDLESS.coinStep * (i.biome + 1)) * ENDLESS.coinTag[i.tag] * (1 + ENDLESS.coinLoop * i.loop));
}
const ENDLESS_MIX = { stake: 0.3, jack: 0.4, plain: 0.3 };
export function segParams(k) {
  const i = segInfo(k);
  const p = levelParams(i.L);
  const E = ENDLESS;
  p.endless = true;
  p.seg = i.k;
  p.speed *= segSpeed(i.k);
  p.k = 1.3;
  p.pressure = 1.5;
  p.maxMul = 1;                 // 보스 직전 줄의 ×2 하나
  p.chunks = E.chunks[i.tag];
  if (i.tag) { p.threat = E.threat[i.tag]; p.waveMul = E.wave[i.tag]; }
  p.mix = ENDLESS_MIX;
  p.bossKill = E.bossKill[i.tag];
  p.bossWalk = BOSS_WALK_DIST / (E.bossC * p.bossKill);
  p.boss = { mode: 'endless', m: E.bossM[i.tag], c: E.bossC };
  return p;
}
/* 구간 하나(레벨 한 판과 같은 모양의 객체 — z는 0부터). n = 그 순간 병력, tier = 무기 단계. 같은 (seed, k, n, tier, attempt, opt) → 같은 구간.
   opt.obs: 2단계 장애물(단계 해금 기획서 4절 — 2단계를 연 판만, RUN_ORDER.obstacle구간부터)을 넣는다. 장애물은 장애물 전용 난수(lv.og)로만 고르고
   기존 것을 그 자리에서 바꾸거나 뒤에 더한다 — 장갑문(갈림길 위험한 쪽), 방패 정예(무리마다 하나), 폭발 드럼통(구간마다 1~2개). 그 밖의 배치는 opt 없이 만든 구간과 같다.
   opt.flame: 4단계(화염병 줄을 연 판만) — 철창·금색 칸의 병과를 화염병까지 넷 중에서 고른다(수·자리·나머지 배치는 그대로, placeSpecials) */
export function buildSegment(seed, k, n, tier = 0, attempt = 0, opt = null) {
  const prev = RCAP;
  RCAP = opt && opt.bk ? BUILD.narrow : R_MAX;   // 개편 판은 좁은 몸으로 만든다(골든 패스·보스 체력의 맞는 몫이 실제 판과 같게)
  try { return buildSegment0(seed, k, n, tier, attempt, opt); } finally { RCAP = prev; }
}
function buildSegment0(seed, k, n, tier, attempt, opt) {
  const p = segParams(k);
  const E = ENDLESS;
  if (opt && opt.terrain) { p.hide = p.seg >= TERRAIN.hideFrom; p.tight = p.seg >= TERRAIN.tightFrom; p.chain = p.seg >= TERRAIN.chainFrom; p.maze = p.seg >= LANES.mazeFrom; p.luck = p.seg >= LANES.luckFrom; if (opt.luckP) p.luckP = opt.luckP; p.rush = p.seg >= RUSH.from; p.rushRoll = rand({ rs: hash(VERSION, 'rushPlan', seed >>> 0, p.seg) }); p.mazeGates = true; p.mood = segMood(seed, p.seg); p.gaunt = p.seg >= GAUNT.from; p.gauntSeed = seed >>> 0; }   // 지형(개편 판만 — 바퀴 3·4·5부터), 함정 길(46.4)
  const g = { rs: hash(VERSION, 'endless', seed >>> 0, p.seg, attempt) };
  const n0 = clamp(Math.floor(n), 1, E.maxN);
  // 뒤처진 분대(바닥선 아래)에게는 위협이 바닥선 병력 기준(화력 ∝ 병력^0.8)
  const behind = Math.pow(Math.max(1, segFloor(p.seg) / n0), 0.8);
  const base = WEAPON[clamp(tier | 0, 0, THREAT_TIER)] * segMul(p.seg) * behind * (opt && opt.mul > 1 ? opt.mul : 1);   // 코일의 넷째 단계는 위협에 넣지 않는다(THREAT_TIER)
  const FE = opt && opt.fe > E.fire ? opt.fe : E.fire;   // 위협을 만드는 화력 단계(개편 판의 앞 구간은 실제 강화를 따라간다 — bldFe)
  const lv = {
    L: p.L, attempt, seed: hash(VERSION, 'endless-run', seed >>> 0), speed: p.speed, params: p, tag: p.tag,
    rows: [], foes: [], props: [], saws: [], plan: [], golden: [], chunks: [], nextId: 1,
    arenaZ: 0, bossHp: 0, par: 0, arrive: 0, helpStart: 0,
    startE: n0, fireE: FE, heroE: null, marks: [], bare: true, refMul: base,
  };
  if (opt && opt.obs && p.seg >= RUN_ORDER.obstacle) lv.og = { rs: hash(VERSION, 'obstacle', seed >>> 0, p.seg, attempt) };
  const BKON = !!(opt && opt.bk && BUILD.bk.on);   // 개편 판: 덧셈 칸은 B(k)에 비례(아래). 만들 때의 이득 축소는 ENDLESS.gk가 아니라 BUILD.bk.gain
  GK = BKON ? BUILD.bk.gain : E.gk;
  NCAP = E.maxN;
  const SW = opt && opt.swarm > 1 ? opt.swarm : 1, SH = opt && opt.swarmHp > 0 ? opt.swarmHp : 1;
  try {
    const plan = planChunks(p, g);
    lv.plan = plan;
    lv.force = new Set();
    const ctx = { mulLeft: p.maxMul, reserve: 1, lessBad: 0, late: false, last: false, force: lv.force, hold: [0, 0, 0], rows3: 0, mid3: 0, rows: 0 };
    let z = 34;
    let ng = n0;
    const PE = n0 * E.grow;
    for (let i = 0; i < plan.length; i++) {
      ctx.late = i >= plan.length - 2;
      ctx.last = i === plan.length - 1;
      lv.thr = base * (p.tagFull ? p.threat : 1);
      LEAKT = BKON ? lv.thr : 1;
      lv.wm = (p.tagFull ? p.waveMul : 1) * SW;   // 떼거리(변이): 무리 ×SW(좀비 수), 하나하나의 체력 ×SH — 무리 전체 체력은 ×SW × SH
      lv.gh = (p.tagFull ? p.gruntHp : p.gruntBase) * SH;
      const target = n0 * Math.pow(PE / n0, (i + 1) / plan.length);
      const t = ng > target * 1.25 ? target * 0.9 : ng < target * 0.8 ? target * 1.15 : target;
      const rowsBefore = lv.rows.length;
      const foesBefore = lv.foes.length;
      const r = CHUNK[plan[i]](lv, g, p, z, ng, t, ctx);
      for (let j = foesBefore; j < lv.foes.length; j++) {
        const f = lv.foes[j];
        if (f.kind === 'brute') f.hp = f.max = Math.max(1, Math.min(f.hp, Math.floor(BRUTE_CAP * ng * SOLDIER_HP)));
      }
      ctx.rows = lv.rows.length;
      lv.chunks.push({ kind: plan[i], z, len: r.len, ng, rows: lv.rows.length - rowsBefore, thr: lv.thr });
      z += r.len;
      ng = Math.max(1, Math.round(r.ng));
      lv.golden.push(ng);
    }
    lv.arenaZ = z + 12;
    placeSpecials(lv, p, false, hash(VERSION, 'endless-sp', seed >>> 0, p.seg, attempt), !!(opt && opt.flame));
    if (lv.og) { placeDrums(lv); obstacleMarks(lv); }
    if (opt && opt.terrain) terrain46(lv, p, seed);   // 46.5·46.6: 가속 발판 · 새 적 셋(따로 굴림 — 위 배치·숫자는 그대로)
  } finally { GK = 1; NCAP = MAX_N; LEAKT = 1; delete lv.og; }
  // MAX 칸(높인 끝)은 쓰지 않는다 — 몰아 쏘기 확인(redFast)을 판 중간에 돌릴 수 없다
  for (const r of lv.rows) for (const c of r.cells) if (c.cap0 != null) { c.cap = c.cap0; delete c.cap0; }
  if (BKON) bkScale(lv, BUILD.bk.mul * (segFloor(p.seg) || E.floor0) / n0);
  if (p.mood && MOOD[p.mood]) {   // 구간 성격(39.6): 덧셈 칸의 좋은 쪽·나쁜 쪽 크기
    const M = MOOD[p.mood], sc = (x, k) => Math.sign(x) * Math.max(1, Math.round(Math.abs(x) * k));
    for (const r of lv.rows) for (const c of r.cells) {
      if (c.op !== 'add') continue;
      const k = c.v0 > 0 ? M.good : M.bad;
      c.v0 = sc(c.v0, k); c.v = c.v0; c.cap = c.cap > 0 ? Math.max(c.v0, sc(c.cap, c.v0 > 0 ? M.good : 1)) : Math.max(c.v0, c.cap);
    }
    lv.mood = p.mood;
  }
  if (BKON) {   // 개편 판: 벽·장갑문 체력은 위협 곡선을 덜 따라간다(ENDGAME.md 20절 — 탄·특수병의 힘은 거의 좀비에게만 들어 11구간쯤부터 벽이 안 깨졌다)
    const W = BUILD.wall, f = clamp(Math.pow((segMul(p.seg) * (opt.mul > 1 ? opt.mul : 1)) / segMul(W.from), -W.cut), W.lo, 1);
    if (f < 1) for (const pr of lv.props) if (pr.kind === 'wall' || pr.kind === 'door') { pr.hp = pr.max = Math.max(1, Math.round(pr.max * f)); }
  }
  // 코인 상자는 구간 번호만큼(가상 레벨 61~120의 값을 그대로 주지 않는다)
  for (const pr of lv.props) if (pr.reward && pr.reward.type === 'coin') pr.reward.v = Math.min(60, 10 + 5 * p.seg);
  lv.foes.sort((a, b) => a.z - b.z || a.id - b.id);
  delete lv.force;
  delete lv.thr;
  delete lv.wm;
  delete lv.gh;
  const Gn = lv.golden[lv.golden.length - 1] || n0;
  lv.arrive = Gn;
  lv.bossHp = Math.max(30, Math.round(dps(Gn * p.boss.m, 0, FE) * (base / segMul(p.seg)) * E.bossMul0 * Math.pow(E.bossStep, p.seg - 1) * p.bossKill * bossHitFrac(Gn)));
  return lv;
}
/* 46.5·46.6(개편 판 지형): 청크를 다 만든 뒤 따로 굴려(hash) 더한다 — 갈림길 위험한 쪽·독침 앞·무리 앞의 가속 발판, 무리의 졸개 몇을 자폭·도약 좀비로,
   게이트 줄의 가장 좋은 덧셈 칸 앞에 게이트 도둑. 갈림길·칸막이·몰이·함정 길 안의 좀비는 바꾸지 않는다 */
function terrain46(lv, p, seed) {
  const g = { rs: hash(VERSION, 'terrain46', seed >>> 0, p.seg) };
  const k = p.seg;
  const inSpecial = (z) => (lv.divs && lv.divs.some((d) => z >= d.z0 - 4 && z <= d.z1 + 2)) || (lv.lanes && lv.lanes.some((l) => z >= l.z0 - 4 && z <= l.z1 + 2))
    || (lv.zones && lv.zones.some((o) => z >= o.z0 - 6 && z <= o.z1 + 2));
  // 가속 발판 — 갈림길 위험한 쪽(벽·문·떼 앞, 갈린 뒤라 들어가면 못 피한다)
  for (const d of lv.divs || []) {
    if (k < PAD.fork.from || rand(g) >= PAD.fork.p) continue;
    const wz = d.z0 + FORK_TAPER + FORK.wall;
    addPad(lv, d.risk > 0 ? 0.2 : -ROAD - 1, d.risk > 0 ? ROAD + 1 : -0.2, wz - PAD.fork.len - 2, PAD.fork.len, PAD.fork.mul);
    d.pad = 1;
  }
  // 독침 앞(길 전체) · 무리 앞(반쪽)
  for (const ch of lv.chunks) {
    if (ch.kind === 'spit' && k >= PAD.spit.from && rand(g) < PAD.spit.p) addPad(lv, -ROAD - 1, ROAD + 1, ch.z + 14, PAD.spit.len, PAD.spit.mul);
    else if (ch.kind === 'wave' && k >= PAD.wave.from && rand(g) < PAD.wave.p) { const sd = rand(g) < 0.5 ? -1 : 1; addPad(lv, sd < 0 ? -ROAD - 1 : 0, sd < 0 ? 0 : ROAD + 1, ch.z + 6, PAD.wave.len, PAD.wave.mul); }
  }
  // 새 적 — 자폭(질주 몸) · 도약
  const B = FOE2.bomb, Lp = FOE2.leap, T = FOE2.thief;
  if (k >= B.from) {
    for (const ch of lv.chunks) {
      if (ch.kind === 'fork' || ch.kind === 'maze' || ch.kind === 'luck' || ch.kind === 'rush' || ch.kind === 'gaunt') continue;
      const pool = lv.foes.filter((f) => f.kind === 'grunt' && !f.elite && !f.flank && !f.fork && !f.maze && !f.guard && f.z >= ch.z && f.z < ch.z + ch.len && !inSpecial(f.z)).sort((a, b) => a.z - b.z || a.id - b.id);
      if (pool.length < 5) continue;
      for (let i = k >= B.two ? 2 : 1; i > 0 && pool.length > 3; i--) {
        const f = pool.splice(Math.floor(rand(g) * pool.length), 1)[0];
        Object.assign(f, { kind: 'runner', r: FOE_BASE.runner.r, spd: B.spd, home: B.home, homeDist: FOE_BASE.runner.homeDist, elite: 'bomb' });
        f.hp = f.max = Math.max(1, Math.round(f.hp * B.hp));
      }
      if (k >= Lp.from) for (let i = k >= Lp.three ? 3 : Lp.n; i > 0 && pool.length > 3; i--) {
        const f = pool.splice(Math.floor(rand(g) * pool.length), 1)[0];
        f.elite = 'leap';
        f.hp = f.max = Math.max(1, Math.round(f.hp * Lp.hp));
      }
    }
  }
  // 게이트 도둑 — 보통·생각·판돈·잭팟·금색 줄(마지막 줄 빼고)의 가장 좋은 덧셈 칸 앞
  if (k >= T.from) {
    const lastZ = lv.rows.reduce((m, r) => Math.max(m, r.z), -Infinity);
    const rows = lv.rows.filter((r) => r.src === 'gate' && ['plain', 'think', 'stake', 'jack', 'gold'].includes(r.kind) && r.z < lastZ && r.cells.some((c) => c.op === 'add' && c.v > 0) && !inSpecial(r.z));
    for (let i = k >= T.two ? 2 : 1; i > 0 && rows.length; i--) {
      const row = rows.splice(Math.floor(rand(g) * rows.length), 1)[0];
      let ci = -1;
      row.cells.forEach((c, j) => { if (c.op === 'add' && c.v > 0 && (ci < 0 || c.v > row.cells[ci].v)) ci = j; });
      const c = row.cells[ci];
      let ch = lv.chunks[0];
      for (const o of lv.chunks) if (o.z <= row.z) ch = o;
      const hp = Math.max(1, Math.round(dps(ch.ng, 0, lv.fireE || 0) * (ch.thr || 1) * T.hp));
      lv.foes.push({ id: lv.nextId++, kind: 'grunt', x: (c.x0 + c.x1) / 2, z: row.z - T.ahead, hp, max: hp, alive: true, awake: false, hitT: -9, cd: 0, seed: (rand(g) * 1000) | 0, ...FOE_BASE.grunt, spd: 0, home: 0, homeDist: 0, elite: 'thief', row: row.id, ci, acc: 0 });
    }
  }
}
/* 2단계 장애물의 자리·개수(보이는 수치는 roster.js OBSTACLES) [초안].
   door.p: 4구간부터 갈림길 위험한 쪽이 장갑문일 몫(벽 · 좀비 떼 · 장갑문이 셋에 하나꼴).
   shield.n: 무리(spawnWave) 하나에 섞이는 방패 정예 수.
   drum: two = 한 구간에 둘일 몫(아니면 하나), crate = 상자·철창 옆에 둘 몫(아니면 좀비 무리 앞), hp = 체력(그 청크 위협 화력의 이만큼 초 — 작다),
   w = 반폭(m), gap = 상자 바깥 옆으로 띄우는 거리(m — 반경 안), wave·deep = 무리로 치는 덩어리(한 좀비 둘레 옆으로 반경·앞뒤 deep m 안의 좀비 수), chunks = 무리를 찾는 청크 */
export const OBST = {
  door: { p: 1 / 3 },
  shield: { n: 1 },
  drum: { two: 0.5, crate: 0.35, hp: 0.2, w: 0.45, gap: 0.9, wave: 4, deep: 6, chunks: ['wave', 'surge', 'spit', 'crate', 'gate'] },
};
/* 폭발 드럼통 놓기(장애물 전용 난수): 좀비 무리의 가장 빽빽한 덩어리 조금 앞(드럼통이 사거리에 들 때 덩어리가 걸어와 둘레에 있다 — 노릴 맛이 있게), 때로 상자·철창의 바깥 옆(반경 안 — 같이 쏘면 상자를 잃는다).
   갈림길 안·코 앞에는 두지 않는다(벽·떼·문 고르기가 이미 있다). 가운데 쪽이 아니라 바깥 옆이라 맞은편 상자(열쇠 대 지원병)는 반경 밖 */
function placeDrums(lv) {
  const og = lv.og, O = OBST.drum;
  const inDiv = (z) => !!lv.divs && lv.divs.some((d) => z >= d.z0 - 6 && z <= d.z1 + 2);
  const chunkAt = (z) => { let c = lv.chunks[0]; for (const ch of lv.chunks) if (ch.z <= z) c = ch; return c; };
  // 청크마다 가장 빽빽한 덩어리(한 좀비 둘레 — 옆으로 반경, 앞뒤로 O.deep m 안): 무리가 양옆으로 갈렸어도 한쪽 덩어리에 둔다
  const r = OBSTACLES.drum.r;
  const waves = [];
  for (const ch of lv.chunks) {
    if (!O.chunks.includes(ch.kind)) continue;
    const fs = lv.foes.filter((f) => f.kind !== 'spit' && !f.fork && !f.flank && f.z >= ch.z && f.z < ch.z + ch.len && !inDiv(f.z));
    let cl = [];
    for (const f of fs) { const c = fs.filter((g) => Math.abs(g.x - f.x) < r && Math.abs(g.z - f.z) < O.deep); if (c.length > cl.length) cl = c; }
    if (cl.length >= O.wave) waves.push(cl);
  }
  const boxes = lv.props.filter((q) => (q.kind === 'crate' || q.kind === 'cage') && !q.fork && !inDiv(q.z));
  const n = chance(og, O.two) ? 2 : 1;
  for (let i = 0; i < n; i++) {
    let x, z;
    if (boxes.length && (!waves.length || chance(og, O.crate))) {
      const c = boxes.splice((rand(og) * boxes.length) | 0, 1)[0];
      const cx = (c.x0 + c.x1) / 2;
      const sd = cx > 0 ? 1 : cx < 0 ? -1 : chance(og, 0.5) ? 1 : -1;
      x = clamp(cx + sd * ((c.x1 - c.x0) / 2 + O.gap), -ROAD + O.w + 0.05, ROAD - O.w - 0.05);
      z = c.z;
    } else if (waves.length) {
      const fs = waves.splice((rand(og) * waves.length) | 0, 1)[0];
      const zs = fs.map((f) => f.z).sort((a, b) => a - b);
      let sx = 0;
      for (const f of fs) sx += f.x;
      x = clamp(sx / fs.length, -3.9, 3.9);
      // 무리 가운데가 걸어와 닿는 자리: 무리는 WAKE m 앞에서 깨어 걷고, 드럼통은 사거리(BULLET_RANGE)에 들 때 처음 맞는다 — 그때 무리 가운데가 드럼통 둘레에 오게
      z = zs[zs.length >> 1] - (FOE_BASE.grunt.spd * (WAKE - BULLET_RANGE)) / (lv.speed + FOE_BASE.grunt.spd);
      if (inDiv(z)) continue;
    } else break;
    const ch = chunkAt(z);
    const hp = Math.max(1, Math.round(O.hp * dps(ch.ng, 0, lv.fireE) * (ch.thr || 1)));
    lv.props.push({ id: lv.nextId++, kind: 'drum', x0: x - O.w, x1: x + O.w, z, hp, max: hp, alive: true, hitT: -9 });
  }
}
/* 처음 보는 장애물 알림 자리: 구간마다 종류별로 가장 앞의 것(장갑문은 그 갈림길의 코 — 고르는 자리). 판에서 종류마다 한 번만 알린다(marksUpdate → 'obstacle') */
function obstacleMarks(lv) {
  const first = {};
  const put = (k, z) => { if (!(first[k] <= z)) first[k] = z; };
  for (const d of lv.divs || []) if (d.kind === 'door') put('door', d.z0);
  for (const q of lv.props) if (q.kind === 'drum') put('drum', q.z);
  for (const f of lv.foes) if (f.elite === 'shield') put('shield', f.z);
  for (const k of OBSTACLE_IDS) if (first[k] != null) lv.marks.push({ t: 'obstacle', kind: k, z: first[k] });
}
/* 장갑문이 이 판의 총알에서 받는 피해 배수: 보통 총알 gun, 관통 효과가 있으면 pierce, 작렬 효과면 레벨만큼(Lv2 = burst, Lv1은 gun과의 사이, Lv3도 burst까지) — 가진 것 중 가장 큰 값.
   봇의 갈림길 판단(divSteer)도 이 값을 본다 */
export function doorMul(s) {
  const D = OBSTACLES.door;
  const fx = fxOf(s);
  let k = D.gun;
  if (fx && fx.pierce) k = Math.max(k, D.pierce);
  if (fx && fx.burst) k = Math.max(k, D.gun + (D.burst - D.gun) * Math.min(1, fxK(fx.burst)));
  return k;
}
/* 방패 정예가 총알에서 받는 피해 배수(관통 효과가 있으면 방패를 무시한다) */
export const shieldMul = (s) => { const fx = fxOf(s); return fx && fx.pierce ? 1 : OBSTACLES.shield.gun; };
/* 드럼통 d의 폭발 반경이 소품 o(상자·철창 — x0~x1 줄)에 닿나: 드럼통 가운데에서 그 줄의 가장 가까운 점까지 */
export function blastReach(d, o) {
  const x = (d.x0 + d.x1) / 2;
  const dx = Math.max(0, o.x0 - x, x - o.x1), dz = o.z - d.z;
  return dx * dx + dz * dz <= OBSTACLES.drum.r * OBSTACLES.drum.r;
}

/* 무한모드 새 판. opt = { seed, start, fire, hero, pet, ammo, unl, ammoOpen, flame, relicsOpen, relics }
   해금(단계 해금 기획서 1절 — store.endlessUnlocks가 센다): unl = 선형 단계(1 카드, 2 탄 효과·시너지·장애물, 3 유물 — CARD.stageMax까지),
   ammoOpen = 별로 열린 탄종, flame = 화염병(4단계, 2회차 엔딩 — 따로 가는 줄), relicsOpen = 열린 유물 id(3단계의 넷 + 5단계로 하나씩).
   상태 s.endless에는 그 단계가 열려 뜻이 있을 때만 싣는다 — 없는 값은 필드도 없게(앞 단계를 연 판의 지문 PLAIN_FP·STAGE1_FP… 그대로).
   relics(시험·측정용 — 화면은 주지 않는다): 처음부터 가진 유물(열린 것 중, RELIC.max까지). 판에서는 대왕 보스 뒤에만 얻는다 */
/* 개편 판의 구간 k 위협 덧배수 */
export const bldThreat = (k) => Math.pow(BUILD.thr.step, Math.max(0, k - BUILD.thr.from));
/* 개편 판의 앞 구간은 위협을 '실제 강화(fire)'의 화력으로 만든다(기준은 ENDLESS.fire) — 강화가 높아도 처음 보스·좀비가 같은 시간을 버틴다(가만히 서 있는 분대가 첫 보스를 넘지 못한다).
   BUILD.early구간에 걸쳐 기준으로 돌아간다(1구간 전부 → early구간에 0) — 그 뒤로는 강화가 높은 만큼 더 멀리 간다 */
export const bldFe = (k, fire) => ENDLESS.fire + Math.max(0, (fire | 0) - ENDLESS.fire) * BUILD.earlyK * clamp(1 - (Math.max(1, k) - 1) / BUILD.early, 0, 1);
const newBld = () => ({ sets: {}, crit: 0, gun: 0, chg: 0, dur: 0, shield: 0, armor: 0, shieldLeft: 0, spec: {}, down: [], rr: BUILD.reroll, rrn: 0, pi: 0, more: 0, curse: 0, rel: 0, pre: 0 });   // pre: 이 보스 뒤 카드 앞에 고른 장 수(유물·총 바꾸기)
export function newEndless(opt = {}) {
  const seed = (opt.seed >>> 0) || 1;
  const unl = Math.max(0, Math.min(CARD.stageMax, Math.floor(Number(opt.unl) || 0)));
  const flame = unl >= 1 && opt.flame === true;   // 화염병 줄(4단계): 첫 구간의 철창·금색 칸부터 화염병이 나온다
  const seg = buildSegment(seed, 1, opt.start ?? START_N, 0, 0, opt.build === 2 && unl >= 1 ? { ...(flame ? FLAME_ON : {}), fe: bldFe(1, opt.fire), bk: true } : flame ? FLAME_ON : null);
  const s = newGame(seg, opt);
  s.endless = { seed, seg: 1, bosses: 0, bank: 0, wait: 0, z0: 0 };
  // 보스 뒤 3택 1(opt.unl ≥ 1): 연 단계·별로 열린 탄종·고른 카드·지금 떠 있는 카드. 안 연 판에는 필드가 없다(해시 그대로)
  if (unl >= 1) {
    s.endless.unl = unl;
    s.endless.ammo = (Array.isArray(opt.ammoOpen) ? opt.ammoOpen : []).filter((a, i, l) => AMMO[a] && l.indexOf(a) === i);
    if (Array.isArray(opt.ammoStar)) s.endless.ammoStar = opt.ammoStar.filter((a, i, l) => AMMO[a] && l.indexOf(a) === i);   // 39.7: ★로 연 탄(출격 탄) — 판 안에는 다 나오고, 안 연 탄은 카드 무게 BUILD.fxLocked
    s.endless.picks = [];
    s.endless.offer = null;
    // 2단계(탄 효과·시너지): 효과마다 레벨 { 탄종: Lv }(해시는 AMMO_IDS 순서). 출격 탄종은 한 칸을 Lv2로 차지한다 — 대신 쪽은 s.ammo 그대로
    if (unl >= 2) { s.endless.fx = {}; if (s.ammo) s.endless.fx[s.ammo] = FX_BASE_LV; s.endless.obsSeen = []; }   // obsSeen: 이 판에서 알린 장애물 종류(처음 한 번씩)
    // 3단계(유물): 열린 유물 중 아는 것만 한 번씩(열리는 순서 그대로). 3단계 아래 판에는 필드가 없다
    // relics: 이 판에서 얻은 유물(얻은 순서), spent: 그중 써서 사라진 것(지금은 쓰는 유물이 없다 — 이어하기 호환) — 얻은 수(RELIC.max)에는 그대로 든다
    if (unl >= 3) {
      const e = s.endless;
      e.relicsOpen = relicList(opt.relicsOpen).filter((id) => opt.build === 2 || !RELICS[id].b2);   // 24절 새 유물은 개편 판에만(앞 단계 판의 상태·지문 그대로)
      e.relics = relicList(opt.relics).filter((id) => e.relicsOpen.includes(id)).slice(0, opt.build === 2 ? BUILD.relicMax : RELIC.max);
      e.spent = [];
    }
    // 따로 가는 줄(4단계 화염병 — 2회차 엔딩): 카드가 있는 판에만. 병과 뽑기(철창·금색 칸·특수병 카드 — spKindsOf)가 화염병까지 본다. 안 연 판에는 필드가 없다
    if (flame) s.endless.flame = true;
    // 빌드 개편(opt.build === 2 — ENDGAME.md 16절): 안 연 판에는 필드가 없다(앞 단계 지문 그대로)
    if (opt.build === 2) {
      s.endless.bld = newBld();
      const g = GUNS[opt.gun] ? opt.gun : 'rifle';   // 총 종류(21절): 출격 때 고른 총, Lv1 — 판 끝까지 그 총(48절: 총 바꾸기 없앰). gl = 총의 Lv, gp는 옛 필드(늘 '')
      Object.assign(s.endless.bld, { gt: g, gl: { [g]: 1 }, gp: '' });
      s.endless.n0 = s.squad.n;   // 34절 의무병 전설 '응급 수혈'의 기준(구간을 시작한 병력 — startSegmentB가 고친다)
      // 출격 보급품(27절 — 산 판에만 필드가 생긴다): legend = 남은 전설 보장 수, revive = 남은 부활 수
      const so = opt.supply || {};
      if (so.legend || so.revive) s.endless.sup = { legend: so.legend ? 1 : 0, revive: so.revive ? 1 : 0 };
    }
    if (s.endless.bld && s.hero && s.hero.id === 'mungchi') {   // 46.7: 개편 판은 집합 나팔(newGame이 첫 구간 칸에 건 빠르기)을 되돌린다
      const mul = heroVal('mungchi', 'pump', s.hero.lv);
      for (const row of s.rows) for (const c of row.cells) if (c.op === 'add') c.step *= mul;
    }
    if (s.endless.relics && s.endless.relics.length) relicSeg(s);   // 처음부터 가진 유물(시험·측정): 첫 구간에도 구간 규칙(확성기·코일·나침반·조준경)을 건다 — 개편 판인지 안 뒤에(24절: 개편 판은 대신이 없다)
  }
  s.refMul = seg.refMul;
  return s;
}
const relicList = (l) => (Array.isArray(l) ? l : []).filter((id, i, a) => typeof id === 'string' && RELICS[id] && a.indexOf(id) === i);

/* ---------- 무한모드 보스 뒤 3택 1(단계 해금 기획서 1단계) ----------
   보스가 쓰러지고 연출(ENDLESS.wait)이 끝나면 다음 구간이 시작되기 전에 카드가 뜬다. 고를 때까지 판은 멈춘다(step이 틱을 세지 않는다).
   - 카드는 모두 이미 게임에 있는 효과: 증원(병력 ×CARD.men) · 무기(+1단계) · 특수병(열린 병과 합류 또는 가진 병과 Lv+1, 철창 규칙 그대로) ·
     탄종 바꾸기(별로 열린 탄종 중 지금 것 빼고 하나).
   - 서로 다른 종류 CARD.count장. 어떤 카드(와 어느 병과·탄종)가 나올지는 시드와 구간 번호로 정해진다 — 다시 뽑기 없음, 숨은 난수 없음.
     그 순간 쓸모없는 카드는 나오지 않는다(병력 상한, 무기 3단계, 특수병 자리가 차고 모두 Lv3이거나 호위 병사가 모자람, 바꿀 탄종 없음).
   - 다음 구간은 고르기 전의 병력·무기 단계로 만든 뒤 카드를 적용한다 — 그래야 다음 구간의 게이트·적 숫자가 카드만큼 같이 부풀지 않는다.
   - 떠 있는 카드는 상태(s.endless.offer)에 있어 이어하기로 다시 열어도 같은 카드가 뜬다 */
export const CARD = {
  stageMax: 3,      // 지금 만든 해금 단계(1: 보스 뒤 3택 1 기본 카드, 2: 탄 효과·시너지·장애물, 3: 유물 — 5단계는 유물이 하나씩 더 열릴 뿐 같은 단계)
  count: 3,
  men: 1.3,         // 증원: 병력 × 1.3
  kinds: ['men', 'gun', 'unit', 'ammo'],   // 1단계(탄종 바꾸기 'ammo')
  kinds2: ['men', 'gun', 'unit', 'fx'],    // 2단계부터(탄종 바꾸기 대신 탄 효과 'fx')
};
/* 지금 상태에서 나올 수 있는 카드 종류와 그 대상(특수병 병과·탄종 후보) */
function cardPool(s) {
  const q = s.squad;
  const e = s.endless;
  const units = spKindsOf(s).filter((k) => {
    const m = q.sp.find((o) => o.k === k);
    return m ? (m.lv || 1) < spLvMax(s) : q.sp.length < spMax(s) && q.n >= spEscort(s) * (q.sp.length + 1);
  });
  const ammo = (e.ammo || []).filter((a) => a !== (s.ammo || ''));
  const kinds = CARD.kinds.filter((k) => (k === 'men' ? q.n < nMax(s) : k === 'gun' ? q.tier < tierMax(s) : k === 'unit' ? units.length > 0 : ammo.length > 0));
  return { kinds, units, ammo };
}
/* 카드 고르기: 대왕 보스 뒤(3단계 판)는 유물(relicOffer — 없으면 카드), 2단계를 연 판은 makeOffer2, 1단계 판은 예전 그대로(1단계 지문) */
const makeOffer = (s) => (s.endless.bld ? makeOfferB(s) : relicOffer(s) || (s.endless.fx ? makeOffer2(s) : makeOffer1(s)));
/* 1단계: 시드·구간 번호로 정한 순서에서 앞의 CARD.count장(보이는 순서는 CARD.kinds 순) */
function makeOffer1(s) {
  const e = s.endless;
  const g = { rs: hash(VERSION, 'card', e.seed >>> 0, e.seg) };
  const pool = cardPool(s);
  const order = pool.kinds.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand(g) * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  const u = pool.units.length ? pool.units[Math.floor(rand(g) * pool.units.length)] : '';
  const a = pool.ammo.length ? pool.ammo[Math.floor(rand(g) * pool.ammo.length)] : '';
  const pick = order.slice(0, CARD.count).sort((x, y) => CARD.kinds.indexOf(x) - CARD.kinds.indexOf(y));
  return pick.map((k) => (k === 'unit' ? { k, u } : k === 'ammo' ? { k, a } : { k }));
}
/* 카드 한 장이 바꾸는 값(화면이 '병력 142 → 185'처럼 적는다): { k, from, to, u?, a? } */
export function cardInfo(s, c) {
  const q = s.squad;
  if (!c) return null;
  const B = bldOf(s);
  if (B) {
    const o = cardInfoB(s, c, B);
    if (o && (o.k === 'unit' || o.k === 'fx' || o.k === 'gunlv') && o.n >= 2) { o.enhId = o.k === 'unit' ? o.u : o.k === 'fx' ? o.a : o.g; o.enh = o.n === 2 ? 'rare' : 'legend'; }   // 카드 등급 = 강화(roster.ENH — 총도)
    return o;
  }
  return cardInfoOld(s, c, q);
}
function cardInfoB(s, c, B) {
  const q = s.squad;
  {
    // 개편 판: n = 등급(한 번에 오르는 레벨 1·2·3)
    const n = Math.max(1, c.n | 0);
    if (c.k === 'gun') return { k: 'gun', from: q.tier, to: Math.min(tierMax(s), q.tier + n), n };   // 총 ★ — 무기 개조는 ★로 합쳐졌다
    if (c.k === 'curse') return { k: 'curse', mul: BUILD.curse.mul, more: BUILD.curse.more };
    if (c.k === 'gunlv') { const lv = (B.gl && B.gl[c.g]) || 1; return { k: 'gunlv', g: c.g, from: lv, to: awakeOn(s) ? lv + 1 : Math.min(BUILD.evo, lv + 1), n }; }   // 총 Lv(21.9)
    if (c.k === 'unit') {
      const m = q.sp.find((o) => o.k === c.u);
      const o = { k: 'unit', u: c.u, from: m ? m.lv || 1 : 0, to: m ? Math.min(spLvMax(s), (m.lv || 1) + 1) : 1, n };   // 레벨은 늘 +1 — 희귀·전설은 강화(enh)
      const cb = combosBy(s, c.u);
      if (cb.length) o.combos = cb;
      return o;
    }
    if (c.k === 'fx' && fxFull(s, c.a)) {   // 44절: 칸이 찼다 — 바꾼다(버릴 효과는 고를 때 정한다, 기본은 가장 낮은 레벨)
      const fx = fxOf(s), drops = AMMO_IDS2.filter((a) => fx[a]).map((a) => ({ a, lv: fx[a], to: Math.min(bldOf(s) && !awakeOn(s) ? BUILD.evo : Infinity, Math.floor(fx[a] * BUILD.fxSwap.keep) + 1) }));
      const o = { k: 'fx', a: c.a, from: 0, to: drops.length ? Math.min(...drops.map((d) => d.to)) : 1, n, full: true, drops }; const cb = combosBy(s, c.a); if (cb.length) o.combos = cb; return o;
    }
    if (c.k === 'fx') { const lv = fxLv(s, c.a); const o = { k: 'fx', a: c.a, from: lv, to: bldOf(s) && !awakeOn(s) ? Math.min(BUILD.evo, lv + 1) : lv + 1, n }; const cb = combosBy(s, c.a); if (cb.length) o.combos = cb; return o; }
  }
  if (c.k === 'relic') return RELICS[c.r] ? { k: 'relic', r: c.r } : null;
  return null;
}
function cardInfoOld(s, c, q) {
  if (c.k === 'men') return { k: 'men', from: q.n, to: Math.min(nMax(s), q.n + cardMen(q.n)) };
  if (c.k === 'gun') return { k: 'gun', from: q.tier, to: Math.min(tierMax(s), q.tier + 1) };
  if (c.k === 'unit') {
    const m = q.sp.find((o) => o.k === c.u);
    const o = { k: 'unit', u: c.u, from: m ? m.lv || 1 : 0, to: m ? Math.min(spLvMax(s), (m.lv || 1) + 1) : 1 };
    const cb = combosBy(s, c.u);   // 2단계 판: 이 특수병으로 켜지는 시너지(화면이 카드에 적는다 — 1단계 판은 늘 빈 목록이라 필드가 없다)
    if (cb.length) o.combos = cb;
    return o;
  }
  if (c.k === 'ammo') return { k: 'ammo', a: c.a, from: s.ammo || '', to: c.a };
  if (c.k === 'fx') { const lv = fxLv(s, c.a); const o = { k: 'fx', a: c.a, from: lv, to: lv + 1 }; const cb = combosBy(s, c.a); if (cb.length) o.combos = cb; return o; }
  if (c.k === 'relic') return RELICS[c.r] ? { k: 'relic', r: c.r } : null;   // 유물 카드(3단계): 글은 roster.js RELICS[r].text()·cost()
  return null;
}
const cardMen = (n) => Math.max(1, Math.round(n * (CARD.men - 1)));

/* ---------- 2단계: 탄 효과·탄종 상자·시너지(단계 해금 기획서 3절 — s.endless.fx가 있는 판에만) ----------
   - 탄 효과는 탄종의 좋은 점만(roster.js fxVal — Lv1·2·3 = 그 탄종 값의 50·100·150%). 출격 탄종은 Lv2로 한 칸을 차지하고 대신 쪽(s.ammo의 피해·사거리)을 그대로 진다.
   - 슬롯 FX_SLOTS칸. 같은 효과를 또 얻으면 레벨 +1(Lv3까지), 슬롯이 차면 가진 효과(Lv3 아래)만 더 얻는다.
   - 시너지(roster.js COMBOS)는 재료가 함께 있으면 켜진다(따로 저장하지 않는다 — 재료가 곧 상태). 켜지는 순간 'combo' 이벤트.
   - 1단계 판의 코드 경로(ammoHit·fire의 탄종 처리·makeOffer1)는 그대로 두고 따로 간다 — 부동소수 순서가 바뀌면 1단계 지문(STAGE1_FP)이 깨진다 */
/* 판 안 순서(기획서 2절 장치 2) — 다 연 사람도 처음 두 보스 뒤에는 기본 카드(증원·무기·특수병 합류/Lv+1·새 탄 효과)만 본다:
   up: 잡은 보스가 이만큼이 된 뒤의 카드부터 탄 효과 레벨 업·시너지를 완성하는 카드(탄종 상자 내용물도 같은 규칙),
   obstacle: 이 구간부터 장애물(기획서 4절), relic: 이 구간(대왕) 보스 뒤부터 유물(5절) — 장애물·유물은 그 단계를 만들 때 이 값을 본다 */
export const RUN_ORDER = { up: 3, obstacle: 4, relic: 6 };
export const FX_UP_FROM = RUN_ORDER.up;
export const FX_WORTH = 0.1;   // 봇이 보는 탄종 상자 하나 = 병력의 이만큼(특수병 한 명쯤)
export const fxOf = (s) => (s && s.endless && s.endless.fx) || null;
/* 빌드 개편(ENDGAME.md 16절)을 연 판의 빌드 상태(없으면 null — 앞 단계 판·캠페인은 예전 그대로):
   gun 무기 개조 레벨 · chg/dur 영웅 카드 · shield/armor 생존 카드 · shieldLeft 이번 구간에 남은 방패 · spec { 병과: 전문화 } · down 쓰러진 특수병 [{ k, lv }]
   rr 남은 다시 뽑기 · rrn 이번 카드에서 다시 뽑은 수 · pi 이번 보스 뒤 몇 번째 카드 · more 더 고를 카드 수 · curse 다음 구간 위협 배수 · rel 유물 카드를 볼 차례 */
export const bldOf = (s) => (s && s.endless && s.endless.bld) || null;
const comboIds = (s) => (bldOf(s) ? COMBO_IDS2 : COMBO_IDS);
/* 탄 효과의 그 레벨 값(개편 판은 fx2Val) */
export const fxV = (s, a, lv) => (bldOf(s) ? fx2Val(a, lv) : fxVal(a, lv));
/* 한 판 유물 수 */
export const relicMax = (s) => (bldOf(s) ? BUILD.relicMax : RELIC.max);
export const fxLv = (s, a) => { const fx = fxOf(s); return fx ? fx[a] | 0 : 0; };
/* 슬롯 수 — 넓은 탄낭(유물)이면 RELICS.pouch.slots */
export const fxSlots = (s) => (relicOn(s, 'pouch') ? (bldOf(s) ? BUILD.pouch : RELICS.pouch.slots) : FX_SLOTS);
const fxCount = (fx) => AMMO_IDS2.reduce((n, a) => n + (fx[a] ? 1 : 0), 0);
/* 이 판의 탄 목록: 개편 판은 일곱(24절 — 전격·부식·치료 더), 캠페인·앞 단계 판은 넷 */
export const ammoIds = (s) => (bldOf(s) ? AMMO_IDS2 : AMMO_IDS);
/* 효과 a를 지금 얻을 수 있나: 가진 효과면 늘(레벨 상한 없음), 새 효과면 빈 칸이 있을 때 */
/* 44절(개편 판): 칸이 다 찼어도 새 탄 효과 카드는 나온다 — 고르면 가진 효과 하나와 바꾼다(fxReplace) */
export function fxFull(s, a) { const fx = fxOf(s); return !!(fx && bldOf(s) && AMMO[a] && !fx[a] && fxCount(fx) >= fxSlots(s)); }
/* 바꿀 때 버릴 효과: 고른 것(drop)이 가진 효과면 그것, 아니면 가장 낮은 레벨(같으면 탄 순서) */
function fxDropOf(s, drop) {
  const fx = fxOf(s);
  if (drop && fx[drop]) return drop;
  let best = '';
  for (const a of AMMO_IDS2) if (fx[a] && (!best || fx[a] < fx[best])) best = a;
  return best;
}
/* 탄 효과 바꾸기: drop을 버리고 a를 Lv(drop) × keep(내림)으로 — 이어서 카드 몫 +1(fxAdd) */
function fxReplace(s, drop, a) {
  const fx = s.endless.fx, lv0 = fx[drop] | 0;
  const lv = Math.floor(lv0 * BUILD.fxSwap.keep);
  delete fx[drop];
  fx[a] = Math.min(bldOf(s) && !awakeOn(s) ? BUILD.evo - 1 : Infinity, lv);
  emit(s, { t: 'fxSwap', from: drop, fromLv: lv0, a, x: s.squad.x, z: s.squad.z });
}
export function fxCan(s, a) {
  const fx = fxOf(s);
  if (!fx || !AMMO[a]) return false;
  return fx[a] ? (!bldOf(s) || awakeOn(s) || fx[a] < BUILD.evo) : fxCount(fx) < fxSlots(s);   // 개편 판은 각성이 열리기 전 Lv5(진화)가 상한
}
/* 시너지 재료: 탄종 id = 그 탄 효과(출격 탄종이든 카드든), 병과 = 그 특수병(레벨 상관없이), 영웅 id = 출격 영웅 */
function hasPart(s, id) {
  if (AMMO[id]) return fxLv(s, id) > 0;
  if (SP[id]) return s.squad.sp.some((m) => m.k === id);
  return !!(s.hero && s.hero.id === id);
}
export const comboOn = (s, id) => !!fxOf(s) && (bldOf(s) ? COMBO_IDS2.includes(id) : !COMBOS[id].g2) && (COMBOS[id].need.every((x) => hasPart(s, x)) || comboHalf(s, id));   // 개편 판은 짝 넷 + 영웅 짝, 앞 단계 판은 여섯
export const combosOn = (s) => (fxOf(s) ? comboIds(s).filter((id) => comboOn(s, id)) : []);
/* 공명기(24절): 수치가 있는 짝(COMBO_HALF)은 재료가 하나 모자라도 반의 힘으로 켜진다 */
export const COMBO_HALF = ['rapidRocket', 'burstFlame', 'rapidMungchi', 'cureMedic'];
function comboHalf(s, id) { return !!bldOf(s) && relicOn(s, 'resonator') && COMBO_HALF.includes(id) && COMBOS[id].need.filter((x) => !hasPart(s, x)).length === 1; }
/* 짝 효과의 세기 배수: 보통 1, 공명기면 다 갖춘 짝 ×v · 하나 모자란 짝 ×half */
export function comboK(s, id) { if (!bldOf(s) || !relicOn(s, 'resonator')) return 1; return COMBOS[id].need.every((x) => hasPart(s, x)) ? RELICS.resonator.v : RELICS.resonator.half; }
/* 일시정지 '시너지' 칸(ENDGAME.md 23.7): 이 판의 짝마다 가진 재료·모자란 재료 */
export function comboParts(s, id) { const need = COMBOS[id].need; return { have: need.filter((x) => hasPart(s, x)), miss: need.filter((x) => !hasPart(s, x)) }; }
export const comboList = (s) => comboIds(s);
/* 재료 id를 얻으면 새로 켜지는 시너지들(이미 가졌으면 없다) */
function combosBy(s, id) {
  if (!fxOf(s) || hasPart(s, id)) return [];
  return comboIds(s).filter((c) => COMBOS[c].need.includes(id) && COMBOS[c].need.every((x) => x === id || hasPart(s, x)));
}
const comboEmit = (s, ids, x, z) => { for (const id of ids) emit(s, { t: 'combo', id, x: x ?? s.squad.x, z: z ?? s.squad.z }); };
/* 탄 효과 a를 얻는다(레벨 +1) — 부르는 쪽이 fxCan을 확인한다 */
function fxAdd(s, a, via, x, z) {
  const fx = s.endless.fx;
  const on = combosBy(s, a);
  fx[a] = (fx[a] | 0) + 1;
  emit(s, { t: 'fxUp', a, lv: fx[a], via, x: x ?? s.squad.x, z: z ?? s.squad.z });
  comboEmit(s, on, x, z);
}
function shuffle(g, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(g) * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
/* 2단계의 카드 후보: 증원·무기·특수병(1단계 그대로) + 탄 효과(별로 열린 탄종과 출격 탄종 중 지금 얻을 수 있는 것).
   up(3구간 보스 뒤)이 아니면 효과는 새것만, 새 시너지를 켜는 특수병·효과는 뺀다 */
function cardPool2(s) {
  const q = s.squad;
  const e = s.endless;
  const up = e.bosses >= FX_UP_FROM;
  const calm = (id) => up || !combosBy(s, id).length;
  const units = spKindsOf(s).filter((k) => {
    const m = q.sp.find((o) => o.k === k);
    return (m ? (m.lv || 1) < spLvMax(s) : q.sp.length < spMax(s) && q.n >= spEscort(s) * (q.sp.length + 1)) && calm(k);
  });
  const fx = ammoIds(s).filter((a) => ((e.ammo || []).includes(a) || s.ammo === a) && fxCan(s, a) && (up || !e.fx[a]) && calm(a));
  // 넓은 탄낭(유물)의 대신 쪽: 증원 카드가 나오지 않는다
  const kinds = CARD.kinds2.filter((k) => (k === 'men' ? q.n < nMax(s) && !relicOn(s, 'pouch') : k === 'gun' ? q.tier < tierMax(s) : k === 'unit' ? units.length > 0 : fx.length > 0));
  return { kinds, units, fx, up };
}
/* 2단계 카드: 범주(증원·무기·특수병·탄 효과) 중 서로 다른 것을 시드 순서로 CARD.count개(1단계와 범주 분포가 같다), 범주가 모자라면 다른 탄 효과로 채운다.
   3구간 보스 뒤에는 특수병·탄 효과의 대상을 고를 때 시너지를 켜는 것을 먼저 고르고 카드에 syn 표시(화면: 금빛 테두리) */
function makeOffer2(s) {
  const e = s.endless;
  const g = { rs: hash(VERSION, 'card', e.seed >>> 0, e.seg) };
  const pool = cardPool2(s);
  const count = cardCount(s);   // 수집가의 가방(유물)이면 2장
  const kinds = shuffle(g, pool.kinds.slice()).slice(0, count);
  const syn = (id) => pool.up && combosBy(s, id).length > 0;
  const rank = (list) => { const l = shuffle(g, list.slice()); return [...l.filter(syn), ...l.filter((x) => !syn(x))]; };
  const units = rank(pool.units);
  const fxs = kinds.includes('fx') ? rank(pool.fx).slice(0, Math.min(pool.fx.length, 1 + count - kinds.length)) : [];
  const mark = (c, id) => (syn(id) ? { ...c, syn: true } : c);
  const out = [];
  for (const k of CARD.kinds2) {
    if (!kinds.includes(k)) continue;
    if (k === 'unit') out.push(mark({ k, u: units[0] }, units[0]));
    else if (k === 'fx') for (const a of AMMO_IDS) { if (fxs.includes(a)) out.push(mark({ k, a }, a)); }
    else out.push({ k });
  }
  return out;
}
/* 탄종 상자: 무기 단계가 이미 3이면 이번 구간의 무기 강화 상자(갈림길 보상 상자·열쇠 상자 포함)가 탄종 상자로 — 내용물(탄 효과 하나)은
   지금 시드로 정해 상자에 싣는다(reward.a — 화면이 상자 위에 아이콘으로 띄운다, 부수기 전에 고른다). 후보는 카드와 같다(열린 탄종·슬롯·판 안 순서).
   얻을 수 있는 효과가 없으면 그대로 무기 상자(3단계라 병사로). 고른 카드가 들은 뒤(구간이 시작되는 순간)의 상태로 정한다 */
function fxCrates(s) {
  const e = s.endless;
  if (!e.fx || s.squad.tier < tierMax(s)) return;   // 과부하 코일(유물)이면 4단계가 된 뒤부터
  const pool = cardPool2(s).fx;
  if (!pool.length) return;
  const g = { rs: hash(VERSION, 'fxcrate', e.seed >>> 0, e.seg) };
  for (const p of s.props) if (p.kind === 'crate' && p.reward && p.reward.type === 'gun') p.reward = { type: 'fx', a: pool[Math.floor(rand(g) * pool.length)] };
}
/* ---------- 3단계·5단계: 유물(단계 해금 기획서 5절 — s.endless.relics가 있는 판(unl ≥ 3)에만) ----------
   - 대왕 구간(segInfo tag 'super' — 6·12·18…, RUN_ORDER.relic부터) 보스 뒤에 카드 대신 유물 카드 RELIC.show장 중 1장: 열린 유물 중 이 판에 아직 없는 것을
     시드·구간 번호로 정한 순서에서 앞의 것(보이는 순서는 RELIC_IDS 순). 남은 게 모자라면 그만큼, 없거나 이미 RELIC.max개면 보통 카드.
     그 판에서 좋은 점이 들 수 없는 유물(relicFits — 대신 쪽만 남는다)은 내지 않는다.
   - 유물은 수치가 아니라 규칙을 바꾼다(roster.js RELICS — 보이는 수치·글). 규칙은 relicOn(s, id)를 보는 곳들:
     나침반 relicSeg·forkPeek·openCrate, 주사위 relicAdd·보스 처치(다시 뽑기 횟수), 확성기 relicSeg, 코일 tierMax·relicSeg, 넷째 자리 spMax·spEscort,
     서약 spBack, 방패막 wardBlock(sawsUpdate·spitsUpdate), 가방 cardCount·eggP(화면), 탄낭 fxSlots·cardPool2.
   - 구간을 바꾸는 유물(확성기·코일·나침반)은 구간이 시작될 때 한 번 건다(relicSeg — 고른 카드·유물이 든 뒤, 탄종 상자를 정한 뒤).
     바뀐 숫자는 상태(덧셈 칸 step, 상자 reward)에 실려 이어하기로 다시 걸리지 않는다 */
export const RELIC = { max: 3, show: 3 };
export const relicsOf = (s) => (s && s.endless && s.endless.relics) || null;
/* 유물 id가 이 판에 켜져 있나(얻었고 아직 쓰지 않았다) */
export function relicOn(s, id) {
  const e = s && s.endless;
  return !!(e && e.relics && e.relics.includes(id) && !(e.spent && e.spent.includes(id)));
}
/* 적 변이(roster.MUTATIONS): 이 판에 쌓인 변이의 단계(0이면 없음). s.endless.mut = 나온 순서의 id 배열(같은 id가 또 나오면 2단계) */
export const mutLv = (s, id) => {
  const m = s && s.endless && s.endless.mut;
  if (!m) return 0;
  let n = 0;
  for (const x of m) if (x === id) n++;
  return Math.min(MUT_MAX_LV, n);
};
/* 대왕을 잡았다: 다음 바퀴의 변이를 시드·구간으로 정한다(직전과 같은 것은 빼고) — 'mutation' { id, lv } */
export function mutRoll(s) {
  const e = s.endless;
  if (!e.mut) e.mut = [];
  const last = e.mut[e.mut.length - 1];
  const left = MUT_IDS.filter((id) => id !== last);
  const g = { rs: hash(VERSION, 'mut', e.seed >>> 0, e.seg) };
  const id = left[Math.floor(rand(g) * left.length)];
  e.mut.push(id);
  if (s.stats) (s.stats.mutAt || (s.stats.mutAt = [])).push([e.seg + 1, id]);
  emit(s, { t: 'mutation', id, lv: mutLv(s, id), seg: e.seg + 1 });
}
/* 새 구간에 거는 변이: 장갑(일반 좀비 절반에 arm), 두꺼운 벽(벽·장갑문 체력). 떼거리는 구간을 만들 때(buildSegment opt.swarm), 질주·분노·독안개는 판 중(mutLv)에 본다 */
function mutSeg(s) {
  const arm = mutLv(s, 'armor'), thick = mutLv(s, 'thick');
  if (arm) {
    let i = 0;
    for (const f of s.foes) if ((f.kind === 'grunt' || f.kind === 'runner') && !f.elite && i++ % 2 === 0) f.arm = MUTATIONS.armor.v[arm - 1];
  }
  if (thick) for (const p of s.props) if (p.kind === 'wall' || p.kind === 'door') { p.hp = Math.round(p.hp * MUTATIONS.thick.v[thick - 1]); p.max = Math.round(p.max * MUTATIONS.thick.v[thick - 1]); }
}
/* 독안개: 길 가장자리에 서 있으면 병력이 초당 v씩 준다(1명이 안 되는 몫은 모아 둔다 — q.fogAcc) */
function fogUpdate(s) {
  const lv = mutLv(s, 'fog');
  if (!lv || Math.abs(s.squad.x) <= FOG_X || laneAt(s, s.squad.z)) return;   // 39.4: 칸막이 구간 안에서는 독안개가 없다(옆 칸이 독안개 안이라 갇힌다)
  const q = s.squad;
  q.fogAcc = (q.fogAcc || 0) + MUTATIONS.fog.v[lv - 1] * q.n * DT;
  if (q.fogAcc >= 1) { const k = Math.floor(q.fogAcc); q.fogAcc -= k; lose(s, k, 'fog', q.x, q.z); }
}
/* 무기 단계 상한(과부하 코일이면 RELICS.coil.tier — WEAPON의 끝 값) */
export function tierMax(s) {
  const coil = relicOn(s, 'coil');
  if (bldOf(s)) return Math.min(WEAPON.length - 1, (s.endless.seg >= STAR.lateFrom ? STAR.capLate : STAR.cap) - 1 + (coil ? 1 : 0));   // 개편 판: 총 ★ 상한
  return coil ? Math.min(WEAPON.length - 1, RELICS.coil.tier) : TIER_MAX;
}
/* 특수병 자리·호위 병사 수(넷째 자리면 RELICS.fourth) */
export const spMax = (s) => (relicOn(s, 'fourth') ? RELICS.fourth.slots : SP_MAX);
export const spEscort = (s) => (relicOn(s, 'fourth') && !bldOf(s) ? RELICS.fourth.escort : SP_ESCORT);   // 개편 판 유물에는 '대신'이 없다(24절)
/* 보스 뒤 카드 장 수(수집가의 가방이면 RELICS.bag.cards — 유물 카드 장 수는 그대로 RELIC.show) */
export const cardCount = (s) => (bldOf(s) ? CARD.count + (relicOn(s, 'loot') ? RELICS.loot.n : 0) : relicOn(s, 'bag') ? RELICS.bag.cards : CARD.count);   // 개편 판: 전리품 자루면 +1장
/* 대왕이 아닌 무한모드 보스를 잡을 때 펫 알이 나올 확률(뽑기는 화면 쪽 — 시뮬레이션 밖의 난수). 대왕은 늘 하나 */
export const eggP = (s) => (relicOn(s, 'bag') ? RELICS.bag.egg : EGG.pEndless);
/* 방패막(유물): 구간마다 톱날·독침의 피해를 한 번 막는다 — 그 구간에서 처음 닿은 톱날(닿아 있는 동안 계속)이나 처음 맞은 독침 중 먼저 온 것.
   막았으면 true('relicUse' { id: 'ward' }는 막기 시작한 순간 한 번), 아니면 false. 상태: e.wardAt(막은 구간 번호)·e.wardId(막은 것) */
function wardBlock(s, kind, id, x, z) {
  if (!relicOn(s, 'ward')) return false;
  const e = s.endless, key = kind + ':' + id;
  if (e.wardAt === e.seg) return kind === 'saw' && e.wardId === key;
  e.wardAt = e.seg;
  e.wardId = key;
  emit(s, { t: 'relicUse', id: 'ward', cause: kind, x, z });
  return true;
}
/* 갈림길 d의 보상 상자(위험한 쪽 — 철창이 됐을 수도) */
export function forkCrate(s, d) {
  for (const p of s.props) if (p.fork && (p.kind === 'crate' || p.kind === 'cage') && p.z > d.z0 && p.z < d.z1 && Math.sign(p.x0 + p.x1) === d.risk) return p;
  return null;
}
/* 나침반: 지금 속이 보이는 갈림길 보상 상자(갈림길 알림 'fork'가 뜬 틱부터 — 코 MARK_AHEAD(= RELICS.compass.ahead, 테스트가 본다) m 앞, 아직 부서지지·지나치지 않았으면).
   알림과 같은 틱이게 d.seen을 본다. 보통은 벽에 가려 가까이 가야 보인다(ARSENAL.md 8절) — 화면이 벽 위에 내용물을 띄운다. 없으면 null */
export function forkPeek(s, d) {
  if (!relicOn(s, 'compass') || !d || !d.seen) return null;
  const p = forkCrate(s, d);
  return p && p.alive && !p.passed ? p : null;
}
/* 사다리(24절): 칸막이·분리대를 밀고 있으면(push) 구간마다 한 번 넘는다. 넘었으면 true('relicUse' { id: 'ladder' }) */
function ladderUse(s, push) {
  const e = s.endless;
  if (!push || !e || !e.bld || !relicOn(s, 'ladder') || e.ladderAt === e.seg) return false;
  e.ladderAt = e.seg;
  emit(s, { t: 'relicUse', id: 'ladder', x: s.squad.x, z: s.squad.z });
  return true;
}
/* 화염병 줄(4단계 — 2회차 엔딩)을 연 무한모드 판인가 */
export const flameOn = (s) => !!(s && s.endless && s.endless.flame === true);
/* 이 판에서 나올 수 있는 병과(특수병 카드·이어하기가 보고, 넷째 자리 유물이 이 수를 본다). 화염병 줄을 연 판은 넷(SP_FLAME), 아니면 예전 셋(SP_KINDS — 같은 배열·같은 차례) */
export const spKindsOf = (s) => (flameOn(s) ? SP_FLAME : SP_KINDS);
/* 유물의 좋은 점이 이 판에서 들 수 있나(구현 판단 — 대신 쪽만 남는 유물은 카드로 내지 않는다):
   넷째 자리는 병과가 자리(SP_MAX)보다 많을 때만(같은 병과는 레벨이 오를 뿐이라 세 병과로는 넷째 자리가 늘 빈다 — 화염병 줄을 연 판(넷)에만 나온다),
   넓은 탄낭은 얻을 수 있는 탄 효과 종류(별로 열린 탄종 + 출격 탄종)가 슬롯(FX_SLOTS)보다 많을 때만 */
export function relicFits(s, id) {
  const e = s.endless;
  if (id === 'dice' || id === 'pledge' || (RELICS[id] && RELICS[id].b2)) return !!e.bld;   // 다시 뽑기·쓰러진 특수병의 복귀·24절 새 유물은 빌드 개편 판에만 있다
  if (id === 'bag') return !e.bld;   // 수집가의 가방(알 — 판 밖 보상)은 개편 판에 안 나온다(24절)
  if (id === 'fourth') return spKindsOf(s).length > SP_MAX;
  if (id === 'pouch') return ammoIds(s).filter((a) => (e.ammo || []).includes(a) || s.ammo === a).length > FX_SLOTS;
  return !!RELICS[id];
}
/* 대왕 보스 뒤의 유물 카드(아니면 null — 보통 카드) */
function relicOffer(s) {
  const e = s.endless;
  if (!e.relics || e.seg < RUN_ORDER.relic || segInfo(e.seg).tag !== 'super' || e.relics.length >= RELIC.max) return null;
  const left = e.relicsOpen.filter((id) => !e.relics.includes(id) && relicFits(s, id));
  if (!left.length) return null;
  const g = { rs: hash(VERSION, 'relic', e.seed >>> 0, e.seg) };
  const show = shuffle(g, left).slice(0, RELIC.show);
  return RELIC_IDS.filter((id) => show.includes(id)).map((r) => ({ k: 'relic', r }));
}
/* 유물 카드 r을 지금 얻을 수 있나(열렸고, 이 판에 없고, RELIC.max개 아래) */
const relicCan = (e, r) => !!(e.relics && RELICS[r] && e.relicsOpen.includes(r) && !e.relics.includes(r) && e.relics.length < (e.bld ? BUILD.relicMax : RELIC.max));
/* 유물 id를 얻는다: 'relic' 이벤트. 넷째 자리는 바로 호위 병사 규칙(4 → 6명)이 든다 — 모자라면 가장 늦게 온 특수병이 떠난다 */
function relicAdd(s, id) {
  const q = s.squad;
  s.endless.relics.push(id);
  emit(s, { t: 'relic', id, x: q.x, z: q.z });
  if (id === 'fourth') escort(s);
  if (id === 'dice' && s.endless.bld) s.endless.bld.rr += RELICS.dice.n;
}
/* 구간이 시작될 때 유물이 구간에 거는 규칙(한 구간에 한 번 — 고른 카드·유물이 든 뒤):
   확성기 — 덧셈 칸의 오르는 빠르기(−로 시작한 빨간 칸은 red배 빨리, 파란 칸은 blue배 — step을 나눈다. 역전한 칸도 처음 색대로),
   코일 — 지원병 상자(reward 'men')의 병력 × men,
   나침반 — 갈림길 위험한 쪽 보상 상자의 병사 × v(지원병 상자는 병력에 곱하고, 무기·탄종 상자와 철창은 mul — 얻을 수 없어 병사로 바뀔 때.
   무기 단계·탄 효과 레벨·특수병 합류는 한 칸이라 그대로). 병력 수는 상자에 실어 둔다(화면·봇이 보는 숫자 = 받는 숫자) */
function relicSeg(s) {
  const M = RELICS.megaphone, b2 = !!bldOf(s);
  if (relicOn(s, 'megaphone')) for (const row of s.rows) for (const c of row.cells) if (c.op === 'add') c.step /= c.v0 < 0 ? M.red : b2 ? 1 : M.blue;   // 개편 판: 파란 칸은 그대로('대신' 없음)
  if (relicOn(s, 'scope')) for (const row of s.rows) for (const c of row.cells) if (c.op === 'add') c.step /= RELICS.scope.v;   // 황금 조준경: 쏘아 올리는 폭 ×v
  const coil = relicOn(s, 'coil') && !b2, compass = relicOn(s, 'compass');
  if (!coil && !compass) return;
  const risky = new Set();
  if (compass) for (const d of s.divs || []) { const p = forkCrate(s, d); if (p) risky.add(p.id); }
  for (const p of s.props) {
    const r = p.reward;
    if (!r || !p.alive) continue;
    const k = (coil && r.type === 'men' ? RELICS.coil.men : 1) * (risky.has(p.id) ? RELICS.compass.v : 1);
    if (r.type === 'men' && k !== 1) r.v = Math.max(1, Math.round(r.v * k));
    else if (risky.has(p.id) && (r.type === 'gun' || r.type === 'fx' || r.type === 'unit')) r.mul = RELICS.compass.v;
  }
}
/* 지금 떠 있는 카드(없으면 null) */
export const offerOf = (s) => (s && s.endless && s.endless.offer) || null;
/* 카드 i를 고른다: 다음 구간을 만들어 이어 붙이고(고르기 전의 병력·무기 단계로) 카드를 적용한다. 고른 것이 없으면 false */
export function pickCard(s, i, opt) {
  const e = s.endless;
  if (!e || !e.offer || !e.offer.length) return false;
  if (e.bld) return pickCardB(s, i, opt);
  const c = e.offer[clamp(Math.floor(Number(i) || 0), 0, e.offer.length - 1)];
  s.ev.length = 0;
  e.offer = null;
  nextSegment(s);
  const q = s.squad;
  const info = cardInfo(s, c);
  if (c.k === 'men') gain(s, cardMen(q.n), q.x, q.z, 'card');
  else if (c.k === 'gun') q.tier = Math.min(tierMax(s), q.tier + 1);
  else if (c.k === 'unit') addSpecial(s, c.u, 'card', q.x, q.z);
  else if (c.k === 'ammo') s.ammo = c.a;
  else if (c.k === 'fx' && fxCan(s, c.a)) fxAdd(s, c.a, 'card', q.x, q.z);
  else if (c.k === 'relic' && relicCan(e, c.r)) relicAdd(s, c.r);
  e.picks.push(c.k === 'unit' ? 'unit:' + c.u : c.k === 'ammo' ? 'ammo:' + c.a : c.k === 'fx' ? 'fx:' + c.a : c.k === 'relic' ? 'relic:' + c.r : c.k);
  emit(s, { t: 'card', ...info, x: q.x, z: q.z });
  if (e.fx) fxCrates(s);
  if (e.relics) relicSeg(s);
  return true;
}
/* ---------- 빌드 개편(ENDGAME.md 16절 — s.endless.bld가 있는 판) ----------
   - 증원은 카드가 아니다: 보스를 잡으면 자동 보급(BUILD.supply). 카드는 모두 오래 남는 빌드 카드 —
     무기 개조(화력 ×1.12, 상한 없음) · 탄 효과(Lv5 진화) · 특수병(Lv3 전문화) · 영웅(충전·지속) · 생존(게이트 방패·방탄복).
   - 등급 n(일반·희귀·전설 = 한 번에 +1·+2·+3레벨). 정예·대왕 보스 뒤는 희귀부터, 대왕 뒤 첫 장은 전설.
   - 정예·대왕 보스 뒤(BUILD.relicFrom 구간부터)는 유물을 먼저 고르고 이어서 카드. 유물은 BUILD.relicMax개까지.
   - 다시 뽑기(rerollCards): 판마다 BUILD.reroll번, 대왕을 잡으면 +1. 시드·구간·몇 번째 카드·다시 뽑은 수로 정해진다(숨은 난수 없음).
   - 위험한 계약: 다음 구간 위협 ×mul, 대신 카드를 more장 더 고른다.
   - 다음 구간은 카드를 다 고른 뒤 만든다 — 개편 판의 카드는 위협 식(병력·무기 단계)에 들지 않는다 */
function rarityOf(r, tag, seg = 1) {
  const P = tag ? BUILD.tagRare[tag] : BUILD.rare;
  const up = Math.min(BUILD.legendMax, BUILD.legendUp * Math.max(0, seg - 6));   // 후반일수록 전설 확률이 오른다(일반에서 — 정예·대왕 첫 장은 희귀에서)
  const c = Math.max(0, P[0] - (P[0] > 0 ? up : 0)), rr = P[1] - (P[0] > 0 ? 0 : up);
  return r < c ? 1 : r < c + rr ? 2 : 3;
}
/* 시험용: 지금 정예·대왕 뒤라면 뜰 유물 카드(개편 판) */
export const relicOfferFor = (s) => relicOfferB(s);
function relicOfferB(s) {
  const e = s.endless, B = e.bld;
  if (!e.relics || e.seg < BUILD.relicFrom || !segInfo(e.seg).tag || e.relics.length >= BUILD.relicMax) return null;
  const left = e.relicsOpen.filter((id) => !e.relics.includes(id) && relicFits(s, id));
  if (!left.length) return null;
  const g = { rs: hash(VERSION, 'relic', e.seed >>> 0, e.seg, B.rrn) };
  const show = [], per = {};   // 같은 갈래는 둘까지(24절 — 고르기가 '어느 방향으로 갈까'가 되게)
  for (const id of shuffle(g, left)) { const tr = RELICS[id].tribe || id; if ((per[tr] | 0) >= 2) continue; per[tr] = (per[tr] | 0) + 1; show.push(id); if (show.length >= RELIC.show) break; }
  return RELIC_IDS.filter((id) => show.includes(id)).map((r) => ({ k: 'relic', r }));
}
function makeOffer3(s) {
  const e = s.endless, B = e.bld, q = s.squad;
  const g = { rs: hash(VERSION, 'card3', e.seed >>> 0, e.seg, B.pi, B.rrn) };
  const gr = { rs: hash(VERSION, 'rarity', e.seed >>> 0, e.seg, B.pi) };   // 등급은 다시 뽑기와 상관없이 자리마다 정해진다(다시 뽑기로 전설을 낚지 못하게 — ENDGAME.md 20절)
  const tag = segInfo(e.seg).tag;
  const count = cardCount(s);
  const out = [];
  // 전문화: Lv3이 된 특수병(아직 안 고른 것 — 먼저 온 순서)의 두 갈래가 함께 나온다
  const W = BUILD.w;
  const cands = q.tier < tierMax(s) ? [{ c: { k: 'gun' }, w: W.gun }] : [];   // 총 ★ 상한이면 총 카드는 안 나온다
  if (gunLvCan(s)) cands.push({ c: { k: 'gunlv', g: B.gt }, w: W.gun * (q.tier < tierMax(s) ? 1 : 2) });   // 총 Lv(21.9 — 그 총의 능력). ★이 상한이면 그 몫까지
  for (const k of spKindsOf(s)) {
    const m = q.sp.find((o) => o.k === k);
    if (m) cands.push({ c: { k: 'unit', u: k }, w: W.unit * BUILD.own });
    else if (q.sp.length < spMax(s) && q.n >= spEscort(s) * (q.sp.length + 1)) cands.push({ c: { k: 'unit', u: k }, w: W.unit });
  }
  if (e.fx) for (const a of ammoIds(s)) if (((e.ammo || []).includes(a) || s.ammo === a) && fxCan(s, a)) cands.push({ c: { k: 'fx', a }, w: W.fx * (e.fx[a] ? BUILD.own : 1) * (e.ammoStar && !e.ammoStar.includes(a) && !e.fx[a] ? BUILD.fxLocked : 1) });
    else if (((e.ammo || []).includes(a) || s.ammo === a) && fxFull(s, a)) cands.push({ c: { k: 'fx', a }, w: W.fx * BUILD.fxSwap.w * (e.ammoStar && !e.ammoStar.includes(a) ? BUILD.fxLocked : 1) });   // 44절: 칸이 차도 새 탄 효과(고르면 바꾼다)
  for (let j = cands.length - 1; j >= 0; j--) if (!(cands[j].w > 0)) cands.splice(j, 1);
  let first = true;
  const lastPick = e.picks && e.picks.length ? e.picks[e.picks.length - 1] : '';
  const firstOffer = B.pi === (B.pre | 0);   // 이 보스 뒤 첫 카드(유물·총 바꾸기를 먼저 골랐으면 그다음)
  let tagIdx = -1;   // 희귀 보장을 받은 장의 자리(총 바꾸기 카드가 그 자리를 덮지 않게)
  void lastPick;
  while (out.length < count && cands.length) {
    let sum = 0;
    for (const o of cands) sum += o.w;
    let r = rand(g) * sum, j = 0;
    while (j < cands.length - 1 && r >= cands[j].w) { r -= cands[j].w; j++; }
    const c = cands.splice(j, 1)[0].c;
    const rr = rand(gr);   // 자리마다 하나씩 굴린다 — 총 카드도 굴려서 자리가 밀리지 않게
    const useTag = first && firstOffer && c.k !== 'gun';   // 정예·대왕 뒤 첫 카드의 첫 (총이 아닌) 장만 희귀 이상
    if (useTag) { first = false; tagIdx = out.length; }
    c.n = c.k === 'gun' ? 1 + (tag ? 1 : 0) : rarityOf(rr, useTag ? tag : '', e.seg);   // 총 카드는 ★ +1(정예·대왕 뒤 +2) — 강화가 없다. 정예·대왕 뒤 첫 카드의 첫 장(총이 아닌)만 희귀 이상(tagRare)
    const id = c.k === 'unit' ? c.u : c.k === 'fx' ? c.a : '';
    if (id && combosBy(s, id).length) c.syn = true;
    out.push(c);
  }
  // 풍요 구간(39.6 ⑤ — 41절): 그 구간 보스 뒤 첫 카드에서 강화가 있는 장 하나는 희귀 이상(굴림은 그대로)
  if (firstOffer && e.mood === 'rich' && MOOD.rich.rare) { const c = out.find((o) => (o.k === 'unit' || o.k === 'fx' || o.k === 'gunlv') && (o.n | 0) < 2); if (c) { c.n = 2; c.rich = 1; } }
  // 전설 보급(27절): 강화가 있는 장(특수병·탄 효과·총 Lv) 하나를 전설로 — 굴림은 그대로(지문이 밀리지 않게), 고르면 보장이 줄어든다(pickCardB)
  if (e.sup && e.sup.legend > 0) { const c = out.find((o) => (o.k === 'unit' || o.k === 'fx' || o.k === 'gunlv') && (o.n | 0) < 3); if (c) { c.n = 3; c.sup = 1; } }
  // 위험한 계약: 이 보스 뒤 첫 카드에만, 마지막 장 자리에
  const curse = rand(g) < BUILD.curse.p;
  if (curse && B.pi === 0 && !B.curse && e.bosses >= BUILD.curse.from && out.length >= 2 && out[out.length - 1].k !== 'spec') out[out.length - 1] = { k: 'curse' };
  return out;
}
function makeOfferB(s) {
  const B = s.endless.bld;
  if (B.rel) { const r = relicOfferB(s); if (r) return r; B.rel = 0; }
  return makeOffer3(s);
}
/* 다시 뽑기: 떠 있는 카드(유물 카드도)를 다른 것으로. 남은 횟수가 없으면 false */
export function rerollCards(s) {
  const B = bldOf(s);
  if (!B || !s.endless.offer || B.rr <= 0) return false;
  if (s.endless.offer[0] && s.endless.offer[0].pend) return false;   // 총 바꾸기 고르기는 다시 뽑지 않는다
  B.rr--; B.rrn++;
  const of = makeOffer(s);
  if (!of.length) { B.rr++; B.rrn--; return false; }
  s.endless.offer = of;
  return true;
}
export const rerollsOf = (s) => { const B = bldOf(s); return B ? B.rr : 0; };
const pickName = (c) => (c.k === 'unit' ? 'unit:' + c.u : c.k === 'fx' ? 'fx:' + c.a : c.k === 'relic' ? 'relic:' + c.r : c.k === 'gunlv' ? 'gunlv:' + c.g : c.k === 'spec' ? 'spec:' + c.u + ':' + c.b : c.k === 'hero' ? 'hero:' + c.h : c.k === 'guard' ? 'guard:' + c.g : c.k);
/* 카드 등급 n(2 희귀·3 전설)이면 대상 id의 강화 하나를 더 쌓는다 */
function enhAdd(B, id, n) {
  if (n < 2 || !ENH[id]) return;
  if (!B.enh) B.enh = {};
  const e = B.enh[id] || (B.enh[id] = { r: 0, l: 0 });
  if (n === 2) e.r++; else e.l++;
}
/* 훈련 교본(24절): 같은 대상을 every번 고를 때마다 한 레벨 더(교본을 쥔 뒤부터 센다 — B.pn) */
function manualPick(s, B, id, more) {
  if (!relicOn(s, 'manual')) return;
  if (!B.pn) B.pn = {};
  B.pn[id] = (B.pn[id] | 0) + 1;
  if (B.pn[id] % RELICS.manual.every) return;
  more();
  emit(s, { t: 'relicUse', id: 'manual', what: id, x: s.squad.x, z: s.squad.z });
}
function pickCardB(s, i, opt) {
  const e = s.endless, B = e.bld, q = s.squad;
  const c = e.offer[clamp(Math.floor(Number(i) || 0), 0, e.offer.length - 1)];
  if (e.sup && e.sup.legend > 0 && e.offer.some((o) => o.sup)) e.sup.legend--;   // 전설 보급은 그 카드를 띄운 묶음에서 쓴 것으로
  s.ev.length = 0;
  e.offer = null;
  const info = cardInfo(s, c);
  const n = Math.max(1, c.n | 0);
  let again = false;
  if (c.k === 'gun') q.tier = Math.min(tierMax(s), q.tier + n);   // 총 ★ +n(상한까지)
  else if (c.k === 'unit') { addSpecial(s, c.u, 'card', q.x, q.z); enhAdd(B, c.u, n); manualPick(s, B, c.u, () => { if ((spLv(q, c.u) || 0) < spLvMax(s)) addSpecial(s, c.u, 'card', q.x, q.z); }); }   // 레벨 +1, 희귀·전설이면 강화(등급은 레벨 수가 아니라 강화)
  else if (c.k === 'fx') { if (fxFull(s, c.a)) { const d = fxDropOf(s, opt && opt.drop); if (d) fxReplace(s, d, c.a); }   // 44절: 칸이 찼으면 opt.drop(없으면 가장 낮은 레벨)과 바꾼다
    if (fxCan(s, c.a)) fxAdd(s, c.a, 'card', q.x, q.z); enhAdd(B, c.a, n); manualPick(s, B, c.a, () => { if (fxCan(s, c.a)) fxAdd(s, c.a, 'card', q.x, q.z); }); }
  else if (c.k === 'curse') { B.curse = BUILD.curse.mul; B.more += BUILD.curse.more; }
  else if (c.k === 'relic') { if (relicCan(e, c.r)) relicAdd(s, c.r); B.rel = 0; B.pre = (B.pre | 0) + 1; again = true; }
  else if (c.k === 'gunlv') { if (!B.gl) B.gl = {}; B.gl[c.g] = info.to; enhAdd(B, c.g, n); manualPick(s, B, c.g, () => { B.gl[c.g]++; }); }   // 총 Lv +1, 희귀·전설이면 총 강화
  e.picks.push(pickName(c));
  emit(s, { t: 'card', ...info, x: q.x, z: q.z });
  if (!again && B.more > 0) { B.more--; again = true; }
  if (again) {
    B.pi++; B.rrn = 0;
    const of = makeOffer(s);
    if (of.length) { e.offer = of; emit(s, { t: 'offer', n: of.length, seg: e.seg, more: true }); return true; }
  }
  startSegmentB(s);
  return true;
}
/* 개편 판의 다음 구간: 계약의 위협 배수로 만들고, 자동 보급을 주고, 게이트 방패를 채운다 */
function startSegmentB(s) {
  const e = s.endless, B = e.bld, q = s.squad;
  const add = segSupply(e.seg);   // 방금 잡은 보스의 구간 기준(51절 — 지금 병력과 상관없는 절대치)
  nextSegment(s);
  B.curse = 0; B.more = 0; B.pi = 0; B.rrn = 0; B.rel = 0; B.pre = 0;
  gain(s, add, q.x, q.z, 'supply');
  emit(s, { t: 'supply', n: add, x: q.x, z: q.z });
  e.n0 = q.n;   // 34절 의무병 전설 '응급 수혈'의 기준(이 구간을 시작한 병력)
  if (e.fx) fxCrates(s);
  if (e.relics) relicSeg(s);
}
/* 쓰러진 특수병이 돌아온다(보스를 잡은 뒤 — 카드가 뜨기 전): 레벨은 BUILD.spBack 몫(최소 Lv1), 자리·호위 병사가 되면 */
function spBack(s) {
  const B = s.endless.bld, q = s.squad;
  const down = B.down;
  B.down = [];
  for (const d of down) {
    if (q.sp.some((m) => m.k === d.k) || q.sp.length >= spMax(s) || q.n < spEscort(s) * (q.sp.length + 1)) continue;
    const back = relicOn(s, 'pledge') ? 1 : BUILD.spBack;   // 부활 서약(유물): 제 레벨로
    const lv = Math.max(1, Math.floor(d.lv * back));
    q.sp.push({ id: s.nextId++, k: d.k, cd: 0.6, lv });
    emit(s, { t: 'spGet', k: d.k, via: 'back', lv, x: q.x, z: q.z });
  }
}
const OBS_ON = { obs: true }, FLAME_ON = { flame: true }, OBS_FLAME = { obs: true, flame: true };
/* 구간을 만드는 옵션: 2단계를 연 판만 장애물(4구간부터), 화염병 줄을 연 판만 철창·금색 칸에 화염병. 둘 다 없으면 null(예전 그대로) */
const segOpt = (e) => (e.unl >= 2 ? (e.flame ? OBS_FLAME : OBS_ON) : e.flame ? FLAME_ON : null);
/* 보스가 쓰러진 뒤: 지나간 것을 버리고 다음 구간을 지금 자리 앞에 이어 붙인다(상태가 커지지 않는다) */
function nextSegment(s) {
  const q = s.squad;
  const e = s.endless;
  e.seg++;
  // 개편 판: 위협 배수 = 계약(curse) × 빌드가 쌓이는 만큼 더 가파른 곡선(BUILD.thr — from구간 뒤로 구간마다 ×step)
  const seg = buildSegment(e.seed, e.seg, q.n, q.tier, 0, e.bld ? { ...(segOpt(e) || {}), mul: (e.bld.curse > 1 ? e.bld.curse : 1) * bldThreat(e.seg), fe: bldFe(e.seg, s.fireLv), bk: true, terrain: true, ...(relicOn(s, 'lucky') ? { luckP: RELICS.lucky.p } : {}), swarm: mutLv(s, 'swarm') ? MUTATIONS.swarm.n[mutLv(s, 'swarm') - 1] : 1, swarmHp: mutLv(s, 'swarm') ? MUTATIONS.swarm.hp[mutLv(s, 'swarm') - 1] : 1 } : segOpt(e));
  if (seg.mood) e.mood = seg.mood; else delete e.mood;   // 구간 성격(39.6)
  const dz = q.z + ENDLESS.lead;
  const off = s.nextId;
  for (const r of seg.rows) { r.id += off; r.z += dz; }
  for (const f of seg.foes) { f.id += off; f.z += dz; if (f.row) f.row += off; }   // 게이트 도둑(46.6)은 노리는 줄 id도
  for (const pr of seg.props) { pr.id += off; if (pr.lg) pr.lg += off; pr.z += dz; }
  for (const w of seg.saws) { w.id += off; w.z += dz; }
  for (const m of seg.marks) m.z += dz;
  if (seg.divs && seg.divs.length) { for (const d of seg.divs) { d.id += off; if (d.wall) d.wall += off; d.z0 += dz; d.z1 += dz; } s.divs = seg.divs; } else delete s.divs;
  if (seg.pads && seg.pads.length) { for (const o of seg.pads) { o.id += off; o.z += dz; } s.pads = seg.pads; } else delete s.pads;   // 가속 발판(46.1)
  if (seg.zones && seg.zones.length) { for (const o of seg.zones) { o.id += off; o.z0 += dz; o.z1 += dz; } s.zones = seg.zones; } else delete s.zones;   // 특별 구간(46.3)
  if (seg.lanes && seg.lanes.length) { for (const l of seg.lanes) { l.id += off; l.z0 += dz; l.z1 += dz; for (const o of l.open) { o[1] += dz; o[2] += dz; } } s.lanes = seg.lanes; } else delete s.lanes;   // 칸막이 구간(22절)
  s.nextId = off + seg.nextId + 1;
  s.rows = seg.rows; s.foes = seg.foes; s.props = seg.props; s.saws = seg.saws; s.marks = seg.marks;
  s.spits = []; s.rockets = [];
  if (e.mut) mutSeg(s);
  delete s.pools;
  delete s.flames;   // 불 지대(화염병)도 지나간 것과 함께
  s.L = seg.L; s.params = seg.params; s.speed = seg.speed;
  s.arenaZ = seg.arenaZ + dz; s.stopZ = s.arenaZ + 6;
  s.bossHp = seg.bossHp; s.bossRef = seg.arrive; s.refFire = e.bld ? seg.fireE : ENDLESS.fire; s.refMul = seg.refMul;
  s.boss = null;
  s.phase = 'run';
  e.z0 = q.z;
  e.wait = 0;
  const h = s.hero;
  if (h && h.id === 'mungchi' && !e.bld) {   // 46.7: 개편 판은 '집합 나팔'(덧셈 칸 빠르기) 대신 '돌격 대형'
    const mul = heroVal('mungchi', 'pump', h.lv);
    for (const row of s.rows) for (const c of row.cells) if (c.op === 'add') c.step /= mul;
  }
  emit(s, { t: 'segStart', seg: e.seg, L: s.L });
}
/* 무한모드 판이 끝났을 때(전멸·포기) 받는 코인: 적립한 보스 코인 + 처치 10마리당 1 (보급 강화 %) + 상자 코인 */
export function endlessCoins(s, bonusPct = 0) {
  const e = s.endless;
  if (!e) return 0;
  return Math.round((e.bank + Math.floor(s.stats.kills / 10)) * (1 + bonusPct / 100)) + s.stats.coins;
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
    hero: opt.hero && HEROES[opt.hero.id] ? { id: opt.hero.id, lv: Math.max(1, Math.min(HERO_LV_HARD, opt.hero.lv | 0 || 1)), charge: 0.35, act: 0, T: 0, cd: 0, shot: 0 } : null,
    rows: structuredClone(lv.rows),
    foes: structuredClone(lv.foes),
    props: structuredClone(lv.props),
    saws: structuredClone(lv.saws),
    marks: structuredClone(lv.marks || []),
    spits: [],
    bullets: [],
    boss: null,
    bossHp: lv.bossHp,
    bossRef: lv.arrive || lv.params.P,
    refFire: lv.fireE || 0,
    nextId: lv.nextId + 1,
    ev: [],
    stats: { kills: 0, killHp: 0, lost: 0, gained: 0, coins: 0, crates: 0, gates: 0, bossT: 0, spawned: start, healed: 0, spGot: 0, spLost: 0, heroUses: 0, healedAtArena: 0, spUp: 0, flips: 0, dmg: {}, kb: {}, lostBy: {}, death: null, spPk: {}, segs: [], cur: null, mutAt: [], luck: [0, 0, 0, 0], treasure: 0 },   // spPk·segs·cur·mutAt·luck·treasure: 플레이 기록 v2(39.10)   // dmg·kb·lostBy·death: 플레이 기록(32절 — 출처별 피해·처치, 무엇에 잃었나, 전멸한 곳). 해시에 안 든다
  };
  // 펫(ENDGAME.md 6절): 데려간 판에만 s.pet이 있다 — 펫 전용 난수 흐름(rs)을 따로 써서 판의 난수(s.rs)를 건드리지 않는다.
  // avg(별 기준을 재는 기준 봇용): 확률 대신 기대값으로 고르게 — par가 한 판의 운에 흔들리지 않게
  if (lv.divs && lv.divs.length) s.divs = structuredClone(lv.divs);   // 분리대(무한모드 갈림길 — 없는 판에는 필드도 없다)
  if (lv.lanes && lv.lanes.length) s.lanes = structuredClone(lv.lanes);   // 칸막이 구간(22절 — 개편 판만)
  if (lv.pads && lv.pads.length) s.pads = structuredClone(lv.pads);   // 가속 발판(46.1 — 개편 판만)
  if (lv.zones && lv.zones.length) s.zones = structuredClone(lv.zones);   // 특별 구간(46.3 — 개편 판만)
  // 탄종(ARSENAL.md 3절): 고른 판에만 s.ammo가 있다(보통탄이면 없다 — 해시 그대로)
  if (opt.ammo && AMMO[opt.ammo]) s.ammo = opt.ammo;
  // 여러 마리(opt.pets — 서로 다른 펫, PET_TEAM_MAX까지): 첫 마리는 s.pet(예전 그대로), 나머지는 s.pets — 한 마리 판에는 s.pets 필드가 없다(해시 그대로)
  const team = (Array.isArray(opt.pets) ? opt.pets : opt.pet ? [opt.pet] : []).filter((p, i, l) => p && PETS[p.id] && l.findIndex((o) => o && o.id === p.id) === i).slice(0, PET_TEAM_MAX);
  const mkPet = (p) => {
    const o = { id: p.id, lv: Math.max(1, Math.min(PET_MAX_LV, p.lv | 0 || 1)), rs: hash(lv.seed, 'pet', p.id) >>> 0, procs: 0, acc: 0 };
    if (opt.petAvg) o.avg = true;
    return o;
  };
  if (team.length) { s.pet = mkPet(team[0]); if (team.length > 1) s.pets = team.slice(1).map(mkPet); }
  if (s.hero) {
    const h = s.hero;
    if (h.id === 'mungchi') {
      // 패시브 '집합 나팔': 덧셈 게이트가 빨리 오른다 — 칸마다 한 번에 반영
      const mul = heroVal('mungchi', 'pump', h.lv);
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
  if (!Array.isArray(o.marks)) o.marks = [];
  if (!Array.isArray(q.sp)) q.sp = [];
  // SIM 8까지의 스냅숏에는 특수병 레벨이 없다(Lv1로 본다)
  for (const m of q.sp) m.lv = Math.max(1, Math.min(spLvMax(o), Number.isFinite(m.lv) ? Math.floor(m.lv) : 1));
  num0(q, ['pool', 'healAcc', 'recent', 'lossFrac']);
  if (o.stats && typeof o.stats === 'object') { num0(o.stats, ['spUp', 'flips']); for (const k of ['dmg', 'kb', 'lostBy']) if (!o.stats[k] || typeof o.stats[k] !== 'object') o.stats[k] = {}; if (o.stats.death && typeof o.stats.death !== 'object') o.stats.death = null; }   // 플레이 기록(32절)
  if (o.hero === undefined) o.hero = null;
  if (o.hero) num0(o.hero, ['charge', 'act', 'T', 'cd', 'shot']);
  if (o.boss) { num0(o.boss, ['bonus', 'stun']); if (o.boss.clash && !(o.boss.clashHp > 0)) o.boss.clashHp = o.boss.hp; }   // 넉백 셈(옛 스냅숏엔 없다)
  if (typeof o.refFire !== 'number') o.refFire = 0;
  if (o.pet) {
    if (typeof o.pet !== 'object' || !PETS[o.pet.id]) o.pet = undefined;
    else { num0(o.pet, ['rs', 'procs', 'acc']); if (!(o.pet.cdT > 0)) delete o.pet.cdT; o.pet.lv = Math.max(1, Math.min(PET_MAX_LV, o.pet.lv | 0 || 1)); }
  }
  if (o.pet == null) delete o.pet;
  if (o.pets !== undefined) {
    const more = o.pet && Array.isArray(o.pets) ? o.pets.filter((p, i, l) => p && typeof p === 'object' && PETS[p.id] && p.id !== o.pet.id && l.findIndex((x) => x && x.id === p.id) === i).slice(0, PET_TEAM_MAX - 1) : [];
    for (const p of more) { num0(p, ['rs', 'procs', 'acc']); if (!(p.cdT > 0)) delete p.cdT; p.lv = Math.max(1, Math.min(PET_MAX_LV, p.lv | 0 || 1)); }
    if (more.length) o.pets = more; else delete o.pets;
  }
  if (o.ammo != null && !AMMO[o.ammo]) delete o.ammo;   // 모르는 탄종이 든 스냅숏은 보통탄으로 이어진다
  if (o.endless) {
    if (typeof o.endless !== 'object') return null;
    num0(o.endless, ['seed', 'seg', 'bosses', 'bank', 'wait', 'z0']);
    if (o.endless.seg < 1) return null;
    const e = o.endless;
    // 3택 1을 안 연 판에 카드가 들어 있으면(손댄 저장) 버린다 — 남기면 step이 멈춘 채로 풀리지 않는다
    if (e.unl == null) { delete e.bld; delete e.offer; delete e.picks; delete e.ammo; delete e.fx; delete e.flame; delete e.relicsOpen; delete e.relics; delete e.spent; delete e.wardAt; delete e.wardId; delete e.mut; delete e.medicAt; delete e.obsSeen; } else {
      e.unl = Math.max(0, Math.min(CARD.stageMax, Math.floor(Number(e.unl) || 0)));
      // 빌드 개편 상태: 숫자는 0 이상 정수(curse만 배수), 전문화는 아는 병과·갈래만, 쓰러진 특수병은 아는 병과 한 번씩
      if (e.bld !== undefined) {
        if (!e.bld || typeof e.bld !== 'object') delete e.bld;
        else {
          const B = e.bld, nb = newBld();
          for (const k of Object.keys(nb)) if (typeof nb[k] === 'number') B[k] = k === 'curse' ? (B.curse > 1 && B.curse < 10 ? B.curse : 0) : k === 'crit' ? (B.crit >= 0 && B.crit < 2 ? B.crit : 0) : Math.max(0, Math.min(LV_SANE, Math.floor(Number(B[k]) || 0)));
          delete B.sets;   // 빌드 세트는 없어졌다(옛 저장의 값은 버린다)
          B.spec = {};   // 전문화 카드는 없어졌다(Lv5 고유 능력 — roster.SP_EVO). 옛 저장의 값은 버린다
          B.down = (Array.isArray(B.down) ? B.down : []).filter((d, i, l) => d && SP[d.k] && l.findIndex((x) => x && x.k === d.k) === i).map((d) => ({ k: d.k, lv: Math.max(1, Math.min(LV_SANE, Math.floor(Number(d.lv) || 1))) }));
        }
      }
      // 적 변이(개편 판만): 아는 id만, 나온 순서 그대로(같은 id가 또 나오면 2단계라 중복은 그대로 둔다)
      if (!Number.isFinite(e.medicAt)) delete e.medicAt;
      if (e.bld) {   // 총(21절): 아는 총만, Lv은 1 이상 정수, 지금 총은 Lv이 꼭 있다, 바꿀 총은 지금 총과 다른 아는 총만
        const B = e.bld, gl = B.gl && typeof B.gl === 'object' ? B.gl : {}, ok = {};
        B.gt = GUNS[B.gt] ? B.gt : 'rifle';
        for (const id of GUN_IDS) { const v = Math.floor(Number(gl[id]) || 0); if (v >= 1) ok[id] = Math.min(LV_SANE, v); }
        if (!ok[B.gt]) ok[B.gt] = 1;
        B.gl = ok;
        B.gp = '';   // 48절: 총 바꾸기를 없앴다 — 옛 저장의 '바꿀지 고를 총'은 버린다
      }
      if (e.bld) {   // 카드 강화: 아는 대상만 r·l 정수(0 이상)
        const en = e.bld.enh && typeof e.bld.enh === 'object' ? e.bld.enh : {}, ok = {};
        for (const id of Object.keys(ENH)) if (en[id] && typeof en[id] === 'object') { const r = Math.max(0, Math.min(LV_SANE, Math.floor(Number(en[id].r) || 0))), l = Math.max(0, Math.min(LV_SANE, Math.floor(Number(en[id].l) || 0))); if (r || l) ok[id] = { r, l }; }
        if (Object.keys(ok).length) e.bld.enh = ok; else delete e.bld.enh;
      }
      if (e.bld && Array.isArray(e.mut)) e.mut = e.mut.filter((id) => typeof id === 'string' && MUTATIONS[id]).slice(0, 120);
      else delete e.mut;
      for (const f of o.foes) if (f.arm !== undefined && !(typeof f.arm === 'number' && f.arm > 0 && f.arm <= 1)) delete f.arm;
      e.ammo = Array.isArray(e.ammo) ? e.ammo.filter((a) => AMMO[a]) : [];
      if (e.ammoStar !== undefined) { if (Array.isArray(e.ammoStar)) e.ammoStar = e.ammoStar.filter((a) => AMMO[a]); else delete e.ammoStar; }
      e.picks = Array.isArray(e.picks) ? e.picks.filter((x) => typeof x === 'string') : [];
      if (e.flame !== true) delete e.flame;
      // 3단계 유물: 열린 것·얻은 것은 아는 id만 한 번씩, 얻은 것은 RELIC.max개까지, 쓴 것(spent)은 얻은 것 중에서만(탄 효과 슬롯이 넓은 탄낭을 보므로 fx보다 먼저)
      if (e.unl >= 3) {
        e.relicsOpen = relicList(e.relicsOpen).filter((id) => e.bld || !RELICS[id].b2);
        e.relics = relicList(e.relics).slice(0, e.bld ? BUILD.relicMax : RELIC.max);
        if (e.bld && e.relics.includes('bag')) e.relics = e.relics.map((id) => (id === 'bag' ? (e.relics.includes('loot') ? '' : 'loot') : id)).filter(Boolean);   // 24절: 개편 판의 옛 수집가의 가방은 전리품 자루로 읽는다
        e.spent = relicList(e.spent).filter((id) => e.relics.includes(id));
        if (!(Number.isFinite(e.wardAt) && typeof e.wardId === 'string')) { delete e.wardAt; delete e.wardId; }
        for (const p of o.props) if (p.reward && p.reward.mul !== undefined && !(typeof p.reward.mul === 'number' && p.reward.mul > 0 && p.reward.mul < 10)) delete p.reward.mul;
      } else { delete e.relicsOpen; delete e.relics; delete e.spent; delete e.wardAt; delete e.wardId; }
      // 2단계 탄 효과: 아는 탄종만 Lv1 이상, 슬롯 수까지(AMMO_IDS 순서로 — 출격 탄종 먼저). 없으면 출격 탄종 Lv2에서 다시. 2단계 아래 판에는 없다
      if (e.unl >= 2) {
        const src = e.fx && typeof e.fx === 'object' && !Array.isArray(e.fx) ? e.fx : o.ammo ? { [o.ammo]: FX_BASE_LV } : {};
        const fx = {};
        for (const a of [o.ammo, ...(e.bld ? AMMO_IDS2 : AMMO_IDS)]) {
          const lv = Math.floor(Number(src[a]));
          if (AMMO[a] && !fx[a] && lv >= 1 && Object.keys(fx).length < fxSlots(o)) fx[a] = Math.min(LV_SANE, lv);
        }
        e.fx = fx;
        for (const p of o.props) if (p.reward && p.reward.type === 'fx' && !AMMO[p.reward.a]) p.reward = { type: 'gun' };
        for (const p of o.props) if (p.reward && p.reward.type === 'gunx') p.reward = { type: 'gun' };   // 48절: 옛 저장의 다른 총 상자는 보통 무기 상자로
        // 알린 장애물 종류: 아는 것만 한 번씩(없으면 빈 목록 — 다시 알린다)
        e.obsSeen = Array.isArray(e.obsSeen) ? e.obsSeen.filter((k, i, l) => OBSTACLE_IDS.includes(k) && l.indexOf(k) === i) : [];
      } else { delete e.fx; delete e.obsSeen; }
      if (e.sup) { if (e.bld && typeof e.sup === 'object') e.sup = { legend: clamp(e.sup.legend | 0, 0, 1), revive: clamp(e.sup.revive | 0, 0, 1) }; else delete e.sup; }   // 출격 보급품(27절)
      const kinds = e.fx ? CARD.kinds2 : CARD.kinds;
      const okRelic = (c) => relicCan(e, c.r);   // 유물 카드: 열린 것 중 아직 없는 것(RELIC.max개 아래)
      const okN = (c) => c.n === 1 || c.n === 2 || c.n === 3;
      const okCardB = (c) => c && typeof c === 'object' && (c.syn === undefined || c.syn === true) && (c.k === 'relic' ? okRelic(c) : c.k === 'curse' ? true
        : c.k === 'spec' ? false : !okN(c) ? false : c.k === 'gun' ? true : c.k === 'gunlv' ? !!(GUNS[c.g] && e.bld && c.g === e.bld.gt) : c.k === 'unit' ? spKindsOf(o).includes(c.u)
          : c.k === 'fx' ? !!(e.fx && AMMO[c.a]) : false);
      const okCard = e.bld ? okCardB : (c) => c && typeof c === 'object' && (c.k === 'relic' ? okRelic(c) : kinds.includes(c.k) && (c.k !== 'unit' || spKindsOf(o).includes(c.u)) && ((c.k !== 'ammo' && c.k !== 'fx') || !!AMMO[c.a]) && (c.syn === undefined || c.syn === true));
      if (e.offer != null && !(Array.isArray(e.offer) && e.offer.length && e.offer.every(okCard))) e.offer = null;
      if (e.offer == null) {
        e.offer = null;
        // 카드가 떠 있어야 할 자리(보스가 쓰러지고 연출이 끝남)인데 카드가 깨졌으면 그 자리에서 다시 만든다(같은 시드 → 같은 카드)
        if (e.unl >= 1 && o.boss && o.boss.dead && e.wait <= 0) { const of = makeOffer(o); e.offer = of.length ? of : null; }
      }
    }
  }
  for (const b of o.bullets) if (typeof b.hm !== 'number') b.hm = 1;
  // 화염병(4단계): 화염병 줄을 연 판에만 — 아닌 판(손댄 저장)의 화염병·불 지대는 버린다. 불 지대는 숫자가 성한 것만(남은 시간이 있는 것), 비면 필드도 없게
  if (!flameOn(o)) q.sp = q.sp.filter((m) => m.k !== 'flame');
  if (o.flames !== undefined) {
    const fl = flameOn(o) && Array.isArray(o.flames) ? o.flames.filter((f) => f && typeof f === 'object' && FLAME_KEYS.every((k) => typeof f[k] === 'number' && Number.isFinite(f[k])) && f.t > 0 && f.w > 0 && f.len > 0) : [];
    if (fl.length) o.flames = fl; else delete o.flames;
  }
  return o;
}
const FLAME_KEYS = ['id', 'x', 'z', 'w', 'len', 't', 'T', 'd', 'lv'];

function emit(s, e) { s.ev.push(e); }

/* 병사를 잃는다. 게이트·톱날이 아닌 손실은 보리 스킬로 줄고, 일부는 회복 풀(의무병·보리)로 간다.
   한 번에 크게 맞거나 내려찍기에 맞으면 가장 늦게 온 특수병이 쓰러진다. */
/* 플레이 기록 v2(39.10): 이번 구간에 잃은 병력·게이트 득실·보스 앞 병력 */
function segAcc(s) { const st = s.stats; return st.cur || (st.cur = { lost: 0, gate: 0, nb: 0 }); }
function lose(s, k, cause, x, z, sub) {
  const q = s.squad;
  if (k <= 0 || q.n <= 0) return;
  const soft = cause !== 'gate' && cause !== 'saw';
  const h = s.hero;
  if (soft && h && h.id === 'bori' && h.act > 0) {
    const a = k * heroVal('bori', 'guard', h.lv) + q.lossFrac;
    k = Math.floor(a);
    q.lossFrac = a - k;
    if (k <= 0) return;
  }
  // 개편 판의 생존 카드: 게이트 방패(구간마다 shield번 — 빨간 게이트 손실을 통째로 막는다), 방탄복(좀비·보스에게 잃는 병사 ×armor^레벨)
  const B = s.endless && s.endless.bld;
  if (B) {
    const medB = soft ? spLv(q, 'medic') : 0;
    if (soft && medB) {   // 의무병: 좀비·보스에게 잃는 병사 ÷(1 + med × 레벨)
      const a = k / (1 + BUILD.med * medB) + q.lossFrac;
      k = Math.floor(a);
      q.lossFrac = a - k;
      if (k <= 0) return;
    }
  }
  // 야전 병원(치료 + 의무병, 24절): 그 구간에 치료된 병사가 있으면 구간마다 한 번 손실을 통째로 막는다
  if (B && soft && s.endless.fx && s.endless.fx.cure && s.endless.cureSeg === s.endless.seg && s.endless.cureN > 0 && s.endless.fieldAt !== s.endless.seg && comboOn(s, 'cureMedic')) {
    s.endless.fieldAt = s.endless.seg;
    emit(s, { t: 'field', n: k, x: x ?? q.x, z: z ?? q.z });
    return;
  }
  // 펫 '막아 주기': 게이트가 아닌 손실의 병사마다 확률로 안 잃는다(많이 잃을 때는 기대값으로 — 병사마다 굴리지 않는다)
  const pb = cause !== 'gate' ? petBy(s, 'block') : null;
  if (pb) {
    const p = petP(pb.id, pb.lv);
    let saved = 0;
    if (pb.avg || k > 40) { const a = k * p + pb.acc; saved = Math.floor(a); pb.acc = a - saved; }
    else for (let i = 0; i < k; i++) if (rand(pb) < p) saved++;
    if (saved > 0) {
      pb.procs += saved;
      k -= saved;
      emit(s, { t: 'pet', fx: 'block', n: saved, x: x ?? q.x, z: z ?? q.z });
      if (k <= 0) return;
    }
  }
  const before = q.n;
  const real = Math.min(q.n, k);
  q.n -= real;
  q.hurtT = s.t;
  s.stats.lost += real;
  if (s.stats.lostBy) { const lk = sub ? cause + ':' + sub : cause; s.stats.lostBy[lk] = (s.stats.lostBy[lk] || 0) + real; }   // 플레이 기록(32절)
  if (s.endless) segAcc(s).lost += real;
  { const e3 = s.endless;   // 34절 의무병 전설 '응급 수혈'
    if (e3 && e3.bld && q.n > 0 && e3.n0 > 0 && e3.transAt !== e3.seg && q.n < 0.5 * e3.n0 && legOn(s, 'medic') && spLv(q, 'medic')) {
      e3.transAt = e3.seg;
      const back = Math.max(1, Math.round((e3.n0 - q.n) * ENH.medic.legend.v * legK2(s, 'medic')));
      gain(s, back, q.x, q.z, 'heal'); s.stats.healed += back;
      emit(s, { t: 'heal', n: back, x: q.x, z: q.z }); emit(s, { t: 'revive', id: 'medic', n: back, x: q.x, z: q.z });
    } }
  emit(s, { t: 'loss', n: real, cause, x: x ?? q.x, z: z ?? q.z });
  if (q.n <= 0) {
    const e2 = s.endless;
    if (e2 && e2.bld && spLv(q, 'medic') >= 10 && e2.medicAt !== e2.seg) {   // 의무병 Lv10 · 전설 강화 '마지막 응급'   // 의무병 Lv10 마지막 응급: 구간마다 한 번, 전멸 직전에 바닥선의 절반으로
      const n = clamp(Math.round(SP_EVO2.medic.v * (segFloor(e2.seg) || ENDLESS.floor0)), 1, nMax(s));
      e2.medicAt = e2.seg;
      q.n = n;
      q.peak = Math.max(q.peak, n);
      emit(s, { t: 'revive', id: 'medic', n, cause, x: q.x, z: q.z });
      escort(s);
      return;
    }
    if (e2 && e2.sup && e2.sup.revive > 0) {   // 불굴 보급(27절): 한 번, 그 구간 바닥선(1구간은 floor0)의 v배로
      const n = clamp(Math.round(SUPPLY.revive.v * (segFloor(e2.seg) || ENDLESS.floor0)), 1, nMax(s));
      e2.sup.revive--;
      q.n = n;
      q.peak = Math.max(q.peak, n);
      emit(s, { t: 'revive', id: 'supply', n, cause, x: q.x, z: q.z });
      escort(s);
      return;
    }
    s.cause = cause;
    // 플레이 기록(32절): 전멸한 곳 — 무엇에(cause·sub), 어느 구간·레벨, 보스전이었나(보스 등급·켜진 패턴)
    const bb = s.boss && s.boss.hp > 0 ? s.boss : null;
    s.stats.death = { cause, sub: sub || '', seg: e2 ? e2.seg : s.L, arena: s.phase === 'arena', tag: s.params && s.params.tag ? s.params.tag : '', pat: bb && bb.pat ? bb.pat.slice() : [], bossHp: bb ? Math.round((100 * bb.hp) / bb.max) : null };
    return;
  }
  if (cause !== 'gate') {
    q.recent += real;
    // 짓밟기(보스가 닿은 뒤)로 잃은 병사는 회복 풀로 가지 않는다 — 닿기 전에 잡는 것이 보스전의 목표
    // 의무병은 레벨만큼(Lv1 60%·Lv2 70%·Lv3 80%), 보리의 응급처치는 의무병 레벨만큼 더(짝 효과 — 의무병이 없거나 Lv1이면 그대로)
    const med = spLv(q, 'medic');
    const share = sub === 'stomp' ? 0 : Math.min(Math.max(SHARE_MAX, med ? unitVal('medic', 'share', med) : 0), (med ? unitVal('medic', 'share', med) : 0) + (h && h.id === 'bori' ? heroVal('bori', 'share', h.lv) * (med ? synergyOf(med) : 1) : 0));
    // 의무병 전문화(개편 판): 소생 — 좀비에게 잃은 병사가 모두 돌아온다, 경호 — 특수병이 맞아서 쓰러지지 않는다
    const mLeg = 0;   // 34절: 의무병 전설은 '응급 수혈'(아래)   // 전설 강화 '기적의 손': 더 돌아온다
    q.pool += real * (B && med >= BUILD.evo && soft && sub !== 'stomp' ? Math.min(1, share + SP_EVO.medic.v + mLeg) : Math.min(1, share + mLeg));   // 의무병 Lv5 소생: 더 돌아온다
  }
  if (soft && q.sp.length && (sub === 'slam' || real >= Math.max(3, Math.ceil(0.15 * before)))) spDrop(s, 'hit');
  escort(s);
}

/* 이 판에서 그 효과(fx)를 가진 펫(없으면 null). 여러 마리면 첫 마리 s.pet, 그다음 s.pets — 펫마다 제 난수 흐름 */
export const PET_TEAM_MAX = 3;
function petBy(s, fx) {
  const p = s.pet;
  if (!p) return null;
  if (PETS[p.id].fx === fx) return p;
  if (s.pets) for (const o of s.pets) if (PETS[o.id].fx === fx) return o;
  return null;
}
/* 이 판의 펫 모두(첫 마리부터) */
export const petsOf = (s) => (s && s.pet ? (s.pets ? [s.pet, ...s.pets] : [s.pet]) : []);
/* 판이 끝나는 순간(승리·전멸): '줍줍'이 터졌는지 한 번 굴려 둔다(화면이 받는 코인을 두 배로 — petCoinMul) */
function petEnd(s) {
  const p = petBy(s, 'coin');
  if (!p || p.avg || p.done) return;
  p.done = 1;
  if (rand(p) < petP(p.id, p.lv)) { p.double = 1; p.procs++; emit(s, { t: 'pet', fx: 'coin', x: s.squad.x, z: s.squad.z }); }
}
export const petCoinMul = (s) => { const p = s && petBy(s, 'coin'); return p && p.double ? 2 : 1; };
const hasSp = (q, k) => q.sp.some((m) => m.k === k);
/* 그 병과 특수병의 레벨(없으면 0) */
function spLv(q, k) { for (const m of q.sp) if (m.k === k) return m.lv || 1; return 0; }

function spDrop(s, cause) {
  const q = s.squad;
  const m = q.sp.pop();
  if (!m) return;
  // 개편 판: 쓰러진 특수병은 보스를 잡으면 레벨의 일부로 돌아온다(spBack)
  const B = s.endless && s.endless.bld;
  if (B && !B.down.some((d) => d.k === m.k)) B.down.push({ k: m.k, lv: m.lv || 1 });
  s.stats.spLost++;
  emit(s, { t: 'spLose', k: m.k, cause, x: q.x, z: q.z });
}

/* 병사가 너무 적으면 특수병이 떠난다 */
function escort(s) {
  const q = s.squad;
  while (q.sp.length && q.n < spEscort(s) * q.sp.length) spDrop(s, 'escort');
}

/* 특수병 합류. 같은 병과가 이미 있으면 그 특수병의 레벨이 오른다(SIM 9, Lv3까지 — 새 자리·호위 병사는 필요 없다).
   Lv3인 같은 병과·자리 초과·호위 병사 부족이면 병사로 바꿔 준다(spFull.why: 'max' | 'full' | 'escort') */
function addSpecial(s, k, via, x, z, mul = 0) {
  const q = s.squad;
  const h = s.hero;
  const m = q.sp.find((o) => o.k === k);
  if (m && (m.lv || 1) < spLvMax(s)) {
    m.lv = (m.lv || 1) + 1;
    s.stats.spUp++;
    emit(s, { t: 'spUp', k, lv: m.lv, id: m.id, via, x: x ?? q.x, z: z ?? q.z });
    if (h && HEROES[h.id].match === k) chargeHero(s, 0.25);
    return;
  }
  const cap = spMax(s);   // 넷째 자리(유물)면 4자리·호위 병사 6명
  if (m || q.sp.length >= cap || q.n < spEscort(s) * (q.sp.length + 1)) {
    const n0 = Math.max(5, nice(0.12 * q.n));
    const n = mul ? Math.max(1, Math.round(n0 * mul)) : n0;   // mul: 나침반(유물)이 실은 갈림길 위험한 쪽 철창의 병사 배수
    gain(s, n, x, z, 'spFull');
    emit(s, { t: 'spFull', k, n, why: m ? 'max' : q.sp.length >= cap ? 'full' : 'escort', x: x ?? q.x, z: z ?? q.z });
    return;
  }
  const on = combosBy(s, k);   // 2단계 판: 이 특수병으로 켜지는 시너지(1단계·캠페인 판은 늘 빈 목록)
  q.sp.push({ id: s.nextId++, k, cd: 0.6, lv: 1 });
  s.stats.spGot++;
  emit(s, { t: 'spGet', k, via, x: x ?? q.x, z: z ?? q.z });
  if (h && HEROES[h.id].match === k) chargeHero(s, 0.25);
  if (on.length) comboEmit(s, on, x, z);
  if (s.endless && s.endless.bld) { const B = s.endless.bld; B.down = B.down.filter((d) => d.k !== k); }
}

function gain(s, k, x, z, why) {
  const q = s.squad;
  const before = q.n;
  q.n = Math.min(nMax(s), q.n + k);
  s.stats.gained += q.n - before;
  q.peak = Math.max(q.peak, q.n);
  emit(s, { t: 'gain', n: q.n - before, why, x: x ?? q.x, z: z ?? q.z });
}

/* 입력: { dir: -1|0|1, tx: 목표 x 또는 null, skill: 영웅 스킬 버튼(이번 틱에 눌림) } */
export function step(s, input) {
  RCAP = capFor(s);
  s.ev.length = 0;
  if (s.phase === 'won' || s.phase === 'lost') { s.endT += DT; s.tick++; s.t += DT; return s; }
  if (s.endless && s.endless.offer) return s;   // 보스 뒤 3택 1: 고를 때까지(pickCard) 판이 멈춘다 — 틱도 세지 않는다
  s.tick++;
  s.t += DT;
  const q = s.squad;
  const R = radius(q.n);
  if (s.endless && q.sp.length) { const pk = s.stats.spPk || (s.stats.spPk = {}); for (const m of q.sp) if ((m.lv || 1) > (pk[m.k] | 0)) pk[m.k] = m.lv || 1; }   // 플레이 기록 v2: 판 동안 가장 높았던 특수병 레벨(떠나도 남는다)

  /* 좌우 이동 */
  const tx = input && input.tx != null ? clamp(input.tx, -EDGE, EDGE) : null;
  if (tx != null) {
    const want = clamp((tx - q.x) * 12, -16, 16);
    q.vx = want;
  } else {
    const dir = input ? input.dir | 0 : 0;
    if (dir) q.vx = clamp(q.vx + dir * ACCEL * DT, -VMAX, VMAX);
    else q.vx = Math.abs(q.vx) <= 100 * DT ? 0 : q.vx - Math.sign(q.vx) * 100 * DT;
    if (dir && Math.sign(q.vx) !== dir && q.vx !== 0) q.vx += dir * 60 * DT;   // 방향 전환은 더 빠르게
  }
  const xPrev = q.x;
  q.x += q.vx * DT;
  // 보스전 내려찍기 예고 중(3단계, F2): 맞는 범위(빨간 띠) 밖에 있던 분대는 그 가장자리에서 멈춘다 — 밖에서 안으로 걸어 들어가지 않는다.
  // 꾹 누르기로 피한 뒤 보스 쪽으로 되돌아오다 넘쳐 다시 맞는 일을 막는다. 안에 있던 분대가 빠져나가는 것은 막지 않는다
  if (s.boss && s.boss.slam && s.boss.hp > 0) {
    const zn = slamZone(s.boss.slam, R);
    if (xPrev < zn.x0 && q.x >= zn.x0) { q.x = zn.x0 - SLAM_STOP; q.vx = Math.min(0, q.vx); }
    else if (xPrev > zn.x1 && q.x <= zn.x1) { q.x = zn.x1 + SLAM_STOP; q.vx = Math.max(0, q.vx); }
  }
  if (q.x < -EDGE) { q.x = -EDGE; if (q.vx < 0) q.vx = 0; }
  if (q.x > EDGE) { q.x = EDGE; if (q.vx > 0) q.vx = 0; }
  // 분리대(갈림길): 코를 지나면 제 쪽에 갇힌다 — 몸이 가운데에서 차츰 밀려나 FORK_TAPER m 뒤에는 통째로 제 쪽에 있다
  if (s.divs && s.phase === 'run') {
    for (const d of s.divs) {
      if (d.seen || q.z + MARK_AHEAD < d.z0) continue;
      d.seen = 1;   // 갈림길 45m 앞 알림(한 번). 나침반(유물)이 있으면 위험한 쪽 보상 상자의 속(reward)도 — 화면은 forkPeek로 벽 위에 띄운다
      const ev = { t: 'fork', z: d.z0, risk: d.risk, kind: d.kind || 'wall' };
      if (d.hidden) ev.hidden = true;
      if (d.pad) ev.pad = true;   // 46.5: 위험한 쪽에 가속 발판
      const pk = forkPeek(s, d);
      if (pk) ev.reward = { ...pk.reward };
      emit(s, ev);
    }
    const dv = divAt(s);
    if (dv) {
      const side = xPrev > 0 || (xPrev === 0 && q.vx > 0) ? 1 : -1;
      const pad = Math.min(EDGE, divPad(dv, q.z + runV(s) * DT, R));   // 이 틱에 나아간 자리 기준(전진은 바로 아래)
      if (side * q.x < pad) {
        if (ladderUse(s, side * q.vx < -0.5)) q.x = -side * pad;   // 사다리(24절): 밀고 있으면 구간마다 한 번 반대쪽으로 넘어간다
        else { q.x = side * pad; if (side * q.vx < 0) q.vx = 0; }
      }
    }
  }

  // 칸막이 구간(22절): 45m 앞 알림, 안에서는 제 칸에 갇힌다(열린 곳에서만 옆 칸으로)
  if (s.lanes && s.phase === 'run') {
    for (const l of s.lanes) if (!l.seen && q.z + MARK_AHEAD >= l.z0) { l.seen = 1; emit(s, { t: 'lanes', k: l.k, z: l.z0 }); }
    const zn = q.z + runV(s) * DT, l = laneAt(s, zn);
    if (l) {
      const c = laneCell(xPrev);
      const [lo, hi] = laneBounds(l, c, zn, hitHalf(R) + 0.05);
      if (q.x < lo) { if (c > 0 && ladderUse(s, q.vx < -0.5)) q.x = LANE_X[c - 1] - hitHalf(R) - 0.15; else { q.x = lo; if (q.vx < 0) q.vx = 0; } }   // 사다리: 옆 칸으로 넘어간다
      if (q.x > hi) { if (c < 2 && ladderUse(s, q.vx > 0.5)) q.x = LANE_X[c] + hitHalf(R) + 0.15; else { q.x = hi; if (q.vx > 0) q.vx = 0; } }
    }
  }
  /* 전진 */
  if (s.phase === 'run') {
    const zPrev = q.z;
    q.vz = runV(s);
    q.z += q.vz * DT;
    if (s.pads) padsUpdate(s, zPrev);   // 가속 발판(46.1 — 개편 판만)
    if (q.boost && q.z >= q.boost.z1) { q.boost = null; emit(s, { t: 'boostEnd', x: q.x, z: q.z }); }
    if (q.z >= s.arenaZ) enterArena(s);
  } else if (s.phase === 'arena') {
    const left = s.stopZ - q.z;
    q.vz = left > 0 ? Math.min(s.speed, Math.max(1.5, left * 2.2)) : 0;
    q.z = Math.min(s.stopZ, q.z + q.vz * DT);
  }

  rowsUpdate(s);
  if (s.zones) zonesUpdate(s);   // 특별 구간 끝 병력 증감(46.3)
  marksUpdate(s);
  propsUpdate(s, R);
  sawsUpdate(s, R);
  fogUpdate(s);
  foesUpdate(s, R);
  if (s.endless && s.endless.bld && s.endless.fx) fxNewUpdate(s);   // 24절 새 탄(부식 겹·웅덩이·뇌운)
  spitsUpdate(s, R);
  if (s.pools) poolsUpdate(s, R);
  if (wiped(s)) return s;
  if (s.hero) heroUpdate(s, input);
  if (s.boss) {
    // 특수병·영웅이 보스에게 더 줄 수 있는 몫: 병사 화력의 +BONUS_CAP까지(나비는 레벨마다 +NABI_CAP, 저격수·로켓병·화염병은 Lv1 위 레벨마다 +SP_LV_CAP)
    let up = 0;
    for (const m of q.sp) if (m.k !== 'medic') up += (m.lv || 1) - 1;
    const Bb = s.endless && s.endless.bld;
    const cap = BONUS_CAP + (s.hero && s.hero.id === 'nabi' ? NABI_CAP * (Math.min(5, s.hero.lv) - 1) : 0) + (Bb ? BUILD.spBoss : SP_LV_CAP) * up
      + (Bb && spLv(q, 'sniper') >= BUILD.evo ? SP_EVO.sniper.cap : 0);   // 저격수 Lv5 거물 사냥: 보스전 추가 피해 한도
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

/* 앞으로 달리는 속도: 가속 발판(46.1)을 밟았으면 ×mul(옆 빠르기는 그대로) */
export const runV = (s) => s.speed * (s.squad.boost ? s.squad.boost.mul : 1);
/* 가속 발판: 이 틱에 판 줄(z)을 지났고 분대 몸 가운데가 판의 x 범위 안이면 len m 동안 ×mul(겹치면 큰 배수, 같으면 더 긴 쪽) */
function padsUpdate(s, z0) {
  const q = s.squad;
  for (const o of s.pads) {
    if (o.z <= z0 || o.z > q.z || q.x < o.x0 || q.x > o.x1) continue;
    const z1 = o.z + o.len, b = q.boost;
    if (b && (o.mul < b.mul || (o.mul === b.mul && z1 <= b.z1))) continue;
    q.boost = { z1, mul: o.mul };
    emit(s, { t: 'boost', mul: o.mul, len: o.len, x: q.x, z: o.z, full: o.x1 - o.x0 > 2 * ROAD });
  }
}
/* 특별 구간(46.3 — 가속 몰이·함정 길·미로·행운 길): 들어설 때 병력을 적고, 끝을 지나면 'zone' { k, n0, n1 } */
function zonesUpdate(s) {
  const q = s.squad;
  for (const o of s.zones) {
    if (o.done) continue;
    if (o.n0 == null) { if (q.z < o.z0) continue; o.n0 = Math.round(q.n); emit(s, { t: 'zoneIn', k: o.k, z: o.z0 }); }
    if (q.z >= o.z1) { o.done = 1; emit(s, { t: 'zone', k: o.k, n0: o.n0, n1: Math.round(q.n), z: o.z1 }); }
  }
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
  petEnd(s);
  emit(s, { t: 'lose', cause: s.cause });
  return true;
}

/* 개편 판 보스 체력 배수(구간이 갈수록 — BUILD.bossHp) */
export const bldBossHp = (k) => Math.min(BUILD.bossHp.max, 1 + BUILD.bossHp.k * Math.max(0, k - BUILD.bossHp.from + 1)) * (segInfo(k).tag === 'super' ? BUILD.bossHp.king || 1 : 1);
/* 분노한 보스(변이): 내려찍기·졸개 소환 간격 배수 */
const rageCd = (s) => { const l = mutLv(s, 'rage'); return l ? MUTATIONS.rage.cd[l - 1] : 1; };
function enterArena(s) {
  s.phase = 'arena';
  if (s.squad.boost) s.squad.boost = null;
  if (s.endless) segAcc(s).nb = Math.round(s.squad.n);
  if (s.endless && s.endless.bld && s.endless.n0 != null) emit(s, { t: 'zone', k: 'run', n0: Math.round(s.endless.n0), n1: Math.round(s.squad.n), z: s.squad.z });   // 46.3: 이번 구간 달리기의 병력 증감
  const p = s.params;
  const rg = mutLv(s, 'rage');
  const hp = Math.round((s.bossHp > 0 ? s.bossHp : Math.round(dps(s.bossRef, 0, s.refFire || 0) * p.bossKill)) * (rg ? MUTATIONS.rage.hp[rg - 1] : 1) * (s.endless && s.endless.bld ? bldBossHp(s.endless.seg) : 1));
  s.boss = {
    z: s.stopZ + BOSS_GAP, x: 0, hp, max: hp, r: 2.5, walk: p.bossWalk || 1.3, hitT: -9,
    slam: null, slamCd: BOSS_FIRST_SLAM, summonCd: SUMMON_FIRST, enraged: false, clashCd: 0, clash: false, t: 0, bonus: 0,
  };
  const pats = bossPats(s);
  if (pats.length) {   // 개편 판 보스 패턴(23절 — roster.BOSS_PAT): all = 이 보스가 쓰는 패턴 전부(이름표 아이콘), up = 패턴마다 강화 비트, pat = 지금 켜진 것,
    // pcd = 패턴마다 다음까지 초, seen = 알린 패턴. 대왕(king)은 체력 문턱(ph)마다 특수 패턴 하나를 더하고 셋째가 들어오면 가장 오래된 것이 빠진다(동시 둘까지)
    const b = s.boss;
    b.all = pats.map((p) => p.k);
    b.up = {};
    for (const p of pats) b.up[p.k] = p.up;
    b.pcd = {};
    for (const k of b.all) if (BOSS_PAT[k].first) b.pcd[k] = BOSS_PAT[k].first;
    b.seen = [];
    b.ps = -9;
    if (segInfo(s.endless.seg).tag === 'super') { b.king = 1; b.ph = 0; b.pat = kingPats(b, 0); }
    else b.pat = b.all.slice();
  }
  s.stats.healedAtArena = s.stats.healed;
  // 경기장 입장 +0.5 — 스킬이 켜져 있어도 쌓아 두고, 끝나면 이어서 찬다
  const h = s.hero;
  if (h && h.charge < 1) {
    h.charge = Math.min(1, h.charge + (relicOn(s, 'drum') && bldOf(s) ? 1 : 0.5));   // 진격 북(24절): 보스전에 들어가면 가득
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
    const after = applyOp(before, c.op, c.v, nMax(s));
    s.stats.gates++;
    // alt: 이 순간 줄의 칸마다 결과(쏴서 올린 값 그대로) — 근소한 패배 화면의 '다른 칸이었다면'
    emit(s, { t: 'gate', op: c.op, v: c.v, k: c.k, before, after, good: after >= before, x: (c.x0 + c.x1) / 2, z: row.z, row: row.id, alt: row.cells.map((d) => applyOp(before, d.op, d.v, nMax(s))) });
    if (s.endless) segAcc(s).gate += after - before;
    if (after > before) gain(s, after - before, q.x, row.z, 'gate');
    else if (after < before) {
      if (after <= 0) { lose(s, before, 'gate'); }
      else lose(s, before - after, 'gate');
    }
    if (c.op === 'unit' && q.n > 0) addSpecial(s, c.k, 'gate', q.x, row.z);
  }
}

function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

/* 미리 알림(판 중 표시): 몰이 청크 45m 앞에서 'surge' 이벤트 한 번 — 화면이 '몰려와요!'를 띄울 수 있게 */
export const MARK_AHEAD = 45;
function marksUpdate(s) {
  const q = s.squad;
  for (const m of s.marks) {
    if (m.done || q.z < m.z - MARK_AHEAD) continue;
    m.done = true;
    if (m.t === 'obstacle') obstacleSeen(s, m);
    else emit(s, m.pat ? { t: m.t, z: m.z, x: 0, pat: m.pat } : { t: m.t, z: m.z, x: 0 });   // 함정 길(46.4)은 패턴도
  }
}
/* 장애물을 45m 앞에서 처음 볼 때(2단계 판 — 그 판에서 종류마다 한 번): 'obstacle' { kind, z } — 화면이 처음 한 번만 안내한다 */
function obstacleSeen(s, m) {
  const e = s.endless;
  if (!e || !e.obsSeen || e.obsSeen.includes(m.kind)) return;
  e.obsSeen.push(m.kind);
  emit(s, { t: 'obstacle', kind: m.kind, z: m.z, x: 0 });
}

/* 못 부순 상자·철창에 부딪히면 남은 체력 × crateHit(일반 25%, 어려움 50%)만큼 10마다 1명을 잃는다(P10).
   벽·상자·철창 모두: 걸친 폭이 분대 몸의 반(ov 0.5) 아래면 그 몫만큼만, 그리고 걸친 폭의 병사 수(n × ov)보다 많이는 잃지 않는다(SIM 8 —
   대형이 고른 네모라 걸친 폭의 몫 = 부딪힌 병사의 몫. 옆으로 스친 분대가 벽 체력 전부를 치르지 않게) */
export const crateHitOf = (params) => (params && params.crateHit != null ? params.crateHit : CRATE_HIT.normal);
function propsUpdate(s, R) {
  const q = s.squad;
  for (const p of s.props) {
    if (!p.alive || p.passed) continue;
    if (q.z + SQUAD_DEPTH * R < p.z) continue;
    // 맞는 몸(±hitHalf)이 벽·상자에 걸친 몫. 화면에서 스치기만 했으면(CONTACT_GRACE 안) 비켜 간 것
    const H = hitHalf(R);
    const ov = overlap(q.x - H, q.x + H, p.x0, p.x1) / (2 * H);
    // 비켜 간 벽·상자는 그대로 남아 뒤로 지나간다(그리기만 한다)
    if (ov <= 0) { p.passed = true; continue; }
    p.alive = false;
    const x = (p.x0 + p.x1) / 2;
    if (p.kind === 'drum') { drumBlast(s, p, 'touch'); continue; }   // 폭발 드럼통: 닿아도 터진다(분대는 안 다친다)
    if (p.kind === 'crate' || p.kind === 'cage') {
      // 부딪힌 병사만 잃는다: 걸친 폭의 병사(n × ov)보다 많이는 아니다(SIM 8)
      const k = Math.min(Math.ceil(((p.hp * crateHitOf(s.params)) / SOLDIER_HP) * Math.min(1, ov * 2)), Math.ceil(q.n * ov));
      if (p.kind === 'crate') emit(s, { t: 'crateMiss', x, z: p.z, n: k, key: !!p.key });
      else emit(s, { t: 'cageMiss', k: p.reward.k, x, z: p.z, n: k });
      if (k > 0) lose(s, k, 'crate', x, p.z);
      continue;
    }
    // 벽·장갑문: 남은 체력 10마다 1명(걸친 몫만)
    const k = Math.min(Math.ceil((p.hp / SOLDIER_HP) * Math.min(1, ov * 2)), Math.ceil(q.n * ov));
    emit(s, p.kind === 'door' ? { t: 'wallCrash', x, z: p.z, n: k, kind: 'door' } : { t: 'wallCrash', x, z: p.z, n: k });
    lose(s, Math.max(1, k), 'wall');
  }
}

function sawsUpdate(s, R) {
  const q = s.squad;
  const B = !!(s.endless && s.endless.bld);
  for (const w of s.saws) {
    w.x += w.dir * w.spd * DT;
    if (w.x > w.xb) { w.x = w.xb; w.dir = -1; }
    if (w.x < w.xa) { w.x = w.xa; w.dir = 1; }
    if (touches(w.x - q.x, w.z - q.z, hitHalf(R), SQUAD_DEPTH * R, w.w / 2, SAW_HD)) {
      if (wardBlock(s, 'saw', w.id, w.x, w.z)) continue;   // 방패막(유물): 구간마다 처음 닿은 톱날 하나
      if (B && !w.bit && q.n > 0) {   // 49절: 처음 닿는 순간 한 입 — 스치기만 해도, 가속돼 빨리 지나가도 이만큼은 잃는다
        w.bit = 1;
        const k = Math.max(1, Math.round(q.n * SAW2.bite));
        emit(s, { t: 'sawBite', n: k, x: w.x, z: w.z });
        lose(s, k, 'saw', w.x, w.z);
      }
      q.lossAcc += (B ? SAW2.flat + SAW2.rate * q.n : 4 + 0.35 * q.n) * DT;
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
  const fx = s.endless && s.endless.fx;
  const slowK = fx ? (fx.frost ? fxV(s, 'frost', fx.frost).slow : 0) : AMMO.frost.slow;
  const rl = mutLv(s, 'rush'), rushK = rl ? MUTATIONS.rush.v[rl - 1] : 1;
  const frostLeg = false;   // 34절: 빙결 전설은 '얼음 갑옷'(닿을 때)   // 전설 강화 '절대 영도': 2차 진화를 앞당겨(after초) 더 오래(T초) 얼어붙는다
  const frostEvo2 = !!(fx && s.endless.bld && fx.frost >= 10) || frostLeg;
  const frzAfter = frostLeg ? ENH.frost.legend.after : FX_FREEZE.after, frzT = frostLeg ? ENH.frost.legend.T : FX_FREEZE.T;
  for (const f of s.foes) {
    if (!f.alive) continue;
    const dz = f.z - q.z;
    if (!f.awake) {
      if (dz < WAKE) f.awake = true;
      else continue;
    }
    if (f.kind === 'spit') {
      if (s.phase === 'run' && dz < 32 && dz > 6 && !(s.divs && divAt(s, s.speed * (SPIT_T + 0.3)))) {   // 갈림길 안(과 떨어질 때 안에 있을 거리)에서는 쏘지 않는다 — 옆으로 못 피한다
        f.cd -= DT;
        // 공정성(P14, 3단계): 피할 쪽(가장자리·반대로 가던 속도·그 길을 막은 적·벽·톱날)이 없으면 쏘지 않고 잠깐 기다린다
        if (f.cd <= 0 && !spitEscape(s, R)) f.cd = SPIT_WAIT;
        else if (f.cd <= 0) {
          f.cd = 2.4;
          const T = SPIT_T;
          s.spits.push({ id: s.nextId++, x: q.x, z: q.z + q.vz * T, sx: f.x, sz: f.z, t: T, T });
          emit(s, { t: 'spitFire', x: f.x, z: f.z });
        }
      }
    } else {
      if (frostEvo2 && f.slowT > s.t && !(f.freezeT > s.t) && s.t - (f.slowFrom ?? s.t) >= frzAfter) { f.freezeT = s.t + frzT; f.slowFrom = s.t + frzT; }   // 빙결 Lv10: 느려진 채 3초가 지나면 1초 얼어붙는다
      if (f.freezeT > s.t) continue;
      if (frostLeg && f.slowT > s.t && s.foes.some((o) => o !== f && o.alive && o.slowT > s.t && o.z < f.z && f.z - o.z < 0.9 && Math.abs(o.x - f.x) < 0.9)) continue;   // 전설 강화 '얼음 정체': 앞의 느려진 좀비에 막혀 멈춘다
      const fx0 = f.x;
      if (f.stunT > s.t) continue;   // 34절 전격 전설 '감전': 멈춰 있다(닿기 판정은 안 한다 — 멈춘 자리에서 그대로)
      if (f.elite === 'thief') thiefDrain(s, f, dz);   // 게이트 도둑(46.6): 서서 칸을 빨아 먹는다
      if (f.holdT > s.t) { /* 46.7 돌격 나팔에 밀려 멈춘 동안: 걷지 않는다(닿으면 그대로 문다) */ }
      else if (f.elite === 'leap' && f.lp !== 3 && leapStep(s, f, dz)) { /* 도약 좀비(46.6): 웅크리기·뛰기 동안은 걷지 않는다 */ }
      else {
        f.z -= (f.slowT > s.t ? f.spd * (1 - slowK) : f.spd) * rushK * DT;   // 빙결탄에 맞은 동안 느리다(slowT가 없으면 그대로), 질주(변이)면 더 빠르다
        if (dz < f.homeDist) {
          const d = q.x - f.x;
          const m = f.home * DT;
          f.x += d > m ? m : d < -m ? -m : d;
        }
      }
      if (s.lanes) { const l = laneAt(s, f.z); if (l) { const [lo, hi] = laneBounds(l, laneCell(fx0), f.z, f.r); f.x = clamp(f.x, lo, hi); } }   // 칸막이(22절): 좀비도 칸을 못 넘는다
    }
    if (touches(f.x - q.x, f.z - q.z, hitHalf(R), SQUAD_DEPTH * R, f.r * FOE_HX, f.r)) {
      f.alive = false;
      emit(s, { t: 'bite', kind: f.kind, x: f.x, z: f.z });
      let cost = contactCost(f.hp);
      if (f.elite === 'bomb') { cost += Math.max(1, Math.round(q.n * FOE2.bomb.hit)); bombBlast(s, f, true); }   // 자폭 좀비(46.6): 닿으면 터진다
      if (s.hero && s.hero.id === 'mungchi' && s.endless && s.endless.bld) cost = Math.max(1, Math.round(cost * (1 - heroVal('mungchi', 'guard', s.hero.lv))));   // 46.7 뭉치 '돌격 대형'
      if (f.slowT > s.t && fx && s.endless.bld && fx.frost) cost = Math.max(1, Math.round(cost * fx2Val('frost', fx.frost).loss));   // 빙결 Lv3+: 느려진 좀비에게 잃는 병사 −30%
      if (f.slowT > s.t && legOn(s, 'frost')) { cost = 0; emit(s, { t: 'shatter', x: f.x, z: f.z, r: 1.2, k: 2 }); }   // 34절 전설 '얼음 갑옷': 느려진 좀비는 닿으면 얼어 부서진다(안 잃는다)
      else if (legOn(s, 'flame') && s.flames && s.flames.some((zn) => inFire(zn, q.x, q.z))) cost = Math.max(1, Math.round(cost * (1 - ENH.flame.legend.v)));   // 34절 전설 '불꽃 방패'
      const medic = f.slowT > s.t && s.endless && s.endless.bld && comboOn(s, 'frostMedic');   // (큰 피해는 특수병을 쓰러뜨리므로 맞기 전에 본다)
      if (cost > 0) lose(s, cost, s.phase === 'arena' ? 'summon' : f.elite === 'bomb' ? 'bomb' : f.kind === 'brute' ? 'brute' : 'foe', f.x, f.z);
      if (f.slowT > s.t && s.endless && s.endless.bld && fx.frost) {   // 느려진 좀비가 닿으면 터진다: 희귀 강화 '얼음 폭탄' + 빙결 넘침(21.10 — 느려지는 시간이 4초를 넘친 몫)
        const sh = (enhN(s, 'frost', 'r') ? ENH.frost.rare.v * enhV(s, 'frost', 'r') : 0) + fx2Val('frost', fx.frost).shatter;
        if (sh > 0) { fxBoom(s, f.x, f.z, 1.6, f.max * sh, f); emit(s, { t: 'shatter', x: f.x, z: f.z, r: 1.6, k: enhN(s, 'frost', 'r') }); }   // 그림: 얼음 조각
      }
      if (medic && s.squad.n > 0) { s.stats.healed += cost; gain(s, cost, q.x, q.z, 'heal'); emit(s, { t: 'heal', n: cost, x: q.x, z: q.z }); }   // 응급 얼음(빙결 + 의무병): 느려진 좀비에게 잃은 병사는 바로 돌아온다
      continue;
    }
    if (f.z < q.z - 4) f.alive = false;   // 지나쳐 갔다
  }
  // 죽은 적은 가끔 걸러낸다
  if ((s.tick & 63) === 0) s.foes = s.foes.filter((f) => f.alive || f.z > q.z + 60);
}

/* 46.6 새 적 ---------- */
/* 도약 좀비: at m 안에 오면 crouch초 웅크렸다가(lp 1 — 멈춤, 예고) T초 동안 dist m 앞으로·분대 x 쪽으로 뛴다(lp 2), 다 뛰면 lp 3(그 뒤로는 졸개처럼 걷는다).
   웅크리거나 뛰는 틱이면 true(걷지 않는다) */
function leapStep(s, f, dz) {
  const L = FOE2.leap, q = s.squad;
  if (!f.lp) {
    if (s.phase !== 'run' || dz > L.at || dz < 2) return false;
    f.lp = 1; f.lpT = s.t + L.crouch;
    emit(s, { t: 'leapWarn', id: f.id, x: f.x, z: f.z });
    return true;
  }
  if (f.lp === 1) {
    if (s.t < f.lpT) return true;
    f.lp = 2; f.lpT = s.t; f.lz0 = f.z; f.lx0 = f.x; f.lx1 = clamp(q.x + clamp(f.x - q.x, -0.6, 0.6), -4.6, 4.6);
    emit(s, { t: 'leap', id: f.id, x: f.x, z: f.z, x1: f.lx1, z1: f.z - L.dist });
  }
  const u = Math.min(1, (s.t - f.lpT) / L.T);
  f.z = f.lz0 - L.dist * u;
  f.x = f.lx0 + (f.lx1 - f.lx0) * u;
  if (u >= 1) f.lp = 3;
  return true;
}
/* 게이트 도둑: 분대가 near m 안이면 노리는 칸(f.row · f.ci)의 숫자를 초당 원래 값의 drain씩 깎는다(0 아래로 — 빨강이 된다). 줄을 지났으면 그만 */
function thiefDrain(s, f, dz) {
  if (s.phase !== 'run' || dz > FOE2.thief.near) return;
  const row = s.rows.find((r) => r.id === f.row);
  if (!row || row.done) return;
  const c = row.cells[f.ci];
  if (!c || c.op !== 'add') return;
  f.acc = (f.acc || 0) + FOE2.thief.drain * Math.max(2, Math.abs(c.v0)) * DT;
  if (f.acc < 1) return;
  const k = Math.floor(f.acc);
  f.acc -= k;
  c.v -= k;
  f.drainT = s.t;
  emit(s, { t: 'drain', row: row.id, ci: f.ci, v: c.v, x: f.x, z: f.z });
}
/* 자폭 좀비가 터진다(touch — 분대에 닿아서 / 아니면 총에 쓰러져서): 둘레 r m 좀비에게 지금 화력 × dmg초 몫(드럼통처럼).
   쓰러져 터질 때 분대 몸이 그 안이면 병력 near(닿아서 터질 때의 손실은 foesUpdate가 센다) */
function bombBlast(s, f, touch) {
  const q = s.squad, B = FOE2.bomb, R = radius(q.n), r2 = B.r * B.r;
  const dmg = B.dmg * dps(q.n, q.tier, s.fireLv) * heroDmg(s);
  const e = { t: 'bomb', x: f.x, z: f.z, r: B.r, n: 0, touch: !!touch };
  emit(s, e);
  for (const o of s.foes) {
    if (!o.alive || o === f) continue;
    const dx = o.x - f.x, dz = o.z - f.z;
    if (dx * dx + dz * dz > r2) continue;
    e.n++;
    hitFoe(s, o, dmg, 'drum', 'bomb');
  }
  if (!touch && !hornSafe && (s.phase === 'run' || s.phase === 'arena') && Math.abs(f.x - q.x) < B.r + hitHalf(R) && Math.abs(f.z - q.z) < B.r + SQUAD_DEPTH * R) {
    const k = Math.max(1, Math.round(q.n * B.near));
    e.near = k;
    lose(s, k, 'bomb', f.x, f.z);
  }
}

/* 독침: 분대가 지금 선 자리(그 틱의 전진을 앞질러)에 SPIT_T초 뒤 떨어진다. 폭 ±SPIT_R m — 비켜서려면 R + SPIT_R m(옆 칸 회피) */
export const SPIT_T = 1.0;
export const SPIT_R = 1.2;
export const SPIT_WAIT = 0.25;   // 피할 쪽이 없으면 이만큼 기다렸다 다시 본다
export const SPIT_LANE_Z = 14;   // 피하는 길에 이만큼 앞까지의 적·벽·톱날을 본다(독침이 떨어지는 곳 + 여유)
export const SPIT_OVER = 0.3;    // 피하는 사람은 조금 넘쳐 간다 — 비켜선 자리 옆으로 이만큼 더 본다
/* 독침을 피할 쪽이 있나: 왼쪽·오른쪽마다 R + SPIT_R m 비켜설 자리가 길 안이고, REACT_FAR초 동안 지금 속도로 밀려 간 뒤 출발해도
   SPIT_T 안에 닿고(반대로 가던 속도는 멈추고 돌아선다), 이미 날아가는 다른 독침이 떨어질 자리가 아니고,
   비켜선 자리(SPIT_OVER m 넘쳐 가도)에 SPIT_LANE_Z m 앞까지 부딪힐 벽·상자·톱날이 없고, 곧 닿는 적(독침 좀비 포함)의 못 잡는 몫의 합이
   max(2명, 병력 5%)의 60% 아래, 무리 전체로도 그 자리에서 쏴서 못 잡는 몫이 지금 자리보다 max(2명, 병력 5%) 넘게 크지 않아야 한다 */
function spitEscape(s, R) {
  const q = s.squad;
  const d = R + SPIT_R + 0.05;
  const D = dps(q.n, q.tier, s.fireLv);
  const vz = Math.max(1, q.vz);
  const span = R + 0.3;
  const sk = shieldMul(s);   // 방패 정예는 총알이 덜 든다(2단계 장애물 — 그만큼 단단하게 본다)
  const here = foeLeftover(s.foes, q.x, R, span, D, vz, q.z, sk);
  const slack = Math.max(2, 0.05 * q.n) * SOLDIER_HP;
  // 반응하는 동안(REACT_FAR초)은 하던 쪽을 계속 누른다고 본다(공정성 갈라 보기와 같은 가정): 0.5m/s 넘게 가던 쪽으로 ACCEL로 빨라져 VMAX까지, 길 끝에서 멈춘다
  let xr = q.x + q.vx * REACT_FAR;
  let vr = q.vx;
  if (Math.abs(q.vx) > 0.5) {
    const sg = Math.sign(q.vx);
    const v0 = Math.abs(q.vx);
    const tAcc = Math.max(0, Math.min(REACT_FAR, (VMAX - v0) / ACCEL));
    const vEnd = Math.max(v0, Math.min(VMAX, v0 + ACCEL * REACT_FAR));
    xr = q.x + sg * (v0 * tAcc + 0.5 * ACCEL * tAcc * tAcc + vEnd * (REACT_FAR - tAcc));
    vr = sg * vEnd;
  }
  if (xr < -EDGE) { xr = -EDGE; vr = 0; } else if (xr > EDGE) { xr = EDGE; vr = 0; }
  for (const dir of [-1, 1]) {
    const xt = q.x + dir * d;
    if (xt < -EDGE || xt > EDGE) continue;
    const tGo = REACT_FAR + (dir * (xr - xt) >= 0 ? 0 : moveTimeFrom(xt - xr, vr));
    if (tGo > SPIT_T) continue;
    let blocked = false;
    for (const p of s.props) {
      if (!p.alive || p.passed || p.z < q.z || p.z - q.z > SPIT_LANE_Z || p.kind === 'drum') continue;   // 드럼통은 닿아도 안 다친다
      const cost = p.kind === 'wall' || p.kind === 'door' ? p.hp : p.hp * crateHitOf(s.params);
      if (cost > slack && overlap(xt - R - SPIT_OVER, xt + R + SPIT_OVER, p.x0, p.x1) > 0) { blocked = true; break; }
    }
    if (!blocked) {
      for (const w of s.saws) {
        const dz = w.z - q.z;
        if (dz < -0.5 || dz > SPIT_LANE_Z) continue;
        if (Math.abs(sawAt(w, Math.max(0, dz / vz)) - xt) < R + w.w / 2 + 0.25 + SPIT_OVER) { blocked = true; break; }
      }
    }
    if (blocked) continue;
    // 이미 날아가는 다른 독침이 떨어질 자리면 그쪽으로는 못 피한다
    for (const sp of s.spits) {
      if (sp.t > 0 && Math.abs(sp.x - xt) < R + (sp.r || SPIT_R) + 0.1) { blocked = true; break; }
    }
    if (blocked) continue;
    // 피하는 동안(반응 + 이동) 쏘지 못하고 곧 닿는 적: 도착한 뒤에야 쏜다고 본다(독침 좀비도 — 쏘는 자신을 포함해 — 부딪히면 잃는다)
    // 비켜선 자리(넘쳐 가는 SPIT_OVER m 포함)에서 닿을 적들의 못 잡는 몫을 더해 slack의 60%를 넘으면 막힌 길
    let leftSum = 0;
    for (const f of s.foes) {
      if (!f.alive) continue;
      const dz = f.z - q.z;
      if (dz < -0.5 || dz > SPIT_LANE_Z) continue;
      const tc = Math.max(0, dz) / (vz + f.spd);
      const reach = f.home * Math.max(0, tc - Math.max(0, (dz - f.homeDist) / (vz + f.spd)));
      if (Math.abs(xt - f.x) - reach >= R + f.r * 0.8 + SPIT_OVER) continue;
      leftSum += Math.max(0, f.elite === 'shield' ? f.hp - D * sk * 0.85 * Math.max(0, tc - tGo) : f.hp - D * 0.85 * Math.max(0, tc - tGo));
      if (leftSum > 0.6 * slack) { blocked = true; break; }
    }
    if (blocked) continue;
    if (foeLeftover(s.foes, xt, R, span, D, vz, q.z, sk) - here > slack) continue;
    return true;
  }
  return false;
}
function spitsUpdate(s, R) {
  const q = s.squad;
  for (const sp of s.spits) {
    sp.t -= DT;
    if (sp.t > 0) continue;
    const H = hitHalf(R);
    const sr = sp.r || SPIT_R;   // 보스 독침 범위 강화(23절)면 넓다
    const ov = overlap(q.x - H, q.x + H, sp.x - sr, sp.x + sr) / (2 * H);
    const hit = ov > 0 && Math.abs(sp.z - q.z) < R + 1.5;
    emit(s, { t: 'spitHit', x: sp.x, z: sp.z, hit });
    if (hit && !wardBlock(s, 'spit', sp.id ?? 0, sp.x, sp.z)) lose(s, Math.max(1, Math.ceil((sp.boss ? BOSS_PAT.volley.hit : 0.3) * ov * q.n), sp.boss ? Math.floor(bossLoss(s, 0, 'spit') * ov) : 0), 'spit', sp.x, sp.z);   // 보스 독침 세례는 덜 아프다   // 방패막(유물): 구간마다 처음 맞은 독침
  }
  if (s.spits.length) s.spits = s.spits.filter((sp) => sp.t > 0);
}

/* 오염 웅덩이(오염 좀비가 잡힌 자리): t초 뒤부터 해롭고(그 전은 예고), life초 뒤 사라진다. 밟으면 웅덩이마다 한 번만 잃는다 */
function poolsUpdate(s, R) {
  const q = s.squad;
  const H = hitHalf(R);
  let gone = false;
  for (const p of s.pools) {
    if (p.t > 0) { p.t -= DT; if (p.t <= 0) emit(s, { t: 'poolOn', x: p.x, z: p.z }); }
    else p.life -= DT;
    if (p.life <= 0 || p.z < q.z - 6) { gone = true; continue; }
    if (p.hit || s.phase === 'lost') continue;
    if (!touches(p.x - q.x, p.z - q.z, H, SQUAD_DEPTH * R, POOL_R, POOL_R)) continue;
    p.hit = 1;
    if (p.t > 0) continue;   // 예고 중에 밟았다(코앞에서 잡았다) — 해 없이 지나간다. 지나는 동안 발밑에서 해로워지지 않는다
    const ov = overlap(q.x - H, q.x + H, p.x - POOL_R, p.x + POOL_R) / (2 * H);
    emit(s, { t: 'poolHit', x: p.x, z: p.z });
    lose(s, Math.max(1, Math.ceil(POOL_HIT * ov * q.n)), 'pool', p.x, p.z);
  }
  if (gone) { s.pools = s.pools.filter((p) => p.life > 0 && p.z >= q.z - 6); if (!s.pools.length) delete s.pools; }
}
/* 정예 좀비가 잡혔을 때 */
function eliteDeath(s, f) {
  const q = s.squad;
  if (f.elite === 'toxic') {
    if (s.phase !== 'run') return;
    // 갈림길 안(과 해로워질 때 분대가 안에 있을 거리)에는 남기지 않는다 — 옆으로 못 피한다
    if (s.divs) for (const d of s.divs) if (f.z >= d.z0 - s.speed * (POOL_T + 0.3) && f.z <= d.z1 + 2) return;
    // 예고 = POOL_T초, 큰 분대가 멀리 비켜서야 하면 그만큼 더(공정성 P14: 이동 시간 + 반응 0.45초 — 반대로 가던 중이면 돌아서는 시간까지)
    const need = hitHalf(radius(q.n)) + POOL_R;
    const dx = f.x - q.x;
    // side 쪽으로 비켜서는 데 드는 초(웅덩이 옆 f.x ± need까지 — 길 밖이면 못 간다, 이미 비켜서 있으면 0)
    const go = (side) => {
      if (Math.abs(f.x + side * need) > EDGE) return Infinity;
      const d = need + side * dx;
      return d <= 0 ? 0 : moveTimeFrom(side * d, q.vx) + REACT_FAR;
    };
    const tl = go(-1), tr = go(1);
    const T = Math.max(POOL_T, Math.min(tl, tr, 3));
    (s.pools || (s.pools = [])).push({ id: s.nextId++, x: f.x, z: f.z, t: T, T, life: POOL_LIFE, hit: 0 });
    emit(s, { t: 'pool', x: f.x, z: f.z });
  } else if (f.elite === 'bomb') {
    bombBlast(s, f, false);   // 46.6 자폭 좀비: 쓰러지면 둘레 좀비를 날린다
  } else if (f.elite === 'split') {
    const K = ELITE.split;
    const hp = Math.max(1, Math.round(f.max * K.kidHp));
    // 갈림길 안이면 제 차선에 남는다
    let side = 0;
    if (s.divs) for (const d of s.divs) if (f.z >= d.z0 && f.z <= d.z1) side = f.x >= 0 ? 1 : -1;
    for (let i = 0; i < K.kids; i++) {
      let x = clamp(f.x + (i - (K.kids - 1) / 2) * 1.6, -4.6, 4.6);
      if (side) x = side * clamp(side * x, 0.5, 4.6);
      s.foes.push({ id: s.nextId++, kind: 'runner', x, z: f.z + 0.4 * i, hp, max: hp, alive: true, awake: true, hitT: -9, cd: 0, seed: (f.seed + 7 * (i + 1)) % 1000, ...FOE_BASE.runner, kid: 1 });
    }
    emit(s, { t: 'split', x: f.x, z: f.z, n: K.kids });
  }
}

/* 펫 효과의 크기(고정 — 레벨은 확률만 올린다). *_AVG: 기대값 모드(별 기준)에서 확률 1당 피해로 치는 몫(ENDGAME.md 6절의 어림) */
export const PET_CRIT = 2;
export const PET_FAR = 1.5;
export const PET_WIDE = 1.5;
export const PET_CHEER = 0.3;
export const PET_CHEER_CD = 4;   // 무한모드: '기운 내'가 한 번 차면 이만큼 쉰다
export const PET_CHEER_E = 0.2;   // 무한모드의 '기운 내' 한 번(캠페인은 PET_CHEER) — 쉬는 시간과 함께 게이지가 초당 많아야 5%p 더 찬다(기본 충전 16초 ≈ 초당 6%p)
export const PET_FAR_AVG = 0.5;
export const PET_WIDE_AVG = 0.2;
/* 저격총의 조준(21.2.1): 분대 앞 사거리 안 · 옆 ±(R + aim) 안에서 체력이 가장 큰 적부터 k발에 하나씩(같은 적은 한 번). 적이 모자라면 보스(사거리 안), 그다음은 정면(분대가 선 게이트 칸) */
function gunAims(s, R, gv, k) {
  const q = s.squad, out = [], used = new Set();
  const cand = [];
  for (const f of s.foes) if (f.alive && f.z > q.z + 0.5 && f.z - q.z <= gv.range && Math.abs(f.x - q.x) <= R + gv.aim) cand.push(f);
  cand.sort((a, c) => c.hp - a.hp || a.id - c.id);
  for (const f of cand) { if (out.length >= k) break; if (!used.has(f.id)) { used.add(f.id); out.push({ x: f.x, tg: f.id }); } }
  const bo = s.boss;
  while (out.length < k) {
    if (bo && bo.hp > 0 && bo.z - q.z <= gv.range) out.push({ x: clamp(bo.x + (out.length % 2 ? 0.5 : -0.5) * (out.length > 0 ? 1 : 0), bo.x - BOSS_HIT + 0.1, bo.x + BOSS_HIT - 0.1), tg: 0 });
    else out.push({ x: q.x + (out.length === 0 ? 0 : (out.length % 2 ? 0.6 : -0.6)), tg: 0 });
  }
  return out;
}
function fire(s, R) {
  const q = s.squad;
  if (q.n <= 0) return;
  const FXR = s.endless && s.endless.bld && s.endless.fx && s.endless.fx.rapid ? fx2Val('rapid', s.endless.fx.rapid) : null;   // 속사(개편 판): 쏘는 속도·보스 피해·과열
  if (FXR && FXR.heat > 1) {
    const engaged = !!s.boss || s.foes.some((f) => f.alive && f.z > q.z && f.z - q.z < BULLET_RANGE);
    q.heat = engaged ? (enhN(s, 'rapid', 'l') ? Math.max(q.heat || 0, FX_HEAT) : q.heat || 0) + DT : 0;   // 전설 강화 '즉시 과열': 맞서자마자 과열
  } else if (q.heat) q.heat = 0;
  let rateK = FXR ? FXR.rate : 1;
  const rr = enhV(s, 'rapid', 'r'), fr = enhV(s, 'flame', 'r');
  if (rr && q.rushT > s.t) rateK *= 1 + (ENH.rapid.rare.v - 1) * rr;   // 희귀 강화 '신바람': 좀비를 잡으면 잠깐 더 빨리
  if (fr && s.flames && s.flames.some((zn) => inFire(zn, q.x, q.z))) rateK *= 1 + (ENH.flame.rare.v - 1) * fr;   // 희귀 강화 '뜨거운 기운': 불 지대 위에서 더 빨리
  q.fireAcc += DT * rateK;
  // 총 종류(개편 판 — 21절): 초당 일제 사격(hz)·발 수·퍼짐·사거리. 소총 Lv1은 예전 총과 똑같다(hz 10 · volleySize · ±(R + 0.3) · 30m)
  const G = gunOf(s), gv = G ? G.v : null;
  const HZ = gv ? gv.hz : VOLLEY_HZ;
  const per = 1 / HZ;
  while (q.fireAcc >= per) {
    q.fireAcc -= per;
    q.volley++;
    const b = !gv ? volleySize(q.n) : gv.rounds ? (q.n >= 4000 ? 3 : q.n >= 400 ? 2 : 1) : gv.pel ? Math.min(gv.pelMax, Math.round(volleySize(q.n) * gv.pel)) : volleySize(q.n);
    const hm = heroDmg(s);
    let dmg = (dps(q.n, q.tier, s.fireLv) * hm) / (HZ * b) * (gv ? gv.dmg : 1);
    const bst = gv && gv.burst && q.volley % gv.burst.every === 0 ? gv.burst : null;   // 소총 Lv5 점사: every번째 일제 사격마다 ×k
    if (bst) dmg *= bst.k;
    const A = s.ammo ? AMMO[s.ammo] : null;
    const FX = s.endless && s.endless.fx;
    if (FX) {
      // 2단계: 출격 탄종의 약점(한 발 피해 −)은 그대로, 속사 효과의 좋은 점(화력 +)은 그 레벨만큼. 개편 판은 약점이 없다(ENDGAME.md 18.2)
      if (A && A.dmg < 1 && !s.endless.bld) dmg *= A.dmg;
      if (FX.rapid) dmg *= fxV(s, 'rapid', FX.rapid).dmg * (FXR && FXR.heat > 1 && q.heat >= FX_HEAT ? FXR.heat : 1);
    } else if (A && A.dmg) dmg *= A.dmg;
    const B = s.endless && s.endless.bld;
    if (B && B.gun) dmg *= 1 + BUILD.gun * B.gun;   // 무기 개조(옛 저장의 값만 — 총 ★로 합쳐졌다)
    const rng = gv ? (gv.range !== BULLET_RANGE ? gv.range : 0) : A && A.range && !(FX && s.endless.bld) ? A.range : 0;   // 탄종의 사거리(없으면 기본 — 개편 판은 약점이 없어 총의 사거리)
    const span = R + (gv ? gv.spread : 0.3);
    const aims = gv && gv.rounds ? gunAims(s, R, gv, b) : null;   // 저격총: 한 발마다 조준한 표적
    // 펫의 확률 효과(크리티컬은 총알마다, 멀리·넓게 쏘기는 일제 사격마다 굴린다 — 펫 전용 난수). avg면 기대값만큼 피해를 고르게 올린다
    // 여러 마리면 효과마다 그 펫이 따로 굴린다(한 마리 판은 예전과 같은 난수 순서)
    const pCrit = petBy(s, 'crit'), pFar = petBy(s, 'far'), pWide = petBy(s, 'wide');
    const ppC = pCrit ? petP(pCrit.id, pCrit.lv) : 0;
    let far = false;
    let wide = false;
    let crits = 0;
    if (pCrit && pCrit.avg) dmg *= 1 + ppC;
    if (pFar) { const pp = petP(pFar.id, pFar.lv); if (pFar.avg) dmg *= s.phase === 'run' ? 1 + PET_FAR_AVG * pp : 1; else far = rand(pFar) < pp; }
    if (pWide) { const pp = petP(pWide.id, pWide.lv); if (pWide.avg) dmg *= 1 + PET_WIDE_AVG * pp; else wide = rand(pWide) < pp; }
    const rLeg = FXR ? enhN(s, 'rapid', 'l') : 0;
    const split = rLeg ? legK(rLeg) - 1 : FXR && FXR.evo2 && q.heat >= FX_HEAT ? 0.6 : 0;
    for (let i = 0; i < b; i++) {
      // 고르게 퍼뜨리되 매번 조금씩 어긋나게(황금비 수열 — 난수를 쓰지 않는다)
      const j = ((q.volley * 0.618034 + i * 0.381966) % 1) - 0.5;
      let x = q.x - span + ((i + 0.5 + j * 0.8) / b) * 2 * span;
      if (aims) x = clamp(aims[i].x, q.x - R, q.x + R);   // 43절: 저격총은 분대 앞(몸 폭 안)에서 쏘고 표적 쪽으로 휘어 간다 — 표적 자리에서 총알이 생기지 않게
      const bl = { x, z: q.z + 0.4 * R, d: 0, dmg, hm };
      if (far || rng) bl.r = (rng || BULLET_RANGE) * (far ? PET_FAR : 1);
      if (gv && G.id !== 'rifle') {
        if (G.id === 'shotgun') { bl.g = 's'; bl.base = dmg; if (gv.slug) bl.slug = gv.slug / b; }   // 산탄: 거리로 줄어드는 피해(bulletsUpdate), 슬러그는 펠릿마다 나눠 민다
        else { bl.g = 'm'; if (gv.thru) bl.thru = 1; bl.tx = aims[i].x; if (aims[i].tg) bl.tg = aims[i].tg; }   // 저격: 조준한 적(tx)을 따라 휘어 간다 · 넘침 관통은 Lv5(진화)부터(48절)
      }
      if (bst && bst.thru) bl.thru = 1;   // 소총 Lv10 관통 점사
      if (pCrit && !pCrit.avg && rand(pCrit) < ppC) { bl.dmg = dmg * PET_CRIT; bl.c = 1; crits++; }
      s.bullets.push(bl);
      if (split > 0) s.bullets.push({ ...bl, x: bl.x + (i % 2 ? 0.3 : -0.3), dmg: bl.dmg * split });   // 속사 Lv10 쌍갈래 과열: 과열 중 총알이 둘로 갈라진다 · 전설 강화 '탄막 폭풍': 늘
    }
    if (wide) {
      // 양옆에 총알을 더: 가운데 밀도는 그대로, 폭만 PET_WIDE배(옆에 뭔가 있을 때만 맞는다)
      const ex = Math.max(2, 2 * Math.round(b / 4));
      for (let i = 0; i < ex; i++) {
        const sd = i % 2 ? 1 : -1;
        const u = (Math.floor(i / 2) + 0.5) / (ex / 2);
        const wb = { x: q.x + sd * span * (1 + (PET_WIDE - 1) * u), z: q.z + 0.4 * R, d: 0, dmg, hm, w: 1 };
        if (rng) wb.r = rng;
        s.bullets.push(wb);
      }
    }
    if (far) { pFar.procs++; emit(s, { t: 'pet', fx: 'far', n: 0, x: q.x, z: q.z }); }
    if (wide) { pWide.procs++; emit(s, { t: 'pet', fx: 'wide', n: 0, x: q.x, z: q.z }); }
    if (crits) { pCrit.procs += crits; emit(s, { t: 'pet', fx: 'crit', n: crits, x: q.x, z: q.z }); }
    emit(s, { t: 'shot', b });
  }
}

/* 43절: 저격총 총알이 표적 쪽으로 휘는 기울기(앞으로 1m에 옆으로 m) — 조준 폭 끝(분대 몸 밖 2.5m)의 적도 6m 앞이면 닿는다 */
const MK_STEER = 0.6;
/* 39.1: 넘침 관통으로 쓰러뜨리는 동안 1 — 쓰러질 때 탄 효과(유폭·얼음 번짐·전염·치료·산성 웅덩이)를 안 낸다 */
let noFx = 0;
function bulletsUpdate(s) {
  const q = s.squad;
  const adv = BULLET_SPEED * DT;
  const list = s.bullets;
  // 총알이 이번 틱에 닿을 수 있는 적만 미리 고른다(순서 그대로 — 결과는 같고 빠르다)
  const GU = gunOf(s), gw = GU ? GU.v : null;   // 총 종류(21절): 사거리·벽·보스 배수, 산탄 감쇠, 저격 관통 예산·헤드샷
  const zMax = q.z + Math.max(BULLET_RANGE, gw ? gw.range : 0) * (petBy(s, 'far') ? PET_FAR : 1) + 4;
  const near = [];
  if (list.length) for (const f of s.foes) if (f.alive && f.z - f.r < zMax) near.push(f);
  const FX = s.endless && s.endless.fx;
  // 개편 판: 관통·작렬 효과가 벽·장갑문·보스에도 든다(wallK — 덧효과가 좀비에만 들면 벽 앞에서 빌드가 꺼진다), 빙결은 언 적이 받는 총알 피해를 키운다
  const B2 = FX && s.endless.bld ? FX : null;
  const wallK = (B2 && B2.pierce ? fx2Val('pierce', B2.pierce).wall * legKs(s, 'pierce') : 1) * (1 + ENH.pierce.rare.v * enhV(s, 'pierce', 'r'));   // 전설 강화 '벽 뚫기': ×legK   // 관통 Lv3+: 벽·장갑문 피해 +50%, 희귀 강화 '터지는 총알': +30%
  const bossK = (B2 && B2.rapid ? fx2Val('rapid', B2.rapid).boss : 1) * (gw ? gw.boss : 1);   // 속사 Lv3+: 보스에게 +30%, 저격총 ×1.3~
  const gWall = gw ? gw.wall : 1;   // 산탄총 벽·장갑문 ×1.6~
  const gateK = B2 && B2.cure ? fx2Val('cure', B2.cure).gate : 1;   // 치료 Lv3+: 덧셈 칸 쏘아 올리는 폭 +25%(24절)
  const hornOff = !!(s.endless && s.endless.bld);   // 46.7: 개편 판의 돌격 나팔(총알 b.hm)은 덧셈 칸에 안 든다
  const acidArm = !!(B2 && B2.acid && fx2Val('acid', B2.acid).arm);   // 부식 Lv4+: 장갑·방패도 제 피해
  const acidBoss = B2 && B2.acid && fx2Val('acid', B2.acid).melt;   // 부식 Lv5: 보스는 겹마다 받는 총알 피해 +boss
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.g === 's' && gw) b.dmg = b.base * (b.d <= gw.near ? 1 : 1 - (1 - gw.fall) * Math.min(1, (b.d - gw.near) / Math.max(1, gw.range - gw.near)));   // 산탄: near m 뒤로 range에서 fall까지 준다
    if (b.tg) { const f = near.find((o) => o.id === b.tg); if (f && f.alive) b.tx = f.x; else b.tg = 0; }   // 저격: 조준한 적을 따라간다
    if (b.tx != null) { const m = adv * MK_STEER, dx = clamp(b.tx - b.x, -m, m); b.x += dx; b.dx = dx / adv; if (!b.tg && Math.abs(b.tx - b.x) < 1e-6) delete b.tx; }   // 43절: 옆으로는 앞으로 1m에 MK_STEER m까지 — 분대 앞에서 표적 쪽으로 휘어 간다
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
    for (const f of near) {
      if (!f.alive || f.z < z0 - f.r || f.z > z1 + f.r) continue;
      if (Math.abs(f.x - b.x) > f.r + 0.12) continue;
      if (f.z < bestZ) { bestZ = f.z; hitKind = 3; hitObj = f; }
    }
    const bo = s.boss;
    if (bo && bo.hp > 0 && bo.z - 1 <= z1 && Math.abs(bo.x - b.x) < BOSS_HIT && bo.z - 1 < bestZ) { bestZ = bo.z - 1; hitKind = 4; hitObj = bo; }

    if (hitKind === 1) { cellShot(s, hitObj, hitCell, (hornOff && b.hm > 1 ? b.dmg / b.hm : b.dmg) * gateK, b.x); continue; }   // 치료 Lv3+: 쏘아 올리는 폭 +25% · 개편 판 돌격 나팔은 게이트에 안 든다(46.7)
    // 장갑문은 총알 종류만큼(doorMul), 방패 정예는 정면 총알을 막는다(shieldMul — 관통 효과면 제 피해). 둘 다 2단계 판의 4구간부터만 있다
    if (gw && hitKind === 2) {   // 개편 판(총 종류): 벽·장갑문 × 총의 벽 배수, 산탄 Lv10 파편(부순 벽 뒤 4m에 벽 체력의 몫)
      const wd = hitObj.kind === 'wall' || hitObj.kind === 'door', was = hitObj.alive;
      if (wd && B2 && B2.acid) acidAdd(s, hitObj, B2);   // 부식: 벽·장갑문에도 겹
      hitProp(s, hitObj, (hitObj.kind === 'door' ? b.dmg * doorMul(s) : b.dmg) * (wd ? wallK * gWall : 1));
      if (wd && was && !hitObj.alive && b.g === 's' && gw.shard) fxBoom(s, (hitObj.x0 + hitObj.x1) / 2, hitObj.z + 2.5, 3, hitObj.max * gw.shard);
      if (wd && B2 && B2.pierce && B2.pierce >= 10) wallThru(s, b, hitObj, near, B2.pierce);
      if (wd && legOn(s, 'pierce')) ricochet(s, b, hitObj);   // 34절 관통 전설 '도탄'
      continue;
    }
    if (gw && hitKind === 3) {   // 개편 판(총 종류): 저격·관통 점사는 남는 피해가 같은 줄 뒤로 이어 간다(관통 예산), 저격 헤드샷·터지는 한 발, 산탄 슬러그
      const f = hitObj, hp0 = f.hp, mul = (f.elite === 'shield' && !acidArm ? shieldMul(s) : 1) * (f.arm && !((fxOf(s) && fxOf(s).pierce) || acidArm) ? f.arm : 1);
      if (b.th) noFx = 1;   // 39.1: 넘침 관통으로 이어 간 총알(둘째 좀비부터)은 피해만 — 맞을 때·쓰러질 때 탄 효과는 처음 맞힌 좀비에게만
      let kill = hitFoe(s, f, b.dmg * mul, 'gun');
      noFx = 0;
      if (!b.th) { if (FX) fxHit2(s, b, f, near, FX); else if (s.ammo) ammoHit(s, b, f, near); }   // 탄 효과가 없는 개편 판(1단계)은 출격 탄종 그대로
      if (!kill && b.g === 'm' && gw.head && f.alive && f.kind !== 'brute' && !f.elite && f.hp <= gw.head * f.max) { if (b.th) noFx = 1; kill = hitFoe(s, f, f.hp, 'gun'); noFx = 0; }   // 헤드샷(둘째부터는 쓰러질 때 탄 효과 없이)
      if (kill && b.g === 'm' && gw.pop) fxBoom(s, f.x, f.z, 1.6, f.max * gw.pop, f);   // 터지는 한 발(41절: 저격총 자체의 능력이라 넘침으로 쓰러뜨린 적도 터진다 — 탄 효과만 첫 상대에게)
      if (b.slug && f.alive) f.z += b.slug;   // 슬러그: 맨 앞(맞은) 적을 밀어낸다
      const left = kill && b.thru ? b.dmg - hp0 / mul : 0;
      if (left > b.dmg * 0.02) { b.th = 1; b.dmg = left; if (b.g === 's') b.base = left; b.tg = 0; delete b.tx; b.dx = 0; b.z = f.z + 0.01; list[w++] = b; }   // 남은 피해로 계속 날아간다
      continue;
    }
    if (B2 && hitKind === 2) { const wd = hitObj.kind === 'wall' || hitObj.kind === 'door'; if (wd && B2.acid) acidAdd(s, hitObj, B2); hitProp(s, hitObj, (hitObj.kind === 'door' ? b.dmg * doorMul(s) : b.dmg) * (wd ? wallK : 1)); if (wd && B2.pierce && B2.pierce >= 10) wallThru(s, b, hitObj, near, B2.pierce); if (wd && legOn(s, 'pierce')) ricochet(s, b, hitObj); continue; }   // 관통 Lv10 · 전설 강화 '벽 뚫기'
    if (B2 && hitKind === 3) { hitFoe(s, hitObj, (hitObj.elite === 'shield' && !acidArm ? b.dmg * shieldMul(s) : b.dmg) * (hitObj.arm && !((fxOf(s) && fxOf(s).pierce) || acidArm) ? hitObj.arm : 1), 'gun'); fxHit2(s, b, hitObj, near, FX); continue; }
    if (hitKind === 2) { hitProp(s, hitObj, hitObj.kind === 'door' ? b.dmg * doorMul(s) : b.dmg); continue; }
    if (hitKind === 3) { hitFoe(s, hitObj, hitObj.elite === 'shield' ? b.dmg * shieldMul(s) : b.dmg, 'gun'); if (FX) fxHit(s, b, hitObj, near, FX); else if (s.ammo) ammoHit(s, b, hitObj, near); continue; }
    if (hitKind === 4) {
      // 뭉치 스킬로 늘어난 몫은 특수병·영웅 보너스 예산에서만 들어간다(보스가 너무 빨리 녹지 않게)
      const ak = acidBoss ? 1 + FX_NEW.acid.boss * Math.min(15, bo.acid | 0) : 1;   // 부식 Lv5 녹아내림: 보스는 겹마다 +1%(15겹까지)
      if (B2 && B2.acid) acidAdd(s, bo, B2);
      const base = (b.hm > 1 ? b.dmg / b.hm : b.dmg) * bossK * ak * (bo.markT > s.t ? 1 + ENH.sniper.legend.v * legK2(s, 'sniper') : 1);   // 34절 저격수 전설 '약점 표시'
      dmgLog(s, 'gun', Math.min(base, Math.max(0, bo.hp)));
      bo.hp -= base;
      if (base < b.dmg * bossK * ak) hitBossBonus(s, b.dmg * bossK * ak - base, 'hero');
      bo.hitT = s.t;
      continue;
    }
    b.z = z1;
    b.d += adv;
    if (b.d < (b.r || BULLET_RANGE)) list[w++] = b;
  }
  list.length = w;
}

/* 덧셈 칸 c(줄 row)에 피해 dmg만큼 쏘아 올린다(총알 · 전격 Lv5 전도) */
function cellShot(s, row, c, dmg, x) {
  c.acc += dmg;
  c.hitT = s.t;
  const was = c.v;
  let ticks = 0;
  // 병력이 아주 큰 무한모드 판: 한 발이 수천 칸을 올리면 한꺼번에 센다(하나씩 세면 판이 멎는다). 보통 판은 아래 걸음 그대로
  if (c.acc >= c.step * 4096 && c.v < c.cap) { const k = Math.min(Math.floor(c.acc / c.step) - 1, c.cap - c.v); c.acc -= k * c.step; c.v += k; ticks += k; }
  while (c.acc >= c.step && c.v < c.cap) { c.acc -= c.step; c.v++; ticks++; }
  if (c.v >= c.cap) c.acc = 0;
  if (ticks) {
    emit(s, { t: 'tick', row: row.id, v: c.v, x, z: row.z });
    // 역전(SIM 9): 빨간 칸이 0을 넘어 파랑이 됐다(화면 '역전!' — 상태는 바꾸지 않는다)
    if (was <= 0 && c.v > 0 && c.v0 < 0) { s.stats.flips++; emit(s, { t: 'flip', row: row.id, v: c.v, cap: c.cap, x: (c.x0 + c.x1) / 2, x0: c.x0, x1: c.x1, z: row.z }); }
    if (c.v >= c.cap && c.v0 < 0 && c.cap > 0) emit(s, { t: 'capped', row: row.id, v: c.v, x: (c.x0 + c.x1) / 2, z: row.z });
  }
}
/* 34절 관통 전설 '도탄': 벽·장갑문에 맞은 총알이 튕겨 나와, 그 벽 앞 12m 안 좀비 n마리(가까운 차례)에게 총알 피해 그대로 */
function ricochet(s, b, w) {
  const L = ENH.pierce.legend, n = Math.round(L.n * legK2(s, 'pierce'));
  const q = s.squad, list = [];
  for (const f of s.foes) { if (!f.alive || f.z > w.z || f.z < q.z || w.z - f.z > L.reach || Math.abs(f.x - b.x) > L.side) continue; list.push(f); }
  if (!list.length) return;
  list.sort((a, c) => (w.z - a.z) + Math.abs(a.x - b.x) - (w.z - c.z) - Math.abs(c.x - b.x) || a.id - c.id);
  for (let i = 0; i < Math.min(n, list.length); i++) { const f = list[i]; emit(s, { t: 'ricochet', x0: b.x, z0: w.z, x1: f.x, z1: f.z }); hitFoe(s, f, b.dmg, 'gun', 'pierce'); }
}
/* ---------- 24절 새 탄: 전격 · 부식 · 치료(개편 판만) ---------- */
/* 전격: 맞은 좀비 f에서 v.r m 안 가장 가까운 좀비로 n번 튄다(맞은 적은 다시 안 맞는다). Lv5 전도 — 마지막 자리에서 v.r m 안 덧셈 칸도 올린다 */
function shockChain(s, b, f, near, fx) {
  const v = fx2Val('shock', fx.shock);
  const n = v.n + Math.round(enhV(s, 'shock', 'r') * ENH.shock.rare.n);
  const d = b.dmg * v.chain * legKs(s, 'shock');
  const seen = new Set([f.id]);
  const pts = [f.x, f.z];
  let cur = f, r2 = v.r * v.r;
  for (let i = 0; i < n; i++) {
    let best = null, bd = r2;
    for (const o of near) { if (!o.alive || seen.has(o.id)) continue; const dx = o.x - cur.x, dz = o.z - cur.z, dd = dx * dx + dz * dz; if (dd <= bd) { bd = dd; best = o; } }
    if (!best) break;
    seen.add(best.id);
    pts.push(best.x, best.z);
    hitFoe(s, best, d, 'chain', 'shock');
    if (best.alive && legOn(s, 'shock')) best.stunT = s.t + ENH.shock.legend.T * legK2(s, 'shock');   // 34절 전설 '감전'
    cur = best;
  }
  if (v.conduct) {   // 전도: 사슬 끝에서 가까운 덧셈 칸
    for (const row of s.rows) {
      if (row.done || Math.abs(row.z - cur.z) > v.r) continue;
      let c = null;
      for (const cc of row.cells) if (cc.op === 'add' && (!c || Math.abs((cc.x0 + cc.x1) / 2 - cur.x) < Math.abs((c.x0 + c.x1) / 2 - cur.x))) c = cc;
      if (c) { cellShot(s, row, c, d, (c.x0 + c.x1) / 2); pts.push((c.x0 + c.x1) / 2, row.z); }
      break;
    }
  }
  if (pts.length > 2) emit(s, { t: 'zap', pts });
}
/* 부식: 대상 o(좀비·벽·장갑문·보스)에 1겹. 겹은 v.max까지, v.T초(희귀 강화 '진한 산'이면 더 길게) — 겹마다 초당 총알 피해의 v.dot */
function acidAdd(s, o, fx) {
  const v = fx2Val('acid', fx.acid);
  o.acid = Math.min(v.max, (o.acid | 0) + 1);
  o.acT = s.t + Math.max(v.T, enhN(s, 'acid', 'r') ? ENH.acid.rare.T * enhStr(enhN(s, 'acid', 'r')) : 0);
}
/* 부식 겹 하나의 초당 피해(지금 분대의 초당 총알 피해 × v.dot × 전설 '용해') */
function acidPer(s) {
  const q = s.squad, fx = s.endless.fx, G = gunOf(s);
  return fx2Val('acid', fx.acid).dot * dps(q.n, q.tier, s.fireLv) * (G ? G.v.dmg : 1) * legKs(s, 'acid');
}
/* 산성 웅덩이(부식 Lv10 · 전설 '용해'): 무너진 벽·죽은 거구 자리에 poolT초 — 안의 좀비에게 0.5초마다 1겹 */
function acidPool(s, x, z) {
  const fx = s.endless.fx;
  if (!fx || !fx.acid || !fx2Val('acid', fx.acid).pool) return;
  const A = FX_NEW.acid;
  if ((s.acids || (s.acids = [])).length >= 8) return;
  s.acids.push({ x, z, r: A.poolR, t: A.poolT });
  emit(s, { t: 'acidPool', x, z, r: A.poolR, T: A.poolT });
}
/* 치료: 잡은 좀비(보스 졸개는 Lv5 집단 치료부터)가 확률로 사람으로 — 구간 기준 병력 B(k)의 unit씩, 구간마다 cap까지 */
const cureBk = (e) => Math.max(60, segBk(e.seg));
function cureKill(s, f) {
  const e = s.endless, fx = e.fx;
  const v = fx2Val('cure', fx.cure);
  if (s.phase === 'arena' && !v.mass) return;
  if (e.cureSeg !== e.seg) { e.cureSeg = e.seg; e.cureN = 0; e.cureAcc = 0; }
  const Bk = cureBk(e), cap = Bk * v.cap;
  if (e.cureN >= cap) return;
  const big = f.kind === 'brute' || !!f.elite;
  const w = (f.kind === 'brute' ? v.brute : 1) * (big && enhN(s, 'cure', 'r') ? ENH.cure.rare.n * enhStr(enhN(s, 'cure', 'r')) : 1);
  const p = v.p * legKs(s, 'cure') * (comboOn(s, 'cureMedic') ? 1 + COMBOS.cureMedic.v * comboK(s, 'cureMedic') : 1);
  e.cureAcc = (e.cureAcc || 0) + p * w;
  if (e.cureAcc < 1) return;
  const k = Math.floor(e.cureAcc);
  e.cureAcc -= k;
  const n = Math.max(1, Math.min(k * Math.max(1, Math.round(Bk * FX_NEW.cure.unit)), Math.ceil(cap - e.cureN)));
  e.cureN += n;
  gain(s, n, f.x, f.z, 'cure');
  if (s.hero && legOn(s, 'cure')) chargeHero(s, ENH.cure.legend.v * legK2(s, 'cure'));   // 34절 전설 '영웅의 귀환'
  emit(s, { t: 'cure', n, x: f.x, z: f.z });
}
/* 매 틱(개편 판 · 새 탄을 가진 판): 부식 겹의 피해·녹아내림·산성 웅덩이, 전격 Lv10 뇌운 */
function fxNewUpdate(s) {
  const e = s.endless, fx = e.fx;
  if (fx.acid || s.acids) {
    const per = fx.acid ? acidPer(s) : 0, v = fx.acid ? fx2Val('acid', fx.acid) : null;
    if (per > 0) {
      for (const f of s.foes) {
        if (!f.acid) continue;
        if (!f.alive || f.acT <= s.t) { f.acid = 0; continue; }
        hitFoe(s, f, f.acid * per * DT, 'acid');
      }
      for (const p of s.props) {
        if (!p.acid) continue;
        if (!p.alive || p.acT <= s.t) { p.acid = 0; continue; }
        hitProp(s, p, p.acid * per * v.wall * DT);
        if (p.alive && v.melt && p.acid >= 15 && p.hp < p.max * FX_NEW.acid.melt) { emit(s, { t: 'melt', x: (p.x0 + p.x1) / 2, z: p.z }); hitProp(s, p, p.hp + 1); }   // 녹아내림
      }
      const b = s.boss;
      if (b && b.acid && b.hp > 0) { if (b.acT <= s.t) b.acid = 0; else { dmgLog(s, 'acid', Math.min(b.acid * per * DT, b.hp)); b.hp -= b.acid * per * DT; b.hitT = s.t; } }
    }
    if (s.acids) {
      for (const pl of s.acids) {
        pl.t -= DT;
        if (!fx.acid) continue;
        for (const f of s.foes) if (f.alive && (f.acP || 0) <= s.t && (f.x - pl.x) ** 2 + (f.z - pl.z) ** 2 <= pl.r * pl.r) { acidAdd(s, f, fx); f.acP = s.t + 0.5; }
      }
      s.acids = s.acids.filter((pl) => pl.t > 0);
      if (!s.acids.length) delete s.acids;
    }
  }
  if (fx.shock && fx2Val('shock', fx.shock).bolt) {   // 뇌운(Lv10 · 전설 '천둥 신'): boltCd초마다 가장 촘촘한 무리에 벼락
    e.boltT = (e.boltT ?? FX_NEW.shock.boltCd) - DT;
    if (e.boltT <= 0) {
      e.boltT = FX_NEW.shock.boltCd;
      const q = s.squad, R2 = FX_NEW.shock.boltR ** 2;
      const live = s.foes.filter((f) => f.alive && f.z > q.z && f.z - q.z < 30);
      let best = null, bn = 0;
      for (const f of live) { let n = 0; for (const o of live) if ((o.x - f.x) ** 2 + (o.z - f.z) ** 2 <= R2) n++; if (n > bn) { bn = n; best = f; } }
      if (best) {
        const G = gunOf(s), d = dps(q.n, q.tier, s.fireLv) * (G ? G.v.dmg : 1) * legKs(s, 'shock');
        const x = best.x, z = best.z;
        for (const o of live) if (o.alive && (o.x - x) ** 2 + (o.z - z) ** 2 <= R2) hitFoe(s, o, d, 'chain', 'shock');
        emit(s, { t: 'bolt', x, z, r: FX_NEW.shock.boltR });
      }
    }
  }
}
/* 탄종의 덧효과(총알이 좀비 f에 맞은 뒤): 관통 — 같은 줄 바로 뒤(남은 사거리 안) 좀비 하나에 몫, 작렬 — 둘레 r 안 다른 좀비에 몫,
   빙결 — 맞은 좀비가 T초 느려진다. 게이트·벽·상자·보스에는 덧효과가 없다 */
function ammoHit(s, b, f, near) {
  const A = AMMO[s.ammo];
  if (A.pierce) {
    const left = (b.r || BULLET_RANGE) - b.d;
    let g = null;
    for (const o of near) {
      if (!o.alive || o === f || o.z <= f.z || o.z - b.z > left) continue;
      if (Math.abs(o.x - b.x) > o.r + 0.12) continue;
      if (!g || o.z < g.z) g = o;
    }
    if (g) { emit(s, { t: 'pierce', x: b.x, z0: f.z, z1: g.z }); hitFoe(s, g, b.dmg * A.pierce, 'gun', 'pierce'); }
  } else if (A.splash) {
    const r2 = A.r * A.r;
    let n = 0;
    for (const o of near) {
      if (!o.alive || o === f) continue;
      const dx = o.x - f.x, dz = o.z - f.z;
      if (dx * dx + dz * dz > r2) continue;
      hitFoe(s, o, b.dmg * A.splash, 'gun', 'splash');
      n++;
    }
    if (n) emit(s, { t: 'splash', x: f.x, z: f.z, r: A.r, n });
  } else if (A.slow && f.alive) f.slowT = s.t + A.T;
}
/* 탄 효과의 덧효과(2단계 — 가진 효과가 모두 든다): 관통(바로 뒤 좀비 하나) → 작렬(둘레 — 관통 + 작렬 '연쇄 폭발'이면 뚫고 지난 좀비 둘레에서도) → 빙결.
   1단계의 ammoHit과 같은 판정(뒤의 좀비 고르기·둘레·느려짐)을 레벨 수치로 */
function fxHit(s, b, f, near, fx) {
  let g = null;
  if (fx.pierce) {
    const left = (b.r || BULLET_RANGE) - b.d;
    for (const o of near) {
      if (!o.alive || o === f || o.z <= f.z || o.z - b.z > left) continue;
      if (Math.abs(o.x - b.x) > o.r + 0.12) continue;
      if (!g || o.z < g.z) g = o;
    }
    if (g) { emit(s, { t: 'pierce', x: b.x, z0: f.z, z1: g.z }); hitFoe(s, g, b.dmg * fxVal('pierce', fx.pierce).pierce, 'gun', 'pierce'); }
  }
  if (fx.burst) {
    const v = fxVal('burst', fx.burst);
    fxSplash(s, b, f, near, v);
    if (g) fxSplash(s, b, g, near, v);
  }
  if (fx.frost && f.alive) f.slowT = s.t + fxVal('frost', fx.frost).T;
}
/* 개편 판의 덧효과: 관통은 일직선 뒤 n마리(진화하면 모두 — 한 발에 PIERCE_MAX까지), 작렬은 맞은 좀비와 뚫고 지난 좀비(둘까지) 둘레, 빙결 */
const PIERCE_MAX = 8;
/* 관통 Lv10 벽 너머 관통: 벽·문에 맞은 총알이 벽 뒤(12m 안) 일직선의 좀비 셋까지 뚫는다 */
function wallThru(s, b, w, near, lv) {
  const v = fx2Val('pierce', lv);
  const line = near.filter((o) => o.alive && o.z > w.z && o.z - w.z < 12 && Math.abs(o.x - b.x) <= o.r + 0.12).sort((a, c) => a.z - c.z || a.id - c.id).slice(0, 3);
  const pv = v.pierce;
  for (const o of line) hitFoe(s, o, b.dmg * pv, 'gun', 'pierce');
  if (line.length) emit(s, { t: 'pierce', x: b.x, z0: w.z, z1: line[line.length - 1].z });
}
function fxHit2(s, b, f, near, fx) {
  const hits = [];
  if (fx.pierce) {
    const v = fx2Val('pierce', fx.pierce);
    const left = (b.r || BULLET_RANGE) - b.d;
    const line = [];
    for (const o of near) {
      if (!o.alive || o === f || o.z <= f.z || o.z - b.z > left) continue;
      if (Math.abs(o.x - b.x) > o.r + 0.12) continue;
      line.push(o);
    }
    line.sort((a, c) => a.z - c.z || a.id - c.id);
    const n = Math.min(v.n, line.length, PIERCE_MAX);
    const pv = v.pierce;
    for (let i = 0; i < n; i++) { hits.push(line[i]); hitFoe(s, line[i], b.dmg * pv * (1 + v.ramp * i), 'gun', 'pierce'); }   // Lv5: 뚫을 때마다 다음 대상 피해 +ramp
    if (n) emit(s, { t: 'pierce', x: b.x, z0: f.z, z1: line[n - 1].z });
  }
  if (fx.burst) {
    const v = fx2Val('burst', fx.burst);
    fxSplash(s, b, f, near, v);
    for (let i = 0; i < hits.length && i < 2; i++) fxSplash(s, b, hits[i], near, v);
  }
  if (fx.shock) shockChain(s, b, f, near, fx);   // 전격(24절)
  if (fx.acid && f.alive) acidAdd(s, f, fx);   // 부식(24절)
  if (fx.frost && f.alive) {
    if (!(f.slowT > s.t)) f.slowFrom = s.t;   // 느려지기 시작한 때(빙결 Lv10 — 3초 지나면 얼어붙는다)
    f.slowT = s.t + fx2Val('frost', fx.frost).T * legKs(s, 'frost');   // 전설 강화 '절대 영도': 느려지는 시간 ×legK
  }
}
function fxSplash(s, b, f, near, v) {
  const r2 = v.r * v.r;
  const leg = legOn(s, 'burst'), BL = ENH.burst.legend;
  const lk = leg ? BL.mul * legK2(s, 'burst') : 1;   // 34절 전설 '끌어모으기': 둘레 피해 ×mul
  if (leg) {   // 둘레 2배 반경 안 좀비를 가운데로 pull m(보스·거구는 반) — 다음 폭발에 더 많이 맞는다
    const R2 = 4 * r2;
    for (const o of near) {
      if (!o.alive || o === f) continue;
      const dx = o.x - f.x, dz = o.z - f.z, dd = dx * dx + dz * dz;
      if (dd > R2 || dd < 0.01) continue;
      const d = Math.sqrt(dd), m = Math.min(d * 0.8, BL.pull * (o.kind === 'brute' ? 0.5 : 1));
      o.x -= (dx / d) * m; o.z -= (dz / d) * m;
    }
  }
  let n = 0;
  for (const o of near) {
    if (!o.alive || o === f) continue;
    const dx = o.x - f.x, dz = o.z - f.z;
    if (dx * dx + dz * dz > r2) continue;
    hitFoe(s, o, b.dmg * v.splash * lk, 'gun', 'splash');
    n++;
  }
  if (n || leg) emit(s, { t: 'splash', x: f.x, z: f.z, r: v.r, n, pull: leg ? v.r * 2 : 0 });
  const rb = enhV(s, 'burst', 'r');
  if (rb && (!s.flames || s.flames.length < 12)) {   // 희귀 강화 '불씨 폭발': 폭발한 자리에 잠깐 불
    const zn = { id: s.nextId++, x: f.x, z: f.z, w: v.r * 1.4, len: v.r * 1.4, t: ENH.burst.rare.t, T: ENH.burst.rare.t, d: b.dmg * v.splash * 2 * rb, lv: 1, src: 'ember' };
    (s.flames || (s.flames = [])).push(zn);
    emit(s, { t: 'flame', id: zn.id, x0: f.x, z0: f.z, x: zn.x, z: zn.z, w: zn.w, len: zn.len, T: zn.T, lv: 1, boss: false });
  }
}
/* 덧셈 칸을 dmg만큼 쏜 것으로 올린다(총알이 칸을 맞힐 때와 같은 식 — 폭발·강화가 쓴다) */
function raiseCell(s, row, c, dmg, x) {
  c.acc += dmg;
  c.hitT = s.t;
  const was = c.v;
  let ticks = 0;
  if (c.acc >= c.step * 4096 && c.v < c.cap) { const k = Math.min(Math.floor(c.acc / c.step) - 1, c.cap - c.v); c.acc -= k * c.step; c.v += k; ticks += k; }
  while (c.acc >= c.step && c.v < c.cap) { c.acc -= c.step; c.v++; ticks++; }
  if (c.v >= c.cap) c.acc = 0;
  if (ticks) {
    emit(s, { t: 'tick', row: row.id, v: c.v, x, z: row.z });
    if (was <= 0 && c.v > 0 && c.v0 < 0) { s.stats.flips++; emit(s, { t: 'flip', row: row.id, v: c.v, cap: c.cap, x: (c.x0 + c.x1) / 2, x0: c.x0, x1: c.x1, z: row.z }); }
  }
}

/* 피해 공용 처리(총알·저격·로켓·영웅) */
function hitProp(s, p, dmg) {
  p.hp -= dmg;
  p.hitT = s.t;
  if (p.hp > 0) return;
  p.alive = false;
  if (p.kind === 'wall') emit(s, { t: 'wallBreak', x: (p.x0 + p.x1) / 2, z: p.z });
  else if (p.kind === 'door') emit(s, { t: 'wallBreak', x: (p.x0 + p.x1) / 2, z: p.z, kind: 'door' });
  else if (p.kind === 'drum') drumBlast(s, p, 'shot');
  else openCrate(s, p);
  if ((p.kind === 'wall' || p.kind === 'door') && bldOf(s) && s.endless.fx && s.endless.fx.acid) acidPool(s, (p.x0 + p.x1) / 2, p.z);   // 산성 웅덩이(부식 Lv10)
  if ((p.kind === 'wall' || p.kind === 'door') && relicOn(s, 'charge') && bldOf(s)) {   // 폭약 배낭(24절): 무너진 벽이 터져 둘레 좀비에게 벽 최대 체력의 v
    const C = RELICS.charge, x = (p.x0 + p.x1) / 2, r2 = C.r * C.r;
    const ev = { t: 'blast', x, z: p.z, r: C.r, by: 'charge', n: 0, lost: 0 };
    emit(s, ev);
    for (const f of s.foes) { if (!f.alive) continue; const dx = Math.max(0, Math.abs(f.x - x) - (p.x1 - p.x0) / 2), dz = f.z - p.z; if (dx * dx + dz * dz > r2) continue; ev.n++; hitFoe(s, f, (p.max || 0) * C.v, 'drum'); }
  }
}
/* 폭발 드럼통이 터진다(쏴서·로켓·분대가 닿아서·옆 드럼통이 터져서 — by 'shot'|'touch'|'chain'): 반경 r 안(가운데 거리)의 좀비에게 지금 분대 화력 × dmg초 몫
   (방패 정예도 제 피해), 반경 안의 상자·철창은 내용물째 부서진다(보상 없음 — crateLost), 반경 안의 다른 드럼통도 터진다. 분대는 안 다친다.
   'blast' { x, z, r, by, n(맞은 좀비), lost(잃은 상자·철창) } */
function drumBlast(s, p, by) {
  const q = s.squad;
  const O = OBSTACLES.drum;
  p.alive = false;
  const x = (p.x0 + p.x1) / 2, r2 = O.r * O.r;
  const dmg = O.dmg * dps(q.n, q.tier, s.fireLv) * heroDmg(s);
  const e = { t: 'blast', x, z: p.z, r: O.r, by, n: 0, lost: 0 };
  emit(s, e);
  for (const f of s.foes) {
    if (!f.alive) continue;
    const dx = f.x - x, dz = f.z - p.z;
    if (dx * dx + dz * dz > r2) continue;
    e.n++;
    hitFoe(s, f, dmg, 'drum');
  }
  for (const o of s.props) {
    if (!o.alive || o.passed || !blastReach(p, o)) continue;
    if (o.kind === 'crate' || o.kind === 'cage') {
      o.alive = false;
      e.lost++;
      emit(s, { t: 'crateLost', kind: o.kind, reward: { ...o.reward }, x: (o.x0 + o.x1) / 2, z: o.z });
    } else if (o.kind === 'drum') drumBlast(s, o, 'chain');
  }
}
/* 죽은 좀비에서 번지는 탄 효과(개편 판 Lv5): 작렬 — 그 좀비가 터져 둘레 r의 좀비에 제 체력의 FX_CHAIN배(그 좀비들이 죽으면 또 터진다 — 연쇄, 한 번에 FX_CHAIN_MAX까지),
   빙결 — 느려진 좀비가 죽으면 둘레 1.5m의 좀비가 느려진다 */
const FX_CHAIN_MAX = 12;
let fxChainN = 0;
/* 터짐(저격수 Lv10·작렬 Lv10 따위): 둘레 r의 좀비에게 d(그 좀비들이 죽으면 또 터질 수 있다 — 한 번에 FX_CHAIN_MAX까지) */
function fxBoom(s, x, z, r, d, except) {
  if (fxChainN >= FX_CHAIN_MAX) return 0;
  const r2 = r * r;
  let n = 0;
  fxChainN++;
  for (const o of s.foes) {
    if (!o.alive || o === except) continue;
    const dx = o.x - x, dz = o.z - z;
    if (dx * dx + dz * dz > r2) continue;
    n++;
    hitFoe(s, o, d, 'chain', 'pop');
  }
  fxChainN--;
  if (n) emit(s, { t: 'splash', x, z, r, n });
  return n;
}
function fxDeath(s, f, by) {
  const fx = s.endless.fx;
  if (by === 'flame' && comboOn(s, 'burstFlame') && fxChainN < FX_CHAIN_MAX) {   // 기름불(작렬 + 화염병): 불 지대에서 죽은 좀비가 터진다
    const C2 = COMBOS.burstFlame, r2 = C2.r * C2.r, d = f.max * C2.v * comboK(s, 'burstFlame');
    fxChainN++;
    for (const o of s.foes) {
      if (!o.alive || o === f) continue;
      const dx = o.x - f.x, dz = o.z - f.z;
      if (dx * dx + dz * dz <= r2) hitFoe(s, o, d, 'chain', 'burst');
    }
    fxChainN--;
    emit(s, { t: 'splash', x: f.x, z: f.z, r: C2.r, n: 1 });
  }
  const bLeg = false;   // 34절: 작렬 전설은 '끌어모으기'(fxSplash)   // 전설 강화 '대폭발': 레벨과 상관없이 유폭 + 벽·보스 유폭, 연쇄 ×legK
  if ((fx.burst >= BUILD.evo || bLeg) && fxChainN < FX_CHAIN_MAX) {
    const v = fx2Val('burst', fx.burst);
    const r2 = v.r * v.r, d = f.max * (v.chain || FX_CHAIN) * legKs(s, 'burst');
    let n = 0;
    fxChainN++;
    for (const o of s.foes) {
      if (!o.alive || o === f) continue;
      const dx = o.x - f.x, dz = o.z - f.z;
      if (dx * dx + dz * dz > r2) continue;
      n++;
      hitFoe(s, o, d, 'chain', 'burst');
    }
    fxChainN--;
    if (v.evo2 || bLeg) {   // 작렬 Lv10 · 전설 강화: 연쇄 폭발이 벽·보스에도 든다
      for (const p of s.props) if (p.alive && !p.passed && (p.kind === 'wall' || p.kind === 'door') && Math.abs(p.z - f.z) < v.r && overlap(f.x - v.r, f.x + v.r, p.x0, p.x1) > 0) hitProp(s, p, d);
      const bo = s.boss;
      if (bo && bo.hp > 0 && Math.abs(bo.z - 1 - f.z) < v.r + 1 && Math.abs(bo.x - f.x) < v.r + bo.r) hitBossBonus(s, d, 'boom', 'burst');
    }
    if (n) emit(s, { t: 'splash', x: f.x, z: f.z, r: v.r, n });
  }
  if (fx.frost >= BUILD.evo && f.slowT > s.t) {
    const v = fx2Val('frost', fx.frost);
    for (const o of s.foes) if (o.alive && o !== f && (o.x - f.x) ** 2 + (o.z - f.z) ** 2 <= 2.25) o.slowT = s.t + v.T;
  }
}
/* 플레이 기록(32절): 출처별로 실제로 깎은 체력(넘친 몫은 빼고) */
function dmgLog(s, by, d) { const m = s.stats.dmg; if (m && d > 0) m[by || '?'] = (m[by || '?'] || 0) + d; }
function hitFoe(s, f, dmg, by, tag) {
  if (f.markT > s.t) dmg *= 1 + ENH.sniper.legend.v * legK2(s, 'sniper');   // 34절 저격수 전설 '약점 표시'
  if (by === 'gun') {
    const B = bldOf(s);
    if (B && B.gt === 'rifle' && legOn(s, 'rifle')) { const L = ENH.rifle.legend; f.stk = Math.min(L.max * legK2(s, 'rifle'), (f.stk || 0) + L.step); dmg *= 1 + f.stk; }   // 34절 소총 전설 '집중 사격'
  }
  dmgLog(s, tag || by, Math.min(dmg, Math.max(0, f.hp)));
  f.hp -= dmg;
  f.hitT = s.t;
  if (f.hp > 0) return false;
  f.alive = false;
  if (s.stats.kb) { const k = tag || by || '?'; s.stats.kb[k] = (s.stats.kb[k] | 0) + 1; }
  s.stats.kills++;
  s.stats.killHp += f.max;
  emit(s, { t: 'kill', kind: f.kind, x: f.x, z: f.z, by, elite: f.elite });
  if (f.elite) eliteDeath(s, f);
  if (s.endless && s.endless.bld && enhN(s, 'rapid', 'r')) s.squad.rushT = s.t + ENH.rapid.rare.T;   // 신바람
  if (by === 'gun' && s.endless && s.endless.bld) {
    const B = s.endless.bld, q = s.squad;
    if (B.gt === 'marksman' && legOn(s, 'marksman')) q.fireAcc = Math.min(q.fireAcc + ENH.marksman.legend.v, 2 * ENH.marksman.legend.v);   // 36절 저격총 전설 '연발': 쓰러뜨리면 다음 발이 바로
    else if (B.gt === 'shotgun' && legOn(s, 'shotgun') && f.z - q.z < ENH.shotgun.legend.near) { const SL = ENH.shotgun.legend; fxBoom(s, f.x, f.z, SL.r, f.max * SL.v * legK2(s, 'shotgun'), f); emit(s, { t: 'boom', x: f.x, z: f.z, r: SL.r, small: 1 }); }   // 36절 산탄총 전설 '산탄 폭발'
  }
  if (!noFx && f.acid > 0 && f.acT > s.t && legOn(s, 'acid')) {   // 34절 부식 전설 '전염': 죽은 좀비의 부식 겹이 둘레 좀비에게 그대로 옮는다
    const r2 = ENH.acid.legend.r * ENH.acid.legend.r; let n = 0;
    for (const o of s.foes) { if (!o.alive || o === f) continue; const dx = o.x - f.x, dz = o.z - f.z; if (dx * dx + dz * dz > r2) continue; o.acid = Math.max(o.acid | 0, f.acid); o.acT = Math.max(o.acT || 0, f.acT); if (++n >= 12) break; }
    if (n) emit(s, { t: 'acidSpread', x: f.x, z: f.z, r: ENH.acid.legend.r });
  }
  if (s.endless && s.endless.bld && s.endless.fx && !noFx) {
    fxDeath(s, f, by);   // 작렬 Lv5 유폭 · 빙결 Lv5 번지는 얼음 · 기름불(작렬 + 화염병)
    if (s.endless.fx.cure) cureKill(s, f);   // 치료(24절)
    if (f.kind === 'brute' && s.endless.fx.acid) acidPool(s, f.x, f.z);   // 산성 웅덩이(부식 Lv10)
  }
  chargeHero(s, 0.01);
  // 펫 '기운 내': 처치마다 확률로 영웅 게이지 +PET_CHEER
  // 무한모드는 한 번 차면 PET_CHEER_CD초 쉰다(처치가 아주 잦아 스킬이 거의 늘 켜져 있었다 — 쉬는 동안은 굴리지도 않는다). 캠페인은 그대로
  const pc = s.hero ? petBy(s, 'cheer') : null;
  const bldCheer = !!(s.endless && s.endless.bld);   // 쉬는 시간·작은 몫은 개편 판만(앞 단계 판의 지문 그대로)
  if (pc && !(bldCheer && pc.cdT > s.t)) {
    const p = petP(pc.id, pc.lv);
    if (pc.avg) chargeHero(s, PET_CHEER * p);
    else if (rand(pc) < p) { pc.procs++; chargeHero(s, bldCheer ? PET_CHEER_E : PET_CHEER); if (bldCheer) pc.cdT = s.t + PET_CHEER_CD; emit(s, { t: 'pet', fx: 'cheer', x: f.x, z: f.z }); }
  }
  return true;
}
/* 특수병·영웅이 보스에게 주는 피해는 병사 화력의 +BONUS_CAP(10%)까지(쌓인 몫 b.bonus 안에서) */
function hitBossBonus(s, dmg, by = '?', tag) {
  const b = s.boss;
  if (!b || b.hp <= 0) return 0;
  const d = Math.min(dmg, b.bonus);
  if (d <= 0) return 0;
  dmgLog(s, tag || by, Math.min(d, b.hp));
  b.bonus -= d;
  b.hp -= d;
  b.hitT = s.t;
  return d;
}

/* 무기·탄종 상자를 얻을 수 없을 때 대신 주는 병사(나침반 유물이 실은 r.mul이면 그만큼 — 갈림길 위험한 쪽. 없는 판은 예전 식 그대로) */
const crateMen = (n, r) => { const v = Math.max(5, nice(n * 0.2)); return r.mul ? Math.max(1, Math.round(v * r.mul)) : v; };
function openCrate(s, p) {
  const q = s.squad;
  const r = p.reward;
  s.stats.crates++;
  const x = (p.x0 + p.x1) / 2;
  if (r.type === 'unit') {
    emit(s, { t: 'cageOpen', k: r.k, x, z: p.z });
    addSpecial(s, r.k, 'cage', x, p.z, r.mul);
    return;
  }
  if (r.type === 'fx') {
    // 탄종 상자(2단계): 얻을 수 없으면(슬롯이 차고 그 효과가 없음·Lv3) 무기 상자처럼 병사로
    if (fxCan(s, r.a)) { fxAdd(s, r.a, 'crate', x, p.z); emit(s, { t: 'crate', type: 'fx', a: r.a, lv: fxLv(s, r.a), x, z: p.z }); }
    else { gain(s, crateMen(q.n, r), x, p.z, 'crate'); emit(s, { t: 'crate', type: 'men', x, z: p.z }); }
    return;
  }
  if (r.type === 'lucky') {   // 행운 길(22절): 꽝 — 독가스 병력 −LUCK.trap(39.6), 소 — 코인 + 병력 10%, 중 — 병력 30%, 대 — ★ +1(상한이면 병력 30%) + 병력 LUCK.big
    const coin = relicOn(s, 'lucky') && bldOf(s);   // 행운의 동전(24절): 한 단계 위로, 대는 병력 +big 더
    if (s.stats.luck) s.stats.luck[clamp(r.size | 0, 0, 3)]++;
    if (p.treasure) s.stats.treasure = (s.stats.treasure | 0) + 1;
    if (p.lg) for (const o of s.props) if (o !== p && o.lg === p.lg && o.alive) { o.alive = false; emit(s, { t: 'luckSeal', x: (o.x0 + o.x1) / 2, z: o.z }); }   // 39.4: 행운 길은 셋 중 하나 — 하나가 열리면 나머지는 잠긴다
    if (coin && (r.size | 0) >= 3) gain(s, Math.max(1, Math.round(q.n * RELICS.lucky.big)), x, p.z, 'crate');
    const sz = clamp((r.size | 0) + (coin ? 1 : 0), 0, 3);
    if (sz === 0) { lose(s, Math.max(1, Math.round(q.n * LANES.trap)), 'crate', x, p.z, 'trap'); emit(s, { t: 'crate', type: 'lucky', size: 0, tier: q.tier, x, z: p.z }); return; }
    if (sz === 1) { s.stats.coins += 10 + 3 * ((s.endless && s.endless.seg) || 1); gain(s, Math.max(1, Math.round(q.n * 0.1)), x, p.z, 'crate'); }
    else if (sz === 2) gain(s, Math.max(1, Math.round(q.n * 0.3)), x, p.z, 'crate');
    else { if (q.tier < tierMax(s)) q.tier++; else gain(s, Math.max(1, Math.round(q.n * 0.3)), x, p.z, 'crate'); gain(s, Math.max(1, Math.round(q.n * (p.lg ? LANES.big : 0.4))), x, p.z, 'crate'); }
    emit(s, { t: 'crate', type: 'lucky', size: sz, tier: q.tier, big: p.lg ? LANES.big : 0.4, x, z: p.z });
    return;
  }
  if (r.type === 'gun' || r.type === 'gunx') {   // 48절: 다른 총 상자(gunx)는 없앴다 — 남은 것은 보통 무기 상자
    if (q.tier < tierMax(s)) { q.tier++; emit(s, { t: 'crate', type: 'gun', tier: q.tier, x, z: p.z }); }
    else { gain(s, crateMen(q.n, r), x, p.z, 'crate'); emit(s, { t: 'crate', type: 'men', x, z: p.z }); }
  } else if (r.type === 'men') {
    gain(s, r.v, x, p.z, 'crate');
    emit(s, { t: 'crate', type: 'men', v: r.v, x, z: p.z });
  } else {
    s.stats.coins += r.v;
    emit(s, { t: 'crate', type: 'coin', v: r.v, x, z: p.z });
  }
}

/* 보스가 부르는 졸개 한 마리 체력 = 기준 병력 화력 × SUMMON_HP(2단계: 0.08 → 0.1, 걸음·따라붙기는 판 중 졸개와 같다) */
export const SUMMON_HP = 0.1;
export const SUMMON_FIRST = 2.5;
export const SUMMON_FLANK_Z = 14;    // 가장자리 질주 좀비가 생기는 거리(분대 앞)
export const SUMMON_FLANK_HP = 1.2;  // 가장자리 질주 좀비 체력 = 졸개 × 이 배수   // 첫 소환까지 초(2단계: 4.5 → 2.5 — 보스전에서도 병력이 줄 수 있게)
/* 내려찍기가 분대를 맞히나: 중심이 빨간 구역을 SLAM_EDGE·R만큼 넓힌 안에 있으면(분대 몸의 바깥쪽 일부가 구역에 걸친 것) */
export function slamHits(x, R, slam) { const z = slamZone(slam, R); return x >= z.x0 && x <= z.x1; }
/* 개편 판 보스가 이 구간에 쓰는 패턴(23절 — 시드·구간으로 정해진다, 숨은 난수 없음): [{ k, up }]. 개편 판이 아니면 [].
   1바퀴(1~5구간)는 BUILD.bossPat.order 순서로 하나씩(1구간 = 내려찍기 — 바탕 그대로), 2바퀴는 같은 순서의 간격 단축판(up 1),
   3바퀴는 범위 확대판(up 2)을 시드로 섞은 순서, 4바퀴부터 둘 다(up 3)를 바퀴마다 섞은 순서. 대왕(6의 배수)은 그 바퀴의 판으로 다섯 다 */
export const bossPats = (s) => bossPatsAt(s, s.endless ? s.endless.seg : 1);
export function bossPatsAt(s, k) {
  const e = s.endless;
  if (!e || !e.bld) return [];
  const n = Math.max(1, Math.floor(k));
  const loop = Math.floor((n - 1) / 6), pos = (n - 1) % 6;
  const up = loop === 0 ? 0 : loop === 1 ? 1 : loop === 2 ? 2 : 3;
  const order = loop < 2 ? BUILD.bossPat.order.slice() : shuffle({ rs: hash(VERSION, 'bosspat', e.seed >>> 0, loop) }, BUILD.bossPat.order.slice());
  if (pos === 5) return order.map((k) => ({ k, up }));
  return [{ k: order[pos], up }];
}
const upOf = (b, k) => (b.up ? b.up[k] | 0 : 0);
const patOn = (b, k) => !!(b.pat && b.pat.includes(k)) || (k === 'slam' && !!b.king);
/* 대왕의 문턱 ph(0~3)에서 켜진 특수 패턴(내려찍기 말고): 그 바퀴의 순서에서 [ph−1, ph] — 0은 첫째 하나, 그 뒤 둘씩 밀려 간다 */
function kingPats(b, ph) {
  const sp = b.all.filter((k) => k !== 'slam');
  return sp.slice(Math.max(0, ph - 1), ph + 1);
}
/* 다시 쓰기(초): 기본 cd, 간격 단축이면 cd2, 분노한 보스(변이)를 곱해도 원래 cd × cdFloor 아래로는 안 내려간다 */
function patCd(s, b, k) {
  const P = BOSS_PAT[k];
  const base = upOf(b, k) & 1 && P.cd2 ? P.cd2 : P.cd;
  return Math.max(P.cd * BUILD.bossPat.cdFloor, base * rageCd(s));
}
const specialsOn = (b) => (b.pat ? b.pat.filter((k) => k !== 'slam' && k !== 'double').length : 0);
/* 특수 패턴을 새로 시작해도 되나: 숨 고르기 중이 아니고, 다른 특수 패턴을 stagger초 안에 시작하지 않았다 */
const patFree = (b) => !(b.calm > 0) && b.t - (b.ps ?? -9) >= BUILD.bossPat.stagger;
function patSay(s, b, k) {
  if (b.seen.includes(k)) return;
  b.seen.push(k);
  const u = upOf(b, k);
  emit(s, { t: 'bossPat', k, up: u, name: BOSS_PAT[k].name + (u ? ' ' + '+'.repeat(u === 3 ? 2 : 1) : ''), text: u && BOSS_PAT_UPTEXT[k] ? [1, 2].filter((x) => u & x).map((x) => BOSS_PAT_UPTEXT[k][x]).join(' · ') : BOSS_PAT[k].text() });
}
/* 대왕의 체력 문턱: 넘으면 숨 고르기(calm초 — 새 공격을 시작하지 않는다), 새 패턴은 그 뒤 first초 안에 처음 쓴다('bossPhase' 이벤트) */
function kingPhase(s, b) {
  const th = BUILD.bossPat.phase;
  let ph = 0;
  for (const x of th) if (b.hp < b.max * x) ph++;
  if (ph <= (b.ph | 0)) return;
  const before = b.pat.slice();
  b.ph = ph;
  b.pat = kingPats(b, ph);
  const P = BUILD.bossPat;
  b.calm = P.calm;
  const fresh = b.pat.filter((k) => !before.includes(k));
  if (fresh.some((k) => k === 'volley' || k === 'line')) b.holdSlam = b.t + P.calm + P.first + 1.2;   // 독침·장벽은 내려찍기 예고 중에는 못 시작한다 — 새 패턴이 제때 보이게 바탕 내려찍기를 잠깐 미룬다
  for (const k of fresh) {
    if (BOSS_PAT[k].cd) b.pcd[k] = P.calm + P.first;
    if (k === 'wide') { b.nSlam = 1; b.slamCd = Math.min(b.slamCd, P.calm + P.first); }
  }
  emit(s, { t: 'bossPhase', ph, pat: b.pat.slice(), fresh });
}
/* 패턴(내려찍기 말고): 독침 세례 · 돌진 · 좀비 장벽. 내려찍기 예고 중이면 독침·장벽을 미룬다(피할 곳이 남게) */
function bossPatUpdate(s, R, b) {
  const q = s.squad;
  if (b.calm > 0) b.calm -= DT;
  for (const k of b.pat) if (b.pcd[k] > 0) b.pcd[k] -= DT;
  // 독침 세례: n발을 gap초마다 — 던지는 그때 분대가 선 자리에
  if (b.vol) {
    b.vol.t -= DT;
    if (b.vol.t <= 0 && !b.slam) {
      const V = BOSS_PAT.volley, T = SPIT_T + 0.2, u = upOf(b, 'volley');
      const sp = { id: s.nextId++, x: q.x, z: q.z, sx: b.x, sz: b.z - 1, t: T, T, boss: 1 };
      if (u & 2) sp.r = SPIT_R * V.r2;   // 범위 확대: 떨어지는 폭이 넓다
      s.spits.push(sp);
      emit(s, { t: 'spitFire', x: b.x, z: b.z, boss: true });
      b.vol.n--;
      b.vol.t = u & 1 ? V.gap2 : V.gap;
      if (b.vol.n <= 0) b.vol = null;
    }
  } else if (patOn(b, 'volley') && b.pcd.volley <= 0 && !b.slam && b.slamCd > 1 && patFree(b)) {
    b.vol = { n: upOf(b, 'volley') & 2 ? BOSS_PAT.volley.n2 : BOSS_PAT.volley.n, t: 0 };
    b.pcd.volley = patCd(s, b, 'volley');
    b.ps = b.t;
    patSay(s, b, 'volley');
  }
  // 돌진: 숨 고르기(warn) → dash초 동안 dist m
  const reach = q.z + 0.55 * R + b.r * 0.6;
  if (b.dash) {
    b.dash.t -= DT;
    if (!b.dash.go && b.dash.need > 0 && b.dash.hp0 - b.hp >= b.dash.need) {   // 42절: 숨 고르는 동안 보스를 세게 쏘면 돌진을 막는다 — 비틀거린다
      b.dash = null;
      b.stun = BOSS_KNOCK.stun;
      emit(s, { t: 'bossBlock', x: b.x, z: b.z, stun: BOSS_KNOCK.stun });
    } else if (b.dash.t <= 0) {
      if (!b.dash.go) { b.dash.go = true; b.dash.t = BOSS_PAT.charge.dash; emit(s, { t: 'bossCharge', x: b.x, z: b.z }); }
      else b.dash = null;
    } else if (b.dash.go) b.z = Math.max(reach + BOSS_PAT.charge.stop, b.z - (b.dash.d / BOSS_PAT.charge.dash) * DT);   // 분대 앞 stop m에서 멈춘다(바로 붙지 않게)
  } else if (patOn(b, 'charge') && b.pcd.charge <= 0 && b.z - reach > (upOf(b, 'charge') & 2 ? BOSS_PAT.charge.dist2 : BOSS_PAT.charge.dist) + BOSS_PAT.charge.stop && patFree(b)) {
    const CH = BOSS_PAT.charge;
    b.dash = { t: CH.warn, go: false, d: upOf(b, 'charge') & 2 ? CH.dist2 : CH.dist, hp0: b.hp, need: CH.block * b.max };
    b.pcd.charge = patCd(s, b, 'charge');
    {   // 42절: 질주 좀비가 보스와 함께 몰려온다(보스 앞을 가린다 — 막으려면 뚫고 보스를 쏴야 한다)
      const n = upOf(b, 'charge') & 2 ? CH.n2 : CH.n;
      const hp = Math.max(1, Math.round(CH.hp * SUMMON_HP * dps(s.bossRef, 0, s.refFire || 0) * (s.refMul || 1)));
      for (let i = 0; i < n; i++) {
        const x = clamp(b.x - 3 + (6 * (i + 0.5)) / n + (rand(s) - 0.5) * 0.6, -EDGE, EDGE);
        s.foes.push({ id: s.nextId++, kind: 'runner', x, z: b.z - 1.5 - rand(s) * 1.5, hp, max: hp, alive: true, awake: true, hitT: -9, cd: 0, seed: (rand(s) * 1000) | 0, ...FOE_BASE.runner, home: 0, homeDist: 0, charge: 1 });
      }
      emit(s, { t: 'summon', n, charge: true });
    }
    b.ps = b.t;
    emit(s, { t: 'bossChargeWarn', x: b.x, z: b.z, warn: BOSS_PAT.charge.warn });
    patSay(s, b, 'charge');
  }
  // 좀비 장벽: 길을 가로지르는 졸개 줄, 빈틈 하나(분대에서 먼 쪽 절반 안 — 걸어서 닿는 거리)
  if (patOn(b, 'line') && b.pcd.line <= 0 && !b.slam && b.z - q.z > 10 && patFree(b)) {
    const L = BOSS_PAT.line;
    b.pcd.line = patCd(s, b, 'line');
    b.ps = b.t;
    const hp = Math.max(1, Math.round(L.hp * SUMMON_HP * dps(s.bossRef, 0, s.refFire || 0) * (s.refMul || 1)));
    const gx = clamp(q.x + (q.x > 0 ? -1 : 1) * (2 + rand(s) * 2.5), -EDGE + L.gap / 2, EDGE - L.gap / 2);
    const z = Math.max(q.z + 0.55 * R + 7, b.z - 2.5);
    // 범위 확대: 줄 둘(뒤 줄은 row2 m 뒤), 뒤 줄의 빈틈은 앞 줄 빈틈의 옆 칸(가운데 쪽으로 한 칸 — 빈틈 폭은 그대로)
    const rows = upOf(b, 'line') & 2 ? [[z, gx], [z + L.row2, clamp(gx + (gx > 0 ? -1 : 1) * (2 * ROAD) / 3, -EDGE + L.gap / 2, EDGE - L.gap / 2)]] : [[z, gx]];
    let n = 0;
    for (const [rz, rx] of rows) for (let i = 0; i < L.n; i++) {
      const x = -ROAD + 0.6 + (i * (2 * ROAD - 1.2)) / (L.n - 1);
      if (Math.abs(x - rx) < L.gap / 2) continue;
      const f = { id: s.nextId++, kind: 'grunt', x, z: rz + rand(s) * 0.6, hp, max: hp, alive: true, awake: true, hitT: -9, cd: 0, seed: (rand(s) * 1000) | 0, ...FOE_BASE.grunt, home: 0, homeDist: 0, line: 1 };
      s.foes.push(f);
      n++;
    }
    emit(s, { t: 'summon', n, line: true });
    patSay(s, b, 'line');
  }
}
/* 보스 공격으로 잃는 병사: 지금 병력의 몫 a, 무한모드 개편 판은 그 구간 기준 병력의 BOSS_FLOOR[k]보다 적지 않게(30절 — 밀린 판이 끌리지 않게) */
function bossLoss(s, a, k) {
  if (!s.endless || !s.endless.bld || !(s.bossRef > 0)) return a;
  return Math.max(a, Math.ceil(BOSS_FLOOR[k] * s.bossRef));
}
function bossUpdate(s, R) {
  const q = s.squad;
  const b = s.boss;
  const p = s.params;
  if (b.hp <= 0 && s.endless) {
    // 무한모드: 끝나지 않는다 — 코인을 적립하고, 쓰러지는 연출(ENDLESS.wait) 뒤 다음 구간이 이어진다
    const e = s.endless;
    if (!b.dead) {
      b.dead = true;
      b.slam = null;
      e.wait = ENDLESS.wait;
      e.bosses++;
      { const c = segAcc(s); (s.stats.segs || (s.stats.segs = [])).push([e.seg, c.nb, Math.round(b.t * 10) / 10, Math.round(c.lost), Math.round(c.gate)]); s.stats.cur = null; }   // 플레이 기록 v2: 구간마다 [구간, 보스 앞 병력, 보스전 초, 잃은 병력, 게이트 득실]
      if (e.bld && e.fx && e.fx.cure && fx2Val('cure', e.fx.cure).mass && e.cureSeg === e.seg && e.cureN > 0) { const n = Math.round(e.cureN * FX_NEW.cure.boss); if (n > 0) { gain(s, n, b.x, b.z, 'cure'); emit(s, { t: 'cure', n, x: b.x, z: b.z, boss: true }); } }   // 집단 치료(치료 Lv5): 보스를 잡으면 그 구간 치료의 50% 더
      if (e.bld) { const B = e.bld; B.pi = 0; B.rrn = 0; B.more = 0; B.rel = 1; B.pre = 0; if (p.tag === 'super') { B.rr += 1 + (relicOn(s, 'dice') ? RELICS.dice.king : 0); mutRoll(s); } }
      const coins = segCoins(e.seg);
      e.bank += coins;
      s.stats.bossT += b.t;
      for (const f of s.foes) f.alive = false;
      s.spits = [];
      emit(s, { t: 'bossDead', x: b.x, z: b.z });
      emit(s, { t: 'segClear', seg: e.seg, coins, tag: p.tag });
    } else {
      e.wait -= DT;
      if (e.wait <= 0) {
        // 3택 1을 연 판: 카드를 띄우고 고를 때까지 멈춘다(다음 구간은 pickCard가 잇는다)
        if (e.unl >= 1) {
          if (e.bld) spBack(s);
          const offer = makeOffer(s);
          if (offer.length) { e.offer = offer; emit(s, offer[0].k === 'relic' ? { t: 'offer', n: offer.length, seg: e.seg, relic: true } : { t: 'offer', n: offer.length, seg: e.seg }); return; }   // relic: 유물 카드(대왕 보스 뒤)
        }
        if (e.bld) { startSegmentB(s); return; }
        nextSegment(s);
        if (e.fx) fxCrates(s);
        if (e.relics) relicSeg(s);
      }
    }
    return;
  }
  if (b.hp <= 0) {
    if (s.phase !== 'won') {
      s.phase = 'won';
      s.endT = 0;
      s.stats.bossT = b.t;
      petEnd(s);
      emit(s, { t: 'bossDead', x: b.x, z: b.z });
      emit(s, { t: 'win' });
    }
    return;
  }
  b.t += DT;
  if (!b.enraged && b.hp < b.max * 0.5) { b.enraged = true; emit(s, { t: 'enrage' }); }
  if (b.king && b.pat) kingPhase(s, b);
  // 분대 쪽으로 천천히 따라온다(피하면 한동안 총알이 덜 맞는다)
  const d = q.x - b.x;
  const m = BOSS_TRACK * DT;
  b.x = clamp(b.x + (d > m ? m : d < -m ? -m : d), -2.5, 2.5);
  const reach = q.z + 0.55 * R + b.r * 0.6;
  // 넉백 뒤 비틀거리는 동안(개편 판): 걷지도 찍지도 않는다
  if (b.stun > 0) { b.stun -= DT; if (b.stun > 0) return; b.stun = 0; }
  const hold = b.dash && !b.dash.go;   // 돌진 숨 고르기 중에는 멈춰 선다(예고를 보고 비킬 틈)
  if (b.z > reach) {
    if (!hold) b.z = Math.max(reach, b.z - b.walk * (b.enraged ? 1.25 : 1) * DT);
  } else if (!b.clash) {
    b.clash = true;
    b.slam = null;
    b.clashCd = 0.3;
    b.clashHp = b.hp;
    emit(s, { t: 'clash' });
  }
  if (b.clash) {
    // 넉백(개편 판 보스): 붙은 뒤 최대 체력의 BOSS_KNOCK.hp를 깎으면 뒤로 튕겨 나간다
    if (b.pat && b.clashHp - b.hp >= BOSS_KNOCK.hp * b.max) {
      b.clash = false;
      b.dash = null;
      b.z = reach + BOSS_KNOCK.dist;
      b.stun = BOSS_KNOCK.stun;
      emit(s, { t: 'bossKnock', x: b.x, z: b.z, stun: BOSS_KNOCK.stun });
      return;
    }
    b.clashCd -= DT;
    if (b.clashCd <= 0) {
      b.clashCd = 0.5;
      emit(s, { t: 'stomp', x: b.x, z: b.z });
      lose(s, bossLoss(s, Math.ceil(0.12 * q.n) + 1, 'stomp'), 'boss', undefined, undefined, 'stomp');
    }
    return;
  }
  // 내려찍기
  if (b.slam) {
    b.slam.t -= DT;
    if (b.slam.t <= 0) {
      const hit = slamHits(q.x, R, b.slam);
      emit(s, { t: 'slam', x0: b.slam.x0, x1: b.slam.x1, hit });
      if (hit) lose(s, bossLoss(s, Math.ceil(SLAM_HIT * q.n), 'slam'), 'boss', q.x, q.z, 'slam');
      const one = !b.slam.wide && !b.slam.dbl;
      const wide1 = b.slam.wide && !b.slam.w2 ? b.slam.safe : -1;
      b.slam = null;
      b.slamCd = p.slamEvery * (b.enraged ? 0.8 : 1) * rageCd(s) * (specialsOn(b) >= 2 ? BUILD.bossPat.slam2 : 1);   // 대왕: 특수 패턴이 둘 켜진 동안 바탕 내려찍기는 느리게
      if (one && (patOn(b, 'double') || (patOn(b, 'slam') && upOf(b, 'slam') & 1))) { b.slamCd = BOSS_PAT.slam.then; b.dblNext = 1; }   // 내려찍기 간격 강화(예전 연속 내려찍기): 곧바로 지금 선 칸을 한 번 더
      else if (wide1 >= 0 && patOn(b, 'wide') && upOf(b, 'wide') & 2) { b.slamCd = BOSS_PAT.wide.then2; b.wide2 = 2 - wide1; }   // 넓은 내려찍기 범위 강화: 안전 칸이 반대쪽으로 옮겨 한 번 더
    }
  } else {
    b.slamCd -= DT;
    // 개편 판 패턴: 독침이 날아가는 동안·돌진 숨 고르기 중에는 내려찍지 않는다(피할 곳이 남게)
    const busy = b.pat && (b.vol || s.spits.some((sp) => sp.t > 0) || (b.dash && !b.dash.go) || b.calm > 0 || b.holdSlam > b.t);
    if (b.slamCd <= 0 && !busy) {
      const dbl = !!b.dblNext;
      b.dblNext = 0;
      const w2 = b.wide2 != null ? b.wide2 : -1;
      b.wide2 = null;
      const wide = !dbl && patOn(b, 'wide') && (w2 >= 0 || upOf(b, 'wide') & 1 || ((b.nSlam = (b.nSlam | 0) + 1) % 2 === 0));   // 간격 강화면 매번
      const parts = wide || p.slamThird ? 3 : 2;
      const ln = lanes(parts);
      let idx = 0;
      for (let i = 0; i < parts; i++) if (q.x >= ln[i].x0) idx = i;
      let x0, x1, pad = 0;
      let safe = -1;
      if (wide) {   // 넓은 내려찍기: 세 칸 중 가장자리 한 칸만 남기고(분대에서 먼 쪽이 될 수도 있다 — 무작위). 범위 강화의 둘째는 반대쪽이 안전
        safe = w2 >= 0 ? w2 : rand(s) < 0.5 ? 0 : 2;
        x0 = ln[safe === 0 ? 1 : 0].x0; x1 = ln[safe === 0 ? 2 : 1].x1; pad = BOSS_PAT.wide.pad;
        patSay(s, b, 'wide');
      } else {
        if (!dbl && rand(s) < SLAM_OTHER) idx = (idx + 1 + Math.floor(rand(s) * (parts - 1))) % parts;
        x0 = ln[idx].x0; x1 = ln[idx].x1;
        if (patOn(b, 'slam') && upOf(b, 'slam') & 2) { x0 = Math.max(-ROAD, x0 - BOSS_PAT.slam.ext); x1 = Math.min(ROAD, x1 + BOSS_PAT.slam.ext); }   // 범위 강화: 띠가 칸 경계를 넘는다
        if (dbl) patSay(s, b, b.pat.includes('double') ? 'double' : 'slam');
        else if (b.pat && b.all && b.all.length === 1 && b.all[0] === 'slam') patSay(s, b, 'slam');
      }
      // 공정성(P14): 피하는 데 드는 이동이 길면 예고를 늘린다(옆 칸 회피는 WARN_MIN, 한 칸 넘게면 이동 시간 + REACT_FAR).
      // 반대쪽으로 움직이던 분대는 멈추고 돌아서는 시간도 더한다(3단계)
      const need = slamFairWarn(q.x, q.vx, R, x0, x1, (2 * ROAD) / parts);
      const warn = Math.max(p.slamWarn, need) + pad;
      b.slam = { x0, x1, t: warn, T: warn };
      if (wide) { b.slam.wide = 1; b.slam.safe = safe; if (w2 >= 0) b.slam.w2 = 1; }
      if (dbl) b.slam.dbl = 1;
      emit(s, { t: 'slamWarn', x0, x1, warn });
    }
  }
  if (b.pat) bossPatUpdate(s, R, b);
  // 졸개 소환
  if (s.L >= UNLOCK.summon) {
    b.summonCd -= DT;
    if (b.summonCd <= 0 && b.z - q.z > 9) {
      b.summonCd = 5.5 * rageCd(s);
      const m = Math.min(8, 3 + Math.floor(s.L / 5));
      const hp = SUMMON_HP * dps(s.bossRef, 0, s.refFire || 0) * (s.refMul || 1);
      // L4+: 둘은 길 양 가장자리를 따라 달려와 마지막에 파고드는 질주 좀비(정면 사격에 늦게 들어온다 — 막으려면 옆으로 가서 쏴야 한다)
      const flank = s.L >= UNLOCK.runner ? 2 : 0;
      for (let i = 0; i < m; i++) {
        const side = i < flank;
        const f = side
          ? { id: s.nextId++, kind: 'runner', x: (i % 2 ? -1 : 1) * (4.4 + rand(s) * 0.2), z: q.z + 0.55 * R + SUMMON_FLANK_Z + rand(s) * 3, hp: Math.max(1, Math.round(hp * SUMMON_FLANK_HP)), max: 0, alive: true, awake: true, hitT: -9, cd: 0, seed: (rand(s) * 1000) | 0, ...FOE_BASE.runner, home: 4.5, homeDist: 4, flank: true }
          : { id: s.nextId++, kind: 'grunt', x: clamp(b.x + (rand(s) - 0.5) * 7, -4.4, 4.4), z: Math.max(q.z + 0.55 * R + 5, b.z - 2 - rand(s) * 3), hp: Math.max(1, Math.round(hp)), max: 0, alive: true, awake: true, hitT: -9, cd: 0, seed: (rand(s) * 1000) | 0, ...FOE_BASE.grunt };
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
  const B = s.endless && s.endless.bld;
  h.charge = Math.min(1, h.charge + a);
  if (h.charge >= 1) emit(s, { t: 'heroReady', id: h.id });
}

export function heroDmg(s) {
  const h = s.hero;
  return h && h.id === 'mungchi' && h.act > 0 ? heroVal('mungchi', 'dmg', h.lv) : 1;
}

function heroUpdate(s, input) {
  const h = s.hero;
  const H = HEROES[h.id];
  if (h.act > 0) {
    h.act -= DT;
    if (h.act <= 0) { h.act = 0; emit(s, { t: 'heroEnd', id: h.id }); }
  }
  // 쿨다운은 유효 레벨로(Lv5 너머는 줄어드는 폭 — 가장 짧아도 기본의 52%)
  if (h.act <= 0 && h.charge < 1) chargeHero(s, DT / (H.skill.cd * (1 - 0.06 * (heroEff(h.lv) - 1))));
  if (input && input.skill && h.charge >= 1 && h.act <= 0) castHero(s);
}

function castHero(s) {
  const h = s.hero;
  const q = s.squad;
  const H = HEROES[h.id];
  h.charge = 0;
  h.T = h.id === 'mungchi' && fxOf(s) && comboOn(s, 'rapidMungchi') ? H.skill.dur + (comboV('rapidMungchi', !!bldOf(s)) - H.skill.dur) * comboK(s, 'rapidMungchi') : H.skill.dur;   // 긴 나팔(속사 + 뭉치)
  const B = s.endless && s.endless.bld;
  h.act = h.T;
  h.shot = 0;
  s.stats.heroUses++;
  emit(s, { t: 'heroCast', id: h.id, x: q.x, z: q.z });
  if (h.id === 'mungchi' && B) hornWave(s);   // 46.7 개편 판: 나팔 충격파
  if (h.id === 'bori') {
    const med = spLv(q, 'medic');
    const k = Math.round(Math.min(0.95, heroVal('bori', 'heal', h.lv) * (med ? synergyOf(med) : 1)) * q.recent);
    q.recent = 0;
    if (k > 0) {
      q.pool = Math.max(0, q.pool - k);
      s.stats.healed += k;
      gain(s, k, q.x, q.z, 'hero');
      emit(s, { t: 'heal', n: k, x: q.x, z: q.z });
    }
  }
}

/* 뭉치 돌격 나팔 충격파(개편 판 — 46.7): 앞 HORN.reach m · 분대 몸 옆 HORN.side m 안 좀비를 push m 밀어내고 stun초 멈춘다(독침 좀비는 멈추기만).
   자폭 좀비는 밀린 자리에서 터진다(분대는 안 다친다). 앞 reach m 안의 보스는 boss초 비틀 */
let hornSafe = false;
function hornWave(s) {
  const q = s.squad, R = radius(q.n);
  let n = 0;
  const bombs = [];
  for (const f of s.foes) {
    if (!f.alive) continue;
    const dz = f.z - q.z;
    if (dz < -0.5 || dz > HORN.reach || Math.abs(f.x - q.x) > R + HORN.side || f.kind === 'spit') continue;
    n++;
    if (f.elite !== 'thief') f.z += HORN.push;
    f.holdT = s.t + HORN.stun;
    if (f.lp === 1 || f.lp === 2) f.lp = 3;   // 도약 좀비: 웅크리기·뛰기가 끊긴다
    if (f.elite === 'bomb') bombs.push(f);
  }
  hornSafe = true;
  for (const f of bombs) if (f.alive) hitFoe(s, f, f.hp + 1, 'hero');
  hornSafe = false;
  const b = s.boss;
  if (b && b.hp > 0 && b.z - q.z < HORN.reach + b.r) b.stun = Math.max(b.stun || 0, HORN.boss);
  emit(s, { t: 'horn', x: q.x, z: q.z, reach: HORN.reach, w: R + HORN.side, n });
}

/* 스킬을 지금 쓰면 좋은가 — 봇·보정표(caltable·cyctable·지문)가 쓰는 규칙(바꾸면 SIM을 올리고 표를 다시 만든다).
   사람의 '스킬 자동 발동' 설정은 heroWantsAuto(뭉치만 다르다 — ENDGAME.md 26.1) */
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
    if (s.endless && s.endless.bld) return false;   // 46.7: 개편 판 돌격 나팔은 게이트에 안 든다 — 싸움에만
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
/* 사람의 '스킬 자동 발동': 뭉치는 싸움 먼저, 게이트는 앞이 비었을 때만(ENDGAME.md 26.1 — 예전 규칙은 '앞에 덜 찬 덧셈 칸'만 있어도 써서
   거의 늘 게이트에 써 버렸다). 다른 영웅은 heroWants 그대로 */
export function heroWantsAuto(s) {
  const h = s.hero;
  if (!h || h.id !== 'mungchi') return heroWants(s);
  if (h.charge < 1 || h.act > 0 || (s.phase !== 'run' && s.phase !== 'arena')) return false;
  if (s.boss && s.boss.hp > 0) return true;
  const q = s.squad;
  const D = dps(q.n, q.tier, s.fireLv);
  const R = radius(q.n);
  let threat = 0, near = 0, big = false;
  for (const f of s.foes) {
    if (!f.alive) continue;
    const dz = f.z - q.z;
    if (dz <= 0 || dz > 40 || Math.abs(f.x - q.x) > R + 2.5) continue;
    if (dz < 25) { threat += f.hp; if (f.kind === 'brute' || f.elite) big = true; }
    else if (f.kind === 'brute' || f.elite || f.hp >= 2 * D) return false;   // 센 적이 곧 온다 — 아껴 둔다
    near += f.hp;
  }
  if (threat >= 1.2 * D || (big && threat >= 0.6 * D)) return true;
  // 앞을 막은 벽·장갑문(무한모드)도 몰아 쏠 거리
  for (const p of s.props || []) {
    if (!p.alive || (p.kind !== 'wall' && p.kind !== 'door')) continue;
    const dz = p.z - q.z;
    if (dz > 0 && dz < 22 && q.x + R > p.x0 && q.x - R < p.x1 && p.hp >= 1.5 * D) return true;
  }
  if (near >= 0.3 * D || (s.endless && s.endless.bld)) return false;   // 좀비가 오고 있으면 게이트에 쓰지 않는다 · 개편 판은 게이트에 안 든다(46.7)
  for (const row of s.rows) {
    const dz = row.z - q.z;
    if (row.done || dz < 12 || dz > 25) continue;
    const c = row.cells[pickCell(row, q.x)];
    if (c.op === 'add' && c.v > 0 && c.cap - c.v >= 0.3 * Math.abs(c.cap)) return true;   // 꽤 덜 찬 덧셈 칸만
  }
  return false;
}

/* ---------- 특수병 ---------- */
const SNIPE_W = { spit: 4, brute: 2, runner: 1.5, grunt: 1 };

/* 저격 표적: 독침 > 거구 > 질주 > 졸개(남은 체력 × 가중치), 없으면 보스 */
/* 개편 판: 분대가 지나갈 길(분대 폭과 겹치는) near~far m 안의 가장 가까운 상자·철창(37절) */
function bldProp(s, near, far) {
  if (!bldOf(s)) return null;
  const q = s.squad, R = radius(q.n);
  let best = null;
  for (const p of s.props) {
    if (!p.alive || p.passed || (p.kind !== 'crate' && p.kind !== 'cage')) continue;
    const dz = p.z - q.z;
    if (dz < near || dz > far || overlap(q.x - R, q.x + R, p.x0, p.x1) <= 0) continue;
    if (!best || p.z < best.z) best = p;
  }
  return best;
}
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
  // 상자·철창: 앞 단계 판은 쏘지 않는다(보상은 분대가 직접 쏴서 얻는 것). 개편 판(37절)은 쏠 좀비가 없을 때 분대가 지나갈 길의 상자·철창을 거든다 —
  // 특수병 위주 빌드에서 상자·철창이 안 깎이던 것(총이 피해의 1할 남짓). 드럼통·옆 칸 상자는 안 쏜다(고르는 것은 분대)
  const bp = bldProp(s, near, far);
  if (bp) return { kind: 'prop', o: bp };
  if (s.boss && s.boss.hp > 0 && s.boss.z - q.z < far) return { kind: 'boss', o: s.boss };
  return null;
}

function snipe(s, dmg, src, big = 1, boom = false) {
  const q = s.squad;
  const t = snipeTarget(s, SP.sniper.near, SP.sniper.far);
  if (!t) return false;
  let kill = false;
  let x1;
  let z1;
  // 2단계 시너지(저격수의 저격만): 얼음 조준 — 느려진 적에게 위력 +, 꿰뚫는 저격 — 일직선 뒤 표적 하나를 더
  const fx = src === 'sniper' && fxOf(s);
  const ice = fx && comboOn(s, 'frostSniper') ? 1 + comboV('frostSniper', !!bldOf(s)) : 1;
  // big(개편 판 '거물 사냥'): 보스·정예·거구에게 위력 ×big
  if (big > 1 && (t.kind === 'boss' || (t.kind === 'foe' && (t.o.elite || t.o.kind === 'brute' || t.o.kind === 'spit')))) dmg *= big;
  const dmgAt = (o) => (ice > 1 && o.slowT > s.t ? dmg * ice : dmg);
  if (t.kind === 'foe') {
    x1 = t.o.x; z1 = t.o.z; kill = hitFoe(s, t.o, fx ? dmgAt(t.o) : dmg, src === 'hero' ? 'hero' : 'sniper');
    if (!kill && src === 'sniper' && legOn(s, 'sniper')) { t.o.markT = s.t + ENH.sniper.legend.T; emit(s, { t: 'mark', id: t.o.id }); }   // 34절 전설 '약점 표시'
    if (!kill && fx && t.o.acid > 0 && bldOf(s) && fx.acid && comboOn(s, 'acidSniper')) {   // 녹이는 저격(부식 + 저격수): 쌓인 부식을 한 번에
      const left = t.o.acid * acidPer(s) * Math.max(0, t.o.acT - s.t);
      t.o.acid = 0;
      kill = hitFoe(s, t.o, left, 'sniper');
      emit(s, { t: 'melt', x: x1, z: z1 });
    }
  }
  else if (t.kind === 'prop') { x1 = (t.o.x0 + t.o.x1) / 2; z1 = t.o.z; hitProp(s, t.o, t.o.kind === 'crate' || t.o.kind === 'cage' ? dmg * BUILD.spCrate : dmg); kill = !t.o.alive; }   // 37절: 상자·철창에는 저격 몫만
  else { x1 = t.o.x; z1 = t.o.z - 1; hitBossBonus(s, dmg, src); if (src === 'sniper' && legOn(s, 'sniper')) t.o.markT = s.t + ENH.sniper.legend.T; }
  emit(s, { t: 'snipe', x0: q.x, z0: q.z, x1, z1, src, kill });
  if (boom && kill && t.kind === 'foe') fxBoom(s, x1, z1, 1.6, t.o.max * SP_EVO2.sniper.v, t.o);   // 저격수 Lv10 터지는 저격
  if (kill && src === 'sniper' && s.hero && enhN(s, 'sniper', 'r')) { chargeHero(s, ENH.sniper.rare.v * enhV(s, 'sniper', 'r')); emit(s, { t: 'morale', x: x1, z: z1, k: enhN(s, 'sniper', 'r') }); }   // 희귀 강화 '사기 충전'(그림: 빛 알갱이가 영웅에게)
  if (t.kind === 'foe' && ((fx && comboOn(s, 'pierceSniper')) || false)) {   // 관통 + 저격수 짝(하나), 전설 강화 '꿰뚫는 저격'(n마리)
    const nThru = 1;
    let from = t.o, fx1 = x1, fz1 = z1;
    for (let k = 0; k < nThru; k++) {
      const g = snipeThru(s, from, fx1, fz1);
      if (!g) break;
      const gk = hitFoe(s, g, dmgAt(g), 'sniper');
      emit(s, { t: 'snipe', x0: fx1, z0: fz1, x1: g.x, z1: g.z, src, kill: gk, thru: true });
      if (boom && gk && nThru > 1) fxBoom(s, g.x, g.z, 1.6, g.max * SP_EVO2.sniper.v, g);   // 전설: 뚫린 표적도 터진다
      from = g; fx1 = g.x; fz1 = g.z;
    }
  }
  return true;
}
/* 꿰뚫는 저격(관통 + 저격수): 분대 → 첫 표적의 일직선 뒤(사거리 SP.sniper.far 안)에서 선에 걸친(좀비 반지름 + 0.12m — 총알과 같은 너그러움) 가장 가까운 좀비 */
function snipeThru(s, f, x1, z1) {
  const q = s.squad;
  const dx = x1 - q.x, dz = z1 - q.z;
  const L = Math.hypot(dx, dz);
  if (!(L > 0)) return null;
  let g = null, best = Infinity;
  for (const o of s.foes) {
    if (!o.alive || o === f) continue;
    const ox = o.x - q.x, oz = o.z - q.z;
    const u = (ox * dx + oz * dz) / L;
    if (u <= L || u > SP.sniper.far || Math.abs(ox * dz - oz * dx) / L > o.r + 0.12) continue;
    if (u < best || (u === best && o.id < g.id)) { best = u; g = o; }
  }
  return g;
}

/* 가장 큰 무리(로켓병·화염병이 함께 쓰는 고르기): 분대 앞 near~far m의 좀비마다 그 둘레 네모(옆 ±rx, 앞뒤 ±rz) 안 체력 합을 보고
   min·D를 넘는 것 중 가장 큰 자리(그 좀비 위치) — 없으면 null */
function crowdAt(s, D, rx, rz, near, far, min = 0.3) {
  const q = s.squad;
  let best = null;
  let bestHp = min * D;
  for (const f of s.foes) {
    if (!f.alive) continue;
    const dz = f.z - q.z;
    if (dz < near || dz > far) continue;
    let sum = 0;
    for (const g of s.foes) if (g.alive && Math.abs(g.x - f.x) < rx && Math.abs(g.z - f.z) < rz) sum += g.hp;
    if (sum > bestHp) { bestHp = sum; best = { x: f.x, z: f.z, fid: f.id }; }
  }
  return best;
}
/* 로켓 표적: 8–30m 안 반경 r(로켓병 레벨) 안의 체력 합이 가장 큰 무리(0.3D 이상) → 분대 통로의 벽·장갑문 → 보스 */
function rocketTarget(s, D, r = SP.rocket.r, wallFirst = 0) {
  const q = s.squad;
  const R = radius(q.n);
  let best = null;
  if (wallFirst > 0) {   // 개편 판: 분대 통로를 막은 벽·장갑문이 wallFirst m 안이면 무리보다 먼저(로켓병이 길을 뚫는다 — ENDGAME.md 20절)
    for (const p of s.props) {
      if (!p.alive || p.passed || (p.kind !== 'wall' && p.kind !== 'door')) continue;
      const dz = p.z - q.z;
      if (dz < 3 || dz > wallFirst || overlap(q.x - R, q.x + R, p.x0, p.x1) <= 0) continue;
      if (!best || p.z < best.z || (p.z === best.z && p.hp > best.hp)) best = { x: clamp(q.x, p.x0, p.x1), z: p.z, fid: -1, hp: p.hp };
    }
    if (best) return best;
  }
  best = crowdAt(s, D, r, r, SP.rocket.near, SP.rocket.far);
  if (best) return best;
  { const bp = bldProp(s, 4, SP.rocket.far); if (bp) return { x: clamp(q.x, bp.x0, bp.x1), z: bp.z, fid: -1 }; }   // 37절: 개편 판은 무리가 없으면 길의 상자·철창
  for (const p of s.props) {
    if (!p.alive || p.passed || (p.kind !== 'wall' && p.kind !== 'door')) continue;
    const dz = p.z - q.z;
    if (dz < 4 || dz > SP.rocket.far || overlap(q.x - R, q.x + R, p.x0, p.x1) <= 0) continue;
    if (!best || p.z < best.z) best = { x: clamp(q.x, p.x0, p.x1), z: p.z, fid: -1 };
  }
  if (best) return best;
  if (s.boss && s.boss.hp > 0) return { x: s.boss.x, z: s.boss.z - 1, fid: -1 };
  return null;
}
/* 화염병이 불 지대를 놓을 자리(지대 가운데): 보스전(경기장 — 보스가 있으면)에는 보스 발밑(쓰러졌으면 없음), 달리는 동안은 SP.flame.near~far m 앞에서
   지대(폭 w × 길이 len) 안에 들 체력 합이 가장 큰 무리(로켓병의 고르기 crowdAt — min·D 넘게). 좀비가 지대를 지나 분대 쪽으로 걸어온다(구현 판단: 앞당겨 놓지 않는다 — 고른 무리가 곧 지대 안) */
function flameTarget(s, D, w, len) {
  const b = s.boss;
  if (b) return b.hp > 0 ? { x: b.x, z: b.z, boss: true } : null;
  return crowdAt(s, D, w / 2, len / 2, SP.flame.near, SP.flame.far, SP.flame.min);
}
/* 불 지대가 이 좀비·보스를 태우나(그린 것이 맞는 것 — hitShapes 'fire'와 같은 네모): 좀비는 가운데가 지대 안, 보스는 몸통 폭(±BOSS_HIT)이 지대에 걸치고 발(b.z)이 지대 길이 안 */
const inFire = (zn, x, z) => Math.abs(x - zn.x) < zn.w / 2 && Math.abs(z - zn.z) < zn.len / 2;
const bossInFire = (zn, b) => Math.abs(b.x - zn.x) < zn.w / 2 + BOSS_HIT && Math.abs(b.z - zn.z) < zn.len / 2;
/* 불 지대(4단계 화염병): 틱마다 지대 안 좀비에게 d·DT(얼음불 — 빙결 효과 + 화염병 — 이면 느려진 좀비는 × (1 + v)), 보스에게는 추가 피해 예산(BONUS_CAP — hitBossBonus) 안에서.
   게이트·벽·장갑문·상자·드럼통은 태우지 않는다(좀비·보스만). 유지 시간이 다하면 사라지고, 다 사라지면 s.flames 필드도 없다 */
function flamesUpdate(s) {
  const ice = fxOf(s) && comboOn(s, 'frostFlame') ? 1 + comboV('frostFlame', !!bldOf(s)) : 1;
  const b = s.boss;
  for (const zn of s.flames) {
    if (zn.follow !== undefined) { zn.x = s.squad.x; zn.z = s.squad.z + zn.follow; }   // 화염병 Lv10 따라오는 불: 지대가 분대를 따라온다
    const d = zn.d * DT;
    for (const f of s.foes) if (f.alive && inFire(zn, f.x, f.z)) hitFoe(s, f, ice > 1 && f.slowT > s.t ? d * ice : d, 'flame', zn.src);
    if (b && b.hp > 0 && bossInFire(zn, b)) hitBossBonus(s, d, 'flame', zn.src);
    zn.t -= DT;
  }
  s.flames = s.flames.filter((zn) => zn.t > 1e-9);
  if (!s.flames.length) delete s.flames;
}

/* 개편 판의 특수병 한 번(쿨다운이 찼을 때): 위력 ×BUILD.spDmg × spLv^(Lv−1), Lv5 고유 능력(SP_EVO), 시너지(속사 포격) */
function specialActB(s, m, lv, D, B) {
  const q = s.squad, h = s.hero;
  const P = BUILD.sp[m.k];
  const L5 = Math.min(lv, BUILD.evo);   // 정해진 값(간격·범위·위력 식)은 Lv5까지, 그 위는 각성·숙련 배수(a)로 — 18.4
  const a = awk(lv);
  const pow = P ? P.dmg * (1 + P.lv * (L5 - 1)) * a : 1;
  const evo = lv >= BUILD.evo;   // Lv5 고유 능력(roster.SP_EVO)
  const evo2 = lv >= 10;   // Lv10 2차 진화(roster.SP_EVO2)
  const fx = !!fxOf(s);
  if (m.k === 'sniper') {
    const nabiBoost = h && h.id === 'nabi' ? 1 + heroVal('nabi', 'boost', h.lv) * synergyOf(lv) : 1;
    const sLeg = 0;   // 34절: 저격수 전설은 '약점 표시'(snipe)
    const dmg = unitVal('sniper', 'dmg', L5) * D * nabiBoost * pow * legK(sLeg);
    const big = evo ? SP_EVO.sniper.v : 1;
    const ok = snipe(s, dmg, 'sniper', big, evo2 || sLeg > 0);
    m.cd = ok ? unitVal('sniper', 'every', L5) : 0.25;
  } else if (m.k === 'rocket') {
    const k = 1;
    const r = unitVal('rocket', 'r', L5) * k;
    const t = rocketTarget(s, D, r, BUILD.rocket.wallZ);
    if (!t) { m.cd = 0.25; return; }
    const T = Math.max(0.15, (t.z - q.z) / BUILD.rocket.speed);   // 개편 판: 빨리 날아간다
    const rk = { id: s.nextId++, x0: q.x, z0: q.z + 0.5, x: t.x, z: t.z, t: T, T, r, dmg: SP.rocket.dmg * D * pow * k * legKs(s, 'rocket'), fid: t.fid };   // 전설 강화 '융단 폭격': 피해 ×legK
    rk.wk = BUILD.rocket.wall;   // 개편 판: 벽·장갑문에 로켓 피해 ×wall
    if (evo2) rk.fire = true;
    if (legOn(s, 'rocket')) rk.cluster = 1;   // 34절 전설 '집속탄': 터질 때 작은 폭탄이 흩어진다   // 로켓병 Lv10 불씨 로켓(전설 강화면 바로): 떨어진 자리에 불 지대
    if (enhN(s, 'rocket', 'r')) rk.again = ENH.rocket.rare.v * enhV(s, 'rocket', 'r');   // 희귀 강화 '이어 터짐': 한 번 더 터진다
    s.rockets.push(rk);
    emit(s, { t: 'rocket', id: rk.id, x0: rk.x0, z0: rk.z0, x: rk.x, z: rk.z });
    if (evo) {   // 로켓병 Lv5 쌍발: 한 발 더(조금 늦게 같은 자리에)
      const r2 = { ...rk, id: s.nextId++, t: T + 0.15, T: T + 0.15, dmg: rk.dmg * BUILD.rocket.twin, small: 1, fire: false };   // 둘째 로켓은 twin 몫, 불은 첫 발만(33·34절)   // 둘째 로켓은 twin 몫(33절)
      s.rockets.push(r2);
      emit(s, { t: 'rocket', id: r2.id, x0: r2.x0, z0: r2.z0, x: r2.x, z: r2.z });
    }
    m.cd = unitVal('rocket', 'every', L5) * BUILD.rocket.cd * (fx && comboOn(s, 'rapidRocket') ? Math.max(0.3, 1 - (1 - COMBOS.rapidRocket.v) * comboK(s, 'rapidRocket')) : 1);   // 개편 판: 간격 ×cd(발동이 너무 느렸다)
  } else if (m.k === 'flame') {
    const w = unitVal('flame', 'w', L5) * (h && h.id === 'mungchi' && h.act > 0 ? 1 + UNITS.flame.horn * synergyOf(lv) : 1);
    const len = unitVal('flame', 'len', L5) * (evo ? SP_EVO.flame.v : 1);   // 화염병 Lv5 불바다: 불 지대 길이 ×2
    const t = flameTarget(s, D, w, len);
    if (!t) { m.cd = 0.25; return; }
    const T = unitVal('flame', 'T', L5);
    const zn = { id: s.nextId++, x: t.x, z: t.z, w, len, t: T, T, follow: evo2 ? t.z - q.z : undefined,   // 화염병 Lv10 · 전설 강화 '따라오는 불'
    d: unitVal('flame', 'dmg', L5) * D * pow * legKs(s, 'flame'), lv };   // 전설 강화 '불의 행진': 불 피해 ×legK
    (s.flames || (s.flames = [])).push(zn);
    emit(s, { t: 'flame', id: zn.id, x0: q.x, z0: q.z, x: zn.x, z: zn.z, w, len, T, lv, boss: !!t.boss });
    m.cd = unitVal('flame', 'every', L5);
  } else m.cd = 1;
}
function specialsUpdate(s, R) {
  const q = s.squad;
  if (q.n <= 0) return;
  const D = dps(q.n, q.tier, s.fireLv) * heroDmg(s);
  // 회복 풀(의무병·보리)
  q.recent *= 1 - DT / 4;
  if (q.pool > 0) {
    const medLv = s.endless && s.endless.bld ? spLv(q, 'medic') : 0;   // 개편 판: 의무병 레벨마다 회복이 50% 빨라진다
    q.healAcc += Math.max(1.5, 0.35 * q.pool) * DT * (medLv ? (1 + 0.5 * medLv) * legKs(s, 'medic') : 1);   // 전설 강화 '기적의 손': 회복 ×legK
    const k = Math.floor(Math.min(q.healAcc, q.pool));
    if (k >= 1) {
      q.pool -= k;
      q.healAcc -= k;
      s.stats.healed += k;
      gain(s, k, q.x, q.z, 'heal');
      emit(s, { t: 'heal', n: k, x: q.x, z: q.z });
      const mr = enhV(s, 'medic', 'r');
      if (mr) { for (const m of q.sp) m.cd = Math.max(0, m.cd - ENH.medic.rare.v * mr); emit(s, { t: 'breath', k: enhN(s, 'medic', 'r') }); }   // 희귀 강화 '숨 돌리기': 회복할 때마다 특수병이 숨을 돌린다(그림: 특수병이 반짝)
    } else if (q.pool < 1) q.healAcc = 0;   // 1명이 안 되는 몫은 남겨 두고 다음 손실과 합친다
  }
  const h = s.hero;
  const B = s.endless && s.endless.bld;
  const drum = B && s.phase === 'arena' && relicOn(s, 'drum') ? 1 / RELICS.drum.cd : 1;   // 진격 북: 보스전 동안 쿨다운 ×cd
  for (const m of q.sp) {
    m.cd -= DT * drum;
    if (m.cd > 0) continue;
    const lv = m.lv || 1;
    if (B) { specialActB(s, m, lv, D, B); continue; }
    if (m.k === 'sniper') {
      // 저격수: 레벨마다 더 자주·더 세게. 나비가 있으면 위력 +boost — 저격수 레벨만큼 더(짝 효과)
      const nabiBoost = h && h.id === 'nabi' ? 1 + heroVal('nabi', 'boost', h.lv) * synergyOf(lv) : 1;
      m.cd = snipe(s, unitVal('sniper', 'dmg', lv) * D * nabiBoost, 'sniper') ? unitVal('sniper', 'every', lv) : 0.25;
    } else if (m.k === 'rocket') {
      // 로켓병: 레벨마다 더 자주·더 넓게
      let r = unitVal('rocket', 'r', lv);
      if (fxOf(s) && comboOn(s, 'burstRocket')) r += COMBOS.burstRocket.v;   // 대폭발(작렬 + 로켓병): 폭발 반경 +
      const t = rocketTarget(s, D, r);
      if (!t) { m.cd = 0.25; continue; }
      const T = Math.max(0.25, (t.z - q.z) / SP.rocket.speed);
      const rk = { id: s.nextId++, x0: q.x, z0: q.z + 0.5, x: t.x, z: t.z, t: T, T, r, dmg: SP.rocket.dmg * D, fid: t.fid };
      s.rockets.push(rk);
      emit(s, { t: 'rocket', id: rk.id, x0: rk.x0, z0: rk.z0, x: rk.x, z: rk.z });
      m.cd = unitVal('rocket', 'every', lv);
    } else if (m.k === 'flame') {
      // 화염병(4단계): 레벨마다 더 자주·더 오래·더 세게(Lv3은 더 넓게). 짝 영웅 뭉치의 돌격 나팔 동안 폭 +horn(화염병 레벨만큼 ×1·×1.25·×1.5).
      // 피해는 놓는 순간의 D(로켓처럼 — 뭉치 스킬 배수 포함)로 정해 지대에 싣는다. 그 틱부터 태운다(flamesUpdate)
      const w = unitVal('flame', 'w', lv) * (h && h.id === 'mungchi' && h.act > 0 ? 1 + UNITS.flame.horn * synergyOf(lv) : 1);
      const len = unitVal('flame', 'len', lv);
      const t = flameTarget(s, D, w, len);
      if (!t) { m.cd = 0.25; continue; }
      const T = unitVal('flame', 'T', lv);
      const zn = { id: s.nextId++, x: t.x, z: t.z, w, len, t: T, T, d: unitVal('flame', 'dmg', lv) * D, lv };
      (s.flames || (s.flames = [])).push(zn);
      emit(s, { t: 'flame', id: zn.id, x0: q.x, z0: q.z, x: zn.x, z: zn.z, w, len, T, lv, boss: !!t.boss });
      m.cd = unitVal('flame', 'every', lv);
    } else m.cd = 1;
  }
  // 영웅 나비: 패시브 직접 저격(저격수가 없을 때), 스킬 중에는 연속 저격
  if (h && h.id === 'nabi') {
    if (h.act > 0) {
      h.shot -= DT;
      if (h.shot <= 0) { h.shot = HEROES.nabi.skill.dur / HEROES.nabi.num.shots; snipe(s, heroVal('nabi', 'shot', h.lv) * D, 'hero'); }
    } else if (!hasSp(q, 'sniper')) {
      h.cd -= DT;
      if (h.cd <= 0) h.cd = snipe(s, heroVal('nabi', 'snipe', h.lv) * D, 'hero') ? HEROES.nabi.num.every : 0.25;
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
      const zapFrom = [];
      for (const f of s.foes) if (f.alive && Math.abs(f.x - rk.x) < rk.r + f.r && Math.abs(f.z - rk.z) < rk.r + f.r) { hitFoe(s, f, rk.ice && f.slowT > s.t ? rk.dmg * rk.ice : rk.dmg, 'rocket'); if (zapFrom.length < 6) zapFrom.push(f); }
      if (zapFrom.length && s.endless && s.endless.bld && s.endless.fx && s.endless.fx.shock && comboOn(s, 'shockRocket')) {   // 폭풍 포격(전격 + 로켓병): 폭발 안 좀비마다 사슬 한 번
        const v = fx2Val('shock', s.endless.fx.shock), r2 = v.r * v.r, d = rk.dmg * v.chain * comboK(s, 'shockRocket');
        for (const f of zapFrom) {
          let best = null, bd = r2;
          for (const o of s.foes) { if (!o.alive || o === f) continue; const dd = (o.x - f.x) ** 2 + (o.z - f.z) ** 2; if (dd <= bd) { bd = dd; best = o; } }
          if (best) { hitFoe(s, best, d, 'chain', 'shock'); emit(s, { t: 'zap', pts: [f.x, f.z, best.x, best.z] }); }
        }
      }
      for (const p of s.props) {
        if (!p.alive || p.passed || Math.abs(p.z - rk.z) > rk.r || overlap(rk.x - rk.r, rk.x + rk.r, p.x0, p.x1) <= 0) continue;
        hitProp(s, p, (p.kind === 'door' ? rk.dmg * OBSTACLES.door.rocket : rk.dmg) * (p.kind === 'wall' || p.kind === 'door' ? rk.wk || 1 : 1));   // 장갑문에는 로켓이 잘 든다(개편 판은 벽·문 모두 ×wk — 37절: 상자·철창은 ×wk 없이)
      }
      const b = s.boss;
      if (b && b.hp > 0 && Math.abs(b.z - 1 - rk.z) < rk.r + 1 && Math.abs(b.x - rk.x) < rk.r + b.r) hitBossBonus(s, rk.dmg, 'rocket');
      emit(s, { t: 'boom', x: rk.x, z: rk.z, r: rk.r, small: rk.small });
      if (rk.again) s.rockets.push({ ...rk, id: s.nextId++, t: 0.4, T: 0.4, dmg: rk.dmg * rk.again, again: 0, fire: false, fid: -1 });
      if (rk.cluster) {   // 34절 전설 '집속탄': 둘레에 작은 폭탄 n개(반경 ×0.45, 피해 ×v) — 굴림은 판 난수
        const CL = ENH.rocket.legend, n = Math.round(CL.n * legK2(s, 'rocket'));
        for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + rand(s) * 0.8, d = rk.r * (0.7 + 0.5 * rand(s)); s.rockets.push({ ...rk, id: s.nextId++, x: rk.x + Math.cos(a) * d, z: rk.z + Math.sin(a) * d, t: 0.18 + 0.06 * i, T: 0.18 + 0.06 * i, r: rk.r * 0.45, dmg: rk.dmg * CL.v, again: 0, fire: false, cluster: 0, small: 1, fid: -1 }); }
      }
      if (rk.fire) {   // 불씨 로켓(Lv10): 떨어진 자리에 불 지대(2초)
        const F = BUILD.rocket.fire, zn = { id: s.nextId++, x: rk.x, z: rk.z, w: rk.r * F.w, len: rk.r * F.w, t: F.T, T: F.T, d: rk.dmg * F.d, lv: 1, src: 'rocket' };   // 34절: 예전 폭 ×1.6 · 2초 · ×0.4 — 쌍발·잦은 로켓에 겹쳐 길을 덮었다
        (s.flames || (s.flames = [])).push(zn);
        emit(s, { t: 'flame', id: zn.id, x0: rk.x, z0: rk.z, x: zn.x, z: zn.z, w: zn.w, len: zn.len, T: zn.T, lv: 1, boss: false });
      }
    }
    s.rockets = s.rockets.filter((rk) => rk.t > 0);
  }
  if (s.flames) flamesUpdate(s);   // 불 지대(화염병 줄을 연 판에만 생긴다)
  void R;
}

/* ---------- 봇 ---------- */
/* 목표 x → 좌우 누르기 입력. 봇도 좌우 누르기만으로 깰 수 있어야 한다. */
/* 봇의 갈림길 판단: 분리대가 20m 안이면 한쪽을 고른다 — 벽(장갑문)이 지금 화력으로 뚫릴 만하면(다가오는 동안 쏟는 양의 0.9배 안) 위험한 쪽, 아니면 안전한 쪽.
   이미 갈렸으면 제 쪽 그대로. 고른 쪽 차선 안(몸이 통째로 들어가는 자리)으로 목표를 옮긴다 */
function divSteer(s, tx) {
  const q = s.squad;
  const dv = divAt(s, 20);
  if (!dv) return tx;
  const R = radius(q.n);
  let side;
  if (q.z >= dv.z0) side = q.x >= 0 ? 1 : -1;
  else {
    const can = dps(q.n, q.tier, s.fireLv) * heroDmg(s) * 0.9 * ((BULLET_RANGE - 2) / Math.max(1, q.vz));
    if (dv.kind === 'horde') {
      // 좀비 떼: 위험한 쪽 차선에 남은 체력 합을 벽처럼 견준다(다가오는 적이라 쏠 시간이 짧다 — FORK_HORDE의 위쪽 끝이 벽 한 장 몫)
      let H = 0;
      for (const f of s.foes) if (f.alive && f.z >= dv.z0 && f.z <= dv.z1 && Math.sign(f.x) === dv.risk) H += f.hp * (f.elite === 'split' ? 1 + ELITE.split.kids * ELITE.split.kidHp : 1);
      side = H > can * FORK_HORDE[1] ? -dv.risk : dv.risk;
    } else {
      // 벽(장갑문이면 이 판의 총알이 문에 주는 배수 doorMul만큼 — 작렬·관통 효과가 있으면 더 잘 뚫린다)
      const w = s.props.find((p) => p.id === dv.wall);
      side = w && w.alive && w.hp > (w.kind === 'door' ? can * doorMul(s) : can) ? -dv.risk : dv.risk;
    }
  }
  const lo = Math.min(EDGE, R + 0.1);
  return side * clamp(side * tx, lo, EDGE);
}
export function steer(s, tx, dead = 0.15) {
  const q = s.squad;
  if (s.divs) tx = divSteer(s, tx);
  if (s.lanes) { const l = laneAt(s, q.z + 2); if (l) { const [lo, hi] = laneBounds(l, laneCell(q.x), q.z + 2, 0); if (tx < lo || tx > hi) tx = clamp(tx, lo + 0.2, hi - 0.2); } }   // 칸막이(22절): 갈 수 없는 칸을 밀지 않는다
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
  RCAP = capFor(s);
  const q = s.squad;
  const R = radius(q.n);
  const sight = opt.sight ?? 40;
  if (s.phase === 'arena' && s.boss) return bossDodge(s, R);
  const D = dps(q.n, q.tier, s.fireLv);
  const vz = Math.max(1, q.vz);
  const span = R + 0.3;
  const cover = (x, x0, x1) => overlap(x - span, x + span, x0, x1) / (2 * span);
  const hitK = crateHitOf(s.params);
  let hasFoes = false;
  for (const f of s.foes) if (f.alive && f.z > q.z && f.z - q.z < 34) { hasFoes = true; break; }
  // 후보 자리: 고정 후보 + 지금 자리 + 톱날·독침을 막 비켜서는 자리
  const cands = CANDS.slice();
  cands.push(clamp(q.x, -EDGE, EDGE));
  for (const w of s.saws) {
    const dz = w.z - q.z;
    if (dz < -1 || dz > 16) continue;
    const sx = sawAt(w, Math.max(0, dz / vz));
    const gap = R + w.w / 2 + 0.35;
    cands.push(clamp(sx - gap, -EDGE, EDGE), clamp(sx + gap, -EDGE, EDGE));
  }
  for (const sp of s.spits) {
    if (sp.t > 0.95) continue;
    const gap = R + 1.2 + 0.3;
    cands.push(clamp(sp.x - gap, -EDGE, EDGE), clamp(sp.x + gap, -EDGE, EDGE));
  }
  const pools = s.pools || null;
  if (pools) for (const pl of pools) {
    if (pl.hit || pl.z < q.z - 1 || pl.z - q.z > 34) continue;
    const gap = R + POOL_R + 0.3;
    cands.push(clamp(pl.x - gap, -EDGE, EDGE), clamp(pl.x + gap, -EDGE, EDGE));
  }
  // 톱날 한 번 스치는 손실(띠를 지나는 시간 동안 초당 4 + 0.35n의 대부분 — 개편 판은 처음 닿는 한 입 + 초당 SAW2, 49절)
  const sawCost = s.endless && s.endless.bld
    ? q.n * SAW2.bite + (SAW2.flat + SAW2.rate * q.n) * ((2 * (0.55 * R + 0.35)) / vz) * 0.8 + 1
    : (4 + 0.35 * q.n) * ((2 * (0.55 * R + 0.35)) / vz) * 0.8 + 1;
  // 2단계 장애물: 장갑문에 들어가는 총알 몫, 앞에 있는 폭발 드럼통(닿아도 안 다치고 보상도 없다 — 옆 상자를 같이 쏘면 상자째 터진다)
  const dk = doorMul(s);
  const drums = [];
  for (const p of s.props) if (p.kind === 'drum' && p.alive && !p.passed && p.z > q.z - 1 && p.z - q.z < 40) drums.push(p);
  let row = null;
  for (const r of s.rows) if (!r.done && r.z > q.z && r.z - q.z < sight) { if (!row || r.z < row.z) row = r; }
  const horizon = row ? row.z : q.z + 34;
  let best = -Infinity;
  let bestX = q.x;
  for (let ci = 0; ci < cands.length; ci++) {
    const x = cands[ci];
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
      const after = applyOp(q.n, c.op, v, nMax(s));
      val += after <= 0 ? -q.n * 2 : after - q.n;
      if (c.op === 'unit' && opt.specials !== false) val += spWorth(s, c.k);
    }
    // 벽·상자·철창: 그 자리에서 쏴서 못 부수면 남은 만큼 잃는다(상자·철창은 crateHit만큼 — P10, 모든 봇이 장애물로 본다).
    // 부술 수 있으면 보상: 보통 상자는 상자를 챙기는 봇만, 앞에 게이트 줄이 보이지 않을 때. 열쇠 상자(p.key)는 누구나(opt.keys=false가 아니면)
    for (const p of s.props) {
      if (!p.alive || p.passed || p.z < q.z || p.z > horizon + 0.5 || p.z - q.z > 34 || p.kind === 'drum') continue;
      const t = (p.z - q.z) / vz;
      const shot = D * cover(x, p.x0, p.x1) * Math.max(0, t - travel) * 0.85;
      const ov = overlap(x - R, x + R, p.x0, p.x1) / (2 * R);
      const left = p.kind === 'door' ? p.hp - shot * dk : p.hp - shot;
      if (p.kind === 'wall' || p.kind === 'door') {
        if (ov > 0 && left > 0) val -= contactCost(left) * Math.min(1, ov * 2) + 1;
        continue;
      }
      if (left > 0) {
        if (ov > 0) val -= contactCost(left * hitK) * Math.min(1, ov * 2) + 0.5;
        continue;
      }
      if (row && !p.key) continue;
      if (drums.length && drums.some((d) => cover(x, d.x0, d.x1) > 0 && blastReach(d, p))) continue;   // 이 자리의 총알이 옆 드럼통도 터뜨린다 — 상자째 잃는다
      const r = p.reward;
      if (r.type === 'unit') { if (opt.specials !== false) val += spWorth(s, r.k); }
      else if (opt.crates !== false || (p.key && opt.keys !== false)) val += crateWorth(s, p);
    }
    // 톱날: 지나가는 순간 톱날이 있을 자리(오가는 움직임을 그대로 앞질러 본다)
    for (const w of s.saws) {
      const dz = w.z - q.z;
      if (dz < -0.5 || dz > 16) continue;
      const tw = Math.max(0, dz / vz);
      const at = travel < tw ? x : q.x;
      if (Math.abs(sawAt(w, tw) - at) < R + w.w / 2 + 0.25) val -= sawCost;
    }
    // 독침: 떨어질 때까지 비켜설 수 있으면 그 자리, 아니면 지금 자리가 맞는다
    for (const sp of s.spits) {
      if (sp.t > 0.95) continue;
      const at = moveTime(x - q.x) + 0.05 < sp.t ? x : q.x;
      const ov = overlap(at - R, at + R, sp.x - 1.2, sp.x + 1.2) / (2 * R);
      if (ov > 0) val -= Math.ceil(0.3 * ov * q.n) + 1;
    }
    // 오염 웅덩이: 닿을 때 해로운(예고가 끝났고 아직 남아 있는) 웅덩이를 그 자리에서 밟게 되나
    if (pools) for (const pl of pools) {
      if (pl.hit || pl.z < q.z - 1 || pl.z - q.z > 34) continue;
      const ta = Math.max(0, (pl.z - q.z - R) / vz);
      if (ta < pl.t - 0.05 || ta > Math.max(0, pl.t) + pl.life) continue;
      const at = moveTime(x - q.x) + 0.05 < ta ? x : q.x;
      const ov = overlap(at - R, at + R, pl.x - POOL_R, pl.x + POOL_R) / (2 * R);
      if (ov > 0) val -= Math.ceil(POOL_HIT * ov * q.n) + 1;
    }
    // 무리: 이 자리에 닿을 적(다가오는 동안 옆으로 따라붙는 만큼 포함) 중 쏴서 못 잡는 만큼.
    // 총알은 분대 폭(±span) 앞으로만 나가므로, 옆에서 파고드는 적은 폭 안에 들어온 뒤에야 맞는다
    if (hasFoes) val -= hordeCost(s, x, R, span, D, vz) / SOLDIER_HP;
    if (val > best + 1e-9) { best = val; bestX = x; }
  }
  let tx = bestX;
  // 다음 줄의 칸 경계에 서지 않는다 — 고른 칸 쪽으로 비켜 선다(경계 위 x는 왼쪽 칸이다)
  if (row) {
    const want = pickCell(row, tx);
    for (let i = 1; i < row.cells.length; i++) {
      const x0 = row.cells[i].x0;
      if (Math.abs(tx - x0) < 0.4) tx = want >= i ? x0 + 0.4 : x0 - 0.4;
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
    const pad = 0.4 + SLAM_EDGE * R;
    const inZone = (x) => x >= b.slam.x0 - pad && x <= b.slam.x1 + pad;
    if (inZone(q.x) || inZone(tx)) {
      const cands = [b.slam.x0 - pad - 0.3, b.slam.x1 + pad + 0.3].filter((x) => x >= -EDGE && x <= EDGE);
      const late = (x) => (moveTime(x - q.x) + 0.1 > b.slam.t ? 100 : 0);
      cands.sort((a, c) => late(a) + Math.abs(a - b.x) * 0.5 + Math.abs(a - q.x) * 0.3 - (late(c) + Math.abs(c - b.x) * 0.5 + Math.abs(c - q.x) * 0.3));
      if (cands.length) tx = cands[0];
    }
  }
  // 개편 판 보스의 좀비 장벽(23절): 가까운 줄(9m 안)이 앞을 막으면 빈틈으로(내려찍기 예고가 없을 때만 — 예고가 먼저)
  if (b.pat && !b.slam) {
    let rz = Infinity;
    for (const f of s.foes) if (f.alive && f.line && f.z > q.z && f.z - q.z < 9 && f.z < rz) rz = f.z;
    if (rz < Infinity) {
      const row = s.foes.filter((f) => f.alive && f.line && Math.abs(f.z - rz) < 1.2);
      const clear = (x) => row.reduce((m, f) => Math.min(m, Math.abs(f.x - x)), Infinity);
      if (clear(tx) < hitHalf(R) + 0.6) {
        let best = tx, bc = -1;
        for (let x = -EDGE; x <= EDGE + 1e-9; x += 0.25) { const c = clear(x) - Math.abs(x - q.x) * 0.05; if (c > bc) { bc = c; best = x; } }
        if (clear(best) > hitHalf(R) + 0.3) tx = best;
      }
    }
  }
  // 개편 판 보스의 독침 세례: 떨어질 자리(±SPIT_R, 범위 강화면 sp.r)에 걸치면 가까운 옆으로 비켜선다(내려찍기 구역은 피해서)
  if (b.pat && s.spits.length) {
    const H = hitHalf(R) + 0.3;
    const bad = (x) => s.spits.some((sp) => sp.t > 0 && Math.abs(sp.x - x) < H + (sp.r || SPIT_R)) || (b.slam && x >= b.slam.x0 - SLAM_EDGE * R - 0.4 && x <= b.slam.x1 + SLAM_EDGE * R + 0.4);
    if (bad(tx)) {
      let best = tx, bd = Infinity;
      for (let dx = 0.5; dx <= 2 * EDGE; dx += 0.5) for (const x of [q.x - dx, q.x + dx]) if (x >= -EDGE && x <= EDGE && !bad(x) && Math.abs(x - q.x) < bd) { bd = Math.abs(x - q.x); best = x; }
      tx = best;
    }
  }
  return tx;
}

export function botInput(s, opt) {
  const inp = steer(s, botTarget(s, opt));
  inp.skill = heroWants(s);
  return inp;
}

/* 분대가 x에 서 있으면 닿을 적들의 '쏴서 못 잡는 체력'(봇 판단용). 적마다: 닿기까지 tc초, 따라붙기는 homeDist 안에서부터 초당 home m,
   총알 폭 안에 든 뒤로 사거리 안에서 맞는다. 닿을 적의 체력 합 − 화력 × 0.85 × (그 적들이 맞는 평균 초) */
function hordeCost(s, x, R, span, D, vz) {
  return foeLeftover(s.foes, x, R, span, D, vz, s.squad.z, shieldMul(s));
}
/* qz = 분대 z(판 중), null이면 레벨 생성용 — 적마다 34m 앞에서 처음 본다고 친다.
   sk(판 중만): 방패 정예에 총알이 드는 몫(shieldMul) — 그 좀비의 체력을 1/sk배로 본다(못 잡는 몫을 넉넉히 — 독침 공정성에도 안전한 쪽). 레벨 생성은 1(방패를 안 본다) */
function foeLeftover(foes, x, R, span, D, vz, qz, sk = 1) {
  let H = 0;
  let hts = 0;
  for (const f of foes) {
    if (!f.alive) continue;
    const dz = qz == null ? 34 : f.z - qz;
    if (dz < 0 || dz > 34) continue;
    const close = vz + f.spd;
    const tc = dz / close;
    const t0 = Math.max(0, (dz - f.homeDist) / close);   // 따라붙기 시작
    const reach = f.home * Math.max(0, tc - t0);
    const dx = Math.abs(x - f.x);
    if (dx - reach >= R + f.r * 0.8) continue;
    const enter = dx <= span ? 0 : t0 + (dx - span) / Math.max(0.1, f.home);
    const tr = Math.max(0, (dz - BULLET_RANGE) / close);
    const hp = sk < 1 && f.elite === 'shield' ? f.hp / sk : f.hp;
    H += hp;
    hts += hp * Math.max(0, tc - Math.max(enter, tr));
  }
  if (H <= 0) return 0;
  return Math.max(0, H - D * 0.85 * (hts / H));
}
/* 톱날이 t초 뒤 있을 x(xa~xb를 spd로 오간다) */
export function sawAt(w, t) {
  const L = w.xb - w.xa;
  if (!(L > 0)) return w.xa;
  const per = 2 * L;
  let u = (w.x - w.xa) + w.dir * w.spd * t;
  u = ((u % per) + per) % per;
  return w.xa + (u <= L ? u : per - u);
}
/* 상자 보상이 병사 몇 명 몫인가(봇 판단용). 열쇠 상자는 다음 난관을 넘게 해 주므로 더 크게 본다 */
export const KEY_WORTH = 0.25;
export function crateWorth(s, p) {
  const q = s.squad;
  const r = p.reward;
  const v = r.type === 'gun' ? (q.tier < tierMax(s) ? q.n * 0.25 + 3 : 2) : r.type === 'men' ? r.v : r.type === 'fx' ? (fxCan(s, r.a) ? 3 + q.n * FX_WORTH : 2) : 2;
  return v + (p.key ? KEY_WORTH * q.n : 0);
}
/* 특수병 한 명이 병사 몇 명 몫인가(봇 판단용). 이미 있는 병과의 레벨 올리기는 합류의 SP_UP_WORTH배(SIM 9) —
   단 SIM 8에서 같은 병과가 바뀌던 병사 몫보다 낮게 보지는 않는다(봇의 길이 SIM 8보다 나빠지지 않게) */
const SP_WORTH = { medic: 0.1, sniper: 0.09, rocket: 0.12, flame: 0.1 };   // 화염병(4단계 판만)은 초안 — 밸런스 때 잰다
export const SP_UP_WORTH = 0.6;
export function spWorth(s, k) {
  const q = s.squad;
  const lv = spLv(q, k);
  const men = Math.max(5, nice(0.12 * q.n));
  if (lv && lv < spLvMax(s)) return Math.max(men, 3 + q.n * SP_WORTH[k] * SP_UP_WORTH);
  if (lv || q.sp.length >= spMax(s) || q.n < spEscort(s) * (q.sp.length + 1)) return men;
  return 3 + q.n * SP_WORTH[k];
}

/* ---------- 보정 ----------
   레벨마다 기준 봇을 '그 레벨의 기대 강화(EXPECT) + 기대 영웅의 상시 효과'로 돌려 보스 체력·별 기준·지원 병력을 정한다.
   기준 봇이 보정에 실패하면(경기장에 못 가거나 정한 보스를 못 이기면) 다른 시드로 다시 만든다.
   L1~120은 미리 계산한 표(caltable.js)를 쓰고, 그 뒤는 처음 열 때 계산한다. */
const cache = new Map();
export const CAL_FIELDS = ['attempt', 'bare', 'bossHp', 'arrive', 'arriveStrong', 'arriveWeak', 'par', 'calTier', 'helpStart', 'Hstar', 'qa'];
export function prepareLevel(L, cycle = 1) {
  const key = Math.max(1, Math.floor(L));
  const c = Math.max(1, Math.floor(cycle) || 1);
  if (c > 1) return prepareCycle(key, c);
  if (cache.has(key)) return cache.get(key);
  const pre = CALT && CALT.sim === SIM && CALT.levels && CALT.levels[key];
  if (pre) {
    const lv = buildLevel(key, pre.attempt, !!pre.bare);
    for (const f of CAL_FIELDS) lv[f] = pre[f];
    cache.set(key, lv);
    return lv;
  }
  // 표 밖 레벨(게임이 처음 열 때): 배치를 RUNTIME_TRIES번까지만 다시 만든다(휴대폰에서 레벨 시작이 늦지 않게)
  const lv = calibrateLevel(key, RUNTIME_TRIES);
  cache.set(key, lv);
  return lv;
}
/* 회차 c(2부터)의 레벨: 회차 표(cyctable.js — 2·3회차)가 있으면 그대로, 없으면(그 뒤 회차) 처음 열 때 그 자리에서 보정한다 —
   배치는 1회차 표의 것을 먼저 보고(같은 레벨), 어려운 레벨의 보스는 H* × 표의 '체력/H*' 중앙값(L121+와 같은 빠른 길, lv.fast) */
function prepareCycle(key, c) {
  const ck = `${c}:${key}`;
  if (cache.has(ck)) return cache.get(ck);
  const T = CYCT && CYCT.sim === SIM && CYCT.cycles && CYCT.cycles[c];
  const pre = T && T.levels && T.levels[key];
  let lv;
  if (pre) {
    lv = buildLevel(key, pre.attempt, !!pre.bare, c);
    for (const f of CAL_FIELDS) lv[f] = pre[f];
  } else lv = calibrateLevel(key, RUNTIME_TRIES, keepAttempt(key), c, true);
  cache.set(ck, lv);
  return lv;
}

/* 보정 표를 쓰지 않고 실제로 보정한다(표 만들기·검증·표 밖 레벨용). tries = 배치를 몇 번까지 다시 만드나(표는 8, 그 자리에서는 RUNTIME_TRIES).
   배치 검사를 끝까지 못 넘으면 처음 보정된 배치(lv.qa = false).
   keep(SIM 8): 먼저 볼 배치 — 보정 표에 이미 적힌 배치(keepAttempt). 규칙(SIM)을 바꿔도 그 배치가 새 규칙의 보정·배치 검사를 넘으면 그대로 써서,
   판정만 고쳤는데 플레이어가 알던 레벨이 통째로 다른 배치로 바뀌지 않게 한다. 못 넘으면 0번 배치부터 다시 고른다. 표 밖 레벨(그 자리 보정)은 없음 */
export const CAL_TRIES = 8;
export const RUNTIME_TRIES = 4;
/* 표에 적힌 배치(어느 SIM의 표든 — 도구는 CALT.keep으로 이전 표의 배치를 넘긴다) */
export function keepAttempt(key) {
  const k = CALT && CALT.keep ? CALT.keep[key] : CALT && CALT.levels && CALT.levels[key] ? CALT.levels[key].attempt : null;
  return Number.isInteger(k) && k >= 0 ? k : null;
}
export function calibrateLevel(key, tries = CAL_TRIES, keep = keepAttempt(key), cycle = 1, fast = false) {
  let lv = null;
  let firstOk = null;
  // 3패 지원 병력은 끝에 고른 배치에서만 잰다(보스 체력과 상관없어 결과는 같고, 배치 검사에서 떨어진 배치에 판 한 번씩을 덜 돈다)
  const help = new Map();
  const order = keep != null && keep < tries ? [keep] : [];
  for (let a = 0; a < tries; a++) if (a !== keep) order.push(a);
  const lastTry = order[order.length - 1];
  let done = false;
  // 그 자리 보정(표 밖 레벨 — keep 없음)은 bare로 다시 보정하기를 한 번까지만(휴대폰에서 레벨 시작이 늦어지지 않게 — 보정은 많아야 tries + 1번)
  let bareLeft = keep == null || fast ? 1 : Infinity;
  // SIM 11: 서 있기 검사는 넘겼지만 벽 검사를 못 넘은 배치(가장 나은 것이 끝내 다른 배치가 없을 때의 대안)
  const walls = [];
  for (const attempt of order) {
    // SIM 9: 먼저 새 규칙 그대로. 보정은 됐는데 서 있기만 해도 이기면(MAX 칸이 한 자리에 선 분대를 도운 곳)
    // 같은 배치를 SIM 8처럼(bare) 다시 보정한다 — 레벨이 통째로 바뀌거나 보스가 세지는 것보다 그 레벨만 MAX 칸을 빼는 쪽이 낫다
    let hasMax = false;
    for (const bare of [false, true]) {
      // MAX 칸이 없는 배치는 bare와 병과만 다르다 — SIM 8처럼 바로 qaBoost(다시 보정하지 않는다)
      if (bare && (!hasMax || bareLeft-- <= 0)) break;
      lv = buildLevel(key, attempt, bare, cycle);
      if (fast) lv.fast = true;
      if (!bare) hasMax = lv.rows.some((r) => r.cells.some((c) => c.cap0 != null));
      const cal = calibrate(lv, { last: attempt === lastTry });
      if (!cal.ok) { lv.failed = true; break; }   // 보정이 안 되는 배치는 bare로도 다시 보지 않는다(서 있기와 상관없는 실패)
      Object.assign(lv, cal.lv);
      help.set(lv, cal.help);
      // 배치 검사: 한 자리에 서 있기만 해서는 이기지 못해야 한다. 못 넘으면 SIM 8처럼(bare), 그래도 못 넘으면 보스를 조금 세게(qaBoost),
      // 그래도 안 되면 다른 배치로. 끝까지 못 넘으면 처음 보정된 배치를 쓴다(lv.qa = false — 테스트가 어느 레벨인지 본다)
      if (!firstOk) firstOk = lv;
      if (standStillLoses(lv) || ((bare || !hasMax || bareLeft <= 0) && key <= POP_MAX && !fast && qaBoost(lv))) {
        // SIM 11: 벽 검사 — 사람 흉내 봇이 경기장까지 가야 한다. 못 가면 다른 배치로(벽은 MAX 칸과 상관없어 bare로 다시 보지 않는다)
        const wall = wallCheck(lv);
        if (!wall || wall.ok) { lv.qa = true; done = true; break; }
        lv.qa = true;
        lv.wall = wall;
        walls.push(lv);
        break;
      }
      lv.qa = false;
    }
    if (done) break;
  }
  // 모든 배치가 벽이면(보정·서 있기 검사는 넘긴 것 중) 경기장 도달률이 가장 나은 배치
  if (!done && walls.length) lv = walls.reduce((best, x) => (x.wall.score > best.wall.score ? x : best));
  else if (!done && firstOk) lv = firstOk;
  if (lv.failed) {
    // 끝까지 실패하면 추정치로 보스를 약하게 둔다
    lv.arrive = Math.max(START_N, lv.golden[lv.golden.length - 1] || START_N);
    lv.arriveStrong = lv.arriveWeak = lv.arrive;
    lv.bossHp = Math.round(dps(lv.arrive, 0, lv.fireE || 0) * lv.params.bossKill * 0.6);
    lv.par = Math.max(1, Math.round(lv.arrive * 0.5));
    lv.calTier = 0;
    lv.Hstar = 0;
    lv.helpStart = Math.max(5, nice(0.2 * lv.arrive));
  } else lv.helpStart = help.get(lv)();
  return lv;
}

const maxTicksOf = (lv) => Math.ceil((lv.arenaZ / lv.speed + 60) / DT);
/* 배치 검사(P03의 뒷받침): 판 내내 한 자리(QA_XS)에 서 있는 분대가 — 기대 강화로도, 그 진행에서 살 수 있는 최대 강화로도 — 이기면 안 된다.
   L1은 튜토리얼(둘째 줄부터 오른쪽이 정답)이라 뺀다 */
export const QA_XS = [-4.4, -2.5, 0, 2.5, 4.4];
export function capLoadout(L, c = 1) {
  const u = upgCap(L, c);
  return { start: START_N + 2 * u, fire: u, hero: c > 1 || L >= UNLOCK.hero ? { id: 'mungchi', lv: heroCapAt(L, c) } : null };
}
/* 서 있기만 해도 이기는 배치('ref' 보스): 보스 체력을 ×QA_MULS 차례로 올려 다시 보정해 본다. 산만한 사람(sl3)이 qaKeep 아래로
   떨어지거나 기준 봇이 못 이기면 그만둔다(원래 값으로 되돌림) */
const QA_MULS = [1.1, 1.2, 1.32, 1.45, 1.6];
/* 보스를 올릴 때 산만한 사람 무리의 '이길 수 있는 체력'에 두는 여유 — 보정 표본에 맞춰 너무 올리지 않게(새 표본에서는 승률이 내려간다) */
const QA_MARGIN = 1.1;
const QA_POP_K = 24;   // 배치 검사에서 보스를 올릴 때 보는 산만한 사람 판 수
function qaBoost(lv) {
  const spec = lv.params.boss;
  if (spec.mode !== 'ref' || !spec.qaKeep) return false;
  const keep = {};
  for (const f of CAL_FIELDS) keep[f] = lv[f];
  const sl3 = popCaps(lv, expectLoadout(lv.L, lv.cycle || 1), maxTicksOf(lv), ['sl3'], QA_POP_K).sl3;
  for (const mul of QA_MULS) {
    const cal = calibrate(lv, { hpMul: mul });
    if (!cal.ok || sl3.filter((c) => c >= cal.lv.bossHp * QA_MARGIN).length < spec.qaKeep * sl3.length) break;
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
  const fast = lv.L > POP_MAX || !!lv.fast;
  const cy = lv.cycle || 1;
  for (const co of fast ? [expectLoadout(lv.L, cy)] : [expectLoadout(lv.L, cy), capLoadout(lv.L, cy)]) {
    for (const x of fast ? [-2.5, 0, 2.5] : QA_XS) {
      const s = runTo(newGame(lv, co), (t) => { const inp = steer(t, x); inp.skill = heroWants(t); return inp; }, maxTicks);
      if (s.phase === 'won') return false;
    }
  }
  return true;
}
/* 배치의 벽 검사(SIM 11): 사람 흉내 봇이 달리기에서 죽지 않고 경기장까지 가는 비율(보스 체력과 상관없다 — 달리기만 돈다).
   무리·지킨 줄·몰이가 가까이 몰린 배치는 집중한 사람(on)의 도달률이 20~70%까지 떨어졌다(L43·44·47·58·49·27 — 같은 판을 기준 봇은 늘 넘고, 보스 체력으로는 못 고친다).
   임계값은 SIM 10 표 L5~60(레벨마다 64판)의 도달률 분포에서 벽과 보통 사이의 빈 틈(일반: 73% ↔ 88%, 쉼: 67% ↔ 84%)에 둔다 —
   on 집중한 사람, sl3 산만한 사람(산만한 사람은 원래 더 못 가므로 낮게). 어려움·매우 어려움은 경기장 전 실패가 목표라(L15+ 30% 이상) 보지 않는다.
   1회차 L5~POP_MAX의 일반·쉼 레벨만: 회차(2·3회차 표)는 1회차 배치를 그대로 쓰고, 그 자리에서 보정하는 레벨은 휴대폰에서 느려지지 않게 건너뛴다 */
export const WALL = { normal: { on: 0.82, sl3: 0.45 }, rest: { on: 0.9, sl3: 0.78 } };
export const WALL_FROM = 5;
export const WALL_K = 48;
/* 사람 흉내 무리(on·sl3)가 경기장에 닿는 비율 { on, sl3 } — 시드는 보정(popCaps)과 따로 쓴다 */
export function reachRates(lv, co, K = WALL_K, maxTicks = maxTicksOf(lv)) {
  const out = {};
  for (const t of POP) {
    if (t.id !== 'on' && t.id !== 'sl3') continue;
    let n = 0;
    for (let j = 0; j < K; j++) {
      const pol = humanBot(hash(VERSION, 'wall', lv.L, lv.attempt, t.id, j), t.err, t.skill, t);
      if (runTo(newGame(lv, co), pol, maxTicks, true).phase === 'arena') n++;
    }
    out[t.id] = n / K;
  }
  return out;
}
/* 벽 검사 대상이 아니면 null, 아니면 { ok, score, on, sl3 } — score = 임계값 대비 가장 모자란 비율(1 이상이면 통과) */
export function wallCheck(lv) {
  if (lv.L < WALL_FROM || lv.L > POP_MAX || lv.fast || (lv.cycle || 1) > 1) return null;
  const th = WALL[lv.params.tag || 'normal'];
  if (!th) return null;
  const r = reachRates(lv, expectLoadout(lv.L, 1));
  const score = Math.min(r.on / th.on, r.sl3 / th.sl3);
  return { ok: score >= 1, score, on: r.on, sl3: r.sl3 };
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
export const HELP_GAIN = { '': 0.85, rest: 0.4, hard: 1.9, super: 3.0 };   // 2단계: 판 중 실패가 늘어 1단계(0.6·0.25·1.5·0.7)보다 크게. 3단계: 매우 어려움 1.0 → 3.0(지원 받은 산만한 사람 72~75% → 85~95%)
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
export function humanBot(seed, err = 0.1, skill = false, opt = {}) {
  const st = { a: seed >>> 0, hist: [], wrongUntil: -1, wrongX: 0 };
  const lag = opt.lag || 18;
  // opt.pump: 덧셈 칸을 쏘면 오르는 것을 아는 사람(L1 안내 '쏘면 숫자가 올라가요'를 따르는 사람) — 상자는 여전히 모른다
  const bo = opt.full ? undefined : { pump: !!opt.pump, crates: false };
  const f = (s) => {
    st.hist.push(botTarget(s, bo));
    if (st.hist.length > 40) st.hist.splice(0, st.hist.length - 20);
    let tx = st.hist.length > lag ? st.hist[st.hist.length - 1 - lag] : 0;
    if (s.tick % 60 === 0 && nextRnd(st) < err) { st.wrongUntil = s.tick + 30 + Math.floor(nextRnd(st) * 40); st.wrongX = (nextRnd(st) * 2 - 1) * 4; }
    if (s.tick < st.wrongUntil) tx = st.wrongX;
    const inp = steer(s, tx);
    if (skill) inp.skill = heroWants(s);
    return inp;
  };
  f.st = st;
  f.clone = () => { const g = humanBot(seed, err, skill, opt); Object.assign(g.st, structuredClone(st)); return g; };
  return f;
}
/* 무리: on 집중한 사람(스킬 씀), off 집중했지만 스킬을 안 누르는 사람, sl3 산만한 사람, pump 집중했고 덧셈 칸을 쏘아 올리는 사람
   (3단계 — 게임이 L1부터 가르치는 것을 쓰는 사람도 구간에 들게). 종류마다 POP_K판.
   (숙련자 expert를 넣어 보았지만 체력이 H*를 넘을 수 없어 — 기준 봇은 늘 이긴다 — 숙련자 승률은 거의 그대로였다) */
export const POP = [
  { id: 'on', err: 0.1, skill: true, w: 1.5 },
  { id: 'off', err: 0.1, skill: false, w: 0.6 },
  { id: 'sl3', err: 0.3, skill: true, w: 0.5 },
  { id: 'pump', err: 0.1, skill: true, pump: true, w: 1 },
];
/* 무리가 원하는 체력이 H*의 POP_OVER배를 넘으면(기준 봇이 사람 흉내보다 크게 못한 배치) 다른 배치로 다시 만든다 */
export const POP_OVER = 1.08;
/* 3단계: 24 → 48(표본이 작으면 보정 표본에 맞춘 체력이 새 표본에서 10~20%p 쉽게 나왔다) */
export const POP_K = 48;
export const POP_MAX = 120;   // 여기까지는 무리로 맞춘다(caltable.js). 그 뒤는 H* × popRatio
/* 무리 한 판씩: 경기장까지 돈 뒤, 이 사람이 이길 수 있는 가장 큰 보스 체력(이분 탐색 7번, 기하 평균) */
export function popCaps(lv, co, maxTicks = maxTicksOf(lv), ids = null, K = POP_K) {
  const out = {};
  for (const t of POP) {
    if (ids && !ids.includes(t.id)) continue;
    out[t.id] = [];
    for (let j = 0; j < K; j++) {
      const pol = humanBot(hash(VERSION, 'cal', lv.L, lv.attempt, t.id, j), t.err, t.skill, t);
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
  if (T) for (const k in T) if (+k > 60 && +k <= POP_MAX && levelTag(+k).tag === tag && T[k].Hstar > 0) r.push(T[k].bossHp / T[k].Hstar);
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
  const co = expectLoadout(lv.L, lv.cycle || 1);
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
    const pop = lv.L <= POP_MAX && !lv.fast ? popHp(lv, co, spec.band, maxTicks) : { h: Hstar * popRatio(lv.tag), score: 0 };
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
    const noHelp = (x) => {
      x.squad.n = Math.min(x.squad.n, ref); x.squad.peak = x.squad.n; x.squad.tier = 0; x.squad.sp = []; x.squad.pool = 0; x.rockets = [];
    };
    let wonBare = false;
    for (let i = 0; i < 16 && !wonBare; i++) {
      if (fightFrom(s, polStrong(false), hp, maxTicks, noHelp).phase === 'won') wonBare = true;
      else hp = Math.max(30, Math.round(hp * 0.95));
    }
    if (!wonBare) return { ok: false };
    const t = fightFrom(s, polStrong(false), hp, maxTicks);
    if (t.phase !== 'won') return { ok: false };
    par = t.squad.n;
  }
  // 3패 지원 병력(helpStart)은 경기장 앞까지만 돌아 보스 체력과 상관없다 — 고른 배치에서만 재게 함수로 넘긴다(calibrateLevel)
  return { ok: true, lv: { bossHp: hp, arrive: ref, arriveStrong: arrive, arriveWeak: w.squad.n, par, calTier: s.squad.tier, Hstar }, help: () => helpFor(lv, co, w, maxTicks) };
}

/* 별 기준 병력: 기준 봇이 '그 플레이어의 강화와 출격 영웅'을 달고 돌았을 때 남기는 병력.
   영웅은 상시 효과만 — 스킬은 쓰지 않는다(스킬을 안 누르는 사람이 영웅 때문에 별을 덜 받지 않게).
   스킬 없이 지는 판(어려운 레벨에서 강화가 모자랄 때)은 스킬을 쓴 결과, 그래도 지면 그 레벨의 기준(lv.par).
   강화·영웅은 이기기 쉽게 해 주지만 별은 실력으로. */
const parCache = new Map();
const sameHero = (a, b) => (!a && !b) || (a && b && a.id === b.id && (a.lv | 0) === (b.lv | 0));
export function parFor(lv, start = START_N, fire = 0, hero = null, pet = null, ammo = '') {
  const E = expectLoadout(lv.L, lv.cycle || 1);
  if (pet && !PETS[pet.id]) pet = null;
  if (!AMMO[ammo]) ammo = '';
  if (start === E.start && fire === E.fire && sameHero(hero, E.hero) && !pet && !ammo) return lv.par;
  const key = `${lv.cycle || 1}:${lv.L}:${lv.attempt}:${start}:${fire}:${hero ? hero.id + hero.lv : '-'}:${pet ? pet.id + pet.lv : '-'}:${ammo}`;
  if (parCache.has(key)) return parCache.get(key);
  const maxTicks = maxTicksOf(lv);
  let par = lv.par;
  // 펫은 기대값으로(petAvg) — 펫 때문에 별이 쉬워지지 않게, 그렇다고 par가 한 판의 운에 흔들리지도 않게
  const a = runTo(newGame(lv, { start, fire, hero, pet, petAvg: true, ammo }), polStrong(false), maxTicks);
  if (a.phase === 'won') par = a.squad.n;
  else if (hero) {
    const b = runTo(newGame(lv, { start, fire, hero, pet, petAvg: true, ammo }), polStrong(true), maxTicks);
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
  '': { two: 0.55, three: 0.9 },
  rest: { two: 0.55, three: 0.9 },
  hard: { two: 0.55, three: 0.9 },
  super: { two: 0.55, three: 0.9 },
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
   own = 그 플레이어가 실제로 들고 가는 { start(시작 병력), fire(화력 단계) }를 주면, 기대 강화(EXPECT)보다 모자란 만큼을 병사로 채워 준다(3단계):
   모자란 시작 병력 + 화력 차이를 병력으로 바꾼 몫(화력 ∝ 병력^0.8 × (1 + 5%·화력)). 기대 강화 이상이면 helpStart 그대로.
   지원 판은 별 1개까지(main.js) */
export function supportFor(lv, own) {
  const base = lv && lv.helpStart > 0 ? lv.helpStart : Math.max(5, nice(0.2 * ((lv && lv.arrive) || 30)));
  if (!lv || !own) return base;
  const E = expectLoadout(lv.L, lv.cycle || 1);
  const have = Number.isFinite(own.start) ? own.start : START_N;
  const fire = Number.isFinite(own.fire) ? own.fire : 0;
  const k = Math.max(1, Math.pow((1 + 0.05 * E.fire) / (1 + 0.05 * fire), 1.25));
  const want = (E.start + base) * k - have;
  return Math.max(base, nice(want));
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
  const z0 = s.endless ? s.endless.z0 : 0;   // 무한모드: 이번 구간의 출발 자리부터
  return clamp((s.squad.z - z0) / (s.arenaZ - z0), 0, 1);
}

/* 충돌 크기 보기(?hitbox=1 또는 __squad.hitbox = true, SIM 8): 시뮬레이션이 실제로 재는 모양을 그대로 돌려준다 — 렌더러는 이것만 그린다.
   땅 위 사각형 { k, x0, x1, z0, z1 }(ell이면 그 안에 든 타원). 분대 몸(squad)과 겹치면 맞는다: 적·톱날(타원)은 옆·앞뒤 모두, 벽·장갑문·상자·철창·드럼통은 분대 앞(z1)이 그 줄(z)에
   닿는 틱에 옆으로 걸쳤는지, 독침은 떨어지는 순간 옆으로 걸쳤는지. 보스: 총알 판(보스 − 1m)의 몸통 띠(bossHit — 이 띠를 지나는 총알만
   피해), 맞붙는 선(bossReach — 분대 앞에 닿으면 길 전체를 짓밟는다). 내려찍기 띠는 늘 맞는 범위(slamZone)로 그린다.
   드럼통의 폭발 반경(blast — 원): 터지면 가운데가 이 안인 좀비가 맞고, 이 원에 닿는 상자·철창은 부서진다(분대는 안 다친다).
   불 지대(fire — 네모, 화염병): 가운데가 이 안인 좀비가 타고, 보스는 몸통 폭(±BOSS_HIT)이 걸치고 발이 이 길이 안이면 탄다(분대·게이트·소품은 안 탄다) */
export function hitShapes(s) {
  const q = s.squad;
  const R = radius(q.n);
  const H = hitHalf(R);
  const out = [];
  if (q.n > 0) out.push({ k: 'squad', x0: q.x - H, x1: q.x + H, z0: q.z - SQUAD_DEPTH * R, z1: q.z + SQUAD_DEPTH * R });
  if (s.divs) for (const d of s.divs) out.push({ k: 'div', x0: 0, x1: 0, z0: d.z0 + FORK_TAPER, z1: d.z1 });
  for (const f of s.foes) if (f.alive) out.push({ k: 'foe', x0: f.x - FOE_HX * f.r, x1: f.x + FOE_HX * f.r, z0: f.z - f.r, z1: f.z + f.r, ell: true });
  for (const w of s.saws) out.push({ k: 'saw', x0: w.x - w.w / 2, x1: w.x + w.w / 2, z0: w.z - SAW_HD, z1: w.z + SAW_HD, ell: true });
  for (const p of s.props) {
    if (!p.alive || p.passed) continue;
    out.push({ k: p.kind, x0: p.x0, x1: p.x1, z0: p.z, z1: p.z });   // 벽·장갑문(door)·상자·철창·드럼통(drum): 분대 앞이 그 줄에 닿는 틱에 옆으로 걸치면
    if (p.kind === 'drum') { const x = (p.x0 + p.x1) / 2, r = OBSTACLES.drum.r; out.push({ k: 'blast', x0: x - r, x1: x + r, z0: p.z - r, z1: p.z + r, ell: true }); }   // 폭발 반경(가운데가 이 원 안인 좀비·닿는 상자)
  }
  for (const sp of s.spits) out.push({ k: 'spit', x0: sp.x - (sp.r || SPIT_R), x1: sp.x + (sp.r || SPIT_R), z0: sp.z, z1: sp.z });
  if (s.pools) for (const p of s.pools) if (p.t <= 0 && !p.hit) out.push({ k: 'pool', x0: p.x - POOL_R, x1: p.x + POOL_R, z0: p.z - POOL_R, z1: p.z + POOL_R, ell: true });
  // 불 지대(화염병 — 4단계): 가운데가 이 네모 안인 좀비가 탄다(보스는 몸통 폭이 걸치면). 분대는 안 다친다
  if (s.flames) for (const zn of s.flames) out.push({ k: 'fire', x0: zn.x - zn.w / 2, x1: zn.x + zn.w / 2, z0: zn.z - zn.len / 2, z1: zn.z + zn.len / 2 });
  const b = s.boss;
  if (b && b.hp > 0) {
    out.push({ k: 'bossHit', x0: b.x - BOSS_HIT, x1: b.x + BOSS_HIT, z0: b.z - 1, z1: b.z - 1 });
    out.push({ k: 'bossReach', x0: -ROAD, x1: ROAD, z0: b.z - b.r * 0.6, z1: b.z - b.r * 0.6 });
  }
  return out;
}

/* 상태 해시 — 결정성 테스트용 */
export function stateHash(s) {
  const q = s.squad;
  let h = hash(s.tick, q.n, q.x.toFixed(6), q.z.toFixed(6), s.phase);
  for (const f of s.foes) if (f.alive) h = hash(h, f.id, f.hp.toFixed(4), f.x.toFixed(4), f.z.toFixed(4));
  for (const r of s.rows) for (const c of r.cells) h = hash(h, c.v, c.acc.toFixed(4));
  if (s.boss) h = hash(h, s.boss.hp.toFixed(4), s.boss.z.toFixed(4));
  for (const m of q.sp) h = hash(h, m.k, m.cd.toFixed(4), m.lv || 1);
  h = hash(h, q.pool.toFixed(4), q.recent.toFixed(4), q.healAcc.toFixed(4), q.lossFrac.toFixed(4));
  if (q.fogAcc) h = hash(h, 'fog', q.fogAcc.toFixed(4));
  if (q.heat) h = hash(h, 'heat', q.heat.toFixed(3));
  if (s.endless && s.endless.mut && s.endless.mut.length) h = hash(h, 'mut', s.endless.mut.join(','));
  if (s.endless && s.endless.medicAt !== undefined) h = hash(h, 'medicAt', s.endless.medicAt);
  if (s.boss) h = hash(h, s.boss.bonus.toFixed(4));
  for (const rk of s.rockets) h = hash(h, rk.x.toFixed(4), rk.z.toFixed(4), rk.t.toFixed(4));
  if (s.hero) h = hash(h, s.hero.charge.toFixed(4), s.hero.act.toFixed(4), s.hero.cd.toFixed(4), s.hero.shot.toFixed(4));
  // 3단계: 2단계 상태도(상자·열쇠·벽, 몰이 알림, 톱날, 무기 단계·속도, 독침, 총알, 줄 고른 칸, 난수, 코인)
  h = hash(h, s.rs >>> 0, q.tier, q.vx.toFixed(4), s.stats.coins, s.stats.lost, s.nextId);
  for (const p of s.props) h = hash(h, p.id, p.alive ? 1 : 0, p.passed ? 1 : 0, p.hp.toFixed(3));
  for (const m of s.marks) h = hash(h, m.z, m.done ? 1 : 0);
  for (const w of s.saws) h = hash(h, w.id, w.x.toFixed(4), w.dir);
  for (const r of s.rows) h = hash(h, r.id, r.done ? 1 : 0, r.chosen);
  for (const sp of s.spits) h = hash(h, sp.id, sp.x.toFixed(4), sp.t.toFixed(4));
  h = hash(h, s.bullets.length);
  for (const b of s.bullets) h = hash(h, b.x.toFixed(3), b.z.toFixed(3));
  if (s.boss) h = hash(h, s.boss.x.toFixed(4), s.boss.slam ? s.boss.slam.t.toFixed(4) : -1, s.boss.slamCd.toFixed(4), s.boss.summonCd.toFixed(4));
  // 펫(안 데려간 판에는 없다 — 해시 그대로)
  if (s.pet) h = hash(h, s.pet.id, s.pet.lv, s.pet.rs >>> 0, s.pet.procs, s.pet.acc.toFixed(4), s.pet.double ? 1 : 0);
  if (s.endless && s.endless.bld) for (const p of [s.pet, ...(s.pets || [])]) if (p && p.cdT) h = hash(h, 'cheerCd', p.cdT.toFixed(4));   // 불도롱뇽이 쉬는 동안(무한모드)
  if (s.pets) for (const p of s.pets) h = hash(h, p.id, p.lv, p.rs >>> 0, p.procs, p.acc.toFixed(4), p.double ? 1 : 0);
  // 탄종(보통탄 판에는 없다 — 해시 그대로)
  if (s.ammo) { h = hash(h, s.ammo); for (const f of s.foes) if (f.alive && f.slowT > s.t) h = hash(h, f.id, f.slowT.toFixed(4)); }
  // 무한모드(캠페인 판에는 없다 — 해시 그대로)
  if (s.divs) for (const d of s.divs) h = hash(h, d.id, d.z0.toFixed(3), d.z1.toFixed(3), d.risk);
  if (s.lanes) for (const l of s.lanes) h = hash(h, 'lane', l.id, l.k, l.z0.toFixed(3), l.z1.toFixed(3), l.open.map((o) => o.map((v) => +(+v).toFixed(3)).join(':')).join(','));
  if (s.pools) for (const p of s.pools) h = hash(h, p.id, p.x.toFixed(4), p.z.toFixed(4), p.t.toFixed(4), p.life.toFixed(4), p.hit);
  // 불 지대(화염병 줄을 연 판에 화염병이 놓은 동안만 필드가 있다 — 없는 판은 해시 그대로)
  if (s.flames) for (const zn of s.flames) h = hash(h, 'fire', zn.id, zn.x.toFixed(4), zn.z.toFixed(4), zn.w.toFixed(4), zn.len.toFixed(4), zn.t.toFixed(4), zn.d.toFixed(4));
  if (s.endless) { const e = s.endless; h = hash(h, e.seed, e.seg, e.bosses, e.bank, e.wait.toFixed(4), e.z0.toFixed(4), s.L, s.arenaZ.toFixed(4), (s.refMul || 1).toFixed(6)); }
  // 보스 뒤 3택 1(연 판에만 필드가 있다 — 안 연 판은 해시 그대로)
  if (s.endless && s.endless.unl != null) { const e = s.endless; h = hash(h, e.unl, e.ammo.join(','), e.picks.join(','), e.offer ? e.offer.map((c) => c.k + (c.u || c.a || c.r || '') + (c.syn ? '*' : '')).join(',') : '-'); }
  // 빌드 개편(연 판에만)
  if (s.endless && s.endless.bld) {
    const B = s.endless.bld, of = s.endless.offer;
    if (B.enh) h = hash(h, 'enh', Object.keys(ENH).map((k) => (B.enh[k] ? B.enh[k].r + ':' + B.enh[k].l : '-')).join(','));
    if (B.gt) h = hash(h, 'gun', B.gt, GUN_IDS.map((g) => (B.gl && B.gl[g]) | 0).join(','), B.gp || '-');
    h = hash(h, 'bld', B.gun, B.chg, B.dur, B.shield, B.armor, B.shieldLeft, B.rr, B.rrn, B.pi, B.more, B.curse, B.rel, '', B.down.map((d) => d.k + d.lv).join(','),
      of ? of.map((c) => (c.b || c.h || c.g || '') + (c.n || 0)).join(',') : '-');
  }
  // 2단계(탄 효과 — 연 판에만): 효과 레벨(AMMO_IDS 순서), 탄종 상자 내용물, 출격 탄종이 없을 때의 빙결
  const fx = fxOf(s);
  if (fx) {
    h = hash(h, AMMO_IDS.map((a) => fx[a] | 0).join(''));
    const nw = AMMO_IDS2.filter((a) => !AMMO_IDS.includes(a)).map((a) => fx[a] | 0).join('');   // 24절 새 탄(가진 판만 — 예전 지문 그대로)
    if (/[1-9]/.test(nw)) h = hash(h, nw);
    for (const p of s.props) if (p.reward && p.reward.type === 'fx') h = hash(h, p.id, p.reward.a);
    if (!s.ammo && fx.frost) for (const f of s.foes) if (f.alive && f.slowT > s.t) h = hash(h, f.id, f.slowT.toFixed(4));
    // 장애물(4구간부터): 장갑문·드럼통(소품 종류), 방패 정예, 알린 장애물 종류
    for (const p of s.props) if (p.kind === 'door' || p.kind === 'drum') h = hash(h, p.id, p.kind);
    for (const f of s.foes) if (f.alive && f.elite === 'shield') h = hash(h, f.id, 'shield');
    if (s.endless.obsSeen) h = hash(h, 'obs', s.endless.obsSeen.join(','));
  }
  if (s.endless && s.endless.flame) h = hash(h, 'flame');
  if (s.endless && s.endless.relicsOpen) h = hash(h, 'relics', s.endless.relicsOpen.join(','));
  // 3단계 유물(연 판에만): 얻은 것·쓴 것, 최고 병력(화면의 위기 신호 문턱), 방패막이 막은 구간, 유물이 바꾼 상자 병력·덧셈 칸 빠르기
  if (s.endless && s.endless.relics) {
    const e = s.endless;
    h = hash(h, e.relics.join(','), e.spent.join(','), q.peak);
    if (e.wardAt !== undefined) h = hash(h, 'ward', e.wardAt, e.wardId);
    if (e.relics.length) {
      for (const p of s.props) if (p.reward && (p.reward.type === 'men' || p.reward.mul)) h = hash(h, p.id, p.reward.v | 0, p.reward.mul || 0);
      for (const r of s.rows) for (const c of r.cells) if (c.op === 'add') h = hash(h, c.step.toFixed(6));
    }
  }
  return h;
}
