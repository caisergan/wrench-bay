// Town buildings preview (buildings agent). Two views:
//  ?focus=kit|site|wash|lounge|paint|vip|main|biz   rows of every factory at every level / tier / state
//      (&z=1.4 zooms the camera out / in, &cam=x,z re-targets it; the camera keeps the game's pitch)
//  ?view=game&tx=..&tz=..   the real game camera (offset 0,29,17.3, fov 44, portrait) over the town, with every
//      building at its real position. &noenv skips buildEnvironment, &nocars skips cars / people / trucks.
//      Levels: &tow=1..3 &wash=1..3 &lounge=1..2 &diner=1..5 &gas=1..5 &qf=1..5 &k=1.6 (zoom out factor)
import * as THREE from 'three';
import * as CFG from '../config.js';
import * as T from './props-town.js';
import * as BH from './buildings-home.js';
import * as BM from './buildings-main.js';

const { LOUNGE, PAINT, VIP, WASH, PROJECT, RESCUE, PROPERTIES, SERVICES, TOWN, BUSINESS, LUNCH, MANAGERS, PAINT_COLORS, CLASSICS, DISTRICTS } = CFG;
const q = new URLSearchParams(location.search);
const view = q.get('view') || 'row';
const focus = q.get('focus') || 'kit';
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
scene.fog = new THREE.Fog(0x9fd8cb, 45, 120);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a88f, 1.4));
const sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(44, 0.5625, 0.5, 220);
const updaters = [];
const info = document.getElementById('info');
const tx = num('tx', 0), tz = num('tz', -2);

let M = {}, C = null, H = null, V = null;
try { M = await import('./props.js'); } catch (e) { console.warn('props.js failed', e); }
if (!q.has('nocars')) {
  try { C = await import('./cars.js'); } catch (e) { console.warn('cars.js failed', e); }
  try { H = await import('./characters.js'); } catch (e) { console.warn('characters.js failed', e); }
  try { V = await import('./vehicles.js'); } catch (e) { console.warn('vehicles.js failed', e); }
}

function add(obj, x, z, yaw = 0, y = 0) {
  const g = obj.group ?? obj;
  if (g.userData.world) {
    // world-built building: (x, z) = where its plot centre should go; none given = stays at its real place
    const c = g.userData.centre ?? { x: 0, z: 0 };
    if (x === undefined) g.position.set(0, y, 0); else g.position.set(x - c.x, y, z - c.z);
  } else { g.position.set(x ?? 0, y, z ?? 0); g.rotation.y = yaw; }
  scene.add(g);
  if (obj.update) updaters.push((dt) => obj.update(dt));
  return obj;
}
function label(text, x, y, z) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(31,35,41,0.75)'; g.beginPath(); g.roundRect(0, 8, 512, 80, 20); g.fill();
  g.fillStyle = '#fff6e6'; g.font = '600 46px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(2.8, 0.52, 1); s.position.set(x, y, z); s.renderOrder = 10;
  scene.add(s);
}
function car(look, x, z, yaw = 0, { y = 0, problems = [] } = {}) {
  if (!C) return null;
  try {
    const c = C.createCar(look); c.group.position.set(x, y, z); c.group.rotation.y = yaw; c.setProblems(problems);
    scene.add(c.group); updaters.push((dt) => c.update(dt, 0)); return c;
  } catch (e) { console.warn(e); return null; }
}
function person(look, x, z, yaw = 0, { sit = false } = {}) {
  if (!H) return null;
  try {
    const c = H.createCharacter(look); c.group.position.set(x, 0, z); c.group.rotation.y = yaw; if (sit) c.setSitting(true);
    scene.add(c.group); updaters.push((dt) => c.update(dt, 0)); return c;
  } catch (e) { console.warn(e); return null; }
}
const cust = () => (H?.randomCustomerLook ? H.randomCustomerLook() : {});
function plane(minX, maxX, minZ, maxZ, color, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2; m.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2); m.receiveShadow = true;
  scene.add(m);
}
const pc = (p) => ({ x: (p.minX + p.maxX) / 2, z: (p.minZ + p.maxZ) / 2 });
/** Rows of items: [{name, make, w}] laid out left to right, rows top to bottom. */
function rows(list, gapX = 1.6, rowD = 9) {
  let z = 0;
  const all = [];
  for (const row of list) {
    const total = row.reduce((s, it) => s + (it.w ?? 3) + gapX, -gapX);
    let x = -total / 2;
    for (const it of row) {
      const w = it.w ?? 3;
      const obj = it.make();
      add(obj, x + w / 2, z, it.yaw ?? 0);
      if (it.after) it.after(obj, x + w / 2, z);
      if (q.get('labels') !== '0') label(it.name, x + w / 2, it.ly ?? 3.6, z + 0.5);
      all.push({ x: x + w / 2, z });
      x += w + gapX;
    }
    z += row.rd ?? rowD;
  }
  return { cx: 0, cz: (z - (list.at(-1)?.rd ?? rowD)) / 2 };
}

