/* 숫자부대 돌격 — 시뮬레이션 코어 (DOM 없음)
   - 고정 틱 DT, 시드 난수(mulberry32). 상태는 평범한 객체라 structuredClone으로 복제된다.
   - 화면·소리·진동은 state.ev(이번 틱에 생긴 일)만 보고 반응한다.
   - 레벨은 레벨 번호로 정해진다(모두에게 같다). 보스 체력과 별 기준은 기준 봇이 강화 없이 한 판 돌아 정한다. */

export const DT = 1 / 60;
export const ROAD = 5;            // 도로 반폭
export const EDGE = 4.4;          // 분대 중심이 갈 수 있는 끝
export const SOLDIER_HP = 10;     // 부딪히면 남은 체력 10마다 병사 1명을 잃는다
export const MAX_N = 9999;
export const START_N = 12;
export const VOLLEY_HZ = 10;
export const BULLET_SPEED = 48;
export const BULLET_RANGE = 30;
export const WEAPON = [1, 1.35, 1.7, 2.1];
export const WAKE = 45;           // 이 거리 안에 들어온 적이 다가오기 시작
export const BOSS_GAP = 28;       // 보스가 나타나는 거리
export const VERSION = 'squad-v1';

/* 메커닉이 처음 나오는 레벨 */
export const UNLOCK = { mul: 2, shoot: 2, wall: 3, summon: 3, crate: 4, runner: 4, spit: 5, saw: 6, brute: 7, div: 8, triple: 10, mul3: 10 };
const has = (L, m) => L >= UNLOCK[m];

