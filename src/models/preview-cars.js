// Cars preview (cars agent only). Row views: ?focus=types|legacy|damage|states|color|restore|wash|towrun|tyres
//   &set=all|legacy|town|vip|classic  which types   &types=a,b,c  explicit list   &cols=N  grid columns
//   &yaw=0.6  car heading   &spin=1  turn slowly   &drive=1  cars shuttle: forward, stop, reverse, stop
//   &p=tire+tire,oil,all  damage sets (focus=damage)   &st=dirt|foam|wet|mask|stripe|gloss|hazard|tow (focus=states)
//   &cx &cz &h &d  manual camera   &nolabels
//   focus=tyres: per type healthy | flat | 2 flats | spare + flat | worn | 2 worn (&drive=1 rolls them)
// ?view=game&grid=lane|lift|mix|restore|states|tyres : the real portrait game camera (offset 0,29,17.3, fov 44) at real
//   size; &tx &tz move it. &env loads the environment agent's buildEnvironment (mix only; default: plain floor).
import * as THREE from 'three';
import { LAYOUT as L, CAR_TYPES, TOWN_CAR_TYPES, VIP_CAR_TYPES, CLASSICS, PAINT_COLORS } from '../config.js';
import * as C from './cars.js';
import * as OLD from './preview-cars-before.js';
import { updateLeaks } from './leak.js';

const q = new URLSearchParams(location.search);
const view = q.get('view') || 'row';
const focus = q.get('focus') || 'types';
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
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 80 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 160);

// ---------------------------------------------------------------- types
const SETS = {
  legacy: Object.keys(CAR_TYPES),
  town: Object.keys(TOWN_CAR_TYPES),
  vip: Object.keys(VIP_CAR_TYPES),
  classic: CLASSICS.map((c) => c.id),
};
SETS.all = [...SETS.legacy, ...SETS.town, ...SETS.vip, ...SETS.classic];
const SET = q.get('set') || 'all';
const pickTypes = (def) => (q.get('types') ? q.get('types').split(',') : q.get('set') ? SETS[SET] : def);
const ALL_PROBLEMS = ['tire', 'oil', 'battery', 'engine', 'paint'];
const TYRE_STATES = [['ok', [], null], ['flat', ['tire'], 'flat'], ['2 flats', ['tire', 'tire'], 'flat'],
  ['spare', ['tire', 'tire'], 'spare'], ['worn', ['tire'], 'worn'], ['2 worn', ['tire', 'tire'], 'worn']];
/** Deterministic look per type: garage + town classes cycle the customer palette, club cars / classics their own. */
function lookFor(type, i = 0) {
  if (SETS.legacy.includes(type) || SETS.town.includes(type)) return { type, color: C.CAR_COLORS[(i * 3 + type.length) % C.CAR_COLORS.length], vip: false };
  if (SETS.vip.includes(type)) return { type, color: C.VIP_COLORS[(i + type.length) % C.VIP_COLORS.length], vip: false };
  return C.lookOf(type);
}

