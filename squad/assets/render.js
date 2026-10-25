/* 화면 그리기 — 시뮬레이션 상태를 읽기만 한다(상태를 바꾸지 않는다).
   이펙트(파편·떠오르는 숫자·흔들림)는 여기서만 산다. */
import { makeView, fitView, project, P } from './view.js';
import { ROAD, radius, cellGood, applyOp, pickCell, BULLET_SPEED, DT } from './core.js';
import { buildSprites } from './sprites.js';

const FONT = '"Black Han Sans", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const C = {
  skyTop: '#1B2340', skyMid: '#5A3E5E', skyLow: '#E7955A',
  hills: '#3A2E45', hills2: '#4E3A4F',
  sand: '#C9A170', sandDark: '#9E7A50',
  road: '#4A4D55', road2: '#51545C', curbA: '#D9483B', curbB: '#EDE6D6', line: 'rgba(240,236,220,.55)',
  good: '47,140,255', bad: '232,84,50', zero: '150,156,168',
  wall: '#8F969E', wallTop: '#B7BDC4', hazard: '#F2C230',
  crate: '#A8743E', crateTop: '#C99257',
  shadow: 'rgba(20,12,10,.28)',
  bullet: ['#FFE38A', '#FFB347', '#7FE8FF', '#FF7AD9'],
  outline: '#121A26',
};

const MAX_PARTS = 360;
const MAX_FLOATS = 24;

