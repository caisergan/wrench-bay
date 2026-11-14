// Level 3 tow driver, the "dispatcher" (TOWN.md 4.5 point 8). While the truck stands in its shed and the player is
// not using it, a hired driver answers the rescue calls along the road network (roads.js):
//   idle in the shed by the dispatch desk -> a call waits, nobody claimed it, the truck is home and the player is not
//   in it / boarding it / standing in its enter ring: he takes the call on his radio; after RESCUE.dispatcher.delay s
//   he claims it, walks along the truck to the cab, hops in (the player's hop), beacon on -> out of the shed, the
//   apron, left into Harbor St and round the one-way ring in its travel direction (smooth arcs, slower in them,
//   braking for anything in the corridor ahead, a honk when held up) -> pass the stranded car in the lane with room
//   to spare, stop ahead of it, reverse onto the kerb into the hook pose (an S-curve: the tail swings in, like a real
//   tow truck backing up) -> ctx.rescue.hook (the same hook-up as the player's) -> pull back into the lane, round the
//   ring to Harbor St eastbound, left up the tow yard strip, right into the drop zone, stop at
//   ctx.rescue.dropPose() -> ctx.rescue.drop (retried while the garage lane is full) -> truck.backIntoShed (a reverse
//   arc straight from the drop pose, vehicles.js) -> he hops out at the cab and walks back to the desk.
// The player can take the truck whenever it is parked; a call the player claimed is left alone. Anything that breaks
// a run before the hook-up (the call vanishes) unclaims the call and the truck drives home. Nothing of a run is saved:
// after a reload / world rebuild the truck is in its shed (where the save says) and the call is waiting again.
// The truck is driven through a 'fn' script step of PlayerVehicle (vehicles.js): mode 'auto', driver = this system.
// Debug: __game.dispatcher.state(), .log, .go(spotId) (a stand-in run without a call: no rescue API needed),
// .plan(spotId), .watch(on), .auto(on); ?nodispatch = it takes no calls (route tests).
import * as THREE from 'three';
import * as M from '../models/index.js';
import { RESCUE, PROPERTIES } from '../config.js';
import { state, save } from '../core/state.js';
import { follow } from '../core/engine.js';
import { ui } from '../ui/index.js';
import { registerPropertySystem } from './registry.js';
import { shedManoeuvre } from './vehicles.js';
import { getRoads, PathFollower } from './roads.js';
import { Walker } from './walker.js';
import { hop, popIn, tween } from './tween.js';
import { angleDiff, clamp } from './util.js';

const DSP = RESCUE.dispatcher;
const AXLE = 0.92;                 // truck centre ahead of its rear axle (the axle is the point that follows the road)
const TRUCK_HALF = RESCUE.truck.width / 2, TRUCK_LEN = RESCUE.truck.length;
const CAR_HALF_W = 0.75;           // stranded cars (CAR.width / 2)
const PASS_GAP = 0.5;              // side gap when passing the stranded car in the lane
const STOP_GAP = 0.8;              // standstill gap to whatever blocks the corridor
const SHED_LEAD = 5.2;             // straight out of the shed before steering (the tail clears the door posts)
const SHED_MERGE_R = 7;            // then a long, gentle S onto the apron lane (the nose stays clear of the alley pallets)
const HOOK_DIST = 3.1;             // stand-in hook pose: truck centre this far ahead of the car centre (no rescue API)

const fwdX = (h) => Math.sin(h), fwdZ = (h) => Math.cos(h);
const leftX = (h) => Math.cos(h), leftZ = (h) => -Math.sin(h);
/** Vehicle centre pose { x, z, yaw } -> reference (rear axle) pose { x, z, h }. */
const toRef = (p) => ({ x: p.x - fwdX(p.yaw) * AXLE, z: p.z - fwdZ(p.yaw) * AXLE, h: p.yaw });
/** Reference pose of a vehicle where it stands now. */
const refOf = (v) => toRef({ x: v.pos.x, z: v.pos.z, yaw: v.yaw });

// ------------------------------------------------------------------ the truck's AI driving
/**
 * Drives the truck along legs ({ path, dir }) with roads.PathFollower, braking for anything in the corridor ahead.
 * Installed as the truck's script ({ kind: 'fn' }); it never finishes by itself (the dispatcher swaps it out).
 */
