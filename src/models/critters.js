// Critters. The seagull: perched (looks about, preens, pecks), takes off (hop, hard wing beats, climbs), flies a
// circuit, glides in to land where it sat. Chunky voxel family like everything else; geometry shared by all gulls.
// The group origin is the perch; the bird itself moves in a child, so gameplay can place `group` and forget it.
import * as THREE from 'three';
import { Builder, litMat, memo } from './voxel.js';

const WHITE = 0xf4f1ea, GREY = 0xaab4bb, GREY_D = 0x7d8993, BLACK = 0x2b2f36, BEAK = 0xf6c453, ORANGE = 0xee8c3a, RED = 0xe5484d;
const cache = new Map();
const R90 = Math.PI / 2;
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

// body: z forward. total ~0.62 long incl. tail and beak, 0.36 tall when perched on its legs
function bodyGeo() {
  return memo(cache, 'body', () => {
    const b = new Builder();
    b.box(0.2, 0.17, 0.36, WHITE, 0, 0, 0);                    // torso
    b.box(0.17, 0.12, 0.14, WHITE, 0, 0.0, 0.2);               // chest
    b.box(0.18, 0.045, 0.34, GREY, 0, 0.17, -0.01);            // grey mantle on the back
    b.box(0.14, 0.05, 0.16, WHITE, 0, 0.03, -0.26);            // tail base
    b.box(0.14, 0.02, 0.1, BLACK, 0, 0.065, -0.34);            // black tail band
    b.box(0.14, 0.02, 0.06, WHITE, 0, 0.065, -0.4);
    // head + neck
    b.box(0.1, 0.14, 0.1, WHITE, 0, 0.14, 0.2);                 // neck
    b.box(0.13, 0.12, 0.14, WHITE, 0, 0.25, 0.25);              // head
    b.box(0.045, 0.045, 0.14, BEAK, 0, 0.27, 0.38);             // beak
    b.box(0.048, 0.03, 0.04, BEAK, 0, 0.255, 0.43);
    b.box(0.052, 0.02, 0.03, RED, 0, 0.268, 0.4);               // red spot
    b.box(0.015, 0.025, 0.02, BLACK, -0.067, 0.32, 0.3);        // eyes
    b.box(0.015, 0.025, 0.02, BLACK, 0.067, 0.32, 0.3);
    return b.build();
  });
}
// wing, root at the shoulder, extends along +x (left wing is the right one mirrored through scale.x = -1)
function wingGeo(outer) {
  return memo(cache, 'wing' + outer, () => {
    const b = new Builder();
    if (!outer) {
      b.box(0.34, 0.035, 0.26, WHITE, 0.17, 0, 0);
      b.box(0.34, 0.02, 0.19, GREY, 0.17, 0.034, -0.02);
    } else {
      b.box(0.34, 0.03, 0.2, WHITE, 0.17, 0, 0);
      b.box(0.34, 0.018, 0.14, GREY, 0.17, 0.03, -0.01);
      b.box(0.14, 0.032, 0.17, BLACK, 0.27, 0.0, -0.02);        // black wing tips
      b.box(0.1, 0.02, 0.1, WHITE, 0.3, 0.032, -0.04);          // white mirror
    }
    return b.build();
  });
}
function legGeo() {
  return memo(cache, 'leg', () => {
    const b = new Builder();
    b.box(0.03, 0.17, 0.03, ORANGE, 0, 0, 0);
    b.box(0.08, 0.025, 0.1, ORANGE, 0, 0, 0.03);
    return b.build();
  });
}
const mk = (g) => { const m = new THREE.Mesh(g, litMat); m.castShadow = true; return m; };

/** `opts.autoLand` (default true): a gull that was sent flying comes back by itself after 6-11 s if nobody calls land().
 *  update(dt) must be called every frame (cheap; call it only for gulls near the camera).
 *  group.rotation.y is the perch heading; takeOff({ away: Vector3 }) is optional: a flight direction hint (xz) so
 *  the gull flies off away from whoever scared it. */
