// Cars: entity (AI driving, jobs, patience, job bubble), spawner, drop-off lane queue and the way out.
// One car system per facility (fac.cars); every car of every facility is also in ctx.allCars (collision, yielding).
//
// Car modes:
//   arriving   street -> carEntry -> drop-off lane slot          (in sys.lane)
//   queued     waiting in the lane (rolls forward when the lane shuffles; enterable when stopped)  (in sys.lane)
//   boarding   the player / valet is hopping in
//   driven     the player drives it with the joystick
//   valet      the valet drives it to a reserved bay (AI path)
//   snap       tweening onto a bay (lifts.js)
//   lift       on a bay (lifts.js runs raise / work / lower, or the facility's own sequence)
//   ready      finished, waiting for its departure slot (exitGap)
//   reversing  straight back from the bay to the exit lane
//   toPickup   forward along the exit lane to pickupStop
//   waitOwner  at pickupStop until the owner hops in (4 s max; longer while a far owner walks over: owner.farWalk)
//   exiting    carExit -> despawn
//   (add-ons) fac.hooks.leave(fac, car) may take a leaving car instead of 'exiting' (wash.js: wash* modes);
//             car.holding = true marks a car stopped on purpose (cars behind wait for it, they never ghost through)
//   gone
// Facility code may add its own modes; the car only drives itself in the modes above (`custom` = someone else
// moves it, like 'driven').
import * as THREE from 'three';
import { createCar, createZoneRing } from '../models/index.js';
import { ECONOMY, CAR, PLAYER } from '../config.js';
import { ui } from '../ui/index.js';
import { Tag, damp, lerpAngle, angleDiff, clamp, detach } from './util.js';

const ACCEL = 6.5, BRAKE = 10;
const HALF_SEG = (CAR.length - CAR.width) / 2;   // capsule half segment along the car
const CAP_R = CAR.width / 2;
const PICKUP_WAIT = 4;
const FAR_PICKUP_WAIT = 30;   // owner.farWalk (walking over from the lounge annex): wait while they come
let uid = 0;

export class Car {
  constructor(sys, opts = {}) {
    const fac = sys.fac;
    this.sys = sys; this.fac = fac; this.ctx = sys.ctx; this.id = ++uid;
    this.opts = opts;
    const look = opts.look || fac.h('rollLook', opts);
    this.look = look;
    this.vip = !!look.vip;
    this.tier = fac.h('tier', look);
    this.payMult = opts.payMult || 1;       // e.g. rescue x2.5 (repairPayout { mult })
    this.model = createCar(look);
    this.group = this.model.group;
    this.pos = this.group.position;
    const types = (opts.problems && opts.problems.length ? opts.problems : fac.h('rollJobs', opts, look)).slice(0, opts.maxJobs || 4);
    this.types = types;
    this.jobs = types.map((type) => ({ type, state: 'need', progress: 0, claim: null, incoming: false }));
    this.remaining = types.slice();
    this.model.setProblems(this.remaining);

    this.mode = 'arriving';
    this.yaw = Math.PI / 2;
    this.speed = 0; this.vx = 0; this.vz = 0;
    this.path = []; this.reverse = false; this.restYaw = null; this.maxSpeed = ECONOMY.carSpeed;
    this.slotX = null;
    this.patience = 1; this.patienceMax = 1; this.patienceOn = false; this.patienceGone = false;
    this.owner = null; this.ownerIn = false; this.lift = null; this.claim = null;
    this.enterT = 0; this.queuedT = 0; this.readyT = 0; this.waitT = 0;
    this.blockT = 0; this.blockedBy = null; this.ghostT = 0; this.honked = false;
    this.wheelSpeed = 0;
    this.jobsDirty = true; this.patShown = -1;
    this.capsule = { ax: 0, az: 0, bx: 0, bz: 0, r: CAP_R, owner: this };
    this.tag = new Tag({ text: '', kind: 'job' }, 2.05);
    this.tag.setVip(this.vip);
    this.tag.setVisible(false);
    this.ring = null;
    this.group.rotation.y = this.yaw;
    sys.ctx.root.add(this.group);
  }

