/* 영웅·특수병과 명단 — 이름·소개·수치를 한곳에 둔다(시뮬레이션·화면·테스트가 함께 읽는다). DOM 없음. */

/* 특수병과: 판 안에서만 얻는다(철창 구출, 금색 게이트). 분대에 최대 3명, 병과마다 1명.
   SIM 9: 이미 있는 병과를 또 구하면 그 특수병의 레벨이 오른다(Lv1 → Lv2 → Lv3, Lv3에서 또 구하면 병사로).
   lv: 레벨별 수치 [Lv1, Lv2, Lv3] — 시뮬레이션(core.js의 SP·unitVal)과 소개 글이 함께 읽는다 */
export const SP_LV_MAX = 3;
export const UNITS = {
  medic: {
    name: '의무병', unlock: 5, color: '#FF8FB8',
    line: '다친 병사를 일으켜 세워요',
    desc: '좀비·벽·독침·톱날·보스에게 잃은 병사의 60%를 몇 초 뒤 되살려요',
    tip: '의무병 합류! 잃은 병사 일부가 다시 일어나요',
    role: '좀비·벽·독침·톱날·보스에게 잃은 병사를 몇 초 뒤 되살려요',
    lv: { share: [0.6, 0.7, 0.8] },
    up: (lv) => `잃은 병사의 ${pc(unitVal('medic', 'share', lv))}%를 되살려요`,
  },
  sniper: {
    name: '저격수', unlock: 9, color: '#4FD1C5',
    line: '서 있는 칸과 상관없이 멀리 있는 강적부터',
    desc: '1.2초마다 독침 좀비·거구를 먼저 저격해요. 보스전에서는 보스를 쏴요',
    tip: '저격수 합류! 독침 좀비와 거구를 먼저 노려요',
    role: '독침 좀비·거구를 먼저 저격해요. 보스전에서는 보스를 쏴요',
    lv: { every: [1.2, 0.9, 0.7], dmg: [0.35, 0.42, 0.5] },
    up: (lv) => `${unitVal('sniper', 'every', lv)}초마다 저격(위력 ${pc(unitVal('sniper', 'dmg', lv))}%)`,
  },
  rocket: {
    name: '로켓병', unlock: 13, color: '#FFB347',
    line: '뭉친 좀비에 펑!',
    desc: '2.4초마다 가장 큰 무리나 앞을 막은 벽에 범위 로켓을 쏴요',
    tip: '로켓병 합류! 몰려온 좀비 떼를 한 번에 날려요',
    role: '가장 큰 무리나 앞을 막은 벽에 범위 로켓을 쏴요',
    lv: { every: [2.4, 2, 1.7], r: [2.2, 2.6, 3] },
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
    horn: 0.5,
    up: (lv) => `${unitVal('flame', 'every', lv)}초마다 불 지대(폭 ${unitVal('flame', 'w', lv)}m, ${unitVal('flame', 'T', lv)}초 동안 초당 위력 ${pc(unitVal('flame', 'dmg', lv))}%)`,
    pair: (lv) => `뭉치의 돌격 나팔 동안 불 지대 폭 +${pc(UNITS.flame.horn * synergyOf(lv))}%`,
  },
};
export const UNIT_IDS = Object.keys(UNITS);
/* 특수병 수치 lv[k]의 그 레벨 값(1..SP_LV_MAX) */
export function unitVal(k, key, lv) { const t = UNITS[k].lv[key]; return t[Math.max(1, Math.min(SP_LV_MAX, lv | 0 || 1)) - 1]; }
/* 영웅 짝 특수병(나비 ↔ 저격수, 보리 ↔ 의무병)의 레벨에 따른 짝 효과 배수 [Lv1, Lv2, Lv3] — 나비의 저격수 위력 보너스, 보리의 응급처치·괜찮아 주사 */
export const SYNERGY = [1, 1.25, 1.5];
export const synergyOf = (lv) => SYNERGY[Math.max(1, Math.min(SP_LV_MAX, lv | 0 || 1)) - 1];

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
    fxName: '기운 내', text: (lv) => `좀비를 처치할 때 ${pp('newt', lv)}% 확률로 영웅 게이지가 30% 더 차요`,
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

