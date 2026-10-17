/* 여행 안 화면: 오늘 · 일정 · 장소 · 준비 · 비상 */
import { h, clear, rich, byId, same, clone, fmtDate, fmtDT, weekday, WEEK, WEEK_KO, mins, hhmm, normTime, distKm, fmtKm,
  estMin, fmtLeg, hasXY, mapLinks, googlePlaceUrl, parseMapLink, copyText, toast, toEpoch, fmtDur, daysBetween, uid,
  plain } from './util.js';
import { activePlan, dayByDate, itemMinutes, itemEndMinutes, stayForDay, stayForNight, allPlaces, findPlace, adoptPlace,
  CATS, CAT_LABEL, ITEM_KINDS, KIND_LABEL, stayPoints } from './model.js';
import { scheduleChecks, hoursOn } from './validate.js';
import { extractJson } from './importer.js';
import { buildPrompt } from './prompts.js';
import { forecast, wxLabel, RAINY } from './weather.js';
import { getProfile, ui, setUi } from './store.js';
import { openSheet, ask, badges, pill, btn, linkBtn, telLink, field, input, textarea, select, checkbox, section, empty } from './ui.js';

/* 화면 상태(기기 메모리) */
const PV = {};   // tripId → 장소 탭 상태
const EDIT = {}; // tripId → 일정 편집 모드

/* ── 공통 ─────────────────────────────────────────── */
function selectedDate(ctx) {
  const days = (ctx.trip.days || []).map((d) => d.date);
  const saved = (ui().day || {})[ctx.trip.id];
  if (ctx.phase.key === 'ongoing' && days.includes(ctx.now.date) && !(ui().dayPicked || {})[ctx.trip.id + ctx.now.date]) return ctx.now.date;
  if (saved && days.includes(saved)) return saved;
  return days[0] || null;
}
function pickDate(ctx, date) {
  const u = ui(); u.day = u.day || {}; u.day[ctx.trip.id] = date;
  u.dayPicked = u.dayPicked || {}; u.dayPicked[ctx.trip.id + ctx.now.date] = true;
  setUi(u);
}
function checksFor(ctx) {
  if (!ctx._checks) ctx._checks = scheduleChecks(ctx.trip, ctx.datasets);
  return ctx._checks;
}
function dayEdited(ctx, date) {
  if (!ctx.base) return false;
  const a = dayByDate(ctx.trip, date), b = dayByDate(ctx.base, date);
  return !same(a, b);
}
export function weatherSlot(ctx, date, opts = {}) {
  const slot = h('span.wx', { 'aria-live': 'polite' });
  const st = stayForDay(ctx.trip, date);
  const p = st && findPlace(ctx.trip, ctx.datasets, st.placeId);
  const left = daysBetween(ctx.now.date, date);
  if (!p || !hasXY(p) || left < 0 || left > 15) return slot;
  forecast(p.lat, p.lng, ctx.tz).then((days) => {
    const w = wxLabel(days && days[date]);
    if (!w) return;
    slot.appendChild(h('span.wx-in', w.icon + ' ' + w.temp, ' · ', h('span' + (w.pop >= RAINY ? '.wx-rain' : ''), `강수 ${w.pop}%`)));
    if (w.pop >= RAINY && opts.onRain) slot.appendChild(opts.onRain());
  });
  return slot;
}
function rainAction(ctx, day) {
  return () => {
    const plan = activePlan(day);
    const rain = (day.plans || []).find((p) => p !== plan && (p.id === 'rain' || /우천|비/.test(p.label || '')));
    if (rain) return btn(`'${rain.label}' 안으로 바꾸기`, () => ctx.save((t) => { dayByDate(t, day.date).activePlan = rain.id; }, `${fmtDate(day.date)}를 ${rain.label} 안으로 바꿨어요.`), 'small accent');
    return btn('실내 장소 보기', () => { pv(ctx).badge = 'indoor'; ctx.go(`#/t/${encodeURIComponent(ctx.trip.id)}/places`); }, 'small');
  };
}

/* 장소 기준점 */
function refOptions(ctx) {
  const opts = [{ value: 'auto', label: '오늘 숙소' }];
  for (const s of stayPoints(ctx.trip, ctx.datasets)) opts.push({ value: s.k, label: s.l });
  opts.push({ value: 'next', label: '다음 일정 장소' });
  opts.push({ value: 'here', label: '현재 위치' });
  return opts;
}
function nextPlace(ctx) {
  const date = ctx.phase.key === 'ongoing' ? ctx.now.date : selectedDate(ctx);
  const day = dayByDate(ctx.trip, date); const plan = activePlan(day);
  if (!plan) return null;
  const ms = itemMinutes(plan.items || []);
  const nowM = ctx.phase.key === 'ongoing' ? ctx.now.min : -1;
  for (let i = 0; i < plan.items.length; i++) {
    const it = plan.items[i];
    if ((ms[i] == null || ms[i] >= nowM) && it.placeId && it.kind !== 'move') {
      const p = findPlace(ctx.trip, ctx.datasets, it.placeId);
      if (p && hasXY(p)) return { k: 'next', l: `다음 일정: ${p.name}`, lat: p.lat, lng: p.lng };
    }
  }
  return null;
}
function refPoint(ctx, k) {
  if (k === 'here') return ctx.here();
  if (k === 'next') return nextPlace(ctx);
  if (k && k.startsWith('stay:')) return stayPoints(ctx.trip, ctx.datasets).find((s) => s.k === k) || null;
  const date = ctx.phase.key === 'ongoing' ? ctx.now.date : selectedDate(ctx);
  const st = stayForDay(ctx.trip, date) || (ctx.trip.stays || [])[0];
  const p = st && findPlace(ctx.trip, ctx.datasets, st.placeId);
  return p && hasXY(p) ? { k: 'auto', l: `오늘 숙소: ${st.name}`, lat: p.lat, lng: p.lng } : null;
}

/* 지금 운영 중? */
function openNow(p, ctx) {
  const hrs = hoursOn(p.hours, ctx.now.date);
  if (!hrs) return null;
  if (hrs === 'closed') return false;
  const m = ctx.now.min;
  return (m >= hrs.open && m < hrs.close) || (m + 1440 >= hrs.open && m + 1440 < hrs.close);
}
function hoursText(p, date) {
  if (!p.hours) return null;
  const hrs = hoursOn(p.hours, date);
  const wd = WEEK_KO[weekday(date)];
  if (hrs === 'closed') return `${wd}요일 휴무`;
  if (!hrs) return p.hours.note || null;
  return `${wd}요일 ${hrs.text}` + (p.hours.lastEntry ? ` (입장 ${p.hours.lastEntry}까지)` : '') + (p.hours.note ? ` · ${p.hours.note}` : '');
}

