/* 도트 그림 데이터 — DOM 없음(노드 테스트에서 검사한다).
   격자는 한 글자 = 한 픽셀('.' 투명), 색은 시트마다 팔레트(한 글자 → '#rrggbb').
   큰 그림(거구·보스·톱날·연기)은 같은 픽셀 밀도의 도형 명령(raster.js runOps)으로 그린다.
   외곽선(1px, 자두색)은 굽는 단계에서 자동으로 붙는다. 세계 스프라이트는 줄이기만 한다(1, 0.75, 0.5 단계). */

export const OUT = '#2B1D2E';

/* 공용 색 램프(모든 지역 공통) */
export const RAMP = {
  outline: OUT,
  white: '#FFFFFF',
  skin: '#FFD2AE',
  blush: '#FF8FA8',
  team: ['#DDF3FF', '#6CC0FF', '#3E8BEA', '#2B5EB8', '#2D3D74'],
  pack: ['#E2AE62', '#A8733C'],
  boots: '#5A3B2E',
  gun: '#596277',
  zgreen: ['#C9E36A', '#8FD16A', '#5E9E4B'],
  zcloth: ['#9A73D1', '#6A4BA0', '#4A3D6E'],
  danger: ['#FFC2B3', '#FF5D5D', '#E8384F', '#A92644'],
  gold: ['#FFF09A', '#FFD84A', '#FFC93C', '#D08A12'],
  wood: ['#F0C27E', '#C98A4E', '#8E5A30'],
  grey: ['#E8ECF2', '#C9CED6', '#9AA2B0'],
};

/* 게이트·의미 색: 파랑 = 좋음, 빨강 = 나쁨. 땅·연석은 이 색들과 ΔE 20 이상 떨어져야 한다(테스트). */
export const SEMANTIC = {
  good: ['#6CC0FF', '#3E8BEA', '#2B5EB8', '#4FA3FF'],
  bad: ['#FF5D5D', '#E8384F', '#A92644', '#FF6B5B'],
};

/* ---------------- 지역 팔레트 ---------------- */
export const BIOME = {
  desert: {
    sky: ['#2E2350', '#5B3A6E', '#A0517A', '#E8835A', '#FFB86B'],
    sun: '#FFE7A8', hillF: '#8A5272', hillN: '#5E3A5E',
    ground: '#E6B77C', ground2: '#CF9A62', fog: '#F0A877',
    road: '#4E4A5E', road2: '#57536A', curbA: '#E9A35B', curbB: '#FFF1DE', line: '#F2E6C8',
    shadow: 'rgba(60,20,40,.30)', aim: 'rgba(255,250,230,.07)',
    props: ['cactus', 'rock', 'barrel', 'sign', 'bush'],
  },
  snow: {
    sky: ['#3E4C8C', '#5C6FB0', '#8E9FD6', '#C4CDEB', '#ECEFFA'],
    sun: '#FFFFFF', hillF: '#B7B4D8', hillN: '#8F8BB8',
    ground: '#F4F6FA', ground2: '#DCE0EA', fog: '#E6E8F2',
    road: '#5E6075', road2: '#67697F', curbA: '#FFFFFF', curbB: '#43B8A8', line: '#FFFFFF',
    shadow: 'rgba(50,40,90,.22)', aim: 'rgba(255,255,255,.10)',
    props: ['pine', 'snowman', 'ice', 'pine2', 'drift'],
  },
};
export const BIOME_GROUND_KEYS = ['ground', 'ground2', 'road', 'road2', 'curbA', 'curbB'];

/* ---------------- 캐릭터 팔레트 ---------------- */
const BASE = { K: OUT, W: '#FFFFFF', s: '#FFD2AE', S: '#EDB08C', p: '#FF8FA8', k: '#5A3B2E', g: '#596277', G: '#8A93A6' };
const TEAM = { ...BASE, H: '#DDF3FF', h: '#6CC0FF', b: '#3E8BEA', B: '#2B5EB8', c: '#3567C9', n: '#2D3D74', o: '#E2AE62', O: '#A8733C' };
const TEAM_HURT = { ...TEAM, H: '#FFE4DC', h: '#FF9C8C', b: '#E8606A', B: '#B8405A', c: '#C24A66', n: '#6A2D4A', o: '#FFB4A0', O: '#C06A5A' };
const MEDIC = { ...TEAM, H: '#FFFFFF', h: '#F2F0F7', b: '#D3CFE3', B: '#A8A1C4', X: '#FF5F98', x: '#FF9EC3', z: '#E0709A' };
const SNIPER = { ...TEAM, H: '#E2E0A8', h: '#B5B276', b: '#8C8A52', B: '#6B6A3C', r: '#6B4A3A', o: '#8C8A52', O: '#5E5D34', t: '#7FA040' };
const ROCKET = { ...TEAM, H: '#FFE6C2', h: '#FFA54A', b: '#EE7A26', B: '#B95514', T: '#7FA040', E: '#3E5126', Y: '#FFD84A', F: '#FFF4B0', f: '#FFB347' };

export const PAL = {
  team: TEAM, teamHurt: TEAM_HURT, medic: MEDIC, sniper: SNIPER, rocket: ROCKET,
};

/* ---------------- 분대 병사(뒷모습, 12×12 → 외곽선 포함 14×14) ---------------- */
const B12 = '............';
const SOL_HEAD = [
  '..hhhhhh....',
  '.hhHHhhhh...',
  'hhHhhhhhhb..',
  'hhhhhhhhbb.g',
  'hhhhhhhbbb.g',
  'sBBBBBBBBs.g',
];
const SOL_BODY = [
  '.cOooooOc..g',
  'ccOooooOcc.g',
  'scOOOOOOcsg.',
  '.nnnnnnnn...',
];
/* 통통 튀는 걸음 4프레임: 닿기(눌림, 다리 1줄) / 지나가기(늘어남, 한 발 듦) */
const LEGS = [
  [B12, null, '..kk..kk....'],
  [null, '..kk..nn....', '......kk....'],
  [B12, null, '..kk..kk....'],
  [null, '..nn..kk....', '..kk........'],
];
const pad = (rows, w) => rows.map((r) => r.padEnd(w, '.'));
function walk(head, body, f, w = 12) {
  const L = LEGS[f];
  const rows = [];
  if (L[0]) rows.push(L[0]);
  rows.push(...head, ...body);
  if (L[1]) rows.push(L[1]);
  rows.push(L[2]);
  return pad(rows, w);
}
function idle2(head, body, w = 12) {
  // 숨쉬기: 몸통 한 줄을 눌러 머리가 1px 내려온다
  return pad([B12, B12, ...head, body[1], body[2], body[3], '..kk..kk....'], w);
}
function crowdFrames(head, body, w) {
  return [0, 1, 2, 3].map((f) => walk(head, body, f, w)).concat([walk(head, body, 0, w), idle2(head, body, w)]);
}

/* 의무병: 흰 철모 + 분홍 하트(빨간 십자 없음), 분홍 구급 가방, 총 없음 */
const MED_HEAD = [
  '..hhhhhh....',
  '.hhHHhhhh...',
  'hhHhXhXhhb..',
  'hhhhXXXhbb..',
  'hhhhhXhbbb..',
  'sBBBBBBBBs..',
];
const MED_BODY = [
  '.cOxxxxOc...',
  'ccOxWWxOcc..',
  'scOxxxxOcs..',
  '.nnnnnnnn...',
];
/* 저격수: 챙 넓은 부시햇 + 어깨 위로 솟은 긴 총열 */
const SNP_HEAD = [
  '...........G',
  '...hhhhh...g',
  '..hHHhhhb..g',
  '..hhhhhhbbGG',
  'BBBBBBBBBBBg',
  '.rrsrrrrsr.g',
];
const SNP_BODY = [
  '.cOooooOc..g',
  'ccOottoOcc.g',
  'scOOOOOOcsg.',
  '.nnnnnnnn...',
];
/* 로켓병: 주황 철모 + 머리 위로 솟은 올리브색 발사관 */
const RKT_HEAD = [
  '..........EE',
  '..hhhhhh..TT',
  '.hhHHhhhh.TT',
  'hhHhhhhhhbTT',
  'hhhhhhhhbbTT',
  'hhhhhhhbbbTT',
  'sBBBBBBBBsTT',
];
const RKT_BODY = [
  '.cOooooOcYTT',
  'ccOooooOccTT',
  'scOOOOOOcs..',
  '.nnnnnnnn...',
];
/* 로켓 쏘기: 웅크리기 → 발사(불꽃) → 회복 */
const RKT_CROUCH = pad([B12, B12, ...RKT_HEAD.slice(0, 6), 'sBBBBBBBBsTT', '.cOooooOcYTT', 'scOOOOOOcs..', '.kkk..kkk...'], 12);
const RKT_FIRE = pad(['.........fFf', '..........F.', ...RKT_HEAD.slice(1, 6), 'sBBBBBBBBsTT', '.cOooooOcYTT', 'scOOOOOOcs..', '.kkk..kkk...'], 12);

