/* H*와 여유(slack): node squad/tools/fbcal.mjs [--levels 5-60] [--seeds 3] [--cond expect|none] [--c 0.9|-] [--slack 0.05,0.1,0.2] [--scale] [--json out.json]
   (비평 실험 critic/fbcal.mjs를 옮김 — Last War Frontline Breakthrough식 보정)
   1) strong(출격 조건 + 영웅, 스킬 켬, 상자·특수병 씀)의 경기장 입장 상태에서 보스 체력을 이분 탐색(10번)해
      strong이 아직 이기는 가장 큰 체력 H*를 찾는다. 체력 = dps(도착 병력, 화력)·bossKill·f, f ∈ [0.3, 6].
      --c 0.9 면 닿기까지 0.9·bossKill초가 되게 보스 걸음을 바꾼다(기본 '-' = 게임 그대로).
   2) expert·sloppy0.1·sloppy0.3(스킬 켬)을 같은 조건으로 돌려 경기장 입장 상태에서 보스 체력 = H*·(1−slack)로 끝까지 돈다.
   --scale: 판 중 위협(적·벽·상자 체력, 게이트 올리기 step)을 k = (1+0.05·화력)·(EXPECT strong 도착/강화 없는 strong 도착)^0.8 배로
            키운다(P01 이전 코드에서 '위협도 기대 강화로 정한다'를 흉내 내던 비평 실험의 방식. P01이 들어간 뒤에는 끈다).
   찍는 것: 구간별 f(= H* ÷ 기준) 중앙값, slack마다 봇 승률 */
import { isMainThread } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import {
  C, cliArgs, loadExpect, loadoutFor, toArena, setBoss, play, makeBot, seedOf, mapLevels, bandOf, bandList, median, pct, fmt, tagOf,
} from './benchlib.mjs';

function scaleThreats(s, k) {
  for (const f of s.foes) f.hp = f.max = Math.max(1, Math.round(f.hp * k));
  for (const p of s.props) p.hp = p.max = Math.max(1, Math.round(p.hp * k));
  for (const r of s.rows) for (const c of r.cells) if (c.step) c.step *= k;
}
const BOTS = (n) => [['expert', n], ['sloppy0.1', n], ['sloppy0.3', n]];

/* 한 레벨(워커에서) */
export function levelFb(L, o) {
  const lv = C.prepareLevel(L);
  const co = loadoutFor(o.cond, L, o.expect);
  const c = o.c && o.c !== '-' ? +o.c : null;
  let k = 1;
  if (o.scale) {
    const s0 = toArena(lv, (s) => C.botInput(s), { start: C.START_N, fire: 0 });
    const sE = toArena(lv, (s) => C.botInput(s), { start: co.start, fire: co.fire });
    if (s0 && sE) k = (1 + 0.05 * co.fire) * Math.pow(sE.squad.n / s0.squad.n, 0.8);
  }
  const arrive = (pol) => { const s = C.newGame(lv, co); if (k !== 1) scaleThreats(s, k); return toArena(lv, pol, co, s); };
  const strong = makeBot('strong');
  const st = arrive(strong);
  if (!st) return { fail: true };
  const base = C.dps(st.squad.n, 0, co.fire) * lv.params.bossKill;
  const wins = (a, pol, hp) => play(lv, pol.clone(), co, { state: setBoss(structuredClone(a), { hp, c }) }).won;
  let lo = 0.3;
  let hi = 6;
  const capped = wins(st, strong, base * hi);
  if (capped) lo = hi;
  else for (let i = 0; i < 10; i++) { const mid = (lo + hi) / 2; if (wins(st, strong, base * mid)) lo = mid; else hi = mid; }
  const Hstar = Math.round(base * lo);
  const r = { k: +k.toFixed(3), Hstar, f: +lo.toFixed(3), capped, gameHp: st.boss.max, bots: {} };
  for (const [name, n] of BOTS(o.seeds)) {
    for (let i = 0; i < n; i++) {
      const pol = makeBot(name, seedOf(`fb:${name}`, L, i));
      const a = arrive(pol);
      (r.bots[name] ||= []).push(o.slack.map((sl) => (a ? wins(a, pol, Hstar * (1 - sl)) : 0)));
    }
  }
  return r;
}

if (isMainThread && process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const o = cliArgs(process.argv.slice(2), { levels: '5-60', seeds: 3, cond: 'expect', c: '-', slack: '0.05,0.1,0.2', scale: false });
  o.slack = String(o.slack).split(',').map(Number);
  const E = loadExpect(o.expect);
  const { res, sec, cpu } = await mapLevels(import.meta.url, 'levelFb', o.levels, { cond: o.cond, seeds: o.seeds, c: o.c, slack: o.slack, scale: !!o.scale, expect: E.table }, o.workers);
  console.log(`H*와 여유 — SIM ${C.SIM}, 조건 ${o.cond} (EXPECT: ${E.src}), 보스 걸음 ${o.c === '-' ? '게임 그대로' : `닿기까지 ${o.c}·bossKill초`}, 위협 키우기 ${o.scale ? '켬' : '끔'}, 봇 시드 ${o.seeds}`);
  const bad = Object.entries(res).filter(([, r]) => r.fail).map(([L]) => L);
  const cap = Object.entries(res).filter(([, r]) => r.capped).map(([L]) => L);
  console.log(`strong이 경기장에 못 간 레벨: ${bad.join(',') || '없음'} | H*가 탐색 상한(6배)에 걸린 레벨: ${cap.join(',') || '없음'}`);
  const groups = bandList(o.levels).map((b) => [b, (L) => bandOf(L) === b]);
  for (const t of [...new Set(o.levels.map((L) => tagOf(L)).filter(Boolean))]) groups.push([`#${t}`, (L) => tagOf(L) === t]);
  const ok = (L) => res[L] && !res[L].fail;
  console.log(`\nf = H*/(dps(strong 도착)·bossKill) 중앙값: ${groups.map(([g, sel]) => `${g} ${fmt(median(o.levels.filter((L) => sel(L) && ok(L)).map((L) => res[L].f)), 2)}`).join(' | ')}`);
  console.log(`H*/지금 게임 보스 체력 중앙값: ${groups.map(([g, sel]) => `${g} ${fmt(median(o.levels.filter((L) => sel(L) && ok(L)).map((L) => res[L].Hstar / res[L].gameHp)), 2)}`).join(' | ')}`);
  console.log(`\n승률 % (${groups.map(([g]) => g).join(' / ')})`);
  o.slack.forEach((sl, si) => {
    const cells = BOTS(o.seeds).map(([b]) => `${b} ${groups.map(([, sel]) => { let n = 0; let w = 0; for (const L of o.levels) if (sel(L) && ok(L)) for (const r of res[L].bots[b]) { n++; w += r[si]; } return n ? fmt(pct(w, n)) : '-'; }).join('/')}`);
    console.log(`slack ${String(sl).padEnd(5)} ${cells.join(' | ')}`);
  });
  console.log(`\n걸린 시간 ${sec.toFixed(1)}초(일감 합 ${cpu.toFixed(0)}초)`);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ sim: C.SIM, cond: o.cond, c: o.c, scale: !!o.scale, slack: o.slack, expectSrc: E.src, res }));
}
