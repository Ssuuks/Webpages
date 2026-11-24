/* 영웅·특수병과 명단 — 이름·소개·수치를 한곳에 둔다(시뮬레이션·화면·테스트가 함께 읽는다). DOM 없음. */

/* 특수병과: 판 안에서만 얻는다(철창 구출, 금색 게이트). 분대에 최대 3명, 병과마다 1명.
   SIM 9: 이미 있는 병과를 또 구하면 그 특수병의 레벨이 오른다(Lv1 → Lv2 → Lv3, Lv3에서 또 구하면 병사로).
   lv: 레벨별 수치 [Lv1, Lv2, Lv3] — 시뮬레이션(core.js의 SP·unitVal)과 소개 글이 함께 읽는다.
   무한모드에는 레벨 상한이 없다(core.spLvMax) — Lv4부터는 over의 규칙으로 Lv3 값에서 이어 간다(unitVal):
     ['mul', k, 바닥]  레벨마다 × k(간격 — 바닥 아래로는 안 내려간다)
     ['add', d, 끝]    레벨마다 + d(끝이 있으면 거기까지)
     ['to', 끝, k]     끝까지 남은 거리가 레벨마다 × k(끝에 닿지는 않는다)
   캠페인은 Lv3까지라 over를 읽지 않는다 */
export const SP_LV_MAX = 3;
export const UNITS = {
  medic: {
    name: '의무병', unlock: 5, color: '#FF8FB8',
    line: '다친 병사를 일으켜 세워요',
    desc: '좀비·벽·독침·톱날·보스에게 잃은 병사의 60%를 몇 초 뒤 되살려요',
    tip: '의무병 합류! 잃은 병사 일부가 다시 일어나요',
    role: '좀비·벽·독침·톱날·보스에게 잃은 병사를 몇 초 뒤 되살려요',
    lv: { share: [0.6, 0.7, 0.8] },
    over: { share: ['to', 0.95, 0.7] },
    up: (lv) => `잃은 병사의 ${pc(unitVal('medic', 'share', lv))}%를 되살려요`,
  },
  sniper: {
    name: '저격수', unlock: 9, color: '#4FD1C5',
    line: '서 있는 칸과 상관없이 멀리 있는 강적부터',
    desc: '1.2초마다 독침 좀비·거구를 먼저 저격해요. 보스전에서는 보스를 쏴요',
    tip: '저격수 합류! 독침 좀비와 거구를 먼저 노려요',
    role: '독침 좀비·거구를 먼저 저격해요. 보스전에서는 보스를 쏴요',
    lv: { every: [1.2, 0.9, 0.7], dmg: [0.35, 0.42, 0.5] },
    over: { every: ['mul', 0.88, 0.25], dmg: ['add', 0.08] },
    up: (lv) => `${unitVal('sniper', 'every', lv)}초마다 저격(위력 ${pc(unitVal('sniper', 'dmg', lv))}%)`,
  },
  rocket: {
    name: '로켓병', unlock: 13, color: '#FFB347',
    line: '뭉친 좀비에 펑!',
    desc: '2.4초마다 가장 큰 무리나 앞을 막은 벽에 범위 로켓을 쏴요',
    tip: '로켓병 합류! 몰려온 좀비 떼를 한 번에 날려요',
    role: '가장 큰 무리나 앞을 막은 벽에 범위 로켓을 쏴요',
    lv: { every: [2.4, 2, 1.7], r: [2.2, 2.6, 3] },
    over: { every: ['mul', 0.88, 0.5], r: ['add', 0.3, 5] },
    up: (lv) => `${unitVal('rocket', 'every', lv)}초마다 로켓(폭발 반경 ${unitVal('rocket', 'r', lv)}m)`,
  },
  /* 화염병(단계 해금 4단계 — 2회차 엔딩으로 열린다): 무한모드에서 화염병 줄을 연 판에만(특수병 카드·철창·금색 칸). unlock(캠페인 소개 레벨)이 없다 —
     캠페인의 철창·금색 칸 병과는 '열린 병과 중 무작위'라 병과가 늘면 캠페인 배치가 바뀐다. endless: 무한모드 전용 표시(화면이 캠페인 목록에서 뺄 때 본다).
     lv: 놓는 간격 every(초) · 지대 폭 w × 길이 len(m) · 유지 T(초) · 초당 피해 dmg(× 지금 분대 화력 D) [초안].
     horn: 짝 영웅 뭉치의 돌격 나팔 동안 지대 폭 +이만큼(화염병 레벨만큼 SYNERGY ×1·×1.25·×1.5 — 나비·보리의 짝 효과와 같은 규칙) */
  flame: {
    name: '화염병', color: '#FF5E3A', endless: true,
    line: '좀비 떼가 지나갈 길에 불바다!',
    get desc() { return `${unitVal('flame', 'every', 1)}초마다 8~20m 앞, 좀비가 가장 많이 지나갈 자리에 불 지대를 깔아요. 보스전에서는 보스 발밑에`; },
    tip: '화염병 합류! 좀비 떼가 지나갈 자리에 불을 깔아요',
    role: '좀비가 가장 많이 지나갈 자리에 불 지대를 깔아요. 보스전에서는 보스 발밑에',
    lv: { every: [2, 1.7, 1.4], w: [2, 2, 2.6], len: [4, 4, 4], T: [2, 2.5, 3], dmg: [0.25, 0.3, 0.35] },
    over: { every: ['mul', 0.88, 0.5], w: ['add', 0.3, 5], T: ['add', 0.5, 6], dmg: ['add', 0.05] },
    horn: 0.5,
    up: (lv) => `${unitVal('flame', 'every', lv)}초마다 불 지대(폭 ${unitVal('flame', 'w', lv)}m, ${unitVal('flame', 'T', lv)}초 동안 초당 위력 ${pc(unitVal('flame', 'dmg', lv))}%)`,
    pair: (lv) => `뭉치의 돌격 나팔 동안 불 지대 폭 +${pc(UNITS.flame.horn * synergyOf(lv))}%`,
  },
};
export const UNIT_IDS = Object.keys(UNITS);
/* 특수병 수치 lv[k]의 그 레벨 값. Lv1..SP_LV_MAX는 표 그대로, 그 위(무한모드)는 over의 규칙으로 Lv3 값에서 이어 간다(소수 셋째 자리까지) */
const r3 = (x) => Math.round(x * 1000) / 1000;
export function unitVal(k, key, lv) {
  const t = UNITS[k].lv[key];
  const l = Math.max(1, Math.floor(lv) || 1);
  if (l <= SP_LV_MAX) return t[l - 1];
  const base = t[SP_LV_MAX - 1], n = l - SP_LV_MAX, o = UNITS[k].over && UNITS[k].over[key];
  if (!o) return base;
  if (o[0] === 'mul') return Math.round(Math.max(o[2] ?? 0, base * Math.pow(o[1], n)) * 100) / 100;
  if (o[0] === 'add') return r3(Math.min(o[2] ?? Infinity, base + o[1] * n));
  return r3(o[1] - (o[1] - base) * Math.pow(o[2], n));
}
/* 영웅 짝 특수병(나비 ↔ 저격수, 보리 ↔ 의무병)의 레벨에 따른 짝 효과 배수 [Lv1, Lv2, Lv3] — 나비의 저격수 위력 보너스, 보리의 응급처치·괜찮아 주사 */
export const SYNERGY = [1, 1.25, 1.5];
/* Lv4부터(무한모드)는 레벨마다 +0.25, SYNERGY_MAX까지 */
export const SYNERGY_MAX = 3;
export const synergyOf = (lv) => { const l = Math.max(1, Math.floor(lv) || 1); return l <= SP_LV_MAX ? SYNERGY[l - 1] : Math.min(SYNERGY_MAX, SYNERGY[SP_LV_MAX - 1] + 0.25 * (l - SP_LV_MAX)); };

/* 영웅: 한 판에 한 명 출격. 합류는 진행 조건으로 무료, 레벨(1~5)은 코인으로 올린다.
   스킬은 게이지가 차면 버튼(또는 자동)으로 쓴다. 수치는 Lv1→Lv5 선형 — num의 [Lv1, Lv5]를 시뮬레이션(core.js)과 소개 글이 함께 읽는다.
   세 영웅은 같은 레벨이면 집중한 사람(sloppy0.1)의 승률이 ±5%p 안이 되게 맞췄다(tools/bench.mjs --hero). */
export const HEROES = {
  mungchi: {
    name: '뭉치 대장', role: '지휘', color: '#FF9F43', match: 'flame',   // 짝 특수병 화염병(무한모드 4단계 판에만 — 캠페인에는 화염병이 없다): 합류·레벨 업에 게이지, 돌격 나팔 동안 불 지대 폭(UNITS.flame.horn)
    look: '별 달린 장교 모자를 비뚤게 쓴 귤빛 단발, 바람에 날리는 노랑 스카프, 몸만 한 확성기',
    line: '목소리는 부대 최강, 용기는… 연습 중!',
    unlock: { type: 'clear', L: 2, text: '레벨 2를 깨면 합류' },
    num: { pump: [1.2, 1.4], dmg: [1.12, 1.25] },
    passive: { name: '집합 나팔', text: (lv) => `덧셈 게이트를 쏴서 올리는 속도 ×${hv('mungchi', 'pump', lv).toFixed(2)}` },
    skill: { name: '돌격 나팔', cd: 16, dur: 5, text: (lv) => `5초 동안 총알 피해 ×${hv('mungchi', 'dmg', lv).toFixed(2)} (게이트 올리기에도 적용)` },
  },
  bori: {
    name: '보리', role: '의무', color: '#FF8FB8', match: 'medic',
    look: '하트 간호모, 흰 리본으로 묶은 솜사탕빛 트윈테일, 몸보다 큰 하트 가방, 볼에 반창고',
    line: '다치면 혼나요! …그래도 다치면 바로 와요.',
    unlock: { type: 'clear', L: 8, text: '레벨 8을 깨면 합류' },
    num: { share: [0.08, 0.18], heal: [0.4, 0.55], guard: 0.5 },
    passive: { name: '응급처치', text: (lv) => `잃은 병사의 ${pc(hv('bori', 'share', lv))}%가 천천히 돌아와요(게이트 손실 제외). 의무병 레벨이 오르면 더 많이` },
    skill: { name: '괜찮아 주사', cd: 20, dur: 2.5, text: (lv) => `방금 잃은 병사의 ${pc(hv('bori', 'heal', lv))}%를 바로 되살리고, 잠깐 손실을 크게 줄여요(의무병 Lv2·Lv3이면 더 많이)` },
  },
  nabi: {
    name: '나비', role: '저격', color: '#4FD1C5', match: 'sniper',
    look: '커다란 분홍 나비 리본으로 묶은 긴 민트빛 머리, 졸린 반달눈, 키 두 배의 총',
    line: '하암… 한 발이면 돼. 깨우지 마.',
    unlock: { type: 'stars', n: 30, text: '별 30개를 모으면 합류' },
    num: { snipe: [0.08, 0.13], every: 1.8, boost: [0.15, 0.3], shot: [0.25, 0.35], shots: 8 },
    passive: { name: '나비 눈', text: (lv) => `${HEROES.nabi.num.every}초마다 직접 저격(위력 ${pc(hv('nabi', 'snipe', lv))}%). 저격수가 있으면 대신 저격수 위력 +${pc(hv('nabi', 'boost', lv))}%(저격수 Lv3이면 +${pc(hv('nabi', 'boost', lv) * SYNERGY[2])}%)` },
    skill: { name: '벌처럼 쏜다', cd: 15, dur: 3, text: (lv) => `3초 동안 강한 적을 ${HEROES.nabi.num.shots}발 연속 저격(한 발 위력 ${pc(hv('nabi', 'shot', lv))}%, 보스전 추가 피해 한도 +${10 + 2 * (Math.max(1, Math.min(HERO_MAX_LV, lv)) - 1)}%)` },
  },
};
export const HERO_IDS = Object.keys(HEROES);
export const HERO_MAX_LV = 5;          // 1회차의 레벨 상한(수치 num의 [Lv1, Lv5]가 가리키는 끝)
export const HERO_LV_PER_CYCLE = 2;    // 회차마다 상한 +2 (Lv5 → 7 → 9 …, ENDGAME.md 4절)
export const HERO_LV_HARD = 99;        // 저장·시뮬레이션이 받아들이는 가장 높은 레벨
/* 유효 레벨: Lv5까지는 레벨 그대로, 그 위는 줄어드는 폭으로(끝 9) — e(6) 5.8, e(7) 6.44, e(9) 7.36, e(11) 7.95.
   수치(선형 보간)·스킬 쿨다운·나비의 보스전 한도가 모두 이 값을 쓴다: Lv5 너머로 선형 연장하면 쿨다운이 0 아래로, 회복 몫이 한계 위로 간다 */
export function heroEff(lv) {
  const l = Math.max(1, +lv || 1);
  return l <= HERO_MAX_LV ? l : HERO_MAX_LV + 4 * (1 - Math.pow(0.8, l - HERO_MAX_LV));
}

