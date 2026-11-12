// Pooled cube particles: poof (cube burst), sparks (fast welding bits) and confetti (floaty multi-colour burst).
// One shared box geometry, one shared material per colour, self-updating through the engine loop.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { onUpdate, scene as gameScene, camera as gameCamera } from '../core/engine.js';

const geo = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();
const matFor = (c) => {
  let m = mats.get(c);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); mats.set(c, m); }
  return m;
};

// three thin crossed bars: a glint that reads from any angle
const starGeo = mergeGeometries([new THREE.BoxGeometry(1, 0.16, 0.16), new THREE.BoxGeometry(0.16, 1, 0.16), new THREE.BoxGeometry(0.16, 0.16, 1)]);
const POOL = 220;
const free = [];
const active = [];
for (let i = 0; i < POOL; i++) {
  const m = new THREE.Mesh(geo, matFor(0xffffff));
  m.castShadow = false;
  m.frustumCulled = false;
  free.push({ m, kind: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, age: 0, life: 0.5, s: 0.15, parent: null });
}
let hooked = false;
const hook = () => { if (!hooked) { hooked = true; onUpdate(updateFx); } };

const POOF = 0, SPARK = 1, CONFETTI = 2, DROP = 3, STAR = 4;
const _look = new THREE.Vector3();

export function updateFx(dt) {
  updateSoft(dt);
  updateRain(dt);
  for (let i = active.length - 1; i >= 0; i--) {
    const p = active[i];
    p.age += dt;
    const k = p.age / p.life;
    if (k >= 1) {
      p.parent.remove(p.m);
      active.splice(i, 1);
      free.push(p);
      continue;
    }
    const m = p.m;
    if (p.kind === SPARK) {
      p.vy -= 14 * dt;
      m.position.x += p.vx * dt; m.position.y += p.vy * dt; m.position.z += p.vz * dt;
      if (m.position.y < 0.02 && p.vy < 0) { m.position.y = 0.02; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
      // stretch along the velocity
      _look.set(m.position.x + p.vx, m.position.y + p.vy, m.position.z + p.vz);
      m.lookAt(_look);
      const sp = Math.min(1, Math.hypot(p.vx, p.vy, p.vz) / 6);
      const sc = p.s * (1 - k * 0.6);
      m.scale.set(sc, sc, Math.max(sc, p.s * 4 * sp));
      if (k > 0.45 && p.m.material !== p.cool) p.m.material = p.cool;
    } else if (p.kind === CONFETTI) {
      const drag = Math.exp(-dt * 2.4);
      p.vx *= drag; p.vz *= drag;
      p.vy = Math.max(p.vy * drag - 6 * dt, -1.1);           // terminal velocity: floats down
      m.position.x += (p.vx + Math.sin(p.age * 5 + p.sx) * 0.4) * dt;
      m.position.y = Math.max(0.03, m.position.y + p.vy * dt);
      m.position.z += (p.vz + Math.cos(p.age * 4 + p.sy) * 0.4) * dt;
      m.rotation.x += dt * p.sz; m.rotation.y += dt * 3; m.rotation.z += dt * p.sx;
      const sc = k > 0.8 ? (1 - k) / 0.2 : Math.min(1, p.age * 8);
      m.scale.set(p.s * sc, p.s * 0.18 * sc, p.s * 0.7 * sc);
    } else if (p.kind === DROP) {                                     // splash droplets: ballistic, vanish on landing
      p.vy -= 12 * dt;
      m.position.x += p.vx * dt; m.position.y += p.vy * dt; m.position.z += p.vz * dt;
      if (m.position.y < 0.03 && p.vy < 0) { p.age = p.life; m.position.y = 0.03; }
      m.scale.setScalar(p.s * (1 - k * 0.5));
    } else if (p.kind === STAR) {                                     // sparkle glints: rise, spin, twinkle
      m.position.y += p.vy * dt;
      m.rotation.y += dt * p.sx; m.rotation.x += dt * p.sy;
      m.scale.setScalar(p.s * Math.sin(Math.min(1, k * 1.15) * Math.PI) * (0.75 + 0.25 * Math.sin(p.age * 30 + p.sz)));
    } else {
      p.vy -= 9 * dt;
      m.position.x += p.vx * dt;
      m.position.y = Math.max(0.03, m.position.y + p.vy * dt);
      m.position.z += p.vz * dt;
      m.rotation.x += dt * 8; m.rotation.y += dt * 6;
      const sc = p.s * (k < 0.15 ? 0.6 + (k / 0.15) * 0.4 : 1 - (k - 0.15) / 0.85);
      m.scale.setScalar(Math.max(0.001, sc));
    }
  }
}

function spawn(scene, position, kind) {
  if (!free.length) return null;
  const p = free.pop();
  p.kind = kind;
  if (p.m.geometry !== (kind === STAR ? starGeo : geo)) p.m.geometry = kind === STAR ? starGeo : geo;
  p.age = 0;
  p.m.position.copy(position);
  p.m.rotation.set(0, 0, 0);
  p.parent = scene;
  scene.add(p.m);
  active.push(p);
  return p;
}

export function poof(scene, position, color = 0xffffff) {
  hook();
  const n = 12;
  for (let i = 0; i < n; i++) {
    const p = spawn(scene, position, POOF);
    if (!p) break;
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const sp = 1.8 + Math.random() * 2.2;
    p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 2.5 + Math.random() * 2.5;
    p.life = 0.45 + Math.random() * 0.15;
    p.s = 0.11 + Math.random() * 0.1;
    p.m.material = matFor(i % 4 === 3 ? 0xffffff : color);
    p.m.position.y += 0.25;
    p.m.scale.setScalar(p.s * 0.6);
  }
}

const SPARK_HOT = [0xffffff, 0xfff3b0, 0xffd34d, 0xffb02e];
/** Fast, tiny welding sparks (call repeatedly while wrenching). */
export function sparks(scene, position) {
  hook();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const p = spawn(scene, position, SPARK);
    if (!p) break;
    const a = Math.random() * Math.PI * 2;
    const sp = 2.2 + Math.random() * 3.2;
    p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 1.5 + Math.random() * 3.5;
    p.life = 0.22 + Math.random() * 0.22;
    p.s = 0.025 + Math.random() * 0.025;
    p.m.material = matFor(SPARK_HOT[i % SPARK_HOT.length]);
    p.cool = matFor(i % 2 ? 0xff7a2e : 0xf26b5b);
    p.m.scale.setScalar(p.s);
  }
}

