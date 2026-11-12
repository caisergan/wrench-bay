// Chunky toy-like voxel cars: five body types + gold VIP, four spinning wheels, per-problem damage.
// One merged body mesh per look (cached), a separate hood (opens for battery trouble), 4 wheel meshes sharing one
// geometry per wheel size. Damage overlays are built once per type and only toggled; all materials are shared.
import * as THREE from 'three';
import { CAR_TYPES } from '../config.js';
import { Builder, litMat, glowMat, memo, mesh, polygon } from './voxel.js';
import { leakDrop } from './leak.js';

// ---------------------------------------------------------------- palette
export const CAR_COLORS = [
  0xf26b5b, // coral
  0x5aa9e6, // sky
  0x2a9d8f, // teal
  0xee8c3a, // tangerine
  0x9b8fd4, // lilac
  0xf2e8d5, // cream
  0x8fd1b0, // mint
  0xd94848, // cherry
  0x3d6fb6, // cobalt
  0xe98fb0, // bubblegum
];
const VIP_GOLD = 0xf0b429;
const GLASS = 0xa8dcea;
const GLASS_D = 0x7db8cc;
const RUBBER = 0x2b2f36;
const DARK = 0x262a31;
const TRIM = 0x3d434c;
const CHROME = 0xd9dee2;
const CREAM = 0xf6ecd8;
const HEAD = 0xfff1b8;
const TAIL = 0xe0443e;
const AMBER = 0xf6a53a;
const SPARE_RIM = 0xf6c453;   // space-saver spare wheel
const SPARE_K = 0.8;          // its radius relative to a normal wheel
const SAG = 0.38;             // a soft tyre loses this much of its height
const PRIMER = 0xa3a8ad;
const PRIMER_D = 0x868c93;
const RUST = 0xa8552e;
const SCRATCH = 0xf7f3ea;

const _c = new THREE.Color();
const shade = (hex, k) => _c.set(hex).multiplyScalar(k).getHex();
const lerpHex = (a, b, k) => _c.set(a).lerp(new THREE.Color(b), k).getHex();

// ---------------------------------------------------------------- body specs
// z runs rear (-) to nose (+). y0 = body bottom, yb = belt line (top of the lower body / hood base).
// cab = cabin trapezoid: bottom rear/front z (r0, f0) at yb, top rear/front z (r1, f1) at yt, width w.
// pillars = z of the side window posts.
const SPECS = {
  compact: {
    L: 2.3, W: 1.28, r: 0.27, wr: 0.25, ax: 0.74, axR: -0.74, y0: 0.2, yb: 0.64, noseCh: 0.13, tailCh: 0.05,
    cab: { r0: -1.09, f0: 0.34, r1: -1.0, f1: -0.08, yt: 1.24, w: 1.16 }, pillars: [-0.46],
    bumper: CHROME, roofColor: CREAM, roundLights: true,
  },
  sedan: {
    L: 2.7, W: 1.28, r: 0.27, wr: 0.25, ax: 0.86, axR: -0.86, y0: 0.2, yb: 0.6, noseCh: 0.1, tailCh: 0.08,
    cab: { r0: -0.8, f0: 0.4, r1: -0.52, f1: 0.06, yt: 1.1, w: 1.14 }, pillars: [-0.22],
    bumper: TRIM, chromeStrip: true,
  },
  pickup: {
    L: 2.76, W: 1.32, r: 0.33, wr: 0.28, ax: 0.9, axR: -0.86, y0: 0.32, yb: 0.8, noseCh: 0.1, tailCh: 0.0,
    cab: { r0: -0.22, f0: 0.5, r1: -0.2, f1: 0.22, yt: 1.38, w: 1.2 }, pillars: [],
    bumper: CHROME, bed: true,
  },
  van: {
    L: 2.74, W: 1.34, r: 0.28, wr: 0.25, ax: 0.92, axR: -0.88, y0: 0.22, yb: 0.7, noseCh: 0.12, tailCh: 0.04,
    cab: { r0: -1.31, f0: 0.8, r1: -1.29, f1: 0.38, yt: 1.42, w: 1.3 }, pillars: [0.2, -0.55],
    bumper: CHROME, twoTone: true, roofRack: true,
  },
  sports: {
    L: 2.72, W: 1.36, r: 0.28, wr: 0.27, ax: 0.88, axR: -0.86, y0: 0.16, yb: 0.5, noseCh: 0.15, tailCh: 0.1,
    cab: { r0: -0.84, f0: 0.22, r1: -0.52, f1: -0.18, yt: 0.95, w: 1.1 }, pillars: [],
    bumper: DARK, stripes: true, spoiler: true, slimLights: true,
  },
};
for (const s of Object.values(SPECS)) {
  s.zf = s.L / 2 - 0.06;                         // body front face (bumper pokes out to L/2)
  s.zr = -s.L / 2 + 0.06;
  s.hz0 = s.cab.f0 + 0.01;                       // hood hinge
  s.hz1 = s.zf - s.noseCh;                       // hood front edge
  s.wx = Math.min(0.75 - s.wr / 2, s.W / 2);     // wheel centre x
}

const geoCache = new Map();

// side-profile extrusion: pts are (z, y); extruded across x, centred on xc
function sideExtrude(b, pts, width, color, xc = 0, holes = null) {
  const shp = polygon(pts);
  if (holes) for (const h of holes) shp.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  b.shape(shp, width, color, xc + width / 2, 0, 0, 0, -Math.PI / 2, 0);
}

