/* 더보기: 예약 · 패스 · 경비 · 지도 · 메모 · 데이터 */
import { h, clear, rich, byId, clone, fmtDate, fmtDT, fmtLeg, distKm, hasXY, toEpoch, fromEpoch, download, copyText, toast, uid,
  nowIn } from './util.js';
import { activePlan, findPlace, allPlaces, stayForDay, TRANSPORT_LABEL, CAT_LABEL } from './model.js';
import { validateTrip } from './validate.js';
import { buildIcs } from './ics.js';
import { drawMap } from './map.js';
import { setSecret, secretsFor, clearSecrets } from './store.js';
import { listCommits, getFileAt, hasToken } from './github.js';
import { openSheet, ask, badges, pill, btn, telLink, field, input, textarea, select, section, empty } from './ui.js';
import { openPlace, passState, selectedDate } from './v-trip.js';
import { openAiEdit } from './v-import.js';

const SUBS = [
  { id: 'book', label: '예약', icon: '🎫', desc: '항공·숙소·렌터카·주차' },
  { id: 'pass', label: '패스', icon: '⏱', desc: '첫 입장 기록, 만료까지 남은 시간' },
  { id: 'budget', label: '경비', icon: '💳', desc: '계획 대비 실제, CSV' },
  { id: 'map', label: '지도', icon: '🗺', desc: '전체 장소와 하루 동선' },
  { id: 'notes', label: '메모', icon: '✎', desc: '결정·열린 질문·회고' },
  { id: 'data', label: '데이터', icon: '⇅', desc: 'AI로 고치기, 비밀값, 내보내기, 동기화' },
];

export function viewMore(ctx) {
  const sub = SUBS.find((s) => s.id === ctx.sub);
  if (!sub) {
    return h('div.more', h('div.menu-grid', SUBS.map((s) => h('a.menu-tile', { href: `#/t/${encodeURIComponent(ctx.trip.id)}/more/${s.id}` },
      h('span.menu-ico', { 'aria-hidden': 'true' }, s.icon), h('b', s.label), h('span', s.desc)))));
  }
  const view = { book: viewBook, pass: viewPass, budget: viewBudget, map: viewMap, notes: viewNotes, data: viewData }[sub.id];
  return h('div.more-sub',
    h('div.subhead', h('a.icon-btn', { href: `#/t/${encodeURIComponent(ctx.trip.id)}/more`, 'aria-label': '더보기' }, '‹'), h('h2', sub.label)),
    view(ctx));
}

