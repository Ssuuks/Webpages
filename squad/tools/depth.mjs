/* 파고들기 지표(SIM 9): node squad/tools/depth.mjs [--levels 1-60] [--seeds 8] [--bots sloppy0.1,sloppy0.1-pump,expert,strong] [--conds expect,cap] [--json out.json] [--compare base.json]
   1) 판: 봇마다 레벨·조건(expect = 기대 강화, cap = 살 수 있는 최대 강화)에서 돌며 센다 —
      승, 도착 병력, 역전(빨간 덧셈 칸이 0을 넘음 — 'tick' 뒤 v0 < 0 < v인 칸, SIM 8 판에서도 같은 셈), 지나간 빨간 칸 중
      값이 cap0(높이기 전 끝)을 넘은 것·같은 줄 파란 덧셈 칸의 끝(cap)을 넘은 것, 특수병 레벨 업(spUp)·판 중 가장 높은 레벨.
   2) 몰아 쏘기: 높인 빨간 칸(cell.cap0)마다 앞 줄을 지난 뒤 그 칸 가운데에 서서 쏘고 스킬은 자동(heroWants) — 그 칸을 지날 때 값이
      cap0·파란 끝·새 끝(cap)을 넘었나. 다가오는 동안 실제로 어디까지 오르나를 본다(봇의 판단과 상관없이).
   옛 SIM(cap0·특수병 레벨이 없는 규칙)의 복사본에서 돌리면 같은 판 지표를 낸다 — --compare로 그 JSON과 견준다. 4코어에서 L1-60·시드 8이면 1분쯤 */
import { isMainThread } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { C, cliArgs, mapLevels, makeBot, seedOf, BOT_INFO, botKind, loadoutExpect, loadoutCap, maxTicksFor, bandOf, bandList, median, fmt } from './benchlib.mjs';

const loadout = (cond, L) => (cond === 'cap' ? loadoutCap(L) : loadoutExpect(C.calTable().expect, L) || C.expectLoadout(L));
const blueCap = (row) => { let b = -Infinity; for (const d of row.cells) if (d.op === 'add' && d.v0 > 0) b = Math.max(b, d.cap); return b; };

/* 한 판: 판 지표 */
function runOne(lv, name, k, co) {
  const pol = makeBot(name, seedOf(name, lv.L, k));
  const s = C.newGame(lv, co);
  const max = maxTicksFor(lv);
  const byId = new Map(s.rows.map((r) => [r.id, r]));
  const flipped = new Set();
  const r = { won: 0, arr: -1, flips: 0, red: 0, overCap0: 0, overBlue: 0, spUp: 0, lv: 0 };
  while ((s.phase === 'run' || s.phase === 'arena') && s.tick < max) {
    const ph = s.phase;
    C.step(s, pol(s));
    for (const e of s.ev) {
      if (e.t === 'tick') {
        const row = byId.get(e.row);
        if (row) for (const c of row.cells) if (c.op === 'add' && c.v0 < 0 && c.v > 0 && !flipped.has(c)) { flipped.add(c); r.flips++; }
      } else if (e.t === 'gate') {
        const row = byId.get(e.row);
        const c = row && row.cells.find((d) => d.op === e.op && e.x >= d.x0 - 1e-6 && e.x <= d.x1 + 1e-6);
        if (!c || c.op !== 'add' || !(c.v0 < 0)) continue;
        r.red++;
        if (c.cap0 != null && e.v > c.cap0) r.overCap0++;
        if (e.v > blueCap(row)) r.overBlue++;
      } else if (e.t === 'spUp') r.spUp++;
    }
    for (const m of s.squad.sp) r.lv = Math.max(r.lv, m.lv || 1);
    if (ph === 'run' && s.phase === 'arena') r.arr = s.squad.n;
  }
  r.won = s.phase === 'won' ? 1 : 0;
  return r;
}
/* 높인 빨간 칸 하나를 몰아 쏘기 */
function focusOne(lv, co, i, j) {
  const s = C.newGame(lv, co);
  const row = s.rows[i];
  const prev = i > 0 ? s.rows[i - 1] : null;
  const c = row.cells[j];
  const cx = (c.x0 + c.x1) / 2;
  const max = maxTicksFor(lv);
  while (s.phase === 'run' && s.tick < max) {
    const focus = !prev || s.squad.z > prev.z + 0.5;
    const inp = focus ? C.steer(s, cx) : C.botInput(s);
    if (focus) inp.skill = C.heroWants(s);
    C.step(s, inp);
    for (const e of s.ev) {
      if (e.t !== 'gate' || e.row !== row.id) continue;
      const on = e.x >= c.x0 - 1e-6 && e.x <= c.x1 + 1e-6;
      return { L: lv.L, i, ng: row.ng, v0: c.v0, cap0: c.cap0, cap: c.cap, blue: blueCap(row), v: on ? e.v : null };
    }
  }
  return null;
}