  get finished() { for (const j of this.jobs) if (j.state !== 'done') return false; return true; }
  /** First job still waiting for its part (not in flight) of `type`; prefers jobs claimed by `who` or nobody. */
  findNeed(type, who = null, allowOthers = true) {
    let fallback = null;
    for (const j of this.jobs) {
      if (j.state !== 'need' || j.incoming || j.type !== type) continue;
      if (j.claim === who || j.claim === null) return j;
      if (allowOthers && !fallback) fallback = j;
    }
    return fallback;
  }
  firstReady() { for (const j of this.jobs) if (j.state === 'ready') return j; return null; }
  /** Nose position (engine bay) in world space, used as the target for delivered parts and sparks. */
  nose(out, up = 0.9) {
    return out.set(this.pos.x + Math.sin(this.yaw) * 0.95, this.pos.y + up, this.pos.z + Math.cos(this.yaw) * 0.95);
  }

  startPatience() {
    if (this.patienceOn || this.patienceGone) return;
    this.patienceMax = this.fac.h('patience', this);
    this.patience = this.patienceMax;
    this.patienceOn = true;
  }

  markJobsDirty() { this.jobsDirty = true; }

  /** Job finished: update damage on the model. */
  jobDone(job) {
    job.state = 'done'; job.progress = 0; job.claim = null;
    const i = this.remaining.indexOf(job.type);
    if (i >= 0) this.remaining.splice(i, 1);
    this.model.setProblems(this.remaining);
    this.jobsDirty = true;
  }

  // ------------------------------------------------------------ AI driving
  setPath(points, { reverse = false, restYaw = null, maxSpeed = ECONOMY.carSpeed } = {}) {
    this.path = points; this.reverse = reverse; this.restYaw = restYaw; this.maxSpeed = maxSpeed;
    this.blockT = 0;
  }

