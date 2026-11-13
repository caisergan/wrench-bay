// The scene of a rescue call (TOWN.md 4.5 point 1) and the small maths rescue.js uses: the stranded car on the kerb
// (hazards, breakdown cue, a solid capsule), its owner on the pavement behind it (phone, then waving at the truck),
// the red warning triangle behind the car, the roll-in along the kerb lane when the call starts on screen, the owner's
// walk to the truck's door at the hook-up; pose-to-pose curves and the hook-up line-up manoeuvre.
// Everything here works on a `call` object made by makeCall (see rescue.js for its fields) and the world `ctx`.
import * as THREE from 'three';
import * as M from '../models/index.js';
import { RESCUE, TOWN } from '../config.js';
import { state, unlockedPartTypes } from '../core/state.js';
import { ui } from '../ui/index.js';
import { Walker } from './walker.js';
import { hop } from './tween.js';
import { Tag, clamp, angleDiff, detach } from './util.js';
import { circleHitsBoxes } from './collision.js';

export const STAGE = 1.2;              // the truck stops this far ahead of the final hook pose (cradles clear of the tyres)
export const TRI_BACK = 2.0;           // warning triangle: this far behind the rear bumper (~3.4 m behind the car's centre)
export const ROLL_BACK = 14;           // a car breaking down on screen rolls in from at least this far back
export const VISIBLE = ['engine', 'battery', 'tire'];   // problems that show on the stopped car (smoke, hood up, flat)
export const TOW_BOOM = M.TOW_BOOM ?? 0.6;
export const DROP_HOLD = 0.6;          // car waits at least this long after the drop before it drives off

const _p = { x: 0, z: 0, yaw: 0 };
let uid = 0;

export const fx = (yaw) => Math.sin(yaw), fz = (yaw) => Math.cos(yaw);
/** Right of a heading (the kerb side of a parked car): (-cos, sin). */
export const rx = (yaw) => -Math.cos(yaw), rz = (yaw) => Math.sin(yaw);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const save_ = () => (state.town.rescue ||= { next: null, call: null, more: [], first: false, last: null });

// ------------------------------------------------------------------ curves (roll-in, hook-up manoeuvres)
/** A sampled polyline with arc length; `at(s, out)` = position + motion heading at distance s. */
export class Curve {
  constructor() { this.x = []; this.z = []; this.d = []; this.len = 0; this.i = 0; }
  push(x, z) {
    const n = this.x.length;
    if (n) {
      const dl = Math.hypot(x - this.x[n - 1], z - this.z[n - 1]);
      if (dl < 1e-4) return this;
      this.len += dl;
    }
    this.x.push(x); this.z.push(z); this.d.push(this.len);
    return this;
  }
  line(x, z) { return this.push(x, z); }
  /** Cubic Bezier from the last point (or a) through control points b, c to d. */
  bezier(ax, az, bx, bz, cx, cz, dx, dz, n = 24) {
    if (!this.x.length) this.push(ax, az);
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      this.push(a * ax + b * bx + c * cx + d * dx, a * az + b * bz + c * cz + d * dz);
    }
    return this;
  }
  /** Pose-to-pose Bezier: leaves (x0, z0) along heading h0, arrives at (x1, z1) along heading h1 (motion headings). */
  pose(x0, z0, h0, x1, z1, h1, n = 24) {
    const k = Math.max(0.4, Math.hypot(x1 - x0, z1 - z0) * 0.42);
    return this.bezier(x0, z0, x0 + fx(h0) * k, z0 + fz(h0) * k, x1 - fx(h1) * k, z1 - fz(h1) * k, x1, z1, n);
  }
  at(s, out) {
    const n = this.x.length;
    if (n < 2) { out.x = this.x[0] ?? 0; out.z = this.z[0] ?? 0; return out; }
    s = clamp(s, 0, this.len);
    let i = Math.min(this.i, n - 2);
    while (i > 0 && this.d[i] > s) i--;
    while (i < n - 2 && this.d[i + 1] < s) i++;
    this.i = i;
    const d0 = this.d[i], d1 = this.d[i + 1], k = d1 > d0 ? (s - d0) / (d1 - d0) : 0;
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * k;
    out.z = this.z[i] + (this.z[i + 1] - this.z[i]) * k;
    // heading: blend the directions of this and the next segment so it turns smoothly through the samples
    const h0 = Math.atan2(this.x[i + 1] - this.x[i], this.z[i + 1] - this.z[i]);
    const j = Math.min(n - 2, i + 1);
    const h1 = Math.atan2(this.x[j + 1] - this.x[j], this.z[j + 1] - this.z[j]);
    out.yaw = h0 + angleDiff(h0, h1) * k * 0.5;
    return out;
  }
}