// ---------------------------------------------------------------- scene helpers
const updaters = [];
const labels = [];
const showLabels = !q.has('nolabels') && !(view === 'game' && q.get('grid') === 'mix');
let T = 0;
function plane(minX, maxX, minZ, maxZ, color, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2; m.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2); m.receiveShadow = true;
  scene.add(m);
  return m;
}
function label(text, obj, y = 2.0) {
  if (!showLabels) return;
  const d = document.createElement('div');
  d.className = 'lb'; d.textContent = text;
  document.body.appendChild(d);
  labels.push({ d, obj, y });
}
const _v = new THREE.Vector3();
function placeLabels() {
  const r = canvas.getBoundingClientRect();
  for (const l of labels) {
    _v.copy(l.obj.position); _v.y += l.y;
    _v.project(camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
    l.d.style.display = vis ? '' : 'none';
    if (vis) l.d.style.left = `${r.left + (_v.x + 1) / 2 * r.width}px`, l.d.style.top = `${r.top + (1 - _v.y) / 2 * r.height}px`;
  }
}

/**
 * One car on the floor. item: { type, look?, mod?, label?, problems?, yaw?, speed?, init?(car), tick?(car, dt, T) }.
 * drive: the car shuttles along its heading (2.5 s forward, 2.5 s parked, 2.5 s reverse, 2.5 s parked).
 */
function addCar(item, x, z, { yaw = 0, drive = false, spin = false } = {}) {
  const mod = item.mod || C;
  const car = mod.createCar(item.look || lookFor(item.type));
  const g = car.group;
  g.position.set(x, 0, z);
  g.rotation.y = item.yaw ?? yaw;
  if (item.problems) car.setProblems(item.problems);
  item.init?.(car);
  scene.add(g);
  let v = 0, off = 0, ph = Math.random() * 0.5;
  const yaw0 = g.rotation.y;
  updaters.push((dt) => {
    let sp = item.speed ?? 0;
    if (drive) {
      ph += dt;
      const p = ph % 10, want = p < 2.5 ? 2.2 : p < 5 ? 0 : p < 7.5 ? -1.6 : 0;
      v += Math.sign(want - v) * Math.min(Math.abs(want - v), dt * 4);
      off += v * dt;
      sp = v;
      g.position.set(x + Math.sin(yaw0) * off, g.position.y, z + Math.cos(yaw0) * off);
    }
    if (spin) g.rotation.y = yaw0 + T * 0.35;
    const r = item.tick?.(car, dt, T);
    if (typeof r === 'number') sp = r;
    car.update(dt, sp);
  });
  if (item.label) label(item.label, g, item.labelY ?? 2.0);
  return car;
}

/** Lay items out in a grid (x across, rows going north) and frame the camera on it. */
function grid(items, { cols, dx = 3.4, dz = 4.4, yaw = 0, drive = false, spin = false, pitch = 0.9 } = {}) {
  cols = Math.max(1, Math.min(items.length, cols));
  const rows = Math.ceil(items.length / cols);
  const cars = items.map((it, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    return addCar(it, (c - (cols - 1) / 2) * dx, -r * dz, { yaw, drive, spin });
  });
  const W = (cols - 1) * dx + 3.6, D = (rows - 1) * dz + 3.6, cz = -((rows - 1) * dz) / 2;
  plane(-W / 2 - 30, W / 2 + 30, cz - D / 2 - 30, cz + D / 2 + 30, 0xd9e0e3, 0);
  frame(0, cz, W, D, pitch);
  return cars;
}
let frameArgs = null;
function frame(cx, cz, W, D, pitch) {
  frameArgs = [cx, cz, W, D, pitch];
  const aspect = camera.aspect || 1, vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * aspect);
  const R = Math.max(W / 2 / Math.tan(hf), (D * Math.sin(pitch) + 2.4) / 2 / Math.tan(vf)) * 1.08 + 2;
  const h = +(q.get('h') ?? R * Math.sin(pitch)), d = +(q.get('d') ?? R * Math.cos(pitch));
  const x = +(q.get('cx') ?? cx), z = +(q.get('cz') ?? cz);
  camera.position.set(x, h, z + d); camera.lookAt(x, 0.4, z);
  sun.position.set(x - 10, 22, z + 12); sun.target.position.set(x, 0, z);
}
const defCols = (n) => +(q.get('cols') ?? (innerWidth < innerHeight ? Math.min(n, 3) : Math.min(n, 6)));
const info = (t) => { document.getElementById('info').textContent = t; };

