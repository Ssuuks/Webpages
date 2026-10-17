#!/usr/bin/env node
/* 나트랑 2026 단일 HTML 앱 → trip/v1 일회성 이관 스크립트
   사용: node travel/tools/migrate-nhatrang.mjs <data.json> <nhatrang.html> <out.json>

   - data.json: plan.days, checks, places (사용자가 앱에서 고친 최신본)
   - nhatrang.html: 코드에 박힌 숙소 좌표(REFS), STAY_BY_DAY, 그룹 설명, 배지 이름,
     비상 탭, 준비 탭 체크리스트
   비밀값은 옮기지 않는다. {{pnr}} {{parking}} {{car}} 자리표시만 {{secret:키}}로 바꾸고
   키 이름은 유지해서 그 기기에 이미 저장된 값을 새 앱이 재사용하게 한다. */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , dataPath, htmlPath, outPath] = process.argv;
if (!dataPath || !htmlPath || !outPath) {
  console.error('사용: node migrate-nhatrang.mjs <data.json> <nhatrang.html> <out.json>');
  process.exit(1);
}
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const html = readFileSync(htmlPath, 'utf8');

const YEAR = 2026;
const TRIP_ID = '2026-10-nhatrang';
const KST_OFFSET_H = 2;           // 한국이 2시간 빠름

