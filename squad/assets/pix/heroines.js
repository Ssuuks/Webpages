/* 영웅 세 명(미소녀) — 뒷모습 16×20 시트와 얼굴 30×30. DOM·import 없음(art.js가 가져다 SHEETS에 펼친다).
   모두 전체 연령: 큰 눈(2톤 홍채 + 2×2 눈동자 + 2×2 반짝임 + 아래 작은 반짝임 + 두꺼운 윗속눈썹), 머리 4톤, 긴 소매·무릎 치마.
   고양이·토끼 귀와 꼬리는 없다. 머리색 = 영웅 색(뭉치 귤빛 · 보리 분홍 · 나비 민트)이라 한눈에 갈린다.
   격자 = 한 글자 한 픽셀('.' 투명), 외곽선(OUT 1px)은 굽는 단계(raster.js outline)에서 붙는다. */

export const OUT = '#2B1D2E';

const pad = (rows, w) => rows.map((r) => r.padEnd(w, '.'));
const blank = (w, h) => Array.from({ length: h }, () => '.'.repeat(w));
const flip = (rows) => rows.map((r) => [...r].reverse().join(''));
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
/* 기울이기: 오른쪽으로 갈수록 k칸마다 1px 내려간다(모자 비뚤게 쓰기) */
function shear(part, k) {
  const w = part[0].length, extra = Math.floor((w - 1) / k);
  const out = blank(w, part.length + extra).map((r) => r.split(''));
  part.forEach((r, y) => { for (let x = 0; x < w; x++) if (r[x] !== '.') out[y + Math.floor(x / k)][x] = r[x]; });
  return out.map((r) => r.join(''));
}
/* 머리를 1px 내린다(반동): 맨 위에 빈 줄을 넣고 y번째 줄(머리카락 가운데 줄)을 뺀다 → 높이·아래쪽은 그대로 */
const dropRow = (rows, y) => ['.'.repeat(rows[0].length), ...rows.slice(0, y), ...rows.slice(y + 1)];

const BASE = { K: OUT, W: '#FFFFFF', s: '#FFD2AE', S: '#EDB08C', p: '#FF8FA8', k: '#5A3B2E', m: '#9E4A6E', M: '#7A2E4A', t: '#FF8FA8' };

/* ---------------- 팔레트 ---------------- */
const MUNGCHI = {
  ...BASE,
  H: '#FFD08A', h: '#FF9F43', b: '#E0782A', B: '#B4561A',     // 귤빛 머리
  i: '#F0A030', I: '#B86A1A', j: '#4A2A10',                   // 짙은 호박색 눈(머리·피부와 갈리게, 노란 고양이 눈으로 안 읽히게)
  n: '#3A4C8C', N: '#1F2A55', v: '#1B1F3A', V: '#4A5A9A',     // 남색 모자·치마(어두운 도로에서도 보이게 밝힘), 챙
  c: '#3567C9', C: '#2B5EB8',                                 // 팀 파랑 재킷
  y: '#FFD84A', Y: '#FFF09A', d: '#D08A12',                   // 금(별·견장·스카프)
  e: '#FF9F43', E: '#D9731F', w: '#FFF1DE',                   // 확성기(주황·크림)
  L: '#FFF1DE',                                               // 양말
};
const BORI = {
  ...BASE,
  H: '#FFE0EE', h: '#FFA8CC', b: '#F07AAE', B: '#C25A86',     // 솜사탕빛 트윈테일
  i: '#D88AE8', I: '#9A5AC8', j: '#5E3A8E',                   // 라벤더 눈
  w: '#FFFFFF', v: '#ECE6F2', V: '#CFC4E0',                   // 흰 모자·옷, 라벤더 그늘
  q: '#FF6FA0', Q: '#FFB0CC', z: '#D94A80',                   // 하트(모자·가방)
  r: '#FFFFFF', R: '#E6DCEB',                                 // 흰 리본
  a: '#FFF1DE', A: '#D9A070',                                 // 반창고(크림 + 황갈 테두리 — 피부 위에서 얼룩이 아니라 반창고로)
  L: '#FFFFFF', k: '#C25A86',                                 // 흰 스타킹, 분홍 구두
  G: '#9AA2B0',                                               // 주삿바늘
};
const NABI = {
  ...BASE,
  H: '#C8FFF4', h: '#6FE0D2', b: '#3FB0A6', B: '#257D76',     // 긴 민트빛 머리
  i: '#9AA8FF', I: '#5A5AC8', j: '#34306E',                   // 졸린 눈
  n: '#1F2244', N: '#353A6E',                                 // 조준경 · 후드 테두리(짙은 남색)
  c: '#56609E', C: '#40477C',                                 // 코트(밝힌 남색 — 어두운 도로에서도 몸이 보이게)
  r: '#FF8FC8', R: '#D9609E', x: '#FFF4F8',                   // 분홍 리본(날개 · 그늘 · 매듭) — 나비 핀도 같은 색
  e: '#4FD1C5',                                               // 코트 지퍼(얼굴)
  g: '#596277', G: '#8A93A6', o: '#C98A4E',                   // 총(쇠·나무)
  L: '#40477C', k: '#E8E6F4',                                 // 남색 스타킹, 흰 장화(어두운 도로에서 발이 보이게)
};