class TruckDriver {
  constructor(ctx, truck) {
    this.ctx = ctx; this.truck = truck;
    this.ref = { x: 0, z: 0, yaw: 0, v: 0 };
    this.follower = new PathFollower();
    this.leg = null; this.onLeg = null;
    this.ignore = null;            // capsule / mover owner the corridor check skips (the call: its stranded car)
    this.ignorePos = null;         // ... and anything centred within 1 m of this point (the stranded car again)
    this.ownTow = null;            // position of the car we tow (its mover is skipped)
    this.blockT = 0; this.honked = false; this.blocker = null;
    this.step = this.step.bind(this);
  }
  /** Take the truck: mode 'auto' with our script step, reference pose from where it stands. */
  attach(who) {
    const t = this.truck;
    t.mode = 'auto'; t.driver = who;
    t.script = [{ kind: 'fn', fn: this.step }];
    this.syncFromTruck();
  }
  syncFromTruck() {
    const t = this.truck, r = this.ref;
    r.yaw = t.yaw; r.x = t.pos.x - fwdX(t.yaw) * AXLE; r.z = t.pos.z - fwdZ(t.yaw) * AXLE; r.v = 0;
  }
  /** Drive a path (dir 1 forward, -1 reverse); onDone runs when it stops at the end. */
  drive(path, dir = 1, onDone = null) {
    if (!this.truck.script || this.truck.script[0]?.fn !== this.step) this.attach(this.truck.driver);
    else this.syncFromTruck();
    this.leg = { path, dir }; this.onLeg = onDone;
    this.follower.start(path, dir);
    this.blockT = 0; this.honked = false;
  }
  /** Stand still (keeps the script so the vehicle stays in 'auto'). */
  hold() { this.leg = null; this.onLeg = null; this.ref.v = 0; this.blocker = null; this.blockT = 0; }
  /** The truck's script step (vehicles.js runScript, before syncTransform). */
  step(dt) {
    const t = this.truck, r = this.ref;
    if (!this.leg) { r.v = 0; t.speed = 0; t.wheelSpeed = 0; t.vx = t.vz = 0; return false; }
    const cap = this.corridorCap(dt);
    const done = this.follower.step(dt, r, cap);
    const dir = this.leg.dir;
    t.yaw = r.yaw;
    const px = t.pos.x, pz = t.pos.z;
    t.pos.x = r.x + fwdX(r.yaw) * AXLE; t.pos.z = r.z + fwdZ(r.yaw) * AXLE;
    t.speed = r.v; t.wheelSpeed = dir * r.v;
    t.vx = (t.pos.x - px) / (dt || 1); t.vz = (t.pos.z - pz) / (dt || 1);
    if (done) {
      const cb = this.onLeg;
      this.leg = null; this.onLeg = null; this.blocker = null;
      t.speed = 0; t.wheelSpeed = 0; t.vx = t.vz = 0;
      cb?.();
    }
    return false;
  }

  /** Is something solid at (x, z) within rad? Returns it (for the honk / debug) or null. */
  hitAt(x, z, rad) {
    const ctx = this.ctx, t = this.truck, ig = this.ignorePos;
    const caps = ctx.capsules;
    for (let i = 0; i < caps.length; i++) {
      const c = caps[i], o = c.owner;
      if (o === t || o === this.ignore) continue;
      if (ig && Math.hypot((c.ax + c.bx) / 2 - ig.x, (c.az + c.bz) / 2 - ig.z) < 1.0) continue;
      if (segDist(x, z, c.ax, c.az, c.bx, c.bz) < rad + c.r) return o || c;
      // a moving car: where it will be in a moment (so we never pull out in front of it)
      const vx = o?.vx || 0, vz = o?.vz || 0;
      if (vx * vx + vz * vz > 0.25) {
        const k = 0.9;
        if (segDist(x, z, c.ax + vx * k, c.az + vz * k, c.bx + vx * k, c.bz + vz * k) < rad + c.r) return o || c;
      }
    }
    const pl = ctx.player;
    if (pl && (pl.onFoot || pl.mode === 'entering' || pl.mode === 'exiting') && Math.hypot(pl.pos.x - x, pl.pos.z - z) < rad + 0.4) return pl;
    const mv = ctx.movers;
    for (let i = 0; i < mv.length; i++) {
      const m = mv[i];
      if (m.hidden || m === t.mover || m.owner === t || m.truck === t || m.owner === this.ignore) continue;
      if (this.ownTow && Math.hypot(m.pos.x - this.ownTow.x, m.pos.z - this.ownTow.z) < 0.6) continue;
      if (ig && Math.hypot(m.pos.x - ig.x, m.pos.z - ig.z) < 1.0) continue;
      if (Math.hypot(m.pos.x - x, m.pos.z - z) < rad + (m.radius ?? 1) * 0.75) return m;
    }
    return null;
  }

