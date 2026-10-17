/* AI 프롬프트 — 원문은 assets/prompts/*.txt, {{...}}는 앱이 채운다 ({{secret:키}}는 그대로 둔다) */
import { blankTrip, profileSummary } from './model.js';

const cache = {};
export const PROMPTS = [
  { id: 'new-trip', title: '새 여행 만들기' },
  { id: 'edit-trip', title: '기존 여행 고치기' },
  { id: 'add-places', title: '장소 여러 곳 추가' },
  { id: 'bookings', title: '예약 메일·캡처 정리' },
  { id: 'past-trip', title: '지난 여행 기록 정리' },
];
export async function loadPrompt(id) {
  if (cache[id]) return cache[id];
  const res = await fetch(new URL('./prompts/' + id + '.txt', import.meta.url));
  if (!res.ok) throw new Error('프롬프트를 불러오지 못했어요 (' + res.status + ')');
  return (cache[id] = await res.text());
}
export function fill(text, vars) {
  return text.replace(/\{\{(profileSummary|template|tripJson|badgeIds|existingPlaceNames|retro)\}\}/g,
    (_, k) => (vars[k] == null ? '' : vars[k]));
}
export const templateText = () => JSON.stringify(blankTrip(), null, 1);

/* 지난 여행 회고를 프롬프트에 붙이기 (선택) */
export function retroText(trips) {
  const parts = [];
  for (const t of trips || []) {
    const r = t.notes && t.notes.retro;
    if (!r) continue;
    const lines = [];
    if (r.good && r.good.length) lines.push('  좋았던 것: ' + r.good.join(' / '));
    if (r.meh && r.meh.length) lines.push('  아쉬운 것: ' + r.meh.join(' / '));
    if (r.next && r.next.length) lines.push('  다음에: ' + r.next.join(' / '));
    if (lines.length) parts.push(`- ${t.meta.title}\n` + lines.join('\n'));
  }
  return parts.length ? '\n[지난 여행 회고]\n' + parts.join('\n') + '\n' : '';
}

export async function buildPrompt(id, ctx) {
  const raw = await loadPrompt(id);
  const vars = {
    profileSummary: profileSummary(ctx.profile || {}, ctx.date || null),
    template: templateText(),
    retro: ctx.retro || '',
  };
  if (ctx.trip) {
    const t = ctx.trip;
    vars.tripJson = JSON.stringify(t);
    vars.badgeIds = (ctx.badgeIds || []).join(', ') || '(없음)';
    vars.existingPlaceNames = (t.places || []).map((p) => p.name).join(', ') || '(없음)';
  }
  return fill(raw, vars);
}
