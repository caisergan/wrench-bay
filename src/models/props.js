// Garage props: parts, part stations, lift, cash, pads, zone ring and the decorative unlockables.
// Every rigid piece is one merged vertex-coloured mesh (voxel.js Builder) cached per kind; moving bits (lift arms,
// pump handle, hoist chain, mixer can, blinking LEDs) are separate small meshes sharing materials.
import * as THREE from 'three';
import { PALETTE as P } from '../config.js';
import { Builder, litMat, memo, mesh, roundedRect } from './voxel.js';

export const PART_H = 0.26;    // vertical spacing when parts are stacked
export const CASH_H = 0.09;    // vertical spacing when cash bundles are stacked
export const LIFT_RISE = 0.9;  // how far a car goes up at setHeight(1)

const CREAM = 0xf6ecd8;
const NAVY = P.wall;
const NAVY_D = 0x22384a;
const CORAL = P.wallTrim;
const MUSTARD = P.accent;
const TEAL = P.teal;
const STEEL = 0xb9c4cc;
const STEEL_D = 0x8a98a2;
const RUBBER = 0x2b2f36;
const RUBBER_L = 0x3d4450;
const TRIM = 0x3d434c;
const CHROME = 0xdfe4e6;
const DARK = 0x1f2329;
const R90 = Math.PI / 2;

const geoCache = new Map();
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitBoxL = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0);   // origin at the left edge

// ---------------------------------------------------------------- shared helpers
/** Upright tyre facing +z, centre (x, y, z). */
function tireZ(b, x, y, z, r, w, rim = CHROME) {
  b.cyl(r, r, w, RUBBER, x, y - w / 2, z, 12, R90);
  b.cyl(r * 0.9, r * 0.9, w + 0.012, RUBBER_L, x, y - (w + 0.012) / 2, z, 12, R90);
  b.cyl(r * 0.56, r * 0.56, w + 0.024, rim, x, y - (w + 0.024) / 2, z, 10, R90);
  b.cyl(r * 0.2, r * 0.2, w + 0.036, TRIM, x, y - (w + 0.036) / 2, z, 8, R90);
}
/** Upright tyre facing +x, centre (x, y, z). */
function tireX(b, x, y, z, r, w, rim = CHROME) {
  b.cyl(r, r, w, RUBBER, x, y - w / 2, z, 12, 0, 0, R90);
  b.cyl(r * 0.9, r * 0.9, w + 0.012, RUBBER_L, x, y - (w + 0.012) / 2, z, 12, 0, 0, R90);
  b.cyl(r * 0.56, r * 0.56, w + 0.024, rim, x, y - (w + 0.024) / 2, z, 10, 0, 0, R90);
  b.cyl(r * 0.2, r * 0.2, w + 0.036, TRIM, x, y - (w + 0.036) / 2, z, 8, 0, 0, R90);
}
/** Tyre lying flat, bottom at y. */
function tireFlat(b, x, y, z, r, h, rim = CHROME) {
  b.cyl(r, r, h, RUBBER, x, y, z, 12);
  b.cyl(r * 0.9, r * 0.9, h + 0.012, RUBBER_L, x, y - 0.006, z, 12);
  b.cyl(r * 0.56, r * 0.56, h + 0.02, rim, x, y - 0.01, z, 10);
  b.cyl(r * 0.2, r * 0.2, h + 0.03, TRIM, x, y - 0.015, z, 8);
}
function drum(b, x, z, h, color, band = NAVY_D, r = 0.28) {
  b.cyl(r, r, h, color, x, 0, z, 12);
  for (const k of [0.04, 0.33, 0.66]) b.cyl(r + 0.015, r + 0.015, 0.04, band, x, h * k + 0.02, z, 12);
  b.cyl(r - 0.02, r - 0.02, 0.02, band, x, h, z, 12);                    // lid
  b.cyl(0.04, 0.04, 0.04, 0xdfe4e6, x + r * 0.5, h, z - r * 0.3, 6);    // bung
}
/** Front pickup counter shared by every station (parts stack on its top). */
function counter(b, body, top, trim) {
  b.box(1.0, 0.64, 0.5, body, 0, 0, 0.32);
  b.box(1.02, 0.07, 0.52, NAVY_D, 0, 0, 0.32);                           // kick plate
  b.box(1.06, 0.04, 0.56, trim, 0, 0.62, 0.32);
  b.box(1.06, 0.06, 0.56, top, 0, 0.66, 0.32);
  b.box(0.86, 0.14, 0.02, NAVY_D, 0, 0.3, 0.575);                        // progress track
  b.box(0.9, 0.025, 0.025, trim, 0, 0.45, 0.578);
}