// ---------------------------------------------------------------- row views
function rowView() {
  plane(-80, 80, -80, 80, 0xbfd9cf, -0.01);
  let r = { cx: 0, cz: 0 }, zoom = 1;
  if (focus === 'kit') {
    const sale = () => T.createForSaleSign();
    r = rows([
      [{ name: 'for sale', make: sale, w: 2 }, { name: 'locked 7', make: () => { const s = T.createForSaleSign(); s.setState('locked', 7); return s; }, w: 2 },
        { name: 'hoarding', make: T.createHoardingPanel, w: 3 }, { name: 'hoarding', make: T.createHoardingPanel, w: 3 }, { name: 'hoarding', make: T.createHoardingPanel, w: 3 },
        { name: 'bus stop', make: T.createBusStop, w: 4.2 }],
      [{ name: 'boom closed', make: T.createBoomGate, w: 5.5 }, { name: 'boom open', make: () => { const b = T.createBoomGate(); b.setOpen(1); return b; }, w: 5.5 },
        { name: 'chain 6', make: () => T.createChainBarrier(6), w: 6 }, { name: 'chain down', make: () => { const c = T.createChainBarrier(4); c.userData.setDown(true); return c; }, w: 4 }],
      [{ name: 'parking bay', make: T.createParkingBay, w: 2.6 }, { name: 'drop ring', make: T.createDropRing, w: 3.2 }, { name: 'golden wrench', make: T.createGoldenWrench, w: 1.2 },
        { name: 'tip tray', make: T.createTipTray, w: 1 }, { name: 'coins', make: () => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const c = T.createCoinStack(); c.position.y = i * 0.09; g.add(c); } return g; }, w: 0.6 },
        { name: 'safe', make: T.createSafe, w: 1 }, { name: 'crew table', make: T.createCrewTable, w: 1.4 }],
    ], 1.2, 7);
    zoom = 0.62;
  } else if (focus === 'site') {
    const site = (w, d, p) => () => { const s = T.createConstructionSite(w, d); s.setProgress(p); return s; };
    r = rows([
      [{ name: '3x6 p0', make: site(3, 6, 0), w: 3 }, { name: '3.4x6.6 p.5', make: site(3.4, 6.6, 0.5), w: 3.4 }, { name: '3.2x5.4 p1', make: site(3.2, 5.4, 1), w: 3.2 },
        { name: '12x10 p.6', make: site(12, 10.4, 0.6), w: 12 }],
      Object.assign([{ name: '26x23.5 p.4', make: site(26, 23.5, 0.4), w: 26 }, { name: '14x12.4 p.9', make: site(14, 12.4, 0.9), w: 14 }], { rd: 20 }),
    ], 2, 14);
    zoom = 1.5;
  } else if (focus === 'wash') {
    const items = [1, 2, 3].map((l) => ({ name: `tow shed ${l}`, w: 4, make: () => BH.createTowShed(l), after: (o, x, z) => { if (V) { const t = V.createTowTruck(l >= 2 ? 2 : 1); t.group.position.set(x, 0, z - 0.1); scene.add(t.group); } } }));
    const kiosks = [1, 2, 3].map((l) => ({ name: `kiosk ${l}`, w: 1.8, make: () => BH.createWashKiosk(l) }));
    r = rows([items.concat(kiosks)], 1.5, 10);
    // the arches are world-built: show all three tiers side by side by offsetting their groups
    for (let i = 0; i < 3; i++) {
      const a = BH.createWashArches(i + 1);
      a.group.position.set(-6 + i * 6 - WASH.x, 0, 12 - 7);
      scene.add(a.group); a.setRunning(true);
      const c = car(C?.randomCarLook?.() ?? {}, -6 + i * 6, 0);
      let k = i * 1.5;
      updaters.push((dt) => {
        k = (k + dt * 0.9) % 7;
        const z = WASH.zone.minZ - 1 + k;
        if (c) c.group.position.z = z - 7 + 12 - 0;
        a.setCarZ(z); a.update(dt);
      });
      label(`wash tier ${i + 1}`, -6 + i * 6, 4, 12);
    }
    r.cz = 5; zoom = 1.1;
  } else if (focus === 'lounge') {
    const t = num('tier', 1);
    const l = BH.createLoungeAnnex(t); add(l);
    seatPeople();
    r = { cx: 17.4, cz: -4.5 }; zoom = 0.75;
  } else if (focus === 'paint') {
    const h = BH.createPaintHall(); add(h);
    paintInterior();
    r = { cx: -30.5, cz: -1 }; zoom = 1.25;
  } else if (focus === 'vip') {
    vipAll();
    r = { cx: 36, cz: -1 }; zoom = 1.2;
  } else if (focus === 'main') {
    mainAll();
    r = { cx: 0, cz: -31 }; zoom = 2.6;
  } else if (focus === 'biz') {
    const list = [];
    for (const l of [1, 2, 3, 4, 5]) list.push({ name: `diner ${l}`, w: 14, make: () => { const d = BM.createDiner(l); const g = d.group ?? d; g.position.x -= pc(PROPERTIES.diner.plot).x; g.position.z -= pc(PROPERTIES.diner.plot).z; const w = new THREE.Group(); w.add(g); if (d.update) w.userData.u = d.update; return w; } });
    r = rows([list], 2, 10);
    r.cz = 0; zoom = 2.2;
  }
  zoom *= num('z', 1);
  const camAt = q.get('cam') ? q.get('cam').split(',').map(Number) : [r.cx, r.cz];
  camera.fov = 44;
  camera.position.set(camAt[0], 29 * zoom, camAt[1] + 17.3 * zoom); camera.lookAt(camAt[0], 0, camAt[1] - 1.2 * zoom);
  sun.position.set(camAt[0] - 8, 18, camAt[1] + 10); sun.target.position.set(camAt[0], 0, camAt[1]);
  Object.assign(sun.shadow.camera, { left: -30 * zoom, right: 30 * zoom, top: 30 * zoom, bottom: -30 * zoom }); sun.shadow.camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- building populations (shared by both views)
