/* 진행 저장 — 키는 'squad.v1' 그대로, v2는 필드를 더하기만 한다(옛 탭이 저장해도 새 필드가 남는다).
   localStorage가 막혀 있으면(사생활 보호 모드 등) 메모리로 계속 돈다. */
import { HERO_IDS, HERO_MAX_LV, HERO_LV_HARD, heroesEarned, heroCap, PETS, PET_MAX_LV, AMMO, RELICS, RELIC_IDS } from './roster.js';

const KEY = 'squad.v1';
const BAK = 'squad.bak';
const CORRUPT = 'squad.corrupt';
export const SAVE_V = 2;

export function defaults() {
  return {
    v: SAVE_V,
    maxL: 1,          // 열린 가장 높은 레벨
    cur: 1,           // 다음에 할 레벨
    stars: {},        // 레벨 → 별(0~3)
    best: {},         // 레벨 → 최고 남은 병력
    coins: 0,
    upg: { start: 0, fire: 0, coin: 0 },
    set: { sound: true, music: true, vibe: true, shake: true, low: false, preview: false, autoSkill: false, hitbox: false },
    tips: {},         // 한 번 본 안내
    fails: {},        // 레벨 → 연속 실패 수
    plays: 0,
    heroes: { sel: '', lv: {} },     // 합류한 영웅 → 레벨
    seenHeroes: [],                  // 합류 안내를 본 영웅
    codex: { foe: [], unit: [], hero: [], biome: [] },
    stats: { wins: 0, kills: 0, bossKills: 0, maxN: 0, spGot: 0, heroUses: 0, resumes: 0, spUp: 0, flips: 0 },   // spUp·flips: SIM 9(특수병 레벨 업·빨간 게이트 역전)
    lastRunId: '',
    backupAt: 0,
    nagged: 0,
    updated: 0,
    /* 엔드게임(ENDGAME.md) — 모두 필드 추가다. 1회차의 진행은 위 maxL·cur·stars·best·fails 그대로(옛 탭이 읽고 써도 깨지지 않는다) */
    cycle: 1,                        // 지금 하는 회차(1부터)
    endSeen: 0,                      // 엔딩 화면을 본 가장 높은 회차
    cyc: {},                         // 2회차부터의 진행: { '2': { maxL, cur, stars, best, fails } }
    upgX: { start: 0, fire: 0, coin: 0 },   // 10단계 위로 산 강화(upg는 옛 탭이 0~10으로 자르므로 따로 둔다)
    heroX: {},                       // 영웅마다 Lv5 위로 올린 레벨(heroes.lv는 옛 탭이 5로 자른다)
    endless: { best: 0, bestN: 0, runs: 0, unl: 0, kings: 0, rel: 0 },   // 무한모드 최고 기록(잡은 보스 수·최대 병력)과 판 수, 알린 해금 단계, 대왕 누적 처치, 출발 카드가 알린 유물 수
    pets: { own: {}, sel: '', eggs: 0, pity: 0, got: 0 },   // 펫: 가진 펫 → { lv, sh(조각) }, 고른 펫, 알 개수, 천장 세기, 받은 첫 알
    ammo: { sel: '', seen: 0 },      // 탄종(ARSENAL.md 3절): 고른 탄종('' = 보통탄), 열림 안내를 본 별 문턱. 열림은 저장하지 않고 모은 별로 센다
  };
}
/* 회차 하나는 L1~CYCLE_LEVELS. 그 회차의 L60을 깨면(maxL > 60) 끝난 회차다 */
export const CYCLE_LEVELS = 60;
const newProg = () => ({ maxL: 1, cur: 1, stars: {}, best: {}, fails: {} });
/* 회차 c의 진행 { maxL, cur, stars, best, fails } — 1회차는 저장 그 자체(옛 필드), 2회차부터는 data.cyc[c](없으면 만든다) */
export function prog(d, c = d.cycle) {
  const k = Math.max(1, c | 0);
  if (k <= 1) return d;
  if (!d.cyc[k]) d.cyc[k] = newProg();
  return d.cyc[k];
}
/* 끝낸(엔딩을 본 것으로 치는) 가장 높은 회차. 예전에 L60을 넘긴 저장(maxL > 60)은 1회차를 끝낸 것 */
export function endedCycles(d) {
  let c = 0;
  while ((c === 0 ? d.maxL : d.cyc && d.cyc[c + 1] ? d.cyc[c + 1].maxL : 0) > CYCLE_LEVELS) c++;
  return c;
}
/* 열린 가장 높은 회차 */
export const maxCycle = (d) => endedCycles(d) + 1;
/* 무한모드 빌드의 해금(단계 해금 기획서 1절). 여는 조건은 모두 이미 저장하는 것(엔딩·무한모드 기록·회차)이라 새 진행 화폐는 없다.
   선형 단계 unl(만든 단계 stageMax = core.CARD.stageMax까지):
     1: 1회차 엔딩(무한모드와 함께) → 보스 뒤 3택 1
     2: + 무한모드 3구간에 처음 닿기(잡은 보스 best ≥ 2) → 탄 효과·탄종 상자·시너지(·장애물)
     3: + 첫 대왕(best ≥ 6) → 유물(넷)
   따로 가는 줄: flame = 2회차 엔딩(4단계 화염병 — 캠페인만 하는 사람에게도 무한모드를 다시 열 이유),
   relics = unl 3이면 RELICS의 kings 0인 넷 + 대왕 누적(kings) 2·3·4·5번에 하나씩(5단계). kings는 1단계를 넣은 뒤부터 셌으므로
   첫 대왕을 잡은 기록(best ≥ 6)이 있으면 적어도 1로 친다.
   next: 다음에 열 것과 그 조건(화면의 '다음: 3구간에 닿기' 한 줄) — { unl, best }(무한모드에서 잡은 보스 수) | { relic, kings }(대왕 누적) | null */
