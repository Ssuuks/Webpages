/* node --test squad/tests/  — DOM 없이 규칙·레벨 생성·봇 밸런스를 확인한다 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../assets/core.js';
import { load, save, wipe, upgCost, UPGRADES } from '../assets/store.js';
import { HERO_IDS, heroCap } from '../assets/roster.js';

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

test('첫 레벨 첫 게이트는 +10 대 −5이고, 손대지 않은 분대(x=0)는 왼쪽 +10을 지난다', () => {
  const lv = C.buildLevel(1);
  assert.deepEqual(lv.rows[0].cells.map(C.cellLabel), ['+10', '−5']);
  assert.equal(C.pickCell(lv.rows[0], 0), 0);
  assert.equal(C.pickCell(lv.rows[0], 0.01), 1);
});

test('레벨 카드가 소개하는 메커닉은 그 레벨에 꼭 나온다', () => {
  const present = (lv, m) => {
    const cells = lv.rows.flatMap((r) => r.cells);
    switch (m) {
      case 'mul': return cells.some((c) => c.op === 'mul');
      case 'mul3': return cells.some((c) => c.op === 'mul' && c.v === 3);
      case 'div': return cells.some((c) => c.op === 'div');
      case 'triple': return lv.rows.some((r) => r.cells.length === 3);
      case 'shoot': return lv.rows.some((r) => r.cells.length === 1);
      case 'wall': return lv.props.some((p) => p.kind === 'wall');
      case 'crate': return lv.props.some((p) => p.kind === 'crate');
      case 'saw': return lv.saws.length > 0;
      case 'runner': case 'brute': case 'spit': return lv.foes.some((f) => f.kind === m);
      default: return true;
    }
  };
  for (const m of Object.keys(C.UNLOCK)) {
    const lv = C.prepareLevel(C.UNLOCK[m]);
    assert.ok(present(lv, m), `L${C.UNLOCK[m]}에 ${m}이(가) 없음`);
    assert.deepEqual(lv.missing, []);
  }
});

test('보스 직전 줄은 ×2로 크게 불릴 기회가 있다(L3부터)', () => {
  for (let L = 3; L <= 40; L++) {
    const last = C.buildLevel(L).rows.at(-1);
    assert.ok(last.cells.some((c) => c.op === 'mul'), `L${L} 마지막 줄 ${last.cells.map(C.cellLabel).join('|')}`);
  }
});

test('보스 경기 규칙: 졸개는 분대 코앞에 생기지 않고, 맞붙으면 내려찍기 예고는 사라진다', () => {
  const lv = C.prepareLevel(12);
  const s = C.newGame(lv, {});
  while (s.phase === 'run') C.step(s, C.botInput(s));
  const arena = structuredClone(s);
  s.squad.n = 15;   // 약한 분대로 가만히 있으면 진다
  let minGap = Infinity;
  while (s.phase === 'arena' && s.tick < 40000) {
    C.step(s, { dir: 0, tx: null });
    for (const e of s.ev) if (e.t === 'summon') for (const f of s.foes.slice(-e.n)) minGap = Math.min(minGap, f.z - s.squad.z);
  }
  assert.ok(minGap > 3, `졸개가 ${minGap.toFixed(2)} 앞에 생김`);
  assert.equal(s.phase, 'lost');
  assert.ok(['boss', 'summon'].includes(s.cause), s.cause);
  // 예고 중에 보스가 닿으면 예고는 지워진다
  arena.boss.slam = { x0: -5, x1: 0, t: 0.5, T: 1 };
  arena.boss.z = arena.squad.z;
  C.step(arena, { dir: 0, tx: null });
  assert.ok(arena.boss.clash);
  assert.equal(arena.boss.slam, null);
});

test('비켜 간 벽은 지나갈 때까지 남아 있고, 마지막 병사가 쓰러진 틱에는 아무것도 되살리지 못한다', () => {
  const lv = C.prepareLevel(3);
  const s = C.newGame(lv, {});
  let passed = 0;
  while (s.phase === 'run') {
    C.step(s, C.botInput(s));
    for (const p of s.props) if (p.passed) { assert.ok(p.alive); passed++; }
  }
  assert.ok(passed > 0, '봇이 피해 간 벽이 하나는 있어야 한다');
  // 병사 1명, 바로 앞에 좀비, 총알 하나로 열리는 지원병 상자
  const t = C.newGame(C.prepareLevel(6), {});
  t.squad.n = 1;
  t.foes.unshift({ id: 9999, kind: 'grunt', x: t.squad.x, z: t.squad.z + 0.3, hp: 5, max: 5, alive: true, awake: true, hitT: -9, cd: 0, seed: 0, r: 0.42, spd: 2.6, home: 0.9, homeDist: 18 });
  t.props.push({ id: 9998, kind: 'crate', x0: -1, x1: 1, z: t.squad.z + 1, hp: 0.001, max: 1, alive: true, hitT: -9, reward: { type: 'men', v: 10 } });
  t.bullets.push({ x: 0, z: t.squad.z + 0.9, d: 0, dmg: 5 });
  C.step(t, { dir: 0, tx: null });
  assert.equal(t.phase, 'lost');
  assert.equal(t.squad.n, 0);
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
    assert.ok(lv.arriveWeak >= 1, `L${L}: 약한 기준 봇이 보스까지 못 감`);
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
  const g = C.starGoals(lv.par);
  assert.ok(g.two < g.three && g.three <= lv.par);
  assert.equal(C.starsFor(lv.par, 1, false), 0);
  assert.equal(C.starsFor(lv.par, 1, true), 1);
  assert.equal(C.starsFor(lv.par, g.two, true), 2);
  assert.equal(C.starsFor(lv.par, g.three, true), 3);
  // 강화를 달면 별 기준도 같이 오른다(강화는 이기기 쉽게, 별은 실력으로)
  assert.ok(C.parFor(lv, C.START_N + 20, 10) > lv.par);
  assert.equal(C.parFor(lv), lv.par);
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

/* ---------- v2: 특수병과·영웅·이어하기 ---------- */
function arena(L, opt = {}) {
  const lv = C.prepareLevel(L);
  const s = C.newGame(lv, opt);
  while (s.phase === 'run') C.step(s, C.botInput(s));
  return { lv, s };
}

