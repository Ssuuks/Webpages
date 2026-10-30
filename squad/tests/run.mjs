/* node --test squad/tests/  — DOM 없이 규칙·레벨 생성·봇 밸런스를 확인한다 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import * as C from '../assets/core.js';
import { CAL } from '../assets/caltable.js';
import { load, save, wipe, upgCost, UPGRADES } from '../assets/store.js';
import { HERO_IDS, heroCap } from '../assets/roster.js';
import { sloppy, random, makeBot } from './bots.mjs';
import { makePool, checkTargets, tagClass, loadoutCap, summarize } from '../tools/benchlib.mjs';

const MAX_LEVEL = 40;
/* 표(caltable.js)가 덮는 가장 높은 레벨 — 그 뒤는 게임이 처음 열 때 보정한다 */
const TABLE_MAX = Math.max(...Object.keys(CAL.levels).map(Number));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/* 무거운 봇 묶음은 워커로 나눠 돌린다(tools/bench.mjs와 같은 일감·같은 시드 — 결과는 워커 수와 상관없이 같다) */
const POOL = makePool(Math.max(1, Math.min(4, os.availableParallelism ? os.availableParallelism() : os.cpus().length)));
after(() => POOL.close());
const levelJob = (L, cond, co, bots) => POOL.run({ kind: 'level', L, cond, co, bots });

function run(lv, policy, opt = {}) {
  const s = C.newGame(lv, { start: opt.start ?? C.START_N, fire: opt.fire ?? 0, hero: opt.hero ?? null });
  const max = Math.ceil((lv.arenaZ / lv.speed + 80) / C.DT);
  while ((s.phase === 'run' || s.phase === 'arena') && s.tick < max) C.step(s, policy(s));
  return s;
}
/* 사람 흉내 봇(sloppy: 0.3초 늦은 반응, 게이트 쏘기·상자 모름, 가끔 엉뚱한 곳)과 마구 움직이는 봇은 tests/bots.mjs에 있다(tools/bench.mjs와 함께 쓴다) */
const idle = () => ({ dir: 0, tx: null });

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

/* ---------- 보정: 기준 봇, 별 기준, 배치 검사 ---------- */
test(`기준 봇은 기대 강화(EXPECT)로 L1~${TABLE_MAX + 6}을 모두 깬다 — 보정 실패 0, 별 기준(par)은 기준 봇이 실제로 남기는 수`, async () => {
  const Ls = range(1, TABLE_MAX + 6);
  const out = await Promise.all(Ls.map((L) => levelJob(L, 'expect', C.expectLoadout(L), [{ name: 'strong', seeds: 1 }, { name: 'strong-noskill', seeds: 1 }])));
  Ls.forEach((L, i) => {
    const lv = C.prepareLevel(L);
    assert.ok(!lv.failed, `L${L} 보정 실패`);
    assert.ok(lv.arriveWeak >= 1, `L${L}: 약한 기준 봇이 보스까지 못 감`);
    const [st, ns] = out[i];
    assert.equal(st.won, 1, `L${L}: 기준 봇이 짐(${st.cause})`);
    assert.ok(st.fin <= C.MAX_N);
    // 별 기준 = 스킬 안 쓴 기준 봇이 남기는 수(어려운 레벨에서 그 봇이 지거나 겨우 이기면 스킬을 쓴 기준 봇의 수)
    assert.ok(lv.par === ns.fin || (lv.params.boss.mode === 'pop' && lv.par === st.fin), `L${L}: par ${lv.par} vs 기준 봇 ${ns.fin}/${st.fin}`);
  });
});

test(`배치 검사: 판 내내 한 자리(${C.QA_XS.join('·')})에 서 있으면 진다 — 기대 강화로도 그 진행의 최대 강화로도(L5~${TABLE_MAX})`, () => {
  // L2~4(첫 레벨들)는 서서 쏘기만 해도 기준 병력만큼 모여 보스로는 가를 수 없다(아래 todo). L5부터는 알려진 몇 레벨만 예외
  const fails = range(5, TABLE_MAX).filter((L) => CAL.levels[L].qa === false);
  assert.ok(fails.length <= QA_EXCEPT_MAX, `배치 검사를 못 넘은 레벨: ${fails.join(',')}`);
  for (const L of [12, 25, 37, 58]) assert.ok(C.standStillLoses(C.prepareLevel(L)), `L${L} 다시 확인`);
});