function resize() {
  const w = view === 'game' ? Math.min(innerWidth, Math.round(innerHeight * 0.5625)) : innerWidth;
  renderer.setSize(w, innerHeight);
  camera.aspect = w / innerHeight;
  if (view === 'game') camera.fov = w / innerHeight < 0.5 ? 47 : 44;
  camera.updateProjectionMatrix();
  if (frameArgs) frame(...frameArgs);
}
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- states
const PC = Object.fromEntries(Object.entries(PAINT_COLORS).map(([k, v]) => [k, v.hex]));
/** A tick that calls fn(car) every `period` s (first call right away). */
const every = (period, fn) => { let k = period; return (car, dt) => { k += dt; if (k >= period) { k = 0; fn(car); } }; };
const parseSets = (str) => str.split(',').filter(Boolean).map((s) => (s === 'all' ? ALL_PROBLEMS : s === 'none' ? [] : s.split('+')));
// Each state: [label, () => item props]. Item props: init(car), tick(car, dt, T) (may return a speed), speed.
const STATES = {
  dirt: [['clean', () => ({})], ['dirt .2', () => ({ init: (c) => c.setDirt(0.2) })], ['dirt .5', () => ({ init: (c) => c.setDirt(0.5) })],
    ['dirt 1', () => ({ init: (c) => c.setDirt(1) })]],
  foam: [['foam .2', () => ({ init: (c) => { c.setDirt(1); c.setFoam(0.2); } })], ['foam .5', () => ({ init: (c) => { c.setDirt(1); c.setFoam(0.5); } })],
    ['foam 1', () => ({ init: (c) => c.setFoam(1) })], ['tri foam 1', () => ({ init: (c) => c.setFoam(1, { tri: true }) })],
    ['soap>rinse', () => ({ tick: every(7, (c) => { c.setFoam(1); setTimeout(() => { c.setFoam(0); c.setWet(true); }, 3000); }) })]],
  wet: [['wet (drips, dries)', () => ({ tick: every(8, (c) => c.setWet(true)) })],
    ['wet, blown dry 1.5s', () => ({ tick: every(8, (c) => { c.setWet(true); setTimeout(() => c.setWet(false), 1500); }) })],
    ['wet + dirt', () => ({ init: (c) => c.setDirt(0.6), tick: every(8, (c) => c.setWet(true)) })]],
  mask: [['masked', () => ({ init: (c) => c.setMasked(true) })],
    ['masked + spray', () => { let k = 0, base = null; return { init: (c) => { base = c.look.color; c.setMasked(true); }, tick: (c, dt) => { k += dt * 0.2; if (k > 1.25) { k = 0; c.setColor(base, 1); } c.setColor(PC.blue, Math.min(1, k)); } }; }],
    ['masked + damage', () => ({ init: (c) => { c.setMasked(true); c.setProblems(['tire', 'paint']); } })]],
  stripe: [['stripe white', () => ({ init: (c) => c.setStripe(PC.white) })], ['red + black stripe', () => ({ init: (c) => { c.setColor(PC.red); c.setStripe(PC.black); } })],
    ['stripe lime', () => ({ init: (c) => c.setStripe(PC.lime) })], ['stripe, then off', () => ({ tick: every(2, (c) => c.setStripe(c.__s = c.__s ? null : PC.gold)) })]],
  gloss: [['dull [0,0,0,0]', () => ({ init: (c) => c.setGloss([0, 0, 0, 0]) })], ['neutral .5', () => ({ init: (c) => c.setGloss([0.5, 0.5, 0.5, 0.5]) })],
    ['mirror [1,1,1,1]', () => ({ init: (c) => c.setGloss([1, 1, 1, 1]) })], ['front+back [1,0,1,0]', () => ({ init: (c) => c.setGloss([1, 0, 1, 0]) })],
    ['polish lap (live)', () => { const g = [0, 0, 0, 0]; let k = 0; return { tick: (c, dt) => { k += dt; const side = Math.floor(k / 2) % 5; if (side === 4) { if (k > 10) { k = 0; g.fill(0); } } else g[side] = Math.min(1, (k % 2) / 2 + 0.01); c.setGloss(g); } }; }]],
  hazard: [['hazard', () => ({ init: (c) => c.setHazard(true) })], ['hazard + engine', () => ({ init: (c) => { c.setHazard(true); c.setProblems(['engine', 'battery']); } })],
    ['hazard towed', () => ({ init: (c) => { c.setHazard(true); c.setTowed(1); } })]],
  tow: [['towed .5', () => ({ init: (c) => c.setTowed(0.5) })], ['towed 1', () => ({ init: (c) => c.setTowed(1) })],
    ['towed 1 driving', () => ({ init: (c) => c.setTowed(1), speed: 3 })], ['towed 1 + tire + battery', () => ({ init: (c) => { c.setTowed(1); c.setProblems(['tire', 'tire', 'battery']); } })]],
};

