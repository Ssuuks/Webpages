/* 캐릭터 스프라이트 — 이미지 파일 없이 처음 한 번 오프스크린 캔버스에 그려 둔다.
   각 스프라이트는 발끝이 (w/2, h) 인 기준점이고, unit(월드 1 높이당 픽셀)을 함께 들고 다닌다. */

const OUT = '#14202E';

function canvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fillStroke(g, fill, lw = 3) {
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = OUT;
  g.stroke();
}

/* 흰 실루엣(피격 번쩍임) */
function whiteOf(src) {
  const c = canvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/* 아군 병사(뒷모습) — 4프레임 걷기 */
function soldier(frame, palette) {
  const W = 72, H = 96;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  const step = [0, 5, 0, -5][frame];
  const cx = W / 2;
  // 다리
  rr(g, cx - 13, 64 + Math.max(0, step), 11, 28 - Math.max(0, step), 5); fillStroke(g, palette.pants);
  rr(g, cx + 2, 64 + Math.max(0, -step), 11, 28 - Math.max(0, -step), 5); fillStroke(g, palette.pants);
  // 팔
  rr(g, cx - 25, 42, 11, 24, 5); fillStroke(g, palette.body);
  rr(g, cx + 14, 42, 11, 24, 5); fillStroke(g, palette.body);
  // 소총(오른 어깨 위로)
  g.save();
  g.translate(cx + 14, 46);
  g.rotate(-0.55);
  rr(g, -3, -34, 7, 40, 2); fillStroke(g, '#2B3038', 2.5);
  g.restore();
  // 몸통
  rr(g, cx - 17, 38, 34, 32, 10); fillStroke(g, palette.body);
  // 배낭
  rr(g, cx - 11, 42, 22, 20, 5); fillStroke(g, palette.pack, 2.5);
  g.fillStyle = 'rgba(255,255,255,.18)';
  g.fillRect(cx - 8, 45, 16, 3);
  // 목·귀
  g.fillStyle = palette.skin;
  g.fillRect(cx - 6, 32, 12, 8);
  // 헬멧
  g.beginPath();
  g.arc(cx, 26, 17, 0, Math.PI * 2);
  fillStroke(g, palette.helmet);
  g.beginPath();
  g.arc(cx - 5, 20, 6, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,.28)';
  g.fill();
  g.beginPath();
  g.ellipse(cx, 38, 19, 4, 0, 0, Math.PI);
  g.strokeStyle = OUT;
  g.lineWidth = 3;
  g.stroke();
  return { c, w: W, h: H, unit: 92 };
}

/* 좀비(앞모습) */
function zombie(frame, kind) {
  const big = kind === 'brute';
  const fat = kind === 'spit';
  const W = big ? 140 : fat ? 104 : 80;
  const H = big ? 176 : fat ? 108 : 104;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  const skin = { grunt: '#8CC56A', runner: '#A9D36F', brute: '#6E9C4C', spit: '#9B7FC2' }[kind];
  const cloth = { grunt: '#6A4C8C', runner: '#C2453B', brute: '#5A5F6B', spit: '#4F3A6E' }[kind];
  const pants = { grunt: '#3D3350', runner: '#3A2E2E', brute: '#3A3D45', spit: '#2E2540' }[kind];
  const sw = [0, 1, 0, -1][frame];
  const cx = W / 2;
  const k = big ? 1.75 : fat ? 1.05 : 1;
  const top = H - 100 * k;
  const Y = (y) => top + y * k;
  const S = (v) => v * k;
  // 다리
  rr(g, cx - S(14), Y(68) + Math.max(0, sw) * 4, S(11), S(30) - Math.max(0, sw) * 4, 4); fillStroke(g, pants);
  rr(g, cx + S(3), Y(68) + Math.max(0, -sw) * 4, S(11), S(30) - Math.max(0, -sw) * 4, 4); fillStroke(g, pants);
  // 몸통
  if (fat) {
    g.beginPath();
    g.ellipse(cx, Y(56), S(26), S(22), 0, 0, Math.PI * 2);
    fillStroke(g, cloth);
    g.beginPath();
    g.ellipse(cx, Y(60), S(15), S(13), 0, 0, Math.PI * 2);
    g.fillStyle = '#B9F25B';
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.beginPath();
    g.ellipse(cx - S(5), Y(55), S(5), S(3), -0.4, 0, Math.PI * 2);
    g.fill();
  } else {
    rr(g, cx - S(18), Y(38), S(36), S(34), S(9)); fillStroke(g, cloth);
    // 찢어진 옷자락
    g.fillStyle = skin;
    g.beginPath();
    g.moveTo(cx - S(4), Y(72)); g.lineTo(cx + S(2), Y(62)); g.lineTo(cx + S(7), Y(72)); g.closePath();
    g.fill();
  }
  // 팔(앞으로 뻗음)
  const arm = (side) => {
    const ax = cx + side * S(20);
    const ay = Y(44) + sw * side * 3;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(ax + side * S(6), ay + S(22));
    g.lineWidth = S(10);
    g.lineCap = 'round';
    g.strokeStyle = OUT;
    g.stroke();
    g.lineWidth = S(6.5);
    g.strokeStyle = skin;
    g.stroke();
  };
  arm(-1);
  arm(1);
  if (big) {
    // 어깨 가시
    g.fillStyle = '#C9C2B0';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + side * S(14), Y(40));
      g.lineTo(cx + side * S(22), Y(28));
      g.lineTo(cx + side * S(24), Y(42));
      g.closePath();
      g.fill();
      g.strokeStyle = OUT;
      g.lineWidth = 2;
      g.stroke();
    }
  }
  // 머리
  g.beginPath();
  g.arc(cx + sw * 1.5, Y(26), S(15), 0, Math.PI * 2);
  fillStroke(g, skin);
  // 눈
  g.fillStyle = '#1A1020';
  g.beginPath(); g.arc(cx - S(6) + sw * 1.5, Y(24), S(4.2), 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + S(6) + sw * 1.5, Y(24), S(4.2), 0, Math.PI * 2); g.fill();
  g.fillStyle = kind === 'runner' ? '#FFD23F' : '#FF4A3D';
  g.beginPath(); g.arc(cx - S(6) + sw * 1.5, Y(24), S(1.8), 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + S(6) + sw * 1.5, Y(24), S(1.8), 0, Math.PI * 2); g.fill();
  // 입
  g.fillStyle = '#2A1420';
  rr(g, cx - S(5) + sw * 1.5, Y(31), S(10), S(4), S(2));
  g.fill();
  const unit = { grunt: 100, runner: 100, brute: 90, spit: 100 }[kind] * k;
  return { c, w: W, h: H, unit };
}

