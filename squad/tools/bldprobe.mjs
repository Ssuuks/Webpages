/* 개편 판(build: 2) 경험 지표 측정(ENDGAME.md 18.12·20절): 도달 구간 · 구간대별 벽 파괴율 · 보스전 시간 · 카드 등급 · 보스 패턴 · 죽은 곳.
   node squad/tools/bldprobe.mjs [squadRoot=squad] [seeds=16] [picker=think] [maxSeg=50] [bot=sloppy0.1]
   조건: 강화 30 · 뭉치 Lv5 · 다 연 판(3단계 + 화염병). 시드는 77 + 13i(tools/endless.mjs cardRun과 같다).
   SET='BUILD.thr.step=1.06,BUILD.wall.cut=0.5' 처럼 roster.js 표 값을 바꿔 본다. V=1이면 판마다 죽은 곳.
   탄은 일곱이 다 열린 판(24절 — AMMO4=1이면 예전 넷), AMMO=shock 출격 탄, RELICS=loot+scope 처음부터 쥔 유물(유물 하나씩 재기 — 24.4).
   FIN=fire:10+def:10 이면 최종 강화(57.7 — 화력 · 방호 +N)를 단 판.
   ENH=frost:l+pierce:r 이면 처음부터 쥔 카드 강화(대상:등급 l 전설 · r 희귀 — 61절: 전설 하나씩 재기).
   다른 판(예: git worktree로 꺼낸 예전 코드)을 재려면 첫 인자로 그 squad 폴더 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);
if (isMainThread) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(self), '..'));
  const seeds = +(process.argv[3] || 16), picker = process.argv[4] || 'think', maxSeg = +(process.argv[5] || 50);
  const bot = process.argv[6] || 'sloppy0.1';
  const N = Math.min(4, os.cpus().length);
  const jobs = Array.from({ length: seeds }, (_, i) => i);
  const res = [];
  await Promise.all(Array.from({ length: N }, async () => {
    while (jobs.length) {
      const i = jobs.shift();
      res.push(await new Promise((ok, no) => { const w = new Worker(self, { workerData: { root, i, picker, maxSeg, bot } }); w.on('message', ok); w.on('error', no); }));
    }
  }));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const sum = (k) => res.reduce((a, r) => a + r[k], 0);
  const bs = res.map((r) => r.bosses).sort((a, b) => a - b);
  console.log(`${path.basename(path.dirname(root))} ${picker} n=${seeds}: bosses mean ${mean(bs).toFixed(1)} median ${bs[(bs.length - 1) >> 1]} range ${bs[0]}~${bs[bs.length - 1]}`);
  const wb = res.reduce((a, r) => { for (const [k, v] of Object.entries(r.wall)) { a[k] = a[k] || [0, 0]; a[k][0] += v[0]; a[k][1] += v[1]; } return a; }, {});
  console.log('  hard-wall break rate by seg band:', Object.entries(wb).map(([k, v]) => `${k}:${(100 * v[0] / Math.max(1, v[1])).toFixed(0)}%(${v[1]})`).join(' '));
  console.log(`  rocket wall hits ${sum('rkWall')} / rockets ${sum('rk')} · cards: common ${sum('c1')} rare ${sum('c2')} legend ${sum('c3')} · offered(shown at pick) ${sum('o1')}/${sum('o2')}/${sum('o3')} · boss time mean ${(sum('bossT') / Math.max(1, sum('bosses'))).toFixed(1)}s`);
  const bt = res.reduce((a, r) => { for (const [k, v] of Object.entries(r.bt)) { a[k] = a[k] || [0, 0]; a[k][0] += v[0]; a[k][1] += v[1]; } return a; }, {});
  console.log('  boss time by band:', Object.entries(bt).map(([k, v]) => `${k}+:${(v[0] / v[1]).toFixed(1)}s`).join(' '));
  const causes = {}; for (const r of res) causes[r.cause] = (causes[r.cause] || 0) + 1;
  if (process.env.V) for (const r of res) console.log('   death', r.bosses, r.death, JSON.stringify(r.loss));
  console.log('  causes', JSON.stringify(causes), ' bossPat', JSON.stringify(res.reduce((a, r) => { for (const [k, v] of Object.entries(r.pat)) a[k] = (a[k] || 0) + v; return a; }, {})));
} else {
  const { root, i, picker, maxSeg, bot } = workerData;
  const C = await import(pathToFileURL(path.join(root, 'assets/core.js')).href);
  const R = await import(pathToFileURL(path.join(root, 'assets/roster.js')).href);
  const T = await import(pathToFileURL(path.join(root, 'tools/endless.mjs')).href);
  const { makeBot } = await import(pathToFileURL(path.join(root, 'tests/bots.mjs')).href);
  for (const kv of (process.env.SET || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); const ps = k.split('.'); let o = R; for (const x of ps.slice(0, -1)) o = o[x]; o[ps[ps.length - 1]] = Number(v); }
  const opt = { seed: 77 + i * 13, start: C.START_N + 60, fire: 30, hero: { id: 'mungchi', lv: 5 }, unl: 3, ammoOpen: process.env.AMMO4 ? R.AMMO_IDS : R.AMMO_IDS2, relicsOpen: R.RELIC_IDS.slice(), flame: true, build: 2, ...(process.env.AMMO ? { ammo: process.env.AMMO } : {}), ...(process.env.RELICS ? { relics: process.env.RELICS.split('+') } : {}), ...(process.env.GUN ? { gun: process.env.GUN } : {}), ...(process.env.FIN ? { fin: Object.fromEntries(process.env.FIN.split('+').map((kv) => { const [k, v] = kv.split(':'); return [k, +v]; })) } : {}) };
  const s = C.newEndless(opt);
  for (const kv of (process.env.ENH || '').split('+').filter(Boolean)) { const [id, k] = kv.split(':'); const B = s.endless.bld; B.enh = B.enh || {}; B.enh[id] = B.enh[id] || { r: 0, l: 0 }; B.enh[id][k === 'r' ? 'r' : 'l']++; }
  const pol = makeBot(bot, 1000 + i, { skill: true });
  const pick = T.makePicker(picker, 2000 + i);
  const out = { o1: 0, o2: 0, o3: 0, loss: {}, bt: {}, bosses: 0, wall: {}, rk: 0, rkWall: 0, c1: 0, c2: 0, c3: 0, bossT: 0, pat: {} };
  const walls = new Map();
  let ticks = 0;
  while (s.phase !== 'lost' && s.endless.bosses < maxSeg && ticks < 60 * 60 * 40) {
    const of = C.offerOf(s);
    if (of) { const j = pick(s, of, pol); const c = of[j]; if (c && c.n && c.k !== 'gun') out['c' + c.n]++; for (const o of C.offerOf(s) || []) if (o.n && o.k !== 'gun') out['o' + o.n] = (out['o' + o.n] || 0) + 1; if (!C.pickCard(s, j)) break; continue; }
    C.step(s, pol(s)); ticks++;
    for (const p of s.props) if ((p.kind === 'wall' || p.kind === 'door') && !walls.has(p.id) && p.max > 0) walls.set(p.id, { seg: s.endless.seg, max: p.max, p });
    for (const e of s.ev) {
      if (e.t === 'loss' && s.boss) { const k = e.cause + (e.sub || ''); out.loss[k] = (out.loss[k] || 0) + e.n; }
      if (e.t === 'rocket') out.rk++;
      if (e.t === 'bossPat') out.pat[e.k] = (out.pat[e.k] || 0) + 1;
      if (e.t === 'bossDead' && s.boss) { const band = Math.min(5, Math.floor((s.endless.seg - 1) / 6)) * 6 + 1; out.bt[band] = out.bt[band] || [0, 0]; out.bt[band][0] += s.boss.t; out.bt[band][1]++; }
    }
    // walls the squad went through (passed): broken or not — count only 'hard' walls (max relatively high) via flag
    for (const [id, w] of walls) {
      if (w.done) continue;
      if (!w.p.alive || w.p.passed || w.p.z < s.squad.z - 2) {
        w.done = true;
        const band = Math.min(5, Math.floor((w.seg - 1) / 6)) * 6 + 1;
        const k = `${band}+`;
        out.wall[k] = out.wall[k] || [0, 0];
        out.wall[k][1]++;
        if (!w.p.alive) out.wall[k][0]++;
      }
    }
  }
  out.bosses = s.endless.bosses; out.bossT = s.stats.bossT || 0; out.cause = s.cause || 'max';
  out.rkWall = s.stats.rkWall || 0;
  out.death = s.phase === 'lost' ? `${s.endless.seg}${s.boss ? '/' + (s.boss.clash ? 'clash' : 'arena') + '/' + (s.boss.pat || []).join('+') + '/hp' + (s.boss.hp / s.boss.max).toFixed(2) + '/t' + s.boss.t.toFixed(1) : ''}` : '';

  parentPort.postMessage(out);
}
