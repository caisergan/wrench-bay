// Paint shop "Spray Bay" (TOWN.md 4.8): a second facility on the facility machine (TOWN.md 6a), created when the
// 'paint' property is built. What makes it its own game:
//   - customers want ONE colour (never their car's own, never one you don't stock); the job bubble shows a canister
//     tile in that colour per canister (PAINT.cans by car type). Stripe jobs (after the stripe kit) add one canister
//     of a second colour, sprayed after the body;
//   - drive the car into a free booth through its south end; it is masked (paper over glass, lights, wheels);
//   - fetch canisters of exactly that colour from the paint tanks, deliver them in the work zone in front of the
//     nose (the booth's north end, behind its sliding doors). Wrong colours are useless: dump them in the waste drum (PAINT.scrapBin);
//   - spray: from the first canister the booth's doors shut (bi-fold behind the car, sliding doors at the nose end
//     whenever nobody walks through), the painter holds a spray gun,
//     a mist in that colour comes out of the gun and a light haze fills the booth, and the new colour sweeps over
//     the body from nose to tail, one section per canister;
//   - cure: every canister sprayed -> the booth bakes for PAINT.cure s (IR lamps: cureIR) with its timer ring
//     counting. Nobody is needed for that: start the next car meanwhile;
//   - done: doors open, green beacon, masking off, a gloss, payout (resprayPayout) beside the booth, the car backs
//     out, picks up its owner at PAINT.pickupStop and leaves in its new colour.
// Staff: painters (mechanic logic, spray pose) and the prep tech (valet logic: drives waiting cars into booths).
// Shared with the garage: the speedy streak, repair-speed / capacity / supply / price upgrades.
// Debug: __game.spawnPaintCar({ color, stripe, type }), __game.paint.state().
import * as THREE from 'three';
import * as M from '../models/index.js';
import { scene } from '../core/engine.js';
import { PAINT, PAINT_COLORS, PAINT_UNLOCKS, ECONOMY } from '../config.js';
import {
  state, townUnlocked, setStreak, addFame, upgradeValue, resprayPayout, addOfflineSource, owns, hasManager,
  shopMult, fameMult, collectionMult,
} from '../core/state.js';
import { events } from '../core/events.js';
import { ui } from '../ui/index.js';
import { registerFacility } from './registry.js';
import { DEFAULT_HOOKS, townChain } from './facility.js';
import { Car } from './cars.js';
import { Bay } from './lifts.js';
import { Station } from './stations.js';
import { Mechanic } from './staff.js';
import { tween } from './tween.js';
import { Tag } from './util.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();

// ---------------------------------------------------------------- colours
const hexOf = (key) => PAINT_COLORS[key]?.hex ?? 0xcccccc;
const cssOf = (hex) => '#' + (hex >>> 0).toString(16).padStart(6, '0');
const colorOf = (type) => (typeof type === 'string' && type.startsWith('spray:') ? type.slice(6) : null);
const can = (key) => 'spray:' + key;
/** Would a respray from `a` to `b` be visible at all? (cherry -> signal red is not) */
function sameColor(a, b) {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255), dg = ((a >> 8) & 255) - ((b >> 8) & 255), db = (a & 255) - (b & 255);
  return Math.hypot(dr, dg, db) < PAINT.sameColorDist;
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------- the customer car
/** car.paint = { body, stripe, premium, bodyCans }: derived from the job types (so debug spawns work too). */
class PaintCar extends Car {
  constructor(sys, opts) {
    super(sys, opts);
    const body = colorOf(this.types[0]) || 'red';
    const last = colorOf(this.types[this.types.length - 1]);
    this.paint = {
      body,
      stripe: last && last !== body ? last : null,
      premium: !!PAINT_COLORS[body]?.premium,
      bodyCans: this.types.filter((t) => t === can(body)).length,
    };
  }
  /** Canisters are sprayed in order (body nose to tail, then the stripe): only the next one can be worked on. */
  firstReady() {
    for (const j of this.jobs) { if (j.state === 'done') continue; return j.state === 'ready' ? j : null; }
    return null;
  }
}

