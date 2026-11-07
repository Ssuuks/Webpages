/* 지역 보스 검사(그래픽 업그레이드 2) — node --test squad/tests/bosses.mjs
   보스는 그림만 바뀐다: 크기·닻·몸통 폭(총알 받는 띠)·예고 자세가 지금 보스와 같은 약속을 지키는지 잰다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEETS, PAL, OUT, WORLD_H, SEMANTIC, BOSS_POSE_NAMES, BOSS_SKIN, BOSS_CROWN, BOSS_FX, BOSS_TEXT, BOSS_TIER, SKIN, skinOf, biomeSheets, BIOME_ONLY } from '../assets/pix/art.js';
import { BOSS_POSE_NAMES as POSES_NEW } from '../assets/pix/bosses.js';
import { frameRaster, outline, downscale, deltaE } from '../assets/pix/raster.js';
import { BIOMES, bossNameOf } from '../assets/roster.js';
import * as Core from '../assets/core.js';

const BOSSES = [...new Set(Object.values(BOSS_SKIN))];
const raw = (name, f, pal) => frameRaster(SHEETS[name].frames[f], pal || SHEETS[name].pal);
const boxOf = (R) => { let l = 1e9, r = -1, t = 1e9, b = -1; for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) if (R.get(x, y)) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); } return { l, r, t, b }; };

test('지역마다 보스 시트·이름·효과 색이 있다', () => {
  assert.deepEqual(POSES_NEW, BOSS_POSE_NAMES, '자세 이름·순서 = art.js BOSS_POSES');
  for (const b of BIOMES) {
    const sheet = BOSS_SKIN[b.id];
    assert.ok(sheet && SHEETS[sheet], `${b.id}: 보스 시트`);
    assert.equal(skinOf('boss', b.id), sheet, `${b.id}: skinOf('boss')`);
    if (sheet !== 'boss') assert.ok(biomeSheets(b.id).includes(sheet) && BIOME_ONLY.has(sheet), `${b.id}: 그 지역에 갈 때 굽는다`);
    assert.ok(b.boss && b.boss.name && b.boss.title && b.boss.line, `${b.id}: roster 보스 글`);
    for (const k of ['name', 'title', 'line']) assert.equal(b.boss[k], BOSS_TEXT[b.id][k], `${b.id}.${k} = bosses.js BOSS_TEXT`);
    const fx = BOSS_FX[b.id];
    assert.ok(fx, `${b.id}: 효과 색`);
    for (const k of ['dust', 'enrage', 'death', 'spark']) assert.ok(Array.isArray(fx[k]) && fx[k].length >= 2, `${b.id}.${k}`);
    for (const k of ['ring', 'roar', 'band']) assert.match(fx[k], /^#[0-9A-F]{6}$/i, `${b.id}.${k}`);
    assert.ok(fx.steam && typeof fx.steam.c === 'string', `${b.id}.steam`);
    if (fx.shard) assert.ok(SHEETS[fx.shard], `${b.id}.shard 그림`);
    // 게이트 파랑은 효과에 쓰지 않는다(좋음 신호와 헷갈리지 않게)
    for (const c of [...fx.dust, ...fx.enrage, ...fx.death, ...fx.spark, fx.ring, fx.roar, fx.band, fx.steam.c]) for (const g of SEMANTIC.good) assert.ok(deltaE(c, g) >= 15, `${b.id}: ${c} ~ ${g}`);
  }
  assert.equal(bossNameOf(5, 'hard'), '정예 우락이');
  assert.equal(bossNameOf(60, 'super'), '대왕 곰곰이');
  assert.equal(bossNameOf(13, ''), '빙수');
  assert.equal(Core.levelTag(10).tag, 'super');
  assert.ok(BOSS_TIER.hard && BOSS_TIER.super && SHEETS[BOSS_TIER.hard.crown] && SHEETS[BOSS_TIER.super.crown]);
});

test('보스 시트: 108×104, 11자세, 지금 보스와 같은 닻·바닥 줄·rage·번쩍임·줄이기 단계', () => {
  const base = boxOf(raw('boss', 0));
  for (const name of BOSSES) {
    const sh = SHEETS[name];
    assert.equal(sh.frames.length, BOSS_POSE_NAMES.length, name);
    assert.ok(sh.flash && sh.alts && sh.alts.rage, `${name}: flash + rage`);
    assert.deepEqual(sh.lod, [1, 0.75, 0.5, 0.33], name);
    for (let f = 0; f < sh.frames.length; f++) {
      const R = raw(name, f);
      assert.equal(R.w, 108, `${name}[${f}] 폭`); assert.equal(R.h, 104, `${name}[${f}] 높이`);
      const O = outline(R, OUT);
      assert.equal(O.h, 106);
      const b = boxOf(R);
      assert.equal(b.b, base.b, `${name}[${f}] 발바닥 줄 ${b.b} ≠ ${base.b}(그림자·닻 자리)`);
      const ob = boxOf(O), ax = O.w >> 1;
      assert.ok(ax - ob.l <= 55 && ob.r + 1 - ax <= 55, `${name}[${f}] 상자`);
      // rage 변형은 의미 빨강과 겹치지 않는다
    }
  }
});

test('분노(rage)는 멀리서도 확 바뀐다: walk0 넓이 평균 ΔE ≥ 20, 모든 rage 색은 의미 빨강 넷 모두와 ΔE ≥ 15', () => {
  assert.equal(SEMANTIC.bad.length, 4, '의미 빨강 4색');
  for (const name of BOSSES) {
    const sh = SHEETS[name];
    const R0 = raw(name, 0), R1 = raw(name, 0, { ...sh.pal, ...sh.alts.rage });
    let d = 0, n = 0;
    for (let i = 0; i < R0.a.length; i++) if (R0.a[i]) { n++; d += deltaE(R0.a[i], R1.a[i]); }
    assert.ok(d / n >= 20, `${name}: base → rage 평균 ΔE ${(d / n).toFixed(1)} < 20(분노한 보스는 1.25배 빨라진다 — 0.5 단계에서도 읽혀야)`);
    for (const c of Object.values(sh.alts.rage)) for (const r of SEMANTIC.bad) assert.ok(deltaE(c, r) >= 15, `${name}.rage ${c} ~ ${r}`);
  }
});

test('보스 키: 걷기 꼭대기 ≤ 6줄(분노 김이 머리 위에서 뜨지 않게), 격자 위·옆 가장자리에서 잘린 덩어리 없음', () => {
  for (const name of BOSSES) {
    const R = raw(name, 0);
    assert.ok(boxOf(R).t <= 6, `${name}: walk0 꼭대기 ${boxOf(R).t}줄`);
    for (let f = 0; f < SHEETS[name].frames.length; f++) {
      const G = SHEETS[name].frames[f];
      // 0줄에 칠한 칸은 외곽선(K)이거나, 지금 보스처럼 둥근 끝(뿔) 몇 칸뿐 — 넓게 잘린 면(> 16칸)이 없다
      let cut = 0; for (const ch of G[0]) if (ch !== '.' && ch !== 'K') cut++;
      assert.ok(cut <= 16, `${name}[${f}] 0줄에 잘린 칸 ${cut}`);
    }
  }
});

test('정예 왕관: 테는 짙은 쇳빛(밝은 보스 위에서도 보인다), 깃털은 금·노랑이 아니다(금은 대왕만)', () => {
  const el = SHEETS.crown_elite, gold = SHEETS.crown_king.pal.y;
  for (const [bid, alt] of Object.entries(el.alts)) {
    assert.ok(deltaE(alt.p, gold) >= 25, `${bid} 깃털 ${alt.p} ~ 대왕 금 ${gold}`);
    const body = SHEETS[BOSS_SKIN[bid]].pal;
    for (const k of ['a', 's', 'c', 'b']) if (body[k]) assert.ok(deltaE(alt.I, body[k]) >= 15 || deltaE(alt.i, body[k]) >= 15, `${bid}: 왕관 테가 몸색 ${k}와 같다`);
  }
});

test('보스 몸통 = 총알 받는 띠(BOSS_HIT): 걷기 60~74줄 |x−54| ≤ 29 꽉 참, 허리띠 줄 ±26 이상', () => {
  for (const name of BOSSES) {
    const pxPerM = 104 / WORLD_H.boss;
    assert.ok(Core.BOSS_HIT * pxPerM >= 24 && Core.BOSS_HIT * pxPerM <= 34);
    for (const f of [0, 1, 2, 3]) {
      const R = raw(name, f);
      let cov = 0, tot = 0;
      for (let y = 60; y <= 74; y++) for (let x = 54 - 29; x <= 54 + 29; x++) { tot++; if (R.get(x, y)) cov++; }
      assert.ok(cov / tot >= 0.95, `${name}[${f}] 몸통 ${(cov / tot * 100).toFixed(0)}%`);
    }
    const R0 = raw(name, 0);
    for (let y = 74; y <= 78; y++) {
      let l = 54, r = 53;
      while (l > 0 && R0.get(l - 1, y)) l--;
      while (r < 107 && R0.get(r + 1, y)) r++;
      assert.ok(54 - l >= 26 && r + 1 - 54 >= 26, `${name}: 허리띠 줄 ${y} 반폭 ${54 - l}/${r + 1 - 54}`);
    }
  }
});

test('예고 자세: windup은 치는 것이 머리 위(y ≤ 20)로, slam은 땅(y ≥ 85)에', () => {
  const W = BOSS_POSE_NAMES.indexOf('windup'), S = BOSS_POSE_NAMES.indexOf('slam');
  for (const name of BOSSES) {
    const walk = raw(name, 0), up = raw(name, W), sl = raw(name, S);
    let gain = 0, low = 0;
    for (let y = 0; y <= 20; y++) for (let x = 0; x < 108; x++) if (up.get(x, y) && !walk.get(x, y)) gain++;
    for (let y = 85; y <= 101; y++) for (let x = 14; x <= 94; x++) if (sl.get(x, y) && !walk.get(x, y)) low++;
    assert.ok(gain >= 150, `${name} windup: y ≤ 20에 새로 생긴 픽셀 ${gain}`);
    assert.ok(low >= 80, `${name} slam: y ≥ 85에 새로 생긴 픽셀 ${low}`);
  }
});

test('왕관: 24×14 이하, 보스 상자 안(모든 자세)', () => {
  const STEPS4 = [1, 0.75, 0.5, 0.33];
  for (const cn of ['crown_elite', 'crown_king']) {
    const sh = SHEETS[cn];
    assert.deepEqual(sh.lod, STEPS4);
    for (const fr of sh.frames) { assert.ok(fr.length <= 14 && fr[0].length <= 24, `${cn} 크기`); }
  }
  for (const name of BOSSES) {
    const C = BOSS_CROWN[name];
    assert.ok(Array.isArray(C) && C.length === BOSS_POSE_NAMES.length, `${name}: 왕관 자리 11개`);
    C.forEach((c, f) => {
      if (!c) return;   // 그 자세에는 머리가 가려져 왕관을 그리지 않는다(눈덩이 등)
      for (const cn of ['crown_elite', 'crown_king']) {
        const O = outline(frameRaster(SHEETS[cn].frames[c[2]], SHEETS[cn].pal), OUT);
        const cb = boxOf(O);
        // 보스 외곽선 그림(110×106)의 닻(55, 105) 기준 → 왕관 닻(O.w >> 1, O.h - 1)
        const x0 = 55 + c[0] - (O.w >> 1) + cb.l, x1 = 55 + c[0] - (O.w >> 1) + cb.r, y0 = 105 + c[1] - (O.h - 1) + cb.t;
        assert.ok(x0 >= 0 && x1 < 110 && y0 >= 0, `${name}[${f}] ${cn}: x ${x0}..${x1} y ${y0}`);
      }
    });
  }
});

test('보스 그림이 굽힌다(마젠타 없음, 모든 lod, rage 포함)', () => {
  for (const name of [...BOSSES, 'crown_elite', 'crown_king']) {
    const sh = SHEETS[name];
    const pals = [sh.pal, ...Object.values(sh.alts || {})];
    for (const pal of pals) for (const fr of sh.frames) {
      const R = frameRaster(fr, pal);
      assert.ok(!R.a.includes('#FF00FF'), name);
      for (const k of sh.lod) assert.ok(downscale(R, k).count() > 0, `${name} ×${k}`);
    }
  }
  assert.ok(SKIN && typeof SKIN === 'object');
});

test('아틀라스 어림: 부팅(기본 + 사막) + 한 지역 ≤ 1024² 두 장 — 여섯 보스를 부팅 때 다 굽지 않는다', () => {
  // atlas.js bakeSteps와 같은 셈: 프레임 × 단계 × (기본 + 변형 + 흰 번쩍임), 외곽선 1px씩
  const est = (name) => {
    const sh = SHEETS[name];
    const nv = 1 + Object.keys(sh.alts || {}).length + (sh.flash ? 1 : 0);
    let px = 0;
    for (const fr of sh.frames) { const R = frameRaster(fr, typeof sh.pal === 'string' ? PAL[sh.pal] : sh.pal); for (const k of sh.lod || [1]) px += (Math.round(R.w * k) + 2) * (Math.round(R.h * k) + 2) * nv; }
    return px;
  };
  for (const b of BIOMES) if (BOSS_SKIN[b.id] !== 'boss') assert.ok(BIOME_ONLY.has(BOSS_SKIN[b.id]), `${b.id} 보스는 부팅 때 굽지 않는다`);
  const boot = Object.keys(SHEETS).filter((n) => !BIOME_ONLY.has(n));
  const bootPx = boot.reduce((a, n) => a + est(n), 0);
  for (const b of BIOMES) {
    const px = bootPx + biomeSheets(b.id).filter((n) => BIOME_ONLY.has(n)).reduce((a, n) => a + est(n), 0);
    assert.ok(px <= 2 * 1024 * 1024, `${b.id}: 부팅 + 지역 ${px}px`);
  }
});
