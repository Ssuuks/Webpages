/* 레벨별 난이도 곡선·구성 감사: node squad/tools/curve.mjs [--levels 1-60] [--seeds 48] [--bots sloppy0.1,sloppy0.3,expert] [--json out.json] [--compare base.json]
   bench.mjs는 구간·태그로 묶어 목표 구간(TARGETS)과 견준다. 이 도구는 한 레벨씩 본다 — 묶음 평균이 맞아도 레벨 하나가 튀거나
   한 가지 청크가 판을 다 죽이면 사람은 '이 레벨만 이상하다'고 느끼기 때문이다. 기대 강화(EXPECT) 조건, 봇마다 레벨당 --seeds판.

   1) 곡선 표: 레벨마다 봇별 첫 시도 승률(±95% 구간). 그 레벨의 태그 목표 구간(benchlib TARGETS의 'win …' 항목)을 구간 전체가
      벗어났을 때만 ▼(낮음)·▲(높음)을 붙인다 — 표본 잡음으로는 안 붙게. 이긴 레벨의 도착 병력/기준(arr/ref), 경기장 전 패배 몫도 함께.
   2) 튀는 레벨: 같은 태그(onboard·normal·hard·super·rest)의 ±15레벨 이웃을 한데 묶은 승률과 견준 z 점수(|z| ≥ --z, 기본 2.6).
      보정이 태그 묶음 평균에만 맞춰져 있는 일반 레벨에서 구성이 만든 난이도 요철을 찾는다.
   3) 청크 종류별: 그 청크에 들어선 판 중 거기서 전멸한 몫(치사율)과 평균 출혈(게이트가 아닌 손실 ÷ 들어설 때 병력), 게이트 손실.
      치사율 0·출혈 거의 0이면 '긴장 없는 청크', 평균의 3배 넘으면 '판을 죽이는 청크'.
   4) 손실 원인 비중: 구간별로 병사를 어디서 잃나(게이트·졸개·거구·톱날·독침·웅덩이·벽·상자·보스).
   --compare base.json 이면 같은 레벨의 승률 변화를 두 비율 차 z로 견주어 의미 있는 변화(|z| ≥ 2)만 찍는다 — 보정·배치를 고친 뒤 확인용.
   4코어에서 L1-60·봇 3·시드 48이면 몇 분 */
import { isMainThread } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { C, cliArgs, mapLevels, makeBot, seedOf, loadoutExpect, maxTicksFor, tagClass, TARGETS, bandOf, bandList, median } from './benchlib.mjs';

const loadout = (L) => loadoutExpect(C.calTable().expect, L) || C.expectLoadout(L);
const CAUSES = ['gate', 'foe', 'brute', 'saw', 'spit', 'pool', 'wall', 'crate', 'summon', 'boss'];

/* 한 판: 승패, 전멸한 곳(청크 번호 또는 'A'=경기장), 청크마다 들어설 때 병력·출혈·게이트 손실, 원인별 손실 */
function runOne(lv, name, k, co) {
  const pol = makeBot(name, seedOf('curve-' + name, lv.L, k));
  const s = C.newGame(lv, co);
  const max = maxTicksFor(lv);
  const ch = lv.chunks;
  const chunkAt = (z) => { let i = 0; for (let j = 0; j < ch.length; j++) { if (z >= ch[j].z) i = j; else break; } return i; };
  const n0 = new Array(ch.length).fill(-1);
  const bleed = new Array(ch.length).fill(0);
  const gate = new Array(ch.length).fill(0);
  const byCause = {};
  let next = 0;
  let died = null;
  let arr = -1;
  while ((s.phase === 'run' || s.phase === 'arena') && s.tick < max) {
    const ph = s.phase;
    C.step(s, pol(s));
    const q = s.squad;
    while (next < ch.length && q.z >= ch[next].z) { n0[next] = q.n; next++; }
    for (const e of s.ev) {
      if (e.t !== 'loss') continue;
      byCause[e.cause] = (byCause[e.cause] || 0) + e.n;
      if (ph !== 'run') continue;
      const i = chunkAt(e.z ?? q.z);
      if (e.cause === 'gate') gate[i] += e.n; else bleed[i] += e.n;
    }
    if (ph === 'run' && s.phase === 'arena') arr = q.n;
    if (s.phase === 'lost' && died == null) died = ph === 'run' ? chunkAt(q.z) : 'A';
  }
  const won = s.phase === 'won';
  if (!won && died == null) died = s.phase === 'arena' ? 'A' : chunkAt(s.squad.z);   // 시간 초과 등
  return {
    won: won ? 1 : 0, arr, died: won ? null : died, byCause,
    bossLeft: !won && s.boss ? Math.max(0, s.boss.hp) / s.boss.max : null,
    chunks: ch.map((c, i) => (n0[i] > 0 ? { n0: n0[i], bleed: bleed[i] / n0[i], gate: gate[i] / n0[i] } : null)),
  };
}

