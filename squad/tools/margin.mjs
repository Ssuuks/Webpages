/* 보스 여유 격자: node squad/tools/margin.mjs [--levels 1-60] [--seeds 6] [--cond expect|none] [--vars asis,c1_m1,c.9_m1.1] [--expect f.json] [--json out.json]
   (비평 실험 critic/margin.mjs를 옮김) 봇마다 달리기를 한 번 돌고 경기장 입장 상태를 복제해, 보스만 바꿔 끝까지 돈다.
   변형 이름: asis = 게임 그대로. c<수>_m<수> = 체력 dps(m·ref, 화력)·bossKill, 닿기까지 c·bossKill초(c가 '-'면 걷는 속도 그대로).
   ref는 그 조건(강화·영웅)으로 calibrate()처럼 잰 기준 병력 — 보정이 '실제로 들고 오는 힘'을 볼 때 보스가 어떻게 되는지 본다.
   찍는 것: 변형 × 봇 × 구간 승률, 진 판 해부(경기장 전 패배 %, 질 때 보스 남은 체력, 이긴 판 접촉 %), 도착/ref 구간별 승률, strong이 지는 레벨 */
import { isMainThread } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import {
  C, cliArgs, loadExpect, loadoutFor, toArena, setBoss, refFor, play, makeBot, seedOf, mapLevels, bandOf, bandList, median, pct, fmt,
} from './benchlib.mjs';

const DEFAULT_VARS = 'asis,c-_m0.75,c-_m0.9,c-_m1,c1.3_m0.9,c1.15_m0.9,c1_m0.9,c1_m1,c0.9_m1';
function parseVar(v) {
  if (v === 'asis') return { name: v };
  const m = v.match(/^c([\d.]+|-)_m([\d.]+)$/);
  if (!m) throw new Error(`--vars: ${v}`);
  return { name: v, c: m[1] === '-' ? null : +m[1], m: +m[2] };
}
const BOTS = (seeds) => [['strong', 1], ['expert', Math.max(1, Math.ceil(seeds / 2))], ['sloppy0.1', seeds], ['sloppy0.3', seeds], ['naive', 1]];

/* 한 레벨(워커에서): { cal, bots: { name: [[변형별 결과]...] } } */
export function levelMargin(L, o) {
  const lv = C.prepareLevel(L);
  const co = loadoutFor(o.cond, L, o.expect);
  const cal = refFor(lv, co);
  if (!cal) return { calFail: true };
  const vars = o.vars.map(parseVar);
  const res = { cal, bots: {} };
  for (const [name, n] of BOTS(o.seeds)) {
    for (let k = 0; k < n; k++) {
      const mk = () => makeBot(name === 'naive' ? 'naive' : name, seedOf(`margin:${name}`, L, k), name === 'naive' ? { dodgeBoss: true } : {});
      const pol = mk();
      const a = toArena(lv, pol, co);
      const row = vars.map((v) => {
        if (!a) return { won: 0, runDeath: 1 };
        const s = structuredClone(a);
        if (v.name !== 'asis') setBoss(s, { hp: C.dps(cal.ref * v.m, 0, co.fire) * lv.params.bossKill, c: v.c });
        const r = play(lv, pol.clone(), co, { state: s });
        return { won: r.won, runDeath: 0, ratio: a.squad.n / cal.ref, contact: r.contact, hpLeft: r.won ? 0 : r.bossLeft };
      });
      (res.bots[name] ||= []).push(row);
    }
  }
  return res;
}

