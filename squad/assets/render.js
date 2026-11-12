/* 화면 그리기(도트) — 시뮬레이션 상태를 읽기만 한다(상태에 아무것도 쓰지 않는다).
   가로 약 190px의 낮은 해상도 버퍼에 그리고, 브라우저가 CSS image-rendering: pixelated 로 정수배 확대한다.
   이펙트(파편·떠오르는 숫자·흔들림)와 렌더러 전용 상태(축소 단계·번쩍임 제한)는 모두 여기서만 산다. */
import { makeView, fitView, project, P } from './view.js';
import { FORK_TAPER, ROAD, radius, cellGood, applyOp, pickCell, BULLET_SPEED, DT, slamZone, SPIT_R, POOL_R, SQUAD_DEPTH, hitShapes, levelTag } from './core.js';
import { HEROES, biomeOf, bossNameOf } from './roster.js';
import { gateAlts } from './insight.js';
import { BIOME, HERO_ART, UNIT_ART, CAPTIVE_ART, OUT, WORLD_H, SHEETS, ICONS, ICON_PAL_EXPORT, PAL, skinOf, FOE_BURST, BOSS_SKIN, BOSS_CROWN, BOSS_FX, BOSS_TIER, BIOME_ONLY, biomeSheets, PET_ART } from './pix/art.js';
import { createAtlas, pickStep, mkCanvas, rasterCanvas } from './pix/atlas.js';
import { createFont, opText, compactTexts } from './pix/font.js';
import { createGround } from './pix/ground.js';
import { frameRaster, outline } from './pix/raster.js';

/* 화면 배치: 분대는 화면 높이 70%, 영웅은 그 바로 뒤(78% 안 — 엄지가 쉬는 아래쪽 버튼·안내는 비운다).
   카메라는 분대 24m 뒤(망원) — 분대를 아래에 두고 앞을 멀리·크게 본다(390×844에서 40m 앞 게이트 폭 25px), 분대 자리의 도트 크기는 그대로.
   far = 그리는 끝(카메라 깊이 m): 분대 앞 160m쯤까지 — 도로가 화면 17~18% 높이(지평선 바로 아래)까지 이어지고, 그 끝의 배율(px/m)은 예전 카메라의 끝(115)과 비슷하다.
   낮은 품질은 farLow(분대 앞 130m쯤 — 그릴 물건이 조금 적게) */
const FIT = { at: 0.70, up: 20, back: 24, minHz: 0.075, far: 180, farLow: 150 };
const STEPS3 = [1, 0.75, 0.5];
const STEPS4 = [1, 0.75, 0.5, 0.33];
const WTIER = ['#FFE38A', '#FFB347', '#7FE8FF', '#FF7AD9'];   // 무기 단계 색
const GOLD_BULLET = '#FFD84A';
const AMMO_COL = { pierce: '#F4F7FF', burst: '#FFB347', rapid: '#FFF4B0', frost: '#8FD3FF' };   // 탄종 머리 색(roster.AMMO와 같은 id)
const SKILL_LINE = { mungchi: '#FFD84A', bori: '#FF8FB8', nabi: '#7FF0E2' };   // 스킬 중 화면 가장자리 속도선
const PANEL = {
  good: { hex: '#3E8BEA', line: '#BFE2FF', out: '#1D3F8A', arrow: '#DDF3FF' },
  bad: { hex: '#E8384F', line: '#FFC2B3', out: '#6E1A33', arrow: '#FFD0C4' },
  zero: { hex: '#9696AF', line: '#E0E0EA', out: '#3A3550', arrow: null },
  unit: { hex: '#FFC43C', line: '#FFF09A', out: '#6E4208', arrow: null, hi: '#FFE9A0' },
};
/* 화면에 쓰는 글자 색 조합 전부(쉬는 틈에 미리 굽는다 — 그리는 중에 아틀라스에 굽지 않게, T1) */
export const GLYPH_PAIRS = [
  ['#FFFFFF', OUT], ['#FFFFFF', PANEL.good.out], ['#FFFFFF', PANEL.bad.out], ['#FFFFFF', PANEL.zero.out], ['#FFFFFF', PANEL.unit.out],
  ['#FFF09A', PANEL.unit.out], ['#FFF09A', OUT], ['#DDF3FF', PANEL.good.out], ['#FFD0C4', PANEL.bad.out], ['#FFC2B3', PANEL.bad.out],
  ['#C9F5B8', '#1E5A2E'], ['#FFE38A', OUT], ['#FFE08A', OUT], ['#FFFFFF', '', ['tight']], [PANEL.unit.out, '', ['tight']],
];

/* 버퍼 크기 규칙(순수 함수): 폰 비율 기둥 폭 / K 가 190px(160~220)에 가장 가까운 정수 K.
   버퍼는 화면을 덮고, CSS 크기가 정수 px가 되도록 한두 칸 넓힌다(소수 DPR에서 1px 이음새가 생기지 않게, T2).
   VW·VH = 실제로 보이는 버퍼 크기(소수) — 도로는 여기 가운데에 둔다. */
export function pickBuffer(w, h, ratio) {
  const dpr = ratio || 1;
  const col = Math.min(w, h * 0.62);
  const devW = Math.round(w * dpr), devH = Math.round(h * dpr), devCol = col * dpr;
  let K = 1, be = Infinity;
  for (let k = 1; k <= 12; k++) {
    const bw = Math.ceil(devCol / k);
    const e = Math.abs(bw - 190) + (bw < 160 || bw > 220 ? 1000 : 0);
    if (e < be) { be = e; K = k; }
  }
  const per = K / dpr;
  const intCss = (n) => {
    for (let i = 0; i < 64; i++) { const c = (n + i) * per; if (Math.abs(c - Math.round(c)) < 1e-3) return n + i; }
    return n;
  };
  const BW = intCss(Math.max(1, Math.ceil(devW / K)));
  const BH = intCss(Math.max(1, Math.ceil(devH / K)));
  return { K, BW, BH, cssPer: per, cssW: Math.round(BW * per), cssH: Math.round(BH * per), VW: devW / K, VH: devH / K, col };
}

/* 카메라 맞춤(순수 함수). 보스전(dolly→1)에는 조금 뒤·위로 빠지되, 분대는 70% 안팎·영웅 발은 78% 이하에 남게(T4).
   달리기 카메라가 이미 24m 뒤라(망원) 보스전에 더 빠지는 거리는 3m — 많이 빠지면 무리가 더 납작해져 줄이 겹친다 */
export function lensOpt(w, h, dolly = 0) {
  const col = Math.min(w, h * 0.62);
  const up = clamp(((FIT.at - FIT.minHz) * h * 0.93) / (0.09 * col), 9.5, FIT.up);
  // 짧은 버퍼(360x640·가로 화면)일수록 덜 빠지고, 지평선 하한을 풀어 분대가 아래로 밀려나지 않게
  const short = clamp((400 - h) / 100, 0, 1);
  return {
    at: FIT.at - (0.05 + 0.04 * short) * dolly, up, back: FIT.back, minHz: FIT.minHz * (1 - 0.85 * dolly),
    extraBack: 3 - short, extraUp: 3 - short, far: FIT.far,
  };
}

/* 피격 번쩍임 제한: 같은 대상은 gap초에 한 번, dur초 동안(초당 1/gap회 이하 — 보스 0.5초, 좀비 0.34초) */
export function createFlashLimiter(gap = 0.34, dur = 0.034) {
  const m = new Map();
  return {
    on(key, hitT, simT, time, reduce) {
      const f = m.get(key);
      if (reduce) return false;
      if (simT - hitT > 0.05) return f !== undefined && time < f.until;
      if (f === undefined) { m.set(key, { last: time, until: time + dur }); return true; }
      if (time - f.last >= gap) { f.last = time; f.until = time + dur; }
      return time < f.until;
    },
    clear() { m.clear(); },
    get size() { return m.size; },
  };
}

/* 길가 소품 자리(순수 함수): 9u마다 양쪽에 하나. 해시는 부호 없는 32비트라 >>> 로 민다(V1: >> 는 음수가 나와 도로 위에 놓였다) */
export const SCENERY_STEP = 9;
export const sceneryHash = (z, side) => hashInt(z * 7 + (side > 0 ? 3 : 11));
export const sceneryX = (h, side) => side * (6.4 + ((h >>> 3) % 34) / 10);
export const sceneryZ = (h, z) => z + ((h >>> 8) % 50) / 10;

/* 렌더러가 쓰는 프레임 번호(시트 길이와 맞는지 tests/art.mjs가 검사한다) */
const SKINS = (kind) => ['snow', 'city', 'forest', 'lava', 'park'].map((b) => skinOf(kind, b)).filter((n) => n !== kind);
const ALT3 = ['', 'a', 'b'];   // 무리 변형(f.seed % 3, 그림만)
export const FRAMES = {
  tier: { sheets: ['soldier', 'sq10', 'sq100', 'sq1000'], walk: [0, 1, 2, 3], idle: [4, 5] },
  special: { sheets: 'unit', walk: [0, 1, 2, 3], idle: [4, 5], hit: [4] },
  rocket: { sheets: ['rocket'], fire: [6, 7] },
  hero: { sheets: 'hero', walk: [0, 1, 2, 3, 4, 5, 6, 7], idle: [8, 9], ko: [10], cast: [11, 12], look: [13], blink: [14] },
  captive: { sheets: 'captive', wave: [0, 1], sad: [2] },
  foe: { sheets: ['grunt', 'runner', ...SKINS('grunt'), ...SKINS('runner')], walk: [0, 1, 2, 3], idle: [0, 2], lunge: [4, 5] },
  brute: { sheets: ['brute', ...SKINS('brute')], walk: [0, 1, 2, 3], lunge: [1] },
  spit: { sheets: ['spit', ...SKINS('spit')], idle: [0, 1], tell: [2, 3, 4] },
  boss: { sheets: Object.values(BOSS_SKIN), walk: [0, 1, 2, 3], windup: [4], slam: [5], roar: [6, 7], stomp: [8, 9], dead: [10] },
  fx2: { sheets: ['flash', 'spark', 'glint', 'boomfx', 'flag', 'rocketShot', 'smoke'], f: [0, 1] },
  fx4: { sheets: ['saw', 'puff', 'coin'], f: [0, 1, 2, 3] },
  one: { sheets: ['bubble', 'tear', 'helmetBit', 'plus', 'heart', 'dust'], f: [0] },
  star: { sheets: ['star'], f: [1] },
};
const FR = FRAMES;
const FX_COL = {
  green: ['#8FD16A', '#5E9E4B', '#C9E36A'], purple: ['#B79BE0', '#8A6CC0', '#B9F25B'],
  wood: ['#F0C27E', '#C98A4E', '#8E5A30'], stone: ['#C9CED6', '#9AA2B0', '#FFC93C'], iron: ['#8A93A6', '#596277', '#C9CED6'],
  blood: ['#FF8FA8', '#E8607A'], gold: ['#FFF09A', '#FFD84A', '#D08A12'], dust: ['#E6D2B0', '#B89A70'], snowDust: ['#FFFFFF', '#DCE0EA'],
  confetti: ['#FFD84A', '#6CC0FF', '#FF8FB8', '#8FD16A', '#FFFFFF'], good: ['#6CC0FF', '#DDF3FF', '#3E8BEA'], bad: ['#FF8A7A', '#FFC2B3', '#E8384F'],
  unit: ['#FFD84A', '#FFF09A', '#D08A12'], boom: ['#FFF4B0', '#FFB347', '#FF7A45', '#9AA2B0'], heal: ['#7CE07A', '#C9F5B8'],
};
/* 정예 좀비(무한모드) 표식 색: 오염 = 보라(독침의 연두와 다르게), 분열 = 주황 */
const ELITE_COL = {
  toxic: { ring: '#B26BFF', glow: 'rgba(178,107,255,.35)', hi: '#F1DCFF', burst: ['#B26BFF', '#6B2FB8', '#F1DCFF'] },
  split: { ring: '#FF9A3D', glow: 'rgba(255,154,61,.32)', hi: '#FFE3B8', burst: ['#FF9A3D', '#FFD84A', '#E8607A'] },
};
const MAX_PARTS = 320;
const FLAG_X = [0, -0.55, 0.55];