export function createSeagull(opts = {}) {
  const autoLand = opts.autoLand !== false;
  const group = new THREE.Group();
  const bird = new THREE.Group();                      // everything that moves
  group.add(bird);
  const rig = new THREE.Group();                       // pitch / roll / yaw on top of the position
  bird.add(rig);
  const body = new THREE.Group();
  body.position.y = 0.17;                              // belly height when perched (legs below)
  rig.add(body);
  body.add(mk(bodyGeo()));
  const head = body;                                   // the head is part of the body mesh; we nod the whole front a bit
  const wingL = new THREE.Group(), wingR = new THREE.Group();
  const outerL = new THREE.Group(), outerR = new THREE.Group();
  for (const [w, o, sx] of [[wingR, outerR, 1], [wingL, outerL, -1]]) {
    w.position.set(sx * 0.09, 0.14, 0.06);
    w.scale.x = sx;
    w.add(mk(wingGeo(false)));
    o.position.set(0.34, 0, 0);
    o.add(mk(wingGeo(true)));
    w.add(o);
    body.add(w);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const l = new THREE.Group();
    l.position.set(sx * 0.055, -0.0, 0.02);
    const m = mk(legGeo());
    m.position.y = -0.17;
    l.add(m);
    body.add(l);
    legs.push(l);
  }

  let state = 'perched';                // perched | takeoff | fly | landing
  let t = Math.random() * 10, st = 0;   // clock, time in state
  let flap = 0;                         // wing phase
  let peck = 0, look = 0, lookT = 2 + Math.random() * 3, lookTarget = 0, preen = 0, preenT = 4 + Math.random() * 6;
  // flight
  let cx = 0, cz = 0, r = 4, ang0 = 0, ang = 0, dir = 1, alt = 3, flown = 0, loopTime = 8;
  const from = new THREE.Vector3();
  let landDur = 2, yawFly = 0, yawPerch = 0;
  const self = { group, flying: false, update, takeOff, land, get state() { return state; } };

  const wings = [{ w: wingR, o: outerR, s: 1 }, { w: wingL, o: outerL, s: -1 }];
  for (const { w, o } of wings) { w.rotation.order = 'XZY'; o.rotation.order = 'XZY'; }
  /** fold 0 spread .. 1 folded along the flank; beat = raise (+) / lower (-) of the whole wing; bend = outer part. */
  function pose(fold, beat = 0, bend = 0) {
    for (const { w, o, s } of wings) {      // the left wing is the mirrored right one, so its angles flip sign
      w.rotation.z = s * beat * (1 - fold);
      w.rotation.y = s * 1.45 * fold;                 // folded: the wing swings back along the flank
      o.rotation.z = s * bend * (1 - fold);
      o.rotation.y = s * -2.75 * fold;               // and its tip folds forward again over it (Z-fold)
      o.position.y = 0.04 * fold;
    }
  }
  pose(1);

  function takeOff(hint) {
    if (state !== 'perched' && state !== 'landing') return;
    yawPerch = rig.rotation.y;
    from.set(bird.position.x, bird.position.y, bird.position.z);
    state = 'takeoff'; st = 0; self.flying = true;
    r = 3.2 + Math.random() * 2.2;
    dir = Math.random() < 0.5 ? 1 : -1;
    alt = 2.6 + Math.random() * 1.6;
    loopTime = 6 + Math.random() * 5;
    // circuit centre: perpendicular-ish to the perch, away from the hint if given
    let a = Math.random() * Math.PI * 2;
    if (hint && Number.isFinite(hint.x) && Number.isFinite(hint.z)) {
      // hint = direction from the scary thing to the gull (world); local ~ same unless the perch is rotated
      a = Math.atan2(hint.x, hint.z) + (Math.random() - 0.5) * 1.2;
    }
    cx = Math.sin(a) * r; cz = Math.cos(a) * r;
    ang0 = Math.atan2(-cx, -cz);       // the angle at which the circle passes through the perch
    ang = ang0; flown = 0;
  }
  let wantLand = false;
  function land() {
    if (state === 'fly') { state = 'landing'; beginLanding(); } else if (state === 'takeoff') wantLand = true;
  }
  function beginLanding() {
    from.copy(bird.position);
    st = 0;
    landDur = 1.5 + Math.min(1.5, Math.hypot(from.x, from.z) * 0.25);
  }

  const circle = (a, out) => { out.x = cx + Math.sin(a) * r; out.z = cz + Math.cos(a) * r; };
  const tmp = { x: 0, z: 0 };

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    t += dt; st += dt;
    if (state === 'perched') {
      bird.position.set(0, 0, 0);
      rig.rotation.set(0, rig.rotation.y, 0);
      // idle: look left / right, occasional peck and preen
      lookT -= dt;
      if (lookT <= 0) { lookT = 1.5 + Math.random() * 3.5; lookTarget = (Math.random() - 0.5) * 1.2; if (Math.random() < 0.3) peck = 0.001; }
      look += (lookTarget - look) * Math.min(1, dt * 6);
      preenT -= dt;
      if (preenT <= 0) { preenT = 6 + Math.random() * 8; preen = 0.001; }
      if (peck > 0) { peck += dt * 3.5; if (peck >= 1) peck = 0; }
      if (preen > 0) { preen += dt * 0.7; if (preen >= 1) preen = 0; }
      const pk = peck > 0 ? Math.sin(peck * Math.PI) : 0;
      const pr = preen > 0 ? Math.sin(preen * Math.PI) : 0;
      body.position.y = 0.17;
      body.rotation.set(pk * 0.5 + pr * 0.35 + Math.sin(t * 1.7) * 0.015, look * 0.4 + pr * 0.4 * Math.sin(t * 9) * 0.1, 0);
      pose(1);
      legs[0].rotation.x = legs[1].rotation.x = 0; legs[0].visible = legs[1].visible = true;
      legs[0].position.y = legs[1].position.y = 0;
      return;
    }
    if (state === 'takeoff') {
      // 0-0.3 s crouch, 0.3-0.5 s jump with wings opening, then hard beats climbing along the circle's first arc
      const k = st;
      flap += dt * (k < 0.3 ? 4 : 22);
      const crouch = k < 0.3 ? smooth(k / 0.3) : 0;
      const open = smooth((k - 0.2) / 0.4);
      pose(1 - open, k < 0.3 ? 0 : Math.sin(flap) * 0.9, 0);
      body.position.y = 0.17 - crouch * 0.05;
      body.rotation.set(-crouch * -0.1 - open * 0.45, 0, 0);
      const lift = smooth((k - 0.3) / 1.3);
      circle(ang, tmp);
      const prog = smooth(k / 1.6);
      bird.position.x = tmp.x * prog;
      bird.position.z = tmp.z * prog;
      bird.position.y = lift * alt * 0.7 + (k > 0.3 ? Math.sin((k - 0.3) * 7) * 0.05 : 0);
      ang += dir * dt * (1.2 + 1.6 * lift) / r * 2.2;
      faceTravel(dt, 6);
      legsTuck(smooth((k - 0.35) / 0.4));
      if (k >= 1.6) { state = 'fly'; st = 0; }
      return;
    }
    if (state === 'fly') {
      flown += dt;
      // flap-flap-glide: beat for ~1.1 s, hold wings out for ~0.8 s
      const cyc = (st % 1.9);
      const gliding = cyc > 1.1;
      flap += dt * (gliding ? 0 : 14);
      const beat = gliding ? Math.sin(t * 1.3) * 0.08 : Math.sin(flap) * 0.65;
      pose(0, beat, -beat * 0.5);
      const speed = 5.2;
      ang += dir * (speed / r) * dt;
      circle(ang, tmp);
      bird.position.x = tmp.x; bird.position.z = tmp.z;
      bird.position.y = alt + Math.sin(st * 0.9) * 0.4 + (gliding ? -0.02 : 0.03);
      faceTravel(dt, 8);
      body.rotation.x = gliding ? 0.06 : -0.08;
      body.rotation.z = -dir * 0.28;      // banking into the turn
      body.position.y = 0.17;
      legsTuck(1);
      if (wantLand || (autoLand && flown > loopTime)) { wantLand = false; state = 'landing'; beginLanding(); }
      return;
    }
    if (state === 'landing') {
      const k = Math.min(1, st / landDur);
      const e = smooth(k);
      // glide in: horizontally ease to the perch, descend on a shallow curve, flare at the end
      bird.position.x = from.x * (1 - e);
      bird.position.z = from.z * (1 - e);
      bird.position.y = from.y * (1 - Math.pow(k, 1.6));
      const flare = smooth((k - 0.6) / 0.4);
      flap += dt * (8 + 16 * flare);
      const beat = Math.sin(flap) * (0.3 + 0.55 * flare);
      pose(smooth((k - 0.86) / 0.14), beat, -beat * 0.4);
      // nose up in the flare, face the perch heading at the end
      faceHeading(dt, k < 0.55 ? 6 : 3, k);
      body.rotation.x = -0.15 - flare * 0.55 * (1 - smooth((k - 0.9) / 0.1));
      body.rotation.z *= 0.9;
      legsTuck(1 - smooth((k - 0.45) / 0.3));
      if (k >= 1) { state = 'perched'; self.flying = false; st = 0; wantLand = false; rig.rotation.y = yawPerch; bird.position.set(0, 0, 0); lookT = 1.2; }
      return;
    }
  }
  function faceTravel(dt, rate) {
    // heading follows the tangent of the circle: d/dang of (sin, cos) = (cos, -sin) times dir
    const hx = Math.cos(ang) * dir, hz = -Math.sin(ang) * dir;
    const target = Math.atan2(hx, hz);
    let d = target - rig.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    rig.rotation.y += d * Math.min(1, dt * rate);
  }
  function faceHeading(dt, rate, k) {
    // turn toward the direction of travel (towards the perch) early on, then to the perch heading
    let target;
    if (k < 0.75) target = Math.atan2(-from.x, -from.z); else target = yawPerch;
    let d = target - rig.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    rig.rotation.y += d * Math.min(1, dt * rate);
  }
  function legsTuck(k) {                  // 0 hanging (landing gear) .. 1 tucked up under the belly
    for (const l of legs) { l.rotation.x = -k * 1.1; l.position.y = k * 0.1; l.visible = k < 0.98; }
    if (k <= 0) for (const l of legs) { l.rotation.x = 0.3 * Math.sin(t * 0); }
  }
  void head; void R90;
  update(0.016);
  return self;
}
