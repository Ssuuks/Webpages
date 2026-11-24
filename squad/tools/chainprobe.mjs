/* 작렬 유폭 연쇄 · 저격총 넘침 관통 측정(ENDGAME.md 39.1): 120마리 무리(5줄 × 24, 간격 gap m)에 저격총 한 발(좀비 체력의 3배)을 쏘고
   1초 안에 쓰러진 수를 센다 — 넘침 관통(thru)이 있을 때 / 없을 때. 유폭(죽은 좀비가 제 최대 체력 × chain으로 터짐)은 깊이만 FX_CHAIN_MAX로 막고 폭은 안 막는다.
   node squad/tools/chainprobe.mjs */
import * as C from '../assets/core.js';
import * as R from '../assets/roster.js';

const BLD = { start: C.START_N + 20, fire: 10, hero: { id: 'mungchi', lv: 5 }, unl: 3, ammoOpen: R.AMMO_IDS2, relicsOpen: R.RELIC_IDS.slice(), flame: true, build: 2 };
function run(lv, thru, gap) {
  const u = C.newEndless({ seed: 31, ...BLD, gun: 'marksman' });
  u.endless.seg = 20; u.endless.fx = lv ? { burst: lv } : {}; u.squad.n = 900;
  u.props = []; u.rows = []; u.saws = []; u.bullets = []; u.foes = []; delete u.divs;
  u.squad.fireAcc = -1e9; u.squad.sp = []; u.boss = null; u.stats.dmg = {};
  let id = 99000;
  const H = 100;
  for (let i = 0; i < 24; i++) for (const x of [-2, -1, 0, 1, 2]) u.foes.push({ id: id++, kind: 'grunt', x: u.squad.x + x * gap, z: u.squad.z + 8 + 1.1 * gap * i, hp: H, max: H, spd: 0, home: 0, homeDist: 0, r: 0.42, alive: true, awake: true, hitT: -9 });
  u.bullets.push({ x: u.squad.x, z: u.squad.z + 7.5, d: 5, dmg: 3 * H, hm: 1, g: 'm', ...(thru ? { thru: 1 } : {}), r: 50 });
  for (let t = 0; t < 1 / C.DT; t++) { u.squad.fireAcc = -1e9; C.step(u, { dir: 0 }); }   // 분대는 더 쏘지 않는다
  return u.stats.kills;
}
console.log('작렬 Lv: 유폭 chain(최대 체력 몫) · 반경 → 120마리 중 쓰러진 수 [넘침 관통 있음 / 없음]');
for (const lv of [0, 3, 5, 7, 9, 11, 13]) {
  const v = lv ? R.fx2Val('burst', lv) : { chain: 0, r: 0 };
  console.log(`Lv${String(lv).padStart(2)}: chain ${v.chain} · r ${v.r}m → 간격 1m ${run(lv, true, 1)} / ${run(lv, false, 1)} · 간격 1.5m ${run(lv, true, 1.5)} / ${run(lv, false, 1.5)}`);
}
