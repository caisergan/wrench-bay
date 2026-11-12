// Town vehicles: the tow truck (2 looks), the seven ambient traffic vehicles and the car ferry.
// Same family as cars.js: chunky voxel blocks merged per piece (Builder), shared litMat / glowMat, wheels as separate
// meshes that spin. Geometry is cached per kind / level; nothing is allocated per frame.
// Conventions: origin at floor level, centre of the footprint, front faces +z.
import * as THREE from 'three';
import { TRAFFIC_TYPES } from '../config.js';
import { TOW_LIFT } from './cars.js';
import { Builder, litMat, glowMat, memo, mesh, polygon } from './voxel.js';

const geoCache = new Map();

// ---------------------------------------------------------------- palette
const GLASS = 0xa8dcea;
const GLASS_D = 0x7db8cc;
const RUBBER = 0x2b2f36;
const DARK = 0x262a31;
const TRIM = 0x3d434c;
const CHROME = 0xd9dee2;
const CREAM = 0xf6ecd8;
const HEAD = 0xfff1b8;
const TAIL = 0xe0443e;
const AMBER = 0xffb02e;
const AMBER_D = 0x9a6a22;
const STEEL = 0x9aa3ab;
const STEEL_D = 0x636c75;
const WHITE = 0xf4f1ea;
const NAVY = 0x2f4858;
const YELLOW = 0xf0b429;
const ORANGE = 0xee8c3a;
const RED = 0xd94848;
const BLUE = 0x4a7fc4;

const _c = new THREE.Color();
const shade = (hex, k) => _c.set(hex).multiplyScalar(k).getHex();
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;

// ---------------------------------------------------------------- helpers
/** Wheel (axis along x, centre at the origin): tyre, tread blocks, hub, spokes so that the spin reads. */
function wheelGeo(r, w, hub = CHROME) {
  return memo(geoCache, `wheel|${r}|${w}|${hub}`, () => {
    const b = new Builder();
    const Z = Math.PI / 2;
    b.cyl(r, r, w, RUBBER, 0, -w / 2, 0, 12, 0, 0, Z);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26;
      b.box(w * 0.8, 0.035, 0.08, 0x3a3f48, 0, (r - 0.004) * Math.cos(a) - 0.0175, (r - 0.004) * Math.sin(a), a);
    }
    b.cyl(r * 0.6, r * 0.6, w + 0.02, hub, 0, -(w + 0.02) / 2, 0, 10, 0, 0, Z);
    const hd = shade(hub, 0.62);
    b.box(w + 0.03, r * 0.95, 0.06, hd, 0, -r * 0.475, 0);
    b.box(w + 0.03, 0.06, r * 0.95, hd, 0, -0.03, 0);
    b.cyl(r * 0.2, r * 0.2, w + 0.05, hub, 0, -(w + 0.05) / 2, 0, 8, 0, 0, Z);
    return b.build();
  });
}

/** Adds wheels to `group`. spec: [[x, z, r, w, hub?], ...]. Returns the spin meshes with their radius. */
function addWheels(group, spec) {
  const list = [];
  for (const [x, z, r, w, hub] of spec) {
    const m = mesh(wheelGeo(r, w, hub ?? CHROME));
    m.position.set(x, r, z);
    group.add(m);
    list.push({ m, r });
  }
  return list;
}
function spinWheels(list, dt, speed) {
  for (let i = 0; i < list.length; i++) list[i].m.rotation.x += (speed * dt) / list[i].r;
}

/** Slab lying on the side-profile line (za, ya) -> (zb, yb) (za < zb), `t` thick, pushed `off` outwards. */
function slab(b, za, ya, zb, yb, w, t, color, x = 0, off = 0) {
  const dz = zb - za, dy = yb - ya, len = Math.hypot(dz, dy);
  const th = Math.atan2(-dy, dz), ny = Math.cos(th), nz = Math.sin(th);
  const cy = (ya + yb) / 2 + ny * (off + t / 2), cz = (za + zb) / 2 + nz * (off + t / 2);
  b.box(w, t, len, color, x, cy - t / 2, cz, th);
}
/** Side profile (z, y points) extruded across `width`, centred on xc. */
function sideExtrude(b, pts, width, color, xc = 0) {
  b.shape(polygon(pts), width, color, xc + width / 2, 0, 0, 0, -Math.PI / 2, 0);
}
/** Beam in the YZ plane from (y1, z1) to (y2, z2) at lateral x. */
function beam(b, x, y1, z1, y2, z2, w, t, color) {
  const dz = z2 - z1, dy = y2 - y1, len = Math.hypot(dz, dy);
  const th = -Math.atan2(dy, dz);
  b.box(w, t, len, color, x, (y1 + y2) / 2 - t / 2, (z1 + z2) / 2, th);
}
/** Disc with its axis along x, centre (x, y, z). */
function discX(b, r, h, color, x, y, z, seg = 10) { b.cyl(r, r, h, color, x, y - h / 2, z, seg, 0, 0, Math.PI / 2); }
/** Disc with its axis along z, centre (x, y, z). */
function discZ(b, r, h, color, x, y, z, seg = 10) { b.cyl(r, r, h, color, x, y, z - h / 2, seg, Math.PI / 2); }
/** Side window pair + door seams on a box-ish cab. */
function sideWin(b, z0, z1, y0, y1, halfW, color = GLASS) {
  for (const sx of [-1, 1]) b.box(0.02, y1 - y0, z1 - z0, color, sx * (halfW + 0.008), y0, (z0 + z1) / 2);
}
/** A glow geometry cached by key (lenses, lamps). */
const glowBox = (key, w, h, d, color, x = 0, y = 0, z = 0) =>
  memo(geoCache, `glow|${key}`, () => new Builder().box(w, h, d, color, x, y, z).build());

// ================================================================ TOW TRUCK
// Footprint 1.7 x 3.6. Conventional cab at the front, service body with toolboxes behind it, a fixed recovery boom with
// a winch drum and cable, and a hydraulic wheel-lift at the tail: a cross-bar with two L-shaped cradles that slide
// under the front tyres of the car to tow. The wheel-lift raises against the tail (setBoom 0) and lowers to the ground
// (setBoom 1). `hitch` sits on the cradle trays: the towed car's front axle goes right above it.
const TRUCK = [
  {   // level 1: compact light-duty
    r: 0.33, ww: 0.26, wx: 0.72, zF: 1.15, zR: -0.95, dual: false,
    deckY: 0.66, cabZ0: 0.14, cabZ1: 1.12, roofY: 1.62, hoodTop: 0.96, halfW: 0.78,
    main: YELLOW, accent: ORANGE, roof: CREAM, boxH: 0.5, pivotY: 0.5, pivotZ: -1.76,
  },
  {   // level 2 (and 3): heavy-duty
    r: 0.38, ww: 0.22, wx: 0.73, zF: 1.1, zR: -0.9, dual: true,
    deckY: 0.78, cabZ0: -0.02, cabZ1: 1.14, roofY: 1.8, hoodTop: 1.02, halfW: 0.8,
    main: RED, accent: CREAM, roof: WHITE, boxH: 0.62, pivotY: 0.56, pivotZ: -1.78,
  },
];

