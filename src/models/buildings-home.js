// Home-block buildings (TOWN.md section 7): tow shed, car wash, lounge annex, paint shop, VIP club and their
// equipment. Same way of working as props.js / environment.js: one merged vertex-coloured mesh per rigid piece
// (voxel.js Builder via geo()), cached per look; moving bits are separate small meshes sharing materials.
// Placement (TOWN.md 7 + lead's rule): property buildings (tow shed, wash arches, lounge annex, paint hall, VIP hall)
// are built in WORLD coordinates from the config and carry group.userData.world = true (gameplay adds them at 0,0,0).
// Equipment (booth, tank, gold lift, cabinet, turntable, carpet, bar, paparazzi wall, host stand, kiosk) is built at
// the origin, front facing +z, and placed by gameplay.
import * as THREE from 'three';
import { LOUNGE, PAINT, VIP, WASH, PROPERTIES, RESCUE, PAINT_COLORS, PALETTE as P } from '../config.js';
import { Builder, litMat, glowMat, mesh, memo } from './voxel.js';
import {
  TC, PI, R90, FONT, css, geo, solidGroup, canvasTex, face, decal, signTex, roofSign, glassMat, glassTintMat, glassPane,
  flat, mixHex, floorPlane, hallShell, wallWindow, plant, tireFlat, tireUp,
} from './props-town.js';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const noop = () => {};
const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));
const plotCentre = (p) => ({ x: (p.minX + p.maxX) / 2, z: (p.minZ + p.maxZ) / 2 });
const geo2Cache = new Map();
/** Two cached merged geometries from one build: [lit (litMat), glow (glowMat) | null]. */
function geo2(key, fn) {
  return memo(geo2Cache, key, () => {
    const b = new Builder(), g = new Builder();
    fn(b, g);
    return [b.build(), g.geos.length ? g.build() : null];
  });
}
function addGeo2(group, pair, { cast = true, receive = true } = {}) {
  group.add(mesh(pair[0], litMat, { cast, receive }));
  if (pair[1]) group.add(mesh(pair[1], glowMat, { cast: false }));
}
/** Solid boxes of a hall with an open south front (inner faces W.minX/maxX/minZ, walls outside, thickness t). */
function hallSolids(W, t = W.thickness ?? 0.3) {
  return [
    { minX: W.minX - t, maxX: W.maxX + t, minZ: W.minZ - t, maxZ: W.minZ },
    { minX: W.minX - t, maxX: W.minX, minZ: W.minZ - t, maxZ: W.maxZ },
    { minX: W.maxX, maxX: W.maxX + t, minZ: W.minZ - t, maxZ: W.maxZ },
  ];
}
/** Unlit lamp materials, shared. */
const LAMP = {
  off: new THREE.MeshLambertMaterial({ color: 0x4a5560 }),
  warm: new THREE.MeshBasicMaterial({ color: 0xfff1b8 }),
  amber: new THREE.MeshBasicMaterial({ color: 0xffb21e }),
  amberDim: new THREE.MeshLambertMaterial({ color: 0x9a6a1a }),
  green: new THREE.MeshBasicMaterial({ color: 0x6dff8a }),
  red: new THREE.MeshBasicMaterial({ color: 0xff5a4a }),
  heat: new THREE.MeshBasicMaterial({ color: 0xff7a3a }),
  heatDim: new THREE.MeshLambertMaterial({ color: 0x8a4a30 }),
  blue: new THREE.MeshBasicMaterial({ color: 0x9fe6ff }),
  gold: new THREE.MeshBasicMaterial({ color: 0xffd76a }),
};

// ================================================================ turntable (VIP detailing + showroom)
// Round deck r 2.0 flush in a steel pit ring (top at 0.06, a car drives on and off), gold rim, LED ring on the
// fixed base that chases while setGlow(true). `platform` turns with setAngle; a car parked on it can be a child.
const TT_R = 2.0, TT_H = 0.06;
const ttBaseGeo = () => geo('tt|base', (b) => {
  b.cyl(TT_R + 0.36, TT_R + 0.4, 0.04, 0x2b3038, 0, 0, 0, 32);               // steel pit ring (top 0.04)
  for (let i = 0; i < 4; i++) {                                             // little service hatches on the ring
    const a = i * R90 + PI / 4;
    b.box(0.22, 0.008, 0.12, TC.STEEL_D, Math.cos(a) * (TT_R + 0.29), 0.04, Math.sin(a) * (TT_R + 0.29), 0, -a);
  }
});
const ttDeckGeo = () => geo('tt|deck', (b) => {
  b.cyl(TT_R, TT_R, 0.03, 0x3a4049, 0, -0.03, 0, 32);                       // deck (top = platform y)
  b.cyl(TT_R + 0.08, TT_R + 0.08, 0.024, TC.GOLD, 0, -0.03, 0, 32);           // polished rim band around it
  // radial tread plates (show the turning from the camera)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    b.box(TT_R * 0.78, 0.006, 0.05, i % 4 ? 0x50575f : TC.GOLD_D, Math.cos(a) * TT_R * 0.55, 0, Math.sin(a) * TT_R * 0.55, 0, -a);
  }
  b.cyl(0.42, 0.42, 0.008, TC.GOLD, 0, 0, 0, 16);                           // hub medallion
  b.cyl(0.3, 0.3, 0.01, 0x2b3038, 0, 0.002, 0, 16);
  // two wheel guide strips (where a car's tyres sit, along local z)
  for (const x of [-0.62, 0.62]) b.box(0.3, 0.006, 2.9, 0x2f343b, x, 0.001, 0);
});
const ttLedGeo = (odd) => geo(`tt|led|${odd}`, (b) => {
  const n = 32;
  for (let i = odd; i < n; i += 2) {
    const a = (i / n) * PI * 2;
    b.box(0.12, 0.02, 0.07, 0xffffff, Math.cos(a) * (TT_R + 0.22), 0.04, Math.sin(a) * (TT_R + 0.22), 0, -a);
  }
});
export function createTurntable() {
  const group = new THREE.Group();
  group.add(mesh(ttBaseGeo(), litMat, { cast: false, receive: true }));
  const leds = [0, 1].map((o) => { const m = new THREE.Mesh(ttLedGeo(o), LAMP.off); group.add(m); return m; });
  const platform = new THREE.Group();
  platform.position.y = TT_H;
  platform.add(mesh(ttDeckGeo(), litMat, { cast: false, receive: true }));
  group.add(platform);
  let glow = false, t = 0;
  function setAngle(a) { platform.rotation.y = a || 0; }
  function setGlow(on) {
    glow = !!on;
    if (!glow) for (const m of leds) m.material = LAMP.off;
  }
  function update(dt = 0.016) {
    t += dt;
    if (glow) {
      const k = Math.floor(t * 5) % 2;
      leds[0].material = k ? LAMP.gold : LAMP.warm;
      leds[1].material = k ? LAMP.warm : LAMP.gold;
    }
  }
  return { group, platform, setAngle, setGlow, update };
}

// ================================================================ shared bits for the buildings below
/** Corrugated steel sheet wall along local x (length len, height h, thickness t), ribs on the +z face ('in'),
 *  the -z face ('out') or both. Bottom centre at the current Builder origin. */
function corrugated(b, len, h, t, c1, c2, ribs = 'in') {
  b.box(len, h, t, c1, 0, 0, 0);
  const n = Math.max(1, Math.floor(len / 0.2));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * (len / n);
    if (ribs !== 'out') b.box(0.07, h - 0.04, 0.03, c2, x, 0.02, t / 2 + 0.015);
    if (ribs !== 'in') b.box(0.07, h - 0.04, 0.03, c2, x, 0.02, -t / 2 - 0.015);
  }
}
/** Traffic cone. */
function cone(b, x, z, s = 1) {
  b.box(0.3 * s, 0.04 * s, 0.3 * s, 0xe8622c, x, 0, z);
  b.cyl(0.035 * s, 0.13 * s, 0.42 * s, 0xf2813a, x, 0.04 * s, z, 8);
  b.cyl(0.085 * s, 0.1 * s, 0.07 * s, TC.WHITE, x, 0.18 * s, z, 8);
}
/** Red jerry can (0.3 wide x 0.42 tall x 0.14 deep). */
function jerryCan(b, x, z, ry = 0, c = 0xc93b30) {
  b.push(x, 0, z, ry);
  b.box(0.3, 0.38, 0.14, c, 0, 0, 0);
  b.box(0.22, 0.04, 0.12, mixHex(c, 0x000000, 0.2), 0, 0.38, 0);
  b.box(0.06, 0.08, 0.06, TC.STEEL_DD, 0.1, 0.38, 0);
  b.box(0.12, 0.06, 0.03, mixHex(c, 0x000000, 0.25), -0.05, 0.4, 0);
  b.pop();
}
/** Hanging chain: n links straight down from (x, y, z) on a wall face (+z out of the wall). */
function chain(b, x, y, z, n, c = TC.STEEL_D) {
  b.box(0.06, 0.06, 0.12, TC.STEEL_DD, x, y, z - 0.04);                   // hook
  for (let i = 0; i < n; i++) b.box(i % 2 ? 0.025 : 0.07, 0.1, i % 2 ? 0.07 : 0.025, i % 2 ? c : mixHex(c, 0xffffff, 0.2), x, y - 0.1 - i * 0.085, z);
}
/** Coiled strap / cable hanging on a wall: a short fat cylinder facing +z. */
function coil(b, x, y, z, r, c) {
  b.cyl(r, r, 0.1, c, x, y, z - 0.05, 12, R90);
  b.cyl(r * 0.55, r * 0.55, 0.11, mixHex(c, 0x000000, 0.45), x, y, z - 0.055, 12, R90);
  b.box(0.05, 0.08, 0.1, TC.STEEL_DD, x, y + r - 0.02, z - 0.05);
}
const polyMat = new THREE.MeshLambertMaterial({ color: 0xe6f4fa, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });

// ================================================================ tow shed (levels 1..3), WORLD coordinates
// A steel carport over the truck's home spot (RESCUE.truck.home): corrugated back wall and east wall (the garage
// hall stands right behind it), open west side towards the alley so the cab door can be reached, clear
// polycarbonate roof on a steel frame (the camera sees the truck through it), sign on top of the back wall.
// Level 2 (heavy wrecker): amber beacons on the front posts, gantry hoist, winch-cable reel, wheel dollies.
// Level 3 (dispatcher): dispatch desk with radio + screens, radio mast with a blinking light, satellite dish.
// Returns a Group (also has .group / .update for callers that expect the { group, update } shape).
function towShedGeo(level) {
  return geo(`towShed|${level}`, (b) => {
    const PL = PROPERTIES.tow.plot, H = 2.6, T = 0.25, RY = 2.62;
    const x0 = PL.minX, x1 = PL.maxX, z0 = PL.minZ, z1 = PL.maxZ, cx = (x0 + x1) / 2;
    const home = RESCUE.truck.home;
    const WALL = 0x7d8f99, RIB = 0x93a4ad, FRAME = TC.NAVY_D;
    // floor slab, bay box, front hazard edge, oil stains
    b.box(x1 - x0, 0.04, z1 - z0, 0xbcb6aa, cx, 0, (z0 + z1) / 2);
    const bx0 = home.x - 1.08, bx1 = home.x + 1.08, bz0 = home.z - 2.05;
    b.box(0.08, 0.006, z1 - 0.15 - bz0, TC.MUSTARD, bx0, 0.04, (bz0 + z1 - 0.15) / 2);
    b.box(0.08, 0.006, z1 - 0.15 - bz0, TC.MUSTARD, bx1, 0.04, (bz0 + z1 - 0.15) / 2);
    b.box(bx1 - bx0 + 0.08, 0.006, 0.08, TC.MUSTARD, home.x, 0.04, bz0);
    for (let i = 0, n = 11; i < n; i++) b.box((x1 - x0) / n, 0.006, 0.18, i % 2 ? P.hazardB : P.hazardA, x0 + (i + 0.5) * (x1 - x0) / n, 0.04, z1 - 0.1);
    for (const [x, z, r] of [[home.x + 0.2, home.z + 0.9, 0.32], [home.x - 0.3, home.z - 0.6, 0.22], [home.x + 0.5, home.z - 1.5, 0.18]]) b.cyl(r, r, 0.004, 0x8d877c, x, 0.04, z, 9);
    // back wall (inner ribs, hazard band at the foot, mustard cap) + east wall
    b.push(cx, 0.04, z0 + T / 2, 0); corrugated(b, x1 - x0, H - 0.04, T, WALL, RIB, 'in'); b.pop();
    for (let i = 0, n = 12; i < n; i++) b.box((x1 - x0) / n, 0.42, 0.03, i % 2 ? P.hazardB : P.hazardA, x0 + (i + 0.5) * (x1 - x0) / n, 0.04, z0 + T + 0.02);
    const ez0 = z0 + T, ez1 = z1 - 0.1;
    b.push(x1 - T / 2, 0.04, (ez0 + ez1) / 2, -R90); corrugated(b, ez1 - ez0, H - 0.04, T, WALL, RIB, 'in'); b.pop();
    b.box(0.03, 0.42, ez1 - ez0, P.hazardA, x1 - T - 0.015, 0.04, (ez0 + ez1) / 2);
    b.box(x1 - x0 + 0.1, 0.1, T + 0.1, TC.MUSTARD, cx, H, z0 + T / 2);
    b.box(T + 0.1, 0.1, ez1 - ez0, TC.MUSTARD, x1 - T / 2, H, (ez0 + ez1) / 2);
    // posts: three along the open west side, one at the east front corner
    const postZ = [z0 + 0.1, (z0 + z1) / 2, z1 - 0.1];
    for (const z of postZ) { b.box(0.26, 0.04, 0.26, TC.STEEL_DD, x0 + 0.1, 0.04, z); b.box(0.14, RY - 0.04, 0.14, FRAME, x0 + 0.1, 0.04, z); }
    b.box(0.26, 0.04, 0.26, TC.STEEL_DD, x1 - 0.12, 0.04, z1 - 0.1); b.box(0.16, RY - 0.04, 0.16, FRAME, x1 - 0.12, 0.04, z1 - 0.1);
    for (const z of postZ) for (let k = 0; k < 3; k++) b.box(0.15, 0.12, 0.15, k % 2 ? P.hazardB : P.hazardA, x0 + 0.1, 0.1 + k * 0.12, z);   // bump guards
    // roof frame (the clear sheets are a separate transparent mesh)
    b.box(x1 - x0 + 0.1, 0.22, 0.12, TC.MUSTARD, cx, RY - 0.06, z1 - 0.04);                  // front fascia
    b.box(x1 - x0 + 0.1, 0.12, 0.12, FRAME, cx, RY, z0 + 0.06);
    for (const x of [x0 + 0.06, x1 - 0.06]) b.box(0.12, 0.14, z1 - z0, FRAME, x, RY, (z0 + z1) / 2);
    for (let z = z0 + 1.1; z < z1 - 0.5; z += 1.1) b.box(x1 - x0, 0.04, 0.05, TC.STEEL, cx, RY + 0.1, z);   // purlins
    // back wall kit: tyre stack + cones in the west corner, chains, straps, lamp
    const bz = z0 + T + 0.35;
    for (let i = 0; i < 3; i++) tireFlat(b, x0 + 0.45, 0.04 + i * 0.2, bz, 0.3, 0.2);
    for (let i = 0; i < 3; i++) { b.push(0, 0.04 + i * 0.08, 0); cone(b, x0 + 1.05, bz - 0.05); b.pop(); }   // stacked cones
    chain(b, cx - 0.35, 1.95, z0 + T + 0.03, 9); chain(b, cx - 0.1, 1.95, z0 + T + 0.03, 7);
    coil(b, cx + 0.35, 1.5, z0 + T + 0.08, 0.2, TC.MUSTARD);
    coil(b, cx + 0.8, 1.55, z0 + T + 0.08, 0.17, 0xe8622c);
    b.box(0.08, 0.08, 0.6, TC.STEEL_DD, cx, 2.25, z0 + T + 0.3);                              // lamp bracket
    b.cyl(0.07, 0.3, 0.2, TC.MUSTARD, cx, 2.05, z0 + T + 0.55, 8);
    // east wall kit: tool board + extinguisher (+ jerry cans unless the reel takes the corner)
    // (east wall frame: local x = world z, local +z points into the shed)
    b.push(x1 - T, 0.04, 0, -R90);
    b.box(1.1, 0.8, 0.04, TC.WOOD_D, -2.6, 1.15, 0.02);
    for (const [lx, ly, c, w, h] of [[-2.95, 1.35, TC.CORAL, 0.06, 0.4], [-2.8, 1.4, TC.STEEL, 0.05, 0.36], [-2.62, 1.3, TC.MUSTARD, 0.08, 0.3], [-2.4, 1.6, TC.STEEL_D, 0.18, 0.06], [-2.25, 1.25, TC.TEAL, 0.07, 0.34]]) b.box(w, h, 0.04, c, lx, ly, 0.06);
    b.box(0.12, 0.05, 0.16, TC.STEEL_DD, -3.9, 0.7, 0.08);                                     // extinguisher on a bracket
    b.cyl(0.09, 0.09, 0.42, 0xd8403a, -3.9, 0.75, 0.13, 8); b.box(0.08, 0.1, 0.1, TC.RUBBER, -3.9, 1.17, 0.13);
    b.pop();
    if (level < 2) { jerryCan(b, x1 - T - 0.3, bz - 0.05, 0.1); jerryCan(b, x1 - T - 0.62, bz - 0.08, -0.15, 0x3f8f5a); }
    if (level >= 2) {
      // gantry I-beam across the back with a chain block, supported by the mid post and the east wall
      const gz = home.z - 1.55;
      b.box(x1 - x0 - 0.2, 0.16, 0.1, TC.CORAL, cx, 2.35, gz);
      b.box(x1 - x0 - 0.2, 0.03, 0.22, TC.CORAL_D, cx, 2.33, gz); b.box(x1 - x0 - 0.2, 0.03, 0.22, TC.CORAL_D, cx, 2.5, gz);
      b.box(0.26, 0.2, 0.22, TC.MUSTARD, home.x + 0.4, 2.13, gz);                          // chain block
      for (let i = 0; i < 6; i++) b.box(0.03, 0.08, i % 2 ? 0.05 : 0.02, TC.STEEL_D, home.x + 0.4, 2.05 - i * 0.07, gz);
      b.box(0.08, 0.1, 0.05, TC.STEEL_DD, home.x + 0.4, 1.6, gz);
      // big winch-cable reel on a stand (east back corner)
      const rx = x1 - T - 0.42, rz = bz;
      for (const s of [-1, 1]) b.box(0.06, 0.6, 0.5, TC.STEEL_DD, rx + s * 0.26, 0.04, rz);
      b.cyl(0.36, 0.36, 0.06, TC.CORAL, rx - 0.22, 0.6, rz, 14, 0, 0, R90);
      b.cyl(0.36, 0.36, 0.06, TC.CORAL, rx + 0.16, 0.6, rz, 14, 0, 0, R90);
      b.cyl(0.27, 0.27, 0.38, 0x3a3f46, rx - 0.19, 0.6, rz, 14, 0, 0, R90);
      // wheel dollies stacked along the east wall + jerry cans further forward
      for (let i = 0; i < 2; i++) {
        const dz = home.z + 0.2 + i * 0.75;
        b.box(0.36, 0.06, 0.62, TC.MUSTARD, x1 - T - 0.24, 0.04, dz);
        for (const s of [-1, 1]) b.cyl(0.06, 0.06, 0.05, TC.RUBBER, x1 - T - 0.24 + s * 0.13, 0.04, dz + s * 0.22, 6);
        b.box(0.36, 0.06, 0.62, TC.MUSTARD_D, x1 - T - 0.24, 0.16, dz);
      }
      jerryCan(b, x1 - T - 0.16, home.z + 1.85, R90); jerryCan(b, x1 - T - 0.16, home.z + 2.2, R90, 0x3f8f5a);
    }
    if (level >= 3) {
      // dispatch desk in the back middle (dispatcher sits facing the back wall, screens + radio on the desk)
      const dx = cx - 0.05, dz = z0 + T + 0.3;
      b.box(1.1, 0.06, 0.5, TC.WOOD_L, dx, 0.74, dz);
      for (const s of [-1, 1]) b.box(0.06, 0.7, 0.44, TC.STEEL_DD, dx + s * 0.5, 0.04, dz);
      b.box(0.3, 0.2, 0.22, TC.DARK, dx - 0.3, 0.8, dz - 0.05); b.box(0.24, 0.05, 0.02, 0x5fbf6a, dx - 0.3, 0.92, dz + 0.065);
      b.box(0.02, 0.4, 0.02, TC.STEEL, dx - 0.4, 1.0, dz - 0.1);                                 // radio antenna
      for (const s of [-1, 1]) { b.box(0.38, 0.28, 0.04, TC.DARK, dx + 0.12 + s * 0.2, 0.96, dz - 0.15, -0.1, s * -0.2); b.box(0.04, 0.16, 0.04, TC.STEEL_DD, dx + 0.12 + s * 0.2, 0.8, dz - 0.15); }
      b.box(0.36, 0.05, 0.36, TC.CORAL, dx, 0.46, dz + 0.5); b.box(0.06, 0.42, 0.06, TC.STEEL_DD, dx, 0.04, dz + 0.5);   // stool
      b.box(0.36, 0.3, 0.05, TC.CORAL, dx, 0.5, dz + 0.68);
      // radio mast on the back-west corner (lattice, tapering) + satellite dish on the back wall
      const mx = x0 + 0.3, mz = z0 + T / 2, mh = 4.2;
      for (let y = 0; y < mh; y += 0.5) {
        const w0 = 0.34 - (y / mh) * 0.2;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.04, 0.5, 0.04, y % 1 < 0.25 ? TC.RED : TC.WHITE, mx + sx * w0 / 2, H + y, mz + sz * w0 / 2);
        b.box(w0, 0.03, 0.03, TC.STEEL, mx, H + y + 0.25, mz - w0 / 2); b.box(0.03, 0.03, w0, TC.STEEL, mx - w0 / 2, H + y + 0.25, mz);
      }
      b.box(0.03, 0.9, 0.03, TC.STEEL, mx, H + mh, mz);
      for (const y of [0.6, 1.4]) b.box(0.5, 0.03, 0.03, TC.STEEL, mx, H + mh - y, mz);
      b.push(x1 - 0.7, H + 0.1, z0 + 0.15, -0.5);
      b.box(0.08, 0.35, 0.08, TC.STEEL_DD, 0, 0, 0);
      b.cyl(0.38, 0.18, 0.12, TC.WHITE, 0, 0.42, 0.05, 12, -1.0);
      b.box(0.03, 0.3, 0.03, TC.STEEL_DD, 0, 0.5, 0.25, -0.6);
      b.pop();
    }
  });
}
function towSignTex(level) {
  return signTex('TOW & RESCUE', { bg: TC.MUSTARD, fg: TC.NAVY, shadow: TC.CREAM_L, border: TC.NAVY, size: 0.46,
    sub: level >= 3 ? '24/7 DISPATCH' : level >= 2 ? 'HEAVY DUTY' : null, subColor: TC.CORAL_D });
}
export function createTowShed(level = 1) {
  level = Math.max(1, Math.min(3, level | 0 || 1));
  const PL = PROPERTIES.tow.plot, cx = (PL.minX + PL.maxX) / 2;
  const group = new THREE.Group();
  group.userData.world = true;
  group.userData.centre = plotCentre(PL);
  group.add(mesh(towShedGeo(level), litMat, { cast: true, receive: true }));
  // solids (world boxes): back wall + kit in front of it, east wall, the posts of the open west side
  const T = 0.25, cxx = cx, home = RESCUE.truck.home;
  group.userData.solids = [
    { minX: PL.minX, maxX: PL.maxX, minZ: PL.minZ, maxZ: PL.minZ + T + 0.05 },
    { minX: PL.minX, maxX: PL.minX + 1.3, minZ: PL.minZ, maxZ: PL.minZ + T + 0.65 },
    { minX: PL.maxX - T, maxX: PL.maxX, minZ: PL.minZ, maxZ: PL.maxZ - 0.02 },
    { minX: PL.minX, maxX: PL.minX + 0.2, minZ: (PL.minZ + PL.maxZ) / 2 - 0.1, maxZ: (PL.minZ + PL.maxZ) / 2 + 0.1 },
    { minX: PL.minX, maxX: PL.minX + 0.2, minZ: PL.maxZ - 0.2, maxZ: PL.maxZ },
  ];
  if (level >= 2) group.userData.solids.push({ minX: PL.maxX - T - 0.75, maxX: PL.maxX, minZ: PL.minZ, maxZ: PL.minZ + T + 0.6 });
  if (level >= 3) group.userData.solids.push({ minX: cxx - 0.62, maxX: cxx + 0.52, minZ: PL.minZ, maxZ: Math.min(home.z - 1.85, PL.minZ + T + 0.6) });
  // clear polycarbonate roof sheets
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(PL.maxX - PL.minX - 0.1, PL.maxZ - PL.minZ - 0.1), polyMat);
  roof.rotation.x = -R90; roof.position.set(cx, 2.86, (PL.minZ + PL.maxZ) / 2); roof.renderOrder = 3;
  group.add(roof);
  const sign = roofSign(towSignTex(level), 3.0, 0.75, { board: TC.NAVY, bulbs: level >= 2, tilt: -0.2 });
  sign.position.set(cx, 2.72, PL.minZ + 0.12);
  group.add(sign);
  // lamp glow under the back-wall shade
  const lamp = new THREE.Mesh(unitBox, LAMP.warm);
  lamp.scale.set(0.3, 0.03, 0.3); lamp.position.set(cx, 2.04, PL.minZ + 0.25 + 0.55);
  group.add(lamp);
  const anim = [];
  let t = Math.random() * 3;
  if (level >= 2) {
    // amber beacons on the two front posts, rotating flash
    for (const x of [PL.minX + 0.1, PL.maxX - 0.12]) {
      const bcn = new THREE.Mesh(unitBox, LAMP.amberDim);
      bcn.scale.set(0.16, 0.14, 0.16); bcn.position.set(x, 2.95, PL.maxZ - 0.1);
      group.add(bcn);
      anim.push((tt) => { const on = (tt * 2.4 + x) % 1 < 0.45; bcn.material = on ? LAMP.amber : LAMP.amberDim; bcn.rotation.y = tt * 5; });
    }
  }
  if (level >= 3) {
    const red = new THREE.Mesh(unitBox, LAMP.red);
    red.scale.set(0.12, 0.12, 0.12); red.position.set(PL.minX + 0.3, 2.6 + 4.2 + 0.95, PL.minZ + 0.12);
    group.add(red);
    anim.push((tt) => { red.visible = tt % 1.6 < 0.5; });
    // dispatch screens glow (map + call list)
    const scr = canvasTex('towScreens', 128, 64, (g) => {
      g.fillStyle = '#16323a'; g.fillRect(0, 0, 128, 64);
      g.strokeStyle = '#4fd1a5'; g.lineWidth = 3; g.beginPath(); g.moveTo(8, 50); g.lineTo(30, 20); g.lineTo(52, 40); g.stroke();
      g.fillStyle = '#ff5a4a'; g.beginPath(); g.arc(30, 20, 5, 0, 7); g.fill();
      g.fillStyle = '#f6c453'; for (let i = 0; i < 4; i++) g.fillRect(72, 10 + i * 12, 44 - i * 6, 6);
    });
    const sf = face(scr, 0.72, 0.22);
    sf.position.set(cx - 0.05 + 0.12, 1.08, PL.minZ + 0.25 + 0.3 - 0.12);
    sf.rotation.x = -0.1;
    group.add(sf);
  }
  function update(dt = 0.016) { t += dt; for (const a of anim) a(t); }
  update(0);
  group.update = update;
  group.group = group;
  return group;
}