/* 뒷줄 철모(병력 규모 표시용 5×4) */
const HELMET = ['.hhh.', 'hHhhb', 'hhhbb', 'BBBBB'];

/* 앞모습 병사(철창 속 포로·승리용): 손 흔들기 2프레임 + 슬픈 얼굴 */
function frontRows(hat, face, arms, emblem) {
  return [...hat, ...face, ...arms];
}
const FRONT_FACE = [
  '.ssssssssss.',
  '.sKKssssKKs.',
  '.sKWssssKWs.',
  '.ppssKKsspp.',
];
const FRONT_SAD = [
  '.ssssssssss.',
  '.sssssssssss',
  '.sKKssssKKs.',
  '.wpssKKsspw.',
];
const FRONT_ARMS = [
  ['s.cccccc....', '.sccccccs...', '..cccccc.s..', '..nnnnnn....', '..kk..kk....'],
  ['..cccccc..s.', '.scccccccs..', 's.cccccc....', '..nnnnnn....', '..kk..kk....'],
];
const FRONT_ARMS_SAD = ['.scccccccs..', '.scccccccs..', '..cccccc....', '..nnnnnn....', '..kk..kk....'];
const FRONT_HAT = {
  team: ['...hhhhhh...', '..hHHhhhhh..', '.hHhhhhhhhb.', '.BBBBBBBBBB.'],
  medic: ['...hhhhhh...', '..hHhXhXhh..', '.hHhhXXXhhb.', '.BBBBBXBBBB.'],
  sniper: ['....hhhh....', '..hHHhhhhb..', '.hhhhhhhhbb.', 'BBBBBBBBBBBB'],
  rocket: ['.........EE.', '...hhhhhhTT.', '..hHHhhhhTT.', '.BBBBBBBBTT.'],
};
function captive(k) {
  const hat = FRONT_HAT[k];
  const w = 12;
  return [
    pad(frontRows(hat, FRONT_FACE, FRONT_ARMS[0]), w),
    pad(frontRows(hat, FRONT_FACE, FRONT_ARMS[1]), w),
    pad(frontRows(hat, FRONT_SAD, FRONT_ARMS_SAD), w),
  ];
}
const PAL_FRONT = (p) => ({ ...p, w: '#8FD3FF' });

/* ---------------- 영웅(뒷모습 14×16 몸통 + 소품, 4걸음 × 펄럭임 2 + 서기 2 + 기절 + 스킬 2 + 돌아보기 2) ---------------- */
const MUNGCHI = {
  ...BASE, h: '#8E9E58', H: '#C3D18A', b: '#6C7A40', B: '#525D2E', y: '#FFD84A', Y: '#FFF09A',
  e: '#FF9F43', E: '#D9731F', c: '#3567C9', C: '#2B5EB8', n: '#2D3D74', m: '#FFF1DE', M: '#E9B26B', q: '#C98A4E',
};
const BORI = {
  ...BASE, w: '#FFFFFF', v: '#ECE6F2', u: '#FFC0D6', r: '#B5734A', R: '#8E5636', q: '#FF6FA0', Q: '#FFB0CC', z: '#D94A80',
  c: '#FFFFFF', C: '#E6DCEB', n: '#C25A86',
};
const NABI = {
  ...BASE, h: '#4FD1C5', H: '#A6F0E6', b: '#2F9E95', B: '#257D76', i: '#FFB0C8', r: '#7A6F9B', R: '#5C537A',
  c: '#3B3F6B', C: '#2C2F52', n: '#2C2F52', t: '#E8DCCB', T: '#BBAF9C', x: '#FF6FA0', w: '#C98A4E',
};

/* 뭉치 대장: 눈썹까지 덮는 큰 철모(뒤에도 금별), 주황 스카프 꼬리, 몸만 한 확성기 */
const MUN_HEAD = [
  '....hhhhhh......',
  '..hhHHhhhhhh....',
  '.hHHhhhyhhhhb...',
  'hHHhhyyyyyhhbb..',
  'hHhhhhyyyhhhbb..',
  'hhhhhhyhyhhbbb..',
  'BBBBBBBBBBBBBB..',
];
const MUN_NAPE = ['.ssseeeeeeeess..'];
const MUN_LOOK = [['.sKpeeeeeeeess..'], ['.sKpeeeeeeeess..'.replace('K', 's')]];
const MUN_BODY = [
  [
    'EEcceeEccccc.M..',
    'E.cCeEcCcccsmM..',
    '..cCcccCcccmmmM.',
    '..cCcccCccsmmmmM',
    '..cCCCCCccc.mmM.',
    '..nnnnnnnnn..M..',
  ],
  [
    '.Ecceeeccccc.M..',
    'EEcCeEcCcccsmM..',
    '..cCcccCcccmmmM.',
    '..cCcccCccsmmmmM',
    '..cCCCCCccc.mmM.',
    '..nnnnnnnnn..M..',
  ],
];
const MUN_ACT = [
  [
    '..cceeEcccss.MM.',
    '..cCeEcCccsmmmMM',
    '..cCcccCcc.mmmM.',
    '..cCcccCcc..mM..',
    '..cCCCCCcc......',
    '..nnnnnnnn......',
  ],
  [
    '..cceeEccss.MMM.',
    '..cCeEcCcsmmmmMM',
    '..cCcccCc.mmmmM.',
    '..cCcccCc...mM..',
    '..cCCCCCcc......',
    '..nnnnnnnn......',
  ],
];
const HERO_LEGS = [
  ['...kk...kk......', null],
  ['...kk...nn......', '.........kk.....'],
  ['...kk...kk......', null],
  ['...nn...kk......', '...kk...........'],
];
function heroWalk(head, nape, body, f, w = 16) {
  const L = HERO_LEGS[f];
  const rows = [];
  if (!L[1]) rows.push('.'.repeat(w));
  rows.push(...head, ...nape, ...body, L[0]);
  if (L[1]) rows.push(L[1]);
  return pad(rows, w);
}
function heroSheet(head, nape, look, bodies, act, ko, w) {
  const out = [];
  for (const b of bodies) for (let f = 0; f < 4; f++) out.push(heroWalk(head, nape, b, f, w));
  out.push(heroWalk(head, nape, bodies[0], 0, w), heroWalk(head, nape, bodies[1], 2, w));   // 서기 A/B
  out.push(pad(ko, w));
  out.push(heroWalk(head, nape, act[0], 0, w), heroWalk(head, nape, act[1], 0, w));
  out.push(heroWalk(head, look[0], bodies[0], 0, w), heroWalk(head, look[1], bodies[0], 0, w));
  return out;
}
const MUN_KO = [
  '................',
  '.....hhhhhh.....',
  '...hhHHhhhhhh...',
  '..hHHhhhyhhhhb..',
  '.hHHhhyyyyyhhbb.',
  '.hHhhhhyyyhhhbb.',
  '.hhhhhhyhyhhbbb.',
  '.BBBBBBBBBBBBBB.',
  '..ssseeeeeeeess.',
  '.EcceeEccccccM..',
  'kkcCcccCcccsmmM.',
  'kkcCCCCCcccmmmmM',
  '..nnnnnnnnnn.mM.',
];