/** Speed along a move of length len at distance s: ramps up and down (a <= acc), top speed vmax. */
export const rampSpeed = (s, len, vmax, acc = 3) => Math.max(0.35, Math.min(vmax, Math.sqrt(2 * acc * Math.max(0, len - s)) + 0.25, Math.sqrt(2 * acc * s) + 0.6));

/**
 * Manoeuvre from pose C to pose S (both truck centre + heading): a list of moves { curve, reverse }.
 * Ahead of S and roughly in line: reverse onto it (an S-bend if a little off). Otherwise pull forward along the road
 * (the kerb lane, `lat` m on the road side of S) a few metres past it and reverse back onto the kerb with an S-bend, as
 * a tow driver would: the truck never noses along the kerb ahead of the stop pose (scenery stands there).
 */
export function planManoeuvre(c, S, lat = 1.6) {
  const f = { x: fx(S.yaw), z: fz(S.yaw) };
  const dx = c.x - S.x, dz = c.z - S.z;
  const l = dx * f.x + dz * f.z, t = dx * rx(S.yaw) + dz * rz(S.yaw);
  const dh = angleDiff(S.yaw, c.yaw);
  if (Math.hypot(l, t) < 0.03 && Math.abs(dh) < 0.02) return [];
  // practically on it: roll the last few cm straight (a 10 cm sideways creep does not read as sliding)
  if (Math.abs(t) < 0.12 && Math.abs(dh) < 0.1 && Math.abs(l) < 0.4) return [{ reverse: l > 0, curve: new Curve().push(c.x, c.z).line(S.x, S.z), yaw0: c.yaw, yaw1: S.yaw }];
  if (l > 0.2 && Math.abs(t) <= 0.45 * l + 0.12 && Math.abs(dh) < 0.8) {
    // backing in: motion heading = heading + PI
    return [{ reverse: true, curve: new Curve().pose(c.x, c.z, c.yaw + Math.PI, S.x, S.z, S.yaw + Math.PI) }];
  }
  const D = Math.max(4.6, l + 2.6);
  const mx = S.x + f.x * D - rx(S.yaw) * lat, mz = S.z + f.z * D - rz(S.yaw) * lat;
  return [
    { reverse: false, curve: new Curve().pose(c.x, c.z, c.yaw, mx, mz, S.yaw) },
    { reverse: true, curve: new Curve().pose(mx, mz, S.yaw + Math.PI, S.x, S.z, S.yaw + Math.PI) },
  ];
}

// ------------------------------------------------------------------ what breaks down
/** A car the garage would serve (never a VIP; does not use up the garage's "New in town" arrival). */
export function rollLook(garage) {
  const ft = garage.forcedType;
  garage.forcedType = null;
  let look;
  try { look = garage.h('rollLook', { vip: false }); } finally { garage.forcedType = ft; }
  return { ...look, vip: false };
}
/** RESCUE.jobs problems of the garage's unlocked part types; at least one shows on the stopped car. */
export function rollProblems() {
  const types = unlockedPartTypes();
  const [a, b] = RESCUE.jobs;
  const n = a + Math.floor(Math.random() * (b - a + 1));
  const out = [];
  for (let i = 0; i < n; i++) out.push(pick(types));
  const vis = types.filter((t) => VISIBLE.includes(t));
  if (vis.length && !out.some((t) => VISIBLE.includes(t))) out[0] = pick(vis);
  return out;
}
/** Distance from a spot to the kerb lane of the road it sits on (the lane the car pulled out of). */
export function laneOffset(spot) {
  const alongX = Math.abs(Math.sin(spot.yaw)) > 0.7;
  let bd = Infinity;
  for (const k in TOWN.roads) {
    const r = TOWN.roads[k];
    if ((r.axis === 'x') !== alongX) continue;
    const cross = alongX ? spot.z : spot.x;
    for (const lane of r.lanes) bd = Math.min(bd, Math.abs(cross - lane));
  }
  return bd < 4 ? bd : 1.6;
}
/** How far back along its road a car can come from (stays on that road's paving, out of the tunnels). */
export function roadBack(spot) {
  const alongX = Math.abs(Math.sin(spot.yaw)) > 0.7;
  let best = 30;
  for (const k in TOWN.roads) {
    const r = TOWN.roads[k];
    if ((r.axis === 'x') !== alongX) continue;
    const cross = alongX ? spot.z : spot.x;
    if (Math.abs(cross - (r.axis === 'x' ? r.z : r.x)) > 4) continue;
    const along = alongX ? spot.x : spot.z, dir = alongX ? Math.sin(spot.yaw) : Math.cos(spot.yaw);
    const lo = Math.max(r.from, -TOWN.edge.tunnelX + 2), hi = Math.min(r.to, TOWN.edge.tunnelX - 2);
    best = dir > 0 ? along - lo : hi - along;
  }
  return Math.max(4, best);
}

