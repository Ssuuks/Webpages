/* node --test travel/tests/  — DOM 없이 검사기·가져오기·시간 계산을 확인한다 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateTrip, scheduleChecks, hoursOn } from '../assets/validate.js';
import { extractJson, classify, mergeInto, prepareNewTrip, diffTrips } from '../assets/importer.js';
import { toEpoch, fromEpoch, nowIn, hav, estMin, parseMapLink, onColor } from '../assets/util.js';
import { shiftTrip, stayForDay, stayForNight, profileSummary } from '../assets/model.js';
import { buildIcs } from '../assets/ics.js';

const demo = JSON.parse(fs.readFileSync(new URL('../samples/demo.json', import.meta.url)));
const clone = (o) => JSON.parse(JSON.stringify(o));

/* 제주 일정을 줄인 시험용 여행 */
function jeju() {
  return {
    schema: 'trip/v1', id: '2026-11-jeju', updatedAt: null,
    meta: { title: '제주', start: '2026-11-20', end: '2026-11-25', timezone: 'Asia/Seoul', currency: 'KRW' },
    badges: [{ id: 'pass', label: '패스', tone: 'accent' }],
    stays: [{ id: 'sheraton', name: '쉐라톤', placeId: 'stay-sheraton', checkIn: '2026-11-20T15:00', checkOut: '2026-11-22T11:00' },
      { id: 'jw', name: 'JW', placeId: 'stay-jw', checkIn: '2026-11-22T15:00', checkOut: '2026-11-25T11:00' }],
    transports: [
      { id: 'flight-out', kind: 'flight', title: '진에어', start: '2026-11-20T15:45', end: '2026-11-20T17:00' },
      { id: 'flight-back', kind: 'flight', title: '에어서울', start: '2026-11-25T16:05', end: '2026-11-25T17:20' },
      { id: 'rental', kind: 'car', title: '렌터카', start: '2026-11-20T18:00', end: '2026-11-25T15:00',
        deadlines: [{ label: '셔틀 막차', at: '2026-11-20T19:00', after: 'flight-out', bufferMin: 40 },
          { label: '반납 늦어도', at: '2026-11-25T14:30', before: 'flight-back', bufferMin: 90 }] }],
    places: [
      { id: 'stay-sheraton', name: '쉐라톤', lat: 33.518585, lng: 126.517113 },
      { id: 'stay-jw', name: 'JW', lat: 33.243829, lng: 126.53863 },
      { id: 'haribo', name: '하리보', lat: 33.473952, lng: 126.52873, hours: { default: '10:00-19:00', lastEntry: '18:00', closed: [] }, badges: ['pass'] },
      { id: 'surprise', name: '서프라이즈', lat: 33.465194, lng: 126.657219, hours: { default: '09:00-20:30', closed: [] } },
      { id: 'dolharu', name: '돌하르방미술관', lat: 33.539049, lng: 126.689327, hours: { default: '09:00-18:00', sat: '10:00-16:00', closed: ['sun'] } },
    ],
    passes: [{ id: 'jejupass', name: '48시간 기본권', validHours: 48, intervalMinutes: 60, activatedAt: null }],
    days: [
      { date: '2026-11-21', stayId: 'sheraton', plans: [{ id: 'A', label: '기본', items: [
        { id: '1121-0940', time: '09:40', kind: 'move', title: '→ 하리보', leg: { km: 7, min: 15 } },
        { id: '1121-1000', time: '10:00', end: '11:00', kind: 'visit', title: '하리보', placeId: 'haribo', passUse: 'jejupass' },
        { id: '1121-1135', time: '11:35', end: '12:35', kind: 'visit', title: '서프라이즈', placeId: 'surprise', passUse: 'jejupass' },
      ] }] },
      { date: '2026-11-22', stayId: 'jw', plans: [{ id: 'A', items: [] }] },
      { date: '2026-11-23', stayId: 'jw', plans: [{ id: 'A', items: [
        { id: '1123-0920', time: '09:20', kind: 'visit', title: '하리보', placeId: 'haribo', passUse: 'jejupass' },
      ] }] },
    ],
  };
}

test('데모와 시험 여행은 오류 없이 통과', () => {
  assert.equal(validateTrip(demo).errors.length, 0);
  const r = validateTrip(jeju());
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.filter((w) => w.kind === 'pass').length, 0, '하리보 10:00 → 서프라이즈 11:35, 월 09:20은 만료 전');
});

test('구조 오류: 날짜 역전, 기간 밖, 없는 placeId, 없는 배지', () => {
  const t = jeju();
  t.meta.start = '2026-11-26';
  t.days[0].plans[0].items[1].placeId = 'haribo2';
  t.days[0].plans[0].items[1].badges = ['nope'];
  const msgs = validateTrip(t).errors.map((e) => e.msg).join('\n');
  assert.match(msgs, /시작일\(2026-11-26\)이 종료일/);
  assert.match(msgs, /여행 기간\(2026-11-26~2026-11-25\) 밖/);
  assert.match(msgs, /2째 날|1째 날/);
  assert.match(msgs, /placeId 'haribo2'가 장소 목록에 없어요/);
  assert.match(msgs, /배지 "nope"/);
});