/* 보리: 토끼귀 간호모, 몸보다 큰 하트 가방 */
const BORI_HEAD = [
  '..wu.....wu.....',
  '..wu.....wu.....',
  '..wuw...wuw.....',
  '...ww...ww......',
  '...vwwwwwwv.....',
  '..vwwqwqwwwv....',
  '..vwwqqqwwwv....',
  '.rrvvvqvvvvrr...',
];
const BORI_NAPE = ['.rrRrrrrrrRrr...'];
const BORI_LOOK = [['.rsKprrrrrRrr...'], ['.rssprrrrrRrr...']];
const BORI_BAG = [
  '.cqqqcqqqc......',
  '.qQQqqqqqqz.....',
  'sqQqqWqWqqzs....',
  '.qqqqWWWqqz.....',
  '..qqqqWqqz......',
  '..cqqqqqzc......',
  '..ccqqqzcc......',
  '..nnnqznnn......',
];
const BORI_BODY = [BORI_BAG, BORI_BAG];
const BORI_EARS_B = [
  '...wu.....wu....',
  '..wu.....wu.....',
  '..wuw...wuw.....',
  '...ww...ww......',
];
const BORI_ACT = [
  [
    's.cqqqcqqqc.s...',
    's.qQQqqqqqqzs...',
    '.cqQqqWqWqqzc...',
    '..qqqqWWWqqz....',
    '...qqqqWqqz.....',
    '...cqqqqqzc.....',
    '...ccqqqzcc.....',
    '...nnnqznnn.....',
  ],
  [
    '.scqqqcqqqcs....',
    '.cqQQqqqqqqzc...',
    '..qQqqWqWqqz....',
    '..qqqqWWWqqz....',
    '...qqqqWqqz.....',
    '...cqqqqqzc.....',
    '...ccqqqzcc.....',
    '...nnnqznnn.....',
  ],
];
const BORI_KO = [
  '................',
  '.....wu...wu....',
  '....wu...wu.....',
  '....wuw.wuw.....',
  '....vwwwwwwv....',
  '...vwwqwqwwwv...',
  '...vwwqqqwwwv...',
  '..rrvvvqvvvvrr..',
  '..rrRrrrrrrRrr..',
  '..cqqqcqqqc.....',
  '.sqQQqqqqqqzs...',
  'kkqQqqWqWqqzkk..',
  '..qqqqWWWqqz....',
  '...qqqqWqqz.....',
];

/* 나비: 고양이귀 비니, 키 두 배의 총(등에 비스듬히), 꼬리 끝 리본 */
const NABI_HEAD = [
  '..............g.',
  '.............g..',
  '..h.......h.g...',
  '..hh.....hhg....',
  '..hih...hihG....',
  '..hhhhhhhhhg....',
  '.hHHhhhhhgbb....',
  '.hHhhhhhghbb....',
  '.BBBBBBBgBBB....',
];
const NABI_NAPE = ['..rrrrrwrrr.....'];
const NABI_LOOK = [['..sKprrwrrr.....'], ['..sspprwrrr.....']];
const NABI_BODY = [
  [
    '..ccccwcccc.....',
    '.scCCwCCCcs.....',
    '..cCwcccCc......',
    '..cwcccccc......',
    '..wnnnnnnn..tx..',
    '.......tt.tt....',
  ],
  [
    '..ccccwcccc.....',
    '.scCCwCCCcs.....',
    '..cCwcccCc......',
    '..cwcccccc...x..',
    '..wnnnnnnn..tt..',
    '.......tttt.....',
  ],
];
const NABI_ACT = [
  [
    '..ccccccccs.....',
    '.scCCCCCcs......',
    '..cCcccCc.......',
    '..cccccccc......',
    '..nnnnnnnn..tx..',
    '.......tt.tt....',
  ],
  [
    '..ccccccccs.....',
    '.scCCCCCcs......',
    '..cCcccCc.......',
    '..cccccccc...x..',
    '..nnnnnnnn..tt..',
    '.......tttt.....',
  ],
];
const NABI_ACT_HEAD = [
  '..........gg....',
  '..h.......hg....',
  '..hh.....hhg....',
  '..hih...hihG....',
  '..hhhhhhhhhG....',
  '.hHHhhhhhhgg....',
  '.hHhhhhhhhbb....',
  '.BBBBBBBBBBB....',
  '................',
];
const NABI_KO = [
  '..............g.',
  '.............g..',
  '...h.......hg...',
  '...hh.....hg....',
  '...hih...hihG...',
  '...hhhhhhhhhg...',
  '..hHHhhhhhgbb...',
  '..hHhhhhhghbb...',
  '..BBBBBBBgBBB...',
  '...rrrrrwrrr....',
  '..sccccwccccs...',
  'kkccCwCCCccckk..',
  '...wnnnnnnn.tx..',
];

function nabiSheet() {
  const s = heroSheet(NABI_HEAD, NABI_NAPE, NABI_LOOK, NABI_BODY, NABI_ACT, NABI_KO, 16);
  // 스킬 자세는 총을 들어 겨눈다(머리 위 총열이 곧게 선다)
  s[11] = heroWalk(NABI_ACT_HEAD, NABI_NAPE, NABI_ACT[0], 0, 16);
  s[12] = heroWalk(NABI_ACT_HEAD, NABI_NAPE, NABI_ACT[1], 0, 16);
  return s;
}
function boriSheet() {
  const s = heroSheet(BORI_HEAD, BORI_NAPE, BORI_LOOK, BORI_BODY, BORI_ACT, BORI_KO, 16);
  // 귀가 박자 어긋나게 팔랑인다(펄럭임 B)
  const headB = [...BORI_EARS_B, ...BORI_HEAD.slice(4)];
  for (let f = 0; f < 4; f++) s[4 + f] = heroWalk(headB, BORI_NAPE, BORI_BODY[1], f, 16);
  s[9] = heroWalk(headB, BORI_NAPE, BORI_BODY[1], 2, 16);
  return s;
}

/* 영웅 얼굴(앞모습 20×19) — 스킬 컷인·HUD 버튼용 */
const FACE_MUNGCHI = [
  '......hhhhhhhh......',
  '...hhhHHhhhyhhhh....',
  '..hHHhhhhhyyyhhhhb..',
  '.hHHhhhhyyyyyyyhhbb.',
  '.hHhhhhhhyyyyyhhhbb.',
  'hhhhhhhhhyyhyyhhhbbb',
  'BBBBBBBBBBBBBBBBBBBB',
  '.BssssssssssssssssB.',
  '.sssKKKssssssKKKsss.',
  'ssssKWKKssssKWKKssss',
  'ssssKKKKssssKKKKsssw',
  'sppsKKKssssssKKKsppw',
  'sppssssssKKssssssppw',
  '.ssssssssKKssssssss.',
  '..ssssssssssssssss..',
  '..eeeeeeeeeeeeeeee..',
  '.eeEEeeeeeeeeeeeEee.',
  '.ccceEeccccccceEccc.',
  'ccccccCcccccccCccccc',
];
const FACE_BORI = [
  '...wu..........wu...',
  '...wuw........wuw...',
  '....wuw......wuw....',
  '.....vwwwwwwwwv.....',
  '....vwwwwqwqwwwwv...',
  '...vwwwwwqqqwwwwwv..',
  '..rrvvvvvvqvvvvvvrr.',
  '.rrrrrrrrrrrrrrrrrrr',
  '.rrssssssssssssssrr.',
  'rrsKKKssssssssKKKsrr',
  'rrKWKKKssssssKWKKKrr',
  'rrKKKKKssssssKKKKKrr',
  'rrsKKKssssssssKKKsrr',
  'rrppssssvGGvsssspprr',
  '.rppssssssssssssppr.',
  '..sssssssKKssssss...',
  '...ssssssssssssss...',
  '...cccccqqqqccccc...',
  '..ccccccqQQqccccccc.',
];
const FACE_NABI = [
  '..h..............h..',
  '..hh............hh..',
  '..hih..........hih..',
  '..hiih.hhhhhh.hiih..',
  '..hhhhhhHHhhhhhhhh..',
  '.hHHhhhhhhhhhhhhhbb.',
  '.hHhhhhhhhhhhhhhhbb.',
  '.BBBBBBBBBBBBBBBBBB.',
  '.rrrssssssssssssrrr.',
  'rrssKKKKKssKKKKKssrr',
  'rrsKKKKKKssKKKKKKsrr',
  'rrssKWKKsssKWKKsssrr',
  'rrsssssssssssssssssr',
  'rrppsssssKsKsssssppr',
  '.rppssssssKssssssppr',
  '..sssssssssssssssr..',
  '...ssssssssssssss...',
  '...cccccccccccccc...',
  '..cccCccccccccCcccc.',
];

