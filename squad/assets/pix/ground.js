/* 땅 그리기 — 버퍼 한 장(Uint32)에 하늘·언덕·모래·도로·연석·안개를 한 번에 칠한다.
   하늘(그라데이션·해)은 화면 크기가 바뀔 때만, 언덕은 카메라가 옆으로 움직였을 때만 다시 만든다.
   줄마다 월드 z를 계산해 줄무늬가 흐르게 하고, 멀어서 줄무늬가 한 줄보다 촘촘해지면 중간색으로 바꿔
   물결무늬(모아레)를 없앤다. 안개는 이웃한 단계끼리만 디더링한다.
   - 안개는 칠한 뒤 픽셀을 다시 읽어 섞지 않고, 칠할 때 바로 안개 낀 색(미리 만든 표)으로 칠한다.
     디더링 무늬는 가로 4칸 주기라 구간을 4칸 무늬로 채운다(T6·T9).
   - 줄마다 바뀌는 값은 draw()의 지역 변수로만 둔다(클로저 변수에 실수를 쓰면 매번 상자에 담겨 쓰레기가 된다).
   - 넓은 화면(가로·태블릿)에서는 폰 기둥 바깥에 자갈을 찍지 않는다. */
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

/* 땅에 쓰는 색 번호 */
const G1 = 0, G2 = 1, EDGE = 2, ROAD1 = 3, ROAD2 = 4, ROADMIX = 5, CRACK = 6, CURBA = 7, CURBB = 8, CURBMIX = 9, LINE = 10, LINEDIM = 11;
const NC = 12;
/* 줄마다 쓰는 색(안개 단계 두 개) — 모듈 단위 표라 쓰레기가 없다.
   색은 Int32로 둔다: 불투명 색(알파 0xFF)은 부호 있는 32비트로 -2^24..-1이라 작은 정수(Smi)로 다뤄져
   함수에 넘겨도 상자(HeapNumber)에 담기지 않는다(Uint32 그대로면 2^31 이상이라 매번 상자가 생긴다, T6). */
const rA = new Int32Array(NC), rB = new Int32Array(NC);

/* 구간 [a, b)를 4칸 주기 무늬로 채운다: x&3 번째 비트가 1이면 rB[ci], 아니면 rA[ci] */
function fillPat(U, row, a, b, ci, mask) {
  const cA = rA[ci], cB = rB[ci];
  const n = b - a;
  if (n <= 0) return;
  if (mask === 0 || cA === cB) { U.fill(cA, row + a, row + b); return; }
  if (mask === 15) { U.fill(cB, row + a, row + b); return; }
  if (n <= 24) {
    for (let x = a; x < b; x++) U[row + x] = (mask >> (x & 3)) & 1 ? cB : cA;
    return;
  }
  for (let x = a; x < a + 4; x++) U[row + x] = (mask >> (x & 3)) & 1 ? cB : cA;
  let len = 4;
  const o = row + a;
  while (len < n) {
    const c = len < n - len ? len : n - len;
    U.copyWithin(o + len, o, o + c);
    len += c;
  }
}
/* 화면 x 구간(반올림한 정수) → 최소 1px, 버퍼 안으로 자르고 칠한다. 정수만 받아 인자가 상자에 담기지 않게 */
function seg(U, row, BW, a, b, ci, mask) {
  if (b <= a) b = a + 1;
  if (a < 0) a = 0;
  if (b > BW) b = BW;
  if (b > a) fillPat(U, row, a, b, ci, mask);
}
const R = Math.round;
/* 안개가 시작하는 깊이(안개 끝 far에 대한 비율) */
const FOG0 = 0.61;

