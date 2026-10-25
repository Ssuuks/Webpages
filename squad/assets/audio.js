/* 효과음 — 파일 없이 WebAudio로 합성한다.
   브라우저 정책상 첫 터치·클릭 뒤에 unlock()을 불러야 소리가 난다. 실패해도 게임은 그대로 돈다. */
let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = true;
const lastAt = Object.create(null);

export function setSoundOn(on) {
  enabled = !!on;
  if (master) master.gain.setTargetAtTime(enabled ? 0.55 : 0, ctx.currentTime, 0.02);
}

export function unlock() {
  try {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
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
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
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

function tone(freq, dur, { type = 'square', vol = 0.15, slide = 0, delay = 0, attack = 0.004 } = {}) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.2, freq = 1200, q = 0.8, kind = 'bandpass', delay = 0, slide = 0 } = {}) {
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
  s.start(t, Math.random() * 0.3);
  s.stop(t + dur + 0.02);
}

export const sfx = {
  shot() {
    if (!ready('shot', 55)) return;
    noise(0.05, { vol: 0.09, freq: 2600, q: 0.6, kind: 'highpass' });
    tone(180 + Math.random() * 40, 0.05, { type: 'square', vol: 0.03, slide: 0.5 });
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
  power() {
    if (!ready('power', 100)) return;
    [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.07, delay: i * 0.045 }));
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
  bossIn() {
    if (!ready('boss', 300)) return;
    tone(110, 0.9, { type: 'sawtooth', vol: 0.16, slide: 0.5 });
    tone(82, 1.1, { type: 'square', vol: 0.1, slide: 0.6, delay: 0.05 });
    noise(0.9, { vol: 0.14, freq: 300, q: 0.7, slide: 0.4 });
  },
  bossHit() {
    if (!ready('bossHit', 70)) return;
    noise(0.07, { vol: 0.08, freq: 500, q: 1 });
  },
  stomp() {
    if (!ready('stomp', 120)) return;
    tone(70, 0.25, { type: 'sine', vol: 0.3, slide: 0.5 });
    noise(0.2, { vol: 0.12, freq: 200, q: 0.6 });
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
};