/* ---------------- 좀비(앞모습) ---------------- */
const ZG = { ...BASE, g: '#8FD16A', G: '#5E9E4B', L: '#F2E6C8', u: '#9A73D1', U: '#6A4BA0', l: '#4A3D6E', f: '#3A3348', t: '#FF7F9E', m: '#7A2E4A' };
const ZR = { ...ZG, g: '#C9E36A', G: '#93AE3E', u: '#F28A3A', U: '#C2611F', l: '#3B3B5C', L: '#FFFFFF' };
const ZS = { ...ZG, g: '#B79BE0', G: '#8A6CC0', u: '#5E4590', U: '#4A3570', V: '#B9F25B', v: '#7FC93A', Y: '#F4FFB0' };
const ZB = { ...BASE, g: '#76B358', G: '#4F8A3E', u: '#5E6577', U: '#454B5C', x: '#EDE4CC', l: '#3A3D4A', f: '#2E2A36', L: '#F2E6C8', t: '#FF7F9E' };
const Z_HEAD = [
  '..gggggg..',
  '.ggggLLgg.',
  'gggLLggggg',
  'gWWggggWWg',
  'gWKggggKWg',
  'gppgKKgppg',
  '.ggggtggg.',
];
const Z_BODY = ['gguuuuuugg', '.guUuuuug.', '..uuuuuu..', '..llllll..'];
const Z_LEGS = [
  ['..........', null, '..ff..ff..'],
  [null, '..ff..ll..', '......ff..'],
  ['..........', null, '..ff..ff..'],
  [null, '..ll..ff..', '..ff......'],
];
const shiftRows = (rows, dx) => rows.map((r) => (dx > 0 ? '.'.repeat(dx) + r.slice(0, r.length - dx) : dx < 0 ? r.slice(-dx) + '.'.repeat(-dx) : r));
function zombieWalk(lean = 0) {
  return [0, 1, 2, 3].map((f) => {
    const L = Z_LEGS[f];
    const sway = f === 1 ? 1 : f === 3 ? -1 : 0;
    const rows = [];
    if (L[0]) rows.push(L[0]);
    rows.push(...shiftRows(Z_HEAD, sway + lean), ...shiftRows(Z_BODY, lean > 0 && f & 1 ? 0 : 0));
    if (L[1]) rows.push(L[1]);
    rows.push(L[2]);
    return rows.map((r) => '.' + r + '.');
  });
}
/* 물기 돌진 2프레임: 두 팔을 앞으로, 입을 크게 */
const Z_LUNGE = [
  ['............', '...gggggg...', '..ggggLLgg..', '.gggLLggggg.', '.gWWggggWWg.', '.gWKggggKWg.', '.gpgKKKKgpg.', 'gg.gmmmmg.gg', 'gguuuuuuuugg', '..guUuuug...', '...uuuuuu...', '...llllll...', '...ff..ff...'],
  ['..gggggg....', '.ggggLLgg...', 'gggLLggggg..', 'gWWggggWWg..', 'gWKggggKWg..', 'gpgKKKKgpg..', 'g.gmWWmg.g..', 'gguuuuuugg..', '.guUuuuug...', '..uuuuuu....', '..llllll....', '..ff..ff....', '............'],
];
const SPIT_ROWS = (state) => {
  // state: 0 쉼, 1 배 부풂, 2 볼 부풂(예고1), 3 배 빛남(예고2), 4 입 벌림(발사)
  const cheek = state >= 2;
  const glow = state >= 3;
  const open = state === 4;
  return [
    '...gggggg...',
    '..gggggggg..',
    cheek ? '.gWWggggWWg.' : '.gWWggggWWg.',
    cheek ? '.gWKggggKWg.' : '.gWKggggKWg.',
    cheek ? 'gppggggggppg' : '.gppggggppg.',
    open ? '..ggKVVKgg..' : cheek ? '..gggKKggg..' : '..ggKKKKgg..',
    '.uuuuuuuuuu.',
    state === 1 || glow ? (glow ? 'uVYYYYYYYYVu' : 'uVVVVVVVVVVu') : 'uuVVVVVVVVuu',
    glow ? 'uVYWYYYYYYVu' : state === 1 ? 'uVVWVVVVVVVu' : 'uuVWVVVVVVuu',
    glow ? 'uVYYYYYYYYvu' : state === 1 ? 'uVVVVVVVVVvu' : 'uuVVVVVVVvuu',
    '.uuVVVVVVuu.',
    '..uuuuuuuu..',
    '..ff....ff..',
  ];
};

/* 거구: 같은 픽셀 밀도의 도형 명령 26×31 */
function bruteOps(f) {
  const st = f & 1 ? 1 : 0;
  const lift = f === 1 ? -2 : 0, liftR = f === 3 ? -2 : 0;
  const armL = f === 1 ? -2 : f === 3 ? 1 : 0, armR = f === 3 ? -2 : f === 1 ? 1 : 0;
  const y0 = st;
  return {
    w: 28, h: 31,
    ops: [
      ['rect', 7, 23 + lift, 5, 6, 'l'], ['rect', 6, 28 + lift, 7, 2, 'f'],
      ['rect', 16, 23 + liftR, 5, 6, 'l'], ['rect', 15, 28 + liftR, 7, 2, 'f'],
      ['ell', 14, 16 + y0, 11.5, 9, 'K'],
      ['ell', 14, 16 + y0, 10.5, 8, 'u'],
      ['ell', 14, 19 + y0, 10.5, 5, 'U', ],
      ['ell*', 14, 15 + y0, 10.5, 6.5, 'u'],
      ['ell', 14, 18 + y0, 6.5, 5, 'g'],
      ['rect', 8, 19 + y0, 12, 2, 'L'], ['px', 11, 18 + y0, 'L'], ['px', 16, 21 + y0, 'L'],
      ['ell', 3.5, 17 + y0 + armL, 3.2, 6, 'K'], ['ell', 24.5, 17 + y0 + armR, 3.2, 6, 'K'],
      ['ell', 3.5, 17 + y0 + armL, 2.6, 5.4, 'g'], ['ell', 24.5, 17 + y0 + armR, 2.6, 5.4, 'g'],
      ['ell', 3.5, 23 + y0 + armL, 3.6, 3, 'G'], ['ell', 24.5, 23 + y0 + armR, 3.6, 3, 'G'],
      ['px', 6, 8 + y0, 'x'], ['px', 6, 9 + y0, 'x'], ['px', 7, 9 + y0, 'x'],
      ['px', 10, 7 + y0, 'x'], ['px', 10, 8 + y0, 'x'], ['px', 11, 8 + y0, 'x'],
      ['px', 18, 7 + y0, 'x'], ['px', 18, 8 + y0, 'x'], ['px', 19, 8 + y0, 'x'],
      ['px', 22, 8 + y0, 'x'], ['px', 22, 9 + y0, 'x'], ['px', 23, 9 + y0, 'x'],
      ['ell', 14, 6.5 + y0, 6.2, 5.6, 'K'],
      ['ell', 14, 6.5 + y0, 5.5, 5, 'g'],
      ['rows', 10, 4 + y0, ['WW..WW', 'WK..KW', 'p.KK.p', '...t..']],
      ['rect', 11, 1 + y0, 3, 1, 'L'], ['rect', 13, 2 + y0, 2, 1, 'L'],
    ],
  };
}

