/* 미소녀 영웅 그림 검사 — node --test squad/tests/heroines.mjs
   (얼굴 30×30 · 2장, 뒷모습 16×20, 스킬 장) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROINE_SHEETS, FACE_FRAME, OUT as KIT_OUT } from '../assets/pix/heroines.js';
import { SHEETS, OUT, HERO_ART, SEMANTIC, ANIM } from '../assets/pix/art.js';
import { frameRaster, outline, deltaE } from '../assets/pix/raster.js';
import { HEROES } from '../assets/roster.js';

const ids = Object.keys(HEROES);

test('영웅 시트는 heroines.js 것이고 이름이 그대로다', () => {
  assert.equal(KIT_OUT, OUT);
  for (const id of ids) {
    const a = HERO_ART[id];
    assert.equal(SHEETS[a.back], HEROINE_SHEETS[a.back], `${id} 뒷모습`);
    assert.equal(SHEETS[a.portrait], HEROINE_SHEETS[a.portrait], `${id} 얼굴`);
  }
});

test('뒷모습: 16×20 격자 15장, 걷기·서기·스킬·돌아보기는 꽉 찬 20줄, 발은 가운데(5~6·9~10칸)', () => {
  for (const id of ids) {
    const sh = SHEETS[HERO_ART[id].back];
    assert.equal(sh.frames.length, 15, id);
    sh.frames.forEach((fr, i) => {
      assert.ok(fr.every((r) => r.length === 16), `${id}[${i}] 폭`);
      if (i !== 10) assert.equal(fr.length, 20, `${id}[${i}] 높이`);
      else assert.ok(fr.length <= 16, `${id} 기절은 납작하게`);
      const R = frameRaster(fr, sh.pal);
      assert.ok(!R.a.includes('#FF00FF'), `${id}[${i}] 팔레트에 없는 글자`);
      if (i !== 10) {
        const feet = fr[19];
        for (let x = 0; x < 16; x++) if (feet[x] !== '.') assert.ok((x >= 5 && x <= 6) || (x >= 9 && x <= 10), `${id}[${i}] 발 칸 ${x}`);
      }
    });
    const out = outline(frameRaster(sh.frames[0], sh.pal), OUT);
    assert.deepEqual([out.w, out.h], [18, 22], `${id} 외곽선 포함 18×22`);
    for (const a of Object.values(ANIM.hero)) for (const f of a.f) assert.ok(sh.frames[f], `${id} ANIM 프레임 ${f}`);
  }
});

test('얼굴: 30×30 격자 [미소, 외침], 외곽선 포함 32×32(어디서나 정수배)', () => {
  assert.deepEqual(FACE_FRAME, { smile: 0, shout: 1 });
  for (const id of ids) {
    const sh = SHEETS[HERO_ART[id].portrait];
    assert.equal(sh.frames.length, 2, id);
    for (const fr of sh.frames) {
      assert.equal(fr.length, 30); assert.ok(fr.every((r) => r.length === 30), `${id} 얼굴 폭`);
      const R = outline(frameRaster(fr, sh.pal), OUT);
      assert.deepEqual([R.w, R.h], [32, 32]);
      assert.ok(!R.a.includes('#FF00FF'), `${id} 얼굴 팔레트`);
    }
    assert.notDeepEqual(sh.frames[0], sh.frames[1], `${id} 외침은 미소와 다르다`);
  }
});

test('영웅 그림 어디에도 의미 빨강(나쁨)과 가까운 색이 없다', () => {
  for (const name of Object.keys(HEROINE_SHEETS)) {
    const sh = HEROINE_SHEETS[name];
    const used = new Set();
    for (const fr of sh.frames) for (const r of fr) for (const ch of r) if (sh.pal[ch]) used.add(sh.pal[ch]);
    for (const c of used) for (const r of SEMANTIC.bad) assert.ok(deltaE(c, r) >= 20, `${name}: ${c} ~ ${r}`);
  }
});

test('스킬 장(11·12)은 걷기와 다르고 둘끼리도 다르다(나비는 반동으로 1px 내려간다)', () => {
  const diff = (a, b) => { let n = 0; for (let y = 0; y < 20; y++) for (let x = 0; x < 16; x++) if (a[y][x] !== b[y][x]) n++; return n; };
  for (const id of ids) {
    const f = SHEETS[HERO_ART[id].back].frames;
    assert.ok(diff(f[0], f[11]) >= 12, `${id} 스킬 장이 걷기와 거의 같다`);
    assert.ok(diff(f[11], f[12]) >= 4, `${id} 스킬 두 장이 거의 같다`);
  }
});
