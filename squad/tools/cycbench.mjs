/* 회차 난이도 측정(ENDGAME.md 4절 합격 기준): 회차 c의 기대 강화(1회차 EXPECT + 10·(c−1)단계, 영웅 +2·(c−1)레벨)를 단 사람 흉내 봇의
   첫 시도 승률·별 비율을 태그별로 1회차와 견준다.
   node squad/tools/cycbench.mjs [--cycles 1,2,3] [--levels 1-60] [--seeds 6] [--hard 24] [--bots sloppy0.1,sloppy0.1-noskill,sloppy0.3] [--hero mungchi] [--workers 4] */
import os from 'node:os';
import { C, S, R, makePool, cliArgs, parseLevels, tagClass, play, seedOf, makeBot } from './benchlib.mjs';

/* 워커 일감: 회차 c의 레벨 L에서 봇마다 n판 → { bot: { n, win, s3, s2 } } */
export function cycLevel(L, c, bots, n, heroId) {
  const lv = C.prepareLevel(L, c);
  const co = C.expectLoadout(L, c);
  if (heroId && co.hero) co.hero = { id: heroId, lv: co.hero.lv };
  const par = heroId && co.hero ? C.parFor(lv, co.start, co.fire, co.hero) : lv.par;
  const out = {};
  for (const b of bots) {
    const r = { n: 0, win: 0, s3: 0, s2: 0 };
    for (let k = 0; k < n; k++) {
      const res = play(lv, makeBot(b, seedOf(b, L, k)), co);
      r.n++;
      if (res.won) { r.win++; const st = C.starsFor(par, res.fin, true, lv); if (st >= 3) r.s3++; if (st >= 2) r.s2++; }
    }
    out[b] = r;
  }
  return out;
}
/* 회차 캠페인(경제 폐회로): 앞 회차를 다 채운 저장(강화 10·(c−1)단계, 영웅 5 + 2·(c−2))으로 회차 c의 L1~60을 돈다 —
   판마다 번 코인으로 가장 싼 강화(상한 = core.upgCap(maxL, c))나 영웅 레벨(상한 = roster.heroCapC(c, maxL))을 산다. 3번 지면 지원.
   돌려주는 것: { recs: [{ L, attempts, upg(첫 시도 때), heroLv }], earned(번 코인), spent, left, upg, heroLv } */
export function cycCampaign(seed, c, bot = 'sloppy0.1') {
  const base = 10 * (c - 1);
  const d = { maxL: 1, coins: 0, upg: { start: base, fire: base, coin: base }, heroLv: 5 + 2 * (c - 2), stars: {}, fails: {} };
  const recs = [];
  let earned = 0;
  let spent = 0;
  for (let L = 1; L <= 60; L++) {
    const lv = C.prepareLevel(L, c);
    const rec = { L, attempts: 0 };
    for (;;) {
      rec.attempts++;
      const hero = { id: 'mungchi', lv: d.heroLv };
      const st = C.START_N + 2 * d.upg.start;
      const sup = (d.fails[L] | 0) >= 3 ? C.supportFor(lv, { start: st, fire: d.upg.fire }) : 0;
      if (rec.attempts === 1) { rec.upg = { ...d.upg }; rec.heroLv = d.heroLv; }
      const r = play(lv, makeBot(bot, C.hash('cyc', bot, seed, c, L, rec.attempts) >>> 0), { start: st + sup, fire: d.upg.fire, hero }, { keep: true });
      const stars = r.won ? (sup ? 1 : C.starsFor(C.parFor(lv, st, d.upg.fire, hero), r.fin, true, lv)) : 0;
      const prev = d.stars[L] | 0;
      const got = C.coinsFor(lv, r.s, !!r.won, stars, 10 * d.upg.coin) + Math.max(0, stars - prev) * 20;
      d.coins += got;
      earned += got;
      if (r.won) { d.stars[L] = Math.max(prev, stars); d.maxL = Math.max(d.maxL, L + 1); d.fails[L] = 0; } else d.fails[L] = (d.fails[L] | 0) + 1;
      for (;;) {
        let best = null;
        const cap = C.upgCap(d.maxL, c);
        for (const k of ['start', 'fire', 'coin']) { if (d.upg[k] >= cap) continue; const cost = S.upgCost(d.upg[k]); if (!best || cost < best.cost) best = { k, cost }; }
        if (d.heroLv < R.heroCapC(c, d.maxL)) { const cost = R.heroCost(d.heroLv); if (!best || cost < best.cost) best = { k: 'hero', cost }; }
        if (!best || best.cost > d.coins) break;
        d.coins -= best.cost;
        spent += best.cost;
        if (best.k === 'hero') d.heroLv++; else d.upg[best.k]++;
      }
      if (r.won || rec.attempts >= 12) break;
    }
    recs.push(rec);
  }
  return { recs, earned, spent, left: d.coins, upg: d.upg, heroLv: d.heroLv };
}
const add = (a, b) => { for (const k of ['n', 'win', 's3', 's2']) a[k] += b[k]; return a; };
const CLASSES = ['onboard', 'normal', 'rest', 'hard', 'super'];
/* 회차·봇·태그별 합계: res[c][bot][cls] = { n, win, s3, s2 } */
export async function cycBench({ cycles = [1, 2, 3], levels = Array.from({ length: 60 }, (_, i) => i + 1), bots = ['sloppy0.1', 'sloppy0.1-noskill', 'sloppy0.3'], seeds = 6, hard = 24, hero = '', pool }) {
  const res = {};
  const jobs = [];
  for (const c of cycles) {
    res[c] = {};
    for (const b of bots) { res[c][b] = {}; for (const k of CLASSES) res[c][b][k] = { n: 0, win: 0, s3: 0, s2: 0 }; }
    for (const L of levels) {
      const cls = tagClass(L);
      const n = cls === 'hard' || cls === 'super' ? hard : seeds;
      jobs.push(pool.run({ kind: 'call', module: import.meta.url, fn: 'cycLevel', args: [L, c, bots, n, hero] }).then((r) => { for (const b of bots) add(res[c][b][cls], r[b]); }));
    }
  }
  await Promise.all(jobs);
  return res;
}
export const rate = (r, k = 'win', of = 'n') => (r[of] ? (100 * r[k]) / r[of] : NaN);

