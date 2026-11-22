/* 무한모드 측정: 봇마다 판을 돌려 잡은 보스 수(도달 구간)의 분포를 본다.
   node squad/tools/endless.mjs [--seeds 24] [--bots sloppy0.1,sloppy0.3,idle,random] [--up 10] [--hero mungchi] [--herolv 5] [--max 30] [--trace]
   보스 뒤 3택 1(단계 해금 1단계): [--cards think,random,men,first,look] [--unl 1] [--ammo pierce,burst,rapid,frost]
   --cards가 없으면 예전 그대로(카드 없음). 있으면 (봇 × 카드 고르기)마다 한 줄 + 고른 카드 종류 분포. --unl은 --cards가 있으면 1이 기본
   (2: 탄 효과·탄종 상자·시너지 + 4구간부터 장애물(장갑문·폭발 드럼통·방패 정예) — core.CARD.stageMax까지. 장애물만 끄고 재려면 C.RUN_ORDER.obstacle = Infinity),
   --ammo는 별로 열린 탄종(기본 넷 다 — 탄종 카드 후보).
   3단계(유물 — 대왕 보스 뒤): --unl 3 [--relics all|compass,coil,…](열린 유물, 기본 all) [--hold ward,…](처음부터 가진 유물 — 유물마다 재 보기).
   --flame: 화염병 줄(4단계)을 연 판(특수병 카드·철창·금색 칸에 화염병이 나온다 — think는 화염병을 THINK.sp.flame으로 본다. '그 병과 우선' 고르기는 밸런스 때 더한다) */
import * as C from '../assets/core.js';
import * as R from '../assets/roster.js';
import { AMMO_IDS, fxK, RELICS, RELIC_IDS, BUILD, SETS, deep, fx2Val } from '../assets/roster.js';
import { makeBot, rng } from '../tests/bots.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes('--' + k);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* 한 판: 전멸하거나 maxSeg 구간을 넘길 때까지. { bosses, seg, t, peak, ns: 구간마다 출발 병력(카드를 고른 뒤), lost: 죽은 곳, picks?: 고른 카드 }
   opt.unl ≥ 1이면 보스 뒤에 카드가 뜬다 — pick(s, offer, pol) → 카드 번호(pick이 없으면 늘 0번).
   카드가 떠 있는 동안 step은 틱을 세지 않으므로 여기서 바로 고른다(멈춘 판을 붙잡고 maxTicks까지 도는 일이 없다) */
export function runEndless(opt, pol, maxSeg = 30, maxTicks = 60 * 60 * 30, pick = null) {
  const s = C.newEndless(opt);
  const ns = [];
  while (s.phase !== 'lost' && s.endless.bosses < maxSeg && s.tick < maxTicks) {
    const of = C.offerOf(s);
    if (of) { if (!C.pickCard(s, pick ? pick(s, of, pol) : 0)) break; }   // 고를 수 없는 카드(생기면 core 버그) — 멈춘 판에서 빠져나온다
    else C.step(s, pol(s));
    for (const e of s.ev) if (e.t === 'segStart') ns.push(s.squad.n);
  }
  const out = { bosses: s.endless.bosses, seg: s.endless.seg, t: s.t, peak: s.squad.peak, ns, cause: s.cause, arena: !!s.boss, coins: C.endlessCoins(s, 0), s };
  if (s.endless.picks) out.picks = s.endless.picks.slice();
  return out;
}
export const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : 0; };

/* ---------- 카드 고르기(사람 대리) ----------
   makePicker(name, seed, opt) → pick(s, offer, pol) → 카드 번호. pol은 runEndless가 넘기는 이동 봇('look'만 쓴다 — opt.pol이 있으면 그것).
   'think'  생각하는 사람(thinkScore — 아래 식)
   'random' 아무거나(시드 고정, tests/bots.mjs의 rng)
   'men'    늘 증원(없으면 첫 장)
   'first'  늘 첫 장
   'look'   카드마다 판과 이동 봇을 복제해(structuredClone, pol.clone()) 다음 카드·전멸·opt.cap틱까지 돌려 본다 —
            살아남은 쪽, 그다음은 다음 카드가 뜰 때 병력이 큰 쪽(모두 전멸이면 더 멀리 간 쪽, 같으면 앞 카드).
            결정적인 판을 미리 보는 '신의 눈'이라 상한을 재는 용도(판마다 카드 수 × 한 구간을 더 돈다 — 4배쯤 느리다)
   'pref:unit>gun>men>ammo'  적힌 순서로 먼저 있는 종류(측정용 — --cards가 쉼표로 나누므로 '>'로 잇는다)
   'one:<탄종>' · 'nofx' · 'unit:<병과>' · 'relic:<id>'  think + 고집 하나(밸런스 측정 — 단계 해금 기획서 7절의 합격 기준, ENDGAME.md 13절) */
