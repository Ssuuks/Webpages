/* 더보기: 예약 · 패스 · 경비 · 지도 · 메모 · 데이터 */
import { h, clear, rich, byId, clone, fmtDate, fmtDT, fmtLeg, distKm, hasXY, toEpoch, fromEpoch, download, copyText, toast, uid,
  nowIn, utf8ToB64, b64ToUtf8, plain } from './util.js';
import { activePlan, findPlace, allPlaces, stayForDay, TRANSPORT_LABEL, TRANSPORT_KINDS, CAT_LABEL, flightLinks, passRoi, familyCategories } from './model.js';
import { validateTrip } from './validate.js';
import { buildIcs } from './ics.js';
import { drawMap } from './map.js';
import { setSecret, setSecrets, secretsFor, clearSecrets, getHistory, getProfile } from './store.js';
import { listCommits, getFileAt, hasToken } from './github.js';
import { openSheet, ask, badges, pill, btn, linkBtn, telLink, field, input, textarea, select, section, empty } from './ui.js';
import { openPlace, passState, selectedDate } from './v-trip.js';
import { addDoc, removeDoc, loadDoc, cachedPaths, cacheAll, pendingCount, fmtSize, isImage } from './docs.js';
import { openAiEdit } from './v-import.js';

const SUBS = [
  { id: 'book', label: '예약', icon: '🎫', desc: '항공·숙소·렌터카·주차' },
  { id: 'pass', label: '패스', icon: '⏱', desc: '첫 입장 기록, 만료까지 남은 시간' },
  { id: 'budget', label: '경비', icon: '💳', desc: '계획 대비 실제, CSV' },
  { id: 'map', label: '지도', icon: '🗺', desc: '전체 장소와 하루 동선' },
  { id: 'notes', label: '메모', icon: '✎', desc: '결정·열린 질문·회고' },
  { id: 'docs', label: '서류함', icon: '📎', desc: '바우처·QR·탑승권, 오프라인 보관' },
  { id: 'print', label: '공유·인쇄', icon: '🖨', desc: '비밀값 없이 일정표 공유' },
  { id: 'data', label: '데이터', icon: '⇅', desc: 'AI로 고치기, 비밀값, 내보내기, 동기화' },
];