/* ── 장소 팝업 ────────────────────────────────────── */
export function openPlace(ctx, id, refK) {
  const p = findPlace(ctx.trip, ctx.datasets, id);
  if (!p) { toast('장소를 찾지 못했어요: ' + id); return; }
  const ref = refPoint(ctx, refK || (PV[ctx.trip.id] || {}).ref || 'auto');
  const d = distKm(ref, p);
  const inTrip = !!byId(ctx.trip.places, id);
  const ht = hoursText(p, ctx.phase.key === 'ongoing' ? ctx.now.date : selectedDate(ctx) || ctx.now.date);
  const on = ctx.phase.key === 'ongoing' ? openNow(p, ctx) : null;
  const links = mapLinks(p);
  const body = h('div.place-detail',
    h('div.badges', pill(CAT_LABEL[p.cat] || '기타', 'muted'), p.group ? pill(p.group, 'muted') : null, badges(ctx.badges, p.badges),
      p._src !== 'trip' ? pill('데이터셋', 'info') : null),
    d != null ? h('p.dist-line', `${ref.l}에서 ${fmtLeg(d)} (직선 기준)`) : null,
    ht ? h('p', h('b', '운영 '), ht, on === true ? pill('지금 운영 중', 'good') : on === false ? pill('지금 닫힘', 'warn') : null) : null,
    p.price ? h('p', h('b', '요금 '), p.price) : null,
    p.pass ? h('div.passbox',
      h('div.stamp', '패스'),
      h('div', p.pass.code ? h('b', p.pass.code + ' ') : null, p.pass.benefit || ''),
      p.pass.surcharge ? h('div', h('b', '추가금 '), p.pass.surcharge) : null,
      p.pass.reserve ? h('div', h('b', '예약 '), p.pass.reserve) : null) : null,
    p.desc ? h('p.desc', ...rich(p.desc, ctx.secrets)) : null,
    p.address ? h('p', h('b', '주소 '), p.address) : null,
    p.phone ? h('p', h('b', '전화 '), telLink(p.phone)) : null,
    p.rating ? h('p.hint', '평점 ' + p.rating) : null,
    h('div.btnrow.wrap', links.map((l) => linkBtn(l.label, l.href)),
      links[1] && links[1].fallback ? linkBtn('네이버(웹)', links[1].fallback, 'ghost') : null,
      p.links && p.links.web ? linkBtn('웹사이트', p.links.web, 'ghost') : null,
      p.pid ? linkBtn('구글 장소', googlePlaceUrl(p), 'ghost') : null),
    h('div.btnrow.wrap',
      btn(p.fav ? '★ 찜 해제' : '☆ 찜', () => ctx.save((t) => { const q = adoptPlace(t, ctx.datasets, id); q.fav = !p.fav; }).then(() => s.close())),
      btn('일정에 넣기', () => { s.close(); openAddToPlan(ctx, id); }, 'primary'),
      inTrip ? btn('수정', () => { s.close(); openPlaceEdit(ctx, id); }) : null,
      inTrip ? btn('삭제', async () => {
        const used = (ctx.trip.days || []).some((dd) => (dd.plans || []).some((pl) => (pl.items || []).some((it) => it.placeId === id)))
          || (ctx.trip.stays || []).some((st) => st.placeId === id);
        if (used) { toast('일정이나 숙소에서 쓰고 있는 장소예요. 먼저 그 항목에서 장소를 빼세요.', 4000); return; }
        if (await ask(`'${p.name}'을(를) 장소 목록에서 지울까요?`)) { s.close(); ctx.save((t) => { t.places = t.places.filter((x) => x.id !== id); }, '지웠어요.'); }
      }, 'danger') : null));
  const s = openSheet(p.name, body);
}

function openAddToPlan(ctx, placeId) {
  const p = findPlace(ctx.trip, ctx.datasets, placeId);
  const days = ctx.trip.days || [];
  const dsel = select(days.map((d) => ({ value: d.date, label: fmtDate(d.date) + (d.title ? ' · ' + d.title : '') })), selectedDate(ctx));
  const time = input('', { type: 'time' }), end = input('', { type: 'time' });
  const passSel = select([{ value: '', label: '패스 안 씀' }, ...(ctx.trip.passes || []).map((x) => ({ value: x.id, label: x.name }))], p.pass && p.pass.id ? p.pass.id : '');
  const opt = checkbox(false, '선택 일정(빼도 됨)');
  const s = openSheet('일정에 넣기 · ' + p.name, h('div',
    field('날짜', dsel), h('div.grid2', field('시작', time), field('끝', end)),
    (ctx.trip.passes || []).length ? field('패스', passSel) : null, opt,
    h('div.btnrow', btn('넣기', () => {
      const date = dsel.value;
      ctx.save((t) => {
        adoptPlace(t, ctx.datasets, placeId);
        const day = dayByDate(t, date); const plan = activePlan(day);
        const item = { id: newItemId(t, date, time.value), time: time.value || null, end: end.value || null, kind: p.cat === 'eat' ? 'meal' : 'visit',
          title: p.name, placeId, status: 'tentative' };
        if (passSel.value) item.passUse = passSel.value;
        if (opt.querySelector('input').checked) item.optional = true;
        insertByTime(plan.items, item);
      }, `${fmtDate(date)} 일정에 넣었어요.`);
      pickDate(ctx, date);
      s.close();
    }, 'primary'))));
}
function newItemId(t, date, time) {
  const base = date.slice(5).replace('-', '') + '-' + (time ? time.replace(':', '') : 'x');
  const all = new Set();
  (t.days || []).forEach((d) => (d.plans || []).forEach((p) => (p.items || []).forEach((it) => all.add(it.id))));
  if (!all.has(base)) return base;
  for (const c of 'bcdefghijklmnopqrstuvwxyz') if (!all.has(base + '-' + c)) return base + '-' + c;
  return base + '-' + uid('i');
}
function insertByTime(items, item) {
  const m = mins(item.time);
  if (m == null) { items.push(item); return; }
  const ms = itemMinutes(items);
  let at = items.length;
  for (let i = 0; i < items.length; i++) if (ms[i] != null && ms[i] > m) { at = i; break; }
  items.splice(at, 0, item);
}

