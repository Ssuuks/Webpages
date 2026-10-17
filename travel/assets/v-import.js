/* 새 여행 · 가져오기 · AI로 고치기
   붙여넣기 → [검사] → 오류/경고/요약/비밀값 → 미리보기 → [저장](기기) → [커밋](저장소) */
import { h, clear, byId, clone, copyText, toast, fmtDate, fmtDT, RE_DATE, addDays, daysBetween } from './util.js';
import { setSecrets, getProfile } from './store.js';
import { validateTrip, validateDataset } from './validate.js';
import { extractJson, classify, prepareNewTrip, mergeInto, diffTrips } from './importer.js';
import { buildPrompt, templateText, retroText, PROMPTS } from './prompts.js';
import { activePlan, adoptPlace, badgeDict, shiftTrip } from './model.js';
import { openSheet, ask, btn, field, input, textarea, select, section, checkbox, pill } from './ui.js';

/* ── 저장 ─────────────────────────────────────────── */
export async function saveImported(api, trip, secretValues) {
  const t = clone(trip);
  // 데이터셋에만 있는 장소를 일정이 쓰면 여행 places로 복사
  const ids = new Set();
  for (const d of t.days || []) for (const p of d.plans || []) for (const it of p.items || []) if (it.placeId) ids.add(it.placeId);
  for (const s of t.stays || []) if (s.placeId) ids.add(s.placeId);
  for (const id of ids) if (!byId(t.places, id)) adoptPlace(t, api.S.datasets, id);
  t.updatedAt = new Date().toISOString();
  const prev = api.S.trips.get(t.id);
  const rec = { id: t.id, data: t, base: prev ? prev.base : null, sha: prev ? prev.sha : null, syncedAt: prev ? prev.syncedAt : null };
  await api.putRec(rec);
  if (secretValues && Object.keys(secretValues).length) setSecrets(t.id, secretValues);
  return rec;
}
async function saveDataset(api, ds) {
  const prev = api.S.dsRecs.get(ds.id);
  await api.putDs({ id: ds.id, data: ds, base: prev ? prev.base : null, sha: prev ? prev.sha : null });
}

/* ── 검사 결과 보기 ───────────────────────────────── */
function resultView(v, extra) {
  const s = v.summary;
  return h('div.result',
    h('p.result-head', v.ok ? pill('저장 가능', 'good') : pill('오류 ' + v.errors.length, 'warn'), ' ',
      `${s.days}일 · 일정 ${s.items}개 · 장소 ${s.places}곳 · 숙소 ${s.stays} · 교통 ${s.transports}`),
    v.errors.length ? h('div', h('h4', '오류 — 고쳐야 저장할 수 있어요'), h('ul.errs', v.errors.slice(0, 40).map((e) => h('li', e.msg))),
      v.errors.length > 40 ? h('p.hint', `외 ${v.errors.length - 40}건`) : null) : null,
    v.warnings.length ? h('details', { open: v.warnings.length <= 6 ? true : null }, h('summary', `경고 ${v.warnings.length}건 (저장 가능)`),
      h('ul.warns', v.warnings.slice(0, 80).map((w) => h('li', w.msg)))) : null,
    s.secrets ? h('p.secret-note', `🔒 비밀값 ${s.secrets}개를 찾았어요. 파일에는 남기지 않고 이 기기에만 저장해요.`) : null,
    extra || null);
}
function previewTrip(t) {
  return h('details.preview', h('summary', '미리보기'),
    h('h4', t.meta.title), h('p.hint', `${fmtDate(t.meta.start)} – ${fmtDate(t.meta.end)} · ${t.meta.timezone} · ${t.meta.currency}`),
    (t.stays || []).length ? h('ul', t.stays.map((s) => h('li', `🏨 ${s.name} ${fmtDT(s.checkIn)} → ${fmtDT(s.checkOut)}`))) : null,
    (t.transports || []).length ? h('ul', t.transports.map((x) => h('li', `🚗 ${x.title} ${fmtDT(x.start)}`))) : null,
    h('ol.preview-days', (t.days || []).map((d) => {
      const p = activePlan(d) || { items: [] };
      return h('li', h('b', fmtDate(d.date) + ' ' + (d.title || '')), h('div.hint', (p.items || []).filter((i) => i.kind !== 'move').map((i) => `${i.time || ''} ${i.title}`).join(' · ')),
        (d.plans || []).length > 1 ? h('div.hint', '안: ' + d.plans.map((x) => x.label || x.id).join(', ')) : null);
    })));
}
function diffView(log) {
  const sec = (title, arr, tone) => (arr.length ? h('div', h('h4', `${title} ${arr.length}`), h('ul.diff', { dataset: { tone } }, arr.slice(0, 60).map((x) => h('li', x))),
    arr.length > 60 ? h('p.hint', `외 ${arr.length - 60}건`) : null) : null);
  if (!log.added.length && !log.changed.length && !log.removed.length) return h('p', '바뀌는 내용이 없어요.');
  return h('div.diffs', sec('추가', log.added, 'good'), sec('변경', log.changed, 'info'), sec('삭제', log.removed, 'warn'));
}

