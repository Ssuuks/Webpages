/* 땅 그리기 — 버퍼 한 장(Uint32)에 하늘·언덕·모래·도로·연석·안개를 한 번에 칠한다.
   하늘과 언덕은 따로 캐시(카메라가 옆으로 움직였을 때만 다시). 줄마다 월드 z를 계산해 줄무늬가 흐르게 하고,
   멀어서 줄무늬가 한 줄보다 촘촘해지면 중간색으로 바꿔 물결무늬(모아레)를 없앤다. */
import { ROAD } from '../core.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

export function hexU32(h) {
  const n = parseInt(h.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return LE ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
}
function chans(c) { return LE ? [c & 255, (c >>> 8) & 255, (c >>> 16) & 255] : [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255]; }
function pack(r, g, b) { return LE ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0; }
export function lerpU32(a, b, t) {
  const A = chans(a), B = chans(b);
  return pack(Math.round(A[0] + (B[0] - A[0]) * t), Math.round(A[1] + (B[1] - A[1]) * t), Math.round(A[2] + (B[2] - A[2]) * t));
}
function hash2(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }

/* 64×64 잡음 타일(월드 칸에 고정 — 헤엄치지 않는다) */
const NOISE = new Uint8Array(64 * 64);
for (let i = 0; i < NOISE.length; i++) NOISE[i] = hash2(i & 63, i >> 6) & 255;

export function createGround() {
  const pals = new Map();
  let sky = null, skyKey = '', skyRows = 0, skyW = 0;
  const fogCache = new Map();

  function palOf(b) {
    let p = pals.get(b);
    if (p) return p;
    const u = (h) => hexU32(h);
    p = {
      sky: b.sky.map(u), sun: u(b.sun), hillF: u(b.hillF), hillN: u(b.hillN),
      g1: u(b.ground), g2: u(b.ground2), fog: u(b.fog), road: u(b.road), road2: u(b.road2),
      curbA: u(b.curbA), curbB: u(b.curbB), line: u(b.line),
    };
    p.roadMix = lerpU32(p.road, p.road2, 0.5);
    p.curbMix = lerpU32(p.curbA, p.curbB, 0.5);
    p.crack = lerpU32(p.road, hexU32('#2B1D2E'), 0.28);
    p.lineDim = lerpU32(p.line, p.road, 0.45);
    p.edge = lerpU32(p.g1, p.g2, 0.6);
    pals.set(b, p);
    return p;
  }
  function fogged(c, fog, st) {
    const k = c * 8 + st;
    let v = fogCache.get(k);
    if (v === undefined) {
      v = lerpU32(c, fog, st / 4);
      if (fogCache.size > 4000) fogCache.clear();
      fogCache.set(k, v);
    }
    return v;
  }

  function buildSky(BW, rows, hz, off, b, p, quality) {
    sky = new Uint32Array(BW * rows);
    skyRows = rows; skyW = BW;
    const fh = new Float32Array(BW), nh = new Float32Array(BW);
    for (let x = 0; x < BW; x++) {
      const t = (x + off) * 0.045;
      fh[x] = 13 + Math.abs(Math.sin(t) * 11 + Math.sin(t * 2.7) * 5);
      const t2 = (x + off * 1.6) * 0.08 + 4;
      nh[x] = 5 + Math.abs(Math.sin(t2) * 7 + Math.sin(t2 * 3.1) * 3);
    }
    const sunX = BW * 0.72, sunY = hz - Math.max(18, Math.min(34, hz * 0.55)), sunR = 11;
    const n = p.sky.length - 1;
    for (let y = 0; y < rows; y++) {
      const f = Math.max(0, Math.min(0.999, y / Math.max(1, hz))) * n;
      const i0 = Math.floor(f), fr = f - i0;
      const row = y * BW;
      const up = hz - y;
      for (let x = 0; x < BW; x++) {
        let c = quality === 'low' ? (fr > 0.5 ? p.sky[i0 + 1] : p.sky[i0]) : fr > bay(x, y) ? p.sky[i0 + 1] : p.sky[i0];
        const dx = x + 0.5 - sunX, dy = y + 0.5 - sunY;
        const dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < sunR) c = p.sun;
        else if (dd < sunR + 3 && bay(x, y) < 0.5 - (dd - sunR) * 0.15) c = p.sun;
        if (up < nh[x]) c = p.hillN;
        else if (up < fh[x]) c = p.hillF;
        sky[row + x] = c;
      }
    }
  }

  /* u32: 버퍼 픽셀, view: 버퍼 픽셀 기준 카메라 */
  function draw(u32, BW, BH, view, b, camX, quality = 'high') {
    const p = palOf(b);
    const hz = view.horizon;
    const sy = view.shakeY | 0, sx = view.shakeX | 0;
    const hzI = Math.max(0, Math.min(BH, Math.ceil(hz + sy)));
    const off = Math.round(camX * 3);
    const rows = Math.max(0, Math.min(BH, Math.ceil(hz)) + 4);
    const key = `${BW}|${rows}|${Math.round(hz)}|${off}|${b.sky[0]}|${quality}`;
    if (key !== skyKey) { buildSky(BW, rows, Math.round(hz), off, b, p, quality); skyKey = key; }
    // 하늘(흔들림은 줄 단위로 밀어서)
    for (let y = 0; y < hzI; y++) {
      const src = Math.max(0, Math.min(skyRows - 1, y - sy));
      u32.set(sky.subarray(src * skyW, src * skyW + BW), y * BW);
    }
    const h = view.camH, sin = view.sin, cos = view.cos, F = view.F;
    const cx = view.cx + sx, cyy = view.cy + sy;
    const camZ = view.camZ, vcx = view.camX;
    const dzAt = (yy) => { const t = (cyy - yy) / F; const den = sin - t * cos; return den <= 1e-5 ? 1e9 : (h * (t * sin + cos)) / den; };
    const hiQ = quality !== 'low';
    let dzA = dzAt(hzI + 0.5);
    for (let y = hzI; y < BH; y++) {
      const dz = dzA;
      dzA = dzAt(y + 1.5);
      const span = Math.abs(dz - dzA);
      const d = h * sin + dz * cos;
      const s = F / d;
      const wz = camZ + dz;
      const row = y * BW;
      const X = (wx) => cx + (wx - vcx) * s;
      // 모래(땅)
      u32.fill(p.g1, row, row + BW);
      const fill = (x0, x1, c) => {
        let a = Math.round(x0), bb = Math.round(x1);
        if (bb <= a) bb = a + 1;
        if (a < 0) a = 0;
        if (bb > BW) bb = BW;
        if (bb > a) u32.fill(c, row + a, row + bb);
      };
      // 길가 자갈: 월드 칸 경계를 지나는 줄에만 짧은 점(칸에 고정)
      if (hiQ && s > 3) {
        const zc = Math.floor(wz * 1.5), zn = Math.floor((camZ + dzA) * 1.5);
        if (zc !== zn) {
          const wx0 = vcx + (0 - cx) / s, wx1 = vcx + (BW - cx) / s;
          const len = s > 14 ? 3 : s > 8 ? 2 : 1;
          for (let xc = Math.floor(wx0 * 1.5); xc <= Math.ceil(wx1 * 1.5); xc++) {
            const wx = xc / 1.5;
            if (wx > -ROAD - 0.7 && wx < ROAD + 0.7) continue;
            const nv = NOISE[((zc & 63) << 6) | (xc & 63)];
            if (nv < 46) fill(X(wx + (nv & 7) * 0.08), X(wx + (nv & 7) * 0.08) + len, nv < 14 ? p.edge : p.g2);
          }
        }
      }
      // 도로 + 속도감 띠(4u)
      const rc = span < 1.6 ? ((Math.floor(wz / 4) & 1) ? p.road2 : p.road) : p.roadMix;
      fill(X(-ROAD), X(ROAD), rc);
      // 도로 금(드문드문)
      if (hiQ && s > 5) {
        const zc = Math.floor(wz * 2), zn = Math.floor((camZ + dzA) * 2);
        if (zc !== zn) {
          const nv = NOISE[((zc & 63) << 6) | ((zc * 7) & 63)];
          if (nv < 70) { const wx = -ROAD + 0.6 + (nv / 70) * (2 * ROAD - 1.2); fill(X(wx), X(wx) + (s > 12 ? 2 : 1), p.crack); }
        }
      }
      // 연석(2u 줄무늬)
      const cc = span < 0.9 ? ((Math.floor(wz / 2) & 1) ? p.curbA : p.curbB) : p.curbMix;
      fill(X(-ROAD - 0.45), X(-ROAD), cc);
      fill(X(ROAD), X(ROAD + 0.45), cc);
      // 가운데 점선
      if (span < 2 && (((wz % 7) + 7) % 7) < 3) fill(X(-0.09), X(0.09), span < 1 ? p.line : p.lineDim);
      // 안개: 이웃한 단계끼리만 섞는다(멀리 떨어진 두 색을 섞으면 바둑판이 된다)
      const fogK = (d - 70) / 45;
      if (fogK > 0) {
        const lv = Math.min(4, fogK * 4), i0 = Math.floor(lv), fr = lv - i0;
        if (!hiQ) {
          const st = Math.min(4, Math.round(lv));
          if (st) for (let x = 0; x < BW; x++) u32[row + x] = fogged(u32[row + x], p.fog, st);
        } else {
          for (let x = 0; x < BW; x++) {
            const st = Math.min(4, fr > bay(x, y) ? i0 + 1 : i0);
            if (st) u32[row + x] = fogged(u32[row + x], p.fog, st);
          }
        }
      }
    }
  }
  return { draw };
}
