/* 보정 표 만들기: node squad/tools/caltable.mjs [--max 120] [--iters 2] [--seeds 8] [--workers 4] [--expect f.json] [--json log.json]
   1) EXPECT(L)을 정한다: 지금 EXPECT로 L1~max를 보정 → 그 표로 sloppy0.1 캠페인(스킬 켬, 지원 받음, 코인 → 가장 싼 강화·영웅 레벨,
      강화 상한 EXPECT+1)을 seeds개 돌려 레벨별 첫 시도 중앙 강화를 새 EXPECT로. 보정과 EXPECT가 서로 물리므로 iters번(기본 2) 되풀이한다.
      처음 EXPECT: --expect 파일(bench JSON의 expect) → 지금 caltable.js(같은 SIM이면) → tools/bench-baseline.json → 초안 공식.
      --iters 0이면 지금 EXPECT 그대로 보정만 다시 한다(규칙은 그대로이고 상수만 바꿨을 때).
   2) 마지막 EXPECT로 L1~max를 보정해 assets/caltable.js에 적는다(EXPECT 표도 함께). L(max+1) 이후는 게임이 처음 열 때 계산한다.
   tests/run.mjs가 표와 실제 보정이 같은지 표본으로 확인한다. 규칙(SIM)이 바뀌면 다시 돌린다. */
import fs from 'node:fs';
import os from 'node:os';
import { C, makePool, expectFromCampaigns, cliArgs } from './benchlib.mjs';

const o = cliArgs(process.argv.slice(2), { levels: '1', max: 120, iters: 2, seeds: 8, workers: Math.min(4, os.availableParallelism ? os.availableParallelism() : os.cpus().length) });
const MAX = Math.max(1, +o.max);
const ITERS = Math.max(0, +o.iters);
const T0 = performance.now();
const log = (...a) => console.log(...a);

function startExpect() {
  if (o.expect) { const j = JSON.parse(fs.readFileSync(o.expect, 'utf8')); return { E: j.expect || j, src: `파일 ${o.expect}` }; }
  const cur = C.calTable();
  if (cur && cur.sim === C.SIM && cur.expect) return { E: cur.expect, src: '지금 caltable.js' };
  try {
    const j = JSON.parse(fs.readFileSync(new URL('./bench-baseline.json', import.meta.url), 'utf8'));
    if (j.expect) return { E: j.expect, src: 'tools/bench-baseline.json' };
  } catch { /* 없으면 초안 */ }
  return { E: {}, src: '초안 공식' };
}
/* 표 밖 레벨까지 채운 EXPECT(1..MAX): 주어진 표 + core.expectAt의 늘려 잡기 */
function fillExpect(E) {
  C.useCal({ sim: C.SIM, expect: E, levels: {} });
  const out = {};
  for (let L = 1; L <= MAX; L++) { const e = C.expectAt(L); out[L] = { start: e.start, fire: e.fire, coin: e.coin, hero: e.hero || null, heroLv: e.heroLv }; }
  return out;
}
const pool = makePool(o.workers);
async function calAll(E) {
  const cal = { sim: C.SIM, expect: E, levels: {} };
  const order = Array.from({ length: MAX }, (_, i) => MAX - i);
  const levels = {};
  await Promise.all(order.map((L) => pool.run({ kind: 'cal', L, cal }).then((r) => { levels[L] = r; })));
  const failed = Object.entries(levels).filter(([, r]) => r.failed).map(([L]) => L);
  return { levels, failed };
}
async function campaigns(E, levels) {
  const cal = { sim: C.SIM, expect: E, levels: strip(levels) };
  return Promise.all(Array.from({ length: o.seeds }, (_, i) => pool.run({ kind: 'campaign', bot: 'sloppy0.1', seed: i + 1, maxL: MAX, support: true, cal })));
}
const strip = (levels) => Object.fromEntries(Object.entries(levels).map(([L, r]) => [L, Object.fromEntries(C.CAL_FIELDS.map((f) => [f, r[f]]))]));
const show = (E) => [1, 5, 10, 15, 20, 30, 40, 50, 60, 80, 100, 120].filter((L) => L <= MAX).map((L) => { const e = E[L]; return `L${L} ${e.start}/${e.fire}/${e.coin} ${e.hero ? e.hero[0] + e.heroLv : '-'}`; }).join(' | ');
function diff(a, b) {
  let n = 0; let mx = 0;
  for (let L = 1; L <= MAX; L++) for (const k of ['start', 'fire', 'coin', 'heroLv']) { const d = Math.abs((a[L][k] | 0) - (b[L][k] | 0)); if (d) n++; mx = Math.max(mx, d); }
  return `달라진 칸 ${n}개, 최대 차이 ${mx}`;
}

const hist = [];
try {
  let { E, src } = startExpect();
  E = fillExpect(E);
  log(`보정 표 — SIM ${C.SIM}, L1-${MAX}, EXPECT 되풀이 ${ITERS}번, 캠페인 ${o.seeds}개, 워커 ${o.workers}. 처음 EXPECT: ${src}`);
  log(`  E0  ${show(E)}`);
  for (let it = 1; it <= ITERS; it++) {
    const t = performance.now();
    const { levels, failed } = await calAll(E);
    const camps = await campaigns(E, levels);
    const stuck = camps.map((c) => (c.length && c[c.length - 1].stuck ? c[c.length - 1].L : null)).filter(Boolean);
    const E2 = fillExpect(expectFromCampaigns(camps));
    log(`  E${it}  ${show(E2)}   (${diff(E, E2)}; 보정 실패 ${failed.length ? failed.join(',') : '없음'}; 캠페인 멈춤 ${stuck.length ? stuck.join(',') : '없음'}; ${((performance.now() - t) / 1000).toFixed(0)}초)`);
    hist.push({ it, E: E2, failed, stuck });
    E = E2;
  }
  const { levels, failed } = await calAll(E);
  if (failed.length) log(`보정 실패 레벨: ${failed.join(',')}`);
  const body = Object.keys(levels).map(Number).sort((a, b) => a - b).map((L) => `    ${L}: ${JSON.stringify(Object.fromEntries(C.CAL_FIELDS.map((f) => [f, levels[L][f]])))},`).join('\n');
  const ex = Object.keys(E).map(Number).sort((a, b) => a - b).map((L) => `    ${L}: ${JSON.stringify(E[L])},`).join('\n');
  const out = `/* 보정 표 — node squad/tools/caltable.mjs 로 만든다(손으로 고치지 않는다).
   SIM이 다르면 쓰지 않고 그 자리에서 보정한다. expect = 레벨별 기대 강화(EXPECT), levels = 레벨별 보정 결과. */
export const CAL = {
  sim: ${C.SIM},
  expect: {
${ex}
  },
  levels: {
${body}
  },
};
`;
  fs.writeFileSync(new URL('../assets/caltable.js', import.meta.url), out);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ sim: C.SIM, max: MAX, iters: ITERS, hist, expect: E, levels }, null, 1));
  log(`${MAX}개 레벨 → assets/caltable.js (${((performance.now() - T0) / 1000).toFixed(0)}초)`);
} finally {
  pool.close();
}
