/* AI 프롬프트 — 원문은 assets/prompts/*.txt, {{...}}는 앱이 채운다 ({{secret:키}}는 그대로 둔다) */
import { blankTrip, profileSummary } from './model.js';

const cache = {};
export const PROMPTS = [
  { id: 'new-trip', title: '새 여행 만들기' },
  { id: 'edit-trip', title: '기존 여행 고치기' },
  { id: 'add-places', title: '장소 여러 곳 추가' },
  { id: 'bookings', title: '예약 메일·캡처 정리' },
  { id: 'past-trip', title: '지난 여행 기록 정리' },
  { id: 'fix-warnings', title: '경고 해결 요청' },
  { id: 'retro', title: '회고 정리' },
  { id: 'prices', title: '장소 가격 조사' },
];
export async function loadPrompt(id) {
  if (cache[id]) return cache[id];
  const res = await fetch(new URL('./prompts/' + id + '.txt', import.meta.url));
  if (!res.ok) throw new Error('프롬프트를 불러오지 못했어요 (' + res.status + ')');
  return (cache[id] = await res.text());
}
export function fill(text, vars) {
  return text.replace(/\{\{(profileSummary|template|tripJson|badgeIds|existingPlaceNames|retro|rules|warnings|retroNow|tripLog|placesList)\}\}/g,
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
    vars.retroNow = JSON.stringify((t.notes && t.notes.retro) || { good: [], meh: [], next: [] });
    vars.tripLog = tripLog(t);
  }
  if (ctx.rules) vars.rules = rulesText(ctx.rules);
  vars.warnings = (ctx.warnings || []).map((w) => '- ' + w).join('\n') || '(경고 없음)';
  vars.placesList = (ctx.places || []).map((p) => `- ${p.id}: ${p.name}${p.price ? ' (메모: ' + p.price + ')' : ''}`).join('\n') || '(없음)';
  return fill(raw, vars);
}

export function rulesText(r) {
  return [`- 하루 고정 외출 최대 ${r.maxOutings}곳(선택 일정 제외)`, `- 하루 운전 합계 ${r.maxDriveMin}분 이내`, `- 한 번 이동 ${r.maxLegMin}분 이내(아이 멀미)`,
    `- 아이 취침 ${r.bedtime} 이후 외부 일정 없음`, `- 식사·간식 간격 ${r.mealGapH}시간 이내`].join('\n');
}
/* 회고용 여행 기록: 날짜별 한 줄 기록과 완료·건너뜀 */
export function tripLog(t) {
  const out = [];
  for (const d of t.days || []) {
    const plan = (d.plans || []).find((p) => p.id === d.activePlan) || (d.plans || [])[0] || { items: [] };
    out.push(`${d.date} ${d.title || ''}`.trim());
    if (d.journal && (d.journal.text || d.journal.best)) out.push(`  한 줄: ${d.journal.text || ''}${d.journal.best ? ' / 최고: ' + d.journal.best : ''}`);
    for (const it of plan.items || []) {
      if (it.kind === 'move') continue;
      const mark = it.done ? '✓' : it.skipped ? '✗ 건너뜀' : '·';
      out.push(`  ${mark} ${it.time || ''} ${it.title}${it.note && it.skipped ? ' (' + it.note + ')' : ''}`.replace(/\s+/g, ' '));
    }
  }
  const ex = (t.budget && t.budget.expenses) || [];
  if (ex.length) out.push(`지출 ${ex.length}건`);
  return out.join('\n');
}