// ---------------------------------------------------------------- parts (fit 0.5 x PART_H x 0.5)
function partGeo(type) {
  return memo(geoCache, `part|${type}`, () => {
    const b = new Builder();
    if (type === 'tire') {
      b.cyl(0.235, 0.235, 0.21, RUBBER, 0, 0, 0, 14);
      for (let i = 0; i < 14; i++) {                                     // tread blocks
        const a = (i / 14) * Math.PI * 2;
        b.box(0.05, 0.15, 0.06, 0x434b57, Math.sin(a) * 0.232, 0.03, Math.cos(a) * 0.232, 0, a, 0);
      }
      b.cyl(0.2, 0.2, 0.216, RUBBER_L, 0, -0.003, 0, 14);
      b.cyl(0.13, 0.13, 0.222, CHROME, 0, -0.006, 0, 10);                // rim
      b.box(0.2, 0.226, 0.04, 0xaab4bb, 0, -0.008, 0);
      b.box(0.04, 0.226, 0.2, 0xaab4bb, 0, -0.008, 0);
      b.cyl(0.05, 0.05, 0.23, TRIM, 0, -0.01, 0, 8);
    } else if (type === 'oil') {
      const Y = 0xf6c453, YD = 0xd9a23a;
      b.box(0.36, 0.2, 0.26, Y, 0, 0, 0);
      b.box(0.32, 0.02, 0.22, YD, 0, 0.2, 0);
      b.box(0.08, 0.05, 0.08, YD, 0.1, 0.2, 0.0);                       // neck
      b.box(0.09, 0.03, 0.09, CORAL, 0.1, 0.24, 0.0);                   // cap
      b.box(0.035, 0.06, 0.035, YD, -0.15, 0.2, 0);                     // handle
      b.box(0.035, 0.06, 0.035, YD, -0.03, 0.2, 0);
      b.box(0.155, 0.03, 0.05, YD, -0.09, 0.25, 0);
      b.box(0.22, 0.12, 0.012, NAVY, 0, 0.045, 0.13);                   // label + drop
      b.box(0.05, 0.05, 0.014, CREAM, 0, 0.065, 0.132);
      b.box(0.028, 0.03, 0.014, CREAM, 0, 0.11, 0.132);
      b.box(0.012, 0.12, 0.22, NAVY, 0.181, 0.045, 0);
    } else if (type === 'battery') {
      const B = 0x4f9bd9, BD = 0x2f6aa0;
      b.box(0.42, 0.17, 0.28, B, 0, 0, 0);
      b.box(0.43, 0.035, 0.29, BD, 0, 0.17, 0);
      b.cyl(0.035, 0.04, 0.045, 0xd94848, -0.13, 0.205, 0.0, 8);         // + terminal
      b.cyl(0.035, 0.04, 0.045, DARK, 0.13, 0.205, 0.0, 8);              // - terminal
      b.box(0.06, 0.012, 0.02, CREAM, -0.13, 0.205, 0.09);
      b.box(0.26, 0.1, 0.012, CREAM, 0, 0.035, 0.141);                  // label with bolt
      b.box(0.04, 0.05, 0.014, MUSTARD, 0.012, 0.06, 0.143, 0, 0, 0.5);
      b.box(0.04, 0.05, 0.014, MUSTARD, -0.012, 0.09, 0.143, 0, 0, 0.5);
    } else if (type === 'engine') {
      const C = CORAL, CD = 0xd24f40;
      // big gear
      b.cyl(0.19, 0.19, 0.11, C, 0, 0, 0, 12);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.box(0.075, 0.11, 0.075, C, Math.sin(a) * 0.205, 0, Math.cos(a) * 0.205, 0, a, 0);
      }
      b.cyl(0.07, 0.07, 0.12, STEEL, 0, 0, 0, 8);
      // small gear on top, offset
      b.cyl(0.11, 0.11, 0.1, CD, 0.06, 0.11, -0.04, 10);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        b.box(0.06, 0.1, 0.06, CD, 0.06 + Math.sin(a) * 0.12, 0.11, -0.04 + Math.cos(a) * 0.12, 0, a, 0);
      }
      b.cyl(0.04, 0.04, 0.13, CHROME, 0.06, 0.11, -0.04, 8);
      b.box(0.1, 0.05, 0.06, STEEL_D, -0.13, 0.11, 0.1);                 // bolt
    } else if (type === 'paint') {
      const L = 0x9b8fd4, LD = 0x7c70b8;
      b.cyl(0.18, 0.18, 0.21, L, 0, 0, 0, 12);
      b.cyl(0.185, 0.185, 0.04, STEEL, 0, 0, 0, 12);
      b.cyl(0.185, 0.185, 0.03, STEEL, 0, 0.19, 0, 12);
      b.cyl(0.15, 0.15, 0.012, STEEL_D, 0, 0.215, 0, 12);                // lid
      b.cyl(0.11, 0.11, 0.014, L, 0, 0.218, 0, 10);                      // paint swatch on the lid
      b.box(0.06, 0.08, 0.03, LD, 0.06, 0.15, 0.17);                     // drip over the rim
      b.box(0.04, 0.06, 0.03, LD, 0.06, 0.1, 0.17);
      b.box(0.012, 0.012, 0.37, TRIM, 0, 0.25, 0, 0, 0, 0);              // wire handle
      b.box(0.012, 0.04, 0.012, TRIM, 0, 0.21, 0.18);
      b.box(0.012, 0.04, 0.012, TRIM, 0, 0.21, -0.18);
      // label band with colour dots
      b.box(0.2, 0.07, 0.03, CREAM, 0, 0.07, 0.165);
      b.box(0.045, 0.04, 0.02, CORAL, -0.06, 0.085, 0.18);
      b.box(0.045, 0.04, 0.02, TEAL, 0.0, 0.085, 0.183);
      b.box(0.045, 0.04, 0.02, MUSTARD, 0.06, 0.085, 0.18);
    } else {
      b.box(0.4, 0.22, 0.4, 0xffffff, 0, 0, 0);
    }
    return b.build();
  });
}
export function createPart(type) {
  return mesh(partGeo(type));
}

// ---------------------------------------------------------------- cash
function cashGeo() {
  return memo(geoCache, 'cash', () => {
    const b = new Builder();
    b.box(0.42, CASH_H, 0.26, P.cash, 0, 0, 0);
    b.box(0.38, 0.012, 0.22, 0x8bdc92, 0, CASH_H, 0);
    b.box(0.43, CASH_H - 0.01, 0.01, P.cashDark, 0, 0.005, 0.13);
    b.box(0.1, CASH_H + 0.012, 0.275, 0xe6f4d8, 0, 0, 0);
    return b.build();
  });
}
export function createCashStack() {
  return mesh(cashGeo());
}

// ---------------------------------------------------------------- part stations
const fillMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
const ledOn = {
  green: new THREE.MeshBasicMaterial({ color: 0x7dffa0 }),
  red: new THREE.MeshBasicMaterial({ color: 0xff5a4a }),
  amber: new THREE.MeshBasicMaterial({ color: 0xffc24a }),
};
const ledOff = new THREE.MeshLambertMaterial({ color: 0x2a3a40 });