/* ---------- 난수 ---------- */
export function hash(...xs) {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    const s = String(x);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x9e; h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
export function rand(o) {
  o.rs = (o.rs + 0x6D2B79F5) >>> 0;
  let t = o.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const U = (o, a, b) => a + (b - a) * rand(o);
const chance = (o, p) => rand(o) < p;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- 공통 수식 ---------- */
export function dps(n, tier = 0, fireLv = 0) {
  if (n <= 0) return 0;
  return 6 * Math.pow(n, 0.8) * WEAPON[clamp(tier, 0, 3)] * (1 + 0.05 * fireLv);
}
export function radius(n) { return Math.min(2.4, 0.35 + 0.18 * Math.sqrt(Math.max(1, n))); }
export function volleySize(n) { return Math.min(12, 2 + Math.floor(Math.sqrt(Math.max(1, n)))); }

/* 보기 좋은 숫자로 반올림 */
export function nice(x) {
  const a = Math.abs(x);
  const s = x < 0 ? -1 : 1;
  let r;
  if (a < 20) r = Math.round(a);
  else if (a < 100) r = Math.round(a / 5) * 5;
  else if (a < 1000) r = Math.round(a / 10) * 10;
  else r = Math.round(a / 50) * 50;
  return s * r;
}

/* 게이트 연산. 결과가 0 이하면 전멸(덧셈만 가능, 나눗셈은 올림이라 0이 되지 않는다) */
export function applyOp(n, op, v) {
  let r;
  if (op === 'add') r = n + v;
  else if (op === 'mul') r = n * v;
  else r = Math.ceil(n / v);
  return Math.min(MAX_N, r);
}
export function cellLabel(c) {
  if (c.op === 'add') return (c.v >= 0 ? '+' : '−') + Math.abs(c.v);
  if (c.op === 'mul') return '×' + c.v;
  return '÷' + c.v;
}
/* 게이트가 이로운지(파랑) 해로운지(빨강) — 숫자만으로 정한다 */
export function cellGood(c) {
  if (c.op === 'add') return c.v > 0 ? 1 : c.v < 0 ? -1 : 0;
  if (c.op === 'mul') return c.v > 1 ? 1 : 0;
  return -1;
}
/* 접촉 비용: 남은 체력 10마다 병사 1명 */
export const contactCost = (hp) => Math.max(1, Math.ceil(hp / SOLDIER_HP));

/* ---------- 레벨 기준값 ---------- */
export function levelParams(L) {
  const l = Math.max(1, Math.floor(L));
  const k = Math.min(l - 1, 29) / 29;          // L1→0, L30 이후→1
  const over = Math.max(0, l - 30);
  return {
    L: l,
    k,
    speed: 8.5 + 1.5 * k,
    P: Math.round(30 + 8 * Math.pow(l - 1, 1.15)),    // 무난한 플레이로 보스에 도착하는 병력(추정)
    chunks: Math.min(14, 7 + Math.floor(l / 3)),
    pressure: Math.min(1.35, 0.55 + 0.65 * k + 0.005 * over),
    maxMul: l < UNLOCK.mul ? 0 : l < 10 ? 2 : 3,
    bossKill: 7 + 2.5 * k + Math.min(2, over * 0.05),     // 기준 병력의 75%가 보스를 잡는 데 걸리는 초
    slamEvery: 3.2 - 1.0 * k,
    slamWarn: 1.25 - 0.4 * k,
    slamThird: l >= UNLOCK.triple,
  };
}

/* ---------- 레벨 생성 ---------- */
/* 청크 종류: gate(게이트 줄) shoot(통짜 마이너스 게이트) guard(좋은 칸을 지키는 장애물) wave(좀비 무리)
   wall(바리케이드) crate(보급 상자) spit(독침 좀비) saw(톱날) rest(숨 돌리기) */
const GROW_KINDS = ['gate', 'guard'];
const THREAT_KINDS = ['wave', 'shoot', 'wall', 'crate', 'spit', 'saw'];
const KIND_UNLOCK = { gate: 1, wave: 1, rest: 1, shoot: UNLOCK.shoot, guard: UNLOCK.wall, wall: UNLOCK.wall, crate: UNLOCK.crate, spit: UNLOCK.spit, saw: UNLOCK.saw };
const KIND_WEIGHT = { gate: 3, guard: 1.3, wave: 2.6, shoot: 1, wall: 1, crate: 1.1, spit: 0.9, saw: 1.1 };
/* 레벨마다 처음 소개하는 청크 */
const INTRO = { 2: 'shoot', 3: 'wall', 4: 'crate', 5: 'spit', 6: 'saw' };

function weighted(o, kinds, L, avoid) {
  let list = kinds.filter((k) => L >= KIND_UNLOCK[k] && k !== avoid);
  if (!list.length) list = kinds.filter((k) => L >= KIND_UNLOCK[k]);
  let sum = 0;
  for (const k of list) sum += KIND_WEIGHT[k];
  let r = rand(o) * sum;
  for (const k of list) { r -= KIND_WEIGHT[k]; if (r <= 0) return k; }
  return list[list.length - 1];
}

function planChunks(p, g) {
  const K = p.chunks;
  const plan = [];
  const intro = INTRO[p.L];
  let lastThreat = '';
  for (let i = 0; i < K; i++) {
    let kind;
    if (i === 0) kind = 'gate';
    else if (i === K - 1) kind = 'gate';
    else if (intro && i === 1) kind = intro;
    else if (i % 5 === 4) kind = 'rest';
    else if (GROW_KINDS.includes(plan[i - 1])) kind = weighted(g, THREAT_KINDS, p.L, p.L < 10 ? lastThreat : '');
    else kind = weighted(g, GROW_KINDS, p.L, '');
    if (THREAT_KINDS.includes(kind)) lastThreat = kind;
    plan.push(kind);
  }
  return plan;
}

function lanes(count) {
  const out = [];
  const w = (2 * ROAD) / count;
  for (let i = 0; i < count; i++) out.push({ x0: -ROAD + i * w, x1: -ROAD + (i + 1) * w });
  return out;
}

export function makeCell(op, v, ng, x0, x1) {
  const c = { op, v, v0: v, x0, x1, step: 0, acc: 0, cap: v, hitT: -9 };
  if (op === 'add') {
    // 사거리에 들어온 뒤로 끊김 없이 쏘면(약 3초) 기준 병력의 40%쯤 오른다
    c.step = (dps(ng) * 3.2) / (0.4 * Math.max(ng, 6));
    c.cap = v + Math.max(10, nice(ng * 0.6));
  }
  return c;
}

/* 기준 플레이(골든 패스)가 이 칸을 고르면 몇 명이 되나 — 덧셈 칸은 쏴서 올린다고 본다 */
function goldenValue(n, c) {
  const v = c.op === 'add' ? Math.min(c.cap, c.v + Math.floor(0.3 * n)) : c.v;
  return applyOp(n, c.op, v);
}

function addFoe(lv, g, kind, x, z, hp) {
  const base = {
    grunt: { r: 0.42, spd: 2.6, home: 0.9, homeDist: 18 },
    runner: { r: 0.36, spd: 6.2, home: 2.8, homeDist: 26 },
    brute: { r: 0.95, spd: 1.6, home: 0.5, homeDist: 20 },
    spit: { r: 0.5, spd: 0, home: 0, homeDist: 0 },
  }[kind];
  const f = { id: lv.nextId++, kind, x: clamp(x, -4.6, 4.6), z, hp: Math.max(1, Math.round(hp)), max: 0, alive: true, awake: false, hitT: -9, cd: 0, seed: (rand(g) * 1000) | 0, ...base };
  f.max = f.hp;
  if (kind === 'spit') f.cd = 0.6 + rand(g) * 1.2;
  lv.foes.push(f);
  return f;
}

function spawnWave(lv, g, p, z, ng, scale, opt = {}) {
  const D = dps(ng);
  const hp = 0.15 * D;
  let m = Math.max(3, Math.round(13 * p.pressure * scale * U(g, 0.85, 1.15)));
  const placed = [];
  const lane = opt.lane;   // {x0,x1} 이면 그 차선에만
  const x0 = lane ? lane.x0 + 0.6 : -4.4;
  const x1 = lane ? lane.x1 - 0.6 : 4.4;
  let budget = m;
  if (has(p.L, 'brute') && !opt.noBrute && chance(g, 0.35 + 0.2 * p.k)) {
    placed.push(addFoe(lv, g, 'brute', U(g, x0, x1), z + U(g, 4, 8), hp * 10));
    budget -= 6;
  }
  if (has(p.L, 'runner') && !opt.noRunner && chance(g, 0.5)) {
    const rn = Math.min(8, Math.max(2, Math.round(budget * 0.3)));
    for (let i = 0; i < rn; i++) placed.push(addFoe(lv, g, 'runner', U(g, -4, 4), z + 10 + i * 1.6, hp * 0.55));
    budget -= Math.ceil(rn / 2);
  }
  for (let i = 0; i < Math.max(2, budget); i++) placed.push(addFoe(lv, g, 'grunt', U(g, x0, x1), z + U(g, 0, 9), hp));
  return placed;
}

/* 무리가 기준 화력에 얼마나 새어 들어오나(손실 병력 추정) */
function waveLeak(foes, ng, approach = 2.4) {
  let total = 0;
  let cost = 0;
  for (const f of foes) total += f.hp;
  let cap = 0.75 * dps(ng) * approach;
  const sorted = foes.slice().sort((a, b) => a.hp - b.hp);
  for (const f of sorted) {
    if (cap >= f.hp) { cap -= f.hp; continue; }
    cost += contactCost(f.hp - Math.max(0, cap));
    cap = 0;
  }
  return Math.min(cost, Math.max(0, ng - 1));
}

function makeRow(lv, z, cells, ng) {
  const row = { id: lv.nextId++, z, cells, done: false, chosen: -1, ng };
  lv.rows.push(row);
  return row;
}

function gateChoices(g, p, ng, target, ctx) {
  const ratio = target / ng;
  const out = [];
  const third = has(p.L, 'triple') && chance(g, 0.3);
  if (ctx.mulLeft > 0 && ng <= 300 && (ratio > 1.4 || chance(g, 0.25))) {
    ctx.mulLeft--;
    const m = has(p.L, 'mul3') && ng < 40 && chance(g, 0.35) ? 3 : 2;
    out.push(['mul', m]);
    out.push(['add', Math.max(5, nice(ng * U(g, 0.45, 0.85)))]);
  } else {
    const a = Math.max(5, nice(ng * clamp(ratio - 1, 0.25, 1.5) * U(g, 0.85, 1.2)));
    out.push(['add', a]);
    const r = rand(g);
    if (has(p.L, 'div') && r < 0.25) out.push(['div', 2]);
    else if (r < 0.65) out.push(['add', -Math.max(3, nice(ng * U(g, 0.2, 0.45)))]);
    else out.push(['add', Math.max(2, nice(a * U(g, 0.3, 0.6)))]);
  }
  if (third) {
    const r = rand(g);
    if (r < 0.5) out.push(['add', -Math.max(3, nice(ng * U(g, 0.3, 0.6)))]);
    else out.push(['add', Math.max(3, nice(ng * U(g, 0.15, 0.35)))]);
  }
  // '덜 나쁜 쪽' 줄: −a 대 ÷2 (L8부터 가끔, 마지막 두 청크에는 없음)
  if (has(p.L, 'div') && ctx.lessBad > 0 && !ctx.late && out.length === 2 && chance(g, 0.18)) {
    ctx.lessBad--;
    out.length = 0;
    out.push(['div', 2]);
    out.push(['add', -Math.max(5, nice(ng * U(g, 0.25, 0.4)))]);
  }
  // 섞기
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand(g) * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

const CHUNK = {
  rest(lv, g, p, z, ng) {
    return { len: 30, ng };
  },

  gate(lv, g, p, z, ng, target, ctx) {
    const rowZ = z + 30;
    // 첫 판 첫 줄은 고르기 쉬운 +10 대 −5
    const ch = p.L === 1 && !lv.rows.length ? [['add', 10], ['add', -5]] : gateChoices(g, p, ng, target, ctx);
    const ln = lanes(ch.length);
    const cells = ch.map(([op, v], i) => makeCell(op, v, ng, ln[i].x0, ln[i].x1));
    makeRow(lv, rowZ, cells, ng);
    // 게이트 앞을 지키는 졸개 몇 명(L2부터)
    if (p.L >= 2 && chance(g, 0.35)) {
      const m = Math.round(U(g, 3, 6));
      const hp = 0.15 * dps(ng);
      for (let i = 0; i < m; i++) addFoe(lv, g, 'grunt', U(g, -4.2, 4.2), rowZ - 14 + U(g, 0, 4), hp);
      ng -= Math.min(2, Math.floor(m / 3));
    }
    let best = -Infinity;
    for (const c of cells) best = Math.max(best, goldenValue(ng, c));
    return { len: 48, ng: Math.max(1, best) };
  },

  shoot(lv, g, p, z, ng) {
    const rowZ = z + 34;
    const v0 = -Math.max(5, nice(ng * U(g, 0.15, 0.3)));
    makeRow(lv, rowZ, [makeCell('add', v0, ng, -ROAD, ROAD)], ng);
    return { len: 50, ng: Math.max(1, goldenValue(ng, { op: 'add', v: v0, cap: v0 + ng })) };
  },

  guard(lv, g, p, z, ng, target, ctx) {
    const rowZ = z + 34;
    const ratio = target / ng;
    let good;
    if (ctx.mulLeft > 0 && ng <= 300) { ctx.mulLeft--; good = ['mul', 2]; }
    else good = ['add', Math.max(8, nice(ng * clamp(ratio - 1, 0.5, 1.5) * U(g, 1.2, 1.5)))];
    const poor = ['add', Math.max(2, nice(ng * U(g, 0.08, 0.22)))];
    const goodLeft = chance(g, 0.5);
    const ln = lanes(2);
    const cells = goodLeft
      ? [makeCell(good[0], good[1], ng, ln[0].x0, ln[0].x1), makeCell(poor[0], poor[1], ng, ln[1].x0, ln[1].x1)]
      : [makeCell(poor[0], poor[1], ng, ln[0].x0, ln[0].x1), makeCell(good[0], good[1], ng, ln[1].x0, ln[1].x1)];
    makeRow(lv, rowZ, cells, ng);
    const lane = goodLeft ? ln[0] : ln[1];
    let loss = 0;
    if (chance(g, 0.5)) {
      // 바리케이드가 좋은 칸을 막는다
      const hp = dps(ng) * U(g, 0.8, 1.3);
      lv.props.push({ id: lv.nextId++, kind: 'wall', x0: lane.x0 + 0.15, x1: lane.x1 - 0.15, z: rowZ - 11, hp: Math.round(hp), max: Math.round(hp), alive: true, hitT: -9 });
    } else {
      const foes = spawnWave(lv, g, p, rowZ - 20, ng, 0.7, { lane, noBrute: p.L < 12 });
      loss = waveLeak(foes, ng);
    }
    const n2 = Math.max(1, ng - loss);
    return { len: 52, ng: Math.max(n2, goldenValue(n2, good[0] === 'mul' ? { op: 'mul', v: 2 } : { op: 'add', v: good[1], cap: good[1] })) };
  },

  wave(lv, g, p, z, ng) {
    let foes;
    if (chance(g, 0.45)) {
      foes = spawnWave(lv, g, p, z + 26, ng, 1);
    } else {
      // 양쪽으로 나뉜 무리 — 한쪽은 적다
      const ln = lanes(2);
      const big = chance(g, 0.5) ? 0 : 1;
      foes = spawnWave(lv, g, p, z + 26, ng, 0.75, { lane: ln[big] });
      foes = foes.concat(spawnWave(lv, g, p, z + 28, ng, 0.35, { lane: ln[1 - big], noBrute: true, noRunner: true }));
      foes = foes.filter((f) => (big === 0 ? f.x > 0 : f.x < 0) || f.kind === 'runner');
    }
    return { len: 46, ng: Math.max(1, ng - waveLeak(foes, ng)) };
  },

  wall(lv, g, p, z, ng) {
    const D = dps(ng);
    // 세 칸 벽은 분대가 작을 때만(큰 분대는 한 칸에 다 못 들어간다)
    const n = has(p.L, 'triple') && radius(ng) <= 1.4 && chance(g, 0.5) ? 3 : 2;
    const ln = lanes(n);
    const open = Math.floor(rand(g) * n);
    const wz = z + 30;
    ln.forEach((l, i) => {
      // 한 칸은 약한 벽(쏘면 금방 뚫림), 나머지는 단단하다
      const hp = i === open ? D * U(g, 0.5, 0.8) : D * U(g, 2.2, 3.4);
      lv.props.push({ id: lv.nextId++, kind: 'wall', x0: l.x0 + 0.15, x1: l.x1 - 0.15, z: wz, hp: Math.round(hp), max: Math.round(hp), alive: true, hitT: -9 });
    });
    if (p.L >= 5 && chance(g, 0.5)) {
      const hp = 0.15 * D;
      for (let i = 0; i < 4; i++) addFoe(lv, g, 'grunt', U(g, -4, 4), wz + 6 + U(g, 0, 6), hp);
    }
    return { len: 46, ng };
  },

  crate(lv, g, p, z, ng) {
    const D = dps(ng);
    const ln = lanes(2);
    const side = chance(g, 0.5) ? 0 : 1;
    const l = ln[side];
    const cz = z + 32;
    const r = rand(g);
    const reward = r < 0.5 ? { type: 'gun' } : r < 0.85 ? { type: 'men', v: Math.max(5, nice(ng * U(g, 0.25, 0.4))) } : { type: 'coin', v: 10 + 2 * p.L };
    const cx = (l.x0 + l.x1) / 2;
    const hp = Math.round(D * U(g, 1.0, 1.6));
    lv.props.push({ id: lv.nextId++, kind: 'crate', x0: cx - 1.1, x1: cx + 1.1, z: cz, hp, max: hp, alive: true, hitT: -9, reward });
    // 반대쪽에는 위협
    const other = ln[1 - side];
    if (has(p.L, 'saw') && chance(g, 0.4)) {
      lv.saws.push({ id: lv.nextId++, z: cz - 6, x: other.x0 + 1, xa: other.x0 + 0.6, xb: other.x1 - 0.6, spd: 3.5 + 1.5 * p.k, dir: 1, w: 1.1 });
    } else {
      spawnWave(lv, g, p, cz - 4, ng, 0.45, { lane: other, noBrute: true });
    }
    return { len: 48, ng: reward.type === 'men' ? ng + Math.round(reward.v * 0.6) : ng };
  },

  spit(lv, g, p, z, ng) {
    const D = dps(ng);
    const n = p.L >= 12 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const x = -3.4 + (6.8 * (i + 0.5)) / n + U(g, -0.6, 0.6);
      addFoe(lv, g, 'spit', x, z + 40 + U(g, -2, 2), 0.5 * D);
    }
    spawnWave(lv, g, p, z + 30, ng, 0.35, { noBrute: true });
    return { len: 50, ng: Math.max(1, ng - Math.ceil(ng * 0.03)) };
  },

  saw(lv, g, p, z, ng) {
    const n = p.L >= 14 && chance(g, 0.5) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const full = chance(g, 0.5);
      const half = chance(g, 0.5) ? -1 : 1;
      const xa = full ? -ROAD + 0.6 : half < 0 ? -ROAD + 0.6 : 0.2;
      const xb = full ? ROAD - 0.6 : half < 0 ? -0.2 : ROAD - 0.6;
      lv.saws.push({ id: lv.nextId++, z: z + 24 + i * 14, x: U(g, xa, xb), xa, xb, spd: 3.5 + 1.5 * p.k, dir: chance(g, 0.5) ? 1 : -1, w: 1.1 });
    }
    return { len: 46, ng: Math.max(1, ng - Math.ceil(ng * 0.03)) };
  },
};

export function buildLevel(L, attempt = 0) {
  const p = levelParams(L);
  const g = { rs: hash(VERSION, p.L, attempt) };
  const lv = {
    L: p.L, attempt, seed: hash(VERSION, 'run', p.L, attempt), speed: p.speed, params: p,
    rows: [], foes: [], props: [], saws: [], plan: [], golden: [], nextId: 1,
    arenaZ: 0, bossHp: 0, par: 0, arrive: 0,
  };
  const plan = planChunks(p, g);
  lv.plan = plan;
  const ctx = { mulLeft: p.maxMul, lessBad: p.L >= UNLOCK.div ? 1 : 0, late: false };
  let z = 34;
  let ng = START_N;
  for (let i = 0; i < plan.length; i++) {
    ctx.late = i >= plan.length - 2;
    const target = START_N * Math.pow(p.P / START_N, (i + 1) / plan.length);
    // 너무 앞서가면 다음 줄은 덜 주고, 처지면 더 준다
    const t = ng > target * 1.25 ? target * 0.9 : ng < target * 0.8 ? target * 1.15 : target;
    const r = CHUNK[plan[i]](lv, g, p, z, ng, t, ctx);
    z += r.len;
    ng = Math.max(1, Math.round(r.ng));
    lv.golden.push(ng);
  }
  lv.arenaZ = z + 12;
  lv.foes.sort((a, b) => a.z - b.z || a.id - b.id);
  return lv;
}

/* ---------- 게임 상태 ---------- */
export function newGame(lv, opt = {}) {
  const start = opt.start ?? START_N;
  const s = {
    L: lv.L, rs: lv.seed >>> 0, tick: 0, t: 0,
    phase: 'run', endT: 0, cause: '',
    speed: lv.speed, arenaZ: lv.arenaZ, stopZ: lv.arenaZ + 6,
    fireLv: opt.fire ?? 0,
    params: lv.params,
    squad: { x: 0, vx: 0, z: 0, vz: lv.speed, n: start, peak: start, tier: 0, fireAcc: 0, volley: 0, lossAcc: 0, hurtT: -9, lastGain: 0 },
    rows: structuredClone(lv.rows),
    foes: structuredClone(lv.foes),
    props: structuredClone(lv.props),
    saws: structuredClone(lv.saws),
    spits: [],
    bullets: [],
    boss: null,
    bossHp: lv.bossHp,
    bossRef: lv.arrive || lv.params.P,
    nextId: lv.nextId + 1,
    ev: [],
    stats: { kills: 0, killHp: 0, lost: 0, gained: 0, coins: 0, crates: 0, gates: 0, bossT: 0, spawned: start },
  };
  return s;
}

function emit(s, e) { s.ev.push(e); }

function lose(s, k, cause, x, z) {
  const q = s.squad;
  if (k <= 0 || q.n <= 0) return;
  const real = Math.min(q.n, k);
  q.n -= real;
  q.hurtT = s.t;
  s.stats.lost += real;
  emit(s, { t: 'loss', n: real, cause, x: x ?? q.x, z: z ?? q.z });
  if (q.n <= 0) { s.cause = cause; }
}

function gain(s, k, x, z, why) {
  const q = s.squad;
  const before = q.n;
  q.n = Math.min(MAX_N, q.n + k);
  s.stats.gained += q.n - before;
  q.peak = Math.max(q.peak, q.n);
  emit(s, { t: 'gain', n: q.n - before, why, x: x ?? q.x, z: z ?? q.z });
}

/* 입력: { dir: -1|0|1, tx: 목표 x 또는 null } */
export function step(s, input) {
  s.ev.length = 0;
  if (s.phase === 'won' || s.phase === 'lost') { s.endT += DT; s.tick++; s.t += DT; return s; }
  s.tick++;
  s.t += DT;
  const q = s.squad;
  const R = radius(q.n);

  /* 좌우 이동 */
  const tx = input && input.tx != null ? clamp(input.tx, -EDGE, EDGE) : null;
  if (tx != null) {
    const want = clamp((tx - q.x) * 12, -16, 16);
    q.vx = want;
  } else {
    const dir = input ? input.dir | 0 : 0;
    if (dir) q.vx = clamp(q.vx + dir * 80 * DT, -11, 11);
    else q.vx = Math.abs(q.vx) <= 100 * DT ? 0 : q.vx - Math.sign(q.vx) * 100 * DT;
    if (dir && Math.sign(q.vx) !== dir && q.vx !== 0) q.vx += dir * 60 * DT;   // 방향 전환은 더 빠르게
  }
  q.x += q.vx * DT;
  if (q.x < -EDGE) { q.x = -EDGE; if (q.vx < 0) q.vx = 0; }
  if (q.x > EDGE) { q.x = EDGE; if (q.vx > 0) q.vx = 0; }

  /* 전진 */
  if (s.phase === 'run') {
    q.vz = s.speed;
    q.z += q.vz * DT;
    if (q.z >= s.arenaZ) enterArena(s);
  } else if (s.phase === 'arena') {
    const left = s.stopZ - q.z;
    q.vz = left > 0 ? Math.min(s.speed, Math.max(1.5, left * 2.2)) : 0;
    q.z = Math.min(s.stopZ, q.z + q.vz * DT);
  }

  rowsUpdate(s);
  propsUpdate(s, R);
  sawsUpdate(s, R);
  foesUpdate(s, R);
  spitsUpdate(s, R);
  fire(s, R);
  bulletsUpdate(s);
  if (s.boss) bossUpdate(s, R);

  if (q.n <= 0 && s.phase !== 'lost') {
    q.n = 0;
    s.phase = 'lost';
    s.endT = 0;
    if (!s.cause) s.cause = 'foe';
    emit(s, { t: 'lose', cause: s.cause });
  }
  return s;
}

function enterArena(s) {
  s.phase = 'arena';
  const p = s.params;
  const hp = s.bossHp > 0 ? s.bossHp : Math.round(dps(s.bossRef) * p.bossKill);
  s.boss = {
    z: s.stopZ + BOSS_GAP, x: 0, hp, max: hp, r: 2.5, walk: 1.3, hitT: -9,
    slam: null, slamCd: 2.2, summonCd: 4.5, enraged: false, clashCd: 0, clash: false, t: 0,
  };
  // 남은 잡몹은 정리한다(경기장에서는 보스에게 집중)
  for (const f of s.foes) if (f.alive && f.z > s.stopZ + 4) f.alive = false;
  emit(s, { t: 'boss' });
}

function rowsUpdate(s) {
  const q = s.squad;
  for (const row of s.rows) {
    if (row.done || q.z < row.z) continue;
    row.done = true;
    let idx = 0;
    for (let i = 0; i < row.cells.length; i++) if (q.x >= row.cells[i].x0) idx = i;
    row.chosen = idx;
    const c = row.cells[idx];
    const before = q.n;
    const after = applyOp(before, c.op, c.v);
    s.stats.gates++;
    emit(s, { t: 'gate', op: c.op, v: c.v, before, after, good: after >= before, x: (c.x0 + c.x1) / 2, z: row.z, row: row.id });
    if (after > before) gain(s, after - before, q.x, row.z, 'gate');
    else if (after < before) {
      if (after <= 0) { lose(s, before, 'gate'); }
      else lose(s, before - after, 'gate');
    }
  }
}

function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

function propsUpdate(s, R) {
  const q = s.squad;
  for (const p of s.props) {
    if (!p.alive) continue;
    if (q.z + 0.55 * R < p.z) continue;
    p.alive = false;
    if (p.kind === 'crate') { emit(s, { t: 'crateMiss', x: (p.x0 + p.x1) / 2, z: p.z }); continue; }
    const ov = overlap(q.x - R, q.x + R, p.x0, p.x1) / (2 * R);
    if (ov <= 0) { emit(s, { t: 'wallPass', id: p.id }); continue; }
    const k = Math.ceil((p.hp / SOLDIER_HP) * Math.min(1, ov * 2));
    emit(s, { t: 'wallCrash', x: (p.x0 + p.x1) / 2, z: p.z, n: k });
    lose(s, Math.max(1, k), 'wall');
  }
}

function sawsUpdate(s, R) {
  const q = s.squad;
  for (const w of s.saws) {
    w.x += w.dir * w.spd * DT;
    if (w.x > w.xb) { w.x = w.xb; w.dir = -1; }
    if (w.x < w.xa) { w.x = w.xa; w.dir = 1; }
    if (Math.abs(w.z - q.z) < 0.55 * R + 0.35 && Math.abs(w.x - q.x) < R + w.w / 2) {
      q.lossAcc += (4 + 0.35 * q.n) * DT;
      if (q.lossAcc >= 1) {
        const k = Math.floor(q.lossAcc);
        q.lossAcc -= k;
        lose(s, k, 'saw', w.x, w.z);
      }
    }
  }
}

function foesUpdate(s, R) {
  const q = s.squad;
  for (const f of s.foes) {
    if (!f.alive) continue;
    const dz = f.z - q.z;
    if (!f.awake) {
      if (dz < WAKE) f.awake = true;
      else continue;
    }
    if (f.kind === 'spit') {
      if (s.phase === 'run' && dz < 32 && dz > 6) {
        f.cd -= DT;
        if (f.cd <= 0) {
          f.cd = 2.4;
          const T = 1.0;
          s.spits.push({ id: s.nextId++, x: q.x, z: q.z + q.vz * T, sx: f.x, sz: f.z, t: T, T });
          emit(s, { t: 'spitFire', x: f.x, z: f.z });
        }
      }
    } else {
      f.z -= f.spd * DT;
      if (dz < f.homeDist) {
        const d = q.x - f.x;
        const m = f.home * DT;
        f.x += d > m ? m : d < -m ? -m : d;
      }
    }
    if (Math.abs(f.z - q.z) < 0.55 * R + f.r && Math.abs(f.x - q.x) < R + f.r * 0.8) {
      f.alive = false;
      emit(s, { t: 'bite', kind: f.kind, x: f.x, z: f.z });
      lose(s, contactCost(f.hp), f.kind === 'brute' ? 'brute' : 'foe', f.x, f.z);
      continue;
    }
    if (f.z < q.z - 4) f.alive = false;   // 지나쳐 갔다
  }
  // 죽은 적은 가끔 걸러낸다
  if ((s.tick & 63) === 0) s.foes = s.foes.filter((f) => f.alive || f.z > q.z + 60);
}

function spitsUpdate(s, R) {
  const q = s.squad;
  for (const sp of s.spits) {
    sp.t -= DT;
    if (sp.t > 0) continue;
    const ov = overlap(q.x - R, q.x + R, sp.x - 1.2, sp.x + 1.2) / (2 * R);
    const hit = ov > 0 && Math.abs(sp.z - q.z) < R + 1.5;
    emit(s, { t: 'spitHit', x: sp.x, z: sp.z, hit });
    if (hit) lose(s, Math.max(1, Math.ceil(0.3 * ov * q.n)), 'spit', sp.x, sp.z);
  }
  if (s.spits.length) s.spits = s.spits.filter((sp) => sp.t > 0);
}

function fire(s, R) {
  const q = s.squad;
  if (q.n <= 0) return;
  q.fireAcc += DT;
  const per = 1 / VOLLEY_HZ;
  while (q.fireAcc >= per) {
    q.fireAcc -= per;
    q.volley++;
    const b = volleySize(q.n);
    const dmg = dps(q.n, q.tier, s.fireLv) / (VOLLEY_HZ * b);
    const span = R + 0.3;
    for (let i = 0; i < b; i++) {
      // 고르게 퍼뜨리되 매번 조금씩 어긋나게(황금비 수열 — 난수를 쓰지 않는다)
      const j = ((q.volley * 0.618034 + i * 0.381966) % 1) - 0.5;
      const x = q.x - span + ((i + 0.5 + j * 0.8) / b) * 2 * span;
      s.bullets.push({ x, z: q.z + 0.4 * R, d: 0, dmg });
    }
    emit(s, { t: 'shot', b });
  }
}

function bulletsUpdate(s) {
  const q = s.squad;
  const adv = BULLET_SPEED * DT;
  const list = s.bullets;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const z0 = b.z;
    const z1 = z0 + adv;
    let bestZ = Infinity;
    let hitKind = 0;
    let hitObj = null;
    let hitCell = null;
    // 게이트(덧셈 칸만 총알을 받는다)
    for (const row of s.rows) {
      if (row.done || row.z <= z0 || row.z > z1 + 0.0001) continue;
      for (const c of row.cells) {
        if (c.op !== 'add' || b.x < c.x0 || b.x >= c.x1) continue;
        if (row.z < bestZ) { bestZ = row.z; hitKind = 1; hitObj = row; hitCell = c; }
      }
    }
    for (const p of s.props) {
      if (!p.alive || p.z <= z0 - 0.4 || p.z > z1 + 0.4 || b.x < p.x0 || b.x > p.x1) continue;
      if (p.z < bestZ) { bestZ = p.z; hitKind = 2; hitObj = p; }
    }
    for (const f of s.foes) {
      if (!f.alive || f.z < z0 - f.r || f.z > z1 + f.r) continue;
      if (Math.abs(f.x - b.x) > f.r + 0.12) continue;
      if (f.z < bestZ) { bestZ = f.z; hitKind = 3; hitObj = f; }
    }
    const bo = s.boss;
    if (bo && bo.hp > 0 && bo.z - 1 <= z1 && Math.abs(bo.x - b.x) < bo.r + 0.3 && bo.z - 1 < bestZ) { bestZ = bo.z - 1; hitKind = 4; hitObj = bo; }

    if (hitKind === 1) {
      const c = hitCell;
      c.acc += b.dmg;
      c.hitT = s.t;
      let ticks = 0;
      while (c.acc >= c.step && c.v < c.cap) { c.acc -= c.step; c.v++; ticks++; }
      if (c.v >= c.cap) c.acc = 0;
      if (ticks) emit(s, { t: 'tick', row: hitObj.id, v: c.v, x: b.x, z: hitObj.z });
      continue;
    }
    if (hitKind === 2) {
      const p = hitObj;
      p.hp -= b.dmg;
      p.hitT = s.t;
      if (p.hp <= 0) {
        p.alive = false;
        if (p.kind === 'crate') openCrate(s, p);
        else emit(s, { t: 'wallBreak', x: (p.x0 + p.x1) / 2, z: p.z });
      }
      continue;
    }
    if (hitKind === 3) {
      const f = hitObj;
      f.hp -= b.dmg;
      f.hitT = s.t;
      if (f.hp <= 0) {
        f.alive = false;
        s.stats.kills++;
        s.stats.killHp += f.max;
        emit(s, { t: 'kill', kind: f.kind, x: f.x, z: f.z });
      }
      continue;
    }
    if (hitKind === 4) {
      bo.hp -= b.dmg;
      bo.hitT = s.t;
      continue;
    }
    b.z = z1;
    b.d += adv;
    if (b.d < BULLET_RANGE) list[w++] = b;
  }
  list.length = w;
  void q;
}

