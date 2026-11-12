/* 탄종 동등성 측정(ARSENAL.md 3절 합격 기준): 어느 탄종이든 집중한 사람 봇(sloppy0.1)의 첫 시도 승률이 보통탄과 ±5%p 안인가.
   기대 강화, L11~60, 레벨마다 n판. 무한모드 잡은 보스 수도 본다.
   node squad/tools/ammobench.mjs [--levels 11-60] [--seeds 8] [--bot sloppy0.1] [--workers 4] */
import os from 'node:os';
import { C, R, makePool, cliArgs, parseLevels, play, seedOf, makeBot } from './benchlib.mjs';
import { runEndless } from './endless.mjs';

export function ammoLevel(L, n, bot = 'sloppy0.1') {
  const lv = C.prepareLevel(L);
  const co = C.expectLoadout(L);
  const out = {};
  for (const id of ['', ...R.AMMO_IDS]) {
    let w = 0, fin = 0;
    for (let i = 0; i < n; i++) { const r = play(lv, makeBot(bot, seedOf(bot, L, i)), id ? { ...co, ammo: id } : co, { keep: true }); w += r.won; fin += r.won ? r.s.squad.n / Math.max(1, lv.par) : 0; }
    out[id || 'none'] = [w, n, fin, C.levelTag(L).tag === 'hard' || C.levelTag(L).tag === 'super' ? w : 0, C.levelTag(L).tag === 'hard' || C.levelTag(L).tag === 'super' ? n : 0];
  }
  return out;
}
export function ammoEndless(id, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(runEndless({ seed: 77 + i * 13, start: C.START_N + 20, fire: 10, hero: { id: 'mungchi', lv: 5 }, ammo: id || '' }, makeBot('sloppy0.1', 1000 + i)).bosses);
  return out;
}
export async function ammoBench({ levels, seeds = 8, bot = 'sloppy0.1', pool }) {
  const sum = {};
  await Promise.all(levels.map((L) => pool.run({ kind: 'call', module: import.meta.url, fn: 'ammoLevel', args: [L, seeds, bot] }).then((r) => {
    for (const k in r) { sum[k] = sum[k] || [0, 0, 0, 0, 0]; for (let i = 0; i < 5; i++) sum[k][i] += r[k][i]; }
  })));
  return sum;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const o = cliArgs(process.argv.slice(2), { levels: '11-60', seeds: 8, bot: 'sloppy0.1', workers: Math.min(4, os.availableParallelism ? os.availableParallelism() : os.cpus().length) });
  const pool = makePool(+o.workers);
  try {
    const sum = await ammoBench({ levels: parseLevels(String(o.levels)), seeds: +o.seeds, bot: String(o.bot), pool });
    const base = sum.none[0] / sum.none[1];
    console.log(`탄종 — ${o.bot} 첫 시도 승률(기대 강화, L${o.levels}, 레벨마다 ${o.seeds}판)`);
    for (const k of Object.keys(sum)) console.log(`  ${k.padEnd(7)} ${(100 * sum[k][0] / sum[k][1]).toFixed(1)}%  (${(100 * (sum[k][0] / sum[k][1] - base)).toFixed(1).padStart(5)}%p)  어려운 레벨 ${(100 * sum[k][3] / Math.max(1, sum[k][4])).toFixed(1)}%  이긴 판 남은 병력/par ${(sum[k][2] / Math.max(1, sum[k][0])).toFixed(2)}`);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const ids = ['', ...R.AMMO_IDS];
    const runs = await Promise.all(ids.map((id) => pool.run({ kind: 'call', module: import.meta.url, fn: 'ammoEndless', args: [id, 24] })));
    console.log('무한모드(강화 10단계·뭉치 Lv5, 24판) 잡은 보스 평균: ' + ids.map((id, i) => `${id || '없음'} ${mean(runs[i]).toFixed(2)}`).join(' · '));
  } finally { pool.close(); }
}