/* ---------------- 얼굴(30×30 → 외곽선 32×32) ----------------
   32px이라 쓰는 곳마다 정수배: 카드 칩 ×1 · 영웅 고르기 ×2 · 스킬 버튼 ×2 · 상세 ×3 · 합류 ×4 · 스킬 컷인 띠 ×1.
   프레임 [0 평소 표정, 1 외침(스킬 컷인)]. 눈 14~19줄(왼눈 7~12칸 = 속눈썹 날개 7, 오른눈은 좌우 뒤집어 17~22칸),
   볼 19~20, 입 21~22(13~16칸), 턱은 20줄부터 둥글게 좁아진다(16 → 14 → 12 → 10 → 턱끝 6). 얼굴은 14.5칸 기준 좌우 대칭. */
export const FACE_FRAME = { smile: 0, shout: 1 };

/* 눈동자는 2×2(오른쪽 아래, 2~3줄) — 1px 세로줄이면 고양이 눈(세로 동공)으로 읽힌다 */
const EYE_OPEN = [
  '.KKKKK',
  'KKWWIK',
  '.IWWjj',
  '.IIIjj',
  '.IiiWI',
  '..iii.',
];
/* 졸린 눈: 눈꺼풀 선의 바깥 끝이 한 칸 더 처진다 */
const EYE_SLEEPY = [
  '......',
  '......',
  '..KKKK',
  '.KKjjj',
  'K.IWiI',
  '..iii.',
];
const BLUSH = ['p.....', '.p.p..'];
const SMILE = ['m..m', '.mm.'];
const GRIN = ['mMMm', '.tt.'];      // 뭉치: 자신만만하게 벌린 입
const SLEEPY = ['.mm.'];             // 나비: 작고 납작한 입(새침하지 않게)
const SHOUT = ['MMMM', 'MttM', '.MM.'];
function face(base, eye, mouth) {
  let r = over(base, 7, 14, eye);
  r = over(r, 17, 14, flip(eye));
  r = over(r, 7, 19, BLUSH);
  r = over(r, 17, 19, flip(BLUSH));
  r = over(r, 13, 21, mouth);
  return r;
}