function lerp(a, b, lv) { return a + ((b - a) * (heroEff(lv) - 1)) / (HERO_MAX_LV - 1); }
export const heroLerp = lerp;
/* 영웅 수치 num[k]의 그 레벨 값([Lv1, Lv5]면 사이를 선형으로, 숫자 하나면 그대로) */
export function heroVal(id, k, lv) { const v = HEROES[id].num[k]; return Array.isArray(v) ? lerp(v[0], v[1], lv) : v; }
const hv = heroVal;
const pc = (x) => Math.round(x * 100);

/* 영웅 레벨업 비용(Lv→Lv+1)과 진행에 따른 상한 */
export const HERO_COST = [0, 150, 300, 500, 800];
/* Lv5부터(2회차에서 풀리는 레벨)는 200·lv + 200: Lv5→6 1200, Lv6→7 1400 … */
export function heroCost(lv) { return lv >= HERO_MAX_LV ? 200 * lv + 200 : HERO_COST[lv] ?? Infinity; }
export function heroCap(maxL) { return Math.min(HERO_MAX_LV, 2 + Math.floor((Math.max(1, maxL) - 1) / 10)); }
/* 회차 c(열린 가장 높은 회차)와 그 회차의 진행(maxL)에서 새로 살 수 있는 영웅 레벨 상한: 회차마다 +2.
   앞 회차에서 다 풀린 상한(5 + 2·(c−2)) 아래로는 내려가지 않는다 — 2회차는 L21에 Lv6, L31에 Lv7 */
export function heroCapC(cycle, maxL) {
  const c = Math.max(1, cycle | 0);
  if (c === 1) return heroCap(maxL);
  const up = HERO_LV_PER_CYCLE * (c - 1);
  return Math.max(HERO_MAX_LV + up - HERO_LV_PER_CYCLE, Math.min(HERO_MAX_LV + up, up + heroCap(maxL)));
}

/* 진행으로 합류한 영웅 목록(지난 진행에도 소급) */
export function heroesEarned(maxL, stars) {
  const out = [];
  for (const id of HERO_IDS) {
    const u = HEROES[id].unlock;
    if (u.type === 'clear' && maxL > u.L) out.push(id);
    else if (u.type === 'stars' && stars >= u.n) out.push(id);
  }
  return out;
}

/* 펫(ENDGAME.md 6절): 영웅과 별개로 분대를 따라다니는 작은 동료. 한 판에 한 마리. 스스로 공격하지 않는다 —
   한 마리에 효과 하나, 효과는 '확률로 터지고' 터졌을 때의 크기는 고정, 레벨(1~10)이 올리는 것은 확률이다.
   p: [Lv1, Lv10] 확률(선형). fx: 시뮬레이션(core.js)이 보는 효과 이름.
   만렙 한 마리 = 화력 강화 두세 단계(화력 +5~10%) 상당을 목표로 식으로 어림한 수치(봇 확인은 tools/petbench.mjs) */
export const PET_MAX_LV = 10;
export const PETS = {
  fox: {
    name: '사막 여우', biome: 'desert', fx: 'crit', p: [0.02, 0.1], color: '#E8B86A',
    line: '귀가 쫑긋! 빈틈이 보여요',
    fxName: '크리티컬', text: (lv) => `총알이 ${pp('fox', lv)}% 확률로 2배 피해(보스에게도)`,
  },
  penguin: {
    name: '펭귄', biome: 'snow', fx: 'far', p: [0.07, 0.35], color: '#8FD3FF',
    line: '뒤뚱뒤뚱… 그래도 멀리 봐요',
    fxName: '멀리 쏘기', text: (lv) => `일제 사격마다 ${pp('penguin', lv)}% 확률로 그 한 번은 사거리 1.5배`,
  },
  cat: {
    name: '도시 고양이', biome: 'city', fx: 'wide', p: [0.06, 0.3], color: '#B9B4C8',
    line: '골목은 내 구역이야옹',
    fxName: '넓게 쏘기', text: (lv) => `일제 사격마다 ${pp('cat', lv)}% 확률로 양옆에 총알을 더 쏴요(폭 1.5배)`,
  },
  sprite: {
    name: '버섯 요정', biome: 'forest', fx: 'block', p: [0.04, 0.18], color: '#FF7A8A',
    line: '포자 방패, 폭신!',
    fxName: '막아 주기', text: (lv) => `병사를 잃을 때 ${pp('sprite', lv)}% 확률로 그 병사는 안 잃어요(게이트 손실 제외)`,
  },
  newt: {
    name: '불도롱뇽', biome: 'lava', fx: 'cheer', p: [0.1, 0.5], color: '#FF8A3C',
    line: '꼬리 불꽃이 활활, 기운 내!',
    fxName: '기운 내', text: (lv) => `좀비를 처치할 때 ${pp('newt', lv)}% 확률로 영웅 게이지가 30% 더 차요(무한모드 개편 판은 20%, 한 번 차면 4초 쉬어요)`,
  },
  puppy: {
    name: '풍선 강아지', biome: 'park', fx: 'coin', p: [0.05, 0.25], color: '#FF9FD0',
    line: '멍! 반짝이는 건 다 물어 와요',
    fxName: '줍줍', text: (lv) => `판이 끝날 때 ${pp('puppy', lv)}% 확률로 받는 코인이 두 배`,
  },
};
export const PET_IDS = Object.keys(PETS);
/* 그 레벨의 발동 확률(0~1) */
export function petP(id, lv) {
  const P = PETS[id];
  if (!P) return 0;
  const l = Math.max(1, Math.min(PET_MAX_LV, lv | 0 || 1));
  return P.p[0] + ((P.p[1] - P.p[0]) * (l - 1)) / (PET_MAX_LV - 1);
}
const pp = (id, lv) => Math.round(petP(id, lv) * 1000) / 10;
/* 펫 키우기: Lv → Lv+1에 드는 코인과 조각(같은 펫이 알에서 또 나오면 조각이 된다) */
export const petCost = (lv) => ({ coins: 200 * lv, shards: lv });
/* 알: 값(코인), 안 가진 펫이 남아 있을 때 새 펫이 나올 확률, 천장(이 수의 알 안에 새 펫 하나), 중복일 때 받는 조각 */
export const EGG = { price: 600, pNew: 0.4, pity: 5, shards: 3, pEndless: 0.15 };
/* 남는 펫 조각 → 코인(ENDGAME.md 31절): 최고 레벨까지 올리는 데 드는 조각보다 많은 몫만, 조각 하나에 SHARD_COIN코인(알 값 600 ÷ 조각 3 = 200의 절반) */
export const SHARD_COIN = 100;
/* 이 레벨에서 최고 레벨까지 올리는 데 드는 조각 합 */
export const petShardsToMax = (lv) => { let n = 0; for (let l = Math.max(1, lv | 0); l < PET_MAX_LV; l++) n += petCost(l).shards; return n; };
/* 팔 수 있는(남는) 조각: 가진 조각 − 최고 레벨까지 드는 조각 */
export const petSpareShards = (own) => (own ? Math.max(0, (own.sh | 0) - petShardsToMax(own.lv)) : 0);
/* 알 하나 열기(뽑기 난수는 시뮬레이션 밖 — rnd: 0~1 난수 함수). pets = { own: { id: { lv, sh } }, pity } 를 고친다.
   안 가진 펫이 있으면 pNew 확률(가진 펫이 없으면 반드시, 천장에 닿으면 반드시)로 새 펫, 아니면 가진 펫 하나의 조각 +EGG.shards — 꽝이 없다.
   돌려주는 것: { id, fresh(새 펫인가), shards } */
export function openEgg(pets, rnd = Math.random) {
  const own = Object.keys(pets.own).filter((id) => PETS[id]);
  const missing = PET_IDS.filter((id) => !pets.own[id]);
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
  if (missing.length && (!own.length || (pets.pity | 0) >= EGG.pity - 1 || rnd() < EGG.pNew)) {
    const id = pick(missing);
    pets.own[id] = { lv: 1, sh: 0 };
    pets.pity = 0;
    return { id, fresh: true, shards: 0 };
  }
  const id = pick(own);
  pets.own[id].sh = (pets.own[id].sh | 0) + EGG.shards;
  pets.pity = missing.length ? (pets.pity | 0) + 1 : 0;
  return { id, fresh: false, shards: EGG.shards };
}
/* 알 n개를 한꺼번에 열기 — openEgg를 n번 차례로 부른 것과 같다(천장·확률 그대로, 같은 난수 순서면 결과도 같다).
   돌려주는 것: { n, fresh: [새 펫 id를 나온 순서대로], shards: { id: 조각 합 }(조각이 나온 펫만, 나온 순서) } */
export function openEggs(pets, n, rnd = Math.random) {
  const out = { n: 0, fresh: [], shards: {} };
  for (let i = 0; i < n; i++) {
    const r = openEgg(pets, rnd);
    out.n++;
    if (r.fresh) out.fresh.push(r.id);
    else out.shards[r.id] = (out.shards[r.id] | 0) + r.shards;
  }
  return out;
}

/* 탄종(ARSENAL.md 3절 '별 무기고'): 모은 별(모든 회차 합)이 stars를 넘으면 열리고, 출격 전에 하나를 고른다. 별은 쓰지 않는다.
   강화가 아니라 맞바꿈이다 — 어느 탄종이든 전체 승률은 보통탄과 비슷하고 잘 맞는 상황이 다르다(tools/ammobench.mjs).
   dmg: 한 발 피해 배수, range: 사거리(m, 없으면 기본 30), pierce: 좀비를 맞힌 뒤 바로 뒤 좀비 하나에 주는 몫,
   splash·r: 좀비에 맞으면 둘레 r(m)의 다른 좀비에 주는 몫, slow·T: 맞은 좀비가 T초 동안 느려지는 몫(보스는 안 느려진다) */
/* 42절: 별 문턱을 당겼다 — 캠페인 탄 20·40·70·100, 무한모드 탄 130·160·190, 총 50·90(한 회차 별 180개 — 2회차 중반이면 다 열린다) */
export const AMMO = {
  pierce: { name: '관통탄', stars: 20, dmg: 0.96, pierce: 0.6, color: '#F4F7FF' },
  burst: { name: '작렬탄', stars: 40, range: 27, splash: 0.35, r: 1, color: '#FFB347' },
  rapid: { name: '속사탄', stars: 70, dmg: 1.15, range: 24, color: '#FFE38A' },
  frost: { name: '빙결탄', stars: 100, dmg: 0.97, slow: 0.25, T: 0.8, color: '#8FD3FF' },
  // 24절 새 탄(개편 판 무한모드만 — b2): 출격 탄종 화면에는 '무한모드 전용'으로, 캠페인 출격에는 안 든다(보통탄으로). 효과는 fx2Val
  shock: { name: '전격탄', stars: 130, chain: 0.4, color: '#D6CCFF', b2: true },
  acid: { name: '부식탄', stars: 160, acid: 0.03, color: '#9BE36B', b2: true },
  cure: { name: '치료탄', stars: 190, cure: 0.04, color: '#FF8FB8', b2: true },
};
/* 소개 글(좋은 점 · 대신 잃는 점)은 수치에서 만든다 — 수치를 고치면 글도 따라간다 */
const apc = (x) => Math.round(x * 100);
export function ammoText(id) {
  const A = AMMO[id];
  if (!A) return { good: '기본 총알', bad: '' };
  if (A.b2) return { good: A.chain ? '맞은 좀비에서 옆 좀비로 번개가 튀어요(무한모드 전용)' : A.acid ? '맞은 것에 부식이 쌓여 계속 피해를 줘요 — 벽·보스에 강해요(무한모드 전용)' : '잡은 좀비 일부가 사람으로 돌아와 병력이 늘어요(무한모드 전용)', bad: '' };
  const good = A.pierce ? `좀비를 뚫고 뒤의 좀비 하나에 ${apc(A.pierce)}% 더`
    : A.splash ? `좀비에 맞으면 둘레 ${A.r}m에 ${apc(A.splash)}% 더`
      : A.slow ? `맞은 좀비가 ${A.T}초 동안 ${apc(A.slow)}% 느려져요`
        : `화력 +${apc(A.dmg - 1)}%`;
  const bad = [A.dmg < 1 ? `한 발 피해 −${apc(1 - A.dmg)}%` : '', A.range ? `사거리 30 → ${A.range}m` : ''].filter(Boolean).join(', ');
  return { good, bad };
}
export const AMMO_IDS = Object.keys(AMMO).filter((a) => !AMMO[a].b2);   // 캠페인·앞 단계 판의 탄종 넷(해시·지문 그대로)
export const AMMO_IDS2 = Object.keys(AMMO);   // 개편 판(build: 2)의 탄 일곱(24절)
/* 그 별 수로 열린 탄종 */
export const ammoOpen = (id, stars) => !!AMMO[id] && stars >= AMMO[id].stars;

/* 탄 효과(무한모드 빌드 단계 해금 2단계 — 무한모드에서만): 탄종의 '좋은 점'만 떼어 낸 것. 보스 뒤 카드·탄종 상자로 얻고, 같은 효과를 또 얻으면 레벨 +1(상한 없음).
   LvN = 그 탄종 값의 fxK(N) = 0.5·N배(Lv1·2·3 = 50·100·150% — FX_LV, 그 위로도 레벨마다 +50%p) [초안].
   빙결만 Lv4부터 느려지는 몫이 1(멈춤)에 닿지 않게 남은 거리를 레벨마다 × FROST_OVER로 줄인다(Lv3 37.5% → Lv4 46.9% → Lv5 54.8% …). 대신 쪽(피해·사거리)은 없다 — 출격 때 고른 탄종(s.ammo)만 Lv2로 한 칸을 차지하고 대신 쪽을 그대로 진다.
   슬롯 FX_SLOTS칸(같은 효과는 한 칸). 수치는 AMMO에서 — 탄종 수치를 고치면 효과도 따라간다 */