/* 보스: 약 100px 높이로 직접 그린다(확대 금지). 자세마다 팔·입·다리를 바꾼다. */
const BOSS_W = 108, BOSS_H = 104;
function bossOps(o) {
  const cx = 54;
  const bob = o.bob || 0;
  const ops = [];
  const E = (x, y, rx, ry, c) => { ops.push(['ell', x, y, rx + 1.2, ry + 1.2, 'K'], ['ell', x, y, rx, ry, c]); };
  // 다리·신발
  const legY = 80;
  const lL = o.legL || 0, lR = o.legR || 0;
  ops.push(['rect', 33, legY - lL, 16, 15, 'K'], ['rect', 34, legY + 1 - lL, 14, 14, 'l']);
  ops.push(['rect', 59, legY - lR, 16, 15, 'K'], ['rect', 60, legY + 1 - lR, 14, 14, 'l']);
  ops.push(['ell', 40, 97 - lL, 12, 5.5, 'K'], ['ell', 40, 97 - lL, 11, 4.5, 'f'], ['rect', 31, 94 - lL, 9, 1, 'F']);
  ops.push(['ell', 68, 97 - lR, 12, 5.5, 'K'], ['ell', 68, 97 - lR, 11, 4.5, 'f'], ['rect', 59, 94 - lR, 9, 1, 'F']);
  // 팔(몸 뒤쪽 부분)
  const arm = (side) => {
    const sx = side < 0 ? cx - 38 : cx + 38;
    const fx = (dx) => cx + side * dx;
    switch (o.arms) {
      case 'up':
        E(fx(32), 38 + bob, 8, 14, 's');
        E(fx(30), 13 + bob, 12, 10.5, 'S');
        ops.push(['ell*', fx(30) - side * 3, 10 + bob, 7, 5, 'n']);
        break;
      case 'slam':
        E(fx(36), 64 + bob, 9, 13, 's');
        E(fx(26), 88, 13, 9, 'S');
        ops.push(['ell*', fx(26) - side * 3, 85, 7, 4, 'n']);
        break;
      case 'spread':
        E(fx(40), 48 + bob, 12, 8, 's');
        E(fx(46), 36 + bob, 9, 10.5, 'S');
        ops.push(['ell*', fx(46) - side * 2, 33 + bob, 5, 5, 'n']);
        break;
      default: {
        const sw = (o.swing || 0) * side;
        E(sx, 56 + bob + sw, 9, 15, 's');
        E(fx(41), 75 + bob + sw * 1.5, 11.5, 10, 'S');
        ops.push(['ell*', fx(41) - side * 3, 72 + bob + sw * 1.5, 6, 4.5, 'n']);
      }
    }
  };
  arm(-1); arm(1);
  // 몸통: 보라 조끼 + 초록 배 + 사슬 허리띠
  E(cx, 62 + bob, 33, 23, 'm');
  ops.push(['ell*', cx, 72 + bob, 33, 14, 'M']);
  ops.push(['ell*', cx - 12, 52 + bob, 14, 7, 'v']);
  ops.push(['ell', cx, 65 + bob, 17, 14.5, 'K'], ['ell', cx, 65 + bob, 16, 13.5, 's']);
  ops.push(['ell*', cx + 4, 70 + bob, 14, 9, 'S']);
  ops.push(['ell*', cx - 5, 60 + bob, 6, 4, 'n']);
  ops.push(['rect', cx - 26, 74 + bob, 52, 4, 'K'], ['rect', cx - 25, 75 + bob, 50, 2, 'c']);
  for (let i = 0; i < 8; i++) ops.push(['px', cx - 22 + i * 6, 75 + bob, 'C'], ['px', cx - 21 + i * 6, 76 + bob, 'C']);
  ops.push(['rect', cx - 4, 73 + bob, 8, 6, 'K'], ['rect', cx - 3, 74 + bob, 6, 4, 'y'], ['px', cx - 2, 75 + bob, 'Y']);
  // 위로 든 팔은 머리 앞에 와도 되게 나중에
  // 머리
  const hy = 30 + bob;
  // 뿔
  const horn = (side) => {
    const hx = cx + side * 18;
    ops.push(['ell', hx, hy - 16, 5.5, 7, 'K'], ['ell', hx + side * 3, hy - 22, 4.5, 5, 'K'], ['ell', hx + side * 6, hy - 27, 3.4, 3.4, 'K']);
    ops.push(['ell', hx, hy - 16, 4.5, 6, 'h'], ['ell', hx + side * 3, hy - 22, 3.5, 4, 'h'], ['ell', hx + side * 6, hy - 27, 2.4, 2.4, 'h']);
    ops.push(['ell*', hx + side * 2, hy - 15, 2.5, 5, 'H']);
  };
  horn(-1); horn(1);
  // 귀
  ops.push(['ell', cx - 24, hy + 2, 5, 6, 'K'], ['ell', cx - 24, hy + 2, 4, 5, 's'], ['ell', cx - 25, hy + 2, 2, 3, 'S']);
  ops.push(['ell', cx + 24, hy + 2, 5, 6, 'K'], ['ell', cx + 24, hy + 2, 4, 5, 's'], ['ell', cx + 25, hy + 2, 2, 3, 'S']);
  E(cx, hy, 22, 19, 's');
  ops.push(['ell*', cx + 6, hy + 9, 19, 10, 'S']);
  ops.push(['ell*', cx - 9, hy - 9, 9, 6, 'n']);
  ops.push(['rect', cx - 13, hy - 17, 4, 2, 'n'], ['px', cx - 7, hy - 18, 'n']);
  // 얼굴
  if (o.eyes === 'dead') {
    ops.push(['rows', cx - 15, hy - 5, ['K...K......K...K', '.K.K........K.K.', '..K..........K..', '.K.K........K.K.', 'K...K......K...K']]);
  } else {
    // 성난 눈썹 + 노란 눈
    ops.push(['rows', cx - 17, hy - 9, [
      'KKKK..............KKKK',
      '.KKKKK..........KKKKK.',
      '...KKKK........KKKK...',
    ]]);
    ops.push(['ell', cx - 10, hy - 1, 5.5, 5, 'K'], ['ell', cx + 10, hy - 1, 5.5, 5, 'K']);
    ops.push(['ell', cx - 10, hy - 1, 4.5, 4, 'e'], ['ell', cx + 10, hy - 1, 4.5, 4, 'e']);
    ops.push(['ell', cx - 9, hy, 2.2, 2.6, 'E'], ['ell', cx + 9, hy, 2.2, 2.6, 'E']);
    ops.push(['ell', cx - 9, hy, 1.2, 1.6, 'K'], ['ell', cx + 9, hy, 1.2, 1.6, 'K']);
    ops.push(['px', cx - 12, hy - 3, 'W'], ['px', cx + 8, hy - 3, 'W']);
  }
  // 볼 홍조
  ops.push(['rect', cx - 19, hy + 5, 5, 2, 'p'], ['rect', cx + 15, hy + 5, 5, 2, 'p']);
  // 입
  if (o.mouth === 'roar') {
    ops.push(['ell', cx, hy + 11, 10, 7.5, 'K'], ['ell', cx, hy + 11, 9, 6.5, 'r'], ['ell', cx, hy + 15, 6, 3, 'P']);
    ops.push(['rows', cx - 8, hy + 5, ['hh............hh', '.hh..........hh.', '.h............h..'.slice(0, 16)]]);
  } else if (o.mouth === 'open') {
    ops.push(['ell', cx, hy + 10, 7, 4.5, 'K'], ['ell', cx, hy + 10, 6, 3.5, 'r']);
    ops.push(['rows', cx - 6, hy + 7, ['hh........hh', '.h........h.']]);
  } else {
    ops.push(['rect', cx - 9, hy + 9, 18, 2, 'K'], ['px', cx - 10, hy + 8, 'K'], ['px', cx + 9, hy + 8, 'K']);
    ops.push(['rows', cx - 8, hy + 7, ['h..............h', 'hh............hh']]);
  }
  // 위로 든 주먹은 머리 위에 겹쳐도 앞에 보이게 다시 그린다
  if (o.arms === 'up') {
    for (const side of [-1, 1]) {
      const fx = cx + side * 30;
      ops.push(['ell', fx, 13 + bob, 13.2, 11.7, 'K'], ['ell', fx, 13 + bob, 12, 10.5, 'S'], ['ell*', fx - side * 3, 10 + bob, 7, 5, 'n']);
      ops.push(['rows', fx - 6, 18 + bob, ['K.K.K.K.K'.slice(0, 9)]]);
    }
  }
  return { w: BOSS_W, h: BOSS_H, ops };
}
const BOSS_POSES = [
  { name: 'walk0', arms: 'down', swing: 2, legL: 3, bob: 0 },
  { name: 'walk1', arms: 'down', swing: 0, bob: 1 },
  { name: 'walk2', arms: 'down', swing: -2, legR: 3, bob: 0 },
  { name: 'walk3', arms: 'down', swing: 0, bob: 1 },
  { name: 'windup', arms: 'up', mouth: 'open', bob: -1 },
  { name: 'slam', arms: 'slam', mouth: 'open', bob: 3 },
  { name: 'roar0', arms: 'spread', mouth: 'roar', bob: 0 },
  { name: 'roar1', arms: 'spread', mouth: 'roar', bob: -1 },
  { name: 'stomp0', arms: 'down', swing: 3, legL: 6, mouth: 'open', bob: -1 },
  { name: 'stomp1', arms: 'slam', mouth: 'roar', bob: 2 },
  { name: 'dead', arms: 'spread', mouth: 'open', eyes: 'dead', bob: 2 },
];
const BOSS_PAL = {
  K: OUT, W: '#FFFFFF', s: '#8BBF5E', S: '#5E9046', n: '#B5DE7E', m: '#7A4FA8', M: '#5A3780', v: '#9D74CC',
  h: '#F2E6C8', H: '#C9BC98', e: '#FFD23F', E: '#FF7A2F', p: '#FF8FA8', l: '#4A3D6E', f: '#2E2838', F: '#5C5070',
  c: '#B0B6C2', C: '#6E7586', y: '#FFD84A', Y: '#FFF09A', r: '#5A1E3A', P: '#FF7F9E',
};
const BOSS_RAGE = {
  ...BOSS_PAL, s: '#FF8A6B', S: '#D9505A', n: '#FFC2B3', m: '#A92644', M: '#7A1E3A', v: '#D6455A', e: '#FFFFFF', E: '#FFD84A',
};