/* 뭉치: 귤빛 복슬 단발 + 갈고리 바보털 + 비뚤게 쓴 남색 장교 모자(금별), 노랑 스카프, 금 견장 재킷 */
const MUN_FACE = [
  '......Hh......................',
  '.......hh.....................',
  '........hhhhhhhhhhhhh.........',
  '.......hhhHHhhhhhhhhhh........',
  '.....hhHHhhhhhhhhhhhhhhh......',
  '....hHHhhhhhhhhhhhhhhhhhh.....',
  '...hHhhhhhhhhhhhhhhhhhhhhh....',
  '..hHhhhhhhhhhhhhhhhhhhhhhhb...',
  '..hhhhhhhhhhhhhhhhhhhhhhhhbb..',
  '.hhhhhhhhhhhhhhhhhhhhhhhhhhbb.',
  '.hhhhhhhhhhbhhhbhhhbhhhhhhhbb.',
  '.Hhhhhhhhhhbhhhbhhhbhhhhhhhbb.',
  '.hHhhhhhhhbshhbshhbshhbhhhhbb.',
  '.hHhhhhShbSSSbSSSbSSSbShhhhhb.',
  'hHhhhhhsssssssssssssssshhhhbbB',
  'hHhhhhhsssssssssssssssshhhhbbB',
  'hHhbhhhsssssssssssssssshhbhbbB',
  'hHhbhhhsssssssssssssssshhbhbbB',
  'hHhbhhhsssssssssssssssshhbhbbB',
  'hHhhhhbssssssssssssssssbhhhhbB',
  'hHhhhhhbssssssssssssssbhhhhhbB',
  'hHhhhhhhbSssssssssssSbhhhhhhbB',
  '.hHhhhhhhbSssssssssSbhhhhhhhb.',
  '..bhhhhhhhbbSssssSbbhhhhhhhb..',
  '...bbbbbb....SSSS....bbbbbb...',
  '.........yYyyyyyyyyyd.........',
  '.....YYccccccyYydccccccYY.....',
  '...yYYycccccccydcccccccyYYy...',
  '..ydydccccccccydccccccccdydy..',
  '.cccccccccccccyccccccccccccCC.',
];
const MUN_CAP = shear([
  '...nnnnnnnnnnn...',
  '.nnnnnnnnnnnnnnn.',
  'nnnnnnnnnnnnnnnnn',
  'NNNNNNNNNNNNNNNNN',
  '.ccccccccccccccc.',
  'vvvvvvvvvvvvvvvvv',
  '..VVvvvvvvvvvvv..',
], 6);
const MUN_STAR = ['..y..', 'yyYyy', '.yyy.', '.y.y.'];
function munFace(eye, mouth) {
  let r = face(MUN_FACE, eye, mouth);
  r = over(r, 11, 0, MUN_CAP);
  r = over(r, 17, 1, MUN_STAR);
  return r;
}

/* 보리: 하트 간호모 + 흰 리본으로 묶은 솜사탕빛 트윈테일, 볼에 반창고, 흰 원피스(분홍 리본) */
const BORI_FACE = [
  '..............................',
  '..............................',
  '..............................',
  '..........hhhhhhhhhh..........',
  '........hhhhhhhhhhhhhh........',
  '.......hhHhhhhhhhhhhhhb.......',
  '......hhHHHhhhhhhhhhhhbb......',
  '.....hHhhhHHhhhhhhhhhhhbb.....',
  '.....hHhhhhhhhhhhhhhhhhbb.....',
  '.....hHhhhhbhhhbhhhbhhhbb.....',
  '.....hHhhhhbhhhbhhhbhhhbb.....',
  '.....hHhhhhbhhhbhhhbhhhbb.....',
  '.....hhhhhbshhbshhbshhbhb.....',
  '.....hhShbSSSbSSSbSSSbShb.....',
  '.....hhsssssssssssssssshb.....',
  '.....hhsssssssssssssssshb.....',
  '.....hhsssssssssssssssshb.....',
  '.....hhsssssssssssssssshb.....',
  '.....hhsssssssssssssssshb.....',
  '.....hbssssssssssssssssbb.....',
  '.....hhbssssssssssssssbhb.....',
  '.....hhhbSssssssssssSbhhb.....',
  '.....hhhhbSssssssssSbhhhb.....',
  '......bhhhbbSssssSbbhhhb......',
  '.......bbb...SSSS...bbb.......',
  '..........qwwsssswwq..........',
  '......vvwwwwqqQqqqwwwwvv......',
  '....vvvwwwwwwwqqwwwwwwwvvv....',
  '...VvvwwwwwwwwqqwwwwwwwwvvV...',
  '..VVvvwwwwwwwwqqwwwwwwwwvvVV..',
];
const BORI_TAIL = [
  'bhHh', 'bhHh', 'bhHh', 'bhHh', 'bhHh', 'bhHh', 'bhhH', 'bhhH', 'bhhH', 'bhhH', 'bbhH',
  'bbhh', 'bbhh', '.bhh', '.bhh', '.bbh', '.bbh', '..bh', '..b.',
];
/* 관자놀이 리본 6×4: 고리가 비스듬히 위·아래로 벌어진다(×1~×2에서 흰 네모로 안 보이게) */
const BORI_BOW = ['rr..r.', 'rRr.Rr', '.rqqr.', 'Rr..rr'];
const BORI_CAP = [
  '...wwwwwwww...',
  '.wwwqqwqqwwww.',
  'wwwwqqqqqwwwww',
  'wwwwwqqqwwwwww',
  'vwwwwwqwwwwwwv',
  '.vVVVVVVVVVVv.',
];
/* 반창고: 오른볼(18~21칸) 안쪽, 황갈 테두리 */
const BANDAGE = ['.AaA', 'AaA.'];
function boriFace(eye, mouth) {
  let r = over(BORI_FACE, 0, 11, BORI_TAIL);
  r = over(r, 26, 11, flip(BORI_TAIL));
  r = over(r, 0, 8, BORI_BOW);
  r = over(r, 24, 8, flip(BORI_BOW));
  r = face(r, eye, mouth);
  r = over(r, 8, 0, BORI_CAP);
  r = over(r, 18, 20, BANDAGE);
  return r;
}