test('금색 특수병 칸: +v와 특수병 합류, 같은 병과·자리 초과는 병사로', () => {
  assert.equal(C.applyOp(10, 'unit', 5), 15);
  assert.equal(C.cellGood({ op: 'unit', v: 5, k: 'medic' }), 1);
  assert.equal(C.cellLabel({ op: 'unit', v: 5, k: 'medic' }), '+5');
  const s = C.newGame(C.prepareLevel(9), {});
  s.squad.n = 60;
  const row = { id: 1, z: 0.05, done: false, cells: [{ ...C.makeCell('unit', 5, 60, -5, 5), k: 'sniper' }] };
  s.rows = [row];
  C.step(s, { dir: 0 });
  assert.equal(s.squad.n, 65);
  assert.deepEqual(s.squad.sp.map((m) => m.k), ['sniper']);
  // 같은 병과는 병사로
  s.rows = [{ id: 2, z: s.squad.z + 0.01, done: false, cells: [{ ...C.makeCell('unit', 5, 60, -5, 5), k: 'sniper' }] }];
  C.step(s, { dir: 0 });
  assert.equal(s.squad.sp.length, 1);
  assert.ok(s.ev.some((e) => e.t === 'spFull'));
});

test('곱셈·나눗셈은 특수병을 바꾸지 않고, 병사가 너무 적으면 특수병이 떠난다', () => {
  const s = C.newGame(C.prepareLevel(9), {});
  s.squad.n = 14;
  s.squad.sp = [{ id: 1, k: 'medic', cd: 1 }, { id: 2, k: 'sniper', cd: 1 }, { id: 3, k: 'rocket', cd: 1 }];
  s.rows = [{ id: 1, z: s.squad.z + 0.01, done: false, cells: [C.makeCell('div', 2, 14, -5, 5)] }];
  C.step(s, { dir: 0 });
  assert.equal(s.squad.n, 7);
  assert.equal(s.squad.sp.length, 1, '7명 < 4×2 → 둘이 떠남');
  assert.ok(s.ev.filter((e) => e.t === 'spLose' && e.cause === 'escort').length === 2);
});