export const THINK = {
  H: 2,          // 오래 남는 효과가 남은 판에서 몇 구간 더 쓸모 있다고 보는가(잰 값: sloppy0.1 24판, H 0·1·2·3·5 → 평균 5.79·5.79·6.63·6.67·6.21)
  ammo: 0.01,    // 탄종 바꾸기의 구간당 몫(탄종끼리는 세기가 비슷하다 — 합격 기준 ±5%p)
  sp: { medic: 0.1, sniper: 0.09, rocket: 0.12, flame: 0.05 },   // 특수병 한 명 = 병력의 이만큼(core.js SP_WORTH — 봇이 상자·철창을 볼 때 쓰는 값). 화염병(4단계 판만)은 잰 값으로 0.05: 0.1(의무병과 같게)이면 think가 로켓·의무병 대신 화염병을 골라 화염병을 연 판이 −0.63, 0.05면 −0.49(96판)
  // 2단계(탄 효과): 효과 Lv2(= 그 탄종의 좋은 점 100%)가 화력 몇 배 몫인가, 시너지 하나가 켜지는 몫 [초안 — 밸런스 때 재서 고칠 것.
  // 속사만 식 그대로(화력 +15%), 나머지는 맞는 좀비가 늘 있지 않은 만큼 낮춰 어림했다]
  fx: { pierce: 0.08, burst: 0.08, rapid: 0.15, frost: 0.04 },
  combo: 0.05,
  // 3단계(유물): 유물 하나가 남은 판에서 구간마다 화력 몇 배 몫인가 [초안 — 밸런스 때 재서 고칠 것. 가방은 화면 쪽 알이라 판에는 손해 쪽]
  relic: { compass: 0.02, dice: 0.03, megaphone: 0.02, coil: 0.08, fourth: 0.05, pledge: 0.05, bag: 0, pouch: 0.04, ward: 0.05 },
  // 빌드 개편 판(thinkScoreB — 아래 식): 값은 '화력이 이만큼(자연로그) 는다'로 어림한 것 [초안 — 잰 값은 ENDGAME.md 19절]
  b: {
    w: { pierce: 0.02, burst: 0.03, frost: 0.03, sniper: 0.05, rocket: 0.025, flame: 0.03, medic: 0.025, shield: 0.06, chg: 0.01, dur: 0.02 },   // 유효 레벨(deep) 하나의 몫
    first: 0.08,    // 새 특수병·탄 효과를 처음 얻는 몫(레벨 1이 나머지보다 얼마나 더 값진가 — 자리를 잡는 일)
    tier: {         // 세트가 단계마다 더하는 몫(누적이 아니라 그 단계에 오를 때 더해지는 값)
      barrage: [0.11, 0.26, 0.32], blast: [0.17, 0.33, 0.4], precise: [0.2, 0.3, 0.4], frost: [0.15, 0.3, 0.45], command: [0.1, 0.1, 0.15],
    },
    prog: 0.5,      // 다음 단계를 향한 걸음의 몫(그 단계 몫 × 이 값 × 걸음 비율) — 한 세트에 모으게 한다
    spec: 0.12,     // 전문화 한 장(둘 중 어느 쪽이든 — 전문화를 미루면 그만큼 카드 한 장을 놓친다)
    curse: 0.1,     // 위험한 계약(카드 +2장 vs 다음 구간 위협 ×1.25)
    reroll: 0.08,   // 이 점수 아래면 다시 뽑기(남았으면)
  },
};
/* 'think'의 점수 = 다음 구간 하나의 화력 배수 몫 + 오래 남는 몫 × H.
   다음 구간은 고르기 전의 병력·무기 단계로 만들고(buildSegment: 위협 = WEAPON[tier] × segMul × 뒤처짐, 게이트는 그때 병력 기준),
   그다음 구간부터는 그때의 병력·단계로 다시 만든다 — 그래서 병력·무기는 한 구간 몫만 남고 위협에 흡수된다. 특수병·탄종은 위협에 안 들어간다.
   - 증원: d = (to/from)^0.8 − 1(화력 ∝ 병력^0.8). 다음 구간의 바닥선(segFloor) 아래에 드는 몫 u = clamp((바닥선 − from)/(to − from), 0, 1)은
           위협이 바닥선 기준이라 흡수되지 않는다 → d × (1 + H·u)
   - 무기: WEAPON[to]/WEAPON[from] − 1(한 구간만)
   - 특수병: w = sp[병과](레벨 올리기는 × SP_UP_WORTH), ((1 + w)^0.8 − 1) × (1 + H)
   - 탄종: ammo × (1 + H)
   - 탄 효과(2단계): fx[탄종] × (fxK(to) − fxK(from)) × (1 + H) — 위협에 안 들어가 오래 남는다
   - 시너지를 켜는 카드(특수병·탄 효과 — cardInfo의 combos): + combo × 켜지는 수 × (1 + H). 1단계 판의 카드에는 combos가 없다(점수 그대로)
   - 무기가 위협 식의 상한(core.THREAT_TIER = 3)을 넘는 몫(과부하 코일의 4단계)은 위협에 안 들어가 오래 남는다 → × (1 + H)
   - 유물(3단계): relic[id] × (1 + H) */
