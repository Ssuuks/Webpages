/* 지역 보스 6 + 정예·대왕 왕관 — 그래픽 업그레이드 2. DOM 없음, art.js를 가져오지 않는다(가져오면 순환).
   형식은 art.js 그대로: SHEETS 항목 { pal, frames, lod, flash, alts, detail }, 프레임 = 문자 격자(줄마다 108글자, '.' 투명).
   그림은 아래 작은 붓(canvas)으로 도형(타원·다각형·굵은 선)을 겹쳐 그려 격자로 뽑는다(raster.js와 같은 픽셀 규칙).
   약속(tests/bosses.mjs):
   - 모든 보스: 108×104 격자, 11자세(BOSS_POSE_NAMES 순서 = art.js BOSS_POSES), 발바닥 = 101줄(지금 보스와 같은 닻·그림자 자리),
     몸통(팔 빼고) 반폭 32~36px(y 45~75), 허리띠 줄(74~78)에서 ±26 이상, 60~74줄의 |x−54| ≤ 29는 꽉 차 있다(총알 받는 띠 ±29.25px).
     팔·무기는 거의 ±30 밖. windup = 치는 것(주먹·무기)이 y ≤ 20까지 올라간다(예고). slam = 치는 것이 y ≥ 85.
   - 'rage' 변형(뜨거운 색, 의미 빨강 #FF5D5D·#E8384F와 ΔE 15 이상), 흰 번쩍임(flash), lod [1, .75, .5, .33].
   - 왕관(crown_elite·crown_king)은 BOSS_CROWN[시트][자세] = [dx, dy, 왕관 프레임] 자리에(보스 닻 기준 1배 px) 그리며 보스 상자 안에 있다.
   - 의미 색(빨강, 게이트 파랑 #6CC0FF·#3E8BEA)은 쓰지 않는다. */

const OUT = '#2B1D2E';
export const BOSS_W = 108, BOSS_H = 104;
const CX = 54;          // 가운데(닻) 열
const FOOT = 101;       // 발바닥 줄(지금 보스와 같다: 격자 102·103줄은 비어 있다)

/* ---------------- 도형: { x0, y0, x1, y1, in(x, y) } — 픽셀 가운데(x + 0.5)로 판단(raster.js ell과 같다) ---------------- */
function ell(cx, cy, rx, ry = rx) {
  return {
    x0: Math.floor(cx - rx - 1), y0: Math.floor(cy - ry - 1), x1: Math.ceil(cx + rx + 1), y1: Math.ceil(cy + ry + 1),
    in(x, y) { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy <= 1; },
    grow: (t) => ell(cx, cy, rx + t, ry + t),
  };
}
function box(x, y, w, h) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  return { x0: x, y0: y, x1: x + w - 1, y1: y + h - 1, in: (px, py) => px >= x && px < x + w && py >= y && py < y + h };
}
function poly(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return {
    x0: Math.floor(x0) - 1, y0: Math.floor(y0) - 1, x1: Math.ceil(x1) + 1, y1: Math.ceil(y1) + 1,
    in(px, py) {
      const X = px + 0.5, Y = py + 0.5;
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if ((yi > Y) !== (yj > Y) && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    },
  };
}
/* 굵은 선(끝이 둥근 막대): 굵기 r0 → r1 */
function cap(ax, ay, bx, by, r0, r1 = r0) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9, rm = Math.max(r0, r1);
  return {
    x0: Math.floor(Math.min(ax, bx) - rm - 1), y0: Math.floor(Math.min(ay, by) - rm - 1),
    x1: Math.ceil(Math.max(ax, bx) + rm + 1), y1: Math.ceil(Math.max(ay, by) + rm + 1),
    in(px, py) {
      const X = px + 0.5 - ax, Y = py + 0.5 - ay;
      let t = (X * dx + Y * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const r = r0 + (r1 - r0) * t, ex = X - dx * t, ey = Y - dy * t;
      return ex * ex + ey * ey <= r * r;
    },
    grow: (k) => cap(ax, ay, bx, by, r0 + k, r1 + k),
  };
}
function uni(...ss) {
  return {
    x0: Math.min(...ss.map((s) => s.x0)), y0: Math.min(...ss.map((s) => s.y0)),
    x1: Math.max(...ss.map((s) => s.x1)), y1: Math.max(...ss.map((s) => s.y1)),
    in: (x, y) => ss.some((s) => s.in(x, y)),
  };
}
function cut(a, b) { return { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, in: (x, y) => a.in(x, y) && !b.in(x, y) }; }
/* 털 공: 둘레에 뾰족한 털 n개(길이 len), ph = 털 위상(걷기마다 조금씩 돌려 털이 살랑인다) */
function fuzz(cx, cy, rx, ry, n, len, ph = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + ph;
    const k = i & 1 ? 0 : len;
    pts.push([cx + Math.cos(a) * (rx + k), cy + Math.sin(a) * (ry + k)]);
  }
  return poly(pts);
}
/* 각진 돌(팔각형 비슷): 가운데·반지름·모서리 깎기 */
function rock(cx, cy, rx, ry, k = 0.42) {
  const ax = rx * k, ay = ry * k;
  return poly([[cx - rx + ax, cy - ry], [cx + rx - ax, cy - ry], [cx + rx, cy - ry + ay], [cx + rx, cy + ry - ay], [cx + rx - ax, cy + ry], [cx - rx + ax, cy + ry], [cx - rx, cy + ry - ay], [cx - rx, cy - ry + ay]]);
}
/* 점 회전(왕관 기울이기·고깔 비뚤게) */
const rot = (pts, ox, oy, a) => pts.map(([x, y]) => [ox + (x - ox) * Math.cos(a) - (y - oy) * Math.sin(a), oy + (x - ox) * Math.sin(a) + (y - oy) * Math.cos(a)]);

/* ---------------- 붓: 팔레트 글자 격자에 그린다 ----------------
   F(도형, 색) = 새 부분(바깥 1px 테두리 K + 채우기). sh = 지금 부분 안에만 칠하기(음영), rim(dx, dy) = 지금 부분의 가장자리 음영,
   on = 이미 칠한 곳에만, k = 부분이 아닌 선·무늬, under = 빈 곳에만(뒤에 깔기). */
function canvas(W = BOSS_W, H = BOSS_H) {
  const a = new Array(W * H).fill('.');
  const id = new Int32Array(W * H);
  let tag = 0, cur = null;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  function each(s, fn) {
    const ya = Math.max(0, s.y0), yb = Math.min(H - 1, s.y1), xa = Math.max(0, s.x0), xb = Math.min(W - 1, s.x1);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) if (s.in(x, y)) fn(y * W + x, x, y);
  }
  function ring4(s, fn) {
    const x0 = s.x0 - 1, y0 = s.y0 - 1, w = s.x1 - s.x0 + 3, h = s.y1 - s.y0 + 3;
    const m = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (s.in(x0 + x, y0 + y)) m[y * w + x] = 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (m[y * w + x]) continue;
        if ((x > 0 && m[y * w + x - 1]) || (x < w - 1 && m[y * w + x + 1]) || (y > 0 && m[(y - 1) * w + x]) || (y < h - 1 && m[(y + 1) * w + x])) {
          const X = x0 + x, Y = y0 + y;
          if (inb(X, Y)) fn(Y * W + X, X, Y);
        }
      }
    }
  }
  const curBox = () => ({ x0: cur.x0 - 2, y0: cur.y0 - 2, x1: cur.x1 + 2, y1: cur.y1 + 2, in: () => true });
  const g = {
    W, H,
    F(s, c, o = 'K') {
      tag++; cur = s;
      if (o) {
        if (s.grow) each(s.grow(1.2), (i) => { a[i] = o; id[i] = 0; });
        else ring4(s, (i) => { a[i] = o; id[i] = 0; });
      }
      each(s, (i) => { a[i] = c; id[i] = tag; });
      return g;
    },
    f(s, c) { tag++; cur = s; each(s, (i) => { a[i] = c; id[i] = tag; }); return g; },
    sh(s, c) { each(s, (i) => { if (id[i] === tag) a[i] = c; }); return g; },
    pat(fn, s = null) { each(s || curBox(), (i, x, y) => { if (id[i] === tag) { const k = fn(x, y, a[i]); if (k) a[i] = k; } }); return g; },
    rim(dx, dy, c) {
      const hit = [];
      each(curBox(), (i, x, y) => {
        if (id[i] !== tag) return;
        const X = x + dx, Y = y + dy;
        if (!inb(X, Y) || id[Y * W + X] !== tag) hit.push(i);
      });
      for (const i of hit) a[i] = c;
      return g;
    },
    on(s, c) { each(s, (i) => { if (a[i] !== '.') a[i] = c; }); return g; },
    /* 지금 부분이 바로 아래 key 색 위에 드리우는 그늘(앞머리 아래 얼굴 등) */
    drop(key, c, dy = 1) {
      const hit = [];
      each(curBox(), (i, x, y) => { if (id[i] === tag && inb(x, y + dy) && a[(y + dy) * W + x] === key && id[(y + dy) * W + x] !== tag) hit.push((y + dy) * W + x); });
      for (const i of hit) a[i] = c;
      return g;
    },
    k(s, c = 'K') { each(s, (i) => { a[i] = c; id[i] = 0; }); return g; },
    clear(s) { each(s, (i) => { a[i] = '.'; id[i] = 0; }); return g; },
    under(s, c) { each(s, (i) => { if (a[i] === '.') { a[i] = c; id[i] = 0; } }); return g; },
    ring(s, c = 'K', every = 1) { let n = 0; ring4(s, (i) => { if (n++ % every === 0) { a[i] = c; id[i] = 0; } }); return g; },
    px(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (inb(x, y)) { const i = y * W + x; a[i] = c === '_' ? '.' : c; id[i] = 0; } return g; },
    line(x0, y0, x1, y1, c = 'K') {
      const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      for (let i = 0; i <= n; i++) g.px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
      return g;
    },
    /* 꺾은선(이음매·바느질): 점 목록 */
    path(pts, c = 'K') { for (let i = 1; i < pts.length; i++) g.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c); return g; },
    rows(x, y, rows) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') g.px(x + i, y + j, r[i]); }); return g; },
    get: (x, y) => (inb(x, y) ? a[y * W + x] : '.'),
    out() { const rows = []; for (let y = 0; y < H; y++) rows.push(a.slice(y * W, y * W + W).join('')); return rows; },
  };
  return g;
}
const mir = (sd, d) => CX + sd * d;   // 양쪽 대칭 x

/* 공통 눈(동그란 노란 눈 + 성난 눈썹) — 우락이·왕버섯이 쓴다 */
function roundEyes(g, ex, ey, o, { r = 4.5, ry = 4, brow = true, browY = -8 } = {}) {
  if (o.eyes === 'dead') {
    for (const sd of [-1, 1]) g.rows(mir(sd, ex) - 3 + (sd < 0 ? 0 : 1), ey - 3, ['K.....K', '.K...K.', '..K.K..', '...K...', '..K.K..', '.K...K.', 'K.....K']);
    return;
  }
  if (brow) {
    for (const sd of [-1, 1]) {
      const x0 = mir(sd, ex + 7), x1 = mir(sd, ex - 3);
      g.line(x0, ey + browY, x1, ey + browY + 3); g.line(x0, ey + browY + 1, x1, ey + browY + 4); g.line(x0 - sd, ey + browY + 1, x1 - sd, ey + browY + 4);
    }
  }
  for (const sd of [-1, 1]) {
    const x = mir(sd, ex);
    g.F(ell(x, ey, r, ry), 'e');
    g.sh(ell(x - sd * 1 + 0.5, ey + 1, 2.2, 2.6), 'E');
    g.k(ell(x - sd * 1 + 0.5, ey + 1, 1.2, 1.6));
    g.px(x - 2.5, ey - 2.5, 'W');
  }
}

/* ======================================================================
   1. 사막 — 모래 도깨비 우락이: 지금 보스(뿔 달린 초록 도깨비) + 도깨비 방망이(금 돌기), 호랑이 가죽 바지, 금 허리띠, 모래빛 뿔
   ====================================================================== */
