/* 붙여넣기 → JSON → (새 여행 | 부분 업데이트) 병합
   가져오기 전용 키 secretValues, _remove 는 여기서 처리하고 파일에는 남기지 않는다. */
import { clone, same, byId } from './util.js';

/* 코드블록 표시·앞뒤 설명 문장을 걷어내고 파싱. 실패하면 몇째 줄 몇째 글자인지 알려준다. */
export function extractJson(text) {
  let s = String(text || '').replace(/^﻿/, '').trim();
  if (!s) return { ok: false, msg: '붙여넣은 내용이 비어 있어요.' };
  const fence = /```(?:json|JSON)?\s*\n([\s\S]*?)```/.exec(s);
  if (fence) s = fence[1].trim();
  const first = s.search(/[{[]/);
  if (first < 0) return { ok: false, msg: 'JSON을 찾지 못했어요. { 로 시작하는 내용을 붙여넣으세요.' };
  const open = s[first], close = open === '{' ? '}' : ']';
  const last = s.lastIndexOf(close);
  if (last < first) return { ok: false, msg: `JSON이 끝나지 않았어요. 마지막 ${close} 까지 복사됐는지 확인하세요.` };
  const body = s.slice(first, last + 1)
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'");   // 메신저가 바꾼 따옴표
  try { return { ok: true, value: JSON.parse(body) }; } catch (e) {
    // 흔한 실수: 끝 쉼표
    const relaxed = body.replace(/,(\s*[}\]])/g, '$1');
    try { return { ok: true, value: JSON.parse(relaxed), fixed: '끝에 남은 쉼표를 지우고 읽었어요.' }; } catch { /* 위치 안내 */ }
    return { ok: false, msg: describeParseError(e, body) };
  }
}
function describeParseError(e, body) {
  const msg = String(e && e.message || e);
  let pos = null, m;
  if ((m = /position (\d+)/i.exec(msg))) pos = +m[1];
  else if ((m = /line (\d+) column (\d+)/i.exec(msg))) {
    const lines = body.split('\n'); let p = 0;
    for (let i = 0; i < +m[1] - 1 && i < lines.length; i++) p += lines[i].length + 1;
    pos = p + (+m[2]) - 1;
  }
  if (pos == null) return 'JSON 문법 오류: ' + msg;
  const before = body.slice(0, pos);
  const line = before.split('\n').length, col = pos - before.lastIndexOf('\n');
  const lineText = body.split('\n')[line - 1] || '';
  const snippet = lineText.slice(Math.max(0, col - 30), col + 30);
  return `JSON 문법 오류: ${line}째 줄 ${col}째 글자에서 막혔어요. 그 근처에 쉼표·따옴표·괄호가 빠졌는지 보세요.\n… ${snippet} …`;
}

/* 무엇이 들어왔는지 분류 */
export function classify(v) {
  if (Array.isArray(v)) {
    if (v.every((x) => x && typeof x === 'object' && x.name)) return { kind: 'places', value: { places: v } };
    return { kind: 'unknown' };
  }
  if (!v || typeof v !== 'object') return { kind: 'unknown' };
  if (v.schema === 'bundle/v1') return { kind: 'bundle', value: v };
  if (v.schema === 'dataset/v1') return { kind: 'dataset', value: v };
  if (v.schema === 'index/v1') return { kind: 'index', value: v };
  if (v.schema === 'trip/v1' && v.meta && Array.isArray(v.days)) return { kind: 'trip', value: v };
  if (v.backup === 'travel-app/v1') return { kind: 'backup', value: v };
  return { kind: 'partial', value: v };
}

/* 가져오기 전용 키 분리 */
export function takeImportKeys(obj) {
  const o = clone(obj);
  const secretValues = o.secretValues && typeof o.secretValues === 'object' ? o.secretValues : {};
  const remove = o._remove && typeof o._remove === 'object' ? o._remove : null;
  delete o.secretValues; delete o._remove;
  return { body: o, secretValues, remove };
}

