/* 아틀라스 — art.js 그림을 텍스처 페이지(캔버스)에 한 번 굽는다.
   단계(1·0.75·0.5·0.33)마다 따로 줄여 구워 두고, 그릴 때는 항상 1:1로 정수 좌표에 찍는다(반짝임 없음).
   급한 것은 처음 쓸 때 바로 굽고, 나머지는 쉬는 틈에 조금씩 굽는다. */
import { SHEETS, PAL, OUT, ICONS, ICON_PAL_EXPORT } from './art.js';
import { frameRaster, outline, downscale, silhouette, toRGBA } from './raster.js';

const PAGE = 1024;

export function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

/* 단계 고르기: 로그 거리로 가장 가까운 단계, 경계에서 ±10% 머뭇거림(왔다 갔다 깜빡이지 않게) */
export function pickStep(want, prev, steps) {
  let best = 0, be = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const e = Math.abs(Math.log(steps[i] / want));
    if (e < be) { be = e; best = i; }
  }
  if (prev == null || prev === best || prev < 0 || prev >= steps.length) return best;
  if (Math.abs(prev - best) > 1) return best;
  const edge = Math.sqrt(steps[prev] * steps[best]);
  if (steps[best] > steps[prev]) return want > edge * 1.1 ? best : prev;
  return want < edge / 1.1 ? best : prev;
}

const resolvePal = (p) => (typeof p === 'string' ? PAL[p] : p);

export function createAtlas() {
  const pages = [];
  let page = null, pg = null, shelves = [], shelfY = 0;
  const sheets = new Map();
  const custom = new Map();
  let bakedPx = 0;

  function newPage() {
    page = mkCanvas(PAGE, PAGE);
    pg = page.getContext('2d');
    pages.push(page);
    shelves = [];
    shelfY = 0;
  }
  /* 선반 채우기 */
  function place(w, h) {
    if (w > PAGE || h > PAGE) throw new Error('sprite too big');
    if (!page) newPage();
    for (const s of shelves) {
      if (h <= s.h && h >= s.h * 0.5 && s.x + w <= PAGE) { const x = s.x; s.x += w + 1; return { x, y: s.y }; }
    }
    if (shelfY + h > PAGE) { newPage(); }
    const s = { y: shelfY, h, x: w + 1 };
    shelves.push(s);
    shelfY += h + 1;
    return { x: 0, y: s.y };
  }
  function put(R) {
    const { x, y } = place(R.w, R.h);
    const im = new ImageData(toRGBA(R), R.w, R.h);
    pg.putImageData(im, x, y);
    bakedPx += R.w * R.h;
    return { img: page, sx: x, sy: y, w: R.w, h: R.h, ax: R.w >> 1, ay: R.h - 1 };
  }

  /* 시트 하나 굽기 */
  function bake(name) {
    const sh = SHEETS[name];
    if (!sh) throw new Error('no sheet ' + name);
    const pal = resolvePal(sh.pal);
    const lods = sh.lod || [1];
    const detail = new Set((sh.detail || ['K', 'W']).map((c) => pal[c]).filter(Boolean));
    const outOf = (i, o) => (sh.outFrames ? sh.outFrames[i] : o !== undefined ? o : sh.out === undefined ? OUT : sh.out);
    const rec = { lods, frames: [], white: [], alts: {}, n: sh.frames.length, muzzle: sh.muzzle || null };
    const variants = [['', pal, undefined]];
    if (sh.alts) {
      for (const [an, a] of Object.entries(sh.alts)) {
        if (typeof a === 'string') variants.push([an, PAL[a], undefined]);
        else if (a.pal && !a.K) variants.push([an, resolvePal(a.pal), a.out]);
        else variants.push([an, a, undefined]);
      }
    }
    for (const [vn, vp, vo] of variants) {
      const list = [];
      for (let i = 0; i < sh.frames.length; i++) {
        const base = frameRaster(sh.frames[i], vp);
        const per = [];
        for (const k of lods) {
          let R = k >= 1 ? base : downscale(base, k, detail);
          if (sh.frames[i].dither) R = ditherOut(R);
          R = outline(R, outOf(i, vo));
          per.push(put(R));
          if (!vn && sh.flash) {
            if (!rec.white[i]) rec.white[i] = [];
            rec.white[i].push(put(silhouette(R)));
          }
        }
        list.push(per);
      }
      if (!vn) rec.frames = list;
      else rec.alts[vn] = list;
    }
    sheets.set(name, rec);
    return rec;
  }
  function ditherOut(R) {
    const o = R.clone();
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if ((x + y) & 1) o.a[y * o.w + x] = null;
    return o;
  }

  function sheet(name) { return sheets.get(name) || bake(name); }
  /* 프레임 기록(이미지·위치·기준점) */
  function get(name, frame = 0, step = 0, variant = '') {
    const sh = sheet(name);
    const f = ((frame % sh.n) + sh.n) % sh.n;
    const list = variant === 'white' ? sh.white : variant ? sh.alts[variant] || sh.frames : sh.frames;
    const per = list[f] || sh.frames[f];
    return per[Math.min(step, per.length - 1)];
  }
  /* 발끝(아래 가운데) 기준으로 정수 좌표에 1:1로 찍는다 */
  function draw(ctx, name, frame, x, y, step = 0, variant = '') {
    const r = get(name, frame, step, variant);
    ctx.drawImage(r.img, r.sx, r.sy, r.w, r.h, Math.round(x) - r.ax, Math.round(y) - r.ay, r.w, r.h);
    return r;
  }
  function blit(ctx, r, x, y) {
    ctx.drawImage(r.img, r.sx, r.sy, r.w, r.h, x, y, r.w, r.h);
  }
  /* 임의의 래스터(글꼴 글자 등)를 한 번 굽고 기억 */
  function rasterRec(key, make) {
    let r = custom.get(key);
    if (!r) { r = put(make()); custom.set(key, r); }
    return r;
  }
  function icon(name) {
    return rasterRec('icon:' + name, () => outline(frameRaster(ICONS[name], ICON_PAL_EXPORT), OUT));
  }

  /* 쉬는 틈에 나머지 굽기 */
  function bakeIdle(names, onDone) {
    const todo = names.filter((n) => !sheets.has(n));
    const idle = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 120 }) : (fn) => setTimeout(fn, 16);
    const run = () => {
      const t0 = performance.now();
      while (todo.length && performance.now() - t0 < 8) {
        const n = todo.shift();
        if (!sheets.has(n)) bake(n);
      }
      if (todo.length) idle(run);
      else if (onDone) onDone();
    };
    idle(run);
  }

  return { get, draw, blit, sheet, has: (n) => sheets.has(n), bake: sheet, bakeIdle, rasterRec, icon, pages, get bakedPx() { return bakedPx; } };
}

/* 래스터 → 독립 캔버스(DOM 아이콘·초상화용), 정수 배율 */
export function rasterCanvas(R, scale = 1) {
  const c = mkCanvas(R.w * scale, R.h * scale);
  const g = c.getContext('2d');
  const tmp = mkCanvas(R.w, R.h);
  tmp.getContext('2d').putImageData(new ImageData(toRGBA(R), R.w, R.h), 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(tmp, 0, 0, R.w * scale, R.h * scale);
  c.style.imageRendering = 'pixelated';
  c.style.width = R.w * scale + 'px';
  c.style.height = R.h * scale + 'px';
  return c;
}
