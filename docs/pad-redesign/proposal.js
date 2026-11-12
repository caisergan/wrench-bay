// Mock-ups for the building-pad proposal: the new ground tag + pay dock drawn over real game screenshots.
// Screen coordinates are in the game's 473 x 990 portrait space (measured with worldToScreen in the running game).
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import { ICON } from '/src/ui/icons.js';

const W = 473, H = 990;
const LOCK = ICON.lock, UP = ICON.arrowUp, STAR = ICON.star, CASH = ICON.cash;
const fmt = (n) => (n >= 1e6 ? +(n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1000 ? +(n / 1000).toFixed(n % 1000 && n < 1e5 ? 1 : 0) + 'K' : String(Math.round(n)));
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the two new pieces
/** Ground tag, centred on the pad. k: buy | up | lock. near: shows the name (+ level). paid: 0..1 part payment. */
function tag({ k = 'buy', icon, name, lv, price, fame, near = false, paid = 0 }) {
  const badge = k === 'up' ? `<s class="gt-badge">${UP}</s>` : k === 'lock' ? `<s class="gt-badge">${LOCK}</s>` : '';
  const right = k === 'lock' ? `<span class="gt-p">${STAR}${fame}</span>` : `<span class="gt-p">$${fmt(price * (1 - paid))}</span>`;
  const t = el(`<div class="gt${near ? ' near' : ''}${paid > 0 ? ' part' : ''}" data-k="${k}">
    <span class="gt-i">${icon}${badge}</span><span class="gt-name">${name}</span>${lv ? `<span class="gt-lv">Lv ${lv}</span>` : ''}
    <span class="gt-sep"></span>${right}<span class="gt-bar"><i style="transform:scaleX(${paid})"></i></span></div>`);
  return t;
}
function placeTag(t, p) { t.style.left = p.x + 'px'; t.style.top = p.y + 5 + 'px'; return t; }

/** Pay dock. k: buy | up | lock | done. */
function dock(o) {
  const { k = 'buy', icon, name, rib, what, levels = 1, owned = 0, price, paid = 0, fame = 0, fameNow = 0, note, hint = 'Stand to pay' } = o;
  const pips = levels > 1 ? `<span class="dk-pips">${Array.from({ length: levels }, (_, i) => `<i class="${i < owned ? 'on' : i === owned ? 'next' : ''}"></i>`).join('')}</span>` : '';
  let pay;
  if (k === 'lock') {
    const p = Math.min(1, fameNow / fame);
    pay = `<div class="dk-bar" style="--p:${p}"><i></i><span>${STAR}Fame ${Math.floor(fameNow)} / ${fame}<em>${fame - Math.floor(fameNow)} to go</em></span></div>
      <span class="dk-price">${CASH}$${fmt(price)}</span>`;
  } else if (k === 'done') {
    pay = `<div class="dk-bar" style="--p:1"><i></i><span>${ICON.check}Bought!</span></div>`;
  } else {
    const left = price * (1 - paid);
    pay = `<div class="dk-bar" style="--p:${paid}"><i></i><span>${CASH}<b class="dk-amt">$${fmt(left)}</b><em class="dk-em">${paid > 0 ? 'left' : ''}</em></span></div>` +
      (fame ? `<span class="dk-req ${fameNow >= fame ? '' : 'no'}">${STAR}Fame ${fame}${fameNow >= fame ? ' ✓' : ''}</span>` : '');
  }
  return el(`<div class="dock" data-k="${k}">
    <span class="dk-rib">${rib}</span>${hint ? `<span class="dk-hint">${hint}</span>` : ''}
    <div class="dk-top"><div class="dk-ic">${icon}${k === 'lock' ? `<s class="lockb">${LOCK}</s>` : ''}</div>
      <div><div class="dk-name">${name}${pips}</div><div class="dk-what">${what}</div></div></div>
    <div class="dk-pay">${pay}</div>${note ? `<div class="dk-note">${note}</div>` : ''}</div>`);
}

// ---------------------------------------------------------------- data
const TOW = { icon: ICON.tow, name: 'Tow Truck' };
const TOW_UP = { ...TOW, k: 'up', lv: 2, price: 15000 };
const TOW_DOCK = { ...TOW, k: 'up', rib: 'UPGRADE · LV 2', what: '<b>Heavy wrecker:</b> faster, better-paid rescues', levels: 3, owned: 1, price: 15000, fame: 6, fameNow: 6 };
const VIP = { icon: ICON.crown, name: 'Platinum Club' };

// before-shot callouts { x, y, w, h, label, dash, below }
const CALLOUTS = {
  tow: [
    { x: 200, y: 302, w: 148, h: 130, label: 'Card on the bay', below: true },
    { x: 212, y: 128, w: 108, h: 170, label: 'Door', dash: true, inside: true },
  ],
  garden: [
    { x: 88, y: 114, w: 162, h: 126, label: 'Over the Lounge sign', below: true },
    { x: 122, y: 338, w: 132, h: 112, label: 'Over Suds & Shine', below: true },
  ],
  vip: [
    { x: 116, y: 304, w: 136, h: 140, label: 'Over its sign' },
    { x: 222, y: 384, w: 50, h: 30, label: 'Fame 8 spills', dash: true, below: true },
  ],
};

// scenes: background image + overlays
const SCENES = {
  towFar(s) { bg(s, 'img/tow-far.jpg'); s.append(placeTag(tag(TOW_UP), { x: 336.6, y: 397.4 })); },
  towNear(s) { bg(s, 'img/tow-near.jpg'); s.append(placeTag(tag({ ...TOW_UP, near: true }), { x: 265.6, y: 456.8 })); },
  towOn(s) { bg(s, 'img/tow-onpad.jpg'); s.append(dock({ ...TOW_DOCK, paid: 0.38 })); },
  garden(s) {
    bg(s, 'img/garden-clean.jpg');
    s.append(placeTag(tag({ icon: ICON.lounge, name: 'Harbor Lounge', price: 6000 }), { x: 155.7, y: 266.3 }));
    s.append(placeTag(tag({ icon: ICON.wash, name: 'Car Wash', price: 3500, near: true }), { x: 190.5, y: 481.2 }));
  },
  vipNear(s) { bg(s, 'img/vip-near.jpg'); s.append(placeTag(tag({ ...VIP, k: 'lock', fame: 8, near: true }), { x: 184.4, y: 467.5 })); },
  vipOn(s) {
    bg(s, 'img/vip-onpad.jpg');
    s.append(dock({ ...VIP, k: 'lock', rib: 'LOCKED', what: 'VIP area: luxury cars, white-glove service, big money', price: 60000, fame: 8, fameNow: 6.4,
      hint: '', note: 'Earn fame with repairs, rescues and VIP jobs. Fame 8 opens it.' }));
  },
  flow(s) { flow(s); },
};

function bg(s, src) { const i = el(`<img class="bg" alt="">`); i.src = src; s.append(i); return i; }

// ---------------------------------------------------------------- the live walk-up loop
async function flow(s) {
  const far = bg(s, 'img/tow-far.jpg'), near = bg(s, 'img/tow-near.jpg'), on = bg(s, 'img/tow-onpad.jpg');
  const show = (img) => { for (const i of [far, near, on]) i.style.opacity = i === img ? 1 : 0; };
  const t = tag(TOW_UP); s.append(t);
  const d = dock(TOW_DOCK); d.classList.add('out'); s.append(d);
  const toast = el('<div class="toast">Heavy wrecker! Faster, better paid rescues</div>'); s.append(toast);
  const poof = el('<div class="poof"></div>'); s.append(poof);
  const phase = el('<div class="phase"></div>'); s.append(phase);
  const bar = d.querySelector('.dk-bar'), amt = d.querySelector('.dk-amt'), em = d.querySelector('.dk-em'), rib = d.querySelector('.dk-rib'), hint = d.querySelector('.dk-hint');
  const reset = () => {
    d.dataset.k = 'up'; rib.textContent = 'UPGRADE · LV 2'; hint.textContent = 'Stand to pay';
    bar.style.setProperty('--p', 0); amt.textContent = '$15K'; em.textContent = '';
  };
  for (;;) {
    reset();
    show(far); placeTag(t, { x: 336.6, y: 397.4 }); t.classList.remove('near', 'gone'); phase.textContent = 'Far: icon + price'; phase.hidden = false;
    await sleep(2200);
    show(near); placeTag(t, { x: 265.6, y: 456.8 }); await sleep(250); t.classList.add('near'); phase.textContent = 'Close: + name and level';
    await sleep(2300);
    show(on); t.classList.add('gone'); phase.hidden = true;
    await sleep(250); d.classList.remove('out');
    await sleep(700);
    hint.textContent = 'Paying…';
    const T = 1400, t0 = performance.now();
    for (;;) {
      const k = Math.min(1, (performance.now() - t0) / T);
      bar.style.setProperty('--p', k); amt.textContent = '$' + fmt(Math.round(15000 * (1 - k) / 100) * 100); em.textContent = 'left';
      if (k >= 1) break;
      await sleep(30);
    }
    d.dataset.k = 'done'; rib.textContent = 'BOUGHT!'; hint.textContent = ''; amt.textContent = 'Heavy wrecker is yours'; em.textContent = '';
    poof.style.left = '236px'; poof.style.top = '520px'; poof.classList.remove('go'); void poof.offsetWidth; poof.classList.add('go');
    toast.classList.add('on');
    await sleep(1100);
    d.classList.add('out');
    await sleep(1500);
    toast.classList.remove('on');
    await sleep(900);
  }
}

// ---------------------------------------------------------------- build the page
for (const ph of document.querySelectorAll('.phone')) {
  const s = el('<div class="screen"></div>');
  ph.append(s);
  if (ph.dataset.img) {
    const i = bg(s, ph.dataset.img);
    if (ph.dataset.w) { s.style.width = W + 'px'; s.style.height = H + 'px'; i.style.objectFit = 'cover'; }
  }
  if (ph.dataset.callouts) for (const c of CALLOUTS[ph.dataset.callouts]) {
    const b = el(`<div class="co${c.dash ? ' dash' : ''}${c.below ? ' below' : ''}${c.inside ? ' inside' : ''}"><span>${c.label}</span></div>`);
    Object.assign(b.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
    s.append(b);
  }
  if (ph.dataset.scene) SCENES[ph.dataset.scene](s);
  new ResizeObserver(() => s.style.setProperty('--k', ph.clientWidth / W)).observe(ph);
}

// state gallery
const tags = document.getElementById('tags');
const TAGS = [
  ['Buy, far', { icon: ICON.tow, name: 'Tow Truck', price: 1500 }],
  ['Buy, close', { icon: ICON.tow, name: 'Tow Truck', price: 1500, near: true }],
  ['Upgrade, far', TOW_UP],
  ['Upgrade, close', { ...TOW_UP, near: true }],
  ['Locked, far', { ...VIP, k: 'lock', fame: 8 }],
  ['Locked, close', { ...VIP, k: 'lock', fame: 8, near: true }],
  ['Part-paid (kept)', { icon: ICON.paintShop, name: 'Spray Bay', price: 12000, paid: 0.4 }],
  ['Main Street gate', { icon: ICON.map, name: 'Main Street', price: 20000, near: true }],
];
for (const [lbl, o] of TAGS) {
  const c = el(`<div class="tagcell"><div class="pad"></div><span class="lbl">${lbl}</span></div>`);
  c.append(tag(o));
  tags.append(c);
}
const docks = document.getElementById('docks');
const DOCKS = [
  ['<b>Buy.</b> First level: the building itself.', { icon: ICON.wash, name: 'Car Wash', rib: 'FOR SALE', what: 'Every car leaving the garage pays for a wash', levels: 3, owned: 0, price: 3500 }],
  ['<b>Upgrade, paying.</b> The bar fills as the cash drains in.', { ...TOW_DOCK, paid: 0.6, hint: 'Paying…' }],
  ['<b>Not enough cash.</b> What you paid stays on the pad.', { icon: ICON.paintShop, name: 'Spray Bay', rib: 'FOR SALE', what: 'Paint shop: respray cars in the colour they ask for', price: 12000, paid: 0.4, fame: 3, fameNow: 6, hint: '', note: 'You\'re out of cash. The $4.8K you paid is kept here.' }],
  ['<b>Locked.</b> Shows the fame you need and how close you are.', { ...VIP, k: 'lock', rib: 'LOCKED', what: 'VIP area: luxury cars, white-glove service, big money', price: 60000, fame: 8, fameNow: 6.4, hint: '' }],
  ['<b>Bought.</b> Flashes for a moment, then slides away.', { ...TOW_DOCK, k: 'done', rib: 'BOUGHT!', hint: '' }],
];
for (const [lbl, o] of DOCKS) {
  const c = el(`<div class="dockcell"><div class="lbl">${lbl}</div></div>`);
  const d = dock(o);
  if (o.k === 'done') d.querySelector('.dk-bar span').innerHTML = `${ICON.check}Heavy wrecker is yours`;
  c.append(d);
  docks.append(c);
}