export const FX_LV = [0.5, 1, 1.5];
export const FX_LV_SOFT = FX_LV.length;   // 표(FX_LV)가 있는 끝 레벨 — 상한이 아니다(화면이 Lv3부터 칩을 금빛으로 칠할 때·빙결의 꺾이는 자리)
export const FROST_OVER = 0.85;
export const FX_SLOTS = 2;
export const FX_BASE_LV = 2;   // 출격 탄종이 차지하는 레벨
export const fxK = (lv) => 0.5 * Math.max(1, Math.floor(lv) || 1);
/* 그 레벨의 좋은 점: { pierce } | { splash, r } | { dmg }(화력 배수) | { slow, T } */
export function fxVal(id, lv) {
  const A = AMMO[id];
  const k = fxK(lv);
  if (!A) return {};
  if (A.pierce) return { pierce: A.pierce * k };
  if (A.splash) return { splash: A.splash * k, r: A.r };
  if (A.slow) {
    const top = A.slow * fxK(FX_LV_SOFT);
    return { slow: k <= fxK(FX_LV_SOFT) ? A.slow * k : 1 - (1 - top) * Math.pow(FROST_OVER, Math.max(1, Math.floor(lv)) - FX_LV_SOFT), T: A.T };
  }
  return { dmg: 1 + (A.dmg - 1) * k };
}
/* 소개 글(카드·일시정지 판) — '뒤의 좀비 하나에 30%'처럼 수치에서. 반올림은 소수 넷째 자리에서 먼저 끊는다
   (0.15 × 0.5 = 0.0749999…라 그냥 반올림하면 +8%가 아니라 +7%가 된다 — 기획서 표의 값과 맞게) */
const fpc = (x) => Math.round(Math.round(x * 1e6) / 1e4);
export function fxText(id, lv) {
  const v = fxVal(id, lv);
  return v.pierce ? `뒤의 좀비 하나에 ${fpc(v.pierce)}%` : v.splash ? `둘레 ${v.r}m에 ${fpc(v.splash)}%` : v.slow ? `${v.T}초 동안 ${fpc(v.slow)}% 느리게` : v.dmg ? `화력 +${fpc(v.dmg - 1)}%` : '';
}

/* 시너지(탄 효과 × 탄 효과 · 특수병 · 영웅 — 둘이 함께 있을 때만 켜지는 추가 규칙, 단계 해금 2단계) [수치는 초안].
   need: 함께 있어야 하는 것(탄종 id = 그 탄 효과(출격 탄종이든 카드든), 병과 id = 그 특수병(레벨 상관없이), 영웅 id = 출격 영웅).
   v: 수치(frostSniper 위력 배수 덧셈, burstRocket 반경 덧셈 m, rapidMungchi 스킬 길이 초, frostFlame 불 지대 피해 배수 덧셈). SYNERGY는 영웅 짝 배수의 이름이라 다른 이름 */
export const COMBOS = {
  pierceBurst: { need: ['pierce', 'burst'], name: '연쇄 폭발', text: () => '뚫고 지난 뒤 좀비에서도 터져요' },
  frostSniper: { need: ['frost', 'sniper'], name: '얼음 조준', v: 0.5, text: () => `느려진 적에게 저격 위력 +${apc(COMBOS.frostSniper.v)}%` },
  burstRocket: { need: ['burst', 'rocket'], name: '대폭발', v: 0.4, text: () => `로켓 폭발 반경 +${COMBOS.burstRocket.v}m` },
  pierceSniper: { need: ['pierce', 'sniper'], name: '꿰뚫는 저격', text: () => '저격이 일직선 뒤 표적 하나를 더 뚫어요' },
  rapidMungchi: { need: ['rapid', 'mungchi'], name: '긴 나팔', v: 7, text: () => `돌격 나팔 ${HEROES.mungchi.skill.dur} → ${COMBOS.rapidMungchi.v}초` },
  // 4단계(화염병 줄을 연 판에만 재료가 생긴다): v = 느려진 적이 불 지대에서 받는 피해 배수 덧셈
  frostFlame: { need: ['frost', 'flame'], name: '얼음불', v: 0.25, text: () => `언 적이 불 지대에서 받는 피해 +${apc(COMBOS.frostFlame.v)}%` },
};
export const COMBO_IDS = Object.keys(COMBOS);

/* 장애물(단계 해금 2단계 — 2단계를 연 무한모드 판의 4구간부터, core.js RUN_ORDER.obstacle) [수치는 초안]. 보통탄만으로도 넘을 길은 늘 있고,
   탄 효과는 '더 쉬운 길'을 연다. 화면에 보이는 수치는 여기에 두고 core.js가 읽는다(글도 이 값에서 — 수치를 고치면 글도 따라간다). 자리·개수는 core.js OBST.
   - door 장갑문: 갈림길 위험한 쪽의 셋째 패턴(벽 · 좀비 떼 · 장갑문). 체력 = 벽 식 × hp. 받는 피해 배수 — gun 보통 총알, pierce 관통 효과(레벨 상관없이),
     burst 작렬 효과(Lv2 = 탄종 값 100%에서 이 값, Lv1은 gun과의 사이 값, Lv3도 이 값까지), rocket 로켓. 가진 효과 중 가장 큰 배수
   - drum 폭발 드럼통: 부서지거나 분대가 닿으면 반경 r m 안의 좀비에게 지금 분대 화력 dmg초 몫, 반경 안의 상자·철창은 내용물째 부서진다. 분대는 안 다친다
   - shield 방패 정예(셋째 정예, 청록): 정면 총알 피해 gun배 — 관통 효과가 있으면 제 피해. 작렬 둘레·저격·로켓·영웅 스킬·드럼통은 제 피해 */
export const OBSTACLES = {
  door: { name: '장갑문', hp: 0.6, gun: 0.5, pierce: 1, burst: 1.5, rocket: 1.5, text: () => `보통 총알은 ${apc(OBSTACLES.door.gun)}%만 들어가요. 관통·작렬·로켓이 잘 뚫어요` },
  drum: { name: '폭발 드럼통', r: 2.5, dmg: 1.5, text: () => `쏘면 터져서 둘레 ${OBSTACLES.drum.r}m 좀비를 날려요. 옆 상자도 같이 부서져요` },
  shield: { name: '방패 정예', gun: 0.3, color: '#3FE0D0', text: () => `정면 총알을 ${apc(1 - OBSTACLES.shield.gun)}% 막아요. 관통·작렬·저격·로켓은 그대로 들어가요` },
};
export const OBSTACLE_IDS = Object.keys(OBSTACLES);

/* 유물(단계 해금 3단계·5단계 — 무한모드에서만, 대왕 보스 뒤 3개 중 1개, 한 판에 3개까지). 수치가 아니라 규칙을 바꾼다 [수치는 초안].
   화면에 보이는 수치·글은 여기에 두고 core.js가 읽는다(글은 이 값에서 — 수치를 고치면 글도 따라간다). 규칙은 core.js relicOn을 보는 곳들.
   kings: 열리는 때 — 0이면 3단계(첫 대왕)와 함께, n이면 대왕 누적 n번째 처치에(5단계). 순서는 열리는 순서(유물 카드도 이 순서로 보인다).
   text(): 좋은 점, cost(): 대신 쪽('' = 없음). good·bad는 예전 이름(같은 글).
   - compass 나침반: 갈림길 위험한 쪽 보상 상자의 속이 ahead m 앞에서 보이고(갈림길 알림과 같은 거리 — core.js MARK_AHEAD), 그 상자의 병사 ×v(지원병 v배,
     무기·탄종 상자·철창이 얻을 수 없어 병사로 바뀔 때도 v배 — 무기 단계·탄 효과 레벨·특수병 합류는 한 칸이라 그대로)
   - dice 재굴림 주사위(빌드 개편 판만 — 다시 뽑기가 있는 판): 얻는 즉시 다시 뽑기 +n번, 그 뒤 대왕을 잡을 때마다 다시 뽑기 +(1 + king)번(없을 때는 +1)
   - megaphone 빨간 확성기: 빨간 덧셈 칸(−로 시작한 칸)이 red배 빨리 오른다 — 대신 파란 칸은 blue배
   - coil 과부하 코일: 무기 단계 상한 3 → tier(core.js WEAPON의 다섯째 값) — 대신 지원병 상자 병력 ×men
   - fourth 넷째 자리: 특수병 자리 3 → slots — 대신 특수병마다 호위 병사 4 → escort명(병과가 자리보다 많은 판에만 나온다 — 지금 세 병과로는 넷째 자리가 빈다)
   - pledge 부활 서약(빌드 개편 판만 — 쓰러진 특수병이 돌아오는 판): 보스를 잡으면 쓰러진 특수병이 레벨의 BUILD.spBack 몫이 아니라 제 레벨로 돌아온다
   - ward 방패막: 구간마다 처음 닿은 톱날 하나(그 구간 안에서는 그 톱날)와 처음 맞은 독침 중 먼저 온 한 번의 피해를 막는다(core.js wardBlock)
   - bag 수집가의 가방: 대왕이 아닌 보스의 알 확률 EGG.pEndless → egg(화면 쪽 뽑기 — core.js eggP) — 대신 보스 뒤 카드 3장 → cards장
   - pouch 넓은 탄낭: 탄 효과 슬롯 FX_SLOTS → slots — 대신 증원 카드가 나오지 않는다(얻을 수 있는 탄 효과가 슬롯보다 많은 판에만 나온다) */
/* 24절: 개편 판(build: 2) 유물에는 '대신'이 없다(cost()는 앞 단계 판에서만 든다 — core.relicCost). 수집가의 가방은 개편 판에 안 나온다(알은 판 밖 보상 — 자리는 전리품 자루).
   tribe: 갈래(빌드 build · 성장 grow · 보스 boss · 지형 land · 운 luck · 생존 live) — 셋 중 하나 고르기에 같은 갈래는 둘까지(core.relicOfferB). b2: 개편 판에만 나온다.
   - loot 전리품 자루: 보스 뒤 카드 CARD.count → +n장 · scope 황금 조준경: 덧셈 칸을 쏘아 올리는 폭 ×v · resonator 공명기: 짝 효과 ×v, 하나 모자란 짝(수치형)도 half의 힘으로
   - drum 진격 북: 보스전에 들어가면 영웅 게이지 가득, 보스전 동안 특수병 쿨다운 ×cd · charge 폭약 배낭: 벽·장갑문이 무너지면 둘레 r m 좀비에게 그 벽 최대 체력 × v
   - ladder 사다리: 구간마다 한 번 칸막이·갈림길 분리대를 넘는다 · lucky 행운의 동전: 행운 길 p로 잦아지고 상자가 한 단계 위로(대는 병력 +big 더)
   - manual 훈련 교본: 같은 대상(탄·특수병·총 Lv)을 every번 고를 때마다 한 레벨 더 */
