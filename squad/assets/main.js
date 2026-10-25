/* 숫자부대 돌격 — 게임 루프, 조작, 화면 흐름 */
import {
  DT, START_N, EDGE, UNLOCK, prepareLevel, newGame, step, botInput, starsFor, starGoals, parFor, coinsFor, progress, radius,
} from './core.js';
import { createRenderer } from './render.js';
import { sfx, unlock, setSoundOn, suspend } from './audio.js';
import { load, save, wipe, UPGRADES, upgCost, totalStars } from './store.js';

const $ = (id) => document.getElementById(id);
const cvs = $('cv');
const renderer = createRenderer(cvs);
/* 조작 계산은 CSS 픽셀 기준(렌더러 버퍼 크기와 무관) */
const scr = () => renderer.screen || renderer.view;

let data = load();
let lv = null;          // 지금 레벨(보정 끝난 것)
let s = null;           // 시뮬레이션 상태
let mode = 'boot';      // boot title levels upg set card play pause result
let attract = false;    // 타이틀 뒤에서 봇이 플레이
let prevZ = 0;
let acc = 0;
let last = 0;
let slowUntil = 0;
let slowScale = 1;
let tutorial = false;   // 1레벨 첫 입력 전 느린 진행
let support = 0;        // 연패 지원 병력
let resultShown = false;
let frameTimes = [];
let autoLow = false;
let wake = null;

/* ---------- 조작 ---------- */
/* 좌우 누르기: 화면 왼쪽·오른쪽 절반을 누르고 있으면 그쪽으로 간다.
   끌기: 누른 쪽과 반대로 크게 밀거나(또는 가운데에서 시작해) 옆으로 끌면, 끄는 만큼 따라온다. */
const pointers = new Map();
let activeId = null;
const keys = { left: false, right: false };
let anyInput = false;
let blurred = false;

function restX() {
  // 지금 속도로 멈추면 설 자리(끌기로 바뀌는 순간 덜컥 서지 않게)
  if (!s) return 0;
  const q = s.squad;
  return Math.max(-EDGE, Math.min(EDGE, q.x + (Math.sign(q.vx) * q.vx * q.vx) / 200));
}

function onDown(e) {
  unlock();
  if (mode !== 'play' && mode !== 'card') return;
  if (e.target.closest && e.target.closest('button')) return;
  e.preventDefault();
  const w = scr().w;
  const dead = Math.abs(e.clientX - w / 2) < w * 0.06;
  pointers.set(e.pointerId, {
    x0: e.clientX, x: e.clientX, side: dead ? 0 : e.clientX < w / 2 ? -1 : 1, drag: false, sx0: restX(),
  });
  activeId = e.pointerId;
  try { cvs.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
  if (mode === 'play') markInput();
}
function onMove(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  if (p.drag) return;
  const dx = p.x - p.x0;
  // 누르고 있는 엄지가 조금 구르는 정도로는 끌기로 바뀌지 않는다(누른 쪽으로 미는 건 더 너그럽게)
  const w = scr().w;
  const limit = p.side === 0 ? 10 : Math.sign(dx) === p.side ? Math.max(40, w * 0.1) : Math.max(24, w * 0.06);
  if (Math.abs(dx) > limit) {
    p.drag = true;
    p.x0 = p.x;
    p.sx0 = restX();
  }
}
function onUp(e) {
  pointers.delete(e.pointerId);
  if (activeId === e.pointerId) {
    activeId = null;
    for (const id of pointers.keys()) activeId = id;   // 남아 있는 손가락 중 마지막
    const p = activeId != null ? pointers.get(activeId) : null;
    if (p) {
      // 남은 손가락은 지금 자리에서 다시 시작(예전 기준점으로 튀지 않게)
      p.x0 = p.x;
      p.sx0 = restX();
      const w = scr().w;
      if (!p.drag) p.side = Math.abs(p.x - w / 2) < w * 0.06 ? 0 : p.x < w / 2 ? -1 : 1;
    }
  }
}
function markInput() {
  if (!anyInput) {
    anyInput = true;
    if (tutorial) { tutorial = false; $('tut').hidden = true; }
  }
}

function currentInput() {
  let dir = 0;
  let tx = null;
  const p = activeId != null ? pointers.get(activeId) : null;
  if (p) {
    if (p.drag) {
      tx = p.sx0 + ((p.x - p.x0) * 10) / (0.8 * scr().col);
      // 길 끝을 넘겨 끌었으면 기준점을 옮겨, 되돌리는 순간 바로 반응하게
      if (Math.abs(tx) > EDGE) {
        tx = Math.sign(tx) * EDGE;
        p.sx0 = tx;
        p.x0 = p.x;
      }
    } else dir = p.side;
  }
  if (keys.left !== keys.right) { dir = keys.left ? -1 : 1; tx = null; }
  $('touchL').classList.toggle('on', (!!p && !p.drag && p.side < 0) || keys.left);
  $('touchR').classList.toggle('on', (!!p && !p.drag && p.side > 0) || keys.right);
  return { dir, tx };
}

cvs.addEventListener('pointerdown', onDown, { passive: false });
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);
cvs.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerdown', () => unlock(), { capture: true });

