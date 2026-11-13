/* 한 손 조작 공정성 갈라 보기(P14, 3단계): node squad/tools/fairprobe.mjs [--levels 5-60] [--seeds 2] [--rho 0.3] [--json out.json]
   무한모드: --endless 8 [--unl 2] [--segs 9] [--relics all|id,…] [--flame] — 판 8개(시드 77 + 13i, 강화 10단계·뭉치 Lv5, think 카드 고르기)를 그 해금 단계로 돌며 같은 갈라 보기
   (단계 해금 2단계의 장애물 — 장갑문·폭발 드럼통·방패 정예 — 이 피할 길을 막지 않는지. 기록의 L은 구간 번호. --relics는 3단계에서 열린 유물 — 대왕 보스 뒤에 think로 고른다.
   불굴의 심장이 전멸을 무효로 한 갈래도 전멸로 센다. --flame은 화염병 줄(4단계)을 연 판 — 불 지대는 분대를 다치게 하지 않으니 피할 길을 바꾸지 않는지만 본다)
   사람 흉내 봇(sloppy0.1, 기대 강화)으로 돌다가 위협이 예고되는 틱(독침 발사 spit, 내려찍기 예고 slam, 보스 소환 summon, 톱날이 26m 안에 들어옴 saw)마다
   판을 갈라, rho초 늦게 반응하는 한 손 조작 — 그대로 서 있기 / 왼쪽·오른쪽을 0.15·0.3·0.5초·끝까지 누르기(반응 전에는 하던 쪽으로 계속) — 을 모두 돌린다.
   - 피할 수 없음: 어느 손으로도 그 위협(독침·내려찍기)에 맞는다, 톱날은 어느 손으로도 max(2명, 병력 5%) 넘게 잃는다
   - 억지 손해: '위협이 있을 때 가장 덜 잃는 손'이 '그 위협을 지운 판에서 가장 덜 잃는 손'보다 max(2명, 병력 5%) 넘게 더 잃는다(피할 길이 벽·무리·길 끝에 막힘)
   tests/run.mjs가 레벨 표본으로 확인한다: 피할 수 없음 0, 억지 손해는 독침·내려찍기·소환마다 4% 이하(톱날은 재기만 — 약한 칸을 지키는 톱날은 일부러 값을 매긴다) */
import { isMainThread } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { C, R, cliArgs, mapLevels, makeBot, seedOf, pct } from './benchlib.mjs';
import { makePicker } from './endless.mjs';

export const FORK_HOLDS = [0.15, 0.3, 0.5, 9];
export const SAW_SEE = 26;   // 톱날을 처음 '본다'고 치는 거리(안내 tip과 같다)

/* 판 s0을 복제해 T초 동안: rho초는 하던 쪽(vdir)으로, 그 뒤 h초 동안 d쪽을 누르고, 그다음은 뗀다. mutate(f)로 위협을 지울 수 있다.
   watch(e) = 이 위협에 맞은 이벤트인가 */
