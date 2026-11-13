// Player vehicles (TOWN.md 4.4): vehicles the player owns (the tow truck; later a project car that runs).
// A parked vehicle has an enter ring at its driver door; standing in it PLAYER.enterCarDelay s hops the player in.
// Driving: the same joystick handling as customer cars (player.js joystickDrive), own top speed and size; collides
// with the static obstacles, the customer cars and the town bounds. Getting out only in a parking bay
// (TOWN.parking): stop inside one for 0.6 s -> it straightens into the bay, the player hops out. At 'home' the tow
// truck then turns round if needed and reverses into its shed by itself.
//
// ctx.vehicles: { list, get(id), add(opts) -> PlayerVehicle, remove(v), bays(), nearestBay(pos), pushCapsules(out) }
// PlayerVehicle (see TOWN.md 6a): id, model, group, pos, yaw, speed, vx, vz, hitch (Object3D), mode
// ('parked' | 'boarding' | 'driven' | 'parking' | 'auto'), bay, driver, on(event, fn) -> off
// (events: 'stopped', 'enter', 'exit', 'parked', 'arrived'), driveTo(path, opts), setPointer(bool), canLeave hook.
import * as THREE from 'three';
import * as M from '../models/index.js';
import { TOWN, RESCUE, PLAYER, PROPERTIES } from '../config.js';
import { state, save, propLevel, proValue, districtOpen } from '../core/state.js';
import { ui } from '../ui/index.js';
import { registerPropertySystem } from './registry.js';
import { joystickDrive } from './player.js';
import { resolveCircle, circleHitsBoxes } from './collision.js';
import { tween, ease } from './tween.js';
import { damp, lerpAngle, angleDiff, clamp, detach } from './util.js';
import { manoeuvre, trackStep } from './roads.js';

const PARK_HOLD = 0.6;          // seconds stopped inside a bay before the player gets out
const PARK_ALONG = 1.25, PARK_LAT = 0.75, PARK_ANGLE = 0.6;   // how well you must be inside a bay (m, m, rad)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3();

/** District a parking bay belongs to (north of the hoarding = Main Street). */
const bayDistrict = (b) => (b.z < DISTRICT_MAIN_Z ? 'main' : 'harbor');
const DISTRICT_MAIN_Z = -18.3;

let tmpBox = null;
function fallbackTruck(width, length) {
  tmpBox ||= new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const g = new THREE.Group();
  const m = new THREE.Mesh(tmpBox, new THREE.MeshLambertMaterial({ color: 0xf0b429 }));
  m.scale.set(width, 1.5, length); m.castShadow = true;
  g.add(m);
  const hitch = new THREE.Object3D(); hitch.position.set(0, 0.5, -length / 2 - 0.2); g.add(hitch);
  return { group: g, hitch, update() {} };
}

export class PlayerVehicle {
  /**
   * opts: { id, model ({ group, hitch?, update(dt, speed)?, ... }), width, length, speed: () => m/s,
   *   at: { x, z, yaw }, bay (parking id or 'shed'), home?: { x, z, yaw, bay } (where it backs in at its home bay),
   *   label? (pointer text) }
   */
  constructor(sys, opts) {
    this.sys = sys; this.ctx = sys.ctx; this.id = opts.id; this.opts = opts;
    this.width = opts.width ?? 1.7; this.length = opts.length ?? 3.6;
    this.r = this.width / 2 + 0.02;
    this.halfSeg = Math.max(0, (this.length - this.width) / 2);
    this.maxSpeed = opts.speed || (() => 8);
    this.home = opts.home || null;
    this.model = null; this.group = null;
    this.pos = new THREE.Vector3(opts.at?.x ?? 0, 0, opts.at?.z ?? 0);
    this.yaw = opts.at?.yaw ?? 0;
    this.speed = 0; this.vx = 0; this.vz = 0; this.wheelSpeed = 0;
    this.mode = 'parked';
    this.bay = opts.bay ?? null;
    this.driver = null;           // 'player' | any object driving it (dispatcher ...)
    this.listeners = {};
    this.capsule = { ax: 0, az: 0, bx: 0, bz: 0, r: this.width / 2, owner: this };
    this.mover = { pos: this.pos, radius: this.length / 2, ignore: null, hidden: true, owner: this };
    this.parkT = 0; this.stillT = 0; this.wasMoving = false; this.enterT = 0;
    this.script = null;           // auto movement: [{ kind: 'arc'|'to', ... }]
    this.pointer = null; this.parkPtr = null;
    /** Override to forbid getting out (e.g. while something is hooked): () => bool. */
    this.canLeave = () => true;
    this.setModel(opts.model);
    this.ring = M.createZoneRing ? M.createZoneRing(0.75) : null;
    if (this.ring) { this.ring.visible = false; this.ctx.root.add(this.ring); }
    this.syncTransform();
  }