if (isMainThread && process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const o = cliArgs(process.argv.slice(2), { cond: 'expect', vars: DEFAULT_VARS });
  const E = loadExpect(o.expect);
  const vars = String(o.vars).split(',');
  const { res, sec, cpu } = await mapLevels(import.meta.url, 'levelMargin', o.levels, { cond: o.cond, seeds: o.seeds, vars, expect: E.table }, o.workers);
  const bands = bandList(o.levels);
  console.log(`보스 여유 격자 — SIM ${C.SIM}, 조건 ${o.cond} (EXPECT: ${E.src}), L${o.levels[0]}-${o.levels.at(-1)}, sloppy 시드 ${o.seeds}`);
  console.log('보정 실패:', Object.entries(res).filter(([, r]) => r.calFail).map(([L]) => L).join(',') || '없음');
  const names = BOTS(o.seeds).map(([n]) => n);
  console.log(`\n승률 % (구간 ${bands.join(' / ')})`);
  vars.forEach((v, vi) => {
    const cells = names.map((b) => `${b} ${bands.map((band) => {
      let w = 0; let n = 0;
      for (const L of o.levels) if (bandOf(L) === band && res[L].bots) for (const r of res[L].bots[b]) { n++; w += r[vi].won; }
      return n ? fmt(pct(w, n)) : '-';
    }).join('/')}`);
    console.log(`${v.padEnd(12)} ${cells.join(' | ')}`);
  });
  console.log('\n진 판 해부(sloppy0.1+0.3): rd = 경기장 전 패배 %(진 판 중), hp = 질 때 보스 남은 체력 % 중앙값, c = 이긴 판 접촉 %');
  vars.forEach((v, vi) => {
    const cells = bands.map((band) => {
      let losses = 0; let rd = 0; const hp = []; let wins = 0; let cw = 0;
      for (const L of o.levels) {
        if (bandOf(L) !== band || !res[L].bots) continue;
        for (const b of ['sloppy0.1', 'sloppy0.3']) for (const r of res[L].bots[b]) { const x = r[vi]; if (x.won) { wins++; cw += x.contact ? 1 : 0; } else { losses++; if (x.runDeath) rd++; else hp.push(x.hpLeft); } }
      }
      return `rd${fmt(pct(rd, losses))} hp${fmt(100 * median(hp))} c${fmt(pct(cw, wins))}`;
    });
    console.log(`${v.padEnd(12)} ${cells.join('  ')}`);
  });
  const buckets = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.3, 9];
  console.log('\n도착/ref 구간별 승률(sloppy0.1+0.3, 모든 레벨) — 승패가 갈리는 벼랑');
  vars.forEach((v, vi) => {
    const acc = buckets.slice(0, -1).map(() => [0, 0]);
    for (const L of o.levels) if (res[L].bots) for (const b of ['sloppy0.1', 'sloppy0.3']) for (const r of res[L].bots[b]) {
      const x = r[vi]; if (x.runDeath) continue;
      const i = buckets.findIndex((q, k) => x.ratio >= q && x.ratio < buckets[k + 1]);
      if (i >= 0) { acc[i][1]++; acc[i][0] += x.won; }
    }
    console.log(`${v.padEnd(12)} ${acc.map((a, i) => `${buckets[i]}-${buckets[i + 1]}:${a[1] ? fmt(pct(a[0], a[1])) : '-'}(${a[1]})`).join(' ')}`);
  });
  const ratio = (b) => bands.map((band) => { const v = []; for (const L of o.levels) if (bandOf(L) === band && res[L].bots) for (const r of res[L].bots[b]) if (!r[0].runDeath) v.push(r[0].ratio); return fmt(median(v), 2); }).join('/');
  console.log(`\n도착/ref 중앙값: strong ${ratio('strong')} | expert ${ratio('expert')} | sloppy0.1 ${ratio('sloppy0.1')} | sloppy0.3 ${ratio('sloppy0.3')}`);
  vars.forEach((v, vi) => { const lost = o.levels.filter((L) => res[L].bots && !res[L].bots.strong[0][vi].won); console.log(`strong이 지는 레벨 ${v}: ${lost.join(',') || '없음'}`); });
  console.log(`\n걸린 시간 ${sec.toFixed(1)}초(일감 합 ${cpu.toFixed(0)}초)`);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ sim: C.SIM, cond: o.cond, expectSrc: E.src, vars, res }));
}
