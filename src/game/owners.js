// Car owners on foot: pop out of their car in the drop-off lane -> lounge spot -> curb -> hop back in.
// States: hopOut | toLounge | lounge | toCurb | toCar | boarding | leaving | gone
// One system per facility. Routes come from overridable methods (loungePath, curbPath, leavePath) so add-ons
// (the lounge annex) or other facilities can send owners elsewhere without copying this file.
import * as THREE from 'three';
import { createCharacter, randomCustomerLook } from '../models/index.js';
import { LAYOUT } from '../config.js';
import { Walker } from './walker.js';
import { hop } from './tween.js';
import { Emote, rand, detach } from './util.js';

export class Owner extends Walker {
  constructor(sys, car) {
    super(createCharacter(sys.fac.hooks.ownerLook ? sys.fac.h('ownerLook', car) : randomCustomerLook()), 2.5 * rand(0.92, 1.1), Math.PI);
    this.sys = sys; this.car = car; this.fac = sys.fac; this.L = sys.fac.L;
    this.emo = new Emote();
    this.spot = sys.takeSpot();
    this.curbIdx = -2;
    this.state = 'hopOut';
    this.pendingReady = false;
    sys.ctx.root.add(this.group);
    const door = new THREE.Vector3(car.pos.x - 0.35, 0, car.pos.z - 1.05);
    const from = new THREE.Vector3(car.pos.x, 0.5, car.pos.z);
    this.pos.copy(from);
    this.group.scale.setScalar(0.3);
    hop(this.group, from, door, {
      duration: 0.34, height: 0.8, scaleFrom: 0.3, scaleTo: 1,
      onComplete: () => {
        this.pos.y = 0;
        this.group.scale.setScalar(1);
        if (this.state !== 'hopOut') return;
        if (this.pendingReady) { this.goCurb(); return; }
        this.state = 'toLounge';
        this.path = this.loungePath(door, this.spot);
        this.idleYaw = this.spot.yaw ?? Math.PI;
      },
    });
  }

  /** Door of the car -> waiting spot (garage: along ownerWalkZ). */
  loungePath(door, s) {
    const z = this.L.ownerWalkZ;
    return [{ x: door.x, z }, { x: s.x, z }, { x: s.x, z: s.z }];
  }
  /** Where to wait for the car at the curb (i = place in the curb queue). */
  curbPath(i) { return [{ x: this.L.ownerCurb.x - i * 0.8, z: this.L.ownerCurb.z }]; }
  /** Car left without us: walk off along the Harbor St sidewalk. */
  leavePath() {
    const sx = this.L.ownerCurb.x + 1.9, sz = LAYOUT.street.sidewalkZ;
    return [{ x: sx, z: this.pos.z }, { x: sx, z: sz }, { x: sx + 7.8, z: sz }];
  }

  emote(kind, t) { this.emo.show(kind, t); }

  /** The car is repaired: walk to the curb (also fine while still walking to the lounge). */
  carReady(speedy, vip) {
    this.emote(speedy ? (vip ? 'star' : 'happy') : 'angry', 2.4);
    if (this.state === 'hopOut') { this.pendingReady = true; return; }
    if (this.state === 'toLounge' || this.state === 'lounge') this.goCurb();
  }

  goCurb() {
    this.sys.freeSpot(this.spot); this.spot = null;
    this.state = 'toCurb';
    this.sys.curb.push(this);
    this.curbIdx = -2;
    this.idleYaw = Math.PI;
  }

  /** The car stopped at pickupStop: walk over and hop in. */
  board(car) {
    if (this.state === 'boarding' || this.state === 'leaving' || this.state === 'gone') return;
    if (this.spot) { this.sys.freeSpot(this.spot); this.spot = null; }
    this.sys.leaveCurb(this);
    if (this.state === 'hopOut') { this.pendingReady = true; }
    this.state = 'toCar';
    this.path = [{ x: car.pos.x, z: car.pos.z + 1.15 }];
    this.idleYaw = Math.PI;
  }

