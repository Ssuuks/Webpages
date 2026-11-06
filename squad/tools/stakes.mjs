/* 게이트 줄의 판돈(P07): node squad/tools/stakes.mjs [--levels 1-60] [--seeds 3] [--bot sloppy0.1] [--json out.json]
   사람 흉내 봇(기본 sloppy0.1, 스킬 켬, 기대 강화 EXPECT)으로 돌다가, 칸이 둘 이상인 줄이 40m 안에 처음 들어온 틱의 상태를 복제해
   그 줄의 '칸마다' 갈라 돌린다(그 줄만 그 칸 가운데로 곧장 가고, 나머지는 같은 봇 그대로 — 보스전까지).
   줄마다 남기는 것: 줄 종류(row.kind), 처음 볼 때 겉보기 결과(지금 병력에 숫자를 그대로 적용), 칸마다 도착 병력·승패, 원래 판의 도착·승패.
   찍는 것(묶음·줄 종류마다):
   - 겉보기 1등 = 실제 1등 %: 겉보기로 가장 좋은 칸이 실제로(그 칸에 서서 쏘며 들어간 뒤) 도착 병력이 가장 많은 칸인 줄의 비율. 목표 ≤65%
   - 최악 칸 손해: 1 − (겉보기로 가장 나쁜 칸의 도착 / 원래 판의 도착) 중앙값, 그리고 실제로 가장 나쁜 칸의 손해(1 − 최소/최대). 판돈 줄(stake) 목표 ≥25%
   - 뒤집힘 %: 원래 판이 이긴 줄 중 그 줄만 겉보기 최악 칸으로 가면 지는 줄. 목표 일반 ≥20%, 어려움·매우 어려움 ≥35%
   표본은 레벨 × 시드 × 줄. 4코어에서 L1-60·시드 3이면 1분쯤 */
import { isMainThread } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { C, cliArgs, loadExpect, loadoutExpect, toArena, play, makeBot, seedOf, mapLevels, median, pct, fmt, tagClass } from './benchlib.mjs';

const center = (c) => Math.max(-C.EDGE, Math.min(C.EDGE, (c.x0 + c.x1) / 2));
/* 줄 rowId에서만 칸 want로 가는 정책(줄이 40m 안에 들어온 뒤 지날 때까지), 나머지는 inner 그대로 */
export function forcedCell(inner, rowId, want) {
  const f = (s) => {
    const base = inner(s);
    if (s.phase !== 'run') return base;
    const q = s.squad;
    const row = s.rows.find((r) => r.id === rowId);
    if (!row || row.done || row.z - q.z > 40 || row.z < q.z) return base;
    return { ...C.steer(s, center(row.cells[want]), 0.1), skill: base.skill };
  };
  f.clone = () => forcedCell(inner.clone(), rowId, want);
  return f;
}

/* 한 레벨(워커에서) → 줄 기록 배열 */
export function levelStakes(L, o) {
  const lv = C.prepareLevel(L);
  const co = (o.expect && loadoutExpect(o.expect, L)) || C.expectLoadout(L);
  const multi = lv.rows.filter((r) => r.cells.length > 1).map((r) => r.id);
  const out = [];
  for (let k = 0; k < o.seeds; k++) {
    const pol = makeBot(o.bot, seedOf('stakes', L, k));
    const s = C.newGame(lv, co);
    const snaps = {};
    const max = Math.ceil((lv.arenaZ / lv.speed + 80) / C.DT);
    while (s.phase === 'run' && s.tick < max) {
      for (const id of multi) {
        if (snaps[id]) continue;
        const row = s.rows.find((r) => r.id === id);
        if (!row.done && row.z >= s.squad.z && row.z - s.squad.z <= 40) {
          const n = s.squad.n;
          snaps[id] = { s: structuredClone(s), pol: pol.clone(), n, face: row.cells.map((c) => C.applyOp(n, c.op, c.v)), labels: row.cells.map(C.cellLabel) };
        }
      }
      C.step(s, pol(s));
    }
    const baseArr = s.phase === 'arena' ? s.squad.n : 0;
    const baseWin = s.phase === 'arena' ? play(lv, pol.clone(), co, { state: structuredClone(s) }).won : 0;
    for (const id of multi) {
      const sn = snaps[id];
      if (!sn) continue;   // 그 줄에 닿기 전에 끝난 판
      const row = lv.rows.find((r) => r.id === id);
      const arr = [];
      const win = [];
      const hit = [];
      for (let i = 0; i < row.cells.length; i++) {
        const fp = forcedCell(sn.pol.clone(), id, i);
        const a = toArena(lv, fp, co, structuredClone(sn.s));
        const rr = a ? a.rows.find((r) => r.id === id) : null;
        hit.push(rr && rr.done && rr.chosen === i ? 1 : 0);
        arr.push(a ? a.squad.n : 0);
        win.push(a ? play(lv, fp.clone(), co, { state: a }).won : 0);
      }
      out.push({ L, k, row: id, kind: row.kind, n: sn.n, face: sn.face, labels: sn.labels, arr, win, hit, baseArr, baseWin });
    }
  }
  return out;
}

