// Small DOM helpers: element builder, toasts, modals, context menus.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, type = '') {
  const t = el('div', { class: 'toast ' + type }, msg);
  $('#toasts').append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, type === 'err' ? 5000 : 2600);
}

export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60); if (h < 24) return h + ' h ago';
  const d = Math.floor(h / 24); if (d < 30) return d + ' days ago';
  return new Date(ts).toLocaleDateString();
}

/** Show a modal. body: Node | string; buttons: [{label, class, value}] → resolves value. */
export function modal({ title, body, buttons = [{ label: 'OK', class: 'primary', value: true }], onOpen, wide }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const foot = el('div', { class: 'mfoot' }, buttons.map((b) => el('button', { class: 'btn ' + (b.class || ''), onclick: () => close(typeof b.value === 'function' ? b.value() : b.value) }, b.label)));
    const box = el('div', { class: 'modal', style: wide ? { maxWidth: '760px' } : {} }, el('h3', {}, title), el('div', { class: 'mbody' }, body), foot);
    const back = el('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(null); } }, box);
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { const p = buttons.find((b) => b.class && b.class.includes('primary')); if (p) close(typeof p.value === 'function' ? p.value() : p.value); }
    };
    document.addEventListener('keydown', onKey);
    root.append(back);
    onOpen && onOpen(box);
    const first = box.querySelector('input,textarea,select');
    if (first) setTimeout(() => { first.focus(); first.select && first.select(); }, 30);
  });
}

export async function promptModal(title, label, value = '', placeholder = '') {
  const input = el('input', { value, placeholder });
  const r = await modal({ title, body: el('label', {}, label, input), buttons: [{ label: 'Cancel', value: null }, { label: 'OK', class: 'primary', value: () => input.value }] });
  return r == null ? null : String(r).trim();
}

export function confirmModal(title, text, okLabel = 'Delete', danger = true) {
  return modal({ title, body: el('p', { style: { margin: 0 } }, text), buttons: [{ label: 'Cancel', value: false }, { label: okLabel, class: danger ? 'danger' : 'primary', value: true }] });
}

/** Context menu at (x,y). items: [{label, action} | '-'] */
export function menu(x, y, items) {
  const root = $('#menu-root');
  root.innerHTML = '';
  const m = el('div', { class: 'menu' }, items.map((it) => (it === '-' ? el('hr') : el('button', { onclick: () => { close(); it.action(); } }, it.label))));
  const close = () => { m.remove(); document.removeEventListener('mousedown', out, true); };
  const out = (e) => { if (!m.contains(e.target)) close(); };
  root.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 8)) + 'px';
  setTimeout(() => document.addEventListener('mousedown', out, true), 0);
}

export function download(name, data, type = 'application/octet-stream') {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** gzip+base64url for share links */
export async function compress(str) {
  const cs = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(cs).arrayBuffer());
  let bin = ''; buf.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function decompress(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(ds).text();
}