  hopIn() {
    const car = this.car;
    this.state = 'boarding';
    this.emo.remove();
    hop(this.group, this.pos, (out) => out.set(car.pos.x, 0.5, car.pos.z), {
      duration: 0.32, height: 0.8, scaleFrom: 1, scaleTo: 0.3,
      onComplete: () => { car.ownerIn = true; this.sys.remove(this); },
    });
  }

  /** The car left without us (timeout / world change): walk off down the street. */
  abandon() {
    if (this.state === 'boarding' || this.state === 'gone' || this.state === 'leaving') return;
    if (this.spot) { this.sys.freeSpot(this.spot); this.spot = null; }
    this.sys.leaveCurb(this);
    this.state = 'leaving';
    this.car = null;
    this.idleYaw = null;
    this.path = this.leavePath();
  }

  update(dt) {
    if (this.state === 'hopOut' || this.state === 'boarding') { this.ch.update(dt, 0); this.emo.update(dt, this.group); return; }
    const idle = this.step(dt);
    switch (this.state) {
      case 'toLounge': if (idle) this.state = 'lounge'; break;
      case 'toCurb': {
        const i = this.sys.curb.indexOf(this);
        if (i !== this.curbIdx) {
          this.curbIdx = i;
          this.path = this.curbPath(i);
        }
        break;
      }
      case 'toCar': {
        const car = this.car;
        if (!car || car.mode !== 'waitOwner') break;
        if (idle || Math.hypot(this.pos.x - car.pos.x, this.pos.z - car.pos.z) < 1.4) this.hopIn();
        break;
      }
      case 'leaving': if (idle) this.sys.remove(this); break;
    }
    this.emo.update(dt, this.group);
  }
}

export function createOwners(ctx, fac) {
  const L = fac.L;
  const list = [];
  const spots = L.loungeSpots.map((s, i) => ({ x: s.x, z: s.z, yaw: s.yaw, i, taken: false }));
  const curb = [];
  let pending = 0;
  let overflow = 0;

  const sys = {
    ctx, fac, list, curb, spots,
    freeSpots() { let n = 0; for (const s of spots) if (!s.taken) n++; return n; },
    /** Room for one more customer (a spot that is neither taken nor promised to a car on its way). */
    canReserve() { return sys.freeSpots() - pending > 0; },
    reserve() { pending++; },
    unreserve() { if (pending > 0) pending--; },
    takeSpot() {
      if (pending > 0) pending--;
      const free = spots.filter((s) => !s.taken);
      if (free.length) {
        const s = free[Math.floor(Math.random() * free.length)];
        s.taken = true;
        return s;
      }
      // debug spawns can exceed the lounge: stand on the walkway next to it (an add-on may say where: overflowSpot)
      const k = overflow++ % 6;
      if (sys.overflowSpot) return { ...sys.overflowSpot(k), overflow: true };
      const s0 = L.loungeSpots[0];
      return { x: s0.x - 0.9 - k * 0.6, z: s0.z, overflow: true };
    },
    freeSpot(s) { if (s && !s.overflow) s.taken = false; },
    leaveCurb(o) { const i = curb.indexOf(o); if (i >= 0) curb.splice(i, 1); },
    spawnFor(car) {
      const o = new fac.classes.Owner(sys, car);
      car.owner = o;
      list.push(o);
      return o;
    },
    remove(o) {
      if (o.state === 'gone') return;
      if (o.spot) { sys.freeSpot(o.spot); o.spot = null; }
      sys.leaveCurb(o);
      o.state = 'gone';
      o.emo.remove();
      detach(o.group);
      const i = list.indexOf(o); if (i >= 0) list.splice(i, 1);
    },
    update(dt) { for (let i = list.length - 1; i >= 0; i--) list[i].update(dt); },
    /** Swap the waiting spots (e.g. the lounge annex adds seats). Taken spots of walking owners stay valid.
     *  Extra keys of a spot (sit, lounge ...) are kept for the Owner class's routes. */
    setSpots(newSpots) { spots.length = 0; newSpots.forEach((s, i) => spots.push({ ...s, i, taken: false })); },
    dispose() { for (const o of list) o.emo.remove(); list.length = 0; },
  };
  return sys;
}
