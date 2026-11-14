// The upgrade board (proposal mock). One per workshop: Build = that workshop's unlock chain, bought from here instead of
// from pads on the floor; Boosts = the player-wide UPGRADES, with words for the workshop you are in. Every name, price,
// sentence and "before -> after" chip comes from the game's own config and unlock-info.js.
import { UNLOCKS, UPGRADES, PLAYER, PAINT_UNLOCKS, VISIBLE_PADS } from '/src/config.js';
import { unlockInfo } from '/src/game/unlock-info.js';
import { ICON } from '/src/ui/icons.js';

export const fmt = (n) => (n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? +(n / 1e3).toFixed(n % 1000 ? 1 : 0) + 'K' : n >= 1000 ? +(n / 1e3).toFixed(n % 1000 ? 1 : 0) + 'K' : String(Math.round(n)));
const money = (n) => (n >= 1e4 ? fmt(n) : n.toLocaleString('en-US'));

const SHOPS = {
  garage: { id: 'garage', name: 'Wrench Bay', icon: 'wrench', list: UNLOCKS, plan: 'Garage plan', carry: 'parts' },
  paint: { id: 'paint', name: 'Spray Bay', icon: 'paintShop', list: PAINT_UNLOCKS, plan: 'Spray Bay plan', carry: 'cans' },
};
// what each boost does, in the words of the workshop you are standing in (the boost itself is shared)
const BOOST_SUB = {
  garage: { speed: 'walk & drive', capacity: '', repair: 'you + mechanics', supply: 'shelf refills', price: 'per repair' },
  paint: { speed: 'walk & drive', capacity: '', repair: 'you + painters', supply: 'tank refills', price: 'per respray' },
};
const BOOST_ICON = { speed: 'speed', capacity: 'capacity', repair: 'wrench', supply: 'crate', price: 'price' };
const boostCost = (k, l) => Math.round(UPGRADES[k].base * Math.pow(UPGRADES[k].growth, l));
function boostFx(k, l, carry) {
  const u = UPGRADES[k];
  if (k === 'capacity') return `${PLAYER.carryBase + l * u.per}` + (carry ? ` ${carry}` : '');
  if (k === 'supply') return l ? `-${Math.round((1 - Math.pow(1 - u.per, l)) * 100)}%` : 'base';
  return l ? `+${Math.round(l * u.per * 100)}%` : 'base';
}
const ico = (key, color) => `<span style="display:contents;${color ? `--c:${color}` : ''}">${ICON[key] || ICON.tag}</span>`;

/**
 * mountBoard(screen, { shop: 'garage' | 'paint', cash, owned: [chain ids], levels: { speed, ... }, tab? })
 * Returns { state, render(), setCash(n) }. screen is the .ui phone element; the sheet is appended to it.
 */
