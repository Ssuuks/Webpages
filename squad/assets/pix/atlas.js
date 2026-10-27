/* 아틀라스 — art.js 그림을 텍스처 페이지(캔버스)에 한 번 굽는다.
   단계(1·0.75·0.5·0.33)마다 따로 줄여 구워 두고, 그릴 때는 항상 1:1로 정수 좌표에 찍는다(반짝임 없음).
   - 굽기는 쉬는 틈에(bakeIdle) 조금씩 한다. 시트 하나도 (변형, 프레임, 단계)마다 쉬어 갈 수 있게 생성기로 나눈다.
   - 시트는 큰 페이지(1024)에, 글자·아이콘 같은 작은 기록은 작은 페이지(256)에 따로 둔다.
     게임 중에 뒤늦게 굽게 되더라도(있어서는 안 되지만) 작은 페이지만 다시 올라가서 멈칫하지 않는다.
   - 준비(ready)가 끝나기 전에는 픽셀을 CPU 버퍼에 모아 두었다가, 그 시트를 처음 그릴 때나 준비가 끝날 때 한 번에 올린다.
   - 준비가 끝난 뒤의 굽기는 lateBakes로 센다(그리는 중 굽기 = 0이어야 한다). */
import { SHEETS, PAL, OUT, ICONS, ICON_PAL_EXPORT } from './art.js';
import { frameRaster, outline, downscale, silhouette, toRGBA, rgb } from './raster.js';

const PAGE = 1024;
const GPAGE = 256;

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

/* 래스터를 RGBA 버퍼(폭 stride)의 (x, y)에 그대로 쓴다 */
function writeRGBA(data, stride, R, x, y) {
  const a = R.a;
  for (let j = 0; j < R.h; j++) {
    let o = ((y + j) * stride + x) * 4;
    const row = j * R.w;
    for (let i = 0; i < R.w; i++, o += 4) {
      const c = a[row + i];
      if (!c) { data[o + 3] = 0; continue; }
      const v = rgb(c);
      data[o] = v[0]; data[o + 1] = v[1]; data[o + 2] = v[2]; data[o + 3] = 255;
    }
  }
}