const CONFETTI_COLORS = [0xf26b5b, 0xf6c453, 0x2a9d8f, 0x5aa9e6, 0x9b8fd4, 0xfff6e6, 0x8fd1b0, 0xe98fb0];
/** Celebration burst: big, colourful, floaty. */
export function confetti(scene, position) {
  hook();
  const n = 46;
  for (let i = 0; i < n; i++) {
    const p = spawn(scene, position, CONFETTI);
    if (!p) break;
    const a = Math.random() * Math.PI * 2;
    const sp = 1.2 + Math.random() * 3.2;
    p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 5 + Math.random() * 4.5;
    p.life = 1.6 + Math.random() * 0.9;
    p.s = 0.12 + Math.random() * 0.08;
    p.sx = Math.random() * 6; p.sy = Math.random() * 6; p.sz = 4 + Math.random() * 6;
    p.m.material = matFor(CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
    p.m.position.y += 0.3;
    p.m.scale.setScalar(0.001);
  }
}


// =====================================================================================================
// Harbor Town fx
// =====================================================================================================
// Soft particles (translucent cubes that really fade): their own small pool, each with its own material so opacity
// and colour are per particle. Used by mist, foam, dust and the splash ring.
const SOFT_POOL = 72;
const softFree = [];
const softActive = [];
for (let i = 0; i < SOFT_POOL; i++) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false; m.frustumCulled = false; m.renderOrder = 2;
  softFree.push({ m, mat, kind: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0.5, s: 0.15, grow: 1, op: 0.5, drag: 0, rise: 0, parent: null, fill: 0, spin: 0 });
}
const MIST = 0, FOAM = 1, DUST = 2, RING = 3;
let ringGeo = null;

function softSpawn(scene, pos, kind, hex, op) {
  if (!softFree.length) return null;
  const p = softFree.pop();
  p.kind = kind; p.age = 0; p.op = op; p.parent = scene; p.drag = 0; p.rise = 0; p.grow = 1; p.spin = 0;
  p.mat.color.set(hex);
  p.mat.opacity = op;
  p.m.position.copy(pos);
  p.m.rotation.set(0, Math.random() * 6.28, 0);
  p.m.geometry = kind === RING ? (ringGeo ??= new THREE.RingGeometry(0.55, 1, 20).rotateX(-Math.PI / 2)) : geo;
  scene.add(p.m);
  softActive.push(p);
  return p;
}
function updateSoft(dt) {
  for (let i = softActive.length - 1; i >= 0; i--) {
    const p = softActive[i];
    p.age += dt;
    const k = p.age / p.life;
    if (k >= 1) {
      p.parent.remove(p.m);
      softActive.splice(i, 1);
      softFree.push(p);
      continue;
    }
    const m = p.m;
    const dr = Math.exp(-dt * p.drag);
    p.vx *= dr; p.vy *= dr; p.vz *= dr;
    m.position.x += p.vx * dt; m.position.y += (p.vy + p.rise) * dt; m.position.z += p.vz * dt;
    if (p.kind === RING) {
      const sc = p.s * (0.25 + 0.75 * Math.sqrt(k));
      m.scale.set(sc, 1, sc);
      p.mat.opacity = p.op * (1 - k);
    } else {
      m.rotation.y += dt * p.spin;
      const sc = p.s * (1 + (p.grow - 1) * Math.sqrt(k));
      m.scale.setScalar(sc);
      p.mat.opacity = p.op * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
    }
  }
}