function windowHoles(s) {
  const c = s.cab, ylo = s.yb + 0.08, yhi = c.yt - 0.06;
  const rearAt = (y) => c.r0 + (c.r1 - c.r0) * (y - s.yb) / (c.yt - s.yb);
  const frontAt = (y) => c.f0 + (c.f1 - c.f0) * (y - s.yb) / (c.yt - s.yb);
  const edges = [null, ...[...s.pillars].sort((a, b) => a - b), null];
  const holes = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i], bz = edges[i + 1];
    const r = (y) => (a == null ? rearAt(y) + 0.07 : a + 0.045);
    const f = (y) => (bz == null ? frontAt(y) - 0.07 : bz - 0.045);
    holes.push([[r(ylo), ylo], [f(ylo), ylo], [f(yhi), yhi], [r(yhi), yhi]]);
  }
  return holes;
}

// ---------------------------------------------------------------- body geometry (per look)
function bodyGeo(look) {
  const key = `body|${look.type}|${look.color}|${look.vip ? 1 : 0}`;
  return memo(geoCache, key, () => {
    const s = SPECS[look.type];
    const col = look.color, colD = shade(col, 0.72), colL = lerpHex(col, 0xffffff, 0.25);
    const { L, W, y0, yb, zf, zr, cab } = s;
    const b = new Builder();

    // underbody (dark chassis between the wheels)
    b.box(W - 0.14, 0.08, L - 0.5, DARK, 0, y0 - 0.07, 0);

    // lower body: side profile with chamfered corners
    const yr = yb;  // rear deck height
    sideExtrude(b, [
      [zr + 0.06, y0], [zf - 0.06, y0], [zf, y0 + 0.06], [zf, yb - s.noseCh], [zf - s.noseCh, yb],
      [zr + s.tailCh, yr], [zr, yr - s.tailCh], [zr, y0 + 0.06],
    ], W, col);
    // darker rocker band + belt crease
    b.box(W + 0.012, 0.07, L - 0.42, colD, 0, y0 + 0.02, 0);
    if (s.chromeStrip) b.box(W + 0.014, 0.03, L - 0.6, CHROME, 0, yb - 0.17, 0.02);

    // bumpers
    const bw = W + 0.04;
    b.box(bw, 0.14, 0.12, s.bumper, 0, y0 + 0.02, L / 2 - 0.06);
    b.box(bw, 0.14, 0.12, s.bumper, 0, y0 + 0.02, -L / 2 + 0.06);
    b.box(0.3, 0.09, 0.02, CREAM, 0, y0 + 0.05, -L / 2 - 0.002);                // plate
    b.box(0.22, 0.02, 0.022, TRIM, 0, y0 + 0.085, -L / 2 - 0.003);

    // nose: grille + headlights
    const ly = yb - s.noseCh - 0.13;
    if (look.type === 'sports') {
      b.box(W * 0.6, 0.09, 0.02, DARK, 0, y0 + 0.17, zf + 0.002);              // low intake
    } else {
      b.box(W * 0.42, 0.16, 0.02, DARK, 0, ly - 0.02, zf + 0.002);
      for (let i = 0; i < 3; i++) b.box(W * 0.4, 0.018, 0.024, TRIM, 0, ly + 0.01 + i * 0.045, zf + 0.004);
    }
    for (const sx of [-1, 1]) {
      if (s.roundLights) {
        b.cyl(0.11, 0.11, 0.04, CHROME, sx * 0.42, ly - 0.03 - 0.02, zf - 0.005, 10, Math.PI / 2);
        b.cyl(0.085, 0.085, 0.05, HEAD, sx * 0.42, ly - 0.03 - 0.025, zf + 0.0, 10, Math.PI / 2);
      } else if (s.slimLights) {
        b.box(0.3, 0.07, 0.05, HEAD, sx * 0.44, yb - s.noseCh - 0.08, zf - 0.01);
      } else {
        b.box(0.26, 0.14, 0.04, HEAD, sx * 0.44, ly - 0.03, zf);
        b.box(0.28, 0.02, 0.045, TRIM, sx * 0.44, ly + 0.11, zf);
      }
      b.box(0.1, 0.06, 0.04, AMBER, sx * (W / 2 - 0.08), y0 + 0.17, zf);       // indicators
      // tail lights
      b.box(0.24, 0.13, 0.04, TAIL, sx * (W / 2 - 0.17), yr - s.tailCh - 0.17, zr - 0.005);
      b.box(0.08, 0.05, 0.045, AMBER, sx * (W / 2 - 0.08), yr - s.tailCh - 0.15, zr - 0.006);
      // door seams + handles
      const seamZ = [cab.f0 - 0.04, ...s.pillars];
      for (const z of seamZ) b.box(0.012, yb - y0 - 0.1, 0.02, colD, sx * (W / 2 + 0.004), y0 + 0.08, z);
      for (const z of s.pillars.length ? s.pillars : [cab.f0 - 0.2]) {
        b.box(0.02, 0.03, 0.1, colD, sx * (W / 2 + 0.008), yb - 0.12, z - 0.16);
      }
    }

    // exhaust
    b.box(0.08, 0.08, 0.12, TRIM, -0.4, y0 - 0.02, zr - 0.04);
    if (look.type === 'sports') b.box(0.08, 0.08, 0.12, TRIM, 0.4, y0 - 0.02, zr - 0.04);

    // ---- type extras on the lower body
    if (s.bed) {
      const bz0 = zr, bz1 = cab.r0 - 0.05, bl = bz1 - bz0, bm = (bz0 + bz1) / 2, wh = 0.22;
      b.box(W - 0.16, 0.014, bl - 0.1, 0x3a3f47, 0, yb, bm + 0.01);              // bed floor
      for (let i = -2; i <= 2; i++) b.box(0.05, 0.02, bl - 0.16, 0x4f5660, i * 0.2, yb + 0.012, bm + 0.01);
      for (const sx of [-1, 1]) {
        b.box(0.08, wh, bl, col, sx * (W / 2 - 0.04), yb, bm);
        b.box(0.1, 0.035, bl + 0.02, colD, sx * (W / 2 - 0.04), yb + wh, bm);
      }
      b.box(W, wh, 0.08, col, 0, yb, zr + 0.04);                                  // tailgate
      b.box(W + 0.01, 0.035, 0.1, colD, 0, yb + wh, zr + 0.04);
      b.box(W - 0.16, wh + 0.04, 0.06, col, 0, yb, bz1 - 0.03);                   // bed front wall
      // chunky steel bar on the nose
      b.box(0.06, 0.32, 0.06, TRIM, -0.3, y0 + 0.08, L / 2 - 0.02);
      b.box(0.06, 0.32, 0.06, TRIM, 0.3, y0 + 0.08, L / 2 - 0.02);
      b.box(0.68, 0.06, 0.06, TRIM, 0, y0 + 0.36, L / 2 - 0.02);
      // fender flares
      for (const sx of [-1, 1]) for (const z of [s.ax, s.axR]) {
        b.box(0.1, 0.06, s.r * 2 + 0.12, DARK, sx * (W / 2 + 0.01), y0 + s.r * 0.2 + 0.04, z);
      }
    }
    if (s.twoTone) {
      // cream waist stripe on the van
      b.box(W + 0.014, 0.06, L - 0.3, CREAM, 0, yb - 0.14, 0);
    }
    if (look.type === 'sports') {
      for (const sx of [-1, 1]) {
        b.box(0.014, 0.12, 0.4, DARK, sx * (W / 2 + 0.004), y0 + 0.12, -0.42);    // side intake
        b.box(0.014, 0.025, 0.36, DARK, sx * (W / 2 + 0.005), y0 + 0.26, -0.4);
      }
    }

    // ---- cabin: glass core, side frames with window holes, roof slab
    const cabPts = [[cab.r0, yb], [cab.f0, yb], [cab.f1, cab.yt], [cab.r1, cab.yt]];
    const cabCol = s.twoTone ? (col === 0xf2e8d5 ? 0x8fd1b0 : CREAM) : col;
    sideExtrude(b, cabPts, cab.w - 0.03, GLASS);
    const holes = windowHoles(s);
    for (const sx of [-1, 1]) sideExtrude(b, cabPts, 0.035, cabCol, sx * (cab.w / 2 - 0.0), holes);
    // windshield / rear glass tint bands (slightly darker lower edge)
    const roofCol = s.roofColor ? (col === 0xf2e8d5 ? 0x2a9d8f : s.roofColor) : cabCol;
    const rl = cab.f1 - cab.r1 + 0.06;
    b.box(cab.w + 0.04, 0.07, rl, roofCol, 0, cab.yt, (cab.f1 + cab.r1) / 2);
    b.box(cab.w - 0.06, 0.02, rl - 0.1, shade(roofCol, 0.9), 0, cab.yt + 0.07, (cab.f1 + cab.r1) / 2);
    // dark glass bottom line where the cabin meets the body
    b.box(cab.w - 0.01, 0.03, cab.f0 - cab.r0, GLASS_D, 0, yb, (cab.f0 + cab.r0) / 2);
    // side mirrors
    for (const sx of [-1, 1]) {
      b.box(0.1, 0.03, 0.04, colD, sx * (cab.w / 2 + 0.05), yb + 0.08, cab.f0 - 0.08);
      b.box(0.06, 0.08, 0.1, cabCol, sx * (cab.w / 2 + 0.1), yb + 0.06, cab.f0 - 0.08);
    }

    // ---- roof extras
    const roofTop = cab.yt + 0.09, rz = (cab.f1 + cab.r1) / 2;
    if (s.roofRack) {
      for (const sx of [-1, 1]) b.box(0.05, 0.05, rl - 0.1, TRIM, sx * (cab.w / 2 - 0.08), roofTop, rz);
      for (const z of [-0.6, 0, 0.6]) b.box(cab.w - 0.1, 0.03, 0.05, TRIM, 0, roofTop + 0.04, rz + z * (rl / 2 - 0.12));
    }
    if (s.bed) {
      b.box(cab.w - 0.2, 0.06, 0.12, DARK, 0, roofTop - 0.02, cab.f1 - 0.08);    // light bar
      for (let i = 0; i < 4; i++) b.box(0.13, 0.08, 0.04, AMBER, -0.3 + i * 0.2, roofTop - 0.01, cab.f1 - 0.01);
    }
    if (s.stripes) {
      const stc = look.vip ? 0xffffff : CREAM;
      for (const sx of [-1, 1]) {
        b.box(0.1, 0.012, rl - 0.04, stc, sx * 0.12, roofTop - 0.02, rz);
        b.box(0.1, 0.012, cab.r0 - zr - 0.06, stc, sx * 0.12, yb, (zr + cab.r0) / 2);
      }
    }
    if (s.spoiler) {
      const sz = zr + 0.14, sy = yb + 0.24;
      for (const sx of [-1, 1]) b.box(0.06, sy - yb, 0.08, DARK, sx * 0.45, yb, sz);
      b.box(W - 0.02, 0.06, 0.24, look.vip ? DARK : colD, 0, sy, sz - 0.02);
      for (const sx of [-1, 1]) b.box(0.04, 0.12, 0.28, DARK, sx * (W / 2 - 0.02), sy - 0.04, sz - 0.02);
    }
    if (look.vip) {
      // crown on the roof
      const cy = roofTop - 0.01, cz = rz;
      const G = 0xffd54d, GD = 0xe0a320;
      b.box(0.44, 0.1, 0.34, G, 0, cy, cz);
      b.box(0.46, 0.03, 0.36, GD, 0, cy, cz);
      for (const [x, z] of [[-0.19, 0.14], [0, 0.14], [0.19, 0.14], [-0.19, -0.14], [0, -0.14], [0.19, -0.14]]) {
        b.box(0.07, x === 0 ? 0.15 : 0.11, 0.06, G, x, cy + 0.1, z + cz);
        b.box(0.05, 0.05, 0.05, 0xfff3c0, x, cy + (x === 0 ? 0.25 : 0.21), z + cz);
      }
      b.box(0.08, 0.06, 0.02, 0xf26b5b, 0, cy + 0.035, cz + 0.172);               // gems
      b.box(0.06, 0.05, 0.02, 0x2a9d8f, -0.13, cy + 0.04, cz + 0.172);
      b.box(0.06, 0.05, 0.02, 0x2a9d8f, 0.13, cy + 0.04, cz + 0.172);
    }
    return b.build();
  });
}