function forkLoss(s0, rho, d, h, T, mutate, watch, sawOnly, wait = 0) {
  const f = structuredClone(s0);
  if (mutate) mutate(f);
  const vdir = Math.abs(s0.squad.vx) > 0.5 ? Math.sign(s0.squad.vx) : 0;
  const l0 = f.stats.lost;
  const end = f.tick + Math.round(T / C.DT);
  let hit = false;
  let saw = 0;
  let revived = false;   // 불굴의 심장(유물)이 전멸을 무효로 했다 — 갈라 보기에서는 전멸로 센다
  while (f.tick < end && (f.phase === 'run' || f.phase === 'arena') && !(f.endless && f.endless.offer)) {   // 무한모드: 카드가 뜨면 판이 멈춘다(그 창은 거기까지)
    const t = (f.tick - s0.tick) * C.DT;
    // 반응 전에는 하던 쪽, wait초 서 있다가, h초 동안 d쪽
    C.step(f, { dir: t < rho ? vdir : t < rho + wait ? 0 : d && t < rho + wait + h ? d : 0, tx: null });
    if (watch) for (const e of f.ev) if (watch(e)) { hit = true; if (e.t === 'loss') saw += e.n; }
    for (const e of f.ev) if (e.t === 'relicUse' && e.id === 'heart') revived = true;
  }
  // 톱날: 큰 분대(반지름이 길 폭에 가까운)는 스치기만 해도 몇 명 잃는다 — max(2명, 병력 5%) 넘게 잃을 때만 '맞았다'
  if (sawOnly) hit = saw >= Math.max(2, 0.05 * s0.squad.n);
  return { lost: f.stats.lost - l0 + (f.phase === 'lost' || revived ? 1e6 : 0), hit };
}
/* 한 위협: 손마다 갈라 '맞지 않은 손이 있나'와 억지 손해를 잰다 */
function probe(s, rho, T, mutate, watch, iso, sawOnly) {
  let dodge = !watch;
  let withMin = Infinity;
  let withoutMin = Infinity;
  // 톱날은 멀리서(26m) 보이므로 기다렸다 움직이는 손도 본다(오가는 톱날이 지나간 쪽으로)
  const waits = sawOnly ? [0, 0.5, 1, 1.5] : [0];
  for (const wait of waits) {
    for (const d of wait ? [-1, 1] : [0, -1, 1]) {
      for (const h of d ? FORK_HOLDS : [0]) {
        const a = forkLoss(s, rho, d, h, T, iso, watch, sawOnly, wait);
        if (watch && !a.hit) dodge = true;
        withMin = Math.min(withMin, a.lost);
        withoutMin = Math.min(withoutMin, forkLoss(s, rho, d, h, T, (f) => { if (iso) iso(f); mutate(f); }, null, false, wait).lost);
      }
    }
  }
  const n = s.squad.n;
  const cost = withMin - withoutMin;
  return { n, dodge, cost, forced: cost >= Math.max(2, 0.05 * n) };
}
/* 보스전 위협 하나만 보게: 그 창 안에 새 내려찍기·소환이 오지 않게 */
const quietBoss = (keepSlam) => (f) => {
  if (!f.boss) return;
  if (!keepSlam) f.boss.slam = null;
  f.boss.slamCd = 99;
  f.boss.summonCd = 99;
};

/* 한 레벨(워커에서) → 위협 기록 배열 */
export function fairProbe(L, o = {}) {
  const seeds = o.seeds ?? 2;
  const lv = C.prepareLevel(L);
  const co = C.expectLoadout(L);
  const out = [];
  for (let k = 0; k < seeds; k++) {
    const pol = makeBot(o.bot || 'sloppy0.1', seedOf('fair', L, k));
    const s = C.newGame(lv, co);
    const max = Math.ceil((lv.arenaZ / lv.speed + 120) / C.DT);
    probeLoop(s, pol, max, o, () => L, k, out);
  }
  return out;
}
/* 무한모드 판 i(워커에서) → 위협 기록 배열. 보스 뒤 카드는 think로 고르고(tools/endless.mjs), o.segs 구간의 보스를 잡으면 멈춘다 */
export function fairProbeEndless(i, o = {}) {
  const s = C.newEndless({ seed: 77 + 13 * i, start: C.START_N + 20, fire: 10, hero: { id: 'mungchi', lv: 5 }, unl: o.unl ?? 2, ammoOpen: R.AMMO_IDS, relicsOpen: o.relics || [], flame: o.flame === true });
  const pol = makeBot(o.bot || 'sloppy0.1', seedOf('fairE', i, 0), { skill: true });
  const pick = makePicker('think', 2000 + i);
  const out = [];
  probeLoop(s, pol, 60 * 60 * 30, o, () => s.endless.seg, i, out, (t, of) => (t.endless.bosses >= (o.segs ?? 9) ? -1 : pick(t, of, pol)));
  return out;
}
/* 판 하나를 돌며 위협이 예고되는 틱마다 갈라 본다. pick(s, offer) — 무한모드 카드 고르기(−1이면 거기서 멈춘다) */
function probeLoop(s, pol, max, o, Lof, k, out, pick = null) {
  const rho = o.rho ?? 0.3;
  const kinds = o.kinds || ['spit', 'slam', 'summon', 'saw'];
  const sawSeen = new Set();
  while ((s.phase === 'run' || s.phase === 'arena') && s.tick < max) {
    if (pick && C.offerOf(s)) { const i = pick(s, C.offerOf(s)); if (i < 0) break; C.pickCard(s, i); continue; }
    const spits0 = new Set(s.spits.map((x) => x.id));
    const foes0 = new Set(s.foes.map((x) => x.id));
    C.step(s, pol(s));
    if (s.phase !== 'run' && s.phase !== 'arena') break;
    const L = Lof();
    const rec = (kind, r) => out.push({ L, k, kind, x: +s.squad.x.toFixed(2), vx: +s.squad.vx.toFixed(1), ...r });
    for (const e of s.ev) {
      if (e.t === 'slamWarn' && kinds.includes('slam') && s.boss && s.boss.slam) {
        const T = s.boss.slam.t + 0.15;
        const sl = { x0: s.boss.slam.x0, x1: s.boss.slam.x1 };
        rec('slam', probe(s, rho, T, (f) => { f.boss.slam = null; }, (ev) => ev.t === 'slam' && ev.hit && ev.x0 === sl.x0 && ev.x1 === sl.x1, quietBoss(true)));
      }
      if (e.t === 'summon' && kinds.includes('summon')) {
        const ids = s.foes.filter((f) => !foes0.has(f.id)).map((f) => f.id);
        if (ids.length) rec('summon', probe(s, rho, 4, (f) => { for (const x of f.foes) if (ids.includes(x.id)) x.alive = false; }, null, quietBoss(false)));
      }
    }
    if (kinds.includes('spit')) {
      const sp = s.spits.find((x) => !spits0.has(x.id));
      if (sp) {
        const watch = (ev) => ev.t === 'spitHit' && ev.hit && Math.abs(ev.x - sp.x) < 1e-9 && Math.abs(ev.z - sp.z) < 1e-9;
        rec('spit', probe(s, rho, C.SPIT_T + 0.1, (f) => { f.spits = f.spits.filter((x) => x.id !== sp.id); }, watch, null));
      }
    }
    if (kinds.includes('saw') && s.phase === 'run') {
      for (const w of s.saws) {
        const dz = w.z - s.squad.z;
        if (sawSeen.has(w.id) || dz > SAW_SEE || dz < 0) continue;
        sawSeen.add(w.id);
        const T = dz / Math.max(1, s.squad.vz) + 1;
        // 톱날: 어느 손으로든 톱날에 하나도 잃지 않을 수 있나(피할 수 없음). 억지 손해는 재기만 한다 — 약한 칸을 지키는 톱날(guard)은
        // 일부러 '톱날을 맞거나 센 벽으로' 고르게 하는 값이라 톱날이 없는 판보다 잃는 것이 당연하다
        rec('saw', probe(s, rho, T, (f) => { f.saws = f.saws.filter((x) => x.id !== w.id); }, (ev) => ev.t === 'loss' && ev.cause === 'saw', null, true));
      }
    }
  }
}
export function fairStats(recs) {
  const by = {};
  for (const r of recs) {
    const b = (by[r.kind] ||= { n: 0, undodge: 0, forced: 0, cost: 0 });
    b.n++;
    if (!r.dodge) b.undodge++;
    if (r.forced) b.forced++;
  }
  for (const b of Object.values(by)) b.forcedPct = pct(b.forced, b.n);
  return by;
}

