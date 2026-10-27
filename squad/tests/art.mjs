/* 도트 그림 데이터 검사 — node --test squad/tests/art.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEETS, PAL, BIOME, BIOME_GROUND_KEYS, SEMANTIC, ANIM, UNIT_ART, CAPTIVE_ART, HERO_ART, ICONS, ICON_PAL_EXPORT, FONT, OUT, WORLD_H, BOSS_POSE_NAMES } from '../assets/pix/art.js';
import { frameRaster, outline, downscale, deltaE, Raster } from '../assets/pix/raster.js';
import { pickStep } from '../assets/pix/atlas.js';
import { UNITS, HEROES, BIOMES, biomeOf } from '../assets/roster.js';

const palOf = (p) => (typeof p === 'string' ? PAL[p] : p);
const MAGENTA = '#FF00FF';

function checkRows(name, rows, pal) {
  assert.ok(Array.isArray(rows) && rows.length > 0, `${name}: 빈 격자`);
  const w = rows[0].length;
  rows.forEach((r, j) => {
    assert.equal(r.length, w, `${name}: ${j}번째 줄 폭 ${r.length} ≠ ${w}`);
    if (pal) for (const ch of r) if (ch !== '.' && ch !== ' ' && ch !== '_') assert.ok(pal[ch], `${name}: 팔레트에 없는 글자 '${ch}'`);
  });
}
function sheetPalettes(sh) {
  const out = [palOf(sh.pal)];
  for (const a of Object.values(sh.alts || {})) {
    if (typeof a === 'string') out.push(PAL[a]);
    else if (a.pal && !a.K) out.push(palOf(a.pal));
    else out.push(a);
  }
  return out;
}

test('모든 시트: 격자 줄 폭이 같고, 쓰인 글자는 팔레트에 있다', () => {
  for (const [name, sh] of Object.entries(SHEETS)) {
    assert.ok(sh.frames.length > 0, name);
    for (const pal of sheetPalettes(sh)) {
      assert.ok(pal, `${name}: 팔레트 없음`);
      sh.frames.forEach((fr, i) => { if (Array.isArray(fr)) checkRows(`${name}[${i}]`, fr, pal); });
    }
  }
});

test('모든 프레임이 굽힌다(알 수 없는 색·명령 없음)', () => {
  for (const [name, sh] of Object.entries(SHEETS)) {
    for (const pal of sheetPalettes(sh)) {
      sh.frames.forEach((fr, i) => {
        const R = frameRaster(fr, pal);
        assert.ok(R.count() > 0, `${name}[${i}] 빈 그림`);
        assert.ok(!R.a.includes(MAGENTA), `${name}[${i}] 팔레트에 없는 색`);
        for (const k of sh.lod || [1]) {
          const D = downscale(R, k);
          assert.ok(D.count() > 0, `${name}[${i}] ×${k} 줄이면 사라짐`);
        }
      });
    }
  }
});

test('아이콘·글꼴 격자', () => {
  for (const [k, rows] of Object.entries(ICONS)) {
    checkRows('icon ' + k, rows, ICON_PAL_EXPORT);
    assert.ok(rows.length <= 9 && rows[0].length <= 10, `icon ${k} 크기`);
  }
  for (const set of ['big', 'small', 'thick']) for (const [ch, rows] of Object.entries(FONT[set])) checkRows(`font ${set} '${ch}'`, rows, { '#': '#fff' });
  for (const ch of '0123456789+-x/') { assert.ok(FONT.big[ch], 'big ' + ch); assert.ok(FONT.small[ch], 'small ' + ch); }
  for (const ch of Object.keys(FONT.big)) assert.equal(FONT.big[ch].length, 7, 'big 높이 7');
  for (const ch of Object.keys(FONT.small)) assert.equal(FONT.small[ch].length, 5, 'small 높이 5');
  for (const need of ['medic', 'sniper', 'rocket', 'gun', 'men', 'coin', 'star', 'skull']) assert.ok(ICONS[need], '아이콘 ' + need);
});

test('애니메이션 표의 프레임이 모두 있다', () => {
  const sheetsFor = (key) => {
    if (key === 'hero') return Object.values(HERO_ART).map((h) => h.back);
    if (key === 'captive') return Object.values(CAPTIVE_ART);
    return [key];
  };
  for (const [key, anims] of Object.entries(ANIM)) {
    for (const sname of sheetsFor(key)) {
      const sh = SHEETS[sname];
      assert.ok(sh, `ANIM ${key}: 시트 ${sname} 없음`);
      for (const [an, a] of Object.entries(anims)) for (const f of a.f) assert.ok(f >= 0 && f < sh.frames.length, `${sname}.${an}: 프레임 ${f} 없음(${sh.frames.length}장)`);
    }
  }
  assert.equal(SHEETS.boss.frames.length, BOSS_POSE_NAMES.length);
});

test('모든 병과·영웅에 그림이 있다', () => {
  for (const k of Object.keys(UNITS)) {
    assert.ok(SHEETS[UNIT_ART[k]], '병과 ' + k);
    assert.ok(SHEETS[CAPTIVE_ART[k]], '포로 ' + k);
    assert.ok(ICONS[k], '아이콘 ' + k);
  }
  for (const id of Object.keys(HEROES)) {
    const a = HERO_ART[id];
    assert.ok(a && SHEETS[a.back] && SHEETS[a.portrait], '영웅 ' + id);
    const face = SHEETS[a.portrait].frames[0];
    assert.equal(face.length, 19, `${id} 얼굴 높이 19`);
    assert.equal(face[0].length, 20, `${id} 얼굴 폭 20`);
    assert.ok(SHEETS[a.back].frames.length >= 15, `${id} 뒷모습 프레임`);
  }
  for (const b of BIOMES) assert.ok(BIOME[b.id], '지역 ' + b.id);
  assert.equal(biomeOf(1).id, 'desert');
  assert.equal(biomeOf(11).id, 'snow');
  assert.equal(biomeOf(21).id, 'desert');
});

test('크기 규칙: 특수병은 병사 격자 위의 종이인형(13px 이하), 영웅 몸통 16×18 안팎, 뒷줄 철모 5×4', () => {
  const sol = SHEETS.soldier.frames[0];
  for (const k of Object.values(UNIT_ART)) {
    for (const fr of SHEETS[k].frames) {
      assert.ok(fr[0].length <= 13, `${k} 폭 ${fr[0].length}`);
      assert.ok(fr.length <= sol.length + 1, `${k} 높이 ${fr.length}`);
    }
  }
  for (const a of Object.values(HERO_ART)) {
    for (const fr of SHEETS[a.back].frames) {
      const R = frameRaster(fr, palOf(SHEETS[a.back].pal));
      assert.ok(R.w <= 17 && R.h <= 20, `${a.back} ${R.w}×${R.h}`);
    }
  }
  assert.deepEqual([SHEETS.helmet.frames[0][0].length, SHEETS.helmet.frames[0].length], [5, 4]);
  const boss = frameRaster(SHEETS.boss.frames[0], palOf(SHEETS.boss.pal));
  assert.ok(boss.h >= 95 && boss.h <= 110, '보스는 약 100px로 직접 그린다');
  for (const k of Object.keys(WORLD_H)) assert.ok(SHEETS[k] || k === 'captive', 'WORLD_H ' + k);
});

test('땅·연석 색은 파랑(좋음)·빨강(나쁨)과 ΔE 20 이상 떨어진다', () => {
  for (const [id, b] of Object.entries(BIOME)) {
    for (const key of BIOME_GROUND_KEYS) {
      for (const sem of [...SEMANTIC.good, ...SEMANTIC.bad]) {
        const d = deltaE(b[key], sem);
        assert.ok(d >= 20, `${id}.${key} ${b[key]} 이 ${sem} 와 너무 가깝다(ΔE ${d.toFixed(1)})`);
      }
    }
  }
});

test('의무병·보리에 빨간 색이 없다(빨간 십자 금지 — 분홍 하트)', () => {
  const reds = SEMANTIC.bad;
  for (const name of ['medic', 'captive_medic', 'hero_bori', 'face_bori']) {
    const pal = palOf(SHEETS[name].pal);
    const used = new Set();
    for (const fr of SHEETS[name].frames) for (const r of fr) for (const ch of r) if (pal[ch]) used.add(pal[ch]);
    for (const c of used) for (const r of reds) assert.ok(deltaE(c, r) >= 20, `${name}: ${c} 가 빨강 ${r} 와 가깝다`);
  }
  // 하트 모양 확인: 철모 위 3×3 하트(q.q / qqq / .q.)
  const head = SHEETS.medic.frames[0].map((r) => r.replace(/[^X]/g, '.'));
  assert.ok(head.some((r) => r.includes('X.X')) && head.some((r) => r.includes('XXX')), '의무병 하트');
});

test('외곽선·줄이기: 발끝 기준 크기, 외곽선은 1px씩', () => {
  const R = new Raster(12, 12);
  R.rect(2, 2, 8, 10, '#FFFFFF');
  const o = outline(R, OUT);
  assert.equal(o.w, 14); assert.equal(o.h, 14);
  assert.equal(o.get(0, 0), null);
  assert.equal(o.get(2, 2), null);   // 4방향 외곽선이라 모서리는 비어 둥글다
  assert.equal(o.get(2, 5), OUT);
  for (const k of [0.75, 0.5, 0.33]) {
    const d = downscale(R, k);
    assert.equal(d.w, Math.max(1, Math.round(12 * k)));
    assert.equal(d.h, Math.max(1, Math.round(12 * k)));
    // 발(맨 아래 줄)이 남아 있다
    assert.ok(d.a.slice((d.h - 1) * d.w).some(Boolean), `×${k} 아래 줄`);
  }
});

test('축소 단계 고르기: 로그 거리 + ±10% 머뭇거림', () => {
  const S = [1, 0.75, 0.5];
  assert.equal(pickStep(1.3, undefined, S), 0);
  assert.equal(pickStep(0.74, undefined, S), 1);
  assert.equal(pickStep(0.3, undefined, S), 2);
  const edge = Math.sqrt(0.75 * 0.5);
  // 경계 바로 아래로 내려가도 이전 단계(0.75)를 지킨다
  assert.equal(pickStep(edge * 0.97, 1, S), 1);
  assert.equal(pickStep(edge * 0.88, 1, S), 2);
  // 거꾸로 올라갈 때도 마찬가지
  assert.equal(pickStep(edge * 1.05, 2, S), 2);
  assert.equal(pickStep(edge * 1.15, 2, S), 1);
  // 두 단계 이상 차이는 바로 바꾼다
  assert.equal(pickStep(1.2, 2, S), 0);
});

/* ---------------- 렌더러 순수 규칙(T12) ---------------- */
import { pickBuffer, lensOpt, createFlashLimiter, sceneryHash, sceneryX, sceneryZ, SCENERY_STEP, FRAMES, GLYPH_PAIRS } from '../assets/render.js';
import { createFont, compactTexts, opText, GLYPH_CHARS } from '../assets/pix/font.js';
import { makeView, fitView, project, P } from '../assets/view.js';
import { ROAD, radius } from '../assets/core.js';

