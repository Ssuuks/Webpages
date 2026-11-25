/* 무한모드 개편 판 병력 성장 측정(ENDGAME.md 51절): 병력이 구간 기준 병력 B(k)보다 얼마나 앞서 가나, 그 몫이 어디서 오나.
   node squad/tools/growprobe.mjs [squadRoot=squad] [seeds=16] [picker=think] [maxSeg=30] [bot=sloppy0.1]
   조건: bldprobe와 같다(강화 30 · 뭉치 Lv5 · 다 연 판, 시드 77 + 13i). SET='BUILD.supply.super=0.5'처럼 roster.js 표 값을 바꿔 본다.
   출력: 구간대별 보스 앞 병력 ÷ B(k)(중앙 · 위 10%), 병력이 바뀐 까닭마다 log 성장(배수의 log를 판마다 더한 평균 — ×2 한 번 = 0.69) */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);
if (isMainThread) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(self), '..'));
  const seeds = +(process.argv[3] || 16), picker = process.argv[4] || 'think', maxSeg = +(process.argv[5] || 30);
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
  const q = (a, f) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(f * (b.length - 1) + 0.5))] : NaN; };
  const bs = res.map((r) => r.bosses).sort((a, b) => a - b);
  console.log(`${picker} n=${seeds}: bosses mean ${mean(bs).toFixed(1)} median ${bs[(bs.length - 1) >> 1]} range ${bs[0]}~${bs[bs.length - 1]}`);
  const bands = [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25], [26, 30], [31, 99]];
  for (const [a, b] of bands) {
    const v = res.flatMap((r) => r.ratio.filter(([k]) => k >= a && k <= b).map(([, x]) => x));
    if (!v.length) continue;
    const src = {};
    let segs = 0;
    for (const r of res) for (const sg of r.src) if (sg.k >= a && sg.k <= b) { segs++; for (const [kk, x] of Object.entries(sg.d)) src[kk] = (src[kk] || 0) + x; }
    console.log(`  ${a}~${b}: n/B median ${q(v, 0.5).toFixed(2)} p90 ${q(v, 0.9).toFixed(2)} max ${q(v, 1).toFixed(1)} (${v.length})  log/seg: ` + Object.entries(src).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).map(([kk, x]) => `${kk} ${(x / segs).toFixed(2)}`).join(' · '));
  }
  const causes = {}; for (const r of res) causes[r.cause] = (causes[r.cause] || 0) + 1;
  console.log('  causes', JSON.stringify(causes));
} else {
  const { root, i, picker, maxSeg, bot } = workerData;
  const C = await import(pathToFileURL(path.join(root, 'assets/core.js')).href);
  const R = await import(pathToFileURL(path.join(root, 'assets/roster.js')).href);
  const T = await import(pathToFileURL(path.join(root, 'tools/endless.mjs')).href);
  const { makeBot } = await import(pathToFileURL(path.join(root, 'tests/bots.mjs')).href);
  for (const kv of (process.env.SET || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); const ps = k.split('.'); let o = R; for (const x of ps.slice(0, -1)) o = o[x]; o[ps[ps.length - 1]] = Number(v); }
  const opt = { seed: 77 + i * 13, start: C.START_N + 60, fire: 30, hero: { id: 'mungchi', lv: 5 }, unl: 3, ammoOpen: R.AMMO_IDS2, relicsOpen: R.RELIC_IDS.slice(), flame: true, build: 2 };
  const s = C.newEndless(opt);
  const pol = makeBot(bot, 1000 + i, { skill: true });
  const pick = T.makePicker(picker, 2000 + i);
  const B = (k) => (C.segFloor(k) || C.ENDLESS.floor0) * R.BUILD.bk.mul;
  const out = { ratio: [], src: [], bosses: 0 };
  let cur = { k: 1, d: {} };
  let arena = false, ticks = 0;
  const add = (kk, x) => { cur.d[kk] = (cur.d[kk] || 0) + x; };
  while (s.phase !== 'lost' && s.endless.bosses < maxSeg && ticks < 60 * 60 * 40) {
    const of = C.offerOf(s);
    if (of) {   // 카드를 고르면 다음 구간이 시작되며 자동 보급이 든다(step 밖이라 여기서 잰다)
      const n0 = s.squad.n, k0 = s.endless.seg;
      if (!C.pickCard(s, pick(s, of, pol))) break;
      if (s.squad.n > n0) add('supply', Math.log(s.squad.n / n0));
      if (s.endless.seg !== k0) { out.src.push(cur); cur = { k: s.endless.seg, d: {} }; arena = false; }
      continue;
    }
    const k0 = s.endless.seg;
    if (k0 !== cur.k) { out.src.push(cur); cur = { k: k0, d: {} }; arena = false; }
    C.step(s, pol(s)); ticks++;
    if (s.boss && !arena) { arena = true; out.ratio.push([s.endless.seg, s.squad.n / B(s.endless.seg)]); }
    // 사건마다 log 배수: gain(why) · gate(op) · loss(cause)
    let n = s.squad.n;
    for (let j = s.ev.length - 1; j >= 0; j--) {   // 뒤에서 앞으로 — 사건 전 병력을 되짚는다
      const e = s.ev[j];
      if (e.t === 'gain' && e.n > 0) { const b = Math.max(1, n - e.n); add(e.why === 'gate' ? 'gate' : e.why, Math.log(n / b)); n = b; }
      else if (e.t === 'loss' && e.n > 0) { const b = n + e.n; add('-' + e.cause, Math.log(Math.max(1, n) / b)); n = b; }
    }
    for (const e of s.ev) if (e.t === 'gate' && e.after > e.before && e.before > 0) { const kk = e.op === 'mul' ? 'gate×' : 'gate+'; add(kk, Math.log(e.after / e.before)); add('gate', -Math.log(e.after / e.before)); }
  }
  out.src.push(cur);
  for (const sg of out.src) for (const kk of Object.keys(sg.d)) if (Math.abs(sg.d[kk]) < 1e-9) delete sg.d[kk];
  out.bosses = s.endless.bosses; out.cause = s.cause || 'max';
  parentPort.postMessage(out);
}