// ================================================================ car wash "Suds & Shine": drive-through (WORLD)
// Its own building on the north part of the garden block (WASH, PROPERTIES.wash.plot). Cars drive through heading
// east (+x): pay kiosk (separate model, createWashKiosk) -> soap arch -> side brushes (+ top roller at tier 2) ->
// rinse bar -> blower. Open steel gantry with a clear polycarbonate roof; the north side is a low wall with glazing
// above, the south (camera) side is open behind a low kerb, so the car stays visible all the way through.
// Nozzles spray only while a car body is under them; brushes spin up and close in on the car's flanks only while a
// car is between them. Floor: wet concrete slab, wheel guide rails for the left wheels, a trench drain, painted
// arrows. Signs face the camera: "SUDS & SHINE" on the north eave, a traffic light (setSignal) at the entry, EXIT at
// the far end, a low "WASH ->" board by the approach. Tier 2: tri-colour wax foam, top roller, chemical drums.
// Tier 3: turbo-dryer hood with spinning turbines and side air towers, neon round the sign.
// API: { group, setRunning(bool), setCars(xs[] | null) (car centre x of every car in the lane),
//        setCarZ(x | null) (legacy single-car form of setCars), setSignal(go), update(dt) }.
// group.userData.zones = WASH.stations (x of each stage), userData.axis = 'x', userData.solids = posts, wall, drums.
const sprayMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
const dropMat = new THREE.MeshBasicMaterial({ color: 0xd8f3ff, transparent: true, opacity: 0.75, depthWrite: false });
const roofMat = new THREE.MeshLambertMaterial({ color: 0xe6f4fa, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
const washFrames = () => {
  const T = WASH.tunnel, S = WASH.stations;
  return [T.minX, S.soap, S.brush, S.rinse, S.dryer, T.maxX];
};
/** Nozzle bar across the lane at x (spray heads pointing down + down-pipes either side with side jets). */
function nozzleBarX(b, x, y) {
  const Z = WASH.laneZ, hw = WASH.tunnel.halfW;
  b.box(0.06, 0.06, hw * 2 - 0.35, TC.STEEL, x, y, Z);
  for (let i = 0; i < 5; i++) b.box(0.06, 0.1, 0.06, TC.STEEL_DD, x, y - 0.1, Z - 1.0 + i * 0.5);
  for (const s of [-1, 1]) {
    b.box(0.06, y - 0.3, 0.06, TC.STEEL_D, x, 0.3, Z + s * (hw - 0.22));
    for (const yy of [0.5, 0.95, 1.4]) b.box(0.06, 0.06, 0.1, TC.STEEL_DD, x, yy, Z + s * (hw - 0.3));
  }
}
/** Spray sheets of one nozzle bar at x: top fans down to roof height, side fans in towards the car's flanks. */
function sprayGeoX(key, x, colors) {
  return geo(`wash2|spray|${key}`, (b) => {
    const Z = WASH.laneZ, hw = WASH.tunnel.halfW, y = WASH.tunnel.height - 0.42;
    for (let i = 0; i < 5; i++) {
      const z = Z - 1.0 + i * 0.5, c = colors[i % colors.length];
      b.box(0.03, 0.3, 0.1, c, x, y - 0.42, z);
      b.box(0.04, 0.55, 0.34, c, x, y - 0.95, z);
    }
    for (const s of [-1, 1]) for (const [k, yy] of [[0, 0.5], [1, 0.95], [2, 1.4]]) {
      const c = colors[(k + (s > 0 ? 1 : 0)) % colors.length];
      b.box(0.06, 0.05, 0.42, c, x, yy - 0.02, Z + s * (hw - 0.55));
      b.box(0.06, 0.16, 0.22, c, x, yy - 0.08, Z + s * (hw - 0.8));
    }
  });
}
function washSignTex(tier) {
  return canvasTex(`washSign2|${tier}`, 640, 300, (g, w, h) => {
    g.fillStyle = css(TC.TEAL_D); g.fillRect(0, 0, w, h);
    g.fillStyle = css(TC.TEAL); g.fillRect(12, 12, w - 24, h - 24);
    for (const [x, y, r] of [[60, 70, 30], [112, 40, 18], [580, 80, 34], [536, 40, 16], [590, 236, 22], [44, 236, 20]]) {
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, 7); g.fill();
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 96px ${FONT}`; g.fillStyle = css(TC.NAVY_D); g.fillText('SUDS & SHINE', w / 2 + 4, 104);
    g.fillStyle = css(TC.CREAM_L); g.fillText('SUDS & SHINE', w / 2, 98);
    g.fillStyle = css(tier >= 3 ? TC.CORAL : TC.NAVY); g.fillRect(70, 178, w - 140, 74);
    g.font = `700 46px ${FONT}`; g.fillStyle = css(TC.CREAM_L);
    g.fillText(tier >= 3 ? 'TURBO DRY  →' : tier >= 2 ? 'WAX & POLISH  →' : 'CAR WASH  →', w / 2, 217);
  });
}
function smallSignTex(text, bg, fg = TC.CREAM_L) {
  return canvasTex(`washSmall|${text}|${bg}`, 256, 112, (g, w, h) => {
    g.fillStyle = css(bg); g.fillRect(0, 0, w, h);
    g.strokeStyle = css(fg); g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 54px ${FONT}`; g.fillStyle = css(fg);
    g.fillText(text, w / 2, h / 2 + 3);
  });
}
/** Painted floor arrow pointing +x, centred at x, z. */
function floorArrowX(b, x, z, y, c = TC.MUSTARD) {
  b.box(0.7, 0.006, 0.14, c, x - 0.2, y, z);
  for (const s of [-1, 1]) b.box(0.42, 0.006, 0.13, c, x + 0.12, y, z + s * 0.12, 0, s * 0.75, 0);
}
function washStaticGeo(tier) {
  return geo2(`wash2|static|${tier}`, (b, g) => {
    const PL = PROPERTIES.wash.plot, ST = WASH.stations, T = WASH.tunnel, K = WASH.kiosk;
    const Z = WASH.laneZ, zN = Z - T.halfW, zS = Z + T.halfW, X0 = T.minX, X1 = T.maxX, H = T.height;
    const frame = tier >= 3 ? TC.NAVY : TC.TEAL, frameD = tier >= 3 ? TC.NAVY_D : TC.TEAL_D, trim = tier >= 2 ? TC.MUSTARD : TC.CREAM;
    // ---- slab: wet concrete, saw-cut joints, darker wet lane, guide rails, trench drain, arrows, kerbs
    const sx0 = PL.minX, sx1 = PL.maxX, sz0 = zN - 0.3, sz1 = zS + 0.25, scx = (sx0 + sx1) / 2, scz = (sz0 + sz1) / 2;
    b.box(sx1 - sx0, 0.03, sz1 - sz0, 0xa9aeb0, scx, 0, scz);
    b.box(X1 - X0 + 1.2, 0.004, 2.1, 0x8f979c, (X0 + X1) / 2 + 0.3, 0.03, Z);
    for (let x = sx0 + 2.15; x < sx1 - 0.4; x += 2.15) b.box(0.03, 0.004, sz1 - sz0 - 0.08, 0x80878b, x, 0.032, scz);
    b.box(sx1 - sx0 - 0.08, 0.004, 0.03, 0x80878b, scx, 0.032, zN + 0.55);
    for (const [x, z, r] of [[16.0, Z + 0.3, 0.32], [15.6, Z - 0.5, 0.2], [X1 + 0.4, Z + 0.25, 0.28]]) b.cyl(r, r, 0.004, 0x7b8287, x, 0.033, z, 10);   // tyre-water stains
    for (const [x, z, r] of [[ST.soap + 0.6, Z + 0.95, 0.24], [ST.soap + 0.9, Z - 1.0, 0.18], [ST.brush + 0.4, Z + 1.05, 0.15]]) b.cyl(r, r, 0.01, 0xf4f7fa, x, 0.034, z, 8);   // left-over foam
    // wheel guide channel for the left (north) wheels: flared entry, two rails, rollers between them
    const gz = Z - 0.62, gx0 = X0 - 1.0, gx1 = X1 + 0.15;
    for (const s of [-1, 1]) {
      b.box(gx1 - gx0, 0.07, 0.06, TC.STEEL, (gx0 + gx1) / 2, 0.03, gz + s * 0.2);
      b.box(0.9, 0.07, 0.06, TC.STEEL, gx0 - 0.42, 0.03, gz + s * 0.38, 0, s * 0.4, 0);
    }
    b.box(gx1 - gx0, 0.012, 0.34, TC.DARK, (gx0 + gx1) / 2, 0.03, gz);
    for (let x = gx0 + 0.2; x < gx1; x += 0.42) b.box(0.08, 0.03, 0.3, TC.STEEL_DD, x, 0.03, gz);
    // trench drain along the lane centre
    b.box(X1 - X0 + 0.4, 0.008, 0.32, 0x3c434a, (X0 + X1) / 2, 0.03, Z + 0.15);
    for (let x = X0 - 0.1; x < X1 + 0.2; x += 0.16) b.box(0.04, 0.012, 0.26, 0x6a737a, x, 0.03, Z + 0.15);
    floorArrowX(b, PL.minX + 0.75, Z, 0.034);
    floorArrowX(b, X1 + 0.35, Z, 0.034);
    // low kerbs either side of the lane (hazard paint), open in front of the kiosk
    for (const [z, x0, x1] of [[zS + 0.13, X0 - 0.3, X1 + 0.3], [zN - 0.13, X0 - 0.15, X1 + 0.3]]) {
      const n = Math.max(2, Math.round((x1 - x0) / 0.5));
      for (let i = 0; i < n; i++) b.box((x1 - x0) / n, 0.1, 0.14, i % 2 ? P.hazardB : P.hazardA, x0 + (i + 0.5) * (x1 - x0) / n, 0.03, z);
    }
    // ---- gantry frames: posts both sides, beam across, eave rails along, roof purlins + ridge
    for (const x of washFrames()) {
      for (const z of [zN, zS]) {
        b.box(0.34, 0.06, 0.34, TC.STEEL_DD, x, 0.03, z);
        b.box(0.17, H, 0.17, frame, x, 0.03, z);
        b.box(0.19, 0.08, 0.19, trim, x, 0.95, z);
      }
      b.box(0.17, 0.22, T.halfW * 2 + 0.17, frame, x, H - 0.19, Z);
    }
    for (const z of [zN, zS]) {
      b.box(X1 - X0 + 0.25, 0.18, 0.17, frame, (X0 + X1) / 2, H - 0.15, z);
      b.box(X1 - X0 + 0.3, 0.05, 0.2, trim, (X0 + X1) / 2, H + 0.03, z);
    }
    const RH = 0.38;                                          // roof rise at the ridge
    b.box(X1 - X0 + 0.3, 0.07, 0.08, frameD, (X0 + X1) / 2, H + RH, Z);
    for (const x of washFrames()) for (const s of [-1, 1]) b.box(0.07, 0.06, T.halfW + 0.05, frameD, x, H + RH / 2 + 0.02, Z + s * T.halfW / 2, s * Math.atan(RH / T.halfW), 0, 0);
    // ---- north wall: low solid panel, glazing above (separate mesh), downpipe; equipment by the wall
    b.box(X1 - X0, 1.0, 0.1, frameD, (X0 + X1) / 2, 0.03, zN - 0.04);
    b.box(X1 - X0, 0.06, 0.14, trim, (X0 + X1) / 2, 1.03, zN - 0.04);
    for (let x = X0 + 0.5; x < X1 - 0.3; x += 0.6) b.box(0.04, 0.9, 0.02, frame, x, 0.08, zN + 0.02);
    b.cyl(0.05, 0.05, H, TC.STEEL_D, X1 - 0.12, 0, zN - 0.14, 6);
    // ---- stations: soap nozzle arch, brush carriages, rinse bar, blower
    nozzleBarX(b, ST.soap, H - 0.42);
    b.box(0.1, 0.36, T.halfW * 2 - 0.2, tier >= 2 ? TC.CORAL : TC.CREAM, ST.soap - 0.12, H - 0.62, Z);           // foam arch housing
    nozzleBarX(b, ST.rinse, H - 0.42);
    for (const s of [-1, 1]) b.box(0.36, 0.16, 0.3, TC.STEEL_DD, ST.brush, H - 0.34, Z + s * 1.12);             // brush carriages
    b.box(0.08, 0.06, T.halfW * 2 - 0.2, TC.STEEL, ST.brush, H - 0.26, Z);                                       // carriage track
    if (tier >= 2) for (const s of [-1, 1]) b.box(0.08, 0.6, 0.08, TC.STEEL_DD, ST.brush + 0.32, H - 0.85, Z + s * (T.halfW - 0.12));   // top-roller slides
    const dx = ST.dryer;
    if (tier < 3) {
      b.box(0.46, 0.32, 2.3, TC.CREAM, dx, H - 0.62, Z);
      b.box(0.14, 0.05, 2.0, TC.DARK, dx, H - 0.65, Z);                                                        // air slot
      b.cyl(0.3, 0.3, 0.12, TC.CREAM, dx, H - 0.3, Z, 14); b.cyl(0.26, 0.26, 0.13, TC.DARK, dx, H - 0.3, Z, 14);
    } else {
      b.box(0.6, 0.42, 3.05, TC.CREAM, dx, H - 0.42, Z);                                                       // slim turbo hood: the car stays visible
      b.box(0.66, 0.06, 3.1, TC.CORAL, dx, H, Z);
      for (const s of [-1, 1]) { b.cyl(0.42, 0.42, 0.06, TC.CORAL, dx, H + 0.02, Z + s * 0.75, 16); b.cyl(0.38, 0.38, 0.07, TC.DARK, dx, H + 0.02, Z + s * 0.75, 16); }
      b.box(0.5, 0.3, 2.4, TC.CREAM, dx, H - 0.72, Z);
      b.box(0.14, 0.05, 2.2, TC.DARK, dx, H - 0.75, Z);
      for (const s of [-1, 1]) {
        b.box(0.44, 1.7, 0.34, TC.CREAM, dx + 0.36, 0.3, Z + s * (T.halfW - 0.2));
        for (let i = 0; i < 6; i++) b.box(0.36, 0.06, 0.04, TC.DARK, dx + 0.36, 0.45 + i * 0.24, Z + s * (T.halfW - 0.38));
      }
    }
    // ---- chemical drums (wax / polish) between the kiosk and the tunnel, tier 2+
    if (tier >= 2) {
      const cx0 = X0 - 0.55, cz = zN - 0.32;
      b.box(0.95, 0.06, 0.5, TC.STEEL_DD, cx0, 0, cz);
      for (const [ox, c] of [[-0.24, 0xd94848], [0.24, 0x3b82c4]]) {
        b.cyl(0.2, 0.2, 0.62, c, cx0 + ox, 0.06, cz, 10);
        b.cyl(0.21, 0.21, 0.04, mixHex(c, 0x000000, 0.25), cx0 + ox, 0.38, cz, 10);
      }
      b.box(0.04, 0.04, 0.4, TC.MUSTARD, X0 - 0.2, 0.75, cz + 0.1);
      b.box(0.04, 1.8, 0.04, TC.MUSTARD, X0 - 0.1, 0.75, zN - 0.1);
    }
    // ---- traffic light on the entry frame's north post (lamps are separate meshes), sign hangers
    b.box(0.26, 0.62, 0.16, TC.DARK, X0 + 0.0, 1.75, zN + 0.18);
    for (const x of [X0 + 0.55, X0 + 2.45]) b.box(0.06, 0.5, 0.06, TC.STEEL_DD, x, H + 0.05, zN);
    b.box(0.08, 0.6, 0.08, TC.STEEL_DD, X1, 1.6, zN + 0.12);                                                     // EXIT sign bracket
    // ---- "WASH ->" board by the approach (low, south of the lane) and the vacuum pillars by the garden P bay
    const ax = PL.minX + 0.55, az = zS + 0.55;
    for (const s of [-1, 1]) b.box(0.07, 0.6, 0.07, TC.STEEL_DD, ax + s * 0.42, 0, az);
    b.box(1.04, 0.42, 0.06, TC.NAVY_D, ax, 0.55, az - 0.01);
    for (const v of WASH.vacuums) {
      b.box(0.42, 0.06, 0.42, TC.CONCRETE_D, v.x, 0, v.z);
      b.box(0.3, 1.2, 0.3, tier >= 3 ? TC.CORAL : TC.TEAL, v.x, 0.06, v.z);
      b.box(0.34, 0.14, 0.34, TC.NAVY_D, v.x, 1.26, v.z);
      b.box(0.2, 0.12, 0.02, TC.MUSTARD, v.x, 0.85, v.z + 0.16);
      b.box(0.04, 0.5, 0.04, TC.STEEL, v.x, 1.4, v.z);
      for (let i = 0; i < 7; i++) b.box(0.07, 0.07, 0.11, TC.DARK, v.x + Math.sin(i * 0.7) * 0.18, 1.82 - i * 0.22, v.z + 0.16 + Math.cos(i * 0.6) * 0.04);
      b.box(0.07, 0.14, 0.07, TC.STEEL_DD, v.x + 0.1, 0.25, v.z + 0.22);
    }
  });
}
function washRoofGeo() {
  return geo('wash2|roof', (b) => {
    const T = WASH.tunnel, Z = WASH.laneZ, H = T.height, X0 = T.minX, X1 = T.maxX, RH = 0.38;
    const a = Math.atan(RH / T.halfW), len = Math.hypot(RH, T.halfW) + 0.2;
    for (const s of [-1, 1]) b.box(X1 - X0 + 0.3, 0.02, len, 0xffffff, (X0 + X1) / 2, H + RH / 2 + 0.05, Z + s * T.halfW / 2, s * a, 0, 0);
  });
}
function washBrushGeo(color) {
  return geo(`wash2|brush|${color}`, (b) => {
    b.cyl(0.05, 0.05, 2.25, TC.STEEL, 0, -2.25, 0, 6);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;
      b.box(0.26, 1.9, 0.05, i % 2 ? color : mixHex(color, 0xffffff, 0.45), Math.cos(a) * 0.17, -2.2, Math.sin(a) * 0.17, 0, -a, 0);
    }
    b.cyl(0.09, 0.09, 0.08, TC.NAVY_D, 0, -0.12, 0, 8);
  });
}
function washRollerGeo() {
  return geo('wash|roller', (b) => {
    b.cyl(0.05, 0.05, 2.2, TC.STEEL, 0, -1.1, 0, 6, 0, 0, R90);             // shaft along local x, centred
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;                                          // radial slabs around the x axis
      b.box(1.95, 0.22, 0.05, i % 2 ? 0xd94848 : 0xf4f1ea, 0, Math.sin(a) * 0.15 - 0.11, Math.cos(a) * 0.15, R90 - a, 0, 0);
    }
  });
}
function fanGeo(r) {
  return geo(`wash|fan|${r}`, (b) => {
    for (let i = 0; i < 5; i++) b.box(r * 0.95, 0.03, r * 0.32, TC.STEEL, Math.cos(i * 1.2566) * r * 0.48, 0, Math.sin(i * 1.2566) * r * 0.48, 0, -i * 1.2566, 0);
    b.cyl(r * 0.2, r * 0.2, 0.06, TC.CORAL, 0, 0, 0, 8);
  });
}
export function createWashArches(tier = 1) {
  tier = Math.max(1, Math.min(3, tier | 0 || 1));
  const PL = PROPERTIES.wash.plot, ST = WASH.stations, T = WASH.tunnel, K = WASH.kiosk;
  const Z = WASH.laneZ, zN = Z - T.halfW, zS = Z + T.halfW, X0 = T.minX, X1 = T.maxX, H = T.height;
  const group = new THREE.Group();
  group.userData.world = true;
  group.userData.centre = plotCentre(PL);
  group.userData.zones = { ...ST };
  group.userData.axis = 'x';
  const sol = group.userData.solids = [];
  for (const x of washFrames()) for (const z of [zN, zS]) sol.push({ minX: x - 0.16, maxX: x + 0.16, minZ: z - 0.16, maxZ: z + 0.16 });
  sol.push({ minX: X0, maxX: X1, minZ: zN - 0.12, maxZ: zN + 0.04 });                         // north wall
  sol.push({ minX: K.x - 0.38, maxX: K.x + 0.38, minZ: K.z - 0.3, maxZ: K.z + 0.3 });          // pay kiosk
  for (const v of WASH.vacuums) sol.push({ minX: v.x - 0.2, maxX: v.x + 0.2, minZ: v.z - 0.2, maxZ: v.z + 0.2 });
  if (tier >= 2) sol.push({ minX: X0 - 1.05, maxX: X0 - 0.05, minZ: zN - 0.6, maxZ: zN - 0.05 });
  addGeo2(group, washStaticGeo(tier));
  const kiosk = createWashKiosk(tier);                                                          // driver's side, before the tunnel
  kiosk.position.set(K.x, 0, K.z); group.add(kiosk);
  const roof = mesh(washRoofGeo(), roofMat, { cast: false, receive: false }); roof.renderOrder = 3; group.add(roof);
  const glass = glassPane(X1 - X0 - 0.2, H - 1.25, 0.04, (X0 + X1) / 2, 1.07, zN - 0.04); group.add(glass);
  // main sign on the north eave, facing the camera; neon frame at tier 3
  const signW = 2.3, signH = 1.08, signX = (X0 + ST.rinse) / 2 + 0.2, signY = H + 0.32;
  const board = face(washSignTex(tier), signW, signH);
  board.position.set(signX, signY + signH / 2, zN - 0.02); board.rotation.x = -0.18;
  group.add(board);
  group.add(mesh(geo(`wash2|signBack`, (b) => b.box(signW + 0.12, signH + 0.12, 0.1, TC.NAVY_D, signX, signY - 0.06, zN - 0.09, -0.18)), litMat));
  let neon = null;
  if (tier >= 3) {
    neon = mesh(geo('wash2|neon', (b) => {
      const w = signW + 0.16, h = signH + 0.16, y = signY - 0.08, z = zN + 0.0;
      b.box(w, 0.05, 0.04, 0xffffff, signX, y, z); b.box(w, 0.05, 0.04, 0xffffff, signX, y + h - 0.05, z);
      b.box(0.05, h, 0.04, 0xffffff, signX - w / 2, y, z); b.box(0.05, h, 0.04, 0xffffff, signX + w / 2, y, z);
    }), LAMP.blue, { cast: false });
    neon.rotation.x = 0; group.add(neon);
  }
  // small signs facing the camera: WASH -> by the approach, EXIT at the far end
  const enter = face(smallSignTex('WASH →', TC.TEAL), 0.96, 0.36); enter.position.set(PL.minX + 0.55, 0.76, zS + 0.59); group.add(enter);
  const exit = face(smallSignTex('EXIT →', 0x2f8a4e), 0.62, 0.27); exit.position.set(X1, 2.05, zN + 0.18); group.add(exit);
  // entry traffic light: red while the lane ahead is busy, green to drive in
  const red = new THREE.Mesh(unitBox, LAMP.red), green = new THREE.Mesh(unitBox, LAMP.green);
  for (const [m, y] of [[red, 2.2], [green, 1.92]]) { m.scale.set(0.16, 0.16, 0.04); m.position.set(X0, y, zN + 0.27); group.add(m); }
  // LED strips under each station beam (on while running)
  const leds = [ST.soap, ST.brush, ST.rinse, ST.dryer].map((x) => {
    const m = new THREE.Mesh(unitBox, LAMP.off);
    m.scale.set(0.04, 0.025, T.halfW * 2 - 0.3); m.position.set(x - 0.11, H - 0.21, Z);
    group.add(m); return m;
  });
  // sprays
  const soapCols = tier >= 2 ? [0xff7b7b, 0xffe27a, 0x7cc2ff] : [0xffffff, 0xe8f6ff];
  const soap = mesh(sprayGeoX(`soap${tier >= 2 ? 3 : 1}`, ST.soap, soapCols), sprayMat, { cast: false });
  const rinse = mesh(sprayGeoX('rinse', ST.rinse, [0xbfe9ff, 0xe6f7ff]), sprayMat, { cast: false });
  soap.visible = rinse.visible = false;
  soap.renderOrder = rinse.renderOrder = 4;
  group.add(soap, rinse);
  // side brushes hang from carriages; they slide in towards the car's flanks and spin while a car is in reach
  const brushes = [-1, 1].map((s) => {
    const piv = new THREE.Group();
    piv.position.set(ST.brush, H - 0.36, Z + s * 1.14);
    const m = mesh(washBrushGeo(tier >= 2 ? 0x8e5bd1 : 0x3b82c4));
    piv.add(m); group.add(piv);
    return { piv, m, s };
  });
  let roller = null;
  if (tier >= 2) {
    roller = new THREE.Group();
    roller.position.set(ST.brush + 0.32, 2.1, Z); roller.rotation.y = R90;
    roller.add(mesh(washRollerGeo()));
    group.add(roller);
  }
  // blower fans + water blown off backwards (against the drive direction)
  const fans = [];
  const fanAt = tier >= 3 ? [[Z - 0.75, 0.38], [Z + 0.75, 0.38]] : [[Z, 0.26]];
  for (const [fz, r] of fanAt) {
    const f = mesh(fanGeo(r), litMat, { cast: false });
    f.position.set(ST.dryer, tier >= 3 ? H + 0.09 : H - 0.16, fz);
    group.add(f); fans.push(f);
  }
  const drops = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(unitBox, dropMat);
    m.scale.set(0.07, 0.05, 0.05); m.visible = false; group.add(m);
    drops.push({ m, t: Math.random(), z: 0, y: 0 });
  }
  let running = true, signal = true, t = 0, brushSpin = 0, fanSpin = 0, close = 0;
  const cars = [];
  const near = (x, reach = 1.45) => { for (let i = 0; i < cars.length; i++) if (Math.abs(cars[i] - x) < reach) return true; return false; };
  function setRunning(on) { running = !!on; }
  function setCars(xs) { cars.length = 0; if (xs) for (const x of xs) if (Number.isFinite(x)) cars.push(x); }
  function setCarZ(x) { cars.length = 0; if (Number.isFinite(x)) cars.push(x); }
  function setSignal(go) { signal = !!go; }
  function update(dt = 0.016) {
    t += dt;
    for (const m of leds) m.material = running ? LAMP.blue : LAMP.off;
    red.material = running && !signal ? LAMP.red : LAMP.off;
    green.material = running && signal ? LAMP.green : LAMP.off;
    if (neon) neon.visible = running ? (t % 4 > 0.12) : false;
    const on = running && cars.length > 0;
    soap.visible = on && near(ST.soap);
    rinse.visible = on && near(ST.rinse);
    for (const m of [soap, rinse]) if (m.visible) { m.scale.y = 1 + Math.sin(t * 40) * 0.04; m.position.y = (1 - m.scale.y) * 2; }
    const bOn = on && near(ST.brush, 1.6);
    brushSpin += ((bOn ? 1 : 0) - brushSpin) * Math.min(1, dt * 3);
    close += ((bOn ? 1 : 0) - close) * Math.min(1, dt * 4);
    for (const br of brushes) {
      br.m.rotation.y += dt * 9 * brushSpin * br.s;
      br.piv.position.z = Z + br.s * (1.14 - close * 0.18);
      br.piv.rotation.x = br.s * close * 0.06;
    }
    if (roller) {
      roller.position.y = 2.1 - close * 0.36;
      roller.children[0].rotation.x += dt * 8 * brushSpin;
    }
    const fOn = on && near(ST.dryer, 1.6);
    fanSpin += ((fOn ? 1 : running ? 0.08 : 0) - fanSpin) * Math.min(1, dt * 2.5);
    for (const f of fans) f.rotation.y += dt * 30 * fanSpin;
    for (const d of drops) {
      d.t += dt * 1.6;
      if (d.t >= 1) { d.t -= 1; d.z = (Math.random() - 0.5) * 1.4; d.y = 0.5 + Math.random() * 0.9; }
      d.m.visible = fOn && d.t < 0.8;
      if (d.m.visible) d.m.position.set(ST.dryer - 0.2 - d.t * 1.2, d.y + d.t * 0.3 - d.t * d.t * 0.9, Z + d.z * (1 + d.t * 0.8));
    }
  }
  update(0);
  return { group, setRunning, setCars, setCarZ, setSignal, update };
}