export function endlessUnlocks(d, stageMax = 1) {
  const ended = endedCycles(d);
  const best = d.endless ? Math.max(0, d.endless.best | 0) : 0;
  const kings = Math.max(d.endless ? Math.max(0, d.endless.kings | 0) : 0, best >= 6 ? 1 : 0);
  const ladder = ended < 1 ? 0 : best >= 6 ? 3 : best >= 2 ? 2 : 1;
  const unl = Math.max(0, Math.min(stageMax, ladder));
  const relics = unl >= 3 ? RELIC_IDS.filter((id) => kings >= RELICS[id].kings) : [];
  let next = null;
  if (unl >= 1 && unl < Math.min(3, stageMax)) next = unl === 1 ? { unl: 2, best: 2 } : { unl: 3, best: 6 };
  else if (unl >= 3) { const id = RELIC_IDS.find((r) => !relics.includes(r)); if (id) next = { relic: id, kings: RELICS[id].kings }; }
  return { unl, flame: ended >= 2, relics, next };
}
/* 선형 해금 단계만(예전 이름 — endlessUnlocks를 부른다) */
export function endlessStage(d, stageMax = 1) {
  return endlessUnlocks(d, stageMax).unl;
}
/* 강화 단계(10단계 위 포함)와 영웅 레벨(Lv5 위 포함) */
export const upgLv = (d, id) => (d.upg[id] | 0) + (d.upgX ? d.upgX[id] | 0 : 0);
export function addUpg(d, id) { if ((d.upg[id] | 0) < 10) d.upg[id] = (d.upg[id] | 0) + 1; else d.upgX[id] = (d.upgX[id] | 0) + 1; }
export const heroLvOf = (d, id) => { const l = d.heroes.lv[id] | 0; return l + (l >= HERO_MAX_LV && d.heroX ? d.heroX[id] | 0 : 0); };
export function addHeroLv(d, id) { if ((d.heroes.lv[id] | 0) < HERO_MAX_LV) d.heroes.lv[id] = (d.heroes.lv[id] | 0) + 1; else d.heroX[id] = (d.heroX[id] | 0) + 1; }

let memory = null;
let mode = 'ok';       // ok | memory | full
export const storageMode = () => mode;

/* 저장소를 실제로 쓸 수 있는지 한 번 확인한다 */
export function probe() {
  try {
    localStorage.setItem('squad.probe', '1');
    localStorage.removeItem('squad.probe');
    mode = 'ok';
  } catch (e) {
    mode = e && (e.name === 'QuotaExceededError' || e.code === 22) ? 'full' : 'memory';
  }
  return mode;
}

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.floor(num(v, a))));

