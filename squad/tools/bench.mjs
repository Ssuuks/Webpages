/* 난이도 측정: node squad/tools/bench.mjs [--levels 1-60] [--seeds 8] [--json out.json] [옵션]
   봇 묶음(tests/bots.mjs)을 레벨마다 돌려 구간·태그별 첫 시도 승률과 지표를 낸다. 게임 파일은 바꾸지 않는다.

   조건
   - none   강화·영웅 없음(시작 12명)
   - expect 캠페인(sloppy0.1, 스킬 켬, 지원 받음)의 레벨별 첫 시도 중앙 강화 + 그때 영웅(EXPECT)
   - cap    그 레벨까지 살 수 있는 최대 강화 + 영웅 상한(꼼수 봇만)
   캠페인: sloppy0.1·sloppy0.3(지원 받음), sloppy0.1-nosupport(지원 안 받음 — p90 시도 수용)

   옵션
   --levels 1-60 | 5,10,15     재는 레벨(캠페인은 늘 L1부터 가장 큰 레벨까지)
   --seeds N                  시드가 있는 봇의 판 수(레벨·조건마다, 기본 8). 꼼수 봇 random·worst는 N/2
   --campaign-seeds N         캠페인 수(기본 8, nosupport는 N/2)
   --conds none,expect,cap    조건 고르기
   --bots a,b,...             봇 고르기(기본: 전부). 이름은 tests/bots.mjs의 makeBot
   --workers N                워커 수(기본 CPU 수, 최대 4). 1이면 이 스레드에서
   --hero bori                expect·cap 조건의 영웅을 바꾼다(레벨은 EXPECT·상한 그대로 — 영웅 동등성 비교용)
   --expect file.json         캠페인 대신 이전 bench JSON의 EXPECT 표를 쓴다(캠페인은 건너뛴다)
   --no-campaign              캠페인을 건너뛴다(expect 조건에는 --expect가 필요)
   --expect-only              캠페인만 돌려 EXPECT 표를 찍는다(--json이면 저장)
   --compare base.json        승률 표에 base와의 차이(±%p)를 붙인다
   --brief                    승률 표·캠페인·목표 확인만
   --json out.json            결과 저장(구간 지표, 레벨별 승수, 캠페인 요약, EXPECT, 목표 확인)
   --per-level                레벨마다 승수/판 수 표도 찍는다
   --raw                      JSON에 판 기록과 캠페인 기록을 모두 넣는다 */
import fs from 'node:fs';
import os from 'node:os';
import {
  C, BANDS, bandOf, bandList, tagOf, hasTags, tagClass, makePool, summarize, summarizeCampaign, expectFromCampaigns, round,
  loadoutNone, loadoutExpect, loadoutCap, BOT_INFO, botKind, checkTargets, checkCampTargets, METRICS, fmt, supportFor, S, parseLevels, hasUpgCap,
} from './benchlib.mjs';

const T0 = performance.now();
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);
const LEVELS = parseLevels(arg('--levels', '1-60'));
const SEEDS = Math.max(1, +arg('--seeds', 8));
const CSEEDS = Math.max(1, +arg('--campaign-seeds', 8));
const WORKERS = Math.max(1, +arg('--workers', Math.min(4, os.availableParallelism ? os.availableParallelism() : os.cpus().length)));
const CONDS = arg('--conds', 'none,expect,cap').split(',');
const BRIEF = flag('--brief');
const JSON_OUT = arg('--json', '');
const EXPECT_FILE = arg('--expect', '');
const EXPECT_ONLY = flag('--expect-only');
const COMPARE = arg('--compare', '');
const RAW = flag('--raw');
const PER_LEVEL = flag('--per-level');
const HERO = arg('--hero', '');
const withHero = (co) => (co && HERO && co.hero ? { ...co, hero: { id: HERO, lv: co.hero.lv } } : co);
const MAXL = LEVELS[LEVELS.length - 1];

