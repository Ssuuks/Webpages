/* 진행 저장 — localStorage가 막혀 있어도(사생활 보호 모드 등) 메모리로 계속 돈다 */
const KEY = 'squad.v1';

export function defaults() {
  return {
    v: 1,
    maxL: 1,          // 열린 가장 높은 레벨
    cur: 1,           // 다음에 할 레벨
    stars: {},        // 레벨 → 별(0~3)
    best: {},         // 레벨 → 최고 남은 병력
    coins: 0,
    upg: { start: 0, fire: 0, coin: 0 },
    set: { sound: true, vibe: true, shake: true, low: false, preview: false },
    tips: {},         // 한 번 본 안내
    fails: {},        // 레벨 → 연속 실패 수
    plays: 0,
  };
}

let memory = null;

export function load() {
  const d = defaults();
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { raw = memory; }
  if (!raw) return d;
  try {
    const o = JSON.parse(raw);
    return {
      ...d, ...o,
      upg: { ...d.upg, ...(o.upg || {}) },
      set: { ...d.set, ...(o.set || {}) },
      stars: { ...(o.stars || {}) },
      best: { ...(o.best || {}) },
      tips: { ...(o.tips || {}) },
      fails: { ...(o.fails || {}) },
    };
  } catch { return d; }
}

export function save(data) {
  const raw = JSON.stringify(data);
  memory = raw;
  try { localStorage.setItem(KEY, raw); } catch { /* 메모리에만 */ }
}

export function wipe() {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
  return defaults();
}

/* 강화 */
export const UPGRADES = [
  { id: 'start', name: '시작 병력', max: 10, effect: (lv) => `${12 + 2 * lv}명으로 출발` },
  { id: 'fire', name: '화력', max: 10, effect: (lv) => `총알 피해 +${5 * lv}%` },
  { id: 'coin', name: '보급', max: 10, effect: (lv) => `받는 코인 +${10 * lv}%` },
];
export const upgCost = (lv) => Math.round(40 * Math.pow(1.5, lv));

export function totalStars(d) {
  let n = 0;
  for (const k in d.stars) n += d.stars[k] | 0;
  return n;
}
