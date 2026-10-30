/* 난이도 측정 틀의 공용 부분 — tools/bench.mjs·margin.mjs·fork.mjs·fbcal.mjs가 함께 쓴다(오프라인 전용, 게임은 이 파일을 읽지 않는다).
   - play(): 봇 한 판을 돌리며 도착 병력·보스 접촉·내려찍기·별 따위를 기록
   - summarize(): 판 기록 묶음 → 승률과 지표
   - campaign()/expectFromCampaigns(): 코인 → 가장 싼 강화·영웅 레벨을 사며 L1부터 도는 캠페인, 레벨별 중앙 강화(EXPECT)
   - makePool(): worker_threads로 일감을 나눠 돌린다
   - 게임 규칙에 기대는 곳(지원 병력, 강화 상한, 별, 레벨 태그)은 아래 '규칙 어댑터'에 모아 두었다.
     core.js·store.js가 새 함수를 내보내면 그것을 쓰고, 없으면 지금(main.js) 규칙을 흉내 낸다. */
import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import * as C from '../assets/core.js';
import * as S from '../assets/store.js';
import * as R from '../assets/roster.js';
import { makeBot, BOT_INFO, botKind } from '../tests/bots.mjs';

export { C, S, R, makeBot, BOT_INFO, botKind };

/* ---------- 구간 ---------- */
export const BANDS = [[1, 4], [5, 10], [11, 20], [21, 30], [31, 40], [41, 60]];
export function bandOf(L) {
  for (const [a, b] of BANDS) if (L >= a && L <= b) return `L${a}-${b}`;
  const a = 61 + 20 * Math.floor((L - 61) / 20);
  return `L${a}-${a + 19}`;
}
export function bandList(levels) {
  const seen = [];
  for (const L of levels) { const b = bandOf(L); if (!seen.includes(b)) seen.push(b); }
  return seen;
}

/* ---------- 규칙 어댑터 ---------- */
/* 레벨 태그: core.js에 levelTag(L)이 생기면 그것을, 아니면 levelParams(L).tag. 없으면 '' */
export function tagOf(L) {
  let t = '';
  if (typeof C.levelTag === 'function') t = C.levelTag(L);
  else { const p = C.levelParams(L); t = p.tag ?? ''; }
  if (t && typeof t === 'object') t = t.tag ?? t.id ?? t.name ?? t.k ?? JSON.stringify(t);
  return t ? String(t) : '';
}
export const hasTags = () => typeof C.levelTag === 'function' || C.levelParams(5).tag !== undefined;
/* 목표 구간을 고를 때 쓰는 태그 갈래: onboard(L1-4) / normal / hard / super / rest / (그 밖의 태그 이름) */
export function tagClass(L, tag = tagOf(L)) {
  if (L <= 4 && !tag) return 'onboard';
  const t = String(tag || '').toLowerCase();
  if (!t || t === 'normal' || t === 'none') return 'normal';
  if (/super|very|vhard|xhard|extreme|nightmare/.test(t)) return 'super';
  if (/hard/.test(t)) return 'hard';
  if (/rest|easy|break|calm/.test(t)) return 'rest';
  return t;
}
/* 3패 지원 병력: core.js의 supportFor(lv) → 보정 표의 lv.helpStart → 지금 main.js 식 */
export function supportFor(lv) {
  if (typeof C.supportFor === 'function') return C.supportFor(lv);
  if (Number.isFinite(lv.helpStart)) return lv.helpStart;
  return Math.max(5, Math.round((lv.arrive || 30) * 0.2));
}
/* 새로 살 수 있는 강화 상한: core.js의 upgCap(maxL) → store.js의 upgCap(maxL, id) → 없으면 u.max */
export function upgMax(u, maxL) {
  const f = typeof C.upgCap === 'function' ? C.upgCap : typeof S.upgCap === 'function' ? S.upgCap : null;
  if (f) {
    const c = f(maxL, u.id);
    if (Number.isFinite(c)) return Math.min(u.max, c);
  }
  return u.max;
}
export const hasUpgCap = () => typeof C.upgCap === 'function' || typeof S.upgCap === 'function';
export const heroCapAt = (maxL) => R.heroCap(maxL);
/* 별: 새 규칙이 레벨을 보고 싶어 할 수 있어 lv도 넘긴다(지금 starsFor는 무시한다) */
export const starsOf = (par, n, lv) => C.starsFor(par, n, true, lv);
export const parOf = (lv, base, fire, hero) => C.parFor(lv, base, fire, hero);

/* ---------- 한 판 ---------- */
export function maxTicksFor(lv) { return Math.ceil((lv.arenaZ / lv.speed + 80) / C.DT); }