export function thinkScore(s, c, K = THINK) {
  const f = C.cardInfo(s, c);
  if (!f) return -1;
  if (C.bldOf(s)) return thinkScoreB(s, c, f, K.b || THINK.b);
  if (c.k === 'men') {
    const d = Math.pow(f.to / Math.max(1, f.from), 0.8) - 1;
    const u = f.to > f.from ? clamp((C.segFloor(s.endless.seg + 1) - f.from) / (f.to - f.from), 0, 1) : 0;
    return d * (1 + K.H * u);
  }
  if (c.k === 'gun') return (C.WEAPON[f.to] / C.WEAPON[f.from] - 1) * (f.to > C.THREAT_TIER ? 1 + K.H : 1);
  if (c.k === 'unit') {
    const w = (K.sp[c.u] || 0.1) * (f.from ? C.SP_UP_WORTH : 1);
    const v = (Math.pow(1 + w, 0.8) - 1) * (1 + K.H);
    return f.combos ? v + (K.combo ?? THINK.combo) * f.combos.length * (1 + K.H) : v;
  }
  if (c.k === 'ammo') return K.ammo * (1 + K.H);
  if (c.k === 'fx') {
    const lvK = (lv) => (lv > 0 ? fxK(lv) : 0);
    const v = ((K.fx || THINK.fx)[c.a] || 0) * (lvK(f.to) - lvK(f.from)) * (1 + K.H);
    return f.combos ? v + (K.combo ?? THINK.combo) * f.combos.length * (1 + K.H) : v;
  }
  if (c.k === 'relic') return ((K.relic || THINK.relic)[c.r] || 0) * (1 + K.H);
  return -1;
}
/* 개편 판(s.endless.bld)의 카드 점수 = 직접 값(총·탄 효과·특수병·생존·영웅 레벨의 깊이 보상 deep() 몫) + 세트 진행(cardInfo의 set: from·to·tier·up·next — 단계에 오르는 몫과 다음 단계를 향한 걸음).
   - 무기 개조: 화력 ln((1 + gun·deep(to)) / (1 + gun·deep(from)))
   - 속사: 화력 ln(pow(to) / pow(from)) (fx2Val — 피해·속도·보스·과열을 화력으로 어림한 값)
   - 그 밖의 탄 효과·특수병·영웅·게이트 방패: w[부품] × (deep(to) − deep(from)), 처음 얻으면 first를 더
   - 방탄복: ln((1 + armor·deep(to)) / (1 + armor·deep(from)))
   - 전문화 spec · 위험한 계약 curse: 정한 값
   - 세트: 오르는 단계의 tier[세트][단계] 합 + prog × (다음 단계의 tier × 그 단계까지의 걸음 비율)의 차. 정한 한 세트에 모을수록 단계가 빨리 켜지고 deep()이 커진다 */