function truckBodyGeo(level) {
  return memo(geoCache, `truck|${level}`, () => {
    const S = TRUCK[level >= 2 ? 1 : 0], hv = level >= 2;
    const { main, accent, roof, halfW, deckY } = S;
    const mainD = shade(main, 0.78);
    const b = new Builder();
    // ---- chassis rails + crossmembers
    b.box(0.5, 0.16, 3.46, DARK, -0.34, S.pivotY - 0.2, -0.05);
    b.box(0.5, 0.16, 3.46, DARK, 0.34, S.pivotY - 0.2, -0.05);
    b.box(1.5, 0.12, 0.14, TRIM, 0, S.pivotY - 0.18, S.zF);
    b.box(1.5, 0.12, 0.14, TRIM, 0, S.pivotY - 0.18, S.zR);
    // axles (visible between the wheels)
    b.box(1.3, 0.1, 0.12, STEEL_D, 0, S.r - 0.05, S.zF);
    b.box(1.3, 0.1, 0.12, STEEL_D, 0, S.r - 0.05, S.zR);
    // ---- hood + front end
    const hz0 = S.cabZ1 - 0.02, hz1 = 1.78;
    b.box(1.56, S.hoodTop - 0.5, hz1 - hz0, main, 0, 0.5, (hz0 + hz1) / 2);
    slab(b, hz0 + 0.05, S.hoodTop, hz1 - 0.12, S.hoodTop - 0.04, 1.3, 0.04, mainD);
    b.box(1.28, 0.34, 0.05, DARK, 0, 0.56, hz1 - 0.005);                                  // grille
    for (let i = -2; i <= 2; i++) b.box(0.05, 0.28, 0.06, CHROME, i * 0.22, 0.59, hz1 + 0.02);
    for (const sx of [-1, 1]) {
      b.box(0.24, 0.14, 0.05, HEAD, sx * 0.58, 0.74, hz1 + 0.005);                          // headlamps
      b.box(0.1, 0.1, 0.05, AMBER, sx * 0.7, 0.58, hz1 + 0.005);                          // indicators
    }
    b.box(1.7, 0.2, 0.18, hv ? STEEL_D : TRIM, 0, 0.28, hz1 - 0.04);                         // front bumper
    if (hv) {                                                                             // bull bar + winch plate
      b.box(1.0, 0.1, 0.1, CHROME, 0, 0.46, hz1 + 0.06);
      b.box(0.12, 0.34, 0.1, CHROME, -0.45, 0.28, hz1 + 0.05);
      b.box(0.12, 0.34, 0.1, CHROME, 0.45, 0.28, hz1 + 0.05);
    }
    // ---- cab: side profile extruded across
    const cw = hv ? 1.62 : 1.56;
    const zf = S.cabZ1, zr = S.cabZ0, yt = S.roofY;
    sideExtrude(b, [[zr, 0.5], [zf, 0.5], [zf, S.hoodTop + 0.02], [zf - 0.24, yt], [zr + 0.08, yt], [zr, yt - 0.14]], cw, main);
    b.box(cw - 0.06, 0.06, zf - zr - 0.16, roof, 0, yt, (zf + zr) / 2 + 0.0);             // roof cap
    // windows: windshield + side windows + rear window
    slab(b, zf - 0.23, yt - 0.04, zf - 0.0, S.hoodTop + 0.06, cw - 0.2, 0.05, GLASS, 0, 0.0);
    sideWin(b, zr + 0.22, zf - 0.34, S.hoodTop + 0.08, yt - 0.1, cw / 2 - 0.0, GLASS);
    b.box(cw - 0.3, yt - S.hoodTop - 0.22, 0.04, GLASS_D, 0, S.hoodTop + 0.1, zr - 0.005);    // rear window
    // door seams, handles and mirrors
    for (const sx of [-1, 1]) {
      const x = sx * (cw / 2 + 0.006);
      b.box(0.012, S.hoodTop - 0.52, 0.02, mainD, x, 0.52, zr + 0.2);
      b.box(0.012, S.hoodTop - 0.52, 0.02, mainD, x, 0.52, zf - 0.32);
      b.box(0.04, 0.05, 0.14, DARK, sx * (cw / 2 + 0.016), S.hoodTop - 0.2, zf - 0.5);
      b.box(0.14, 0.04, 0.04, DARK, sx * (cw / 2 + 0.1), S.hoodTop + 0.3, zf - 0.22);     // mirror arm
      b.box(0.05, 0.3, 0.2, DARK, sx * (cw / 2 + 0.18), S.hoodTop + 0.2, zf - 0.22);       // mirror
    }
    // livery stripe along the sides (below the windows)
    for (const sx of [-1, 1]) {
      b.box(0.012, 0.09, zf - zr - 0.04, accent, sx * (cw / 2 + 0.006), 0.6, (zf + zr) / 2);
      b.box(0.012, 0.09, hz1 - hz0 - 0.1, accent, sx * (cw / 2 - 0.0 + 0.006), 0.6, (hz0 + hz1) / 2 + 0.04);
    }
    if (hv) {   // exhaust stack behind the cab
      for (const sx of [1]) {
        b.cyl(0.05, 0.05, 1.3, CHROME, sx * 0.74, 0.7, zr - 0.1, 8);
        b.cyl(0.06, 0.06, 0.06, DARK, sx * 0.74, 2.0, zr - 0.1, 8);
      }
      b.box(0.16, 0.5, 0.16, STEEL_D, 0.74, 0.58, zr - 0.1);
    }
    // ---- service body: deck, toolboxes, headache rack
    const bz1 = zr - 0.06, bz0 = -1.7;
    b.box(halfW * 2 - 0.02, 0.1, bz1 - bz0, STEEL_D, 0, deckY - 0.1, (bz0 + bz1) / 2);
    const tbW = 0.36, tbH = S.boxH;
    for (const sx of [-1, 1]) {
      const cx = sx * (halfW - tbW / 2);
      b.box(tbW, tbH, bz1 - bz0 - 0.16, main, cx, deckY, (bz0 + bz1 - 0.16) / 2 + 0.0 - 0.0);
      b.box(tbW + 0.04, 0.04, bz1 - bz0 - 0.12, STEEL, cx, deckY + tbH, (bz0 + bz1 - 0.16) / 2);   // tread-plate lid
      // compartment doors, handles
      const zc = (bz0 + bz1 - 0.16) / 2, len = bz1 - bz0 - 0.16;
      const nd = hv ? 3 : 2;
      for (let i = 0; i < nd; i++) {
        const z = zc - len / 2 + (len / nd) * (i + 0.5);
        b.box(0.014, tbH - 0.14, len / nd - 0.08, mainD, sx * (halfW + 0.002), deckY + 0.07, z);
        b.box(0.03, 0.06, 0.12, DARK, sx * (halfW + 0.02), deckY + tbH * 0.55, z + (len / nd) * 0.22);
      }
      // rear lamps on the end of the toolbox
      b.box(tbW - 0.1, 0.2, 0.04, TAIL, cx, deckY + 0.08, bz0 - 0.005 + 0.02 - 0.0);
    }
    // hazard-striped rear skirt under the deck edge
    for (let i = 0; i < 6; i++) b.box(0.2, 0.1, 0.03, i % 2 ? DARK : YELLOW, -0.5 + i * 0.2, S.pivotY - 0.18, bz0 - 0.01);
    // headache rack behind the cab
    const rk = 0.82 * (hv ? 1.1 : 1);
    for (const sx of [-1, 1]) b.box(0.08, rk, 0.08, STEEL_D, sx * 0.62, deckY, bz1 - 0.04);
    b.box(1.34, 0.08, 0.08, STEEL_D, 0, deckY + rk, bz1 - 0.04);
    b.box(1.2, 0.05, 0.05, STEEL_D, 0, deckY + rk * 0.5, bz1 - 0.04);
    // ---- recovery boom: two leaning struts, a cross head with a sheave, the winch drum and the cable
    const bx = hv ? 0.2 : 0.17;
    const hz = hv ? -1.0 : -0.95, hy = deckY + (hv ? 1.28 : 1.0);
    const pz = hv ? -0.1 : -0.12;
    for (const sx of [-1, 1]) beam(b, sx * bx, deckY, pz, hy, hz, 0.1, 0.12, STEEL_D);
    b.box(bx * 2 + 0.2, 0.12, 0.16, YELLOW, 0, hy - 0.04, hz - 0.02);                    // boom head
    discX(b, 0.09, 0.1, STEEL, 0, hy + 0.02, hz - 0.1, 8);                                 // sheave
    b.box(0.5, 0.26, 0.16, STEEL_D, 0, deckY, pz + 0.18);                                   // winch frame
    discX(b, 0.13, 0.4, STEEL, 0, deckY + 0.2, pz + 0.18, 10);                               // drum
    discX(b, 0.15, 0.04, STEEL_D, -0.2, deckY + 0.2, pz + 0.18, 10);
    discX(b, 0.15, 0.04, STEEL_D, 0.2, deckY + 0.2, pz + 0.18, 10);
    discX(b, 0.105, 0.34, 0x4a4f57, 0, deckY + 0.2, pz + 0.18, 10);                         // wound cable
    // cable: drum top -> sheave -> down to the hook
    beam(b, 0, deckY + 0.34, pz + 0.18, hy + 0.1, hz - 0.1, 0.03, 0.03, 0x4a4f57);
    const hkZ = hz - 0.2, hkY = deckY + (hv ? 0.68 : 0.5);
    b.box(0.03, hy + 0.1 - hkY - 0.1, 0.03, 0x4a4f57, 0, hkY + 0.1, hkZ);
    b.box(0.08, 0.08, 0.08, STEEL_D, 0, hkY + 0.04, hkZ);                                   // hook block
    b.box(0.04, 0.12, 0.04, CHROME, 0, hkY - 0.06, hkZ);
    b.box(0.04, 0.04, 0.12, CHROME, 0, hkY - 0.1, hkZ - 0.04);
    if (hv) {   // second light bar: faces the tail, on the boom head
      b.box(0.9, 0.07, 0.14, DARK, 0, hy + 0.1, hz - 0.2);
      for (const sx of [-1, 1]) b.box(0.4, 0.1, 0.12, AMBER_D, sx * 0.24, hy + 0.16, hz - 0.2);
    }
    // ---- light bar on the cab roof (dull lenses; the glowing ones are separate meshes)
    const lbz = (zf + zr) / 2 - 0.02;
    b.box(1.2, 0.07, 0.24, DARK, 0, yt + 0.06, lbz);
    for (const sx of [-1, 1]) b.box(0.52, 0.12, 0.22, AMBER_D, sx * 0.3, yt + 0.12, lbz);
    // ---- rear flood lamp posts (lenses are glow meshes)
    for (const sx of [-1, 1]) {
      b.box(0.05, 0.3, 0.05, STEEL_D, sx * 0.64, deckY + tbH + 0.04, bz0 + 0.06);
      b.box(0.2, 0.12, 0.1, DARK, sx * 0.64, deckY + tbH + 0.3, bz0 + 0.04);
    }
    // ---- wheel-lift pivot bracket + hydraulic anchor
    b.box(0.56, 0.2, 0.12, STEEL_D, 0, S.pivotY - 0.12, S.pivotZ + 0.04);
    discX(b, 0.07, 0.5, STEEL, 0, S.pivotY, S.pivotZ, 8);
    b.box(0.1, 0.2, 0.1, STEEL_D, 0, S.pivotY - 0.22, S.pivotZ + 0.55);
    // wheel arches (dark flares over the wheels)
    const zs = S.dual ? [S.zF, S.zR] : [S.zF, S.zR];
    for (const z of zs) for (const sx of [-1, 1]) b.box(0.3, 0.05, 0.86, DARK, sx * (S.wx - 0.0), S.r * 2 - 0.0, z);
    // a "WB" rescue marking on the toolbox sides: a cross-cut shape
    for (const sx of [-1, 1]) {
      const x = sx * (halfW + 0.01);
      b.box(0.01, 0.1, 0.34, accent, x, deckY + tbH - 0.2, (bz0 + bz1) / 2 - 0.1);
    }
    return b.build();
  });
}