/* 붙여넣기 칸 + 파일 열기 */
function pasteBox(placeholder) {
  const ta = textarea('', { rows: 9, placeholder, spellcheck: 'false', autocapitalize: 'off', class: 'mono' });
  const file = h('input', { type: 'file', accept: '.json,application/json,text/plain', class: 'visually-hidden' });
  file.addEventListener('change', async () => { const f = file.files[0]; if (f) { ta.value = await f.text(); ta.dispatchEvent(new Event('input')); } });
  const openBtn = btn('파일에서 열기', () => file.click(), 'small ghost');
  return { ta, node: h('div.pastebox', ta, h('div.btnrow', openBtn, btn('붙여넣기', async () => {
    try { ta.value = await navigator.clipboard.readText(); } catch { toast('클립보드를 읽을 수 없어요. 칸을 길게 눌러 붙여넣으세요.'); }
  }, 'small ghost'), file)) };
}

/* 검사 파이프라인: 결과를 out에 그리고 저장 버튼을 붙인다 */
async function checkAndOffer(api, text, out, opts = {}) {
  clear(out);
  const r = extractJson(text);
  if (!r.ok) { out.appendChild(h('div.result', h('p.err', r.msg))); return; }
  if (r.fixed) out.appendChild(h('p.hint', r.fixed));
  const c = classify(r.value);
  if (c.kind === 'trip') {
    const { trip, secretValues } = prepareNewTrip(c.value);
    const v = validateTrip({ ...trip, secretValues }, { datasets: api.S.datasets });
    const exists = api.S.trips.get(trip.id);
    let extra = null;
    if (v.ok) {
      const save = async (asId) => {
        const tt = asId ? { ...trip, id: asId } : trip;
        await saveImported(api, tt, secretValues);
        if (opts.onDone) opts.onDone();
        toast('이 기기에 저장했어요. 저장소에 올리려면 [커밋]을 누르세요.');
        api.go('#/t/' + encodeURIComponent(tt.id) + '/plan');
      };
      if (exists) {
        const log = diffTrips(exists.data, trip);
        extra = h('div', h('p.warn-text', `같은 id(${trip.id})의 여행이 이미 있어요. 덮어쓰면 아래처럼 바뀌어요.`), diffView(log),
          h('div.btnrow.wrap', btn('덮어써서 저장', () => save(null), 'primary'),
            btn('다른 id로 저장', () => { const nid = prompt('새 id (YYYY-MM-지역)', trip.id + '-2'); if (nid) save(nid.trim()); })));
      } else extra = h('div.btnrow', btn('저장', () => save(null), 'primary'));
    }
    out.appendChild(resultView(v, extra));
    if (v.ok) out.appendChild(previewTrip(trip));
  } else if (c.kind === 'bundle') {
    const trips = c.value.trips || [], dss = c.value.datasets || [];
    const dsMap = { ...api.S.datasets };
    for (const d of dss) if (d && d.id) dsMap[d.id] = d;
    const rows = [], okTrips = [], okDs = [];
    for (const d of dss) { const v = validateDataset(d); rows.push(h('li', `데이터셋 ${d.title || d.id}: 장소 ${v.summary.places}곳`, v.ok ? '' : ' — 오류: ' + v.errors.map((e) => e.msg).join(' / '))); if (v.ok) okDs.push(d); }
    for (const t of trips) {
      const { trip, secretValues } = prepareNewTrip(t);
      const v = validateTrip(trip, { datasets: dsMap });
      rows.push(h('li', `여행 ${trip.meta ? trip.meta.title : trip.id}: ${v.summary.days}일 · 일정 ${v.summary.items}`, v.ok ? (api.S.trips.has(trip.id) ? ' (기기에 있음 → 덮어씀)' : '') : h('ul.errs', v.errors.slice(0, 5).map((e) => h('li', e.msg)))));
      if (v.ok) okTrips.push({ trip, secretValues });
    }
    out.appendChild(h('div.result', h('p.result-head', `묶음 파일: 여행 ${trips.length} · 데이터셋 ${dss.length}`), h('ul', rows),
      okTrips.length || okDs.length ? h('div.btnrow', btn(`${okTrips.length + okDs.length}개 저장`, async () => {
        for (const d of okDs) await saveDataset(api, d);
        for (const x of okTrips) await saveImported(api, x.trip, x.secretValues);
        if (opts.onDone) opts.onDone();
        toast('이 기기에 저장했어요. 홈의 [모두 커밋]으로 저장소에 올리세요.', 4000);
        api.go('#/');
      }, 'primary')) : null));
  } else if (c.kind === 'dataset') {
    const v = validateDataset(c.value);
    out.appendChild(h('div.result', h('p.result-head', `데이터셋 ${c.value.title || c.value.id}: 장소 ${v.summary.places}곳`),
      v.errors.length ? h('ul.errs', v.errors.map((e) => h('li', e.msg))) : null,
      v.ok ? btn('저장', async () => { await saveDataset(api, c.value); if (opts.onDone) opts.onDone(); toast('데이터셋을 저장했어요. 이 데이터셋을 쓰는 여행을 커밋할 때 함께 올라가요.', 4000); api.render(); }, 'primary') : null));
  } else if (c.kind === 'partial' || c.kind === 'places') {
    const trips = [...api.S.trips.values()];
    if (!trips.length) { out.appendChild(h('div.result', h('p.err', '여행 일부만 들어 있는 JSON이에요. 먼저 전체 여행을 만들거나, 여행 안 [데이터 → AI로 고치기]에서 붙여넣으세요.'))); return; }
    const sel = select(trips.map((x) => ({ value: x.id, label: x.data.meta.title })), opts.tripId || trips[0].id);
    out.appendChild(h('div.result', h('p', '여행 일부만 들어 있는 JSON(부분 업데이트)이에요. 어느 여행에 합칠까요?'), sel,
      btn('합치기 미리보기', () => mergePreview(api, api.S.trips.get(sel.value), c.value, out, opts), 'primary')));
  } else if (c.kind === 'index') {
    out.appendChild(h('div.result', h('p.err', '여행 목록(index.json)이에요. 여행 파일이나 묶음 파일을 넣으세요.')));
  } else out.appendChild(h('div.result', h('p.err', 'trip/v1 형식이 아니에요. 최상위에 "schema": "trip/v1", meta, days가 있어야 해요.')));
}