test('큰 타격은 특수병을 쓰러뜨리지만 게이트·톱날 손실은 아니다', () => {
  const s = C.newGame(C.prepareLevel(9), {});
  s.squad.n = 100;
  s.squad.sp = [{ id: 1, k: 'medic', cd: 1 }, { id: 2, k: 'sniper', cd: 1 }];
  s.props = [{ id: 5, kind: 'wall', x0: -5, x1: 5, z: s.squad.z + 0.2, hp: 400, max: 400, alive: true, hitT: -9 }];
  C.step(s, { dir: 0 });
  assert.ok(s.squad.n <= 60);
  assert.equal(s.squad.sp.length, 1);
  const t = C.newGame(C.prepareLevel(9), {});
  t.squad.n = 100;
  t.squad.sp = [{ id: 1, k: 'medic', cd: 1 }];
  t.rows = [{ id: 1, z: t.squad.z + 0.01, done: false, cells: [C.makeCell('add', -40, 100, -5, 5)] }];
  C.step(t, { dir: 0 });
  assert.equal(t.squad.n, 60);
  assert.equal(t.squad.sp.length, 1, '게이트 손실은 특수병을 쓰러뜨리지 않는다');
});

test('의무병: 적에게 잃은 병사의 일부가 돌아오고 게이트 손실은 돌아오지 않는다', () => {
  const lv = C.prepareLevel(9);
  const base = C.newGame(lv, {});
  base.foes = [];
  base.props = [];
  base.saws = [];
  base.rows = [];
  base.squad.n = 200;
  base.squad.sp = [{ id: 1, k: 'medic', cd: 1 }];
  const bite = (s) => { for (let i = 0; i < 10; i++) s.foes.push({ id: 100 + i, kind: 'grunt', x: s.squad.x, z: s.squad.z + 0.3, hp: 50, max: 50, alive: true, awake: true, hitT: -9, cd: 0, seed: 0, r: 0.42, spd: 0, home: 0, homeDist: 0 }); };
  const s = structuredClone(base);
  bite(s);
  C.step(s, { dir: 0 });
  const lost = 200 - s.squad.n;
  assert.ok(lost >= 40, `잃은 수 ${lost}`);
  for (let i = 0; i < 600; i++) C.step(s, { dir: 0 });
  const back = s.squad.n - (200 - lost);
  assert.ok(Math.abs(back - Math.round(lost * 0.4)) <= 2, `돌아온 수 ${back} / 잃은 ${lost}`);
  const g = structuredClone(base);
  g.rows = [{ id: 1, z: g.squad.z + 0.01, done: false, cells: [C.makeCell('add', -50, 200, -5, 5)] }];
  for (let i = 0; i < 600; i++) C.step(g, { dir: 0 });
  assert.equal(g.squad.n, 150);
});