  /** Who stands in my way along (ux, uz)? Returns the blocker (car, 'player', 'ped') or null. */
  findBlocker(ux, uz) {
    if (this.ghostT > 0) return null;
    const px = this.pos.x, pz = this.pos.z;
    const look = 3.15 + this.speed * 0.22;
    const list = this.ctx.allCars;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === this || o.mode === 'gone' || o.mode === 'snap' || o.mode === 'lift' || o.mode === 'ready') continue;
      const dx = o.pos.x - px, dz = o.pos.z - pz;
      const along = dx * ux + dz * uz;
      if (along < 0.3 || along > look) continue;
      const lat = Math.abs(dx * uz - dz * ux);
      if (lat < 1.5) return o;
    }
    const pl = this.ctx.player;
    if (pl && pl.onFoot) {
      const dx = pl.pos.x - px, dz = pl.pos.z - pz;
      const along = dx * ux + dz * uz;
      if (along > 0.2 && along < 2.1 && Math.abs(dx * uz - dz * ux) < 1.05) return 'player';
    }
    // other moving things (player vehicles, towed cars, traffic, people on a crossing): { pos, radius, ped? } in ctx.movers
    const mv = this.ctx.movers;
    for (let i = 0; i < mv.length; i++) {
      const o = mv[i];
      if (o.ignore === this || o.hidden) continue;
      const dx = o.pos.x - px, dz = o.pos.z - pz;
      const along = dx * ux + dz * uz;
      const r = o.radius ?? 1;
      if (o.ped && this.path.length === 1) {
        // a car pulling up short of the crossing (the pickup stop) needn't wait for the people on it
        const w = this.path[0], rest = (w.x - px) * ux + (w.z - pz) * uz;
        if (along > rest + CAR.length / 2 + r) continue;
      }
      if (along > 0.2 && along < look + r * 0.5 && Math.abs(dx * uz - dz * ux) < 0.85 + r) return o.ped ? 'ped' : 'player';
    }
    return null;
  }

  /** Follow this.path. Returns true when the path is done. */
  drive(dt) {
    let wp = this.path[0];
    while (wp && this.path.length > 1 && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 1.2) {
      this.path.shift(); wp = this.path[0];
    }
    if (!wp) { this.coast(dt); return true; }
    const last = this.path.length === 1;
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (last && d < 0.03) {
      this.pos.x = wp.x; this.pos.z = wp.z;
      this.path.shift();
      this.speed = 0; this.vx = this.vz = 0;
      return true;
    }
    const ux = dx / d, uz = dz / d;
    let vt = this.maxSpeed;
    if (last) vt = Math.min(vt, Math.sqrt(2 * BRAKE * 0.55 * d) + 0.1);
    else {
      const n = this.path[1];
      const nx = n.x - wp.x, nz = n.z - wp.z, nl = Math.hypot(nx, nz) || 1;
      const cos = (ux * nx + uz * nz) / nl;
      vt = Math.min(vt, 2.2 + 3.6 * Math.max(0, (cos + 1) / 2) + d * 1.4);
    }
    const moveYaw = Math.atan2(ux, uz);
    const faceYaw = this.reverse ? moveYaw + Math.PI : moveYaw;
    const align = Math.cos(angleDiff(this.yaw, faceYaw));
    vt *= clamp((align + 0.25) / 1.25, 0.14, 1);
    if (this.reverse) vt = Math.min(vt, this.maxSpeed * 0.62);

    // yield to whoever is in front of us; break deadlocks
    const b = this.findBlocker(ux, uz);
    if (b) {
      this.blockT += dt;
      const mutual = b !== 'player' && b.blockedBy === this && this.id < b.id;
      if (b === 'player') {
        if (!this.honked && this.blockT > 0.35) { this.honked = true; ui.sfx('honk'); }
        if (this.blockT > 1.2) this.ghostT = 1.0;
      } else if (b === 'ped') {
        // someone on a zebra crossing: wait, no honk, never ghost through (they keep walking, so no deadlock)
      } else if (mutual || (this.blockT > 6 && !b.holding)) this.ghostT = 1.6;   // never ghost through a car held on purpose (wash queue)
      if (this.ghostT <= 0) vt = 0;
    } else { this.blockT = 0; this.honked = false; }
    this.blockedBy = b && b !== 'player' && b !== 'ped' ? b : null;

    const dv = vt - this.speed;
    this.speed += clamp(dv, -BRAKE * dt, ACCEL * dt);
    if (last && d < 0.35) {
      // final approach: move straight onto the target, no overshoot
      const s = Math.min(d, Math.max(0.5, this.speed) * dt);
      this.pos.x += ux * s; this.pos.z += uz * s;
      this.vx = ux * this.speed; this.vz = uz * this.speed;
    } else {
      const k = damp(9, dt);
      this.vx += (ux * this.speed - this.vx) * k;
      this.vz += (uz * this.speed - this.vz) * k;
      this.pos.x += this.vx * dt; this.pos.z += this.vz * dt;
    }
    const v = Math.hypot(this.vx, this.vz);
    if (v > 0.25) {
      const vy = Math.atan2(this.vx, this.vz) + (this.reverse ? Math.PI : 0);
      this.yaw = lerpAngle(this.yaw, vy, damp(7.5, dt));
    } else this.yaw = lerpAngle(this.yaw, faceYaw, damp(5, dt));
    this.wheelSpeed = this.reverse ? -this.speed : this.speed;
    return false;
  }

  coast(dt) {
    this.speed = Math.max(0, this.speed - BRAKE * dt);
    this.vx = this.vz = 0;
    this.wheelSpeed = 0;
    if (this.restYaw !== null) this.yaw = lerpAngle(this.yaw, this.restYaw, damp(6, dt));
  }

  updateCapsule() {
    const sx = Math.sin(this.yaw) * HALF_SEG, sz = Math.cos(this.yaw) * HALF_SEG;
    const c = this.capsule;
    c.ax = this.pos.x - sx; c.az = this.pos.z - sz;
    c.bx = this.pos.x + sx; c.bz = this.pos.z + sz;
  }

  // ------------------------------------------------------------ per-frame
  update(dt) {
    if (this.ghostT > 0) this.ghostT -= dt;
    const sys = this.sys, L = this.fac.L;
    switch (this.mode) {
      case 'arriving':
        if (this.drive(dt)) {
          this.mode = 'queued';
          this.restYaw = L.laneYaw;
          this.onFirstStop();
        }
        break;
      case 'queued':
        if (this.path.length) this.drive(dt); else this.coast(dt);
        this.queuedT = this.path.length ? 0 : this.queuedT + dt;
        break;
      case 'valet':
        if (this.drive(dt) && this.onArrive) { const f = this.onArrive; this.onArrive = null; f(this); }
        break;
      case 'reversing':
        if (this.drive(dt)) {
          this.mode = 'toPickup';
          this.setPath([{ x: L.pickupStop.x, z: L.pickupStop.z }], { restYaw: Math.PI / 2 });
        }
        break;
      case 'toPickup':
        if (this.drive(dt)) {
          this.mode = 'waitOwner'; this.waitT = 0;
          if (this.owner && !this.ownerIn) this.owner.board(this);
        }
        break;
      case 'waitOwner': {
        this.coast(dt);
        this.waitT += dt;
        const o = this.owner;
        const boarding = o && o.state === 'boarding';
        const close = o && o.state === 'toCar' && (o.farWalk || Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < 4);
        const maxWait = o && o.farWalk ? FAR_PICKUP_WAIT : 9;
        if (this.ownerIn || !o || (!boarding && (this.waitT > PICKUP_WAIT && !(close && this.waitT < maxWait)))) {
          if (o && !this.ownerIn) o.abandon();
          // an add-on may take the leaving car its own way (the car wash): it sets its own mode and drives it
          if (this.fac.hooks.leave && this.fac.h('leave', this)) break;
          this.mode = 'exiting';
          this.setPath(this.fac.h('exitPath', this));
          this.ctx.sfxAt('engine', this.pos);
        }
        break;
      }
      case 'exiting':
        if (this.drive(dt)) sys.remove(this);
        break;
      default:
        // boarding / driven: player.js moves us; snap / lift / ready: lifts.js owns the transform;
        // any facility-specific mode: its own code does
        break;
    }
    if (this.mode === 'ready') this.readyT += dt;
    if (this.mode === 'gone') return;
    this.group.rotation.y = this.yaw;
    // far from the camera: keep the logic, skip the model animation (wheels, smoke ...)
    if (this.ctx.near(this.pos, 4)) this.model.update(dt, this.wheelSpeed);
    this.updateCapsule();
    this.updatePatience(dt);
    this.updateTag();
  }

  onFirstStop() {
    if (this.owner) return;
    this.fac.owners.spawnFor(this);
    this.startPatience();
    this.ctx.sfxAt('honk', this.pos);
    this.fac.h('onArrived', this);
    this.tag.setVisible(true);
    this.jobsDirty = true;
  }

  updatePatience(dt) {
    if (!this.patienceOn) return;
    // Owners further back in the lane can see the line: their patience drains slower until they are next.
    const behind = this.mode === 'queued' && this.sys.lane.indexOf(this) > 0;
    this.patience = Math.max(0, this.patience - dt * (behind ? ECONOMY.patienceQueueRate : 1));
    const p = this.patience / this.patienceMax;
    if (Math.abs(p - this.patShown) > 0.004 || (p === 0 && this.patShown !== 0)) { this.patShown = p; this.tag.setPatience(p); }
    if (this.patience <= 0 && !this.patienceGone) {
      this.patienceGone = true;
      if (this.owner) this.owner.emote('angry', 2.6);
    } else if (p < 0.25 && !this.waitEmoted) {
      this.waitEmoted = true;
      if (this.owner) this.owner.emote('wait', 2.2);
    }
  }

  updateTag() {
    if (!this.tag.visible) return;
    this.tag.place(this.pos.x, this.pos.y + (this.mode === 'lift' ? 0.15 : 0), this.pos.z);
    if (this.jobsDirty) {
      this.jobsDirty = false;
      // facilities may show jobs differently (paint: canister tiles in a colour; VIP: gold tiles)
      this.tag.setJobs(this.fac.hooks.jobView ? this.jobs.map((j) => this.fac.h('jobView', j, this)) : this.jobs);
    }
    const r = this.firstReady();
    this.tag.setProgress(r ? r.progress : 0);
  }

  /** Stop the patience clock and freeze the bubble (repair done). */
  stopPatience() {
    this.patienceOn = false;
  }

  dispose() {
    this.tag.remove();
    if (this.ring) detach(this.ring);
    detach(this.group);
  }
}

