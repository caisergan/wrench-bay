// Staff: mechanics (fetch parts for a lifted car, deliver, wrench) and the valet (drives waiting cars onto lifts).
import * as THREE from 'three';
import { createCharacter, mechanicLook, valetLook } from '../models/index.js';
import { LAYOUT as L, ECONOMY } from '../config.js';
import { ui } from '../ui/index.js';
import { Walker } from './walker.js';
import { PartStack } from './stack.js';
import { popIn, hop } from './tween.js';

const LANE_Z = L.staffLaneZ;

/** Is this lift's car something a mechanic can work on right now? */
function workable(lift) {
  return lift && lift.car && (lift.phase === 'raise' || lift.phase === 'up') && !lift.car.finished;
}

class Mechanic extends Walker {
  constructor(ctx, index, from) {
    super(createCharacter(mechanicLook(index)), ECONOMY.mechanicSpeed, 0);
    this.ctx = ctx; this.index = index;
    this.home = L.mechanicIdle[index % L.mechanicIdle.length];
    this.pos.set(from ? from.x : this.home.x, 0, from ? from.z : this.home.z);
    ctx.root.add(this.group);
    if (from) popIn(this.group, 1, 0.4);
    this.stack = new PartStack(this.ch.carryAnchor, ctx.root, { hopHeight: 0.6 });
    this.state = 'idle';
    this.timer = 0.2 + index * 0.15; this.waitT = 0;
    this.lift = null; this.claims = []; this.station = null;
    this.workingAt = null; this.carrying = false; this.workShown = false;
    this.target = null;
    this.goHome();
  }

  /** Walk via the staff lane between the parts wall and the lifts. */
  goTo(x, z) {
    const p = this.pos, path = [];
    if (Math.abs(p.z - LANE_Z) > 0.3 && Math.hypot(p.x - x, p.z - z) > 0.5) path.push({ x: p.x, z: LANE_Z });
    if (Math.abs(z - LANE_Z) > 0.3) path.push({ x, z: LANE_Z });
    path.push({ x, z });
    this.path = path;
    this.target = { x, z };
  }
  goHome() { this.goTo(this.home.x, this.home.z); this.idleYaw = Math.PI / 2; }

  releaseClaims() {
    for (const j of this.claims) if (j.claim === this) j.claim = null;
    this.claims.length = 0;
  }
  pruneClaims() {
    for (let i = this.claims.length - 1; i >= 0; i--) {
      const j = this.claims[i];
      if (j.claim !== this || j.state !== 'need' || j.incoming) { if (j.claim === this) j.claim = null; this.claims.splice(i, 1); }
    }
  }
  /** Claimed parts not yet in hand -> first missing type, or null. */
  missingType() {
    for (const j of this.claims) {
      let need = 0;
      for (const k of this.claims) if (k.type === j.type) need++;
      if (this.stack.countOf(j.type, true) < need) return j.type;
    }
    return null;
  }

  /** Where this mechanic stands at a lift (second mechanic mirrors to the other side). */
  spotAt(lift) {
    let k = 0;
    for (const m of this.ctx.staff.mechanics) { if (m === this) break; if (m.lift === lift) k++; }
    const o = L.mechanicSpotOffset;
    return { x: lift.x + (k % 2 ? -o.x : o.x), z: lift.z + o.z };
  }

  /** Any carried part no car on a lift can use? */
  hasUseless() {
    for (const it of this.stack.items) {
      const t = it.userData.partType;
      let used = false;
      for (const l of this.ctx.lifts.list) if (workable(l) && l.car.findNeed(t, this, true)) { used = true; break; }
      if (!used) return true;
    }
    return false;
  }

