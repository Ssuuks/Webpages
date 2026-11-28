/* 앞 구간 생존 여유 측정(ENDGAME.md 62절): 강화 단계 × 봇마다 죽은 구간 · 구간별 보스전 시간 · 구간 중 최저 병력/시작 병력 · 보스 앞 병력/시작 · 손실 까닭.
   N=32 MAX=6 UPS=20,30 BOTS=sloppy0.1,sloppy0.3 node squad/tools/earlyprobe.mjs
   조건: 개편 판 · 다 연 판(3단계, 강화 20 이상이면 화염병) · 카드 think · 뭉치 Lv min(5, ⌈강화/6⌉) · 시작 병력 START_N + 2 × 강화 · 시드 77 + 13i.
   SET='BUILD.early=6,C.GAUNT.from=2' — roster.js 표(접두어 없음)나 core.js 표(C. 접두어) 값을 바꿔 본다(배열은 C.GAUNT.pats.0.1처럼).
   RAMP=1,1.25,1.4 — 구간 k(1부터)의 위협 덧배수 시제품(마지막 값이 그 뒤로 이어진다). 계약(curse) 자리로 넣는다 — 다음 구간을 만들 때 위협 배수에 곱해진다.
   ROOT=다른 squad 폴더(예전 코드를 재려면) */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const self = fileURLToPath(import.meta.url);