function mergePreview(api, rec, partial, out, opts) {
  clear(out);
  const { trip, log, secretValues } = mergeInto(rec.data, partial);
  const v = validateTrip(trip, { datasets: api.S.datasets });
  out.appendChild(resultView({ ...v, summary: { ...v.summary, secrets: Object.keys(secretValues).length } },
    h('div', h('h4', '변경 목록'), diffView(log),
      v.ok ? h('div.btnrow', btn('적용', async () => {
        await saveImported(api, trip, secretValues);
        if (opts.onDone) opts.onDone();
        toast('적용했어요. 확인 후 [커밋]하세요.');
        api.go('#/t/' + encodeURIComponent(rec.id) + '/plan');
        api.render();
      }, 'primary')) : null)));
}

/* ── 가져오기 시트 (홈) ───────────────────────────── */
export function openImportSheet(api) {
  const { ta, node } = pasteBox('여행 JSON, 묶음(bundle) JSON, 데이터셋 JSON을 붙여넣거나 파일로 여세요');
  const out = h('div');
  const s = openSheet('가져오기', h('div', node, h('div.btnrow', btn('검사', () => checkAndOffer(api, ta.value, out, { onDone: () => s.close() }), 'primary')), out));
}

/* ── AI로 고치기 (여행 안) ────────────────────────── */
export function openAiEdit(ctx) {
  const kind = select([
    { value: 'edit-trip', label: '(2) 기존 여행 고치기' },
    { value: 'bookings', label: '(4) 예약 메일·캡처 정리' },
    { value: 'add-places', label: '(3) 장소 여러 곳 추가' },
  ], 'edit-trip');
  const { ta, node } = pasteBox('AI가 준 JSON(전체 또는 바뀐 블록만)을 붙여넣으세요');
  const out = h('div');
  const run = () => {
    clear(out);
    const r = extractJson(ta.value);
    if (!r.ok) { out.appendChild(h('div.result', h('p.err', r.msg))); return; }
    const c = classify(r.value);
    let partial;
    if (c.kind === 'trip') {
      if (c.value.id !== ctx.trip.id) { out.appendChild(h('p.warn-text', `id가 달라요(${c.value.id}). 이 여행(${ctx.trip.id})에 덮어쓰는 것으로 처리해요.`)); }
      partial = { ...c.value, id: ctx.trip.id };
      const { trip, secretValues } = prepareNewTrip(partial);
      const v = validateTrip(trip, { datasets: ctx.datasets });
      out.appendChild(resultView({ ...v, summary: { ...v.summary, secrets: Object.keys(secretValues).length } }, h('div', h('h4', '변경 목록'), diffView(diffTrips(ctx.trip, trip)),
        v.ok ? btn('적용', async () => { if (Object.keys(secretValues).length) setSecrets(ctx.trip.id, secretValues); s.close(); await ctx.replace(adoptAll(trip, ctx), '적용했어요. 확인 후 [커밋]하세요.'); }, 'primary') : null)));
      return;
    }
    if (c.kind === 'places') partial = c.value;
    else if (c.kind === 'partial') partial = c.value;
    else { out.appendChild(h('div.result', h('p.err', '여행 JSON 또는 바뀐 블록({"days": [...]} 등)을 붙여넣으세요.'))); return; }
    const { trip, log, secretValues } = mergeInto(ctx.trip, partial);
    const v = validateTrip(trip, { datasets: ctx.datasets });
    out.appendChild(resultView({ ...v, summary: { ...v.summary, secrets: Object.keys(secretValues).length } },
      h('div', h('h4', '변경 목록'), diffView(log),
        v.ok ? btn('적용', async () => { if (Object.keys(secretValues).length) setSecrets(ctx.trip.id, secretValues); s.close(); await ctx.replace(adoptAll(trip, ctx), '적용했어요. 확인 후 [커밋]하세요.'); }, 'primary') : null)));
  };
  const s = openSheet('AI로 고치기', h('div',
    h('ol.steps',
      h('li', field('프롬프트', kind), btn('프롬프트 복사', async () => {
        const text = await buildPrompt(kind.value, { trip: ctx.trip, profile: getProfile(), date: ctx.trip.meta.start, badgeIds: Object.keys(badgeDict(ctx.trip, ctx.datasets)) });
        toast((await copyText(text)) ? '복사했어요. 여행을 상의하던 AI 채팅 끝에 붙여넣고 (여기에) 부분을 채우세요.' : '복사하지 못했어요.', 4000);
      }, 'small')),
      h('li', 'AI가 준 JSON을 붙여넣고 [검사] → 변경 목록 확인 → [적용].')),
    node, h('div.btnrow', btn('검사', run, 'primary')), out));
}
function adoptAll(trip, ctx) {
  const t = clone(trip);
  for (const d of t.days || []) for (const p of d.plans || []) for (const it of p.items || []) if (it.placeId && !byId(t.places, it.placeId)) adoptPlace(t, ctx.datasets, it.placeId);
  return t;
}