// ---- wheel-lift pieces (arm-local frame: +z along the arm, origin at the pivot)
function liftArmGeo(level) {
  return memo(geoCache, `lift-arm|${level}`, () => {
    const hv = level >= 2, b = new Builder();
    const w = hv ? 0.26 : 0.2, h = hv ? 0.2 : 0.16;
    b.box(w, h, 0.62, hv ? NAVY : STEEL_D, 0, -h / 2, 0.31);                 // outer sleeve
    for (let i = 0; i < 3; i++) b.box(w + 0.012, h + 0.012, 0.05, i % 2 ? DARK : YELLOW, 0, -h / 2 - 0.006, 0.14 + i * 0.1);   // hazard band
    discX(b, 0.095, w + 0.1, STEEL, 0, 0, 0, 8);                               // pivot pin
    return b.build();
  });
}
function liftInnerGeo(level) {
  return memo(geoCache, `lift-inner|${level}`, () => {
    const hv = level >= 2, b = new Builder();
    const w = hv ? 0.19 : 0.14, h = hv ? 0.15 : 0.11;
    b.box(w, h, 0.56, STEEL, 0, -h / 2, 0.28);
    b.box(w + 0.1, h + 0.08, 0.1, STEEL_D, 0, -h / 2 - 0.04, 0.5);            // tip block
    return b.build();
  });
}
/** Cradle frame: origin = the cross-bar centre; tray centres sit at (+-0.62, -0.06, -0.36), z runs towards the car. */
function liftCradleGeo(level) {
  return memo(geoCache, `lift-cradle|${level}`, () => {
    const hv = level >= 2, b = new Builder();
    const bar = hv ? NAVY : STEEL_D;
    b.box(1.58, 0.16, 0.13, bar, 0, -0.12, 0);                                  // cross-bar
    for (let i = 0; i < 5; i++) b.box(0.1, 0.17, 0.14, i % 2 ? DARK : YELLOW, -0.62 + i * 0.31, -0.121, 0.0);
    for (const sx of [-1, 1]) {
      const x = sx * 0.62;
      b.box(0.4, 0.05, 0.8, STEEL_D, x, -0.11, -0.36);                           // tray plate (top at -0.06)
      b.box(0.4, 0.14, 0.07, STEEL_D, x, -0.11, -0.73);                          // rear lip of the L
      b.box(0.3, 0.012, 0.6, DARK, x, -0.06, -0.38);                             // rubber pad
      b.box(0.06, 0.12, 0.76, STEEL_D, x - sx * 0.19, -0.11, -0.36);             // inner side rail
      b.box(0.06, 0.1, 0.6, STEEL_D, x + sx * 0.19, -0.11, -0.3);                // outer side rail
      b.box(0.04, 0.05, 0.14, YELLOW, x + sx * 0.2, -0.015, -0.73);               // marker on the lip
    }
    return b.build();
  });
}
const barrelGeo = () => memo(geoCache, 'lift-barrel', () => new Builder().box(0.1, 0.1, 1, STEEL_D, 0, -0.05, 0.5).build());
const rodGeo = () => memo(geoCache, 'lift-rod', () => new Builder().box(0.06, 0.06, 1, CHROME, 0, -0.03, 0.5).build());

// boom value 0..1 -> hitch height (tray top): stowed up at the tail .. on the ground
const HITCH_Y0 = 0.95, HITCH_Y1 = 0.065;
/** `setBoom` value at which the cradles hold a car's front tyres at TOW_LIFT (the towing pose). */
export const TOW_BOOM = (HITCH_Y0 - TOW_LIFT) / (HITCH_Y0 - HITCH_Y1);
export { TOW_LIFT };

export function createTowTruck(level = 1) {
  const lv = level >= 2 ? 2 : 1, S = TRUCK[lv - 1], hv = lv === 2;
  const group = new THREE.Group();
  group.add(mesh(truckBodyGeo(lv)));

  // ---- wheels
  const spec = [];
  for (const sx of [-1, 1]) {
    spec.push([sx * S.wx, S.zF, S.r, S.ww, CHROME]);
    spec.push([sx * S.wx, S.zR, S.r, S.ww, CHROME]);
    if (S.dual) spec.push([sx * (S.wx - S.ww - 0.01), S.zR, S.r, S.ww, CHROME]);
  }
  const wheels = addWheels(group, spec);

  // ---- layout numbers shared with the body builder
  const yt = S.roofY, zf = S.cabZ1, zr = S.cabZ0, lbz = (zf + zr) / 2 - 0.02;
  const tbH = S.boxH, deckY = S.deckY;
  const hy = deckY + (hv ? 1.28 : 1.0), hz = hv ? -1.0 : -0.95;

  // ---- lights: glow lenses that switch on with the beacon
  const lensL = mesh(glowBox('bar', 0.52, 0.12, 0.22, AMBER), glowMat, { cast: false });
  const lensR = mesh(glowBox('bar', 0.52, 0.12, 0.22, AMBER), glowMat, { cast: false });
  lensL.position.set(-0.3, yt + 0.12, lbz); lensR.position.set(0.3, yt + 0.12, lbz);
  lensL.scale.setScalar(1.05); lensR.scale.setScalar(1.05);
  group.add(lensL, lensR);
  let lens2 = null;
  if (hv) {
    lens2 = [-1, 1].map((sx) => {
      const m = mesh(glowBox('bar2', 0.4, 0.1, 0.12, AMBER), glowMat, { cast: false });
      m.position.set(sx * 0.24, hy + 0.16, hz - 0.2); m.scale.setScalar(1.05);
      group.add(m); return m;
    });
  }
  const work = [-1, 1].map((sx) => {
    const m = mesh(glowBox('work', 0.16, 0.08, 0.03, 0xfff8dc), glowMat, { cast: false });
    m.position.set(sx * 0.64, deckY + tbH + 0.31, -1.7 - 0.03);
    group.add(m); return m;
  });
  // rotating beacon on the headache rack (the lamp sweeps round)
  const spinner = new THREE.Group();
  spinner.position.set(0, deckY + (hv ? 0.9 : 0.82) + 0.1, S.cabZ0 - 0.1);
  const spinBase = mesh(memo(geoCache, 'beacon-base', () => new Builder().cyl(0.08, 0.1, 0.08, DARK, 0, 0, 0, 8).cyl(0.07, 0.07, 0.1, AMBER_D, 0, 0.08, 0, 8).build()), litMat, { cast: false });
  const spinLamp = mesh(glowBox('spin', 0.07, 0.09, 0.05, AMBER, 0.04, 0.085, 0), glowMat, { cast: false });
  spinner.add(spinBase, spinLamp);
  group.add(spinner);
  const setLenses = (a, b2, c) => {
    lensL.visible = a; lensR.visible = b2;
    if (lens2) { lens2[0].visible = b2; lens2[1].visible = a; }
    spinLamp.visible = c;
  };
  setLenses(false, false, false);
  for (const m of work) m.visible = false;

  // ---- wheel-lift: arm (pivot) > inner sleeve, cradle (world-upright frame), hydraulic cylinder
  const pivot = new THREE.Group();
  pivot.position.set(0, S.pivotY, S.pivotZ);
  const arm = mesh(liftArmGeo(lv)), inner = mesh(liftInnerGeo(lv));
  pivot.add(arm, inner);
  group.add(pivot);
  const cradle = mesh(liftCradleGeo(lv));
  group.add(cradle);
  const barrel = mesh(barrelGeo()), rod = mesh(rodGeo());
  group.add(barrel, rod);
  const hitch = new THREE.Object3D();
  group.add(hitch);
  const anchorY = S.pivotY - 0.22, anchorZ = S.pivotZ + 0.55;
  let boomK = -1;
  function setBoom(k = 0) {
    k = clamp01(k);
    if (k === boomK) return;
    boomK = k;
    const len = lerp(hv ? 0.55 : 0.5, hv ? 0.95 : 0.84, k);
    const hY = lerp(HITCH_Y0, HITCH_Y1, k);
    const sinP = Math.max(-0.95, Math.min(0.9, (S.pivotY - hY - 0.06) / len));
    const phi = Math.asin(sinP), cosP = Math.cos(phi);
    pivot.rotation.x = Math.PI - phi;
    inner.position.z = len - 0.5;
    const ex = S.pivotZ - len * cosP, ey = S.pivotY - len * sinP;           // cross-bar centre
    const psi = (-Math.PI / 2) * (1 - smooth(0.08, 0.5, k));
    cradle.position.set(0, ey, ex);
    cradle.rotation.x = psi;
    const cs = Math.cos(psi), sn = Math.sin(psi);
    hitch.position.set(0, ey + cs * -0.06 - sn * -0.36, ex + sn * -0.06 + cs * -0.36);
    hitch.rotation.x = psi;
    // hydraulic cylinder: frame anchor -> a lug under the arm
    const bz = S.pivotZ - cosP * 0.32 + sinP * 0.1, by = S.pivotY - sinP * 0.32 - cosP * 0.1;
    const dz = bz - anchorZ, dy = by - anchorY, L = Math.hypot(dz, dy), th = -Math.atan2(dy, dz);
    barrel.position.set(0, anchorY, anchorZ); barrel.rotation.x = th; barrel.scale.set(1, 1, L * 0.55);
    rod.position.set(0, anchorY + (dy / L) * L * 0.5, anchorZ + (dz / L) * L * 0.5);
    rod.rotation.x = th; rod.scale.set(1, 1, L * 0.5);
  }
  setBoom(0);

  let beacon = false, bt = 0;
  function setBeacon(on) {
    beacon = !!on;
    for (const m of work) m.visible = beacon;
    if (!beacon) setLenses(false, false, false);
    else { bt = 0; setLenses(true, false, true); }
  }
  function update(dt, speed = 0) {
    spinWheels(wheels, dt, speed);
    if (beacon) {
      bt += dt;
      const ph = Math.sin(bt * 11) > 0;
      setLenses(ph, !ph, true);
      spinner.rotation.y = bt * 9;
    }
  }
  return { group, hitch, setBoom, setBeacon, update, level: lv };
}

