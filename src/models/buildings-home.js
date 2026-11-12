// Home-block buildings (TOWN.md section 7): tow shed, car wash, lounge annex, paint shop, VIP club and their
// equipment. Same way of working as props.js / environment.js: one merged vertex-coloured mesh per rigid piece
// (voxel.js Builder via geo()), cached per look; moving bits are separate small meshes sharing materials.
// Placement (TOWN.md 7 + lead's rule): property buildings (tow shed, wash arches, lounge annex, paint hall, VIP hall)
// are built in WORLD coordinates from the config and carry group.userData.world = true (gameplay adds them at 0,0,0).
// Equipment (booth, tank, gold lift, cabinet, turntable, carpet, bar, paparazzi wall, host stand, kiosk) is built at
// the origin, front facing +z, and placed by gameplay.
import * as THREE from 'three';
import { LOUNGE, PAINT, VIP, WASH, PROPERTIES, RESCUE, PAINT_COLORS, TOWN, PALETTE as P } from '../config.js';
import { Builder, litMat, glowMat, mesh, memo, polygon } from './voxel.js';
import { createPart } from './props.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  TC, PI, R90, FONT, css, geo, solidGroup, canvasTex, face, faceMat, decal, signTex, roofSign, glassMat, glassTintMat, glassPane,
  flat, mixHex, floorPlane, floorTex, hallShell, wallWindow, plant, tireFlat, tireUp,
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
// LOUNGE.walls = inner faces (walls stand outside them, front at maxZ). Glazed front with one open sliding door
// at LOUNGE.door, warm wood floor, teal walls with wood wainscot, sofas at LOUNGE.seats
// facing the TV on the west wall, reception counter beside LOUNGE.tipTray (the tip tray itself is a town-kit prop
// gameplay places), vending machine at LOUNGE.vending, plants, pictures, sconces, windows, "HARBOR LOUNGE" sign.
// Tier 2 "Grand Lounge": espresso bar at LOUNGE.bar (barista stands behind it, east), aquarium with moving fish at
// LOUNGE.aquarium, arcade cabinet at LOUNGE.arcade (screen faces east; a player stands at x + 0.8), rug, bigger TV.
const L_DOOR_W = 1.8;
const loungeDoors = () => [LOUNGE.door.x];
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
    // glazed front: frame, mullions, transom; the door opening with its sliding leaves parked open
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
      // jambs 1 cm proud of the sill front, header 1.5 cm above the transom top (shared faces z-fight)
      b.box(0.1, H - 0.1, 0.18, TC.CORAL, d - L_DOOR_W / 2, 0, zf); b.box(0.1, H - 0.1, 0.18, TC.CORAL, d + L_DOOR_W / 2, 0, zf);
      b.box(L_DOOR_W + 0.2, 0.235, 0.22, TC.CORAL, d, H - 0.22, zf);                   // door header with the motor box
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

// ================================================================ paint shop "Spray Bay": shared bits
// Design: docs/town-agents/briefs/painthall.txt. Positions: PAINT, PAINT.decor (config.town.js).
const PD = PAINT.decor;
const SLATE = 0x46525e, SLATE_L = 0x4f5b67, PWALL = 0xf3eee4, PWALL_B = 0xe9e3d7, GRATE = 0x3a4048, GRATE_L = 0x59626c;
const AIR = 0x3b7dd8, VALVE = 0xd8403a, PUMP = 0x6a7f95, PUMP_D = 0x51627a;
const lumHex = (hex) => ((hex >> 16) & 255) * 0.3 + ((hex >> 8) & 255) * 0.59 + (hex & 255) * 0.11;
/** Pipes: axis along x / z (centre line at height y) or y (from y0 to y1). */
function cylX(b, r, x0, x1, y, z, c, seg = 8) { b.cyl(r, r, x1 - x0, c, (x0 + x1) / 2, y - (x1 - x0) / 2, z, seg, 0, 0, R90); }
function cylZ(b, r, z0, z1, y, x, c, seg = 8) { b.cyl(r, r, z1 - z0, c, x, y - (z1 - z0) / 2, (z0 + z1) / 2, seg, R90); }
function cylY(b, r, y0, y1, x, z, c, seg = 8) { b.cyl(r, r, y1 - y0, c, x, y0, z, seg); }
/** Red hand-wheel valve lying flat on a spindle (seen from above): centre (x, y, z). */
function handWheel(b, x, y, z, r = 0.07) {
  b.cyl(0.012, 0.012, 0.06, TC.STEEL_DD, x, y - 0.06, z, 6);
  b.cyl(r, r, 0.016, VALVE, x, y, z, 12);
  b.cyl(r * 0.72, r * 0.72, 0.018, mixHex(VALVE, 0x000000, 0.45), x, y - 0.001, z, 12);
  b.box(r * 1.5, 0.02, 0.018, VALVE, x, y, z); b.box(0.018, 0.02, r * 1.5, VALVE, x, y, z);
  b.cyl(0.02, 0.02, 0.026, TC.STEEL, x, y, z, 6);
}
/** Five-point star lying flat (extruded shape), centre (x, y, z), outer radius r. */
function flatStar(b, x, y, z, r, c, h = 0.01) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2, rr = i % 2 ? r * 0.45 : r; pts.push([Math.sin(a) * rr, Math.cos(a) * rr]); }
  b.shape(polygon(pts), h, c, x, y, z, -R90);
}
const colorMats = new Map();
/** Unlit flat-colour material, shared per hex. */
const flatColorMat = (hex) => memo(colorMats, hex, () => new THREE.MeshBasicMaterial({ color: hex }));
const barGeo = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0);   // grows from its left end with scale.x

// ================================================================ paint tank (station API), ORIGIN, front +z
// Skid with a grated drip tray, a vessel in the paint colour (domed lid, agitator with a spinning fan cap), a fill
// station front-right (pump, gooseneck fill head over a grated fill plate, fill bar on the pump), a canister shelf
// front-left (partAnchor) and a supply pipe from the lid back to the hall's manifold on the back wall.
const TK = { R: 0.44, z: -0.12, y0: 0.12, y1: 1.42, plate: { x: 0.68, y: 0.42, z: 0.40 }, head: { x: 0.68, z: -0.32 } };
const TK_TIP = 1.08, TK_DROP = 0.125;     // nozzle tip height (raised) and how far the fill head lowers onto a canister
function tankLook(key) {
  const hex = PAINT_COLORS[key]?.hex ?? 0xb0b0b0;
  const L = { hex, body2: null, rim: mixHex(hex, 0x000000, 0.25), lid: mixHex(hex, 0xffffff, 0.12), crescent: mixHex(hex, 0xffffff, 0.6),
    band: TC.STEEL, bandEdge: TC.STEEL_D, ring: null, star: false, glint: null, seg: 16 };
  if (key === 'white') Object.assign(L, { rim: 0xcfc9bd, lid: 0xffffff, crescent: 0xdfeaf2, band: TC.STEEL_DD, bandEdge: 0x4a535c, ring: TC.NAVY });
  if (key === 'black') Object.assign(L, { rim: 0x1b1e23, lid: 0x3a3f47, crescent: 0x8fa6c0, band: TC.CHROME, bandEdge: 0xaab4bb, ring: TC.CREAM });
  if (key === 'gold') Object.assign(L, { hex: TC.GOLD, body2: TC.GOLD_L, rim: TC.GOLD_D, lid: TC.GOLD_L, crescent: 0xfff3c4, band: 0xffe18a, bandEdge: TC.GOLD_D, star: true, glint: 0xfff6d0, seg: 12 });
  if (key === 'purple') Object.assign(L, { hex: 0x8e5bd1, body2: 0xb48ae8, rim: 0x6a3fa6, lid: 0xa274de, crescent: 0xff5fd2, band: TC.GOLD, bandEdge: TC.GOLD_D, star: true, glint: 0xffe2ff, seg: 12 });
  return L;
}
/** Local z of the hall's manifold behind a tank (all stations share z). */
const tankManifoldZ = () => (PAINT.walls.minZ + 0.12) - Object.values(PAINT.stations)[0].z;
function tankGeo(key) {
  return geo(`ptank|${key}`, (b) => {
    const L = tankLook(key), R = TK.R, tz = TK.z;
    // ---- skid: steel frame, grated drip tray, a few drips of this colour on the grating
    b.box(1.68, 0.06, 0.98, 0x2f353c, 0, 0.02, 0);
    for (const s of [-1, 1]) { b.box(1.8, 0.1, 0.06, TC.STEEL_D, 0, 0, s * 0.52); b.box(0.06, 0.1, 1.1, TC.STEEL_D, s * 0.87, 0, 0); }
    for (let x = -0.8; x < 0.81; x += 0.1) b.box(0.016, 0.014, 0.98, GRATE_L, x, 0.08, 0);
    for (let z = -0.42; z < 0.43; z += 0.14) b.box(1.68, 0.014, 0.016, GRATE_L, 0, 0.08, z);
    for (const [x, z, r] of [[0.62, 0.36, 0.09], [0.3, 0.42, 0.05], [-0.42, 0.42, 0.06], [0.74, 0.12, 0.05]]) b.cyl(r, r, 0.006, mixHex(L.hex, GRATE, 0.45), x, 0.094, z, 8);
    // ---- vessel: base ring, darker bottom rim, body (faceted two-tone for the premium colours), hoop bands
    b.cyl(R - 0.04, R - 0.02, 0.03, TC.STEEL_DD, 0, 0.094, tz, 16);
    b.cyl(R + 0.01, R + 0.01, 0.1, L.rim, 0, TK.y0, tz, L.seg);
    b.cyl(R, R, TK.y1 - TK.y0 - 0.1, L.hex, 0, TK.y0 + 0.1, tz, L.seg);
    if (L.body2) {
      const n = L.seg, ap = R * Math.cos(PI / n) + 0.004, fw = 2 * R * Math.sin(PI / n) - 0.01;
      for (let i = 0; i < n; i += 2) { const a = (i + 0.5) * (2 * PI / n); b.box(fw, TK.y1 - TK.y0 - 0.12, 0.012, L.body2, Math.sin(a) * ap, TK.y0 + 0.1, tz + Math.cos(a) * ap, 0, a, 0); }
    }
    for (const y of [0.5, 1.1]) { b.cyl(R + 0.016, R + 0.016, 0.05, L.band, 0, y, tz, L.seg); b.cyl(R + 0.02, R + 0.02, 0.012, L.bandEdge, 0, y + 0.019, tz, L.seg); }
    // label plate (hazard diamond) + sight glass with the paint level on the front
    b.box(0.24, 0.17, 0.03, TC.CREAM_L, 0, 0.66, tz + R - 0.004);
    b.box(0.07, 0.07, 0.012, VALVE, -0.06, 0.71, tz + R + 0.012, 0, 0, PI / 4);
    for (let i = 0; i < 3; i++) b.box(0.08, 0.012, 0.012, TC.NAVY, 0.05, 0.69 + i * 0.03, tz + R + 0.012);
    { const a = 0.5, gx = Math.sin(a) * (R + 0.04), gz = tz + Math.cos(a) * (R + 0.04);
      cylY(b, 0.026, 0.3, 1.32, gx, gz, TC.STEEL_D, 6); cylY(b, 0.02, 0.36, 0.96, gx + Math.sin(a) * 0.012, gz + Math.cos(a) * 0.012, L.hex === 0xf4f1ea ? 0xd6d2c8 : L.hex, 6);
      cylY(b, 0.02, 0.96, 1.26, gx + Math.sin(a) * 0.012, gz + Math.cos(a) * 0.012, TC.GLASS_L, 6); }
    // ---- domed lid (lighter), highlight crescent, ring (white / black), star badge (premium)
    const ly = TK.y1;
    b.cyl(R + 0.025, R + 0.025, 0.04, mixHex(L.lid, 0x000000, 0.12), 0, ly, tz, L.seg);
    b.cyl(R - 0.1, R + 0.01, 0.08, L.lid, 0, ly + 0.04, tz, L.seg);
    b.cyl(R - 0.1, R - 0.1, 0.02, L.lid, 0, ly + 0.12, tz, L.seg);
    for (let i = 0; i < 7; i++) {
      const a = PI * 1.12 + i * 0.1, r = R - 0.16 - Math.sin((i / 6) * PI) * 0.02;
      b.box(0.075, 0.008, 0.05 + Math.sin((i / 6) * PI) * 0.03, L.crescent, Math.sin(a) * r, ly + 0.14, tz + Math.cos(a) * r, 0, a, 0);
    }
    if (L.ring) { b.cyl(0.24, 0.24, 0.006, L.ring, 0, ly + 0.14, tz, 16); b.cyl(0.19, 0.19, 0.008, L.lid, 0, ly + 0.14, tz, 16); }
    if (L.star) flatStar(b, 0, ly + 0.14, tz + 0.22, 0.085, TC.CREAM_L);
    // ---- agitator: steel bridge on the lid flange, motor housing (the fan cap on top is a separate mesh)
    for (const s of [-1, 1]) b.box(0.07, 0.16, 0.08, TC.STEEL_D, s * (R - 0.02), ly + 0.04, tz);
    b.box(2 * R + 0.04, 0.05, 0.09, TC.STEEL, 0, ly + 0.2, tz);
    b.cyl(0.1, 0.1, 0.15, PUMP, 0, ly + 0.25, tz, 12);
    for (let i = 0; i < 3; i++) b.cyl(0.106, 0.106, 0.012, PUMP_D, 0, ly + 0.27 + i * 0.04, tz, 12);
    b.box(0.08, 0.06, 0.05, PUMP_D, 0.1, ly + 0.27, tz);                                        // terminal box
    // ---- supply pipe: lid back edge -> up to the manifold height -> back to the hall's valve stub (flange)
    const my = PD.manifoldY, zb = tz - R + 0.04, zm = tankManifoldZ() + 0.12;
    b.box(0.12, 0.03, 0.12, TC.STEEL_D, 0, ly + 0.04, zb);
    cylY(b, 0.035, ly + 0.06, my, 0, zb, TC.STEEL);
    b.cyl(0.045, 0.045, 0.08, TC.STEEL_D, 0, my - 0.04, zb, 8);                                 // elbow
    cylZ(b, 0.035, zm, zb, my, 0, TC.STEEL);
    cylZ(b, 0.06, zm, zm + 0.025, my, 0, TC.STEEL_D, 10);                                         // flange
    // ---- fill station: pump (outlet pipe from the vessel bottom), stand pipe for the fill head, fill plate
    const pz = -0.22, px = TK.head.x;
    b.box(0.36, 0.5, 0.42, PUMP, px, 0.1, pz);
    b.box(0.37, 0.04, 0.43, PUMP_D, px, 0.1, pz);
    b.box(0.3, 0.012, 0.1, 0x22282e, px, 0.6, -0.08);                                           // fill-bar slot
    b.box(0.12, 0.08, 0.02, TC.CREAM, px - 0.08, 0.38, pz + 0.215);                               // pump plate
    cylZ(b, 0.1, -0.55, pz - 0.21, 0.32, px, PUMP_D, 10);                                         // motor on its back
    for (let i = 0; i < 3; i++) cylZ(b, 0.104, -0.5 + i * 0.04, -0.49 + i * 0.04, 0.32, px, PUMP, 10);
    cylX(b, 0.035, R - 0.06, px - 0.18, 0.24, pz + 0.07, TC.STEEL);                              // vessel outlet -> pump
    b.box(0.05, 0.05, 0.05, VALVE, 0.46, 0.27, pz + 0.07); b.box(0.12, 0.02, 0.02, VALVE, 0.46, 0.32, pz + 0.07);   // ball valve
    cylY(b, 0.03, 0.6, 1.3, px, TK.head.z, TC.STEEL);                                             // stand pipe
    b.cyl(0.045, 0.045, 0.02, TC.CREAM_L, px + 0.05, 0.78, TK.head.z + 0.03, 10, R90);           // gauge
    const P0 = TK.plate;
    b.box(0.08, P0.y - 0.1 - 0.02, 0.08, TC.STEEL_D, P0.x, 0.1, P0.z);
    b.box(0.32, 0.02, 0.32, TC.STEEL_D, P0.x, P0.y - 0.02, P0.z);
    for (let i = -2; i <= 2; i++) { b.box(0.012, 0.006, 0.3, GRATE_L, P0.x + i * 0.06, P0.y, P0.z); b.box(0.3, 0.006, 0.012, GRATE_L, P0.x, P0.y, P0.z + i * 0.06); }
    // ---- canister shelf (front-left), grated, on short legs, a lip at the back
    const S0 = { x: -0.66, y: 0.45, z: 0.28 };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.03, S0.y - 0.12, 0.03, TC.STEEL_D, S0.x + sx * 0.19, 0.1, S0.z + sz * 0.19);
    b.box(0.42, 0.025, 0.42, TC.STEEL_D, S0.x, S0.y - 0.025, S0.z);
    for (let i = -3; i <= 3; i++) b.box(0.012, 0.005, 0.4, GRATE_L, S0.x + i * 0.055, S0.y, S0.z);
    b.box(0.42, 0.05, 0.02, TC.STEEL_D, S0.x, S0.y, S0.z - 0.2);
  });
}
/** Moving fill head: sleeve on the stand pipe, gooseneck arm, nozzle over the fill plate. Origin = stand pipe axis. */
const tankHeadGeo = () => geo('ptank|head', (b) => {
  const dz = TK.plate.z - TK.head.z, top = TK_TIP + 0.24;
  cylY(b, 0.045, top - 0.16, top, 0, 0, TC.STEEL_D, 10);
  b.cyl(0.05, 0.05, 0.05, PUMP, 0, top - 0.02, 0, 10);
  cylZ(b, 0.03, 0, dz, top - 0.02, 0, TC.STEEL);
  b.cyl(0.04, 0.04, 0.06, PUMP, 0, top - 0.05, dz, 10);
  cylY(b, 0.025, TK_TIP + 0.04, top - 0.04, 0, dz, TC.STEEL);
  b.cyl(0.022, 0.03, 0.05, TC.DARK, 0, TK_TIP, dz, 8);                                          // rubber nozzle tip
  b.box(0.02, 0.07, 0.03, VALVE, 0.04, top - 0.12, dz);                                          // trigger
});
const tankFanGeo = () => geo('ptank|fan', (b) => {
  b.cyl(0.085, 0.085, 0.016, TC.STEEL_DD, 0, 0, 0, 12);
  for (let i = 0; i < 3; i++) b.box(0.15, 0.012, 0.04, TC.MUSTARD, 0, 0.016, 0, 0, (i / 3) * PI, 0);
  b.cyl(0.025, 0.025, 0.03, TC.STEEL, 0, 0.012, 0, 8);
});
const glintGeo = () => geo('ptank|glint', (b) => {
  b.box(0.26, 0.024, 0.01, 0xffffff, 0, -0.012, 0); b.box(0.024, 0.26, 0.01, 0xffffff, 0, -0.13, 0);
  b.box(0.06, 0.06, 0.012, 0xffffff, 0, -0.03, 0, 0, 0, PI / 4);
});
export function createPaintTank(colorId = 'red') {
  const key = PAINT_COLORS[colorId] ? colorId : 'red', L = tankLook(key);
  const group = new THREE.Group();
  group.add(mesh(tankGeo(key), litMat, { cast: true, receive: true }));
  const fan = mesh(tankFanGeo(), litMat, { cast: false });
  fan.position.set(0, TK.y1 + 0.4, TK.z);
  group.add(fan);
  const head = mesh(tankHeadGeo(), litMat, { cast: true });
  head.position.set(TK.head.x, 0, TK.head.z);
  group.add(head);
  const bar = new THREE.Mesh(barGeo, flatColorMat(L.hex));
  bar.position.set(TK.head.x - 0.14, 0.6, -0.08); bar.scale.set(0.001, 0.014, 0.07); bar.visible = false;
  group.add(bar);
  const can = createPart('spray:' + key);                    // the canister being filled, standing on the plate
  can.rotation.z = R90;
  can.position.set(TK.plate.x + 0.122, TK.plate.y + 0.204, TK.plate.z);
  can.visible = false;
  group.add(can);
  let glint = null;
  if (L.glint) {
    glint = new THREE.Mesh(glintGeo(), flatColorMat(L.glint));
    glint.position.set(-0.2, 1.3, TK.z + Math.cos(-0.47) * (TK.R + 0.03));
    glint.rotation.set(-0.5, -0.45, 0);
    glint.visible = false;
    group.add(glint);
  }
  const partAnchor = new THREE.Object3D();
  partAnchor.position.set(-0.66, 0.47, 0.28);
  group.add(partAnchor);
  let k = 1, filling = false, t = Math.random() * 3, nextGlint = 1 + Math.random() * 2;
  // (stations only call update() while the player is near, so setProgress places everything by itself)
  function setProgress(v) {
    k = clamp01(v);
    filling = v > 0 && v < 1;
    can.visible = filling;
    bar.visible = filling;
    if (filling) bar.scale.x = Math.max(0.001, 0.28 * k);
    head.position.y = filling ? -TK_DROP : 0;            // nozzle down on the canister while it fills, up otherwise
    if (!filling) head.position.x = TK.head.x;
  }
  function update(dt = 0.016) {
    t += dt;
    fan.rotation.y -= dt * 7;
    // the pump hums while it fills: a 1-2 mm shudder of the fill head, never a jump
    head.position.x = TK.head.x + (filling ? Math.sin(t * 91) * 0.0015 : 0);
    if (glint) {
      nextGlint -= dt;
      if (nextGlint < 0) {
        const u = -nextGlint / 0.4;
        if (u >= 1) { glint.visible = false; nextGlint = 2 + Math.random(); }
        else { glint.visible = true; const s = Math.sin(u * PI); glint.scale.setScalar(0.2 + s); glint.rotation.z = u * 0.6; }
      }
    }
  }
  setProgress(1);
  return { group, partAnchor, setProgress, update };
}

