/* node --test squad/tests/  — DOM 없이 규칙·레벨 생성·봇 밸런스를 확인한다 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../assets/core.js';
import { load, save, wipe, upgCost, UPGRADES } from '../assets/store.js';

const MAX_LEVEL = 40;

function run(lv, policy, opt = {}) {
  const s = C.newGame(lv, { start: opt.start ?? C.START_N, fire: opt.fire ?? 0 });
  const max = Math.ceil((lv.arenaZ / lv.speed + 80) / C.DT);
  while ((s.phase === 'run' || s.phase === 'arena') && s.tick < max) C.step(s, policy(s));
  return s;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* 사람 흉내 봇: 0.3초 늦게 반응하고, 게이트를 쏴서 올리는 효과는 모른 채 겉보기 숫자로 고르고, 상자는 무시하고, 가끔 엉뚱한 곳으로 간다 */
function sloppy(seed, err = 0.1) {
  const r = rng(seed);
  const hist = [];
  let wrongUntil = -1;
  let wrongX = 0;
  return (s) => {
    hist.push(C.botTarget(s, { pump: false, crates: false }));
    let tx = hist.length > 18 ? hist[hist.length - 19] : 0;
    if (s.tick % 60 === 0 && r() < err) { wrongUntil = s.tick + 30 + Math.floor(r() * 40); wrongX = (r() * 2 - 1) * 4; }
    if (s.tick < wrongUntil) tx = wrongX;
    return C.steer(s, tx);
  };
}
const idle = () => ({ dir: 0, tx: null });
function random(seed) {
  const r = rng(seed);
  let tx = 0;
  return (s) => { if (s.tick % 50 === 0) tx = (r() * 2 - 1) * 4.4; return C.steer(s, tx); };
}

test('게이트 계산: 덧셈·곱셈·나눗셈(올림)과 상한', () => {
  assert.equal(C.applyOp(10, 'add', 5), 15);
  assert.equal(C.applyOp(10, 'add', -15), -5);
  assert.equal(C.applyOp(7, 'mul', 2), 14);
  assert.equal(C.applyOp(7, 'div', 2), 4, '÷2는 올림이라 0이 되지 않는다');
  assert.equal(C.applyOp(1, 'div', 2), 1);
  assert.equal(C.applyOp(9000, 'mul', 3), C.MAX_N);
  assert.equal(C.cellLabel({ op: 'add', v: -12 }), '−12');
  assert.equal(C.cellLabel({ op: 'mul', v: 2 }), '×2');
  assert.equal(C.cellGood({ op: 'add', v: 0 }), 0);
  assert.equal(C.cellGood({ op: 'div', v: 2 }), -1);
});

test('보기 좋은 숫자 반올림', () => {
  assert.equal(C.nice(13.4), 13);
  assert.equal(C.nice(47), 45);
  assert.equal(C.nice(-133), -130);
  assert.equal(C.nice(1234), 1250);
});

test('접촉 비용: 남은 체력 10마다 1명, 최소 1명', () => {
  assert.equal(C.contactCost(0.5), 1);
  assert.equal(C.contactCost(10), 1);
  assert.equal(C.contactCost(10.1), 2);
  assert.equal(C.contactCost(95), 10);
});

test('레벨은 레벨 번호로만 정해진다(같은 레벨은 늘 같은 배치)', () => {
  for (const L of [1, 7, 23]) {
    const a = C.buildLevel(L);
    const b = C.buildLevel(L);
    assert.deepEqual(a.rows, b.rows);
    assert.deepEqual(a.foes, b.foes);
    assert.deepEqual(a.props, b.props);
  }
  assert.notDeepEqual(C.buildLevel(3).rows, C.buildLevel(4).rows);
});

test('결정성: 같은 입력이면 같은 상태', () => {
  const lv = C.prepareLevel(9);
  const script = (s) => ({ dir: Math.floor(s.tick / 45) % 3 - 1, tx: null });
  const hashes = (policy) => {
    const s = C.newGame(lv, {});
    const out = [];
    while ((s.phase === 'run' || s.phase === 'arena') && s.tick < 9000) {
      C.step(s, policy(s));
      if (s.tick % 60 === 0) out.push(C.stateHash(s));
    }
    return out;
  };
  assert.deepEqual(hashes(script), hashes(script));
  assert.deepEqual(hashes(C.botInput), hashes(C.botInput));
});

