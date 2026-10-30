/* 측정용 봇 묶음 — tests/run.mjs와 tools/bench.mjs가 함께 쓴다. DOM 없음, core.js 내보내기만 쓴다.
   봇은 정책 함수 f(s) → 입력 { dir, tx, skill } 이다. 같은 시드면 늘 같은 입력을 낸다(결정적).
   상태가 있는 봇은 f.st에 평범한 객체로 상태를 두고 f.clone()으로 복제된다(판을 갈라 보는 도구용).
   skill: 영웅 스킬을 C.heroWants 규칙으로 자동 사용할지. 기본값은 strong만 켬(C.botInput과 같게), 나머지는 끔.

   봇과 사람의 대응(가정 — 플레이테스트로 확인):
   - strong   기준 봇(C.botInput). 실현 가능성 증명이지 사람이 아니다
   - expert   strong의 판단 + 0.2초 늦은 반응 + 가끔(3%) 엉뚱한 곳 — 숙련자 대리
   - sloppy   0.3초 늦은 반응, 게이트 쏘기·상자 모름, err 확률로 엉뚱한 곳 — 0.1은 집중한 일반 플레이어, 0.3은 산만한 초보
   - naive    보이는 숫자로 가장 커 보이는 칸, 쏘기·피하기 없음
   - misjudge sloppy와 같은 손놀림 + 결과가 15% 안으로 비슷한 줄에서 30% 틀린 칸 — 계산 실수형
   - 꼼수: idle(가만히), random(마구), hold(x 고정), worst(늘 가장 나쁜 칸) */
import * as C from '../assets/core.js';

