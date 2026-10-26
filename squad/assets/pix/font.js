/* 도트 숫자 글꼴 — 숫자와 + − × ÷ 같은 기호만(한글은 게임 화면 안에 그리지 않는다).
   글자마다 (채움, 외곽) 색 조합으로 한 번 구워 아틀라스에 넣고, 1px 외곽선이 겹치게 이어 쓴다.
   - 'tight'(촘촘): 외곽선 없이 글자 사이 1px만 띄운다. 먼 3칸 게이트처럼 자리가 아주 좁을 때 쓴다.
   - 'slim': 큰 글꼴 1배인데 + − × ÷ 는 굵은 기호 대신 가는 기호(1px 좁다).
   - 게임 화면에 쓰는 글자·색 조합은 닫힌 집합이라 쉬는 틈에 미리 굽는다(그리는 중에 굽지 않게). */
import { FONT, OUT } from './art.js';
import { Raster, outline } from './raster.js';

const MAP = { '−': '-', '×': 'x', '÷': '/', '→': '>' };
/* art.js 글꼴에 없는 글자(천 단위 'k') */
const EXTRA = {
  big: { k: ['##...', '##...', '##.##', '####.', '###..', '####.', '##.##'] },
  small: { k: ['#..', '#.#', '##.', '#.#', '#.#'] },
};

function glyphRows(set, ch) {
  ch = MAP[ch] || ch;
  if (set === 'small') return FONT.small[ch] || EXTRA.small[ch] || null;
  if (set === 'thick') return FONT.thick[ch] || FONT.big[ch] || EXTRA.big[ch] || null;
  return FONT.big[ch] || EXTRA.big[ch] || null;
}

/* 게임 화면에 쓰는 글자 전부(닫힌 집합) — 쉬는 틈에 미리 굽는다(게임 중 굽기 0) */
export const GLYPH_CHARS = '0123456789+-x/=MAXk';

export function createFont(atlas) {
  /* (채움 → 외곽 → 글꼴 → 글자) 기록. 문자열 키를 만들지 않아 그릴 때 쓰레기가 없다 */
  const cache = new Map();
  function slot(fill, out, key) {
    let a = cache.get(fill);
    if (!a) { a = new Map(); cache.set(fill, a); }
    let b = a.get(out);
    if (!b) { b = { big: {}, thick: {}, small: {}, tight: {} }; a.set(out, b); }
    return b[key];
  }
  /* set: 'big' | 'thick' | 'small' | 'tight'(외곽선 없는 small) */
  function glyph(set, ch, fill, out, defer = false) {
    const tight = set === 'tight';
    const rs = tight ? 'small' : set;
    // 굵은 기호가 없는 글자(숫자)는 큰 글꼴과 같은 그림이라 하나로 굽는다
    const key = set === 'thick' && !FONT.thick[MAP[ch] || ch] ? 'big' : set;
    const o = tight ? '' : out;
    const m = slot(fill, o, key);
    let g = m[ch];
    if (g !== undefined) return g;
    const rows = glyphRows(rs, ch);
    if (!rows) { m[ch] = null; return null; }
    g = atlas.rasterRec(`g:${key}:${ch}:${fill}:${o}`, () => {
      const R = new Raster(rows[0].length, rows.length);
      R.rows(0, 0, rows, { '#': fill });
      return tight ? R : outline(R, out);
    }, defer);
    m[ch] = g;
    return g;
  }
  /* (채움, 외곽) 쌍마다 글꼴의 글자를 굽는 작은 일 목록(atlas.bakeIdle에 넘긴다) */
  function prebakeTasks(pairs, chars = GLYPH_CHARS, sets = ['big', 'thick', 'small']) {
    return pairs.map(([fill, out, only]) => () => {
      for (const set of only || sets) for (const ch of chars) glyph(set, ch, fill, out, true);
    });
  }
  /* 큰 글꼴을 1배로 쓸 때는 굵은 기호를 쓴다('slim' = 큰 글꼴 1배인데 기호는 가는 것 — 좁은 칸에서 '+'를 빼기 전에) */
  const setFor = (size, scale) => (size === 'small' ? 'small' : size === 'tight' ? 'tight' : size === 'slim' ? 'big' : scale === 1 ? 'thick' : 'big');

  function measure(str, size = 'big', scale = 1) {
    const set = setFor(size, scale);
    const rs = set === 'tight' ? 'small' : set;
    let w = 0, n = 0;
    for (let i = 0; i < str.length; i++) {
      const rows = glyphRows(rs, str[i]);
      if (rows) { w += (rows[0].length + 1) * scale; n++; }
    }
    if (!n) return 0;
    return set === 'tight' ? w - 1 : w + scale;
  }
  function height(size = 'big', scale = 1) { return size === 'tight' ? 5 * scale : ((size === 'small' ? 5 : 7) + 2) * scale; }   // 'slim'은 큰 글꼴과 같다

  /* (cx, cy) 가운데에 정수 배율로 그린다. 그린 폭을 돌려준다. */
  function draw(ctx, str, cx, cy, opt) {
    const size = (opt && opt.size) || 'big';
    const scale = (opt && opt.scale) || 1;
    const fill = (opt && opt.fill) || '#FFFFFF';
    const out = (opt && opt.out) || OUT;
    const set = setFor(size, scale);
    const tight = set === 'tight';
    const w = measure(str, size, scale);
    const h = height(size, scale);
    let x = Math.round(cx - w / 2);
    const y = Math.round(cy - h / 2);
    for (let i = 0; i < str.length; i++) {
      const g = glyph(set, str[i], fill, out);
      if (!g) continue;
      if (scale === 1) ctx.drawImage(g.img, g.sx, g.sy, g.w, g.h, x, y, g.w, g.h);
      else ctx.drawImage(g.img, g.sx, g.sy, g.w, g.h, x, y, g.w * scale, g.h * scale);
      x += tight ? g.w + 1 : (g.w - 1) * scale;
    }
    return w;
  }
  return { draw, measure, height, glyph, prebakeTasks };
}

/* 게이트 칸 숫자 글자(+12, −5, ×2, ÷2) */
export function opText(c) {
  if (c.op === 'add' || c.op === 'unit') return (c.v >= 0 ? '+' : '-') + Math.abs(c.v);
  if (c.op === 'mul') return 'x' + c.v;
  return '/' + c.v;
}

/* 좁은 칸에서 차례로 시도할 짧은 꼴: 원래 글자 → '+' 뺀 것(파란 판·▲가 이미 좋다고 말한다) → 천 단위 'k' */
export function compactTexts(c, out = []) {
  out.length = 0;
  const t = opText(c);
  out.push(t);
  const add = c.op === 'add' || c.op === 'unit';
  if (add && c.v >= 0) out.push(t.slice(1));
  const a = Math.abs(c.v);
  if (add && a >= 1000) {
    const k = Math.floor(a / 1000) + 'k';
    if (c.v < 0) out.push('-' + k);
    else { out.push('+' + k); out.push(k); }
  }
  return out;
}