function stationGeo(type) {
  return memo(geoCache, `station|${type}`, () => {
    const b = new Builder();
    if (type === 'tire') {
      counter(b, NAVY, STEEL, TEAL);
      // tall teal rack against the wall, two shelves of upright tyres
      const F = TEAL, FD = 0x1f7a6f;
      for (const x of [-1.04, 0, 1.04]) for (const z of [-0.56, -0.12]) b.box(0.07, 1.9, 0.07, F, x, 0, z);
      for (const y of [0.06, 0.82, 1.52]) {
        b.box(2.14, 0.05, 0.5, FD, 0, y, -0.34);
        b.box(2.14, 0.05, 0.05, MUSTARD, 0, y + 0.05, -0.1);
      }
      b.box(2.16, 0.08, 0.52, F, 0, 1.9, -0.34);
      for (const x of [-0.78, -0.27, 0.27, 0.78]) tireZ(b, x, 0.82 + 0.1 + 0.27, -0.33, 0.27, 0.2);
      for (const x of [-0.8, 0.8]) tireZ(b, x, 0.11 + 0.27, -0.33, 0.27, 0.2);
      tireFlat(b, -0.55, 1.57, -0.34, 0.24, 0.14);                          // spares on top
      tireFlat(b, -0.55, 1.71, -0.34, 0.24, 0.14);
      tireFlat(b, 0.62, 1.57, -0.34, 0.24, 0.14);
      // flat stack on the left front + balancer pedestal on the right
      tireFlat(b, -0.82, 0, 0.3, 0.24, 0.17);
      tireFlat(b, -0.82, 0.17, 0.3, 0.24, 0.17);
      tireFlat(b, -0.82, 0.34, 0.3, 0.24, 0.17);
      b.box(0.3, 0.62, 0.34, CORAL, 0.86, 0, 0.3);
      b.box(0.34, 0.06, 0.38, NAVY_D, 0.86, 0, 0.3);
      b.box(0.2, 0.12, 0.02, 0x9fe0c9, 0.86, 0.38, 0.475);                  // screen
      b.box(0.1, 0.06, 0.06, STEEL_D, 0.72, 0.68, 0.3);                    // shaft housing
    } else if (type === 'oil') {
      const Y = 0xf6c453;
      counter(b, NAVY, STEEL, Y);
      drum(b, -0.78, -0.22, 0.98, Y);
      drum(b, 0.78, -0.22, 0.98, 0x2a9d8f, NAVY_D);
      // horizontal drum on a cradle, with a tap
      for (const x of [-0.32, 0.32]) {
        b.box(0.07, 1.06, 0.07, STEEL_D, x, 0, -0.5);
        b.box(0.07, 1.06, 0.07, STEEL_D, x, 0, -0.2);
        b.box(0.08, 0.06, 0.4, STEEL_D, x, 1.0, -0.35);
      }
      b.cyl(0.3, 0.3, 0.86, Y, 0, 1.33 - 0.43, -0.35, 12, 0, 0, R90);
      for (const x of [-0.3, 0.3]) b.cyl(0.315, 0.315, 0.04, NAVY_D, x, 1.33 - 0.02, -0.35, 12, 0, 0, R90);
      b.box(0.08, 0.08, 0.14, CORAL, -0.18, 1.12, -0.04);                   // tap
      b.box(0.04, 0.08, 0.04, STEEL, -0.18, 1.04, 0.02);
      // pump on the right drum
      b.box(0.06, 0.5, 0.06, STEEL, 0.78, 0.98, -0.22);
      b.box(0.16, 0.16, 0.16, CORAL, 0.78, 1.42, -0.22);
      b.box(0.06, 0.14, 0.06, STEEL, 0.9, 1.44, -0.22, 0, 0, -0.6);         // spout
      b.box(0.05, 0.05, 0.4, DARK, 0.98, 1.12, -0.1, -0.8);                // hose
      b.box(0.05, 0.36, 0.05, DARK, 1.0, 0.72, 0.08);
      // drip tray + jugs
      b.box(0.62, 0.05, 0.4, NAVY_D, 0, 0, -0.35);
      b.box(0.5, 0.03, 0.3, 0x1d2026, 0, 0.05, -0.35);
      // sign: oil drop
      b.box(0.5, 0.42, 0.05, NAVY, 0, 1.72, -0.52);
      b.box(0.52, 0.04, 0.06, Y, 0, 2.12, -0.52);
      b.cyl(0.11, 0.11, 0.03, Y, 0, 1.84 - 0.015, -0.49, 12, R90);            // drop: round body + pointed tip
      b.box(0.155, 0.155, 0.03, Y, 0, 1.86, -0.49, 0, 0, Math.PI / 4);
    } else if (type === 'battery') {
      const B = 0x4f9bd9, BD = 0x2f6aa0;
      counter(b, NAVY, STEEL, B);
      // back bench
      b.box(2.1, 0.72, 0.46, 0x35505f, 0, 0, -0.33);
      b.box(2.14, 0.06, 0.5, STEEL, 0, 0.72, -0.33);
      b.box(2.12, 0.04, 0.48, B, 0, 0.66, -0.33);
      // batteries on charge
      for (const x of [-0.78, -0.4, 0.42, 0.8]) {
        b.box(0.3, 0.2, 0.24, B, x, 0.78, -0.3);
        b.box(0.31, 0.03, 0.25, BD, x, 0.98, -0.3);
        b.box(0.04, 0.04, 0.04, 0xd94848, x - 0.08, 1.01, -0.26);
        b.box(0.04, 0.04, 0.04, DARK, x + 0.08, 1.01, -0.26);
      }
      // charger cabinet in the middle, raised
      b.box(0.62, 0.86, 0.32, CREAM, 0, 0.78, -0.42);
      b.box(0.64, 0.05, 0.34, NAVY_D, 0, 1.64, -0.42);
      b.box(0.44, 0.24, 0.02, DARK, 0, 1.3, -0.255);                       // dial window
      b.cyl(0.1, 0.1, 0.02, CREAM, 0, 1.32, -0.25, 10, R90);
      b.box(0.02, 0.09, 0.015, CORAL, 0.02, 1.4, -0.236, 0, 0, -0.6);       // needle
      // cables to the batteries
      for (const [x, c] of [[-0.6, 0xd94848], [-0.5, DARK], [0.55, 0xd94848], [0.65, DARK]]) {
        b.box(0.035, 0.035, 0.36, c, x * 0.6, 1.06, -0.3, 0, 0, 0);
        b.box(Math.abs(x) - 0.3, 0.035, 0.035, c, x > 0 ? 0.3 + (Math.abs(x) - 0.3) / 2 : -0.3 - (Math.abs(x) - 0.3) / 2, 1.06, -0.15);
      }
      // lightning sign on top
      b.box(0.08, 0.3, 0.06, NAVY_D, 0, 1.69, -0.45);
      b.box(0.46, 0.4, 0.05, B, 0, 1.86, -0.45);
      b.box(0.12, 0.2, 0.03, MUSTARD, 0.04, 2.02, -0.42, 0, 0, 0.45);
      b.box(0.12, 0.2, 0.03, MUSTARD, -0.04, 1.89, -0.42, 0, 0, 0.45);
    } else if (type === 'engine') {
      const C = CORAL, CD = 0xd24f40;
      counter(b, NAVY, STEEL, C);
      // back workbench with an engine block + vise
      b.box(2.0, 0.76, 0.44, 0x35505f, 0, 0, -0.34);
      b.box(2.06, 0.06, 0.5, 0xc08a5a, 0, 0.76, -0.34);
      b.box(0.62, 0.34, 0.36, C, -0.58, 0.82, -0.34);                     // block
      for (const x of [-0.78, -0.58, -0.38]) b.cyl(0.07, 0.07, 0.08, STEEL, x, 1.16, -0.34, 8);
      b.box(0.66, 0.06, 0.2, CD, -0.58, 1.16, -0.34);
      b.cyl(0.12, 0.12, 0.05, DARK, -0.58, 0.88, -0.14, 10, R90);          // pulley
      b.box(0.24, 0.14, 0.2, STEEL_D, 0.72, 0.82, -0.3);                   // vise
      b.box(0.06, 0.06, 0.3, STEEL, 0.72, 0.9, -0.15);
      b.box(0.3, 0.04, 0.06, TRIM, 0.45, 0.82, -0.25, 0, 0.3, 0);         // spanner on bench
      // hoist gantry (mustard): two A-frame legs + beam
      const G = MUSTARD, GD = 0xd9a23a;
      for (const x of [-1.02, 1.02]) {
        b.box(0.1, 2.0, 0.1, G, x, 0, -0.5, 0.18);
        b.box(0.1, 2.0, 0.1, G, x, 0, 0.0, -0.08);
        b.box(0.16, 0.06, 0.82, GD, x, 0, -0.22);
      }
      b.box(2.16, 0.14, 0.14, G, 0, 1.95, -0.3);
      b.box(0.24, 0.14, 0.22, NAVY_D, 0.3, 1.86, -0.3);                    // trolley
    } else if (type === 'paint') {
      const L = 0x9b8fd4, LD = 0x7c70b8;
      counter(b, NAVY, STEEL, L);
      // tall shelf of colourful cans
      for (const x of [-1.04, 1.04]) for (const z of [-0.56, -0.16]) b.box(0.07, 1.86, 0.07, L, x, 0, z);
      const colors = [CORAL, TEAL, MUSTARD, 0x5aa9e6, L, 0x8fd1b0, 0xee8c3a, 0xe98fb0, CREAM];
      let k = 0;
      for (const y of [0.05, 0.68, 1.26]) {
        b.box(2.14, 0.05, 0.46, LD, 0, y, -0.36);
        for (let i = 0; i < 7; i++) {
          const x = -0.88 + i * 0.29;
          if (y < 0.1 && Math.abs(x) < 0.55) continue;                         // behind the counter
          const c = colors[k++ % colors.length];
          b.cyl(0.11, 0.11, 0.24, c, x, y + 0.05, -0.36, 10);
          b.cyl(0.112, 0.112, 0.03, STEEL, x, y + 0.27, -0.36, 10);
        }
      }
      b.box(2.16, 0.08, 0.5, L, 0, 1.86, -0.36);
      // big paintbrush sign on top
      b.box(0.08, 0.36, 0.08, 0xc08a5a, 0.62, 1.94, -0.4, 0, 0, -0.5);
      b.box(0.2, 0.12, 0.1, STEEL, 0.5, 2.18, -0.4, 0, 0, -0.5);
      b.box(0.22, 0.16, 0.1, CORAL, 0.42, 2.27, -0.4, 0, 0, -0.5);
      // mixer machine on the right front
      b.box(0.4, 1.0, 0.4, NAVY, 0.82, 0, 0.26);
      b.box(0.42, 0.06, 0.42, L, 0.82, 1.0, 0.26);
      b.box(0.3, 0.4, 0.02, DARK, 0.82, 0.48, 0.465);                      // window
      b.box(0.1, 0.08, 0.03, MUSTARD, 0.72, 0.2, 0.47);
      b.box(0.06, 0.06, 0.03, CORAL, 0.9, 0.2, 0.47);
      // splattered drop cloth on the left front
      b.box(0.5, 0.012, 0.46, CREAM, -0.8, 0, 0.3);
      for (const [x, z, c] of [[-0.9, 0.2, CORAL], [-0.7, 0.4, TEAL], [-0.72, 0.18, L], [-0.92, 0.42, MUSTARD]]) {
        b.cyl(0.06, 0.06, 0.016, c, x, 0, z, 8);
      }
      b.cyl(0.12, 0.12, 0.2, 0x5aa9e6, -0.8, 0.01, 0.3, 10);
      b.cyl(0.122, 0.122, 0.03, STEEL, -0.8, 0.2, 0.3, 10);
    }
    return b.build();
  });
}

