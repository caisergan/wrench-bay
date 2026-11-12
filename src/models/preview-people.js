// People preview (people agent): parts, teams, poses, pedestrians, gull, fx. ?focus=parts|stack|teams|poses|peds|gull|fx
// ?view=game&scene=stack|work|town : the real portrait game camera (offset 0,29,17.3, fov 44) on a plain ground.
import * as THREE from 'three';
import { PAINT_COLORS } from '../config.js';
import * as P from './props.js';
import * as H from './characters.js';
import { createSeagull } from './critters.js';
import { poof, sparks, confetti, mist, foam, sparkle, dust, splash, rain, updateFx } from './fx.js';

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
const COLORS = Object.keys(PAINT_COLORS);

function plane(minX, maxX, minZ, maxZ, color, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2; m.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2); m.receiveShadow = true;
  scene.add(m);
}
function addChar(look, x, z, o = {}) {
  const c = H.createCharacter(look);
  c.group.position.set(x, 0, z); c.group.rotation.y = o.yaw ?? 0;
  if (o.carry) {
    c.setCarrying(true);
    const ids = o.parts || ['tire', 'oil', 'battery', 'engine'];
    for (let i = 0; i < o.carry; i++) { const p = P.createPart(ids[i % ids.length]); p.position.y = i * P.PART_H; c.carryAnchor.add(p); }
  }
  if (o.working) c.setWorking(true);
  if (o.sitting) c.setSitting(true);
  if (o.spray) { c.setSpraying(true); if (o.sprayColor != null) c.setSprayColor(o.sprayColor); }
  if (o.polish) c.setPolishing(true);
  if (o.wave) c.setWaving(true);
  if (o.eat) c.setEating(true);
  scene.add(c.group);
  chars.push({ c, speed: o.speed || 0 });
  return c;
}
function emitMist(c, hex) {
  const tp = new THREE.Vector3(), d = new THREE.Vector3();
  updaters.push((dt) => {
    if (!c.spraying) return;
    c.sprayTip.getWorldPosition(tp); c.sprayTip.getWorldDirection(d);
    emitMist.acc = (emitMist.acc || 0) + dt;
    while (emitMist.acc > 1 / 28) { emitMist.acc -= 1 / 28; mist(scene, tp, hex, d); }
  });
}
function polishSparkles(c) {
  const tp = new THREE.Vector3(); let acc = 0;
  updaters.push((dt) => {
    if (!c.polishing) return;
    acc += dt; if (acc < 0.25) return; acc = 0;
    c.polishTip.getWorldPosition(tp); sparkle(scene, tp);
  });
}
// a car-body-like slab to spray / polish
function panel(x, z, w = 2.8, d = 1.6, color = 0x8fa7b5) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, 0.55, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
}