/* ── 작은 도구 ─────────────────────────────── */
const secretize = (s) => String(s ?? '').replace(/\{\{(pnr|parking|car)\}\}/g, '{{secret:$1}}');
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
/* HTML 조각 → 앱 텍스트: <b>는 *굵게*, 비밀값 자리는 {{secret:키}}, 나머지 태그 제거 */
function text(h) {
  if (h == null) return '';
  return decode(String(h)
    .replace(/<b data-secret="(\w+)">[^<]*<\/b>/g, '{{secret:$1}}')
    .replace(/<\/?(b|strong)>/g, '*')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}
const section = (id) => {
  const m = html.match(new RegExp(`<section class="panel" id="${id}"[^>]*>([\\s\\S]*?)</section>`));
  if (!m) throw new Error(`HTML에서 #${id} 섹션을 찾지 못했습니다`);
  return m[1];
};
const lineOf = (re) => { const m = html.match(re); if (!m) throw new Error(`HTML에서 ${re} 를 찾지 못했습니다`); return m[1]; };
const pad = (n) => String(n).padStart(2, '0');
function normTime(t) {
  const m = /^\s*(\d{1,2})\s*[:.]?\s*(\d{2})\s*$/.exec(t || '');
  return m ? `${pad(+m[1])}:${m[2]}` : null;
}
function shiftTime(t, h) {
  const [hh, mm] = t.split(':').map(Number);
  const v = ((hh * 60 + mm + h * 60) % 1440 + 1440) % 1440;
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
}
const dateOf = (d) => { const [m, dd] = d.split('.'); return `${YEAR}-${m}-${dd}`; };

/* ── HTML에 박힌 상수 ───────────────────────── */
const POI_DB = [...lineOf(/var POI_DB=\[([\s\S]*?)\];/).matchAll(/\{key:'([^']*)',\s*id:'([^']*)'/g)]
  .map((m) => ({ key: m[1], id: m[2] }));
const BASE_GROUPS = JSON.parse(lineOf(/var BASE_GROUPS=(\{.*?\});\n/));
const labelMap = (name) => Object.fromEntries(
  [...lineOf(new RegExp(`var ${name}=\\{([^}]*)\\}`)).matchAll(/(\w+):'([^']*)'/g)].map((m) => [m[1], m[2]]));
const KR_LABEL = labelMap('KR_LABEL');
const DEL_LABEL = labelMap('DEL_LABEL');
const REFS = Object.fromEntries([...lineOf(/var REFS=\[([\s\S]*?)\];/)
  .matchAll(/\{k:'(\w+)',l:'([^']*)'(?:,lat:(-?[\d.]+),lng:(-?[\d.]+))?\}/g)]
  .map((m) => [m[1], { label: m[2], lat: m[3] ? +m[3] : null, lng: m[4] ? +m[4] : null }]));
const STAY_BY_DAY = Object.fromEntries([...lineOf(/var STAY_BY_DAY=\{([^}]*)\}/)
  .matchAll(/(d\d\d):'(\w+)'/g)].map((m) => [m[1], m[2]]));

/* ── 배지 사전 ─────────────────────────────── */
const badges = [{ id: 'key', label: '중요', tone: 'accent' }];
const TONE = { good: 'good', care: 'warn', rain: 'info', short: 'muted' };
const tagIds = new Map();                 // "t|l" → badge id
for (const [k, l] of Object.entries(KR_LABEL)) badges.push({ id: `kr-${k}`, label: l, tone: k === 'warn' ? 'warn' : k === 'hi' ? 'info' : 'muted' });
for (const [k, l] of Object.entries(DEL_LABEL)) badges.push({ id: `del-${k}`, label: l, tone: k === 'pickup' ? 'good' : 'info' });
function tagBadge(t) {
  const sig = `${t.t}|${t.l}`;
  if (!tagIds.has(sig)) {
    const id = `tag-${tagIds.size + 1}`;
    tagIds.set(sig, id);
    badges.push({ id, label: t.l, tone: TONE[t.t] || 'info' });
  }
  return tagIds.get(sig);
}

/* ── 장소 ─────────────────────────────────── */
const groupCat = {};
for (const [tab, gs] of Object.entries(BASE_GROUPS)) for (const g of gs) groupCat[`${tab}|${g.n}`] = tab;
function catOf(p) {
  if (p.tab === 'eat' && p.grp === '디저트 · 커피') return 'cafe';
  if (p.tab === 'eat' && p.grp === '스파') return 'other';
  if (p.tab === 'see' && p.grp === '기념품 · 쇼핑') return 'shop';
  return p.tab === 'eat' ? 'eat' : 'see';
}
const deleted = new Set(data.placesDeleted || []);
const places = data.places.filter((p) => !deleted.has(p.id)).map((p) => {
  const b = (p.tags || []).map(tagBadge);
  if (p.kr) b.push(`kr-${p.kr}`);
  if (p.del) b.push(`del-${p.del}`);
  return {
    id: p.id, name: p.name, cat: catOf(p), group: p.grp || null,
    lat: p.lat ?? null, lng: p.lng ?? null, address: null, phone: null, hours: null,
    badges: b, price: null, desc: secretize(p.desc) || null, fav: false, pass: null,
    links: { map: p.url || null, web: null }, pid: p.pid || null,
    rating: p.rating ? (p.count ? `${p.rating} (${p.count})` : p.rating) : null,
  };
});
const placeIds = new Set(places.map((p) => p.id));

/* 숙소 (REFS 좌표 + 비상 탭의 숙소 연락처) */
const emergencyHtml = section('emergency');
const hotelRows = [...emergencyHtml.matchAll(/<li><div>([^<]+)<span>([^<]*)<\/span><\/div><a class="dial" href="tel:([^"]+)">/g)]
  .map((m) => ({ name: m[1].trim(), sub: decode(m[2]), phone: m[3] }));
const hotelBy = (needle) => hotelRows.find((h) => h.name.includes(needle)) || {};
const STAYS = [
  { id: 'fourpoints', ref: null, hotel: '포포인츠', name: '포포인츠 나트랑', checkIn: '2026-10-02T14:00', checkOut: '2026-10-03T12:00',
    status: 'tentative', notes: '첫날 밤은 무이네 해돋이 투어로 미사용 — 투어 확정 후 취소. 시각은 표준값', perks: [] },
  { id: 'sheraton', ref: 'sheraton', hotel: '쉐라톤', name: '쉐라톤 나트랑', checkIn: '2026-10-03T13:00', checkOut: '2026-10-05T10:30',
    status: 'confirmed', notes: '사막에서 14시 복귀 → 얼리 체크인 요청', perks: ['25층 클럽라운지 — 이번 여행 유일', '플래티넘 레이트체크아웃 16시 보장'] },
  { id: 'hontre', ref: 'hontre', hotel: '혼트레', name: '메리어트 혼트레 아일랜드', checkIn: '2026-10-05T18:00', checkOut: '2026-10-07T13:00',
    status: 'confirmed', notes: '케이블카 10분 · 빈원더스 옆. 도착 시 내륙 벨데스크에 짐 보관, 13시 레이트 체크아웃 요청', perks: [] },
  { id: 'jw', ref: 'jw', hotel: 'JW', name: 'JW 메리어트 깜란 베이', checkIn: '2026-10-07T15:00', checkOut: '2026-10-10T16:00',
    status: 'confirmed', notes: '공항 15분. 체크아웃 후 디파처룸 샤워', perks: ['디파처룸'] },
];
const stays = STAYS.map((s) => {
  const h = hotelBy(s.hotel);
  const r = s.ref ? REFS[s.ref] : null;
  const pid = `stay-${s.id}`;
  places.push({
    id: pid, name: s.name, cat: 'stay', group: '숙소', lat: r?.lat ?? null, lng: r?.lng ?? null,
    address: h.sub ? (h.sub.split('·')[1] || '').trim() || null : null, phone: h.phone || null, hours: null,
    badges: [], price: null, desc: h.sub || null, fav: false, pass: null, links: { map: null, web: null }, pid: null, rating: null,
  });
  placeIds.add(pid);
  return { id: s.id, name: s.name, placeId: pid, checkIn: s.checkIn, checkOut: s.checkOut, phone: h.phone || null,
    address: null, perks: s.perks, notes: s.notes, secretKeys: [], status: s.status };
});

/* ── 일정 ─────────────────────────────────── */
function matchPoi(s) {
  for (const p of POI_DB) if (s.includes(p.key) && placeIds.has(p.id)) return p.id;
  return null;
}
function kindOf(h) {
  if (/이륙|ICN|CXR/.test(h) && /→/.test(h)) return 'flight';
  if (/취침/.test(h)) return 'rest';
  if (/체크인|체크아웃/.test(h) && !/에어|항공/.test(h)) return 'hotel';
  if (/조식|점심|저녁|식사|아침/.test(h)) return 'meal';
  if (/낮잠|휴식/.test(h)) return 'rest';
  if (/→|출발|이동|케이블카|버기|복귀/.test(h)) return 'move';
  return 'visit';
}
/* 10.02 출국 전 항목과 10.11 발렛 출차는 원본이 한국 시각 → 현지 시각으로 */
function kstIndexes(day) {
  if (day.id === 'd02') {
    const i = day.items.findIndex((it) => /이륙/.test(it.h));
    return new Set(day.items.map((_, k) => k).filter((k) => k <= i));
  }
  if (day.id === 'd11') return new Set(day.items.map((it, k) => (/발렛/.test(it.h) ? k : -1)).filter((k) => k >= 0));
  return new Set();
}
function convItems(day, items, prefix, kst) {
  const md = day.date.replace('.', '');
  const used = new Set();
  return items.map((it, k) => {
    let time = normTime(it.t);
    let note = secretize(it.d) || null;
    if (time && kst.has(k)) {
      note = `한국 시각 ${time}${note ? ' · ' + note : ''}`;
      time = shiftTime(time, -KST_OFFSET_H);
    }
    let id = `${prefix}${md}-${time ? time.replace(':', '') : 'x' + (k + 1)}`;
    for (let c = 98; used.has(id); c++) id = id.replace(/-[a-z]$/, '') + '-' + String.fromCharCode(c);
    used.add(id);
    const placeId = (it.poi && placeIds.has(it.poi)) ? it.poi : matchPoi(`${it.h} ${it.d || ''}`);
    const out = { id, time, end: null, kind: kindOf(it.h), title: secretize(it.h) };
    if (placeId) out.placeId = placeId;
    if (note) out.note = note;
    if (it.k) out.badges = ['key'];
    return out;
  });
}
const convNotes = (ns) => (ns || []).map((n) => ({ kind: n.kind || 'info', title: secretize(n.h), text: secretize(n.d) }));
const days = data.plan.days.map((d) => {
  const kst = kstIndexes(d);
  const plans = [{ id: 'A', label: d.alt ? (d.altLabelA || '기본') : '기본', items: convItems(d, d.items, '', kst) }];
  if (d.alt) {
    plans.push({ id: 'B', label: d.alt.label || 'B안', note: secretize(d.alt.sub) || null,
      notes: convNotes(d.alt.notes), items: convItems(d, d.alt.items || [], 'b-', new Set()) });
  }
  const day = { date: dateOf(d.date), title: d.tag || null, stayId: STAY_BY_DAY[d.id] || null,
    note: secretize(d.sub) || null, notes: convNotes(d.notes), zone: d.zone || null, plans };
  if (d.alt && d.useAlt) day.activePlan = 'B';
  return day;
});

/* ── 비상 ─────────────────────────────────── */
const sos = [...emergencyHtml.matchAll(/<a href="tel:([^"]+)"><span class="k">([^<]+)<\/span><span class="v">([^<]+)<\/span><\/a>/g)]
  .map((m) => ({ label: m[2], phone: m[3], note: null }));
const scenarios = [];
const extraContacts = [];
for (const block of emergencyHtml.split('<div class="eblock">').slice(1)) {
  const title = text((block.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1]);
  if (!title || title === '숙소 연락처') continue;
  const desc = text((block.match(/<\/h3>\s*<p>([\s\S]*?)<\/p>/) || [])[1]) || null;
  const steps = [...block.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]));
  for (const m of block.matchAll(/<a class="dial" href="tel:([^"]+)">([^<]+)<\/a>/g)) {
    const label = text(m[2]).replace(/\s*[+0][\d\s-]+$/, '').trim()
      || (hotelRows.length && m[1] === '0327430750' ? '아마노코리아 (인천 발렛)' : '전화');
    if (!sos.concat(extraContacts).some((c) => c.phone.replace(/\D/g, '') === m[1].replace(/\D/g, '') || c.label === label)) {
      const after = block.slice(block.indexOf(m[0]) + m[0].length).match(/^\s*<p[^>]*>([\s\S]*?)<\/p>/);
      extraContacts.push({ label, phone: (text(m[2]).match(/[+0][\d\s-]+$/) || [m[1]])[0].trim(), note: after ? text(after[1]) : null });
    }
  }
  const id = ({ '아이가 아플 때': 'sick', '태풍이나 폭우': 'rain', '항공 지연이나 결항': 'delay', '아이를 놓쳤을 때': 'lost', '여권·카드 분실': 'passport' })[title]
    || `s${scenarios.length + 1}`;
  scenarios.push({ id, title, desc, steps });
}
const emergencyFoot = text((emergencyHtml.match(/<p class="foot">([\s\S]*?)<\/p>/) || [])[1]) || null;

