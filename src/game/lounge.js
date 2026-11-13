// Waiting lounge "Harbor Lounge" (TOWN.md 4.7). While the 'lounge' property is built, the garage's customers wait
// inside the annex instead of on the forecourt patio (tier 0 = the patio, LAYOUT.loungeSpots: unchanged without it).
//   - seats: LOUNGE.seats become the garage owners' waiting spots (owners.setSpots); they sit facing the TV;
//   - route in: car door -> along ownerWalkZ -> south kerb of the zebra crossing (LOUNGE.crossing) -> over the exit
//     lane -> along the glass front -> in through the open door (LOUNGE.door) -> up the aisle (LOUNGE.aisleX) ->
//     a step in front of the seat, turn round, sit back onto it;
//   - route out (car ready, car at the pickup stop, or the car left without them): stand up, the same way back to
//     the south kerb, then the legacy curb queue / car door / street. Routes are planned from where the owner
//     stands, so a car that is ready while its owner is still walking in (or out) never sends anyone through a wall;
//   - crossing: owners on it are ctx.movers with `ped` (AI cars stop for them and never ghost through); an owner
//     waits at the kerb while a car is on the crossing or rolling onto it (at most KERB_MAX s);
//   - the walk is long, so a lounge owner sets owner.farWalk: the car at the pickup stop waits for them (cars.js);
//   - patience x LOUNGE.tiers[level].patience (garage.mods.patience.lounge).
// Owners already waiting on the patio when the lounge opens stay there until their car is done.
// Not built here yet (TOWN.md 4.7): tips on the tip tray, vending coins, the tier 2 barista / arcade, fame.
// Debug: __game.lounge.state().
import { LOUNGE, LAYOUT } from '../config.js';
import { propLevel } from '../core/state.js';
import { registerPropertySystem } from './registry.js';
import { Owner } from './owners.js';
import { angleDiff, damp } from './util.js';

const C = LOUNGE.crossing, D = LOUNGE.door, W = LOUNGE.walls;
const LANE_Z = (C.minZ + C.maxZ) / 2;
const KERB_S = { x: C.x, z: C.maxZ + 0.45 };      // forecourt side of the crossing
const KERB_N = { x: C.x, z: C.minZ - 0.45 };      // lounge side
const FRONT_Z = W.maxZ - 1.05;                     // walkway inside the glass front (clear of the column-end tables)
const SEAT_STEP = 0.45;                            // stop this far in front of the seat, turn round, sit back onto it
const KERB_MAX = 4;                                // never wait at the kerb longer than this (a car parked on it)
const STAND_T = 0.3;                               // getting up off the sofa before walking
const CAR_HALF = 1.45;                             // car centre -> bumper, with a little air
const BACK_X = Math.max(...LOUNGE.seats.map((s) => s.x)) + 0.45;   // east of this: behind the last sofa row
const AISLES = [...LOUNGE.aisleX].sort((a, b) => a - b);

/** The aisle that serves a seat column (the aisle runs in front of the sofas, on their west side). */
function aisleFor(x) {
  let a = AISLES[0];
  for (const ax of AISLES) if (ax <= x + 0.05) a = ax;
  return a;
}
const inside = (p) => p.x > W.minX - 0.3 && p.x < W.maxX + 0.3 && p.z < W.maxZ + 0.3;

/** Is a car on the crossing, or rolling onto it too close to stop? (An owner at the kerb waits for it.) */
function crossingBusy(ctx) {
  const cars = ctx.allCars;
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (c.mode === 'gone' || c.mode === 'snap' || c.mode === 'lift' || c.mode === 'ready') continue;
    if (Math.abs(c.pos.z - LANE_Z) > 1.4) continue;
    if (c.pos.x + CAR_HALF > C.minX - 0.05 && c.pos.x - CAR_HALF < C.maxX + 0.05) return true;
    // heading +x towards it (the pickup stop is just west of the crossing; a car pulling in there stops short)
    if (c.mode !== 'toPickup' && c.speed > 0.5 && Math.sin(c.yaw) > 0.5 && c.pos.x < C.minX && c.pos.x + CAR_HALF > C.minX - 2.2) return true;
  }
  return false;
}