// moving bits
function memoGeo(key, fn) { return memo(geoCache, key, () => { const b = new Builder(); fn(b); return b.build(); }); }
const balancerTireGeo = () => memoGeo('st|balTire', (b) => { tireX(b, 0, 0, 0, 0.25, 0.18); b.box(0.2, 0.06, 0.06, STEEL, 0, -0.03, 0); });
const pumpHandleGeo = () => memoGeo('st|pump', (b) => { b.box(0.05, 0.05, 0.45, STEEL_D, 0, -0.025, 0.18); b.box(0.1, 0.1, 0.1, CORAL, 0, -0.05, 0.42); });
const hoistGeo = () => memoGeo('st|hoist', (b) => {
  for (let i = 0; i < 6; i++) b.box(0.05, 0.1, 0.03, i % 2 ? STEEL : STEEL_D, 0, -0.12 - i * 0.1, 0, 0, i % 2 ? R90 : 0, 0);
  b.box(0.04, 0.12, 0.04, STEEL_D, 0, -0.78, 0);
  b.box(0.14, 0.04, 0.04, STEEL_D, 0.05, -0.8, 0);                       // hook
  b.box(0.04, 0.08, 0.04, STEEL_D, 0.1, -0.78, 0);
  // engine part hanging from it: a coral gear
  b.cyl(0.16, 0.16, 0.09, CORAL, 0, -1.0, 0, 10, R90);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(0.06, 0.06, 0.09, CORAL, Math.sin(a) * 0.17, -0.97 + Math.cos(a) * 0.17 - 0.03, 0, 0, 0, -a);
  }
  b.cyl(0.05, 0.05, 0.1, STEEL, 0, -0.97, 0, 8, R90);
});
const mixCanGeo = () => memoGeo('st|mixcan', (b) => {
  b.cyl(0.09, 0.09, 0.2, 0x9b8fd4, 0, 0, 0, 10);
  b.cyl(0.092, 0.092, 0.03, STEEL, 0, 0.17, 0, 10);
  b.box(0.22, 0.03, 0.06, STEEL_D, 0, 0.2, 0);
});

