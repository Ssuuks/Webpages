/* 화면 그리기(도트) — 시뮬레이션 상태를 읽기만 한다(상태에 아무것도 쓰지 않는다).
   가로 약 190px의 낮은 해상도 버퍼에 그리고, 브라우저가 CSS image-rendering: pixelated 로 정수배 확대한다.
   이펙트(파편·떠오르는 숫자·흔들림)와 렌더러 전용 상태(축소 단계·번쩍임 제한)는 모두 여기서만 산다. */
import { makeView, fitView, project, P } from './view.js';
import { ROAD, radius, cellGood, applyOp, pickCell, BULLET_SPEED, DT } from './core.js';
import { HEROES, biomeOf } from './roster.js';
import { gateAlts } from './insight.js';
import { BIOME, HERO_ART, UNIT_ART, CAPTIVE_ART, OUT, WORLD_H, SHEETS, ICONS, ICON_PAL_EXPORT, PAL } from './pix/art.js';
import { createAtlas, pickStep, mkCanvas, rasterCanvas } from './pix/atlas.js';
import { createFont, opText, compactTexts } from './pix/font.js';
import { createGround } from './pix/ground.js';
import { frameRaster, outline } from './pix/raster.js';

/* 화면 배치: 분대는 화면 높이 63% 근처, 영웅은 그 바로 뒤(엄지가 쉬는 아래쪽을 비운다) */
const FIT = { at: 0.625, up: 12, back: 16, minHz: 0.075 };
const STEPS3 = [1, 0.75, 0.5];
const STEPS4 = [1, 0.75, 0.5, 0.33];
const TIER = ['#FFE38A', '#FFB347', '#7FE8FF', '#FF7AD9'];
const GOLD_BULLET = '#FFD84A';
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