test('길가 소품은 도로·연석 밖에만(|x| ≥ 도로 반폭 + 0.9, V1)', () => {
  let n = 0;
  for (let z = -10 * SCENERY_STEP; z < 30000; z += SCENERY_STEP) {
    for (const side of [-1, 1]) {
      const h = sceneryHash(z, side);
      const x = sceneryX(h, side);
      assert.ok(Math.abs(x) >= ROAD + 0.9, `z=${z} side=${side}: x=${x.toFixed(2)} 이 도로 위`);
      assert.equal(Math.sign(x), side);
      const zz = sceneryZ(h, z);
      assert.ok(zz >= z && zz < z + 5, `z=${z}: zz=${zz}`);
      n++;
    }
  }
  assert.ok(n > 6000);
});

test('버퍼 크기 규칙: 기둥 160~220px, 화면을 덮고, CSS 크기는 정수 px(소수 DPR 이음새 없음, T2)', () => {
  const phones = [[360, 640, 2], [360, 640, 3], [375, 667, 2], [390, 844, 2], [390, 844, 3], [412, 915, 2.625], [412, 915, 3.5], [428, 926, 3],
    [384, 854, 2.8125], [320, 568, 2], [393, 873, 2.75], [414, 896, 2], [390, 1000, 3], [360, 780, 3], [412, 892, 2.625]];
  const others = [[768, 1024, 2], [844, 390, 3], [1280, 720, 1], [1920, 1080, 1], [1024, 1366, 2]];
  for (const [w, h, dpr] of [...phones, ...others]) {
    const b = pickBuffer(w, h, dpr);
    const tag = `${w}x${h}@${dpr}`;
    assert.ok(Number.isInteger(b.K) && b.K >= 1 && b.K <= 12, tag);
    assert.ok(b.BW * b.K >= Math.round(w * dpr) && b.BH * b.K >= Math.round(h * dpr), `${tag}: 화면을 덮지 못함`);
    assert.ok(Math.abs(b.BW * b.cssPer - b.cssW) < 1e-3 && Math.abs(b.BH * b.cssPer - b.cssH) < 1e-3, `${tag}: CSS 크기 ${b.BW * b.cssPer}×${b.BH * b.cssPer}가 정수가 아님`);
    assert.ok(b.BW - b.VW < 16 && b.BH - b.VH < 16, `${tag}: 넘치는 폭 ${b.BW - b.VW}`);
    assert.ok(b.cssW >= w && b.cssH >= h, tag);
  }
  for (const [w, h, dpr] of phones) {
    const b = pickBuffer(w, h, dpr);
    const colBuf = Math.ceil((b.col * dpr) / b.K);
    assert.ok(colBuf >= 160 && colBuf <= 220, `${w}x${h}@${dpr}: 기둥 ${colBuf}px`);
  }
  // 알려진 값
  assert.deepEqual([pickBuffer(390, 844, 3).BW, pickBuffer(390, 844, 3).BH, pickBuffer(390, 844, 3).K], [195, 422, 6]);
  assert.deepEqual([pickBuffer(412, 915, 2.625).BW, pickBuffer(412, 915, 2.625).BH, pickBuffer(412, 915, 2.625).cssW], [182, 406, 416]);
});

