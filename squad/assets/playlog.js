/* 플레이 기록(ENDGAME.md 32절): 판이 끝날 때마다 한 줄 — 버전, 무엇으로 싸웠나(총·탄 효과·특수병·강화·유물), 출처별 피해·처치,
   무엇에 병사를 잃었나, 어디서 전멸했나. 이 기기(localStorage)에만 쌓인다 — 설정 → '플레이 기록'에서 요약을 보고 JSON으로 복사한다.
   화면 밖 순수 함수(entryOf·summarize)는 tests/endgame.mjs가 본다 */
export const LOG_KEY = 'squad-playlog';
export const LOG_MAX = 300;

/* 출처 이름(core hitFoe의 by · hitBossBonus의 by) */
/* 39.10(기록 v2): 탄 효과를 나눠 센다 — pierce 관통 · splash 작렬 둘레 · burst 유폭 · shock 전격 사슬 · pop Lv10 터짐 · ember 불씨 폭발 불. 옛 기록의 chain은 전격·유폭·터짐이 섞인 값 */
export const SRC_NAME = { gun: '총', pierce: '관통', splash: '작렬 둘레', burst: '유폭', shock: '전격', pop: '터짐(Lv10)', ember: '불씨 폭발', sniper: '저격수', rocket: '로켓병', flame: '화염병', chain: '전격·유폭(옛 기록)', acid: '부식', boom: '폭발(옛 기록)', hero: '영웅', drum: '드럼통', bomb: '자폭 좀비 폭발', pet: '펫', card: '카드', cure: '치료', '?': '기타' };
/* 병사를 잃은 까닭(core lose의 cause[:sub]) */
export const LOSS_NAME = {
  foe: '좀비에 닿음', brute: '거구', runner: '질주 좀비', gate: '게이트', wall: '벽에 부딪힘', saw: '톱날', spit: '독침', pool: '웅덩이',
  boss: '보스', 'boss:stomp': '보스 밟기', 'boss:slam': '보스 내려찍기', summon: '보스 졸개', crate: '상자·철창', 'crate:trap': '꽝 상자', fog: '독안개', drum: '드럼통', bomb: '자폭 좀비',
};
const r1 = (x) => Math.round(x * 10) / 10;

/* 끝난 판 s(core 상태)에서 기록 한 줄 */
export function entryOf(s, o = {}) {
  const e = s.endless, B = e && e.bld, q = s.squad, st = s.stats || {};
  const dmgTot = Object.values(st.dmg || {}).reduce((a, b) => a + b, 0) || 1;
  const share = {};
  for (const [k, v] of Object.entries(st.dmg || {})) if (v > 0) share[k] = r1((100 * v) / dmgTot);
  // 특수병: 판 동안 가장 높았던 레벨(호위가 모자라 떠난 것도 — 39.10, 끝 순간엔 떠나고 없을 수 있다) · spEnd = 끝에 남은 것
  const sp = {}, spEnd = {};
  const up = (k, lv) => { if (k && (lv | 0) > (sp[k] | 0)) sp[k] = lv | 0; };
  for (const m of q.sp || []) { spEnd[m.k] = m.lv || 1; up(m.k, m.lv || 1); }
  for (const [k, lv] of Object.entries(st.spPk || {})) up(k, lv);
  for (const d of (B && B.down) || []) up(d.k, d.lv || 1);
  const fx = {};
  if (e && e.fx) for (const [a, lv] of Object.entries(e.fx)) if (lv > 0) fx[a] = lv;
  const lost = {};
  for (const [k, v] of Object.entries(st.lostBy || {})) if (v > 0) lost[k] = Math.round(v);
  const segs = Array.isArray(st.segs) ? st.segs.map((r) => r.slice()) : [];
  if (e && st.cur && (st.cur.lost || st.cur.gate || st.cur.nb)) segs.push([e.seg, st.cur.nb | 0, -1, Math.round(st.cur.lost || 0), Math.round(st.cur.gate || 0)]);   // 끝난 구간(보스를 못 잡았으면 보스전 초 −1)
  return {
    fmt: 2,
    v: o.ver || '', sim: o.sim || 0, at: o.at || Date.now(),
    mode: e ? 'endless' : 'campaign',
    L: e ? 0 : s.L, cycle: o.cycle || 1, won: s.phase === 'won',
    seg: e ? e.seg : 0, bosses: e ? e.bosses | 0 : 0,
    t: Math.round(s.t), start: Math.round(st.spawned || 0), peak: Math.round(q.peak || 0),
    hero: s.hero ? `${s.hero.id}:${s.hero.lv}` : '', pets: [s.pet, ...(s.pets || [])].filter(Boolean).map((p) => p.id),
    ammo: s.ammo || '', gun: B ? `${B.gt}:${(B.gl && B.gl[B.gt]) || 1}` : '', star: (q.tier | 0) + 1,
    fx, sp, spEnd, enh: B && B.enh ? B.enh : {}, relics: e && e.relics ? e.relics.slice() : [],
    mut: Array.isArray(st.mutAt) ? st.mutAt.map((r) => r.slice()) : [], picks: e && Array.isArray(e.picks) ? e.picks.slice() : [],
    segs, lanes: { luck: Array.isArray(st.luck) ? st.luck.slice() : [0, 0, 0, 0], treasure: st.treasure | 0 },
    sup: o.sup || null, quit: !!o.quit,
    dmg: share, kills: { ...(st.kb || {}) }, lost,
    death: st.death || null,
  };
}

