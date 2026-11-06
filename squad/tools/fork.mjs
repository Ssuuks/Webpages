/* 한 줄의 판돈: node squad/tools/fork.mjs [--levels 5-60] [--seeds 2] [--cond expect|none] [--mode worst|second] [--vars asis,c1_m1] [--json out.json]
   (비평 실험 critic/fork.mjs를 옮김) sloppy0.1(스킬 켬)로 돌다가 칸이 둘 이상인 줄 하나만, 40m 앞에서 본 겉보기 결과가 가장 나쁜(또는 두 번째) 칸으로 보낸다.
   그 줄이 40m 안에 들어온 틱의 상태를 복제해 거기서부터 갈라 돌리므로, 줄마다 처음부터 다시 돌지 않는다.
   찍는 것(구간마다): 줄 수, 원래 판 승률, 그 줄만 틀린 판 승률, 승→패로 뒤집힌 줄 %, 도착 병력(틀림/원래) 중앙값, 억지로 보낸 칸에 실제로 들어간 %.
   계획의 목표: 판돈 줄 최악 칸의 도착 손해 ≥25%, 뒤집히는 줄 일반 ≥20%·어려움 ≥35%(2단계) */
import { isMainThread } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import {
  C, cliArgs, loadExpect, loadoutFor, toArena, setBoss, refFor, play, makeBot, seedOf, mapLevels, bandOf, bandList, median, pct, fmt, tagOf,
} from './benchlib.mjs';

function parseVar(v) {
  if (v === 'asis') return { name: v };
  const m = v.match(/^c([\d.]+|-)_m([\d.]+)$/);
  if (!m) throw new Error(`--vars: ${v}`);
  return { name: v, c: m[1] === '-' ? null : +m[1], m: +m[2] };
}
const center = (c) => Math.max(-C.EDGE, Math.min(C.EDGE, (c.x0 + c.x1) / 2));
function forced(inner, rowId, mode) {
  const f = (s) => {
    const base = inner(s);
    if (s.phase !== 'run') return base;
    const q = s.squad;
    const row = s.rows.find((r) => r.id === rowId);
    if (!row || row.done || row.z - q.z > 40 || row.z < q.z) return base;
    if (f.want < 0) {   // 줄이 40m 안에 들어온 순간 한 번 정한다(쏘아서 숫자가 바뀌어도 그 칸을 지킨다)
      const v = row.cells.map((c, i) => ({ v: C.applyOp(q.n, c.op, c.v), i })).sort((a, b) => a.v - b.v || a.i - b.i);
      f.want = (mode === 'second' ? v[v.length - 2] : v[0]).i;
    }
    return { ...C.steer(s, center(row.cells[f.want]), 0.1), skill: base.skill };
  };
  f.want = -1;
  f.clone = () => { const g = forced(inner.clone(), rowId, mode); g.want = f.want; return g; };
  return f;
}

/* 한 레벨(워커에서): [{ seed, row, base:[변형별 승], forced:[...], dArr, hit }] */
export function levelFork(L, o) {
  const lv = C.prepareLevel(L);
  const co = loadoutFor(o.cond, L, o.expect);
  const vars = o.vars.map(parseVar);
  const cal = vars.some((v) => v.name !== 'asis') ? refFor(lv, co) : null;
  const finish = (a, pol) => vars.map((v) => {
    if (!a) return 0;
    const s = structuredClone(a);
    if (v.name !== 'asis') { if (!cal) return 0; setBoss(s, { hp: C.dps(cal.ref * v.m, 0, co.fire) * lv.params.bossKill, c: v.c }); }
    return play(lv, pol.clone(), co, { state: s }).won;
  });
  const multi = lv.rows.filter((r) => r.cells.length > 1).map((r) => r.id);
  const out = [];
  for (let k = 0; k < o.seeds; k++) {
    const sl = makeBot('sloppy0.1', seedOf('fork', L, k));
    const s = C.newGame(lv, co);
    const snaps = {};
    const max = Math.ceil((lv.arenaZ / lv.speed + 80) / C.DT);
    while (s.phase === 'run' && s.tick < max) {
      for (const id of multi) {
        if (snaps[id]) continue;
        const row = s.rows.find((r) => r.id === id);
        if (!row.done && row.z >= s.squad.z && row.z - s.squad.z <= 40) snaps[id] = { s: structuredClone(s), pol: sl.clone() };
      }
      C.step(s, sl(s));
    }
    const baseArr = s.phase === 'arena' ? s.squad.n : 0;
    const base = finish(s.phase === 'arena' ? s : null, sl);
    for (const id of multi) {
      const sn = snaps[id];
      if (!sn) continue;   // 그 줄에 닿기 전에 끝난 판
      const fp = forced(sn.pol, id, o.mode);
      const a = toArena(lv, fp, co, sn.s);
      const row = (a || sn.s).rows.find((r) => r.id === id);
      out.push({ seed: k, row: id, base, forced: finish(a, fp), dArr: baseArr && a ? a.squad.n / baseArr : 0, hit: row && row.done && row.chosen === fp.want ? 1 : 0 });
    }
  }
  return out;
}

if (isMainThread && process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const o = cliArgs(process.argv.slice(2), { levels: '5-60', seeds: 2, cond: 'expect', mode: 'worst', vars: 'asis,c1_m1,c0.9_m1,c0.8_m1.15' });
  const E = loadExpect(o.expect);
  const vars = String(o.vars).split(',');
  const { res, sec, cpu } = await mapLevels(import.meta.url, 'levelFork', o.levels, { cond: o.cond, seeds: o.seeds, mode: o.mode, vars, expect: E.table }, o.workers);
  console.log(`한 줄의 판돈(${o.mode}) — SIM ${C.SIM}, 조건 ${o.cond} (EXPECT: ${E.src}), L${o.levels[0]}-${o.levels.at(-1)}, sloppy0.1 시드 ${o.seeds}`);
  const groups = [...bandList(o.levels).map((b) => [b, (L) => bandOf(L) === b])];
  const tags = [...new Set(o.levels.map((L) => tagOf(L)).filter(Boolean))];
  for (const t of tags) groups.push([`#${t}`, (L) => tagOf(L) === t]);
  console.log('묶음: 줄 수 | 원래 승% | 틀린 판 승% | 뒤집힘 % | 도착 틀림/원래 중앙값 | 들어간 %');
  vars.forEach((v, vi) => {
    console.log(`[${v}]`);
    for (const [g, sel] of groups) {
      let n = 0; let bw = 0; let fw = 0; let flip = 0; let hit = 0; const d = [];
      for (const L of o.levels) if (sel(L)) for (const r of res[L]) { n++; bw += r.base[vi]; fw += r.forced[vi]; if (r.base[vi] && !r.forced[vi]) flip++; hit += r.hit; if (r.dArr) d.push(r.dArr); }
      if (n) console.log(`  ${g.padEnd(10)} ${String(n).padStart(4)}줄 | ${fmt(pct(bw, n)).padStart(3)} | ${fmt(pct(fw, n)).padStart(3)} | ${fmt(pct(flip, n)).padStart(3)} | ${fmt(median(d), 2)} | ${fmt(pct(hit, n))}`);
    }
  });
  console.log(`\n걸린 시간 ${sec.toFixed(1)}초(일감 합 ${cpu.toFixed(0)}초)`);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ sim: C.SIM, cond: o.cond, mode: o.mode, expectSrc: E.src, vars, res }));
}