test('보스전 렌즈: 분대 ≤ 65.5%, 영웅 발 ≤ 72%(360x640·390x844), 달리기 때는 62.5% 그대로(T4)', () => {
  for (const [w, h] of [[180, 320], [195, 422], [182, 400]]) {
    for (const dolly of [0, 1]) {
      const v = makeView();
      fitView(v, w, h, ROAD, dolly, lensOpt(w, h, dolly));
      v.camZ = -v.back;
      for (const n of [12, 60, 300, 1000, 3000, 9999]) {
        const R = radius(n);
        assert.ok(project(v, 0, 0, 0));
        const sqY = P.y / h;
        project(v, 0, 0, -R - 0.7);
        const heroY = P.y / h;
        if (dolly === 0) assert.ok(Math.abs(sqY - 0.625) < 0.005, `${w}x${h} 달리기 분대 ${sqY}`);
        else {
          assert.ok(sqY <= 0.655, `${w}x${h} 보스전 분대 ${(sqY * 100).toFixed(1)}%`);
          assert.ok(heroY <= 0.72, `${w}x${h} 보스전 영웅 발 ${(heroY * 100).toFixed(1)}% (N=${n})`);
        }
      }
      // 보스(높이 6.6u)의 머리는 화면 안(위쪽 HUD 아래)
      if (dolly === 1) { project(v, 0, 6.6, radius(300) + 4); assert.ok(P.y > h * 0.12, `${w}x${h} 보스 머리 ${P.y}`); }
    }
  }
});