// ---------------------------------------------------------------- spray booth (bay)
// Phases: empty -> snap -> up (masked; deliver + spray) -> cure -> lower (done: doors folding open) -> done -> empty
class SprayBooth extends Bay {
  constructor(sys, index, animate) {
    super(sys, index, animate);
    this.lamp = 'idle';
    this.sprayHex = null;          // colour being sprayed right now (haze, mist), null when nobody sprays
    this.sprayT = 0;               // how long the current spraying has gone on (mist waits for the gun to come up)
    this.mistT = 0; this.hissT = 0;
    this.cureT = 0; this.cureTime = PAINT.cure;
    this.model.setIR?.(townUnlocked('irlamps'));
    // cure countdown over the booth's south end (clear of the job bubble above the car)
    this.timer = new Tag({ kind: 'timer', text: '' }, 1.3);
    this.timer.setIcon('clock');
    this.timer.place(this.x, 0, this.z + 2.5);
    this.timer.setVisible(false);
    // doors: shut while the booth sprays and cures (updateDoors); their solids follow the leaves
    this.doorsShut = { south: false, north: false };
    this.northHold = 0;
    this.doorSolids = [];
    this.seen = new Map();          // walker -> last position + speed (the north door's sensor)
    this.people = [];
    this.model.setDoors?.(false, false);
    this.applyDoorSolids();
  }

  update(dt) {
    super.update(dt);
    this.updateDoors(dt);
  }

  /** Doors: shut while the booth sprays and cures. The south (vehicle) doors fold shut once nobody stands in their
   *  swing and fold open when the paint is cured. The north (personnel) doors slide open for anyone at the doorway or
   *  walking up to it, and shut again PAINT.doors.hold s after the last one went through. */
  updateDoors(dt) {
    const people = this.sensePeople(dt);
    const sealed = this.lamp === 'spray' || this.lamp === 'cure';
    const south = sealed && (this.doorsShut.south || !this.inSouthSwing(people));
    if (sealed && this.atNorthDoor(people)) this.northHold = PAINT.doors.hold;
    else this.northHold = Math.max(0, this.northHold - dt);
    const north = sealed && this.northHold <= 0;
    if (south === this.doorsShut.south && north === this.doorsShut.north) return;
    if (this.ctx.near(this.workPos, 2)) ui.sfx(south !== this.doorsShut.south ? (south ? 'boothShut' : 'boothOpen') : 'slideDoor');
    this.doorsShut.south = south; this.doorsShut.north = north;
    this.model.setDoors?.(south, north);
    this.applyDoorSolids();
  }

  /** Player, painters and the prep tech with their speed over the last frame: [{ x, z, vx, vz, foot }]. */
  sensePeople(dt) {
    const out = this.people, pl = this.ctx.player;
    out.length = 0;
    const add = (key, pos, foot) => {
      let s = this.seen.get(key);
      if (!s) { s = { x: pos.x, z: pos.z, vx: 0, vz: 0, foot }; this.seen.set(key, s); }
      if (dt > 0) { s.vx = (pos.x - s.x) / dt; s.vz = (pos.z - s.z) / dt; }
      s.x = pos.x; s.z = pos.z; s.foot = foot;
      out.push(s);
    };
    if (pl?.pos) add(pl, pl.pos, !!pl.onFoot);
    for (const m of this.fac.staff.mechanics) add(m, m.pos, true);
    const v = this.fac.staff.valet;
    if (v && !v.hidden) add(v, v.pos, true);
    return out;
  }

  /** Anyone where the south leaves swing (in the mouth, or in front of it where they fold out)? A car: wider margin. */
  inSouthSwing(people) {
    const z1 = PAINT.boothZ[1], hw = PAINT.boothHalfW;
    for (const s of people) {
      const m = s.foot ? 0 : 1.2;
      if (Math.abs(s.x - this.x) < hw + 0.4 + m && s.z > z1 - 1.2 - m && s.z < z1 + 1.45 + m) return true;
    }
    return false;
  }

  /** Anyone on foot in the north doorway, or walking up to it (from either side) fast enough to reach it before the
   *  leaves could slide apart? Walkers passing along the staff lane stay outside the band. */
  atNorthDoor(people) {
    const D = PAINT.doors, hw = PAINT.boothHalfW, zP = PAINT.boothZ[0] - 0.11;   // between the two leaf planes
    for (const s of people) {
      if (!s.foot) continue;
      const dx = Math.abs(s.x - this.x), d = s.z - zP;             // d < 0: north of the doors (outside)
      if (dx > hw + 1.5) continue;
      if (dx < hw + 0.2 && d > -D.bandOut && d < D.bandIn) return true;
      const toward = d < 0 ? s.vz : -s.vz;
      if (toward < 0.3) continue;
      const t = (Math.abs(d) - (d < 0 ? D.bandOut : D.bandIn)) / toward;
      if (t < D.lead && Math.abs(s.x + s.vx * Math.max(0, t) - this.x) < hw + 0.2) return true;
    }
    return false;
  }

