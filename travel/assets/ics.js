/* 캘린더 내보내기 (.ics) — 알림(VALARM)을 넣어 휴대폰 캘린더가 알림을 맡게 한다 */
import { toEpoch, RE_DT, RE_TIME, plain } from './util.js';
import { activePlan, reserveReminders } from './model.js';

const pad = (n) => String(n).padStart(2, '0');
function utc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z';
}
const escTxt = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
function fold(line) {                     // 75옥텟 접기 (UTF-8 기준)
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur); return out.join('\r\n');
}

export function buildIcs(trip, opts = {}) {
  const tz = trip.meta.timezone || 'Asia/Seoul';
  const secrets = opts.secrets || {};
  const only = opts.date || null;          // 하루만
  const ev = [];
  const add = (uid, startDt, endDt, title, desc, alarmMin, loc) => {
    if (!RE_DT.test(startDt || '')) return;
    if (only && startDt.slice(0, 10) !== only) return;
    const s = toEpoch(startDt, tz);
    const e = RE_DT.test(endDt || '') ? toEpoch(endDt, tz) : s + 30 * 60000;
    ev.push({ uid, s, e: Math.max(e, s + 5 * 60000), title, desc, alarmMin, loc });
  };
  for (const t of trip.transports || []) {
    add(`${t.id}@${trip.id}`, t.start, t.end, t.title, plain(t.notes, secrets), t.kind === 'flight' ? 120 : 30, t.from || '');
    for (const [i, d] of (t.deadlines || []).entries()) add(`${t.id}-dl${i}@${trip.id}`, d.at, null, '⏰ ' + d.label, t.title, 30);
  }
  for (const s of trip.stays || []) {
    add(`${s.id}-in@${trip.id}`, s.checkIn, null, '체크인 · ' + s.name, plain(s.notes, secrets), 30, s.address || s.name);
    add(`${s.id}-out@${trip.id}`, s.checkOut, null, '체크아웃 · ' + s.name, '', 30, s.address || s.name);
  }
  if (opts.items !== false) {
    for (const d of trip.days || []) {
      const p = activePlan(d); if (!p) continue;
      for (const it of p.items || []) {
        if (!RE_TIME.test(it.time || '') || it.kind === 'move') continue;
        const end = RE_TIME.test(it.end || '') ? d.date + 'T' + it.end : null;
        const alarm = it.badges && it.badges.includes('reserve') ? 30 : (opts.alarmAll ? 15 : null);
        add(`${it.id}@${trip.id}`, d.date + 'T' + it.time, end, it.title, plain(it.note, secrets), alarm);
      }
    }
  }
  /* 준비 마감·예약 오픈: 그날 09:00에 알림 (하루만 내보낼 때는 넣지 않음) */
  if (opts.prep !== false && !only) {
    for (const c of trip.checklists || []) for (const it of c.items || []) {
      if (it.done || !/^\d{4}-\d{2}-\d{2}$/.test(it.due || '')) continue;
      add(`chk-${it.id}@${trip.id}`, it.due + 'T09:00', it.due + 'T09:15', '☑ ' + plain(it.text, secrets), c.title, 1);
    }
    const listed = new Set();
    (trip.checklists || []).forEach((c) => (c.items || []).forEach((i) => { if (i.fromReminder) listed.add(i.fromReminder); }));
    for (const r of reserveReminders(trip, opts.datasets || {})) {
      if (listed.has(r.key)) continue;
      const at = r.at || r.due + 'T09:00';
      add(`rsv-${r.placeId}-${r.visit}@${trip.id}`, at, null, '📅 ' + r.text, r.cond, 1);
    }
  }
  const stamp = utc(Date.now());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//travel-app//KO', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:' + escTxt(trip.meta.title)];
  for (const e of ev) {
    lines.push('BEGIN:VEVENT', 'UID:' + e.uid, 'DTSTAMP:' + stamp, 'DTSTART:' + utc(e.s), 'DTEND:' + utc(e.e),
      'SUMMARY:' + escTxt(e.title));
    if (e.desc) lines.push('DESCRIPTION:' + escTxt(e.desc));
    if (e.loc) lines.push('LOCATION:' + escTxt(e.loc));
    if (e.alarmMin) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escTxt(e.title), e.alarmMin === 1 ? 'TRIGGER:PT0M' : `TRIGGER:-PT${e.alarmMin}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return { text: lines.map(fold).join('\r\n') + '\r\n', count: ev.length };
}
