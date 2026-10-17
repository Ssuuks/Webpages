/* trip/v1 다루기 — 조회, 오늘 숙소, 장소 합치기, 빈 양식 */
import { byId, addDays, RE_DATE, RE_DT, nowIn, daysBetween, hasXY, clone, toEpoch, fromEpoch } from './util.js';

export const CATS = [
  { id: 'see', label: '관광' }, { id: 'eat', label: '맛집' }, { id: 'cafe', label: '카페' },
  { id: 'shop', label: '쇼핑' }, { id: 'kids', label: '아이' }, { id: 'stay', label: '숙소' }, { id: 'other', label: '기타' },
];
export const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.id, c.label]));
export const ITEM_KINDS = ['visit', 'move', 'meal', 'rest', 'hotel', 'flight', 'other'];
export const KIND_LABEL = { visit: '방문', move: '이동', meal: '식사', rest: '휴식', hotel: '숙소', flight: '항공', other: '기타' };
export const TRANSPORT_KINDS = ['flight', 'car', 'parking', 'transfer', 'ferry', 'other'];
export const TRANSPORT_LABEL = { flight: '항공', car: '렌터카', parking: '주차', transfer: '픽업', ferry: '배', other: '기타' };
export const TONES = ['accent', 'good', 'warn', 'info', 'muted'];

/* 하루의 현재 안 */
export function activePlan(day) {
  if (!day || !Array.isArray(day.plans) || !day.plans.length) return null;
  return (day.activePlan && byId(day.plans, day.activePlan)) || day.plans[0];
}
export const dayByDate = (trip, date) => (trip.days || []).find((d) => d.date === date) || null;

/* 자정 넘김 해석: 12시 이후 항목 뒤에 오는 05시 이전 항목은 +24h */
export function itemMinutes(items) {
  let seenPm = false;
  return items.map((it) => {
    const m = it && it.time ? toMin(it.time) : null;
    if (m == null) return null;
    if (m >= 720) seenPm = true;
    return seenPm && m < 300 ? m + 1440 : m;
  });
}
function toMin(t) { const x = /^(\d{1,2}):(\d{2})$/.exec(t); return x ? (+x[1]) * 60 + (+x[2]) : null; }
export function itemEndMinutes(item, startMin) {
  if (startMin == null || !item.end) return null;
  let e = toMin(item.end); if (e == null) return null;
  while (e < startMin) e += 1440;
  return e;
}

/* 숙소 */
const dOf = (dt) => (dt || '').slice(0, 10);
export function stayForNight(trip, date) {    // 그날 밤 자는 곳
  return (trip.stays || []).find((s) => dOf(s.checkIn) && dOf(s.checkOut) && dOf(s.checkIn) <= date && date < dOf(s.checkOut)) || null;
}
export function stayForDay(trip, date) {      // 그날 거리 기준점이 되는 숙소 (마지막 날은 체크아웃하는 곳)
  const day = dayByDate(trip, date);
  if (day && day.stayId) { const s = byId(trip.stays, day.stayId); if (s) return s; }
  return stayForNight(trip, date)
    || (trip.stays || []).find((s) => dOf(s.checkOut) === date)
    || null;
}

/* 장소: 여행 places + 데이터셋 places (id가 같으면 여행 것이 우선) */
export function allPlaces(trip, datasets) {
  const out = (trip.places || []).map((p) => ({ ...p, _src: 'trip' }));
  const have = new Set(out.map((p) => p.id));
  for (const dsId of (trip.meta && trip.meta.datasets) || []) {
    const ds = datasets && datasets[dsId];
    if (!ds || !Array.isArray(ds.places)) continue;
    for (const p of ds.places) if (p && p.id && !have.has(p.id)) { out.push({ ...p, _src: dsId }); have.add(p.id); }
  }
  return out;
}
export function findPlace(trip, datasets, id) {
  if (!id) return null;
  const p = byId(trip.places, id);
  if (p) return { ...p, _src: 'trip' };
  for (const dsId of (trip.meta && trip.meta.datasets) || []) {
    const ds = datasets && datasets[dsId];
    const q = ds && byId(ds.places, id);
    if (q) return { ...q, _src: dsId };
  }
  return null;
}
export function badgeDict(trip, datasets) {
  const d = {};
  for (const dsId of (trip.meta && trip.meta.datasets) || []) {
    const ds = datasets && datasets[dsId];
    for (const b of (ds && ds.badges) || []) if (b && b.id) d[b.id] = b;
  }
  for (const b of trip.badges || []) if (b && b.id) d[b.id] = b;
  return d;
}
/* 데이터셋 장소를 여행 places로 복사 (일정에 넣을 때) */
export function adoptPlace(trip, datasets, id) {
  if (byId(trip.places, id)) return byId(trip.places, id);
  const p = findPlace(trip, datasets, id);
  if (!p) return null;
  const copy = clone(p); const src = copy._src; delete copy._src;
  if (src && src !== 'trip') copy.from = src;
  trip.places = trip.places || [];
  trip.places.push(copy);
  return copy;
}