  /** Max speed that stops the truck STOP_GAP short of anything in its corridor ahead; honks when held up. */
  corridorCap(dt) {
    const f = this.follower, r = this.ref, dir = this.leg.dir;
    const look = DSP.brakeDist + (r.v * r.v) / (2 * 4.0);    // brakeDist: how far ahead it looks when crawling
    const P = _cp;
    let cap = Infinity, who = null;
    // the leading end of the truck (nose forward, wheel-lift in reverse) swept along the path ahead
    const lead = dir > 0 ? AXLE + 1.0 : AXLE - 1.25;
    for (let d = 0.25; d <= look; d += 0.4) {
      f.pointAt(f.s + d, P);
      const cx = P.x + fwdX(P.h) * lead, cz = P.z + fwdZ(P.h) * lead;
      const o = this.hitAt(cx, cz, TRUCK_HALF + 0.05);
      if (o) { who = o; cap = Math.sqrt(2 * 4.0 * Math.max(0, d - STOP_GAP)); break; }
    }
    this.blocker = who;
    if (who && r.v < 0.3) {
      this.blockT += dt;
      if (!this.honked && this.blockT > DSP.honkAfter) {
        this.honked = true;
        this.ctx.sfxAt('honk', this.truck.pos);
      }
    } else if (!who) { this.blockT = 0; this.honked = false; }
    return cap;
  }
}
const _cp = { x: 0, z: 0, h: 0, v: 0 };
const segDist = (px, pz, ax, az, bx, bz) => {
  const sx = bx - ax, sz = bz - az, l2 = sx * sx + sz * sz || 1e-9;
  const u = clamp(((px - ax) * sx + (pz - az) * sz) / l2, 0, 1);
  return Math.hypot(px - ax - sx * u, pz - az - sz * u);
};

// ------------------------------------------------------------------ manoeuvre planning (reference = rear axle poses)
/** The ring-road lane a pose stands beside (same heading, within 3.5 m sideways): { lane, t, lat } or null. */
function laneBeside(net, p) {
  let best = null;
  for (const l of net.lanes) {
    if (l.blocked || l.kind !== 'road' || Math.abs(angleDiff(p.h, l.h)) > 0.3) continue;
    const dx = p.x - l.a.x, dz = p.z - l.a.z;
    const lat = dx * leftX(l.h) + dz * leftZ(l.h), t = dx * fwdX(l.h) + dz * fwdZ(l.h);
    if (Math.abs(lat) > 3.5 || t < 0 || t > l.len) continue;
    if (!best || Math.abs(lat) < Math.abs(best.lat)) best = { lane: l, t, lat };
  }
  return best;
}
const lanePose = (l, t, lat) => ({ x: l.a.x + fwdX(l.h) * t + leftX(l.h) * lat, z: l.a.z + fwdZ(l.h) * t + leftZ(l.h) * lat, h: l.h });

/**
 * From `start` to the hook pose of a car on the kerb, the way a tow truck does it: along the lane, onto a passing
 * line with room beside the car, past it, stop ahead, then reverse onto the kerb (S-curve) into the hook pose.
 * Returns { approach (forward path), reverse (reverse path) } or null. opts: route opts (lead ...).
 */
function planHookApproach(net, start, hook, car, opts = {}) {
  const b = laneBeside(net, hook);
  if (!b) return null;
  const { lane, t: tH, lat: latH } = b;
  const cdx = car.x - lane.a.x, cdz = car.z - lane.a.z;
  const latC = cdx * leftX(lane.h) + cdz * leftZ(lane.h), tC = cdx * fwdX(lane.h) + cdz * fwdZ(lane.h);
  // passing line: the truck's side PASS_GAP clear of the car's side (or the lane itself if that is clear already)
  const need = CAR_HALF_W + PASS_GAP + TRUCK_HALF;
  const passLat = latC < 0 ? Math.max(0, latC + need) : Math.min(0, latC - need);
  const shift = passLat - latH;                  // forward from the hook pose: the S-curve out to the passing line
  // the reverse onto the kerb: the gentlest S whose sweep stays clear of the kerb scenery round the hook pose
  // (a tighter one keeps the nose angled away from the kerb until the last moment, e.g. past h3's bait stall)
  let shape = null, bestMin = -1;
  for (const [r, settle] of REV_SHAPES) {
    const c = net.check(net.sCurve(hook, shift, { pre: settle, r }), { axle: AXLE - 0.15, length: TRUCK_LEN + 0.3 });
    if (c.min > bestMin) { bestMin = c.min; shape = { r, settle }; }
    if (c.min >= 0.12) break;
  }
  const along = net.sAlong(shift, shape.r);
  const tP0 = tH + shape.settle + along;
  const reverse = (post = 0) => net.reversed(net.sCurve(hook, shift, { pre: shape.settle, post, r: shape.r }));
  const passV = DSP.cornerSpeed;
  // 1) on the passing line before the car's tail reaches the truck's nose, past the car, stop ahead of it
  const tQ = tC - 1.5 - (AXLE + TRUCK_LEN / 2) - 0.4;
  if (tQ > 0 && tQ < tP0) {
    const a = net.route(start, lanePose(lane, tQ, passLat), { ...opts, endV: passV });
    if (a) {
      const straight = net.sCurve(lanePose(lane, tQ, passLat), 0, { pre: tP0 - tQ, v: passV });
      return { approach: net.join(a, straight), reverse: reverse() };
    }
  }
  // 2) the lane can't be reached before the car (a car just past a junction, h5): come in after it, stop further
  //    on and reverse along the passing line first
  for (let tP = tP0; tP < tP0 + 20 && tP < lane.len; tP += 1) {
    const a = net.route(start, lanePose(lane, tP, passLat), opts);
    if (a) return { approach: a, reverse: reverse(tP - tP0) };
  }
  return null;
}
/**
 * Route from the hook pose to the drop pose with the car in tow. Pulling out of the kerb swings the truck's tail and
 * the towed car's nose towards the kerb side (the quay edge at h2): of the ways out (normal S, a long gentle S, a
 * direct turn into a crossing lane, a tight S) take the one whose sweep (truck + towed car, `tow` = rescue's Tow:
 * ax, Lh, L, W, hz) keeps clear of scenery, else the clearest.
 */
