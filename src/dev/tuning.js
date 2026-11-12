// Dev tool: live balance tuning. Every number of the economy / balance tables in config.js can be overridden. The
// overrides live in localStorage and are re-applied at boot (before the game reads them) while the dev tool is on;
// turning the dev tool off (?dev=0) drops them from the game without deleting them.
//
// Paths: 'ECONOMY.spawnInterval', 'PROBLEMS.oil.work', 'UNLOCKS.#lift1.price' (#id = the array entry with that id,
// so a reordered table still hits the right entry), 'RESCUE.interval.0'.
// Layout numbers (positions, rectangles, sizes, radii) are left out on purpose: moving them would break the world.
import * as C from '../config.js';

const KEY = 'wrench-bay-dev:tuning';

/** Every tunable table, by name. */
const TABLES = {
  ECONOMY: C.ECONOMY, PLAYER: C.PLAYER, PROBLEMS: C.PROBLEMS, BOOSTS: C.BOOSTS,
  CAR_TYPES: C.CAR_TYPES, TOWN_CAR_TYPES: C.TOWN_CAR_TYPES, VIP_CAR_TYPES: C.VIP_CAR_TYPES,
  UNLOCKS: C.UNLOCKS, UPGRADES: C.UPGRADES, PRO_UPGRADES: C.PRO_UPGRADES,
  FAME: C.FAME, DISTRICTS: C.DISTRICTS, PROPERTIES: C.PROPERTIES, MANAGERS: C.MANAGERS,
  BUSINESS: C.BUSINESS, LUNCH: C.LUNCH, TOWN_EVENTS: C.TOWN_EVENTS, TRAFFIC: C.TRAFFIC, PEDESTRIANS: C.PEDESTRIANS,
  RESCUE: C.RESCUE, WASH: C.WASH, LOUNGE: C.LOUNGE, PAINT: C.PAINT, PAINT_UNLOCKS: C.PAINT_UNLOCKS,
  VIP: C.VIP, VIP_UNLOCKS: C.VIP_UNLOCKS, CLASSICS: C.CLASSICS, PROJECT: C.PROJECT,
};

/** Accordion groups of the Tune tab. icon = ui ICON key. */
export const GROUPS = [
  { id: 'economy', label: 'Economy', icon: 'cash', tables: ['ECONOMY'] },
  { id: 'player', label: 'Player & boosts', icon: 'speed', tables: ['PLAYER', 'BOOSTS'] },
  { id: 'repairs', label: 'Repairs & parts', icon: 'wrench', tables: ['PROBLEMS'] },
  { id: 'cars', label: 'Car classes', icon: 'car', tables: ['CAR_TYPES', 'TOWN_CAR_TYPES', 'VIP_CAR_TYPES'] },
  { id: 'garage', label: 'Garage unlocks', icon: 'lock', tables: ['UNLOCKS'] },
  { id: 'upgrades', label: 'Upgrades & Pro Gear', icon: 'gauge', tables: ['UPGRADES', 'PRO_UPGRADES', 'MANAGERS'] },
  { id: 'fame', label: 'Fame', icon: 'star', tables: ['FAME'] },
  { id: 'town', label: 'Town properties', icon: 'map', tables: ['DISTRICTS', 'PROPERTIES', 'BUSINESS', 'LUNCH'] },
  { id: 'services', label: 'Rescue, wash, lounge', icon: 'tow', tables: ['RESCUE', 'WASH', 'LOUNGE'] },
  { id: 'facilities', label: 'Paint shop & VIP club', icon: 'paintShop', tables: ['PAINT', 'PAINT_UNLOCKS', 'VIP', 'VIP_UNLOCKS'] },
  { id: 'projects', label: 'Classics & projects', icon: 'junk', tables: ['CLASSICS', 'PROJECT'] },
  { id: 'world', label: 'Traffic & events', icon: 'bell', tables: ['TRAFFIC', 'PEDESTRIANS', 'TOWN_EVENTS'] },
];

