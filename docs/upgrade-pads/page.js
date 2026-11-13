// Upgrade-pad proposal page: draws the new tag / dock pieces, the table of every pad, and runs the "Try it" frame.
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import { ICON } from '/src/ui/icons.js';
import { CHAINS, describe, icon } from './desc.js';

const fmt = (n) => (n >= 1e6 ? +(n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1000 ? +(n / 1000).toFixed(n % 1000 && n < 1e5 ? 1 : 0) + 'K' : String(Math.round(n)));
const $ = (s) => document.querySelector(s);
const PREVIEW = { station: { garage: 'the shelf', paint: 'the tank' }, bay: { garage: 'the lift', paint: 'the booth', vip: 'the gold lift' },
  staff: 'at their post', valet: 'at the stand', coffee: 'the cart', billboard: 'the board' };
const preview = (k, fac) => (typeof PREVIEW[k] === 'string' ? PREVIEW[k] : PREVIEW[k][fac]);

// ---------------------------------------------------------------- pieces
function tag(d, price, { near = false, can = null } = {}) {
  const st = d.color ? ` style="--c:${d.color}"` : '';
  const badge = d.kind === 'up' ? `<s class="gt-badge">${ICON.arrowUp}</s>` : '';
  const cls = can === true ? ' can' : can === false ? ' cant' : '';
  return `<span class="gt${cls}" data-k="${d.kind}"><span class="gt-i"${st}>${icon(d.icon)}${badge}</span>` +
    (near ? `<span class="gt-name">${d.name}</span><span class="gt-sep"></span>` : '') + `<span class="gt-p">$${fmt(price)}</span></span>`;
}
function chips(change) {
  return change.map((c) => {
    const ic = c.icon ? `<span style="display:contents;${c.color ? `--c:${c.color}` : ''}">${icon(c.icon)}</span>` : '';
    return `<span class="chg">${ic}${c.label} ${c.from != null ? `<s>${c.from}</s><i>→</i>` : ''}<b>${c.to}</b></span>`;
  }).join('');
}
const pill = (price) => `<span class="pill">${ICON.cash}$${fmt(price)}</span>`;

const lime = describe('paint', CHAINS[1].list.find((u) => u.id === 'paint_lime'));
const painter = describe('paint', CHAINS[1].list.find((u) => u.id === 'painter0'));
const lamps = describe('paint', CHAINS[1].list.find((u) => u.id === 'irlamps'));
const valet = describe('garage', CHAINS[0].list.find((u) => u.id === 'valet'));
$('#dTag').innerHTML = `${pill(1500)}<span class="arrow">↓</span>${tag(lime, 1500)}`;
$('#dCan').innerHTML = `${tag(lime, 1500, { can: true })}${tag(painter, 4000, { can: false })}`;
$('#dChg').innerHTML = `<div class="chgs">${chips(lime.change)}${chips(lamps.change)}${chips(valet.change)}</div>`;
$('#dFull').innerHTML = `<span class="stk old" style="--c:#9bcf3a">${ICON.spray}MAX</span><span class="arrow">↓</span><span class="stk" style="--c:#9bcf3a">${ICON.spray}FULL</span>`;

// ---------------------------------------------------------------- every pad
$('#table').innerHTML = CHAINS.map((ch) => {
  const rows = ch.list.map((u) => {
    const d = describe(ch.id, u);
    return `<tr><td class="tg">${tag(d, u.price, { near: true })}</td>
      <td class="nm"><b>${d.name}</b><span class="rib${d.kind === 'up' ? ' up' : ''}">${d.rib}</span></td>
      <td class="wh">${d.what}</td><td class="ch">${chips(d.change)}</td>
      <td class="pv${d.ghost ? ' y' : ''}">${d.ghost ? 'Preview: ' + preview(d.ghost, ch.id) : 'Dock only'}</td></tr>`;
  }).join('');
  return `<div class="chain"><h3>${ch.name} · ${ch.list.length} pads${ch.id === 'vip' ? ' (not built yet: the words are ready)' : ''}</h3><table class="pads">
    <thead><tr><th>Tag (close by)</th><th>Dock title</th><th>What it does</th><th>Before → after</th><th>Preview</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}).join('');

// ---------------------------------------------------------------- try it
const SLOT = 'uptry', KEY = 'wrench-bay-save-v1:' + SLOT;
const ids = (list) => list.map((u) => u.id);
function save(scen) {
  const zero = (o) => Object.fromEntries(o.map((k) => [k, 0]));
  const s = {
    cash: 2600, gems: 400, shopLevel: 0, unlocked: ids(CHAINS[0].list),
    upgrades: { speed: 4, capacity: 4, repair: 4, supply: 4, price: 4 },
    boosts: { incomeUntil: 0, speedUntil: 0, incomeReadyAt: 0, speedReadyAt: 0 },
    stats: zero(['repaired', 'jobsDone', 'cashEarned', 'unlocks', 'vips', 'bestStreak']), streak: 0,
    tutorialDone: true, lastSeen: Date.now(),
    town: {
      open: true, districts: ['harbor', 'main'], props: { tow: 2, wash: 2, lounge: 1, paint: 1 }, unlocked: [], fameXp: 1414,
      wrenches: [], classics: [], tills: {}, pro: { stock: 2, crew: 2, tips: 2, truck: 1, renown: 1 }, managers: ['garage'],
      project: null, vehicles: {}, garageDone: true,
      stats: zero(['rescues', 'resprays', 'vipServed', 'vipPerfect', 'washes', 'restored', 'tips']), hints: {},
    },
  };
  if (scen === 'garage') {
    Object.assign(s, { cash: 330, unlocked: ['station_oil', 'lift1', 'station_battery'], upgrades: { speed: 1, capacity: 1, repair: 1, supply: 1, price: 1 } });
    Object.assign(s.town, { open: false, districts: [], props: {}, fameXp: 0, pro: {}, managers: [], garageDone: false });
  } else if (scen === 'club') {
    s.cash = 30000;
    s.town.props.vip = 1;
    s.town.unlocked = ids(CHAINS[1].list);
    s.town.managers = ['garage', 'paint'];
  }
  localStorage.setItem(KEY, JSON.stringify(s));
}
const START = { paint: [-35.6, -3.6], garage: [-2, -1], club: [36, -0.5] };

const frame = $('#game');
let scen = 'paint';
const G = () => frame.contentWindow?.__game;

let blank = null;
async function boot(fresh) {
  $('#live').textContent = 'Loading the game…';
  // unload the running game first: it saves on the way out, which would overwrite the new scenario
  if (frame.src && !frame.src.startsWith('about:')) {
    await new Promise((r) => { blank = r; frame.src = 'about:blank'; });
  }
  if (fresh) save(scen);
  frame.src = `/?autoplay&save=${SLOT}&view=mobile&t=${Date.now()}`;
}
frame.addEventListener('load', async () => {
  if (frame.src.startsWith('about:')) { blank?.(); blank = null; return; }
  const w = frame.contentWindow;
  for (let i = 0; i < 80 && !w.__game?.world?.facilities?.garage; i++) await new Promise((r) => setTimeout(r, 100));
  const g = w.__game;
  if (!g) { $('#live').textContent = 'The game did not start.'; return; }
  const quiet = () => { g.world.cars.paused = true; for (const f of Object.values(g.world.facilities)) if (f.cars) f.cars.paused = true; };
  quiet(); setTimeout(quiet, 600); setTimeout(quiet, 2000);
  g.teleport(...START[scen]);
  w.focus();
});

// live readout: the pads in view and what they would say
function live() {
  const g = G();
  if (!g?.world) return;
  const out = [];
  for (const f of Object.values(g.world.facilities)) {
    for (const p of f.pads?.list || []) {
      const d = describe(f.id, p.u), near = Math.hypot(g.player.pos.x - p.pos.x, g.player.pos.z - p.pos.z);
      out.push({ near, html: `<b>${d.name}</b>: $${fmt(p.remaining)} · ${near.toFixed(1)} m away${p.docked ? ' · <b>on it</b>' : ''}` });
    }
  }
  out.sort((a, b) => a.near - b.near);
  $('#live').innerHTML = out.length ? out.slice(0, 3).map((o) => o.html).join('<br>') : 'Every pad here is bought.';
}
setInterval(live, 300);

$('#scen').addEventListener('click', (e) => {
  const b = e.target.closest('.btn'); if (!b) return;
  scen = b.dataset.s;
  for (const x of $('#scen').children) x.classList.toggle('on', x === b);
  boot(true);
});
$('#cash').onclick = () => { G()?.giveCash(5000); frame.contentWindow?.focus(); };
$('#broke').onclick = async () => {
  const st = await frame.contentWindow?.Function("return import('/src/core/state.js')")();
  if (st) st.state.cash = 0;
  frame.contentWindow?.focus();
};
$('#reset').onclick = () => boot(true);
boot(true);
