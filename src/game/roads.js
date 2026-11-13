// Road network for AI driving (TOWN.md 4.5 point 8). A directed graph over the town's paved network, built from
// TOWN in config.town.js. The level 3 tow driver (dispatcher.js) drives with it; ambient traffic can use it too.
//
//   lanes   directed straight centre lines: the four one-way ring roads in their kerb-side lane (Harbor St east,
//           East Ave north, Main St west, West Ave south), the two-way alleys + back lane (one lane each way on the
//           centre line), the tow yard: in up the paved strip beside the garage entry (x -13.6) and right into the
//           tow drop zone (heading east, RESCUE.drop.pose), out along the apron (x -14) to Harbor St.
//   turns   smooth arcs (radius TURN_R, shrunk to fit the lane ends, never below MIN_R) wherever a lane can turn onto
//           another one in its travel direction; computed from the lane geometry, so the one-way rules come for free.
//   gating  lanes marked `gate` (alleys, back lane) are swept with a truck-sized box against ctx.obstacles when the
//           network is built for a world: bins and crates there (2026-11-13: all three) take them out of the graph.
//
// getRoads(ctx) -> roads (one per world, cached on ctx.roads):
//   route(from, to, opts) -> { pts: [{ x, z, h, v, s }], length } | null
//       A dense polyline (every STEP m) for a vehicle's REFERENCE POINT (its rear axle: the point that moves along
//       its heading). It leaves `from` heading forward (optional straight `lead`), merges into the network with an
//       S-curve, follows lanes and turn arcs, and arrives at `to` on its heading (S-curve out of the lane if `to` is
//       beside it, optional straight `tail`). h = heading (yaw), v = suggested speed (slower in arcs, braking to 0
//       at the end), s = distance along. opts: { lead, tail, speed, corner, slow }.
//   sCurve(from, lateral, opts) / line(...) / finish(pts): building blocks for manoeuvres (dispatcher kerb moves).
//   lanes, turns, show(on | route), check(route, opts) (footprint sweep against ctx.obstacles: min clearance).
// PathFollower: pure-pursuit steering on the reference point (car-like turning radius, steering rate limit, works in
// reverse), smooth accelerate / brake, exact stop at the end of the path.
// Debug: __game.roads (show(true) draws every lane + turn on the ground, show(route) one route, show(false) off).
import * as THREE from 'three';
import { TOWN, RESCUE } from '../config.js';
import { angleDiff, clamp } from './util.js';
import { registerSystem } from './registry.js';

export const STEP = 0.25;              // polyline spacing (m)
export const TURN_R = 4.0;             // preferred radius of a turn between lanes (reference point = rear axle)
export const MIN_R = 2.6;              // tightest arc a turn may use (truck: 3.6 m long, ~2.2 m wheelbase)
const MERGE_R = 4.5;                   // S-curves into / out of a lane
const TIGHT_R = 3.0;                   // ... when there is no room for the normal one before a junction
const A_PROFILE = 2.2;                 // m/s^2 of braking the speed profile plans with (comfortable)
const GATE_HALF = 0.85 + 0.2;          // half width of the sweep that gates a lane (truck half width + margin)

const D = RESCUE.dispatcher;

// ------------------------------------------------------------------ geometry helpers
/** Unit forward vector of a heading (yaw = atan2(dx, dz)). */
const fwdX = (h) => Math.sin(h), fwdZ = (h) => Math.cos(h);
/** Left of a heading (yaw 0 = +z -> left = +x). Positive curvature turns left. */
const leftX = (h) => Math.cos(h), leftZ = (h) => -Math.sin(h);

/** Append points of a straight run (excludes the start point) to out. Returns the end pose. back = reversing. */
function runLine(out, p, len, v, back = false) {
  const n = Math.max(1, Math.round(len / STEP));
  const d = (back ? -len : len) / n, fx = fwdX(p.h), fz = fwdZ(p.h);
  let { x, z } = p;
  for (let i = 0; i < n; i++) { x += fx * d; z += fz * d; out.push({ x, z, h: p.h, v }); }
  return { x, z, h: p.h };
}
/**
 * Append points of an arc: the body heading changes by k (1/m, + = left) per metre travelled, len metres.
 * back = reversing (the reference point moves backwards along the heading). Returns the end pose.
 */
function runArc(out, p, k, len, v, back = false) {
  const n = Math.max(1, Math.round(len / STEP));
  const d = len / n, sg = back ? -1 : 1;
  let { x, z, h } = p;
  for (let i = 0; i < n; i++) {
    // exact chord of the arc step (midpoint heading)
    const hm = h + k * d / 2;
    const c = Math.abs(k) > 1e-6 ? (2 / k) * Math.sin(k * d / 2) : d;
    x += fwdX(hm) * c * sg; z += fwdZ(hm) * c * sg; h += k * d;
    out.push({ x, z, h, v });
  }
  return { x, z, h };
}
/** S-curve geometry for a sideways shift `lat` (+ = left) with arcs of radius R: { theta, along }. */
function sGeom(lat, R) {
  const a = Math.abs(lat);
  if (a < 1e-3) return { theta: 0, along: 0 };
  const r = Math.max(R, a / 2 + 0.01);
  const theta = Math.acos(clamp(1 - a / (2 * r), -1, 1));
  return { theta, along: 2 * r * Math.sin(theta), r };
}
/** Append an S-curve shifting `lat` sideways (+ = left) from pose p. Returns the end pose. */
function runS(out, p, lat, R, v) {
  const g = sGeom(lat, R);
  if (!g.theta) return p;
  const k = Math.sign(lat) / g.r;
  const q = runArc(out, p, k, g.theta * g.r, v);
  return runArc(out, q, -k, g.theta * g.r, v);
}