// ================================================================ spray booth (bay model), ORIGIN = car centre, front +z
// Downdraft grate deck, glass side walls on steel kick plates (extraction filter slots), white posts, light boxes
// on the top rails (glass-topped, tilted in), a roll-down clear PVC curtain at the south (vehicle) mouth, open north
// (personnel) end, control column outside the north-west corner (timer ring, booth number, beacon, hose reel), IR
// curing arrays (upgrade) and an overspray haze inside the glass.
/** Soft fog sheet: alpha fades out towards every edge, with a little wispiness. */
function hazeTex() {
  return canvasTex('boothHaze', 64, 128, (g, w, h) => {
    const img = g.createImageData(w, h);
    let s = 11;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ex = Math.min(x, w - 1 - x) / (w * 0.32), ey = Math.min(y, h - 1 - y) / (h * 0.22);
      const e = Math.min(1, ex) * Math.min(1, ey);
      const a = e * e * (3 - 2 * e) * (0.75 + 0.25 * rnd());
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
  });
}
const BOOTH = () => {
  const bay = PAINT.bays[0], hw = PAINT.boothHalfW;
  return { hw, z0: PAINT.boothZ[0] - bay.z, z1: PAINT.boothZ[1] - bay.z, colX: -(hw + 0.25), colZ: PAINT.boothZ[0] - bay.z + 0.5 };
};
const BOOTH_RAIL = 2.25, LENS_TILT = 0.44;
const boothMats = {
  lensIdle: new THREE.MeshLambertMaterial({ color: 0xc9d4dc }),
  white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  warm: new THREE.MeshBasicMaterial({ color: 0xffc35e }),
  orange: new THREE.MeshBasicMaterial({ color: 0xff6a2a }),
};
/** Light housing frame: point (lx, ly) of a housing on side s (tilted s * LENS_TILT) -> [x, y]. */
function lampPt(s, lx, ly) {
  const B = BOOTH(), a = s * LENS_TILT, cx = s * (B.hw - 0.1), cy = BOOTH_RAIL + 0.15;
  return [cx + lx * Math.cos(a) - ly * Math.sin(a), cy + lx * Math.sin(a) + ly * Math.cos(a)];
}
/** Downdraft grate on the booth deck: one tile = 0.2 m with a long bar and a cross bar (mipmapped, so it blends
 *  smoothly from the high camera instead of shimmering like sub-pixel bars). */
