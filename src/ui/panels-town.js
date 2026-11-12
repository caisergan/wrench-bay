// Harbor Town panels (TOWN.md section 9): Fame, Town map, Pro Gear sheet, Academy sheet, garage complete, ferry,
// and the two non-blocking moments (fame level-up, "Perfect!"). All state comes through townstate.js (core/state.js
// helpers with fallbacks), so these work before and after the core agent's helpers land.
import * as S from '../core/state.js';
import { events } from '../core/events.js';
import * as C from '../config.js';
import { root } from '../core/engine.js';
import { ICON } from './icons.js';
import { fmt, html } from './format.js';
import { sfx } from './audio.js';
import { toast } from './toast.js';
import { makeModal } from './modal.js';
import { T } from './townstate.js';
import { flags, refreshInput } from './uistate.js';

const { state } = S;
const PLACE_ICON = {
  garage: 'wrench', tow: 'tow', wash: 'wash', lounge: 'lounge', paint: 'paintShop', vip: 'crown', junkyard: 'junk',
  diner: 'diner', showroom: 'showroom', gas: 'pump', quickfit: 'quickfit', ferry: 'ferry', depot: 'depot', academy: 'academy',
};
const ico = (id) => ICON[PLACE_ICON[id]] || ICON.mapPin;
const mid = (r) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });
const money = (n) => '$' + fmt(n);

// ------------------------------------------------------------------ what is a place right now?
// s: 'owned' | 'sale' | 'locked'. Used by the map pins, the plots and the list.
function placeInfo(id) {
  if (id === 'garage') return { id, s: 'owned', name: 'Your garage', blurb: 'Home. Customers wait here, cash piles up at the lifts.', level: 1, max: 1, next: null, c: mid(C.LAYOUT.bounds) };
  const svc = C.SERVICES[id];
  if (svc) {
    const open = T.districtOpen('main');
    return {
      id, s: open ? 'owned' : 'locked', name: svc.name, c: mid(svc.plot), level: open ? 1 : 0, max: 1, next: null,
      blurb: id === 'depot' ? 'Pro Gear: permanent upgrades for the whole town.' : 'Hire floor managers who collect cash and keep a facility running while you are away.',
      reason: open ? '' : 'Opens with the Main Street gate', short: 'Gate',
    };
  }
  const p = C.PROPERTIES[id];
  const level = T.propLevel(id), max = p.levels.length;
  const next = T.nextPropLevel(id);
  const open = T.districtOpen(p.district);
  const info = { id, name: p.name, blurb: p.blurb, level, max, next, c: mid(p.plot), kind: p.kind };
  if (!open) {
    const d = C.DISTRICTS[p.district];
    return { ...info, s: 'locked', reason: `Needs the ${d.label} gate (${money(Math.round(d.price * (S.shopMult ? S.shopMult() : 1)))}, fame ${d.fame})`, short: 'Gate' };
  }
  if (level > 0) {
    const up = next && !next.locked;
    return { ...info, s: 'owned', up, reason: next ? (next.locked ? lockReason(next) : `Level ${next.level} for ${money(next.price)}`) : 'Fully upgraded', short: '' };
  }
  if (next && next.locked) return { ...info, s: 'locked', reason: lockReason(next), short: next.reason === 'all' ? 'Last' : 'Fame ' + next.fame };
  return { ...info, s: 'sale', reason: next ? `${money(next.price)}${next.fame ? ', fame ' + next.fame : ''}` : '', short: next ? money(next.price) : '' };
}
function lockReason(n) {
  return n.reason === 'all' ? 'Own every building and finish the garage first' : `Reach fame level ${n.fame} (you are ${T.fameLevel()})`;
}
const PLACE_IDS = () => ['garage', ...Object.keys(C.PROPERTIES), ...Object.keys(C.SERVICES)];

