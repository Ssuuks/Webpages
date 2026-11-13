/* 효과음 — 파일 없이 WebAudio로 합성한다.
   브라우저 정책상 첫 터치·클릭 뒤에 unlock()을 불러야 소리가 난다. 실패해도 게임은 그대로 돈다. */
let ctx = null;
let master = null;
let bus = null;          // 효과음과 음악이 함께 지나는 압축기
let verb = null;         // 울림(큰 효과음 — 보스·파워업 — 만 보낸다)
const onReady = [];
let noiseBuf = null;
let enabled = true;
const lastAt = Object.create(null);

export function setSoundOn(on) {
  enabled = !!on;
  if (master) master.gain.setTargetAtTime(enabled ? 0.55 : 0, ctx.currentTime, 0.02);
}

export function unlock() {
  try {
    if (ctx) { if (ctx.state !== 'running') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.55 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp);
    comp.connect(ctx.destination);
    bus = comp;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    try {
      // 울림: 잦아드는 잡음으로 만든 짧은 공간(1.3초). 못 만드는 환경이면 울림 없이
      const len = Math.floor(ctx.sampleRate * 1.3);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const a = ir.getChannelData(c);
        for (let i = 0; i < len; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      const cv = ctx.createConvolver();
      cv.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      cv.connect(wet);
      wet.connect(master);
      verb = cv;
    } catch { verb = null; }
    for (const fn of onReady.splice(0)) { try { fn(ctx, bus); } catch { /* 무시 */ } }
  } catch { ctx = null; }
}

/* 오디오가 준비되면(첫 터치 뒤) 불린다 — 배경 음악이 같은 출력에 붙는다 */
export function whenAudio(fn) {
  if (ctx && bus) fn(ctx, bus);
  else onReady.push(fn);
}

/* 탭이 가려지면 소리를 멈춘다 */
export function suspend() { try { if (ctx && ctx.state === 'running') ctx.suspend(); } catch { /* 무시 */ } }

function ready(name, gapMs) {
  if (!ctx || !enabled || ctx.state !== 'running') return false;
  const now = performance.now();
  if (gapMs && lastAt[name] && now - lastAt[name] < gapMs) return false;
  lastAt[name] = now;
  return true;
}

function tone(freq, dur, { type = 'square', vol = 0.15, slide = 0, delay = 0, attack = 0.004, rev = 0, vib = 0 } = {}) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (vib) {
    // 떨림(으르렁·경보): vib Hz로 음 높이를 ±12% 흔든다
    const l = ctx.createOscillator();
    const lg = ctx.createGain();
    l.frequency.value = vib;
    lg.gain.value = freq * 0.12;
    l.connect(lg); lg.connect(o.frequency);
    l.start(t); l.stop(t + dur + 0.02);
  }
  o.connect(g);
  g.connect(master);
  if (rev && verb) send(g, rev);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function send(node, amt) {
  const w = ctx.createGain();
  w.gain.value = amt;
  node.connect(w);
  w.connect(verb);
}

function noise(dur, { vol = 0.2, freq = 1200, q = 0.8, kind = 'bandpass', delay = 0, slide = 0, rev = 0 } = {}) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = kind;
  f.frequency.setValueAtTime(freq, t);
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  if (rev && verb) send(g, rev);
  s.start(t, Math.random() * 0.3);
  s.stop(t + dur + 0.02);
}

