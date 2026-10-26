/* 도트 숫자 글꼴 — 숫자와 + − × ÷ 같은 기호만(한글은 게임 화면 안에 그리지 않는다).
   글자마다 (채움, 외곽) 색 조합으로 한 번 구워 아틀라스에 넣고, 1px 외곽선이 겹치게 이어 쓴다. */
import { FONT, OUT } from './art.js';
import { Raster, outline } from './raster.js';

const MAP = { '−': '-', '×': 'x', '÷': '/', '→': '>' };

function glyphRows(set, ch) {
  ch = MAP[ch] || ch;
  if (set === 'small') return FONT.small[ch] || null;
  if (set === 'thick') return FONT.thick[ch] || FONT.big[ch] || null;
  return FONT.big[ch] || null;
}

export function createFont(atlas) {
  function glyph(set, ch, fill, out) {
    const rows = glyphRows(set, ch);
    if (!rows) return null;
    return atlas.rasterRec(`g:${set}:${ch}:${fill}:${out}`, () => {
      const R = new Raster(rows[0].length, rows.length);
      R.rows(0, 0, rows, { '#': fill });
      return outline(R, out);
    });
  }
  /* 큰 글꼴을 1배로 쓸 때는 굵은 기호를 쓴다 */
  const setFor = (size, scale) => (size === 'small' ? 'small' : scale === 1 ? 'thick' : 'big');

  function measure(str, size = 'big', scale = 1) {
    const set = setFor(size, scale);
    let w = 0;
    for (const ch of str) {
      const rows = glyphRows(set, ch);
      if (rows) w += (rows[0].length + 1) * scale;
    }
    return w ? w + scale : 0;
  }
  function height(size = 'big', scale = 1) { return ((size === 'small' ? 5 : 7) + 2) * scale; }

  /* (cx, cy) 가운데에 정수 배율로 그린다. 그린 폭을 돌려준다. */
  function draw(ctx, str, cx, cy, opt = {}) {
    const size = opt.size || 'big';
    const scale = opt.scale || 1;
    const fill = opt.fill || '#FFFFFF';
    const out = opt.out || OUT;
    const set = setFor(size, scale);
    const w = measure(str, size, scale);
    const h = height(size, scale);
    let x = Math.round(cx - w / 2);
    const y = Math.round(cy - h / 2);
    for (const ch of str) {
      const g = glyph(set, ch, fill, out);
      if (!g) continue;
      if (scale === 1) ctx.drawImage(g.img, g.sx, g.sy, g.w, g.h, x, y, g.w, g.h);
      else ctx.drawImage(g.img, g.sx, g.sy, g.w, g.h, x, y, g.w * scale, g.h * scale);
      x += (g.w - 1) * scale;
    }
    return w;
  }
  return { draw, measure, height, glyph };
}

/* 게이트 칸 숫자 글자(+12, −5, ×2, ÷2) */
export function opText(c) {
  if (c.op === 'add' || c.op === 'unit') return (c.v >= 0 ? '+' : '-') + Math.abs(c.v);
  if (c.op === 'mul') return 'x' + c.v;
  return '/' + c.v;
}