function seatPeople() {
  LOUNGE.seats.forEach((s, i) => { if (i % 4 !== 3) person(cust(), s.x, s.z, LOUNGE.seatYaw, { sit: true }); });
  const tt = T.createTipTray(); add(tt, LOUNGE.tipTray.x, LOUNGE.tipTray.z);
  if (M.createCashStack) for (let i = 0; i < 3; i++) { const c = M.createCashStack(); c.position.copy(tt.userData.anchor.position); c.position.y += i * 0.09; tt.add(c); }
  for (let i = 0; i < 3; i++) { const c = T.createCoinStack(); c.position.set(LOUNGE.vendingPile.x, i * 0.09, LOUNGE.vendingPile.z); scene.add(c); }
  person(cust(), LOUNGE.aisleX[0], -1.2, Math.PI);
}
function paintInterior() {
  PAINT.bays.forEach((b, i) => {
    const bo = BH.createSprayBooth(); add(bo, b.x, b.z);
    const st = ['spray', 'cure'][i]; bo.setLamp(st);
    let k = 0; updaters.push((dt) => { k = (k + dt * 0.15) % 1; bo.setTimer(k); });
    const c = car(C?.randomCarLook?.() ?? {}, b.x, b.z, Math.PI);
  });
  for (const [id, s] of Object.entries(PAINT.stations)) {
    const tk = BH.createPaintTank(id); add(tk, s.x, s.z);
    let p = Math.random(); updaters.push((dt) => { p = (p + dt * 0.25) % 1.1; tk.setProgress(Math.min(1, p)); });
    if (M.createPart) for (let i = 0; i < 3; i++) { const pp = M.createPart(`spray:${id}`); pp.position.copy(tk.partAnchor.position); pp.position.y += i * (M.PART_H ?? 0.26); tk.group.add(pp); }
  }
  PAINT.queueSlots.forEach((s, i) => { if (i < 2) car(C?.randomCarLook?.() ?? {}, s.x, PAINT.queueLaneZ, Math.PI / 2); });
  PAINT.loungeSpots.forEach((s, i) => { if (i % 2 === 0) person(cust(), s.x, s.z, Math.PI); });
}
function vipAll() {
  const h = BH.createVipHall(); add(h);
  VIP.bays.forEach((b, i) => {
    const l = BH.createGoldLift(); add(l, b.x, b.z); l.setLight(i ? 'done' : 'busy'); l.setHeight(i ? 0 : 1);
    if (i === 0) car({ type: 'supercar', color: 0xf3c64e, vip: true }, b.x, b.z, Math.PI, { y: l.platform.position.y });
  });
  const cab = BH.createPremiumCabinet(); add(cab, VIP.stations.premium.x, VIP.stations.premium.z);
  let p = 0; updaters.push((dt) => { p = (p + dt * 0.25) % 1.1; cab.setProgress(Math.min(1, p)); });
  if (M.createPart) for (let i = 0; i < 3; i++) { const pp = M.createPart('premium'); pp.position.copy(cab.partAnchor.position); pp.position.y += i * (M.PART_H ?? 0.26); cab.group.add(pp); }
  const tt = BH.createTurntable(); add(tt, VIP.turntable.x, VIP.turntable.z); tt.setGlow(true);
  const tc = car({ type: 'limo', color: 0x24262b }, 0, 0, 0);
  if (tc) { tt.platform.add(tc.group); tc.group.position.set(0, 0, 0); }
  let a = 0; updaters.push((dt) => { a += dt * 0.4; tt.setAngle(a); });
  const rc = BH.createRedCarpet(); add(rc, VIP.redCarpet.x, (VIP.redCarpet.zFrom + VIP.redCarpet.zTo) / 2);
  const bar = BH.createVipBar(); add(bar, VIP.bar.x, VIP.bar.z);
  const hs = BH.createHostStand(); add(hs, VIP.valetStand.x, VIP.valetStand.z);
  const pz = BH.createPaparazziWall(); add(pz, 31.6, 10.2, 0);
  VIP.loungeSpots.forEach((s) => person(H?.vipCustomerLook ? H.vipCustomerLook() : cust(), s.x, s.z, -Math.PI / 2, { sit: true }));
  car({ type: 'gsuv', color: 0xf4f1ea }, VIP.queueSlots[0].x, VIP.queueLaneZ, Math.PI / 2);
  const safe = T.createSafe(); add(safe, MANAGERS.vip.safe.x, MANAGERS.vip.safe.z);
}
function mainAll() {
  const j = BM.createJunkyard(); add(j);
  const d = BM.createDepot(); add(d, pc(SERVICES.depot.plot).x, pc(SERVICES.depot.plot).z);
  const di = BM.createDiner(num('diner', 3)); add(di);
  const ac = BM.createAcademy(); add(ac, pc(SERVICES.academy.plot).x, pc(SERVICES.academy.plot).z);
  const sh = BM.createShowroom(); add(sh);
  if (sh.turntables) sh.turntables.forEach((t2, i) => { t2.setGlow(i === 1); const c = car({ type: CLASSICS[i * 2]?.id ?? 'sedan', color: [0xe5484d, 0x3b82c4, 0xf6c453][i] }, 0, 0, 0); if (c) t2.platform.add(c.group); });
  PROJECT.stands.forEach((s, i) => car({ type: CLASSICS[i].id, color: 0x8a6a50 }, s.x, s.z, Math.PI));
}
function bizAll() {
  add(BM.createGasStation(num('gas', 3)));
  add(BM.createQuickFit(num('qf', 3)));
  add(BM.createFerryTerminal(), pc(PROPERTIES.ferry.plot).x, pc(PROPERTIES.ferry.plot).z);
}