function openPlaceEdit(ctx, id, preset) {
  const isNew = !id;
  const p = isNew ? { id: '', name: '', cat: 'see', group: '', lat: null, lng: null, badges: [], hours: null, links: {}, ...preset } : clone(byId(ctx.trip.places, id));
  const name = input(p.name), cat = select(CATS.map((c) => ({ value: c.id, label: c.label })), p.cat || 'see');
  const group = input(p.group, { list: 'grp-list' });
  const groups = [...new Set(allPlaces(ctx.trip, ctx.datasets).map((x) => x.group).filter(Boolean))];
  const lat = input(p.lat ?? '', { inputmode: 'decimal' }), lng = input(p.lng ?? '', { inputmode: 'decimal' });
  const address = input(p.address), phone = input(p.phone, { type: 'tel' });
  const hrs = input(p.hours && p.hours.default, { placeholder: '10:00-19:00' });
  const closed = h('div.chips', WEEK.map((w) => checkbox(p.hours && (p.hours.closed || []).includes(w), WEEK_KO[w], null, { value: w })));
  const price = input(p.price), desc = textarea(p.desc, { rows: 3 });
  const map = input(p.links && p.links.map, { type: 'url' });
  const bsel = h('div.chips', Object.values(ctx.badges).map((b) => checkbox((p.badges || []).includes(b.id), b.label, null, { value: b.id })));
  const body = h('div',
    h('datalist#grp-list', groups.map((g) => h('option', { value: g }))),
    field('이름', name), h('div.grid2', field('분류', cat), field('지역 묶음', group)),
    h('div.grid2', field('위도', lat), field('경도', lng)),
    field('주소', address), field('전화', phone),
    field('운영시간', hrs, '예: 09:00-18:00. 요일별 시간은 [데이터]의 JSON에서 고칠 수 있어요.'),
    h('div.field', h('label', '휴무 요일'), closed),
    field('요금', price), field('설명', desc), field('지도 링크', map),
    Object.keys(ctx.badges).length ? h('div.field', h('label', '배지'), bsel) : null,
    h('div.btnrow', btn(isNew ? '추가' : '저장', () => {
      if (!name.value.trim()) { toast('이름을 넣으세요.'); return; }
      const num = (v) => (v.trim() === '' || isNaN(+v) ? null : +v);
      const out = { ...p, name: name.value.trim(), cat: cat.value, group: group.value.trim() || null, lat: num(lat.value), lng: num(lng.value),
        address: address.value.trim() || null, phone: phone.value.trim() || null, price: price.value.trim() || null, desc: desc.value.trim(),
        links: { ...(p.links || {}), map: map.value.trim() || null },
        badges: [...bsel.querySelectorAll('input:checked')].map((x) => x.value) };
      const cl = [...closed.querySelectorAll('input:checked')].map((x) => x.value);
      out.hours = hrs.value.trim() || cl.length ? { ...(p.hours || {}), default: hrs.value.trim() || null, closed: cl } : null;
      if (isNew) out.id = slug(ctx.trip, out.name);
      ctx.save((t) => {
        t.places = t.places || [];
        if (isNew) t.places.push(out); else t.places[t.places.findIndex((x) => x.id === id)] = out;
      }, isNew ? '장소를 추가했어요.' : '저장했어요.');
      s.close();
    }, 'primary')));
  const s = openSheet(isNew ? '장소 추가' : '장소 수정', body);
}
function slug(trip, name) {
  let b = String(name).toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'place';
  let id = b, i = 2;
  while (byId(trip.places, id)) id = b + '-' + i++;
  return id;
}
function openAddByLink(ctx) {
  const box = input('', { type: 'url', placeholder: 'https://www.google.com/maps/place/…' });
  const msg = h('p.hint', '구글 지도 앱에서 [공유] → 링크 복사. 긴 주소면 이름·좌표·place id를 읽어요. 짧은 링크(maps.app.goo.gl)는 링크만 저장돼요.');
  const s = openSheet('구글 지도 링크로 추가', h('div', field('링크', box), msg,
    h('div.btnrow', btn('읽기', () => {
      const r = parseMapLink(box.value);
      if (!r.url) { toast('링크를 넣으세요.'); return; }
      s.close();
      openPlaceEdit(ctx, null, { name: r.name || '', lat: r.lat ?? null, lng: r.lng ?? null, pid: r.pid || null, links: { map: r.url } });
      if (r.short) toast('짧은 링크라 이름·좌표를 직접 넣어야 해요.', 4000);
    }, 'primary'))));
}
function openAiPlaces(ctx) {
  const box = textarea('', { rows: 8, placeholder: 'AI가 준 places 배열 JSON을 붙여넣으세요' });
  const out = h('div.result');
  const s = openSheet('AI로 장소 여러 곳 추가', h('div',
    h('ol.steps',
      h('li', btn('프롬프트 복사', async () => {
        const text = await buildPrompt('add-places', { trip: ctx.trip, profile: getProfile(), badgeIds: Object.keys(ctx.badges) });
        toast((await copyText(text)) ? '복사했어요. AI 채팅에 붙여넣고 [장소 자료]를 채우세요.' : '복사하지 못했어요.');
      }, 'small'), ' AI 채팅에 붙여넣고 장소 자료를 적어 보냅니다.'),
      h('li', '결과 JSON을 아래에 붙여넣고 [검사].')),
    box, out,
    h('div.btnrow', btn('검사', () => {
      clear(out);
      const r = extractJson(box.value);
      if (!r.ok) { out.appendChild(h('p.err', r.msg)); return; }
      const arr = Array.isArray(r.value) ? r.value : r.value && Array.isArray(r.value.places) ? r.value.places : null;
      if (!arr) { out.appendChild(h('p.err', 'places 배열을 찾지 못했어요. [ {...}, {...} ] 형태여야 해요.')); return; }
      const names = new Set((ctx.trip.places || []).map((p) => p.name));
      const add = [], skip = [], bad = [];
      for (const p of arr) {
        if (!p || !p.name) { bad.push('이름 없는 항목'); continue; }
        if (names.has(p.name)) { skip.push(p.name); continue; }
        const unknown = (p.badges || []).filter((b) => !ctx.badges[b]);
        if (unknown.length) p.badges = (p.badges || []).filter((b) => ctx.badges[b]);
        add.push(p);
      }
      out.appendChild(h('div', h('p', `추가 ${add.length}곳`, skip.length ? ` · 이미 있음 ${skip.length}곳(${skip.join(', ')})` : '', bad.length ? ` · 건너뜀 ${bad.length}` : ''),
        h('ul.mini', add.slice(0, 30).map((p) => h('li', p.name + (p.lat == null ? ' (좌표 없음)' : '')))),
        add.length ? btn(`${add.length}곳 추가`, () => {
          ctx.save((t) => {
            t.places = t.places || [];
            for (const p of add) { const q = { cat: 'see', badges: [], ...p }; q.id = q.id && !byId(t.places, q.id) ? q.id : slug(t, q.name); t.places.push(q); }
          }, `${add.length}곳을 추가했어요.`);
          s.close();
        }, 'primary') : null));
    }))));
}

