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
    name: '뭉치 대장', role: '지휘', color: '#FF9F43',
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
export const HERO_MAX_LV = 5;

function lerp(a, b, lv) { return a + ((b - a) * (Math.max(1, Math.min(HERO_MAX_LV, lv)) - 1)) / (HERO_MAX_LV - 1); }
export const heroLerp = lerp;
/* 영웅 수치 num[k]의 그 레벨 값([Lv1, Lv5]면 사이를 선형으로, 숫자 하나면 그대로) */
export function heroVal(id, k, lv) { const v = HEROES[id].num[k]; return Array.isArray(v) ? lerp(v[0], v[1], lv) : v; }
const hv = heroVal;
const pc = (x) => Math.round(x * 100);

/* 영웅 레벨업 비용(Lv→Lv+1)과 진행에 따른 상한 */
export const HERO_COST = [0, 150, 300, 500, 800];
export function heroCost(lv) { return HERO_COST[lv] ?? Infinity; }
export function heroCap(maxL) { return Math.min(HERO_MAX_LV, 2 + Math.floor((Math.max(1, maxL) - 1) / 10)); }

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