  get hitch() { return this.model?.hitch || null; }
  /** World position of the hitch (tow hook). */
  hitchPos(out = new THREE.Vector3()) { const h = this.hitch; return h ? h.getWorldPosition(out) : out.copy(this.pos); }
  /** Forward unit vector (nose direction). */
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get playerIn() { return this.driver === 'player'; }
  get parked() { return this.mode === 'parked'; }

  /** Swap the model (e.g. tow truck level 2); keeps the transform. */
  setModel(model) {
    if (this.group) detach(this.group);
    this.model = model || fallbackTruck(this.width, this.length);
    this.group = this.model.group;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.pos = this.group.position;   // the model's position IS the vehicle position from now on
    this.mover.pos = this.pos;
    this.ctx.root.add(this.group);
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); return () => { const l = this.listeners[evt]; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; }
  emit(evt, payload) { for (const fn of (this.listeners[evt] || []).slice()) { try { fn(payload, this); } catch (err) { console.error('[wrench-bay] vehicle', evt, err); } } }

  /** Edge pointer to this vehicle (e.g. a rescue call waits and the truck is parked somewhere). */
  setPointer(on, text = null) {
    if (on && !this.pointer && this.ctx.pointers) this.pointer = this.ctx.pointers.add({ kind: 'vehicle', icon: this.id === 'tow' ? 'tow' : 'car', text, worldPos: this.pos });
    if (this.pointer) { this.pointer.setVisible(!!on && !this.playerIn); if (text !== null) this.pointer.setText(text); }
  }

  syncTransform() {
    this.group.position.y = 0;
    this.group.rotation.y = this.yaw;
    const sx = Math.sin(this.yaw) * this.halfSeg, sz = Math.cos(this.yaw) * this.halfSeg;
    const c = this.capsule;
    c.ax = this.pos.x - sx; c.az = this.pos.z - sz; c.bx = this.pos.x + sx; c.bz = this.pos.z + sz;
    this.mover.hidden = !(this.mode === 'driven' || this.mode === 'auto');
  }

  /** Two circles (front, back) against static boxes, customer cars and the bounds. */
  collide(p) {
    const ctx = this.ctx;
    const fx = Math.sin(this.yaw) * this.halfSeg, fz = Math.cos(this.yaw) * this.halfSeg;
    for (let pass = 0; pass < 2; pass++) {
      _a.set(p.x + fx, 0, p.z + fz); _b.set(p.x - fx, 0, p.z - fz);
      const ax = _a.x, az = _a.z, bx = _b.x, bz = _b.z;
      resolveCircle(_a, this.r, ctx.obstacles, ctx.bounds, ctx.capsules, this);
      resolveCircle(_b, this.r, ctx.obstacles, ctx.bounds, ctx.capsules, this);
      const dax = _a.x - ax, daz = _a.z - az, dbx = _b.x - bx, dbz = _b.z - bz;
      const dx = Math.abs(dax) > Math.abs(dbx) ? dax : dbx, dz = Math.abs(daz) > Math.abs(dbz) ? daz : dbz;
      if (!dx && !dz) break;
      p.x += dx; p.z += dz;
    }
  }

  // ------------------------------------------------------------ player driving
  onPlayerIn() {
    this.mode = 'driven'; this.driver = 'player'; this.bay = null;
    this.parkT = 0; this.script = null;
    if (this.ring) this.ring.visible = false;
    ui.hint?.('Park in a P bay to get out');
    this.pointer?.setVisible(false);
    this.emit('enter', { who: 'player' });
  }

