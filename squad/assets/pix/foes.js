/* 지역별 좀비 옷(스킨) — 그래픽 업그레이드 2. DOM 없음, art.js를 가져오지 않는다(가져오면 순환).
   art.js와 같은 형식: 격자(문자열 배열, '.' 투명, '_' 지우기) 또는 { w, h, ops }(raster.js runOps), 팔레트 = 한 글자 → '#rrggbb'.
   약속(tests/skins.mjs):
   - 기본 시트(grunt·runner·spit·brute)와 프레임 수·격자 크기가 같고, 프레임마다 그림 상자(외곽선 포함, 닻 기준 왼쪽·오른쪽 끝·높이)가 같다.
     → 충돌 크기 검사(spriteBox)·무는 순간 틈 검사가 지역과 상관없이 그대로 맞는다.
   - 종류 구별 신호는 지역이 바뀌어도 그대로: 졸개 = 초록 계열 피부 + 주황이 아닌 옷, 질주 = 연두 피부 + 주황 옷 + 앞으로 숙인 머리,
     독침 = 보라 피부 + 빛나는 배(V·v·Y 색 고정), 거구 = 큰 몸. 주황은 질주 좀비만 입는다.
   - 의미 색(빨강 #FF5D5D·#E8384F, 게이트 파랑 #6CC0FF·#3E8BEA)은 쓰지 않는다.
   - 모자·두건·버섯 같은 장식은 상자 안의 빈칸에도 칠할 수 있다(상자 L·R·H는 그대로). 충돌·무는 틈은 상자로만 재므로 영향이 없다.
   사용: art.js에서 import { buildFoeSkins, FOE_ALTS, FOE_SKIN, FOE_BURST } from './foes.js';
         Object.assign(SHEETS, buildFoeSkins(SHEETS)); for (const k in FOE_ALTS) SHEETS[k].alts = { ...SHEETS[k].alts, ...FOE_ALTS[k] }; */

const OUT = '#2B1D2E';

/* ---------- 격자 도우미(art.js와 같은 동작) ---------- */
const pad = (rows, w) => rows.map((r) => r.padEnd(w, '.'));
/* 옆으로 밀기: 폭은 그대로, 밀려 나간 칸은 잘린다(art.js shiftRows) */
const shiftRows = (rows, dx) => rows.map((r) => (dx > 0 ? '.'.repeat(dx) + r.slice(0, r.length - dx) : dx < 0 ? r.slice(-dx) + '.'.repeat(-dx) : r));
/* 겹치기: part의 '.' 아닌 글자를 (x, y)부터 덮어쓴다('_'는 지우기) */
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
/* 무늬: 글자 from인 칸만 fn(x, y)가 돌려준 글자로(없으면 그대로) — 옷 줄무늬·물방울 */
function paint(rows, from, fn) {
  return rows.map((r, y) => r.split('').map((c, x) => (from.includes(c) ? fn(x, y, c) || c : c)).join(''));
}

/* ---------- 졸개·질주(12×13): 머리 7줄 + 몸 4줄 + 다리, art.js zombieWalk·Z_LUNGE와 같은 짜임 ---------- */
const Z_HEAD = ['..gggggg..', '.ggggLLgg.', 'gggLLggggg', 'gWWggggWWg', 'gWKggggKWg', 'gppgKKgppg', '.ggggtggg.'];
const Z_BODY = ['gguuuuuugg', '.guUuuuug.', '..uuuuuu..', '..llllll..'];
const Z_LEGS = [
  ['..........', null, '..ff..ff..'],
  [null, '..ff..ll..', '......ff..'],
  ['..........', null, '..ff..ff..'],
  [null, '..ll..ff..', '..ff......'],
];
const fn = (v) => (typeof v === 'function' ? v : () => v);
/* 걷기 4프레임(닿기·지나가기). head·body는 격자 또는 (f) => 격자(프레임마다 바뀌는 불꽃 머리 등) */
function zWalk(head, body, lean = 0) {
  const H = fn(head), B = fn(body);
  return [0, 1, 2, 3].map((f) => {
    const L = Z_LEGS[f];
    const sway = f === 1 ? 1 : f === 3 ? -1 : 0;
    const rows = [];
    if (L[0]) rows.push(L[0]);
    rows.push(...shiftRows(H(f), sway + lean), ...B(f));
    if (L[1]) rows.push(L[1]);
    rows.push(L[2]);
    return rows.map((r) => '.' + r + '.');
  });
}
/* 물기 돌진 2프레임: 머리 윗 5줄은 옷 그대로, 입·팔은 기본 모양(face4·face5로 바꿀 수 있다) */
const FACE4 = ['.gpgKKKKgpg.', 'gg.gmmmmg.gg'];
const FACE5 = ['gpgKKKKgpg..', 'g.gmWWmg.g..'];
function zLunge(head, body, face4 = FACE4, face5 = FACE5) {
  const h = fn(head)(0).slice(0, 5), b = fn(body)(0);
  const B12 = '.'.repeat(12);
  const f4 = [B12, ...h.map((r) => '.' + r + '.'), ...face4,
    'gg' + b[0][2] + b[0].slice(2, 8) + b[0][7] + 'gg', '..' + b[1].slice(1, 7) + b[1][8] + '...', '.' + b[2] + '.', '.' + b[3] + '.', '...ff..ff...'];
  const f5 = [...h.map((r) => r + '..'), ...face5, ...b.map((r) => r + '..'), '..ff..ff....', B12];
  return [f4, f5];
}
const zFrames = (sk, lean) => zWalk(sk.head, sk.body, lean).concat(zLunge(sk.head, sk.body, sk.face4, sk.face5));

