/* 보정 표 만들기: node squad/tools/caltable.mjs
   레벨 1~60을 기준 봇으로 보정해 assets/caltable.js에 적는다. 규칙(SIM)이 바뀌면 다시 돌린다.
   tests/run.mjs가 표와 실제 보정이 같은지 확인한다. */
import fs from 'node:fs';
import { calibrateLevel, CAL_FIELDS, SIM } from '../assets/core.js';

const N = 60;
const levels = {};
for (let L = 1; L <= N; L++) {
  const lv = calibrateLevel(L);
  levels[L] = Object.fromEntries(CAL_FIELDS.map((f) => [f, lv[f]]));
  process.stdout.write(`L${L} `);
}
const body = Object.entries(levels).map(([L, v]) => `    ${L}: ${JSON.stringify(v)},`).join('\n');
const out = `/* 보정 표 — node squad/tools/caltable.mjs 로 만든다(손으로 고치지 않는다).
   SIM이 다르면 쓰지 않고 그 자리에서 보정한다. */
export const CAL = {
  sim: ${SIM},
  levels: {
${body}
  },
};
`;
fs.writeFileSync(new URL('../assets/caltable.js', import.meta.url), out);
console.log(`\n${N}개 레벨 → assets/caltable.js`);