// ------------------------------------------------------------------ the stranded owner
// States: inCar (hidden, rolling in) | placeTri (carries the triangle back) | toStand | stand (phone / waves) |
// getTri (hook-up: fetches the triangle) | toTruck | atDoor | boarding | riding (hidden in the cab)
const PHONE_X = -1.15, PHONE_Z = -0.32;
export function makeOwner(ctx, call, look) {
  const ch = M.createCharacter(look);
  const w = new Walker(ch, 2.3, call.yaw + Math.PI);
  const arm = ch.sprayTip?.parent || null;     // the right arm (sprayTip is a child of it)
  let phone = null;
  if (arm && M.createPhone) {
    phone = M.createPhone();
    phone.position.set(0, -0.47, 0.06);
    phone.visible = false;
    arm.add(phone);
  }
  ctx.root.add(ch.group);
  return { ch, w, arm, phone, phoneK: 0, waving: false, state: 'stand', boardT: 0, look };
}

/** Phone pose on top of the character's own animation (right arm up in front of the chest, screen to the face). */
export function phonePose(o, dt, on) {
  o.phoneK += ((on ? 1 : 0) - o.phoneK) * Math.min(1, dt * 7);
  if (o.phone) o.phone.visible = o.phoneK > 0.45;
  if (!o.arm || o.phoneK < 0.01) return;
  o.arm.rotation.x += (PHONE_X - o.arm.rotation.x) * o.phoneK;
  o.arm.rotation.z += (PHONE_Z - o.arm.rotation.z) * o.phoneK;
}


// ------------------------------------------------------------------ the scene of a call (ctx = the world)
/** A door of the truck at pose p: side +1 = passenger (right), -1 = driver (left). */
export function doorAt(p, side, out) {
  const f0 = fx(p.yaw), f1 = fz(p.yaw), s = (RESCUE.truck.width / 2 + 0.65) * side;
  out.x = p.x + rx(p.yaw) * s + f0 * 0.35; out.z = p.z + rz(p.yaw) * s + f1 * 0.35;
  return out;
}
export const clearAt = (ctx, x, z, r = 0.35) => {
  const b = ctx.bounds;
  return !circleHitsBoxes(x, z, r, ctx.obstacles) && x > b.minX + r && x < b.maxX - r && z > b.minZ + r && z < b.maxZ - r;
};
/** The passenger door if a person can stand there, else the driver's. */
export function doorSide(ctx, p) {
  const d = doorAt(p, 1, {});
  return clearAt(ctx, d.x, d.z) ? 1 : -1;
}

