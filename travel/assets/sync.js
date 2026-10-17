/* 3방향 병합 — 마지막 커밋본(base)을 기준으로 이 기기(local)와 저장소(remote)의 변경을 항목 단위로 합친다.
   서로 다른 곳을 고쳤으면 자동으로 합치고, 같은 값을 양쪽이 다르게 고쳤을 때만 충돌로 돌려준다.
   배열은 id(일정·장소 등), date(days), key(secrets)로 짝을 맞추고, id가 없는 배열은 집합으로 합친다.
   DOM을 쓰지 않아 node에서 테스트한다. */
import { clone, same, stable } from './util.js';

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

/* 화면에 보일 필드 이름 */
const FIELD = {
  time: '시작', end: '끝', title: '제목', note: '메모', notes: '메모', placeId: '장소', status: '상태', optional: '선택',
  done: '완료', skipped: '건너뜀', activatedAt: '개시 시각', text: '내용', due: '마감일', amount: '금액', checkIn: '체크인',
  checkOut: '체크아웃', start: '출발', name: '이름', label: '이름', activePlan: '선택한 안', journal: '한 줄 기록', leg: '이동',
  kind: '종류', passUse: '패스', fav: '찜', lat: '위도', lng: '경도', hours: '운영시간', phone: '전화', desc: '설명',
  summary: '요약', accent: '강조색', cat: '분류', group: '지역', price: '요금', retro: '회고', stayId: '숙소',
};
const PART = { days: '', plans: '안', items: '', places: '장소', stays: '숙소', transports: '교통', checklists: '체크리스트',
  passes: '패스', meta: '여행 정보', budget: '경비', expenses: '지출', notes: '메모', emergency: '비상', documents: '서류' };

/* 배열 원소의 짝 맞추기 기준 */
function keyField(path, arrays) {
  const last = path[path.length - 1];
  if (path.length === 1 && last === 'days') return 'date';
  if (path.length === 1 && last === 'secrets') return 'key';
  const all = arrays.flat();
  if (all.length && all.every((x) => isObj(x) && x.id != null)) return 'id';
  return null;
}
const elemLabel = (x, kf) => (!isObj(x) ? String(x) : kf === 'date' ? String(x.date).slice(5).replace('-', '/')
  : (x.title || x.name || x.label || x.text || x[kf]));

export function merge3(base, local, remote) {
  const conflicts = [];
  const merged = mergeValue(base, local, remote, [], [], conflicts);
  return { merged, conflicts };
}

function mergeValue(b, l, r, path, labels, conflicts) {
  if (same(l, r)) return clone(l);
  if (same(b, l)) return clone(r);       // 이 기기는 그대로 → 저장소 변경(추가·삭제 포함)
  if (same(b, r)) return clone(l);
  if (isObj(l) && isObj(r)) return mergeObj(isObj(b) ? b : {}, l, r, path, labels, conflicts);
  if (Array.isArray(l) && Array.isArray(r)) return mergeArr(Array.isArray(b) ? b : [], l, r, path, labels, conflicts);
  conflicts.push({ path, label: labels.filter(Boolean).join(' · ') || '값', local: clone(l), remote: clone(r) });
  return clone(l);                       // 고르기 전까지는 이 기기 값
}