// ------------------------------------------------------------------ the network (static, from the config)
const R = TOWN.roads, AL = TOWN.alleys;
/** Kerb-side lane of a one-way road (right of the travel direction). */
function kerbLane(r) {
  const lo = Math.min(...r.lanes), hi = Math.max(...r.lanes);
  // axis x: heading +x has +z on its right; axis z: heading +z has -x on its right
  return r.axis === 'x' ? (r.dir > 0 ? hi : lo) : (r.dir > 0 ? lo : hi);
}
const XMAX = TOWN.bounds.maxX - 1, XMIN = TOWN.bounds.minX + 1;   // tunnels (x beyond +/-61) are left out

function buildLanes() {
  const zH = kerbLane(R.harbor), zM = kerbLane(R.main), xW = kerbLane(R.west), xE = kerbLane(R.east);
  const L = [];
  const add = (id, ax, az, bx, bz, kind, extra = {}) => L.push({ id, a: { x: ax, z: az }, b: { x: bx, z: bz }, kind, ...extra });
  // ring roads (extents run through the junction centres so the turn arcs can be computed from intersections)
  add('harbor', XMIN, zH, XMAX, zH, 'road');
  add('east', xE, zH + 1.6, xE, zM, 'road');      // (starts at the quay kerb: a kerb start can turn straight in)
  add('main', XMAX, zM, XMIN, zM, 'road');
  add('west', xW, zM, xW, zH, 'road');
  // two-way alleys between Harbor St and Main St, and the back lane between them (gated by scenery)
  for (const [id, al] of [['walley', AL.west], ['ealley', AL.east]]) {
    const cx = (al.minX + al.maxX) / 2;
    add(id + 'N', cx, zH, cx, zM, 'alley', { gate: true });
    add(id + 'S', cx, zM, cx, zH, 'alley', { gate: true });
  }
  const bz = (AL.back.minZ + AL.back.maxZ) / 2, bx0 = AL.west.minX - 0.5, bx1 = AL.east.maxX + 0.5;
  add('backE', bx0, bz, bx1, bz, 'alley', { gate: true });
  add('backW', bx1, bz, bx0, bz, 'alley', { gate: true });
  // the tow yard: in from Harbor St up the paved strip west of the garage entry (x -13.6: beside, not on, the
  // customers' driveway at x -12), a right turn into the tow drop zone heading east (RESCUE.drop.pose); out of the
  // shed: straight out of the door, then the apron lane (x -14, clear of the pallets by the alley) south to Harbor St
  const ap = TOWN.towApron, dz = RESCUE.drop.pose?.z ?? RESCUE.drop.z;
  add('drive', -13.6, zH + 1.6, -13.6, ap.minZ + 1.0, 'yard', { turnR: 3.0 });
  add('zone', -14.5, dz, RESCUE.drop.maxX ?? -7.4, dz, 'yard', { turnR: 2.9 });
  add('apron', ap.minX - 0.5, ap.maxZ - 1.4, ap.minX - 0.5, zH, 'yard');
  for (const l of L) {
    const dx = l.b.x - l.a.x, dz = l.b.z - l.a.z;
    l.len = Math.hypot(dx, dz);
    l.h = Math.atan2(dx, dz);
    l.blocked = false;
    l.turns = [];          // outgoing turns, sorted by tS
  }
  return L;
}

/** Turn arcs between every pair of lanes whose lines cross at right angles inside both extents. */
function buildTurns(lanes) {
  const T = [];
  for (const A of lanes) for (const B of lanes) {
    if (A === B) continue;
    const dh = angleDiff(A.h, B.h);
    if (Math.abs(Math.abs(dh) - Math.PI / 2) > 0.05) continue;          // perpendicular lanes only
    // intersection of the two lines (A is axis aligned: one coordinate from each)
    const ax = fwdX(A.h), az = fwdZ(A.h);
    const I = Math.abs(ax) > 0.5 ? { x: B.a.x, z: A.a.z } : { x: A.a.x, z: B.a.z };
    const tI_A = (I.x - A.a.x) * ax + (I.z - A.a.z) * az;
    const bxv = fwdX(B.h), bzv = fwdZ(B.h);
    const tI_B = (I.x - B.a.x) * bxv + (I.z - B.a.z) * bzv;
    if (tI_A < -0.01 || tI_A > A.len + 0.01 || tI_B < -0.01 || tI_B > B.len + 0.01) continue;
    // biggest radius <= TURN_R that keeps the arc's ends inside both lanes
    const r = Math.min(B.turnR ?? TURN_R, tI_A, B.len - tI_B);
    if (r < MIN_R) continue;
    const tS = tI_A - r, tE = tI_B + r;
    const turn = { from: A, to: B, tS, tE, r, k: Math.sign(dh) / r, len: r * Math.PI / 2, id: T.length };
    T.push(turn);
    A.turns.push(turn);
  }
  for (const l of lanes) l.turns.sort((p, q) => p.tS - q.tS);
  return T;
}