const MAIN = ['strong', 'expert', 'sloppy0.1', 'sloppy0.1-noskill', 'sloppy0.3', 'misjudge', 'naive'];
const EXPLOIT = ['idle', 'random', 'hold-4.4', 'hold-2.5', 'hold0', 'hold2.5', 'hold4.4', 'worst'];
const PICK = arg('--bots', '') ? arg('--bots', '').split(',') : null;
const want = (b) => !PICK || PICK.includes(b);
const seedsFor = (b) => {
  const info = BOT_INFO[botKind(b)];
  if (!info || !info.seeded) return 1;
  return EXPLOIT.includes(b) ? Math.max(2, Math.ceil(SEEDS / 2)) : SEEDS;
};
const botsFor = (cond) => {
  let list;
  if (cond === 'none') list = [...MAIN.filter((b) => b !== 'sloppy0.1-noskill'), ...EXPLOIT];   // 영웅이 없으면 스킬 켬·끔이 같다
  else if (cond === 'cap') list = [...EXPLOIT, 'naive'];
  else list = [...MAIN, ...EXPLOIT];
  return list.filter(want).map((name) => ({ name, seeds: seedsFor(name) }));
};
const CAMPAIGNS = {
  'sloppy0.1': { bot: 'sloppy0.1', support: true, seeds: CSEEDS },
  'sloppy0.3': { bot: 'sloppy0.3', support: true, seeds: CSEEDS },
  'sloppy0.1-nosupport': { bot: 'sloppy0.1', support: false, seeds: Math.max(2, Math.ceil(CSEEDS / 2)) },
};
const COND_DESC = {
  none: '강화·영웅 없음(시작 12명, 화력 0)',
  expect: 'EXPECT: sloppy0.1 캠페인의 레벨별 첫 시도 중앙 강화 + 그때 영웅(스킬 켬; -noskill 봇만 끔)',
  cap: '그 레벨까지 살 수 있는 최대 강화 + 영웅 상한(뭉치), 꼼수 봇만',
};

const pool = makePool(WORKERS);
const log = (...a) => console.log(...a);
const progress = { done: 0, total: 0 };
const tick = () => { progress.done++; if (process.stderr.isTTY) process.stderr.write(`\r  ${progress.done}/${progress.total} 일감`); };

/* ---------- 1. 캠페인 ---------- */
let EXPECT = null;
let expectSrc = '';
const campOut = {};
const campPromises = [];
const needCamp = EXPECT_ONLY || (!EXPECT_FILE && !flag('--no-campaign'));
if (EXPECT_FILE) {
  const j = JSON.parse(fs.readFileSync(EXPECT_FILE, 'utf8'));
  EXPECT = j.expect || j;
  expectSrc = `파일 ${EXPECT_FILE}`;
}
if (needCamp) {
  for (const [name, c] of Object.entries(CAMPAIGNS)) {
    if (EXPECT_ONLY && name !== 'sloppy0.1') continue;
    campOut[name] = [];
    for (let i = 0; i < c.seeds; i++) {
      progress.total++;
      campPromises.push(pool.run({ kind: 'campaign', bot: c.bot, seed: i + 1, maxL: MAXL, support: c.support }).then((recs) => { campOut[name][i] = recs; tick(); return { name, recs }; }));
    }
  }
}
const sl1Done = needCamp
  ? Promise.all(campPromises).then(() => { EXPECT = expectFromCampaigns(campOut['sloppy0.1']); expectSrc = `sloppy0.1 캠페인 ${CAMPAIGNS['sloppy0.1'].seeds}개(L1-${MAXL}) 중앙값`; })
  : Promise.resolve();

/* ---------- 2. 레벨 일감 ---------- */
const runs = [];
const levelPromises = [];
const submit = (cond, co, L) => {
  const bots = botsFor(cond);
  if (!bots.length || !co) return;
  progress.total++;
  levelPromises.push(pool.run({ kind: 'level', L, cond, co, bots }).then((out) => { runs.push(...out); tick(); }));
};
const desc = [...LEVELS].sort((a, b) => b - a);   // 긴 레벨부터(일감 나누기)
if (!EXPECT_ONLY) {
  if (CONDS.includes('none')) for (const L of desc) submit('none', loadoutNone(), L);
  if (CONDS.includes('cap')) for (const L of desc) submit('cap', withHero(loadoutCap(L)), L);
}
await sl1Done;
if (!EXPECT_ONLY && CONDS.includes('expect')) {
  if (!EXPECT) throw new Error('EXPECT 표가 없다(--expect 파일을 주거나 캠페인을 돌린다)');
  for (const L of desc) submit('expect', withHero(loadoutExpect(EXPECT, L)), L);
}
await Promise.all([...levelPromises, ...campPromises]);
pool.close();
if (process.stderr.isTTY) process.stderr.write('\n');
const wall = (performance.now() - T0) / 1000;