function planTow(net, from, to, tow) {
  const opts = { speed: DSP.speed * 0.85, corner: DSP.cornerSpeed * 0.9 };
  const tries = [opts, { ...opts, mergeR: 7, noTurn: true }, { ...opts, mergeR: 3.2, noTurn: true }, { ...opts, noTurn: true }];
  let best = null, bestMin = -Infinity;
  for (const o of tries) {
    const path = net.route(from, to, o);
    if (!path) continue;
    if (!tow) return path;
    // (the hook pose itself may sit close to the quay edge: judge only what the pull-out adds)
    const c = net.check(path, { tow: { ax: tow.ax, lh: tow.Lh, length: tow.L, width: tow.W }, hitch: -(AXLE + tow.hz) });
    const m = Math.min(c.min, c.towMin);
    if (m >= 0.12) return path;
    if (m > bestMin + 0.02) { best = path; bestMin = m; }
  }
  return best;
}

// [S radius, straight at the end] tried in order for the reverse onto the kerb
const REV_SHAPES = [[4.5, 1.6], [3.6, 0.8], [3.2, 0.3], [3.0, 0]];

// ------------------------------------------------------------------ the tow driver (character)
// Idles inside the shed's open west side, by the dispatch desk at the back, facing the street (off the alley bay,
// the apron and the drop zone, out of every truck path); gets in and out at the cab's west side.
const SHED = PROPERTIES.tow.plot, HOME = RESCUE.truck.home;
const SPOT = { x: SHED.minX + 0.45, z: HOME.z - 1.5 };
const CAB = { x: SHED.minX + 0.45, z: HOME.z + 0.65 };

const RADIO_X = -1.15, RADIO_Z = -0.32;                            // right arm up, hand at the ear (rescue's phone pose)

