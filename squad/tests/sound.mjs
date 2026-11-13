/* 배경 음악 자료(assets/music.js)와 소리 배선 검사 — 브라우저 없이 자료·글만 본다.
   실행: node --test squad/tests/sound.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SONGS, KEY_CYCLE, BIOME_TUNE, tuneOf, parseBar, chordOf, midiOf } from '../assets/music.js';
import { BIOMES } from '../assets/roster.js';

const read = (f) => fs.readFileSync(new URL('../assets/' + f, import.meta.url), 'utf8');

test('가락 읽기: 음 이름 · 쉼 · 이어 끌기', () => {
  assert.equal(midiOf('a4'), 69);
  assert.equal(midiOf('c5'), 72);
  assert.equal(midiOf('bb4'), 70);
  assert.equal(midiOf('g#5'), 80);
  const bar = parseBar('a4 - - . c5 . . . e5 - - - - - - -');
  assert.equal(bar.length, 16);
  assert.deepEqual(bar[0], { m: 69, len: 3 });
  assert.equal(bar[1], null);
  assert.deepEqual(bar[4], { m: 72, len: 1 });
  assert.deepEqual(bar[8], { m: 76, len: 8 });
  assert.deepEqual(chordOf('Am'), { root: 9, tones: [0, 3, 7] });
  assert.deepEqual(chordOf('Bb'), { root: 10, tones: [0, 4, 7] });
});

test('곡: 구간이 여럿이고 차례대로 흐른다 — 한 바퀴가 30초 이상(네 마디 되풀이가 아니다)', () => {
  for (const [name, sg] of Object.entries(SONGS)) {
    assert.ok(sg.form.length >= 3, `${name}: 구간 차례가 셋 이상`);
    assert.ok(sg.loop >= 0 && sg.loop < sg.form.length, `${name}: 되돌아갈 자리`);
    let bars = 0;
    for (let i = sg.loop; i < sg.form.length; i++) {
      const sec = sg.sections[sg.form[i]];
      assert.ok(sec, `${name}: 구간 ${sg.form[i]}`);
      bars += sec.chords.length;
    }
    const secPerLoop = (bars * 4 * 60) / sg.bpm;
    assert.ok(secPerLoop >= 30, `${name}: 한 바퀴 ${secPerLoop.toFixed(1)}초`);
    assert.ok(new Set(sg.form.slice(sg.loop)).size >= 2, `${name}: 되풀이 구간 안에 서로 다른 구간이 둘 이상`);
  }
  // 조가 바뀌며 도는 바퀴 수 × 한 바퀴 = 같은 소리가 돌아오기까지 3분 이상
  const run = SONGS.run1;
  let bars = 0;
  for (let i = run.loop; i < run.form.length; i++) bars += run.sections[run.form[i]].chords.length;
  assert.ok(new Set(KEY_CYCLE).size >= 4, '조가 넷 이상');
  assert.ok((KEY_CYCLE.length * bars * 240) / run.bpm >= 180, '달리기 곡이 그대로 되돌아오기까지 3분 이상');
});

test('곡: 마디는 16칸, 가락은 그 마디 화음에 맞고 들을 만한 높이', () => {
  for (const [name, sg] of Object.entries(SONGS)) {
    for (const [sn, sec] of Object.entries(sg.sections)) {
      for (const c of sec.chords) assert.match(c, /^[A-G](#|b)?m?$/, `${name}.${sn} 화음 ${c}`);
      if (!sec.lead) continue;
      assert.equal(sec.lead.length, sec.chords.length, `${name}.${sn}: 가락 마디 수 = 화음 마디 수`);
      sec.lead.forEach((str, bi) => {
        const tk = str.trim().split(/\s+/);
        assert.equal(tk.length, 16, `${name}.${sn}[${bi}] 칸 수 ${tk.length}`);
        for (const t of tk) assert.ok(t === '.' || t === '-' || midiOf(t) > 0, `${name}.${sn}[${bi}] 칸 '${t}'`);
        const ch = chordOf(sec.chords[bi]);
        const notes = sec.bars[bi].filter(Boolean);
        assert.ok(notes.length >= 2, `${name}.${sn}[${bi}] 음이 둘 이상`);
        for (const n of notes) assert.ok(n.m >= 60 && n.m <= 91, `${name}.${sn}[${bi}] 음 높이 ${n.m}`);
        // 마디의 첫 음은 화음 음(안 어울리는 음으로 시작하지 않는다), 긴 음(4칸 이상)도 화음 음
        const inChord = (m) => ch.tones.includes((((m - ch.root) % 12) + 12) % 12);
        assert.ok(inChord(notes[0].m), `${name}.${sn}[${bi}] 첫 음이 ${sec.chords[bi]} 화음 음`);
        for (const n of notes) if (n.len >= 4) assert.ok(inChord(n.m), `${name}.${sn}[${bi}] 긴 음 ${n.m}이 ${sec.chords[bi]} 화음 음`);
      });
    }
  }
});

test('지역마다 다른 달리기 곡 · 보스 등급마다 다른 조', () => {
  assert.equal(BIOME_TUNE.length, BIOMES.length, '지역 수만큼');
  const seen = new Set(BIOME_TUNE.map((t) => `${t.song}|${t.key}|${t.duty}`));
  assert.equal(seen.size, BIOME_TUNE.length, '여섯 지역의 곡·조·음색이 서로 다르다');
  for (let i = 0; i < BIOMES.length; i++) {
    const r = tuneOf('run:' + i), b = tuneOf(`boss:${i}:`), sup = tuneOf(`boss:${i}:super`), hard = tuneOf(`boss:${i}:hard`);
    assert.ok(SONGS[r.song] && SONGS[b.song]);
    assert.ok(sup.key < hard.key && hard.key < b.key, '정예는 낮게, 대왕은 더 낮게');
    assert.ok(sup.mood > b.mood, '대왕은 처음부터 악기가 더 겹친다');
    // 옮긴 뒤에도 가락이 너무 높거나 낮지 않다(조 바꿈·분노 반음 포함)
    for (const t of [r, b, sup]) for (const sec of Object.values(SONGS[t.song].sections)) if (sec.bars) for (const bar of sec.bars) for (const n of bar) {
      if (!n) continue;
      const lo = n.m + t.key + Math.min(...KEY_CYCLE), hi = n.m + t.key + Math.max(...KEY_CYCLE) + 1;
      assert.ok(lo >= 48 && hi <= 96, `${t.song} 옮긴 음 ${lo}~${hi}`);
    }
  }
  assert.equal(tuneOf('title').song, 'title');
  assert.equal(tuneOf(''), null);
});

test('배선: 판의 상태가 음악에 닿는다 · 파워업·보스 소리가 저마다 다르다', () => {
  const main = read('main.js'), audio = read('audio.js'), music = read('music.js');
  // 음악: 지역·보스 등급으로 곡을 고르고, 세기·분노·파워업·먹먹함을 넘긴다
  assert.match(main, /`boss:\$\{bi\}:\$\{tagOf\(L\)\.tag\}` : `run:\$\{bi\}`/, '곡 이름에 지역과 보스 등급');
  assert.match(main, /music\.setMood\(/, '세기');
  assert.match(main, /music\.setMuffled\(mode === 'pause'/, '일시정지는 먹먹하게');
  assert.match(main, /music\.boost\(/, '파워업 반짝이');
  assert.match(main, /case 'bossDead':[\s\S]{0,400}sfx\.bossDead\(\)[\s\S]{0,200}music\.duck\(/, '격파 팡파르 동안 음악을 낮춘다');
  for (const fn of ['setMood', 'boost', 'duck', 'setMuffled', 'play', 'stop', 'setOn']) assert.match(music, new RegExp(`\\b${fn}\\(`), `music.${fn}`);
  // 효과음: 쓰는 이름이 모두 있다(없는 이름을 부르면 그 틱의 이벤트 처리가 멈춘다)
  const have = new Set([...audio.matchAll(/^  ([a-zA-Z]+)\([^)]*\) \{$/gm)].map((m) => m[1]));
  for (const m of main.matchAll(/sfx\.([a-zA-Z]+)\(/g)) assert.ok(have.has(m[1]), `sfx.${m[1]}이 audio.js에 있다`);
  for (const k of ['power', 'fxUp', 'relic', 'combo', 'revive', 'bossIn', 'slamWarn', 'slam', 'roar', 'enrage', 'crack', 'bossDead']) {
    assert.ok(have.has(k), `효과음 ${k}`);
    assert.match(main, new RegExp(`sfx\\.${k}\\(`), `main이 sfx.${k}을 부른다`);
  }
  assert.match(main, /case 'shot': sfx\.shot\(s\.squad\.tier \| 0\)/, '총소리는 무기 단계마다');
  assert.match(main, /sfx\.cast\(e\.id\)/, '스킬 소리는 영웅마다');
});

test('그리기: 빛 효과는 고사양에서만, 파워업 빛기둥·보스 경고 띠·땅 금·빛살이 이벤트에 걸려 있다', () => {
  const src = read('render.js');
  assert.match(src, /function glow\(px, py, rx, ry, col, a = 1\) \{\n    if \(quality === 'low'/, '빛은 저사양에서 그리지 않는다');
  assert.match(src, /function beam\([^)]*\) \{\n    if \(quality === 'low'/, '빛기둥도');
  assert.match(src, /function vignette\(strong\) \{\n    if \(quality === 'low'/, '가장자리 음영도');
  assert.match(src, /globalCompositeOperation = 'lighter'/);
  // 더하기 합성을 켠 함수는 끄고 나온다(뒤 그림이 하얗게 타지 않게)
  const on = (src.match(/globalCompositeOperation = 'lighter'/g) || []).length, off = (src.match(/globalCompositeOperation = 'source-over'/g) || []).length;
  assert.ok(off >= on, `'lighter' ${on}번 켜고 'source-over' ${off}번 되돌린다`);
  for (const ev of ['relic', 'relicUse', 'card', 'combo', 'heroCast']) assert.match(src, new RegExp(`case '${ev}':(?: \\{)?[\\s\\S]{0,1400}?powerSurge\\(`), `${ev} → 빛기둥`);
  assert.match(src, /powerSurge\(tc, true\)/, '무기 강화 → 새 단계 색 빛기둥');
  assert.match(src, /case 'boss':[\s\S]{0,200}warnT = time;/, '보스 등장 → 경고 띠');
  assert.match(src, /case 'slam':[\s\S]{0,900}crackAt\(/, '내려찍기 → 땅 금');
  assert.match(src, /case 'enrage':[\s\S]{0,700}crackAt\(/, '분노 → 충격파·땅 금');
  assert.match(src, /rays\(px, py - 3 \* P\.s/, '쓰러지는 보스 → 빛살');
  assert.match(src, /for \(const g of surges\) g\.on = false;\n    for \(const c of cracks\) c\.on = false;\n    warnT = -9;/, '새 판에서 지운다');
  // 움직임 줄이기: 경고의 붉은 숨·빛살은 끈다
  assert.match(src, /if \(!reduce\) \{\n      ctx\.fillStyle = '#E8384F';/, '경고 띠의 붉은 숨');
  assert.match(src, /\} else if \(bossDeath && !reduce\) \{/, '빛살');
});