/* 보스 — 거대한 돌연변이 */
function boss(frame) {
  const W = 300, H = 300;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  const sw = [0, 1, 0, -1][frame];
  const cx = W / 2;
  const skin = '#7FA35A';
  // 다리
  rr(g, cx - 62, 210 + Math.max(0, sw) * 6, 46, 88 - Math.max(0, sw) * 6, 14); fillStroke(g, '#3B3446', 5);
  rr(g, cx + 16, 210 + Math.max(0, -sw) * 6, 46, 88 - Math.max(0, -sw) * 6, 14); fillStroke(g, '#3B3446', 5);
  // 몸통
  g.beginPath();
  g.moveTo(cx - 110, 120);
  g.quadraticCurveTo(cx - 120, 230, cx - 60, 235);
  g.lineTo(cx + 60, 235);
  g.quadraticCurveTo(cx + 120, 230, cx + 110, 120);
  g.quadraticCurveTo(cx, 60, cx - 110, 120);
  g.closePath();
  fillStroke(g, '#5E3E78', 5);
  // 가슴 상처·근육
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(cx, 160, 58, 46, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 4;
  g.stroke();
  g.strokeStyle = '#B23A3A';
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(cx - 30, 140); g.lineTo(cx + 20, 185); g.stroke();
  g.beginPath(); g.moveTo(cx - 10, 136); g.lineTo(cx - 18, 150); g.moveTo(cx + 2, 150); g.lineTo(cx - 6, 164); g.moveTo(cx + 12, 164); g.lineTo(cx + 4, 178); g.stroke();
  // 팔
  for (const side of [-1, 1]) {
    const ax = cx + side * 100;
    g.beginPath();
    g.moveTo(ax, 120);
    g.quadraticCurveTo(ax + side * 40, 170 + sw * side * 8, ax + side * 22, 232 + sw * side * 8);
    g.lineCap = 'round';
    g.lineWidth = 44;
    g.strokeStyle = OUT;
    g.stroke();
    g.lineWidth = 36;
    g.strokeStyle = skin;
    g.stroke();
    // 주먹
    g.beginPath();
    g.arc(ax + side * 22, 236 + sw * side * 8, 26, 0, Math.PI * 2);
    fillStroke(g, '#6E924C', 5);
  }
  // 어깨 가시
  g.fillStyle = '#E4DCC6';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const bx = cx + side * (70 + i * 16);
      g.beginPath();
      g.moveTo(bx - 9, 112 + i * 6);
      g.lineTo(bx + side * 8, 70 + i * 10);
      g.lineTo(bx + 9, 114 + i * 6);
      g.closePath();
      g.fill();
      g.strokeStyle = OUT;
      g.lineWidth = 3;
      g.stroke();
    }
  }
  // 머리
  g.beginPath();
  g.arc(cx, 92, 44, 0, Math.PI * 2);
  fillStroke(g, skin, 5);
  // 뿔
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + side * 24, 60);
    g.quadraticCurveTo(cx + side * 56, 30, cx + side * 50, 8);
    g.quadraticCurveTo(cx + side * 40, 40, cx + side * 10, 56);
    g.closePath();
    fillStroke(g, '#E4DCC6', 4);
  }
  // 눈(빛남)
  for (const side of [-1, 1]) {
    g.fillStyle = '#1B0F1F';
    g.beginPath(); g.ellipse(cx + side * 17, 88, 12, 9, side * 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#FFB020';
    g.beginPath(); g.ellipse(cx + side * 17, 88, 6, 4.5, side * 0.3, 0, Math.PI * 2); g.fill();
  }
  // 입
  g.fillStyle = '#2A1020';
  rr(g, cx - 22, 106, 44, 16, 6);
  g.fill();
  g.fillStyle = '#F2EAD8';
  for (let i = 0; i < 5; i++) g.fillRect(cx - 19 + i * 8.5, 106, 5, 6);
  return { c, w: W, h: H, unit: 290 };
}

const TEAM = { body: '#2F7DE1', pack: '#1C4F99', pants: '#1F3556', helmet: '#2A62B8', skin: '#E9B98F' };

export function buildSprites() {
  const S = { soldier: [], soldierHurt: [], grunt: [], runner: [], brute: [], spit: [], boss: [], white: {} };
  for (let f = 0; f < 4; f++) {
    S.soldier.push(soldier(f, TEAM));
    S.grunt.push(zombie(f, 'grunt'));
    S.runner.push(zombie(f, 'runner'));
    S.brute.push(zombie(f, 'brute'));
    S.spit.push(zombie(f, 'spit'));
    S.boss.push(boss(f));
  }
  S.soldierHurt.push(soldier(0, { body: '#E5484D', pack: '#A3262B', pants: '#5A1E22', helmet: '#C9363B', skin: '#E9B98F' }));
  for (const k of ['grunt', 'runner', 'brute', 'spit', 'boss']) {
    const s = S[k][0];
    S.white[k] = { c: whiteOf(s.c), w: s.w, h: s.h, unit: s.unit };
  }
  return S;
}