/* ── 일정 ─────────────────────────────────────────── */
export function viewPlan(ctx) {
  const trip = ctx.trip;
  if (!(trip.days || []).length) return empty('일정이 아직 없어요. [더보기 → 데이터]에서 AI로 일정을 만들어 붙여넣으세요.');
  const date = selectedDate(ctx);
  const day = dayByDate(trip, date);
  const checks = checksFor(ctx);
  const editing = !!EDIT[trip.id];
  const tabs = h('div.datetabs', { role: 'tablist' }, trip.days.map((d) => {
    const warn = checks.some((w) => w.date === d.date);
    const b = h('button.datetab', { type: 'button', role: 'tab', 'aria-selected': d.date === date ? 'true' : 'false',
      onclick: () => { pickDate(ctx, d.date); ctx.render(); } },
      h('span.dt-d', fmtDate(d.date, false)), h('span.dt-w', WEEK_KO[weekday(d.date)]),
      dayEdited(ctx, d.date) ? h('span.dot.edit', { title: '수정됨' }) : null,
      warn ? h('span.dot.warn', { title: '점검 경고' }) : null,
      d.date === ctx.now.date ? h('span.dt-today', '오늘') : null);
    return b;
  }));
  setTimeout(() => { const sel = tabs.querySelector('[aria-selected=true]'); if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 0);
  return h('div.plan', tabs, renderDay(ctx, day, { editing, checks }));
}

function renderDay(ctx, day, { editing, checks }) {
  const trip = ctx.trip;
  const plan = activePlan(day);
  const stay = stayForNight(trip, day.date);
  const edited = dayEdited(ctx, day.date);
  const di = trip.days.findIndex((d) => d.date === day.date);
  const head = h('div.day-head',
    h('div.day-title',
      h('h2', `${di + 1}일차 · ${fmtDate(day.date)}`, day.title ? h('span.day-sub', day.title) : null),
      h('div.day-meta',
        stay ? h('span', '🏨 ' + stay.name) : null,
        weatherSlot(ctx, day.date, { onRain: rainAction(ctx, day) }))),
    h('div.day-actions',
      edited ? h('span.edited', '수정됨') : null,
      edited ? btn('이 날 되돌리기', async () => {
        if (!(await ask(`${fmtDate(day.date)}를 마지막 커밋 버전으로 되돌릴까요?`))) return;
        ctx.save((t) => {
          const b = dayByDate(ctx.base, day.date), i = t.days.findIndex((d) => d.date === day.date);
          if (b) t.days[i] = clone(b); else t.days.splice(i, 1);
        }, '되돌렸어요.');
      }, 'small ghost') : null,
      btn(editing ? '편집 완료' : '편집', () => { EDIT[trip.id] = !editing; ctx.render(); }, editing ? 'small accent' : 'small')));
  const plans = (day.plans || []).length > 1 || editing ? h('div.seg', { role: 'group', 'aria-label': '안 전환' },
    day.plans.map((p) => h('button', { type: 'button', 'aria-pressed': p === plan ? 'true' : 'false',
      onclick: () => ctx.save((t) => { dayByDate(t, day.date).activePlan = p.id; }) }, p.label || p.id)),
    editing ? h('button', { type: 'button', onclick: () => addPlanCopy(ctx, day) }, '＋ 안') : null) : null;
  const notes = [];
  if (day.note) notes.push(h('div.note', ...rich(day.note, ctx.secrets)));
  for (const n of day.notes || []) notes.push(h('div.note', { dataset: { kind: n.kind || '' } }, n.title ? h('b', n.title) : null, n.title ? h('br') : null, ...rich(n.text || n.d || '', ctx.secrets)));
  if (plan && plan.note) notes.push(h('div.note', ...rich(plan.note, ctx.secrets)));
  for (const n of (plan && plan.notes) || []) notes.push(h('div.note', { dataset: { kind: n.kind || '' } }, n.title ? h('b', n.title) : null, n.title ? h('br') : null, ...rich(n.text || '', ctx.secrets)));
  const dayChecks = checks.filter((w) => w.date === day.date && !w.itemId);

  const editBar = editing ? h('div.editbar',
    btn('＋ 일정 추가', () => openItemEdit(ctx, day.date, plan.id, null), 'small primary'),
    btn('날짜 제목·메모', () => openDayEdit(ctx, day.date), 'small'),
    (day.plans || []).length > 1 ? btn('이 안 이름 바꾸기', () => renamePlan(ctx, day, plan), 'small') : null,
    (day.plans || []).length > 1 && plan !== day.plans[0] ? btn('이 안 삭제', async () => {
      if (await ask(`'${plan.label}' 안을 지울까요?`)) ctx.save((t) => { const d = dayByDate(t, day.date); d.plans = d.plans.filter((p) => p.id !== plan.id); delete d.activePlan; });
    }, 'small danger') : null) : null;

  return h('div.day',
    head, plans, notes.length ? h('div.notes', notes) : null,
    dayChecks.length ? h('ul.warns', dayChecks.map((w) => h('li', w.msg))) : null,
    editBar,
    plan ? timeline(ctx, day, plan, { editing, checks }) : null);
}

function timeline(ctx, day, plan, { editing, checks, from = 0, compact = false }) {
  const items = plan.items || [];
  const ms = itemMinutes(items);
  const isToday = ctx.phase.key === 'ongoing' && day.date === ctx.now.date;
  const list = h('ol.timeline' + (compact ? '.compact' : ''));
  let prevPlace = null, nowDrawn = !isToday;
  const stay = stayForDay(ctx.trip, day.date);
  const stayPlace = stay && findPlace(ctx.trip, ctx.datasets, stay.placeId);
  items.forEach((it, i) => {
    const p = it.placeId && findPlace(ctx.trip, ctx.datasets, it.placeId);
    if (i >= from) {
      if (!nowDrawn && ms[i] != null && ms[i] > ctx.now.min) { list.appendChild(h('li.now-line', h('span', '지금 ' + ctx.now.time))); nowDrawn = true; }
      if (it.kind === 'move' && !editing) list.appendChild(moveRow(ctx, it, items, i, prevPlace || stayPlace));
      else {
        const est = !editing && p && hasXY(p) && prevPlace && hasXY(prevPlace) && items[i - 1] && items[i - 1].kind !== 'move' ? distKm(prevPlace, p) : null;
        if (est != null && est > 0.3) list.appendChild(h('li.leg.est', h('span.leg-line', `직선 ${fmtLeg(est)}`)));
        list.appendChild(itemRow(ctx, day, plan, it, i, p, { editing, warns: checks.filter((w) => w.itemId && w.itemId === it.id && w.date === day.date), past: isToday && ms[i] != null && (itemEndMinutes(it, ms[i]) ?? ms[i]) < ctx.now.min }));
      }
    }
    if (p && hasXY(p)) prevPlace = p;
  });
  if (!nowDrawn) list.appendChild(h('li.now-line', h('span', '지금 ' + ctx.now.time)));
  if (!items.length) list.appendChild(h('li.empty-li', editing ? '아직 일정이 없어요. [＋ 일정 추가]를 누르세요.' : '이 안에는 아직 일정이 없어요.'));
  return list;
}
function moveRow(ctx, it, items, i, fromPlace) {
  let txt = '';
  if (it.leg && (it.leg.km != null || it.leg.min != null)) txt = [it.leg.km != null ? it.leg.km + 'km' : null, it.leg.min != null ? it.leg.min + '분' : null].filter(Boolean).join(' · ');
  else {
    const next = items.slice(i + 1).find((x) => x.placeId);
    const np = next && findPlace(ctx.trip, ctx.datasets, next.placeId);
    const d = distKm(fromPlace, np);
    if (d != null) txt = '직선 ' + fmtLeg(d);
  }
  return h('li.leg', h('span.leg-time', it.time || ''), h('span.leg-line', it.title.replace(/^→\s*/, '→ '), txt ? h('b', ' ' + txt) : null,
    it.note ? h('span.leg-note', ' · ', ...rich(it.note, ctx.secrets)) : null));
}
function itemRow(ctx, day, plan, it, i, p, { editing, warns, past }) {
  const passUse = it.passUse && byId(ctx.trip.passes, it.passUse);
  const tags = [];
  if (passUse) tags.push(h('span.stamp.small', { title: passUse.name }, '패스'));
  if (it.optional) tags.push(pill('선택', 'muted'));
  if (it.status === 'tentative') tags.push(pill('잠정', 'info'));
  tags.push(...badges(ctx.badges, it.badges));
  if (p) tags.push(...badges(ctx.badges, (p.badges || []).filter((b) => b !== 'pass' && !(it.badges || []).includes(b))));
  const title = p && !editing
    ? h('button.item-title.linkish', { type: 'button', onclick: () => openPlace(ctx, p.id) }, it.title || p.name)
    : h('span.item-title', it.title || (p && p.name) || '(제목 없음)');
  const row = h('li.item' + (past ? '.past' : '') + (it.optional ? '.optional' : ''), { dataset: { kind: it.kind || 'visit' } },
    h('div.item-time', h('span', it.time || '—'), it.end ? h('small', '~' + it.end) : null),
    h('div.item-body',
      h('div.item-head', title, tags.length ? h('span.item-tags', tags) : null),
      it.note ? h('div.item-note', ...rich(it.note, ctx.secrets)) : null,
      it.cost ? h('div.item-note', '💳 ' + it.cost) : null,
      warns.length ? h('ul.warns.inline', warns.map((w) => h('li', w.msg.replace(/^[^:]*: /, '')))) : null,
      editing ? h('div.item-ctl',
        h('button.icon-btn', { type: 'button', 'aria-label': '위로', disabled: i === 0, onclick: () => moveItem(ctx, day.date, plan.id, i, -1) }, '↑'),
        h('button.icon-btn', { type: 'button', 'aria-label': '아래로', disabled: i === plan.items.length - 1, onclick: () => moveItem(ctx, day.date, plan.id, i, 1) }, '↓'),
        h('button.icon-btn', { type: 'button', 'aria-label': '수정', onclick: () => openItemEdit(ctx, day.date, plan.id, i) }, '✎'),
        h('button.icon-btn.danger', { type: 'button', 'aria-label': '삭제', onclick: async () => {
          if (await ask(`'${it.title}'을(를) 지울까요?`)) ctx.save((t) => { const pl = byId(dayByDate(t, day.date).plans, plan.id); pl.items.splice(i, 1); });
        } }, '✕')) : null));
  return row;
}
function moveItem(ctx, date, planId, i, dir) {
  ctx.save((t) => {
    const items = byId(dayByDate(t, date).plans, planId).items;
    const j = i + dir; if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
  });
}
function addPlanCopy(ctx, day) {
  const label = prompt('새 안 이름 (예: 우천, B안)', (day.plans || []).some((p) => p.id === 'rain') ? 'B안' : '우천');
  if (!label) return;
  ctx.save((t) => {
    const d = dayByDate(t, day.date), cur = activePlan(d);
    let id = label === '우천' && !byId(d.plans, 'rain') ? 'rain' : 'p' + (d.plans.length + 1);
    while (byId(d.plans, id)) id += 'x';
    const all = new Set(); (t.days || []).forEach((dd) => (dd.plans || []).forEach((p) => (p.items || []).forEach((x) => all.add(x.id))));
    const items = clone(cur.items || []).map((x) => { let nid = id + '-' + x.id; while (all.has(nid)) nid += 'x'; all.add(nid); return { ...x, id: nid }; });
    d.plans.push({ id, label, items }); d.activePlan = id;
  }, `'${label}' 안을 만들었어요(현재 안 복사).`);
}
function renamePlan(ctx, day, plan) {
  const label = prompt('안 이름', plan.label || plan.id);
  if (label) ctx.save((t) => { byId(dayByDate(t, day.date).plans, plan.id).label = label; });
}
function openDayEdit(ctx, date) {
  const d = dayByDate(ctx.trip, date);
  const title = input(d.title), note = textarea(d.note, { rows: 4 });
  const staySel = select([{ value: '', label: '(자동)' }, ...(ctx.trip.stays || []).map((s) => ({ value: s.id, label: s.name }))], d.stayId || '');
  const s = openSheet(fmtDate(date) + ' 편집', h('div', field('제목', title), field('메모', note, '**굵게**, 줄바꿈 가능'), field('거리 기준 숙소', staySel),
    h('div.btnrow', btn('저장', () => { ctx.save((t) => { const x = dayByDate(t, date); x.title = title.value.trim(); x.note = note.value.trim() || undefined; x.stayId = staySel.value || undefined; }, '저장했어요.'); s.close(); }, 'primary'))));
}
function openItemEdit(ctx, date, planId, index) {
  const day = dayByDate(ctx.trip, date), plan = byId(day.plans, planId);
  const isNew = index == null;
  const it = isNew ? { kind: 'visit', status: 'tentative' } : clone(plan.items[index]);
  const time = input(it.time, { type: 'time' }), end = input(it.end, { type: 'time' });
  const kind = select(ITEM_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })), it.kind || 'visit');
  const title = input(it.title);
  const places = allPlaces(ctx.trip, ctx.datasets).sort((a, b) => (a._src === 'trip' ? 0 : 1) - (b._src === 'trip' ? 0 : 1) || a.name.localeCompare(b.name, 'ko'));
  const place = select([{ value: '', label: '(장소 없음)' }, ...places.map((p) => ({ value: p.id, label: p.name + (p._src !== 'trip' ? ' · 데이터셋' : '') }))], it.placeId || '');
  const pass = select([{ value: '', label: '패스 안 씀' }, ...(ctx.trip.passes || []).map((x) => ({ value: x.id, label: x.name }))], it.passUse || '');
  const status = select([{ value: 'tentative', label: '잠정' }, { value: 'confirmed', label: '확정' }], it.status || 'tentative');
  const opt = checkbox(it.optional, '선택 일정(빼도 됨)');
  const note = textarea(it.note, { rows: 3 });
  const km = input(it.leg && it.leg.km, { inputmode: 'decimal' }), mn = input(it.leg && it.leg.min, { inputmode: 'numeric' });
  place.addEventListener('change', () => { if (!title.value && place.value) title.value = places.find((p) => p.id === place.value).name; });
  const s = openSheet(isNew ? '일정 추가' : '일정 수정', h('div',
    h('div.grid3', field('시작', time), field('끝', end), field('종류', kind)),
    field('제목', title), field('장소', place),
    h('div.grid2', (ctx.trip.passes || []).length ? field('패스', pass) : h('span'), field('상태', status)), opt,
    field('메모', note, '**굵게**, {{secret:키}} 사용 가능'),
    h('div.grid2', field('이동 km', km), field('이동 분', mn)),
    h('div.btnrow', btn(isNew ? '추가' : '저장', () => {
      const num = (v) => (String(v).trim() === '' || isNaN(+v) ? null : +v);
      const out = { ...it, time: time.value ? normTime(time.value) : null, end: end.value ? normTime(end.value) : null, kind: kind.value,
        title: title.value.trim(), placeId: place.value || null, passUse: pass.value || null, status: status.value,
        optional: opt.querySelector('input').checked || undefined, note: note.value.trim() || undefined };
      const leg = { km: num(km.value), min: num(mn.value) };
      out.leg = leg.km != null || leg.min != null ? leg : undefined;
      for (const k of ['placeId', 'passUse', 'end']) if (out[k] == null) delete out[k];
      if (!out.title) { toast('제목을 넣으세요.'); return; }
      ctx.save((t) => {
        if (out.placeId) adoptPlace(t, ctx.datasets, out.placeId);
        const pl = byId(dayByDate(t, date).plans, planId);
        if (isNew) { out.id = newItemId(t, date, out.time); insertByTime(pl.items, out); }
        else pl.items[index] = out;
      }, '저장했어요.');
      s.close();
    }, 'primary'))));
}