const LANES_LUCK_P = 0.35;   // core LANES.luckP(행운 길 기본 확률 — 행운의 동전 글에만, tests/endgame.mjs가 같은지 본다)
export const RELICS = {
  compass: { name: '나침반', kings: 0, tribe: 'luck', ahead: 45, v: 1.5, text: () => `갈림길 상자 속이 ${RELICS.compass.ahead}m 앞에서 보이고, 위험한 쪽 상자 병사 ×${RELICS.compass.v}`, cost: () => '' },
  dice: { name: '재굴림 주사위', kings: 0, tribe: 'build', n: 3, king: 1, text: () => `카드 다시 뽑기를 지금 ${RELICS.dice.n}번 더, 대왕을 잡을 때마다 ${1 + RELICS.dice.king}번씩 더 받아요`, cost: () => '' },
  megaphone: { name: '빨간 확성기', kings: 0, tribe: 'grow', red: 1.5, blue: 0.8, text: () => `빨간(−) 게이트를 쏘면 숫자가 ${RELICS.megaphone.red}배 빨리 올라요`, cost: () => `파란(+) 게이트는 ${RELICS.megaphone.blue}배로 느리게` },
  coil: { name: '과부하 코일', kings: 0, tribe: 'build', tier: 4, men: 0.7, text: () => `총 ★을 한 칸 더 올릴 수 있어요(★ 상한 +1)`, cost: () => `지원병 상자의 병사 −${apc(1 - RELICS.coil.men)}%` },
  loot: { name: '전리품 자루', kings: 1, tribe: 'build', b2: true, n: 1, text: () => `보스를 잡은 뒤 고르는 카드가 3장 → ${3 + RELICS.loot.n}장`, cost: () => '' },
  scope: { name: '황금 조준경', kings: 1, tribe: 'grow', b2: true, v: 1.5, text: () => `게이트를 쏘면 숫자가 ${RELICS.scope.v}배 빨리 올라요`, cost: () => '' },
  fourth: { name: '넷째 자리', kings: 2, tribe: 'build', slots: 4, escort: 6, text: () => `특수병을 3명 → ${RELICS.fourth.slots}명까지 데려가요`, cost: () => `특수병 한 명마다 필요한 병사 4 → ${RELICS.fourth.escort}명` },
  resonator: { name: '공명기', kings: 2, tribe: 'build', b2: true, v: 1.5, half: 0.5, text: () => `시너지(🔗)가 ${RELICS.resonator.v}배 세지고, 짝 하나만 있어도 절반 힘으로 켜져요`, cost: () => '' },
  pledge: { name: '부활 서약', kings: 3, tribe: 'live', text: () => `쓰러진 특수병이 보스 뒤에 레벨 그대로 돌아와요(원래는 ${apc(BUILD.spBack)}%로 깎여요)`, cost: () => '' },
  drum: { name: '진격 북', kings: 3, tribe: 'boss', b2: true, cd: 0.7, text: () => `보스전이 시작되면 영웅 스킬이 바로 준비되고, 특수병 대기 시간 −${apc(1 - RELICS.drum.cd)}%`, cost: () => '' },
  bag: { name: '수집가의 가방', kings: 4, tribe: 'luck', egg: 0.35, cards: 2, text: () => `일반 보스의 알 확률 ${apc(EGG.pEndless)} → ${apc(RELICS.bag.egg)}%`, cost: () => `카드 3장 → ${RELICS.bag.cards}장` },
  charge: { name: '폭약 배낭', kings: 4, tribe: 'land', b2: true, r: 3, v: 0.3, text: () => `벽·장갑문이 무너질 때 터져서 둘레 ${RELICS.charge.r}m 좀비에게 벽 체력의 ${apc(RELICS.charge.v)}% 피해`, cost: () => '' },
  ladder: { name: '사다리', kings: 4, tribe: 'land', b2: true, text: () => '구간마다 한 번, 칸막이·갈림길 벽을 넘어 옆 칸으로 가요(밀면 넘어가요)', cost: () => '' },
  pouch: { name: '넓은 탄낭', kings: 5, tribe: 'build', slots: 3, text: () => `탄 효과를 ${FX_SLOTS}개 → ${RELICS.pouch.slots}개까지 가질 수 있어요`, cost: () => '병력을 늘리는 증원 카드가 안 나와요' },
  ward: { name: '방패막', kings: 5, tribe: 'live', text: () => '구간마다 톱날에 처음 닿을 때·독침에 처음 맞을 때는 병사를 안 잃어요', cost: () => '' },
  lucky: { name: '행운의 동전', kings: 6, tribe: 'luck', b2: true, p: 0.6, big: 0.2, text: () => `? 상자가 한 단계 좋게 열리고(대는 병사 +${apc(RELICS.lucky.big)}%), ? 상자 길이 ${apc(LANES_LUCK_P)} → ${apc(RELICS.lucky.p)}%로 잦아요`, cost: () => '' },
  manual: { name: '훈련 교본', kings: 7, tribe: 'build', b2: true, every: 3, text: () => `같은 탄·특수병·총 카드를 ${RELICS.manual.every}번 고를 때마다 레벨이 하나 더 올라요`, cost: () => '' },
};
export const RELIC_TRIBE = { build: '빌드', grow: '성장', boss: '보스', land: '지형', luck: '운', live: '생존' };
export const RELIC_IDS = Object.keys(RELICS);

/* 적 변이(ENDGAME.md 18.6 — 빌드 개편 판의 무한모드): 대왕(6구간마다)을 잡으면 다음 바퀴의 변이가 무작위로 정해지고 바로 알려진다. 판 끝까지 쌓인다.
   직전에 나온 것과 같은 변이는 안 나오고, 이미 한 번 나온 변이가 또 나오면 2단계로 세진다(v·n·hp·cd의 둘째 값). 수치는 모두 [초안].
   - armor 장갑: 일반 좀비 절반이 정면 총알을 v배만 받는다(관통 탄 효과면 제 피해 — 방패 정예와 같은 규칙). 작렬 둘레·저격·로켓·영웅 스킬은 제 피해
   - swarm 떼거리: 좀비 무리가 n배, 하나하나의 체력은 hp배(무리 전체 체력은 n × hp배로 늘고, 닿아서 잃는 병사도 는다)
   - rush 질주: 좀비가 v배 빠르다
   - rage 분노한 보스: 보스 체력 ×hp, 내려찍기·졸개 소환 간격 ×cd
   - thick 두꺼운 벽: 벽·장갑문 체력 ×v
   - fog 독안개: 길 가장자리(가운데에서 FOG_X m 밖)에 있으면 병력이 초당 v씩 준다 */
export const FOG_X = 2.6;
export const MUTATIONS = {
  armor: { name: '장갑', v: [0.3, 0.2], text: (lv) => `일반 좀비 절반이 정면 총알을 ${apc(MUTATIONS.armor.v[lv - 1])}%만 받아요 — 관통탄·작렬·저격이 잘 뚫어요` },
  swarm: { name: '떼거리', n: [2, 3], hp: [0.7, 0.6], text: (lv) => `좀비 무리가 ${MUTATIONS.swarm.n[lv - 1]}배, 하나하나의 체력은 ${apc(MUTATIONS.swarm.hp[lv - 1])}% — 작렬·화염병이 잘 막아요` },
  rush: { name: '질주', v: [2, 2.6], text: (lv) => `좀비가 ${MUTATIONS.rush.v[lv - 1]}배 빨라요 — 빙결·로켓이 잘 막아요` },
  rage: { name: '분노한 보스', hp: [1.5, 1.8], cd: [0.8, 0.7], text: (lv) => `보스 체력 ×${MUTATIONS.rage.hp[lv - 1]}, 공격 간격 ${apc(MUTATIONS.rage.cd[lv - 1])}% — 속사·저격이 잘 막아요` },
  thick: { name: '두꺼운 벽', v: [1.5, 1.9], text: (lv) => `벽·장갑문 체력 ×${MUTATIONS.thick.v[lv - 1]} — 관통·총 ★이 잘 막아요` },
  fog: { name: '독안개', v: [0.055, 0.075], text: (lv) => `길 가장자리(가운데에서 ${FOG_X}m 밖)에서 병력이 초당 ${apc(MUTATIONS.fog.v[lv - 1])}% 줄어요 — 의무병이 잘 막아요` },
};
export const MUT_IDS = Object.keys(MUTATIONS);
export const MUT_MAX_LV = 2;
for (const id of RELIC_IDS) Object.defineProperties(RELICS[id], { good: { get() { return this.text(); } }, bad: { get() { return this.cost(); } } });

/* ---------- 무한모드 빌드 개편(ENDGAME.md 16절 — s.endless.bld가 있는 판에만) ----------
   카드가 곱으로 쌓인다: 화력 = 병력 × 무기 개조 × 탄 효과 × 특수병. 증원은 카드가 아니라 보스마다 자동 보급(BUILD.supply).
   수치는 모두 초안 — 봇으로 잰 값은 ENDGAME.md 16절 */
export const BUILD = {
  supply: { '': 0.2, hard: 0.2, super: 0.5 },   // 보스를 잡으면 자동 보급: 병력 +이만큼(대왕은 더)
  gun: 0.03,            // 무기 개조: 총알 화력 +3% × 유효 레벨(위협 식에 안 들어간다)
  w: { gun: 1, unit: 1, fx: 1 },   // 카드 종류가 나올 가중치
  bk: { on: true, mul: 1.5, gain: 0.2 },   // 덧셈 칸 = 구간 기준 병력 B(k) = segFloor(k) × mul에 비례(18.8 — 순간 병력이 아니다). gain: 만들 때 + 칸의 이득 축소(예전 ENDLESS.gk — 개편 판은 이 값을 쓴다; 없애면 골든 패스가 커져 보스가 세지고 도달 구간이 28 → 13으로 떨어졌다)
  thr: { from: 4, step: 1.03 },   // 24절: 23·24절 뒤(7구간부터 모든 보스가 강화판 · 대왕 체력 ×1.5 · 새 탄·유물 — 1.04에서 25.3, 32판) 1.03 → 28.5. 20절: 로켓·벽·각성·전설 뒤 1.06 → 34.7 · 1.08 → 26.8, 그 뒤 18구간 골든 패스 무너짐을 고치고(20.1) 좁은 몸(20.2)을 넣자 1.08 → 14.0 · 1.06 → 22.1 · 1.04 → 28.1(16판 think — 손보기 전 1.06에서 26.9)
    // 측정(32판 think/아무거나): 세트·깊이 보상을 없앤 뒤 1.0 → 40.3/34.4 · 1.03 → 31.3/27.7 · 1.06 → 26.6/22.8 · 1.085 → 21.6/18.3. 1.06으로 25 근처(ENDGAME.md 18.4)
  early: 1,             // 앞 구간의 위협을 실제 강화(ENDLESS.fire를 넘는 몫)로 만드는 구간 수(bldFe — 1구간은 전부, early구간에 기준으로 돌아간다. ENDGAME.md 19.1)
  earlyK: 0.75,         // 그 구간에서 강화가 기준을 넘는 몫을 얼마나 따라가나(1 = 전부 — 첫 구간이 너무 빡빡해 집중한 사람도 무너진 값)
  evo: 5,               // 탄 효과가 진화하는 레벨
  awakeFrom: 7,         // 각성(Lv6~10)·숙련이 열리는 구간(첫 대왕 뒤 — 예전 13: Lv5에 너무 일찍 닿아 성장이 멈춘 느낌이었다, ENDGAME.md 20절). 그 전에는 Lv5가 상한
  awk: 0.15,            // 각성 Lv6~9: 그 역할의 값 레벨마다 +15%, Lv10은 2차 진화
  mastery: 0.1,         // 숙련(Lv10 위, 끝없음): 같은 카드를 또 고를 때마다 그 대상 효과 +10%(더한다 — 예전 +4%는 거의 안 느껴졌다, ENDGAME.md 21.10)
  legendUp: 0.0003,   // 34절: 0.0015 → 0.0003(전설은 판에 하나 볼까 말까)     // 6구간 뒤로 구간마다 전설 확률 +0.15%p(일반에서 가져온다 — 후반일수록 전설이 오른다), legendMax: 최대 +이만큼(예전 +1%p·최대 15%p — ENDGAME.md 20절)
  legendMax: 0.004,
  rare: [0.9, 0.097, 0.003],   // 34절: 전설 0.01 → 0.003 — 전설이 새 규칙(진화 미리보기가 아니라)으로 세져서 판에 하나 볼까 말까로    // 카드 등급(일반·희귀·전설) 확률 — 예전 0.72·0.23·0.05에 정예·대왕 뒤 카드가 모두 희귀 이상이라 너무 흔했다(20절)
  tagRare: { hard: [0, 0.97, 0.03], super: [0, 0.88, 0.12] },   // 34절: 15·40% → 3·12%   // 정예·대왕 보스 뒤 첫 카드의 첫 (총이 아닌) 장만 이 확률(희귀 이상), 나머지 자리는 rare. 등급은 다시 뽑기로 안 바뀐다
  own: 3,               // 이미 가진 것(탄 효과·특수병)의 카드가 나올 가중치
  fxLocked: 0.5,        // 39.7: ★로 아직 안 연 탄(판 안에서는 나온다)의 새 효과 카드 가중치
  reroll: 1,            // 판마다 다시 뽑기 횟수(대왕을 잡을 때마다 +1)
  curse: { p: 0.18, mul: 1.25, more: 2, from: 2 },   // 위험한 계약: from번째 보스 뒤부터 p 확률로 한 장 — 다음 구간 위협 ×mul, 대신 카드 more장 더
  relicMax: 5,          // 한 판 유물 수(예전 3)
  relicFrom: 3,         // 이 구간부터 정예·대왕 보스 뒤에 유물(예전 6 — 대왕만)
  pouch: 4,             // 넓은 탄낭의 슬롯(예전 3 — 증원 카드가 없어 대신 쪽도 없다)
  // 특수병 위력(쉽게 쓰러지는 만큼 세게): dmg 배수 × (1 + lv·(레벨 − 1)). 의무병은 레벨마다 좀비·보스에게 잃는 병사 ÷(1 + med·레벨), 회복 +50%
  sp: { sniper: { dmg: 3, lv: 0.72 }, rocket: { dmg: 0.8, lv: 0.062 }, flame: { dmg: 2, lv: 0.31 } },   // 33절: 로켓 1 → 0.8(높은 레벨에서 피해 몫 46% — 화면을 덮었다)   // lv: 레벨(−1)마다 위력 +이만큼(깊이 보상 deep()을 없애며 Lv5 값이 그대로이도록 deep(4)/4 ≈ 2.05배)
  med: 0.048,           // 의무병 레벨마다 좀비·보스에게 잃는 병사 ÷(1 + med × 레벨)(깊이 보상을 없애며 Lv5 값이 그대로이도록 올렸다)
  spBoss: 0.06,         // 특수병 레벨 1당 보스전 추가 피해 한도(예전 0.02)
  spCrate: 0.3,   // 37절: 개편 판 저격수가 상자·철창을 칠 때 몫(저격은 한 발이 커서 그대로면 상자가 바로 녹는다)
  rocket: { cd: 0.6, speed: 55, wallZ: 26, wall: 3, twin: 0.6, fire: { w: 1, T: 1.2, d: 0.25 } },   // fire: 불씨 로켓(Lv10)의 불 지대 — 폭 반경×w, T초, 초당 로켓 피해×d(34절: 예전 1.6·2·0.4)   // twin: Lv5 쌍발의 둘째 로켓 피해 몫(33절 — 예전 1)
  wall: { from: 6, cut: 0.6, lo: 0.05 },   // cut 0.5 → 0.6(20.1 뒤 — 25구간~ 벽 파괴율이 40%로 내려갔다)
  bossHp: { from: 7, k: 0, max: 2.5, king: 1.5 },   // king: 대왕 체력 ×(23.4 — 문턱 셋을 지나며 특수 패턴 넷을 다 보여 주려면 대왕전 12~18초가 필요하다)   // 개편 판 보스 체력 덧배수 = min(max, 1 + k × (구간 − from + 1)). 보스전이 3초 안팎(후반 0.5초)으로 끝났던 진짜 까닭은 18구간쯤부터 골든 패스가 무너진 것(20.1) — 고친 뒤 보스전이 6~12초라 k = 0(손잡이만 남김)
  narrow: 1.4,          // 개편 판 분대 몸 반지름 상한(보통 2.4 — 몸 폭 4.8m가 세 칸 길(3.3m)에 안 들어갔다. 1.4면 맞는 폭 ±1.28m — ENDGAME.md 20.2)
  bossPat: { order: ['slam', 'volley', 'line', 'charge', 'wide'], phase: [0.75, 0.5, 0.25], calm: 0.8, first: 0.2, stagger: 0.6, slam2: 1.25, cdFloor: 0.6 },   // 보스 패턴 배정(ENDGAME.md 23절): 1바퀴 순서(order) · 대왕 문턱(phase — 체력 비율) · 문턱 뒤 숨 고르기 calm초 · 새 패턴은 그 뒤 first초 · 두 특수 패턴은 stagger초 안에 함께 시작하지 않는다 · 둘이 켜지면 바탕 내려찍기 간격 ×slam2 · 다시 쓰기 하한 = 원래 cd × cdFloor   // 보스 패턴 수(BOSS_PAT)   // 개편 판 벽·장갑문 체력 ×(위협 배수 / from구간의 위협 배수)^−cut(lo 아래로는 안 내려간다) — 위협 곡선을 덜 따라간다(ENDGAME.md 20절)   // 개편 판 로켓병(ENDGAME.md 20절): 간격 ×cd, 날아가는 속도(m/s — 보통 30), 분대 통로를 막은 벽이 wallZ m 안이면 무리보다 먼저, 벽·장갑문 피해 ×wall
  spBack: 0.5,          // 쓰러진 특수병은 다음 구간에 이 몫의 레벨로 돌아온다(내림, 최소 Lv1)
};
export const RARITY = ['', '일반', '희귀', '전설'];
/* 개편 판 보스 패턴(ENDGAME.md 20절): 내려찍기·졸개 소환에 더해 보스마다 몇 개를 더 쓴다. 어느 것을 쓰는지는 시드·구간으로 정해진다(core.bossPats).
   보통 보스 n[''], 정예 n.hard, 대왕 n.super개, more구간부터 하나 더. from구간 전 보스는 없다. cd: 다시 쓰기까지 초(첫 번째는 first초 뒤) [수치는 초안]
   - volley 독침 세례: 보스가 독침 n발을 gap초마다 그때 분대가 선 자리에 던진다(내려찍기 예고 중에는 던지지 않는다 — 피할 곳이 남게). 맞으면 병력의 hit(길 독침 좀비의 30%보다 작게)
   - wide 넓은 내려찍기: 내려찍기 두 번에 한 번은 세 칸 중 두 칸을 한꺼번에(예고는 피하는 데 드는 시간 + pad초)
   - double 연속 내려찍기: 내려찍은 뒤 then초 만에 지금 선 칸을 한 번 더(예고 시간은 공정성 규칙 그대로)
   - charge 돌진: warn초 숨을 고른 뒤 dash초 동안 dist m 뛰어든다(분대에 닿기 전에서 멈춘다)
   - line 좀비 장벽: 길을 가로지르는 졸개 n마리 줄(빈틈 하나 — 분대가 없는 쪽), 체력은 소환 졸개 × hp */