/* 한글 입력 상태에서도 되도록 글쇠 위치(code)로 본다 */
const LEFT = (e) => e.key === 'ArrowLeft' || e.code === 'KeyA';
const RIGHT = (e) => e.key === 'ArrowRight' || e.code === 'KeyD';
window.addEventListener('keydown', (e) => {
  unlock();
  if (LEFT(e)) { keys.left = true; if (mode === 'play') { markInput(); e.preventDefault(); } }
  else if (RIGHT(e)) { keys.right = true; if (mode === 'play') { markInput(); e.preventDefault(); } }
  else if (e.key === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play') pause();
    else if (mode === 'pause') resume();
  }
});
window.addEventListener('keyup', (e) => {
  if (LEFT(e)) keys.left = false;
  if (RIGHT(e)) keys.right = false;
});
window.addEventListener('blur', () => {
  blurred = true;
  keys.left = keys.right = false;
  pointers.clear();
  activeId = null;
  if (mode === 'play') pause();
});
window.addEventListener('focus', () => { blurred = false; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (mode === 'play') pause(); suspend(); }
  else if (mode === 'play' || mode === 'pause') requestWake();
});

/* ---------- 진동 ---------- */
let lastVibe = 0;
function vibe(p) {
  if (!data.set.vibe || !navigator.vibrate) return;
  const now = performance.now();
  if (now - lastVibe < 120) return;
  lastVibe = now;
  try { navigator.vibrate(p); } catch { /* 무시 */ }
}

/* ---------- 화면 전환 ---------- */
const SCREENS = ['scrTitle', 'scrLevels', 'scrUpg', 'scrSet', 'scrCard', 'scrPause', 'scrResult'];
function show(id) {
  for (const k of SCREENS) $(k).hidden = k !== id;
  $('hud').hidden = !(mode === 'play' || mode === 'pause' || mode === 'card' || mode === 'result');
  const touch = mode === 'play';
  $('touchL').hidden = !touch;
  $('touchR').hidden = !touch;
  if (!touch) $('tip').hidden = true;
  const focus = id && $(id).querySelector('[data-focus]');
  if (focus) setTimeout(() => focus.focus({ preventScroll: true }), 30);
}

function goTitle() {
  mode = 'title';
  tutorial = false;
  $('tut').hidden = true;
  tipQueue.length = 0;
  tipUntil = 0;
  releaseWake();
  renderTitle();
  show('scrTitle');
  startAttract();
}