// ================================================================ TRAFFIC
// Seven ambient vehicles at the config sizes. Static geometry is one merged mesh per kind; wheels spin; a few parts move
// (bus door leaves, police lights). Doors of the bus are on the right-hand side in the travel direction = local -x.
const TAXI_Y = 0xf6c453, POLICE_W = 0xf4f1ea, VAN_TEAL = 0x2a9d8f, BUS_C = 0xf26b5b, ICE_P = 0xf5a3c0, GARB_G = 0x3c9a5a;

/** Windows of a sedan cab: glass bands on both sides + windscreens. */
function sedanBody(b, { main, roof, L = 2.8, W = 1.46, cabW = 1.3, z0 = -0.95, z1 = 0.55, z2 = 0.2, z3 = -0.62, yb = 0.64, yt = 1.18 }) {
  const hl = L / 2, mainD = shade(main, 0.8);
  b.box(W, yb - 0.22, L, main, 0, 0.22, 0);                                       // lower body
  b.box(W - 0.12, 0.04, 0.8, mainD, 0, yb, hl - 0.5);                               // hood
  b.box(W + 0.02, 0.1, 0.12, TRIM, 0, 0.24, hl - 0.04);                             // bumpers
  b.box(W + 0.02, 0.1, 0.12, TRIM, 0, 0.24, -hl + 0.04);
  for (const sx of [-1, 1]) {
    b.box(0.24, 0.12, 0.05, HEAD, sx * 0.48, 0.46, hl + 0.002);
    b.box(0.22, 0.1, 0.05, TAIL, sx * 0.5, 0.5, -hl - 0.002);
  }
  b.box(0.7, 0.18, 0.04, DARK, 0, 0.4, hl + 0.002);                                 // grille
  sideExtrude(b, [[z0, yb], [z1, yb], [z2, yt], [z3, yt]], cabW, main);
  b.box(cabW - 0.04, 0.05, z2 - z3 + 0.02, roof, 0, yt, (z2 + z3) / 2);
  slab(b, z1 - 0.01, yb + 0.01, z2 + 0.02, yt - 0.02, cabW - 0.16, 0.05, GLASS);   // windscreen
  slab(b, z0 + 0.01, yb + 0.01, z3 - 0.02, yt - 0.02, cabW - 0.16, 0.05, GLASS_D);  // rear window
  for (const sx of [-1, 1]) {
    sideWin(b, z3 + 0.08, z2 - 0.18, yb + 0.1, yt - 0.1, cabW / 2, GLASS);
    b.box(0.02, yt - yb - 0.2, 0.06, main, sx * (cabW / 2 + 0.01), yb + 0.1, (z3 + z2) / 2 - 0.1);   // door pillar
    b.box(0.04, 0.04, 0.14, DARK, sx * (W / 2 + 0.01), yb - 0.1, 0.1);                               // handle
  }
}