function openCrate(s, p) {
  const q = s.squad;
  const r = p.reward;
  s.stats.crates++;
  const x = (p.x0 + p.x1) / 2;
  if (r.type === 'gun') {
    if (q.tier < 3) { q.tier++; emit(s, { t: 'crate', type: 'gun', tier: q.tier, x, z: p.z }); }
    else { gain(s, Math.max(5, nice(q.n * 0.2)), x, p.z, 'crate'); emit(s, { t: 'crate', type: 'men', x, z: p.z }); }
  } else if (r.type === 'men') {
    gain(s, r.v, x, p.z, 'crate');
    emit(s, { t: 'crate', type: 'men', v: r.v, x, z: p.z });
  } else {
    s.stats.coins += r.v;
    emit(s, { t: 'crate', type: 'coin', v: r.v, x, z: p.z });
  }
}

function bossUpdate(s, R) {
  const q = s.squad;
  const b = s.boss;
  const p = s.params;
  if (b.hp <= 0) {
    if (s.phase !== 'won') {
      s.phase = 'won';
      s.endT = 0;
      s.stats.bossT = b.t;
      emit(s, { t: 'bossDead', x: b.x, z: b.z });
      emit(s, { t: 'win' });
    }
    return;
  }
  b.t += DT;
  if (!b.enraged && b.hp < b.max * 0.5) { b.enraged = true; emit(s, { t: 'enrage' }); }
  // 분대 쪽으로 천천히 따라온다
  const d = q.x - b.x;
  const m = 1.2 * DT;
  b.x = clamp(b.x + (d > m ? m : d < -m ? -m : d), -2.5, 2.5);
  const reach = q.z + 0.55 * R + b.r * 0.6;
  if (b.z > reach) {
    b.z = Math.max(reach, b.z - b.walk * (b.enraged ? 1.25 : 1) * DT);
  } else if (!b.clash) {
    b.clash = true;
    b.clashCd = 0.3;
    emit(s, { t: 'clash' });
  }
  if (b.clash) {
    b.clashCd -= DT;
    if (b.clashCd <= 0) {
      b.clashCd = 0.5;
      emit(s, { t: 'stomp', x: b.x, z: b.z });
      lose(s, Math.ceil(0.12 * q.n) + 1, 'boss');
    }
    return;
  }
  // 내려찍기
  if (b.slam) {
    b.slam.t -= DT;
    if (b.slam.t <= 0) {
      const hit = q.x >= b.slam.x0 && q.x <= b.slam.x1;
      emit(s, { t: 'slam', x0: b.slam.x0, x1: b.slam.x1, hit });
      if (hit) lose(s, Math.ceil(0.18 * q.n), 'boss');
      b.slam = null;
      b.slamCd = p.slamEvery * (b.enraged ? 0.8 : 1);
    }
  } else {
    b.slamCd -= DT;
    if (b.slamCd <= 0) {
      const parts = p.slamThird ? 3 : 2;
      const ln = lanes(parts);
      let idx = 0;
      for (let i = 0; i < parts; i++) if (q.x >= ln[i].x0) idx = i;
      if (rand(s) < 0.3) idx = (idx + 1 + Math.floor(rand(s) * (parts - 1))) % parts;
      const warn = p.slamWarn;
      b.slam = { x0: ln[idx].x0, x1: ln[idx].x1, t: warn, T: warn };
      emit(s, { t: 'slamWarn', x0: ln[idx].x0, x1: ln[idx].x1 });
    }
  }
  // 졸개 소환
  if (s.L >= UNLOCK.summon) {
    b.summonCd -= DT;
    if (b.summonCd <= 0) {
      b.summonCd = 5.5;
      const m = Math.min(8, 3 + Math.floor(s.L / 5));
      const hp = 0.08 * dps(s.bossRef);
      for (let i = 0; i < m; i++) {
        const f = { id: s.nextId++, kind: 'grunt', x: clamp(b.x + (rand(s) - 0.5) * 6, -4.4, 4.4), z: b.z - 2 - rand(s) * 3, hp: Math.max(1, Math.round(hp)), max: 0, alive: true, awake: true, hitT: -9, cd: 0, seed: (rand(s) * 1000) | 0, r: 0.42, spd: 2.6, home: 0.9, homeDist: 18 };
        f.max = f.hp;
        s.foes.push(f);
      }
      emit(s, { t: 'summon', n: m });
    }
  }
}