/* co = newGame 옵션 { start, fire, hero }. opt.state를 주면 그 상태에서 이어 돈다. opt.keep=true면 끝난 상태를 rec.s로 */
export function play(lv, policy, co = {}, opt = {}) {
  const s = opt.state || C.newGame(lv, co);
  const max = opt.max || maxTicksFor(lv);
  const r = {
    won: 0, cause: '', arr: -1, arrT: 0, arrSp: 0, ref: lv.arrive || lv.params.P, fin: 0, peak: 0, atPeak: 0, dd: 0,
    contact: 0, contactT: -1, slams: 0, slamHits: 0, bossHp: 0, bossLeft: -1, bossT: 0, t: 0, crates: 0, spGot: 0, heroUses: 0, red: 0,
  };
  let peak = s.squad.n;
  if (s.phase === 'arena') r.arr = s.squad.n;
  while ((s.phase === 'run' || s.phase === 'arena') && s.tick < max) {
    const ph = s.phase;
    C.step(s, policy(s));
    const ev = s.ev;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      switch (e.t) {
        case 'clash': if (!r.contact) { r.contact = 1; r.contactT = s.boss ? s.boss.t : 0; } break;
        case 'slam': r.slams++; if (e.hit) r.slamHits++; break;
        case 'gate': if (e.after < e.before) r.red++; break;
        case 'crate': case 'cageOpen': r.crates++; break;
        default: break;
      }
    }
    if (ph === 'run') {
      if (s.phase === 'arena') { r.arr = s.squad.n; r.arrT = s.t; r.arrSp = s.squad.sp.length; r.bossHp = s.boss.max; }
      else {
        const n = s.squad.n;
        if (n > peak) peak = n;
        else if (peak > 0 && 1 - n / peak > r.dd) r.dd = 1 - n / peak;
      }
    }
  }
  r.won = s.phase === 'won' ? 1 : 0;
  r.cause = r.won ? '' : s.phase === 'lost' ? s.cause : 'timeout';
  r.fin = s.squad.n;
  r.peak = s.squad.peak;
  r.atPeak = r.won && s.squad.n >= s.squad.peak ? 1 : 0;
  r.t = +s.t.toFixed(2);
  if (s.boss) { r.bossT = +s.boss.t.toFixed(2); if (!r.won) r.bossLeft = +(Math.max(0, s.boss.hp) / s.boss.max).toFixed(3); }
  r.spGot = s.stats.spGot;
  r.heroUses = s.stats.heroUses;
  r.dd = +r.dd.toFixed(3);
  if (policy.st && typeof policy.st.miss === 'number') r.miss = policy.st.miss;
  if (opt.keep) r.s = s;
  return r;
}

/* ---------- 통계 ---------- */
export const pct = (a, b) => (b ? (100 * a) / b : NaN);
export function median(a) { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; }
export function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
export function quant(a, q) { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; }
export const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '-');

/* 판 기록 묶음 → 지표. 퍼센트는 0~100, 비율·초는 그대로 */
export const METRICS = {
  n: '판 수',
  win: '첫 시도 승률 %',
  arrRef: '도착 병력 / 보정 기준(lv.arrive) 중앙값',
  contact: '보스 접촉 % (경기장에 간 판)',
  contactWin: '보스 접촉 % (이긴 판)',
  contactT: '접촉까지 걸린 초 중앙값(경기장 입장부터)',
  slamHit: '내려찍기 적중 % (터진 내려찍기 중)',
  lossPre: '경기장 전 패배 % (진 판 중)',
  atPeak: '최고 병력으로 끝난 % (이긴 판)',
  dd: '달리기 중 최고 대비 최대 낙폭 중앙값',
  s3: '★★★ % (이긴 판)',
  s2: '★★ 이상 % (이긴 판)',
  bossLeft: '질 때 보스 남은 체력 중앙값 (경기장에서 진 판)',
  len: '판 길이 초 중앙값 (이긴 판)',
  bossT: '보스전 초 중앙값 (이긴 판)',
  crates: '상자·철창 연 수 평균',
  red: '빨간(손해) 칸 지난 수 평균',
  miss: '오판한 줄 수 평균(misjudge만)',
};
export function summarize(runs) {
  const wins = runs.filter((r) => r.won);
  const arena = runs.filter((r) => r.arr >= 0);
  const losses = runs.filter((r) => !r.won);
  const bossLoss = losses.filter((r) => r.arr >= 0);
  const slams = arena.reduce((a, r) => a + r.slams, 0);
  const hits = arena.reduce((a, r) => a + r.slamHits, 0);
  const contacts = arena.filter((r) => r.contact);
  return {
    n: runs.length,
    win: pct(wins.length, runs.length),
    arrRef: median(arena.map((r) => r.arr / r.ref)),
    contact: pct(contacts.length, arena.length),
    contactWin: pct(wins.filter((r) => r.contact).length, wins.length),
    contactT: median(contacts.map((r) => r.contactT)),
    slamHit: pct(hits, slams),
    lossPre: pct(losses.filter((r) => r.arr < 0).length, losses.length),
    atPeak: pct(wins.filter((r) => r.atPeak).length, wins.length),
    dd: median(arena.map((r) => r.dd)),
    s3: pct(wins.filter((r) => r.stars === 3).length, wins.length),
    s2: pct(wins.filter((r) => r.stars >= 2).length, wins.length),
    bossLeft: median(bossLoss.map((r) => r.bossLeft)),
    len: median(wins.map((r) => r.t)),
    bossT: median(wins.map((r) => r.bossT)),
    crates: mean(runs.map((r) => r.crates)),
    red: mean(runs.map((r) => r.red)),
    miss: mean(runs.filter((r) => r.miss != null).map((r) => r.miss)),
  };
}
export function round(o, d = 3) {
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === 'number' ? (Number.isFinite(v) ? +v.toFixed(d) : null) : v;
  return out;
}