/* ── 체크리스트 ───────────────────────────── */
const prepHtml = section('prep');
const checks = data.checks || {};
const checklists = [];
for (const block of prepHtml.split('<div class="pblock">').slice(1)) {
  if (!block.includes('class="ck"')) continue;
  const title = text((block.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1]);
  const items = [...block.matchAll(/data-id="(\w+)"><span class="lb">([\s\S]*?)<\/span><\/label>/g)].map((m) => {
    const um = m[2].match(/<u>([\s\S]*?)<\/u>/);
    return { id: m[1], text: text(m[2].replace(/<u>[\s\S]*?<\/u>/, '')), due: null, done: !!checks[m[1]], note: um ? text(um[1]) : null };
  });
  checklists.push({ id: title.includes('짐') ? 'pack' : 'pre', title: title.includes('짐') ? '준비물' : '출발 전 요청', items });
}

/* ── 조립 ─────────────────────────────────── */
const groups = Object.entries(BASE_GROUPS).flatMap(([tab, gs]) => gs.map((g) => ({ cat: tab, name: g.n, desc: g.s || null })));
const trip = {
  schema: 'trip/v1',
  id: TRIP_ID,
  updatedAt: data.updatedAt || new Date().toISOString(),
  meta: {
    title: '2026 나트랑·깜란 가족여행', destination: '나트랑·깜란', country: 'VN',
    start: '2026-10-02', end: '2026-10-11', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND',
    fx: { base: 'KRW', rate: 0.055 }, status: 'done', accent: '#1E6E73',
    summary: '무이네 해돋이 → 쉐라톤 2박 → 혼트레 2박(빈원더스 2일권) → JW 깜란 3박',
    datasets: [],
  },
  travelers: [
    { id: 'a1', role: 'adult', label: '어른1' }, { id: 'a2', role: 'adult', label: '어른2' },
    { id: 'k1', role: 'child', label: '첫째', profileKey: 'child1' }, { id: 'k2', role: 'child', label: '둘째', profileKey: 'child2' },
  ],
  badges,
  groups,
  stays,
  transports: [
    { id: 'parking', kind: 'parking', title: '인천 T2 예약주차장 발렛 · 아마노코리아', from: '인천공항 T2', to: null,
      start: '2026-10-02T15:00', end: '2026-10-11T06:00', placeId: null, phone: '032-743-0750',
      notes: '한국 시각 10/02 17:00 입고 ~ 10/11 08:00 출차 · 예약번호 {{secret:parking}} · 차량 {{secret:car}} · 단기주차장 지하1층 서편 진입부 접수장 · 요금은 귀국 때 후불',
      secretKeys: ['parking', 'car'], status: 'confirmed', deadlines: [] },
    { id: 'flight-out', kind: 'flight', title: '에어서울 RS527', from: '인천(T2)', to: '깜란',
      start: '2026-10-02T17:50', end: '2026-10-02T22:55', placeId: null, phone: null,
      notes: '한국 시각 19:50 출발 · 비행 5시간 5분 · 위탁 15kg · 예약번호 {{secret:pnr}}',
      secretKeys: ['pnr'], status: 'confirmed', deadlines: [] },
    { id: 'tour-muine', kind: 'transfer', title: '무이네 해돋이 투어', from: '깜란 공항', to: '쉐라톤 나트랑',
      start: '2026-10-03T02:00', end: '2026-10-03T13:00', placeId: null, phone: null,
      notes: '공항팀 02:00 출발 · 차량 4시간 · 3일 전 18시(한국)까지만 전액 환불', secretKeys: [], status: 'confirmed', deadlines: [] },
    { id: 'flight-back', kind: 'flight', title: '에어서울 (깜란 → 인천)', from: '깜란', to: '인천(T2)',
      start: '2026-10-11T00:05', end: '2026-10-11T05:10', placeId: null, phone: null,
      notes: '심야 출발 · 도착 한국 시각 07:10 · 예약번호 {{secret:pnr}}', secretKeys: ['pnr'], status: 'confirmed', deadlines: [] },
  ],
  places,
  days,
  passes: [],
  checklists,
  emergency: { contacts: sos.concat(extraContacts), scenarios, note: emergencyFoot },
  contacts: hotelRows.map((h) => ({ label: h.name, phone: h.phone, note: h.sub })).concat([{ label: '아마노코리아 (인천 발렛)', phone: '032-743-0750', note: null }]),
  budget: {
    planned: [
      { cat: '숙소', amount: 6087312, currency: 'VND', note: '쉐라톤 10.03–05 · 2박' },
      { cat: '숙소', amount: 5189184, currency: 'VND', note: '혼트레 10.05–07 · 2박' },
      { cat: '숙소', amount: 19060272, currency: 'VND', note: 'JW 깜란 10.07–10 · 3박' },
    ],
    expenses: [],
  },
  notes: {
    decisions: [
      '빈원더스 2일권 — 빈펄섬 2박 모두 이용, 무제한 재입장',
      '무이네 해돋이 투어 — 도착 당일 밤 출발',
      '마지막 날 체크아웃 후 스파 → JW 깜란 디파처룸에서 샤워',
      '공항 라운지 왕복 이용',
    ],
    openQuestions: [],
    retro: null,
  },
  secrets: [
    { key: 'pnr', label: '항공 예약번호' },
    { key: 'parking', label: '주차 예약번호' },
    { key: 'car', label: '차량번호' },
  ],
};

