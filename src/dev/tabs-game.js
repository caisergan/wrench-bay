// Dev tool tabs that edit the game: Money, Garage, Town, Play.
import {
  state, shopName, unlockPrice, isUnlocked, upgradeValue, fameProgress, fameMult, collectionMult, propLevel, proLevel,
  proValue, townOpen, carTier, streakMult as liveStreakMult,
} from '../core/state.js';
import {
  UNLOCKS, UPGRADES, BOOSTS, PART_TYPES, CAR_TYPES, TOWN_CAR_TYPES, PROPERTIES, SERVICES, DISTRICTS, PRO_UPGRADES,
  MANAGERS, CLASSICS, FAME, TOWN, BUSINESS, ECONOMY,
} from '../config.js';
import { mmss } from '../ui/format.js';
import * as A from './actions.js';
import { CHEATS, cheatOn, setCheat } from './tuning.js';
import { isPaused, setSimPaused } from './view.js';
import {
  card, row, withIcon, btn, confirmBtn, chips, seg, toggle, stepper, pips, numInput, text, note, fmt, icon, syncAll,
} from './kit.js';

const G = () => window.__game || null;
const money = (n) => '$' + fmt(n);
const noGame = () => note('Gameplay is not running (?nogame): only the save changes.', 'warn');

// ================================================================ MONEY
export function tabMoney(body, { ui, flash }) {
  // ---- cash
  const cash = card('Cash', 'cash');
  cash.right.append(text(() => money(state.cash), 'dv-big'));
  cash.body.append(
    row('Exact amount', 'Type 1.5k, 2m, 3b …', numInput(() => state.cash, A.setCash, { int: true, min: 0, width: 130 })),
    chips([
      ...[100, 1e3, 1e4, 1e5, 1e6].map((n) => ({ label: '+' + fmt(n), onClick: () => A.setCash(state.cash + n) })),
      { label: 'x10', onClick: () => A.setCash(state.cash * 10) },
      { label: '/10', onClick: () => A.setCash(state.cash / 10) },
      { label: '0', onClick: () => A.setCash(0) },
    ]),
  );
  // ---- gems
  const gems = card('Gems', 'gem');
  gems.right.append(text(() => fmt(state.gems), 'dv-big'));
  gems.body.append(
    row('Exact amount', null, numInput(() => state.gems, A.setGems, { int: true, min: 0, width: 130 })),
    chips([
      ...[10, 100, 1000].map((n) => ({ label: '+' + fmt(n), onClick: () => A.setGems(state.gems + n) })),
      { label: '0', onClick: () => A.setGems(0) },
    ]),
  );
  // ---- boosts
  const boosts = card('Boosts', 'bolt', 'Started here they skip the cooldown');
  for (const kind of ['income', 'speed']) {
    boosts.body.append(row(withIcon(kind === 'income' ? 'x2' : 'bolt', BOOSTS[kind].label),
      () => { const s = A.boostStatus(kind); return s.st === 'ready' ? 'Ready' : `${s.st === 'active' ? 'Active' : 'Cooldown'} ${mmss(s.left)}`; },
      btn('Start', () => A.startBoost(kind)), btn('Stop', () => A.stopBoost(kind), 'cream')));
  }
  // ---- streak
  const streak = card('Speedy streak', 'flame');
  streak.body.append(row('Streak', () => `Payout x${liveStreakMult().toFixed(2)} · best ${state.stats.bestStreak}`,
    stepper(() => state.streak, (v) => A.setStreak(v), { min: 0, max: 40 })));
  // ---- offline
  const off = card('Offline earnings', 'clock');
  off.body.append(
    row('Crew earns while away', () => {
      const r = A.offlinePerMinute();
      return r > 0 ? `${money(r)} a minute, up to ${ECONOMY.offlineCapHours} h` : 'Nothing yet: needs the valet and a mechanic';
    }),
    chips([[300, '5 min'], [1800, '30 min'], [7200, '2 h']].map(([s, label]) => ({
      label: 'Away ' + label, icon: 'clock', onClick: () => { if (!A.simulateAway(s, ui)) flash('No real earnings: showing a preview'); },
    }))),
  );
  body.append(cash.el, gems.el, boosts.el, streak.el, off.el);
}

