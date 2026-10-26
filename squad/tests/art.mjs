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