export function createAtlas() {
  const pages = [];
  let buffered = true;   // 준비가 끝나면(release) 바로 쓰기로 바꾼다
  let late = 0, sealed = false;
  function packer(size) { return { size, page: null, pg: null, shelves: [], shelfY: 0, img: null, dirty: null }; }
  const big = packer(PAGE), small = packer(GPAGE);
  const sheets = new Map();
  const pending = new Map();   // 굽는 중인 시트(나눠 굽기)
  const custom = new Map();
  const unflushed = [];        // 다 구웠지만 아직 페이지에 올리지 않은 시트
  let bakedPx = 0;

  function newPage(pk) {
    flushOne(pk);
    pk.page = mkCanvas(pk.size, pk.size);
    pk.pg = pk.page.getContext('2d');
    pk.img = buffered ? pk.pg.createImageData(pk.size, pk.size) : null;
    pk.dirty = null;
    pages.push(pk.page);
    pk.shelves = [];
    pk.shelfY = 0;
  }
  /* 선반 채우기 */
  function place(pk, w, h) {
    if (w > pk.size || h > pk.size) throw new Error('sprite too big');
    if (!pk.page) newPage(pk);
    for (const s of pk.shelves) {
      if (h <= s.h && h >= s.h * 0.5 && s.x + w <= pk.size) { const x = s.x; s.x += w + 1; return { x, y: s.y }; }
    }
    if (pk.shelfY + h > pk.size) newPage(pk);
    const s = { y: pk.shelfY, h, x: w + 1 };
    pk.shelves.push(s);
    pk.shelfY += h + 1;
    return { x: 0, y: s.y };
  }
  function put(R, pk = big) {
    const { x, y } = place(pk, R.w, R.h);
    if (pk.img) {
      writeRGBA(pk.img.data, pk.size, R, x, y);
      const d = pk.dirty;
      if (!d) pk.dirty = { x0: x, y0: y, x1: x + R.w, y1: y + R.h };
      else { if (x < d.x0) d.x0 = x; if (y < d.y0) d.y0 = y; if (x + R.w > d.x1) d.x1 = x + R.w; if (y + R.h > d.y1) d.y1 = y + R.h; }
    } else {
      pk.pg.putImageData(new ImageData(toRGBA(R), R.w, R.h), x, y);
    }
    bakedPx += R.w * R.h;
    return { img: pk.page, sx: x, sy: y, w: R.w, h: R.h, ax: R.w >> 1, ay: R.h - 1 };
  }
  function flushOne(pk) {
    const d = pk.dirty;
    if (d && pk.img) {
      pk.pg.putImageData(pk.img, 0, 0, d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
      pk.dirty = null;
    }
    if (pk === big) { for (const r of unflushed) r.live = true; unflushed.length = 0; }
  }
  function flush() { flushOne(big); flushOne(small); }
  /* 준비 끝: CPU 버퍼를 버리고(메모리), 이후 굽기는 세어 둔다(게임 중 굽기 = 0이어야 한다) */
  function release() {
    flush();
    buffered = false;
    big.img = null; small.img = null;
    sealed = true;
  }

  /* 시트 하나 굽기 — 프레임·단계마다 쉬어 갈 수 있게 생성기로 */
  function* bakeSteps(name) {
    const sh = SHEETS[name];
    if (!sh) throw new Error('no sheet ' + name);
    const pal = resolvePal(sh.pal);
    const lods = sh.lod || [1];
    const detail = new Set((sh.detail || ['K', 'W']).map((c) => pal[c]).filter(Boolean));
    const outOf = (i, o) => (sh.outFrames ? sh.outFrames[i] : o !== undefined ? o : sh.out === undefined ? OUT : sh.out);
    const rec = { lods, frames: [], white: [], alts: {}, n: sh.frames.length, muzzle: sh.muzzle || null, live: false };
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
          yield;
        }
        list.push(per);
      }
      if (!vn) rec.frames = list;
      else rec.alts[vn] = list;
    }
    sheets.set(name, rec);
    pending.delete(name);
    if (big.img) unflushed.push(rec); else rec.live = true;
  }
  function bake(name) {
    let g = pending.get(name);
    if (!g) { g = bakeSteps(name); pending.set(name, g); }
    while (!g.next().done);
    flush();
    if (sealed) late++;
    return sheets.get(name);
  }
  function ditherOut(R) {
    const o = R.clone();
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if ((x + y) & 1) o.a[y * o.w + x] = null;
    return o;
  }

  function sheet(name) {
    const r = sheets.get(name);
    if (r === undefined) return bake(name);
    if (!r.live) flush();      // 쉬는 틈에 구운 시트를 처음 그릴 때 한 번 올린다(준비 전에만)
    return r;
  }
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
  /* 임의의 작은 래스터(글꼴 글자·아이콘)를 작은 페이지에 한 번 굽고 기억 */
  function rasterRec(key, make, defer = false) {
    let r = custom.get(key);
    if (!r) {
      r = put(make(), small);
      custom.set(key, r);
      if (!defer) flushOne(small);
      if (sealed) late++;
    }
    return r;
  }
  function icon(name) {
    return rasterRec('icon:' + name, () => outline(frameRaster(ICONS[name], ICON_PAL_EXPORT), OUT));
  }

  /* 쉬는 틈에 나머지 굽기: 시트 이름 또는 함수(작은 일) 목록. 한 번에 쉬는 시간만큼(4~40ms, 기본 8ms) */
  function bakeIdle(tasks, onDone) {
    const todo = tasks.filter((n) => typeof n === 'function' || !sheets.has(n));
    const idle = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 120 }) : (fn) => setTimeout(fn, 16);
    let gen = null, genName = '';
    const run = (deadline) => {
      const t0 = performance.now();
      // 브라우저가 알려 주는 쉬는 시간만큼(4~40ms) — 다음 프레임을 막지 않으면서 빨리 끝낸다
      const left = deadline && typeof deadline.timeRemaining === 'function' && !deadline.didTimeout ? deadline.timeRemaining() - 1 : 8;
      const budget = left < 4 ? 4 : left > 40 ? 40 : left;
      while ((gen || todo.length) && performance.now() - t0 < budget) {
        if (gen) {
          if (gen.next().done || sheets.has(genName)) gen = null;
          continue;
        }
        const n = todo.shift();
        if (typeof n === 'function') { n(); continue; }
        if (sheets.has(n)) continue;
        genName = n;
        gen = pending.get(n);
        if (!gen) { gen = bakeSteps(n); pending.set(n, gen); }
      }
      flushOne(small);
      if (gen || todo.length) idle(run);
      else { release(); if (onDone) onDone(); }
    };
    idle(run);
  }

  return {
    get, draw, blit, sheet, has: (n) => sheets.has(n), bake: sheet, bakeIdle, rasterRec, icon, flush, pages,
    get bakedPx() { return bakedPx; }, get lateBakes() { return late; }, get sealed() { return sealed; },
  };
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
