import { HEROES, heroVal, unitVal, synergyOf, SP_LV_MAX, heroEff, heroCapC, HERO_LV_HARD, PETS, petP, PET_MAX_LV , AMMO } from './roster.js';
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
export const START_N = 12;
export const VOLLEY_HZ = 10;
export const BULLET_SPEED = 48;
export const BULLET_RANGE = 30;
export const WEAPON = [1, 1.35, 1.7, 2.1];
export const WAKE = 45;           // 이 거리 안에 들어온 적이 다가오기 시작
export const BOSS_GAP = 28;       // 보스가 나타나는 거리
export const VERSION = 'squad-v1';   // 레벨 배치의 소금 — 바꾸지 않는다(바꾸면 모든 레벨이 달라진다)
export const SIM = 9;                // 규칙이 바뀌면 올린다(이어하기 스냅숏·보정 표는 같은 SIM에서만 쓴다)
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
};

/* 특수병과 수치(이름·소개·레벨별 수치는 roster.js — 여기 SP의 share·every·dmg·r은 Lv1 값) */
export const SP_MAX = 3;      // 분대에 최대 3명
export const SP_ESCORT = 4;   // 병사가 특수병 수 × 4보다 적으면 가장 늦게 온 특수병이 떠난다
export { SP_LV_MAX };         // 같은 병과를 또 구하면 Lv2·Lv3(SIM 9) — 그 뒤로는 병사로
export const SP = {
  medic: { share: unitVal('medic', 'share', 1) },
  sniper: { every: unitVal('sniper', 'every', 1), dmg: unitVal('sniper', 'dmg', 1), near: 2, far: 36 },
  rocket: { every: unitVal('rocket', 'every', 1), dmg: 0.6, r: unitVal('rocket', 'r', 1), speed: 30, near: 8, far: 30 },
};
/* 회복 풀로 가는 몫의 상한(의무병 + 보리). SIM 9: 0.8 → 0.9 — 의무병 Lv2·Lv3과 보리 짝 효과가 쌓일 자리(Lv1 의무병 + 보리 Lv5 = 0.78은 그대로) */
export const SHARE_MAX = 0.9;
export const SP_KINDS = Object.keys(SP);
export const BONUS_CAP = 0.1;
export const NABI_CAP = 0.02;   // 나비 레벨 1당 보스전 추가 피해 한도
export const SP_LV_CAP = 0.02;  // 저격수·로켓병의 레벨 1당(Lv1 위로) 보스전 추가 피해 한도(SIM 9 — 레벨 오른 특수병이 보스전에서도 세게)
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
  return plan;
}

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
  for (let i = 0; i < k; i++) placed.push(addFoe(lv, g, 'grunt', U(g, x0, x1), z + U(g, 0, 9), hp));
  return placed;
}

/* 무리가 기준 화력에 얼마나 새어 들어오나(손실 병력 추정). 기준 봇과 같은 모형(foeLeftover): 몇 자리 중 가장 덜 잃는 자리에 선
   분대가, 닿을 적(옆으로 따라붙는 만큼 포함)의 체력 중 쏴서 못 잡는 몫을 맞는다. 골든 패스는 '무난한 사람'이라 LEAK_K배 */