// ================================================================ GARAGE
const UNLOCK_ICON = { lift: 'car', mechanic: 'wrench', valet: 'flag', coffee: 'happy', billboard: 'star' };
function unlockName(u) {
  if (u.type === 'station') return `${u.key[0].toUpperCase()}${u.key.slice(1)} station`;
  if (u.type === 'lift') return `Lift ${u.index + 1}`;
  if (u.type === 'mechanic') return `Mechanic ${u.index + 1}`;
  return { valet: 'Valet', coffee: 'Coffee cart', billboard: 'Billboard' }[u.type] || u.id;
}
const UPGRADE_ICON = { speed: 'speed', capacity: 'capacity', repair: 'wrench', supply: 'crate', price: 'price' };
const spawnOpts = { type: '', vip: false, problems: [] };

export function tabGarage(body, { flash }) {
  if (!G()) body.append(noGame());
  // ---- which garage
  const shop = card('Garage', 'wrench');
  shop.right.append(text(() => `#${state.shopLevel + 1} ${shopName()}`, 'dv-val'));
  shop.body.append(
    row('Garage number', () => `Prices and income x${Math.pow(ECONOMY.shopMultiplier, state.shopLevel)}. Keeps your progress`,
      stepper(() => state.shopLevel, A.setShopLevel, { min: 0, max: 9, fmt: (v) => String(v + 1) })),
    row('Take the ferry', 'The real thing: next garage, unlocks, upgrades and town reset', confirmBtn('Sail', () => A.ferry())),
  );
  // ---- unlocks
  const un = card('Unlocks', 'lock');
  un.right.append(text(() => `${state.unlocked.length}/${UNLOCKS.length}`, 'dv-val'));
  un.body.append(chips([
    { label: 'Unlock all', onClick: () => A.unlockAll() },
    { label: 'Next one', onClick: () => { const u = UNLOCKS.find((x) => !isUnlocked(x.id)); if (u) A.setUnlocked(u.id, true); } },
    { label: 'Reset all', onClick: () => A.resetUnlocks() },
  ]));
  for (const u of UNLOCKS) {
    un.body.append(row(withIcon(u.type === 'station' ? u.key : UNLOCK_ICON[u.type] || 'tag', unlockName(u)),
      () => `${money(unlockPrice(u))} · ${u.label}`, toggle(() => isUnlocked(u.id), (on) => A.setUnlocked(u.id, on), unlockName(u))));
  }
  // ---- upgrades
  const upg = card('Upgrades', 'gauge');
  upg.body.append(chips([
    { label: 'All 0', onClick: () => Object.keys(UPGRADES).forEach((k) => A.setUpgrade(k, 0)) },
    { label: 'All max', onClick: () => Object.keys(UPGRADES).forEach((k) => A.setUpgrade(k, UPGRADES[k].max)) },
  ]));
  for (const k in UPGRADES) {
    const u = UPGRADES[k];
    const r = row(withIcon(UPGRADE_ICON[k], u.label), () => {
      const v = upgradeValue(k);
      return `Lv ${state.upgrades[k]}/${u.max} · ${k === 'capacity' ? '+' + v + ' parts' : 'x' + v.toFixed(2)}`;
    }, stepper(() => state.upgrades[k] || 0, (v) => A.setUpgrade(k, v), { min: 0, max: u.max }));
    r.querySelector('.dv-rl').append(pips(() => state.upgrades[k] || 0, u.max));
    upg.body.append(r);
  }
  // ---- customers
  const cust = card('Customers', 'car', 'Spawn a car into the drop-off lane');
  const types = [{ value: '', label: 'Random' }, ...Object.keys(CAR_TYPES), ...Object.keys(TOWN_CAR_TYPES)]
    .map((t) => (typeof t === 'string' ? { value: t, label: t } : t));
  cust.body.append(
    row('Car class', () => (spawnOpts.type ? `tier x${carTier(spawnOpts.type)}${TOWN_CAR_TYPES[spawnOpts.type] ? ` · normally from fame ${TOWN_CAR_TYPES[spawnOpts.type].fame}` : ''}` : 'Any class open at your fame')),
    seg(types, () => spawnOpts.type, (v) => { spawnOpts.type = v; }),
    row('Jobs', () => (spawnOpts.problems.length ? spawnOpts.problems.join(' + ') : 'Random, like a real customer')),
    chips([
      ...PART_TYPES.map((t) => ({ label: t, icon: t, on: () => spawnOpts.problems.includes(t),
        onClick: () => { const p = spawnOpts.problems; if (p.includes(t)) p.splice(p.indexOf(t), 1); else if (p.length < 4) p.push(t); syncAll(); } })),
      { label: 'Clear', onClick: () => { spawnOpts.problems.length = 0; syncAll(); } },
    ]),
    row(withIcon('crown', 'VIP'), 'Gold car: x3 pay, gems, less patience', toggle(() => spawnOpts.vip, (v) => { spawnOpts.vip = v; })),
    chips([
      { label: 'Spawn 1', icon: 'car', onClick: () => { if (!A.spawnCar(spawnOpts)) flash('Drop-off lane is full'); } },
      { label: 'Fill the lane', onClick: () => { let n = 0; while (n < 6 && A.spawnCar(spawnOpts)) n++; flash(n ? `${n} car${n > 1 ? 's' : ''} on the way` : 'Drop-off lane is full'); } },
    ]),
  );
  // ---- missions
  const mis = card('Daily missions', 'clipboard');
  mis.body.append(chips([
    { label: 'Complete all', onClick: () => { A.completeMissions(); flash('Missions ready to claim'); } },
    { label: 'New day', onClick: () => { A.newMissionDay(); flash('Missions reset'); } },
  ]));
  body.append(shop.el, un.el, upg.el, cust.el, mis.el);
}