const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();
/** Spray-paint mist in `hex`. Call a few times per frame-ish (20-30 puffs/s) ONLY while a gun is spraying, with `pos`
 *  at the nozzle and `dir` = the way the nozzle points (Vector3 or {x,y,z}; default +z). The cloud flies a short
 *  cone (about 1.1 m) away from the nozzle and thins out, so it is gone ~0.4 s after the last call. */
export function mist(scene, pos, hex = 0xffffff, dir) {
  hook();
  if (dir && Number.isFinite(dir.x)) _dir.set(dir.x, dir.y ?? 0, dir.z).normalize(); else _dir.set(0, 0, 1);
  for (let i = 0; i < 2; i++) {
    const p = softSpawn(scene, pos, MIST, hex, 0.55);
    if (!p) return;
    const sp = 2.6 + Math.random() * 1.4, spread = 0.28;
    p.vx = (_dir.x + (Math.random() - 0.5) * spread) * sp;
    p.vy = (_dir.y + (Math.random() - 0.5) * spread) * sp;
    p.vz = (_dir.z + (Math.random() - 0.5) * spread) * sp;
    p.drag = 4.5; p.life = 0.32 + Math.random() * 0.12;
    p.s = 0.06 + Math.random() * 0.04; p.grow = 3.4; p.spin = (Math.random() - 0.5) * 4;
  }
}
const FOAM_C = [0xffffff, 0xeaf6fb, 0xd8eef7];
/** A fat clump of soapy foam: swells, wobbles upward a little, pops. For brushes and soaped cars. */
export function foam(scene, pos) {
  hook();
  for (let i = 0; i < 4; i++) {
    const p = softSpawn(scene, pos, FOAM, FOAM_C[i % 3], 0.85);
    if (!p) return;
    const a = Math.random() * 6.28, sp = 0.2 + Math.random() * 0.5;
    p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 0.2 + Math.random() * 0.5;
    p.drag = 2; p.rise = 0.15;
    p.life = 0.8 + Math.random() * 0.5; p.s = 0.1 + Math.random() * 0.07; p.grow = 1.9; p.spin = (Math.random() - 0.5) * 3;
  }
}
const SPARKLE_C = [0xffffff, 0xfff3b0, 0xd5f3ff, 0xffe27a];
/** A few twinkling glints that rise and spin. Polish, shine, premium moments. */
export function sparkle(scene, pos) {
  hook();
  for (let i = 0; i < 4; i++) {
    const p = spawn(scene, pos, STAR);
    if (!p) break;
    p.vx = p.vz = 0;
    p.vy = 0.5 + Math.random() * 0.7;
    p.life = 0.55 + Math.random() * 0.4;
    p.s = 0.16 + Math.random() * 0.14;
    p.sx = (Math.random() - 0.5) * 6; p.sy = (Math.random() - 0.5) * 4; p.sz = Math.random() * 6;
    p.m.material = matFor(SPARKLE_C[i % 4]);
    p.m.position.x += (Math.random() - 0.5) * 0.6; p.m.position.y += Math.random() * 0.4; p.m.position.z += (Math.random() - 0.5) * 0.6;
    p.m.scale.setScalar(0.001);
  }
}
const DUST_C = [0xcbbf9f, 0xd9cdb5, 0xb9ad92];
/** A low puff of dust that rolls outward along the ground and thins. Builders, landings, hard stops. */
export function dust(scene, pos) {
  hook();
  for (let i = 0; i < 5; i++) {
    const p = softSpawn(scene, pos, DUST, DUST_C[i % 3], 0.55);
    if (!p) return;
    const a = (i / 5) * 6.28 + Math.random() * 0.8, sp = 0.5 + Math.random() * 0.7;
    p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 0.1;
    p.drag = 2.8; p.rise = 0.25;
    p.life = 0.7 + Math.random() * 0.4; p.s = 0.16 + Math.random() * 0.1; p.grow = 2.4; p.spin = (Math.random() - 0.5) * 2;
    p.m.position.y = Math.max(0.08, pos.y);
  }
}
const WATER_C = [0x8fd0ee, 0xbfe6f6, 0xffffff, 0x5aa9e6];
/** A splash on the ground: a ring spreading on the surface and droplets thrown up that fall back. */
export function splash(scene, pos) {
  hook();
  const ring = softSpawn(scene, pos, RING, 0xcdeefa, 0.8);
  if (ring) {
    ring.vx = ring.vy = ring.vz = 0; ring.life = 0.5; ring.s = 0.9; ring.m.position.y = Math.max(0.03, pos.y) + 0.02;
  }
  for (let i = 0; i < 10; i++) {
    const p = spawn(scene, pos, DROP);
    if (!p) break;
    const a = Math.random() * 6.28, sp = 0.5 + Math.random() * 1.3;
    p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 2.4 + Math.random() * 2.2;
    p.life = 1.2; p.s = 0.06 + Math.random() * 0.05;
    p.m.material = matFor(WATER_C[i % 4]);
    p.m.position.y = Math.max(0.05, pos.y + 0.05);
    p.m.scale.setScalar(p.s);
  }
}

