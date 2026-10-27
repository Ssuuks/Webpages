/* 원근 카메라 — 분대 뒤 위쪽에서 앞쪽 한 점을 내려다본다(망원 느낌이라 먼 게이트도 읽힌다).
   월드 좌표: x 좌우(도로 가운데 0), y 높이, z 전진 방향. 화면 좌표는 CSS 픽셀. */

export const NEAR = 1;

export function makeView() {
  return {
    w: 0, h: 0,           // 캔버스 CSS 크기
    col: 0,               // 도로를 담는 세로 기둥 폭(넓은 화면에서도 폰 비율)
    cx: 0, cy: 0,         // 주점(화면 중심선)
    F: 1,                 // 초점 거리(픽셀)
    back: 16, up: 13, ahead: 12,   // 카메라 배치(분대 기준)
    sin: 0, cos: 1,       // 내려다보는 각
    camX: 0, camZ: 0, camH: 13,
    squadD: 20,           // 분대 깊이(끌기 조작 환산용)
    horizon: 0,           // 지평선 y
    shakeX: 0, shakeY: 0,
  };
}

/* 카메라 배치와 화면 크기로 렌즈를 정한다. extra(0~1)는 보스전에서 뒤로 빠지는 정도.
   opt(생략 가능): at = 분대가 올 화면 높이 비율(기본 0.74), up·back = 카메라 높이·거리,
   minHz = 지평선이 이보다 위로 올라가지 않게(화면 높이 비율) — 낮은 화면에서는 분대가 그만큼 내려온다,
   extraBack·extraUp = 보스전에 더 빠지는 거리·높이(기본 6·3). */
export function fitView(v, w, h, roadHalf, extra = 0, opt = null) {
  const at = opt && opt.at != null ? opt.at : 0.74;
  v.w = w;
  v.h = h;
  v.col = Math.min(w, h * 0.62);
  v.back = (opt && opt.back != null ? opt.back : 16) + (opt && opt.extraBack != null ? opt.extraBack : 6) * extra;
  v.up = (opt && opt.up != null ? opt.up : 13) + (opt && opt.extraUp != null ? opt.extraUp : 3) * extra;
  v.camH = v.up;
  const th = Math.atan2(v.up, v.back + v.ahead);
  v.sin = Math.sin(th);
  v.cos = Math.cos(th);
  // 분대 깊이에서 도로 폭이 기둥의 90%가 되게
  const dS = v.up * v.sin + v.back * v.cos;
  const vS = -v.up * v.cos + v.back * v.sin;
  v.squadD = dS;
  v.F = (v.col * 0.9 * dS) / (2 * roadHalf * (1 + 0.12 * extra));
  v.cx = w / 2;
  // 분대가 화면 높이 at 지점에 오도록
  v.cy = h * at + (vS * v.F) / dS;
  v.horizon = v.cy - (v.sin / v.cos) * v.F;
  if (opt && opt.minHz != null && v.horizon < opt.minHz * h) {
    const dy = opt.minHz * h - v.horizon;
    v.cy += dy;
    v.horizon += dy;
  }
}

/* 투영 결과를 담는 재사용 객체 — 프레임마다 객체를 만들지 않는다 */
export const P = { x: 0, y: 0, s: 0, d: 0 };

export function project(v, x, y, z) {
  const dy = y - v.camH;
  const dz = z - v.camZ;
  const d = -dy * v.sin + dz * v.cos;
  if (d < NEAR) return false;
  const s = v.F / d;
  const up = dy * v.cos + dz * v.sin;
  P.x = v.cx + (x - v.camX) * s + v.shakeX;
  P.y = v.cy - up * s + v.shakeY;
  P.s = s;
  P.d = d;
  return true;
}

/* 화면 가로 이동(px) → 분대 깊이에서의 월드 거리 */
export function pxToWorld(v, px) {
  return (px * v.squadD) / v.F;
}
