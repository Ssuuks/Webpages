/* 펫 효과 측정(ENDGAME.md 6절 합격 기준): 만렙 펫 한 마리의 효과가 화력 강화 두세 단계와 비슷한가.
   집중한 사람 봇(sloppy0.1)의 첫 시도 승률(기대 강화, L11~60)을 펫 없음 / 화력 +2단계 / +3단계 / 펫마다(만렙)로 견주고, 무한모드 도달 구간도 본다.
   node squad/tools/petbench.mjs [--levels 11-60] [--seeds 8] [--lv 10] [--workers 4] */
import os from 'node:os';
import { C, R, makePool, cliArgs, parseLevels, play, seedOf, makeBot } from './benchlib.mjs';
import { runEndless } from './endless.mjs';

/* 워커 일감: 레벨 L에서 조건마다 n판 → { 조건: [이긴 판, 판 수, 펫 발동 수 합] } */
export function petLevel(L, n, petLv, bot = 'sloppy0.1') {
  const lv = C.prepareLevel(L);
  const co = C.expectLoadout(L);
  const conds = { none: co, 'fire+2': { ...co, fire: co.fire + 2 }, 'fire+3': { ...co, fire: co.fire + 3 } };
  for (const id of R.PET_IDS) conds[id] = { ...co, pet: { id, lv: petLv } };
  const out = {};
  for (const k of Object.keys(conds)) {
    let w = 0;
    let procs = 0;
    for (let i = 0; i < n; i++) { const r = play(lv, makeBot(bot, seedOf(bot, L, i)), conds[k], { keep: true }); w += r.won; procs += r.s.pet ? r.s.pet.procs : 0; }
    out[k] = [w, n, procs];
  }
  return out;
}
export function petEndless(id, petLv, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(runEndless({ seed: 77 + i * 13, start: C.START_N + 20, fire: 10, hero: { id: 'mungchi', lv: 5 }, pet: id ? { id, lv: petLv } : null }, makeBot('sloppy0.1', 1000 + i, { skill: true })).bosses);
  return out;
}
export async function petBench({ levels, seeds = 8, lv = R.PET_MAX_LV, pool }) {
  const sum = {};
  await Promise.all(levels.map((L) => pool.run({ kind: 'call', module: import.meta.url, fn: 'petLevel', args: [L, seeds, lv] }).then((r) => {
    for (const k in r) { sum[k] = sum[k] || [0, 0, 0]; for (let i = 0; i < 3; i++) sum[k][i] += r[k][i]; }
  })));
  return sum;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const o = cliArgs(process.argv.slice(2), { levels: '11-60', seeds: 8, lv: R.PET_MAX_LV, workers: Math.min(4, os.availableParallelism ? os.availableParallelism() : os.cpus().length) });
  const pool = makePool(+o.workers);
  try {
    const sum = await petBench({ levels: parseLevels(String(o.levels)), seeds: +o.seeds, lv: +o.lv, pool });
    const base = sum.none[0] / sum.none[1];
    console.log(`펫 Lv${o.lv} — sloppy0.1 첫 시도 승률(기대 강화, L${o.levels}, 레벨마다 ${o.seeds}판)`);
    for (const k of Object.keys(sum)) console.log(`  ${k.padEnd(8)} ${(100 * sum[k][0] / sum[k][1]).toFixed(1)}%  (${(100 * (sum[k][0] / sum[k][1] - base)).toFixed(1).padStart(5)}%p)${R.PETS[k] ? `  ${R.PETS[k].fxName}, 판당 발동 ${(sum[k][2] / sum[k][1]).toFixed(1)}번` : ''}`);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const ids = ['', ...R.PET_IDS];
    const runs = await Promise.all(ids.map((id) => pool.run({ kind: 'call', module: import.meta.url, fn: 'petEndless', args: [id, +o.lv, 24] })));
    console.log('무한모드(강화 10단계·뭉치 Lv5, 24판) 잡은 보스 평균: ' + ids.map((id, i) => `${id || '없음'} ${mean(runs[i]).toFixed(2)}`).join(' · '));
  } finally { pool.close(); }
}