const OGRE = {
  K: OUT, W: '#FFFFFF', s: '#8BBF5E', S: '#5E9046', n: '#B5DE7E', m: '#7A4FA8', M: '#5A3780', v: '#9D74CC',
  h: '#EAD3A0', H: '#C29A62', e: '#FFD23F', E: '#FF7A2F', p: '#FF8FA8', f: '#2E2838', F: '#5C5070',
  y: '#FFD84A', Y: '#FFF09A', d: '#B87A16', r: '#5A1E3A', P: '#FF7F9E',
  q: '#F5A23A', Q: '#4A2A1E', u: '#FFC877', b: '#C98A4E', B: '#8E5A30', j: '#F0C27E',
};
const OGRE_RAGE = {
  ...OGRE, s: '#FF9A6B', S: '#D8663E', n: '#FFC8A8', m: '#A8306A', M: '#7A1E52', v: '#D0508A', e: '#FFFFFF', E: '#FFD84A',
};
/* 도깨비 방망이: 손잡이 끝(ax, ay) → 머리(bx, by). 머리 쪽이 굵고, 금 돌기가 외곽 밖으로 튀어나온다 */
function club(g, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
  let nx = -dy / L, ny = dx / L;
  if (nx + ny < 0) { nx = -nx; ny = -ny; }
  const r0 = 3, r1 = 8;
  const bumps = [];
  for (const [t, sd] of [[0.56, 1], [0.7, -1], [0.84, 1], [0.97, -1]]) {
    const r = r0 + (r1 - r0) * t;
    bumps.push([ax + dx * t + nx * sd * (r + 0.2), ay + dy * t + ny * sd * (r + 0.2)]);
  }
  bumps.push([bx + (dx / L) * (r1 + 0.2), by + (dy / L) * (r1 + 0.2)]);
  for (const [x, y] of bumps) g.F(ell(x, y, 2.2, 2.2), 'y');
  g.F(cap(ax, ay, bx, by, r0, r1), 'b');
  g.pat((x, y) => { const d = (x + 0.5 - ax) * nx + (y + 0.5 - ay) * ny; return d > 2.6 ? 'B' : d < -3 ? 'j' : null; });
  for (const t of [0.05, 0.15]) g.k(cap(ax + dx * t - nx * 2.6, ay + dy * t - ny * 2.6, ax + dx * t + nx * 2.6, ay + dy * t + ny * 2.6, 0.7), 'B');
  for (const [x, y] of bumps) { g.F(ell(x, y, 1.8, 1.8), 'y'); g.px(x - 1, y - 1, 'Y'); g.px(x + 0.6, y + 0.6, 'd'); }
}
function ogre(o) {
  const g = canvas();
  const bob = o.bob || 0, lL = o.legL || 0, lR = o.legR || 0, dead = o.name === 'dead';
  /* 호랑이 무늬: 다리마다 굵은 쐐기 줄 셋(3px → 2px → 1px), 허리띠 아래에서 가운데 쪽으로 비스듬히 = 앞에서 보면 V자 */
  const tiger = (top) => {
    const S = new Set(), W = [3, 3, 2, 2, 1];
    for (const sd of [-1, 1]) for (const xs of [28, 37, 46]) {
      const x0 = mir(sd, CX - xs);
      W.forEach((w, r) => { const xa = x0 - sd * Math.floor(r / 2); for (let i = 0; i < w; i++) S.add(xa + sd * i + ',' + (top + r)); });
    }
    return (x, y) => (S.has(x + ',' + y) ? 'Q' : null);
  };
  // 다리: 초록 정강이 + 신(바지는 몸통 뒤에 한 벌로)
  for (const [lx, lift] of [[34, lL], [60, lR]]) g.F(box(lx + 1, 86 - lift, 12, 8), 's').rim(3, 0, 'S');
  for (const [fx, lift] of [[40, lL], [68, lR]]) {
    g.F(ell(fx, 96 - lift, 11, 4.5), 'f');
    g.sh(box(fx - 9, 93 - lift, 9, 1), 'F');
  }
  // 방망이 자리(자세마다): [손잡이 끝 x, y, 머리 x, y]
  let cl;
  // 걸을 때는 어깨에 메고, windup은 두 주먹을 번쩍(지금 보스와 같은 예고) + 방망이 머리가 오른쪽 위로 솟는다
  if (dead) cl = [74, 97.5, 97, 92];
  else if (o.arms === 'up') cl = [84, 15 + bob, 97, 43 + bob];   // 오른 주먹에 쥐고 어깨 뒤로 젖힌다(머리 x 92~104, y 18~40)
  else if (o.arms === 'slam') cl = [78, 82, 96, 92];
  else if (o.arms === 'spread') cl = [101, 46 + bob, 97, 12 + bob];
  else cl = [88, 51 + bob, 98, 14 + bob];
  const E2 = (x, y, rx, ry, c) => g.F(ell(x, y, rx, ry), c);
  const fist = (x, y, rx, ry, sd) => { E2(x, y, rx, ry, 'S'); g.sh(ell(x - sd * 3, y - 3, rx * 0.55, ry * 0.45), 'n'); };
  // 팔(몸 뒤) — 오른팔(sd 1)은 방망이를 든다
  const pose = dead ? 'spread' : o.arms;
  for (const sd of [-1, 1]) {
    const fx = (d) => mir(sd, d);
    const holds = sd > 0;
    switch (pose) {
      case 'up':
        E2(fx(32), 38 + bob, 8, 14, 's');
        break;
      case 'slam': E2(fx(36), 64 + bob, 9, 13, 's'); break;
      case 'spread': E2(fx(40), 48 + bob + (dead ? 4 : 0), 12, 8, 's'); break;
      default: {
        if (holds) { E2(fx(37), 55 + bob, 9, 12, 's'); break; }
        const sw = (o.swing || 0) * sd;
        E2(fx(38), 56 + bob + sw, 9, 15, 's');
        fist(fx(41), 75 + bob + sw * 1.5, 11.5, 10, sd);
      }
    }
  }
  // 걷기·외침: 방망이는 어깨 뒤(몸·머리보다 먼저)
  const clubBehind = !dead && (pose === 'down' || pose === 'spread' || pose === 'up');
  if (clubBehind) club(g, ...cl);
  // 몸통: 보라 조끼 + 초록 배, 허리띠 아래는 호랑이 가죽
  const by = 62 + bob;
  g.F(ell(CX, by, 33, 23), 'm');
  g.sh(ell(CX, by + 10, 33, 14), 'M');
  g.sh(ell(CX - 12, by - 10, 14, 7), 'v');
  g.F(ell(CX, by + 3, 16, 13.5), 's');
  g.sh(ell(CX + 4, by + 8, 14, 9), 'S');
  g.sh(ell(CX - 5, by - 2, 6, 4), 'n');
  // 호랑이 가죽 바지: 몸통 아래 + 두 다리를 한 벌로(안쪽 외곽선 없이)
  g.F(uni(cut(ell(CX, by, 33, 23), box(0, 0, 108, 78 + bob)), box(33, 79 - lL, 16, 9), box(59, 79 - lR, 16, 9)), 'q').rim(0, 1, 'u');
  g.pat(tiger(79 + bob));
  // 금 허리띠 + 도깨비 얼굴 버클
  g.k(box(CX - 27, 73 + bob, 54, 6), 'K');
  g.k(box(CX - 26, 74 + bob, 52, 4), 'y');
  g.k(box(CX - 26, 77 + bob, 52, 1), 'd');
  g.k(box(CX - 26, 74 + bob, 52, 1), 'Y');
  for (let i = 0; i < 8; i++) { const x = CX - 23 + i * 6 + (i > 3 ? 4 : 0); g.px(x, 75 + bob, 'd').px(x + 1, 75 + bob, 'd'); }
  g.F(box(CX - 5, 71 + bob, 10, 9), 'y');
  g.rim(1, 1, 'd');
  g.rows(CX - 2, 73 + bob, ['K...K', '.....', '.KKK.']);
  // 머리
  const hy = 30 + bob + (dead ? 3 : 0);
  for (const sd of [-1, 1]) {
    const hx = mir(sd, 18);
    for (const [ox, oy, r, ry] of [[0, -16, 4.5, 6], [3, -22, 3.5, 4], [6, -27, 2.4, 2.4]]) g.F(ell(hx + sd * ox, hy + oy, r, ry), 'h');
    g.k(ell(hx + sd * 2, hy - 15, 2.5, 5), 'H');
    g.k(ell(hx + sd * 4, hy - 21, 1.6, 2.6), 'H');
  }
  for (const sd of [-1, 1]) { g.F(ell(mir(sd, 24), hy + 2, 4, 5), 's'); g.sh(ell(mir(sd, 25), hy + 2, 2, 3), 'S'); }
  g.F(ell(CX, hy, 22, 19), 's');
  g.sh(ell(CX + 6, hy + 9, 19, 10), 'S');
  g.sh(ell(CX - 9, hy - 9, 9, 6), 'n');
  g.k(box(CX - 13, hy - 17, 4, 2), 'n').px(CX - 7, hy - 18, 'n');
  roundEyes(g, 10, hy - 1, o, { r: 4.5, ry: 4, browY: -8 });
  g.k(box(CX - 19, hy + 5, 5, 2), 'p').k(box(CX + 15, hy + 5, 5, 2), 'p');
  if (o.mouth === 'roar') {
    g.F(ell(CX, hy + 11, 9, 6.5), 'r');
    g.sh(ell(CX, hy + 15, 6, 3), 'P');
    g.rows(CX - 8, hy + 5, ['hh............hh', '.hh..........hh.', '.h............h.']);
  } else if (o.mouth === 'open') {
    g.F(ell(CX, hy + 10, 6, 3.5), 'r');
    g.rows(CX - 6, hy + 7, ['hh........hh', '.h........h.']);
  } else {
    g.k(box(CX - 9, hy + 9, 18, 2)).px(CX - 10, hy + 8, 'K').px(CX + 9, hy + 8, 'K');
    g.rows(CX - 8, hy + 7, ['h..............h', 'hh............hh']);
  }
  // 앞: 든 주먹·방망이
  if (pose === 'up') {
    for (const sd of [-1, 1]) { fist(mir(sd, 30), 15 + bob, 12, 10.5, sd); g.rows(mir(sd, 30) - 4, 20 + bob, ['K.K.K.K.K']); }
  } else if (pose === 'slam') {
    fist(mir(-1, 26), 88, 13, 9, -1);
    club(g, ...cl);
    fist(mir(1, 26), 86, 12, 9, 1);
  } else if (pose === 'spread') {
    fist(mir(-1, 46), 36 + bob + (dead ? 8 : 0), 9, 10.5, -1);
    if (dead) { club(g, ...cl); fist(mir(1, 46), 44 + bob, 9, 10.5, 1); }
    else fist(mir(1, 46), 36 + bob, 9, 10.5, 1);
  } else {
    fist(mir(1, 36), 45 + bob, 9.5, 9, 1);
  }
  g.clear(box(0, FOOT + 1, BOSS_W, 3));
  return g.out();
}
const ogreCrown = (o) => [CX, 15 + (o.bob || 0) + (o.name === 'dead' ? 3 : 0), o.name === 'dead' ? 1 : 0];

/* ======================================================================
   2. 눈보라 — 설인 빙수: 둥근 털 뭉치(지그재그 털끝), 연보라 얼굴, 고드름 뿔, 벙어리장갑 손, 머리 위 큰 눈덩이
   ====================================================================== */