export function viewMore(ctx) {
  const sub = SUBS.find((s) => s.id === ctx.sub);
  if (!sub) {
    return h('div.more', h('div.menu-grid', SUBS.map((s) => h('a.menu-tile', { href: `#/t/${encodeURIComponent(ctx.trip.id)}/more/${s.id}` },
      h('span.menu-ico', { 'aria-hidden': 'true' }, s.icon), h('b', s.label), h('span', s.desc)))));
  }
  const view = { book: viewBook, pass: viewPass, budget: viewBudget, map: viewMap, notes: viewNotes, data: viewData, docs: viewDocs, print: viewPrint }[sub.id];
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
  const adders = h('div.btnrow.wrap', btn('＋ 숙소', () => editBooking(ctx, 'stays', null), 'small'), btn('＋ 교통', () => editBooking(ctx, 'transports', null), 'small'),
    btn('예약 메일로 추가 (AI)', () => openAiEdit(ctx, 'bookings'), 'small ghost'));
  if (!rows.length) return h('div', empty('예약이 아직 없어요. 직접 추가하거나 예약 메일을 AI로 정리하세요.'), adders);
  return h('div.book', adders, rows.map(({ kind, x }) => {
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
      docChips(ctx, { type: 'stay', id: x.id }),
      h('div.btnrow.wrap', btn('수정', () => editBooking(ctx, 'stays', x.id), 'small ghost'), btn('＋ 서류', () => openAddDoc(ctx, { type: 'stay', id: x.id }), 'small ghost')));
    return h('section.card.booking',
      h('div.card-kicker', (TRANSPORT_LABEL[x.kind] || '교통') + ' ', status),
      h('h3', x.title),
      x.from || x.to ? h('p', [x.from, x.to].filter(Boolean).join(' → ')) : null,
      h('p', `${fmtDT(x.start) || '시각 미정'}${x.end ? ' → ' + fmtDT(x.end) : ''}`),
      p ? h('p', h('button.linkish', { type: 'button', onclick: () => openPlace(ctx, p.id) }, '📍 ' + p.name)) : null,
      x.phone ? h('p', telLink(x.phone, '☎ ' + x.phone)) : null,
      x.notes ? h('p.item-note', ...rich(x.notes, ctx.secrets)) : null,
      (x.deadlines || []).length ? h('ul.kv', x.deadlines.map((d) => h('li', h('span', '⏰ ' + d.label), h('b', fmtDT(d.at))))) : null,
      x.kind === 'flight' && flightLinks(x).length ? h('div.btnrow.wrap', flightLinks(x).map((l) => linkBtn(l.label, l.href, 'small ghost'))) : null,
      secretList(ctx, x.secretKeys),
      docChips(ctx, { type: 'transport', id: x.id }),
      h('div.btnrow.wrap', btn('수정', () => editBooking(ctx, 'transports', x.id), 'small ghost'), btn('＋ 서류', () => openAddDoc(ctx, { type: 'transport', id: x.id }), 'small ghost')));
  }));
}
function editBooking(ctx, block, id) {
  const isNew = !id;
  const isStay = block === 'stays';
  const x = isNew ? (isStay ? { status: 'tentative' } : { kind: 'flight', status: 'tentative' }) : clone(byId(ctx.trip[block], id));
  const title = input(isStay ? x.name : x.title);
  const kind = isStay ? null : select(TRANSPORT_KINDS.map((k) => ({ value: k, label: TRANSPORT_LABEL[k] })), x.kind || 'other');
  const from = isStay ? null : input(x.from), to = isStay ? null : input(x.to);
  const a = input(isStay ? x.checkIn : x.start, { type: 'datetime-local' }), b = input(isStay ? x.checkOut : x.end, { type: 'datetime-local' });
  const places = (ctx.trip.places || []).slice().sort((p, q) => p.name.localeCompare(q.name, 'ko'));
  const place = select([{ value: '', label: '(장소 없음)' }, ...places.map((p) => ({ value: p.id, label: p.name }))], x.placeId || '');
  const phone = input(x.phone, { type: 'tel' }), address = isStay ? input(x.address) : null;
  const perks = isStay ? textarea((x.perks || []).join('\n'), { rows: 3 }) : null;
  const notes = textarea(x.notes, { rows: 4 });
  const keys = input((x.secretKeys || []).join(', '), { autocapitalize: 'off', placeholder: '예: trip_booking_no, car_plate' });
  const status = select([{ value: 'confirmed', label: '확정' }, { value: 'tentative', label: '미확정' }], x.status || 'tentative');
  const remove = async () => {
    const t = ctx.trip;
    const refs = isStay ? (t.days || []).filter((d) => d.stayId === id).length
      : (t.transports || []).filter((o) => (o.deadlines || []).some((d) => d.after === id || d.before === id)).length
        + (t.days || []).reduce((n, d) => n + (d.plans || []).reduce((m, p) => m + (p.items || []).filter((it) => it.transportId === id).length, 0), 0);
    const msg = `'${isStay ? x.name : x.title}' 예약을 지울까요?` + (refs ? `\n이 예약을 가리키는 곳 ${refs}군데의 연결도 함께 풀어요.` : '');
    if (!(await ask(msg, [{ label: '취소', value: false }, { label: '삭제', value: true, danger: true }]))) return;
    ctx.save((tt) => {
      tt[block] = tt[block].filter((o) => o.id !== id);
      if (isStay) (tt.days || []).forEach((d) => { if (d.stayId === id) delete d.stayId; });
      else {
        (tt.transports || []).forEach((o) => (o.deadlines || []).forEach((d) => { if (d.after === id) delete d.after; if (d.before === id) delete d.before; }));
        (tt.days || []).forEach((d) => (d.plans || []).forEach((p) => (p.items || []).forEach((it) => { if (it.transportId === id) delete it.transportId; })));
      }
    }, '예약을 지웠어요.', { undo: true });
    s.close();
  };
  const s = openSheet(isNew ? (isStay ? '숙소 추가' : '교통 추가') : '예약 수정', h('div',
    isStay ? null : field('종류', kind),
    field(isStay ? '이름' : '제목', title, isStay ? null : '예: 진에어 LJ6435'),
    isStay ? null : h('div.grid2', field('출발지', from), field('도착지', to)),
    h('div.grid2', field(isStay ? '체크인' : '출발', a), field(isStay ? '체크아웃' : '도착', b)),
    field('장소', place, isStay ? '거리 기준점·오늘 숙소에 쓰여요. 없으면 [장소]에서 먼저 추가하세요.' : null),
    h('div.grid2', field('전화', phone), field('상태', status)),
    isStay ? field('주소', address) : null,
    isStay ? field('혜택 (줄마다 하나)', perks) : null,
    field('메모', notes, '예약번호는 본문에 쓰지 말고 {{secret:키}}로'),
    field('비밀값 키 (쉼표로 구분)', keys, '값은 [데이터 → 비밀값]에서 이 기기에만 저장돼요. 이 예약 날짜에 [오늘] 화면에 보여요.'),
    h('div.btnrow',
      btn(isNew ? '추가' : '저장', () => {
        const name = title.value.trim();
        if (!name) { toast(isStay ? '이름을 넣으세요.' : '제목을 넣으세요.'); return; }
        const v = (el) => (el.value ? el.value.slice(0, 16) : null);
        const ks = keys.value.split(/[,\s]+/).map((k) => k.trim()).filter(Boolean);
        const bad = ks.filter((k) => !/^[\w.-]+$/.test(k));
        if (bad.length) { toast(`비밀값 키는 영문·숫자·_·-·. 만 써요: ${bad.join(', ')}`, 4000); return; }
        if (v(a) && v(b) && v(a) >= v(b)) { toast((isStay ? '체크아웃' : '도착') + ' 시각이 더 늦어야 해요.'); return; }
        ctx.save((t) => {
          t[block] = t[block] || [];
          let y = isNew ? {} : byId(t[block], id);
          if (isNew) {
            const base = (isStay ? 'stay' : kind.value) + '-' + (v(a) ? v(a).slice(5, 10).replace('-', '') : 'x');
            let nid = base, n = 2; while (byId(t[block], nid)) nid = base + '-' + n++;
            y.id = nid; t[block].push(y);
          }
          if (isStay) Object.assign(y, { name, checkIn: v(a), checkOut: v(b), address: address.value.trim() || null, perks: perks.value.split('\n').map((l) => l.trim()).filter(Boolean) });
          else Object.assign(y, { kind: kind.value, title: name, from: from.value.trim() || null, to: to.value.trim() || null, start: v(a), end: v(b) });
          Object.assign(y, { placeId: place.value || null, phone: phone.value.trim() || null, notes: notes.value.trim(), status: status.value, secretKeys: ks });
          t.secrets = t.secrets || [];
          for (const k of ks) if (!t.secrets.some((q) => q.key === k)) t.secrets.push({ key: k, label: `${name} · ${k}` });
        }, isNew ? '추가했어요.' : '저장했어요.');
        s.close();
      }, 'primary'),
      isNew ? null : btn('삭제', remove, 'danger'))));
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
      p.activatedAt ? btn('초기화', async () => { if (await ask('개시 기록과 이용 기록을 지울까요?')) ctx.save((t) => { const q = byId(t.passes, p.id); q.activatedAt = null; q.uses = []; }, '패스 기록을 지웠어요.', { undo: true }); }, 'ghost danger') : null),
    uses.length ? h('div', h('h4', '이용 기록'), h('ol.uses', uses.map((u) => {
      const pl = u.placeId && findPlace(ctx.trip, ctx.datasets, u.placeId);
      return h('li', fmtDT(u.at), pl ? ' · ' + pl.name : '');
    }))) : null,
    docChips(ctx, { type: 'pass', id: p.id }),
    h('div.btnrow', btn('＋ 패스 QR·바코드', () => openAddDoc(ctx, { type: 'pass', id: p.id }), 'small ghost')),
    roiSection(ctx, p),
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
/* 패스 손익: 계획한 패스 일정의 우리 가족 정가 − 추가금 − 패스값 */
function roiSection(ctx, p) {
  const r = passRoi(ctx.trip, ctx.datasets, p, getProfile());
  if (!r.rows.length) return null;
  const won = (n) => (n == null ? '?' : n.toLocaleString('ko-KR') + '원');
  const cats = familyCategories(ctx.trip, getProfile());
  const count = (c) => cats.filter((x) => x.cat === c).length;
  const fam = [['adult', '성인'], ['youth', '청소년'], ['child', '어린이'], ['infant', '영유아']].filter(([c]) => count(c)).map(([c, l]) => `${l} ${count(c)}`).join(' · ');
  return h('details.roi', { open: true }, h('summary', '패스 손익 (계획 기준)'),
    h('table.tbl', h('thead', h('tr', h('th', '일정'), h('th', '정가'), h('th', '추가금'), h('th', '혜택'))),
      h('tbody', r.rows.map((x) => h('tr', h('td', `${fmtDate(x.date, false)} ${x.title}`),
        h('td', x.regular.known ? won(x.regular.total) : '?'), h('td', x.surcharge.known ? won(x.surcharge.total) : '?'),
        h('td', x.saved == null ? '?' : won(x.saved)))))),
    h('p.roi-sum', `혜택 ${won(r.saved)} − 패스 ${won(r.cost)} = `, h('b' + (r.net >= 0 ? '.good-text' : '.warn-text'), (r.net >= 0 ? '+' : '') + won(r.net))),
    r.unknown ? h('p.hint', `가격을 모르는 일정 ${r.unknown}곳은 계산에서 빠졌어요. `, btn('가격 조사 프롬프트', () => openAiEdit(ctx, 'prices'), 'small ghost')) : null,
    h('p.hint', `우리 가족(${fam}) 기준 · 여행 첫날 나이로 분류 · 시설마다 어린이 기준이 다를 수 있어요.`));
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
      fxConverter(ctx),
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
export function editExpense(ctx, id) {
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
    }, 'primary'), id ? btn('삭제', () => { ctx.save((t) => { t.budget.expenses = t.budget.expenses.filter((e) => e.id !== id); }, '지출을 지웠어요.', { undo: true }); s.close(); }, 'danger') : null)));
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
      h('button.icon-btn.small', { type: 'button', 'aria-label': '삭제', onclick: () => ctx.save((t) => setArr(t, arr.filter((_, j) => j !== i)), '지웠어요.', { undo: true }) }, '✕')))) : h('p.hint', '비어 있어요.'),
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
    h('div.btnrow', btn('AI로 회고 정리', () => openAiEdit(ctx, 'retro'), 'small'), h('span.hint', '날짜별 한 줄 기록과 완료·건너뜀을 모아 프롬프트를 만들어요.')),
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
        tok && ctx.rec.sha ? btn('커밋 기록', () => openHistory(ctx), 'ghost') : null,
        btn('기기 기록', () => openLocalHistory(ctx), 'ghost')),
      h('p.hint', '기기 기록: 이 기기에서 고치기 전 상태를 최근 10개까지 보관해요. 커밋 전 실수도 되돌릴 수 있어요.')),
    section('AI로 고치기',
      h('p.hint', '현재 여행 JSON(비밀값 제외)이 들어간 프롬프트를 복사해 AI에게 바꿀 내용을 말하고, 결과를 붙여넣으면 변경 목록을 보여준 뒤 적용해요. 예약 메일 정리·장소 추가 프롬프트도 여기 있어요.'),
      btn('AI로 고치기 / 가져오기', () => openAiEdit(ctx), 'primary')),
    section('비밀값 (이 기기에만)',
      h('p.hint', '예약번호·PIN·차량번호 같은 값은 이 기기 브라우저에만 저장되고 내보내기·커밋에 들어가지 않아요. 본문의 {{secret:키}} 자리에 화면에서만 채워져요.'),
      secRows.length ? secRows : h('p.hint', '이 여행에는 비밀값 키가 없어요.'),
      secRows.length ? h('div.btnrow.wrap',
        btn('다른 기기로 옮기기', () => exportSecrets(ctx), 'small'),
        btn('코드로 받기', () => importSecrets(ctx), 'small'),
        btn('이 여행 비밀값 모두 지우기', async () => { if (await ask('이 기기의 비밀값을 지울까요?')) { clearSecrets(t.id); ctx.render(); } }, 'small ghost danger')) : null),
    section('내보내기',
      h('div.btnrow.wrap',
        btn('여행 JSON 내려받기', () => download(`${t.id}.json`, JSON.stringify(t, null, 2))),
        btn('JSON 복사', async () => toast((await copyText(JSON.stringify(t, null, 2))) ? '복사했어요.' : '복사하지 못했어요.'))),
      h('div.field', h('label', '캘린더(.ics) — 항공·체크인·마감 시각, 준비 마감일·예약 오픈일(09:00)에 알림'), h('div.addline', dsel,
        btn('.ics 내려받기', () => {
          const r = buildIcs(t, { secrets: {}, date: dsel.value || null, datasets: ctx.datasets, profile: getProfile() });
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
/* 비밀값 옮기기: 저장소를 거치지 않고, 사용자가 직접 코드를 다른 기기에 붙여넣는다 */
const SEC_PREFIX = 'TA-SECRETS1:';
async function exportSecrets(ctx) {
  const vals = secretsFor(ctx.trip.id);
  const n = Object.keys(vals).filter((k) => vals[k]).length;
  if (!n) { toast('이 기기에 저장된 비밀값이 없어요.'); return; }
  const ok = await ask(`비밀값 ${n}개가 든 코드를 만들어요. 코드를 가진 사람은 예약번호를 볼 수 있으니 본인 기기끼리만 옮기고, 메신저 단체방·메일에는 붙여넣지 마세요.`,
    [{ label: '취소', value: false }, { label: '코드 만들기', value: true, primary: true }], '비밀값 옮기기');
  if (!ok) return;
  const code = SEC_PREFIX + utf8ToB64(JSON.stringify({ trip: ctx.trip.id, v: vals }));
  const ta = textarea(code, { rows: 4, readonly: true, class: 'mono' });
  openSheet('비밀값 코드', h('div', h('p.hint', '다른 기기의 같은 여행 → 데이터 → 비밀값 → [코드로 받기]에 붙여넣으세요.'), ta,
    h('div.btnrow', btn('복사', async () => toast((await copyText(code)) ? '복사했어요. 붙여넣은 뒤 클립보드를 비우세요.' : '복사하지 못했어요. 칸을 길게 눌러 복사하세요.'), 'primary'))));
}
function importSecrets(ctx) {
  const ta = textarea('', { rows: 4, class: 'mono', placeholder: SEC_PREFIX + '…', autocapitalize: 'off', spellcheck: 'false' });
  const s = openSheet('비밀값 코드로 받기', h('div', field('코드', ta), h('div.btnrow', btn('받기', async () => {
    let o;
    try {
      const raw = ta.value.trim();
      if (!raw.startsWith(SEC_PREFIX)) throw new Error();
      o = JSON.parse(b64ToUtf8(raw.slice(SEC_PREFIX.length)));
      if (!o || typeof o.v !== 'object') throw new Error();
    } catch { toast('코드가 올바르지 않아요. TA-SECRETS1: 로 시작하는 코드 전체를 붙여넣으세요.', 4000); return; }
    if (o.trip !== ctx.trip.id && !(await ask(`다른 여행(${o.trip})의 코드예요. 이 여행에 넣을까요?`))) return;
    const keys = Object.keys(o.v).filter((k) => o.v[k]);
    setSecrets(ctx.trip.id, o.v);
    s.close(); toast(`비밀값 ${keys.length}개를 이 기기에 저장했어요.`); ctx.render();
  }, 'primary'))));
}

async function openLocalHistory(ctx) {
  const list = await getHistory(ctx.trip.id);
  if (!list.length) { toast('아직 기기 기록이 없어요.'); return; }
  const s = openSheet('기기 기록 (최근 10개)', h('ul.history', list.map((x) => h('li',
    h('div', h('b', x.label), h('div.hint', new Date(x.at).toLocaleString('ko-KR'))),
    btn('이 상태로', async () => {
      if (!(await ask(`'${x.label}' 시점으로 되돌릴까요? 지금 상태도 기기 기록에 남겨요.`))) return;
      s.close(); ctx.replace(clone(x.data), '되돌렸어요.');
    }, 'small')))));
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


/* ── 서류함 ───────────────────────────────────────── */
const linkName = (t, l) => {
  if (!l) return '기타';
  const x = l.type === 'transport' ? byId(t.transports, l.id) : l.type === 'stay' ? byId(t.stays, l.id) : l.type === 'pass' ? byId(t.passes, l.id) : null;
  return x ? (x.title || x.name) : '기타';
};
const sameLink = (a, b) => !!a && !!b && a.type === b.type && a.id === b.id;
export function docChips(ctx, link) {
  const docs = (ctx.trip.documents || []).filter((d) => sameLink(d.linkTo, link));
  if (!docs.length) return null;
  return h('div.chips', docs.map((d) => h('button.chipbtn', { type: 'button', onclick: () => openDoc(ctx, d) }, (isImage(d) ? '🖼 ' : '📄 ') + d.title)));
}
export async function openDoc(ctx, doc) {
  const body = h('div', h('p.hint', '여는 중…'));
  let url = null;
  const s = openSheet(doc.title, body, { onClose: () => { if (url) URL.revokeObjectURL(url); } });
  try {
    const blob = await loadDoc(doc);
    url = URL.createObjectURL(blob);
    clear(body).appendChild(h('div.docview',
      isImage(doc) ? h('img.docimg', { src: url, alt: doc.title }) : h('p', `${doc.mime || '파일'} · ${fmtSize(doc.size)}`),
      h('div.btnrow.wrap',
        btn(isImage(doc) ? '크게 보기' : '열기', () => window.open(url, '_blank', 'noopener'), 'primary'),
        (() => { const a = h('a.btn', { download: doc.file.split('/').pop() }, '내려받기'); a.href = url; return a; })()),
      h('p.hint', `${linkName(ctx.trip, doc.linkTo)} · ${fmtSize(doc.size)} · 이 기기에 사본 있음`)));
  } catch (e) { clear(body).appendChild(h('p.err', e.message)); }
}
export function openAddDoc(ctx, link) {
  const file = h('input', { type: 'file', accept: 'image/*,application/pdf' });
  const title = input('', { placeholder: '예: 렌터카 바우처, 패스 QR' });
  file.addEventListener('change', () => { const f = file.files[0]; if (f && !title.value) title.value = f.name.replace(/\.[^.]+$/, ''); });
  const t = ctx.trip;
  const opts = [{ value: '', label: '(연결 안 함)' },
    ...(t.transports || []).map((x) => ({ value: 'transport:' + x.id, label: '교통 · ' + x.title })),
    ...(t.stays || []).map((x) => ({ value: 'stay:' + x.id, label: '숙소 · ' + x.name })),
    ...(t.passes || []).map((x) => ({ value: 'pass:' + x.id, label: '패스 · ' + x.name }))];
  const sel = select(opts, link ? link.type + ':' + link.id : '');
  const s = openSheet('서류 추가', h('div',
    field('파일 (사진·PDF)', file, '큰 사진은 자동으로 줄여요. QR·바코드 캡처는 원본 그대로 둬요.'),
    field('제목', title), field('연결', sel),
    h('p.hint', hasToken() ? '비공개 저장소의 docs/ 폴더에 올라가고 이 기기에도 사본을 둬요. 토큰이 있는 기기(가족 폰 포함)에서 볼 수 있어요.' : '저장소 연결이 없어 이 기기에만 저장돼요.'),
    h('div.btnrow', btn('추가', async () => {
      const f = file.files[0];
      if (!f) { toast('파일을 고르세요.'); return; }
      const [type, id] = sel.value ? sel.value.split(':') : [null, null];
      try {
        const meta = await addDoc(t.id, f, { title: title.value.trim() || f.name, linkTo: type ? { type, id } : null });
        s.close();
        await ctx.save((tt) => { tt.documents = [...(tt.documents || []), meta]; }, hasToken() ? '추가했어요. 동기화할 때 저장소에 올라가요.' : '이 기기에 추가했어요.');
      } catch (e) { toast(e.message, 4000); }
    }, 'primary'))));
}
function viewDocs(ctx) {
  const t = ctx.trip;
  const docs = t.documents || [];
  const status = h('p.hint', '');
  pendingCount().then((n) => { status.textContent = n ? `저장소에 올릴(또는 지울) 서류 ${n}개가 기다리는 중 — 동기화하면 처리돼요.` : ''; });
  const groups = new Map();
  for (const d of docs) { const k = linkName(t, d.linkTo); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); }
  const marks = {};
  const list = h('div', [...groups].map(([g, arr]) => h('section.pgroup', h('h3', g, h('span.count', String(arr.length))),
    h('ul.plist', arr.map((d) => {
      const mark = h('span.hint', '');
      marks[d.file] = mark;
      return h('li', h('div.prow.static',
        h('div.prow-main', h('div.prow-name', (isImage(d) ? '🖼 ' : '📄 ') + d.title), h('div.prow-sub', h('span', fmtSize(d.size)), mark)),
        h('div.prow-btns', btn('보기', () => openDoc(ctx, d), 'small'),
          btn('삭제', async () => {
            if (!(await ask(`'${d.title}'을(를) 지울까요? 이 기기와 저장소에서 모두 지워요.`, [{ label: '취소', value: false }, { label: '삭제', value: true, danger: true }]))) return;
            await removeDoc(d);
            ctx.save((tt) => { tt.documents = (tt.documents || []).filter((x) => x.id !== d.id); }, '지웠어요.');
          }, 'small ghost danger'))));
    })))));
  cachedPaths(docs).then((set) => { for (const d of docs) if (marks[d.file]) marks[d.file].textContent = set.has(d.file) ? '· 이 기기에 있음' : '· 저장소에만'; });
  const prog = h('span.hint', '');
  return h('div.docs',
    h('p.hint', '렌터카 바우처, 패스 QR, 탑승권 캡처처럼 현장에서 바로 꺼내야 하는 파일. 비공개 저장소 docs/ 폴더에 올리고, 이 기기에도 사본을 둬서 오프라인에서도 열려요.'),
    h('div.btnrow.wrap', btn('＋ 서류 추가', () => openAddDoc(ctx, null), 'primary'),
      docs.length ? btn('모두 이 기기에 받기', async () => {
        const r = await cacheAll(docs, (n, total) => { prog.textContent = ` ${n}/${total}`; });
        toast(r.fail ? `${r.ok}개 받음, ${r.fail}개 실패(온라인·토큰 확인)` : `${r.ok}개 모두 이 기기에 있어요. 오프라인에서도 열려요.`, 4000);
        ctx.render();
      }) : null, prog),
    status,
    docs.length ? list : empty('아직 서류가 없어요. 예약 카드의 [＋ 서류]로도 넣을 수 있어요.'));
}

/* 환율 계산기 (외화 여행) */
export function fxConverter(ctx) {
  const m = ctx.trip.meta, fx = m.fx || {};
  if (!fx.base || fx.base === m.currency || typeof fx.rate !== 'number' || !fx.rate) return null;
  const a = input('', { inputmode: 'decimal', placeholder: m.currency, 'aria-label': m.currency + ' 금액' });
  const b = input('', { inputmode: 'decimal', placeholder: fx.base, 'aria-label': fx.base + ' 금액' });
  const num = (v) => +String(v).replace(/[^\d.]/g, '');
  const fmtN = (n) => (isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '');
  a.addEventListener('input', () => { b.value = a.value ? fmtN(num(a.value) * fx.rate) : ''; });
  b.addEventListener('input', () => { a.value = b.value ? fmtN(num(b.value) / fx.rate) : ''; });
  return h('div.fx', h('span.fx-l', '환율 계산'), a, h('span', '='), b);
}

/* ── 공유·인쇄: 비밀값·가족 정보 없는 일정표 ───────── */
function printSheet(ctx, withNotes) {
  const t = ctx.trip, m = t.meta;
  const txt = (x) => plain(x, {});                      // 비밀값 자리는 ··· 로
  return h('article.print-sheet',
    h('h1', m.title), h('p.p-meta', `${fmtDate(m.start)} – ${fmtDate(m.end)}` + (m.summary ? ' · ' + txt(m.summary) : '')),
    (t.stays || []).length ? h('div.p-block', h('h2', '숙소'), h('ul', t.stays.map((s) => h('li', `${s.name} · ${fmtDT(s.checkIn)} → ${fmtDT(s.checkOut)}`)))) : null,
    (t.transports || []).length ? h('div.p-block', h('h2', '교통'), h('ul', t.transports.map((x) => h('li', `${x.title} · ${fmtDT(x.start)}${x.end ? ' → ' + fmtDT(x.end) : ''}`)))) : null,
    (t.days || []).map((d, i) => {
      const plan = activePlan(d) || { items: [] };
      return h('section.p-day', h('h2', `${i + 1}일차 ${fmtDate(d.date)}${d.title ? ' · ' + txt(d.title) : ''}`),
        h('ol', (plan.items || []).filter((it) => it.kind !== 'move' || withNotes).map((it) => {
          const p = it.placeId && findPlace(t, ctx.datasets, it.placeId);
          return h('li' + (it.optional ? '.opt' : '') + (it.kind === 'move' ? '.mv' : ''),
            h('span.t', it.time || ''), txt(it.title) + (it.optional ? ' (선택)' : ''),
            p && p.address && it.kind !== 'move' ? h('span.addr', ' · ' + p.address) : null,
            withNotes && it.note ? h('div.note', txt(it.note)) : null);
        })));
    }),
    h('p.p-foot', '가족 여행 플래너에서 만든 일정표 · 예약번호 등 비밀값은 빠져 있어요.'));
}
const PRINT_CSS = 'body{font:15px/1.55 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;margin:24px auto;max-width:720px;padding:0 16px;color:#222;background:#fff}'
  + 'h1{font-size:24px;margin:0}h2{font-size:17px;margin:20px 0 6px;padding-bottom:3px;border-bottom:2px solid #EE8A1E}'
  + 'ol,ul{padding-left:0;list-style:none;margin:0}li{padding:3px 0}.t{display:inline-block;min-width:52px;font-weight:700}'
  + '.opt{color:#777}.mv{color:#888;font-size:13px}.addr{color:#777;font-size:13px}.note{color:#555;font-size:13px;margin-left:52px}.p-meta,.p-foot{color:#666}';
const escHtml = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function viewPrint(ctx) {
  let withNotes = false;
  const box = h('div.print-wrap');
  const draw = () => { clear(box).appendChild(printSheet(ctx, withNotes)); };
  draw();
  const notesChk = h('input', { type: 'checkbox' });
  notesChk.addEventListener('change', () => { withNotes = notesChk.checked; draw(); });
  const htmlOf = () => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(ctx.trip.meta.title)}</title><style>${PRINT_CSS}</style></head><body>${box.innerHTML}</body></html>`;
  const fname = `${ctx.trip.id}-일정표.html`;
  const fileOf = () => new File([htmlOf()], fname, { type: 'text/html' });
  return h('div.print-view',
    h('p.hint.no-print', '예약번호 같은 비밀값, 가족 생년월일, 경비는 넣지 않아요. 조부모님께 보내거나 종이로 뽑을 때 쓰세요.'),
    h('div.btnrow.wrap.no-print',
      h('label.check', notesChk, h('span', '메모·이동까지')),
      btn('인쇄 · PDF로 저장', () => window.print(), 'primary'),
      btn('HTML 파일로 저장', () => download(fname, htmlOf(), 'text/html')),
      btn('공유', async () => {
        const f = fileOf();
        try {
          if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: ctx.trip.meta.title }); return; }
          if (navigator.share) { await navigator.share({ title: ctx.trip.meta.title, text: box.innerText.slice(0, 4000) }); return; }
        } catch { return; }
        toast((await copyText(box.innerText)) ? '일정표 글을 복사했어요.' : '공유할 수 없어요. HTML 파일로 저장하세요.');
      })),
    box);
}