/* 줄 기록 → 지표 */
const argBest = (a, tie) => { let b = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[b] || (a[i] === a[b] && tie && tie[i] > tie[b])) b = i; return b; };
const argWorst = (a) => { let b = 0; for (let i = 1; i < a.length; i++) if (a[i] < a[b]) b = i; return b; };
export function stakeStats(recs) {
  const n = recs.length;
  let same = 0;
  let flipN = 0;
  let flip = 0;
  const cost = [];
  const spread = [];
  for (const r of recs) {
    const fb = argBest(r.face);
    const fw = argWorst(r.face);
    const tb = argBest(r.arr, r.face);
    if (fb === tb) same++;
    if (r.baseArr > 0) cost.push(1 - r.arr[fw] / r.baseArr);
    const mx = Math.max(...r.arr);
    if (mx > 0) spread.push(1 - Math.min(...r.arr) / mx);
    if (r.baseWin) { flipN++; if (!r.win[fw]) flip++; }
  }
  return { rows: n, faceTrue: pct(same, n), cost: median(cost), spread: median(spread), flip: pct(flip, flipN), flipN };
}
/* 계획(P07)의 목표. 판돈 줄 = 틀리면 판이 기우는 줄(stake 판돈, guard 지킨 ×, trap ×3 뒤 ÷2). 뒤집힘·겉보기는 칸이 둘 이상인 모든 줄 */
export const STAKE_KINDS = ['stake', 'guard', 'trap'];
const NORMAL5 = (L, c) => c === 'normal' && L >= 5;
const HARD = (L, c) => c === 'hard' || c === 'super';
export const STAKE_TARGETS = [
  { id: 'stakes rows: face-worst cell cost (normal L5+)', sel: NORMAL5, kinds: STAKE_KINDS, metric: 'cost', lo: 0.25, hi: 1 },
  { id: 'stakes rows: face-worst cell cost (hard+super)', sel: HARD, kinds: STAKE_KINDS, metric: 'cost', lo: 0.25, hi: 1 },
  { id: 'win→loss flips (normal L5+)', sel: NORMAL5, metric: 'flip', lo: 20, hi: 100 },
  { id: 'win→loss flips (hard+super)', sel: HARD, metric: 'flip', lo: 35, hi: 100 },
  { id: 'face-value best = true best (normal L5+)', sel: NORMAL5, metric: 'faceTrue', lo: 0, hi: 65 },
  { id: 'face-value best = true best (hard+super)', sel: HARD, metric: 'faceTrue', lo: 0, hi: 65 },
];
export function checkStakes(recs) {
  return STAKE_TARGETS.map((t) => {
    const mine = recs.filter((r) => t.sel(r.L, tagClass(r.L)) && (!t.kinds || t.kinds.includes(r.kind)));
    const v = mine.length ? stakeStats(mine)[t.metric] : NaN;
    const status = !Number.isFinite(v) ? 'n/a' : v < t.lo - 1e-9 ? 'LOW' : v > t.hi + 1e-9 ? 'HIGH' : 'ok';
    return { id: t.id, metric: t.metric, value: v, lo: t.lo, hi: t.hi, n: mine.length, status };
  });
}
export const STAKE_GROUPS = [
  ['onboard L1-4', (L, c) => c === 'onboard'],
  ['L3-4', (L) => L === 3 || L === 4],
  ['normal L5-10', (L, c) => c === 'normal' && L <= 10],
  ['normal L11+', (L, c) => c === 'normal' && L >= 11],
  ['normal L5+', (L, c) => c === 'normal' && L >= 5],
  ['hard+super', (L, c) => c === 'hard' || c === 'super'],
  ['rest', (L, c) => c === 'rest'],
];

if (isMainThread && process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const o = cliArgs(process.argv.slice(2), { levels: '1-60', seeds: 3, bot: 'sloppy0.1' });
  const E = o.expect ? loadExpect(o.expect) : { table: null, src: 'caltable.js(C.expectLoadout)' };
  const { res, sec, cpu } = await mapLevels(import.meta.url, 'levelStakes', o.levels, { seeds: o.seeds, bot: o.bot, expect: E.table }, o.workers);
  const all = o.levels.flatMap((L) => res[L]);
  console.log(`게이트 줄의 판돈 — SIM ${C.SIM}, ${o.bot}, EXPECT ${E.src}, L${o.levels[0]}-${o.levels.at(-1)}, 시드 ${o.seeds}, 줄 ${all.length}개`);
  console.log('묶음/줄 종류            줄   겉보기=실제1등%  겉보기최악 손해(중앙)  실제 최악/최선 손해  뒤집힘%(이긴 줄 n)');
  const line = (name, recs) => {
    if (!recs.length) return;
    const st = stakeStats(recs);
    console.log(`${name.padEnd(22)} ${String(st.rows).padStart(4)}  ${fmt(st.faceTrue).padStart(14)}  ${fmt(st.cost, 2).padStart(20)}  ${fmt(st.spread, 2).padStart(19)}  ${fmt(st.flip).padStart(6)} (${st.flipN})`);
  };
  for (const [g, sel] of STAKE_GROUPS) {
    const recs = all.filter((r) => sel(r.L, tagClass(r.L)));
    if (!recs.length) continue;
    line(g, recs);
    const kinds = [...new Set(recs.map((r) => r.kind))].sort();
    for (const kd of kinds) line(`  ${kd}`, recs.filter((r) => r.kind === kd));
  }
  console.log('\n== 계획(P07)의 목표 ==');
  for (const r of checkStakes(all)) console.log(`  ${r.status.padEnd(4)} ${r.id.padEnd(48)} ${fmt(r.value, r.metric === 'cost' ? 2 : 0).padStart(6)}  [${r.lo}, ${r.hi}]  n=${r.n}`);
  console.log(`\n걸린 시간 ${sec.toFixed(1)}초(일감 합 ${cpu.toFixed(0)}초)`);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ sim: C.SIM, bot: o.bot, expectSrc: E.src, seeds: o.seeds, recs: all }));
}