/** Point on a lane at distance t. */
const laneAt = (l, t) => ({ x: l.a.x + fwdX(l.h) * t, z: l.a.z + fwdZ(l.h) * t, h: l.h });

/** Does a box swept along lane l (half width hw) hit any obstacle? */
function laneBlocked(l, obstacles, hw) {
  const x0 = Math.min(l.a.x, l.b.x) - hw, x1 = Math.max(l.a.x, l.b.x) + hw;
  const z0 = Math.min(l.a.z, l.b.z) - hw, z1 = Math.max(l.a.z, l.b.z) + hw;
  for (const b of obstacles) if (b.minX < x1 && b.maxX > x0 && b.minZ < z1 && b.maxZ > z0) return true;
  return false;
}

// ------------------------------------------------------------------ routing
const COST = { road: 1, yard: 1, alley: 1.6 };   // alleys only when they save a lot (real drivers keep to the roads)

/**
 * Where a pose can join lane l: going forward `lead` m, then an S-curve onto the lane. Null when it can't.
 * Returns { lane, t (where it is on the lane), lat, lead, along }.
 */
function attachStart(l, p, lead, r = MERGE_R) {
  if (l.blocked || Math.abs(angleDiff(p.h, l.h)) > 0.6) return null;
  const dx = p.x - l.a.x, dz = p.z - l.a.z;
  const lat = dx * leftX(l.h) + dz * leftZ(l.h);          // + = the pose is left of the lane
  if (Math.abs(lat) > 3.5) return null;
  const along = sGeom(-lat, r).along;
  const t = dx * fwdX(l.h) + dz * fwdZ(l.h) + lead + along;
  if (t < 0 || t > l.len) return null;
  return { lane: l, t, lat: -lat, lead, along, r };
}
/**
 * A pose turning straight into a perpendicular yard lane (the garage driveway) without merging into a road first:
 * e.g. a truck on the kerb just west of the driveway pulls out and turns left into it across the street.
 * Returns a start attach with an `arc` ({ k, len }) after `lead` straight metres, or null.
 */
function attachTurn(l, p, lead) {
  if (l.blocked || l.kind === 'alley' || Math.abs(Math.abs(angleDiff(p.h, l.h)) - Math.PI / 2) > 0.15) return null;
  const fx = fwdX(p.h), fz = fwdZ(p.h), lx = fwdX(l.h), lz = fwdZ(l.h);
  // intersection of the pose's heading line with the lane's line
  const den = fx * lz - fz * lx;
  if (Math.abs(den) < 0.5) return null;
  const ax = l.a.x - p.x, az = l.a.z - p.z;
  const tA = (ax * lz - az * lx) / den;                       // ahead of the pose
  const tB = (ax * fz - az * fx) / den;                       // along the lane (from l.a)
  if (tB < -0.01 || tB > l.len) return null;
  // a road takes a wide turn (from the kerb across the junction, e.g. h4 just short of East Ave), the yard its own
  const r = Math.min(l.kind === 'road' ? TURN_R + 0.6 : (l.turnR ?? TURN_R), tA - lead, l.len - tB);
  if (r < MIN_R || tA - r > lead + (l.kind === 'road' ? 1.5 : 3)) return null;   // only right beside the lane
  const dh = angleDiff(p.h, l.h);
  return { lane: l, t: tB + r, lat: 0, lead: tA - r, along: 0, arc: { k: Math.sign(dh) / r, len: r * Math.abs(dh), r } };
}
/** Where a route along lane l leaves it for the goal pose p (S-curve out + `tail` straight). */
function attachGoal(l, p, tail) {
  if (l.blocked || Math.abs(angleDiff(p.h, l.h)) > 0.6) return null;
  const dx = p.x - l.a.x, dz = p.z - l.a.z;
  const lat = dx * leftX(l.h) + dz * leftZ(l.h);
  if (Math.abs(lat) > 3.5) return null;
  const along = sGeom(lat, MERGE_R).along;
  const t = dx * fwdX(l.h) + dz * fwdZ(l.h) - tail - along;
  if (t < 0 || t > l.len) return null;
  return { lane: l, t, lat, tail, along };
}

/**
 * Cheapest lane sequence from start attach s to goal attach g (Dijkstra over turns).
 * Returns [{ lane, t0, t1 } | { turn }] or null.
 */