  /** Swap the door solids for the doors' state: folded stacks / shut south doors, parked sliding leaves. */
  applyDoorSolids() {
    const ds = this.model.group.userData.doorSolids;
    for (const b of this.doorSolids) this.ctx.solids.remove(b);
    this.doorSolids.length = 0;
    if (!ds) return;
    const sets = [this.doorsShut.south ? ds.southShut : ds.southOpen, this.doorsShut.north ? ds.northShut : ds.northOpen];
    for (const set of sets) {
      for (const b of set) this.doorSolids.push(this.ctx.solids.add({ minX: b.minX + this.x, maxX: b.maxX + this.x, minZ: b.minZ + this.z, maxZ: b.maxZ + this.z }));
    }
  }

  setLamp(s) { if (s !== this.lamp) { this.lamp = s; this.model.setLamp?.(s); } }

  isWorkable() { return !!this.car && this.phase === 'up' && !this.car.finished; }
  /** The next canister to spray (first job not done). */
  activeJob() { if (this.car) for (const j of this.car.jobs) if (j.state !== 'done') return j; return null; }
  /** Colour of the next canister (painters fill their gun cup with it). */
  jobHex() { const j = this.activeJob(); return j ? hexOf(colorOf(j.type)) : null; }

  /** The car stands in the booth: masked at once; the doors stay open until the first canister is sprayed. */
  onSnapped(car) {
    this.phase = 'up';
    car.model.setMasked?.(true);
    this.setWorkMat(true);
    this.setLamp('idle');
  }

  updateActive(dt) {
    const car = this.car, pl = this.ctx.player;
    if (this.phase === 'up') {
      const inZone = this.playerInZone();
      // on the mat the player pulls on the paint suit (syncPlayerSuit) and only sprays once it is on
      if (inZone) { this.playerHere = true; pl.workLift = this; this.deliverFromPlayer(); this.fac.suitWanted = true; }
      const suited = !pl.ch?.setSuit || pl.ch.suited;
      const job = car.firstReady();
      const works = !!job && suited && this.playerCanWork(inZone);   // spraying only in the suit, standing still on the mat
      car.tag.setSolid(works);
      let hex = null;
      if (job) {
        const rate = (works ? this.fac.h('playerRate') : 0) + this.mechanicRate();
        if (rate > 0) {
          hex = hexOf(colorOf(job.type));
          if (works) this.fac.playerSpray = hex;
          job.progress = Math.min(1, job.progress + (rate * dt) / this.fac.h('workTime', job));
          this.paintCar(car, job);
          if (job.progress >= 1) {
            const stripe = car.paint.stripe && job.type === can(car.paint.stripe);
            car.jobDone(job);
            if (stripe) car.model.setStripe?.(hexOf(car.paint.stripe));
            if (this.ctx.near(car.pos)) ui.sfx('fix');
          }
        }
      }
      this.setSpraying(hex, dt);
      if (car.finished) this.startCure();
    } else if (this.phase === 'cure') {
      this.cureT += dt;
      const k = Math.min(1, this.cureT / this.cureTime);
      this.model.setTimer?.(k);
      this.timer.setProgress(k);
      this.timer.setText(String(Math.max(1, Math.ceil(this.cureTime - this.cureT))));
      if (k >= 1) this.finish();
    }
  }

  /** The body colour sweeps from nose to tail: k = canisters sprayed (+ the share of the current one) / body cans. */
  paintCar(car, job) {
    const p = car.paint;
    if (job.type !== can(p.body)) return;
    let done = 0;
    for (const j of car.jobs) if (j.state === 'done' && j.type === job.type) done++;
    car.model.setColor?.(hexOf(p.body), (done + job.progress) / Math.max(1, p.bodyCans));
  }

  /** Spraying on / off this frame: lamps (and so the doors), haze, gun mist, hiss. */
  setSpraying(hex, dt) {
    if (hex !== this.sprayHex) {
      this.sprayHex = hex;
      this.sprayT = 0;
      this.model.setHaze?.(hex);
      // the doors shut with the first canister (the car is standing still by now): updateDoors reads the lamp
      if (hex != null) this.setLamp('spray');
    }
    if (hex == null) return;
    this.sprayT += dt;
    if (!this.ctx.near(this.workPos, 2)) return;
    this.hissT -= dt;
    if (this.hissT <= 0) { this.hissT = 0.34; ui.sfx('spray'); }
    this.mistT -= dt;
    if (this.mistT > 0 || this.sprayT < 0.3) return;   // the gun comes up first
    this.mistT = 0.08;
    const pl = this.ctx.player;
    if (this.fac.playerSpray != null && this.playerHere) this.mistFrom(pl.ch, hex);
    for (const m of this.fac.staff.mechanics) if (m.workingAt === this) this.mistFrom(m.ch, hex);
  }

