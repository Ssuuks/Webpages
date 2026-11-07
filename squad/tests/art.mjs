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
    assert.equal(face.length, 30, `${id} 얼굴 높이 30`);
    assert.equal(face[0].length, 30, `${id} 얼굴 폭 30`);
    assert.ok(SHEETS[a.portrait].frames.length >= 2, `${id} 얼굴 [미소, 외침]`);
    assert.ok(SHEETS[a.back].frames.length >= 15, `${id} 뒷모습 프레임`);
  }
  for (const b of BIOMES) assert.ok(BIOME[b.id], '지역 ' + b.id);
  assert.equal(biomeOf(1).id, 'desert');
  assert.equal(biomeOf(11).id, 'snow');
  assert.equal(biomeOf(21).id, 'city');
  assert.equal(biomeOf(31).id, 'forest');
  assert.equal(biomeOf(41).id, 'lava');
  assert.equal(biomeOf(51).id, 'park');
  assert.equal(biomeOf(61).id, 'desert');
});

test('크기 규칙: 특수병은 병사 격자 위의 종이인형(13px 이하), 영웅 몸통 16×18 안팎', () => {
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

test('렌즈: 달리기 분대 70%(앞을 멀리 보게), 보스전 분대 ≤ 70.5%·영웅 발 ≤ 78%(아래 버튼에 가리지 않게, T4)', () => {
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
        if (dolly === 0) {
          assert.ok(Math.abs(sqY - 0.70) < 0.005, `${w}x${h} 달리기 분대 ${sqY}`);
          assert.ok(heroY <= 0.78, `${w}x${h} 달리기 영웅 발 ${(heroY * 100).toFixed(1)}% (N=${n})`);
        } else {
          assert.ok(sqY <= 0.705, `${w}x${h} 보스전 분대 ${(sqY * 100).toFixed(1)}%`);
          assert.ok(heroY <= 0.78, `${w}x${h} 보스전 영웅 발 ${(heroY * 100).toFixed(1)}% (N=${n})`);
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

/* F1(3단계): 내려찍기 빨간 띠는 실제로 맞는 범위 — 렌더러는 core.slamZone(칸 ± SLAM_EDGE·분대 반지름)으로 그리고, core.slamHits도 같은 범위를 쓴다 */
test('내려찍기 빨간 띠 = 맞는 범위: 렌더러는 slamZone으로 그리고 slamHits와 같은 가장자리를 쓴다(F1)', async () => {
  const fs = await import('node:fs');
  const C = await import('../assets/core.js');
  const src = fs.readFileSync(new URL('../assets/render.js', import.meta.url), 'utf8');
  assert.match(src, /const zn = slamZone\(b\.slam, radius\(q\.n\)\)/, '렌더러가 slamZone으로 범위를 구한다');
  assert.match(src, /groundQuad\(zn\.x0, zn\.x1,/, '빨간 띠를 그 범위로 그린다');
  assert.doesNotMatch(src, /groundQuad\(b\.slam\.x0 \+ 0\.1, b\.slam\.x1 - 0\.1/, '예전처럼 칸보다 좁게 그리지 않는다');
  for (const n of [3, 40, 400]) {
    const R = C.radius(n);
    const sl = { x0: 0, x1: 5 };
    const z = C.slamZone(sl, R);
    assert.ok(C.slamHits(z.x0, R, sl) && !C.slamHits(z.x0 - 0.01, R, sl), `n${n}: 띠 왼쪽 끝이 맞는 범위의 끝`);
  }
});

/* ---------------- 충돌 크기(SIM 8): 그린 크기 = 맞는 크기 ----------------
   원칙: 위협이 맞히는 범위는 그린 것과 같거나 조금 작다(그린 크기의 80~100%, 더 크지 않게) — 화면에서 아슬아슬하게 비켜 갔으면 안 맞은 것.
   폰 두 화면(360×640@2, 390×844@3)과 데스크톱(1280×720@1), 달리기·보스전 렌즈 모두에서 그림 자료(SHEETS)와 카메라로 잰다. */
import { formationPlan, formArrange, formGeom, composeSquad, greedyComp, nextComp, compSum, compCount, compWidth, needFor, muzzleOn, TIER, FORM_LIM, TANK_GAP, slotPos, heroZ, FORM_IN } from '../assets/render.js';
import * as Core from '../assets/core.js';
const HB_VIEWS = [['360x640', 360, 640, 2], ['390x844', 390, 844, 3], ['1280x720', 1280, 720, 1]];
function hbView(w, h, dpr, dolly) {
  const b = pickBuffer(w, h, dpr);
  const v = makeView();
  fitView(v, b.VW, b.VH, ROAD, dolly, lensOpt(b.VW, b.VH, dolly));
  v.camZ = -v.back; v.camX = 0;
  return v;
}
/* 그림(외곽선 포함)의 닻(가운데·발) 기준 왼쪽·오른쪽 끝(px)과 높이 */
const sprBox = new Map();
function spriteBox(name, frame = 0) {
  const key = name + ':' + frame;
  if (sprBox.has(key)) return sprBox.get(key);
  const sh = SHEETS[name];
  const R = outline(frameRaster(sh.frames[frame], palOf(sh.pal)), OUT);
  const ax = R.w >> 1;
  let l = 1e9, r = -1e9;
  for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) if (R.get(x, y)) { l = Math.min(l, x); r = Math.max(r, x); }
  const o = { L: ax - l, R: r + 1 - ax, H: R.h };
  sprBox.set(key, o);
  return o;
}
const HB_NS = [1, 2, 3, 5, 9, 12, 30, 60, 100, 130, 205, 300, 1000, 2864, 9999];
/* 그 화면의 분대 자리 배율 — 렌더러(updateFormation)와 같은 방법: 옆 m당 px, 분대 가운데에서 앞(먼 쪽)·뒤 끝(±D)까지 깊이 1m의 화면 높이 */
function hbScale(v, R) {
  const D = Math.max(0.05, Core.SQUAD_DEPTH * R - FORM_IN);
  project(v, 0, 0, 0);
  const ppm = P.s, y0 = P.y;
  project(v, 0, 0, D);
  const vf = (y0 - P.y) / D;
  project(v, 0, 0, -D);
  return [ppm, vf, (P.y - y0) / D, P.s];
}
const deepEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const geomOf = (v, n) => { const R = Core.radius(n); return formGeom(R, ...hbScale(v, R)); };
const planOf = (v, n) => { const R = Core.radius(n); return formationPlan(n, R, ...hbScale(v, R)); };
/* 계획의 그림 상자(px): 단계마다 TIER 크기(아래 TIER = spriteBox 검사로 시트와 같다) */
function planBoxes(v, plan) {
  return plan.units.map((u) => {
    project(v, u.x, 0, u.z);
    const T = TIER[u.t], px = Math.round(P.x), py = Math.round(P.y);
    return [px - T.halfL, px + T.halfR, py - T.h, py];
  });
}
/* 그림마다 다른 그림에 가린 몫(픽셀, plan.units 차례로): 렌더러처럼 먼 줄부터, 같은 줄은 바깥부터 그린다(가운데가 위) */
const tierMask = [];
function coverOf(v, plan) {
  const R = plan.g.R, bias = 0.03 / Math.max(0.5, R);
  const us = plan.units.map((u, i) => ({ u, i, key: u.z + Math.abs(u.x) * bias })).sort((a, b) => b.key - a.key);
  project(v, 0, 0, 0);
  const cx = Math.round(P.x), cy = Math.round(P.y), G = 240, own = new Int16Array(G * G).fill(-1), tot = [];
  us.forEach(({ u }, k) => {
    if (!tierMask[u.t]) { const sh = SHEETS[TIER[u.t].sheet]; tierMask[u.t] = outline(frameRaster(sh.frames[0], palOf(sh.pal)), OUT); }
    const m = tierMask[u.t];
    project(v, u.x, 0, u.z);
    const x0 = Math.round(P.x) - cx - (m.w >> 1) + G / 2, y0 = Math.round(P.y) - cy - (m.h - 1) + G / 2;
    let c = 0;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y)) { own[(y0 + y) * G + x0 + x] = k; c++; }
    tot.push(c);
  });
  const vis = new Array(us.length).fill(0), out = new Array(us.length);
  for (const o of own) if (o >= 0) vis[o]++;
  us.forEach(({ i }, k) => { out[i] = 1 - vis[k] / tot[k]; });
  return out;
}

test('합친 병사 단계: TIER 크기 = 시트 그림 크기(외곽선 포함, 닻 아래 가운데·좌우 반폭 같음), 발은 맨 아래 줄, 프레임·변형·총구', () => {
  assert.equal(TIER[0].sheet, 'soldier');
  assert.deepEqual(TIER.map((x) => x.worth), [1, 10, 100, 1000]);
  assert.deepEqual(TIER.map((x) => [x.sheet, x.w, x.h]), [['soldier', 14, 14], ['sq10', 18, 18], ['sq100', 22, 22], ['sq1000', 30, 22]]);
  for (const T of TIER) {
    assert.equal(T.halfL + T.halfR, T.w, T.sheet);
    const sh = SHEETS[T.sheet];
    assert.ok(sh, T.sheet);
    assert.equal(sh.frames.length, 6, `${T.sheet}: 걷기 0~3 + 서기 4~5`);
    assert.ok(ANIM[T.sheet] && ANIM[T.sheet].walk.fps === T.fps && ANIM[T.sheet].idle.fps === T.idleFps, `${T.sheet}: TIER 걸음 빠르기 = ANIM`);
    assert.ok(sh.alts && sh.alts.hurt, `${T.sheet}: 'hurt' 변형`);
    assert.ok(Array.isArray(sh.muzzle) && Array.isArray(sh.muzzles) && sh.muzzles.length === sh.frames.length, `${T.sheet}: 총구 자리(프레임마다)`);
    for (const [vi, pal] of sheetPalettes(sh).entries()) {
      sh.frames.forEach((fr, f) => {
        const R = outline(frameRaster(fr, pal), OUT);
        assert.deepEqual([R.w, R.h], [T.w, T.h], `${T.sheet}[${f}] 크기`);
        if (vi === 0) {
          const b = spriteBox(T.sheet, f);
          assert.deepEqual([b.L, b.R, b.H], [T.halfL, T.halfR, T.h], `${T.sheet}[${f}] 그림 상자 ${JSON.stringify(b)} ≠ TIER`);
          assert.ok(fr[fr.length - 1].replace(/\./g, '').length > 0, `${T.sheet}[${f}] 발이 맨 아래 줄`);
          // 총구 = 총 끝 칸(그 위는 비었다 — 불꽃이 외곽선 위에 뜬다)
          const [mx, my] = sh.muzzles[f];
          assert.ok(fr[my][mx] !== '.', `${T.sheet}[${f}] 총구 ${mx},${my} 빈칸`);
          assert.ok(my === 0 || fr[my - 1][mx] === '.', `${T.sheet}[${f}] 총구 위가 비어야`);
        }
      });
    }
    assert.deepEqual(sh.muzzles[1], sh.muzzle, `${T.sheet}: muzzle = 1번 프레임`);
  }
});

/* 구성 검사 하나: 정수, 0장 없음, 합 ≤ n, 10 미만은 병사, 줄마다 두 장(맨 앞줄만 한 장), 어림은 자릿수 그대로가 아주 빽빽할 때만 */
function checkComp(c, n, g, id) {
  assert.ok(c.length === 4 && c.every((k) => Number.isInteger(k) && k >= 0), id);
  if (n >= 1) assert.ok(compCount(c) >= 1, `${id}: 그림 0장`);
  assert.ok(compSum(c) <= n, `${id}: 합이 n보다 크다`);
  if (n < 10) assert.deepEqual(c, [n, 0, 0, 0], id);
  const cap = g.m0 * g.W, gw = compWidth(greedyComp(n));
  const over = n >= 100 && gw > FORM_LIM.hard * cap;
  if (!over) assert.equal(compSum(c), n, `${id}: 자릿수 그대로가 들어가는데(${(gw / cap).toFixed(2)}) 합이 다르다`);
  if (compSum(c) !== n) {
    assert.ok(compWidth(c) <= FORM_LIM.over * cap + 1e-6, `${id}: 어림인데 빽빽하다`);
    assert.ok(compSum(c) >= 0.5 * n, `${id}: 어림 ${compSum(c)}`);
  }
  if (n >= 4) assert.ok(compCount(c) >= needFor(g.m0), `${id}: ${compCount(c)}장으로는 ${g.m0}줄 양옆을 못 덮는다`);
  return over;
}

test('합친 병사 구성: 자릿수 그대로 → 채우기(큰 단계부터 열 장으로) → 아주 빽빽하면 어림. 205명 = 100 + 10×10 + 5', () => {
  const ns = [];
  for (let n = 1; n <= 3000; n += n < 400 ? 1 : 7) ns.push(n);
  ns.push(9, 10, 11, 99, 100, 101, 999, 1000, 1001, 2864, 6848, 9998, 9999);
  for (const [tag, w, h, dpr] of HB_VIEWS) {
    for (const dolly of [0, 1]) {
      const v = hbView(w, h, dpr, dolly);
      for (const n of ns) {
        const g = geomOf(v, n), c = composeSquad(n, g);
        const id = `${tag} ${dolly ? '보스전' : '달리기'} n=${n} [${c}]`;
        const over = checkComp(c, n, g, id);
        if (over || n < 10) continue;
        const cap = g.m0 * g.W, wd = compWidth(c), g0 = greedyComp(n);
        // 너무 빽빽하면: 자릿수 그대로가 이미 그렇거나, 장 수가 모자라 쪼갤 수밖에 없었거나, 쪼개기 전이 아주 성겼을 때(low 미만 → hard까지)뿐
        if (wd > FORM_LIM.max * cap + 1e-6) {
          let sparse = false;
          for (let t = 1; t < 4; t++) if (c[t - 1] >= 10 && wd - 10 * TIER[t - 1].w + TIER[t].w < FORM_LIM.low * cap && wd <= FORM_LIM.hard * cap + 1e-6) sparse = true;
          assert.ok(compWidth(g0) > FORM_LIM.max * cap || compCount(g0) < needFor(g.m0) || sparse, `${id}: 쪼개서 빽빽해졌다 ${(wd / cap).toFixed(2)}`);
        }
        // 성기면: 하나를 더 쪼개면 넘친다(채울 만큼 채웠다)
        if (wd < FORM_LIM.min * cap - 1e-6) {
          const hi = (wd < FORM_LIM.low * cap ? FORM_LIM.hard : FORM_LIM.max) * cap;
          for (let t = 1; t < 4; t++) if (c[t] && !(t === 1 && c[0] >= FORM_LIM.slack)) assert.ok(wd + 10 * TIER[t - 1].w - TIER[t].w > hi, `${id}: 성긴데(${(wd / cap).toFixed(2)}) 더 쪼갤 수 있다`);
        }
      }
    }
  }
  // 205명(폰 390×844): 100 한 장 + 10 열 장 + 병사 다섯 — 셀 수 있게, 그림이 적고 많이 가리지 않는다
  // (가장 많이 가린 몫 0.35까지: 망원 카메라라 무리 깊이가 화면에서 18% 납작해져 줄 간격이 13.5px → 11px — 가운데 줄 10명 묶음이 0.34쯤 가린다)
  const v = hbView(390, 844, 3, 0);
  const p = planOf(v, 205);
  assert.deepEqual(p.comp, [5, 10, 1, 0]);
  const cov = coverOf(v, p);
  assert.ok(p.units.length <= 20 && Math.max(...cov) <= 0.35, `205명: ${p.units.length}장, 가장 많이 가린 몫 ${Math.max(...cov).toFixed(2)}`);
});

test('합친 병사 배치: 큰 단계가 앞줄·가운데, 줄마다 양옆 끝이 ±R(맨 앞줄만 가운데 한 장), 옆 끝 그림이 위아래로 이어진다, 덜 가린다', () => {
  for (const [tag, w, h, dpr] of HB_VIEWS) {
    for (const dolly of [0, 1]) {
      const v = hbView(w, h, dpr, dolly);
      let covSum = 0, covN = 0;
      for (let n = 1; n <= 9999; n += n < 400 ? 1 : n < 3000 ? 13 : 97) {
        const R = Core.radius(n), [ppm] = hbScale(v, R);
        const p = planOf(v, n), us = p.units, g = p.g;
        const id = `${tag} ${dolly ? '보스전' : '달리기'} n=${n} [${p.comp}] ${p.arr.sizes}`;
        assert.equal(us.length, compCount(p.comp), id);
        assert.ok(us.length <= 30, `${id}: ${us.length}장`);
        const rows = new Map();
        for (const u of us) { const k = u.z.toFixed(6); if (!rows.has(k)) rows.set(k, []); rows.get(k).push(u); }
        const rs = [...rows.values()].sort((a, b) => b[0].z - a[0].z);   // 앞줄(먼 쪽)부터
        if (n >= 3) {
          assert.ok(rs.length >= 2 && Math.abs(rs[0][0].z - g.D) < 1e-9 && Math.abs(rs[rs.length - 1][0].z + g.D) < 1e-9, `${id}: 앞뒤 줄이 ±D가 아니다`);
        }
        for (let r = 0; r < rs.length; r++) {
          const row = rs[r];
          // 큰 단계가 앞줄: 이 줄의 가장 작은 단계 ≥ 뒷줄의 가장 큰 단계
          if (r + 1 < rs.length) assert.ok(Math.min(...row.map((u) => u.t)) >= Math.max(...rs[r + 1].map((u) => u.t)), `${id}: 작은 단계가 큰 단계 앞에`);
          // 줄 안: 가운데에 가까울수록 큰 단계(옆 끝이 크고 안이 작은 일 없음)
          for (const a of row) for (const b of row) if (Math.abs(a.x) < Math.abs(b.x) - 1e-6) assert.ok(a.t >= b.t, `${id}: 줄 안에서 큰 것이 바깥에`);
          let l = 1e9, rr = -1e9;
          for (const u of row) { l = Math.min(l, u.x - TIER[u.t].halfL / ppm); rr = Math.max(rr, u.x + TIER[u.t].halfR / ppm); }
          if (row.length >= 2 && row[0].z >= 0) assert.ok(Math.abs(l + R) < 0.02 && Math.abs(rr - R) < 0.02, `${id}: 줄 [${l.toFixed(2)}, ${rr.toFixed(2)}] ≠ ±R ${R.toFixed(2)}`);
          else if (row.length >= 2) {
            // 가운데보다 뒤 줄: 화면에서 옆 끝이 몸 끝(±R)의 원근 사다리꼴 안 — 가운데 깊이의 폭 이상, 제 발 깊이의 폭 이하
            project(v, 0, 0, row[0].z);
            const pz = P.s, cx = P.x;
            for (const u of [row[0], row[row.length - 1]]) {
              project(v, u.x, 0, u.z);
              const e = Math.abs(P.x - cx) + (u.x < 0 ? TIER[u.t].halfL : TIER[u.t].halfR);
              assert.ok(e >= R * ppm - 0.5 && e <= R * pz + 0.5, `${id}: 뒷줄 옆 끝 ${e.toFixed(1)}px가 ${(R * ppm).toFixed(1)}~${(R * pz).toFixed(1)}px 밖`);
            }
          }
          else if (us.length >= 3) assert.ok(us.length === 3 && r === 0 && Math.abs(row[0].x) < 1e-9, `${id}: 한 장짜리 줄(셋일 때 V자의 맨 앞 가운데만)`);
        }
        for (const a of us) for (const b of us) if (a !== b) assert.ok(Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.z - b.z) > 1e-6, `${id}: 같은 자리`);
        if (n >= 3) {
          // 화면에서 옆 끝 그림이 맨 뒷줄 발부터 맨 앞줄 발까지 틈 없이 이어진다(한 장짜리 앞줄은 둘째 줄 옆 끝이 앞줄 발까지 덮는다)
          const boxes = planBoxes(v, p);
          const byRow = rs.map((row) => row.map((u) => boxes[us.indexOf(u)]));
          const frontY = byRow[0][0][3];
          for (const side of [0, 1]) {
            const col = byRow.filter((bs) => bs.length >= 2).map((bs) => bs.reduce((a, b) => (side ? (b[1] > a[1] ? b : a) : (b[0] < a[0] ? b : a))));
            col.sort((a, b) => b[3] - a[3]);   // 뒷줄(아래)부터
            for (let i = 0; i + 1 < col.length; i++) assert.ok(col[i][2] <= col[i + 1][3], `${id}: 옆 끝 그림 사이 세로 틈 ${col[i][2] - col[i + 1][3]}px`);
            assert.ok(col[col.length - 1][2] <= frontY, `${id}: 옆 끝 그림이 앞줄 발까지 닿지 않는다`);
          }
          const cov = coverOf(v, p);
          covSum += cov.reduce((a, b) => a + b, 0) / cov.length; covN++;
        }
      }
      // 평균으로 그림의 대부분이 보인다(가장 좁은 보스전 화면도)
      assert.ok(covSum / covN <= 0.3, `${tag} ${dolly ? '보스전' : '달리기'}: 평균 가린 몫 ${(covSum / covN).toFixed(2)}`);
    }
  }
});

/* 이어 가기 한 걸음(c, n → c2, nn) 검사: 정수, 0장 없음, 합 ≤ n, 10 미만은 병사, 줄마다 두 장, keep 안(아니면 처음부터 짠 것).
   어림은 큰 무리(100명 이상)에서만, 처음부터 짠 것의 0.9 이상. 처음부터 짜면 정확한데 어림이면 — 그대로 둔 것(머뭇거림: 얻었는데 넘쳐 새 병사를
   그리지 않았거나, 잃었는데 어림 합보다 아직 많거나, 정확한 것이 한 명만 잃어도 무너지거나)이거나, 잃어서 넘쳐 낮은 단계를 뺀 것뿐 */
function checkStep(c, n, c2, nn, g, id) {
  assert.ok(c2.length === 4 && c2.every((k) => Number.isInteger(k) && k >= 0), id);
  if (nn >= 1) assert.ok(compCount(c2) >= 1, `${id}: 그림 0장`);
  assert.ok(compSum(c2) <= nn, `${id}: 합이 n보다 크다`);
  if (nn < 10) assert.deepEqual(c2, [nn, 0, 0, 0], id);
  if (nn >= 4) assert.ok(compCount(c2) >= needFor(g.m0), `${id}: ${compCount(c2)}장으로는 ${g.m0}줄 양옆을 못 덮는다`);
  const cap = g.m0 * g.W, f = composeSquad(nn, g);
  if (nn >= 10) assert.ok(compWidth(c2) <= FORM_LIM.keep * cap + 1e-6 || deepEq(c2, f), `${id}: 너무 빽빽하다`);
  if (compSum(c2) !== nn) {
    assert.ok(nn >= 100, `${id}: 작은 무리가 어림`);
    assert.ok(compSum(c2) >= 0.9 * compSum(f), `${id}: 어림이 처음부터 짠 것(${compSum(f)})보다 많이 적다`);
    if (compSum(f) === nn) assert.ok(deepEq(c2, c) || (nn < n && naiveBad(c, n, nn, g)), `${id}: 정확하게 그릴 수 있는데 어림(처음부터 짜면 [${f}])`);
  }
}
/* 이전 구성에 병사만 더하고 뺀 것(잃을 때 병사가 모자라면 가장 작은 합친 병사를 줄줄이 나눈다)이 넘치거나 양옆을 못 덮는가 — 그때만 거꾸로 바뀌어도 된다
   (작은 무리는 병력과 함께 몸 R이 줄고 늘어 들어갈 자리가 바뀐다) */
function naiveBad(c, n, nn, g) {
  const d = c.slice();
  d[0] += nn - (compSum(c) !== n ? Math.min(n, compSum(c)) : n);
  while (d[0] < 0) {
    let t = 1;
    while (t < 4 && !d[t]) t++;
    if (t >= 4) return true;
    d[t]--; d[t - 1] += 10;
  }
  return compWidth(d) > FORM_LIM.keep * g.m0 * g.W + 1e-6 || compCount(d) < needFor(g.m0);
}
/* 구성 a → b의 바꿈(위 단계부터 남는 차이를 열로 내린다): [10→병사, 100→10, 1000→100] 나뉜 수(+) / 합쳐진 수(−) */
function flowsOf(a, b) {
  const s3 = a[3] - b[3], s2 = a[2] - b[2] + 10 * s3, s1 = a[1] - b[1] + 10 * s2;
  return [s1, s2, s3];
}
/* 이어 가기 검사: 합치기·나누기 수(10:1 바꿈) — 위 단계부터 남는 차이를 열로 내린다. 큰 그림 하나가 줄줄이 풀리는 것
   (100 하나 → 10 아홉 + 병사 열: 단계마다 한 번씩 같은 쪽으로)은 그림 하나가 나뉘는 한 번으로 센다 */
function mergeOps(a, b) {
  const s3 = a[3] - b[3], s2 = a[2] - b[2] + 10 * s3, s1 = a[1] - b[1] + 10 * s2, ss = [s1, s2, s3];
  const ops = Math.abs(s1) + Math.abs(s2) + Math.abs(s3);
  const chain = ss.every((x) => x === 0 || x === 1) || ss.every((x) => x === 0 || x === -1);
  return ops > 1 && chain ? 1 : ops;
}
test('합친 병사 이어 가기: 한 명씩 늘고 줄 때 합치기·나누기는 많아야 한 번, 합은 정확, 채우기 창·양옆 규칙은 늘 지킨다, 오가도 깜빡이지 않는다', () => {
  const seqs = [];
  const ramp = (a, b) => { const s = []; for (let n = a; n !== b; n += a < b ? 1 : -1) s.push(n); s.push(b); return s; };
  seqs.push(['1→1200', ramp(1, 1200)], ['1200→1', ramp(1200, 1)], ['3100→2000', ramp(3100, 2000)], ['2000→3100', ramp(2000, 3100)]);
  for (const b of [10, 100, 1000]) {
    const s = [];
    for (let k = 0; k < 5; k++) s.push(...ramp(b - 4, b + 4), ...ramp(b + 3, b - 3));
    seqs.push([`${b} 근처 오가기`, s]);
  }
  {
    const s = [];
    for (let n = 7; n <= 9000; n *= 2) s.push(n);
    for (let n = 7168; n >= 3; n = Math.floor(n / 2)) s.push(n);
    seqs.push(['×2 ÷2', s]);
  }
  { const s = [205]; while (s[s.length - 1] > 0) s.push(Math.max(0, s[s.length - 1] - 45)); seqs.push(['205 −45씩', s]); }
  { const s = []; for (let n = 2864; n > 0; n -= 1 + (n % 7)) s.push(n); s.push(0); seqs.push(['2864 → 0 물려 줄기', s]); }
  for (const [tag, w, h, dpr] of HB_VIEWS) {
    for (const dolly of [0, 1]) {
      const v = hbView(w, h, dpr, dolly);
      for (const [name, s] of seqs) {
        let n = s[0], c = composeSquad(n, geomOf(v, n)), big = 0;
        for (let i = 1; i < s.length; i++) {
          const nn = s[i], g = geomOf(v, nn), c2 = nextComp(c, n, nn, g);
          const id = `${tag} ${dolly ? '보스전' : '달리기'} ${name}: ${n}→${nn} [${c}]→[${c2}]`;
          checkStep(c, n, c2, nn, g, id);
          if (Math.abs(nn - n) === 1 && compSum(c) === n && compSum(c2) === nn) {
            const ops = mergeOps(c, c2);
            assert.ok(ops <= 1, `${id}: 합치기·나누기 ${ops}번`);
            if (ops) big++;
          }
          c = c2; n = nn;
        }
        // (병사 열 명마다 한 번은 나누거나 합쳐야 한다 — 그보다 조금 더까지)
        if (name.includes("→") && !name.includes("물려")) assert.ok(big <= s.length / 6, `${tag} ${name}: 합치기·나누기 ${big}번 / ${s.length}걸음`);
      }
      // 오가기: n ↔ n+1을 되풀이해도 처음 한 번 뒤로는 그대로
      for (const n0 of [12, 19, 99, 100, 129, 130, 199, 200, 202, 203, 209, 210, 299, 999, 1000, 1500]) {
        const g0 = geomOf(v, n0), g1 = geomOf(v, n0 + 1);
        let c = composeSquad(n0, g0);
        const seen = [];
        for (let k = 0; k < 6; k++) {
          const c1 = nextComp(c, n0, n0 + 1, g1);
          c = nextComp(c1, n0 + 1, n0, g0);
          seen.push(c.join(',') + '/' + c1.join(','));
        }
        assert.equal(new Set(seen.slice(1)).size, 1, `${tag} n=${n0}↔${n0 + 1} 깜빡임: ${seen.join(' ')}`);
      }
    }
  }
  // 배율이 조금씩 바뀌어도(보스전 카메라) 같은 구성이면 줄 배치를 지킨다
  const v0 = hbView(390, 844, 3, 0), v1 = hbView(390, 844, 3, 1);
  for (const n of [60, 205, 999, 2864]) {
    const R = Core.radius(n), s0 = hbScale(v0, R), s1 = hbScale(v1, R);
    let g = formGeom(R, ...s0), c = composeSquad(n, g), a = formArrange(c, g), flips = 0;
    for (let k = 1; k <= 40; k++) {
      const u = k / 40;
      g = formGeom(R, s0[0] + (s1[0] - s0[0]) * u, s0[1] + (s1[1] - s0[1]) * u, s0[2] + (s1[2] - s0[2]) * u);
      const c2 = nextComp(c, n, n, g);
      const a2 = formArrange(c2, g, c2.join(',') === a.comp ? a : null);
      if (a2.key !== a.key) flips++;
      c = c2; a = a2;
    }
    assert.ok(flips <= 2, `n=${n}: 보스전 카메라로 ${flips}번 다시 짰다`);
  }
});

test('합친 병사 이어 가기: n이 움직인 쪽으로만 — 잃을 때 합치지 않고 얻을 때 나누지 않는다, 그린 합도 n을 거스르지 않는다, 오가도 그대로', () => {
  for (const [tag, w, h, dpr] of HB_VIEWS) {
    for (const dolly of [0, 1]) {
      const v = hbView(w, h, dpr, dolly);
      const geo = new Map(), G = (n) => { let g = geo.get(n); if (!g) { g = geomOf(v, n); geo.set(n, g); } return g; };
      for (const step of [1, 2, 3]) for (const dir of [-1, 1]) {
        let n = dir < 0 ? 3000 : 10, c = composeSquad(n, G(n));
        while (dir < 0 ? n - step >= 10 : n + step <= 3000) {
          const nn = n + dir * step, g = G(nn), c2 = nextComp(c, n, nn, g);
          const id = `${tag} ${dolly ? '보스전' : '달리기'} ${dir * step}씩: ${n}→${nn} [${c}]→[${c2}]`;
          checkStep(c, n, c2, nn, g, id);
          // 그린 합은 n이 움직인 쪽으로만(어림도)
          assert.ok(dir < 0 ? compSum(c2) <= compSum(c) : compSum(c2) >= compSum(c), `${id}: 그린 합이 거꾸로`);
          // 바뀜도 그쪽으로만: 잃을 때 나누기만, 얻을 때 합치기만(병사만 더하고 빼서는 넘치거나 양옆을 못 덮을 때 말고)
          const fl = flowsOf(c, c2);
          if (dir < 0 ? fl.some((x) => x < 0) : fl.some((x) => x > 0)) assert.ok(naiveBad(c, n, nn, g), `${id}: ${dir < 0 ? '잃는데 합쳤다' : '얻는데 나눴다'} ${fl}`);
          // 합치기·나누기가 없으면 그림은 n이 바뀐 만큼만 생기거나 사라진다
          if (fl.every((x) => x === 0)) assert.ok(Math.abs(compCount(c2) - compCount(c)) <= step, `${id}: 그림 ${compCount(c)}→${compCount(c2)}장`);
          c = c2; n = nn;
        }
      }
      // 오가기(n ↔ n+1, 아물기·물리기): 처음 몇 번 뒤로는 합치기·나누기 없이 병사 하나만 — 60명부터(더 작으면 줄마다 두 장 규칙에 걸려 어쩔 수 없을 때가 있다)
      for (let n0 = 60; n0 <= 3000; n0 += n0 < 1200 ? 1 : 3) {
        let c = composeSquad(n0, G(n0)), c1 = null;
        for (let k = 0; k < 3; k++) { c1 = nextComp(c, n0, n0 + 1, G(n0 + 1)); c = nextComp(c1, n0 + 1, n0, G(n0)); }
        c1 = nextComp(c, n0, n0 + 1, G(n0 + 1));
        assert.ok(flowsOf(c, c1).every((x) => x === 0) && compSum(c1) - compSum(c) <= 1, `${tag} ${dolly ? '보스전' : '달리기'} ${n0}↔${n0 + 1}: [${c}]↔[${c1}] 깜빡임`);
      }
    }
  }
});

test('합친 병사 불꽃·붉은 빛: 차례(ph·hr)로 고르게 — 한 프레임에 몰리지 않고 모든 쏘는 그림이 주기마다 한 번, 맞을 때마다 몇 장씩', async () => {
  for (let k = 1; k <= 30; k++) for (let per = 5; per <= 20; per++) for (const low of [false, true]) {
    const fired = new Array(k).fill(0), span = (low ? 2 : 1) * per;
    for (let f = 0; f < span * 6; f++) {
      let c = 0;
      for (let ph = 0; ph < k; ph++) if (muzzleOn(f, ph, per, low)) { c++; fired[ph]++; }
      assert.ok(c <= Math.ceil(k / per), `${k}장 주기 ${per}${low ? ' 낮은 품질' : ''}: 프레임 ${f}에 ${c}장이 한꺼번에`);
      if (low && (f & 1)) assert.equal(c, 0);
    }
    assert.ok(fired.every((x) => x === 6), `${k}장 주기 ${per}${low ? ' 낮은 품질' : ''}: 쏘지 않거나 더 쏘는 그림 ${fired}`);
  }
  // 렌더러는 차례로 쏘고 붉어진다(id 곱셈은 주기와 약수를 나누면 모두 한꺼번에·아무도 안 된다)
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../assets/render.js', import.meta.url), 'utf8');
  assert.match(src, /u\.fire && muzzleOn\(f60, u\.ph, firePeriod, quality === 'low'\)/);
  assert.match(src, /\(u\.hr \+ hurtSeed\) % hurtMod === 0/);
  assert.match(src, /hurtMod = clamp\(Math\.ceil\(NU \/ 3\), 1, 11\)/);
  // 차례 0..NU−1이면 맞을 때마다(hurtSeed 0~10) 붉어지는 그림은 ⌊NU/mod⌋~⌈NU/mod⌉장 — 모두나 아무도가 아니다
  for (let NU = 1; NU <= 30; NU++) {
    const mod = Math.min(11, Math.max(1, Math.ceil(NU / 3)));
    for (let seed = 0; seed < 11; seed++) {
      let c = 0;
      for (let hr = 0; hr < NU; hr++) if ((hr + seed) % mod === 0) c++;
      assert.ok(c >= Math.floor(NU / mod) && c <= Math.ceil(NU / mod), `${NU}장: 한 번 맞아 ${c}장이 붉어진다`);
    }
  }
});

test('합친 병사 전차: 흰 별(분대장 금별과 다르게), 뒷줄이 전차를 1/3쯤만 가린다(전차 줄 뒤를 TANK_GAP까지 더 띄운다)', () => {
  const sh = SHEETS.sq1000;
  for (const fr of sh.frames) {
    const top = fr.slice(0, 11).join('');
    assert.ok(top.includes('W') && !/[yY]/.test(top), '포탑 별은 흰색');
  }
  assert.ok(TANK_GAP <= TIER[2].h - 1 && TANK_GAP >= TIER[3].h * 2 / 3, `TANK_GAP ${TANK_GAP}`);
  const v = hbView(390, 844, 3, 0);
  for (const n of [2000, 2864]) {
    const p = planOf(v, n), cov = coverOf(v, p);
    const tanks = p.units.map((u, i) => [u, cov[i]]).filter(([u]) => u.t === 3).map(([, c]) => c);
    assert.ok(tanks.length && Math.max(...tanks) <= 1 / 3 + 0.01, `n=${n} [${p.comp}] ${p.arr.sizes}: 전차가 ${tanks.map((x) => x.toFixed(2))}만큼 가렸다`);
  }
});

test('충돌 크기: 그린 무리의 끝 = 분대 반지름 R(옆)·SQUAD_DEPTH·R(앞뒤), 맞는 몸(hitHalf)은 그린 폭의 80~100%', () => {
  const sb = spriteBox('soldier');
  assert.deepEqual([sb.L, sb.R, sb.H], [TIER[0].halfL, TIER[0].halfR, TIER[0].h]);
  for (const [tag, w, h, dpr] of HB_VIEWS) {
    for (const dolly of [0, 1]) {
      const v = hbView(w, h, dpr, dolly);
      assert.ok(project(v, 0, 0, 0));
      for (const n of HB_NS) {
        const R = Core.radius(n), H = Core.hitHalf(R), [ppm] = hbScale(v, R);
        const p = planOf(v, n);
        let l = 0, r = 0, f = -9, bk = 9;
        for (const u of p.units) {
          l = Math.min(l, u.x - TIER[u.t].halfL / ppm); r = Math.max(r, u.x + TIER[u.t].halfR / ppm);
          f = Math.max(f, u.z); bk = Math.min(bk, u.z);
        }
        const id = `${tag} ${dolly ? '보스전' : '달리기'} n=${n} [${p.comp}]`;
        const drawn = Math.min(r, -l);
        assert.ok(H <= drawn + 1e-9, `${id}: 맞는 몸 ±${H.toFixed(2)} > 그린 무리 ±${drawn.toFixed(2)}`);
        if (n >= 3) {
          assert.ok(Math.abs(r - R) < 0.02 && Math.abs(-l - R) < 0.02, `${id}: 그린 무리 [${l.toFixed(2)}, ${r.toFixed(2)}] ≠ ±R ${R.toFixed(2)}`);
          assert.ok(H >= 0.8 * drawn, `${id}: 맞는 몸 ${H.toFixed(2)} < 그린 폭 ${drawn.toFixed(2)}의 80%`);
          const D = Core.SQUAD_DEPTH * R;
          assert.ok(f <= D && f >= D - FORM_IN - 0.01 && bk >= -D && bk <= -D + FORM_IN + 0.01, `${id}: 앞뒤 발 [${bk.toFixed(2)}, ${f.toFixed(2)}] ≠ ±${D.toFixed(2)}(− ${FORM_IN})`);
        }
      }
    }
  }
  // 특수병·영웅은 무리 뒤(맞는 몸 밖, 옆으로는 분대 폭 안 — 옆에서 오는 좀비가 먼저 닿지 않게)
  for (const n of [12, 60, 300]) {
    const R = Core.radius(n), q = { z: 0 };
    for (let i = 0; i < 3; i++) {
      const sl = slotPos(q, i, R, 0);
      assert.ok(sl.z < -Core.SQUAD_DEPTH * R && Math.abs(sl.x) <= R, `n=${n} 특수병 ${i} 자리 ${JSON.stringify(sl)}`);
    }
    assert.ok(heroZ(q, R) < slotPos(q, 0, R, 0).z);
  }
});

/* 좀비·톱날이 무는 경계(core.touches가 막 참이 되는 자리)에서, 화면의 좀비 그림과 가장 가까운 분대 그림(단계마다 제 크기) 사이 픽셀 틈 —
   양수면 '안 닿았는데 물렸다'. 폰 ≤ 0px, 데스크톱 ≤ 2px. 옆에서 닿을 때 그림이 겹치는 깊이는 5px·좀비 그림 폭의 35% 이하(그만큼은 봐준다 —
   가장 너그러운 것은 360×640 보스전의 질주 좀비 5px) */
test('충돌 크기: 무는 순간 그림도 닿는다 — 좀비·톱날(옆·앞·뒤·모서리)', () => {
  const kinds = [['grunt', 'grunt'], ['runner', 'runner'], ['spit', 'spit'], ['brute', 'brute'], ['saw', 'saw']];
  for (const [tag, w, h, dpr] of HB_VIEWS) {
    const lim = tag === '1280x720' ? 2 : 0;
    for (const dolly of [0, 1]) {
      const v = hbView(w, h, dpr, dolly);
      for (const n of [1, 3, 5, 9, 12, 13, 20, 25, 30, 60, 90, 100, 130, 205, 290, 300, 1000, 2864, 9999]) {
        const R = Core.radius(n), H = Core.hitHalf(R), hz = Core.SQUAD_DEPTH * R;
        const plan = planOf(v, n);
        const boxes = planBoxes(v, plan);
        for (const [k, sheet] of kinds) {
          const fr = k === 'saw' ? 0.35 : Core.FOE_BASE[k].r;
          const a = k === 'saw' ? 0.55 : Core.FOE_HX * fr;
          const sb = spriteBox(sheet);
          let worst = -99, at = null, side0 = -99;
          for (const side of [-1, 1]) for (let j = -60; j <= 60; j++) {
            const dz = (j / 60) * (hz + fr) * 0.999;
            const ez = Math.max(0, Math.abs(dz) - hz) / fr;
            if (ez >= 1) continue;
            const dx = side * (H + a * Math.sqrt(1 - ez * ez) - 0.005);
            assert.ok(Core.touches(dx, dz, H, hz, a, fr));
            project(v, dx, 0, dz);
            const px = Math.round(P.x), py = Math.round(P.y) - (k === 'saw' ? Math.round(P.s * 0.15) : 0);
            const fb = [px - sb.L, px + sb.R, py - sb.H, py];
            let best = 99;
            for (const s of boxes) {
              const gx = Math.max(s[0] - fb[1], fb[0] - s[1]), gy = Math.max(s[2] - fb[3], fb[2] - s[3]);
              best = Math.min(best, Math.max(gx, gy));
            }
            if (best > worst) { worst = best; at = [+dx.toFixed(2), +dz.toFixed(2)]; }
            if (j === 0 && side === 1) side0 = -best;   // 바로 옆: 겹친 깊이(px)
          }
          const id = `${tag} ${dolly ? '보스전' : '달리기'} n=${n} [${plan.comp}] ${k}`;
          assert.ok(worst <= lim, `${id}: 물린 순간 그림 사이 ${worst}px (자리 ${at})`);
          if (n >= 3) assert.ok(side0 <= Math.max(5, 0.35 * (sb.L + sb.R)), `${id}: 옆에서 ${side0}px 겹쳐야 문다(너무 늦다)`);
        }
      }
    }
  }
});

test('충돌 크기: 물체마다 맞는 폭 ≤ 그린 폭(좀비 접촉·톱날·총알 받는 폭·보스 몸통·독침 고리·벽)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../assets/render.js', import.meta.url), 'utf8');
  const STEPS3 = [1, 0.75, 0.5];
  for (const [tag, w, h, dpr] of HB_VIEWS) {
    const v = hbView(w, h, dpr, 0);
    // 닿는 거리(분대 가까이, 원래 크기)에서: 접촉 폭(FOE_HX·r)은 그린 반폭의 65~115%(그림은 픽셀 크기가 고정이라 화면마다 1.3배까지 다르다 —
    // 질주 좀비는 졸개와 같은 그림에 몸이 작아 가장 너그럽다), 분대 몸과 더한 접촉 거리는 그린 것보다 크지 않고 그 80% 이상(병력 12명부터)
    for (const k of ['grunt', 'runner', 'spit', 'brute']) {
      const r = Core.FOE_BASE[k].r, sb = spriteBox(k);
      for (const n of [3, 12, 60, 300]) for (const u of [0, 0.5, 1]) {
        const R = Core.radius(n);
        const dz = u * (Core.SQUAD_DEPTH * R + r);   // 무는 깊이(옆 ~ 앞)
        project(v, 0, 0, dz);
        const fw = (sb.L + sb.R) / 2 / P.s;
        const hx = Core.FOE_HX * r;
        assert.ok(hx >= 0.65 * fw && hx <= 1.15 * fw, `${tag} ${k} dz=${dz.toFixed(2)}: 접촉 반폭 ${hx.toFixed(2)} vs 그림 ${fw.toFixed(2)}`);
        {
          const c = Core.hitHalf(R) + hx;
          assert.ok(c <= R + fw + 0.005, `${tag} ${k} n=${n}: 접촉 거리 ${c.toFixed(2)}가 그린 것 ${(R + fw).toFixed(2)}보다 크다`);
          if (n >= 12) assert.ok(c >= 0.8 * (R + fw), `${tag} ${k} n=${n}: 접촉 거리 ${c.toFixed(2)} < 그린 것의 80%`);
        }
      }
      // 총알 받는 폭(r + 0.12)은 쏘는 거리(6~25m, 축소 단계 포함)에서 그린 반폭의 범위 안(조금 넓은 쪽 — 화면에서 1~2px)
      let st, lo = 9, hi = 0;
      for (let dz = 25; dz >= 6; dz -= 0.25) {
        project(v, 0, 0, dz);
        st = pickStep((P.s * (WORLD_H[k] || 1.05)) / (sb.H - 2), st, STEPS3);
        const half = ((sb.L + sb.R) / 2) * STEPS3[st] / P.s;
        lo = Math.min(lo, half); hi = Math.max(hi, half);
      }
      const bh = r + 0.12;
      assert.ok(bh >= lo && bh <= hi * 1.05, `${tag} ${k}: 총알 받는 폭 ±${bh.toFixed(2)}가 그린 반폭 ${lo.toFixed(2)}~${hi.toFixed(2)} 밖`);
    }
    // 톱날: 날 폭(w.w = 1.1, 생성기)의 반 ≤ 그린 날 반폭 + 은혜 — 분대 몸과 더한 접촉 거리가 그린 것보다 크지 않다
    const sw = spriteBox('saw');
    for (const dz of [0, 1, 2]) {
      project(v, 0, 0, dz);
      const half = Math.min(sw.L, sw.R) / P.s;
      for (const n of [3, 12, 60, 300]) { const R = Core.radius(n); assert.ok(Core.hitHalf(R) + 0.55 <= R + half + 0.005, `${tag} 톱날 n=${n}: 접촉 ${(Core.hitHalf(R) + 0.55).toFixed(2)} > 그림 ${(R + half).toFixed(2)}`); }
    }
  }
  // 생성기가 만드는 톱날 폭은 1.1
  const lv = Core.prepareLevel(6);
  assert.ok(lv.saws.length > 0 && lv.saws.every((s) => s.w === 1.1), '톱날 폭');
  // 보스 몸통(BOSS_HIT): 원래 크기 그림에서 팔 안쪽 끝(몸통·허리띠·다리) 안 — 총알 받는 띠가 팔까지 넓지 않다
  {
    const sh = SHEETS.boss;
    const R = outline(frameRaster(sh.frames[0], palOf(sh.pal)), OUT);
    const pxPerM = (R.h - 2) / WORLD_H.boss;
    // 허리띠 줄(발에서 26~30px 위): 몸통 폭
    const ax = R.w >> 1;
    let belt = 0;
    for (let y = R.h - 31; y <= R.h - 27; y++) for (let x = 0; x < R.w; x++) if (R.get(x, y) === OUT && Math.abs(x - ax) < 30) belt = Math.max(belt, Math.abs(x - ax));
    assert.ok(Core.BOSS_HIT * pxPerM <= 34 && Core.BOSS_HIT * pxPerM >= 24, `보스 몸통 ±${Core.BOSS_HIT}m = ${(Core.BOSS_HIT * pxPerM).toFixed(1)}px (조끼 ±34px, 허리띠 ±26px)`);
    void belt;
  }
  // 빗나간 총알은 보스 뒤로 그린다(팔을 뚫고 가는 것처럼 보이지 않게), 독침 고리 = SPIT_R, 벽·상자·철창은 x0~x1 그대로
  assert.match(src, /push\(s\.boss\.z \+ 0\.05, 11, null\)/, '보스 뒤 총알 그리기 항목');
  assert.match(src, /\(b\.z \+ ext > plane\) !== behind/, '총알 판을 지난 총알만 보스 뒤로');
  assert.match(src, /ellRing\(P\.x, P\.y, SPIT_R \* P\.s, SPIT_R \* P\.s \* 0\.38, 1\)/, '독침 고리 = SPIT_R');
  assert.doesNotMatch(src, /1\.2 \* P\.s \* 0\.38/, '독침 고리를 숫자로 그리지 않는다');
  assert.match(src, /function boxFaces\(p, H, depth = 0\.35\) \{\s*const z0 = p\.z - depth, z1 = p\.z \+ depth;\s*if \(!project\(view, p\.x0, H, z1\)\)/, '벽·상자는 x0~x1로 그린다');
  // 충돌 크기 보기는 시뮬레이션의 hitShapes만 그린다
  assert.match(src, /const sh = hitShapes\(s\);/);
});
