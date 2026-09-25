// Small DOM helpers shared by every view. User-provided text always goes through text nodes.

const SVG_NS = 'http://www.w3.org/2000/svg';

function apply(el, attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v; // only ever used with trusted, static markup
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Create an HTML element: h('div', { class: 'x', onClick }, 'text', child) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  apply(el, attrs);
  append(el, children);
  return el;
}

/** Create an SVG element. */
export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  apply(el, attrs);
  append(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

/** Replace an element's children, skipping null/false like h() does. */
export function fill(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export function toast(message, type = 'info', ms = 3200) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : 'status' }, message);
  box.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/** Modal dialog. Resolves with the value of the clicked action (or null when dismissed). */
export function modal({ title, body, actions = [{ label: 'OK', value: true, primary: true }], dismissable = true, className = '' }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const close = (value) => {
      overlay.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => overlay.remove(), 180);
      if (prev && prev.focus) prev.focus();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissable) close(null);
    };
    const buttons = actions.map((a) =>
      h('button', { class: ['btn', a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-ghost'], type: 'button', onClick: () => close(a.value) }, a.label),
    );
    const dialog = h(
      'div',
      { class: ['modal', className], role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
      title ? h('h2', { class: 'modal-title' }, title) : null,
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-actions' }, buttons) : null,
    );
    const overlay = h('div', { class: 'overlay', onClick: (e) => e.target === overlay && dismissable && close(null) }, dialog);
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => {
      overlay.classList.add('show');
      const focusable = dialog.querySelector('input, select, textarea') || buttons.find((b) => b.classList.contains('btn-primary')) || buttons[0];
      focusable?.focus();
    });
    dialog.closeWith = close;
  });
}

/** Copy text to the clipboard. Works on plain-http LAN addresses where navigator.clipboard is unavailable. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  const ta = h('textarea', { style: { position: 'fixed', top: '-1000px', opacity: '0' } }, text);
  document.body.append(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export function fmtClock(ms) {
  ms = Math.max(0, ms);
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  if (ms < 10000) return `${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function initials(name) {
  const words = String(name || '?')
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (!words.length) return '?';
  return (words[0][0] + (words[1]?.[0] || '')).toUpperCase();
}

const ROBOT =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v3M7 7h10a3 3 0 013 3v7a3 3 0 01-3 3H7a3 3 0 01-3-3v-7a3 3 0 013-3zM9 13h.01M15 13h.01M9.5 16.5h5"/></svg>';

export function avatar(name, color, extra = '', bot = false) {
  const el = h('span', { class: `avatar ${extra}`, style: { background: color || '#64748b' }, 'aria-hidden': 'true' });
  if (bot) el.innerHTML = ROBOT;
  else el.textContent = initials(name);
  return el;
}

export function plural(n, word, pluralWord = word + 's') {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

export function onVisible(fn) {
  const handler = () => document.visibilityState === 'visible' && fn();
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
