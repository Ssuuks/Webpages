/* 무한모드 2단계 장애물 도트(단계 해금 기획서 4절): 폭발 드럼통 · 방패 정예의 방패.
   art.js를 가져오지 않는 그림 모듈 — SHEETS·WORLD_H에 펼쳐 부팅 때 함께 굽는다(작다). 장갑문·폭발 반경·잔해는 렌더러가 도형으로 그린다(실제 폭 그대로).
   - 드럼통: 빨간 통 + 노란 위험 마름모(길가 소품 'barrel'의 주황 통과 한눈에 다르게). 그린 폭(13px)이 맞는 폭(core OBSTACLES — x0~x1 0.9m)에 맞는 키(WORLD_H.drum).
     둘째 장은 마름모만 밝다 — 천천히 깜박여 '쏠 것'으로 눈에 띄게(터질 것처럼 불붙은 모양은 아니다: 쏘거나 닿아야 터진다).
   - 방패: 졸개 몸 앞(카메라 쪽 — 좀비는 분대를 보고 온다)에 드는 철판 방패, 테두리는 정예 표식 색(청록 OBSTACLES.shield.color). 머리는 방패 위로 보인다 */
const K = '#2B1D2E';
const DRUM_PAL = { r: '#E8384F', R: '#FF6B5B', d: '#A92644', D: '#6E1A33', w: '#FFC2B3', g: '#C9CED6', G: '#596277', y: '#FFD84A', K };
const drum = (lit) => [
  '...ddddddd...',
  '.dRRRRRRRRRd.',
  'dRRwRRRRgGRRd',
  'dRRRRRRRRRRRd',
  'DDDDDDDDDDDDD',
  'rRwrrrrrrrrdd',
  'DDDDDDDDDDDDD',
  'rRrrrryrrrrdd',
  'rRrrryKyrrrdd',
  'rRrryKKKyrrdd',
  'rRrrryKyrrrdd',
  'rRrrrryrrrrdd',
  'DDDDDDDDDDDDD',
  'rRrrrrrrrrrdd',
  '.ddddddddddd.',
].map((row) => (lit ? row.replace(/y/g, 'Y') : row));

const SHIELD_PAL = { t: '#3FE0D0', T: '#1F8F86', J: '#DDF3FF', j: '#8FD3FF', Z: '#9AA2B0', z: '#E8ECF2', K };

export const OBST_SHEETS = {
  /* 폭발 드럼통(prop.kind 'drum'): 13×15 → 외곽선 15×17. [0] 보통, [1] 위험 마름모가 밝다 */
  drum: { pal: { ...DRUM_PAL, Y: '#FFF09A' }, frames: [drum(false), drum(true)], lod: [1, 0.75, 0.5], flash: true, detail: ['y', 'Y', 'K'] },
  /* 방패 정예(foe.elite 'shield')의 방패: 7×9 → 외곽선 9×11. 위 창(하늘빛), 철판, 가운데 청록 표식 */
  riotShield: { pal: SHIELD_PAL, frames: [[
    '.ttttt.',
    'tJJJJJt',
    'tJjjjJt',
    'tZZZZZt',
    'tZzZzZt',
    'tZZTZZt',
    'tZZZZZt',
    '.tZZZt.',
    '..ttt..',
  ]], lod: [1, 0.75, 0.5], flash: true, detail: ['t', 'J'] },
};
/* 세계 키(m — 축소 단계 고르기): 드럼통 1.0m(그린 폭 13px = 0.87m ≈ 맞는 폭 0.9m, 분대 앞 5m쯤에서 원래 크기). 방패는 든 좀비의 축소 단계를 따른다 */
export const OBST_WORLD_H = { drum: 1.0 };