export function createGround() {
  const pals = new Map();
  let base = null, baseKey = '';        // 하늘 그라데이션 + 해
  let sky = null, skyKey = '', skyRows = 0, skyW = 0;   // + 언덕

  function palOf(b) {
    let p = pals.get(b);
    if (p) return p;
    const u = (h) => hexU32(h);
    p = {
      sky: b.sky.map(u), sun: u(b.sun), hillF: u(b.hillF), hillN: u(b.hillN),
      g1: u(b.ground), g2: u(b.ground2), fog: u(b.fog), road: u(b.road), road2: u(b.road2),
      curbA: u(b.curbA), curbB: u(b.curbB), line: u(b.line),
      hills: b.hills || 'dunes', moon: !!b.moon, stars: !!b.stars,
    };
    p.roadMix = lerpU32(p.road, p.road2, 0.5);
    p.curbMix = lerpU32(p.curbA, p.curbB, 0.5);
    p.crack = b.crack ? u(b.crack) : lerpU32(p.road, hexU32('#2B1D2E'), 0.28);   // 용암: 빛나는 금
    p.lineDim = lerpU32(p.line, p.road, 0.45);
    p.edge = lerpU32(p.g1, p.g2, 0.6);
    // 색 번호 → 색, 색 번호 × 안개 단계(0~4) → 안개 낀 색
    const cols = new Int32Array(NC);
    cols[G1] = p.g1; cols[G2] = p.g2; cols[EDGE] = p.edge; cols[ROAD1] = p.road; cols[ROAD2] = p.road2; cols[ROADMIX] = p.roadMix;
    cols[CRACK] = p.crack; cols[CURBA] = p.curbA; cols[CURBB] = p.curbB; cols[CURBMIX] = p.curbMix; cols[LINE] = p.line; cols[LINEDIM] = p.lineDim;
    const fogT = new Int32Array(NC * 5);
    for (let c = 0; c < NC; c++) for (let st = 0; st <= 4; st++) fogT[c * 5 + st] = st ? lerpU32(cols[c], p.fog, st / 4) : cols[c];
    p.cols = cols; p.fogT = fogT; p.fogI = p.fog | 0;
    pals.set(b, p);
    return p;
  }

  function buildBase(BW, rows, hz, p, quality) {
    base = new Uint32Array(BW * rows);
    const sunX = BW * 0.72, sunY = hz - Math.max(18, Math.min(34, hz * 0.55)), sunR = p.moon ? 8 : 11;
    const n = p.sky.length - 1;
    const starC = lerpU32(p.sun, p.sky[0], 0.25);
    for (let y = 0; y < rows; y++) {
      const f = Math.max(0, Math.min(0.999, y / Math.max(1, hz))) * n;
      const i0 = Math.floor(f), fr = f - i0;
      const row = y * BW;
      for (let x = 0; x < BW; x++) {
        let c = quality === 'low' ? (fr > 0.5 ? p.sky[i0 + 1] : p.sky[i0]) : fr > bay(x, y) ? p.sky[i0 + 1] : p.sky[i0];
        // 별: 하늘 위쪽 60%에 드문드문(칸에 고정), 가끔 십자 모양 큰 별
        if (p.stars && y < hz * 0.6) {
          const hs = hash2(x, y) & 1023;
          if (hs < 5) c = hs < 2 ? p.sun : starC;
        }
        const dx = x + 0.5 - sunX, dy = y + 0.5 - sunY;
        const dd = Math.sqrt(dx * dx + dy * dy);
        if (p.moon) {
          // 초승달: 원에서 오른쪽 위로 비킨 원을 뺀다, 둘레에 옅은 빛
          const ex = dx - 4, ey = dy + 3;
          const inner = Math.sqrt(ex * ex + ey * ey) < sunR - 0.5;
          if (dd < sunR && !inner) c = p.sun;
          else if (!inner && dd < sunR + 4 && bay(x, y) < 0.32 - (dd - sunR) * 0.08) c = starC;
        } else if (dd < sunR) c = p.sun;
        else if (dd < sunR + 3 && bay(x, y) < 0.5 - (dd - sunR) * 0.15) c = p.sun;
        base[row + x] = c;
      }
    }
  }
  /* 언덕 높이(열마다): 먼 줄(fh)·가까운 줄(nh). 모양은 지역마다(hills). 카메라가 옆으로 움직였을 때만 다시 만든다 */
  function hillH(style, x, off) {
    const uF = x + off, uN = x + Math.round(off * 1.6);
    let fh, nh, glow = 0;
    switch (style) {
      case 'blocks': {
        // 건물: 12칸마다 하나(폭 7~11), 납작한 지붕·부서진 꼭대기·안테나
        const c = Math.floor(uF / 12), pos = uF - c * 12, h = hash2(c, 71);
        const w = 7 + (h % 5);
        if (pos < w) {
          fh = 14 + ((h >>> 4) % 17);
          if ((h >>> 9) & 1 && pos > w / 2) fh -= ((pos * 3) % 5) + 2;   // 부서진 꼭대기
          if ((h >>> 10) & 1 && pos === 2) fh += 5;                     // 안테나
          glow = h;
        } else fh = 6 + ((h >>> 12) % 4);
        // 가까운 잔해 더미
        const t2 = uN * 0.11;
        nh = 3 + Math.abs(Math.sin(t2) * 3 + Math.sin(t2 * 2.3) * 1.5) + (hash2(uN, 5) & 1);
        break;
      }
      case 'domes': {
        // 둥근 나무 꼭대기: 10칸마다 반지름 5~9의 반원, 이웃끼리 겹친다
        fh = 6;
        for (let k = -1; k <= 1; k++) {
          const c = Math.floor(uF / 11) + k, r = 5 + (hash2(c, 33) % 5), dx = uF - (c * 11 + 5);
          if (Math.abs(dx) < r) fh = Math.max(fh, 6 + (hash2(c, 34) % 9) + Math.sqrt(r * r - dx * dx) * 1.1);
        }
        glow = 1;
        nh = 3;
        for (let k = -1; k <= 1; k++) {
          const c = Math.floor(uN / 7) + k, r = 3 + (hash2(c, 35) % 3), dx = uN - (c * 7 + 3);
          if (Math.abs(dx) < r) nh = Math.max(nh, 3 + Math.sqrt(r * r - dx * dx));
        }
        break;
      }
      case 'peaks': {
        // 뾰족한 화산: 22칸마다 봉우리, 가끔 꼭대기가 패인 분화구(용암 빛)
        fh = 7;
        for (let k = -1; k <= 1; k++) {
          const c = Math.floor(uF / 22) + k, h = hash2(c, 41), dx = Math.abs(uF - (c * 22 + 11));
          let ph = 15 + (h % 14) - dx * (1.2 + ((h >>> 5) & 3) * 0.2);
          const crater = (h >>> 8) & 1;
          if (crater && dx < 2) { ph -= 2; glow = 1; }
          if (ph > fh) { fh = ph; if (!(crater && dx < 3)) glow = 0; else glow = 1; }
        }
        nh = 4 + Math.abs(((uN * 0.7) % 6) - 3) + (hash2(uN >> 2, 9) % 3);
        break;
      }
      case 'fair': {
        // 천막: 24칸마다 둥근 삼각 지붕(세로 줄무늬, 꼭대기 깃발) + 낮은 담
        const c = Math.floor(uF / 24), dx = Math.abs(uF - (c * 24 + 12)), h = hash2(c, 51), hw = 8 + (h % 3);
        if (dx <= hw) {
          fh = 9 + (h % 6) + (hw - dx) * 0.9;
          glow = dx === 0 ? 3 : 1 + ((Math.floor((uF - c * 24 + 1) / 3)) & 1);
          if (dx === 0) fh += 3;
        } else fh = 5;
        // 가까운 울타리: 낮은 띠 + 6칸마다 기둥
        nh = 3 + ((uN % 6) === 0 ? 2 : 0);
        break;
      }
      default: {
        const t = uF * 0.045;
        fh = 13 + Math.abs(Math.sin(t) * 11 + Math.sin(t * 2.7) * 5);
        const t2 = (x + off * 1.6) * 0.08 + 4;
        nh = 5 + Math.abs(Math.sin(t2) * 7 + Math.sin(t2 * 3.1) * 3);
      }
    }
    HH[0] = fh; HH[1] = nh; HH[2] = glow;
  }
  const HH = new Float64Array(3);
  function buildSky(BW, rows, hz, off, p) {
    if (!sky || sky.length !== base.length) sky = new Uint32Array(base.length);
    sky.set(base);
    skyRows = rows; skyW = BW;
    const style = p.hills;
    const lit = p.sun, glowC = p.curbA, stripe = p.curbB;
    const rimC = lerpU32(p.hillF, p.sun, 0.22), tentC = lerpU32(p.hillF, p.curbB, 0.32);
    // 언덕: 열마다 높이만 계산해 위에서 아래로 칠한다(먼 언덕은 느리게, 가까운 언덕은 빠르게 밀린다)
    for (let x = 0; x < BW; x++) {
      hillH(style, x, off);
      const fh = HH[0], nh = HH[1], g = HH[2];
      const yF = Math.max(0, Math.ceil(hz - fh)), yN = Math.max(0, Math.ceil(hz - nh));
      for (let y = yF; y < rows; y++) {
        let c = y >= yN ? p.hillN : p.hillF;
        if (y < yN) {
          if (style === 'blocks' && g) {
            // 창문: 3칸 격자, 몇 개만 노랗게
            const wx = (x + off) % 12, wy = y - yF;
            if (wy > 1 && (wx % 3) === 1 && (wy % 3) === 1 && (hash2(x + off, y) & 7) === 0) c = lit;
          } else if (style === 'peaks' && g && y < yF + 2) c = glowC;
          else if (style === 'domes' && y === yF) c = rimC;
          else if (style === 'fair' && g === 2) c = tentC;
          else if (style === 'fair' && g === 3 && y < yF + 3) c = glowC;
        }
        sky[y * BW + x] = c;
      }
    }
    // 대관람차(놀이공원): 먼 언덕과 같은 빠르기로 밀린다 — 테·살 8개·다리 둘(언덕색), 테의 전구 12개(연석 두 색)
    if (style === 'fair') {
      const R = 14, cy = hz - 19;
      const span = BW + 4 * R;
      const cxw = ((((BW * 0.24 - off) % span) + span) % span) - 2 * R;
      const x0 = Math.max(0, Math.floor(cxw - R - 2)), x1 = Math.min(BW - 1, Math.ceil(cxw + R + 2));
      for (let y = Math.max(0, Math.floor(cy - R - 1)); y < Math.min(rows, Math.ceil(hz)); y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cxw, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy);
          const i = y * BW + x;
          if (sky[i] === p.hillN) continue;   // 가까운 울타리가 앞
          if (d <= R + 0.5 && d >= R - 0.8) sky[i] = p.hillF;
          else if (d < R && (Math.abs(dx) < 0.55 || Math.abs(dy) < 0.55 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.6)) sky[i] = p.hillF;
          else if (dy > 0 && Math.abs(Math.abs(dx) - dy * 0.5) < 0.7) sky[i] = p.hillF;   // 다리
        }
      }
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6 + 0.26;
        const bx = Math.round(cxw + Math.cos(a) * R - 0.5), by = Math.round(cy + Math.sin(a) * R - 0.5);
        if (bx >= 0 && bx < BW && by >= 0 && by < rows && sky[by * BW + bx] !== p.hillN) sky[by * BW + bx] = k & 1 ? glowC : stripe;
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
    const rows = Math.max(1, Math.min(BH, Math.ceil(hz)) + 4);
    const hzR = Math.round(hz);
    const bk = `${BW}|${rows}|${hzR}|${b.sky[0]}|${quality}`;
    if (bk !== baseKey) { buildBase(BW, rows, hzR, p, quality); baseKey = bk; skyKey = ''; }
    const key = bk + '|' + off;
    if (key !== skyKey) { buildSky(BW, rows, hzR, off, p); skyKey = key; }
    // 하늘(흔들림은 줄 단위로 밀어서)
    if (sy === 0) u32.set(sky.subarray(0, hzI * BW), 0);
    else for (let y = 0; y < hzI; y++) {
      const src = Math.max(0, Math.min(skyRows - 1, y - sy));
      u32.set(sky.subarray(src * skyW, src * skyW + BW), y * BW);
    }
    const h = view.camH, sin = view.sin, cos = view.cos, F = view.F;
    const cyy = view.cy + sy;
    const camZ = view.camZ;
    const cx = view.cx + sx, vx = view.camX;
    const cols = p.cols, fogT = p.fogT, fogC = p.fogI;
    const hiQ = quality !== 'low';
    // 안개: 카메라 깊이 fog0부터 짙어져 far에서 다 덮는다(물건이 나타나는 깊이 — render.js fadeIn과 같은 far)
    const far = view.far || 115, fog0 = far * FOG0, fogSpan = far - fog0;
    // 자갈은 폰 기둥(가운데 col 폭의 ±75%) 안에만 — 넓은 화면의 바깥은 맨 모래(T9)
    const colHalf = (view.col || BW) * 0.75;
    const pxL = Math.max(0, cx - colHalf), pxR = Math.min(BW, cx + colHalf);
    // 화면 줄 → 카메라에서의 깊이(월드 z 거리)
    let t = (cyy - (hzI + 0.5)) / F;
    let den = sin - t * cos;
    let dzA = den <= 1e-5 ? 1e9 : (h * (t * sin + cos)) / den;
    for (let y = hzI; y < BH; y++) {
      const dz = dzA;
      t = (cyy - (y + 1.5)) / F;
      den = sin - t * cos;
      dzA = den <= 1e-5 ? 1e9 : (h * (t * sin + cos)) / den;
      const span = Math.abs(dz - dzA);
      const d = h * sin + dz * cos;
      const s = F / d;
      const wz = camZ + dz;
      const row = y * BW;
      // 완전히 안개 속인 줄(지평선 근처)은 바로 채운다
      if (d >= far) { u32.fill(fogC, row, row + BW); continue; }
      // 이 줄의 안개: 이웃한 두 단계(s0·s1)를 가로 4칸 베이어 무늬(mask)로 섞는다
      const fogK = (d - fog0) / fogSpan;
      let mask = 0;
      if (fogK > 0) {
        const lv = Math.min(4, fogK * 4), i0 = Math.floor(lv), fr = lv - i0;
        let s0 = i0 < 4 ? i0 : 4, s1 = i0 + 1 < 4 ? i0 + 1 : 4;
        if (hiQ) {
          const bo = (y & 3) << 2;
          mask = (fr > BAYER[bo] ? 1 : 0) | (fr > BAYER[bo | 1] ? 2 : 0) | (fr > BAYER[bo | 2] ? 4 : 0) | (fr > BAYER[bo | 3] ? 8 : 0);
        } else { s0 = s1 = Math.min(4, Math.round(lv)); }
        for (let c = 0; c < NC; c++) { rA[c] = fogT[c * 5 + s0]; rB[c] = fogT[c * 5 + s1]; }
      } else {
        for (let c = 0; c < NC; c++) { rA[c] = cols[c]; rB[c] = cols[c]; }
      }
      // 모래(땅)
      fillPat(u32, row, 0, BW, G1, mask);
      // 길가 자갈: 월드 칸 경계를 지나는 줄에만 짧은 점(칸에 고정)
      if (hiQ && s > 3) {
        const zc = Math.floor(wz * 1.5), zn = Math.floor((camZ + dzA) * 1.5);
        if (zc !== zn) {
          const wx0 = vx + (pxL - cx) / s, wx1 = vx + (pxR - cx) / s;
          const len = s > 14 ? 3 : s > 8 ? 2 : 1;
          const zr = (zc & 63) << 6;
          for (let xc = Math.floor(wx0 * 1.5), xe = Math.ceil(wx1 * 1.5); xc <= xe; xc++) {
            const wx = xc / 1.5;
            if (wx > -ROAD - 0.7 && wx < ROAD + 0.7) continue;
            const nv = NOISE[zr | (xc & 63)];
            if (nv < 46) { const px = cx + (wx + (nv & 7) * 0.08 - vx) * s; seg(u32, row, BW, R(px), R(px + len), nv < 14 ? EDGE : G2, mask); }
          }
        }
      }
      // 도로 + 속도감 띠(4u)
      const xRL = cx + (-ROAD - vx) * s, xRR = cx + (ROAD - vx) * s;
      seg(u32, row, BW, R(xRL), R(xRR), span < 1.6 ? ((Math.floor(wz / 4) & 1) ? ROAD2 : ROAD1) : ROADMIX, mask);
      // 도로 금(드문드문)
      if (hiQ && s > 5) {
        const zc = Math.floor(wz * 2), zn = Math.floor((camZ + dzA) * 2);
        if (zc !== zn) {
          const nv = NOISE[((zc & 63) << 6) | ((zc * 7) & 63)];
          if (nv < 70) { const px = cx + (-ROAD + 0.6 + (nv / 70) * (2 * ROAD - 1.2) - vx) * s; seg(u32, row, BW, R(px), R(px + (s > 12 ? 2 : 1)), CRACK, mask); }
        }
      }
      // 연석(2u 줄무늬)
      const cc = span < 0.9 ? ((Math.floor(wz / 2) & 1) ? CURBA : CURBB) : CURBMIX;
      seg(u32, row, BW, R(cx + (-ROAD - 0.45 - vx) * s), R(xRL), cc, mask);
      seg(u32, row, BW, R(xRR), R(cx + (ROAD + 0.45 - vx) * s), cc, mask);
      // 가운데 점선
      if (span < 2 && (((wz % 7) + 7) % 7) < 3) seg(u32, row, BW, R(cx + (-0.09 - vx) * s), R(cx + (0.09 - vx) * s), span < 1 ? LINE : LINEDIM, mask);
    }
  }
  return { draw };
}
