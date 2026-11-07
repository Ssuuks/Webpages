/* 새 지역 4곳(무너진 도시·버섯 숲·용암 협곡·한밤 놀이공원)의 땅·하늘 팔레트와 길가 소품 — DOM 없음, art.js를 가져오지 않는다.
   BIOME 키는 art.js BIOME.desert와 같다(sky[5] sun hillF hillN ground ground2 fog road road2 curbA curbB line shadow aim props[5]).
   새로 더한 키(ground.js·render.js가 읽는다, 없으면 예전대로):
     hills: 'dunes'|'blocks'|'domes'|'peaks'|'fair'   언덕 모양
     moon: true / stars: true                          해 대신 초승달, 하늘 위쪽에 별
     crack: '#rrggbb'                                   도로 금 색(용암: 빛나는 금)
     weather: { kind, col[], n, low, vy, sway, swayF, big, flicker? }   화면 날씨(눈 입자 풀을 같이 쓴다; vy < 0이면 위로)
   땅·도로·연석 색은 의미 색(SEMANTIC good/bad)과 ΔE ≥ 20, 도로 L*은 30~39(외곽선이 읽히게) — tests/art.mjs·tests/skins.mjs.
   소품: 격자 ≤ 16×20, 약 7.5px/m(WORLD_H = 줄 수 / 7.5), 빨강(#FF5D5D 계열) 없음. */

const OUT = '#2B1D2E';
const AIM = 'rgba(255,250,230,.07)';

export const BIOME_EXTRA = {
  city: {
    sky: ['#1E2238', '#33405A', '#55687A', '#8E9C98', '#C7CDB4'],
    sun: '#FFE9B0', hillF: '#4A5568', hillN: '#343B4C', hills: 'blocks',
    ground: '#A9A396', ground2: '#8F897E', fog: '#B4B8AC',
    road: '#4A4854', road2: '#53515E', curbA: '#F2C230', curbB: '#3A3842', line: '#F2E6C8',
    shadow: 'rgba(30,25,40,.30)', aim: AIM,
    props: ['car', 'cone', 'lamp', 'rubble', 'bin'],
    weather: { kind: 'ash', col: ['#C9CED6', '#E8ECF2'], n: 40, low: 20, vy: 0.45, sway: 4, swayF: 0.9, big: 1.35 },
  },
  forest: {
    sky: ['#1F3A3A', '#2F5A4E', '#4E8466', '#8DBB7A', '#D6E8A0'],
    sun: '#FFF6C8', hillF: '#3F6E52', hillN: '#2C5040', hills: 'domes',
    ground: '#6F8A44', ground2: '#5C7438', fog: '#A8BC8A',
    road: '#5A4A44', road2: '#64534C', curbA: '#EADDB0', curbB: '#B07A4E', line: '#F2E6C8',
    shadow: 'rgba(30,50,30,.28)', aim: AIM,
    props: ['shroom', 'shroom2', 'fern', 'log', 'stump'],
    weather: { kind: 'spores', col: ['#F4FFB0', '#C9E36A'], n: 26, low: 14, vy: -0.28, sway: 6, swayF: 1.1, big: 1.3 },
  },
  lava: {
    sky: ['#1C1428', '#38203A', '#5E2E44', '#9A4A48', '#E0844E'],
    sun: '#FFD08A', hillF: '#3A2A36', hillN: '#261C26', hills: 'peaks',
    ground: '#352830', ground2: '#5A3E3A', fog: '#7A5458',
    road: '#5E5966', road2: '#67626F', curbA: '#FF8A3D', curbB: '#7A3A2E', line: '#FFD8A0', crack: '#C2611F',
    shadow: 'rgba(20,10,20,.35)', aim: AIM,
    props: ['lavarock', 'vent', 'spike', 'pool', 'deadtree'],
    weather: { kind: 'embers', col: ['#FFB347', '#FFD84A'], n: 30, low: 16, vy: -0.55, sway: 3, swayF: 2.2, big: 1.35, flicker: true },
  },
  park: {
    sky: ['#120E2A', '#1E1A44', '#2E2860', '#4A3A7A', '#7A4E8E'],
    sun: '#FFF4C8', moon: true, stars: true, hillF: '#2A2050', hillN: '#1C1638', hills: 'fair',
    ground: '#724A84', ground2: '#5E3E6E', fog: '#6A5288',
    road: '#4E4864', road2: '#57516E', curbA: '#FFE27A', curbB: '#FF8FD0', line: '#FFF4C8',
    shadow: 'rgba(10,5,30,.35)', aim: AIM,
    props: ['balloon', 'booth', 'lamp2', 'popcorn', 'teddy'],
    weather: { kind: 'confetti', col: ['#FF8FD0', '#FFE27A', '#A6F0E6', '#FFFFFF'], n: 18, low: 10, vy: 0.5, sway: 5, swayF: 1.6, big: 9 },
  },
};
/* 기존 두 지역에 더할 키(사막: 모래 언덕, 눈: 지금 눈) — art.js BIOME.desert/snow에 Object.assign */
export const BIOME_PATCH = {
  desert: { hills: 'dunes' },
  snow: { hills: 'dunes', weather: { kind: 'snow', col: ['#FFFFFF'], n: 40, low: 20, vy: 1, sway: 3, swayF: 1.5, big: 1.2 } },
};

