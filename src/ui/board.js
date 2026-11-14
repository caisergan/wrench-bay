// Upgrade board sheet (docs/central-upgrades; the game side is game/board.js). Open while the player stands on a
// workshop's board pad. Two tabs:
//   Build  - that workshop's unlock chain: the plan (every entry in buying order: built / for sale / later; tap one for
//            its name and price) and a card per entry for sale (picture, ribbon, what it does, "before -> after").
//   Boosts - the shared UPGRADES, worded for the workshop you are in ("you + painters" in the Spray Bay).
// Buying is a hold: press a coral key and keep it pressed until it fills (HOLD_MS); letting go earlier cancels, a quick
// tap nudges the key. A key you can't pay yet is grey, fills with yellow as your cash gets closer and says what is
// missing. After an unlock the game runs the reveal: this sheet dips ('board:reveal' dip), the camera glides to the
// new thing, then the sheet rises with the next entry sliding in (rise). A tap during the reveal skips it.
import { state, upgradeCost } from '../core/state.js';
import { events } from '../core/events.js';
import { UPGRADES, PLAYER } from '../config.js';
import { ICON } from './icons.js';
import { fmt, html } from './format.js';
import { sfx } from './audio.js';
import { flags, refreshInput } from './uistate.js';

const HOLD_MS = 650;
const BOOST_ICON = { speed: 'speed', capacity: 'capacity', repair: 'wrench', supply: 'crate', price: 'price' };
/** "$1,250" up to 10K, then "$12K" / "$1.5M" (format.js fmt). */
const money = (n) => (n >= 1e4 ? fmt(n) : Math.round(n).toLocaleString('en-US'));
const ico = (key, color) => `<span class="bi"${color ? ` style="--c:${color}"` : ''}>${ICON[key] || ICON.tag}</span>`;
/** What the stamp on a bought card says. */
const doneWord = (rib) => (rib === 'HIRE' ? 'Hired!' : /COLOUR/.test(rib) ? 'In stock!' : rib === 'UPGRADE' ? 'Fitted!' : 'Built!');

/** Effect of a boost at level l, as on the old upgrades sheet but with "base" for level 0. */
function boostFx(k, l, carry) {
  const u = UPGRADES[k];
  if (k === 'capacity') return `${PLAYER.carryBase + l * u.per}${carry ? ' ' + carry : ''}`;
  if (k === 'supply') return l ? `-${Math.round((1 - Math.pow(1 - u.per, l)) * 100)}%` : 'base';
  return l ? `+${Math.round(l * u.per * 100)}%` : 'base';
}