// hood: local origin at the hinge (rear edge), extends toward +z
function hoodGeo(look) {
  return memo(geoCache, `hood|${look.type}|${look.color}|${look.vip ? 1 : 0}`, () => {
    const s = SPECS[look.type], hl = s.hz1 - s.hz0, hw = s.W - 0.06;
    const b = new Builder();
    b.box(hw, 0.05, hl, look.color, 0, 0, hl / 2);
    b.box(hw - 0.12, 0.012, hl - 0.12, lerpHex(look.color, 0xffffff, 0.12), 0, 0.05, hl / 2);   // soft highlight
    if (s.stripes) {
      const stc = look.vip ? 0xffffff : CREAM;
      for (const sx of [-1, 1]) b.box(0.1, 0.014, hl, stc, sx * 0.12, 0.05, hl / 2);
      b.box(0.3, 0.05, 0.22, DARK, 0, 0.05, hl * 0.45);                             // scoop
    }
    if (look.type === 'pickup') b.box(0.5, 0.04, hl - 0.15, shade(look.color, 0.85), 0, 0.05, hl / 2);
    return b.build();
  });
}

function wheelGeo(r, w, hub) {
  return memo(geoCache, `wheel|${r}|${w}|${hub}`, () => {
    const b = new Builder();
    const Z = Math.PI / 2;
    b.cyl(r, r, w, RUBBER, 0, -w / 2, 0, 12, 0, 0, Z);
    // tread blocks
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26;
      b.box(w * 0.8, 0.035, 0.08, 0x3a3f48, 0, (r - 0.004) * Math.cos(a) - 0.0175, (r - 0.004) * Math.sin(a), a);
    }
    b.cyl(r * 0.6, r * 0.6, w + 0.02, hub, 0, -(w + 0.02) / 2, 0, 10, 0, 0, Z);
    const hd = shade(hub, 0.62);
    b.box(w + 0.03, r * 0.95, 0.06, hd, 0, -r * 0.475, 0);                          // spokes: a cross so spin reads
    b.box(w + 0.03, 0.06, r * 0.95, hd, 0, -0.03, 0);
    b.cyl(r * 0.2, r * 0.2, w + 0.05, hub, 0, -(w + 0.05) / 2, 0, 8, 0, 0, Z);
    return b.build();
  });
}