  plan() {
    const lifts = this.ctx.lifts.list;
    let best = null, bestScore = -1e9;
    for (const l of lifts) {
      if (!workable(l)) continue;
      const car = l.car;
      let open = 0, ready = 0, carriedMatch = 0;
      for (const j of car.jobs) {
        if (j.state === 'ready') ready++;
        else if (j.state === 'need' && !j.incoming && (j.claim === null || j.claim === this) && this.ctx.stations.get(j.type)) open++;
      }
      for (const it of this.stack.items) if (car.findNeed(it.userData.partType, this, false)) carriedMatch++;
      let others = 0;
      for (const m of this.ctx.staff.mechanics) if (m !== this && m.lift === l) others++;
      if (!open && !carriedMatch && !(ready && others === 0)) continue;
      const score = (l === this.lift ? 40 : 0) - others * 30 + open * 3 + ready * 2 + carriedMatch * 8 - Math.abs(l.x - this.pos.x) * 0.3;
      if (score > bestScore) { bestScore = score; best = l; }
    }
    if (!best) {
      this.releaseClaims();
      this.lift = null;
      if (this.stack.items.length && this.hasUseless()) { this.toScrap(); return; }
      if (this.state !== 'home') { this.state = 'home'; this.goHome(); }
      return;
    }
    this.lift = best;
    this.releaseClaims();
    const car = best.car;
    // claim jobs: first the ones our carried parts cover, then fetch more (mechanicCarry total)
    const cap = ECONOMY.mechanicCarry;
    const carried = this.stack.items.map((it) => it.userData.partType);
    for (const t of carried) {
      const j = car.jobs.find((x) => x.type === t && x.state === 'need' && !x.incoming && x.claim === null);
      if (j) { j.claim = this; this.claims.push(j); }
    }
    let useless = carried.length - this.claims.length;
    for (const j of car.jobs) {
      if (this.claims.length + useless >= cap) break;
      if (j.state === 'need' && !j.incoming && j.claim === null && this.ctx.stations.get(j.type)) { j.claim = this; this.claims.push(j); }
    }
    if (useless > 0 && this.hasUseless() && this.claims.length + useless >= cap) { this.releaseClaims(); this.toScrap(); return; }
    this.startFetchOrGo();
  }

  startFetchOrGo() {
    const t = this.missingType();
    if (t) {
      this.station = this.ctx.stations.get(t);
      this.goTo(this.station.zonePos.x, this.station.zonePos.z);
      this.idleYaw = Math.PI;
      this.state = 'fetch'; this.waitT = 0;
    } else this.goLift();
  }

  goLift() {
    const s = this.spotAt(this.lift);
    this.goTo(s.x, s.z);
    this.idleYaw = 0;   // face +z, towards the car's nose
    this.state = 'toLift';
  }

  toScrap() {
    const b = L.scrapBin;
    this.goTo(b.x - 1.0, b.z);
    this.idleYaw = Math.PI / 2;
    this.state = 'toScrap';
  }

  setWorkAnim(on) { if (on !== this.workShown) { this.workShown = on; this.ch.setWorking(on); } }