// ------------------------------------------------------------------ bottom sheets (Pro Gear, Academy)
function makeSheet(title, icon, cls = '') {
  const el = html(`
    <div class="sheet ${cls}" data-ui>
      <div class="sheet-grab"></div>
      <div class="sheet-head"><span class="ph-icon">${icon}</span><h2>${title}</h2>
        <button class="x-btn pressable" data-ui aria-label="Close">${ICON.x}</button></div>
      <div class="sheet-body"></div>
    </div>`);
  document.getElementById('ui').appendChild(el);
  const ctl = {
    el, body: el.querySelector('.sheet-body'), render: () => {},
    open() { ctl.render(); el.classList.add('open'); },
    close() { el.classList.remove('open'); },
    get isOpen() { return el.classList.contains('open'); },
  };
  el.querySelector('.x-btn').addEventListener('click', () => ctl.close());
  return ctl;
}

export function buildTownPanels(hud) {
  // ================= FAME =================
  const fame = makeModal({ title: 'Fame', icon: ICON.star, cls: 'fame' });
  const RING = '<svg viewBox="0 0 50 50" aria-hidden="true"><circle class="fb-bg" cx="25" cy="25" r="21"/><circle class="fb-fg" cx="25" cy="25" r="21" pathLength="100" style="stroke-dashoffset:{off}"/></svg>';
  function upcoming(level) {
    const out = [];
    const at = S.fameUnlocksAt ? S.fameUnlocksAt : () => [];
    for (let L = level + 1; L <= (C.FAME.maxLevel || 25) && out.length < 3; L++) {
      const items = at(L).map((u) => (u.kind === 'car' ? `New cars: ${u.label}` : u.kind === 'district' ? `${u.label} opens` : u.level > 1 ? `${u.label} upgrade` : u.label));
      if (items.length) out.push({ L, items });
    }
    return out;
  }
  function renderFame() {
    const f = T.fameProgress(), maxed = !f.need;
    const frac = Math.max(0, Math.min(1, f.frac ?? 0));
    const pct = Math.round((T.fameMult() - 1) * 100);
    const frag = document.createDocumentFragment();
    frag.appendChild(html(`
      <div class="fm-hero">
        <div class="fm-badge">${RING.replace('{off}', String(100 - (maxed ? 100 : frac * 100)))}<span class="fb-star">${ICON.star}</span><b>${f.level}</b></div>
        <div class="fm-info">
          <div class="fm-title">Fame level ${f.level}</div>
          <div class="m-bar"><i style="transform:scaleX(${maxed ? 1 : frac})"></i><span>${maxed ? 'Max level!' : `${fmt(Math.floor(f.xp))} / ${fmt(f.need)} XP`}</span></div>
          <div class="fm-bonus">+${pct}% on every payout${state.town && T.collectionMult() > 1.0001 ? `, +${Math.round((T.collectionMult() - 1) * 100)}% collection` : ''}</div>
        </div>
      </div>`));
    frag.appendChild(html(`<div class="fm-perk">${ICON.gem}<span>Every level: <b>+${Math.round(C.FAME.pricePerLevel * 100)}%</b> payouts and <b>+${C.FAME.gemsPerLevel}</b> gems</span></div>`));
    // what the next levels bring
    const up = upcoming(f.level);
    const sec = html('<div class="fm-sec"><h3>Coming up</h3></div>');
    if (!up.length) sec.appendChild(html('<p class="hint">Nothing new is waiting at higher levels. Keep going for the payout bonus!</p>'));
    for (const u of up) {
      sec.appendChild(html(`<div class="fm-next"><span class="fm-lv">${ICON.star}<b>${u.L}</b></span><div>${u.items.map((t) => `<div>${t}</div>`).join('')}</div></div>`));
    }
    frag.appendChild(sec);
    // collection wall
    const have = T.classics();
    const wall = html(`<div class="fm-sec"><h3>Collection <em>${have.length}/${C.CLASSICS.length}</em></h3><div class="fm-wall"></div>
      <p class="hint">Restore each classic once: +${Math.round(C.PROJECT.collectionBonus * 100)}% on every payout, forever.</p></div>`);
    const grid = wall.querySelector('.fm-wall');
    for (const c of C.CLASSICS) {
      const got = have.includes(c.id);
      grid.appendChild(html(`<div class="fm-car ${got ? 'got' : ''}">${ICON.car}<span>${got ? c.name : '???'}</span></div>`));
    }
    frag.appendChild(wall);
    // golden wrenches
    const found = T.wrenches(), total = C.TOWN.wrenches.length;
    const wr = html(`<div class="fm-sec"><h3>Golden wrenches <em>${found.length}/${total}</em></h3><div class="fm-wr"></div></div>`);
    const dots = wr.querySelector('.fm-wr');
    for (let i = 0; i < total; i++) dots.appendChild(html(`<i class="${i < found.length ? 'on' : ''}">${ICON.wrench}</i>`));
    frag.appendChild(wr);
    fame.body.replaceChildren(frag);
  }
  fame.onOpen = renderFame;
  ['fame:changed', 'wrench:found', 'project:changed'].forEach((e) => events.on(e, () => { if (fame.isOpen) renderFame(); }));

  // ================= TOWN MAP =================
  const map = makeModal({ title: 'Harbor Town', icon: ICON.map, cls: 'mapp' });
  const B = C.TOWN.bounds, MW = B.maxX - B.minX, MH = B.maxZ - B.minZ;
  const sx = (x) => +(x - B.minX).toFixed(2), sz = (z) => +(z - B.minZ).toFixed(2);
  const pctX = (x) => ((x - B.minX) / MW * 100).toFixed(2) + '%', pctZ = (z) => ((z - B.minZ) / MH * 100).toFixed(2) + '%';
  const rect = (r, cls, extra = '') => `<rect class="${cls}" x="${sx(r.minX)}" y="${sz(r.minZ)}" width="${+(r.maxX - r.minX).toFixed(2)}" height="${+(r.maxZ - r.minZ).toFixed(2)}" ${extra}/>`;
  const tri = (x, z, dir, axis) => {   // a small one-way arrow on a road
    const a = 1.1, X = sx(x), Z = sz(z);
    const pts = axis === 'x' ? `${X + dir * a},${Z} ${X - dir * a * .7},${Z - a * .8} ${X - dir * a * .7},${Z + a * .8}` : `${X},${Z + dir * a} ${X - a * .8},${Z - dir * a * .7} ${X + a * .8},${Z - dir * a * .7}`;
    return `<polygon class="mp-arrow" points="${pts}"/>`;
  };
  function baseSvg() {
    const R = C.TOWN.roads;
    let s = `<svg class="mp-svg" viewBox="0 0 ${MW} ${+MH.toFixed(2)}" preserveAspectRatio="none" aria-hidden="true">`;
    s += `<defs><pattern id="mp-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="3" fill="rgba(47,72,88,.55)"/><rect width="1.3" height="3" fill="rgba(47,72,88,.8)"/></pattern></defs>`;
    s += `<rect class="mp-land" width="${MW}" height="${MH}"/>`;
    for (const w of C.TOWN.water) s += rect(w, 'mp-water');
    s += rect(C.TOWN.ferryPlaza, 'mp-plaza');
    s += rect(C.TOWN.homeBlock, 'mp-block');
    for (const f of C.TOWN.fillers) s += rect(f, 'mp-filler');
    s += rect(C.TOWN.garden, 'mp-garden');
    for (const k in C.TOWN.alleys) s += rect(C.TOWN.alleys[k], 'mp-alley');
    for (const k in R) {
      const r = R[k];
      if (r.axis === 'x') s += rect({ minX: B.minX, maxX: B.maxX, minZ: r.z - r.halfWidth, maxZ: r.z + r.halfWidth }, 'mp-road');
      else s += rect({ minX: r.x - r.halfWidth, maxX: r.x + r.halfWidth, minZ: r.from, maxZ: r.to }, 'mp-road');
    }
    for (let x = -52; x <= 56; x += 21) { s += tri(x, R.harbor.z, 1, 'x'); s += tri(x + 8, R.main.z, -1, 'x'); }
    s += tri(R.west.x, -12, 1, 'z') + tri(R.west.x, 2, 1, 'z') + tri(R.east.x, -12, -1, 'z') + tri(R.east.x, 2, -1, 'z');
    s += rect(C.LAYOUT.bounds, 'mp-lot');
    for (const id of PLACE_IDS()) {
      if (id === 'garage') continue;
      const plot = (C.PROPERTIES[id] || C.SERVICES[id]).plot;
      s += `<rect class="mp-plot" data-p="${id}" x="${sx(plot.minX)}" y="${sz(plot.minZ)}" width="${+(plot.maxX - plot.minX).toFixed(2)}" height="${+(plot.maxZ - plot.minZ).toFixed(2)}" rx="0.8"/>`;
    }
    if (!T.districtOpen('main')) s += rect(C.DISTRICTS.main.noGo, 'mp-locked', 'fill="url(#mp-hatch)"');
    s += `<text class="mp-t" x="${sx(-36)}" y="${sz(R.harbor.z) + 0.9}">HARBOR STREET</text>`;
    s += `<text class="mp-t" x="${sx(30)}" y="${sz(R.main.z) + 0.9}">MAIN STREET</text>`;
    s += `<text class="mp-t w" x="${sx(-24)}" y="${sz(20.8)}">THE HARBOR</text>`;
    s += `<text class="mp-t g" x="${sx(0)}" y="${sz(-11.6)}">GARAGE</text>`;
    s += '</svg>';
    return s;
  }

  let sel = null, guide = null, callSpot = null;
  const youEl = html('<i class="mp-you" hidden></i>');
  function playerPos() {
    try { const p = window.__game && window.__game.player; const q = p && (p.pos || (p.group && p.group.position)); return q && Number.isFinite(q.x) ? q : null; } catch { return null; }
  }
  function placeYou() {
    const q = playerPos();
    youEl.hidden = !q;
    if (!q) return;
    youEl.style.left = pctX(Math.min(B.maxX, Math.max(B.minX, q.x))); youEl.style.top = pctZ(Math.min(B.maxZ, Math.max(B.minZ, q.z)));
  }
  const BADGE = { owned: ICON.check, locked: ICON.lock };
  function statusChip(p) {
    if (p.s === 'owned') return p.up ? `<span class="chip up">${ICON.arrowUp}${money(p.next.price)}</span>` : p.max > 1 || p.id === 'garage' ? `<span class="chip own">${p.max > 1 ? `Lv ${p.level}/${p.max}` : 'Yours'}</span>` : '<span class="chip own">Yours</span>';
    if (p.s === 'sale') return `<span class="chip sale">${ICON.cash}${money(p.next.price)}</span>`;
    return `<span class="chip lock">${ICON.lock}${p.short || 'Locked'}</span>`;
  }
  function select(id, emit) {
    sel = id;
    if (emit) {
      guide = id;
      events.emit('ui:mapTarget', { id });
      sfx('click');
    }
    renderMap();
  }
  function renderMap() {
    const infos = PLACE_IDS().map(placeInfo);
    const tp = T.townProgress();
    const frag = document.createDocumentFragment();
    frag.appendChild(html(`<div class="mp-sum"><b>${tp.done}/${tp.total}</b><span>levels owned</span><i></i><b>${T.fameLevel()}</b><span>${ICON.star} fame</span></div>`));
    const wrap = html(`<div class="mp-wrap" style="aspect-ratio:${MW} / ${MH.toFixed(2)}">${baseSvg()}</div>`);
    // plot colours by state
    wrap.querySelectorAll('.mp-plot').forEach((r) => { const p = infos.find((i) => i.id === r.dataset.p); r.dataset.s = p.s; if (p.id === sel) r.classList.add('sel'); });
    // till coins
    const tills = T.tills();
    for (const p of infos) {
      const pin = html(`<button class="mp-pin pressable" data-ui data-s="${p.s}" data-id="${p.id}" aria-label="${p.name}">${ico(p.id)}${
        p.s === 'owned' && !p.up ? `<s class="pb ok">${BADGE.owned}</s>` : p.s === 'locked' ? `<s class="pb lk">${BADGE.locked}</s>` : p.up ? `<s class="pb up">${ICON.arrowUp}</s>` : '<s class="pb sl">$</s>'}</button>`);
      pin.style.left = pctX(p.c.x); pin.style.top = pctZ(p.c.z);
      if (p.id === sel) pin.classList.add('sel');
      if (p.id === guide) pin.classList.add('guide');
      if ((tills[p.id] || 0) >= 1) pin.classList.add('till');
      pin.addEventListener('click', () => select(p.id, true));
      wrap.appendChild(pin);
    }
    if (callSpot) {
      const sp = C.RESCUE.spots.find((s) => s.id === callSpot);
      if (sp) { const c = html(`<i class="mp-call">${ICON.phone}</i>`); c.style.left = pctX(sp.x); c.style.top = pctZ(sp.z); wrap.appendChild(c); }
    }
    wrap.appendChild(youEl);
    placeYou();
    frag.appendChild(wrap);
    frag.appendChild(html(`<div class="mp-legend"><span><i class="lg own"></i>Yours</span><span><i class="lg sale"></i>For sale</span><span><i class="lg lock"></i>Locked</span><span><i class="lg you"></i>You</span></div>`));
    // selected place
    const cur = infos.find((p) => p.id === sel);
    if (cur) {
      const card = html(`<div class="mp-card" data-s="${cur.s}"><span class="m-ico">${ico(cur.id)}</span>
        <div class="m-mid"><div class="m-text">${cur.name}</div><div class="m-sub">${cur.blurb || ''}</div>
          <div class="mp-why">${cur.s === 'locked' ? ICON.lock : cur.s === 'sale' ? ICON.tag : ICON.check}<span>${cur.s === 'owned' && cur.max > 1 ? `Level ${cur.level} of ${cur.max}. ` : ''}${cur.reason || 'Yours'}</span></div></div>
        ${guide === cur.id ? `<button class="btn pressable mp-clear" data-ui>${ICON.flag}<b>Clear</b></button>` : ''}</div>`);
      const clr = card.querySelector('.mp-clear');
      if (clr) clr.addEventListener('click', () => { guide = null; events.emit('ui:mapTarget', { id: null }); renderMap(); });
      frag.appendChild(card);
    } else {
      frag.appendChild(html('<p class="hint">Tap a place to see what it is. The guide arrow will lead you there.</p>'));
    }
    // list: what you can buy now first, then for sale, then locked, then owned
    const order = { sale: 0, locked: 1, owned: 2 };
    const list = infos.filter((p) => p.id !== 'garage').sort((a, b) => {
      const aa = a.s === 'sale' && a.next && state.cash >= a.next.price ? -1 : 0, bb = b.s === 'sale' && b.next && state.cash >= b.next.price ? -1 : 0;
      return aa - bb || order[a.s] - order[b.s] || ((a.next ? a.next.price : 0) - (b.next ? b.next.price : 0));
    });
    const lst = html('<div class="mp-list"></div>');
    for (const p of list) {
      const row = html(`<button class="mp-row pressable" data-ui data-s="${p.s}"><span class="m-ico">${ico(p.id)}</span><span class="mr-name">${p.name}</span>${statusChip(p)}</button>`);
      row.addEventListener('click', () => select(p.id, true));
      lst.appendChild(row);
    }
    frag.appendChild(lst);
    map.body.replaceChildren(frag);
  }
  map.onOpen = () => { renderMap(); placeYou(); youTimer = setInterval(placeYou, 400); };
  let youTimer = 0;
  map.onClose = () => { clearInterval(youTimer); youTimer = 0; };
  let mapDirty = 0;
  const kickMap = () => { if (mapDirty || !map.isOpen) return; mapDirty = setTimeout(() => { mapDirty = 0; if (map.isOpen) renderMap(); }, 250); };
  ['property:changed', 'district:opened', 'fame:changed', 'till:changed', 'town:opened', 'manager:hired'].forEach((e) => events.on(e, kickMap));
  events.on('cash:changed', kickMap);
  events.on('rescue:call', (e) => { callSpot = e && e.spot; kickMap(); });
  ['rescue:hooked', 'rescue:delivered', 'shop:changed'].forEach((e) => events.on(e, () => { callSpot = null; kickMap(); }));

  // ================= PRO GEAR sheet =================
  const pro = makeSheet('Pro Gear', ICON.depot, 'pro');
  const PRO_ICON = { stock: ICON.crate, crew: ICON.wrench, tips: ICON.coins, truck: ICON.tow, renown: ICON.star };
  const PRO_SUB = { stock: 'more on every shelf', crew: 'staff work and walk faster', tips: 'bigger tips on every payout', truck: 'faster vehicles', renown: 'fame grows faster' };
  const proEffect = (key, l) => {
    const u = C.PRO_UPGRADES[key];
    return key === 'stock' ? `+${l * u.per} per shelf` : `+${Math.round(l * u.per * 100)}%`;
  };
  pro.render = () => {
    const frag = document.createDocumentFragment();
    for (const key of Object.keys(C.PRO_UPGRADES)) {
      const u = C.PRO_UPGRADES[key], l = T.proLevel(key), maxed = l >= u.max, cost = T.proCost(key);
      const row = html(`
        <div class="urow"><span class="m-ico">${PRO_ICON[key] || ICON.star}</span>
          <div class="m-mid"><div class="m-text">${u.label}</div>
            <div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>
            <div class="m-sub"><span class="u-fx">${maxed ? proEffect(key, l) + ' (max)' : `${proEffect(key, l)} → ${proEffect(key, l + 1)}`}</span> <em>${PRO_SUB[key] || ''}</em></div></div>
          <button class="btn buy pressable" data-ui ${maxed || state.cash < cost ? 'disabled' : ''}>${maxed ? '<b>MAX</b>' : `<span class="b-lbl">BUY</span><b>${fmt(cost)}</b>`}</button></div>`);
      row.querySelector('.buy').addEventListener('click', () => {
        if (T.buyPro(key)) { sfx('upgrade'); pro.render(); const r = pro.body.children[Object.keys(C.PRO_UPGRADES).indexOf(key)]; r && r.classList.add('flash'); } else sfx('error');
      });
      frag.appendChild(row);
    }
    pro.body.replaceChildren(frag);
  };
  ['cash:changed', 'upgrades:changed', 'shop:changed'].forEach((e) => events.on(e, () => { if (pro.isOpen) pro.render(); }));
  events.on('townpad:enter', (e) => { if (e && e.kind === 'pro') pro.open(); });
  events.on('townpad:exit', (e) => { if (e && e.kind === 'pro') pro.close(); });

  // ================= ACADEMY sheet (floor managers) =================
  const academy = makeSheet('Wrench Academy', ICON.academy, 'academy');
  const MGR = {
    garage: { name: 'Garage manager', sub: 'Collects every cash pile into one safe', need: null },
    paint: { name: 'Spray Bay manager', sub: 'Runs the paint shop, safe by the wall', need: 'paint' },
    vip: { name: 'Club manager', sub: 'Runs the Platinum Club, safe by the door', need: 'vip' },
  };
  academy.render = () => {
    const frag = document.createDocumentFragment();
    frag.appendChild(html('<p class="hint ac-note">A manager walks the floor, brings every cash pile to one safe and keeps the facility counting while you are away.</p>'));
    const hired = T.managers(), lvl = T.fameLevel();
    for (const id of Object.keys(C.MANAGERS)) {
      const m = C.MANAGERS[id], d = MGR[id] || { name: id, sub: '', need: null };
      const price = Math.round(m.price * (S.shopMult ? S.shopMult() : 1));
      const isHired = hired.includes(id);
      const missing = d.need && !T.owns(d.need);
      const lowFame = lvl < m.fame;
      const why = isHired ? '' : missing ? `Build ${C.PROPERTIES[d.need].name} first` : lowFame ? `Fame ${m.fame} needed` : '';
      const row = html(`
        <div class="urow acrow ${isHired ? 'hired' : ''}"><span class="m-ico">${ICON.academy}</span>
          <div class="m-mid"><div class="m-text">${d.name}</div><div class="m-sub">${why ? `<span class="why">${why}</span>` : d.sub}</div></div>
          <button class="btn buy pressable ${isHired || why ? 'hi' : ''}" data-ui ${isHired || why || state.cash < price ? 'disabled' : ''}>${
            isHired ? `${ICON.check}<b>HIRED</b>` : why ? `${ICON.lock}<b>${missing ? 'Locked' : 'Fame ' + m.fame}</b>` : `<span class="b-lbl">HIRE</span><b>${fmt(price)}</b>`}</button></div>`);
      row.querySelector('.buy').addEventListener('click', () => {
        if (T.hireManager(id)) { sfx('unlock'); toast(m.label || 'Manager hired!'); academy.render(); } else sfx('error');
      });
      frag.appendChild(row);
    }
    academy.body.replaceChildren(frag);
  };
  ['cash:changed', 'fame:changed', 'manager:hired', 'shop:changed'].forEach((e) => events.on(e, () => { if (academy.isOpen) academy.render(); }));
  events.on('townpad:enter', (e) => { if (e && e.kind === 'academy') academy.open(); });
  events.on('townpad:exit', (e) => { if (e && e.kind === 'academy') academy.close(); });

  // ================= GARAGE COMPLETE (celebration, nothing resets) =================
  const gdone = makeModal({ title: 'Garage complete!', icon: ICON.star, cls: 'complete garage-done', sticky: true });
  gdone.keep = true;
  gdone.el.querySelector('.x-btn').remove();
  const confettiHtml = (n = 26) => Array.from({ length: n }, (_, i) => {
    const c = ['#f26b5b', '#f6c453', '#2a9d8f', '#fff6e6'][i % 4];
    return `<s style="left:${Math.random() * 100}%;background:${c};animation-delay:${(Math.random() * 1.2).toFixed(2)}s;animation-duration:${(2 + Math.random() * 1.5).toFixed(2)}s"></s>`;
  }).join('');
  function showGarageComplete() {
    if (gdone.isOpen) return;
    const tp = T.townProgress();
    const nx = tp.next && tp.next.name;
    const body = html(`
      <div class="celebrate"><div class="confetti">${confettiHtml()}</div>
        <div class="big-star">${ICON.star}</div>
        <p class="c-name">${S.shopName ? S.shopName() : 'Your garage'}</p>
        <p class="c-sub">Every bay is open and your crew runs the shop.</p>
        <p class="c-next">Harbor Town is waiting</p>
        <p class="c-mult">${nx ? `Next goal: ${nx}` : 'Buy buildings, earn fame, sail to the next town'}</p>
      </div>`);
    const go = html(`<button class="btn big teal pressable pulse" data-ui>${ICON.map}<span>Explore the town</span></button>`);
    go.addEventListener('click', () => { gdone.close(); sfx('unlock'); events.emit('ui:garageCompleteClosed'); });
    gdone.body.replaceChildren(body, go);
    gdone.open();
    sfx('unlock');
  }
  gdone.onOpen = () => { flags.complete = true; refreshInput(); };
  gdone.onClose = () => { flags.complete = false; refreshInput(); };

  // ================= FERRY (confirm, then the next town) =================
  const ferry = makeModal({ title: 'The ferry', icon: ICON.ferry, cls: 'ferry', sticky: false });
  function showFerry(onSail) {
    const n = C.SHOP_NAMES;
    const nextName = n[((state.shopLevel || 0) + 1) % n.length];
    const keep = [`${ICON.gem}<span>Your <b>${fmt(state.gems)}</b> gems</span>`,
      `${ICON.car}<span>The classics collection (<b>${T.classics().length}/${C.CLASSICS.length}</b>, +${Math.round((T.collectionMult() - 1) * 100)}% payouts)</span>`,
      `${ICON.bolt}<span>Everything there pays <b>x${C.ECONOMY.shopMultiplier}</b></span>`];
    const lose = [`${ICON.lock}<span>Buildings, fame and Pro Gear</span>`, `${ICON.cash}<span>Cash, garage unlocks and upgrades</span>`];
    const body = html(`
      <div class="fy">
        <div class="fy-art">${ICON.ferry}</div>
        <p class="fy-to">Next stop</p><p class="fy-name">${nextName}</p>
        <div class="fy-col keep"><h3>You keep</h3>${keep.map((t) => `<div>${t}</div>`).join('')}</div>
        <div class="fy-col lose"><h3>You start over with</h3>${lose.map((t) => `<div>${t}</div>`).join('')}</div>
      </div>`);
    const go = html(`<button class="btn big teal pressable pulse" data-ui>${ICON.ferry}<span>Set sail!</span></button>`);
    const no = html('<button class="btn big cream pressable" data-ui><span>Not yet</span></button>');
    go.addEventListener('click', () => { ferry.close(); sfx('ferry'); try { onSail && onSail(); } finally { events.emit('ui:sail'); } });
    no.addEventListener('click', () => ferry.close());
    ferry.body.replaceChildren(body, go, no);
    ferry.open();
    sfx('click');
  }

  // ================= MOMENTS (non-blocking: fame level-up, "Perfect!") =================
  const momentQueue = [];
  let momentBusy = false;
  const lastAt = {};
  function moment(kind, el, ms, sound) {
    momentQueue.push({ kind, el, ms, sound });
    if (!momentBusy) nextMoment();
  }
  function nextMoment() {
    const m = momentQueue.shift();
    if (!m) { momentBusy = false; return; }
    momentBusy = true;
    document.getElementById('ui').appendChild(m.el);
    if (m.sound) sfx(m.sound);
    setTimeout(() => { m.el.classList.add('out'); setTimeout(() => { m.el.remove(); nextMoment(); }, 420); }, m.ms);
  }
  const dedupe = (k) => { const n = performance.now(); if (n - (lastAt[k] || -1e9) < 1200) return true; lastAt[k] = n; return false; };
  function levelUp(level, unlocks = []) {
    if (dedupe('lvl' + level)) return;
    const lines = unlocks.map((u) => {
      if (typeof u === 'string') return u;
      if (u.kind === 'car') return `New in town: ${u.label}!`;
      if (u.kind === 'district') return `${u.label} can be opened`;
      if (u.kind === 'property') return u.level > 1 ? `${u.label} upgrade available` : `${u.label} can be bought`;
      return u.label || u.text || u.name || '';
    }).filter(Boolean).slice(0, 4);
    lines.push(`+${Math.round(C.FAME.pricePerLevel * 100)}% payouts, +${C.FAME.gemsPerLevel} gems`);
    const el = html(`
      <div class="moment lvlup"><div class="mm-rays"></div><div class="confetti">${confettiHtml(30)}</div>
        <div class="mm-star">${ICON.star}<b>${level}</b></div>
        <div class="mm-title">Fame level ${level}!</div>
        <div class="mm-lines">${lines.map((t) => `<span>${t}</span>`).join('')}</div>
      </div>`);
    moment('lvl', el, 3300, 'fame');
  }
  function perfect(total) {
    if (dedupe('perfect')) return;
    const el = html(`
      <div class="moment perfect"><div class="mm-rays gold"></div>
        <div class="mm-stars"><i>${ICON.starGold}</i><i>${ICON.starGold}</i><i>${ICON.starGold}</i></div>
        <div class="mm-title big">Perfect!</div>
        ${total ? `<div class="mm-lines"><span>${ICON.cash}+${money(total)}</span></div>` : ''}
      </div>`);
    moment('perfect', el, 2300, 'perfect');
  }
  events.on('fame:levelup', (e) => e && levelUp(e.level, e.unlocks || []));
  events.on('vip:done', (e) => { if (e && e.stars >= 3) perfect(e.total); });

  return {
    openFame() { sfx('click'); fame.open(); },
    openMap() { sfx('click'); map.open(); },
    openProGear: () => pro.open(), closeProGear: () => pro.close(),
    openAcademy: () => academy.open(), closeAcademy: () => academy.close(),
    showGarageComplete, showFerry, levelUp, perfect,
    closeAll() { fame.close(); map.close(); pro.close(); academy.close(); },
  };
}