// ---------------------------------------------------------------- damage overlays (per type)
function paintGeo(type) {
  return memo(geoCache, `paint|${type}`, () => {
    const s = SPECS[type], { W, y0, yb, cab } = s;
    const b = new Builder();
    const roofTop = cab.yt + 0.07, rz = (cab.f1 + cab.r1) / 2, rl = cab.f1 - cab.r1;
    // primer patches on the roof
    b.box(cab.w * 0.56, 0.014, rl * 0.6, PRIMER, -0.13, roofTop + 0.02, rz - rl * 0.12);
    b.box(cab.w * 0.28, 0.016, rl * 0.3, PRIMER_D, 0.2, roofTop + 0.02, rz + rl * 0.22);
    // rear deck patch
    const deckLen = cab.r0 - s.zr;
    if (deckLen > 0.3 && !s.bed) b.box(W * 0.5, 0.014, deckLen * 0.55, PRIMER, 0.15, yb + (s.stripes ? 0.014 : 0.002), (s.zr + cab.r0) / 2);
    if (s.bed) b.box(0.13, 0.014, (cab.r0 - s.zr) * 0.6, PRIMER, W / 2 - 0.04, yb + 0.255, (s.zr + cab.r0) / 2);
    // side panels: big primer patch, rust dots, scratches
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.008);
      const h = yb - y0;
      b.box(0.016, h * 0.5, 0.62, PRIMER, x, y0 + h * 0.3, -0.25 * sx);
      b.box(0.018, h * 0.28, 0.3, PRIMER_D, x, y0 + h * 0.38, 0.5 * sx);
      b.box(0.02, 0.07, 0.07, RUST, x, y0 + h * 0.2, 0.85 * sx);
      b.box(0.02, 0.05, 0.05, RUST, x, y0 + h * 0.62, -0.75 * sx);
      for (let i = 0; i < 3; i++) {
        b.box(0.02, 0.022, 0.5 - i * 0.08, SCRATCH, x * 1.002, y0 + h * (0.48 + i * 0.13), 0.15 + i * 0.07, -0.18 - i * 0.05);
      }
      // cabin side scuff
      b.box(0.02, 0.05, 0.3, PRIMER, sx * (cab.w / 2 + 0.022), cab.yt - 0.05, rz);
    }
    return b.build();
  });
}
function hoodPaintGeo(type) {
  return memo(geoCache, `hoodpaint|${type}`, () => {
    const s = SPECS[type], hl = s.hz1 - s.hz0, hw = s.W - 0.06;
    const b = new Builder();
    b.box(hw * 0.5, 0.016, hl * 0.55, PRIMER, hw * 0.18, 0.05, hl * 0.5);
    b.box(hw * 0.22, 0.018, hl * 0.25, PRIMER_D, -hw * 0.25, 0.05, hl * 0.25);
    b.box(0.022, 0.02, hl * 0.7, SCRATCH, -hw * 0.05, 0.062, hl * 0.5, 0, 0.5, 0);
    b.box(0.022, 0.02, hl * 0.5, SCRATCH, hw * 0.05, 0.062, hl * 0.45, 0, 0.62, 0);
    return b.build();
  });
}
function batteryGeo(type) {
  return memo(geoCache, `battery|${type}`, () => {
    const s = SPECS[type], hl = s.hz1 - s.hz0;
    const b = new Builder();
    b.box(s.W - 0.14, 0.02, hl - 0.06, 0x1f2329, 0, s.yb - 0.005, s.hz0 + hl / 2);           // engine bay
    b.box(0.34, 0.03, 0.3, 0x5c6670, -0.22, s.yb, s.hz0 + hl * 0.4);                          // engine cover
    b.box(0.08, 0.04, 0.24, 0xf26b5b, -0.22, s.yb + 0.03, s.hz0 + hl * 0.4);
    const bz = s.hz0 + hl * 0.55, bx = 0.26;
    b.box(0.3, 0.17, 0.24, 0x3f8fd6, bx, s.yb, bz);                                           // battery
    b.box(0.31, 0.03, 0.25, 0x2c6aa6, bx, s.yb + 0.17, bz);
    b.box(0.05, 0.05, 0.05, 0xd94848, bx - 0.08, s.yb + 0.2, bz + 0.06);                     // terminals
    b.box(0.05, 0.05, 0.05, DARK, bx + 0.08, s.yb + 0.2, bz + 0.06);
    b.box(0.03, 0.02, 0.2, 0xd94848, bx - 0.08, s.yb + 0.22, bz - 0.05);                     // loose cable
    return b.build();
  });
}
function propRodGeo(type) {
  return memo(geoCache, `rod|${type}`, () => {
    const s = SPECS[type], hl = s.hz1 - s.hz0;
    const b = new Builder();
    b.box(0.03, 0.5, 0.03, 0x9aa5ad, -0.5, s.yb, s.hz0 + hl * 0.62, -0.45);
    return b.build();
  });
}
/** Sagging rubber where a deflated tyre meets the floor (pivot space, origin on the floor). */
function bulgeGeo(r, w) {
  return memo(geoCache, `bulge|${r}|${w}`, () => {
    const b = new Builder();
    b.box(w * 1.6, 0.08, r * 1.1, RUBBER, 0, 0, 0);
    b.box(w * 1.3, 0.07, r * 1.5, RUBBER, 0, 0, 0);
    b.box(w * 1.75, 0.05, r * 0.7, 0x3a3f48, 0, 0, 0);
    return b.build();
  });
}
// shared fx resources
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const smokeMats = [   // young (dark) -> old (light)
  new THREE.MeshLambertMaterial({ color: 0x3e434a, flatShading: true }),
  new THREE.MeshLambertMaterial({ color: 0x737981, flatShading: true }),
  new THREE.MeshLambertMaterial({ color: 0xb4b9be, flatShading: true }),
];
const warnOn = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
const warnOff = new THREE.MeshLambertMaterial({ color: 0x5a1c1c });
const warnGeo = (() => {
  const b = new Builder();
  b.box(0.17, 0.13, 0.17, 0xffffff, 0, 0, 0);
  b.box(0.1, 0.08, 0.1, 0xffffff, 0, 0.13, 0);
  return b.build();
})();
// electric zap (dead battery): a jagged bolt of bright cubes, unlit; ~0.25 tall, base at the origin
const zapGeo = (() => {
  const b = new Builder();
  const pts = [[0, 0, 0], [0.05, 0.07, 0.03], [-0.03, 0.12, 0], [0.04, 0.19, -0.03], [-0.01, 0.26, 0.01]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / 0.02);
    for (let k = 0; k < n; k++) {
      const f = k / n;
      b.box(0.036, 0.036, 0.036, 0xfff3a0, ax + (bx - ax) * f, ay + (by - ay) * f - 0.018, az + (bz - az) * f);
    }
  }
  b.box(0.05, 0.05, 0.05, 0x9be8ff, 0.05, 0.045, 0.03);       // cyan flashes at the kinks
  b.box(0.05, 0.05, 0.05, 0x9be8ff, 0.04, 0.165, -0.03);
  b.box(0.056, 0.056, 0.056, 0xffffff, -0.01, 0.235, 0.01);
  return b.build();
})();
const sparkleGeo = (() => {
  const b = new Builder();
  b.box(0.05, 0.3, 0.05, 0xffffff, 0, -0.15, 0);
  b.box(0.3, 0.05, 0.05, 0xffffff, 0, -0.025, 0);
  b.box(0.05, 0.05, 0.3, 0xffffff, 0, -0.025, 0);
  b.box(0.1, 0.1, 0.1, 0xfff6c8, 0, -0.05, 0, 0.6, 0.6, 0);
  return b.build();
})();