test('패스 간격 1시간 미만이면 경고', () => {
  const t = jeju();
  t.days[0].plans[0].items[2].time = '10:40';
  const w = scheduleChecks(t).filter((x) => x.kind === 'pass');
  assert.equal(w.length, 1);
  assert.match(w[0].msg, /40분이에요/);
});

test('패스 만료 후 사용 경고 (48시간 = 월 10:00)', () => {
  const t = jeju();
  t.days[2].plans[0].items[0].time = '10:30';
  assert.ok(scheduleChecks(t).some((x) => x.kind === 'pass' && /만료된 뒤/.test(x.msg)));
});

test('돌하르방미술관 일요일 휴무, 토요일 16시 이후 운영시간 밖', () => {
  const t = jeju();
  t.days[1].plans[0].items.push({ id: '1122-1000', time: '10:00', kind: 'visit', title: '돌하르방', placeId: 'dolharu' });
  assert.ok(scheduleChecks(t).some((x) => x.kind === 'closed' && /일요일 휴무/.test(x.msg)));
  t.days[0].plans[0].items.push({ id: '1121-1630', time: '16:30', kind: 'visit', title: '돌하르방', placeId: 'dolharu' });
  assert.ok(scheduleChecks(t).some((x) => x.kind === 'hours' && x.itemId === '1121-1630'));
  assert.equal(hoursOn(t.places[4].hours, '2026-11-21').text, '10:00-16:00');
});

test('항공 도착 + 40분이 셔틀 막차보다 늦으면 경고, 반납과 출발 사이 90분', () => {
  const t = jeju();
  assert.equal(scheduleChecks(t).filter((x) => x.kind === 'deadline').length, 0);
  t.transports[0].end = '2026-11-20T18:30';
  t.transports[2].deadlines[1].at = '2026-11-25T15:00';
  const w = scheduleChecks(t).filter((x) => x.kind === 'deadline');
  assert.equal(w.length, 2);
  assert.match(w[0].msg, /진에어 도착\(18:30\) \+ 40분이 "셔틀 막차"/);
});

test('시간 겹침·역순·이동시간 초과', () => {
  const t = jeju();
  const items = t.days[0].plans[0].items;
  items[2].time = '10:30';                // 하리보 ~11:00 과 겹침
  items[0].leg.min = 40;                  // 09:40 + 40 > 10:00
  const kinds = scheduleChecks(t).map((x) => x.kind);
  assert.ok(kinds.includes('overlap'));
  assert.ok(kinds.includes('leg'));
  items[2].time = '09:30';
  assert.ok(scheduleChecks(t).some((x) => x.kind === 'order'));
});

test('자정 넘는 일정은 역순으로 보지 않음', () => {
  const t = jeju();
  t.days[0].plans[0].items.push({ id: '1121-2340', time: '23:40', title: '라운지' }, { id: '1121-0200', time: '02:00', title: '출발' });
  assert.ok(!scheduleChecks(t).some((x) => x.kind === 'order'));
});

test('붙여넣기 관용: 코드블록·앞뒤 문장·끝 쉼표·스마트 따옴표', () => {
  const r = extractJson('여기요!\n```json\n{"a": [1, 2,], “b”: 1}\n```\n끝');
  assert.ok(r.ok); assert.deepEqual(r.value, { a: [1, 2], b: 1 });
  const bad = extractJson('{"a": 1\n "b": 2}');
  assert.ok(!bad.ok);
  assert.match(bad.msg, /2째 줄 \d+째 글자/);
});

test('부분 업데이트: upsert, _remove, secretValues', () => {
  const t = jeju();
  const { trip, log, secretValues } = mergeInto(t, {
    days: [{ date: '2026-11-21', plans: [{ id: 'A', items: [{ id: '1121-1135', time: '11:40' }, { id: '1121-1300', time: '13:00', title: '점심' }] }] }],
    places: [{ id: 'new', name: '새 장소' }],
    _remove: { items: ['1121-0940'], places: ['dolharu'] },
    secretValues: { trip_pin: '0000' },
  });
  const items = trip.days[0].plans[0].items;
  assert.equal(items.find((i) => i.id === '1121-1135').time, '11:40');
  assert.equal(items.find((i) => i.id === '1121-1135').title, '서프라이즈', '안 바꾼 키는 유지');
  assert.ok(items.some((i) => i.id === '1121-1300'));
  assert.ok(!items.some((i) => i.id === '1121-0940'));
  assert.ok(!trip.places.some((p) => p.id === 'dolharu'));
  assert.deepEqual(secretValues, { trip_pin: '0000' });
  assert.ok(!('secretValues' in trip) && !('_remove' in trip));
  assert.ok(trip.secrets.some((s) => s.key === 'trip_pin'));
  assert.ok(log.added.length >= 2 && log.removed.length === 2 && log.changed.length >= 1);
  assert.equal(t.days[0].plans[0].items.length, 3, '원본은 그대로');
});

