// Dev tool: everything that changes the save. Small changes go through the game's own helpers and events so the HUD
// and the world follow live; structural ones (taking unlocks or buildings away, setting a fame level) edit the save
// and rebuild the world the way the ferry does (debounced, so a few taps cost one rebuild).
import { events } from '../core/events.js';
import {
  state, save, resetSave, setStreak, streakMult, upgradeValue, offlineRate, refreshOffline, isUnlocked, openTown,
  openDistrict, fameNeed, fameProgress, addFame, propLevel, tillCap, addTill, takeTill, shopMult, progress, nextShop,
} from '../core/state.js';
import {
  UNLOCKS, UPGRADES, BOOSTS, PROPERTIES, PRO_UPGRADES, MANAGERS, CLASSICS, PAINT_UNLOCKS, VIP_UNLOCKS, BUSINESS, FAME,
  TOWN, SHOP_NAMES,
} from '../config.js';

const G = () => window.__game || null;      // gameplay debug API (src/game/index.js); null with ?nogame
const T = () => state.town;
export const hasGame = () => !!G();

// ---------------------------------------------------------------- world rebuild (debounced)
let rebuildTimer = 0;
const rebuildListeners = new Set();
export function onRebuild(fn) { rebuildListeners.add(fn); return () => rebuildListeners.delete(fn); }
/** Save, then rebuild the world from it (after `delay` ms; repeated calls restart the wait). */
export function rebuild(delay = 450) {
  save();
  clearTimeout(rebuildTimer);
  rebuildListeners.forEach((fn) => fn(true));
  rebuildTimer = setTimeout(() => {
    rebuildTimer = 0;
    try { G()?.rebuild(); } catch (err) { console.error('[dev] rebuild failed', err); }
    rebuildListeners.forEach((fn) => fn(false));
  }, delay);
}
export const rebuildPending = () => !!rebuildTimer;

// ---------------------------------------------------------------- money
export function setCash(n) {
  n = Math.max(0, Math.round(n));
  const delta = n - state.cash;
  state.cash = n;
  events.emit('cash:changed', { cash: n, delta });
}
export function setGems(n) {
  n = Math.max(0, Math.round(n));
  const delta = n - state.gems;
  state.gems = n;
  events.emit('gems:changed', { gems: n, delta });
}

// ---------------------------------------------------------------- boosts + streak
/** 'active' | 'cooldown' | 'ready' and the seconds left in that state. */
export function boostStatus(kind) {
  const b = state.boosts, now = Date.now();
  if (now < b[kind + 'Until']) return { st: 'active', left: (b[kind + 'Until'] - now) / 1000 };
  if (now < b[kind + 'ReadyAt']) return { st: 'cooldown', left: (b[kind + 'ReadyAt'] - now) / 1000 };
  return { st: 'ready', left: 0 };
}
/** Start a boost now, without its cooldown afterwards. */
export function startBoost(kind) {
  const now = Date.now();
  state.boosts[kind + 'Until'] = now + BOOSTS[kind].duration * 1000;
  state.boosts[kind + 'ReadyAt'] = state.boosts[kind + 'Until'];
  events.emit('boosts:changed', { ...state.boosts });
}
export function stopBoost(kind) {
  state.boosts[kind + 'Until'] = 0;
  state.boosts[kind + 'ReadyAt'] = 0;
  events.emit('boosts:changed', { ...state.boosts });
}
export { setStreak, streakMult };

// ---------------------------------------------------------------- offline earnings
export const offlinePerMinute = () => offlineRate() * 60;
/** Pretend the player left `seconds` ago: the real welcome-back modal (or a preview when nothing was earned). */
export function simulateAway(seconds, ui) {
  state.lastSeen = Date.now() - seconds * 1000;
  const info = refreshOffline(true);
  save();   // stamps lastSeen = now again: a reload does not pay twice
  if (info) { events.emit('app:resume'); return true; }
  ui?.showWelcomeBack({ amount: Math.round(100 * shopMult()), seconds });
  return false;
}

// ---------------------------------------------------------------- garage
export const shopLabel = (lvl = state.shopLevel) => `${SHOP_NAMES[lvl % SHOP_NAMES.length]} · x${Math.pow(3, lvl)}`;
/** Jump to garage `lvl` keeping everything else (prices x3 per garage). The ferry's real reset is ferry(). */
export function setShopLevel(lvl) {
  state.shopLevel = Math.max(0, lvl | 0);
  events.emit('progress:changed', progress());
  rebuild();
}
/** The real ferry: next garage, unlocks / upgrades / town reset (state.nextShop). */
export const ferry = () => nextShop();
export function setUnlocked(id, on) {
  if (on === isUnlocked(id)) return;
  if (on && G()) { G().unlock(id); return; }        // live, with the pad's pop and the toast
  if (on) state.unlocked.push(id);
  else state.unlocked = state.unlocked.filter((x) => x !== id);
  events.emit('progress:changed', progress());
  rebuild();
}
export function unlockAll() {
  if (G()) G().unlockAll();
  else { state.unlocked = UNLOCKS.map((u) => u.id); events.emit('progress:changed', progress()); }
}
export function resetUnlocks() {
  state.unlocked = [];
  events.emit('progress:changed', progress());
  rebuild();
}
export function setUpgrade(key, lvl) {
  state.upgrades[key] = Math.max(0, Math.min(UPGRADES[key].max, lvl | 0));
  events.emit('upgrades:changed', { ...state.upgrades });
  save();
}
export const upgradeMult = (key) => upgradeValue(key);