  update(dt) {
    const arrived = this.step(dt);
    this.stack.settle(dt);
    const c = this.stack.count > 0;
    if (c !== this.carrying) { this.carrying = c; this.ch.setCarrying(c); }
    this.timer -= dt;
    this.workingAt = null;
    let anim = false;
    switch (this.state) {
      case 'idle': case 'home':
        if (this.timer <= 0) { this.timer = 0.35; this.plan(); }
        break;
      case 'fetch': {
        if (!workable(this.lift)) { this.state = 'idle'; this.timer = 0; break; }
        this.pruneClaims();
        const t = this.missingType();
        if (!t) {
          if (this.claims.length || this.stack.items.length) this.goLift(); else { this.state = 'idle'; this.timer = 0; }
          break;
        }
        if (!this.station || this.station.type !== t) { this.startFetchOrGo(); break; }
        if (!arrived) break;
        const st = this.station;
        if (this.timer <= 0 && st.stack.ready > 0 && this.stack.count < ECONOMY.mechanicCarry) {
          st.stack.transferTo(this.stack);
          this.timer = ECONOMY.pickupInterval; this.waitT = 0;
        } else {
          this.waitT += dt;
          // out of stock for a while: go with what we have, or give the claim back
          if (this.waitT > 5) {
            if (this.stack.items.length) this.goLift();
            else { this.releaseClaims(); this.state = 'idle'; this.timer = 0.5; }
          }
        }
        break;
      }
      case 'toLift':
        if (!workable(this.lift)) { this.state = 'idle'; this.timer = 0; break; }
        if (arrived) { this.state = 'deliver'; this.timer = 0; }
        break;
      case 'deliver': {
        const lift = this.lift;
        if (!workable(lift)) { this.state = 'idle'; this.timer = 0; break; }
        if (this.timer > 0) break;
        const items = this.stack.items;
        let sent = false;
        for (let i = items.length - 1; i >= 0; i--) {
          const job = lift.car.findNeed(items[i].userData.partType, this, true);
          if (!job) continue;
          const part = this.stack.takeAt(i);
          const k = this.claims.indexOf(job); if (k >= 0) this.claims.splice(k, 1);
          lift.deliverPart(part, job);
          this.timer = ECONOMY.deliverInterval;
          sent = true;
          break;
        }
        if (!sent && this.stack.pending === 0) { this.state = 'work'; }
        break;
      }
      case 'work': {
        const lift = this.lift;
        if (!workable(lift)) { this.releaseClaims(); this.state = 'idle'; this.timer = 0.3; break; }
        const car = lift.car;
        if (car.firstReady() && lift.phase === 'up') { this.workingAt = lift; anim = true; break; }
        // nothing to wrench: fetch the rest (if nobody else is on it), or wait for incoming parts
        let open = false;
        for (const j of car.jobs) if (j.state === 'need' && !j.incoming && (j.claim === null || j.claim === this)) open = true;
        let incoming = false;
        for (const j of car.jobs) if (j.incoming || (j.state === 'need' && j.claim && j.claim !== this)) incoming = true;
        if (open || this.stack.items.length) { if (this.timer <= 0) { this.timer = 0.2; this.plan(); } }
        else if (!incoming && this.timer <= 0) { this.timer = 0.3; this.plan(); }
        break;
      }
      case 'toScrap':
        if (arrived) {
          this.ctx.extras.dumpFrom(this.stack, this.group.position);
          this.state = 'idle'; this.timer = 0.6;
        }
        break;
    }
    this.setWorkAnim(anim);
  }
}

class Valet extends Walker {
  constructor(ctx, from) {
    super(createCharacter(valetLook()), 3.4, 0);
    this.ctx = ctx;
    const s = L.valetStand;
    this.home = { x: s.x - 0.75, z: s.z + 0.15 };
    this.pos.set(from ? from.x : this.home.x, 0, from ? from.z : this.home.z);
    ctx.root.add(this.group);
    if (from) popIn(this.group, 1, 0.4);
    this.path = [{ x: this.home.x, z: this.home.z }];
    this.idleYaw = 0;
    this.state = 'idle'; this.timer = 0.5; this.car = null; this.lift = null;
    this.hidden = false;
  }

  door(car, out) { out.x = car.pos.x - 0.35; out.z = car.pos.z + L.queuePickupOffsetZ + 0.35; return out; }