/* 여행 상태 (날짜 기준) */
export function phase(meta, tz) {
  const today = nowIn(tz || (meta && meta.timezone) || 'Asia/Seoul').date;
  if (!meta || !RE_DATE.test(meta.start || '') || !RE_DATE.test(meta.end || '')) return { key: 'upcoming', today };
  if (today < meta.start) return { key: 'upcoming', today, dday: daysBetween(today, meta.start) };
  if (today > meta.end) return { key: 'past', today };
  return { key: 'ongoing', today, dayNo: daysBetween(meta.start, today) + 1 };
}
export function indexEntry(trip) {
  const m = trip.meta || {};
  return { id: trip.id, title: m.title || trip.id, start: m.start || null, end: m.end || null,
    status: m.status || 'planning', accent: m.accent || null, file: 'trips/' + trip.id + '.json' };
}

/* 기준점 후보: 숙소들 */
export function stayPoints(trip, datasets) {
  return (trip.stays || []).map((s) => {
    const p = findPlace(trip, datasets, s.placeId);
    return p && hasXY(p) ? { k: 'stay:' + s.id, l: s.name, lat: p.lat, lng: p.lng } : null;
  }).filter(Boolean);
}

/* 빈 양식 (프롬프트 {{template}}) */
export function blankTrip() {
  return {
    schema: 'trip/v1', id: 'YYYY-MM-지역', updatedAt: null,
    meta: { title: '', destination: '', country: '', start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', timezone: 'Asia/Seoul',
      currency: 'KRW', fx: { base: 'KRW', rate: 1 }, status: 'planning', accent: '#EE8A1E', summary: '', datasets: [] },
    travelers: [{ id: 'a1', role: 'adult', label: '어른1' }, { id: 'k1', role: 'child', label: '첫째', profileKey: 'child1' }],
    badges: [{ id: 'kids', label: '아이 추천', tone: 'good' }, { id: 'reserve', label: '예약 필요', tone: 'warn' }],
    stays: [{ id: '', name: '', placeId: '', checkIn: 'YYYY-MM-DDTHH:MM', checkOut: 'YYYY-MM-DDTHH:MM', phone: null,
      address: null, perks: [], notes: '', secretKeys: [], status: 'confirmed' }],
    transports: [{ id: '', kind: 'flight', title: '', from: '', to: '', start: 'YYYY-MM-DDTHH:MM', end: 'YYYY-MM-DDTHH:MM',
      placeId: null, phone: null, notes: '', secretKeys: [], status: 'confirmed',
      deadlines: [{ label: '', at: 'YYYY-MM-DDTHH:MM', after: null, before: null, bufferMin: null }] }],
    places: [{ id: '', name: '', cat: 'see', group: '', lat: null, lng: null, address: null, phone: null,
      hours: { default: 'HH:MM-HH:MM', lastEntry: null, closed: [], note: null }, badges: [], price: null, desc: '',
      pass: null, links: { map: null, web: null }, fav: false }],
    days: [{ date: 'YYYY-MM-DD', title: '', stayId: '', note: '', plans: [{ id: 'A', label: '기본', items: [
      { id: 'MMDD-HHMM', time: 'HH:MM', end: null, kind: 'visit', title: '', placeId: null, passUse: null,
        status: 'tentative', optional: false, note: '', leg: null }] }] }],
    passes: [],
    checklists: [{ id: 'pre', title: '출발 전', items: [{ id: 'pre-1', text: '', due: null, done: false }] }],
    emergency: { contacts: [{ label: '응급', phone: '119' }], scenarios: [{ id: '', title: '', steps: [] }] },
    contacts: [],
    budget: { planned: [{ cat: '', amount: 0, note: '' }], expenses: [] },
    notes: { decisions: [], openQuestions: [], retro: null },
    secrets: [{ key: '', label: '' }],
    secretValues: {},
  };
}

