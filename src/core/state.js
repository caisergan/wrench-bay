// Persistent game state + helpers. All mutations go through these functions so the UI gets events.
import { events } from './events.js';
import { persist } from './platform.js';
import {
  ECONOMY, UNLOCKS, UPGRADES, SHOP_NAMES, PROBLEMS, PART_TYPES, BOOSTS, CAR_TYPES,
  TOWN_CAR_TYPES, VIP_CAR_TYPES, FAME, PROPERTIES, DISTRICTS, PAINT, VIP, WASH, BUSINESS, PRO_UPGRADES, CLASSICS, PROJECT, MANAGERS,
} from '../config.js';

// `?save=name` keeps a separate save slot for this tab (dev / agents testing in parallel; never mirrored natively).
const SLOT = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('save') : null;
const SAVE_KEY = 'wrench-bay-save-v1' + (SLOT ? ':' + SLOT : '');

/** Harbor Town part of the save (TOWN.md section 5). */
function freshTown() {
  return {
    open: false,
    districts: [],               // opened district ids ('harbor', 'main')
    props: {},                   // property id -> owned level (0 / missing = not owned)
    unlocked: [],                // facility chain ids (PAINT_UNLOCKS, VIP_UNLOCKS ...)
    fameXp: 0,
    wrenches: [],
    classics: [],                // CLASSICS ids restored at least once (kept across nextShop)
    tills: {},
    pro: {},
    managers: [],
    project: null,
    vehicles: {},                // vehicle id -> { bay } where it was parked last ('home' = in its shed)
    garageDone: false,           // garage complete celebration shown
    stats: { rescues: 0, resprays: 0, vipServed: 0, vipPerfect: 0, washes: 0, restored: 0, tips: 0 },
    hints: {},
  };
}

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
    town: freshTown(),
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
      // pre-expansion saves have no `town`: defaults; partial ones get every missing key
      const t = data.town || {}, bt = base.town;
      state.town = {
        ...bt, ...t,
        stats: { ...bt.stats, ...t.stats }, hints: { ...bt.hints, ...t.hints }, props: { ...t.props },
        tills: { ...t.tills }, pro: { ...t.pro }, vehicles: { ...t.vehicles },
      };
      for (const k of ['districts', 'unlocked', 'wrenches', 'classics', 'managers']) if (!Array.isArray(state.town[k])) state.town[k] = [];
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
export function repairPayout(types, { tier = 1, vip = false, speedy = false, mult = 1 } = {}) {
  let sum = 0;
  for (const t of types) sum += PROBLEMS[t]?.price ?? 0;
  const base = sum * tier * (vip ? ECONOMY.vipMult : 1) * mult * payoutMult();
  const sm = speedy ? streakMult() : 1;
  const total = Math.max(1, Math.round(base * (speedy ? 1 + ECONOMY.speedyBonus : 1) * sm));
  return { total, base: Math.round(base), speedy, streakMult: sm };
}