function search(s, g) {
  // nodes: 'start' and every turn (arriving at turn.to at turn.tE)
  const best = new Map(), prev = new Map();
  const open = [{ key: 'start', lane: s.lane, t: s.t, cost: 0 }];
  best.set('start', 0);
  let goalCost = Infinity, goalFrom = null;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
    const n = open.splice(bi, 1)[0];
    if (n.cost > (best.get(n.key) ?? Infinity) + 1e-9 || n.cost >= goalCost) continue;
    const L = n.lane, w = COST[L.kind] ?? 1;
    if (L === g.lane && g.t >= n.t - 1e-6) {
      const c = n.cost + (g.t - n.t) * w;
      if (c < goalCost) { goalCost = c; goalFrom = n.key; }
    }
    for (const tr of L.turns) {
      if (tr.tS < n.t - 1e-6 || tr.to.blocked) continue;
      const c = n.cost + (tr.tS - n.t) * w + tr.len * w;
      const key = tr.id;
      if (c < (best.get(key) ?? Infinity)) {
        best.set(key, c); prev.set(key, { from: n.key, turn: tr, t0: n.t, lane: L });
        open.push({ key, lane: tr.to, t: tr.tE, cost: c });
      }
    }
  }
  if (goalFrom === null) return null;
  // unwind: lane run to the goal, then back through the turns
  const seq = [];
  let key = goalFrom;
  let lane = g.lane, t1 = g.t;
  while (key !== 'start') {
    const p = prev.get(key);
    seq.unshift({ turn: p.turn }, { lane, t0: p.turn.tE, t1 });
    lane = p.lane; t1 = p.turn.tS; key = p.from;
  }
  seq.unshift({ lane, t0: s.t, t1 });
  return { seq, cost: goalCost };
}

/** Speed profile: braking curve so the vehicle can slow for every arc and stop at the end; adds s. */
export function finish(pts, endV = 0) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    pts[i].s = s;
  }
  if (pts.length) pts[pts.length - 1].v = Math.min(pts[pts.length - 1].v, endV);
  for (let i = pts.length - 2; i >= 0; i--) {
    const ds = pts[i + 1].s - pts[i].s;
    pts[i].v = Math.min(pts[i].v, Math.sqrt(pts[i + 1].v * pts[i + 1].v + 2 * A_PROFILE * ds));
  }
  return { pts, length: s };
}

function cornerV(r, sp) { return Math.min(sp.speed, sp.corner * Math.sqrt(r / TURN_R)); }

/** Build the points of a found lane sequence. */
function emit(from, s, seq, g, to, sp, endV) {
  const pts = [{ x: from.x, z: from.z, h: from.h, v: sp.slow }];
  let p = { x: from.x, z: from.z, h: from.h };
  if (s.lead > 0.01) p = runLine(pts, p, s.lead, sp.slow);
  if (s.arc) p = runArc(pts, p, s.arc.k, s.arc.len, cornerV(s.arc.r, sp));
  else p = runS(pts, p, s.lat, s.r ?? MERGE_R, Math.min(sp.speed, sp.corner));
  for (const e of seq) {
    if (e.turn) { p = runArc(pts, p, e.turn.k, e.turn.len, cornerV(e.turn.r, sp)); continue; }
    const len = e.t1 - e.t0;
    const v = e.lane.kind === 'road' ? sp.speed : e.lane.kind === 'alley' ? Math.min(sp.speed, sp.corner * 1.3) : sp.slow * 1.4;
    // snap onto the lane (removes the tiny drift of the arc maths) and run along it
    const q = laneAt(e.lane, e.t0);
    p = { x: q.x, z: q.z, h: e.lane.h };
    if (len > 0.01) p = runLine(pts, p, len, v);
  }
  p = runS(pts, p, g.lat, MERGE_R, Math.min(sp.speed, sp.corner));
  if (g.tail > 0.01) p = runLine(pts, p, g.tail, sp.slow);
  // land exactly on the goal pose (the S-curve maths ends within millimetres of it)
  const last = pts[pts.length - 1];
  last.x = to.x; last.z = to.z; last.h = to.h;
  return finish(pts, endV);
}

const SPEEDS = () => ({ speed: D.speed, corner: D.cornerSpeed, slow: D.kerbSpeed });

/**
 * Route between two reference-point poses { x, z, h }: { pts, length } or null.
 * opts: { lead: straight metres before merging, tail: straight metres at the end, speed / corner / slow (m/s),
 *   endV: speed at the end (0 = stop), noTurn: no direct turn from the start pose into a lane, mergeR: radius of the
 *   start's S-curve into the network }.
 */
function route(net, from, to, opts = {}) {
  const sp = { ...SPEEDS(), ...opts };
  const lead = opts.lead ?? 0, tail = opts.tail ?? 0;
  let best = null;
  for (const ls of net.lanes) {
    // merge with the normal S-curve (or opts.mergeR), a tighter one when a junction comes up too soon (h6, just
    // short of Harbor St), or turn straight into a perpendicular lane from the kerb (h4 / the yard)
    const tight = attachStart(ls, from, lead, TIGHT_R);
    if (tight) tight.extra = 1.5;
    for (const s of [attachStart(ls, from, lead, opts.mergeR ?? MERGE_R), tight, opts.noTurn ? null : attachTurn(ls, from, lead)]) {
      if (!s) continue;
      for (const lg of net.lanes) {
        const g = attachGoal(lg, to, tail);
        if (!g) continue;
        const r = search(s, g);
        if (!r) continue;
        const cost = r.cost + s.lead + s.along + (s.arc ? s.arc.len : 0) + g.along + tail + (s.extra || 0);
        if (!best || cost < best.cost) best = { cost, s, g, seq: r.seq };
      }
    }
  }
  if (!best) return null;
  const out = emit(from, best.s, best.seq, best.g, to, sp, opts.endV ?? 0);
  out.direct = !!best.s.arc;
  out.via = best.seq.map((e) => (e.turn ? `(${e.turn.from.id}>${e.turn.to.id})` : `${e.lane.id}[${e.t0.toFixed(1)}..${e.t1.toFixed(1)}]`)).join(' ');
  out.via = `${best.s.arc ? 'turn' : 'S' + best.s.lat.toFixed(2)} ${out.via} S${best.g.lat.toFixed(2)}`;
  return out;
}