const YETI = {
  K: OUT, W: '#FFFFFF', a: '#F4F6FA', b: '#D3D9EA', c: '#A8B0CE', C: '#8A8FB8',
  s: '#B9C8F0', S: '#93A2D6', n: '#DCE6FF', h: '#DDF3FF', H: '#8FC4E0',
  e: '#FFE27A', E: '#E0A030', m: '#8E9CE0', M: '#6A76BC', r: '#3A2A5A', P: '#FF9FC0', p: '#FFB3C8',
  o: '#B4D6F2', O: '#D2E8FA', q: '#9AB8DE',
};
const YETI_RAGE = {
  ...YETI, a: '#FFD8CE', b: '#F4A898', c: '#D88690', C: '#B06A86', s: '#FF96B0', S: '#D86A90', n: '#FFD0DA',
  m: '#E07AA8', M: '#B85488', e: '#FFFFFF', E: '#FFD84A', h: '#FFF4E8', H: '#F0B8A8',
};
/* 벙어리장갑: (ux, uy) = 어깨 → 손 방향. 소매 끝(흰 테)은 손목 쪽(팔이 들어오는 쪽)에 */
function mitten(g, x, y, sd, ux = 0, uy = 1) {
  g.F(ell(x, y, 8.5, 7.5), 'm').rim(2, 2, 'M');
  g.sh(ell(x - 2, y - 3, 3.5, 2), 'n');
  g.F(ell(x - sd * 6.5, y + (uy < 0 ? -2 : -1), 3, 3.5), 'm').rim(1, 1, 'M');
  const cx = x - ux * 6.2, cy = y - uy * 5.6, px = -uy * 6.4, py = ux * 6.4;
  g.F(cap(cx - px, cy - py, cx + px, cy + py, 1.6), 'h').rim(0, 1, 'H');
}
/* 털 팔(굵은 막대 + 바깥 가장자리 지그재그 털): 어깨(ax, ay) → 손(bx, by), sd = 바깥쪽 */
function furCap(ax, ay, bx, by, r0, r1, sd, tooth = 2.2, step = 4.5) {
  const base = cap(ax, ay, bx, by, r0, r1);
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const out = nx * sd > 0 ? 1 : -1;   // 바깥쪽 법선 부호
  return {
    x0: base.x0 - 3, y0: base.y0 - 3, x1: base.x1 + 3, y1: base.y1 + 3,
    in(x, y) {
      if (base.in(x, y)) return true;
      const X = x + 0.5 - ax, Y = y + 0.5 - ay, t = (X * dx + Y * dy) / (L * L);
      if (t < 0.08 || t > 0.86) return false;
      const d = (X * nx + Y * ny) * out, r = r0 + (r1 - r0) * t;
      if (d <= 0) return false;
      const ph = ((t * L) / step) % 1, tri = 1 - Math.abs(ph * 2 - 1);
      return d <= r + tooth * tri;
    },
  };
}
function yeti(o) {
  const g = canvas();
  const bob = o.bob || 0, lL = o.legL || 0, lR = o.legR || 0, dead = o.name === 'dead', f = o.f || 0;
  const pose = dead ? 'dead' : o.arms;
  const by = 57 + bob + (dead ? 3 : 0);
  // 발: 털 많은 큰 발 + 발가락 금
  for (const [fx, lift] of [[39, lL], [69, lR]]) {
    g.F(ell(fx, 87 - lift, 9, 9), 'b');
    g.F(ell(fx, 96 - lift, 12, 4.8), 'b').rim(0, 2, 'c');
    for (const d of [-5, 0, 5]) g.line(fx + d, 98 - lift, fx + d, 100 - lift, 'C');
  }
  // 팔 자리: 어깨 → 손
  const sw = pose === 'down' ? (o.swing || 0) : 0;
  const arm = {
    down: [30, 44 + bob, 41, 70 + bob], up: [29, 48 + bob, 22, 16], slam: [30, 48 + bob, 23, 86],
    spread: [30, 44 + bob, 46, 30 + bob], dead: [30, 48 + bob, 43, 82],
  }[pose];
  const hand = (sd) => [mir(sd, arm[2]), arm[3] + sw * sd * 1.5];
  // 팔(털 막대, 바깥 가장자리는 지그재그 털) — 들어 올린 팔은 몸 앞(아래에서 다시)
  // windup은 팔꿈치를 바깥으로 꺾어(어깨 → 팔꿈치 → 눈덩이 옆) '번쩍 든 팔'로 읽히게
  const joints = (sd) => {
    const [hx, hy] = hand(sd), S = [mir(sd, arm[0]), arm[1]];
    return pose === 'up' ? [S, [mir(sd, 43), 31 + bob], [hx, hy]] : [S, [hx, hy]];
  };
  const armShape = (sd) => { const J = joints(sd), segs = []; for (let i = 1; i < J.length; i++) segs.push(furCap(J[i - 1][0], J[i - 1][1], J[i][0], J[i][1], i === 1 ? 8.5 : 7.5, i === 1 ? 7.5 : 7, sd)); return segs.length > 1 ? uni(...segs) : segs[0]; };
  const furArm = (sd) => {
    const J = joints(sd);
    g.F(armShape(sd), 'a');
    if (pose === 'up') g.rim(-sd * 2, 0, 'b').rim(0, 2, 'b');   // 몸 쪽 2px만 그늘
    else g.rim(sd * 2, 3, 'b').rim(sd, 1, 'c');
    const [A, Bj] = [J[J.length - 2], J[J.length - 1]];
    for (const t of J.length > 2 ? [0.45] : [0.35, 0.62]) g.rows(Math.round(A[0] + (Bj[0] - A[0]) * t) - 2, Math.round(A[1] + (Bj[1] - A[1]) * t), ['b...b', '.b.b.']);
  };
  const dirOf = (sd) => { const J = joints(sd), [A, Bj] = [J[J.length - 2], J[J.length - 1]], L = Math.hypot(Bj[0] - A[0], Bj[1] - A[1]) || 1; return [(Bj[0] - A[0]) / L, (Bj[1] - A[1]) / L]; };
  if (pose !== 'up') for (const sd of [-1, 1]) furArm(sd);
  // 고드름 뿔(몸 뒤에서 솟는다) — 정수리 털과 함께 다른 보스만큼 키가 크다(꼭대기 4줄)
  for (const sd of pose === 'up' ? [] : [-1, 1]) {   // windup: 뿔은 눈덩이 뒤(끝만 삐죽 나오면 눈덩이의 귀처럼 보인다)
    const bx = mir(sd, 15), tx = mir(sd, 21), ty = by - 53;
    g.F(poly([[bx - 6.5, by - 28], [bx + 6.5, by - 28], [tx + 0.6, ty], [tx - 0.6, ty]]), 'h');
    g.pat((x) => ((x + 0.5 - tx) * sd > 0.8 ? 'H' : null));
    g.line(tx - sd * 1, ty + 5, bx - sd * 3, by - 31, 'W');
  }
  // 몸: 털 공(털끝이 걸음마다 조금씩 돈다) + 정수리 털 세 가닥
  const tuft = poly([[CX - 15, by - 31], [CX - 11, by - 45 + (f & 1)], [CX - 6, by - 38], [CX, by - 48], [CX + 6, by - 38], [CX + 11, by - 45 + ((f + 1) & 1)], [CX + 15, by - 31]]);
  g.F(uni(fuzz(CX, by, 33, 38, 26, 3, f * 0.06 + 0.05), tuft), 'a').rim(3, 5, 'b').rim(1, 2, 'c');
  g.path([[CX - 1, by - 44], [CX - 2, by - 39]], 'b').path([[CX - 10, by - 41], [CX - 9, by - 37]], 'b').path([[CX + 10, by - 41], [CX + 9, by - 37]], 'b');
  for (const [x, y] of [[33, 8], [74, 14], [42, 24], [66, 28], [28, 22], [80, -2], [54, 32], [24, 4]]) g.rows(x - 2, by + y, ['b...b', '.b.b.']);
  // 얼굴(연보라 가면) + 앞머리 털(테두리 없이 몸에 이어진다)
  const fy = by - 13;
  g.F(ell(CX, fy, 21, 15.5), 's').rim(2, 3, 'S');
  g.sh(ell(CX - 7, fy - 5, 8, 4), 'n');
  const bang = [[CX - 25, fy - 22], [CX + 25, fy - 22], [CX + 23, fy - 8]];
  for (let i = 10; i >= 0; i--) bang.push([CX - 22 + i * 4.4, fy - 9 + (i & 1 ? 0 : 5) - (i === 5 ? 1 : 0)]);
  bang.push([CX - 23, fy - 8]);
  g.f(poly(bang), 'a');
  g.rim(0, 1, 'b');
  g.drop('s', 'S');
  g.drop('n', 'S');
  // 눈
  const ey = fy - 1;
  if (dead) {
    for (const sd of [-1, 1]) g.rows(mir(sd, 9) - 3 + (sd < 0 ? 0 : 1), ey - 2, ['K...K', '.K.K.', '..K..', '.K.K.', 'K...K']);
  } else {
    for (const sd of [-1, 1]) {
      const x = mir(sd, 9);
      g.F(ell(x, ey, 5, 5), 'W');
      g.sh(ell(x - sd * 0.8, ey + 0.8, 3.4, 3.8), 'e');
      g.sh(ell(x - sd * 0.8, ey + 1.8, 2, 2.4), 'E');
      g.k(ell(x - sd * 0.8, ey + 1.2, 1.2, 1.6));
      g.px(x - 2, ey - 2, 'W').px(x - 1, ey - 2, 'W');
      g.line(mir(sd, 14), ey - 6, mir(sd, 5), ey - 3, 'K');
    }
  }
  // 코 + 볼
  g.F(ell(CX, fy + 4, 3.2, 2.2), 'M');
  g.px(CX - 1, fy + 3, 'm');
  g.k(box(CX - 17, fy + 4, 4, 2), 'p').k(box(CX + 13, fy + 4, 4, 2), 'p');
  // 입(고드름 이)
  const my = fy + 9;
  if (o.mouth === 'roar' && !dead) {
    g.F(ell(CX, my + 1, 10.5, 6.5), 'r');
    g.sh(ell(CX, my + 5, 6, 2.5), 'P');
    for (const dx of [-8, -4, 0, 4]) g.k(poly([[CX + dx - 0.5, my - 5], [CX + dx + 3, my - 5], [CX + dx + 1.2, my + 0.5]]), 'h');
    for (const dx of [-5, 3]) g.k(poly([[CX + dx - 0.5, my + 7], [CX + dx + 3, my + 7], [CX + dx + 1.2, my + 3]]), 'h');
  } else if (o.mouth === 'open' || dead) {
    g.F(ell(CX, my, 7, 4), 'r');
    for (const sd of [-1, 1]) g.k(poly([[mir(sd, 5.5), my - 4], [mir(sd, 2), my - 4], [mir(sd, 3.8), my + 1.5]]), 'h');
    if (dead) g.F(ell(CX + 2, my + 5, 3, 3.5), 'P').k(box(CX + 2, my + 4, 1, 3), 'S');
  } else {
    g.path([[CX - 7, my - 1], [CX - 4, my + 1], [CX + 4, my + 1], [CX + 7, my - 1]]);
    for (const sd of [-1, 1]) g.k(poly([[mir(sd, 5.5), my + 0.5], [mir(sd, 2.5), my + 0.5], [mir(sd, 4), my + 4.5]]), 'h');
  }
  // 앞: 들어 올린 큰 눈덩이(머리 위를 가린다) → 든 팔, 벙어리장갑, 깨진 눈덩이
  if (pose === 'up') {
    // 얼음빛 큰 눈덩이(털과 확 다른 하늘색): 위 밝게, 아래 1/3 그늘, 왼쪽 위 하이라이트 + 반짝이, 털 위에 2px 그림자
    const bY = 18;
    const lump = [];
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, k = 1 + (i % 5 === 0 ? 0.05 : i % 5 === 2 ? -0.025 : 0); lump.push([CX + Math.cos(a) * 21.5 * k, bY + Math.sin(a) * 15 * k]); }
    g.F(poly(lump), 'o');
    g.sh(ell(CX - 5, bY - 4, 13, 8.5), 'O');
    g.sh(cut(ell(CX, bY, 23, 16.5), ell(CX - 3, bY - 4, 22, 15.5)), 'q');
    g.sh(ell(CX - 10, bY - 8, 6, 2.4), 'W');
    for (const [x, y] of [[CX + 9, bY - 8], [CX + 16, bY - 3], [CX - 15, bY + 1]]) g.px(x, y, 'W');
    for (const [x, y, w] of [[CX + 3, bY + 1, 3], [CX - 7, bY + 3, 2], [CX + 12, bY + 4, 2]]) g.k(box(x, y, w, 1), 'q');
    for (const dy of [2, 3]) g.drop('a', 'c', dy).drop('b', 'c', dy);
    for (const sd of [-1, 1]) furArm(sd);
  }
  for (const sd of [-1, 1]) { const [hx, hy] = hand(sd); mitten(g, hx, hy + (pose === 'up' ? 0 : 3), sd, ...dirOf(sd)); }
  if (o.name === 'slam') {
    for (const [x, y, rx, ry] of [[CX - 22, 95, 11, 5], [CX, 96, 13, 4.5], [CX + 22, 95, 11, 5], [CX - 38, 84, 4, 3.5], [CX + 38, 82, 4.5, 3.5], [CX - 9, 85, 4, 3], [CX + 12, 86, 3.5, 3]]) {
      g.F(ell(x, y, rx, ry), 'o').rim(2, 2, 'O').rim(1, 1, 'q');
    }
  }
  if (o.mouth === 'roar' && !dead) for (const [x, y] of [[CX - 27, 72], [CX + 27, 70]]) g.rows(x - 2, y - 2, ['..h..', '.hWh.', 'hWWWh', '.hWh.', '..h..']);
  g.clear(box(0, FOOT + 1, BOSS_W, 3));
  return g.out();
}
const yetiCrown = (o) => (o.name === 'windup' ? null : [CX, 19 + (o.bob || 0) + (o.name === 'dead' ? 3 : 0), o.name === 'dead' ? 1 : 0]);

/* ======================================================================
   3. 무너진 도시 — 철거반장 와장창: 높은 공사 고깔 모자, 형광 조끼 + 은색 띠, 각진 몸, 공구 허리띠, 쇠코 장화, 어깨에 멘 H빔
   ====================================================================== */