  drivePlayer(dt, drv) {
    if (this.mode !== 'driven') return;
    const max = this.maxSpeed();
    const body = { pos: this.pos, yaw: this.yaw };
    const px = this.pos.x, pz = this.pos.z;
    joystickDrive(dt, drv, max, body, (p) => this.collide(p));
    this.yaw = body.yaw;
    this.speed = drv.dSpeed;
    this.vx = (this.pos.x - px) / dt; this.vz = (this.pos.z - pz) / dt;
    this.wheelSpeed = this.speed;
    // camera leads ahead of the velocity (east-west driving on a portrait screen needs it)
    this.ctx.cam?.lead(this.vx * 0.5, this.vz * 0.5, 1.15);
    this.checkStopped(dt);
    this.checkParking(dt);
  }

  checkStopped(dt) {
    const moving = this.speed > 0.6;
    if (moving) { this.wasMoving = true; this.stillT = 0; return; }
    this.stillT += dt;
    if (this.wasMoving && this.stillT > 0.15) { this.wasMoving = false; this.emit('stopped', { pos: this.pos, speed: this.speed }); }
  }

  /** Parking bay the vehicle stands in (aligned either way), or null. */
  bayAt() {
    for (const b of this.sys.bays()) {
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      const dx = this.pos.x - b.x, dz = this.pos.z - b.z;
      const along = dx * fx + dz * fz, lat = dx * fz - dz * fx;
      if (Math.abs(along) > PARK_ALONG || Math.abs(lat) > PARK_LAT) continue;
      const d = Math.abs(angleDiff(this.yaw, b.yaw));
      if (d < PARK_ANGLE || Math.PI - d < PARK_ANGLE) return b;
    }
    return null;
  }

  checkParking(dt) {
    const b = this.speed < 0.35 ? this.bayAt() : null;
    if (!b || !this.canLeave()) { this.parkT = 0; return; }
    this.parkT += dt;
    if (this.parkT >= PARK_HOLD) this.park(b);
  }

  /** Straighten into bay b, let the player out; at the home bay the vehicle then backs into its shed. */
  park(b) {
    this.parkT = 0;
    this.mode = 'parking';
    this.speed = 0; this.vx = this.vz = 0; this.wheelSpeed = 0;
    this.ctx.cam?.lead(0, 0, 1);
    const sx = this.pos.x, sz = this.pos.z, sy = this.yaw;
    const homeBay = this.home && b.id === this.home.bay;
    // nearest of the two headings; the home bay keeps the nose as it is (the turn-round comes after)
    const flip = Math.abs(angleDiff(sy, b.yaw)) > Math.PI / 2;
    const ty = sy + angleDiff(sy, flip ? b.yaw + Math.PI : b.yaw);
    tween({
      duration: 0.45, ease: ease.inOutQuad,
      onUpdate: (e) => { this.pos.x = sx + (b.x - sx) * e; this.pos.z = sz + (b.z - sz) * e; this.yaw = sy + (ty - sy) * e; },
      onComplete: () => {
        this.bay = b.id;
        this.driver = null;
        ui.hint?.(null);
        this.ctx.player.exitVehicle(this.doorSpot(new THREE.Vector3()));
        this.emit('exit', { bay: b.id });
        if (homeBay) this.backIntoShed();
        else { this.mode = 'parked'; this.saveSpot(); this.emit('parked', { bay: b.id }); }
      },
    });
  }

  /** Where the player stands to get in / pops out: the driver door, or in front of the nose when that is blocked. */
  doorSpot(out) {
    const f = this.forward(_f);
    const lx = f.z, lz = -f.x;     // left of the nose (yaw 0: +x)
    const side = this.width / 2 + 0.75;
    out.set(this.pos.x + lx * side + f.x * 0.35, 0, this.pos.z + lz * side + f.z * 0.35);
    const bd = this.ctx.bounds;
    const blocked = circleHitsBoxes(out.x, out.z, 0.4, this.ctx.obstacles) || out.x < bd.minX + 0.4 || out.x > bd.maxX - 0.4 || out.z < bd.minZ + 0.4 || out.z > bd.maxZ - 0.4;
    if (blocked) out.set(this.pos.x + f.x * (this.length / 2 + 0.95), 0, this.pos.z + f.z * (this.length / 2 + 0.95));
    return out;
  }