test('피격 번쩍임 제한: 초당 10번 맞아도 좀비 ≤ 3회/초, 보스 ≤ 2회/초, 움직임 줄이기면 0(R2·V9·T10)', () => {
  for (const hz of [60, 120, 144]) {
    for (const [gap, maxPerSec] of [[0.34, 3], [0.5, 2]]) {
      for (const reduce of [false, true]) {
        const L = createFlashLimiter(gap, 0.034);
        let onsets = 0, prev = false, hitT = -9;
        const secs = 6;
        for (let f = 0; f < hz * secs; f++) {
          const t = f / hz;
          if (Math.floor(t * 10) !== Math.floor((t - 1 / hz) * 10)) hitT = t;   // 10 Hz 일제 사격
          const on = L.on(7, hitT, t, t, reduce);
          if (on && !prev) onsets++;
          prev = on;
        }
        if (reduce) assert.equal(onsets, 0, `reduce hz=${hz}`);
        else {
          assert.ok(onsets / secs <= maxPerSec + 1e-9, `gap ${gap} @${hz}Hz: ${onsets / secs}/s`);
          assert.ok(onsets / secs >= maxPerSec * 0.8, `gap ${gap} @${hz}Hz: 번쩍임이 너무 적다 ${onsets / secs}/s`);
        }
      }
    }
  }
});