/* 23절: 배우는 패턴은 다섯(slam 내려찍기 + 특수 넷). 연속 내려찍기(double)는 따로 배울 패턴이 아니라 내려찍기의 간격 단축 강화판(up 1)이다.
   강화(up — 비트): 1 간격 단축(gap) · 2 범위 확대(range) · 3 둘 다. 강화해도 지키는 것: 장벽 빈틈 gap m · 돌진 숨 고르기 warn초 · 넓은 내려찍기의 안전 칸 하나
   - slam: 간격 = 0.3초(then) 뒤 지금 선 칸을 한 번 더(예전 double) · 범위 = 띠가 칸 경계를 ext m 넘는다(예고는 공정성 규칙이 넓어진 거리로)
   - volley: 간격 = gap2초 간격·다시 쓰기 cd2초 · 범위 = n2발, 떨어지는 폭 ×r2
   - line: 간격 = 다시 쓰기 cd2초 · 범위 = 줄 둘(앞뒤 row2 m), 빈틈은 서로 옆 칸
   - charge: 간격 = 다시 쓰기 cd2초 · 범위 = dist2 m
   - wide: 간격 = 두 번에 한 번 → 매번 · 범위 = 넓게 찍은 뒤 안전 칸이 반대쪽으로 옮겨 then2초 뒤 한 번 더 */
export const BOSS_PAT = {
  slam: { name: '내려찍기', then: 0.3, ext: 0.5, text: () => '빨간 띠가 생긴 칸을 내려찍어요 — 옆 칸으로 비키세요' },
  volley: { name: '독침 세례', n: 3, gap: 0.7, cd: 6, first: 2.5, hit: 0.12, gap2: 0.5, cd2: 4.5, n2: 5, r2: 1.3, text: () => '독침을 잇달아 던져요 — 계속 움직이세요' },
  line: { name: '좀비 장벽', n: 7, hp: 1.2, gap: 2.8, cd: 7, first: 4, cd2: 5, row2: 4, text: () => '길을 가로지르는 졸개 줄 — 빈틈으로 빠지거나 쏴서 뚫으세요' },
  charge: { name: '돌진', warn: 1.5, dash: 0.4, dist: 2, cd: 6.5, first: 3.5, cd2: 4.5, dist2: 3, stop: 1.5, block: 0.08, n: 6, n2: 9, hp: 0.8, text: () => `질주 좀비를 몰고 숨을 골라요 — 그동안 보스 체력 ${Math.round(BOSS_PAT.charge.block * 100)}%를 깎으면 돌진을 막아요` },   // stop: 돌진이 분대 앞 이만큼(m)에서 멈춘다(바로 붙지 않게) · 42절: 숨 고르기(warn) 동안 질주 좀비 n마리(범위 확대 n2)가 함께 나오고, 그동안 보스 최대 체력의 block을 깎으면 돌진을 막는다(비틀거림)
  wide: { name: '넓은 내려찍기', pad: 0.25, then2: 0.6, text: () => '세 칸 중 두 칸을 한꺼번에 내려찍어요 — 남은 가장자리 칸으로' },
  double: { name: '연속 내려찍기', then: 0.3, text: () => '내려찍은 뒤 지금 선 칸을 곧바로 한 번 더' },   // 옛 저장(23절 전)의 보스만 — 지금은 내려찍기의 간격 강화판
};
/* 출격 보급품(무한모드 개편 판 — ENDGAME.md 27절): 출격 카드의 '함께 출격'에서 코인으로 사서 그 판에만 쓴다(출격하는 순간 코인이 빠지고 고른 것은 비워진다).
   men: 시작 병력 ×v · legend: 보스 뒤 첫 카드에서 강화가 있는 장 하나가 전설 · revive: 병력이 0이 되는 순간 한 번, 그 구간 바닥선의 v배로 되살아난다
   relic: 열린 유물 하나를 처음부터 쥐고 출발 [값은 초안 — 보스 30마리 판의 벌이가 4,800코인쯤] */
/* 보스 피해의 바닥(무한모드 개편 판 — ENDGAME.md 30절): 보스 공격은 지금 병력의 몫(밟기 12% · 내려찍기 25% · 독침 세례)이라 병력이 줄수록 덜 아파,
   이미 밀린 판이 한참 끌렸다. 그 구간 기준 병력(s.bossRef — 보스 앞에 도착할 것으로 본 병력)의 이 몫보다는 덜 잃지 않는다(병력이 기준의 절반쯤 넘으면 그대로) */
export const BOSS_FLOOR = { stomp: 0.04, slam: 0.1, spit: 0.04 };   // 0.06·0.15·0.06에서는 약한 빌드(정밀)가 빌드 균형 띠 밖으로 밀려 낮췄다
export const SUPPLY = {
  men: { name: '증원 부대', cost: 300, v: 1.5, text: () => `시작 병력 ×${SUPPLY.men.v}` },
  legend: { name: '전설 보급', cost: 800, text: () => '첫 보스 뒤 카드 하나가 전설' },
  revive: { name: '불굴 보급', cost: 1000, v: 1, text: () => '전멸하는 순간 한 번 되살아나요(그 구간 바닥선만큼)' },
  relic: { name: '시작 유물', cost: 1500, text: () => '열린 유물 하나를 쥐고 출발' },
};
export const SUPPLY_IDS = ['men', 'legend', 'revive'];
/* 넉백(개편 판 보스): 붙은(clash) 동안 보스 최대 체력의 hp 몫을 깎으면 dist m 뒤로 튕겨 stun초 비틀거린다(걷기·내려찍기·패턴 멈춤) — 붙어도 쏘아서 떼어낼 수 있게 */
export const BOSS_KNOCK = { hp: 0.035, dist: 3, stun: 1 };
export const BOSS_PAT_IDS = ['slam', 'volley', 'line', 'charge', 'wide'];
export const BOSS_PAT_UP = { 1: '간격 단축', 2: '범위 확대', 3: '간격 단축 · 범위 확대' };
export const BOSS_PAT_UPTEXT = {
  slam: { 1: '내려찍은 뒤 지금 선 칸을 곧바로 한 번 더', 2: '빨간 띠가 칸 경계를 넘어 넓어요' },
  volley: { 1: '더 빨리, 더 자주 던져요', 2: '독침이 더 많고 넓게 떨어져요' },
  line: { 1: '졸개 줄이 더 자주 와요', 2: '졸개 줄이 두 겹 — 빈틈이 서로 옆 칸이에요' },
  charge: { 1: '더 자주 뛰어들어요', 2: '더 멀리 뛰어들어요' },
  wide: { 1: '내려찍을 때마다 두 칸을 넓게', 2: '넓게 찍은 뒤 안전 칸이 반대쪽으로 옮겨 한 번 더' },
};
/* 각성·숙련 배수(개편 판 — 18.4): Lv5까지 1, Lv6~10은 레벨마다 +15%(Lv10에 2차 진화), Lv10 위(숙련)는 레벨마다 +10% 더(BUILD.mastery — 21.10) — 곱하지 않고 더한다 */
export const awk = (l) => 1 + BUILD.awk * (Math.min(Math.max(l, 5), 10) - 5) + BUILD.mastery * Math.max(0, l - 10);
/* 탄 효과의 값(개편 판 — ENDGAME.md 18.3~18.4): 레벨마다 정해진 능력(숫자만 오르는 레벨은 없다), Lv5가 진화, Lv6~10 각성(그 역할의 값 +15%씩, 구간 13부터),
   Lv10 2차 진화(evo2), 그 위는 숙련(+10%씩 — 21.10). 상한에 닿는 값은 넘친 몫을 다음 효과로(OVER). 수치는 모두 [초안].
   관통 — Lv1 뒤 좀비 1마리에 50% · Lv2 뒤 2마리 · Lv3 벽·장갑문 피해 +50% · Lv4 일직선 전부 · Lv5 뚫을 때마다 다음 대상 피해 +20% · Lv10 벽을 뚫고 벽 뒤 좀비도 맞는다
   작렬 — Lv1 둘레 1m에 40% · Lv2 반경 1.5m · Lv3 둘레 피해 60% · Lv4 반경 2m · Lv5 처치된 좀비도 터진다(연쇄) · Lv10 연쇄 폭발이 벽·보스에도 든다
   속사 — Lv1 총알 피해 +10% · Lv2 쏘는 속도 +10% · Lv3 보스에게 +30% · Lv4 쏘는 속도 +10% 더 · Lv5 3초 계속 쏘면 과열(피해 ×1.5) · Lv10 과열 중 총알이 둘로 갈라진다
   빙결 — Lv1 0.8초 동안 25% 느리게 · Lv2 35% · Lv3 느려진 좀비에게 잃는 병사 −20% · Lv4 1.5초 · Lv5 느려진 좀비가 죽으면 둘레도 느려진다 · Lv10 느려진 채 3초가 지나면 1초 얼어붙는다(보스 제외)
   (빙결의 '언 적이 받는 총알 피해 증폭'은 없앴다 — 한 방의 주범). pow: 화력으로 어림한 값(think 점수용 — 위협 식에는 안 든다) */