// ---- offline earnings (only once the shop can run itself: valet + at least one mechanic) ----
// Extra offline income (facilities, businesses): fns of the saved state returning $ per second. Register with
// addOfflineSource(fn) and call refreshOffline(true) afterwards (game/index.js does it once after booting).
const offlineSources = [];
export function addOfflineSource(fn) { if (!offlineSources.includes(fn)) offlineSources.push(fn); }
export function offlineRate() {
  let extra = 0;
  for (const fn of offlineSources) { try { extra += Math.max(0, fn() || 0); } catch { /* ignore */ } }
  return garageOfflineRate() + extra;
}
function garageOfflineRate() {
  const m = mechanicCount();
  if (!m || !isUnlocked('valet')) return 0;
  const types = unlockedPartTypes();
  let avg = 0;
  for (const t of types) avg += PROBLEMS[t].price;
  avg /= types.length;
  const crews = Math.min(m, liftCount());
  // one crew finishes a ~2-job car roughly every 14 s
  return (crews * avg * 2 * upgradeValue('price') * shopMult() * fameMult() * collectionMult() * ECONOMY.offlineEfficiency) / 14;
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
export function refreshOffline(force = false) {
  if (!offline || force) computeOffline();
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

// Move to the next garage (the ferry): keeps gems + stats + restored classics, resets unlocks / upgrades / town.
export function nextShop() {
  state.shopLevel++;
  state.unlocked = [];
  state.upgrades = fresh().upgrades;
  const keep = state.town;
  state.town = { ...freshTown(), classics: keep.classics.slice(), hints: { ...keep.hints }, stats: { ...keep.stats } };
  state.cash = Math.round(ECONOMY.startCash * shopMult());
  setStreak(0);
  save();
  events.emit('cash:changed', { cash: state.cash, delta: 0 });
  events.emit('shop:changed', progress());
  events.emit('progress:changed', progress());
}

// ================================================================ Harbor Town (TOWN.md section 5)
const T = () => state.town;

// ---- town + districts ----
export const townOpen = () => !!T().open;
/** Opens the town (district 'harbor'). Returns false if it already was. Gameplay plays the moment on `town:opened`. */
export function openTown() {
  if (T().open) return false;
  T().open = true;
  if (!T().districts.includes('harbor')) T().districts.push('harbor');
  save();
  events.emit('town:opened');
  events.emit('district:opened', { id: 'harbor' });
  return true;
}
/** 'lot' is always open, 'harbor' with the town, others once bought. */
export function districtOpen(id) {
  if (id === 'lot') return true;
  if (id === 'harbor') return T().open;
  return T().districts.includes(id);
}
export function openDistrict(id) {
  if (id === 'harbor') return openTown();
  if (T().districts.includes(id)) return false;
  T().districts.push(id);
  save();
  events.emit('district:opened', { id });
  return true;
}

// ---- properties ----
export const propLevel = (id) => T().props[id] | 0;
export const owns = (id) => propLevel(id) > 0;
/** Every property except the ferry owned and the garage complete (the ferry's `requiresAll`). */
export function ownsAllProperties() {
  for (const id in PROPERTIES) if (!PROPERTIES[id].requiresAll && !owns(id)) return false;
  return UNLOCKS.every((u) => isUnlocked(u.id));
}
/**
 * Next level of a property: { level, price (x shopMult), fame, label, locked, reason } | null when maxed.
 * locked: fame too low ('fame') or the ferry's requirements not met ('all'). A closed district is not checked here.
 */
export function nextPropLevel(id) {
  const p = PROPERTIES[id];
  if (!p) return null;
  const lvl = propLevel(id);
  const L = p.levels[lvl];
  if (!L) return null;
  let reason = null;
  if (fameLevel() < (L.fame || 0)) reason = 'fame';
  else if (p.requiresAll && !ownsAllProperties()) reason = 'all';
  return { level: lvl + 1, price: Math.round(L.price * shopMult()), fame: L.fame || 0, label: L.label || null, locked: !!reason, reason };
}
/** Sets the property one level higher (the pay pad has taken the money already). Returns the new level. */
export function buyPropLevel(id) {
  const p = PROPERTIES[id];
  if (!p || propLevel(id) >= p.levels.length) return propLevel(id);
  const level = propLevel(id) + 1;
  T().props[id] = level;
  save();
  events.emit('property:changed', { id, level });
  events.emit('progress:changed', progress());
  return level;
}
/** Owned levels / all levels, plus the cheapest buyable next goal in an open district. */
export function townProgress() {
  let done = 0, total = 0, next = null;
  for (const id in PROPERTIES) {
    const p = PROPERTIES[id];
    done += Math.min(propLevel(id), p.levels.length); total += p.levels.length;
    if (!districtOpen(p.district)) continue;
    const n = nextPropLevel(id);
    if (n && (!next || (n.locked === next.locked ? n.price < next.price : !n.locked))) next = { id, name: p.name, ...n };
  }
  return { done, total, next };
}

// ---- facility unlock chains (PAINT_UNLOCKS, VIP_UNLOCKS ...) ----
export const townUnlocked = (id) => T().unlocked.includes(id);
export function markTownUnlocked(id) {
  if (townUnlocked(id)) return;
  T().unlocked.push(id);
  save();
}

// ---- fame ----
/** XP needed to go from level L to L + 1. */
export const fameNeed = (L) => Math.round(FAME.base * Math.pow(L + 1, FAME.exp));
export function fameProgress() {
  let xp = T().fameXp, level = 0;
  while (level < FAME.maxLevel && xp >= fameNeed(level)) { xp -= fameNeed(level); level++; }
  const need = level >= FAME.maxLevel ? 0 : fameNeed(level);
  return { level, xp, need, frac: need ? xp / need : 1, total: T().fameXp };
}
export const fameLevel = () => fameProgress().level;
export const fameMult = () => 1 + fameLevel() * FAME.pricePerLevel;
/** What a fame level opens: car classes, properties and districts whose fame requirement is exactly `level`. */
export function fameUnlocksAt(level) {
  const out = [];
  for (const k in TOWN_CAR_TYPES) if (TOWN_CAR_TYPES[k].fame === level) out.push({ kind: 'car', id: k, label: TOWN_CAR_TYPES[k].label });
  for (const id in PROPERTIES) PROPERTIES[id].levels.forEach((L, i) => {
    if (L.fame === level) out.push({ kind: 'property', id, level: i + 1, label: PROPERTIES[id].name });
  });
  for (const id in DISTRICTS) if (DISTRICTS[id].fame === level) out.push({ kind: 'district', id, label: DISTRICTS[id].label });
  return out;
}
/**
 * Add fame XP: a FAME.xp key ('repair', 'speedy', 'rescue' ...) or a number. Pro Gear 'renown' boosts it.
 * Emits fame:changed { xp, level, frac, delta, worldPos } and, per level gained, fame:levelup { level, unlocks[] }
 * (+FAME.gemsPerLevel gems each).
 */
export function addFame(kindOrAmount, worldPos) {
  let amount = typeof kindOrAmount === 'number' ? kindOrAmount : FAME.xp[kindOrAmount] || 0;
  amount *= 1 + proValue('renown');
  if (!(amount > 0)) return 0;
  const before = fameLevel();
  T().fameXp += amount;
  const fp = fameProgress();
  events.emit('fame:changed', { xp: fp.total, level: fp.level, frac: fp.frac, delta: amount, worldPos });
  for (let L = before + 1; L <= fp.level; L++) {
    addGems(FAME.gemsPerLevel);
    events.emit('fame:levelup', { level: L, unlocks: fameUnlocksAt(L) });
  }
  return amount;
}

// ---- payouts ----
export const collectionMult = () => 1 + T().classics.length * PROJECT.collectionBonus;
/** Everything every payout is multiplied with: price upgrade x shopMult x fame x collection x Pro tips x income boost. */
export function payoutMult() {
  return upgradeValue('price') * shopMult() * fameMult() * collectionMult() * (1 + proValue('tips')) * (incomeBoostActive() ? 2 : 1);
}
/** Tier of any car type (garage, town classes, VIP club cars). */
export const carTier = (type) => (CAR_TYPES[type] || TOWN_CAR_TYPES[type] || VIP_CAR_TYPES[type])?.tier ?? 1;
/** Garage car classes available now: CAR_TYPES + TOWN_CAR_TYPES whose fame level is reached. { type: { tier, weight } } */
export function carTypesAvailable() {
  const out = { ...CAR_TYPES };
  const lvl = fameLevel();
  for (const k in TOWN_CAR_TYPES) if (TOWN_CAR_TYPES[k].fame <= lvl) out[k] = TOWN_CAR_TYPES[k];
  return out;
}
/** Paint job. cans = number (or array) of canisters. Same speedy / streak rules as repairs. */
export function resprayPayout(cans, { tier = 1, premium = false, stripe = false, speedy = false } = {}) {
  const n = Array.isArray(cans) ? cans.length : cans;
  const base = n * PAINT.pricePerCan * tier * (premium ? PAINT.premiumMult : 1) * (stripe ? PAINT.stripeMult : 1) * payoutMult();
  const sm = speedy ? streakMult() : 1;
  const total = Math.max(1, Math.round(base * (speedy ? 1 + ECONOMY.speedyBonus : 1) * sm));
  return { total, base: Math.round(base), speedy, streakMult: sm };
}
/** VIP club job: stars = count or [careful, fast, spotless] booleans. The fast star also applies the streak. */
export function vipPayout(types, { tier = 1, stars = 0, speedy = false } = {}) {
  const n = Array.isArray(stars) ? stars.filter(Boolean).length : stars;
  let sum = 0;
  for (const t of types) sum += PROBLEMS[t]?.price ?? 0;
  const base = sum * tier * VIP.mult * payoutMult();
  const sm = speedy ? streakMult() : 1;
  const total = Math.max(1, Math.round(base * (1 + n * VIP.starBonus) * sm));
  return { total, base: Math.round(base), stars: n, streakMult: sm };
}
/** Wash fee for one car at the current wash tier (0 when not built). */
export function washFee(carTierValue = 1) {
  const lvl = propLevel('wash');
  if (!lvl) return 0;
  return Math.max(1, Math.round(WASH.fee[Math.min(lvl, WASH.fee.length) - 1] * carTierValue * payoutMult()));
}

// ---- Pro Gear (depot) ----
export const proLevel = (key) => T().pro[key] | 0;
/** Bonus of a Pro Gear track: level x per (stock: extra parts; others: fraction, use 1 + proValue(k)). */
export const proValue = (key) => proLevel(key) * (PRO_UPGRADES[key]?.per || 0);
export const proCost = (key) => Math.round(PRO_UPGRADES[key].base * Math.pow(PRO_UPGRADES[key].growth, proLevel(key)) * shopMult());
export function buyPro(key) {
  const u = PRO_UPGRADES[key];
  if (!u || proLevel(key) >= u.max) return false;
  if (!trySpend(proCost(key))) return false;
  T().pro[key] = proLevel(key) + 1;
  events.emit('upgrades:changed', { ...state.upgrades, pro: { ...T().pro } });
  save();
  return true;
}

// ---- tills (side businesses) ----
export function tillCap(id) {
  const b = BUSINESS[id], lvl = propLevel(id);
  if (!b || !lvl) return 0;
  return Math.round(b.income[Math.min(lvl, b.income.length) - 1] * b.capMinutes * shopMult() * fameMult());
}
export function addTill(id, amount) {
  const cap = tillCap(id);
  const cur = T().tills[id] || 0;
  const v = Math.min(cap, cur + amount);
  T().tills[id] = v;
  if (Math.floor(v) !== Math.floor(cur)) events.emit('till:changed', { id, amount: v, cap });
  return v;
}
/** Empties a till; returns the (rounded) amount it held. The caller pays it out (addCash). */
export function takeTill(id) {
  const v = Math.round(T().tills[id] || 0);
  T().tills[id] = 0;
  events.emit('till:changed', { id, amount: 0, cap: tillCap(id) });
  return v;
}

// ---- floor managers (academy) ----
export const hasManager = (id) => T().managers.includes(id);
/** Hire the floor manager of a facility ('garage' | 'paint' | 'vip'): fame + cash gated. Emits manager:hired { id }. */
export function buyManager(id) {
  const m = MANAGERS[id];
  if (!m || hasManager(id) || fameLevel() < (m.fame || 0)) return false;
  if (!trySpend(Math.round(m.price * shopMult()))) return false;
  T().managers.push(id);
  save();
  events.emit('manager:hired', { id });
  return true;
}

/** Classic ids (CLASSICS) for completeness checks. */
export const classicIds = () => CLASSICS.map((c) => c.id);

// autosave. Skipped while hidden: the game does not run in the background, and lastSeen must stay at the moment
// the player left so that time counts as offline earnings. (main.js also saves when the game is hidden.)
setInterval(() => { if (!document.hidden) save(); }, 5000);
window.addEventListener('beforeunload', save);