test('시뮬레이션은 넘겨준 레벨을 바꾸지 않는다', () => {
  const lv = C.prepareLevel(5);
  const before = JSON.stringify([lv.rows, lv.foes, lv.props, lv.saws]);
  run(lv, C.botInput);
  assert.equal(JSON.stringify([lv.rows, lv.foes, lv.props, lv.saws]), before);
});

test('첫 레벨 첫 게이트는 +10 대 −5', () => {
  const lv = C.buildLevel(1);
  assert.deepEqual(lv.rows[0].cells.map(C.cellLabel), ['+10', '−5']);
});

test('레벨 생성 규칙 (L1~60)', () => {
  for (let L = 1; L <= 60; L++) {
    const lv = C.buildLevel(L);
    const p = lv.params;
    assert.ok(lv.rows.length >= 2, `L${L}: 게이트 줄이 너무 적음`);
    assert.equal(lv.plan[0], 'gate', `L${L}: 첫 청크는 게이트`);
    assert.equal(lv.plan[lv.plan.length - 1], 'gate', `L${L}: 보스 직전은 게이트`);
    let muls = 0;
    let lessBad = 0;
    for (const row of lv.rows) {
      assert.ok(row.cells.length >= 1 && row.cells.length <= 3);
      // 칸은 도로를 빈틈없이 덮는다
      assert.equal(row.cells[0].x0, -C.ROAD);
      assert.equal(row.cells[row.cells.length - 1].x1, C.ROAD);
      for (let i = 1; i < row.cells.length; i++) assert.ok(Math.abs(row.cells[i].x0 - row.cells[i - 1].x1) < 1e-9);
      for (const c of row.cells) {
        assert.ok(Number.isFinite(c.v) && c.v !== 0, `L${L}: 값 ${c.v}`);
        if (c.op === 'mul') muls++;
        if (c.op === 'add') assert.ok(c.step > 0 && c.cap > c.v);
        if (c.op === 'mul' && c.v === 3) assert.ok(L >= C.UNLOCK.mul3);
        if (c.op === 'div') assert.ok(L >= C.UNLOCK.div);
      }
      if (row.cells.length > 1 && row.cells.every((c) => C.cellGood(c) < 0)) lessBad++;
    }
    assert.ok(muls <= p.maxMul + 1, `L${L}: × 게이트 ${muls}개`);
    assert.ok(lessBad <= 1, `L${L}: '덜 나쁜 쪽' 줄 ${lessBad}개`);
    // 처음 소개되는 메커닉이 너무 일찍 나오지 않는다
    for (const f of lv.foes) {
      if (f.kind === 'runner') assert.ok(L >= C.UNLOCK.runner);
      if (f.kind === 'brute') assert.ok(L >= C.UNLOCK.brute);
      if (f.kind === 'spit') assert.ok(L >= C.UNLOCK.spit);
    }
    if (lv.saws.length) assert.ok(L >= C.UNLOCK.saw);
    if (lv.props.some((x) => x.kind === 'crate')) assert.ok(L >= C.UNLOCK.crate);
    if (lv.props.some((x) => x.kind === 'wall')) assert.ok(L >= C.UNLOCK.wall);
    assert.ok(lv.arenaZ > 300 && lv.arenaZ < 760, `L${L}: 길이 ${lv.arenaZ}`);
  }
});

test(`기준 봇이 강화 없이 L1~${MAX_LEVEL}을 모두 깬다(보정 실패 없음)`, () => {
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const lv = C.prepareLevel(L);
    assert.ok(!lv.failed, `L${L} 보정 실패`);
    const s = run(lv, C.botInput);
    assert.equal(s.phase, 'won', `L${L}: ${s.phase} (${s.cause})`);
    assert.ok(s.squad.n >= lv.par * 0.95, `L${L}: 기준 봇 결과가 별 기준과 어긋남`);
    assert.ok(Number.isFinite(s.squad.x) && Number.isFinite(s.squad.z));
    assert.ok(s.squad.n <= C.MAX_N);
  }
});