class TowDriver extends Walker {
  constructor(ctx, animate) {
    super(M.createCharacter(M.towDriverLook()), 2.7, 0);
    this.ctx = ctx;
    this.pos.set(SPOT.x, 0, SPOT.z);
    this.idleYaw = 0;
    ctx.root.add(this.group);
    if (animate) { popIn(this.group, 1, 0.4); ctx.fx.poof(SPOT, 0xf6c453); }
    this.state = 'idle';           // idle | toTruck | hopping | in | back
    this.lookT = 4 + Math.random() * 3;
    // a handheld radio in the right hand: up to his ear while he takes a call
    this.arm = this.ch.sprayTip?.parent || null;
    this.radio = null; this.radioK = 0; this.radioOn = false;
    if (this.arm && M.createPhone) {
      this.radio = M.createPhone();
      this.radio.position.set(0, -0.47, 0.06);
      this.radio.visible = false;
      this.arm.add(this.radio);
    }
  }
  get home() { return SPOT; }
  /** Walk along the truck's west side to the cab. */
  walkTo() {
    this.state = 'toTruck';
    this.idleYaw = null;
    this.path = [{ x: CAB.x, z: CAB.z }];
  }
  walkHome() {
    this.state = 'back';
    this.path = [{ x: SPOT.x, z: SPOT.z }];
  }
  /** Hop into the cab (the player's hop): shrinks into the truck, then hidden. */
  hopIn(truck, onDone) {
    this.state = 'hopping';
    this.path = [];
    hop(this.group, this.pos, (out) => out.set(truck.pos.x, 0.6, truck.pos.z), {
      duration: 0.3, height: 0.9, scaleFrom: 1, scaleTo: 0.3,
      onComplete: () => {
        this.group.visible = false; this.group.scale.setScalar(1);
        this.state = 'in';
        onDone?.();
      },
    });
  }
  /** Pop out of the cab at `to` (the player's pop-out), then walk home. */
  hopOut(truck, to, onDone) {
    this.state = 'hopping';
    const from = new THREE.Vector3(truck.pos.x, 0.6, truck.pos.z);
    this.pos.copy(from);
    this.group.scale.setScalar(0.3);
    this.group.visible = true;
    this.yaw = Math.atan2(to.x - from.x, to.z - from.z); this.group.rotation.y = this.yaw;
    hop(this.group, from, to, {
      duration: 0.36, height: 1.1, scaleFrom: 0.3, scaleTo: 1,
      onComplete: () => { this.group.scale.setScalar(1); this.pos.y = 0; onDone?.(); },
    });
  }
  update(dt, truck) {
    if (this.state === 'in') { this.pos.set(truck.pos.x, 0, truck.pos.z); return; }
    if (this.state === 'hopping') return;
    const near = this.ctx.near(this.pos, 2);
    if (this.state === 'idle') {
      if (!near && this.radioK < 0.01) return;
      if (this.radioOn) this.idleYaw = 0;
      // now and then a glance at the garage (or along the alley), then back to the street
      this.lookT -= dt;
      if (this.lookT <= 0) {
        this.idleYaw = this.idleYaw === 0 ? (Math.random() < 0.6 ? 0.9 : -0.8) : 0;
        this.lookT = this.idleYaw === 0 ? 5 + Math.random() * 4 : 1.6 + Math.random();
      }
    }
    const arrived = this.step(dt);
    if (this.state === 'back' && arrived) { this.state = 'idle'; this.idleYaw = 0; this.lookT = 3; }
    // radio pose on top of the walk / idle animation (the arm comes up in front, the radio at his ear)
    this.radioK += ((this.radioOn && this.state === 'idle' ? 1 : 0) - this.radioK) * Math.min(1, dt * 7);
    if (this.radio) this.radio.visible = this.radioK > 0.45;
    if (this.arm && this.radioK > 0.01) {
      this.arm.rotation.x += (RADIO_X - this.arm.rotation.x) * this.radioK;
      this.arm.rotation.z += (RADIO_Z - this.arm.rotation.z) * this.radioK;
    }
  }
  dispose() { this.group.parent?.remove(this.group); }
}

// ------------------------------------------------------------------ the dispatcher (property system of 'tow')
let debugOff = typeof location !== 'undefined' && /[?&]nodispatch/.test(location.search);
const _v = new THREE.Vector3();

/** Stand-in for ctx.rescue while testing routes without a call (__game.dispatcher.go): no car, no hook-up. */
function standinApi() {
  return {
    standin: true,
    hookPose: (c) => ({ x: c.carPos.x + fwdX(c.yaw) * HOOK_DIST, z: c.carPos.z + fwdZ(c.yaw) * HOOK_DIST, yaw: c.yaw }),
    hook: (t, c, { onDone }) => { tween({ duration: 1.6, onComplete: () => onDone?.(t) }); },
    dropPose: () => { const P = RESCUE.drop.pose || RESCUE.drop; return { x: P.x, z: P.z, yaw: P.yaw }; },
    drop: (t, { onDone }) => { tween({ duration: 1.6, onComplete: () => onDone?.(t) }); return true; },
    towOf: () => null, claim() {}, unclaim() {},
  };
}

class Dispatcher {
  constructor(ctx, prop) {
    this.ctx = ctx; this.prop = prop;
    this.truck = ctx.vehicles.get('tow');
    this.td = this.truck ? new TruckDriver(ctx, this.truck) : null;
    this.driver = null;
    // idle | walk | board | out | kerb | hook | tow | drop | dropping | home | shed | alight
    this.phase = 'idle';
    this.call = null; this.api = null;
    this.waitT = 0; this.retryT = 0; this.hookTries = 0;
    this.forced = false;           // debug stand-in run below level 3
    this.auto = !debugOff;         // debug: __game.dispatcher.auto(false) stops it from taking calls
    this.offParked = this.truck?.on('parked', (e) => this.onParked(e)) || null;
    this.log = []; this.lastPhase = null;
    if (prop.level >= 3) this.hire(false);
  }