/* ── 오늘 ─────────────────────────────────────────── */
export function viewToday(ctx) {
  const { trip, phase: ph } = ctx;
  if (ph.key === 'upcoming') return todayBefore(ctx);
  if (ph.key === 'past') return todayAfter(ctx);
  const date = ctx.now.date;
  const day = dayByDate(trip, date);
  const plan = activePlan(day);
  const stay = stayForNight(trip, date) || stayForDay(trip, date);
  const items = (plan && plan.items) || [];
  const ms = itemMinutes(items);
  const nowM = ctx.now.min;
  let curI = -1, nextI = -1;
  items.forEach((it, i) => {
    if (it.kind === 'move' || ms[i] == null) return;
    const e = itemEndMinutes(it, ms[i]);
    if (ms[i] <= nowM && e != null && e > nowM && curI < 0) curI = i;
    if (ms[i] > nowM && nextI < 0) nextI = i;
  });
  const out = h('div.today');
  out.appendChild(h('div.hero',
    h('div.hero-top', h('span.hero-day', `${ph.dayNo}일차 · ${fmtDate(date)}`), weatherSlot(ctx, date, { onRain: day ? rainAction(ctx, day) : null })),
    h('h2', (day && day.title) || '오늘'),
    stay ? h('button.hero-stay.linkish', { type: 'button', onclick: () => stay.placeId && openPlace(ctx, stay.placeId) }, '🏨 오늘 숙소 · ' + stay.name) : null));
  if (curI >= 0) out.appendChild(nowCard(ctx, items[curI], '지금', ms[curI]));
  if (nextI >= 0) out.appendChild(nextCard(ctx, items, nextI, ms));
  else if (items.length) out.appendChild(section(null, h('p', '오늘 남은 일정이 없어요. 푹 쉬세요.')));

  /* 오늘 필요한 비밀값 */
  const keys = todaySecretKeys(trip, date);
  if (keys.length) out.appendChild(section('오늘 필요한 정보', h('ul.kv', keys.map((k) => {
    const lab = (trip.secrets || []).find((s) => s.key === k);
    const v = ctx.secrets[k];
    return h('li', h('span', lab ? lab.label : k), v ? h('b.secret', v) : h('a', { href: `#/t/${encodeURIComponent(trip.id)}/more/data` }, '미입력 → 입력하기'));
  }))));
  /* 오늘 마감 */
  const dls = [];
  for (const t of trip.transports || []) for (const d of t.deadlines || []) if ((d.at || '').slice(0, 10) === date) dls.push({ t, d });
  if (dls.length) out.appendChild(section('놓치면 안 되는 시각', h('ul.kv', dls.map(({ t, d }) => {
    const left = toEpoch(d.at, ctx.tz) - Date.now();
    return h('li', h('span', `${d.label} (${t.title})`), h('b', d.at.slice(11) + (left > 0 ? ` · ${fmtDur(left)} 남음` : ' · 지남')));
  }))));
  /* 패스 */
  for (const p of trip.passes || []) {
    const usesToday = items.some((it) => it.passUse === p.id);
    if (!p.activatedAt && !usesToday) continue;
    out.appendChild(passMini(ctx, p));
  }
  const warns = checksFor(ctx).filter((w) => w.date === date);
  if (warns.length) out.appendChild(section('점검', h('ul.warns', warns.map((w) => h('li', w.msg)))));
  if (plan) {
    const from = Math.max(0, curI >= 0 ? curI : nextI >= 0 ? nextI : items.length);
    const pastN = items.slice(0, from).filter((x) => x.kind !== 'move').length;
    out.appendChild(section('남은 일정', timeline(ctx, day, plan, { editing: false, checks: checksFor(ctx), from, compact: true }),
      pastN ? h('details', h('summary', `지난 일정 ${pastN}개`), timeline(ctx, day, { ...plan, items: items.slice(0, from) }, { editing: false, checks: [], compact: true })) : null,
      h('div.btnrow', btn('일정 탭에서 보기', () => { pickDate(ctx, date); ctx.go(`#/t/${encodeURIComponent(trip.id)}/plan`); }, 'small ghost'),
        btn('오늘 일정 공유', () => shareDay(ctx, day), 'small ghost'))));
  } else out.appendChild(section(null, h('p', '오늘 날짜의 일정이 없어요.')));
  return out;
}
function todaySecretKeys(trip, date) {
  const keys = new Set();
  for (const t of trip.transports || []) {
    const on = [t.start, t.end].some((x) => (x || '').slice(0, 10) === date);
    if (on) (t.secretKeys || []).forEach((k) => keys.add(k));
  }
  for (const s of trip.stays || []) {
    const on = [s.checkIn, s.checkOut].some((x) => (x || '').slice(0, 10) === date);
    if (on) (s.secretKeys || []).forEach((k) => keys.add(k));
  }
  return [...keys];
}
function nowCard(ctx, it, label, start) {
  const p = it.placeId && findPlace(ctx.trip, ctx.datasets, it.placeId);
  const end = itemEndMinutes(it, start);
  return h('section.card.nowcard',
    h('div.card-kicker', label + (end != null ? ` · ${hhmm(end)}까지 (${fmtDur((end - ctx.now.min) * 60000)} 남음)` : '')),
    h('h3', p ? h('button.linkish', { type: 'button', onclick: () => openPlace(ctx, p.id) }, it.title) : it.title),
    it.note ? h('p.item-note', ...rich(it.note, ctx.secrets)) : null);
}
function nextCard(ctx, items, i, ms) {
  const it = items[i];
  const p = it.placeId && findPlace(ctx.trip, ctx.datasets, it.placeId);
  const leftMin = ms[i] - ctx.now.min;
  let from = ctx.here();
  let fromLabel = '현재 위치';
  if (!from) {
    for (let k = i - 1; k >= 0; k--) { const q = items[k].placeId && findPlace(ctx.trip, ctx.datasets, items[k].placeId); if (q && hasXY(q)) { from = q; fromLabel = q.name; break; } }
    if (!from) { const st = stayForDay(ctx.trip, ctx.now.date); const q = st && findPlace(ctx.trip, ctx.datasets, st.placeId); if (q && hasXY(q)) { from = q; fromLabel = st.name; } }
  }
  const moveBefore = items[i - 1] && items[i - 1].kind === 'move' ? items[i - 1] : null;
  const d = p && hasXY(p) ? distKm(from, p) : null;
  const travel = moveBefore && moveBefore.leg && moveBefore.leg.min != null && !ctx.here() ? moveBefore.leg.min : d != null ? Math.max(1, estMin(d)) : null;
  const departBy = travel != null ? ms[i] - travel : null;
  const lines = [];
  if (d != null) lines.push(`${fromLabel}에서 ${fmtKm(d)} · ${moveBefore && moveBefore.leg && moveBefore.leg.min != null && !ctx.here() ? '약 ' + travel + '분' : '추정 ' + travel + '분'}`);
  if (departBy != null) lines.push(departBy <= ctx.now.min ? '지금 출발해야 해요' : `${hhmm(departBy)}까지 출발 (${fmtDur((departBy - ctx.now.min) * 60000)} 남음)`);
  return h('section.card.nextcard',
    h('div.card-kicker', `다음 · ${it.time} (${fmtDur(leftMin * 60000)} 뒤)`),
    h('h3', p ? h('button.linkish', { type: 'button', onclick: () => openPlace(ctx, p.id) }, it.title) : it.title),
    lines.length ? h('p', lines.join(' · ')) : null,
    it.note ? h('p.item-note', ...rich(it.note, ctx.secrets)) : null,
    h('div.btnrow.wrap',
      p ? mapLinks(p).map((l) => linkBtn(l.label, l.href, 'small')) : null,
      !ctx.here() ? btn('내 위치 기준', () => ctx.getHere(), 'small ghost') : null));
}
function passMini(ctx, p) {
  const st = passState(ctx, p);
  return h('section.card.passmini',
    h('div.stamp', '패스'),
    h('div', h('b', p.name), h('div', st.text)),
    btn('패스 화면', () => ctx.go(`#/t/${encodeURIComponent(ctx.trip.id)}/more/pass`), 'small'));
}
export function passState(ctx, p) {
  if (!p.activatedAt) return { active: false, text: '아직 개시 전이에요. 첫 입장 때 [첫 입장 기록]을 누르세요.' };
  const start = toEpoch(p.activatedAt, ctx.tz), exp = start + (p.validHours || 0) * 3600000;
  const left = exp - Date.now();
  if (Date.now() < start) return { active: false, text: `개시 기록 ${p.activatedAt.replace('T', ' ')} (아직 그 시각 전이에요)` };
  const lastUse = (p.uses || []).length ? toEpoch(p.uses[p.uses.length - 1].at, ctx.tz) : start;
  const nextOk = lastUse + (p.intervalMinutes || 0) * 60000;
  if (left <= 0) return { active: false, expired: true, exp, text: '만료됐어요.' };
  return { active: true, exp, left, nextOk,
    text: `만료까지 ${fmtDur(left)}` + (p.intervalMinutes ? (nextOk > Date.now() ? ` · 다음 시설 ${new Date(nextOk).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: ctx.tz })}부터` : ' · 다음 시설 입장 가능') : '') };
}
function todayBefore(ctx) {
  const { trip, phase: ph } = ctx;
  const out = h('div.today');
  out.appendChild(h('div.hero',
    h('div.hero-top', h('span.hero-day', ph.dday === 0 ? '오늘 출발' : `D-${ph.dday}`), h('span', `${fmtDate(trip.meta.start)} 출발`)),
    h('h2', trip.meta.title), trip.meta.summary ? h('p', trip.meta.summary) : null));
  const due = [];
  for (const c of trip.checklists || []) for (const it of c.items || []) if (!it.done && it.due) due.push({ c, it, left: daysBetween(ctx.now.date, it.due) });
  due.sort((a, b) => a.left - b.left);
  const soon = due.filter((x) => x.left <= 21);
  out.appendChild(section('마감 다가오는 준비', soon.length ? h('ul.checks', soon.map(({ c, it, left }) => checkRow(ctx, c, it, left))) : h('p.hint', '3주 안에 마감되는 준비 항목이 없어요.'),
    h('div.btnrow', btn('준비 탭 전체', () => ctx.go(`#/t/${encodeURIComponent(trip.id)}/prep`), 'small ghost'))));
  const oq = (trip.notes && trip.notes.openQuestions) || [];
  if (oq.length) out.appendChild(section(`열린 질문 ${oq.length}개`, h('ul', oq.slice(0, 4).map((q) => h('li', ...rich(typeof q === 'string' ? q : q.text || '', ctx.secrets)))),
    oq.length > 4 ? btn('메모에서 전체 보기', () => ctx.go(`#/t/${encodeURIComponent(trip.id)}/more/notes`), 'small ghost') : null));
  const warnN = checksFor(ctx).length;
  if (warnN) out.appendChild(section('일정 점검', h('p', `경고 ${warnN}건이 있어요.`), h('ul.warns', checksFor(ctx).slice(0, 5).map((w) => h('li', w.msg)))));
  const first = (trip.days || [])[0];
  if (first && ph.dday <= 15) out.appendChild(section('출발일 날씨', h('p', fmtDate(first.date) + ' '), weatherSlot(ctx, first.date)));
  const bk = [...(trip.transports || []), ...(trip.stays || [])];
  if (bk.length) {
    const tent = bk.filter((x) => x.status === 'tentative');
    out.appendChild(section('예약', h('p', `예약 ${bk.length}건` + (tent.length ? ` · 미확정 ${tent.length}건` : ' · 모두 확정')),
      btn('예약 보기', () => ctx.go(`#/t/${encodeURIComponent(trip.id)}/more/book`), 'small ghost')));
  }
  return out;
}
function todayAfter(ctx) {
  const { trip } = ctx;
  const r = (trip.notes && trip.notes.retro) || null;
  const list = (title, arr) => (arr && arr.length ? h('div', h('h4', title), h('ul', arr.map((x) => h('li', x)))) : null);
  return h('div.today',
    h('div.hero', h('div.hero-top', h('span.hero-day', '다녀온 여행'), h('span', `${fmtDate(trip.meta.start)} – ${fmtDate(trip.meta.end)}`)),
      h('h2', trip.meta.title), trip.meta.summary ? h('p', trip.meta.summary) : null),
    section('회고', r ? h('div', list('좋았던 것', r.good), list('아쉬운 것', r.meh), list('다음에', r.next)) : h('p.hint', '아직 회고가 없어요. [더보기 → 메모]에서 적거나, AI 프롬프트 (5)로 정리하세요.'),
      btn('회고 쓰기', () => ctx.go(`#/t/${encodeURIComponent(trip.id)}/more/notes`), 'small ghost')),
    section('다음 여행에 쓰기', h('p.hint', '구조·장소·체크리스트를 복사하고 날짜를 옮겨요. 예약·비밀값·경비는 비워요.'),
      btn('복제해서 새 여행', () => ctx.go(`#/new/${encodeURIComponent(trip.id)}`), 'primary')));
}
async function shareDay(ctx, day) {
  const plan = activePlan(day);
  const lines = [`${ctx.trip.meta.title} · ${fmtDate(day.date)}${day.title ? ' ' + day.title : ''}`];
  for (const it of plan.items || []) {
    if (it.kind === 'move') continue;
    lines.push(`${it.time || '  —  '} ${plain(it.title)}${it.optional ? ' (선택)' : ''}`);
  }
  const text = lines.join('\n');       // 비밀값은 넣지 않는다
  if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* 취소 */ } }
  toast((await copyText(text)) ? '오늘 일정을 복사했어요.' : '복사하지 못했어요.');
}