/* ---------- 시드 ---------- */
export const seedOf = (name, L, k) => C.hash('bench', name, L, k) >>> 0;

/* ---------- 출격 조건(강화·영웅) ----------
   none: 강화·영웅 없음. expect: 캠페인 중앙 강화(EXPECT) + 그때 영웅. cap: 그 레벨까지 살 수 있는 최대 강화 + 영웅 상한 */
export function loadoutNone() { return { start: C.START_N, fire: 0, hero: null }; }
export function loadoutExpect(E, L) {
  const e = E && (E[L] || E[String(L)]);
  if (!e) return null;
  return { start: C.START_N + 2 * (e.start | 0), fire: e.fire | 0, hero: e.hero && e.heroLv ? { id: e.hero, lv: e.heroLv } : null };
}
export function loadoutCap(L, heroId = 'mungchi') {
  const cap = (id) => upgMax(S.UPGRADES.find((u) => u.id === id), L);
  return { start: C.START_N + 2 * cap('start'), fire: cap('fire'), hero: L >= C.UNLOCK.hero ? { id: heroId, lv: heroCapAt(L) } : null };
}

/* ---------- 레벨 일감: 한 레벨·한 조건에서 여러 봇·시드 ----------
   job = { kind:'level', L, cond, co, bots: [{ name, seeds: n }] } → 판 기록 배열 */
export function runLevelJob(job) {
  const lv = C.prepareLevel(job.L);
  const co = job.co;
  let par = null;
  const out = [];
  for (const b of job.bots) {
    for (let k = 0; k < b.seeds; k++) {
      const pol = makeBot(b.name, seedOf(b.name, job.L, k));
      const r = play(lv, pol, co);
      if (r.won) { if (par == null) par = parOf(lv, co.start, co.fire, co.hero); r.stars = starsOf(par, r.fin, lv); } else r.stars = 0;
      r.b = b.name; r.k = k; r.L = job.L; r.cond = job.cond;
      out.push(r);
    }
  }
  return out;
}

/* ---------- 캠페인(경제 폐회로) ----------
   L1부터 maxL까지: 판이 끝날 때마다 코인(coinsFor + 새 별 1개당 20)으로 가장 싼 강화(상한 안) 또는 고른 영웅의 다음 레벨(heroCap 안)을 산다.
   지면 다시, 3번 연속 지면 지원을 받는다(support=false면 받지 않는다). 한 레벨 maxAttempts번 넘게 지면 거기서 멈춘다(stuck).
   영웅: 처음 합류한 영웅(뭉치)을 계속 쓴다. opt.hero='bori' 처럼 주면 합류한 뒤 그 영웅으로 바꾼다. 'none'이면 영웅 없이.
   돌려주는 것: 레벨마다 { L, attempts, firstWin, firstStars, firstFinal, firstCause, upg(첫 시도 때), hero, coinsBefore, usedSupport, supTries, supWins, stuck, finalStars } */