/* 가족 프로필 요약 (생년월일 없이 여행 시점 나이만) */
export function ageAt(birth, date) {
  if (!RE_DATE.test(birth || '') || !RE_DATE.test(date || '')) return null;
  const [by, bm, bd] = birth.split('-').map(Number), [y, m, d] = date.split('-').map(Number);
  let months = (y - by) * 12 + (m - bm) - (d < bd ? 1 : 0);
  return { years: Math.floor(months / 12), months };
}
export function profileSummary(profile, date) {
  const lines = [];
  const members = (profile.members || []).filter((m) => m.label);
  const ages = members.map((m) => {
    const a = ageAt(m.birth, date);
    if (!a) return m.label;
    return m.role === 'child' ? `${m.label} 만 ${a.years}세(${a.months}개월)` : `${m.label} 만 ${a.years}세`;
  });
  const adults = members.filter((m) => m.role === 'adult').length, kids = members.filter((m) => m.role === 'child').length;
  lines.push(`- 구성: 성인 ${adults}, 아이 ${kids}` + (ages.length ? ` (${ages.join(', ')}${date ? ', ' + date + ' 기준' : ''})` : ''));
  if (!members.some((m) => m.birth) && profile.fallbackAges) lines.push('- 나이: ' + profile.fallbackAges);
  if (profile.memberships) lines.push('- 멤버십: ' + profile.memberships);
  if (profile.likes) lines.push('- 선호: ' + profile.likes);
  if (profile.dislikes) lines.push('- 비선호: ' + profile.dislikes);
  return lines.join('\n');
}

/* 날짜 옮겨 복제 (지난 여행 → 새 여행) */
export function shiftTrip(src, newId, newStart) {
  const t = clone(src);
  const delta = daysBetween(src.meta.start, newStart);
  const sd = (d) => (RE_DATE.test(d || '') ? addDays(d, delta) : d);
  const sdt = (dt) => (dt && /^\d{4}-\d{2}-\d{2}T/.test(dt) ? addDays(dt.slice(0, 10), delta) + dt.slice(10) : dt);
  t.id = newId; t.updatedAt = new Date().toISOString();
  t.meta.start = sd(t.meta.start); t.meta.end = sd(t.meta.end); t.meta.status = 'planning';
  t.meta.title = (t.meta.title || '') + ' (복제)';
  (t.days || []).forEach((d) => {
    d.date = sd(d.date);
    (d.plans || []).forEach((p) => (p.items || []).forEach((it) => { it.status = 'tentative'; }));
  });
  t.stays = (t.stays || []).map((s) => ({ ...s, checkIn: sdt(s.checkIn), checkOut: sdt(s.checkOut), status: 'tentative', secretKeys: [] }));
  t.transports = [];
  (t.checklists || []).forEach((c) => (c.items || []).forEach((i) => { i.done = false; i.due = sd(i.due); }));
  (t.passes || []).forEach((p) => { p.activatedAt = null; p.uses = []; });
  t.budget = { planned: (t.budget && t.budget.planned) || [], expenses: [] };
  t.secrets = [];
  t.notes = { decisions: [], openQuestions: [], retro: null };
  const strip = (s) => (typeof s === 'string' ? s.replace(/\{\{secret:[\w.-]+\}\}/g, '') : s);
  (t.stays || []).forEach((s) => { s.notes = strip(s.notes); });
  return t;
}

/* 예약 오픈 알림: 일정에 넣은 장소의 예약 조건("바코드 7일 전", "24시간 전")으로 오픈 시각을 계산한다.
   숫자가 없는 조건("업체 전화")이나 '예약 필요' 배지는 방문일을 마감으로 둔다. */