export const FX_CHAIN = 0.5;      // 작렬 Lv5: 터지는 좀비가 둘레에 주는 몫(그 좀비 체력의 이만큼) — 측정으로 0.3 → 0.5
export const FX_HEAT = 3;         // 속사 Lv5: 이 초 동안 계속 쏘면 과열
export const FX_FREEZE = { after: 3, T: 1 };   // 빙결 Lv10: 느려진 채 after초가 지나면 T초 얼어붙는다
/* 넘침 전환(ENDGAME.md 21.10) [초안]: 상한에 닿은 넘친 몫(over — 그 값의 단위)을 다음 효과로 바꾸는 비율.
   관통: 뒤 몫 100% 넘친 1당 뚫을수록 +ramp·벽 ×+wall / 작렬: 반경이 각성으로 (1 + grow·(a−1))배 커지다 rMax m에서 멈추고 넘친 1m당 둘레 +splash·유폭 +chain /
   속사: 쏘는 속도가 각성으로 커지다 rMax배에서 멈추고 넘친 1당 피해 +dmg·과열 +heat / 빙결: 느려짐·잃는 병사 감소가 넘친 1당 느려지는 시간 +T초(tMax까지), 그 위 1초당 얼음 폭탄(제 체력의 shatter) */
export const OVER = {
  pierce: { ramp: 0.4, wall: 0.5 },
  burst: { grow: 0.25, rMax: 3, splash: 0.3, chain: 0.2 },
  rapid: { grow: 0.2, rMax: 1.6, dmg: 0.5, heat: 0.3 },
  frost: { T: 2, tMax: 4, shatter: 0.25 },
  shock: { nMax: 6, per: 0.3 },        // 전격: 튀는 몫 100% 상한 → 넘친 per당 튀는 수 +1(nMax까지)
  acid: { stackMax: 30, T: 2 },        // 부식: 겹 상한(Lv2 15 · 각성으로 늘다 stackMax에서 멈춤) → 넘친 1당 지속 +T/10초
  cure: { pMax: 0.2, cap: 1 },         // 치료: 확률 20% 상한 → 넘친 몫 1당 구간 상한 +cap(B(k) 배수)
};
/* 24절 새 탄의 상수 [초안]: 전격 — 튀는 거리 r(Lv3 r3) · 뇌운 간격 boltCd초·반경 boltR m(총알 1초 피해만큼) /
   부식 — 지속 T초 · 보스 겹당 받는 총알 피해 +boss(겹 15까지) · 녹아내림 문턱 melt(체력 몫) · 산성 웅덩이 poolT초·반경 poolR m /
   치료 — 구간 상한 = B(k) × cap · 보스 뒤 몫 boss · 거구 brute배 */
export const FX_NEW = { shock: { r: 3, r3: 4.5, boltCd: 2, boltR: 2 }, acid: { T: 4, boss: 0.01, melt: 0.2, poolT: 2, poolR: 1.6 }, cure: { cap: 0.25, boss: 0.5, brute: 3, unit: 0.005 } };   // unit: 치료 한 번에 합류하는 병력 = B(k) × unit(최소 1)
export function fx2Val(id, lv) {
  const A = AMMO[id];
  const L = Math.max(1, Math.floor(lv) || 1);
  const l = Math.min(BUILD.evo, L);   // 정해진 능력은 Lv5까지, 그 위는 각성 배수 a
  const a = awk(L);
  const evo = l >= BUILD.evo, evo2 = L >= 10;
  if (!A) return {};
  const r3 = (x) => Math.round(x * 1000) / 1000;
  // 넘침 전환(21.10): 상한에 닿는 값은 넘친 몫(over)을 정해진 다음 효과로 넘긴다 — 레벨이 오르면 어떤 값이든 늘 오른다
  if (A.pierce) {
    const raw = 0.5 * a, over = Math.max(0, raw - 1);   // 뒤 좀비 몫 상한 100% → 넘친 몫은 뚫을수록(ramp)·벽 피해로
    return { pierce: Math.min(1, raw), n: l >= 4 ? 99 : l >= 2 ? 2 : 1, wall: r3((l >= 3 ? 1.5 : 1) + OVER.pierce.wall * over), ramp: r3((evo ? 0.2 * a : 0) + OVER.pierce.ramp * over), over: r3(over), evo, evo2, a };
  }
  if (A.splash) {
    const r0 = l >= 4 ? 2 : l >= 2 ? 1.5 : 1, rRaw = r0 * (1 + OVER.burst.grow * (a - 1)), over = Math.max(0, rRaw - OVER.burst.rMax);   // 반경은 각성으로 커지다 3m에서 멈추고 → 둘레 피해·유폭으로
    return { splash: r3((l >= 3 ? 0.6 : 0.4) * a + OVER.burst.splash * over), r: r3(Math.min(OVER.burst.rMax, rRaw)), chain: evo ? r3(FX_CHAIN * a + OVER.burst.chain * over) : 0, over: r3(over), evo, evo2, a };
  }
  if (A.chain) {   // 전격(24절): 튀는 몫 → 상한 100%면 튀는 수로
    const raw = (l >= 4 ? 0.6 : 0.4) * a, over = Math.max(0, raw - 1);
    const n = Math.min(OVER.shock.nMax, (l >= 2 ? 2 : 1) + Math.floor(over / OVER.shock.per));
    return { chain: r3(Math.min(1, raw)), n, r: l >= 3 ? FX_NEW.shock.r3 : FX_NEW.shock.r, conduct: evo, bolt: evo2, over: r3(over), evo, evo2, a };
  }
  if (A.acid) {   // 부식(24절): 겹당 초당 총알 피해의 dot, 겹 상한 → 지속 시간으로
    const sRaw = (l >= 2 ? 15 : 10) * (1 + 0.5 * (a - 1)), over = Math.max(0, sRaw - OVER.acid.stackMax);
    return { dot: r3(A.acid * a), max: Math.floor(Math.min(OVER.acid.stackMax, sRaw)), T: r3(FX_NEW.acid.T + (OVER.acid.T / 10) * over), wall: l >= 3 ? 2 : 1, arm: l >= 4, melt: evo, pool: evo2, over: r3(over), evo, evo2, a };
  }
  if (A.cure) {   // 치료(24절): 처치한 일반 좀비가 p 확률로 병력 +1, 확률 상한 → 구간 상한으로
    const pRaw = (l >= 4 ? 0.08 : l >= 2 ? 0.06 : A.cure) * a * (evo2 ? 1.5 : 1), over = Math.max(0, pRaw - OVER.cure.pMax);
    return { p: r3(Math.min(OVER.cure.pMax, pRaw)), gate: l >= 3 ? 1.25 : 1, brute: l >= 4 ? FX_NEW.cure.brute : 1, mass: evo, cap: r3(FX_NEW.cure.cap * (evo2 ? 2 : 1) + OVER.cure.cap * over), over: r3(over), evo, evo2, a };
  }
  if (A.slow) {
    const sRaw = (l >= 2 ? 0.35 : 0.25) * a, lRaw = l >= 3 ? 1 - 0.2 * a : 1;
    const over = Math.max(0, sRaw - 0.85) + Math.max(0, 0.4 - lRaw);   // 느려짐 85%·잃는 병사 −60% 상한 → 느려지는 시간(4초까지) → 얼음 폭탄(닿으면 터짐)
    const tRaw = (l >= 4 ? 1.5 : 0.8) * a + OVER.frost.T * over, T = Math.min(OVER.frost.tMax, tRaw);
    return { slow: Math.min(0.85, sRaw), T: Math.round(T * 100) / 100, loss: l >= 3 ? Math.max(0.4, lRaw) : 1, shatter: r3(OVER.frost.shatter * Math.max(0, tRaw - OVER.frost.tMax)), over: r3(over), spread: evo, evo, evo2, a };
  }
  const rRaw = (l >= 2 ? 1.1 : 1) * (l >= 4 ? 1.1 : 1) * (1 + OVER.rapid.grow * (a - 1)), over = Math.max(0, rRaw - OVER.rapid.rMax);   // 쏘는 속도 +60% 상한 → 총알 피해·과열 배수로
  const rate = Math.min(OVER.rapid.rMax, rRaw);
  const dmg = r3(1 + 0.1 * a + OVER.rapid.dmg * over);
  const boss = l >= 3 ? r3(1 + 0.3 * a) : 1, heat = evo ? r3(1 + 0.5 * a + OVER.rapid.heat * over) : 1;
  return { dmg, rate: r3(rate), boss, heat, over: r3(over), pow: r3(dmg * rate * (1 + (boss - 1) * 0.2) * (1 + (heat - 1) * 0.4)), evo, evo2, a };
}
export const FX_EVO = { pierce: '가속 관통', burst: '유폭', rapid: '과열', frost: '번지는 얼음', shock: '전도', acid: '녹아내림', cure: '집단 치료' };
export const FX_EVO2 = { pierce: '벽 너머 관통', burst: '벽·보스 유폭', rapid: '쌍갈래 과열', frost: '얼어붙는 얼음', shock: '뇌운', acid: '산성 웅덩이', cure: '구조대' };
const FX_EVO2_TEXT = { pierce: '벽을 뚫고 벽 뒤 좀비도 맞아요', burst: '연쇄 폭발이 벽·보스에도 들어요', rapid: '과열 중 총알이 둘로 갈라져요', frost: `느려진 채 ${FX_FREEZE.after}초가 지나면 ${FX_FREEZE.T}초 얼어붙어요(보스 제외)`,
  shock: `${FX_NEW.shock.boltCd}초마다 가장 촘촘한 무리에 벼락(총알 1초 피해만큼)`, acid: `무너진 벽·죽은 거구 자리에 ${FX_NEW.acid.poolT}초 동안 부식 지대`, cure: '치료 몫 ×1.5 · 구간 상한 ×2' };
export function fx2Text(id, lv) { return fx2Base(id, lv) + (fx2Val(id, lv).evo2 ? ` · ${FX_EVO2_TEXT[id]}` : ''); }
function fx2Base(id, lv) {
  const v = fx2Val(id, lv);
  const l = Math.min(BUILD.evo, Math.max(1, lv | 0));
  const e = v.a > 1 ? `레벨 보너스 +${apc(v.a - 1)}% · ` : '';   // 36절: 진화 이름을 빼고 효과만(아래 글이 진화가 하는 일을 쓴다)
  const mx = v.over > 0 ? '(최대)' : '';   // 넘침 전환(21.10): 상한에 닿은 값에 '(최대)' — 넘친 몫은 다음 효과로 간다
  if (v.pierce) return e + `뒤의 좀비 ${v.n > 2 ? '일직선 전부' : v.n === 2 ? '둘' : '하나'}에 ${apc(v.pierce)}%${mx}${v.wall > 1 ? ` · 벽·장갑문 +${apc(v.wall - 1)}%` : ''}${v.ramp ? ` · 뚫을 때마다 다음 +${apc(v.ramp)}%` : ''}`;
  if (v.splash) return e + `둘레 ${v.r}m${v.r >= OVER.burst.rMax ? '(최대)' : ''}에 ${apc(v.splash)}%${v.chain ? ` · 처치된 좀비도 터져요(${apc(v.chain)}%)` : ''}`;
  if (v.chain) return e + `맞은 좀비에서 ${v.r}m 안 ${v.n}마리까지 ${apc(v.chain)}%${mx} 튀어요${v.conduct ? ' · 사슬이 덧셈 칸에도 튀어 올려요' : ''}`;
  if (v.dot) return e + `맞을 때마다 부식 1겹(${v.T}초 · 최대 ${v.max}겹${v.over > 0 ? '(최대)' : ''}) — 겹마다 초당 총알 피해의 ${apc(v.dot * 10) / 10}%${v.wall > 1 ? ' · 벽·장갑문 부식 ×2' : ''}${v.arm ? ' · 장갑·방패도 제 피해' : ''}${v.melt ? ` · 15겹 쌓인 벽은 체력 ${apc(FX_NEW.acid.melt)}% 아래면 무너져요 · 보스는 겹마다 총알 피해 +${apc(FX_NEW.acid.boss)}%` : ''}`;
  if (v.p) return e + `잡은 좀비의 ${Math.round(v.p * 1000) / 10}%${mx}가 사람으로 돌아와 합류(한 명 = 구간 기준 병력의 ${FX_NEW.cure.unit * 100}% · 구간마다 ${apc(v.cap)}%까지)${v.gate > 1 ? ` · 덧셈 칸 쏘아 올리는 폭 +${apc(v.gate - 1)}%` : ''}${v.brute > 1 ? ` · 거구는 ×${v.brute}` : ''}${v.mass ? ' · 보스 졸개도 · 보스를 잡으면 그 구간 치료의 50% 더' : ''}`;
  if (v.slow) return e + `${v.T}초${v.T >= OVER.frost.tMax ? '(최대)' : ''} 동안 ${apc(v.slow)}%${v.slow >= 0.85 ? '(최대)' : ''} 느리게${v.loss < 1 ? ` · 느려진 좀비에게 잃는 병사 −${apc(1 - v.loss)}%` : ''}${v.spread ? ' · 느려진 좀비가 죽으면 둘레도 느려져요' : ''}${v.shatter ? ` · 느려진 좀비가 닿으면 터져요(제 체력의 ${apc(v.shatter)}%)` : ''}`;
  return e + `총알 피해 +${apc(v.dmg - 1)}%${l >= 2 ? ` · 쏘는 속도 +${apc(v.rate - 1)}%${mx}` : ''}${v.boss > 1 ? ` · 보스 +${apc(v.boss - 1)}%` : ''}${v.heat > 1 ? ` · ${FX_HEAT}초 계속 쏘면 과열 ×${v.heat}` : ''}`;
}
/* 총 종류(개편 판 — ENDGAME.md 21절): 소총(rifle) · 산탄총(shotgun) · 저격총(marksman — 특수병 저격수 sniper와 id를 가른다). 출격 때 고르고(별로 연다 — stars), 판 안에서는 다른 총이 든 무기 상자를 열면 다음 보스 뒤에 바꿀지 고른다.
   ★(총 카드·상자)은 셋이 같은 피해 배수(core WEAPON). 총 Lv(총마다 따로)은 탄과 같은 틀 — Lv1~5 정해진 능력, Lv6~10 각성(그 총의 값 +15%씩), Lv10 2차 진화, 그 위 숙련.
   gunVal(id, lv)가 그 레벨의 사격 규칙을 낸다(core fire·bulletsUpdate가 읽는다). 수치는 모두 [초안].
   - hz 초당 일제 사격 · pel 한 번에 쏘는 발 수 배수(소총 = core volleySize) · spread 퍼짐(분대 폭 R에 더하는 m) · range 사거리(m)
   - dmg 초당 피해 배수 · wall 벽·장갑문 · boss 보스(총알 몫) · near 산탄 감쇠가 시작되는 거리(그 뒤 range에서 fall까지 줄어든다)
   - aim 저격 조준 폭(R에 더하는 m — 그 안 가장 센 적을 노린다), thru 넘친 피해가 같은 줄 뒤로 이어 간다(관통 예산)
   - burst 소총 Lv5 '점사': every번째 일제 사격마다 피해 ×k(Lv10이면 그 사격이 관통 예산) · slug 산탄 Lv5: 맞힌 맨 앞 적을 m만큼 밀어낸다 · shard 산탄 Lv10: 부순 벽 뒤 4m에 벽 체력의 몫
   - head 저격 Lv5 '헤드샷': 맞은 뒤 체력이 이 몫 아래인 일반 좀비는 바로 쓰러진다 · pop 저격 Lv10: 쓰러뜨린 적이 터져 둘레 1.6m에 제 체력의 몫 */