// ---------------------------------------------------------------- row views
if (view === 'row') {
  const yaw = +(q.get('yaw') ?? 0.6), drive = q.has('drive'), spin = q.has('spin');
  if (focus === 'types') {
    const types = pickTypes(SETS.all);
    const items = types.map((t, i) => ({ type: t, look: lookFor(t, i), label: t }));
    if (!q.get('types') && (SET === 'all' || SET === 'legacy')) items.splice(5, 0, { type: 'sports', look: C.randomCarLook({ vip: true }), label: 'gold VIP' });
    grid(items, { cols: defCols(items.length), yaw, drive, spin });
    info(`types (${SET}): ${items.length}`);
  } else if (focus === 'tyres') {
    const items = [];
    pickTypes(['compact', 'sports', 'muscle', 'suv', 'classic', 'hotrod']).forEach((t, i) => TYRE_STATES.forEach(([n, ps, st]) =>
      items.push({ type: t, look: lookFor(t, i), label: `${t} ${n}`, problems: ps, init: (c) => st && c.setTyreStory(st) })));
    grid(items, { cols: TYRE_STATES.length, yaw: +(q.get('yaw') ?? Math.PI / 2 + 0.5), drive, spin });
    info('tyres: healthy | flat | 2 flats | spare + flat | worn | 2 worn');
  } else if (focus === 'legacy') {
    const ps = parseSets(q.get('p') || 'none')[0];
    const looks = [...SETS.legacy.map((t, i) => ({ type: t, color: C.CAR_COLORS[i], vip: false })), { type: 'sports', color: 0xf0b429, vip: true }];
    const items = [];
    for (const lk of looks) {
      const n = lk.vip ? 'VIP' : lk.type;
      items.push({ type: lk.type, look: lk, mod: OLD, label: `old ${n}`, problems: ps }, { type: lk.type, look: lk, label: `new ${n}`, problems: ps });
    }
    grid(items, { cols: +(q.get('cols') ?? (innerWidth < innerHeight ? 2 : 4)), yaw, drive, spin });
    info(`legacy: pre-task cars.js (old) vs now (new), problems: ${ps.join('+') || 'none'}`);
  } else if (focus === 'damage') {
    const sets = parseSets(q.get('p') || 'tire,tire+tire,oil,battery,engine,paint,all');
    const types = pickTypes(SETS.town);
    const items = [];
    types.forEach((t, i) => sets.forEach((ps) => items.push({ type: t, look: lookFor(t, i), problems: ps, label: `${t} ${ps.length === 5 ? 'all' : ps.join('+')}` })));
    grid(items, { cols: +(q.get('cols') ?? sets.length), yaw: +(q.get('yaw') ?? Math.PI - 0.6), drive, spin });
    info(`damage: ${types.join(', ')}${drive ? ' (driving)' : ''}`);
  } else if (focus === 'states') {
    const st = q.get('st') || 'dirt';
    const types = pickTypes(['sedan', 'hatch', 'camper', 'roadster']);
    const items = [];
    for (const [name, mk] of STATES[st]) types.forEach((t, i) => items.push({ type: t, look: lookFor(t, i), label: `${t}: ${name}`, ...mk() }));
    grid(items, { cols: +(q.get('cols') ?? types.length), yaw, drive, spin });
    info(`states: ${st}`);
  } else if (focus === 'color') {
    const types = pickTypes(['compact', 'hatch', 'muscle', 'camper', 'classic', 'surfvan']);
    const hex = PC[q.get('c') || 'lime'];
    const items = [];
    types.forEach((t, i) => {
      const lk = lookFor(t, i);
      items.push({ type: t, look: lk, label: `${t} control` });
      for (const k of [0, 0.33, 0.66, 1]) items.push({ type: t, look: lk, label: `k ${k}`, init: (c) => c.setColor(hex, k) });
      let k = 0;
      items.push({ type: t, look: lk, label: 'live', tick: (c, dt) => { k += dt * 0.25; if (k > 1.3) { k = 0; c.setColor(lk.color, 1); } c.setColor(hex, Math.min(1, k)); } });
    });
    grid(items, { cols: 6, yaw, drive, spin });
    info(`setColor(${q.get('c') || 'lime'}, k): control car shares the same look`);
  } else if (focus === 'restore') {
    const types = pickTypes(SETS.classic);
    const items = [];
    for (const t of types) for (const st of [0, 1, 2, 3]) items.push({ type: t, look: lookFor(t), label: `${t} ${st}`, init: (c) => c.setRestore(st) });
    grid(items, { cols: 4, yaw, drive, spin });
    info('setRestore 0 wreck, 1 runs, 2 painted, 3 show');
  } else if (focus === 'wash') {
    // A run through the wash: soap arch (foam builds), brushes (dirt scrubbed off under the foam), rinse (foam off,
    // wet), blower (dry), shine. Arches at x = -4, 0, 4, 8; the car rolls +x at the wash's slow speed.
    const types = pickTypes(['sedan', 'suv', 'camper', 'supercar']);
    const arch = (x, color) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, types.length * 4.4), new THREE.MeshLambertMaterial({ color }));
      m.position.set(x, 0.03, -(types.length - 1) * 2.2); scene.add(m);
    };
    [[-4, 0xf7a8c8], [0, 0x5aa9e6], [4, 0x9fe3ff], [8, 0x8a8f96]].forEach(([x, c]) => arch(x, c));
    const items = types.map((t, i) => {
      let x = -10 - i * 1.5, zone = -1;
      return {
        type: t, look: lookFor(t, i), label: t, yaw: Math.PI / 2,
        init: (c) => c.setDirt(1),
        tick: (c, dt) => {
          x += dt * 1.6;
          if (x > 13) { x = -10; zone = -1; c.setDirt(1); }
          c.group.position.x = x;
          const z = x < -4 ? 0 : x < 0 ? 1 : x < 4 ? 2 : x < 8 ? 3 : 4;
          if (z !== zone) {
            zone = z;
            if (z === 1) c.setFoam(1);
            if (z === 2) c.setDirt(0);   // brushes scrub under the foam
            if (z === 3) { c.setFoam(0); c.setWet(true); }
            if (z === 4) { c.setWet(false); c.setShine(true); }
          }
          return 1.6;
        },
      };
    });
    grid(items, { cols: 1, dz: 4.4, yaw: Math.PI / 2 });
    frame(1.5, -(types.length - 1) * 2.2, 26, types.length * 4.4, 0.9);
    info('wash: soap (pink) > brushes (blue) > rinse (cyan) > blower (grey)');
  } else if (focus === 'towrun') {
    // Static: setTowed k with a cradle under the front axle at TOW_LIFT * k. Live: a stand-in truck tows cars round.
    const types = pickTypes(['compact', 'pickup', 'hatch', 'camper', 'hotrod', 'limo']);
    const ks = [0, 0.5, 1];
    const items = [];
    for (const t of types) for (const k of ks) items.push({ type: t, look: lookFor(t), label: `${t} tow ${k}`, init: (c) => c.setTowed(k) });
    const cars = grid(items, { cols: ks.length, yaw: Math.PI / 2, dx: 4.2, dz: 3.2 });
    const cradle = new THREE.MeshLambertMaterial({ color: 0x3d434c });
    cars.forEach((c, i) => {
      const k = ks[i % ks.length], m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 1.5), cradle);
      m.position.set(c.group.position.x + c.dims.ax, C.TOW_LIFT * k - 0.02, c.group.position.z);
      if (k > 0) scene.add(m);
    });
    // live: stand-in truck (yellow box) in a circle, car on its hitch with trailer kinematics
    const truckMat = new THREE.MeshLambertMaterial({ color: 0xf0b429 });
    [['sedan', 7], ['camper', 11]].forEach(([t, R], j) => {
      const truck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 3.6), truckMat);
      truck.castShadow = true; scene.add(truck);
      const cx = 22, cz = -8;
      const car = C.createCar(lookFor(t, j)); car.setTowed(1); car.setHazard(true); scene.add(car.group);
      let a = j * 2, yawC = null;
      const hitch = new THREE.Vector3();
      updaters.push((dt) => {
        const w = 3.2 / R; a += w * dt;
        const tx = cx + Math.cos(a) * R, tz = cz + Math.sin(a) * R, ty = Math.atan2(-Math.sin(a), Math.cos(a));
        truck.position.set(tx, 0.75, tz); truck.rotation.y = ty;
        hitch.set(tx - Math.sin(ty) * 2.0, 0, tz - Math.cos(ty) * 2.0);   // 0.2 behind the tail
        // trailer: the rear axle trails the hitch (front axle) at the wheelbase distance
        const wb = car.dims.ax - car.dims.axR;
        if (yawC == null) yawC = ty;
        const rx = hitch.x - Math.sin(yawC) * wb, rz = hitch.z - Math.cos(yawC) * wb;
        yawC = Math.atan2(hitch.x - rx, hitch.z - rz);
        car.group.rotation.y = yawC;
        car.group.position.set(hitch.x - Math.sin(yawC) * car.dims.ax, 0, hitch.z - Math.cos(yawC) * car.dims.ax);
        car.update(dt, 3.2);
      });
    });
    plane(5, 40, -25, 10, 0xd9e0e3, 0.001);
    if (q.has('live')) frame(22, -8, 26, 26, 0.95);
    info('tow: cradle top at TOW_LIFT*k under the front axle; &live frames the truck run');
  }
} else {
  // ---------------------------------------------------------------- the real game camera
  const g = q.get('grid') || 'lane';
  const old = q.has('old');
  let tx = +(q.get('tx') || 0), tz = +(q.get('tz') || -3);
  const place = (items, cols, dx, dz, yaw, z0) => items.forEach((it, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    addCar(it, tx + (c - (cols - 1) / 2) * dx, z0 + r * dz, { yaw });
  });
  if (g !== 'mix' || !q.has('env')) plane(-80, 80, -60, 60, 0xe6dcc8, 0);
  if (g === 'lane' || g === 'lift') {
    const types = pickTypes(SETS.all);
    const items = types.map((t, i) => ({ type: t, look: lookFor(t, i), label: t, mod: old && SETS.legacy.includes(t) ? OLD : C, labelY: 1.7 }));
    if (!q.get('types') && SET === 'all') items.splice(5, 0, { type: 'sports', look: { type: 'sports', color: 0xf0b429, vip: true }, label: 'VIP', labelY: 1.7 });
    if (g === 'lane') place(items, 4, 3.9, 2.7, Math.PI / 2, tz - 10.5);
    else place(items, 6, 2.5, 3.9, Math.PI, tz - 11);
  } else if (g === 'tyres') {
    // the lane as the player sees it, every car with tyre jobs: flat, spare + flat, worn in turn
    const items = pickTypes(SETS.all).map((t, i) => {
      const [n, ps, st] = TYRE_STATES[1 + (i % 5)];
      return { type: t, look: lookFor(t, i), label: `${t} ${n}`, labelY: 1.7, problems: ps, init: (c) => c.setTyreStory(st) };
    });
    place(items, 4, 3.9, 2.7, Math.PI / 2, tz - 10.5);
  } else if (g === 'restore') {
    const items = [];
    for (const t of pickTypes(SETS.classic)) for (const st of [0, 1, 2, 3]) items.push({ type: t, look: lookFor(t), label: `${t} ${st}`, labelY: 1.7, init: (c) => c.setRestore(st) });
    place(items, 4, 3.9, 3.0, Math.PI / 2, tz - 10);
  } else if (g === 'states') {
    const types = pickTypes(['compact', 'hatch', 'suv', 'roadster']);
    const rows = [['dirt 1', (c) => c.setDirt(1)], ['foam 1', (c) => c.setFoam(1)], ['masked', (c) => c.setMasked(true)],
      ['stripe', (c) => c.setStripe(PC.white)], ['gloss dull', (c) => c.setGloss([0, 0, 0, 0])], ['gloss mirror', (c) => c.setGloss([1, 1, 1, 1])],
      ['towed', (c) => { c.setTowed(1); c.setHazard(true); }], ['sweep .5', (c) => c.setColor(PC.lime, 0.5)]];
    const items = [];
    for (const [n, init] of rows) types.forEach((t, i) => items.push({ type: t, look: lookFor(t, i), label: n, labelY: 1.7, init }));
    place(items, types.length, 3.9, 2.9, Math.PI / 2, tz - 11);
  } else if (g === 'mix') {
    // The garage lot as in the game: lifts, lane, exit lane; old and new classes mixed.
    if (q.has('env')) {
      try { const m = await import('./environment.js'); const env = m.buildEnvironment(scene); updaters.push((dt) => env.update(dt, 0)); }
      catch (e) { console.warn('environment failed', e); plane(-80, 80, -60, 60, 0xe6dcc8, 0); }
    } else {
      plane(L.walls.minX, L.walls.maxX, L.walls.minZ, L.walls.maxZ, 0xd9e0e3, 0.005);
      plane(-80, 80, L.street.z - L.street.halfWidth, L.street.z + L.street.halfWidth, 0x5b5f6b, 0.004);
    }
    let P = null;
    try { P = await import('./props.js'); } catch (e) { console.warn('props failed', e); }
    const mixT = ['hatch', 'suv', 'muscle', 'camper', 'roadster', 'rally', 'compact', 'sedan', 'pickup', 'van', 'sports', 'limo'];
    const liftProb = [['tire', 'oil'], ['battery', 'engine'], ['paint', 'tire'], ['engine']];
    L.lifts.forEach((lf, i) => {
      const t = mixT[i * 2 % mixT.length];
      if (P) { const l = P.createLift(); l.group.position.set(lf.x, 0, lf.z); l.setHeight(1); l.setLight('busy'); scene.add(l.group); updaters.push((dt) => l.update(dt)); }
      const it = { type: t, look: lookFor(t, i), problems: liftProb[i], yaw: Math.PI };
      const c = addCar(it, lf.x, lf.z, {});
      c.group.position.y = P ? P.LIFT_RISE : 0;
    });
    const qp = [['engine'], ['tire', 'paint'], ['oil'], ['battery', 'tire']];
    L.queueSlots.forEach((s, i) => { const t = mixT[(i * 2 + 1) % mixT.length]; addCar({ type: t, look: lookFor(t, i + 4), problems: qp[i], yaw: Math.PI / 2, init: (c) => c.setDirt(i % 2 ? 0.8 : 0) }, s.x, L.queueLaneZ, {}); });
    addCar({ type: 'supercar', look: lookFor('supercar', 1), yaw: Math.PI / 2, speed: 3, init: (c) => c.setShine(true) }, -2, L.exitLaneZ, {});
    tz = +(q.get('tz') || -3);
  }
  camera.position.set(tx, 29, tz + 17.3); camera.lookAt(tx, 0, tz - 1.2);
  sun.position.set(tx - 8, 18, tz + 10); sun.target.position.set(tx, 0, tz);
  info(`game camera: ${g}${old ? ' (legacy = pre-task)' : ''}`);
}

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  T += dt;
  for (const u of updaters) u(dt);
  updateLeaks(dt);
  renderer.render(scene, camera);
  placeLabels();
}
loop();
window.__pv = { scene, camera, renderer, C };
