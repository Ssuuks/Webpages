/* 도트 그림 데이터 — DOM 없음(노드 테스트에서 검사한다).
   격자는 한 글자 = 한 픽셀('.' 투명), 색은 시트마다 팔레트(한 글자 → '#rrggbb').
   큰 그림(거구·톱날·연기)은 같은 픽셀 밀도의 도형 명령(raster.js runOps)으로 그린다.
   영웅(heroines.js)·지역 좀비 옷(foes.js)·지역 땅과 소품(biomes.js)·지역 보스(bosses.js)는 따로 모듈에 있고(art.js를 가져오지 않는다) 여기서 SHEETS·BIOME에 펼친다.
   외곽선(1px, 자두색)은 굽는 단계에서 자동으로 붙는다. 세계 스프라이트는 줄이기만 한다(1, 0.75, 0.5 단계). */

import { HEROINE_SHEETS } from './heroines.js';
import { buildFoeSkins, FOE_ALTS, FOE_SKIN, FOE_BURST } from './foes.js';
import { BIOME_EXTRA, BIOME_PATCH, PROP_SHEETS, PROP_WORLD_H } from './biomes.js';
import { BOSS_SHEETS, BOSS_SKIN, BOSS_CROWN, BOSS_FX, BOSS_TEXT, BOSS_TIER } from './bosses.js';

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

/* 합친 병사(분대장·중장갑병·전차): 같은 파랑 + 금 장식, 바이저·환기구 빛, 궤도, 배기 연기, 미등 */
const TIER_EXTRA = { y: '#FFD84A', Y: '#FFF09A', d: '#D08A12', v: '#8CF6FF', V: '#E8FFFF', q: '#3B3F55', a: '#E8ECF2', A: '#C9CED6', e: '#FF9F43' };
const TIER = { ...TEAM, ...TIER_EXTRA };
const TIER_HURT = { ...TEAM_HURT, ...TIER_EXTRA, y: '#FFC2A8', Y: '#FFE4DC', d: '#C06A5A', v: '#FFC8C0' };