export function buildBoard(root) {
  const el = html(`
    <div class="board" data-ui aria-hidden="true">
      <div class="bd-grab"></div>
      <div class="bd-head">
        <span class="bd-ph">${ICON.arrowUp}</span>
        <div class="bd-ttl"><small>UPGRADES</small><h2></h2></div>
        <span class="bd-cash">${ICON.cash}<b></b></span>
        <button class="bd-x pressable" data-ui aria-label="Close">${ICON.x}</button>
      </div>
      <div class="bd-tabs">
        <button class="bd-tab pressable" data-ui data-t="build"><span class="bt-i"></span><span>Build</span><span class="n"></span></button>
        <button class="bd-tab pressable" data-ui data-t="boost"><span class="bt-i">${ICON.bolt}</span><span>Boosts</span><span class="n"></span></button>
      </div>
      <div class="bd-pane" data-p="build"></div>
      <div class="bd-pane" data-p="boost"></div>
      <div class="bd-fx"></div>
    </div>`);
  root.appendChild(el);
  const q = (s) => el.querySelector(s);
  const R = {
    name: q('.bd-ttl h2'), cash: q('.bd-cash'), cashN: q('.bd-cash b'), x: q('.bd-x'),
    tabB: q('[data-t="build"]'), tabU: q('[data-t="boost"]'), tabBi: q('[data-t="build"] .bt-i'),
    nB: q('[data-t="build"] .n'), nU: q('[data-t="boost"] .n'),
    paneB: q('[data-p="build"]'), paneU: q('[data-p="boost"]'), fx: q('.bd-fx'),
  };

  let api = null, open = false, tab = null, sel = null, keyB = '', keyU = '', hold = null, dipped = false, enterId = null;
  let freeze = false;        // from an unlock purchase until the sheet rises again: the Build pane keeps its stamp

  // ---------------------------------------------------------------- data
  const plan = () => api.plan();
  const levels = () => Object.keys(UPGRADES).map((k) => state.upgrades[k] | 0);
  const counts = (p) => ({
    build: p.filter((e) => e.sale && state.cash >= e.price).length,
    boost: Object.keys(UPGRADES).filter((k) => state.upgrades[k] < UPGRADES[k].max && state.cash >= upgradeCost(k)).length,
  });
  const words = (k) => ({
    speed: 'walk & drive', capacity: '', repair: `you + ${api.staff}`, supply: api.refill, price: `per ${api.job}`,
  })[k];

  // ---------------------------------------------------------------- keys (hold to buy)
  /** Paint a key: s = 'can' | 'cant' | 'max'; the price, and for 'cant' how much is missing + the yellow fill. */
  function paintKey(key, price, maxed) {
    const s = maxed ? 'max' : state.cash >= price ? 'can' : 'cant';
    if (key.dataset.s === 'done') return;
    const sig = s + '|' + price + '|' + (s === 'cant' ? state.cash : '');
    if (key.dataset.sig === sig) return;
    key.dataset.sig = sig;
    if (key.dataset.s !== s) {
      key.dataset.s = s;
      if (s !== 'can' && hold?.key === key) cancelHold();
    }
    const l = key.querySelector('.bk-l'), p = key.querySelector('.bk-p');
    if (s === 'max') { p.textContent = 'MAX'; l.textContent = ''; key.style.removeProperty('--k'); return; }
    p.textContent = '$' + money(price);
    if (s === 'can') { l.textContent = 'HOLD TO BUY'; key.style.removeProperty('--k'); return; }
    l.textContent = '$' + money(price - state.cash) + ' to go';
    key.style.setProperty('--k', Math.max(0, Math.min(1, state.cash / price)).toFixed(3));
  }
  const keyHtml = () => '<button class="bkey" data-ui data-nosfx><i class="bk-fill"></i><span class="bk-p"></span><span class="bk-l"></span></button>';

  function bindKey(key, onDone) {
    key.addEventListener('pointerdown', (e) => {
      if (key.dataset.s === 'cant') { sfx('error'); nudge(key); return; }
      if (key.dataset.s !== 'can' || hold || api?.revealing) return;
      e.preventDefault();
      try { key.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      hold = { key, onDone, t0: performance.now(), tick: 0, raf: 0, rect: key.getBoundingClientRect() };
      key.classList.add('holding');
      holdLoop();
    });
    key.addEventListener('pointermove', (e) => {
      if (hold?.key !== key) return;
      const r = hold.rect, m = 16;            // sliding the finger off the key cancels
      if (e.clientX < r.left - m || e.clientX > r.right + m || e.clientY < r.top - m || e.clientY > r.bottom + m) cancelHold();
    });
    const end = () => { if (hold?.key === key) cancelHold(); };
    key.addEventListener('pointerup', end);
    key.addEventListener('pointercancel', end);
    key.addEventListener('lostpointercapture', end);
  }
  function holdLoop() {
    const h = hold;
    if (!h) return;
    const k = Math.min(1, (performance.now() - h.t0) / HOLD_MS);
    h.key.style.setProperty('--h', k.toFixed(3));
    if (k >= h.tick) { sfx('charge'); h.tick += 0.25; }
    if (k >= 1) {
      hold = null;
      h.key.classList.remove('holding');
      h.onDone(h.key);
      return;
    }
    h.raf = requestAnimationFrame(holdLoop);
  }
  function cancelHold() {
    const h = hold;
    if (!h) return;
    hold = null;
    cancelAnimationFrame(h.raf);
    h.key.classList.remove('holding');
    h.key.style.setProperty('--h', '0');
    if (performance.now() - h.t0 < 200) nudge(h.key);      // a tap: the label says HOLD TO BUY, wiggle it
  }
  function nudge(key) { key.classList.remove('nudge'); void key.offsetWidth; key.classList.add('nudge'); }

  // ---------------------------------------------------------------- Build pane
  function sayLine(p) {
    const e = sel && p.find((x) => x.id === sel);
    if (e) {
      const i = p.indexOf(e);
      if (e.own) return `<b>${e.info.name}</b> · built`;
      if (e.sale) return `<b>${e.info.name}</b> · $${money(e.price)} · for sale now`;
      return `<span class="lk">${ICON.lock}</span><b>${e.info.name}</b> · $${money(e.price)} · after ${p[i - 1].info.name}`;
    }
    const own = p.filter((x) => x.own).length, next = p.find((x) => !x.own && !x.sale);
    return `<b>${own} of ${p.length}</b> built` + (next ? ` · then <b>${next.info.name}</b> $${money(next.price)}` : own < p.length ? ' · the last ones' : '');
  }
  function buildPane(p) {
    const own = p.filter((x) => x.own).length;
    const tiles = p.map((e) => `<span class="pl-t ${e.own ? 'own' : e.sale ? 'next' : ''}${sel === e.id ? ' sel' : ''}" data-ui data-id="${e.id}">${ico(e.info.icon, e.info.color)}</span>`).join('');
    const fill = own ? `calc(${(own - 0.5) / Math.max(1, p.length - 1)} * (100% - 22px))` : '0px';
    const cards = p.filter((e) => e.sale).map((e) => {
      const chips = (e.info.change || []).map((c) => `<span class="chg">${c.icon ? ico(c.icon, c.color) : ''}${c.label} ${c.from != null ? `<s>${c.from}</s><i>→</i>` : ''}<b>${c.to}</b></span>`).join('');
      return `<div class="bc${enterId === e.id ? ' enter' : ''}" data-k="${e.info.kind}" data-id="${e.id}" data-done="${doneWord(e.info.rib)}">
        <span class="bc-pic">${ico(e.info.icon, e.info.color)}</span>
        <div class="bc-mid"><div class="bc-top"><span class="bc-name">${e.info.name}</span><span class="bc-rib">${e.info.rib}</span></div>
          <div class="bc-what">${e.info.what}</div></div>
        <div class="bc-row"><span class="chgs">${chips}</span>${keyHtml()}</div></div>`;
    }).join('');
    R.paneB.innerHTML = `<div class="plan"><div class="plan-road"><i class="fill" style="width:${fill}"></i>${tiles}</div><div class="plan-say"></div></div>`
      + (cards || `<div class="bd-done">${ICON.starGold}<span>Everything in the ${api.name} is built.</span></div>`);
    enterId = null;
    R.paneB.querySelectorAll('.pl-t').forEach((t) => t.addEventListener('click', () => {
      sel = sel === t.dataset.id ? null : t.dataset.id;
      R.paneB.querySelectorAll('.pl-t').forEach((x) => x.classList.toggle('sel', x.dataset.id === sel));
      R.paneB.querySelector('.plan-say').innerHTML = sayLine(plan());
    }));
    R.paneB.querySelectorAll('.bc .bkey').forEach((k) => bindKey(k, buyBuild));
  }
  function refreshBuild(p) {
    R.paneB.querySelector('.plan-say').innerHTML = sayLine(p);
    for (const card of R.paneB.querySelectorAll('.bc')) {
      const e = p.find((x) => x.id === card.dataset.id);
      if (!e) continue;
      card.classList.toggle('can', state.cash >= e.price && card.querySelector('.bkey').dataset.s !== 'done');
      paintKey(card.querySelector('.bkey'), e.price, false);
    }
  }

  // ---------------------------------------------------------------- Boosts pane
  function boostPane() {
    R.paneU.innerHTML = Object.keys(UPGRADES).map((k) => {
      const u = UPGRADES[k], l = state.upgrades[k] | 0, maxed = l >= u.max, sub = words(k) ? ` · ${words(k)}` : '';
      const fx = maxed ? `<b>${boostFx(k, l, api.carry)}</b>${sub}` : `<s>${boostFx(k, l, '')}</s> → <b>${boostFx(k, l + 1, api.carry)}</b>${sub}`;
      return `<div class="bst${maxed ? ' maxed' : ''}" data-k="${k}"><span class="bst-ic">${ICON[BOOST_ICON[k]] || ICON.star}</span>
        <div class="bst-mid"><div class="bst-top"><span class="bst-name">${u.label}</span><span class="bst-lv">Lv ${l}</span></div>
          <div class="bst-bar">${Array.from({ length: u.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>
          <div class="bst-fx">${fx}</div></div>${keyHtml()}</div>`;
    }).join('') + `<div class="bd-note">${ICON.star}<span>Boosts are yours: a level counts in every workshop</span></div>`;
    R.paneU.querySelectorAll('.bst .bkey').forEach((k) => bindKey(k, buyBoost));
  }
  function refreshBoost() {
    for (const row of R.paneU.querySelectorAll('.bst')) {
      const k = row.dataset.k, l = state.upgrades[k] | 0, maxed = l >= UPGRADES[k].max, cost = upgradeCost(k);
      paintKey(row.querySelector('.bkey'), cost, maxed);
      const nx = row.querySelectorAll('.bst-bar i')[l];
      row.querySelectorAll('.bst-bar i.next').forEach((i) => { if (i !== nx) i.classList.remove('next'); });
      if (nx) nx.classList.toggle('next', !maxed && state.cash >= cost);
    }
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (!api) return;
    const p = plan(), n = counts(p);
    if (!tab) tab = n.build || !n.boost ? 'build' : 'boost';
    R.tabB.classList.toggle('on', tab === 'build'); R.tabU.classList.toggle('on', tab === 'boost');
    R.paneB.hidden = tab !== 'build'; R.paneU.hidden = tab !== 'boost';
    R.nB.textContent = n.build || ''; R.nU.textContent = n.boost || '';
    R.cashN.textContent = '$' + money(state.cash);
    const kb = api.id + '|' + p.map((e) => (e.own ? 'o' : e.sale ? 's' : '-')).join('');
    if (!freeze && kb !== keyB) { keyB = kb; buildPane(p); }
    const ku = api.id + '|' + levels().join(',');
    if (ku !== keyU) { keyU = ku; boostPane(); }
    if (!freeze) refreshBuild(p);
    refreshBoost();
  }
  let rq = 0;
  const kick = () => { if (open && !rq) rq = requestAnimationFrame(() => { rq = 0; render(); }); };
  ['cash:changed', 'upgrades:changed', 'board:changed', 'unlock', 'townunlock', 'shop:changed'].forEach((e) => events.on(e, kick));

  R.tabB.addEventListener('click', () => { tab = 'build'; render(); });
  R.tabU.addEventListener('click', () => { tab = 'boost'; render(); });
  R.x.addEventListener('click', () => { if (api) events.emit('board:dismiss', { id: api.id }); });

  // ---------------------------------------------------------------- buying + feedback
  function buyBuild(key) {
    const card = key.closest('.bc'), id = card.dataset.id;
    if (!api || !api.buy(id)) { sfx('error'); nudge(key); return; }
    freeze = true;
    key.dataset.s = 'done';
    key.innerHTML = `<span class="bk-ok">${ICON.check}</span>`;
    card.classList.remove('can');
    card.classList.add('stamp');
    burst(key, 18);
    sfx('cash');
    tickCash();
    const tile = R.paneB.querySelector(`.pl-t[data-id="${id}"]`);
    if (tile) { tile.className = 'pl-t own pop'; }
    // which entry comes on sale next (it slides in when the sheet rises)
    const p = plan(), next = p.filter((e) => e.sale).map((e) => e.id);
    const before = [...R.paneB.querySelectorAll('.bc')].map((c) => c.dataset.id);
    enterId = next.find((x) => !before.includes(x)) || null;
  }
  function buyBoost(key) {
    const row = key.closest('.bst'), k = row.dataset.k;
    if (!api || !api.boost(k)) { sfx('error'); nudge(key); return; }
    sfx('upgrade');
    burst(key, 12);
    tickCash();
    render();                                 // levels changed: the pane is rebuilt
    const nr = R.paneU.querySelector(`.bst[data-k="${k}"]`);
    if (!nr) return;
    const l = state.upgrades[k] | 0;
    nr.classList.add('flash');
    nr.querySelectorAll('.bst-bar i')[l - 1]?.classList.add('pop');
    nr.querySelector('.bst-lv').classList.add('bump');
    const pop = html(`<span class="bd-pop">Lv ${l}!</span>`);
    const kr = nr.querySelector('.bkey').getBoundingClientRect(), br = el.getBoundingClientRect();
    pop.style.left = (kr.left + kr.width / 2 - br.left) + 'px';
    pop.style.top = (kr.top - br.top) + 'px';
    R.fx.appendChild(pop);
    setTimeout(() => pop.remove(), 1000);
  }
  function tickCash() { R.cash.classList.remove('tick'); void R.cash.offsetWidth; R.cash.classList.add('tick'); }
  /** Confetti bits flying out of a key (drawn in the sheet's fx layer, never clipped by a pane). */
  function burst(key, n) {
    const kr = key.getBoundingClientRect(), br = el.getBoundingClientRect();
    const cx = kr.left + kr.width / 2 - br.left, cy = kr.top + kr.height / 2 - br.top;
    const cols = ['#f6c453', '#f26b5b', '#2a9d8f', '#7fd6c9', '#fff6e6'];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = 38 + Math.random() * 46;
      const b = document.createElement('i');
      b.style.cssText = `left:${cx}px;top:${cy}px;background:${cols[i % cols.length]};--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d - 18).toFixed(1)}px;--r:${Math.round(Math.random() * 540 - 270)}deg`;
      R.fx.appendChild(b);
      setTimeout(() => b.remove(), 800);
    }
  }

  // ---------------------------------------------------------------- open / close / reveal
  function frame() {
    if (!api || !open) return;
    const rh = root.clientHeight || 1;
    events.emit('board:frame', { id: api.id, top: (rh - el.offsetHeight) / rh });
  }
  events.on('board:open', (a) => {
    api = a; open = true; tab = null; sel = null; keyB = keyU = ''; enterId = null; dipped = false; freeze = false;
    R.name.textContent = a.name;
    R.tabBi.innerHTML = ICON[a.icon] || ICON.wrench;
    el.classList.remove('dip');
    render();
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(frame);
  });
  events.on('board:close', (e) => {
    if (!api || (e && e.id !== api.id)) return;
    cancelHold();
    open = false; freeze = false;
    el.classList.remove('open', 'dip');
    el.setAttribute('aria-hidden', 'true');
    setReveal(false);
  });
  const skip = () => api?.skip();
  function setReveal(on) {
    if (on === dipped) return;
    dipped = on;
    flags.reveal = on;
    refreshInput();
    if (on) document.addEventListener('pointerdown', skip, true);
    else document.removeEventListener('pointerdown', skip, true);
  }
  events.on('board:reveal', (e) => {
    if (!api || e?.id !== api.id) return;
    if (e.phase === 'dip') { cancelHold(); el.classList.add('dip'); setReveal(true); return; }
    setReveal(false);
    freeze = false;
    if (!open) return;
    el.classList.remove('dip');
    render();
    requestAnimationFrame(frame);
  });
  window.addEventListener('resize', () => requestAnimationFrame(frame));

  return {
    get isOpen() { return open; },
    /** The legacy "open the upgrades" entry: only while standing on a board (the board decides). */
    close() { if (api) events.emit('board:dismiss', { id: api.id }); },
  };
}