export function campaign(opt = {}) {
  const bot = opt.bot || 'sloppy0.1';
  const seed = opt.seed ?? 1;
  const maxL = opt.maxL ?? 60;
  const useSupport = opt.support !== false;
  const maxAttempts = opt.maxAttempts ?? 12;
  const forceHero = opt.hero || '';
  const d = { maxL: 1, coins: 0, upg: { start: 0, fire: 0, coin: 0 }, stars: {}, fails: {}, heroes: { sel: '', lv: {} } };
  const totalStars = () => Object.values(d.stars).reduce((a, b) => a + b, 0);
  const out = [];
  for (let L = 1; L <= maxL; L++) {
    const lv = C.prepareLevel(L);
    const rec = { L, attempts: 0, usedSupport: false, supTries: 0, supWins: 0, stuck: false };
    for (;;) {
      rec.attempts++;
      const a = rec.attempts;
      const id = forceHero === 'none' ? '' : d.heroes.sel;
      const hero = L >= C.UNLOCK.hero && id && d.heroes.lv[id] ? { id, lv: d.heroes.lv[id] } : null;
      const base = C.START_N + 2 * d.upg.start;
      const sup = useSupport && (d.fails[L] | 0) >= 3 ? supportFor(lv) : 0;
      const par = parOf(lv, base, d.upg.fire, hero);
      const coins0 = d.coins;
      const pol = makeBot(bot, C.hash('camp', bot, seed, L, a) >>> 0, opt.skill === false ? { skill: false } : {});
      const r = play(lv, pol, { start: base + sup, fire: d.upg.fire, hero }, { keep: true });
      const stars = r.won ? (sup ? 1 : starsOf(par, r.fin, lv)) : 0;
      const prev = d.stars[L] | 0;
      d.coins += C.coinsFor(lv, r.s, !!r.won, stars, 10 * d.upg.coin) + Math.max(0, stars - prev) * 20;
      if (sup) { rec.usedSupport = true; rec.supTries++; if (r.won) rec.supWins++; }
      if (a === 1) Object.assign(rec, { firstWin: !!r.won, firstStars: stars, firstFinal: r.fin, firstCause: r.cause, firstArr: r.arr, par, upg: { ...d.upg }, hero, coinsBefore: coins0 });
      if (r.won) { d.stars[L] = Math.max(prev, stars); d.maxL = Math.max(d.maxL, L + 1); d.fails[L] = 0; }
      else d.fails[L] = (d.fails[L] | 0) + 1;
      for (const h of R.heroesEarned(d.maxL, totalStars())) if (!d.heroes.lv[h]) d.heroes.lv[h] = 1;
      if (forceHero && forceHero !== 'none' && d.heroes.lv[forceHero]) d.heroes.sel = forceHero;
      if (!d.heroes.sel) d.heroes.sel = Object.keys(d.heroes.lv)[0] || '';
      spend(d, forceHero === 'none');
      if (r.won) { rec.finalStars = stars; break; }
      if (a >= maxAttempts) { rec.stuck = true; break; }
    }
    out.push(rec);
    if (rec.stuck) break;
  }
  return out;
}
/* 가장 싼 것부터: 강화(상한 안) 또는 고른 영웅의 다음 레벨(heroCap 안) */
function spend(d, noHero) {
  for (;;) {
    let best = null;
    for (const u of S.UPGRADES) {
      if (d.upg[u.id] >= upgMax(u, d.maxL)) continue;
      const cost = S.upgCost(d.upg[u.id]);
      if (!best || cost < best.cost) best = { k: 'u', id: u.id, cost };
    }
    const sel = d.heroes.sel;
    if (!noHero && sel && d.heroes.lv[sel] < heroCapAt(d.maxL)) {
      const cost = R.heroCost(d.heroes.lv[sel]);
      if (!best || cost < best.cost) best = { k: 'h', id: sel, cost };
    }
    if (!best || best.cost > d.coins) return;
    d.coins -= best.cost;
    if (best.k === 'u') d.upg[best.id]++; else d.heroes.lv[best.id]++;
  }
}

/* 캠페인들 → 레벨별 '첫 시도 때' 중앙 강화 = EXPECT(L).
   { L: { start, fire, coin, heroLv, hero, n } } — start·fire·coin은 강화 단계(시작 병력 = 12 + 2·start) */
export function expectFromCampaigns(camps) {
  const table = {};
  const maxL = Math.max(0, ...camps.map((c) => (c.length ? c[c.length - 1].L : 0)));
  for (let L = 1; L <= maxL; L++) {
    const recs = camps.map((c) => c.find((r) => r.L === L)).filter(Boolean);
    if (!recs.length) continue;
    const ids = {};
    for (const r of recs) if (r.hero) ids[r.hero.id] = (ids[r.hero.id] || 0) + 1;
    const hero = Object.keys(ids).sort((a, b) => ids[b] - ids[a])[0] || null;
    table[L] = {
      start: median(recs.map((r) => r.upg.start)),
      fire: median(recs.map((r) => r.upg.fire)),
      coin: median(recs.map((r) => r.upg.coin)),
      heroLv: hero ? median(recs.map((r) => (r.hero && r.hero.id === hero ? r.hero.lv : 0))) : 0,
      hero,
      n: recs.length,
    };
  }
  return table;
}
/* 캠페인 묶음 → 레벨 묶음별 요약 */
export function summarizeCampaign(recs) {
  const first = recs.filter((r) => r.firstWin);
  const supTries = recs.reduce((a, r) => a + r.supTries, 0);
  const supWins = recs.reduce((a, r) => a + r.supWins, 0);
  return {
    n: recs.length,
    firstWin: pct(first.length, recs.length),
    attempts: mean(recs.map((r) => r.attempts)),
    p90: quant(recs.map((r) => r.attempts), 0.9),
    support: pct(recs.filter((r) => r.usedSupport).length, recs.length),
    // 최종 통과: 3번 안에, 또는 4번째(지원) 판에서
    pass: pct(recs.filter((r) => !r.stuck && (r.attempts <= 3 || (r.usedSupport && r.attempts <= 4))).length, recs.length),
    supWin: pct(supWins, supTries),
    supTries,
    stuck: recs.filter((r) => r.stuck).length,
    s3First: pct(first.filter((r) => r.firstStars === 3).length, first.length),
    s2First: pct(first.filter((r) => r.firstStars >= 2).length, first.length),
    start: median(recs.map((r) => r.upg.start)),
    fire: median(recs.map((r) => r.upg.fire)),
    coin: median(recs.map((r) => r.upg.coin)),
    heroLv: median(recs.map((r) => (r.hero ? r.hero.lv : 0))),
  };
}