const compact = (n) => {
  try { return n >= 10000 ? new Intl.NumberFormat('ko', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : String(n); } catch { return String(n); }
};
function renderTitle() {
  $('tPlayL').textContent = data.cur;
  $('tCoins').textContent = compact(data.coins);
  $('tStars').textContent = totalStars(data);
}

/* 타이틀 뒤에서는 봇이 지금 레벨을 대신 돈다 */
function startAttract() {
  attract = true;
  const L = data.cur;
  setTimeout(() => {
    if (mode !== 'title' && mode !== 'levels' && mode !== 'upg' && mode !== 'set') return;
    lv = prepareLevel(L);
    s = newGame(lv, { start: START_N + 2 * data.upg.start, fire: data.upg.fire });
    prevZ = s.squad.z;
    renderer.reset();
  }, 40);
}

/* ---------- 레벨 선택 ---------- */
function renderLevels() {
  const grid = $('levelGrid');
  grid.textContent = '';
  const top = Math.max(30, Math.ceil((data.maxL + 2) / 5) * 5);
  for (let L = 1; L <= top; L++) {
    const b = document.createElement('button');
    b.className = 'lv';
    const open = L <= data.maxL;
    b.disabled = !open;
    const st = data.stars[L] | 0;
    b.innerHTML = `<b>${L}</b><span class="st" aria-label="별 ${st}개">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>`;
    if (!open) b.setAttribute('aria-label', `레벨 ${L} 잠김`);
    if (L === data.cur) b.classList.add('cur');
    b.addEventListener('click', () => { sfx.click(); data.cur = L; save(data); startLevel(L); });
    grid.appendChild(b);
  }
}

/* ---------- 강화 ---------- */
function renderUpg() {
  $('uCoins').textContent = data.coins;
  const list = $('upgList');
  list.textContent = '';
  for (const u of UPGRADES) {
    const lvU = data.upg[u.id] | 0;
    const maxed = lvU >= u.max;
    const cost = upgCost(lvU);
    const card = document.createElement('div');
    card.className = 'upg';
    card.innerHTML = `
      <div class="upg-head"><b>${u.name}</b><span class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvU ? 'on' : ''}"></i>`).join('')}</span></div>
      <p class="upg-eff">${u.effect(lvU)}${maxed ? '' : ` → <em>${u.effect(lvU + 1)}</em>`}</p>`;
    const btn = document.createElement('button');
    btn.className = 'buy';
    btn.textContent = maxed ? '최대' : `${cost} 코인`;
    btn.disabled = maxed || data.coins < cost;
    btn.addEventListener('click', () => {
      if (data.coins < cost || maxed) { sfx.deny(); return; }
      data.coins -= cost;
      data.upg[u.id] = lvU + 1;
      save(data);
      sfx.buy();
      renderUpg();
      renderTitle();
    });
    card.appendChild(btn);
    list.appendChild(card);
  }
}

/* ---------- 설정 ---------- */
const SETTINGS = [
  { id: 'sound', name: '효과음' },
  { id: 'vibe', name: '진동' },
  { id: 'shake', name: '화면 흔들림' },
  { id: 'preview', name: '게이트 결과 미리보기', note: '게이트 아래에 지나가면 몇 명이 되는지 보여줘요' },
  { id: 'low', name: '저사양 모드', note: '병사를 덜 그리고 효과를 줄여요' },
];
function applySettings() {
  setSoundOn(data.set.sound);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setShake(data.set.shake && !reduce);
  renderer.setPreview(data.set.preview);
  renderer.setQuality(data.set.low || autoLow ? 'low' : 'high');
  resize();
}
function renderSet() {
  const list = $('setList');
  list.textContent = '';
  for (const it of SETTINGS) {
    if (it.id === 'vibe' && !('vibrate' in navigator)) continue;   // 아이폰에는 진동 기능이 없다
    const row = document.createElement('label');
    row.className = 'set-row';
    row.innerHTML = `<span><b>${it.name}</b>${it.note ? `<small>${it.note}</small>` : ''}</span>`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'set-' + it.id;
    input.className = 'switch';
    input.checked = !!data.set[it.id];
    input.addEventListener('change', () => {
      data.set[it.id] = input.checked;
      save(data);
      applySettings();
      sfx.click();
    });
    row.appendChild(input);
    list.appendChild(row);
  }
  $('resetAsk').hidden = false;
  $('resetConfirm').hidden = true;
}

/* ---------- 레벨 시작 ---------- */
const NEW_THING = {
  1: '화면 왼쪽·오른쪽을 눌러 큰 숫자 게이트로!',
  2: '새로 나와요: ×2 게이트, 쏴서 올리는 마이너스 게이트',
  3: '새로 나와요: 바리케이드, 보스의 졸개 소환',
  4: '새로 나와요: 보급 상자, 질주 좀비',
  5: '새로 나와요: 독침 좀비',
  6: '새로 나와요: 톱날',
  7: '새로 나와요: 거구 좀비',
  8: '새로 나와요: ÷2 게이트',
  10: '새로 나와요: 세 갈래 게이트, ×3',
};

let par = 0;            // 이번 판 별 기준(강화 반영)
let startToken = 0;     // 카드가 떠 있는 동안 다른 레벨을 누르면 앞의 예약은 버린다

function startLevel(L, opts = {}) {
  attract = false;
  mode = 'card';
  support = opts.support || 0;
  tutorial = false;
  $('tut').hidden = true;
  $('cardL').textContent = L;
  $('cardNew').textContent = NEW_THING[L] || (L % 5 === 0 ? '강한 보스가 기다려요' : '');
  $('cardGoal').textContent = '준비 중…';
  $('hudL').textContent = L;
  $('bossBar').hidden = true;
  $('bossBar').classList.remove('rage');
  $('hudBar').style.transform = 'scaleX(0)';
  hudCache = '';
  pointers.clear();
  activeId = null;
  show('scrCard');
  sfx.click();
  const token = ++startToken;
  const t0 = performance.now();
  setTimeout(() => {
    if (token !== startToken || mode !== 'card') return;
    lv = prepareLevel(L);
    const start = START_N + 2 * data.upg.start + support;
    par = parFor(lv, START_N + 2 * data.upg.start, data.upg.fire);
    // 카드 뒤에는 이번 레벨의 출발 장면을 미리 깔아 둔다
    s = newGame(lv, { start, fire: data.upg.fire });
    prevZ = s.squad.z;
    renderer.reset();
    const g = starGoals(par);
    $('cardGoal').textContent = support ? `지원 병력 +${support}명 (별 최대 1개)` : `★★★ 목표: 보스를 잡고 ${g.three}명 이상 남기기`;
    const wait = Math.max(0, 1300 - (performance.now() - t0));
    setTimeout(() => { if (token === startToken && mode === 'card') begin(L); }, wait);
  }, 30);
}

function begin(L) {
  acc = 0;
  mode = 'play';
  resultShown = false;
  anyInput = false;
  tutorial = L === 1 && !data.tips.moved;
  $('tut').hidden = !tutorial;
  slowUntil = 0;
  tipQueue.length = 0;
  tipUntil = 0;
  $('tip').hidden = true;
  show(null);
  // 카드가 떠 있을 때부터 누르고 있던 손가락은 그대로 이어서 쓴다
  if (pointers.size) {
    for (const id of pointers.keys()) activeId = id;
    markInput();
  }
  requestWake();
  data.plays++;
  save(data);
  // 카드가 떠 있는 동안 다른 앱으로 갔으면 멈춘 채로 시작
  if (blurred || document.hidden) pause();
}

function pause() {
  if (mode !== 'play') return;
  mode = 'pause';
  pointers.clear();
  activeId = null;
  keys.left = keys.right = false;
  show('scrPause');
}
function resume() {
  if (mode !== 'pause') return;
  mode = 'play';
  last = performance.now();
  show(null);
}

/* ---------- 안내 ---------- */
const tipQueue = [];
let tipUntil = 0;
function tip(key, text) {
  if (data.tips[key] || tipQueue.some((t) => t.key === key)) return;
  tipQueue.push({ key, text });
}
/* 안내는 플레이 중에만 넘기고, 실제로 보여 준 것만 '봤음'으로 저장한다 */
function updateTips(now) {
  const el = $('tip');
  if (mode !== 'play' || tutorial) { if (mode !== 'play') el.hidden = true; return; }
  if (now < tipUntil) return;
  if (!tipQueue.length) { el.hidden = true; return; }
  const t = tipQueue.shift();
  data.tips[t.key] = 1;
  save(data);
  el.textContent = t.text;
  el.classList.toggle('low', !!(s && s.boss));
  el.hidden = false;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  tipUntil = now + 3200;
}
function watchTips() {
  const q = s.squad;
  for (const row of s.rows) {
    if (row.done || row.z - q.z > 34) continue;
    tip('gate', '큰 숫자 게이트 쪽으로 가세요. 총알이 닿으면 숫자가 올라가요!');
    if (row.cells.some((c) => c.op === 'mul')) tip('mul', '×는 병력이 많을수록 유리해요');
    if (row.cells.some((c) => c.op === 'div')) tip('div', '÷2는 병력이 반으로 줄어요');
    if (row.cells.length === 1) tip('shoot', '길을 막은 마이너스 게이트! 쏴서 플러스로 바꾸세요');
  }
  for (const p of s.props) {
    if (!p.alive || p.z - q.z > 32) continue;
    if (p.kind === 'wall') tip('wall', '벽의 숫자는 체력이에요. 약한 벽을 쏴서 뚫고 지나가세요');
    else tip('crate', '상자를 쏴서 부수면 무기·병력 보상을 받아요');
  }
  for (const w of s.saws) if (w.z - q.z < 26 && w.z > q.z) tip('saw', '톱날이 움직이는 범위를 피하세요');
  for (const f of s.foes) if (f.alive && f.kind === 'brute' && f.z - q.z < 36) tip('brute', '거구 좀비는 단단해요. 옆으로 비켜 가세요');
}

/* ---------- 이벤트 → 소리·진동·안내 ---------- */
function handleEvents(ev) {
  if (!ev.length) return;
  renderer.events(s, ev);
  if (attract) return;
  for (const e of ev) {
    switch (e.t) {
      case 'shot': sfx.shot(); break;
      case 'tick': sfx.gateTick(); tip('pump', '게이트를 쏘면 숫자가 올라가요!'); break;
      case 'gate':
        if (e.after >= e.before) { sfx.gateGood(e.op === 'mul'); vibe(12); } else { sfx.gateBad(); vibe(35); }
        break;
      case 'kill': sfx.kill(); break;
      case 'bite': sfx.hurt(); break;
      case 'loss':
        if (e.cause === 'saw') sfx.blade();
        if (e.n >= 10) vibe(25);
        break;
      case 'wallBreak': sfx.crate(); break;
      case 'wallCrash': sfx.stomp(); vibe(40); break;
      case 'crate': if (e.type === 'gun') sfx.power(); else if (e.type === 'coin') sfx.coin(); else sfx.crate(); break;
      case 'spitFire': tip('spit', '땅에 초록 표시가 보이면 옆으로 피하세요'); break;
      case 'spitHit': if (e.hit) { sfx.hurt(); vibe(30); } break;
      case 'boss':
        sfx.bossIn();
        $('bossBar').hidden = false;
        tip('boss', '빨간 구역을 피하면서 보스를 쏘세요!');
        slow(0.45, 700);
        break;
      case 'slamWarn': sfx.gateTick(); break;
      case 'slam': sfx.stomp(); vibe(60); break;
      case 'stomp': sfx.stomp(); vibe(30); break;
      case 'enrage': $('bossBar').classList.add('rage'); break;
      case 'bossDead': sfx.win(); vibe([40, 60, 80]); slow(0.25, 1200); break;
      case 'lose': sfx.lose(); vibe([60, 40, 90]); break;
      default:
    }
  }
}

function slow(scale, ms) {
  slowScale = scale;
  slowUntil = performance.now() + ms;
}

/* ---------- 결과 ---------- */
const CAUSE = {
  gate: ['마이너스 게이트에서 병력이 모두 사라졌어요', '숫자가 낮은 게이트도 총알을 맞히면 올라가요'],
  foe: ['좀비 무리에 휩쓸렸어요', '무리가 적은 쪽으로 비켜 가거나, 멀리 있을 때부터 정면에서 쏘세요'],
  brute: ['거구 좀비에게 짓밟혔어요', '거구는 느려요. 옆으로 비켜 가세요'],
  wall: ['바리케이드에 부딪혀 전멸했어요', '숫자가 작은 벽을 골라 쏘면서 지나가세요'],
  saw: ['톱날에 휘말렸어요', '톱날이 움직이는 범위 밖으로 피하세요'],
  spit: ['독침에 당했어요', '초록 표시가 보이면 바로 옆으로 피하세요'],
  boss: ['보스를 막지 못했어요', '빨간 구역을 피하고 보스 정면에 서세요. 병력이 많을수록 빨리 잡혀요'],
  summon: ['보스가 부른 졸개에게 당했어요', '졸개가 다가오기 전에 쏘세요. 보스 쪽으로 오는 길목에 서 있으면 함께 맞아요'],
};

function finish() {
  if (resultShown) return;
  resultShown = true;
  mode = 'result';
  releaseWake();
  const won = s.phase === 'won';
  const L = lv.L;
  const n = s.squad.n;
  const stars = won ? (support ? 1 : starsFor(par, n, true)) : 0;
  const prevStars = data.stars[L] | 0;
  let coins = coinsFor(lv, s, won, stars, 10 * data.upg.coin);
  const newStars = Math.max(0, stars - prevStars);
  coins += newStars * 20;
  data.coins += coins;
  if (won) {
    data.stars[L] = Math.max(prevStars, stars);
    data.best[L] = Math.max(data.best[L] | 0, n);
    data.maxL = Math.max(data.maxL, L + 1);
    data.cur = Math.max(data.cur, L + 1);   // 지난 레벨을 다시 해도 '이어하기'는 앞으로만
    data.fails[L] = 0;
  } else {
    data.fails[L] = (data.fails[L] | 0) + 1;
  }
  if (anyInput && L === 1) data.tips.moved = 1;
  tutorial = false;
  $('tut').hidden = true;
  save(data);

  $('resTitle').textContent = won ? '승리!' : '전멸';
  $('scrResult').classList.toggle('lost', !won);
  const starEls = $('resStars').children;
  for (let i = 0; i < 3; i++) {
    starEls[i].className = '';
    if (i < stars) setTimeout(() => { starEls[i].className = 'on'; sfx.coin(); }, 350 + i * 300);
  }
  $('resStars').hidden = !won;
  const g = starGoals(par);
  const lines = [];
  if (won) {
    lines.push(['남은 병력', `${n}명`]);
    lines.push(['★★★ 기준', `${g.three}명`]);
    if (support) lines.push(['지원 병력 사용', '별 최대 1개']);
  } else {
    const pct = s.boss ? Math.round(100 * (1 - Math.max(0, s.boss.hp) / s.boss.max)) : Math.round(progress(s) * 100);
    lines.push([s.boss ? '보스 체력 깎음' : '진행', `${pct}%`]);
  }
  lines.push(['처치', `${s.stats.kills}`]);
  lines.push(['획득 코인', `+${coins}`]);
  $('resStats').innerHTML = lines.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  const cause = CAUSE[s.cause] || CAUSE.foe;
  $('resCause').hidden = won;
  $('resCause').innerHTML = won ? '' : `<b>${cause[0]}</b><span>${cause[1]}</span>`;
  $('resPrimary').textContent = won ? '다음 레벨' : '다시 도전';
  const helpN = Math.max(5, Math.round((lv.arrive || 30) * 0.2));
  const offerHelp = !won && (data.fails[L] | 0) >= 3;
  $('resHelp').hidden = !offerHelp;
  $('resHelp').textContent = `지원 병력 +${helpN}명 받고 다시 (별 최대 1개)`;
  $('resHelp').dataset.n = helpN;
  const cheapest = Math.min(...UPGRADES.map((u) => (data.upg[u.id] >= u.max ? Infinity : upgCost(data.upg[u.id]))));
  $('resUpg').classList.toggle('glow', data.coins >= cheapest);
  show('scrResult');
}

/* ---------- 루프 ---------- */
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (s) {
    let scale = 1;
    if (now < slowUntil) scale = slowScale;
    if (tutorial && mode === 'play') scale = Math.min(scale, 0.35);
    if (mode === 'play' || attract) {
      acc += dtReal * scale;
      let n = 0;
      while (acc >= DT && n < 5) {
        prevZ = s.squad.z;
        const inp = attract || window.__squad.auto ? botInput(s) : currentInput();
        step(s, inp);
        handleEvents(s.ev);
        acc -= DT;
        n++;
      }
      if (n === 5) acc = 0;
      if (attract && (s.phase === 'won' || s.phase === 'lost') && s.endT > 3) {
        s = newGame(lv, { start: START_N + 2 * data.upg.start, fire: data.upg.fire });
        prevZ = s.squad.z;
        renderer.reset();
      }
      if (mode === 'play') {
        watchTips();
        if ((s.phase === 'won' && s.endT > 1.6) || (s.phase === 'lost' && s.endT > 1.2)) finish();
      }
    }
    renderer.draw(s, Math.min(1, acc / DT), dtReal, prevZ);
    if (mode === 'play' || mode === 'pause') updateHud();
  } else {
    renderer.draw(idleState, 0, dtReal, 0);
  }
  updateTips(now);
  // 프레임이 계속 느리면 저사양으로
  if (mode === 'play' && !data.set.low && !autoLow) {
    frameTimes.push(dtReal);
    if (frameTimes.length > 120) {
      frameTimes.shift();
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      if (avg > 0.024) { autoLow = true; applySettings(); }
    }
  }
}

/* 상태가 아직 없을 때 그릴 빈 길 */
const idleState = { t: 0, squad: { x: 0, z: 0, vz: 0, n: 0, tier: 0 }, rows: [], props: [], saws: [], foes: [], spits: [], bullets: [], boss: null, phase: 'run' };

let hudCache = '';
function updateHud() {
  const p = s.boss ? 1 : progress(s);
  $('hudBar').style.transform = `scaleX(${p})`;
  const key = `${data.coins + s.stats.coins}`;
  if (key !== hudCache) { hudCache = key; $('hudCoins').textContent = key; }
  if (s.boss) $('bossFill').style.transform = `scaleX(${Math.max(0, s.boss.hp) / s.boss.max})`;
}

/* ---------- 화면 크기 ---------- */
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.resize(w, h, window.devicePixelRatio || 1);
}
window.addEventListener('resize', resize);

/* ---------- 화면 꺼짐 방지 ---------- */
async function requestWake() {
  try {
    if (navigator.wakeLock && !wake) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch { wake = null; }
}
function releaseWake() {
  try { if (wake) wake.release(); } catch { /* 무시 */ }
  wake = null;
}

/* ---------- 버튼 ---------- */
function on(id, fn) { $(id).addEventListener('click', (e) => { unlock(); fn(e); }); }
on('btnPlay', () => startLevel(data.cur));
on('btnLevels', () => { sfx.click(); mode = 'levels'; renderLevels(); show('scrLevels'); });
on('btnUpg', () => { sfx.click(); mode = 'upg'; renderUpg(); show('scrUpg'); });
on('btnSet', () => { sfx.click(); mode = 'set'; renderSet(); show('scrSet'); });
for (const b of document.querySelectorAll('[data-back]')) {
  b.addEventListener('click', () => {
    sfx.click();
    if (b.dataset.back === 'pause') { mode = 'pause'; show('scrPause'); return; }
    if (b.dataset.back === 'result') { mode = 'result'; show('scrResult'); return; }
    goTitle();
  });
}
on('btnPause', () => { sfx.click(); pause(); });
on('pResume', () => { sfx.click(); resume(); });
on('pRestart', () => startLevel(lv.L));
on('pSet', () => { sfx.click(); mode = 'set'; renderSet(); show('scrSet'); $('setBack').dataset.back = 'pause'; });
on('pMenu', () => { sfx.click(); goTitle(); });
on('resPrimary', () => {
  if (s.phase === 'won') startLevel(lv.L + 1);
  else startLevel(lv.L);
});
on('resHelp', () => startLevel(lv.L, { support: Number($('resHelp').dataset.n) || 0 }));
on('resUpg', () => { sfx.click(); mode = 'upg'; renderUpg(); show('scrUpg'); $('upgBack').dataset.back = 'result'; });
on('resMenu', () => { sfx.click(); goTitle(); });
on('resetAsk', () => { sfx.click(); $('resetAsk').hidden = true; $('resetConfirm').hidden = false; });
on('resetNo', () => { sfx.click(); $('resetAsk').hidden = false; $('resetConfirm').hidden = true; });
on('resetYes', () => {
  data = wipe();
  save(data);
  applySettings();
  sfx.click();
  goTitle();
});
// 뒤로 버튼 기본값 되돌리기
for (const id of ['setBack', 'upgBack']) $(id).addEventListener('click', () => { setTimeout(() => { $(id).dataset.back = 'title'; }, 0); });

/* ---------- 시작 ---------- */
function start(hotData) {
  if (hotData && hotData.save) data = { ...data, ...hotData.save };
  applySettings();
  resize();
  goTitle();
  last = performance.now();
  requestAnimationFrame(frame);
}

const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === 'function') {
  try { hot.snapshot(() => ({ save: data })); } catch { /* 무시 */ }
}
const fontsReady = document.fonts && document.fonts.load ? Promise.race([
  Promise.all([document.fonts.load('40px "Black Han Sans"'), document.fonts.ready]),
  new Promise((r) => setTimeout(r, 1500)),
]).catch(() => {}) : Promise.resolve();
fontsReady.then(() => {
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
});

/* 테스트·디버그용 */
window.__squad = { auto: false, get state() { return s; }, get mode() { return mode; }, get data() { return data; }, startLevel, radius, UNLOCK };

/* 오프라인 캐시(GitHub Pages에서만 — 미리보기 창 등에서는 조용히 넘어간다) */
if ('serviceWorker' in navigator && location.protocol === 'https:' && /\/squad\/?(index\.html)?$/.test(location.pathname)) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