function buildTaxi(b) {
  sedanBody(b, { main: TAXI_Y, roof: TAXI_Y });
  // checker band along both sides
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 14; i++) {
      const z = -1.3 + i * 0.2;
      b.box(0.012, 0.07, 0.2, i % 2 ? DARK : WHITE, sx * 0.735, 0.42, z + 0.1);
      b.box(0.012, 0.07, 0.2, i % 2 ? WHITE : DARK, sx * 0.735, 0.49, z + 0.1);
    }
  }
  // roof sign (dark frame; the lit face is a glow mesh)
  b.box(0.56, 0.2, 0.26, DARK, 0, 1.23, -0.2);
  b.box(0.04, 0.08, 0.04, DARK, 0.2, 1.18, -0.2);
}
function buildPolice(b) {
  sedanBody(b, { main: POLICE_W, roof: NAVY });
  for (const sx of [-1, 1]) {
    b.box(0.014, 0.3, 1.9, NAVY, sx * 0.735, 0.26, 0.0);                             // dark lower doors
    b.box(0.014, 0.1, 0.1, YELLOW, sx * 0.737, 0.62, 0.35);                          // badge
    b.box(0.014, 0.05, 0.4, BLUE, sx * 0.737, 0.58, -0.45);
  }
  b.box(1.2, 0.06, 0.04, NAVY, 0, 0.64, 1.25);                                      // hood stripe
  b.box(0.9, 0.08, 0.3, DARK, 0, 1.23, -0.2);                                       // light bar base
  for (const sx of [-1, 1]) b.box(0.4, 0.1, 0.26, sx > 0 ? 0x2a4f9a : 0x9a2a2a, sx * 0.24, 1.3, -0.2);   // dull lenses
}
function buildDelivery(b) {
  const L = 3.4, hl = L / 2, W = 1.56, boxY = 0.3, boxT = 2.0;
  b.box(0.5, 0.14, L - 0.1, DARK, -0.34, 0.22, 0); b.box(0.5, 0.14, L - 0.1, DARK, 0.34, 0.22, 0);
  // cab (front)
  b.box(W, 0.5, 1.1, VAN_TEAL, 0, 0.36, 1.15);                                         // lower cab + hood
  b.box(W, 0.1, 0.1, TRIM, 0, 0.28, hl + 0.0);
  sideExtrude(b, [[0.58, 0.86], [1.62, 0.86], [1.62, 1.0], [1.36, 1.56], [0.58, 1.56]], W - 0.06, VAN_TEAL);
  slab(b, 1.36, 1.54, 1.63, 0.98, W - 0.2, 0.05, GLASS);
  for (const sx of [-1, 1]) {
    sideWin(b, 0.74, 1.3, 1.0, 1.46, (W - 0.06) / 2, GLASS);
    b.box(0.04, 0.04, 0.14, DARK, sx * (W / 2 + 0.0), 0.8, 1.2);
    b.box(0.12, 0.3, 0.04, DARK, sx * (W / 2 + 0.1), 1.1, 1.58);                         // mirror
    b.box(0.24, 0.12, 0.05, HEAD, sx * 0.52, 0.62, hl + 0.002);
  }
  b.box(0.7, 0.2, 0.04, DARK, 0, 0.5, hl + 0.002);
  // cargo box
  const bz0 = -hl, bz1 = 0.56;
  b.box(W, boxT - boxY, bz1 - bz0, CREAM, 0, boxY, (bz0 + bz1) / 2);
  b.box(W + 0.02, 0.07, bz1 - bz0 + 0.02, shade(CREAM, 0.88), 0, boxT, (bz0 + bz1) / 2);   // roof edge
  for (const sx of [-1, 1]) {
    b.box(0.014, 0.3, bz1 - bz0 - 0.1, VAN_TEAL, sx * (W / 2 + 0.006), 0.72, (bz0 + bz1) / 2);   // livery band
    b.box(0.014, 0.34, 0.34, ORANGE, sx * (W / 2 + 0.008), 1.2, -0.7);                            // parcel mark
    b.box(0.014, 0.05, 0.34, shade(ORANGE, 0.7), sx * (W / 2 + 0.01), 1.32, -0.7);
    b.box(0.014, 0.04, 0.34, WHITE, sx * (W / 2 + 0.01), 1.18, -0.7);
  }
  // rear roller door: frame + ribs + handle
  b.box(W - 0.2, boxT - 0.62, 0.04, shade(CREAM, 0.8), 0, 0.5, bz0 - 0.005);
  for (let i = 0; i < 9; i++) b.box(W - 0.26, 0.04, 0.05, shade(CREAM, 0.66), 0, 0.56 + i * 0.145, bz0 - 0.012);
  b.box(0.3, 0.06, 0.06, DARK, 0, 0.62, bz0 - 0.03);
  b.box(W + 0.02, 0.12, 0.1, TRIM, 0, 0.26, bz0 + 0.03);                                 // rear bumper
  for (const sx of [-1, 1]) b.box(0.14, 0.34, 0.05, TAIL, sx * (W / 2 - 0.1), 0.5, bz0 - 0.002);
}
function buildIcecream(b) {
  const L = 3.2, hl = L / 2, W = 1.6, cr = ICE_P;
  b.box(0.5, 0.14, L - 0.1, DARK, -0.34, 0.22, 0); b.box(0.5, 0.14, L - 0.1, DARK, 0.34, 0.22, 0);
  b.box(W, 0.55, 1.0, CREAM, 0, 0.32, hl - 0.5);                                      // hood
  b.box(W, 0.1, 0.1, TRIM, 0, 0.28, hl);
  // van body: cab + serving box in one cream block
  sideExtrude(b, [[-hl, 0.87], [hl - 0.9, 0.87], [hl - 0.9, 0.95], [hl - 1.4, 1.55], [-hl, 1.55]], W - 0.06, CREAM);
  b.box(W - 0.02, 0.06, 1.64, cr, 0, 1.55, -0.8);                                      // pink roof skirt
  b.box(W - 0.1, 0.06, 0.9, CREAM, 0, 1.55, 0.2);
  slab(b, hl - 1.38, 1.52, hl - 0.9, 0.97, W - 0.2, 0.05, GLASS);
  for (const sx of [-1, 1]) {
    b.box(0.04, 0.04, 0.14, DARK, sx * (W / 2), 0.8, hl - 1.0);
    b.box(0.24, 0.12, 0.05, HEAD, sx * 0.52, 0.62, hl + 0.002);
    b.box(0.014, 0.12, L - 0.2, cr, sx * (W / 2 - 0.0 + 0.004), 0.62, 0);                // pink stripe
    b.box(0.014, 0.05, L - 0.2, WHITE, sx * (W / 2 + 0.006), 0.77, 0);
  }
  // serving hatch on the kerb side (local -x): dark opening, counter, striped awning, menu board
  const hx = -(W / 2);
  b.box(0.05, 0.62, 1.0, 0x3a2f2a, hx - 0.002, 0.88, -0.45);                           // opening
  b.box(0.05, 0.62, 0.04, shade(cr, 0.8), hx - 0.01, 0.88, -0.97);
  b.box(0.05, 0.62, 0.04, shade(cr, 0.8), hx - 0.01, 0.88, 0.07);
  b.box(0.2, 0.05, 1.1, WHITE, hx - 0.1, 0.84, -0.45);                                  // counter shelf
  b.box(0.04, 0.5, 0.04, STEEL, hx - 0.18, 0.84 - 0.0, -0.95); b.box(0.04, 0.5, 0.04, STEEL, hx - 0.18, 0.84, 0.05);
  for (let i = 0; i < 6; i++) {                                                         // awning: sloped stripes
    b.box(0.5, 0.04, 0.18, i % 2 ? WHITE : cr, hx - 0.2, 1.52 - 0.04, -0.98 + i * 0.18 + 0.09, 0, 0, 0.35);
  }
  // opposite side: menu board
  b.box(0.02, 0.4, 0.7, 0x2a2f36, W / 2 + 0.006, 0.88, -0.2);
  for (let i = 0; i < 4; i++) b.box(0.02, 0.04, 0.5, i % 2 ? ICE_P : WHITE, W / 2 + 0.014, 1.08 - i * 0.08 + 0.02, -0.2);
  // rear
  b.box(W + 0.02, 0.12, 0.1, TRIM, 0, 0.26, -hl + 0.03);
  for (const sx of [-1, 1]) b.box(0.14, 0.3, 0.05, TAIL, sx * (W / 2 - 0.1), 0.5, -hl - 0.002);
  // big cone on the roof: waffle cone (tip down) + two scoops + cherry, on a little plinth
  b.box(0.7, 0.07, 0.7, STEEL, 0, 1.6, -0.5);
  b.cyl(0.3, 0.04, 0.62, 0xd9a85c, 0, 1.67, -0.5, 8);
  for (let i = 0; i < 5; i++) b.cyl(0.255 - i * 0.045 + 0.012, 0.255 - i * 0.045 + 0.012, 0.025, 0xb8843c, 0, 1.78 + i * 0.1, -0.5, 8);   // waffle bands
  b.cyl(0.3, 0.3, 0.2, ICE_P, 0, 2.29, -0.5, 10);
  b.cyl(0.26, 0.3, 0.16, WHITE, 0, 2.47, -0.5, 10);
  b.cyl(0.16, 0.24, 0.1, ICE_P, 0, 2.63, -0.5, 10);
  b.box(0.1, 0.1, 0.1, RED, 0, 2.73, -0.5);
}
function buildGarbage(b) {
  const L = 4.2, hl = L / 2, W = 1.78;
  b.box(0.54, 0.16, L - 0.1, DARK, -0.36, 0.3, 0); b.box(0.54, 0.16, L - 0.1, DARK, 0.36, 0.3, 0);
  // cab
  b.box(W - 0.06, 0.62, 1.0, GARB_G, 0, 0.5, 1.55);
  b.box(W, 0.14, 0.14, TRIM, 0, 0.36, hl);
  sideExtrude(b, [[0.98, 0.5], [hl - 0.08, 0.5], [hl - 0.08, 1.14], [hl - 0.34, 1.9], [1.0, 1.9]], W - 0.1, GARB_G);
  b.box(W - 0.14, 0.05, 0.86, WHITE, 0, 1.9, 1.5);
  slab(b, hl - 0.34, 1.88, hl - 0.07, 1.16, W - 0.3, 0.05, GLASS);
  b.box(0.8, 0.28, 0.04, DARK, 0, 0.6, hl - 0.06 + 0.002);
  for (const sx of [-1, 1]) {
    sideWin(b, 1.18, 1.72, 1.2, 1.8, (W - 0.1) / 2, GLASS);
    b.box(0.04, 0.04, 0.14, DARK, sx * (W / 2 - 0.04), 1.0, 1.5);
    b.box(0.12, 0.34, 0.04, DARK, sx * (W / 2 + 0.1), 1.3, 2.0);
    b.box(0.24, 0.14, 0.05, HEAD, sx * 0.62, 0.8, hl - 0.06 + 0.002);
  }
  // compactor body: tall box with a rounded top, ribs, tail hopper
  const bz0 = -hl, bz1 = 0.9;
  b.box(W, 1.35, bz1 - bz0, 0x4aa86a, 0, 0.5, (bz0 + bz1) / 2);
  b.box(W - 0.3, 0.2, bz1 - bz0 - 0.1, 0x4aa86a, 0, 1.85, (bz0 + bz1) / 2);
  b.box(W - 0.12, 0.12, bz1 - bz0, shade(GARB_G, 0.85), 0, 2.05, (bz0 + bz1) / 2 - 0.02);
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) b.box(0.016, 1.3, 0.05, shade(GARB_G, 0.78), sx * (W / 2 + 0.006), 0.52, bz0 + 0.5 + i * 0.58);
  for (const sx of [-1, 1]) b.box(0.016, 0.1, bz1 - bz0 - 0.1, WHITE, sx * (W / 2 + 0.008), 1.1, (bz0 + bz1) / 2);   // white band
  // hopper at the back (dark opening) and the bin-lift: arms + comb bar + a tipped wheelie bin
  b.box(W - 0.2, 0.9, 0.5, 0x2d6e44, 0, 0.5, bz0 + 0.0);
  b.box(W - 0.5, 0.5, 0.06, DARK, 0, 0.9, bz0 - 0.26);
  for (const sx of [-1, 1]) {
    beam(b, sx * 0.62, 0.78, bz0 - 0.1, 1.5, bz0 - 0.62, 0.1, 0.1, YELLOW);
    b.box(0.1, 0.26, 0.1, STEEL_D, sx * 0.62, 0.64, bz0 - 0.05);
  }
  b.box(1.2, 0.1, 0.12, STEEL_D, 0, 1.48, bz0 - 0.66);                                // comb bar
  b.box(0.5, 0.5, 0.44, 0x3d6fb6, 0, 1.0, bz0 - 0.9, -0.0, 0, 0);                     // wheelie bin hanging on the comb
  b.box(0.54, 0.06, 0.48, shade(0x3d6fb6, 0.8), 0, 1.5, bz0 - 0.9);
  b.box(1.76, 0.18, 0.18, TRIM, 0, 0.32, bz0 - 0.02);                                   // rear bumper
  for (const sx of [-1, 1]) b.box(0.14, 0.3, 0.05, TAIL, sx * (W / 2 - 0.12), 0.8, bz0 - 0.002);
  // amber beacon on the cab roof
  b.box(0.3, 0.08, 0.2, DARK, 0, 1.95, 1.5);
  b.box(0.22, 0.12, 0.14, AMBER_D, 0, 2.03, 1.5);
}
function buildBus(b) {
  const L = 5.2, hl = L / 2, W = 1.8, hw = W / 2, yb = 0.4, yt = 2.1;
  b.box(W - 0.1, 0.14, L - 0.2, DARK, 0, 0.26, 0);
  b.box(W, 0.74, L, BUS_C, 0, 0.4, 0);                                                // lower body
  b.box(W, 0.12, 0.12, TRIM, 0, 0.28, hl);                                              // bumpers
  b.box(W, 0.12, 0.12, TRIM, 0, 0.28, -hl);
  b.box(W, yt - 1.78, L, BUS_C, 0, 1.78, 0);                                           // upper band above the windows
  b.box(W - 0.18, 0.06, L - 0.3, CREAM, 0, yt, 0);                                      // roof
  b.box(0.8, 0.14, 1.1, STEEL, 0, yt + 0.06, -0.9);                                    // AC unit
  b.box(0.6, 0.08, 0.7, STEEL_D, 0, yt + 0.06, 0.6);
  // window band: glass boxes between pillars along both sides
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = -hl + 0.2 + i * (L - 0.4) / 6;
      if (sx < 0 && z > 1.2 && z < 2.6) continue;                                       // door opening on the kerb side
      b.box(0.02, 0.62, (L - 0.4) / 6 - 0.08, GLASS, sx * (hw + 0.006), 1.14, z + (L - 0.4) / 12);
    }
    b.box(0.014, 0.1, L - 0.1, CREAM, sx * (hw + 0.006), 0.72, 0);                      // cream belt stripe
  }
  // door opening on -x: dark interior with a step; the leaves are separate meshes
  b.box(0.06, 1.38, 0.9, 0x3a2f2a, -hw + 0.0, 0.4, 1.9);
  b.box(0.22, 0.1, 0.94, STEEL_D, -hw - 0.08, 0.3, 1.9);                                  // step
  b.box(0.06, 0.12, 0.96, shade(BUS_C, 0.8), -hw - 0.005, 1.78 - 0.12, 1.9);
  // front + rear glass, destination board, lights
  b.box(W - 0.3, 0.7, 0.04, GLASS, 0, 1.1, hl + 0.002);
  b.box(W - 0.3, 0.5, 0.04, GLASS_D, 0, 1.2, -hl - 0.002);
  b.box(W - 0.4, 0.22, 0.05, DARK, 0, 1.86, hl + 0.003);                                // destination board frame
  b.box(W - 0.4, 0.2, 0.05, DARK, 0, 1.9, -hl - 0.003);
  for (const sx of [-1, 1]) {
    b.box(0.24, 0.14, 0.05, HEAD, sx * 0.62, 0.55, hl + 0.002);
    b.box(0.2, 0.14, 0.05, TAIL, sx * 0.64, 0.6, -hl - 0.002);
    b.box(0.1, 0.4, 0.05, DARK, sx * (hw + 0.1), 1.2, hl - 0.3);                          // mirrors
  }
  b.box(W - 0.2, 0.14, 0.04, DARK, 0, 0.46, hl + 0.002);                                  // front grille
  b.box(0.16, 0.5, 0.02, WHITE, hw + 0.01, 0.55, -0.2);                                    // route number plate on the offside
  b.box(0.16, 0.5, 0.02, WHITE, -hw - 0.01, 0.55, -1.0);
}
const BUS_DOOR = { hz0: 1.45, hz1: 2.35, hx: -0.9 };
function busLeafGeo() {
  return memo(geoCache, 'bus-leaf', () => {
    const b = new Builder();
    // leaf in its hinge frame: hinge at z=0, extends +z 0.45, from y 0.4 to 1.78
    b.box(0.05, 1.38, 0.45, shade(BUS_C, 0.85), 0, 0.4, 0.225);
    b.box(0.06, 0.62, 0.33, GLASS, 0, 1.06, 0.225);
    b.box(0.06, 0.5, 0.33, shade(BUS_C, 0.7), 0, 0.5, 0.225);
    b.box(0.07, 1.38, 0.04, TRIM, 0, 0.4, 0.43);
    return b.build();
  });
}

