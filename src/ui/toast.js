import { html } from './format.js';

let wrap = null;
const queue = [];
let busy = false;

export function toast(text) {
  if (!wrap) {
    wrap = html('<div class="toast-wrap"></div>');
    document.getElementById('ui').appendChild(wrap);
  }
  queue.push(String(text));
  if (!busy) next();
}

function next() {
  const text = queue.shift();
  if (text === undefined) { busy = false; return; }
  busy = true;
  const el = html('<div class="toast"></div>');
  el.textContent = text;
  wrap.appendChild(el);
  const hold = queue.length ? 0.9 : 1.4;     // be quicker when several are queued
  const pop = 0.38, out = 0.3, total = pop + hold + out;
  const a = el.animate([
    { opacity: 0, transform: 'translateY(-14px) scale(.55)', offset: 0 },
    { opacity: 1, transform: 'translateY(0) scale(1.12)', offset: (pop * 0.6) / total, easing: 'ease-out' },
    { opacity: 1, transform: 'translateY(0) scale(1)', offset: pop / total },
    { opacity: 1, transform: 'translateY(0) scale(1)', offset: (pop + hold) / total },
    { opacity: 0, transform: 'translateY(-12px) scale(.94)', offset: 1 },
  ], { duration: total * 1000, easing: 'ease-in-out', fill: 'both' });
  a.onfinish = () => { el.remove(); next(); };
}