/* ── 예약 ─────────────────────────────────────────── */
function secretList(ctx, keys) {
  if (!keys || !keys.length) return null;
  return h('ul.kv', keys.map((k) => {
    const lab = (ctx.trip.secrets || []).find((s) => s.key === k);
    const v = ctx.secrets[k];
    return h('li', h('span', lab ? lab.label : k), v ? h('b.secret', v) : h('span.miss', '··· 미입력'));
  }));
}
function viewBook(ctx) {
  const t = ctx.trip;
  const rows = [];
  for (const x of t.transports || []) rows.push({ at: x.start || '9999', kind: 'tr', x });
  for (const s of t.stays || []) rows.push({ at: s.checkIn || '9999', kind: 'stay', x: s });
  rows.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  if (!rows.length) return empty('예약이 아직 없어요. [데이터 → AI로 고치기]에서 프롬프트 (4) 예약 메일 정리를 쓰세요.');
  return h('div.book', rows.map(({ kind, x }) => {
    const p = x.placeId && findPlace(t, ctx.datasets, x.placeId);
    const status = x.status === 'confirmed' ? pill('확정', 'good') : pill('미확정', 'warn');
    if (kind === 'stay') return h('section.card.booking',
      h('div.card-kicker', '숙소 ', status),
      h('h3', p ? h('button.linkish', { type: 'button', onclick: () => openPlace(ctx, p.id) }, x.name) : x.name),
      h('p', `체크인 ${fmtDT(x.checkIn) || '미정'} → 체크아웃 ${fmtDT(x.checkOut) || '미정'}`),
      x.address ? h('p.hint', x.address) : null,
      x.phone ? h('p', telLink(x.phone, '☎ ' + x.phone)) : null,
      (x.perks || []).length ? h('ul.perks', x.perks.map((k) => h('li', ...rich(k, ctx.secrets)))) : null,
      x.notes ? h('p.item-note', ...rich(x.notes, ctx.secrets)) : null,
      secretList(ctx, x.secretKeys),
      btn('수정', () => editBooking(ctx, 'stays', x.id), 'small ghost'));
    return h('section.card.booking',
      h('div.card-kicker', (TRANSPORT_LABEL[x.kind] || '교통') + ' ', status),
      h('h3', x.title),
      x.from || x.to ? h('p', [x.from, x.to].filter(Boolean).join(' → ')) : null,
      h('p', `${fmtDT(x.start) || '시각 미정'}${x.end ? ' → ' + fmtDT(x.end) : ''}`),
      p ? h('p', h('button.linkish', { type: 'button', onclick: () => openPlace(ctx, p.id) }, '📍 ' + p.name)) : null,
      x.phone ? h('p', telLink(x.phone, '☎ ' + x.phone)) : null,
      x.notes ? h('p.item-note', ...rich(x.notes, ctx.secrets)) : null,
      (x.deadlines || []).length ? h('ul.kv', x.deadlines.map((d) => h('li', h('span', '⏰ ' + d.label), h('b', fmtDT(d.at))))) : null,
      secretList(ctx, x.secretKeys),
      btn('수정', () => editBooking(ctx, 'transports', x.id), 'small ghost'));
  }));
}
function editBooking(ctx, block, id) {
  const x = byId(ctx.trip[block], id);
  const isStay = block === 'stays';
  const title = input(isStay ? x.name : x.title);
  const a = input(isStay ? x.checkIn : x.start, { type: 'datetime-local' }), b = input(isStay ? x.checkOut : x.end, { type: 'datetime-local' });
  const phone = input(x.phone, { type: 'tel' }), notes = textarea(x.notes, { rows: 4 });
  const status = select([{ value: 'confirmed', label: '확정' }, { value: 'tentative', label: '미확정' }], x.status || 'tentative');
  const s = openSheet('예약 수정', h('div', field(isStay ? '이름' : '제목', title),
    h('div.grid2', field(isStay ? '체크인' : '출발', a), field(isStay ? '체크아웃' : '도착', b)),
    h('div.grid2', field('전화', phone), field('상태', status)), field('메모', notes, '예약번호는 {{secret:키}}로 쓰고 값은 [데이터 → 비밀값]에'),
    h('div.btnrow', btn('저장', () => {
      const v = (el) => (el.value ? el.value.slice(0, 16) : null);
      ctx.save((t) => {
        const y = byId(t[block], id);
        if (isStay) Object.assign(y, { name: title.value.trim(), checkIn: v(a), checkOut: v(b) });
        else Object.assign(y, { title: title.value.trim(), start: v(a), end: v(b) });
        Object.assign(y, { phone: phone.value.trim() || null, notes: notes.value.trim(), status: status.value });
      }, '저장했어요.');
      s.close();
    }, 'primary'))));
}