/* 탄종(ARSENAL.md 3절 '별 무기고'): 모은 별(모든 회차 합)이 stars를 넘으면 열리고, 출격 전에 하나를 고른다. 별은 쓰지 않는다.
   강화가 아니라 맞바꿈이다 — 어느 탄종이든 전체 승률은 보통탄과 비슷하고 잘 맞는 상황이 다르다(tools/ammobench.mjs).
   dmg: 한 발 피해 배수, range: 사거리(m, 없으면 기본 30), pierce: 좀비를 맞힌 뒤 바로 뒤 좀비 하나에 주는 몫,
   splash·r: 좀비에 맞으면 둘레 r(m)의 다른 좀비에 주는 몫, slow·T: 맞은 좀비가 T초 동안 느려지는 몫(보스는 안 느려진다) */
export const AMMO = {
  pierce: { name: '관통탄', stars: 45, dmg: 0.96, pierce: 0.6, color: '#F4F7FF' },
  burst: { name: '작렬탄', stars: 90, range: 27, splash: 0.35, r: 1, color: '#FFB347' },
  rapid: { name: '속사탄', stars: 135, dmg: 1.15, range: 24, color: '#FFE38A' },
  frost: { name: '빙결탄', stars: 180, dmg: 0.97, slow: 0.25, T: 0.8, color: '#8FD3FF' },
};
/* 소개 글(좋은 점 · 대신 잃는 점)은 수치에서 만든다 — 수치를 고치면 글도 따라간다 */
const apc = (x) => Math.round(x * 100);
export function ammoText(id) {
  const A = AMMO[id];
  if (!A) return { good: '기본 총알', bad: '' };
  const good = A.pierce ? `좀비를 뚫고 뒤의 좀비 하나에 ${apc(A.pierce)}% 더`
    : A.splash ? `좀비에 맞으면 둘레 ${A.r}m에 ${apc(A.splash)}% 더`
      : A.slow ? `맞은 좀비가 ${A.T}초 동안 ${apc(A.slow)}% 느려져요`
        : `화력 +${apc(A.dmg - 1)}%`;
  const bad = [A.dmg < 1 ? `한 발 피해 −${apc(1 - A.dmg)}%` : '', A.range ? `사거리 30 → ${A.range}m` : ''].filter(Boolean).join(', ');
  return { good, bad };
}
export const AMMO_IDS = Object.keys(AMMO);
/* 그 별 수로 열린 탄종 */
export const ammoOpen = (id, stars) => !!AMMO[id] && stars >= AMMO[id].stars;

/* 탄 효과(무한모드 빌드 단계 해금 2단계 — 무한모드에서만): 탄종의 '좋은 점'만 떼어 낸 것. 보스 뒤 카드·탄종 상자로 얻고, 같은 효과를 또 얻으면 레벨 +1(Lv3까지).
   Lv1·2·3 = 그 탄종 값의 FX_LV배(50·100·150%) [초안]. 대신 쪽(피해·사거리)은 없다 — 출격 때 고른 탄종(s.ammo)만 Lv2로 한 칸을 차지하고 대신 쪽을 그대로 진다.
   슬롯 FX_SLOTS칸(같은 효과는 한 칸). 수치는 AMMO에서 — 탄종 수치를 고치면 효과도 따라간다 */