function boothGrate() {
  const { hw, z0, z1 } = BOOTH(), w = 2 * hw - 0.1, d = z1 - z0 - 0.1;
  const tex = canvasTex('boothGrate', 64, 64, (g, W, H) => {
    g.fillStyle = '#2a2f36'; g.fillRect(0, 0, W, H);
    g.fillStyle = css(GRATE_L); g.fillRect(0, H * 0.44, W, H * 0.125);
    g.fillStyle = css(GRATE); g.fillRect(W * 0.425, 0, W * 0.15, H);
  }, { repeat: [w / 0.2, d / 0.2] });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: tex }));
  m.rotation.x = -R90; m.position.set(0, 0.026, (z0 + z1) / 2); m.receiveShadow = true;
  return m;
}
function boothGeo() {
  return geo('booth|static', (b) => {
    const { hw, z0, z1, colX } = BOOTH(), zc = (z0 + z1) / 2, len = z1 - z0, zm = zc;
    // ---- downdraft grate deck (top 0.03), kerb angles, overspray blotches, hazard strips across both mouths
    b.box(2 * hw - 0.1, 0.018, len - 0.1, 0x2a2f36, 0, 0, zc);                                // the grate is a texture on top (boothGrate)
    for (const s of [-1, 1]) { b.box(0.06, 0.03, len - 0.1, TC.STEEL, s * (hw - 0.08), 0, zc); b.box(0.025, 0.05, len - 0.1, TC.STEEL_D, s * (hw - 0.04), 0, zc); }
    // faint overspray settled along the walls (the extraction pulls it there): overlapping low-contrast patches
    const ov = [['red', 'blue', 'teal'], ['lime', 'purple', 'red']];
    for (const s of [-1, 1]) for (let i = 0, z = z0 + 0.3; z < z1 - 0.35; i++, z += 0.55) {
      const w = 0.14 + ((i * 7 + (s > 0 ? 3 : 0)) % 5) * 0.045, l = 0.45 + (i % 3) * 0.12, c = PAINT_COLORS[ov[s > 0 ? 1 : 0][i % 3]].hex;
      const y = 0.028 + (i % 2) * 0.0015;                                                       // neighbours overlap: never level
      b.box(w, 0.004, l, mixHex(GRATE, c, 0.06 + (i % 3) * 0.02), s * (hw - 0.13 - w / 2), y, z);
      if (i % 2) b.box(w * 0.5, 0.005, l * 0.6, mixHex(GRATE, c, 0.11), s * (hw - 0.13 - w * 0.25), y, z + 0.06);
    }
    for (const zz of [z0 + 0.12, z1 - 0.12]) for (let i = 0; i < 12; i++) b.box((2 * hw - 0.2) / 12, 0.006, 0.16, i % 2 ? P.hazardB : P.hazardA, -hw + 0.1 + (i + 0.5) * (2 * hw - 0.2) / 12, 0.028, zz);
    // ---- side walls: kick plate with filter slots + overspray speckle, posts, rails (glass is a separate mesh)
    for (const s of [-1, 1]) {
      const x = s * hw;
      b.box(0.06, 0.35, len, TC.STEEL_D, x, 0, zc);
      b.box(0.08, 0.03, len, TC.STEEL, x, 0.35, zc);                                          // bottom glazing rail
      for (let z = z0 + 0.35; z < z1 - 0.3; z += 0.5) {
        if (Math.abs(z - zm) < 0.2) continue;
        b.box(0.012, 0.16, 0.36, 0x23282e, x - s * 0.034, 0.1, z);                            // filter slot (inner face)
        for (let i = 0; i < 3; i++) b.box(0.014, 0.012, 0.36, TC.STEEL_DD, x - s * 0.036, 0.13 + i * 0.05, z);
      }
      for (let i = 0; i < 14; i++) {
        const k = Object.keys(PAINT_COLORS)[i % 8], z = z0 + 0.2 + ((i * 0.618) % 1) * (len - 0.4), y = 0.04 + ((i * 0.37) % 1) * 0.26;
        b.box(0.008, 0.04, 0.05, mixHex(TC.STEEL_D, PAINT_COLORS[k].hex, 0.2), x - s * 0.034, y, z);
      }
      for (const z of [z0, zm, z1]) { b.box(0.1, BOOTH_RAIL, 0.1, TC.CREAM_L, x, 0, z); b.box(0.16, 0.04, 0.16, TC.STEEL_DD, x, 0, z); }
      b.box(0.1, 0.08, len, TC.CREAM_L, x, BOOTH_RAIL - 0.08, zc);                            // top rail
      // light box on the rail: tilted housing (the lenses are a separate mesh), brackets
      const [hx, hy] = lampPt(s, 0, 0);
      b.box(0.3, 0.18, len - 0.06, 0x8d99a3, hx, hy - 0.09, zc, 0, 0, s * LENS_TILT);
      for (const z of [z0 + 0.04, z1 - 0.04]) b.box(0.32, 0.2, 0.04, TC.CREAM_L, hx, hy - 0.1, z, 0, 0, s * LENS_TILT);   // end caps
      const [px, py] = lampPt(s, 0, -0.105);
      b.box(0.32, 0.03, len - 0.02, TC.STEEL_D, px, py - 0.015, zc, 0, 0, s * LENS_TILT);
      for (const z of [z0 + 0.3, zm, z1 - 0.3]) b.box(0.06, 0.12, 0.06, TC.STEEL_DD, x - s * 0.02, BOOTH_RAIL - 0.02, z);
    }
    // ---- roller box over the south (vehicle) mouth; the clear curtain hangs from it
    b.box(2 * hw + 0.12, 0.2, 0.22, 0xe9edf0, 0, BOOTH_RAIL, z1);
    b.box(2 * hw + 0.14, 0.03, 0.24, TC.STEEL_D, 0, BOOTH_RAIL, z1);
    b.box(0.16, 0.16, 0.2, TC.STEEL_DD, hw + 0.14, BOOTH_RAIL + 0.02, z1);                       // roller motor
    for (let i = 0; i < 9; i++) b.box(0.18, 0.02, 0.01, i % 2 ? P.hazardB : P.hazardA, -0.8 + i * 0.2, BOOTH_RAIL + 0.08, z1 + 0.112);
    // ---- control column outside the north-west corner (timer face, number plate, beacon are separate meshes)
    const cz = BOOTH().colZ;
    b.box(0.42, 0.04, 0.42, TC.STEEL_DD, colX, 0, cz);
    b.box(0.32, 2.3, 0.32, SLATE, colX, 0.04, cz);
    b.box(0.3, 0.9, 0.02, TC.CREAM, colX, 1.15, cz + 0.165);
    b.box(0.34, 0.06, 0.34, TC.NAVY_D, colX, 2.3, cz);
    b.push(colX, 1.5, cz + 0.2, 0, 1, -0.52); b.box(0.3, 0.32, 0.06, TC.NAVY_D, 0, -0.16, -0.03); b.pop();   // timer bezel, tilted back
    b.push(colX, 1.92, cz + 0.19, 0, 1, -0.52); b.box(0.28, 0.13, 0.04, TC.NAVY_D, 0, -0.065, -0.02); b.pop(); // number plate backing
    b.box(0.12, 0.06, 0.06, 0x5fbf6a, colX - 0.07, 0.95, cz + 0.17); b.box(0.08, 0.08, 0.04, VALVE, colX + 0.07, 0.94, cz + 0.17);   // start / stop
    // air-hose reel + empty gun holster on the west face
    const wx = colX - 0.16;
    b.box(0.04, 0.3, 0.3, TC.STEEL_DD, wx - 0.02, 1.0, cz);
    b.cyl(0.17, 0.17, 0.03, TC.MUSTARD_D, wx - 0.06, 1.15 - 0.015, cz, 14, 0, 0, R90);
    b.cyl(0.13, 0.13, 0.1, AIR, wx - 0.14, 1.15 - 0.05, cz, 14, 0, 0, R90);
    b.cyl(0.17, 0.17, 0.03, TC.MUSTARD_D, wx - 0.22, 1.15 - 0.015, cz, 14, 0, 0, R90);
    b.cyl(0.05, 0.05, 0.2, TC.STEEL, wx - 0.12, 1.15 - 0.1, cz, 8, 0, 0, R90);
    b.box(0.02, 0.36, 0.02, AIR, wx - 0.14, 0.78, cz + 0.12);                                     // hose end hanging to the holster
    b.box(0.1, 0.16, 0.1, TC.DARK, wx - 0.05, 0.58, cz + 0.12);                                   // empty gun holster
    b.box(0.06, 0.04, 0.06, TC.STEEL_DD, wx - 0.05, 0.56, cz + 0.12);
  });
}
/** Glass panes of both side walls (0.35 .. 2.2 between the posts), one transparent mesh. */
const boothGlassGeo = () => geo('booth|glass', (b) => {
  const { hw, z0, z1 } = BOOTH(), zm = (z0 + z1) / 2;
  for (const s of [-1, 1]) for (const [a, e] of [[z0, zm], [zm, z1]]) b.box(0.03, 2.17 - 0.38, e - a - 0.1, 0xffffff, s * hw, 0.38, (a + e) / 2);
});
/** Lenses of both light boxes (top + inner face), one mesh, material swapped per state. */
const boothLensGeo = () => geo('booth|lens', (b) => {
  const { z0, z1 } = BOOTH(), zc = (z0 + z1) / 2, len = z1 - z0 - 0.16;
  for (const s of [-1, 1]) {
    const [tx, ty] = lampPt(s, 0, 0.096), [ix, iy] = lampPt(s, -s * 0.156, 0.01);
    b.box(0.25, 0.014, len, 0xffffff, tx, ty - 0.007, zc, 0, 0, s * LENS_TILT);
    b.box(0.014, 0.13, len, 0xffffff, ix, iy - 0.065, zc, 0, 0, s * LENS_TILT);
  }
});
/** IR curing arrays: two gold reflector panels per side on hangers from the top rail, angled at the car. */
const IR_PANELS = () => { const out = []; for (const s of [-1, 1]) for (const z of [-0.62, 0.62]) out.push({ s, z }); return out; };
const IR_X = 1.55, IR_Y = 1.75, IR_TILT = 0.6;
/** Panel frame of side s: the emitting face (underside) looks down and in, at the car. */
const irPt = (s, lx, ly) => { const a = -s * IR_TILT; return [s * IR_X + lx * Math.cos(a) - ly * Math.sin(a), IR_Y + lx * Math.sin(a) + ly * Math.cos(a)]; };
const boothIrGeo = () => geo('booth|ir', (b) => {
  for (const s of [-1, 1]) b.box(0.05, 0.05, 2.3, TC.STEEL_DD, s * 1.74, 2.12, 0);            // carrier bar under the top rail
  for (const { s, z } of IR_PANELS()) {
    for (const dz of [-0.3, 0.3]) b.box(0.03, 0.44, 0.03, TC.STEEL_DD, s * 1.7, 1.68, z + dz); // short arms down to the panel
    const [bx, by] = irPt(s, 0, 0), [fx, fy] = irPt(s, 0, -0.035);
    b.box(0.5, 0.06, 0.9, TC.GOLD_D, bx, by - 0.03, z, 0, 0, -s * IR_TILT);                    // reflector box
    b.box(0.46, 0.012, 0.86, TC.GOLD_L, fx, fy - 0.006, z, 0, 0, -s * IR_TILT);                // polished gold face (underside)
  }
});
const boothIrTubeGeo = () => geo('booth|irtube', (b) => {
  for (const { s, z } of IR_PANELS()) for (const u of [-0.13, 0, 0.13]) {
    const [x, y] = irPt(s, u, -0.065);
    b.box(0.045, 0.045, 0.8, 0xffffff, x, y - 0.0225, z, 0, 0, -s * IR_TILT);
  }
});
const irPoolTex = () => canvasTex('irPool', 64, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, h / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.save(); g.scale(1, 1); g.fillRect(0, 0, w, h); g.restore();
});
const irPoolGeo = (() => {
  const parts = [-1, 1].map((s) => new THREE.PlaneGeometry(1.1, 2.8).rotateX(-R90).translate(s * 1.22, 0.036, 0));
  return mergeGeometries(parts);
})();
/** Cure timer ring: 12 segments, `n` lit clockwise from 12 o'clock (mustard on dark), cached per n, shared. */
function boothTimerTex(n) {
  return canvasTex(`boothTimer|${n}`, 128, 128, (g, w, h) => {
    g.fillStyle = '#1b2a36'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.lineWidth = 17; g.lineCap = 'butt';
    for (let i = 0; i < 12; i++) {
      const a0 = -PI / 2 + i * (PI / 6) + 0.06, a1 = a0 + PI / 6 - 0.12;
      g.strokeStyle = i < n ? css(TC.MUSTARD) : '#3a4552';
      g.beginPath(); g.arc(64, 64, 44, a0, a1); g.stroke();
    }
    g.fillStyle = n >= 12 ? '#5fd38d' : '#2c3e4c'; g.beginPath(); g.arc(64, 64, 24, 0, 7); g.fill();
  });
}
function boothNumTex(n) {
  return canvasTex(`boothNum|${n}`, 256, 112, (g, w, h) => {
    g.fillStyle = css(TC.NAVY); g.fillRect(0, 0, w, h);
    g.strokeStyle = css(TC.MUSTARD); g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = css(TC.CREAM_L); g.font = `600 34px ${FONT}`; g.fillText('BOOTH', 88, 58);
    g.fillStyle = css(TC.MUSTARD); g.font = `700 78px ${FONT}`; g.fillText(String(n), 200, 60);
  });
}
const curtainTex = () => canvasTex('boothCurtain', 128, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(205,232,246,0.42)'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x + 2, 0, 2, h); g.fillStyle = 'rgba(110,150,175,0.35)'; g.fillRect(x + 14, 0, 2, h); }
});
let curtainMat = null;
const curtainGeo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);   // hangs down from its top edge
const shelterRoofMat = new THREE.MeshLambertMaterial({ color: 0xe8f6fb, transparent: true, opacity: 0.16, depthWrite: false });
const boothGlassMat = new THREE.MeshLambertMaterial({ color: 0xcfeefa, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
export function createSprayBooth(index = 0) {
  const B = BOOTH(), { hw, z0, z1, colX } = B, cz = B.colZ;
  const group = new THREE.Group();
  group.add(mesh(boothGeo(), litMat, { cast: true, receive: true }));
  group.add(boothGrate());
  const glass = new THREE.Mesh(boothGlassGeo(), boothGlassMat);
  glass.renderOrder = 3;
  group.add(glass);
  const lens = new THREE.Mesh(boothLensGeo(), boothMats.lensIdle);
  group.add(lens);
  // curtain (rolls from the roller box down to the deck)
  if (!curtainMat) {
    curtainMat = new THREE.MeshLambertMaterial({ map: curtainTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    curtainMat.map.wrapS = THREE.RepeatWrapping; curtainMat.map.repeat.set(3, 1);
  }
  const CURTAIN_H = BOOTH_RAIL - 0.03;
  const curtain = new THREE.Mesh(curtainGeo, curtainMat);
  curtain.scale.set(2 * hw, 0.001, 1);
  curtain.position.set(0, BOOTH_RAIL, z1 - 0.13);
  curtain.renderOrder = 4; curtain.visible = false;
  group.add(curtain);
  // control column faces: timer ring (map swapped per lit count), booth number, beacon
  const timer = face(boothTimerTex(0), 0.26, 0.26);
  timer.position.set(colX, 1.5 + 0.0015, cz + 0.2 + 0.0026);
  timer.rotation.x = -0.52;
  group.add(timer);
  const num = face(boothNumTex(index + 1), 0.25, 0.11);
  num.position.set(colX, 1.92 + 0.0015, cz + 0.19 + 0.0026);
  num.rotation.x = -0.52;
  group.add(num);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.16, 12), LAMP.off);
  beacon.position.set(colX, 2.36 + 0.08, cz);
  group.add(beacon);
  // IR arrays (upgrade): housings + element tubes (own material: it pulses during the cure)
  const ir = new THREE.Group();
  ir.add(mesh(boothIrGeo(), litMat, { cast: false }));
  const irMat = new THREE.MeshBasicMaterial({ color: 0x8a4a30 });
  const tubes = new THREE.Mesh(boothIrTubeGeo(), irMat);
  ir.add(tubes);
  // the lamps light the grate under them (only while they bake): one additive pool per side, pulsing
  const poolMat = new THREE.MeshBasicMaterial({ map: irPoolTex(), color: 0xff7a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const pool = new THREE.Mesh(irPoolGeo, poolMat);
  pool.visible = false;
  ir.add(pool);
  ir.visible = false;
  group.add(ir);
  // overspray haze inside the glass: three soft-edged fog layers low in the booth (a box showed its flat top to the
  // high camera as a hard pale slab sticking out past the north end; real overspray is a fog with no surface)
  const hazeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: hazeTex(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const haze = new THREE.Group();
  for (const y of [0.35, 0.8, 1.25]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * (hw - 0.15), z1 - z0 - 0.3), hazeMat);
    m.rotation.x = -R90; m.position.set(0, y, (z0 + z1) / 2); m.renderOrder = 2;
    haze.add(m);
  }
  haze.visible = false;
  group.add(haze);
  group.userData.obstacles = [
    { minX: -hw - 0.08, maxX: -hw + 0.08, minZ: z0, maxZ: z1 },
    { minX: hw - 0.08, maxX: hw + 0.08, minZ: z0, maxZ: z1 },
    { minX: colX - 0.21, maxX: colX + 0.21, minZ: cz - 0.21, maxZ: cz + 0.21 },
  ];
  let state = 'idle', irOn = false, hazeTarget = 0, curtainK = 0, curtainTarget = 0, t = 0, doneT = 0, lastTimer = -1, lastUpd = -1e9;
  function applyCurtain() {
    curtain.visible = curtainK > 0.002;
    curtain.scale.y = Math.max(0.001, curtainK * CURTAIN_H);
  }
  // gameplay only updates a bay model while it is on screen: a booth that was not updated lately jumps straight
  // to its current state (curtain, haze), so it never rolls its curtain late when the player comes back
  const stale = () => performance.now() - lastUpd > 300;
  function settle() {
    curtainK = curtainTarget; applyCurtain();
    hazeMat.opacity = hazeTarget; haze.visible = hazeTarget > 0;
  }
  function setLamp(s) {
    state = ['idle', 'spray', 'cure', 'done'].includes(s) ? s : 'idle';
    lens.material = state === 'idle' ? boothMats.lensIdle : state === 'cure' ? boothMats.warm : boothMats.white;
    beacon.material = state === 'spray' ? LAMP.amber : state === 'cure' ? boothMats.orange : state === 'done' ? LAMP.green : LAMP.off;
    curtainTarget = state === 'spray' || state === 'cure' ? 1 : 0;
    if (stale()) settle();
    doneT = 0;
    if (state === 'idle') setTimer(0);
    irMat.color.setHex(state === 'cure' ? 0xff7a3a : 0x8a4a30);
    pool.visible = state === 'cure';
    poolMat.opacity = state === 'cure' ? 0.85 : 0;
  }
  function setTimer(k) {
    const n = Math.round(clamp01(k) * 12);
    if (n === lastTimer) return;
    lastTimer = n;
    timer.material = faceMat(boothTimerTex(n));
  }
  function setHaze(hex) {
    if (hex === null || hex === undefined || hex === false) { hazeTarget = 0; if (stale()) settle(); return; }
    hazeMat.color.setHex(mixHex(hex, 0xffffff, 0.3));            // a light coloured fog, never a solid tint
    hazeTarget = 0.12;                                             // per layer; the three stack to a light fog
    haze.visible = true;
    if (stale()) settle();
  }
  function setIR(on) { irOn = !!on; ir.visible = irOn; }
  function update(dt = 0.016) {
    if (stale()) settle();
    lastUpd = performance.now();
    t += dt;
    // curtain rolls in 0.8 s
    if (curtainK !== curtainTarget) {
      curtainK = curtainTarget > curtainK ? Math.min(curtainTarget, curtainK + dt / 0.8) : Math.max(curtainTarget, curtainK - dt / 0.8);
      applyCurtain();
    }
    // haze eases in / out over 0.5 s
    const o = hazeMat.opacity;
    if (o !== hazeTarget) {
      hazeMat.opacity = hazeTarget > o ? Math.min(hazeTarget, o + dt * 0.28) : Math.max(hazeTarget, o - dt * 0.28);
      if (hazeMat.opacity <= 0.002 && hazeTarget === 0) haze.visible = false;
    }
    if (state === 'done') {
      doneT += dt;
      beacon.material = doneT < 0.9 && Math.floor(doneT / 0.15) % 2 ? LAMP.off : LAMP.green;
    }
    if (irOn && state === 'cure') { const k = 0.9 + 0.1 * Math.sin(t * 2.2); irMat.color.setHex(0xff7a3a).multiplyScalar(k); poolMat.opacity = 0.85 * k; }
  }
  setLamp('idle');
  return { group, setLamp, setTimer, setHaze, setIR, update };
}

// ================================================================ paint hall "Spray Bay" (WORLD coordinates)
// A bright, clean paint shop in the garage family: cream walls over a dark slate wainscot (hides overspray), navy
// caps with the paint-colour "spectrum band" on top of every cap and pillar (the hall's livery), light grey epoxy
// floor with one painted overlay, colour plates + paint manifold + compressed-air line on the back wall, "SPRAY BAY"
// sign, two exhaust stacks behind the back wall, a compressor yard outside the west wall, the painters' corner, a
// glass colour lab in the front-east corner, the waste drum, and the forecourt (markings, waiting shelter, prep desk,
// planters). Every position comes from PAINT / PAINT.decor; full design in docs/town-agents/briefs/painthall.txt.
const paintHexes = () => Object.keys(PAINT_COLORS).map((k) => PAINT_COLORS[k].hex);
const SAFETY_Y = '#f2c230';
/** Spectrum band on top of a cap: blocks of ~0.55 m cycling the paint colours (config order), returns the phase. */
function spectrumBand(b, axis, from, to, y, c, depth, phase = 0) {
  const hx = paintHexes(), n = Math.max(1, Math.round(Math.abs(to - from) / 0.55)), step = (to - from) / n;
  for (let k = 0; k < n; k++) {
    const a = from + (k + 0.5) * step, col = hx[(phase + k) % hx.length], L = Math.abs(step) - 0.004;
    if (axis === 'x') b.box(L, 0.07, depth, col, a, y, c); else b.box(depth, 0.07, L, col, c, y, a);
  }
  return phase + n;
}
/** Textured floor made of several rectangles in ONE mesh (world-mapped UVs, tile = metres per texture repeat). */
function floorRects(rects, y, kind, tile) {
  const parts = rects.map((r) => {
    const g = new THREE.PlaneGeometry(r.maxX - r.minX, r.maxZ - r.minZ).rotateX(-R90).translate((r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, -pos.getZ(i) / tile);
    return g;
  });
  const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ map: floorTex(kind, [1, 1]) }));
  m.receiveShadow = true;
  return m;
}
/** Hazard-hatched rectangle outline (canvas, metre units): yellow / black diagonal hatch in a band of width bw. */
function hatchRect(g, x0, z0, x1, z1, bw, inner = null) {
  if (inner) { g.fillStyle = inner; g.fillRect(x0, z0, x1 - x0, z1 - z0); }
  g.save();
  g.beginPath(); g.rect(x0, z0, x1 - x0, z1 - z0); g.rect(x1 - bw, z0 + bw, -(x1 - x0 - 2 * bw), z1 - z0 - 2 * bw); g.clip('evenodd');
  g.fillStyle = SAFETY_Y; g.fillRect(x0, z0, x1 - x0, z1 - z0);
  g.fillStyle = '#2b3640';
  for (let s = x0 - (z1 - z0); s < x1; s += 0.24) { g.beginPath(); g.moveTo(s, z1); g.lineTo(s + 0.12, z1); g.lineTo(s + 0.12 + (z1 - z0), z0); g.lineTo(s + (z1 - z0), z0); g.closePath(); g.fill(); }
  g.restore();
}
function dashedLine(g, x0, z0, x1, z1, w, on, off, col) {
  const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt';
  for (let s = 0; s < L; s += on + off) { const e = Math.min(L, s + on); g.beginPath(); g.moveTo(x0 + ux * s, z0 + uz * s); g.lineTo(x0 + ux * e, z0 + uz * e); g.stroke(); }
}
/** Hall floor markings: walkway lines, drip-tray outlines under every station, booth stencils, booth lead-in lines. */
function hallMarkTex() {
  const W = PAINT.walls, ppm = 40;
  const w = Math.round((W.maxX - W.minX) * ppm), h = Math.round((W.maxZ - W.minZ) * ppm);
  return canvasTex('paintHallMarks', w, h, (g) => {
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    g.setTransform(ppm, 0, 0, ppm, -W.minX * ppm, -W.minZ * ppm);
    // walkway between the tanks and the booths (it ends at the waste drum when the drum closes its west end)
    const SB = PAINT.scrapBin, wx0 = SB.x < W.minX + 1.5 && Math.abs(SB.z - PAINT.staffLaneZ) < 1 ? SB.x + 0.62 : W.minX + 0.1;
    for (const dz of [-0.55, 0.55]) dashedLine(g, wx0, PAINT.staffLaneZ + dz, W.maxX - 0.1, PAINT.staffLaneZ + dz, 0.1, 0.6, 0.3, SAFETY_Y);
    // drip trays under every tank position (also the ones not bought yet: "a tank goes here")
    for (const st of Object.values(PAINT.stations)) hatchRect(g, st.x - 1.0, st.z - 0.65, st.x + 1.0, st.z + 0.65, 0.12, 'rgba(70,82,94,0.10)');
    // booths: lead-in lines continuing the glass walls to the front, "BOOTH n" stencils
    PAINT.bays.forEach((bay, i) => {
      for (const s of [-1, 1]) { g.fillStyle = SAFETY_Y; g.fillRect(bay.x + s * PAINT.boothHalfW - 0.05, PAINT.boothZ[1], 0.1, W.maxZ - 0.35 - PAINT.boothZ[1]); }
      g.fillStyle = 'rgba(47,72,88,0.82)'; g.font = `700 0.5px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`BOOTH ${i + 1}`, bay.x, W.maxZ - 0.75);
    });
    // trench drain across the open front (W.minX -> colour lab): steel frame, dark slot, grate bars. A mipmapped
    // texture blends the bars smoothly at a distance instead of shimmering like sub-pixel geometry.
    const dz = W.maxZ - 0.2, lx = PD.colourLab.minX;
    g.fillStyle = css(TC.STEEL_DD); g.fillRect(W.minX, dz - 0.135, lx - W.minX, 0.27);
    g.fillStyle = '#2a2f36'; g.fillRect(W.minX + 0.01, dz - 0.105, lx - W.minX - 0.02, 0.21);
    g.fillStyle = css(TC.STEEL_D);
    for (let x = W.minX + 0.08; x < lx - 0.04; x += 0.09) g.fillRect(x - 0.0125, dz - 0.105, 0.025, 0.21);
  });
}
/** All colour plates of the back wall on one transparent strip (y 1.88 .. 2.24). */
const PLATE_Y0 = 1.88, PLATE_H = 0.36;
function platesTex() {
  const W = PAINT.walls, cw = 4096, ch = 72, sx = cw / (W.maxX - W.minX), sy = ch / PLATE_H;
  return canvasTex('paintPlates', cw, ch, (g) => {
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
    for (const [key, st] of Object.entries(PAINT.stations)) {
      const c = PAINT_COLORS[key]; if (!c) continue;
      const x0 = (st.x - 0.85 - W.minX) * sx, pw = 1.7 * sx, y0 = 0.01 * sy, ph = 0.34 * sy;
      const lightPlate = lumHex(c.hex) > 150;
      g.fillStyle = 'rgba(20,30,40,0.35)'; g.beginPath(); g.roundRect(x0 + 3, y0 + 3, pw, ph, 10); g.fill();
      g.fillStyle = css(c.hex); g.beginPath(); g.roundRect(x0, y0, pw, ph, 10); g.fill();
      g.strokeStyle = css(mixHex(c.hex, 0x000000, 0.3)); g.lineWidth = 4; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.roundRect(x0 + 6, y0 + 6, pw - 12, ph - 12, 7); g.stroke();
      g.fillStyle = lightPlate ? css(TC.NAVY) : css(TC.CREAM_L);
      g.font = `700 ${Math.round(ph * 0.58)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const cx = x0 + pw / 2 + (c.premium ? ph * 0.25 : 0);
      g.fillText(c.label.toUpperCase(), cx, y0 + ph * 0.55, pw - ph * 1.1);
      if (c.premium) {
        const tw = Math.min(g.measureText(c.label.toUpperCase()).width, pw - ph * 1.1), r = ph * 0.3, scx = cx - tw / 2 - r * 1.4, scy = y0 + ph / 2;
        g.beginPath();
        for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(scx + Math.cos(a) * rr, scy + Math.sin(a) * rr); }
        g.closePath(); g.fillStyle = css(TC.CREAM_L); g.fill();
      }
    }
  });
}
function spraySignTex() {
  return canvasTex('spraySign', 1024, 256, (g, w, h) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = css(TC.CREAM_L); g.fillRect(0, 0, w, h);
    g.strokeStyle = css(TC.NAVY); g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    // spray gun (side view, nozzle to the right) with a gravity cup, firing a fan of the eight paint colours
    const gx = 70, gy = 128;
    g.fillStyle = css(TC.NAVY);
    g.beginPath(); g.roundRect(gx, gy - 26, 150, 44, 14); g.fill();                 // body
    g.beginPath(); g.moveTo(gx + 20, gy + 10); g.lineTo(gx + 62, gy + 10); g.lineTo(gx + 50, gy + 96); g.lineTo(gx + 14, gy + 96); g.closePath(); g.fill();   // grip
    g.fillRect(gx + 150, gy - 12, 34, 18);                                             // nozzle
    g.beginPath(); g.roundRect(gx + 66, gy - 82, 54, 52, 10); g.fill();                // cup
    g.fillRect(gx + 84, gy - 32, 18, 10);
    g.strokeStyle = css(TC.NAVY); g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(gx + 96, gy + 24); g.quadraticCurveTo(gx + 80, gy + 60, gx + 92, gy + 78); g.stroke();   // trigger
    const hx = paintHexes(), nx = gx + 190, ny = gy - 3;
    g.lineCap = 'round'; g.lineWidth = 11;
    hx.forEach((c, i) => {
      const a = -0.42 + (i / (hx.length - 1)) * 0.84;
      g.strokeStyle = css(c); g.beginPath(); g.moveTo(nx + 10 * Math.cos(a), ny + 10 * Math.sin(a)); g.lineTo(nx + 105 * Math.cos(a), ny + 105 * Math.sin(a)); g.stroke();
    });
    // lettering
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const tx = 650;
    g.font = `700 138px ${FONT}`;
    g.fillStyle = css(TC.CORAL); g.fillText('SPRAY BAY', tx + 6, 112 + 7, 660);
    g.fillStyle = css(TC.NAVY); g.fillText('SPRAY BAY', tx, 112, 660);
    g.font = `600 40px ${FONT}`; g.fillStyle = css(TC.CORAL_D); g.fillText('PAINT  &  BODY', tx, 206);
  });
}
/** Shell, floor edge, back wall fittings, plates' backing, manifold, air line (WORLD coordinates). */
function paintHallShell(b, gl) {
  const W = PAINT.walls, T = W.thickness, H = W.height, cx = (W.minX + W.maxX) / 2;
  hallShell(b, gl, W, { wainA: SLATE, wainB: SLATE_L, wallA: PWALL, wallB: PWALL_B, trim: TC.STEEL, base: TC.DARK, cap: TC.NAVY_D, pillar: TC.NAVY_L, seg: 1.1 });
  // spectrum band: west wall (front -> back), back wall (west -> east), east wall (back -> front)
  let ph = spectrumBand(b, 'z', W.maxZ - 0.4, W.minZ - 0.02, H + 0.12, W.minX - T / 2 - 0.02, 0.4, 0);
  ph = spectrumBand(b, 'x', W.minX - T, W.maxX + T, H + 0.12, W.minZ - T / 2 - 0.02, 0.4, ph);
  spectrumBand(b, 'z', W.minZ - 0.02, W.maxZ - 0.4, H + 0.12, W.maxX + T / 2 + 0.02, 0.4, ph);
  // pillars: mustard cap over the navy one, a ring of the eight colours round the lamp
  const hx = paintHexes();
  for (const sx of [-1, 1]) {
    const px = sx < 0 ? W.minX - T / 2 : W.maxX + T / 2, pz = W.maxZ - 0.15, top = H + 0.43;
    b.box(0.96, 0.14, 0.96, TC.MUSTARD, px, H + 0.29, pz);
    // eight cells of a 3 x 3 grid round the lamp (edges at +/-0.48 and +/-0.2): they must not overlap, or two
    // colours with the same top fight for the same pixels
    const e = [-0.48, -0.2, 0.2, 0.48], cells = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
    cells.forEach(([i, j], k) => {
      const x0 = e[i], x1 = e[i + 1], z0 = e[j], z1 = e[j + 1];
      b.box(x1 - x0 - 0.004, 0.07, z1 - z0 - 0.004, hx[k % hx.length], px + (x0 + x1) / 2, top, pz + (z0 + z1) / 2);
    });
  }
  // front: steel nosing on the slab edge. The trench drain grate is painted on the floor overlay (hallMarkTex):
  // as geometry its 2.5 cm bars were under a pixel wide from the game camera and shimmered, and its layers fought.
  const lx = PD.colourLab.minX;
  b.box(lx - W.minX, 0.03, 0.08, TC.STEEL, (W.minX + lx) / 2, 0, W.maxZ + 0.0);
  // ---- back wall: plate backing rail, paint manifold with valve stubs, compressed-air line
  const zw = W.minZ, st = Object.values(PAINT.stations), sx0 = Math.min(...st.map((s) => s.x)) - 0.9, sx1 = Math.max(...st.map((s) => s.x)) + 0.9;
  const my = PD.manifoldY, mz = zw + 0.12;
  cylX(b, 0.04, sx0, sx1, my, mz, TC.STEEL, 10);
  for (let x = sx0 + 0.3; x < sx1; x += 1.25) { b.box(0.05, 0.05, 0.12, TC.STEEL_DD, x, my - 0.025, zw + 0.06); b.box(0.07, 0.12, 0.02, TC.STEEL_DD, x, my - 0.06, zw + 0.01); }
  for (const s of st) {
    b.cyl(0.055, 0.055, 0.12, TC.STEEL_D, s.x - 0.06, my, mz, 10, 0, 0, R90);                 // tee
    cylZ(b, 0.035, mz, zw + 0.215, my, s.x, TC.STEEL);
    cylZ(b, 0.06, zw + 0.215, zw + 0.24, my, s.x, TC.STEEL_D, 10);                             // flange (the tank's own meets it)
    handWheel(b, s.x, my + 0.1, zw + 0.17);
  }
  // west end: the manifold drops into the floor (paint comes up from the mixing room under it); east end capped
  b.cyl(0.05, 0.05, 0.1, TC.STEEL_D, sx0, my - 0.05, mz, 10);
  cylY(b, 0.04, 0.04, my, sx0, mz, TC.STEEL, 10);
  b.box(0.2, 0.04, 0.2, TC.STEEL_DD, sx0, 0.012, mz);
  b.cyl(0.055, 0.055, 0.03, TC.STEEL_DD, sx1, my - 0.04 + 0.04, mz, 10, 0, 0, R90);
  // blue compressed-air line at PD.airLineY: west wall (from where it comes over the wall), back wall, north half of the east wall
  const ay = PD.airLineY, ar = 0.03, inZ = PD.dryer.z + 0.6, ezEnd = (W.minZ + W.maxZ) / 2;
  const ax0 = W.minX + 0.09, ax1 = W.maxX - 0.09, az = zw + 0.07;
  cylZ(b, ar, az, inZ, ay, ax0, AIR); cylX(b, ar, ax0, ax1, ay, az, AIR); cylZ(b, ar, az, ezEnd, ay, ax1, AIR);
  for (const [x, z] of [[ax0, az], [ax1, az]]) b.cyl(0.042, 0.042, 0.09, AIR, x, ay - 0.045, z, 8);   // corner elbows
  for (let z = az + 0.6; z < inZ; z += 1.25) b.box(0.09, 0.05, 0.05, TC.STEEL_DD, W.minX + 0.045, ay - 0.025, z);
  for (let x = ax0 + 0.6; x < ax1; x += 1.25) b.box(0.05, 0.05, 0.07, TC.STEEL_DD, x, ay - 0.025, zw + 0.035);
  for (let z = az + 0.6; z < ezEnd; z += 1.25) b.box(0.09, 0.05, 0.05, TC.STEEL_DD, W.maxX - 0.045, ay - 0.025, z);
  cylY(b, 0.022, ay - 0.22, ay, ax1, ezEnd, AIR); b.box(0.06, 0.06, 0.06, TC.STEEL_D, ax1, ay - 0.28, ezEnd);   // end drop + coupler
  // air drop on the west wall at z -6.0: filter-regulator with two bowls, gauge, coiled yellow hose on a hook
  const fz = -6.0;
  cylY(b, 0.022, 1.62, ay, ax0, fz, AIR);
  b.box(0.16, 0.08, 0.26, TC.STEEL_DD, W.minX + 0.08, 1.54, fz);
  for (const s of [-1, 1]) { b.box(0.08, 0.08, 0.08, TC.STEEL, ax0 + 0.02, 1.48, fz + s * 0.07); b.cyl(0.035, 0.03, 0.14, 0xcfe8f0, ax0 + 0.02, 1.34, fz + s * 0.07, 8); }
  b.cyl(0.04, 0.04, 0.02, TC.CREAM_L, ax0 + 0.05, 1.62, fz, 10, 0, 0, R90);
  b.box(0.1, 0.03, 0.04, TC.STEEL_DD, W.minX + 0.05, 1.05, fz);                                // hook
  b.push(W.minX + 0.02, 0, fz, R90); coil(b, 0, 0.88, 0.02, 0.17, TC.MUSTARD); b.pop();
  cylY(b, 0.015, 1.06, 1.3, ax0 + 0.04, fz + 0.07, TC.MUSTARD);
}

/** Exhaust stacks behind the back wall (static part; the fan wheels are separate meshes). */
const STACK_TUBE = 0.4;                                    // top section built as an open tube (the fan shows inside)
function paintStacks(b) {
  const W = PAINT.walls, T = W.thickness, hz = W.minZ - T - 0.325, R = PD.stackR, top = PD.stackH;
  for (const st of PD.stacks) {
    // fan housing at ground with the motor on its side and the duct collar where it goes through the wall
    b.box(1.0, 0.9, 0.65, TC.STEEL, st.x, 0, hz);
    b.box(1.04, 0.05, 0.69, TC.STEEL_D, st.x, 0.9, hz);
    for (let i = 0; i < 4; i++) b.box(1.01, 0.02, 0.66, TC.STEEL_D, st.x, 0.18 + i * 0.18, hz);
    b.box(1.1, 0.06, 0.75, 0x9a948a, st.x, 0, hz);                                            // concrete pad
    cylX(b, 0.16, st.x + 0.5, st.x + 0.82, 0.45, hz, TC.NAVY_L, 12);                          // motor
    for (let i = 0; i < 3; i++) cylX(b, 0.17, st.x + 0.56 + i * 0.08, st.x + 0.58 + i * 0.08, 0.45, hz, TC.NAVY_D, 12);
    b.box(0.12, 0.1, 0.12, TC.NAVY_D, st.x + 0.66, 0.6, hz);
    b.box(0.62, 0.5, 0.04, TC.STEEL_D, st.x, 0.18, W.minZ - T - 0.02);                       // duct collar on the wall
    // round stack with seam rings, wall brackets, open top
    b.cyl(R + 0.05, R + 0.05, 0.12, TC.STEEL_D, st.x, 0.9, st.z, 14);
    b.cyl(R, R, top - STACK_TUBE - 0.9, TC.STEEL, st.x, 0.9, st.z, 14);
    b.cyl(R - 0.03, R - 0.03, 0.006, 0x23282e, st.x, top - STACK_TUBE, st.z, 14);             // dark duct below the fan
    for (let y = 1.6; y < top - STACK_TUBE; y += 0.9) b.cyl(R + 0.012, R + 0.012, 0.03, TC.STEEL_D, st.x, y, st.z, 14);
    for (let i = 0; i < 14; i++) {                                                            // open tube at the top
      const a = (i + 0.5) * (2 * PI / 14), ap = R * Math.cos(PI / 14) - 0.012;
      b.box(2 * R * Math.sin(PI / 14) + 0.004, STACK_TUBE, 0.024, TC.STEEL, st.x + Math.sin(a) * ap, top - STACK_TUBE, st.z + Math.cos(a) * ap, 0, a, 0);
      b.box(2 * R * Math.sin(PI / 14) + 0.012, 0.05, 0.04, TC.STEEL_D, st.x + Math.sin(a) * (ap + 0.006), top - 0.045, st.z + Math.cos(a) * (ap + 0.006), 0, a, 0);
    }
    for (const s of [-1, 1]) b.box(2 * R - 0.06, 0.03, 0.03, TC.STEEL_DD, st.x, top - STACK_TUBE + 0.06, st.z + s * 0.0, 0, s > 0 ? 0 : R90, 0);   // fan spider
    for (const y of [1.7, 2.45]) {                                                             // clamps strapped to the wall
      b.cyl(R + 0.025, R + 0.025, 0.06, TC.STEEL_DD, st.x, y, st.z, 14);
      for (const s of [-1, 1]) b.box(0.05, 0.06, 0.14, TC.STEEL_DD, st.x + s * (R - 0.05), y, W.minZ - T - 0.05);
    }
  }
}
const stackFanGeo = () => geo('paint|stackFan', (b) => {
  b.cyl(0.06, 0.06, 0.05, TC.STEEL_DD, 0, -0.025, 0, 10);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    b.box(0.2, 0.012, 0.08, TC.STEEL_D, Math.cos(a) * 0.13, -0.006, -Math.sin(a) * 0.13, 0.45, a, 0);
  }
});
/** Compressor cabinet (separate mesh: it shudders while it runs), origin on the plinth top, front +x. */
const compressorGeo = () => geo('paint|compressor', (b) => {
  const w = 1.0, d = 1.4, h = 1.2, NV = TC.NAVY;
  b.box(w, h, d, NV, 0, 0, 0);
  b.box(w + 0.02, 0.16, d + 0.02, TC.CREAM, 0, 0.62, 0);                                         // cream stripe
  b.box(w + 0.03, 0.06, d + 0.03, TC.NAVY_D, 0, 0, 0);                                           // base rail
  for (let i = 0; i < 5; i++) { b.box(0.02, 0.04, d - 0.3, TC.NAVY_D, w / 2 + 0.005, 0.15 + i * 0.08, 0); b.box(w - 0.3, 0.04, 0.02, TC.NAVY_D, 0, 0.15 + i * 0.08, d / 2 + 0.005); }   // louvres
  for (let i = 0; i < 3; i++) b.box(0.02, 0.04, d - 0.5, TC.NAVY_D, w / 2 + 0.005, 0.86 + i * 0.09, 0);
  // fan grille on top (the fan below it is a separate mesh)
  b.box(w, 0.02, d, TC.NAVY_D, 0, h, 0);
  b.cyl(0.36, 0.36, 0.03, TC.STEEL_DD, 0, h, -0.2, 16);
  b.cyl(0.32, 0.32, 0.034, 0x1b2026, 0, h, -0.2, 16);
  for (let i = -3; i <= 3; i++) b.box(0.012, 0.012, 0.64 - Math.abs(i) * 0.05, TC.STEEL, i * 0.09, h + 0.034, -0.2);
  b.box(0.66, 0.012, 0.012, TC.STEEL, 0, h + 0.034, -0.2);
  b.box(0.3, 0.06, 0.24, TC.STEEL_D, 0.2, h, 0.45);                                               // filter box
  b.box(0.36, 0.14, 0.02, TC.CREAM_L, -0.1, 0.94, d / 2 + 0.01);                                  // "COMPRESSED AIR" plate
  b.box(0.3, 0.03, 0.022, AIR, -0.1, 1.02, d / 2 + 0.012);
  b.box(0.3, 0.03, 0.022, TC.NAVY, -0.1, 0.97, d / 2 + 0.012);
  b.box(0.08, 0.08, 0.02, 0x5fbf6a, 0.3, 0.95, d / 2 + 0.012);                                     // run lamp housing
});
const compFanGeo = () => geo('paint|compFan', (b) => {
  b.cyl(0.05, 0.05, 0.04, TC.STEEL_DD, 0, -0.02, 0, 8);
  for (let i = 0; i < 4; i++) b.box(0.26, 0.01, 0.08, TC.MUSTARD_D, Math.cos(i * R90) * 0.15, -0.005, -Math.sin(i * R90) * 0.15, 0.5, i * R90, 0);
});
const YARD_Y = 0.12;
/** Plant yard outside the west wall: plinth, air receiver, dryer, flammables cabinet, pipework over the wall. */
function paintYard(b) {
  const W = PAINT.walls, T = W.thickness, wx = W.minX - T;                                       // outer face of the west wall
  const C = PD.compressor, Rc = PD.receiver, Dr = PD.dryer, F = PD.flammables, yx = C.x;
  const z0 = C.z - 0.95, z1 = F.z + 0.55;
  b.box(wx - (-43.4), YARD_Y, z1 - z0, 0xbdb7ad, (wx - 43.4) / 2, 0, (z0 + z1) / 2);
  b.box(wx + 43.4 + 0.04, 0.03, z1 - z0 + 0.04, 0xa7a196, (wx - 43.4) / 2, 0, (z0 + z1) / 2);
  // air receiver: horizontal tank along z on two saddles, gauge, safety valve, drain valve
  const ry = YARD_Y + 0.22 + 0.32, RR = 0.32, RL = 1.8, REC = 0xc9503f;
  for (const s of [-1, 1]) { b.box(0.5, 0.28, 0.14, TC.STEEL_DD, Rc.x, YARD_Y, Rc.z + s * 0.55); }
  cylZ(b, RR, Rc.z - RL / 2 + 0.12, Rc.z + RL / 2 - 0.12, ry, Rc.x, REC, 16);
  for (const s of [-1, 1]) { cylZ(b, RR - 0.06, Rc.z + s * (RL / 2 - 0.12), Rc.z + s * (RL / 2 - 0.04), ry, Rc.x, REC, 14); }
  for (const s of [-1, 1]) cylZ(b, RR + 0.008, Rc.z + s * 0.62 - 0.03, Rc.z + s * 0.62 + 0.03, ry, Rc.x, mixHex(REC, 0x000000, 0.25), 16);
  b.box(0.18, 0.08, 0.02, TC.CREAM_L, Rc.x + 0.12, ry + 0.15, Rc.z + 0.2, 0.9, 0, 0);            // data plate on the top
  cylY(b, 0.02, ry + RR - 0.02, ry + RR + 0.12, Rc.x - 0.05, Rc.z - 0.35, TC.STEEL_D, 6);
  b.cyl(0.07, 0.07, 0.03, TC.CREAM_L, Rc.x - 0.05, ry + RR + 0.12, Rc.z - 0.35, 12);              // gauge (dial up)
  b.cyl(0.072, 0.072, 0.02, TC.STEEL_DD, Rc.x - 0.05, ry + RR + 0.115, Rc.z - 0.35, 12);
  b.box(0.005, 0.034, 0.05, VALVE, Rc.x - 0.05, ry + RR + 0.145, Rc.z - 0.34, 0, 0.6, 0);
  b.cyl(0.03, 0.04, 0.12, TC.GOLD_D, Rc.x + 0.08, ry + RR - 0.02, Rc.z + 0.35, 8);                 // safety valve
  b.cyl(0.02, 0.02, 0.04, VALVE, Rc.x + 0.08, ry + RR + 0.1, Rc.z + 0.35, 6);
  cylY(b, 0.02, YARD_Y + 0.06, ry - RR + 0.02, Rc.x, Rc.z, TC.STEEL_D, 6);                         // drain valve
  b.box(0.1, 0.02, 0.03, VALVE, Rc.x + 0.03, YARD_Y + 0.12, Rc.z);
  // refrigerated air dryer: white box, grey grille on the south face and on top, control panel
  b.box(0.7, 0.9, 0.7, 0xf2f2ee, Dr.x, YARD_Y, Dr.z);
  b.box(0.72, 0.04, 0.72, 0xd5d8d8, Dr.x, YARD_Y + 0.9, Dr.z);
  for (let i = 0; i < 6; i++) b.box(0.5, 0.025, 0.02, 0x8a939a, Dr.x, YARD_Y + 0.12 + i * 0.07, Dr.z + 0.355);
  b.box(0.5, 0.012, 0.4, 0x8a939a, Dr.x, YARD_Y + 0.94, Dr.z - 0.05);
  for (let i = 0; i < 5; i++) b.box(0.48, 0.008, 0.02, 0x5c6670, Dr.x, YARD_Y + 0.952, Dr.z - 0.2 + i * 0.075);
  b.box(0.22, 0.12, 0.02, TC.NAVY, Dr.x + 0.12, YARD_Y + 0.66, Dr.z + 0.355);
  b.box(0.06, 0.03, 0.022, 0x5fbf6a, Dr.x + 0.06, YARD_Y + 0.7, Dr.z + 0.36);
  // flammable-liquids cabinet: yellow, two doors on the south face, red flame diamond, vent, plinth
  const fw = 1.1, fd = 0.6, fh = 1.4, FY = 0xf2c230;
  b.box(fw, 0.06, fd, TC.DARK, F.x, YARD_Y, F.z);
  b.box(fw, fh - 0.06, fd, FY, F.x, YARD_Y + 0.06, F.z);
  b.box(fw + 0.02, 0.04, fd + 0.02, mixHex(FY, 0x000000, 0.2), F.x, YARD_Y + fh - 0.02, F.z);
  b.box(0.012, fh - 0.2, 0.02, mixHex(FY, 0x000000, 0.35), F.x, YARD_Y + 0.12, F.z + fd / 2 + 0.006);   // door split
  for (const s of [-1, 1]) b.box(0.03, 0.18, 0.03, TC.DARK, F.x + s * 0.06, YARD_Y + 0.7, F.z + fd / 2 + 0.015);   // handles
  b.box(0.26, 0.26, 0.02, VALVE, F.x - 0.27, YARD_Y + 0.9, F.z + fd / 2 + 0.008, 0, 0, PI / 4);           // flame diamond
  b.box(0.17, 0.17, 0.022, TC.WHITE, F.x - 0.27, YARD_Y + 0.945, F.z + fd / 2 + 0.01, 0, 0, PI / 4);
  b.box(0.05, 0.09, 0.024, TC.DARK, F.x - 0.27, YARD_Y + 0.98, F.z + fd / 2 + 0.012);
  b.box(0.3, 0.06, 0.022, VALVE, F.x + 0.27, YARD_Y + 1.12, F.z + fd / 2 + 0.008);                       // warning strip
  b.cyl(0.05, 0.05, 0.06, TC.STEEL_D, F.x + 0.35, YARD_Y + fh, F.z - 0.1, 8);                             // vent
  // pipework: compressor -> receiver -> dryer -> up the outside of the west wall -> over the cap -> air line inside
  const px = yx + 0.32, py = YARD_Y + 0.5;
  cylZ(b, 0.03, C.z + 0.7, Rc.z - RL / 2 + 0.04, py, px, TC.STEEL);
  cylY(b, 0.03, py, ry, px, Rc.z - RL / 2 + 0.06, TC.STEEL); b.cyl(0.04, 0.04, 0.08, TC.STEEL_D, px, py - 0.04, C.z + 0.72, 8);
  cylX(b, 0.03, Rc.x, px, ry, Rc.z - RL / 2 + 0.06, TC.STEEL);
  cylZ(b, 0.03, Rc.z + RL / 2 - 0.04, Dr.z - 0.35, ry, Rc.x, TC.STEEL);
  const riseX = wx - 0.14, riseZ = Dr.z + 0.6, top = W.height + 0.32;
  cylZ(b, 0.03, Dr.z + 0.35, riseZ, YARD_Y + 0.6, Dr.x + 0.2, TC.STEEL);
  cylX(b, 0.03, Dr.x + 0.2, riseX, YARD_Y + 0.6, riseZ, TC.STEEL);
  b.cyl(0.04, 0.04, 0.08, TC.STEEL_D, riseX, YARD_Y + 0.56, riseZ, 8);
  cylY(b, 0.03, YARD_Y + 0.6, top, riseX, riseZ, AIR);
  for (const y of [1.0, 1.9]) b.box(0.16, 0.05, 0.05, TC.STEEL_DD, wx - 0.07, y, riseZ);
  b.cyl(0.04, 0.04, 0.08, AIR, riseX, top - 0.04, riseZ, 8);
  const ax0 = W.minX + 0.09;
  cylX(b, 0.03, riseX, ax0, top, riseZ, AIR);
  b.cyl(0.04, 0.04, 0.08, AIR, ax0, top - 0.04, riseZ, 8);
  cylY(b, 0.03, PD.airLineY, top, ax0, riseZ, AIR);
  // drainpipes at both ends of the west and east outer walls
  for (const [x, s] of [[wx, -1], [W.maxX + T, 1]]) for (const z of [W.minZ - T + 0.18, W.maxZ - 0.75]) {
    const dx = x + s * 0.07;
    cylY(b, 0.05, 0.05, W.height - 0.05, dx, z, TC.NAVY_D, 8);
    b.box(0.16, 0.14, 0.16, TC.NAVY_D, dx, W.height - 0.16, z);
    b.box(0.14, 0.05, 0.2, TC.NAVY_D, dx + s * 0.04, 0.02, z + 0.05);
    for (const y of [0.8, 1.8]) b.box(0.08, 0.04, 0.04, TC.STEEL_DD, x + s * 0.03, y, z);
  }
}
/** Fire extinguisher on a wall bracket; builder frame: wall face at z = 0, +z out of the wall. */
function extinguisher(b) {
  b.box(0.16, 0.06, 0.1, TC.STEEL_DD, 0, 0.62, 0.05);
  b.cyl(0.075, 0.075, 0.42, 0xd8403a, 0, 0.5, 0.12, 10);
  b.cyl(0.05, 0.06, 0.06, 0xb5332c, 0, 0.92, 0.12, 8);
  b.box(0.05, 0.08, 0.04, TC.DARK, 0, 0.97, 0.12);
  b.box(0.14, 0.02, 0.03, TC.DARK, 0.03, 1.03, 0.12);
  b.box(0.02, 0.3, 0.02, TC.DARK, -0.08, 0.66, 0.14);                                            // hose
  b.box(0.12, 0.08, 0.012, TC.CREAM_L, 0, 0.66, 0.196);                                          // label
}
/** Painters' corner along the west wall: PPE lockers, suit rack, gun washer, masking trolley, eye wash, extinguishers. */
function paintCorner(b, gl) {
  const W = PAINT.walls, T = W.thickness, H = W.height;
  // three PPE lockers (doors face east)
  const Lk = PD.lockers, ld = 0.45, lx = W.minX + ld / 2, n = 3, lw = (Lk.z1 - Lk.z0) / n;
  for (let i = 0; i < n; i++) {
    const z = Lk.z0 + (i + 0.5) * lw;
    b.box(ld, 1.9, lw - 0.01, SLATE, lx, 0, z);
    b.box(ld + 0.01, 0.05, lw, TC.NAVY_D, lx, 1.9, z);
    b.box(0.02, 1.72, lw - 0.08, TC.CREAM, lx + ld / 2 + 0.005, 0.1, z);                          // door
    for (let k = 0; k < 4; k++) b.box(0.024, 0.025, lw - 0.24, 0x5c6670, lx + ld / 2 + 0.012, 1.55 + k * 0.06, z);   // vent slots
    b.box(0.03, 0.14, 0.03, TC.STEEL_DD, lx + ld / 2 + 0.02, 0.95, z + lw / 2 - 0.1);             // handle
    b.box(0.024, 0.07, 0.12, TC.NAVY, lx + ld / 2 + 0.012, 1.3, z);                               // name card
    if (i === 1) {                                                                               // respirator sticker
      b.box(0.024, 0.2, 0.2, TC.BLUE, lx + ld / 2 + 0.012, 0.95, z);
      b.box(0.028, 0.08, 0.1, TC.CREAM_L, lx + ld / 2 + 0.014, 1.0, z);
      for (const s of [-1, 1]) b.box(0.03, 0.05, 0.04, 0xd45a9a, lx + ld / 2 + 0.016, 0.98, z + s * 0.065);
    }
  }
  // suit rack: hooks with three white paint suits (hood, arms, legs) and two half-mask respirators
  const Sr = PD.suitRack, wx = W.minX;
  b.box(0.04, 0.06, Sr.z1 - Sr.z0, TC.WOOD_D, wx + 0.02, 2.08, (Sr.z0 + Sr.z1) / 2);
  const suits = [Sr.z0 + 0.2, Sr.z0 + 0.46, Sr.z0 + 0.72];
  suits.forEach((z, i) => {
    const x = wx + 0.1 + i * 0.03, SU = i === 1 ? 0xf7f7f2 : 0xeeeee8;
    b.box(0.04, 0.06, 0.04, TC.STEEL_DD, wx + 0.05, 2.0, z);                                      // hook
    b.push(0, -i * 0.015, 0);                                                                      // no two suits level
    b.box(0.12, 0.22, 0.2, SU, x, 1.82, z);                                                       // hood
    b.box(0.13, 0.13, 0.15, 0xd8d8d0, x + 0.02, 1.86, z);                                         // face opening
    b.box(0.12, 0.62, 0.36, SU, x, 1.2, z);                                                       // body
    for (const s of [-1, 1]) b.box(0.1, 0.56, 0.08, SU, x, 1.18, z + s * 0.2, s * 0.06);          // arms
    for (const s of [-1, 1]) b.box(0.1, 0.5, 0.15, SU, x, 0.72, z + s * 0.09);                    // legs
    b.box(0.13, 0.04, 0.37, 0xb9c4cc, x, 1.48, z);                                                // zip / collar band
    b.pop();
  });
  for (const z of [Sr.z1 - 0.12, Sr.z1 - 0.02]) {
    b.box(0.04, 0.05, 0.03, TC.STEEL_DD, wx + 0.04, 1.62, z);
    b.box(0.1, 0.12, 0.1, 0x3a3f46, wx + 0.08, 1.46, z);
    for (const s of [-1, 1]) b.cyl(0.04, 0.04, 0.03, 0xd45a9a, wx + 0.12, 1.5, z + s * 0.04, 8, 0, 0, R90);   // pink filters
  }
  // spray-gun washer: steel cabinet, lid hinged at the back and propped slightly open, a gun on the rack inside
  const G = PD.gunWash, gw = 0.9, gd = 0.6, gh = 1.0;
  const tub = gh - 0.14;                                                                           // floor of the open tub
  b.box(gw, tub, gd, TC.STEEL, G.x, 0, G.z);
  b.box(gw + 0.02, 0.05, gd + 0.02, TC.STEEL_D, G.x, 0, G.z);
  b.box(gw, 0.1, 0.04, TC.STEEL, G.x, tub, G.z - gd / 2 + 0.02); b.box(gw, 0.1, 0.04, TC.STEEL, G.x, tub, G.z + gd / 2 - 0.02);
  b.box(0.04, 0.1, gd - 0.08, TC.STEEL, G.x - gw / 2 + 0.02, tub, G.z); b.box(0.04, 0.1, gd - 0.08, TC.STEEL, G.x + gw / 2 - 0.02, tub, G.z);
  b.box(gw - 0.08, 0.02, gd - 0.08, 0x2a2f36, G.x, tub, G.z);                                      // dark inside, sunk below the rim
  b.box(0.36, 0.05, 0.08, TC.DARK, G.x - 0.1, tub + 0.05, G.z + 0.05);                             // gun on the rack
  b.box(0.08, 0.09, 0.06, TC.DARK, G.x - 0.02, tub + 0.02, G.z + 0.05);
  b.box(0.1, 0.06, 0.1, TC.STEEL_D, G.x - 0.06, tub + 0.1, G.z + 0.02);                            // gun cup
  b.push(G.x, gh - 0.04, G.z - gd / 2, 0, 1, -0.32);                                               // lid, hinged at the back
  b.box(gw, 0.04, gd, TC.STEEL_D, 0, 0, gd / 2);
  b.box(0.3, 0.03, 0.04, TC.STEEL_DD, 0, 0.04, gd - 0.06);
  b.pop();
  b.box(0.04, 0.24, 0.04, TC.STEEL_DD, G.x + gw / 2 - 0.05, gh - 0.04, G.z + 0.06);                // lid stay
  b.box(0.3, 0.12, 0.012, VALVE, G.x - 0.2, 0.62, G.z + gd / 2 + 0.006);                           // solvent warning plate
  b.box(0.12, 0.12, 0.014, TC.CREAM_L, G.x + 0.25, 0.6, G.z + gd / 2 + 0.007);
  b.box(0.06, 0.12, 0.05, TC.DARK, G.x + 0.3, 0.3, G.z + gd / 2 + 0.02);                           // foot pedal
  // masking-paper trolley facing east (towards booth 1): frame on castors, three kraft rolls, tape on the cutter bar
  const M = PD.maskTrolley, mx = M.x, mz = M.z, KR = 0xc49a6c;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(0.04, 1.15, 0.04, TC.STEEL_DD, mx + sx * 0.2, 0.1, mz + sz * 0.48);
    b.cyl(0.05, 0.05, 0.04, TC.RUBBER, mx + sx * 0.2, 0.05, mz + sz * 0.48, 8, R90);
  }
  for (const y of [0.1, 1.22]) for (const sx of [-1, 1]) b.box(0.034, 0.04, 0.99, TC.STEEL_D, mx + sx * 0.2, y, mz);
  [[0.9, 0.38, 0.11], [0.6, 0.66, 0.1], [0.45, 0.94, 0.09]].forEach(([len, y, r]) => {
    cylZ(b, r, mz - len / 2, mz + len / 2, y, mx - 0.04, KR, 12);
    cylZ(b, r * 0.35, mz - len / 2 - 0.005, mz + len / 2 + 0.005, y, mx - 0.04, 0x8a6a46, 8);
    b.box(0.2, 0.006, len - 0.02, mixHex(KR, 0xffffff, 0.15), mx + 0.1, y + r - 0.02, mz, 0, 0, -0.3);   // paper pulled to the bar
    b.box(0.03, 0.03, len + 0.06, TC.STEEL, mx + 0.2, y + 0.02, mz);                                // cutter bar
  });
  cylX(b, 0.06, mx + 0.16, mx + 0.24, 1.28, mz + 0.3, 0xe8d8a8, 12);                               // tape roll on the top bar
  cylX(b, 0.03, mx + 0.155, mx + 0.245, 1.28, mz + 0.3, 0x8a6a46, 8);
  // eye-wash station on the west wall (green, wall-mounted)
  const ez = -9.8;
  b.box(0.12, 0.34, 0.32, 0x2f9d5a, wx + 0.06, 1.0, ez);
  b.box(0.18, 0.04, 0.3, 0x2f9d5a, wx + 0.09, 0.96, ez);
  for (const s of [-1, 1]) b.cyl(0.04, 0.03, 0.04, TC.CREAM_L, wx + 0.12, 1.0, ez + s * 0.07, 8);
  b.box(0.02, 0.24, 0.24, TC.WHITE, wx + 0.125, 1.42, ez);
  b.box(0.022, 0.16, 0.04, 0x2f9d5a, wx + 0.128, 1.46, ez); b.box(0.022, 0.04, 0.16, 0x2f9d5a, wx + 0.128, 1.52, ez);
  b.box(0.12, 0.03, 0.03, TC.MUSTARD, wx + 0.12, 1.3, ez + 0.12);                                   // pull handle
  // fire extinguishers: inner face of the west front pillar, south face of the east one, beside the lab door
  const pz = W.maxZ - 0.15, pw = 0.8;
  b.push(W.minX - T / 2 + pw / 2, 0, pz - 0.1, R90); extinguisher(b); b.pop();
  b.push(W.maxX + T / 2, 0, pz + pw / 2, 0); extinguisher(b); b.pop();
  b.push(PD.colourLab.minX - 0.05, 0, PD.colourLab.doorZ - PD.colourLab.doorW / 2 - 0.35, -R90); extinguisher(b); b.pop();
}
/** Colour lab: glass room in the front-east corner (not enterable), mixing bank, counter, matching box. */
function colourLab(b, gl) {
  const W = PAINT.walls, LB = PD.colourLab, x0 = LB.minX, x1 = W.maxX, z0 = LB.minZ, z1 = LB.maxZ - 0.05;
  const pillarX = W.maxX + W.thickness / 2 - 0.4;                                                 // west face of the east pillar
  const AL = 0xc9d1d6, AL_D = 0x9aa5ad, WT = 0.1;
  // white floor (also covers the gravel edging at the front)
  b.box(x1 - x0, 0.03, LB.maxZ - z0, 0xf1f1ec, (x0 + x1) / 2, 0, (z0 + LB.maxZ) / 2);
  for (let x = x0 + 0.6; x < x1; x += 0.6) b.box(0.012, 0.004, LB.maxZ - z0, 0xd8d8d2, x, 0.03, (z0 + LB.maxZ) / 2);
  for (let z = z0 + 0.6; z < LB.maxZ; z += 0.6) b.box(x1 - x0, 0.004, 0.012, 0xd8d8d2, (x0 + x1) / 2, 0.03, z);
  // walls: slate base 0.9, aluminium frame, glass to 2.3 (panes are a separate transparent mesh)
  const runs = labRuns();
  for (const r of runs) {
    const len = r.axis === 'x' ? r.b - r.a : r.b - r.a, mid = (r.a + r.b) / 2;
    const bx = (w, h, d, c, y, off = 0) => (r.axis === 'x' ? b.box(len + w, h, d, c, mid, y, r.c + off) : b.box(d, h, len + w, c, r.c + off, y, mid));
    bx(0, 0.9, WT, SLATE, 0); bx(0.02, 0.05, WT + 0.04, AL, 0.88); bx(0.02, 0.08, WT + 0.02, AL, 2.25);
    const n = Math.max(1, Math.round(len / 1.0));
    for (let k = 0; k <= n; k++) {
      const p = r.a + k * len / n;
      if (r.axis === 'x') b.box(0.05, 1.35, WT + 0.02, AL_D, p, 0.9, r.c); else b.box(WT + 0.02, 1.35, 0.05, AL_D, r.c, 0.9, p);
    }
  }
  // door in the west wall (closed glass door): frame, header, push bar, threshold
  const dz0 = LB.doorZ - LB.doorW / 2, dz1 = LB.doorZ + LB.doorW / 2;
  for (const z of [dz0, dz1]) b.box(0.12, 2.25, 0.06, AL_D, x0, 0, z);
  b.box(0.12, 0.1, LB.doorW, AL_D, x0, 2.15, LB.doorZ);
  b.box(0.04, 2.1, LB.doorW - 0.06, AL, x0, 0.04, LB.doorZ - 0.0, 0, 0, 0);                    // door leaf frame (glass in it)
  b.box(0.08, 0.04, LB.doorW - 0.2, TC.STEEL, x0 - 0.06, 1.0, LB.doorZ);
  b.box(0.16, 0.012, LB.doorW, TC.STEEL_D, x0, 0.03, LB.doorZ);
  // ---- mixing bank against the east wall: steel rack, 3 shelves of tint tins with agitator lids and drive bars
  const mz0 = z0 + 0.12, mz1 = -0.25, mxc = x1 - 0.3;
  for (const z of [mz0, (mz0 + mz1) / 2, mz1]) for (const x of [x1 - 0.57, x1 - 0.03]) b.box(0.04, 1.62, 0.04, TC.STEEL_DD, x, 0.03, z);
  const nT = 12, shelfY = [0.45, 0.9, 1.35];
  shelfY.forEach((y, si) => {
    b.box(0.6, 0.03, mz1 - mz0 + 0.04, TC.STEEL_D, mxc, y, (mz0 + mz1) / 2);
    for (let i = 0; i < nT; i++) {
      const z = mz0 + 0.1 + i * (mz1 - mz0 - 0.2) / (nT - 1), hue = (i / nT + si * 0.027) % 1;
      const lid = new THREE.Color().setHSL(hue, si === 0 ? 0.55 : si === 1 ? 0.75 : 0.85, si === 0 ? 0.78 : si === 1 ? 0.55 : 0.38).getHex();
      b.cyl(0.075, 0.075, 0.17, TC.CHROME, mxc - 0.08, y + 0.03, z, 10);
      b.cyl(0.08, 0.08, 0.03, lid, mxc - 0.08, y + 0.2, z, 10);
      b.box(0.06, 0.05, 0.05, TC.DARK, mxc - 0.08, y + 0.23, z);                                 // agitator gear box
    }
    b.box(0.03, 0.03, mz1 - mz0 - 0.1, TC.STEEL, mxc - 0.08, y + 0.255, (mz0 + mz1) / 2);         // drive bar
    b.box(0.12, 0.14, 0.14, PUMP, mxc + 0.12, y + 0.06, mz0 + 0.02);                               // drive motor
  });
  // ---- counter along the north side with the lab kit; daylight matching box at its west end; stool
  const cz = z0 + 0.06 + 0.3, cx0 = x0 + 0.08, cx1 = x1 - 0.65, ch = 0.95;
  b.box(cx1 - cx0, ch - 0.04, 0.58, TC.CREAM, (cx0 + cx1) / 2, 0.03, cz);
  b.box(cx1 - cx0 + 0.04, 0.04, 0.62, 0xe6e8ea, (cx0 + cx1) / 2, ch - 0.01, cz);
  for (let i = 1; i < 3; i++) b.box(0.012, ch - 0.14, 0.012, mixHex(TC.CREAM, 0x000000, 0.15), cx0 + i * (cx1 - cx0) / 3, 0.1, cz + 0.295);
  const tY = ch + 0.03;
  // matching box (open front glows daylight-white)
  const bx0 = cx0 + 0.32;
  b.box(0.56, 0.42, 0.42, TC.WHITE, bx0, tY, cz - 0.04); b.box(0.58, 0.04, 0.44, 0xd8dbdc, bx0, tY + 0.42, cz - 0.04);
  gl.box(0.48, 0.34, 0.02, 0xf4fbff, bx0, tY + 0.03, cz + 0.17);
  gl.box(0.46, 0.02, 0.3, 0xffffff, bx0, tY + 0.38, cz - 0.04);
  for (let i = 0; i < 3; i++) b.box(0.07, 0.006, 0.12, [0xe5484d, 0xe9a5a8, 0xc93b40][i], bx0 - 0.12 + i * 0.1, tY + 0.03, cz + 0.02);   // sample cards inside
  // digital scale with a tin
  const scx = bx0 + 0.65;
  b.box(0.3, 0.05, 0.26, TC.DARK, scx, tY, cz + 0.06); b.box(0.24, 0.012, 0.2, TC.STEEL, scx, tY + 0.05, cz + 0.05);
  gl.box(0.12, 0.03, 0.012, 0x7dffa0, scx, tY + 0.01, cz + 0.19);
  b.cyl(0.07, 0.07, 0.14, TC.CHROME, scx, tY + 0.062, cz + 0.05, 10); b.cyl(0.072, 0.072, 0.02, 0x3b82c4, scx, tY + 0.2, cz + 0.05, 10);
  // monitor + keyboard, spectrophotometer on its cradle
  const mox = scx + 0.55;
  b.box(0.14, 0.04, 0.12, TC.DARK, mox, tY, cz - 0.12); b.box(0.04, 0.2, 0.04, TC.DARK, mox, tY + 0.04, cz - 0.12);
  b.push(mox, tY + 0.22, cz - 0.1, 0, 1, -0.15); b.box(0.56, 0.34, 0.04, TC.DARK, 0, 0, 0); b.pop();
  gl.push(mox, tY + 0.22, cz - 0.1, 0, 1, -0.15); gl.box(0.5, 0.28, 0.012, 0xcfe6f0, 0, 0.03, 0.026); gl.box(0.2, 0.06, 0.014, 0xe5484d, -0.12, 0.2, 0.028); gl.box(0.2, 0.06, 0.014, 0x3b82c4, 0.12, 0.2, 0.028); gl.pop();
  b.box(0.42, 0.02, 0.14, 0x3a3f46, mox, tY, cz + 0.14);
  b.box(0.14, 0.03, 0.12, TC.DARK, mox + 0.38, tY, cz + 0.08);                                   // cradle
  b.box(0.08, 0.06, 0.16, TC.CREAM_L, mox + 0.38, tY + 0.03, cz + 0.08); b.box(0.06, 0.02, 0.04, TC.CORAL, mox + 0.38, tY + 0.09, cz + 0.03);
  // colour fan deck spread in an arc of eight strips
  const fx = mox - 0.45, fz = cz + 0.18;
  Object.values(PAINT_COLORS).forEach((c, i) => { const a = -0.7 + i * 0.2; b.box(0.04, 0.006 + i * 0.001, 0.3, c.hex, fx + Math.sin(a) * 0.15, tY + i * 0.002, fz - Math.cos(a) * 0.15, 0, a, 0); });
  b.cyl(0.015, 0.015, 0.03, TC.STEEL_DD, fx, tY, fz, 6);
  // stool
  const sx = mox - 0.1, sz = cz + 0.75;
  b.cyl(0.18, 0.2, 0.04, TC.STEEL_DD, sx, 0.03, sz, 10); b.cyl(0.035, 0.035, 0.6, TC.CHROME, sx, 0.07, sz, 6); b.cyl(0.18, 0.18, 0.07, TC.CORAL, sx, 0.66, sz, 10);
}
/** The colour lab's wall runs: x runs (north / south) at z = c from a to b, z runs (west) at x = c. Door gap left. */
function labRuns() {
  const W = PAINT.walls, LB = PD.colourLab, pillarX = W.maxX + W.thickness / 2 - 0.4;
  return [
    { axis: 'x', c: LB.minZ, a: LB.minX, b: W.maxX },
    { axis: 'x', c: LB.maxZ - 0.07, a: LB.minX, b: pillarX },
    { axis: 'z', c: LB.minX, a: LB.minZ, b: LB.doorZ - LB.doorW / 2 },
    { axis: 'z', c: LB.minX, a: LB.doorZ + LB.doorW / 2, b: LB.maxZ - 0.07 },
  ];
}
/** Glass of the colour lab (panes between 0.93 and 2.25, the closed door leaf), merged for one transparent mesh. */
const labGlassGeo = () => geo('paint|labGlass', (b) => {
  const LB = PD.colourLab;
  for (const r of labRuns()) {
    const len = r.b - r.a, mid = (r.a + r.b) / 2;
    if (r.axis === 'x') b.box(len, 1.32, 0.03, 0xffffff, mid, 0.93, r.c); else b.box(0.03, 1.32, len, 0xffffff, r.c, 0.93, mid);
  }
  b.box(0.03, 1.95, LB.doorW - 0.14, 0xffffff, LB.minX, 0.12, LB.doorZ);
});
/** Waste-paint drum on its spill pallet at PAINT.scrapBin. */
function wasteDrum(b) {
  const S = PAINT.scrapBin, Y = 0xf2c230, RD = 0xc93b30;
  b.box(0.9, 0.12, 0.9, Y, S.x, 0, S.z);
  b.box(0.82, 0.02, 0.82, 0x2a2f36, S.x, 0.12, S.z);
  for (let i = -3; i <= 3; i++) b.box(0.02, 0.012, 0.8, mixHex(Y, 0x000000, 0.3), S.x + i * 0.11, 0.135, S.z);
  for (const s of [-1, 1]) b.box(0.92, 0.04, 0.06, mixHex(Y, 0x000000, 0.15), S.x, 0.06, S.z + s * 0.3);   // fork pockets
  const dy = 0.14;
  b.cyl(0.29, 0.29, 0.88, RD, S.x, dy, S.z, 16);
  for (const y of [0.29, 0.59]) b.cyl(0.298, 0.298, 0.03, mixHex(RD, 0x000000, 0.25), S.x, dy + y, S.z, 16);
  b.cyl(0.295, 0.295, 0.025, mixHex(RD, 0x000000, 0.3), S.x, dy + 0.86, S.z, 16);                 // rim, proud of the body top
  b.cyl(0.28, 0.27, 0.05, Y, S.x, dy + 0.88, S.z, 16);                                             // yellow funnel lid
  b.cyl(0.2, 0.06, 0.08, mixHex(Y, 0x000000, 0.12), S.x, dy + 0.93, S.z, 14);
  b.cyl(0.06, 0.06, 0.02, 0x2a2f36, S.x, dy + 0.995, S.z, 10);
  b.box(0.06, 0.04, 0.12, TC.DARK, S.x + 0.2, dy + 0.93, S.z);                                    // lid latch
  b.box(0.22, 0.2, 0.02, TC.WHITE, S.x, dy + 0.38, S.z + 0.285);                                  // hazard label
  b.box(0.12, 0.12, 0.022, 0xf2813a, S.x, dy + 0.45, S.z + 0.288, 0, 0, PI / 4);
  b.box(0.04, 0.06, 0.024, TC.DARK, S.x, dy + 0.48, S.z + 0.29);
}
/** Forecourt markings on one transparent overlay: entry, queue slots, exit lane, pick-up box, exit. */
function arrowPath(g, x, z, dir, len, w, col) {
  // arrow pointing along dir ('n' | 's' | 'e' | 'w'), tail at (x, z)
  const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[dir], p = [-d[1], d[0]], hl = Math.min(len * 0.45, w * 2.2);
  const P = (a, b) => [x + d[0] * a + p[0] * b, z + d[1] * a + p[1] * b];
  const pts = [P(0, -w / 2), P(len - hl, -w / 2), P(len - hl, -w * 1.25), P(len, 0), P(len - hl, w * 1.25), P(len - hl, w / 2), P(0, w / 2)];
  g.fillStyle = col; g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.fill();
}
function forecourtTex() {
  const F = PAINT.forecourt, ppm = 40, w = Math.round((F.maxX - F.minX) * ppm), h = Math.round((F.maxZ - F.minZ) * ppm);
  return canvasTex('paintForecourt', w, h, (g) => {
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    g.setTransform(ppm, 0, 0, ppm, -F.minX * ppm, -F.minZ * ppm);
    const WH = 'rgba(251,246,234,0.92)', YL = SAFETY_Y, ex = PAINT.carEntry[1].x, qz = PAINT.queueLaneZ;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // entry: "PAINT IN" + arrow north, turn arrow east at the corner
    g.fillStyle = WH; g.font = `700 0.42px ${FONT}`; g.fillText('PAINT IN', ex, 10.25);
    arrowPath(g, ex, 9.85, 'n', 1.0, 0.24, WH);
    g.strokeStyle = WH; g.lineWidth = 0.22; g.beginPath(); g.moveTo(ex, qz + 0.75); g.quadraticCurveTo(ex, qz, ex + 0.75, qz); g.stroke();
    arrowPath(g, ex + 0.7, qz, 'e', 0.75, 0.22, WH);
    // queue slots (slot 0 = front), dashed yellow outlines, numbers, small arrows between them
    const slots = PAINT.queueSlots;
    slots.forEach((sl, i) => {
      g.setLineDash([0.35, 0.22]); g.strokeStyle = YL; g.lineWidth = 0.09;
      g.strokeRect(sl.x - 1.6, qz - 0.95, 3.2, 1.9); g.setLineDash([]);
      g.fillStyle = YL; g.font = `700 0.36px ${FONT}`; g.fillText(String(i + 1), sl.x + 1.25, qz - 0.62);
      if (i < slots.length - 1) arrowPath(g, (sl.x + slots[i + 1].x) / 2 - 0.3, qz, 'e', 0.6, 0.12, YL);
    });
    arrowPath(g, slots[slots.length - 1].x - 2.6, qz, 'e', 0.6, 0.12, YL);
    // exit lane: dashed north edge (cars back out of the booths across it), solid south edge, arrows east
    const el = PAINT.exitLaneZ, xx = PAINT.carExit[0].x, park = TOWN.parking.find((p) => p.id === 'paint');
    const southFrom = park ? park.x + 2.0 : -38;
    dashedLine(g, -38, el - 1.0, xx + 1.0, el - 1.0, 0.08, 0.5, 0.35, WH);
    g.fillStyle = WH; g.fillRect(southFrom, el + 1.0 - 0.04, xx - 1.0 - southFrom, 0.08);
    for (const x of [-35.8, -31.0, -25.6]) arrowPath(g, x, el, 'e', 0.9, 0.18, WH);
    // pick-up box at the pickup stop: yellow hatch border, "PICK-UP"
    const pk = PAINT.pickupStop;
    hatchRect(g, pk.x - 1.55, el - 0.85, pk.x + 1.55, el + 0.85, 0.14, 'rgba(242,194,48,0.10)');
    g.fillStyle = YL; g.font = `700 0.4px ${FONT}`; g.fillText('PICK-UP', pk.x, el + 0.02);
    // exit driveway: edge lines south to the street, "EXIT" + arrow south
    g.fillStyle = WH; g.fillRect(xx - 1.0 - 0.04, el + 1.0, 0.08, F.maxZ - el - 1.0); g.fillRect(xx + 1.0 - 0.04, el - 1.0, 0.08, F.maxZ - el + 1.0);
    arrowPath(g, xx, 5.4, 's', 1.1, 0.24, WH);
    g.font = `700 0.42px ${FONT}`; g.fillText('EXIT', xx, 7.0);
  });
}
/** Waiting shelter, prep desk, planters (forecourt furniture, static). */
function paintForecourt(b, gl) {
  const S = PD.shelter, cx = (S.minX + S.maxX) / 2, ry = S.roofY;
  // timber deck island (0.07 high)
  b.box(S.maxX - S.minX, 0.04, S.maxZ - S.minZ, TC.WOOD_D, cx, 0, (S.minZ + S.maxZ) / 2);
  for (let z = S.minZ + 0.07, i = 0; z < S.maxZ - 0.05; z += 0.145, i++) b.box(S.maxX - S.minX - 0.06, 0.03, 0.13, i % 2 ? TC.WOOD : TC.WOOD_L, cx, 0.04, z);
  b.box(S.maxX - S.minX + 0.04, 0.075, 0.05, TC.WOOD_D, cx, 0, S.maxZ);
  // two slim steel posts at the ends, beam, rafters, coral frame (the clear sheet is a separate mesh)
  const px0 = S.minX - 0.05, px1 = S.maxX + 0.05, rz0 = S.minZ - 0.2, rz1 = S.maxZ + 0.2;
  for (const x of [px0, px1]) { b.box(0.2, 0.02, 0.2, TC.STEEL_DD, x, 0, S.postZ); b.box(0.09, ry - 0.08, 0.09, TC.STEEL_D, x, 0, S.postZ); }
  b.box(px1 - px0 + 0.1, 0.1, 0.1, TC.CORAL_D, cx, ry - 0.12, S.postZ);
  for (let i = 0; i <= 4; i++) { const x = px0 + i * (px1 - px0) / 4; b.box(0.05, 0.05, rz1 - rz0, TC.CORAL, x, ry - 0.04, (rz0 + rz1) / 2); }
  for (const z of [rz0, rz1]) b.box(px1 - px0 + 0.1, 0.06, 0.06, TC.CORAL, cx, ry - 0.05, z);
  // sloped fascia on the south edge (the lettering is on the sign atlas)
  b.push(cx, ry, rz1 + 0.03, 0, 1, -0.6); b.box(px1 - px0 + 0.16, 0.18, 0.03, TC.CORAL, 0, -0.18, 0); b.pop();
  // two-seat bench along the east edge, facing west, back rest outwards
  const bx = S.maxX - 0.3, bz0 = 4.8, bz1 = 6.0, by = 0.07;
  for (const z of [bz0 + 0.1, bz1 - 0.1]) { b.box(0.36, 0.4, 0.05, TC.STEEL_DD, bx, by, z); b.box(0.05, 0.85, 0.05, TC.STEEL_DD, bx + 0.17, by, z); }
  for (let i = 0; i < 4; i++) b.box(0.08, 0.04, bz1 - bz0, i % 2 ? TC.WOOD : TC.WOOD_L, bx - 0.15 + i * 0.1, by + 0.4, (bz0 + bz1) / 2);
  for (let i = 0; i < 3; i++) b.box(0.035, 0.08, bz1 - bz0, i % 2 ? TC.WOOD : TC.WOOD_L, bx + 0.2, by + 0.56 + i * 0.11, (bz0 + bz1) / 2);
  // prep tech's podium (faces +z) with the key cabinet on top and a clipboard
  const P0 = PD.prepDesk, pw = 0.6, pd = 0.45, ph = 1.05;
  b.box(pw, 0.06, pd, TC.NAVY_D, P0.x, 0, P0.z);
  b.box(pw - 0.04, ph - 0.12, pd - 0.04, TC.NAVY, P0.x, 0.06, P0.z);
  b.box(pw - 0.02, 0.1, pd - 0.02, TC.CORAL, P0.x, 0.55, P0.z);
  b.push(P0.x, ph - 0.06, P0.z, 0, 1, -0.3); b.box(pw, 0.05, pd, TC.WOOD_D, 0, 0, 0); b.pop();
  b.push(P0.x - 0.1, ph - 0.0, P0.z + 0.04, 0, 1, -0.3); b.box(0.22, 0.012, 0.3, TC.CREAM_L, 0, 0, 0); b.box(0.08, 0.02, 0.03, TC.STEEL_DD, 0, 0.01, -0.13); b.pop();   // clipboard
  const kx = P0.x + 0.12, kz = P0.z - pd / 2 + 0.07, ky = ph;
  b.box(0.32, 0.42, 0.1, TC.STEEL_D, kx, ky, kz);
  b.box(0.28, 0.36, 0.02, TC.DARK, kx, ky + 0.03, kz + 0.05);
  const hx = paintHexes();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const col = hx[(r * 4 + c) % hx.length];
    b.box(0.012, 0.012, 0.03, TC.STEEL, kx - 0.1 + c * 0.066, ky + 0.33 - r * 0.11, kz + 0.07);
    b.box(0.04, 0.05, 0.012, col, kx - 0.1 + c * 0.066, ky + 0.26 - r * 0.11, kz + 0.075);
  }
  b.push(kx, ky + 0.42, kz + 0.05, 0, 1, -1.2); b.box(0.32, 0.36, 0.02, TC.STEEL, 0, 0, 0); b.pop();   // open door lifted up
  // low planters along the south edge
  for (const p of PD.planters) {
    const z = PD.planterZ;
    b.box(1.4, 0.4, 0.5, SLATE, p.x, 0, z);
    for (const s of [-1, 1]) { b.box(1.44, 0.05, 0.07, SLATE_L, p.x, 0.4, z + s * 0.235); b.box(0.07, 0.05, 0.4, SLATE_L, p.x + s * 0.685, 0.4, z); }
    b.box(1.3, 0.04, 0.4, 0x5a4636, p.x, 0.39, z);                                                // soil, below the rim
    for (let i = 0; i < 4; i++) {
      const x = p.x - 0.48 + i * 0.32, c = i % 2 ? TC.LEAF : 0x2f8f7f, s = 0.26 + ((i * 7 + Math.round(p.x)) % 3) * 0.04;
      b.box(s, s * 0.9, s, c, x, 0.43, z, 0, i * 0.5, 0);
      b.box(s * 0.7, s * 0.6, s * 0.7, mixHex(c, 0xffffff, 0.18), x + 0.03, 0.43 + s * 0.75, z - 0.02, 0, i * 0.9, 0);
    }
    for (let i = 0; i < 3; i++) b.box(0.06, 0.06, 0.06, [0xe5484d, 0xf6c453, 0xf4f1ea][(i + Math.round(-p.x)) % 3], p.x - 0.38 + i * 0.36, 0.72, z + 0.1);
  }
}
/** Sign atlas: small lettered plates of the hall on one canvas (drawn as quads of one mesh). */
const ATLAS = { w: 1024, h: 512, noSmoke: [0, 0, 256, 128], resp: [256, 0, 768, 128], waste: [0, 128, 512, 224], fascia: [0, 232, 1024, 270], lab: [0, 288, 1024, 512] };
function paintAtlasTex() {
  return canvasTex('paintAtlas', ATLAS.w, ATLAS.h, (g, w, h) => {
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // NO SMOKING: white plate, red ring + bar over a cigarette, red text
    { const [x0, y0, x1, y1] = ATLAS.noSmoke; g.fillStyle = '#fbf6ea'; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeStyle = '#d8403a'; g.lineWidth = 8; g.strokeRect(x0 + 4, y0 + 4, x1 - x0 - 8, y1 - y0 - 8);
      g.fillStyle = '#2b2f36'; g.fillRect(x0 + 26, y0 + 58, 52, 12); g.fillStyle = '#e8622c'; g.fillRect(x0 + 78, y0 + 58, 8, 12);
      g.beginPath(); g.arc(x0 + 56, y0 + 64, 38, 0, 7); g.lineWidth = 9; g.stroke(); g.beginPath(); g.moveTo(x0 + 30, y0 + 38); g.lineTo(x0 + 82, y0 + 90); g.stroke();
      g.fillStyle = '#d8403a'; g.font = `700 34px ${FONT}`; g.fillText('NO', x0 + 170, y0 + 44); g.font = `700 30px ${FONT}`; g.fillText('SMOKING', x0 + 170, y0 + 86); }
    // RESPIRATOR ZONE: blue plate with a white mask pictogram
    { const [x0, y0, x1, y1] = ATLAS.resp; g.fillStyle = '#2f6fc4'; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeStyle = '#fbf6ea'; g.lineWidth = 6; g.strokeRect(x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12);
      g.fillStyle = '#fbf6ea'; g.beginPath(); g.arc(x0 + 68, y0 + 60, 36, 0, 7); g.fill(); g.fillStyle = '#2f6fc4'; g.fillRect(x0 + 44, y0 + 42, 48, 14);
      g.beginPath(); g.ellipse(x0 + 68, y0 + 82, 22, 14, 0, 0, 7); g.fill(); g.fillStyle = '#fbf6ea'; g.fillRect(x0 + 40, y0 + 78, 8, 12); g.fillRect(x0 + 88, y0 + 78, 8, 12);
      g.font = `700 40px ${FONT}`; g.fillText('RESPIRATOR', x0 + 300, y0 + 44); g.font = `700 34px ${FONT}`; g.fillText('ZONE', x0 + 300, y0 + 88); }
    // WASTE PAINT ONLY: yellow / black
    { const [x0, y0, x1, y1] = ATLAS.waste; g.fillStyle = '#f2c230'; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.fillStyle = '#2b3640';
      for (let x = x0 - 40; x < x1; x += 40) { g.beginPath(); g.moveTo(x, y1); g.lineTo(x + 20, y1); g.lineTo(x + 34, y1 - 14); g.lineTo(x + 14, y1 - 14); g.fill(); g.beginPath(); g.moveTo(x, y0 + 14); g.lineTo(x + 20, y0 + 14); g.lineTo(x + 34, y0); g.lineTo(x + 14, y0); g.fill(); }
      g.font = `700 44px ${FONT}`; g.fillText('WASTE PAINT ONLY', (x0 + x1) / 2, (y0 + y1) / 2 + 2); }
    // shelter fascia
    { const [x0, y0, x1, y1] = ATLAS.fascia; g.fillStyle = css(TC.CORAL); g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = css(TC.CREAM_L); g.font = `700 30px ${FONT}`; g.fillText('WAITING  ·  PICK-UP', (x0 + x1) / 2, (y0 + y1) / 2 + 1); }
    // colour lab window: "COLOUR LAB" lettering and the eight colour swatches (transparent around them: it is glass)
    { const [x0, y0, x1, y1] = ATLAS.lab, cx = (x0 + x1) / 2;
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x0 + 40, y0 + 6, x1 - x0 - 80, y1 - y0 - 12);
      g.font = `700 86px ${FONT}`; g.fillStyle = css(TC.NAVY); g.fillText('COLOUR LAB', cx + 4, y0 + 66 + 4); g.fillStyle = '#ffffff'; g.fillText('COLOUR LAB', cx, y0 + 66);
      const hx = paintHexes(), sw = 92, gap = 14, tot = hx.length * sw + (hx.length - 1) * gap;
      hx.forEach((c, i) => { const sx = cx - tot / 2 + i * (sw + gap); g.fillStyle = '#ffffff'; g.fillRect(sx - 5, y0 + 128, sw + 10, 78); g.fillStyle = css(c); g.fillRect(sx, y0 + 133, sw, 68); }); }
  });
}
/** One mesh of quads textured from the atlas: [{ r: region, w, h, pos: [x,y,z], ry, rx }]. */
function atlasMesh(list) {
  const geos = list.map((q) => {
    const g = new THREE.PlaneGeometry(q.w, q.h), uv = g.attributes.uv, [x0, y0, x1, y1] = q.r;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / ATLAS.w, 1 - (y1 - uv.getY(i) * (y1 - y0)) / ATLAS.h);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...q.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(q.rx || 0, q.ry || 0, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    return g.applyMatrix4(m);
  });
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ map: paintAtlasTex(), transparent: true, depthWrite: false, toneMapped: false }));
  m.renderOrder = 4;
  return m;
}
/** East outer wall mural (seen from the alley / tow shed): plane facing +x. */
const MURAL = { z0: -10.0, z1: 0.0, y0: 0.45, y1: 2.35 };
function muralTex() {
  const L = MURAL.z1 - MURAL.z0, Hh = MURAL.y1 - MURAL.y0, w = 1024, h = Math.round(w * Hh / L);
  return canvasTex('paintMural', w, h, (g) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    const k = w / L;                                         // px per metre (canvas left = south when seen from the east)
    g.fillStyle = css(TC.CREAM_L); g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill();
    g.strokeStyle = css(TC.NAVY); g.lineWidth = 5; g.beginPath(); g.roundRect(12, 12, w - 24, h - 24, 14); g.stroke();
    // paint drip line along the top in the eight colours
    const hx = paintHexes(), seg = (w - 48) / hx.length;
    hx.forEach((c, i) => {
      const x = 24 + i * seg; g.fillStyle = css(c); g.fillRect(x, 20, seg, 16);
      for (let d = 0; d < 3; d++) { const dx = x + seg * (0.2 + d * 0.3), dl = 14 + ((i * 7 + d * 11) % 5) * 9; g.fillRect(dx - 5, 30, 10, dl); g.beginPath(); g.arc(dx, 30 + dl, 7, 0, 7); g.fill(); }
    });
    // big lettering
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(h * 0.46)}px ${FONT}`;
    g.fillStyle = css(TC.CORAL); g.fillText('SPRAY BAY', w * 0.56 + 6, h * 0.56 + 6);
    g.fillStyle = css(TC.NAVY); g.fillText('SPRAY BAY', w * 0.56, h * 0.56);
    // paint splashes on the right (north) end
    hx.forEach((c, i) => {
      const x = w * 0.9 + Math.cos(i * 2.4) * 34, y = h * 0.55 + Math.sin(i * 2.4) * 30, r = 10 + (i % 3) * 6;
      g.fillStyle = css(c); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.beginPath(); g.arc(x + Math.cos(i) * (r + 8), y + Math.sin(i) * (r + 6), r * 0.35, 0, 7); g.fill();
    });
    // ENTRANCE with an arrow pointing south (left as seen from the east)
    const ex = w * 0.13, ey = h * 0.62;
    g.fillStyle = css(TC.CORAL_D); g.font = `700 ${Math.round(h * 0.13)}px ${FONT}`; g.fillText('ENTRANCE', ex + 14, ey - h * 0.16);
    g.beginPath(); g.moveTo(ex - 70, ey + 10); g.lineTo(ex - 30, ey - 22); g.lineTo(ex - 30, ey - 4); g.lineTo(ex + 90, ey - 4); g.lineTo(ex + 90, ey + 24); g.lineTo(ex - 30, ey + 24); g.lineTo(ex - 30, ey + 42); g.closePath(); g.fill();
  });
}
function paintHallGeo() {
  return geo2('paintHall', (b, gl) => {
    paintHallShell(b, gl);
    paintStacks(b);
    paintYard(b);
    paintCorner(b, gl);
    colourLab(b, gl);
    wasteDrum(b);
    paintForecourt(b, gl);
  });
}
export function createPaintHall() {
  const W = PAINT.walls, T = W.thickness, H = W.height, LB = PD.colourLab;
  const cx = (W.minX + W.maxX) / 2, cz = (W.minZ + W.maxZ) / 2;
  const group = new THREE.Group();
  group.userData.world = true;
  group.userData.centre = plotCentre(PROPERTIES.paint.plot);
  // floor (the colour lab has its own white floor) + the painted markings on one transparent overlay
  group.add(floorRects([{ minX: W.minX, maxX: LB.minX, minZ: W.minZ, maxZ: W.maxZ }, { minX: LB.minX, maxX: W.maxX, minZ: W.minZ, maxZ: LB.minZ }], 0.012, 'paintfloor', 3));
  const marks = decal(hallMarkTex(), W.maxX - W.minX, W.maxZ - W.minZ, 0.016);
  marks.position.x = cx; marks.position.z = cz;
  group.add(marks);
  addGeo2(group, paintHallGeo());
  // colour plates (one face for all eight) + the sign on top of the back wall
  const plates = face(platesTex(), W.maxX - W.minX, PLATE_H, { transparent: true });
  plates.position.set(cx, PLATE_Y0 + PLATE_H / 2, W.minZ + 0.035);
  group.add(plates);
  const sign = roofSign(spraySignTex(), PD.sign.w, PD.sign.h, { board: TC.NAVY, bulbs: false, tilt: -0.2 });
  sign.position.set(PD.sign.x, H + 0.1, W.minZ - T / 2);
  group.add(sign);
  // moving parts: the two stack fans (extraction always runs), the compressor (cycles: runs ~7 s, rests ~12 s)
  const anim = [];
  for (const st of PD.stacks) {
    const f = mesh(stackFanGeo(), litMat, { cast: false });
    f.position.set(st.x, PD.stackH - 0.25, st.z);
    group.add(f);
    anim.push((dt) => { f.rotation.y += dt * 5.5; });
  }
  const C = PD.compressor;
  const comp = mesh(compressorGeo(), litMat, { cast: true, receive: true });
  comp.position.set(C.x, YARD_Y, C.z);
  group.add(comp);
  const cfan = mesh(compFanGeo(), litMat, { cast: false });
  cfan.position.set(C.x, YARD_Y + 1.13, C.z - 0.2);
  group.add(cfan);
  const runLamp = new THREE.Mesh(unitBox, LAMP.off);
  runLamp.scale.set(0.05, 0.05, 0.012); runLamp.position.set(C.x + 0.3, YARD_Y + 0.99, C.z + 0.712);
  group.add(runLamp);
  let cPhase = 3 + Math.random() * 6, cSpeed = 0;
  anim.push((dt, tt) => {
    cPhase = (cPhase + dt) % 19;
    const running = cPhase < 7;
    cSpeed += ((running ? 1 : 0) - cSpeed) * Math.min(1, dt * 1.5);
    cfan.rotation.y += dt * 22 * cSpeed;
    const j = running ? 0.0012 : 0;                       // 1-2 mm shudder while running
    comp.position.x = C.x + Math.sin(tt * 87) * j;
    comp.position.z = C.z + Math.cos(tt * 73) * j * 0.7;
    runLamp.material = running ? LAMP.green : LAMP.off;
  });
  // solids (world boxes): walls, stack housings, plant yard units ...
  const solids = hallSolids(W, T);
  const hz = W.minZ - T - 0.325;
  for (const st of PD.stacks) solids.push({ minX: st.x - 0.55, maxX: st.x + 0.85, minZ: hz - 0.36, maxZ: W.minZ - T });
  const Rc = PD.receiver, Dr = PD.dryer, Fl = PD.flammables;
  solids.push({ minX: C.x - 0.52, maxX: C.x + 0.52, minZ: C.z - 0.72, maxZ: C.z + 0.75 });
  solids.push({ minX: Rc.x - 0.34, maxX: Rc.x + 0.34, minZ: Rc.z - 0.92, maxZ: Rc.z + 0.92 });
  solids.push({ minX: Dr.x - 0.36, maxX: Dr.x + 0.36, minZ: Dr.z - 0.36, maxZ: Dr.z + 0.36 });
  solids.push({ minX: Fl.x - 0.56, maxX: Fl.x + 0.56, minZ: Fl.z - 0.31, maxZ: Fl.z + 0.31 });
  // painters' corner, colour lab, waste drum
  const Lk = PD.lockers, G = PD.gunWash, Mt = PD.maskTrolley, S = PAINT.scrapBin;
  solids.push({ minX: W.minX, maxX: W.minX + 0.47, minZ: Lk.z0, maxZ: Lk.z1 });
  solids.push({ minX: G.x - 0.46, maxX: G.x + 0.46, minZ: G.z - 0.31, maxZ: G.z + 0.33 });
  solids.push({ minX: Mt.x - 0.24, maxX: Mt.x + 0.26, minZ: Mt.z - 0.53, maxZ: Mt.z + 0.53 });
  solids.push({ minX: LB.minX - 0.08, maxX: W.maxX, minZ: LB.minZ - 0.06, maxZ: LB.maxZ });
  solids.push({ minX: S.x - 0.45, maxX: S.x + 0.45, minZ: S.z - 0.45, maxZ: S.z + 0.45 });
  const labGlass = new THREE.Mesh(labGlassGeo(), boothGlassMat);
  labGlass.renderOrder = 3;
  group.add(labGlass);
  // forecourt: markings overlay, the shelter's clear roof sheet
  const F = PAINT.forecourt, Sh = PD.shelter;
  const fmarks = decal(forecourtTex(), F.maxX - F.minX, F.maxZ - F.minZ, 0.014);
  fmarks.position.x = (F.minX + F.maxX) / 2; fmarks.position.z = (F.minZ + F.maxZ) / 2;
  group.add(fmarks);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(Sh.maxX - Sh.minX + 0.2, 0.02, Sh.maxZ - Sh.minZ + 0.4), shelterRoofMat);
  roof.position.set((Sh.minX + Sh.maxX) / 2, Sh.roofY + 0.012, (Sh.minZ + Sh.maxZ) / 2);
  roof.renderOrder = 3;
  group.add(roof);
  // lettered plates (one atlas mesh): west-wall safety signs, waste plate, shelter fascia, colour lab window
  const fcx = (Sh.minX + Sh.maxX) / 2, fz = Sh.maxZ + 0.2 + 0.03, ft = -0.6;
  const fpos = [fcx, Sh.roofY - 0.09 * Math.cos(ft) - 0.017 * Math.sin(ft), fz - 0.09 * Math.sin(ft) + 0.017 * Math.cos(ft)];
  const pillarX = W.maxX + T / 2 - 0.4;
  group.add(atlasMesh([
    { r: ATLAS.noSmoke, w: 0.5, h: 0.25, pos: [W.minX + 0.012, 2.1, PD.lockers.z0 + 0.45], ry: R90 },
    { r: ATLAS.resp, w: 0.84, h: 0.21, pos: [W.minX + 0.012, 2.09, PD.lockers.z1 - 0.48], ry: R90 },
    { r: ATLAS.waste, w: 0.8, h: 0.15, pos: [W.minX + 0.012, 1.42, S.z], ry: R90 },          // on the west wall above the drum
    { r: ATLAS.fascia, w: Sh.maxX - Sh.minX + 0.2, h: 0.17, pos: fpos, rx: ft },
    { r: ATLAS.lab, w: 3.0, h: 0.66, pos: [(LB.minX + pillarX) / 2, 1.6, LB.maxZ - 0.07 + 0.035], ry: 0 },
  ]));
  // mural on the east outer wall
  const mural = face(muralTex(), MURAL.z1 - MURAL.z0, MURAL.y1 - MURAL.y0, { lit: true });
  mural.rotation.y = R90;
  mural.position.set(W.maxX + T + 0.012, (MURAL.y0 + MURAL.y1) / 2, (MURAL.z0 + MURAL.z1) / 2);
  group.add(mural);
  const P0 = PD.prepDesk;
  solids.push({ minX: P0.x - 0.31, maxX: P0.x + 0.31, minZ: P0.z - 0.24, maxZ: P0.z + 0.24 });
  for (const x of [Sh.minX - 0.05, Sh.maxX + 0.05]) solids.push({ minX: x - 0.08, maxX: x + 0.08, minZ: Sh.postZ - 0.08, maxZ: Sh.postZ + 0.08 });
  solids.push({ minX: Sh.maxX - 0.5, maxX: Sh.maxX - 0.05, minZ: 4.75, maxZ: 6.05 });
  for (const p of PD.planters) solids.push({ minX: p.x - 0.72, maxX: p.x + 0.72, minZ: PD.planterZ - 0.27, maxZ: PD.planterZ + 0.27 });
  group.userData.solids = solids;
  let t = 0;
  function update(dt = 0.016) { t += dt; for (const a of anim) a(dt, t); }
  update(0);
  return { group, update };
}

// ================================================================ STUBS (replaced one by one below this line)
const stubMat = new THREE.MeshLambertMaterial({ color: 0xbbbbbb });
function slab(w, h, d, x = 0, z = 0) { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stubMat); m.position.set(x, h / 2, z); m.castShadow = true; g.add(m); return g; }
function station(w, d) { const group = slab(w, 1.6, d); const partAnchor = new THREE.Object3D(); partAnchor.position.set(0, 0.9, d / 2 + 0.05); group.add(partAnchor); return { group, partAnchor, setProgress: noop, update: noop }; }
export function createVipHall() { return { group: new THREE.Group(), update: noop }; }
export function createVipBar() { return slab(2, 1.1, 0.8); }
export function createGoldLift() { const group = slab(1.9, 0.02, 3.2); const platform = new THREE.Object3D(); group.add(platform); return { group, platform, setHeight: noop, setLight: noop, update: noop }; }
export function createPremiumCabinet() { return station(2.2, 1.2); }
export function createRedCarpet() { return slab(1.2, 0.02, 5.4); }
export function createPaparazziWall() { return slab(3, 2.2, 0.2); }
export function createHostStand() { return slab(0.6, 1.1, 0.5); }