/* ── 패스 ─────────────────────────────────────────── */
function viewPass(ctx) {
  const t = ctx.trip;
  if (!(t.passes || []).length) return empty('이 여행에는 패스가 없어요.');
  return h('div.passes', t.passes.map((p) => passCard(ctx, p)));
}
function passCard(ctx, p) {
  const st = passState(ctx, p);
  const now = nowIn(ctx.tz).dt;
  const record = (field_, val) => ctx.save((t) => { const q = byId(t.passes, p.id); q[field_] = val; });
  const uses = p.uses || [];
  const ref = ctx.here() || (() => {
    const s = stayForDay(ctx.trip, ctx.now.date); const q = s && findPlace(ctx.trip, ctx.datasets, s.placeId);
    return q && hasXY(q) ? { l: s.name, lat: q.lat, lng: q.lng } : null;
  })();
  const passPlaces = allPlaces(ctx.trip, ctx.datasets).filter((x) => x.pass && x.pass.id === p.id && hasXY(x));
  if (ref) passPlaces.sort((a, b) => distKm(ref, a) - distKm(ref, b));
  const card = h('section.card.passcard',
    h('div.pass-top', h('div.stamp.big' + (st.active ? '.on' : ''), st.active ? '사용 중' : st.expired ? '만료' : '패스'),
      h('div', h('h3', p.name), h('p.hint', [p.holders ? `${p.holders}장` : null, p.price ? `장당 ${Number(p.price).toLocaleString()}원` : null,
        p.validHours ? `${p.validHours}시간` : null, p.intervalMinutes ? `시설 간 ${p.intervalMinutes}분` : null].filter(Boolean).join(' · ')))),
    h('p.pass-state', st.text),
    p.activatedAt ? h('p', `개시 ${fmtDT(p.activatedAt)} → 만료 ${fmtDT(fromEpoch(toEpoch(p.activatedAt, ctx.tz) + (p.validHours || 0) * 3600000, ctx.tz))}`) : null,
    h('div.btnrow.wrap',
      !p.activatedAt ? btn('첫 입장 기록', () => ctx.save((t) => { const q = byId(t.passes, p.id); q.activatedAt = now; q.uses = [{ at: now, placeId: null }]; }, '개시 시각을 기록했어요. 커밋하면 다른 기기에도 보여요.'), 'primary')
        : btn('시설 이용 기록', () => recordUse(ctx, p, passPlaces), 'primary'),
      btn('시각 직접 입력', () => {
        const i = input(p.activatedAt || now, { type: 'datetime-local' });
        const s = openSheet('개시 시각', h('div', field('첫 입장 시각(현지)', i), h('div.btnrow', btn('저장', () => { record('activatedAt', i.value ? i.value.slice(0, 16) : null); s.close(); }, 'primary'))));
      }, 'ghost'),
      p.activatedAt ? btn('초기화', async () => { if (await ask('개시 기록과 이용 기록을 지울까요?')) ctx.save((t) => { const q = byId(t.passes, p.id); q.activatedAt = null; q.uses = []; }); }, 'ghost danger') : null),
    uses.length ? h('div', h('h4', '이용 기록'), h('ol.uses', uses.map((u) => {
      const pl = u.placeId && findPlace(ctx.trip, ctx.datasets, u.placeId);
      return h('li', fmtDT(u.at), pl ? ' · ' + pl.name : '');
    }))) : null,
    (p.rules || []).length ? h('details', h('summary', '규칙'), h('ul', p.rules.map((r) => h('li', r)))) : null,
    passPlaces.length ? h('div', h('h4', `가까운 패스 장소${ref ? ' · ' + (ctx.here() ? '현재 위치' : ref.l) + ' 기준' : ''}`),
      !ctx.here() ? btn('내 위치로 정렬', () => ctx.getHere(), 'small ghost') : null,
      h('ul.plist', passPlaces.slice(0, 12).map((x) => h('li', h('button.prow', { type: 'button', onclick: () => openPlace(ctx, x.id) },
        h('div.prow-main', h('div.prow-name', x.name, x.pass.code ? h('span.code', x.pass.code) : null),
          h('div.prow-sub', ref ? h('span.dist', fmtLeg(distKm(ref, x))) : null, h('span', x.pass.benefit || '')),
          h('div.badges', badges(ctx.badges, (x.badges || []).filter((b) => b !== 'pass')))))))),
      passPlaces.length > 12 ? h('p.hint', `외 ${passPlaces.length - 12}곳은 장소 탭의 '패스' 칩에서`) : null) : null);
  return card;
}
function recordUse(ctx, p, passPlaces) {
  const sel = select([{ value: '', label: '(장소 선택 안 함)' }, ...passPlaces.map((x) => ({ value: x.id, label: x.name }))], '');
  const at = input(nowIn(ctx.tz).dt, { type: 'datetime-local' });
  const s = openSheet('패스 시설 이용', h('div', field('장소', sel), field('시각', at),
    h('div.btnrow', btn('기록', () => {
      ctx.save((t) => { const q = byId(t.passes, p.id); q.uses = q.uses || []; q.uses.push({ at: at.value.slice(0, 16), placeId: sel.value || null }); q.uses.sort((a, b) => a.at.localeCompare(b.at)); }, '기록했어요.');
      s.close();
    }, 'primary'))));
}

