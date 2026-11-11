/* node --test squad/tests/endgame.mjs — 엔드게임(ENDGAME.md): 무한모드 · 회차 · 펫 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../assets/core.js';
import { BIOMES, biomeOf } from '../assets/roster.js';
import { makeBot } from './bots.mjs';
import { runEndless, median } from '../tools/endless.mjs';

const UP10 = { start: C.START_N + 20, fire: 10, hero: { id: 'mungchi', lv: 5 } };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
/* 봇 한 종류로 n판: 잡은 보스 수들 */
function reach(name, n, co = UP10, maxSeg = 30) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(runEndless({ seed: 77 + i * 13, ...co }, makeBot(name, 1000 + i, { skill: true }), maxSeg).bosses);
  return out;
}

/* ---------- 1회차 캠페인은 그대로 ---------- */
test('1회차 캠페인의 stateHash는 엔드게임을 넣기 전과 같다(SIM을 올리지 않는다) — L1~60, 기준 봇 + 사람 흉내 봇', () => {
  assert.equal(C.SIM, 9);
  assert.equal(C.VERSION, 'squad-v1');
  const out = [];
  for (let L = 1; L <= 60; L += 3) {
    const lv = C.prepareLevel(L);
    const co = C.expectLoadout(L);
    for (const pol of [(s) => C.botInput(s), C.humanBot(L * 7 + 1, 0.1, true)]) {
      const s = C.newGame(lv, co);
      assert.equal(s.endless, undefined, '캠페인 판에는 무한모드 상태가 없다');
      assert.equal(s.pet, undefined, '펫을 안 데려간 판에는 펫 상태가 없다');
      let x = 0;
      while ((s.phase === 'run' || s.phase === 'arena') && s.tick < 12000) { C.step(s, pol(s)); if (s.tick % 200 === 0) x = C.hash(x, C.stateHash(s)); }
      out.push(C.hash(x, C.stateHash(s), s.phase, s.squad.n));
    }
  }
  // 엔드게임 작업 전 코드(03a08f5)로 같은 식을 돌린 값
  assert.equal(C.hash(...out), BASE_HASH);
});
const BASE_HASH = 1057883470;

/* ---------- 무한모드 ---------- */
test('무한모드 구간: 지역은 차례로 돌고, 3번째는 정예·6번째는 대왕 — 가상 레벨이 그 지역·등급을 가리킨다', () => {
  for (let k = 1; k <= 18; k++) {
    const i = C.segInfo(k);
    assert.equal(i.biome, (k - 1) % 6);
    assert.equal(biomeOf(i.L).id, BIOMES[(k - 1) % 6].id, `구간 ${k}의 지역`);
    assert.equal(C.levelTag(i.L).tag, k % 6 === 0 ? 'super' : k % 6 === 3 ? 'hard' : '', `구간 ${k}의 등급`);
    assert.equal(i.loop, Math.floor((k - 1) / 6));
    assert.ok(i.L > 60 && i.L <= 120);
  }
  // 코인: 지역이 뒤로 갈수록, 정예·대왕일수록, 바퀴가 돌수록 많다
  assert.ok(C.segCoins(2) > C.segCoins(1) && C.segCoins(6) > C.segCoins(5) * 1.5 && C.segCoins(7) > C.segCoins(1));
  assert.equal(C.segCoins(1), 30);
});