/** Spawn a garage customer. type: car class or '' (random), problems: [] = random. null = the drop-off lane is full. */
export function spawnCar({ type = '', vip = false, problems = [] } = {}) {
  const opts = { vip };
  if (type) opts.type = type;
  if (problems.length) opts.problems = problems.slice();
  try { return G()?.spawnCar(opts) || null; } catch (err) { console.error('[dev] spawn', err); return null; }
}

/** Mark every mission of today as done (claimable) / roll a fresh day. */
export function completeMissions() {
  const m = state.missions;
  const BIG = -1e15;
  m.base = { repaired: BIG, cashEarned: BIG, unlocks: BIG, vips: BIG };
  m.dayStreak = 99;
  m.tbase = {};
  for (const id of m.tpick || []) m.tbase[id] = BIG;
  save();
  events.emit('progress:changed', progress());
}
export function newMissionDay() {
  state.missions = { day: '', claimed: [] };
  save();
  events.emit('progress:changed', progress());
}

// ---------------------------------------------------------------- town
export function setTownOpen(on) {
  if (on === !!T().open) return;
  if (on) { openTown(); return; }                   // live: the town moment, bounds, camera
  T().open = false;
  T().districts = [];
  rebuild(0);
}
export const mainOpen = () => T().districts.includes('main');
export function setMainOpen(on) {
  if (on === mainOpen()) return;
  if (on) { if (!T().open) openTown(); openDistrict('main'); return; }
  T().districts = T().districts.filter((d) => d !== 'main');
  rebuild(0);
}
export function setGarageDone(on) { T().garageDone = !!on; save(); events.emit('progress:changed', progress()); }

/** Total fame XP at the start of `level`. */
export function xpForLevel(level) {
  let xp = 0;
  for (let L = 0; L < Math.min(level, FAME.maxLevel); L++) xp += fameNeed(L);
  return xp;
}
/** Set the fame level directly (no level-up moment, no gems), then rebuild so fame-locked pads re-check. */
export function setFameLevel(level) {
  level = Math.max(0, Math.min(FAME.maxLevel, level | 0));
  T().fameXp = xpForLevel(level);
  const fp = fameProgress();
  events.emit('fame:changed', { xp: fp.total, level: fp.level, frac: fp.frac, delta: 0 });
  rebuild();
}
/** One real level-up: the XP it takes, the gems, the modal and the unlock toasts. */
export function fameLevelUp() {
  const fp = fameProgress();
  if (fp.level >= FAME.maxLevel) return false;
  const pro = T().pro.renown | 0;
  addFame((fp.need - fp.xp + 0.01) / (1 + pro * (PRO_UPGRADES.renown?.per || 0)));
  return true;
}
export const addFameXp = (n) => addFame(n);

/** Property level 0..max. Opens the town / district it needs. Rebuilds (the building appears without its site). */
export function setPropLevel(id, level) {
  const p = PROPERTIES[id];
  if (!p) return;
  level = Math.max(0, Math.min(p.levels.length, level | 0));
  if (level === propLevel(id)) return;
  if (level) T().props[id] = level; else delete T().props[id];
  if (level && !T().open) { T().open = true; if (!T().districts.includes('harbor')) T().districts.push('harbor'); }
  if (level && p.district === 'main' && !mainOpen()) T().districts.push('main');
  events.emit('property:changed', { id, level });
  events.emit('progress:changed', progress());
  rebuild();
}
export function setAllProps(mode) {
  for (const id in PROPERTIES) {
    const p = PROPERTIES[id];
    const lvl = mode === 'none' ? 0 : mode === 'max' ? p.levels.length : Math.max(1, propLevel(id));
    if (lvl) T().props[id] = lvl; else delete T().props[id];
  }
  if (mode !== 'none') { T().open = true; for (const d of ['harbor', 'main']) if (!T().districts.includes(d)) T().districts.push(d); }
  events.emit('progress:changed', progress());
  rebuild();
}

