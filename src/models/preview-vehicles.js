// Vehicles preview (vehicles role). ?focus=tow|towed|traffic|doors|ferry  (row views; cx cz h d az override the camera)
// ?view=game&scene=tow|traffic|ferry : real game camera (offset 0,29,17.3, fov 44, portrait). &noenv skips buildEnvironment.
import * as THREE from 'three';
import { TRAFFIC_TYPES, TOWN, RESCUE } from '../config.js';
import * as C from './cars.js';
import { createTowTruck, createTrafficVehicle, createFerry, TOW_BOOM, FERRY_DOCK } from './vehicles.js';

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
scene.fog = new THREE.Fog(0x9fd8cb, 60, 120);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a88f, 1.4));
const sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 160);
const updaters = [];

function plane(minX, maxX, minZ, maxZ, color, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2; m.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2); m.receiveShadow = true;
  scene.add(m);
}
function addTruck(level, x, z, { yaw = 0, boom = 1, beacon = true, speed = 0, car = null, carType = 'sedan', color = 0x5aa9e6 } = {}) {
  const t = createTowTruck(level);
  t.group.position.set(x, 0, z); t.group.rotation.y = yaw;
  scene.add(t.group);
  t.setBoom(boom); t.setBeacon(beacon);
  updaters.push((dt) => t.update(dt, speed));
  let c = null;
  if (car !== false && (car || carType)) {
    c = C.createCar({ type: carType, color, vip: false });
    c.setTowed(1);
    scene.add(c.group);
    const place = () => {
      t.group.updateMatrixWorld(true);
      const w = new THREE.Vector3(); t.hitch.getWorldPosition(w);
      const sn = Math.sin(yaw), cs = Math.cos(yaw);
      c.group.rotation.y = yaw;
      c.group.position.set(w.x - sn * c.dims.ax, 0, w.z - cs * c.dims.ax);
      c.group.position.y = 0;
    };
    place();
    updaters.push((dt) => { c.update(dt, speed); });
  }
  return { t, c };
}
function addTraffic(kind, x, z, { yaw = 0, speed = 0, doors = false } = {}) {
  const v = createTrafficVehicle(kind);
  v.group.position.set(x, 0, z); v.group.rotation.y = yaw;
  scene.add(v.group);
  v.setDoors?.(doors);
  updaters.push((dt) => v.update(dt, speed));
  return v;
}
function addFerry(x, z, yaw = 0, ramp = 1) {
  const f = createFerry();
  f.group.position.set(x, 0, z); f.group.rotation.y = yaw;
  scene.add(f.group);
  f.setRamp(ramp);
  let t = 0; updaters.push((dt) => { t += dt; f.update(dt, t); });
  return f;
}
const kinds = Object.keys(TRAFFIC_TYPES);
const lookAt = (cx, cz, h, d, az = 0, ty = 0.6) => {
  const a = az * Math.PI / 180;
  camera.position.set(cx + Math.sin(a) * d, h, cz + Math.cos(a) * d); camera.lookAt(cx, ty, cz);
  sun.position.set(cx - 8, 18, cz + 10); sun.target.position.set(cx, 0, cz);
};