/* 값 범위를 고치고, 지난 진행으로 얻었어야 할 영웅을 채운다 */
export function normalize(o) {
  const d = defaults();
  const out = {
    ...d, ...o,
    upg: { ...d.upg, ...(o.upg || {}) },
    set: { ...d.set, ...(o.set || {}) },
    stars: { ...(o.stars || {}) },
    best: { ...(o.best || {}) },
    tips: { ...(o.tips || {}) },
    fails: { ...(o.fails || {}) },
    heroes: { sel: (o.heroes && o.heroes.sel) || '', lv: { ...((o.heroes && o.heroes.lv) || {}) } },
    codex: { ...d.codex, ...(o.codex || {}) },
    stats: { ...d.stats, ...(o.stats || {}) },
    seenHeroes: Array.isArray(o.seenHeroes) ? o.seenHeroes.slice() : [],
    cyc: {},
    upgX: { ...d.upgX, ...(o.upgX && typeof o.upgX === 'object' ? o.upgX : {}) },
    heroX: { ...(o.heroX && typeof o.heroX === 'object' ? o.heroX : {}) },
    endless: { ...d.endless, ...(o.endless && typeof o.endless === 'object' ? o.endless : {}) },
  };
  if (num(o.v, 1) > SAVE_V) out.v = num(o.v);   // 더 새 버전의 저장은 버전을 낮추지 않는다
  else out.v = SAVE_V;
  out.coins = Math.max(0, Math.floor(num(out.coins)));
  out.maxL = clampInt(out.maxL, 1, 100000);
  out.cur = clampInt(out.cur, 1, out.maxL);
  out.plays = Math.max(0, Math.floor(num(out.plays)));
  for (const k of Object.keys(out.stars)) out.stars[k] = clampInt(out.stars[k], 0, 3);
  for (const k of Object.keys(out.upg)) out.upg[k] = clampInt(out.upg[k], 0, 10);
  for (const k of Object.keys(out.codex)) if (!Array.isArray(out.codex[k])) out.codex[k] = [];
  // 영웅: 모르는 id는 버리고, 레벨은 1..상한, 진행으로 얻은 영웅은 채운다
  const cap = heroCap(out.maxL);
  for (const id of Object.keys(out.heroes.lv)) {
    if (!HERO_IDS.includes(id)) delete out.heroes.lv[id];
    else out.heroes.lv[id] = clampInt(out.heroes.lv[id], 1, Math.min(HERO_MAX_LV, Math.max(cap, out.heroes.lv[id] | 0)));
  }
  for (const id of heroesEarned(out.maxL, totalStars(out))) if (!out.heroes.lv[id]) out.heroes.lv[id] = 1;
  if (!out.heroes.lv[out.heroes.sel]) out.heroes.sel = Object.keys(out.heroes.lv)[0] || '';
  // 엔드게임 필드: 10단계 위 강화는 10단계를 채운 강화에만, Lv5 위 영웅 레벨은 Lv5인 영웅에만(산 것은 깎지 않는다)
  for (const k of Object.keys(out.upgX)) out.upgX[k] = out.upg[k] >= 10 ? clampInt(out.upgX[k], 0, 10000) : 0;
  for (const id of Object.keys(out.heroX)) {
    if (!HERO_IDS.includes(id) || (out.heroes.lv[id] | 0) < HERO_MAX_LV) delete out.heroX[id];
    else out.heroX[id] = clampInt(out.heroX[id], 0, HERO_LV_HARD - HERO_MAX_LV);
  }
  // 회차 진행: 앞 회차를 끝낸 데까지만 읽는다
  const src = o.cyc && typeof o.cyc === 'object' ? o.cyc : {};
  for (let c = 2; src[c] && typeof src[c] === 'object' && endedCycles(out) >= c - 1; c++) {
    const p = src[c];
    const q = { maxL: clampInt(p.maxL, 1, CYCLE_LEVELS + 1), cur: 1, stars: { ...(p.stars || {}) }, best: { ...(p.best || {}) }, fails: { ...(p.fails || {}) } };
    q.cur = clampInt(p.cur, 1, Math.min(CYCLE_LEVELS, q.maxL));
    for (const k of Object.keys(q.stars)) q.stars[k] = clampInt(q.stars[k], 0, 3);
    out.cyc[c] = q;
  }
  out.cycle = clampInt(out.cycle, 1, maxCycle(out));
  out.endSeen = clampInt(out.endSeen, 0, endedCycles(out));
  for (const k of ['best', 'bestN', 'runs', 'unl', 'kings', 'rel']) out.endless[k] = Math.max(0, Math.floor(num(out.endless[k])));
  // 펫: 모르는 id는 버리고, 레벨 1..PET_MAX_LV, 조각·알은 0 이상
  const ps = o.pets && typeof o.pets === 'object' ? o.pets : {};
  const pets = { own: {}, sel: '', eggs: Math.max(0, Math.floor(num(ps.eggs))), pity: clampInt(ps.pity, 0, 99), got: num(ps.got) ? 1 : 0 };
  for (const id of Object.keys(ps.own && typeof ps.own === 'object' ? ps.own : {})) {
    if (!PETS[id] || !ps.own[id]) continue;
    pets.own[id] = { lv: clampInt(ps.own[id].lv, 1, PET_MAX_LV), sh: Math.max(0, Math.floor(num(ps.own[id].sh))) };
  }
  pets.sel = pets.own[ps.sel] ? ps.sel : '';
  out.pets = pets;
  // 탄종: 모르는 id는 보통탄으로(열렸는지는 쓸 때 모은 별로 본다)
  const am = o.ammo && typeof o.ammo === 'object' ? o.ammo : {};
  out.ammo = { sel: AMMO[am.sel] ? am.sel : '', seen: Math.max(0, Math.floor(num(am.seen))) };
  return out;
}

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { raw = memory; }
  if (!raw) return normalize(defaults());
  try {
    return normalize(JSON.parse(raw));
  } catch {
    // 읽지 못한 원본은 지우지 않고 옆에 둔다
    try { localStorage.setItem(CORRUPT, raw); } catch { /* 무시 */ }
    const d = normalize(defaults());
    d.corrupt = true;
    return d;
  }
}

