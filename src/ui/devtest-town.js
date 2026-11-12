// Dev-only (?nogame&uitest): samples of every Harbor Town label kind, pointer, chip, hint, banner, panel and moment, with
// a small button bar. Town state is mocked (townstate.setMock) so none of it needs the core helpers or a real save.
//   ?uitest&town            start with the mocked town open (fame badge, map button)
//   ?uitest&open=fame|map|pro|academy|complete|ferry|levelup|perfect|missions   open that panel right after PLAY
//   ?uitest&ptr=3|6         start with 3 / 6 pointers
import { events } from '../core/events.js';
import { onUpdate } from '../core/engine.js';
import { state } from '../core/state.js';
import { setMock } from './townstate.js';

const MOCK = () => ({
  townOpen: true, garageDone: false,
  fame: { level: 4, xp: 38, need: 100, frac: 0.38 },
  props: { tow: 1, wash: 2, lounge: 0, paint: 1, diner: 0 },
  districts: { main: false },
  classics: ['bubble', 'woody'], wrenches: ['w01', 'w02', 'w03', 'w05'],
  tills: { diner: 120 }, managers: ['garage'], pro: { stock: 2, crew: 1, tips: 6 }, stats: { rescues: 0, resprays: 0, vipPerfect: 0, restored: 0 },
  progress: { done: 7, total: 32, next: { name: 'Harbor Lounge' } },
});

