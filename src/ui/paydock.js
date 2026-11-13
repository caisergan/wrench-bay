// Pay dock. While the player stands on a pay pad (a property / district pad, or an unlock-chain pad in a workshop), its
// details sit at the bottom of the screen instead of on a card over the building: name, level dots, what you get, a
// "before -> after" row, a price bar that fills as the cash drains in, and the fame it needs (or, locked, how far you
// are). Display only (pointer-events: none): paying is still "stand on the pad", and a drag anywhere still walks you
// off. One pad owns the dock at a time (its id).
//
// info = { kind: 'buy' | 'up' | 'lock', icon (ICON key), name, rib, title?, what, levels, owned, price, fame, fameOk,
//          lockText?, lockLeft?, lockP? (0..1), doneText?,
//          pic? (the icon is a picture of the thing: cream tile), iconColor? (var(--c) of the icon),
//          change?: [{ icon?, color?, label, from?, to }] (chips: "Colours 3 -> 4", "Stripe jobs pay x1.5") }
import { ICON } from './icons.js';
import { html, fmt } from './format.js';

let el = null, R = null, owner = null, info = null, hideTimer = 0, last = '';

function ensure() {
  if (el) return;
  el = html(`<div class="paydock out" aria-hidden="true">
    <span class="dk-rib"></span><span class="dk-hint"></span>
    <div class="dk-top"><div class="dk-ic"><span class="dk-icon"></span><span class="dk-lockb">${ICON.lock}</span></div>
      <div class="dk-txt"><div class="dk-name"><b></b><span class="dk-pips"></span></div><div class="dk-what"></div></div></div>
    <div class="dk-chg"></div>
    <div class="dk-pay"><div class="dk-bar"><i></i><span><span class="dk-bi"></span><b class="dk-amt"></b><em class="dk-em"></em></span></div>
      <span class="dk-req"><span class="dk-star">${ICON.star}<em></em></span><b>${ICON.check}</b></span>
      <span class="dk-price">${ICON.cash}<b></b></span></div>
    <div class="dk-note"></div></div>`);
  document.getElementById('ui').appendChild(el);
  const q = (s) => el.querySelector(s);
  R = {
    rib: q('.dk-rib'), hint: q('.dk-hint'), icon: q('.dk-icon'), name: q('.dk-name b'), pips: q('.dk-pips'), what: q('.dk-what'),
    fill: q('.dk-bar > i'), bi: q('.dk-bi'), amt: q('.dk-amt'), em: q('.dk-em'), req: q('.dk-req'), reqN: q('.dk-star em'),
    price: q('.dk-price'), priceN: q('.dk-price b'), note: q('.dk-note'), chg: q('.dk-chg'),
  };
}

/** One "before -> after" chip: [icon] Colours 3 -> 4 (no `from`: just the new value, e.g. "x1.5"). */
function chip(c) {
  const el = document.createElement('span');
  el.className = 'chg';
  if (c.icon && ICON[c.icon]) {
    const ic = document.createElement('span');
    ic.className = 'chg-i';
    ic.innerHTML = ICON[c.icon];
    if (c.color) ic.style.setProperty('--c', c.color);
    el.append(ic);
  }
  el.append(document.createTextNode(c.label + ' '));
  if (c.from != null) {
    const f = document.createElement('s'); f.textContent = String(c.from);
    const a = document.createElement('i'); a.textContent = '→';
    el.append(f, a);
  }
  const t = document.createElement('b'); t.textContent = String(c.to);
  el.append(t);
  return el;
}

const text = (node, s) => { s = s == null ? '' : String(s); if (node.textContent !== s) node.textContent = s; };
const fill = (p) => { R.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, p || 0))})`; };

function paint(i) {
  el.dataset.k = i.kind;
  el.classList.toggle('pic', !!i.pic);
  text(R.rib, i.rib);
  R.icon.innerHTML = ICON[i.icon] || ICON.tag;
  if (i.iconColor) R.icon.style.setProperty('--c', i.iconColor); else R.icon.style.removeProperty('--c');
  R.chg.replaceChildren(...(i.change || []).map(chip));
  R.chg.hidden = !i.change?.length;
  text(R.name, i.name);
  const n = i.levels | 0;
  R.pips.innerHTML = n > 1 ? Array.from({ length: n }, (_, k) => `<i class="${k < i.owned ? 'on' : k === i.owned ? 'next' : ''}"></i>`).join('') : '';
  R.what.replaceChildren();
  if (i.title) { const b = document.createElement('b'); b.textContent = i.title + ': '; R.what.append(b); }
  R.what.append(document.createTextNode(i.what || ''));
  const locked = i.kind === 'lock';
  R.bi.innerHTML = locked ? ICON.star : ICON.cash;
  R.req.hidden = locked || !i.fame;
  R.req.classList.toggle('no', !i.fameOk);
  text(R.reqN, i.fame || '');
  R.price.hidden = !locked;
  text(R.priceN, '$' + fmt(i.price || 0));
  if (locked) { text(R.amt, i.lockText || ''); text(R.em, i.lockLeft || ''); fill(i.lockP); }
  text(R.note, ''); R.note.hidden = true;
}

export const payDock = {
  /** The pad `id` takes the dock and slides it in. */
  show(id, i) {
    ensure();
    if (!i) return;
    clearTimeout(hideTimer);
    owner = id; info = i; last = '';
    el.classList.remove('done', 'nudge');
    paint(i);
    el.classList.remove('out');
    el.classList.add('in');
  },
  /** Live state from the pad: { price, remaining, paying, broke }. Locked docks ignore it (the fame bar stays). */
  update(id, s) {
    if (!el || id !== owner || !info || info.kind === 'lock' || el.classList.contains('done')) return;
    const key = `${s.remaining}|${s.price}|${!!s.paying}|${!!s.broke}`;
    if (key === last) return;
    last = key;
    const paid = Math.max(0, s.price - s.remaining);
    fill(s.price > 0 ? paid / s.price : 0);
    text(R.amt, '$' + fmt(s.remaining));
    text(R.em, paid > 0 ? 'left' : '');
    text(R.hint, s.broke ? 'Out of cash' : s.paying ? 'Paying…' : 'Stand to pay');
    const note = s.broke && paid > 0 ? `The $${fmt(paid)} you paid stays on this pad.` : s.broke ? 'Earn some cash and come back.' : '';
    text(R.note, note); R.note.hidden = !note;
  },
  /** Locked pad buzzed: a short shake. */
  nudge(id) {
    if (!el || id !== owner) return;
    el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge');
  },
  /** Paid: green "Bought!" for a moment, then away. */
  done(id, doneText) {
    if (!el || id !== owner) return;
    el.dataset.k = 'done';
    el.classList.add('done');
    text(R.rib, 'BOUGHT!'); text(R.hint, '');
    R.bi.innerHTML = ICON.check; text(R.amt, doneText || (info?.name ? info.name + ' is yours' : 'Bought!')); text(R.em, '');
    R.req.hidden = true; R.price.hidden = true; R.note.hidden = true;
    R.pips.querySelector('.next')?.classList.replace('next', 'on');
    fill(1);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => payDock.hide(id), 1150);
  },
  /** Slide away (only if `id` still owns it; no id = always). */
  hide(id) {
    if (!el || (id != null && id !== owner)) return;
    clearTimeout(hideTimer);
    owner = null; info = null;
    el.classList.remove('in');
    el.classList.add('out');
  },
  get shown() { return !!owner; },
  get owner() { return owner; },
};