export function createPartStation(type) {
  const group = new THREE.Group();
  group.add(mesh(stationGeo(type), litMat, { cast: true, receive: true }));

  const partAnchor = new THREE.Object3D();
  partAnchor.position.set(0, 0.72, 0.32);
  group.add(partAnchor);

  const fill = new THREE.Mesh(unitBoxL, fillMat);
  fill.position.set(-0.4, 0.37, 0.588);
  fill.scale.set(0.001, 0.08, 0.02);
  fill.visible = false;
  group.add(fill);

  const anim = [];
  let t = Math.random() * 10;
  if (type === 'tire') {
    const wheel = mesh(balancerTireGeo());
    wheel.position.set(0.62, 0.95, 0.3);
    group.add(wheel);
    anim.push((dt) => { wheel.rotation.x += dt * (4 + Math.sin(t * 0.7) * 3); });
  } else if (type === 'oil') {
    const handle = new THREE.Group();
    handle.position.set(0.78, 1.55, -0.22);
    handle.add(mesh(pumpHandleGeo()));
    group.add(handle);
    const drip = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0xd9a23a }));
    drip.scale.set(0.04, 0.06, 0.04);
    group.add(drip);
    anim.push(() => {
      handle.rotation.x = -0.25 + Math.sin(t * 3.2) * 0.35;
      const k = (t * 0.9) % 1;
      drip.position.set(-0.18, 1.02 - k * k * 0.95, 0.02);
      drip.visible = k > 0.2;
    });
  } else if (type === 'battery') {
    const leds = [];
    const ledColor = ['green', 'green', 'amber', 'red'];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(unitBox, ledOff);
      m.scale.set(0.07, 0.05, 0.02);
      m.position.set(-0.18 + i * 0.12, 1.05, -0.25);
      group.add(m);
      leds.push(m);
    }
    // a status LED on top of each battery
    const batLeds = [];
    for (const x of [-0.78, -0.4, 0.42, 0.8]) {
      const m = new THREE.Mesh(unitBox, ledOff);
      m.scale.set(0.05, 0.03, 0.05);
      m.position.set(x, 1.03, -0.36);
      group.add(m);
      batLeds.push(m);
    }
    anim.push(() => {
      const step = Math.floor(t * 4);
      leds.forEach((m, i) => { m.material = step % 5 > i ? ledOn[ledColor[i]] : ledOff; });
      batLeds.forEach((m, i) => { m.material = Math.floor(t * 2 + i * 0.7) % 2 ? ledOn.green : ledOn.red; });
    });
  } else if (type === 'engine') {
    const chain = new THREE.Group();
    chain.position.set(0.3, 1.86, -0.3);
    chain.add(mesh(hoistGeo()));
    group.add(chain);
    anim.push(() => {
      chain.rotation.x = Math.sin(t * 1.3) * 0.07;
      chain.rotation.z = Math.sin(t * 1.05 + 1) * 0.05;
      chain.children[0].rotation.y = Math.sin(t * 0.8) * 0.4;
    });
  } else if (type === 'paint') {
    const can = mesh(mixCanGeo());
    can.position.set(0.82, 0.38, 0.38);
    group.add(can);
    anim.push(() => {
      const on = Math.sin(t * 0.9) > -0.3;
      can.position.x = 0.82 + (on ? Math.sin(t * 38) * 0.018 : 0);
      can.position.y = 0.38 + (on ? Math.abs(Math.sin(t * 31)) * 0.015 : 0);
      can.rotation.z = on ? Math.sin(t * 27) * 0.06 : 0;
    });
  }

  function setProgress(p) {
    const v = Math.max(0, Math.min(1, p || 0));
    fill.visible = v > 0.004;
    fill.scale.x = Math.max(0.001, v * 0.8);
  }
  function update(dt = 0.016) {
    t += dt;
    for (const a of anim) a(dt);
  }
  update(0);
  return { group, partAnchor, setProgress, update };
}

// ---------------------------------------------------------------- lift
function liftBaseGeo() {
  return memo(geoCache, 'liftBase', () => {
    const b = new Builder();
    const X = 1.15;
    // hazard-striped floor marking ~1.9 x 3.2
    const W = 1.9, D = 3.2, t = 0.14, y = 0.004;
    b.box(W - 0.02, 0.004, D - 0.02, 0xc9d1d6, 0, 0, 0);
    const stripe = (x, z, w, d, i) => b.box(w, 0.012, d, i % 2 ? P.hazardB : P.hazardA, x, y, z);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const z = -D / 2 + (i + 0.5) * (D / n);
      stripe(-W / 2 + t / 2, z, t, D / n, i);
      stripe(W / 2 - t / 2, z, t, D / n, i + 1);
    }
    const m = 6;
    for (let i = 0; i < m; i++) {
      const x = -W / 2 + t + (i + 0.5) * ((W - 2 * t) / m);
      stripe(x, -D / 2 + t / 2, (W - 2 * t) / m, t, i + 1);
      stripe(x, D / 2 - t / 2, (W - 2 * t) / m, t, i);
    }
    // floor plate between the posts (hydraulic line cover)
    b.box(2.0, 0.04, 0.26, STEEL_D, 0, 0, 0);
    b.box(1.9, 0.012, 0.16, STEEL, 0, 0.04, 0);
    // posts
    for (const sx of [-1, 1]) {
      b.box(0.5, 0.06, 0.5, NAVY_D, sx * X, 0, 0);
      b.box(0.3, 2.2, 0.3, CORAL, sx * X, 0.06, 0);
      b.box(0.08, 2.0, 0.12, 0xb84a3c, sx * (X - 0.15), 0.12, 0);          // inner track
      b.box(0.36, 0.08, 0.36, MUSTARD, sx * X, 2.26, 0);                    // cap
      b.box(0.02, 0.5, 0.2, P.hazardA, sx * (X + 0.152), 0.12, 0);         // hazard tape at the base
      for (let i = 0; i < 3; i++) b.box(0.024, 0.08, 0.2, P.hazardB, sx * (X + 0.153), 0.16 + i * 0.16, 0);
    }
    // control box on the left post
    b.box(0.18, 0.3, 0.14, CREAM, -X - 0.02, 1.0, 0.22);
    b.box(0.06, 0.06, 0.02, 0x5fbf6a, -X - 0.05, 1.18, 0.295);
    b.box(0.06, 0.06, 0.02, 0xd94848, -X + 0.03, 1.18, 0.295);
    b.box(0.1, 0.05, 0.02, NAVY_D, -X - 0.02, 1.07, 0.295);
    // beacon base on the right post
    b.box(0.2, 0.06, 0.2, NAVY_D, X, 2.34, 0);
    return b.build();
  });
}
function liftArmsGeo() {
  return memo(geoCache, 'liftArms', () => {
    const b = new Builder();
    const X = 1.15;
    for (const sx of [-1, 1]) {
      b.box(0.4, 0.28, 0.4, MUSTARD, sx * X, 0.08, 0);                     // carriage
      b.box(0.42, 0.04, 0.42, 0xd9a23a, sx * X, 0.36, 0);
      for (const pz of [-0.42, 0.42]) {
        // arm swings from the carriage under the car's body to a rubber pad
        const cx = sx * (X - 0.12), px = sx * 0.42;
        const dx = px - cx, dz = pz, len = Math.hypot(dx, dz);
        b.box(len, 0.08, 0.13, STEEL, (cx + px) / 2, 0.1, pz / 2, 0, Math.atan2(-dz, dx), 0);
        b.cyl(0.09, 0.09, 0.07, DARK, px, 0.12, pz, 8);                       // rubber pad
        b.cyl(0.05, 0.05, 0.05, STEEL_D, px, 0.06, pz, 6);
      }
    }
    return b.build();
  });
}
const lampGeo = (() => {
  let g = null;
  return () => g || (g = (() => { const b = new Builder(); b.box(0.18, 0.16, 0.18, 0xffffff, 0, 0, 0); b.box(0.12, 0.06, 0.12, 0xffffff, 0, 0.16, 0); return b.build(); })());
})();
const lampMats = {
  idle: new THREE.MeshLambertMaterial({ color: 0x8f9aa3 }),
  amber: new THREE.MeshBasicMaterial({ color: 0xffb21e }),
  amberDim: new THREE.MeshLambertMaterial({ color: 0x9a6a1a }),
  green: new THREE.MeshBasicMaterial({ color: 0x6dff8a }),
};

