/* 숫자부대 돌격 — 게임 루프, 조작, 화면 흐름, 저장 */
import {
  DT, START_N, EDGE, UNLOCK, SIM, prepareLevel, newGame, step, botInput, heroWants, starsFor, starGoals, parFor, coinsFor,
  progress, radius, snapshot, restore,
} from './core.js';
import { createRenderer } from './render.js';
import { sfx, unlock, setSoundOn, suspend, whenAudio } from './audio.js';
import { createMusic } from './music.js';
import {
  load, save, wipe, normalize, probe, storageMode, keepBackup, readBackup, UPGRADES, upgCost, totalStars, seen, SAVE_V,
} from './store.js';
import * as STORE from './store.js';
import { saveRun, loadRun, clearRun, encodeBackup, decodeBackup } from './save.js';
import { HEROES, HERO_IDS, UNITS, UNIT_IDS, HERO_MAX_LV, heroCost, heroCap, heroesEarned, biomeOf } from './roster.js';
import {
  tagOf, hasTags, mulText, TAG_FIRE, upgState, bossEtaOf, bossClash, supportSize, restartCounts, gateAlts, rowOrdinal, nearMiss, gearGap,
} from './insight.js';

const $ = (id) => document.getElementById(id);
const cvs = $('cv');
const renderer = createRenderer(cvs);
/* 조작 계산은 CSS 픽셀 기준(렌더러 버퍼 크기와 무관) */
const scr = () => renderer.screen || renderer.view;

probe();
let data = load();
let lv = null;          // 지금 레벨(보정 끝난 것)
let s = null;           // 시뮬레이션 상태
let mode = 'boot';      // boot title levels hero upg set backup card play pause result
let attract = false;    // 타이틀 뒤에서 봇이 플레이
let prevZ = 0;
let acc = 0;
let last = 0;
let slowUntil = 0;
let slowScale = 1;
let tutorial = false;   // 1레벨 첫 입력 전 느린 진행
let resultShown = false;
let frameTimes = [];
let autoLow = false;
let wake = null;
let par = 0;            // 이번 판 별 기준(강화·영웅 반영)
let run = null;         // 이번 판 정보 { id, L, start, fire, support, hero }
let lastSaveT = 0;      // 마지막 자동 저장(시뮬레이션 시간)
let skillPressed = false;
let music = null;
let heroPickFromCard = false;

/* ---------- 조작 ---------- */
/* 좌우 누르기: 화면 왼쪽·오른쪽 절반을 누르고 있으면 그쪽으로 간다.
   끌기: 옆으로 크게 밀면(가운데에서 시작하면 조금만 밀어도) 끄는 만큼 따라온다. */
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
    endTutorial();
  }
}
function endTutorial() {
  if (tutorial) { tutorial = false; $('tut').hidden = true; }
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
  return { dir, tx, skill: skillPressed || (data.set.autoSkill && heroWants(s)) };
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
const SKILL = (e) => e.key === ' ' || e.key === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space';
/* 마우스·키보드 기기면 안내에 글쇠도 적는다 */
const FINE = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
window.addEventListener('keydown', (e) => {
  unlock();
  if (LEFT(e)) { keys.left = true; if (mode === 'play') { markInput(); e.preventDefault(); } }
  else if (RIGHT(e)) { keys.right = true; if (mode === 'play') { markInput(); e.preventDefault(); } }
  else if (SKILL(e) && mode === 'play') { pressSkill(); e.preventDefault(); }
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
/* 승패가 정해진 뒤 결과 화면 전(1~2초 연출 중)에 페이지를 떠나면 그 자리에서 정산한다 */
function settleIfOver() {
  if (mode === 'play' && s && !attract && (s.phase === 'won' || s.phase === 'lost')) { finish(); return true; }
  return false;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (settleIfOver()) { /* 정산함 */ }
    else if (mode === 'play') pause();
    else if (mode === 'pause') saveRunNow();
    suspend();
  } else if (mode === 'play') requestWake();
});
window.addEventListener('pagehide', () => { if (!settleIfOver() && (mode === 'play' || mode === 'pause')) saveRunNow(); });
/* 다른 탭에서 진행이 바뀌면(같은 게임을 두 탭에 열었을 때) 어느 화면에서든 다시 읽는다.
   판 진행(run·par·지원)은 따로 있어서, 판 도중에 읽어도 그 판은 그대로 이어진다. */
window.addEventListener('storage', (e) => {
  if (e.key !== 'squad.v1') return;
  data = load();
  applySettings();
  if (mode === 'title') renderTitle();
});

/* ---------- 뒤로 가기: 게임 중 뒤로 가기 제스처는 일시정지로 ---------- */
let historyArmed = false;
function armHistory() {
  if (historyArmed) return;
  try { history.pushState({ squad: 1 }, ''); historyArmed = true; } catch { /* 무시 */ }
}
window.addEventListener('popstate', () => {
  historyArmed = false;
  if (!$('scrJoin').hidden) { joinAfter = null; closeJoin(false); armHistory(); return; }
  if (!$('scrNotice').hidden) { $('scrNotice').hidden = true; armHistory(); return; }
  if (mode === 'play') { pause(); armHistory(); return; }
  if (mode === 'pause' || mode === 'card') { armHistory(); return; }
  if (mode === 'result') { goTitle(); return; }
  if (mode === 'title') return;
  // 하위 화면은 그 화면의 돌아가기 버튼과 똑같이(일시정지·카드·결과·설정으로 한 단계씩)
  const bk = document.querySelector('.screen:not([hidden]) [data-back]');
  if (bk) bk.click(); else goTitle();
  if (mode !== 'title') armHistory();
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

/* ---------- 알림 ---------- */
let toastT = 0;
function toast(text, ms = 2200) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, ms);
}
/* 확인 창: buttons = [{ label, primary, fn }] */
function notice(title, text, buttons) {
  $('noticeTitle').textContent = title;
  $('noticeText').textContent = text;
  const box = $('noticeBtns');
  box.textContent = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = 'btn' + (b.primary ? ' primary' : '');
    el.textContent = b.label;
    el.addEventListener('click', () => { unlock(); sfx.click(); $('scrNotice').hidden = true; if (b.fn) b.fn(); });
    box.appendChild(el);
  }
  $('scrNotice').hidden = false;
  setTimeout(() => { const f = box.querySelector('.primary') || box.firstChild; if (f) f.focus({ preventScroll: true }); }, 30);
}

/* ---------- 화면 전환 ---------- */
const SCREENS = ['scrTitle', 'scrLevels', 'scrHero', 'scrUpg', 'scrSet', 'scrBackup', 'scrCard', 'scrPause', 'scrResult'];
function show(id) {
  for (const k of SCREENS) $(k).hidden = k !== id;
  $('hud').hidden = !(mode === 'play' || mode === 'pause' || mode === 'card' || mode === 'result');
  const touch = mode === 'play';
  $('touchL').hidden = !touch;
  $('touchR').hidden = !touch;
  $('skillBtn').hidden = !(touch && s && s.hero);
  if (!touch) $('tip').hidden = true;
  if (renderer.setFrozen) renderer.setFrozen(mode === 'pause' || mode === 'result');
  if (renderer.setCard) renderer.setCard(mode === 'card');   // 레벨 카드 뒤에는 병력 숫자·떠오르는 숫자를 그리지 않는다
  const focus = id && $(id).querySelector('[data-focus]');
  if (focus) setTimeout(() => focus.focus({ preventScroll: true }), 30);
  updateMusic();
}

function goTitle() {
  mode = 'title';
  tutorial = false;
  $('tut').hidden = true;
  tipQueue.length = 0;
  tipUntil = 0;
  heroPickFromCard = false;
  $('setBack').dataset.back = 'title';
  $('upgBack').dataset.back = 'title';
  $('heroBack').dataset.back = 'title';
  releaseWake();
  renderTitle();
  show('scrTitle');
  startAttract();
  setTimeout(nextJoinNotice, 600);
}