/* 나비: 허리까지 오는 긴 민트빛 생머리 + 앞머리 분홍 나비 핀, 졸린 반달눈, 남색 후드 코트(청록 지퍼) */
const NABI_FACE = [
  '..............................',
  '..............................',
  '...........hhhhhhhh...........',
  '.........hhhhhhhhhhhh.........',
  '.......hhHHHhhhhhhhhhbb.......',
  '......hHHhhhHHhhhhhhhhbb......',
  '.....hHhhhhhhhhhhhhhhhhbb.....',
  '....hHhhhhhhhhhhhhhhhhhhbb....',
  '...hHhhhhhhhhhhhhhhhhhhhhbb...',
  '..hHhhhhhhhbhhhbhhhbhhhhhhbb..',
  '..hHhhhhhhhbhhhbhhhbhhhhhhbb..',
  '..hHhhhhhhhbhhhbhhhbhhhhhhbb..',
  '..hHhhhhhhbshhbshhbshhbhhhbb..',
  '..hHhhhShbSSSbSSSbSSSbShhhbb..',
  '.bhHhhhsssssssssssssssshhhhbB.',
  '.bhHhhhsssssssssssssssshhhhbB.',
  '.bhHhhhsssssssssssssssshhhhbB.',
  '.bhHhhhsssssssssssssssshhhhbB.',
  '.bhHhhhsssssssssssssssshhhhbB.',
  '.bhHhhbssssssssssssssssbhhhbB.',
  '.bhHhhhbssssssssssssssbhhhhbB.',
  '.bhHhhhhbSssssssssssSbhhhhhbB.',
  '.bhHhhhhhbSssssssssSbhhhhhhbB.',
  '.bhHhhhhhbbbSssssSbbbhhhhhhbB.',
  '.bhHhhhBB....SSSS....BBhhhhbB.',
  '.bhHhhbNNNNNNssssNNNNNNbhhhbB.',
  '.bhHhhbNNcccccsscccccNNbhhhbB.',
  '.bhHhhbccccccceecccccccbhhhbB.',
  '.bhhhhbccccccceecccccccbhhhbB.',
  '.bhhhhbccccccceecccccccbhhhbB.',
];
/* 나비 핀: 리본과 같은 분홍, 아래 날개도 두 칸씩(1px 다리처럼 안 보이게) */
const NABI_PIN = ['rr.rr', 'rRxRr', '.rxr.', 'rR.Rr'];
function nabiFace(eye, mouth) {
  let r = face(NABI_FACE, eye, mouth);
  r = over(r, 19, 8, NABI_PIN);
  return r;
}

/* ---------------- 뒷모습(16×20) ----------------
   15장: 걷기 4(몸 A) · 펄럭임 걷기 4(몸 B) · 서기 2 · 기절 · 스킬 2 · 돌아보기 · 눈 깜빡임.
   머리 10 + 목 1 + 몸 7 = 18줄 + 다리 1~2줄(닿는 장은 맨 위 빈 줄). 발은 5~6·9~10칸(기준 x = 8 좌우 대칭) */