/* 카메라 맞춤(순수 함수). 보스전(dolly→1)에는 뒤로 빠지되, 분대는 ~65% 이하·영웅 발은 72% 이하에 남게(T4) */
export function lensOpt(w, h, dolly = 0) {
  const col = Math.min(w, h * 0.62);
  const up = clamp(((FIT.at - FIT.minHz) * h * 0.93) / (0.09 * col), 9.5, FIT.up);
  // 짧은 버퍼(360x640·가로 화면)일수록 덜 빠지고, 지평선 하한을 풀어 분대가 아래로 밀려나지 않게
  const short = clamp((400 - h) / 100, 0, 1);
  return {
    at: FIT.at - (0.05 + 0.04 * short) * dolly, up, back: FIT.back, minHz: FIT.minHz * (1 - 0.7 * dolly),
    extraBack: 6 - 2 * short, extraUp: 3 - short,
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
export const FRAMES = {
  soldier: { sheets: ['soldier'], walk: [0, 1, 2, 3], idle: [4, 5] },
  special: { sheets: 'unit', walk: [0, 1, 2, 3], idle: [4, 5], hit: [4] },
  rocket: { sheets: ['rocket'], fire: [6, 7] },
  hero: { sheets: 'hero', walk: [0, 1, 2, 3, 4, 5, 6, 7], idle: [8, 9], ko: [10], cast: [11, 12], look: [13], blink: [14] },
  captive: { sheets: 'captive', wave: [0, 1], sad: [2] },
  foe: { sheets: ['grunt', 'runner'], walk: [0, 1, 2, 3], idle: [0, 2], lunge: [4, 5] },
  brute: { sheets: ['brute'], walk: [0, 1, 2, 3], lunge: [1] },
  spit: { sheets: ['spit'], idle: [0, 1], tell: [2, 3, 4] },
  boss: { sheets: ['boss'], walk: [0, 1, 2, 3], windup: [4], slam: [5], roar: [6, 7], stomp: [8, 9], dead: [10] },
  fx2: { sheets: ['flash', 'spark', 'glint', 'boomfx', 'flag', 'rocketShot', 'smoke'], f: [0, 1] },
  fx4: { sheets: ['saw', 'puff', 'coin'], f: [0, 1, 2, 3] },
  one: { sheets: ['helmet', 'bubble', 'tear', 'helmetBit', 'plus', 'heart', 'dust'], f: [0] },
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
    const first = ['soldier', 'helmet', 'grunt', 'flash', 'spark', 'puff', 'coin', 'runner', 'flag'];
    const tasks = [
      ...font.prebakeTasks(GLYPH_PAIRS),
      () => { for (const k of Object.keys(ICONS)) atlas.icon(k); },
      ...first,
      ...Object.keys(SHEETS).filter((n) => !first.includes(n)),
    ];
    atlas.bakeIdle(tasks, () => { readyResolve(true); idleAfterReady(); });
  }
  ensureJua();

  /* 프레임 상태 */
  let time = 0, prevTime = 0, f60 = 0, camX = 0, dolly = 0, fitted = -1, trauma = 0;
  let flashA = 0, flashRGB = '255,255,255', flashCss = 'rgb(255,255,255)';
  let shownN = 0, countPop = 0, countTint = 0, lastN = -1, pillA = 1;
  let lastS = null, lastT = -1, stillFor = 0;
  let hurtAt = -9, bossImpactT = -9, roarT = -9, bossIntroT = -9, bossDeath = null, enrageT = -9;
  let castT = -9, castId = '', castRun = false, castArena = false, healT = -9, rocketT = -9, snipeT = -9, readyT = -9;
  let healSum = 0, healShown = -9, groundMs = 0, putMs = 0, drawMs = 0, hurtSeed = 0;
  let cut = null;        // 컷인 { t, id }
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
  const flies = [];
  for (let i = 0; i < 24; i++) flies.push({ on: false });
  const tracers = [];
  for (let i = 0; i < 24; i++) tracers.push({ on: false });
  const rings = [];
  for (let i = 0; i < 16; i++) rings.push({ on: false });
  const flakes = [];
  for (let i = 0; i < 40; i++) flakes.push({ x: Math.random(), y: Math.random(), v: 0.5 + Math.random(), p: Math.random() * 6 });

  /* 분대 대형(그릴 위치): 앞 64명은 온전히, 그 앞쪽(먼 쪽) 줄은 철모만 */
  const VIS = 64 + 96;
  const vis = { n: 0, x: new Float32Array(VIS), z: new Float32Array(VIS), born: new Float32Array(VIS), helm: new Uint8Array(VIS) };
  let orderT = -1;

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
    fitView(view, VW, VH, ROAD, dolly, o);
    fitted = dolly;
  }

  function setQuality(q) { quality = q === 'low' ? 'low' : 'high'; dirty = true; }
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
    trauma = 0; flashA = 0; camX = 0; vis.n = 0; lastN = -1; countTint = 0; countPop = 0; shownN = 0; pillA = 1;
    dolly = 0; layout();   // 보스전 렌즈를 되돌린다(R1)
    hurtAt = -9; bossImpactT = -9; roarT = -9; bossIntroT = -9; bossDeath = null; enrageT = -9;
    castT = -9; castRun = false; castArena = false; healT = -9; rocketT = -9; snipeT = -9; readyT = -9; healSum = 0; healShown = -9;
    cut = null; clearOverlay();
    lodScen.clear(); lodFoe.clear(); lodSaw.clear(); lodCage.clear(); lodBoss = undefined;
    flashFoe.clear(); flashBoss.clear(); hitSeen.clear(); tickAt.clear(); bruteStep.clear(); spSeen.clear(); pendingGet.length = 0;
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
  function tracer(x0, y0, z0, x1, y1, z1, c, dur = 0.08) {
    for (const t of tracers) if (!t.on) { Object.assign(t, { on: true, x0, y0, z0, x1, y1, z1, c, t: 0, dur }); return; }
  }
  function shake(a) { if (shakeOn && !reduce) trauma = Math.min(1, trauma + a); }
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

  /* 특수병 자리: 맨 뒷줄 바로 뒤 양쪽, 셋째는 왼쪽 옆(병사들에 가려지지 않게, 영웅과도 안 겹치게) */
  function slotPos(q, i, R, qx) {
    const back = q.z - 0.8 * (R - 0.22) - 0.3;
    if (i === 0) return { x: qx - 0.55 * R - 0.4, z: back };
    if (i === 1) return { x: qx + 0.55 * R + 0.4, z: back };
    return { x: qx - R - 0.3, z: q.z + 0.1 };
  }
  const heroZ = (q, R) => q.z - R - 0.7;

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
          if (e.cause !== 'gate' && e.n >= 2) float(q.x + (Math.random() < 0.5 ? -1 : 1) * (R + 0.4), 1.6, q.z, '-' + e.n, '#FFC2B3', { out: PANEL.bad.out, life: 0.8, vz: q.vz });
          if (e.n >= Math.max(5, q.n * 0.08)) shake(0.18);
          // 쓰러진 병사: 연기 + 철모가 튀어 오른다
          const m = Math.min(5, e.n);
          for (let i = 0; i < m && vis.n; i++) {
            const j = (Math.random() * Math.min(vis.n, 64)) | 0;
            fx('puff', vis.x[j], 0.4, vis.z[j], 0.3, { step: 1 });
            part(vis.x[j], 0.9, vis.z[j], (Math.random() - 0.5) * 2, 4 + Math.random() * 2, (Math.random() - 0.5), 0.8, '#6CC0FF', 1, 12, 'helmetBit');
          }
          break;
        }
        case 'kill': {
          const big = e.kind === 'brute';
          fx('puff', e.x, big ? 0.9 : 0.5, e.z, big ? 0.4 : 0.3, { step: big ? 0 : 1 });
          burst(e.x, big ? 1.2 : 0.7, e.z, big ? 14 : 7, e.kind === 'spit' ? FX_COL.purple : FX_COL.green, big ? 3.5 : 2.5, 3);
          if (big) shake(0.15);
          break;
        }
        case 'bite': {
          const sh = e.kind === 'runner' ? 'runner' : e.kind === 'brute' ? 'brute' : 'grunt';
          fx('lunge', e.x, 0, e.z, 0.14, { sheet: sh });
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
        case 'crateMiss': burst(e.x, 0.8, e.z, 12, FX_COL.wood, 3, 3); break;
        case 'cageOpen':
          burst(e.x, 1, e.z, 18, FX_COL.iron, 4.5, 4, 0.7);
          fx('puff', e.x, 0.8, e.z, 0.3);
          break;
        case 'cageMiss':
          burst(e.x, 1, e.z, 14, FX_COL.iron, 3, 3);
          fx('sadCaptive', e.x, 0, e.z, 1.3, { k: e.k || 'medic' });
          break;
        case 'spitFire': burst(e.x, 1.2, e.z, 4, FX_COL.purple, 1.2, 2); break;
        case 'spitHit':
          burst(e.x, 0.3, e.z, 14, ['#B9F25B', '#7FC93A', '#F4FFB0'], 3.5, 3);
          if (e.hit) { screenFlash(0.18, '170,255,90'); shake(0.25); }
          break;
        case 'slam':
          bossImpactT = time;
          burst((e.x0 + e.x1) / 2, 0.3, q.z + 3, 26, FX_COL.dust, 7, 4);
          ring((e.x0 + e.x1) / 2, q.z + 3, 0.5, 4.5, 0.4, '#FFF1DE', { thick: 2 });
          shake(0.6);
          if (e.hit) screenFlash(0.3, '232,56,79');
          break;
        case 'clash': shake(0.3); break;
        case 'stomp':
          shake(0.3);
          burst(q.x, 0.4, q.z + R * 0.6, 10, FX_COL.blood, 4, 3);
          if (s.boss) burst(s.boss.x, 0.2, s.boss.z, 10, FX_COL.dust, 4, 2);
          break;
        case 'boss':
          bossIntroT = time;
          shake(0.4);
          break;
        case 'summon':
          roarT = time;
          if (s.boss) ring(s.boss.x, s.boss.z, 1, 7, 0.6, '#FFF1DE', { thick: 2 });
          shake(0.2);
          break;
        case 'enrage':
          enrageT = time;
          if (s.boss) burst(s.boss.x, 4, s.boss.z, 20, ['#FFFFFF', '#E8ECF2', '#C9CED6'], 3, 4, 0.9);
          screenFlash(0.15, '255,140,90');
          break;
        case 'bossDead':
          bossDeath = { t0: time, x: e.x, z: e.z, n: 0 };
          screenFlash(0.5, '255,255,255');
          shake(0.8);
          break;
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
          if (e.src === 'hero') { z0 = heroZ(q, R); y0 = 1.5; }
          else { const i = sp.findIndex((m) => m.k === 'sniper'); if (i >= 0) { const p = slotPos(q, i, R, q.x); x0 = p.x; z0 = p.z; y0 = 1.2; } }
          tracer(x0, y0, z0, e.x1, 0.7, e.z1, e.src === 'hero' ? '#7FF0E2' : '#FFF4B0', e.src === 'hero' ? 0.1 : 0.08);
          fx('glint', x0, y0 + 0.1, z0, 0.12);
          fx('spark', e.x1, 0.7, e.z1, 0.1);
          break;
        }
        case 'rocket': {
          rocketT = time;
          const i = sp.findIndex((m) => m.k === 'rocket');
          const p = i >= 0 ? slotPos(q, i, R, q.x) : { x: q.x, z: q.z };
          for (let k = 0; k < 6; k++) part(p.x + (Math.random() - 0.5) * 0.4, 0.9, p.z - 0.3, (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), -1.5 - Math.random() * 1.5, 0.5, '#C9CED6', 1, 0, 'smoke');
          break;
        }
        case 'boom':
          fx('boom', e.x, 0.8, e.z, 0.32);
          ring(e.x, e.z, 0.3, e.r || 2.2, 0.35, '#FFF4B0', { thick: 2 });
          burst(e.x, 0.8, e.z, 16, FX_COL.boom, 5, 4, 0.6);
          shake(0.12);
          break;
        case 'heal': {
          // 회복은 틱마다 조금씩 오므로 모아서 0.5초에 한 번만 보여 준다
          healSum += e.n;
          if (time - healShown < 0.5) break;
          healShown = time;
          healT = time;
          const m = Math.min(6, Math.max(2, healSum));
          for (let i = 0; i < m; i++) part(q.x + (Math.random() - 0.5) * R * 2, 0.6 + Math.random(), q.z + (Math.random() - 0.5) * R, 0, 2 + Math.random() * 1.5, 0, 0.8, '#7CE07A', 1, 0, 'plus');
          float(q.x + R + 0.5, 1.8, q.z, '+' + healSum, '#C9F5B8', { out: '#1E5A2E', life: 0.8, vz: q.vz });
          healSum = 0;
          break;
        }
        case 'heroReady': readyT = time; break;
        case 'heroCast': {
          castT = time; castId = e.id;
          const arena = !!s.boss;
          if (!castRun || (arena && !castArena)) { cut = { t: 0, id: e.id }; castRun = true; if (arena) castArena = true; }
          const hz = heroZ(q, R);
          if (e.id === 'bori') for (let i = 0; i < 10; i++) part(q.x + (Math.random() - 0.5) * 2 * R, 0.8 + Math.random(), q.z + (Math.random() - 0.5) * R, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, 0, 1.1, '#FF6FA0', 1, 0, 'heart');
          if (e.id === 'mungchi') ring(q.x, hz, 0.5, 4, 0.5, '#FFD84A', { follow: true, thick: 2 });
          if (e.id === 'nabi') fx('glint', q.x + 0.3, 2, hz, 0.25);
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
  /* 먼 곳에서 나타날 때는 단계적으로(안개와 맞춘다). 기둥·판·숫자에 같은 값(R6) */
  function fadeIn(d) { return d > 113 ? 0 : d > 106 ? 0.34 : d > 99 ? 0.67 : 1; }
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
    for (let z = Math.floor((view.camZ + 4) / step) * step; z < view.camZ + 104; z += step) {
      for (let side = -1; side <= 1; side += 2) {
        const h = sceneryHash(z, side);
        push(sceneryZ(h, z), 10, props[h % props.length], z * 2 + (side > 0 ? 1 : 0), sceneryX(h, side));
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
      ctx.fillStyle = sel ? '#FFFFFF' : pumped ? '#FFFFFF' : st.line;
      trapLine(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy, sel ? 2 : 1);
      const mx = (face.ax + face.bx) / 2, my = (face.ay + face.dy) / 2 - bump;
      cellLabel(c, st, mx, my, pw, ph, sel);
      if (preview && c.op && dz < 40 && dz > 0 && ph > 16) {
        const r = Math.max(0, applyOp(q.n, c.op, c.v));
        const t = '=' + r;
        if (font.measure(t, 'small') <= pw - 2) font.draw(ctx, t, mx, face.ay + 5, { size: 'small', fill: '#FFFFFF', out: st.out });
      }
    }
    ctx.globalAlpha = 1;
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
    const sheet = f.kind === 'spit' ? 'spit' : f.kind;
    const sh = atlas.sheet(sheet);
    const want = (P.s * (WORLD_H[sheet] || 1.05)) / (sh.frames[0][0].h - 2);
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
    const rr = atlas.draw(ctx, sheet, fr, pxs, pys, st, white ? 'white' : '');
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
    if ((f.kind === 'brute' || f.kind === 'spit') && f.hp < f.max) {
      const r = atlas.get(sheet, fr, st);
      const bw = Math.max(8, Math.round(r.w * 0.7));
      const bx = Math.round(pxs - bw / 2), by = Math.round(pys) - r.ay - 4;
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
    const sh = atlas.sheet('boss');
    const want = (P.s * 6.4) / (sh.frames[0][0].h - 2);
    const st = pickStep(Math.min(1, want), lodBoss, STEPS4);
    lodBoss = st;
    const px = P.x;
    let py = P.y;
    const it = time - bossIntroT;
    if (it >= 0 && it < 0.35) py -= Math.round((1 - it / 0.35) ** 2 * 60);
    else if (it >= 0.35 && it < 0.4 && bossIntroT > 0) { burst(b.x, 0.2, b.z, 18, bio === BIOME.snow ? FX_COL.snowDust : FX_COL.dust, 6, 3); bossIntroT = -9; shake(0.35); }
    ctx.fillStyle = bio.shadow;
    ellipse(px, P.y, 2.6 * P.s, 2.6 * P.s * 0.34);
    const fr = bossFrame(s, b);
    // 피격: 흰 실루엣을 반투명(50%)으로 덧칠, 0.5초에 한 번(V9). 쓰러질 때의 두 번 번쩍임도 움직임 줄이기면 끈다(T10)
    const dt0 = bossDeath ? time - bossDeath.t0 : 9;
    const white = b.hp > 0 ? flashBoss.on(-1, b.hitT, s.t, time, reduce) : !reduce && !!bossDeath && (dt0 < 0.05 || (dt0 > 0.4 && dt0 < 0.45));
    atlas.draw(ctx, 'boss', fr, px, py, st, b.enraged ? 'rage' : '');
    if (white) {
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * 0.5;
      atlas.draw(ctx, 'boss', fr, px, py, st, 'white');
      ctx.globalAlpha = ga;
    }
    // 분노: 머리에서 김(초당 12번, 화면 주사율과 상관없이)
    if (b.enraged && b.hp > 0) for (let k = beats(12); k > 0; k--) part(b.x + (Math.random() - 0.5) * 2.5, 6.2, z, (Math.random() - 0.5) * 0.6, 1.5, 0, 0.7, '#F4F6FA', 1, -1, 'smoke');
    // 쓰러지는 중: 연기 연쇄 + 코인 비
    if (bossDeath) {
      const t = time - bossDeath.t0;
      const want2 = Math.floor(t / 0.11);
      while (bossDeath.n < Math.min(9, want2)) {
        bossDeath.n++;
        fx('puff', b.x + (Math.random() - 0.5) * 4, 1 + Math.random() * 4.5, z - 0.5, 0.35, { step: 0 });
        if (bossDeath.n % 2) for (let i = 0; i < 4; i++) part(b.x + (Math.random() - 0.5) * 3, 4 + Math.random() * 2, z, (Math.random() - 0.5) * 5, 3 + Math.random() * 3, -2 - Math.random() * 2, 1.2, '#FFD84A', 1, 9, 'coin');
      }
      if (t > 1 && bossDeath.n < 10) { bossDeath.n = 10; fx('puff', b.x, 2.5, z - 0.5, 0.45); burst(b.x, 3, z, 40, FX_COL.green.concat(FX_COL.gold), 8, 6, 1); }
    }
  }

  /* ---------- 분대 ---------- */
  function updateFormation(s, dt, qx) {
    const q = sq;   // 카메라와 같은 시간축의 분대(R4)
    const R = radius(Math.max(1, q.n));
    const full = quality === 'low' ? 40 : 64;
    const helmCap = quality === 'low' ? 48 : 96;
    const D = Math.min(q.n, full);
    const Hn = q.n > D ? Math.round(helmCap * Math.min(1, Math.sqrt((q.n - D) / 936))) : 0;
    const T = q.n > 0 ? D + Hn : 0;
    if (T !== orderT) {
      // 먼(앞쪽) 칸부터 철모 — 순서는 T가 바뀔 때만 다시 정한다(깜빡임 없음)
      const idx = [];
      for (let i = 0; i < T; i++) idx.push(i);
      idx.sort((a, b) => Math.sin(b * 2.39996323) * Math.sqrt(b + 0.5) - Math.sin(a * 2.39996323) * Math.sqrt(a + 0.5));
      for (let j = 0; j < T; j++) vis.helm[idx[j]] = j < Hn ? 1 : 0;
      orderT = T;
    }
    const c = (R - 0.22) / Math.sqrt(Math.max(1, T));
    // 아주 큰 부대는 앞으로 길게(철모 줄이 더 보인다)
    const deep = 0.8 + 0.4 * clamp((q.n - 300) / 700, 0, 1);
    for (let i = vis.n; i < T; i++) {
      const r = c * Math.sqrt(i + 0.5), th = i * 2.39996323;
      vis.x[i] = qx + r * Math.cos(th);
      vis.z[i] = q.z + r * Math.sin(th) * (Math.sin(th) > 0 ? deep : 0.8);
      vis.born[i] = vis.n ? time : -9;
    }
    vis.n = T;
    const k = Math.min(1, dt * 12);
    for (let i = 0; i < T; i++) {
      const r = c * Math.sqrt(i + 0.5), th = i * 2.39996323;
      const tx = qx + r * Math.cos(th), tz = q.z + r * Math.sin(th) * (Math.sin(th) > 0 ? deep : 0.8);
      vis.x[i] += (tx - vis.x[i]) * k;
      vis.z[i] = tz + (vis.z[i] - tz) * (1 - k);
    }
    return R;
  }
  function drawMember(s, i, qx) {
    const q = sq;   // 카메라와 같은 시간축의 분대(R4)
    if (!project(view, vis.x[i], 0, vis.z[i])) return;
    const won = s.phase === 'won';
    // 정수 좌표로 먼저 반올림(가장 많이 그리는 곳이라 실수 인자가 상자에 담기지 않게)
    const px = Math.round(P.x);
    let y = Math.round(P.y);
    const age = time - vis.born[i];
    if (age < 0.22) y -= Math.round((1 - age / 0.22) * 6);
    else if (age < 0.27 && vis.born[i] > 0) { part(vis.x[i], 0.05, vis.z[i], 0, 0.5, 0, 0.25, '#E6D2B0', 1, 0, 'dust'); vis.born[i] = -9; }
    if (won) y -= Math.round(Math.abs(Math.sin(time * 9 + i * 0.7)) * 2);
    if (vis.helm[i]) {
      atlas.draw(ctx, 'helmet', 0, px, y - 9);
      if (!won && q.vz >= 0 && s.t > 0 && muzzle(i)) atlas.draw(ctx, 'flash', (f60 + i) & 1, px + 2, y - 13);
      return;
    }
    const moving = q.vz > 0.5 && !won;
    const fr = moving ? FR.soldier.walk[((time * 10 + i * 0.37) | 0) & 3] : FR.soldier.idle[((time * 2 + i * 0.31) | 0) & 1];
    const hurt = time - hurtAt < 0.15 && (i * 7 + hurtSeed) % 11 === 0;
    const fire = !won && q.n > 0 && s.t > 0 && vis.z[i] > q.z - 0.1 && muzzle(i);
    const r = atlas.draw(ctx, 'soldier', fr, px, y + (fire ? 1 : 0), 0, hurt ? 'hurt' : '');
    if (fire) {
      const ox = px - r.ax, oy = y + 1 - r.ay;
      const my = fr === 1 || fr === 3 ? 3 : 4;
      atlas.draw(ctx, 'flash', (f60 + i) & 1, ox + 12, oy + my - 1);
    }
  }
  function drawFlag(s, i, qx, R, z) {
    const x = qx + FLAG_X[i] * R;
    if (!project(view, x, 0, z)) return;
    let y = P.y - 12;
    if (s.phase === 'won') y -= Math.round(Math.abs(Math.sin(time * 9 + i)) * 2);
    atlas.draw(ctx, 'flag', ((time * 3 + i * 0.5) | 0) & 1, P.x + 3, y);
  }
  function muzzle(i) {
    // 총구 불꽃은 60Hz 시계로(120Hz 화면에서 두 배로 번쩍이지 않게, T8)
    if (quality === 'low' && (f60 & 1)) return false;
    const D = vis.n;
    return ((f60 * 3 + i * 7) % Math.max(5, (D / 5) | 0)) === 0;
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
    atlas.draw(ctx, sheet, fr, P.x, py, 0, variant);
    // 저격수 조준 반짝임(쿨이 거의 다 찼을 때)
    if (m.k === 'sniper' && typeof m.cd === 'number' && m.cd < 0.18 && m.cd > 0 && (f60 & 2)) atlas.draw(ctx, 'glint', 0, P.x + 6, py - 14);
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
        ctx.fillStyle = TIER[Math.min(3, i + 1)];
        ctx.fillRect(x0 + 1 + i * 6, y - 4, 3, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 총알·독침·로켓·조준선 ---------- */
  function drawBullets(s, alpha) {
    const ext = BULLET_SPEED * DT * (alpha - 1);   // 카메라와 같은 시간축(R4)
    const gold = s.hero && s.hero.id === 'mungchi' && s.hero.act > 0;
    const col = gold ? GOLD_BULLET : TIER[s.squad.tier] || TIER[0];
    const wide = gold || s.squad.tier >= 2 ? 2 : 1;
    for (const b of s.bullets) {
      if (!project(view, b.x, 0.75, b.z + ext)) continue;
      const hx = Math.round(P.x), hy = Math.round(P.y);
      if (!project(view, b.x, 0.75, b.z + ext - 1.4)) continue;
      const len = Math.max(1, Math.round(P.y) - hy);
      ctx.fillStyle = col; ctx.fillRect(hx, hy, wide, len);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(hx, hy, 1, 1);
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
    for (const rk of list) {
      const T = rk.T || 1;
      const u = clamp(1 - (rk.t + lag) / T, 0, 1);
      const x = rk.x0 + (rk.x - rk.x0) * u + ox * (1 - u), z = rk.z0 + (rk.z - rk.z0) * u + oz * (1 - u), y = 0.9 + 3 * 4 * u * (1 - u);
      if (!project(view, x, y, z)) continue;
      atlas.draw(ctx, 'rocketShot', (f60 >> 1) & 1, P.x, P.y + 3);
      for (let k = puffs; k > 0; k--) part(x, y - 0.2, z - 0.4, (Math.random() - 0.5) * 0.4, 0.3, 0, 0.45, '#C9CED6', 1, -0.5, 'smoke');
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
      ctx.fillStyle = OUT;
      pline(ax + 1, ay, P.x + 1, P.y);
      ctx.fillStyle = t.c;
      pline(ax, ay, P.x, P.y);
    }
  }

  /* ---------- 바닥 표시(조준 띠·그림자·독침 예고·내려찍기 구역·고리) ---------- */
  function drawDecals(s, bio, qx, lag) {
    const q = sq;   // 카메라와 같은 시간축의 분대(R4)
    if (q.n > 0) {
      const R = radius(q.n);
      ctx.fillStyle = bio.aim;
      groundQuad(qx - R - 0.3, qx + R + 0.3, q.z + R * 0.5, q.z + 30, 0.01);
      if (project(view, qx, 0, q.z)) { ctx.fillStyle = bio.shadow; ellipse(P.x, P.y, (R + 0.35) * P.s, (R + 0.35) * P.s * 0.36); }
    }
    for (const sp of s.spits) {
      if (!project(view, sp.x, 0.02, sp.z)) continue;
      const k = clamp(1 - (sp.t + lag) / (sp.T || 1), 0, 1);
      ctx.fillStyle = '#B9F25B';
      ctx.globalAlpha = 0.22 + 0.3 * k;
      ellipse(P.x, P.y, 1.2 * P.s, 1.2 * P.s * 0.38);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#E8FFB0';
      ellRing(P.x, P.y, Math.max(2, 1.2 * P.s * (1 - k)), Math.max(1, 1.2 * P.s * 0.38 * (1 - k)), 1);
      ctx.fillStyle = '#B9F25B';
      ellRing(P.x, P.y, 1.2 * P.s, 1.2 * P.s * 0.38, 1);
    }
    const b = s.boss;
    if (b && b.slam && b.hp > 0) {   // 보스가 쓰러지면 예고를 그리지 않는다
      const k = clamp(1 - b.slam.t / b.slam.T, 0, 1);
      const pulse = (((time * 4) | 0) & 1) ? 0.06 : 0;
      ctx.fillStyle = '#E8384F';
      ctx.globalAlpha = 0.24 + pulse;
      groundQuad(b.slam.x0 + 0.1, b.slam.x1 - 0.1, q.z - 3.5, b.z - 0.5, 0.02);
      ctx.globalAlpha = 0.5;
      groundQuad(b.slam.x0 + 0.1, b.slam.x1 - 0.1, q.z - 3.5, q.z - 3.5 + (b.z - q.z + 3) * k, 0.03);
      ctx.globalAlpha = 1;
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
    for (const r of rings) {
      if (!r.on) continue;
      if (!project(view, r.follow ? qx : r.x, 0.03, r.follow ? heroZ(q, radius(Math.max(1, q.n))) : r.z)) continue;
      const u = r.t / r.dur;
      const rr = r.r0 + (r.r1 - r.r0) * Math.sqrt(u);
      ctx.fillStyle = r.c;
      ctx.globalAlpha = u > 0.7 ? 0.5 : 1;
      ellRing(P.x, P.y, rr * P.s, rr * P.s * 0.36, r.thick);
      ctx.globalAlpha = 1;
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
          const sh = f.sheet === 'brute' ? 'brute' : f.sheet;
          const fr = sh === 'brute' ? FR.brute.lunge[0] : FR.foe.lunge[u > 0.5 ? 1 : 0];
          atlas.draw(ctx, sh, fr, P.x, P.y);
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
  function drawSnow(dt) {
    const n = quality === 'low' ? 20 : 40;
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < n; i++) {
      const f = flakes[i];
      f.y += dt * f.v * 0.16;
      if (f.y > 1) { f.y -= 1; f.x = Math.random(); }
      const x = Math.round(f.x * BW + Math.sin(time * 1.5 + f.p) * 3), y = Math.round(f.y * BH);
      ctx.fillRect(x, y, f.v > 1.2 ? 2 : 1, f.v > 1.2 ? 2 : 1);
    }
  }

  /* ---------- 컷인(첫 스킬, 보스전 첫 스킬만) ----------
     한글 스킬 이름은 띠 높이만 한 작은 덧캔버스에(전체 화면 크기 캔버스를 첫 스킬 때 만들지 않는다, T5).
     덧캔버스와 영웅별 제목 그림은 준비가 끝난 뒤·화면 크기가 바뀐 뒤 쉬는 틈에 미리 만든다. */
  let ov = null, octx = null, ovShown = false;
  const titles = new Map();    // 영웅 id → { c, ox, oy } (미리 그린 제목)
  let titleKey = '';
  const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 30));
  function band() {
    const hh = Math.min(66, Math.round(VH * 0.16));
    return { hh, y0: Math.round(VH * 0.13) };
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
      ctx.fillStyle = y < 2 || y >= hh - 2 ? '#FFD84A' : y === 2 || y === hh - 3 ? OUT : art.color;
      ctx.fillRect(slide - 24 + sk, y0 + y, BW + 48, 1);
    }
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    for (let i = 0; i < 9; i++) {
      const yy = y0 + 6 + ((i * 7) % (hh - 12));
      const xx = ((i * 53 + time * 420) % (BW + 60)) - 30;
      ctx.fillRect(Math.round(xx) + slide, yy, 14 + (i % 3) * 8, 1);
    }
    const fr = atlas.get(art.portrait, 0);
    const sc = BW >= 170 ? 3 : 2;
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
    const bio = BIOME[biomeOf(s.L || 1).id] || BIOME.desert;
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
    const zMax = view.camZ + 118;
    for (const row of s.rows) if (!row.done && row.z < zMax) push(row.z, 1, row);
    for (const p of s.props) if (p.alive && p.z < zMax && p.z > view.camZ + 1.5) push(p.z - 0.35, 2, p);
    for (const w of s.saws) if (w.z < zMax && w.z > view.camZ + 2) push(w.z, 3, w);
    for (const f of s.foes) if (f.alive && f.z < zMax && f.z > view.camZ + 2) push(f.z, 4, f);
    if (s.boss && (s.boss.hp > 0 || bossDeath)) push(s.boss.z, 5, s.boss);
    const R = updateFormation(s, rdt, qx);
    if (q.n > 0) for (let i = 0; i < vis.n; i++) push(vis.z[i], 6, null, i);
    const flagsN = q.n >= 1000 ? 3 : q.n >= 500 ? 2 : q.n >= 200 ? 1 : 0;
    for (let i = 0; i < flagsN; i++) push(sq.z + R * (0.25 + 0.2 * (i & 1)), 9, null, i);
    const sp = sq.sp;
    if (q.n > 0) for (let i = 0; i < sp.length; i++) push(slotPos(sq, i, R, qx).z, 7, sp[i], i);
    if (s.hero && (q.n > 0 || s.phase === 'lost')) push(heroZ(sq, R), 8, s.hero);
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
        case 6: drawMember(s, it.i, qx); break;
        case 7: drawSpecial(s, it.o, it.i, qx, R); break;
        case 8: drawHero(s, it.o, qx, R); break;
        case 9: drawFlag(s, it.i, qx, R, it.z); break;
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
    drawFx(s, rdt, qx);
    drawParts(rdt);
    drawCount(s, rdt, qx);
    drawFloats(rdt, !cardOn && s.t > 0);   // 게이트 숫자는 말풍선 위에(R3·V4), 출발 전에는 안 그린다(V6)
    if (bio === BIOME.snow) drawSnow(rdt);
    drawFlies(rdt);
    drawCut(rdt);
    if (flashA > 0) {
      ctx.fillStyle = flashCss;
      ctx.globalAlpha = Math.min(0.5, flashA);
      ctx.fillRect(0, 0, BW, BH);
      ctx.globalAlpha = 1;
      flashA = Math.max(0, flashA - rdt * 1.8);
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
  function icon(name, scale = 2) {
    const rows = ICONS[name] || ICONS.star;
    return rasterCanvas(outline(frameRaster(rows, ICON_PAL_EXPORT), OUT), Math.max(1, scale | 0));
  }
  /* 예전 API 호환: 효과 직접 띄우기 */
  function burstCompat(x, y, z, n, color) { burst(x, y, z, n, color || '#FFFFFF'); }
  function floatCompat(x, y, z, text, color) { float(x, y, z, String(text).replace('−', '-').replace('×', 'x').replace('÷', '/'), color || '#FFFFFF'); }

  const api = {
    view, screen, resize, draw, events, reset, setQuality, setShake, setPreview, setFrozen, setCard, setHudTarget,
    portrait, icon, ready, burst: burstCompat, float: floatCompat,
    get info() {
      return {
        BW, BH, K, dpr, cssPer, quality, frozen: frozenSet || stillFor > 0.25, reduce, pages: atlas.pages.length,
        groundMs: +groundMs.toFixed(2), putMs: +putMs.toFixed(2), drawMs: +drawMs.toFixed(2),
        lateBakes: atlas.lateBakes, sealed: atlas.sealed, parts: nLive,
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