/* ---------- 봇 ---------- */
/* 목표 x → 좌우 누르기 입력. 봇도 좌우 누르기만으로 깰 수 있어야 한다. */
export function steer(s, tx, dead = 0.15) {
  const q = s.squad;
  const d = tx - q.x;
  // 멈추는 데 걸리는 거리를 생각해 미리 놓는다
  const stopDist = (q.vx * q.vx) / (2 * 100);
  if (Math.abs(d) < dead) return { dir: 0, tx: null };
  if (Math.sign(d) === Math.sign(q.vx) && Math.abs(d) <= stopDist) return { dir: 0, tx: null };
  return { dir: d > 0 ? 1 : -1, tx: null };
}

function cellCenter(c) { return clamp((c.x0 + c.x1) / 2, -EDGE, EDGE); }

/* 기준 봇: 몇 군데 x 후보를 놓고 '다음 게이트 결과 − 벽·무리 피해 + 상자 보상'을 따져 가장 나은 곳으로 간다.
   그 위치에서 쏘는 총알이 게이트·벽·상자에 맞는 것도 셈에 넣는다. 톱날·독침·내려찍기는 피한다.
   opt.pump=false 면 게이트를 쏴서 올리는 효과를 셈하지 않고(겉보기 숫자로만 고른다), opt.crates=false 면 상자를 무시한다. */
