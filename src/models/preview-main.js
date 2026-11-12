// Main Street + corner buildings preview (bmain). Two views:
//  ?focus=junk|depot|diner|academy|show|gas|qf|ferry   the factory (levels side by side, offset in x) under a game-pitch camera
//      (&k=1.3 zoom out, &cam=x,z re-target, &labels=0)
//  ?view=game&tx=..&tz=..   the real game camera (offset 0,29,17.3, fov 44, portrait) at the real world positions.
//      &noenv skips buildEnvironment, &nocars skips cars / people. Levels: &diner=1..5 &gas=1..5 &qf=1..5 &busy=0|1
import * as THREE from 'three';
import * as CFG from '../config.js';
import * as T from './props-town.js';
import * as BM from './buildings-main.js';

const { PROJECT, PROPERTIES, SERVICES, TOWN, BUSINESS, LUNCH, VISITS, CLASSICS } = CFG;
const q = new URLSearchParams(location.search);
const view = q.get('view') || 'row';
const focus = q.get('focus') || 'junk';
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
scene.fog = new THREE.Fog(0x9fd8cb, 60, 160);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a88f, 1.4));
const sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(44, 0.5625, 0.5, 240);
const updaters = [];
const info = document.getElementById('info');

let C = null, H = null;
if (!q.has('nocars')) {
  try { C = await import('./cars.js'); } catch (e) { console.warn('cars.js failed', e); }
  try { H = await import('./characters.js'); } catch (e) { console.warn('characters.js failed', e); }
}
function add(obj, dx = 0, dz = 0, yaw = null) {
  const g = obj.group ?? obj;
  if (!g.userData.world || dx || dz) { g.position.x += dx; g.position.z += dz; }
  if (yaw !== null) g.rotation.y = yaw;
  scene.add(g);
  if (obj.update) updaters.push((dt) => obj.update(dt));
  return obj;
}
function car(look, x, z, yaw = 0, { y = 0 } = {}) {
  if (!C) return null;
  try { const c = C.createCar(look); c.group.position.set(x, y, z); c.group.rotation.y = yaw; scene.add(c.group); updaters.push((dt) => c.update(dt, 0)); return c; }
  catch (e) { console.warn(e); return null; }
}
function person(look, x, z, yaw = 0, { sit = false } = {}) {
  if (!H) return null;
  try { const c = H.createCharacter(look); c.group.position.set(x, 0, z); c.group.rotation.y = yaw; if (sit) c.setSitting(true); scene.add(c.group); updaters.push((dt) => c.update(dt, 0)); return c; }
  catch (e) { console.warn(e); return null; }
}
const ped = () => (H?.pedestrianLook ? H.pedestrianLook() : H?.randomCustomerLook?.() ?? {});
function plane(minX, maxX, minZ, maxZ, color, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2; m.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2); m.receiveShadow = true;
  scene.add(m); return m;
}
function label(text, x, y, z) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(31,35,41,0.75)'; g.beginPath(); g.roundRect(0, 8, 512, 80, 20); g.fill();
  g.fillStyle = '#fff6e6'; g.font = '600 46px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(3.4, 0.64, 1); s.position.set(x, y, z); s.renderOrder = 10; scene.add(s);
}
const pc = (p) => ({ x: (p.minX + p.maxX) / 2, z: (p.minZ + p.maxZ) / 2 });

// ---------------------------------------------------------------- populations (shared by both views)
function junkPeople(dx = 0, dz = 0) {
  PROJECT.stands.forEach((s, i) => car({ type: CLASSICS[i].id, color: 0x8a6a50 }, s.x + dx, s.z + dz, Math.PI));
  PROJECT.stands.forEach((s) => { const p = T.createUnlockPadLike?.(); void p; });
}
function dinerPeople(lvl, dx = 0, dz = 0) {
  const pk = LUNCH.pickup;
  person(H?.baristaLook ? H.baristaLook() : ped(), pk.x + dx, pk.z - 1.5 + dz, 0);
  person(ped(), pk.x + 1.2 + dx, pk.z + 1.1 + dz, Math.PI);
}
const lookCar = () => (C?.randomCarLook?.() ?? {});

