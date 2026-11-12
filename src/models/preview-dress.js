// Street dressing preview (envdress agent): ground from env-streets.js + env-harbor.js + env-life.js, nothing else.
//   ?cam=x,z   camera target (game camera: offset 0,29,17.3, fov 44, portrait)   &k=1.6 zoom out   &top=1 straight down
//   &noplots hides the plot placeholder boxes   &nolife / &noharbor skip a module   &sweep=1 auto-walks the camera
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE as P, LAYOUT as L } from '../config.js';
import { TOWN, PROPERTIES, SERVICES } from '../config.town.js';
import { litMat, glowMat, mulberry32 } from './voxel.js';
import { ChunkBuilder, SignAtlas, waterTex, solids, flushSurfaces } from './env-kit.js';
import { buildStreets, streetGeo } from './env-streets.js';
import { buildHarbor } from './env-harbor.js';
import { buildStreetLife } from './env-life.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const canvas = document.getElementById('pv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8cb);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a88f, 1.4));
const sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(44, 0.5625, 0.5, 400);
const root = new THREE.Group();
scene.add(root);

// ---- world: streets (flat) + the dressing under test
const rnd = mulberry32(7);
const signs = new SignAtlas();
const base = { S: new ChunkBuilder(), F: new ChunkBuilder(), G: new ChunkBuilder() };
const geo = buildStreets(root, base, signs, mulberry32(11));
flushSurfaces(root);                       // the ground is batched (env-kit surface): build it now
const baseTris = () => renderer.info.render.triangles;

// water + a quay lip standing in for what env builds (quay slab at walk height up to the water edge, wall to the water)
const wt = waterTex();
const water = new THREE.Mesh(new THREE.PlaneGeometry(260, 140), new THREE.MeshLambertMaterial({ map: wt }));
water.rotation.x = -Math.PI / 2; water.position.set(0, -0.4, geo.quayZ + 70); water.receiveShadow = true;
root.add(water);
{
  const b = new ChunkBuilder();
  b.box(122, 0.43, 0.3, 0xd6cfc4, 0, -0.4, 16.7 + 0.15);        // wall under the lip
  b.box(122, 0.03, 0.3, 0xd6cfc4, 0, 0, 16.7 + 0.15);
  b.box(122, 0.04, 0.1, 0x8e8577, 0, 0.03, 16.9);
  b.build(root, litMat, { cast: true, receive: true });
}
// plot placeholders (translucent) so the dressing is judged against what will stand there
if (!q.has('noplots')) {
  const ph = new THREE.MeshBasicMaterial({ color: 0x6a7a8a, transparent: true, opacity: 0.3, depthWrite: false });
  const add = (r, h, c) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(r.maxX - r.minX, h, r.maxZ - r.minZ), ph.clone());
    m.material.color.set(c);
    m.position.set((r.minX + r.maxX) / 2, h / 2, (r.minZ + r.maxZ) / 2); root.add(m);
  };
  for (const p of Object.values(PROPERTIES)) add(p.plot, 2.6, 0x5a7aa0);
  for (const p of Object.values(SERVICES)) add(p.plot, 3.5, 0x5a7aa0);
  for (const f of TOWN.fillers) add(f, 5, 0x8a7a6a);
  add({ minX: L.walls.minX, maxX: L.walls.maxX, minZ: L.walls.minZ, maxZ: L.walls.maxZ }, 2.6, 0xa0805a);
  add(L.forecourt, 0.05, 0xa0805a);
}

const env = { root, S: new ChunkBuilder(), F: new ChunkBuilder(), G: new ChunkBuilder(), signs, rnd: mulberry32(5), geo };
const updaters = [];
for (const [name, fn] of [['harbor', buildHarbor], ['life', buildStreetLife]]) {
  if (q.has('no' + name)) continue;
  try { const r = fn(env); if (r && r.update) updaters.push(r.update); } catch (e) { console.error(name + ' failed', e); }
}
base.S.build(root, litMat, { cast: true, receive: true });
base.F.build(root, litMat, { cast: false, receive: true });
env.S.build(root, litMat, { cast: true, receive: true });
env.F.build(root, litMat, { cast: false, receive: true });
env.G.build(root, glowMat, { cast: false, receive: false });
signs.build(root, mergeGeometries);
window.__solids = solids;

// debug: draw the solid boxes
if (q.has('showsolids')) {
  const m = new THREE.MeshBasicMaterial({ color: 0xff2255, wireframe: true });
  for (const s of solids) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(s.maxX - s.minX, 1.2, s.maxZ - s.minZ), m);
    b.position.set((s.minX + s.maxX) / 2, 0.6, (s.minZ + s.maxZ) / 2); root.add(b);
  }
}
// debug: ring the wrench spots (1 m), rescue spots, parking bays
if (q.has('marks')) {
  const mk = (x, z, w, d, c) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5 }));
    m.position.set(x, 0.08, z); root.add(m);
  };
  for (const w of TOWN.wrenches) mk(w.x, w.z, 2, 2, 0xffd400);
}

// ---- camera
const cam = (q.get('cam') || '0,2').split(',').map(Number);
const target = new THREE.Vector3(cam[0], 0, cam[1]);
const k = num('k', 1);
function resize() {
  const vw = innerWidth, vh = innerHeight;
  let w = vw, h = vh;
  if (w / h > 0.62) w = Math.round(h * 0.62);
  renderer.setSize(w, h);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  camera.aspect = w / h; camera.fov = w / h < 0.5 ? 47 : 44; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
const info = document.getElementById('info');
const clock = new THREE.Clock();
let t = 0, frames = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); t += dt;
  if (q.has('sweep')) { target.x = -50 + ((t * 4) % 100); target.z = 2; }
  if (q.has('top')) { camera.position.set(target.x, 70 * k, target.z + 0.01); camera.lookAt(target.x, 0, target.z); }
  else { camera.position.set(target.x, 29 * k, target.z + 17.3 * k); camera.lookAt(target.x, 0, target.z - 1.2); }
  sun.position.set(target.x - 8, 18, target.z + 10); sun.target.position.set(target.x, 0, target.z);
  wt.offset.x += dt * 0.004;
  for (const u of updaters) u(dt, t);
  renderer.render(scene, camera);
  if (++frames % 20 === 0) {
    const r = renderer.info.render;
    info.textContent = `cam ${target.x.toFixed(1)},${target.z.toFixed(1)} k${k}\ncalls ${r.calls} tris ${r.triangles}\nsolids ${solids.length}`;
  }
  requestAnimationFrame(frame);
}
window.__stats = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries });
frame();