  // ------------------------------------------------------------ auto movement (backing in, dispatcher ...)
  /**
   * Drive by itself along waypoints (no player): path [{x, z}], opts { reverse, speed, restYaw, onArrive }.
   * Simple pursuit at up to `speed`; does not collide (callers keep paths on paved ground).
   */
  driveTo(path, { reverse = false, speed = 3, restYaw = null, onArrive = null } = {}) {
    this.mode = 'auto';
    this.script = [{ kind: 'path', path: path.map((p) => ({ x: p.x, z: p.z })), reverse, speed, restYaw, onArrive }];
  }

  /**
   * Back into the shed by itself, with car-like moves only (forward / reverse arcs and straights, played back
   * exactly: no turning on the spot, no sliding sideways). From the home bay in the alley heading south: forward
   * out of the bay, left arc onto the apron heading east, on to the turn point; heading north: reverse down the
   * alley, forward right arc onto the apron heading east. Then (also straight from the tow drop pose, heading east)
   * a reverse arc swings the tail north-west into line with the shed and it reverses straight in. Waits for anyone
   * standing in the way. The vehicle's pose decides the moves (shedManoeuvre).
   */
  backIntoShed() {
    const legs = shedManoeuvre(this.pos.x, this.pos.z, this.yaw);
    const done = () => { this.bay = 'shed'; this.mode = 'parked'; this.saveSpot(); this.emit('parked', { bay: 'shed' }); };
    const blocked = (x, z) => {
      const pl = this.ctx.player;
      if (pl.onFoot && Math.hypot(pl.pos.x - x, pl.pos.z - z) < 1.0) return true;
      for (const c of this.ctx.allCars) if (c.mode !== 'gone' && Math.hypot(c.pos.x - x, c.pos.z - z) < 1.7) return true;
      return false;
    };
    const steps = [];
    legs.forEach((L, i) => {
      if (i) { let w = 0; steps.push({ kind: 'fn', fn: (dt) => (w += dt) > 0.35 }); }   // a beat to change gear
      steps.push(trackStep(L.path, { dir: L.dir, axle: SHED_AXLE, vmax: L.dir > 0 ? 2.4 : 1.7, blocked, onDone: i === legs.length - 1 ? done : null }));
    });
    this.mode = 'auto';
    this.speed = 0; this.vx = this.vz = 0;
    this.script = steps;
  }