/* ---------------- 소품 팔레트(지역마다) ---------------- */
const CITY_PAL = {
  K: OUT, W: '#FFFFFF', c: '#7FA8A0', C: '#557A74', o: '#B4561A', O: '#D9824A', j: '#2E3440', J: '#5A6478',
  g: '#596277', G: '#8A93A6', a: '#C9CED6', A: '#9AA2B0', b: '#6E7586', e: '#FF8A3D', E: '#D9631F', y: '#FFE9B0', Y: '#F2C230',
  h: '#4E8A5E', H: '#6FA87A', d: '#2F5E40', r: '#8E5A30', w: '#E8ECF2',
};
const FOREST_PAL = {
  K: OUT, W: '#FFFFFF', o: '#F28A3A', O: '#FFB86B', q: '#C2611F', c: '#FFF1DE', C: '#EADDB0', s: '#F2DDB8', S: '#C9B088',
  m: '#9A5ACF', M: '#C59AE8', n: '#6A3E98', g: '#5E9E4B', G: '#8FD16A', d: '#3F6E3A', b: '#8E5A30', B: '#B07A4E', t: '#5E3B2E', T: '#D9B07A', y: '#C9E36A',
};
const LAVA_PAL = {
  K: OUT, W: '#FFFFFF', r: '#4A3E48', R: '#6A5A62', q: '#2E262E', e: '#FFB347', E: '#FF8A3D', Y: '#FFF4B0', y: '#FFD84A',
  s: '#E8E0E4', S: '#B8AEB4', o: '#4A3E5A', O: '#9A8AB8', P: '#6A5A84', t: '#7A6A6A', T: '#A8989A', u: '#7A6058', v: '#9A8A90', V: '#C9B8B8',
};
const PARK_PAL = {
  K: OUT, W: '#FFFFFF', p: '#FF8FD0', P: '#C25A9A', y: '#FFE27A', Y: '#E9B64A', m: '#A6F0E6', M: '#5EC0B4', v: '#9A73D1', V: '#6A4BA0',
  w: '#FFF4C8', g: '#596277', G: '#8A93A6', b: '#C98A4E', B: '#8E5A30', c: '#F0C27E', s: '#FFFFFF', l: '#E8ECF2', k: '#3B3F55',
};

const L3 = [1, 0.75, 0.5];
/* 줄 폭을 가장 긴 줄에 맞춘다(art.js 격자 약속: 줄 폭이 같다) */
const prop = (pal, rows) => { const w = Math.max(...rows.map((r) => r.length)); return { pal, frames: [rows.map((r) => r.padEnd(w, '.'))], lod: L3 }; };