export const FX_LV = [0.5, 1, 1.5];
export const FX_LV_MAX = 3;
export const FX_SLOTS = 2;
export const FX_BASE_LV = 2;   // 출격 탄종이 차지하는 레벨
const fxK = (lv) => FX_LV[Math.max(1, Math.min(FX_LV_MAX, lv | 0 || 1)) - 1];
/* 그 레벨의 좋은 점: { pierce } | { splash, r } | { dmg }(화력 배수) | { slow, T } */
export function fxVal(id, lv) {
  const A = AMMO[id];
  const k = fxK(lv);
  if (!A) return {};
  if (A.pierce) return { pierce: A.pierce * k };
  if (A.splash) return { splash: A.splash * k, r: A.r };
  if (A.slow) return { slow: A.slow * k, T: A.T };
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
   - banner 전장의 휘장: 병력이 이 판 최고치의 at 아래면(화면의 위기 신호와 같은 문턱) 총알 화력 ×(1 + v)
   - megaphone 빨간 확성기: 빨간 덧셈 칸(−로 시작한 칸)이 red배 빨리 오른다 — 대신 파란 칸은 blue배
   - coil 과부하 코일: 무기 단계 상한 3 → tier(core.js WEAPON의 다섯째 값) — 대신 지원병 상자 병력 ×men
   - fourth 넷째 자리: 특수병 자리 3 → slots — 대신 특수병마다 호위 병사 4 → escort명(병과가 자리보다 많은 판에만 나온다 — 지금 세 병과로는 넷째 자리가 빈다)
   - heart 불굴의 심장: 한 번 전멸을 무효로 — 병력이 그 구간 바닥선(core.js segFloor)의 v로 돌아온다. 쓰면 사라진다
   - bag 수집가의 가방: 대왕이 아닌 보스의 알 확률 EGG.pEndless → egg(화면 쪽 뽑기 — core.js eggP) — 대신 보스 뒤 카드 3장 → cards장
   - pouch 넓은 탄낭: 탄 효과 슬롯 FX_SLOTS → slots — 대신 증원 카드가 나오지 않는다(얻을 수 있는 탄 효과가 슬롯보다 많은 판에만 나온다) */
export const RELICS = {
  compass: { name: '나침반', kings: 0, ahead: 45, v: 1.5, text: () => `갈림길 보상 상자 속이 ${RELICS.compass.ahead}m 앞에서 보이고, 위험한 쪽 보상 병사 ×${RELICS.compass.v}`, cost: () => '' },
  banner: { name: '전장의 휘장', kings: 0, at: 0.4, v: 0.4, text: () => `병력이 이 판 최고치의 ${apc(RELICS.banner.at)}% 아래면 화력 +${apc(RELICS.banner.v)}%`, cost: () => '' },
  megaphone: { name: '빨간 확성기', kings: 0, red: 1.5, blue: 0.8, text: () => `빨간 덧셈 칸이 ${RELICS.megaphone.red}배 빨리 올라요`, cost: () => `파란 칸은 ${RELICS.megaphone.blue}배` },
  coil: { name: '과부하 코일', kings: 0, tier: 4, men: 0.7, text: () => `무기 단계 상한 3 → ${RELICS.coil.tier}`, cost: () => `지원병 상자 병력 −${apc(1 - RELICS.coil.men)}%` },
  fourth: { name: '넷째 자리', kings: 2, slots: 4, escort: 6, text: () => `특수병 자리 3 → ${RELICS.fourth.slots}`, cost: () => `특수병마다 호위 병사 4 → ${RELICS.fourth.escort}명` },
  heart: { name: '불굴의 심장', kings: 3, v: 0.5, text: () => `한 번 전멸해도 그 구간 바닥선의 ${apc(RELICS.heart.v)}%로 돌아와요`, cost: () => '쓰면 사라져요' },
  bag: { name: '수집가의 가방', kings: 4, egg: 0.35, cards: 2, text: () => `일반 보스의 알 확률 ${apc(EGG.pEndless)} → ${apc(RELICS.bag.egg)}%`, cost: () => `카드 3장 → ${RELICS.bag.cards}장` },
  pouch: { name: '넓은 탄낭', kings: 5, slots: 3, text: () => `탄 효과 슬롯 ${FX_SLOTS} → ${RELICS.pouch.slots}`, cost: () => '증원 카드가 나오지 않아요' },
};
export const RELIC_IDS = Object.keys(RELICS);
for (const id of RELIC_IDS) Object.defineProperties(RELICS[id], { good: { get() { return this.text(); } }, bad: { get() { return this.cost(); } } });

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