const TRAFFIC_BUILD = {
  taxi: { build: buildTaxi, wheels: [[0.64, 0.88, 0.27, 0.22], [-0.64, 0.88, 0.27, 0.22], [0.64, -0.88, 0.27, 0.22], [-0.64, -0.88, 0.27, 0.22]] },
  police: { build: buildPolice, wheels: [[0.64, 0.88, 0.27, 0.22], [-0.64, 0.88, 0.27, 0.22], [0.64, -0.88, 0.27, 0.22], [-0.64, -0.88, 0.27, 0.22]] },
  delivery: { build: buildDelivery, wheels: [[0.68, 1.15, 0.3, 0.24], [-0.68, 1.15, 0.3, 0.24], [0.68, -1.05, 0.3, 0.24], [-0.68, -1.05, 0.3, 0.24]] },
  icecream: { build: buildIcecream, wheels: [[0.68, 1.0, 0.3, 0.24], [-0.68, 1.0, 0.3, 0.24], [0.68, -1.0, 0.3, 0.24], [-0.68, -1.0, 0.3, 0.24]] },
  garbage: { build: buildGarbage, wheels: [[0.76, 1.5, 0.38, 0.26], [-0.76, 1.5, 0.38, 0.26], [0.76, -0.75, 0.38, 0.26], [-0.76, -0.75, 0.38, 0.26], [0.76, -1.5, 0.38, 0.26], [-0.76, -1.5, 0.38, 0.26]] },
  bus: { build: buildBus, wheels: [[0.76, 1.75, 0.36, 0.26], [-0.76, 1.75, 0.36, 0.26], [0.76, -1.5, 0.36, 0.26], [-0.76, -1.5, 0.36, 0.26]] },
};

function buildScooter(b) {
  const main = 0x8fd1b0, mainD = shade(main, 0.75), JACKET = 0xf26b5b, PANTS = NAVY, SKIN = 0xf2c9a0;
  // floorboard + legshield + rear body cover
  b.box(0.36, 0.07, 0.56, mainD, 0, 0.2, 0.15);
  b.box(0.34, 0.62, 0.09, main, 0, 0.2, 0.42, -0.18);                                  // leg shield, leaning back
  b.box(0.36, 0.38, 0.56, main, 0, 0.27, -0.45);                                       // rear cover
  b.box(0.34, 0.07, 0.4, shade(main, 1.12), 0, 0.64, -0.52);                           // cover top
  b.box(0.3, 0.09, 0.58, 0x3a2f2a, 0, 0.62, -0.28);                                    // seat
  b.box(0.2, 0.1, 0.05, TAIL, 0, 0.45, -0.74);                                         // tail lamp
  b.box(0.08, 0.08, 0.3, STEEL, -0.16, 0.26, -0.5);                                    // exhaust
  // front end: fork, fender, bars, headlamp
  b.box(0.05, 0.62, 0.05, STEEL_D, -0.1, 0.22, 0.58, -0.28); b.box(0.05, 0.62, 0.05, STEEL_D, 0.1, 0.22, 0.58, -0.28);
  b.box(0.18, 0.05, 0.4, main, 0, 0.46, 0.62);                                         // front fender
  b.box(0.58, 0.05, 0.07, DARK, 0, 0.98, 0.44);                                        // handlebar
  b.box(0.1, 0.1, 0.1, STEEL_D, 0, 0.88, 0.44);
  b.box(0.2, 0.2, 0.12, CHROME, 0, 0.9, 0.52);
  b.box(0.14, 0.14, 0.03, HEAD, 0, 0.93, 0.585);
  for (const sx of [-1, 1]) b.box(0.06, 0.12, 0.06, DARK, sx * 0.2, 1.03, 0.4);             // mirrors
  // rider, seated: legs forward onto the floorboard, back upright, arms to the bars
  const hipY = 0.76, hipZ = -0.34;
  for (const sx of [-1, 1]) {
    beam(b, sx * 0.11, hipY, hipZ, 0.7, 0.12, 0.13, 0.13, PANTS);                         // thigh
    beam(b, sx * 0.11, 0.7, 0.12, 0.3, 0.2, 0.12, 0.12, PANTS);                          // shin
    b.box(0.14, 0.07, 0.24, DARK, sx * 0.12, 0.27, 0.2);                                   // shoe on the floorboard
  }
  b.box(0.36, 0.5, 0.24, JACKET, 0, hipY, hipZ - 0.02, 0.12);                             // torso, leaning a touch forward
  b.box(0.38, 0.06, 0.26, shade(JACKET, 0.8), 0, hipY + 0.44, hipZ + 0.05, 0.12);        // shoulders / collar
  for (const sx of [-1, 1]) {
    beam(b, sx * 0.23, 1.14, hipZ + 0.04, 1.0, 0.4, 0.09, 0.09, JACKET);                  // arm to the bar
    b.box(0.09, 0.09, 0.09, SKIN, sx * 0.25, 0.96, 0.44);                                // hand on the grip
  }
  b.box(0.22, 0.2, 0.22, SKIN, 0, 1.2, hipZ + 0.1);                                      // head
  b.box(0.28, 0.2, 0.28, CREAM, 0, 1.28, hipZ + 0.08);                                    // helmet
  b.box(0.3, 0.05, 0.3, shade(CREAM, 0.85), 0, 1.4, hipZ + 0.08);
  b.box(0.2, 0.08, 0.04, GLASS_D, 0, 1.24, hipZ + 0.24);                                 // visor
}
TRAFFIC_BUILD.scooter = { build: buildScooter, wheels: [[0, 0.62, 0.23, 0.12], [0, -0.55, 0.23, 0.12]] };

const lensMesh = (key, w, h, d, color, x, y, z) => {
  const m = mesh(glowBox(key, w, h, d, color), glowMat, { cast: false });
  m.position.set(x, y, z);
  return m;
};