export function reserveReminders(trip, datasets) {
  const out = [];
  const seen = new Set();
  for (const d of trip.days || []) {
    const plan = activePlan(d);
    for (const it of (plan && plan.items) || []) {
      if (!it.placeId || it.kind === 'move') continue;
      const p = findPlace(trip, datasets, it.placeId);
      if (!p) continue;
      const cond = (p.pass && p.pass.reserve) || null;
      const flagged = (p.badges || []).includes('reserve') || (it.badges || []).includes('reserve');
      if (!cond && !flagged) continue;
      const byItem = !cond && (it.badges || []).includes('reserve');   // 장소가 아니라 그 일정(예: 호텔 안 식당)에 예약이 필요
      const name = byItem ? (it.title || p.name) : p.name;
      const key = (byItem ? it.id : p.id) + '|' + d.date;
      if (seen.has(key)) continue;
      seen.add(key);
      const r = { placeId: p.id, name, visit: d.date, time: it.time || null, itemId: it.id, cond: cond || '예약 필요', key };
      const days = /(\d+)\s*일\s*전/.exec(cond || ''), hours = /(\d+)\s*시간\s*전/.exec(cond || '');
      if (days) { r.due = addDays(d.date, -Number(days[1])); r.kind = 'open'; r.text = `${name} 예약 오픈 (${cond}) · ${d.date.slice(5).replace('-', '/')} 방문`; }
      else if (hours) {
        const back = Math.ceil(Number(hours[1]) / 24);
        r.due = addDays(d.date, -back); r.at = it.time ? r.due + 'T' + it.time : null; r.kind = 'open';
        r.text = `${name} 예약 오픈 (${cond}) · ${d.date.slice(5).replace('-', '/')}${it.time ? ' ' + it.time : ''} 방문`;
      } else { r.due = d.date; r.kind = 'need'; r.text = `${name} ${r.cond} · ${d.date.slice(5).replace('-', '/')}${it.time ? ' ' + it.time : ''} 전`; }
      out.push(r);
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/* 여행 첫날 기준 가족 나이 (기기 전용 프로필) */
export function travelerAges(trip, profile) {
  const members = (profile && profile.members) || [];
  const date = trip.meta && trip.meta.start;
  const list = (trip.travelers && trip.travelers.length ? trip.travelers : members.map((m) => ({ label: m.label, role: m.role, profileKey: m.key })))
    .map((t) => {
      const m = members.find((x) => x.key === t.profileKey) || members.find((x) => x.label === t.label);
      const a = m ? ageAt(m.birth, date) : null;
      return { label: t.label || (m && m.label) || '', role: t.role || (m && m.role), age: a };
    });
  return { date, list, any: list.some((x) => x.age) };
}

/* 항공편 번호 (예: "진에어 LJ6435" → LJ6435) */
export function flightCode(title) {
  const m = /\b([A-Z][A-Z0-9]|[A-Z0-9][A-Z])\s?(\d{2,4})\b/.exec(String(title || ''));
  return m ? m[1] + m[2] : null;
}
export function flightLinks(t) {
  const code = flightCode(t.title);
  if (!code) return [];
  return [
    { label: '운항 정보(네이버)', href: 'https://search.naver.com/search.naver?query=' + encodeURIComponent(code + ' 운항정보') },
    { label: '운항 정보(구글)', href: 'https://www.google.com/search?q=' + encodeURIComponent(code + ' flight status') },
  ];
}
/* 공항 장소 찾기: 교통의 placeId → 이름에 출발지와 '공항'이 들어간 장소 */
export function airportPlace(trip, datasets, t) {
  if (t.placeId) return findPlace(trip, datasets, t.placeId);
  const from = String(t.from || '').replace(/\s|공항|국제/g, '');
  return (trip.places || []).find((p) => /공항|airport/i.test(p.name) && (!from || p.name.replace(/\s/g, '').includes(from))) || null;
}
const shiftDT = (dt, minutes, tz) => fromEpoch(toEpoch(dt, tz) + minutes * 60000, tz);
const norm = (x) => String(x || '').replace(/\s|[·,()\[\]'"]/g, '').toLowerCase();

/* 자동 알림: 예약 오픈 + 항공 체크인 + 공항 도착 목표 + 렌터카 반납 준비 + 레이트 체크아웃 요청
   이미 체크리스트에 손으로 적어 둔 것(이름이 겹침)이나 체크리스트로 옮긴 것은 뺀다. */
export function autoReminders(trip, datasets, profile) {
  const tz = (trip.meta && trip.meta.timezone) || 'Asia/Seoul';
  const out = reserveReminders(trip, datasets).map((r) => ({ ...r, source: 'reserve' }));
  const domestic = !trip.meta || !trip.meta.country || trip.meta.country === 'KR';
  for (const t of trip.transports || []) {
    if (t.kind === 'flight' && RE_DT.test(t.start || '')) {
      const opens = typeof t.checkinOpensH === 'number' ? t.checkinOpensH : 24;
      const at = shiftDT(t.start, -opens * 60, tz);
      out.push({ key: 'checkin|' + t.id, source: 'checkin', kind: 'open', name: t.title, due: at.slice(0, 10), at,
        cond: '온라인 체크인', text: `${t.title} 온라인 체크인 (보통 출발 ${opens}시간 전부터 · 항공사 앱에서 확인)` });
      const buf = typeof t.airportBufferMin === 'number' ? t.airportBufferMin : domestic ? 60 : 150;
      const arrive = shiftDT(t.start, -buf, tz);
      out.push({ key: 'airport|' + t.id, source: 'airport', kind: 'time', name: t.title, due: arrive.slice(0, 10), at: arrive, transportId: t.id,
        cond: `출발 ${buf}분 전 도착`, text: `${t.title} 공항 도착 목표 ${arrive.slice(11)} (출발 ${t.start.slice(11)}, ${buf}분 전)` });
    }
    if (t.kind === 'car' && RE_DT.test(t.end || '')) {
      const at = shiftDT(t.end, -120, tz);
      out.push({ key: 'return|' + t.id, source: 'return', kind: 'time', name: t.title, due: at.slice(0, 10), at, transportId: t.id,
        cond: '반납 준비', text: `${t.title} 반납 준비: 주유(계약 조건 확인)·짐·카시트·쓰레기 (계약 종료 ${t.end.slice(11)})` });
    }
  }
  const late = /레이트/.test((profile && profile.memberships) || '');
  for (const st of trip.stays || []) {
    if (!RE_DT.test(st.checkOut || '')) continue;
    if (!late && !/레이트/.test((st.perks || []).join(' '))) continue;
    const at = addDays(st.checkOut.slice(0, 10), -1) + 'T20:00';
    out.push({ key: 'late|' + st.id, source: 'late', kind: 'time', name: st.name, due: at.slice(0, 10), at,
      cond: '레이트 체크아웃', text: `${st.name} 레이트 체크아웃 요청 (체크아웃 ${st.checkOut.slice(5, 10).replace('-', '/')} ${st.checkOut.slice(11)})` });
  }
  const items = (trip.checklists || []).flatMap((c) => c.items || []);
  const covered = (r) => items.some((i) => i.fromReminder === r.key
    || (r.source === 'reserve' && r.name && norm(i.text).includes(norm(r.name).slice(0, 6))));
  return out.filter((r) => !covered(r)).sort((a, b) => (a.at || a.due + 'T09:00').localeCompare(b.at || b.due + 'T09:00'));
}

/* ── 요금: 우리 가족 기준 ─────────────────────────────
   분류 기본값: 36개월 미만 infant · 36개월~만 12세 child · 만 13~18세 youth · 만 19세 이상 adult (시설마다 다를 수 있음) */
export function fareCategory(age, role) {
  if (!age) return role === 'child' ? 'child' : 'adult';
  if (age.months < 36) return 'infant';
  if (age.years <= 12) return 'child';
  if (age.years <= 18) return 'youth';
  return 'adult';
}
export function familyCategories(trip, profile) {
  const fa = travelerAges(trip, profile || {});
  return fa.list.map((x) => ({ label: x.label, cat: fareCategory(x.age, x.role) }));
}
/* table: {adult, youth, child, infant} → 합계. 모르는 값이 있으면 known=false */
export function familyFare(table, cats) {
  if (!table || typeof table !== 'object') return { total: null, known: false };
  let total = 0, known = true;
  for (const c of cats) {
    let v = table[c.cat];
    if (v == null && c.cat === 'youth') v = table.adult;      // 청소년 요금이 없으면 성인 요금
    if (v == null && c.cat === 'infant') v = 0;               // 영유아 요금이 없으면 무료로 봄(대부분)
    if (typeof v !== 'number') { known = false; continue; }
    total += v;
  }
  return { total, known };
}
/* 패스 손익(계획 기준): 패스로 들어가는 일정의 정가 합계 − (패스값 + 추가금) */
export function passRoi(trip, datasets, pass, profile) {
  const cats = familyCategories(trip, profile);
  const rows = [];
  for (const d of trip.days || []) {
    const plan = activePlan(d);
    for (const it of (plan && plan.items) || []) {
      if (it.passUse !== pass.id || it.skipped) continue;
      const p = findPlace(trip, datasets, it.placeId);
      const regular = familyFare(p && p.prices, cats);
      const sur = p && p.pass && p.pass.surchargePrices ? familyFare(p.pass.surchargePrices, cats)
        : (p && (p.badges || []).includes('surcharge') ? { total: null, known: false } : { total: 0, known: true });
      rows.push({ date: d.date, title: it.title, place: p, regular, surcharge: sur,
        saved: regular.known && sur.known ? regular.total - sur.total : null });
    }
  }
  const cost = (typeof pass.price === 'number' ? pass.price : 0) * (pass.holders || cats.length || 1);
  const known = rows.filter((r) => r.saved != null);
  const saved = known.reduce((a, r) => a + r.saved, 0);
  return { rows, cost, saved, net: saved - cost, unknown: rows.length - known.length, people: cats.length };
}