export function createLift() {
  const group = new THREE.Group();
  const base = mesh(liftBaseGeo(), litMat, { cast: true, receive: true });
  group.add(base);
  const arms = mesh(liftArmsGeo());
  group.add(arms);
  const lamp = new THREE.Mesh(lampGeo(), lampMats.idle);
  lamp.position.set(1.15, 2.4, 0);
  group.add(lamp);
  const platform = new THREE.Object3D();
  group.add(platform);
  let state = 'idle', t = 0;
  function setHeight(h) {
    const v = Math.max(0, Math.min(1, h || 0));
    arms.position.y = v * LIFT_RISE;
    platform.position.y = v * LIFT_RISE;
  }
  function setLight(s) {
    state = s === 'busy' || s === 'done' ? s : 'idle';
    lamp.material = state === 'done' ? lampMats.green : state === 'busy' ? lampMats.amber : lampMats.idle;
  }
  function update(dt = 0.016) {
    t += dt;
    if (state === 'busy') {
      const on = t % 0.8 < 0.45;
      lamp.material = on ? lampMats.amber : lampMats.amberDim;
      lamp.rotation.y += dt * 4;
    } else if (state === 'done') {
      lamp.scale.setScalar(1 + Math.max(0, Math.sin(t * 6)) * 0.15);
    }
    if (state !== 'done') lamp.scale.setScalar(1);
  }
  setHeight(0);
  return { group, platform, setHeight, setLight, update };
}

// ---------------------------------------------------------------- pads
function padGeo(key, size, baseColor, innerColor, build) {
  return memo(geoCache, key, () => {
    const b = new Builder();
    const R = -Math.PI / 2;
    b.shape(roundedRect(size, size, size * 0.14), 0.05, baseColor, 0, 0, 0, R);
    b.shape(roundedRect(size * 0.82, size * 0.82, size * 0.09), 0.012, innerColor, 0, 0.05, 0, R);
    build(b);
    return b.build();
  });
}

export function createUnlockPad() {
  const geo = padGeo('unlockPad', 1.6, P.padBase, 0x3d5d70, (b) => {
    const r = 0.7, dash = 0.14;
    for (let i = -2; i <= 2; i++) {
      const p = i * 0.27;
      b.box(dash, 0.012, 0.05, MUSTARD, p, 0.05, r);
      b.box(dash, 0.012, 0.05, MUSTARD, p, 0.05, -r);
      b.box(0.05, 0.012, dash, MUSTARD, r, 0.05, p);
      b.box(0.05, 0.012, dash, MUSTARD, -r, 0.05, p);
    }
  });
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  inner.add(mesh(geo, litMat, { cast: false, receive: true }));
  const fMat = new THREE.MeshLambertMaterial({ color: P.padFill, emissive: 0x6a4d10, flatShading: true });
  const fill = new THREE.Mesh(unitBox, fMat);
  fill.position.y = 0.06;
  fill.visible = false;
  inner.add(fill);
  const SPAN = 1.1;
  let p = 0, t = Math.random() * 6;
  function setProgress(v) {
    p = Math.max(0, Math.min(1, v || 0));
    fill.visible = p > 0.003;
    fill.scale.set(SPAN, 0.025, Math.max(0.001, SPAN * p));
    fill.position.z = SPAN / 2 - (SPAN * p) / 2;          // grows from the near (camera) edge
  }
  function update(dt = 0.016) {
    t += dt;
    const s = 1 + Math.sin(t * 2.6) * 0.025;
    inner.scale.set(s, 1, s);
    fMat.emissiveIntensity = 0.7 + Math.sin(t * 5) * 0.3;
  }
  setProgress(0);
  return { group, setProgress, update };
}

function arrowGeo() {
  return memo(geoCache, 'arrow', () => {
    const b = new Builder();
    b.box(0.22, 0.07, 0.4, CREAM, 0, 0, 0.2);
    b.box(0.66, 0.07, 0.1, CREAM, 0, 0, -0.04);
    b.box(0.44, 0.07, 0.1, CREAM, 0, 0, -0.14);
    b.box(0.22, 0.07, 0.1, CREAM, 0, 0, -0.24);
    return b.build();
  });
}

export function createUpgradePad() {
  const geo = padGeo('upgradePad', 1.4, TEAL, 0x3ec4b3, (b) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.05, 0.05, 0.02, MUSTARD, sx * 0.58, 0.05, sz * 0.58, 8);
  });
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  inner.add(mesh(geo, litMat, { cast: false, receive: true }));
  const arrow = mesh(arrowGeo());
  arrow.position.y = 0.07;
  inner.add(arrow);
  let t = Math.random() * 6;
  function update(dt = 0.016) {
    t += dt;
    const s = 1 + Math.sin(t * 2.2) * 0.025;
    inner.scale.set(s, 1, s);
    arrow.position.y = 0.09 + (Math.sin(t * 3.4) * 0.5 + 0.5) * 0.08;
  }
  return { group, update };
}

// ---------------------------------------------------------------- zone ring
const ringGeos = new Map();
export function createZoneRing(radius = 0.9) {
  // White band on a wider navy band, so the ring reads on the light hall floor and the cream forecourt alike.
  const w = Math.max(0.07, radius * 0.13);
  const band = (grow, width) => {
    const size = radius * 2 + grow * 2, r = radius * 0.38 + grow;
    const outer = roundedRect(size, size, r);
    outer.holes.push(roundedRect(size - width * 2, size - width * 2, Math.max(0.02, r - width * 0.6)));
    return new THREE.ShapeGeometry(outer, 4);
  };
  const geo = memo(ringGeos, radius.toFixed(2), () => band(0, w));
  const backGeo = memo(ringGeos, radius.toFixed(2) + 'b', () => band(w * 0.55, w * 2.1));
  const m = new THREE.Mesh(geo, ringMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.035;
  m.renderOrder = 2;
  const back = new THREE.Mesh(backGeo, ringBackMat);
  back.position.z = -0.004;       // local z = world y after the rotation: just under the white band
  back.renderOrder = 1;
  m.add(back);
  return m;
}
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false });
const ringBackMat = new THREE.MeshBasicMaterial({ color: 0x2f4858, transparent: true, opacity: 0.42, depthWrite: false });

// ---------------------------------------------------------------- decorative unlockables
function propGroup(geo, opts) {
  const g = new THREE.Group();
  g.add(mesh(geo, litMat, opts || { cast: true, receive: true }));
  return g;
}