/* ── 장소 ─────────────────────────────────────────── */
function pv(ctx) {
  return (PV[ctx.trip.id] = PV[ctx.trip.id] || { cat: 'all', badge: null, sort: 'group', ref: 'auto', q: '', open: false });
}
export function viewPlaces(ctx) {
  const v = pv(ctx);
  const all = allPlaces(ctx.trip, ctx.datasets).filter((p) => p.cat !== 'stay' || v.cat === 'stay');
  const ref = refPoint(ctx, v.ref);
  const catsPresent = CATS.filter((c) => all.some((p) => (p.cat || 'other') === c.id));
  const hasPass = all.some((p) => p.pass);
  const badgeIds = [...new Set(all.flatMap((p) => p.badges || []))].filter((b) => ctx.badges[b] && b !== 'pass');
  let list = all.filter((p) => {
    if (v.cat === 'pass' && !p.pass) return false;
    if (v.cat === 'fav' && !p.fav) return false;
    if (!['all', 'pass', 'fav'].includes(v.cat) && (p.cat || 'other') !== v.cat) return false;
    if (v.badge && !(p.badges || []).includes(v.badge)) return false;
    if (v.open && openNow(p, ctx) !== true) return false;
    if (v.q) { const q = v.q.toLowerCase(); if (!`${p.name} ${p.group || ''} ${p.desc || ''} ${(p.pass && p.pass.code) || ''}`.toLowerCase().includes(q)) return false; }
    return true;
  });
  const rerender = () => ctx.render();
  const search = input(v.q, { type: 'search', placeholder: '이름·지역·메모 검색', 'aria-label': '장소 검색' });
  search.addEventListener('input', () => { v.q = search.value; clearTimeout(search._t); search._t = setTimeout(() => { ctx.render(); const s2 = document.querySelector('.places input[type=search]'); if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); } }, 250); });
  const chip = (label, on, fn, tone) => h('button.chipbtn', { type: 'button', 'aria-pressed': on ? 'true' : 'false', dataset: tone ? { tone } : {}, onclick: fn }, label);
  const refSel = select(refOptions(ctx), v.ref, { 'aria-label': '거리 기준' });
  refSel.addEventListener('change', async () => {
    v.ref = refSel.value;
    if (v.ref === 'here' && !ctx.here()) await ctx.getHere(); else rerender();
  });
  const tools = h('div.ptools',
    search,
    h('div.chips.scroll', chip('전체', v.cat === 'all', () => { v.cat = 'all'; rerender(); }),
      hasPass ? chip('패스', v.cat === 'pass', () => { v.cat = 'pass'; rerender(); }, 'accent') : null,
      catsPresent.map((c) => chip(c.label, v.cat === c.id, () => { v.cat = c.id; rerender(); })),
      chip('☆ 찜', v.cat === 'fav', () => { v.cat = 'fav'; rerender(); })),
    badgeIds.length ? h('div.chips.scroll', badgeIds.map((b) => chip(ctx.badges[b].label, v.badge === b, () => { v.badge = v.badge === b ? null : b; rerender(); }, ctx.badges[b].tone)),
      chip('지금 운영 중', v.open, () => { v.open = !v.open; rerender(); }, 'good')) : null,
    h('div.ptools-row',
      h('div.seg', h('button', { type: 'button', 'aria-pressed': v.sort === 'group' ? 'true' : 'false', onclick: () => { v.sort = 'group'; rerender(); } }, '지역별'),
        h('button', { type: 'button', 'aria-pressed': v.sort === 'dist' ? 'true' : 'false', onclick: () => { v.sort = 'dist'; rerender(); } }, '가까운 순')),
      refSel,
      btn('내 위치로 정렬', async () => { v.ref = 'here'; v.sort = 'dist'; await ctx.getHere(); }, 'small ghost')));
  let body;
  const row = (p) => placeRow(ctx, p, ref);
  if (v.sort === 'dist') {
    if (!ref) body = empty(v.ref === 'here' ? '현재 위치를 아직 몰라요. [내 위치로 정렬]을 누르세요.' : '기준점 좌표가 없어요.');
    else {
      list.sort((a, b) => (distKm(ref, a) ?? 1e9) - (distKm(ref, b) ?? 1e9));
      body = h('div', h('p.hint', `${ref.l} 기준 · 직선거리, 시간은 추정`), h('ul.plist', list.map(row)));
    }
  } else {
    const groups = new Map();
    for (const p of list) { const g = p.group || '기타'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p); }
    const gdesc = Object.fromEntries((ctx.trip.groups || []).map((g) => [g.name, g.desc]));
    body = h('div', [...groups].map(([g, arr]) => h('section.pgroup', h('h3', g, h('span.count', String(arr.length))), gdesc[g] ? h('p.hint', gdesc[g]) : null, h('ul.plist', arr.map(row)))));
  }
  return h('div.places', tools,
    list.length ? body : empty('조건에 맞는 장소가 없어요.'),
    h('div.btnrow.wrap.addrow', btn('＋ 구글 지도 링크로 추가', () => openAddByLink(ctx), 'small'), btn('＋ 직접 추가', () => openPlaceEdit(ctx, null), 'small'),
      btn('AI로 여러 곳 추가', () => openAiPlaces(ctx), 'small')));
}
function placeRow(ctx, p, ref) {
  const d = distKm(ref, p);
  const edited = ctx.base && p._src === 'trip' && !same(byId(ctx.base.places, p.id), byId(ctx.trip.places, p.id));
  const on = ctx.phase.key === 'ongoing' ? openNow(p, ctx) : null;
  return h('li', h('button.prow', { type: 'button', onclick: () => openPlace(ctx, p.id, pv(ctx).ref) },
    h('div.prow-main',
      h('div.prow-name', p.fav ? h('span.fav', { 'aria-label': '찜' }, '★') : null, p.name,
        p.pass && p.pass.code ? h('span.code', p.pass.code) : null, edited ? h('span.edited', '수정됨') : null),
      h('div.prow-sub', d != null ? h('span.dist', fmtKm(d)) : null, p.group ? h('span', p.group) : null,
        on === false ? h('span.closed', '닫힘') : null,
        p.desc ? h('span.prow-desc', plain(String(p.desc).split('\n')[0])) : (p.pass ? h('span.prow-desc', p.pass.benefit || '') : null)),
      h('div.badges', badges(ctx.badges, p.badges)))));
}