test('저격수는 다른 차선의 독침 좀비를 먼저 쏘고, 로켓은 무리를 터뜨린다', () => {
  const s = C.newGame(C.prepareLevel(13), {});
  s.foes = [
    { id: 1, kind: 'grunt', x: 0, z: s.squad.z + 20, hp: 20, max: 20, alive: true, awake: false, hitT: -9, cd: 0, seed: 0, r: 0.42, spd: 0, home: 0, homeDist: 0 },
    { id: 2, kind: 'spit', x: 4, z: s.squad.z + 25, hp: 20, max: 20, alive: true, awake: false, hitT: -9, cd: 9, seed: 0, r: 0.5, spd: 0, home: 0, homeDist: 0 },
  ];
  s.rows = [];
  s.props = [];
  s.squad.sp = [{ id: 7, k: 'sniper', cd: 0 }];
  C.step(s, { dir: 0 });
  const sn = s.ev.find((e) => e.t === 'snipe');
  assert.ok(sn && sn.x1 === 4, '독침 좀비를 노린다');
  const r = C.newGame(C.prepareLevel(13), {});
  r.rows = [];
  r.props = [];
  r.foes = [];
  for (let i = 0; i < 8; i++) r.foes.push({ id: 10 + i, kind: 'grunt', x: -3 + (i % 3) * 0.5, z: r.squad.z + 20 + (i % 2) * 0.5, hp: 5, max: 5, alive: true, awake: false, hitT: -9, cd: 0, seed: 0, r: 0.42, spd: 0, home: 0, homeDist: 0 });
  r.squad.sp = [{ id: 8, k: 'rocket', cd: 0 }];
  let booms = 0;
  for (let i = 0; i < 120; i++) { C.step(r, { dir: 0 }); booms += r.ev.filter((e) => e.t === 'boom').length; }
  assert.ok(booms >= 1);
  assert.ok(r.foes.filter((f) => f.alive).length <= 4, '무리의 절반 이상이 터진다');
});

test('레벨 생성: 철창은 L5부터, 금색 칸은 L9부터 레벨당 2줄 이하, 마지막·1칸 줄에는 없음, 소개 레벨에는 그 병과', () => {
  for (let L = 1; L <= 60; L++) {
    const lv = C.buildLevel(L);
    const cages = lv.props.filter((p) => p.kind === 'cage');
    if (L < C.UNLOCK.cage) assert.equal(cages.length, 0, `L${L}`);
    const unitRows = lv.rows.filter((r) => r.cells.some((c) => c.op === 'unit'));
    if (L < C.UNLOCK.recruit) assert.equal(unitRows.length, 0, `L${L}`);
    assert.ok(unitRows.length <= 2);
    assert.ok(!lv.rows.at(-1).cells.some((c) => c.op === 'unit'));
    for (const r of unitRows) {
      assert.ok(r.cells.length >= 2);
      assert.ok(r.cells.some((c) => c.op !== 'unit'));
    }
    for (const c of cages) assert.ok(L >= C.UNLOCK[c.reward.k], `L${L} ${c.reward.k}`);
    for (const k of C.SP_KINDS) {
      if (C.UNLOCK[k] !== L) continue;
      assert.ok(cages.some((c) => c.reward.k === k), `L${L} 소개 병과 ${k}`);
    }
  }
});

test('영웅: 게이지가 차야 쓰고, 경기장에 들어서면 +0.5, 쓰는 중엔 다시 못 쓴다', () => {
  const lv = C.prepareLevel(6);
  const s = C.newGame(lv, { hero: { id: 'mungchi', lv: 1 } });
  assert.equal(s.hero.charge, 0.35);
  C.step(s, { dir: 0, skill: true });
  assert.equal(s.hero.act, 0, '게이지 부족');
  s.hero.charge = 1;
  C.step(s, { dir: 0, skill: true });
  assert.ok(s.hero.act > 0 && s.hero.charge === 0);
  assert.ok(C.heroDmg(s) > 1);
  const used = s.stats.heroUses;
  C.step(s, { dir: 0, skill: true });
  assert.equal(s.stats.heroUses, used);
  const a = arena(6, { hero: { id: 'nabi', lv: 2 } }).s;
  assert.ok(a.hero.charge >= 0.5 || a.hero.act > 0 || a.stats.heroUses > 0);
});

