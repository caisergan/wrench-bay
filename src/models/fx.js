// Pooled cube particles: poof (cube burst), sparks (fast welding bits) and confetti (floaty multi-colour burst).
// One shared box geometry, one shared material per colour, self-updating through the engine loop.
import * as THREE from 'three';
import { onUpdate } from '../core/engine.js';

const geo = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();
const matFor = (c) => {
  let m = mats.get(c);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); mats.set(c, m); }
  return m;
};

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

const POOF = 0, SPARK = 1, CONFETTI = 2;
const _look = new THREE.Vector3();

export function updateFx(dt) {
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