  runScript(dt) {
    const s = this.script?.[0];
    if (!s) { if (this.mode === 'auto') this.mode = 'parked'; return; }
    let done = false;
    if (s.kind === 'arc') {
      const dur = 1.0;
      const k = Math.min(dt / dur, 1 - s.t);
      s.t += k;
      // steering: the heading turns while the vehicle moves (reversing on the other lock turns the same way)
      this.yaw += s.dyaw * k;
      const f = this.forward(_w);
      this.pos.x += f.x * s.dir * s.dist * k; this.pos.z += f.z * s.dir * s.dist * k;
      this.wheelSpeed = s.dir * s.dist / dur;
      done = s.t >= 1 - 1e-6;
    } else if (s.kind === 'align') {
      s.t += dt / 0.6;
      const k = damp(9, dt);
      this.pos.x += (s.x - this.pos.x) * k; this.pos.z += (s.z - this.pos.z) * k;
      this.yaw = lerpAngle(this.yaw, s.yaw, k);
      this.wheelSpeed = 0.8;
      if (s.t >= 1) { this.pos.x = s.x; this.pos.z = s.z; this.yaw = s.yaw; done = true; }
    } else if (s.kind === 'fn') {
      // custom movement (rescue hook-up / drop, AI drivers): fn(dt, vehicle) moves pos / yaw / speed / wheelSpeed
      // itself and returns true when done (the step is then dropped like any other)
      done = !!s.fn(dt, this);
    } else if (s.kind === 'path') {
      const wp = s.path[0];
      if (!wp) done = true;
      else {
        const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.04) { s.path.shift(); if (!s.path.length) done = true; }
        else {
          const last = s.path.length === 1;
          const vt = last ? Math.min(s.speed, Math.sqrt(2 * 4 * d) + 0.2) : s.speed;
          this.speed += clamp(vt - this.speed, -6 * dt, 4 * dt);
          const step = Math.min(d, this.speed * dt);
          this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
          const moveYaw = Math.atan2(dx, dz) + (s.reverse ? Math.PI : 0);
          this.yaw = lerpAngle(this.yaw, d > 0.3 ? moveYaw : (s.restYaw ?? this.yaw), damp(6, dt));
          this.wheelSpeed = s.reverse ? -this.speed : this.speed;
          this.vx = (dx / d) * this.speed; this.vz = (dz / d) * this.speed;
        }
      }
      if (done) {
        if (s.restYaw !== null && s.restYaw !== undefined) this.yaw = s.restYaw;
        this.speed = 0; this.vx = this.vz = 0;
        s.onArrive?.(this);
        this.emit('arrived', {});
      }
    }
    if (done) {
      this.script.shift();
      if (!this.script.length) { this.script = null; this.wheelSpeed = 0; if (this.mode === 'auto') this.mode = 'parked'; }
    }
  }

  /** Remember where it stands (state.town.vehicles[id]); loading puts it back there. */
  saveSpot() {
    const v = state.town.vehicles;
    v[this.id] = this.bay === 'shed' ? { bay: 'shed' } : { bay: this.bay, x: +this.pos.x.toFixed(2), z: +this.pos.z.toFixed(2), yaw: +this.yaw.toFixed(3) };
    save();
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    if (this.mode === 'auto') this.runScript(dt);
    else if (this.mode === 'parked') { this.wheelSpeed = 0; this.speed = 0; }
    this.syncTransform();
    if (this.ctx.near(this.pos, 4)) this.model.update?.(dt, this.wheelSpeed);
    this.updateRing(dt);
  }

  updateRing(dt) {
    if (!this.ring) return;
    const pl = this.ctx.player;
    const show = this.mode === 'parked' && !this.driver && pl.onFoot;
    this.ring.visible = show;
    if (!show) { this.enterT = 0; return; }
    const d = this.doorSpot(_w);
    this.ring.position.set(d.x, 0.02, d.z);
    const inside = Math.hypot(pl.pos.x - d.x, pl.pos.z - d.z) < 0.75;
    if (inside) {
      this.enterT += dt;
      if (this.enterT >= PLAYER.enterCarDelay) { this.enterT = 0; pl.enterVehicle(this); }
    } else this.enterT = Math.max(0, this.enterT - dt * 2);
    const s = 1 + 0.3 * Math.min(1, this.enterT / PLAYER.enterCarDelay);
    this.ring.scale.set(s, s, s);
  }

  dispose() {
    if (this.ring) detach(this.ring);
    this.pointer?.remove();
    detach(this.group);
    if (this.playerIn) ui.hint?.(null);
  }
}

// ------------------------------------------------------------------ backing into the tow shed (dispatcher agent)
// Paths are for the rear axle (the point that moves along the heading); the vehicle centre is SHED_AXLE ahead of it.
const SHED_AXLE = 0.92;
// reverse arc into line with the shed, from the apron line z = RESCUE.drop.pose.z (5.3: the nose at the turn point
// passes south of the cars reversing off the garage's west lift); its turn centre clears the hall corner and it ends
// before the tail reaches the shed front. A truck past the turn point reverses straight back to it first, one a
// little short of it takes a tighter arc (after the drop), one well short pulls forward.
const SHED_R_REV = 2.3;
const SHED_R_REV_MIN = 2.1;
const SHED_R_FWD = 3.8;      // forward left arc out of the bay (heading south) onto the apron (nose clear of the barrels)
const SHED_R_FWD_N = 2.8;    // forward right arc (heading north, after reversing down the alley) onto the apron
const SHED_EDGE = 0.08;      // rad: tail edging east while reversing down the alley (heading north in the bay)
const ZE_N = 5.6;            // apron line (rear axle z, heading east) after that arc: its turn centre below the pallets
/**
 * Legs [{ path, dir }] from a vehicle centre pose to the shed (RESCUE.truck.home, tail first). Known starts: the home
 * bay heading south or north, the apron / tow drop zone heading east; anything else lines up straight (fallback).
 */