function thinkScoreB(s, c, f, K) {
  const g = (a, b) => Math.log(a / b);
  if (f.k === 'spec') return K.spec;
  if (f.k === 'curse') return K.curse;
  if (f.k === 'relic') return ((THINK.relic)[c.r] || 0) * (1 + THINK.H);
  let v = 0;
  const part = f.k === 'gun' ? 'gun' : f.k === 'unit' ? f.u : f.k === 'fx' ? f.a : f.k === 'hero' ? f.h : f.g;
  if (f.k === 'gun') v = g(C.WEAPON[f.to], C.WEAPON[f.from]);   // 총 ★(무기 단계)
  else if (f.k === 'fx' && f.a === 'rapid') v = g(fx2Val('rapid', f.to).pow, f.from ? fx2Val('rapid', f.from).pow : 1);
  else if (f.k === 'guard' && f.g === 'armor') v = g(1 + BUILD.armor * deep(f.to), 1 + BUILD.armor * deep(f.from));
  else v = (K.w[part] || 0.02) * (deep(f.to) - deep(f.from)) + (f.from ? 0 : K.first);
  if (f.combos) v += (K.combo ?? THINK.combo) * f.combos.length;
  const st = f.set;
  if (st) {
    const T = K.tier[st.id], at = SETS[st.id].at;
    const phi = (lv) => {   // 레벨 합 lv의 퍼텐셜: 지난 단계 몫의 합 + prog × 다음 단계 몫 × 걸음 비율
      let sum = 0, t = 0;
      while (t < 3 && lv >= at[t]) sum += T[t++];
      if (t < 3) sum += K.prog * T[t] * (lv - (t ? at[t - 1] : 0)) / (at[t] - (t ? at[t - 1] : 0));
      return sum;
    };
    v += phi(st.to) - phi(st.from);
  }
  return v;
}
const argMax = (xs) => xs.reduce((bi, v, i) => (v > xs[bi] ? i : bi), 0);
/* 'look'의 점수: 카드 i를 고른 판을 다음 카드(또는 전멸·cap틱)까지 돌린다 */
function lookScore(s, i, pol, cap) {
  const t = structuredClone(s);
  const p = pol.clone();
  C.pickCard(t, i);
  const t0 = t.tick;
  while (t.phase !== 'lost' && !C.offerOf(t) && t.tick - t0 < cap) C.step(t, p(t));
  if (t.phase !== 'lost') return 1e5 + t.squad.n;
  return C.progress(t) + (t.boss ? 1 - Math.max(0, t.boss.hp) / t.boss.max : 0);   // 전멸: 얼마나 갔나(보스에 얼마나 줬나)
}
export function makePicker(name, seed = 1, opt = {}) {
  if (name === 'first') return () => 0;
  if (name === 'men') return (s, of) => Math.max(0, of.findIndex((c) => c.k === 'men'));
  if (name === 'random') { const r = rng(seed); return (s, of) => Math.floor(r() * of.length); }
  if (name === 'think') return (s, of) => {
    const K = opt.think || THINK;
    let sc = of.map((c) => thinkScore(s, c, K));
    // 개편 판: 점수가 낮으면 다시 뽑는다(남았을 때 한 번 — 유물 카드는 뽑지 않는다)
    if (C.bldOf(s) && of[0].k !== 'relic' && Math.max(...sc) < (K.b || THINK.b).reroll && C.rerollCards(s)) { of = C.offerOf(s); sc = of.map((c) => thinkScore(s, c, K)); }
    return argMax(sc);
  };
  if (name === 'look') {
    const cap = opt.cap ?? 60 * 60 * 4;
    return (s, of, pol) => {
      const mp = opt.pol || pol;
      if (!mp || typeof mp.clone !== 'function') throw new Error("'look'에는 복제할 수 있는 이동 봇(pol.clone)이 필요해요");
      return argMax(of.map((c, i) => lookScore(s, i, mp, cap)));
    };
  }
  // 밸런스 측정용(단계 해금 기획서 7절): think에 한 가지 고집을 더한 사람 — 'one:<탄종>' 탄 효과는 그 하나만, 'nofx' 탄 효과를 안 고름(보통탄만),
  // 'unit:<병과>' 그 병과 카드가 있으면 먼저, 'relic:<id>' 그 유물이 있으면 먼저. 나머지는 think 점수대로
  const bend = (bonus) => (s, of) => argMax(of.map((c) => { const b = bonus(c); return b === -Infinity ? -1e9 : thinkScore(s, c, opt.think || THINK) + b; }));
  if (name.startsWith('one:')) { const a = name.slice(4); return bend((c) => (c.k === 'fx' ? (c.a === a ? 100 : -Infinity) : 0)); }
  if (name === 'nofx') return bend((c) => (c.k === 'fx' ? -Infinity : 0));
  if (name.startsWith('unit:')) { const u = name.slice(5); return bend((c) => (c.k === 'unit' && c.u === u ? 100 : 0)); }
  if (name.startsWith('relic:')) { const r = name.slice(6); return bend((c) => (c.k === 'relic' && c.r === r ? 100 : 0)); }
  if (name.startsWith('pref:')) {
    const order = name.slice(5).split('>');
    return (s, of) => { for (const k of order) { const i = of.findIndex((c) => c.k === k); if (i >= 0) return i; } return 0; };
  }
  // 빌드 개편 판(--build): 'b:fx:rapid>gun' — 적힌 순서로 먼저 맞는 카드(이름의 앞부분: gun · unit:rocket · fx:rapid · spec:rocket:big · hero · guard:armor · relic:heart · curse),
  // 같은 것이 여럿이면 등급 높은 것. 맞는 카드가 없으면 다시 뽑기(남았으면) 한 번, 그래도 없으면 계약이 아닌 첫 장
  if (name.startsWith('b:')) {
    const order = name.slice(2).split('>');
    const key = (c) => (c.k === 'unit' ? 'unit:' + c.u : c.k === 'fx' ? 'fx:' + c.a : c.k === 'spec' ? 'spec:' + c.u + ':' + c.b : c.k === 'hero' ? 'hero:' + c.h : c.k === 'guard' ? 'guard:' + c.g : c.k === 'relic' ? 'relic:' + c.r : c.k);
    const find = (of) => { for (const t of order) { let bi = -1, bn = 0; of.forEach((c, i) => { if (key(c).startsWith(t) && (c.n || 1) > bn) { bn = c.n || 1; bi = i; } }); if (bi >= 0) return bi; } return -1; };
    return (s, of) => {
      let i = find(of);
      if (i < 0 && of[0].k !== 'relic' && C.rerollCards(s)) { of = C.offerOf(s); i = find(of); }
      return i >= 0 ? i : Math.max(0, of.findIndex((c) => c.k !== 'curse'));
    };
  }
  throw new Error(`모르는 카드 고르기: ${name}`);
}