/* ---------- 3. 묶기 ---------- */
// 워커 수와 상관없이 같은 결과가 나오게 순서를 고정한다
const condIdx = (c) => CONDS.indexOf(c);
runs.sort((x, y) => condIdx(x.cond) - condIdx(y.cond) || x.L - y.L || (x.b < y.b ? -1 : x.b > y.b ? 1 : 0) || x.k - y.k);
const TAGS = hasTags();
const tagName = {};
for (const L of LEVELS) tagName[L] = tagOf(L);
const groupsOf = (L) => {
  const g = [bandOf(L), 'all'];
  if (TAGS) { const t = `tag:${tagName[L] || 'none'}`; g.push(t, `${t}|${bandOf(L)}`); }
  return g;
};
const COLS = [...bandList(LEVELS), 'all'];
const tagCols = TAGS ? [...new Set(LEVELS.map((L) => `tag:${tagName[L] || 'none'}`))] : [];
const agg = {};    // cond → bot → group → runs
for (const r of runs) {
  const a = ((agg[r.cond] ||= {})[r.b] ||= {});
  for (const g of groupsOf(r.L)) (a[g] ||= []).push(r);
}
const stats = {};  // cond → bot → group → metrics
for (const [cond, bots] of Object.entries(agg)) for (const [b, groups] of Object.entries(bots)) for (const [g, list] of Object.entries(groups)) ((stats[cond] ||= {})[b] ||= {})[g] = summarize(list);
const perLevel = {};
for (const r of runs) { const o = (((perLevel[r.cond] ||= {})[r.b] ||= {})[r.L] ||= [0, 0]); o[0] += r.won; o[1]++; }

const base = COMPARE ? JSON.parse(fs.readFileSync(COMPARE, 'utf8')) : null;

/* ---------- 4. 찍기 ---------- */
const pad = (s, n) => String(s).padStart(n);
const lpad = (s, n) => String(s).padEnd(n);
function table(title, rows, cols, cell, w = 7, lw = 20) {
  log(`\n${title}`);
  log(lpad('', lw) + cols.map((c) => pad(c.replace(/^tag:/, '#'), w)).join(''));
  for (const r of rows) log(lpad(r, lw) + cols.map((c) => pad(cell(r, c), w)).join(''));
}
log(`숫자부대 돌격 bench — SIM ${C.SIM}, ${C.VERSION}, L${LEVELS[0]}-${MAXL} (${LEVELS.length}개 레벨), 시드 ${SEEDS}, 캠페인 ${needCamp ? CSEEDS : 0}, 워커 ${WORKERS}${TAGS ? ', 태그 있음' : ', 태그 없음(levelTag 없음)'}${HERO ? `, 영웅 ${HERO}` : ''}${hasUpgCap() ? `, 강화 상한 EXPECT+1` : ", 강화 상한 없음(cap = 10단계)"}`);

if (TAGS) {
  const byTag = {};
  for (const L of LEVELS) (byTag[tagName[L] || '(없음)'] ||= []).push(L);
  log('태그 → 목표 갈래: ' + Object.entries(byTag).map(([t, Ls]) => `#${t}→${tagClass(Ls[0], t === '(없음)' ? '' : t)}${Ls.some((L) => L <= 4) && t === '(없음)' ? '(L1-4는 onboard)' : ''} [${Ls.length}개: ${Ls.slice(0, 8).join(',')}${Ls.length > 8 ? '…' : ''}]`).join('  '));
}

