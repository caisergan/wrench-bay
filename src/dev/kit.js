// Dev tool: small UI kit in the game's look (cream cards, navy outlines, chunky buttons with a bottom shadow).
// Every control reads its value through get() and is re-synced by syncAll() (game events, a timer while open), so
// the panel always shows the live save, whatever changed it.
import { ICON } from '../ui/icons.js';
import { fmt, html } from '../ui/format.js';

const N = '#2f4858';
const S = (body) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
/** Icons the game's set does not have (same 24px, navy-outline style). */
export const DICON = {
  eye: S(`<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="#fff6e6" stroke="${N}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.6" fill="#2a9d8f" stroke="${N}" stroke-width="1.6"/><circle cx="13.2" cy="10.8" r="1.1" fill="#fff6e6"/>`),
  disk: S(`<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h11L20 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" fill="#5aa9e6" stroke="${N}" stroke-width="1.8" stroke-linejoin="round"/><rect x="7.5" y="4" width="8" height="5" rx="1" fill="#fff6e6" stroke="${N}" stroke-width="1.5"/><rect x="7" y="12.8" width="10" height="7.2" rx="1.2" fill="#fff6e6" stroke="${N}" stroke-width="1.5"/><path d="M9 15.3h6M9 17.6h4" stroke="${N}" stroke-width="1.3" stroke-linecap="round"/>`),
  camera: S(`<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h3l1.6-2.2h5.8L16.5 7h3A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" fill="#c9d3d8" stroke="${N}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.8" fill="#5aa9e6" stroke="${N}" stroke-width="1.6"/><circle cx="13.1" cy="11.9" r="1" fill="#fff6e6"/>`),
  reset: S(`<path d="M5.5 12a6.5 6.5 0 1 0 2-4.7" fill="none" stroke="${N}" stroke-width="2.6" stroke-linecap="round"/><path d="M5 3.8v4.6h4.6" fill="none" stroke="${N}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  chevron: S(`<path d="M6 14.5 12 8.5l6 6" fill="none" stroke="${N}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  pin: S(`<path d="M12 21.5s6.5-6.2 6.5-11.3a6.5 6.5 0 0 0-13 0C5.5 15.3 12 21.5 12 21.5z" fill="#f26b5b" stroke="${N}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4" fill="#fff6e6"/>`),
  search: S(`<circle cx="10.5" cy="10.5" r="6" fill="#fff6e6" stroke="${N}" stroke-width="2.4"/><path d="M15 15l5.5 5.5" stroke="${N}" stroke-width="3" stroke-linecap="round"/>`),
};
export const icon = (k) => ICON[k] || DICON[k] || '';

// ---------------------------------------------------------------- live sync
let live = [];
/** Register fn() to keep a control in step with the game; runs once now. */
export function track(fn) { live.push(fn); fn(); return fn; }
export function syncAll() { for (const fn of live) { try { fn(); } catch (err) { console.warn('[dev] sync', err); } } }
export function clearLive() { live = []; }

// ---------------------------------------------------------------- numbers
/** '1.5k' -> 1500, '$2,000' -> 2000, '3m' -> 3e6, '2b' -> 2e9, '-4' -> -4. NaN when unreadable. */
export function parseAmount(s) {
  const m = String(s).trim().toLowerCase().replace(/[$,_\s]/g, '').match(/^(-?\d*\.?\d+(?:e[+-]?\d+)?)([kmbt]?)$/);
  if (!m) return NaN;
  return parseFloat(m[1]) * ({ '': 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 })[m[2]];
}
/** Exact number for an input field: 1234567 -> '1234567', 0.15 -> '0.15'. */
export const plain = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(4)));
export { fmt };

// ---------------------------------------------------------------- building blocks
/** A card: { el, body, right } (right = header slot on the right). */
export function card(title, iconKey, sub = '') {
  const el = html(`<section class="dv-card"><header><span class="dv-ci">${icon(iconKey)}</span><div class="dv-ct"><h3></h3>${sub ? '<small></small>' : ''}</div><span class="dv-cr"></span></header><div class="dv-cb"></div></section>`);
  el.querySelector('h3').textContent = title;
  if (sub) el.querySelector('header small').textContent = sub;
  return { el, body: el.querySelector('.dv-cb'), right: el.querySelector('.dv-cr') };
}
/** A row: label + optional sub text on the left, controls on the right. sub may be a fn (tracked). */
export function row(label, sub, ...controls) {
  const el = html('<div class="dv-row"><div class="dv-rl"><b></b><small></small></div><div class="dv-rc"></div></div>');
  const lb = el.querySelector('b'), sm = el.querySelector('small');
  if (typeof label === 'string' && label.startsWith('<')) lb.innerHTML = label; else lb.textContent = label;
  if (typeof sub === 'function') track(() => { const t = sub(); if (sm.textContent !== t) sm.textContent = t; });
  else if (sub) sm.textContent = sub;
  else sm.remove();
  el.querySelector('.dv-rc').append(...controls.filter(Boolean));
  return el;
}
/** Leading icon for a row label. */
export const withIcon = (k, text) => `<span class="dv-ri">${icon(k)}</span><span class="dv-rt">${text}</span>`;