/* ---------- 일감 나누기 ----------
   job.cal = { sim, expect, levels }을 주면 그 보정 표로 바꾼 뒤 돈다(tools/caltable.mjs가 EXPECT를 되풀이해 맞출 때) */
export function calJob(job) {
  const lv = C.calibrateLevel(job.L);
  const out = { failed: !!lv.failed };
  for (const f of C.CAL_FIELDS) out[f] = lv[f];
  return out;
}
export function runJob(job) {
  if (job.cal) C.useCal(job.cal);
  if (job.kind === 'cal') return calJob(job);
  if (job.kind === 'level') return runLevelJob(job);
  if (job.kind === 'campaign') return campaign(job);
  if (job.kind === 'call') return import(job.module).then((m) => m[job.fn](...job.args));
  throw new Error(`모르는 일감 ${job.kind}`);
}
/* n개의 워커로 일감을 돌린다. n ≤ 1이면 이 스레드에서. run(job) → Promise. 각 일감의 걸린 ms는 pool.busy에 더한다 */
export function makePool(n) {
  const pool = { busy: 0, jobs: 0 };
  if (n <= 1) {
    pool.run = async (job) => {
      const t = performance.now();
      let out = runJob(job);
      if (out && typeof out.then === 'function') out = await out;
      pool.busy += performance.now() - t;
      pool.jobs++;
      return out;
    };
    pool.close = () => {};
    return pool;
  }
  const queue = [];
  const free = [];
  const pending = new Map();
  const workers = [];
  let seq = 0;
  const pump = () => {
    while (free.length && queue.length) {
      const w = free.shift();
      const item = queue.shift();
      w.postMessage(item);
    }
  };
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL('./bench-worker.mjs', import.meta.url));
    w.on('message', (m) => {
      const p = pending.get(m.id);
      pending.delete(m.id);
      pool.busy += m.ms;
      pool.jobs++;
      if (m.err) p.reject(new Error(m.err)); else p.resolve(m.out);
      free.push(w);
      pump();
    });
    w.on('error', (e) => { for (const p of pending.values()) p.reject(e); pending.clear(); });
    workers.push(w);
    free.push(w);
  }
  pool.run = (job) => new Promise((resolve, reject) => {
    const id = seq++;
    pending.set(id, { resolve, reject });
    queue.push({ id, job });
    pump();
  });
  pool.close = () => { for (const w of workers) w.terminate(); };
  return pool;
}

/* ---------- 계획(difficulty_targets)의 목표 구간 ----------
   측정 조건은 'expect'(캠페인 중앙 강화 + 그때 영웅, 스킬 켬). 꼼수 상한은 'expect'와 'cap' 둘 다.
   sel(L, cls): 그 목표에 넣을 레벨. cls = tagClass(L). [lo, hi]는 %(arrRef·dd는 비율).
   태그 이름은 tagClass가 짐작해 hard/super/rest로 나눈다 — 이름이 다르면 tagClass를 고친다.
   이 표는 계획 문서를 읽은 해석이다. 출처: plan.difficulty_targets */