export function createRenderer(cvs) {
  const ctx = cvs.getContext('2d', { alpha: false });
  const view = makeView();
  const spr = buildSprites();
  let dpr = 1;
  let quality = 'high';
  let shakeOn = true;
  let preview = false;
  let soldierCap = 150;

  /* 이펙트 풀 */
  const parts = [];
  for (let i = 0; i < MAX_PARTS; i++) parts.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.1, color: '#fff', grav: 9 });
  const floats = [];
  for (let i = 0; i < MAX_FLOATS; i++) floats.push({ on: false, x: 0, y: 0, z: 0, text: '', color: '#fff', life: 0, max: 1, size: 24 });
  let trauma = 0;
  let flash = 0;
  let flashColor = '255,255,255';
  let camX = 0;
  let dolly = 0;
  let shownN = 0;
  let countPop = 0;
  let countTint = 0;      // >0 파랑, <0 빨강
  let lastN = -1;
  let time = 0;

  /* 병사 대형(그릴 위치) */
  const vis = { n: 0, x: new Float32Array(200), z: new Float32Array(200), born: new Float32Array(200) };

  const byDepth = (a, b) => b.z - a.z;
  /* 그리기 순서 정렬용 목록(재사용) */
  const items = [];
  for (let i = 0; i < 900; i++) items.push({ z: 0, k: 0, o: null, i: 0, x: 0 });
  let nItems = 0;
  const order = [];

  function push(z, k, o, i = 0, x = 0) {
    if (nItems >= items.length) return;
    const it = items[nItems++];
    it.z = z; it.k = k; it.o = o; it.i = i; it.x = x;
  }

  function resize(w, h, ratio) {
    dpr = Math.min(ratio || 1, quality === 'low' ? 1.25 : 2);
    cvs.width = Math.round(w * dpr);
    cvs.height = Math.round(h * dpr);
    cvs.style.width = w + 'px';
    cvs.style.height = h + 'px';
    fitView(view, w, h, ROAD, dolly);
  }

  function setQuality(q) { quality = q; soldierCap = q === 'low' ? 70 : 150; }
  function setShake(on) { shakeOn = on; if (!on) trauma = 0; }
  function setPreview(on) { preview = on; }

  function reset() {
    for (const p of parts) p.on = false;
    for (const f of floats) f.on = false;
    trauma = 0; flash = 0; dolly = 0; camX = 0; vis.n = 0; lastN = -1; countTint = 0; countPop = 0;
  }

  /* ---------- 이펙트 ---------- */
  function part(x, y, z, vx, vy, vz, life, size, color, grav = 9) {
    for (const p of parts) {
      if (p.on) continue;
      p.on = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.size = size; p.color = color; p.grav = grav;
      return;
    }
  }
  function burst(x, y, z, n, color, speed = 3, size = 0.12, life = 0.6, up = 3) {
    const lim = quality === 'low' ? Math.ceil(n / 2) : n;
    for (let i = 0; i < lim; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      part(x, y, z, Math.cos(a) * sp, up * (0.5 + Math.random()), Math.sin(a) * sp, life * (0.7 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), color);
    }
  }
  function float(x, y, z, text, color, size = 26, life = 0.95) {
    let slot = floats[0];
    for (const f of floats) { if (!f.on) { slot = f; break; } if (f.life < slot.life) slot = f; }
    slot.on = true; slot.x = x; slot.y = y; slot.z = z; slot.text = text; slot.color = color; slot.life = life; slot.max = life; slot.size = size;
  }
  function shake(a) { if (shakeOn) trauma = Math.min(1, trauma + a); }

  /* 시뮬레이션 이벤트 → 이펙트 */
  function events(s, ev) {
    const q = s.squad;
    for (const e of ev) {
      switch (e.t) {
        case 'gate': {
          const good = e.after >= e.before;
          const txt = e.op === 'add' ? (e.v >= 0 ? '+' : '−') + Math.abs(e.v) : e.op === 'mul' ? '×' + e.v : '÷' + e.v;
          float(q.x, 2.8, e.z + 1, txt, good ? '#8FD0FF' : '#FF8A6B', 40, 1.1);
          burst(e.x, 1.4, e.z, 18, good ? '#7DBBFF' : '#FF7B5C', 4, 0.16, 0.7, 4);
          countPop = 1;
          if (!good) { flash = 0.25; flashColor = '255,80,60'; shake(0.25); }
          break;
        }
        case 'gain':
          countTint = 1;
          if (e.why === 'crate') float(e.x, 2.2, e.z, '+' + e.n, '#8FD0FF', 30);
          break;
        case 'loss':
          countTint = -1;
          if (e.n >= 2 || e.cause === 'gate') float(e.x, 2, e.z, '−' + e.n, '#FF8A6B', e.n >= 10 ? 30 : 22, 0.8);
          if (e.n >= Math.max(5, q.n * 0.08)) shake(0.18);
          break;
        case 'kill': {
          const big = e.kind === 'brute';
          burst(e.x, big ? 1.4 : 0.8, e.z, big ? 26 : 9, '#7FCB4F', big ? 4 : 2.6, big ? 0.2 : 0.12, 0.55, 3);
          if (big) shake(0.2);
          break;
        }
        case 'bite':
          burst(e.x, 0.7, e.z, 6, '#E5484D', 2.2, 0.1, 0.45, 2.5);
          break;
        case 'wallBreak':
          burst(e.x, 0.9, e.z, 30, '#A8AEB5', 5, 0.2, 0.8, 5);
          burst(e.x, 0.9, e.z, 10, C.hazard, 4, 0.16, 0.7, 4);
          shake(0.3);
          break;
        case 'wallCrash':
          burst(e.x, 0.9, e.z, 24, '#A8AEB5', 4, 0.2, 0.8, 4);
          burst(q.x, 0.8, q.z, 14, '#E5484D', 3, 0.14, 0.6, 3);
          flash = 0.3; flashColor = '255,80,60';
          shake(0.45);
          break;
        case 'crate': {
          burst(e.x, 1, e.z, 26, '#C99257', 5, 0.18, 0.8, 5);
          const label = e.type === 'gun' ? '무기 강화!' : e.type === 'men' ? '지원병!' : '+' + e.v + ' 코인';
          float(e.x, 2.6, e.z, label, e.type === 'coin' ? '#FFD45A' : '#FFE38A', 28, 1.2);
          if (e.type === 'gun') { flash = 0.2; flashColor = '255,220,120'; }
          break;
        }
        case 'crateMiss':
          burst(e.x, 0.8, e.z, 12, '#A8743E', 3, 0.15, 0.6, 3);
          break;
        case 'spitHit':
          burst(e.x, 0.3, e.z, 16, '#B9F25B', 3.5, 0.16, 0.6, 3);
          if (e.hit) { flash = 0.2; flashColor = '170,255,90'; shake(0.25); }
          break;
        case 'slam':
          burst((e.x0 + e.x1) / 2, 0.3, q.z + 2, 40, '#C9A170', 7, 0.22, 0.9, 5);
          shake(0.6);
          if (e.hit) { flash = 0.35; flashColor = '255,60,40'; }
          break;
        case 'stomp':
          shake(0.35);
          burst(q.x, 0.4, q.z + 1, 14, '#E5484D', 4, 0.14, 0.6, 4);
          break;
        case 'boss':
          shake(0.4);
          break;
        case 'bossDead':
          burst(e.x, 3, e.z, 80, '#7FCB4F', 8, 0.3, 1.4, 7);
          burst(e.x, 3, e.z, 40, '#FFB020', 6, 0.22, 1.2, 6);
          flash = 0.6; flashColor = '255,255,255';
          shake(1);
          break;
        case 'win':
          for (let i = 0; i < 70; i++) {
            const col = ['#FFD45A', '#7FC4FF', '#FF7AD9', '#9BE15D'][i % 4];
            part(q.x + (Math.random() - 0.5) * 8, 5 + Math.random() * 3, q.z + 6 + Math.random() * 8, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 2, 2.2, 0.16, col, 2.5);
          }
          break;
        case 'lose':
          flash = 0.5; flashColor = '200,30,30';
          shake(0.5);
          break;
        default:
      }
    }
  }

  /* ---------- 그리기 도우미 ---------- */
  function quad(ax, ay, bx, by, cx, cy, dx, dy) {
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy);
    ctx.closePath();
  }
  /* 땅 위 사각형(x0..x1, z0..z1) */
  function groundRect(x0, x1, z0, z1, y = 0) {
    if (!project(view, x0, y, z0)) return false;
    const ax = P.x, ay = P.y;
    project(view, x1, y, z0); const bx = P.x, by = P.y;
    if (!project(view, x1, y, z1)) return false;
    const cx = P.x, cy = P.y;
    project(view, x0, y, z1);
    quad(ax, ay, bx, by, cx, cy, P.x, P.y);
    return true;
  }
  /* 세로 판(같은 z, x0..x1, y0..y1) → 화면 사다리꼴 */
  const face = { ax: 0, ay: 0, bx: 0, by: 0, cx: 0, cy: 0, dx: 0, dy: 0, s: 0 };
  function vface(x0, x1, y0, y1, z) {
    if (!project(view, x0, y0, z)) return false;
    face.ax = P.x; face.ay = P.y; face.s = P.s;
    project(view, x1, y0, z); face.bx = P.x; face.by = P.y;
    project(view, x1, y1, z); face.cx = P.x; face.cy = P.y;
    project(view, x0, y1, z); face.dx = P.x; face.dy = P.y;
    return true;
  }
  function fade(d) { return d > 85 ? Math.max(0, 1 - (d - 85) / 25) : 1; }

  function label(text, x, y, size, fill, stroke = C.outline, lw) {
    ctx.font = `${size}px ${FONT}`;
    ctx.lineWidth = lw ?? Math.max(3, size * 0.16);
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  /* 게이트 숫자: 기호(+ − × ÷)는 굵은 시스템 글꼴로 크게, 숫자는 제목 글꼴로 */
  function opLabel(c, x, y, size) {
    const sign = c.op === 'add' ? (c.v >= 0 ? '+' : '−') : c.op === 'mul' ? '×' : '÷';
    const num = String(Math.abs(c.v));
    const sf = `800 ${Math.round(size * 0.95)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.font = sf;
    const sw = ctx.measureText(sign).width;
    ctx.font = `${size}px ${FONT}`;
    const nw = ctx.measureText(num).width;
    const gap = size * 0.06;
    const left = x - (sw + gap + nw) / 2;
    ctx.textAlign = 'left';
    ctx.font = sf;
    ctx.lineWidth = Math.max(3, size * 0.16);
    ctx.strokeStyle = C.outline;
    ctx.strokeText(sign, left, y);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(sign, left, y);
    ctx.font = `${size}px ${FONT}`;
    ctx.strokeText(num, left + sw + gap, y + size * 0.03);
    ctx.fillText(num, left + sw + gap, y + size * 0.03);
    ctx.textAlign = 'center';
  }

  function sprite(sp, x, z, height, alpha = 1, flip = false) {
    if (!project(view, x, 0, z)) return;
    const k = (P.s * height) / sp.unit;
    const w = sp.w * k;
    const h = sp.h * k;
    if (alpha < 1) ctx.globalAlpha = alpha;
    if (flip) {
      ctx.save();
      ctx.translate(P.x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(sp.c, -w / 2, P.y - h, w, h);
      ctx.restore();
    } else ctx.drawImage(sp.c, P.x - w / 2, P.y - h, w, h);
    if (alpha < 1) ctx.globalAlpha = 1;
  }

  function shadow(x, z, rx) {
    if (!project(view, x, 0, z)) return;
    const sx = P.x, sy = P.y, s = P.s;
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx * s, rx * s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- 배경 ---------- */
  function drawSky(w, h) {
    const hz = view.horizon;
    const g = ctx.createLinearGradient(0, Math.min(0, hz - h * 0.4), 0, hz + 2);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(0.6, C.skyMid);
    g.addColorStop(1, C.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, Math.max(0, hz + 2));
    if (hz > 4) {
      // 먼 산(카메라 x에 따라 살짝 밀린다)
      const off = -camX * 6;
      ctx.fillStyle = C.hills2;
      ctx.beginPath();
      ctx.moveTo(0, hz + 1);
      for (let x = -40; x <= w + 40; x += 40) {
        const t = (x + off) * 0.013;
        ctx.lineTo(x + (off % 40), hz - 14 - Math.abs(Math.sin(t) * 22 + Math.sin(t * 2.7) * 9));
      }
      ctx.lineTo(w, hz + 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.hills;
      ctx.beginPath();
      ctx.moveTo(0, hz + 1);
      for (let x = -30; x <= w + 30; x += 30) {
        const t = (x + off * 1.6) * 0.021 + 4;
        ctx.lineTo(x, hz - 4 - Math.abs(Math.sin(t) * 12 + Math.sin(t * 3.1) * 5));
      }
      ctx.lineTo(w, hz + 1);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGround(w, h, camZ) {
    const hz = Math.max(0, view.horizon);
    const g = ctx.createLinearGradient(0, hz, 0, h);
    g.addColorStop(0, '#D8B07C');
    g.addColorStop(1, C.sandDark);
    ctx.fillStyle = g;
    ctx.fillRect(0, hz, w, h - hz);
    const z0 = camZ + 3;
    // 도로(지평선 가까이까지)
    ctx.fillStyle = C.road;
    if (groundRect(-ROAD, ROAD, z0, camZ + 1500)) ctx.fill();
    ctx.fillStyle = '#C9877A';
    if (groundRect(-ROAD - 0.45, -ROAD, camZ + 94, camZ + 1500)) ctx.fill();
    if (groundRect(ROAD, ROAD + 0.45, camZ + 94, camZ + 1500)) ctx.fill();
    // 속도감 띠(2u 간격)
    ctx.fillStyle = C.road2;
    const band = 4;
    let bz = Math.floor(z0 / band) * band;
    for (; bz < camZ + 90; bz += band) {
      if (groundRect(-ROAD, ROAD, Math.max(z0, bz), bz + band / 2)) ctx.fill();
    }
    // 연석
    const cb = 2;
    bz = Math.floor(z0 / cb) * cb;
    for (let i = 0; bz < camZ + 95; bz += cb, i++) {
      const col = Math.floor(bz / cb) % 2 === 0 ? C.curbA : C.curbB;
      ctx.fillStyle = col;
      if (groundRect(-ROAD - 0.45, -ROAD, Math.max(z0, bz), bz + cb)) ctx.fill();
      if (groundRect(ROAD, ROAD + 0.45, Math.max(z0, bz), bz + cb)) ctx.fill();
    }
    // 가운데 점선
    ctx.fillStyle = C.line;
    bz = Math.floor(z0 / 7) * 7;
    for (; bz < camZ + 90; bz += 7) {
      if (groundRect(-0.09, 0.09, Math.max(z0, bz), bz + 3)) ctx.fill();
    }
  }

  /* 길가 소품: 바위·마른 나무·폐차·드럼통 */
  function scenery(camZ) {
    const step = 9;
    let z = Math.floor((camZ + 4) / step) * step;
    for (; z < camZ + 100; z += step) {
      for (const side of [-1, 1]) {
        const h = hashInt(z * 7 + (side > 0 ? 3 : 11));
        const kind = h % 6;
        const x = side * (6.3 + ((h >> 3) % 30) / 10);
        const zz = z + ((h >> 8) % 50) / 10;
        push(zz, 9, null, kind, x);
      }
    }
  }
  function hashInt(n) {
    let h = (n | 0) * 2654435761;
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519);
    h ^= h >>> 13;
    return h >>> 0;
  }
  function drawProp(kind, x, z) {
    if (!project(view, x, 0, z)) return;
    const sx = P.x, sy = P.y, s = P.s;
    const a = fade(P.d);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    switch (kind) {
      case 0: // 바위
        ctx.fillStyle = '#8A7560';
        ctx.beginPath();
        ctx.ellipse(sx, sy - 0.35 * s, 0.9 * s, 0.5 * s, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#A68E74';
        ctx.beginPath();
        ctx.ellipse(sx - 0.2 * s, sy - 0.5 * s, 0.4 * s, 0.22 * s, 0, Math.PI, 0);
        ctx.fill();
        break;
      case 1: // 마른 나무
        ctx.strokeStyle = '#4B382C';
        ctx.lineWidth = Math.max(1, 0.18 * s);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy - 2.6 * s);
        ctx.moveTo(sx, sy - 1.4 * s);
        ctx.lineTo(sx - 0.8 * s, sy - 2.2 * s);
        ctx.moveTo(sx, sy - 1.9 * s);
        ctx.lineTo(sx + 0.7 * s, sy - 2.7 * s);
        ctx.stroke();
        break;
      case 2: { // 폐차
        ctx.fillStyle = '#6B3B2E';
        ctx.fillRect(sx - 1.2 * s, sy - 0.8 * s, 2.4 * s, 0.6 * s);
        ctx.fillStyle = '#7E4A39';
        ctx.fillRect(sx - 0.7 * s, sy - 1.25 * s, 1.4 * s, 0.5 * s);
        ctx.fillStyle = '#26303B';
        ctx.fillRect(sx - 0.55 * s, sy - 1.15 * s, 1.1 * s, 0.3 * s);
        ctx.fillStyle = '#1C1C1F';
        ctx.beginPath(); ctx.arc(sx - 0.7 * s, sy - 0.2 * s, 0.25 * s, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sx + 0.7 * s, sy - 0.2 * s, 0.25 * s, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 3: // 드럼통
        ctx.fillStyle = '#9C3D2E';
        ctx.fillRect(sx - 0.35 * s, sy - 1 * s, 0.7 * s, 1 * s);
        ctx.fillStyle = '#C25A43';
        ctx.fillRect(sx - 0.35 * s, sy - 0.75 * s, 0.7 * s, 0.1 * s);
        ctx.fillRect(sx - 0.35 * s, sy - 0.4 * s, 0.7 * s, 0.1 * s);
        break;
      case 4: // 표지판
        ctx.fillStyle = '#3B3F46';
        ctx.fillRect(sx - 0.06 * s, sy - 2 * s, 0.12 * s, 2 * s);
        ctx.fillStyle = '#E8B53A';
        ctx.beginPath();
        ctx.moveTo(sx, sy - 2.6 * s); ctx.lineTo(sx + 0.5 * s, sy - 2 * s); ctx.lineTo(sx, sy - 1.4 * s); ctx.lineTo(sx - 0.5 * s, sy - 2 * s);
        ctx.closePath();
        ctx.fill();
        break;
      default: // 선인장
        ctx.fillStyle = '#5E8A4A';
        ctx.fillRect(sx - 0.15 * s, sy - 1.8 * s, 0.3 * s, 1.8 * s);
        ctx.fillRect(sx - 0.6 * s, sy - 1.3 * s, 0.25 * s, 0.6 * s);
        ctx.fillRect(sx - 0.6 * s, sy - 0.95 * s, 0.5 * s, 0.22 * s);
        ctx.fillRect(sx + 0.35 * s, sy - 1.55 * s, 0.25 * s, 0.6 * s);
        ctx.fillRect(sx + 0.1 * s, sy - 1.2 * s, 0.5 * s, 0.22 * s);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 개체 ---------- */
  function drawRow(s, row) {
    const q = s.squad;
    const dz = row.z - q.z;
    const near = dz < 20 && dz > 0;
    const idx = pickCell(row, q.x);
    const H = 2.7;
    // 기둥
    const posts = [row.cells[0].x0];
    for (const c of row.cells) posts.push(c.x1);
    for (const px of posts) {
      if (!vface(px - 0.17, px + 0.17, 0, H + 0.3, row.z)) return;
      quad(face.ax, face.ay, face.bx, face.by, face.cx, face.cy, face.dx, face.dy);
      ctx.fillStyle = '#2C3440';
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    const a = fade(dz + view.back);
    ctx.globalAlpha = a;
    row.cells.forEach((c, i) => {
      const gd = cellGood(c);
      const rgb = gd > 0 ? C.good : gd < 0 ? C.bad : C.zero;
      const sel = near && i === idx;
      const dim = near && i !== idx;
      if (!vface(c.x0 + 0.18, c.x1 - 0.18, 0.15, H, row.z)) return;
      quad(face.ax, face.ay, face.bx, face.by, face.cx, face.cy, face.dx, face.dy);
      const hit = s.t - c.hitT < 0.08;
      ctx.fillStyle = `rgba(${rgb},${hit ? 0.7 : sel ? 0.62 : dim ? 0.26 : 0.44})`;
      ctx.fill();
      // 나쁜 칸은 빗금(색만으로 구분하지 않게)
      if (gd < 0) {
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,.16)';
        ctx.lineWidth = Math.max(1.5, face.s * 0.12);
        const w = face.bx - face.ax;
        const top = Math.min(face.cy, face.dy);
        const hh = face.ay - top;
        ctx.beginPath();
        for (let xx = -hh; xx < w; xx += Math.max(8, face.s * 0.55)) {
          ctx.moveTo(face.ax + xx, face.ay);
          ctx.lineTo(face.ax + xx + hh, top);
        }
        ctx.stroke();
        ctx.restore();
      }
      quad(face.ax, face.ay, face.bx, face.by, face.cx, face.cy, face.dx, face.dy);
      ctx.lineWidth = sel ? 4 + Math.sin(time * 14) * 1.2 : 2.5;
      ctx.strokeStyle = hit ? '#FFFFFF' : `rgba(${rgb},1)`;
      ctx.stroke();
      // 숫자
      const mx = (face.ax + face.bx) / 2;
      const my = (face.ay + face.dy) / 2;
      const size = Math.round(Math.min(64, Math.max(15, face.s * 1.15)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const icon = gd > 0 ? '▲' : gd < 0 ? '▼' : '';
      opLabel(c, mx, my, size);
      if (icon && size >= 18) label(icon, mx, my - size * 0.85, Math.round(size * 0.42), gd > 0 ? '#BFE2FF' : '#FFC2B3', C.outline, 2);
      if (preview && c.op && dz < 40) {
        const r = Math.max(0, applyOp(q.n, c.op, c.v));
        label('→ ' + r, mx, my + size * 0.8, Math.round(Math.max(12, size * 0.42)), '#FFFFFF', C.outline, 3);
      }
    });
    // 윗 띠
    if (vface(row.cells[0].x0 - 0.17, row.cells[row.cells.length - 1].x1 + 0.17, H, H + 0.3, row.z)) {
      quad(face.ax, face.ay, face.bx, face.by, face.cx, face.cy, face.dx, face.dy);
      ctx.fillStyle = '#39424F';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBox(p, s) {
    const isCrate = p.kind === 'crate';
    const H = isCrate ? 1.7 : 1.45;
    const z0 = p.z - 0.35;
    const z1 = p.z + 0.35;
    const hit = s.t - p.hitT < 0.06;
    // 윗면
    if (!project(view, p.x0, H, z0)) return;
    const ax = P.x, ay = P.y;
    project(view, p.x1, H, z0); const bx = P.x, by = P.y;
    project(view, p.x1, H, z1); const cx = P.x, cy = P.y;
    project(view, p.x0, H, z1); const dx = P.x, dy = P.y;
    quad(ax, ay, bx, by, cx, cy, dx, dy);
    ctx.fillStyle = isCrate ? C.crateTop : C.wallTop;
    ctx.fill();
    // 앞면
    if (!vface(p.x0, p.x1, 0, H, z0)) return;
    quad(face.ax, face.ay, face.bx, face.by, face.cx, face.cy, face.dx, face.dy);
    ctx.fillStyle = hit ? '#FFFFFF' : isCrate ? C.crate : C.wall;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.outline;
    ctx.stroke();
    const w = face.bx - face.ax;
    const h = face.ay - face.dy;
    const fs = face.s;
    if (!hit) {
      ctx.save();
      quad(face.ax, face.ay, face.bx, face.by, face.cx, face.cy, face.dx, face.dy);
      ctx.clip();
      if (isCrate) {
        ctx.strokeStyle = 'rgba(60,35,15,.55)';
        ctx.lineWidth = Math.max(1, fs * 0.06);
        ctx.beginPath();
        for (let i = 1; i < 4; i++) { ctx.moveTo(face.ax, face.ay - (h * i) / 4); ctx.lineTo(face.bx, face.by - (h * i) / 4); }
        ctx.moveTo(face.ax, face.ay); ctx.lineTo(face.cx, face.cy);
        ctx.stroke();
      } else {
        // 노랑·검정 경고 띠
        const by0 = face.ay - h * 0.62;
        const bh = h * 0.22;
        ctx.fillStyle = C.hazard;
        ctx.fillRect(face.ax, by0 - bh, w, bh);
        ctx.fillStyle = '#1E1E22';
        ctx.beginPath();
        const st = Math.max(6, fs * 0.5);
        for (let x = face.ax - bh; x < face.bx; x += st * 2) {
          ctx.moveTo(x, by0); ctx.lineTo(x + st, by0); ctx.lineTo(x + st + bh, by0 - bh); ctx.lineTo(x + bh, by0 - bh);
        }
        ctx.fill();
        // 금
        const dmg = 1 - p.hp / p.max;
        if (dmg > 0.35) {
          ctx.strokeStyle = 'rgba(30,30,34,.7)';
          ctx.lineWidth = Math.max(1, fs * 0.05);
          ctx.beginPath();
          ctx.moveTo(face.ax + w * 0.3, face.ay);
          ctx.lineTo(face.ax + w * 0.38, face.ay - h * 0.5);
          ctx.lineTo(face.ax + w * 0.3, face.ay - h);
          if (dmg > 0.65) { ctx.moveTo(face.ax + w * 0.72, face.ay); ctx.lineTo(face.ax + w * 0.64, face.ay - h * 0.6); ctx.lineTo(face.ax + w * 0.75, face.ay - h); }
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    const mx = (face.ax + face.bx) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = Math.round(Math.min(46, Math.max(13, fs * 0.85)));
    if (isCrate) {
      crateIcon(p.reward.type, mx, face.ay - h * 0.5, Math.min(w, h) * 0.32);
      label(String(Math.ceil(p.hp)), mx, face.dy - size * 0.75, size, '#FFE38A');
    } else {
      label(String(Math.ceil(p.hp)), mx, face.ay - h * 0.3, size, '#FFFFFF');
    }
  }

  /* 상자 보상 그림: 총 / 병사 / 동전 */
  function crateIcon(type, x, y, r) {
    if (r < 3) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.strokeStyle = C.outline;
    ctx.fillStyle = 'rgba(20,14,8,.35)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
    ctx.fill();
    if (type === 'gun') {
      ctx.fillStyle = '#FFB347';
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.35); ctx.lineTo(r, -r * 0.35); ctx.lineTo(r, r * 0.05); ctx.lineTo(-r * 0.15, r * 0.05);
      ctx.lineTo(-r * 0.35, r * 0.75); ctx.lineTo(-r * 0.8, r * 0.75); ctx.lineTo(-r * 0.6, r * 0.05); ctx.lineTo(-r, r * 0.05);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (type === 'men') {
      ctx.fillStyle = '#7FC4FF';
      for (const dx of [-0.45, 0.45]) {
        ctx.beginPath(); ctx.arc(dx * r, -r * 0.35, r * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo((dx - 0.4) * r, r * 0.8); ctx.quadraticCurveTo(dx * r, -r * 0.15, (dx + 0.4) * r, r * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#FFD45A';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#C98A12';
      ctx.fillRect(-r * 0.12, -r * 0.4, r * 0.24, r * 0.8);
    }
    ctx.restore();
  }

  function drawSaw(w, s) {
    // 레일
    ctx.strokeStyle = 'rgba(30,30,36,.75)';
    ctx.lineWidth = 3;
    if (project(view, w.xa - 0.5, 0.02, w.z)) {
      const ax = P.x, ay = P.y;
      project(view, w.xb + 0.5, 0.02, w.z);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(P.x, P.y); ctx.stroke();
    }
    if (!project(view, w.x, 0.8, w.z)) return;
    const cx = P.x, cy = P.y, r = 0.8 * P.s;
    const rot = s.t * 14;
    ctx.fillStyle = '#C7CED6';
    ctx.beginPath();
    const teeth = 14;
    for (let i = 0; i < teeth * 2; i++) {
      const a = rot + (i * Math.PI) / teeth;
      const rr = i % 2 ? r : r * 0.8;
      if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.outline;
    ctx.stroke();
    ctx.fillStyle = '#D9483B';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.stroke();
    // 받침
    ctx.fillStyle = '#3B3F46';
    ctx.fillRect(cx - r * 0.12, cy, r * 0.24, r * 0.95);
  }

  function drawFoe(f, s) {
    const set = spr[f.kind];
    const moving = f.kind !== 'spit' && f.awake;
    const fr = moving ? Math.floor(s.t * (f.kind === 'runner' ? 12 : 6) + f.seed) & 3 : Math.floor(s.t * 3 + f.seed) & 1 ? 1 : 0;
    const height = f.kind === 'brute' ? 2.1 : f.kind === 'spit' ? 1.25 : f.kind === 'runner' ? 1.0 : 1.05;
    if (!project(view, f.x, 0, f.z)) return;
    const a = fade(P.d);
    shadow(f.x, f.z, f.r * 1.1);
    sprite(set[fr], f.x, f.z, height, a);
    if (s.t - f.hitT < 0.07) sprite(spr.white[f.kind], f.x, f.z, height, 0.75 * a);
    if ((f.kind === 'brute' || f.kind === 'spit') && f.hp < f.max) {
      project(view, f.x, height + 0.25, f.z);
      const bw = Math.max(18, P.s * 1.2);
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(P.x - bw / 2, P.y, bw, 4);
      ctx.fillStyle = '#E5484D';
      ctx.fillRect(P.x - bw / 2, P.y, (bw * Math.max(0, f.hp)) / f.max, 4);
    }
  }

  function drawBoss(b, s) {
    const fr = b.clash ? (Math.floor(s.t * 8) & 3) : Math.floor(s.t * 3.5) & 3;
    shadow(b.x, b.z, 2.6);
    const H = 6.4;
    sprite(spr.boss[fr], b.x, b.z, H);
    if (s.t - b.hitT < 0.05) sprite(spr.white.boss, b.x, b.z, H, 0.35);
    if (b.enraged) sprite(spr.white.boss, b.x, b.z, H, 0.12 + 0.1 * Math.sin(time * 12));
  }

  function drawSquadMember(i, s, R) {
    const q = s.squad;
    const x = vis.x[i];
    const z = vis.z[i];
    const moving = q.vz > 0.5;
    const fr = moving ? (Math.floor(time * 9 + i * 0.37) & 3) : 0;
    const born = Math.min(1, (time - vis.born[i]) * 5);
    const hurt = time - hurtAt < 0.12 && i % 3 === 0;
    const sp = hurt ? spr.soldierHurt[0] : spr.soldier[fr];
    const h = 1.0 * (0.4 + 0.6 * born);
    sprite(sp, x, z, h);
  }
  let hurtAt = -9;

  /* 대형 갱신 — 그릴 병사 수가 줄면 가장자리부터 사라지며 빨간 조각을 남긴다 */
  function updateFormation(s, dt) {
    const q = s.squad;
    const R = radius(q.n);
    const D = Math.min(q.n, soldierCap);
    const c = (R - 0.22) / Math.sqrt(Math.max(1, D));
    if (D < vis.n) {
      for (let i = D; i < vis.n; i++) burst(vis.x[i], 0.6, vis.z[i], 3, '#E5484D', 2, 0.1, 0.45, 2.5);
    }
    for (let i = vis.n; i < D; i++) {
      vis.x[i] = q.x + (Math.random() - 0.5) * 0.6;
      vis.z[i] = q.z + 0.6;
      vis.born[i] = time;
    }
    vis.n = D;
    const k = Math.min(1, dt * 12);
    for (let i = 0; i < D; i++) {
      const r = c * Math.sqrt(i + 0.5);
      const th = i * 2.39996323;
      const tx = q.x + r * Math.cos(th);
      const tz = q.z + r * Math.sin(th) * 0.8;
      vis.x[i] += (tx - vis.x[i]) * k;
      vis.z[i] = tz + (vis.z[i] - tz) * (1 - k);
    }
  }

  function drawBullets(s, alpha) {
    const list = s.bullets;
    if (!list.length) return;
    const tier = s.squad.tier;
    const ext = BULLET_SPEED * DT * alpha;
    ctx.lineCap = 'round';
    for (let pass = 0; pass < (quality === 'low' ? 1 : 2); pass++) {
      ctx.beginPath();
      for (const b of list) {
        if (!project(view, b.x, 0.75, b.z + ext)) continue;
        const hx = P.x, hy = P.y;
        if (!project(view, b.x, 0.75, b.z + ext - 1.3)) continue;
        ctx.moveTo(P.x, P.y);
        ctx.lineTo(hx, hy);
      }
      if (pass === 0 && quality !== 'low') {
        ctx.strokeStyle = C.bullet[tier];
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 6 + tier * 1.5;
      } else {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = pass === 1 || quality === 'low' ? '#FFFBEA' : C.bullet[tier];
        ctx.lineWidth = 2 + tier * 0.6;
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawDecals(s) {
    const q = s.squad;
    const R = radius(q.n);
    // 조준 띠
    ctx.fillStyle = 'rgba(255,248,220,.07)';
    if (groundRect(q.x - R - 0.3, q.x + R + 0.3, q.z + R * 0.5, q.z + 30, 0.01)) ctx.fill();
    // 분대 그림자
    if (project(view, q.x, 0, q.z)) {
      ctx.fillStyle = 'rgba(20,12,10,.22)';
      ctx.beginPath();
      ctx.ellipse(P.x, P.y, (R + 0.35) * P.s, (R + 0.35) * P.s * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 독침 예고
    for (const sp of s.spits) {
      if (!project(view, sp.x, 0.02, sp.z)) continue;
      const k = 1 - sp.t / sp.T;
      ctx.fillStyle = `rgba(150,230,60,${0.18 + 0.25 * k})`;
      ctx.strokeStyle = `rgba(190,255,90,${0.6 + 0.4 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(P.x, P.y, 1.2 * P.s, 1.2 * P.s * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(P.x, P.y, 1.2 * P.s * (1 - k), 1.2 * P.s * 0.42 * (1 - k), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 보스 내려찍기 예고
    const b = s.boss;
    if (b && b.slam) {
      const k = 1 - b.slam.t / b.slam.T;
      ctx.fillStyle = `rgba(230,40,30,${0.15 + 0.35 * k + 0.1 * Math.sin(time * 30)})`;
      if (groundRect(b.slam.x0 + 0.1, b.slam.x1 - 0.1, q.z - 3.5, b.z - 0.5, 0.02)) ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,70,.95)';
      ctx.lineWidth = 3;
      ctx.stroke();
      // 가득 차오르는 띠
      ctx.fillStyle = 'rgba(255,60,40,.35)';
      if (groundRect(b.slam.x0 + 0.1, b.slam.x1 - 0.1, q.z - 3.5, q.z - 3.5 + (b.z - q.z + 3) * k, 0.03)) ctx.fill();
    }
  }

  function drawSpitShots(s) {
    for (const sp of s.spits) {
      const u = 1 - sp.t / sp.T;
      const x = sp.sx + (sp.x - sp.sx) * u;
      const z = sp.sz + (sp.z - sp.sz) * u;
      const y = 1.2 * (1 - u) + 5 * u * (1 - u);
      if (!project(view, x, y, z)) continue;
      ctx.fillStyle = '#B9F25B';
      ctx.strokeStyle = '#3D6B1A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(P.x, P.y, Math.max(3, 0.32 * P.s), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawParts(dt) {
    for (const p of parts) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0) { p.y = 0; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      if (!project(view, p.x, p.y, p.z)) continue;
      const sz = Math.max(1.5, p.size * P.s);
      ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.4));
      ctx.fillStyle = p.color;
      ctx.fillRect(P.x - sz / 2, P.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats(dt) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of floats) {
      if (!f.on) continue;
      f.life -= dt;
      if (f.life <= 0) { f.on = false; continue; }
      f.y += dt * 1.6;
      if (!project(view, f.x, f.y, f.z)) continue;
      const k = 1 - f.life / f.max;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15));
      ctx.globalAlpha = Math.min(1, f.life / (f.max * 0.35));
      label(f.text, P.x, P.y, Math.round(f.size * pop), f.color);
    }
    ctx.globalAlpha = 1;
  }

  function drawCount(s, dt) {
    const q = s.squad;
    if (q.n !== lastN) {
      if (lastN >= 0 && q.n < lastN) hurtAt = time;
      lastN = q.n;
    }
    shownN += (q.n - shownN) * Math.min(1, dt * 9);
    if (Math.abs(q.n - shownN) < 0.5) shownN = q.n;
    countPop = Math.max(0, countPop - dt * 4);
    countTint *= Math.max(0, 1 - dt * 3);
    if (q.n <= 0) return;
    const R = radius(q.n);
    if (!project(view, q.x, 1.6 + R * 0.25, q.z + R * 0.2)) return;
    const n = Math.round(shownN);
    const text = n >= 9999 ? 'MAX' : String(n);
    const size = Math.round(30 * (1 + countPop * 0.3));
    ctx.font = `${size}px ${FONT}`;
    const tw = ctx.measureText(text).width;
    const pw = tw + 26;
    const ph = size + 8;
    const x = P.x, y = P.y - 14;
    const tint = countTint > 0.1 ? `rgba(47,140,255,${0.55 + 0.4 * countTint})` : countTint < -0.1 ? `rgba(229,72,77,${0.55 - 0.4 * countTint})` : 'rgba(18,26,38,.82)';
    ctx.fillStyle = tint;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - pw / 2, y - ph / 2, pw, ph, ph / 2);
    else ctx.rect(x - pw / 2, y - ph / 2, pw, ph);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, x, y + 1);
    // 무기 등급 점
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < q.tier ? C.bullet[Math.min(3, i + 1)] : 'rgba(255,255,255,.25)';
      ctx.beginPath();
      ctx.arc(x - 12 + i * 12, y + ph / 2 + 7, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------- 한 프레임 ---------- */
  function draw(s, alpha, dt, prevZ) {
    time += dt;
    const w = view.w, h = view.h;
    const q = s.squad;
    // 카메라
    const wantDolly = s.boss ? 1 : 0;
    if (Math.abs(wantDolly - dolly) > 0.001) {
      dolly += (wantDolly - dolly) * Math.min(1, dt * 1.6);
      fitView(view, w, h, ROAD, dolly);
    }
    camX += (q.x * 0.35 - camX) * Math.min(1, dt * 8);
    view.camX = camX;
    const z = prevZ + (q.z - prevZ) * alpha;
    view.camZ = z - view.back;
    // 흔들림
    trauma = Math.max(0, trauma - dt * 1.6);
    const t2 = trauma * trauma;
    view.shakeX = shakeOn ? (Math.random() * 2 - 1) * 10 * t2 : 0;
    view.shakeY = shakeOn ? (Math.random() * 2 - 1) * 10 * t2 : 0;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky(w, h);
    drawGround(w, h, view.camZ);
    drawDecals(s);

    // 정렬할 개체 모으기
    nItems = 0;
    scenery(view.camZ);
    const zMax = view.camZ + 115;
    for (const row of s.rows) if (!row.done && row.z < zMax) push(row.z, 1, row);
    for (const p of s.props) if (p.alive && p.z < zMax) push(p.z - 0.35, 2, p);
    for (const sw of s.saws) if (sw.z < zMax && sw.z > view.camZ + 2) push(sw.z, 3, sw);
    for (const f of s.foes) if (f.alive && f.z < zMax && f.z > view.camZ + 2) push(f.z, 4, f);
    if (s.boss && s.boss.hp > 0) push(s.boss.z, 5, s.boss);
    updateFormation(s, dt);
    if (q.n > 0) for (let i = 0; i < vis.n; i++) push(vis.z[i], 6, null, i);
    order.length = nItems;
    for (let i = 0; i < nItems; i++) order[i] = items[i];
    order.sort(byDepth);
    const R = radius(q.n);
    // 길가 소품은 먼저 그린다(가까운 나무가 게이트 숫자를 가리지 않게)
    for (const it of order) if (it.k === 9) drawProp(it.i, it.x, it.z);
    for (const it of order) {
      switch (it.k) {
        case 1: drawRow(s, it.o); break;
        case 2: drawBox(it.o, s); break;
        case 3: drawSaw(it.o, s); break;
        case 4: drawFoe(it.o, s); break;
        case 5: drawBoss(it.o, s); break;
        case 6: drawSquadMember(it.i, s, R); break;
        default:
      }
    }
    drawSpitShots(s);
    drawBullets(s, alpha);
    drawParts(dt);
    drawFloats(dt);
    drawCount(s, dt);

    // 화면 번쩍임·위험 테두리
    if (flash > 0) {
      ctx.fillStyle = `rgba(${flashColor},${Math.min(0.5, flash)})`;
      ctx.fillRect(0, 0, w, h);
      flash = Math.max(0, flash - dt * 1.8);
    }
    if (q.n > 0 && q.n < 8 && s.phase !== 'won') {
      const a = 0.25 + 0.2 * Math.sin(time * 7);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(200,20,20,0)');
      g.addColorStop(1, `rgba(200,20,20,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  return { view, resize, draw, events, reset, setQuality, setShake, setPreview, burst, float };
}