const focus = q.get('focus') || 'parts';
let F = [0, 0, 8, 10];
if (view === 'row') {
  plane(-30, 30, -30, 40, 0xd9e0e3, 0);
  // ---- parts (z=0): every spray colour, premium, lunch, existing parts for scale
  COLORS.forEach((id, i) => { const p = P.createPart('spray:' + id); p.position.set(-5 + i * 0.7, 0, 0); scene.add(p); });
  [P.createPart('premium'), P.createPart('lunch')].forEach((p, i) => { p.position.set(0.9 + i * 0.8, 0, 0); scene.add(p); });
  ['tire', 'oil', 'battery', 'engine', 'paint'].forEach((t, i) => { const p = P.createPart(t); p.position.set(-5 + i * 0.7, 0, 1.2); scene.add(p); });
  // stacks, 4 high, mixed (z=3): seen from above the colour must be unmistakable
  COLORS.forEach((id, i) => {
    for (let k = 0; k < 4; k++) {
      const ids = ['spray:' + id, 'tire', 'spray:' + id, 'oil'];
      const p = P.createPart(ids[k]); p.position.set(-5 + i * 0.7, k * P.PART_H, 3); scene.add(p);
    }
  });
  // all-spray stacks of 8 colours sharing the carry stack (z=4.4)
  for (let k = 0; k < 8; k++) { const p = P.createPart('spray:' + COLORS[k]); p.position.set(-1, k * P.PART_H, 4.6); scene.add(p); }
  { const ids = ['premium', 'lunch', 'spray:red', 'engine', 'premium']; ids.forEach((id, k) => { const p = P.createPart(id); p.position.set(1, k * P.PART_H, 4.6); scene.add(p); }); }

  // ---- teams (z=9): garage vs paint vs vip vs misc
  const team = [
    H.mechanicLook(0), H.mechanicLook(1), H.valetLook(), H.playerLook(), H.playerLook({ goldCap: true }), null,
    H.painterLook(0), H.painterLook(1), H.painterLook(2), H.painterLook(3), H.prepTechLook(), null,
    H.hostLook(), H.masterTechLook(), H.detailerLook(), null, H.managerLook('garage'), H.managerLook('paint'), H.managerLook('vip'), null,
    H.baristaLook(), H.buyerLook(), H.towDriverLook(),
  ];
  let x = -9.5;
  team.forEach((l) => { if (l) addChar(l, x, 9, { speed: 0 }); x += l ? 0.85 : 0.5; });
  x = -9;
  for (let i = 0; i < 12; i++) { addChar(H.vipCustomerLook(), x, 10.6); x += 0.85; }

  // ---- poses (z=15)
  x = -7;
  addChar(H.painterLook(0), x, 15, { spray: true, sprayColor: PAINT_COLORS.red.hex }); emitMist(chars[chars.length - 1].c, PAINT_COLORS.red.hex); panel(x, 17.4, 2.2, 0.6); x += 3;
  addChar(H.painterLook(1), x, 15, { spray: true, sprayColor: PAINT_COLORS.blue.hex }); emitMist(chars[chars.length - 1].c, PAINT_COLORS.blue.hex); panel(x, 17.4, 2.2, 0.6); x += 3;
  const pol = addChar(H.detailerLook(), x, 15, { polish: true }); polishSparkles(pol); panel(x, 16.6, 2.2, 0.6, 0x2b2f36); x += 2.5;
  addChar(H.randomCustomerLook(), x, 15, { wave: true }); x += 1.3;
  addChar(H.randomCustomerLook(), x, 15, { eat: true, sitting: true }); x += 1.3;
  addChar(H.mechanicLook(0), x, 15, { eat: true, sitting: true }); x += 1.3;
  addChar(H.painterLook(2), x, 15, { carry: 4, parts: ['spray:red', 'spray:red', 'spray:blue', 'spray:red'] }); x += 1.3;
  addChar(H.playerLook(), x, 15, { carry: 3, parts: ['premium', 'lunch', 'spray:teal'] }); x += 1.3;
  // combos
  x = -7;
  addChar(H.playerLook(), x, 12.6, { carry: 3, spray: true, parts: ['spray:red'] }); x += 1.3;
  addChar(H.playerLook(), x, 12.6, { working: true, polish: true }); x += 1.3;
  addChar(H.valetLook(), x, 12.6, { wave: true, speed: 0.8 }); x += 1.3;
  addChar(H.playerLook({ goldCap: true }), x, 12.6, { speed: 1 }); x += 1.3;
  { const c = addChar(H.playerLook(), x, 12.6, {}); let k = 0; updaters.push((dt) => { k += dt; if (k > 1.6) { k = 0; c.cheer(); } }); x += 1.3; }
  // toggle demo: sprays 2s, polishes 2s, waves 2s, eats 2s, nothing 2s
  { const c = addChar(H.painterLook(3), x, 12.6, {}); let k = 0; updaters.push((dt) => { k += dt; const s = Math.floor(k / 2) % 5; c.setSpraying(s === 0); c.setPolishing(s === 1); c.setWaving(s === 2); c.setEating(s === 3); }); emitMist(c, PAINT_COLORS.teal.hex); c.setSprayColor(PAINT_COLORS.teal.hex); }

  // ---- pedestrians (z=21+): all 96
  for (let i = 0; i < 96; i++) addChar(H.pedestrianLook(i), -9.5 + (i % 16) * 1.25, 21 + Math.floor(i / 16) * 1.4, { speed: i % 7 === 0 ? 0.7 : 0 });

  // ---- gull (z=-8): perched / cycle
  window.__gulls = [];
  for (let i = 0; i < 4; i++) {
    const g = createSeagull({ autoLand: i !== 3 });
    g.group.position.set(-6 + i * 4, 0, -8); g.group.rotation.y = i * 0.8; scene.add(g.group); window.__gulls.push(g);
    let k = 0; const cyc = [3, 5, 7, 20][i];
    updaters.push((dt) => { g.update(dt); k += dt; if (k > cyc) { k = 0; if (!g.flying) g.takeOff(); else if (i === 3) g.land(); } });
  }
  // a rail to perch on
  { const m = new THREE.Mesh(new THREE.BoxGeometry(24, 0.08, 0.1), new THREE.MeshLambertMaterial({ color: 0x7a4f32 })); m.position.set(0, -0.0, -8); }

  // ---- fx (z=-4 .. -2)
  const eps = [[mist, -8], [foam, -6], [sparkle, -4], [dust, -2], [splash, 0]];
  let acc = 0;
  updaters.push((dt) => {
    acc += dt;
    for (const [fn, fx] of eps) {
      if (fn === mist) { if (Math.sin(acc * 1.5) > -0.2) mist(scene, V(fx, 0.9, -3), PAINT_COLORS[COLORS[Math.floor(acc / 2) % 8]].hex, V(0, 0, 1)); }
    }
    if (Math.floor((acc - dt) * 2) !== Math.floor(acc * 2)) { foam(scene, V(-6, 0.4, -3)); sparkle(scene, V(-4, 0.6, -3)); dust(scene, V(-2, 0, -3)); splash(scene, V(0, 0, -3)); }
  });
  // rain
  if (q.has('rain')) rain(true, { scene, camera, intensity: +q.get('rain') || 0.7 });

  F = {
    parts: [-2, 1.5, 4, 5], stack: [-2, 3.5, 9, 3], teams: [-1, 9.5, 5, 7.5], poses: [-1, 14, 6, 8], peds: [0, 24, 9, 10],
    gull: [-1, -8, 6, 8], fx: [-4, -3, 4, 7],
  }[focus] || F;
  const cx = +(q.get('cx') ?? F[0]), cz = +(q.get('cz') ?? F[1]), h = +(q.get('h') ?? F[2]), d = +(q.get('d') ?? F[3]);
  camera.position.set(cx, h, cz + d); camera.lookAt(cx, 0.5, cz);
  sun.position.set(cx - 8, 18, cz + 10); sun.target.position.set(cx, 0, cz);
} else {
  const sc = q.get('scene') || 'stack';
  const tx = +(q.get('tx') || 0), tz = +(q.get('tz') || 0);
  plane(-40, 40, -30, 30, 0xe6dcc8, 0);
  if (sc === 'stack') {
    // the carry stack from the real camera: full stacks of every colour on a player
    COLORS.forEach((id, i) => {
      const c = addChar(H.playerLook(), -6 + i * 1.7, -3 + (i % 2) * 2.5, { yaw: 0 });
      c.setCarrying(true);
      for (let k = 0; k < 6; k++) { const p = P.createPart(k >= 2 ? 'spray:' + id : ['tire', 'oil'][k % 2]); p.position.y = k * P.PART_H; c.carryAnchor.add(p); }
    });
  } else if (sc === 'work') {
    panel(0, -4, 3, 1.5, 0xc9d3da);
    const c1 = addChar(H.painterLook(0), -0.8, -1.8, { yaw: Math.PI, spray: true, sprayColor: PAINT_COLORS.red.hex }); emitMist(c1, PAINT_COLORS.red.hex);
    const c2 = addChar(H.detailerLook(), 4.5, -1.8, { yaw: Math.PI, polish: true }); polishSparkles(c2); panel(4.5, -4, 3, 1.5, 0x2b2f36);
    addChar(H.painterLook(1), -4.5, -3, { yaw: 1.2, carry: 3, parts: ['spray:red'] });
    addChar(H.prepTechLook(), -3.4, 1, {}); addChar(H.hostLook(), 6.8, 1, {}); addChar(H.masterTechLook(), 7.8, 1, {});
    addChar(H.randomCustomerLook(), 2, 2, { wave: true, yaw: Math.PI * 0.7 });
    addChar(H.mechanicLook(0), -6, 0, { yaw: 0.5 }); addChar(H.mechanicLook(2), -7, 2, {});
  } else if (sc === 'town') {
    for (let i = 0; i < 30; i++) addChar(H.pedestrianLook(), -7 + (i % 10) * 1.5 + Math.random() * 0.5, -6 + Math.floor(i / 10) * 3 + Math.random(), { speed: i % 3 ? 0.6 : 0, yaw: Math.random() * 6 });
    ['garage', 'paint', 'vip'].forEach((k, i) => addChar(H.managerLook(k), -4 + i * 2, 4));
    addChar(H.buyerLook(), 3, 4); addChar(H.baristaLook(), 4.5, 4); addChar(H.towDriverLook(), 6, 4);
  }
  if (q.has('rain')) rain(true, { scene, camera, intensity: +q.get('rain') || 0.7 });
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
let frames = 0, tsum = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const u of updaters) u(dt);
  for (const w of chars) w.c.update(dt, w.speed);
  updateFx(dt);
  renderer.render(scene, camera);
  frames++; tsum += dt;
}
frame();
window.__pv = { scene, camera, renderer, rain: (on, i) => rain(on, { scene, camera, intensity: i }), info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }) };