const L5_10 = (L) => L >= 5 && L <= 10;
const L11 = (L) => L >= 11;
const NORMALISH = (c) => c === 'normal';
const HARDISH = (c) => c === 'hard' || c === 'super';
const winTargets = [
  ['onboard L1-4', (L, c) => c === 'onboard', { expert: [98, 100], 'sloppy0.1': [97, 100], 'sloppy0.3': [90, 100], strong: [100, 100] }],
  ['normal L5-10', (L, c) => L5_10(L) && NORMALISH(c), { expert: [98, 100], 'sloppy0.1': [85, 95], 'sloppy0.3': [65, 85], strong: [100, 100] }],
  ['hard L5-10', (L, c) => L5_10(L) && c === 'hard', { expert: [95, 100], 'sloppy0.1': [70, 80], 'sloppy0.3': [40, 60], strong: [100, 100] }],
  ['super L5-10', (L, c) => L5_10(L) && c === 'super', { expert: [85, 100], 'sloppy0.1': [55, 70], 'sloppy0.3': [20, 40], strong: [100, 100] }],
  ['rest', (L, c) => c === 'rest', { expert: [98, 100], 'sloppy0.1': [95, 100], 'sloppy0.3': [85, 100], strong: [100, 100] }],
  ['normal L11+', (L, c) => L11(L) && NORMALISH(c), { expert: [95, 100], 'sloppy0.1': [80, 92], 'sloppy0.3': [50, 75], strong: [100, 100] }],
  ['hard L11+', (L, c) => L11(L) && c === 'hard', { expert: [80, 92], 'sloppy0.1': [50, 70], 'sloppy0.3': [15, 40], strong: [100, 100] }],
  ['super L11+', (L, c) => L11(L) && c === 'super', { expert: [65, 85], 'sloppy0.1': [30, 55], 'sloppy0.3': [0, 25], strong: [100, 100] }],
];
export const TARGETS = [];
for (const [g, sel, bots] of winTargets) {
  for (const [bot, [lo, hi]] of Object.entries(bots)) TARGETS.push({ id: `win ${g} ${bot}`, cond: ['expect'], bot, metric: 'win', sel, lo, hi });
  // 스킬 끈 sloppy0.1: 하한 −10%p 안
  TARGETS.push({ id: `win ${g} sloppy0.1-noskill`, cond: ['expect'], bot: 'sloppy0.1-noskill', metric: 'win', sel, lo: bots['sloppy0.1'][0] - 10, hi: 100 });
}
const exploit = [
  ['idle', 'all', () => true, 5],
  ['random', 'all', () => true, 10],
  ...['-4.4', '-2.5', '0', '2.5', '4.4'].flatMap((x) => [[`hold${x}`, 'L5+', (L) => L >= 5, 15], [`hold${x}`, 'L1-4', (L) => L <= 4, 30]]),
  ['worst', 'L11+', (L) => L >= 11, 20],
  ['worst', 'L1-10', (L) => L <= 10, 50],
  ['naive', 'normal L5+', (L, c) => L >= 5 && NORMALISH(c), 70],
  ['naive', 'hard+super', (L, c) => HARDISH(c), 40],
];
for (const [bot, g, sel, hi] of exploit) TARGETS.push({ id: `exploit ${bot} ${g}`, cond: ['expect', 'cap'], bot, metric: 'win', sel, lo: 0, hi });
TARGETS.push(
  { id: 'misjudge ≤ sloppy0.1 − 10 (normal L5+)', cond: ['expect'], bot: 'misjudge', metric: 'win', sel: (L, c) => L >= 5 && NORMALISH(c), rel: 'sloppy0.1', lo: -100, hi: -10 },
  { id: 'arrive/ref sloppy0.1 L11+', cond: ['expect'], bot: 'sloppy0.1', metric: 'arrRef', sel: (L) => L >= 11, lo: 0, hi: 0.85 },
  { id: 'boss contact in wins (normal L5+)', cond: ['expect'], bot: 'sloppy0.1', metric: 'contactWin', sel: (L, c) => L >= 5 && NORMALISH(c), lo: 20, hi: 50 },
  { id: 'boss HP left at loss L5+', cond: ['expect'], bot: 'sloppy0.1', metric: 'bossLeft', sel: (L) => L >= 5, lo: 0.05, hi: 0.25 },
  { id: 'slam hit sloppy0.1 L5+', cond: ['expect'], bot: 'sloppy0.1', metric: 'slamHit', sel: (L) => L >= 5, lo: 15, hi: 30 },
  { id: 'slam hit sloppy0.3 L5+', cond: ['expect'], bot: 'sloppy0.3', metric: 'slamHit', sel: (L) => L >= 5, lo: 15, hi: 30 },
  { id: 'slam hit expert L5+', cond: ['expect'], bot: 'expert', metric: 'slamHit', sel: (L) => L >= 5, lo: 0, hi: 10 },
  { id: 'losses before arena (hard+super)', cond: ['expect'], bot: 'sloppy0.1', metric: 'lossPre', sel: (L, c) => HARDISH(c), lo: 30, hi: 100 },
  { id: 'wins ending at peak L5+', cond: ['expect'], bot: 'sloppy0.1', metric: 'atPeak', sel: (L) => L >= 5, lo: 0, hi: 40 },
  { id: 'drawdown median L5+', cond: ['expect'], bot: 'sloppy0.1', metric: 'dd', sel: (L) => L >= 5, lo: 0.2, hi: 0.4 },
  { id: '3★ share of wins sloppy0.1', cond: ['expect'], bot: 'sloppy0.1', metric: 's3', sel: () => true, lo: 25, hi: 45 },
  { id: '≥2★ share of wins sloppy0.1', cond: ['expect'], bot: 'sloppy0.1', metric: 's2', sel: () => true, lo: 60, hi: 80 },
  { id: '3★ share of wins expert', cond: ['expect'], bot: 'expert', metric: 's3', sel: () => true, lo: 60, hi: 85 },
  { id: 'run length normal (s)', cond: ['expect'], bot: 'sloppy0.1', metric: 'len', sel: (L, c) => L >= 5 && NORMALISH(c), lo: 45, hi: 75 },
  { id: 'run length hard+super (s)', cond: ['expect'], bot: 'sloppy0.1', metric: 'len', sel: (L, c) => HARDISH(c), lo: 35, hi: 55 },
);
/* 캠페인 목표: camp = 캠페인 이름(bench.mjs의 CAMPAIGNS 키) */
export const CAMP_TARGETS = [
  ...['sloppy0.1', 'sloppy0.3'].flatMap((camp) => [
    { id: `final pass normal ${camp}`, camp, metric: 'pass', sel: (L, c) => c === 'normal' || c === 'onboard' || c === 'rest', lo: 98, hi: 100 },
    { id: `final pass hard ${camp}`, camp, metric: 'pass', sel: (L, c) => c === 'hard', lo: 95, hi: 100 },
    { id: `final pass super ${camp}`, camp, metric: 'pass', sel: (L, c) => c === 'super', lo: 90, hi: 100 },
  ]),
  { id: 'supported sloppy0.3 win %', camp: 'sloppy0.3', metric: 'supWin', sel: () => true, lo: 85, hi: 95 },
  { id: 'support use normal sloppy0.1', camp: 'sloppy0.1', metric: 'support', sel: (L, c) => c === 'normal' || c === 'onboard' || c === 'rest', lo: 0, hi: 3 },
  { id: 'support use super sloppy0.1', camp: 'sloppy0.1', metric: 'support', sel: (L, c) => c === 'super', lo: 0, hi: 25 },
  { id: 'p90 attempts normal (no support)', camp: 'sloppy0.1-nosupport', metric: 'p90', sel: (L, c) => c === 'normal' || c === 'onboard' || c === 'rest', lo: 1, hi: 2 },
  { id: 'p90 attempts hard (no support)', camp: 'sloppy0.1-nosupport', metric: 'p90', sel: (L, c) => c === 'hard', lo: 1, hi: 4 },
  { id: 'p90 attempts super (no support)', camp: 'sloppy0.1-nosupport', metric: 'p90', sel: (L, c) => c === 'super', lo: 1, hi: 6 },
];