/* 다친 순간의 붉은 기(병과 고유 색은 그대로 두고 철모·군복만 물들인다) */
const HURT_CLOTH = { c: '#C24A66', n: '#6A2D4A', o: '#FFB4A0', O: '#C06A5A' };
export const PAL = {
  team: TEAM, teamHurt: TEAM_HURT, medic: MEDIC, sniper: SNIPER, rocket: ROCKET, tier: TIER, tierHurt: TIER_HURT,
  medicHurt: { ...MEDIC, ...HURT_CLOTH, H: '#FFE4DC', h: '#FFC8C0', b: '#F0A0A0', B: '#C06A7A' },
  sniperHurt: { ...SNIPER, ...HURT_CLOTH, H: '#FFD8C8', h: '#E8A08A', b: '#C0706A', B: '#8E4A50', o: '#C0706A', O: '#8E4A50' },
  rocketHurt: { ...ROCKET, ...HURT_CLOTH, H: '#FFE0D0', h: '#FF9C7C', b: '#E86A5A', B: '#B8405A' },
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
  '..hHHhhh....',
  '.hXXhXXhh...',
  'hHXXXXXhhb..',
  'hhhXXXhhbb..',
  'hhhhXhhbbb..',
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

/* ---------------- 합친 병사(대형 단계): 10명 = 분대장, 100명 = 중장갑병, 1000명 = 전차 ----------------
   외곽선 포함 18×18 · 22×22 · 30×22(렌더러 TIER 표와 같다). 뒷모습, 발·궤도는 맨 아래 줄,
   어느 프레임이나 격자 폭 끝까지 채운다(닻 기준 왼쪽·오른쪽 반폭이 같게). 프레임: 걷기 0~3, 서기 4~5.
   muzzles = 프레임마다 총구 끝 칸(격자 좌표, 외곽선 빼고 — 병사 시트와 같은 약속), muzzle = 걷기 1 프레임의 것. */
const blank = (w, h) => Array.from({ length: h }, () => '.'.repeat(w));
const stack = (w, ...parts) => pad([].concat(...parts), w);

/* 분대장(16×16): 금띠 + 금별 철모, 안테나 달린 무전기 배낭, 나무 손잡이 긴 소총 */
const SQ10_TOP = [
  '.Y..............',
  '.g..hhhhh.......',
  '.ghhHHhhhhh....G',
  '.hHHhhyhhhhb...g',
  'hHHhyyYyyhhbb..g',
  'hHhhhyyyhhhbb..g',
  'hhhhhyhyhhbbb.oO',
  'hhhhhhhhhhbbb.oO',
  'yyyyyyyyyyydd.gg',
  'sBBBBBBBBBBBs.gg',
  '.cOoooooooOc..gg',
  'ccOooGoGooOccsoO',
  'scOOOOOOOOOcc.OO',
  '.nnnnnnnnnnn....',
];
const SQ10_LEGS = [
  [true, null, '..kkk...kkk.....'],
  [false, '..kkk...nnn.....', '........kkk.....'],
  [true, null, '..kkk...kkk.....'],
  [false, '..nnn...kkk.....', '..kkk...........'],
];
function sq10Walk(f) {
  const [low, a, b] = SQ10_LEGS[f];
  return stack(16, low ? blank(16, 1) : [], SQ10_TOP, a ? [a] : [], [b]);
}
function sq10Frames() {
  // 숨쉬기: 배낭 윗줄을 눌러 머리가 1px 내려온다(병사와 같은 방식)
  const idle2 = stack(16, blank(16, 2), SQ10_TOP.slice(0, 10), SQ10_TOP.slice(11), ['..kkk...kkk.....']);
  return [0, 1, 2, 3].map(sq10Walk).concat([sq10Walk(0), idle2]);
}

/* 중장갑병(20×20): 금 테두리 큰 어깨 갑옷 + 팔뚝, 금 볏 철모(옆으로 새는 바이저 빛), 등의 동력 상자(빛나는 전지), 오른 어깨 위 개틀링(금 고리) */
const HV_HELM = [
  '..hhyhh..',
  '.hHHyhhh.',
  'hHHhyhhhb',
  'hHhhyhhbb',
  'vhhhyhhbv',
  'vBBBBBBBv',
];
const HV_PAD_L = ['..yyy.', '.yhhhy', 'yhHhhb', 'yhhhbb', 'ybbbbB', '.BBBB.'];
const HV_PAD_R = ['.yyy..', 'yhhhy.', 'hHhhby', 'hhhbby', 'bbbbBy', '.BBBB.'];
const HV_ARM = ['bbB', 'bBB', 'gGg'];
const HV_BACK = [
  '..nnnnn..',
  '..nvVvn..',
  '..nvvvn..',
  '.bnnnnnb.',
  'bbbbbbbbB',
  'yyyyyyyyd',
  '.nnnnnnn.',
];
const HV_GUN = ['.GGG.', 'GgKgG', 'gGgGg', 'gGgGg', 'yyyyd', 'GgggG', 'gGggg', '.ggg.'];
function hvTop() {
  let r = blank(20, 15);
  r = over(r, 4, 8, HV_BACK);
  r = over(r, 1, 12, HV_ARM);
  r = over(r, 13, 12, HV_ARM);
  r = over(r, 0, 6, HV_PAD_L);
  r = over(r, 11, 6, HV_PAD_R);
  r = over(r, 4, 2, HV_HELM);
  r = over(r, 15, 0, HV_GUN);
  return r;
}
const HV_LEGS = [
  [true, ['....bbb...bbb.......', '....hBb...hBb.......', '...nnnn..nnnn.......', '...gggg..gggg.......']],
  [false, ['....bbb...bbb.......', '....hBb...hBb.......', '...nnnn...bBb.......', '...gggg..nnnn.......', '.........gggg.......']],
  [true, ['....bbb...bbb.......', '....hBb...hBb.......', '...nnnn..nnnn.......', '...gggg..gggg.......']],
  [false, ['....bbb...bbb.......', '....hBb...hBb.......', '....bBb..nnnn.......', '...nnnn..gggg.......', '...gggg............']],
];
function hvWalk(f, top = hvTop()) {
  const [low, legs] = HV_LEGS[f];
  return stack(20, low ? blank(20, 1) : [], top, legs);
}
function hvFrames() {
  const top = hvTop();
  const idle2 = stack(20, blank(20, 2), top.slice(0, 11), top.slice(12), HV_LEGS[0][1]);
  return [0, 1, 2, 3].map((f) => hvWalk(f, top)).concat([hvWalk(0, top), idle2]);
}

/* 전차(28×20): 뒤에서 본 꼬마 전차 — 파란 차체, 납작한 포탑(뒤에 흰 별 — 분대장 철모의 금별과 다르게, 위에 해치), 앞(화면 위)으로 뻗은 포신, 포탑 높이까지 솟은 궤도 덮개(앞줄 뒤에 가려도 전차로 보이게), 움직이는 궤도, 배기관 연기, 주황 미등 */
const TK_BARREL = ['gGGg', 'gggg', '.Gg.', '.Gg.', '.Gg.'];
const TK_TURRET = [
  '........gGg.',
  '..hhhhhhBBBh',
  '.hHHhhhhhhhb',
  'hHhhhWhhhhbb',
  'hhhWWWWWhhbb',
  'hhhhWWWhhbbb',
  'bbbbabaabbbB',
  'BBBBBBBBBBBB',
];
const TK_HULL = [
  '.hhhhhhhhhhhhhhhh.',
  'hHhhhhhhhhhhhhhhhb',
  'bbbbbbbbbbbbbbbbbB',
  'beebbbbbbbbbbbbeeB',
  'bbbbbbBBBBBBbbbbbB',
  'BBBBBBBBBBBBBBBBBB',
  '.BBBBBBBBBBBBBBBB.',
];
const TK_PIPE = ['Gg', 'gg', 'gg'];
/* 궤도 발판: 4줄 주기, 걷기 프레임마다 1줄씩 위로 흐른다(뒤에서 보면 바닥에서 위로 감겨 올라간다) */
const TK_CLEAT = ['qGGGGq', 'qggggq', 'qqqqqq', 'qqqqqq'];
function tkTread(ph) {
  const rows = ['.hhhh.', 'hHhhhb', 'BBBBBB'];
  for (let j = 0; j < 9; j++) rows.push(TK_CLEAT[(j + ph) & 3]);
  rows.push('.qqqq.');
  return rows;
}
const TK_PUFF = [[20, 6, ['aa', 'Aa']], [21, 4, ['aa.', 'aaA', '.A.']]];
function tkFrame(ph, dy, puff) {
  let r = blank(28, 20);
  // 포신 → 포탑 → 배기관 → 차체 → 궤도(앞에서 덮는다) → 연기
  r = over(r, 12, dy, TK_BARREL);
  r = over(r, 8, 3 + dy, TK_TURRET);
  r = over(r, 20, 9 + dy, TK_PIPE);
  r = over(r, 5, 11 + dy, TK_HULL);
  r = over(r, 0, 7, tkTread(ph));
  r = over(r, 22, 7, tkTread(ph));
  if (puff) r = over(r, puff[0], puff[1] + dy, puff[2]);
  return r;
}
function tankFrames() {
  const [p0, p1] = TK_PUFF;
  return [tkFrame(0, 1, p0), tkFrame(1, 0, p1), tkFrame(2, 1, p0), tkFrame(3, 0, p1), tkFrame(0, 1, null), tkFrame(0, 0, p0)];
}

/* 앞모습 병사(철창 속 포로·승리용): 손 흔들기 2프레임 + 우는 얼굴(감은 눈 아래 ㅠㅠ 눈물 줄기, 벌린 입).
   모자 5줄 + 얼굴 3줄 + 몸 5줄 = 13줄. 눈은 격자 x 2~3·8~9, y 5줄째(0부터) — 눈물 효과를 붙일 자리 */
function frontRows(hat, face, arms) {
  return [...hat, ...face, ...arms];
}
const FRONT_FACE = [
  '.sKKssssKKs.',
  '.sKWssssKWs.',
  '.ppssKKsspp.',
];
const FRONT_SAD = [
  '.sKKssssKKs.',
  '.swwsssswws.',
  '.pwssmmsswp.',
];
const FRONT_ARMS = [
  ['s.cccccc....', '.sccccccs...', '..cccccc.s..', '..nnnnnn....', '..kk..kk....'],
  ['..cccccc..s.', '.scccccccs..', 's.cccccc....', '..nnnnnn....', '..kk..kk....'],
];
const FRONT_ARMS_SAD = ['.sccccccs...', '.scccccccs..', '..cccccc....', '..nnnnnn....', '..kk..kk....'];
const FRONT_HAT = {
  team: ['...hhhhhh...', '..hHHhhhhh..', '.hHhhhhhhhb.', '.hhhhhhhhbb.', '.BBBBBBBBBB.'],
  medic: ['...hHHhhh...', '..hXXhXXhh..', '.hHXXXXXhhb.', '.hhhXXXhhbb.', '.BBBBXBBBBB.'],
  sniper: ['....hhhh....', '...hHHhhb...', '...rrrrrr...', '.hhhhhhhhhb.', 'BBBBBBBBBBBB'],
  rocket: ['.........EE.', '...hhhhhhTT.', '..hHHhhhhTT.', '.hHhhhhhhTT.', '.BBBBBBBBTT.'],
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
const PAL_FRONT = (p) => ({ ...p, w: '#8FD3FF', m: '#7A2E4A' });

/* 격자 겹치기: part의 '.' 아닌 글자를 (x, y)부터 덮어쓴다('_'는 지우기) */
function over(rows, x, y, part) {
  const out = rows.slice();
  part.forEach((pr, j) => {
    const yy = y + j;
    if (yy < 0 || yy >= out.length) return;
    const r = out[yy].split('');
    for (let i = 0; i < pr.length; i++) {
      const xx = x + i;
      if (pr[i] === '.' || xx < 0 || xx >= r.length) continue;
      r[xx] = pr[i] === '_' ? '.' : pr[i];
    }
    out[yy] = r.join('');
  });
  return out;
}

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
/* 연기 뭉게: 겹친 동그라미 3~5개(위 왼쪽 하이라이트, 아래 오른쪽 그늘, 가운데 구멍 없음).
   뒤 두 장은 외곽선 없이 바둑판 점으로 흩어지며 사라진다(고리 모양이 아니다). */
/* 뭉게: 가운데 동그라미 + 둘레의 혹들. 마지막 장은 흩어진 조각(고리가 아니게 일부러 고르지 않다) */
const PUFF_RING = [[4.1, 7, 2.6, 4.9, 0.86, 0.2], [3.4, 7, 2.6, 6.2, 0.86, 0.5]];
const PUFF_BLOBS = [[[10, 11.4, 2.7], [6.9, 11.6, 2], [13.1, 11.6, 2], [8.6, 9, 2], [11.7, 9.2, 1.8]]].concat(PUFF_RING.map(([c, n, r, d, sq, rot]) => {
  const B = [[10, 10.5, c]];
  for (let k = 0; k < n; k++) {
    const a = rot + (k * 2 * Math.PI) / n - Math.PI / 2;
    B.push([10 + Math.cos(a) * d, 10.5 + Math.sin(a) * d * sq, r]);
  }
  return B;
})).concat([[[10, 9, 2.6], [4.6, 10.4, 2.1], [15.2, 8.6, 2.3], [7, 4.6, 1.8], [12.6, 15, 1.9], [5.6, 15.4, 1.5], [16, 13.6, 1.5]]]);
function puffRows(i) {
  const B = PUFF_BLOBS[i];
  const inside = (x, y) => B.some(([cx, cy, r]) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r);
  const depth = (x, y) => {
    let f = -1;
    for (const [cx, cy, r] of B) f = Math.max(f, r - Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
    return f;   // 가장자리에서 안쪽으로 몇 픽셀
  };
  const rows = [];
  for (let y = 0; y < 20; y++) {
    let row = '';
    for (let x = 0; x < 20; x++) {
      let ch = '.';
      if (inside(x, y)) {
        const top = !inside(x, y - 1) || (!inside(x - 1, y) && !inside(x - 1, y + 1));
        const bottom = !inside(x, y + 1) || (!inside(x, y + 2) && x >= 9) || (!inside(x + 1, y) && !inside(x + 1, y - 1) && y > 9);
        ch = bottom ? 's' : top ? 'W' : 'a';
        // 위 왼쪽 반짝임(작은 타원)
        if (i < 2) { const [hx, hy, hr, hq] = i ? [7.6, 7.4, 1.9, 1.1] : [8.2, 8.6, 1.2, 0.8]; if (((x + 0.5 - hx) / hr) ** 2 + ((y + 0.5 - hy) / hq) ** 2 < 1) ch = 'W'; }
        if (i === 2) {
          const d = depth(x, y);
          if (d < 1.6 && ((x + y) & 1)) ch = '.';
          else if (d < 0.6) ch = '.';
          if (ch === 's') ch = 'a';
        } else if (i === 3) {
          const d = depth(x, y);
          if ((x + y) & 1 || (d < 0.9 && x & 1)) ch = '.';
          else if (ch === 's') ch = 'a';
        }
      }
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}
const PUFF_PAL = { a: '#F1EAE8', W: '#FFFFFF', s: '#CDC2D3' };

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
  soldier: { pal: 'team', frames: crowdFrames(SOL_HEAD, SOL_BODY, 12), alts: { hurt: 'teamHurt' }, muzzle: [11, 3], muzzles: [[11, 4], [11, 3], [11, 4], [11, 3], [11, 4], [11, 5]] },
  medic: { pal: 'medic', frames: crowdFrames(MED_HEAD, MED_BODY, 12), alts: { glow: { pal: 'medic', out: '#FF6FA0' }, hurt: 'medicHurt' } },
  sniper: { pal: 'sniper', frames: crowdFrames(SNP_HEAD, SNP_BODY, 12), alts: { hurt: 'sniperHurt' }, muzzle: [11, 0] },
  rocket: {
    pal: 'rocket',
    frames: crowdFrames(RKT_HEAD, RKT_BODY, 12).concat([RKT_CROUCH, RKT_FIRE]),
    alts: { hurt: 'rocketHurt' }, muzzle: [10, 0],
  },
  sq10: { pal: 'tier', frames: sq10Frames(), alts: { hurt: 'tierHurt' }, muzzle: [15, 2], muzzles: [[15, 3], [15, 2], [15, 3], [15, 2], [15, 3], [15, 4]] },
  sq100: { pal: 'tier', frames: hvFrames(), alts: { hurt: 'tierHurt' }, muzzle: [17, 0], muzzles: [[17, 1], [17, 0], [17, 1], [17, 0], [17, 1], [17, 2]] },
  sq1000: { pal: 'tier', frames: tankFrames(), alts: { hurt: 'tierHurt' }, muzzle: [14, 0], muzzles: [[14, 1], [14, 0], [14, 1], [14, 0], [14, 1], [14, 0]] },
  captive_medic: { pal: PAL_FRONT(MEDIC), frames: captive('medic'), lod: [1, 0.75, 0.5] },
  captive_sniper: { pal: PAL_FRONT(SNIPER), frames: captive('sniper'), lod: [1, 0.75, 0.5] },
  captive_rocket: { pal: PAL_FRONT(ROCKET), frames: captive('rocket'), lod: [1, 0.75, 0.5] },

  /* 영웅(미소녀): 뒷모습 16×20 · 얼굴 30×30 [0 미소, 1 외침] — pix/heroines.js */
  ...HEROINE_SHEETS,

  grunt: { pal: ZG, frames: zombieWalk(0).concat(Z_LUNGE), lod: [1, 0.75, 0.5], flash: true },
  runner: { pal: ZR, frames: zombieWalk(1).concat(Z_LUNGE), lod: [1, 0.75, 0.5], flash: true },
  spit: { pal: ZS, frames: [0, 1, 2, 3, 4].map(SPIT_ROWS), lod: [1, 0.75, 0.5], flash: true },
  brute: { pal: ZB, frames: [0, 1, 2, 3].map(bruteOps), lod: [1, 0.75, 0.5], flash: true },
  /* 보스: 지역마다 하나(사막 'boss' = 우락이, 나머지는 boss_<지역>) + 정예·대왕 왕관 — pix/bosses.js(아래에서 펼친다) */
  boss: BOSS_SHEETS.boss,

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
  puff: { pal: PUFF_PAL, frames: [0, 1, 2, 3].map(puffRows), lod: [1, 0.5], outFrames: [OUT, OUT, null, null] },
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
  /* 큰 부대의 깃발(병력 규모 표시) */
  flag: { pal: { w: '#8E5A30', b: '#3E8BEA', B: '#2B5EB8', H: '#DDF3FF', y: '#FFD84A' }, frames: [
    ['wbbbbbb.', 'wbbyybbb', 'wbyyyybB', 'wbbyybB.', 'wbbBBB..', 'w.......', 'w.......', 'w.......', 'w.......', 'w.......', 'w.......', 'w.......', 'w.......', 'w.......'],
    ['wbbbbb..', 'wbbyybbb', 'wbyyyybb', 'wbbyybBB', 'wBBB.BB.', 'w.......', 'w.......', 'w.......', 'w.......', 'w.......', 'w.......', 'w.......', 'w.......', 'w.......'],
  ] },
};

/* HUD·DOM 아이콘(9×9 안팎) — 게이트 칸 아이콘도 같은 그림을 쓴다 */
export const ICONS = {
  medic: ['..hHHhh..', '.hXXhXXh.', 'hHXXXXXhb', 'hhhXXXhhb', 'hhhhXhhbb', 'BBBBBBBBB', '.sssssss.', '.sKsssKs.', '..sssss..'],
  sniper: ['..ttttt..', '.tTTKTTt.', 'tTTTKTTTt', 'tTTTTTTTt', 'tKKTKTKKt', 'tTTTTTTTt', 'tTTTKTTTt', '.tTTKTTt.', '..ttttt..'],
  rocket: ['....E....', '...EoE...', '...oOo...', '...oOo...', '...oOo...', '..AoOoA..', '.AA.o.AA.', '....f....', '...fFf...'],
  gun: ['.........z', '.ZZZZZZZZZ', 'wwwwgggggg', 'www.gK....', 'ww..gg....', 'w.........'],
  men: ['..jjjjj..', '.jJJjjjj.', 'jJjjjjjju', 'UUUUUUUUU', '.sssssss.', '.sKsssKs.', '.pssKssp.', '..sssss..'],
  coin: ['..yyy..', '.yYYYy.', 'yYYdYYy', 'yYYdYYy', 'yYYdYYy', '.yYYYd.', '..ddd..'],
  star: ['....y....', '...yYy...', '...yYy...', 'yyyyYyyyy', '.yYYYYYd.', '..yYYYd..', '..yYdYd..', '.yyd.dyy.', '.d.....d.'],
  skull: ['..zzzzz..', '.zzzzzzz.', 'zzzzzzzzz', 'zKKzzzKKz', 'zKKzzzKKz', 'zzzzKzzzz', '.zzzzzzz.', '..zKzKz..', '..zzzzz..'],
  heart: ['.PP.PP.', 'PQPPPPr', 'PPPPPPr', '.PPPPr.', '..PPr..', '...r...'],
  shield: ['.jjjjjjj.', 'jJJjjjjju', 'jJjjjjjju', 'jjjjjjjju', '.jjjjjju.', '..jjjju..', '...juu...'],
  /* 어려움 배지(DOM) — 글꼴마다 🔥 모양이 달라 도트로 */
  fire: ['....e....', '...ee..e.', '..eoe..e.', '..eoee.ee', '.eoooeeoe', '.eofooooe', 'eoffFfooe', 'eofFFFfoe', '.eofFfoe.'],
  /* 열쇠 상자 표시(어려운 레벨의 꼭 필요한 보급, prop.key) */
  key: ['.yyy......', 'yYYYy.....', 'yY.Yyyyyyy', 'yY.YYYYYYy', 'yYYYdddydy', '.ddd...d.d'],
};
export const ICON_PAL_EXPORT = ICON_PAL;

/* 병과·영웅 → 시트 */
export const UNIT_ART = { medic: 'medic', sniper: 'sniper', rocket: 'rocket' };
export const CAPTIVE_ART = { medic: 'captive_medic', sniper: 'captive_sniper', rocket: 'captive_rocket' };
export const HERO_ART = {
  mungchi: { back: 'hero_mungchi', portrait: 'face_mungchi', color: '#FF9F43', dark: '#B4561A' },
  bori: { back: 'hero_bori', portrait: 'face_bori', color: '#FF8FB8', dark: '#B03C70', band: '#D9558F' },   // band: 스킬 컷인 띠
  nabi: { back: 'hero_nabi', portrait: 'face_nabi', color: '#4FD1C5', dark: '#1F7A72' },
};

/* 애니메이션 표(프레임 번호, 초당 프레임) */
export const ANIM = {
  soldier: { walk: { f: [0, 1, 2, 3], fps: 10 }, idle: { f: [4, 5], fps: 2 } },
  sq10: { walk: { f: [0, 1, 2, 3], fps: 10 }, idle: { f: [4, 5], fps: 2 } },
  sq100: { walk: { f: [0, 1, 2, 3], fps: 8 }, idle: { f: [4, 5], fps: 2 } },
  sq1000: { walk: { f: [0, 1, 2, 3], fps: 8 }, idle: { f: [4, 5], fps: 3 } },
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
/* 보스 자세 11장(이 순서가 약속: render.js FRAMES.boss·ANIM.boss, 여섯 지역 보스가 모두 같다 — tests/bosses.mjs가 bosses.js와 맞춰 본다) */
export const BOSS_POSE_NAMES = ['walk0', 'walk1', 'walk2', 'walk3', 'windup', 'slam', 'roar0', 'roar1', 'stomp0', 'stomp1', 'dead'];

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

/* 세계 크기(월드 단위 높이) — 축소 단계 고르기용.
   졸개·질주는 그린 폭(외곽선 포함 12px)이 총알 받는 폭 ±(r + 0.12)과 같아지는 키(0.54·13/6, 0.48·13/6) — 쏘는 거리(6~25m)에서
   0.75 단계로 작게 그려진 채 오래 남지 않게(망원 카메라라 그 거리의 배율이 커서, 1.05·0.95면 멀리 있는 좀비가 총알 맞는 폭보다 작게 보였다) */
export const WORLD_H = {
  grunt: 1.17, runner: 1.04, spit: 1.25, brute: 2.1, boss: 6.4, saw: 1.6,
  captive: 1.0, cactus: 2.2, sign: 2.2, pine: 2.4, pine2: 1.6, snowman: 1.9, rock: 0.9, barrel: 1.0, bush: 0.8, ice: 0.8, drift: 0.6,
};

/* ---------------- 지역(그래픽 업그레이드 2): 지역별 좀비 옷·소품·땅 ---------------- */
Object.assign(SHEETS, buildFoeSkins(SHEETS), PROP_SHEETS);
for (const k of Object.keys(FOE_ALTS)) SHEETS[k].alts = { ...(SHEETS[k].alts || {}), ...FOE_ALTS[k] };
Object.assign(WORLD_H, PROP_WORLD_H);
for (const k of Object.keys(BIOME_PATCH)) Object.assign(BIOME[k], BIOME_PATCH[k]);
Object.assign(BIOME, BIOME_EXTRA);
/* 지역 → 종류 → 시트(보스는 아래에서 SKIN[bid].boss를 더한다). 시트가 없으면 기본 종류 이름 */
export const SKIN = FOE_SKIN;
export const skinOf = (kind, bid) => (SKIN[bid] && SKIN[bid][kind]) || kind;
/* 그 지역에서 쓰는 시트(좀비 옷·보스·길가 소품) — renderer.prepBiome(bid)가 쉬는 틈에 굽는다 */
export function biomeSheets(bid) {
  const out = Object.values(SKIN[bid] || {});
  for (const p of (BIOME[bid] && BIOME[bid].props) || []) out.push(p);
  return out.filter((n, i) => SHEETS[n] && out.indexOf(n) === i);
}
export { FOE_BURST };

/* ---------------- 지역 보스(그래픽 업그레이드 2): 지역마다 다른 보스 + 정예·대왕 왕관 ---------------- */
Object.assign(SHEETS, BOSS_SHEETS);   // 다른 지역 보스 다섯 + 왕관 둘('boss' = 사막 우락이는 위 SHEETS에 이미 있다)
for (const [bid, sheet] of Object.entries(BOSS_SKIN)) if (sheet !== 'boss') (SKIN[bid] || (SKIN[bid] = {})).boss = sheet;
/* 사막(기본) 밖의 지역에서만 쓰는 시트(좀비 옷·보스·길가 소품) — 부팅 때 굽지 않는다(보스 하나 ≈ 0.75M px, 여섯을 다 구우면 페이지 다섯 장).
   renderer.prepBiome(bid)가 그 지역에 가기 전에 쉬는 틈에 굽고, 그리는 쪽은 아직 없으면 기본 시트로 그린다 */
const DESERT_SHEETS = biomeSheets('desert');
export const BIOME_ONLY = new Set(Object.keys(BIOME).filter((b) => b !== 'desert').flatMap((b) => biomeSheets(b)).filter((n) => !DESERT_SHEETS.includes(n)));
export { BOSS_SKIN, BOSS_CROWN, BOSS_FX, BOSS_TEXT, BOSS_TIER };