export const sfx = {
  /* 총소리는 무기 단계마다 다르다: 0 딱총 → 1 묵직 → 2 레이저 → 3 굵은 레이저 → 4 전기 */
  shot(tier = 0) {
    if (!ready('shot', 55)) return;
    const j = Math.random() * 40;
    if (tier <= 0) {
      noise(0.05, { vol: 0.09, freq: 2600, q: 0.6, kind: 'highpass' });
      tone(180 + j, 0.05, { type: 'square', vol: 0.03, slide: 0.5 });
    } else if (tier === 1) {
      noise(0.06, { vol: 0.09, freq: 1900, q: 0.6, kind: 'highpass' });
      tone(150 + j, 0.07, { type: 'square', vol: 0.045, slide: 0.45 });
    } else if (tier === 2) {
      noise(0.04, { vol: 0.06, freq: 3200, q: 0.6, kind: 'highpass' });
      tone(1250 + j * 4, 0.08, { type: 'sine', vol: 0.05, slide: 0.3 });
      tone(160, 0.06, { type: 'triangle', vol: 0.05, slide: 0.5 });
    } else if (tier === 3) {
      noise(0.05, { vol: 0.06, freq: 2400, q: 0.6, kind: 'highpass' });
      tone(1600 + j * 5, 0.1, { type: 'sawtooth', vol: 0.03, slide: 0.22 });
      tone(120, 0.08, { type: 'triangle', vol: 0.07, slide: 0.5 });
    } else {
      noise(0.07, { vol: 0.07, freq: 4200, q: 2.5 });
      tone(2000 + j * 8, 0.09, { type: 'square', vol: 0.022, slide: 0.18 });
      tone(100, 0.1, { type: 'triangle', vol: 0.08, slide: 0.5 });
    }
  },
  hit() {
    if (!ready('hit', 40)) return;
    noise(0.06, { vol: 0.08, freq: 700, q: 1.2 });
  },
  kill() {
    if (!ready('kill', 50)) return;
    noise(0.12, { vol: 0.14, freq: 420, q: 1.5, slide: 0.5 });
    tone(120, 0.1, { type: 'triangle', vol: 0.08, slide: 0.6 });
  },
  gateTick() {
    if (!ready('gateTick', 45)) return;
    tone(900 + Math.random() * 200, 0.04, { type: 'sine', vol: 0.05 });
  },
  gateGood(big) {
    if (!ready('gate', 80)) return;
    const notes = big ? [523, 659, 784, 1047] : [523, 659, 784];
    notes.forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.16, delay: i * 0.055 }));
  },
  gateBad() {
    if (!ready('gate', 80)) return;
    tone(330, 0.32, { type: 'sawtooth', vol: 0.12, slide: 0.45 });
    tone(220, 0.32, { type: 'square', vol: 0.06, slide: 0.45, delay: 0.04 });
  },
  crate() {
    if (!ready('crate', 60)) return;
    noise(0.18, { vol: 0.2, freq: 900, q: 0.7, slide: 0.4 });
    tone(784, 0.12, { type: 'triangle', vol: 0.12, delay: 0.06 });
    tone(1175, 0.18, { type: 'triangle', vol: 0.12, delay: 0.12 });
  },
  /* 무기 강화: 쿵(저음) + 위로 쓸어 올리는 바람 + 올라가는 화음 — 단계가 높을수록 높고 길다 */
  power(tier = 1) {
    if (!ready('power', 100)) return;
    const k = Math.pow(2, Math.min(4, Math.max(0, tier - 1)) / 12 * 2);   // 단계마다 온음씩 위
    tone(90, 0.28, { type: 'sine', vol: 0.3, slide: 0.45 });
    noise(0.4, { vol: 0.09, freq: 700, q: 0.8, slide: 7, rev: 0.4 });
    [392, 523, 659, 784, 1047].forEach((f, i) => {
      tone(f * k, 0.14, { type: 'square', vol: 0.065, delay: 0.05 + i * 0.05 });
      tone(f * k * 2, 0.1, { type: 'triangle', vol: 0.04, delay: 0.05 + i * 0.05 });
    });
    [523, 659, 784].forEach((f) => tone(f * k * 2, 0.5, { type: 'triangle', vol: 0.06, delay: 0.32, rev: 0.5 }));
    tone(1047 * k * 2, 0.6, { type: 'sine', vol: 0.05, delay: 0.32, rev: 0.6 });
  },
  hurt() {
    if (!ready('hurt', 70)) return;
    tone(150, 0.14, { type: 'square', vol: 0.1, slide: 0.5 });
    noise(0.1, { vol: 0.1, freq: 300, q: 1 });
  },
  blade() {
    if (!ready('blade', 90)) return;
    noise(0.09, { vol: 0.12, freq: 3800, q: 3 });
  },
  coin() {
    if (!ready('coin', 35)) return;
    tone(1319, 0.06, { type: 'square', vol: 0.05 });
    tone(1760, 0.1, { type: 'square', vol: 0.05, delay: 0.05 });
  },
  /* 보스 등장: 경보 두 번 → 쿵 내려앉는 저음 + 으르렁. 대왕(big)은 더 낮고 길다 */
  bossIn(big = false) {
    if (!ready('boss', 300)) return;
    const lo = big ? 0.75 : 1;
    for (let i = 0; i < 2; i++) {
      tone(440, 0.2, { type: 'square', vol: 0.07, slide: 1.5, delay: i * 0.26 });
      tone(622, 0.2, { type: 'square', vol: 0.05, slide: 1.5, delay: i * 0.26 });
    }
    tone(110 * lo, 1.1, { type: 'sawtooth', vol: 0.15, slide: 0.45, delay: 0.5, vib: 22, rev: 0.5 });
    tone(55 * lo, 1.2, { type: 'sine', vol: 0.34, slide: 0.5, delay: 0.55 });
    tone(82 * lo, 1.2, { type: 'square', vol: 0.09, slide: 0.6, delay: 0.55, vib: 17 });
    noise(1.1, { vol: 0.16, freq: 320, q: 0.7, slide: 0.35, delay: 0.55, rev: 0.6 });
  },
  bossHit() {
    if (!ready('bossHit', 70)) return;
    noise(0.07, { vol: 0.08, freq: 500, q: 1 });
  },
  stomp() {
    if (!ready('stomp', 120)) return;
    tone(70, 0.25, { type: 'sine', vol: 0.3, slide: 0.5 });
    noise(0.2, { vol: 0.12, freq: 200, q: 0.6, rev: 0.3 });
  },
  /* 내려찍기 예고: warn초 동안 올라가는 휘파람(끝나는 때 = 떨어지는 때) + 딸깍 */
  slamWarn(warn = 0.7) {
    if (!ready('slamWarn', 150)) return;
    const d = Math.min(1.2, Math.max(0.25, warn));
    tone(240, d, { type: 'triangle', vol: 0.07, slide: 3.2, attack: d * 0.5 });
    tone(880, 0.05, { type: 'square', vol: 0.05 });
    tone(880, 0.05, { type: 'square', vol: 0.05, delay: 0.1 });
  },
  /* 내려찍기: 땅을 치는 굵은 저음 + 부서지는 돌 + 긴 울림 */
  slam() {
    if (!ready('slam', 120)) return;
    tone(95, 0.45, { type: 'sine', vol: 0.4, slide: 0.35 });
    tone(140, 0.2, { type: 'square', vol: 0.1, slide: 0.4 });
    noise(0.45, { vol: 0.24, freq: 260, q: 0.5, slide: 0.3, rev: 0.6 });
    for (let i = 0; i < 4; i++) noise(0.05, { vol: 0.08, freq: 1400 + i * 500, q: 2, delay: 0.1 + i * 0.07 + Math.random() * 0.03 });
  },
  /* 보스가 졸개를 부른다: 떨리는 으르렁이 내려간다 */
  roar() {
    if (!ready('roar', 400)) return;
    tone(190, 0.8, { type: 'sawtooth', vol: 0.13, slide: 0.5, vib: 26, rev: 0.6 });
    tone(95, 0.9, { type: 'square', vol: 0.1, slide: 0.55, vib: 19 });
    noise(0.8, { vol: 0.1, freq: 600, q: 1.2, slide: 0.4, rev: 0.5 });
  },
  /* 분노(체력 절반): 불협 경보가 세 번 솟고 낮게 깔리는 으르렁 */
  enrage() {
    if (!ready('enrage', 600)) return;
    for (let i = 0; i < 3; i++) {
      tone(330 * Math.pow(1.122, i), 0.16, { type: 'sawtooth', vol: 0.08, delay: i * 0.13 });
      tone(466 * Math.pow(1.122, i), 0.16, { type: 'square', vol: 0.05, delay: i * 0.13 });
    }
    tone(70, 1.0, { type: 'sawtooth', vol: 0.16, slide: 1.6, vib: 30, delay: 0.1, rev: 0.5 });
    noise(0.9, { vol: 0.12, freq: 400, q: 0.8, slide: 4, delay: 0.1, rev: 0.5 });
  },
  /* 보스 체력 75·25%: 갑옷이 깨지는 소리 */
  crack() {
    if (!ready('crack', 300)) return;
    noise(0.16, { vol: 0.2, freq: 2400, q: 1.4, slide: 0.3, rev: 0.4 });
    tone(220, 0.2, { type: 'square', vol: 0.09, slide: 0.4 });
    tone(1760, 0.08, { type: 'triangle', vol: 0.06, delay: 0.03 });
  },
  /* 보스 격파: 연쇄 폭발(0~1초) → 큰 폭발 → 팡파르(1.25초부터). win과 같은 문('end')이라 겹치지 않는다 */
  bossDead() {
    if (!ready('end', 500)) return;
    for (let i = 0; i < 7; i++) {
      const d = i * 0.14 + Math.random() * 0.04;
      noise(0.22, { vol: 0.15, freq: 700 - i * 60, q: 0.6, slide: 0.3, delay: d, rev: 0.3 });
      tone(130 - i * 8, 0.18, { type: 'sine', vol: 0.18, slide: 0.5, delay: d });
    }
    noise(0.9, { vol: 0.3, freq: 420, q: 0.4, slide: 0.15, delay: 1.0, rev: 0.8 });
    tone(60, 0.8, { type: 'sine', vol: 0.4, slide: 0.4, delay: 1.0 });
    const F = [[523, 0], [523, 0.12], [523, 0.24], [659, 0.36], [784, 0.56], [659, 0.7], [1047, 0.84]];
    for (const [f, d] of F) {
      const last = d > 0.8;
      tone(f, last ? 0.9 : 0.13, { type: 'sawtooth', vol: 0.07, delay: 1.3 + d, rev: last ? 0.6 : 0.2 });
      tone(f, last ? 0.9 : 0.13, { type: 'triangle', vol: 0.12, delay: 1.3 + d });
      tone(f * 0.75, last ? 0.9 : 0.13, { type: 'triangle', vol: 0.06, delay: 1.3 + d });
    }
    [659, 784, 1319].forEach((f) => tone(f, 0.9, { type: 'triangle', vol: 0.06, delay: 2.14, rev: 0.6 }));
  },
  win() {
    if (!ready('end', 500)) return;
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.5 : 0.14, { type: 'triangle', vol: 0.18, delay: i * 0.11 }));
  },
  lose() {
    if (!ready('end', 500)) return;
    [392, 349, 311, 262].forEach((f, i) => tone(f, i === 3 ? 0.6 : 0.22, { type: 'sawtooth', vol: 0.1, delay: i * 0.2 }));
  },
  click() {
    if (!ready('click', 30)) return;
    tone(660, 0.05, { type: 'triangle', vol: 0.1 });
  },
  buy() {
    if (!ready('buy', 60)) return;
    tone(880, 0.07, { type: 'square', vol: 0.06 });
    tone(1320, 0.12, { type: 'square', vol: 0.06, delay: 0.06 });
  },
  deny() {
    if (!ready('deny', 60)) return;
    tone(200, 0.12, { type: 'square', vol: 0.08 });
  },
  snipe() {
    if (!ready('snipe', 90)) return;
    noise(0.07, { vol: 0.16, freq: 3200, q: 0.9, kind: 'highpass' });
    tone(1400, 0.06, { type: 'square', vol: 0.05, slide: 0.4 });
  },
  rocket() {
    if (!ready('rocket', 120)) return;
    noise(0.35, { vol: 0.1, freq: 600, q: 0.6, slide: 3 });
  },
  boom() {
    if (!ready('boom', 90)) return;
    noise(0.4, { vol: 0.24, freq: 500, q: 0.5, slide: 0.2, rev: 0.35 });
    tone(80, 0.3, { type: 'sine', vol: 0.25, slide: 0.5 });
  },
  heal() {
    if (!ready('heal', 140)) return;
    tone(988, 0.08, { type: 'sine', vol: 0.07 });
    tone(1319, 0.12, { type: 'sine', vol: 0.07, delay: 0.06 });
  },
  join() {
    if (!ready('join', 150)) return;
    [659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.06, delay: i * 0.06 }));
  },
  /* 특수병 레벨 업(SIM 9): 합류 소리보다 한 옥타브 위로 한 번 더 */
  levelUp() {
    if (!ready('levelUp', 200)) return;
    [784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.1, { type: 'square', vol: 0.06, delay: i * 0.05 }));
    tone(2093, 0.25, { type: 'triangle', vol: 0.07, delay: 0.25 });
  },
  /* 빨간 게이트 역전(SIM 9): 아래에서 위로 쓸어 올린 뒤 밝은 두 음 */
  flip() {
    if (!ready('flip', 250)) return;
    noise(0.22, { vol: 0.1, freq: 500, q: 0.9, slide: 5 });
    tone(330, 0.2, { type: 'sawtooth', vol: 0.06, slide: 3 });
    tone(1047, 0.12, { type: 'square', vol: 0.07, delay: 0.16 });
    tone(1568, 0.22, { type: 'triangle', vol: 0.09, delay: 0.24 });
  },
  leave() {
    if (!ready('leave', 150)) return;
    tone(523, 0.18, { type: 'triangle', vol: 0.1, slide: 0.6 });
    tone(392, 0.25, { type: 'triangle', vol: 0.08, slide: 0.6, delay: 0.12 });
  },
  ready() {
    if (!ready('heroReady', 400)) return;
    tone(1047, 0.08, { type: 'square', vol: 0.06 });
    tone(1568, 0.16, { type: 'square', vol: 0.06, delay: 0.07 });
  },
  /* 몰이 알림(보스 앞 좀비 떼): 낮게 두 번 울리는 경보 */
  surge() {
    if (!ready('surge', 800)) return;
    tone(196, 0.16, { type: 'square', vol: 0.09, slide: 0.8 });
    tone(196, 0.16, { type: 'square', vol: 0.09, slide: 0.8, delay: 0.22 });
    noise(0.3, { vol: 0.08, freq: 260, q: 0.8, slide: 0.6, delay: 0.05 });
  },
  /* 영웅 스킬: 영웅마다 다른 소리. 뭉치 — 금빛 나팔과 북 · 나비 — 조준(올라가는 음) 뒤 탕 · 보리 — 하프처럼 흘러내리는 치유 */
  cast(id = '') {
    if (!ready('cast', 300)) return;
    if (id === 'nabi') {
      tone(500, 0.28, { type: 'sine', vol: 0.08, slide: 4, attack: 0.15 });
      noise(0.12, { vol: 0.2, freq: 3400, q: 0.8, kind: 'highpass', delay: 0.28, rev: 0.5 });
      tone(1800, 0.14, { type: 'square', vol: 0.06, slide: 0.3, delay: 0.28 });
      tone(90, 0.2, { type: 'sine', vol: 0.2, slide: 0.5, delay: 0.28 });
    } else if (id === 'bori') {
      [1568, 1319, 1047, 784, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.06, delay: i * 0.045, rev: 0.6 }));
      tone(523, 0.7, { type: 'triangle', vol: 0.08, delay: 0.1, rev: 0.5 });
    } else {
      tone(80, 0.3, { type: 'sine', vol: 0.3, slide: 0.5 });
      [392, 523, 659, 784, 1047, 1319].forEach((f, i) => {
        tone(f, 0.12, { type: 'sawtooth', vol: 0.06, delay: i * 0.035 });
        tone(f * 1.5, 0.12, { type: 'square', vol: 0.03, delay: i * 0.035 });
      });
      [784, 1047, 1319].forEach((f) => tone(f, 0.5, { type: 'sawtooth', vol: 0.045, delay: 0.24, rev: 0.5 }));
      noise(0.3, { vol: 0.1, freq: 2000, q: 0.5, slide: 0.3, delay: 0.05, rev: 0.4 });
    }
  },
  /* 탄 효과를 얻었다: 유리 종 넷(올라간다) + 반짝이 */
  fxUp() {
    if (!ready('fxUp', 200)) return;
    [1047, 1319, 1568, 2093].forEach((f, i) => {
      tone(f, 0.35, { type: 'sine', vol: 0.07, delay: i * 0.06, rev: 0.6 });
      tone(f * 2.76, 0.12, { type: 'sine', vol: 0.02, delay: i * 0.06 });
    });
    noise(0.3, { vol: 0.05, freq: 6000, q: 2, slide: 1.6, delay: 0.1, rev: 0.5 });
  },
  /* 유물: 낮고 어두운 화음이 열리며 밝은 화음으로(긴 울림) */
  relic() {
    if (!ready('relic', 400)) return;
    tone(65, 0.7, { type: 'sine', vol: 0.28, slide: 0.7 });
    [220, 262, 330].forEach((f) => tone(f, 0.5, { type: 'triangle', vol: 0.07, attack: 0.12, rev: 0.6 }));
    [440, 554, 659, 880].forEach((f, i) => tone(f, 0.9, { type: 'triangle', vol: 0.07, delay: 0.4 + i * 0.05, rev: 0.7 }));
    [1760, 2217, 2637].forEach((f, i) => tone(f, 0.4, { type: 'sine', vol: 0.04, delay: 0.6 + i * 0.09, rev: 0.7 }));
    noise(0.7, { vol: 0.06, freq: 900, q: 1, slide: 6, delay: 0.1, rev: 0.6 });
  },
  /* 시너지: 두 가락이 3도로 함께 올라간다 */
  combo() {
    if (!ready('combo', 300)) return;
    [[523, 659], [659, 784], [784, 988], [1047, 1319]].forEach(([a, b], i) => {
      tone(a, i === 3 ? 0.5 : 0.11, { type: 'square', vol: 0.06, delay: i * 0.09, rev: i === 3 ? 0.5 : 0 });
      tone(b, i === 3 ? 0.5 : 0.11, { type: 'triangle', vol: 0.08, delay: i * 0.09, rev: i === 3 ? 0.5 : 0 });
    });
  },
  /* 불굴의 심장이 되살렸다: 심장 박동 둘 → 솟아오르는 화음 */
  revive() {
    if (!ready('revive', 600)) return;
    for (let i = 0; i < 2; i++) {
      tone(70, 0.16, { type: 'sine', vol: 0.4, slide: 0.6, delay: i * 0.3 });
      tone(60, 0.16, { type: 'sine', vol: 0.3, slide: 0.6, delay: i * 0.3 + 0.1 });
    }
    [392, 494, 587, 784, 988, 1175].forEach((f, i) => tone(f, 0.7, { type: 'triangle', vol: 0.08, delay: 0.6 + i * 0.07, rev: 0.6 }));
    noise(0.8, { vol: 0.07, freq: 800, q: 0.8, slide: 6, delay: 0.5, rev: 0.6 });
  },
};
