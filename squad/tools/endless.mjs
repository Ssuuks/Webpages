/* 무한모드 측정: 봇마다 판을 돌려 잡은 보스 수(도달 구간)의 분포를 본다.
   node squad/tools/endless.mjs [--seeds 24] [--bots sloppy0.1,sloppy0.3,idle,random] [--up 10] [--hero mungchi] [--herolv 5] [--max 30] [--trace] */
import * as C from '../assets/core.js';
import { makeBot } from '../tests/bots.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes('--' + k);

/* 한 판: 전멸하거나 maxSeg 구간을 넘길 때까지. { bosses, seg, t, peak, ns: 구간마다 보스 뒤 병력, lost: 죽은 곳 } */
export function runEndless(opt, pol, maxSeg = 30, maxTicks = 60 * 60 * 30) {
  const s = C.newEndless(opt);
  const ns = [];
  let frames = 0;
  let worst = 0;
  while (s.phase !== 'lost' && s.endless.bosses < maxSeg && s.tick < maxTicks) {
    C.step(s, pol(s));
    for (const e of s.ev) if (e.t === 'segStart') ns.push(s.squad.n);
    frames++;
  }
  void frames; void worst;
  return { bosses: s.endless.bosses, seg: s.endless.seg, t: s.t, peak: s.squad.peak, ns, cause: s.cause, arena: !!s.boss, coins: C.endlessCoins(s, 0), s };
}
export const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : 0; };

if (import.meta.url === `file://${process.argv[1]}`) {
  // --set mul0=0.8,mulStep=1.1,bossM.=0.5 : ENDLESS 상수를 바꿔 본다(실험용)
  for (const kv of (arg('set', '') || '').split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    const path = k.split('.');
    let o = C.ENDLESS;
    for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
    o[path[path.length - 1]] = Number(v);
  }
  const seeds = +arg('seeds', 24);
  const up = +arg('up', 10);
  const hero = arg('hero', 'mungchi');
  const heroLv = +arg('herolv', 5);
  const maxSeg = +arg('max', 30);
  const bots = arg('bots', 'sloppy0.1,sloppy0.3,idle,random').split(',');
  for (const name of bots) {
    const res = [];
    const t0 = Date.now();
    for (let i = 0; i < seeds; i++) {
      const pol = makeBot(name, 1000 + i, { skill: true });
      res.push(runEndless({ seed: 77 + i * 13, start: C.START_N + 2 * Math.min(up, +arg('startup', up)), fire: up, hero: hero === 'none' ? null : { id: hero, lv: heroLv } }, pol, maxSeg));
    }
    const b = res.map((r) => r.bosses);
    const hist = {};
    for (const x of b) hist[x] = (hist[x] | 0) + 1;
    console.log(`${name.padEnd(12)} up${up} 중앙 ${median(b)} 평균 ${(b.reduce((a, c) => a + c, 0) / b.length).toFixed(2)} 최소 ${Math.min(...b)} 최대 ${Math.max(...b)} | 분포 ${JSON.stringify(hist)} | 시간 중앙 ${Math.round(median(res.map((r) => r.t)))}초 코인 중앙 ${median(res.map((r) => r.coins))} | 경기장에서 죽음 ${res.filter((r) => r.arena).length}/${res.length} | ${Date.now() - t0}ms`);
    if (flag('trace')) for (const r of res.slice(0, 6)) console.log('   ', r.bosses, r.cause, r.arena ? 'arena' : 'run', 'ns', r.ns.join('→'), 'peak', r.peak);
  }
}