const CITY = {
  K: OUT, W: '#FFFFFF', s: '#9DB58A', S: '#6E8A60', n: '#C2D6A8',
  o: '#FF8A3D', O: '#C85A26', q: '#FFB070', w: '#FFF1DE',
  v: '#D8EE3A', V: '#A8BC2A', i: '#E8ECF2', I: '#9AA2B0',
  u: '#4A5A7A', U: '#35405A', l: '#6A5A4A', L: '#4E4236', f: '#7A5236', F: '#C9CED6',
  b: '#8E5A30', B: '#6A4024', y: '#FFD84A',
  g: '#B4BCC8', G: '#7A8494', j: '#E2E6EE', t: '#B0643A',
  m: '#5E4A40', M: '#3E3230', e: '#FFD23F', E: '#FF7A2F', r: '#5A1E3A', P: '#FF7F9E', p: '#FF8FA8',
};
/* 분노: 피부는 좀비 그대로(더 독한 연두), 조끼는 경광 주황, 빔은 달아오른 쇠, 반사띠는 크림 — 사람 살색이 되지 않게 */
const CITY_RAGE = {
  ...CITY, s: '#B4CC5A', S: '#7E9640', n: '#DCEE96', v: '#FF9A3C', V: '#D06A20', e: '#FFFFFF', E: '#FFD84A', u: '#6A3A5A', U: '#4E2A44',
  g: '#E0B49A', G: '#B07A62', j: '#FFE0C8', l: '#5A3A4A', L: '#422A36', i: '#FFF1DE', I: '#E0C8A8',
};
/* H빔(옆에서 본 긴 쇠기둥): 왼쪽 위 (x, y), 길이, 9px 높이, 리벳 + 녹 */
function beam(g, x, y, len) {
  g.F(box(x, y, len, 9), 'g');
  g.sh(box(x, y, len, 1), 'j').sh(box(x, y + 2, len, 5), 'G').sh(box(x, y + 7, len, 1), 'g').sh(box(x, y + 8, len, 1), 'G');
  for (let i = x + 4; i < x + len - 3; i += 7) g.px(i, y + 4, 'j').px(i + 1, y + 4, 'K');
  for (const [dx, w] of [[len * 0.22, 4], [len * 0.63, 3], [len * 0.85, 2]]) g.sh(box(x + dx, y + 2 + ((dx | 0) % 3), w, 2), 't');
}
/* 세운 H빔(외칠 때 한 손으로 번쩍): 왼쪽 위 (x, y), 9px 폭, 높이 len */
function beamV(g, x, y, len) {
  g.F(box(x, y, 9, len), 'g');
  g.sh(box(x, y, 1, len), 'j').sh(box(x + 2, y, 5, len), 'G').sh(box(x + 7, y, 1, len), 'g').sh(box(x + 8, y, 1, len), 'G');
  for (let i = y + 4; i < y + len - 3; i += 7) g.px(x + 4, i, 'j').px(x + 4, i + 1, 'K');
  for (const [dy, h] of [[len * 0.3, 4], [len * 0.7, 3]]) g.sh(box(x + 3, y + dy, 2, h), 't');
}
function foreman(o) {
  const g = canvas();
  const bob = o.bob || 0, lL = o.legL || 0, lR = o.legR || 0, dead = o.name === 'dead';
  const pose = dead ? 'dead' : o.arms;
  const pop = o.mouth === 'roar' && !dead ? 4 : 0;
  const bm = { dead: [6, 92, 96], up: [4, 2, 100], slam: [8, 88, 92] }[pose] || [1, 34 + bob, 106];
  const beamBehind = pose === 'down';
  // 외침(부르기): 오른손은 세운 빔을 번쩍, 왼손은 옆으로 주먹 — 걷기(가로 빔)와 실루엣이 확 다르다
  if (pose === 'spread') beamV(g, 91, 3 + bob, 58);
  // 장화 + 바지
  for (const [lx, lift] of [[34, lL], [60, lR]]) {
    g.F(box(lx, 79 - lift, 14, 13), 'l').rim(3, 0, 'L');
    g.F(uni(box(lx - 2, 89 - lift, 18, 8), ell(lx + 7, 97.5 - lift, 10, 3.6)), 'f').rim(0, 2, 'B');
    g.sh(ell(lx + 7, 98.5 - lift, 6, 2.6), 'F');
    g.px(lx + 4, 97 - lift, 'W');
    g.k(box(lx - 1, 91 - lift, 16, 1), 'B');
  }
  if (beamBehind) beam(g, ...bm);
  // 팔: 어깨 → 팔꿈치(파란 소매) → 주먹(살)
  const J = {
    dead: [[32, 52], [44, 66], [44, 82]], up: [[31, 50], [42, 30], [36, 9]], slam: [[31, 52], [42, 68], [30, 88]],
    spread: [[31, 50], [47, 47], [46, 31]], spreadR: [[31, 50], [45, 40], [42, 23]], down: [[31, 50], [45, 58], [40, 37]],
  };
  const sw = pose === 'down' ? (o.swing || 0) : 0;
  const P = (sd) => J[pose === 'spread' && sd > 0 ? 'spreadR' : pose].map(([x, y], k) => [mir(sd, x), y + ((pose === 'slam' || pose === 'dead') && k === 2 ? 0 : bob) + (k === 1 ? sw * sd : 0)]);
  for (const sd of [-1, 1]) {
    const Q = P(sd);
    g.F(cap(Q[0][0], Q[0][1], Q[1][0], Q[1][1], 7.5, 7), 'u').rim(sd, 2, 'U');
    g.F(cap(Q[1][0], Q[1][1], Q[2][0], Q[2][1], 6, 5.5), 's').rim(sd, 1, 'S');
    g.F(ell(Q[1][0], Q[1][1], 6.5, 4), 'u').rim(0, 1, 'U');   // 걷어 올린 소매
  }
  const fists = () => {
    for (const sd of [-1, 1]) {
      const [x, y] = P(sd)[2];
      g.F(rock(x, y, 7.5, 6.5, 0.35), 's').rim(sd * 2, 2, 'S');
      g.sh(box(x - 4, y - 4, 4, 2), 'n');
      g.k(box(x - 5, y + 1, 10, 1), 'S');
    }
  };
  // 몸통: 각진 형광 조끼(가운데 남색 셔츠), 은색 띠 둘
  const ty = bob;
  g.F(poly([[26, 44 + ty], [82, 44 + ty], [88, 50 + ty], [88, 77 + ty], [84, 82 + ty], [24, 82 + ty], [20, 77 + ty], [20, 50 + ty]]), 'v').rim(3, 2, 'V');
  for (const yy of [58, 68]) { g.sh(box(18, yy + ty, 72, 3), 'i'); g.sh(box(18, yy + 2 + ty, 72, 1), 'I'); }
  g.sh(poly([[42, 43 + ty], [66, 43 + ty], [57, 64 + ty], [51, 64 + ty]]), 'u');
  g.sh(poly([[47, 43 + ty], [61, 43 + ty], [55.5, 52 + ty], [52.5, 52 + ty]]), 'U');
  g.line(51, 64 + ty, 42, 44 + ty).line(57, 64 + ty, 66, 44 + ty);
  g.k(box(53, 66 + ty, 2, 8), 'V');
  g.k(box(26, 50 + ty, 9, 5), 'K').k(box(27, 51 + ty, 7, 3), 'w').k(box(28, 52 + ty, 5, 1), 'I');   // 이름표
  // 공구 허리띠(주머니 둘 + 금 버클)
  g.k(box(21, 74 + ty, 66, 6), 'K').k(box(22, 75 + ty, 64, 4), 'b').k(box(22, 78 + ty, 64, 1), 'B');
  g.k(box(51, 74 + ty, 6, 6), 'K').k(box(52, 75 + ty, 4, 4), 'y');
  g.F(box(27, 76 + ty, 9, 7), 'b').rim(1, 1, 'B');
  g.F(box(72, 76 + ty, 9, 7), 'b').rim(1, 1, 'B');
  g.k(box(29, 78 + ty, 5, 1), 'y').k(box(74, 78 + ty, 5, 1), 'y');
  // 머리: 네모난 얼굴, 짙은 콧수염
  const hy = 34 + bob + (dead ? 3 : 0);
  for (const sd of [-1, 1]) { g.F(ell(mir(sd, 19), hy + 1, 3.5, 5), 's'); g.sh(ell(mir(sd, 19), hy + 1, 1.5, 3), 'S'); }
  g.F(poly([[39, hy - 12], [69, hy - 12], [73, hy - 6], [73, hy + 8], [67, hy + 15], [41, hy + 15], [35, hy + 8], [35, hy - 6]]), 's').rim(2, 2, 'S');
  g.sh(box(40, hy - 11, 10, 3), 'n');
  const ey = hy - 1;
  if (dead) {
    for (const sd of [-1, 1]) g.rows(mir(sd, 8) - 2 + (sd < 0 ? 0 : 1), ey - 2, ['K...K', '.K.K.', '..K..', '.K.K.', 'K...K']);
  } else {
    for (const sd of [-1, 1]) {
      const x = mir(sd, 8);
      g.F(ell(x, ey, 3.6, 3), 'W');
      g.sh(ell(x - sd * 0.5, ey + 0.5, 2.2, 2.4), 'e');
      g.k(ell(x - sd * 0.5, ey + 0.8, 1, 1.3));
      g.k(poly([[mir(sd, 14), ey - 6], [mir(sd, 3), ey - 4 + (o.mouth ? 1 : 0)], [mir(sd, 3), ey - 2 + (o.mouth ? 1 : 0)], [mir(sd, 14), ey - 4]]), 'K');
    }
  }
  g.F(ell(CX, hy + 4, 3.5, 3), 's').rim(1, 1, 'S');
  const my = hy + 11;
  if (o.mouth === 'roar' && !dead) {
    g.F(ell(CX, my + 1.5, 9.5, 6), 'r');
    g.sh(ell(CX, my + 5, 6, 2.4), 'P');
    g.k(box(CX - 7, my - 3, 14, 1), 'W');
  } else if (o.mouth === 'open' || dead) {
    g.F(ell(CX, my, 5, 3), 'r');
    g.k(box(CX - 3, my - 2, 6, 1), 'W');
  } else {
    g.k(box(CX - 5, my + 1, 10, 1));
  }
  for (const sd of [-1, 1]) {
    g.F(ell(mir(sd, 5.5), hy + 8, 6, 2.6), 'm').rim(0, 1, 'M');
    g.F(ell(mir(sd, 11), hy + 9, 2.4, 2), 'm');
  }
  g.k(box(CX - 18, hy + 4, 4, 2), 'p').k(box(CX + 15, hy + 4, 4, 2), 'p');
  // 고깔 모자(챙 + 높은 원뿔 + 크림 띠 둘)
  const cy0 = hy - 11;
  const tip = Math.max(2, 3 + bob - pop);   // 뾰족 끝이 격자 위로 잘리지 않게
  let cone = [[51.5, tip], [56.5, tip], [69, cy0 - pop], [39, cy0 - pop]];
  let brim = [[28, cy0 - pop], [80, cy0 - pop], [80, cy0 + 4 - pop], [28, cy0 + 4 - pop]];
  if (dead) { cone = rot(cone, 54, cy0, -0.42).map(([x, y]) => [x - 6, y + 2]); brim = rot(brim, 54, cy0, -0.42).map(([x, y]) => [x - 6, y + 2]); }
  g.F(poly(cone), 'o').rim(3, 0, 'O').rim(-1, 0, 'q');
  const top = Math.min(...cone.map((p) => p[1])), base = cy0 - pop;
  if (!dead) {
    for (const [t0, t1] of [[0.32, 0.47], [0.62, 0.78]]) g.sh(box(0, top + (base - top) * t0, 108, (base - top) * (t1 - t0)), 'w');
    g.pat((x, y, k) => (k === 'w' && x > 58 + (y - top) * 0.3 ? 'i' : null));
  } else {
    g.pat((x, y) => { const v = (x - 54) * Math.sin(0.42) + (y - cy0) * Math.cos(0.42); return (v > -14 && v < -10) || (v > -7 && v < -4) ? 'w' : null; });
  }
  g.F(poly(brim), 'o').rim(0, 2, 'O');
  if (!beamBehind && pose !== 'spread') beam(g, ...bm);
  fists();
  g.clear(box(0, FOOT + 1, BOSS_W, 3));
  return g.out();
}
const cityCrown = (o) => {
  const bob = o.bob || 0, pop = o.mouth === 'roar' && o.name !== 'dead' ? 4 : 0;
  if (o.name === 'dead') return [42, 30 + bob, 1];
  return [CX, 21 + bob - pop, 0];
};

/* ======================================================================
   4. 버섯 숲 — 왕버섯 뽀글이: 아주 넓은 보라 갓(크림 점), 크림 줄기 얼굴, 이끼 수염, 뿌리 덩굴 팔 + 잎 주먹, 뿌리 발가락
   ====================================================================== */