// ================================================================ TOWN
export function tabTown(body, { flash }) {
  if (!G()) body.append(noGame());
  const T = () => state.town;
  // ---- town + districts
  const town = card('Harbor Town', 'map');
  town.body.append(
    row('Town open', 'Normally: valet + first mechanic hired', toggle(townOpen, A.setTownOpen, 'Town open')),
    row(`${DISTRICTS.main.label} open`, `Gate: ${money(DISTRICTS.main.price)}, fame ${DISTRICTS.main.fame}`, toggle(A.mainOpen, A.setMainOpen, 'Main Street')),
    row('Garage complete seen', 'Celebration shown once per save', toggle(() => !!T().garageDone, A.setGarageDone, 'Garage complete')),
  );
  // ---- fame
  const fame = card('Fame', 'star');
  fame.right.append(text(() => `Level ${fameProgress().level}`, 'dv-big'));
  const bar = document.createElement('div');
  bar.className = 'm-bar dv-bar';
  bar.innerHTML = '<i></i><span></span>';
  const barI = bar.querySelector('i'), barT = bar.querySelector('span');
  fame.body.append(
    bar,
    row('Set level', 'Direct: no gems, no level-up moment', stepper(() => fameProgress().level, A.setFameLevel, { min: 0, max: FAME.maxLevel })),
    row('Payout bonus', () => `x${fameMult().toFixed(2)} on every payout (+${Math.round(FAME.pricePerLevel * 100)}% a level)`),
    chips([
      { label: '+10 XP', onClick: () => A.addFameXp(10) },
      { label: '+100 XP', onClick: () => A.addFameXp(100) },
      { label: 'Level up', icon: 'star', title: 'The real level-up: gems, modal, unlock toasts', onClick: () => { if (!A.fameLevelUp()) flash('Fame is maxed'); } },
    ]),
  );
  // tracked after the bar exists
  fame.body.append(text(() => {
    const f = fameProgress();
    barI.style.transform = `scaleX(${f.need ? Math.min(1, f.xp / f.need) : 1})`;
    barT.textContent = f.need ? `${Math.floor(f.xp)} / ${f.need} XP` : 'MAX';
    return '';
  }, 'dv-hidden'));
  // ---- properties
  const props = card('Properties', 'tag', 'Buildings appear finished (no build site)');
  props.right.append(text(() => {
    let d = 0, t = 0;
    for (const id in PROPERTIES) { d += Math.min(propLevel(id), PROPERTIES[id].levels.length); t += PROPERTIES[id].levels.length; }
    return `${d}/${t}`;
  }, 'dv-val'));
  props.body.append(chips([
    { label: 'All level 1+', onClick: () => A.setAllProps('one') },
    { label: 'All max', onClick: () => A.setAllProps('max') },
    { label: 'None', onClick: () => A.setAllProps('none') },
  ]));
  for (const id in PROPERTIES) {
    const p = PROPERTIES[id];
    props.body.append(row(withIcon(p.icon, p.name), () => {
      const L = propLevel(id), nx = p.levels[L];
      return `${p.district === 'main' ? 'Main St' : 'Harbor'} · ${L ? `lv ${L}/${p.levels.length}` : 'not owned'}${nx ? ` · next ${money(nx.price)}, fame ${nx.fame || 0}` : ' · maxed'}`;
    }, stepper(() => propLevel(id), (v) => A.setPropLevel(id, v), { min: 0, max: p.levels.length })));
  }
  // ---- pro gear
  const pro = card('Pro Gear (depot)', 'depot');
  for (const k in PRO_UPGRADES) {
    const u = PRO_UPGRADES[k];
    const r = row(u.label, () => `Lv ${proLevel(k)}/${u.max} · ${k === 'stock' ? '+' + proValue(k) + ' per station' : '+' + Math.round(proValue(k) * 100) + '%'}`,
      stepper(() => proLevel(k), (v) => A.setPro(k, v), { min: 0, max: u.max }));
    r.querySelector('.dv-rl').append(pips(() => proLevel(k), u.max));
    pro.body.append(r);
  }
  // ---- managers
  const man = card('Floor managers (academy)', 'academy');
  for (const id in MANAGERS) {
    const m = MANAGERS[id];
    man.body.append(row(`${id[0].toUpperCase()}${id.slice(1)} manager`, `${money(m.price)} · fame ${m.fame}`,
      toggle(() => T().managers.includes(id), (on) => A.setManager(id, on), id + ' manager')));
  }
  // ---- classics
  const cl = card('Classics restored', 'showroom');
  cl.right.append(text(() => `x${collectionMult().toFixed(2)}`, 'dv-val'));
  cl.body.append(chips(CLASSICS.map((c) => ({
    label: c.name, on: () => T().classics.includes(c.id), onClick: () => A.setClassic(c.id, !T().classics.includes(c.id)),
  }))), note('Each one restored adds +2% to every payout, forever (kept across ferries).'));
  // ---- facility chains
  const ch = card('Facility unlock chains', 'paintShop', 'Paint shop and VIP club pads');
  for (const [chain, label] of [['paint', 'Spray Bay'], ['vip', 'Platinum Club']]) {
    const list = A.CHAINS[chain];
    ch.body.append(
      row(label, () => `${list.filter((u) => T().unlocked.includes(u.id)).length}/${list.length} unlocked`,
        btn('All', () => A.setChainAll(chain, true), 'cream'), btn('None', () => A.setChainAll(chain, false), 'cream')),
      chips(list.map((u) => ({ label: u.id.replace(/^(paint|vip)_/, ''), on: () => T().unlocked.includes(u.id),
        onClick: () => A.setChainUnlocked(u.id, !T().unlocked.includes(u.id)) }))),
    );
  }
  // ---- tills + wrenches
  const misc = card('Tills & golden wrenches', 'coins');
  misc.body.append(
    row('Business tills', () => {
      const own = A.ownedBusinesses();
      return own.length ? own.map((id) => PROPERTIES[id].name).join(', ') : `Own one of: ${Object.keys(BUSINESS).map((id) => PROPERTIES[id].name).join(', ')}`;
    }, btn('Fill', () => A.fillTills()), btn('Empty', () => A.emptyTills(), 'cream')),
    row('Golden wrenches', () => `${T().wrenches.length}/${TOWN.wrenches.length} found`,
      btn('All', () => A.setWrenches(true)), btn('Reset', () => A.setWrenches(false), 'cream')),
  );
  // ---- town stats
  const st = card('Town stats', 'trophy', 'Feed the town missions');
  for (const k of A.TOWN_STATS) st.body.append(row(k, null, numInput(() => T().stats[k] || 0, (v) => A.setStat('town', k, v), { int: true, min: 0, width: 96 })));
  body.append(town.el, fame.el, props.el, pro.el, man.el, cl.el, ch.el, misc.el, st.el);
}

