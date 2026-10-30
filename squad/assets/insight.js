/* 화면 안내용 순수 계산(DOM 없음) — 레벨 태그·강화 상한·보스 도착 시간·지원 병력·게이트 '다른 칸' 결과·근소한 패배.
   시뮬레이션(core.js)이 새 약속(levelTag·upgCap·bossEta·supportFor·lv.helpStart·gate 이벤트 alt)을 아직 내놓지 않았어도
   돌도록 기능을 확인해서 쓰고, 없으면 지금 규칙으로 물러선다. 함수마다 마지막 인자로 core·store 대신 쓸 객체를 넣을 수 있다(테스트용). */
import * as C from './core.js';

export const TAGS = ['hard', 'super', 'rest'];
export const TAG_LABEL = { hard: '어려움', super: '매우 어려움', rest: '쉼' };
/* 태그마다 불꽃 개수(배지) */
export const TAG_FIRE = { hard: 1, super: 2, rest: 0 };

const fn = (o, k) => (o && typeof o[k] === 'function' ? o[k] : null);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/* 레벨 태그: { tag: '' | 'hard' | 'super' | 'rest', label, coinMul }.
   core.levelTag가 없으면 태그도 없다(시뮬레이션에 없는 난이도를 화면에 약속하지 않는다). */
export function tagOf(L, core = C) {
  const f = fn(core, 'levelTag');
  if (f) {
    try {
      const t = f(L);
      const tag = t && TAGS.includes(t.tag) ? t.tag : '';
      const mul = t && finite(+t.coinMul) && +t.coinMul > 0 ? +t.coinMul : 1;
      return { tag, label: tag ? (t.label || TAG_LABEL[tag]) : '', coinMul: mul };
    } catch { /* 아래 기본값 */ }
  }
  return { tag: '', label: '', coinMul: 1 };
}
export const hasTags = (core = C) => !!fn(core, 'levelTag');
/* 코인 배수 글자: 1.5 → '×1.5', 2 → '×2' */
export const mulText = (m) => '×' + (Math.round(m * 100) / 100);

/* 지금 진행(maxL)에서 새로 살 수 있는 강화 단계 상한. core.upgCap → store.upgCap → u.max.
   이미 산 단계는 줄이지 않는다(상한은 새 구매만 막는다). */
export function upgLimit(maxL, u, core = C, store = null) {
  const f = fn(core, 'upgCap') || fn(store, 'upgCap');
  if (f) {
    try {
      const c = f(maxL, u.id);
      if (finite(c)) return Math.max(0, Math.min(u.max, Math.floor(c)));
    } catch { /* 상한 없음 */ }
  }
  return u.max;
}
/* lvU 단계 위로 더 사려면 깨야 하는 레벨(그 레벨을 깨면 maxL = 그 레벨 + 1). 없으면 0 */
export function unlockAt(maxL, u, lvU, core = C, store = null) {
  if (lvU >= u.max) return 0;
  for (let m = maxL + 1; m <= maxL + 400; m++) if (upgLimit(m, u, core, store) > lvU) return m - 1;
  return 0;
}
/* 강화 하나의 상태: { lv, cap, canBuy, locked(상한에 걸림), maxed, at(깨야 하는 레벨) } */
export function upgState(data, u, core = C, store = null) {
  const lv = (data.upg && data.upg[u.id]) | 0;
  const cap = upgLimit(data.maxL, u, core, store);
  const maxed = lv >= u.max;
  const locked = !maxed && lv >= cap;
  return { lv, cap, maxed, locked, canBuy: !maxed && !locked, at: locked ? unlockAt(data.maxL, u, lv, core, store) : 0 };
}

/* 보스가 분대에 닿기까지 남은 초. 보스가 없거나 이미 맞붙었으면 null.
   core.bossEta가 없으면 지금 보스 규칙(따라오는 거리·걷는 속도·격앙 ×1.25)으로 어림한다. */
export function bossEtaOf(s, core = C) {
  const b = s && s.boss;
  if (!b || !(b.hp > 0) || (s.phase && s.phase !== 'arena')) return null;
  const f = fn(core, 'bossEta');
  if (f) {
    try {
      const v = f(s);
      return finite(v) ? Math.max(0, v) : null;
    } catch { return null; }
  }
  if (b.clash) return null;
  const q = s.squad;
  const R = fn(core, 'radius') ? core.radius(Math.max(1, q.n)) : 1;
  const reach = q.z + 0.55 * R + (b.r || 2.5) * 0.6;
  const v = (b.walk || 1.3) * (b.enraged ? 1.25 : 1);
  return v > 0 ? Math.max(0, (b.z - reach) / v) : null;
}
/* 보스와 맞붙어 짓밟히는 중인가 */
export const bossClash = (s) => !!(s && s.boss && s.boss.hp > 0 && s.boss.clash);

/* 3패 지원 병력(시작 병력에 더한다): core.supportFor(lv) → lv.helpStart → 예전 식 max(5, 도착 병력의 20%) */
export function supportSize(lv, core = C) {
  const f = fn(core, 'supportFor');
  if (f) {
    try { const v = f(lv); if (finite(v) && v > 0) return Math.round(v); } catch { /* 아래로 */ }
  }
  if (lv && finite(lv.helpStart) && lv.helpStart > 0) return Math.round(lv.helpStart);
  return Math.max(5, Math.round(((lv && lv.arrive) || 30) * 0.2));
}

