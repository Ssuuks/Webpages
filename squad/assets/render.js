/* 화면 그리기(도트) — 시뮬레이션 상태를 읽기만 한다(상태에 아무것도 쓰지 않는다).
   가로 약 190px의 낮은 해상도 버퍼에 그리고, 브라우저가 CSS image-rendering: pixelated 로 정수배 확대한다.
   이펙트(파편·떠오르는 숫자·흔들림)와 렌더러 전용 상태(축소 단계·번쩍임 제한)는 모두 여기서만 산다. */
import { makeView, fitView, project, P } from './view.js';
import { ROAD, radius, cellGood, applyOp, pickCell, BULLET_SPEED, DT } from './core.js';
import { HEROES, biomeOf } from './roster.js';
import { BIOME, HERO_ART, UNIT_ART, CAPTIVE_ART, OUT, WORLD_H, SHEETS, ICONS, ICON_PAL_EXPORT, PAL } from './pix/art.js';
import { createAtlas, pickStep, mkCanvas, rasterCanvas } from './pix/atlas.js';
import { createFont, opText } from './pix/font.js';
import { createGround } from './pix/ground.js';
import { frameRaster, outline } from './pix/raster.js';

/* 화면 배치: 분대는 화면 높이 63% 근처, 영웅은 그 바로 뒤(엄지가 쉬는 아래쪽을 비운다) */
const FIT = { at: 0.625, up: 12, back: 16, minHz: 0.075 };
const STEPS3 = [1, 0.75, 0.5];
const STEPS4 = [1, 0.75, 0.5, 0.33];
const TIER = ['#FFE38A', '#FFB347', '#7FE8FF', '#FF7AD9'];
const GOLD_BULLET = '#FFD84A';
const PANEL = {
  good: { rgb: '62,139,234', line: '#BFE2FF', out: '#1D3F8A', arrow: '#DDF3FF' },
  bad: { rgb: '232,56,79', line: '#FFC2B3', out: '#6E1A33', arrow: '#FFD0C4' },
  zero: { rgb: '150,150,175', line: '#E0E0EA', out: '#3A3550', arrow: null },
  unit: { rgb: '255,196,60', line: '#FFF09A', out: '#6E4208', arrow: null },
};
const FX_COL = {
  green: ['#8FD16A', '#5E9E4B', '#C9E36A'], purple: ['#B79BE0', '#8A6CC0', '#B9F25B'],
  wood: ['#F0C27E', '#C98A4E', '#8E5A30'], stone: ['#C9CED6', '#9AA2B0', '#FFC93C'], iron: ['#8A93A6', '#596277', '#C9CED6'],
  blood: ['#FF8FA8', '#E8607A'], gold: ['#FFF09A', '#FFD84A', '#D08A12'], dust: ['#E6D2B0', '#B89A70'], snowDust: ['#FFFFFF', '#DCE0EA'],
  confetti: ['#FFD84A', '#6CC0FF', '#FF8FB8', '#8FD16A', '#FFFFFF'], good: ['#6CC0FF', '#DDF3FF', '#3E8BEA'], bad: ['#FF8A7A', '#FFC2B3', '#E8384F'],
  unit: ['#FFD84A', '#FFF09A', '#D08A12'], boom: ['#FFF4B0', '#FFB347', '#FF7A45', '#9AA2B0'], heal: ['#7CE07A', '#C9F5B8'],
};
const MAX_PARTS = 320;

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
  let BW = 0, BH = 0, K = 1, dpr = 1, cssPer = 1, cssW = 0, cssH = 0;
  let img = null, u32 = null;
  let quality = 'high';
  let shakeOn = true;
  let preview = false;
  let frozenSet = false;
  let hudCss = null;
  let dirty = true;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RENDERING = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('image-rendering', 'pixelated') ? 'pixelated'
    : typeof CSS !== 'undefined' && CSS.supports && CSS.supports('image-rendering', 'crisp-edges') ? 'crisp-edges' : '-webkit-optimize-contrast';

  /* 급한 그림은 바로, 나머지는 쉬는 틈에 굽는다(레벨 시작 때 멈칫하지 않게) */
  for (const n of ['soldier', 'helmet', 'grunt', 'flash', 'spark', 'puff', 'coin']) atlas.bake(n);
  let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });
  atlas.bakeIdle(Object.keys(SHEETS), () => readyResolve(true));
  ensureJua();

  /* 프레임 상태 */
  let time = 0, frameN = 0, camX = 0, dolly = 0, fitted = -1, trauma = 0;
  let flashA = 0, flashRGB = '255,255,255';
  let shownN = 0, countPop = 0, countTint = 0, lastN = -1;
  let lastS = null, lastT = -1, stillFor = 0;
  let hurtAt = -9, bossImpactT = -9, roarT = -9, bossIntroT = -9, bossDeath = null, enrageT = -9;
  let castT = -9, castId = '', castRun = false, castArena = false, healT = -9, rocketT = -9, snipeT = -9, readyT = -9;
  let healSum = 0, healShown = -9, groundMs = 0, putMs = 0, drawMs = 0, hurtSeed = 0;
  let cut = null;        // 컷인 { t, id }
  let lookNext = 3;
  const sq = { x: 0, z: 0, vz: 0, vx: 0, n: 0, tier: 0, sp: [] };   // 그리는 순간의 분대(보간)
  const lod = new Map();       // 렌더러 전용 축소 단계(시뮬 객체에 쓰지 않는다)
  const flashes = new Map();   // 피격 번쩍임 제한(초당 3회 이하)
  const hitSeen = new Map();
  const tickAt = new Map();
  const bruteStep = new Map();
  const spSeen = new Map();    // 특수병 id → { born, fx, fz }
  const pendingGet = [];       // 아직 분대 목록에서 못 찾은 합류 이벤트

  /* 효과 풀 */
  const parts = [];
  for (let i = 0; i < MAX_PARTS; i++) parts.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, c: '#fff', size: 1, g: 9, spr: null });
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

  /* 그리기 목록(재사용) */
  const items = [];
  for (let i = 0; i < 700; i++) items.push({ z: 0, k: 0, o: null, i: 0, x: 0 });
  let nItems = 0;
  const order = [];
  const byDepth = (a, b) => b.z - a.z;
  function push(z, k, o, i = 0, x = 0) {
    if (nItems >= items.length) return;
    const it = items[nItems++];
    it.z = z; it.k = k; it.o = o; it.i = i; it.x = x;
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
    const col = Math.min(w, h * 0.62);
    const devW = Math.round(w * dpr), devH = Math.round(h * dpr), devCol = col * dpr;
    // 기둥 폭이 버퍼 190px에 가장 가까운 정수 배율(160~220 안을 우선)
    let best = 1, be = Infinity;
    for (let k = 1; k <= 12; k++) {
      const bw = Math.ceil(devCol / k);
      const e = Math.abs(bw - 190) + (bw < 160 || bw > 220 ? 1000 : 0);
      if (e < be) { be = e; best = k; }
    }
    K = best;
    BW = Math.max(1, Math.ceil(devW / K));
    BH = Math.max(1, Math.ceil(devH / K));
    cssPer = K / dpr;
    cvs.width = BW;
    cvs.height = BH;
    cvs.style.width = BW * cssPer + 'px';
    cvs.style.height = BH * cssPer + 'px';
    cvs.style.imageRendering = RENDERING;
    ctx.imageSmoothingEnabled = false;
    img = ctx.createImageData(BW, BH);
    u32 = new Uint32Array(img.data.buffer);
    fitted = -1;
    layout();
    screen.w = w; screen.h = h; screen.col = col;
    if (ov) sizeOverlay();
    dirty = true;
  }
  function layout() {
    if (!BW) return;
    // 짧은 화면에서는 카메라를 낮춰 분대를 63% 근처에 두고도 지평선이 화면 안에 남게
    const col = Math.min(BW, BH * 0.62);
    const up = clamp(((FIT.at - FIT.minHz) * BH * 0.93) / (0.09 * col), 9.5, FIT.up);
    fitView(view, BW, BH, ROAD, dolly, { at: FIT.at, up, back: FIT.back, minHz: FIT.minHz });
    fitted = dolly;
  }

  function setQuality(q) { quality = q === 'low' ? 'low' : 'high'; dirty = true; }
  function setShake(on) { shakeOn = !!on; if (!on) trauma = 0; }
  function setPreview(on) { preview = !!on; dirty = true; }
  function setFrozen(on) { frozenSet = !!on; dirty = true; }
  function setHudTarget(x, y) { hudCss = x == null ? null : { x, y }; }

  function reset() {
    for (const p of parts) p.on = false;
    for (const f of fxs) f.on = false;
    for (const f of floats) f.on = false;
    for (const f of flies) f.on = false;
    for (const t of tracers) t.on = false;
    for (const r of rings) r.on = false;
    trauma = 0; flashA = 0; camX = 0; vis.n = 0; lastN = -1; countTint = 0; countPop = 0; shownN = 0;
    dolly = 0; layout();   // 보스전 렌즈를 되돌린다(R1)
    hurtAt = -9; bossImpactT = -9; roarT = -9; bossIntroT = -9; bossDeath = null; enrageT = -9;
    castT = -9; castRun = false; castArena = false; healT = -9; rocketT = -9; snipeT = -9; readyT = -9; healSum = 0; healShown = -9;
    cut = null; clearOverlay();
    lod.clear(); flashes.clear(); hitSeen.clear(); tickAt.clear(); bruteStep.clear(); spSeen.clear(); pendingGet.length = 0;
    lastS = null; stillFor = 0; dirty = true;
  }

  /* ---------- 효과 ---------- */
  const lowFx = () => quality === 'low';
  let partSkip = 0;
  function part(x, y, z, vx, vy, vz, life, c, size = 1, g = 9, spr = null) {
    if (lowFx() && (partSkip++ & 1)) return;
    for (const p of parts) {
      if (p.on) continue;
      p.on = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.c = c; p.size = size; p.g = g; p.spr = spr;
      return;
    }
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
  }
  function ring(x, z, r0, r1, dur, c, o = {}) {
    for (const r of rings) if (!r.on) { Object.assign(r, { on: true, x, z, r0, r1, t: 0, dur, c, follow: o.follow || false, thick: o.thick || 1 }); return; }
  }
  function tracer(x0, y0, z0, x1, y1, z1, c, dur = 0.08) {
    for (const t of tracers) if (!t.on) { Object.assign(t, { on: true, x0, y0, z0, x1, y1, z1, c, t: 0, dur }); return; }
  }
  function shake(a) { if (shakeOn && !reduce) trauma = Math.min(1, trauma + a); }
  function screenFlash(a, rgb) { if (reduce) a *= 0.4; if (a > flashA) { flashA = a; flashRGB = rgb; } }

  /* 코인이 HUD로 날아갈 자리(버퍼 픽셀) */
  function hudTarget() {
    let x = null, y = null;
    if (hudCss) { x = hudCss.x; y = hudCss.y; } else if (typeof document !== 'undefined') {
      const el = document.getElementById('hudCoins');
      if (el && el.offsetParent !== null) { const r = el.getBoundingClientRect(); x = r.left + 10; y = r.top + r.height / 2; }
    }
    if (x == null) return { x: BW - 30, y: 16 };
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
          float(q.x, 3.3 + 0.3 * R, q.z, text, isUnit ? '#FFF09A' : good ? '#DDF3FF' : '#FFD0C4', { scale: 2, life: 1.0, vz: q.vz, out: isUnit ? PANEL.unit.out : good ? PANEL.good.out : PANEL.bad.out, rise: 0.8 });
          const cols = isUnit ? FX_COL.unit : good ? FX_COL.good : FX_COL.bad;
          for (let i = 0; i < 20; i++) part(e.x + (Math.random() - 0.5) * 3, 0.4 + Math.random() * 2.2, e.z, (Math.random() - 0.5) * 6, 1 + Math.random() * 4, -1 - Math.random() * 3, 0.5 + Math.random() * 0.3, cols[i % 3], Math.random() < 0.4 ? 2 : 1);
          countPop = 1;
          if (!good) { screenFlash(0.22, '232,56,79'); shake(0.25); }
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
  function lodStep(key, want, steps) {
    const prev = lod.get(key);
    const st = pickStep(Math.min(1, want), prev, steps);
    if (st !== prev) lod.set(key, st);
    return st;
  }
  /* 피격 번쩍임: 맞은 직후 2프레임만, 같은 대상은 0.34초에 한 번(초당 3회 이하) */
  function flashOn(key, hitT, simT) {
    if (reduce || simT - hitT > 0.05) { const f = flashes.get(key); return !!(f && time < f.until); }
    let f = flashes.get(key);
    if (!f) { f = { last: -9, until: -9 }; flashes.set(key, f); }
    if (time - f.last > 0.34) { f.last = time; f.until = time + 0.034; }
    return time < f.until;
  }
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
    const step = 9;
    const props = bio.props;
    for (let z = Math.floor((view.camZ + 4) / step) * step; z < view.camZ + 104; z += step) {
      for (const side of [-1, 1]) {
        const h = hashInt(z * 7 + (side > 0 ? 3 : 11));
        const kind = props[h % props.length];
        const x = side * (6.4 + ((h >> 3) % 34) / 10);
        const zz = z + ((h >> 8) % 50) / 10;
        push(zz, 10, kind, z * 2 + (side > 0 ? 1 : 0), x);
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
    const st = lodStep('sc' + key, want, STEPS3);
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
      const sel = near && i === idx;
      const dim = near && i !== idx;
      if (!vface(c.x0 + 0.15, c.x1 - 0.15, 0.12, H, row.z)) continue;
      const pumped = s.t - c.hitT < 0.15;
      const farA = dz > 45 ? 0.9 : st === PANEL.unit ? 0.78 : 0.55;
      ctx.fillStyle = `rgba(${st.rgb},${sel ? 0.8 : dim ? (st === PANEL.unit ? 0.55 : 0.38) : pumped ? Math.min(0.9, farA + 0.15) : farA})`;
      trap(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy);
      if (st === PANEL.bad) {
        stripe.setTransform(new DOMMatrix().translate(Math.round(face.dx), Math.round(face.dy)));
        ctx.fillStyle = stripe;
        trap(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy);
      }
      const pw = face.bx - face.ax, ph = face.ay - face.dy;
      if (pw > 14 && ph > 10) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(Math.round(face.dx + 2), Math.round(face.dy + 2), Math.max(2, (pw * 0.22) | 0), 1); }
      ctx.fillStyle = sel ? '#FFFFFF' : pumped ? '#FFFFFF' : st.line;
      trapLine(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy, sel ? 2 : 1);
      const mx = (face.ax + face.bx) / 2, my = (face.ay + face.dy) / 2 - bump;
      cellLabel(c, st, mx, my, pw - 4, ph, sel);
      if (preview && c.op && dz < 40 && dz > 0 && ph > 16) {
        const r = Math.max(0, applyOp(q.n, c.op, c.v));
        const t = '=' + r;
        if (font.measure(t, 'small') <= pw - 2) font.draw(ctx, t, mx, face.ay + 5, { size: 'small', fill: '#FFFFFF', out: st.out });
      }
    }
    ctx.globalAlpha = 1;
  }
  /* 칸 숫자: 판 폭에 맞는 가장 큰 글꼴. 들어갈 자리가 없으면 아예 쓰지 않는다(먼 3칸 겹침 방지, R5) */
  function cellLabel(c, st, mx, my, room, ph, sel) {
    const txt = opText(c);
    if (c.op === 'unit') {
      const ic = atlas.icon(c.k || 'medic');
      const fw = ic.w + 2;
      const tw1 = font.measure(txt, 'big', 1);
      if (ph >= 30 && room >= Math.max(fw, tw1)) {
        unitIcon(ic, mx, my - 6);
        font.draw(ctx, txt, mx, my + 8, { fill: '#FFFFFF', out: st.out });
      } else if (room >= fw + tw1 + 1 && ph >= 13) {
        unitIcon(ic, mx - (tw1 + 1) / 2, my);
        font.draw(ctx, txt, mx + (fw + 1) / 2, my, { fill: '#FFFFFF', out: st.out });
      } else if (room >= fw && ph >= 13) unitIcon(ic, mx, my);
      else if (room >= font.measure(txt, 'small')) font.draw(ctx, txt, mx, my, { size: 'small', fill: '#FFF09A', out: st.out });
      return;
    }
    let size = null, scale = 1;
    if (room >= 44 && font.measure(txt, 'big', 2) <= room && ph >= 26) { size = 'big'; scale = 2; }
    else if (room >= 15 && font.measure(txt, 'big', 1) <= room) size = 'big';
    else if (font.measure(txt, 'small') <= room + 2) size = 'small';
    if (!size) return;
    font.draw(ctx, txt, mx, my, { size, scale, fill: '#FFFFFF', out: st.out });
    if (st.arrow && size === 'big' && ph > 22) arrow(mx, my - (scale === 2 ? 14 : 9), st === PANEL.good);
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
    propSparks(p, 'w' + p.id);
    const hit = s.t - p.hitT < 0.1;
    ctx.fillStyle = '#C9CED6';
    trap(face.dx, face.cx, face.dy, top.tL, top.tR, top.ty);
    ctx.fillStyle = hit ? '#B7BEC9' : '#9AA2B0';
    trap(face.ax, face.bx, face.ay, face.dx, face.cx, face.dy);
    const w = face.bx - face.ax, h = face.ay - face.dy;
    hazard.setTransform(new DOMMatrix().translate(Math.round(face.ax), 0));
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
    ctx.globalAlpha = 1;
  }
  function crateIcon(type) { return type === 'coin' ? 'coin' : type === 'men' ? 'men' : 'gun'; }
  function drawCrate(s, p) {
    const top = boxFaces(p, 1.7);
    if (!top) return;
    const a = fadeIn(face.d);
    if (!a) return;
    ctx.globalAlpha = a;
    propSparks(p, 'c' + p.id);
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
    ctx.globalAlpha = 1;
  }
  function drawCage(s, p) {
    const k = (p.reward && p.reward.k) || 'medic';
    const top = boxFaces(p, 1.8, 0.4);
    if (!top) return;
    const a = fadeIn(face.d);
    if (!a) return;
    ctx.globalAlpha = a;
    propSparks(p, 'g' + p.id);
    const w = face.bx - face.ax, h = face.ay - face.dy;
    // 바닥판
    ctx.fillStyle = '#596277';
    ctx.fillRect(Math.round(face.ax), Math.round(face.ay) - Math.max(1, Math.round(h * 0.07)), Math.round(w), Math.max(1, Math.round(h * 0.07)));
    // 안의 포로(앞모습, 손 흔들며 도와 달라고)
    const cx = (p.x0 + p.x1) / 2;
    if (project(view, cx, 0.12, p.z)) {
      const sheet = CAPTIVE_ART[k] || 'captive_medic';
      const want = (P.s * 1.0) / 13;
      const st = lodStep('cap' + p.id, want, STEPS3);
      const sad = p.passed;
      const fr = sad ? 2 : ((time * 4 + p.id) | 0) & 1;
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
    const st = lodStep('s' + w.id, want, STEPS3);
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
    const st = lodStep('f' + f.id, want, STEPS3);
    let fr;
    if (f.kind === 'spit') {
      const dzq = f.z - s.squad.z;
      const armed = s.phase === 'run' && dzq < 32 && dzq > 6;
      if (armed && f.cd < 0.35) fr = f.cd < 0.12 ? 4 : f.cd < 0.23 ? 3 : 2;
      else if (armed && f.cd > 2.25) fr = 4;   // 방금 쐈다
      else fr = ((time * 3 + f.seed) | 0) & 1;
    } else if (moving) {
      const fps = f.kind === 'runner' ? 12 : f.kind === 'brute' ? 5 : 7;
      fr = ((time * fps + f.seed) | 0) & 3;
    } else fr = ((time * 2 + f.seed) | 0) & 1 ? 0 : 2;
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
    const white = flashOn('f' + f.id, f.hitT, s.t);
    const tell = f.kind === 'spit' && fr >= 2 && fr <= 3;
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
    if (b.hp <= 0) return 10;
    if (time - bossImpactT < 0.28) return 5;
    if (b.slam) return 4;
    if (time - roarT < 0.9) return 6 + (((time * 8) | 0) & 1);
    if (b.clash) return 8 + (((time * 6) | 0) & 1);
    return ((time * 4 * (b.enraged ? 1.25 : 1)) | 0) & 3;
  }
  function drawBoss(s, b, lag, bio) {
    const walking = b.hp > 0 && !b.clash;
    let z = walking ? b.z + b.walk * (b.enraged ? 1.25 : 1) * lag : b.z;
    let x = b.x;
    if (bossDeath) {
      const t = time - bossDeath.t0;
      if (t > 1.15) return;
      if (t < 0.8 && (frameN & 2)) x += 0.12;
    }
    if (!project(view, x, 0, z)) return;
    const sh = atlas.sheet('boss');
    const want = (P.s * 6.4) / (sh.frames[0][0].h - 2);
    const st = lodStep('boss', want, STEPS4);
    const px = P.x;
    let py = P.y;
    const it = time - bossIntroT;
    if (it >= 0 && it < 0.35) py -= Math.round((1 - it / 0.35) ** 2 * 60);
    else if (it >= 0.35 && it < 0.4 && bossIntroT > 0) { burst(b.x, 0.2, b.z, 18, bio === BIOME.snow ? FX_COL.snowDust : FX_COL.dust, 6, 3); bossIntroT = -9; shake(0.35); }
    ctx.fillStyle = bio.shadow;
    ellipse(px, P.y, 2.6 * P.s, 2.6 * P.s * 0.34);
    const fr = bossFrame(s, b);
    const white = b.hp > 0 ? flashOn('boss', b.hitT, s.t) : bossDeath && ((time - bossDeath.t0 < 0.05) || (time - bossDeath.t0 > 0.4 && time - bossDeath.t0 < 0.45));
    const variant = white ? 'white' : b.enraged ? 'rage' : '';
    atlas.draw(ctx, 'boss', fr, px, py, st, variant);
    // 분노: 머리에서 김
    if (b.enraged && b.hp > 0 && (frameN % 5 === 0)) part(b.x + (Math.random() - 0.5) * 2.5, 6.2, z, (Math.random() - 0.5) * 0.6, 1.5, 0, 0.7, '#F4F6FA', 1, -1, 'smoke');
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
    let y = P.y;
    const age = time - vis.born[i];
    if (age < 0.22) y -= Math.round((1 - age / 0.22) * 6);
    else if (age < 0.27 && vis.born[i] > 0) { part(vis.x[i], 0.05, vis.z[i], 0, 0.5, 0, 0.25, '#E6D2B0', 1, 0, 'dust'); vis.born[i] = -9; }
    if (won) y -= Math.round(Math.abs(Math.sin(time * 9 + i * 0.7)) * 2);
    if (vis.helm[i]) {
      atlas.draw(ctx, 'helmet', 0, P.x, y - 9);
      if (!won && q.vz >= 0 && muzzle(i)) atlas.draw(ctx, 'flash', (frameN + i) & 1, P.x + 2, y - 13);
      return;
    }
    const moving = q.vz > 0.5 && !won;
    const fr = moving ? ((time * 10 + i * 0.37) | 0) & 3 : 4 + (((time * 2 + i * 0.31) | 0) & 1);
    const hurt = time - hurtAt < 0.15 && (i * 7 + hurtSeed) % 11 === 0;
    const fire = !won && q.n > 0 && vis.z[i] > q.z - 0.1 && muzzle(i);
    const r = atlas.draw(ctx, 'soldier', fr, P.x, y + (fire ? 1 : 0), 0, hurt ? 'hurt' : '');
    if (fire) {
      const ox = Math.round(P.x) - r.ax, oy = Math.round(y + 1) - r.ay;
      const my = fr === 1 || fr === 3 ? 3 : 4;
      atlas.draw(ctx, 'flash', (frameN + i) & 1, ox + 12, oy + my - 1);
    }
  }
  function drawFlag(s, i, qx, R, z) {
    const x = qx + [0, -0.55, 0.55][i] * R;
    if (!project(view, x, 0, z)) return;
    let y = P.y - 12;
    if (s.phase === 'won') y -= Math.round(Math.abs(Math.sin(time * 9 + i)) * 2);
    atlas.draw(ctx, 'flag', ((time * 3 + i * 0.5) | 0) & 1, P.x + 3, y);
  }
  function muzzle(i) {
    if (quality === 'low' && (frameN & 1)) return false;
    const D = vis.n;
    return ((frameN * 3 + i * 7) % Math.max(5, (D / 5) | 0)) === 0;
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
    let fr = moving ? ((time * 10 + i * 0.5) | 0) & 3 : 4 + (((time * 2 + i) | 0) & 1);
    let variant = '';
    if (m.k === 'rocket') { const t = time - rocketT; if (t < 0.36) fr = t < 0.12 ? 6 : t < 0.24 ? 7 : 0; }
    if (m.k === 'medic' && time - healT < 0.25) variant = 'glow';
    let py = P.y;
    if (won) py -= Math.round(Math.abs(Math.sin(time * 9 + i)) * 2);
    atlas.draw(ctx, sheet, fr, P.x, py, 0, variant);
    // 저격수 조준 반짝임(쿨이 거의 다 찼을 때)
    if (m.k === 'sniper' && typeof m.cd === 'number' && m.cd < 0.18 && m.cd > 0 && (frameN & 2)) atlas.draw(ctx, 'glint', 0, P.x + 6, py - 14);
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
    if (lost) fr = 10;
    else if (h.act > 0 || time - castT < 0.22) fr = 11 + (((time * 6) | 0) & 1);
    else if (q.vz > 0.5 && !won) fr = (((time * 9) | 0) & 3) + 4 * (((time * 4 + 0.5) | 0) & 1);
    else {
      fr = 8 + (((time * 2) | 0) & 1);
      // 가끔 뒤돌아보며 눈을 깜빡인다
      if (time > lookNext + 1.1) lookNext = time + 3 + Math.random() * 3;
      if (time > lookNext && time < lookNext + 1.1) fr = time - lookNext > 0.5 && time - lookNext < 0.62 ? 14 : 13;
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
        atlas.draw(ctx, 'star', 1, P.x + Math.cos(a) * 8, topY + 2 + Math.sin(a) * 2);
      }
    } else if (time - readyT < 0.5 && (frameN & 4)) atlas.draw(ctx, 'glint', 1, P.x + 7, topY + 2);
    // 스킬 중 효과
    if (h.act > 0 && !lost) {
      if (h.id === 'mungchi' && frameN % 26 === 0) ring(qx, z, 0.4, R + 2.5, 0.5, '#FFD84A', { follow: true, thick: 2 });
      if (h.id === 'bori' && frameN % 10 === 0) part(qx + (Math.random() - 0.5) * 2 * R, 1 + Math.random(), q.z + (Math.random() - 0.5) * R, 0, 1.6, 0, 0.9, '#FF6FA0', 1, 0, 'heart');
    }
  }

  /* ---------- 분대 숫자 말풍선(분대 위, 가까운 게이트가 있으면 흐리게) ---------- */
  function drawCount(s, dt, qx) {
    const q = sq;   // 카메라와 같은 시간축의 분대(R4)
    if (q.n !== lastN) lastN = q.n;
    shownN += (q.n - shownN) * Math.min(1, dt * 9);
    if (Math.abs(q.n - shownN) < 0.5) shownN = q.n;
    countPop = Math.max(0, countPop - dt * 4);
    countTint *= Math.max(0, 1 - dt * 3);
    if (q.n <= 0) return;
    const R = radius(q.n);
    if (!project(view, qx, 1.5 + R * 0.25, q.z + R * 0.2)) return;
    let gateNear = false;
    for (const row of s.rows) { const d = row.z - q.z; if (!row.done && d > 0 && d <= 6) { gateNear = true; break; } }
    const n = Math.round(shownN);
    const text = n >= 9999 ? 'MAX' : String(n);
    const pop = countPop > 0.5 ? 1 : 0;
    const tw = font.measure(text, 'big', 2);
    const w = tw + 8 + pop * 2, h = 20 + pop * 2;
    const x = Math.round(P.x - w / 2), y = Math.round(P.y - 20 - h / 2);
    ctx.globalAlpha = gateNear ? 0.35 : 1;
    ctx.fillStyle = OUT;
    ctx.fillRect(x + 2, y, w - 4, h); ctx.fillRect(x, y + 2, w, h - 4); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = countTint > 0.1 ? '#2B5EB8' : countTint < -0.1 ? '#A92644' : '#3A3550';
    ctx.fillRect(x + 2, y + 1, w - 4, h - 2); ctx.fillRect(x + 1, y + 2, w - 2, h - 4);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(x + 3, y + 2, w - 6, 1);
    ctx.fillStyle = OUT;
    ctx.fillRect(Math.round(P.x) - 2, y + h - 1, 5, 2); ctx.fillRect(Math.round(P.x) - 1, y + h + 1, 3, 1);
    font.draw(ctx, text, P.x, y + h / 2, { scale: 2 });
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = OUT; ctx.fillRect(Math.round(P.x) - 8 + i * 6, y - 5, 5, 4);
      ctx.fillStyle = i < q.tier ? TIER[Math.min(3, i + 1)] : '#5C5070';
      ctx.fillRect(Math.round(P.x) - 7 + i * 6, y - 4, 3, 2);
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
    for (const rk of list) {
      const T = rk.T || 1;
      const u = clamp(1 - (rk.t + lag) / T, 0, 1);
      const x = rk.x0 + (rk.x - rk.x0) * u + ox * (1 - u), z = rk.z0 + (rk.z - rk.z0) * u + oz * (1 - u), y = 0.9 + 3 * 4 * u * (1 - u);
      if (!project(view, x, y, z)) continue;
      atlas.draw(ctx, 'rocketShot', (frameN >> 1) & 1, P.x, P.y + 3);
      if (frameN & 1) part(x, y - 0.2, z - 0.4, (Math.random() - 0.5) * 0.4, 0.3, 0, 0.45, '#C9CED6', 1, -0.5, 'smoke');
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
      ctx.fillStyle = `rgba(185,242,91,${(0.22 + 0.3 * k).toFixed(2)})`;
      ellipse(P.x, P.y, 1.2 * P.s, 1.2 * P.s * 0.38);
      ctx.fillStyle = '#E8FFB0';
      ellRing(P.x, P.y, Math.max(2, 1.2 * P.s * (1 - k)), Math.max(1, 1.2 * P.s * 0.38 * (1 - k)), 1);
      ctx.fillStyle = '#B9F25B';
      ellRing(P.x, P.y, 1.2 * P.s, 1.2 * P.s * 0.38, 1);
    }
    const b = s.boss;
    if (b && b.slam && b.hp > 0) {   // 보스가 쓰러지면 예고를 그리지 않는다
      const k = clamp(1 - b.slam.t / b.slam.T, 0, 1);
      const pulse = (((time * 4) | 0) & 1) ? 0.06 : 0;
      ctx.fillStyle = `rgba(232,56,79,${(0.24 + pulse).toFixed(2)})`;
      groundQuad(b.slam.x0 + 0.1, b.slam.x1 - 0.1, q.z - 3.5, b.z - 0.5, 0.02);
      ctx.fillStyle = 'rgba(232,56,79,.5)';
      groundQuad(b.slam.x0 + 0.1, b.slam.x1 - 0.1, q.z - 3.5, q.z - 3.5 + (b.z - q.z + 3) * k, 0.03);
      ctx.fillStyle = '#FFE0D8';
      const xm = (b.slam.x0 + b.slam.x1) / 2;
      for (let i = 0; i < 6; i++) {
        const zz = q.z - 2 + ((((i * 3 - time * 6) % 18) + 18) % 18);
        if (zz < b.z - 1) { groundQuad(xm - 0.7, xm - 0.1, zz + 0.3, zz + 0.55, 0.04); groundQuad(xm + 0.1, xm + 0.7, zz + 0.3, zz + 0.55, 0.04); groundQuad(xm - 0.25, xm + 0.25, zz, zz + 0.35, 0.04); }
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
          const fr = sh === 'brute' ? 1 : 4 + (u > 0.5 ? 1 : 0);
          atlas.draw(ctx, sh, fr, P.x, P.y);
          break;
        }
        case 'sadCaptive': {
          if (!project(view, f.x, 0.1, f.z)) break;
          const st = P.s > 12 ? 0 : 1;
          atlas.draw(ctx, CAPTIVE_ART[f.k] || 'captive_medic', 2, P.x, P.y, st);
          if (((f.t * 6) | 0) & 1) atlas.draw(ctx, 'tear', 0, P.x + 5, P.y - 7);
          break;
        }
        case 'spHit': {
          // 맞아서 쓰러짐: 별이 돌고 펑
          if (!project(view, f.x, 0, f.z)) break;
          const sh = UNIT_ART[f.k] || 'soldier';
          if (u < 0.75) {
            const r = atlas.draw(ctx, sh, 4, P.x + ((frameN & 2) ? 1 : -1), P.y);
            for (let i = 0; i < 3; i++) { const a = f.t * 9 + i * 2.1; atlas.draw(ctx, 'star', 1, P.x + Math.cos(a) * 7, Math.round(P.y) - r.ay + Math.sin(a) * 2); }
          } else if (!f.n) { f.n = 1; fx('puff', f.x, 0.5, f.z, 0.3, { step: 1 }); }
          break;
        }
        case 'spRun': {
          // 호위가 부족해 울며 떠난다
          const x = f.x + f.vx * f.t, z = f.z + f.vz * f.t;
          if (!project(view, x, 0, z)) break;
          const sh = UNIT_ART[f.k] || 'soldier';
          const r = atlas.draw(ctx, sh, ((f.t * 12) | 0) & 3, P.x, P.y);
          if (((f.t * 8) | 0) & 1) atlas.draw(ctx, 'tear', 0, P.x - 6, Math.round(P.y) - r.ay + 6);
          break;
        }
        default:
      }
    }
    void q; void qx;
  }
  function drawParts(dt) {
    for (const p of parts) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0) { p.y = 0; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      if (!project(view, p.x, p.y, p.z)) continue;
      if (p.spr) {
        const fr = p.spr === 'coin' ? ((time * 10) | 0) & 3 : p.spr === 'smoke' ? (p.life < p.max * 0.5 ? 1 : 0) : 0;
        if (p.life < p.max * 0.25 && (frameN & 1)) continue;
        const r = atlas.get(p.spr, fr);
        atlas.blit(ctx, r, Math.round(P.x - r.w / 2), Math.round(P.y - r.h / 2));
        continue;
      }
      ctx.fillStyle = p.c;
      const sz = P.s > 10 ? p.size : 1;
      ctx.fillRect(Math.round(P.x), Math.round(P.y), sz, sz);
    }
  }
  function drawFloats(dt) {
    for (const f of floats) {
      if (!f.on) continue;
      f.life -= dt;
      if (f.life <= 0) { f.on = false; continue; }
      f.y += dt * f.rise;
      f.z += f.vz * dt;
      if (!project(view, f.x, f.y, f.z)) continue;
      const k = 1 - f.life / f.max;
      const scale = f.scale === 2 && k < 0.07 ? 1 : f.scale;   // 작게 떴다가 커진다
      ctx.globalAlpha = f.life < 0.2 ? 0.5 : 1;
      if (f.icon) drawIconText(f.icon, f.text, P.x, P.y, f.fill, f.out, 1);
      else font.draw(ctx, f.text, P.x, P.y, { scale, fill: f.fill, out: f.out });
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

  /* ---------- 컷인(첫 스킬, 보스전 첫 스킬만) ---------- */
  let ov = null, octx = null, ovShown = false;
  function sizeOverlay() {
    ov.width = Math.round(cssW * dpr); ov.height = Math.round(cssH * dpr);
    ov.style.width = cssW + 'px'; ov.style.height = cssH + 'px';
  }
  function overlay() {
    if (ov || typeof document === 'undefined' || !cvs.parentNode) return ov;
    ov = document.createElement('canvas');
    ov.setAttribute('aria-hidden', 'true');
    ov.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:1;';
    cvs.parentNode.insertBefore(ov, cvs.nextSibling);
    octx = ov.getContext('2d');
    sizeOverlay();
    return ov;
  }
  function clearOverlay() { if (octx && ovShown) { octx.clearRect(0, 0, ov.width, ov.height); ovShown = false; } }
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
    const hh = Math.min(66, Math.round(BH * 0.16));
    const y0 = Math.round(BH * 0.3);
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
    // 한글 스킬 이름은 위 덧캔버스에(Jua)
    const o = overlay();
    if (!o) return;
    octx.clearRect(0, 0, ov.width, ov.height);
    ovShown = true;
    if (!H) return;
    const k = cssPer * dpr;
    const X = (px + fr.w * sc + 8) * k, Y = (y0 + hh * 0.42) * k;
    const big = Math.round(Math.min(28, cssW * 0.07) * dpr);
    octx.textAlign = 'left'; octx.textBaseline = 'middle'; octx.lineJoin = 'round';
    octx.font = `${big}px Jua, "Black Han Sans", sans-serif`;
    octx.lineWidth = Math.max(3, big * 0.2);
    octx.strokeStyle = OUT;
    octx.strokeText(H.skill.name + '!', X, Y);
    octx.fillStyle = '#FFF4B0';
    octx.fillText(H.skill.name + '!', X, Y);
    const small = Math.round(big * 0.55);
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
    time += rdt;
    frameN++;
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
    order.length = nItems;
    for (let i = 0; i < nItems; i++) order[i] = items[i];
    order.sort(byDepth);
    // 길가 소품은 먼저(가까운 나무가 게이트 숫자를 가리지 않게)
    for (const it of order) if (it.k === 10) drawScenery(it.o, it.i, it.x, it.z);
    for (const it of order) {
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
    if (lod.size > 600) lod.clear();
    if (flashes.size > 300) flashes.clear();
    if (hitSeen.size > 300) hitSeen.clear();
    if (pendingGet.length && time - pendingGet[0].t > 2) pendingGet.shift();

    drawSpits(s, lag);
    drawRockets(s, lag, qx, R);
    if (s.phase !== 'won' && s.phase !== 'lost') drawBullets(s, alpha);   // 끝난 판의 총알은 멈춰 있으니 그리지 않는다
    drawTracers(rdt);
    for (const r of rings) if (r.on) { r.t += rdt; if (r.t >= r.dur) r.on = false; }
    drawFx(s, rdt, qx);
    drawParts(rdt);
    drawCount(s, rdt, qx);
    drawFloats(rdt);   // 게이트 숫자는 말풍선 위에(R3)
    if (bio === BIOME.snow) drawSnow(rdt);
    drawFlies(rdt);
    drawCut(rdt);
    if (flashA > 0) {
      ctx.fillStyle = `rgba(${flashRGB},${Math.min(0.5, flashA).toFixed(3)})`;
      ctx.fillRect(0, 0, BW, BH);
      flashA = Math.max(0, flashA - rdt * 1.8);
    }
    if (q.n > 0 && q.n < 8 && s.phase !== 'won') {
      // 병력이 아주 적으면 가장자리를 천천히 붉게(번쩍이지 않게)
      const a = 0.16 + 0.08 * Math.sin(time * 3);
      ctx.fillStyle = `rgba(169,38,68,${a.toFixed(3)})`;
      for (let i = 0; i < 3; i++) {
        const m = i * 3;
        ctx.fillRect(m, m, BW - 2 * m, 3); ctx.fillRect(m, BH - m - 3, BW - 2 * m, 3);
        ctx.fillRect(m, m + 3, 3, BH - 2 * m - 6); ctx.fillRect(BW - m - 3, m + 3, 3, BH - 2 * m - 6);
      }
    }
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
    view, screen, resize, draw, events, reset, setQuality, setShake, setPreview, setFrozen, setHudTarget,
    portrait, icon, ready, burst: burstCompat, float: floatCompat,
    get info() { return { BW, BH, K, dpr, cssPer, quality, frozen: frozenSet || stillFor > 0.25, pages: atlas.pages.length, groundMs: +groundMs.toFixed(2), putMs: +putMs.toFixed(2), drawMs: +drawMs.toFixed(2) }; },
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