/* 객체는 깊게 합치고(바꾼 키만), 배열·값은 새 것으로 바꾼다 */
const isPlain = (o) => o && typeof o === 'object' && !Array.isArray(o);
export function deepMerge(a, b) {
  if (!isPlain(a) || !isPlain(b)) return clone(b);
  const out = clone(a);
  for (const [k, v] of Object.entries(b)) out[k] = isPlain(out[k]) && isPlain(v) ? deepMerge(out[k], v) : clone(v);
  return out;
}
/* 배열 id 기준 upsert. 항목 안의 객체(pass, hours, prices…)는 깊게 병합 */
function upsert(base, incoming, log, path) {
  const out = (base || []).slice();
  for (const x of incoming || []) {
    if (!x || typeof x !== 'object' || !x.id) { out.push(x); log.added.push(path + ' (id 없음)'); continue; }
    const i = out.findIndex((y) => y && y.id === x.id);
    if (i < 0) { out.push(x); log.added.push(`${path}: ${label(x)}`); }
    else { const m = deepMerge(out[i], x); if (!same(out[i], m)) { out[i] = m; log.changed.push(`${path}: ${label(x)}`); } }
  }
  return out;
}
const label = (x) => x.title || x.name || x.label || x.text || x.date || x.id;

/* days는 date로 맞추고, 안은 id로, 항목은 id로 upsert */
function mergeDays(base, incoming, log) {
  const out = clone(base || []);
  for (const d of incoming || []) {
    if (!d || !d.date) continue;
    const cur = out.find((x) => x.date === d.date);
    if (!cur) { out.push(d); log.added.push('날짜: ' + d.date); continue; }
    for (const [k, v] of Object.entries(d)) {
      if (k === 'plans' || k === 'date') continue;
      if (!same(cur[k], v)) { cur[k] = v; log.changed.push(`${d.date} ${k}`); }
    }
    for (const p of d.plans || []) {
      const cp = byId(cur.plans, p.id);
      if (!cp) { cur.plans = (cur.plans || []).concat([p]); log.added.push(`${d.date} 안: ${p.label || p.id}`); continue; }
      if (p.label && p.label !== cp.label) { cp.label = p.label; log.changed.push(`${d.date} 안 이름: ${p.label}`); }
      for (const [k, v] of Object.entries(p)) if (!['id', 'label', 'items'].includes(k) && !same(cp[k], v)) { cp[k] = v; log.changed.push(`${d.date} 안 ${k}`); }
      if (Array.isArray(p.items)) cp.items = upsert(cp.items, p.items, log, `${d.date} 일정`);
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

const ARRAY_BLOCKS = ['travelers', 'badges', 'stays', 'transports', 'places', 'passes', 'checklists', 'contacts', 'secrets'];

/* 기존 여행에 부분 JSON 병합 → { trip, log } */
export function mergeInto(existing, partial) {
  const { body, secretValues, remove } = takeImportKeys(partial);
  const trip = clone(existing);
  const log = { added: [], changed: [], removed: [], secretKeys: Object.keys(secretValues) };
  for (const [k, v] of Object.entries(body)) {
    if (['schema', 'id', 'updatedAt'].includes(k)) continue;
    if (k === 'days') trip.days = mergeDays(trip.days, v, log);
    else if (k === 'checklists') {
      const merged = upsert(trip.checklists, (v || []).map((c) => ({ ...c, items: undefined })), log, '체크리스트');
      for (const c of v || []) {
        const t = byId(merged, c.id); if (!t) continue;
        const orig = byId(existing.checklists, c.id);
        t.items = upsert(orig ? orig.items : [], c.items || [], log, `체크리스트 ${c.title || c.id}`);
      }
      trip.checklists = merged.map((c) => { if (c.items === undefined) delete c.items; return c; });
    } else if (k === 'secrets') {
      const cur = trip.secrets || [];
      for (const s of v || []) if (s && s.key && !cur.some((x) => x.key === s.key)) { cur.push(s); log.added.push('비밀값 키: ' + s.key); }
      trip.secrets = cur;
    } else if (ARRAY_BLOCKS.includes(k) && Array.isArray(v)) trip[k] = upsert(trip[k], v, log, k);
    else if (k === 'meta' || k === 'emergency' || k === 'budget' || k === 'notes') {
      const cur = trip[k] || {};
      for (const [kk, vv] of Object.entries(v || {})) if (!same(cur[kk], vv)) { cur[kk] = vv; log.changed.push(`${k}.${kk}`); }
      trip[k] = cur;
    } else if (!same(trip[k], v)) { trip[k] = v; log.changed.push(k); }
  }
  if (remove) applyRemove(trip, remove, log);
  for (const sk of Object.keys(secretValues)) {
    if (!(trip.secrets || []).some((s) => s.key === sk)) (trip.secrets = trip.secrets || []).push({ key: sk, label: sk });
  }
  return { trip, log, secretValues };
}

export function applyRemove(trip, remove, log) {
  const drop = (arr, ids, what) => (arr || []).filter((x) => {
    if (x && ids.includes(x.id)) { log.removed.push(`${what}: ${label(x)}`); return false; }
    return true;
  });
  for (const [k, ids] of Object.entries(remove)) {
    if (!Array.isArray(ids) || !ids.length) continue;
    if (k === 'items') {
      for (const d of trip.days || []) for (const p of d.plans || []) p.items = drop(p.items, ids, `${d.date} 일정`);
    } else if (k === 'days') {
      trip.days = (trip.days || []).filter((d) => {
        if (ids.includes(d.date)) { log.removed.push('날짜: ' + d.date); return false; }
        return true;
      });
    } else if (k === 'plans') {
      for (const d of trip.days || []) d.plans = drop(d.plans, ids, `${d.date} 안`);
    } else if (k === 'secrets') {
      trip.secrets = (trip.secrets || []).filter((s) => !ids.includes(s.key));
    } else if (ARRAY_BLOCKS.includes(k)) trip[k] = drop(trip[k], ids, k);
  }
}

/* 새 여행 가져오기: 전용 키를 떼고 반환 */
export function prepareNewTrip(v) {
  const { body, secretValues, remove } = takeImportKeys(v);
  const log = { added: [], changed: [], removed: [], secretKeys: Object.keys(secretValues) };
  if (remove) applyRemove(body, remove, log);
  for (const sk of Object.keys(secretValues)) {
    if (!(body.secrets || []).some((s) => s.key === sk)) (body.secrets = body.secrets || []).push({ key: sk, label: sk });
  }
  return { trip: body, secretValues, log };
}

/* 두 여행 사이의 변경 목록 (AI로 고치기 미리보기) */
export function diffTrips(a, b) {
  const log = { added: [], changed: [], removed: [] };
  const cmpArr = (x, y, what) => {
    const ix = new Map((x || []).filter((o) => o && o.id).map((o) => [o.id, o]));
    const iy = new Map((y || []).filter((o) => o && o.id).map((o) => [o.id, o]));
    for (const [id, o] of iy) if (!ix.has(id)) log.added.push(`${what}: ${label(o)}`); else if (!same(ix.get(id), o)) log.changed.push(`${what}: ${label(o)}`);
    for (const [id, o] of ix) if (!iy.has(id)) log.removed.push(`${what}: ${label(o)}`);
  };
  for (const k of ARRAY_BLOCKS) if (!same(a[k], b[k])) cmpArr(a[k], b[k], k);
  const da = new Map((a.days || []).map((d) => [d.date, d])), dbb = new Map((b.days || []).map((d) => [d.date, d]));
  for (const [date, d] of dbb) {
    const o = da.get(date);
    if (!o) { log.added.push('날짜: ' + date); continue; }
    if (same(o, d)) continue;
    const items = (dd) => (dd.plans || []).flatMap((p) => (p.items || []).map((it) => ({ ...it, _p: p.id })));
    cmpArr(items(o), items(d), `${date} 일정`);
    const strip = (dd) => ({ ...dd, plans: (dd.plans || []).map((p) => ({ ...p, items: undefined })) });
    if (!same(strip(o), strip(d))) log.changed.push(`${date} 날짜 정보`);
  }
  for (const date of da.keys()) if (!dbb.has(date)) log.removed.push('날짜: ' + date);
  for (const k of ['meta', 'emergency', 'budget', 'notes']) if (!same(a[k], b[k])) log.changed.push(k);
  return log;
}