// ---------------------------------------------------------------- the scene of a call
export function makeCall(ctx, spot, data, arrive) {
  const look = data.look;
  const model = M.createCar(look);
  model.setProblems(data.problems);
  if (data.story) model.setTyreStory?.(data.story);
  const dm = model.dims;
  const f0 = fx(spot.yaw), f1 = fz(spot.yaw), r0 = rx(spot.yaw), r1 = rz(spot.yaw);
  const call = {
    id: ++uid, spot, state: arrive ? 'arriving' : 'waiting',
    carPos: new THREE.Vector3(spot.x, 0, spot.z), yaw: spot.yaw,
    nose: new THREE.Vector3(spot.x + f0 * dm.length / 2, 0, spot.z + f1 * dm.length / 2),
    model, claimedBy: null, data, fastLeft: data.fastLeft ?? RESCUE.callTime,
    get fast() { return this.fastLeft > 0; },
    look, problems: data.problems.slice(), story: data.story || null,
    capsule: { ax: 0, az: 0, bx: 0, bz: 0, r: dm.width / 2, owner: null },
    // ped: AI cars wait for it and never ghost through it (cars.js findBlocker)
    mover: { pos: new THREE.Vector3(spot.x, 0, spot.z), radius: dm.length / 2, hidden: true, owner: null, tow: false, truck: null, ped: true },
    tow: null, truck: null, seq: null, roll: null, reserved: false, wasFast: false, speed: 0,
    // scene points (world): where the owner stands, where the triangle goes
    stand: { x: spot.x - f0 * (dm.length / 2 + 0.8) + r0 * 0.12, z: spot.z - f1 * (dm.length / 2 + 0.8) + r1 * 0.12 },
    triPos: { x: spot.x - f0 * (dm.length / 2 + TRI_BACK) - r0 * 0.45, z: spot.z - f1 * (dm.length / 2 + TRI_BACK) - r1 * 0.45 },
    owner: null, tri: null, label: null, ringShown: false,
  };
  call.capsule.owner = call;
  call.mover.owner = call;
  model.group.position.copy(call.carPos);
  model.group.rotation.y = call.yaw;
  ctx.root.add(model.group);
  ctx.movers.push(call.mover);
  // the warning triangle, facing the traffic that comes up behind the car, turned a little to the camera
  const tri = { group: M.createWarningTriangle ? M.createWarningTriangle() : new THREE.Group(), placed: false, down: false };
  let ty = call.yaw + Math.PI;
  ty += clamp(angleDiff(ty, 0), -0.9, 0.9);      // (edge-on to the high camera it would read as a red line)
  tri.yaw = ty;
  call.tri = tri;
  // the owner
  const o = makeOwner(ctx, call, data.owner || M.randomCustomerLook());
  call.owner = o;
  // the call label over the car (fill bar = fast bonus time left)
  call.label = new Tag({ kind: 'call', text: 'Rescue call' }, 2.35);
  call.label.setVisible(false);
  if (arrive) startRoll(ctx, call);
  else {
    model.setHazard(true);
    putTri(ctx, call);
    o.w.pos.set(call.stand.x, 0, call.stand.z);
    o.w.idleYaw = call.yaw + Math.PI;
    o.state = 'stand';
  }
  updateCapsule(call);
  return call;
}

export function updateCapsule(call) {
  const g = call.model.group, h = call.model.dims.length / 2 - call.model.dims.width / 2;
  const sx = Math.sin(g.rotation.y) * h, sz = Math.cos(g.rotation.y) * h;
  const c = call.capsule;
  c.ax = g.position.x - sx; c.az = g.position.z - sz; c.bx = g.position.x + sx; c.bz = g.position.z + sz;
  call.mover.pos.set(g.position.x, 0, g.position.z);
}

/** The triangle stands on the ground at its spot. */
export function putTri(ctx, call) {
  const t = call.tri;
  detach(t.group);
  t.group.position.set(call.triPos.x, 0, call.triPos.z);
  t.group.rotation.set(0, t.yaw, 0);
  t.group.scale.setScalar(1.15);
  t.group.userData.setDown?.(t.down);
  ctx.root.add(t.group);
  t.placed = true;
}
/** The triangle in the owner's hands (carry pose). */
export function holdTri(call) {
  const t = call.tri, o = call.owner;
  detach(t.group);
  t.down = false;
  t.group.userData.setDown?.(false);
  t.group.position.set(0, -0.42, 0.08);
  t.group.rotation.set(0, 0, 0);
  t.group.scale.setScalar(0.85);
  o.ch.carryAnchor.add(t.group);
  o.ch.setCarrying(true);
  t.placed = false;
}