function rowView() {
  plane(-90, 90, -60, 40, 0xcfc9bb, -0.01);
  const pl = (p) => pc(p);
  let cx = 0, cz = 0, zoom = 1;
  const levels = (name, make, n, spacing, extra) => {
    for (let l = 1; l <= n; l++) {
      const obj = make(l);
      add(obj, (l - 1) * spacing, 0);
      if (extra) extra(obj, l, (l - 1) * spacing);
      if (q.get('labels') !== '0') label(`${name} ${l}`, (l - 1) * spacing + (obj.group ?? obj).position.x * 0 + (pc(({ diner: PROPERTIES.diner.plot, gas: PROPERTIES.gas.plot, qf: PROPERTIES.quickfit.plot }[name] ?? PROPERTIES.diner.plot)).x), 0.2, 4);
    }
  };
  if (focus === 'junk') {
    add(BM.createJunkyard()); junkPeople();
    cx = -35; cz = -31; zoom = 0.62;
    const wall = plane(-46, -24, -37.5, -25.1, 0xa8a090, 0.005); wall.visible = true;
  } else if (focus === 'depot') {
    add(BM.createDepot()); const p = pl(SERVICES.depot.plot); cx = p.x; cz = p.z; zoom = 0.62;
  } else if (focus === 'diner') {
    const p = pl(PROPERTIES.diner.plot);
    levels('diner', (l) => BM.createDiner(l), 5, 16, (o, l, dx) => dinerPeople(l, dx));
    cx = p.x + 32; cz = p.z; zoom = 2.0;
  } else if (focus === 'academy') {
    add(BM.createAcademy()); const p = pl(SERVICES.academy.plot); cx = p.x; cz = p.z; zoom = 0.62;
  } else if (focus === 'show') {
    const sh = BM.createShowroom(); add(sh);
    sh.turntables.forEach((t, i) => { t.setGlow(i !== 1); const c = car({ type: CLASSICS[i * 2]?.id ?? 'sedan', color: [0xe5484d, 0x3b82c4, 0xf6c453][i] }, 0, 0, 0); if (c) t.platform.add(c.group); });
    const p = pl(PROPERTIES.showroom.plot); cx = p.x; cz = p.z; zoom = 0.68;
  } else if (focus === 'gas') {
    levels('gas', (l) => BM.createGasStation(l), 5, 14);
    const p = pl(PROPERTIES.gas.plot); cx = p.x + 28; cz = p.z; zoom = 2.2;
  } else if (focus === 'qf') {
    levels('qf', (l) => BM.createQuickFit(l), 5, 14, (o, l) => { for (let i = 0; i < l + 1; i++) o.setBusy(i, (i + l) % 2 === 0); });
    const p = pl(PROPERTIES.quickfit.plot); cx = p.x - 28; cz = p.z; zoom = 2.2;
  } else if (focus === 'ferry') {
    add(BM.createFerryTerminal()); const p = pl(PROPERTIES.ferry.plot); cx = p.x; cz = p.z; zoom = 0.6;
  }
  zoom *= num('k', 1);
  const at = q.get('cam') ? q.get('cam').split(',').map(Number) : [cx, cz];
  camera.fov = 44;
  camera.position.set(at[0], 29 * zoom, at[1] + 17.3 * zoom); camera.lookAt(at[0], 0, at[1] - 1.2 * zoom);
  sun.position.set(at[0] - 8, 18, at[1] + 10); sun.target.position.set(at[0], 0, at[1]);
  Object.assign(sun.shadow.camera, { left: -30 * zoom, right: 30 * zoom, top: 30 * zoom, bottom: -30 * zoom }); sun.shadow.camera.updateProjectionMatrix();
}

async function gameView() {
  if (!q.has('noenv')) {
    try { const E = await import('./environment.js'); const env = E.buildEnvironment(scene); updaters.push((dt) => env.update(dt, performance.now() / 1000)); }
    catch (e) { console.warn('environment failed', e); plane(-70, 70, -40, 25, 0x7cc6b3, -0.02); }
  } else plane(-70, 70, -40, 25, 0x7cc6b3, -0.02);
  for (const p of TOWN.parking) add(T.createParkingBay(), p.x, p.z, p.yaw);
  add(BM.createJunkyard()); junkPeople();
  add(BM.createDepot());
  add(BM.createDiner(num('diner', 3))); dinerPeople(num('diner', 3));
  add(BM.createAcademy());
  const sh = BM.createShowroom(); add(sh);
  sh.turntables.forEach((t, i) => { t.setGlow(i === 1); const c = car({ type: CLASSICS[i * 2]?.id ?? 'sedan', color: [0xe5484d, 0x3b82c4, 0xf6c453][i] }, 0, 0, 0); if (c) t.platform.add(c.group); });
  add(BM.createGasStation(num('gas', 3)));
  const qf = BM.createQuickFit(num('qf', 3)); add(qf);
  if (num('busy', 1)) for (let i = 0; i < 6; i++) qf.setBusy(i, i % 2 === 0);
  add(BM.createFerryTerminal());
  // a car at every traffic stop
  for (const [id, v] of Object.entries(VISITS)) { const p = v.path[v.stop]; const pv = v.path[v.stop - 1]; car(lookCar(), p.x, p.z, Math.atan2(p.x - pv.x, p.z - pv.z)); }
  for (const [id, b] of Object.entries(BUSINESS)) { const c = T.createCoinStack(); c.position.set(b.till.x, 0, b.till.z); scene.add(c); }
  const kk = num('k', 1), tx = num('tx', 0), tz = num('tz', -30);
  camera.fov = 44;
  camera.position.set(tx, 29 * kk, tz + 17.3 * kk); camera.lookAt(tx, 0, tz - 1.2 * kk);
  sun.position.set(tx - 8, 18, tz + 10); sun.target.position.set(tx, 0, tz);
}

if (view === 'game') await gameView(); else rowView();

function resize() {
  const w = view === 'game' ? Math.min(innerWidth, Math.round(innerHeight * 0.5625)) : innerWidth;
  renderer.setSize(w, innerHeight);
  camera.aspect = w / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
info.textContent = `${view} ${focus} ${location.search}`;
const clock = new THREE.Clock();
let leaks = null;
try { leaks = (await import('./leak.js')).updateLeaks; } catch { /* optional */ }
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const u of updaters) { try { u(dt); } catch (e) { console.error(e); updaters.splice(updaters.indexOf(u), 1); } }
  scene.traverse((o) => { if (o.userData.u) o.userData.u(dt); });
  if (leaks) leaks(dt);
  renderer.render(scene, camera);
}
frame();
window.__pv = { scene, camera, renderer, THREE };