export function createTrafficVehicle(kind = 'taxi') {
  const spec = TRAFFIC_BUILD[kind] ?? TRAFFIC_BUILD.taxi;
  if (!TRAFFIC_BUILD[kind]) kind = 'taxi';
  const group = new THREE.Group();
  group.add(mesh(memo(geoCache, `traffic|${kind}`, () => { const b = new Builder(); spec.build(b); return b.build(); })));
  const wheels = addWheels(group, spec.wheels.map(([x, z, r, w]) => [x, z, r, w, kind === 'garbage' ? STEEL : kind === 'scooter' ? CHROME : CHROME]));
  let extra = null;
  let setDoors = null;

  if (kind === 'taxi') {
    group.add(lensMesh('taxi-sign-f', 0.5, 0.12, 0.02, 0xfff2a8, 0, 1.27, -0.2 + 0.135));
    group.add(lensMesh('taxi-sign-f', 0.5, 0.12, 0.02, 0xfff2a8, 0, 1.27, -0.2 - 0.135));
  } else if (kind === 'police') {
    const red = lensMesh('pol-r', 0.4, 0.1, 0.26, 0xff4a3d, -0.24, 1.3, -0.2);
    const blue = lensMesh('pol-b', 0.4, 0.1, 0.26, 0x4d8dff, 0.24, 1.3, -0.2);
    red.scale.setScalar(1.04); blue.scale.setScalar(1.04);
    group.add(red, blue);
    let t = 0, siren = true;
    extra = (dt) => {
      if (!siren) { red.visible = blue.visible = false; return; }
      t += dt;
      const p = (t * 2.6) % 1;
      red.visible = p < 0.14 || (p > 0.22 && p < 0.36);
      blue.visible = (p > 0.5 && p < 0.64) || (p > 0.72 && p < 0.86);
    };
    group.userData.setSiren = (on) => { siren = !!on; };
  } else if (kind === 'garbage') {
    const lamp = lensMesh('garb', 0.22, 0.12, 0.14, AMBER, 0, 2.03, 1.5);
    lamp.scale.setScalar(1.05);
    group.add(lamp);
    let t = 0;
    extra = (dt) => { t += dt; lamp.visible = Math.sin(t * 9) > 0; };
  } else if (kind === 'bus') {
    const mk = (z) => {
      const m = mesh(busLeafGeo());
      const g = new THREE.Group();
      g.position.set(BUS_DOOR.hx - 0.02, 0, z);
      g.add(m); group.add(g);
      return g;
    };
    const a = mk(BUS_DOOR.hz0), c = mk(BUS_DOOR.hz1);
    // destination boards (amber dot-matrix style: segments of glow)
    const board = new Builder();
    for (let i = 0; i < 6; i++) board.box(0.2, 0.07, 0.01, i % 3 === 1 ? 0xfff2a8 : AMBER, -0.55 + i * 0.22, 0, 0);
    const bg = memo(geoCache, 'bus-board', () => board.build());
    const bf = mesh(bg, glowMat, { cast: false }); bf.position.set(0, 1.89, 2.6 + 0.032);
    const br = mesh(bg, glowMat, { cast: false }); br.position.set(0, 1.93, -2.6 - 0.032); br.rotation.y = Math.PI;
    group.add(bf, br);
    let target = 0, k = 0;
    const apply = () => {
      const e = k * k * (3 - 2 * k);
      a.rotation.y = -(Math.PI / 2) * 0.96 * e;
      c.rotation.y = Math.PI + (Math.PI / 2) * 0.96 * e;
    };
    apply();
    setDoors = (on) => { target = on ? 1 : 0; };
    extra = (dt) => {
      if (k === target) return;
      k += Math.sign(target - k) * Math.min(Math.abs(target - k), dt * 2.2);
      apply();
    };
  }
  function update(dt, speed = 0) {
    spinWheels(wheels, dt, speed);
    if (extra) extra(dt);
  }
  return { group, update, setDoors: setDoors ?? (() => {}), kind, setSiren: group.userData.setSiren };
}

// ================================================================ FERRY
// A small roll-on car ferry. Local frame: bow +z, stern -z, centre x = 0; the deck top is y = 0.3, the waterline is
// y = -0.4 (the env water plane sits at WATER_Y = -0.4 when the group is placed at y = 0), the quay top is y = 0.
// The ramp hinges at the stern edge of the deck (0, 0.3, -5.5) and runs out along -z: setRamp(1) lowers its tip to
// y = 0 at local z = -5.5 - RAMP_LEN * cos(angle); setRamp(0) stands it up as a barrier.
const FERRY_L = 11, FERRY_W = 5.2, DECK_Y = 0.3, WATER = -0.4, RAMP_LEN = 1.4, RAMP_W = 3.5;
const RAMP_DOWN = -Math.asin(DECK_Y / RAMP_LEN), RAMP_UP = (Math.PI / 180) * 72;
const RAMP_TIP_Z = -FERRY_L / 2 - RAMP_LEN * Math.cos(RAMP_DOWN);
/** Where gameplay puts the ferry so that its lowered ramp lands on the quay at the ferry plaza (x >= 50.5). */
export const FERRY_DOCK = { x: 50.8 - 5.5 - RAMP_LEN * Math.cos(RAMP_DOWN) + 5.5 - 0.0, z: 20.3, yaw: -Math.PI / 2, quayTipX: 50.8 };
FERRY_DOCK.x = 50.8 - (-RAMP_TIP_Z);          // tip (local z = RAMP_TIP_Z) -> world x = fx - RAMP_TIP_Z

