/* 배경 음악 — 파일 없이 WebAudio로 합성하는 8비트풍 곡.
   예전에는 네 마디를 그대로 되풀이했다. 지금은
   · 곡마다 구간(도입 · A · B · 다리)이 있고 차례(form)대로 흘러간다 — 한 바퀴가 40~60초
   · 한 바퀴를 돌 때마다 조가 바뀌고(KEY_CYCLE), 구간 끝마다 드럼 필인이 들어간다
   · 판의 상태에 따라 악기가 겹친다(setMood — 세기 0~1: 드럼 → 화음 가락 → 아르페지오)
   · 보스가 분노하면 빨라지고 반음 오르며 킥이 두 배로, 파워업(boost)을 얻으면 잠깐 반짝이 가락이 얹힌다
   · 지역마다 다른 달리기 곡·조·음색(play('run:지역번호')), 대왕 보스는 더 낮고 무겁게
   곡 자료(SONGS)와 읽기(parseBar·chordOf)는 순수 자료·함수라 tests/sound.mjs가 검사한다. */

/* 가락 표기: 마디 = 16분음표 16칸, 칸은 띄어 쓴다. 'e5' 음 · '.' 쉼 · '-' 앞 음을 이어 끈다 */
const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export function midiOf(tok) {
  const m = /^([a-g])(#|b)?(\d)$/.exec(tok);
  if (!m) return 0;
  return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
/* 마디 → 16칸, 칸마다 null(쉼·끄는 중) 또는 { m: MIDI, len: 끄는 칸 수 } */
export function parseBar(str) {
  const tk = str.trim().split(/\s+/);
  const out = new Array(16).fill(null);
  let last = -1;
  for (let i = 0; i < 16; i++) {
    const t = tk[i] || '.';
    if (t === '-') { if (last >= 0) out[last].len++; continue; }
    if (t === '.') { last = -1; continue; }
    out[i] = { m: midiOf(t), len: 1 };
    last = i;
  }
  return out;
}
/* 화음 이름('Am' · 'Bb' · 'F#m') → { root: 0~11, tones: 3화음(반음) } */
export function chordOf(name) {
  const m = /^([A-G])(#|b)?(m)?$/.exec(name);
  if (!m) return { root: 0, tones: [0, 4, 7] };
  const root = (NOTE[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? 11 : 0)) % 12;
  return { root, tones: m[3] ? [0, 3, 7] : [0, 4, 7] };
}

/* 드럼: k 킥 · s 스네어 · h 닫힌 하이햇 · o 열린 하이햇 · t 탐. 세기 단계(0 조용 · 1 보통 · 2 가득)마다 한 줄 */
const DRUMS = {
  title: ['k.......k.......', 'k...h...s...h...', 'k...h...s...h.h.'],
  march: ['k.......k.......', 'k.h.s.h.k.h.s.h.', 'k.h.s.hhk.hks.ho'],
  drive: ['k...h...k...h...', 'k.h.s.h.kkh.s.h.', 'k.hhs.hkk.hhs.ho'],
  boss: ['k..k..k.k..k..k.', 'k.hsk.hsk.hsk.hs', 'k.hskkhsk.hskshs'],
  doom: ['t...t...t...t.tt', 't...t...t.t.tttt', 't.t.t.t.tttttttt'],
};
const FILL = '........s.s.tstt';   // 구간 마지막 마디의 뒷부분에 덮어쓴다(빈 칸은 원래 박자)

export const SONGS = {
  title: {
    bpm: 104, duty: 0.25, bass: 'walk', drums: 'title', form: ['A', 'A2', 'B', 'A'], loop: 0,
    sections: {
      A: {
        chords: ['F', 'Dm', 'Bb', 'C'],
        lead: [
          'f5 . a5 . c6 . a5 . g5 . f5 . e5 - . .',
          'd5 . f5 . a5 . f5 . e5 . d5 . c5 - . .',
          'bb4 . d5 . f5 . d5 . c5 . d5 . e5 . f5 .',
          'g5 . e5 . c5 . e5 . g5 - - - . . . .',
        ],
      },
      A2: {
        chords: ['F', 'Dm', 'Bb', 'C'],
        lead: [
          'f5 . a5 . c6 . a5 . c6 - d6 . c6 - . .',
          'd6 . a5 . f5 . a5 . g5 . f5 . e5 - . .',
          'd5 . f5 . bb5 . f5 . d5 . f5 . g5 . a5 .',
          'g5 - e5 . g5 - c6 . bb5 . g5 . e5 . g5 .',
        ],
      },
      B: {
        chords: ['Bb', 'C', 'Am', 'Dm', 'Bb', 'C', 'F', 'F'],
        lead: [
          'd5 - - - f5 - - - bb5 - - - a5 - f5 -',
          'e5 - - - g5 - - - c6 - - - bb5 - g5 -',
          'c5 - - - e5 - - - a5 - - - g5 - e5 -',
          'd5 - - - f5 - - - a5 - - - - - . .',
          'bb5 - a5 - g5 - f5 - d5 - - - f5 - - -',
          'c6 - bb5 - a5 - g5 - e5 - - - g5 - - -',
          'a5 - - - f5 - - - c5 - - - f5 - a5 -',
          'f5 - - - - - - - . . c5 . f5 . . .',
        ],
      },
    },
  },
  /* 달리기 1 — 밝은 행진(다장조) */
  run1: {
    bpm: 136, duty: 0.5, bass: 'oct', drums: 'march', form: ['I', 'A', 'B', 'A', 'C', 'B'], loop: 1,
    sections: {
      I: { chords: ['C', 'G'], lead: null },
      A: {
        chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'],
        lead: [
          'e5 . g5 . c6 . g5 . e5 . d5 . c5 - . .',
          'a4 . c5 . e5 . c5 . a4 . b4 . c5 - . .',
          'f4 . a4 . c5 . f5 . e5 . c5 . a4 - . .',
          'g4 . b4 . d5 . g5 . f5 . d5 . b4 . d5 .',
          'e5 . g5 . c6 . g5 . e6 - d6 . c6 - . .',
          'a5 . e5 . c6 . a5 . b5 - c6 . a5 - . .',
          'f5 . a5 . c6 . a5 . f5 . g5 . a5 - - .',
          'g5 - b5 . d6 - b5 . g5 . a5 . b5 . d6 .',
        ],
      },
      B: {
        chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'],
        lead: [
          'a4 - - - c5 - a4 - f5 - - - a5 - - .',
          'b4 - - - d5 - b4 - g5 - - - b5 - - .',
          'g5 - - - b5 - g5 - e5 - - . g5 . b5 .',
          'a5 - - - - - e5 - a5 - c6 - e6 - - .',
          'f5 - - - e5 - c5 - a4 - - - c5 - - .',
          'd5 - - - b4 - g4 - b4 - d5 - g5 - - .',
          'e5 - - - c5 - g4 - c5 - - - e5 - d5 -',
          'c5 - - - - - - - . . g4 . c5 . . .',
        ],
      },
      C: {
        chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'E', 'E'],
        lead: [
          'a5 . . a5 . . c6 . b5 . a5 . e5 - . .',
          'f5 . . f5 . . a5 . g5 . f5 . c5 - . .',
          'e5 . . e5 . . g5 . f5 . e5 . c5 - . .',
          'd5 . . d5 . . g5 . f5 . d5 . b4 - . .',
          'a5 . . a5 . . c6 . b5 . a5 . e6 - . .',
          'f5 . . a5 . . c6 . a5 . c6 . f6 - . .',
          'e6 - - - b5 - g#5 - b5 - - - e6 - - -',
          'e6 . e6 . e6 . . . b5 . b5 . g#5 . b5 .',
        ],
      },
    },
  },
  /* 달리기 2 — 몰아치는 단조(가단조) */
  run2: {
    bpm: 142, duty: 0.25, bass: 'drive', drums: 'drive', form: ['I', 'A', 'A', 'B', 'A', 'B'], loop: 1,
    sections: {
      I: { chords: ['Am', 'E'], lead: null },
      A: {
        chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E'],
        lead: [
          'a4 . a4 c5 . e5 . a5 . g5 . e5 c5 . e5 .',
          'a4 . a4 c5 . e5 . a5 . b5 . c6 - . . .',
          'f4 . f4 a4 . c5 . f5 . e5 . c5 a4 . c5 .',
          'g4 . g4 b4 . d5 . g5 . f5 . d5 b4 . d5 .',
          'a4 . a4 c5 . e5 . a5 . g5 . e5 c5 . e5 .',
          'a5 . c6 . b5 . a5 . g5 . e5 . g5 - a5 -',
          'f5 - - c5 f5 - a5 - c6 - - a5 f5 - . .',
          'e5 - - b4 e5 - g#5 - b5 - - g#5 e5 . b5 .',
        ],
      },
      B: {
        chords: ['C', 'G', 'Am', 'Em', 'F', 'C', 'Dm', 'E'],
        lead: [
          'e5 - - - g5 - - - c6 - - - b5 - g5 -',
          'd5 - - - g5 - - - b5 - - - a5 - g5 -',
          'c5 - - - e5 - - - a5 - - - g5 - e5 -',
          'b4 - - - e5 - - - g5 - - - - - . .',
          'a5 - - - f5 - - - c6 - - - a5 - f5 -',
          'g5 - - - e5 - - - c6 - - - g5 - e5 -',
          'f5 - - - d5 - - - a5 - - - f5 - d5 -',
          'e5 - g#5 - b5 - e6 - . . b5 . g#5 . e5 .',
        ],
      },
    },
  },
  /* 보스 — 가단조에 프리지아 2도(Bb). 도입 두 마디는 북과 저음만 */
  boss: {
    bpm: 152, duty: 0.125, bass: 'gallop', drums: 'boss', form: ['I', 'A', 'A', 'B'], loop: 1,
    sections: {
      I: { chords: ['E', 'E'], lead: null, drums: 'doom' },
      A: {
        chords: ['Am', 'Am', 'F', 'E', 'Am', 'Am', 'Bb', 'E'],
        lead: [
          'a4 . . c5 . . b4 . a4 . e4 . . . . .',
          'a4 . . c5 . . b4 . a4 . e5 . d#5 . e5 .',
          'f4 . . a4 . . g4 . f4 . c5 . . . . .',
          'e4 . . g#4 . . b4 . e5 . d5 . b4 . g#4 .',
          'a4 . . c5 . . b4 . a4 . e5 . . . a5 .',
          'a5 . . e5 . . c5 . a4 . c5 . e5 . g5 .',
          'bb5 - - - f5 - d5 - bb4 - d5 - f5 - bb5 -',
          'b5 - - - g#5 - e5 - b4 - e5 - g#5 - b5 -',
        ],
      },
      B: {
        chords: ['Dm', 'Am', 'E', 'Am', 'Dm', 'Am', 'Bb', 'E'],
        lead: [
          'd5 f5 a5 f5 d5 f5 a5 d6 a5 f5 d5 f5 a5 - - .',
          'c5 e5 a5 e5 c5 e5 a5 c6 a5 e5 c5 e5 a5 - - .',
          'b4 e5 g#5 e5 b4 e5 g#5 b5 g#5 e5 b4 e5 g#5 - - .',
          'a5 - e5 - c5 - a4 - . . a4 . c5 . e5 .',
          'd5 f5 a5 f5 d5 f5 a5 d6 f6 d6 a5 f5 d6 - - .',
          'c5 e5 a5 e5 c5 e5 a5 c6 e6 c6 a5 e5 c6 - - .',
          'd6 - bb5 - f5 - d5 - f5 - bb5 - d6 - f6 -',
          'e6 - - - . . e6 . e6 - - - b5 . g#5 .',
        ],
      },
    },
  },
};
/* 읽어 둔 가락(곡 · 구간 → 마디마다 16칸) */
for (const sg of Object.values(SONGS)) for (const sec of Object.values(sg.sections)) sec.bars = sec.lead ? sec.lead.map(parseBar) : null;

/* 한 바퀴 돌 때마다 옮기는 조(반음) — 같은 가락도 다르게 들린다 */
export const KEY_CYCLE = [0, 2, -2, 0, 3, -3];
/* 지역(0~5)마다 달리기 곡 · 조 · 음색. 여섯 지역이 서로 다르다 */
export const BIOME_TUNE = [
  { song: 'run1', key: 0, duty: 0.5 },
  { song: 'run2', key: 0, duty: 0.25 },
  { song: 'run1', key: -3, duty: 0.25 },
  { song: 'run2', key: -4, duty: 0.125 },
  { song: 'run1', key: 2, duty: 0.375 },
  { song: 'run2', key: 3, duty: 0.5 },
];
/* 'title' · 'run:지역' · 'boss:지역:등급'(등급 hard 정예 · super 대왕) → 곡과 바꿈 */
export function tuneOf(id) {
  const [kind, a, b] = String(id || '').split(':');
  const bi = ((+a || 0) % BIOME_TUNE.length + BIOME_TUNE.length) % BIOME_TUNE.length;
  if (kind === 'run') { const t = BIOME_TUNE[bi]; return { song: t.song, key: t.key, duty: t.duty, mood: 0.45 }; }
  if (kind === 'boss') return { song: 'boss', key: (b === 'super' ? -5 : b === 'hard' ? -2 : 0) + (bi % 3) - 1, duty: 0.125, mood: b === 'super' ? 0.85 : 0.65, heavy: b === 'super' };
  if (kind === 'title') return { song: 'title', key: 0, duty: 0.25, mood: 0.45 };
  return null;
}

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createMusic(ctx, dest) {
  /* 출력: out(전체 세기) → 저역 필터(일시정지 때 먹먹하게) → dest. 가락은 메아리(echo)에도 보낸다 */
  const out = ctx.createGain();
  out.gain.value = 0;
  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 18000;
  lpf.Q.value = 0.5;
  out.connect(lpf);
  lpf.connect(dest);
  const echo = ctx.createDelay(0.6);
  echo.delayTime.value = 0.21;
  const echoFb = ctx.createGain();
  echoFb.gain.value = 0.28;
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.3;
  echo.connect(echoFb); echoFb.connect(echo);
  echo.connect(echoOut); echoOut.connect(out);

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
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  let song = null, tune = null, name = '';
  let fi = 0, bar = 0, step = 0, pass = 0;   // 구간 번호 · 구간 안 마디 · 마디 안 칸 · 돈 바퀴
  let nextT = 0, timer = null;
  let on = true, level = 0.5;
  let mood = 0.45, moodNow = 0.45;   // 세기(바라는 값 · 지금 값 — 마디마다 따라간다)
  let rage = false, boostUntil = 0, duckUntil = 0;

  function tone(freq, t, dur, vol, wave, type, send, atk = 0.008) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (wave) o.setPeriodicWave(wave); else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    if (send) g.connect(echo);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function hit(kind, t, vol = 1) {
    if (kind === 'k' || kind === 't') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f0 = kind === 'k' ? 150 : 190, f1 = kind === 'k' ? 42 : 70, d = kind === 'k' ? 0.14 : 0.2;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.85);
      g.gain.setValueAtTime((kind === 'k' ? 0.5 : 0.36) * vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + d + 0.02);
      return;
    }
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    let dur = 0.04, v = 0.12;
    if (kind === 'h') { f.type = 'highpass'; f.frequency.value = 7000; }
    else if (kind === 'o') { f.type = 'highpass'; f.frequency.value = 6000; dur = 0.16; v = 0.1; }
    else if (kind === 'c') { f.type = 'highpass'; f.frequency.value = 4500; dur = 0.7; v = 0.16; }   // 크래시(구간 처음)
    else { f.type = 'bandpass'; f.frequency.value = 1800; dur = 0.11; v = 0.3; }
    g.gain.setValueAtTime(v * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.05); s.stop(t + dur + 0.02);
  }

  const secOf = () => song.sections[song.form[fi]];
  const spb = () => 60 / (song.bpm * (rage ? 1.12 : 1)) / 4;   // 16분음표 길이(초)

  function schedule(t) {
    const sec = secOf();
    const six = spb();
    const nb = sec.chords.length;
    const ch = chordOf(sec.chords[bar % nb]);
    const key = tune.key + KEY_CYCLE[pass % KEY_CYCLE.length] + (rage ? 1 : 0);
    const I = moodNow;
    const lv = I < 0.3 ? 0 : I < 0.7 ? 1 : 2;
    const boost = t < boostUntil;
    const intro = !sec.bars;

    /* 가락 + (세기 0.55부터) 3도·6도 아래 화음 가락 + (파워업) 한 옥타브 위 */
    const n = sec.bars && sec.bars[bar % sec.bars.length][step];
    if (n) {
      const m = n.m + key, d = six * (n.len + 0.7);
      tone(hz(m), t, d, 0.105, pulse(tune.duty), null, true);
      if (I >= 0.55) {
        // 화음 가락: 가락보다 3반음 이상 아래에서 가장 높은 화음 음
        let hm = 0;
        for (let o = 5; o >= 2 && !hm; o--) for (let k = 2; k >= 0; k--) { const c = 12 * (o + 1) + ch.root + ch.tones[k] + key; if (c <= m - 3) { hm = c; break; } }
        if (hm) tone(hz(hm), t, d, 0.05, pulse(tune.duty === 0.5 ? 0.25 : 0.5), null, false);
      }
      if (boost) tone(hz(m + 12), t, d * 0.6, 0.035, null, 'square', true);
    }
    /* 베이스: 8분음표. 모양은 곡마다 */
    if (step % 2 === 0) {
      const root = 36 + ((ch.root + key + 120) % 12);
      const e = step >> 1;   // 마디 안 8분음표 0~7
      let b = root;
      if (song.bass === 'oct') b = e & 1 ? root + 12 : root;
      else if (song.bass === 'drive') b = e === 3 || e === 7 ? root + 7 : e === 5 ? root + 12 : root;
      else if (song.bass === 'gallop') b = e % 3 === 2 ? root + 12 : root;
      else if (song.bass === 'walk') b = [root, 0, root + 7, 0, root + 12, 0, root + 7, 0][e];
      if (b) tone(hz(b), t, six * 1.8, intro ? 0.26 : 0.21, null, 'triangle', false);
      if (b && (rage || tune.heavy) && e % 2 === 0) tone(hz(b + 12), t, six * 0.9, 0.035, null, 'sawtooth', false);
    }
    /* 깔리는 화음: 마디 처음에 길게 */
    if (step === 0 && !intro) {
      for (let k = 0; k < 3; k++) tone(hz(60 + ((ch.root + key + 120) % 12) + ch.tones[k]), t, six * 15, 0.022, null, 'triangle', false, 0.08);
    }
    /* 아르페지오: 세기 0.8부터(또는 파워업·분노) 16분음표로 화음 음을 오르내린다 */
    if (!intro && (I >= 0.8 || boost || rage)) {
      const seq = [0, 1, 2, 1];
      const a = 72 + ((ch.root + key + 120) % 12) + ch.tones[seq[step & 3]] + (step & 4 ? 12 : 0) + (boost ? 12 : 0);
      tone(hz(a), t, six * 0.9, boost ? 0.04 : 0.028, pulse(0.125), null, boost);
    }
    /* 드럼: 세기 단계의 줄 + 구간 마지막 마디의 필인 + 구간 처음의 크래시 */
    const pat = DRUMS[sec.drums || song.drums][lv];
    let d = pat[step];
    if (bar === nb - 1 && step >= 8 && lv > 0 && FILL[step] !== '.') d = FILL[step];
    if (d !== '.') hit(d, t, intro ? 1.15 : 1);
    if (rage && step % 4 === 2 && d !== 'k') hit('k', t, 0.7);
    if (bar === 0 && step === 0 && (fi > 0 || pass > 0)) hit('c', t);
  }

  function advance() {
    step++;
    if (step < 16) return;
    step = 0;
    moodNow += (mood - moodNow) * 0.5;   // 마디마다 반씩 따라간다(갑자기 악기가 빠지지 않게)
    bar++;
    if (bar < secOf().chords.length) return;
    bar = 0;
    fi++;
    if (fi >= song.form.length) { fi = song.loop; pass++; }
  }

  function pump() {
    if (!song) return;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
    while (nextT < ctx.currentTime + 0.18) {
      if (on) schedule(nextT);
      nextT += spb();
      advance();
    }
  }

  function gainTo(to, at, tc) {
    out.gain.cancelScheduledValues(at);
    out.gain.setTargetAtTime(to, at, tc);
  }
  const want = () => (on && song ? level : 0);

  return {
    /* 곡을 튼다. id: 'title' · 'run:지역' · 'boss:지역:등급'. 같은 id면 그대로 이어 간다 */
    play(id) {
      if (id === name && timer) return;
      const tn = tuneOf(id);
      name = id;
      tune = tn;
      song = tn ? SONGS[tn.song] : null;
      fi = 0; bar = 0; step = 0; pass = 0;
      rage = false; boostUntil = 0;
      mood = moodNow = tn ? tn.mood : 0.45;
      // 앞 곡은 짧게 줄이고(이미 예약된 음이 사라지게), 새 곡은 0.22초 뒤 제 세기로
      const now = ctx.currentTime;
      gainTo(0, now, 0.04);
      nextT = now + 0.22;
      out.gain.setTargetAtTime(want(), nextT - 0.02, 0.03);
      if (!timer) timer = setInterval(pump, 30);
    },
    stop() {
      name = '';
      gainTo(0, ctx.currentTime, 0.1);
      setTimeout(() => { if (!name && timer) { clearInterval(timer); timer = null; song = null; } }, 400);
    },
    setOn(v) { on = !!v; gainTo(want(), ctx.currentTime, 0.07); },
    /* 판의 상태: 세기 0~1(악기가 겹친다) · 분노(빨라지고 반음 위, 킥 두 배) */
    setMood(i, raging) {
      if (typeof i === 'number' && i === i) mood = Math.max(0, Math.min(1, i));
      rage = !!raging;
    },
    /* 파워업: sec초 동안 반짝이 가락(한 옥타브 위 아르페지오 + 가락 겹침) */
    boost(sec = 4) { boostUntil = Math.max(boostUntil, ctx.currentTime + sec); },
    /* 큰 효과음(보스 등장·격파 팡파르)이 들리게 sec초 동안 음악을 낮춘다 */
    duck(sec = 1.2, depth = 0.25) {
      if (!on || !song) return;
      const now = ctx.currentTime;
      duckUntil = now + sec;
      gainTo(level * depth, now, 0.05);
      out.gain.setTargetAtTime(want(), duckUntil, 0.25);
    },
    /* 일시정지: 음악이 먹먹해진다(끊지 않고 — 이어 하면 다시 또렷하게) */
    setMuffled(v) { lpf.frequency.setTargetAtTime(v ? 520 : 18000, ctx.currentTime, 0.08); },
    get current() { return name; },
  };
}