export function loadLog(ls = globalThis.localStorage) {
  try { const a = JSON.parse(ls.getItem(LOG_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
export function addLog(entry, ls = globalThis.localStorage) {
  const a = loadLog(ls);
  a.push(entry);
  while (a.length > LOG_MAX) a.shift();
  for (let tries = 0; tries < 4; tries++) {
    try { ls.setItem(LOG_KEY, JSON.stringify(a)); return a.length; } catch { a.splice(0, Math.ceil(a.length / 3)); }   // 저장 공간이 모자라면 오래된 것부터 덜어 낸다
  }
  return 0;
}
export function clearLog(ls = globalThis.localStorage) { try { ls.removeItem(LOG_KEY); } catch { /* 무시 */ } }

const band = (seg) => { const a = Math.floor((Math.max(1, seg) - 1) / 6) * 6 + 1; return `${a}~${a + 5}`; };

/* 요약: 버전 ver(없으면 전부)의 무한모드 판으로 — 출처별 피해 몫(판마다 몫의 평균), 총·주력 출처별 평균 보스, 전멸 까닭·구간대, 잃은 병사 까닭 */
export function summarize(log, ver = '') {
  const runs = log.filter((x) => x && (!ver || x.v === ver));
  const end = runs.filter((x) => x.mode === 'endless' && !x.quit);
  const out = { runs: runs.length, endless: end.length, campaign: runs.length - end.length, versions: {}, dmg: [], byGun: [], byMain: [], byBuild: [], byMut: [], death: [], deathBand: [], lost: [], best: 0, mean: 0 };
  for (const x of log) out.versions[x.v || '?'] = (out.versions[x.v || '?'] | 0) + 1;
  if (!end.length) return out;
  const avg = (rows, key) => {
    const m = new Map();
    for (const x of rows) { const k = key(x); if (!k) continue; const g = m.get(k) || { k, n: 0, b: 0 }; g.n++; g.b += x.bosses; m.set(k, g); }
    return [...m.values()].map((g) => ({ k: g.k, n: g.n, bosses: r1(g.b / g.n) })).sort((a, b) => b.bosses - a.bosses);
  };
  const dsum = {};
  for (const x of end) for (const [k, v] of Object.entries(x.dmg || {})) dsum[k] = (dsum[k] || 0) + v;
  out.dmg = Object.entries(dsum).map(([k, v]) => ({ k, pct: r1(v / end.length) })).sort((a, b) => b.pct - a.pct);
  out.byGun = avg(end, (x) => (x.gun || '').split(':')[0]);
  out.byMain = avg(end, (x) => { const e = Object.entries(x.dmg || {}).sort((a, b) => b[1] - a[1]); return e.length ? e[0][0] : ''; });
  // 39.10: 총 × 가장 높은 탄 효과 · 걸린 적 변이(기록 v2부터 — 판 하나에 변이가 여럿이면 그 각각에 센다)
  out.byBuild = avg(end, (x) => { const f = Object.entries(x.fx || {}).sort((a, b) => b[1] - a[1]); const g = (x.gun || '').split(':')[0]; return g && f.length ? `${g}+${f[0][0]}` : ''; });
  { const m = new Map(); for (const x of end) for (const id of new Set((x.mut || []).map((r) => r[1]))) { const g = m.get(id) || { k: id, n: 0, b: 0 }; g.n++; g.b += x.bosses; m.set(id, g); } out.byMut = [...m.values()].map((g) => ({ k: g.k, n: g.n, bosses: r1(g.b / g.n) })).sort((a, b) => b.bosses - a.bosses); }
  const cnt = (rows, key) => { const m = {}; for (const x of rows) { const k = key(x); if (k) m[k] = (m[k] | 0) + 1; } return Object.entries(m).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n); };
  const dead = end.filter((x) => x.death);
  out.death = cnt(dead, (x) => (x.death.sub ? `${x.death.cause}:${x.death.sub}` : x.death.cause) + (x.death.arena ? '@boss' : ''));
  out.deathBand = cnt(dead, (x) => band(x.death.seg)).sort((a, b) => parseInt(a.k, 10) - parseInt(b.k, 10));
  const lsum = {};
  for (const x of end) { const t = Object.values(x.lost || {}).reduce((a, b) => a + b, 0) || 1; for (const [k, v] of Object.entries(x.lost || {})) lsum[k] = (lsum[k] || 0) + (100 * v) / t; }
  out.lost = Object.entries(lsum).map(([k, v]) => ({ k, pct: r1(v / end.length) })).sort((a, b) => b.pct - a.pct);
  out.best = Math.max(...end.map((x) => x.bosses));
  out.mean = r1(end.reduce((a, x) => a + x.bosses, 0) / end.length);
  return out;
}