test('새 여행 가져오기: 비밀값 분리와 감지', () => {
  const t = { ...jeju(), secretValues: { pnr: 'ABC123' }, secrets: [{ key: 'pnr', label: '예약번호' }] };
  const v = validateTrip(t);
  assert.equal(v.summary.secrets, 1);
  const { trip, secretValues } = prepareNewTrip(t);
  assert.equal(secretValues.pnr, 'ABC123');
  assert.ok(!JSON.stringify(trip).includes('ABC123'));
  const leak = jeju(); leak.transports[0].notes = '예약번호 ABC1234';
  assert.ok(validateTrip(leak).warnings.some((w) => w.kind === 'sensitive'));
  const miss = jeju(); miss.transports[0].notes = '{{secret:nokey}}';
  assert.ok(validateTrip(miss).warnings.some((w) => /nokey/.test(w.msg)));
});

test('분류', () => {
  assert.equal(classify(demo).kind, 'trip');
  assert.equal(classify({ schema: 'bundle/v1', trips: [] }).kind, 'bundle');
  assert.equal(classify({ days: [] }).kind, 'partial');
  assert.equal(classify([{ name: 'a' }]).kind, 'places');
});

test('변경 목록', () => {
  const a = jeju(), b = clone(a);
  b.days[0].plans[0].items.pop();
  b.places.push({ id: 'x', name: 'X' });
  const d = diffTrips(a, b);
  assert.ok(d.removed.some((x) => /서프라이즈/.test(x)));
  assert.ok(d.added.some((x) => /X/.test(x)));
});

test('시간대: 현지 벽시계 ↔ epoch', () => {
  const ms = toEpoch('2026-11-21T10:00', 'Asia/Seoul');
  assert.equal(new Date(ms).toISOString(), '2026-11-21T01:00:00.000Z');
  assert.equal(fromEpoch(ms, 'Asia/Ho_Chi_Minh'), '2026-11-21T08:00');
  assert.equal(nowIn('Asia/Seoul', ms).time, '10:00');
});

test('거리 추정과 구글 링크 해석', () => {
  const km = hav(33.518585, 126.517113, 33.473952, 126.52873);
  assert.ok(km > 4.9 && km < 5.2);
  assert.equal(estMin(10), 20);
  const r = parseMapLink('https://www.google.com/maps/place/%ED%95%98%EB%A6%AC%EB%B3%B4/@33.47,126.52,17z/data=!3d33.473952!4d126.52873');
  assert.equal(r.name, '하리보'); assert.equal(r.lat, 33.473952);
  assert.ok(parseMapLink('https://maps.app.goo.gl/abc').short);
});

test('숙소: 그날 밤과 기준점', () => {
  const t = jeju();
  assert.equal(stayForNight(t, '2026-11-21').id, 'sheraton');
  assert.equal(stayForNight(t, '2026-11-22').id, 'jw');
  assert.equal(stayForNight(t, '2026-11-25'), null);
  assert.equal(stayForDay(t, '2026-11-25').id, 'jw');
});

test('복제: 날짜 이동, 예약·비밀값·경비 비움', () => {
  const t = shiftTrip(demo, '2027-12-demo', '2027-12-04');
  assert.equal(t.meta.start, '2027-12-04'); assert.equal(t.meta.end, '2027-12-05');
  assert.equal(t.days[1].date, '2027-12-05');
  assert.equal(t.stays[0].checkIn, '2027-12-04T15:00');
  assert.deepEqual(t.transports, []); assert.deepEqual(t.secrets, []);
  assert.ok(!JSON.stringify(t).includes('{{secret:'));
  assert.equal(validateTrip(t).errors.length, 0);
});

test('.ics: UTC 시각과 알림', () => {
  const r = buildIcs(jeju());
  assert.ok(r.count > 3);
  assert.match(r.text, /DTSTART:20261120T064500Z/);     // 15:45 KST
  assert.match(r.text, /TRIGGER:-PT120M/);
});

test('프로필 요약에는 생년월일이 없다', () => {
  const s = profileSummary({ members: [{ label: '첫째', role: 'child', birth: '2021-06-01' }, { label: '어른1', role: 'adult', birth: '1988-01-01' }] }, '2026-11-20');
  assert.match(s, /첫째 만 5세\(65개월\)/);
  assert.ok(!s.includes('2021-06-01'));
});

test('강조색 위 글자색', () => {
  assert.equal(onColor('#EE8A1E'), '#1E2224');
  assert.equal(onColor('#1E6E73'), '#FFFFFF');
});