// ---------------------------------------------------------------- game view
async function gameView() {
  if (!q.has('noenv')) {
    try { const E = await import('./environment.js'); const env = E.buildEnvironment(scene); updaters.push((dt) => env.update(dt, performance.now() / 1000)); }
    catch (e) { console.warn('environment failed', e); plane(-70, 70, -40, 25, 0x7cc6b3, -0.02); }
  } else plane(-70, 70, -40, 25, 0x7cc6b3, -0.02);
  // tow shed + truck
  const tp = pc(PROPERTIES.tow.plot);
  add(BH.createTowShed(num('tow', 1)), tp.x, tp.z);
  if (V) { try { const tr = V.createTowTruck(num('tow', 1) >= 2 ? 2 : 1); tr.group.position.set(RESCUE.truck.home.x, 0, RESCUE.truck.home.z); scene.add(tr.group); } catch (e) { console.warn(e); } }
  add(T.createDropRing(), RESCUE.drop.x, RESCUE.drop.z);
  for (const p of TOWN.parking) add(T.createParkingBay(), p.x, p.z, p.yaw);
  // wash
  const wa = BH.createWashArches(num('wash', 2)); add(wa); wa.setRunning(true);
  add(BH.createWashKiosk(num('wash', 2)), 15.9, 5.0, -Math.PI / 2);
  const wc = car(C?.randomCarLook?.() ?? {}, WASH.x, 6, 0);
  let k = 0;
  updaters.push((dt) => { k = (k + dt * 0.8) % 9; const z = 3.5 + k; if (wc) wc.group.position.z = z; wa.setCarZ(z); });
  for (let i = 0; i < 3; i++) { const c = T.createCoinStack(); c.position.set(WASH.pile.x, i * 0.09, WASH.pile.z); scene.add(c); }
  // lounge
  add(BH.createLoungeAnnex(num('lounge', 1)));
  seatPeople();
  // paint + vip
  add(BH.createPaintHall());
  paintInterior();
  vipAll();
  // crew table + garage safe
  add(T.createCrewTable(), LUNCH.table.x, LUNCH.table.z);
  add(T.createSafe(), MANAGERS.garage.safe.x, MANAGERS.garage.safe.z);
  add(T.createSafe(), MANAGERS.paint.safe.x, MANAGERS.paint.safe.z);
  // main street + corners
  mainAll();
  bizAll();
  // wrenches + town kit along the edges
  for (const w of TOWN.wrenches) add(T.createGoldenWrench(), w.x, w.z);
  if (q.has('sale')) for (const [id, p] of Object.entries(PROPERTIES)) { const s = T.createForSaleSign(); s.setState(id === 'vip' ? 'locked' : 'sale', 8); add(s, p.pad.x + 1.6, p.pad.z - 0.8); }
  if (q.has('gate')) {
    const H0 = DISTRICTS.main.hoarding;
    for (let x = H0.minX + 1.5; x < H0.maxX; x += 3) { const hp = T.createHoardingPanel(); add(hp, x, H0.z); }
    for (const b of DISTRICTS.main.booms) add(T.createBoomGate(), b.x, b.z);
  }
  // garage context: a lift or two so scale reads
  if (M.createLift) CFG.LAYOUT.lifts.forEach((l, i) => { const lf = M.createLift(); add(lf, l.x, l.z); if (i < 2) car(C?.randomCarLook?.() ?? {}, l.x, l.z, Math.PI); });
  const kk = num('k', 1);
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