/* ── 준비 ─────────────────────────────────────────── */
function checkRow(ctx, c, it, left) {
  const dueTxt = it.due ? (left == null ? daysBetween(ctx.now.date, it.due) : left) : null;
  const dueLabel = dueTxt == null ? null : dueTxt < 0 ? `${-dueTxt}일 지남` : dueTxt === 0 ? '오늘 마감' : `D-${dueTxt}`;
  return h('li.check-item' + (it.done ? '.done' : ''),
    checkbox(it.done, h('span', ...rich(it.text, ctx.secrets), it.note ? h('small.hint', ' · ' + it.note) : null), (v) => {
      ctx.save((t) => { const cl = byId(t.checklists, c.id); const x = byId(cl.items, it.id); x.done = v; });
    }),
    dueLabel && !it.done ? h('span.due' + (dueTxt < 0 ? '.over' : dueTxt <= 3 ? '.soon' : ''), { title: it.due }, dueLabel) : null);
}
export function viewPrep(ctx) {
  const trip = ctx.trip;
  const lists = trip.checklists || [];
  const total = lists.reduce((a, c) => a + (c.items || []).length, 0), done = lists.reduce((a, c) => a + (c.items || []).filter((x) => x.done).length, 0);
  const due = [];
  for (const c of lists) for (const it of c.items || []) if (!it.done && it.due) due.push({ c, it, left: daysBetween(ctx.now.date, it.due) });
  due.sort((a, b) => a.left - b.left);
  return h('div.prep',
    h('div.progress', h('div.progress-bar', { style: { width: total ? Math.round(done / total * 100) + '%' : '0' } }), h('span', `${done}/${total} 완료`)),
    due.length ? section('마감 순', h('ul.checks', due.slice(0, 8).map(({ c, it, left }) => checkRow(ctx, c, it, left)))) : null,
    lists.map((c) => section(c.title,
      h('ul.checks', (c.items || []).map((it) => h('div.check-wrap', checkRow(ctx, c, it),
        h('button.icon-btn.small', { type: 'button', 'aria-label': '수정', onclick: () => openCheckEdit(ctx, c.id, it.id) }, '✎')))),
      btn('＋ 항목', () => openCheckEdit(ctx, c.id, null), 'small ghost'))),
    h('div.btnrow', btn('＋ 체크리스트', () => {
      const title = prompt('체크리스트 이름', '준비물');
      if (title) ctx.save((t) => { t.checklists = t.checklists || []; t.checklists.push({ id: uid('cl'), title, items: [] }); });
    }, 'small'), btn('마감일 캘린더로', () => ctx.go(`#/t/${encodeURIComponent(trip.id)}/more/data`), 'small ghost')));
}
function openCheckEdit(ctx, clId, itemId) {
  const cl = byId(ctx.trip.checklists, clId);
  const it = itemId ? byId(cl.items, itemId) : { text: '', due: null };
  const text = textarea(it.text, { rows: 2 }), due = input(it.due, { type: 'date' }), note = input(it.note);
  const s = openSheet(itemId ? '항목 수정' : '항목 추가', h('div', field('내용', text), h('div.grid2', field('마감일', due), field('메모', note)),
    h('div.btnrow',
      btn('저장', () => {
        if (!text.value.trim()) { toast('내용을 넣으세요.'); return; }
        ctx.save((t) => {
          const c = byId(t.checklists, clId);
          if (itemId) Object.assign(byId(c.items, itemId), { text: text.value.trim(), due: due.value || null, note: note.value.trim() || undefined });
          else c.items.push({ id: clId + '-' + Date.now().toString(36), text: text.value.trim(), due: due.value || null, done: false });
        }); s.close();
      }, 'primary'),
      itemId ? btn('삭제', () => { ctx.save((t) => { const c = byId(t.checklists, clId); c.items = c.items.filter((x) => x.id !== itemId); }); s.close(); }, 'danger') : null)));
}