export class LoungeOwner extends Owner {
  constructor(sys, car) {
    super(sys, car);
    this.farWalk = false;
    this.kerbT = 0;
    this.standT = 0;
  }

  /** Car door -> seat (lounge spots); patio spots (none while the lounge exists) keep the legacy route. */
  loungePath(door, s) {
    if (!s || !s.lounge) return super.loungePath(door, s);
    const z = this.L.ownerWalkZ;
    return [
      { x: door.x, z }, { x: C.x, z }, { ...KERB_S }, { ...KERB_N },
      { x: D.x, z: D.z }, { x: D.x, z: FRONT_Z },
      ...this.innerPath(s),
    ];
  }
  /** Inside the door -> the spot: a seat from its aisle (stop in front of it), a standing spot from behind the sofas. */
  innerPath(s) {
    if (!s.sit) return [{ x: s.x, z: FRONT_Z }, { x: s.x, z: s.z }];
    const a = aisleFor(s.x);
    return [{ x: a, z: FRONT_Z }, { x: a, z: s.z }, { x: s.x - SEAT_STEP, z: s.z }];
  }
  /** From where the owner stands (seat, aisle, door, crossing ...) back to the south kerb; [] when already south. */
  toKerb() {
    const p = this.pos, pts = [];
    const inRoom = inside(p);
    if (inRoom) {
      if (p.z < FRONT_Z - 0.3) {
        if (p.x > BACK_X) pts.push({ x: p.x, z: FRONT_Z });
        else { const a = aisleFor(p.x); pts.push({ x: a, z: p.z }, { x: a, z: FRONT_Z }); }
      }
      pts.push({ x: D.x, z: FRONT_Z }, { x: D.x, z: D.z });
    }
    const north = inRoom || (p.z < C.minZ - 0.1 && p.x > C.minX - 1.2);
    const onLane = !north && p.z < C.maxZ + 0.3 && Math.abs(p.x - C.x) < 1.6;
    if (north) pts.push({ ...KERB_N });
    if (north || onLane) pts.push({ ...KERB_S });
    return pts;
  }
  curbPath(i) { return [...this.toKerb(), ...super.curbPath(i)]; }
  leavePath() {
    const pts = this.toKerb();
    const last = pts.length ? pts[pts.length - 1] : this.pos;
    const sx = this.L.ownerCurb.x + 1.9, sz = LAYOUT.street.sidewalkZ;
    return [...pts, { x: sx, z: last.z }, { x: sx, z: sz }, { x: sx + 7.8, z: sz }];
  }

  standUp() {
    if (!this.sitting) return;
    this.sitting = false;
    this.ch.setSitting(false);
    this.standT = STAND_T;
  }
  goCurb() { this.standUp(); super.goCurb(); }
  board(car) {
    this.standUp();
    super.board(car);
    if (this.state !== 'toCar') return;
    const pre = this.toKerb();
    this.farWalk = pre.length > 0;
    this.path = [...pre, ...this.path];
  }
  abandon() { this.standUp(); this.farWalk = false; super.abandon(); }

  /** At a kerb with the crossing as the next step? */
  atKerb() {
    const n = this.path[0];
    if (!n || n.x !== C.x || Math.abs(this.pos.x - C.x) > 0.2) return false;
    return (n.z === KERB_N.z && this.pos.z > C.maxZ + 0.2) || (n.z === KERB_S.z && this.pos.z < C.minZ - 0.2);
  }
  hold(dt) {
    this.cur = 0;
    this.ch.update(dt, 0);
    this.emo.update(dt, this.group);
  }