/* 한 레벨(워커에서): 봇마다 시드 판을 돌려 합친다 */
export function curveLevel(L, o) {
  const lv = C.prepareLevel(L);
  const co = loadout(L);
  const out = { L, cls: tagClass(L), arrive: lv.arrive || lv.params.P, chunks: lv.chunks.map((c) => c.kind), bots: {} };
  for (const name of o.bots) {
    const a = { n: 0, wins: 0, arr: [], arena: 0, pre: 0, died: {}, causes: {}, bossLeft: [], chunk: lv.chunks.map((c) => ({ kind: c.kind, entries: 0, deaths: 0, bleed: 0, gate: 0 })) };
    for (let k = 0; k < o.seeds; k++) {
      const r = runOne(lv, name, k, co);
      a.n++; a.wins += r.won;
      if (r.arr >= 0) { a.arena++; a.arr.push(r.arr); }
      if (!r.won) {
        if (r.died !== 'A') a.pre++;   // 경기장 전 패배
        const key = String(r.died);
        a.died[key] = (a.died[key] || 0) + 1;
        if (r.bossLeft != null) a.bossLeft.push(r.bossLeft);
      }
      for (const [c, v] of Object.entries(r.byCause)) a.causes[c] = (a.causes[c] || 0) + v;
      r.chunks.forEach((c, i) => { if (!c) return; const g = a.chunk[i]; g.entries++; g.bleed += c.bleed; g.gate += c.gate; if (!r.won && r.died === i) g.deaths++; });
    }
    a.arrMed = median(a.arr);
    a.bossLeftMed = median(a.bossLeft);
    delete a.arr; delete a.bossLeft;
    out.bots[name] = a;
  }
  return out;
}

/* ---------- 통계 ---------- */
export function wilson(w, n, z = 1.96) {
  if (!n) return [NaN, NaN];
  const p = w / n; const d = 1 + (z * z) / n; const c = p + (z * z) / (2 * n);
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)];
}
export const zDiff = (w1, n1, w2, n2) => {
  if (!n1 || !n2) return 0;
  const p = (w1 + w2) / (n1 + n2); const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (w1 / n1 - w2 / n2) / se : 0;
};
/* 레벨 L·봇 b의 승률 목표 구간 [lo, hi]%(benchlib TARGETS의 'win …' 항목) — 없으면 null */
export function bandFor(L, bot) {
  const cls = tagClass(L);
  const t = TARGETS.find((x) => x.metric === 'win' && x.bot === bot && x.cond.includes('expect') && x.id.startsWith('win ') && x.sel(L, cls));
  return t ? [t.lo, t.hi] : null;
}
const pctS = (x, d = 0) => (Number.isFinite(x) ? (100 * x).toFixed(d) : '-');

/* 같은 태그 ±15레벨 이웃(자기 제외)을 묶은 승률과의 z. 이웃 표본이 모자라면 null */
export function neighborZ(res, L, bot, win = 15) {
  const me = res[L].bots[bot];
  let w = 0; let n = 0; let cnt = 0;
  for (const M of Object.keys(res).map(Number)) {
    if (M === L || res[M].cls !== res[L].cls || Math.abs(M - L) > win) continue;
    const b = res[M].bots[bot];
    w += b.wins; n += b.n; cnt++;
  }
  if (cnt < 3) return null;
  return { z: zDiff(me.wins, me.n, w, n), peer: w / n, cnt };
}