/* ── 새 여행 화면 ─────────────────────────────────── */
export function viewNew(api, r) {
  document.title = '새 여행 · 가족 여행';
  if (r.id) return viewClone(api, r.id);
  const profile = getProfile();
  const kind = select([
    { value: 'new-trip', label: '(1) 새 여행 만들기' },
    { value: 'past-trip', label: '(5) 지난 여행 기록 정리' },
  ], 'new-trip');
  const dateIn = input('', { type: 'date' });
  const pastWithRetro = api.allTrips().filter((t) => t.notes && t.notes.retro);
  const retroChecks = pastWithRetro.map((t) => checkbox(false, t.meta.title, null, { value: t.id }));
  const { ta, node } = pasteBox('AI가 준 JSON을 여기에 붙여넣으세요');
  const out = h('div');
  const copyPrompt = async () => {
    const chosen = retroChecks.map((c) => c.querySelector('input')).filter((i) => i.checked).map((i) => api.allTrips().find((t) => t.id === i.value));
    const text = await buildPrompt(kind.value, { profile, date: dateIn.value || null, retro: retroText(chosen) });
    toast((await copyText(text)) ? '복사했어요. 여행을 상의하던 AI 채팅 맨 끝에 붙여넣으세요.' : '복사하지 못했어요. 아래 [프롬프트 보기]에서 직접 복사하세요.', 4000);
  };
  const showPrompt = async () => {
    const chosen = retroChecks.map((c) => c.querySelector('input')).filter((i) => i.checked).map((i) => api.allTrips().find((t) => t.id === i.value));
    const text = await buildPrompt(kind.value, { profile, date: dateIn.value || null, retro: retroText(chosen) });
    openSheet('프롬프트', h('div', textarea(text, { rows: 18, readonly: true, class: 'mono' })));
  };
  return h('div.newtrip',
    h('header.home-head', h('a.icon-btn.back', { href: '#/', 'aria-label': '여행 목록' }, '‹'), h('h1.brand', '새 여행')),
    h('main.page',
      section('① 프롬프트 복사',
        h('p.hint', '규칙·가족 프로필(여행 시점 나이만)·양식이 한 번에 복사돼요. 여행을 상의하던 AI 채팅 맨 끝에 붙여넣으세요. 대화가 없으면 메모·예약 메일을 같이 붙여넣으세요.'),
        field('프롬프트', kind), field('여행 시작일 (나이 계산용, 선택)', dateIn),
        retroChecks.length ? h('div.field', h('label', '지난 여행 회고 붙이기'), h('div.chips', retroChecks)) : null,
        h('div.btnrow.wrap', btn('프롬프트 복사', copyPrompt, 'primary'), btn('프롬프트 보기', showPrompt, 'ghost'),
          btn('양식만 복사', async () => toast((await copyText(templateText())) ? '양식을 복사했어요.' : '복사하지 못했어요.'), 'ghost')),
        h('p.hint', '큰 여행은 나눠 요청해도 돼요: ① meta·stays·transports ② days ③ places. 처음 것을 저장한 뒤 나머지는 여행 안 [데이터 → AI로 고치기]에 붙여넣으면 합쳐져요.')),
      section('② AI가 준 JSON 붙여넣기', node,
        h('p.hint', '코드블록 표시(```)나 앞뒤 설명 문장은 자동으로 걷어내요.'),
        h('div.btnrow', btn('검사', () => checkAndOffer(api, ta.value, out), 'primary'))),
      out,
      section('다른 방법',
        h('div.btnrow.wrap', btn('지난 여행 복제', () => openCloneChooser(api), 'ghost'), btn('파일·묶음 가져오기', () => openImportSheet(api), 'ghost'))),
      h('details.help', h('summary', '프롬프트 원문 (5종)'), h('ul', PROMPTS.map((p) => h('li', h('button.linkish', { type: 'button', onclick: async () => {
        const text = await buildPrompt(p.id, { profile, trip: api.allTrips()[0] || null, badgeIds: [] });
        openSheet(p.title, h('div', textarea(text, { rows: 18, readonly: true, class: 'mono' })));
      } }, p.title)))))));
}
function openCloneChooser(api) {
  const trips = api.allTrips();
  if (!trips.length) { toast('복제할 여행이 없어요.'); return; }
  const s = openSheet('어떤 여행을 복제할까요?', h('ul.plist', trips.map((t) => h('li', h('button.prow', { type: 'button', onclick: () => { s.close(); api.go('#/new/' + encodeURIComponent(t.id)); } },
    h('div.prow-main', h('div.prow-name', t.meta.title), h('div.prow-sub', `${fmtDate(t.meta.start)} – ${fmtDate(t.meta.end)}`)))))));
}
function viewClone(api, srcId) {
  const rec = api.S.trips.get(srcId);
  if (!rec) return h('main.page', h('p', '복제할 여행이 이 기기에 없어요.'));
  const src = rec.data;
  const start = input('', { type: 'date' });
  const id = input('', { placeholder: 'YYYY-MM-지역' });
  const title = input(src.meta.title.replace(/^\d{4}\s*/, ''));
  start.addEventListener('change', () => {
    if (!RE_DATE.test(start.value)) return;
    const region = src.id.replace(/^\d{4}-\d{2}-/, '');
    id.value = start.value.slice(0, 7) + '-' + region;
    title.value = start.value.slice(0, 4) + ' ' + src.meta.title.replace(/^\d{4}\s*/, '');
  });
  const n = daysBetween(src.meta.start, src.meta.end);
  return h('div.newtrip',
    h('header.home-head', h('a.icon-btn.back', { href: '#/', 'aria-label': '여행 목록' }, '‹'), h('h1.brand', '복제해서 새 여행')),
    h('main.page',
      section(src.meta.title,
        h('p.hint', `구조·장소·체크리스트를 복사하고 날짜를 옮겨요(${n}박). 예약·비밀값·경비·결정 기록은 비우고, 일정은 모두 '잠정'이 돼요.`),
        field('새 시작일', start), field('새 id', id, '파일 이름이 돼요. 영문·숫자·하이픈'), field('제목', title),
        h('div.btnrow', btn('복제', async () => {
          if (!RE_DATE.test(start.value)) { toast('시작일을 고르세요.'); return; }
          const nid = id.value.trim();
          if (!/^\d{4}-\d{2}-[\w-]+$/.test(nid)) { toast('id는 YYYY-MM-지역 형식이어야 해요.'); return; }
          if (api.S.trips.has(nid) && !(await ask(`id ${nid} 여행이 이미 있어요. 덮어쓸까요?`))) return;
          const t = shiftTrip(src, nid, start.value);
          t.meta.title = title.value.trim() || t.meta.title;
          await saveImported(api, t, {});
          toast(`복제했어요 (${fmtDate(t.meta.start)} – ${fmtDate(addDays(start.value, n))}).`);
          api.go('#/t/' + encodeURIComponent(nid) + '/plan');
        }, 'primary')))));
}