/* ── 경비 ─────────────────────────────────────────── */
function toBase(ctx, amount, cur) {
  const m = ctx.trip.meta; const fx = m.fx || {};
  const base = fx.base || m.currency;
  if (!cur || cur === base) return amount;
  if (cur === m.currency && typeof fx.rate === 'number') return amount * fx.rate;
  return null;
}
const money = (n, cur) => (n == null ? '—' : Math.round(n).toLocaleString('ko-KR') + (cur ? ' ' + cur : ''));
function viewBudget(ctx) {
  const t = ctx.trip, m = t.meta;
  const b = t.budget || { planned: [], expenses: [] };
  const base = (m.fx && m.fx.base) || m.currency;
  const sums = {};   // cat → {plan, real}
  for (const x of b.planned || []) { const v = toBase(ctx, +x.amount || 0, x.currency || m.currency); (sums[x.cat || '기타'] = sums[x.cat || '기타'] || { plan: 0, real: 0, unk: 0 }).plan += v ?? 0; }
  const byCur = {};
  for (const x of b.expenses || []) {
    const v = toBase(ctx, +x.amount || 0, x.currency || m.currency);
    const s = (sums[x.cat || '기타'] = sums[x.cat || '기타'] || { plan: 0, real: 0, unk: 0 });
    if (v == null) s.unk++; else s.real += v;
    byCur[x.currency || m.currency] = (byCur[x.currency || m.currency] || 0) + (+x.amount || 0);
  }
  const totPlan = Object.values(sums).reduce((a, s) => a + s.plan, 0), totReal = Object.values(sums).reduce((a, s) => a + s.real, 0);
  return h('div.budget',
    section('합계',
      h('div.stats', h('div.stat', h('span', '계획'), h('b', money(totPlan, base))), h('div.stat', h('span', '실제'), h('b', money(totReal, base))),
        h('div.stat', h('span', '차이'), h('b', money(totReal - totPlan, base)))),
      m.fx && m.fx.base && m.fx.base !== m.currency ? h('p.hint', `환율: 1 ${m.currency} = ${m.fx.rate} ${m.fx.base} (meta.fx)`) : null,
      Object.keys(byCur).length > 1 || (Object.keys(byCur)[0] && Object.keys(byCur)[0] !== base) ? h('p.hint', '통화별 실제: ' + Object.entries(byCur).map(([c, v]) => money(v, c)).join(' · ')) : null),
    section('분류별', h('table.tbl', h('thead', h('tr', h('th', '분류'), h('th', '계획'), h('th', '실제'))),
      h('tbody', Object.entries(sums).map(([c, s]) => h('tr', h('td', c), h('td', money(s.plan)), h('td', money(s.real) + (s.unk ? ` (+환산불가 ${s.unk})` : ''))))))),
    section('계획', (b.planned || []).length ? h('ul.kv', b.planned.map((x) => h('li', h('span', `${x.cat}${x.note ? ' · ' + x.note : ''}`), h('b', money(+x.amount, x.currency || m.currency))))) : h('p.hint', '계획 금액이 없어요.')),
    section('실제 지출',
      btn('＋ 지출 추가', () => editExpense(ctx, null), 'primary small'),
      (b.expenses || []).length ? h('ul.expenses', [...b.expenses].sort((a, c) => String(c.date).localeCompare(String(a.date))).map((x) => h('li',
        h('button.prow', { type: 'button', onclick: () => editExpense(ctx, x.id) },
          h('div.prow-main', h('div.prow-name', x.note || x.cat || '지출'), h('div.prow-sub', h('span', fmtDate(x.date)), h('span', x.cat || ''), x.payer ? h('span', x.payer) : null)),
          h('b', money(+x.amount, x.currency || m.currency)))))) : h('p.hint', '아직 지출 기록이 없어요.'),
      h('div.btnrow', btn('CSV 내보내기', () => {
        const rows = [['날짜', '분류', '메모', '결제자', '금액', '통화', base + ' 환산']];
        for (const x of b.expenses || []) rows.push([x.date, x.cat, x.note, x.payer, x.amount, x.currency || m.currency, toBase(ctx, +x.amount || 0, x.currency || m.currency) ?? '']);
        const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
        download(`${t.id}-경비.csv`, csv, 'text/csv');
      }, 'small ghost'))));
}
function editExpense(ctx, id) {
  const m = ctx.trip.meta;
  const x = id ? byId(ctx.trip.budget.expenses, id) : { date: ctx.phase.key === 'ongoing' ? ctx.now.date : m.start, currency: m.currency, cat: '' };
  const cats = [...new Set([...(ctx.trip.budget && ctx.trip.budget.planned || []).map((p) => p.cat), '식비', '교통', '입장료', '쇼핑', '숙박', '기타'].filter(Boolean))];
  const date = input(x.date, { type: 'date' }), amount = input(x.amount, { inputmode: 'decimal' });
  const cur = input(x.currency || m.currency, { maxlength: 3, autocapitalize: 'characters' });
  const cat = input(x.cat, { list: 'cat-list' }), note = input(x.note);
  const payer = select([{ value: '', label: '-' }, ...(ctx.trip.travelers || []).filter((tv) => tv.role === 'adult').map((tv) => ({ value: tv.label, label: tv.label }))], x.payer || '');
  const s = openSheet(id ? '지출 수정' : '지출 추가', h('div', h('datalist#cat-list', cats.map((c) => h('option', { value: c }))),
    h('div.grid2', field('날짜', date), field('분류', cat)), h('div.grid2', field('금액', amount), field('통화', cur)),
    field('메모', note), field('결제자', payer),
    h('div.btnrow', btn('저장', () => {
      const amt = +String(amount.value).replace(/,/g, '');
      if (!amt) { toast('금액을 넣으세요.'); return; }
      ctx.save((t) => {
        t.budget = t.budget || { planned: [], expenses: [] }; t.budget.expenses = t.budget.expenses || [];
        const out = { id: id || uid('ex'), date: date.value, amount: amt, currency: cur.value.trim().toUpperCase() || m.currency, cat: cat.value.trim() || '기타', note: note.value.trim(), payer: payer.value || null };
        const i = t.budget.expenses.findIndex((e) => e.id === id);
        if (i >= 0) t.budget.expenses[i] = out; else t.budget.expenses.push(out);
      }, '저장했어요.');
      s.close();
    }, 'primary'), id ? btn('삭제', () => { ctx.save((t) => { t.budget.expenses = t.budget.expenses.filter((e) => e.id !== id); }); s.close(); }, 'danger') : null)));
}