/** Forward S-curve manoeuvre from pose p: optional straight `pre`, shift `lat` (+ = left), straight `post`. */
function sCurve(p, lat, { pre = 0, post = 0, r = MERGE_R, v = D.kerbSpeed } = {}) {
  const pts = [{ x: p.x, z: p.z, h: p.h, v }];
  let q = { x: p.x, z: p.z, h: p.h };
  if (pre > 0.01) q = runLine(pts, q, pre, v);
  q = runS(pts, q, lat, r, v);
  if (post > 0.01) q = runLine(pts, q, post, v);
  return finish(pts);
}
/** The same path driven backwards (body heading kept): for reversing along a forward-built shape. */
export function reversed(path) {
  const pts = path.pts.slice().reverse().map((p) => ({ x: p.x, z: p.z, h: p.h, v: p.v }));
  for (const p of pts) p.v = D.kerbSpeed;
  return finish(pts);
}
/**
 * A one-direction manoeuvre for a reference point from pose `from` ({ x, z, h }): steps
 * ['line', metres] | ['arc', radius, turn (rad, + = the heading turns left)] | ['s', sideways metres (+ = left), radius].
 * back = the whole leg is driven in reverse (the heading still turns by `turn`). Returns { pts, length, end }.
 */
export function manoeuvre(from, steps, { back = false, v = D.kerbSpeed } = {}) {
  const pts = [{ x: from.x, z: from.z, h: from.h, v }];
  let p = { x: from.x, z: from.z, h: from.h };
  for (const [kind, a, b] of steps) {
    if (kind === 'line') { if (a > 0.005) p = runLine(pts, p, a, v, back); }
    else if (kind === 'arc') { if (Math.abs(b) > 1e-4) p = runArc(pts, p, Math.sign(b) / a, a * Math.abs(b), v, back); }
    else if (kind === 's') {
      const g = sGeom(a, b ?? MERGE_R);
      if (g.theta) { const k = Math.sign(a) * (back ? -1 : 1) / g.r; p = runArc(pts, p, k, g.theta * g.r, v, back); p = runArc(pts, p, -k, g.theta * g.r, v, back); }
    }
  }
  const out = finish(pts);
  out.end = { x: p.x, z: p.z, h: p.h };
  return out;
}

/**
 * Script step (vehicles.js `{ kind: 'fn' }`) that plays a manoeuvre path back EXACTLY (no steering error: the body
 * sits on the path, heading = path heading), with a smooth speed ramp and a stop at the end. For tight yard moves
 * (backing into the shed). opts: { dir (1 / -1), axle (reference -> vehicle centre), vmax, accel, decel,
 * blocked(x, z) -> true holds the vehicle (someone in the way), onDone(vehicle) }.
 */
export function trackStep(path, { dir = 1, axle = 0.92, vmax = D.kerbSpeed, accel = 1.8, decel = 1.6, blocked = null, onDone = null } = {}) {
  const pts = path.pts, n = pts.length;
  let s = 0, v = 0, j = 0;
  return {
    kind: 'fn',
    fn(dt, veh) {
      const len = path.length, rem = len - s;
      // leading end of the vehicle a little ahead along the path: hold while someone stands there
      let hold = false;
      if (blocked) {
        const k = Math.min(n - 1, j + 6), q = pts[k], lead = dir > 0 ? axle + 1.9 : axle - 2.0;
        hold = blocked(q.x + fwdX(q.h) * lead, q.z + fwdZ(q.h) * lead);
      }
      const vt = hold ? 0 : Math.min(vmax, Math.sqrt(2 * decel * Math.max(0, rem)) + 0.06);
      v += clamp(vt - v, -(hold ? 6 : decel * 1.5) * dt, accel * dt);
      if (v < 0) v = 0;
      s = Math.min(len, s + v * dt);
      while (j < n - 2 && pts[j + 1].s < s) j++;
      const a = pts[j], b = pts[j + 1] || a, seg = (b.s - a.s) || 1, u = clamp((s - a.s) / seg, 0, 1);
      const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u, h = a.h + angleDiff(a.h, b.h) * u;
      veh.yaw = h; veh.pos.x = x + fwdX(h) * axle; veh.pos.z = z + fwdZ(h) * axle;
      veh.speed = v; veh.wheelSpeed = dir * v; veh.vx = 0; veh.vz = 0;
      if (s >= len - 1e-4) { veh.speed = 0; veh.wheelSpeed = 0; onDone?.(veh); return true; }
      return false;
    },
  };
}