  update(dt) {
    if (this.state === 'hopOut' || this.state === 'boarding') { super.update(dt); return; }
    if (this.standT > 0) { this.standT -= dt; this.hold(dt); return; }
    if (this.atKerb()) {
      if (this.kerbT < KERB_MAX && crossingBusy(this.sys.ctx)) { this.kerbT += dt; this.hold(dt); return; }
    } else this.kerbT = 0;
    super.update(dt);
    // seated waiting: turn round in front of the seat, then sit back onto it
    const s = this.spot;
    if (this.state === 'lounge' && s && s.sit) {
      if (!this.sitting) {
        if (Math.abs(angleDiff(this.yaw, s.yaw)) < 0.2) { this.sitting = true; this.ch.setSitting(true); }
      } else {
        const k = damp(9, dt);
        this.pos.x += (s.x - this.pos.x) * k;
        this.pos.z += (s.z - this.pos.z) * k;
        this.yaw = s.yaw; this.group.rotation.y = s.yaw;
      }
    }
  }
}

registerPropertySystem('lounge', (ctx, prop) => {
  const garage = ctx.facilities.garage;
  if (!garage) return null;
  const owners = garage.owners;
  const prevOwner = garage.classes.Owner;
  const prevOverflow = owners.overflowSpot;

  garage.classes.Owner = LoungeOwner;
  owners.setSpots(LOUNGE.seats.map((s) => ({ x: s.x, z: s.z, yaw: LOUNGE.seatYaw, sit: true, lounge: true })));
  // debug spawns beyond the 12 seats stand behind the last sofa row, facing the TV
  owners.overflowSpot = (k) => ({ x: BACK_X + 0.9 + (k % 3) * 0.75, z: FRONT_Z - 1.5 - Math.floor(k / 3) * 0.9, yaw: LOUNGE.seatYaw, lounge: true });

  const tier = () => Math.max(1, Math.min(LOUNGE.tiers.length - 1, propLevel('lounge') || prop.level || 1));
  const applyTier = () => { garage.mods.patience.lounge = LOUNGE.tiers[tier()].patience; };
  applyTier();

  // people on the crossing: a pool of movers (hidden when unused) the AI cars stop for
  const peds = [];
  function syncPeds() {
    let n = 0;
    const list = owners.list;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.state === 'gone' || o.state === 'boarding' || o.state === 'hopOut') continue;
      const p = o.pos;
      if (p.x < C.minX - 0.3 || p.x > C.maxX + 0.3 || p.z < C.minZ - 0.25 || p.z > C.maxZ + 0.25) continue;
      let m = peds[n];
      if (!m) { m = { pos: p, radius: 0.45, ped: true, hidden: true }; peds.push(m); ctx.movers.push(m); }
      m.pos = p; m.hidden = false;
      n++;
    }
    for (let i = n; i < peds.length; i++) peds[i].hidden = true;
  }

  const api = {
    state: () => owners.list.map((o) => ({
      state: o.state, x: +o.pos.x.toFixed(2), z: +o.pos.z.toFixed(2), sitting: !!o.sitting,
      seat: o.spot ? (o.spot.lounge ? (o.spot.sit ? o.spot.i : 'standing') : 'patio') : null, farWalk: !!o.farWalk,
    })),
    get crossingBusy() { return crossingBusy(ctx); },
    get peds() { return peds.filter((m) => !m.hidden).length; },
  };

  return {
    update() {
      if (typeof window !== 'undefined' && window.__game && window.__game.lounge !== api) window.__game.lounge = api;
      syncPeds();
    },
    onLevel() { applyTier(); },
    dispose() {
      if (garage.classes.Owner === LoungeOwner) garage.classes.Owner = prevOwner;
      owners.setSpots(garage.L.loungeSpots);
      owners.overflowSpot = prevOverflow;
      delete garage.mods.patience.lounge;
      for (const m of peds) { const k = ctx.movers.indexOf(m); if (k >= 0) ctx.movers.splice(k, 1); }
      peds.length = 0;
      if (typeof window !== 'undefined' && window.__game?.lounge === api) delete window.__game.lounge;
    },
  };
});