const LEGS = [
  ['.....kk..kk.....', null],
  ['.....kk..LL.....', '.........kk.....'],
  ['.....kk..kk.....', null],
  ['.....LL..kk.....', '.....kk.........'],
];
function walk(head, nape, body, f, w = 16) {
  const L = LEGS[f];
  const rows = [];
  if (!L[1]) rows.push('.'.repeat(w));
  rows.push(...head, ...nape, ...body, L[0]);
  if (L[1]) rows.push(L[1]);
  return pad(rows, w);
}
/* P = { head, headB?, nape, bodies:[A,B], act:[2], actHead?, ko, look:[[머리, 목, 몸?] ×2] } */
function sheet(P, w = 16) {
  const out = [];
  const hb = P.headB || P.head;
  for (let f = 0; f < 4; f++) out.push(walk(P.head, P.nape, P.bodies[0], f, w));
  for (let f = 0; f < 4; f++) out.push(walk(hb, P.nape, P.bodies[1], f, w));
  out.push(walk(P.head, P.nape, P.bodies[0], 0, w), walk(hb, P.nape, P.bodies[1], 2, w));
  out.push(pad(P.ko, w));
  const ah = P.actHead || P.head;
  out.push(walk(ah, P.nape, P.act[0], 0, w), walk(ah, P.nape, P.act[1], 0, w));
  for (const [lh, ln, lb] of P.look) out.push(walk(lh, ln, lb || P.bodies[0], 0, w));
  return out;
}

/* 뭉치 뒷모습: 머리에서 가장 넓은 납작한 장교 모자 윗판(16칸, 오른쪽 모서리만 한 칸 솟아 비뚤게 쓴 느낌)과 12칸 파랑 띠·금 단추,
   그 아래 14칸 복슬 단발이 12칸으로 동글게 좁아진다(아래 끝에 구멍 없음 — 이빨처럼 보이지 않게).
   목 뒤 노랑 스카프 꼬리(펄럭임 장에서 옆으로 날린다), 오른손에 크림·주황 확성기.
   (바보털은 뒤에서 보면 머리 위 뾰족한 귀처럼 읽혀서 얼굴 그림에만 둔다) */
const MUN_HEAD = [
  '.........nnnnn..',
  'nnnnnnnnnnnnnnnN',
  'NNNNNNNNNNNNNNNN',
  '..cccccyyccccc..',
  '.hhhhHHHHhhhhhb.',
  '.hhHhhhhhhhhhbb.',
  '.hhhhhhhhhhhhbb.',
  '.hhhhhhhhhhhhbB.',
  '.bhhbhhhbhhhbbB.',
  '..bbhbbhbbhbbb..',
];
const MUN_NAPE = [
  '.....yyyyyy.....',
];
const MUN_BODY = [
  [
    '...YcccyycccY...',
    '...ccccydcccc.ww',
    '...ccccdyccceeEw',
    '...sccccycccseEw',
    '...nnnnnnnnnn.ww',
    '..nnnnnnnnnnnn..',
    '...NnNnNnNnNn...',
  ],
  [
    '...YcccyycccY...',
    '...cccccydccc.ww',
    '...ccccccdyceeEw',
    '...sccccccycseEw',
    '...nnnnnnnnnn.ww',
    '..nnnnnnnnnnnn..',
    '...NnNnNnNnNn...',
  ],
];
const MUN_ACT = [
  [
    '...YcccyycccYc..',
    '...ccccydcccc...',
    '...ccccdycccc...',
    '...sccccycccc...',
    '...nnnnnnnnnn...',
    '..nnnnnnnnnnnn..',
    '...NnNnNnNnNn...',
  ],
  [
    '...YcccyycccYc..',
    '...cccccydccc...',
    '...ccccccdycc...',
    '...sccccccycc...',
    '...nnnnnnnnnn...',
    '..nnnnnnnnnnnn..',
    '...NnNnNnNnNn...',
  ],
];
/* 스킬: 확성기를 오른손으로 머리 위로 치켜든다(나팔 입구가 위) — 팔은 어깨(몸 첫 줄 13칸)까지 이어진다 */
const MUN_HORN_UP = [
  ['wwwww', 'eeeeE', '.eeE.', '.eeE.', '..e..', '..w..', '..sC.', '..cC.', '..cC.', '..cC.', '..cC.', '..c..'],
  ['.wwwww', '.eeeeE', '..eeE.', '..eeE.', '...e..', '...w..', '...sC.', '...cC.', '...cC.', '..ccC.', '..cC..', '..c...'],
];
const MUN_LOOK_HEAD = over(MUN_HEAD, 12, 5, ['.sss', 'sKKs', 'sKWs', 'spss', 'ss']);
/* 기절: 앞으로 납작 엎어짐 — 모자는 앞으로 쏠리고, 확성기는 서 있을 때와 같은 오른손(13~15칸), 신발 바닥은 아래 */
const MUN_KO = [
  '................',
  '................',
  '........nnnnn...',
  '.nnnnnnnnnnnnnnN',
  '.NNNNNNNNNNNNNN.',
  '.hhcccccyycccchb',
  '.hhHHHhhhhhhhhbb',
  '.bhhbhhhbhhhbbB.',
  '..bbhbbhbbhbbb..',
  '.....yyyyyy...ww',
  '..sYccccccccYsEe',
  '...nnnnnnnnnn.ww',
  '..NnNnNnNnNnNn..',
  '....kk....kk....',
];