/* ---------------- 소품·효과 ---------------- */
const SAW_PAL = { a: '#E8ECF2', b: '#C9CED6', c: '#9AA2B0', d: '#FF5D5D', W: '#FFFFFF', K: OUT };
function sawOps(f) {
  const ops = [['ell', 8.5, 8.5, 6.5, 6.5, 'b'], ['ell*', 7.5, 7.5, 4, 4, 'a']];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + (f * Math.PI) / 16;
    ops.push(['px', 8.5 + Math.cos(a) * 7.6, 8.5 + Math.sin(a) * 7.6, 'a']);
    ops.push(['px', 8.5 + Math.cos(a + 0.2) * 7, 8.5 + Math.sin(a + 0.2) * 7, 'c']);
  }
  ops.push(['ell', 8.5, 8.5, 2.6, 2.6, 'K'], ['ell', 8.5, 8.5, 2, 2, 'c'], ['px', 8, 8, 'W']);
  return { w: 17, h: 17, ops };
}
function puffOps(i) {
  const r = [3, 5, 7, 8][i];
  const ops = [['ell', 10, 10, r, r * 0.85, 'a']];
  if (i < 2) ops.push(['ell*', 9, 9, r * 0.6, r * 0.5, 'W']);
  if (i > 0) ops.push(['clearEll', 10, 10, r - 2.6, (r - 2.6) * 0.85]);
  return { w: 20, h: 20, ops, dither: i === 3 };
}
const PUFF_PAL = { a: '#F4EEE6', W: '#FFFFFF' };

const PROP_PAL = {
  c: '#5FA84E', C: '#9BD67A', d: '#3F7A3A', r: '#B08A66', R: '#D2B08C', Q: '#8A6A4E',
  o: '#C8643A', O: '#E88A5D', q: '#8E4A2E', y: '#FFC93C', Y: '#FFE27A', K: OUT, g: '#596277', b: '#8E5A30', B: '#C98A4E',
  G: '#3E8A6A', H: '#2F6E55', w: '#FFFFFF', W: '#F2F4FA', s: '#DCE0EA', i: '#BFE3EC', I: '#8FC3D2', e: '#FF9F43', t: '#5E3B2E',
};

const ICON_PAL = {
  ...BASE, h: '#F2F0F7', H: '#FFFFFF', b: '#D3CFE3', B: '#A8A1C4', X: '#FF5F98',
  t: '#2F9E95', T: '#DFFBF7', E: '#3E5126', o: '#FFA54A', O: '#FFE6C2', e: '#EE7A26', A: '#7FA040', f: '#FFD84A', F: '#FFF4B0',
  w: '#C98A4E', q: '#8E5A30', y: '#FFC93C', Y: '#FFF09A', d: '#D08A12', j: '#6CC0FF', J: '#DDF3FF', u: '#3E8BEA', U: '#2B5EB8',
  z: '#E8ECF2', Z: '#C9CED6', P: '#FF8FB8', Q: '#FFB0CC', r: '#D94A80', m: '#FFF1DE', M: '#E9B26B', l: '#4FD1C5', L: '#A6F0E6',
};

const FX_PAL = {
  W: '#FFFFFF', y: '#FFB347', Y: '#FFF4B0', o: '#FFD84A', O: '#D08A12', c: '#FFC93C', C: '#FFF09A',
  g: '#7CE07A', G: '#3FA65A', p: '#FF6FA0', P: '#FFB0CC', b: '#8FD3FF', s: '#C9CED6', S: '#9AA2B0', d: '#E6D2B0', D: '#B89A70',
  h: '#6CC0FF', H: '#DDF3FF', B: '#2B5EB8', E: '#3E5126', T: '#7FA040', e: '#FFA54A', f: '#FFF4B0', t: '#4FD1C5', K: OUT,
};

/* ---------------- 시트 목록 ----------------
   frames: 격자(문자열 배열) 또는 { w, h, ops }.   lod: 굽는 축소 단계(1이 원본).
   flash: 흰 실루엣도 굽는다.   alts: 팔레트를 바꾼 변형(이름 → 팔레트 또는 { pal, out }).
   out: 외곽선 색(null이면 없음).   detail: 줄일 때 우선할 색. */
