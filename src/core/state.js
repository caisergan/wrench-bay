// Persistent game state + helpers. All mutations go through these functions so the UI gets events.
import { events } from './events.js';
import { persist } from './platform.js';
import { ECONOMY, UNLOCKS, UPGRADES, SHOP_NAMES, PROBLEMS, PART_TYPES, BOOSTS } from '../config.js';

const SAVE_KEY = 'wrench-bay-save-v1';

function fresh() {
  return {
    cash: ECONOMY.startCash,
    gems: 25,
    shopLevel: 0,                // 0-based index of the current garage
    unlocked: [],                // ids from UNLOCKS
    upgrades: { speed: 0, capacity: 0, repair: 0, supply: 0, price: 0 },
    boosts: { incomeUntil: 0, speedUntil: 0, incomeReadyAt: 0, speedReadyAt: 0 }, // ms timestamps
    stats: { repaired: 0, jobsDone: 0, cashEarned: 0, unlocks: 0, vips: 0, bestStreak: 0 },
    streak: 0,                   // consecutive speedy repairs
    missions: { day: '', claimed: [] },
    tutorialDone: false,
    lastSeen: 0,                 // ms timestamp of the last save (offline earnings)
  };
}

export const state = fresh();
let offline = null;              // { amount, seconds } waiting to be claimed

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const data = JSON.parse(raw), base = fresh();
      Object.assign(state, base, data);
      state.upgrades = { ...base.upgrades, ...data.upgrades };
      state.stats = { ...base.stats, ...data.stats };
      state.boosts = { ...base.boosts, ...data.boosts };
    }
  } catch { /* ignore corrupt save */ }
  computeOffline();
}
let wiped = false;
export function save() {
  if (wiped) return;
  state.lastSeen = Date.now();
  const json = JSON.stringify(state);
  try { localStorage.setItem(SAVE_KEY, json); } catch { /* ignore */ }
  persist(SAVE_KEY, json);
}
/** Erase the save. Nothing is written again until the page reloads (callers reload right after). */
export function resetSave() {
  wiped = true;
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  persist(SAVE_KEY, null);
  Object.assign(state, fresh());
}

// ---- multipliers ----
export const shopMult = () => Math.pow(ECONOMY.shopMultiplier, state.shopLevel);
export const incomeBoostActive = () => Date.now() < state.boosts.incomeUntil;
export const speedBoostActive = () => Date.now() < state.boosts.speedUntil;
export const shopName = () => SHOP_NAMES[state.shopLevel % SHOP_NAMES.length];

export function upgradeValue(key) {
  const u = UPGRADES[key], l = state.upgrades[key] || 0;
  if (key === 'supply') return Math.pow(1 - u.per, l);  // multiplier on restock time
  if (key === 'capacity') return l * u.per;             // extra parts
  return 1 + l * u.per;                                  // speed / repair rate / price multiplier
}
export function upgradeCost(key) {
  const u = UPGRADES[key];
  return Math.round(u.base * Math.pow(u.growth, state.upgrades[key] || 0) * shopMult());
}

// ---- cash / gems ----
export function addCash(amount, worldPos) {
  amount = Math.round(amount);
  if (!amount) return;
  state.cash += amount;
  if (amount > 0) state.stats.cashEarned += amount;
  events.emit('cash:changed', { cash: state.cash, delta: amount, worldPos });
}
export function trySpend(amount) {
  amount = Math.round(amount);
  if (state.cash < amount) return false;
  state.cash -= amount;
  events.emit('cash:changed', { cash: state.cash, delta: -amount });
  return true;
}
export function addGems(n) {
  state.gems += n;
  events.emit('gems:changed', { gems: state.gems, delta: n });
}

// ---- unlock progress ----
export const isUnlocked = (id) => state.unlocked.includes(id);
export const unlockPrice = (u) => Math.round(u.price * shopMult());
export function markUnlocked(id) {
  if (isUnlocked(id)) return;
  state.unlocked.push(id);
  state.stats.unlocks++;
  events.emit('progress:changed', progress());
  save();
}
export function progress() {
  return { done: state.unlocked.length, total: UNLOCKS.length, name: shopName(), level: state.shopLevel };
}
/** Part / problem types the player can currently service ('tire' is always available). */
export function unlockedPartTypes() {
  return PART_TYPES.filter((t) => t === 'tire' || isUnlocked('station_' + t));
}
export const mechanicCount = () => UNLOCKS.filter((u) => u.type === 'mechanic' && isUnlocked(u.id)).length;
export const liftCount = () => 1 + UNLOCKS.filter((u) => u.type === 'lift' && isUnlocked(u.id)).length;