/* mulberry32 — 상태를 객체에 둬서 복제할 수 있게 */
function next(st) {
  st.a = (st.a + 0x6D2B79F5) >>> 0;
  let t = st.a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function rng(seed) {
  const st = { a: seed >>> 0 };
  return () => next(st);
}

const skillOf = (opt, dflt = false) => (typeof opt === 'boolean' ? opt : opt && opt.skill != null ? !!opt.skill : dflt);
const withSkill = (s, inp, on) => { if (on) inp.skill = C.heroWants(s); else if (inp.skill) inp.skill = false; return inp; };
const center = (c) => Math.max(-C.EDGE, Math.min(C.EDGE, (c.x0 + c.x1) / 2));
/* 다음에 지날, 아직 안 지난 게이트 줄(sight m 안) */
function nextRow(s, sight = 40, multi = false) {
  const q = s.squad;
  let row = null;
  for (const r of s.rows) if (!r.done && r.z > q.z && r.z - q.z < sight && (!multi || r.cells.length > 1)) { if (!row || r.z < row.z) row = r; }
  return row;
}
function mark(f, name, st, clone) {
  f.botName = name;
  if (st) f.st = st;
  f.clone = clone || (() => f);
  return f;
}

/* 늦은 반응 + 가끔 엉뚱한 곳: 목표 기록(hist)에서 lag 틱 전 값을 쓰고, 1초마다 err 확률로 0.5~1.15초 동안 아무 데나 간다.
   tests/run.mjs의 옛 sloppy와 같은 난수 순서·같은 결과(기록은 40개를 넘으면 뒤 20개만 남긴다 — lag ≤ 19 틱이면 같은 값) */
function lagged(st, s, target, lag, err) {
  st.hist.push(target);
  if (st.hist.length > 40) st.hist.splice(0, st.hist.length - 20);
  let tx = st.hist.length > lag ? st.hist[st.hist.length - 1 - lag] : 0;
  if (s.tick % 60 === 0 && next(st) < err) { st.wrongUntil = s.tick + 30 + Math.floor(next(st) * 40); st.wrongX = (next(st) * 2 - 1) * 4; }
  if (s.tick < st.wrongUntil) tx = st.wrongX;
  return tx;
}

/* ---------- 실력 봇 ---------- */
/* strong: 기준 봇 그대로. opt.pump/crates/specials는 botTarget 옵션 */
export function strong(opt = {}) {
  const on = skillOf(opt, true);
  const bo = typeof opt === 'object' ? { pump: opt.pump, crates: opt.crates, specials: opt.specials } : undefined;
  const f = (s) => withSkill(s, C.steer(s, C.botTarget(s, bo)), on);
  return mark(f, on ? 'strong' : 'strong-noskill');
}

/* expert: strong의 판단을 0.2초(lag 12틱) 늦게, 1초마다 3% 확률로 엉뚱한 곳 */
export function expert(seed, opt = {}) {
  const err = opt.err ?? 0.03;
  const lag = opt.lag ?? 12;
  const on = skillOf(opt, false);
  const st = { a: seed >>> 0, hist: [], wrongUntil: -1, wrongX: 0 };
  const f = (s) => withSkill(s, C.steer(s, lagged(st, s, C.botTarget(s), lag, err)), on);
  return mark(f, 'expert', st, () => { const g = expert(seed, opt); Object.assign(g.st, structuredClone(st)); return g; });
}

/* sloppy(seed, err, {skill}) — 사람 흉내 봇: 0.3초(18틱) 늦은 반응, 게이트를 쏴서 올리는 효과·상자를 모르고 겉보기 숫자로, 가끔 엉뚱한 곳.
   세 번째 인자는 { skill } 또는 true/false */
export function sloppy(seed, err = 0.1, opt = {}) {
  const on = skillOf(opt, false);
  const lag = (typeof opt === 'object' && opt.lag) || 18;
  const st = { a: seed >>> 0, hist: [], wrongUntil: -1, wrongX: 0 };
  const f = (s) => withSkill(s, C.steer(s, lagged(st, s, C.botTarget(s, { pump: false, crates: false }), lag, err)), on);
  return mark(f, `sloppy${err}`, st, () => { const g = sloppy(seed, err, opt); Object.assign(g.st, structuredClone(st)); return g; });
}

/* naive: 앞 줄에서 '지금 병력에 겉보기 숫자를 적용한 결과'가 가장 큰 칸(금색 칸은 +0.5)의 가운데로 간다.
   게이트를 일부러 쏘지 않고, 벽·무리·톱날·독침·상자·내려찍기를 신경 쓰지 않는다. 0.3초(18틱) 늦게.
   opt.dodgeBoss=true면 보스전에서만 기준 봇의 내려찍기 피하기를 쓴다(기본 끔) */
export function naive(seed = 0, opt = {}) {
  if (typeof seed === 'object') { opt = seed; seed = 0; }
  const lag = opt.lag ?? 18;
  const on = skillOf(opt, false);
  const st = { hist: [], lastX: 0 };
  const f = (s) => {
    const q = s.squad;
    let tx = st.lastX;
    if (s.phase === 'arena' && s.boss) {
      if (opt.dodgeBoss) tx = C.botTarget(s);
    } else {
      const row = nextRow(s, 45);
      if (row) {
        let best = -Infinity;
        let bi = 0;
        row.cells.forEach((c, i) => {
          const v = C.applyOp(q.n, c.op, c.v) + (c.op === 'unit' ? 0.5 : 0);
          if (v > best) { best = v; bi = i; }
        });
        tx = center(row.cells[bi]);
      }
    }
    st.lastX = tx;
    st.hist.push(tx);
    if (st.hist.length > 200) st.hist.splice(0, 100);
    const use = lag ? (st.hist.length > lag ? st.hist[st.hist.length - 1 - lag] : 0) : tx;
    return withSkill(s, C.steer(s, use), on);
  };
  return mark(f, 'naive', st, () => { const g = naive(seed, opt); Object.assign(g.st, structuredClone(st)); return g; });
}

/* misjudge: sloppy와 같은 손놀림(lag 18, err 0.1, 쏘기·상자 모름) + 계산 실수.
   줄이 처음 보일 때(40m 안) 겉보기 결과 1등과 2등이 within(15%) 안이면 wrong(30%) 확률로 2등 칸 가운데로 간다.
   줄마다 한 번만 정하고(st.rows), 틀린 줄 수는 st.miss에 센다 */
export function misjudge(seed, opt = {}) {
  const wrong = opt.wrong ?? 0.3;
  const within = opt.within ?? 0.15;
  const lag = opt.lag ?? 18;
  const err = opt.err ?? 0.1;
  const on = skillOf(opt, false);
  const st = { a: seed >>> 0, hist: [], wrongUntil: -1, wrongX: 0, rows: {}, close: 0, miss: 0 };
  const f = (s) => {
    let t = C.botTarget(s, { pump: false, crates: false });
    if (s.phase === 'run') {
      const row = nextRow(s, 40, true);
      if (row) {
        let d = st.rows[row.id];
        if (d === undefined) {
          const n = s.squad.n;
          const order = row.cells.map((c, i) => ({ v: C.applyOp(n, c.op, c.v), i })).sort((a, b) => b.v - a.v || a.i - b.i);
          const close = order[0].v > 0 && order[0].v - order[1].v <= within * Math.abs(order[0].v);
          d = -1;
          if (close) { st.close++; if (next(st) < wrong) { d = order[1].i; st.miss++; } }
          st.rows[row.id] = d;
        }
        if (d >= 0) t = center(row.cells[d]);
      }
    }
    return withSkill(s, C.steer(s, lagged(st, s, t, lag, err)), on);
  };
  return mark(f, 'misjudge', st, () => { const g = misjudge(seed, opt); Object.assign(g.st, structuredClone(st)); return g; });
}

/* ---------- 꼼수 봇(상한을 재는 용도) ---------- */
export function idle(opt = {}) {
  const on = skillOf(opt, false);
  return mark((s) => withSkill(s, { dir: 0, tx: null }, on), 'idle');
}
/* random: 50틱마다 아무 x로(tests/run.mjs의 옛 random과 같은 난수 순서) */
export function random(seed, opt = {}) {
  const on = skillOf(opt, false);
  const st = { a: seed >>> 0, tx: 0 };
  const f = (s) => { if (s.tick % 50 === 0) st.tx = (next(st) * 2 - 1) * 4.4; return withSkill(s, C.steer(s, st.tx), on); };
  return mark(f, 'random', st, () => { const g = random(seed, opt); Object.assign(g.st, structuredClone(st)); return g; });
}
/* hold: 판 내내 한 자리(피하기 없음) */
export const HOLD_XS = [-4.4, -2.5, 0, 2.5, 4.4];
export function hold(x, opt = {}) {
  const on = skillOf(opt, false);
  return mark((s) => withSkill(s, C.steer(s, x), on), `hold${x}`);
}
/* worst: 손놀림은 sloppy(err)인데, 칸이 둘 이상인 줄이 40m 안에 오면 그때 겉보기 결과가 가장 나쁜 칸을 정해(줄마다 한 번)
   그 칸 가운데로 곧장 간다(늦지 않게). 쏘아서 숫자가 바뀌어도 처음 고른 칸을 지킨다. opt.mode='second'면 두 번째로 좋은 칸 */
export function worst(seed, opt = {}) {
  const err = opt.err ?? 0.1;
  const on = skillOf(opt, false);
  const sl = sloppy(seed, err, { skill: on });
  const st = { sl: sl.st, pick: {} };
  const f = (s) => {
    const base = sl(s);
    if (s.phase !== 'run') return base;
    const row = nextRow(s, 40, true);
    if (!row) return base;
    let i = st.pick[row.id];
    if (i === undefined) {
      const n = s.squad.n;
      const v = row.cells.map((c, k) => ({ v: C.applyOp(n, c.op, c.v), k })).sort((a, b) => a.v - b.v || a.k - b.k);
      i = st.pick[row.id] = (opt.mode === 'second' ? v[v.length - 2] : v[0]).k;
    }
    return withSkill(s, C.steer(s, center(row.cells[i]), 0.1), on);
  };
  return mark(f, opt.mode === 'second' ? 'second' : 'worst', st, () => {
    const g = worst(seed, opt);
    Object.assign(g.st.sl, structuredClone(st.sl));
    g.st.pick = { ...st.pick };
    return g;
  });
}

/* ---------- 이름으로 만들기(벤치·도구용) ----------
   makeBot('sloppy0.1', seed, { skill }) / 'sloppy0.3' / 'expert' / 'strong' / 'naive' / 'misjudge' / 'idle' / 'random' / 'hold2.5' / 'worst'.
   이름 끝의 '-noskill'은 skill을 끈다. seeded=false인 봇은 시드와 상관없이 같은 판을 돈다(한 번만 돌리면 된다). */
export const BOT_INFO = {
  strong: { seeded: false, skill: true, desc: '기준 봇(C.botInput)' },
  expert: { seeded: true, skill: true, desc: 'strong 판단, 0.2초 지연, 3% 실수' },
  sloppy: { seeded: true, skill: true, desc: '0.3초 지연, 쏘기·상자 모름, err 실수' },
  naive: { seeded: false, skill: true, desc: '겉보기 큰 숫자, 쏘기·피하기 없음' },
  misjudge: { seeded: true, skill: true, desc: 'sloppy0.1 + 비슷한 줄 30% 오판' },
  idle: { seeded: false, skill: true, desc: '가만히' },
  random: { seeded: true, skill: true, desc: '마구(50틱마다 아무 데나)' },
  hold: { seeded: false, skill: true, desc: 'x 고정' },
  worst: { seeded: true, skill: true, desc: '늘 가장 나쁜 칸' },
};
export function botKind(name) {
  const base = name.replace(/-noskill$/, '');
  if (base.startsWith('sloppy')) return 'sloppy';
  if (base.startsWith('hold')) return 'hold';
  return base;
}
export function makeBot(name, seed = 0, opt = {}) {
  const noskill = name.endsWith('-noskill');
  const base = noskill ? name.slice(0, -8) : name;
  const o = { ...opt, skill: noskill ? false : opt.skill ?? true };
  if (base === 'strong') return strong(o);
  if (base === 'expert') return expert(seed, o);
  if (base.startsWith('sloppy')) return sloppy(seed, Number(base.slice(6) || 0.1), o);
  if (base === 'naive') return naive(seed, o);
  if (base === 'misjudge') return misjudge(seed, o);
  if (base === 'idle') return idle(o);
  if (base === 'random') return random(seed, o);
  if (base.startsWith('hold')) return hold(Number(base.slice(4)), o);
  if (base === 'worst') return worst(seed, o);
  if (base === 'second') return worst(seed, { ...o, mode: 'second' });
  throw new Error(`모르는 봇: ${name}`);
}