// ================================================================ PLAY
export function tabPlay(body, { flash }) {
  const g = G();
  if (!g) body.append(noGame());
  // ---- simulation
  const sim = card('Simulation', 'clock');
  sim.body.append(
    row('Pause the world', 'Everything stops, the menu stays shut (hotkey P)', toggle(isPaused, setSimPaused, 'Pause')),
    row('Game speed', 'Runs several steps per frame (hotkeys [ and ])'),
    seg([1, 2, 4, 8].map((v) => ({ value: v, label: v + 'x' })), () => (G() ? G().timeScale : 1), (v) => { if (G()) G().timeScale = v; }),
  );
  // ---- cheats
  const ch = card('Cheats', 'bolt', 'Tuning presets: see and reset them in Tune');
  for (const c of CHEATS) ch.body.append(row(withIcon(c.icon, c.label), c.sub, toggle(() => cheatOn(c.id), (on) => setCheat(c.id, on), c.label)));
  // ---- player
  const pl = card('Player', 'pin');
  pl.body.append(row('Where', () => {
    const p = G()?.player;
    if (!p) return '–';
    const what = p.mode === 'foot' ? `on foot, carrying ${p.stack?.count ?? 0}/${p.capacity()}` : p.mode === 'vehicle' ? 'in a vehicle' : 'driving a car';
    return `x ${p.pos.x.toFixed(1)} · z ${p.pos.z.toFixed(1)} · ${what}`;
  }));
  const places = [{ id: 'garage', label: 'Garage' },
    ...Object.keys(PROPERTIES).map((id) => ({ id, label: PROPERTIES[id].name })),
    ...Object.keys(SERVICES).map((id) => ({ id, label: SERVICES[id].name })),
    { id: 'main', label: `${DISTRICTS.main.label} gate` }];
  pl.body.append(
    note('Teleport (on foot; outside the lot once the town is open)'),
    chips(places.map((p) => ({ label: p.label, onClick: () => {
      const gg = G();
      if (!gg) return;
      if (gg.player.mode !== 'foot') { flash('Get out of the car first'); return; }
      if (p.id !== 'garage' && !townOpen()) { flash('Open the town first (Town tab)'); return; }
      gg.tp(p.id);
    } }))),
    row(withIcon('tow', 'Drive the tow truck'), () => (propLevel('tow') ? 'Hop in wherever it is parked' : 'Buy the tow truck first (Town tab)'),
      btn('Drive', () => { if (!G()?.drive('tow')) flash('Not possible right now'); })),
  );
  body.append(sim.el, ch.el, pl.el);
  void icon;
}