test('사람 흉내 봇도 대부분 깬다 — 초반은 거의 다, 후반은 절반 넘게', () => {
  const rate = (from, to) => {
    let win = 0;
    let all = 0;
    for (let L = from; L <= to; L++) {
      const lv = C.prepareLevel(L);
      for (let k = 0; k < 4; k++) { all++; if (run(lv, sloppy(L * 100 + k)).phase === 'won') win++; }
    }
    return win / all;
  };
  const early = rate(1, 20);
  const late = rate(21, MAX_LEVEL);
  assert.ok(early >= 0.85, `L1~20 승률 ${early}`);
  assert.ok(late >= 0.55, `L21~${MAX_LEVEL} 승률 ${late}`);
});

test('선택이 중요하다 — 가만히 있거나 마구 움직이면 진다', () => {
  let idleWins = 0;
  let idleAll = 0;
  for (let L = 3; L <= MAX_LEVEL; L++) { idleAll++; if (run(C.prepareLevel(L), idle).phase === 'won') idleWins++; }
  assert.ok(idleWins / idleAll <= 0.25, `가만히 있기 승률 ${idleWins}/${idleAll}`);
  let rw = 0;
  let ra = 0;
  for (let L = 15; L <= MAX_LEVEL; L++) for (let k = 0; k < 3; k++) { ra++; if (run(C.prepareLevel(L), random(L * 31 + k)).phase === 'won') rw++; }
  assert.ok(rw / ra <= 0.15, `마구 움직이기 승률 ${rw}/${ra}`);
});

test('강화는 도움이 된다', () => {
  const lv = C.prepareLevel(25);
  let base = 0;
  let boosted = 0;
  for (let k = 0; k < 4; k++) {
    base += run(lv, sloppy(900 + k)).squad.n;
    boosted += run(lv, sloppy(900 + k), { start: C.START_N + 20, fire: 10 }).squad.n;
  }
  assert.ok(boosted > base, `강화 전 ${base}, 후 ${boosted}`);
});

test('별과 코인', () => {
  const lv = C.prepareLevel(4);
  const g = C.starGoals(lv);
  assert.ok(g.two < g.three && g.three <= lv.par);
  assert.equal(C.starsFor(lv, 1, false), 0);
  assert.equal(C.starsFor(lv, 1, true), 1);
  assert.equal(C.starsFor(lv, g.two, true), 2);
  assert.equal(C.starsFor(lv, g.three, true), 3);
  const s = run(lv, C.botInput);
  const won = C.coinsFor(lv, s, true, 3);
  const lost = C.coinsFor(lv, s, false, 0);
  assert.ok(won > lost && lost >= 0);
  assert.ok(C.coinsFor(lv, s, true, 3, 50) > won, '보급 강화는 코인을 늘린다');
});

test('패배 원인이 기록된다', () => {
  const lv = C.prepareLevel(12);
  const s = run(lv, idle);
  if (s.phase === 'lost') assert.ok(['gate', 'foe', 'brute', 'wall', 'saw', 'spit', 'boss'].includes(s.cause), s.cause);
});

test('보정은 빠르다(휴대폰에서도 레벨 시작이 늦지 않게)', () => {
  const t0 = performance.now();
  for (const L of [61, 62, 63]) C.prepareLevel(L);
  const ms = (performance.now() - t0) / 3;
  assert.ok(ms < 400, `레벨당 ${ms.toFixed(0)}ms`);
});

test('저장: 저장소가 없어도 돌고, 강화 비용은 오른다', () => {
  const d = load();
  assert.equal(d.maxL, 1);
  d.coins = 77;
  save(d);
  assert.equal(load().coins, 77, '메모리 대체 저장');
  assert.equal(wipe().coins, 0);
  for (const u of UPGRADES) assert.ok(u.effect(0) && u.effect(u.max));
  for (let i = 1; i < 10; i++) assert.ok(upgCost(i) > upgCost(i - 1));
});
