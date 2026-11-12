// Models preview (models agent only). ?focus=cars|damage|stations|parts|chars|props|all  (row view)
// ?view=game&tx=0&tz=-3 : real game camera (offset 0,29,17.3, fov 44, portrait) over the LAYOUT. &noenv skips the
// environment agent's buildEnvironment (use it if environment.js is mid-edit and breaks this page).
import * as THREE from 'three';
import { LAYOUT as L, PART_TYPES } from '../config.js';
import * as P from './props.js';
import * as C from './cars.js';
import * as H from './characters.js';
import { poof, sparks, confetti, updateFx } from './fx.js';
import { updateLeaks } from './leak.js';

const q = new URLSearchParams(location.search);
const view = q.get('view') || 'row';
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
scene.fog = new THREE.Fog(0x9fd8cb, 45, 90);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a88f, 1.4));
const sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 140);

const updaters = [];
const chars = [];
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function plane(minX, maxX, minZ, maxZ, color, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2; m.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2); m.receiveShadow = true;
  scene.add(m);
}
function addCar(look, x, z, { yaw = 0, problems = [], speed = 0, y = 0, shine = false } = {}) {
  const c = C.createCar(look);
  c.group.position.set(x, y, z); c.group.rotation.y = yaw;
  c.setProblems(problems);
  if (shine) { c.setShine(true); let k = 0; updaters.push((dt) => { k += dt; if (k > 4) { k = 0; c.setShine(true); } }); }
  scene.add(c.group);
  updaters.push((dt) => c.update(dt, speed));
  return c;
}
function addChar(look, x, z, { speed = 0, carry = 0, working = false, sitting = false, cheer = false, yaw = 0 } = {}) {
  const c = H.createCharacter(look);
  c.group.position.set(x, 0, z); c.group.rotation.y = yaw;
  if (carry) {
    c.setCarrying(true);
    for (let i = 0; i < carry; i++) { const p = P.createPart(PART_TYPES[i % 5]); p.position.y = i * P.PART_H; c.carryAnchor.add(p); }
  }
  if (working) c.setWorking(true);
  if (sitting) c.setSitting(true);
  if (cheer) { let k = 0; updaters.push((dt) => { k += dt; if (k > 1.6) { k = 0; c.cheer(); } }); }
  scene.add(c.group);
  chars.push({ c, speed });
  return c;
}
function stationAt(type, x, z, yaw = 0) {
  const st = P.createPartStation(type);
  st.group.position.set(x, 0, z); st.group.rotation.y = yaw;
  scene.add(st.group);
  for (let i = 0; i < 4; i++) {
    const p = P.createPart(type);
    p.position.copy(st.partAnchor.position); p.position.y += i * P.PART_H;
    st.group.add(p);
  }
  let pr = Math.random();
  updaters.push((dt) => { pr = (pr + dt * 0.3) % 1.1; st.setProgress(Math.min(1, pr)); st.update(dt); });
  return st;
}
function liftAt(x, z, { car = null, cycle = true, problems = [], light = 'busy', h = 1 } = {}) {
  const lf = P.createLift();
  lf.group.position.set(x, 0, z);
  scene.add(lf.group);
  let c = null;
  if (car) c = addCar(car, x, z, { yaw: Math.PI, problems });
  let k = 0;
  lf.setLight(light);
  updaters.push((dt) => {
    k += dt;
    let hh = h;
    if (cycle) { const ph = k % 6; hh = ph < 1 ? ph : ph < 4 ? 1 : ph < 5 ? 5 - ph : 0; lf.setLight(ph < 4 ? 'busy' : ph < 5.5 ? 'done' : 'idle'); }
    lf.setHeight(hh);
    if (c) c.group.position.y = hh * P.LIFT_RISE;
    lf.update(dt);
  });
  return lf;
}
const looks = (type, color, vip = false) => ({ type, color, vip });