  pickCar() {
    const cars = this.ctx.cars;
    for (const car of cars.lane) {             // front-most first
      if (!cars.isWaiting(car)) continue;
      if (car.enterT > 0 || car.queuedT < ECONOMY.valetDelay) return null;
      return car;
    }
    return null;
  }
  pickLift(car) {
    const lifts = this.ctx.lifts;
    const need = this.ctx.player.driving ? 2 : 1;
    if (lifts.capturableCount() < need) return null;
    let best = null, bd = 1e9;
    for (const l of lifts.list) {
      if (!l || !l.canCapture) continue;
      const d = Math.abs(l.x - car.pos.x);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  update(dt) {
    this.timer -= dt;
    if (this.hidden) {
      if (this.car) this.pos.set(this.car.pos.x, 0, this.car.pos.z);
      return;
    }
    const arrived = this.step(dt);
    switch (this.state) {
      case 'idle': case 'return': {
        if (this.state === 'return' && arrived) { this.state = 'idle'; this.idleYaw = 0; }
        if (this.timer > 0) break;
        this.timer = 0.25;
        const car = this.pickCar();
        if (!car) break;
        const lift = this.pickLift(car);
        if (!lift) break;
        this.car = car; this.lift = lift;
        car.claim = 'valet';
        lift.reserved = car;
        const d = this.door(car, { x: 0, z: 0 });
        this.path = [{ x: d.x, z: d.z }];
        this.idleYaw = null;
        this.state = 'toCar';
        break;
      }
      case 'toCar': {
        const car = this.car;
        if (car.mode !== 'queued') { this.abort(); break; }
        if (this.timer <= 0) {
          this.timer = 0.25;
          const d = this.door(car, { x: 0, z: 0 });
          const last = this.path[this.path.length - 1];
          if (!last || Math.hypot(last.x - d.x, last.z - d.z) > 0.3) this.path = [d];
        }
        if (arrived && !car.path.length && car.speed < 0.05) this.board();
        break;
      }
    }
  }

  abort() {
    if (this.lift && this.lift.reserved === this.car) this.lift.reserved = null;
    if (this.car && this.car.claim === 'valet') this.car.claim = null;
    this.car = null; this.lift = null;
    this.state = 'return';
    this.path = [{ x: this.home.x, z: this.home.z }];
  }

  board() {
    const car = this.car, lift = this.lift;
    this.state = 'boarding';
    const cars = this.ctx.cars;
    cars.leaveLane(car);
    car.mode = 'boarding';
    hop(this.group, this.pos, (out) => out.set(car.pos.x, 0.5, car.pos.z), {
      duration: 0.3, height: 0.8, scaleFrom: 1, scaleTo: 0.3,
      onComplete: () => {
        this.group.visible = false; this.hidden = true;
        this.group.scale.setScalar(1);
        car.mode = 'valet';
        const sx = car.pos.x;
        car.setPath([
          { x: sx + 0.4, z: L.queueLaneZ - 2.4 },
          { x: lift.x, z: 1.8 },
          { x: lift.x, z: -0.2 },
        ], { restYaw: Math.PI });
        car.onArrive = () => lift.capture(car, 'valet', this);
        ui.sfx('engine');
      },
    });
  }

  /** The lift snapped our car: hop out and walk back to the stand. */
  alight(lift) {
    const car = this.car;
    this.car = null; this.lift = null;
    this.hidden = false;
    const from = new THREE.Vector3(car.pos.x, 0.5, car.pos.z);
    const to = new THREE.Vector3(lift.x - 1.0, 0, lift.z + 1.9);
    this.pos.copy(from);
    this.group.visible = true;
    this.state = 'alighting';
    hop(this.group, from, to, {
      duration: 0.34, height: 1.0, scaleFrom: 0.3, scaleTo: 1,
      onComplete: () => {
        this.pos.y = 0; this.group.scale.setScalar(1);
        this.state = 'return';
        this.path = [{ x: lift.x - 1.0, z: 2.2 }, { x: this.home.x, z: this.home.z }];
      },
    });
  }
}

export function createStaff(ctx) {
  const mechanics = [];
  let valet = null;
  return {
    mechanics,
    get valet() { return valet; },
    addMechanic(index, from) {
      if (mechanics.some((m) => m.index === index)) return;
      mechanics.push(new Mechanic(ctx, index, from));
    },
    addValet(from) { if (!valet) valet = new Valet(ctx, from); },
    update(dt) {
      for (const m of mechanics) m.update(dt);
      if (valet) valet.update(dt);
    },
    dispose() { for (const m of mechanics) { m.releaseClaims(); m.stack.clear(); } },
  };
}