  /** A puff of paint out of a character's spray gun, along the direction the gun points. */
  mistFrom(ch, hex) {
    const tip = ch?.sprayTip;
    if (!tip || !M.mist) return;
    tip.getWorldPosition(_v);
    tip.getWorldQuaternion(_q);
    _d.set(0, 0, 1).applyQuaternion(_q);
    _d.y = Math.min(_d.y, 0.1);
    M.mist(scene, _v, hex, _d);
  }

  startCure() {
    this.phase = 'cure';
    this.setSpraying(null, 0);
    this.setWorkMat(false);
    this.car?.tag.setSolid(false);
    this.cureT = 0;
    this.cureTime = townUnlocked('irlamps') ? PAINT.cureIR : PAINT.cure;
    this.setLamp('cure');
    this.model.setTimer?.(0);
    this.timer.setProgress(0);
    this.timer.setText(String(Math.ceil(this.cureTime)));
    this.timer.setVisible(true);
    if (this.ctx.near(this.workPos, 3)) ui.sfx('cure');
  }

  /** After the payout (Bay.finish): doors open, masking off, gloss; the car may back out once the doors are open. */
  lowerAndRelease(car) {
    this.timer.setVisible(false);
    this.setLamp('done');
    car.model.setMasked?.(false);
    car.model.setGloss?.([0.95, 0.95, 0.95, 0.95]);
    tween({
      duration: 0.01, delay: PAINT.doors.release,
      onComplete: () => {
        if (this.car !== car) return;
        this.phase = 'done';
        this.fac.cars.setReady(car);
      },
    });
  }

  release(car) {
    if (this.car !== car) return;
    super.release(car);
    this.setSpraying(null, 0);
    this.setLamp('idle');
    this.timer.setVisible(false);
  }

  dispose() {
    this.timer.remove();
    for (const b of this.doorSolids) this.ctx.solids.remove(b);
    this.doorSolids.length = 0;
  }
}

// ---------------------------------------------------------------- paint tank (station)
class PaintTank extends Station {
  constructor(ctx, fac, key, animate) {
    super(ctx, fac, key, animate);
    // the tank's label shows a canister in the tank's colour
    this.tag.label.el?.style.setProperty('--c', cssOf(hexOf(key)));
  }
  /** The mat's spray can is printed in the tank's colour too. */
  matTint() { return cssOf(hexOf(this.key)); }
}

// ---------------------------------------------------------------- painter (mechanic logic, spray pose)
class Painter extends Mechanic {
  /** The waste drum stands against the west wall: walk up to its east side and face it. */
  toScrap() {
    const b = this.fac.scrap;
    if (!b) { super.toScrap(); return; }
    this.goTo(b.x + 0.95, b.z);
    this.idleYaw = -Math.PI / 2;
    this.state = 'toScrap';
  }
  setWorkAnim(on) {
    if (on) {
      const hex = this.lift?.jobHex?.();
      if (hex != null && hex !== this.cupHex) { this.cupHex = hex; this.ch.setSprayColor?.(hex); }
    }
    if (on !== this.workShown) { this.workShown = on; (this.ch.setSpraying || this.ch.setWorking)(on); }
  }
}

// ---------------------------------------------------------------- the player's spray pose
/** Bays flag fac.playerSpray (colour) while the player sprays; show the gun only then. */
function syncPlayerSpray(fac) {
  const ch = fac.ctx.player?.ch;
  if (!ch?.setSpraying) return;
  const hex = fac.playerSpray;
  if (hex != null && hex !== fac.cupShown) { fac.cupShown = hex; ch.setSprayColor?.(hex); }
  const on = hex != null;
  if (on !== fac.sprayShown) { fac.sprayShown = on; ch.setSpraying(on); }
}

// ---------------------------------------------------------------- the player's paint suit
/** On a booth's work mat with a car to paint (fac.suitWanted, set by the booth) the player pulls on the white paint
 *  suit; it stays on inside the hall (fetching more paint, the next car) and comes off when they walk out. Changes
 *  while driving or off screen happen at once. */