export function setPro(key, lvl) {
  T().pro[key] = Math.max(0, Math.min(PRO_UPGRADES[key].max, lvl | 0));
  events.emit('upgrades:changed', { ...state.upgrades, pro: { ...T().pro } });
  save();
}
export function setManager(id, on) {
  const has = T().managers.includes(id);
  if (on === has) return;
  if (on) { T().managers.push(id); save(); events.emit('manager:hired', { id }); return; }
  T().managers = T().managers.filter((x) => x !== id);
  rebuild();
}
export function setClassic(id, on) {
  const has = T().classics.includes(id);
  if (on === has) return;
  T().classics = on ? [...T().classics, id] : T().classics.filter((x) => x !== id);
  save();
  events.emit('project:changed', { id });
}
export const CHAINS = { paint: PAINT_UNLOCKS, vip: VIP_UNLOCKS };
export function setChainUnlocked(id, on) {
  const has = T().unlocked.includes(id);
  if (on === has) return;
  T().unlocked = on ? [...T().unlocked, id] : T().unlocked.filter((x) => x !== id);
  events.emit('townunlock', { id });
  rebuild();
}
export function setChainAll(chain, on) {
  const ids = CHAINS[chain].map((u) => u.id);
  T().unlocked = on ? [...new Set([...T().unlocked, ...ids])] : T().unlocked.filter((x) => !ids.includes(x));
  rebuild();
}
export const ownedBusinesses = () => Object.keys(BUSINESS).filter((id) => propLevel(id) > 0);
export function fillTills() { for (const id of ownedBusinesses()) addTill(id, tillCap(id)); save(); }
export function emptyTills() { for (const id of ownedBusinesses()) takeTill(id); save(); }
export function setWrenches(all) {
  T().wrenches = all ? TOWN.wrenches.map((w) => w.id) : [];
  rebuild();
}

// ---------------------------------------------------------------- stats
export const GARAGE_STATS = ['repaired', 'jobsDone', 'cashEarned', 'unlocks', 'vips', 'bestStreak'];
export const TOWN_STATS = ['rescues', 'resprays', 'vipServed', 'vipPerfect', 'washes', 'restored', 'tips'];
export function setStat(scope, key, v) {
  const s = scope === 'town' ? T().stats : state.stats;
  s[key] = Math.max(0, Math.round(v));
  save();
  events.emit('progress:changed', progress());
}

// ---------------------------------------------------------------- whole saves: presets, snapshots, export / import
/** Replace the whole save with `data`, store it and reload (load() fills in anything missing). */
export function replaceSave(data) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, JSON.parse(JSON.stringify(data)));
  save();
  location.reload();
}
export function exportSave() { save(); return JSON.stringify(state, null, 1); }
/** Parses a pasted save. Returns an error message or null (and reloads into it). */
export function importSave(text) {
  let data;
  try { data = JSON.parse(text); } catch { return 'That is not JSON'; }
  if (!data || typeof data !== 'object' || typeof data.cash !== 'number' || !Array.isArray(data.unlocked)) return 'Not a Wrench Bay save';
  replaceSave(data);
  return null;
}
export function wipeSave() { resetSave(); location.reload(); }

const SNAP_KEY = 'wrench-bay-dev:snapshots';
export function snapshots() {
  try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '[]') || []; } catch { return []; }
}
function writeSnaps(list) { try { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); return true; } catch { return false; } }
export function saveSnapshot(name) {
  save();
  name = (name || '').trim() || `Snapshot ${snapshots().length + 1}`;
  const list = snapshots().filter((s) => s.name !== name);
  list.unshift({ name, at: Date.now(), summary: summary(), data: JSON.parse(JSON.stringify(state)) });
  return writeSnaps(list.slice(0, 20)) ? name : null;
}
export function loadSnapshot(name) { const s = snapshots().find((x) => x.name === name); if (s) replaceSave(s.data); }
export function deleteSnapshot(name) { writeSnaps(snapshots().filter((s) => s.name !== name)); }
/** One line describing the current save. */
export function summary(s = state) {
  const t = s.town || {};
  const parts = [`Garage ${s.shopLevel + 1}`, `${s.unlocked.length}/${UNLOCKS.length} unlocks`];
  if (t.open) parts.push(`fame ${fameLevelOf(t.fameXp || 0)}`, `${Object.keys(t.props || {}).length} props`);
  return parts.join(' · ');
}
function fameLevelOf(xp) {
  let L = 0;
  while (L < FAME.maxLevel && xp >= fameNeed(L)) { xp -= fameNeed(L); L++; }
  return L;
}