const FOREST = {
  K: OUT, W: '#FFFFFF',
  c: '#9A5ACF', C: '#7A3EA8', d: '#B884E0', D: '#5E2E88', w: '#FFF1DE', x: '#E8D2B0',
  g: '#E8D2B0', G: '#B8946A', s: '#F2DDB8', S: '#D8BC90', n: '#FFF4DE', T: '#B89A70',
  m: '#6FA84A', M: '#4E7E34', v: '#9AD06A', r: '#8E5A30', R: '#6A4024', j: '#B07A4E',
  l: '#7CC85A', L: '#4E9A3A', e: '#FFE27A', E: '#D08A12', o: '#5A2E4A', P: '#FF8FB8', p: '#FF9FC0',
  y: '#F4FFB0', Y: '#C9E36A',
};
/* 분노: 분홍 갓 + 달아오른 살구빛 줄기 + 단풍 든 수염(이끼 → 주황 갈색) */
const FOREST_RAGE = {
  ...FOREST, c: '#E0609A', C: '#B8407A', d: '#FF94C0', D: '#8A2A5E', s: '#FFB08A', S: '#E08A60', n: '#FFD2B8', T: '#B86848',
  m: '#D8902A', M: '#A8601E', v: '#F0B850', e: '#FFFFFF', E: '#FFD84A',
};
function leafFist(g, x, y, sd, big = 1) {
  g.F(fuzz(x, y, 7.5 * big, 6.5 * big, 7, 2.2, sd * 0.4), 'l').rim(sd * 2, 2, 'L');
  g.line(x - 4 * sd, y + 3, x + 3 * sd, y - 3, 'L');
  g.px(x - sd * 1, y + 1, 'L').px(x + sd * 1, y - 2, 'L');
  g.px(x - sd * 3, y - 4, 'v').px(x - sd * 4, y - 3, 'v');
}
function shroom(o) {
  const g = canvas();
  const bob = o.bob || 0, lL = o.legL || 0, lR = o.legR || 0, dead = o.name === 'dead', f = o.f || 0;
  const pose = dead ? 'dead' : o.arms;
  // 뿌리 발: 둥근 뿌리 덩이 + 발가락 셋
  for (const [fx, lift] of [[40, lL], [68, lR]]) {
    g.F(ell(fx, 92 - lift, 10, 7), 'r').rim(2, 2, 'R');
    g.sh(ell(fx - 3, 89 - lift, 4, 2), 'j');
    for (const [dx, ex] of [[-6, -12], [0, -1], [6, 10]]) g.F(cap(fx + dx * 0.6, 95 - lift, fx + ex, 98.8 - lift, 3, 1.8), 'r').rim(1, 1, 'R');
  }
  // 팔: 뿌리 덩굴(어깨 → 팔꿈치 → 주먹)
  const J = {
    dead: [[29, 48], [38, 66], [40, 84]], up: [[30, 46], [50, 28], [44, 11]], slam: [[30, 48], [42, 66], [28, 90]],
    spread: [[30, 46], [44, 50], [49, 36]], down: [[30, 46], [40, 60], [42, 75]],
  }[pose];
  const sw = pose === 'down' ? (o.swing || 0) : 0;
  const ty = bob + (dead ? 2 : 0);
  const pts = (sd) => J.map(([x, y], k) => [mir(sd, x), y + ((pose === 'slam' || pose === 'dead') && k === 2 ? 0 : bob) + (k > 0 ? sw * sd * k * 0.8 : 0)]);
  for (const sd of [-1, 1]) {
    const Q = pts(sd);
    g.F(uni(cap(Q[0][0], Q[0][1], Q[1][0], Q[1][1], 5, 4.4), cap(Q[1][0], Q[1][1], Q[2][0], Q[2][1], 4.4, 4)), 'r').rim(sd, 2, 'R');
    g.pat((x, y) => ((x * 2 + y * 3) % 7 === 0 ? 'R' : (x + y * 2) % 9 === 0 ? 'j' : null));
    g.F(cap(Q[1][0], Q[1][1], Q[1][0] + sd * 5, Q[1][1] - 6, 1.2), 'r');
    g.F(ell(Q[1][0] + sd * 6, Q[1][1] - 8, 2.6, 1.8), 'l');
  }
  // 줄기 몸통(크림) + 갓 그늘
  g.F(uni(poly([[26, 34 + ty], [82, 34 + ty], [87, 60 + ty], [87, 80 + ty], [21, 80 + ty], [21, 60 + ty]]), ell(CX, 80 + ty, 33, 9)), 's').rim(3, 2, 'S').rim(1, 2, 'T');
  g.sh(ell(CX - 19, 66 + ty, 4, 12), 'n');
  g.sh(box(0, 34 + ty, 108, 3), 'S');
  // 이끼 수염(입 아래)
  const bt = 59 + ty;
  const bz = [];
  for (let i = 0; i <= 8; i++) bz.push([CX - 18 + i * 4.5, bt + 12 + (i & 1 ? 0 : 5) - Math.abs(i - 4) * 0.7]);
  g.F(poly([[CX - 15, bt], [CX + 15, bt], [CX + 19, bt + 5], ...bz.reverse(), [CX - 19, bt + 5]]), 'm').rim(1, 2, 'M');
  g.pat((x, y) => (y > bt + 2 && (x + (y >> 2)) % 4 === 0 ? 'M' : y <= bt + 1 && x % 3 === 0 ? 'v' : null));
  // 얼굴(갓 그늘 아래)
  const ey = 45 + ty + (dead ? 3 : 0);
  if (dead) {
    for (const sd of [-1, 1]) g.rows(mir(sd, 10) - 2 + (sd < 0 ? 0 : 1), ey - 1, ['K...K', '.K.K.', '..K..', '.K.K.', 'K...K']);
  } else {
    for (const sd of [-1, 1]) {
      const x = mir(sd, 10);
      g.F(ell(x, ey, 5, 4.5), 'W');
      g.sh(ell(x - sd, ey + 0.6, 3.4, 3.6), 'e');
      g.sh(ell(x - sd, ey + 1.6, 2, 2.2), 'E');
      g.k(ell(x - sd, ey + 1.2, 1.1, 1.5));
      g.px(x - 2.5, ey - 2, 'W').px(x - 1.5, ey - 2, 'W');
      g.line(mir(sd, 16), ey - 6, mir(sd, 5), ey - 4);
      g.line(mir(sd, 16), ey - 7, mir(sd, 6), ey - 5);
    }
  }
  g.k(box(CX - 21, ey + 5, 5, 2), 'p').k(box(CX + 17, ey + 5, 5, 2), 'p');
  const my = ey + 9;
  if (o.mouth === 'roar' && !dead) {
    g.F(ell(CX, my, 7.5, 4.5), 'o');
    g.sh(ell(CX, my + 3, 5, 2), 'P');
    g.k(box(CX - 5, my - 4, 3, 2), 'W').k(box(CX + 3, my - 4, 3, 2), 'W');
  } else if (o.mouth === 'open' || dead) {
    g.F(ell(CX, my - 1, 5, 3), 'o');
    g.k(box(CX - 3, my - 4, 2, 1), 'W').k(box(CX + 2, my - 4, 2, 1), 'W');
  } else {
    g.path([[CX - 7, my - 3], [CX - 4, my - 1], [CX + 4, my - 1], [CX + 7, my - 3]]);
    g.px(CX - 3, my, 'W').px(CX + 3, my, 'W');
  }
  // 갓: 넓은 반구, 크림 점. windup = 뒤로 젖혀 주름이 보인다, dead = 눈 위로 처진다
  const tilt = pose === 'up' ? 1 : 0;
  const cyc = 31 + (pose === 'down' ? (f & 1) : 0) + ty - tilt * 3 + (dead ? 12 : 0);
  const cry = tilt ? 25 : 28;
  if (tilt) { g.F(ell(CX, cyc + 2, 44, 8), 'g'); g.pat((x) => (x % 3 === 0 ? 'G' : null)); }
  g.F(cut(ell(CX, cyc, 48, cry), box(0, cyc + 1, 108, 60)), 'c').rim(3, 3, 'C').rim(0, 1, 'D').rim(-2, -2, 'd');
  for (const [dx, dy, rx, ry] of [[-26, -14, 7, 5], [0, -21, 8, 5], [26, -14, 7, 5], [-13, -5, 4.5, 3.2], [14, -5, 4.5, 3.2], [-40, -4, 3, 2.4], [40, -4, 3, 2.4]]) {
    g.sh(ell(CX + dx, cyc + dy, rx, ry), 'w');
    g.sh(cut(ell(CX + dx, cyc + dy, rx, ry), ell(CX + dx - 1, cyc + dy - 1, rx, ry)), 'x');
  }
  if (o.mouth === 'roar' && !dead) {
    for (const [dx, dy, r] of [[-26, -21, 5], [0, -27, 4.5], [26, -21, 5], [-40, -10, 3.4], [40, -10, 3.4]]) {
      g.F(fuzz(CX + dx, Math.max(r + 1.5, cyc + dy), r, r * 0.8, 6, 1.4, f), 'y').rim(1, 1, 'Y');
    }
  }
  for (const sd of [-1, 1]) { const Q = pts(sd); leafFist(g, Q[2][0], Q[2][1], sd, pose === 'up' ? 0.95 : pose === 'slam' ? 1.05 : 1); }
  if (o.name === 'slam') for (const [x, y] of [[CX - 38, 84], [CX + 38, 84], [CX - 15, 97], [CX + 16, 97]]) g.F(rock(x, y, 3, 2.4), 'R').rim(1, 1, 'K');
  g.clear(box(0, FOOT + 1, BOSS_W, 3));
  return g.out();
}
const shroomCrown = (o) => {
  const dead = o.name === 'dead', tilt = o.arms === 'up' && !dead ? 1 : 0;
  const cyc = 31 + (o.arms === 'down' && !dead ? (o.f & 1) : 0) + (o.bob || 0) + (dead ? 14 : 0) - tilt * 3;
  return [dead ? CX - 4 : CX, cyc - (tilt ? 25 : 28) + 12, dead ? 1 : 0];
};

/* ======================================================================
   5. 용암 협곡 — 용암 거인 화르륵: 각진 현무암 몸(네모 어깨), 빛나는 마그마 이음매·둥근 가슴 핵, 불꽃 왕관, 바위 주먹
   ====================================================================== */