export const SHEETS = {
  soldier: { pal: 'team', frames: crowdFrames(SOL_HEAD, SOL_BODY, 12), alts: { hurt: 'teamHurt' }, muzzle: [11, 3] },
  medic: { pal: 'medic', frames: crowdFrames(MED_HEAD, MED_BODY, 12), alts: { glow: { pal: 'medic', out: '#FF6FA0' }, hurt: 'teamHurt' } },
  sniper: { pal: 'sniper', frames: crowdFrames(SNP_HEAD, SNP_BODY, 12), alts: { hurt: 'teamHurt' }, muzzle: [11, 0] },
  rocket: {
    pal: 'rocket',
    frames: crowdFrames(RKT_HEAD, RKT_BODY, 12).concat([RKT_CROUCH, RKT_FIRE]),
    alts: { hurt: 'teamHurt' }, muzzle: [10, 0],
  },
  helmet: { pal: 'team', frames: [HELMET] },
  captive_medic: { pal: PAL_FRONT(MEDIC), frames: captive('medic'), lod: [1, 0.75, 0.5] },
  captive_sniper: { pal: PAL_FRONT(SNIPER), frames: captive('sniper'), lod: [1, 0.75, 0.5] },
  captive_rocket: { pal: PAL_FRONT(ROCKET), frames: captive('rocket'), lod: [1, 0.75, 0.5] },

  hero_mungchi: { pal: MUNGCHI, frames: heroSheet(MUN_HEAD, MUN_NAPE, MUN_LOOK, MUN_BODY, MUN_ACT, MUN_KO, 16) },
  hero_bori: { pal: BORI, frames: boriSheet() },
  hero_nabi: { pal: NABI, frames: nabiSheet() },
  face_mungchi: { pal: { ...MUNGCHI, w: '#9FD8FF' }, frames: [FACE_MUNGCHI] },
  face_bori: { pal: { ...BORI, G: '#E9B26B', v: '#FFF1DE' }, frames: [FACE_BORI] },
  face_nabi: { pal: NABI, frames: [FACE_NABI] },

  grunt: { pal: ZG, frames: zombieWalk(0).concat(Z_LUNGE), lod: [1, 0.75, 0.5], flash: true },
  runner: { pal: ZR, frames: zombieWalk(1).concat(Z_LUNGE), lod: [1, 0.75, 0.5], flash: true },
  spit: { pal: ZS, frames: [0, 1, 2, 3, 4].map(SPIT_ROWS), lod: [1, 0.75, 0.5], flash: true },
  brute: { pal: ZB, frames: [0, 1, 2, 3].map(bruteOps), lod: [1, 0.75, 0.5], flash: true },
  boss: { pal: BOSS_PAL, frames: BOSS_POSES.map(bossOps), lod: [1, 0.75, 0.5, 0.33], flash: true, alts: { rage: BOSS_RAGE }, detail: ['K', 'W', 'e', 'E', 'p'] },

  saw: { pal: SAW_PAL, frames: [0, 1, 2, 3].map(sawOps), lod: [1, 0.75, 0.5] },

  cactus: { pal: PROP_PAL, frames: [['...cc...', '..cCcc..', '..cccc.c', 'c.cdcc.c', 'c.cccc.c', 'cccccccc', '..cccc..', '..cCcc..', '..cccd..', '..cccc..']], lod: [1, 0.75, 0.5] },
  rock: { pal: PROP_PAL, frames: [['..rrrr..', '.rRRrrr.', 'rRrrrrrr', 'rrrrrrrQ', 'rrrrrQQQ']], lod: [1, 0.75, 0.5] },
  barrel: { pal: PROP_PAL, frames: [['.oooo.', 'oOOOOo', 'qqqqqq', 'oOOOOo', 'oooooo', 'qqqqqq', 'oooooo']], lod: [1, 0.75, 0.5] },
  sign: { pal: PROP_PAL, frames: [['...y...', '..yyy..', '.yyKyy.', 'yyyKyyy', '.yyyyy.', '..yKy..', '...y...', '...g...', '...g...', '...g...', '...g...']], lod: [1, 0.75, 0.5] },
  bush: { pal: PROP_PAL, frames: [['.t..t.t.', '..tt.t..', 't.tttt.t', '.tt..tt.', '..tttt..']], lod: [1, 0.75, 0.5] },
  pine: { pal: PROP_PAL, frames: [['...W...', '..WGW..', '..GGG..', '.WGGGW.', '.GGHGG.', 'WGGGGGW', 'GGHGGHG', '.GGGGG.', '...t...', '...t...']], lod: [1, 0.75, 0.5] },
  pine2: { pal: PROP_PAL, frames: [['..W..', '.WGW.', '.GGG.', 'WGHGW', 'GGGGG', '..t..', '..t..']], lod: [1, 0.75, 0.5] },
  snowman: { pal: PROP_PAL, frames: [['..ttt..', '..ttt..', '.ttttt.', '.WWWWW.', 'WWKWKWW', 'WWWeWWW', '.WWWWW.', 'eeeeeee', 'WWWKWWs', 'WWWWWWs', 'WWWKWWs', '.WWWWs.']], lod: [1, 0.75, 0.5] },
  ice: { pal: PROP_PAL, frames: [['...ii...', '..iWii..', '.iWiiII.', 'iiiiiIII']], lod: [1, 0.75, 0.5] },
  drift: { pal: PROP_PAL, frames: [['...WWW...', '.WWWWWWs.', 'WWWWWWWss']], lod: [1, 0.75, 0.5] },

  /* 효과 */
  flash: { pal: FX_PAL, frames: [['.y.', 'yWy', '.y.'], ['..y..', '..Y..', 'yYWYy', '..Y..', '..y..']], out: null },
  spark: { pal: FX_PAL, frames: [['W.W', '.W.', 'W.W'], ['Y...Y', '.....', '..W..', '.....', 'Y...Y']], out: null },
  puff: { pal: PUFF_PAL, frames: [0, 1, 2, 3].map(puffOps), lod: [1, 0.5], outFrames: [OUT, OUT, null, null] },
  smoke: { pal: { a: '#C9CED6', b: '#9AA2B0' }, frames: [['.a.', 'aaa', '.b.'], ['..a..', '.aaa.', 'aaaab', '.abb.']], out: null },
  boomfx: { pal: { W: '#FFFFFF', y: '#FFF4B0', o: '#FFB347', r: '#FF7A45' }, frames: [
    { w: 16, h: 16, ops: [['ell', 8, 8, 7, 6, 'o'], ['ell*', 8, 7, 5, 4, 'y'], ['ell*', 8, 7, 2.5, 2, 'W']] },
    { w: 20, h: 20, ops: [['ell', 10, 10, 9, 8, 'r'], ['ell*', 10, 9, 7, 6, 'o'], ['ell*', 10, 9, 4, 3, 'y'], ['clearEll', 10, 11, 3, 2.5]] },
  ], lod: [1, 0.5] },
  coin: { pal: FX_PAL, frames: [['.cc.', 'cCCc', 'cCOc', '.cc.'], ['.c.', 'cCc', 'cCc', '.c.'], ['c', 'C', 'C', 'c'], ['.c.', 'cCc', 'cOc', '.c.']] },
  heart: { pal: FX_PAL, frames: [['pp.pp', 'pPppp', 'ppppp', '.ppp.', '..p..'], ['.p.p.', 'pPppp', '.ppp.', '..p..']] },
  plus: { pal: FX_PAL, frames: [['.g.', 'gWg', '.g.'], ['..g..', '..g..', 'ggWgg', '..g..', '..g..']] },
  star: { pal: FX_PAL, frames: [['..o..', '.oCo.', 'ooCoo', '.o.o.'], ['.o.', 'oCo', '.o.']] },
  tear: { pal: FX_PAL, frames: [['.b', 'bb', 'b.']], out: null },
  helmetBit: { pal: FX_PAL, frames: [['.hhh.', 'hHhhh', 'BBBBB']] },
  rocketShot: { pal: FX_PAL, frames: [['.E.', 'EeE', '.e.', '.e.', 'TeT', '.f.'], ['.E.', 'EeE', '.e.', '.e.', 'TeT', 'fYf']] },
  glint: { pal: FX_PAL, frames: [['..W..', '..W..', 'WWWWW', '..W..', '..W..'], ['W...W', '.W.W.', '..W..', '.W.W.', 'W...W']], out: null },
  dust: { pal: FX_PAL, frames: [['.dd.', 'dDDd'], ['d..d', '.dd.']], out: null },
  bubble: { pal: { W: '#FFFFFF', K: OUT }, frames: [['.WWWWW.', 'WWWKWWW', 'WWWKWWW', 'WWWKWWW', 'WWWWWWW', 'WWWKWWW', '.WWWWW.', '.W.....']] },
  shard: { pal: FX_PAL, frames: [['hH', 'h.'], ['.h', 'hB']] },
};