const CANDS = [-4.2, -3.33, -2.5, -1.6, -0.8, 0, 0.8, 1.6, 2.5, 3.33, 4.2];

export function botTarget(s, opt = {}) {
  const q = s.squad;
  const R = radius(q.n);
  const sight = opt.sight ?? 40;
  if (s.phase === 'arena' && s.boss) return bossDodge(s, R);
  const D = dps(q.n, q.tier, s.fireLv);
  const vz = Math.max(1, q.vz);
  const span = R + 0.3;
  const cover = (x, x0, x1) => overlap(x - span, x + span, x0, x1) / (2 * span);
  let row = null;
  for (const r of s.rows) if (!r.done && r.z > q.z && r.z - q.z < sight) { if (!row || r.z < row.z) row = r; }
  const horizon = row ? row.z : q.z + 34;
  let best = -Infinity;
  let bestX = q.x;
  for (let ci = 0; ci <= CANDS.length; ci++) {
    const x = ci === CANDS.length ? clamp(q.x, -EDGE, EDGE) : CANDS[ci];
    const travel = Math.abs(x - q.x) / 10 + 0.15;
    let val = -Math.abs(x - q.x) * 0.02;
    if (row) {
      const tReach = (row.z - q.z) / vz;
      // 제때 못 가면 지금 칸을 지나게 된다
      const at = travel < tReach ? x : q.x;
      let idx = 0;
      for (let i = 0; i < row.cells.length; i++) if (at >= row.cells[i].x0) idx = i;
      const c = row.cells[idx];
      let v = c.v;
      if (c.op === 'add' && opt.pump !== false) {
        const shoot = Math.max(0, tReach - travel - 0.2);
        v = Math.min(c.cap, c.v + Math.floor((D * cover(at, c.x0, c.x1) * shoot / c.step) * 0.9));
      }
      const after = applyOp(q.n, c.op, v);
      val += after <= 0 ? -q.n * 2 : after - q.n;
    }
    // 벽: 그 자리에서 쏴서 못 부수면 남은 만큼 잃는다
    for (const p of s.props) {
      if (!p.alive || p.z < q.z || p.z > horizon + 0.5 || p.z - q.z > 34) continue;
      const t = (p.z - q.z) / vz;
      const shot = D * cover(x, p.x0, p.x1) * Math.max(0, t - travel) * 0.85;
      if (p.kind === 'wall') {
        const ov = overlap(x - R, x + R, p.x0, p.x1) / (2 * R);
        if (ov <= 0) continue;
        const left = p.hp - shot;
        if (left > 0) val -= contactCost(left) * Math.min(1, ov * 2) + 1;
      } else if (opt.crates !== false && !row && shot >= p.hp) {
        const r = p.reward;
        val += r.type === 'gun' ? (q.tier < 3 ? q.n * 0.25 + 3 : 2) : r.type === 'men' ? r.v : 2;
      }
    }
    // 무리: 이 자리 앞에 몰린 적 중 쏴서 못 잡는 만큼
    let threat = 0;
    for (const f of s.foes) {
      if (!f.alive || f.z < q.z || f.z - q.z > 32) continue;
      const reachX = f.x + clamp(x - f.x, -f.home * 1.5, f.home * 1.5);
      if (Math.abs(reachX - x) < R + f.r + 0.4) threat += f.hp;
    }
    if (threat > 0) val -= Math.max(0, threat - D * 1.6) / SOLDIER_HP;
    if (val > best + 1e-9) { best = val; bestX = x; }
  }
  let tx = bestX;
  // 톱날 피하기
  for (const w of s.saws) {
    const dz = w.z - q.z;
    if (dz < -1 || dz > 14) continue;
    const sweepLo = w.xa - w.w / 2;
    const sweepHi = w.xb + w.w / 2;
    if (tx + R > sweepLo && tx - R < sweepHi) {
      const cands = [sweepLo - R - 0.2, sweepHi + R + 0.2].filter((x) => x >= -EDGE && x <= EDGE);
      if (cands.length) { cands.sort((a, b) => Math.abs(a - tx) - Math.abs(b - tx)); tx = cands[0]; }
      else {
        // 피할 곳이 없으면 톱날이 멀어지는 쪽으로
        const t = Math.max(0, dz / vz);
        const sawAt = clamp(w.x + w.dir * w.spd * t, w.xa, w.xb);
        tx = sawAt > 0 ? -EDGE : EDGE;
      }
    }
  }
  // 독침 피하기
  for (const sp of s.spits) {
    if (sp.t > 0.95) continue;
    if (Math.abs(tx - sp.x) < R + 1.3) {
      tx = sp.x + (tx >= sp.x ? 1 : -1) * (R + 1.5);
      if (tx > EDGE) tx = sp.x - (R + 1.5);
      if (tx < -EDGE) tx = sp.x + (R + 1.5);
    }
  }
  return clamp(tx, -EDGE, EDGE);
}