/* m·M = 마그마 이음매·밑빛, f·F·h·H = 불꽃 왕관(분노 때 이음매는 하얗게 달아오르고 불꽃은 한 단계 더 뜨거운 색) */
const LAVA = {
  K: OUT, W: '#FFFFFF', a: '#33252B', b: '#4A3236', c: '#8E6458', d: '#B88A70',
  m: '#FF8A3D', M: '#FFB347', y: '#FFD84A', Y: '#FFF4B0', g: '#8A7A80', G: '#5E5258', e: '#FFF4B0', E: '#FFB347',
  f: '#FF8A3D', F: '#FFB347', h: '#FFD84A', H: '#FFF4B0',
};
const LAVA_RAGE = {
  ...LAVA, a: '#4A2828', b: '#7A3A34', c: '#A85A48', d: '#D88A60', m: '#FFF4B0', M: '#FFFFFF', y: '#FFFFFF', Y: '#FFFFFF', e: '#FFFFFF', E: '#FFF4B0',
  f: '#FFB347', F: '#FFD84A', h: '#FFF4B0', H: '#FFFFFF',
};
/* 각진 바위 + 왼쪽 위 밝은 면 */
function boulder(g, x, y, rx, ry, sd = 1, glow = false) {
  g.F(rock(x, y, rx, ry, 0.42), 'b').rim(sd * 2, 3, 'a');
  g.sh(poly([[x - rx - 1, y - ry * 0.25], [x - rx * 0.5, y - ry - 1], [x + rx * 0.45, y - ry - 1], [x + rx * 0.1, y - ry * 0.3], [x - rx * 0.35, y + ry * 0.15]]), 'c');
  g.sh(poly([[x - rx * 0.55, y - ry - 1], [x + rx * 0.55, y - ry - 1], [x + rx * 0.4, y - ry + 1.5], [x - rx * 0.4, y - ry + 1.5]]), 'd');
  if (glow) g.rim(0, 1, 'm');   // 아래 가장자리 1px 주황 밑빛(어두운 도로와 떨어져 보이게)
}
/* 빛나는 이음매: 2px(아래 K 그늘 + 주황 + 위 밝은 줄) */
function seamLine(g, P, dead) {
  g.path(P.map(([x, y]) => [x, y + 1]), 'K');
  g.path(P, dead ? 'G' : 'm');
  g.path(P.map(([x, y]) => [x, y - 1]), dead ? 'g' : 'M');
}
function golem(o) {
  const g = canvas();
  const bob = o.bob || 0, lL = o.legL || 0, lR = o.legR || 0, dead = o.name === 'dead', f = o.f || 0;
  const pose = dead ? 'dead' : o.arms;
  const ty = bob + (dead ? 3 : 0);
  // 다리·발(각진 덩이)
  for (const [lx, lift] of [[33, lL], [59, lR]]) {
    g.F(poly([[lx, 80 - lift], [lx + 16, 80 - lift], [lx + 17, 92 - lift], [lx - 1, 92 - lift]]), 'b').rim(3, 0, 'a').rim(-2, 0, 'c');
    seamLine(g, [[lx + 3, 86 - lift], [lx + 8, 89 - lift], [lx + 13, 86 - lift]], dead);
    g.F(poly([[lx - 3, 91 - lift], [lx + 19, 91 - lift], [lx + 21, 101 - lift], [lx - 5, 101 - lift]]), 'b').rim(0, 2, 'a');
    g.sh(box(lx - 3, 91 - lift, 22, 2), 'c');
  }
  // 팔: 어깨 → 팔꿈치 → 주먹
  const J = {
    dead: [[34, 48], [44, 64], [44, 82]], up: [[34, 44], [46, 28], [10, 12]], slam: [[34, 48], [40, 66], [11, 89]],
    spread: [[34, 44], [48, 50], [46, 30]], down: [[34, 46], [43, 60], [42, 76]],
  }[pose];
  const sw = pose === 'down' ? (o.swing || 0) : 0;
  const pts = (sd) => J.map(([x, y], k) => [mir(sd, x), y + ((pose === 'slam' || pose === 'dead') && k === 2 ? 0 : ty) + (k > 0 ? sw * sd * k * 0.8 : 0)]);
  for (const sd of [-1, 1]) {
    const Q = pts(sd);
    g.F(uni(cap(Q[0][0], Q[0][1], Q[1][0], Q[1][1], 7, 6.5), cap(Q[1][0], Q[1][1], Q[2][0], Q[2][1], 6.5, 6)), 'b').rim(sd * 2, 2, 'a').rim(-sd, -1, 'c');
    if (!dead) g.rim(0, 1, 'm');
    seamLine(g, [[Q[1][0] - 3, Q[1][1] - 2], [Q[1][0] + 1, Q[1][1] + 1], [Q[1][0] + 4, Q[1][1] - 1]], dead);
  }
  // 몸통: 각진 사다리꼴(어깨 판 밝게) + 이음매 + 가슴 핵
  g.F(poly([[20, 38 + ty], [88, 38 + ty], [91, 47 + ty], [87, 74 + ty], [79, 84 + ty], [29, 84 + ty], [21, 74 + ty], [17, 47 + ty]]), 'b').rim(3, 3, 'a');
  if (!dead) g.rim(0, 1, 'm');
  g.sh(poly([[21, 39 + ty], [87, 39 + ty], [89, 45 + ty], [19, 45 + ty]]), 'c');
  g.sh(box(22, 39 + ty, 64, 1), 'd');
  g.sh(poly([[19, 47 + ty], [42, 47 + ty], [38, 56 + ty], [22, 62 + ty]]), 'c');
  g.sh(poly([[30, 78 + ty], [78, 78 + ty], [76, 83 + ty], [32, 83 + ty]]), 'a');
  const cy = 58 + ty;
  for (const P of [
    [[CX - 9, cy - 3], [CX - 18, cy - 9], [CX - 24, cy - 7], [CX - 31, cy - 13]],
    [[CX + 9, cy - 3], [CX + 17, cy - 10], [CX + 25, cy - 8], [CX + 31, cy - 14]],
    [[CX - 7, cy + 7], [CX - 14, cy + 14], [CX - 12, cy + 19], [CX - 20, cy + 24]],
    [[CX + 7, cy + 7], [CX + 13, cy + 13], [CX + 11, cy + 18], [CX + 18, cy + 24]],
    [[24, 70 + ty], [33, 66 + ty], [39, 70 + ty]], [[84, 70 + ty], [75, 65 + ty], [69, 69 + ty]],
  ]) seamLine(g, P, dead);
  // 가슴 핵(걷기 1·3에 크게, 외칠 때 하얗게)
  const pulse = !dead && (f & 1) && pose === 'down';
  const white = o.mouth === 'roar' && !dead;
  g.F(ell(CX, cy, 10, 9.5), dead ? 'G' : 'm');
  if (!dead) {
    const big = pulse || white;
    g.sh(ell(CX, cy, big ? 8 : 7, big ? 7.5 : 6.5), 'M');
    g.sh(ell(CX - 0.5, cy - 0.5, big ? 5.5 : 4.5, big ? 5 : 4), 'y');
    g.sh(ell(CX - 1, cy - 1, white ? 3.6 : big ? 2.8 : 2, white ? 3.2 : big ? 2.4 : 1.8), white ? 'W' : 'Y');
  } else g.sh(ell(CX - 1, cy - 1, 5, 4.5), 'g');
  // 어깨 바위(각진 견갑)
  for (const sd of [-1, 1]) {
    const x = mir(sd, 35), y = 40 + ty;
    boulder(g, x, y, 12, 9, sd);
    seamLine(g, [[x - sd * 8, y + 5], [x - sd * 3, y + 2], [x - sd, y + 5], [x + sd * 5, y + 1]], dead);
  }
  // 불꽃 왕관(머리 위) — 혀 다섯, 걸음마다 일렁임, 외칠 때 3px 더 높이
  const hy = 32 + ty;
  if (!dead) {
    const fl = (o.mouth === 'roar' ? 3 : 0);
    const H = [10, 16, 21, 15, 10].map((h, i) => h + fl + ((f + i) & 1 ? 1 : -1));
    const base = hy - 8;
    const out = [[CX - 16, base + 2]];
    H.forEach((h, i) => {
      const x = CX - 12 + i * 6;
      out.push([x + (i < 2 ? -1 : i > 2 ? 1 : 0), Math.max(1, base - h)]);
      if (i < 4) out.push([x + 3, base - h * 0.45]);
    });
    out.push([CX + 16, base + 2]);
    g.F(poly(out), 'f');
    const inner = out.map(([x, y]) => [CX + (x - CX) * 0.68, base + 2 + (y - base - 2) * 0.72]);
    g.sh(poly(inner), 'F');
    const core = out.map(([x, y]) => [CX + (x - CX) * 0.4, base + 2 + (y - base - 2) * 0.45]);
    g.sh(poly(core), 'h');
    g.sh(ell(CX, base - 1, 2.5, 3), 'H');
  } else {
    for (const [x, y, r] of [[CX - 6, hy - 14, 2.5], [CX + 4, hy - 18, 3], [CX - 1, hy - 23, 2.2]]) g.F(ell(x, y, r, r * 0.8), 'g');
  }
  // windup: 모은 주먹이 불꽃 왕관을 가리므로 불꽃 혀 셋이 머리 양옆으로 넘실(가장 무서운 순간에 불이 꺼져 보이지 않게)
  if (pose === 'up') {
    for (const sd of [-1, 1]) {
      const fx = (d) => mir(sd, d), b0 = hy + 3, c0 = fx(19);
      const P2 = [[fx(13), b0], [fx(14), hy - 9], [fx(15), hy - 13], [fx(17), hy - 8], [fx(19), hy - 15], [fx(21), hy - 7], [fx(23), hy - 11], [fx(24.5), hy - 4], [fx(24), b0]];
      g.F(poly(P2), 'f');
      g.sh(poly(P2.map(([x, y]) => [c0 + (x - c0) * 0.62, b0 + (y - b0) * 0.62])), 'F');
      g.sh(ell(c0, b0 - 4, 1.8, 3), 'h');
    }
  }
  // 머리: 작은 바위, 무거운 눈두덩 + 빛나는 눈·입
  g.F(poly([[42, hy - 10], [66, hy - 10], [70, hy - 2], [68, hy + 10], [40, hy + 10], [38, hy - 2]]), 'b').rim(2, 2, 'a');
  g.sh(poly([[42, hy - 10], [56, hy - 10], [50, hy - 5], [39, hy - 3]]), 'c');
  g.sh(box(43, hy - 10, 22, 1), 'd');
  g.k(box(39, hy - 4, 30, 3), 'a');
  if (dead) {
    for (const sd of [-1, 1]) g.rows(mir(sd, 7) - 2 + (sd < 0 ? 0 : 1), hy - 1, ['K...K', '.K.K.', '..K..', '.K.K.', 'K...K']);
  } else {
    for (const sd of [-1, 1]) {
      const x0 = Math.min(mir(sd, 2), mir(sd, 12));
      g.k(poly([[x0, hy - 2], [x0 + 11, hy - 2], [x0 + 11 - (sd < 0 ? 0 : 3), hy + 3], [x0 + (sd < 0 ? 3 : 0), hy + 3]]), 'K');
      g.k(box(x0 + 1, hy - 1, 9, 2), 'e');
      g.k(box(x0 + 3, hy - 1, 4, 1), 'W');
    }
  }
  if (o.mouth === 'roar' && !dead) {
    g.k(box(CX - 9, hy + 3, 18, 6), 'K').k(box(CX - 8, hy + 4, 16, 4), 'M').k(box(CX - 6, hy + 5, 12, 2), 'Y');
    for (let x = CX - 7; x < CX + 8; x += 3) g.px(x, hy + 4, 'K').px(x + 1, hy + 7, 'K');
  } else if (o.mouth === 'open' || dead) {
    g.k(box(CX - 6, hy + 4, 12, 4), 'K').k(box(CX - 5, hy + 5, 10, 2), dead ? 'G' : 'M');
  } else {
    seamLine(g, [[CX - 7, hy + 6], [CX - 3, hy + 5], [CX, hy + 7], [CX + 3, hy + 5], [CX + 7, hy + 6]], dead);
  }
  // 바위 주먹(앞)
  for (const sd of [-1, 1]) {
    const [x, y] = pts(sd)[2];
    boulder(g, x, y, 10.5, 9.5, sd, !dead);
    seamLine(g, [[x + 7 * sd, y - 2], [x + 3 * sd, y + 1], [x + 4 * sd, y + 5]], dead);
    for (let k = -1; k <= 1; k++) g.px(x + k * 4, y + 6, 'a');
  }
  if (o.name === 'slam' || o.name === 'stomp1') {
    for (const [x, y, r] of [[CX - 30, 80, 3], [CX + 30, 80, 3], [CX - 20, 74, 2.2], [CX + 21, 73, 2.2], [CX, 76, 2.6], [CX - 38, 92, 2.4], [CX + 39, 92, 2.4]]) g.F(ell(x, y, r, r * 0.85), 'M').sh(ell(x - 0.6, y - 0.6, r * 0.5, r * 0.5), 'Y');
  }
  g.clear(box(0, FOOT + 1, BOSS_W, 3));
  return g.out();
}
const golemCrown = (o) => {
  const ty = (o.bob || 0) + (o.name === 'dead' ? 3 : 0);
  return o.name === 'dead' ? [CX - 3, 24 + ty, 1] : [CX, 25 + ty, 0];
};

/* ======================================================================
   6. 한밤 놀이공원 — 인형탈 곰곰이: 둥근 귀 둘, 캐러멜 털, 단추 눈(하나는 실에 대롱), 바느질 웃음, 하트 배 조각, 분홍 물방울 나비넥타이, 뿅망치
   ====================================================================== */
