// Chunky toy-like voxel cars: five body types + gold VIP, four spinning wheels, per-problem damage.
// One merged body mesh per look (cached), a separate hood (opens for battery trouble), 4 wheel meshes sharing one
// geometry per wheel size. Damage overlays are built once per type and only toggled; all materials are shared.
import * as THREE from 'three';
import { CAR_TYPES } from '../config.js';
import { Builder, litMat, glowMat, memo, mesh, polygon } from './voxel.js';

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
    b.box(0.03, 0.5, 0.03, 0x9aa5ad, -0.5, s.yb, s.hz0 + hl * 0.62, -0.45);               // hood prop rod
    return b.build();
  });
}
const puddleGeo = (() => {
  let g = null;
  return () => g || (g = (() => {
    // wide enough to peek out on both sides of the car (the game camera mostly sees roofs)
    const b = new Builder();
    const O = 0x2b3640, S = 0x55627a, S2 = 0x7b8ba0;
    b.cyl(0.62, 0.62, 0.012, O, 0, 0, 0, 16);
    b.cyl(0.4, 0.4, 0.012, O, 0.62, 0, 0.12, 12);
    b.cyl(0.36, 0.36, 0.012, O, -0.6, 0, 0.22, 12);
    b.cyl(0.24, 0.24, 0.012, O, 0.92, 0, -0.2, 10);
    b.cyl(0.2, 0.2, 0.012, O, -0.9, 0, -0.12, 10);
    b.cyl(0.3, 0.3, 0.012, O, 0.1, 0, 0.58, 12);
    b.cyl(0.1, 0.1, 0.012, O, 1.12, 0, 0.12, 8);
    b.cyl(0.08, 0.08, 0.012, O, -1.1, 0, 0.3, 8);
    b.cyl(0.18, 0.18, 0.014, S, -0.2, 0, 0.1, 10);                 // sheen
    b.cyl(0.12, 0.12, 0.014, S, 0.7, 0, 0.05, 8);
    b.cyl(0.07, 0.07, 0.016, S2, 0.2, 0, 0.36, 8);
    b.cyl(0.06, 0.06, 0.016, S2, -0.62, 0, 0.3, 6);
    return b.build();
  })());
})();

// shared fx resources
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const smokeMats = [   // young (dark) -> old (light)
  new THREE.MeshLambertMaterial({ color: 0x3e434a, flatShading: true }),
  new THREE.MeshLambertMaterial({ color: 0x737981, flatShading: true }),
  new THREE.MeshLambertMaterial({ color: 0xb4b9be, flatShading: true }),
];
const dripMat = new THREE.MeshLambertMaterial({ color: 0x1d2026 });
const warnOn = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
const warnOff = new THREE.MeshLambertMaterial({ color: 0x5a1c1c });
const warnGeo = (() => {
  const b = new Builder();
  b.box(0.17, 0.13, 0.17, 0xffffff, 0, 0, 0);
  b.box(0.1, 0.08, 0.1, 0xffffff, 0, 0.13, 0);
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

  // wheels: pivot (position) > squash (flat tyre) > spin
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
    wheels.push({ pivot, squash, spin });
  }
  const flatWheel = wheels[2]; // rear wheel on local -x: faces the camera both in the lane and on a lift

  // ---- damage overlays (lazily created, then toggled)
  const dmg = {};
  const fx = { smoke: [], drips: [], sparkles: [] };
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
      o.add(mesh(batteryGeo(look.type), litMat, { cast: false }));
      const warn = new THREE.Mesh(warnGeo, warnOn);
      warn.position.set(0.26, s.yb + 0.24, s.hz0 + (s.hz1 - s.hz0) * 0.55);
      o.add(warn);
      o.userData.warn = warn;
      chassis.add(o);
    } else if (type === 'oil') {
      o = new THREE.Group();
      const p = mesh(puddleGeo(), litMat, { cast: false, receive: true });
      p.position.set(0, 0, s.ax + 0.12);
      o.add(p);
      o.userData.puddle = p;
      group.add(o);
      for (let i = 0; i < 3; i++) {
        const d = new THREE.Mesh(unitBox, dripMat);
        d.scale.set(0.05, 0.08, 0.05);
        o.add(d);
        fx.drips.push({ m: d, age: i / 3, x: -0.2 + i * 0.22 });
      }
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
  let hoodTarget = 0, hoodA = 0, lean = 0, leanTarget = 0;

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
    hoodTarget = active.has('battery') ? 1 : 0;
    leanTarget = active.has('tire') ? 1 : 0;
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
  const flatY = s.r * 0.52;
  function update(dt = 0.016, speed = 0) {
    t += dt;
    const sp = Number.isFinite(speed) ? speed : 0;
    const roll = (sp * dt) / s.r;
    for (const w of wheels) if (!(w === flatWheel && leanTarget)) w.spin.rotation.x += roll;

    // flat tyre: squash the wheel and lean the body toward it
    lean += (leanTarget - lean) * Math.min(1, dt * 8);
    flatWheel.squash.scale.set(1 + 0.62 * lean, 1 - 0.48 * lean, 1 + 0.26 * lean);
    flatWheel.pivot.position.y = s.r - (s.r - flatY) * lean;
    if (lean > 0.01 && flatWheel.spin.rotation.x !== 0) flatWheel.spin.rotation.x *= 1 - lean;

    const mv = Math.min(1, Math.abs(sp) / 4);
    chassis.position.y = Math.sin(t * 17) * 0.012 * mv + Math.sin(t * 43) * 0.004 - 0.07 * lean;
    chassis.rotation.z = 0.13 * lean;
    chassis.rotation.x = -0.045 * lean + Math.sin(t * 9) * 0.004 * mv;

    // hood ajar
    hoodA += (hoodTarget - hoodA) * Math.min(1, dt * 6);
    hood.rotation.x = -0.95 * hoodA;

    if (active.has('battery')) {
      blink += dt;
      const w = dmg.battery.userData.warn;
      w.material = blink % 0.7 < 0.35 ? warnOn : warnOff;
      w.scale.setScalar(blink % 0.7 < 0.35 ? 1.15 : 0.9);
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
    if (active.has('oil')) {
      const gy = group.position.y;
      const o = dmg.oil;
      o.userData.puddle.position.y = 0.012 - gy;                 // stays on the floor while the lift raises the car
      const pu = 0.88 + Math.sin(t * 1.3) * 0.03;
      o.userData.puddle.scale.set(pu, 1, pu);
      const top = s.y0 + 0.02, fall = top + gy;
      for (const d of fx.drips) {
        d.age += dt * (1.1 / Math.max(0.4, Math.sqrt(fall)));
        if (d.age >= 1) d.age -= 1;
        const k = d.age;
        d.m.position.set(d.x, top - fall * k * k, s.L / 2 - 0.42);
        d.m.visible = k > 0.15;
        d.m.scale.y = 0.06 + k * 0.08;
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