function bossDodge(s, R) {
  const q = s.squad;
  const b = s.boss;
  let tx = clamp(b.x, -EDGE, EDGE);
  if (b.slam) {
    const pad = 0.4;
    const inZone = (x) => x >= b.slam.x0 - pad && x <= b.slam.x1 + pad;
    if (inZone(q.x) || inZone(tx)) {
      const cands = [b.slam.x0 - pad - 0.3, b.slam.x1 + pad + 0.3].filter((x) => x >= -EDGE && x <= EDGE);
      cands.sort((a, c) => Math.abs(a - q.x) - Math.abs(c - q.x));
      if (cands.length) tx = cands[0];
    }
  }
  return tx;
}

export function botInput(s, opt) {
  return steer(s, botTarget(s, opt));
}

/* 기준 봇이 강화 없이 한 판 돌아 보스 체력·별 기준을 정한다. 기준 봇이 지면 다른 시드로 다시 만든다. */
const cache = new Map();
export function prepareLevel(L) {
  const key = Math.max(1, Math.floor(L));
  if (cache.has(key)) return cache.get(key);
  let lv = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    lv = buildLevel(key, attempt);
    const cal = calibrate(lv);
    if (cal.ok) { Object.assign(lv, cal.lv); break; }
    lv.failed = true;
  }
  if (lv.failed) {
    // 끝까지 실패하면 추정치로 보스를 약하게 둔다
    lv.arrive = Math.max(START_N, lv.golden[lv.golden.length - 1] || START_N);
    lv.bossHp = Math.round(dps(lv.arrive) * lv.params.bossKill * 0.6);
    lv.par = Math.max(1, Math.round(lv.arrive * 0.5));
  }
  cache.set(key, lv);
  return lv;
}

