/* 지역별 좀비 옷·땅·소품 검사 — node --test squad/tests/skins.mjs (그래픽 업그레이드 2; 그림만, 시뮬레이션은 그대로)
   보스 쪽 항목(보스 시트·왕관·소개 글)은 bosses.js 쪽 검사가 더한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEETS, PAL, BIOME, BIOME_GROUND_KEYS, SEMANTIC, OUT, WORLD_H, SKIN, skinOf, biomeSheets } from '../assets/pix/art.js';
import { frameRaster, outline, deltaE, lab } from '../assets/pix/raster.js';
import { BIOMES, biomeOf } from '../assets/roster.js';
import { SPIT_TELL, FOE_ALTS } from '../assets/pix/foes.js';
import { FRAMES } from '../assets/render.js';

const palOf = (p) => (typeof p === 'string' ? PAL[p] : p);
const KINDS = ['grunt', 'runner', 'spit', 'brute'];
function box(name, i) {
  const sh = SHEETS[name];
  const R = outline(frameRaster(sh.frames[i], palOf(sh.pal)), OUT);
  const ax = R.w >> 1;
  let l = 1e9, r = -1e9;
  for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) if (R.get(x, y)) { l = Math.min(l, x); r = Math.max(r, x); }
  return { W: R.w, H: R.h, L: ax - l, R: r + 1 - ax };
}

test('지역 순환: 10레벨마다 여섯 지역, 지역마다 BIOME·SKIN이 있다', () => {
  assert.deepEqual(BIOMES.map((b) => b.id), ['desert', 'snow', 'city', 'forest', 'lava', 'park']);
  for (let i = 0; i < 7; i++) assert.equal(biomeOf(1 + i * 10).id, BIOMES[i % 6].id);
  assert.equal(biomeOf(10).id, 'desert');
  assert.equal(biomeOf(60).id, 'park');
  for (const b of BIOMES) {
    assert.ok(BIOME[b.id], 'BIOME ' + b.id);
    assert.ok(SKIN[b.id], 'SKIN ' + b.id);
    for (const k of KINDS) assert.ok(SHEETS[skinOf(k, b.id)], `${b.id} ${k}`);
  }
});

test('좀비 옷: 기본 시트와 프레임 수·격자 크기·프레임마다 그림 상자가 같다(충돌 크기 검사가 지역과 상관없다)', () => {
  for (const b of BIOMES) for (const k of KINDS) {
    const name = skinOf(k, b.id);
    if (name === k) continue;
    const sh = SHEETS[name], base = SHEETS[k];
    assert.equal(sh.frames.length, base.frames.length, name);
    assert.deepEqual(sh.lod, base.lod, name + ' lod');
    assert.equal(!!sh.flash, !!base.flash, name + ' flash');
    sh.frames.forEach((_, i) => assert.deepEqual(box(name, i), box(k, i), `${name}[${i}]`));
  }
});

/* 팔레트 글자로 다시 읽기(글자마다 다른 가짜 색) */
function keyGrid(fr, pal) {
  const kp = {}, inv = {};
  Object.keys(pal).forEach((k, i) => { const c = '#' + (0x100000 + i * 7919).toString(16).toUpperCase().slice(-6); kp[k] = c; inv[c] = k; });
  const R = frameRaster(fr, kp);
  return { w: R.w, h: R.h, at: (x, y) => { const c = R.get(x, y); return c ? inv[c] : '.'; } };
}

test('거구 옷: 눈(줄 4~5 + 출렁임)은 그대로, 몸 무늬가 팔 외곽선을 덮지 않고, 모자는 머리와 함께 출렁인다', () => {
  const base = SHEETS.brute, bpal = palOf(base.pal);
  for (const b of BIOMES) {
    const name = skinOf('brute', b.id);
    if (name === 'brute') continue;
    const sh = SHEETS[name], tops = [];
    sh.frames.forEach((fr, f) => {
      const y0 = f & 1, g = keyGrid(fr, palOf(sh.pal)), gb = keyGrid(base.frames[f], bpal);
      const eye = [0, 1].map((j) => [10, 11, 12, 13, 14, 15].map((x) => (/[WK]/.test(g.at(x, 4 + y0 + j)) ? g.at(x, 4 + y0 + j) : '.')).join(''));
      assert.deepEqual(eye, ['WW..WW', 'WK..KW'], `${name}[${f}] 눈`);
      for (let y = 12 + y0; y < g.h; y++) for (let x = 0; x < g.w; x++) if ((x <= 6 || x >= 21) && gb.at(x, y) === 'K') assert.equal(g.at(x, y), 'K', `${name}[${f}] 팔 외곽선 ${x},${y}`);
      let t = -1;
      for (let y = 0; y < g.h && t < 0; y++) for (let x = 0; x < g.w; x++) if (g.at(x, y) !== '.') { t = y; break; }
      tops.push(t - y0);
    });
    assert.equal(new Set(tops).size, 1, `${name} 모자 꼭대기 - 출렁임 ${tops}`);
  }
});

test('톱날은 지역마다 같은 강철 회색(코인·사탕처럼 보이는 변형 없음)', () => {
  const alts = Object.keys(SHEETS.saw.alts || {});
  for (const b of BIOMES) assert.ok(!alts.includes(b.id), 'saw alt ' + b.id);
});