/** Ready-made saves for jumping to a stage of the game. build(s) edits a fresh copy of the current save. */
export const PRESETS = [
  { id: 'start', icon: 'flag', label: 'Brand new', sub: 'Empty garage, $0, tutorial done',
    build: (s) => { Object.assign(s, baseSave(s)); } },
  { id: 'early', icon: 'tire', label: 'Early garage', sub: '4 unlocks, a few upgrades, $800',
    build: (s) => { Object.assign(s, baseSave(s)); s.unlocked = UNLOCKS.slice(0, 4).map((u) => u.id); s.cash = 800; s.gems = 40; up(s, 1); } },
  { id: 'garage', icon: 'wrench', label: 'Garage complete', sub: 'All unlocks, upgrades 4, town open, $25K',
    build: (s) => {
      Object.assign(s, baseSave(s)); s.unlocked = UNLOCKS.map((u) => u.id); s.cash = 25000; s.gems = 150; up(s, 4);
      Object.assign(s.town, { open: true, districts: ['harbor'], garageDone: true, fameXp: xpForLevel(2) });
    } },
  { id: 'town', icon: 'map', label: 'Mid town', sub: 'Fame 8, tow, wash, lounge, paint, Main St, $250K',
    build: (s) => {
      Object.assign(s, baseSave(s)); s.unlocked = UNLOCKS.map((u) => u.id); s.cash = 250000; s.gems = 400; up(s, 6);
      Object.assign(s.town, { open: true, districts: ['harbor', 'main'], garageDone: true, fameXp: xpForLevel(8),
        props: { tow: 2, wash: 2, lounge: 1, paint: 1 }, pro: { stock: 2, crew: 2, tips: 2, truck: 1, renown: 1 }, managers: ['garage'] });
    } },
  { id: 'late', icon: 'crown', label: 'Late game', sub: 'Fame 16, every property, $5M',
    build: (s) => {
      Object.assign(s, baseSave(s)); s.unlocked = UNLOCKS.map((u) => u.id); s.cash = 5e6; s.gems = 2000; up(s, 8);
      const props = {};
      for (const id in PROPERTIES) if (id !== 'ferry') props[id] = Math.min(2, PROPERTIES[id].levels.length);
      Object.assign(s.town, { open: true, districts: ['harbor', 'main'], garageDone: true, fameXp: xpForLevel(16), props,
        pro: { stock: 4, crew: 4, tips: 4, truck: 3, renown: 3 }, managers: ['garage', 'paint', 'vip'],
        classics: CLASSICS.slice(0, 3).map((c) => c.id), unlocked: [...PAINT_UNLOCKS, ...VIP_UNLOCKS].map((u) => u.id) });
    } },
  { id: 'max', icon: 'trophy', label: 'Everything maxed', sub: 'Fame 25, all maxed, $1B, 99K gems',
    build: (s) => {
      Object.assign(s, baseSave(s)); s.unlocked = UNLOCKS.map((u) => u.id); s.cash = 1e9; s.gems = 99999; up(s, 99);
      const props = {}, pro = {};
      for (const id in PROPERTIES) if (id !== 'ferry') props[id] = PROPERTIES[id].levels.length;
      for (const k in PRO_UPGRADES) pro[k] = PRO_UPGRADES[k].max;
      Object.assign(s.town, { open: true, districts: ['harbor', 'main'], garageDone: true, fameXp: xpForLevel(FAME.maxLevel), props, pro,
        managers: Object.keys(MANAGERS), classics: CLASSICS.map((c) => c.id), wrenches: TOWN.wrenches.map((w) => w.id),
        unlocked: [...PAINT_UNLOCKS, ...VIP_UNLOCKS].map((u) => u.id) });
    } },
];
function up(s, lvl) { for (const k in UPGRADES) s.upgrades[k] = Math.min(UPGRADES[k].max, lvl); }
/** A clean save on the current garage that keeps the missions and the hints (no tutorial nags). */
function baseSave(s) {
  return {
    cash: 0, gems: 25, shopLevel: 0, unlocked: [], upgrades: { speed: 0, capacity: 0, repair: 0, supply: 0, price: 0 },
    boosts: { incomeUntil: 0, speedUntil: 0, incomeReadyAt: 0, speedReadyAt: 0 },
    stats: { repaired: 0, jobsDone: 0, cashEarned: 0, unlocks: 0, vips: 0, bestStreak: 0 }, streak: 0,
    missions: s.missions, tutorialDone: true, lastSeen: 0,
    town: {
      open: false, districts: [], props: {}, unlocked: [], fameXp: 0, wrenches: [], classics: [], tills: {}, pro: {},
      managers: [], project: null, vehicles: {}, garageDone: false,
      stats: { rescues: 0, resprays: 0, vipServed: 0, vipPerfect: 0, washes: 0, restored: 0, tips: 0 }, hints: { ...(s.town?.hints || {}) },
    },
  };
}
export function applyPreset(id) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  const s = JSON.parse(JSON.stringify(state));
  p.build(s);
  replaceSave(s);
}
