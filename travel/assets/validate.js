/* trip/v1 검사 — 오류(저장 불가)와 경고(저장 가능), 요약, 비밀값 감지
   메시지는 무엇이 틀렸고 어떻게 고치는지 쓴다. DOM을 쓰지 않아 node에서도 테스트한다. */
import { RE_DATE, RE_TIME, RE_DT, WEEK, WEEK_KO, weekday, byId, fmtDate, toEpoch, fromEpoch, hhmm, mins, distKm, hasXY } from './util.js';
import { activePlan, itemMinutes, itemEndMinutes, findPlace, badgeDict, ITEM_KINDS, TRANSPORT_KINDS, TONES, CATS } from './model.js';

const CAT_IDS = CATS.map((c) => c.id);
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const isArr = Array.isArray;

/* 민감정보로 보이는 문자열 (본문에 들어가면 경고) */
const SENSITIVE = [
  { re: /(예약\s*번호|PNR|확인\s*번호|confirmation)\s*[:：]?\s*[A-Z0-9]{5,}/i, label: '예약번호' },
  { re: /\bPIN\s*[:：]?\s*\d{4,}/i, label: 'PIN' },
  { re: /\d{2,3}[가-힣]\s?\d{4}/, label: '차량번호' },
  { re: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, label: '카드번호' },
  { re: /\b[MSRGD]\d{8}\b/, label: '여권번호' },
  { re: /\b\d{6}-?[1-4]\d{6}\b/, label: '주민등록번호' },
];

function dayLabel(trip, date) {
  const i = (trip.days || []).findIndex((d) => d.date === date);
  return i >= 0 ? `${i + 1}째 날(${fmtDate(date)})` : fmtDate(date);
}