export const LEAK_K = 1.35;
const LEAK_XS = [-3.8, -2.5, -1.25, 0, 1.25, 2.5, 3.8];
function waveLeak(foes, ng, p, fire = 0, xs = LEAK_XS) {
  if (!foes.length) return 0;
  const D = dps(ng, 0, fire);
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

const CHUNK = {
  rest(lv, g, p, z, ng) {
    return { len: 30, ng };
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
    const n = p.L >= 14 && chance(g, 0.5) ? 2 : 1;
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
function placeSpecials(lv, p, bare = false, seed = null) {
  const kinds = SP_KINDS.filter((k) => p.L >= UNLOCK[k]);
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
   - 한 구간의 순성장: 보스 직전 줄의 ×2 하나 + 작은 덧셈(GK = ENDLESS.gk). 병력 상한은 캠페인과 같은 MAX_N(9999).
   - 상태는 평범한 JSON(s.endless) — 다음 구간은 상태와 시드만으로 정해진다. 캠페인 판에는 s.endless가 없다(stateHash 그대로) */
export const ENDLESS = {
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
/* 구간 k(1부터)의 지역·등급·가상 레벨 */
export function segInfo(k) {
  const n = Math.max(1, Math.floor(k));
  const bi = (n - 1) % 6;
  const tag = n % 6 === 0 ? 'super' : n % 6 === 3 ? 'hard' : '';
  return { k: n, loop: Math.floor((n - 1) / 6), biome: bi, tag, L: 60 + 10 * bi + (tag === 'super' ? 10 : tag === 'hard' ? 5 : 2) };
}
/* 구간 k의 달리는 속도 배수: 구간마다 speedStep씩 빨라지고 speedMax에서 멈춘다(ARSENAL.md 9절) */
export const segSpeed = (k) => Math.min(ENDLESS.speedMax, 1 + ENDLESS.speedStep * (Math.max(1, k) - 1));
export const segMul = (k) => ENDLESS.mul0 * Math.pow(ENDLESS.mulStep, Math.max(1, k) - 1);
/* 바닥선: 1구간에는 없다(누구나 제 병력 기준으로 출발한다), 2구간부터 floor0 × floorGrow^(k−1) */
export const segFloor = (k) => (k <= 1 ? 0 : Math.min(MAX_N, Math.round(ENDLESS.floor0 * Math.pow(ENDLESS.floorGrow, k - 1))));
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
/* 구간 하나(레벨 한 판과 같은 모양의 객체 — z는 0부터). n = 그 순간 병력, tier = 무기 단계. 같은 (seed, k, n, tier, attempt) → 같은 구간 */
export function buildSegment(seed, k, n, tier = 0, attempt = 0) {
  const p = segParams(k);
  const E = ENDLESS;
  const g = { rs: hash(VERSION, 'endless', seed >>> 0, p.seg, attempt) };
  const n0 = clamp(Math.floor(n), 1, MAX_N);
  // 뒤처진 분대(바닥선 아래)에게는 위협이 바닥선 병력 기준(화력 ∝ 병력^0.8)
  const behind = Math.pow(Math.max(1, segFloor(p.seg) / n0), 0.8);
  const base = WEAPON[clamp(tier | 0, 0, 3)] * segMul(p.seg) * behind;
  const lv = {
    L: p.L, attempt, seed: hash(VERSION, 'endless-run', seed >>> 0), speed: p.speed, params: p, tag: p.tag,
    rows: [], foes: [], props: [], saws: [], plan: [], golden: [], chunks: [], nextId: 1,
    arenaZ: 0, bossHp: 0, par: 0, arrive: 0, helpStart: 0,
    startE: n0, fireE: E.fire, heroE: null, marks: [], bare: true, refMul: base,
  };
  GK = E.gk;
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
      lv.wm = p.tagFull ? p.waveMul : 1;
      lv.gh = p.tagFull ? p.gruntHp : p.gruntBase;
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
    placeSpecials(lv, p, false, hash(VERSION, 'endless-sp', seed >>> 0, p.seg, attempt));
  } finally { GK = 1; }
  // MAX 칸(높인 끝)은 쓰지 않는다 — 몰아 쏘기 확인(redFast)을 판 중간에 돌릴 수 없다
  for (const r of lv.rows) for (const c of r.cells) if (c.cap0 != null) { c.cap = c.cap0; delete c.cap0; }
  // 코인 상자는 구간 번호만큼(가상 레벨 61~120의 값을 그대로 주지 않는다)
  for (const pr of lv.props) if (pr.reward && pr.reward.type === 'coin') pr.reward.v = Math.min(60, 10 + 5 * p.seg);
  lv.foes.sort((a, b) => a.z - b.z || a.id - b.id);
  delete lv.force;
  delete lv.thr;
  delete lv.wm;
  delete lv.gh;
  const Gn = lv.golden[lv.golden.length - 1] || n0;
  lv.arrive = Gn;
  lv.bossHp = Math.max(30, Math.round(dps(Gn * p.boss.m, 0, E.fire) * (base / segMul(p.seg)) * E.bossMul0 * Math.pow(E.bossStep, p.seg - 1) * p.bossKill * bossHitFrac(Gn)));
  return lv;
}
/* 무한모드 새 판. opt = { seed, start, fire, hero } */
export function newEndless(opt = {}) {
  const seed = (opt.seed >>> 0) || 1;
  const seg = buildSegment(seed, 1, opt.start ?? START_N, 0);
  const s = newGame(seg, opt);
  s.endless = { seed, seg: 1, bosses: 0, bank: 0, wait: 0, z0: 0 };
  s.refMul = seg.refMul;
  return s;
}
/* 보스가 쓰러진 뒤: 지나간 것을 버리고 다음 구간을 지금 자리 앞에 이어 붙인다(상태가 커지지 않는다) */
function nextSegment(s) {
  const q = s.squad;
  const e = s.endless;
  e.seg++;
  const seg = buildSegment(e.seed, e.seg, q.n, q.tier);
  const dz = q.z + ENDLESS.lead;
  const off = s.nextId;
  for (const r of seg.rows) { r.id += off; r.z += dz; }
  for (const f of seg.foes) { f.id += off; f.z += dz; }
  for (const pr of seg.props) { pr.id += off; pr.z += dz; }
  for (const w of seg.saws) { w.id += off; w.z += dz; }
  for (const m of seg.marks) m.z += dz;
  s.nextId = off + seg.nextId + 1;
  s.rows = seg.rows; s.foes = seg.foes; s.props = seg.props; s.saws = seg.saws; s.marks = seg.marks;
  s.spits = []; s.rockets = [];
  s.L = seg.L; s.params = seg.params; s.speed = seg.speed;
  s.arenaZ = seg.arenaZ + dz; s.stopZ = s.arenaZ + 6;
  s.bossHp = seg.bossHp; s.bossRef = seg.arrive; s.refFire = ENDLESS.fire; s.refMul = seg.refMul;
  s.boss = null;
  s.phase = 'run';
  e.z0 = q.z;
  e.wait = 0;
  const h = s.hero;
  if (h && h.id === 'mungchi') {
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
    stats: { kills: 0, killHp: 0, lost: 0, gained: 0, coins: 0, crates: 0, gates: 0, bossT: 0, spawned: start, healed: 0, spGot: 0, spLost: 0, heroUses: 0, healedAtArena: 0, spUp: 0, flips: 0 },
  };
  // 펫(ENDGAME.md 6절): 데려간 판에만 s.pet이 있다 — 펫 전용 난수 흐름(rs)을 따로 써서 판의 난수(s.rs)를 건드리지 않는다.
  // avg(별 기준을 재는 기준 봇용): 확률 대신 기대값으로 고르게 — par가 한 판의 운에 흔들리지 않게
  // 탄종(ARSENAL.md 3절): 고른 판에만 s.ammo가 있다(보통탄이면 없다 — 해시 그대로)
  if (opt.ammo && AMMO[opt.ammo]) s.ammo = opt.ammo;
  if (opt.pet && PETS[opt.pet.id]) {
    s.pet = { id: opt.pet.id, lv: Math.max(1, Math.min(PET_MAX_LV, opt.pet.lv | 0 || 1)), rs: hash(lv.seed, 'pet', opt.pet.id) >>> 0, procs: 0, acc: 0 };
    if (opt.petAvg) s.pet.avg = true;
  }
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
  for (const m of q.sp) m.lv = Math.max(1, Math.min(SP_LV_MAX, Number.isFinite(m.lv) ? Math.floor(m.lv) : 1));
  num0(q, ['pool', 'healAcc', 'recent', 'lossFrac']);
  if (o.stats && typeof o.stats === 'object') num0(o.stats, ['spUp', 'flips']);
  if (o.hero === undefined) o.hero = null;
  if (o.hero) num0(o.hero, ['charge', 'act', 'T', 'cd', 'shot']);
  if (o.boss) num0(o.boss, ['bonus']);
  if (typeof o.refFire !== 'number') o.refFire = 0;
  if (o.pet) {
    if (typeof o.pet !== 'object' || !PETS[o.pet.id]) o.pet = undefined;
    else { num0(o.pet, ['rs', 'procs', 'acc']); o.pet.lv = Math.max(1, Math.min(PET_MAX_LV, o.pet.lv | 0 || 1)); }
  }
  if (o.pet == null) delete o.pet;
  if (o.ammo != null && !AMMO[o.ammo]) delete o.ammo;   // 모르는 탄종이 든 스냅숏은 보통탄으로 이어진다
  if (o.endless) {
    if (typeof o.endless !== 'object') return null;
    num0(o.endless, ['seed', 'seg', 'bosses', 'bank', 'wait', 'z0']);
    if (o.endless.seg < 1) return null;
  }
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
    const a = k * heroVal('bori', 'guard', h.lv) + q.lossFrac;
    k = Math.floor(a);
    q.lossFrac = a - k;
    if (k <= 0) return;
  }
  // 펫 '막아 주기': 게이트가 아닌 손실의 병사마다 확률로 안 잃는다(많이 잃을 때는 기대값으로 — 병사마다 굴리지 않는다)
  if (cause !== 'gate' && petFx(s) === 'block') {
    const p = petP(s.pet.id, s.pet.lv);
    let saved = 0;
    if (s.pet.avg || k > 40) { const a = k * p + s.pet.acc; saved = Math.floor(a); s.pet.acc = a - saved; }
    else for (let i = 0; i < k; i++) if (rand(s.pet) < p) saved++;
    if (saved > 0) {
      s.pet.procs += saved;
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
  emit(s, { t: 'loss', n: real, cause, x: x ?? q.x, z: z ?? q.z });
  if (q.n <= 0) { s.cause = cause; return; }
  if (cause !== 'gate') {
    q.recent += real;
    // 짓밟기(보스가 닿은 뒤)로 잃은 병사는 회복 풀로 가지 않는다 — 닿기 전에 잡는 것이 보스전의 목표
    // 의무병은 레벨만큼(Lv1 60%·Lv2 70%·Lv3 80%), 보리의 응급처치는 의무병 레벨만큼 더(짝 효과 — 의무병이 없거나 Lv1이면 그대로)
    const med = spLv(q, 'medic');
    const share = sub === 'stomp' ? 0 : Math.min(SHARE_MAX, (med ? unitVal('medic', 'share', med) : 0) + (h && h.id === 'bori' ? heroVal('bori', 'share', h.lv) * (med ? synergyOf(med) : 1) : 0));
    q.pool += real * share;
  }
  if (soft && q.sp.length && (sub === 'slam' || real >= Math.max(3, Math.ceil(0.15 * before)))) spDrop(s, 'hit');
  escort(s);
}

/* 이 판의 펫 효과 이름(없으면 '') */
const petFx = (s) => (s.pet ? PETS[s.pet.id].fx : '');
/* 판이 끝나는 순간(승리·전멸): '줍줍'이 터졌는지 한 번 굴려 둔다(화면이 받는 코인을 두 배로 — petCoinMul) */
function petEnd(s) {
  if (petFx(s) !== 'coin' || s.pet.avg || s.pet.done) return;
  s.pet.done = 1;
  if (rand(s.pet) < petP(s.pet.id, s.pet.lv)) { s.pet.double = 1; s.pet.procs++; emit(s, { t: 'pet', fx: 'coin', x: s.squad.x, z: s.squad.z }); }
}
export const petCoinMul = (s) => (s && s.pet && s.pet.double ? 2 : 1);
const hasSp = (q, k) => q.sp.some((m) => m.k === k);
/* 그 병과 특수병의 레벨(없으면 0) */
function spLv(q, k) { for (const m of q.sp) if (m.k === k) return m.lv || 1; return 0; }

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

/* 특수병 합류. 같은 병과가 이미 있으면 그 특수병의 레벨이 오른다(SIM 9, Lv3까지 — 새 자리·호위 병사는 필요 없다).
   Lv3인 같은 병과·자리 초과·호위 병사 부족이면 병사로 바꿔 준다(spFull.why: 'max' | 'full' | 'escort') */
function addSpecial(s, k, via, x, z) {
  const q = s.squad;
  const h = s.hero;
  const m = q.sp.find((o) => o.k === k);
  if (m && (m.lv || 1) < SP_LV_MAX) {
    m.lv = (m.lv || 1) + 1;
    s.stats.spUp++;
    emit(s, { t: 'spUp', k, lv: m.lv, id: m.id, via, x: x ?? q.x, z: z ?? q.z });
    if (h && HEROES[h.id].match === k) chargeHero(s, 0.25);
    return;
  }
  if (m || q.sp.length >= SP_MAX || q.n < SP_ESCORT * (q.sp.length + 1)) {
    const n = Math.max(5, nice(0.12 * q.n));
    gain(s, n, x, z, 'spFull');
    emit(s, { t: 'spFull', k, n, why: m ? 'max' : q.sp.length >= SP_MAX ? 'full' : 'escort', x: x ?? q.x, z: z ?? q.z });
    return;
  }
  q.sp.push({ id: s.nextId++, k, cd: 0.6, lv: 1 });
  s.stats.spGot++;
  emit(s, { t: 'spGet', k, via, x: x ?? q.x, z: z ?? q.z });
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
  marksUpdate(s);
  propsUpdate(s, R);
  sawsUpdate(s, R);
  foesUpdate(s, R);
  spitsUpdate(s, R);
  if (wiped(s)) return s;
  if (s.hero) heroUpdate(s, input);
  if (s.boss) {
    // 특수병·영웅이 보스에게 더 줄 수 있는 몫: 병사 화력의 +BONUS_CAP까지(나비는 레벨마다 +NABI_CAP, 저격수·로켓병은 Lv1 위 레벨마다 +SP_LV_CAP)
    let up = 0;
    for (const m of q.sp) if (m.k !== 'medic') up += (m.lv || 1) - 1;
    const cap = BONUS_CAP + (s.hero && s.hero.id === 'nabi' ? NABI_CAP * (Math.min(5, s.hero.lv) - 1) : 0) + SP_LV_CAP * up;
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
  petEnd(s);
  emit(s, { t: 'lose', cause: s.cause });
  return true;
}

function enterArena(s) {
  s.phase = 'arena';
  const p = s.params;
  const hp = s.bossHp > 0 ? s.bossHp : Math.round(dps(s.bossRef, 0, s.refFire || 0) * p.bossKill);
  s.boss = {
    z: s.stopZ + BOSS_GAP, x: 0, hp, max: hp, r: 2.5, walk: p.bossWalk || 1.3, hitT: -9,
    slam: null, slamCd: BOSS_FIRST_SLAM, summonCd: SUMMON_FIRST, enraged: false, clashCd: 0, clash: false, t: 0, bonus: 0,
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

/* 미리 알림(판 중 표시): 몰이 청크 45m 앞에서 'surge' 이벤트 한 번 — 화면이 '몰려와요!'를 띄울 수 있게 */
export const MARK_AHEAD = 45;
function marksUpdate(s) {
  const q = s.squad;
  for (const m of s.marks) {
    if (m.done || q.z < m.z - MARK_AHEAD) continue;
    m.done = true;
    emit(s, { t: m.t, z: m.z, x: 0 });
  }
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
    if (p.kind === 'crate' || p.kind === 'cage') {
      // 부딪힌 병사만 잃는다: 걸친 폭의 병사(n × ov)보다 많이는 아니다(SIM 8)
      const k = Math.min(Math.ceil(((p.hp * crateHitOf(s.params)) / SOLDIER_HP) * Math.min(1, ov * 2)), Math.ceil(q.n * ov));
      if (p.kind === 'crate') emit(s, { t: 'crateMiss', x, z: p.z, n: k, key: !!p.key });
      else emit(s, { t: 'cageMiss', k: p.reward.k, x, z: p.z, n: k });
      if (k > 0) lose(s, k, 'crate', x, p.z);
      continue;
    }
    const k = Math.min(Math.ceil((p.hp / SOLDIER_HP) * Math.min(1, ov * 2)), Math.ceil(q.n * ov));
    emit(s, { t: 'wallCrash', x, z: p.z, n: k });
    lose(s, Math.max(1, k), 'wall');
  }
}

function sawsUpdate(s, R) {
  const q = s.squad;
  for (const w of s.saws) {
    w.x += w.dir * w.spd * DT;
    if (w.x > w.xb) { w.x = w.xb; w.dir = -1; }
    if (w.x < w.xa) { w.x = w.xa; w.dir = 1; }
    if (touches(w.x - q.x, w.z - q.z, hitHalf(R), SQUAD_DEPTH * R, w.w / 2, SAW_HD)) {
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
      f.z -= (f.slowT > s.t ? f.spd * (1 - AMMO.frost.slow) : f.spd) * DT;   // 빙결탄에 맞은 동안 느리다(slowT가 없으면 그대로)
      if (dz < f.homeDist) {
        const d = q.x - f.x;
        const m = f.home * DT;
        f.x += d > m ? m : d < -m ? -m : d;
      }
    }
    if (touches(f.x - q.x, f.z - q.z, hitHalf(R), SQUAD_DEPTH * R, f.r * FOE_HX, f.r)) {
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
  const here = foeLeftover(s.foes, q.x, R, span, D, vz, q.z);
  const slack = Math.max(2, 0.05 * q.n) * SOLDIER_HP;
  // 반응하는 동안(REACT_FAR초)은 지금 속도 그대로 밀려 간다(길 끝에서 멈춘다)
  let xr = q.x + q.vx * REACT_FAR;
  let vr = q.vx;
  if (xr < -EDGE) { xr = -EDGE; vr = 0; } else if (xr > EDGE) { xr = EDGE; vr = 0; }
  for (const dir of [-1, 1]) {
    const xt = q.x + dir * d;
    if (xt < -EDGE || xt > EDGE) continue;
    const tGo = REACT_FAR + (dir * (xr - xt) >= 0 ? 0 : moveTimeFrom(xt - xr, vr));
    if (tGo > SPIT_T) continue;
    let blocked = false;
    for (const p of s.props) {
      if (!p.alive || p.passed || p.z < q.z || p.z - q.z > SPIT_LANE_Z) continue;
      const cost = p.kind === 'wall' ? p.hp : p.hp * crateHitOf(s.params);
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
      if (sp.t > 0 && Math.abs(sp.x - xt) < R + SPIT_R + 0.1) { blocked = true; break; }
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
      leftSum += Math.max(0, f.hp - D * 0.85 * Math.max(0, tc - tGo));
      if (leftSum > 0.6 * slack) { blocked = true; break; }
    }
    if (blocked) continue;
    if (foeLeftover(s.foes, xt, R, span, D, vz, q.z) - here > slack) continue;
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
    const ov = overlap(q.x - H, q.x + H, sp.x - SPIT_R, sp.x + SPIT_R) / (2 * H);
    const hit = ov > 0 && Math.abs(sp.z - q.z) < R + 1.5;
    emit(s, { t: 'spitHit', x: sp.x, z: sp.z, hit });
    if (hit) lose(s, Math.max(1, Math.ceil(0.3 * ov * q.n)), 'spit', sp.x, sp.z);
  }
  if (s.spits.length) s.spits = s.spits.filter((sp) => sp.t > 0);
}

/* 펫 효과의 크기(고정 — 레벨은 확률만 올린다). *_AVG: 기대값 모드(별 기준)에서 확률 1당 피해로 치는 몫(ENDGAME.md 6절의 어림) */
export const PET_CRIT = 2;
export const PET_FAR = 1.5;
export const PET_WIDE = 1.5;
export const PET_CHEER = 0.3;
export const PET_FAR_AVG = 0.5;
export const PET_WIDE_AVG = 0.2;
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
    let dmg = (dps(q.n, q.tier, s.fireLv) * hm) / (VOLLEY_HZ * b);
    const A = s.ammo ? AMMO[s.ammo] : null;
    if (A && A.dmg) dmg *= A.dmg;
    const rng = A && A.range ? A.range : 0;   // 탄종의 사거리(없으면 기본)
    const span = R + 0.3;
    // 펫의 확률 효과(크리티컬은 총알마다, 멀리·넓게 쏘기는 일제 사격마다 굴린다 — 펫 전용 난수). avg면 기대값만큼 피해를 고르게 올린다
    const pet = s.pet;
    const fx = pet ? PETS[pet.id].fx : '';
    const pp = pet ? petP(pet.id, pet.lv) : 0;
    let far = false;
    let wide = false;
    let crits = 0;
    if (pet && pet.avg) dmg *= fx === 'crit' ? 1 + pp : fx === 'far' ? (s.phase === 'run' ? 1 + PET_FAR_AVG * pp : 1) : fx === 'wide' ? 1 + PET_WIDE_AVG * pp : 1;
    else if (fx === 'far') far = rand(pet) < pp;
    else if (fx === 'wide') wide = rand(pet) < pp;
    for (let i = 0; i < b; i++) {
      // 고르게 퍼뜨리되 매번 조금씩 어긋나게(황금비 수열 — 난수를 쓰지 않는다)
      const j = ((q.volley * 0.618034 + i * 0.381966) % 1) - 0.5;
      const x = q.x - span + ((i + 0.5 + j * 0.8) / b) * 2 * span;
      const bl = { x, z: q.z + 0.4 * R, d: 0, dmg, hm };
      if (far || rng) bl.r = (rng || BULLET_RANGE) * (far ? PET_FAR : 1);
      if (fx === 'crit' && !pet.avg && rand(pet) < pp) { bl.dmg = dmg * PET_CRIT; bl.c = 1; crits++; }
      s.bullets.push(bl);
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
    if (far || wide || crits) { pet.procs += crits || 1; emit(s, { t: 'pet', fx, n: crits, x: q.x, z: q.z }); }
    emit(s, { t: 'shot', b });
  }
}

function bulletsUpdate(s) {
  const q = s.squad;
  const adv = BULLET_SPEED * DT;
  const list = s.bullets;
  // 총알이 이번 틱에 닿을 수 있는 적만 미리 고른다(순서 그대로 — 결과는 같고 빠르다)
  const zMax = q.z + BULLET_RANGE * (petFx(s) === 'far' ? PET_FAR : 1) + 4;
  const near = [];
  if (list.length) for (const f of s.foes) if (f.alive && f.z - f.r < zMax) near.push(f);
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
    for (const f of near) {
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
      const was = c.v;
      let ticks = 0;
      while (c.acc >= c.step && c.v < c.cap) { c.acc -= c.step; c.v++; ticks++; }
      if (c.v >= c.cap) c.acc = 0;
      if (ticks) {
        emit(s, { t: 'tick', row: hitObj.id, v: c.v, x: b.x, z: hitObj.z });
        // 역전(SIM 9): 빨간 칸이 0을 넘어 파랑이 됐다(화면 '역전!' — 상태는 바꾸지 않는다)
        if (was <= 0 && c.v > 0 && c.v0 < 0) { s.stats.flips++; emit(s, { t: 'flip', row: hitObj.id, v: c.v, cap: c.cap, x: (c.x0 + c.x1) / 2, x0: c.x0, x1: c.x1, z: hitObj.z }); }
        if (c.v >= c.cap && c.v0 < 0 && c.cap > 0) emit(s, { t: 'capped', row: hitObj.id, v: c.v, x: (c.x0 + c.x1) / 2, z: hitObj.z });
      }
      continue;
    }
    if (hitKind === 2) { hitProp(s, hitObj, b.dmg); continue; }
    if (hitKind === 3) { hitFoe(s, hitObj, b.dmg, 'gun'); if (s.ammo) ammoHit(s, b, hitObj, near); continue; }
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
    if (b.d < (b.r || BULLET_RANGE)) list[w++] = b;
  }
  list.length = w;
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
    if (g) { emit(s, { t: 'pierce', x: b.x, z0: f.z, z1: g.z }); hitFoe(s, g, b.dmg * A.pierce, 'gun'); }
  } else if (A.splash) {
    const r2 = A.r * A.r;
    let n = 0;
    for (const o of near) {
      if (!o.alive || o === f) continue;
      const dx = o.x - f.x, dz = o.z - f.z;
      if (dx * dx + dz * dz > r2) continue;
      hitFoe(s, o, b.dmg * A.splash, 'gun');
      n++;
    }
    if (n) emit(s, { t: 'splash', x: f.x, z: f.z, r: A.r, n });
  } else if (A.slow && f.alive) f.slowT = s.t + A.T;
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
  // 펫 '기운 내': 처치마다 확률로 영웅 게이지 +PET_CHEER
  if (s.hero && petFx(s) === 'cheer') {
    const p = petP(s.pet.id, s.pet.lv);
    if (s.pet.avg) chargeHero(s, PET_CHEER * p);
    else if (rand(s.pet) < p) { s.pet.procs++; chargeHero(s, PET_CHEER); emit(s, { t: 'pet', fx: 'cheer', x: f.x, z: f.z }); }
  }
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

/* 보스가 부르는 졸개 한 마리 체력 = 기준 병력 화력 × SUMMON_HP(2단계: 0.08 → 0.1, 걸음·따라붙기는 판 중 졸개와 같다) */
export const SUMMON_HP = 0.1;
export const SUMMON_FIRST = 2.5;
export const SUMMON_FLANK_Z = 14;    // 가장자리 질주 좀비가 생기는 거리(분대 앞)
export const SUMMON_FLANK_HP = 1.2;  // 가장자리 질주 좀비 체력 = 졸개 × 이 배수   // 첫 소환까지 초(2단계: 4.5 → 2.5 — 보스전에서도 병력이 줄 수 있게)
/* 내려찍기가 분대를 맞히나: 중심이 빨간 구역을 SLAM_EDGE·R만큼 넓힌 안에 있으면(분대 몸의 바깥쪽 일부가 구역에 걸친 것) */
export function slamHits(x, R, slam) { const z = slamZone(slam, R); return x >= z.x0 && x <= z.x1; }
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
      const coins = segCoins(e.seg);
      e.bank += coins;
      s.stats.bossT += b.t;
      for (const f of s.foes) f.alive = false;
      s.spits = [];
      emit(s, { t: 'bossDead', x: b.x, z: b.z });
      emit(s, { t: 'segClear', seg: e.seg, coins, tag: p.tag });
    } else {
      e.wait -= DT;
      if (e.wait <= 0) nextSegment(s);
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
      const hit = slamHits(q.x, R, b.slam);
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
      // 공정성(P14): 피하는 데 드는 이동이 길면 예고를 늘린다(옆 칸 회피는 WARN_MIN, 한 칸 넘게면 이동 시간 + REACT_FAR).
      // 반대쪽으로 움직이던 분대는 멈추고 돌아서는 시간도 더한다(3단계)
      const need = slamFairWarn(q.x, q.vx, R, ln[idx].x0, ln[idx].x1, (2 * ROAD) / parts);
      const warn = Math.max(p.slamWarn, need);
      b.slam = { x0: ln[idx].x0, x1: ln[idx].x1, t: warn, T: warn };
      emit(s, { t: 'slamWarn', x0: ln[idx].x0, x1: ln[idx].x1, warn });
    }
  }
  // 졸개 소환
  if (s.L >= UNLOCK.summon) {
    b.summonCd -= DT;
    if (b.summonCd <= 0 && b.z - q.z > 9) {
      b.summonCd = 5.5;
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
  h.T = H.skill.dur;
  h.act = h.T;
  h.shot = 0;
  s.stats.heroUses++;
  emit(s, { t: 'heroCast', id: h.id, x: q.x, z: q.z });
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

/* 로켓 표적: 8–30m 안 반경 r(로켓병 레벨) 안의 체력 합이 가장 큰 무리(0.3D 이상) → 분대 통로의 벽 → 보스 */
function rocketTarget(s, D, r = SP.rocket.r) {
  const q = s.squad;
  const R = radius(q.n);
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
  for (const m of q.sp) {
    m.cd -= DT;
    if (m.cd > 0) continue;
    const lv = m.lv || 1;
    if (m.k === 'sniper') {
      // 저격수: 레벨마다 더 자주·더 세게. 나비가 있으면 위력 +boost — 저격수 레벨만큼 더(짝 효과)
      const nabiBoost = h && h.id === 'nabi' ? 1 + heroVal('nabi', 'boost', h.lv) * synergyOf(lv) : 1;
      m.cd = snipe(s, unitVal('sniper', 'dmg', lv) * D * nabiBoost, 'sniper') ? unitVal('sniper', 'every', lv) : 0.25;
    } else if (m.k === 'rocket') {
      // 로켓병: 레벨마다 더 자주·더 넓게
      const r = unitVal('rocket', 'r', lv);
      const t = rocketTarget(s, D, r);
      if (!t) { m.cd = 0.25; continue; }
      const T = Math.max(0.25, (t.z - q.z) / SP.rocket.speed);
      const rk = { id: s.nextId++, x0: q.x, z0: q.z + 0.5, x: t.x, z: t.z, t: T, T, r, dmg: SP.rocket.dmg * D, fid: t.fid };
      s.rockets.push(rk);
      emit(s, { t: 'rocket', id: rk.id, x0: rk.x0, z0: rk.z0, x: rk.x, z: rk.z });
      m.cd = unitVal('rocket', 'every', lv);
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
  // 톱날 한 번 스치는 손실(띠를 지나는 시간 동안 초당 4 + 0.35n의 대부분)
  const sawCost = (4 + 0.35 * q.n) * ((2 * (0.55 * R + 0.35)) / vz) * 0.8 + 1;
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
      const after = applyOp(q.n, c.op, v);
      val += after <= 0 ? -q.n * 2 : after - q.n;
      if (c.op === 'unit' && opt.specials !== false) val += spWorth(s, c.k);
    }
    // 벽·상자·철창: 그 자리에서 쏴서 못 부수면 남은 만큼 잃는다(상자·철창은 crateHit만큼 — P10, 모든 봇이 장애물로 본다).
    // 부술 수 있으면 보상: 보통 상자는 상자를 챙기는 봇만, 앞에 게이트 줄이 보이지 않을 때. 열쇠 상자(p.key)는 누구나(opt.keys=false가 아니면)
    for (const p of s.props) {
      if (!p.alive || p.passed || p.z < q.z || p.z > horizon + 0.5 || p.z - q.z > 34) continue;
      const t = (p.z - q.z) / vz;
      const shot = D * cover(x, p.x0, p.x1) * Math.max(0, t - travel) * 0.85;
      const ov = overlap(x - R, x + R, p.x0, p.x1) / (2 * R);
      const left = p.hp - shot;
      if (p.kind === 'wall') {
        if (ov > 0 && left > 0) val -= contactCost(left) * Math.min(1, ov * 2) + 1;
        continue;
      }
      if (left > 0) {
        if (ov > 0) val -= contactCost(left * hitK) * Math.min(1, ov * 2) + 0.5;
        continue;
      }
      if (row && !p.key) continue;
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
  return foeLeftover(s.foes, x, R, span, D, vz, s.squad.z);
}
/* qz = 분대 z(판 중), null이면 레벨 생성용 — 적마다 34m 앞에서 처음 본다고 친다 */
function foeLeftover(foes, x, R, span, D, vz, qz) {
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
    H += f.hp;
    hts += f.hp * Math.max(0, tc - Math.max(enter, tr));
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
  const v = r.type === 'gun' ? (q.tier < 3 ? q.n * 0.25 + 3 : 2) : r.type === 'men' ? r.v : 2;
  return v + (p.key ? KEY_WORTH * q.n : 0);
}
/* 특수병 한 명이 병사 몇 명 몫인가(봇 판단용). 이미 있는 병과의 레벨 올리기는 합류의 SP_UP_WORTH배(SIM 9) —
   단 SIM 8에서 같은 병과가 바뀌던 병사 몫보다 낮게 보지는 않는다(봇의 길이 SIM 8보다 나빠지지 않게) */
const SP_WORTH = { medic: 0.1, sniper: 0.09, rocket: 0.12 };
export const SP_UP_WORTH = 0.6;
export function spWorth(s, k) {
  const q = s.squad;
  const lv = spLv(q, k);
  const men = Math.max(5, nice(0.12 * q.n));
  if (lv && lv < SP_LV_MAX) return Math.max(men, 3 + q.n * SP_WORTH[k] * SP_UP_WORTH);
  if (lv || q.sp.length >= SP_MAX || q.n < SP_ESCORT * (q.sp.length + 1)) return men;
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
      if (standStillLoses(lv) || ((bare || !hasMax || bareLeft <= 0) && key <= POP_MAX && !fast && qaBoost(lv))) { lv.qa = true; done = true; break; }
      lv.qa = false;
    }
    if (done) break;
  }
  if (!done && firstOk) lv = firstOk;
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
   땅 위 사각형 { k, x0, x1, z0, z1 }(ell이면 그 안에 든 타원). 분대 몸(squad)과 겹치면 맞는다: 적·톱날(타원)은 옆·앞뒤 모두, 벽·상자·철창은 분대 앞(z1)이 그 줄(z)에
   닿는 틱에 옆으로 걸쳤는지, 독침은 떨어지는 순간 옆으로 걸쳤는지. 보스: 총알 판(보스 − 1m)의 몸통 띠(bossHit — 이 띠를 지나는 총알만
   피해), 맞붙는 선(bossReach — 분대 앞에 닿으면 길 전체를 짓밟는다). 내려찍기 띠는 늘 맞는 범위(slamZone)로 그린다 */
export function hitShapes(s) {
  const q = s.squad;
  const R = radius(q.n);
  const H = hitHalf(R);
  const out = [];
  if (q.n > 0) out.push({ k: 'squad', x0: q.x - H, x1: q.x + H, z0: q.z - SQUAD_DEPTH * R, z1: q.z + SQUAD_DEPTH * R });
  for (const f of s.foes) if (f.alive) out.push({ k: 'foe', x0: f.x - FOE_HX * f.r, x1: f.x + FOE_HX * f.r, z0: f.z - f.r, z1: f.z + f.r, ell: true });
  for (const w of s.saws) out.push({ k: 'saw', x0: w.x - w.w / 2, x1: w.x + w.w / 2, z0: w.z - SAW_HD, z1: w.z + SAW_HD, ell: true });
  for (const p of s.props) if (p.alive && !p.passed) out.push({ k: p.kind, x0: p.x0, x1: p.x1, z0: p.z, z1: p.z });
  for (const sp of s.spits) out.push({ k: 'spit', x0: sp.x - SPIT_R, x1: sp.x + SPIT_R, z0: sp.z, z1: sp.z });
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
  // 탄종(보통탄 판에는 없다 — 해시 그대로)
  if (s.ammo) { h = hash(h, s.ammo); for (const f of s.foes) if (f.alive && f.slowT > s.t) h = hash(h, f.id, f.slowT.toFixed(4)); }
  // 무한모드(캠페인 판에는 없다 — 해시 그대로)
  if (s.endless) { const e = s.endless; h = hash(h, e.seed, e.seg, e.bosses, e.bank, e.wait.toFixed(4), e.z0.toFixed(4), s.L, s.arenaZ.toFixed(4), (s.refMul || 1).toFixed(6)); }
  return h;
}
