// Oil leak fx in WORLD space. A leaking car calls leakDrop() every so often: a drop falls from under its engine and
// lands as a dark spot on the floor, where it stays (the oil never rides along with the car). A moving car leaves a
// trail of drip spots behind it; a parked car keeps hitting the same spot, which spreads into a puddle that stays
// behind when the car drives off. Spots shrink away after a while. Every car shares three InstancedMeshes (falling
// drops, drip spots, puddles), so the whole effect costs 3 draw calls. updateLeaks(dt) must be called once per frame
// (gameplay's car system does it; the model preview calls it from its own loop). No engine import on purpose: the
// models stay usable without the game (preview, icon renderer).
import * as THREE from 'three';
import { Builder, litMat } from './voxel.js';

const MAX_SPOTS = 240;
const MAX_PUDDLES = 24;
const MAX_DROPS = 48;
const FLOOR_Y = 0.042;     // just above the painted floor markings (they top out at ~0.037)
const GRAVITY = 12;
const DROP_R = 0.11;       // radius of the spot one drop leaves
const PUDDLE_AT = 0.2;     // a spot this big is drawn as a puddle
const PUDDLE_R = 0.6;      // a puddle stops growing here (just wide enough to peek out from under a parked car)
const GROW = 1.2;          // area one drop adds to a puddle, in DROP_R^2 units
const MERGE = 0.22;        // a drop landing within (radius + MERGE) of its car's newest spot grows that spot
const SPOT_LIFE = 11;      // seconds a spot stays at full size (every drop that lands on it restarts the clock)
const PUDDLE_LIFE = 16;
const SHRINK = 1.8;        // seconds to shrink away

const OIL = 0x2c343f, SHEEN = 0x52637c, GLINT = 0x8ea4bf, H = 0.005;
// unit radius, flat, scaled in x/z per instance
const dripGeo = (() => {   // one drop: a round spot with a couple of splash dots
  const b = new Builder();
  b.cyl(1, 1, H, OIL, 0, 0, 0, 10);
  b.cyl(0.3, 0.3, H, OIL, 1.12, 0, 0.25, 6);
  b.cyl(0.2, 0.2, H, OIL, -0.85, 0, -0.75, 6);
  b.cyl(0.36, 0.36, 0.003, SHEEN, -0.3, H, -0.28, 8);
  return b.build();
})();
const puddleGeo = (() => {   // organic blob; broad sheen patches spread out so the rim peeking from under a car reads as oil
  const b = new Builder();
  b.cyl(1, 1, H, OIL, 0, 0, 0, 16);
  for (const [x, z, r] of [[0.8, 0.3, 0.55], [-0.84, 0.26, 0.45], [0.18, -0.92, 0.4], [-0.45, -0.75, 0.3], [0.3, 0.9, 0.32]]) {
    b.cyl(r, r, H, OIL, x, 0, z, 10);
  }
  b.cyl(0.2, 0.2, H, OIL, 1.32, 0, -0.2, 7);   // a splash beside it
  b.cyl(0.42, 0.42, 0.003, SHEEN, -0.3, H, -0.3, 10);
  b.cyl(0.26, 0.26, 0.003, SHEEN, 0.78, H, 0.28, 8);
  b.cyl(0.2, 0.2, 0.003, SHEEN, -0.8, H, 0.3, 8);
  b.cyl(0.09, 0.09, 0.004, GLINT, -0.46, H, -0.44, 6);
  return b.build();
})();
const dropGeo = (() => {
  const b = new Builder();
  b.box(0.07, 0.11, 0.07, 0x1d232b, 0, -0.055, 0);
  b.box(0.05, 0.05, 0.05, 0x1d232b, 0, -0.085, 0);
  b.box(0.025, 0.03, 0.02, GLINT, -0.015, -0.02, 0.03);
  return b.build();
})();

let parent = null, dripMesh = null, puddleMesh = null, dropMesh = null;
const spots = [];   // { x, z, y, rot, sx, sz, r, target, age, life, owner }
const drops = [];   // { x, y, z, vy, owner }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
let layer = 0;