// Object-valued keys that hold layout (positions, rectangles, paths) and number keys that are geometry.
const SKIP_OBJ = new Set([
  'pad', 'plot', 'upgradePad', 'managerPad', 'walls', 'forecourt', 'bays', 'stations', 'till', 'safe', 'path', 'stands',
  'showroom', 'junkOffice', 'junkGate', 'size', 'spots', 'drop', 'home', 'approach', 'kioskStop', 'kiosk', 'tunnel', 'exit',
  'zone', 'pile', 'vacuums', 'seats', 'aisleX', 'door', 'crossing', 'tipTray', 'vending', 'vendingPile', 'tv', 'bar',
  'aquarium', 'arcade', 'loungeSpots', 'valetStand', 'staffIdle', 'driveArea', 'capture', 'carEntry', 'carExit',
  'queueSlots', 'staffSpotOffset', 'cashOffset', 'turntable', 'polishRing', 'redCarpet', 'stationSize', 'pickup', 'table',
  'booms', 'hoarding', 'noGo', 'turntables', 'desk',
]);
const SKIP_NUM = new Set([
  'x', 'y', 'z', 'minX', 'maxX', 'minZ', 'maxZ', 'radius', 'length', 'width', 'height', 'thickness', 'laneZ', 'seatYaw',
  'yaw', 'r', 'queueLaneZ', 'queuePickupOffsetZ', 'queuePickupRadius', 'ownerWalkZ', 'staffLaneZ', 'bayPostOffsetX',
  'workOffsetZ', 'workRadius', 'stationPickupOffsetZ', 'stationZoneRadius', 'hookRadius', 'color', 'index',
]);

// ---------------------------------------------------------------- paths
function step(o, seg) {
  if (o == null) return undefined;
  if (seg[0] === '#') return Array.isArray(o) ? o.find((e) => e && e.id === seg.slice(1)) : undefined;
  return o[Array.isArray(o) ? +seg : seg];
}
/** { obj, key } holding the number at `path`, or null when the path no longer exists. */
function resolve(path) {
  const segs = path.split('.');
  let o = TABLES[segs[0]];
  for (let i = 1; i < segs.length - 1; i++) o = step(o, segs[i]);
  if (o == null || typeof o !== 'object') return null;
  const last = segs[segs.length - 1];
  const key = Array.isArray(o) ? +last : last;
  return typeof o[key] === 'number' ? { obj: o, key } : null;
}

