// Upgrade boards proposal page: mounts the board mock into the phone screens and wires the cash buttons.
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import { ICON } from '/src/ui/icons.js';
import { mountBoard } from './board.js';

const G_LEVELS = { speed: 2, capacity: 1, repair: 2, supply: 0, price: 1 };
const SETUPS = {
  garage: { shop: 'garage', cash: 700, owned: ['station_oil', 'lift1', 'station_battery', 'mechanic0', 'lift2'], levels: G_LEVELS },
  paint: { shop: 'paint', cash: 7500, owned: ['paint_lime', 'painter0', 'paint_teal'], levels: { speed: 6, capacity: 6, repair: 6, supply: 6, price: 6 } },
  boost: { shop: 'garage', cash: 700, owned: ['station_oil', 'lift1', 'station_battery', 'mechanic0', 'lift2'], levels: G_LEVELS, tab: 'boost' },
};

function reveal(screen) {
  return (u) => {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = u.label;
    const g = document.createElement('div');
    g.className = 'glide'; g.innerHTML = `${ICON.camera}<span>camera glides to it, it pops in</span>`;
    screen.append(g);
    setTimeout(() => screen.append(t), 350);
    setTimeout(() => { g.remove(); t.remove(); }, 2300);
  };
}

const boards = {};
for (const [key, set] of Object.entries(SETUPS)) {
  const screen = document.getElementById('ph-' + key);
  const hud = document.createElement('span');
  hud.className = 'hud-cash';
  screen.append(hud);
  const short = (n) => (n >= 1e4 ? +(n / 1e3).toFixed(n % 1e3 ? 1 : 0) + 'K' : n >= 1e3 ? +(n / 1e3).toFixed(1) + 'K' : String(n));
  boards[key] = mountBoard(screen, {
    ...set, owned: [...set.owned], onReveal: reveal(screen),
    onChange: (st) => { hud.innerHTML = `${ICON.cash}<b>${short(st.cash)}</b>`; },
  });
}
document.querySelectorAll('.ctl').forEach((c) => {
  const b = boards[c.dataset.for];
  c.querySelectorAll('[data-add]').forEach((btn) => btn.addEventListener('click', () => b.setCash(b.state.cash + +btn.dataset.add)));
  c.querySelector('[data-reset]').addEventListener('click', () => { const s = SETUPS[c.dataset.for]; b.reset({ ...s, owned: [...s.owned] }); });
});
document.querySelectorAll('[data-ico]').forEach((e) => { e.innerHTML = ICON[e.dataset.ico]; });