export function createScrapBin() {
  const geo = memo(geoCache, 'scrapBin', () => {
    const b = new Builder();
    const G = 0x3f7a6a, GD = 0x2c5a4d;
    b.box(1.0, 0.1, 0.8, DARK, 0, 0.06, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.07, 0.07, 0.06, RUBBER, sx * 0.38, 0.0, sz * 0.28, 8, 0, 0, R90);
    b.box(1.0, 0.68, 0.8, G, 0, 0.12, 0);
    b.box(1.06, 0.06, 0.86, GD, 0, 0.8, 0);                                 // rim
    for (const x of [-0.3, 0, 0.3]) b.box(0.06, 0.6, 0.02, GD, x, 0.14, 0.405);   // ribs
    b.box(1.02, 0.12, 0.02, P.hazardA, 0, 0.5, 0.41);                       // hazard band
    for (let i = 0; i < 6; i++) b.box(0.07, 0.12, 0.022, P.hazardB, -0.4 + i * 0.16, 0.5, 0.412, 0, 0, 0.6);
    b.box(0.3, 0.14, 0.022, CREAM, 0, 0.26, 0.412);                         // "X" plate
    b.box(0.03, 0.14, 0.024, CORAL, 0, 0.26, 0.414, 0, 0, 0.7);
    b.box(0.03, 0.14, 0.024, CORAL, 0, 0.26, 0.414, 0, 0, -0.7);
    // lid flipped open at the back
    b.box(1.04, 0.05, 0.5, GD, 0, 0.98, -0.62, -1.1);
    // scrap sticking out
    b.box(0.92, 0.04, 0.72, 0x23272d, 0, 0.78, 0);
    tireX(b, -0.2, 0.86, 0.06, 0.2, 0.14);
    b.box(0.06, 0.06, 0.5, STEEL_D, 0.2, 0.84, -0.05, 0.4, 0.5, 0);         // bent pipe
    b.box(0.16, 0.12, 0.2, 0x4f9bd9, 0.28, 0.82, 0.18, 0, 0.4, 0);          // old battery
    b.box(0.12, 0.12, 0.12, 0xa8552e, 0.05, 0.84, -0.22, 0.4, 0.4, 0);       // rusty bits
    b.cyl(0.1, 0.1, 0.05, CORAL, -0.3, 0.84, -0.22, 8, 0.6);
    return b.build();
  });
  return propGroup(geo);
}

export function createCoffeeCart() {
  const geo = memo(geoCache, 'coffeeCart', () => {
    const b = new Builder();
    const W = 0xc08a5a;
    // body
    b.box(1.3, 0.7, 0.7, CREAM, 0, 0.22, 0);
    b.box(1.32, 0.12, 0.72, CORAL, 0, 0.22, 0);
    b.box(1.32, 0.05, 0.72, CORAL, 0, 0.86, 0);
    b.box(1.4, 0.07, 0.78, W, 0, 0.92, 0);                                  // wooden top
    for (const x of [-0.42, 0, 0.42]) b.box(0.03, 0.44, 0.02, 0xe6dcc8, x, 0.36, 0.355);
    // big wheels on the sides + leg
    for (const sx of [-1, 1]) {
      b.cyl(0.24, 0.24, 0.07, RUBBER, sx * 0.7, 0.25 - 0.035, -0.12, 12, 0, 0, R90);
      b.cyl(0.14, 0.14, 0.08, MUSTARD, sx * 0.7, 0.25 - 0.04, -0.12, 10, 0, 0, R90);
    }
    b.box(0.08, 0.24, 0.08, DARK, 0, 0, 0.25);
    b.box(0.6, 0.04, 0.04, STEEL_D, 0, 0.6, -0.42);                         // push handle
    // espresso machine + cups
    b.box(0.46, 0.34, 0.32, STEEL, -0.28, 0.99, -0.1);
    b.box(0.48, 0.05, 0.34, CORAL, -0.28, 1.33, -0.1);
    b.box(0.12, 0.06, 0.08, DARK, -0.36, 1.06, 0.08);
    b.box(0.06, 0.06, 0.04, CREAM, -0.36, 0.99, 0.1);
    b.cyl(0.05, 0.05, 0.05, MUSTARD, -0.16, 1.2, 0.07, 8, R90);             // gauge
    for (let i = 0; i < 3; i++) b.cyl(0.055, 0.045, 0.1, i === 1 ? CORAL : CREAM, 0.12 + i * 0.13, 0.99, 0.15, 8);
    for (let i = 0; i < 3; i++) b.cyl(0.055, 0.045, 0.1, CREAM, 0.2, 0.99 + i * 0.1, -0.15, 8);
    // awning
    for (const sx of [-1, 1]) b.box(0.05, 1.0, 0.05, W, sx * 0.62, 0.99, -0.3);
    for (let i = 0; i < 6; i++) {
      b.box(0.25, 0.05, 0.86, i % 2 ? CREAM : CORAL, -0.625 + i * 0.25, 2.0, -0.02, -0.18);
    }
    for (let i = 0; i < 6; i++) b.box(0.25, 0.1, 0.03, i % 2 ? CREAM : CORAL, -0.625 + i * 0.25, 1.85, 0.42);
    // cup sign on top
    b.box(0.3, 0.26, 0.08, CREAM, 0, 2.1, -0.1);
    b.box(0.08, 0.14, 0.06, CREAM, 0.18, 2.16, -0.1);
    b.box(0.32, 0.04, 0.1, CORAL, 0, 2.1, -0.1);
    b.box(0.18, 0.04, 0.09, 0x7a4f32, 0, 2.34, -0.1);
    for (const x of [-0.06, 0.06]) b.box(0.04, 0.14, 0.04, 0xffffff, x, 2.42, -0.1);
    return b.build();
  });
  return propGroup(geo);
}