// ---------------------------------------------------------------- overrides
const defaults = {};      // path -> original value (captured before the first change)
let saved = {};           // path -> value
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
const listeners = new Set();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* ignore */ } };
const notify = () => listeners.forEach((fn) => fn());
/** fn() after any tuning change. Returns an unsubscribe function. */
export function onTuning(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Writes the saved overrides into the config tables. Call once at boot, before the game reads them. */
export function applySaved() {
  for (const path in saved) {
    const r = resolve(path);
    if (!r) continue;   // stale path (config changed): kept in storage, shown nowhere
    if (!(path in defaults)) defaults[path] = r.obj[r.key];
    r.obj[r.key] = saved[path];
  }
}
export const valueOf = (path) => { const r = resolve(path); return r ? r.obj[r.key] : undefined; };
export const defaultOf = (path) => (path in defaults ? defaults[path] : valueOf(path));
export const isTuned = (path) => path in saved && !!resolve(path);
/** Number of live overrides (stale ones are not counted). */
export const tunedCount = () => Object.keys(saved).filter((p) => resolve(p)).length;

export function setValue(path, v, quiet = false) {
  const r = resolve(path);
  if (!r || !Number.isFinite(v)) return false;
  if (!(path in defaults)) defaults[path] = r.obj[r.key];
  r.obj[r.key] = v;
  if (v === defaults[path]) delete saved[path]; else saved[path] = v;
  persist();
  if (!quiet) notify();
  return true;
}
export function resetValue(path, quiet = false) {
  const r = resolve(path);
  if (r && path in defaults) r.obj[r.key] = defaults[path];
  delete saved[path];
  persist();
  if (!quiet) notify();
}
export function resetAll() {
  for (const path of Object.keys(saved)) resetValue(path, true);
  saved = {};
  persist();
  notify();
}

// ---------------------------------------------------------------- rows
/** Every tunable number of a table: [{ path, table, where, key, int }] (where = readable parent, e.g. 'tow · levels 2'). */
function walk(table) {
  const out = [];
  const visit = (o, segs, where) => {
    if (Array.isArray(o)) {
      o.forEach((v, i) => {
        const name = typeof v?.id === 'string' ? v.id : segs.length > 1 ? `${segs[segs.length - 1]} ${i + 1}` : String(i + 1);
        if (typeof v === 'number') out.push(row([...segs, String(i)], where, name, v));
        else if (v && typeof v === 'object') {
          const seg = typeof v.id === 'string' ? '#' + v.id : String(i);
          visit(v, [...segs, seg], where ? `${where} · ${name}` : name);
        }
      });
      return;
    }
    for (const k in o) {
      const v = o[k];
      if (typeof v === 'number') { if (!SKIP_NUM.has(k)) out.push(row([...segs, k], where, k, v)); }
      else if (v && typeof v === 'object' && !SKIP_OBJ.has(k)) {
        if (Array.isArray(v) && v.every((x) => typeof x === 'number')) {
          v.forEach((x, i) => out.push(row([...segs, k, String(i)], where, `${k} ${i + 1}`, x)));
        } else visit(v, [...segs, k], Array.isArray(v) ? where : where ? `${where} · ${k}` : k);   // array entries name themselves
      }
    }
  };
  const row = (segs, where, key, v) => {
    const path = segs.join('.');
    const def = defaultOf(path);
    return { path, table, where, key, int: Number.isInteger(def ?? v) };
  };
  visit(TABLES[table], [table], '');
  return out;
}
const cache = {};
/** Rows of one group (cached: the shape of the config never changes at runtime). */
export function groupRows(groupId) {
  if (cache[groupId]) return cache[groupId];
  const g = GROUPS.find((x) => x.id === groupId);
  return (cache[groupId] = g ? g.tables.flatMap(walk) : []);
}
export const allRows = () => GROUPS.flatMap((g) => groupRows(g.id).map((r) => ({ ...r, group: g.id })));

// ---------------------------------------------------------------- cheats = named sets of overrides
const each = (table, field) => Object.keys(TABLES[table]).map((k) => `${table}.${k}.${field}`);
/** Toggle presets for quick testing. values() = { path: value } (computed from the untouched defaults). */
export const CHEATS = [
  { id: 'walk', icon: 'speed', label: 'Fast feet', sub: 'Walk x2, drive x1.5',
    values: () => ({ 'PLAYER.speed': defaultOf('PLAYER.speed') * 2, 'ECONOMY.driveSpeed': defaultOf('ECONOMY.driveSpeed') * 1.5 }) },
  { id: 'hands', icon: 'capacity', label: 'Big hands', sub: 'Carry 12 parts',
    values: () => ({ 'PLAYER.carryBase': 12 }) },
  { id: 'repair', icon: 'wrench', label: 'Instant repairs', sub: 'Every job takes a blink',
    values: () => Object.fromEntries([...each('PROBLEMS', 'work'), 'PAINT.work', 'VIP.work'].map((p) => [p, 0.05])) },
  { id: 'restock', icon: 'crate', label: 'Instant restock', sub: 'Stations refill at once',
    values: () => Object.fromEntries([...each('PROBLEMS', 'restock'), 'PAINT.restock', 'VIP.kitRestock'].map((p) => [p, 0.1])) },
  { id: 'patience', icon: 'happy', label: 'Endless patience', sub: 'Customers never get upset',
    values: () => ({ 'ECONOMY.patience': 36000, 'PAINT.patience': 36000, 'VIP.patience': 36000 }) },
  { id: 'pads', icon: 'tag', label: 'Quick pay pads', sub: 'Pads drain in 0.15 s',
    values: () => ({ 'ECONOMY.padDrainTime': 0.15 }) },
  { id: 'rush', icon: 'car', label: 'Rush of cars', sub: 'Customers arrive non-stop',
    values: () => ({ 'ECONOMY.spawnInterval': 1, 'PAINT.spawnInterval': 3, 'VIP.spawnInterval': 8 }) },
  { id: 'fame', icon: 'star', label: 'Fame x10', sub: 'Every fame reward is worth 10x',
    values: () => Object.fromEntries(Object.keys(C.FAME.xp).map((k) => [`FAME.xp.${k}`, defaultOf(`FAME.xp.${k}`) * 10])) },
];
const near = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
export function cheatOn(id) {
  const c = CHEATS.find((x) => x.id === id);
  if (!c) return false;
  const vals = c.values();
  return Object.keys(vals).every((p) => isTuned(p) && near(valueOf(p), vals[p]));
}
export function setCheat(id, on) {
  const c = CHEATS.find((x) => x.id === id);
  if (!c) return;
  const vals = c.values();
  for (const p in vals) { if (on) setValue(p, vals[p], true); else resetValue(p, true); }
  notify();
}