test('무한모드 구간은 그 순간의 병력으로 만든다: 속도·예고는 캠페인 L30+ 값 그대로, 구간이 오를수록 위협 배수가 커진다', () => {
  const p30 = C.levelParams(30);
  for (const k of [1, 2, 3, 6, 9, 14]) {
    const p = C.segParams(k);
    assert.equal(p.speed, p30.speed, '이동 속도');
    assert.equal(p.slamWarn, p30.slamWarn, '내려찍기 예고');
    assert.equal(p.slamEvery, p30.slamEvery, '내려찍기 간격');
    assert.ok(p.slamWarn >= C.WARN_MIN);
  }
  assert.ok(C.segMul(8) > C.segMul(4) && C.segMul(4) > C.segMul(1));
  // 같은 입력 → 같은 구간, 병력이 다르면 숫자가 다르다
  const a = C.buildSegment(9, 2, 100, 1);
  const b = C.buildSegment(9, 2, 100, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  const big = C.buildSegment(9, 2, 400, 1);
  assert.ok(big.bossHp > a.bossHp * 2, '병력이 많으면 보스도 그만큼');
  assert.equal(a.rows[0].ng, 100);
  assert.equal(big.rows[0].ng, 400);
  // 한 구간: 청크 6~8개, 보스 직전 줄에 ×2 하나, 높인 빨간 칸(MAX)은 없다
  for (let seed = 1; seed <= 20; seed++) {
    for (const k of [1, 3, 6, 8]) {
      const lv = C.buildSegment(seed, k, 60 * k, 0);
      assert.ok(lv.plan.length >= 6 && lv.plan.length <= 8, `청크 ${lv.plan.length}`);
      const muls = lv.rows.flatMap((r) => r.cells).filter((c) => c.op === 'mul');
      assert.ok(muls.length <= 1, '×는 많아야 하나');
      assert.ok(lv.rows.every((r) => r.cells.every((c) => c.cap0 == null && c.fast == null)));
      assert.ok(lv.bossHp > 0 && lv.arenaZ > 250 && lv.arenaZ < 480, `길이 ${lv.arenaZ}`);
      // 골든 패스의 순성장은 구간당 3배 아래(보스 직전 ×2 + 작은 덧셈)
      const g = lv.golden[lv.golden.length - 1] / lv.startE;
      assert.ok(g < 3.2, `순성장 ×${g.toFixed(2)}`);
    }
  }
  // 뒤처진 분대(바닥선 아래)에게는 적이 그만큼 약해지지 않는다
  assert.equal(C.segFloor(1), 0);
  assert.ok(C.segFloor(5) > C.segFloor(3));
  const weak = C.buildSegment(9, 5, 20, 0);
  const onPace = C.buildSegment(9, 5, C.segFloor(5), 0);
  assert.ok(weak.refMul > onPace.refMul * 2, '바닥선 아래면 위협 배수가 크다');
});

test('무한모드: 보스를 잡으면 판이 끝나지 않고 다음 구간이 이어진다 — 병력·무기·특수병·게이지를 들고 간다', () => {
  const s = C.newEndless({ seed: 5, ...UP10 });
  assert.equal(s.endless.seg, 1);
  assert.equal(s.phase, 'run');
  let clear = null;
  let start = null;
  let before = null;
  while (s.phase !== 'lost' && s.tick < 20000 && !start) {
    C.step(s, C.botInput(s));
    for (const e of s.ev) {
      if (e.t === 'segClear') { clear = { ...e, tick: s.tick }; before = { n: s.squad.n, tier: s.squad.tier, sp: s.squad.sp.map((m) => m.k + m.lv).join(), z: s.squad.z }; }
      if (e.t === 'segStart') start = { ...e, tick: s.tick };
      assert.notEqual(e.t, 'win', '무한모드에는 승리 화면이 없다');
    }
  }
  assert.ok(clear && start, '첫 보스를 잡고 다음 구간으로');
  assert.equal(clear.seg, 1);
  assert.equal(clear.coins, C.segCoins(1));
  assert.equal(start.seg, 2);
  assert.ok(start.tick - clear.tick >= Math.round(C.ENDLESS.wait / C.DT) - 1, '쓰러지는 연출 뒤에 이어진다');
  assert.equal(s.phase, 'run');
  assert.equal(s.boss, null);
  assert.equal(s.endless.bosses, 1);
  assert.equal(s.endless.bank, C.segCoins(1));
  assert.equal(s.L, C.segInfo(2).L);
  assert.equal(s.squad.tier, before.tier);
  assert.equal(s.squad.sp.map((m) => m.k + m.lv).join(), before.sp);
  assert.ok(s.squad.n >= before.n, '병력 그대로(회복 풀이 돌아오면 더)');
  assert.ok(s.rows.length >= 2 && s.rows.every((r) => !r.done && r.z > s.squad.z + 30), '새 구간의 줄은 모두 앞에');
  assert.ok(s.foes.every((f) => f.z > s.squad.z) && s.props.every((p) => p.z > s.squad.z));
  assert.equal(s.rows[0].ng, s.squad.n, '다음 구간의 숫자는 지금 병력 기준');
  assert.ok(s.arenaZ > s.squad.z + 250 && s.stopZ === s.arenaZ + 6);
  assert.ok(C.progress(s) < 0.05, '진행 막대는 구간마다 처음부터');
  // 코인: 죽어도 적립한 만큼 받는다(보급 강화 %)
  assert.equal(C.endlessCoins(s, 0), s.endless.bank + Math.floor(s.stats.kills / 10) + s.stats.coins);
  assert.ok(C.endlessCoins(s, 100) > C.endlessCoins(s, 0));
});

test('무한모드 결정성: 같은 시드·같은 입력이면 구간을 넘겨도 같은 해시, 시드가 다르면 다른 판', () => {
  const play = (seed) => {
    const s = C.newEndless({ seed, ...UP10 });
    const pol = makeBot('sloppy0.1', 3, { skill: true });
    const hs = [];
    while (s.phase !== 'lost' && s.endless.bosses < 3 && s.tick < 30000) { C.step(s, pol(s)); if (s.tick % 120 === 0) hs.push(C.stateHash(s)); }
    hs.push(C.stateHash(s), s.endless.bosses);
    return hs;
  };
  const a = play(11);
  assert.deepEqual(a, play(11));
  assert.notDeepEqual(a.slice(0, 20), play(12).slice(0, 20));
  assert.ok(a[a.length - 1] >= 1, '구간을 하나 이상 넘겼다');
});

test('무한모드 이어하기: 구간을 넘긴 뒤 저장·복원한 판은 원래 판과 매 틱 똑같이 흘러가고, 상태 크기는 구간이 올라도 한계 안', () => {
  const s = C.newEndless({ seed: 21, ...UP10, hero: { id: 'bori', lv: 5 } });
  let size1 = 0;
  let maxSize = 0;
  let checked = 0;
  const sizeOf = (st) => JSON.stringify(C.snapshot(st)).length;
  const follow = (ticks) => {
    const t = C.restore(JSON.parse(JSON.stringify(C.snapshot(s))));
    assert.ok(t && t.endless, '복원');
    assert.equal(C.stateHash(t), C.stateHash(s));
    for (let i = 0; i < ticks && s.phase !== 'lost'; i++) {
      const inp = C.botInput(s);
      C.step(s, inp);
      C.step(t, inp);
      assert.equal(C.stateHash(t), C.stateHash(s), `복원한 판이 ${i}틱 뒤 갈라졌다`);
    }
    checked++;
  };
  let lastSeg = 1;
  while (s.phase !== 'lost' && s.endless.bosses < 7 && s.tick < 60000) {
    C.step(s, C.botInput(s));
    if (s.tick % 600 === 0) {
      const z = sizeOf(s);
      if (s.endless.seg === 1) size1 = Math.max(size1, z);
      maxSize = Math.max(maxSize, z);
      assert.ok(s.rows.length <= 8 && s.foes.length <= 220 && s.props.length <= 12 && s.bullets.length <= 400, `구간 ${s.endless.seg}: 줄 ${s.rows.length} 적 ${s.foes.length} 소품 ${s.props.length}`);
    }
    if (s.endless.seg !== lastSeg) { lastSeg = s.endless.seg; follow(900); }          // 구간이 막 바뀐 틱에서
    if (s.boss && s.boss.dead && s.endless.wait > 0.5 && checked < 12 && s.tick % 7 === 0) follow(200);   // 보스가 쓰러지는 연출 중에도
  }
  assert.ok(s.endless.bosses >= 3, `기준 봇은 3구간을 넘는다(${s.endless.bosses})`);
  assert.ok(checked >= 4);
  assert.ok(maxSize < 160000 && maxSize < size1 * 2.5, `스냅숏 ${maxSize}자(1구간 ${size1}자)`);
  // 캠페인 스냅숏을 무한모드로, 망가진 무한모드 상태를 되살리지 않는다
  const snap = JSON.parse(JSON.stringify(C.snapshot(s)));
  snap.endless = 3;
  assert.equal(C.restore(snap), null);
});

test('무한모드 공정성: 구간이 올라가도 모든 내려찍기 예고는 fairWarn·slamFairWarn 이상', () => {
  let checked = 0;
  for (const [seed, name] of [[3, 'strong'], [4, 'sloppy0.1'], [5, 'sloppy0.3'], [6, 'hold4.4'], [7, 'expert']]) {
    const s = C.newEndless({ seed, start: C.START_N + 60, fire: 30, hero: { id: 'nabi', lv: 5 } });
    const pol = makeBot(name, seed, { skill: true });
    while (s.phase !== 'lost' && s.endless.bosses < 10 && s.tick < 50000) {
      const R = C.radius(s.squad.n);
      const parts = s.params.slamThird ? 3 : 2;
      C.step(s, pol(s));
      for (const e of s.ev) {
        if (e.t !== 'slamWarn') continue;
        const laneW = (2 * C.ROAD) / parts;
        const d = C.slamDodgeDist(s.squad.x, R, e.x0, e.x1);
        assert.ok(e.warn >= C.WARN_MIN - 1e-9 && e.warn >= C.fairWarn(d, laneW) - 1e-9, `구간 ${s.endless.seg} 예고 ${e.warn.toFixed(2)}초, 피할 거리 ${d.toFixed(2)}m`);
        assert.ok(e.warn >= C.slamFairWarn(s.squad.x, s.squad.vx, R, e.x0, e.x1, laneW) - 1e-9, `구간 ${s.endless.seg} 움직이는 분대 예고`);
        checked++;
      }
      assert.ok(s.speed <= C.levelParams(30).speed + 1e-9);
    }
  }
  assert.ok(checked >= 60, `예고 ${checked}번`);
});

test('무한모드 난이도(봇): 기대 강화 10단계·영웅 Lv5 — 집중한 사람은 중앙값 4~8구간, 산만한 사람은 2~4구간, 가만히·마구는 첫 보스를 못 넘는다', () => {
  const on = reach('sloppy0.1', 24);
  const sl = reach('sloppy0.3', 24);
  assert.ok(median(on) >= 4 && median(on) <= 8, `집중한 사람 중앙값 ${median(on)} (${on.join(',')})`);
  assert.ok(median(sl) >= 2 && median(sl) <= 4, `산만한 사람 중앙값 ${median(sl)} (${sl.join(',')})`);
  assert.ok(mean(on) > mean(sl) + 1, '집중할수록 멀리 간다');
  const idle = reach('idle', 24, UP10, 2);
  const rnd = reach('random', 24, UP10, 2);
  assert.ok(idle.filter((b) => b > 0).length === 0, `가만히 서 있기가 첫 보스를 넘은 판 ${idle.filter((b) => b > 0).length}/24`);
  assert.ok(rnd.filter((b) => b > 0).length <= 3, `마구 움직이기가 첫 보스를 넘은 판 ${rnd.filter((b) => b > 0).length}/24`);
  for (const x of [-4.4, -2.5, 2.5, 4.4]) {
    const h = reach('hold' + x, 16, UP10, 2);
    assert.ok(h.filter((b) => b > 0).length <= 3, `x=${x}에 서 있기만 해서 첫 보스를 넘은 판 ${h.filter((b) => b > 0).length}/16`);
  }
});

test('무한모드: 강화가 10단계 오를 때마다 더 멀리 간다(평균 +1~3.5구간)', () => {
  const at = (up) => mean(reach('sloppy0.1', 24, { start: C.START_N + 2 * up, fire: up, hero: { id: 'mungchi', lv: 5 } }));
  const a = at(10);
  const b = at(20);
  const c = at(30);
  assert.ok(b - a >= 1 && b - a <= 3.5, `10 → 20단계: ${a.toFixed(2)} → ${b.toFixed(2)}`);
  assert.ok(c - b >= 1 && c - b <= 3.5, `20 → 30단계: ${b.toFixed(2)} → ${c.toFixed(2)}`);
});