export function btn(label, onClick, cls = '') {
  const b = html(`<button class="dv-btn pressable ${cls}" data-ui></button>`);
  if (label.startsWith('<')) b.innerHTML = label; else b.textContent = label;
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(b); });
  return b;
}
/** Two-tap button for anything destructive: the first tap arms it for 3 s. */
export function confirmBtn(label, onConfirm, cls = 'coral') {
  let armed = 0;
  const b = btn(label, () => {
    if (armed) { clearTimeout(armed); armed = 0; b.classList.remove('armed'); b.innerHTML = label; onConfirm(b); return; }
    b.classList.add('armed');
    b.textContent = 'Tap again';
    armed = setTimeout(() => { armed = 0; b.classList.remove('armed'); b.innerHTML = label; }, 3000);
  }, cls);
  return b;
}
export function chips(list) {
  const el = html('<div class="dv-chips"></div>');
  for (const c of list) {
    const b = html(`<button class="dv-chip pressable" data-ui></button>`);
    b.innerHTML = c.icon ? `${icon(c.icon)}<span></span>` : '<span></span>';
    b.querySelector('span').textContent = c.label;
    if (c.title) b.title = c.title;
    b.addEventListener('click', (e) => { e.stopPropagation(); c.onClick(b); });
    if (c.on) track(() => b.classList.toggle('on', !!c.on()));
    if (c.disabled) track(() => { b.disabled = !!c.disabled(); });
    el.appendChild(b);
  }
  return el;
}
/** Single choice: options [{ value, label }]. */
export function seg(options, get, set) {
  const el = html('<div class="dv-seg"></div>');
  for (const o of options) {
    const b = html(`<button class="pressable" data-ui></button>`);
    b.textContent = o.label;
    b.addEventListener('click', (e) => { e.stopPropagation(); set(o.value); syncAll(); });
    track(() => b.classList.toggle('on', get() === o.value));
    el.appendChild(b);
  }
  return el;
}
export function toggle(get, set, label = 'Toggle') {
  const b = html(`<button class="dv-tog" role="switch" data-ui><i></i></button>`);
  b.setAttribute('aria-label', label);
  b.addEventListener('click', (e) => { e.stopPropagation(); set(!get()); syncAll(); });
  track(() => { const on = !!get(); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  return b;
}
/** [-] value [+]. opts: { min, max, step, fmt(v), big } */
export function stepper(get, set, { min = 0, max = Infinity, step = 1, fmt: f = String } = {}) {
  const el = html(`<div class="dv-step"><button class="pressable" data-ui aria-label="Less">&minus;</button><b></b><button class="pressable" data-ui aria-label="More">+</button></div>`);
  const [minus, plus] = el.querySelectorAll('button'), val = el.querySelector('b');
  const go = (d) => { const v = Math.max(min, Math.min(max, +(get() + d * step).toFixed(4))); if (v !== get()) set(v); syncAll(); };
  minus.addEventListener('click', (e) => { e.stopPropagation(); go(-1); });
  plus.addEventListener('click', (e) => { e.stopPropagation(); go(1); });
  track(() => { const v = get(); val.textContent = f(v); minus.disabled = v <= min; plus.disabled = v >= max; });
  return el;
}
/** Level pips like the upgrades sheet. */
export function pips(get, max) {
  const el = html('<span class="pips dv-pips"></span>');
  const n = Math.min(max, 12);
  for (let i = 0; i < n; i++) el.appendChild(document.createElement('i'));
  track(() => { const v = get(); [...el.children].forEach((p, i) => p.classList.toggle('on', i < Math.round((v / max) * n))); });
  return el;
}
/** Number field (accepts 1.5k / 2m). Commits on Enter / blur. opts: { int, min, max, width } */
export function numInput(get, set, { int = false, min = -Infinity, max = Infinity, width = 0 } = {}) {
  const el = html('<input class="dv-in" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" spellcheck="false" data-ui>');
  if (width) el.style.width = width + 'px';
  const commit = () => {
    let v = parseAmount(el.value);
    if (!Number.isFinite(v)) { el.classList.add('bad'); setTimeout(() => el.classList.remove('bad'), 600); el.value = plain(get()); return; }
    if (int) v = Math.round(v);
    v = Math.max(min, Math.min(max, v));
    if (v !== get()) set(v);
    el.value = plain(get());
    syncAll();
  };
  el.addEventListener('change', commit);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { el.blur(); } });
  track(() => { if (document.activeElement !== el) el.value = plain(get()); });
  return el;
}
/** Read-only live text (span). */
export function text(fn, cls = 'dv-val') {
  const el = html(`<span class="${cls}"></span>`);
  track(() => { const t = fn(); if (el.textContent !== t) el.textContent = t; });
  return el;
}
export function note(t, cls = '') {
  const el = html(`<p class="dv-note ${cls}"></p>`);
  el.textContent = t;
  return el;
}