export function buyUpgrade(key) {
  if (state.upgrades[key] >= UPGRADES[key].max) return false;
  if (!trySpend(upgradeCost(key))) return false;
  state.upgrades[key]++;
  events.emit('upgrades:changed', { ...state.upgrades });
  save();
  return true;
}

export function activateBoost(kind) {
  const b = state.boosts, now = Date.now();
  const key = kind === 'income' ? 'income' : 'speed';
  if (now < b[key + 'ReadyAt']) return false;
  const { duration, cooldown } = BOOSTS[key];
  b[key + 'Until'] = now + duration * 1000;
  b[key + 'ReadyAt'] = now + (duration + cooldown) * 1000;
  events.emit('boosts:changed', { ...b });
  save();
  return true;
}

// ---- streak + repair payout ----
export const streakMult = (n = state.streak) => 1 + Math.min(n, ECONOMY.streakMax) * ECONOMY.streakStep;
export function setStreak(n) {
  n = Math.max(0, n | 0);
  if (n === state.streak) return;
  state.streak = n;
  if (n > state.stats.bestStreak) state.stats.bestStreak = n;
  events.emit('streak:changed', { streak: n, mult: streakMult(n) });
}

/**
 * Cash for a finished car. types = its problem ids (duplicates allowed).
 * Returns { total, base, speedy, streakMult } – `total` already includes everything.
 * Does NOT touch the streak; gameplay calls setStreak() itself.
 */
export function repairPayout(types, { tier = 1, vip = false, speedy = false } = {}) {
  let sum = 0;
  for (const t of types) sum += PROBLEMS[t].price;
  const base = sum * tier * (vip ? ECONOMY.vipMult : 1) * upgradeValue('price') * shopMult() * (incomeBoostActive() ? 2 : 1);
  const sm = speedy ? streakMult() : 1;
  const total = Math.max(1, Math.round(base * (speedy ? 1 + ECONOMY.speedyBonus : 1) * sm));
  return { total, base: Math.round(base), speedy, streakMult: sm };
}

// ---- offline earnings (only once the shop can run itself: valet + at least one mechanic) ----
export function offlineRate() {
  const m = mechanicCount();
  if (!m || !isUnlocked('valet')) return 0;
  const types = unlockedPartTypes();
  let avg = 0;
  for (const t of types) avg += PROBLEMS[t].price;
  avg /= types.length;
  const crews = Math.min(m, liftCount());
  // one crew finishes a ~2-job car roughly every 14 s
  return (crews * avg * 2 * upgradeValue('price') * shopMult() * ECONOMY.offlineEfficiency) / 14;
}
function computeOffline() {
  offline = null;
  if (!state.lastSeen) return;
  const seconds = Math.min((Date.now() - state.lastSeen) / 1000, ECONOMY.offlineCapHours * 3600);
  const amount = Math.round(offlineRate() * seconds);
  if (seconds >= 60 && amount > 0) offline = { amount, seconds };
}
/**
 * Re-check offline earnings when the app returns from the background (on iOS the app is usually suspended
 * rather than closed, so load() does not run again). Keeps an unclaimed amount. Returns pendingOffline().
 */
export function refreshOffline() {
  if (!offline) computeOffline();
  return offline;
}
/** { amount, seconds } earned while the game was closed, or null. */
export const pendingOffline = () => offline;
/** Pays out the offline earnings (multiplier 2 = "double it" for gems). Returns the amount paid. */
export function claimOffline(multiplier = 1) {
  if (!offline) return 0;
  const amount = Math.round(offline.amount * multiplier);
  offline = null;
  addCash(amount);
  save();
  return amount;
}

// Move to the next garage: keeps gems + stats, resets unlocks/upgrades.
export function nextShop() {
  state.shopLevel++;
  state.unlocked = [];
  state.upgrades = fresh().upgrades;
  state.cash = Math.round(ECONOMY.startCash * shopMult());
  setStreak(0);
  save();
  events.emit('cash:changed', { cash: state.cash, delta: 0 });
  events.emit('shop:changed', progress());
  events.emit('progress:changed', progress());
}

// autosave. Skipped while hidden: the game does not run in the background, and lastSeen must stay at the moment
// the player left so that time counts as offline earnings. (main.js also saves when the game is hidden.)
setInterval(() => { if (!document.hidden) save(); }, 5000);
window.addEventListener('beforeunload', save);
