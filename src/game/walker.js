// Waypoint-following character wrapper with smooth speed and facing. Used by customers, helpers, cashier.
import { damp, lerpAngle } from './util.js';

export class Walker {
  constructor(ch, speed, yaw = 0) {
    this.ch = ch; this.group = ch.group; this.pos = ch.group.position;
    this.speed = speed; this.cur = 0; this.yaw = yaw; this.targetYaw = yaw; this.idleYaw = null;
    this.path = []; this.sitting = false;
    this.group.rotation.y = yaw;
  }
  setPath(p) { this.path = p; }
  get arrived() { return this.path.length === 0; }

  /** Advance along the path. Returns true when there is nothing left to walk to. */
  step(dt) {
    if (this.sitting) { this.ch.update(dt, 0); return true; }
    let moving = false;
    while (this.path.length) {
      const w = this.path[0];
      const dx = w.x - this.pos.x, dz = w.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.06) { this.path.shift(); continue; }
      moving = true;
      this.cur += (this.speed - this.cur) * damp(10, dt);
      const s = Math.min(d, this.cur * dt);
      this.pos.x += (dx / d) * s; this.pos.z += (dz / d) * s;
      this.targetYaw = Math.atan2(dx, dz);
      break;
    }
    if (!moving) {
      this.cur += (0 - this.cur) * damp(12, dt);
      if (this.idleYaw !== null) this.targetYaw = this.idleYaw;
    }
    this.yaw = lerpAngle(this.yaw, this.targetYaw, damp(12, dt));
    this.group.rotation.y = this.yaw;
    this.ch.update(dt, Math.min(1, this.cur / 2.4));
    return this.path.length === 0;
  }
}