// 캠페인
const campSum = {};
for (const [name, list] of Object.entries(campOut)) {
  const recs = list.flat();
  const byBand = {};
  for (const r of recs) (byBand[bandOf(r.L)] ||= []).push(r);
  const cs = { bot: CAMPAIGNS[name].bot, support: CAMPAIGNS[name].support, seeds: list.length, bands: {}, all: round(summarizeCampaign(recs)), stuck: list.map((c) => (c.length && c[c.length - 1].stuck ? c[c.length - 1].L : null)).filter(Boolean) };
  for (const [b, rs] of Object.entries(byBand)) cs.bands[b] = round(summarizeCampaign(rs));
  if (TAGS) { cs.tags = {}; const byTag = {}; for (const r of recs) (byTag[tagOf(r.L) || 'none'] ||= []).push(r); for (const [t, rs] of Object.entries(byTag)) cs.tags[t] = round(summarizeCampaign(rs)); }
  const lossByL = {};
  for (const r of recs) if (!r.firstWin) lossByL[r.L] = (lossByL[r.L] || 0) + 1;
  cs.firstLossLevels = lossByL;
  campSum[name] = cs;
}
if (Object.keys(campSum).length) {
  log('\n== 캠페인(코인 → 가장 싼 강화·영웅 레벨, 지면 다시, 3연패면 지원) ==');
  log('묶음      첫승%  시도평균 p90  지원%  통과%  지원승%  3★첫% ≥2★첫%  강화 s/f/c  영웅Lv  멈춤');
  for (const [name, cs] of Object.entries(campSum)) {
    log(`[${name}] ${cs.seeds}개${cs.support ? '' : ' (지원 안 받음)'}${cs.stuck.length ? `  멈춘 레벨: ${cs.stuck.join(',')}` : ''}`);
    const rows = [...Object.entries(cs.bands), ['all', cs.all], ...(cs.tags ? Object.entries(cs.tags).map(([t, v]) => [`#${t}`, v]) : [])];
    for (const [b, v] of rows) {
      log(`  ${lpad(b, 8)}${pad(fmt(v.firstWin), 5)} ${pad(fmt(v.attempts, 2), 8)} ${pad(fmt(v.p90), 3)} ${pad(fmt(v.support), 6)} ${pad(fmt(v.pass), 6)} ${pad(v.supTries ? fmt(v.supWin) : '-', 7)} ${pad(fmt(v.s3First), 6)} ${pad(fmt(v.s2First), 6)}  ${pad(`${fmt(v.start)}/${fmt(v.fire)}/${fmt(v.coin)}`, 10)} ${pad(fmt(v.heroLv), 6)} ${pad(v.stuck, 5)}`);
    }
    const ll = Object.entries(cs.firstLossLevels);
    if (ll.length) log(`  첫 시도에 진 레벨(횟수): ${ll.map(([L, n]) => `L${L}×${n}`).join(' ')}`);
  }
}
if (EXPECT) {
  log(`\nEXPECT(L) — ${expectSrc}: 강화 단계 시작/화력/보급, 영웅 Lv`);
  const pts = Object.keys(EXPECT).map(Number).filter((L) => L === 1 || L % 5 === 0);
  log('  ' + pts.map((L) => { const e = EXPECT[L]; return `L${L} ${e.start}/${e.fire}/${e.coin} ${e.hero ? e.hero[0] + e.heroLv : '-'}`; }).join(' | '));
}
if (EXPECT_ONLY) {
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ meta: { sim: C.SIM, when: new Date().toISOString(), maxL: MAXL, campaignSeeds: CSEEDS, runtimeSec: +wall.toFixed(1) }, expect: EXPECT, campaigns: campSum }, null, 1));
  log(`\n걸린 시간 ${wall.toFixed(1)}초`);
  process.exit(0);
}

// 조건별 표
const order = (cond) => botsFor(cond).map((b) => b.name);
const cmp = (cond, b, g, v, key = 'win') => {
  if (!base || !base.conds || !base.conds[cond] || !base.conds[cond].bots[b] || !base.conds[cond].bots[b].groups[g]) return '';
  const o = base.conds[cond].bots[b].groups[g][key];
  if (o == null || !Number.isFinite(v)) return '';
  const d = Math.round(v - o);
  return d === 0 ? '' : d > 0 ? `+${d}` : `${d}`;
};
const DETAIL = ['arrRef', 'contact', 'contactWin', 'contactT', 'slamHit', 'lossPre', 'atPeak', 'dd', 's3', 's2', 'bossLeft', 'len', 'bossT', 'crates', 'red'];
const DEC = { arrRef: 2, dd: 2, bossLeft: 2, contactT: 1, len: 0, bossT: 1, crates: 1, red: 1 };
for (const cond of CONDS) {
  if (!stats[cond]) continue;
  log(`\n== 조건 ${cond}: ${COND_DESC[cond]} ==`);
  const bots = order(cond).filter((b) => stats[cond][b]);
  const cols = [...COLS, ...tagCols];
  const w = base ? 9 : 7;
  table(`첫 시도 승률 %${base ? ' (괄호: 기준 대비 %p)' : ''}  [판 수: 시드 봇 ${SEEDS}·꼼수 ${Math.max(2, Math.ceil(SEEDS / 2))}/레벨, 나머지 1/레벨]`, bots, cols, (b, g) => {
    const m = stats[cond][b][g];
    if (!m) return '-';
    const c = cmp(cond, b, g, m.win);
    return fmt(m.win) + (c ? `(${c})` : '');
  }, w);
  if (PER_LEVEL) {
    log(`\n레벨별 승수/판 수 (${cond})`);
    log(lpad('L', 10) + bots.map((b) => pad(b.replace('sloppy', 'sl').replace('-noskill', '-ns'), 9)).join(''));
    for (const L of LEVELS) log(lpad(`L${L}${tagName[L] ? ' #' + tagName[L] : ''}`, 10) + bots.map((b) => { const o = perLevel[cond][b] && perLevel[cond][b][L]; return pad(o ? `${o[0]}/${o[1]}` : '-', 9); }).join(''));
  }
  if (BRIEF) continue;
  const mainBots = bots.filter((b) => MAIN.includes(b));
  if (!mainBots.length) continue;
  for (const k of DETAIL) table(`${METRICS[k]}`, mainBots, cols, (b, g) => { const m = stats[cond][b][g]; return m ? fmt(m[k], DEC[k] ?? 0) : '-'; });
}