/* ── 지도 ─────────────────────────────────────────── */
const MAPV = {};
function viewMap(ctx) {
  const v = (MAPV[ctx.trip.id] = MAPV[ctx.trip.id] || { mode: 'day', date: selectedDate(ctx), withDs: false });
  const el = h('div.mapbox', { role: 'region', 'aria-label': '지도' });
  const msg = h('p.hint', '');
  const dsel = select((ctx.trip.days || []).map((d) => ({ value: d.date, label: fmtDate(d.date) + (d.title ? ' ' + d.title : '') })), v.date);
  dsel.addEventListener('change', () => { v.date = dsel.value; ctx.render(); });
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#EE8A1E';
  let pts = [], route = false;
  if (v.mode === 'day') {
    const day = (ctx.trip.days || []).find((d) => d.date === v.date);
    const plan = activePlan(day);
    let n = 0; const seen = new Set();
    for (const it of (plan && plan.items) || []) {
      if (it.kind === 'move' || !it.placeId) continue;
      const p = findPlace(ctx.trip, ctx.datasets, it.placeId);
      if (!p || !hasXY(p)) continue;
      const key = p.id + (seen.has(p.id) ? n : '');
      seen.add(key);
      pts.push({ lat: p.lat, lng: p.lng, label: `${it.time || ''} ${it.title}`, num: ++n, onClick: () => openPlace(ctx, p.id) });
    }
    route = true;
    if (!pts.length) msg.textContent = '이 날 일정에 좌표 있는 장소가 없어요.';
  } else {
    const list = allPlaces(ctx.trip, ctx.datasets).filter((p) => v.withDs || p._src === 'trip');
    pts = list.filter(hasXY).map((p) => ({ lat: p.lat, lng: p.lng, label: p.name, sub: CAT_LABEL[p.cat] || '', color: p._src === 'trip' ? accent : '#8B9092', big: p.cat === 'stay', onClick: () => openPlace(ctx, p.id) }));
    const missing = list.length - pts.length;
    msg.textContent = `${pts.length}곳 표시` + (missing ? ` · 좌표 없는 ${missing}곳은 빠짐` : '');
  }
  setTimeout(() => drawMap(el, pts, { route, color: accent, here: ctx.here() }).catch((e) => { el.textContent = e.message; }), 0);
  return h('div.mapview',
    h('div.ptools-row',
      h('div.seg', h('button', { type: 'button', 'aria-pressed': v.mode === 'day' ? 'true' : 'false', onclick: () => { v.mode = 'day'; ctx.render(); } }, '하루 동선'),
        h('button', { type: 'button', 'aria-pressed': v.mode === 'all' ? 'true' : 'false', onclick: () => { v.mode = 'all'; ctx.render(); } }, '전체 장소')),
      v.mode === 'day' ? dsel : h('label.check', (() => { const c = h('input', { type: 'checkbox' }); c.checked = v.withDs; c.addEventListener('change', () => { v.withDs = c.checked; ctx.render(); }); return c; })(), h('span', '데이터셋 포함'))),
    el, msg,
    v.mode === 'day' ? h('p.hint', '선은 일정 순서대로 이은 직선이에요. 실제 길은 지도 앱으로 확인하세요.') : null,
    btn(ctx.here() ? '내 위치 새로고침' : '내 위치 표시', () => ctx.getHere(), 'small ghost'));
}