/* 한 레벨(워커에서) */
export function levelDepth(L, o) {
  const lv = C.prepareLevel(L);
  const out = { L, bare: !!lv.bare, runs: [], focus: [] };
  for (const cond of o.conds) {
    const co = loadout(cond, L);
    for (const name of o.bots) {
      const n = BOT_INFO[botKind(name)].seeded ? o.seeds : 1;
      for (let k = 0; k < n; k++) out.runs.push({ cond, b: name, k, ...runOne(lv, name, k, co) });
    }
    lv.rows.forEach((row, i) => row.cells.forEach((c, j) => {
      if (c.cap0 == null) return;
      const f = focusOne(lv, co, i, j);
      if (f) out.focus.push({ cond, ...f });
    }));
  }
  return out;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
function summarize(res) {
  const runs = Object.values(res).flatMap((r) => r.runs.map((x) => ({ ...x, L: r.L })));
  const sum = {};
  for (const x of runs) {
    for (const g of [bandOf(x.L), 'all']) {
      const key = `${x.cond}|${x.b}|${g}`;
      (sum[key] ||= []).push(x);
    }
  }
  const agg = {};
  for (const [key, rs] of Object.entries(sum)) {
    agg[key] = {
      n: rs.length, win: 100 * mean(rs.map((r) => r.won)), arr: mean(rs.filter((r) => r.arr > 0).map((r) => r.arr)),
      flips: mean(rs.map((r) => r.flips)), red: mean(rs.map((r) => r.red)), overCap0: mean(rs.map((r) => r.overCap0)), overBlue: mean(rs.map((r) => r.overBlue)),
      spUp: mean(rs.map((r) => r.spUp)), lv2: 100 * mean(rs.map((r) => (r.lv >= 2 ? 1 : 0))), lv3: 100 * mean(rs.map((r) => (r.lv >= 3 ? 1 : 0))),
    };
  }
  const focus = {};
  for (const f of Object.values(res).flatMap((r) => r.focus)) (focus[f.cond] ||= []).push(f);
  const reach = {};
  for (const [cond, fs] of Object.entries(focus)) {
    const ok = fs.filter((f) => f.v != null);
    reach[cond] = {
      cells: fs.length, passed: ok.length, overCap0: ok.filter((f) => f.v > f.cap0).length, overBlue: ok.filter((f) => f.v > f.blue).length, maxed: ok.filter((f) => f.v >= f.cap).length,
      share: median(ok.map((f) => (f.v - f.v0) / (f.cap - f.v0))),
    };
  }
  const bare = Object.values(res).filter((r) => r.bare).map((r) => r.L);
  return { agg, reach, bare };
}

if (isMainThread && process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const o = cliArgs(process.argv.slice(2), { levels: '1-60', seeds: 8, bots: 'sloppy0.1,sloppy0.1-pump,expert,strong', conds: 'expect,cap' });
  const opts = { seeds: o.seeds, bots: String(o.bots).split(','), conds: String(o.conds).split(',') };
  const { res, sec } = await mapLevels(import.meta.url, 'levelDepth', o.levels, opts, o.workers);
  const S = summarize(res);
  const base = o.compare ? JSON.parse(fs.readFileSync(o.compare, 'utf8')) : null;
  const L0 = o.levels[0]; const L1 = o.levels[o.levels.length - 1];
  console.log(`파고들기 지표 — SIM ${C.SIM}, L${L0}-${L1}, 시드 ${o.seeds}, 봇 ${opts.bots.join(',')}${base ? ` (괄호: ${o.compare} SIM ${base.sim}와의 차이)` : ''}`);
  console.log(`SIM 8처럼 둔 레벨(bare) ${S.bare.length}개${S.bare.length ? ': ' + S.bare.join(',') : ''}`);
  const d = (key, f, v, digits) => {
    const b = base && base.agg[key] ? base.agg[key][f] : null;
    return b == null || !Number.isFinite(b) ? fmt(v, digits) : `${fmt(v, digits)}(${v - b >= 0 ? '+' : ''}${fmt(v - b, digits)})`;
  };
  for (const cond of opts.conds) {
    console.log(`\n== ${cond === 'cap' ? '살 수 있는 최대 강화' : '기대 강화(EXPECT)'} ==`);
    console.log('봇 / 구간'.padEnd(26) + ['판', '승%', '도착', '역전/판', '빨강/판', '>cap0/판', '>파랑끝/판', '레벨업/판', 'Lv2%', 'Lv3%'].map((h) => h.padStart(14)).join(''));
    for (const b of opts.bots) for (const g of [...bandList(o.levels), 'all']) {
      const key = `${cond}|${b}|${g}`;
      const a = S.agg[key];
      if (!a) continue;
      console.log(`${b} ${g}`.padEnd(26) + [String(a.n), d(key, 'win', a.win, 1), d(key, 'arr', a.arr, 0), d(key, 'flips', a.flips, 2), fmt(a.red, 2), fmt(a.overCap0, 3), d(key, 'overBlue', a.overBlue, 3), fmt(a.spUp, 2), fmt(a.lv2, 1), fmt(a.lv3, 1)].map((x) => x.padStart(14)).join(''));
    }
    const r = S.reach[cond];
    if (r) console.log(`몰아 쏘기(앞 줄 뒤부터 그 칸 앞, 스킬 자동): 높인 빨간 칸 ${r.cells}개 중 지남 ${r.passed} — cap0 넘음 ${r.overCap0}, 같은 줄 파란 끝 넘음 ${r.overBlue}, 새 끝까지 ${r.maxed}, 오른 몫(새 끝까지) 중앙 ${fmt(r.share, 2)}`);
    else console.log('몰아 쏘기: 높인 빨간 칸 없음(SIM 8 규칙이거나 모두 bare)');
  }
  console.log(`\n${sec.toFixed(0)}초`);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ sim: C.SIM, levels: o.levels, seeds: o.seeds, ...S }, null, 1));
}
