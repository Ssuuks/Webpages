/* 도트 래스터 — DOM 없는 색 격자. 스프라이트 정의(art.js)를 색 배열로 펼치고,
   줄이기(정해진 단계)·외곽선·실루엣을 만든다. 캔버스로 옮기는 일은 atlas.js가 한다(노드 테스트에서도 돈다). */

export class Raster {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.a = new Array(w * h).fill(null);
  }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.a[y * this.w + x] : null; }
  px(x, y, c, clip = false) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (clip && !this.a[i]) return;
    this.a[i] = c;
  }
  rect(x, y, w, h, c, clip = false) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, clip);
  }
  ell(cx, cy, rx, ry, c, clip = false) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c, clip);
      }
    }
  }
  /* 문자 격자: '.'·' '는 투명, '_'는 지우기 */
  rows(x, y, rows, map, clip = false) {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      for (let i = 0; i < r.length; i++) {
        const ch = r[i];
        if (ch === '.' || ch === ' ') continue;
        if (ch === '_') { this.px(x + i, y + j, null); continue; }
        this.px(x + i, y + j, map[ch] || '#FF00FF', clip);
      }
    }
  }
  line(x0, y0, x1, y1, c, clip = false) {
    const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) this.px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c, clip);
  }
  clone() { const r = new Raster(this.w, this.h); r.a = this.a.slice(); return r; }
  flipX() {
    const r = new Raster(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) r.a[y * this.w + x] = this.a[y * this.w + this.w - 1 - x];
    return r;
  }
  count() { let n = 0; for (const c of this.a) if (c) n++; return n; }
}

/* 문자 격자 → 래스터 (가장 긴 줄 폭) */
export function fromRows(rows, map) {
  const w = Math.max(...rows.map((r) => r.length));
  const R = new Raster(w, rows.length);
  R.rows(0, 0, rows, map);
  return R;
}

/* 그리기 명령 목록 → 래스터. 색은 팔레트 키(한 글자) 또는 '#rrggbb'.
   ['ell',cx,cy,rx,ry,c] ['rect',x,y,w,h,c] ['rows',x,y,rows] ['px',x,y,c] ['line',x0,y0,x1,y1,c]
   명령 이름 끝에 '*'를 붙이면 이미 칠한 곳에만 칠한다(음영·하이라이트용). 'clear'는 투명으로 지운다. */
export function runOps(w, h, ops, pal) {
  const R = new Raster(w, h);
  const col = (k) => (k == null ? null : k[0] === '#' ? k : pal[k] || '#FF00FF');
  for (const op of ops) {
    const name = op[0];
    const clip = name.endsWith('*');
    const n = clip ? name.slice(0, -1) : name;
    switch (n) {
      case 'ell': R.ell(op[1], op[2], op[3], op[4], col(op[5]), clip); break;
      case 'rect': R.rect(op[1], op[2], op[3], op[4], col(op[5]), clip); break;
      case 'rows': R.rows(op[1], op[2], op[3], pal, clip); break;
      case 'px': R.px(op[1], op[2], col(op[3]), clip); break;
      case 'line': R.line(op[1], op[2], op[3], op[4], col(op[5]), clip); break;
      case 'clearEll': R.ell(op[1], op[2], op[3], op[4], null); break;
      case 'clearRect': R.rect(op[1], op[2], op[3], op[4], null); break;
      default: throw new Error('unknown op ' + name);
    }
  }
  return R;
}

/* 프레임 정의 하나 → 래스터 */
export function frameRaster(fr, pal) {
  if (Array.isArray(fr)) return fromRows(fr, pal);
  return runOps(fr.w, fr.h, fr.ops, pal);
}

/* 정해진 비율로 줄이기: 칸마다 면적 가중 다수결(눈·외곽 같은 작은 디테일은 가중치를 더 준다).
   발끝(아래 가운데)을 기준으로 격자를 맞춰 단계가 바뀌어도 서 있는 자리가 흔들리지 않게 한다. */
export function downscale(R, k, detail = null) {
  if (k >= 1) return R.clone();
  const W = Math.max(1, Math.round(R.w * k));
  const H = Math.max(1, Math.round(R.h * k));
  const out = new Raster(W, H);
  const ox = (R.w - W / k) / 2;
  const oy = R.h - H / k;
  const votes = new Map();
  for (let j = 0; j < H; j++) {
    const y0 = oy + j / k, y1 = oy + (j + 1) / k;
    for (let i = 0; i < W; i++) {
      const x0 = ox + i / k, x1 = ox + (i + 1) / k;
      votes.clear();
      let cover = 0;
      const area = (x1 - x0) * (y1 - y0);
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const hy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (hy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const hx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (hx <= 0) continue;
          const c = R.get(x, y);
          if (!c) continue;
          const a = hx * hy;
          cover += a;
          const wgt = detail && detail.has(c) ? 2.4 : 1;
          votes.set(c, (votes.get(c) || 0) + a * wgt);
        }
      }
      if (cover < area * 0.42) continue;
      let best = null, bv = -1;
      for (const [c, v] of votes) if (v > bv) { bv = v; best = c; }
      out.a[j * W + i] = best;
    }
  }
  return out;
}

/* 1px 외곽선(4방향 이웃 → 모서리가 둥글게) — 둘레를 1px씩 키운다 */
export function outline(R, color) {
  const W = R.w + 2, H = R.h + 2;
  const out = new Raster(W, H);
  for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) out.a[(y + 1) * W + x + 1] = R.a[y * R.w + x];
  if (!color) return out;
  const src = out.a.slice();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (src[i]) continue;
      if ((x > 0 && src[i - 1]) || (x < W - 1 && src[i + 1]) || (y > 0 && src[i - W]) || (y < H - 1 && src[i + W])) out.a[i] = color;
    }
  }
  return out;
}

export function silhouette(R, color = '#FFFFFF') {
  const out = new Raster(R.w, R.h);
  for (let i = 0; i < R.a.length; i++) if (R.a[i]) out.a[i] = color;
  return out;
}

/* 색 바꾸기(팔레트 교체 대신 완성된 래스터에) */
export function recolor(R, map) {
  const out = R.clone();
  for (let i = 0; i < out.a.length; i++) { const c = out.a[i]; if (c && map[c]) out.a[i] = map[c]; }
  return out;
}

/* RGBA 바이트로 */
const hexCache = new Map();
export function rgb(h) {
  let v = hexCache.get(h);
  if (!v) { const n = parseInt(h.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; hexCache.set(h, v); }
  return v;
}
export function toRGBA(R) {
  const d = new Uint8ClampedArray(R.w * R.h * 4);
  for (let i = 0; i < R.a.length; i++) {
    const c = R.a[i];
    if (!c) continue;
    const [r, g, b] = rgb(c);
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
  }
  return d;
}

/* CIE76 색차(팔레트 의미 규칙 테스트용) */
export function lab(h) {
  const [r8, g8, b8] = rgb(h);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const r = lin(r8), g = lin(g8), b = lin(b8);
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export function deltaE(a, b) {
  const A = lab(a), B = lab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}