/* 판 기록(runs) → 목표 확인 결과 [{ id, cond, bot, metric, value, lo, hi, n, status }] — status: ok | LOW | HIGH | n/a */
export function checkTargets(runs, levels) {
  const cls = {};
  for (const L of levels) cls[L] = tagClass(L);
  const by = new Map();
  for (const r of runs) { const key = `${r.cond}|${r.b}`; if (!by.has(key)) by.set(key, []); by.get(key).push(r); }
  const out = [];
  for (const t of TARGETS) {
    for (const cond of t.cond) {
      const pick = (bot) => (by.get(`${cond}|${bot}`) || []).filter((r) => t.sel(r.L, cls[r.L]));
      const mine = pick(t.bot);
      if (!mine.length) continue;
      let v = summarize(mine)[t.metric];
      if (t.rel) { const other = pick(t.rel); if (!other.length) continue; v -= summarize(other)[t.metric]; }
      out.push({ id: t.id, cond, bot: t.bot, metric: t.metric, value: v, lo: t.lo, hi: t.hi, n: mine.length, status: statusOf(v, t.lo, t.hi) });
    }
  }
  return out;
}
export function checkCampTargets(camps) {
  const out = [];
  for (const t of CAMP_TARGETS) {
    const list = camps[t.camp];
    if (!list) continue;
    const recs = list.flat().filter((r) => t.sel(r.L, tagClass(r.L)));
    if (!recs.length) continue;
    const v = summarizeCampaign(recs)[t.metric];
    out.push({ id: t.id, camp: t.camp, metric: t.metric, value: v, lo: t.lo, hi: t.hi, n: recs.length, status: statusOf(v, t.lo, t.hi) });
  }
  return out;
}
function statusOf(v, lo, hi) {
  if (!Number.isFinite(v)) return 'n/a';
  const eps = 1e-9;
  return v < lo - eps ? 'LOW' : v > hi + eps ? 'HIGH' : 'ok';
}

/* EXPECT(L)을 새로 구한다: bot 캠페인 seeds개를 L1~maxL까지 돌려 레벨별 첫 시도 중앙 강화를 낸다.
   보정에서 EXPECT를 쓰려면 이 결과(또는 bench --expect-only의 JSON)를 표로 굳혀 쓴다 — 게임이 판마다 돌리기엔 느리다.
   돌려주는 것: { table: expectFromCampaigns(...), camps: [레벨 기록 배열...] } */
export async function runCampaigns({ bot = 'sloppy0.1', seeds = 8, maxL = 60, support = true, skill = true, hero = '', workers = 4, pool = null } = {}) {
  const p = pool || makePool(workers);
  try {
    const camps = await Promise.all(Array.from({ length: seeds }, (_, i) => p.run({ kind: 'campaign', bot, seed: i + 1, maxL, support, skill, hero })));
    return { table: expectFromCampaigns(camps), camps };
  } finally { if (!pool) p.close(); }
}