export function createCars(ctx, fac) {
  const L = fac.L;
  const LANE_Z = L.queueLaneZ;
  const RING_DZ = L.queuePickupOffsetZ;
  const list = [];
  const lane = [];
  let spawnT = ECONOMY.spawnInterval - 1.2;
  let lastDepart = -99, clock = 0;
  const noLift = new Tag({ text: fac.def?.noFreeText || 'No free lift!', kind: 'info' }, 1.7);
  noLift.setVisible(false);
  const _v = new THREE.Vector3();

  const sys = {
    ctx, fac, list, lane,
    get queued() { return lane; },
    /** Paused spawner (e.g. a facility that is not built yet). */
    paused: false,

    /** Lane slots held for cars that arrive later (reserveSlot); the spawner leaves them free. */
    reserved: 0,
    /** Hold a lane slot + a waiting spot for a car that comes later (rescue tow). false = no room. */
    reserveSlot() {
      if (lane.length + sys.reserved >= L.queueSlots.length || !fac.owners.canReserve()) return false;
      sys.reserved++;
      fac.owners.reserve();
      return true;
    },
    releaseSlot() { if (sys.reserved > 0) { sys.reserved--; fac.owners.unreserve(); } },

    /**
     * Spawn a car (opts: { vip, type, problems, look, payMult, bonusText, at:{x,z,yaw}, path:[{x,z}], reserved }).
     * Default: at the street entry, along entryPath to its lane slot. opts.reserved uses a reserveSlot() slot.
     * null = lane full.
     */
    spawn(opts = {}, force = false) {
      const res = !!opts.reserved && sys.reserved > 0;
      if (lane.length + sys.reserved - (res ? 1 : 0) >= L.queueSlots.length) return null;
      if (!res && !force && !fac.owners.canReserve()) return null;
      const car = new fac.classes.Car(sys, opts);
      if (res) sys.reserved--; else fac.owners.reserve();
      if (opts.bonusText) { car.bonusText = opts.bonusText; car.tag.setBonus(opts.bonusText); }
      const entry = fac.h('entryPath');
      const s = opts.at || entry.spawn;
      car.pos.set(s.x, 0, s.z);
      car.yaw = opts.at?.yaw ?? Math.PI / 2;
      const path = opts.path ? opts.path.map((p) => ({ x: p.x, z: p.z })) : entry.path;
      path.push({ x: 0, z: LANE_Z });
      car.setPath(path, { restYaw: L.laneYaw });
      sys.add(car);
      lane.push(car);
      sys.relane();
      return car;
    },
    /** Register a car created elsewhere with this facility (it joins ctx.allCars). */
    add(car) { list.push(car); ctx.allCars.push(car); return car; },

    /** Re-target every lane car to its slot (cars behind roll forward). */
    relane() {
      for (let i = 0; i < lane.length; i++) {
        const car = lane[i];
        const sx = L.queueSlots[i].x;
        if (car.slotX === sx) continue;
        car.slotX = sx;
        if (car.mode === 'arriving') {
          car.path[car.path.length - 1].x = sx;
        } else if (car.mode === 'queued') {
          car.setPath([{ x: sx, z: LANE_Z }], { restYaw: L.laneYaw });
          car.enterT = 0;
        }
      }
    },

    leaveLane(car) {
      const i = lane.indexOf(car);
      if (i >= 0) { lane.splice(i, 1); sys.relane(); }
      car.slotX = null;
      if (car.ring) car.ring.visible = false;
    },

    /** A stopped, unclaimed car in the lane the player or the valet may take. */
    isWaiting(car) {
      return car.mode === 'queued' && !car.path.length && !car.claim && car.owner && car.speed < 0.05;
    },

    /** Lift says: repaired + lowered. The car leaves when its exitGap slot comes up. */
    setReady(car) { car.mode = 'ready'; car.readyT = 0; },

    depart(car) {
      lastDepart = clock;
      if (fac.hooks.depart && fac.h('depart', car)) return;   // facility moves it its own way
      const lift = car.lift;
      lift.release(car);
      car.lift = null;
      car.mode = 'reversing';
      car.pos.y = 0;
      car.setPath([{ x: lift.x, z: L.exitLaneZ }], { reverse: true, restYaw: Math.PI });
      ctx.sfxAt('engine', car.pos);
      car.tag.setVisible(false);
    },

    remove(car) {
      if (car.mode === 'gone') return;
      car.mode = 'gone';
      const i = list.indexOf(car); if (i >= 0) list.splice(i, 1);
      const k = ctx.allCars.indexOf(car); if (k >= 0) ctx.allCars.splice(k, 1);
      const j = lane.indexOf(car); if (j >= 0) { lane.splice(j, 1); sys.relane(); }
      if (car.owner && !car.ownerIn) car.owner.abandon();
      if (car.lift && car.lift.car === car) car.lift.release(car);
      car.dispose();
    },

    update(dt) {
      clock += dt;
      // ---- spawner
      if (!sys.paused && fac.h('canSpawn')) {
        const interval = fac.h('spawnInterval');
        spawnT = Math.min(spawnT + dt, interval);
        if (spawnT >= interval && sys.spawn()) spawnT = 0;
      }
      // ---- departures: one car every exitGap seconds, longest-waiting first
      if (clock - lastDepart >= ECONOMY.exitGap) {
        let best = null;
        for (const c of list) if (c.mode === 'ready' && c.readyT > 0.15 && (!best || c.readyT > best.readyT)) best = c;
        if (best) sys.depart(best);
      }
      // ---- entities
      for (let i = list.length - 1; i >= 0; i--) list[i].update(dt);
      sys.updateRings(dt);
    },

    /** Pickup rings on the north side of waiting cars + hopping in. */
    updateRings(dt) {
      const pl = ctx.player;
      let info = null;
      for (const car of lane) {
        const waiting = sys.isWaiting(car);
        if (waiting && !car.ring) {
          car.ring = createZoneRing(L.queuePickupRadius);
          ctx.root.add(car.ring);
        }
        if (!car.ring) continue;
        car.ring.visible = waiting;
        if (!waiting) { car.enterT = 0; continue; }
        const rx = car.pos.x, rz = car.pos.z + RING_DZ;
        car.ring.position.x = rx; car.ring.position.z = rz;
        const inside = pl.onFoot && Math.hypot(pl.pos.x - rx, pl.pos.z - rz) < L.queuePickupRadius;
        if (inside) {
          if (fac.bays.freeCount() > 0) {
            car.enterT += dt;
            if (car.enterT >= PLAYER.enterCarDelay) { car.enterT = 0; pl.enterCar(car); }
          } else { car.enterT = 0; info = car; }
        } else car.enterT = Math.max(0, car.enterT - dt * 2);
        const s = 1 + 0.3 * Math.min(1, car.enterT / PLAYER.enterCarDelay);
        car.ring.scale.set(s, s, s);
      }
      if (info) {
        _v.set(info.pos.x, 0, info.pos.z + RING_DZ);
        noLift.place(_v.x, 0, _v.z);
        if (!noLift.visible) ui.sfx('error');
        noLift.setVisible(true);
      } else noLift.setVisible(false);
    },

    dispose() {
      for (const c of list.slice()) {
        c.mode = 'gone'; c.dispose();
        const k = ctx.allCars.indexOf(c); if (k >= 0) ctx.allCars.splice(k, 1);
      }
      list.length = 0; lane.length = 0;
      noLift.remove();
    },
  };
  return sys;
}