function hullPts(inset = 0, sz = 1) {
  const hw = FERRY_W / 2 - inset, hl = FERRY_L / 2 - inset;
  const P = [[-hw, -hl], [hw, -hl], [hw, hl - 3.0], [hw * 0.55, hl - 0.6], [0.5, hl], [-0.5, hl], [-hw * 0.55, hl - 0.6], [-hw, hl - 3.0]];
  return P.map(([x, z]) => [x, -z * sz]);
}
function hullLayer(b, inset, y0, h, color) { b.shape(polygon(hullPts(inset)), h, color, 0, y0, 0, -Math.PI / 2); }
function wall(b, x1, z1, x2, z2, h, t, y0, color) {
  const dx = x2 - x1, dz = z2 - z1;
  b.box(t, h, Math.hypot(dx, dz), color, (x1 + x2) / 2, y0, (z1 + z2) / 2, 0, Math.atan2(dx, dz), 0);
}
function ring(b, x, y, z, ry) {   // life ring on a wall (faces +/- x when ry = PI/2): orange torus with white quarters
  const g = new THREE.TorusGeometry(0.19, 0.055, 5, 12);
  b._add(g, 0xee8c3a, x, y, z, 0, ry, 0);
  const c = Math.cos(ry), sn = Math.sin(ry);
  for (const [ox, oy] of [[0.19, 0], [-0.19, 0], [0, 0.19], [0, -0.19]]) {
    b.box(0.07 * (ox ? 1 : 1.5), 0.07 * (oy ? 1 : 1.5), 0.075, WHITE, x + ox * c, y + oy - 0.0, z - ox * sn, 0, ry, 0);
  }
}
function ferryHullGeo() {
  return memo(geoCache, 'ferry-hull', () => {
    const b = new Builder();
    const hl = FERRY_L / 2, hw = FERRY_W / 2;
    hullLayer(b, 0.12, -0.95, 0.56, 0x8c2f2a);                      // below the waterline
    hullLayer(b, 0.0, WATER, DECK_Y - WATER, NAVY);                   // topsides
    hullLayer(b, 0.1, DECK_Y, 0.025, 0x7d8a92);                       // deck plating
    // coral sheer stripe + white waterline foam ring
    hullLayer(b, -0.012, -0.05, 0.1, 0xf26b5b);
    hullLayer(b, -0.03, WATER - 0.02, 0.06, 0xe8f6f8);
    // bulwark on the sides and round the bow (the stern stays open for the ramp)
    const P = hullPts(0.05).map(([x, nz]) => [x, -nz]);
    const bh = 0.3;
    wall(b, P[1][0], P[1][1], P[2][0], P[2][1], bh, 0.1, DECK_Y, NAVY);
    wall(b, P[0][0], P[0][1], P[7][0], P[7][1], bh, 0.1, DECK_Y, NAVY);
    for (let i = 2; i < 7; i++) wall(b, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], bh, 0.1, DECK_Y, NAVY);
    // rail on top of the bulwark: posts + a rail, same path
    const posts = [];
    const seg = (a, c) => { const n = Math.max(1, Math.round(Math.hypot(c[0] - a[0], c[1] - a[1]) / 0.9)); for (let i = 0; i <= n; i++) posts.push([lerp(a[0], c[0], i / n), lerp(a[1], c[1], i / n)]); };
    seg(P[1], P[2]); seg(P[0], P[7]);
    for (let i = 2; i < 7; i++) seg(P[i], P[i + 1]);
    for (const [x, z] of posts) b.box(0.05, 0.42, 0.05, CHROME, x, DECK_Y + bh, z);
    const rail = (a, c) => wall(b, a[0], a[1], c[0], c[1], 0.05, 0.05, DECK_Y + bh + 0.36, CHROME);
    rail(P[1], P[2]); rail(P[0], P[7]);
    for (let i = 2; i < 7; i++) rail(P[i], P[i + 1]);
    for (const [a, c] of [[P[1], P[2]], [P[0], P[7]]]) wall(b, a[0], a[1], c[0], c[1], 0.04, 0.04, DECK_Y + bh + 0.18, CHROME);
    // rubber fenders hung on the hull sides
    for (const sx of [-1, 1]) for (const z of [-4.5, -3.6, 1.2]) b.cyl(0.11, 0.11, 0.55, RUBBER, sx * (hw + 0.05), -0.25, z, 8);
    // deck markings: 4 car slots (two lanes) + centre line, and a bay stripe at the bow
    for (const sx of [-1, 1]) for (const z of [-4.9, -1.9, 1.1]) b.box(1.7, 0.01, 0.07, 0xf3ecd8, sx * 0.98, DECK_Y + 0.025, z);
    for (const sx of [-1, 1]) b.box(0.07, 0.01, 6.0, 0xf3ecd8, sx * 1.83, DECK_Y + 0.025, -1.9);
    b.box(0.07, 0.01, 6.0, YELLOW, 0, DECK_Y + 0.025, -1.9);
    for (let i = 0; i < 8; i++) b.box(0.4, 0.01, 0.2, i % 2 ? DARK : YELLOW, -1.4 + i * 0.4 + 0.2, DECK_Y + 0.026, -5.35);   // stern edge hazard stripe
    // bollards + anchor at the bow
    for (const sx of [-1, 1]) { b.cyl(0.09, 0.09, 0.26, DARK, sx * 2.1, DECK_Y, -4.8, 8); b.cyl(0.14, 0.09, 0.05, DARK, sx * 2.1, DECK_Y + 0.26, -4.8, 8); }
    b.box(0.6, 0.18, 0.6, STEEL_D, 0, DECK_Y, hl - 0.9);                                      // windlass
    discX(b, 0.12, 0.5, STEEL, 0, DECK_Y + 0.3, hl - 0.9, 8);
    // anchor lying on the foredeck: shank, stock, arms
    const ax = 1.0, az = hl - 1.0;
    b.box(0.07, 0.07, 0.8, 0x4a4f57, ax, DECK_Y + 0.02, az);
    b.box(0.4, 0.06, 0.06, 0x4a4f57, ax, DECK_Y + 0.07, az + 0.34);
    b.box(0.46, 0.06, 0.08, 0x4a4f57, ax, DECK_Y + 0.02, az - 0.36);
    b.box(0.1, 0.08, 0.22, 0x4a4f57, ax - 0.22, DECK_Y + 0.02, az - 0.28); b.box(0.1, 0.08, 0.22, 0x4a4f57, ax + 0.22, DECK_Y + 0.02, az - 0.28);
    // ---- passenger lounge + wheelhouse at the bow end (cars use the stern 2/3 of the deck)
    const lz0 = 1.65, lz1 = 3.75, lw = 4.2, ly = DECK_Y;
    b.box(lw, 1.15, lz1 - lz0, CREAM, 0, ly, (lz0 + lz1) / 2);
    b.box(lw + 0.2, 0.08, lz1 - lz0 + 0.2, NAVY, 0, ly + 1.15, (lz0 + lz1) / 2);               // roof
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) b.box(0.02, 0.45, 0.4, GLASS, sx * (lw / 2 + 0.008), ly + 0.5, lz0 + 0.1 + i * 0.5);
      b.box(0.02, 0.06, lz1 - lz0, 0xf26b5b, sx * (lw / 2 + 0.008), ly + 0.2, (lz0 + lz1) / 2);   // coral side stripe
    }
    for (let i = 0; i < 6; i++) b.box(0.5, 0.45, 0.02, GLASS, -1.5 + i * 0.6, ly + 0.5, lz0 - 0.008);   // stern-facing windows (look onto the deck)
    b.box(lw - 0.4, 0.45, 0.02, GLASS, 0, ly + 0.5, lz1 + 0.008);
    // wheelhouse
    const wz0 = 2.3, wz1 = 3.6, ww = 3.0, wy = ly + 1.23;
    b.box(ww, 0.9, wz1 - wz0, CREAM, 0, wy, (wz0 + wz1) / 2);
    b.box(ww + 0.24, 0.08, wz1 - wz0 + 0.3, NAVY, 0, wy + 0.9, (wz0 + wz1) / 2 + 0.05);      // roof with a deep brow
    b.box(ww - 0.2, 0.46, 0.04, GLASS, 0, wy + 0.3, wz1 + 0.005);                               // front glass
    b.box(ww - 0.2, 0.46, 0.04, GLASS_D, 0, wy + 0.3, wz0 - 0.005);
    for (const sx of [-1, 1]) {
      b.box(0.04, 0.46, wz1 - wz0 - 0.2, GLASS, sx * (ww / 2 + 0.005), wy + 0.3, (wz0 + wz1) / 2);
      b.box(0.3, 0.08, 0.8, 0xf26b5b, sx * (ww / 2 + 0.1), wy + 0.3, (wz0 + wz1) / 2);         // bridge wing
    }
    for (const sx of [-1, 1]) for (const sz of [wz0 + 0.06, wz1 - 0.06]) b.box(0.08, 0.5, 0.08, NAVY, sx * (ww / 2 - 0.02), wy + 0.28, sz);   // corner posts
    // funnel (coral, navy band, cream band) behind the wheelhouse, plus a mast with the radar bar base
    b.cyl(0.36, 0.4, 0.8, 0xf26b5b, 0, ly + 1.23, 1.98, 10);
    b.cyl(0.37, 0.37, 0.16, NAVY, 0, ly + 1.95, 1.98, 10);
    b.cyl(0.38, 0.38, 0.06, CREAM, 0, ly + 1.86, 1.98, 10);
    b.cyl(0.3, 0.3, 0.03, DARK, 0, ly + 2.11, 1.98, 10);
    b.box(0.07, 0.8, 0.07, STEEL, 0, wy + 0.98, 3.0);
    b.box(0.5, 0.05, 0.05, STEEL, 0, wy + 1.4, 3.0);
    b.box(0.24, 0.1, 0.1, DARK, -0.8, wy + 0.98, wz1 - 0.2);                                    // searchlight
    // life rings on the lounge sides and the wheelhouse rear, ladders
    for (const sx of [-1, 1]) { ring(b, sx * (lw / 2 + 0.07), ly + 0.8, lz0 + 1.1, Math.PI / 2); ring(b, sx * (lw / 2 + 0.07), ly + 0.8, lz0 + 1.9, Math.PI / 2); }
    ring(b, 0, ly + 1.55, wz0 - 0.07, 0);
    // life raft canisters on the lounge roof
    for (const sx of [-1, 1]) b.cyl(0.2, 0.2, 0.7, 0xee8c3a, sx * 1.4, ly + 1.3, 2.1, 8, 0, 0, Math.PI / 2);
    return b.build();
  });
}
function rampGeo() {
  return memo(geoCache, 'ferry-ramp', () => {
    const b = new Builder();
    // hinge frame at the origin, ramp runs along -z, top surface at y = 0.. 0.06
    b.box(RAMP_W, 0.08, RAMP_LEN, 0x7d8a92, 0, -0.08, -RAMP_LEN / 2);
    for (const sx of [-1, 1]) b.box(0.08, 0.14, RAMP_LEN, NAVY, sx * (RAMP_W / 2 - 0.04), -0.08, -RAMP_LEN / 2);
    for (let i = 0; i < 6; i++) b.box(RAMP_W - 0.2, 0.012, 0.05, 0x626d75, 0, 0.002, -0.15 - i * 0.2);   // anti-slip ribs
    for (let i = 0; i < 7; i++) b.box(0.4, 0.014, 0.16, i % 2 ? DARK : YELLOW, -1.2 + i * 0.4, 0.002, -RAMP_LEN + 0.1);   // tip stripe
    b.box(RAMP_W, 0.06, 0.1, STEEL_D, 0, -0.1, -RAMP_LEN + 0.03);                                // lip
    for (const sx of [-1, 1]) discX(b, 0.07, 0.3, STEEL, sx * (RAMP_W / 2 - 0.3), -0.04, 0, 8);   // hinge knuckles
    // lift chains hang from the ramp corners (short stubs), shown always
    return b.build();
  });
}
function hullNamePlane(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 80;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 80);
  g.font = '900 56px "Fredoka", "Arial Rounded MT Bold", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#f6ecd8';
  g.fillText(text, 256, 44);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
}
let nameMat = null;

export function createFerry() {
  const group = new THREE.Group();
  const ship = new THREE.Group();            // bobs and rolls; the outer group belongs to gameplay
  group.add(ship);
  ship.add(mesh(ferryHullGeo()));
  // name on both sides of the bulwark: HARBOR HOPPER
  if (!nameMat && typeof document !== 'undefined') nameMat = hullNamePlane('HARBOR HOPPER');
  if (nameMat) {
    const pg = memo(geoCache, 'ferry-name', () => new THREE.PlaneGeometry(2.8, 0.44));
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(pg, nameMat);
      m.position.set(sx * (FERRY_W / 2 + 0.012), 0.06, -0.8);
      m.rotation.y = sx * Math.PI / 2;
      ship.add(m);
    }
  }
  // radar bar (turns)
  const radar = mesh(memo(geoCache, 'ferry-radar', () => new Builder().box(0.9, 0.06, 0.08, STEEL, 0, 0, 0).box(0.1, 0.08, 0.1, DARK, 0, -0.06, 0).build()), litMat, { cast: false });
  radar.position.set(0, DECK_Y + 1.23 + 0.9 + 1.45, 3.0);
  ship.add(radar);
  // navigation lamps: green starboard, red port (glow); masthead lamp
  const lamp = (key, color, x, y, z) => { const m = mesh(glowBox(key, 0.1, 0.1, 0.1, color), glowMat, { cast: false }); m.position.set(x, y, z); ship.add(m); return m; };
  lamp('nav-g', 0x58e07a, 1.58, DECK_Y + 2.3, 3.2); lamp('nav-r', 0xff5a4d, -1.58, DECK_Y + 2.3, 3.2);
  // ramp
  const ramp = new THREE.Group();
  ramp.position.set(0, DECK_Y, -FERRY_L / 2);
  ramp.add(mesh(rampGeo()));
  ship.add(ramp);
  let rampK = -1;
  function setRamp(k = 0) {
    k = clamp01(k);
    if (k === rampK) return;
    rampK = k;
    const e = k * k * (3 - 2 * k);
    ramp.rotation.x = lerp(RAMP_UP, RAMP_DOWN, e);
  }
  setRamp(0);
  function update(dt, t = 0) {
    ship.position.y = Math.sin(t * 1.25) * 0.035 + Math.sin(t * 2.1 + 1.3) * 0.012;
    ship.rotation.z = Math.sin(t * 0.85 + 0.6) * 0.011;          // roll
    ship.rotation.x = Math.sin(t * 0.7 + 1.9) * 0.006;           // pitch
    radar.rotation.y = t * 1.8;
  }
  update(0, 0);
  return { group, setRamp, update, ramp: { tipLocal: new THREE.Vector3(0, 0, RAMP_TIP_Z), width: RAMP_W }, dock: FERRY_DOCK, deckY: DECK_Y };
}