let billboardTex = null;
function billboardTexture() {
  if (billboardTex) return billboardTex;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const draw = () => {
    g.fillStyle = '#2f4858'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#f26b5b'; g.fillRect(0, 196, 512, 60);
    g.fillStyle = '#f6c453'; g.fillRect(0, 190, 512, 8);
    // little car
    g.fillStyle = '#f6c453';
    g.beginPath(); g.roundRect(330, 92, 150, 58, 14); g.fill();
    g.beginPath(); g.roundRect(362, 58, 82, 44, 12); g.fill();
    g.fillStyle = '#a8dcea'; g.beginPath(); g.roundRect(372, 66, 28, 28, 6); g.fill();
    g.beginPath(); g.roundRect(406, 66, 28, 28, 6); g.fill();
    g.fillStyle = '#1f2329';
    for (const x of [365, 445]) { g.beginPath(); g.arc(x, 152, 22, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#dfe4e6';
    for (const x of [365, 445]) { g.beginPath(); g.arc(x, 152, 9, 0, Math.PI * 2); g.fill(); }
    // sparkles
    g.fillStyle = '#fff6e6';
    for (const [x, y, s] of [[312, 70, 9], [470, 50, 7], [490, 100, 5]]) { g.fillRect(x - s, y - 2, s * 2, 4); g.fillRect(x - 2, y - s, 4, s * 2); }
    // text
    g.fillStyle = '#fff6e6';
    g.font = 'bold 64px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif';
    g.textBaseline = 'alphabetic';
    g.fillText('WRENCH', 28, 96);
    g.fillText('BAY', 28, 162);
    g.fillStyle = '#fff6e6';
    g.font = 'bold 30px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif';
    g.fillText('FAST FIXES  ·  HAPPY CARS', 30, 238);
  };
  draw();
  billboardTex = new THREE.CanvasTexture(c);
  billboardTex.colorSpace = THREE.SRGBColorSpace;
  billboardTex.anisotropy = 4;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { draw(); billboardTex.needsUpdate = true; });
  return billboardTex;
}
let billboardFaceMat = null;
export function createBillboard() {
  const geo = memo(geoCache, 'billboard', () => {
    const b = new Builder();
    for (const x of [-1.0, 1.0]) {
      b.box(0.5, 0.12, 0.6, 0x8f9aa3, x, 0, -0.1);
      b.box(0.18, 1.6, 0.18, NAVY, x, 0.12, -0.22);
      b.box(0.3, 0.12, 0.12, NAVY_D, x, 0.12, 0.0);
    }
    b.box(3.3, 1.72, 0.16, NAVY_D, 0, 1.3, -0.04);                          // frame
    b.box(3.36, 0.08, 0.2, MUSTARD, 0, 3.0, -0.04);
    b.box(3.2, 0.06, 0.5, 0x8f9aa3, 0, 1.0, 0.2);                            // catwalk
    for (let i = 0; i < 9; i++) b.box(0.03, 0.26, 0.03, 0x8f9aa3, -1.6 + i * 0.4, 1.06, 0.43);
    b.box(3.2, 0.03, 0.03, 0x8f9aa3, 0, 1.3, 0.43);
    for (const x of [-1.0, 1.0]) b.box(0.06, 0.06, 0.5, NAVY_D, x, 0.94, 0.2);
    for (const x of [-0.9, 0.9]) {                                          // lamps
      b.box(0.05, 0.05, 0.4, TRIM, x, 3.04, 0.15);
      b.box(0.24, 0.08, 0.14, TRIM, x, 2.98, 0.36);
    }
    return b.build();
  });
  const g = propGroup(geo);
  if (!billboardFaceMat) billboardFaceMat = new THREE.MeshLambertMaterial({ map: billboardTexture() });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.55), billboardFaceMat);
  face.position.set(0, 2.16, 0.045);
  face.receiveShadow = true;
  g.add(face);
  return g;
}

export function createValetStand() {
  const geo = memo(geoCache, 'valetStand', () => {
    const b = new Builder();
    const W = 0xc08a5a;
    b.box(0.66, 0.06, 0.5, NAVY_D, 0, 0, 0);
    b.box(0.56, 0.86, 0.4, NAVY, 0, 0.06, 0);
    b.box(0.58, 0.08, 0.42, CORAL, 0, 0.62, 0);
    b.box(0.62, 0.06, 0.5, W, 0, 0.94, 0.04, 0.25);                         // slanted desk
    b.box(0.3, 0.2, 0.02, MUSTARD, 0, 0.3, 0.205);                          // key emblem plate
    b.cyl(0.05, 0.05, 0.02, NAVY_D, -0.06, 0.39, 0.21, 8, R90);
    b.box(0.14, 0.03, 0.02, NAVY_D, 0.04, 0.38, 0.217);
    b.box(0.03, 0.05, 0.02, NAVY_D, 0.09, 0.35, 0.217);
    b.cyl(0.05, 0.06, 0.05, MUSTARD, 0.18, 1.0, 0.0, 8);                    // service bell
    b.box(0.02, 0.03, 0.02, NAVY_D, 0.18, 1.05, 0.0);
    // key board on a post behind
    b.box(0.06, 1.5, 0.06, NAVY_D, 0, 0, -0.26);
    b.box(0.56, 0.44, 0.05, W, 0, 1.3, -0.26);
    b.box(0.6, 0.04, 0.07, CORAL, 0, 1.74, -0.26);
    const tags = [CORAL, TEAL, MUSTARD, 0x5aa9e6, 0x9b8fd4, 0x8fd1b0];
    for (let i = 0; i < 6; i++) {
      const x = -0.18 + (i % 3) * 0.18, y = 1.58 - Math.floor(i / 3) * 0.2;
      b.box(0.02, 0.02, 0.04, STEEL_D, x, y, -0.22);
      b.box(0.03, 0.07, 0.02, STEEL, x, y - 0.08, -0.225);
      b.box(0.06, 0.05, 0.02, tags[i], x, y - 0.13, -0.225);
    }
    return b.build();
  });
  return propGroup(geo);
}

export function createToolbox() {
  const geo = memo(geoCache, 'toolbox', () => {
    const b = new Builder();
    const C = CORAL, CD = 0xc9503f;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(0.06, 0.08, 0.06, STEEL_D, sx * 0.42, 0.08, sz * 0.18);
      b.cyl(0.05, 0.05, 0.04, RUBBER, sx * 0.42, 0.03, sz * 0.18, 8, 0, 0, R90);
    }
    b.box(1.0, 0.66, 0.5, C, 0, 0.14, 0);
    for (let i = 0; i < 5; i++) {
      const y = 0.18 + i * 0.12;
      b.box(0.92, 0.1, 0.02, i % 2 ? C : CD, 0, y, 0.255);
      b.box(0.36, 0.025, 0.04, CHROME, 0, y + 0.05, 0.27);
    }
    b.box(1.02, 0.04, 0.52, NAVY_D, 0, 0.8, 0);
    // top chest
    b.box(0.86, 0.22, 0.42, C, 0, 0.84, -0.02);
    b.box(0.88, 0.04, 0.44, CD, 0, 1.06, -0.02);
    b.box(0.3, 0.025, 0.04, CHROME, 0, 0.94, 0.2);
    // side handle
    b.box(0.04, 0.04, 0.4, CHROME, 0.56, 0.68, 0);
    b.box(0.08, 0.04, 0.04, CHROME, 0.53, 0.68, -0.18);
    b.box(0.08, 0.04, 0.04, CHROME, 0.53, 0.68, 0.18);
    // tools on top: wrench + screwdriver
    b.box(0.4, 0.03, 0.06, STEEL, -0.12, 1.1, 0.02, 0, 0.3, 0);
    b.box(0.1, 0.035, 0.11, STEEL, -0.32, 1.1, 0.08, 0, 0.3, 0);
    b.box(0.12, 0.05, 0.05, MUSTARD, 0.2, 1.1, -0.06, 0, -0.4, 0);
    b.box(0.18, 0.02, 0.02, STEEL, 0.34, 1.115, -0.12, 0, -0.4, 0);
    return b.build();
  });
  return propGroup(geo);
}