export function runTown(ui, V) {
  const q = new URLSearchParams(location.search);
  const J = (type, s, extra = {}) => ({ type, state: s, ...extra });

  // ---------------------------------------------------------------- new label kinds
  // job bubbles: canister tiles, gold tiles, bonus ribbon
  const jobs = [
    { pos: V(-4.3, 2.4, -7), jobs: [J('spray', 'need', { color: '#e63946' }), J('spray', 'need', { color: '#e63946' })], pat: 0.8 },
    { pos: V(-1.4, 2.4, -7), jobs: [J('spray', 'done', { color: '#2a9d8f' }), J('spray', 'ready', { color: '#2a9d8f' }), J('spray', 'need', { color: '#f6c453' })], pat: 0.5, prog: 0.5 },
    { pos: V(1.8, 2.4, -7), jobs: [{ gold: true, state: 'need' }, { gold: true, type: 'tire', state: 'ready' }, { gold: true, type: 'engine', state: 'done' }], pat: 0.7, vip: true, prog: 0.4 },
    { pos: V(4.6, 2.4, -7), jobs: [J('tire', 'need'), J('oil', 'need'), J('battery', 'need')], pat: 0.9, bonus: 'Rescue x2.5' },
  ];
  const liveJobs = [];
  for (const j of jobs) {
    const l = ui.label({ kind: 'job', worldPos: j.pos });
    l.setJobs(j.jobs).setVip(!!j.vip);
    l.setPatience(j.pat);
    if (j.bonus) l.setBonus(j.bonus);
    if (j.prog) { l.setProgress(j.prog); liveJobs.push(l); }
  }

  // building pad tags (lie on the pad): buy far / close, part-paid, locked by fame, upgrade close
  const tagInfo = [
    { pos: V(-4.4, 0.02, 6), info: { name: 'Car Wash', icon: 'wash', price: 3500, fame: 0, level: 1 }, p: 0.0 },
    { pos: V(0.2, 0.02, 6), info: { name: 'Harbor Lounge', icon: 'lounge', price: 6000, fame: 2, level: 1 }, p: 0.62, near: true },
    { pos: V(4.6, 0.02, 6), info: { name: 'Platinum Club', icon: 'crown', price: 60000, fame: 8, locked: true, reason: 'fame', level: 1 }, p: 0, near: true },
    { pos: V(-2.2, 0.02, 10), info: { name: 'Tow Truck', icon: 'tow', price: 15000, fame: 6, level: 2 }, p: 0.25, near: true },
  ];
  const sales = tagInfo.map((s) => { const l = ui.label({ kind: 'tag', worldPos: s.pos }); l.setInfo(s.info); l.setProgress(s.p); l.setNear(!!s.near); return l; });
  // pay dock samples (cycled by the 'dock' button)
  const DOCKS = [
    ['buy', { kind: 'buy', icon: 'wash', name: 'Car Wash', rib: 'FOR SALE', what: 'Every car leaving the garage pays for a wash', levels: 3, owned: 0, price: 3500 }, { price: 3500, remaining: 3500 }],
    ['up', { kind: 'up', icon: 'tow', name: 'Tow Truck', rib: 'UPGRADE · LV 2', title: 'Heavy wrecker', what: 'faster, better paid rescues', levels: 3, owned: 1, price: 15000, fame: 6, fameOk: true }, { price: 15000, remaining: 6000, paying: true }],
    ['broke', { kind: 'buy', icon: 'paintShop', name: 'Spray Bay', rib: 'FOR SALE', what: 'Paint shop: respray cars in the colour they ask for', levels: 1, owned: 0, price: 12000, fame: 3, fameOk: true }, { price: 12000, remaining: 7200, broke: true }],
    ['lock', { kind: 'lock', icon: 'crown', name: 'Platinum Club', rib: 'LOCKED', what: 'VIP area: luxury cars, white-glove service, big money', levels: 1, owned: 0, price: 60000, fame: 8, lockText: 'Fame 4 / 8', lockLeft: '4 to go', lockP: 0.55 }, null],
  ];
  let dockI = -1;
  const nextDock = () => {
    dockI = (dockI + 1) % (DOCKS.length + 2);
    if (dockI === DOCKS.length) { ui.payDock.done('dev', 'Heavy wrecker!'); return; }
    if (dockI === DOCKS.length + 1) { ui.payDock.hide(); return; }
    const [, info, st] = DOCKS[dockI];
    ui.payDock.show('dev', info);
    if (st) ui.payDock.update('dev', st);
  };

  // tills, timers, call, stars
  const till1 = ui.label({ kind: 'till', text: 1240, worldPos: V(-4.5, 0.6, 12.5) });
  till1.setProgress(0.45);
  const till2 = ui.label({ kind: 'till', text: 5600, worldPos: V(-1.5, 0.6, 12.5) });
  till2.setProgress(1);
  const timers = [0, 1, 2].map((i) => {
    const l = ui.label({ kind: 'timer', text: '', worldPos: V(1.2 + i * 2.2, 1.8, 12.5) });
    if (i === 1) l.setIcon('paint');
    return l;
  });
  const call = ui.label({ kind: 'call', text: 'Rescue call', worldPos: V(-3.2, 2.4, 14.5) });
  const call2 = ui.label({ kind: 'call', worldPos: V(2.6, 2.4, 14.5) });
  const starSets = [[], [true, null, null], [true, true, false], [true, true, true]];
  const stars = starSets.map((a, i) => { const l = ui.label({ kind: 'stars', worldPos: V(-4.5 + i * 3, 2.6, 17) }); l.setStars(a); return l; });
  ui.label({ kind: 'bogus-kind', text: 'unknown kind', worldPos: V(4.8, 2, 17) }).setStars([true]).setJobs([]).setInfo({}).setBonus('x');   // must not throw

  let t = 0;
  onUpdate((dt) => {
    t += dt;
    timers.forEach((l, i) => l.setProgress(1 - (((t * 0.12) + i * 0.33) % 1)));
    call.setProgress(1 - ((t * 0.08) % 1));
    call2.setProgress(0.15);
    liveJobs.forEach((l, i) => l.setProgress((t * 0.35 + i * 0.4) % 1));
    sales[1].setProgress(0.4 + 0.5 * Math.abs(Math.sin(t * 0.4)));
    sales[3].setProgress((t * 0.2) % 1);
    till1.setProgress((t * 0.1) % 1);
  });
  setInterval(() => { stars[0].setStars([true, null, null].map((v, i) => (Math.floor(Date.now() / 1500) % 4 > i ? true : null))); }, 700);

  // ---------------------------------------------------------------- pointers
  const spots = {
    rescue: V(-26, 0, -4), vehicle: V(30, 0, 6), sale: V(3, 0, -40), cash: V(-34, 0, 30), alert: V(26, 0, 34), goal: V(-22, 0, -34),
  };
  const texts = { rescue: 'Rescue', vehicle: 'Tow truck', sale: '$3.5K', cash: 'Till $1.2K', alert: 'Garage!', goal: 'Tow shed' };
  let ptrs = [];
  function setPtrs(kinds) {
    ptrs.forEach((p) => p.remove());
    ptrs = kinds.map((k) => ui.pointer({ kind: k, text: texts[k], worldPos: spots[k] }));
  }
  const orbit = ui.pointer({ kind: 'goal', text: 'Orbit', worldPos: V(0, 0, 0) });
  orbit.setVisible(false);
  let orbitOn = false;
  onUpdate(() => {
    if (!orbitOn) return;
    const a = performance.now() / 2500, r = 6 + 22 * (0.5 + 0.5 * Math.sin(performance.now() / 4000));
    orbit.setPos(V(Math.cos(a) * r * 0.7, 0, Math.sin(a) * r));
  });

  // ---------------------------------------------------------------- town on / off
  let townOn = false;
  function town(on) {
    townOn = on;
    if (on) {
      setMock(MOCK());
      events.emit('town:opened');
      events.emit('fame:changed', { xp: 38, level: 4, frac: 0.38, delta: 0 });
    } else {
      setMock(null);
      events.emit('shop:changed', {});
    }
  }
  if (q.has('town') || q.get('open')) town(true);
  const fameXp = { n: 38 };

  // ---------------------------------------------------------------- button bar
  const bar = document.createElement('div');
  bar.setAttribute('data-ui', '');
  bar.style.cssText = 'position:absolute;left:0;right:0;bottom:0;z-index:30;display:flex;flex-wrap:wrap;gap:3px;padding:4px;pointer-events:auto;background:rgba(20,35,44,.82);font:600 11px Fredoka,system-ui;';
  const mk = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label; b.setAttribute('data-ui', '');
    b.style.cssText = 'padding:3px 7px;border-radius:8px;background:#fff6e6;color:#2f4858;font:inherit;border:0;';
    b.addEventListener('click', fn); bar.appendChild(b); return b;
  };
  const shown = { hint: false, chip: false, chip2: false };
  mk('hide bar', () => { bar.style.display = 'none'; window.__ui.bar = bar; });
  mk('town', () => town(!townOn));
  mk('fame', () => ui.openFame());
  mk('map', () => ui.openMap());
  mk('pro', () => (document.querySelector('.sheet.pro.open') ? ui.closeProGear() : ui.openProGear()));
  mk('academy', () => (document.querySelector('.sheet.academy.open') ? ui.closeAcademy() : ui.openAcademy()));
  mk('garage!', () => ui.showGarageComplete());
  mk('ferry', () => ui.showFerry(() => ui.toast('Sailing!')));
  mk('lvl-up', () => ui.levelUp(5, [{ kind: 'car', label: 'SUVs' }, { kind: 'property', label: 'Harbor Lounge', level: 1 }, { kind: 'district', label: 'Main Street' }]));
  mk('perfect', () => ui.perfect(4200));
  mk('xp+', () => { fameXp.n += 12; events.emit('fame:changed', { xp: fameXp.n, level: 4, frac: Math.min(1, (fameXp.n % 100) / 100), delta: 12 }); });
  mk('banner', () => ui.banner('Rush hour!', 3));
  mk('chip', () => { shown.chip = !shown.chip; ui.chip('rescue', shown.chip ? { icon: 'phone', text: 'Rescue call', seconds: 42 } : null); });
  mk('chip2', () => { shown.chip2 = !shown.chip2; ui.chip('buff', shown.chip2 ? { icon: 'diner', text: 'Lunch buff', seconds: 160 } : null); });
  mk('hint', () => { shown.hint = !shown.hint; ui.hint(shown.hint ? 'Park in a P bay to get out' : null); });
  mk('ptr 3', () => setPtrs(['rescue', 'vehicle', 'sale']));
  mk('ptr 6', () => setPtrs(Object.keys(spots)));
  mk('ptr 0', () => setPtrs([]));
  mk('orbit', () => { orbitOn = !orbitOn; orbit.setVisible(orbitOn); });
  mk('dock', nextDock);
  mk('missions', () => document.querySelector('[data-act="missions"]').click());
  mk('+$50K', () => window.__ui.addCash(50000));
  document.getElementById('ui').appendChild(bar);
  window.__ui.town = town;
  window.__ui.setPtrs = setPtrs;

  setPtrs(q.get('ptr') === '6' ? Object.keys(spots) : q.get('ptr') === '3' ? ['rescue', 'vehicle', 'sale'] : []);
  const open = q.get('open');
  if (open) {
    setTimeout(() => {
      ({ fame: () => ui.openFame(), map: () => ui.openMap(), pro: () => ui.openProGear(), academy: () => ui.openAcademy(),
        complete: () => ui.showGarageComplete(), ferry: () => ui.showFerry(), levelup: () => document.querySelectorAll('button').forEach((b) => b.textContent === 'lvl-up' && b.click()),
        perfect: () => ui.perfect(4200), missions: () => document.querySelector('[data-act="missions"]').click() }[open] || (() => {}))();
    }, 500);
  }
  void state;
}