test('렌더러가 쓰는 프레임 번호는 모두 시트 안에 있다(T12)', () => {
  const resolve = (s) => (s === 'unit' ? Object.values(UNIT_ART) : s === 'hero' ? Object.values(HERO_ART).map((h) => h.back) : s === 'captive' ? Object.values(CAPTIVE_ART) : s);
  for (const [g, def] of Object.entries(FRAMES)) {
    for (const name of resolve(def.sheets)) {
      const sh = SHEETS[name];
      assert.ok(sh, `FRAMES.${g}: 시트 ${name} 없음`);
      for (const [k, list] of Object.entries(def)) {
        if (k === 'sheets') continue;
        for (const f of list) assert.ok(Number.isInteger(f) && f >= 0 && f < sh.frames.length, `FRAMES.${g}.${k}: ${name}에 프레임 ${f} 없음(${sh.frames.length}장)`);
      }
    }
  }
  // 초상화·소품은 0번
  for (const h of Object.values(HERO_ART)) assert.ok(SHEETS[h.portrait].frames.length >= 1);
});

test('보스 4단계 축소: 멀어졌다 가까워져도 경계에서 깜빡이지 않는다', () => {
  const S = [1, 0.75, 0.5, 0.33];
  let st, changes = 0;
  for (let i = 0; i <= 400; i++) {
    const want = 1.2 * Math.pow(0.25 / 1.2, i / 400) * (1 + 0.04 * Math.sin(i * 1.7));   // 잔떨림 ±4%
    const nst = pickStep(want, st, S);
    if (st !== undefined && nst !== st) { changes++; assert.equal(nst, st + 1, '한 칸씩 내려간다'); }
    st = nst;
  }
  assert.equal(changes, 3);
  assert.equal(st, 3);
});

test('게이트 글자: 짧은 꼴 후보와 미리 굽는 글자(그리는 중에 아틀라스에 굽지 않게, T1·V3)', () => {
  assert.deepEqual(compactTexts({ op: 'add', v: 710 }), ['+710', '710']);
  assert.deepEqual(compactTexts({ op: 'add', v: -100 }), ['-100']);
  assert.deepEqual(compactTexts({ op: 'add', v: 1240 }), ['+1240', '1240', '+1k', '1k']);
  assert.deepEqual(compactTexts({ op: 'add', v: -2500 }), ['-2500', '-2k']);
  assert.deepEqual(compactTexts({ op: 'mul', v: 2 }), ['x2']);
  // 가짜 아틀라스로: 닫힌 집합을 다 구운 뒤 게임에서 쓰는 글자를 그려도 새로 굽지 않는다
  const keys = new Set();
  let late = false, area = 0;
  const fake = { rasterRec(key, make) { if (!keys.has(key)) { if (late) throw new Error('late bake ' + key); keys.add(key); const R = make(); area += R.w * R.h; } return { img: null, sx: 0, sy: 0, w: 5, h: 7 }; } };
  const font = createFont(fake);
  for (const t of font.prebakeTasks(GLYPH_PAIRS)) t();
  late = true;
  const ctx = { drawImage() {} };
  const strs = [];
  for (const op of ['add', 'mul', 'div', 'unit']) for (const v of [-9999, -1240, -100, -15, -5, 0, 1, 2, 3, 5, 9, 10, 35, 100, 270, 710, 999, 1000, 1240, 9999]) strs.push(...compactTexts({ op, v }));
  strs.push('MAX', '=1234', '+0');
  for (const str of strs) for (const [fill, out, only] of GLYPH_PAIRS) for (const size of only || ['big', 'slim', 'small']) for (const scale of size === 'big' ? [1, 2] : [1]) font.draw(ctx, str, 10, 10, { size, scale, fill, out: out || undefined });
  for (const ch of strs.join('')) assert.ok(GLYPH_CHARS.includes(ch), `'${ch}' 가 미리 굽는 글자에 없다`);
  // 작은 페이지(256×256) 하나에 넉넉히 들어간다
  assert.ok(area < 256 * 256 * 0.7, `글자 면적 ${area}`);
  void opText;
});