export function calibrate(lv) {
  const s = newGame(lv, { start: START_N, fire: 0 });
  const maxTicks = Math.ceil((lv.arenaZ / lv.speed + 60) / DT);
  while (s.phase === 'run' && s.tick < maxTicks) step(s, botInput(s));
  if (s.phase !== 'arena') return { ok: false };
  const arrive = s.squad.n;
  // 기준 봇보다 병력이 25% 적고 상자를 하나도 안 연 사람도 같은 시간에 잡도록
  const hp = Math.max(30, Math.round(dps(arrive * 0.75, 0, 0) * lv.params.bossKill));
  s.boss.hp = s.boss.max = hp;
  s.bossRef = arrive;
  while (s.phase === 'arena' && s.tick < maxTicks) step(s, botInput(s));
  if (s.phase !== 'won') return { ok: false };
  return { ok: true, lv: { bossHp: hp, arrive, par: s.squad.n, calTier: s.squad.tier, calTicks: s.tick } };
}

/* 별: 이기면 1개, 기준 봇이 남긴 병력의 40% 이상이면 2개, 80% 이상이면 3개 */
export function starGoals(lv) {
  return { two: Math.max(2, Math.round(lv.par * 0.4)), three: Math.max(3, Math.round(lv.par * 0.8)) };
}
export function starsFor(lv, n, won) {
  if (!won) return 0;
  const g = starGoals(lv);
  if (n >= g.three) return 3;
  if (n >= g.two) return 2;
  return 1;
}

/* 판이 끝났을 때 받는 코인 */
export function coinsFor(lv, s, won, stars, bonusPct = 0) {
  const base = won ? 10 + 2 * lv.L + 5 * stars : Math.floor((10 + 2 * lv.L) * 0.25);
  const kills = Math.floor(s.stats.kills / 10);
  return Math.round((base + kills) * (1 + bonusPct / 100)) + s.stats.coins;
}

/* 진행률(0~1) — 보스전이면 보스 체력으로 */
export function progress(s) {
  if (s.boss) return 1;
  return clamp(s.squad.z / s.arenaZ, 0, 1);
}

/* 상태 해시 — 결정성 테스트용 */
export function stateHash(s) {
  const q = s.squad;
  let h = hash(s.tick, q.n, q.x.toFixed(6), q.z.toFixed(6), s.phase);
  for (const f of s.foes) if (f.alive) h = hash(h, f.id, f.hp.toFixed(4), f.x.toFixed(4), f.z.toFixed(4));
  for (const r of s.rows) for (const c of r.cells) h = hash(h, c.v, c.acc.toFixed(4));
  if (s.boss) h = hash(h, s.boss.hp.toFixed(4), s.boss.z.toFixed(4));
  return h;
}