export function shedManoeuvre(x, z, yaw) {
  const H = RESCUE.truck.home, ZE = RESCUE.drop.pose?.z ?? 4.0;
  const ref = { x: x - Math.sin(yaw) * SHED_AXLE, z: z - Math.cos(yaw) * SHED_AXLE, h: yaw };
  const ax = H.x + SHED_R_REV;                         // where the reverse arc starts (rear axle, heading east)
  const hz = H.z - SHED_AXLE;                          // rear axle in the shed
  const legs = [];
  let p = ref;
  const fwd = (steps) => { const m = manoeuvre(p, steps); legs.push({ path: m, dir: 1 }); p = m.end; };
  const east = Math.abs(angleDiff(yaw, Math.PI / 2)) < 0.6, south = Math.abs(angleDiff(yaw, 0)) < 0.6;
  const north = Math.abs(angleDiff(yaw, Math.PI)) < 0.6;
  if (south && x < H.x - 1.5) {
    // in the alley bay nose out (south): forward out of the bay, left arc onto the apron heading east, on to the
    // turn point (one forward leg)
    const steps = [['line', Math.max(0, ZE - SHED_R_FWD - ref.z)], ['arc', SHED_R_FWD, angleDiff(yaw, Math.PI / 2)]];
    const m = manoeuvre(p, steps);
    if (ax - m.end.x > 0.05) steps.push(['line', ax - m.end.x]);
    fwd(steps);
  } else if (north && x < H.x - 1.5) {
    // nose in (north): reverse down the alley with the tail edging east (the nose swings away from the shed's
    // posts, the tail clears the barrels and pallets on the alley's west side), straighten once the nose is past the
    // shed front, on down to below the pallets, then a forward right arc onto the apron heading east
    const th = SHED_EDGE, rr = 8, a1 = rr * Math.sin(th);
    const zFront = PROPERTIES.tow.plot.maxZ + 0.2 + 2.72;          // rear axle z once the nose is past the shed front
    const L = Math.max(0, (zFront - ref.z - a1) / Math.cos(th));
    const z2 = ZE_N + SHED_R_FWD_N;
    let m = manoeuvre(p, [['arc', rr, th], ['line', L], ['arc', rr, -th]], { back: true });
    m = manoeuvre(p, [['arc', rr, th], ['line', L], ['arc', rr, -th], ['line', Math.max(0, z2 - m.end.z)]], { back: true });
    legs.push({ path: m, dir: -1 }); p = m.end;
    const steps = [['arc', SHED_R_FWD_N, angleDiff(p.h, Math.PI / 2)]];
    const f = manoeuvre(p, steps);
    if (ax - f.end.x > 0.05) steps.push(['line', ax - f.end.x]);
    fwd(steps);
  } else if (east) {
    // on the apron / in the tow drop zone heading east: pull forward to the turn point if well short of it
    if (H.x + SHED_R_REV_MIN - p.x > 0.05) fwd([['line', ax - p.x]]);
  }
  if (Math.abs(angleDiff(p.h, Math.PI / 2)) < 0.6) {
    // reverse: (back to the turn point,) arc with the tail swinging north-west into line, straight into the shed;
    // a truck stopped a little short of the turn point takes a slightly tighter arc instead of creeping forward
    const steps = [];
    const r = Math.max(SHED_R_REV_MIN, Math.min(SHED_R_REV, p.x - H.x));
    if (p.x - (H.x + r) > 0.05) steps.push(['line', p.x - (H.x + r)]);
    steps.push(['arc', r, angleDiff(p.h, 0)]);
    let m = manoeuvre(p, steps, { back: true });
    const lat = H.x - m.end.x;                       // left of heading south = +x: any sideways error left over
    if (Math.abs(lat) > 0.02) steps.push(['s', lat, 4.5]), m = manoeuvre(p, steps, { back: true });
    steps.push(['line', Math.max(0, m.end.z - hz)]);
    legs.push({ path: manoeuvre(p, steps, { back: true }), dir: -1 });
  } else {
    // fallback (an unusual pose): reverse straight towards the shed line, then in
    legs.push({ path: manoeuvre(p, [['line', Math.max(0.1, Math.hypot(p.x - H.x, p.z - hz))]], { back: true }), dir: -1 });
  }
  return legs;
}