/** On screen: the car comes along the kerb lane and coasts onto the kerb; the start is off screen. */
function startRoll(ctx, call) {
  const s = call.spot, y = s.yaw, f0 = fx(y), f1 = fz(y);
  const lat = laneOffset(s), r0 = rx(y) * lat, r1 = rz(y) * lat;
  const maxBack = roadBack(s);
  let back = Math.min(ROLL_BACK, maxBack);
  while (back < maxBack && ctx.near({ x: s.x - f0 * back - r0, z: s.z - f1 * back - r1 }, 4)) back = Math.min(maxBack, back + 4);
  const px = s.x - f0 * ROLL_BACK * 0.75 - r0, pz = s.z - f1 * ROLL_BACK * 0.75 - r1;   // where it starts to pull in
  const curve = new Curve().push(s.x - f0 * back - r0, s.z - f1 * back - r1);
  if (back > ROLL_BACK * 0.75 + 0.1) curve.line(px, pz);
  curve.pose(curve.x[curve.x.length - 1], curve.z[curve.z.length - 1], y, s.x, s.z, y, 28);
  call.roll = { curve, s: 0, v: 6.5 };
  call.mover.hidden = false;
  call.owner.state = 'inCar';
  call.owner.ch.group.visible = false;
  holdTri(call);
  rollStep(ctx, call, 0);
}
export function rollStep(ctx, call, dt) {
  const r = call.roll, rem = r.curve.len - r.s;
  r.v = Math.max(0.15, Math.min(6.5, Math.sqrt(2 * 1.45 * Math.max(0, rem))));
  r.s = Math.min(r.curve.len, r.s + r.v * dt);
  r.curve.at(r.s, _p);
  const g = call.model.group;
  g.position.set(_p.x, 0, _p.z);
  g.rotation.y = r.s > 0 ? _p.yaw : call.yaw;
  call.speed = r.v;
  if (r.s >= r.curve.len - 1e-3) {
    g.position.copy(call.carPos); g.rotation.y = call.yaw;
    call.roll = null; call.speed = 0;
    call.state = 'waiting';
    call.mover.hidden = true;
    call.model.setHazard(true);
    ownerOut(call);
  }
  updateCapsule(call);
}
/** The owner gets out at the driver's door (road side) with the triangle, puts it down behind the car. */
function ownerOut(call) {
  const o = call.owner, f0 = fx(call.yaw), f1 = fz(call.yaw), side = call.model.dims.width / 2 + 0.55;
  const door = new THREE.Vector3(call.carPos.x - rx(call.yaw) * side + f0 * 0.25, 0, call.carPos.z - rz(call.yaw) * side + f1 * 0.25);
  const from = new THREE.Vector3(call.carPos.x, 0.5, call.carPos.z);
  o.ch.group.visible = true;
  o.state = 'hopOut';
  o.ch.group.scale.setScalar(0.3);
  hop(o.ch.group, from, door, {
    duration: 0.36, height: 0.8, scaleFrom: 0.3, scaleTo: 1,
    onComplete: () => {
      o.ch.group.scale.setScalar(1);
      o.w.pos.y = 0;
      if (o.state !== 'hopOut') return;
      o.state = 'placeTri';
      const b = sidePoints(call, -1);
      o.w.setPath([b.rear, { x: call.triPos.x + f0 * 0.45, z: call.triPos.z + f1 * 0.45 }]);
    },
  });
}
/** Corners of the car on one side (+1 kerb side, -1 road side), a step away from the body. */
export function sidePoints(call, side) {
  const dm = call.model.dims, f0 = fx(call.yaw), f1 = fz(call.yaw);
  const s = (dm.width / 2 + 0.5) * side, l = dm.length / 2 + 0.35;
  const lx = rx(call.yaw) * s, lz = rz(call.yaw) * s;
  return {
    rear: { x: call.carPos.x - f0 * l + lx, z: call.carPos.z - f1 * l + lz },
    front: { x: call.carPos.x + f0 * l + lx, z: call.carPos.z + f1 * l + lz },
  };
}

export function disposeCall(ctx, call) {
  const o = call.owner;
  if (o) { detach(o.ch.group); }
  detach(call.tri?.group);
  call.label?.remove();
  if (call.model) detach(call.model.group);
  const k = ctx.movers.indexOf(call.mover); if (k >= 0) ctx.movers.splice(k, 1);
  if (call.tow) { const j = ctx.movers.indexOf(call.tow.mover); if (j >= 0) ctx.movers.splice(j, 1); }
  if (call.reserved) { ctx.facilities.garage?.cars.releaseSlot(); call.reserved = false; }
}

/** Hook-up: the owner fetches the triangle (if it is on the ground) and walks to the truck's door. */
export function ownerToTruck(ctx, call, F) {
  const o = call.owner;
  if (o.state === 'riding' || o.state === 'boarding') return;
  o.ch.setWaving(false); o.waving = false;
  // the passenger door when a person can get there along the kerb side of the car, else the driver's door
  const kerb = sidePoints(call, 1);
  let side = doorSide(ctx, F);
  if (side > 0 && !(clearAt(ctx, kerb.rear.x, kerb.rear.z) && clearAt(ctx, kerb.front.x, kerb.front.z))) side = -1;
  call.doorSide = side;
  const door = doorAt(F, side, {});
  const way = side > 0 ? kerb : sidePoints(call, -1);
  const path = [];
  if (call.tri.placed) { path.push({ x: call.triPos.x + fx(call.yaw) * 0.45, z: call.triPos.z + fz(call.yaw) * 0.45 }); o.state = 'getTri'; }
  else o.state = 'toTruck';
  o.after = [way.rear, way.front, door];
  if (o.state === 'toTruck') o.w.setPath(o.after.map((p) => ({ x: p.x, z: p.z })));
  else o.w.setPath(path);
  o.w.idleYaw = null;
}