if (view === 'row') {
  plane(-30, 30, -30, 30, 0xd9e0e3, 0);
  const focus = q.get('focus') || 'tow';
  let F;
  if (focus === 'tow') {
    // boom states, rear 3/4 camera by default
    [0, 0.4, TOW_BOOM, 1].forEach((b, i) => {
      addTruck(1, -9 + i * 3.4, 0, { boom: b, car: false });
      addTruck(2, -9 + i * 3.4, -6, { boom: b, car: false, beacon: i % 2 === 0 });
    });
    F = [-3, -3, 7, 14, 200];
  } else if (focus === 'towed') {
    const types = ['compact', 'sedan', 'pickup', 'van', 'sports', 'suv', 'muscle', 'camper'];
    types.forEach((t, i) => addTruck(i % 2 ? 2 : 1, -9 + (i % 4) * 6.0, i < 4 ? 0 : -9, { boom: TOW_BOOM, carType: t, color: [0xf26b5b, 0x5aa9e6, 0x2a9d8f, 0xee8c3a][i % 4] }));
    F = [-3, -4, 9, 16, 160];
  } else if (focus === 'traffic') {
    kinds.forEach((k, i) => addTraffic(k, -8.5 + i * 3.0, 0, { speed: 2 }));
    kinds.forEach((k, i) => addTraffic(k, -8.5 + i * 3.0, -7, { speed: 0 }));
    F = [0, -3, 7, 14, 25];
  } else if (focus === 'doors') {
    addTraffic('bus', -3, 0, { doors: true }); addTraffic('bus', 3, 0, { doors: false });
    F = [0, 0, 5, 9, -60];
  } else {
    addFerry(-8, 0, 0, 0); addFerry(8, 0, 0, 1);
    F = [0, 0, 9, 22, 200];
  }
  const g = (k, i) => (q.has(k) ? +q.get(k) : F[i]);
  lookAt(g('cx', 0), g('cz', 1), g('h', 2), g('d', 3), g('az', 4));
} else {
  const sc = q.get('scene') || 'traffic';
  let tx = 0, tz = -3;
  if (!q.has('noenv')) {
    import('./environment.js').then((m) => { const env = m.buildEnvironment(scene); updaters.push((dt) => env.update(dt, 0)); }).catch((e) => console.warn('env failed', e));
  } else {
    plane(-80, 80, -50, 50, 0x7cc6b3, -0.02);
    plane(-80, 80, 11.7, 15.5, 0x5b5f6b, 0.004);
  }
  if (sc === 'tow') {
    tx = -11; tz = 4;
    const { t } = addTruck(1, -11.7, 14.4 - 9, { boom: 0.6, carType: 'sedan' });
    addTruck(2, -2, 12.8, { yaw: Math.PI / 2, boom: 0, car: false, speed: 4 });
    addTruck(1, -16, 14.4, { yaw: Math.PI / 2, boom: TOW_BOOM, carType: 'hatch', color: 0xee8c3a, speed: 3 });
    t.group.position.set(-11.7, 0, -2.4);
  } else if (sc === 'ferry') {
    tx = 54; tz = 16;
    const f = addFerry(+(q.get('fx') ?? FERRY_DOCK.x), +(q.get('fz') ?? FERRY_DOCK.z), +(q.get('fyaw') ?? FERRY_DOCK.yaw), +(q.get('ramp') ?? 1));
    // cars on the deck: slots (+-0.95, -3.4 / -0.4) in ferry-local coordinates, nose towards the bow
    [[-0.95, -3.4, 'sedan'], [0.95, -3.4, 'pickup'], [-0.95, -0.4, 'compact'], [0.95, -0.4, 'van']].forEach(([x, z, t], i) => {
      const c = C.createCar({ type: t, color: [0xf26b5b, 0x5aa9e6, 0x2a9d8f, 0xee8c3a][i], vip: false });
      c.group.position.set(x, 0.3, z); f.group.children[0].add(c.group);
    });
  } else {
    tx = 0; tz = 4;
    const lane = TOWN.roads.harbor.lanes;
    kinds.forEach((k, i) => addTraffic(k, -14 + i * 5.2, lane[i % 2], { yaw: Math.PI / 2, speed: 5, doors: k === 'bus' }));
    kinds.slice(0, 4).forEach((k, i) => addTraffic(k, 14 - i * 6, TOWN.roads.main.lanes[i % 2], { yaw: -Math.PI / 2, speed: 5 }));
  }
  camera.fov = 44;
  camera.position.set(+(q.get('tx') ?? tx), 29, +(q.get('tz') ?? tz) + 17.3); camera.lookAt(+(q.get('tx') ?? tx), 0, +(q.get('tz') ?? tz) - 1.2);
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
  renderer.render(scene, camera);
}
frame();
window.__pv = { scene, camera, renderer };
