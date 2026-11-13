// Bays (garage: lifts): capture a car (snap tween), raise, deliver parts, work, payout (cash pile), lower, release.
// Phases: empty -> snap -> raise -> up -> lower -> done (car 'ready', leaves on its exitGap slot) -> empty.
// A facility with another sequence (paint: mask / spray / cure) subclasses Bay and overrides onSnapped(),
// updateActive(dt), isWorkable(), finish() (see TOWN.md 6a).
import * as THREE from 'three';
import { scene, camera } from '../core/engine.js';
import { createZoneRing, createFloorMat, LIFT_RISE, sparks, confetti } from '../models/index.js';
import { ECONOMY, PLAYER } from '../config.js';
import { ui } from '../ui/index.js';
import { tween, ease, popIn, hop } from './tween.js';
import { angleDiff, clamp, detach, fmt, makeArrow, onMat } from './util.js';
import { CashPile } from './cash.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Bay {
  constructor(sys, index, animate) {
    const ctx = sys.ctx, fac = sys.fac, L = fac.L;
    this.sys = sys; this.ctx = ctx; this.fac = fac; this.L = L; this.index = index;
    const cfg = L.bays[index];
    this.x = cfg.x; this.z = cfg.z;
    this.model = fac.h('bayModel', index);
    this.model.group.position.set(cfg.x, 0, cfg.z);
    ctx.root.add(this.model.group);
    if (animate) popIn(this.model.group, 1, 0.5);
    this.model.setHeight?.(0);
    this.model.setLight?.('idle');
    for (const b of fac.h('bayObstacles', cfg)) ctx.obstacles.push(b);
    // the work mat in front of the car's nose: shown while a car is on the bay (setWorkMat)
    this.workPos = new THREE.Vector3(cfg.x, 0, cfg.z + L.workOffsetZ);
    this.workMat = createFloorMat(L.workMat.w, L.workMat.d, { icon: 'wrench', kind: 'lift' });
    this.workMat.group.position.copy(this.workPos);
    this.workMat.group.visible = false;
    ctx.root.add(this.workMat.group);
    // free-lift highlight while the player drives
    this.freeRing = createZoneRing(1.35);
    this.freeRing.position.x = cfg.x; this.freeRing.position.z = cfg.z;
    this.freeRing.visible = false;
    ctx.root.add(this.freeRing);
    this.marker = makeArrow(0x5fd38d, 0x1f3b2e, 0.95);
    this.marker.visible = false;
    ctx.root.add(this.marker);
    this.pile = new CashPile(ctx, cfg.x + L.cashOffset.x, 0, cfg.z + L.cashOffset.z, { radius: 1.25 });

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
  inCapture(p) {
    const c = this.L.capture;
    return Math.abs(p.x - this.x) < c.halfX && p.z < c.maxZ;
  }
  /** Can staff work on this bay's car right now? */
  isWorkable() { return !!this.car && (this.phase === 'raise' || this.phase === 'up') && !this.car.finished; }

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
        this.onSnapped(car);
      },
    });
  }

  /** The car sits on the bay. Garage: raise the lift (phase raise -> up). */
  onSnapped(car) {
    this.phase = 'raise';
    this.model.setLight?.('busy');
    ui.sfx('lift');
    this.setWorkMat(true);
    tween({
      duration: ECONOMY.liftTime, ease: ease.inOutQuad,
      onUpdate: (e) => { this.h = e; },
      onComplete: () => { this.h = 1; if (this.phase === 'raise') this.phase = 'up'; },
    });
  }

  /** Where the player pops out after driving a car onto this bay (on the work mat, right of the mechanic's spot). */
  exitSpot(out) { return out.set(this.x + 0.3, 0, this.workPos.z + 0.05); }

  setWorkMat(on) { this.workMat.group.visible = on; }

  /** Car starts reversing: the lift is free again. */
  release(car) {
    if (this.car !== car) return;
    this.car = null; this.outgoing = car;
    this.phase = 'empty'; this.h = 0;
    this.model.setHeight?.(0);
    this.model.setLight?.('idle');
    this.setWorkMat(false);
    car.tag.setSolid(false);
  }

  /** Work rate (work-seconds per second) of the mechanics standing at this lift. */
  mechanicRate() {
    let r = 0;
    for (const m of this.fac.staff.mechanics) if (m.workingAt === this) r += this.fac.h('staffRate', m);
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

  /** Player on foot on this bay's work mat? (Delivering parts works while walking across it.) */
  playerInZone() {
    const pl = this.ctx.player;
    return pl.onFoot && onMat(pl.pos, this.workPos, this.L.workMat);
  }
  /** On the mat and standing still (PLAYER.stillTime): only then does the player work (repair / spray). */
  playerCanWork(inZone = this.playerInZone()) { return inZone && this.ctx.player.stillT >= PLAYER.stillTime; }

  /** Player delivers carried parts the car still needs (one per deliverInterval). */
  deliverFromPlayer() {
    const pl = this.ctx.player, car = this.car;
    if (pl.dropTimer > 0) return;
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

  update(dt) {
    this.t += dt;
    const near = this.ctx.near(this.workPos, 3);
    if (near) this.model.update(dt);
    const car = this.car;
    const pl = this.ctx.player;
    this.playerHere = false;
    if (car && car.mode !== 'snap') {
      this.model.setHeight?.(this.h);
      car.pos.y = this.h * LIFT_RISE;
    }
    if (car) this.updateActive(dt);
    this.updateHighlights(dt);
    if (this.outgoing && (this.outgoing.mode === 'gone' || this.outgoing.pos.z > this.z + 6)) this.outgoing = null;
  }

  /** Garage: deliver + work while raised; finish when every job is done. */
  updateActive(dt) {
    const car = this.car, pl = this.ctx.player;
    if (this.phase === 'raise' || this.phase === 'up') {
      // ---- player delivers + works
      const inZone = this.playerInZone();
      let rate = 0;
      if (inZone) {
        this.playerHere = true;
        pl.workLift = this;
        this.deliverFromPlayer();
      }
      const ready = this.phase === 'up' ? car.firstReady() : null;
      const works = !!ready && this.playerCanWork(inZone);
      if (ready) {
        if (works) { rate += this.fac.h('playerRate'); pl.working = true; }
        rate += this.mechanicRate();
      }
      // while the player repairs, the job bubble stays opaque over them so the progress stays readable
      car.tag.setSolid(works);
      if (ready && rate > 0) {
        ready.progress += (rate * dt) / this.fac.h('workTime', ready);
        this.sparkT -= dt;
        if (this.sparkT <= 0) { this.sparkT = 0.16 + Math.random() * 0.12; if (this.ctx.near(car.pos)) sparks(scene, car.nose(_v, 0.7)); }
        if (works) {
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
  }

  /** Free-bay highlight while the player drives a car of this facility. */
  updateHighlights(dt) {
    const pl = this.ctx.player;
    const showFree = pl.mode === 'driving' && pl.car && pl.car.fac === this.fac && this.canCapture;
    this.freeRing.visible = showFree;
    this.marker.visible = showFree;
    if (showFree) {
      const b = Math.abs(Math.sin(this.t * 4.5));
      this.marker.position.set(this.x, 1.3 + b * 0.5, this.z);
      this.marker.quaternion.copy(camera.quaternion);
      const s = 1 + 0.06 * Math.sin(this.t * 6);
      this.freeRing.scale.set(s, s, s);
    }
    if (this.workMat.group.visible) {
      // green while the player stands on it; yellow (pulsing) while they carry a part this car still needs
      let has = false;
      if (!this.playerHere && this.car && pl.onFoot) {
        for (const it of pl.stack.items) if (this.car.findNeed(it.userData.partType, null, true)) { has = true; break; }
      }
      this.workMat.set(this.playerHere ? 'on' : has ? 'want' : 'idle');
      this.workMat.glow(has ? 0.1 + 0.1 * Math.sin(this.t * 6.5) : 0);
    }
  }

  finish() {
    const car = this.car;
    this.phase = 'lower';
    this.setWorkMat(false);
    car.tag.setSolid(false);
    car.stopPatience();
    const pay = this.fac.h('payout', car);
    const speedy = !!pay.speedy;

    car.nose(_v, 1.2);
    confetti(scene, _v.set(car.pos.x, car.pos.y + 1.4, car.pos.z));
    car.model.setShine(true);
    this.model.setLight?.('done');
    ui.sfx('done');
    if (car.vip) ui.sfx('vip');

    this.payOut(car, pay);
    if (pay.bonusText) ui.floatText(_w.set(car.pos.x - 0.9, car.pos.y + 2.2, car.pos.z), pay.bonusText, 'good');
    if (car.vip) ui.floatText(_w.set(car.pos.x + 0.9, car.pos.y + 2.2, car.pos.z), '+' + ECONOMY.vipGems, 'gem');

    if (car.owner) car.owner.carReady(speedy, car.vip);
    this.fac.h('onFinished', car, pay);
    this.lowerAndRelease(car);
  }

  /** Cash bundles hop from the car onto this bay's pile + "+$N" (and "Speedy!") float text. */
  payOut(car, pay) {
    const n = clamp(2 + car.types.length * 2, 3, 10);
    const each = Math.floor(pay.total / n);
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? pay.total - each * (n - 1) : each;
      this.pile.add(v, _w.set(car.pos.x + 0.5, car.pos.y + 1.2, car.pos.z - 0.6), i * 0.06);
    }
    const top = _w.set(car.pos.x, car.pos.y + 2.6, car.pos.z);
    ui.floatText(top, '+$' + fmt(pay.total), 'cash');
    if (pay.speedy) ui.floatText(_w.set(car.pos.x, car.pos.y + 3.3, car.pos.z), 'Speedy!', 'good');
  }

  /** Garage: lower the lift, then the car is 'ready' (cars.js lets it leave on its exitGap slot). */
  lowerAndRelease(car) {
    ui.sfx('lift');
    tween({
      duration: ECONOMY.liftTime, delay: 0.25, ease: ease.inOutQuad,
      onUpdate: (e) => { this.h = 1 - e; },
      onComplete: () => {
        this.h = 0;
        if (this.car !== car) return;
        this.phase = 'done';
        car.pos.y = 0;
        this.fac.cars.setReady(car);
      },
    });
  }

  dispose() { this.workMat.dispose(); }
}

export function createBays(ctx, fac) {
  const list = [];
  const sys = {
    ctx, fac, list,
    add(index, animate) { if (!list[index]) list[index] = new fac.classes.Bay(sys, index, animate); return list[index]; },
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
    update(dt) { for (const l of list) if (l) l.update(dt); },
    dispose() { for (const l of list) if (l) l.dispose(); },
  };
  return sys;
}
