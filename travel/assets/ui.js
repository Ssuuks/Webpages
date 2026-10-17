/* 화면 부품 — 시트, 확인창, 배지, 입력칸 */
import { h, clear, rich, safeUrl, telHref } from './util.js';

/* ── 아래에서 올라오는 시트 ─────────────────────────── */
let sheetStack = [];
export function openSheet(title, body, opts = {}) {
  const prevFocus = document.activeElement;
  const close = () => {
    wrap.dataset.on = '0';
    document.removeEventListener('keydown', onKey);
    sheetStack = sheetStack.filter((s) => s !== api);
    setTimeout(() => wrap.remove(), 220);
    if (!sheetStack.length) document.body.classList.remove('sheet-open');
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (opts.onClose) opts.onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape' && sheetStack[sheetStack.length - 1] === api) close(); };
  const head = h('div.sheet-head',
    h('h2', { id: 'sh-' + sheetStack.length }, title),
    h('button.icon-btn', { type: 'button', 'aria-label': '닫기', onclick: close }, '✕'));
  const panel = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sh-' + sheetStack.length },
    h('div.sheet-grip', { 'aria-hidden': 'true' }), head, h('div.sheet-body', body));
  if (opts.accent) panel.style.setProperty('--accent', opts.accent);
  const wrap = h('div.sheet-wrap', { dataset: { on: '0' } }, h('div.sheet-bg', { onclick: close }), panel);
  document.body.appendChild(wrap);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => { wrap.dataset.on = '1'; const f = panel.querySelector('input,textarea,select,button:not(.icon-btn)'); (opts.focus === false ? head.querySelector('button') : (f || head.querySelector('button'))).focus({ preventScroll: true }); });
  document.addEventListener('keydown', onKey);
  const api = { close, panel, setBody(node) { const b = panel.querySelector('.sheet-body'); clear(b); b.appendChild(node); } };
  sheetStack.push(api);
  return api;
}
export function closeAllSheets() { [...sheetStack].reverse().forEach((s) => s.close()); }

/* 확인창 (confirm 대신) → Promise<boolean|string> */
export function ask(message, buttons = [{ label: '취소', value: false }, { label: '확인', value: true, primary: true }], title = '확인') {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet(title, h('div',
      h('p.ask-msg', ...rich(message)),
      h('div.btnrow', buttons.map((b) => h('button.btn' + (b.primary ? '.primary' : '') + (b.danger ? '.danger' : ''),
        { type: 'button', onclick: () => { done = true; s.close(); resolve(b.value); } }, b.label)))),
    { onClose: () => { if (!done) resolve(false); } });
  });
}

/* ── 배지 ──────────────────────────────────────────── */
export function badge(dict, id) {
  const b = dict[id] || { label: id, tone: 'muted' };
  return h('span.badge', { dataset: { tone: b.tone || 'muted' } }, b.label);
}
export function badges(dict, ids) { return (ids || []).map((id) => badge(dict, id)); }
export function pill(text, tone = 'muted', title) { return h('span.badge', { dataset: { tone }, title }, text); }

/* ── 버튼·링크 ─────────────────────────────────────── */
export function btn(label, onclick, cls = '', attrs = {}) {
  return h('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), { type: 'button', onclick, ...attrs }, label);
}
export function linkBtn(label, href, cls = '') {
  const safe = safeUrl(href);
  if (!safe) return null;
  const ext = /^https?:/.test(safe);
  return h('a.btn' + (cls ? '.' + cls : ''), { href: safe, target: ext ? '_blank' : null, rel: ext ? 'noopener noreferrer' : null }, label);
}
export function telLink(phone, label) {
  const href = telHref(phone);
  return href ? h('a.tel', { href }, label || phone) : (label || phone || '');
}

/* ── 입력칸 ────────────────────────────────────────── */
export function field(label, input, hint) {
  const id = input.id || ('f' + Math.random().toString(36).slice(2, 8));
  input.id = id;
  return h('div.field', h('label', { for: id }, label), input, hint ? h('div.hint', hint) : null);
}
export function input(value, attrs = {}) {
  const el = h('input', { type: 'text', autocomplete: 'off', ...attrs });
  el.value = value == null ? '' : String(value);
  return el;
}
export function textarea(value, attrs = {}) {
  const el = h('textarea', { rows: 3, ...attrs });
  el.value = value == null ? '' : String(value);
  return el;
}
export function select(options, value, attrs = {}) {
  const el = h('select', attrs, options.map((o) => {
    const opt = h('option', { value: o.value }, o.label);
    if (String(o.value) === String(value ?? '')) opt.selected = true;
    return opt;
  }));
  return el;
}
export function checkbox(checked, label, onchange, attrs = {}) {
  const c = h('input', { type: 'checkbox', ...attrs });
  c.checked = !!checked;
  if (onchange) c.addEventListener('change', () => onchange(c.checked));
  return h('label.check', c, h('span', label));
}

/* 섹션 */
export function section(title, ...kids) {
  return h('section.card', title ? h('h3.card-title', title) : null, ...kids);
}
export function empty(text, ...kids) { return h('div.empty', h('p', text), ...kids); }

/* 한 줄 입력창 (prompt 대신) → Promise<string|null> */
export function askText(title, label, value = '', hint) {
  return new Promise((resolve) => {
    let done = false;
    const inp = input(value);
    const ok = () => { const v = inp.value.trim(); if (!v) return; done = true; s.close(); resolve(v); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    const s = openSheet(title, h('div', field(label, inp, hint), h('div.btnrow', btn('확인', ok, 'primary'))),
      { onClose: () => { if (!done) resolve(null); } });
    setTimeout(() => inp.select(), 50);
  });
}