export function mountBoard(screen, opts) {
  const S = SHOPS[opts.shop];
  const st = { cash: opts.cash, owned: new Set(opts.owned), levels: { ...opts.levels }, tab: opts.tab || null, sel: null, busy: false };
  const el = document.createElement('div');
  el.className = 'bd';
  el.innerHTML = `
    <div class="bd-grab"></div>
    <div class="bd-head">
      <span class="bd-ph">${ICON.arrowUp}</span>
      <div class="bd-ttl"><small>UPGRADES</small><h2>${S.name}</h2></div>
      <span class="bd-cash">${ICON.cash}<b></b></span>
      <button class="bd-x pressable" aria-label="Close">${ICON.x}</button>
    </div>
    <div class="bd-tabs">
      <button class="bd-tab pressable" data-t="build">${ICON[S.icon]}<span>Build</span><span class="n"></span></button>
      <button class="bd-tab pressable" data-t="boost">${ICON.bolt}<span>Boosts</span><span class="n"></span></button>
    </div>
    <div class="bd-pane" data-p="build"></div>
    <div class="bd-pane" data-p="boost"></div>`;
  screen.appendChild(el);
  const q = (s) => el.querySelector(s);
  const paneB = q('[data-p="build"]'), paneU = q('[data-p="boost"]');
  el.querySelectorAll('.bd-tab').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.t; render(); }));
  q('.bd-x').addEventListener('click', () => { el.classList.add('dip'); setTimeout(() => el.classList.remove('dip'), 900); });

  const chain = () => S.list;
  const next = () => chain().filter((u) => !st.owned.has(u.id)).slice(0, VISIBLE_PADS);
  const later = () => chain().filter((u) => !st.owned.has(u.id)).slice(VISIBLE_PADS);
  const canBuild = () => next().filter((u) => st.cash >= u.price).length;
  const canBoost = () => Object.keys(UPGRADES).filter((k) => st.levels[k] < UPGRADES[k].max && st.cash >= boostCost(k, st.levels[k])).length;

  function buyKey(price, maxed) {
    if (maxed) return `<button class="buy max" disabled><span class="p">MAX</span></button>`;
    if (st.cash >= price) return `<button class="buy pressable"><span class="l">HOLD TO BUY</span><span class="p">$${money(price)}</span></button>`;
    const k = Math.max(0, Math.min(1, st.cash / price));
    return `<button class="buy" disabled style="--k:${k.toFixed(3)}"><span class="p">$${money(price)}</span><span class="l">$${money(price - st.cash)} to go</span></button>`;
  }

  function planSay(u) {
    if (!u) {
      const l = later()[0];
      return l ? `then <b>${unlockInfo(S.id, l).name}</b> $${money(l.price)}` : 'the last ones';
    }
    const info = unlockInfo(S.id, u), i = chain().indexOf(u);
    if (st.owned.has(u.id)) return `<b>${info.name}</b> · built`;
    if (next().includes(u)) return `<b>${info.name}</b> · $${money(u.price)} · on sale now`;
    return `<span class="lk">${ICON.lock}</span><b>${info.name}</b> · $${money(u.price)} · after ${unlockInfo(S.id, chain()[i - 1]).name}`;
  }

  /** Hold to buy, as in the game (ui/board.js): keep the key pressed for 0.65 s. */
  function holdKey(btn, done) {
    let raf = 0, t0 = 0;
    const stop = () => { cancelAnimationFrame(raf); raf = 0; btn.classList.remove('holding'); btn.style.setProperty('--h', '0'); };
    const loop = () => {
      const k = Math.min(1, (performance.now() - t0) / 650);
      btn.style.setProperty('--h', k.toFixed(3));
      if (k >= 1) { stop(); done(); return; }
      raf = requestAnimationFrame(loop);
    };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); t0 = performance.now(); btn.classList.add('holding'); loop(); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => { if (raf) stop(); });
  }

  function renderBuild() {
    const L = chain(), own = L.filter((u) => st.owned.has(u.id)).length, nx = next();
    const tiles = L.map((u) => {
      const info = unlockInfo(S.id, u), cls = st.owned.has(u.id) ? 'own' : nx.includes(u) ? 'next' : '';
      return `<span class="pt ${cls}${st.sel === u.id ? ' sel' : ''}" data-id="${u.id}" title="${info.name}">${ico(info.icon, info.color)}</span>`;
    }).join('');
    const fillW = own ? `calc(${(own - 0.5) / (L.length - 1)} * (100% - 20px))` : '0px';
    const cards = nx.map((u) => {
      const info = unlockInfo(S.id, u), can = st.cash >= u.price;
      const chips = (info.change || []).map((c) => `<span class="chg">${c.icon ? ico(c.icon, c.color) : ''}${c.label} ${c.from != null ? `<s>${c.from}</s><i>→</i>` : ''}<b>${c.to}</b></span>`).join('');
      return `<div class="bc${can ? ' can' : ''}" data-k="${info.kind}" data-id="${u.id}" data-done="Built!">
        <span class="bc-pic">${ico(info.icon, info.color)}</span>
        <div class="bc-mid"><div class="bc-top"><span class="bc-name">${info.name}</span><span class="bc-rib">${info.rib}</span></div>
          <div class="bc-what">${info.what}</div></div>
        <div class="bc-row"><span class="chgs">${chips}</span>${buyKey(u.price)}</div></div>`;
    }).join('');
    paneB.innerHTML = `
      <div class="plan">
        <div class="plan-road"><i class="fill" style="width:${fillW}"></i>${tiles}</div>
        <div class="plan-say">${st.sel ? planSay(L.find((u) => u.id === st.sel)) : `<b>${own} of ${L.length}</b> built · ${planSay(null)}`}</div></div>
      ${cards || `<div class="bd-done">Everything in the ${S.name} is built.</div>`}`;
    paneB.querySelectorAll('.pt').forEach((t) => t.addEventListener('click', () => { st.sel = st.sel === t.dataset.id ? null : t.dataset.id; renderBuild(); }));
    paneB.querySelectorAll('.bc .buy:not(:disabled)').forEach((b) => holdKey(b, () => buildIt(b.closest('.bc'))));
  }

  function renderBoost() {
    const rows = Object.keys(UPGRADES).map((k) => {
      const u = UPGRADES[k], l = st.levels[k], maxed = l >= u.max, cost = boostCost(k, l);
      const bar = Array.from({ length: u.max }, (_, i) => `<i class="${i < l ? 'on' : i === l && st.cash >= cost ? 'next' : ''}"></i>`).join('');
      const sub = BOOST_SUB[S.id][k] ? ` · ${BOOST_SUB[S.id][k]}` : '';
      const fx = maxed ? `<b>${boostFx(k, l, S.carry)}</b>${sub}`
        : `<s>${boostFx(k, l, '')}</s> → <b>${boostFx(k, l + 1, S.carry)}</b>${sub}`;
      return `<div class="bst${maxed ? ' maxed' : ''}" data-k="${k}"><span class="bst-ic">${ICON[BOOST_ICON[k]]}</span>
        <div class="bst-mid"><div class="bst-top"><span class="bst-name">${u.label}</span><span class="bst-lv">Lv ${l}</span></div>
          <div class="bst-bar">${bar}</div><div class="bst-fx">${fx}</div></div>${buyKey(cost, maxed)}</div>`;
    }).join('');
    paneU.innerHTML = rows + `<div class="bd-note">${ICON.star}Boosts are yours: a level counts in every workshop</div>`;
    paneU.querySelectorAll('.bst .buy:not(:disabled)').forEach((b) => holdKey(b, () => boostIt(b.closest('.bst'))));
  }

  function render() {
    const nb = canBuild(), nu = canBoost();
    if (!st.tab) st.tab = nb || !nu ? 'build' : 'boost';
    el.querySelectorAll('.bd-tab').forEach((t) => t.classList.toggle('on', t.dataset.t === st.tab));
    q('[data-t="build"] .n').textContent = nb || '';
    q('[data-t="boost"] .n').textContent = nu || '';
    q('.bd-cash b').textContent = money(st.cash);
    paneB.hidden = st.tab !== 'build'; paneU.hidden = st.tab !== 'boost';
    renderBuild(); renderBoost();
    opts.onChange?.(st, { build: nb, boost: nu });
  }

  function spend(n) {
    st.cash -= n;
    opts.onChange?.(st, {});
    const c = q('.bd-cash'); c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick');
  }

  // Build: stamp the card, dip the sheet while the camera glides to the spot and the thing pops in, then come back with
  // the next entry of the plan sliding into the free slot.
  function buildIt(card) {
    if (st.busy) return;
    const u = chain().find((x) => x.id === card.dataset.id);
    if (!u || st.cash < u.price) return;
    st.busy = true;
    spend(u.price);
    q('.bd-cash b').textContent = money(st.cash);
    card.classList.add('stamp');
    card.querySelector('.buy').disabled = true;
    setTimeout(() => {
      el.classList.add('dip');
      opts.onReveal?.(u, unlockInfo(S.id, u));
    }, 650);
    setTimeout(() => {
      st.owned.add(u.id);
      st.sel = null;
      render();
      el.classList.remove('dip');
      const nc = paneB.querySelectorAll('.bc');
      if (nc.length) nc[nc.length - 1].classList.add('enter');
      st.busy = false;
    }, 2300);
  }

  function boostIt(row) {
    const k = row.dataset.k, l = st.levels[k], cost = boostCost(k, l);
    if (l >= UPGRADES[k].max || st.cash < cost) return;
    spend(cost);
    st.levels[k]++;
    render();
    const r = paneU.querySelector(`.bst[data-k="${k}"]`);
    r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash');
  }

  render();
  return {
    state: st, el, render,
    setCash(n) { st.cash = Math.max(0, n); render(); },
    reset(o) { st.cash = o.cash; st.owned = new Set(o.owned); st.levels = { ...o.levels }; st.tab = o.tab || null; st.sel = null; render(); },
  };
}