export function save(data) {
  data.updated = Date.now();
  const copy = { ...data };
  delete copy.corrupt;
  const raw = JSON.stringify(copy);
  memory = raw;
  try { localStorage.setItem(KEY, raw); mode = 'ok'; } catch (e) {
    mode = e && (e.name === 'QuotaExceededError' || e.code === 22) ? 'full' : 'memory';
    if (mode === 'full') {
      // 부수적인 칸부터 비우고 한 번 더
      // 되돌리기용 보관(BAK)은 남긴다 — 방금 약속한 되돌리기가 사라지지 않게
      try { localStorage.removeItem('squad.run.v1'); localStorage.removeItem(CORRUPT); localStorage.setItem(KEY, raw); mode = 'ok'; } catch { /* 메모리에만 */ }
    }
  }
}

export function wipe() {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
  return normalize(defaults());
}

/* 가져오기·초기화 전에 지금 진행을 한 칸 보관(되돌리기용). 저장소에 못 쓰면 이 탭 동안만 메모리에 둔다. */
let bakMemory = null;
let bakMemoryOnly = false;
export function keepBackup(data) {
  bakMemory = { at: Date.now(), data: JSON.parse(JSON.stringify(data)) };
  try { localStorage.setItem(BAK, JSON.stringify(bakMemory)); bakMemoryOnly = false; } catch { bakMemoryOnly = true; }
  return true;
}
export function readBackup() {
  let raw;
  try { raw = localStorage.getItem(BAK); } catch { return bakMemory; }
  if (!raw) return bakMemoryOnly ? bakMemory : null;
  try {
    const o = JSON.parse(raw);
    return o && o.data ? o : null;
  } catch { return null; }
}
export function dropBackup() { bakMemory = null; bakMemoryOnly = false; try { localStorage.removeItem(BAK); } catch { /* 무시 */ } }

/* 강화 */
export const UPGRADES = [
  { id: 'start', name: '시작 병력', max: 10, effect: (lv) => `${12 + 2 * lv}명으로 출발` },
  { id: 'fire', name: '화력', max: 10, effect: (lv) => `총알 피해 +${5 * lv}%` },
  { id: 'coin', name: '보급', max: 10, effect: (lv) => `받는 코인 +${10 * lv}%` },
];
/* 값: 1~10단계는 40·1.5^단계(그대로). 11단계부터는 열 단계마다 같은 걸음을 되풀이하되 회차만큼 비싸다 —
   40·1.5^(단계 % 10) × (1 + UPG_CYCLE_K·⌊단계/10⌋): 11단계 68, 20단계 2614, 21단계 96 …
   회차 c의 +10단계 × 3종 = 13,600 × (1 + 0.7·(c−1))코인. 보급(코인 +10%/단계)이 회차마다 +100%p씩 벌이를 키우는 것과 걸음이 맞는다
   (1회차의 '벌어서 사는 순서'가 회차마다 되풀이된다 — core.expectAt(L, c)의 가정) */
export const UPG_CYCLE_K = 0.7;
export const upgCost = (lv) => Math.round(40 * Math.pow(1.5, lv % 10) * (1 + UPG_CYCLE_K * Math.floor(lv / 10)));

/* 모은 별: 모든 회차의 합(예전에 L61+에서 받은 별도 남는다) */
export function totalStars(d) {
  let n = 0;
  for (const k in d.stars) n += d.stars[k] | 0;
  if (d.cyc) for (const c in d.cyc) for (const k in d.cyc[c].stars) n += d.cyc[c].stars[k] | 0;
  return n;
}
/* 회차 c에서 받은 별(L1~60) */
export function cycleStars(d, c) {
  const st = (c <= 1 ? d.stars : d.cyc && d.cyc[c] ? d.cyc[c].stars : null) || {};
  let n = 0;
  for (let L = 1; L <= CYCLE_LEVELS; L++) n += st[L] | 0;
  return n;
}

/* 도감·통계 기록 */
export function seen(data, kind, id) {
  const list = data.codex[kind];
  if (list && !list.includes(id)) { list.push(id); return true; }
  return false;
}
