/* 배경 음악 — 8비트 느낌의 짧은 반복곡을 WebAudio로 합성한다(파일 없음).
   곡: title(메뉴), run(전진), boss(보스전). 16분음표 단위로 앞당겨 예약한다. */

// 음 높이는 MIDI 번호, 0은 쉼표
const R = 0;
const SONGS = {
  title: {
    bpm: 104,
    lead: [
      77, R, 81, R, 84, R, 81, R, 79, R, 77, R, 76, R, R, R,
      74, R, 77, R, 81, R, 77, R, 76, R, 74, R, 72, R, R, R,
      70, R, 74, R, 77, R, 74, R, 72, R, 74, R, 76, R, 77, R,
      79, R, 76, R, 72, R, 76, R, 77, R, R, R, R, R, R, R,
    ],
    bass: [41, R, 48, R, 53, R, 48, R], // F
    chords: [0, 0, -3, -3, -7, -7, -5, -5],   // 마디마다 베이스 이동(반음)
    drums: 'k...h...s...h...',
    duty: 0.25,
  },
  run: {
    bpm: 132,
    lead: [
      76, R, 79, R, 84, R, 79, R, 76, R, 74, R, 72, R, R, R,
      69, R, 72, R, 76, R, 72, R, 69, R, 71, R, 72, R, R, R,
      65, R, 69, R, 72, R, 77, R, 76, R, 72, R, 69, R, R, R,
      67, R, 71, R, 74, R, 79, R, 77, R, 74, R, 71, R, 74, R,
    ],
    bass: [36, R, 48, R, 36, R, 48, R],
    chords: [0, 0, -3, -3, -7, -7, -5, -5],
    drums: 'k.h.s.h.k.h.s.hh',
    duty: 0.5,
  },
  boss: {
    bpm: 150,
    lead: [
      69, R, R, 72, R, R, 71, R, 69, R, 64, R, R, R, R, R,
      65, R, R, 69, R, R, 67, R, 65, R, 64, R, 62, R, 64, R,
      69, R, 72, R, 76, R, 75, R, 76, R, 72, R, 69, R, R, R,
      68, R, 71, R, 74, R, 76, R, 74, R, 71, R, 68, R, 64, R,
    ],
    bass: [33, 33, 45, 33, 33, 45, 33, 45],
    chords: [0, 0, -4, -4, -2, -2, -5, -5],
    drums: 'k.hsk.hsk.hsk.ss',
    duty: 0.125,
  },
};

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createMusic(ctx, dest) {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(dest);
  const waves = {};
  function pulse(duty) {
    if (waves[duty]) return waves[duty];
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let i = 1; i < n; i++) real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    waves[duty] = ctx.createPeriodicWave(real, imag);
    return waves[duty];
  }
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  let song = null;
  let name = '';
  let step = 0;
  let nextT = 0;
  let timer = null;
  let on = true;
  let level = 0.5;

  function tone(freq, t, dur, vol, wave, type) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (wave) o.setPeriodicWave(wave); else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function hit(kind, t) {
    if (kind === 'k') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + 0.16);
      return;
    }
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = kind === 'h' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'h' ? 7000 : 1800;
    const g = ctx.createGain();
    const dur = kind === 'h' ? 0.04 : 0.11;
    g.gain.setValueAtTime(kind === 'h' ? 0.12 : 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function schedule(i, t) {
    const sixteenth = 60 / song.bpm / 4;
    const lead = song.lead[i % song.lead.length];
    if (lead) tone(hz(lead), t, sixteenth * 1.7, 0.11, pulse(song.duty));
    const bar = Math.floor(i / 16) % song.chords.length;
    const b = song.bass[i % song.bass.length];
    if (b && i % 2 === 0) tone(hz(b + song.chords[bar]), t, sixteenth * 1.8, 0.22, null, 'triangle');
    const d = song.drums[i % song.drums.length];
    if (d === 'k' || d === 'h' || d === 's') hit(d, t);
  }

  function pump() {
    if (!song) return;
    const sixteenth = 60 / song.bpm / 4;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
    while (nextT < ctx.currentTime + 0.18) {
      schedule(step, nextT);
      nextT += sixteenth;
      step = (step + 1) % 64;
    }
  }

  function fade(to, sec = 0.4) {
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(to, ctx.currentTime, sec / 3);
  }

  return {
    play(which) {
      if (which === name && timer) return;
      name = which;
      song = SONGS[which] || null;
      step = 0;
      nextT = ctx.currentTime + 0.08;
      if (!timer) timer = setInterval(pump, 30);
      fade(on && song ? level : 0);
    },
    stop() {
      name = '';
      fade(0, 0.3);
      setTimeout(() => { if (!name && timer) { clearInterval(timer); timer = null; song = null; } }, 400);
    },
    setOn(v) { on = !!v; fade(on && song ? level : 0, 0.2); },
    get current() { return name; },
  };
}