function munSheet() {
  const s = sheet({
    head: MUN_HEAD, nape: MUN_NAPE, bodies: MUN_BODY, act: MUN_ACT, ko: MUN_KO,
    look: [[MUN_LOOK_HEAD, MUN_NAPE], [over(MUN_LOOK_HEAD, 13, 6, ['ss', 'KK']), MUN_NAPE]],
  });
  s[11] = over(s[11], 11, 0, MUN_HORN_UP[0]);
  s[12] = over(s[12], 10, 0, MUN_HORN_UP[1]);
  return s;
}

/* 보리 뒷모습: 흰 간호모(뒤에도 분홍 하트), 머리 옆(5~6줄)을 흰 리본으로 묶은 트윈테일이 머리에 붙어서
   허리까지 내려와 끝이 가늘어진다(사이 틈 없음 — 따로 떨어진 귀처럼 안 보이게; 틈 칸은 짙은 머리 그늘 B),
   펄럭임 장에서는 끝이 안쪽으로 모인다. 흰 소매 사이 등에 큰 분홍 하트 가방, 흰 원피스 분홍 단.
   스킬 = 커다란 주사기를 오른손으로 치켜든다(머리·리본 바깥 13~15칸, 라벤더 그늘로 원통) */
const BORI_HEAD = [
  '.....wwwwww.....',
  '....wwwqwqww....',
  '....wwwqqqww....',
  '...vvvvvqvvvv...',
  '...hhHHHHhhbb...',
  '..rhHhhhhhhhbr..',
  '.rRrhhhhhhhbrRr.',
  '.hbBhhhhhhhbBbh.',
  'hHbbhhhbhhhbbbhh',
  'hHbBbhhhhhhbBbhh',
];
const BORI_NAPE = [
  'hHb.vwsssswv.bhh',
];
const BORI_BODY = [
  [
    'hb.wwqqwwqqww.bh',
    'Hb.wqQWqqqqzw.bH',
    '.b.wqqqqqqqzw.b.',
    '...svqqqqqzvs...',
    '...vwvqqqzvwv...',
    '...vwwwvvwwwv...',
    '...qqqqqqqqqq...',
  ],
  [
    'hb.wwqqwwqqww.bh',
    '.HbwqQWqqqqzwbH.',
    '..bwqqqqqqqzwb..',
    '...svqqqqqzvs...',
    '...vwvqqqzvwv...',
    '...vwwwvvwwwv...',
    '...qqqqqqqqqq...',
  ],
];
/* 스킬 장: 오른쪽 리본은 치켜든 팔 뒤로 가린다(흰 주사기가 흰 리본에 붙어 안 보이지 않게) */
const BORI_ACT_HEAD = [
  '.....wwwwww.....',
  '....wwwqwqww....',
  '....wwwqqqww....',
  '...vvvvvqvvvv...',
  '...hhHHHHhhbb...',
  '..rhHhhhhhhhb...',
  '.rRrhhhhhhhbb...',
  '.hbBhhhhhhhbBb..',
  'hHbbhhhbhhhbbbh.',
  'hHbBbhhhhhhbBbhh',
];
const BORI_KO = [
  '................',
  '................',
  '.....wwwwww.....',
  '....wwwqwqww....',
  '...vvvvvqvvvv...',
  '.rRrhHHHHhhbrRr.',
  'hhbBhhhhhhhbBbhh',
  'hHbbbhhbhhbbbbhh',
  'hb.wwqqwwqqww.bh',
  '.b.wqQWqqqqzw.b.',
  '...vwvqqqzvwv...',
  '...qqqqqqqqqq...',
  '....kL....Lk....',
];
/* 돌아보기: 오른볼이 머리 옆으로 한 칸 튀어나온다(10~13칸), 오른쪽 리본은 볼 뒤로 숨고 꼬리만 14~15칸에 보인다 */
const BORI_LOOK_HEAD = [
  '.....wwwwww.....',
  '....wwwqwqww....',
  '....wwwqqqww....',
  '...vvvvvqvvvv...',
  '...hhHHHHhhbb...',
  '..rhHhhhhhhsss..',
  '.rRrhhhhhhsKKsh.',
  '.hbBhhhhhhsKWsbh',
  'hHbbhhhbhhspssbh',
  'hHbBbhhhhhbssBbh',
];
/* 눈 감기: 2px 선 + 바깥 끝 1px 아래로 */
const BORI_BLINK_HEAD = over(BORI_LOOK_HEAD, 11, 6, ['ss', 'KK', '.sK']);
/* 주사기(3칸): 바늘 · 분홍 약이 든 통(오른쪽 라벤더 그늘) · 라벤더 밀대 · 손 · 흰 소매(어깨까지) */
const BORI_SYRINGE = [
  ['.G.', '.G.', 'WWV', 'WqV', 'WqV', 'WQV', '.V.', 'VVV', '.s.', '.w.', '.w.', 'ww.', 'w..'],
  ['.G.', '.G.', 'WWV', 'WqV', 'WQV', 'WQV', '.V.', 'VVV', '.s.', '.w.', '.w.', 'ww.', 'w..'],
];