/** One path after another (the second starts where the first ends); speeds re-planned, ends at endV. */
export function join(a, b, endV = 0) {
  return finish([...a.pts.map((p) => ({ ...p })), ...b.pts.slice(1).map((p) => ({ ...p }))], endV);
}
/** Shift `lat` metres sideways geometry (for planning manoeuvres): { along }. */
export function sAlong(lat, r = MERGE_R) { return sGeom(lat, r).along; }

// ------------------------------------------------------------------ pure-pursuit follower
/**
 * Drives a reference point (rear axle) along a route like a car: the heading only changes with distance travelled
 * (curvature limited by minR, steering rate limited), smooth acceleration, braking for the profile, stop at the end.
 * dir = 1 forward, -1 reverse (the path's h is the body heading in both cases).
 */
export class PathFollower {
  constructor({ minR = MIN_R - 0.35, steerRate = 1.5, accel = 2.4, brake = 4.0, hardBrake = 9 } = {}) {
    this.minR = minR; this.steerRate = steerRate; this.accel = accel; this.brake = brake; this.hardBrake = hardBrake;
    this.path = null; this.dir = 1; this.i = 0; this.s = 0; this.k = 0; this.done = true;
  }
  start(path, dir = 1) {
    this.path = path; this.dir = dir; this.i = 0; this.s = 0; this.done = !path || path.pts.length < 2;
    this.err = 0; this.maxErr = 0;
  }
  get remaining() { return this.path ? Math.max(0, this.path.length - this.s) : 0; }
  /** Point at distance s along the path (clamped; beyond the end: extended along the travel direction). */
  pointAt(s, out) {
    const pts = this.path.pts, n = pts.length;
    if (s >= this.path.length) {
      const e = pts[n - 1], th = e.h + (this.dir < 0 ? Math.PI : 0), d = s - this.path.length;
      out.x = e.x + fwdX(th) * d; out.z = e.z + fwdZ(th) * d; out.h = e.h; out.v = 0;
      return out;
    }
    let j = this.i;
    while (j < n - 2 && pts[j + 1].s < s) j++;
    while (j > 0 && pts[j].s > s) j--;
    const a = pts[j], b = pts[j + 1] || a, seg = (b.s - a.s) || 1, u = clamp((s - a.s) / seg, 0, 1);
    out.x = a.x + (b.x - a.x) * u; out.z = a.z + (b.z - a.z) * u;
    out.h = a.h + angleDiff(a.h, b.h) * u; out.v = a.v + (b.v - a.v) * u;
    return out;
  }
  /** Project the body onto the path (monotonic progress). */
  project(body) {
    const pts = this.path.pts, n = pts.length;
    for (let guard = 0; guard < 40 && this.i < n - 1; guard++) {
      const a = pts[this.i], b = pts[this.i + 1];
      const sx = b.x - a.x, sz = b.z - a.z, l2 = sx * sx + sz * sz || 1e-9;
      const u = ((body.x - a.x) * sx + (body.z - a.z) * sz) / l2;
      if (u > 1 && this.i < n - 2) { this.i++; continue; }
      this.s = Math.max(this.s, a.s + clamp(u, 0, 1.5) * Math.sqrt(l2));
      break;
    }
  }
  /** One step. body = { x, z, yaw, v (>= 0) } of the reference point; cap = max speed (obstacles). True = done. */
  step(dt, body, cap = Infinity) {
    if (this.done || !this.path) { body.v = Math.max(0, body.v - this.hardBrake * dt); return true; }
    this.project(body);
    const C = this.pointAt(this.s, _p);
    this.err = Math.hypot(body.x - C.x, body.z - C.z);          // cross-track error (debug / tuning)
    this.maxErr = Math.max(this.maxErr || 0, this.err);
    const rem = this.path.length - this.s;
    if (rem < 0.04 || (rem < 0.25 && body.v < 0.15 && cap > 0.1)) { this.done = true; body.v = 0; return true; }
    // speed: the profile a little ahead (so braking starts early enough), the final stop, the obstacle cap
    const P = this.pointAt(this.s + body.v * 0.35, _p);
    let vt = Math.min(P.v, Math.sqrt(2 * 1.6 * rem) + 0.12, cap);
    if (this.dir < 0) vt = Math.min(vt, D.kerbSpeed);
    const dv = vt - body.v;
    body.v = clamp(body.v + clamp(dv, -(cap < body.v ? this.hardBrake : this.brake) * dt, this.accel * dt), 0, 30);
    // steering: pure pursuit towards a look-ahead point; curvature limited and rate limited (no snapping)
    const ld = this.dir > 0 ? clamp(0.9 + body.v * 0.33, 1.3, 3.0) : clamp(0.9 + body.v * 0.3, 1.1, 1.8);
    const T = this.pointAt(this.s + ld, _t);
    const th = body.yaw + (this.dir < 0 ? Math.PI : 0);
    const dx = T.x - body.x, dz = T.z - body.z, dd = Math.hypot(dx, dz) || 1e-6;
    const alpha = angleDiff(th, Math.atan2(dx, dz));
    const kmax = 1 / this.minR;
    const kc = clamp(2 * Math.sin(alpha) / Math.max(dd, 0.5), -kmax, kmax);
    const rate = this.steerRate * dt * (1 + body.v * 0.15);
    this.k += clamp(kc - this.k, -rate, rate);
    const ds = body.v * dt;
    const dth = this.k * ds;
    const thm = th + dth / 2;
    body.x += fwdX(thm) * ds; body.z += fwdZ(thm) * ds;
    body.yaw += dth;
    if (body.yaw > Math.PI) body.yaw -= Math.PI * 2; else if (body.yaw <= -Math.PI) body.yaw += Math.PI * 2;
    return false;
  }
}
const _p = { x: 0, z: 0, h: 0, v: 0 }, _t = { x: 0, z: 0, h: 0, v: 0 };

