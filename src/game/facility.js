// Facilities: the garage, the paint shop and the VIP club are the same machine (customer lane, bays, part
// stations, owners on foot, staff, unlock chain, exit) driven by a layout + behaviour hooks. A facility is
//   createFacility(ctx, def)    def = { id, layout, hooks?, classes?, unlocks?, ... }  (see TOWN.md section 6a)
// Every hook has a default = the garage's behaviour, so the garage itself is `createFacility(ctx, GARAGE_DEF)`.
import {
  createCar, randomCarLook, createLift, createPartStation, mechanicLook, valetLook,
} from '../models/index.js';
import {
  LAYOUT, ECONOMY, PROBLEMS, UNLOCKS, VISIBLE_PADS, TOWN, CAR_TYPES,
} from '../config.js';
import {
  state, unlockedPartTypes, isUnlocked, markUnlocked, unlockPrice, liftCount, upgradeValue, repairPayout, setStreak,
  addGems, addFame, carTier, carTypesAvailable, townOpen, townUnlocked, markTownUnlocked, shopMult,
} from '../core/state.js';
import { events } from '../core/events.js';
import { Car, createCars } from './cars.js';
import { Bay, createBays } from './lifts.js';
import { Station, createStations } from './stations.js';
import { Owner, createOwners } from './owners.js';
import { Mechanic, Valet, createStaff } from './staff.js';
import { createChainPads } from './pads.js';

/**
 * Normalised layout: the garage's LAYOUT uses lift / mechanic names, PAINT and VIP use bay / staff names.
 * Systems read only the normalised keys (bays, bayPostOffsetX, workOffsetZ, workMat, staffSpotOffset,
 * cashOffset, capture, staffIdle, driveArea ...); every original key stays available too.
 */
export function normalizeLayout(L) {
  return {
    ...L,
    bays: L.bays ?? L.lifts,
    bayPostOffsetX: L.bayPostOffsetX ?? L.liftPostOffsetX ?? 1.15,
    workOffsetZ: L.workOffsetZ ?? L.liftWorkOffsetZ,
    workMat: L.workMat ?? L.liftWorkMat,
    staffSpotOffset: L.staffSpotOffset ?? L.mechanicSpotOffset,
    cashOffset: L.cashOffset ?? L.liftCashOffset,
    capture: L.capture ?? L.liftCapture,
    staffIdle: L.staffIdle ?? L.mechanicIdle,
    driveArea: L.driveArea ?? L.bounds,
    scrapBinRadius: L.scrapBinRadius ?? 1.0,
    laneYaw: L.laneYaw ?? Math.PI / 2,
  };
}