function boriSheet() {
  const s = sheet({
    head: BORI_HEAD, nape: BORI_NAPE, bodies: BORI_BODY, act: BORI_BODY, actHead: BORI_ACT_HEAD, ko: BORI_KO,
    look: [[BORI_LOOK_HEAD, BORI_NAPE], [BORI_BLINK_HEAD, BORI_NAPE]],
  });
  s[11] = over(s[11], 13, 0, BORI_SYRINGE[0]);
  s[12] = over(s[12], 13, 1, BORI_SYRINGE[1]);
  return s;
}

/* 나비 뒷모습: 동그란 머리에서 허리까지 곧게 내려오는 민트 생머리, 목 뒤 10px 분홍 나비 리본(바깥이 넓고 가운데
   흰 매듭으로 좁아지는 두 고리 + 6·9칸 1px 꼬리 두 가닥), 오른쪽 어깨에 멘 키 두 배의 총(머리 옆으로 솟은 총열·조준경,
   아래는 나무 개머리판). 짙은 리본은 민트 머리 아래에서 두 눈·코(얼굴)처럼 읽혀서 밝은 분홍으로 바꿨다.
   스킬 = 총을 어깨에 붙여 앞(화면 위)으로 겨눈다: 두 팔꿈치가 머리 양옆(9~11줄, 1~2·13~14칸)으로 들리고 짧은 총열이
   머리 오른쪽 위로 나온다. 12번 장은 반동 — 머리·총이 1px 내려가고 총구가 번쩍 */