export function validateTrip(trip, opts = {}) {
  const datasets = opts.datasets || {};
  const E = [], W = [];
  const err = (path, msg) => E.push({ path, msg });
  const warn = (path, msg, ref) => W.push({ path, msg, ...(ref || {}) });

  if (!isObj(trip)) { err('', '최상위가 객체({ ... })가 아니에요. JSON 하나를 통째로 붙여넣으세요.'); return result(trip, E, W); }
  if (trip.schema !== 'trip/v1') err('schema', `schema 값이 "${trip.schema ?? '없음'}"이에요. "trip/v1"로 고치세요.`);
  if (!trip.id || typeof trip.id !== 'string') err('id', 'id가 없어요. "2026-11-jeju"처럼 YYYY-MM-지역 형식으로 넣으세요.');
  else if (!/^\d{4}-\d{2}-[\w가-힣-]+$/.test(trip.id)) warn('id', `id "${trip.id}"가 YYYY-MM-지역 형식이 아니에요. 파일 이름으로 쓰이니 영문·숫자·하이픈을 권장해요.`);
  if (trip.updatedAt != null && isNaN(Date.parse(trip.updatedAt))) warn('updatedAt', 'updatedAt이 날짜로 읽히지 않아요. 저장할 때 앱이 다시 채웁니다.');

  const m = trip.meta;
  if (!isObj(m)) { err('meta', 'meta 블록이 없어요. title, start, end, timezone, currency를 넣으세요.'); return result(trip, E, W); }
  for (const k of ['title', 'start', 'end', 'timezone', 'currency']) if (!m[k]) err('meta.' + k, `meta.${k}가 비어 있어요.`);
  if (m.start && !RE_DATE.test(m.start)) err('meta.start', `meta.start "${m.start}"는 YYYY-MM-DD 형식이어야 해요.`);
  if (m.end && !RE_DATE.test(m.end)) err('meta.end', `meta.end "${m.end}"는 YYYY-MM-DD 형식이어야 해요.`);
  if (RE_DATE.test(m.start || '') && RE_DATE.test(m.end || '') && m.start > m.end) err('meta', `시작일(${m.start})이 종료일(${m.end})보다 늦어요.`);
  if (m.timezone) { try { new Intl.DateTimeFormat('en', { timeZone: m.timezone }); } catch { err('meta.timezone', `시간대 "${m.timezone}"를 모르겠어요. "Asia/Seoul"처럼 IANA 이름을 쓰세요.`); } }
  if (m.accent && !/^#[0-9a-f]{6}$/i.test(m.accent)) warn('meta.accent', `강조색 "${m.accent}"는 #RRGGBB 형식이어야 해요. 기본색을 씁니다.`);
  if (m.fx != null && (!isObj(m.fx) || typeof m.fx.rate !== 'number')) warn('meta.fx', 'meta.fx는 {"base":"KRW","rate":숫자} 형식이어야 해요.');
  if (m.datasets != null && !isArr(m.datasets)) err('meta.datasets', 'meta.datasets는 배열이어야 해요.');
  for (const id of m.datasets || []) if (!datasets[id]) warn('meta.datasets', `데이터셋 "${id}"가 이 기기에 없어요. 저장소에서 불러오면 장소 탭에 함께 보여요.`);

  const inRange = (d) => !RE_DATE.test(m.start || '') || !RE_DATE.test(m.end || '') || (d >= m.start && d <= m.end);
  const blocks = ['travelers', 'badges', 'stays', 'transports', 'places', 'days', 'passes', 'checklists', 'contacts', 'secrets'];
  for (const b of blocks) if (trip[b] != null && !isArr(trip[b])) err(b, `${b}는 배열([ ... ])이어야 해요.`);
  if (!isArr(trip.days)) err('days', 'days가 없어요. 날짜마다 {"date","plans":[{"id":"A","items":[]}]}를 넣으세요.');

  /* id 유일성 */
  const uniq = (arr, path) => {
    const seen = new Set();
    (arr || []).forEach((x, i) => {
      if (!isObj(x)) { err(`${path}[${i}]`, `${path}의 ${i + 1}번째 항목이 객체가 아니에요.`); return; }
      if (!x.id) { err(`${path}[${i}]`, `${path}의 ${i + 1}번째 항목(${x.name || x.title || x.label || ''})에 id가 없어요.`); return; }
      if (seen.has(x.id)) err(`${path}[${i}]`, `${path}에 id "${x.id}"가 두 번 있어요. 하나를 다른 id로 바꾸세요.`);
      seen.add(x.id);
    });
  };
  for (const b of ['badges', 'stays', 'transports', 'places', 'passes', 'checklists']) if (isArr(trip[b])) uniq(trip[b], b);

  const badges = badgeDict(trip, datasets);
  const badgeOk = (ids, path, what) => {
    if (ids == null) return;
    if (!isArr(ids)) { err(path, `${what}의 badges는 배열이어야 해요.`); return; }
    for (const b of ids) if (!badges[b]) err(path, `${what}의 배지 "${b}"가 배지 사전(badges)에 없어요. badges에 {"id":"${b}","label":"...","tone":"info"}를 추가하거나 배지를 지우세요.`);
  };
  (trip.badges || []).forEach((b, i) => { if (isObj(b) && b.tone && !TONES.includes(b.tone)) warn(`badges[${i}]`, `배지 "${b.id}"의 tone "${b.tone}"은 ${TONES.join('·')} 중 하나여야 해요.`); });

  /* 장소 */
  const placeOk = (id) => !!findPlace(trip, datasets, id);
  const placeInTrip = (id) => !!byId(trip.places, id);
  (trip.places || []).forEach((p, i) => {
    if (!isObj(p)) return;
    const what = `장소 "${p.name || p.id}"`;
    if (!p.name) err(`places[${i}].name`, `${what}에 name이 없어요.`);
    if (p.cat && !CAT_IDS.includes(p.cat)) warn(`places[${i}].cat`, `${what}의 cat "${p.cat}"는 ${CAT_IDS.join('·')} 중 하나여야 해요. '기타'로 보여요.`);
    if (p.lat == null || p.lng == null) warn(`places[${i}]`, `${what}에 좌표가 없어요. 거리순 정렬·지도에서 빠져요.`, { kind: 'coords', placeId: p.id });
    else if (typeof p.lat !== 'number' || typeof p.lng !== 'number' || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) err(`places[${i}]`, `${what}의 좌표가 숫자가 아니거나 범위를 벗어났어요.`);
    badgeOk(p.badges, `places[${i}].badges`, what);
    if (p.hours != null) checkHours(p.hours, `places[${i}].hours`, what, warn);
    if (p.pass && p.pass.id && !byId(trip.passes, p.pass.id)) warn(`places[${i}].pass`, `${what}의 패스 "${p.pass.id}"가 passes에 없어요.`);
  });

  /* 좌표 이상치: 다른 장소들의 중앙에서 150km 넘게 떨어진 곳 (AI가 좌표를 잘못 넣었을 수 있음) */
  const withXY = (trip.places || []).filter((p) => isObj(p) && hasXY(p));
  if (withXY.length >= 3) {
    const med = (arr) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    const center = { lat: med(withXY.map((p) => p.lat)), lng: med(withXY.map((p) => p.lng)) };
    for (const p of withXY) {
      const km = distKm(center, p);
      if (km > 150) warn('places', `장소 "${p.name}"의 좌표가 다른 장소들과 ${Math.round(km)}km 떨어져 있어요. 좌표가 맞는지 확인하세요(맞으면 무시해도 돼요).`, { kind: 'coords-far', placeId: p.id });
    }
  }

  /* 숙소·교통 */
  (trip.stays || []).forEach((s, i) => {
    if (!isObj(s)) return;
    const what = `숙소 "${s.name || s.id}"`;
    for (const k of ['checkIn', 'checkOut']) if (s[k] != null && !RE_DT.test(s[k])) err(`stays[${i}].${k}`, `${what}의 ${k} "${s[k]}"는 YYYY-MM-DDTHH:MM 형식이어야 해요.`);
    if (RE_DT.test(s.checkIn || '') && RE_DT.test(s.checkOut || '') && s.checkIn >= s.checkOut) err(`stays[${i}]`, `${what}의 체크인이 체크아웃보다 늦어요.`);
    if (s.placeId && !placeOk(s.placeId)) err(`stays[${i}].placeId`, `${what}의 placeId "${s.placeId}"가 장소 목록에 없어요. 장소를 추가하거나 id를 고치세요.`);
  });
  (trip.transports || []).forEach((t, i) => {
    if (!isObj(t)) return;
    const what = `교통 "${t.title || t.id}"`;
    if (t.kind && !TRANSPORT_KINDS.includes(t.kind)) warn(`transports[${i}].kind`, `${what}의 kind "${t.kind}"는 ${TRANSPORT_KINDS.join('·')} 중 하나여야 해요.`);
    for (const k of ['start', 'end']) if (t[k] != null && !RE_DT.test(t[k])) err(`transports[${i}].${k}`, `${what}의 ${k} "${t[k]}"는 YYYY-MM-DDTHH:MM 형식이어야 해요.`);
    if (t.placeId && !placeOk(t.placeId)) err(`transports[${i}].placeId`, `${what}의 placeId "${t.placeId}"가 장소 목록에 없어요.`);
    (t.deadlines || []).forEach((d, j) => {
      if (!isObj(d) || !RE_DT.test(d.at || '')) { err(`transports[${i}].deadlines[${j}]`, `${what}의 마감 ${j + 1}번 at은 YYYY-MM-DDTHH:MM 형식이어야 해요.`); return; }
      for (const k of ['after', 'before']) if (d[k] && !byId(trip.transports, d[k])) err(`transports[${i}].deadlines[${j}].${k}`, `${what}의 마감 "${d.label}"이 가리키는 교통 "${d[k]}"가 없어요.`);
    });
  });

  /* 날짜·일정 */
  const itemIds = new Set();
  const seenDates = new Set();
  (trip.days || []).forEach((d, di) => {
    if (!isObj(d)) { err(`days[${di}]`, `days의 ${di + 1}번째 항목이 객체가 아니에요.`); return; }
    if (!RE_DATE.test(d.date || '')) { err(`days[${di}].date`, `${di + 1}번째 날의 date "${d.date ?? ''}"는 YYYY-MM-DD 형식이어야 해요.`); return; }
    if (seenDates.has(d.date)) err(`days[${di}].date`, `${fmtDate(d.date)}가 days에 두 번 있어요. 하나로 합치세요.`);
    seenDates.add(d.date);
    if (!inRange(d.date)) err(`days[${di}].date`, `${fmtDate(d.date)}는 여행 기간(${m.start}~${m.end}) 밖이에요. 날짜나 meta.start/end를 고치세요.`);
    const dl = dayLabel(trip, d.date);
    if (d.stayId && !byId(trip.stays, d.stayId)) err(`days[${di}].stayId`, `${dl}의 stayId "${d.stayId}"가 숙소 목록(stays)에 없어요.`);
    if (!isArr(d.plans) || !d.plans.length) { err(`days[${di}].plans`, `${dl}에 plans가 없어요. [{"id":"A","label":"기본","items":[]}]를 넣으세요.`); return; }
    if (d.activePlan && !byId(d.plans, d.activePlan)) warn(`days[${di}].activePlan`, `${dl}의 activePlan "${d.activePlan}"가 없어서 첫 안을 보여줘요.`);
    const planIds = new Set();
    d.plans.forEach((p, pi) => {
      if (!isObj(p)) { err(`days[${di}].plans[${pi}]`, `${dl}의 ${pi + 1}번째 안이 객체가 아니에요.`); return; }
      if (!p.id) err(`days[${di}].plans[${pi}]`, `${dl}의 ${pi + 1}번째 안에 id가 없어요.`);
      else if (planIds.has(p.id)) err(`days[${di}].plans[${pi}]`, `${dl}에 안 id "${p.id}"가 두 번 있어요.`);
      planIds.add(p.id);
      if (!isArr(p.items)) { err(`days[${di}].plans[${pi}].items`, `${dl} "${p.label || p.id}" 안의 items가 배열이 아니에요.`); return; }
      p.items.forEach((it, ii) => {
        const path = `days[${di}].plans[${pi}].items[${ii}]`;
        if (!isObj(it)) { err(path, `${dl}의 ${ii + 1}번째 일정이 객체가 아니에요.`); return; }
        const at = `${dl} ${it.time || (ii + 1) + '번째'} 항목`;
        if (!it.id) err(path, `${at}("${it.title || ''}")에 id가 없어요. "MMDD-HHMM"처럼 넣으세요.`);
        else if (itemIds.has(it.id)) err(path, `일정 항목 id "${it.id}"가 여러 번 있어요. 여행 전체에서 유일해야 해요.`);
        else itemIds.add(it.id);
        if (!it.title) warn(path, `${at}에 title이 없어요.`);
        if (it.time != null && !RE_TIME.test(it.time)) err(path + '.time', `${at}의 time "${it.time}"는 HH:MM(24시간) 형식이어야 해요.`);
        if (it.end != null && !RE_TIME.test(it.end)) err(path + '.end', `${at}의 end "${it.end}"는 HH:MM 형식이어야 해요.`);
        if (it.kind && !ITEM_KINDS.includes(it.kind)) warn(path + '.kind', `${at}의 kind "${it.kind}"는 ${ITEM_KINDS.join('·')} 중 하나여야 해요.`);
        if (it.placeId && !placeOk(it.placeId)) err(path + '.placeId', `${at}의 placeId '${it.placeId}'가 장소 목록에 없어요. 장소를 추가하거나 id를 고치세요.`);
        else if (it.placeId && !placeInTrip(it.placeId)) warn(path + '.placeId', `${at}의 장소 '${it.placeId}'는 데이터셋에만 있어요. 저장할 때 여행 장소로 복사합니다.`, { kind: 'adopt', placeId: it.placeId });
        if (it.passUse && !byId(trip.passes, it.passUse)) err(path + '.passUse', `${at}의 passUse '${it.passUse}'가 패스 목록(passes)에 없어요.`);
        if (it.transportId && !byId(trip.transports, it.transportId)) warn(path + '.transportId', `${at}의 transportId '${it.transportId}'가 교통 목록에 없어요.`);
        badgeOk(it.badges, path + '.badges', at);
        if (it.leg != null && (!isObj(it.leg) || (it.leg.km != null && typeof it.leg.km !== 'number') || (it.leg.min != null && typeof it.leg.min !== 'number'))) warn(path + '.leg', `${at}의 leg는 {"km":숫자,"min":숫자} 형식이어야 해요.`);
      });
    });
  });

  /* 패스·체크리스트 */
  (trip.passes || []).forEach((p, i) => {
    if (!isObj(p)) return;
    if (p.validHours != null && typeof p.validHours !== 'number') err(`passes[${i}].validHours`, `패스 "${p.name || p.id}"의 validHours는 숫자(시간)여야 해요.`);
    if (p.activatedAt != null && !RE_DT.test(p.activatedAt)) err(`passes[${i}].activatedAt`, `패스 "${p.name || p.id}"의 activatedAt은 YYYY-MM-DDTHH:MM 또는 null이어야 해요.`);
  });
  (trip.checklists || []).forEach((c, i) => {
    if (!isObj(c)) return;
    const seen = new Set();
    (c.items || []).forEach((it, j) => {
      if (!isObj(it)) return;
      if (!it.id) err(`checklists[${i}].items[${j}]`, `체크리스트 "${c.title}"의 ${j + 1}번째 항목에 id가 없어요.`);
      else if (seen.has(it.id)) err(`checklists[${i}].items[${j}]`, `체크리스트 "${c.title}"에 id "${it.id}"가 두 번 있어요.`);
      seen.add(it.id);
      if (it.due != null && !RE_DATE.test(it.due)) warn(`checklists[${i}].items[${j}].due`, `"${it.text}"의 마감일 "${it.due}"는 YYYY-MM-DD 형식이어야 해요.`);
    });
  });
  if (trip.emergency != null && !isObj(trip.emergency)) err('emergency', 'emergency는 {"contacts":[],"scenarios":[]} 형식이어야 해요.');
  if (trip.budget != null && !isObj(trip.budget)) err('budget', 'budget은 {"planned":[],"expenses":[]} 형식이어야 해요.');
  if (trip.notes != null && !isObj(trip.notes)) err('notes', 'notes는 {"decisions":[],"openQuestions":[],"retro":null} 형식이어야 해요.');

  /* 비밀값 참조 */
  const keys = new Set((trip.secrets || []).map((s) => s && s.key).filter(Boolean));
  const text = JSON.stringify({ ...trip, secrets: undefined, secretValues: undefined });
  const refs = new Set(); text.replace(/\{\{secret:([\w.-]+)\}\}/g, (_, k) => { refs.add(k); return ''; });
  for (const k of refs) if (!keys.has(k)) warn('secrets', `본문의 {{secret:${k}}}가 secrets 목록에 없어요. secrets에 {"key":"${k}","label":"..."}를 추가하세요.`);
  for (const s of SENSITIVE) if (s.re.test(text)) warn('secrets', `본문에 ${s.label}처럼 보이는 값이 있어요. secretValues로 옮기고 본문에는 {{secret:키}}를 쓰세요.`, { kind: 'sensitive' });

  /* 일정 점검 경고 */
  if (!E.length && !opts.skipChecks) W.push(...scheduleChecks(trip, datasets));
  if (!E.length && !opts.skipChecks && opts.rules) W.push(...familyChecks(trip, datasets, opts.rules));

  return result(trip, E, W);
}

function checkHours(hrs, path, what, warn) {
  if (!isObj(hrs)) { warn(path, `${what}의 hours는 {"default":"10:00-19:00","closed":[]} 형식이어야 해요.`); return; }
  const RE_RANGE = /^([01]\d|2[0-4]):[0-5]\d-([01]\d|2[0-4]):[0-5]\d$/;
  for (const k of ['default', ...WEEK]) if (hrs[k] != null && !RE_RANGE.test(hrs[k])) warn(`${path}.${k}`, `${what}의 운영시간 "${hrs[k]}"는 "HH:MM-HH:MM" 형식이어야 해요.`);
  if (hrs.closed != null && (!isArr(hrs.closed) || hrs.closed.some((d) => !WEEK.includes(d)))) warn(`${path}.closed`, `${what}의 휴무일은 ["mon","sun"]처럼 mon~sun 배열이어야 해요.`);
}

function result(trip, E, W) {
  const s = { days: 0, items: 0, places: 0, stays: 0, transports: 0, secrets: 0 };
  if (isObj(trip)) {
    s.days = isArr(trip.days) ? trip.days.length : 0;
    s.items = (trip.days || []).reduce((a, d) => a + ((activePlan(d) || {}).items || []).length, 0);
    s.places = isArr(trip.places) ? trip.places.length : 0;
    s.stays = isArr(trip.stays) ? trip.stays.length : 0;
    s.transports = isArr(trip.transports) ? trip.transports.length : 0;
    s.secrets = isObj(trip.secretValues) ? Object.keys(trip.secretValues).length : 0;
  }
  return { ok: E.length === 0, errors: E, warnings: W, summary: s };
}

/* ── 일정 점검 (§A7.2) ─────────────────────────────── */
/* 운영시간: 그날 요일의 범위 → [open, close] 분 / 휴무면 'closed' / 정보 없음 null */
export function hoursOn(hrs, date) {
  if (!isObj(hrs)) return null;
  const wd = weekday(date);
  if (isArr(hrs.closed) && hrs.closed.includes(wd)) return 'closed';
  const r = hrs[wd] || hrs.default;
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(r || '');
  if (!m) return null;
  let o = (+m[1]) * 60 + (+m[2]), c = (+m[3]) * 60 + (+m[4]);
  if (c <= o) c += 1440;
  const le = /^(\d{2}):(\d{2})$/.exec(hrs.lastEntry || '');
  return { open: o, close: c, lastEntry: le ? (+le[1]) * 60 + (+le[2]) : null, text: r };
}

export function scheduleChecks(trip, datasets = {}) {
  const W = [];
  const tz = (trip.meta && trip.meta.timezone) || 'Asia/Seoul';
  const add = (date, itemId, msg, kind) => W.push({ path: 'days', date, itemId, msg, kind: kind || 'check' });
  const passUses = {};   // passId → [{epoch, date, item}]

  for (const d of trip.days || []) {
    if (!isObj(d) || !RE_DATE.test(d.date || '')) continue;
    const plan = activePlan(d); if (!plan || !isArr(plan.items)) continue;
    const items = plan.items.filter(isObj);
    const dl = dayLabel(trip, d.date);
    const ms = itemMinutes(items);
    let prev = null;
    items.forEach((it, i) => {
      const start = ms[i];
      const at = `${dl} ${it.time || ''} ${it.title || ''}`.replace(/\s+/g, ' ').trim();
      if (start != null && prev) {
        if (start < prev.start) add(d.date, it.id, `${at}: 앞 항목(${prev.it.time})보다 시간이 빨라요. 순서나 시간을 확인하세요.`, 'order');
        else if (prev.end != null && start < prev.end) add(d.date, it.id, `${at}: 앞 일정 "${prev.it.title}"(~${prev.it.end})과 시간이 겹쳐요.`, 'overlap');
      }
      /* 이동 시간이 다음 일정까지 남은 시간보다 김 */
      if (it.kind === 'move' && it.leg && typeof it.leg.min === 'number' && start != null) {
        const next = items.slice(i + 1).map((x, k) => ({ x, m: ms[i + 1 + k] })).find((o) => o.m != null);
        if (next && start + it.leg.min > next.m) add(d.date, it.id, `${at}: 이동 ${it.leg.min}분이면 ${hhmm(start + it.leg.min)} 도착이라 다음 일정 ${next.x.time}에 늦어요.`, 'leg');
      }
      /* 이동 거리와 직선거리 비교 (앞뒤 장소 좌표가 있을 때) */
      if (it.kind === 'move' && it.leg && typeof it.leg.km === 'number') {
        const placeAt = (k) => { const x = items[k]; return x && x.kind !== 'move' && x.placeId ? findPlace(trip, datasets, x.placeId) : null; };
        let a = null, b = null;
        for (let k = i - 1; k >= 0 && !a; k--) { const q = placeAt(k); if (q && hasXY(q)) a = q; }
        for (let k = i + 1; k < items.length && !b; k++) { const q = placeAt(k); if (q && hasXY(q)) b = q; }
        const straight = a && b && a.id !== b.id ? distKm(a, b) : null;
        if (straight != null && straight > 1) {
          if (it.leg.km < straight * 0.8 - 0.5) add(d.date, it.id, `${at}: 이동 ${it.leg.km}km가 직선거리(${straight.toFixed(1)}km)보다 짧아요. 거리나 장소를 확인하세요.`, 'leg-dist');
          else if (it.leg.km > straight * 3 + 5) add(d.date, it.id, `${at}: 이동 ${it.leg.km}km가 직선거리(${straight.toFixed(1)}km)보다 훨씬 길어요. 거리나 장소를 확인하세요.`, 'leg-dist');
        }
      }
      /* 운영시간·휴무 */
      const p = it.placeId && findPlace(trip, datasets, it.placeId);
      if (p && p.hours && start != null && it.kind !== 'move') {
        const hrs = hoursOn(p.hours, d.date);
        const day = start >= 1440 ? null : d.date;
        if (hrs === 'closed' && day) add(d.date, it.id, `${at}: ${p.name}은(는) ${WEEK_KO[weekday(d.date)]}요일 휴무예요.`, 'closed');
        else if (hrs && day) {
          const end = itemEndMinutes(it, start);
          if (start < hrs.open || start >= hrs.close) add(d.date, it.id, `${at}: ${p.name} 운영시간(${hrs.text}) 밖이에요.`, 'hours');
          else if (hrs.lastEntry != null && start > hrs.lastEntry) add(d.date, it.id, `${at}: ${p.name} 입장 마감(${hhmm(hrs.lastEntry)})이 지났어요.`, 'hours');
          else if (end != null && end > hrs.close) add(d.date, it.id, `${at}: ${p.name}이(가) ${hhmm(hrs.close)}에 닫아서 끝나는 시각(${it.end})보다 일러요.`, 'hours');
        }
      }
      if (it.passUse && start != null) {
        const ep = toEpoch(d.date + 'T' + hhmm(start % 1440), tz) + (start >= 1440 ? 86400000 : 0);
        (passUses[it.passUse] = passUses[it.passUse] || []).push({ epoch: ep, date: d.date, item: it, at });
      }
      if (start != null) prev = { it, start, end: itemEndMinutes(it, start) };
    });
    /* 체크아웃 뒤의 숙소 일정 */
    for (const s of trip.stays || []) {
      if (!RE_DT.test(s.checkOut || '') || s.checkOut.slice(0, 10) !== d.date) continue;
      const co = (+s.checkOut.slice(11, 13)) * 60 + (+s.checkOut.slice(14, 16));
      items.forEach((it, i) => {
        if (it.kind === 'hotel' && ms[i] != null && ms[i] > co && s.placeId && it.placeId === s.placeId)
          add(d.date, it.id, `${dl} ${it.time} ${it.title}: ${s.name} 체크아웃(${s.checkOut.slice(11)}) 뒤의 숙소 일정이에요. 레이트 체크아웃이면 메모에 남기세요.`, 'checkout');
      });
    }
  }

  /* 패스: 개시 → 만료, 시설 간 간격 */
  for (const pass of trip.passes || []) {
    if (!isObj(pass)) continue;
    const uses = (passUses[pass.id] || []).sort((a, b) => a.epoch - b.epoch);
    if (!uses.length) continue;
    const start = pass.activatedAt ? toEpoch(pass.activatedAt, tz) : uses[0].epoch;
    if (typeof pass.validHours === 'number') {
      const exp = start + pass.validHours * 3600000;
      for (const u of uses) if (u.epoch >= exp) add(u.date, u.item.id, `${u.at}: ${pass.name || '패스'}가 ${fromEpoch(exp, tz).replace('T', ' ')}에 만료된 뒤예요.`, 'pass');
    }
    if (typeof pass.intervalMinutes === 'number' && pass.intervalMinutes > 0) {
      for (let i = 1; i < uses.length; i++) {
        const gap = (uses[i].epoch - uses[i - 1].epoch) / 60000;
        if (gap < pass.intervalMinutes) add(uses[i].date, uses[i].item.id, `${uses[i].at}: 앞 패스 시설 입장 후 ${Math.round(gap)}분이에요. 기본권은 ${pass.intervalMinutes}분이 지나야 다음 시설에 들어갈 수 있어요.`, 'pass');
      }
    }
  }

  /* 교통 마감 */
  for (const t of trip.transports || []) {
    for (const dl of (isObj(t) && t.deadlines) || []) {
      if (!isObj(dl) || !RE_DT.test(dl.at || '')) continue;
      const at = toEpoch(dl.at, tz), buf = (dl.bufferMin || 0) * 60000;
      if (dl.after) {
        const o = byId(trip.transports, dl.after);
        if (o && RE_DT.test(o.end || '') && toEpoch(o.end, tz) + buf > at)
          add(dl.at.slice(0, 10), null, `${o.title} 도착(${o.end.slice(11)}) + ${dl.bufferMin || 0}분이 "${dl.label}"(${dl.at.slice(11)})보다 늦어요.`, 'deadline');
      }
      if (dl.before) {
        const o = byId(trip.transports, dl.before);
        if (o && RE_DT.test(o.start || '') && at + buf > toEpoch(o.start, tz))
          add(dl.at.slice(0, 10), null, `"${dl.label}"(${dl.at.slice(11)})과 ${o.title} 출발(${o.start.slice(11)}) 사이가 ${dl.bufferMin || 0}분보다 짧아요.`, 'deadline');
      }
    }
  }
  return W;
}

/* 데이터셋 검사 (가벼움) */
export function validateDataset(ds) {
  const E = [], W = [];
  if (!isObj(ds)) E.push({ path: '', msg: '데이터셋이 객체가 아니에요.' });
  else {
    if (ds.schema !== 'dataset/v1') E.push({ path: 'schema', msg: `schema 값이 "${ds.schema ?? '없음'}"이에요. "dataset/v1"로 고치세요.` });
    if (!ds.id) E.push({ path: 'id', msg: '데이터셋 id가 없어요.' });
    if (!isArr(ds.places)) E.push({ path: 'places', msg: 'places 배열이 없어요.' });
    const seen = new Set();
    (ds.places || []).forEach((p, i) => {
      if (!isObj(p) || !p.id) { E.push({ path: `places[${i}]`, msg: `${i + 1}번째 장소에 id가 없어요.` }); return; }
      if (seen.has(p.id)) E.push({ path: `places[${i}]`, msg: `장소 id "${p.id}"가 두 번 있어요.` });
      seen.add(p.id);
      if (p.lat == null) W.push({ path: `places[${i}]`, msg: `"${p.name}" 좌표 없음`, kind: 'coords' });
    });
  }
  return { ok: !E.length, errors: E, warnings: W, summary: { places: isObj(ds) && isArr(ds.places) ? ds.places.length : 0 } };
}

/* ── 가족 규칙 점검 ────────────────────────────────── */
export const DEFAULT_RULES = { maxOutings: 2, maxDriveMin: 90, maxLegMin: 60, bedtime: '20:30', mealGapH: 6 };
const MEALISH = /(조식|아침|점심|저녁|식사|브런치|간식|디너|런치|애프터눈티|해피아워|lunch|dinner|breakfast)/i;

/* 하루 요약: 고정 외출·선택 외출·운전 합계·패스 사용·가장 긴 이동 (건너뛴 일정은 빼고) */
export function daySummary(trip, day, datasets = {}) {
  const plan = activePlan(day);
  const items = ((plan && plan.items) || []).filter((it) => isObj(it) && !it.skipped);
  const stayPlaces = new Set((trip.stays || []).map((s) => s.placeId).filter(Boolean));
  const outing = (it) => {
    if (it.kind !== 'visit') return false;
    if (!it.placeId) return true;
    if (stayPlaces.has(it.placeId)) return false;
    const p = findPlace(trip, datasets, it.placeId);
    return !(p && p.cat === 'stay');
  };
  const legs = items.filter((it) => it.kind === 'move' && it.leg && typeof it.leg.min === 'number').map((it) => it.leg.min);
  return {
    fixed: items.filter((it) => outing(it) && !it.optional).length,
    optional: items.filter((it) => outing(it) && it.optional).length,
    drive: legs.reduce((a, b) => a + b, 0),
    longest: legs.length ? Math.max(...legs) : 0,
    pass: items.filter((it) => it.passUse).length,
  };
}

export function familyChecks(trip, datasets = {}, rules = {}) {
  const R = { ...DEFAULT_RULES, ...rules };
  const W = [];
  const add = (date, itemId, msg) => W.push({ path: 'days', date, itemId, msg, kind: 'family' });
  const stayPlaces = new Set((trip.stays || []).map((s) => s.placeId).filter(Boolean));
  const bed = mins(R.bedtime);
  for (const d of trip.days || []) {
    if (!isObj(d) || !RE_DATE.test(d.date || '')) continue;
    const plan = activePlan(d); if (!plan || !isArr(plan.items)) continue;
    const dl = dayLabel(trip, d.date);
    const sum = daySummary(trip, d, datasets);
    if (R.maxOutings && sum.fixed > R.maxOutings) add(d.date, null, `${dl}: 고정 외출이 ${sum.fixed}곳이에요(가족 기준 ${R.maxOutings}곳). 하나를 '선택'으로 바꾸거나 다른 날로 옮겨 보세요.`);
    if (R.maxDriveMin && sum.drive > R.maxDriveMin) add(d.date, null, `${dl}: 하루 운전이 ${sum.drive}분이에요(가족 기준 ${R.maxDriveMin}분).`);
    const items = plan.items.filter((it) => isObj(it) && !it.skipped);
    const ms = itemMinutes(items);
    const meals = [];
    items.forEach((it, i) => {
      if (it.kind === 'move' && it.leg && typeof it.leg.min === 'number' && R.maxLegMin && it.leg.min > R.maxLegMin)
        add(d.date, it.id, `${dl} ${it.time || ''} ${it.title}: 한 번에 ${it.leg.min}분 이동이에요(가족 기준 ${R.maxLegMin}분). 멀미·휴식을 생각해 중간에 쉬어 가세요.`);
      const atStay = it.placeId && stayPlaces.has(it.placeId);
      if (bed != null && ms[i] != null && ms[i] >= bed && !['hotel', 'rest', 'flight', 'move'].includes(it.kind) && !atStay)
        add(d.date, it.id, `${dl} ${it.time} ${it.title}: 아이 취침 시간(${R.bedtime}) 이후 외부 일정이에요.`);
      const text = `${it.title || ''} ${it.note || ''}`;
      if (ms[i] != null && (it.kind === 'meal' || MEALISH.test(text))) {
        const inNote = it.kind !== 'meal' && !MEALISH.test(it.title || '');
        meals.push({ at: inNote ? (itemEndMinutes(it, ms[i]) ?? ms[i]) : ms[i], it });
      }
    });
    if (R.mealGapH && meals.length >= 2) {
      for (let i = 1; i < meals.length; i++) {
        const gap = meals[i].at - meals[i - 1].at;
        if (gap > R.mealGapH * 60) add(d.date, meals[i].it.id, `${dl}: '${meals[i - 1].it.title}' 뒤 ${Math.floor(gap / 60)}시간 ${gap % 60 ? (gap % 60) + '분 ' : ''}동안 식사·간식이 없어요. 아이 간식을 챙기세요.`);
      }
    }
  }
  return W;
}