/** Garage behaviour. A facility def's `hooks` override any of these (each gets the facility `fac` first). */
export const DEFAULT_HOOKS = {
  // ---------------------------------------------------------------- customers
  /** Look of a new customer car: { type, color, vip }. opts = spawn options ({ vip, type, problems }). */
  rollLook(fac, opts) {
    const vipChance = ECONOMY.vipChance * (isUnlocked('billboard') ? ECONOMY.billboardVipMult : 1);
    // VIPs are events: never two on the lot at once
    const vip = opts.vip ?? (!fac.cars.list.some((c) => c.vip) && Math.random() < vipChance);
    const look = randomCarLook({ vip });
    if (!look.vip) {
      const types = carTypesAvailable();
      if (opts.type && types[opts.type]) look.type = opts.type;
      else if (opts.type && CAR_TYPES[opts.type]) look.type = opts.type;
      else if (fac.forcedType) { look.type = fac.forcedType; fac.forcedType = null; }   // "New in town" class
      else look.type = pickWeighted(types) || look.type;
    }
    return look;
  },
  tier(fac, look) { return carTier(look.type); },
  /** Job types (= part types) of a new car: only unlocked types, duplicates allowed. */
  rollJobs(fac, opts) {
    const types = unlockedPartTypes();
    const min = ECONOMY.problemsMin;
    const max = Math.max(min, Math.min(ECONOMY.problemsCap, ECONOMY.problemsMaxBase + Math.floor(state.unlocked.length / ECONOMY.problemsPerUnlocks)));
    const n = min + Math.floor(Math.random() * (max - min + 1));
    const out = [];
    for (let i = 0; i < n; i++) out.push(types[Math.floor(Math.random() * types.length)]);
    return out;
  },
  /** Patience in seconds once the owner is out (fac.patienceMult lets add-ons like the lounge stack on it). */
  patience(fac, car) {
    return ECONOMY.patience * (isUnlocked('coffee') ? ECONOMY.coffeePatienceMult : 1) * (car.vip ? ECONOMY.vipPatienceMult : 1) * fac.patienceMult();
  },
  /** Car stopped in the lane for the first time (owner just popped out). */
  onArrived(fac, car) { events.emit('car:arrived', { vip: car.vip, facility: fac.id }); },
  spawnInterval(fac) {
    const base = Math.max(2.5, ECONOMY.spawnInterval - ECONOMY.spawnIntervalPerLift * (liftCount() - 1));
    return base * (isUnlocked('billboard') ? ECONOMY.billboardSpawnMult : 1) * fac.spawnMult();
  },
  canSpawn(fac) { return fac.ctx.game.started; },
  /** { spawn: {x, z}, path: [...] } up to (not including) the lane slot. Town open: from the west tunnel. */
  entryPath(fac) {
    const L = fac.L;
    const first = L.carEntry[0];
    const spawn = townOpen() || !L.carSpawn ? { x: TOWN.edge.westX, z: first.z } : L.carSpawn;
    return { spawn, path: L.carEntry.map((p) => ({ x: p.x, z: p.z })) };
  },
  /** After the owner is in: L.carExit, then on to the east tunnel once the town is open. */
  exitPath(fac) {
    const pts = fac.L.carExit.map((p) => ({ x: p.x, z: p.z }));
    const last = pts[pts.length - 1];
    if ((townOpen() || !fac.L.carSpawn) && last.x < TOWN.edge.eastX) pts.push({ x: TOWN.edge.eastX, z: last.z });
    return pts;
  },

  // ---------------------------------------------------------------- bays
  bayModel(fac, index) { return createLift(); },
  /** Static obstacles of a bay (garage: the two lift posts). */
  bayObstacles(fac, cfg) {
    const po = fac.L.bayPostOffsetX, hp = 0.22;
    return [
      { minX: cfg.x - po - hp, maxX: cfg.x - po + hp, minZ: cfg.z - hp, maxZ: cfg.z + hp },
      { minX: cfg.x + po - hp, maxX: cfg.x + po + hp, minZ: cfg.z - hp, maxZ: cfg.z + hp },
    ];
  },
  /** Work-seconds a job needs. */
  workTime(fac, job) { return PROBLEMS[job.type]?.work ?? 2; },
  /** Work rate of the player standing in the work zone / of one mechanic. */
  playerRate(fac) { return upgradeValue('repair'); },
  staffRate(fac) { return ECONOMY.mechanicRate * upgradeValue('repair'); },
  /** Cash for a finished car: { total, speedy, ... } (garage: repairPayout). */
  payout(fac, car) {
    const speedy = car.patience > 0;
    // car.bonusText (e.g. "Rescue x2.5") is floated next to the payout
    return { ...repairPayout(car.types, { tier: car.tier, vip: car.vip, speedy, mult: car.payMult || 1 }), bonusText: car.bonusText || null };
  },
  /** Bookkeeping when a car is finished (streak, stats, gems, fame, events). */
  onFinished(fac, car, pay) {
    if (pay.speedy) setStreak(state.streak + 1); else setStreak(0);
    const st = state.stats;
    st.repaired++; st.jobsDone += car.types.length;
    if (car.vip) { st.vips++; addGems(ECONOMY.vipGems); }
    addFame(pay.speedy ? 'speedy' : 'repair', car.pos);
    events.emit('car:repaired', { count: st.repaired, vip: car.vip, speedy: pay.speedy, total: pay.total, facility: fac.id, car });
  },

  // ---------------------------------------------------------------- stations
  stationModel(fac, key) { return createPartStation(key); },
  /** Part type a station hands out (garage: same as the key; paint: 'spray:<colour>'). */
  partType(fac, key) { return key; },
  stationIcon(fac, key) { return key; },
  restockTime(fac, key) { return (PROBLEMS[key]?.restock ?? 3) * upgradeValue('supply'); },
  stationMax(fac, key) { return ECONOMY.stationMax; },

  // ---------------------------------------------------------------- staff
  mechanicLook(fac, i) { return mechanicLook(i); },
  valetLook(fac) { return valetLook(); },

  // ---------------------------------------------------------------- unlock chain
  /** Pay pad position of an unlock entry (u.pad wins; station / tank -> pickup zone; lift / bay -> bay centre). */
  padPosition(fac, u) {
    const L = fac.L;
    if (u.pad) return { x: u.pad.x, z: u.pad.z };
    if ((u.type === 'station' || u.type === 'tank') && L.stations[u.key]) {
      const s = L.stations[u.key]; return { x: s.x, z: s.z + L.stationPickupOffsetZ };
    }
    if ((u.type === 'lift' || u.type === 'bay') && L.bays[u.index]) { const b = L.bays[u.index]; return { x: b.x, z: b.z }; }
    return { x: 0, z: 0 };
  },
  /** Create what an unlock entry stands for (`from` = pad position when just bought, null when loading). */
  applyUnlock(fac, u, from) {
    switch (u.type) {
      case 'station': case 'tank': fac.stations.add(u.key, !!from); break;
      case 'lift': case 'bay': fac.bays.add(u.index, !!from); break;
      case 'mechanic': fac.staff.addMechanic(u.index, from); break;
      case 'valet': fac.staff.addValet(from); break;
    }
  },
};