  hire(animate) { if (!this.driver) this.driver = new TowDriver(this.ctx, animate); }
  onLevel(level, animate) { if (level >= 3) this.hire(animate); }

  /** The truck stands in its shed, nobody in it. */
  truckHome() { const t = this.truck; return !!t && t.bay === 'shed' && t.mode === 'parked' && !t.driver; }
  /** The player is in the truck, hopping in, or standing at its door (they get it first). */
  playerWantsTruck() {
    const t = this.truck, pl = this.ctx.player;
    if (pl.vehicle === t || t.playerIn) return true;
    if (t.enterT > 0) return true;
    const d = t.doorSpot(_v);
    return pl.onFoot && Math.hypot(pl.pos.x - d.x, pl.pos.z - d.z) < 1.3;
  }
  rescueApi() { const R = this.ctx.rescue; return R && typeof R.hook === 'function' ? R : null; }
  /** Our call is still there, still ours, and still waiting for a truck. */
  callValid() {
    const c = this.call;
    if (!c) return false;
    if (this.api?.standin) return true;
    const R = this.api;
    return R.calls.includes(c) && c.claimedBy === 'dispatcher' && (c.state === 'waiting' || c.state === 'arriving');
  }
  release() {
    const c = this.call;
    if (c && !this.api?.standin && c.claimedBy === 'dispatcher' && this.api?.calls?.includes(c) && !this.api.towOf?.(this.truck)) this.api.unclaim(c);
    this.call = null;
  }

  update(dt) {
    if (!this.truck || ((this.prop.level < 3 || !this.driver) && !this.forced)) return;
    if (this.phase !== this.lastPhase) {        // debug trace (__game.dispatcher.log)
      this.lastPhase = this.phase;
      const t = this.truck;
      this.log.push(`${this.phase} ${this.call?.spot?.id ?? ''} @${t.pos.x.toFixed(1)},${t.pos.z.toFixed(1)} y${t.yaw.toFixed(2)}`);
      if (this.log.length > 60) this.log.shift();
    }
    this.driver?.update(dt, this.truck);
    switch (this.phase) {
      case 'idle': this.updateIdle(dt); break;
      case 'walk': this.updateWalk(); break;
      case 'out': case 'kerb': if (!this.callValid()) this.goHome(); break;
      case 'tow': if (!this.api.standin && !this.api.towOf(this.truck)) this.goHome(); break;
      case 'drop': this.updateDrop(dt); break;
      case 'hookWait':
        if (!this.callValid()) this.goHome();
        else if ((this.retryT -= dt) <= 0) this.hookUp();
        break;
    }
  }

  updateIdle(dt) {
    const R = this.auto ? this.rescueApi() : null;
    const call = R?.waitingCall?.() || null;
    if (!call || this.driver?.state !== 'idle') { this.waitT = 0; if (this.driver) this.driver.radioOn = false; return; }
    const t = this.truck;
    if (!this.truckHome()) {
      // the truck was left in town: wait for it to come home; say so once
      if (t.mode === 'parked' && t.bay !== 'shed' && !t.driver && !state.town.hints.dispatcherPark) {
        state.town.hints.dispatcherPark = true; save();
        ui.toast('Park the truck at the tow shed so your dispatcher can use it');
      }
      this.waitT = 0; this.driver.radioOn = false; return;
    }
    if (this.playerWantsTruck()) { this.waitT = 0; this.driver.radioOn = false; return; }
    this.waitT += dt;
    // he takes the call on the radio first, puts it away, then goes
    this.driver.radioOn = this.waitT > 0.3 && this.waitT < DSP.delay - 0.6;
    if (this.waitT < DSP.delay) return;
    this.waitT = 0;
    this.api = R;
    R.claim(call, 'dispatcher');
    this.call = call;
    this.phase = 'walk';
    this.driver.walkTo();
  }

  updateWalk() {
    if (!this.truckHome() || this.playerWantsTruck() || !this.callValid()) {
      this.release();
      this.phase = 'idle';
      this.driver.walkHome();
      return;
    }
    if (this.driver.arrived) this.board();
  }

  board() {
    const t = this.truck;
    t.driver = this;                           // the enter ring goes: nobody else gets in now
    this.phase = 'board';
    this.ctx.sfxAt('pickup', t.pos);
    this.driver.hopIn(t, () => this.depart());
  }