// ------------------------------------------------------------------ footprint check (debug / verification)
/** Corners of a w x l rectangle centred `c` metres ahead of reference point (x, z) heading h. */
function rectAt(x, z, h, c, l, w, out) {
  const fx = fwdX(h), fz = fwdZ(h), lx = leftX(h), lz = leftZ(h);
  const cx = x + fx * c, cz = z + fz * c, hl = l / 2, hw = w / 2;
  out[0] = cx + fx * hl + lx * hw; out[1] = cz + fz * hl + lz * hw;
  out[2] = cx + fx * hl - lx * hw; out[3] = cz + fz * hl - lz * hw;
  out[4] = cx - fx * hl - lx * hw; out[5] = cz - fz * hl - lz * hw;
  out[6] = cx - fx * hl + lx * hw; out[7] = cz - fz * hl + lz * hw;
  return out;
}
const segDist = (px, pz, ax, az, bx, bz) => {
  const sx = bx - ax, sz = bz - az, l2 = sx * sx + sz * sz || 1e-9;
  const u = clamp(((px - ax) * sx + (pz - az) * sz) / l2, 0, 1);
  return Math.hypot(px - ax - sx * u, pz - az - sz * u);
};
/** Distance between a rectangle (corners r[8]) and an axis-aligned box; when they overlap: minus the depth. */
function rectBoxDist(r, b) {
  const bx = [b.minX, b.maxX, b.maxX, b.minX], bz = [b.minZ, b.minZ, b.maxZ, b.maxZ];
  // overlap test (SAT on the box axes and the rectangle axes)
  let sep = false;
  const rx0 = Math.min(r[0], r[2], r[4], r[6]), rx1 = Math.max(r[0], r[2], r[4], r[6]);
  const rz0 = Math.min(r[1], r[3], r[5], r[7]), rz1 = Math.max(r[1], r[3], r[5], r[7]);
  if (rx1 < b.minX || rx0 > b.maxX || rz1 < b.minZ || rz0 > b.maxZ) sep = true;
  if (!sep) {
    for (let e = 0; e < 2 && !sep; e++) {
      const ex = r[2 * e + 2] - r[2 * e], ez = r[2 * e + 3] - r[2 * e + 1];
      let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
      for (let i = 0; i < 4; i++) { const d = r[2 * i] * ex + r[2 * i + 1] * ez; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (let i = 0; i < 4; i++) { const d = bx[i] * ex + bz[i] * ez; c0 = Math.min(c0, d); c1 = Math.max(c1, d); }
      if (a1 < c0 || c1 < a0) sep = true;
    }
  }
  if (!sep) {
    // overlapping: how deep (approximately: the rectangle's bounding box into the box, the shallower axis), negative
    const dx = Math.min(rx1, b.maxX) - Math.max(rx0, b.minX), dz = Math.min(rz1, b.maxZ) - Math.max(rz0, b.minZ);
    return -Math.max(0, Math.min(dx, dz));
  }
  let m = Infinity;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    for (let k = 0; k < 4; k++) m = Math.min(m, segDist(r[2 * k], r[2 * k + 1], bx[i], bz[i], bx[j], bz[j]));
    for (let k = 0; k < 4; k++) m = Math.min(m, segDist(bx[k], bz[k], r[2 * i], r[2 * i + 1], r[2 * j], r[2 * j + 1]));
  }
  return m;
}

/** Is box b more than d away from (x, z)? (nearest point of the box, so big boxes like the water count) */
const boxFar = (b, x, z, d) => x < b.minX - d || x > b.maxX + d || z < b.minZ - d || z > b.maxZ + d;