/* ── 비상 ─────────────────────────────────────────── */
export function viewSos(ctx) {
  const e = ctx.trip.emergency || {};
  const here = ctx.here();
  const contacts = (e.contacts || []).map((c) => {
    const p = c.placeId && findPlace(ctx.trip, ctx.datasets, c.placeId);
    const d = p && here ? distKm(here, p) : null;
    return h('li.contact',
      h('div', h('b', c.label), c.note ? h('div.hint', c.note) : null, d != null ? h('div.hint', '여기서 ' + fmtLeg(d)) : null),
      h('div.btnrow', c.phone ? h('a.btn.call', { href: 'tel:' + String(c.phone).replace(/[^\d+]/g, '') }, '☎ ' + c.phone) : null,
        p ? btn('위치', () => openPlace(ctx, p.id), 'small ghost') : null));
  });
  const q = (term) => `https://map.kakao.com/link/search/${encodeURIComponent(term)}`;
  return h('div.sos',
    e.note ? h('div.note', ...rich(e.note, ctx.secrets)) : null,
    section('긴급 연락처', h('ul.contacts', contacts), !here ? btn('내 위치로 병원 거리 보기', () => ctx.getHere(), 'small ghost') : null),
    section('근처 찾기', h('div.btnrow.wrap', linkBtn('응급실', q('응급실')), linkBtn('약국', q('약국')), linkBtn('병원', q('병원')), linkBtn('소아과', q('소아청소년과'))),
      h('p.hint', '카카오맵 검색으로 열려요. 해외에서는 구글맵을 쓰세요: '), h('div.btnrow.wrap', linkBtn('구글맵 병원', 'https://www.google.com/maps/search/hospital'), linkBtn('구글맵 약국', 'https://www.google.com/maps/search/pharmacy'))),
    (e.scenarios || []).map((sc) => h('section.card.scenario',
      h('h3.card-title', sc.title), sc.desc ? h('p', ...rich(sc.desc, ctx.secrets)) : null,
      h('ol', (sc.steps || []).map((st) => h('li', ...rich(st, ctx.secrets)))))),
    (ctx.trip.contacts || []).length ? section('연락처', h('ul.contacts', ctx.trip.contacts.map((c) => h('li.contact', h('div', h('b', c.label), c.note ? h('div.hint', c.note) : null),
      c.phone ? h('a.btn.call', { href: 'tel:' + String(c.phone).replace(/[^\d+]/g, '') }, '☎ ' + c.phone) : null)))) : null);
}

export { openItemEdit, openPlaceEdit, selectedDate, pickDate, checksFor };