  /** In the cab: plan the way to the car and go. */
  depart() {
    const t = this.truck, net = getRoads(this.ctx);
    if (!this.callValid()) { this.release(); this.alight(); return; }
    const c = this.call;
    const hook = toRef(this.api.hookPose(c));
    const plan = planHookApproach(net, refOf(t), hook, c.carPos, { lead: SHED_LEAD, mergeR: SHED_MERGE_R });
    if (!plan) { console.warn('[wrench-bay] dispatcher: no route to', c.spot?.id); this.release(); this.alight(); return; }
    t.model.setBeacon?.(true);
    this.ctx.sfxAt('engine', t.pos);
    if (!this.api.standin && !state.town.hints.dispatcherFirst) {
      state.town.hints.dispatcherFirst = true; save();
      ui.toast('Your tow driver took the call! He answers them while you are busy');
    }
    this.td.ignorePos = c.carPos;              // the stranded car: the truck backs right up to it
    this.td.ignore = c;
    this.td.ownTow = null;
    this.td.attach(this);
    this.phase = 'out';
    this.td.drive(plan.approach, 1, () => {
      this.phase = 'kerb';
      this.td.drive(plan.reverse, -1, () => this.hookUp());
    });
  }

  hookUp() {
    if (!this.callValid()) { this.goHome(); return; }
    this.phase = 'hook';
    this.td.hold();
    const ok = this.api.hook(this.truck, this.call, { onDone: () => this.towToDrop() });
    if (ok !== false) { this.hookTries = 0; return; }
    // not hookable this instant: try again, give up after a while (the call goes back to waiting)
    if (++this.hookTries > 8) { this.hookTries = 0; this.goHome(); return; }
    this.phase = 'hookWait'; this.retryT = 1;
  }

  towToDrop() {
    const t = this.truck, net = getRoads(this.ctx);
    this.phase = 'tow';
    this.td.ignorePos = null; this.td.ignore = null;
    this.td.ownTow = this.call?.model?.group?.position || null;
    const path = planTow(net, refOf(t), toRef(this.api.dropPose()), this.call?.tow);
    if (!path) { console.warn('[wrench-bay] dispatcher: no route to the drop'); this.td.attach(this); this.td.hold(); return; }
    this.td.drive(path, 1, () => { this.phase = 'drop'; this.retryT = 0; });
  }

  updateDrop(dt) {
    this.retryT -= dt;
    if (this.retryT > 0) return;
    const ok = this.api.drop(this.truck, { onDone: () => this.driveHome() });
    if (ok !== false) { this.phase = 'dropping'; return; }
    // the garage lane is full: wait in the drop zone (off the street), try again every second
    this.retryT = 1;
    if (this.truck.script?.[0]?.fn !== this.td.step) this.td.attach(this);
    this.td.hold();
  }

  /** Back into the shed: straight from the drop zone (vehicles.js backIntoShed), from town via the drop zone. */
  driveHome() {
    const t = this.truck, net = getRoads(this.ctx);
    this.phase = 'home';
    this.call = null;
    this.td.ownTow = null; this.td.ignorePos = null; this.td.ignore = null;
    t.model.setBeacon?.(false);
    const D = this.dropPose();
    if (Math.hypot(t.pos.x - D.x, t.pos.z - D.z) < 3 && Math.abs(angleDiff(t.yaw, D.yaw)) < 0.6) { this.toShed(); return; }
    const path = net.route(refOf(t), toRef(D));
    if (!path) { console.warn('[wrench-bay] dispatcher: no route home from', t.pos.x.toFixed(1), t.pos.z.toFixed(1)); this.toShed(); return; }
    this.td.drive(path, 1, () => this.toShed());
  }
  /** A beat to change gear, then the car-like manoeuvre into the shed ('parked' event when it is in). */
  toShed() {
    const t = this.truck;
    this.phase = 'shed';
    if (t.script?.[0]?.fn !== this.td.step) this.td.attach(this);
    this.td.hold();
    tween({ duration: 0.4, onComplete: () => { if (this.phase === 'shed' && this.truck === t) t.backIntoShed(); } });
  }
  dropPose() { return this.api && !this.api.standin ? this.api.dropPose() : standinApi().dropPose(); }

  /** Something broke the run before the hook-up: give the call back, drive home. */
  goHome() {
    this.release();
    if (this.truck.script?.[0]?.fn !== this.td.step) this.td.attach(this);
    this.driveHome();
  }

  onParked({ bay }) {
    if (this.phase !== 'shed' || bay !== 'shed') return;
    this.alight();
  }

  /** Hop out at the cab door and walk back to the spot by the shed. */
  alight() {
    const t = this.truck;
    this.phase = 'alight';
    if (!this.driver) { t.driver = null; this.phase = 'idle'; this.forced = false; return; }
    const to = new THREE.Vector3(CAB.x, 0, CAB.z);
    this.driver.hopOut(t, to, () => {
      if (t.driver === this) t.driver = null;
      if (t.mode === 'auto' && !t.script) t.mode = 'parked';
      this.driver.walkHome();
      this.phase = 'idle';
      this.forced = false;
    });
  }