/* '처음부터 다시'·포기를 진 판으로 세나: 첫 게이트를 지난 뒤에만(그 전의 재시작은 공짜 — 바로 다시 하기를 벌하지 않게) */
export const restartCounts = (state) => !!(state && state.stats && (state.stats.gates | 0) >= 1);

/* 지난 게이트 줄의 다른 칸 결과(같은 순간의 숫자 — 쏴서 올린 값 그대로).
   e = 'gate' 이벤트 { before, after, x, row, alt? }, row = 그 줄(s.rows의 같은 id).
   돌려주는 것: { chosen, alts: [{ i, x, n, best }], best, gap(= best − after), worth(다른 칸이 20% 이상, 2명 이상 나았나) } 또는 null */
export function gateAlts(row, e, core = C) {
  if (!row || !Array.isArray(row.cells) || row.cells.length < 2 || !e) return null;
  const cells = row.cells;
  let chosen = Number.isInteger(row.chosen) ? row.chosen : -1;
  if (chosen < 0 || chosen >= cells.length) {
    chosen = cells.findIndex((c) => Math.abs((c.x0 + c.x1) / 2 - e.x) < 1e-6);
    if (chosen < 0 && fn(core, 'pickCell')) chosen = core.pickCell(row, e.x);
  }
  const apply = fn(core, 'applyOp');
  const after = Math.max(0, finite(e.after) ? e.after : 0);
  const alts = [];
  let best = -Infinity;
  for (let i = 0; i < cells.length; i++) {
    if (i === chosen) continue;
    const c = cells[i];
    let n = Array.isArray(e.alt) && finite(e.alt[i]) ? e.alt[i] : apply ? apply(e.before, c.op, c.v) : NaN;
    if (!finite(n)) continue;
    n = Math.max(0, Math.round(n));
    alts.push({ i, x: (c.x0 + c.x1) / 2, n, best: false });
    if (n > best) best = n;
  }
  if (!alts.length) return null;
  for (const a of alts) a.best = a.n === best;
  const gap = best - after;
  return { chosen, alts, best, gap, worth: gap >= 2 && best >= 1.2 * after };
}
/* 그 줄이 레벨의 몇 번째 게이트 줄인가(앞에서부터 1, 2, …) */
export function rowOrdinal(rows, row) {
  if (!row || !Array.isArray(rows)) return 0;
  let k = 1;
  for (const r of rows) if (r !== row && r.z < row.z) k++;
  return k;
}

/* 근소한 패배. arenaN = 경기장에 들어섰을 때 병력.
   보스에게 준 피해는 병사 화력(dps 공식)에 비례하고 짓밟히는 몫도 병력에 비례한다고 보고,
   같은 시간 동안 남은 체력까지 깎으려면 경기장에서 몇 명이 더 있어야 했는지 dps 공식으로 거꾸로 구한다.
   돌려주는 것: { left(0..1), pct(1..100), more(명 또는 null) } 또는 보스가 없으면 null */
export function nearMiss(s, arenaN, core = C) {
  const b = s && s.boss;
  if (!b || !(b.max > 0)) return null;
  const hp = Math.max(0, b.hp);
  const left = hp / b.max;
  const pct = hp > 0 ? Math.max(1, Math.round(left * 100)) : 0;
  let more = null;
  const dps = fn(core, 'dps');
  const dealt = b.max - hp;
  if (hp > 0 && dealt > 0 && finite(arenaN) && arenaN > 0 && dps) {
    const need = b.max / dealt;
    const tier = (s.squad && s.squad.tier) | 0, fire = s.fireLv | 0;
    const d0 = dps(arenaN, tier, fire);
    if (d0 > 0) {
      const ok = (m) => dps(arenaN + m, tier, fire) / d0 >= need;
      let hi = 1;
      while (!ok(hi) && hi < 1e7) hi *= 2;
      if (ok(hi)) {
        let lo = 0;
        while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (ok(m)) hi = m; else lo = m; }
        more = hi;
      }
    }
  }
  return { left, pct, more };
}

/* 이 레벨을 맞춘 '기대 강화'(core.expectAt)보다 시작 병력·화력이 낮은가. 진 판에서 '강화하고 다시'를 권할 때 쓴다.
   { below: 강화 이름 목록, gap: 모자란 단계 합 }. core.expectAt이 없으면 빈 목록 */
export function gearGap(data, L, upgrades, core = C) {
  const f = fn(core, 'expectAt');
  const out = { below: [], gap: 0 };
  if (!f || !data || !data.upg) return out;
  let e;
  try { e = f(L); } catch { return out; }
  if (!e) return out;
  for (const u of upgrades || []) {
    if (u.id !== 'start' && u.id !== 'fire') continue;   // 보급(코인)은 판 난이도와 상관없다
    const want = e[u.id] | 0;
    const have = data.upg[u.id] | 0;
    if (have < want) { out.below.push(u.name); out.gap += want - have; }
  }
  return out;
}