if (isMainThread && process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const o = cliArgs(process.argv.slice(2), { levels: '5-60', seeds: 2, rho: 0.3, bot: 'sloppy0.1' });
  const runs = o.endless ? Array.from({ length: Math.max(1, +o.endless || 8) }, (_, i) => i) : null;
  const { res, sec } = runs
    ? await mapLevels(import.meta.url, 'fairProbeEndless', runs, { rho: +o.rho, bot: o.bot, unl: +(o.unl ?? 2), segs: +(o.segs ?? 9), flame: o.flame === true, relics: o.relics === 'all' ? R.RELIC_IDS.slice() : String(o.relics || '').split(',').filter((id) => R.RELICS[id]) }, o.workers)
    : await mapLevels(import.meta.url, 'fairProbe', o.levels, { seeds: +o.seeds, rho: +o.rho, bot: o.bot }, o.workers);
  const all = (runs || o.levels).flatMap((L) => res[L]);
  if (runs) console.log(`한 손 공정성 갈라 보기 — 무한모드 해금 ${o.unl ?? 2}단계${o.flame === true ? ' + 화염병' : ''}, SIM ${C.SIM}, ${o.bot}, 반응 ${o.rho}초, 판 ${runs.length}개 × ${o.segs ?? 9}구간까지 (${sec.toFixed(0)}초)`);
  else console.log(`한 손 공정성 갈라 보기 — SIM ${C.SIM}, ${o.bot}, 반응 ${o.rho}초, L${o.levels[0]}-${o.levels.at(-1)}, 시드 ${o.seeds} (${sec.toFixed(0)}초)`);
  for (const [k, b] of Object.entries(fairStats(all))) console.log(`  ${k.padEnd(7)} ${String(b.n).padStart(5)}번  피할 수 없음 ${b.undodge}  억지 손해(≥max(2, 5%n)) ${b.forced} (${b.forcedPct.toFixed(1)}%)`);
  for (const r of all.filter((x) => !x.dodge || x.forced).slice(0, 20)) console.log('   ', JSON.stringify(r));
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(all));
}