  /** Debug: a run to a spot without a call (stand-in hook / drop). */
  go(spotId) {
    const spot = RESCUE.spots.find((s) => s.id === spotId);
    if (!spot || !this.truckHome() || this.phase !== 'idle') return false;
    this.forced = true;
    this.hire(false);
    this.api = standinApi();
    this.call = { spot, carPos: new THREE.Vector3(spot.x, 0, spot.z), yaw: spot.yaw, claimedBy: 'dispatcher', state: 'waiting' };
    this.phase = 'walk';
    this.driver.walkTo();
    return true;
  }

  dispose() {
    this.offParked?.();
    this.release();
    this.driver?.dispose();
  }
}

registerPropertySystem('tow', (ctx, prop) => {
  const d = new Dispatcher(ctx, prop);
  ctx.dispatcher = d;
  return d;
});

// ---------------------------------------------------------------- debug helpers on window.__game
function debugApi(d) {
  const ctx = d.ctx;
  return {
    sys: d,
    state: () => ({
      phase: d.phase, call: d.call?.spot?.id ?? null, driver: d.driver?.state ?? null, blocked: !!d.td?.blocker,
      err: +(d.td?.follower.err || 0).toFixed(3), maxErr: +(d.td?.follower.maxErr || 0).toFixed(3), left: +(d.td?.follower.remaining || 0).toFixed(2),
      truck: { mode: d.truck?.mode, bay: d.truck?.bay, x: +d.truck?.pos.x.toFixed(2), z: +d.truck?.pos.z.toFixed(2), yaw: +d.truck?.yaw.toFixed(3), v: +(d.truck?.speed || 0).toFixed(2) },
    }),
    /** Taking calls on / off (debug; survives world rebuilds until the page reloads). */
    auto: (on = true) => { debugOff = !on; d.auto = !!on; return d.auto; },
    /** A stand-in run to a spot (no call, no hook-up): checks the roads and manoeuvres. */
    go: (id) => d.go(id),
    log: d.log,
    /** Promise: resolves when fn() is true (or after ms): for scripted checks. */
    wait: (fn, ms = 20000) => new Promise((r) => { const t0 = performance.now(); const w = () => { let ok = false; try { ok = fn(); } catch { /* not yet */ } if (ok || performance.now() - t0 > ms) r(ok); else requestAnimationFrame(w); }; w(); }),
    /** Camera follows the truck (true) or the player again (false). */
    watch: (on = true) => follow(on ? d.truck.group : ctx.player.group),
    /** The planned paths of a run to a spot (stand-in hook / drop poses): { plan: { approach, reverse }, toDrop, home }. */
    plan: (id) => {
      const spot = RESCUE.spots.find((s) => s.id === id), net = getRoads(ctx), sa = standinApi(), R = d.rescueApi();
      const call = R?.calls?.find((x) => x.spot?.id === id);
      const c = call || { id: -1, spot, carPos: new THREE.Vector3(spot.x, 0, spot.z), yaw: spot.yaw, model: M.createCar?.({ type: 'compact' }) };
      let hookC = sa.hookPose(c);
      let finalC = hookC;
      try { if (R) { hookC = R.hookPose(c); finalC = R.hookFinalPose?.(c) || hookC; } } catch { /* stand-in poses */ }
      const dropC = R ? R.dropPose() : sa.dropPose();
      const home = toRef({ x: RESCUE.truck.home.x, z: RESCUE.truck.home.z, yaw: RESCUE.truck.home.yaw });
      return {
        plan: planHookApproach(net, home, toRef(hookC), c.carPos, { lead: SHED_LEAD, mergeR: SHED_MERGE_R }),
        toDrop: planTow(net, toRef(finalC), toRef(dropC), { ax: 0.95, Lh: 1.9, L: 2.8, W: 1.5, hz: -2.7 }),
        home: shedManoeuvre(dropC.x, dropC.z, dropC.yaw),
        hook: hookC, final: finalC, drop: dropC,
      };
    },
  };
}
function installDebug() {
  if (typeof window === 'undefined') return;
  const g = window.__game;
  if (!g) { setTimeout(installDebug, 250); return; }
  if (Object.getOwnPropertyDescriptor(g, 'dispatcher')) return;
  let cache = null;
  Object.defineProperty(g, 'dispatcher', {
    configurable: true,
    get() {
      const d = g.world?.dispatcher;
      if (!d) return null;
      if (!cache || cache.sys !== d) cache = debugApi(d);
      return cache;
    },
  });
}
installDebug();