test('영웅을 달아도 가만히 있으면 지고, 영웅은 해가 되지 않는다', () => {
  // 그 레벨에서 가질 수 있는 최고 영웅 레벨(heroCap)로, 스킬은 자동 발동
  for (const id of HERO_IDS) {
    let idleWins = 0;
    let all = 0;
    for (let L = 3; L <= MAX_LEVEL; L += 2) {
      const lv = C.prepareLevel(L);
      const s = C.newGame(lv, { hero: { id, lv: heroCap(L) } });
      const max = Math.ceil((lv.arenaZ / lv.speed + 80) / C.DT);
      while ((s.phase === 'run' || s.phase === 'arena') && s.tick < max) C.step(s, { dir: 0, tx: null, skill: C.heroWants(s) });
      all++;
      if (s.phase === 'won') idleWins++;
    }
    assert.ok(idleWins / all <= 0.25, `${id} 달고 가만히 ${idleWins}/${all}`);
  }
  for (const id of ['mungchi', 'bori', 'nabi']) {
    let withHero = 0;
    let without = 0;
    for (let L = 10; L <= MAX_LEVEL; L += 3) {
      const lv = C.prepareLevel(L);
      const a = C.newGame(lv, { hero: { id, lv: 1 } });
      const b = C.newGame(lv, {});
      const max = Math.ceil((lv.arenaZ / lv.speed + 80) / C.DT);
      while ((a.phase === 'run' || a.phase === 'arena') && a.tick < max) C.step(a, C.botInput(a));
      while ((b.phase === 'run' || b.phase === 'arena') && b.tick < max) C.step(b, C.botInput(b));
      assert.equal(a.phase, 'won', `L${L} ${id}`);
      withHero += a.squad.n;
      without += b.squad.n;
    }
    assert.ok(withHero >= without * 0.98, `${id}: ${withHero} vs ${without}`);
  }
});