// ---------------------------------------------------------------- public API
export function randomCarLook({ vip = false } = {}) {
  if (vip) return { type: 'sports', color: VIP_GOLD, vip: true };
  const keys = Object.keys(CAR_TYPES);
  let total = 0;
  for (const k of keys) total += CAR_TYPES[k].weight;
  let r = Math.random() * total, type = keys[0];
  for (const k of keys) { r -= CAR_TYPES[k].weight; if (r <= 0) { type = k; break; } }
  return { type, color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], vip: false };
}

export function createCar(look = randomCarLook()) {
  look = { ...look };
  if (!SPECS[look.type]) look.type = 'sedan';
  if (look.vip) look.color = look.color ?? VIP_GOLD;
  if (typeof look.color !== 'number') look.color = CAR_COLORS[0];
  const s = SPECS[look.type];

  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);
  chassis.add(mesh(bodyGeo(look), litMat, { cast: true, receive: true }));

  // hood on a hinge
  const hood = new THREE.Group();
  hood.position.set(0, s.yb, s.hz0);
  hood.add(mesh(hoodGeo(look)));
  chassis.add(hood);

  // wheels: pivot (position) > squash (deflated tyre) > spin (+ the space-saver spare, when fitted)
  const wg = wheelGeo(s.r, s.wr, look.vip ? 0xffd54d : look.type === 'sports' ? 0x9aa5ad : CHROME);
  const wheels = [];
  for (const [sx, z] of [[-1, s.ax], [1, s.ax], [-1, s.axR], [1, s.axR]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * s.wx, s.r, z);
    const squash = new THREE.Group();
    const spin = mesh(wg);
    squash.add(spin);
    pivot.add(squash);
    group.add(pivot);
    wheels.push({ pivot, squash, spin, sx, z, def: 0, target: 0, spare: null, bulge: null });
  }
  // Tyre problems: one wheel per 'tire' job, so a car with two tyre jobs has two bad wheels. A bad tyre is soft:
  // it sags, the body leans onto it and it thumps once per turn while driving (a deflated tyre is still drivable).
  // Some owners already swapped the first bad one for the little space-saver spare (yellow rim, sits lower).
  // The rear wheel on local -x goes first: it faces the camera both in the lane and on a lift.
  const TIRE_ORDER = [2, 0, 3, 1];
  const spareSlot = Math.random() < 0.4 ? 0 : -1;
  function setSpare(w, on) {
    if (on && !w.spare) {
      w.spare = mesh(wheelGeo(+(s.r * SPARE_K).toFixed(3), +(s.wr * 0.62).toFixed(3), SPARE_RIM));
      w.squash.add(w.spare);
    }
    if (w.spare) w.spare.visible = on;
    w.spin.visible = !on;
  }

  // ---- damage overlays (lazily created, then toggled)
  const dmg = {};
  const fx = { smoke: [], sparkles: [] };
  function ensure(type) {
    if (dmg[type]) return dmg[type];
    let o;
    if (type === 'paint') {
      o = new THREE.Group();
      o.add(mesh(paintGeo(look.type), litMat, { cast: false }));
      chassis.add(o);
      const hp = mesh(hoodPaintGeo(look.type), litMat, { cast: false });
      hood.add(hp);
      o.userData.hood = hp;
    } else if (type === 'battery') {
      o = new THREE.Group();
      const bay = mesh(batteryGeo(look.type), litMat, { cast: false });   // pokes through a shut hood: shown only when it is up
      o.add(bay);
      o.userData.bay = bay;
      const bz = s.hz0 + (s.hz1 - s.hz0) * 0.55;
      const warn = new THREE.Mesh(warnGeo, warnOn);
      warn.position.set(0.26, s.yb + 0.24, bz);
      o.add(warn);
      o.userData.warn = warn;
      const rod = mesh(propRodGeo(look.type), litMat, { cast: false });
      o.add(rod);
      o.userData.rod = rod;
      o.userData.bz = bz;
      o.userData.zaps = [];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(zapGeo, glowMat);
        m.visible = false;
        o.add(m);
        o.userData.zaps.push({ m, t: Math.random() * 0.5 });
      }
      o.userData.puffs = [];
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(unitBox, smokeMats[0]);
        m.visible = false;
        m.castShadow = false;
        o.add(m);
        o.userData.puffs.push({ m, age: 1, ox: 0 });
      }
      chassis.add(o);
    } else if (type === 'oil') {
      o = new THREE.Group();   // nothing on the car itself: drops fall to the floor and stay there (leak.js)
      group.add(o);
    } else if (type === 'engine') {
      o = new THREE.Group();
      chassis.add(o);
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(unitBox, smokeMats[0]);
        m.castShadow = false;
        o.add(m);
        fx.smoke.push({ m, age: i / 10, ox: (Math.random() - 0.5) * 0.5, oz: 0, rot: Math.random() * 3, big: 0.8 + Math.random() * 0.4 });
      }
    } else {
      o = new THREE.Group(); // 'tire': handled by the wheel squash + lean
      group.add(o);
    }
    dmg[type] = o;
    return o;
  }

  const active = new Set();
  let hoodA = 0;

  function setProblems(types = []) {
    const want = new Set(types);
    for (const t of ['tire', 'oil', 'battery', 'engine', 'paint']) {
      const on = want.has(t);
      if (on === active.has(t)) continue;
      if (on) active.add(t); else active.delete(t);
      if (on || dmg[t]) {
        const o = ensure(t);
        o.visible = on;
        if (o.userData.hood) o.userData.hood.visible = on;
      }
    }
    let nTire = 0;
    for (const ty of types) if (ty === 'tire') nTire++;
    for (let k = 0; k < TIRE_ORDER.length; k++) {
      const w = wheels[TIRE_ORDER[k]], on = k < nTire;
      if (k === spareSlot) setSpare(w, on);
      else w.target = on ? 1 : 0;
    }
  }

  // ---- shine (just repaired)
  let shineT = 0;
  const SHINE_TIME = 3.2;
  const shinePts = [];
  {
    const c = s.cab;
    const roofY = c.yt + 0.12;
    shinePts.push([c.w / 2, roofY, c.f1], [-c.w / 2, roofY, c.r1], [0.2, roofY, (c.f1 + c.r1) / 2],
      [s.W / 2, s.yb + 0.06, s.hz1], [-s.W / 2, s.yb + 0.06, (s.hz0 + s.hz1) / 2], [s.W / 2, s.yb, s.zr + 0.1],
      [-s.W / 2 - 0.02, s.y0 + 0.25, 0.2], [s.W / 2 + 0.02, s.y0 + 0.3, -0.4], [0, s.yb + 0.05, s.zf], [-0.3, s.yb + 0.03, s.zr]);
  }
  function setShine(on) {
    shineT = on ? SHINE_TIME : 0;
    if (on && !fx.sparkles.length) {
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(sparkleGeo, glowMat);
        m.visible = false;
        chassis.add(m);
        fx.sparkles.push({ m, age: i / 6 - 0.6, p: shinePts[i % shinePts.length] });
      }
    }
    if (!on) for (const sp of fx.sparkles) sp.m.visible = false;
  }

  // ---- per-frame
  let t = Math.random() * 10, blink = 0;
  let leakT = Math.random() * 0.5, leakD = 0;
  const leakKey = {};   // groups this car's drops into one puddle
  let parkedT = 0, crankT = 0;
  const PARKED = 0.6, CRANK = 0.55;
  // Dead battery, starting up: the car shudders and coughs black smoke out of the exhaust before it gets going.
  function crank() {
    crankT = CRANK;
    ensure('battery').userData.puffs.forEach((p, i) => { p.age = -i * 0.07; p.ox = (Math.random() - 0.5) * 0.12; });
  }
  function update(dt = 0.016, speed = 0) {
    t += dt;
    const sp = Number.isFinite(speed) ? speed : 0;
    if (Math.abs(sp) < 0.05) parkedT += dt;
    else {
      if (parkedT > PARKED && active.has('battery')) crank();
      parkedT = 0;
    }
    const parked = parkedT > PARKED;
    const mv = Math.min(1, Math.abs(sp) / 4);
    const roll = (sp * dt) / s.r;

    // tyres: soft ones sag + bulge at the floor, the spare sits lower; the body leans onto the low corners
    let tilt = 0, pitch = 0, sink = 0, thump = 0;
    for (const w of wheels) {
      let h;   // how far this corner sits below normal
      if (w.spare && w.spare.visible) {
        w.def = 0;
        w.squash.scale.set(1, 1, 1);
        w.pivot.position.y = s.r * SPARE_K;
        w.spare.rotation.x += roll / SPARE_K;
        h = s.r * (1 - SPARE_K);
      } else {
        w.def += (w.target - w.def) * Math.min(1, dt * (w.target ? 6 : 10));
        if (w.def < 0.002) w.def = 0;
        const d = w.def;
        w.squash.scale.set(1 + 0.6 * d, 1 - SAG * d, 1 + 0.2 * d);
        w.pivot.position.y = s.r * (1 - SAG * d);
        w.spin.rotation.x += roll;
        h = s.r * SAG * d;
        if (d > 0 && !w.bulge) { w.bulge = mesh(bulgeGeo(s.r, s.wr), litMat, { cast: false }); w.pivot.add(w.bulge); }
        if (w.bulge) {
          w.bulge.visible = d > 0.02;
          w.bulge.position.set(w.sx * 0.06 * d, -w.pivot.position.y, 0);   // sags outward, out from under the body
          w.bulge.scale.set(0.6 + 0.4 * d, d, 0.6 + 0.4 * d);
        }
        thump += d * Math.pow(Math.abs(Math.sin(w.spin.rotation.x)), 12);   // the flat bit comes round
      }
      tilt += -w.sx * h;
      pitch += (w.z > 0 ? 1 : -1) * h;
      sink += h;
    }
    let shake = 0;
    if (crankT > 0) { crankT = Math.max(0, crankT - dt); shake = crankT / CRANK; }
    const dead = parked && active.has('battery');   // engine off: no idle vibration
    chassis.position.y = Math.sin(t * 17) * 0.012 * mv + (dead ? 0 : Math.sin(t * 43) * 0.004) - sink * 0.3
      - thump * 0.03 * mv + Math.abs(Math.sin(t * 41)) * 0.02 * shake;
    chassis.rotation.z = (tilt / s.wx) * 1.05 + Math.sin(t * 63) * 0.03 * shake;
    chassis.rotation.x = pitch * 0.55 + Math.sin(t * 9) * 0.004 * mv;

    // dead battery: the hood pops up once the car stands still (and shuts before it drives: nobody drives blind)
    const hoodTarget = dead ? 1 : 0;
    hoodA += (hoodTarget - hoodA) * Math.min(1, dt * (hoodTarget ? 5 : 12));
    hood.rotation.x = -0.95 * hoodA;

    if (dmg.battery) {
      const B = dmg.battery.userData, on = active.has('battery');
      B.bay.visible = hoodA > 0.2;
      B.rod.visible = hoodA > 0.85;
      B.warn.visible = hoodA > 0.5;
      if (on) {
        blink += dt;
        B.warn.material = blink % 0.7 < 0.35 ? warnOn : warnOff;
        B.warn.scale.setScalar(blink % 0.7 < 0.35 ? 1.15 : 0.9);
      }
      // zaps: crackling at the terminals while parked with the hood up, now and then out of the hood seam on the move
      for (const z of B.zaps) {
        z.t -= dt;
        if (z.t > 0) continue;
        if (z.m.visible || !on) { z.m.visible = false; z.t = parked ? 0.1 + Math.random() * 0.5 : 0.7 + Math.random() * 1.5; continue; }
        if (parked ? hoodA < 0.6 : (z !== B.zaps[0] || mv < 0.05)) { z.t = 0.15; continue; }
        z.m.visible = true;
        z.t = 0.05 + Math.random() * 0.08;
        if (parked) z.m.position.set(0.26 + (Math.random() < 0.5 ? -0.08 : 0.08), s.yb + 0.22, B.bz + 0.06);
        else z.m.position.set((Math.random() - 0.5) * 0.7, s.yb + 0.03, s.hz1 - 0.05);
        z.m.rotation.set((Math.random() - 0.5) * 0.9, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.9);
        z.m.scale.setScalar(parked ? 0.95 + Math.random() * 0.5 : 0.75 + Math.random() * 0.3);
      }
      for (const p of B.puffs) {
        if (p.age >= 1) { if (p.m.visible) p.m.visible = false; continue; }
        p.age += dt * 1.5;
        const a = Math.min(1, p.age);
        p.m.visible = a > 0 && a < 1 && on;
        if (!p.m.visible) continue;
        p.m.material = smokeMats[a < 0.35 ? 0 : a < 0.7 ? 1 : 2];
        p.m.scale.setScalar(Math.max(0.001, (0.1 + a * 0.24) * (a > 0.75 ? (1 - a) / 0.25 : 1)));
        p.m.position.set(-0.4 + p.ox + Math.sin(a * 5 + p.ox * 30) * 0.05, s.y0 + 0.06 + a * 0.5, s.zr - 0.14 - a * 0.75);
        p.m.rotation.set(a * 3, a * 2, 0);
      }
    }
    if (active.has('engine')) {
      const zc = s.hz0 + (s.hz1 - s.hz0) * 0.6;
      for (const p of fx.smoke) {
        p.age += dt * 0.8;
        if (p.age >= 1) {
          p.age -= 1;
          p.ox = (Math.random() - 0.5) * 0.55;
          p.oz = (Math.random() - 0.5) * 0.4;
          p.rot = Math.random() * 3;
          p.big = 0.8 + Math.random() * 0.4;
        }
        const a = p.age;
        const sc = (a < 0.15 ? (a / 0.15) * 0.14 : 0.14 + (a - 0.15) * 0.3) * p.big * (a > 0.8 ? (1 - a) / 0.2 : 1);
        p.m.visible = sc > 0.015;
        p.m.material = smokeMats[a < 0.3 ? 0 : a < 0.6 ? 1 : 2];
        p.m.scale.setScalar(Math.max(0.001, sc));
        p.m.position.set(p.ox * (0.4 + a) + Math.sin(a * 6 + p.rot) * 0.06, s.yb + 0.1 + a * 1.5, zc + p.oz - a * 0.35);
        p.m.rotation.set(a * 2 + p.rot, p.rot + a * 3, 0);
      }
    }
    if (active.has('oil') && group.parent) {
      // A drop every ~0.6 s while parked (they pile up into a puddle), one every ~0.7 m while driving (a trail).
      leakT -= dt;
      leakD -= Math.abs(sp) * dt;
      if (leakT <= 0 || leakD <= 0) {
        leakT = 0.5 + Math.random() * 0.25;
        leakD = 0.55 + Math.random() * 0.25;
        const lx = (Math.random() - 0.5) * 0.28, lz = s.ax + 0.1 + (Math.random() - 0.5) * 0.18;   // under the sump
        const yaw = group.rotation.y, c = Math.cos(yaw), sn = Math.sin(yaw), g = group.position;
        leakDrop(group.parent, g.x + lx * c + lz * sn, g.y + s.y0, g.z - lx * sn + lz * c, leakKey);
      }
    }
    if (shineT > 0) {
      shineT -= dt;
      for (const spk of fx.sparkles) {
        spk.age += dt * 1.8;
        if (spk.age >= 1) {
          spk.age -= 1;
          spk.p = shinePts[Math.floor(Math.random() * shinePts.length)];
        }
        const k = spk.age;
        const on = k > 0 && shineT > 0;
        spk.m.visible = on;
        if (!on) continue;
        const sc = Math.sin(k * Math.PI) * 0.9;
        spk.m.scale.setScalar(Math.max(0.001, sc));
        spk.m.position.set(spk.p[0], spk.p[1] + 0.15 + k * 0.1, spk.p[2]);
        spk.m.rotation.set(0, k * 2.5, k * 1.2);
      }
      if (shineT <= 0) for (const spk of fx.sparkles) spk.m.visible = false;
    }
  }

  setProblems([]);
  update(0, 0);
  return { group, look, setProblems, setShine, update };
}
