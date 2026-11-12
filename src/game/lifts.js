// Lifts: capture a car (snap tween), raise, deliver parts, work, payout (cash pile), lower, release.
// Phases: empty -> snap -> raise -> up -> lower -> done (car 'ready', leaves on its exitGap slot) -> empty.
import * as THREE from 'three';
import { scene, camera } from '../core/engine.js';
import { createLift, createZoneRing, LIFT_RISE, sparks, confetti } from '../models/index.js';
import { LAYOUT as L, ECONOMY, PROBLEMS } from '../config.js';
import { state, upgradeValue, repairPayout, setStreak, addGems } from '../core/state.js';
import { events } from '../core/events.js';
import { ui } from '../ui/index.js';
import { tween, ease, popIn, hop } from './tween.js';
import { angleDiff, clamp, detach, fmt, makeArrow } from './util.js';
import { CashPile } from './cash.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

class Lift {
  constructor(sys, index, animate) {
    const ctx = sys.ctx;
    this.sys = sys; this.ctx = ctx; this.index = index;
    const cfg = L.lifts[index];
    this.x = cfg.x; this.z = cfg.z;
    this.model = createLift();
    this.model.group.position.set(cfg.x, 0, cfg.z);
    ctx.root.add(this.model.group);
    if (animate) popIn(this.model.group, 1, 0.5);
    this.model.setHeight(0);
    this.model.setLight('idle');
    const po = L.liftPostOffsetX, hp = 0.22;
    ctx.obstacles.push(
      { minX: cfg.x - po - hp, maxX: cfg.x - po + hp, minZ: cfg.z - hp, maxZ: cfg.z + hp },
      { minX: cfg.x + po - hp, maxX: cfg.x + po + hp, minZ: cfg.z - hp, maxZ: cfg.z + hp },
    );
    this.workPos = new THREE.Vector3(cfg.x, 0, cfg.z + L.liftWorkOffsetZ);
    this.workRing = createZoneRing(L.liftWorkRadius);
    this.workRing.position.x = this.workPos.x; this.workRing.position.z = this.workPos.z;
    this.workRing.visible = false;
    ctx.root.add(this.workRing);
    // free-lift highlight while the player drives
    this.freeRing = createZoneRing(1.35);
    this.freeRing.position.x = cfg.x; this.freeRing.position.z = cfg.z;
    this.freeRing.visible = false;
    ctx.root.add(this.freeRing);
    this.marker = makeArrow(0x5fd38d, 0x1f3b2e, 0.95);
    this.marker.visible = false;
    ctx.root.add(this.marker);
    this.pile = new CashPile(ctx, cfg.x + L.liftCashOffset.x, 0, cfg.z + L.liftCashOffset.z, { radius: 1.25 });

    this.car = null; this.reserved = null; this.outgoing = null;
    this.phase = 'empty'; this.h = 0;
    this.sparkT = 0; this.wrenchT = 0; this.t = Math.random() * 5;
    this.playerHere = false;
  }

  get free() { return !this.car && !this.reserved; }
  /** Free AND the previous car has backed out of the capture box. */
  get canCapture() {
    if (!this.free) return false;
    const o = this.outgoing;
    if (o && o.mode !== 'gone' && o.mode === 'reversing' && o.pos.z < this.z + 4.6) return false;
    return true;
  }
  inCapture(p) { return Math.abs(p.x - this.x) < L.liftCapture.halfX && p.z < L.liftCapture.maxZ; }