/* 숫자 뒤 조사: 레벨 15를 · 레벨 13을 (끝자리 0·1·3·6·7·8은 받침이 있다) */
const eul = (n) => ('013678'.includes(String(Math.abs(Math.floor(n))).slice(-1)) ? '을' : '를');
const compact = (n) => {
  try { return n >= 10000 ? new Intl.NumberFormat('ko', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : String(n); } catch { return String(n); }
};
const ago = (t) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}시간 전` : `${Math.round(h / 24)}일 전`;
};

function pendingRun() {
  const r = loadRun();
  if (!r || r.sim !== SIM || r.id === data.lastRunId) return null;
  return r;
}

function renderTitle() {
  $('tPlayL').textContent = data.cur;
  $('tCoins').textContent = compact(data.coins);
  $('tStars').textContent = totalStars(data);
  const sel = data.heroes.sel && HEROES[data.heroes.sel];
  $('tHero').textContent = sel ? sel.name : '레벨 3부터';
  $('storeChip').hidden = storageMode() === 'ok';
  $('storeChip').textContent = storageMode() === 'full' ? '저장 공간이 가득 찼어요' : '저장 꺼짐 · 눌러서 확인';
  const r = pendingRun();
  $('resumeCard').hidden = !r;
  $('resumeConfirm').hidden = true;
  if (r) {
    const st = r.state;
    const where = st.boss ? '보스전' : `보스까지 ${Math.round(Math.min(1, st.squad.z / st.arenaZ) * 100)}%`;
    $('resumeInfo').textContent = `레벨 ${r.L} · ${st.squad.n}명 · ${where} · ${ago(r.at)} 저장`;
    // 첫 게이트를 지난 판만 진 판으로 센다
    $('resumeConfirm').querySelector('.warn').textContent = restartCounts(st) ? '이 판을 포기할까요? 진 판으로 기록돼요.' : '이 판을 포기할까요?';
  }
}

/* 타이틀 뒤에서는 봇이 지금 레벨을 대신 돈다 */
function startAttract() {
  attract = true;
  const L = data.cur;
  setTimeout(() => {
    if (!['title', 'levels', 'hero', 'upg', 'set', 'backup'].includes(mode)) return;
    lv = prepareLevel(L);
    s = newGame(lv, { start: START_N + 2 * data.upg.start, fire: data.upg.fire, hero: heroForRun(L) });
    prevZ = s.squad.z;
    renderer.reset();
  }, 40);
}

/* ---------- 영웅 ---------- */
function ownedHero(id) { return data.heroes.lv[id] | 0; }
function heroForRun(L) {
  const id = data.heroes.sel;
  if (L < UNLOCK.hero || !id || !ownedHero(id)) return null;
  return { id, lv: ownedHero(id) };
}
function faceEl(id, scale, cls = 'fallback') {
  try {
    const c = renderer.portrait && renderer.portrait(id, scale);
    if (c) { c.classList && c.classList.add('pix'); return c; }
  } catch { /* 아직 그림이 없다 */ }
  const sp = document.createElement('span');
  sp.className = cls;
  sp.textContent = HEROES[id] ? HEROES[id].name[0] : '?';
  sp.style.color = HEROES[id] ? HEROES[id].color : '#fff';
  return sp;
}
function iconEl(k, scale) {
  try {
    const c = renderer.icon && renderer.icon(k, scale);
    if (c) { c.classList && c.classList.add('pix'); return c; }
  } catch { /* 아직 그림이 없다 */ }
  const d = document.createElement('span');
  d.className = 'dot';
  d.style.background = (UNITS[k] && UNITS[k].color) || '#fff';
  return d;
}
/* 레벨 태그 배지: 도트 불꽃(어려움 1개·매우 어려움 2개) + 이름. 쉼은 글자만. 글꼴마다 🔥 모양이 달라 도트 아이콘을 쓴다 */
function tagBadge(t, label = true, scale = 2) {
  const el = document.createElement('span');
  el.className = 'tagb tag-' + t.tag;
  const fires = TAG_FIRE[t.tag] || 0;
  for (let i = 0; i < fires; i++) {
    let c = null;
    try { c = renderer.icon && renderer.icon('fire', scale); } catch { /* 아직 그림이 없다 */ }
    if (c) { c.classList && c.classList.add('pix'); el.appendChild(c); } else el.append('🔥');
  }
  if (label || !fires) {
    const b = document.createElement('b');
    b.textContent = t.label;
    el.appendChild(b);
  }
  return el;
}
const TAG_LINE = {
  hard: '강한 보스 — 상자·철창도 챙겨 가세요',
  super: '지역의 끝 — 아주 강한 보스가 기다려요',
  rest: '쉬어 가는 판이에요',
};

let heroView = '';
function renderHero() {
  $('hCoins').textContent = compact(data.coins);
  const owned = HERO_IDS.filter((id) => ownedHero(id));
  if (!heroView || !HEROES[heroView]) heroView = data.heroes.sel || owned[0] || HERO_IDS[0];
  const id = heroView;
  const H = HEROES[id];
  const lvH = ownedHero(id);
  const cap = heroCap(data.maxL);
  const box = $('heroDetail');
  box.textContent = '';
  const top = document.createElement('div');
  top.className = 'hero-top';
  const face = document.createElement('div');
  face.className = 'portrait';
  face.appendChild(faceEl(id, 5));
  const info = document.createElement('div');
  info.innerHTML = `<div class="hero-name"></div><span class="hero-role"></span><p class="hero-line"></p>`;
  info.querySelector('.hero-name').textContent = H.name + (lvH ? ` Lv${lvH}` : '');
  info.querySelector('.hero-role').textContent = H.role;
  info.querySelector('.hero-line').textContent = `“${H.line}”`;
  top.append(face, info);
  box.appendChild(top);
  const skill = document.createElement('div');
  skill.className = 'skill-box';
  const shown = Math.max(1, lvH);
  const next = lvH && lvH < HERO_MAX_LV;
  const nextSkill = next ? `<br><em>Lv${lvH + 1}: ${H.skill.text(lvH + 1)}</em>` : '';
  const nextPassive = next ? `<br><em>Lv${lvH + 1}: ${H.passive.text(lvH + 1)}</em>` : '';
  skill.innerHTML = `<b>스킬 · ${H.skill.name}</b>${H.skill.text(shown)}${nextSkill}<b style="margin-top:6px">패시브 · ${H.passive.name}</b>${H.passive.text(shown)}${nextPassive}`;
  box.appendChild(skill);
  const actions = document.createElement('div');
  actions.className = 'stack';
  actions.style.marginTop = '12px';
  if (!lvH) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = `잠김 · ${H.unlock.text}` + (H.unlock.type === 'stars' ? ` (지금 ${totalStars(data)}개)` : '');
    actions.appendChild(p);
  } else {
    if (lvH < HERO_MAX_LV) {
      const cost = heroCost(lvH);
      const up = document.createElement(lvH >= cap ? 'p' : 'button');
      up.className = lvH >= cap ? 'muted hero-cap' : 'btn';
      if (lvH >= cap) {
        up.textContent = `레벨 ${(cap - 1) * 10}을 깨면 Lv${cap + 1}까지 올릴 수 있어요`;
      } else {
        up.innerHTML = `Lv${lvH} → Lv${lvH + 1} · <span class="coinchip">${cost}</span>`;
        up.disabled = data.coins < cost;
        up.addEventListener('click', () => {
          if (data.coins < cost) { sfx.deny(); return; }
          data.coins -= cost;
          data.heroes.lv[id] = lvH + 1;
          save(data);
          sfx.buy();
          renderHero();
          renderTitle();
        });
      }
      actions.appendChild(up);
    }
    const sel = document.createElement('button');
    sel.className = 'btn primary';
    const isSel = data.heroes.sel === id;
    sel.textContent = heroPickFromCard ? '이 영웅으로 출격' : isSel ? '출격 중' : '이 영웅으로 출격';
    sel.disabled = !heroPickFromCard && isSel;
    sel.addEventListener('click', () => {
      data.heroes.sel = id;
      save(data);
      sfx.click();
      if (heroPickFromCard) { heroPickFromCard = false; backToCard(); return; }
      renderHero();
      renderTitle();
    });
    actions.appendChild(sel);
  }
  box.appendChild(actions);
  const list = $('heroList');
  list.textContent = '';
  for (const hid of HERO_IDS) {
    const b = document.createElement('button');
    b.className = 'hero-pick' + (hid === heroView ? ' sel' : '') + (ownedHero(hid) ? '' : ' locked');
    b.appendChild(faceEl(hid, 2));
    const nm = document.createElement('span');
    nm.textContent = HEROES[hid].name + (ownedHero(hid) ? ` Lv${ownedHero(hid)}` : '');
    b.appendChild(nm);
    if (!ownedHero(hid)) { const sm = document.createElement('small'); sm.textContent = HEROES[hid].unlock.text; b.appendChild(sm); }
    else if (data.heroes.sel === hid) { const sm = document.createElement('small'); sm.textContent = '출격 중'; b.appendChild(sm); }
    b.addEventListener('click', () => { sfx.click(); heroView = hid; renderHero(); });
    list.appendChild(b);
  }
}

/* 새로 합류한 영웅 안내(한 명씩) */
function newlyEarned() {
  return HERO_IDS.filter((id) => ownedHero(id) && !data.seenHeroes.includes(id));
}
const modalOpen = () => !$('scrJoin').hidden || !$('scrNotice').hidden;
let joinAfter = null;   // 결과 화면에서 띄웠을 때: 닫은 뒤 이어서 할 일
let balanceNote = false;   // 난이도 개편 뒤 처음: 기존 플레이어에게 한 번
function nextJoinNotice() {
  if (mode !== 'title' || modalOpen()) return;
  const id = newlyEarned()[0];
  if (!id) { if (!showBalanceNote()) maybeNudge(); return; }
  openJoin(id);
}
function showBalanceNote() {
  if (!balanceNote) return false;
  balanceNote = false;
  data.seenSim = SIM;
  save(data);
  notice('난이도가 새로 맞춰졌어요', '5레벨마다 불꽃 표시가 붙은 어려운 판이 있어요(코인을 더 줘요). 그 바로 다음 판은 쉬어 가요. 이미 받은 별과 산 강화는 그대로예요.', [{ label: '알겠어요', primary: true }]);
  return true;
}
function openJoin(id) {
  const H = HEROES[id];
  const already = data.heroes.sel === id;
  $('joinTake').textContent = already ? '좋아요!' : '지금 데려가기';
  $('joinLater').hidden = already;
  const face = $('joinFace');
  face.textContent = '';
  face.appendChild(faceEl(id, 6));
  $('joinName').textContent = `${H.name} · ${H.role}`;
  $('joinLine').textContent = `“${H.line}”`;
  $('joinSkill').innerHTML = `<b>${H.skill.name}</b>${H.skill.text(1)}<br><small>게이지가 다 차면 화면 아래 가운데 영웅 버튼${FINE ? '(또는 Space 키)' : ''}을 눌러요</small>`;
  $('scrJoin').hidden = false;
  $('scrJoin').dataset.id = id;
  setTimeout(() => { if (!$('scrJoin').hidden) $('joinTake').focus({ preventScroll: true }); }, 30);
  sfx.join();
}
function closeJoin(take) {
  const id = $('scrJoin').dataset.id;
  $('scrJoin').hidden = true;
  if (id && !data.seenHeroes.includes(id)) data.seenHeroes.push(id);
  if (take && id) data.heroes.sel = id;
  save(data);
  const after = joinAfter;
  joinAfter = null;
  if (after) { after(); return; }
  renderTitle();
  setTimeout(nextJoinNotice, 300);
}

/* 레벨 10쯤에서 한 번만: 백업 권하기(영웅 합류 안내가 모두 끝난 뒤) */
function maybeNudge() {
  if (mode !== 'title' || modalOpen() || data.maxL < 10 || data.backupAt || data.nagged || storageMode() !== 'ok') return;
  data.nagged = Date.now();
  save(data);
  notice('진행을 지키는 방법', '홈 화면에 추가하거나 백업 코드를 복사해 두세요. 오래 열지 않으면 브라우저가 저장을 지울 수 있어요.', [
    { label: '백업 코드 만들기', primary: true, fn: () => { $('bkBack').dataset.back = 'title'; openBackup('make'); } },
    { label: '다음에' },
  ]);
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
    // 어려움·매우 어려움·쉼 배지(잠긴 레벨에도 — 벽이 어디 있는지 미리 보이게)
    const tg = tagOf(L);
    if (tg.tag) {
      b.classList.add('tag-' + tg.tag);
      b.appendChild(tagBadge(tg, false, 1));
    }
    if (!open) b.setAttribute('aria-label', `레벨 ${L}${tg.label ? ' ' + tg.label : ''} 잠김`);
    else if (tg.label) b.setAttribute('aria-label', `레벨 ${L} ${tg.label}, 별 ${st}개`);
    if (L === data.cur) b.classList.add('cur');
    // 지난 레벨을 골라도 '이어하기' 위치(data.cur)는 바꾸지 않는다
    b.addEventListener('click', () => { sfx.click(); tryStart(L); });
    grid.appendChild(b);
  }
}

/* ---------- 강화 ---------- */
function renderUpg() {
  $('uCoins').textContent = compact(data.coins);
  const list = $('upgList');
  list.textContent = '';
  for (const u of UPGRADES) {
    // 진행에 따른 상한은 새로 사는 것만 막는다 — 이미 산 단계(상한보다 높아도)는 그대로 둔다
    const st = upgState(data, u, undefined, STORE);
    const lvU = st.lv;
    const maxed = st.maxed;
    const locked = st.locked;
    const cost = upgCost(lvU);
    const card = document.createElement('div');
    card.className = 'upg' + (locked ? ' locked' : '');
    const pip = (i) => (i < lvU ? 'on' : i >= Math.max(st.cap, lvU) ? 'cap' : '');
    card.innerHTML = `
      <div class="upg-head"><b>${u.name}</b><span class="pips" aria-hidden="true">${Array.from({ length: u.max }, (_, i) => `<i class="${pip(i)}"></i>`).join('')}</span></div>
      <p class="upg-eff">${u.effect(lvU)}${maxed || locked ? '' : ` → <em>${u.effect(lvU + 1)}</em>`}</p>`;
    const capText = st.at ? `레벨 ${st.at}${eul(st.at)} 깨면 더 올릴 수 있어요` : '지금은 더 올릴 수 없어요';
    if (locked) {
      const note = document.createElement('p');
      note.className = 'upg-cap';
      note.textContent = capText;
      card.appendChild(note);
    }
    const btn = document.createElement('button');
    btn.className = 'buy';
    btn.textContent = maxed ? '최대' : locked ? '상한' : `${cost} 코인`;
    btn.disabled = maxed || locked || data.coins < cost;
    if (locked) btn.setAttribute('aria-label', `${u.name} 상한 — ${capText}`);
    btn.addEventListener('click', () => {
      if (data.coins < cost || maxed || !upgState(data, u, undefined, STORE).canBuy) { sfx.deny(); return; }
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
  { id: 'music', name: '배경 음악' },
  { id: 'vibe', name: '진동' },
  { id: 'autoSkill', name: '영웅 스킬 자동 발동', note: '게이지가 차면 알맞은 때에 알아서 써요' },
  { id: 'shake', name: '화면 흔들림' },
  { id: 'preview', name: '게이트 결과 미리보기', note: '게이트 아래에 지나가면 몇 명이 되는지 보여줘요' },
  { id: 'low', name: '저사양 모드', note: '병사를 덜 그리고 효과를 줄여요' },
];
function applySettings() {
  setSoundOn(data.set.sound);
  if (music) music.setOn(data.set.music);
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
    input.checked = !!data.set[it.id] || (it.id === 'low' && autoLow);
    input.addEventListener('change', () => {
      data.set[it.id] = input.checked;
      if (it.id === 'low' && !input.checked) { autoLow = false; frameTimes = []; }
      save(data);
      applySettings();
      sfx.click();
    });
    row.appendChild(input);
    list.appendChild(row);
  }
  const where = storageMode() === 'ok' ? '자동 저장: 켜짐 · 이 기기' : storageMode() === 'full' ? '저장 공간이 가득 찼어요 — 백업 코드를 만들어 두세요' : '저장 꺼짐 — 이 창을 닫으면 진행이 사라져요';
  $('dataInfo').textContent = `${where} · 마지막 백업: ${data.backupAt ? ago(data.backupAt) : '없음'}`;
  $('bkUndo').hidden = !readBackup();
  $('resetAsk').hidden = false;
  $('resetConfirm').hidden = true;
}

/* ---------- 백업 코드 ---------- */
let pendingImport = null;
async function openBackup(kind) {
  mode = 'backup';
  pendingImport = null;
  $('bkMakeBox').hidden = kind !== 'make';
  $('bkEnterBox').hidden = kind !== 'enter';
  $('bkTitle').textContent = kind === 'make' ? '백업 코드 만들기' : '백업 코드 넣기';
  $('bkErr').textContent = '';
  $('bkCompare').hidden = true;
  $('bkInput').value = '';
  $('bkShare').hidden = !navigator.share;
  show('scrBackup');
  if (kind === 'make') {
    $('bkCode').value = '만드는 중…';
    try {
      $('bkCode').value = await encodeBackup(data);
      $('bkSummary').textContent = `레벨 ${data.maxL} · ★ ${totalStars(data)} · 코인 ${data.coins.toLocaleString('ko')} 기준`;
    } catch { $('bkCode').value = '코드를 만들지 못했어요. 다시 시도해 주세요.'; }
  }
}
function heroCount(d) { return Object.keys((d.heroes && d.heroes.lv) || {}).length; }
function cmpRow(label, a, b) { return `<tr><td>${label}</td><td>${a}</td><td>${b}</td></tr>`; }
async function checkImport() {
  $('bkErr').textContent = '';
  $('bkCompare').hidden = true;
  try {
    const { data: raw, at } = await decodeBackup($('bkInput').value);
    if ((raw.v | 0) > SAVE_V) throw new Error('더 새 버전의 코드예요. 이 기기에서 게임을 새로고침한 뒤 다시 넣어 주세요.');
    const d = normalize(raw);
    pendingImport = d;
    const when = at ? new Date(at).toLocaleString('ko') : '—';
    $('bkRows').innerHTML = cmpRow('레벨', data.maxL, d.maxL) + cmpRow('별', totalStars(data), totalStars(d))
      + cmpRow('코인', data.coins.toLocaleString('ko'), d.coins.toLocaleString('ko')) + cmpRow('영웅', heroCount(data), heroCount(d))
      + cmpRow('저장 시각', data.updated ? new Date(data.updated).toLocaleString('ko') : '—', when);
    $('bkWarn').hidden = !(totalStars(d) < totalStars(data) || d.maxL < data.maxL);
    $('bkCompare').hidden = false;
  } catch (e) {
    $('bkErr').textContent = e.message || '코드를 읽지 못했어요.';
    sfx.deny();
  }
}
function applyImport() {
  if (!pendingImport) return;
  keepBackup(data);
  data = pendingImport;
  pendingImport = null;
  data.lastRunId = '';
  clearRun();
  save(data);
  applySettings();
  toast('진행을 옮겼어요. 설정의 되돌리기로 이전 진행을 살릴 수 있어요.', 3200);
  goTitle();
}
function undoImport() {
  const b = readBackup();
  if (!b) return;
  keepBackup(data);   // 되돌리기도 되돌릴 수 있게 맞바꾼다
  data = normalize(b.data);
  clearRun();
  save(data);
  applySettings();
  toast('이전 진행으로 되돌렸어요');
  goTitle();
}
async function copyText(text, el) {
  try {
    await navigator.clipboard.writeText(text);
    toast('복사했어요');
    return true;
  } catch {
    if (el) { el.focus(); el.select(); }
    toast(el ? '길게 눌러 직접 복사해 주세요' : '복사하지 못했어요');
    return false;
  }
}
/* 백업 코드를 실제로 옮겨 적었을 때만 '마지막 백업'으로 친다 */
function markBackedUp() {
  data.backupAt = Date.now();
  save(data);
  if (mode === 'set') renderSet();
}

/* ---------- 레벨 시작 ---------- */
const NEW_THING = {
  1: '화면 왼쪽·오른쪽을 눌러 큰 숫자 게이트로!',
  2: '새로 나와요: ×2 게이트, 쏴서 올리는 마이너스 게이트',
  3: '새로 나와요: 바리케이드, 영웅 합류',
  4: '새로 나와요: 보급 상자, 질주 좀비',
  5: '새로 나와요: 독침 좀비, 철창 속 의무병',
  6: '새로 나와요: 톱날',
  7: '새로 나와요: 거구 좀비',
  8: '새로 나와요: ÷2 게이트',
  9: '새로 나와요: 저격수, 금색 특수병 게이트',
  10: '새로 나와요: 세 갈래 게이트, ×3',
  13: '새로 나와요: 로켓병',
};
let startToken = 0;     // 카드가 떠 있는 동안 다른 레벨을 누르면 앞의 예약은 버린다
let support = 0;        // 연패 지원 병력

/* 진행 중인 판이 있으면 먼저 물어본다 */
function tryStart(L, opts = {}) {
  if (modalOpen()) return;
  const r = pendingRun();
  if (!r) { startLevel(L, opts); return; }
  // 첫 게이트를 지난 판만 진 판으로 센다(그 전에 그만둔 판은 공짜)
  const counts = restartCounts(r.state);
  if (r.L === L && !opts.support) {
    notice('하던 판이 있어요', `레벨 ${L}${eul(L)} 저장한 곳부터 이어서 할까요?${counts ? ' 처음부터 하면 하던 판은 진 판으로 기록돼요.' : ''}`, [
      { label: '이어서 하기', primary: true, fn: resumeRun },
      { label: '처음부터', fn: () => { abandonRun(r); startLevel(L, opts); } },
      { label: '취소' },
    ]);
    return;
  }
  notice('진행 중인 판이 있어요', `레벨 ${r.L}${eul(r.L)} 포기하고 레벨 ${L}${eul(L)} 시작할까요?${counts ? ' 포기한 판은 진 판으로 기록돼요.' : ''}`, [
    { label: '포기하고 시작', primary: true, fn: () => { abandonRun(r); startLevel(L, opts); } },
    { label: '취소' },
  ]);
}
function abandonRun(r) {
  if (restartCounts(r.state)) data.fails[r.L] = (data.fails[r.L] | 0) + 1;
  data.lastRunId = r.id;
  clearRun();
  save(data);
}

/* 레벨 카드 글자(지역·태그·새 메커닉) */
function fillCard(L) {
  $('cardL').textContent = L;
  const b = biomeOf(L);
  const firstInRegion = (L - 1) % 10 === 0 && L > 1;
  $('cardRegion').textContent = firstInRegion ? `새 지역: ${b.name} · 레벨 ${L}~${L + 9}` : b.name;
  const tg = tagOf(L);
  const tagEl = $('cardTag');
  tagEl.textContent = '';
  tagEl.hidden = !tg.tag;
  if (tg.tag) {
    tagEl.appendChild(tagBadge(tg, true, 2));
    if (tg.coinMul > 1) {
      const m = document.createElement('span');
      m.className = 'coinmul';
      m.innerHTML = `<span class="coinchip">코인 ${mulText(tg.coinMul)}</span>`;
      tagEl.appendChild(m);
    }
  }
  tagEl.className = 'card-tag' + (tg.tag ? ' tag-' + tg.tag : '');
  // 예전 '강한 보스' 문구는 태그가 없는 시뮬레이션에서만(수치가 같은데 약속하지 않게)
  $('cardNew').textContent = NEW_THING[L] || TAG_LINE[tg.tag] || (!hasTags() && L % 5 === 0 ? '강한 보스가 기다려요' : '');
  const newUnit = UNIT_IDS.find((k) => UNITS[k].unlock === L);
  $('cardUnit').hidden = !newUnit;
  $('cardUnit').textContent = newUnit ? `${UNITS[newUnit].name}: ${UNITS[newUnit].desc}` : '';
  return tg;
}
/* 카드가 떠 있는 시간: 새 메커닉 소개 3초, 어려움·매우 어려움 2.2초, 나머지 1.3초 */
function cardWait(L) {
  const intro = NEW_THING[L] || UNIT_IDS.some((k) => UNITS[k].unlock === L);
  if (intro) return 3000;
  const t = tagOf(L).tag;
  return t === 'hard' || t === 'super' ? 2200 : 1300;
}

/* opts.support: 지원 병력. opts.quick: 카드 없이 바로 달린다(다시 도전·처음부터 다시 — 카드 내용은 짧은 알림으로) */
function startLevel(L, opts = {}) {
  attract = false;
  mode = 'card';
  support = opts.support || 0;
  tutorial = false;
  heroPickFromCard = false;
  $('tut').hidden = true;
  const tg = fillCard(L);
  $('cardGoal').textContent = '준비 중…';
  $('cardHero').hidden = true;
  $('cardGo').hidden = true;
  $('hudL').textContent = L;
  $('bossBar').hidden = true;
  $('bossBar').classList.remove('rage');
  hideEta();
  $('hudBar').style.transform = 'scaleX(0)';
  $('spChips').textContent = '';
  spKey = '';
  hudCache = '';
  pointers.clear();
  activeId = null;
  const token = ++startToken;
  if (opts.quick) {
    sfx.click();
    prepareRun(L);
    begin(L);
    const g = starGoals(par, lv);
    const bits = [`레벨 ${L}`];
    if (tg.label) bits.push(tg.label + (tg.coinMul > 1 ? ` 코인 ${mulText(tg.coinMul)}` : ''));
    bits.push(support ? `지원 +${support}명` : `★★★ ${g.three}명`);
    toast(bits.join(' · '), 1600);
    return;
  }
  show('scrCard');
  armHistory();
  sfx.click();
  const t0 = performance.now();
  setTimeout(() => {
    if (token !== startToken || mode !== 'card') return;
    prepareRun(L);
    const wait = Math.max(0, cardWait(L) - (performance.now() - t0));
    setTimeout(() => { if (token === startToken && mode === 'card') begin(L); }, wait);
  }, 30);
}

/* 레벨·영웅·강화로 이번 판을 준비하고 카드 뒤에 출발 장면을 깐다 */
function prepareRun(L) {
  lv = prepareLevel(L);
  const hero = heroForRun(L);
  const base = START_N + 2 * data.upg.start;
  // worst: 가장 아까운 게이트 { k(몇 번째 줄), m(가장 좋은 다른 칸보다 덜 얻은 병사) }, arenaN: 경기장에 들어설 때 병력(근소한 패배 계산용)
  run = { id: Math.random().toString(36).slice(2, 10), L, start: base + support, fire: data.upg.fire, support, hero, worst: null, arenaN: 0 };
  par = parFor(lv, base, data.upg.fire, hero);
  s = newGame(lv, { start: run.start, fire: run.fire, hero });
  prevZ = s.squad.z;
  renderer.reset();
  const g = starGoals(par, lv);
  $('cardGoal').textContent = support ? `지원 병력 +${support}명 (별 최대 1개)` : `★★★ 목표: 보스를 잡고 ${g.three}명 이상 남기기`;
  const chip = $('cardHero');
  chip.textContent = '';
  if (hero) {
    chip.appendChild(faceEl(hero.id, 1));
    chip.append(` 함께 출격: ${HEROES[hero.id].name} Lv${hero.lv} ▸`);
    chip.hidden = false;
  } else if (L >= UNLOCK.hero && HERO_IDS.some((id) => ownedHero(id))) {
    chip.append('영웅 고르기 ▸');
    chip.hidden = false;
  }
  seen(data, 'biome', biomeOf(L).id);
}

function backToCard() {
  mode = 'card';
  show('scrCard');
  prepareRun(run ? run.L : data.cur);
  $('cardGo').hidden = false;
}

function begin(L) {
  acc = 0;
  mode = 'play';
  resultShown = false;
  anyInput = false;
  skillPressed = false;
  tutorial = L === 1 && !data.tips.moved;
  $('tut').hidden = !tutorial;
  if (tutorial && FINE) $('tutText').textContent = '←/→ 키나 화면 왼쪽·오른쪽을 눌러 이동';
  $('cardGo').hidden = true;
  slowUntil = 0;
  tipQueue.length = 0;
  tipUntil = 0;
  lastSaveT = 0;
  $('tip').hidden = true;
  setSkillFace();
  show(null);
  // 카드가 떠 있을 때부터 누르고 있던 손가락은 그대로 이어서 쓴다
  if (pointers.size) {
    for (const id of pointers.keys()) activeId = id;
    markInput();
  }
  requestWake();
  armHistory();
  data.plays++;
  save(data);
  // 카드가 떠 있는 동안 다른 앱으로 갔으면 멈춘 채로 시작
  if (blurred || document.hidden) pause();
}

function pause() {
  if (mode !== 'play') return;
  // 승리·패배가 정해진 뒤에는 멈추지 않고 결과로 간다(승리를 잃지 않게)
  if (s && (s.phase === 'won' || s.phase === 'lost')) return;
  mode = 'pause';
  pointers.clear();
  activeId = null;
  keys.left = keys.right = false;
  releaseWake();
  saveRunNow();
  renderPauseUnits();
  renderPauseRestart();
  show('scrPause');
}
/* 일시정지의 '처음부터 다시': 첫 게이트를 지났으면 진 판으로 센다고 알리고, 3번째면 지원 받고 다시도 고를 수 있게 */
function renderPauseRestart() {
  const counts = !!(s && lv && restartCounts(s));
  const f = lv ? (data.fails[lv.L] | 0) + (counts ? 1 : 0) : 0;
  const help = counts && !support && f >= 3;
  const note = $('pRestartNote');
  note.hidden = !counts;
  note.textContent = help || support ? '첫 게이트를 지나서 진 판으로 세요' : `첫 게이트를 지나서 진 판으로 세요 · 지원까지 ${Math.max(1, 3 - f)}번`;
  $('pHelp').hidden = !help;
  if (help) {
    const n = supportSize(lv);
    $('pHelp').textContent = `지원 +${n}명 받고 처음부터 (별 1개까지)`;
    $('pHelp').dataset.n = n;
  }
}
function renderPauseUnits() {
  const box = $('pSp');
  box.textContent = '';
  const sp = (s && s.squad.sp) || [];
  box.hidden = !sp.length;
  for (const m of sp) {
    const U = UNITS[m.k];
    if (!U) continue;
    const row = document.createElement('div');
    row.appendChild(iconEl(m.k, 2));
    const t = document.createElement('span');
    t.innerHTML = `<b></b> — `;
    t.querySelector('b').textContent = U.name;
    t.append(U.desc);
    row.appendChild(t);
    box.appendChild(row);
  }
}
function resume() {
  if (mode !== 'pause' || attract || !s) return;
  mode = 'play';
  last = performance.now();
  requestWake();
  armHistory();
  show(null);
}

/* ---------- 이어하기 ---------- */
function saveRunNow() {
  if (!s || !run || attract || !(s.phase === 'run' || s.phase === 'arena')) return;
  saveRun({ v: 1, sim: SIM, id: run.id, at: Date.now(), L: run.L, attempt: lv.attempt, start: run.start, fire: run.fire, support: run.support, hero: run.hero, par, worst: run.worst || null, arenaN: run.arenaN | 0, state: snapshot(s) });
  lastSaveT = s.t;
}
function resumeRun() {
  if (modalOpen()) return;
  const r = pendingRun();
  if (!r) { renderTitle(); return; }
  const level = prepareLevel(r.L);
  const st = restore(r.state);
  if (level.attempt !== r.attempt || !st) {
    clearRun();
    toast('게임이 바뀌어서 하던 판은 처음부터 다시 해요', 3000);
    renderTitle();
    return;
  }
  attract = false;
  lv = level;
  s = st;
  run = { id: r.id, L: r.L, start: r.start, fire: r.fire, support: r.support | 0, hero: r.hero || null, worst: r.worst && r.worst.k ? r.worst : null, arenaN: r.arenaN | 0 };
  support = run.support;
  par = r.par || lv.par;
  prevZ = s.squad.z;
  acc = 0;
  renderer.reset();
  resultShown = false;
  anyInput = true;
  tutorial = false;
  lastSaveT = s.t;
  $('hudL').textContent = r.L;
  $('bossBar').hidden = !s.boss;
  $('bossBar').classList.toggle('rage', !!(s.boss && s.boss.enraged));
  hideEta();
  spKey = '';
  hudCache = '';
  setSkillFace();
  data.stats.resumes++;
  save(data);
  // 멈춘 채로 시작 — 준비되면 계속하기
  mode = 'pause';
  renderPauseUnits();
  renderPauseRestart();
  show('scrPause');
  toast('준비되면 계속하기를 누르세요');
}

/* ---------- 안내 ---------- */
const tipQueue = [];
let tipUntil = 0;
let tipKey = '';
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
  if (t.key === 'heroReady' && s && s.hero && (s.hero.charge < 1 || s.hero.act > 0)) return;   // 그새 써 버렸다 — 다음에 다시
  tipKey = t.key;
  data.tips[t.key] = 1;
  save(data);
  el.textContent = t.text;
  el.classList.add('low');   // 분대 아래 빈 길 위 — 다가오는 게이트를 가리지 않는다
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
    tip('gate', '큰 숫자 게이트로! 쏘면 숫자가 올라가요');
    if (row.cells.some((c) => c.op === 'mul')) tip('mul', '×는 병력이 많을수록 유리해요');
    if (row.cells.some((c) => c.op === 'div')) tip('div', '÷2는 병력이 반으로 줄어요');
    if (row.cells.some((c) => c.op === 'unit')) tip('unitGate', '금색 게이트: 숫자만큼 병사가 늘고 특수병이 합류해요');
    if (row.cells.length === 1) tip('shoot', '길을 막은 마이너스 게이트! 쏴서 플러스로 바꾸세요');
  }
  for (const p of s.props) {
    if (!p.alive || p.passed || p.z - q.z > 32) continue;
    if (p.key === true) tip('key', '열쇠 표시 상자: 다음 난관을 넘을 보급이에요. 꼭 쏴서 부수세요!');
    if (p.kind === 'wall') tip('wall', '벽의 숫자는 체력이에요. 약한 벽을 쏴서 뚫고 지나가세요');
    else if (p.kind === 'cage') tip('cage', '철창을 쏴서 부수면 갇힌 특수병이 합류해요');
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
        endTutorial();   // 첫 게이트를 지나면 손대지 않았어도 느린 진행을 끝낸다
        noteGate(e);
        break;
      case 'kill': sfx.kill(); seen(data, 'foe', e.kind); break;
      case 'bite': sfx.hurt(); break;
      case 'loss':
        if (e.cause === 'saw') sfx.blade();
        if (e.n >= 10) vibe(25);
        break;
      case 'wallBreak': sfx.crate(); break;
      case 'wallCrash': sfx.stomp(); vibe(40); break;
      case 'crate': if (e.type === 'gun') sfx.power(); else if (e.type === 'coin') sfx.coin(); else sfx.crate(); break;
      case 'cageOpen': sfx.crate(); break;
      case 'spGet':
        sfx.join();
        vibe(20);
        if (UNITS[e.k]) tip('sp-' + e.k, UNITS[e.k].tip);
        seen(data, 'unit', e.k);
        break;
      case 'spFull': {
        sfx.coin();
        const sp = s.squad.sp;
        const why = sp.some((m) => m.k === e.k) ? '같은 특수병이 이미 있어서' : sp.length >= 3 ? '특수병 자리(3명)가 꽉 차서' : '병사가 적어서';
        toast(`${why} 병사 +${e.n}명이 대신 왔어요`, 1800);
        break;
      }
      case 'spLose': {
        sfx.leave();
        const nm = UNITS[e.k] ? UNITS[e.k].name : '특수병';
        if (e.cause === 'escort') { toast(`병사가 너무 적어서 ${nm}이 떠났어요`, 1400); tip('escort', '특수병 1명마다 병사가 4명은 있어야 함께해요'); }
        else { toast(`${nm}이 쓰러졌어요`, 1400); tip('spHit', '크게 맞거나 내려찍기에 맞으면 특수병이 쓰러져요'); }
        break;
      }
      case 'snipe': sfx.snipe(); break;
      case 'rocket': sfx.rocket(); break;
      case 'boom': sfx.boom(); vibe(15); break;
      case 'heal': sfx.heal(); break;
      case 'heroReady':
        sfx.ready();
        if (!data.set.autoSkill && s.hero && HEROES[s.hero.id]) {
          const H = HEROES[s.hero.id];
          tip('heroReady', `${H.skill.name} 준비! ${FINE ? 'Space 키나 ' : ''}아래 가운데 버튼: ${H.skill.text(s.hero.lv)}`);
        }
        break;
      case 'heroCast':
        sfx.cast(); vibe([20, 30, 20]); seen(data, 'hero', e.id); slow(0.35, 300);
        if (tipKey === 'heroReady' && !$('tip').hidden) { $('tip').hidden = true; tipUntil = 0; }
        break;
      case 'spitFire': tip('spit', '땅에 초록 표시가 보이면 옆으로 피하세요'); break;
      case 'spitHit': if (e.hit) { sfx.hurt(); vibe(30); } break;
      case 'boss':
        sfx.bossIn();
        $('bossBar').hidden = false;
        if (run) run.arenaN = s.squad.n;
        tip('boss', '빨간 구역을 피하면서 보스를 쏘세요!');
        slow(0.45, 700);
        saveRunNow();
        updateMusic();
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

/* 가장 아까운 게이트: 같은 줄의 가장 좋은 다른 칸보다 20% 이상(2명 이상) 덜 얻은 줄 중 차이가 가장 큰 것 */
function noteGate(e) {
  if (!run || !s) return;
  const row = s.rows.find((r) => r.id === e.row);
  const g = gateAlts(row, e);
  if (!g || !g.worth) return;
  if (!run.worst || g.gap > run.worst.m) run.worst = { k: rowOrdinal(s.rows, row), m: g.gap };
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
  hideEta();
  const won = s.phase === 'won';
  const L = lv.L;
  const n = s.squad.n;
  // 다른 탭이 이미 정산(또는 포기)한 판이면 결과만 보여 주고 보상은 다시 주지 않는다
  if (storageMode() === 'ok') { const fresh = load(); if (!fresh.corrupt) data = fresh; }
  const paid = !(run && data.lastRunId === run.id);
  const stars = won ? (support ? 1 : starsFor(par, n, true, lv)) : 0;
  const prevStars = data.stars[L] | 0;
  let coins = paid ? coinsFor(lv, s, won, stars, 10 * data.upg.coin) : 0;
  const newStars = paid ? Math.max(0, stars - prevStars) : 0;
  coins += newStars * 20;
  data.coins += coins;
  const before = new Set(HERO_IDS.filter((id) => ownedHero(id)));
  if (!paid) { /* 이미 정산된 판 */ }
  else if (won) {
    data.stars[L] = Math.max(prevStars, stars);
    data.best[L] = Math.max(data.best[L] | 0, n);
    data.maxL = Math.max(data.maxL, L + 1);
    data.cur = Math.max(data.cur, L + 1);   // 지난 레벨을 다시 해도 '이어하기'는 앞으로만
    data.fails[L] = 0;
    data.stats.wins++;
    data.stats.bossKills++;
    if (data.stats.wins === 1 && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } else {
    data.fails[L] = (data.fails[L] | 0) + 1;
  }
  if (paid) {
    data.stats.kills += s.stats.kills;
    data.stats.maxN = Math.max(data.stats.maxN, s.squad.peak);
    data.stats.spGot += s.stats.spGot;
    data.stats.heroUses += s.stats.heroUses;
  }
  // 진행으로 새 영웅이 합류했는지
  for (const id of heroesEarned(data.maxL, totalStars(data))) if (!data.heroes.lv[id]) data.heroes.lv[id] = 1;
  if (!data.heroes.sel) data.heroes.sel = HERO_IDS.find((id) => ownedHero(id)) || '';
  const joined = HERO_IDS.filter((id) => ownedHero(id) && !before.has(id));
  if (anyInput && L === 1) data.tips.moved = 1;
  tutorial = false;
  $('tut').hidden = true;
  // 정산 → 판 번호 기록 → 저장 → 이어하기 지우기(같은 판을 두 번 정산하지 않게)
  data.lastRunId = run ? run.id : '';
  save(data);
  clearRun();

  $('resTitle').textContent = won ? '승리!' : '전멸';
  $('scrResult').classList.toggle('lost', !won);
  const starEls = $('resStars').children;
  for (let i = 0; i < 3; i++) {
    starEls[i].className = '';
    if (i < stars) setTimeout(() => { starEls[i].className = 'on'; sfx.coin(); }, 350 + i * 300);
  }
  $('resStars').hidden = !won;
  const g = starGoals(par, lv);
  const tg = tagOf(L);
  const lines = [];
  if (won) {
    lines.push(['남은 병력', `${n}명`]);
    lines.push(['★★★ 기준', `${g.three}명`]);
    if (support) lines.push(['지원 병력 사용', '별 최대 1개']);
    if (s.squad.sp.length) lines.push(['살아남은 특수병', `${s.squad.sp.length}명 · +${3 * s.squad.sp.length}코인`]);
    // 별을 다 못 받았으면 어디서 놓쳤는지 한 줄
    if (stars < 3 && !support && run && run.worst) lines.push(['가장 아까운 게이트', `${run.worst.k}번째 줄 −${run.worst.m}명`]);
  } else if (!s.boss) {
    lines.push(['진행', `${Math.round(progress(s) * 100)}%`]);
  }
  lines.push(['처치', `${s.stats.kills}`]);
  lines.push(['획득 코인', `+${coins}` + (tg.coinMul > 1 ? ` (${tg.label} ${mulText(tg.coinMul)})` : '')]);
  if (joined.length) lines.push(['새 영웅 합류', joined.map((id) => HEROES[id].name).join(', ')]);
  $('resStats').innerHTML = lines.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
  renderNear(won);
  const cause = !won && !anyInput
    ? ['한 번도 움직이지 않았어요', FINE ? '←/→ 키로 큰 숫자 게이트 쪽으로 가세요' : '화면 왼쪽·오른쪽을 꾹 눌러 큰 숫자 게이트로 가세요']
    : CAUSE[s.cause] || CAUSE.foe;
  $('resCause').hidden = won;
  $('resCause').innerHTML = won ? '' : `<b>${cause[0]}</b><span>${cause[1]}</span>`;
  // 레벨은 그 무렵 흔한 강화를 단 사람에 맞춰 두었다 — 강화가 모자라서 졌을 수 있으면 알려 준다
  const gg = won ? null : gearGap(data, L, UPGRADES);
  const affordable = canAffordUpg();
  if (gg && gg.below.length && affordable) {
    const tip = document.createElement('span');
    tip.className = 'gear-tip';
    tip.textContent = `${gg.below.join('·')} 강화가 이 레벨 권장보다 낮아요. 강화하고 다시 하면 훨씬 수월해요.`;
    $('resCause').appendChild(tip);
  }
  $('resPrimary').textContent = won ? '다음 레벨' : '다시 도전';
  const helpN = supportSize(lv);
  const offerHelp = !won && (data.fails[L] | 0) >= 3;
  $('resHelp').hidden = !offerHelp;
  $('resHelp').textContent = `지원 +${helpN}명 받고 다시 (별 1개까지)`;
  $('resHelp').dataset.n = helpN;
  $('resBackup').hidden = storageMode() === 'ok';
  $('resUpg').classList.toggle('glow', affordable);
  $('hudCoins').textContent = compact(data.coins);
  hudCache = '';
  show('scrResult');
}

/* 진 판(또는 별을 다 못 받은 판)에서 '조금만 더' 보여 주기: 보스 남은 체력 막대, 몇 명만 더 있었으면, 가장 아까운 게이트 */
function renderNear(won) {
  const box = $('resNear');
  box.textContent = '';
  box.hidden = true;
  if (won) return;
  const nm = nearMiss(s, run ? run.arenaN : 0);
  const rows = [];
  if (nm && nm.pct > 0) {
    const bar = document.createElement('div');
    bar.className = 'near-boss';
    bar.innerHTML = '<span>보스 체력</span><div class="bar"><i></i></div><b></b>';
    bar.querySelector('i').style.transform = `scaleX(${nm.left.toFixed(3)})`;
    bar.querySelector('b').textContent = `${nm.pct}% 남음`;
    bar.setAttribute('aria-label', `보스 체력 ${nm.pct}% 남음`);
    box.appendChild(bar);
    // 반 넘게 깎았을 때만(멀리 못 미친 판에 큰 숫자를 들이밀지 않게)
    if (nm.more && nm.left <= 0.5) rows.push(['near-more', `${nm.more}명만 더 있었으면 잡았어요!`]);
  }
  if (run && run.worst) rows.push(['near-gate', `가장 아까운 게이트: ${run.worst.k}번째 줄 −${run.worst.m}명`]);
  for (const [cls, text] of rows) {
    const p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    box.appendChild(p);
  }
  box.hidden = !box.childNodes.length;
}
/* 지금 살 수 있는 강화가 있나(진행 상한 안에서) */
function canAffordUpg() {
  let cheapest = Infinity;
  for (const u of UPGRADES) {
    const st = upgState(data, u, undefined, STORE);
    if (st.canBuy) cheapest = Math.min(cheapest, upgCost(st.lv));
  }
  return data.coins >= cheapest;
}

/* ---------- 영웅 버튼·특수병 칩 ---------- */
function setSkillFace() {
  const face = $('skillFace');
  face.textContent = '';
  skillState = '';   // 다음 갱신에서 글자·모양을 다시 맞춘다
  if (s && s.hero) {
    face.appendChild(faceEl(s.hero.id, 3));
    $('skillLbl').textContent = HEROES[s.hero.id].skill.name;
  }
}
let skillState = '';
let spKey = '';
function updateHeroUi() {
  const btn = $('skillBtn');
  const h = s && s.hero;
  if (!h || mode !== 'play') return;
  const st = h.act > 0 ? 'active' : h.charge >= 1 ? 'ready' : 'charge';
  const p = h.act > 0 ? h.act / (h.T || 1) : h.charge;
  btn.style.setProperty('--p', p.toFixed(3));
  if (st !== skillState) {
    skillState = st;
    btn.classList.toggle('ready', st === 'ready');
    btn.classList.toggle('active', st === 'active');
    $('skillLbl').textContent = st === 'ready' ? '준비!' : st === 'active' ? '발동 중' : HEROES[h.id].skill.name;
  }
}
function updateSpChips() {
  const sp = (s && s.squad.sp) || [];
  const key = sp.map((m) => m.k).join(',');
  if (key === spKey) return;
  spKey = key;
  document.body.classList.toggle('has-sp', sp.length > 0);
  const box = $('spChips');
  box.textContent = '';
  for (const m of sp) {
    const chip = document.createElement('span');
    chip.className = 'sp-chip';
    chip.appendChild(iconEl(m.k, 2));
    chip.append(UNITS[m.k] ? UNITS[m.k].name : m.k);
    box.appendChild(chip);
  }
}

/* ---------- 배경 음악 ---------- */
function updateMusic() {
  if (!music) return;
  // 일시정지에서 연 설정·백업 화면은 판 음악을 그대로, 카드는 늘 출발 곡(뒤의 시연 상태를 보지 않는다)
  const fromRun = (mode === 'set' && $('setBack').dataset.back === 'pause') || (mode === 'backup' && $('setBack').dataset.back === 'pause' && $('bkBack').dataset.back === 'set');
  const inRun = mode === 'play' || mode === 'pause' || fromRun;
  const want = mode === 'card' ? 'run' : inRun ? (s && s.boss && s.boss.hp > 0 ? 'boss' : 'run') : 'title';
  if (music.current !== want) music.play(want);
}
whenAudio((ctx, bus) => {
  music = createMusic(ctx, bus);
  music.setOn(data.set.music);
  updateMusic();
});

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
        skillPressed = false;
        handleEvents(s.ev);
        acc -= DT;
        n++;
      }
      if (n === 5) acc = 0;
      if (attract && (s.phase === 'won' || s.phase === 'lost') && s.endT > 3) {
        s = newGame(lv, { start: START_N + 2 * data.upg.start, fire: data.upg.fire, hero: heroForRun(lv.L) });
        prevZ = s.squad.z;
        renderer.reset();
      }
      if (mode === 'play') {
        watchTips();
        if ((s.phase === 'run' || s.phase === 'arena') && s.t - lastSaveT >= 3 && s.t > 2) saveRunNow();
        if ((s.phase === 'won' && s.endT > 1.6) || (s.phase === 'lost' && s.endT > 1.2)) finish();
      }
    }
    renderer.draw(s, Math.min(1, acc / DT), dtReal, prevZ);
    if (mode === 'play' || mode === 'pause') { updateHud(); updateHeroUi(); updateSpChips(); }
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
      if (avg > 0.024) { autoLow = true; applySettings(); toast('느려서 저사양 모드로 바꿨어요 · 설정에서 끌 수 있어요', 3000); }
    }
  }
}

/* 상태가 아직 없을 때 그릴 빈 길 */
const idleState = { t: 0, L: 1, squad: { x: 0, z: 0, vz: 0, n: 0, tier: 0, sp: [] }, rows: [], props: [], saws: [], foes: [], spits: [], bullets: [], rockets: [], boss: null, hero: null, phase: 'run' };

let hudCache = '';
function updateHud() {
  const p = s.boss ? 1 : progress(s);
  $('hudBar').style.transform = `scaleX(${p})`;
  const key = `${data.coins + s.stats.coins}`;
  if (key !== hudCache) { hudCache = key; $('hudCoins').textContent = key; }
  if (s.boss) $('bossFill').style.transform = `scaleX(${Math.max(0, s.boss.hp) / s.boss.max})`;
  updateEta();
}

/* 보스전: 보스 막대 줄 끝에 '닿기까지 n초'(막대 앞의 '보스'와 이어 읽힌다 — 막대·특수병 칩·다가오는 보스를 가리지 않게).
   3초 이하면 빨갛게 깜빡이고, 맞붙으면 '맞붙었어요!' */
let etaKey = '';
function updateEta() {
  const el = $('bossEta');
  let k = '';
  let text = '';
  let label = '';
  if (s && s.boss && s.boss.hp > 0 && s.phase === 'arena') {
    const eta = bossEtaOf(s);
    if (eta != null) {
      const n = Math.max(0, Math.ceil(eta - 1e-6));
      k = (n <= 3 ? 'soon:' : 'far:') + n;
      text = `닿기까지 ${n}초`;
      label = `보스가 닿기까지 ${n}초`;
    } else if (bossClash(s)) {
      k = 'clash';
      text = '맞붙었어요!';
      label = '보스와 맞붙었어요. 계속 쏘세요';
    }
  }
  if (k === etaKey) return;
  etaKey = k;
  el.hidden = !k;
  if (!k) return;
  $('bossEtaT').textContent = text;
  el.setAttribute('aria-label', label);
  el.classList.toggle('soon', k.startsWith('soon'));
  el.classList.toggle('clash', k === 'clash');
}
function hideEta() {
  etaKey = '';
  $('bossEta').hidden = true;
}

/* ---------- 화면 크기 ---------- */
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.resize(w, h, window.devicePixelRatio || 1);
  // '세로로 돌려 주세요'가 떠 있는 동안 판은 멈춘다
  if (mode === 'play' && getComputedStyle($('rotate')).display !== 'none') pause();
  if (renderer.setHudTarget) {
    const r = $('hudCoins').getBoundingClientRect();
    renderer.setHudTarget(r.width ? r.left + 10 : w - 90, r.height ? r.top + r.height / 2 : 26);
  }
}
window.addEventListener('resize', resize);
(function watchDpr() {
  if (typeof matchMedia !== 'function') return;
  try {
    matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener('change', () => { resize(); watchDpr(); }, { once: true });
  } catch { /* 옛 브라우저 */ }
})();

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
on('btnPlay', () => tryStart(data.cur));
on('btnLevels', () => { sfx.click(); mode = 'levels'; renderLevels(); show('scrLevels'); armHistory(); });
on('btnHero', () => { sfx.click(); mode = 'hero'; heroPickFromCard = false; heroView = data.heroes.sel; renderHero(); show('scrHero'); armHistory(); });
on('btnUpg', () => { sfx.click(); mode = 'upg'; renderUpg(); show('scrUpg'); armHistory(); });
on('btnSet', () => { sfx.click(); mode = 'set'; renderSet(); show('scrSet'); armHistory(); });
for (const b of document.querySelectorAll('[data-back]')) {
  b.addEventListener('click', () => {
    sfx.click();
    const to = b.dataset.back;
    if (to === 'pause') { mode = 'pause'; show('scrPause'); return; }
    if (to === 'result') { mode = 'result'; show('scrResult'); return; }
    if (to === 'set') { mode = 'set'; renderSet(); show('scrSet'); return; }
    if (to === 'card') { heroPickFromCard = false; backToCard(); return; }
    goTitle();
  });
}
on('btnPause', () => { sfx.click(); pause(); });
on('skillBtn', () => pressSkill());
function pressSkill() {
  if (mode !== 'play') return;
  const h = s && s.hero;
  if (h && h.charge < 1 && h.act <= 0) {
    sfx.deny();
    const btn = $('skillBtn');
    btn.classList.remove('nope');
    void btn.offsetWidth;
    btn.classList.add('nope');
    tip('skillWait', '주황 고리가 다 차면 쓸 수 있어요');
    return;
  }
  skillPressed = true;
}
on('pResume', () => { sfx.click(); resume(); });
/* 처음부터 다시(일시정지): 카드 없이 바로. 첫 게이트를 지난 뒤면 진 판으로 센다(3번이면 지원) — 그 전에는 공짜 */
function restartRun(opts = {}) {
  if (!lv) return;
  if (run && s && !attract && restartCounts(s) && data.lastRunId !== run.id) {
    data.fails[lv.L] = (data.fails[lv.L] | 0) + 1;
    data.lastRunId = run.id;
    save(data);
  }
  clearRun();
  startLevel(lv.L, { support: opts.support ?? support, quick: true });
}
on('pRestart', () => restartRun());
on('pHelp', () => restartRun({ support: Number($('pHelp').dataset.n) || 0 }));
on('pSet', () => { sfx.click(); mode = 'set'; $('setBack').dataset.back = 'pause'; renderSet(); show('scrSet'); armHistory(); });
on('pSaveQuit', () => {
  sfx.click();
  saveRunNow();
  toast(storageMode() === 'ok' ? '저장했어요. 타이틀에서 이어 할 수 있어요.' : '저장이 꺼져 있어서 이 창을 닫으면 사라져요', 2600);
  goTitle();
});
on('resPrimary', () => {
  const won = s.phase === 'won';
  const next = won ? lv.L + 1 : lv.L;
  // 다시 도전은 카드 없이 바로 달린다(카드 내용은 짧은 알림으로)
  const opts = won ? {} : { quick: true };
  const id = newlyEarned()[0];
  if (id) { sfx.click(); joinAfter = () => tryStart(next, opts); openJoin(id); return; }
  tryStart(next, opts);
});
on('resHelp', () => tryStart(lv.L, { support: Number($('resHelp').dataset.n) || 0, quick: true }));
on('resUpg', () => { sfx.click(); mode = 'upg'; renderUpg(); show('scrUpg'); $('upgBack').dataset.back = 'result'; });
on('resMenu', () => { sfx.click(); goTitle(); });
on('resBackup', () => { sfx.click(); $('bkBack').dataset.back = 'result'; openBackup('make'); });
on('resumeGo', () => { sfx.click(); resumeRun(); });
on('resumeDrop', () => { sfx.click(); $('resumeConfirm').hidden = false; });
on('resumeDropNo', () => { sfx.click(); $('resumeConfirm').hidden = true; });
on('resumeDropYes', () => { sfx.click(); const r = pendingRun(); if (r) abandonRun(r); renderTitle(); });
// 영웅 칩에 손가락이 닿으면 자동 출발을 멈추고 출격 버튼을 보인다(떼기 전에 출발해 버리지 않게)
$('cardHero').addEventListener('pointerdown', () => { if (mode !== 'card') return; startToken++; $('cardGo').hidden = false; });
on('cardHero', () => {
  sfx.click();
  startToken++;          // 자동 출발을 멈춘다
  heroPickFromCard = true;
  heroView = data.heroes.sel;
  mode = 'hero';
  $('heroBack').dataset.back = 'card';
  renderHero();
  show('scrHero');
  armHistory();
});
on('cardGo', () => { if (mode === 'card') begin(run ? run.L : data.cur); });
on('joinTake', () => { sfx.click(); closeJoin(true); });
on('joinLater', () => { sfx.click(); closeJoin(false); });
on('storeChip', () => {
  const full = storageMode() === 'full';
  notice(full ? '저장 공간이 가득 찼어요' : '저장이 꺼져 있어요',
    full ? '기기 저장 공간이 모자라 진행을 저장하지 못하고 있어요. 창을 닫으면 최근 진행이 사라질 수 있으니 백업 코드를 만들어 두세요.'
      : '지금 이 브라우저는 저장을 막고 있어요(사생활 보호 모드 등). 창을 닫으면 진행이 사라져요. 백업 코드를 만들어 두면 나중에 되살릴 수 있어요.', [
      { label: '백업 코드 만들기', primary: true, fn: () => { $('bkBack').dataset.back = 'title'; openBackup('make'); } },
      { label: '괜찮아요' },
    ]);
});
on('bkMake', () => { sfx.click(); $('bkBack').dataset.back = 'set'; openBackup('make'); });
on('bkEnter', () => { sfx.click(); $('bkBack').dataset.back = 'set'; openBackup('enter'); });
on('bkUndo', () => {
  notice('이전 진행으로 되돌릴까요?', '백업 코드를 넣거나 초기화하기 직전의 진행으로 돌아가요. 지금 진행은 다시 되돌릴 수 있게 보관돼요.', [
    { label: '되돌리기', primary: true, fn: undoImport },
    { label: '취소' },
  ]);
});
on('bkCopy', async () => { if (/^SQD/.test($('bkCode').value) && await copyText($('bkCode').value, $('bkCode'))) markBackedUp(); });
on('bkShare', async () => { try { await navigator.share({ title: '숫자부대 돌격 백업 코드', text: $('bkCode').value }); markBackedUp(); } catch { /* 무시 */ } });
on('bkCheck', () => { sfx.click(); checkImport(); });
on('bkApply', () => { sfx.click(); applyImport(); });
on('resetAsk', () => { sfx.click(); $('resetAsk').hidden = true; $('resetConfirm').hidden = false; });
on('resetNo', () => { sfx.click(); $('resetAsk').hidden = false; $('resetConfirm').hidden = true; });
on('resetYes', () => {
  keepBackup(data);
  data = wipe();
  clearRun();
  save(data);
  applySettings();
  sfx.click();
  toast('초기화했어요. 설정의 되돌리기로 한 번은 살릴 수 있어요.', 3000);
  goTitle();
});

/* ---------- 시작 ---------- */
function start(hotData) {
  // HUD의 보스 표시도 도트 아이콘으로(글꼴마다 ☠ 모양이 다르다)
  try { const sk = document.querySelector('#hud .skull'); const ic = renderer.icon && renderer.icon('skull', 2); if (sk && ic) { ic.classList.add('pix'); sk.replaceChildren(ic); } } catch { /* 글자 그대로 */ }
  if (hotData && hotData.save) data = normalize({ ...data, ...hotData.save });
  if (hotData && hotData.run && !loadRun()) saveRun(hotData.run);
  applySettings();
  resize();
  // 규칙(SIM)이 바뀌기 전에 저장한 판은 이어 할 수 없다 — 조용히 사라지지 않게 알린다(진 판으로 세지 않는다)
  const oldRun = loadRun();
  const dropped = oldRun && oldRun.sim !== SIM && oldRun.id !== data.lastRunId ? oldRun : null;
  if (dropped) clearRun();
  goTitle();
  if (dropped) toast(`게임이 업데이트돼서 하던 판(레벨 ${dropped.L})은 처음부터 다시 해요`, 3600);
  // 난이도 개편 뒤 처음 열었을 때 한 번: 기존 플레이어에게 무엇이 바뀌었는지
  // (영웅 합류 안내 다음 차례에 — nextJoinNotice)
  if (hasTags() && (data.seenSim | 0) < SIM) {
    if (!data.corrupt && data.maxL > 1 && !(data.v > SAVE_V)) balanceNote = true;
    else { data.seenSim = SIM; save(data); }
  }
  if (data.corrupt) {
    notice('저장을 읽지 못했어요', '저장된 진행이 손상되어 새로 시작했어요. 백업 코드가 있으면 설정 → 데이터 → 백업 코드 넣기로 되살릴 수 있어요.', [{ label: '알겠어요', primary: true }]);
  } else if (data.v > SAVE_V) {
    notice('새 버전에서 저장된 진행이에요', '새로고침하면 게임이 업데이트돼요. 지금 화면에서 저장하면 일부 기록이 빠질 수 있어요.', [{ label: '알겠어요', primary: true }]);
  }
  last = performance.now();
  requestAnimationFrame(frame);
}

const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === 'function') {
  try { hot.snapshot(() => ({ save: data, run: loadRun() })); } catch { /* 무시 */ }
}
const fontsReady = document.fonts && document.fonts.load ? Promise.race([
  Promise.all([document.fonts.load('40px "Jua"'), document.fonts.ready, renderer.ready || Promise.resolve()]),
  new Promise((r) => setTimeout(r, 1500)),
]).catch(() => {}) : Promise.resolve();
fontsReady.then(() => {
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
});

/* 테스트·디버그용 */
window.__squad = {
  auto: false, get state() { return s; }, set state(v) { s = v; }, get mode() { return mode; }, get data() { return data; },
  startLevel, radius, UNLOCK, skill() { skillPressed = true; },
};

/* 오프라인 캐시(GitHub Pages에서만 — 미리보기 창 등에서는 조용히 넘어간다) */
if ('serviceWorker' in navigator && location.protocol === 'https:' && /\/squad\/?(index\.html)?$/.test(location.pathname)) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