const NABI_HEAD = [
  '..............G.',
  '.....hhhhhh...g.',
  '...hhHHHHhhh..g.',
  '..hHhhhhhhhhb.g.',
  '..hHhhhhhhhbb.g.',
  '..hhhhhhhhhbbnn.',
  '..hhhhhhhhhbb.g.',
  '..hhhhhbhhhbb.g.',
  '..hhhhbhhhhbb.g.',
  '..hrrhbhhhbrr.g.',
];
const NABI_BODY = [
  [
    '.ccrRrhxxhrRrcg.',
    '.ccrRrrxxrrRrco.',
    '.ccrrhRhhRhrrco.',
    '.cchhhrhhrhhhco.',
    '.scchhhbhhbhccs.',
    '..cchbhhhbhbcc..',
    '..cccbhhhhbccc..',
    '..CccccccccccC..',
  ],
  [
    '.ccrRrhxxhrRrcg.',
    '.ccrRrrxxrrRrco.',
    '.ccrrhRhhRhrrco.',
    '.cchhrhhhhrhhco.',
    '.scchhbhhhbhccs.',
    '..ccbhhhbhhbcc..',
    '..ccchbhhbhccc..',
    '..CccccccccccC..',
  ],
];
const NABI_ACT_FR = [
  '............G...',
  '.....hhhhhh.Gn..',
  '...hhHHHHhhhgn..',
  '..hHhhhhhhhhb...',
  '..hHhhhhhhhbb...',
  '..hhhhhhhhhbb...',
  '..hhhhhhhhhbb...',
  '.chhhhhbhhhbb.c.',
  'Cchhhhbhhhhbb.cC',
  'Cc.hhhbhhhhbb.cC',
  '.ccrrhbhhhbrrcc.',
  '..crRrhxxhrRrc..',
  '..crRrrxxrrRrc..',
  '..crrhRhhRhrrc..',
  '..chhhrhhrhhhc..',
  '..cchhhbhhbhcc..',
  '..cchbhhhbhbcc..',
  '..cccbhhhhbccc..',
  '..CccccccccccC..',
  '.....kk..kk.....',
]
/* 반동: 머리·총열 1px 아래(머리카락 가운데 줄 하나를 빼서 몸은 그대로), 총구에 1px 흰 번쩍임 */
const NABI_RECOIL_FR = over(dropRow(NABI_ACT_FR, 7), 12, 0, ['W']);
const NABI_LOOK_HEAD = over(NABI_HEAD, 10, 4, ['.ss', 'sKK', 'sIW', 'sps', '.s.']);
const NABI_KO = [
  '................',
  '................',
  '................',
  '.....hhhhhh...g.',
  '...hhHHHHhhh..g.',
  '..hHhhhhhhhhb.g.',
  '..hrrhhhhhhrr.g.',
  '.ccrRrhxxhrRrco.',
  '.ccrRrrxxrrRrco.',
  '.ccrrhRhhRhrrco.',
  '..CcchhrhhrhcC..',
  '....kL....Lk....',
];
function nabiSheet() {
  const s = sheet({
    head: NABI_HEAD, nape: [], bodies: NABI_BODY, act: NABI_BODY, ko: NABI_KO,
    look: [[NABI_LOOK_HEAD, []], [over(NABI_LOOK_HEAD, 11, 5, ['ss', 'KK']), []]],
  });
  s[11] = NABI_ACT_FR.slice();
  s[12] = NABI_RECOIL_FR;
  return s;
}

export const HEROINE_PAL = { mungchi: MUNGCHI, bori: BORI, nabi: NABI };
/* 생김새 글(roster.js HEROES[id].look 과 같은 글 — 화면 글은 roster.js가 원본) */
export const HEROINE_LOOK = {
  mungchi: '별 달린 장교 모자를 비뚤게 쓴 귤빛 단발, 바람에 날리는 노랑 스카프, 몸만 한 확성기',
  bori: '하트 간호모, 흰 리본으로 묶은 솜사탕빛 트윈테일, 몸보다 큰 하트 가방, 볼에 반창고',
  nabi: '커다란 분홍 나비 리본으로 묶은 긴 민트빛 머리, 졸린 반달눈, 키 두 배의 총',
};
/* 시트 이름은 예전과 같다(HERO_ART가 그대로 가리킨다). 뒷모습 프레임 순서도 같다(FRAMES.hero · ANIM.hero 그대로):
   0~3 걷기 · 4~7 펄럭임 걷기 · 8~9 서기 · 10 기절 · 11~12 스킬 · 13 돌아보기 · 14 돌아본 채 눈 깜빡 */
export const HEROINE_SHEETS = {
  hero_mungchi: { pal: MUNGCHI, frames: munSheet() },
  hero_bori: { pal: BORI, frames: boriSheet() },
  hero_nabi: { pal: NABI, frames: nabiSheet() },
  face_mungchi: { pal: MUNGCHI, frames: [munFace(EYE_OPEN, GRIN), munFace(EYE_OPEN, SHOUT)] },
  face_bori: { pal: BORI, frames: [boriFace(EYE_OPEN, SMILE), boriFace(EYE_OPEN, SHOUT)] },
  face_nabi: { pal: NABI, frames: [nabiFace(EYE_SLEEPY, SLEEPY), nabiFace(EYE_OPEN, SHOUT)] },
};