/* 측정 한 판(워커 풀에서 부르기 좋게 평범한 값만 주고받는다): reach()와 같은 시드 — 판 77 + 13i, 이동 봇 1000 + i, 카드 고르기 2000 + i.
   picker가 없으면(null) 카드 없는 판(opt.unl을 지운다) */
export function cardRun(i, bot, picker, co, maxSeg = 30) {
  const o = { seed: 77 + i * 13, ...co };
  if (!picker) delete o.unl;
  const r = runEndless(o, makeBot(bot, 1000 + i, { skill: true }), maxSeg, undefined, picker ? makePicker(picker, 2000 + i) : null);
  return { bosses: r.bosses, picks: r.picks || [], t: r.t, coins: r.coins, arena: r.arena };
}
/* 고른 카드 종류 분포: { men, gun, unit, ammo } (unit:medic → unit) */
export function pickHist(picks) {
  const h = {};
  for (const k of C.CARD.kinds) h[k] = 0;
  if (picks.some((p) => /^(spec|hero|guard|curse)/.test(p))) { delete h.men; delete h.ammo; }
  for (const p of picks) { const k = p.split(':')[0]; h[k] = (h[k] | 0) + 1; }
  return h;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // --set mul0=0.8,mulStep=1.1,bossM.=0.5 : ENDLESS 상수를 바꿔 본다(실험용). 'BUILD.early=2' · 'SETS.precise.v.2.p=0.3' 처럼 roster.js 표 이름으로 시작하면 그 표(개편 판의 수치)를 바꾼다
  for (const kv of (arg('set', '') || '').split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    let path = k.split('.');
    let o = C.ENDLESS;
    if (R[path[0]] && typeof R[path[0]] === 'object') { o = R[path[0]]; path = path.slice(1); }
    for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
    o[path[path.length - 1]] = Number(v);
  }
  const seeds = +arg('seeds', 24);
  const up = +arg('up', 10);
  const hero = arg('hero', 'mungchi');
  const heroLv = +arg('herolv', 5);
  const maxSeg = +arg('max', 30);
  const bots = arg('bots', 'sloppy0.1,sloppy0.3,idle,random').split(',');
  const cards = (arg('cards', '') || '').split(',').filter(Boolean);
  const unl = +arg('unl', cards.length ? 1 : 0);
  const ammoOpen = (arg('ammo', AMMO_IDS.join(',')) || '').split(',').filter(Boolean);
  const ids = (v) => (v === 'all' ? RELIC_IDS.slice() : (v || '').split(',').filter((id) => RELICS[id]));
  const relicsOpen = ids(arg('relics', 'all'));
  const hold = ids(arg('hold', ''));
  for (const name of bots) {
    for (const pk of cards.length ? cards : [null]) {
      const res = [];
      const t0 = Date.now();
      for (let i = 0; i < seeds; i++) {
        const pol = makeBot(name, 1000 + i, { skill: true });
        const o = { seed: 77 + i * 13, start: C.START_N + 2 * Math.min(up, +arg('startup', up)), fire: up, hero: hero === 'none' ? null : { id: hero, lv: heroLv } };
        if (pk && flag('build')) o.build = 2;
        if (pk) { o.unl = unl; o.ammoOpen = ammoOpen; if (unl >= 3) { o.relicsOpen = relicsOpen; o.relics = hold; } if (flag('flame')) o.flame = true; }
        res.push(runEndless(o, pol, maxSeg, undefined, pk ? makePicker(pk, 2000 + i) : null));
      }
      const b = res.map((r) => r.bosses);
      const hist = {};
      for (const x of b) hist[x] = (hist[x] | 0) + 1;
      const label = pk ? `${name.padEnd(12)} ${pk.padEnd(7)}` : name.padEnd(12);
      const ch = pk ? ` | 카드 ${Object.entries(pickHist(res.flatMap((r) => r.picks || []))).map(([k, v]) => `${k} ${v}`).join(' ')}` : '';
      // 3단계: 고른 유물(대왕 보스 뒤 — 'relic:id')
      const rh = {};
      for (const p of res.flatMap((r) => r.picks || [])) if (p.startsWith('relic:')) rh[p.slice(6)] = (rh[p.slice(6)] | 0) + 1;
      const rl = Object.keys(rh).length ? ` | 유물 ${Object.entries(rh).map(([k, v]) => `${k} ${v}`).join(' ')}` : '';
      console.log(`${label} up${up} 중앙 ${median(b)} 평균 ${(b.reduce((a, c) => a + c, 0) / b.length).toFixed(2)} 최소 ${Math.min(...b)} 최대 ${Math.max(...b)} | 분포 ${JSON.stringify(hist)} | 시간 중앙 ${Math.round(median(res.map((r) => r.t)))}초 코인 중앙 ${median(res.map((r) => r.coins))} | 경기장에서 죽음 ${res.filter((r) => r.arena).length}/${res.length}${ch}${rl} | ${Date.now() - t0}ms`);
      if (flag('trace')) for (const r of res.slice(0, 6)) console.log('   ', r.bosses, r.cause, r.arena ? 'arena' : 'run', 'ns', r.ns.join('→'), 'peak', r.peak, ...(r.picks ? ['picks', r.picks.join(',')] : []));
    }
  }
}