test('측정용 봇(tests/bots.mjs)은 시드가 같으면 같은 판을 돌고, 복제하면 그 자리부터 똑같이 이어 간다', () => {
  const lv = C.prepareLevel(9);
  for (const name of ['strong', 'expert', 'sloppy0.1', 'misjudge', 'naive', 'random', 'hold2.5', 'worst']) {
    assert.equal(C.stateHash(run(lv, makeBot(name, 7))), C.stateHash(run(lv, makeBot(name, 7))), name);
    const s = C.newGame(lv, { hero: { id: 'mungchi', lv: 2 } });
    const p = makeBot(name, 7);
    for (let i = 0; i < 900; i++) C.step(s, p(s));
    const s2 = structuredClone(s);
    const p2 = p.clone();
    for (let i = 0; i < 1200 && (s.phase === 'run' || s.phase === 'arena'); i++) { C.step(s, p(s)); C.step(s2, p2(s2)); }
    assert.equal(C.stateHash(s2), C.stateHash(s), `${name} 복제`);
  }
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

test('별과 코인: 문턱은 par의 STARS 비율, par는 출격 강화·영웅을 따라가고, 어려운 태그는 코인을 더 준다', () => {
  const lv = C.prepareLevel(4);
  const E = C.expectLoadout(4);
  const g = C.starGoals(lv.par, lv);
  assert.ok(g.two < g.three && g.three <= lv.par);
  assert.equal(g.three, Math.max(3, Math.round(lv.par * C.STARS[''].three)));
  assert.equal(g.two, Math.max(2, Math.round(lv.par * C.STARS[''].two)));
  assert.equal(C.starsFor(lv.par, 1, false, lv), 0);
  assert.equal(C.starsFor(lv.par, 1, true, lv), 1);
  assert.equal(C.starsFor(lv.par, g.two, true, lv), 2);
  assert.equal(C.starsFor(lv.par, g.three - 1, true, lv), 2);
  assert.equal(C.starsFor(lv.par, g.three, true, lv), 3);
  // 별 기준은 출격 강화를 따라간다(강화는 이기기 쉽게, 별은 실력으로)
  assert.equal(C.parFor(lv, E.start, E.fire, E.hero), lv.par, '기대 강화로 나가면 표의 par');
  assert.ok(C.parFor(lv, E.start + 20, E.fire + 6, E.hero) > lv.par, '강화를 더 달면 별 기준도 오른다');
  assert.ok(C.parFor(lv, C.START_N, 0, null) <= lv.par, '강화가 적으면 별 기준도 낮거나 같다');
  const s = run(lv, C.botInput, E);
  const won = C.coinsFor(lv, s, true, 3);
  const lost = C.coinsFor(lv, s, false, 0);
  assert.ok(won > lost && lost >= 0);
  assert.ok(C.coinsFor(lv, s, true, 3, 50) > won, '보급 강화는 코인을 늘린다');
  // 태그 배수: 기본 몫에만 곱한다(처치·상자 코인은 그대로)
  const bare = { stats: { kills: 0, coins: 0 }, squad: { sp: [] } };
  for (const L of [14, 15, 20, 21]) {
    const t = C.levelTag(L);
    assert.equal(C.coinsFor({ L }, bare, true, 3), Math.round((10 + 2 * L + 15) * t.coinMul), `L${L} ${t.tag}`);
  }
});

test('패배 원인이 기록된다', () => {
  const lv = C.prepareLevel(12);
  const s = run(lv, idle);
  if (s.phase === 'lost') assert.ok(['gate', 'foe', 'brute', 'wall', 'saw', 'spit', 'boss'].includes(s.cause), s.cause);
});

test(`표 밖 레벨(L${TABLE_MAX + 1}~)은 그 자리에서 빨리 보정된다(휴대폰에서도 레벨 시작이 늦지 않게)`, () => {
  C.prepareLevel(TABLE_MAX + 40);   // 첫 호출(JIT 데우기)은 빼고 잰다
  const Ls = range(TABLE_MAX + 7, TABLE_MAX + 12);
  const t0 = performance.now();
  for (const L of Ls) assert.ok(!C.prepareLevel(L).failed, `L${L} 보정 실패`);
  const ms = (performance.now() - t0) / Ls.length;
  assert.ok(ms < 600, `레벨당 ${ms.toFixed(0)}ms`);
});

/* ---------- 난이도 구간(plan.difficulty_targets 1단계) ----------
   tools/benchlib.mjs의 TARGETS(계획 문서의 구간)를 그대로 쓴다. 판 수: 태그×구간 묶음마다 48판 이상(아래 SEEDS).
   봇·시드는 tools/bench.mjs와 같다(seedOf) — 표본이 작아(묶음 48~60판, 표준오차 약 ±7%p) 구간 끝에서 TOL만큼은 넘어도 본다.
   전체 측정은 node squad/tools/bench.mjs(결과: tools/bench-phase1.json). */
const TOL = 5;
/* 1단계로는 맞출 수 없는 목표(이유는 README '난이도 측정'): 테스트는 todo로 남기고 값만 찍는다 */
const KNOWN = {
  'win super L5-10 sloppy0.1 ': 'L10: 영웅 스킬이 보스를 잡는 힘의 약 20%(영웅 Lv1, 70초 판에 4번 + 경기장) — 스킬 쓰는 사람 구간과 안 쓰는 사람 하한을 한 체력으로 둘 다 맞출 수 없어 그 사이(77% / 40%)',
  'win super L5-10 sloppy0.1-noskill': '위와 같은 이유',
  'win super L11+ expert': 'expert는 strong과 같은 판단이라 strong이 이기는 체력(H*) 아래에서는 거의 늘 이긴다 — 사람 숙련자 플레이테스트로 확인',
  'exploit hold-2.5 L1-4': 'L2~4는 한 자리에서 계속 쏘아 올리기만 해도 기준 병력만큼 모인다 — 2단계 판돈 줄(P07)',
  'exploit hold2.5 L1-4': '같은 이유(L1은 튜토리얼이라 오른쪽이 정답)',
  'exploit hold0 L1-4': '같은 이유',
  'exploit worst L1-10': 'L2~7의 나쁜 칸은 쏘아 올리면 메워진다 — 2단계 판돈 줄(P07)',
};
/* 2단계(판 중 긴장: 판돈 줄·위협·실패 시점) 목표 — 여기서는 보지 않는다 */
const PHASE2 = /^(misjudge|arrive\/ref|boss contact|boss HP left|slam hit|losses before|wins ending|drawdown)/;
const QA_EXCEPT_MAX = 4;   // L5+에서 배치 검사를 못 넘어도 되는 레벨 수(쉼 레벨처럼 산만한 사람이 이기게 두면 서 있기도 이기는 곳)
const BAND_BOTS = ['expert', 'sloppy0.1', 'sloppy0.1-noskill', 'sloppy0.3'];
/* 레벨마다 시드 수: 묶음마다 48판 이상 */
function bandSeeds(L) {
  const c = tagClass(L);
  if (c === 'onboard') return 12;
  if (L === 5 || L === 10) return 48;
  if (L <= 10) return c === 'rest' ? 5 : 16;
  if (c === 'rest') return 5;
  if (c === 'normal') return 2;
  return 10;   // 어려움·매우 어려움 L15~60 (각 5레벨)
}
let bandRuns = null;
const bands = () => (bandRuns ||= Promise.all(range(1, 60).map((L) => levelJob(L, 'expect', C.expectLoadout(L), BAND_BOTS.map((name) => ({ name, seeds: bandSeeds(L) })))))
  .then((a) => a.flat()));
const EXPLOIT_BOTS = [['idle', 1], ['random', 4], ['hold-4.4', 1], ['hold-2.5', 1], ['hold0', 1], ['hold2.5', 1], ['hold4.4', 1], ['worst', 4], ['naive', 1]];
let exploitRuns = null;
const exploits = () => (exploitRuns ||= Promise.all(range(1, 60).flatMap((L) => [
  levelJob(L, 'expect', C.expectLoadout(L), EXPLOIT_BOTS.map(([name, seeds]) => ({ name, seeds }))),
  levelJob(L, 'cap', loadoutCap(L), EXPLOIT_BOTS.map(([name, seeds]) => ({ name, seeds }))),
])).then((a) => a.flat()));
function checkBand(t, results, pick) {
  const mine = results.filter(pick);
  const isKnown = (id) => Object.keys(KNOWN).find((k) => (id + ' ').startsWith(k));
  assert.ok(mine.length, '확인할 목표가 없다');
  const bad = [];
  for (const r of mine) {
    const known = isKnown(r.id);
    const tol = r.metric === 'win' || r.metric === 's3' || r.metric === 's2' ? TOL : r.metric === 'len' ? 2 : 0;
    const ok = r.value >= r.lo - tol && r.value <= r.hi + tol;
    if (known) { t.diagnostic(`알려진 차이 ${r.id} [${r.cond}] ${r.value.toFixed(1)} (목표 ${r.lo}-${r.hi}) — ${KNOWN[known]}`); continue; }
    if (!ok) bad.push(`${r.id} [${r.cond}] ${r.value.toFixed(1)} (목표 ${r.lo}-${r.hi}, n=${r.n})`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
}

test('난이도 구간: 태그×구간 첫 시도 승률(기대 강화, expert / 집중 / 스킬 안 누름 / 산만)과 별 비율', async (t) => {
  const runs = await bands();
  const res = checkTargets(runs, range(1, 60));
  checkBand(t, res, (r) => !PHASE2.test(r.id) && (r.id.startsWith('win ') || r.metric === 's3' || r.metric === 's2'));
  // 판 길이는 레벨마다 같은 판 수(시드 0~7, bench와 같은 표본)로 — L5·L10의 48판이 묶음을 기울이지 않게
  checkBand(t, checkTargets(runs.filter((r) => r.k < 8), range(1, 60)), (r) => r.metric === 'len');
  // 묶음 크기: 48판 이상
  const groups = {};
  const groupOf = (L) => { const c = tagClass(L); return c === 'onboard' || c === 'rest' ? c : `${c} ${L <= 10 ? 'L5-10' : 'L11+'}`; };
  for (const r of runs) { const k = `${groupOf(r.L)}|${r.b}`; groups[k] = (groups[k] || 0) + 1; }
  for (const [k, n] of Object.entries(groups)) assert.ok(n >= 48, `${k} ${n}판`);
});
for (const id of Object.keys(KNOWN)) test.todo(`${id.trim()}: ${KNOWN[id]}`);

test('꼼수 상한: 가만히·마구·고정 위치 5곳·늘 최악 칸·숫자만 보기 — 기대 강화로도 살 수 있는 최대 강화로도', async (t) => {
  const runs = await exploits();
  const res = checkTargets(runs, range(1, 60));
  checkBand(t, res, (r) => r.id.startsWith('exploit '));
  // L5+에서 서 있기로 이긴 레벨은 배치 검사에 걸린 것으로 표에 적힌 레벨뿐이다(배치 검사와 측정 봇이 같은 판을 본다)
  const won = [...new Set(runs.filter((r) => r.L >= 5 && r.won && (r.b.startsWith('hold') || r.b === 'idle')).map((r) => r.L))];
  for (const L of won) assert.equal(CAL.levels[L].qa, false, `L${L}: 서 있기로 이겼는데 배치 검사는 통과`);
});

test('3패 지원은 이기기 버튼이 아니다: 지원을 받은 산만한 사람(sloppy0.3)은 대부분 이기지만 늘 이기지는 않는다', async () => {
  // 어려움·매우 어려움 L5~60(지원이 가장 자주 쓰이는 곳) + 일반 레벨 표본, 시작 병력 + lv.helpStart
  const Ls = range(5, 60).filter((L) => tagClass(L) === 'hard' || tagClass(L) === 'super' || L % 7 === 0);
  const out = await Promise.all(Ls.map((L) => {
    const co = C.expectLoadout(L);
    const lv = C.prepareLevel(L);
    assert.equal(C.supportFor(lv), lv.helpStart);
    return levelJob(L, 'support', { ...co, start: co.start + C.supportFor(lv) }, [{ name: 'sloppy0.3', seeds: 8 }]);
  }));
  const runs = out.flat();
  const hs = runs.filter((r) => tagClass(r.L) !== 'normal');
  const rate = (a) => (100 * a.filter((r) => r.won).length) / a.length;
  assert.ok(rate(hs) >= 85 - TOL && rate(hs) <= 95 + TOL, `어려움·매우 어려움 지원 승률 ${rate(hs).toFixed(0)}%`);
  assert.ok(rate(runs) >= 85 - TOL && rate(runs) <= 97, `전체 지원 승률 ${rate(runs).toFixed(0)}%`);
  for (const L of range(1, TABLE_MAX)) assert.ok(C.prepareLevel(L).helpStart >= 5, `L${L} helpStart`);
});

test('보정 무리의 사람 흉내 봇(core.humanBot)은 측정 봇 sloppy(tests/bots.mjs)와 같은 시드면 같은 입력을 낸다', () => {
  for (const [L, err, sk] of [[9, 0.1, true], [15, 0.3, false], [22, 0.1, false]]) {
    const lv = C.prepareLevel(L);
    const co = C.expectLoadout(L);
    const a = C.newGame(lv, co);
    const b = C.newGame(lv, co);
    const p = C.humanBot(77, err, sk);
    const q = sloppy(77, err, { skill: sk });
    while ((a.phase === 'run' || a.phase === 'arena') && a.tick < 6000) {
      const i = p(a);
      const j = q(b);
      assert.deepEqual([i.dir, i.tx, !!i.skill], [j.dir, j.tx, !!j.skill], `L${L} 틱 ${a.tick}`);
      C.step(a, i);
      C.step(b, j);
    }
    assert.equal(C.stateHash(a), C.stateHash(b));
    // 복제하면 그 자리부터 똑같이
    const c = structuredClone(a);
    const r = p.clone();
    assert.deepEqual(r.st, p.st);
  }
});

test('화면 약속(UI가 쓰는 내보내기): levelTag·upgCap·bossEta·supportFor·starGoals(lv)·gate 이벤트', () => {
  const tags = range(1, 30).map((L) => C.levelTag(L).tag);
  assert.deepEqual(tags.slice(0, 4), ['', '', '', '']);
  assert.equal(C.levelTag(5).tag, 'hard');
  assert.equal(C.levelTag(10).tag, 'super');
  assert.equal(C.levelTag(6).tag, 'rest');
  assert.equal(C.levelTag(11).tag, 'rest');
  assert.equal(C.levelTag(15).label, '어려움');
  assert.ok(C.levelTag(20).coinMul > C.levelTag(15).coinMul && C.levelTag(15).coinMul > 1 && C.levelTag(16).coinMul === 1);
  for (const L of [5, 6, 10, 23]) assert.equal(C.prepareLevel(L).tag, C.levelTag(L).tag);
  // 강화 상한 = EXPECT(maxL) + 1, 진행할수록 줄지 않는다
  let prev = 0;
  for (const L of range(1, 130)) {
    const u = C.upgCap(L, 'start');
    const e = C.expectAt(L);
    assert.equal(u, Math.min(10, Math.max(e.start, e.fire, e.coin) + 1), `L${L}`);
    assert.ok(u >= prev);
    prev = u;
  }
  // 보스 도착 시간: 경기장에서만, 다가올수록 줄고, 맞붙으면 null
  const lv = C.prepareLevel(12);
  const s = C.newGame(lv, C.expectLoadout(12));
  assert.equal(C.bossEta(s), null);
  let gate = null;
  while (s.phase === 'run') { C.step(s, { dir: 0, tx: null }); gate ||= s.ev.find((e) => e.t === 'gate'); }
  assert.ok(gate && ['before', 'after', 'x', 'row'].every((k) => Number.isFinite(gate[k])), JSON.stringify(gate));
  assert.ok(Array.isArray(gate.alt) && gate.alt.length === s.rows.find((r) => r.id === gate.row).cells.length);
  const e0 = C.bossEta(s);
  for (let i = 0; i < 60; i++) C.step(s, { dir: 0, tx: null });
  const e1 = C.bossEta(s);
  assert.ok(e0 > 0 && e1 < e0, `${e0} → ${e1}`);
  while (s.phase === 'arena' && !s.boss.clash) C.step(s, { dir: 0, tx: null });
  if (s.boss && s.boss.clash) assert.equal(C.bossEta(s), null);
  assert.ok(C.supportFor(lv) >= 5);
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
  assert.ok(Math.abs(back - Math.round(lost * C.SP.medic.share)) <= 2, `돌아온 수 ${back} / 잃은 ${lost}`);
  const g = structuredClone(base);
  g.rows = [{ id: 1, z: g.squad.z + 0.01, done: false, cells: [C.makeCell('add', -50, 200, -5, 5)] }];
  for (let i = 0; i < 600; i++) C.step(g, { dir: 0 });
  assert.equal(g.squad.n, 150);
  // 한 명씩 잃어도(풀에 1명이 안 되는 몫) 버려지지 않고 모여서 돌아온다
  const one = structuredClone(base);
  for (let k = 0; k < 20; k++) {
    one.foes.push({ id: 300 + k, kind: 'grunt', x: one.squad.x, z: one.squad.z + 0.3, hp: 5, max: 5, alive: true, awake: true, hitT: -9, cd: 0, seed: 0, r: 0.42, spd: 0, home: 0, homeDist: 0 });
    for (let i = 0; i < 40; i++) C.step(one, { dir: 0 });
  }
  for (let i = 0; i < 600; i++) C.step(one, { dir: 0 });
  const lost1 = one.stats.lost;
  assert.ok(lost1 >= 18, `한 명씩 잃은 수 ${lost1}`);
  assert.ok(one.stats.healed >= Math.floor(lost1 * C.SP.medic.share) - 1, `한 명씩 잃고 돌아온 수 ${one.stats.healed} / ${lost1}`);
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
      // 가만히 선 분대가 지나는 칸은 금색이 아니고, 금색 칸은 가장 좋은 다른 칸보다 확실히 좋지는 않다(진짜 선택)
      assert.notEqual(r.cells[C.pickCell(r, 0)].op, 'unit', `L${L} 제자리 칸이 금색`);
      const face = (c) => C.applyOp(r.ng, c.op, c.v);
      const gold = r.cells.find((c) => c.op === 'unit');
      const best = Math.max(...r.cells.filter((c) => c !== gold).map((c) => C.applyOp(r.ng, c.op, c.op === 'add' ? Math.min(c.cap, c.v + Math.floor(0.3 * r.ng)) : c.v)));
      assert.ok(face(gold) <= best + 2, `L${L} 금색 ${face(gold)} vs 최선 ${best}`);
      assert.ok(face(gold) >= Math.min(best, r.ng + 3) - 0.35 * r.ng - 2, `L${L} 금색이 너무 나쁨 ${face(gold)} vs 최선 ${best}`);
    }
    // 철창이 처음 나온 레벨부터 금색 칸이 열리기 전까지는 레벨마다 철창이 있다
    if (L >= C.UNLOCK.cage && L < C.UNLOCK.recruit) assert.ok(cages.length >= 1, `L${L} 철창 없음`);
    for (const c of cages) assert.ok(c.reward.k && L >= C.UNLOCK[c.reward.k], `L${L} ${c.reward.k}`);
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
  // 경기장 직전에 스킬을 써도 입장 +0.5는 쌓인다
  const lv6 = C.prepareLevel(6);
  const b = C.newGame(lv6, { hero: { id: 'mungchi', lv: 1 } });
  while (b.phase === 'run' && b.squad.z < b.arenaZ - 6) C.step(b, C.botInput(b));
  b.hero.charge = 1;
  C.step(b, { ...C.botInput(b), skill: true });
  assert.ok(b.hero.act > 0);
  while (b.phase === 'run') C.step(b, { ...C.botInput(b), skill: false });
  assert.ok(b.hero.act > 0, '스킬이 켜진 채 경기장에 들어감');
  assert.ok(b.hero.charge >= 0.5, `입장 충전 ${b.hero.charge}`);
});

test('영웅을 달아도 가만히 있으면 지고, 영웅은 해가 되지 않는다', () => {
  // 그 레벨의 기대 강화 + 그 레벨에서 가질 수 있는 최고 영웅 레벨(heroCap), 스킬은 자동 발동
  for (const id of HERO_IDS) {
    let idleWins = 0;
    let all = 0;
    for (let L = 3; L <= MAX_LEVEL; L += 2) {
      const lv = C.prepareLevel(L);
      const E = C.expectLoadout(L);
      const s = C.newGame(lv, { ...E, hero: { id, lv: heroCap(L) } });
      const max = Math.ceil((lv.arenaZ / lv.speed + 80) / C.DT);
      while ((s.phase === 'run' || s.phase === 'arena') && s.tick < max) C.step(s, { dir: 0, tx: null, skill: C.heroWants(s) });
      all++;
      if (s.phase === 'won') idleWins++;
    }
    assert.ok(idleWins / all <= 0.15, `${id} 달고 가만히 ${idleWins}/${all}`);
  }
  // 일반 레벨(상자·특수병 없이도 깨게 맞춘 곳): 기대 강화의 기준 봇이 어느 영웅을 달아도 이기고, 영웅 없이보다 병력을 덜 남기지 않는다
  for (const id of ['mungchi', 'bori', 'nabi']) {
    let withHero = 0;
    let without = 0;
    for (let L = 12; L <= MAX_LEVEL; L += 3) {
      if (C.levelTag(L).tag) continue;
      const lv = C.prepareLevel(L);
      const E = C.expectLoadout(L);
      const a = run(lv, C.botInput, { ...E, hero: { id, lv: E.hero ? E.hero.lv : 1 } });
      const b = run(lv, C.botInput, { ...E, hero: null });
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
  for (const id of ['nabi', 'mungchi']) {
    const mid = median({ start: C.START_N + 10, fire: 5, hero: { id, lv: 3 } });
    const max = median({ start: C.START_N + 20, fire: 10, hero: { id, lv: 5 } });
    assert.ok(mid >= 4, `${id} 보통 갖춤 보스전 중앙값 ${mid.toFixed(1)}초`);
    assert.ok(max >= 2.5, `${id} 최대 갖춤 보스전 중앙값 ${max.toFixed(1)}초`);
  }
});

test('영웅 스킬을 누르지 않는 사람도 영웅 때문에 별 셋을 덜 받지 않는다(별 기준은 상시 효과만)', () => {
  let none = 0;
  let hero = 0;
  for (let L = 11; L <= MAX_LEVEL; L += 3) for (const seed of [1, 2]) {
    const lv = C.prepareLevel(L);
    for (const h of [null, { id: 'mungchi', lv: heroCap(L) }]) {
      const s = C.newGame(lv, { hero: h });
      const p = sloppy(seed * 100 + L);
      const max = Math.ceil((lv.arenaZ / lv.speed + 80) / C.DT);
      while ((s.phase === 'run' || s.phase === 'arena') && s.tick < max) C.step(s, { ...p(s), skill: false });
      const three = s.phase === 'won' && C.starsFor(C.parFor(lv, C.START_N, 0, h), s.squad.n, true) === 3;
      if (h) hero += three; else none += three;
    }
  }
  assert.ok(hero >= none - 2, `별 셋: 영웅(스킬 안 씀) ${hero} vs 영웅 없음 ${none}`);
});

test('나비 레벨은 보스전 추가 피해 한도를 올린다', () => {
  const cap = (lvH) => {
    const { s } = arena(15, { hero: { id: 'nabi', lv: lvH } });
    s.hero.cd = 99;
    s.hero.charge = 0;
    s.squad.sp = [];
    s.rockets = [];
    s.boss.bonus = 0;
    for (let i = 0; i < 200; i++) C.step(s, { dir: 0, tx: null, skill: false });
    return s.boss.bonus / C.dps(s.squad.n, s.squad.tier, s.fireLv);
  };
  const a = cap(1);
  const b = cap(5);
  assert.ok(Math.abs(a - 1.5 * C.BONUS_CAP) < 0.02, `Lv1 ${a}`);
  assert.ok(Math.abs(b - 1.5 * (C.BONUS_CAP + 4 * C.NABI_CAP)) < 0.02, `Lv5 ${b}`);
});

test('별 기준은 출격 영웅마다 따로 계산한다', () => {
  const lv = C.prepareLevel(11);
  const E = C.expectLoadout(11);
  assert.equal(C.parFor(lv, E.start, E.fire, E.hero), lv.par, '기대 영웅이면 표의 par');
  const a = C.parFor(lv, E.start, E.fire, { id: 'mungchi', lv: 4 });
  const b = C.parFor(lv, E.start, E.fire, { id: 'bori', lv: 3 });
  const c = C.parFor(lv, E.start, E.fire, null);
  for (const v of [a, b, c]) assert.ok(v >= 0.5 * lv.par && v <= 2 * lv.par, `${v} vs ${lv.par}`);
  assert.ok(new Set([a, b, c, lv.par]).size > 1, '영웅마다 따로 돈다');
  assert.equal(C.parFor(lv, E.start, E.fire, { id: 'mungchi', lv: 4 }), a, '캐시');
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
  // v2 필드가 빠진 스냅숏도 숫자가 깨지지 않는다(NaN이면 보스를 못 잡는다)
  const { s: b } = arena(12, { hero: { id: 'nabi', lv: 2 } });
  const o = JSON.parse(JSON.stringify(C.snapshot(b)));
  for (const k of ['pool', 'healAcc', 'recent', 'lossFrac']) delete o.squad[k];
  delete o.hero;
  delete o.boss.bonus;
  for (const bl of o.bullets) delete bl.hm;
  const r = C.restore(o);
  assert.ok(r);
  r.squad.sp = [{ id: 1, k: 'sniper', cd: 0 }];
  for (let i = 0; i < 600 && r.phase === 'arena'; i++) C.step(r, C.botInput(r));
  assert.ok(Number.isFinite(r.boss.hp) && Number.isFinite(r.boss.bonus) && Number.isFinite(r.squad.pool));
  assert.equal(typeof C.stateHash(r), 'number');
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
  assert.equal(CAL.sim, C.SIM, '보정 표의 SIM이 낡았다');
  assert.ok(TABLE_MAX >= 120, `표는 L1~${TABLE_MAX}`);
  for (let L = 1; L <= TABLE_MAX; L++) assert.ok(CAL.levels[L] && CAL.expect[L], `L${L} 없음`);
  // 표본: 튜토리얼·첫 레벨들(배치 검사·보스 올리기)·일반·쉼·어려움(무리 보정)·매우 어려움 — 워커로 나눠 다시 보정
  const sample = [1, 3, 8, 10, 13, 16, 25, 44];
  const out = await Promise.all(sample.map((L) => POOL.run({ kind: 'cal', L })));
  sample.forEach((L, i) => { for (const f of C.CAL_FIELDS) assert.equal(CAL.levels[L][f], out[i][f], `L${L} ${f}`); });
});