// ---------------------------------------------------------------- rain
// One InstancedMesh of thin streaks. The drops live on a world-fixed lattice that wraps around the spot the camera is
// looking at, so rain "falls where the camera is" without ever sliding with the camera. Light on purpose: the game's
// buildings you walk into have no roofs, so the rain falls into them like it would into any roofless yard; buildings
// with roofs hide the drops below the roof by simple depth testing.
const RAIN_N = 220, RAIN_W = 18, RAIN_D = 30, RAIN_H = 16;
let rainMesh = null, rainLevel = 0, rainTarget = 0, rainCam = null, rainScene = null, rainSeed = null;
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.12));
const _s = new THREE.Vector3(1, 1, 1);
const _pos = new THREE.Vector3();
const _rLook = new THREE.Vector3();
const _camDir = new THREE.Vector3();

function ensureRain(scn) {
  if (rainMesh) return;
  const g = new THREE.BoxGeometry(0.045, 0.9, 0.045);
  const mt = new THREE.MeshBasicMaterial({ color: 0xaed8f0, transparent: true, opacity: 0.6, depthWrite: false });
  rainMesh = new THREE.InstancedMesh(g, mt, RAIN_N);
  rainMesh.frustumCulled = false;
  rainMesh.renderOrder = 3;
  rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rainSeed = new Float32Array(RAIN_N * 4);
  for (let i = 0; i < RAIN_N; i++) {
    rainSeed[i * 4] = Math.random() * RAIN_W; rainSeed[i * 4 + 1] = Math.random() * RAIN_H;
    rainSeed[i * 4 + 2] = Math.random() * RAIN_D; rainSeed[i * 4 + 3] = 0.8 + Math.random() * 0.4;     // speed factor
  }
}
let rainClock = 0;
function updateRain(dt) {
  if (!rainMesh) return;
  rainLevel += (rainTarget - rainLevel) * Math.min(1, dt * 1.5);
  if (rainLevel < 0.01 && rainTarget === 0) {
    if (rainMesh.parent) rainMesh.parent.remove(rainMesh);
    rainLevel = 0;
    return;
  }
  const cam = rainCam || gameCamera;
  // ground point the camera looks at
  cam.getWorldDirection(_camDir);
  const dy = Math.min(-0.2, _camDir.y);
  const tt = -cam.position.y / dy;
  _rLook.set(cam.position.x + _camDir.x * tt, 0, cam.position.z + _camDir.z * tt);
  rainClock += dt;
  const n = Math.max(0, Math.min(RAIN_N, Math.round(RAIN_N * rainLevel)));
  rainMesh.count = n;
  const fall = 13;
  for (let i = 0; i < n; i++) {
    const sx = rainSeed[i * 4], sy = rainSeed[i * 4 + 1], sz = rainSeed[i * 4 + 2], sp = rainSeed[i * 4 + 3];
    // lattice cell wraps around the look-at point; y falls
    const wx = sx + RAIN_W * Math.floor((_rLook.x - RAIN_W / 2 - sx) / RAIN_W + 1);      // world-fixed lattice cell
    const wz = sz + RAIN_D * Math.floor((_rLook.z - RAIN_D / 2 - sz) / RAIN_D + 1);
    let y = (((sy - rainClock * fall * sp) % RAIN_H) + RAIN_H) % RAIN_H;
    _pos.set(wx, y + 0.2, wz);
    _m4.compose(_pos, _q, _s);
    rainMesh.setMatrixAt(i, _m4);
  }
  rainMesh.instanceMatrix.needsUpdate = true;
}
/** Storm rain on / off. Fades in and out. `opts`: { scene, camera } to use something other than the game's (the
 *  preview page), `intensity` 0..1 (default 0.7 = light). Cheap: 150 streaks, one draw call. Safe to call every frame
 *  with the same value. */
export function rain(on, opts = {}) {
  hook();
  rainCam = opts.camera || null;
  const scn = opts.scene || rainScene || gameScene;
  ensureRain(scn);
  rainTarget = on ? Math.max(0, Math.min(1, opts.intensity ?? 0.7)) : 0;
  if (on && rainMesh.parent !== scn) { rainScene = scn; scn.add(rainMesh); }
}
