/* 영웅·특수병과 명단 — 이름·소개·수치를 한곳에 둔다(시뮬레이션·화면·테스트가 함께 읽는다). DOM 없음. */

/* 특수병과: 판 안에서만 얻는다(철창 구출, 금색 게이트). 분대에 최대 3명, 병과마다 1명. */
export const UNITS = {
  medic: {
    name: '의무병', unlock: 5, color: '#FF8FB8',
    line: '다친 병사를 일으켜 세워요',
    desc: '좀비·벽·독침·톱날·보스에게 잃은 병사의 60%를 몇 초 뒤 되살려요',
    tip: '의무병 합류! 잃은 병사 일부가 다시 일어나요',
  },
  sniper: {
    name: '저격수', unlock: 9, color: '#4FD1C5',
    line: '서 있는 칸과 상관없이 멀리 있는 강적부터',
    desc: '1.2초마다 독침 좀비·거구를 먼저 저격해요. 보스전에서는 보스를 쏴요',
    tip: '저격수 합류! 독침 좀비와 거구를 먼저 노려요',
  },
  rocket: {
    name: '로켓병', unlock: 13, color: '#FFB347',
    line: '뭉친 좀비에 펑!',
    desc: '2.4초마다 가장 큰 무리나 앞을 막은 벽에 범위 로켓을 쏴요',
    tip: '로켓병 합류! 몰려온 좀비 떼를 한 번에 날려요',
  },
};
export const UNIT_IDS = Object.keys(UNITS);

/* 영웅: 한 판에 한 명 출격. 합류는 진행 조건으로 무료, 레벨(1~5)은 코인으로 올린다.
   스킬은 게이지가 차면 버튼(또는 자동)으로 쓴다. 수치는 Lv1→Lv5 선형. */
export const HEROES = {
  mungchi: {
    name: '뭉치 대장', role: '지휘', color: '#FF9F43',
    look: '별 달린 큰 철모가 눈썹까지 덮은 동글이, 주황 스카프, 몸만 한 확성기',
    line: '목소리는 부대 최강, 용기는… 연습 중!',
    unlock: { type: 'clear', L: 2, text: '레벨 2를 깨면 합류' },
    passive: { name: '집합 나팔', text: (lv) => `덧셈 게이트를 쏴서 올리는 속도 ×${lerp(1.1, 1.25, lv).toFixed(2)}` },
    skill: { name: '돌격 나팔', cd: 16, dur: 5, text: (lv) => `5초 동안 총알 피해 ×${lerp(1.4, 1.6, lv).toFixed(2)} (게이트 올리기에도 적용)` },
  },
  bori: {
    name: '보리', role: '의무', color: '#FF8FB8', match: 'medic',
    look: '토끼귀 간호모, 몸보다 큰 하트 가방, 코에 반창고',
    line: '다치면 혼나요! …그래도 다치면 바로 와요.',
    unlock: { type: 'clear', L: 8, text: '레벨 8을 깨면 합류' },
    passive: { name: '응급처치', text: (lv) => `잃은 병사의 ${Math.round(lerp(12, 30, lv))}%가 천천히 돌아와요(게이트 손실 제외)` },
    skill: { name: '괜찮아 주사', cd: 20, dur: 2.5, text: (lv) => `방금 잃은 병사의 ${Math.round(lerp(50, 70, lv))}%를 바로 되살리고, 잠깐 손실을 크게 줄여요` },
  },
  nabi: {
    name: '나비', role: '저격', color: '#4FD1C5', match: 'sniper',
    look: '고양이귀 비니, 졸린 반달눈, 키 두 배의 총, 꼬리 끝 리본',
    line: '하암… 한 발이면 돼. 깨우지 마.',
    unlock: { type: 'stars', n: 30, text: '별 30개를 모으면 합류' },
    passive: { name: '고양이 눈', text: (lv) => `1.8초마다 직접 저격(위력 ${Math.round(lerp(18, 28, lv))}%). 저격수가 있으면 대신 저격수 위력 +${Math.round(lerp(30, 50, lv))}%` },
    skill: { name: '백발백묘', cd: 15, dur: 3, text: (lv) => `3초 동안 강한 적을 12발 연속 저격(한 발 위력 ${Math.round(lerp(40, 60, lv))}%, 보스전 추가 피해 한도 +${30 + 3 * (Math.max(1, Math.min(HERO_MAX_LV, lv)) - 1)}%)` },
  },
};
export const HERO_IDS = Object.keys(HEROES);
export const HERO_MAX_LV = 5;

function lerp(a, b, lv) { return a + ((b - a) * (Math.max(1, Math.min(HERO_MAX_LV, lv)) - 1)) / (HERO_MAX_LV - 1); }
export const heroLerp = lerp;

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
  { id: 'desert', name: '모래 고개' },
  { id: 'snow', name: '눈보라 기지' },
];
export function biomeOf(L) { return BIOMES[Math.floor((Math.max(1, L) - 1) / 10) % BIOMES.length]; }