/* ---------- 독침(12×13): 5상태(쉼·배 부풂·볼 부풂·배 빛남·입 벌림) — 배 빛(V·v·Y)은 지역과 상관없이 같다 ---------- */
function spitBase(state) {
  const cheek = state >= 2, glow = state >= 3, open = state === 4;
  return [
    '...gggggg...',
    '..gggggggg..',
    '.gWWggggWWg.',
    '.gWKggggKWg.',
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
}
const spitFrames = (deco) => [0, 1, 2, 3, 4].map((s) => deco(spitBase(s), s));
export const SPIT_TELL = { V: '#B9F25B', v: '#7FC93A', Y: '#F4FFB0' };

/* ---------- 거구(28×31 도형): 기본 프레임 명령 뒤에 덧그린다 ----------
   deco(f, y0) → { body, arm, head } (y0 = 몸 출렁임 f & 1, 팔 흔들림 armOff(f)).
   그리는 순서: 기본 → body(몸통 무늬) → 기본 팔 여섯 개를 다시(무늬가 팔 외곽선·주먹을 덮지 않게) → arm(팔에만) → head(모자·버섯).
   모자는 'rows' 격자로 줄 0~3(+y0)에만 — 눈(줄 4~5 + y0: WW..WW / WK..KW)은 어떤 지역에서도 그대로다.
   body의 '*' 무늬는 몸통 칸(x 6~21)에만 둔다. 팔·다리는 칠하지 않는다. */
const ARM_X = [3.5, 24.5];
const baseArms = (fr) => fr.ops.filter((op) => op[0] === 'ell' && ARM_X.includes(op[1]));
const armOff = (f) => ({ aL: f === 1 ? -2 : f === 3 ? 1 : 0, aR: f === 3 ? -2 : f === 1 ? 1 : 0 });
const bruteOn = (base, deco) => base.map((fr, f) => {
  const d = deco(f, f & 1);
  return { w: fr.w, h: fr.h, ops: fr.ops.concat(d.body || [], baseArms(fr), d.arm || [], d.head || []) };
});

/* ---------- 공용 색 ---------- */
const Z = { K: OUT, W: '#FFFFFF', p: '#FF8FA8', t: '#FF7F9E', m: '#7A2E4A', f: '#3A3348', l: '#4A3D6E', L: '#F2E6C8', s: '#FFD2AE', S: '#EDB08C', k: '#5A3B2E' };

/* =====================================================================
   눈보라 기지(snow): 서리 낀 피부, 털모자·목도리·고글·귀마개, 설인 털옷
   ===================================================================== */
const SNOW = {
  grunt: {
    pal: { ...Z, g: '#A9C7D6', G: '#7FA0B8', u: '#9A73D1', U: '#6A4BA0', o: '#B79BE0', c: '#43B8A8', C: '#2F8A80', L: '#FFFFFF', l: '#4A3D6E' },
    // 보라 털모자(흰 방울·흰 테) + 청록·흰 줄무늬 목도리(꼬리가 오른쪽으로 늘어진다)
    head: ['..uuWWuu..', '.uouououu.', 'gUUUUUUUUg', 'gWWggggWWg', 'gWKggggKWg', 'gppgKKgppg', '.ggggtggg.'],
    body: ['ggccLLccgg', '.guUuucCg.', '..uuuuLu..', '..llllll..'],
    alts: { a: { u: '#43B8A8', U: '#2F8A80', o: '#8CE0D4', c: '#FF8FD0', C: '#C25A9A' }, b: { u: '#FF8FB8', U: '#C25A86', o: '#FFC0D6', c: '#9A73D1', C: '#6A4BA0' } },
  },
  runner: {
    pal: { ...Z, g: '#CFE3B4', G: '#9DB58A', u: '#F28A3A', U: '#C2611F', q: '#3B3F55', b: '#8CF6FF', B: '#43B8A8', L: '#FFFFFF', W: '#FFFFFF', l: '#3B3B5C', o: '#FFF1DE' },
    // 이마에 올린 고글 + 주황 패딩 조끼(가로 누빔, 흰 지퍼)
    head: ['..gLLggg..', '.qbBqqbBq.', 'gggggggggg', 'gWWggggWWg', 'gWKggggKWg', 'gppgKKgppg', '.ggggtggg.'],
    body: ['gguuuuuugg', '.gUUoUUUg.', '..uuouuu..', '..llllll..'],
    alts: { a: { b: '#FFE27A', B: '#E9A35B', u: '#FF9F43', U: '#D9731F' }, b: { b: '#FF8FD0', B: '#C25A9A', u: '#E8762A', U: '#B4561A' } },
  },
  spit: {
    pal: { ...Z, g: '#C4B4EC', G: '#9888CC', u: '#4A5A8E', U: '#36426E', e: '#FF8FD0', E: '#FFFFFF', i: '#DDF3FF', I: '#9FD8F0', ...SPIT_TELL },
    // 분홍 귀마개(머리띠 + 털 뭉치) + 고드름 수염
    deco: (r, s) => over(over(r, 0, 0, ['...eeeeee...']), 0, 2, ['eE........Ee', 'ee........ee']).map((row, y) => (y === 6 ? '.uuuiIiIuuu.' : row)),
    alts: { a: { u: '#2F8A80', U: '#22665E', e: '#FFE27A' }, b: { u: '#6A4BA0', U: '#4A3570', e: '#8CE0D4' } },
  },
  brute: {
    pal: { K: OUT, W: '#FFFFFF', p: '#FF8FA8', t: '#FF7F9E', g: '#86B0B4', G: '#5A8690', u: '#F4F6FA', U: '#C8CEE0', x: '#DDF3FF', l: '#3A3D4A', f: '#2E2A36', L: '#8E5A30', h: '#8E5A30', H: '#B07A4E', w: '#EDE3D0', y: '#A8B0CE' },
    // 흰 설인 털옷(앞섶 털 테, 밑단 털 뭉치) + 귀덮개 털모자(격자 줄 0~3: 갈색 꼭대기 셋 + 크림 털 챙), 어깨 뼈는 고드름
    ops: (f, y0) => ({
      body: [
        // 앞섶: 옷 가장자리 두 칸(x 7~8, 19~20)을 회색 털로 — 팔(x ≤ 6, ≥ 21)은 건드리지 않는다
        ['rect*', 7, 13 + y0, 2, 6, 'U'], ['rect*', 19, 13 + y0, 2, 6, 'U'],
        // 밑단 털 뭉치: 두 칸씩(1칸 번갈이는 1배에서 잡티로 보인다), 몸통 안쪽 x 9~18만
        ['rect*', 9, 23 + y0, 2, 1, 'y'], ['rect*', 13, 23 + y0, 2, 1, 'y'], ['rect*', 17, 23 + y0, 2, 1, 'y'],
      ],
      head: [
        // 귀덮개: 머리 양옆으로 늘어진 털 뭉치(눈은 가리지 않는다)
        ['ell', 7.6, 6 + y0, 1.9, 3, 'K'], ['ell', 20.4, 6 + y0, 1.9, 3, 'K'], ['ell', 7.6, 6 + y0, 1.2, 2.3, 'h'], ['ell', 20.4, 6 + y0, 1.2, 2.3, 'h'], ['px', 7, 8 + y0, 'w'], ['px', 20, 8 + y0, 'w'],
        // 모자: 머리와 함께 출렁인다(프레임마다 같은 4줄)
        ['rows', 7, y0, [
          '...hhHHhhh....',
          '..hHHHhhhhh...',
          '.hhhhhhhhhhh..',
          'wwwwwwwwwwwwww',
        ]],
      ],
    }),
    alts: { a: { h: '#43B8A8', H: '#8CE0D4' }, b: { h: '#9A73D1', H: '#B79BE0' } },
  },
};

/* =====================================================================
   무너진 도시(city): 잿빛 초록 피부, 회사원·후드·비옷 모자·안전모
   ===================================================================== */
const CITY = {
  grunt: {
    pal: { ...Z, g: '#9DB58A', G: '#6E8A60', u: '#F2F0F7', U: '#C9CED6', n: '#6A4BA0', N: '#9A73D1', h: '#6A4A3A', j: '#9AA2B0', l: '#3B3F55', f: '#2E2A36' },
    // 회사원: 가르마 머리(외곽선과 구별되는 밤색), 은테 안경, 흰 셔츠에 보라 넥타이, 회색 바지
    head: ['..hhhhhh..', '.hhhhhhgg.', 'gjjjhgjjjg', 'gWWjggjWWg', 'gWKggggKWg', 'gppgKKgppg', '.ggggtggg.'],
    body: ['gguuNnuugg', '.guUnnuug.', '..uuunuu..', '..llllll..'],
    alts: { a: { n: '#2F8A80', N: '#43B8A8', h: '#8E5A30' }, b: { n: '#C25A86', N: '#FF8FB8', h: '#5A4A6A', u: '#FFF1DE', U: '#E2CFA8' } },
  },
  runner: {
    pal: { ...Z, g: '#C2D99A', G: '#93AE6A', u: '#F28A3A', U: '#C2611F', q: '#43B8A8', Q: '#2F8A80', W: '#FFFFFF', l: '#3B3B5C', o: '#FFF1DE' },
    // 모자 쓴 주황 후드 + 헤드폰(양옆 컵), 흰 끈
    head: ['..uuuuuu..', '.uugggguu.', 'uggggggggu', 'qWWggggWWq', 'QWKggggKWQ', 'uppgKKgppu', '.ggggtggg.'],
    body: ['gguoUouugg', '.guuuuuug.', '..uUUUUu..', '..llllll..'],
    face4: ['.upgKKKKgpu.', 'gg.gmmmmg.gg'],
    face5: ['upgKKKKgpu..', 'g.gmWWmg.g..'],
    alts: { a: { q: '#FF8FD0', Q: '#C25A9A', u: '#FF9F43', U: '#D9731F' }, b: { q: '#9A73D1', Q: '#6A4BA0', u: '#E8762A', U: '#B4561A' } },
  },
  spit: {
    pal: { ...Z, g: '#B7A4DC', G: '#8A6CC0', u: '#56607A', U: '#3E465A', y: '#F2C230', o: '#FFE27A', ...SPIT_TELL },
    // 노란 비옷 모자(챙이 이마를 덮는다) + 단추 달린 검은 비옷
    deco: (r) => over(r, 0, 0, ['..yyyyyyyy..', '.yyoyyyyyyy.', 'y..........y', 'y..........y']).map((row, y) => (y === 6 ? '.uuuuoouuuu.' : row)),
    alts: { a: { y: '#8CE0D4', o: '#DDFBF7' }, b: { y: '#FF8FD0', o: '#FFC0E0' } },
  },
  brute: {
    pal: { K: OUT, W: '#FFFFFF', p: '#FF8FA8', t: '#FF7F9E', g: '#8FAE7A', G: '#5E7E52', u: '#FF9F43', U: '#D9731F', x: '#E8ECF2', l: '#3B3F55', f: '#2E2A36', L: '#8E5A30', y: '#F2C230', Y: '#FFE27A', z: '#C99A1E', s: '#E8ECF2', q: '#596277' },
    // 노란 안전모(격자 줄 0~3: 돔 셋 + 챙, 가운데 등줄) + 주황 형광 조끼(어깨 은색 띠, 밑단 은색 띠) + 공구 허리띠(렌치)
    ops: (f, y0) => ({
      body: [
        // 반사 띠: 어깨 위 세로(x 8·19, 줄 10~13)와 조끼 밑단 가로(줄 22, 배꼽 양옆) — 맨살·팔은 칠하지 않는다
        ['rect*', 8, 10 + y0, 1, 4, 's'], ['rect*', 19, 10 + y0, 1, 4, 's'],
        ['rect*', 7, 22 + y0, 4, 1, 's'], ['rect*', 17, 22 + y0, 4, 1, 's'],
        // 공구 허리띠: 갈색 띠(L) 위에 렌치·망치
        ['px*', 10, 19 + y0, 'q'], ['px*', 10, 20 + y0, 'q'], ['px*', 17, 19 + y0, 'q'], ['px*', 18, 19 + y0, 'q'], ['px*', 17, 20 + y0, 'q'], ['px*', 14, 20 + y0, 'Y'],
      ],
      head: [['rows', 7, y0, [
        '....yyYYyy....',
        '...yyyYYyyy...',
        '..zyyyYYyyyz..',
        'yyyyyyyyyyyyyy',
      ]]],
    }),
    alts: { a: { y: '#FFFFFF', Y: '#E8ECF2', z: '#C9CED6' }, b: { y: '#FF9F43', Y: '#FFC08A', z: '#D9731F', u: '#C9E36A', U: '#93AE3E' } },
  },
};

/* =====================================================================
   버섯 숲(forest): 이끼 낀 피부, 버섯 싹·나뭇잎 옷·단풍 모자·나무껍질 갑옷
   ===================================================================== */
const FOREST = {
  grunt: {
    pal: { ...Z, g: '#8FC46A', G: '#5E8A44', u: '#2F6E55', U: '#22523F', v: '#7FC97A', M: '#9A5ACF', N: '#7A3EA8', c: '#F2DDB8', L: '#6A8A3A', l: '#5E3B2E', f: '#3A2A26' },
    // 머리에 돋은 보라 버섯(크림 점) + 나뭇잎 옷(가운데 잎맥 한 줄, 들쭉날쭉 밑단)
    head: ['...NMcM...', '.ggggcLgg.', 'gggLgggLgg', 'gWWggggWWg', 'gWKggggKWg', 'gppgKKgppg', '.ggggtggg.'],
    body: ['gguuvuuugg', '.guUvuuug.', '..uuvuuu..', '..lulllu..'],
    alts: { a: { M: '#F2DDB8', N: '#C9B88A', c: '#8E5A30' }, b: { M: '#FF8FD0', N: '#C25A9A', u: '#4E6A2A', U: '#3A5020', v: '#8FB85A' } },
  },
  runner: {
    pal: { ...Z, g: '#C9E36A', G: '#93AE3E', u: '#F28A3A', U: '#C2611F', e: '#FFB347', v: '#5E9E4B', V: '#8FD16A', l: '#5E3B2E', f: '#3A2A26', L: '#FFFFFF' },
    // 단풍잎 모자(뾰족한 잎 끝, 잎맥) + 덩굴 목도리
    head: ['....Ue....', '..uueuuu..', 'gugUuuUugg', 'gWWggggWWg', 'gWKggggKWg', 'gppgKKgppg', '.ggggtggg.'],
    body: ['ggvVvVvvgg', '.guUuuvug.', '..uuuuvu..', '..llllll..'],
    alts: { a: { u: '#FF9F43', U: '#D9731F', e: '#FFD84A' }, b: { u: '#E8762A', U: '#B4561A', e: '#FFC93C', v: '#3F7A3A' } },
  },
  spit: {
    pal: { ...Z, g: '#B79BE0', G: '#8A6CC0', u: '#EADDB0', U: '#C9B88A', d: '#9A5ACF', h: '#8E5A30', H: '#B07A4E', ...SPIT_TELL },
    // 크림 말불버섯 몸(보라 점) + 구멍 뚫린 갈색 포자 모자
    deco: (r) => paint(over(r, 0, 0, ['...hHhhh....', '..hhKhhKhh..']), 'u', (x, y) => ((x * 3 + y * 5) % 7 === 0 ? 'd' : y >= 10 && x > 5 ? 'U' : '')),
    alts: { a: { h: '#9A5ACF', H: '#B79BE0', d: '#8E5A30' }, b: { u: '#F2C8D8', U: '#D9A0B8', d: '#6A4BA0' } },
  },
  brute: {
    pal: { K: OUT, W: '#FFFFFF', p: '#FF8FA8', t: '#FF7F9E', g: '#8FC46A', G: '#5E8A44', u: '#8E5A30', U: '#5E3B2E', x: '#6FA84A', l: '#4A3A30', f: '#2E2620', L: '#C98A4E', y: '#B07A4E', m: '#6FA84A', M: '#4E8A3A', q: '#F2DDB8', Q: '#6A3E98', v: '#9A5ACF', V: '#F2DDB8' },
    // 나무껍질 갑옷(어깨의 세로 결) + 어깨 이끼 + 오른 어깨에 돋은 보라 버섯 하나(둥근 갓, 크림 점 둘, 크림 주름 줄)
    ops: (f, y0) => ({
      body: [
        // 껍질 결: 어깨 위(x 8·19, 줄 10~13)에만 — 맨살 배·팔은 칠하지 않는다
        ['rect*', 8, 10 + y0, 1, 4, 'U'], ['rect*', 19, 10 + y0, 1, 4, 'U'],
        ['ell*', 7, 11 + y0, 2.6, 1.6, 'm'], ['ell*', 21, 11 + y0, 2.6, 1.6, 'm'], ['px*', 6, 12 + y0, 'M'], ['px*', 22, 12 + y0, 'M'],
      ],
      head: [
        // 머리에 이끼 + 새싹
        ['ell*', 14, 2 + y0, 6, 1.6, 'm'], ['px*', 11, 3 + y0, 'm'], ['px*', 16, 3 + y0, 'M'], ['px', 14, 0 + y0, 'm'], ['px', 13, 0 + y0, 'x'], ['px', 15, 0 + y0, 'x'],
        // 오른 어깨 버섯: 갓 줄 7~9 + 주름 줄 10(어깨 위에 앉는다), 버섯 숲 보스의 졸개 표시
        ['rows', 20, 7 + y0, [
          '.vvvv.',
          'vVvvvv',
          'vvvvVv',
          'qqqqqq',
        ]],
      ],
    }),
    alts: { a: { v: '#F28A3A', Q: '#C2611F' }, b: { u: '#6A5A3A', U: '#4A3E28', v: '#C59AE8', Q: '#9A5ACF' } },
  },
};

/* =====================================================================
   용암 협곡(lava): 잿빛 초록 피부(졸개·거구, 좀비 색 계열) / 따뜻한 재색(질주) + 빛나는 불씨 틈, 노란 눈, 불꽃 머리, 흑요석 껍데기, 녹슨 현무암 조끼
   (계획의 어두운 피부 #5A4E56은 용암 길 #5E5966과 ΔE≈6이라 길에 묻힌다. 졸개 #A9B39A: 길과 ΔE 39.8, 질주 피부와 11.3, 노란 눈 #FFD84A와 62)
   ===================================================================== */
const LAVA = {
  grunt: {
    pal: { ...Z, g: '#A9B39A', G: '#7E8872', u: '#7A5AB0', U: '#553E80', e: '#FFB347', E: '#FF8A3D', W: '#FFD84A', L: '#FFD84A', l: '#3A2E3A', f: '#2E262E' },
    // 머리 틈에 불씨(크림 뇌 대신), 노란 눈, 그을린 보라 옷
    head: ['..gggggg..', '.ggggeEgg.', 'ggEegggggg', 'gWWggggWWg', 'gWKggggKWg', 'gppgKKgppg', '.ggggtggg.'],
    body: ['gguuuuuugg', '.guUuuuug.', '..uuuuuu..', '..llllll..'],
    alts: { a: { u: '#3E5E5A', U: '#2A403E' }, b: { u: '#7A3E5A', U: '#552A40' } },
  },
  runner: {
    pal: { ...Z, g: '#CDBFA8', G: '#9E907C', u: '#F28A3A', U: '#C2611F', e: '#FFB347', E: '#FF8A3D', Y: '#FFF4B0', y: '#FFD84A', W: '#FFD84A', l: '#3A2E3A', f: '#2E262E', k: '#5A4048' },
    // 불꽃 머리(걸음마다 흔들린다) + 그을린 주황 옷(배에 두 칸 탄 자국 — 1칸 번갈이는 1배에서 잡티)
    head: (f) => (f & 1 ? ['...eY.eE..', '.eyeYyeYe.', 'ggEyYYyEeg'] : ['..E.eY.e..', '.eYeyYeye.', 'gEyYYyEegg']).concat(['gWWggggWWg', 'gWKggggKWg', 'gppgKKgppg', '.ggggtggg.']), 
    body: ['gguuuuuugg', '.guUuuuug.', '..uukkuu..', '..llllll..'],
    alts: { a: { y: '#FFFFFF', u: '#FF9F43', U: '#D9731F' }, b: { u: '#E8762A', U: '#B4561A' } },
  },
  spit: {
    pal: { ...Z, g: '#B7A4CC', G: '#8A78A8', u: '#4E4260', U: '#8A7AA8', e: '#FFB347', E: '#FF8A3D', ...SPIT_TELL },
    // 흑요석 껍데기(윤 나는 줄) + 머리의 불씨 두 점
    deco: (r) => paint(over(r, 0, 0, ['.....eE.....']), 'u', (x, y) => ((x === 1 && y === 7) || (x === 2 && y === 6) || (x === 3 && y === 6) || (x === 10 && y === 8) ? 'U' : y === 11 && (x === 3 || x === 6 || x === 8) ? 'e' : y === 11 && x === 4 ? 'E' : '')),
    alts: { a: { u: '#2E3E48', U: '#5A7A8A' }, b: { u: '#5E4238', U: '#8A6A5A' } },
  },
  brute: {
    pal: { K: OUT, W: '#FFD84A', p: '#FF8FA8', t: '#FF7F9E', g: '#9EA894', G: '#747E6A', u: '#7A4A3E', U: '#5A3A34', x: '#FFB347', l: '#332A32', f: '#241E24', L: '#4A3A40', e: '#FFB347', E: '#FFD84A' },
    // 녹슨 현무암 조끼(어깨 용암 솔기, 길·외곽선과 ΔE ≥ 23) + 노란 눈, 어깨 뼈 대신 불씨 뿔, 배·팔뚝의 빛나는 금, 빛나는 주먹
    ops: (f, y0) => {
      const { aL, aR } = armOff(f);
      return {
        body: [
          // 어깨 솔기(옷 칸만: x 6, 21) + 불씨 한 점
          ['rect*', 6, 12 + y0, 1, 3, 'e'], ['rect*', 21, 11 + y0, 1, 3, 'e'], ['px*', 7, 14 + y0, 'E'],
          // 배의 용암 금(맨살 위 꺾인 금 한 줄)
          ['line*', 12, 15 + y0, 14, 17 + y0, 'e'], ['line*', 14, 17 + y0, 13, 19 + y0, 'E'],
        ],
        // 팔뚝 금 + 주먹 빛: 다시 그린 팔 위에만
        arm: [
          ['line*', 3, 14 + y0 + aL, 4, 17 + y0 + aL, 'e'], ['line*', 4, 17 + y0 + aL, 3, 19 + y0 + aL, 'E'], ['line*', 25, 14 + y0 + aR, 24, 17 + y0 + aR, 'e'], ['line*', 24, 17 + y0 + aR, 25, 19 + y0 + aR, 'E'],
          ['rect*', 2, 24 + y0 + aL, 3, 1, 'E'], ['rect*', 23, 24 + y0 + aR, 3, 1, 'E'],
        ],
        head: [['px*', 12, 2 + y0, 'e'], ['px*', 13, 2 + y0, 'E'], ['px*', 16, 3 + y0, 'e']],
      };
    },
    alts: { a: { u: '#6A6040', U: '#4E4630' }, b: { u: '#7A4A66', U: '#5A344A' } },
  },
};

/* =====================================================================
   한밤 놀이공원(park): 밝은 연두 피부, 고깔모자·물방울 옷, 줄무늬 노점 모자, 솜사탕 머리, 차력사
   ===================================================================== */
const PARK = {
  grunt: {
    pal: { ...Z, g: '#A8D88A', G: '#6FA05A', u: '#9A73D1', U: '#6A4BA0', d: '#FFE27A', P: '#FF8FD0', y: '#FFE27A', W: '#FFFFFF', L: '#F2E6C8' },
    // 분홍·노랑 줄무늬 고깔모자(꼭대기 방울) + 노란 물방울무늬 보라 옷
    head: ['....yP....', '...PyPy...', 'ggyPyPyPgg', 'gWWggggWWg', 'gWKggggKWg', 'gppgKKgppg', '.ggggtggg.'],
    body: ['ggudUuudgg', '.guUuduug.', '..uduuud..', '..llllll..'],
    alts: { a: { P: '#8CE0D4', u: '#43B8A8', U: '#2F8A80' }, b: { P: '#9A73D1', y: '#FFFFFF', u: '#FF8FB8', U: '#C25A86', d: '#FFFFFF' } },
  },
  runner: {
    pal: { ...Z, g: '#C9E36A', G: '#93AE3E', u: '#F28A3A', U: '#C2611F', o: '#FFF1DE', b: '#C2611F', l: '#3B3B5C', L: '#FFFFFF' },
    // 주황·흰 줄무늬 노점 모자(챙) + 줄무늬 셔츠, 나비넥타이
    head: ['..uououo..', '.ouououou.', 'gbbbbbbbbg', 'gWWggggWWg', 'gWKggggKWg', 'gppgKKgppg', '.ggggtggg.'],
    body: ['gguououogg', '.guououog.', '..uououo..', '..llllll..'],
    alts: { a: { o: '#FFE27A' }, b: { o: '#FF8FD0' } },
  },
  spit: {
    pal: { ...Z, g: '#B79BE0', G: '#8A6CC0', u: '#5E4590', U: '#4A3570', P: '#FF8FD0', Q: '#FFC0E0', w: '#FFFFFF', z: '#FF8FD0', ...SPIT_TELL },
    // 솜사탕 분홍 아프로 + 흰 턱받이(분홍 테)
    deco: (r) => over(r, 0, 0, ['..PQPPQPPP..', '.PPPQPPPQPP.', 'PP........PP', 'P..........P']).map((row, y) => (y === 6 ? '.uuzwwwwzuu.' : row)),
    alts: { a: { P: '#8CE0D4', Q: '#DDFBF7' }, b: { P: '#FFE27A', Q: '#FFF6C8' } },
  },
  brute: {
    pal: { K: OUT, W: '#FFFFFF', p: '#FF8FA8', t: '#FF7F9E', g: '#A8D88A', G: '#6FA05A', u: '#FF8FD0', U: '#C25A9A', x: '#FFF1DE', l: '#3B3B5C', f: '#2E2A36', L: '#FFE27A', w: '#FFF1DE', k: '#5A3B2E' },
    // 차력사: 분홍·크림 줄무늬 민소매(어깨 두 줄 + 밑단 한 줄), 금 허리띠, 가운데가 갈라진 말린 콧수염
    ops: (f, y0) => ({
      body: [
        ['rect*', 6, 11 + y0, 5, 1, 'w'], ['rect*', 17, 11 + y0, 5, 1, 'w'], ['rect*', 6, 13 + y0, 5, 1, 'w'], ['rect*', 17, 13 + y0, 5, 1, 'w'],
        ['rect*', 7, 22 + y0, 4, 1, 'w'], ['rect*', 17, 22 + y0, 4, 1, 'w'],
      ],
      // 콧수염: 입(KK, x 12~13) 아래 양쪽 세 칸씩, 가운데(x 13) 한 칸 틈, 끝이 위로 말린다
      head: [['rect', 10, 7 + y0, 3, 1, 'k'], ['rect', 14, 7 + y0, 3, 1, 'k'], ['px', 9, 6 + y0, 'k'], ['px', 17, 6 + y0, 'k']],
    }),
    alts: { a: { u: '#8CE0D4', U: '#43B8A8' }, b: { u: '#9A73D1', U: '#6A4BA0', w: '#FFF1DE' } },
  },
};

export const FOE_BIOMES = { snow: SNOW, city: CITY, forest: FOREST, lava: LAVA, park: PARK };

/* 지역 → 종류 → 시트 이름(사막은 기본 시트) */
export const FOE_SKIN = { desert: {} };
for (const bid of Object.keys(FOE_BIOMES)) FOE_SKIN[bid] = { grunt: 'grunt_' + bid, runner: 'runner_' + bid, spit: 'spit_' + bid, brute: 'brute_' + bid };

const withAlts = (pal, alts) => (alts ? Object.fromEntries(Object.entries(alts).map(([k, v]) => [k, { ...pal, ...v }])) : undefined);

/* 기본 시트(art.js)를 받아 지역 시트를 만든다. 거구만 기본 프레임 명령을 쓰고, 졸개·질주·독침은 같은 짜임으로 다시 짠다 */
export function buildFoeSkins(SHEETS) {
  const out = {};
  const LOD = [1, 0.75, 0.5];
  for (const [bid, B] of Object.entries(FOE_BIOMES)) {
    out['grunt_' + bid] = { pal: B.grunt.pal, frames: zFrames(B.grunt, 0), lod: LOD, flash: true, alts: withAlts(B.grunt.pal, B.grunt.alts) };
    out['runner_' + bid] = { pal: B.runner.pal, frames: zFrames(B.runner, 1), lod: LOD, flash: true, alts: withAlts(B.runner.pal, B.runner.alts) };
    out['spit_' + bid] = { pal: B.spit.pal, frames: spitFrames(B.spit.deco), lod: LOD, flash: true, alts: withAlts(B.spit.pal, B.spit.alts) };
    out['brute_' + bid] = { pal: B.brute.pal, frames: bruteOn(SHEETS.brute.frames, B.brute.ops), lod: LOD, flash: true, alts: withAlts(B.brute.pal, B.brute.alts) };
  }
  return out;
}

/* 사막(기본 시트)의 무리 변형 a·b — 셔츠·조끼 색만 바꾼다(질주는 주황 계열 안에서) */
const ZG = { K: OUT, W: '#FFFFFF', s: '#FFD2AE', S: '#EDB08C', p: '#FF8FA8', k: '#5A3B2E', g: '#8FD16A', G: '#5E9E4B', L: '#F2E6C8', u: '#9A73D1', U: '#6A4BA0', l: '#4A3D6E', f: '#3A3348', t: '#FF7F9E', m: '#7A2E4A' };
const ZR = { ...ZG, g: '#C9E36A', G: '#93AE3E', u: '#F28A3A', U: '#C2611F', l: '#3B3B5C', L: '#FFFFFF' };
const ZS = { ...ZG, g: '#B79BE0', G: '#8A6CC0', u: '#5E4590', U: '#4A3570', ...SPIT_TELL };
const ZB = { K: OUT, W: '#FFFFFF', s: '#FFD2AE', S: '#EDB08C', p: '#FF8FA8', k: '#5A3B2E', g: '#76B358', G: '#4F8A3E', u: '#5E6577', U: '#454B5C', x: '#EDE4CC', l: '#3A3D4A', f: '#2E2A36', L: '#F2E6C8', t: '#FF7F9E' };
export const FOE_ALTS = {
  grunt: { a: { ...ZG, u: '#43B8A8', U: '#2F8A80' }, b: { ...ZG, u: '#D07AA8', U: '#9A4E7A' } },
  runner: { a: { ...ZR, u: '#FF9F43', U: '#D9731F', l: '#4A3D6E' }, b: { ...ZR, u: '#E8762A', U: '#B4561A', l: '#2F4A4A' } },
  spit: { a: { ...ZS, u: '#3E5E6E', U: '#2E4652' }, b: { ...ZS, u: '#7A3E6A', U: '#5A2E4E' } },
  brute: { a: { ...ZB, u: '#7A5A44', U: '#5A4232' }, b: { ...ZB, u: '#4E6A5E', U: '#3A5046' } },
};

/* 쓰러질 때 튀는 조각 색(졸개·질주·거구; 독침은 보라 그대로) — render 'kill': FOE_BURST[bid] || FX_COL.green */
export const FOE_BURST = {
  snow: ['#A9C7D6', '#DDF3FF', '#FFFFFF'],
  city: ['#9DB58A', '#6E8A60', '#C9CED6'],
  forest: ['#8FC46A', '#C9E36A', '#9A5ACF'],
  lava: ['#A9B39A', '#FFB347', '#FFD84A'],
  park: ['#A8D88A', '#FF8FD0', '#FFE27A'],
};

/* 톱날은 지역마다 바꾸지 않는다: 강철 회색 원판 + 이빨이 어느 지역에서나 같은 '위험' 신호다.
   (지역 색 원판은 용암 금빛 = 코인, 놀이공원 분홍 = 사탕처럼 읽혀 줍는 것과 헷갈렸다. 톱날에는 빨간 칸이 없어 모양만 남는다.) */

/* 시험·미리보기용 */
export const _parts = { Z_HEAD, Z_BODY, zWalk, zLunge, spitBase, over, paint, shiftRows, pad };