function hashInt(n) {
  let h = (n | 0) * 2654435761;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* 분대 대형(SIM 8 충돌 크기 + 합친 병사): 그린 무리 = 시뮬레이션의 분대 몸 — 줄마다 왼쪽 끝 그림의 왼쪽 가장자리가 −R, 오른쪽 끝이 +R,
   맨 앞줄 발이 +(SQUAD_DEPTH·R − FORM_IN), 맨 뒷줄 발이 −(SQUAD_DEPTH·R − FORM_IN). 옆 끝 그림들은 위아래로 이어져(틈 없이) 몸 옆을 덮는다.
   병력이 많으면 10·100·1000명을 한 장으로 합쳐 그린다(TIER) — 205명 = 100 한 장 + 10 열 장 + 병사 다섯(셀 수 있게).
   큰 단계가 앞줄(먼 쪽, 화면 위)에, 작은 단계가 뒷줄(영웅 쪽)에 — 단체 사진처럼 큰 그림이 작은 그림 뒤에 가리지 않는다.
   모두 순수 함수(병력·화면 배율만으로 정해진다 — tests/art.mjs가 검사한다). 그리기 상태(합치기·나누기 움직임)는 렌더러 안에 있다. */
export const FORM_P = 8;            // 그림자(둥근 네모) 지수
export const FORM_IN = 0.08;
/* 합친 병사 단계 — 그림 크기(외곽선 포함 px)는 art.js 시트와의 약속(tests/art.mjs가 spriteBox로 검사한다). 닻은 아래 가운데 */
export const TIER = [
  { worth: 1, sheet: 'soldier', w: 14, h: 14, halfL: 7, halfR: 7, fps: 10, idleFps: 2 },
  { worth: 10, sheet: 'sq10', w: 18, h: 18, halfL: 9, halfR: 9, fps: 10, idleFps: 2 },
  { worth: 100, sheet: 'sq100', w: 22, h: 22, halfL: 11, halfR: 11, fps: 8, idleFps: 2 },
  { worth: 1000, sheet: 'sq1000', w: 30, h: 22, halfL: 15, halfR: 15, fps: 8, idleFps: 3 },
];
/* 채우기 기준(그림 폭 합 ÷ (줄 수 m0 × 몸 폭 W)): 모자라면(min 미만이거나 줄마다 두 장이 안 되면) 큰 단계부터 열 장으로 쪼개되 max를 넘지 않게.
   자릿수 그대로가 hard를 넘으면 낮은 단계부터 over까지 덜 그린다(어림 — 숫자 말풍선이 정확한 수). 이어 갈 때(nextComp)는 low~keep까지 봐준다(머뭇거림).
   rowH = 줄 간격 상한(px, 병사 키 14px보다 조금 작게 — 옆 끝 그림이 위아래로 틈 없이 이어진다). slack = 병사가 10 + slack명이 되어야 합친다(오가도 깜빡이지 않게) */
export const FORM_LIM = { min: 0.8, low: 0.7, max: 1.35, hard: 1.45, over: 1.2, keep: 1.65, rowH: 13.5, slack: 3 };
/* 60명 넘는 무리(몸 반지름 R3 이상)는 화면에서 납작해도 3줄 이상 — 2줄 자리(2W)에는 병사 아홉 + 10명 묶음 여섯(69명 = 15장)이 keep 안에 들지 않는다.
   100명 미만은 정확히 그려야 해서 69명은 그 15장뿐이라, 70명이 되면 열 명을 억지로 합치고 69명이면 다시 나눠 한 명 오갈 때마다 깜빡였다
   (망원 카메라·작은 화면 — 360×640에서 무리 깊이가 rowH 바로 아래). 예전 카메라에서는 60명부터 늘 3줄이었다 */
const R3 = radius(60) - 1e-9;
export const compSum = (c) => c[0] + 10 * c[1] + 100 * c[2] + 1000 * c[3];
export const compCount = (c) => c[0] + c[1] + c[2] + c[3];
export const compWidth = (c) => c[0] * TIER[0].w + c[1] * TIER[1].w + c[2] * TIER[2].w + c[3] * TIER[3].w;
/* 자릿수 그대로 나누기: 205 → [5, 0, 2, 0] (병사, 10, 100, 1000) */
export function greedyComp(n) {
  n = Math.max(0, Math.floor(n));
  return [n % 10, Math.floor(n / 10) % 10, Math.floor(n / 100) % 10, Math.floor(n / 1000)];
}
/* 대형 자리 크기(px): W = 옆 폭(2R), S = 맨 앞줄 발 ~ 맨 뒷줄 발의 화면 높이 = D·(vf + vb).
   ppm = 분대 자리의 m당 px(옆), vf·vb = 분대 가운데에서 앞(먼 쪽)·뒤(가까운 쪽)로 깊이 1m의 화면 높이(원근 — 뒤가 조금 크다),
   pb = 맨 뒷줄 깊이(−D)의 m당 px(없으면 ppm). m0 = 줄 간격이 rowH 이하가 되는 가장 적은 줄 수(2 이상, 60명부터 3 이상) — 채우기 기준의 줄 수 */
export function formGeom(R, ppm, vf, vb, pb) {
  const D = Math.max(0, SQUAD_DEPTH * R - FORM_IN);
  const f = vf > 0 ? vf : ppm * 0.6, b = vb > 0 ? vb : f;
  const S = D * (f + b);
  const m0 = Math.max(R >= R3 ? 3 : 2, 1 + Math.ceil(S / FORM_LIM.rowH - 1e-9));
  return { R, ppm, vf: f, vb: b, pb: pb > 0 ? pb : ppm, D, W: 2 * R * ppm, S, m0 };
}
/* 그림 수 하한: 줄마다 두 장 이상(한 장으로는 양옆 끝, 특히 앞 모서리에 닿지 못한다 — 큰 좀비는 모서리에서 문다). 셋뿐이면(3명) V자: 앞 가운데 하나, 뒤 둘
   (10명 넘는 V자는 몸이 넓어 앞 모서리가 빈다 — 12명 = 10 하나 + 병사 둘은 모서리에서 무는 좀비와 1px 떨어진다) */
export const needFor = (m) => 2 * m;
const capOf = (g) => g.m0 * g.W;
/* 성기면(lo 미만·줄마다 두 장이 안 되면) 쪼갠다: max를 넘지 않는 가장 큰 단계 하나를 열 장으로. 없는데 장 수가 모자라면 가장 작은 단계를 그래도 쪼갠다.
   strict(이어 가기)면 곧 다시 합쳐야 할 쪼개기(brittle)는 하지 않고 조금 성긴 채로 둔다 */
function fillUp(c, g, lo = FORM_LIM.min, strict = false) {
  const cap = capOf(g), L = FORM_LIM;
  for (let guard = 0; guard < 40; guard++) {
    const w = compWidth(c), N = compCount(c), need = needFor(g.m0);
    if (N >= need && w >= lo * cap) return c;
    // max 안에 드는 가장 큰 단계 — 다만 병사를 다 잃은 뒤 다음 나누기가 넘치는 것(1200 = 100×12: 한 명만 잃어도 100이 10으로, 10이 병사로)은 다음 단계를 먼저 본다
    // 아주 성기면(low 미만) hard까지 넘쳐도 쪼갠다(빈 줄보다 낫다). 병사가 10 + slack명 넘게 되는 쪼개기는(장 수가 모자랄 때 말고) 하지 않는다 — 곧 다시 합칠 것
    const hi = (w < L.low * cap ? L.hard : L.max) * cap;
    let t = 0, first = 0;
    // (이어 가기는 가장 작은 단계부터 — 덜 바뀌게)
    for (let i = 1; i < TIER.length && !t; i++) {
      const k = strict ? i : TIER.length - i;
      if (!c[k] || w + 10 * TIER[k - 1].w - TIER[k].w > hi || (!strict && k === 1 && c[0] + 10 >= 10 + L.slack && N >= need)) continue;
      if (!first) first = k;
      c[k]--; c[k - 1] += 10;
      if (!brittle(c, g)) t = k;
      c[k]++; c[k - 1] -= 10;
    }
    if (!t && !(strict && N >= need)) t = first;
    if (t < 1) {
      if (N >= need) return c;   // 더 쪼개면 너무 빽빽 — 조금 성긴 채로
      t = 1;
      while (t < TIER.length && !c[t]) t++;
      if (t >= TIER.length) return c;
    }
    c[t]--; c[t - 1] += 10;
    if (strict && N >= need) return c;
  }
  return c;
}
/* 병사를 다 잃고 한 명 더 잃으면(가장 작은 합친 병사를 줄줄이 나눠) keep을 넘는가 — 그때 나누기 하나가 합치기까지 부르지 않게 */
function brittle(c, g) {
  const d = c.slice();
  d[0] = -1;
  while (d[0] < 0) {
    let t = 1;
    while (t < TIER.length && !d[t]) t++;
    if (t >= TIER.length) return false;
    d[t]--; d[t - 1] += 10;
  }
  return compWidth(d) > FORM_LIM.keep * capOf(g);
}
/* 구성(순수 함수): 10명 미만은 병사 그대로. 자릿수 그대로(205 → 100 둘 + 병사 다섯)에서 채우기(FILL: 100 하나를 10 열로 → 100 + 10×10 + 5),
   자릿수 그대로가 hard를 넘으면 낮은 단계부터 덜 그린다(OVERFLOW, 0장은 없다). 결과 [병사, 10, 100, 1000] */
export function composeSquad(n, g) {
  n = Math.max(0, Math.floor(n));
  if (n < 10) return [n, 0, 0, 0];
  const c = greedyComp(n), cap = capOf(g), L = FORM_LIM;
  if (n >= 100 && compWidth(c) > L.hard * cap) {
    // 낮은 단계부터 한 장씩 빼 나가며 over 안에 든 것들 가운데 줄이 가장 깔끔한 것(그림 한 장당 비용 + 어림한 몫) — min 아래로 내려가면 그만
    let best = null, bs = Infinity;
    for (let t = 0; t < TIER.length;) {
      if (!c[t] || compCount(c) <= 1) { t++; continue; }
      c[t]--;
      const w = compWidth(c), N = compCount(c);
      if (w > L.over * cap || N < needFor(g.m0)) continue;
      const sc = formArrange(c, g).cost / N + 6 * (1 - compSum(c) / n);
      if (sc < bs) { bs = sc; best = c.slice(); }
      if (w < L.min * cap) break;
    }
    if (best) return best;
    return c;
  }
  return fillUp(c, g);
}
/* 이어 가기(머뭇거림 — 한 명씩 늘고 줄 때 합치기·나누기는 많아야 한 번, 늘 n이 움직인 쪽으로): 이전 구성에서 병사만 더하고 뺀다.
   잃을 때(n이 줄면)는 나누기만 — 병사가 모자라면 가장 작은 합친 병사 하나를 나누고(줄줄이 — 큰 그림 하나가 풀린다), 아주 성기면(low 미만) 하나 쪼갠다.
   얻을 때는 합치기만 — 10 + slack명이 되면(빽빽하면 11명, 넘치면 10명부터) 열 명을 하나로(합친 뒤가 min 이상이고 slack명 잃어도 되돌지 않을 때만, steady).
   더 못 합치는데 넘치면 새 병사를 그리지 않는다(어림 — 그린 합이 n을 거슬러 줄지 않게).
   어림 구성은: 얻을 때 처음부터 짠 것이 더 많고(정확하면 병사를 다 잃고 다음 나누기까지 버틸 때만 — brittle 아님: 잃는 흐름에 한 명 아물었다고
   정확하게 따라잡았다가 곧 다시 어림으로 떨어지지 않게) 또는 어림이 n의 0.9 아래면 바꾸고,
   잃을 때 어림 합이 n 이하면 그대로, 넘으면 그만큼 빼서 정확하게. 큰 변화(게이트 — 10명 넘게)는 처음부터. prevN = 이전 병력 */
export function nextComp(prev, prevN, n, g) {
  n = Math.max(0, Math.floor(n));
  if (n < 10) return [n, 0, 0, 0];
  if (!prev || prevN < 10 || Math.abs(n - prevN) > 9) return composeSquad(n, g);
  const L = FORM_LIM, cap = capOf(g), NT = TIER.length, need = needFor(g.m0), s = compSum(prev);
  const fits = (c) => compCount(c) >= need && compWidth(c) <= L.keep * cap;
  if (s !== prevN) {
    // 어림 구성
    if (n > prevN) {
      const f = composeSquad(n, g), fs = compSum(f);
      if (fs > s && (s < 0.9 * n || (fs === n && !brittle(f, g) && towards(prev, f, 1)))) return f;
      return fits(prev) ? prev.slice() : f;
    }
    if (n === prevN) {
      // 배율만 바뀜(보스전 카메라): 아직 쓸 만하면 그대로
      const f = composeSquad(n, g);
      return fits(prev) && compWidth(prev) >= L.low * cap && s >= 0.9 * compSum(f) ? prev.slice() : f;
    }
    if (s <= n) return fits(prev) ? prev.slice() : composeSquad(n, g);
    // 어림 합보다 적어졌다: 그만큼 빼서 정확하게(아래 잃을 때와 같이)
    prevN = s;
  }
  const c = prev.slice();
  if (n === prevN) {
    // 배율만 바뀜: 아직 쓸 만하면 그대로, 넘치면 합치고 성기면 쪼갠다
    if (fits(c) && compWidth(c) >= L.low * cap) return c;
    for (let t = 0; t < NT - 1 && compWidth(c) > L.keep * cap; t++) if (c[t] >= 10 && compCount(c) - 9 >= need) { c[t] -= 10; c[t + 1]++; }
    fillUp(c, g, L.low, true);
    return fits(c) ? c : composeSquad(n, g);
  }
  c[0] += n - prevN;
  if (n < prevN) {
    let ops = 0;
    while (c[0] < 0) {
      let t = 1;
      while (t < NT && !c[t]) t++;
      if (t >= NT) return composeSquad(n, g);
      c[t]--; c[t - 1] += 10;
      ops = 1;   // (줄줄이 나누기도 큰 그림 하나가 풀리는 한 번)
    }
    if (!ops) fillUp(c, g, L.low, true);
    if (compCount(c) < need) fillUp(c, g);
    if (fits(c)) return c;
    // 넘친다(병사 몇 명이 큰 그림 하나를 풀었다): 처음부터 짠 것이 합치기 없이 되면 그것, 아니면 낮은 단계부터 빼서(어림) — 그림이 빠지거나 나뉠 뿐
    const f = composeSquad(n, g);
    if (n < 100 || towards(prev, f, -1)) return f;
    for (let t = 0; t < NT && compWidth(c) > L.max * cap; t++) while (c[t] && compWidth(c) > L.max * cap && compCount(c) > need) c[t]--;
    return fits(c) && compSum(c) >= 0.9 * compSum(f) ? c : f;
  }
  // 얻을 때: 합치기 하나(가장 작은 단계부터 — 10 + slack명, 빽빽하면 11명), 그래도 넘치면 더(10명부터 — 큰 무리는 한 명 잃어도 되돌지 않는 것만)
  const merge = (t, force) => {
    if (c[t] < 10 || compCount(c) - 9 < need) return false;
    if (!force && !(c[t] >= 10 + L.slack || (c[t] >= 11 && compWidth(c) > L.max * cap))) return false;
    c[t] -= 10; c[t + 1]++;
    if ((force && n < 100) || ((force || compWidth(c) >= L.min * cap) && steady(c, g, force ? 1 : L.slack))) return true;
    c[t] += 10; c[t + 1]--;
    return false;
  };
  for (let t = 0; t < NT - 1; t++) if (merge(t, false)) break;
  for (let t = 0; t < NT - 1 && compWidth(c) > L.keep * cap; t++) if (merge(t, true)) t = -1;
  if (compCount(c) < need) fillUp(c, g);
  if (fits(c)) return c;
  // 넘친다: 새 병사는 그리지 않는다(어림 — 그린 합이 그대로, 한 명 잃으면 다시 정확)
  return n >= 100 && fits(prev) ? prev.slice() : composeSquad(n, g);
}
/* 구성 a → b가 한쪽으로만 바뀌는가: dir < 0이면 나누기·빼기만(큰 단계에서 작은 단계로), dir > 0이면 합치기·더하기만 */
function towards(a, b, dir) {
  const s3 = a[3] - b[3], s2 = a[2] - b[2] + 10 * s3, s1 = a[1] - b[1] + 10 * s2;
  return dir < 0 ? s1 >= 0 && s2 >= 0 && s3 >= 0 : s1 <= 0 && s2 <= 0 && s3 <= 0;
}
/* k명 잃어도 나누기가 일어나지 않는가(병사가 k명 넘게 있고, 장 수·채우기가 버틴다) — 합친 직후 몇 명 잃었다고 바로 되돌지 않게
   (잃는 흐름에 한 명 아물었다고 합쳤다가 곧 다시 나누지 않게: 보통 합치기는 slack명, 넘쳐서 하는 합치기는 한 명) */
function steady(c, g, k) {
  return c[0] >= k && compCount(c) - k >= needFor(g.m0) && compWidth(c) - k * TIER[0].w >= FORM_LIM.low * capOf(g);
}

/* 줄 나누기: 큰 단계부터 늘어놓은 것(ts)을 앞줄부터 m줄로 자른다(DP — 줄 비용 합이 가장 작게). 줄마다 두 장 이상(셋뿐이면 V자 — 앞줄 한 장).
   줄 비용: 그림마다 가린 몫(옆 이웃 + 뒷줄), 빈틈(큰 그림 사이 구멍으로 작은 그림이 보이면 크게), 단계가 섞일수록, 좌우가 어긋나면 크다.
   m은 m0 ~ m0+2 가운데(빽빽한 작은 무리는 줄을 늘린다) */
function seqOf(comp) {
  const ts = [];
  for (let t = TIER.length - 1; t >= 0; t--) for (let i = 0; i < comp[t]; i++) ts.push(t);
  return ts;
}
/* 줄 안 자리: 큰 단계가 가운데(대장 자리), 나머지는 가운데에서 바깥으로 번갈아. 짝수 줄의 가운데 두 자리는 줄마다 왼쪽·오른쪽을 번갈아 먼저(한쪽으로 쏠려 보이지 않게) */
function rowOrder(grp, r) {
  const k = grp.length, c = (k - 1) / 2, idx = [];
  for (let j = 0; j < k; j++) idx.push(j);
  idx.sort((a, b) => Math.abs(a - c) - Math.abs(b - c) || (r & 1 ? b - a : a - b));
  const row = new Array(k);
  for (let j = 0; j < k; j++) row[idx[j]] = grp[j];
  return row;
}
/* 줄 비용 표 준비(O(1)로 재게): 폭 누적합, 단계가 바뀌는 자리 */
function costPrep(ts, W) {
  const N = ts.length, pre = new Float64Array(N + 1), chg = [];
  for (let i = 0; i < N; i++) { pre[i + 1] = pre[i] + TIER[ts[i]].w; if (i && ts[i] !== ts[i - 1]) chg.push(i); }
  return { ts, W, pre, chg };
}
function rowCost(cp, a, b, v, last) {
  const ts = cp.ts, k = b - a, sum = cp.pre[b] - cp.pre[a], wa = sum / k;
  // 그림마다 가린 몫: 옆(안쪽 이웃이 위에 그려진다 — 가운데 하나만 빼고) + 아래(뒷줄 그림이 솟아 덮는다, 줄 간격 v)
  const o = k > 1 ? (sum - cp.W) / (k - 1) : 0;
  const hh = Math.max(0, o) / wa;
  const hv = last ? 0 : Math.max(0, TIER[ts[b]].h - v) / TIER[ts[a]].h;
  const hid = 1 - (1 - hh) * (1 - hv);
  let cost = (k - 1) * (hid / 0.35) ** 2 + (hv / 0.35) ** 2;
  // 빈틈(줄이 성기다): 이웃 사이 틈이 그림 폭의 반을 넘으면 크게. 틈으로 뒷줄의 작은 그림이 보이면 더(양옆만 크고 안은 작아 보인다)
  if (o < 0) {
    const gp = -o / wa;
    cost += (k - 1) * ((gp / 0.7) ** 2 + 20 * Math.max(0, gp - 0.5) ** 2) * (last ? 1 : 1 + 2 * Math.max(0, ts[a] - ts[b]));
    if (!last && ts[a] > ts[b] && gp > 0.35) cost += 50;   // 큰 그림 사이 구멍으로 작은 그림 — 거의 하지 않는다
  }
  if (k === 1) cost += 2;
  if (ts[a] !== ts[b - 1]) {
    cost += 1.0 * (ts[a] - ts[b - 1]);
    // 가운데부터 둘씩 양옆에 놓으니, 단계가 짝 한가운데서 바뀌면 좌우가 어긋난다(홀수 줄은 짝수 자리, 짝수 줄은 홀수 자리)
    for (const q of cp.chg) if (q > a && q < b && ((q - a) & 1) === (k & 1 ? 0 : 1)) { cost += 8; break; }
  }
  return cost;
}
function splitBest(cp, m, S) {
  const N = cp.ts.length, v = m > 1 ? S / (m - 1) : 0;
  // best[r·(N+1) + i] = 앞에서 r줄로 ts[0..i)를 나눈 가장 작은 비용
  const best = new Float64Array((m + 1) * (N + 1)).fill(Infinity), from = new Int16Array((m + 1) * (N + 1)).fill(-1);
  best[0] = 0;
  for (let r = 1; r <= m; r++) {
    const minK = r === 1 && N === 3 ? 1 : 2, base = (r - 1) * (N + 1), cur = r * (N + 1);
    for (let i = 0; i < N; i++) {
      const b0 = best[base + i];
      if (b0 === Infinity) continue;
      for (let j = r === m ? N : i + minK; j <= N; j++) {
        if (N - j < 2 * (m - r)) break;
        const c = b0 + rowCost(cp, i, j, v, r === m);
        if (c < best[cur + j] - 1e-12) { best[cur + j] = c; from[cur + j] = i; }
      }
    }
  }
  const tot = best[m * (N + 1) + N];
  if (tot === Infinity) return null;
  const sizes = [];
  for (let r = m, j = N; r > 0; r--) { const i = from[r * (N + 1) + j]; sizes.unshift(j - i); j = i; }
  return { sizes, cost: tot };
}
function sizesCost(cp, sizes, S) {
  const m = sizes.length, v = m > 1 ? S / (m - 1) : 0;
  let c = 0, i = 0;
  for (let r = 0; r < m; r++) {
    if (sizes[r] < (r || cp.ts.length !== 3 ? 2 : 1)) return Infinity;
    c += rowCost(cp, i, i + sizes[r], v, r === m - 1); i += sizes[r];
  }
  return i === cp.ts.length ? c : Infinity;
}
/* 구성 → 줄 배치 { rows: [[단계, …] 앞줄부터], sizes, key, cost }. prev(이전 배치)가 같은 구성이고 아직 쓸 만하면(비용 차이 0.3 안) 그대로 —
   화면 배율이 조금씩 바뀌어도(보스전 카메라) 줄이 들썩이지 않게 */
export function formArrange(comp, g, prev) {
  const ts = seqOf(comp), N = ts.length, ck = comp.join(',');
  if (N === 0) return { rows: [], sizes: [], key: ck + '|', cost: 0, comp: ck };
  if (N <= 2) return { rows: [ts.slice()], sizes: [N], key: ck + '|' + N, cost: 0, comp: ck };
  const cp = costPrep(ts, g.W);
  let best = null;
  for (let m = g.m0; m <= g.m0 + 2; m++) {
    if (N < (N === 3 ? 3 : needFor(m))) break;
    const sp = splitBest(cp, m, g.S);
    if (!sp) continue;
    const cost = sp.cost + 0.15 * (m - g.m0);
    if (!best || cost < best.cost - 1e-9) best = { sizes: sp.sizes, cost };
  }
  if (!best) best = { sizes: [N], cost: 99 };   // (없는 경우 — 안전하게 한 줄)
  if (prev && prev.comp === ck && prev.sizes && prev.sizes.length >= g.m0 && prev.sizes.length <= g.m0 + 2) {
    const pc = sizesCost(cp, prev.sizes, g.S) + 0.15 * (prev.sizes.length - g.m0);
    if (pc <= best.cost + 0.3) best = { sizes: prev.sizes, cost: pc };
  }
  const rows = [];
  for (let r = 0, i = 0; r < best.sizes.length; i += best.sizes[r++]) rows.push(rowOrder(ts.slice(i, i + best.sizes[r]), r));
  return { rows, sizes: best.sizes, key: ck + '|' + best.sizes.join('.'), cost: best.cost, comp: ck };
}
/* 줄 안 가운데 자리(px, 분대 가운데 기준): 양 끝 그림이 ±W/2에 닿고 겹침(또는 틈)은 고르게. 결과 = 이웃 겹침(px) */
function rowXs(row, W, out) {
  const k = row.length;
  if (k === 1) { out[0] = 0; return 0; }
  let sum = 0;
  for (const t of row) sum += TIER[t].w;
  const o = (sum - W) / (k - 1);
  let x = -W / 2 + TIER[row[0]].halfL;
  out[0] = x;
  for (let j = 1; j < k; j++) { x += TIER[row[j - 1]].halfR + TIER[row[j]].halfL - o; out[j] = x; }
  return o;
}
const FORM_XS = [], FORM_YS = new Float64Array(64), FORM_GAP = new Float64Array(64);
/* 줄 높이(px, 맨 앞줄 발 0 ~ 맨 뒷줄 발 S): 고르게. 다만 전차 줄 바로 뒤(가까운 쪽)가 전차 없는 줄이면 그 사이를 TANK_GAP까지 더 띄운다 —
   줄 간격 13px이면 뒷줄 그림이 전차 키(22px)의 40%를 덮어 몸통·궤도가 숨고 별 단 돔만 남는다(분대장 철모처럼 보인다). 1/3쯤만 가리게.
   뒷줄 옆 끝 그림 키보다는 작게(옆이 위아래로 이어지게), 다른 줄 간격은 고른 것의 0.75배까지만 줄인다 */
export const TANK_GAP = 16;
const hasTank = (row) => row.indexOf(3) >= 0;
function rowYs(rows, S) {
  const m = rows.length, ys = FORM_YS, gap = FORM_GAP, v = m > 1 ? S / (m - 1) : 0;
  ys[0] = 0;
  if (m < 2) return ys;
  let nT = 0, sumT = 0;
  for (let r = 0; r + 1 < m; r++) {
    gap[r] = 0;
    if (!hasTank(rows[r]) || hasTank(rows[r + 1])) continue;
    const nx = rows[r + 1], edge = Math.min(TIER[nx[0]].h, TIER[nx[nx.length - 1]].h) - 1;
    gap[r] = Math.max(v, Math.min(TANK_GAP, edge));
    nT++;
  }
  if (nT && nT < m - 1) {
    const lim = (S - (m - 1 - nT) * 0.75 * v) / nT;
    for (let r = 0; r + 1 < m; r++) if (gap[r]) { gap[r] = Math.max(v, Math.min(gap[r], lim)); sumT += gap[r]; }
  } else nT = 0;
  const gO = nT ? (S - sumT) / (m - 1 - nT) : v;
  for (let r = 1; r < m; r++) ys[r] = ys[r - 1] + (nT && gap[r - 1] ? gap[r - 1] : gO);
  ys[m - 1] = S;
  return ys;
}
/* 깊이 z(분대 기준, z ≤ 0)의 m당 px — 1/px는 깊이에 대해 곧은 줄(바늘구멍 사진기) */
const ppmAt = (g, z) => (g.D > 0 && z < 0 ? 1 / (1 / g.ppm + (z / -g.D) * (1 / g.pb - 1 / g.ppm)) : g.ppm);
/* 뒷줄 옆 끝을 맞출 몸 끝(px): 단계 t 그림 키 1/4 높이의 깊이에서 잰 R */
const edgeAt = (g, z, t) => g.R * ppmAt(g, Math.min(0, z + TIER[t].h / (4 * g.vb)));
/* 자리(m, 분대 가운데 기준) — 정확한 배율로 매 프레임 다시 잰다. 줄은 화면에서 고르게(원근: 앞쪽 vf, 뒤쪽 vb). out[i] = { t, x, z, r, j }.
   가운데보다 뒤(가까운 쪽) 줄은 원근으로 화면에서 넓어지는데, 키 큰 그림(중장갑·전차)은 머리가 가운데 깊이까지 솟는다 — 그 줄의 옆 끝은 그림 키 1/4 높이의
   깊이에서 잰 몸 끝(R·그 깊이의 배율)에 맞춘다: 옆 한가운데서 무는 좀비가 그림 머리에 너무 깊이 파묻히지 않고(5px 안), 뒤 모서리도 비지 않게(tests/art.mjs) */
export function formPositions(arr, g, out = []) {
  const rows = arr.rows, m = rows.length, xs = FORM_XS, ys = rowYs(rows, g.S);
  let n = 0;
  for (let r = 0; r < m; r++) {
    const row = rows[r];
    rowXs(row, g.W, xs);
    let z = 0;
    if (m > 1) {
      const y = ys[r] - g.D * g.vf;   // 분대 가운데 기준 화면 아래쪽(+)
      z = y <= 0 ? -y / g.vf : -y / g.vb;
      if (r === 0) z = g.D;
      if (r === m - 1) z = -g.D;
    }
    let kL = 1 / g.ppm, kR = kL;
    if (z < 0 && row.length > 1) {
      const pr = ppmAt(g, z), half = g.W / 2;
      const hl = TIER[row[0]].halfL, hr = TIER[row[row.length - 1]].halfR;
      kL = (edgeAt(g, z, row[0]) - hl) / (half - hl) / pr;
      kR = (edgeAt(g, z, row[row.length - 1]) - hr) / (half - hr) / pr;
    }
    for (let j = 0; j < row.length; j++) {
      const o = out[n] || (out[n] = { t: 0, x: 0, z: 0, r: 0, j: 0 });
      o.t = row[j]; o.x = xs[j] * (xs[j] < 0 ? kL : kR); o.z = z; o.r = r; o.j = j;
      n++;
    }
  }
  out.length = n;
  return out;
}
/* 한 번에: 병력 n, 분대 반지름 R, 배율 → { comp, arr, g, units: [{ t, x, z, r, j }] } (테스트·처음 그릴 때) */
export function formationPlan(n, R, ppm, vf, vb, pb) {
  const g = formGeom(R, ppm, vf, vb, pb);
  const comp = composeSquad(n, g);
  const arr = formArrange(comp, g);
  return { comp, arr, g, units: formPositions(arr, g) };
}
/* 특수병 자리: 무리 맨 뒤 바로 뒤 양쪽(분대 폭 안), 셋째는 왼쪽 자리 한 줄 뒤(영웅과 안 겹치게). 영웅은 그 뒤 가운데 */
export function slotPos(q, i, R, qx) {
  const back = q.z - SQUAD_DEPTH * R - 0.35;
  const side = 0.55 * R + 0.4;
  if (i === 0) return { x: qx - side, z: back };
  if (i === 1) return { x: qx + side, z: back };
  return { x: qx - side, z: back - 0.75 };
}
export const heroZ = (q, R) => q.z - R - 0.7;
/* 총구 불꽃 차례(순수 함수): 차례 ph(0, 1, 2…)인 그림이 60Hz 프레임 f60에 쏘는가 — 주기 period마다 한 번, 차례가 이어진 그림들은
   서로 다른 프레임에 쏜다(한 프레임에 많아야 ⌈쏘는 수/주기⌉). 낮은 품질(low)은 짝수 프레임만, 그림마다 주기 두 배로 한 번(모두 쏜다) */
export function muzzleOn(f60, ph, period, low) {
  if (low) return (f60 & 1) === 0 && (((f60 >> 1) + ph) % period) === 0;
  return ((f60 + ph) % period) === 0;
}

export function createRenderer(cvs) {
  const ctx = cvs.getContext('2d', { alpha: false });
  const view = makeView();
  const screen = { w: 0, h: 0, col: 0 };
  const atlas = createAtlas();
  const font = createFont(atlas);
  const ground = createGround();
  let BW = 0, BH = 0, VW = 0, VH = 0, K = 1, dpr = 1, cssPer = 1, cssW = 0, cssH = 0;
  let img = null, u32 = null;
  let quality = 'high';
  let shakeOn = true;
  let preview = false;
  let frozenSet = false;
  let cardOn = false;
  let hudCss = null;
  let dirty = true;
  /* 움직임 줄이기: 켜고 끄는 것을 바로 따른다(T10) */
  let reduce = false;
  try {
    if (typeof matchMedia === 'function') {
      const mq = matchMedia('(prefers-reduced-motion: reduce)');
      reduce = !!mq.matches;
      const onMq = (e) => { reduce = !!e.matches; if (reduce) trauma = 0; dirty = true; };
      if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
    }
  } catch { /* 없는 환경 */ }
  const RENDERING = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('image-rendering', 'pixelated') ? 'pixelated'
    : typeof CSS !== 'undefined' && CSS.supports && CSS.supports('image-rendering', 'crisp-edges') ? 'crisp-edges' : '-webkit-optimize-contrast';

  /* 굽기는 모두 쉬는 틈에(부팅 중 긴 작업 없이). 글자·아이콘(닫힌 집합)을 먼저, 그다음 자주 쓰는 시트, 나머지.
     준비(ready)가 끝난 뒤에는 그리는 중에 아틀라스에 굽는 일이 없다(T1·T7). */
  let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });
  {
    const first = ['soldier', 'sq10', 'sq100', 'sq1000', 'grunt', 'flash', 'spark', 'puff', 'coin', 'runner', 'flag'];
    const tasks = [
      ...font.prebakeTasks(GLYPH_PAIRS),
      () => { for (const k of Object.keys(ICONS)) atlas.icon(k); },
      ...first,
      ...Object.keys(SHEETS).filter((n) => !first.includes(n) && !BIOME_ONLY.has(n)),
    ];
    atlas.bakeIdle(tasks, () => { readyResolve(true); idleAfterReady(); });
  }
  ensureJua();
  /* 지역 시트(좀비 옷·보스·길가 소품)는 그 지역에 가기 전에 쉬는 틈에 굽는다(부팅 때 여섯 보스를 다 굽지 않게 — 보스 하나 ≈ 0.75M px).
     부를 곳: 시작(이어 할 레벨), 레벨 카드(prepareRun), 이긴 결과 화면(다음 레벨). 한 지역씩 차례로(두 굽기가 한 틈을 나눠 먹지 않게).
     그리는 쪽은 아직 없으면 기본 시트로 그리거나(좀비·보스) 비워 둔다(소품) — 그리는 중에는 굽지 않는다(lateBakes = 0) */
  const prepped = new Map();
  let prepChain = ready;
  function prepBiome(bid) {
    let p = prepped.get(bid);
    if (!p) {
      p = prepChain = prepChain.then(() => new Promise((res) => {
        const todo = biomeSheets(bid).filter((n) => !atlas.has(n));
        if (!todo.length) res(true); else atlas.bakeIdle(todo, () => res(true));
      }));
      prepped.set(bid, p);
    }
    return p;
  }

  /* 프레임 상태 */
  let time = 0, prevTime = 0, f60 = 0, camX = 0, dolly = 0, fitted = -1, trauma = 0;
  let flashA = 0, flashRGB = '255,255,255', flashCss = 'rgb(255,255,255)';
  let shownN = 0, countPop = 0, countTint = 0, lastN = -1, pillA = 1;
  let lastS = null, lastT = -1, stillFor = 0;
  let hurtAt = -9, bossImpactT = -9, roarT = -9, bossIntroT = -9, bossDeath = null, enrageT = -9;
  let petT = -9;       // 펫 효과가 터진 때(core 'pet' 이벤트)
  let surgeT = -9;   // 몰이 알림(core 'surge' 이벤트): 화면 양옆에서 안쪽을 가리키는 붉은 화살표가 잠깐 깜박인다
  let stompT = -9;     // 보스 짓밟기(길 전체 땅 흔들림 표시)
  let hitboxOn = false; // 충돌 크기 보기(?hitbox=1, __squad.hitbox)
  let castT = -9, castId = '', castRun = false, castArena = false, healT = -9, rocketT = -9, snipeT = -9, readyT = -9;
  let healSum = 0, healShown = -9, groundMs = 0, putMs = 0, drawMs = 0, hurtSeed = 0;
  let cut = null;        // 컷인 { t, id }
  let bossCut = null;    // 보스 등장 띠 { t }
  let tagL = -1, bossTag = '', bossTitle = null, bossTitleKey = '';   // 이 레벨의 보스 등급(정예·대왕)과 미리 그린 이름
  let lookNext = 3;
  const SPAWN_CAP = 160;
  let spawnBudget = SPAWN_CAP;   // 그리기 한 번(+그 뒤 이벤트)에 새로 띄우는 파편 수 상한 — 폭발이 한꺼번에 터져도 프레임이 튀지 않게(V5)
  const sq = { x: 0, z: 0, vz: 0, vx: 0, n: 0, tier: 0, sp: [] };   // 그리는 순간의 분대(보간)
  /* 렌더러 전용 축소 단계(시뮬 객체에 쓰지 않는다). 종류마다 숫자 키 Map(문자열 키를 매 프레임 만들지 않게) */
  const lodScen = new Map(), lodFoe = new Map(), lodSaw = new Map(), lodCage = new Map();
  let lodBoss;
  const flashFoe = createFlashLimiter(0.34, 0.034);   // 좀비: 초당 3회 이하
  const flashBoss = createFlashLimiter(0.5, 0.034);   // 보스: 초당 2회 이하, 반투명 덧칠(V9)
  const hitSeen = new Map();
  const tickAt = new Map();
  const bruteStep = new Map();
  const spSeen = new Map();    // 특수병 id → { born, fx, fz }
  const pendingGet = [];       // 아직 분대 목록에서 못 찾은 합류 이벤트
  const pill = { on: false, x0: 0, y0: 0, x1: 0, y1: 0 };   // 이번 프레임 숫자 말풍선 자리(떠오르는 숫자가 피해 간다, V4)
  const selLbl = { on: false, x0: 0, y0: 0, x1: 0, y1: 0 }; // 고른 게이트 칸 숫자 자리(말풍선이 더 흐려진다, V7)
  const labelCache = { add: new Map(), unit: new Map(), mul: new Map(), div: new Map() };
  const mtx = typeof DOMMatrix === 'function' ? new DOMMatrix() : null;   // 무늬 위치(프레임마다 새로 만들지 않는다)

  /* 효과 풀 — 파편은 빈 칸 목록(free list)으로 O(1)에 꺼내고, 살아 있는 것만 돈다 */
  const parts = [];
  for (let i = 0; i < MAX_PARTS; i++) parts.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, c: '#fff', size: 1, g: 9, spr: null });
  const pFree = new Int16Array(MAX_PARTS), pLive = new Int16Array(MAX_PARTS);
  let nFree = 0, nLive = 0;
  for (let i = MAX_PARTS - 1; i >= 0; i--) pFree[nFree++] = i;
  const fxs = [];
  for (let i = 0; i < 72; i++) fxs.push({ on: false });
  const floats = [];
  for (let i = 0; i < 18; i++) floats.push({ on: false });
  /* 역전(SIM 9): 빨간 게이트가 파랑으로 뒤집힌 칸 — 칸이 하얗게 번쩍이고(FLIP_FLASH초) 위에 '역전!'이 튀어 올랐다 사라진다(FLIP_T초) */
  const FLIP_T = 0.95, FLIP_FLASH = 0.22;
  const flips = [];
  for (let i = 0; i < 4; i++) flips.push({ on: false, t: 0, x: 0, z: 0, row: -1, x0: 0 });
  const spUpAt = new Map();   // 특수병 id → 레벨 오른 시각(별이 잠깐 크게 반짝인다)
  const spBig = new Map();    // 특수병 id → 레벨이 오른 뒤 첫 발은 크게(바뀐 것이 바로 보이게)
  /* 로켓 Lv3 폭발 자리의 그을음(땅 위 어두운 타원, SCORCH_T초 동안 옅어진다) */
  const SCORCH_T = 0.8;
  const scorches = [];
  for (let i = 0; i < 4; i++) scorches.push({ on: false, x: 0, z: 0, r: 1, t: 0 });
  let splashT = -9;           // 작렬탄 고리를 마지막으로 그린 때
  let waveFront = 0;          // 맨 앞줄의 z(분대 기준 m)
  let waveT = -9;             // 좋은 게이트를 지난 때(분대가 앞줄부터 물결처럼 통 튄다)
  let bossHpSeen = -1, bossDmgAcc = 0, bossDmgT = 0, bossMark = 4, bossMax = 0;   // 보스 피해 숫자(모아서)·체력 75·25% 파편
  const maxTexts = new Map(); // 빨간 칸 끝(cap) → ['MAX+45', '+45'](값마다 한 번만 만든다)
  const flies = [];
  for (let i = 0; i < 24; i++) flies.push({ on: false });
  const tracers = [];
  for (let i = 0; i < 24; i++) tracers.push({ on: false });
  const rings = [];
  for (let i = 0; i < 16; i++) rings.push({ on: false });
  let curBid = 'desert';
  const bfx = () => BOSS_FX[curBid] || BOSS_FX.desert;   // 지역 보스 효과 색(내려찍기 먼지·고리·외침·분노·김·쓰러짐)
  const flakes = [];
  for (let i = 0; i < 40; i++) flakes.push({ x: Math.random(), y: Math.random(), v: 0.5 + Math.random(), p: Math.random() * 6 });

  /* 분대 그림 단위(합친 병사 포함): { id, t 단계, slot 자리 번호, x·z 분대 기준 m, born 떨어져 내림, pop 합쳐져 나타남, hop 나뉘어 튀어나옴 } */
  const units = [];
  const fading = [];     // 사라지는 중인 그림(합쳐지며 빨려 감 'merge' / 나뉘기 직전 'split')
  const fPos = [];       // 이번 프레임 자리(formPositions, 재사용)
  let fComp = null, fArr = null, fGeo = null, fN = -1, formS = null, unitId = 0, pendingLoss = 0, formPlans = 0;
  let firePeriod = 5, hurtMod = 11;
  /* 총알 모양을 나누는 몫: 합친 병사 단계(병사 · 분대장 · 중장갑 · 전차)가 병력에서 차지하는 누적 몫 — shotCum[t] 아래면 단계 t의 모양.
     shotShare[3] = 전차 몫(포탄 터짐). 총알은 시뮬레이션에서 분대 폭에 고르게 나가므로 그림과 묶지 않고 몫대로만 나눈다 */
  const shotCum = [1, 1, 1, 1], shotShare = [1, 0, 0, 0];
  const TIER_MEN = [1, 10, 100, 1000];
  const EMPTY_COMP = [0, 0, 0, 0];
  const MERGE_T = 0.3, SPLIT_T = 0.16;

  /* 그리기 목록(재사용). 깊이 정렬은 정수 키(깊이 1/64u 단위 + 넣은 순서)를 Int32Array에서 정렬한다 —
     비교 함수 없이, 프레임마다 쓰레기 없이(T6). 같은 깊이는 넣은 순서대로 그린다. */
  const MAX_ITEMS = 1000;
  const items = [];
  for (let i = 0; i < MAX_ITEMS; i++) items.push({ z: 0, k: 0, o: null, i: 0, x: 0 });
  let nItems = 0;
  const sortKeys = new Int32Array(MAX_ITEMS);
  function push(z, k, o, i = 0, x = 0) {
    if (nItems >= MAX_ITEMS) return;
    const it = items[nItems++];
    it.z = z; it.k = k; it.o = o; it.i = i; it.x = x;
  }
  /* 먼 것부터(깊이 내림차순)로 정렬된 개수를 돌려준다. sortKeys[j] & 1023 = items 번호 */
  function sortItems() {
    const n = nItems, z0 = view.camZ - 24;
    for (let i = 0; i < n; i++) {
      let q = Math.round((items[i].z - z0) * 64);
      if (q < 0) q = 0; else if (q > 0x1FFFF) q = 0x1FFFF;
      // 깊이를 뒤집은 키(먼 것이 작다)로 오름차순 정렬 → 먼 것부터, 같은 깊이는 넣은 순서대로
      sortKeys[i] = ((0x1FFFF - q) << 10) | i;
    }
    sortKeys.subarray(0, n).sort();
    return n;
  }

  /* 무늬 */
  const stripeTile = mkCanvas(6, 6);
  { const g = stripeTile.getContext('2d'); g.fillStyle = 'rgba(255,255,255,.22)'; for (let i = 0; i < 6; i++) g.fillRect(i, 5 - i, 2, 1); }
  const stripe = ctx.createPattern(stripeTile, 'repeat');
  const hazTile = mkCanvas(8, 8);
  { const g = hazTile.getContext('2d'); g.fillStyle = '#FFC93C'; g.fillRect(0, 0, 8, 8); g.fillStyle = OUT; for (let i = 0; i < 8; i++) { g.fillRect((i + 4) % 8, 7 - i, 3, 1); g.fillRect(((i + 4) % 8) - 8, 7 - i, 3, 1); } }
  const hazard = ctx.createPattern(hazTile, 'repeat');

  /* ---------- 크기 ---------- */
  function resize(w, h, ratio) {
    cssW = w; cssH = h;
    dpr = ratio || 1;
    const b = pickBuffer(w, h, dpr);
    K = b.K; BW = b.BW; BH = b.BH; VW = b.VW; VH = b.VH;
    cssPer = b.cssPer;
    cvs.width = BW;
    cvs.height = BH;
    // CSS 크기는 정수 px(소수 DPR에서도 버퍼 한 칸 = 기기 픽셀 K개로 고르게, T2)
    cvs.style.width = b.cssW + 'px';
    cvs.style.height = b.cssH + 'px';
    cvs.style.imageRendering = RENDERING;
    ctx.imageSmoothingEnabled = false;
    img = ctx.createImageData(BW, BH);
    u32 = new Uint32Array(img.data.buffer);
    fitted = -1;
    layout();
    screen.w = w; screen.h = h; screen.col = b.col;
    if (ov) { sizeOverlay(); idle(renderTitles); }
    dirty = true;
  }
  function layout() {
    if (!BW) return;
    // 보이는 영역(VW×VH) 기준으로 맞춘다 — 버퍼가 정수 CSS 크기 때문에 조금 넓어져도 도로는 화면 가운데
    const o = lensOpt(VW, VH, dolly);
    if (quality === 'low') o.far = FIT.farLow;
    fitView(view, VW, VH, ROAD, dolly, o);
    fitted = dolly;
  }

  function setQuality(q) { quality = q === 'low' ? 'low' : 'high'; fitted = -1; dirty = true; }
  function setShake(on) { shakeOn = !!on; if (!on) trauma = 0; }
  function setPreview(on) { preview = !!on; dirty = true; }
  function setFrozen(on) { frozenSet = !!on; dirty = true; }
  /* 레벨 카드가 떠 있는 동안: 숫자 말풍선·떠오르는 숫자를 그리지 않는다(카드 글자와 겹치지 않게, V6) */
  function setCard(on) { cardOn = !!on; dirty = true; }
  function setHudTarget(x, y) { hudCss = x == null ? null : { x, y }; }

  function reset() {
    for (const p of parts) p.on = false;
    nFree = 0; nLive = 0; spawnBudget = SPAWN_CAP;
    for (let i = MAX_PARTS - 1; i >= 0; i--) pFree[nFree++] = i;
    for (const f of fxs) f.on = false;
    for (const f of floats) f.on = false;
    for (const f of flies) f.on = false;
    for (const t of tracers) t.on = false;
    for (const r of rings) r.on = false;
    trauma = 0; flashA = 0; camX = 0; units.length = 0; fading.length = 0; fComp = null; fArr = null; fGeo = null; fN = -1; formS = null; pendingLoss = 0; lastN = -1; countTint = 0; countPop = 0; shownN = 0; pillA = 1;
    dolly = 0; layout();   // 보스전 렌즈를 되돌린다(R1)
    hurtAt = -9; bossImpactT = -9; roarT = -9; bossIntroT = -9; bossDeath = null; enrageT = -9; surgeT = -9; stompT = -9;
    castT = -9; castRun = false; castArena = false; healT = -9; rocketT = -9; snipeT = -9; readyT = -9; healSum = 0; healShown = -9;
    cut = null; bossCut = null; clearOverlay();
    lodScen.clear(); lodFoe.clear(); lodSaw.clear(); lodCage.clear(); lodBoss = undefined;
    flashFoe.clear(); flashBoss.clear(); hitSeen.clear(); tickAt.clear(); bruteStep.clear(); spSeen.clear(); pendingGet.length = 0;
    for (const f of flips) f.on = false;
    spUpAt.clear(); spBig.clear();
    for (const c of scorches) c.on = false;
    waveT = -9; bossHpSeen = -1; bossDmgAcc = 0; bossDmgT = 0; bossMark = 4; bossMax = 0;
    lastS = null; stillFor = 0; dirty = true;
  }

  /* ---------- 효과 ---------- */
  const lowFx = () => quality === 'low';
  let partSkip = 0;
  function part(x, y, z, vx, vy, vz, life, c, size = 1, g = 9, spr = null) {
    if (lowFx() && (partSkip++ & 1)) return;
    if (!nFree || spawnBudget <= 0) return;
    spawnBudget--;
    const idx = pFree[--nFree];
    const p = parts[idx];
    p.on = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.c = c; p.size = size; p.g = g; p.spr = spr;
    pLive[nLive++] = idx;
  }
  function burst(x, y, z, n, colors, speed = 3, up = 3, life = 0.55) {
    if (typeof colors === 'string') colors = [colors];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const v = speed * (0.4 + Math.random() * 0.8);
      part(x, y, z, Math.cos(a) * v, up * (0.5 + Math.random()), Math.sin(a) * v, life * (0.7 + Math.random() * 0.6), colors[i % colors.length], Math.random() < 0.3 ? 2 : 1);
    }
  }
  function fx(kind, x, y, z, dur, o = null) {
    let slot = null;
    for (const f of fxs) if (!f.on) { slot = f; break; }
    if (!slot) return null;
    slot.on = true; slot.kind = kind; slot.x = x; slot.y = y; slot.z = z; slot.t = 0; slot.dur = dur;
    slot.k = null; slot.n = 0; slot.vx = 0; slot.vz = 0; slot.sheet = null; slot.step = 0; slot.col = null;
    if (o) Object.assign(slot, o);
    return slot;
  }
  function float(x, y, z, text, fill, o = {}) {
    let slot = floats[0];
    for (const f of floats) { if (!f.on) { slot = f; break; } if (f.life < slot.life) slot = f; }
    slot.on = true; slot.x = x; slot.y = y; slot.z = z; slot.text = text; slot.fill = fill; slot.out = o.out || OUT;
    slot.scale = o.scale || 1; slot.life = o.life || 1; slot.max = slot.life; slot.vz = o.vz || 0; slot.icon = o.icon || null; slot.rise = o.rise ?? 1.4;
    slot.pill = !!o.pill; slot.alpha = o.alpha ?? 1;
  }
  function ring(x, z, r0, r1, dur, c, o = {}) {
    for (const r of rings) if (!r.on) { Object.assign(r, { on: true, x, z, r0, r1, t: 0, dur, c, follow: o.follow || false, thick: o.thick || 1 }); return; }
  }
  /* w: 굵기(1~3px), core: 가운데 밝은 심 색(없으면 한 색), 굵은 선은 끝날 무렵 가늘어진다 */
  function tracer(x0, y0, z0, x1, y1, z1, c, dur = 0.08, w = 1, core = null) {
    for (const t of tracers) if (!t.on) { Object.assign(t, { on: true, x0, y0, z0, x1, y1, z1, c, t: 0, dur, w, core }); return; }
  }
  function shake(a) { if (shakeOn && !reduce) trauma = Math.min(1, trauma + a); }
  /* 몰이 알림: 화면 양옆 가장자리에 붉은 띠 + 안쪽을 가리키는 화살표 셋(4번 깜박, 줄이기 설정이면 덜 밝게). 글자는 DOM 알림(main.js)이 띄운다 */
  const SURGE_CUE = 1.8;
  function drawSurgeCue(t) {
    const W = Math.floor(VW), Hh = Math.floor(VH);
    const on = ((t * 5) | 0) % 2 === 0;
    const fade = Math.min(1, (SURGE_CUE - t) / 0.4);
    ctx.fillStyle = '#E8384F';
    ctx.globalAlpha = (on ? 0.34 : 0.16) * fade * (reduce ? 0.5 : 1);
    ctx.fillRect(0, 0, 4, Hh); ctx.fillRect(W - 4, 0, 4, Hh);
    ctx.globalAlpha = (on ? 0.95 : 0.55) * fade;
    const a = 7, cy = Math.round(Hh * 0.38);
    for (let i = 0; i < 3; i++) {
      const y = cy + (i - 1) * 14;
      for (const [x0, d] of [[6 + ((t * 18) % 6), 1], [W - 7 - ((t * 18) % 6), -1]]) {
        ctx.fillStyle = '#A92644';
        pline(x0, y - a + 1, x0 + d * a, y + 1); pline(x0 + d * a, y + 1, x0, y + a + 1);
        ctx.fillStyle = '#FFD0C4';
        pline(x0, y - a, x0 + d * a, y); pline(x0 + d * a, y, x0, y + a);
      }
    }
    ctx.globalAlpha = 1;
  }
  function screenFlash(a, rgb) { if (reduce) a *= 0.25; if (a > flashA) { flashA = a; if (rgb !== flashRGB) { flashRGB = rgb; flashCss = 'rgb(' + rgb + ')'; } } }

  /* 유령 숫자: 게이트를 지난 뒤 0.6초 동안, 고르지 않은 칸으로 갔으면 몇 명이었는지 흐리게(다른 칸 하나가 20% 이상 나았을 때만).
     분대와 같은 깊이에서 그 칸 자리에 뜨고 분대를 따라간다. 가장 좋았던 칸은 파랑, 나머지는 더 흐린 흰색 */
  function ghosts(s, e, q) {
    const row = s.rows && s.rows.find((r) => r.id === e.row);
    const g = gateAlts(row, e);
    if (!g || !g.worth) return;
    for (const a of g.alts) {
      float(a.x, 2.1, q.z, '=' + a.n, a.best ? '#DDF3FF' : '#FFFFFF', { out: a.best ? PANEL.good.out : OUT, life: 0.6, vz: q.vz, rise: 0.4, alpha: a.best ? 0.72 : 0.5 });
    }
  }

  /* 코인이 HUD로 날아갈 자리(버퍼 픽셀) */
  function hudTarget() {
    let x = null, y = null;
    if (hudCss) { x = hudCss.x; y = hudCss.y; } else if (typeof document !== 'undefined') {
      const el = document.getElementById('hudCoins');
      if (el && el.offsetParent !== null) { const r = el.getBoundingClientRect(); x = r.left + 10; y = r.top + r.height / 2; }
    }
    if (x == null) return { x: VW - 30, y: 16 };
    const cr = cvs.getBoundingClientRect ? cvs.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: (x - cr.left) / cssPer, y: (y - cr.top) / cssPer };
  }
  function coinFly(x, y, z, n) {
    if (!project(view, x, y, z)) return;
    const sx = P.x, sy = P.y;
    const tg = hudTarget();
    let k = 0;
    for (const f of flies) {
      if (f.on) continue;
      Object.assign(f, { on: true, sx: sx + (Math.random() - 0.5) * 10, sy: sy + (Math.random() - 0.5) * 6, tx: tg.x, ty: tg.y, t: -k * 0.06, dur: 0.6 });
      if (++k >= Math.min(8, n)) break;
    }
  }

  /* ---------- 시뮬레이션 이벤트 → 효과 ---------- */
  function events(s, ev) {
    const q = s.squad;
    const R = radius(Math.max(1, q.n));
    const sp = q.sp || [];
    for (const e of ev) {
      switch (e.t) {
        case 'gate': {
          const good = e.after >= e.before;
          const isUnit = e.op === 'unit';
          const text = opText({ op: e.op, v: e.v });
          // 말풍선 바로 위에 뜬다(화면에서 말풍선 위 6px 이상 — drawFloats가 맞춘다, V4)
          float(q.x, 3.3 + 0.3 * R, q.z, text, isUnit ? '#FFF09A' : good ? '#DDF3FF' : '#FFD0C4', { scale: 2, life: 1.0, vz: q.vz, out: isUnit ? PANEL.unit.out : good ? PANEL.good.out : PANEL.bad.out, rise: 0.8, pill: true });
          const cols = isUnit ? FX_COL.unit : good ? FX_COL.good : FX_COL.bad;
          for (let i = 0; i < 20; i++) part(e.x + (Math.random() - 0.5) * 3, 0.4 + Math.random() * 2.2, e.z, (Math.random() - 0.5) * 6, 1 + Math.random() * 4, -1 - Math.random() * 3, 0.5 + Math.random() * 0.3, cols[i % 3], Math.random() < 0.4 ? 2 : 1);
          countPop = 1;
          if (!good) { screenFlash(0.22, '232,56,79'); shake(0.25); }
          else if (e.after > e.before && !reduce) waveT = time;
          ghosts(s, e, q);
          break;
        }
        case 'tick': tickAt.set(e.row, time); if (Math.random() < 0.5) fx('spark', e.x, 1.2 + Math.random(), e.z, 0.07); break;
        case 'gain':
          countTint = 1;
          if (e.why === 'crate') float(e.x, 2.4, e.z, '+' + e.n, '#DDF3FF', { icon: 'men', out: PANEL.good.out });
          break;
        case 'loss': {
          countTint = -1;
          // 붉은 기는 눈에 띄는 손실에만, 0.4초에 한 번(작은 손실이 이어져도 부대가 계속 빨갛지 않게)
          if (e.n >= Math.max(2, q.n * 0.02) && time - hurtAt > 0.4) { hurtAt = time; hurtSeed = (hurtSeed + 3) % 11; }
          // 못 부순 상자·철창에 부딪혀 잃은 병사: 상자 자리에 병사 아이콘과 '-n'(F4 — 무엇 때문에 잃었는지 보이게)
          if (e.cause === 'crate') float(e.x, 2.3, e.z, '-' + e.n, '#FFC2B3', { icon: 'men', out: PANEL.bad.out, life: 1.2 });
          else if (e.cause !== 'gate' && e.n >= 2) float(q.x + (Math.random() < 0.5 ? -1 : 1) * (R + 0.4), 1.6, q.z, '-' + e.n, '#FFC2B3', { out: PANEL.bad.out, life: 0.8, vz: q.vz });
          if (e.n >= Math.max(5, q.n * 0.08)) shake(0.18);
          // 쓰러진 병사: 연기 + 철모가 튀어 오른다 — 다음 그리기에서 빠진 그림 자리에(빠진 그림이 없으면 몇 군데)
          pendingLoss += e.n;
          break;
        }
        case 'kill': {
          const big = e.kind === 'brute';
          fx('puff', e.x, big ? 0.9 : 0.5, e.z, big ? 0.4 : 0.3, { step: big ? 0 : 1 });
          const kc = e.elite ? ELITE_COL[e.elite].burst : e.kind === 'spit' ? FX_COL.purple : FOE_BURST[curBid] || FX_COL.green;
          if (e.by === 'sniper' || e.by === 'hero') {
            // 저격: 맞은 쪽 반대로(먼 쪽으로) 길게 튕겨 나간다
            for (let i = 0; i < (big ? 12 : 7); i++) part(e.x + (Math.random() - 0.5) * 0.3, (big ? 1.2 : 0.7) + Math.random() * 0.4, e.z, (Math.random() - 0.5) * 1.6, 1 + Math.random() * 2, 7 + Math.random() * 7, 0.5 + Math.random() * 0.25, kc[i % kc.length], Math.random() < 0.3 ? 2 : 1);
          } else if (e.by === 'rocket') {
            // 로켓: 위로 솟았다 떨어진다
            burst(e.x, big ? 1.2 : 0.7, e.z, big ? 16 : 9, kc, 2.2, 7.5, 0.85);
          } else {
            burst(e.x, big ? 1.2 : 0.7, e.z, big ? 14 : 7, kc, big ? 3.5 : 2.5, 3);
            // 전차 포탄 몫: 총으로 잡은 자리에 작은 터짐(전차가 차지하는 병력 몫만큼)
            if (shotShare[3] > 0 && Math.random() < shotShare[3]) { fx('boom', e.x, 0.7, e.z, 0.18); burst(e.x, 0.7, e.z, 5, FX_COL.boom, 3, 3, 0.4); }
          }
          if (big) shake(0.15);
          break;
        }
        case 'bite': {
          const fk = e.kind === 'runner' ? 'runner' : e.kind === 'brute' ? 'brute' : 'grunt';
          const sk = skinOf(fk, curBid);
          // 문 좀비의 무리 변형(a·b)을 이어 쓴다 — 방금 죽은 그 좀비(같은 종류·자리)를 찾는다, 없으면 기본 색
          let alt = '';
          for (const g of s.foes) if (g.kind === e.kind && g.x === e.x && g.z === e.z) { alt = ALT3[g.seed % 3]; break; }
          fx('lunge', e.x, 0, e.z, 0.14, { sheet: atlas.has(sk) ? sk : fk, foe: fk, alt });
          burst(e.x, 0.7, e.z, 5, FX_COL.blood, 2, 2.5);
          break;
        }
        case 'wallBreak':
          burst(e.x, 0.9, e.z, 26, FX_COL.stone, 5, 5, 0.7);
          fx('puff', e.x, 0.7, e.z, 0.35);
          shake(0.3);
          break;
        case 'wallCrash':
          burst(e.x, 0.9, e.z, 22, FX_COL.stone, 4, 4, 0.7);
          burst(q.x, 0.8, q.z, 10, FX_COL.blood, 3, 3);
          screenFlash(0.28, '232,56,79');
          shake(0.45);
          break;
        case 'crate': {
          burst(e.x, 1, e.z, 22, FX_COL.wood, 5, 5, 0.7);
          fx('puff', e.x, 0.8, e.z, 0.3);
          if (e.type === 'gun') { float(e.x, 2.6, e.z, '+1', '#FFE38A', { icon: 'gun', life: 1.2 }); screenFlash(0.16, '255,220,120'); }
          else if (e.type === 'men') { if (e.v) { /* 'gain' 이벤트가 숫자를 띄운다 */ } }
          else { float(e.x, 2.6, e.z, '+' + e.v, '#FFE38A', { icon: 'coin', life: 1.2 }); coinFly(e.x, 1.2, e.z, Math.ceil(e.v / 5)); }
          break;
        }
        case 'crateMiss':
          burst(e.x, 0.8, e.z, 12, FX_COL.wood, 3, 3);
          break;
        case 'cageOpen':
          burst(e.x, 1, e.z, 18, FX_COL.iron, 4.5, 4, 0.7);
          fx('puff', e.x, 0.8, e.z, 0.3);
          break;
        case 'cageMiss':
          burst(e.x, 1, e.z, 14, FX_COL.iron, 3, 3);
          fx('sadCaptive', e.x, 0, e.z, 1.3, { k: e.k || 'medic' });
          break;
        case 'spitFire': burst(e.x, 1.2, e.z, 4, FX_COL.purple, 1.2, 2); break;
        case 'pool':   // 오염 좀비가 터졌다: 보라 물방울이 솟는다(웅덩이는 drawGround가 그린다)
          burst(e.x, 0.6, e.z, 16, ELITE_COL.toxic.burst, 3, 4.5, 0.7);
          break;
        case 'poolHit':
          burst(e.x, 0.3, e.z, 14, ELITE_COL.toxic.burst, 3.5, 3);
          screenFlash(0.18, '190,120,255'); shake(0.25);
          break;
        case 'split':   // 분열 좀비가 갈라졌다: 주황 고리가 번진다
          burst(e.x, 0.6, e.z, 10, ELITE_COL.split.burst, 4, 3);
          ring(e.x, e.z, 0.3, 1.4, 0.3, ELITE_COL.split.ring);
          break;
        case 'spitHit':
          burst(e.x, 0.3, e.z, 14, ['#B9F25B', '#7FC93A', '#F4FFB0'], 3.5, 3);
          if (e.hit) { screenFlash(0.18, '170,255,90'); shake(0.25); }
          break;
        case 'slam':
          bossImpactT = time;
          burst((e.x0 + e.x1) / 2, 0.3, q.z + 3, 26, bfx().dust, 7, 4);
          ring((e.x0 + e.x1) / 2, q.z + 3, 0.5, 4.5, 0.4, bfx().ring, { thick: 2 });
          if (bfx().shard) for (let i = 0; i < 8; i++) part((e.x0 + e.x1) / 2 + (Math.random() - 0.5) * 3, 0.6, q.z + 3, (Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 2, 0.8, '#DDF3FF', 1, 9, bfx().shard);
          shake(0.6);
          if (e.hit) screenFlash(0.3, '232,56,79');
          break;
        case 'surge': surgeT = time; break;
        case 'clash': shake(0.3); break;
        case 'stomp':
          stompT = time;   // 짓밟기는 길 전체를 흔든다(SIM: 옆 위치와 상관없이 맞는다) — 보스 발에서 분대까지 땅이 번쩍인다
          shake(0.3);
          burst(q.x, 0.4, q.z + R * 0.6, 10, FX_COL.blood, 4, 3);
          if (s.boss) burst(s.boss.x, 0.2, s.boss.z, 10, bfx().dust, 4, 2);
          break;
        case 'boss':
          bossDeath = null;   // 무한모드: 앞 구간 보스의 쓰러지는 연출이 남아 새 보스를 가리지 않게
          bossIntroT = time;
          if (!cut) bossCut = { t: 0 };
          shake(0.4);
          break;
        case 'summon':
          roarT = time;
          if (s.boss) ring(s.boss.x, s.boss.z, 1, 7, 0.6, bfx().roar, { thick: 2 });
          shake(0.2);
          break;
        case 'enrage':
          enrageT = time;
          if (s.boss) burst(s.boss.x, 4, s.boss.z, 20, bfx().enrage, 3, 4, 0.9);
          screenFlash(0.15, '255,140,90');
          break;
        case 'bossDead':
          bossDeath = { t0: time, x: e.x, z: e.z, n: 0 };
          screenFlash(0.5, '255,255,255');
          shake(0.8);
          break;
        case 'pet':
          // 펫 효과가 터졌다: 펫이 통 튀고 반짝(크리티컬·멀리·넓게는 총구 쪽 금빛, 막아 주기는 초록 방패 고리, 기운 내는 별, 줍줍은 코인)
          petT = time;
          if (e.fx === 'block') ring(e.x, e.z, 0.3, 1.6, 0.3, '#7CE07A', { thick: 2 });
          else if (e.fx === 'cheer') part(e.x, 1.2, e.z, 0, 2.2, 0, 0.6, '#FFD84A', 1, 0, 'star');
          else if (e.fx === 'coin') burst(e.x, 2, e.z, 16, FX_COL.gold, 4, 4);
          else if (Math.random() < 0.5) fx('spark', q.x + (Math.random() - 0.5) * 2 * R, 1.3, q.z + R * 0.5, 0.09);
          break;
        case 'card': {
          // 무한모드 보스 뒤 3택 1에서 고른 카드: 분대 발밑에 금빛 고리와 작은 반짝임(글자는 DOM 알림). 특수병은 spGet·spUp이 숫자를 띄운다
          const cx = e.x ?? q.x, cz = e.z ?? q.z;
          const col = e.k === 'ammo' ? AMMO_COL[e.a] || '#FFFFFF' : e.k === 'men' ? '#6CC0FF' : '#FFD84A';
          ring(cx, cz, 0.3, R + 1.2, 0.45, col, { follow: 'sq', thick: 2 });
          burst(cx, 1.4, cz, 14, [col, '#FFFFFF', '#FFD84A'], 3, 4, 0.6);
          if (e.k === 'men') float(cx, 2.4, cz, '+' + (e.to - e.from), '#DDF3FF', { icon: 'men', out: PANEL.good.out, life: 1.2, vz: q.vz });
          else if (e.k === 'gun') float(cx, 2.6, cz, '+1', '#FFE38A', { icon: 'gun', life: 1.2, vz: q.vz });
          screenFlash(0.12, '255,220,120');
          break;
        }
        case 'segClear':   // 무한모드: 보스를 잡고 다음 구간으로(승리 색종이만 — 판은 이어진다)
        case 'win':
          for (let i = 0; i < 60; i++) part(q.x + (Math.random() - 0.5) * 8, 5 + Math.random() * 3, q.z + 5 + Math.random() * 8, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 2, 2.4, FX_COL.confetti[i % 5], 1, 2.5);
          break;
        case 'lose':
          screenFlash(0.45, '200,30,50');
          shake(0.5);
          break;
        case 'spGet':
          pendingGet.push({ k: e.k, x: e.x ?? q.x, z: e.z ?? q.z, t: time });
          float(e.x ?? q.x, 2.4, e.z ?? q.z, '+1', '#FFF09A', { icon: e.k, out: PANEL.unit.out, life: 1.1 });
          break;
        case 'spFull':
          float(e.x ?? q.x, 2.4, e.z ?? q.z, '+' + e.n, '#DDF3FF', { icon: 'men', out: PANEL.good.out, life: 1.1 });
          break;
        case 'spUp': {
          // 같은 특수병을 또 구했다(SIM 9): 'Lv2' + 그 특수병 자리에서 금빛 반짝임(별은 drawSpecial이 크게)
          spUpAt.set(e.id, time); spBig.set(e.id, 1);
          float(e.x ?? q.x, 2.4, e.z ?? q.z, 'Lv' + e.lv, '#FFF09A', { icon: e.k, out: PANEL.unit.out, life: 1.3 });
          const i = sp.findIndex((m) => m.id === e.id);
          if (i >= 0) { const pos = slotPos(q, i, R, q.x); burst(pos.x, 1.1, pos.z, 16, FX_COL.gold, 3, 4); ring(pos.x, pos.z, 0.2, 1.4, 0.35, '#FFD84A'); }
          screenFlash(0.12, '255,220,120');
          break;
        }
        case 'flip': {
          // 역전(SIM 9): 칸 번쩍임·'역전!' 글자(drawRow·drawFlips) + 파란 불꽃
          let slot = flips[0];
          for (const f of flips) { if (!f.on) { slot = f; break; } if (f.t > slot.t) slot = f; }
          slot.on = true; slot.t = 0; slot.x = e.x; slot.z = e.z; slot.row = e.row; slot.x0 = e.x0;
          burst(e.x, 1.6, e.z, 26, FX_COL.good, 4.5, 4.5, 0.7);
          ring(e.x, e.z, 0.4, 2.6, 0.35, '#6CC0FF', { thick: 2 });
          screenFlash(0.1, '108,192,255');
          break;
        }
        case 'capped':
          float(e.x, 3.6, e.z, 'MAX', '#FFF09A', { out: PANEL.unit.out, life: 0.9, rise: 1 });
          burst(e.x, 2.6, e.z, 14, FX_COL.gold, 3, 3);
          break;
        case 'spLose': {
          const i = Math.min(2, sp.length);
          const pos = slotPos(q, i, R, q.x);
          if (e.cause === 'escort') fx('spRun', pos.x, 0, pos.z, 1.5, { k: e.k, vx: pos.x < q.x ? -2.2 : 2.2, vz: -3 });
          else { fx('spHit', pos.x, 0, pos.z, 0.75, { k: e.k }); burst(pos.x, 0.8, pos.z, 6, FX_COL.gold, 2, 3); }
          break;
        }
        case 'snipe': {
          snipeT = time;
          let x0 = q.x, z0 = q.z, y0 = 1.1;
          if (e.src === 'hero') { x0 = q.x + 0.22; z0 = heroZ(q, R); y0 = 1.25; }   // 나비 총구(스킬 장: 머리 오른쪽 위 총열 끝)
          let lv = 1, big = 0;
          if (e.src !== 'hero') {
            const i = sp.findIndex((m) => m.k === 'sniper');
            if (i >= 0) { const p = slotPos(q, i, R, q.x); x0 = p.x; z0 = p.z; y0 = 1.2; lv = sp[i].lv || 1; if (spBig.get(sp[i].id)) { spBig.delete(sp[i].id); big = 1; } }
          }
          // 저격수 레벨: Lv1 가는 선 → Lv2 굵은 선(흰 심)·착탄 고리 → Lv3 레일 빔(청록, 오래 남는다)·관통 파편. 나비가 짝이면 나비 색이 섞인다
          const pair = e.src !== 'hero' && s.hero && s.hero.id === 'nabi';
          if (e.src === 'hero') tracer(x0, y0, z0, e.x1, 0.7, e.z1, '#7FF0E2', 0.1);
          else if (lv <= 1) tracer(x0, y0, z0, e.x1, 0.7, e.z1, pair ? '#C8F5C8' : '#FFF4B0', 0.08, 1 + big);
          else if (lv === 2) tracer(x0, y0, z0, e.x1, 0.7, e.z1, pair ? '#A6F0D2' : '#FFD84A', 0.12, 2 + big, '#FFFFFF');
          else tracer(x0, y0, z0, e.x1, 0.7, e.z1, '#7FE8FF', 0.18, 3, '#FFFFFF');
          fx('glint', x0, y0 + 0.1, z0, lv >= 3 ? 0.2 : 0.12);
          if (lv >= 3) fx('glint', x0, y0 + 0.5, z0, 0.14);
          fx('spark', e.x1, 0.7, e.z1, 0.1);
          if (lv >= 2 && e.src !== 'hero') ring(e.x1, e.z1, 0.1, lv >= 3 ? 0.9 : 0.6, 0.2, lv >= 3 ? '#7FE8FF' : '#FFF4B0');
          if (lv >= 3 && e.src !== 'hero') for (let k = 0; k < 6; k++) part(e.x1, 0.7, e.z1, (Math.random() - 0.5) * 1.5, 0.8 + Math.random() * 1.5, 6 + Math.random() * 6, 0.35, k & 1 ? '#DDF3FF' : '#7FE8FF', 1, 6);
          break;
        }
        case 'rocket': {
          rocketT = time;
          const i = sp.findIndex((m) => m.k === 'rocket');
          const p = i >= 0 ? slotPos(q, i, R, q.x) : { x: q.x, z: q.z };
          if (i >= 0 && (sp[i].lv || 1) >= 2) for (let k = 0; k < 5; k++) part(p.x + (Math.random() - 0.5) * 0.3, 0.9, p.z - 0.3, (Math.random() - 0.5) * 1.2, 0.5 + Math.random(), -2 - Math.random() * 2, 0.3, k & 1 ? '#FFB347' : '#FF7A3C', 1, 0);
          for (let k = 0; k < 6; k++) part(p.x + (Math.random() - 0.5) * 0.4, 0.9, p.z - 0.3, (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), -1.5 - Math.random() * 1.5, 0.5, '#C9CED6', 1, 0, 'smoke');
          break;
        }
        case 'boom': {
          // 폭발 고리는 실제 반경(e.r)까지만 — 로켓병 레벨(반경 2.2 · 2.6 · 3.0m)이 높을수록 파편이 많고, Lv3은 충격파 고리 하나 더 + 바닥 그을음
          const br = e.r || 2.2, blv = br >= 2.9 ? 3 : br >= 2.5 ? 2 : 1;
          fx('boom', e.x, 0.8, e.z, blv >= 3 ? 0.4 : 0.32);
          ring(e.x, e.z, 0.3, br, 0.35, '#FFF4B0', { thick: 2 });
          burst(e.x, 0.8, e.z, blv === 1 ? 16 : blv === 2 ? 24 : 30, FX_COL.boom, blv >= 3 ? 6 : 5, 4, 0.6);
          if (blv >= 3) {
            ring(e.x, e.z, br * 0.45, br, 0.5, '#FFFFFF');
            let c = scorches[0];
            for (const k of scorches) { if (!k.on) { c = k; break; } if (k.t > c.t) c = k; }
            c.on = true; c.x = e.x; c.z = e.z; c.r = br * 0.55; c.t = 0;
          }
          shake(blv >= 3 ? 0.2 : 0.12);
          break;
        }
        case 'heal': {
          // 회복은 틱마다 조금씩 오므로 모아서 0.5초에 한 번만 보여 준다
          healSum += e.n;
          if (time - healShown < 0.5) break;
          healShown = time;
          healT = time;
          const m = Math.min(6, Math.max(2, healSum));
          for (let i = 0; i < m; i++) part(q.x + (Math.random() - 0.5) * R * 2, 0.6 + Math.random(), q.z + (Math.random() - 0.5) * R, 0, 2 + Math.random() * 1.5, 0, 0.8, '#7CE07A', 1, 0, 'plus');
          // 의무병 Lv2+: 의무병 자리에서 초록 방울이 포물선으로 분대에 날아든다. Lv3: 분대 발밑에 초록 고리가 한 번 번진다
          const mi = sp.findIndex((u) => u.k === 'medic');
          const mlv = mi >= 0 ? sp[mi].lv || 1 : 0;
          if (mlv >= 2) {
            const mp = slotPos(q, mi, R, q.x), T = 0.4;
            for (let i = 0; i < (mlv >= 3 ? 5 : 3); i++) {
              const tx = q.x + (Math.random() - 0.5) * R * 1.6, tz = q.z + (Math.random() - 0.3) * R;
              part(mp.x, 1.2, mp.z, (tx - mp.x) / T, 9 * T * 0.5 + 0.6, (tz - mp.z) / T + (q.vz || 0), T, '#7CE07A', 1, 9, 'plus');
            }
            if (mlv >= 3) ring(q.x, q.z, 0.4, R + 0.6, 0.45, '#7CE07A', { follow: 'sq' });
          }
          float(q.x + R + 0.5, 1.8, q.z, '+' + healSum, '#C9F5B8', { out: '#1E5A2E', life: 0.8, vz: q.vz });
          healSum = 0;
          break;
        }
        case 'pierce': if (Math.random() < 0.5) fx('spark', e.x, 0.7, e.z1, 0.07); break;
        case 'splash':
          // 작렬탄: 실제 둘레(e.r)만큼의 작은 고리(초당 12번까지만 그린다)
          if (time - splashT > 0.08) { splashT = time; ring(e.x, e.z, 0.15, e.r, 0.18, '#FFB347'); burst(e.x, 0.6, e.z, 3, FX_COL.boom, 2.5, 2.5, 0.3); }
          break;
        case 'heroReady': readyT = time; break;
        case 'heroCast': {
          castT = time; castId = e.id;
          const arena = !!s.boss;
          if (!castRun || (arena && !castArena)) { cut = { t: 0, id: e.id }; castRun = true; if (arena) castArena = true; }
          const hz = heroZ(q, R);
          if (e.id === 'bori') for (let i = 0; i < 10; i++) part(q.x + (Math.random() - 0.5) * 2 * R, 0.8 + Math.random(), q.z + (Math.random() - 0.5) * R, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, 0, 1.1, '#FF6FA0', 1, 0, 'heart');
          if (e.id === 'mungchi') ring(q.x, hz, 0.5, 4, 0.5, '#FFD84A', { follow: true, thick: 2 });
          if (e.id === 'nabi') fx('glint', q.x + 0.22, 1.3, hz, 0.25);   // 총구
          break;
        }
        default:
      }
    }
  }

  /* ---------- 그리기 도우미(모두 정수 픽셀, 경로 채우기 없이 줄 단위) ---------- */
  function trap(axL, axR, ay, bxL, bxR, by) {   // a = 아랫변, b = 윗변
    const y0 = Math.round(by), y1 = Math.round(ay);
    for (let y = y0; y < y1; y++) {
      const t = y1 === y0 ? 0 : (y + 0.5 - by) / (ay - by);
      const l = Math.round(bxL + (axL - bxL) * t), r = Math.round(bxR + (axR - bxR) * t);
      if (r > l) ctx.fillRect(l, y, r - l, 1);
    }
  }
  function trapLine(axL, axR, ay, bxL, bxR, by, w = 1) {
    const y0 = Math.round(by), y1 = Math.round(ay);
    ctx.fillRect(Math.round(bxL), y0, Math.max(1, Math.round(bxR) - Math.round(bxL)), w);
    ctx.fillRect(Math.round(axL), y1 - w, Math.max(1, Math.round(axR) - Math.round(axL)), w);
    for (let y = y0; y < y1; y++) {
      const t = (y + 0.5 - by) / Math.max(0.001, ay - by);
      ctx.fillRect(Math.round(bxL + (axL - bxL) * t), y, w, 1);
      ctx.fillRect(Math.round(bxR + (axR - bxR) * t) - w, y, w, 1);
    }
  }
  function ellipse(cx, cy, rx, ry) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let y = Math.round(-ry); y <= Math.round(ry); y++) {
      const v = (y + 0.5) / ry;
      if (v * v > 1) continue;
      const hw = rx * Math.sqrt(1 - v * v);
      const l = Math.round(cx - hw), r = Math.round(cx + hw);
      if (r > l) ctx.fillRect(l, cy + y, r - l, 1);
    }
  }
  function ellRing(cx, cy, rx, ry, th = 1) {
    cx = Math.round(cx); cy = Math.round(cy);
    const iry = Math.max(0.1, ry - th), irx = Math.max(0.1, rx - th);
    for (let y = Math.round(-ry); y <= Math.round(ry); y++) {
      const v = (y + 0.5) / ry;
      if (v * v > 1) continue;
      const hw = rx * Math.sqrt(1 - v * v);
      const vi = (y + 0.5) / iry;
      const ihw = vi * vi < 1 ? irx * Math.sqrt(1 - vi * vi) : 0;
      const l = Math.round(cx - hw), il = Math.round(cx - ihw);
      const r = Math.round(cx + hw), ir = Math.round(cx + ihw);
      if (ihw <= 0) { if (r > l) ctx.fillRect(l, cy + y, r - l, 1); continue; }
      if (il > l) ctx.fillRect(l, cy + y, il - l, 1);
      if (r > ir) ctx.fillRect(ir, cy + y, r - ir, 1);
    }
  }
  function pline(x0, y0, x1, y1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    // 같은 줄에서 이어지는 픽셀은 한 번에
    let rx = x0, ry = y0, rl = 1;
    for (let i = 1; i <= n; i++) {
      const x = Math.round(x0 + (dx * i) / n), y = Math.round(y0 + (dy * i) / n);
      if (y === ry && x === rx + rl) { rl++; continue; }
      if (y === ry && x === rx - 1) { rx = x; rl++; continue; }
      ctx.fillRect(rx, ry, rl, 1);
      rx = x; ry = y; rl = 1;
    }
    ctx.fillRect(rx, ry, rl, 1);
  }
  const face = { ax: 0, ay: 0, bx: 0, by: 0, cx: 0, cy: 0, dx: 0, dy: 0, s: 0, d: 0 };
  function vface(x0, x1, y0, y1, z) {
    if (!project(view, x0, y0, z)) return false;
    face.ax = P.x; face.ay = P.y; face.s = P.s; face.d = P.d;
    project(view, x1, y0, z); face.bx = P.x; face.by = P.y;
    project(view, x1, y1, z); face.cx = P.x; face.cy = P.y;
    project(view, x0, y1, z); face.dx = P.x; face.dy = P.y;
    return true;
  }
  function groundQuad(x0, x1, z0, z1, y = 0) {
    z0 = Math.max(z0, view.camZ + 1.5);
    if (z1 <= z0) return false;
    if (!project(view, x0, y, z0)) return false;
    const aL = P.x, ay = P.y;
    project(view, x1, y, z0);
    const aR = P.x;
    if (!project(view, x0, y, z1)) return false;
    const bL = P.x, by = P.y;
    project(view, x1, y, z1);
    trap(aL, aR, ay, bL, P.x, by);
    return true;
  }
  /* 먼 곳에서 나타날 때는 단계적으로(안개 끝 far에 맞춘다 — far의 86·92·98%). 기둥·판·숫자에 같은 값(R6) */
  function fadeIn(d) { const f = view.far; return d > f * 0.98 ? 0 : d > f * 0.92 ? 0.34 : d > f * 0.86 ? 0.67 : 1; }
  function lodStep(map, key, want, steps) {
    const prev = map.get(key);
    const st = pickStep(Math.min(1, want), prev, steps);
    if (st !== prev) map.set(key, st);
    return st;
  }
  /* 시각 time 기준 hz 박자가 이번 프레임에 몇 번 지났나(프레임 수가 아니라 시간으로 세는 생성 빈도, T8) */
  function beats(hz) { return Math.floor(time * hz) - Math.floor(prevTime * hz); }
  function shadowAt(x, z, rx, col) {
    if (!project(view, x, 0, z)) return;
    ctx.fillStyle = col;
    ellipse(P.x, P.y, Math.max(2, rx * P.s), Math.max(1, rx * P.s * 0.36));
  }
  function drawIconText(icon, text, cx, cy, fill, out, scale = 1) {
    const ic = icon ? atlas.icon(icon) : null;
    const tw = text ? font.measure(text, 'big', scale) : 0;
    const w = (ic ? ic.w + 1 : 0) + tw;
    let x = Math.round(cx - w / 2);
    if (ic) { atlas.blit(ctx, ic, x, Math.round(cy - ic.h / 2)); x += ic.w + 1; }
    if (text) font.draw(ctx, text, x + tw / 2, cy, { fill, out, scale });
  }

  /* ---------- 배경 소품 ---------- */
  function scenery(bio) {
    const step = SCENERY_STEP;
    const props = bio.props;
    for (let z = Math.floor((view.camZ + 4) / step) * step; z < view.camZ + view.zFar; z += step) {
      for (let side = -1; side <= 1; side += 2) {
        const h = sceneryHash(z, side), name = props[h % props.length];
        // 그 지역 소품을 아직 굽지 않았으면 그 자리는 비워 둔다(그리는 중에는 굽지 않는다 — prepBiome이 쉬는 틈에 굽는다)
        if (atlas.has(name)) push(sceneryZ(h, z), 10, name, z * 2 + (side > 0 ? 1 : 0), sceneryX(h, side));
      }
    }
  }
  function drawScenery(kind, key, x, z) {
    if (!project(view, x, 0, z)) return;
    const a = fadeIn(P.d);
    if (!a) return;
    const sh = atlas.sheet(kind);
    const r0 = sh.frames[0][0];
    const want = (P.s * (WORLD_H[kind] || 1)) / (r0.h - 2);
    if (want < 0.3) return;
    const st = lodStep(lodScen, key, want, STEPS3);
    if (a < 1) ctx.globalAlpha = a;
    atlas.draw(ctx, kind, 0, P.x, P.y, st);
    if (a < 1) ctx.globalAlpha = 1;
  }

  /* ---------- 게이트 ---------- */
  function cellStyle(c) {
    if (c.op === 'unit') return PANEL.unit;
    const g = cellGood(c);
    return g > 0 ? PANEL.good : g < 0 ? PANEL.bad : PANEL.zero;
  }
  function drawRow(s, row) {
    const q = s.squad;
    const dz = row.z - q.z;
    const near = dz < 20 && dz > 0;
    const idx = pickCell(row, q.x);
    const H = 2.7;
    const c0 = row.cells[0], cN = row.cells[row.cells.length - 1];
    if (!vface(c0.x0 - 0.17, cN.x1 + 0.17, H, H + 0.4, row.z)) return;
    const a = fadeIn(face.d);
    if (!a) return;
    const beamY = face.dy;   // 윗 띠의 위 끝(빨간 칸의 MAX 표가 그 위에 붙는다)
    ctx.globalAlpha = a;
    // 윗 띠 + 깜빡이는 전구(쫓아가는 무늬, 번쩍임 아님)
    ctx.fillStyle = '#3A3550';
    trap(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy);
    const barH = face.ay - face.dy;
    if (barH >= 2) {
      const n = Math.max(2, Math.floor((face.bx - face.ax) / 4));
      const yb = Math.round((face.ay + face.dy) / 2) - 1;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = ((i + ((time * 5) | 0)) % 3) ? '#8A6A3A' : '#FFE27A';
        ctx.fillRect(Math.round(face.ax + 2 + (i * (face.bx - face.ax - 4)) / (n - 1)), yb, 1, 1);
      }
    }
    // 기둥
    ctx.fillStyle = '#3A3550';
    const post = (px) => { if (vface(px - 0.13, px + 0.13, 0, H + 0.2, row.z)) trap(face.ax, Math.max(face.bx, face.ax + 1), face.ay, face.dx, Math.max(face.cx, face.dx + 1), face.dy); };
    post(c0.x0);
    for (const c of row.cells) post(c.x1);
    const bump = time - (tickAt.get(row.id) ?? -9) < 0.06 ? 1 : 0;
    for (let i = 0; i < row.cells.length; i++) {
      const c = row.cells[i];
      const st = cellStyle(c);
      const unit = st === PANEL.unit;
      const sel = near && i === idx;
      const dim = near && i !== idx;
      if (!vface(c.x0 + 0.15, c.x1 - 0.15, 0.12, H, row.z)) continue;
      const pumped = s.t - c.hitT < 0.15;
      // 금색(특수병) 판은 거의 불투명하게 — 아스팔트가 비쳐 탁해지지 않게(V10)
      const farA = dz > 45 ? 0.9 : unit ? 0.92 : 0.55;
      const pa = sel ? (unit ? 0.96 : 0.8) : dim ? (unit ? 0.72 : 0.38) : pumped ? Math.min(0.96, farA + 0.15) : farA;
      ctx.fillStyle = st.hex;
      ctx.globalAlpha = a * pa;
      trap(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy);
      const pw = face.bx - face.ax, ph = face.ay - face.dy;
      if (unit && ph > 6) {
        // 위쪽 밝은 띠(세로 그라데이션 느낌) + 가끔 지나가는 반짝임
        const t = 0.42;
        ctx.fillStyle = st.hi;
        ctx.globalAlpha = a * pa * 0.7;
        trap(face.dx + (face.ax - face.dx) * t, face.cx + (face.bx - face.cx) * t, face.dy + (face.ay - face.dy) * t, face.dx, face.cx, face.dy);
        const u = (time * 0.8 + c.x0 * 0.13) % 1.6;
        if (u < 1 && pw > 10 && ph > 12) {
          const sx = Math.round(face.dx + 2 + u * (face.cx - face.dx - 4)), sy = Math.round(face.dy + 3);
          ctx.globalAlpha = a;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(sx - 1, sy, 3, 1); ctx.fillRect(sx, sy - 1, 1, 3);
        }
      }
      ctx.globalAlpha = a;
      if (st === PANEL.bad) {
        if (mtx) { mtx.e = Math.round(face.dx); mtx.f = Math.round(face.dy); stripe.setTransform(mtx); }
        ctx.fillStyle = stripe;
        trap(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy);
      }
      if (pw > 14 && ph > 10) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(Math.round(face.dx + 2), Math.round(face.dy + 2), Math.max(2, (pw * 0.22) | 0), 1); }
      // 역전 번쩍임: 방금 0을 넘어 파랑이 된 칸이 하얗게 빛났다가 가라앉는다
      const fl = flipOf(row.id, c);
      if (fl && fl.t < FLIP_FLASH) {
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = a * 0.85 * (1 - fl.t / FLIP_FLASH);
        trap(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy);
        ctx.globalAlpha = a;
      }
      ctx.fillStyle = sel ? '#FFFFFF' : pumped ? '#FFFFFF' : st.line;
      trapLine(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy, sel ? 2 : 1);
      const mx = (face.ax + face.bx) / 2, my = (face.ay + face.dy) / 2 - bump;
      cellLabel(c, st, mx, my, pw, ph, sel);
      // 파고들기(SIM 9)의 'MAX+끝' 표는 그리지 않는다(사용자 판단: 너무 노골적 — 어느 빨간 칸이 빨리 오르는지는 쏴 보고 알아낸다). 규칙은 그대로
      void maxTag; void beamY;
      if (preview && c.op && dz < 40 && dz > 0 && ph > 16) {
        const r = Math.max(0, applyOp(q.n, c.op, c.v));
        const t = '=' + r;
        if (font.measure(t, 'small') <= pw - 2) font.draw(ctx, t, mx, face.ay + 5, { size: 'small', fill: '#FFFFFF', out: st.out });
      }
    }
    ctx.globalAlpha = 1;
  }
  /* 빨간 칸의 끝 표: 칸 폭(기둥까지)에 들어갈 때만, 윗 띠 위에 칸 색 테두리의 작은 표로. 다 오르면 금빛 'MAX' */
  function maxText(cap) {
    let t = maxTexts.get(cap);
    if (t === undefined) {
      const n = '+' + (cap >= 1000 ? Math.floor(cap / 1000) + 'k' : cap);
      t = ['MAX' + n, n];   // 한 줄 'MAX+45', 두 줄일 때 아랫줄 '+45'
      if (maxTexts.size > 500) maxTexts.clear();
      maxTexts.set(cap, t);
    }
    return t;
  }
  function maxTag(c, st, mx, y, pw) {
    const done = c.v >= c.cap;
    const tt = done ? null : maxText(c.cap);
    let t = done ? 'MAX' : tt[0];
    let t2 = null;
    // 큰 글꼴이 들어가면 큰 글꼴(작은 글꼴의 M은 H와 헷갈린다), 아니면 작은 글꼴, 그것도 안 들어가면 작은 글꼴 두 줄('MAX' / '+45'),
    // 그것도 안 들어가면(먼 줄) 그리지 않는다. 표(글자 + 4px)는 칸 폭 안에 — 세 칸 줄에 빨간 칸이 둘이면 표가 나란히 서도 붙지 않게
    let size = 'big';
    let w = font.measure(t, 'big');
    if (w + 4 > pw) { size = 'small'; w = font.measure(t, 'small'); }
    if (w + 4 > pw && tt) { t = 'MAX'; t2 = tt[1]; w = Math.max(font.measure(t, 'small'), font.measure(t2, 'small')); }
    if (w + 4 > pw || w < 1) return;
    const h = font.height(size);
    const hh = t2 ? 2 * h + 1 : h;
    const x0 = Math.round(mx - w / 2) - 1, y0 = Math.round(y) - hh - 3;
    ctx.fillStyle = done ? '#FFD84A' : st.line;
    ctx.fillRect(x0 - 1, y0 - 1, w + 4, hh + 2);
    ctx.fillStyle = done ? PANEL.unit.out : st.out;
    ctx.fillRect(x0, y0, w + 2, hh);
    tagOpt.size = size;
    tagOpt.fill = done ? '#FFF09A' : '#FFFFFF';
    tagOpt.out = done ? PANEL.unit.out : st.out;
    font.draw(ctx, t, mx, y0 + h / 2, tagOpt);
    if (t2) font.draw(ctx, t2, mx, y0 + h + 1 + h / 2, tagOpt);
  }
  const tagOpt = { size: 'small', scale: 1, fill: '#FFFFFF', out: OUT };   // 매 프레임 새 객체를 만들지 않게
  /* 이 칸에 걸린 역전 효과(없으면 null) */
  function flipOf(rowId, c) {
    for (const f of flips) if (f.on && f.row === rowId && f.x0 === c.x0) return f;
    return null;
  }
  /* '역전!' 그림 글자: 뒤집힌 칸 윗 띠(그 위 MAX 표까지) 위에서 두 배로 튀어나왔다가(FLIP_POP초) 제 크기로 떠오르며 사라진다 */
  const FLIP_POP = 0.3;
  function drawFlips(dt, show) {
    for (const f of flips) {
      if (!f.on) continue;
      f.t += dt;
      if (f.t >= FLIP_T) { f.on = false; continue; }
      if (!show || !project(view, f.x, 3.1, f.z)) continue;   // 윗 띠 위 끝(H + 0.4)
      const r = atlas.get('flipWord', 0);
      const sc = f.t < 0.04 || f.t >= FLIP_POP ? 1 : 2;
      const by = P.y - 16 - Math.round(12 * f.t);
      ctx.globalAlpha = f.t > FLIP_T - 0.25 ? (FLIP_T - f.t) / 0.25 : 1;
      ctx.drawImage(r.img, r.sx, r.sy, r.w, r.h, Math.round(P.x - (r.w * sc) / 2), Math.round(by - r.h * sc), r.w * sc, r.h * sc);
      ctx.globalAlpha = 1;
    }
  }
  /* 특수병 레벨 별: 머리 위에 Lv만큼(Lv2 둘, Lv3 셋). 방금 오른 별은 잠깐 크게, Lv3은 가끔 반짝인다 */
  function lvStars(x, y, lv, fresh) {
    for (let i = 0; i < lv; i++) {
      const sx = Math.round(x + (i - (lv - 1) / 2) * 5), sy = Math.round(y);
      const big = fresh && ((f60 >> 2) & 1);
      ctx.fillStyle = OUT;
      ctx.fillRect(sx - 2, sy - 1, 5, 3); ctx.fillRect(sx - 1, sy - 2, 3, 5);
      if (big) { ctx.fillRect(sx - 3, sy, 7, 1); ctx.fillRect(sx, sy - 3, 1, 7); }
      ctx.fillStyle = '#FFD84A';
      ctx.fillRect(sx - 1, sy, 3, 1); ctx.fillRect(sx, sy - 1, 1, 3);
      if (big) { ctx.fillRect(sx - 2, sy, 5, 1); ctx.fillRect(sx, sy - 2, 1, 5); }
      ctx.fillStyle = lv >= 3 && ((f60 + i * 13) % 40) < 6 ? '#FFFFFF' : '#FFF4B0';
      ctx.fillRect(sx, sy, 1, 1);
    }
  }
  /* 칸 글자 후보(원래 → '+' 뺀 것 → 'k'), 값마다 한 번만 만든다 */
  function labelTexts(c) {
    const m = labelCache[c.op] || labelCache.add;
    let t = m.get(c.v);
    if (t === undefined) {
      t = compactTexts(c, []);
      if (m.size > 3000) m.clear();
      m.set(c.v, t);
    }
    return t;
  }
  function markSel(sel, x0, y0, x1, y1) {
    if (!sel) return;
    selLbl.on = true; selLbl.x0 = x0; selLbl.y0 = y0; selLbl.x1 = x1; selLbl.y1 = y1;
  }
  /* 칸 숫자: 판 폭에 맞는 가장 큰 글꼴. 좁으면 차례로 '+' 빼기 → 'k' → 작은 글꼴 → 판 전체 폭 → 외곽선 없는 촘촘한 글꼴,
     그래도 안 되면 ▲/▼만(먼 3칸 게이트가 빈 판으로 보이지 않게, V3·T3). 옆 칸 숫자와는 겹치지 않는다(R5) */
  function cellLabel(c, st, mx, my, pw, ph, sel) {
    const texts = labelTexts(c);
    const txt = texts[0];
    const room = pw - 4;
    if (c.op === 'unit') {
      const ic = atlas.icon(c.k || 'medic');
      const fw = ic.w + 2;
      const tw1 = font.measure(txt, 'big', 1), tw2 = font.measure(txt, 'big', 2);
      if (ph >= 38 && room >= 44 && room >= Math.max(fw, tw2)) {
        unitIcon(ic, mx, my - 10);
        font.draw(ctx, txt, mx, my + 9, { scale: 2, fill: '#FFFFFF', out: st.out });
        markSel(sel, mx - tw2 / 2, my - 10 - ic.h / 2 - 2, mx + tw2 / 2, my + 18);
      } else if (room >= 44 && room >= fw + tw2 + 2 && ph >= 22) {
        unitIcon(ic, mx - (tw2 + 2) / 2, my);
        font.draw(ctx, txt, mx + (fw + 2) / 2, my, { scale: 2, fill: '#FFFFFF', out: st.out });
        markSel(sel, mx - (fw + tw2 + 2) / 2, my - 9, mx + (fw + tw2 + 2) / 2, my + 9);
      } else if (ph >= 30 && room >= Math.max(fw, tw1)) {
        unitIcon(ic, mx, my - 6);
        font.draw(ctx, txt, mx, my + 8, { fill: '#FFFFFF', out: st.out });
        markSel(sel, mx - Math.max(fw, tw1) / 2, my - 6 - ic.h / 2 - 2, mx + Math.max(fw, tw1) / 2, my + 13);
      } else if (room >= fw + tw1 + 1 && ph >= 13) {
        unitIcon(ic, mx - (tw1 + 1) / 2, my);
        font.draw(ctx, txt, mx + (fw + 1) / 2, my, { fill: '#FFFFFF', out: st.out });
        markSel(sel, mx - (fw + tw1 + 1) / 2, my - 7, mx + (fw + tw1 + 1) / 2, my + 7);
      } else if (room >= fw + font.measure(txt, 'small') + 1 && ph >= 13) {
        // 아이콘 + 작은 숫자(먼 세 갈래 줄에서도 '+N'이 보이게)
        const sw = font.measure(txt, 'small');
        unitIcon(ic, mx - (sw + 1) / 2, my);
        font.draw(ctx, txt, mx + (fw + 1) / 2, my, { size: 'small', fill: '#FFFFFF', out: st.out });
        markSel(sel, mx - (fw + sw + 1) / 2, my - 7, mx + (fw + sw + 1) / 2, my + 7);
      } else if (tw1 <= room && ph >= 11) font.draw(ctx, txt, mx, my, { fill: '#FFFFFF', out: st.out });   // 금색 판이 이미 '특수병'이라 숫자가 먼저
      else if (font.measure(txt, 'small') <= room + 2 && ph >= 7) font.draw(ctx, txt, mx, my, { size: 'small', fill: '#FFFFFF', out: st.out });
      else if (room >= fw && ph >= 13) unitIcon(ic, mx, my);
      // 좁은 금색 판: 흰 글자 + 갈색 외곽선, 더 좁으면 외곽선 없는 갈색 글자(노랑 위 노랑은 안 읽힌다)
      else if (font.measure(txt, 'small') <= pw + 2 && ph >= 7) font.draw(ctx, txt, mx, my, { size: 'small', fill: '#FFFFFF', out: st.out });
      else if (font.measure(txt, 'tight') <= pw && ph >= 5) font.draw(ctx, txt, mx, my, { size: 'tight', fill: st.out });
      else if (pw >= 4) { ctx.fillStyle = st.out; ctx.fillRect(Math.round(mx) - 1, Math.round(my), 3, 1); ctx.fillRect(Math.round(mx), Math.round(my) - 1, 1, 3); }
      return;
    }
    let size = '', scale = 1, t = txt;
    if (room >= 44 && ph >= 26 && font.measure(txt, 'big', 2) <= room) { size = 'big'; scale = 2; }
    // '+'는 큰 글꼴로 '+N' 전체가 들어갈 때만 붙인다(그보다 좁으면 'N'·'Nk' — 파란 판과 ▲가 이미 '더하기').
    // 다가오는 동안 'N' → '+N'으로 한 번만 바뀌고, '+'가 붙었다 떨어졌다 하지 않는다
    const noPlus = c.op === 'add' && txt[0] === '+';
    if (!size && room >= 15) {
      for (let j = 0; j < texts.length && !size; j++) {
        if (noPlus && texts[j][0] === '+') {
          if (j === 0 && font.measure(txt, 'big', 1) <= room) { size = 'big'; t = txt; }
          continue;
        }
        if (font.measure(texts[j], 'big', 1) <= room) { size = 'big'; t = texts[j]; }
        else if (font.measure(texts[j], 'slim', 1) <= room) { size = 'slim'; t = texts[j]; }   // 가는 기호로 한 번 더
      }
    }
    if (!size && ph >= 7) {
      for (let j = 0; j < texts.length && !size; j++) if (!(noPlus && texts[j][0] === '+') && font.measure(texts[j], 'small') <= room + 2) { size = 'small'; t = texts[j]; }
      // 판 전체 폭(기둥까지)을 쓴다
      for (let j = 0; j < texts.length && !size; j++) if (!(noPlus && texts[j][0] === '+') && font.measure(texts[j], 'small') <= pw + 2) { size = 'small'; t = texts[j]; }
    }
    if (!size && ph >= 5) for (let j = 0; j < texts.length && !size; j++) if (!(noPlus && texts[j][0] === '+') && font.measure(texts[j], 'tight') <= pw) { size = 'tight'; t = texts[j]; }
    if (size) {
      font.draw(ctx, t, mx, my, { size, scale, fill: '#FFFFFF', out: st.out });
      const lw = font.measure(t, size, scale), lh = font.height(size, scale);
      const arw = st.arrow && (size === 'big' || size === 'slim') && ph > 22;
      if (arw) arrow(mx, my - (scale === 2 ? 14 : 9), st === PANEL.good);
      markSel(sel, mx - lw / 2, my - lh / 2 - (arw ? 6 : 0), mx + lw / 2, my + lh / 2);
      return;
    }
    // 마지막 수단: 판이 비지 않게 ▲/▼(회색 판은 '=')
    if (st.arrow && pw >= 4) arrowMark(mx, my, st === PANEL.good, pw >= 7);
    else if (pw >= 4) font.draw(ctx, '=', mx, my, { size: 'tight', fill: '#FFFFFF' });
  }
  /* 외곽선 두른 5×3 화살표(아주 좁으면 외곽선 없이) */
  function arrowMark(x, y, up, outlined) {
    const ax = Math.round(x), ay = Math.round(y) - 1;
    if (outlined) {
      ctx.fillStyle = OUT;
      if (up) { ctx.fillRect(ax - 1, ay - 1, 3, 1); ctx.fillRect(ax - 2, ay, 5, 1); ctx.fillRect(ax - 3, ay + 1, 7, 3); }
      else { ctx.fillRect(ax - 3, ay - 1, 7, 3); ctx.fillRect(ax - 2, ay + 2, 5, 1); ctx.fillRect(ax - 1, ay + 3, 3, 1); }
    }
    arrow(ax, ay, up);
  }
  function unitIcon(ic, cx, cy) {
    const x = Math.round(cx - ic.w / 2), y = Math.round(cy - ic.h / 2);
    ctx.fillStyle = OUT; ctx.fillRect(x - 2, y - 2, ic.w + 4, ic.h + 4);
    ctx.fillStyle = '#FFD84A'; ctx.fillRect(x - 1, y - 1, ic.w + 2, ic.h + 2);
    ctx.fillStyle = '#FFF4D0'; ctx.fillRect(x, y, ic.w, ic.h);
    atlas.blit(ctx, ic, x, y);
  }
  function arrow(x, y, up) {
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = up ? '#DDF3FF' : '#FFD0C4';
    if (up) { ctx.fillRect(x, y, 1, 1); ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillRect(x - 2, y + 2, 5, 1); }
    else { ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillRect(x, y + 2, 1, 1); }
  }

  /* ---------- 벽·상자·철창 ---------- */
  function boxFaces(p, H, depth = 0.35) {
    const z0 = p.z - depth, z1 = p.z + depth;
    if (!project(view, p.x0, H, z1)) return null;
    const tL = P.x, ty = P.y;
    project(view, p.x1, H, z1);
    const tR = P.x;
    if (!vface(p.x0, p.x1, 0, H, z0)) return null;
    return { tL, tR, ty };
  }
  function propSparks(p, key) {
    const prev = hitSeen.get(key);
    if (prev !== p.hitT) {
      hitSeen.set(key, p.hitT);
      if (prev !== undefined && Math.random() < 0.5) fx('spark', p.x0 + Math.random() * (p.x1 - p.x0), 0.5 + Math.random() * 0.9, p.z - 0.4, 0.07);
    }
  }
  function drawWall(s, p) {
    const top = boxFaces(p, 1.45);
    if (!top) return;
    const a = fadeIn(face.d);
    if (!a) return;
    ctx.globalAlpha = a;
    propSparks(p, p.id);
    const hit = s.t - p.hitT < 0.1;
    ctx.fillStyle = '#C9CED6';
    trap(face.dx, face.cx, face.dy, top.tL, top.tR, top.ty);
    ctx.fillStyle = hit ? '#B7BEC9' : '#9AA2B0';
    trap(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy);
    const w = face.bx - face.ax, h = face.ay - face.dy;
    if (mtx) { mtx.e = Math.round(face.ax); mtx.f = 0; hazard.setTransform(mtx); }
    ctx.fillStyle = hazard;
    const by = face.ay - h * 0.6, bh = Math.max(2, Math.round(h * 0.22));
    ctx.fillRect(Math.round(face.ax), Math.round(by - bh), Math.round(w), bh);
    // 금(체력이 줄면)
    const dmg = 1 - p.hp / p.max;
    if (dmg > 0.35 && h > 8) {
      ctx.fillStyle = '#5E6577';
      pline(face.ax + w * 0.3, face.ay - 1, face.ax + w * 0.38, face.ay - h * 0.5);
      pline(face.ax + w * 0.38, face.ay - h * 0.5, face.ax + w * 0.32, face.dy + 1);
      if (dmg > 0.65) { pline(face.ax + w * 0.72, face.ay - 1, face.ax + w * 0.64, face.ay - h * 0.6); pline(face.ax + w * 0.64, face.ay - h * 0.6, face.ax + w * 0.76, face.dy + 1); }
    }
    ctx.fillStyle = OUT;
    trapLine(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy, 1);
    const mx = (face.ax + face.bx) / 2;
    const t = String(Math.max(1, Math.ceil(p.hp)));
    const big = h > 14 && font.measure(t, 'big') <= w - 2;
    if (big || font.measure(t, 'small') <= w) font.draw(ctx, t, mx, face.ay - h * 0.22 - 1, { size: big ? 'big' : 'small' });
    if (p.key === true) keyMark(mx, top.ty, w);
    ctx.globalAlpha = 1;
  }
  function crateIcon(type) { return type === 'coin' ? 'coin' : type === 'men' ? 'men' : 'gun'; }
  function drawCrate(s, p) {
    const top = boxFaces(p, 1.7);
    if (!top) return;
    const a = fadeIn(face.d);
    if (!a) return;
    ctx.globalAlpha = a;
    propSparks(p, p.id);
    const hit = s.t - p.hitT < 0.1;
    ctx.fillStyle = '#F0C27E';
    trap(face.dx, face.cx, face.dy, top.tL, top.tR, top.ty);
    ctx.fillStyle = hit ? '#DDA066' : '#C98A4E';
    trap(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy);
    const w = face.bx - face.ax, h = face.ay - face.dy;
    ctx.fillStyle = '#8E5A30';
    for (let i = 1; i < 4; i++) ctx.fillRect(Math.round(face.ax), Math.round(face.ay - (h * i) / 4), Math.round(w), 1);
    ctx.fillStyle = '#FFE08A';
    ctx.fillRect(Math.round(face.dx), Math.round(face.dy), Math.round(face.cx - face.dx), 1);
    ctx.fillStyle = OUT;
    trapLine(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy, 1);
    const mx = (face.ax + face.bx) / 2, my = face.ay - h / 2;
    const ic = atlas.icon(crateIcon(p.reward && p.reward.type));
    if (h >= ic.h + 4 && w >= ic.w + 4) {
      ctx.fillStyle = 'rgba(43,29,46,.35)';
      ctx.fillRect(Math.round(mx - ic.w / 2) - 1, Math.round(my - ic.h / 2) - 1, ic.w + 2, ic.h + 2);
      atlas.blit(ctx, ic, Math.round(mx - ic.w / 2), Math.round(my - ic.h / 2));
    }
    const t = String(Math.max(1, Math.ceil(p.hp)));
    const big = h > 16;
    font.draw(ctx, t, mx, top.ty - (big ? 6 : 4), { size: big ? 'big' : 'small', fill: '#FFE08A' });
    if (p.key === true) keyMark(mx, top.ty - (big ? 6 : 4) - font.height(big ? 'big' : 'small') / 2, w);
    ctx.globalAlpha = 1;
  }
  /* 열쇠 상자 표시(prop.key): 체력 숫자 위에 금테 두른 열쇠가 살짝 통통 — 멀리서도 '이건 꼭 깨야 한다'가 보이게 */
  function keyMark(cx, yTop, w) {
    if (w < 5) return;
    const ic = atlas.icon('key');
    const bob = ((time * 3) | 0) & 1;
    const x = Math.round(cx - ic.w / 2), y = Math.round(yTop - ic.h - 4 - bob);
    ctx.fillStyle = OUT; ctx.fillRect(x - 2, y - 2, ic.w + 4, ic.h + 4);
    ctx.fillStyle = '#FFD84A'; ctx.fillRect(x - 1, y - 1, ic.w + 2, ic.h + 2);
    ctx.fillStyle = '#5A3B2E'; ctx.fillRect(x, y, ic.w, ic.h);
    atlas.blit(ctx, ic, x, y);
    // 아래로 뾰족한 꼬리(어느 상자인지)
    ctx.fillStyle = OUT; ctx.fillRect(Math.round(cx) - 2, y + ic.h + 2, 5, 1); ctx.fillRect(Math.round(cx) - 1, y + ic.h + 3, 3, 1);
    ctx.fillStyle = '#FFD84A'; ctx.fillRect(Math.round(cx) - 1, y + ic.h + 2, 3, 1); ctx.fillRect(Math.round(cx), y + ic.h + 3, 1, 1);
  }
  function drawCage(s, p) {
    const k = (p.reward && p.reward.k) || 'medic';
    const top = boxFaces(p, 1.8, 0.4);
    if (!top) return;
    const a = fadeIn(face.d);
    if (!a) return;
    ctx.globalAlpha = a;
    propSparks(p, p.id);
    const w = face.bx - face.ax, h = face.ay - face.dy;
    // 바닥판
    ctx.fillStyle = '#596277';
    ctx.fillRect(Math.round(face.ax), Math.round(face.ay) - Math.max(1, Math.round(h * 0.07)), Math.round(w), Math.max(1, Math.round(h * 0.07)));
    // 안의 포로(앞모습, 손 흔들며 도와 달라고)
    const cx = (p.x0 + p.x1) / 2;
    if (project(view, cx, 0.12, p.z)) {
      const sheet = CAPTIVE_ART[k] || 'captive_medic';
      const want = (P.s * 1.0) / 13;
      const st = lodStep(lodCage, p.id, want, STEPS3);
      const sad = p.passed;
      const fr = sad ? FR.captive.sad[0] : FR.captive.wave[((time * 4 + p.id) | 0) & 1];
      atlas.draw(ctx, sheet, fr, P.x, P.y, st);
      // 말풍선 '!'
      if (!sad && st === 0 && (((time * 2) | 0) & 1)) atlas.draw(ctx, 'bubble', 0, P.x + 9, P.y - 15);
    }
    // 창살
    const hit = s.t - p.hitT < 0.1;
    ctx.fillStyle = hit ? '#B7BEC9' : '#8A93A6';
    trap(face.dx, face.cx, face.dy, top.tL, top.tR, top.ty);
    const n = Math.max(3, Math.min(7, Math.round(w / 5)));
    for (let i = 0; i <= n; i++) {
      const bx = Math.round(face.ax + (i * (w - 1)) / n);
      ctx.fillStyle = OUT; ctx.fillRect(bx - (i === 0 ? 0 : 1), Math.round(face.dy), i === 0 || i === n ? 2 : 2, Math.round(h));
      ctx.fillStyle = hit ? '#E8ECF2' : '#C9CED6'; ctx.fillRect(bx, Math.round(face.dy), 1, Math.round(h));
    }
    ctx.fillStyle = OUT;
    ctx.fillRect(Math.round(face.dx), Math.round(face.dy), Math.round(w), 1);
    ctx.fillRect(Math.round(face.ax), Math.round(face.ay) - 1, Math.round(w), 1);
    const t = String(Math.max(1, Math.ceil(p.hp)));
    if (!p.passed) font.draw(ctx, t, (face.ax + face.bx) / 2, top.ty - (h > 16 ? 6 : 4), { size: h > 16 ? 'big' : 'small', fill: '#FFF09A' });
    if (p.key === true && !p.passed) keyMark((face.ax + face.bx) / 2, top.ty - (h > 16 ? 6 : 4) - font.height(h > 16 ? 'big' : 'small') / 2, w);
    ctx.globalAlpha = 1;
  }

  /* ---------- 톱날 ---------- */
  function drawSaw(s, w, lag) {
    const x = clamp(w.x - w.dir * w.spd * lag, w.xa, w.xb);
    if (project(view, w.xa - 0.5, 0.02, w.z)) {
      const ax = P.x, ay = P.y;
      project(view, w.xb + 0.5, 0.02, w.z);
      ctx.fillStyle = 'rgba(43,29,46,.65)';
      ctx.fillRect(Math.round(ax), Math.round(ay) - 1, Math.max(1, Math.round(P.x - ax)), Math.max(1, Math.round(P.s * 0.12)));
    }
    if (!project(view, x, 0, w.z)) return;
    const a = fadeIn(P.d);
    if (!a) return;
    const want = (P.s * 1.6) / 15;
    const st = lodStep(lodSaw, w.id, want, STEPS3);
    ctx.fillStyle = '#3A3550';
    ctx.fillRect(Math.round(P.x) - 1, Math.round(P.y - P.s * 0.7), 2, Math.round(P.s * 0.7));
    if (a < 1) ctx.globalAlpha = a;
    atlas.draw(ctx, 'saw', ((time * 30) | 0) & 3, P.x, P.y - Math.round(P.s * 0.15), st);
    ctx.globalAlpha = 1;
  }

  /* ---------- 좀비 ---------- */
  function drawFoe(s, f, lag, bio) {
    const moving = f.kind !== 'spit' && f.awake;
    const z = moving ? f.z + f.spd * lag : f.z;
    if (!project(view, f.x, 0, z)) return;
    const a = fadeIn(P.d);
    if (!a) return;
    const sk = skinOf(f.kind, curBid);
    const sheet = atlas.has(sk) ? sk : f.kind;   // 그 지역 시트를 아직 굽지 않았으면 기본(그리는 중에는 굽지 않는다)
    const sh = atlas.sheet(sheet);
    const want = (P.s * (WORLD_H[f.kind] || 1.05)) / (sh.frames[0][0].h - 2);
    const st = lodStep(lodFoe, f.id, want, STEPS3);
    let fr;
    if (f.kind === 'spit') {
      const dzq = f.z - s.squad.z;
      const armed = s.phase === 'run' && dzq < 32 && dzq > 6;
      const T = FR.spit.tell;
      if (armed && f.cd < 0.35) fr = f.cd < 0.12 ? T[2] : f.cd < 0.23 ? T[1] : T[0];
      else if (armed && f.cd > 2.25) fr = T[2];   // 방금 쐈다
      else fr = FR.spit.idle[((time * 3 + f.seed) | 0) & 1];
    } else if (moving) {
      const fps = f.kind === 'runner' ? 12 : f.kind === 'brute' ? 5 : 7;
      fr = FR.foe.walk[((time * fps + f.seed) | 0) & 3];
    } else fr = FR.foe.idle[((time * 2 + f.seed) | 0) & 1];
    const pxs = P.x, pys = P.y, ps = P.s;
    ctx.fillStyle = bio.shadow;
    ellipse(pxs, pys, Math.max(2, f.r * 1.1 * ps), Math.max(1, f.r * 0.4 * ps));
    if (a < 1) ctx.globalAlpha = a;
    // 질주 좀비 속도선
    if (f.kind === 'runner' && moving && st === 0) {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      const sx = Math.round(pxs), sy = Math.round(pys);
      for (let i = 0; i < 3; i++) ctx.fillRect(sx - 5 + i * 4 + ((f.seed + i) & 1), sy - 22 - ((time * 40 + i * 5) % 6 | 0), 1, 3);
    }
    const white = flashFoe.on(f.id, f.hitT, s.t, time, reduce);
    const tell = f.kind === 'spit' && (fr === FR.spit.tell[0] || fr === FR.spit.tell[1]);
    if (tell) { ctx.fillStyle = '#B9F25B'; ellRing(pxs, pys, Math.max(4, f.r * 1.6 * ps), Math.max(2, f.r * 0.6 * ps), 1); }
    if (f.elite) {
      // 정예 좀비: 발밑에 맥동하는 색 고리(오염 = 보라, 분열 = 주황) — 멀리서도 졸개와 가려 보이게
      const ec = ELITE_COL[f.elite];
      const pu = 1 + 0.18 * (((time * 4 + f.seed) | 0) & 1);
      ctx.fillStyle = ec.glow; ellipse(pxs, pys, Math.max(3, f.r * 1.5 * ps * pu), Math.max(1.5, f.r * 0.55 * ps * pu));
      ctx.fillStyle = ec.ring; ellRing(pxs, pys, Math.max(4, f.r * 1.7 * ps * pu), Math.max(2, f.r * 0.62 * ps * pu), 1);
    }
    const rr = atlas.draw(ctx, sheet, fr, pxs, pys, st, white ? 'white' : ALT3[f.seed % 3]);
    if (f.elite) {
      // 머리 위 표식: 오염 = 보라 방울이 보글보글, 분열 = 주황 두 점이 벌어졌다 모인다
      const ec = ELITE_COL[f.elite];
      const hx = Math.round(pxs), hy = Math.round(pys) - rr.ay - 4, ph = ((time * 6 + f.seed) | 0) & 3;
      if (f.elite === 'toxic') {
        ctx.fillStyle = OUT; ctx.fillRect(hx - 2, hy - 2, 5, 5);
        ctx.fillStyle = ec.ring; ctx.fillRect(hx - 1, hy - 1, 3, 3);
        ctx.fillStyle = ec.hi; ctx.fillRect(hx - 1, hy - 1, 1, 1);
        ctx.fillStyle = ec.ring; ctx.fillRect(hx - 3 + ph * 2, hy - 4 - (ph & 1), 1, 1);
      } else {
        const d = ph === 0 ? 1 : ph === 2 ? 3 : 2;
        ctx.fillStyle = OUT; ctx.fillRect(hx - d - 2, hy - 2, 4, 4); ctx.fillRect(hx + d - 1, hy - 2, 4, 4);
        ctx.fillStyle = ec.ring; ctx.fillRect(hx - d - 1, hy - 1, 2, 2); ctx.fillRect(hx + d, hy - 1, 2, 2);
      }
    }
    if (f.slowT > s.t) {
      // 빙결탄에 맞아 느려진 동안: 발밑 하늘빛 띠 + 머리 위 서리 두 점
      const fx0 = Math.round(pxs), fy0 = Math.round(pys);
      ctx.fillStyle = '#8FD3FF'; ctx.fillRect(fx0 - 3, fy0, 7, 1);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(fx0 - 2 + ((f60 >> 2) & 1) * 3, fy0 - rr.ay - 1, 1, 1); ctx.fillRect(fx0 + 1 - ((f60 >> 2) & 1) * 2, fy0 - rr.ay + 2, 1, 1);
    }
    if (tell && (((time * 12) | 0) & 1)) {
      // 독침 예고: 머리 위 연두 반짝임(멀리서도 보이게)
      const hx = Math.round(pxs), hy = Math.round(pys) - rr.ay - 4;
      ctx.fillStyle = OUT; ctx.fillRect(hx - 2, hy - 1, 5, 3); ctx.fillRect(hx - 1, hy - 2, 3, 5);
      ctx.fillStyle = '#B9F25B'; ctx.fillRect(hx - 1, hy, 3, 1); ctx.fillRect(hx, hy - 1, 1, 3);
    }
    // 거구 발걸음 먼지
    if (f.kind === 'brute' && moving) {
      const prev = bruteStep.get(f.id);
      if (prev !== fr && (fr === 0 || fr === 2)) part(f.x + (fr ? 0.4 : -0.4), 0.05, z, 0, 0.6, 0, 0.35, '#E6D2B0', 2, 0, 'dust');
      bruteStep.set(f.id, fr);
    }
    if ((f.kind === 'brute' || f.kind === 'spit' || f.elite) && f.hp < f.max) {
      const r = atlas.get(sheet, fr, st);
      const bw = Math.max(8, Math.round(r.w * 0.7));
      const bx = Math.round(pxs - bw / 2), by = Math.round(pys) - r.ay - (f.elite ? 9 : 4);
      ctx.fillStyle = OUT; ctx.fillRect(bx - 1, by, bw + 2, 3);
      ctx.fillStyle = '#FF5D5D'; ctx.fillRect(bx, by + 1, Math.max(1, Math.round((bw * Math.max(0, f.hp)) / f.max)), 1);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 보스 ---------- */
  function bossFrame(s, b) {
    const B = FR.boss;
    if (b.hp <= 0) return B.dead[0];
    if (time - bossImpactT < 0.28) return B.slam[0];
    if (b.slam) return B.windup[0];
    if (time - roarT < 0.9) return B.roar[((time * 8) | 0) & 1];
    if (b.clash) return B.stomp[((time * 6) | 0) & 1];
    return B.walk[((time * 4 * (b.enraged ? 1.25 : 1)) | 0) & 3];
  }
  function drawBoss(s, b, lag, bio) {
    const walking = b.hp > 0 && !b.clash;
    let z = walking ? b.z + b.walk * (b.enraged ? 1.25 : 1) * lag : b.z;
    let x = b.x;
    if (bossDeath) {
      const t = time - bossDeath.t0;
      if (t > 1.15) return;
      if (t < 0.8 && (f60 & 2)) x += 0.12;
    }
    if (!project(view, x, 0, z)) return;
    const bs0 = skinOf('boss', curBid), bs = atlas.has(bs0) ? bs0 : 'boss';
    const sh = atlas.sheet(bs);
    const want = (P.s * 6.4) / (sh.frames[0][0].h - 2);
    const st = pickStep(Math.min(1, want), lodBoss, STEPS4);
    lodBoss = st;
    const px = P.x;
    let py = P.y;
    const it = time - bossIntroT;
    if (it >= 0 && it < 0.35) py -= Math.round((1 - it / 0.35) ** 2 * 60);
    else if (it >= 0.35 && it < 0.4 && bossIntroT > 0) { burst(b.x, 0.2, b.z, 18, bfx().dust, 6, 3); bossIntroT = -9; shake(0.35); }
    ctx.fillStyle = bio.shadow;
    ellipse(px, P.y, 2.6 * P.s, 2.6 * P.s * 0.34);
    const fr = bossFrame(s, b);
    // 피격: 흰 실루엣을 반투명(50%)으로 덧칠, 0.5초에 한 번(V9). 쓰러질 때의 두 번 번쩍임도 움직임 줄이기면 끈다(T10)
    const dt0 = bossDeath ? time - bossDeath.t0 : 9;
    const white = b.hp > 0 ? flashBoss.on(-1, b.hitT, s.t, time, reduce) : !reduce && !!bossDeath && (dt0 < 0.05 || (dt0 > 0.4 && dt0 < 0.45));
    atlas.draw(ctx, bs, fr, px, py, st, b.enraged ? 'rage' : '');
    if (white) {
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * 0.5;
      atlas.draw(ctx, bs, fr, px, py, st, 'white');
      ctx.globalAlpha = ga;
    }
    // 정예(5의 배수)·대왕(10의 배수): 머리에 왕관(자세마다 자리, 줄인 단계면 그 배율로) + 기운 반짝이 — 그림만
    const tier = BOSS_TIER[bossTag];
    if (tier) {
      const c = BOSS_CROWN[bs] && BOSS_CROWN[bs][fr];
      if (c && atlas.has(tier.crown)) atlas.draw(ctx, tier.crown, c[2], px + Math.round(c[0] * STEPS4[st]), py + Math.round(c[1] * STEPS4[st]), st, bossTag === 'hard' ? curBid : '');
      if (b.hp > 0) {
        const sc = tier.sparkCol || bfx().spark;
        for (let k = beats(tier.sparks); k > 0; k--) part(b.x + (Math.random() - 0.5) * 3.4, 1 + Math.random() * 5, z, (Math.random() - 0.5) * 0.4, 0.8 + Math.random(), 0, 0.7, sc[k & 1], 1, -1);
      }
    }
    // 분노: 머리에서 김(초당 12번, 화면 주사율과 상관없이)
    if (b.enraged && b.hp > 0) for (let k = beats(12); k > 0; k--) part(b.x + (Math.random() - 0.5) * 2.5, 6.2, z, (Math.random() - 0.5) * 0.6, 1.5, 0, 0.7, bfx().steam.c, 1, -1, bfx().steam.spr);
    // 쓰러지는 중: 연기 연쇄 + 코인 비
    if (bossDeath) {
      const t = time - bossDeath.t0;
      const want2 = Math.floor(t / 0.11);
      while (bossDeath.n < Math.min(9, want2)) {
        bossDeath.n++;
        fx('puff', b.x + (Math.random() - 0.5) * 4, 1 + Math.random() * 4.5, z - 0.5, 0.35, { step: 0 });
        if (bossDeath.n % 2) for (let i = 0; i < 4; i++) part(b.x + (Math.random() - 0.5) * 3, 4 + Math.random() * 2, z, (Math.random() - 0.5) * 5, 3 + Math.random() * 3, -2 - Math.random() * 2, 1.2, '#FFD84A', 1, 9, 'coin');
      }
      if (t > 1 && bossDeath.n < 10) { bossDeath.n = 10; fx('puff', b.x, 2.5, z - 0.5, 0.45); burst(b.x, 3, z, 40, bfx().death, 8, 6, 1); }
    }
  }

  /* ---------- 분대 ---------- */
  /* 그림 단위마다 이름표(id)가 있어 병력이 조금 바뀌어도 제자리에 남고, 목표 자리로 미끄러진다(분대 기준 좌표라 달려도 뒤처지지 않는다).
     구성이 바뀌면(remap) 단계마다 가까운 것끼리 짝짓고, 남는 것으로 합치기(작은 것들이 새 자리로 모여 펑 → 큰 것이 톡 나타난다)·
     나누기(큰 것이 펑 → 작은 것들이 그 자리에서 튀어나와 흩어진다)·더하기(떨어져 내림)·빼기(연기 + 철모)를 고른다 */
  function updateFormation(s, dt, qx) {
    const q = sq;   // 카메라와 같은 시간축의 분대(R4)
    const R = radius(Math.max(1, q.n));
    if (s !== formS) { units.length = 0; fading.length = 0; fComp = null; fArr = null; fGeo = null; fN = -1; formS = s; }
    // 배율: 분대 자리의 m당 px(옆)와, 앞뒤 끝까지의 화면 높이(원근 — 앞·뒤 따로)
    let ppm = 17, vf = 10, vb = 10, pb = 0;
    const D = Math.max(0.05, SQUAD_DEPTH * R - FORM_IN);
    if (project(view, qx, 0, q.z)) {
      ppm = P.s;
      const y0 = P.y;
      if (project(view, qx, 0, q.z + D)) vf = Math.max(1, (y0 - P.y) / D);
      if (project(view, qx, 0, q.z - D)) { vb = Math.max(1, (P.y - y0) / D); pb = P.s; }
    }
    const n = Math.max(0, q.n);
    // 병력·배율이 바뀔 때만 다시 짠다(프레임마다 쓰레기 없이)
    if (n !== fN || !fGeo || Math.abs(ppm - fGeo.ppm) > 0.01 || Math.abs(vf - fGeo.vf) > 0.01 || Math.abs(vb - fGeo.vb) > 0.01 || R !== fGeo.R) {
      const g = formGeom(R, ppm, vf, vb, pb);
      formPlans++;
      const comp = n <= 0 ? EMPTY_COMP : fComp ? nextComp(fComp, fN, n, g) : composeSquad(n, g);
      const same = fComp && fArr && comp.join(',') === fArr.comp;
      const arr = formArrange(comp, g, same ? fArr : null);
      if (!fArr || arr.key !== fArr.key) remap(arr, g, !fComp || !units.length, n > fN ? 1 : n < fN ? -1 : 0);
      fArr = arr; fComp = comp; fN = n; fGeo = g;
    }
    const g = fGeo, arr = fArr;
    if (pendingLoss > 0) {
      // 그림이 줄지 않은 손실(어림 구성·합친 병사 안에서 줄었을 때)도 몇 군데 연기로 보여 준다
      if (units.length) for (let i = 0, m = Math.min(3, pendingLoss); i < m; i++) { const u = units[(Math.random() * units.length) | 0]; lossFx(qx + u.x, q.z + u.z, u.t); }
      pendingLoss = 0;
    }
    formPositions(arr, g, fPos);
    const k = Math.min(1, dt * 12);
    for (const u of units) {
      const p = fPos[u.slot];
      if (!p) continue;
      u.x += (p.x - u.x) * k;
      u.z += (p.z - u.z) * k;
    }
    // 합쳐지는 것: 새 그림 자리로 빨려 들어가고, 다 가면 사라진다 / 나뉘는 것: 잠깐 부풀었다 펑
    for (let i = fading.length - 1; i >= 0; i--) {
      const gh = fading[i];
      const u = (time - gh.t0) / gh.dur;
      if (u >= 1) {
        // 나뉨은 잃은 것(연기 + 철모 조각 — 금빛 없이). 배율만 바뀌어 나뉜 것은 연기만
        if (gh.kind === 'split') { if (gh.loss) lossFx(qx + gh.x, q.z + gh.z, gh.t); else fx('puff', qx + gh.x, 0.5 + 0.15 * gh.t, q.z + gh.z, 0.28, { step: gh.t >= 2 ? 0 : 1, vz: sq.vz }); }
        fading.splice(i, 1);
        continue;
      }
      if (gh.kind === 'merge' && gh.to) {
        const e = u * u;
        gh.x = gh.x0 + (gh.to.x - gh.x0) * e;
        gh.z = gh.z0 + (gh.to.z - gh.z0) * e;
      }
    }
    return R;
  }
  /* 새 배치로 짝짓기 — first면(레벨 시작·이어하기) 움직임 없이 바로. dir = 병력이 움직인 쪽(+ 얻음, − 잃음, 0 배율만) */
  function remap(arr, g, first, dir) {
    const pos = formPositions(arr, g, []);
    if (first) {
      units.length = 0; fading.length = 0;
      for (let i = 0; i < pos.length; i++) units.push(newUnit(pos[i].t, i, pos[i].x, pos[i].z, -9));
      rankUnits(pos);
      return;
    }
    const NT = TIER.length;
    const oldBy = [], slotBy = [];
    for (let t = 0; t < NT; t++) { oldBy.push([]); slotBy.push([]); }
    for (const u of units) oldBy[u.t].push(u);
    for (let i = 0; i < pos.length; i++) slotBy[pos[i].t].push(i);
    const next = [];
    const U = [], V = [];
    for (let t = 0; t < NT; t++) {
      // 같은 단계끼리 가까운 것부터 짝(남는 것은 합치기·나누기·더하기·빼기)
      const O = oldBy[t], S = slotBy[t];
      const pairs = [];
      for (let a = 0; a < O.length; a++) for (let b = 0; b < S.length; b++) {
        const p = pos[S[b]];
        pairs.push([(O[a].x - p.x) ** 2 + (O[a].z - p.z) ** 2, a, b]);
      }
      pairs.sort((p1, p2) => p1[0] - p2[0]);
      const usedO = new Uint8Array(O.length), usedS = new Uint8Array(S.length);
      let left = Math.min(O.length, S.length);
      for (const [, a, b] of pairs) {
        if (!left) break;
        if (usedO[a] || usedS[b]) continue;
        usedO[a] = 1; usedS[b] = 1; left--;
        O[a].slot = S[b];
        next.push(O[a]);
      }
      U.push(O.filter((_, a) => !usedO[a]));
      V.push(S.filter((_, b) => !usedS[b]));
    }
    const calm = reduce;
    const near = (list, x, z, k) => {
      list.sort((a, b) => ((a.x ?? pos[a].x) - x) ** 2 + ((a.z ?? pos[a].z) - z) ** 2 - (((b.x ?? pos[b].x) - x) ** 2 + ((b.z ?? pos[b].z) - z) ** 2));
      return list.splice(0, k);
    };
    let removed = 0;
    const srcs = [];   // 이번에 나뉜 큰 그림 자리(줄줄이 나뉠 때 더 작은 것도 거기서 튀어나온다)
    const made = [];   // 이번에 합쳐 생긴 그림(얻을 때 남는 작은 것도 거기로 빨려 든다)
    for (let t = NT - 1; t >= 1; t--) {
      // 합치기: 아래 단계 남는 것(최대 열) → 이 단계 새 자리
      while (V[t].length && U[t - 1].length) {
        const si = V[t].shift(), p = pos[si];
        const nu = newUnit(t, si, p.x, p.z, -9);
        nu.pop = calm ? -9 : time + MERGE_T;
        next.push(nu);
        made.push(nu);
        for (const o of near(U[t - 1], p.x, p.z, 10)) {
          if (calm) continue;
          fading.push({ kind: 'merge', t: o.t, id: o.id, x: o.x, z: o.z, x0: o.x, z0: o.z, to: nu, t0: time, dur: MERGE_T * (0.75 + 0.25 * Math.random()) });
        }
      }
      // 나누기: 이 단계 남는 것 → 아래 단계 새 자리(최대 열)가 그 자리에서 튀어나온다
      while (U[t].length && V[t - 1].length) {
        const o = U[t].shift();
        const kids = near(V[t - 1], o.x, o.z, 10);
        for (const si of kids) {
          const nu = newUnit(t - 1, si, o.x, o.z, -9);
          nu.hop = calm ? -9 : time + SPLIT_T * Math.random() * 0.6;
          next.push(nu);
        }
        srcs.push(o);
        if (calm) continue;
        fading.push({ kind: 'split', t: o.t, id: o.id, x: o.x, z: o.z, t0: time, dur: SPLIT_T, loss: dir < 0 });
      }
    }
    // 그냥 빠진 것: 연기 + 철모(한 번에 몇 개만) — 얻을 때는 죽지 않는다: 가장 가까운 더 큰 그림(이번에 합쳐 생긴 것 먼저)으로 빨려 든다
    // 그냥 늘어난 것: 위에서 떨어져 내린다(큰 그림이 줄줄이 나뉜 것이면 그 자리에서 튀어나온다)
    for (let t = 0; t < NT; t++) {
      for (const o of U[t]) {
        if (dir > 0) {
          let to = null, bd = Infinity;
          for (const list of [made, next]) {
            for (const u of list) { const d = (u.x - o.x) ** 2 + (u.z - o.z) ** 2; if (u.t > o.t && d < bd) { bd = d; to = u; } }
            if (to) break;
          }
          if (to) {
            if (!calm) fading.push({ kind: 'merge', t: o.t, id: o.id, x: o.x, z: o.z, x0: o.x, z0: o.z, to, t0: time, dur: MERGE_T * (0.75 + 0.25 * Math.random()) });
            continue;
          }
        }
        if (removed++ < 6) lossFx(sq.x + o.x, sq.z + o.z, o.t);
      }
      for (const si of V[t]) {
        const p = pos[si];
        let src = null, bd = Infinity;
        for (const o of srcs) { const d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2; if (o.t > t + 1 && d < bd) { bd = d; src = o; } }
        if (src) {
          const nu = newUnit(t, si, src.x, src.z, -9);
          nu.hop = calm ? -9 : time + SPLIT_T * (0.3 + Math.random() * 0.6);
          next.push(nu);
        } else next.push(newUnit(t, si, p.x, p.z, calm ? -9 : time));
      }
    }
    if (removed) pendingLoss = 0;
    units.length = 0;
    for (const u of next) units.push(u);
    rankUnits(pos);
  }
  /* 쏘는 차례(ph — 앞쪽 절반만 쏜다, 적으면 모두)와 다치는 차례(hr): 자리 번호를 섞은 순서로 0, 1, 2… —
     주기마다 고르게 번갈아 쏘고(한 프레임에 몰리지 않게), 맞을 때마다 몇 장씩 돌아가며 붉어진다 */
  function rankUnits(pos) {
    const ord = units.slice().sort((a, b) => hashInt(a.slot * 7 + 3) - hashInt(b.slot * 7 + 3));
    let k = 0;
    for (let i = 0; i < ord.length; i++) {
      const u = ord[i];
      u.hr = i;
      u.fire = ord.length < 6 || pos[u.slot].z > -0.1;
      u.ph = u.fire ? k++ : 0;
    }
  }
  function newUnit(t, slot, x, z, born) {
    return { id: ++unitId, t, slot, x, z, born, pop: -9, hop: -9, fx: 0, ph: 0, hr: 0, fire: false };
  }
  /* 사라짐: 연기(분대와 같이 움직인다) + 철모 조각(큰 단계는 몇 개 더) */
  function lossFx(x, z, t) {
    fx('puff', x, 0.4 + 0.15 * t, z, 0.3, { step: t >= 2 ? 0 : 1, vz: sq.vz });
    for (let i = 0; i <= Math.min(2, t); i++) part(x, 0.9, z, (Math.random() - 0.5) * 2, 4 + Math.random() * 2, sq.vz * 0.6 + (Math.random() - 0.5), 0.8, '#6CC0FF', 1, 12, 'helmetBit');
  }
  /* 합치기의 펑: 연기 + 금빛 반짝이(분대와 같이 움직인다) */
  function popFx(x, z, t) {
    fx('puff', x, 0.5 + 0.15 * t, z, 0.28, { step: t >= 2 ? 0 : 1, vz: sq.vz });
    if (lowFx()) return;
    for (let i = 0; i < 4 + 2 * t; i++) {
      const a = Math.random() * 6.283;
      part(x + Math.cos(a) * 0.2, 0.7 + 0.2 * t, z, Math.cos(a) * 2.2, 2.5 + Math.random() * 2, sq.vz + Math.sin(a) * 1.2, 0.45, FX_COL.gold[i % 3], 1, 7);
    }
  }
  /* 그림 단위 하나(u: 살아 있는 것 또는 사라지는 중인 것 — gh가 참) */
  function drawMember(s, u, qx, gh) {
    const q = sq;   // 카메라와 같은 시간축의 분대(R4)
    if (!gh && time < u.pop) return;   // 합쳐지는 중: 모두 모이면 나타난다
    const wx = qx + u.x, wz = q.z + u.z;
    if (!project(view, wx, 0, wz)) return;
    const won = s.phase === 'won';
    // 정수 좌표로 먼저 반올림(실수 인자가 상자에 담기지 않게)
    const px = Math.round(P.x);
    let y = Math.round(P.y);
    const ph = u.id * 0.37;
    if (!gh) {
      const age = time - u.born;
      if (u.born > 0 && age < 0.22) y -= Math.round((1 - age / 0.22) * 6);
      else if (u.born > 0 && age < 0.27) { part(wx, 0.05, wz, 0, 0.5, q.vz, 0.25, '#E6D2B0', 1, 0, 'dust'); u.born = -9; }
      if (u.pop > 0) {
        // 합친 것이 톡: 펑 하고 한 번 뛴다
        const a = time - u.pop;
        if (!u.fx) { u.fx = 1; popFx(wx, wz, u.t); }
        if (a < 0.3) y -= Math.round(Math.sin((a / 0.3) * Math.PI) * 4);
        else u.pop = -9;
      }
      if (u.hop > 0) {
        // 나뉜 것: 큰 그림 자리에서 튀어나와 제자리로
        const a = time - u.hop;
        if (a < 0) return;
        if (a < 0.32) y -= Math.round(Math.sin((a / 0.32) * Math.PI) * 5);
        else u.hop = -9;
      }
    } else if (u.kind === 'split') {
      // 나뉘기 직전: 살짝 들썩
      y -= ((time - u.t0) / u.dur) > 0.4 ? 1 : 0;
    }
    if (won) y -= Math.round(Math.abs(Math.sin(time * 9 + u.id * 0.7)) * 2);
    else if (!gh) {
      // 좋은 게이트를 지났다: 앞줄(먼 쪽)부터 뒷줄로 물결처럼 통
      const a = time - waveT - Math.max(0, waveFront - u.z) * 0.06;
      if (a > 0 && a < 0.24) y -= Math.round(Math.sin((a / 0.24) * Math.PI) * 3);
    }
    const T = TIER[u.t], sheet = T.sheet;
    const moving = q.vz > 0.5 && !won;
    const fr = moving ? FR.tier.walk[((time * T.fps + ph) | 0) & 3] : FR.tier.idle[((time * T.idleFps + u.id * 0.31) | 0) & 1];
    const hurt = !gh && time - hurtAt < 0.15 && (u.hr + hurtSeed) % hurtMod === 0;
    // 총구 불꽃은 60Hz 시계로(120Hz 화면에서 두 배로 번쩍이지 않게, T8)
    const fire = !gh && !won && q.n > 0 && s.t > 0 && u.fire && muzzleOn(f60, u.ph, firePeriod, quality === 'low');
    const r = atlas.draw(ctx, sheet, fr, px, y + (fire ? 1 : 0), 0, hurt ? 'hurt' : '');
    if (fire) {
      // 총구 끝 칸(프레임마다 — 걸음에 따라 솟는다, art.js muzzles) 위 외곽선 한 칸 위에 불꽃. ox·oy = 반동으로 1px 내린 그림의 왼쪽 위
      const m = SHEETS[sheet].muzzles[fr], ox = px - r.ax, oy = y + 1 - r.ay;
      atlas.draw(ctx, 'flash', (f60 + u.id) & 1, ox + m[0] + 1, oy + m[1] - 1);
      // 탄피: 중장갑·전차 옆으로 한 점
      if (u.t >= 2 && quality !== 'low') part(wx + 0.3, 0.7, wz, 1.5 + Math.random(), 2 + Math.random(), q.vz - 1, 0.35, '#E8C36A', 1, 12);
    }
  }
  function drawFlag(s, i, qx, R, z) {
    const x = qx + FLAG_X[i] * R;
    if (!project(view, x, 0, z)) return;
    // 맨 앞줄에서 가장 키 큰 그림 위로 천이 보이게
    let hf = 14;
    if (fArr && fArr.rows.length) for (const t of fArr.rows[0]) hf = Math.max(hf, TIER[t].h);
    let y = P.y - Math.max(12, hf - 4);
    if (s.phase === 'won') y -= Math.round(Math.abs(Math.sin(time * 9 + i)) * 2);
    atlas.draw(ctx, 'flag', ((time * 3 + i * 0.5) | 0) & 1, P.x + 3, y);
  }
  function drawSpecial(s, m, i, qx, R) {
    const q = sq;   // 카메라와 같은 시간축의 분대(R4)
    const slot = slotPos(q, i, R, qx);
    let x = slot.x, z = slot.z, y = 0;
    let seen = spSeen.get(m.id);
    if (!seen) {
      let from = null;
      for (let j = 0; j < pendingGet.length; j++) if (pendingGet[j].k === m.k) { from = pendingGet[j]; pendingGet.splice(j, 1); break; }
      seen = { born: time, fx: from ? from.x : x, fz: from ? from.z : z + 1, hop: !!from };
      spSeen.set(m.id, seen);
    }
    const age = time - seen.born;
    if (seen.hop && age < 0.45) {
      const u = age / 0.45;
      x = seen.fx + (x - seen.fx) * u;
      z = seen.fz + (z - seen.fz) * u;
      y = 1.6 * 4 * u * (1 - u);
    }
    if (!project(view, x, y, z)) return;
    const won = s.phase === 'won';
    const moving = q.vz > 0.5 && !won;
    const sheet = UNIT_ART[m.k] || 'soldier';
    let fr = moving ? FR.special.walk[((time * 10 + i * 0.5) | 0) & 3] : FR.special.idle[((time * 2 + i) | 0) & 1];
    let variant = '';
    if (m.k === 'rocket') { const t = time - rocketT; if (t < 0.36) fr = t < 0.12 ? FR.rocket.fire[0] : t < 0.24 ? FR.rocket.fire[1] : FR.special.walk[0]; }
    if (m.k === 'medic' && time - healT < 0.25) variant = 'glow';
    let py = P.y;
    if (won) py -= Math.round(Math.abs(Math.sin(time * 9 + i)) * 2);
    const r = atlas.draw(ctx, sheet, fr, P.x, py, 0, variant);
    // 레벨(SIM 9): Lv2·Lv3은 머리 위 별
    const lv = m.lv || 1;
    if (lv > 1) lvStars(P.x, Math.round(py) - r.ay - 3, lv, time - (spUpAt.get(m.id) ?? -9) < 0.8);
    // 저격수 조준 반짝임(쿨이 거의 다 찼을 때)
    if (m.k === 'sniper' && typeof m.cd === 'number' && m.cd < 0.18 && m.cd > 0 && (f60 & 2)) atlas.draw(ctx, 'glint', 0, P.x + 6, py - 14);
  }
  /* 펫: 영웅 뒤 오른쪽을 따라다닌다(영웅이 없으면 그 자리). 효과가 터지면(core 'pet' 이벤트) 통 튀며 반짝인다 */
  function drawPet(s, pet, qx, R) {
    const art = PET_ART[pet.id];
    if (!art || !atlas.has(art.back)) return;
    const q = sq;
    const z = heroZ(q, R) - 0.55;
    const x = qx + (s.hero ? 0.95 : 0);
    if (!project(view, x, 0, z)) return;
    const moving = q.vz > 0.5 && s.phase !== 'won' && s.phase !== 'lost';
    const fr = moving ? ((time * 8) | 0) & 1 : 0;
    const pt = time - petT;
    let py = P.y;
    if (pt >= 0 && pt < 0.3) py -= Math.round(Math.sin((pt / 0.3) * Math.PI) * 5);
    else if (s.phase === 'won') py -= Math.round(Math.abs(Math.sin(time * 8 + 1)) * 3);
    ctx.fillStyle = 'rgba(43,29,46,.28)';
    ellipse(P.x, P.y, 0.4 * P.s, 0.15 * P.s);
    const r = atlas.draw(ctx, art.back, fr, P.x, py);
    if (pt >= 0 && pt < 0.35 && (f60 & 2)) atlas.draw(ctx, 'glint', 1, P.x + 4, Math.round(py) - r.ay - 1);
  }
  function drawHero(s, h, qx, R) {
    const q = sq;   // 카메라와 같은 시간축의 분대(R4)
    const art = HERO_ART[h.id];
    if (!art) return;
    const z = heroZ(q, R);
    if (!project(view, qx, 0, z)) return;
    const lost = s.phase === 'lost';
    const won = s.phase === 'won';
    let fr;
    const HF = FR.hero;
    if (lost) fr = HF.ko[0];
    else if (h.act > 0 || time - castT < 0.22) fr = HF.cast[((time * 6) | 0) & 1];
    else if (q.vz > 0.5 && !won) fr = HF.walk[(((time * 9) | 0) & 3) + 4 * (((time * 4 + 0.5) | 0) & 1)];
    else {
      fr = HF.idle[((time * 2) | 0) & 1];
      // 가끔 뒤돌아보며 눈을 깜빡인다
      if (time > lookNext + 1.1) lookNext = time + 3 + Math.random() * 3;
      // 뒤돌아보고(1.1초) 그 사이 눈을 0.25초(8fps 두 칸) 감는다
      if (time > lookNext && time < lookNext + 1.1) { const lt = time - lookNext; fr = lt > 0.45 && lt < 0.7 ? HF.blink[0] : HF.look[0]; }
    }
    let py = P.y;
    if (won) py -= Math.round(Math.abs(Math.sin(time * 7)) * 3);
    ctx.fillStyle = 'rgba(43,29,46,.28)';
    ellipse(P.x, P.y, 0.6 * P.s, 0.22 * P.s);
    const r = atlas.draw(ctx, art.back, fr, P.x, py);
    const topY = Math.round(py) - r.ay;
    if (lost) {
      // 기절: 머리 위 어지러운 별
      for (let i = 0; i < 3; i++) {
        const a = time * 5 + (i * 2 * Math.PI) / 3;
        atlas.draw(ctx, 'star', FR.star.f[0], P.x + Math.cos(a) * 8, topY + 2 + Math.sin(a) * 2);
      }
    } else if (time - readyT < 0.5 && (f60 & 4)) atlas.draw(ctx, 'glint', 1, P.x + 7, topY + 2);
    // 스킬 중 효과(시간 기준 빈도: 고리 초당 60/26번, 하트 초당 6번)
    if (h.act > 0 && !lost) {
      if (h.id === 'mungchi' && beats(60 / 26) > 0) ring(qx, z, 0.4, R + 2.5, 0.5, '#FFD84A', { follow: true, thick: 2 });
      if (h.id === 'bori') for (let k = beats(6); k > 0; k--) part(qx + (Math.random() - 0.5) * 2 * R, 1 + Math.random(), q.z + (Math.random() - 0.5) * R, 0, 1.6, 0, 0.9, '#FF6FA0', 1, 0, 'heart');
    }
  }

  /* ---------- 분대 숫자 말풍선(분대 위, 가까운 게이트가 있으면 흐리게) ---------- */
  let countText = '', countTextN = -1;
  const fOpt = { size: 'big', scale: 1, fill: '#FFFFFF', out: OUT };   // 글자 옵션(재사용)
  function drawCount(s, dt, qx) {
    const q = sq;   // 카메라와 같은 시간축의 분대(R4)
    pill.on = false;
    if (q.n !== lastN) lastN = q.n;
    shownN += (q.n - shownN) * Math.min(1, dt * 9);
    if (Math.abs(q.n - shownN) < 0.5) shownN = q.n;
    countPop = Math.max(0, countPop - dt * 4);
    countTint *= Math.max(0, 1 - dt * 3);
    // 출발 전(레벨 카드 뒤)에는 그리지 않는다 — 카드 글자와 겹치지 않게(V6)
    if (q.n <= 0 || cardOn || s.t === 0) return;
    const R = radius(q.n);
    if (!project(view, qx, 1.5 + R * 0.25, q.z + R * 0.2)) return;
    let gateNear = false;
    for (const row of s.rows) { const d = row.z - q.z; if (!row.done && d > 0 && d <= 6) { gateNear = true; break; } }
    const n = Math.round(shownN);
    if (n !== countTextN) { countTextN = n; countText = n >= 9999 ? 'MAX' : String(n); }
    const text = countText;
    const pop = countPop > 0.5 ? 1 : 0;
    const tw = font.measure(text, 'big', 2);
    const w = tw + 8 + pop * 2, h = 20 + pop * 2;
    const x = Math.round(P.x - w / 2), y = Math.round(P.y - 20 - h / 2);
    const tierN = clamp(q.tier | 0, 0, 3);
    const top = tierN ? y - 5 : y;
    // 게이트 앞에서는 35%로 흐리게, 고른 칸 숫자와 겹치면 아예 비켜 준다(반투명 상자가 숫자 위에 얼룩처럼 남지 않게, V7). 부드럽게 바뀐다
    let target = 1;
    if (gateNear) target = selLbl.on && selLbl.x0 < x + w && selLbl.x1 > x && selLbl.y0 < y + h + 3 && selLbl.y1 > top ? 0 : 0.35;
    pillA += (target - pillA) * Math.min(1, dt * 14);
    if (Math.abs(target - pillA) < 0.02) pillA = target;
    pill.on = true; pill.x0 = x; pill.x1 = x + w; pill.y0 = top; pill.y1 = y + h + 2;   // 안 그릴 때도 자리는 남긴다(떠오르는 숫자 기준)
    if (pillA <= 0) return;
    ctx.globalAlpha = pillA;
    ctx.fillStyle = OUT;
    ctx.fillRect(x + 2, y, w - 4, h); ctx.fillRect(x, y + 2, w, h - 4); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = countTint > 0.1 ? '#2B5EB8' : countTint < -0.1 ? '#A92644' : '#3A3550';
    ctx.fillRect(x + 2, y + 1, w - 4, h - 2); ctx.fillRect(x + 1, y + 2, w - 2, h - 4);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(x + 3, y + 2, w - 6, 1);
    ctx.fillStyle = OUT;
    ctx.fillRect(Math.round(P.x) - 2, y + h - 1, 5, 2); ctx.fillRect(Math.round(P.x) - 1, y + h + 1, 3, 1);
    fOpt.size = 'big'; fOpt.scale = 2; fOpt.fill = '#FFFFFF'; fOpt.out = OUT;
    font.draw(ctx, text, P.x, y + h / 2, fOpt);
    // 무기 단계 표시: 단계가 있을 때만, 찬 칸만(V15)
    if (tierN) {
      const x0 = Math.round(P.x) - ((tierN * 6 - 1) >> 1);
      for (let i = 0; i < tierN; i++) {
        ctx.fillStyle = OUT; ctx.fillRect(x0 + i * 6, y - 5, 5, 4);
        ctx.fillStyle = WTIER[Math.min(3, i + 1)];
        ctx.fillRect(x0 + 1 + i * 6, y - 4, 3, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 총알·독침·로켓·조준선 ---------- */
  /* behind: 보스 총알 판(보스 − 1m)을 지난 총알만(보스 뒤로 지나가니 보스 그림 앞에 그리지 않는다 — 팔을 뚫고 가는 것처럼 보이지 않게),
     아니면 그 앞의 총알만 */
  /* 총알: 수·자리·피해는 시뮬레이션 그대로, 모양만 나눈다(ARSENAL.md 1절).
     모양 = 합친 병사 몫(병사 짧은 줄 · 분대장 긴 줄 · 중장갑 세 토막 연사 · 전차 포탄), 색 = 무기 단계(뭉치 스킬 중에는 금색),
     머리·꼬리 = 화력 강화(5단계부터 머리 2px, 10·20단계부터 불씨 꼬리 한 겹·두 겹, 30단계부터 머리 반짝임).
     한 총알의 모양은 그 총알의 x로 정한다(곧게 날아 x가 변하지 않는다 — 날아가는 동안 모양이 바뀌지 않게). 낮은 품질은 꼬리·잔상 없음 */
  const EMBER = ['#FF7A3C', '#C2452D'];
  function drawBullets(s, alpha, behind = false) {
    const ext = BULLET_SPEED * DT * (alpha - 1);   // 카메라와 같은 시간축(R4)
    const gold = s.hero && s.hero.id === 'mungchi' && s.hero.act > 0;
    const tier = s.squad.tier | 0;
    const col = gold ? GOLD_BULLET : WTIER[tier] || WTIER[0];
    const wide = gold || tier >= 2 ? 2 : 1;
    const fl = s.fireLv | 0, low = quality === 'low';
    const headW = fl >= 5 ? 2 : 1;
    const embers = low ? 0 : fl >= 20 ? 2 : fl >= 10 ? 1 : 0;
    const glint = !low && fl >= 30 && (f60 & 2);
    const lenK = tier >= 1 ? 1.3 : 1;
    const after = !low && tier >= 3;
    const plane = s.boss && s.boss.hp > 0 ? s.boss.z - 1 : Infinity;
    const ammo = AMMO_COL[s.ammo] ? s.ammo : '', ac = AMMO_COL[ammo];
    for (const b of s.bullets) {
      if ((b.z + ext > plane) !== behind) continue;
      if (!project(view, b.x, 0.75, b.z + ext)) continue;
      const hx = Math.round(P.x), hy = Math.round(P.y);
      if (ammo) {
        // 탄종(ARSENAL.md 3절): 모양이 탄종을 알린다 — 몸은 무기 단계 색, 머리는 탄종 색
        if (!project(view, b.x, 0.75, b.z + ext - (ammo === 'pierce' ? 2.6 : 1.4))) continue;
        const len = Math.max(1, Math.round(P.y) - hy);
        if (ammo === 'pierce') {            // 길고 가는 바늘
          ctx.fillStyle = col; ctx.fillRect(hx, hy, 1, len);
          ctx.fillStyle = ac; ctx.fillRect(hx, hy, 1, Math.max(2, len >> 1));
        } else if (ammo === 'burst') {      // 둥근 탄
          ctx.fillStyle = OUT; ctx.fillRect(hx - 1, hy - 1, 3, 4); ctx.fillRect(hx - 2, hy, 5, 2);
          ctx.fillStyle = col; ctx.fillRect(hx - 1, hy, 3, 2); ctx.fillRect(hx, hy - 1, 1, 4);
          ctx.fillStyle = ac; ctx.fillRect(hx, hy, 1, 2);
        } else if (ammo === 'rapid') {      // 짧은 토막 둘
          const seg = Math.max(1, len >> 1);
          ctx.fillStyle = col; ctx.fillRect(hx, hy, wide, seg); ctx.fillRect(hx, hy + seg + 2, wide, seg);
          ctx.fillStyle = ac; ctx.fillRect(hx, hy, wide, 1);
        } else {                            // 빙결: 마름모 + 옅은 꼬리
          ctx.fillStyle = ac; ctx.fillRect(hx - 1, hy, 3, 1); ctx.fillRect(hx, hy - 1, 1, 3);
          ctx.fillStyle = '#FFFFFF'; ctx.fillRect(hx, hy, 1, 1);
          ctx.fillStyle = col; ctx.fillRect(hx, hy + 2, 1, Math.max(1, len - 2));
        }
        if (b.c) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(hx - 1, hy, 3, 1); ctx.fillRect(hx, hy - 1, 1, 3); }
        for (let k = 0; k < embers; k++) { ctx.fillStyle = EMBER[k]; ctx.fillRect(hx, hy + len + 1 + 2 * k + ((f60 + k) & 1), 1, 1); }
        continue;
      }
      const u = (Math.abs(b.x) * 37.73) % 1;
      const shape = u < shotCum[0] ? 0 : u < shotCum[1] ? 1 : u < shotCum[2] ? 2 : 3;
      if (!project(view, b.x, 0.75, b.z + ext - 1.4 * lenK * (shape === 1 ? 1.5 : 1))) continue;
      const len = Math.max(1, Math.round(P.y) - hy);
      if (shape === 3) {
        // 전차 포탄: 3×3 + 외곽선, 뒤에 연기 한 점
        ctx.fillStyle = OUT; ctx.fillRect(hx - 2, hy - 1, 5, 5);
        ctx.fillStyle = col; ctx.fillRect(hx - 1, hy, 3, 3);
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(hx, hy, 1, 1);
        if (!low) { ctx.fillStyle = '#C9CED6'; ctx.fillRect(hx, hy + 4 + (f60 & 1), 1, 1); }
      } else if (shape === 2) {
        // 중장갑 연사: 짧은 토막 셋
        const seg = Math.max(1, Math.round(len / 3));
        ctx.fillStyle = col;
        for (let k = 0; k < 3; k++) ctx.fillRect(hx, hy + k * (seg + 1), wide, seg);
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(hx, hy, headW, 1);
      } else {
        const w = shape === 1 ? Math.max(2, wide) : wide;
        if (after) { ctx.fillStyle = col; ctx.globalAlpha = 0.4; ctx.fillRect(hx, hy + len + 1, w, Math.max(1, len >> 1)); ctx.globalAlpha = 1; }
        ctx.fillStyle = col; ctx.fillRect(hx, hy, w, len);
        if (tier >= 2 && len > 2) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(hx, hy + 1, 1, len - 2); }
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(hx, hy, shape === 1 ? 2 : headW, shape === 1 ? 2 : 1);
      }
      // 크리티컬(여우 펫): 머리에 흰 십자
      if (b.c) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(hx - 1, hy, 3, 1); ctx.fillRect(hx, hy - 1, 1, 3); }
      else if (glint) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(hx - 1, hy, 3, 1); }
      for (let k = 0; k < embers; k++) { ctx.fillStyle = EMBER[k]; ctx.fillRect(hx, hy + len + 1 + 2 * k + ((f60 + k) & 1), 1, 1); }
    }
  }
  function drawSpits(s, lag) {
    for (const sp of s.spits) {
      const T = sp.T || 1;
      const u = clamp(1 - (sp.t + lag) / T, 0, 1);
      const x = sp.sx + (sp.x - sp.sx) * u, z = sp.sz + (sp.z - sp.sz) * u, y = 1.2 * (1 - u) + 5 * u * (1 - u);
      if (!project(view, x, y, z)) continue;
      const r = P.s > 10 ? 3 : 2;
      ctx.fillStyle = OUT; ellipse(P.x, P.y, r, r);
      ctx.fillStyle = '#B9F25B'; ellipse(P.x, P.y, r - 1, r - 1);
      ctx.fillStyle = '#F4FFB0'; ctx.fillRect(Math.round(P.x) - 1, Math.round(P.y) - 1, 1, 1);
    }
  }
  function drawRockets(s, lag, qx, R) {
    const list = s.rockets || [];
    if (!list.length) return;
    // 로켓병 자리에서 날아오르게(시뮬은 분대 가운데서 쏜다)
    const q = sq;
    const i = (q.sp || []).findIndex((m) => m.k === 'rocket');
    const sl = i >= 0 ? slotPos(q, i, R, qx) : null;
    const ox = sl ? sl.x - qx : 0, oz = sl ? sl.z - q.z : 0;
    const puffs = beats(30);   // 연기 꼬리: 초당 30번(주사율과 상관없이, T8)
    const rlv = i >= 0 ? q.sp[i].lv || 1 : 1;   // 로켓병 레벨: Lv2 불꽃 꼬리, Lv3 두 줄로 꼬이는 꼬리 + 밝은 머리
    for (const rk of list) {
      const T = rk.T || 1;
      const u = clamp(1 - (rk.t + lag) / T, 0, 1);
      const x = rk.x0 + (rk.x - rk.x0) * u + ox * (1 - u), z = rk.z0 + (rk.z - rk.z0) * u + oz * (1 - u), y = 0.9 + 3 * 4 * u * (1 - u);
      if (!project(view, x, y, z)) continue;
      atlas.draw(ctx, 'rocketShot', (f60 >> 1) & 1, P.x, P.y + 3);
      if (rlv >= 3) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(Math.round(P.x) - 1, Math.round(P.y) - 2, 2, 2); }
      for (let k = puffs; k > 0; k--) {
        part(x, y - 0.2, z - 0.4, (Math.random() - 0.5) * 0.4, 0.3, 0, 0.45, '#C9CED6', 1, -0.5, 'smoke');
        if (rlv >= 3) { const a = time * 22 + k; part(x + Math.sin(a) * 0.28, y - 0.1, z - 0.3, 0, 0, 0, 0.28, '#FFB347', 1, 0); part(x - Math.sin(a) * 0.28, y - 0.1, z - 0.3, 0, 0, 0, 0.28, '#FFF4B0', 1, 0); }
        else if (rlv === 2) part(x + (Math.random() - 0.5) * 0.15, y - 0.1, z - 0.3, 0, -0.5, 0, 0.22, k & 1 ? '#FFB347' : '#FF7A3C', 1, 0);
      }
    }
  }
  function drawTracers(dt) {
    for (const t of tracers) {
      if (!t.on) continue;
      t.t += dt;
      if (t.t >= t.dur) { t.on = false; continue; }
      if (!project(view, t.x0, t.y0, t.z0)) continue;
      const ax = P.x, ay = P.y;
      if (!project(view, t.x1, t.y1, t.z1)) continue;
      const w = t.w > 1 && t.t > t.dur * 0.6 ? 1 : t.w || 1;   // 굵은 선은 끝날 무렵 가늘어진다
      ctx.fillStyle = OUT;
      pline(ax + w, ay, P.x + w, P.y);
      ctx.fillStyle = t.c;
      for (let k = 0; k < w; k++) pline(ax + k, ay, P.x + k, P.y);
      if (t.core && w > 1) { ctx.fillStyle = t.core; pline(ax + (w >> 1), ay, P.x + (w >> 1), P.y); }
    }
  }

  /* 분대 그림자: 땅 위 둥근 네모(대형과 같은 초타원) — 줄마다 폭을 구해 채운다 */
  function squadShadow(cx, cz, hx, hz) {
    if (!project(view, cx, 0, cz - hz)) return;
    const yN = P.y;
    if (!project(view, cx, 0, cz + hz)) return;
    const yF = P.y;
    const y0 = Math.round(yF), y1 = Math.round(yN);
    for (let y = y0; y <= y1; y++) {
      const v = y1 === y0 ? 0 : ((y + 0.5 - yF) / (yN - yF)) * 2 - 1;   // −1 먼 끝 … +1 가까운 끝
      const av = Math.min(1, Math.abs(v));
      const w = Math.pow(Math.max(0, 1 - av ** FORM_P), 1 / FORM_P);
      // 그 줄의 깊이에서의 배율(가까울수록 크다)
      const zz = cz + hz - ((v + 1) / 2) * 2 * hz;
      if (!project(view, cx, 0, zz)) continue;
      const half = hx * w * P.s;
      const l = Math.round(P.x - half), r = Math.round(P.x + half);
      if (r > l) ctx.fillRect(l, y, r - l, 1);
    }
  }

  /* ---------- 바닥 표시(조준 띠·그림자·독침 예고·내려찍기 구역·고리) ---------- */
  function drawDecals(s, bio, qx, lag) {
    const q = sq;   // 카메라와 같은 시간축의 분대(R4)
    if (q.n > 0) {
      const R = radius(q.n);
      ctx.fillStyle = bio.aim;
      groundQuad(qx - R - 0.3, qx + R + 0.3, q.z + R * 0.5, q.z + 30, 0.01);
      // 그림자 = 분대 몸(옆 ±R, 앞뒤 ±SQUAD_DEPTH·R)보다 조금 넓게, 대형과 같은 둥근 네모(SIM 8)
      ctx.fillStyle = bio.shadow;
      squadShadow(qx, q.z, R + 0.12, SQUAD_DEPTH * R + 0.12);
    }
    for (const sp of s.spits) {
      if (!project(view, sp.x, 0.02, sp.z)) continue;
      const k = clamp(1 - (sp.t + lag) / (sp.T || 1), 0, 1);
      ctx.fillStyle = '#B9F25B';
      ctx.globalAlpha = 0.22 + 0.3 * k;
      // 그리는 고리 = 맞는 폭(±SPIT_R)
      ellipse(P.x, P.y, SPIT_R * P.s, SPIT_R * P.s * 0.38);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#E8FFB0';
      ellRing(P.x, P.y, Math.max(2, SPIT_R * P.s * (1 - k)), Math.max(1, SPIT_R * P.s * 0.38 * (1 - k)), 1);
      ctx.fillStyle = '#B9F25B';
      ellRing(P.x, P.y, SPIT_R * P.s, SPIT_R * P.s * 0.38, 1);
    }
    if (s.pools) for (const pl of s.pools) {
      if (!project(view, pl.x, 0.02, pl.z)) continue;
      const rx = POOL_R * P.s, ry = POOL_R * P.s * 0.38;
      if (pl.t > 0) {
        // 예고: 테두리 = 해로워질 폭(±POOL_R), 안에서 보라 얼룩이 차오른다(다 차면 해롭다) — 밟고 지나가 버린 것은 흐리게
        const k = clamp(1 - (pl.t - lag) / (pl.T || 1), 0, 1);
        ctx.fillStyle = '#B26BFF';
        ctx.globalAlpha = pl.hit ? 0.12 : 0.18 + 0.2 * k;
        ellipse(P.x, P.y, Math.max(1, rx * k), Math.max(1, ry * k));
        ctx.globalAlpha = pl.hit ? 0.35 : 1;
        ctx.fillStyle = (((time * 10) | 0) & 1) ? '#F1DCFF' : '#B26BFF';
        ellRing(P.x, P.y, rx, ry, 1);
        ctx.globalAlpha = 1;
      } else {
        // 해로운 웅덩이: 짙은 보라 + 밝은 테두리 + 보글거리는 방울. 이미 밟았거나 곧 사라지면 흐려진다
        const fade = pl.hit ? 0.3 : Math.min(1, pl.life / 0.6);
        ctx.globalAlpha = 0.62 * fade;
        ctx.fillStyle = '#6B2FB8'; ellipse(P.x, P.y, rx, ry);
        ctx.globalAlpha = 0.8 * fade;
        ctx.fillStyle = '#B26BFF'; ellipse(P.x, P.y, rx * 0.62, ry * 0.62);
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#E5C8FF'; ellRing(P.x, P.y, rx, ry, 1);
        if (!pl.hit) {
          ctx.fillStyle = '#F1DCFF';
          for (let i = 0; i < 3; i++) {
            const u = (time * 1.6 + i * 0.37 + (pl.id % 7) * 0.13) % 1;
            ctx.fillRect(Math.round(P.x + (((pl.id * 5 + i * 11) % 9) / 4 - 1) * rx * 0.55), Math.round(P.y - u * 5), 1, 1);
          }
        }
        ctx.globalAlpha = 1;
      }
    }
    const b = s.boss;
    if (b && b.slam && b.hp > 0) {   // 보스가 쓰러지면 예고를 그리지 않는다
      const k = clamp(1 - b.slam.t / b.slam.T, 0, 1);
      const pulse = (((time * 4) | 0) & 1) ? 0.06 : 0;
      // 빨갛게 그리는 범위 = 실제로 맞는 범위(core.slamZone: 칸 ± SLAM_EDGE·분대 반지름 — 분대 중심이 그 안이면 맞는다).
      // 칸 자체는 조금 더 진하게: 칸 밖으로 번진 띠는 '분대 몸이 걸리는 만큼'이다
      const zn = slamZone(b.slam, radius(q.n));
      ctx.fillStyle = '#E8384F';
      ctx.globalAlpha = 0.2 + pulse;
      groundQuad(zn.x0, zn.x1, q.z - 3.5, b.z - 0.5, 0.02);
      ctx.globalAlpha = 0.1;
      groundQuad(Math.max(zn.x0, b.slam.x0 + 0.1), Math.min(zn.x1, b.slam.x1 - 0.1), q.z - 3.5, b.z - 0.5, 0.021);
      ctx.globalAlpha = 0.5;
      groundQuad(zn.x0, zn.x1, q.z - 3.5, q.z - 3.5 + (b.z - q.z + 3) * k, 0.03);
      ctx.globalAlpha = 1;
      // 맞는 범위의 가장자리: 밝은 선(분대 중심이 이 선 밖이면 안전)
      ctx.fillStyle = '#FFB3BC';
      for (const xe of [zn.x0, zn.x1]) {
        if (Math.abs(xe) >= ROAD - 0.05) continue;
        groundQuad(xe - 0.06, xe + 0.06, q.z - 3.5, b.z - 0.5, 0.035);
      }
      // 분대 쪽으로 행진하는 아래 화살표: 2px 두께의 V(팔 ~1.3u, 깊이 1.1u — 화면에서 납작해지지 않게) + 짙은 그림자 줄(V14)
      const xm = (b.slam.x0 + b.slam.x1) / 2;
      for (let i = 0; i < 6; i++) {
        const zz = q.z - 2 + ((((i * 3 - time * 6) % 18) + 18) % 18);
        if (zz > b.z - 1.7 || !project(view, xm, 0.04, zz)) continue;
        const tx = P.x, ty = P.y;
        project(view, xm - 0.65, 0.04, zz + 1.1);
        const lx = P.x, ly = P.y;
        project(view, xm + 0.65, 0.04, zz + 1.1);
        const rx = P.x, ry = P.y;
        ctx.fillStyle = '#A92644';
        pline(lx, ly + 2, tx, ty + 2); pline(tx, ty + 2, rx, ry + 2);
        ctx.fillStyle = '#FFE0D8';
        pline(lx, ly, tx, ty); pline(tx, ty, rx, ry);
        pline(lx, ly + 1, tx, ty + 1); pline(tx, ty + 1, rx, ry + 1);
      }
    }
    if (b && b.clash && time - stompT < 0.22) {
      // 짓밟기: 길 전체(분대 뒤 끝 ~ 보스 발)가 잠깐 밝아진다 — 옆으로 비켜 서 있어도 맞는 까닭이 보이게
      ctx.fillStyle = '#FFF1DE';
      ctx.globalAlpha = 0.22 * (1 - (time - stompT) / 0.22);
      groundQuad(-ROAD, ROAD, q.z - SQUAD_DEPTH * radius(q.n) - 0.4, b.z + 0.3, 0.025);
      ctx.globalAlpha = 1;
    }
    if (s.divs) for (const d of s.divs) drawDivider(d);
    for (const c of scorches) {
      if (!c.on) continue;
      if (!project(view, c.x, 0.02, c.z)) continue;
      ctx.fillStyle = '#1A1210';
      ctx.globalAlpha = 0.5 * (1 - c.t / SCORCH_T);
      ellipse(P.x, P.y, c.r * P.s, c.r * P.s * 0.36);
      ctx.globalAlpha = 1;
    }
    for (const r of rings) {
      if (!r.on) continue;
      if (!project(view, r.follow ? qx : r.x, 0.03, r.follow === 'sq' ? q.z : r.follow ? heroZ(q, radius(Math.max(1, q.n))) : r.z)) continue;
      const u = r.t / r.dur;
      const rr = r.r0 + (r.r1 - r.r0) * Math.sqrt(u);
      ctx.fillStyle = r.c;
      ctx.globalAlpha = u > 0.7 ? 0.5 : 1;
      ellRing(P.x, P.y, rr * P.s, rr * P.s * 0.36, r.thick);
      ctx.globalAlpha = 1;
    }
  }

  /* 분리대(무한모드 갈림길): 코(z0)에서 FORK_TAPER m 동안 노란 빗금 쐐기(여기서 몸이 가운데에서 밀려난다), 그 뒤 끝(z1)까지 콘크리트 턱.
     턱은 2m 토막으로 그려 노랑·검정 경고 띠가 번갈아 보인다 — 멀리서도 '여기부터 못 넘어간다'가 읽히게 */
  function drawDivider(d) {
    const zN = view.camZ + 1.5, zF = view.camZ + view.zFar;
    if (d.z1 < zN || d.z0 > zF) return;
    const zf = d.z0 + FORK_TAPER;
    // 쐐기: 코에서 턱까지 점점 넓어지는 빗금
    for (let k = 0; k < 4; k++) {
      const a = d.z0 + (k * FORK_TAPER) / 4, b = a + FORK_TAPER / 8, w = 0.08 + 0.1 * k;
      if (b < zN || a > zF) continue;
      ctx.fillStyle = '#FFD84A';
      groundQuad(-w, w, a, b, 0.02);
    }
    for (let z = zf, i = 0; z < d.z1; z += 2, i++) {
      const z2 = Math.min(d.z1, z + 2);
      if (z2 < zN || z > zF) continue;
      ctx.fillStyle = '#2A2E3A'; groundQuad(-0.34, 0.34, z, z2, 0.02);            // 바닥 그림자
      ctx.fillStyle = '#7C8494'; groundQuad(-0.26, 0.26, z, z2, 0.3);             // 옆면
      ctx.fillStyle = i & 1 ? '#2A2E3A' : '#FFD84A'; groundQuad(-0.2, 0.2, z, z2, 0.6);   // 윗면 경고 띠
    }
  }

  /* ---------- 충돌 크기 보기(?hitbox=1 또는 __squad.hitbox = true) ----------
     core.hitShapes(s)가 돌려주는, 시뮬레이션이 실제로 재는 모양을 땅 위에 1px 선으로 그린다(그림과 같은 시간축으로 보간).
     분대 몸(하늘색)과 겹치면 맞는다: 적·톱날(분홍 타원), 벽·상자·철창(주황 선 — 분대 앞 끝이 닿는 순간 옆으로 겹치면), 독침(연두 선 —
     떨어지는 순간), 보스 몸통(노랑 — 이 띠를 지나는 총알만 피해)·맞붙는 선(빨강). 분대 가운데 세로선 = 게이트 칸을 고르는 점 */
  const HB_COL = { squad: '#4FF3FF', foe: '#FF4FD8', saw: '#FF4FD8', wall: '#FFB347', crate: '#FFB347', cage: '#FFB347', spit: '#C8FF5A', pool: '#D9A6FF', bossHit: '#FFE34F', bossReach: '#FF5D5D' };
  function hbLine(x0, z0, x1, z1) {
    if (!project(view, x0, 0.03, z0)) return;
    const ax = P.x, ay = P.y;
    if (!project(view, x1, 0.03, z1)) return;
    pline(ax, ay, P.x, P.y);
  }
  function drawHitbox(s, qx, lag) {
    const q = s.squad;
    const sh = hitShapes(s);
    const dxq = qx - q.x, dzq = sq.z - q.z;
    for (const h of sh) {
      let ox = 0, oz = 0;
      if (h.k === 'squad') { ox = dxq; oz = dzq; }
      ctx.fillStyle = HB_COL[h.k] || '#FFFFFF';
      const x0 = h.x0 + ox, x1 = h.x1 + ox, z0 = Math.max(h.z0 + oz, view.camZ + 1.6), z1 = h.z1 + oz;
      if (z1 < view.camZ + 1.6) continue;
      if (h.ell) {
        // 땅 위 타원(좀비·톱날): 16각형으로
        const cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2, a = (h.x1 - h.x0) / 2, bz = (h.z1 - h.z0) / 2;
        for (let i = 0; i < 16; i++) {
          const t0 = (i / 16) * 2 * Math.PI, t1 = ((i + 1) / 16) * 2 * Math.PI;
          hbLine(cx + a * Math.cos(t0), cz + bz * Math.sin(t0), cx + a * Math.cos(t1), cz + bz * Math.sin(t1));
        }
      } else if (h.z1 > h.z0) {
        hbLine(x0, z0, x1, z0); hbLine(x1, z0, x1, z1); hbLine(x1, z1, x0, z1); hbLine(x0, z1, x0, z0);
      } else {
        hbLine(x0, z0, x1, z0);
        hbLine(x0, z0 - 0.25, x0, z0 + 0.25); hbLine(x1, z0 - 0.25, x1, z0 + 0.25);
      }
    }
    // 적·톱날은 그림처럼 보간한 자리에도 한 번 더(움직이는 쪽으로 1틱 안)
    ctx.fillStyle = HB_COL.foe;
    for (const f of s.foes) {
      if (!f.alive || f.kind === 'spit' || !f.awake || f.z < view.camZ + 2) continue;
      const z = f.z + f.spd * lag;
      if (project(view, f.x, 0.03, z)) ctx.fillRect(Math.round(P.x), Math.round(P.y), 1, 1);
    }
    if (q.n > 0) {
      ctx.fillStyle = HB_COL.squad;
      const R = radius(q.n);
      hbLine(qx, sq.z - SQUAD_DEPTH * R, qx, sq.z + SQUAD_DEPTH * R);
    }
    for (const b of s.bullets) if (project(view, b.x, 0.75, b.z)) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(Math.round(P.x), Math.round(P.y), 1, 1); }
  }
  function setHitbox(on) { hitboxOn = !!on; dirty = true; }

  /* 보스 타격감(그리기만): 받은 피해를 0.25초씩 모아 숫자로 띄우고, 체력이 75%·25% 아래로 내려갈 때 파편이 튄다(50%는 분노 연출이 있다) */
  function bossFeedback(s, dt) {
    const b = s.boss;
    if (!b || !(b.hp > 0)) { bossHpSeen = -1; bossDmgAcc = 0; bossMark = 4; return; }
    if (bossHpSeen < 0 || b.hp > bossHpSeen) { bossHpSeen = b.hp; bossMax = Math.max(b.max || 0, b.hp); bossMark = Math.min(4, Math.ceil((b.hp / bossMax) * 4)); bossDmgAcc = 0; bossDmgT = 0; return; }
    bossDmgAcc += bossHpSeen - b.hp;
    bossHpSeen = b.hp;
    bossDmgT += dt;
    if (bossDmgT >= 0.25 && bossDmgAcc >= 1) {
      if (!cardOn) float(b.x + (Math.random() - 0.5) * 2.4, 4.6 + Math.random(), b.z - 1, '-' + Math.round(bossDmgAcc), '#FFE38A', { life: 0.5, rise: 1.6 });
      bossDmgAcc = 0; bossDmgT = 0;
    }
    const mark = Math.ceil((b.hp / bossMax) * 4);
    if (mark < bossMark) {
      bossMark = mark;
      if (mark === 3 || mark === 1) {
        burst(b.x, 3, b.z - 1, 22, bfx().dust, 6, 5, 0.8);
        ring(b.x, b.z, 0.8, 4, 0.35, bfx().ring);
        shake(0.25);
      }
    }
  }

  /* ---------- 떠다니는 효과 ---------- */
  function drawFx(s, dt, qx) {
    const q = s.squad;
    for (const f of fxs) {
      if (!f.on) continue;
      f.t += dt;
      if (f.t >= f.dur) { f.on = false; continue; }
      const u = f.t / f.dur;
      switch (f.kind) {
        case 'puff': {
          if (f.vz) f.z += f.vz * dt;   // 분대에서 난 연기는 분대와 같이 간다
          if (!project(view, f.x, f.y, f.z)) break;
          const step = f.step || (P.s > 12 ? 0 : 1);
          const fr = Math.min(3, (u * 4) | 0);
          const r = atlas.get('puff', fr, step);
          atlas.blit(ctx, r, Math.round(P.x - r.w / 2), Math.round(P.y - r.h / 2));
          break;
        }
        case 'boom': {
          if (!project(view, f.x, f.y, f.z)) break;
          const r = atlas.get('boomfx', u < 0.4 ? 0 : 1, P.s > 10 ? 0 : 1);
          atlas.blit(ctx, r, Math.round(P.x - r.w / 2), Math.round(P.y - r.h / 2));
          break;
        }
        case 'spark':
        case 'glint': {
          if (!project(view, f.x, f.y, f.z)) break;
          const r = atlas.get(f.kind, u < 0.5 ? 0 : 1);
          atlas.blit(ctx, r, Math.round(P.x - r.w / 2), Math.round(P.y - r.h / 2));
          break;
        }
        case 'lunge': {
          if (!project(view, f.x, 0, f.z - 0.3)) break;
          const sh = f.sheet;
          const fr = f.foe === 'brute' ? FR.brute.lunge[0] : FR.foe.lunge[u > 0.5 ? 1 : 0];
          atlas.draw(ctx, sh, fr, P.x, P.y, 0, f.alt || '');
          break;
        }
        case 'sadCaptive': {
          if (!project(view, f.x, 0.1, f.z)) break;
          const st = P.s > 12 ? 0 : 1;
          atlas.draw(ctx, CAPTIVE_ART[f.k] || 'captive_medic', FR.captive.sad[0], P.x, P.y, st);
          break;
        }
        case 'spHit': {
          // 맞아서 쓰러짐: 별이 돌고 펑
          if (!project(view, f.x, 0, f.z)) break;
          const sh = UNIT_ART[f.k] || 'soldier';
          if (u < 0.75) {
            const r = atlas.draw(ctx, sh, FR.special.hit[0], P.x + ((f60 & 2) ? 1 : -1), P.y);
            for (let i = 0; i < 3; i++) { const a = f.t * 9 + i * 2.1; atlas.draw(ctx, 'star', 1, P.x + Math.cos(a) * 7, Math.round(P.y) - r.ay + Math.sin(a) * 2); }
          } else if (!f.n) { f.n = 1; fx('puff', f.x, 0.5, f.z, 0.3, { step: 1 }); }
          break;
        }
        case 'spRun': {
          // 호위가 부족해 울며 떠난다
          const x = f.x + f.vx * f.t, z = f.z + f.vz * f.t;
          if (!project(view, x, 0, z)) break;
          // 카메라 쪽으로 뛰어오므로 앞모습(포로 그림의 우는 얼굴)으로, 깡충깡충 + 두 눈 옆으로 눈물이 흐른다(V12)
          const sh = CAPTIVE_ART[f.k] || 'captive_medic';
          const hop = Math.round(Math.abs(Math.sin(f.t * 13)) * 3);
          const r = atlas.draw(ctx, sh, FR.captive.sad[0], P.x, P.y - hop);
          const eyeY = Math.round(P.y - hop) - r.ay + 7;
          const drip = ((f.t * 7) | 0) % 3;
          atlas.draw(ctx, 'tear', 0, P.x - r.ax + 2, eyeY + 2 + drip);
          atlas.draw(ctx, 'tear', 0, P.x - r.ax + 11, eyeY + 2 + ((drip + 1) % 3));
          break;
        }
        default:
      }
    }
    void q; void qx;
  }
  /* 살아 있는 파편만 돈다. 죽은 칸은 빈 칸 목록으로 돌려주고, 살아 있는 목록은 순서를 지켜 당긴다(그리는 순서가 바뀌어 깜빡이지 않게) */
  function drawParts(dt) {
    let j = 0;
    for (let k = 0; k < nLive; k++) {
      const idx = pLive[k];
      const p = parts[idx];
      p.life -= dt;
      if (p.life <= 0) { p.on = false; pFree[nFree++] = idx; continue; }
      pLive[j++] = idx;
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0) { p.y = 0; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      if (!project(view, p.x, p.y, p.z)) continue;
      if (p.spr) {
        const fr = p.spr === 'coin' ? ((time * 10) | 0) & 3 : p.spr === 'smoke' ? (p.life < p.max * 0.5 ? 1 : 0) : 0;
        if (p.life < p.max * 0.25 && (f60 & 1)) continue;
        const r = atlas.get(p.spr, fr);
        atlas.blit(ctx, r, Math.round(P.x - r.w / 2), Math.round(P.y - r.h / 2));
        continue;
      }
      ctx.fillStyle = p.c;
      const sz = P.s > 10 ? p.size : 1;
      ctx.fillRect(Math.round(P.x), Math.round(P.y), sz, sz);
    }
    nLive = j;
  }
  function drawFloats(dt, show) {
    for (const f of floats) {
      if (!f.on) continue;
      f.life -= dt;
      if (f.life <= 0) { f.on = false; continue; }
      f.y += dt * f.rise;
      f.z += f.vz * dt;
      if (!show || !project(view, f.x, f.y, f.z)) continue;
      const k = 1 - f.life / f.max;
      const scale = f.scale === 2 && k < 0.07 ? 1 : f.scale;   // 작게 떴다가 커진다
      let y = P.y;
      // 게이트 결과 숫자는 말풍선(무기 단계 칸 포함) 위 6px 이상에서(V4). 다 큰 크기 기준이라 커질 때 튀지 않는다
      if (f.pill && pill.on) { const lim = pill.y0 - 6 - font.height('big', f.scale) / 2; if (y > lim) y = lim; }
      ctx.globalAlpha = (f.life < 0.2 ? 0.5 : 1) * f.alpha;
      if (f.icon) drawIconText(f.icon, f.text, P.x, y, f.fill, f.out, 1);
      else { fOpt.size = 'big'; fOpt.scale = scale; fOpt.fill = f.fill; fOpt.out = f.out; font.draw(ctx, f.text, P.x, y, fOpt); }
      ctx.globalAlpha = 1;
    }
  }
  function drawFlies(dt) {
    for (const f of flies) {
      if (!f.on) continue;
      f.t += dt;
      if (f.t < 0) continue;
      if (f.t >= f.dur) { f.on = false; continue; }
      const u = f.t / f.dur, e = u * u * (3 - 2 * u);
      const mx = (f.sx + f.tx) / 2 - 24, my = Math.min(f.sy, f.ty) - 18;
      const x = (1 - e) * (1 - e) * f.sx + 2 * (1 - e) * e * mx + e * e * f.tx;
      const y = (1 - e) * (1 - e) * f.sy + 2 * (1 - e) * e * my + e * e * f.ty;
      const r = atlas.get('coin', ((time * 10) | 0) & 3);
      atlas.blit(ctx, r, Math.round(x - r.w / 2), Math.round(y - r.h / 2));
    }
  }
  /* 화면 날씨: 지역의 weather 표(눈·재·포자·불씨·색종이) — 눈송이 풀 40개를 같이 쓴다(새 객체 없음) */
  function drawWeather(w, dt) {
    const n = Math.min(flakes.length, quality === 'low' ? w.low : w.n);
    const vy = w.vy * 0.16, cols = w.col, nc = cols.length, conf = w.kind === 'confetti';
    for (let i = 0; i < n; i++) {
      const f = flakes[i];
      f.y += dt * f.v * vy;
      if (f.y > 1) { f.y -= 1; f.x = Math.random(); } else if (f.y < 0) { f.y += 1; f.x = Math.random(); }
      if (w.flicker && ((f60 + i * 7) % 23) < 4) continue;   // 불씨 깜빡임
      const x = Math.round(f.x * BW + Math.sin(time * w.swayF + f.p) * w.sway), y = Math.round(f.y * BH);
      ctx.fillStyle = cols[i % nc];
      if (conf) { if (((f60 >> 3) + i) & 1) ctx.fillRect(x, y, 2, 1); else ctx.fillRect(x, y, 1, 2); }
      else { const b = f.v > w.big ? 2 : 1; ctx.fillRect(x, y, b, b); }
    }
  }

  /* ---------- 컷인(첫 스킬, 보스전 첫 스킬만) ----------
     한글 스킬 이름은 띠 높이만 한 작은 덧캔버스에(전체 화면 크기 캔버스를 첫 스킬 때 만들지 않는다, T5).
     덧캔버스와 영웅별 제목 그림은 준비가 끝난 뒤·화면 크기가 바뀐 뒤 쉬는 틈에 미리 만든다. */
  let ov = null, octx = null, ovShown = false;
  const titles = new Map();    // 영웅 id → { c, ox, oy } (미리 그린 제목)
  let titleKey = '';
  const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 30));
  /* 컷인 띠: 25~60m 앞(열쇠 상자·몰이 줄·먼 게이트)을 가리지 않게 HUD 바로 아래(CSS 58px)에 얇게(화면 높이 11%, 최대 44px) —
     하늘과 아주 먼 길만 가린다(F5: 예전 13%부터 16% 높이는 360x640에서 오른쪽 25~60m를 1초 가렸다) */
  function band() {
    const hh = Math.min(44, Math.round(VH * 0.11));
    return { hh, y0: Math.min(Math.round(VH * 0.13), Math.ceil(58 / (cssPer || 1))) };
  }
  function sizeOverlay() {
    if (!ov) return;
    const { hh, y0 } = band();
    const w = Math.round(cssW * dpr), h = Math.max(1, hh * K);
    if (ov.width !== w) ov.width = w;
    if (ov.height !== h) ov.height = h;
    ov.style.top = y0 * cssPer + 'px';
    ov.style.width = cssW + 'px';
    ov.style.height = hh * cssPer + 'px';
    ovShown = true; clearOverlay();
  }
  function overlay() {
    if (ov || typeof document === 'undefined' || !cvs.parentNode) return ov;
    ov = document.createElement('canvas');
    ov.setAttribute('aria-hidden', 'true');
    ov.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:1;display:none;';
    cvs.parentNode.insertBefore(ov, cvs.nextSibling);
    octx = ov.getContext('2d');
    sizeOverlay();
    return ov;
  }
  function clearOverlay() {
    if (octx && ovShown) { octx.clearRect(0, 0, ov.width, ov.height); ovShown = false; ov.style.display = 'none'; }
  }
  function titleFont() { const big = Math.round(Math.min(28, cssW * 0.07) * dpr); return { big, small: Math.round(big * 0.55) }; }
  function renderTitles() {
    if (typeof document === 'undefined' || !cssW) return;
    const { big, small } = titleFont();
    const key = big + '|' + dpr;
    if (key === titleKey) return;
    titles.clear();
    titleKey = key;
    const lw1 = Math.max(3, big * 0.2), lw2 = Math.max(2, small * 0.25);
    for (const id of Object.keys(HEROES)) {
      const H = HEROES[id];
      if (!H || !H.skill) continue;
      const c = mkCanvas(1, 1);
      const g = c.getContext('2d');
      const f1 = `${big}px Jua, "Black Han Sans", sans-serif`, f2 = `${small}px Jua, "Black Han Sans", sans-serif`;
      g.font = f1; const w1 = g.measureText(H.skill.name + '!').width;
      g.font = f2; const w2 = g.measureText(H.name).width;
      const pad = Math.ceil(lw1) + 2;
      c.width = Math.ceil(Math.max(w1, w2) + pad * 2);
      c.height = Math.ceil(big * 0.95 + small + pad * 2 + big * 0.5);
      const oy = pad + big / 2;
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.font = f1; g.lineWidth = lw1; g.strokeStyle = OUT;
      g.strokeText(H.skill.name + '!', pad, oy); g.fillStyle = '#FFF4B0'; g.fillText(H.skill.name + '!', pad, oy);
      g.font = f2; g.lineWidth = lw2;
      g.strokeText(H.name, pad, oy + big * 0.95); g.fillStyle = '#FFFFFF'; g.fillText(H.name, pad, oy + big * 0.95);
      titles.set(id, { c, ox: pad, oy });
    }
  }
  function prepCut() {
    overlay();
    const go = () => idle(renderTitles);
    if (typeof document !== 'undefined' && document.fonts && document.fonts.load) document.fonts.load('28px Jua').then(go, go);
    else go();
  }
  function idleAfterReady() { idle(prepCut); }
  /* 보스 이름(이 레벨 것)을 쉬는 틈에 미리 그려 둔다(컷인 제목과 같은 방식, 등장 순간에 글자를 그리지 않게) */
  function renderBossTitle() {
    if (typeof document === 'undefined' || !cssW || tagL < 1) return;
    const b = biomeOf(tagL).boss;
    if (!b) return;
    const { big, small } = titleFont();
    const key = tagL + '|' + big + '|' + dpr;
    if (key === bossTitleKey) return;
    bossTitleKey = key;
    const tier = BOSS_TIER[bossTag];
    const name = bossNameOf(tagL, bossTag), line = tier && tier.line ? tier.line : b.line;
    const lw1 = Math.max(3, big * 0.2), lw2 = Math.max(2, small * 0.25);
    const c = mkCanvas(1, 1);
    const g = c.getContext('2d');
    const f1 = `${big}px Jua, "Black Han Sans", sans-serif`, f2 = `${small}px Jua, "Black Han Sans", sans-serif`;
    g.font = f1; const w1 = g.measureText(name).width;
    g.font = f2; const w2 = g.measureText(line).width;
    const pad = Math.ceil(lw1) + 2;
    c.width = Math.ceil(Math.max(w1, w2) + pad * 2);
    c.height = Math.ceil(big * 0.95 + small + pad * 2 + big * 0.5);
    const oy = pad + big / 2;
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = f1; g.lineWidth = lw1; g.strokeStyle = OUT;
    g.strokeText(name, pad, oy); g.fillStyle = bossTag === 'super' ? '#FFD84A' : '#FFF4B0'; g.fillText(name, pad, oy);
    g.font = f2; g.lineWidth = lw2;
    g.strokeText(line, pad, oy + big * 0.95); g.fillStyle = '#FFFFFF'; g.fillText(line, pad, oy + big * 0.95);
    bossTitle = { c, ox: pad, oy };
  }
  /* 보스 등장 띠: 등장 0.2초 뒤부터 1.4초, 오른쪽에서 밀려 들어온다. 띠 색 = 보스 색, 대왕은 금 테두리. 작은 보스(lod .33) + 이름·대사 */
  function drawBossCut(dt) {
    if (!bossCut) return;
    bossCut.t += dt;
    const D = 1.4, t = bossCut.t - 0.2;
    if (t >= D || cut) { bossCut = null; if (!cut) clearOverlay(); return; }
    if (t < 0) return;
    const fxc = bfx();
    const inK = Math.min(1, t / 0.12), outK = t > D - 0.15 ? (t - (D - 0.15)) / 0.15 : 0;
    const slide = Math.round((1 - inK) * BW - outK * BW);
    const { hh, y0 } = band();
    const edge = bossTag === 'super' ? '#FFD84A' : '#FFF1DE';
    for (let y = 0; y < hh; y++) {
      const sk = Math.round((hh - y) * 0.35);
      ctx.fillStyle = y < 2 || y >= hh - 2 ? edge : y === 2 || y === hh - 3 ? OUT : fxc.band;
      ctx.fillRect(slide - 24 - sk, y0 + y, BW + 48, 1);
    }
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 7; i++) {
      const yy = y0 + 6 + ((i * 7) % (hh - 12));
      const xx = BW + 30 - (((i * 53 + time * 420) % (BW + 60)));
      ctx.fillRect(Math.round(xx) + slide, yy, 14 + (i % 3) * 8, 1);
    }
    const bs0 = skinOf('boss', curBid), bs = atlas.has(bs0) ? bs0 : 'boss';
    const fr = atlas.get(bs, FR.boss.roar[((time * 8) | 0) & 1], 3);
    const bx = slide + BW - 8 - fr.w, by = y0 + hh - 3 - fr.h;
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, bx, Math.max(y0 + 1, by), fr.w, fr.h);
    const o = overlay();
    if (!o) return;
    if (!ovShown) { ov.style.display = 'block'; ovShown = true; }
    octx.clearRect(0, 0, ov.width, ov.height);
    if (bossTitle) octx.drawImage(bossTitle.c, Math.round((slide + 8) * K - bossTitle.ox), Math.round(hh * 0.42 * K - bossTitle.oy));
  }
  function drawCut(dt) {
    if (!cut) return;
    cut.t += dt;
    const D = 0.8;
    if (cut.t >= D) { cut = null; clearOverlay(); return; }
    const art = HERO_ART[cut.id] || HERO_ART.mungchi;
    const H = HEROES[cut.id];
    const t = cut.t;
    const inK = Math.min(1, t / 0.1), outK = t > D - 0.12 ? (t - (D - 0.12)) / 0.12 : 0;
    const slide = Math.round((1 - inK) * -BW + outK * BW);
    const { hh, y0 } = band();
    for (let y = 0; y < hh; y++) {
      const sk = Math.round((hh - y) * 0.35);
      ctx.fillStyle = y < 2 || y >= hh - 2 ? '#FFD84A' : y === 2 || y === hh - 3 ? OUT : art.band || art.color;
      ctx.fillRect(slide - 24 + sk, y0 + y, BW + 48, 1);
    }
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    for (let i = 0; i < 9; i++) {
      const yy = y0 + 6 + ((i * 7) % (hh - 12));
      const xx = ((i * 53 + time * 420) % (BW + 60)) - 30;
      ctx.fillRect(Math.round(xx) + slide, yy, 14 + (i % 3) * 8, 1);
    }
    const fr = atlas.get(art.portrait, SHEETS[art.portrait].frames.length > 1 ? 1 : 0);   // 얼굴 [0 미소, 1 외침]
    const sc = Math.max(1, Math.min(BW >= 170 ? 3 : 2, Math.floor((hh - 4) / fr.h)));
    const px = slide + 6, py = y0 + Math.round((hh - fr.h * sc) / 2);
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.w, fr.h, px, py, fr.w * sc, fr.h * sc);
    // 한글 스킬 이름은 띠 크기 덧캔버스에(Jua). 띠 위쪽이 덧캔버스 0
    const o = overlay();
    if (!o) return;
    if (!ovShown) { ov.style.display = 'block'; ovShown = true; }
    octx.clearRect(0, 0, ov.width, ov.height);
    if (!H) return;
    const X = (px + fr.w * sc + 8) * K, Y = hh * 0.42 * K;
    const tl = titles.get(cut.id);
    if (tl) { octx.drawImage(tl.c, Math.round(X - tl.ox), Math.round(Y - tl.oy)); return; }
    // 아직 제목을 미리 못 그렸으면(글꼴이 늦게 왔을 때) 바로 쓴다
    const { big, small } = titleFont();
    octx.textAlign = 'left'; octx.textBaseline = 'middle'; octx.lineJoin = 'round';
    octx.font = `${big}px Jua, "Black Han Sans", sans-serif`;
    octx.lineWidth = Math.max(3, big * 0.2);
    octx.strokeStyle = OUT;
    octx.strokeText(H.skill.name + '!', X, Y);
    octx.fillStyle = '#FFF4B0';
    octx.fillText(H.skill.name + '!', X, Y);
    octx.font = `${small}px Jua, "Black Han Sans", sans-serif`;
    octx.lineWidth = Math.max(2, small * 0.25);
    octx.strokeText(H.name, X, Y + big * 0.95);
    octx.fillStyle = '#FFFFFF';
    octx.fillText(H.name, X, Y + big * 0.95);
  }

  /* ---------- 한 프레임 ---------- */
  function draw(s, alpha, dt, prevZ) {
    if (!img) return;
    // 일시정지·결과 화면: 시뮬 시간이 멈추면 그리기를 멈춘다(R7)
    if (s === lastS && s.t === lastT) stillFor += dt;
    else { stillFor = 0; lastS = s; lastT = s.t; }
    const frozen = frozenSet || stillFor > 0.25;
    if (frozen && !dirty) return;
    dirty = false;
    const rdt = frozen ? 0 : Math.min(0.1, Math.max(0, dt));
    prevTime = time;
    time += rdt;
    f60 = (time * 60) | 0;      // 60Hz 시계(깜빡임·박자는 프레임 수가 아니라 이것으로, T8)
    selLbl.on = false;
    const q = s.squad;
    curBid = biomeOf(s.L || 1).id;
    if ((s.L || 1) !== tagL) { tagL = s.L || 1; bossTag = levelTag(tagL).tag; idle(renderBossTitle); }
    const bio = BIOME[curBid] || BIOME.desert;
    alpha = clamp(alpha || 0, 0, 1);
    const lag = (1 - alpha) * DT;
    // 카메라(보스전에는 뒤로 빠진다. 다시 시작하면 reset에서 되돌린다)
    const wantDolly = s.boss ? 1 : 0;
    if (dolly !== wantDolly) {
      dolly += (wantDolly - dolly) * Math.min(1, rdt * 1.6);
      if (Math.abs(wantDolly - dolly) < 0.002) dolly = wantDolly;
    }
    if (dolly !== fitted) layout();
    const qx = q.x - (q.vx || 0) * lag;
    sq.x = qx; sq.z = q.z - (q.vz || 0) * lag; sq.vz = q.vz || 0; sq.vx = q.vx || 0; sq.n = q.n; sq.tier = q.tier || 0; sq.sp = q.sp || [];
    camX += (qx * 0.35 - camX) * Math.min(1, rdt * 8);
    view.camX = camX;
    view.camZ = prevZ + (q.z - prevZ) * alpha - view.back;
    trauma = Math.max(0, trauma - rdt * 1.6);
    const t2 = trauma * trauma;
    view.shakeX = shakeOn ? Math.round((Math.random() * 2 - 1) * 4 * t2) : 0;
    view.shakeY = shakeOn ? Math.round((Math.random() * 2 - 1) * 4 * t2) : 0;

    const tg0 = performance.now();
    ground.draw(u32, BW, BH, view, bio, camX, quality);
    const tgm = performance.now();
    ctx.putImageData(img, 0, 0);
    const tg1 = performance.now();
    groundMs += (tgm - tg0 - groundMs) * 0.05;
    putMs += (tg1 - tgm - putMs) * 0.05;
    ctx.globalAlpha = 1;
    drawDecals(s, bio, qx, lag);

    // 정렬할 것 모으기
    nItems = 0;
    scenery(bio);
    const zMax = view.camZ + view.zFar;
    for (const row of s.rows) if (!row.done && row.z < zMax) push(row.z, 1, row);
    for (const p of s.props) if (p.alive && p.z < zMax && p.z > view.camZ + 1.5) push(p.z - 0.35, 2, p);
    for (const w of s.saws) if (w.z < zMax && w.z > view.camZ + 2) push(w.z, 3, w);
    for (const f of s.foes) if (f.alive && f.z < zMax && f.z > view.camZ + 2) push(f.z, 4, f);
    if (s.boss && (s.boss.hp > 0 || bossDeath)) { push(s.boss.z, 5, s.boss); push(s.boss.z + 0.05, 11, null); }
    const R = updateFormation(s, rdt, qx);
    {
      // 총알 모양 몫(합친 병사 구성) · 물결의 맨 앞줄
      const c = fComp || EMPTY_COMP;
      let tot = 0, acc = 0;
      for (let t = 0; t < 4; t++) tot += c[t] * TIER_MEN[t];
      for (let t = 0; t < 4; t++) { const w = tot > 0 ? (c[t] * TIER_MEN[t]) / tot : t === 0 ? 1 : 0; shotShare[t] = w; acc += w; shotCum[t] = t === 3 ? 1 : acc; }
      waveFront = 0;
      for (const u of units) if (u.z > waveFront) waveFront = u.z;
      bossFeedback(s, rdt);
    }
    {
      // 그림이 적으면 하나하나가 더 자주 쏜다. 맞으면 세 장 중 하나쯤 붉어진다. 줄 안에서는 가운데를 나중에(위에)
      const NU = units.length;
      firePeriod = Math.max(6, Math.round(NU / 2.2));
      hurtMod = clamp(Math.ceil(NU / 3), 1, 11);
      const bias = 0.03 / Math.max(0.5, R);
      if (q.n > 0) for (const u of units) push(sq.z + u.z + Math.abs(u.x) * bias, 6, u);
      for (const gh of fading) push(sq.z + gh.z + Math.abs(gh.x) * bias, 12, gh);
    }
    const flagsN = q.n >= 1000 ? 3 : q.n >= 500 ? 2 : q.n >= 200 ? 1 : 0;
    // 깃발은 맨 앞줄 바로 뒤(먼 쪽)에 꽂아 앞줄 그림이 깃대 아래를 덮는다(가운데 대장 그림을 가리지 않게)
    for (let i = 0; i < flagsN; i++) push(sq.z + Math.max(0, SQUAD_DEPTH * R - FORM_IN) + 0.06 + 0.01 * i, 9, null, i);
    const sp = sq.sp;
    if (q.n > 0) for (let i = 0; i < sp.length; i++) push(slotPos(sq, i, R, qx).z, 7, sp[i], i);
    if (s.hero && (q.n > 0 || s.phase === 'lost')) push(heroZ(sq, R), 8, s.hero);
    if (s.pet && (q.n > 0 || s.phase === 'lost')) push(heroZ(sq, R) - 0.55, 13, s.pet);
    const nOrd = sortItems();
    // 길가 소품은 먼저(가까운 나무가 게이트 숫자를 가리지 않게)
    for (let j = 0; j < nOrd; j++) { const it = items[sortKeys[j] & 1023]; if (it.k === 10) drawScenery(it.o, it.i, it.x, it.z); }
    for (let j = 0; j < nOrd; j++) {
      const it = items[sortKeys[j] & 1023];
      switch (it.k) {
        case 1: drawRow(s, it.o); break;
        case 2: if (it.o.kind === 'wall') drawWall(s, it.o); else if (it.o.kind === 'cage') drawCage(s, it.o); else drawCrate(s, it.o); break;
        case 3: drawSaw(s, it.o, lag); break;
        case 4: drawFoe(s, it.o, lag, bio); break;
        case 5: drawBoss(s, it.o, lag, bio); break;
        case 6: drawMember(s, it.o, qx, false); break;
        case 12: drawMember(s, it.o, qx, true); break;
        case 7: drawSpecial(s, it.o, it.i, qx, R); break;
        case 8: drawHero(s, it.o, qx, R); break;
        case 13: drawPet(s, it.o, qx, R); break;
        case 9: drawFlag(s, it.i, qx, R, it.z); break;
        case 11: if (s.phase !== 'won' && s.phase !== 'lost') drawBullets(s, alpha, true); break;
        default:
      }
    }
    // 오래된 렌더러 상태 정리
    if (lodScen.size > 400) lodScen.clear();
    if (lodFoe.size > 600) lodFoe.clear();
    if (lodSaw.size > 200) lodSaw.clear();
    if (lodCage.size > 200) lodCage.clear();
    if (flashFoe.size > 300) flashFoe.clear();
    if (hitSeen.size > 300) hitSeen.clear();
    if (bruteStep.size > 300) bruteStep.clear();
    if (pendingGet.length && time - pendingGet[0].t > 2) pendingGet.shift();

    drawSpits(s, lag);
    drawRockets(s, lag, qx, R);
    if (s.phase !== 'won' && s.phase !== 'lost') drawBullets(s, alpha);   // 끝난 판의 총알은 멈춰 있으니 그리지 않는다
    drawTracers(rdt);
    for (const r of rings) if (r.on) { r.t += rdt; if (r.t >= r.dur) r.on = false; }
    for (const c of scorches) if (c.on) { c.t += rdt; if (c.t >= SCORCH_T) c.on = false; }
    drawFx(s, rdt, qx);
    drawParts(rdt);
    if (hitboxOn) drawHitbox(s, qx, lag);
    drawCount(s, rdt, qx);
    drawFloats(rdt, !cardOn && s.t > 0);   // 게이트 숫자는 말풍선 위에(R3·V4), 출발 전에는 안 그린다(V6)
    drawFlips(rdt, !cardOn);
    if (bio.weather) drawWeather(bio.weather, rdt);
    drawFlies(rdt);
    drawCut(rdt);
    drawBossCut(rdt);
    if (flashA > 0) {
      ctx.fillStyle = flashCss;
      ctx.globalAlpha = Math.min(0.5, flashA);
      ctx.fillRect(0, 0, BW, BH);
      ctx.globalAlpha = 1;
      flashA = Math.max(0, flashA - rdt * 1.8);
    }
    if (time - surgeT < SURGE_CUE) drawSurgeCue(time - surgeT);
    if (s.hero && s.hero.act > 0 && !reduce && quality !== 'low' && s.phase !== 'won' && s.phase !== 'lost') {
      // 영웅 스킬이 켜진 동안: 화면 양옆에 영웅 색 속도선이 아래로 흐른다
      const W = Math.floor(VW), Hh = Math.floor(VH);
      ctx.fillStyle = SKILL_LINE[s.hero.id] || '#FFFFFF';
      ctx.globalAlpha = 0.5 * Math.min(1, s.hero.act / 0.4);
      for (let i = 0; i < 10; i++) {
        const side = i & 1, x = side ? W - 2 - ((i * 5) % 9) : 1 + ((i * 5) % 9);
        const y = ((time * (150 + i * 23) + i * 61) % (Hh + 30)) - 30;
        ctx.fillRect(x, y | 0, 1, 10 + (i % 3) * 6);
      }
      ctx.globalAlpha = 1;
    }
    const crisis = q.n >= 8 && q.peak > 0 && q.n < 0.4 * q.peak && time - hurtAt < 2.5 && (s.phase === 'run' || s.phase === 'arena');
    if (crisis) {
      // 위기: 방금 맞았고 병력이 이 판 최고치의 40% 아래 — 가장자리가 붉게 맥동한다(숫자를 안 봐도 위험을 알게)
      const W = Math.floor(VW), Hh = Math.floor(VH);
      ctx.fillStyle = '#A92644';
      ctx.globalAlpha = (0.1 + 0.06 * Math.sin(time * 5)) * Math.min(1, (2.5 - (time - hurtAt)) / 0.6);
      for (let i = 0; i < 2; i++) {
        const m = i * 3;
        ctx.fillRect(m, m, W - 2 * m, 3); ctx.fillRect(m, Hh - m - 3, W - 2 * m, 3);
        ctx.fillRect(m, m + 3, 3, Hh - 2 * m - 6); ctx.fillRect(W - m - 3, m + 3, 3, Hh - 2 * m - 6);
      }
      ctx.globalAlpha = 1;
    }
    if (q.n > 0 && q.n < 8 && s.phase !== 'won') {
      // 병력이 아주 적으면 보이는 화면 가장자리를 천천히 붉게(번쩍이지 않게)
      const W = Math.floor(VW), Hh = Math.floor(VH);
      ctx.fillStyle = '#A92644';
      ctx.globalAlpha = 0.16 + 0.08 * Math.sin(time * 3);
      for (let i = 0; i < 3; i++) {
        const m = i * 3;
        ctx.fillRect(m, m, W - 2 * m, 3); ctx.fillRect(m, Hh - m - 3, W - 2 * m, 3);
        ctx.fillRect(m, m + 3, 3, Hh - 2 * m - 6); ctx.fillRect(W - m - 3, m + 3, 3, Hh - 2 * m - 6);
      }
      ctx.globalAlpha = 1;
    }
    spawnBudget = SPAWN_CAP;
    drawMs += (performance.now() - tg0 - drawMs) * 0.05;
  }

  /* ---------- DOM용 그림(영웅 얼굴·아이콘) ---------- */
  function portrait(id, scale = 3) {
    const art = HERO_ART[id] || HERO_ART.mungchi;
    const sh = SHEETS[art.portrait];
    const pal = typeof sh.pal === 'string' ? PAL[sh.pal] : sh.pal;
    return rasterCanvas(outline(frameRaster(sh.frames[0], pal), OUT), Math.max(1, scale | 0));
  }
  /* 펫 얼굴(고르기·키우기 화면), id 'egg'는 알 */
  function petFace(id, scale = 3) {
    const sh = SHEETS[id === 'egg' ? 'pet_egg' : (PET_ART[id] || PET_ART.fox).face];
    return rasterCanvas(outline(frameRaster(sh.frames[0], sh.pal), OUT), Math.max(1, scale | 0));
  }
  function icon(name, scale = 2) {
    const rows = ICONS[name] || ICONS.star;
    return rasterCanvas(outline(frameRaster(rows, ICON_PAL_EXPORT), OUT), Math.max(1, scale | 0));
  }
  /* 예전 API 호환: 효과 직접 띄우기 */
  function burstCompat(x, y, z, n, color) { burst(x, y, z, n, color || '#FFFFFF'); }
  function floatCompat(x, y, z, text, color) { float(x, y, z, String(text).replace('−', '-').replace('×', 'x').replace('÷', '/'), color || '#FFFFFF'); }

  const api = {
    view, screen, resize, draw, events, reset, setQuality, setShake, setPreview, setFrozen, setCard, setHudTarget, setHitbox,
    get hitbox() { return hitboxOn; },
    portrait, petFace, icon, ready, prepBiome, burst: burstCompat, float: floatCompat,
    get info() {
      return {
        BW, BH, K, dpr, cssPer, quality, frozen: frozenSet || stillFor > 0.25, reduce, pages: atlas.pages.length,
        groundMs: +groundMs.toFixed(2), putMs: +putMs.toFixed(2), drawMs: +drawMs.toFixed(2),
        lateBakes: atlas.lateBakes, sealed: atlas.sealed, parts: nLive, hitbox: hitboxOn,
        squad: { units: units.length, fading: fading.length, comp: fComp ? fComp.join(',') : '', rows: fArr ? fArr.sizes.join('.') : '', plans: formPlans },
      };
    },
  };
  if (typeof window !== 'undefined') window.__squadRenderer = api;
  return api;
}

/* 한글 컷인용 Jua 글꼴(한 번만 넣는다) */
function ensureJua() {
  if (typeof document === 'undefined' || !document.head) return;
  if (document.querySelector('link[data-jua]') || [...document.querySelectorAll('link[href*="fonts.googleapis.com"]')].some((l) => /Jua/.test(l.href))) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Jua&display=swap';
  l.dataset.jua = '1';
  document.head.appendChild(l);
}