export const GUNS = {
  rifle: { name: '소총', stars: 0, color: '#FFE38A', line: '무난한 기본 총', text: () => '분대 폭에 고르게 · 사거리 30m' },
  shotgun: { name: '산탄총', stars: 50, color: '#FF8A5B', line: '가까이 · 넓게 · 세게 — 장애물 파괴', text: () => `옆 칸까지 퍼지는 펠릿 · 피해 ×${GUNK.shotgun.dmg}(${GUNK.shotgun.near}m 넘으면 줄어 ${GUNK.shotgun.range}m에서 ${apc(GUNK.shotgun.fall)}%) · 벽·장갑문 ×${GUNK.shotgun.wall}` },
  marksman: { name: '저격총', stars: 90, color: '#7FE3FF', line: '멀리 · 한 점 · 무겁게 — 거물 사냥', text: () => `옆 ±${GUNK.marksman.aim}m 안 가장 센 적을 노려 초당 ${GUNK.marksman.hz}발 · 사거리 50m · 남는 피해는 뒤로 뚫고 간다(탄 효과는 처음 맞힌 적에게만) · 보스 ×${GUNK.marksman.boss}` },
};
export const GUN_IDS = Object.keys(GUNS);
export const GUN_EVO = { rifle: '점사', shotgun: '슬러그', marksman: '헤드샷' };
/* 36절: 화면 글에는 이름 대신 무엇을 하는지(이름은 일시정지 칸 이름에만) */
export const GUN_EVO_TEXT = { rifle: '4번째 일제 사격마다 피해 ×2', shotgun: '맨 앞 적을 밀어내요', marksman: '체력 20% 아래 좀비는 한 발에 쓰러져요' };
export const GUN_EVO2 = { rifle: '관통 점사', shotgun: '파편', marksman: '터지는 한 발' };
const GUN_EVO2_TEXT = { rifle: '점사가 남는 피해를 뒤로 이어 간다(관통 — 탄 효과는 처음 맞힌 적에게만)', shotgun: '부순 벽의 파편이 벽 뒤 좀비에게', marksman: '쓰러뜨린 적이 터진다(뚫고 간 적도)' };
/* 총의 바탕 수치(Lv1) — 봇으로 맞춘다(21.12). 산탄: 피해·퍼짐·사거리·감쇠(near m부터 range에서 fall까지)·벽 / 저격: 초당 발·조준 폭·피해·보스 */
export const GUNK = {
  shotgun: { dmg: 1.5, spread: 1.4, range: 24, near: 8, fall: 0.6, wall: 2 },   // 21.12: 1.4·22m·40%·×1.6이면 20.9구간(소총 29.4) — 1.6·24m·60%·×2로 28.4, 총 Lv 카드가 들어간 뒤 32.3(소총 27.5)이라 1.5·Lv4 감쇠 +2m로 28.3
  marksman: { hz: 3, aim: 1.5, dmg: 0.6, boss: 1.6 },   // 21.12: 조준 ±2.5m·피해 ×1이면 37.5구간(너무 셌다) — ±1.5m·×0.6·보스 ×1.6으로 29.6
};
export function gunVal(id, lv) {
  const L = Math.max(1, Math.floor(lv) || 1), l = Math.min(BUILD.evo, L), a = awk(L);
  const evo = l >= BUILD.evo, evo2 = L >= 10;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  if (id === 'shotgun') {
    const K = GUNK.shotgun, wRaw = (l >= 3 ? K.wall * 1.25 : K.wall) * (1 + 0.5 * (a - 1));
    return { hz: 4, pel: l >= 2 ? 3.75 : 3, pelMax: 36, spread: K.spread, range: K.range, near: l >= 4 ? K.near + 2 : K.near, fall: K.fall, dmg: r3(K.dmg + 0.2 * (a - 1)), wall: r3(wRaw), boss: 1, slug: evo ? 0.6 : 0, shard: evo2 ? r3(0.3 * a) : 0, evo, evo2, a };
  }
  if (id === 'marksman') {
    const hRaw = evo ? 0.2 + 0.1 * (a - 1) : 0, over = Math.max(0, hRaw - 0.5);   // 헤드샷 문턱 50% 상한 → 넘친 몫은 피해로(21.10)
    const K = GUNK.marksman;
    return { hz: r3(l >= 4 ? K.hz * 1.2 : K.hz), rounds: true, spread: 0, aim: l >= 2 ? K.aim + 1 : K.aim, range: 50, thru: true, dmg: r3(K.dmg * (1 + 0.5 * over)), wall: 1, boss: r3((l >= 3 ? K.boss + 0.3 : K.boss) + 0.3 * (a - 1)), head: r3(Math.min(0.5, hRaw)), pop: evo2 ? 0.5 : 0, over: r3(over), evo, evo2, a };
  }
  const hRaw = (l >= 2 ? 11 : 10) * (1 + 0.3 * (a - 1)), over = Math.max(0, hRaw - 18);   // 소총: 쏘는 속도 초당 18 상한 → 넘친 몫은 피해로
  return { hz: r3(Math.min(18, hRaw)), spread: l >= 3 ? 0.8 : 0.3, range: l >= 4 ? 35 : 30, dmg: r3(1 + over / 18), wall: 1, boss: 1, burst: evo ? { every: 4, k: r3(2 + 0.5 * (a - 1)), thru: evo2 } : null, over: r3(over), evo, evo2, a };
}
export function gunText(id, lv) {
  const v = gunVal(id, lv), L = Math.max(1, lv | 0);
  const e = v.a > 1 ? `레벨 보너스 +${apc(v.a - 1)}% · ` : '';   // 36절: 진화 이름을 빼고 효과만
  const tail = v.evo2 ? ` · ${GUN_EVO2_TEXT[id]}` : '';
  if (id === 'shotgun') return e + `펠릿 ×${v.pel} · 피해 ×${v.dmg}(${v.near}m 넘으면 줄어요) · 벽·장갑문 ×${v.wall}${v.slug ? ' · 맨 앞 적을 밀어내요' : ''}` + tail;
  if (id === 'marksman') return e + `초당 ${v.hz}발 · 조준 폭 ±${v.aim}m · 남는 피해는 뒤로 뚫고 가요(탄 효과는 처음 맞힌 적에게만) · 보스 ×${v.boss}${v.head ? ` · 체력 ${apc(v.head)}%${v.head >= 0.5 ? '(최대)' : ''} 아래 좀비는 바로 쓰러져요` : ''}${v.over ? ` · 피해 ×${v.dmg}` : ''}` + tail;
  return e + `초당 ${v.hz}번${v.hz >= 18 ? '(최대)' : ''} · 퍼짐 ±${v.spread}m · 사거리 ${v.range}m${v.burst ? ` · ${v.burst.every}번째 사격마다 피해 ×${v.burst.k}` : ''}${v.over ? ` · 피해 ×${v.dmg}` : ''}` + tail;
}
/* 총 바꾸기(21.8): from구간부터 무기 상자의 p 몫에 다른 총, 대왕 뒤 카드에 king 확률로 '총 바꾸기' 한 장. 처음 잡는 총은 지금 총 Lv의 keep 몫(내림, 최소 1) */
export const GUN_SWAP = { from: 7, p: 0.25, king: 0.2, keep: 0.5, stack: 1 };   // stack(39.8): 다른 총 상자를 열 때마다 그 총 Lv +stack(안 바꿔도 쌓인다)
/* 카드 등급 = 강화(개편 판 — ENDGAME.md 18.8): 일반은 레벨 +1, 희귀는 레벨 +1 + 그 대상(탄 효과·특수병)의 부가 능력, 전설은 레벨 +1 + 규칙을 바꾸는 능력(판 끝까지).
   같은 강화를 또 뽑으면 그 강화가 한 단계 세진다(수치 ×enhStr — 한 번 더 뽑을 때마다 +50%, 규칙형은 효과가 한 번 더 겹친다). 수치는 모두 [초안].
   B.enh[id] = { r: 희귀를 뽑은 수, l: 전설을 뽑은 수 } */
export const enhStr = (n) => 1 + 0.5 * Math.max(0, n - 1);
/* 전설 강화(ENDGAME.md 20절 — 가던 성장 길을 바꿀 만큼): 그 대상의 2차 진화(Lv10)를 레벨과 상관없이 바로 켜고, 핵심 수치 ×legK(n) = 1 + LEG × enhStr(n)
   (한 장 ×2, 두 장 ×2.5, 세 장 ×3). 대신 잘 안 나온다(BUILD.rare·tagRare) */