export function boardTruck(ctx, call) {
  const o = call.owner, T = call.truck;
  if (!T || o.state === 'boarding' || o.state === 'riding') return;
  o.state = 'boarding';
  phonePose(o, 1, false);
  hop(o.ch.group, o.ch.group.position, (out) => out.set(T.pos.x + fx(T.yaw) * 0.55 + rx(T.yaw) * 0.3 * (call.doorSide || 1), 0.9, T.pos.z + fz(T.yaw) * 0.55 + rz(T.yaw) * 0.3 * (call.doorSide || 1)), {
    duration: 0.34, height: 0.9, scaleFrom: 1, scaleTo: 0.3,
    onComplete: () => {
      o.ch.group.visible = false;
      o.ch.group.scale.setScalar(1);
      o.state = 'riding';
      if (ctx.near(T.pos, 2)) ui.sfx('pickup');
    },
  });
}

/** Something drove over the triangle: it falls over (and stays down until the owner picks it up). */
export function knockTri(ctx, c) {
  const p = c.triPos, caps = ctx.capsules;
  for (let i = 0; i < caps.length; i++) {
    const k = caps[i];
    if (k === c.capsule) continue;
    const sx = k.bx - k.ax, sz = k.bz - k.az, l2 = sx * sx + sz * sz || 1e-6;
    const t = clamp(((p.x - k.ax) * sx + (p.z - k.az) * sz) / l2, 0, 1);
    const dx = p.x - (k.ax + sx * t), dz = p.z - (k.az + sz * t);
    if (dx * dx + dz * dz < (k.r + 0.15) * (k.r + 0.15)) {
      c.tri.down = true;
      c.tri.group.userData.setDown?.(true);
      if (ctx.near(c.carPos, 2)) ui.sfx('thud');
      return;
    }
  }
}

/** The nearest tow truck someone is driving, within RESCUE.waveDist of the owner. */
function waveTruck(ctx, c) {
  const o = c.owner, list = ctx.vehicles?.list || [];
  let best = null, bd = RESCUE.waveDist ?? 18;
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (v.id !== 'tow' || !v.driver) continue;
    const d = Math.hypot(v.pos.x - o.w.pos.x, v.pos.z - o.w.pos.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

export function updateOwner(ctx, c, dt, near) {
  const o = c.owner;
  if (!o || o.state === 'riding' || o.state === 'inCar') return;
  if (o.state === 'hopOut' || o.state === 'boarding') { if (near) o.ch.update(dt, 0); return; }
  if (!near && o.state === 'stand') return;
  const idle = o.w.step(dt);
  switch (o.state) {
    case 'placeTri':
      if (idle) {
        putTri(ctx, c);
        o.ch.setCarrying(false);
        o.state = 'toStand';
        o.w.setPath([{ x: c.stand.x, z: c.stand.z }]);
      }
      break;
    case 'toStand': if (idle) o.state = 'stand'; break;
    case 'stand': {
      const T = c.state === 'waiting' ? waveTruck(ctx, c) : null;
      const wave = !!T;
      if (wave !== o.waving) { o.waving = wave; o.ch.setWaving(wave); }
      if (T) o.w.idleYaw = Math.atan2(T.pos.x - o.w.pos.x, T.pos.z - o.w.pos.z);
      else { const b = c.yaw + Math.PI; o.w.idleYaw = b + clamp(angleDiff(b, 0), -0.7, 0.7); }
      break;
    }
    case 'getTri':
      if (idle) {
        holdTri(c);
        o.state = 'toTruck';
        o.w.setPath(o.after.map((p) => ({ x: p.x, z: p.z })));
      }
      break;
    case 'toTruck':
      if (idle) {
        o.state = 'atDoor';
        const T = c.truck;
        if (T) o.w.idleYaw = Math.atan2(T.pos.x - o.w.pos.x, T.pos.z - o.w.pos.z);
      }
      break;
    case 'atDoor':
      if (c.seq && (c.seq.phase === 'raise' || c.seq.phase === 'wait')) boardTruck(ctx, c);
      break;
    default: break;
  }
  phonePose(o, dt, o.state === 'stand' && !o.waving);
}

