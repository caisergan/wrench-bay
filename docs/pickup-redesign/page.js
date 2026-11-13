// Design page: the flat mat gallery, the "1 tyre + 1 oil" storyboard, the cases table and the Try-it frame.
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import { ICON } from '/src/ui/icons.js';
import { paintMatFace, iconImage } from '/src/models/mat-face.js';

const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- mat gallery (drawn by the game's own mat painter)
const STATION = [
  ['Idle', 'No lift needs it.', { state: 'idle' }],
  ['Needed', 'A lift waits for it and you have a free hand. Pulses gently.', { state: 'want' }],
  ['On it', 'You stand on it and the needed parts fly into your hands.', { state: 'on' }],
  ['Got it', 'You hold what the lifts need from this shelf.', { state: 'on', check: true }],
  ['One more?', 'Standing still: the ring fills, then one extra part.', { state: 'on', check: true, prog: 0.62 }],
  ['Shelf empty', 'Restocking. Nothing to take.', { state: 'empty' }],
];
const LIFT = [
  ['Waiting', 'A car is on the lift. You hold nothing it needs.', { state: 'idle' }],
  ['You have it', 'Something in your hands is a part this car needs.', { state: 'want' }],
  ['Working', 'You stand on it: parts go in, you repair.', { state: 'on' }],
];
function gallery(id, rows, kind, icon, w, d) {
  const box = document.getElementById(id);
  const draws = [];
  for (const [name, text, o] of rows) {
    const cv = document.createElement('canvas');
    cv.width = w * 200; cv.height = d * 200;
    const cell = el(`<div class="matcell"><div class="floor"></div><b>${name}</b><span>${text}</span></div>`);
    cell.firstChild.append(cv);
    box.append(cell);
    const draw = () => paintMatFace(cv.getContext('2d'), cv.width, cv.height, { kind, icon, round: true, ...o });
    draws.push(draw);
    draw();
  }
  iconImage(icon).addEventListener('load', () => draws.forEach((f) => f()), { once: true });
}
gallery('stationMats', STATION, 'station', 'tire', 1.3, 0.95);
gallery('liftMats', LIFT, 'lift', 'wrench', 1.5, 1.0);

// ---------------------------------------------------------------- storyboard: lift wants 1 tyre + 1 oil, 3 hands
function board(id, kind) {
  const b = document.getElementById(id);
  const zone = (x, key) => kind === 'today'
    ? `<div class="zone box" style="left:${x}%"></div>`
    : `<div class="zone mat" data-k="${key}" style="left:${x}%"><s class="tk">${ICON.check}</s></div>`;
  const plan = el(`<div class="plan">
    <div class="wall"></div>
    <div class="shelf" style="left:25%">${ICON.tire}</div><div class="shelf" style="left:50%">${ICON.oil}</div><div class="shelf" style="left:75%">${ICON.battery}</div>
    ${zone(25, 'tire')}${zone(50, 'oil')}${zone(75, 'battery')}
    ${kind === 'today'
      ? '<div class="zone box" style="left:50%;top:160px;width:104px;height:56px;margin-left:-52px"></div>'
      : '<div class="zone mat" data-k="lift" style="left:50%;top:174px;width:64px;height:34px;margin-left:-32px"></div>'}
    <div class="car"></div>
    <div class="pl"></div><div class="bad"></div></div>`);
  b.append(plan);
  const need = el(`<div class="hands"><span>Lift needs</span><s class="full" data-n="tire">${ICON.tire}</s><s class="full" data-n="oil">${ICON.oil}</s></div>`);
  const hands = el('<div class="hands"><span>Hands</span><s></s><s></s><s></s></div>');
  const cap = el('<div class="cap"></div>');
  b.append(need, hands, cap);
  const pl = plan.querySelector('.pl'), bad = plan.querySelector('.bad');
  const slots = [...hands.querySelectorAll('s')];
  const mats = Object.fromEntries([...plan.querySelectorAll('.zone.mat')].map((m) => [m.dataset.k, m]));
  let held = [], pos = [50, 0];
  const api = {
    at(x, y) { pos = [x, y]; pl.style.left = x + '%'; pl.style.top = y + 'px'; },
    hands(list) {
      held = list;
      slots.forEach((s, i) => {
        const t = list[i];
        const was = s.dataset.t || '';
        s.dataset.t = t || '';
        s.className = t ? 'full' : '';
        s.innerHTML = t ? ICON[t] : '';
        if (t && t !== was) { void s.offsetWidth; s.classList.add('pop'); }
      });
    },
    take(t) { api.hands([...held, t]); },
    got(t) { const s = need.querySelector(`[data-n="${t}"]`); s.style.background = '#bfe9cc'; s.style.boxShadow = 'inset 0 0 0 2px #3fb36b'; },
    resetNeed() { for (const s of need.querySelectorAll('s')) { s.style.background = ''; s.style.boxShadow = ''; } },
    say(html) { cap.innerHTML = html; },
    badge(text, good = false) { bad.style.left = pos[0] + '%'; bad.style.top = pos[1] - 44 + 'px'; bad.textContent = text; bad.classList.toggle('good', good); bad.classList.toggle('on', !!text); },
    mat(k, state, tick = false) {
      const m = mats[k]; if (!m) return;
      m.classList.toggle('want', state === 'want'); m.classList.toggle('on', state === 'on');
      m.querySelector('.tk')?.classList.toggle('on', tick);
    },
  };
  return api;
}

const T = board('bToday', 'today'), P = board('bProp', 'prop');
async function story() {
  const START = [88, 252], TYRE_BOX = [25, 98], OIL_BOX = [50, 98], LIFT_BOX = [50, 188];
  const TYRE_MAT = [25, 74], OIL_MAT = [50, 74], LIFT_MAT = [50, 191];
  for (;;) {
    for (const b of [T, P]) { b.hands([]); b.resetNeed(); b.badge(''); b.at(...START); }
    P.mat('tire', 'want'); P.mat('oil', 'want'); P.mat('battery', 'idle'); P.mat('lift', 'idle');
    T.say('The lift needs <b>1 tyre and 1 oil</b>. You have 3 hands.');
    P.say('The lift needs <b>1 tyre and 1 oil</b>. Both mats glow.');
    await sleep(1800);
    // 1. tyre
    T.at(...TYRE_BOX); P.at(...TYRE_MAT);
    T.say('Into the tyre box…'); P.say('Onto the tyre mat…');
    await sleep(750);
    P.mat('tire', 'on');
    for (let i = 0; i < 3; i++) {
      T.take('tire');
      if (i === 0) P.take('tire');
      await sleep(140);
    }
    P.mat('tire', 'on', true);
    T.badge('MAX');
    T.say('…<b>3 tyres in 0.4 s</b>, faster than you can step off.');
    P.say('…<b>1 tyre</b>, the tick says that\'s all the lift needs. The mat stops.');
    await sleep(2300);
    // 2. oil
    T.at(...OIL_BOX); P.at(...OIL_MAT); P.mat('tire', 'idle');
    T.badge(''); T.say('Oil box: <b>no free hand</b>. Nothing happens.');
    P.say('Oil mat…');
    await sleep(750);
    T.badge('Hands full');
    P.mat('oil', 'on'); P.take('oil'); await sleep(200); P.mat('oil', 'on', true);
    P.say('…<b>1 oil</b>. One hand is still free.');
    await sleep(2100);
    // 3. lift
    T.badge(''); T.at(...LIFT_BOX); P.at(...LIFT_MAT); P.mat('oil', 'idle'); P.mat('lift', 'want');
    T.say('To the lift…'); P.say('To the lift…');
    await sleep(800);
    P.mat('lift', 'on');
    T.hands(['tire', 'tire']); T.got('tire');
    await sleep(160);
    P.hands(['oil']); P.got('tire'); await sleep(160); P.hands([]); P.got('oil');
    T.badge('Oil still missing');
    P.badge('Fixed!', true);
    T.say('The lift takes 1 tyre. <b>The oil is still missing</b> and you carry 2 tyres nobody wants (scrap bin or back to the shelf).');
    P.say('The lift gets both. <b>The car is done</b> on the first trip.');
    await sleep(3600);
  }
}
story();

// ---------------------------------------------------------------- cases table
const I = (n) => `<span class="ico">${ICON[n]}</span>`;
const CASES = [
  [`${I('tire')} + ${I('oil')}`, `<span class="no">${I('tire')}${I('tire')}${I('tire')}, no oil</span>`, `<span class="yes">${I('tire')} then ${I('oil')}, a hand to spare</span>`],
  [`${I('tire')}${I('tire')}${I('tire')} + ${I('oil')}`, `<span class="no">${I('tire')}${I('tire')}${I('tire')}, no oil</span>`, `<span class="yes">${I('tire')}${I('tire')} then ${I('oil')} (one hand kept for the oil)</span>`],
  [`${I('tire')} ${I('oil')} ${I('battery')} ${I('engine')}`, `<span class="no">${I('tire')}${I('tire')}${I('tire')}</span>`, `<span class="yes">${I('tire')} ${I('oil')} ${I('battery')}; the engine kit on the next trip</span>`],
  [`${I('tire')}${I('tire')}, a mechanic is fetching one`, `<span class="no">${I('tire')}${I('tire')}${I('tire')}</span>`, `<span class="yes">${I('tire')}</span>`],
  ['Nothing (stocking up early)', '3 parts in 0.4 s', '1 part a second while you stand still'],
];
const tb = document.querySelector('#cases tbody');
for (const r of CASES) tb.append(el(`<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`));

// ---------------------------------------------------------------- try it
const SLOT = 'pickup-try';
const frame = document.getElementById('game');
const live = document.getElementById('live');
let ready = false, random = false;

function freshSave() {
  localStorage.setItem('wrench-bay-save-v1:' + SLOT, JSON.stringify({
    cash: 3000, gems: 25, shopLevel: 0, unlocked: ['lift1', 'station_oil', 'station_battery', 'valet'],
    upgrades: { speed: 0, capacity: 0, repair: 0, supply: 0, price: 0 }, tutorialDone: true, lastSeen: Date.now(),
  }));
}
async function boot() {
  ready = false;
  live.textContent = 'Loading the game…';
  freshSave();
  frame.src = `/?autoplay&save=${SLOT}&view=mobile&t=${Date.now()}`;
  await new Promise((r) => frame.addEventListener('load', r, { once: true }));
  const w = frame.contentWindow;
  // the first random car comes 1.2 s after the world starts: switch the spawner off before that
  for (let i = 0; i < 400 && !(w.__game && w.__game.world && w.__game.player); i++) await sleep(25);
  w.__game.world.cars.paused = !random;
  ready = true;
}
function game() { return ready && frame.contentWindow.__game; }
function play() { frame.focus(); frame.contentWindow?.focus(); }

const CARS = [['tire', 'oil'], ['tire', 'tire', 'oil'], ['tire', 'oil', 'battery'], ['battery']];
const carsRow = document.getElementById('cars');
for (const p of CARS) {
  const b = el(`<button class="btn">${p.map((t) => ICON[t]).join('')}</button>`);
  b.title = p.join(' + ');
  b.onclick = () => { const g = game(); if (g) g.spawnCar({ problems: p }); play(); };
  carsRow.append(b);
}
document.getElementById('empty').onclick = () => { const g = game(); if (g) g.player.stack.clear(); play(); };
document.getElementById('random').onclick = (e) => {
  random = !random; e.currentTarget.textContent = 'Random cars: ' + (random ? 'on' : 'off');
  const g = game(); if (g) g.world.cars.paused = !random;
  play();
};
document.getElementById('reset').onclick = () => boot();

const chip = (t, n) => `<span class="chip">${ICON[t] ? `<span class="ico">${ICON[t]}</span>` : ''}${n > 1 ? '×' + n : ''}</span>`;
setInterval(() => {
  const g = game(); if (!g) return;
  const pl = g.player;
  const hands = pl.stack.items.map((i) => i.userData.partType);
  const need = {};
  for (const l of g.lifts) if (l && l.car && ['snap', 'raise', 'up'].includes(l.phase)) for (const j of l.car.jobs) if (j.state === 'need' && !j.incoming) need[j.type] = (need[j.type] || 0) + 1;
  const needHtml = Object.keys(need).length ? Object.entries(need).map(([t, n]) => chip(t, n)).join('') : '<i>nothing</i>';
  live.innerHTML = `<b>Hands (${hands.length}/${pl.capacity()}):</b> ${hands.length ? hands.map((t) => chip(t, 1)).join('') : '<i>empty</i>'}<br>
    <b>Lifts still need:</b> ${needHtml}`;
}, 250);

boot();