/* HUD·DOM 아이콘(9×9 안팎) — 게이트 칸 아이콘도 같은 그림을 쓴다 */
export const ICONS = {
  medic: ['..hhhhh..', '.hHHhhhh.', 'hHhXhXhhb', 'hhhXXXhhb', 'hhhhXhhbb', 'BBBBBBBBB', '.sssssss.', '.sKsssKs.', '..sssss..'],
  sniper: ['..ttttt..', '.tTTKTTt.', 'tTTTKTTTt', 'tTTTTTTTt', 'tKKTKTKKt', 'tTTTTTTTt', 'tTTTKTTTt', '.tTTKTTt.', '..ttttt..'],
  rocket: ['....E....', '...EoE...', '...oOo...', '...oOo...', '...oOo...', '..AoOoA..', '.AA.o.AA.', '....f....', '...fFf...'],
  gun: ['.........z', '.ZZZZZZZZZ', 'wwwwgggggg', 'www.gK....', 'ww..gg....', 'w.........'],
  men: ['..jjjjj..', '.jJJjjjj.', 'jJjjjjjju', 'UUUUUUUUU', '.sssssss.', '.sKsssKs.', '.pssKssp.', '..sssss..'],
  coin: ['..yyy..', '.yYYYy.', 'yYYdYYy', 'yYYdYYy', 'yYYdYYy', '.yYYYd.', '..ddd..'],
  star: ['....y....', '...yYy...', '...yYy...', 'yyyyYyyyy', '.yYYYYYd.', '..yYYYd..', '..yYdYd..', '.yyd.dyy.', '.d.....d.'],
  skull: ['..zzzzz..', '.zzzzzzz.', 'zzzzzzzzz', 'zKKzzzKKz', 'zKKzzzKKz', 'zzzzKzzzz', '.zzzzzzz.', '..zKzKz..', '..zzzzz..'],
  heart: ['.PP.PP.', 'PQPPPPr', 'PPPPPPr', '.PPPPr.', '..PPr..', '...r...'],
  shield: ['.jjjjjjj.', 'jJJjjjjju', 'jJjjjjjju', 'jjjjjjjju', '.jjjjjju.', '..jjjju..', '...juu...'],
};
export const ICON_PAL_EXPORT = ICON_PAL;

/* 병과·영웅 → 시트 */
export const UNIT_ART = { medic: 'medic', sniper: 'sniper', rocket: 'rocket' };
export const CAPTIVE_ART = { medic: 'captive_medic', sniper: 'captive_sniper', rocket: 'captive_rocket' };
export const HERO_ART = {
  mungchi: { back: 'hero_mungchi', portrait: 'face_mungchi', color: '#FF9F43', dark: '#B4561A' },
  bori: { back: 'hero_bori', portrait: 'face_bori', color: '#FF8FB8', dark: '#B03C70' },
  nabi: { back: 'hero_nabi', portrait: 'face_nabi', color: '#4FD1C5', dark: '#1F7A72' },
};

/* 애니메이션 표(프레임 번호, 초당 프레임) */
export const ANIM = {
  soldier: { walk: { f: [0, 1, 2, 3], fps: 10 }, idle: { f: [4, 5], fps: 2 } },
  medic: { walk: { f: [0, 1, 2, 3], fps: 10 }, idle: { f: [4, 5], fps: 2 } },
  sniper: { walk: { f: [0, 1, 2, 3], fps: 10 }, idle: { f: [4, 5], fps: 2 } },
  rocket: { walk: { f: [0, 1, 2, 3], fps: 10 }, idle: { f: [4, 5], fps: 2 }, fire: { f: [6, 7, 0], fps: 9 } },
  hero: { walk: { f: [0, 1, 2, 3], fps: 9 }, flutter: { f: [0, 4], fps: 4 }, idle: { f: [8, 9], fps: 2 }, ko: { f: [10] }, act: { f: [11, 12], fps: 6 }, look: { f: [13, 14] } },
  captive: { wave: { f: [0, 1], fps: 4 }, sad: { f: [2] } },
  grunt: { walk: { f: [0, 1, 2, 3], fps: 7 }, lunge: { f: [4, 5], fps: 12 } },
  runner: { walk: { f: [0, 1, 2, 3], fps: 12 }, lunge: { f: [4, 5], fps: 12 } },
  spit: { idle: { f: [0, 1], fps: 3 }, tell: { f: [2, 3, 4] } },
  brute: { walk: { f: [0, 1, 2, 3], fps: 5 } },
  boss: { walk: { f: [0, 1, 2, 3], fps: 4 }, windup: { f: [4] }, slam: { f: [5] }, roar: { f: [6, 7], fps: 8 }, stomp: { f: [8, 9], fps: 6 }, dead: { f: [10] } },
  saw: { spin: { f: [0, 1, 2, 3], fps: 30 } },
  puff: { pop: { f: [0, 1, 2, 3], fps: 12 } },
  coin: { spin: { f: [0, 1, 2, 3], fps: 10 } },
};
export const BOSS_POSE_NAMES = BOSS_POSES.map((p) => p.name);

/* ---------------- 숫자 글꼴(게임 화면 안의 글자는 숫자·기호뿐) ---------------- */
export const FONT = {
  /* 5×7, 2px 획 */
  big: {
    '0': ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
    '1': ['.##', '###', '.##', '.##', '.##', '.##', '.##'],
    '2': ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'],
    '3': ['####.', '...##', '...##', '.###.', '...##', '...##', '####.'],
    '4': ['##.##', '##.##', '##.##', '#####', '...##', '...##', '...##'],
    '5': ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.'],
    '6': ['.###.', '##...', '####.', '##.##', '##.##', '##.##', '.###.'],
    '7': ['#####', '...##', '..##.', '..##.', '.##..', '.##..', '.##..'],
    '8': ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.'],
    '9': ['.###.', '##.##', '##.##', '.####', '...##', '...##', '.###.'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
    'x': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
    '/': ['.....', '..#..', '.....', '#####', '.....', '..#..', '.....'],
    '>': ['.....', '.#...', '..#..', '...#.', '..#..', '.#...', '.....'],
    '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
    '!': ['##', '##', '##', '##', '..', '##', '##'],
    'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    'A': ['.###.', '##.##', '##.##', '#####', '##.##', '##.##', '##.##'],
    'X': ['##.##', '##.##', '.###.', '.###.', '.###.', '##.##', '##.##'],
    ' ': ['..', '..', '..', '..', '..', '..', '..'],
  },
  /* 1배로 쓸 때의 굵은 기호 */
  thick: {
    '+': ['......', '..##..', '..##..', '######', '######', '..##..', '..##..'],
    '-': ['......', '......', '......', '######', '######', '......', '......'],
    'x': ['......', '##..##', '.####.', '..##..', '.####.', '##..##', '......'],
    '/': ['......', '..##..', '......', '######', '......', '..##..', '......'],
  },
  /* 3×5 */
  small: {
    '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#', '##', '.#', '.#', '.#'], '2': ['###', '..#', '###', '#..', '###'],
    '3': ['###', '..#', '.##', '..#', '###'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'],
    '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
    '9': ['###', '#.#', '###', '..#', '###'], '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'],
    'x': ['...', '#.#', '.#.', '#.#', '...'], '/': ['.#.', '...', '###', '...', '.#.'], '>': ['#..', '.#.', '..#', '.#.', '#..'],
    '=': ['...', '###', '...', '###', '...'], '!': ['#', '#', '#', '.', '#'], ' ': ['.', '.', '.', '.', '.'],
    'M': ['#.#', '###', '###', '#.#', '#.#'], 'A': ['###', '#.#', '###', '#.#', '#.#'], 'X': ['#.#', '#.#', '.#.', '#.#', '#.#'],
  },
};

/* 세계 크기(월드 단위 높이) — 축소 단계 고르기용 */
export const WORLD_H = {
  grunt: 1.05, runner: 0.95, spit: 1.25, brute: 2.1, boss: 6.4, saw: 1.6,
  captive: 1.0, cactus: 2.2, sign: 2.2, pine: 2.4, pine2: 1.6, snowman: 1.9, rock: 0.9, barrel: 1.0, bush: 0.8, ice: 0.8, drift: 0.6,
};