function syncPlayerSuit(fac) {
  const pl = fac.ctx.player, ch = pl?.ch;
  if (!ch?.setSuit) return;
  if (fac.suitCh !== ch) { fac.suitCh = ch; fac.suitOn = false; }
  const W = PAINT.walls, p = pl.pos, m = 0.6;
  const inHall = p.x > W.minX - m && p.x < W.maxX + m && p.z > W.minZ - m && p.z < W.maxZ + m;
  const on = fac.suitWanted || (fac.suitOn && inHall);
  if (on === fac.suitOn) return;
  fac.suitOn = on;
  const animate = !!pl.onFoot && fac.ctx.near(p, 2);
  ch.setSuit(on, M.paintSuitLook?.(ch.look), animate);
  if (animate) ui.sfx(on ? 'suitUp' : 'suitOff');
}

// ---------------------------------------------------------------- facility
export const PAINT_DEF = {
  id: 'paint',
  property: 'paint',
  layout: PAINT,
  stayText: 'Paint customers stay at the Spray Bay',
  noFreeText: 'No free booth!',
  initial: { stations: ['red', 'blue', 'white'], bays: [0] },
  unlocks: townChain(PAINT_UNLOCKS),
  classes: { Car: PaintCar, Bay: SprayBooth, Station: PaintTank, Mechanic: Painter },
  hooks: {
    // ---- customers: any unlocked car class, never a VIP (VIPs belong to the garage and the club)
    rollLook(fac, opts) { return DEFAULT_HOOKS.rollLook(fac, { ...opts, vip: false }); },
    /** n canisters of one stocked colour the car is not already (+ one stripe canister with the stripe kit). */
    rollJobs(fac, opts, look) {
      const stocked = Object.keys(fac.stations.map);
      let pool = stocked.filter((k) => !sameColor(hexOf(k), look.color));
      if (!pool.length) pool = stocked;
      const body = pick(pool);
      const n = PAINT.cans[look.type] ?? PAINT.cans.default;
      const out = Array.from({ length: n }, () => can(body));
      if (townUnlocked('stripes') && Math.random() < PAINT.stripeChance) {
        const sp = stocked.filter((k) => k !== body && !sameColor(hexOf(k), hexOf(body)));
        if (sp.length) out.push(can(pick(sp)));
      }
      return out;
    },
    /** Job tile = a canister in the colour (premium colours on a gold tile). */
    jobView(fac, job) {
      const key = colorOf(job.type);
      return { type: 'spray', color: cssOf(hexOf(key)), state: job.state, gold: !!PAINT_COLORS[key]?.premium };
    },
    patience(fac) { return PAINT.patience * fac.patienceMult(); },
    spawnInterval(fac) {
      const booths = fac.bays.active.length;
      const colours = fac.stations.list.length;
      const base = Math.max(4, PAINT.spawnInterval - PAINT.spawnIntervalPerBay * (booths - 1));
      return base * Math.max(0.6, 1 - PAINT.spawnPerColor * Math.max(0, colours - 3)) * fac.spawnMult();
    },

    // ---- booths
    bayModel(fac, index) {
      const m = M.createSprayBooth ? M.createSprayBooth(index) : M.createLift();
      (fac.boothModels ||= [])[index] = m;
      return m;
    },
    /** The booth's own obstacles (glass side walls + control column), local -> world. */
    bayObstacles(fac, cfg) {
      const m = fac.boothModels?.[fac.L.bays.indexOf(cfg)];
      const local = m?.group.userData.obstacles;
      if (!local) return DEFAULT_HOOKS.bayObstacles(fac, cfg);
      return local.map((b) => ({ minX: b.minX + cfg.x, maxX: b.maxX + cfg.x, minZ: b.minZ + cfg.z, maxZ: b.maxZ + cfg.z }));
    },
    workTime() { return PAINT.work; },
    playerRate() { return upgradeValue('repair'); },
    staffRate() { return ECONOMY.mechanicRate * upgradeValue('repair'); },
    payout(fac, car) {
      const p = car.paint;
      return resprayPayout(car.types.length, { tier: car.tier, premium: p.premium, stripe: !!p.stripe, speedy: car.patience > 0 });
    },
    onFinished(fac, car, pay) {
      setStreak(pay.speedy ? state.streak + 1 : 0);   // one streak, shared with the garage
      const st = state.town.stats;
      st.resprays = (st.resprays | 0) + 1;
      addFame('respray', car.pos);
      events.emit('respray:done', { total: st.resprays, speedy: pay.speedy, cash: pay.total, color: car.paint.body, facility: fac.id });
    },

    // ---- paint tanks
    stationModel(fac, key) { return M.createPaintTank ? M.createPaintTank(key) : M.createPartStation('paint'); },
    partType(fac, key) { return can(key); },
    stationIcon() { return 'spray'; },
    restockTime() { return PAINT.restock * upgradeValue('supply'); },
    stationMax() { return PAINT.stationMax; },

    // ---- staff
    mechanicLook(fac, i) { return M.painterLook(i); },
    valetLook() { return M.prepTechLook(); },

    // ---- unlock chain
    applyUnlock(fac, u, from) {
      switch (u.type) {
        case 'painter': fac.staff.addMechanic(u.index, from); break;
        case 'preptech': fac.staff.addValet(from); break;
        case 'irlamps': for (const b of fac.bays.active) b.model.setIR?.(true); break;
        case 'stripes': break;                         // rollJobs reads townUnlocked('stripes')
        default: DEFAULT_HOOKS.applyUnlock(fac, u, from);   // tank -> station, bay -> booth
      }
    },
  },
  setup(fac) {
    fac.playerSpray = null; fac.sprayShown = false; fac.cupShown = null;
    fac.suitWanted = false; fac.suitOn = false; fac.suitCh = null;
    const update = fac.bays.update;
    fac.bays.update = (dt, t) => {
      fac.playerSpray = null; fac.suitWanted = false;
      update(dt, t);
      syncPlayerSuit(fac); syncPlayerSpray(fac);
    };
  },
  teardown(fac) {
    fac.playerSpray = null;
    syncPlayerSpray(fac);
    if (fac.suitOn) fac.ctx.player?.ch?.setSuit?.(false, null, false);
    fac.suitOn = false;
  },
};
registerFacility(PAINT_DEF);