function mergeObj(b, l, r, path, labels, conflicts) {
  const out = {};
  const keys = [...new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(b)])];
  for (const k of keys) {
    if (path.length === 0 && k === 'updatedAt') { out[k] = l[k]; continue; }
    const lab = path.length === 0 ? (PART[k] ?? k) : (FIELD[k] || k);
    const v = mergeValue(b[k], l[k], r[k], [...path, k], [...labels, lab], conflicts);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mergeArr(b, l, r, path, labels, conflicts) {
  const kf = keyField(path, [b, l, r]);
  if (!kf) return mergeSet(b, l, r);
  const id = (x) => (isObj(x) ? x[kf] : undefined);
  const mb = new Map(b.map((x) => [id(x), x])), ml = new Map(l.map((x) => [id(x), x])), mr = new Map(r.map((x) => [id(x), x]));
  const keep = new Map();
  for (const k of new Set([...ml.keys(), ...mr.keys(), ...mb.keys()])) {
    const bx = mb.get(k), lx = ml.get(k), rx = mr.get(k);
    const lab = PART[path[path.length - 1]] ? `${PART[path[path.length - 1]]} ${elemLabel(lx || rx || bx, kf)}`.trim() : elemLabel(lx || rx || bx, kf);
    if (lx && rx) keep.set(k, mergeValue(bx, lx, rx, [...path, { k: kf, v: k }], [...labels.slice(0, -1), lab], conflicts));
    else if (lx && !rx) { if (!bx || !same(bx, lx)) keep.set(k, clone(lx)); }        // 저장소가 지웠어도 이 기기가 고쳤으면 남긴다
    else if (!lx && rx) { if (!bx || !same(bx, rx)) keep.set(k, clone(rx)); }
  }
  /* 순서: 한쪽만 순서를 바꿨으면 그쪽을 따르고, 새로 생긴 항목은 원래 이웃 뒤에 끼운다 */
  const ids = (arr) => arr.map(id);
  const bIds = ids(b), lIds = ids(l), rIds = ids(r);
  const rel = (seq, set) => seq.filter((x) => set.has(x));
  const bSet = new Set(bIds), lSet = new Set(lIds), rSet = new Set(rIds);
  const lMoved = !same(rel(lIds, bSet), rel(bIds, lSet));
  const rMoved = !same(rel(rIds, bSet), rel(bIds, rSet));
  const primary = rMoved && !lMoved ? rIds : lIds, secondary = primary === rIds ? lIds : rIds;
  const order = primary.filter((x) => keep.has(x));
  secondary.forEach((x, i) => {
    if (!keep.has(x) || order.includes(x)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const p = order.indexOf(secondary[j]); if (p >= 0) { at = p + 1; break; } }
    const secSet = new Set(secondary);
    while (at < order.length && !bSet.has(order[at]) && !secSet.has(order[at])) at++;   // 같은 자리에 이 기기가 먼저 넣은 항목 뒤로
    order.splice(at, 0, x);
  });
  for (const x of keep.keys()) if (!order.includes(x)) order.push(x);
  return order.map((x) => keep.get(x));
}

/* id 없는 배열: 양쪽에서 더한 것은 모두 남기고, 한쪽이 지운 것은 지운다 */
function mergeSet(b, l, r) {
  const key = (x) => (x !== null && typeof x === 'object' ? 'o' + stable(x) : typeof x + ':' + String(x));
  const bs = new Set(b.map(key)), ls = new Set(l.map(key)), rs = new Set(r.map(key));
  const out = [];
  for (const x of l) { const k = key(x); if (bs.has(k) && !rs.has(k)) continue; out.push(clone(x)); }
  for (const x of r) { const k = key(x); if (!bs.has(k) && !ls.has(k)) out.push(clone(x)); }
  return out;
}

/* 충돌 해결: 경로를 따라가 값을 바꾼다 (배열은 {k, v}로 원소를 찾는다) */
export function setAtPath(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    cur = typeof seg === 'object' ? (cur || []).find((x) => isObj(x) && x[seg.k] === seg.v) : (cur || {})[seg];
    if (cur == null) return false;
  }
  const last = path[path.length - 1];
  if (typeof last === 'object') {
    const i = cur.findIndex((x) => isObj(x) && x[last.k] === last.v);
    if (value === undefined) { if (i >= 0) cur.splice(i, 1); } else if (i >= 0) cur[i] = value; else cur.push(value);
  } else if (value === undefined) delete cur[last];
  else cur[last] = value;
  return true;
}
export function resolveConflicts(merged, conflicts, choices) {
  const out = clone(merged);
  conflicts.forEach((c, i) => { if (choices[i] === 'remote') setAtPath(out, c.path, clone(c.remote)); });
  return out;
}
export function showValue(v) {
  if (v === undefined || v === null) return '(없음)';
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  if (typeof v === 'object') { const s = JSON.stringify(v); return s.length > 60 ? s.slice(0, 57) + '…' : s; }
  const s = String(v); return s.length > 60 ? s.slice(0, 57) + '…' : s;
}