export const LEG = 1;
export const legK = (n) => (n > 0 ? 1 + LEG * enhStr(n) : 1);
const legX = () => `×${legK(1)}`;
/* 희귀 강화 글: k = 지금 세기(enhStr), k0가 있으면 '전 → 후'로(이미 가진 강화를 또 뽑는 카드) */
const r2 = (x) => Math.round(x * 100) / 100;
const ka = (f, k = 1, k0) => (k0 ? `${f(k0)} → ${f(k)}` : f(k));
export const ENH = {
  pierce: {
    rare: { name: '터지는 총알', v: 0.3, text: (k, k0) => `벽·장갑문에 박힌 총알이 터져 벽 피해 ${ka((x) => `+${apc(ENH.pierce.rare.v * x)}%`, k, k0)}` },
    legend: { name: '도탄', n: 3, reach: 12, side: 3, text: () => `벽·장갑문에 맞은 총알이 튕겨 나와 그 앞 좀비 ${ENH.pierce.legend.n}마리를 제 피해로 맞혀요` },
  },
  burst: {
    rare: { name: '불씨 폭발', t: 1.2, text: (k = 1, k0) => `폭발한 자리에 ${ENH.burst.rare.t}초 동안 불이 남아요${k0 || k > 1 ? ` · 불 세기 ${ka((x) => `×${r2(x)}`, k, k0)}` : ''}` },
    legend: { name: '블랙홀', pull: 1.4, mul: 1.6, text: () => `폭발이 두 배 넓이의 좀비를 가운데로 끌어모으고, 둘레 피해 ×${ENH.burst.legend.mul}` },
  },
  rapid: {
    rare: { name: '신바람', v: 1.25, T: 1.5, text: (k, k0) => `좀비를 잡으면 ${ENH.rapid.rare.T}초 동안 쏘는 속도 ${ka((x) => `+${apc((ENH.rapid.rare.v - 1) * x)}%`, k, k0)}` },
    legend: { name: '탄막 폭풍', text: () => `총알이 늘 둘로 갈라져요(둘째도 제 피해 — 총알 피해 ${legX()} 꼴) · 과열은 맞서자마자` },
  },
  frost: {
    rare: { name: '얼음 폭탄', v: 0.5, text: (k, k0) => `느려진 좀비가 닿으면 터져 둘레에 제 체력의 ${ka((x) => `${apc(ENH.frost.rare.v * x)}%`, k, k0)}` },
    legend: { name: '얼음 갑옷', text: () => '느려진 좀비는 닿으면 얼어 부서져요 — 병사를 안 잃어요' },
  },
  sniper: {
    rare: { name: '사기 충전', v: 0.05, text: (k, k0) => `저격으로 잡으면 영웅 게이지 ${ka((x) => `+${apc(ENH.sniper.rare.v * x)}%`, k, k0)}` },
    legend: { name: '약점 표시', v: 0.5, T: 4, text: () => `저격당한 적은 ${ENH.sniper.legend.T}초 동안 모든 피해를 +${apc(ENH.sniper.legend.v)}% 받아요(보스도)` },
  },
  rocket: {
    rare: { name: '이어 터짐', v: 0.5, text: (k, k0) => `로켓이 한 번 더 터져요(피해 ${ka((x) => `${apc(ENH.rocket.rare.v * x)}%`, k, k0)})` },
    legend: { name: '집속탄', n: 5, v: 0.45, text: () => `로켓이 터지면 작은 폭탄 ${ENH.rocket.legend.n}개가 흩어져 터져요(하나에 ${apc(ENH.rocket.legend.v)}%)` },
  },
  flame: {
    rare: { name: '뜨거운 기운', v: 1.2, text: (k, k0) => `불 지대 위에 서 있으면 쏘는 속도 ${ka((x) => `+${apc((ENH.flame.rare.v - 1) * x)}%`, k, k0)}` },
    legend: { name: '불꽃 방패', v: 0.75, text: () => `불 지대 위에 서 있으면 좀비에게 닿아 잃는 병사 −${apc(ENH.flame.legend.v)}%` },
  },
  shock: {   // 24절 새 탄
    rare: { name: '정전기', n: 1, text: (k, k0) => `사슬이 튀는 좀비 수 ${ka((x) => `+${Math.round(ENH.shock.rare.n * x)}`, k, k0)}` },
    legend: { name: '감전', T: 1, text: () => `사슬에 맞은 좀비가 ${ENH.shock.legend.T}초 동안 멈춰요(보스 제외)` },
  },
  acid: {
    rare: { name: '진한 산', T: 6, text: (k, k0) => `부식이 ${FX_NEW.acid.T}초가 아니라 ${ka((x) => `${r2(ENH.acid.rare.T * x)}초`, k, k0)}가요` },
    legend: { name: '전염', r: 3, text: () => `부식된 좀비가 죽으면 둘레 ${ENH.acid.legend.r}m 좀비에게 부식이 그대로 옮아요` },
  },
  cure: {
    rare: { name: '백신', n: 2, text: (k, k0) => `거구·정예를 잡으면 치료 몫 ${ka((x) => `×${r2(ENH.cure.rare.n * x)}`, k, k0)} 더` },
    legend: { name: '영웅의 귀환', v: 0.05, text: () => `치료로 병사가 돌아올 때마다 영웅 게이지 +${apc(ENH.cure.legend.v)}%` },
  },
  rifle: {   // 총 강화(21.9) — 총 Lv 카드가 희귀·전설이면
    rare: { name: '확장 탄창', v: 1.15, text: (k, k0) => `쏘는 속도 ${ka((x) => `×${r2(1 + (ENH.rifle.rare.v - 1) * x)}`, k, k0)}` },
    legend: { name: '집중 사격', step: 0.12, max: 0.8, text: () => `같은 좀비를 맞힐 때마다 그 좀비가 받는 총알 피해 +${apc(ENH.rifle.legend.step)}%(최대 +${apc(ENH.rifle.legend.max)}%)` },
  },
  shotgun: {
    rare: { name: '넓은 총구', v: 0.6, pel: 1.2, text: (k, k0) => `퍼짐 ${ka((x) => `+${r2(ENH.shotgun.rare.v * x)}m`, k, k0)} · 펠릿 ${ka((x) => `×${r2(1 + (ENH.shotgun.rare.pel - 1) * x)}`, k, k0)}` },
    legend: { name: '산탄 폭발', near: 8, r: 1.6, v: 0.6, text: () => `${ENH.shotgun.legend.near}m 안 좀비를 쓰러뜨리면 그 자리가 터져 둘레에 그 좀비 체력의 ${apc(ENH.shotgun.legend.v)}%` },
  },
  marksman: {
    rare: { name: '안정 조준', v: 1.5, text: (k, k0) => `조준 폭 ${ka((x) => `+${r2(ENH.marksman.rare.v * x)}m`, k, k0)}` },
    legend: { name: '연발', v: 0.3, text: () => '좀비를 쓰러뜨릴 때마다 다음 발이 바로 나가요' },
  },
  medic: {
    rare: { name: '숨 돌리기', v: 0.3, text: (k, k0) => `회복할 때마다 특수병의 다음 차례가 ${ka((x) => `${r2(ENH.medic.rare.v * x)}초`, k, k0)} 앞당겨져요` },
    legend: { name: '응급 수혈', v: 0.5, text: () => `구간마다 한 번, 병력이 구간 시작의 절반 아래가 되면 잃은 병사의 ${apc(ENH.medic.legend.v)}%가 바로 돌아와요` },
  },
};
/* 특수병 Lv5 고유 능력(개편 판 — ENDGAME.md 18.3: 전문화 카드(둘 중 고르기)는 없어졌다). Lv1 합류, Lv2~4는 간격·피해, Lv5에 아래 능력 — Lv5가 상한(각성은 4단계) [수치는 초안]
   - sniper 거물 사냥: 보스·정예·거구·독침 좀비에게 저격 위력 ×v, 보스전 추가 피해 한도 +cap
   - rocket 쌍발: 한 번에 로켓 2발(둘째는 조금 늦게 같은 자리에)
   - flame 불바다: 불 지대 길이 ×v
   - medic 소생: 잃은 병사가 v만큼(%p) 더 돌아온다(회복 몫에 더한다, 게이트·짓밟기 제외) */
/* 특수병 각성·2차 진화(개편 판 — 18.4): Lv6~9는 그 역할의 값(위력·회복) +15%씩(구간 13부터), Lv10은 아래 2차 진화, 그 위는 숙련(+4%씩) [수치는 초안]
   sniper 터지는 저격: 저격에 죽은 좀비가 터져 둘레에 제 체력의 v · rocket 불씨 로켓: 떨어진 자리에 불 지대 · flame 따라오는 불: 불 지대가 분대를 따라온다 ·
   medic 마지막 응급: 구간마다 한 번 전멸 직전에 병력이 그 구간 바닥선의 v로 돌아온다 */
export const SP_EVO2 = {
  sniper: { name: '터지는 저격', v: 0.5, text: () => `Lv10: 저격에 죽은 좀비가 터져 둘레 1.6m에 제 체력의 ${apc(SP_EVO2.sniper.v)}%` },
  rocket: { name: '불씨 로켓', text: () => 'Lv10: 로켓이 떨어진 자리에 불 지대가 남아요' },
  flame: { name: '따라오는 불', text: () => 'Lv10: 불 지대가 분대를 따라와요' },
  medic: { name: '마지막 응급', v: 0.5, text: () => `Lv10: 구간마다 한 번, 전멸 직전에 그 구간 바닥선의 ${apc(SP_EVO2.medic.v)}%로 돌아와요` },
};
export const SP_EVO = {
  sniper: { name: '거물 사냥', v: 3, cap: 0.5, text: () => `Lv5: 보스·정예·거구·독침 좀비에게 저격 위력 ×${SP_EVO.sniper.v}, 보스전 추가 피해 한도 +${apc(SP_EVO.sniper.cap)}%` },
  rocket: { name: '쌍발', text: () => 'Lv5: 한 번에 로켓 2발을 쏴요' },
  flame: { name: '불바다', v: 2, text: () => `Lv5: 불 지대 길이 ×${SP_EVO.flame.v}` },
  medic: { name: '소생', v: 0.3, text: () => `Lv5: 잃은 병사가 ${apc(SP_EVO.medic.v)}%p 더 돌아와요(게이트·짓밟기 제외)` },
};
/* 개편 판에 더해지는 시너지(COMBOS와 같은 모양 — 앞 단계 판은 COMBO_IDS 여섯만 본다) */
Object.assign(COMBOS, {
  rapidRocket: { need: ['rapid', 'rocket'], name: '속사 포격', v: 0.7, g2: true, text: () => `로켓 쏘는 간격 ×${COMBOS.rapidRocket.v}` },
  burstFlame: { need: ['burst', 'flame'], name: '기름불', v: 0.5, r: 1.6, g2: true, text: () => `불 지대에서 죽은 좀비가 터져 둘레 ${COMBOS.burstFlame.r}m에 제 체력의 ${apc(COMBOS.burstFlame.v)}%를 줘요` },
  frostMedic: { need: ['frost', 'medic'], name: '응급 얼음', g2: true, text: () => '느려진 좀비에게 잃은 병사는 바로 돌아와요' },
  // 24절 새 짝(특수병 셋이 둘째 짝을 받는다)
  shockRocket: { need: ['shock', 'rocket'], name: '폭풍 포격', g2: true, text: () => '로켓 폭발 안의 좀비마다 사슬이 한 번씩 튀어요' },
  acidSniper: { need: ['acid', 'sniper'], name: '녹이는 저격', g2: true, text: () => '저격이 대상에 쌓인 부식을 한 번에 터뜨려요(남은 부식 피해를 바로)' },
  cureMedic: { need: ['cure', 'medic'], name: '야전 병원', v: 0.5, g2: true, text: () => `치료 확률 +${apc(COMBOS.cureMedic.v)}% · 치료된 병사가 구간마다 한 번 손실을 막아요` },
});
/* 개편 판의 시너지 = 짝 넷(탄 ↔ 특수병 — ENDGAME.md 18.3) + 영웅 짝(긴 나팔 그대로). 앞 단계 판은 COMBO_IDS 여섯 */
export const COMBO_IDS2 = ['pierceSniper', 'rapidRocket', 'burstFlame', 'frostMedic', 'rapidMungchi', 'shockRocket', 'acidSniper', 'cureMedic'];
/* 개편 판에서 더 세진 짝 시너지 수치(v2 — 없는 것은 v 그대로) */
export const COMBO_V2 = { frostSniper: 1.5, burstRocket: 1, rapidMungchi: 9, frostFlame: 0.75 };
export const comboV = (id, g2) => (g2 && COMBO_V2[id] != null ? COMBO_V2[id] : COMBOS[id].v);
/* 짝 시너지의 글(개편 판은 v2 수치로) */
export function comboText(id, g2) {
  if (!g2 || COMBO_V2[id] == null) return COMBOS[id].text();
  const v = COMBO_V2[id];
  return id === 'frostSniper' ? `느려진 적에게 저격 위력 +${apc(v)}%` : id === 'burstRocket' ? `로켓 폭발 반경 +${v}m`
    : id === 'rapidMungchi' ? `돌격 나팔 ${HEROES.mungchi.skill.dur} → ${v}초` : `언 적이 불 지대에서 받는 피해 +${apc(v)}%`;
}
/* 펫 자리(여러 마리 출격): n번째 자리를 여는 코인 — 첫 자리는 처음부터 */
export const PET_SLOTS = [0, 3000, 8000];

/* 지역 */
export const BIOMES = [
  { id: 'desert', name: '모래 고개', boss: { name: '우락이', kind: '모래 도깨비', title: '모래 고개의 골목대장', line: '내 방망이 맛 좀 볼래?' } },
  { id: 'snow', name: '눈보라 기지', boss: { name: '빙수', kind: '설인', title: '눈보라 기지의 털복숭이', line: '으슬으슬~ 꽁꽁 얼려 주마!' } },
  { id: 'city', name: '무너진 도시', boss: { name: '와장창', kind: '철거반장', title: '무너진 도시의 공사왕', line: '공사 중! 싹 다 밀어 버린다!' } },
  { id: 'forest', name: '버섯 숲', boss: { name: '뽀글이', kind: '왕버섯', title: '버섯 숲의 포자 군주', line: '포자 한 아름 받아라~!' } },
  { id: 'lava', name: '용암 협곡', boss: { name: '화르륵', kind: '용암 거인', title: '용암 협곡의 심장', line: '뜨거운 맛 좀 봐라!' } },
  { id: 'park', name: '한밤 놀이공원', boss: { name: '곰곰이', kind: '인형탈', title: '한밤 놀이공원의 인기 스타', line: '같이 놀자~ 안 놔줄 거야!' } },
];
/* 보스 이름(정예 = 5의 배수 레벨, 대왕 = 10의 배수 — core.js levelTag의 tag) */
export const BOSS_PREFIX = { hard: '정예', super: '대왕' };
export function bossNameOf(L, tag = '') { const b = biomeOf(L).boss; return (BOSS_PREFIX[tag] ? BOSS_PREFIX[tag] + ' ' : '') + (b ? b.name : '보스'); }
export function biomeOf(L) { return BIOMES[Math.floor((Math.max(1, L) - 1) / 10) % BIOMES.length]; }