/* ── 자체 점검 ─────────────────────────────── */
const problems = [];
const pids = new Set(trip.places.map((p) => p.id));
const bids = new Set(trip.badges.map((b) => b.id));
const sids = new Set(trip.stays.map((s) => s.id));
for (const p of trip.places) for (const b of p.badges) if (!bids.has(b)) problems.push(`장소 ${p.id}: 배지 ${b} 없음`);
for (const d of trip.days) {
  if (d.date < trip.meta.start || d.date > trip.meta.end) problems.push(`${d.date}: 기간 밖`);
  if (d.stayId && !sids.has(d.stayId)) problems.push(`${d.date}: stayId ${d.stayId} 없음`);
  const ids = new Set();
  for (const pl of d.plans) for (const it of pl.items) {
    if (ids.has(it.id)) problems.push(`${d.date}: 항목 id ${it.id} 중복`);
    ids.add(it.id);
    if (it.placeId && !pids.has(it.placeId)) problems.push(`${it.id}: placeId ${it.placeId} 없음`);
    for (const b of it.badges || []) if (!bids.has(b)) problems.push(`${it.id}: 배지 ${b} 없음`);
  }
}
const secretKeys = new Set(trip.secrets.map((s) => s.key));
for (const m of JSON.stringify(trip).matchAll(/\{\{secret:(\w+)\}\}/g)) if (!secretKeys.has(m[1])) problems.push(`비밀값 키 ${m[1]} 정의 없음`);
if (/\{\{(pnr|parking|car)\}\}/.test(JSON.stringify(trip))) problems.push('옛 자리표시가 남아 있음');

writeFileSync(outPath, JSON.stringify(trip, null, 2) + '\n');
const nItems = trip.days.reduce((n, d) => n + d.plans.reduce((m, p) => m + p.items.length, 0), 0);
console.log(`${outPath}: ${trip.days.length}일, 일정 ${nItems}개, 장소 ${trip.places.length}곳, 배지 ${trip.badges.length}개, `
  + `체크리스트 ${checklists.map((c) => c.items.length).join('+')}개, 비상 시나리오 ${scenarios.length}개, 연락처 ${trip.emergency.contacts.length}개`);
if (problems.length) { console.error('문제:\n' + problems.join('\n')); process.exit(2); }