// ---------------------------------------------------------------- offline income (TOWN.md 4.17)
// Counts once the shop runs itself (a painter + the prep tech); in full with the paint manager, else at 50%.
addOfflineSource(() => {
  if (!owns('paint') || !townUnlocked('preptech')) return 0;
  const painters = (townUnlocked('painter0') ? 1 : 0) + (townUnlocked('painter1') ? 1 : 0);
  const crews = Math.min(painters, townUnlocked('paint_bay1') ? 2 : 1);
  if (!crews) return 0;
  const avgCans = 2.5;
  const perCar = avgCans * PAINT.pricePerCan * upgradeValue('price') * shopMult() * fameMult() * collectionMult();
  return (crews * perCar / PAINT.offlineCarTime) * ECONOMY.offlineEfficiency * (hasManager('paint') ? 1 : 0.5);
});

// ---------------------------------------------------------------- debug helpers on window.__game
function installDebug() {
  if (typeof window === 'undefined') return;
  const g = window.__game;
  if (!g) { setTimeout(installDebug, 250); return; }
  if (g.spawnPaintCar) return;
  const fac = () => g.world?.facilities?.paint || null;
  /** opts: { color: 'gold', stripe: 'white', type: 'van' } (any omitted part is rolled as usual). */
  g.spawnPaintCar = (opts = {}) => {
    const f = fac();
    if (!f) return null;
    const o = { type: opts.type };
    if (opts.color) {
      const n = PAINT.cans[opts.type] ?? PAINT.cans.default;
      o.problems = Array.from({ length: n }, () => can(opts.color));
      if (opts.stripe) o.problems.push(can(opts.stripe));
    }
    return f.cars.spawn(o, true)?.id ?? null;
  };
  Object.defineProperty(g, 'paint', {
    configurable: true,
    get() {
      const f = fac();
      if (!f) return null;
      return {
        fac: f,
        state: () => ({
          booths: f.bays.active.map((b) => ({ i: b.index, phase: b.phase, lamp: b.lamp, doors: { ...b.doorsShut }, shut: b.model.doorState?.(), car: b.car?.id ?? null, jobs: b.car?.jobs.map((j) => `${colorOf(j.type)}:${j.state}`) })),
          lane: f.cars.lane.map((c) => ({ id: c.id, mode: c.mode, wants: c.paint, x: +c.pos.x.toFixed(1) })),
          cars: f.cars.list.map((c) => ({ id: c.id, mode: c.mode })),
          stock: f.stations.list.map((s) => `${s.key}:${s.stack.ready}`),
          staff: f.staff.mechanics.map((m) => m.state).concat(f.staff.valet ? ['prep:' + f.staff.valet.state] : []),
        }),
      };
    },
  });
}
installDebug();
