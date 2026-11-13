// Towing maths for rescue.js (TOWN.md 4.5 point 3): a car whose front axle hangs on a tow truck's hitch and whose rear
// wheels roll on the road, behind whoever drives the truck (player or dispatcher).
//   F = hitch (world xz, from the truck's pose and the hitch's local z at TOW_BOOM)
//   R = F - unit(F - R_prev) * Lh        rear axle pulled along (Lh = horizontal axle distance at setTowed(1))
//   heading clamped to RESCUE.maxArticulation of the truck's heading (never folds into the truck, also reversing or
//   pivoting on the spot); then two circles of the car (middle, rear) are pushed out of static obstacles, the bounds
//   and other cars, and the heading is re-derived, so scraping a wall drags the car along it instead of through it.
//   Car group: yaw = heading, position = F - forward * dims.ax (the front axle stays at local z = ax in setTowed).
// No per-frame allocations; nothing changes while F stands still (no jitter at rest).
import * as THREE from 'three';
import { RESCUE } from '../config.js';
import { resolveCircle } from './collision.js';
import { angleDiff } from './util.js';

const _c = new THREE.Vector3();
const hitchCache = new WeakMap();   // truck model -> Map(boom * 1000 -> { y, z })

/** Local position (y, z) of a tow truck model's hitch at boom value k (measured once per model and k). */
export function hitchLocal(model, k) {
  let m = hitchCache.get(model);
  if (!m) { m = new Map(); hitchCache.set(model, m); }
  const key = Math.round(k * 1000);
  let r = m.get(key);
  if (r) return r;
  if (!model?.hitch || !model.setBoom) r = { y: 0.5, z: -2.0 };
  else {
    const prev = model.rescueBoom ?? 0;
    model.setBoom(k);
    r = { y: model.hitch.position.y, z: model.hitch.position.z };
    model.setBoom(prev);
  }
  m.set(key, r);
  return r;
}

/** Set a truck model's wheel-lift (remembered on the model so measuring can put it back). */
export function setBoom(model, k) {
  if (!model?.setBoom) return;
  model.rescueBoom = k;
  model.setBoom(k);
}

export class Tow {
  /** truck: PlayerVehicle; model: the towed car's model API (dims, group, setTowed ...). */
  constructor(ctx, truck, model, boom) {
    this.ctx = ctx; this.truck = truck; this.model = model;
    const d = model.dims;
    this.ax = d.ax; this.L = d.length; this.W = d.width;
    const span = d.ax - d.axR, c = (d.wheelRF ?? d.wheelR) - d.wheelR, lift = d.towLift ?? 0.42;
    const A = Math.hypot(c, span);
    this.Lh = Math.sqrt(Math.max(0.04, A * A - (c + lift) * (c + lift)));
    this.half = Math.max(0, this.L / 2 - this.W / 2);
    this.boom = boom;                       // the lift value the hitch hangs at while towing
    this.hz = hitchLocal(truck.model, boom).z;
    this.hzModel = truck.model;
    this.Fx = 0; this.Fz = 0; this.Rx = 0; this.Rz = 0; this.h = 0;
    this.lastFx = NaN; this.lastFz = NaN; this.lastYaw = NaN;
    this.speed = 0;
    this.pos = new THREE.Vector3();           // car centre (= model origin)
    this.capsule = { ax: 0, az: 0, bx: 0, bz: 0, r: this.W / 2, owner: truck };
    this.mover = { pos: this.pos, radius: this.L / 2, hidden: false, owner: this };
  }

  /** The car stands at (x, z) heading yaw; its front axle is on the hitch. */
  place(x, z, yaw) {
    const sx = Math.sin(yaw), sz = Math.cos(yaw);
    this.h = yaw;
    this.Fx = x + sx * this.ax; this.Fz = z + sz * this.ax;
    this.Rx = this.Fx - sx * this.Lh; this.Rz = this.Fz - sz * this.Lh;
    this.lastFx = this.lastFz = this.lastYaw = NaN;
    this.apply();
  }

  clampH(h, yaw) {
    const max = RESCUE.maxArticulation ?? 1.25;
    const d = angleDiff(yaw, h);
    return d > max ? yaw + max : d < -max ? yaw - max : h;
  }

  /** Follow the truck. Returns false when nothing moved (F still: no change at all). */
  update(dt) {
    const T = this.truck;
    if (T.model !== this.hzModel) { this.hzModel = T.model; this.hz = hitchLocal(T.model, this.boom).z; }
    const yaw = T.yaw, Fx = T.pos.x + Math.sin(yaw) * this.hz, Fz = T.pos.z + Math.cos(yaw) * this.hz;
    if (Fx === this.lastFx && Fz === this.lastFz && yaw === this.lastYaw) { this.speed = 0; return false; }
    this.lastFx = Fx; this.lastFz = Fz; this.lastYaw = yaw;
    const R0x = this.Rx, R0z = this.Rz;
    let h = this.clampH(Math.atan2(Fx - R0x, Fz - R0z), yaw);
    let Rx = Fx - Math.sin(h) * this.Lh, Rz = Fz - Math.cos(h) * this.Lh;
    // push the car's middle and rear out of walls / other cars: move the rear axle by the push, levered about F
    const ctx = this.ctx, r = this.W / 2;
    for (let pass = 0; pass < 2; pass++) {
      const sx = Math.sin(h), sz = Math.cos(h);
      let mx = 0, mz = 0, best = 0;
      for (let i = 0; i < 2; i++) {
        const di = this.ax + (i ? this.half : 0);
        if (di < 0.2) continue;
        const cx = Fx - sx * di, cz = Fz - sz * di;
        _c.set(cx, 0, cz);
        resolveCircle(_c, r, ctx.obstacles, ctx.bounds, ctx.capsules, T);
        const ddx = _c.x - cx, ddz = _c.z - cz, d2 = ddx * ddx + ddz * ddz;
        if (d2 > best) { best = d2; const k = this.Lh / di; mx = ddx * k; mz = ddz * k; }
      }
      if (best < 1e-8) break;
      Rx += mx; Rz += mz;
      h = this.clampH(Math.atan2(Fx - Rx, Fz - Rz), yaw);
      Rx = Fx - Math.sin(h) * this.Lh; Rz = Fz - Math.cos(h) * this.Lh;
    }
    // the rear wheels roll by how far the rear axle moved along the car
    this.speed = dt > 0 ? ((Rx - R0x) * Math.sin(h) + (Rz - R0z) * Math.cos(h)) / dt : 0;
    this.Fx = Fx; this.Fz = Fz; this.Rx = Rx; this.Rz = Rz; this.h = h;
    this.apply();
    return true;
  }

  /** Car group + capsule from F and the heading. */
  apply() {
    const sx = Math.sin(this.h), sz = Math.cos(this.h);
    const ox = this.Fx - sx * this.ax, oz = this.Fz - sz * this.ax;
    this.pos.set(ox, 0, oz);
    const g = this.model.group;
    g.position.set(ox, 0, oz);
    g.rotation.y = this.h;
    const c = this.capsule;
    c.ax = ox - sx * this.half; c.az = oz - sz * this.half;
    c.bx = ox + sx * this.half; c.bz = oz + sz * this.half;
  }
}