/* ---------- 도구(margin·fork·fbcal) 공용 ---------- */
/* 명령줄: --levels 1-60|5,10 --seeds N --workers N --json f --expect f, 그 밖의 --키 값/--플래그 */
export function cliArgs(argv = process.argv.slice(2), dflt = {}) {
  const o = { levels: '1-60', seeds: 6, workers: 4, json: '', expect: '', ...dflt };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) o[k] = true;
    else { o[k] = v; i++; }
  }
  o.levels = parseLevels(o.levels);
  o.seeds = Math.max(1, +o.seeds);
  o.workers = Math.max(1, +o.workers);
  return o;
}
export function parseLevels(t) {
  const out = [];
  for (const part of String(t).split(',')) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`--levels: ${part}`);
    const a = +m[1]; const b = m[2] ? +m[2] : a;
    for (let L = a; L <= b; L++) if (!out.includes(L)) out.push(L);
  }
  return out.sort((x, y) => x - y);
}
/* EXPECT 표: 파일(bench JSON) → 없으면 tools/bench-baseline.json → 없으면 초안 공식(floor((L−1)/5), 뭉치 heroCap−1) */
export function draftExpect(L) {
  const u = Math.min(10, Math.floor((L - 1) / 5));
  return { start: u, fire: u, coin: 0, hero: L >= C.UNLOCK.hero ? 'mungchi' : null, heroLv: L >= C.UNLOCK.hero ? Math.max(1, R.heroCap(L) - 1) : 0 };
}
export function loadExpect(file) {
  const f = file || new URL('./bench-baseline.json', import.meta.url);
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const table = j.expect || null;
    if (table) return { table, src: file || 'tools/bench-baseline.json' };
  } catch { /* 없으면 공식 */ }
  return { table: null, src: '초안 공식 floor((L-1)/5)' };
}
/* 조건 이름 → 출격 옵션 */
export function loadoutFor(cond, L, E) {
  if (cond === 'none') return loadoutNone();
  if (cond === 'cap') return loadoutCap(L);
  const lo = E ? loadoutExpect(E, L) : null;
  if (lo) return lo;
  const d = draftExpect(L);
  return { start: C.START_N + 2 * d.start, fire: d.fire, hero: d.hero ? { id: d.hero, lv: d.heroLv } : null };
}
/* 달리기만 돈다 → 경기장 입장 상태(못 가면 null) */
export function toArena(lv, pol, co, state = null) {
  const s = state || C.newGame(lv, co);
  const max = maxTicksFor(lv);
  while (s.phase === 'run' && s.tick < max) C.step(s, pol(s));
  return s.phase === 'arena' ? s : null;
}
/* 보스 바꾸기(경기장 입장 직후 상태에): hp = 체력, c = 닿기까지 c×bossKill 초가 되게 걷는 속도 */
export const BOSS_WALK_DIST = C.BOSS_GAP - 2.5;   // 나타나는 거리 28m − 닿는 거리 약 2.5m
export function setBoss(s, { hp = null, c = null } = {}) {
  if (hp != null) s.boss.hp = s.boss.max = Math.max(1, Math.round(hp));
  if (c) s.boss.walk = BOSS_WALK_DIST / (c * s.params.bossKill);
  return s;
}
/* 이 레벨을 이 출격 조건에서 calibrate()처럼 잰 기준 병력(ref): 약한 기준·기준 봇 도착으로 */
export function refFor(lv, co) {
  const w = toArena(lv, (s) => C.botInput(s, { pump: false, crates: false, specials: false }), { start: co.start, fire: co.fire });
  const s = toArena(lv, (x) => C.botInput(x), { start: co.start, fire: co.fire });
  if (!w || !s) return null;
  return { ref: Math.max(co.start, Math.min(s.squad.n - s.stats.healedAtArena, 2 * w.squad.n)), strongArr: s.squad.n, weakArr: w.squad.n };
}
/* 'call' 일감을 워커에 나눠 돌린다: module의 fn(L, opts)을 레벨마다 */
export async function mapLevels(moduleUrl, fn, levels, opts, workers) {
  const pool = makePool(workers);
  const t0 = performance.now();
  try {
    const order = [...levels].sort((a, b) => b - a);
    const res = {};
    await Promise.all(order.map((L) => pool.run({ kind: 'call', module: moduleUrl, fn, args: [L, opts] }).then((o) => { res[L] = o; if (process.stderr.isTTY) process.stderr.write(`L${L} `); })));
    if (process.stderr.isTTY) process.stderr.write('\n');
    return { res, sec: (performance.now() - t0) / 1000, cpu: pool.busy / 1000 };
  } finally { pool.close(); }
}