const ROOT = process.env.ROOT || fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
if (isMainThread) {
  const seeds = +(process.env.N || 32), maxSeg = +(process.env.MAX || 6);
  const ups = (process.env.UPS || '10,20,30').split(',').map(Number);
  const bots = (process.env.BOTS || 'sloppy0.1,sloppy0.3,naive').split(',');
  const jobs = [];
  for (const up of ups) for (const bot of bots) for (let i = 0; i < seeds; i++) jobs.push({ up, bot, i, maxSeg });
  const res = [];
  const NW = Math.min(8, os.cpus().length);
  await Promise.all(Array.from({ length: NW }, async () => {
    while (jobs.length) {
      const j = jobs.shift();
      res.push(await new Promise((ok, no) => { const w = new Worker(self, { workerData: j }); w.on('message', ok); w.on('error', no); }));
    }
  }));
  const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(p * (b.length - 1)))] : NaN; };
  for (const up of ups) for (const bot of bots) {
    const rs = res.filter((r) => r.up === up && r.bot === bot);
    const dead = {}; for (const r of rs) if (r.deadSeg) dead[r.deadSeg] = (dead[r.deadSeg] || 0) + 1;
    const reach = rs.map((r) => (r.deadSeg ? r.deadSeg - 1 : maxSeg));
    console.log(`\n강화 ${up} · ${bot} · ${rs.length}판 — 죽은 구간 ${JSON.stringify(dead)} · ${maxSeg}구간 넘김 ${rs.filter((r) => !r.deadSeg).length} · 잡은 보스 평균 ${(reach.reduce((a, b) => a + b, 0) / reach.length).toFixed(1)} 중앙 ${q(reach, 0.5)}`);
    for (let k = 1; k <= maxSeg; k++) {
      const st = rs.map((r) => r.seg[k]).filter(Boolean);
      if (!st.length) continue;
      const minR = st.map((x) => x.minN / x.n0), arr = st.map((x) => x.arrive / x.n0);
      const lc = {}; let tot = 0; for (const x of st) for (const [c, v] of Object.entries(x.loss)) { lc[c] = (lc[c] || 0) + v; tot += v; }
      const top = Object.entries(lc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, v]) => `${c} ${(100 * v / tot).toFixed(0)}%`).join(' · ');
      const bt = st.map((x) => x.bossT).filter((x) => x != null);
      console.log(`  ${k}구간 n=${st.length} 보스전 중앙 ${q(bt, 0.5)?.toFixed(1)}s 90% ${q(bt, 0.9)?.toFixed(1)}s · 시작병력 중앙 ${q(st.map((x) => x.n0), 0.5)} · 최저/시작 10% ${q(minR, 0.1).toFixed(2)} 중앙 ${q(minR, 0.5).toFixed(2)} · 보스앞/시작 10% ${q(arr, 0.1).toFixed(2)} 중앙 ${q(arr, 0.5).toFixed(2)} · 손실/시작 중앙 ${q(st.map((x) => x.lost / x.n0), 0.5).toFixed(2)} 90% ${q(st.map((x) => x.lost / x.n0), 0.9).toFixed(2)} | ${top}`);
    }
  }
} else {
  const { up, bot, i, maxSeg } = workerData;
  const C = await import(pathToFileURL(ROOT + '/assets/core.js').href);
  const R = await import(pathToFileURL(ROOT + '/assets/roster.js').href);
  const T = await import(pathToFileURL(ROOT + '/tools/endless.mjs').href);
  const { makeBot } = await import(pathToFileURL(ROOT + '/tests/bots.mjs').href);
  for (const kv of (process.env.SET || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); const ps = k.split('.'); let o = ps[0] === 'C' ? C : R; const ps2 = ps[0] === 'C' ? ps.slice(1) : ps; for (const x of ps2.slice(0, -1)) o = o[x]; o[ps2[ps2.length - 1]] = Number(v); }
  const opt = { seed: 77 + i * 13, start: C.START_N + 2 * up, fire: up, hero: { id: 'mungchi', lv: Math.min(5, Math.ceil(up / 6)) }, unl: 3, ammoOpen: R.AMMO_IDS2, relicsOpen: R.RELIC_IDS.slice(), flame: up >= 20, build: 2 };
  const RAMP = (process.env.RAMP || '').split(',').filter(Boolean).map(Number);   // 구간 k(1부터)의 위협 덧배수 — 계약(curse) 자리로 넣는다
  const s = C.newEndless(opt);
  const pol = makeBot(bot, 1000 + i, { skill: true });
  const pick = T.makePicker('think', 2000 + i);
  const seg = {}; let cur = null, ticks = 0, curK = 1, applied = 0;
  const begin = (k) => { cur = seg[k] = { n0: s.squad.n, minN: s.squad.n, arrive: null, lost: 0, loss: {} }; };
  begin(1);
  while (s.phase !== 'lost' && s.endless.bosses < maxSeg && ticks < 60 * 60 * 20) {
    const of = C.offerOf(s);
    if (of) { const j = pick(s, of, pol); const B = s.endless.bld, kn = s.endless.seg + 1, m = RAMP.length ? RAMP[Math.min(RAMP.length - 1, kn - 1)] : 1; if (m > 1 && applied !== kn) { B.curse = (B.curse > 1 ? B.curse : 1) * m; applied = kn; } if (!C.pickCard(s, j)) break; if (m > 1 && s.endless.seg + 1 === kn && B.curse === R.BUILD.curse.mul) B.curse *= m; if (s.endless.seg !== curK) { curK = s.endless.seg; begin(curK); } continue; }
    C.step(s, pol(s)); ticks++;
    if (s.endless.seg !== curK) { curK = s.endless.seg; begin(curK); }
    for (const e of s.ev) {
      if (e.t === 'bossDead' && s.boss && cur) cur.bossT = s.boss.t;
      if (e.t === 'loss' && cur) { const c = (s.boss ? 'B:' : '') + e.cause; cur.loss[c] = (cur.loss[c] || 0) + e.n; cur.lost += e.n; }
    }
    if (cur) { if (s.boss && cur.arrive == null) cur.arrive = s.squad.n; if (!s.boss || true) cur.minN = Math.min(cur.minN, s.squad.n); }
  }
  for (const x of Object.values(seg)) if (x.arrive == null) x.arrive = 0;
  parentPort.postMessage({ up, bot, i, deadSeg: s.phase === 'lost' ? s.endless.seg : 0, cause: s.cause, seg });
}