export function createVehicles(ctx) {
  const list = [];
  let parkPtr = null, ptrT = 0;
  const sys = {
    ctx, list,
    get(id) { return list.find((v) => v.id === id) || null; },
    /** Create a player vehicle (see PlayerVehicle opts). Joins collision and ctx.movers. */
    add(opts) {
      const v = new PlayerVehicle(sys, opts);
      list.push(v);
      ctx.movers.push(v.mover);
      return v;
    },
    remove(v) {
      const i = list.indexOf(v); if (i >= 0) list.splice(i, 1);
      const k = ctx.movers.indexOf(v.mover); if (k >= 0) ctx.movers.splice(k, 1);
      v.dispose();
    },
    /** Parking bays in open districts. */
    bays() { return TOWN.parking.filter((b) => districtOpen(bayDistrict(b))); },
    nearestBay(p) {
      let best = null, bd = Infinity;
      for (const b of sys.bays()) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; best = b; } }
      return best;
    },
    pushCapsules(out) { for (const v of list) out.push(v.capsule); },
    update(dt, t) {
      for (const v of list) v.update(dt, t);
      // while driving a vehicle: pointer to the nearest bay (ui.pointer hides it while the bay is on screen)
      ptrT -= dt;
      if (ptrT <= 0) {
        ptrT = 0.3;
        const v = ctx.player.vehicle;
        const b = v && ctx.player.mode === 'vehicle' && v.canLeave() ? sys.nearestBay(v.pos) : null;   // towing: no P pointer
        if (b) {
          parkPtr ||= ctx.pointers?.add({ kind: 'goal', icon: 'mapPin', text: 'P', worldPos: _w.set(b.x, 0, b.z) });
          parkPtr?.setPos(_w.set(b.x, 0, b.z)).setVisible(true);
        } else parkPtr?.setVisible(false);
      }
    },
    dispose() {
      for (const v of list.slice()) sys.remove(v);
      parkPtr?.remove();
    },
  };
  return sys;
}

// ------------------------------------------------------------------ the tow truck (property 'tow')
/** Spawned with the tow shed; level from the property (2: heavier and faster). TOWN.md 4.5 builds on it. */
registerPropertySystem('tow', (ctx, prop) => {
  const H = RESCUE.truck.home;
  const make = (lvl) => {
    const fn = M.createTowTruck;
    let m = null;
    try { m = typeof fn === 'function' ? fn(lvl) : null; } catch (err) { console.warn('[wrench-bay] createTowTruck', err); }
    return m && m.group ? m : null;
  };
  const saved = state.town.vehicles.tow;
  let at = { x: H.x, z: H.z, yaw: H.yaw }, bay = 'shed';
  if (saved && saved.bay && saved.bay !== 'shed') {
    const b = TOWN.parking.find((p) => p.id === saved.bay);
    if (b && districtOpen(bayDistrict(b))) { at = { x: b.x, z: b.z, yaw: saved.yaw ?? b.yaw }; bay = b.id; }
  }
  const truck = ctx.vehicles.add({
    id: 'tow', model: make(Math.max(1, prop.level)), width: RESCUE.truck.width, length: RESCUE.truck.length,
    speed: () => RESCUE.truck.speed[Math.max(0, Math.min(propLevel('tow'), RESCUE.truck.speed.length) - 1)] * (1 + proValue('truck')),
    at, bay, home: { x: H.x, z: H.z, yaw: H.yaw, bay: 'home' },
  });
  if (!saved) truck.saveSpot();
  return {
    vehicle: truck,
    onLevel(level) { const m = make(level); if (m) truck.setModel(m); },
    update() {},
    dispose() { /* ctx.vehicles.dispose removes it */ },
  };
});