/* ---------- 요약 ---------- */
export function summarize(res, bots, zCut) {
  const levels = Object.keys(res).map(Number).sort((a, b) => a - b);
  const rows = [];
  for (const L of levels) {
    const r = res[L];
    const row = { L, cls: r.cls, bots: {} };
    for (const b of bots) {
      const a = r.bots[b];
      const [lo, hi] = wilson(a.wins, a.n);
      const band = bandFor(L, b);
      const flag = band ? (hi * 100 < band[0] ? '▼' : lo * 100 > band[1] ? '▲' : '') : '';
      const nz = neighborZ(res, L, b);
      row.bots[b] = { n: a.n, wins: a.wins, p: a.wins / a.n, lo, hi, band, flag, z: nz ? nz.z : null, peer: nz ? nz.peer : null, arr: a.arrMed / r.arrive, pre: (a.n - a.wins) ? a.pre / (a.n - a.wins) : NaN, bossLeft: a.bossLeftMed };
    }
    rows.push(row);
  }
  const outliers = [];
  for (const row of rows) for (const b of bots) { const x = row.bots[b]; if (x.z != null && Math.abs(x.z) >= zCut) outliers.push({ L: row.L, cls: row.cls, bot: b, p: x.p, peer: x.peer, z: x.z }); }
  // 청크 종류별(구간 × 봇)
  const kinds = {};
  for (const L of levels) for (const b of bots) {
    const g = bandOf(L);
    for (const c of res[L].bots[b].chunk) {
      for (const key of [`${b}|${g}|${c.kind}`, `${b}|all|${c.kind}`]) {
        const k = (kinds[key] ||= { entries: 0, deaths: 0, bleed: 0, gate: 0 });
        k.entries += c.entries; k.deaths += c.deaths; k.bleed += c.bleed; k.gate += c.gate;
      }
    }
  }
  // 손실 원인(구간 × 봇)
  const causes = {};
  for (const L of levels) for (const b of bots) {
    for (const key of [`${b}|${bandOf(L)}`, `${b}|all`]) {
      const c = (causes[key] ||= {});
      for (const [k, v] of Object.entries(res[L].bots[b].causes)) c[k] = (c[k] || 0) + v;
    }
  }
  return { rows, outliers, kinds, causes };
}

/* ---------- 출력 ---------- */
function printCurve(S, bots, base) {
  console.log('\n== 1) 레벨 곡선: 첫 시도 승률% (±95% 구간 폭) — ▼▲는 구간 전체가 태그 목표를 벗어남 ==');
  console.log('레벨 태그'.padEnd(12) + bots.map((b) => b.padEnd(24)).join('') + '  sloppy0.1 도착/기준  경기장전패%' + (base ? '  Δ(sloppy0.1,z)' : ''));
  const lead = bots.includes('sloppy0.1') ? 'sloppy0.1' : bots[0];
  for (const row of S.rows) {
    let line = `L${row.L}`.padEnd(5) + row.cls.padEnd(7);
    for (const b of bots) {
      const x = row.bots[b];
      const band = x.band ? `[${x.band[0]}-${x.band[1]}]` : '';
      line += `${pctS(x.p).padStart(3)}${x.flag || ' '} ±${pctS((x.hi - x.lo) / 2).padStart(2)} ${band}`.padEnd(24);
    }
    const x = row.bots[lead];
    line += `  ${Number.isFinite(x.arr) ? x.arr.toFixed(2) : '-'}`.padEnd(14) + `${Number.isFinite(x.pre) ? pctS(x.pre) : '-'}`.padStart(8);
    if (base && base.rows) {
      const o = base.rows.find((r) => r.L === row.L);
      const bo = o && o.bots[lead];
      if (bo) { const z = zDiff(x.wins, x.n, bo.wins, bo.n); line += `  ${(100 * (x.p - bo.p)).toFixed(0).padStart(4)}%p${Math.abs(z) >= 2 ? ` z${z.toFixed(1)}` : ''}`; }
    }
    console.log(line);
  }
  const flagged = S.rows.flatMap((r) => bots.filter((b) => r.bots[b].flag).map((b) => `L${r.L} ${b}${r.bots[b].flag}`));
  console.log(`\n목표 구간을 확실히 벗어난 (레벨, 봇): ${flagged.length}개${flagged.length ? ' — ' + flagged.join(', ') : ''}`);
}
function printOutliers(S, zCut, bots) {
  console.log(`\n== 2) 튀는 레벨: 같은 태그 ±15레벨 이웃 승률과 |z| ≥ ${zCut} (우연히 나올 몫은 레벨×봇 ${S.rows.length * bots.length}개 중 ${(S.rows.length * bots.length * 2 * (1 - 0.5 * (1 + erf(zCut / Math.SQRT2)))).toFixed(1)}개쯤) ==`);
  if (!S.outliers.length) { console.log('없음'); return; }
  for (const o of S.outliers) console.log(`L${o.L} ${o.cls.padEnd(7)} ${o.bot.padEnd(10)} ${pctS(o.p)}% (이웃 ${pctS(o.peer)}%)  z ${o.z.toFixed(1)}  ${o.z < 0 ? '↓ 더 어렵다' : '↑ 더 쉽다'}`);
}
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
function printKinds(S, bots, levels) {
  const lead = bots.includes('sloppy0.1') ? 'sloppy0.1' : bots[0];
  console.log(`\n== 3) 청크 종류별(${lead}): 치사율 = 들어선 판 중 그 청크에서 전멸 / 출혈 = 게이트 아닌 손실 ÷ 들어설 때 병력 / 게이트 = 게이트 손실 ÷ 들어설 때 병력 ==`);
  const groups = [...bandList(levels), 'all'];
  const kindsAll = [...new Set(Object.keys(S.kinds).filter((k) => k.startsWith(`${lead}|all|`)).map((k) => k.split('|')[2]))];
  console.log('청크'.padEnd(9) + groups.map((g) => g.padEnd(34)).join(''));
  for (const kind of kindsAll) {
    let line = kind.padEnd(9);
    for (const g of groups) {
      const k = S.kinds[`${lead}|${g}|${kind}`];
      line += (k && k.entries ? `n${String(k.entries).padStart(5)} 죽음${(100 * k.deaths / k.entries).toFixed(1).padStart(5)}% 출혈${pctS(k.bleed / k.entries).padStart(3)}% 게${pctS(k.gate / k.entries).padStart(3)}%` : '-').padEnd(34);
    }
    console.log(line);
  }
  // 이상 청크: 전체에서 치사율 평균의 3배 넘음 / 긴장 없음(출혈 1% 미만·죽음 0)
  const tot = kindsAll.map((kind) => ({ kind, ...S.kinds[`${lead}|all|${kind}`] })).filter((k) => k.entries >= 30 && k.kind !== 'rest');
  const meanH = tot.reduce((a, k) => a + k.deaths, 0) / Math.max(1, tot.reduce((a, k) => a + k.entries, 0));
  const hot = tot.filter((k) => meanH > 0 && k.deaths / k.entries > 3 * meanH).map((k) => `${k.kind} ${(100 * k.deaths / k.entries).toFixed(1)}%`);
  const flat = tot.filter((k) => k.deaths === 0 && k.bleed / k.entries < 0.01 && k.kind !== 'gate' && k.kind !== 'crate').map((k) => k.kind);
  console.log(`평균 치사율 ${(100 * meanH).toFixed(2)}% — 3배 넘는 청크: ${hot.join(', ') || '없음'} / 긴장 없는 청크(죽음 0·출혈 1% 미만): ${flat.join(', ') || '없음'}`);
}
function printCauses(S, bots, levels) {
  const lead = bots.includes('sloppy0.1') ? 'sloppy0.1' : bots[0];
  console.log(`\n== 4) 손실 원인 비중 %(${lead}) — 병사를 어디서 잃나 ==`);
  console.log('구간'.padEnd(10) + CAUSES.map((c) => c.padStart(7)).join(''));
  for (const g of [...bandList(levels), 'all']) {
    const c = S.causes[`${lead}|${g}`];
    if (!c) continue;
    const tot = Object.values(c).reduce((a, v) => a + v, 0) || 1;
    console.log(g.padEnd(10) + CAUSES.map((k) => pctS((c[k] || 0) / tot, 1).padStart(7)).join(''));
  }
}