export const PROP_SHEETS = {
  /* ---- 무너진 도시 ---- */
  // 녹슨 폐차(옆모습): 바랜 청록 차체, 녹 얼룩, 깨진 창, 납작한 바퀴
  car: prop(CITY_PAL, [
    '.....CCCCCC.....',
    '....CjJjCjjjC...',
    '...CjWjjCjjjjC..',
    '.CCccccccccccCC.',
    'CcooOccccccccccC',
    'CcOoccccccOocccC',
    'CCCCCCCCCCCCCCCC',
    '.KgGK.....KgGK..',
    '..KK.......KK...',
  ]),
  // 교통 고깔(주황 + 흰 띠)
  cone: prop(CITY_PAL, [
    '..e..',
    '..e..',
    '.eWe.',
    '.eeE.',
    'eWWWe',
    'eeeeE',
    'gggGg',
  ]),
  // 휘어진 가로등(깜빡이는 노란 등)
  lamp: prop(CITY_PAL, [
    '..gggg..',
    '.gG..gg.',
    '.g....gK',
    '.g...KyK',
    '.g...KYK',
    '.g....K.',
    '.g......',
    '.gG.....',
    '..g.....',
    '..g.....',
    '..g.....',
    '..gG....',
    '..g.....',
    '..g.....',
    '..g.....',
    '..g.....',
    '..g.....',
    '.gGg....',
    'gggGg...',
  ]),
  // 철근 삐죽한 콘크리트 더미
  rubble: prop(CITY_PAL, [
    '..r......r..',
    '...r....r...',
    '..aAa..r.O..',
    '.aawAa.oOoo.',
    'aAaaaAbooOoA',
    'AbAAbAAAAbAA',
  ]),
  // 뚜껑 열린 초록 쓰레기통
  bin: prop(CITY_PAL, [
    '..hhhhh',
    '.hH...h',
    'dhhhhhd',
    '.hHhhd.',
    '.hHhhd.',
    '.hddhd.',
    '.hHhhd.',
    '.hHhhd.',
    '.ddddd.',
  ]),

  /* ---- 버섯 숲 ---- */
  // 큰 주황 버섯(크림 점, 크림 줄기)
  shroom: prop(FOREST_PAL, [
    '....oooo....',
    '..oocoOoo...',
    '.oOccooocco.',
    'ooOooooooccq',
    'oocooocooooq',
    'qqqqqqqqqqqq',
    '...sSssss...',
    '....ssSs....',
    '....sssS....',
    '....ssSs....',
    '...sssssS...',
    '..gdgggdgg..',
  ]),
  // 보라 버섯 무리(셋)
  shroom2: prop(FOREST_PAL, [
    '..mmm.....',
    '.mMmmm....',
    'mmmmmmn.mm',
    'nnnsnn.mMmm',
    '...s..nnnsn',
    '.mm.s...s.',
    'mMmms...s.',
    'nnsnnggdgg',
  ]),
  // 고사리(펼친 잎)
  fern: prop(FOREST_PAL, [
    '.....G.....',
    '..G..g..G..',
    '...g.g.g...',
    'G..gGgGg..G',
    '.gg.ggg.gg.',
    '...gggdg...',
    '.gggdgdggg.',
    'g..dgdgd..g',
  ]),
  // 이끼 낀 통나무(나이테 보이는 끝)
  log: prop(FOREST_PAL, [
    '..yGGy..Gy....',
    '.bbGgbbbbGgTT.',
    'bBbbbbBbbbTtTT',
    'bbbbBbbbbbTTtT',
    'bbBbbbbbBbbTT.',
    '.ttttttttttt..',
  ]),
  // 그루터기(나이테, 새싹 하나)
  stump: prop(FOREST_PAL, [
    '......G..',
    '.TTTTTg..',
    'TtTTtTTT.',
    'bTTtTTTb.',
    'bBbbbBbb.',
    'bbBbbbBbb',
    'tbtbttbtt',
  ]),

  /* ---- 용암 협곡 ---- */
  // 빛나는 금이 간 바위
  lavarock: prop(LAVA_PAL, [
    '...rrRr...',
    '..rRRrer..',
    '.rRrreErr.',
    'rRrrEerrrr',
    'rrerrrrEer',
    'rrEerrrrrq',
    'qqqqqqqqqq',
  ]),
  // 김 나는 분화구(회색 김 한 뭉치 — 흰 두 줄기는 1배에서 흰 'V'로 보였다)
  vent: prop(LAVA_PAL, [
    '...VVv...',
    '.VVVVvv..',
    '..vVvvv..',
    '....vv...',
    '..rRrRr..',
    '.rRyYyrr.',
    'rrrEyErrr',
    'rRrrrrrrq',
    'qqqqqqqqq',
  ]),
  // 흑요석 가시(윤 나는 줄)
  spike: prop(LAVA_PAL, [
    '..O....',
    '..OP...',
    '..OP...',
    '.OPo...',
    '.OPo...',
    '.OPo..O',
    '.OPoo.P',
    'OPooo.P',
    'OPooPPo',
    'OPoooPo',
    'eEoeoEe',
    'qqqqqqq',
  ]),
  // 납작한 용암 웅덩이(검은 껍질 테)
  pool: prop(LAVA_PAL, [
    '...qqqqqqqqqq...',
    '.qqEeeeyeeeEEqq.',
    'qEeeyYYyeeyeeeEq',
    '.qqqEeeeeeEEqqq.',
  ]),
  // 불탄 죽은 나무
  deadtree: prop(LAVA_PAL, [
    '.T.......T.',
    '.t..T...t..',
    '..t.t..tt..',
    '..tTt.t....',
    '...tTtt..T.',
    '....tTt.t..',
    '....tTtt...',
    '....tTt....',
    '....tTe....',
    '....tTt....',
    '....ttE....',
    '....tTt....',
    '...ttTtt...',
    '..tq.t.qt..',
  ]),

  /* ---- 한밤 놀이공원 ---- */
  // 풍선 다발(분홍·노랑·민트) + 묶인 추
  balloon: prop(PARK_PAL, [
    '..yy.....',
    '.yYyy.pp.',
    '.yyyypPpp',
    '.mmyypppp',
    'mMmmy.pp.',
    'mmmmm..l.',
    'mmmmm.l..',
    '.mmm.l...',
    '..l.ll...',
    '...lll...',
    '....l....',
    '....l....',
    '....l....',
    '...l.....',
    '...l.....',
    '...gg....',
    '..gGgg...',
  ]),
  // 줄무늬 천막 노점(분홍·흰 차양, 상품 곰)
  booth: prop(PARK_PAL, [
    '......p.......',
    '....ppwpp.....',
    '..pwwpwwpwp...',
    'pwwppwwppwwpp.',
    'PPwPPwPPwPPwP.',
    '.B.........B..',
    '.B..b..y...B..',
    '.B.bcb.yy..B..',
    '.B.bbb.....B..',
    'vvvvvvvvvvvvv.',
    'vVvvVvvVvvVvv.',
    'vvvvvvvvvvvvv.',
    'VVVVVVVVVVVVV.',
  ]),
  // 곧은 기둥 가로등(둥근 등 둘 + 기둥을 감고 내려오는 꼬마전구 줄) — 도시의 휜 가로등과 모양이 다르다
  lamp2: prop(PARK_PAL, [
    '.....k.....',
    '.kkkkkkkkk.',
    'kwk..k..kwk',
    'kWk..k..kWk',
    '.k..lkp..k.',
    '....yk.l...',
    '.....kl....',
    '....lkm....',
    '...p.k.....',
    '....lk.....',
    '.....kly...',
    '.....k.....',
    '....mk.....',
    '.....k.....',
    '....kGk....',
    '...kkkkk...',
  ]),
  // 팝콘 수레(분홍 줄무늬 지붕, 유리 상자, 바퀴)
  popcorn: prop(PARK_PAL, [
    '...pwpwp..',
    '..pwpwpwp.',
    '.PPPPPPPPP',
    '..l.....l.',
    '..lwyswyl.',
    '..lsywsyl.',
    '..lwsyswl.',
    '.ppppppppp',
    '.pPPPPPPPp',
    '.ppppppppp',
    '..kGk..kGk',
    '...k....k.',
  ]),
  // 상품 곰인형(분홍 리본)
  teddy: prop(PARK_PAL, [
    'bb....bb',
    'bcbbbbcb',
    '.bbbbbb.',
    '.bKbbKb.',
    '.bbccbb.',
    '..bKKb..',
    '.pPbbPp.',
    'bbbccbbb',
    '.bbbbbb.',
    '.bb..bb.',
  ]),
};

/* 세계 높이(m): 줄 수 / 7.5 */
export const PROP_WORLD_H = Object.fromEntries(Object.entries(PROP_SHEETS).map(([k, s]) => [k, +(s.frames[0].length / 7.5).toFixed(2)]));

/* 언덕 모양 설명(ground.js가 그린다) */
export const HILLS = {
  dunes: '모래 언덕(지금 모양: 사인 두 겹)',
  blocks: '무너진 건물 스카이라인(납작한 지붕·부서진 꼭대기, 노란 창 몇 개) + 가까운 잔해 더미',
  domes: '둥근 나무 꼭대기가 겹친 숲 + 가까운 덤불',
  peaks: '뾰족한 화산 봉우리(꼭대기에 용암 빛) + 가까운 톱니 능선',
  fair: '천막 지붕과 대관람차(전구 테두리) + 가까운 울타리',
};
export const WEATHER = Object.fromEntries(Object.entries({ ...BIOME_EXTRA, ...BIOME_PATCH }).filter(([, b]) => b.weather).map(([k, b]) => [k, b.weather]));
