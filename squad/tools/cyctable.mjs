/* 회차 표 만들기: node squad/tools/cyctable.mjs [--cycles 2,3] [--max 60] [--workers 4]
   2회차부터의 L1~max를 그 회차의 기대 강화(core.expectAt(L, c) = 1회차 EXPECT + 10·(c−1)단계, 영웅 +2·(c−1)레벨)로 보정해 assets/cyctable.js에 적는다.
   배치는 1회차 표(caltable.js)의 것을 먼저 본다(같은 레벨). 표에 없는 회차는 게임이 처음 열 때 그 자리에서 보정한다(core.prepareLevel(L, c)).
   1회차 표(caltable.js)나 규칙(SIM)을 바꾸면 다시 돌린다 — tests/endgame.mjs가 표와 실제 보정이 같은지 표본으로 확인한다. 4코어에서 회차마다 1분쯤 */
import fs from 'node:fs';
import os from 'node:os';
import { C, makePool, cliArgs } from './benchlib.mjs';

/* 워커 일감: 회차 c의 레벨 L을 표 없이 보정 */
export function calCycle(L, c) {
  const lv = C.calibrateLevel(L, C.CAL_TRIES, C.keepAttempt(L), c, false);
  const out = { failed: !!lv.failed };
  for (const f of C.CAL_FIELDS) out[f] = lv[f];
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const o = cliArgs(process.argv.slice(2), { cycles: '2,3', max: 60, workers: Math.min(4, os.availableParallelism ? os.availableParallelism() : os.cpus().length) });
  const cycles = String(o.cycles).split(',').map(Number).filter((c) => c >= 2);
  const MAX = +o.max;
  const pool = makePool(+o.workers);
  const T0 = performance.now();
  try {
    const out = {};
    for (const c of cycles) {
      const t = performance.now();
      const levels = {};
      await Promise.all(Array.from({ length: MAX }, (_, i) => MAX - i).map((L) => pool.run({ kind: 'call', module: import.meta.url, fn: 'calCycle', args: [L, c] }).then((r) => { levels[L] = r; })));
      const failed = Object.keys(levels).filter((L) => levels[L].failed);
      const moved = Object.keys(levels).filter((L) => levels[L].attempt !== C.keepAttempt(+L));
      console.log(`${c}회차: L1~${MAX} — 보정 실패 ${failed.length ? failed.join(',') : '없음'}, 1회차와 다른 배치 ${moved.length ? moved.map((L) => 'L' + L).join(',') : '없음'}, 배치 검사 못 넘음 ${Object.keys(levels).filter((L) => levels[L].qa === false).map((L) => 'L' + L).join(',') || '없음'} (${((performance.now() - t) / 1000).toFixed(0)}초)`);
      out[c] = levels;
    }
    const body = cycles.map((c) => `    ${c}: { levels: {\n${Object.keys(out[c]).map(Number).sort((a, b) => a - b).map((L) => `      ${L}: ${JSON.stringify(Object.fromEntries(C.CAL_FIELDS.map((f) => [f, out[c][L][f]])))},`).join('\n')}\n    } },`).join('\n');
    fs.writeFileSync(new URL('../assets/cyctable.js', import.meta.url), `/* 회차 표 — node squad/tools/cyctable.mjs 로 만든다(손으로 고치지 않는다).
   cycles[c].levels = 회차 c의 L1~${MAX} 보정 결과(1회차 표 caltable.js와 같은 칸). SIM이 다르면 쓰지 않고 그 자리에서 보정한다. */
export const CYC = {
  sim: ${C.SIM},
  cycles: {
${body}
  },
};
`);
    console.log(`회차 ${cycles.join('·')} → assets/cyctable.js (${((performance.now() - T0) / 1000).toFixed(0)}초)`);
  } finally { pool.close(); }
}