const PARK = {
  K: OUT, W: '#FFFFFF', s: '#C98A4E', S: '#A86A3A', n: '#E0A868', N: '#8A522C',
  u: '#F0C27E', U: '#D8A060', y: '#FFE27A', Y: '#E8C040', k: '#6A3E22',
  b: '#FF8FD0', B: '#D860A8', e: '#3A2A4A', E: '#7A6A9A', t: '#FFF1DE',
  h: '#FF8FD0', H: '#D860A8', q: '#FFE27A', Q: '#E8B030', j: '#A6F0E6', J: '#5FC0B4',
  z: '#D8DEE6', r: '#3A1E3A', P: '#FF9FC0', p: '#FFB0C8',
};
/* 분노: 털이 화난 장미색으로(캐러멜에서 확 바뀐다), 나비넥타이는 노랑으로 바꿔 털과 섞이지 않게 */
const PARK_RAGE = {
  ...PARK, s: '#E87AA8', S: '#B8507E', n: '#FFB0CC', N: '#8A3A5E', u: '#FFD6E4', U: '#E8A0BC', k: '#6A2448',
  e: '#5A1E3A', E: '#FFFFFF', b: '#FFE27A', B: '#E8B030',
};
/* 뿅망치: 손잡이 끝(ax, ay) → 머리 가운데(bx, by). 머리 = 손잡이에 수직인 굵은 통(가운데 주름 + 노란 마개) */
function toyHammer(g, ax, ay, bx, by, half = 8, r = 6.5) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, px = -uy, py = ux;
  g.F(cap(ax, ay, bx - ux * r * 0.7, by - uy * r * 0.7, 2.6), 'j').rim(1, 1, 'J');
  const p0 = [bx - px * half, by - py * half], p1 = [bx + px * half, by + py * half];
  g.F(cap(p0[0], p0[1], p1[0], p1[1], r), 'h');
  for (const [cx, cy] of [p0, p1]) g.sh(ell(cx, cy, r + 0.6, r + 0.6), 'q');
  g.sh(cap(bx - px * (half - 3), by - py * (half - 3), bx + px * (half - 3), by + py * (half - 3), r), 'h');
  for (const t of [-3, 0, 3]) g.k(cap(bx + px * t - ux * (r - 1.5), by + py * t - uy * (r - 1.5), bx + px * t + ux * (r - 1.5), by + py * t + uy * (r - 1.5), 0.6), 'H');
  g.rim(ux > 0.5 ? -1 : 1, 2, 'H');
  g.pat((x, y, k) => { const d = (x + 0.5 - bx) * ux + (y + 0.5 - by) * uy; return d < -r + 2.2 && d > -r + 0.8 ? (k === 'q' ? 'W' : 'p') : k === 'q' && d > r - 2.2 ? 'Q' : null; });
}
function heart(cx, cy, s = 1) { return uni(ell(cx - 5.5 * s, cy - 2 * s, 6 * s, 5.5 * s), ell(cx + 5.5 * s, cy - 2 * s, 6 * s, 5.5 * s), poly([[cx - 11 * s, cy], [cx + 11 * s, cy], [cx, cy + 11 * s]])); }
function teddy(o) {
  const g = canvas();
  const bob = o.bob || 0, lL = o.legL || 0, lR = o.legR || 0, dead = o.name === 'dead', f = o.f || 0;
  const pose = dead ? 'dead' : o.arms;
  const ty = bob + (dead ? 3 : 0);
  // 발·다리
  for (const [fx, lift] of [[40, lL], [68, lR]]) {
    g.F(ell(fx, 87 - lift, 9, 9), 's').rim(2, 1, 'S');
    g.F(ell(fx, 96 - lift, 11.5, 4.8), 's').rim(0, 2, 'S');
    g.sh(ell(fx, 96.5 - lift, 5, 2.4), 'u');
  }
  // 뿅망치 자리 [손잡이 끝 x, y, 머리 x, y, 반길이, 굵기]
  const hy0 = 70 + ty + (o.swing || 0) * 1.5;   // 걸을 때 오른손 높이(망치 손잡이가 5~6px 보이게 머리는 손 21px 아래)
  const hm = {
    dead: [84, 84, 80, 94.5, 8, 5.5], up: [93, 38 + ty, 85, 11, 9, 6.8], slam: [72, 64, 72, 94, 11, 6],
    spread: [99, 38 + ty, 90, 11, 7, 6], down: [93, hy0 - 4, 95, Math.min(94, hy0 + 22), 6, 5.5],
  }[pose];
  // 팔: 어깨 → 손
  const A = {
    dead: [[28, 56], [44, 84]], up: [[28, 52], [40, 12]], slam: [[28, 56], [26, 86]], spread: [[28, 52], [46, 30]], down: [[28, 54], [42, 72]],
  }[pose];
  // 오른손(망치를 쥔 손): windup 왼팔은 귀에서 떨어져 바깥 위로 비스듬히(외칠 때 팔처럼), slam은 손을 올려 손잡이가 보이게
  const R = { up: [92, 30 + ty], slam: [72, 70], spread: [99, 30 + ty], down: [94, hy0] };
  const sw = pose === 'down' ? (o.swing || 0) : 0;
  const handAt = (sd) => {
    if (sd > 0 && R[pose]) return R[pose];
    const [x, y] = A[1];
    return [mir(sd, x), y + (pose === 'slam' || pose === 'dead' ? 0 : ty) + sw * sd * 1.5];
  };
  if (pose === 'down') toyHammer(g, ...hm);
  for (const sd of [-1, 1]) {
    const [hx, hy] = handAt(sd);
    g.F(cap(mir(sd, A[0][0]), A[0][1] + ty, hx, hy, 8.5, 8), 's').rim(sd * 2, 2, 'S');
  }
  // 몸통 + 하트 조각(바느질)
  g.F(ell(CX, 71 + ty, 34, 21), 's').rim(3, 3, 'S').rim(-2, -2, 'n');
  g.f(heart(CX, 67 + ty, 1), 'y');
  g.rim(1, 2, 'Y');
  g.ring(heart(CX, 67 + ty, 1), 'k', 2);
  // 머리 + 귀
  const hy = 31 + ty;
  for (const sd of [-1, 1]) {
    g.F(ell(mir(sd, 21), hy - 18, 10, 9.5), 's').rim(sd * 2, 2, 'S');
    g.sh(ell(mir(sd, 21), hy - 17, 5.5, 5), 'u');
  }
  g.F(ell(CX, hy, 27, 20.5), 's').rim(3, 3, 'S').rim(-2, -2, 'n');
  for (let y = hy - 19; y < hy - 10; y += 2) g.px(CX - 1, y, 'N').px(CX, y + 1, 'N').px(CX + 1, y, 'N');
  // 주둥이 + 코 + 바느질 입
  const my = hy + 9;
  g.F(ell(CX, my, 12.5, 8.5), 'u').rim(1, 2, 'U');
  g.rows(CX - 3, my - 7, ['KKKKKK', '.KKKK.', '..KK..']);
  g.px(CX - 2, my - 7, 'E');
  g.line(CX - 0.5, my - 4, CX - 0.5, my - 2, 'k');
  if (o.mouth === 'roar' && !dead) {
    g.F(ell(CX, my + 2.5, 9.5, 5), 'r');
    g.sh(ell(CX, my + 6, 6, 2), 'P');
    for (let x = CX - 8; x <= CX + 8; x += 2) g.px(x, my - 2 + (Math.abs(x - CX) > 6 ? 1 : 0), 'z').px(x + 1, my + 7 - (Math.abs(x - CX) > 6 ? 1 : 0), 'z');
    g.k(box(CX + 10, my + 1, 3, 4), 'z').px(CX + 11, my + 2, 'K');
  } else if (o.mouth === 'open' || dead) {
    g.F(ell(CX, my + 1.5, 6, 3), 'r');
    for (let x = CX - 5; x <= CX + 5; x += 2) g.px(x, my - 1, 'z');
  } else {
    const sm = [[CX - 8, my - 1], [CX - 5, my + 2], [CX, my + 3], [CX + 5, my + 2], [CX + 8, my - 1]];
    g.path(sm, 'k');
    for (const [x, y] of sm.slice(1, 4)) g.px(x, y + 1, 'k');
  }
  // 단추 눈: 왼쪽은 제자리, 오른쪽은 실에 대롱(걸을 때 좌우로)
  const ey = hy - 3;
  const button = (x, y, r) => {
    g.F(ell(x, y, r, r), 'e');
    g.rim(-1, -1, 'E');
    if (o.eyes === 'dead') { g.line(x - 2, y - 2, x + 2, y + 2, 't').line(x - 2, y + 2, x + 2, y - 2, 't'); return; }
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.px(x + dx, y + dy, 'K');
    g.px(x, y, 't');
  };
  button(mir(-1, 11), ey, 5);
  const swing = dead ? 0 : pose === 'down' ? [2, 0, -2, 0][f % 4] : pose === 'spread' ? 3 : pose === 'up' ? -1 : 1;
  const dxE = mir(1, 11) + swing, dyE = ey + 9;
  g.k(ell(mir(1, 11), ey, 3, 3), 'u').ring(ell(mir(1, 11), ey, 3, 3), 'k', 2);   // 단추가 떨어진 자리 = 덧댄 천(구멍이 아니다)
  g.line(mir(1, 11), ey, dxE, dyE - 4, 't');
  button(dxE, dyE, 4.4);
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) g.px(mir(sd, 17 - i * 2.2), ey - 9 + i, 'k');
  g.k(box(CX - 22, hy + 4, 5, 2), 'p').k(box(CX + 18, hy + 4, 5, 2), 'p');
  // 나비넥타이(분홍 + 흰 물방울)
  const bty = 52 + ty;
  for (const sd of [-1, 1]) {
    g.F(poly([[CX + sd * 2, bty], [mir(sd, 15), bty - 6], [mir(sd, 16), bty + 7]]), 'b').rim(0, 2, 'B');
    g.px(mir(sd, 10), bty - 1, 'W').px(mir(sd, 12), bty + 3, 'W').px(mir(sd, 7), bty + 2, 'W');
  }
  g.F(ell(CX, bty + 0.5, 3.5, 3.5), 'B');
  // 손(앞)
  const paw = (sd) => { const [hx, hy2] = handAt(sd); g.F(ell(hx, hy2 + 1, 8, 7.5), 's').rim(sd * 2, 2, 'S'); g.sh(ell(hx, hy2 + 4, 4.5, 3), 'u'); };
  if (pose === 'down') { paw(-1); paw(1); } else { paw(-1); if (pose !== 'up' && pose !== 'slam') paw(1); toyHammer(g, ...hm); if (pose === 'up' || pose === 'slam') paw(1); }
  if (o.name === 'slam') for (const [x, y] of [[CX - 2, 80], [CX + 34, 82], [CX + 18, 76]]) g.rows(x - 2, y - 2, ['..q..', '.qWq.', 'qWWWq', '.qWq.', '..q..']);
  if (dead) for (const [x, y, r] of [[CX - 30, 50 + ty, 4], [CX + 22, hy - 22, 3.5], [CX + 26, 64 + ty, 3.5]]) g.F(fuzz(x, y, r, r * 0.85, 6, 1.4), 'W').rim(1, 1, 'z');
  g.clear(box(0, FOOT + 1, BOSS_W, 3));
  return g.out();
}
const teddyCrown = (o) => {
  const ty = (o.bob || 0) + (o.name === 'dead' ? 3 : 0);
  return o.name === 'dead' ? [CX - 4, 17 + ty, 1] : [CX, 15 + ty, 0];
};

/* ---------------- 자세(art.js BOSS_POSES와 같은 이름·순서) ---------------- */
const POSES = [
  { name: 'walk0', arms: 'down', swing: 2, legL: 3, bob: 0, f: 0 },
  { name: 'walk1', arms: 'down', swing: 0, bob: 1, f: 1 },
  { name: 'walk2', arms: 'down', swing: -2, legR: 3, bob: 0, f: 2 },
  { name: 'walk3', arms: 'down', swing: 0, bob: 1, f: 3 },
  { name: 'windup', arms: 'up', mouth: 'open', bob: -1, f: 0 },
  { name: 'slam', arms: 'slam', mouth: 'open', bob: 3, f: 0 },
  { name: 'roar0', arms: 'spread', mouth: 'roar', bob: 0, f: 0 },
  { name: 'roar1', arms: 'spread', mouth: 'roar', bob: -1, f: 1 },
  { name: 'stomp0', arms: 'down', swing: 3, legL: 6, mouth: 'open', bob: -1, f: 0 },
  { name: 'stomp1', arms: 'slam', mouth: 'roar', bob: 2, f: 1 },
  { name: 'dead', arms: 'spread', mouth: 'open', eyes: 'dead', bob: 2, f: 0 },
];
export const BOSS_POSE_NAMES = POSES.map((p) => p.name);

/* 시트: 프레임은 한 장씩 처음 읽을 때 만든다(시작이 느려지지 않게 — 그 지역에 갈 때 아틀라스가 굽는다).
   한 번에 11장을 다 그리지 않는다: 아틀라스는 쉬는 틈에 한 장씩 굽으므로, 판 중에 다음 지역을 구워도 긴 멈춤이 없다 */
function bossSheet(pal, rage, draw, detail) {
  const cache = new Array(POSES.length);
  const frames = [];
  POSES.forEach((o, i) => Object.defineProperty(frames, i, { enumerable: true, get: () => cache[i] || (cache[i] = draw(o)) }));
  return { pal, frames, lod: [1, 0.75, 0.5, 0.33], flash: true, alts: { rage }, detail };
}