function instanced(geo, n) {
  const m = new THREE.InstancedMesh(geo, litMat, n);
  m.castShadow = false;
  m.receiveShadow = true;
  m.frustumCulled = false;
  m.count = 0;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.name = 'oil-leak';
  return m;
}

function ensure(p) {
  if (!dripMesh) {
    dripMesh = instanced(dripGeo, MAX_SPOTS);
    puddleMesh = instanced(puddleGeo, MAX_PUDDLES);
    dropMesh = instanced(dropGeo, MAX_DROPS);
    dropMesh.receiveShadow = false;
  }
  if (parent !== p) {   // first use, or the world was rebuilt: start clean in the new parent
    spots.length = 0; drops.length = 0;
    parent = p;
    p.add(dripMesh, puddleMesh, dropMesh);
  }
}

/**
 * One drop of oil from a leaking car. (x, y, z) in `p`'s space (the car's parent): the point under the engine it
 * falls from. `owner` is any object unique to the car (drops of the same car merge into one puddle).
 */
export function leakDrop(p, x, y, z, owner) {
  if (!p) return;
  ensure(p);
  if (drops.length >= MAX_DROPS) return;
  drops.push({ x, y, z, vy: -0.4, owner });
}

function land(d) {
  let s = null;
  for (let i = spots.length - 1; i >= 0; i--) if (spots[i].owner === d.owner) { s = spots[i]; break; }
  if (s && s.age < s.life && Math.hypot(d.x - s.x, d.z - s.z) < s.target + MERGE) {
    s.target = Math.min(PUDDLE_R, Math.sqrt(s.target * s.target + GROW * DROP_R * DROP_R));
    s.age = 0;
    s.life = s.target >= PUDDLE_AT ? PUDDLE_LIFE : SPOT_LIFE;
    return;
  }
  if (spots.length >= MAX_SPOTS) spots.shift();   // oldest goes first
  layer = (layer + 1) % 12;
  spots.push({
    x: d.x, z: d.z, y: FLOOR_Y + layer * 0.0007, rot: Math.random() * Math.PI * 2,
    sx: 0.85 + Math.random() * 0.3, sz: 0.85 + Math.random() * 0.3,
    r: 0, target: DROP_R * (0.75 + Math.random() * 0.5), age: 0, life: SPOT_LIFE, owner: d.owner,
  });
}

export function updateLeaks(dt) {
  if (!dripMesh || (!spots.length && !drops.length && !dripMesh.count && !puddleMesh.count && !dropMesh.count)) return;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.vy -= GRAVITY * dt;
    d.y += d.vy * dt;
    if (d.y <= FLOOR_Y) { drops.splice(i, 1); land(d); }
  }
  const spread = 1 - Math.exp(-9 * dt);
  let nd = 0, np = 0;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    s.age += dt;
    if (s.age >= s.life + SHRINK) { spots.splice(i--, 1); continue; }
    s.r += (s.target - s.r) * spread;
    const k = s.age > s.life ? 1 - (s.age - s.life) / SHRINK : 1;
    const r = Math.max(0.001, s.r * k * (2 - k));   // ease-out shrink
    _q.setFromAxisAngle(_up, s.rot);
    _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(r * s.sx, 1, r * s.sz));
    if (s.target >= PUDDLE_AT && np < MAX_PUDDLES) puddleMesh.setMatrixAt(np++, _m);
    else dripMesh.setMatrixAt(nd++, _m);
  }
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    const st = 1 + Math.min(0.8, -d.vy * 0.12);   // stretch while falling
    _q.identity();
    _m.compose(_p.set(d.x, d.y, d.z), _q, _s.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st)));
    dropMesh.setMatrixAt(i, _m);
  }
  dripMesh.count = nd;
  puddleMesh.count = np;
  dropMesh.count = drops.length;
  dripMesh.instanceMatrix.needsUpdate = true;
  puddleMesh.instanceMatrix.needsUpdate = true;
  dropMesh.instanceMatrix.needsUpdate = true;
}