if (import.meta.url === `file://${process.argv[1]}`) {
  const o = cliArgs(process.argv.slice(2), { cycles: '1,2,3', levels: '1-60', seeds: 6, hard: 24, bots: 'sloppy0.1,sloppy0.1-noskill,sloppy0.3', hero: '', workers: Math.min(4, os.availableParallelism ? os.availableParallelism() : os.cpus().length) });
  const pool = makePool(+o.workers);
  const cycles = String(o.cycles).split(',').map(Number);
  const bots = String(o.bots).split(',');
  const t0 = performance.now();
  try {
    if (process.argv.includes('--campaign')) {
      // 회차 경제: 캠페인 seeds개씩 — 회차 끝의 강화·영웅 레벨, 번 코인과 쓴 코인, 레벨별 첫 시도 강화가 기대 강화(expectAt(L, c))와 얼마나 다른가
      for (const c of cycles.filter((x) => x >= 2)) {
        const runs = await Promise.all(Array.from({ length: +o.seeds }, (_, i) => pool.run({ kind: 'call', module: import.meta.url, fn: 'cycCampaign', args: [i + 1, c] })));
        const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
        const at = (L, k) => med(runs.map((r) => (k === 'hero' ? r.recs[L - 1].heroLv : r.recs[L - 1].upg[k])));
        console.log(`${c}회차 캠페인 ${runs.length}개: 번 코인 중앙 ${med(runs.map((r) => r.earned))}, 쓴 코인 ${med(runs.map((r) => r.spent))}, 남은 코인 ${med(runs.map((r) => r.left))}, 끝 강화 ${['start', 'fire', 'coin'].map((k) => med(runs.map((r) => r.upg[k]))).join('/')} 영웅 Lv${med(runs.map((r) => r.heroLv))}, 시도 수 합 중앙 ${med(runs.map((r) => r.recs.reduce((a, x) => a + x.attempts, 0)))}`);
        console.log('  레벨: 첫 시도 때 강화 중앙(시작/화력/보급·영웅) ↔ 기대 강화');
        for (const L of [1, 5, 10, 15, 20, 30, 40, 50, 60]) { const e = C.expectAt(L, c); console.log(`  L${String(L).padStart(2)}  ${at(L, 'start')}/${at(L, 'fire')}/${at(L, 'coin')}·${at(L, 'hero')}  ↔  ${e.start}/${e.fire}/${e.coin}·${e.heroLv}`); }
      }
      process.exitCode = 0;
    } else {
    const res = await cycBench({ cycles, levels: parseLevels(String(o.levels)), bots, seeds: +o.seeds, hard: +o.hard, hero: o.hero, pool });
    const f = (x) => (Number.isFinite(x) ? x.toFixed(0).padStart(3) : '  -');
    for (const b of bots) {
      console.log(`\n${b}${o.hero ? ' · ' + o.hero : ''} — 첫 시도 승률% (이긴 판의 ★★★% / ★★ 이상%)  [1회차와의 차이 %p]`);
      for (const cls of CLASSES) {
        const base = res[cycles[0]][b][cls];
        if (!base.n) continue;
        console.log(`  ${cls.padEnd(8)}` + cycles.map((c) => {
          const r = res[c][b][cls];
          const d = rate(r) - rate(base);
          return `${c}회차 ${f(rate(r))} (${f(rate(r, 's3', 'win'))}/${f(rate(r, 's2', 'win'))}) n${String(r.n).padStart(3)}${c === cycles[0] ? '      ' : ` [${d >= 0 ? '+' : ''}${d.toFixed(0)}]`.padEnd(6)}`;
        }).join('  |  '));
      }
    }
    console.log(`\n${((performance.now() - t0) / 1000).toFixed(0)}초`);
    }
  } finally { pool.close(); }
}