test('강화·영웅·특수병을 갖춰도 보스전은 너무 빨리 끝나지 않는다', () => {
  const median = (opt) => {
    const times = [];
    for (let L = 10; L <= MAX_LEVEL; L += 3) {
      const { s } = arena(L, opt);
      s.squad.sp = [{ id: 901, k: 'medic', cd: 0 }, { id: 902, k: 'sniper', cd: 0 }, { id: 903, k: 'rocket', cd: 0 }];
      while (s.phase === 'arena' && s.tick < 60000) C.step(s, C.botInput(s));
      if (s.phase === 'won') times.push(s.stats.bossT);
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
  };
  // 그 무렵 흔한 갖춤(강화 5단계씩, 영웅 Lv3, 특수병 3명)과 끝까지 다 갖춘 경우
  const mid = median({ start: C.START_N + 10, fire: 5, hero: { id: 'nabi', lv: 3 } });
  const max = median({ start: C.START_N + 20, fire: 10, hero: { id: 'nabi', lv: 5 } });
  assert.ok(mid >= 4, `보통 갖춤 보스전 중앙값 ${mid.toFixed(1)}초`);
  assert.ok(max >= 2.5, `최대 갖춤 보스전 중앙값 ${max.toFixed(1)}초`);
});

test('별 기준은 출격 영웅마다 따로 계산한다', () => {
  const lv = C.prepareLevel(11);
  const a = C.parFor(lv, C.START_N, 0, { id: 'mungchi', lv: 3 });
  const b = C.parFor(lv, C.START_N, 0, { id: 'bori', lv: 3 });
  assert.ok(a >= lv.par && b >= lv.par);
  assert.equal(C.parFor(lv, C.START_N, 0, { id: 'mungchi', lv: 3 }), a, '캐시');
});

test('이어하기: 스냅숏에서 되살린 판은 원래 판과 매 틱 똑같이 흘러간다(특수병·영웅·로켓 포함)', () => {
  const lv = C.prepareLevel(14);
  const s = C.newGame(lv, { hero: { id: 'nabi', lv: 3 } });
  s.squad.sp = [{ id: 901, k: 'medic', cd: 0 }, { id: 902, k: 'rocket', cd: 0 }];
  for (let i = 0; i < 1500; i++) C.step(s, C.botInput(s));
  const copy = C.restore(JSON.parse(JSON.stringify(C.snapshot(s))));
  assert.ok(copy);
  let ticks = 0;
  while ((s.phase === 'run' || s.phase === 'arena') && ticks < 20000) {
    C.step(s, C.botInput(s));
    C.step(copy, C.botInput(copy));
    assert.equal(C.stateHash(copy), C.stateHash(s), `틱 ${s.tick}`);
    ticks++;
  }
  assert.equal(C.restore({ nope: 1 }), null);
});

/* ---------- v2: 저장 ---------- */
import { normalize, defaults, SAVE_V, totalStars } from '../assets/store.js';
import { encodeBackup, decodeBackup } from '../assets/save.js';
import fs from 'node:fs';
import path from 'node:path';

test('저장 v1 → v2: 필드는 더하기만, 값은 범위 안으로, 지난 진행으로 얻은 영웅을 채운다', () => {
  const v1 = { maxL: 12, cur: 12, stars: { 1: 3, 2: 5, 3: -1 }, best: { 1: 40 }, coins: -20, upg: { start: 99, fire: 2 }, set: { sound: false }, tips: { moved: 1 }, fails: {}, plays: 7 };
  const d = normalize(v1);
  assert.equal(d.v, SAVE_V);
  assert.equal(d.maxL, 12);
  assert.equal(d.coins, 0);
  assert.equal(d.stars[2], 3);
  assert.equal(d.stars[3], 0);
  assert.equal(d.upg.start, 10);
  assert.equal(d.set.sound, false, '옛 설정 유지');
  assert.equal(d.set.music, true, '새 설정 기본값');
  assert.ok(d.heroes.lv.mungchi >= 1, 'L3 이후 진행이면 뭉치 합류');
  assert.ok(d.heroes.lv.bori >= 1, 'L8을 깼으면 보리 합류');
  assert.ok(!d.heroes.lv.nabi, '별 30개 미만이면 나비는 아직');
  assert.equal(d.heroes.sel, 'mungchi');
  assert.deepEqual(normalize(d), d, '두 번 해도 같다');
  // 더 새 버전의 저장은 버전을 낮추지 않는다
  assert.equal(normalize({ ...v1, v: SAVE_V + 1 }).v, SAVE_V + 1);
  assert.equal(normalize(defaults()).heroes.sel, '', '처음에는 영웅이 없다');
});

test('백업 코드 왕복과 오타 검사', async () => {
  const d = normalize({ ...defaults(), maxL: 30, coins: 1234, stars: { 1: 3, 2: 3 } });
  const code = await encodeBackup(d);
  assert.ok(code.startsWith('SQD'));
  const back = await decodeBackup(code);
  assert.equal(back.data.coins, 1234);
  assert.equal(totalStars(back.data), 6);
  await assert.rejects(decodeBackup(code.slice(0, -2) + 'zz'));
  await assert.rejects(decodeBackup('hello'));
});

test('오프라인 캐시 목록에 게임이 불러오는 모든 파일이 있다', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const shell = new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]));
  const seenFiles = new Set();
  const walk = (rel) => {
    if (seenFiles.has(rel)) return;
    seenFiles.add(rel);
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const m of src.matchAll(/^\s*import\s[^;]*?from\s+'(\.[^']+)'/gm)) walk(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  };
  walk('assets/main.js');
  for (const f of seenFiles) assert.ok(shell.has(f), `sw.js SHELL에 ${f}가 없다`);
});

test('보정 표는 실제 보정과 같다(규칙을 바꾸면 node squad/tools/caltable.mjs 로 다시 만든다)', async () => {
  const { CAL } = await import('../assets/caltable.js');
  assert.equal(CAL.sim, C.SIM, '보정 표의 SIM이 낡았다');
  for (let L = 1; L <= 60; L += 3) {
    const real = C.calibrateLevel(L);
    for (const f of C.CAL_FIELDS) assert.equal(CAL.levels[L][f], real[f], `L${L} ${f}`);
  }
});