if (isMainThread && process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url && (process.argv.includes('--help') || process.argv.includes('-h'))) {
  // 옵션을 모르는 채로 돌리면 레벨 60개 × 봇 3 × 48판 전체 측정이 시작되므로 도움말은 따로 처리한다
  console.log('node squad/tools/curve.mjs [--levels 1-60] [--seeds 48] [--bots sloppy0.1,sloppy0.3,expert] [--z 2.6] [--workers 4] [--json out.json] [--compare base.json]\n자세한 설명은 이 파일 맨 위 주석과 README \'레벨 하나씩 보기\'.');
} else if (isMainThread && process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const o = cliArgs(process.argv.slice(2), { levels: '1-60', seeds: 48, bots: 'sloppy0.1,sloppy0.3,expert', z: 2.6 });
  const bots = String(o.bots).split(',');
  const { res, sec } = await mapLevels(import.meta.url, 'curveLevel', o.levels, { seeds: o.seeds, bots }, o.workers);
  const S = summarize(res, bots, +o.z);
  const base = o.compare ? JSON.parse(fs.readFileSync(o.compare, 'utf8')) : null;
  console.log(`레벨별 곡선·구성 감사 — SIM ${C.SIM}, L${o.levels[0]}-${o.levels[o.levels.length - 1]}, 레벨·봇마다 ${o.seeds}판, 기대 강화${base ? `, 비교 ${o.compare}(SIM ${base.sim})` : ''}`);
  printCurve(S, bots, base);
  printOutliers(S, +o.z, bots);
  printKinds(S, bots, o.levels);
  printCauses(S, bots, o.levels);
  console.log(`\n${sec.toFixed(0)}초`);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ sim: C.SIM, levels: o.levels, seeds: o.seeds, bots, rows: S.rows, outliers: S.outliers, kinds: S.kinds, causes: S.causes, res }, null, 1));
}