function pickWeighted(types) {
  let total = 0;
  for (const k in types) total += types[k].weight || 0;
  let r = Math.random() * total;
  for (const k in types) { r -= types[k].weight || 0; if (r <= 0) return k; }
  return null;
}

/** The garage (LAYOUT, UNLOCKS). Its extras (coffee, billboard, valet stand, scrap bin) live in extras.js. */
export const GARAGE_DEF = {
  id: 'garage',
  layout: LAYOUT,
  stayText: 'Customer cars stay on the lot',
  /** Built at creation (before the saved unlocks are applied). */
  initial: { stations: ['tire'], bays: [0] },
  unlocks: {
    list: UNLOCKS,
    isUnlocked,
    markUnlocked,
    price: (u) => unlockPrice(u),
    event: 'unlock',
  },
  hooks: {
    applyUnlock(fac, u, from) {
      const ex = fac.ctx.extras;
      switch (u.type) {
        case 'valet': ex.addValetStand(!!from); fac.staff.addValet(from); break;
        case 'coffee': ex.addCoffee(!!from); break;
        case 'billboard': ex.addBillboard(!!from); break;
        default: DEFAULT_HOOKS.applyUnlock(fac, u, from);
      }
    },
  },
};

/** Default chain helpers for town facilities (PAINT_UNLOCKS, VIP_UNLOCKS): state.town.unlocked, x shopMult. */
export function townChain(list) {
  return {
    list,
    isUnlocked: townUnlocked,
    markUnlocked: markTownUnlocked,
    price: (u) => Math.round(u.price * shopMult()),
    event: 'townunlock',
  };
}

/**
 * Build one facility inside a world ctx. Returns `fac`:
 *   fac.id, fac.def, fac.L (normalised layout), fac.hooks (merged; may be patched at runtime by add-ons),
 *   fac.cars / bays / stations / owners / staff / pads (systems), fac.scrap ({ x, z, radius } or null),
 *   fac.applyUnlock(u, from), fac.patienceMult() / spawnMult() (products of fac.mods.*), fac.dispose().
 */
export function createFacility(ctx, def) {
  const fac = {
    id: def.id, def, ctx,
    L: normalizeLayout(def.layout),
    hooks: { ...DEFAULT_HOOKS, ...def.hooks },
    classes: { Car, Bay, Station, Owner, Mechanic, Valet, ...def.classes },
    stayText: def.stayText || 'Customer cars stay at the shop',
    forcedType: null,
    /** Multipliers other systems may add (e.g. lounge: mods.patience.lounge = 1.35). */
    mods: { patience: {}, spawn: {} },
    patienceMult() { let m = 1; for (const k in fac.mods.patience) m *= fac.mods.patience[k]; return m; },
    spawnMult() { let m = 1; for (const k in fac.mods.spawn) m *= fac.mods.spawn[k]; return m; },
    scrap: def.layout.scrapBin ? { x: def.layout.scrapBin.x, z: def.layout.scrapBin.z, radius: def.layout.scrapBinRadius ?? 1.0 } : null,
  };
  /** Call a hook: fac.h('payout', car). */
  fac.h = (name, ...args) => fac.hooks[name](fac, ...args);

  fac.stations = createStations(ctx, fac);
  fac.bays = createBays(ctx, fac);
  fac.owners = createOwners(ctx, fac);
  fac.cars = createCars(ctx, fac);
  fac.staff = createStaff(ctx, fac);

  fac.applyUnlock = (u, from) => fac.h('applyUnlock', u, from);
  const init = def.initial || {};
  for (const k of init.stations || []) fac.stations.add(k, false);
  for (const i of init.bays || []) fac.bays.add(i, false);
  if (def.unlocks) {
    for (const u of def.unlocks.list) if (def.unlocks.isUnlocked(u.id)) fac.applyUnlock(u, null);
    fac.pads = createChainPads(ctx, fac, def.unlocks);
    fac.pads.refresh(false);
  }
  if (def.setup) def.setup(fac);

  fac.dispose = () => {
    for (const s of [fac.cars, fac.bays, fac.stations, fac.owners, fac.staff, fac.pads]) s?.dispose();
    def.teardown?.(fac);
  };
  return fac;
}

/** Which unlock-chain entries are still to buy (in order) for a facility. */
export function pendingUnlocks(fac) {
  const c = fac.def.unlocks;
  return c ? c.list.filter((u) => !c.isUnlocked(u.id)) : [];
}
export { VISIBLE_PADS };