test('독침 옷은 예고 색(V·v·Y)이 기본과 같다', () => {
  const base = palOf(SHEETS.spit.pal);
  for (const b of BIOMES) {
    const sh = SHEETS[skinOf('spit', b.id)];
    for (const pal of [palOf(sh.pal), ...Object.values(sh.alts || {})]) for (const c of 'VvY') {
      assert.equal(pal[c], base[c], `${b.id} spit ${c}`);
      assert.equal(pal[c], SPIT_TELL[c]);
    }
  }
});

test('무리 변형 a·b: 기본·옷 시트 모두, 팔레트 키가 빠지지 않는다', () => {
  for (const b of BIOMES) for (const k of KINDS) {
    const sh = SHEETS[skinOf(k, b.id)];
    assert.ok(sh.alts && sh.alts.a && sh.alts.b, `${b.id} ${k} alts`);
    for (const an of ['a', 'b']) for (const key of Object.keys(palOf(sh.pal))) assert.ok(sh.alts[an][key], `${b.id} ${k}.${an} ${key}`);
  }
  for (const k of KINDS) assert.ok(FOE_ALTS[k].a && FOE_ALTS[k].b);
});

test('질주 좀비만 주황 옷을 입는다(종류 구별 신호) — 졸개 셔츠 u는 주황에서 멀다', () => {
  const ORANGE = '#F28A3A';
  for (const b of BIOMES) {
    const g = SHEETS[skinOf('grunt', b.id)], r = SHEETS[skinOf('runner', b.id)];
    for (const pal of [palOf(g.pal), ...Object.values(g.alts || {})]) assert.ok(deltaE(pal.u, ORANGE) >= 25, `${b.id} grunt u ${pal.u}`);
    for (const pal of [palOf(r.pal), ...Object.values(r.alts || {})]) assert.ok(deltaE(pal.u, ORANGE) < 15, `${b.id} runner u ${pal.u}`);
  }
});

test('새 지역 땅: 의미 색과 ΔE ≥ 20, 도로는 L* 30~42(외곽선이 읽힌다, 눈 도로 41), 도로·땅이 구별된다', () => {
  for (const b of BIOMES) {
    const B = BIOME[b.id];
    for (const key of BIOME_GROUND_KEYS) for (const s of [...SEMANTIC.good, ...SEMANTIC.bad]) assert.ok(deltaE(B[key], s) >= 20, `${b.id}.${key}`);
    for (const key of ['road']) { const L = lab(B[key])[0]; assert.ok(L >= 30 && L <= 42, `${b.id}.${key} L*=${L.toFixed(1)}`); }
    assert.ok(deltaE(B.road, B.ground) >= 20, `${b.id} road/ground`);
    assert.ok(deltaE(B.road, OUT) >= 19, `${b.id} road/outline`);
    for (const key of ['sky', 'props']) assert.equal(B[key].length, 5, `${b.id}.${key}`);
    if (B.weather) for (const f of ['kind', 'col', 'n', 'low', 'vy', 'sway', 'swayF', 'big']) assert.ok(B.weather[f] !== undefined, `${b.id}.weather.${f}`);
    if (B.weather) assert.ok(B.weather.n <= 40 && B.weather.low <= B.weather.n, `${b.id} weather pool`);
  }
});

test('소품: 지역마다 다섯, 시트·WORLD_H가 있고 격자 ≤ 16×20, 빨강 없음', () => {
  const reds = ['#FF5D5D', '#E8384F'];
  for (const b of BIOMES) for (const p of BIOME[b.id].props) {
    const sh = SHEETS[p];
    assert.ok(sh, p);
    assert.ok(WORLD_H[p] > 0, 'WORLD_H ' + p);
    const R = frameRaster(sh.frames[0], palOf(sh.pal));
    assert.ok(R.w <= 16 && R.h <= 20, `${p} ${R.w}x${R.h}`);
    for (const c of new Set(R.a.filter(Boolean))) for (const r of reds) assert.ok(deltaE(c, r) >= 20, `${p} ${c}`);
  }
});

test('지역 시트 목록(쉬는 틈에 굽기)과 렌더러 프레임 표', () => {
  for (const b of BIOMES) for (const n of biomeSheets(b.id)) assert.ok(SHEETS[n], n);
  for (const k of ['grunt', 'runner']) for (const b of BIOMES) assert.ok(FRAMES.foe.sheets.includes(skinOf(k, b.id)));
  for (const b of BIOMES) assert.ok(FRAMES.spit.sheets.includes(skinOf('spit', b.id)) && FRAMES.brute.sheets.includes(skinOf('brute', b.id)));
});

test('아틀라스 어림: 기본 + 한 지역의 좀비 옷·소품 픽셀(보스 제외) ≤ 0.2M', () => {
  const est = (name) => {
    const sh = SHEETS[name];
    const nv = 1 + Object.keys(sh.alts || {}).length + (sh.flash ? 1 : 0);
    let px = 0;
    for (const fr of sh.frames) { const R = frameRaster(fr, palOf(sh.pal)); for (const k of sh.lod || [1]) px += (Math.round(R.w * k) + 2) * (Math.round(R.h * k) + 2) * nv; }
    return px;
  };
  for (const b of BIOMES) {
    const px = biomeSheets(b.id).filter((n) => !n.startsWith('boss')).reduce((a, n) => a + est(n), 0);
    assert.ok(px <= 200000, `${b.id} ${px}`);
  }
});