if (view === 'row') {
  plane(-16, 16, -18, 16, 0xd9e0e3, 0);
  const focus = q.get('focus') || 'cars';
  // row 1 (z=0): pristine cars
  const types = ['compact', 'sedan', 'pickup', 'van', 'sports'];
  const cols = [0xf26b5b, 0x5aa9e6, 0x2a9d8f, 0xee8c3a, 0x9b8fd4];
  types.forEach((t, i) => addCar(looks(t, cols[i]), -9 + i * 3, 0, { speed: i === 0 ? 2 : 0, shine: i === 4 }));
  addCar(C.randomCarLook({ vip: true }), 6, 0, {});
  // row 2 (z=-4): damage states
  const probs = [['tire'], ['oil'], ['battery'], ['engine'], ['paint'], ['tire', 'oil', 'battery', 'engine', 'paint']];
  const dTypes = ['sedan', 'compact', 'van', 'pickup', 'sedan', 'sports'];
  const dCols = [0x8fd1b0, 0xf2e8d5, 0x5aa9e6, 0xd94848, 0x3d6fb6, 0xe98fb0];
  const dYaw = +(q.get('yaw') ?? Math.PI);
  probs.forEach((pr, i) => addCar(looks(dTypes[i], dCols[i]), -9 + i * 3, -4, { problems: pr, yaw: dYaw }));
  // row 3 (z=-8.5): stations + lift
  PART_TYPES.forEach((t, i) => stationAt(t, -10 + i * 2.6, -9));
  liftAt(5.2, -8.5, { car: looks('sedan', 0xee8c3a), problems: ['tire', 'paint'] });
  liftAt(9.5, -8.5, { cycle: false, h: 0, light: 'idle' });
  // row 4 (z=4): parts, cash, pads, zone ring
  PART_TYPES.forEach((t, i) => {
    const p = P.createPart(t); p.position.set(-9 + i * 0.8, 0, 3.6); scene.add(p);
    for (let k = 0; k < 4; k++) { const s = P.createPart(PART_TYPES[(i + k) % 5]); s.position.set(-9 + i * 0.8, k * P.PART_H, 4.6); scene.add(s); }
  });
  for (let i = 0; i < 6; i++) { const c = P.createCashStack(); c.position.set(-4.6 + (i % 2) * 0.5, Math.floor(i / 2) * P.CASH_H, 4); scene.add(c); }
  const up = P.createUnlockPad(); up.group.position.set(-2.2, 0.01, 4); scene.add(up.group);
  let pp = 0; updaters.push((dt) => { pp = (pp + dt * 0.25) % 1.2; up.setProgress(Math.min(pp, 1)); up.update(dt); });
  const ug = P.createUpgradePad(); ug.group.position.set(0, 0.01, 4); scene.add(ug.group); updaters.push(ug.update);
  const zr = P.createZoneRing(0.9); zr.position.set(2, 0.03, 4); scene.add(zr);
  let pt = 0; updaters.push((dt) => {
    pt += dt;
    if (pt > 1.8) { pt = 0; poof(scene, V(3.8, 0.2, 4), 0xf6c453); confetti(scene, V(6, 0.6, 4)); }
    if (Math.random() < dt * 8) sparks(scene, V(4.9, 0.7, 4));
  });
  // row 5 (z=7.5): characters
  let x = -9;
  addChar(H.playerLook(), x, 7.5, { speed: 0 }); x += 1.2;
  addChar(H.playerLook(), x, 7.5, { speed: 1 }); x += 1.2;
  addChar(H.playerLook(), x, 7.5, { carry: 4 }); x += 1.2;
  addChar(H.playerLook(), x, 7.5, { working: true }); x += 1.2;
  addChar(H.playerLook(), x, 7.5, { cheer: true }); x += 1.2;
  for (let i = 0; i < 3; i++) { addChar(H.mechanicLook(i), x, 7.5, { speed: i === 1 ? 0.8 : 0, working: i === 2, carry: i === 1 ? 2 : 0 }); x += 1.2; }
  addChar(H.valetLook(), x, 7.5, {}); x += 1.2;
  for (let i = 0; i < 6; i++) { addChar(H.randomCustomerLook(), x, 7.5, { speed: i % 3 === 0 ? 0.7 : 0 }); x += 1.1; }
  addChar(H.randomCustomerLook(), -9, 9, { sitting: true });
  // row 6 (z=-14, behind the stations): props
  const props = [P.createScrapBin(), P.createCoffeeCart(), P.createBillboard(), P.createValetStand(), P.createToolbox()];
  [-9, -6.5, -3, 0.5, 3].forEach((px, i) => { props[i].position.set(px, 0, -14); scene.add(props[i]); });

  const F = {
    cars: [-1.5, 0, 7, 10], damage: [-1.5, -4, 9, 5.4], stations: [-1, -8.5, 7, 10], parts: [-3, 4, 4, 5.5],
    chars: [-1, 7.5, 4, 7.5], props: [-3, -14, 4, 7], all: [-1, 1, 22, 20],
  }[focus] || [0, 0, 8, 10];
  const cx = +(q.get('cx') ?? F[0]), cz = +(q.get('cz') ?? F[1]), h = +(q.get('h') ?? F[2]), d = +(q.get('d') ?? F[3]);
  camera.position.set(cx, h, cz + d); camera.lookAt(cx, 0.5, cz);
  sun.position.set(cx - 8, 18, cz + 10); sun.target.position.set(cx, 0, cz);
} else {
  const tx = +(q.get('tx') || 0), tz = +(q.get('tz') || -3);
  if (!q.has('noenv')) {
    import('./environment.js').then((m) => { const env = m.buildEnvironment(scene); updaters.push((dt) => env.update(dt, 0)); });
  } else {
    plane(-40, 40, -30, 30, 0x7cc6b3, -0.02);
    plane(L.forecourt.minX, L.forecourt.maxX, L.forecourt.minZ, L.forecourt.maxZ, 0xe6dcc8, 0);
    plane(L.walls.minX, L.walls.maxX, L.walls.minZ, L.walls.maxZ, 0xd9e0e3, 0.005);
    plane(-40, 40, L.street.z - L.street.halfWidth, L.street.z + L.street.halfWidth, 0x5b5f6b, 0.004);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(L.walls.maxX - L.walls.minX, 2.6, 0.4), new THREE.MeshLambertMaterial({ color: 0x2f4858 }));
    wall.position.set(0, 1.3, L.walls.minZ - 0.2); wall.receiveShadow = true; scene.add(wall);
  }
  for (const t of PART_TYPES) { const s = L.stations[t]; stationAt(t, s.x, s.z); }
  const lp = [['tire', 'oil'], ['battery', 'engine'], ['paint'], []];
  L.lifts.forEach((l, i) => liftAt(l.x, l.z, {
    car: i < 3 ? C.randomCarLook({ vip: i === 2 }) : null, problems: lp[i], cycle: i === 0, h: i < 3 ? 1 : 0, light: i < 3 ? 'busy' : 'idle',
  }));
  const qp = [['engine'], ['tire', 'paint'], ['oil'], ['battery', 'tire']];
  L.queueSlots.forEach((s, i) => addCar(C.randomCarLook(), s.x, L.queueLaneZ, { yaw: Math.PI / 2, problems: qp[i] }));
  addCar(C.randomCarLook(), -2, L.exitLaneZ, { yaw: Math.PI / 2, speed: 3, shine: true });
  addChar(H.playerLook(), 0.6, -6.3, { carry: 3, yaw: Math.PI });
  addChar(H.playerLook(), -2.1, -6.1, { working: true, yaw: Math.PI });
  addChar(H.mechanicLook(0), 2.1 - 0.7, -3.4 - 2.2, { working: true, yaw: Math.PI });
  addChar(H.mechanicLook(1), L.mechanicIdle[1].x, L.mechanicIdle[1].z, {});
  addChar(H.valetLook(), L.valetStand.x - 0.6, L.valetStand.z, {});
  L.loungeSpots.forEach((s, i) => { if (i % 3 !== 2) addChar(H.randomCustomerLook(), s.x, s.z, { yaw: Math.PI }); });
  const z1 = P.createZoneRing(L.queuePickupRadius); z1.position.set(L.queueSlots[0].x, 0.03, L.queueLaneZ + L.queuePickupOffsetZ); scene.add(z1);
  const ug = P.createUpgradePad(); ug.group.position.set(L.upgradePad.x, 0.01, L.upgradePad.z); scene.add(ug.group); updaters.push(ug.update);
  const tb = P.createToolbox(); tb.position.set(L.toolbox.x, 0, L.toolbox.z); scene.add(tb);
  const sb = P.createScrapBin(); sb.position.set(L.scrapBin.x, 0, L.scrapBin.z); scene.add(sb);
  const cc = P.createCoffeeCart(); cc.position.set(L.coffeeCart.x, 0, L.coffeeCart.z); scene.add(cc);
  const vs = P.createValetStand(); vs.position.set(L.valetStand.x, 0, L.valetStand.z); scene.add(vs);
  const bb = P.createBillboard(); bb.position.set(L.billboard.x, 0, L.billboard.z); scene.add(bb);
  const pad = P.createUnlockPad(); pad.group.position.set(-7.0, 0.01, -7.4 + 1.6); pad.setProgress(0.4); scene.add(pad.group); updaters.push(pad.update);
  for (let i = 0; i < 5; i++) { const c = P.createCashStack(); c.position.set(-2.1 + 1.65, i * P.CASH_H, -3.4 - 2.3); scene.add(c); }
  updaters.push((dt) => { if (Math.random() < dt * 6) sparks(scene, V(-2.1, 1.1, -5.2)); });
  camera.fov = 44;
  camera.position.set(tx, 29, tz + 17.3); camera.lookAt(tx, 0, tz - 1.2);
  sun.position.set(tx - 8, 18, tz + 10); sun.target.position.set(tx, 0, tz);
}

function resize() {
  const w = view === 'game' ? Math.min(innerWidth, Math.round(innerHeight * 0.5625)) : innerWidth;
  renderer.setSize(w, innerHeight);
  camera.aspect = w / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const u of updaters) u(dt);
  for (const w of chars) w.c.update(dt, w.speed);
  updateFx(dt);
  updateLeaks(dt);
  renderer.render(scene, camera);
}
frame();
window.__pv = { scene, camera, renderer };