// 목표 확인
const targets = checkTargets(runs, LEVELS);
const campTargets = checkCampTargets(campOut);
if (targets.length || campTargets.length) {
  log('\n== 계획의 목표 구간 확인(plan.difficulty_targets 해석, benchlib TARGETS) ==');
  const bad = [...targets, ...campTargets].filter((t) => t.status !== 'ok');
  for (const t of [...targets, ...campTargets]) {
    const dec = ['arrRef', 'dd', 'bossLeft'].includes(t.metric) ? 2 : 0;
    log(`  ${lpad(t.status, 4)} ${lpad(t.id, 46)} ${lpad(t.cond || 'camp', 6)} ${pad(fmt(t.value, dec), 6)}  [${t.lo}, ${t.hi}]  n=${t.n}`);
  }
  log(`  → ${targets.length + campTargets.length}개 중 구간 밖 ${bad.length}개`);
}

const cpu = pool.busy / 1000;
log(`\n판 ${runs.length}개 + 캠페인 ${Object.values(campOut).reduce((a, l) => a + l.length, 0)}개, 걸린 시간 ${wall.toFixed(1)}초(일감 합 ${cpu.toFixed(0)}초, 워커 ${WORKERS})`);

/* ---------- 5. 저장 ---------- */
if (JSON_OUT) {
  const conds = {};
  for (const [cond, bots] of Object.entries(stats)) {
    conds[cond] = { desc: COND_DESC[cond], bots: {} };
    for (const [b, groups] of Object.entries(bots)) {
      const g = {};
      for (const [k, v] of Object.entries(groups)) g[k] = round(v);
      conds[cond].bots[b] = { groups: g, perLevel: perLevel[cond][b] };
    }
  }
  const loadouts = {};
  for (const L of LEVELS) loadouts[L] = { expect: EXPECT ? withHero(loadoutExpect(EXPECT, L)) : null, cap: withHero(loadoutCap(L)), support: supportFor(C.prepareLevel(L)), tag: tagName[L] || '' };
  const out = {
    meta: {
      sim: C.SIM, version: C.VERSION, when: new Date().toISOString(), node: process.version, levels: [LEVELS[0], MAXL], nLevels: LEVELS.length,
      seeds: SEEDS, campaignSeeds: needCamp ? CSEEDS : 0, workers: WORKERS, runtimeSec: +wall.toFixed(1), cpuSec: +cpu.toFixed(1), runs: runs.length,
      msPerRun: +(1000 * cpu / Math.max(1, runs.length)).toFixed(1), expectSrc, hero: HERO || null, tags: TAGS, upgCap: hasUpgCap(), bands: BANDS,
      metrics: METRICS,
    },
    expect: EXPECT,
    loadouts,
    campaigns: campSum,
    conds,
    targets: targets.map((t) => round(t)),
    campTargets: campTargets.map((t) => round(t)),
  };
  if (RAW) { out.runs = runs; out.campaignRecords = campOut; }
  // 들여 쓰되 숫자 배열([승, 판] 따위)은 한 줄로 — 기준선 비교(diff)가 읽기 쉽게
  const text = JSON.stringify(out, null, 1).replace(/\[\s+([^\[\]{}]*?)\s+\]/g, (m, inner) => `[${inner.replace(/\s+/g, ' ')}]`);
  fs.writeFileSync(JSON_OUT, text + '\n');
  log(`→ ${JSON_OUT}`);
}