// ------------------------------------------------------------------ per-world instance
/** The road network of this world (built once, cached on ctx.roads). */
export function getRoads(ctx) {
  if (ctx.roads) return ctx.roads;
  const lanes = buildLanes();
  const turns = buildTurns(lanes);
  let gateLen = -1, gateVer = -1;
  /** Gate lanes whose corridor has scenery in it (re-run when the static obstacles change). */
  function gate() {
    if (ctx.obstacles.length === gateLen && ctx.obstaclesVersion === gateVer) return;
    gateLen = ctx.obstacles.length; gateVer = ctx.obstaclesVersion;
    for (const l of lanes) l.blocked = !!l.gate && laneBlocked(l, ctx.obstacles, GATE_HALF);
  }
  let dbg = null;
  const net = {
    lanes, turns,
    /** Route for a reference point (see the header). */
    route(from, to, opts) { gate(); return route(net, from, to, opts); },
    sCurve, reversed, finish, sAlong, join, manoeuvre,
    /**
     * Sweep a vehicle footprint along a route against ctx.obstacles (+ a towed car behind when opts.tow):
     * { min, at, towMin, towAt }. opts: { axle (reference -> centre, m), length, width, hitch (m behind the
     * reference), tow: { ax, lh, length, width } }.
     */
    check(path, opts = {}) {
      const ax = opts.axle ?? 0.92, L = opts.length ?? RESCUE.truck.length, W = opts.width ?? RESCUE.truck.width;
      const r8 = new Array(8);
      let min = Infinity, at = null, towMin = Infinity, towAt = null;
      const tw = opts.tow;
      let rx = null, rz = null;
      for (const p of path.pts) {
        rectAt(p.x, p.z, p.h, ax, L, W, r8);
        for (const b of ctx.obstacles) {
          if (boxFar(b, p.x, p.z, 8)) continue;
          const d = rectBoxDist(r8, b);
          if (d < min) { min = d; at = { x: p.x, z: p.z, box: b }; }
        }
        if (tw) {
          // trailer: front axle on the hitch, rear axle pulled along (as rescue.js tows)
          const fxh = p.x - fwdX(p.h) * (opts.hitch ?? 2.0), fzh = p.z - fwdZ(p.h) * (opts.hitch ?? 2.0);
          if (rx === null) { rx = fxh - fwdX(p.h) * tw.lh; rz = fzh - fwdZ(p.h) * tw.lh; }
          const dx = fxh - rx, dz = fzh - rz, d = Math.hypot(dx, dz) || 1e-6;
          rx = fxh - dx / d * tw.lh; rz = fzh - dz / d * tw.lh;
          const ch = Math.atan2(dx, dz);
          rectAt(fxh, fzh, ch, -tw.ax, tw.length, tw.width, r8);
          for (const b of ctx.obstacles) {
            if (boxFar(b, fxh, fzh, 8)) continue;
            const dd = rectBoxDist(r8, b);
            if (dd < towMin) { towMin = dd; towAt = { x: fxh, z: fzh, box: b }; }
          }
        }
      }
      return { min, at, towMin, towAt };
    },
    /** Debug drawing on the ground: true = the whole network, a route = that route (added), false = off. */
    show(what = true) {
      if (what === false) { if (dbg) { dbg.parent?.remove(dbg); dbg.traverse((o) => o.geometry?.dispose()); dbg = null; } return; }
      gate();
      if (!dbg) { dbg = new THREE.Group(); dbg.name = 'roads-debug'; ctx.root.add(dbg); }
      // flat ribbons (1 px lines vanish from the game camera)
      const line = (pts, color, y = 0.07, w = 0.14) => {
        const pos = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
          const nx = -dz / l * w / 2, nz = dx / l * w / 2;
          pos.push(a.x + nx, y, a.z + nz, b.x + nx, y, b.z + nz, b.x - nx, y, b.z - nz);
          pos.push(a.x + nx, y, a.z + nz, b.x - nx, y, b.z - nz, a.x - nx, y, a.z - nz);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
        m.renderOrder = 20; dbg.add(m);
      };
      if (what === true) {
        for (const l of lanes) {
          line([l.a, l.b], l.blocked ? 0xff3b30 : 0x3b82f6);
          // direction ticks every 4 m
          for (let t = 2; t < l.len; t += 4) {
            const p = laneAt(l, t), q = laneAt(l, t - 0.6);
            line([{ x: q.x + leftX(l.h) * 0.3, z: q.z + leftZ(l.h) * 0.3 }, p, { x: q.x - leftX(l.h) * 0.3, z: q.z - leftZ(l.h) * 0.3 }], l.blocked ? 0xff3b30 : 0x3b82f6);
          }
        }
        for (const tr of turns) {
          if (tr.from.blocked || tr.to.blocked) continue;
          const pts = [laneAt(tr.from, tr.tS)];
          runArc(pts, { ...pts[0], h: tr.from.h }, tr.k, tr.len, 0);
          line(pts, 0x22c55e, 0.075);
        }
      } else if (what && what.pts) {
        line(what.pts, 0xfacc15, 0.08);
        // where it is slow (corner / kerb speed): orange ticks
        for (let i = 0; i < what.pts.length; i += 8) {
          const p = what.pts[i];
          if (p.v < D.speed * 0.6) line([{ x: p.x + leftX(p.h) * 0.25, z: p.z + leftZ(p.h) * 0.25 }, { x: p.x - leftX(p.h) * 0.25, z: p.z - leftZ(p.h) * 0.25 }], 0xf97316, 0.085);
        }
      }
      return dbg.children.length;
    },
  };
  ctx.roads = net;
  return net;
}

// One network per world (ctx.roads) even before anybody routes; __game.roads = the current world's.
registerSystem('roads', (ctx) => getRoads(ctx));
(function installDebug() {
  if (typeof window === 'undefined') return;
  const g = window.__game;
  if (!g) { setTimeout(installDebug, 250); return; }
  if (!Object.getOwnPropertyDescriptor(g, 'roads')) Object.defineProperty(g, 'roads', { configurable: true, get: () => g.world?.roads || null });
})();