// ================================================================ wash kiosk (pay terminal, origin, front +z)
// Tier 1: pay terminal with screen, card slot, price board. Tier 2: + canopy over it. Tier 3: + neon trim.
// Footprint <= 0.72 x 0.56 (canopy 1.0 x 0.9 overhead). Gameplay stands it at WASH.kiosk, front (+z) to the car.
function kioskBoardTex(tier) {
  return canvasTex(`kiosk|${tier}`, 256, 192, (g, w, h) => {
    g.fillStyle = css(TC.NAVY); g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 40px ${FONT}`; g.fillStyle = css(TC.MUSTARD); g.fillText('PAY HERE', w / 2, 34);
    const rows = [['BASIC', TC.CREAM_L], ['WAX', tier >= 2 ? TC.CREAM_L : 0x5a6f7c], ['TURBO', tier >= 3 ? TC.CREAM_L : 0x5a6f7c]];
    rows.forEach(([txt, c], i) => {
      g.fillStyle = css(c); g.font = `600 30px ${FONT}`; g.textAlign = 'left'; g.fillText(txt, 24, 82 + i * 38);
      g.fillStyle = css(i < tier ? 0x6dff8a : 0x3a4a56); g.beginPath(); g.arc(w - 36, 82 + i * 38, 10, 0, 7); g.fill();
    });
  });
}
export function createWashKiosk(tier = 1) {
  tier = Math.max(1, Math.min(3, tier | 0 || 1));
  const g = geo(`kiosk|${tier}`, (b) => {
    b.box(0.72, 0.1, 0.56, TC.CONCRETE_D, 0, 0, 0);
    b.box(0.56, 1.2, 0.4, TC.TEAL, 0, 0.1, 0);
    b.box(0.6, 0.06, 0.44, TC.MUSTARD, 0, 1.3, 0);
    b.box(0.5, 0.42, 0.1, TC.TEAL_D, 0, 1.36, -0.05);                    // board housing (face is separate)
    b.box(0.42, 0.3, 0.04, TC.DARK, 0, 0.82, 0.2, -0.3);                   // screen bezel
    b.box(0.16, 0.03, 0.04, TC.STEEL_DD, -0.12, 0.62, 0.21);               // card slot
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) b.box(0.04, 0.03, 0.03, TC.CREAM, 0.06 + i * 0.06, 0.6 - j * 0.06, 0.21);
    b.box(0.2, 0.05, 0.05, TC.STEEL_DD, 0, 0.32, 0.21);                    // receipt / coin tray
    b.box(0.58, 0.04, 0.42, TC.NAVY_D, 0, 0.1, 0);
    if (tier >= 2) {
      for (const s of [-1, 1]) b.box(0.07, 2.25, 0.07, TC.NAVY_D, s * 0.42, 0.1, -0.32);
      b.box(1.0, 0.08, 0.9, TC.MUSTARD, 0, 2.35, -0.05);
      b.box(1.04, 0.1, 0.06, TC.CORAL, 0, 2.3, 0.42);
    }
  });
  const group = solidGroup(g);
  const bf = face(kioskBoardTex(tier), 0.46, 0.34);
  bf.position.set(0, 1.57, 0.005); group.add(bf);
  const scr = new THREE.Mesh(unitBox, LAMP.blue);
  scr.scale.set(0.36, 0.24, 0.01); scr.position.set(0, 0.97, 0.226); scr.rotation.x = -0.3; group.add(scr);
  if (tier >= 3) {
    const n = mesh(geo('kiosk|neon', (b) => { b.box(1.0, 0.04, 0.04, 0xffffff, 0, 2.27, 0.46); for (const s of [-1, 1]) b.box(0.04, 0.04, 0.9, 0xffffff, s * 0.5, 2.27, -0.05); }), LAMP.blue, { cast: false });
    group.add(n);
  }
  group.update = noop;
  return group;
}

// ================================================================ lounge annex (tiers 1..2), WORLD coordinates
// LOUNGE.walls = inner faces (walls stand outside them, front at maxZ). Glazed front with two open sliding doors
// (LOUNGE.door and one by the upgrade pad), warm wood floor, teal walls with wood wainscot, sofas at LOUNGE.seats
// facing the TV on the west wall, reception counter beside LOUNGE.tipTray (the tip tray itself is a town-kit prop
// gameplay places), vending machine at LOUNGE.vending, plants, pictures, sconces, windows, "HARBOR LOUNGE" sign.
// Tier 2 "Grand Lounge": espresso bar at LOUNGE.bar (barista stands behind it, east), aquarium with moving fish at
// LOUNGE.aquarium, arcade cabinet at LOUNGE.arcade (screen faces east; a player stands at x + 0.8), rug, bigger TV.
const L_DOOR_W = 1.8;
const loungeDoors = () => {
  const up = PROPERTIES.lounge.upgradePad ?? { x: LOUNGE.walls.maxX - 1.8 };
  return [LOUNGE.door.x, Math.min(LOUNGE.walls.maxX - L_DOOR_W / 2 - 0.3, up.x)];
};
function sofaPairs() {
  // consecutive seats in the same column (same x, 1.2 apart) share a two-seat sofa
  const cols = new Map();
  for (const st of LOUNGE.seats) { const k = st.x.toFixed(2); if (!cols.has(k)) cols.set(k, []); cols.get(k).push(st.z); }
  const out = [];
  for (const [k, zs] of cols) {
    zs.sort((a, b) => a - b);
    for (let i = 0; i < zs.length; i += 2) out.push({ x: Number(k), z0: zs[i], z1: zs[Math.min(i + 1, zs.length - 1)] });
  }
  return out;
}
/** Two-seat sofa in world coords, sitter faces -x (towards the TV): seat front at x - 0.38, back rest at x + 0.3. */
function sofa(b, x, za, zb, body, cushion) {
  const zc = (za + zb) / 2, len = Math.abs(zb - za) + 1.1;
  b.box(0.82, 0.08, len, TC.WOOD_D, x - 0.02, 0, zc);                                   // plinth
  b.box(0.82, 0.27, len, body, x - 0.02, 0.08, zc);
  b.box(0.22, 0.62, len, body, x + 0.3, 0.35, zc);                                      // back rest
  b.box(0.24, 0.08, len + 0.02, mixHex(body, 0xffffff, 0.12), x + 0.3, 0.97, zc);
  for (const s of [-1, 1]) b.box(0.86, 0.3, 0.16, mixHex(body, 0x000000, 0.12), x - 0.02, 0.35, zc + s * (len / 2 - 0.08));   // arms
  for (const z of [za, zb]) {
    b.box(0.6, 0.09, 0.98, cushion, x - 0.08, 0.35, z);                                // seat cushion (top 0.44)
    b.box(0.14, 0.42, 0.9, cushion, x + 0.14, 0.44, z, 0, 0, -0.12);                    // back cushion
  }
}
function tvTex() {
  return canvasTex('loungeTv', 256, 144, (g, w, h) => {
    g.fillStyle = '#3e8f4f'; g.fillRect(0, 0, w, h);                                    // football pitch
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3;
    g.strokeRect(14, 14, w - 28, h - 28); g.beginPath(); g.moveTo(w / 2, 14); g.lineTo(w / 2, h - 14); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 22, 0, 7); g.stroke();
    for (const [x, y, c] of [[80, 60, '#e5484d'], [100, 90, '#e5484d'], [170, 70, '#3b82c4'], [150, 100, '#3b82c4'], [128, 50, '#fff']]) { g.fillStyle = c; g.fillRect(x, y, 8, 12); }
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(8, 8, 74, 20);
    g.fillStyle = '#fff'; g.font = `700 14px ${FONT}`; g.fillText('HBR 2-1 FER', 12, 23);
  });
}
function pictureTex(kind) {
  return canvasTex(`pic|${kind}`, 192, 128, (g, w, h) => {
    if (kind === 0) {                                                                  // harbor at sunset
      g.fillStyle = '#f2a35e'; g.fillRect(0, 0, w, h * 0.55); g.fillStyle = '#f6c453'; g.beginPath(); g.arc(w * 0.7, h * 0.5, 22, 0, 7); g.fill();
      g.fillStyle = '#2a9d8f'; g.fillRect(0, h * 0.55, w, h * 0.45);
      g.fillStyle = '#2f4858'; g.beginPath(); g.moveTo(40, 92); g.lineTo(120, 92); g.lineTo(110, 104); g.lineTo(50, 104); g.fill(); g.fillRect(78, 50, 4, 42);
      g.fillStyle = '#fff6e6'; g.beginPath(); g.moveTo(82, 52); g.lineTo(110, 88); g.lineTo(82, 88); g.fill();
    } else {                                                                           // classic car poster
      g.fillStyle = '#f6ecd8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e5484d'; g.fillRect(40, 60, 112, 30); g.fillRect(62, 42, 64, 24);
      g.fillStyle = '#a6dbec'; g.fillRect(70, 47, 22, 15); g.fillRect(98, 47, 22, 15);
      g.fillStyle = '#24262b'; g.beginPath(); g.arc(66, 92, 12, 0, 7); g.arc(128, 92, 12, 0, 7); g.fill();
      g.fillStyle = '#2f4858'; g.font = `700 18px ${FONT}`; g.textAlign = 'center'; g.fillText('HARBOR CLASSICS', w / 2, 26);
    }
  });
}
const TV_YAW = R90 - 0.45;
/** Grand Lounge furniture (static parts, world coords). */
function loungeGrand(b, gl, W) {
  // espresso bar along the east wall: counter (customer side west, barista behind it), stools, back counter
  const br = LOUNGE.bar, len = 3.0, cx0 = br.x - 0.15;
  b.box(0.55, 1.0, len, TC.NAVY_D, cx0, 0, br.z);
  for (let i = 0; i < 6; i++) b.box(0.04, 0.8, 0.4, TC.GOLD_D, cx0 - 0.29, 0.1, br.z - len / 2 + 0.3 + i * (len - 0.6) / 5);
  b.box(0.7, 0.07, len + 0.1, 0xece8e1, cx0 - 0.05, 1.0, br.z);                        // marble top
  b.box(0.04, 0.05, len, TC.GOLD, cx0 - 0.4, 1.0, br.z);
  // espresso machine on the counter (south end) + cups + pastry case (north end)
  const ez = br.z + len / 2 - 0.55;
  b.box(0.45, 0.42, 0.62, TC.CHROME, cx0, 1.07, ez); b.box(0.47, 0.06, 0.64, TC.CORAL, cx0, 1.49, ez);
  for (const dz of [-0.15, 0.15]) { b.box(0.06, 0.08, 0.06, TC.DARK, cx0 - 0.25, 1.22, ez + dz); b.cyl(0.04, 0.035, 0.07, TC.CREAM_L, cx0 - 0.28, 1.07, ez + dz, 8); }
  b.box(0.04, 0.2, 0.04, TC.STEEL, cx0 + 0.1, 1.49, ez - 0.2);                            // steam wand
  for (let i = 0; i < 5; i++) b.cyl(0.045, 0.04, 0.08, i % 2 ? TC.CREAM_L : TC.CORAL, cx0 + 0.1, 1.55, ez - 0.25 + i * 0.12, 8);
  const pz = br.z - len / 2 + 0.55;
  b.box(0.42, 0.06, 0.7, TC.WOOD_D, cx0, 1.07, pz);
  for (let i = 0; i < 4; i++) b.box(0.13, 0.08, 0.13, [0xe3b26a, 0xc87a4a, 0xf3d6a0, 0xd9a521][i], cx0 - 0.08 + (i % 2) * 0.16, 1.13, pz - 0.18 + (i >> 1) * 0.3);
  for (let i = 0; i < 3; i++) {                                                         // bar stools
    const z = br.z - 0.9 + i * 0.9;
    b.cyl(0.18, 0.2, 0.04, TC.STEEL_DD, cx0 - 0.75, 0, z, 10); b.cyl(0.04, 0.04, 0.68, TC.CHROME, cx0 - 0.75, 0.04, z, 6);
    b.cyl(0.2, 0.2, 0.08, TC.CORAL, cx0 - 0.75, 0.7, z, 10); b.cyl(0.14, 0.14, 0.02, TC.GOLD, cx0 - 0.75, 0.32, z, 10);
  }
  b.box(0.32, 0.9, len, TC.WOOD_D, W.maxX - 0.16, 0, br.z);                             // back counter + shelves
  b.box(0.34, 0.04, len, 0xece8e1, W.maxX - 0.16, 0.9, br.z);
  for (const y of [1.45, 1.85]) {
    b.box(0.22, 0.04, len - 0.3, TC.WOOD, W.maxX - 0.11, y, br.z);
    for (let i = 0; i < 9; i++) b.cyl(0.04, 0.04, 0.12, [TC.CREAM_L, TC.TEAL, TC.CORAL, TC.MUSTARD][i % 4], W.maxX - 0.12, y + 0.04, br.z - len / 2 + 0.3 + i * 0.3, 8);
  }
  b.box(0.3, 0.32, 0.26, TC.DARK, W.maxX - 0.17, 0.94, br.z + 0.6); b.cyl(0.08, 0.1, 0.2, 0x9fd0e6, W.maxX - 0.17, 1.26, br.z + 0.6, 8);   // grinder
  b.box(0.05, 0.7, 1.4, TC.DARK, W.maxX - 0.03, 2.0, br.z); b.box(0.06, 0.06, 1.46, TC.WOOD, W.maxX - 0.03, 2.66, br.z);   // menu board
  for (let i = 0; i < 4; i++) b.box(0.02, 0.05, 0.8 - i * 0.12, TC.CREAM_L, W.maxX - 0.06, 2.5 - i * 0.13, br.z - 0.1);
  // aquarium cabinet + frame (water, fish and glass are separate transparent / moving meshes)
  const aq = LOUNGE.aquarium, aw = 2.0, ad = 0.56;
  b.box(aw, 0.7, ad, TC.NAVY_D, aq.x, 0, aq.z);
  b.box(aw + 0.04, 0.05, ad + 0.04, TC.GOLD_D, aq.x, 0.7, aq.z);
  b.box(aw, 0.08, ad - 0.04, 0xe8d6a8, aq.x, 0.75, aq.z);                               // sand
  for (const [dx, h, c] of [[-0.75, 0.42, TC.LEAF], [-0.55, 0.3, TC.LEAF_L], [0.6, 0.5, TC.LEAF], [0.78, 0.32, TC.LEAF_L], [0.1, 0.22, 0x8a8f96]]) b.box(0.1, h, 0.1, c, aq.x + dx, 0.83, aq.z - 0.1);
  b.box(0.3, 0.16, 0.22, 0x8a8f96, aq.x - 0.2, 0.83, aq.z); b.box(0.18, 0.12, 0.16, 0x9aa0a6, aq.x + 0.3, 0.83, aq.z + 0.05);
  for (const s of [-1, 1]) b.box(0.05, 0.92, 0.05, TC.GOLD_D, aq.x + s * aw / 2, 0.75, aq.z + ad / 2);
  b.box(aw + 0.04, 0.1, ad + 0.04, TC.NAVY_D, aq.x, 1.62, aq.z);                         // hood
  gl.box(aw - 0.2, 0.02, 0.2, 0xcff4ff, aq.x, 1.6, aq.z);
  // arcade cabinet (back to the west wall, screen faces east)
  const ar = LOUNGE.arcade;
  b.push(ar.x, 0, ar.z, R90);
  b.box(0.78, 0.95, 0.7, 0x8e5bd1, 0, 0, 0);
  b.box(0.78, 0.18, 0.4, 0x8e5bd1, 0, 0.95, 0.1, -0.5);                                  // control deck
  b.box(0.6, 0.06, 0.2, TC.DARK, 0, 1.07, 0.22, -0.5);
  b.cyl(0.03, 0.03, 0.1, TC.RED, -0.15, 1.1, 0.22, 6); for (let i = 0; i < 3; i++) b.cyl(0.035, 0.035, 0.03, [TC.MUSTARD, TC.TEAL, TC.CORAL][i], 0.05 + i * 0.09, 1.12, 0.2, 8);
  b.box(0.78, 0.7, 0.5, 0x8e5bd1, 0, 1.05, -0.1);
  b.box(0.6, 0.48, 0.04, TC.DARK, 0, 1.14, 0.16, -0.2);
  b.box(0.82, 0.24, 0.62, 0x6b3fa8, 0, 1.75, -0.05);                                      // marquee box
  for (const s of [-1, 1]) b.box(0.04, 1.8, 0.7, TC.MUSTARD, s * 0.41, 0, -0.02);
  b.pop();
  // floor lamp + plant by the arcade, gold rope posts along the aquarium
  plant(b, W.minX + 0.45, W.minZ + 0.45, 1.2);
}
function loungeShell(tier) {
  return geo2(`lounge|${tier}`, (b, gl) => {
    const W = LOUNGE.walls, T = W.thickness ?? 0.3, H = W.height ?? 2.6;
    const cx = (W.minX + W.maxX) / 2;
    hallShell(b, gl, W, {
      wainA: TC.WOOD, wainB: mixHex(TC.WOOD, 0x000000, 0.08), wallA: 0x3f7f86, wallB: 0x46888f,
      trim: TC.CREAM, cap: TC.CORAL, base: TC.WOOD_D, pillar: 0x34636a, pillarBase: TC.WOOD_D, pillarW: 0.6, seg: 1.2,
    });
    // glazed front: frame, mullions, transom; two door openings with the sliding leaves parked open
    const zf = W.maxZ - 0.05, doors = loungeDoors();
    b.box(W.maxX - W.minX, 0.08, 0.16, TC.CREAM, cx, 0, zf);                            // sill
    b.box(W.maxX - W.minX, 0.14, 0.14, TC.CREAM, cx, H - 0.14, zf);                     // transom
    const xs = [W.minX];
    for (const d of doors) xs.push(d - L_DOOR_W / 2, d + L_DOOR_W / 2);
    xs.push(W.maxX);
    for (let i = 0; i < xs.length; i += 2) {
      const a = xs[i], e = xs[i + 1], n = Math.max(1, Math.round((e - a) / 1.5));
      for (let k = 0; k <= n; k++) b.box(0.08, H - 0.14, 0.12, TC.CREAM, a + k * (e - a) / n, 0, zf);
      b.box(e - a, 0.05, 0.1, TC.CREAM, (a + e) / 2, 1.0, zf);                          // push bar / rail
    }
    for (const d of doors) {
      b.box(0.1, H - 0.1, 0.16, TC.CORAL, d - L_DOOR_W / 2, 0, zf); b.box(0.1, H - 0.1, 0.16, TC.CORAL, d + L_DOOR_W / 2, 0, zf);
      b.box(L_DOOR_W + 0.2, 0.22, 0.22, TC.CORAL, d, H - 0.22, zf);                    // door header with the motor box
      b.box(L_DOOR_W, 0.012, 1.2, 0x5a6f7c, d, 0.006, zf - 0.1);                        // entrance mat
      b.box(L_DOOR_W - 0.3, 0.014, 1.0, 0x3f7f86, d, 0.008, zf - 0.1);
    }
    // windows on the side walls, pictures + clock on the back wall, sconces
    const twin = tier >= 2 ? 2.4 : 1.7, D = W.maxZ - W.minZ;
    const clearOf = (z, list) => list.every(([c, r]) => Math.abs(z - c) > r);
    const westBusy = [[LOUNGE.tv.z, twin / 2 + 0.75], [LOUNGE.tipTray.z, 1.6]].concat(tier >= 2 ? [[LOUNGE.arcade.z, 0.95]] : []);
    const eastBusy = tier >= 2 ? [[LOUNGE.bar.z, 2.2]] : [];
    for (const f of [0.14, 0.38, 0.62, 0.84]) {
      const z = W.minZ + D * f;
      if (clearOf(z, westBusy)) { b.push(W.minX, 0, z, R90); wallWindow(b, gl, 0, 1.3, 1.2, 0.85); b.pop(); }
      if (clearOf(z, eastBusy)) { b.push(W.maxX, 0, z, -R90); wallWindow(b, gl, 0, 1.45, 1.2, 0.75); b.pop(); }
    }
    for (const [x, y] of [[13.0, 2.05], [cx + 0.8, 1.55], [cx + 2.6, 1.55]]) {
      if (x === 13.0) { b.cyl(0.24, 0.24, 0.05, TC.CORAL, x, y, W.minZ + 0.02, 14, R90); b.cyl(0.2, 0.2, 0.06, TC.CREAM_L, x, y, W.minZ + 0.02, 14, R90); b.box(0.02, 0.15, 0.02, TC.DARK, x, y - 0.02, W.minZ + 0.09); b.box(0.11, 0.02, 0.02, TC.DARK, x + 0.04, y, W.minZ + 0.09); continue; }
      b.box(0.9, 0.66, 0.05, TC.WOOD_D, x, y - 0.03, W.minZ + 0.025);
    }
    for (const x of [W.minX + 2.6, cx, W.maxX - 2.6]) {
      b.box(0.1, 0.24, 0.12, TC.MUSTARD_D, x, 1.95, W.minZ + 0.06);
      gl.box(0.18, 0.12, 0.08, TC.LAMP, x, 2.12, W.minZ + 0.1);
    }
    // floor edge strip at the front (threshold)
    b.box(W.maxX - W.minX, 0.02, 0.2, TC.WOOD_D, cx, 0, W.maxZ - 0.1);
    // sofas at the seats
    const body = tier >= 2 ? 0x8a4b3a : TC.TEAL_D, cush = tier >= 2 ? 0xa65d45 : TC.TEAL;
    for (const sp of sofaPairs()) sofa(b, sp.x, sp.z0, sp.z1, body, cush);
    // column ends: side table with lamp / plant
    const colX = [...new Set(LOUNGE.seats.map((st) => st.x))];
    const zMin = Math.min(...LOUNGE.seats.map((st) => st.z)), zMax = Math.max(...LOUNGE.seats.map((st) => st.z));
    colX.forEach((x, i) => {
      const zs = zMax + 1.0;
      if (i === 0) plant(b, x + 0.1, zs, 1.1);
      else {
        b.box(0.5, 0.5, 0.5, TC.WOOD, x, 0, zs); b.box(0.54, 0.04, 0.54, TC.WOOD_D, x, 0.5, zs);
        for (let k = 0; k < 3; k++) b.box(0.28, 0.02, 0.2, [TC.CORAL, TC.CREAM_L, TC.MUSTARD][k], x - 0.05 + k * 0.03, 0.54 + k * 0.02, zs, 0, k * 0.4, 0);
      }
      if (i === 1) { b.box(0.4, 0.04, 0.4, TC.WOOD_D, x, 0, zMin - 1.0); b.box(0.04, 1.4, 0.04, TC.STEEL_DD, x, 0, zMin - 1.0); b.cyl(0.14, 0.24, 0.3, TC.CREAM, x, 1.35, zMin - 1.0, 8); gl.box(0.2, 0.04, 0.2, TC.LAMP, x, 1.34, zMin - 1.0); }
    });
    // TV wall: media console + wall mount
    const tv = LOUNGE.tv, tw = tier >= 2 ? 2.4 : 1.7;
    b.box(0.44, 0.42, tw + 0.3, TC.WOOD_D, W.minX + 0.22, 0, tv.z);
    b.box(0.46, 0.04, tw + 0.32, TC.WOOD, W.minX + 0.22, 0.42, tv.z);
    b.box(0.3, 0.2, 0.4, TC.DARK, W.minX + 0.2, 0.46, tv.z - tw * 0.3);                // console box
    plant(b, W.minX + 0.22, tv.z + tw / 2 - 0.05, 0.6, TC.CREAM);
    // TV on an articulating wall arm, turned towards the seats (and so towards the camera)
    b.box(0.34, 0.08, 0.1, TC.STEEL_DD, W.minX + 0.17, 1.5, tv.z);
    b.push(W.minX + 0.36, 0, tv.z, TV_YAW);
    b.box(tw + 0.12, tw * 0.56 + 0.12, 0.08, TC.DARK, 0, 1.05, -0.04);
    b.box(0.2, 0.2, 0.06, TC.STEEL_DD, 0, 1.05 + tw * 0.25, -0.1);
    b.pop();
    // tier 2 extras (static parts): espresso bar, aquarium cabinet, arcade cabinet, rug edging
    if (tier >= 2) loungeGrand(b, gl, W);
    else {
      // tier 1: coffee sideboard where the bar will go, two armchairs round a low table
      const br = LOUNGE.bar, sx = W.maxX - 0.25;
      b.box(0.46, 0.85, 1.6, TC.WOOD, sx, 0, br.z); b.box(0.5, 0.05, 1.64, TC.WOOD_D, sx, 0.85, br.z);
      b.box(0.3, 0.38, 0.3, TC.DARK, sx, 0.9, br.z - 0.35); b.box(0.24, 0.1, 0.06, TC.CORAL, sx - 0.12, 1.1, br.z - 0.35);
      for (let i = 0; i < 4; i++) b.cyl(0.045, 0.04, 0.09, TC.CREAM_L, sx - 0.05, 0.9, br.z + 0.1 + i * 0.13, 8);
      b.cyl(0.07, 0.07, 0.24, TC.STEEL, sx, 0.9, br.z + 0.65, 8);
      const ax = (Math.max(...LOUNGE.seats.map((st) => st.x)) + W.maxX) / 2 + 0.2, az = br.z + 1.6;
      b.cyl(0.38, 0.38, 0.05, TC.WOOD_D, ax, 0.4, az, 12); b.cyl(0.06, 0.06, 0.4, TC.STEEL_DD, ax, 0, az, 6);
      for (const s of [-1, 1]) {
        b.push(ax, 0, az + s * 0.85, s > 0 ? 0 : PI);
        b.box(0.72, 0.36, 0.66, TC.MUSTARD_D, 0, 0.08, 0); b.box(0.72, 0.5, 0.16, TC.MUSTARD_D, 0, 0.44, 0.27);
        for (const q of [-1, 1]) b.box(0.13, 0.22, 0.66, TC.MUSTARD, q * 0.36, 0.44, 0);
        b.box(0.5, 0.08, 0.5, TC.MUSTARD, 0, 0.44, -0.05);
        b.pop();
      }
    }
    // reception counter beside the tip tray (front-west corner, faces the aisle)
    const tt = LOUNGE.tipTray, rx0 = W.minX + 0.1, rx1 = tt.x - 0.42, rz0 = tt.z - 1.0, rz1 = Math.min(tt.z + 0.75, W.maxZ - 0.45);
    b.box(rx1 - rx0, 0.95, rz1 - rz0, TC.CREAM, (rx0 + rx1) / 2, 0, (rz0 + rz1) / 2);
    b.box(0.06, 0.95, rz1 - rz0, TC.CORAL, rx1 + 0.03, 0, (rz0 + rz1) / 2);
    for (let i = 0; i < 4; i++) b.box(0.07, 0.6, 0.04, TC.CORAL_D, rx1 + 0.06, 0.18, rz0 + 0.25 + i * (rz1 - rz0 - 0.5) / 3);
    b.box(rx1 - rx0 + 0.12, 0.06, rz1 - rz0 + 0.1, TC.WOOD, (rx0 + rx1) / 2 + 0.03, 0.95, (rz0 + rz1) / 2);
    b.box(0.08, 0.32, 0.46, TC.DARK, rx0 + 0.3, 1.01, (rz0 + rz1) / 2 + 0.1, 0, 0, 0.15);   // monitor
    b.box(0.2, 0.03, 0.3, TC.CREAM_L, rx0 + 0.55, 1.01, (rz0 + rz1) / 2 + 0.1);
    b.cyl(0.07, 0.08, 0.05, TC.GOLD, rx1 - 0.15, 1.01, rz0 + 0.3, 10); b.cyl(0.015, 0.015, 0.04, TC.GOLD, rx1 - 0.15, 1.06, rz0 + 0.3, 6);   // service bell
    b.cyl(0.06, 0.05, 0.18, 0x9fd0e6, rx1 - 0.2, 1.01, rz1 - 0.25, 8);
    for (const [dx, dz, c] of [[0, 0, TC.CORAL], [0.05, 0.06, TC.MUSTARD], [-0.05, 0.05, TC.CREAM_L]]) b.box(0.1, 0.1, 0.1, c, rx1 - 0.2 + dx, 1.19, rz1 - 0.25 + dz);
    // vending machine against the back wall (front +z), the coins land in front of it (vendingPile stays clear)
    const v = LOUNGE.vending, vz = W.minZ + 0.42;
    b.box(1.0, 1.95, 0.8, 0xd94848, v.x, 0, vz);
    b.box(1.02, 0.12, 0.82, mixHex(0xd94848, 0x000000, 0.2), v.x, 1.95, vz);
    b.box(0.62, 1.3, 0.04, TC.DARK, v.x - 0.12, 0.45, vz + 0.4);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) b.box(0.1, 0.16, 0.03, [TC.MUSTARD, TC.TEAL, TC.CREAM_L, 0x8e5bd1, 0x5fbf6a][(r * 4 + c) % 5], v.x - 0.33 + c * 0.14, 0.55 + r * 0.3, vz + 0.42);
    b.box(0.2, 0.5, 0.04, TC.STEEL, v.x + 0.36, 0.95, vz + 0.4);
    b.box(0.08, 0.1, 0.03, TC.DARK, v.x + 0.36, 1.2, vz + 0.43);
    b.box(0.5, 0.16, 0.06, TC.DARK, v.x - 0.12, 0.18, vz + 0.41);                         // pickup flap
    gl.box(0.62, 0.12, 0.03, 0xfff6e6, v.x - 0.12, 1.78, vz + 0.42);                     // lit header
    // plants in the free corners
    plant(b, W.maxX - 0.45, W.maxZ - 0.75, 1.2);
    plant(b, W.maxX - 0.45, W.minZ + 0.45, 1.1);
    if (tier < 2) plant(b, W.minX + 0.45, W.minZ + 0.45, 1.2);
    // water cooler next to the vending machine
    b.box(0.36, 0.95, 0.36, TC.CREAM, v.x + 1.0, 0, W.minZ + 0.3); b.cyl(0.15, 0.15, 0.4, 0x8fd0f0, v.x + 1.0, 0.95, W.minZ + 0.3, 10);
  });
}
function loungeSignTex(tier) {
  return tier >= 2
    ? signTex('GRAND LOUNGE', { bg: TC.NAVY_D, fg: TC.GOLD_L, shadow: TC.CORAL_D, border: TC.GOLD, size: 0.48 })
    : signTex('HARBOR LOUNGE', { bg: TC.TEAL_D, fg: TC.CREAM_L, shadow: TC.NAVY, border: TC.MUSTARD, size: 0.48 });
}
const waterMat = new THREE.MeshLambertMaterial({ color: 0x4fb3d9, transparent: true, opacity: 0.32, depthWrite: false });
function fishGeo(k) {
  const c = [0xf2813a, 0xf6c453, 0x5aa9e6][k];
  return geo(`fish|${k}`, (b) => {
    b.box(0.13, 0.08, 0.04, c, 0, -0.04, 0);
    b.box(0.05, 0.07, 0.02, mixHex(c, 0x000000, 0.2), -0.085, -0.035, 0);
    b.box(0.02, 0.02, 0.045, TC.DARK, 0.045, 0.0, 0);
  });
}
function arcadeTex() {
  return canvasTex('arcade', 128, 96, (g, w, h) => {
    g.fillStyle = '#141a2e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3f56'; g.beginPath(); g.moveTo(54, 0); g.lineTo(74, 0); g.lineTo(118, h); g.lineTo(10, h); g.fill();
    g.fillStyle = '#f6c453'; for (let i = 0; i < 5; i++) g.fillRect(62, 6 + i * 20, 4, 10);
    g.fillStyle = '#e5484d'; g.fillRect(52, 66, 22, 14); g.fillStyle = '#3b82c4'; g.fillRect(70, 30, 14, 9);
    g.fillStyle = '#fff'; g.font = `700 12px ${FONT}`; g.fillText('LAP 2/3', 4, 12);
  });
}
export function createLoungeAnnex(tier = 1) {
  tier = Math.max(1, Math.min(2, tier | 0 || 1));
  const W = LOUNGE.walls, cx = (W.minX + W.maxX) / 2;
  const group = new THREE.Group();
  group.userData.world = true;
  group.userData.centre = plotCentre(PROPERTIES.lounge.plot);
  group.add(floorPlane(W.minX, W.maxX, W.minZ, W.maxZ, 0.012, 'wood', 2.4));
  addGeo2(group, loungeShell(tier));
  // glass front panes (transparent, between the mullions; door openings left free)
  const zf = W.maxZ - 0.05, doors = loungeDoors();
  const xs = [W.minX];
  for (const d of doors) xs.push(d - L_DOOR_W / 2, d + L_DOOR_W / 2);
  xs.push(W.maxX);
  for (let i = 0; i < xs.length; i += 2) group.add(glassPane(xs[i + 1] - xs[i] - 0.06, (W.height ?? 2.6) - 0.24, 0.04, (xs[i] + xs[i + 1]) / 2, 0.08, zf));
  for (const d of doors) for (const s of [-1, 1]) group.add(glassPane(0.86, 2.3, 0.05, d + s * (L_DOOR_W / 2 + 0.45), 0.06, zf - 0.12, glassTintMat));   // open sliding leaves
  // pictures on the back wall
  [[cx + 0.8, 0], [cx + 2.6, 1]].forEach(([x, k]) => { const f = face(pictureTex(k), 0.8, 0.56, { lit: true }); f.position.set(x, 1.85, W.minZ + 0.055); group.add(f); });
  // TV screen (flickers)
  const tv = LOUNGE.tv, tw = tier >= 2 ? 2.4 : 1.7;
  const tvMat = new THREE.MeshBasicMaterial({ map: tvTex(), toneMapped: false });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(tw, tw * 0.56), tvMat);
  scr.rotation.y = TV_YAW;
  scr.position.set(W.minX + 0.36 + Math.sin(TV_YAW) * 0.006, 1.05 + 0.06 + tw * 0.28, tv.z + Math.cos(TV_YAW) * 0.006);
  group.add(scr);
  // sign on top of the back wall
  const sign = roofSign(loungeSignTex(tier), 4.4, 1.1, { board: tier >= 2 ? TC.GOLD_D : TC.CORAL, bulbs: tier >= 2, tilt: -0.2 });
  sign.position.set(cx, (W.height ?? 2.6) + 0.1, W.minZ - (W.thickness ?? 0.3) / 2);
  group.add(sign);
  // solids: walls, glass front (door gaps open), counter, vending, TV console
  const T = W.thickness ?? 0.3, tt = LOUNGE.tipTray, v = LOUNGE.vending;
  const solids = hallSolids(W, T);
  for (let i = 0; i < xs.length; i += 2) solids.push({ minX: xs[i], maxX: xs[i + 1], minZ: zf - 0.1, maxZ: zf + 0.1 });
  solids.push({ minX: W.minX, maxX: tt.x - 0.36, minZ: tt.z - 1.05, maxZ: Math.min(tt.z + 0.8, W.maxZ - 0.4) });
  solids.push({ minX: v.x - 0.55, maxX: v.x + 1.2, minZ: W.minZ, maxZ: W.minZ + 0.85 });
  solids.push({ minX: W.minX, maxX: W.minX + 0.45, minZ: tv.z - tw / 2 - 0.2, maxZ: tv.z + tw / 2 + 0.2 });
  group.userData.solids = solids;
  const anim = [];
  let t = Math.random() * 10;
  anim.push(() => { const k = 0.82 + 0.18 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1)); tvMat.color.setScalar(k); });
  if (tier >= 2) {
    // rug under the seating area
    const xs0 = Math.min(...LOUNGE.seats.map((st) => st.x)), xs1 = Math.max(...LOUNGE.seats.map((st) => st.x));
    const zs0 = Math.min(...LOUNGE.seats.map((st) => st.z)), zs1 = Math.max(...LOUNGE.seats.map((st) => st.z));
    group.add(floorPlane(xs0 - 1.1, xs1 + 0.75, zs0 - 1.0, zs1 + 0.85, 0.018, 'carpet', 1.6));
    // aquarium: water volume, front glass, fish swimming end to end
    const aq = LOUNGE.aquarium, aw = 2.0, ad = 0.56;
    const water = new THREE.Mesh(unitBox, waterMat);
    water.scale.set(aw - 0.06, 0.8, ad - 0.06); water.position.set(aq.x, 0.75 + 0.4, aq.z); water.renderOrder = 2;
    group.add(water);
    group.add(glassPane(aw, 0.86, 0.02, aq.x, 0.75, aq.z + ad / 2 - 0.01));
    const fish = [];
    for (let i = 0; i < 7; i++) {
      const f = mesh(fishGeo(i % 3), litMat, { cast: false });
      f.position.set(aq.x, 0.95 + (i % 4) * 0.13, aq.z - 0.12 + (i % 3) * 0.1);
      group.add(f);
      fish.push({ f, ph: i * 1.7, sp: 0.35 + (i % 3) * 0.12, y: f.position.y });
    }
    anim.push(() => {
      for (const q of fish) {
        const u = Math.sin(t * q.sp + q.ph);
        q.f.position.x = aq.x + u * (aw / 2 - 0.2);
        q.f.rotation.y = Math.cos(t * q.sp + q.ph) > 0 ? 0 : PI;
        q.f.position.y = q.y + Math.sin(t * 2 + q.ph) * 0.03;
      }
    });
    // arcade screen + marquee glow
    const ar = LOUNGE.arcade;
    const arcMat = new THREE.MeshBasicMaterial({ map: arcadeTex(), toneMapped: false });
    const as = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.42), arcMat);
    as.position.set(ar.x + 0.19, 1.38, ar.z); as.rotation.set(0, R90, 0); as.rotateX(-0.2);
    group.add(as);
    const mq = face(signTex('BAY RACER', { bg: 0x6b3fa8, fg: TC.MUSTARD, shadow: TC.CORAL, border: null, w: 512, h: 128, size: 0.62 }), 0.76, 0.19);
    mq.position.set(ar.x + 0.32, 1.87, ar.z); mq.rotation.y = R90;
    group.add(mq);
    anim.push(() => { arcMat.color.setScalar(0.75 + 0.25 * Math.abs(Math.sin(t * 5.1))); });
    const bt = LOUNGE.bar, aq2 = LOUNGE.aquarium;
    solids.push({ minX: bt.x - 0.5, maxX: W.maxX, minZ: bt.z - 1.6, maxZ: bt.z + 1.6 });
    solids.push({ minX: aq2.x - 1.05, maxX: aq2.x + 1.05, minZ: W.minZ, maxZ: aq2.z + 0.3 });
    solids.push({ minX: W.minX, maxX: ar.x + 0.42, minZ: ar.z - 0.42, maxZ: ar.z + 0.42 });
  } else {
    const br = LOUNGE.bar;
    solids.push({ minX: W.maxX - 0.5, maxX: W.maxX, minZ: br.z - 0.85, maxZ: br.z + 0.85 });
  }
  function update(dt = 0.016) { t += dt; for (const a of anim) a(dt); }
  update(0);
  return { group, update, _anim: anim, _tier: tier };
}

// ================================================================ STUBS (replaced one by one below this line)
const stubMat = new THREE.MeshLambertMaterial({ color: 0xbbbbbb });
function slab(w, h, d, x = 0, z = 0) { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stubMat); m.position.set(x, h / 2, z); m.castShadow = true; g.add(m); return g; }
function station(w, d) { const group = slab(w, 1.6, d); const partAnchor = new THREE.Object3D(); partAnchor.position.set(0, 0.9, d / 2 + 0.05); group.add(partAnchor); return { group, partAnchor, setProgress: noop, update: noop }; }
export function createPaintHall() { return { group: new THREE.Group(), update: noop }; }
export function createSprayBooth() { return { group: slab(3.6, 0.05, 5.2), setLamp: noop, setTimer: noop, update: noop }; }
export function createPaintTank() { return station(1.9, 1.2); }
export function createVipHall() { return { group: new THREE.Group(), update: noop }; }
export function createVipBar() { return slab(2, 1.1, 0.8); }
export function createGoldLift() { const group = slab(1.9, 0.02, 3.2); const platform = new THREE.Object3D(); group.add(platform); return { group, platform, setHeight: noop, setLight: noop, update: noop }; }
export function createPremiumCabinet() { return station(2.2, 1.2); }
export function createRedCarpet() { return slab(1.2, 0.02, 5.4); }
export function createPaparazziWall() { return slab(3, 2.2, 0.2); }
export function createHostStand() { return slab(0.6, 1.1, 0.5); }