/* ── 메모 ─────────────────────────────────────────── */
function listEditor(ctx, title, getArr, setArr, placeholder) {
  const arr = getArr() || [];
  const inp = input('', { placeholder });
  const add = () => { const v = inp.value.trim(); if (!v) return; ctx.save((t) => setArr(t, [...(getArr() || []), v])); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  return section(title,
    arr.length ? h('ul.notelist', arr.map((x, i) => h('li', h('span', ...rich(typeof x === 'string' ? x : x.text || JSON.stringify(x), ctx.secrets)),
      h('button.icon-btn.small', { type: 'button', 'aria-label': '삭제', onclick: async () => { if (await ask('이 줄을 지울까요?')) ctx.save((t) => setArr(t, arr.filter((_, j) => j !== i))); } }, '✕')))) : h('p.hint', '비어 있어요.'),
    h('div.addline', inp, btn('추가', add, 'small')));
}
function viewNotes(ctx) {
  const n = () => ctx.trip.notes || {};
  const ensure = (t) => (t.notes = t.notes || { decisions: [], openQuestions: [], retro: null });
  const retro = () => (ctx.trip.notes && ctx.trip.notes.retro) || {};
  const setRetro = (k) => (t, v) => { const nn = ensure(t); nn.retro = { good: [], meh: [], next: [], ...(nn.retro || {}) }; nn.retro[k] = v; };
  return h('div.notes-view',
    listEditor(ctx, '결정 기록', () => n().decisions, (t, v) => { ensure(t).decisions = v; }, '정한 것'),
    listEditor(ctx, '열린 질문', () => n().openQuestions, (t, v) => { ensure(t).openQuestions = v; }, '아직 정하지 않은 것'),
    h('h3.group-title', '여행 후 회고'),
    listEditor(ctx, '좋았던 것', () => retro().good, setRetro('good'), '좋았던 것'),
    listEditor(ctx, '아쉬운 것', () => retro().meh, setRetro('meh'), '아쉬운 것'),
    listEditor(ctx, '다음에', () => retro().next, setRetro('next'), '다음에 할 것'));
}

/* ── 데이터 ───────────────────────────────────────── */
function viewData(ctx) {
  const t = ctx.trip;
  const st = ctx.S.status[t.id];
  const tok = hasToken();
  /* 비밀값 */
  const secrets = secretsFor(t.id);
  const secRows = (t.secrets || []).map((s) => {
    const i = input(secrets[s.key] || '', { type: 'password', autocomplete: 'off', 'aria-label': s.label, placeholder: '미입력' });
    const show = h('button.icon-btn.small', { type: 'button', 'aria-label': '보기', onclick: () => { i.type = i.type === 'password' ? 'text' : 'password'; } }, '👁');
    i.addEventListener('change', () => { setSecret(t.id, s.key, i.value.trim()); toast('이 기기에 저장했어요.'); });
    return h('div.secret-row', h('label', { for: i.id = 'sec-' + s.key }, s.label, h('small.hint', ' ' + s.key)), h('div.addline', i, show));
  });
  const v = validateTrip(t, { datasets: ctx.datasets });
  const dsel = select([{ value: '', label: '여행 전체' }, ...(t.days || []).map((d) => ({ value: d.date, label: fmtDate(d.date) }))], '');
  return h('div.data',
    section('저장소 동기화',
      h('p', ctx.dirty ? (ctx.rec.sha ? '이 기기에 커밋 안 된 변경이 있어요.' : '아직 저장소에 없는 여행이에요(기기에만 있음).') : '저장소와 같아요.'),
      st ? h('p.hint', st) : null,
      h('div.btnrow.wrap',
        tok ? btn('커밋', () => ctx.commit(), ctx.dirty ? 'primary' : '') : h('a.btn', { href: '#/settings' }, '저장소 연결하기'),
        tok ? btn('불러오기', () => ctx.pull(true)) : null,
        ctx.dirty && ctx.base ? btn('전체 되돌리기', async () => { if (await ask('마지막 커밋 버전으로 모두 되돌릴까요? 이 기기의 변경은 사라져요.')) ctx.replace(clone(ctx.base), '되돌렸어요.'); }, 'ghost danger') : null,
        tok && ctx.rec.sha ? btn('커밋 기록', () => openHistory(ctx), 'ghost') : null)),
    section('AI로 고치기',
      h('p.hint', '현재 여행 JSON(비밀값 제외)이 들어간 프롬프트를 복사해 AI에게 바꿀 내용을 말하고, 결과를 붙여넣으면 변경 목록을 보여준 뒤 적용해요. 예약 메일 정리·장소 추가 프롬프트도 여기 있어요.'),
      btn('AI로 고치기 / 가져오기', () => openAiEdit(ctx), 'primary')),
    section('비밀값 (이 기기에만)',
      h('p.hint', '예약번호·PIN·차량번호 같은 값은 이 기기 브라우저에만 저장되고 내보내기·커밋에 들어가지 않아요. 본문의 {{secret:키}} 자리에 화면에서만 채워져요.'),
      secRows.length ? secRows : h('p.hint', '이 여행에는 비밀값 키가 없어요.'),
      secRows.length ? btn('이 여행 비밀값 모두 지우기', async () => { if (await ask('이 기기의 비밀값을 지울까요?')) { clearSecrets(t.id); ctx.render(); } }, 'small ghost danger') : null),
    section('내보내기',
      h('div.btnrow.wrap',
        btn('여행 JSON 내려받기', () => download(`${t.id}.json`, JSON.stringify(t, null, 2))),
        btn('JSON 복사', async () => toast((await copyText(JSON.stringify(t, null, 2))) ? '복사했어요.' : '복사하지 못했어요.'))),
      h('div.field', h('label', '캘린더(.ics) — 항공·체크인·마감 시각에 알림 포함'), h('div.addline', dsel,
        btn('.ics 내려받기', () => {
          const r = buildIcs(t, { secrets: {}, date: dsel.value || null });
          if (!r.count) { toast('내보낼 일정이 없어요.'); return; }
          download(`${t.id}${dsel.value ? '-' + dsel.value : ''}.ics`, r.text, 'text/calendar');
        }))),
      h('p.hint', '.ics에는 비밀값을 넣지 않아요.')),
    section('데이터 점검', h('p', `오류 ${v.errors.length} · 경고 ${v.warnings.length} · ${v.summary.days}일 · 일정 ${v.summary.items} · 장소 ${v.summary.places}`),
      v.errors.length ? h('ul.errs', v.errors.map((e) => h('li', e.msg))) : null,
      v.warnings.length ? h('details', h('summary', '경고 보기'), h('ul.warns', v.warnings.map((w) => h('li', w.msg)))) : null),
    section('여행',
      h('div.btnrow.wrap',
        btn('복제해서 새 여행', () => ctx.go(`#/new/${encodeURIComponent(t.id)}`)),
        btn('이 기기에서 지우기', async () => {
          if (!(await ask(ctx.dirty ? '커밋 안 된 변경이 사라져요. 이 기기에서 이 여행을 지울까요? (저장소 파일은 그대로)' : '이 기기에서 지울까요? 저장소 파일은 그대로라 [동기화]하면 다시 받아요.'))) return;
          ctx.deleteLocal();
        }, 'ghost danger'))));
}
async function openHistory(ctx) {
  const body = h('div', h('p.hint', '불러오는 중…'));
  const s = openSheet('커밋 기록', body);
  try {
    const list = await listCommits(`trips/${ctx.trip.id}.json`);
    clear(body).appendChild(h('ul.history', list.map((c) => h('li',
      h('div', h('b', c.message.split('\n')[0]), h('div.hint', new Date(c.date).toLocaleString('ko-KR'))),
      btn('이 버전으로', async () => {
        if (!(await ask('이 버전을 이 기기에 불러올까요? 커밋하기 전까지 저장소는 그대로예요.'))) return;
        try { const data = await getFileAt(`trips/${ctx.trip.id}.json`, c.sha); s.close(); ctx.replace(data, '불러왔어요. 확인 후 [커밋]하면 복원돼요.'); } catch (e) { toast(e.message); }
      }, 'small')))));
  } catch (e) { clear(body).appendChild(h('p.err', e.message)); }
}