  /** Snap `car` onto the lift. who: 'player' | 'valet' (the driver pops out when the snap ends). */
  capture(car, who, driver) {
    this.car = car; this.reserved = null; this.outgoing = null;
    car.lift = this; car.mode = 'snap'; car.claim = null;
    car.speed = 0; car.vx = car.vz = 0; car.wheelSpeed = 0; car.path.length = 0;
    this.phase = 'snap';
    const sx = car.pos.x, sz = car.pos.z, sy = car.yaw;
    const ty = sy + angleDiff(sy, Math.PI);
    const dist = Math.hypot(this.x - sx, this.z - sz);
    ui.sfx('drop');
    tween({
      duration: clamp(0.25 + dist * 0.07, 0.3, 0.6), ease: ease.outCubic,
      onUpdate: (e, k) => {
        car.pos.x = sx + (this.x - sx) * e;
        car.pos.z = sz + (this.z - sz) * e;
        car.pos.y = Math.sin(k * Math.PI) * 0.12;
        car.yaw = sy + (ty - sy) * e;
        car.wheelSpeed = (1 - k) * 4;
      },
      onComplete: () => {
        car.pos.set(this.x, 0, this.z); car.yaw = Math.PI; car.wheelSpeed = 0;
        car.mode = 'lift';
        car.tag.setVisible(true); car.markJobsDirty();
        if (who === 'player') this.ctx.player.exitCar(this);
        else if (driver) driver.alight(this);
        this.phase = 'raise';
        this.model.setLight('busy');
        ui.sfx('lift');
        this.workRing.visible = true;
        tween({
          duration: ECONOMY.liftTime, ease: ease.inOutQuad,
          onUpdate: (e) => { this.h = e; },
          onComplete: () => { this.h = 1; if (this.phase === 'raise') this.phase = 'up'; },
        });
      },
    });
  }

  /** Car starts reversing: the lift is free again. */
  release(car) {
    if (this.car !== car) return;
    this.car = null; this.outgoing = car;
    this.phase = 'empty'; this.h = 0;
    this.model.setHeight(0);
    this.model.setLight('idle');
    this.workRing.visible = false;
  }

  /** Work rate (work-seconds per second) of the mechanics standing at this lift. */
  mechanicRate() {
    let r = 0;
    for (const m of this.ctx.staff.mechanics) if (m.workingAt === this) r += ECONOMY.mechanicRate * upgradeValue('repair');
    return r;
  }

  /** Fly a part (already detached into the world root) into the car; job becomes 'ready' on landing. */
  deliverPart(part, job, from) {
    const car = this.car;
    job.incoming = true; job.claim = null;
    hop(part, from || part.position, (out) => car.nose(out, 0.75), {
      duration: 0.3, height: 0.9, scaleFrom: part.scale.x, scaleTo: 0.55,
      onComplete: () => {
        detach(part);
        job.incoming = false;
        if (job.state === 'need') job.state = 'ready';
        car.markJobsDirty();
        ui.sfx('drop');
      },
    });
  }

  update(dt) {
    this.t += dt;
    this.model.update(dt);
    const car = this.car;
    const pl = this.ctx.player;
    this.playerHere = false;
    if (car && car.mode !== 'snap') {
      this.model.setHeight(this.h);
      car.pos.y = this.h * LIFT_RISE;
    }
    if (car && (this.phase === 'raise' || this.phase === 'up')) {
      // ---- player delivers + works
      const inZone = pl.onFoot && Math.hypot(pl.pos.x - this.workPos.x, pl.pos.z - this.workPos.z) < L.liftWorkRadius;
      let rate = 0;
      if (inZone) {
        this.playerHere = true;
        pl.workLift = this;
        if (pl.dropTimer <= 0) {
          const items = pl.stack.items;
          for (let i = items.length - 1; i >= 0; i--) {
            const job = car.findNeed(items[i].userData.partType, null, true);
            if (!job) continue;
            const part = pl.stack.takeAt(i);
            this.deliverPart(part, job);
            pl.dropTimer = ECONOMY.deliverInterval;
            break;
          }
        }
      }
      const ready = this.phase === 'up' ? car.firstReady() : null;
      if (ready) {
        if (inZone) { rate += upgradeValue('repair'); pl.working = true; }
        rate += this.mechanicRate();
      }
      if (ready && rate > 0) {
        ready.progress += (rate * dt) / PROBLEMS[ready.type].work;
        this.sparkT -= dt;
        if (this.sparkT <= 0) { this.sparkT = 0.16 + Math.random() * 0.12; sparks(scene, car.nose(_v, 0.7)); }
        if (inZone) {
          this.wrenchT -= dt;
          if (this.wrenchT <= 0) { this.wrenchT = 1 / 6; ui.sfx('wrench'); }
        }
        if (ready.progress >= 1) {
          car.jobDone(ready);
          ui.sfx('fix');
          ui.floatText(car.nose(_w, 1.6), 'Fixed!', 'good');
          sparks(scene, car.nose(_v, 0.8));
        }
      }
      if (this.phase === 'up' && car.finished) this.finish();
    }
    // ---- free-lift highlight while driving
    const showFree = pl.mode === 'driving' && this.canCapture;
    this.freeRing.visible = showFree;
    this.marker.visible = showFree;
    if (showFree) {
      const b = Math.abs(Math.sin(this.t * 4.5));
      this.marker.position.set(this.x, 1.3 + b * 0.5, this.z);
      this.marker.quaternion.copy(camera.quaternion);
      const s = 1 + 0.06 * Math.sin(this.t * 6);
      this.freeRing.scale.set(s, s, s);
    }
    if (this.workRing.visible) {
      const s = this.playerHere ? 1.06 : 1;
      this.workRing.scale.set(s, s, s);
    }
    if (this.outgoing && (this.outgoing.mode === 'gone' || this.outgoing.pos.z > this.z + 6)) this.outgoing = null;
  }