/* ---------------- 왕관(정예 = 쇠 가시관 + 지역색 깃털, 대왕 = 금관 + 보석). 프레임 0 = 바로, 1 = 비뚤어짐(쓰러질 때) ---------------- */
/* 정예 테 = 짙은 쇳빛(흰 털·크림 줄무늬 위에서도 보이게) + 위 1px 밝은 줄. 깃털 = 지역색이지만 금·노랑은 대왕 전용이라 쓰지 않는다 */
const ELITE_PAL = { K: OUT, W: '#FFFFFF', i: '#9AA2B0', I: '#6E7586', J: '#4A4F5E', l: '#D4D9E2', p: '#B79BE0', P: '#8A6CC0', q: '#E0D4F6' };
const plume = (c, C, q) => ({ ...ELITE_PAL, p: c, P: C, q });
const CW = 24, CH = 14;
function eliteCrown(tilt) {
  if (tilt) return shear(eliteCrown(false));
  const g = canvas(CW, CH);
  const T = (pts) => pts;
  const P = (x, y) => T([[x, y]])[0];
  // 깃털(왼쪽 뒤에서 솟아 휜다, 지역색) — 안쪽 테두리 없이(아틀라스 외곽선만)
  g.f(uni(...[[3.4, 9.5, 2.3], [2.7, 6.6, 2.5], [3.3, 3.8, 2.3], [5, 1.8, 1.6]].map(([x, y, r]) => { const [px, py] = P(x, y); return ell(px, py, r, r); })), 'p');
  g.rim(1, 1, 'P').rim(-1, -1, 'q');
  // 가시 셋(왼쪽 밝게, 오른쪽 어둡게)
  for (const [x, top, w] of [[12, 1.2, 3.4], [7, 4.2, 2.6], [17, 4.2, 2.6]]) {
    g.f(poly(T([[x - w, 9.6], [x + w, 9.6], [x + 0.6, top], [x - 0.6, top]])), 'I');
    g.rim(1, 0, 'J').rim(-1, 0, 'i');
  }
  // 테: 위 밝은 줄, 아래 그늘, 못, 가운데 지역색 보석
  g.f(poly(T([[3.5, 9], [21.5, 9], [21.5, 13], [3.5, 13]])), 'I');
  g.rim(0, 1, 'J').rim(0, -1, 'l');
  g.path(T([[4, 8.6], [21, 8.6]]).map(([x, y]) => [x, y]), 'K');
  for (const x of [6, 18]) { const [px, py] = P(x, 11); g.px(px, py, 'J').px(px - 1, py - 1, 'W'); }
  { const [px, py] = P(12, 11); g.k(ell(px, py, 2.2, 1.9), 'K'); g.k(ell(px, py, 1.5, 1.2), 'p'); g.px(px - 1, py - 1, 'W'); }
  return g.out();
}
const KING_PAL = { K: OUT, W: '#FFFFFF', y: '#FFD84A', Y: '#FFF09A', d: '#D08A12', g: '#FF8FD0', G: '#D860A8', t: '#A6F0E6', T: '#4FBFB2' };
function kingCrown(tilt) {
  if (tilt) return shear(kingCrown(false));
  const g = canvas(CW, CH);
  const T = (pts) => pts;
  const P = (x, y) => T([[x, y]])[0];
  // 금관: 봉우리 다섯(가운데가 가장 높다) + 띠, 안쪽 테두리 없이
  const tips = [[2, 4], [7, 2.6], [12, 1.4], [17, 2.6], [22, 4]];
  const body = [[1.5, 13], [1.5, 4.6]];
  tips.forEach(([x, y], i) => { if (i) body.push([x - 2.5, 8.2]); body.push([x, y + 0.6]); });
  body.push([22.5, 4.6], [22.5, 13]);
  g.f(uni(poly(T(body)), ...tips.map(([x, y]) => { const [px, py] = P(x, y); return ell(px, py, i2(x) ? 1.9 : 1.5, i2(x) ? 1.9 : 1.5); })), 'y');
  g.rim(1, 1, 'd').rim(-1, -1, 'Y');
  g.sh(poly(T([[1, 9.4], [23, 9.4], [23, 13], [1, 13]])), 'y');
  g.path(T([[2, 9], [22, 9]]), 'd');
  g.path(T([[2, 12], [22, 12]]), 'd');
  { const [px, py] = P(12, 1.4); g.k(ell(px, py, 1.8, 1.8), 'g'); g.px(px - 1, py - 1, 'W'); }
  for (const [x, y] of [[2, 4], [7, 2.6], [17, 2.6], [22, 4]]) { const [px, py] = P(x, y); g.px(px - 1, py - 1, 'W'); }
  { const [px, py] = P(12, 10.6); g.k(ell(px, py, 2.6, 2.1), 'G'); g.k(ell(px - 0.4, py - 0.4, 1.8, 1.4), 'g'); g.px(px - 1, py - 1, 'W'); }
  for (const xx of [6, 18]) { const [px, py] = P(xx, 10.6); g.k(ell(px, py, 1.6, 1.5), 'T'); g.k(ell(px - 0.3, py - 0.3, 1, 1), 't'); }
  return g.out();
}
const i2 = (x) => x === 12;
/* 비뚤어진 왕관(쓰러질 때): 똑바른 격자를 줄마다 밀어 기울인다(돌리면 도트가 깨진다) */
function shear(rows) {
  const w = rows[0].length;
  return rows.map((r, y) => { const d = Math.round((rows.length - 1 - y) * 0.3) - 2; return d > 0 ? ('.'.repeat(d) + r).slice(0, w) : (r.slice(-d) + '.'.repeat(-d)); });
}

/* ======================================================================
   내보내기
   ====================================================================== */
export const BOSS_SHEETS = {
  boss: bossSheet(OGRE, OGRE_RAGE, ogre, ['K', 'W', 'e', 'E', 'p']),
  boss_snow: bossSheet(YETI, YETI_RAGE, yeti, ['K', 'W', 'e', 'E', 'M', 'p']),
  boss_city: bossSheet(CITY, CITY_RAGE, foreman, ['K', 'W', 'e', 'w', 'p']),
  boss_forest: bossSheet(FOREST, FOREST_RAGE, shroom, ['K', 'W', 'e', 'E', 'w', 'p']),
  boss_lava: bossSheet(LAVA, LAVA_RAGE, golem, ['K', 'W', 'e', 'Y', 'y']),
  boss_park: bossSheet(PARK, PARK_RAGE, teddy, ['K', 'W', 'e', 't', 'b', 'p']),
  crown_elite: {
    pal: ELITE_PAL, frames: [eliteCrown(false), eliteCrown(true)], lod: [1, 0.75, 0.5, 0.33],
    alts: {
      desert: plume('#5ED6C0', '#2E9E8E', '#C6F5EC'), snow: plume('#B79BE0', '#8A6CC0', '#E0D4F6'), city: plume('#B8E040', '#7E9A20', '#ECFFB0'),
      forest: plume('#8FD16A', '#5E9E4B', '#C9F5B8'), lava: plume('#E07AD8', '#A84AA8', '#F8C8F0'), park: plume('#7FE0D0', '#3FA89A', '#D0FAF4'),
    },
  },
  crown_king: { pal: KING_PAL, frames: [kingCrown(false), kingCrown(true)], lod: [1, 0.75, 0.5, 0.33] },
};

/* 지역 → 보스 시트(art.js SKIN[bid].boss) */
export const BOSS_SKIN = { desert: 'boss', snow: 'boss_snow', city: 'boss_city', forest: 'boss_forest', lava: 'boss_lava', park: 'boss_park' };

/* 왕관 자리: BOSS_CROWN[시트][자세] = [dx, dy, 왕관 프레임] — 보스 닻(외곽선 포함 그림의 아래 가운데) 기준 1배 px.
   왕관의 닻(아래 가운데)을 여기에 놓는다. 줄인 단계(st)에서는 dx·dy에 그 단계 배율(STEPS4[st])을 곱한다. */
const CROWN_AT = { boss: ogreCrown, boss_snow: yetiCrown, boss_city: cityCrown, boss_forest: shroomCrown, boss_lava: golemCrown, boss_park: teddyCrown };
export const BOSS_CROWN = {};
for (const [k, fn] of Object.entries(CROWN_AT)) {
  // 격자 (gx, gy) = 왕관 아래 가운데 픽셀 → 닻 기준: 외곽선 1px(+1)과 닻 열(55)·줄(105)
  BOSS_CROWN[k] = POSES.map((o) => { const c = fn(o); return c ? [c[0] - 54, c[1] + 1 - 104 + 1, c[2]] : null; });
}

/* 이름·칭호·등장 대사(roster.js BIOMES[].boss) */
export const BOSS_TEXT = {
  desert: { name: '우락이', kind: '모래 도깨비', title: '모래 고개의 골목대장', line: '내 방망이 맛 좀 볼래?' },
  snow: { name: '빙수', kind: '설인', title: '눈보라 기지의 털복숭이', line: '으슬으슬~ 꽁꽁 얼려 주마!' },
  city: { name: '와장창', kind: '철거반장', title: '무너진 도시의 공사왕', line: '공사 중! 싹 다 밀어 버린다!' },
  forest: { name: '뽀글이', kind: '왕버섯', title: '버섯 숲의 포자 군주', line: '포자 한 아름 받아라~!' },
  lava: { name: '화르륵', kind: '용암 거인', title: '용암 협곡의 심장', line: '뜨거운 맛 좀 봐라!' },
  park: { name: '곰곰이', kind: '인형탈', title: '한밤 놀이공원의 인기 스타', line: '같이 놀자~ 안 놔줄 거야!' },
};
/* 등급(core.js levelTag: hard = 5의 배수, super = 10의 배수) */
export const BOSS_TIER = {
  hard: { prefix: '정예', crown: 'crown_elite', sparks: 4, sparkCol: null, band: null },
  super: { prefix: '대왕', crown: 'crown_king', sparks: 8, sparkCol: ['#FFF09A', '#FFD84A', '#FFFFFF'], band: '#FFD84A', line: '이 지역의 왕은 나다!' },
};
export const bossName = (bid, tag) => {
  const t = BOSS_TEXT[bid] || BOSS_TEXT.desert, tier = BOSS_TIER[tag];
  return tier ? `${tier.prefix} ${t.name}` : t.name;
};

/* 효과 색(render.js): dust = 내려찍기·짓밟기·등장 먼지, ring = 내려찍기 고리, roar = 부르기 고리, enrage = 분노 터짐,
   steam = 분노 중 머리 위 김({ c, spr }), death = 쓰러질 때 터짐, shard = 내려찍기 때 같이 튀는 조각 그림(없으면 null),
   band = 이름 띠 색, spark = 정예 기운 반짝이 색. 빨강(내려찍기 경고·피격 번쩍임)은 의미 색이라 어디서나 그대로. 게이트 파랑은 쓰지 않는다 */
export const BOSS_FX = {
  desert: {
    dust: ['#E6D2B0', '#B89A70'], ring: '#FFF1DE', roar: '#FFD84A', enrage: ['#FFFFFF', '#E8ECF2', '#C9CED6'],
    steam: { c: '#F4F6FA', spr: 'smoke' }, death: ['#8FD16A', '#5E9E4B', '#C9E36A', '#FFF09A', '#FFD84A', '#D08A12'], shard: null,
    band: '#7A4FA8', spark: ['#5ED6C0', '#C6F5EC'],
  },
  snow: {
    dust: ['#FFFFFF', '#DCE0EA', '#BFE3EC'], ring: '#DDF3FF', roar: '#DDF3FF', enrage: ['#FFFFFF', '#DDF3FF', '#BFE3EC'],
    steam: { c: '#DDF3FF', spr: null }, death: ['#FFFFFF', '#DDF3FF', '#BFE3EC', '#9FD0E8', '#B9C8F0'], shard: 'shard',
    band: '#8E9CE0', spark: ['#B79BE0', '#E0D4F6'],
  },
  city: {
    dust: ['#C9CED6', '#9AA2B0', '#F2C230'], ring: '#F2C230', roar: '#F2C230', enrage: ['#FFF4B0', '#F2C230', '#C9CED6'],
    steam: { c: '#F4F6FA', spr: 'smoke' }, death: ['#C9CED6', '#9AA2B0', '#F2C230', '#FF8A3D', '#FFF1DE'], shard: null,
    band: '#E0A020', spark: ['#B8E040', '#ECFFB0'],
  },
  forest: {
    dust: ['#C9E36A', '#B79BE0', '#F4FFB0'], ring: '#F4FFB0', roar: '#C9E36A', enrage: ['#F4FFB0', '#C9E36A', '#B79BE0'],
    steam: { c: '#F4FFB0', spr: null }, death: ['#C9E36A', '#B79BE0', '#F4FFB0', '#9A5ACF', '#8FD16A'], shard: null,
    band: '#6FA84A', spark: ['#8FD16A', '#C9F5B8'],
  },
  lava: {
    dust: ['#FFB347', '#FFD84A', '#6A5A62'], ring: '#FFB347', roar: '#FFD84A', enrage: ['#FFF4B0', '#FFD84A', '#FFB347'],
    steam: { c: '#FFB347', spr: null }, death: ['#FFB347', '#FFD84A', '#FFF4B0', '#6A5A62', '#94746C'], shard: null,
    band: '#E0702A', spark: ['#E07AD8', '#F8C8F0'],
  },
  park: {
    dust: ['#FF8FD0', '#FFE27A', '#A6F0E6', '#FFFFFF'], ring: '#FF8FD0', roar: '#FFE27A', enrage: ['#FFFFFF', '#FF8FD0', '#FFE27A'],
    steam: { c: '#FFFFFF', spr: null }, death: ['#FF8FD0', '#FFE27A', '#A6F0E6', '#FFFFFF', '#C98A4E'], shard: null,
    band: '#D860A8', spark: ['#7FE0D0', '#D0FAF4'],
  },
};