  finish() {
    const car = this.car;
    this.phase = 'lower';
    this.workRing.visible = false;
    car.stopPatience();
    const speedy = car.patience > 0;
    const pay = repairPayout(car.types, { tier: car.tier, vip: car.vip, speedy });
    if (speedy) setStreak(state.streak + 1); else setStreak(0);
    const st = state.stats;
    st.repaired++; st.jobsDone += car.types.length;
    if (car.vip) { st.vips++; addGems(ECONOMY.vipGems); }

    car.nose(_v, 1.2);
    confetti(scene, _v.set(car.pos.x, car.pos.y + 1.4, car.pos.z));
    car.model.setShine(true);
    this.model.setLight('done');
    ui.sfx('done');
    if (car.vip) ui.sfx('vip');

    // cash bundles hop from the car onto the pile
    const n = clamp(2 + car.types.length * 2, 3, 10);
    const each = Math.floor(pay.total / n);
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? pay.total - each * (n - 1) : each;
      this.pile.add(v, _w.set(car.pos.x + 0.5, car.pos.y + 1.2, car.pos.z - 0.6), i * 0.06);
    }
    const top = _w.set(car.pos.x, car.pos.y + 2.6, car.pos.z);
    ui.floatText(top, '+$' + fmt(pay.total), 'cash');
    if (speedy) ui.floatText(_w.set(car.pos.x, car.pos.y + 3.3, car.pos.z), 'Speedy!', 'good');
    if (car.vip) ui.floatText(_w.set(car.pos.x + 0.9, car.pos.y + 2.2, car.pos.z), '+' + ECONOMY.vipGems, 'gem');

    if (car.owner) car.owner.carReady(speedy, car.vip);
    events.emit('car:repaired', { count: st.repaired, vip: car.vip, speedy, total: pay.total });

    ui.sfx('lift');
    tween({
      duration: ECONOMY.liftTime, delay: 0.25, ease: ease.inOutQuad,
      onUpdate: (e) => { this.h = 1 - e; },
      onComplete: () => {
        this.h = 0;
        if (this.car !== car) return;
        this.phase = 'done';
        car.pos.y = 0;
        this.ctx.cars.setReady(car);
      },
    });
  }

  dispose() {}
}

export function createLifts(ctx) {
  const list = [];
  const sys = {
    ctx, list,
    add(index, animate) { if (!list[index]) list[index] = new Lift(sys, index, animate); return list[index]; },
    get active() { return list.filter(Boolean); },
    freeCount() { let n = 0; for (const l of list) if (l && l.free) n++; return n; },
    capturableCount() { let n = 0; for (const l of list) if (l && l.canCapture) n++; return n; },
    /** Called every frame while the player drives `car`. */
    tryCapture(car) {
      for (const l of list) {
        if (l && l.canCapture && l.inCapture(car.pos)) { l.capture(car, 'player'); return true; }
      }
      return false;
    },
    update(dt) {
      ctx.player.workLift = null;
      ctx.player.working = false;
      for (const l of list) if (l) l.update(dt);
    },
    dispose() {},
  };
  return sys;
}
