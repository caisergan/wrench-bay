// Chunky toy-like voxel cars: the five garage body types + gold VIP, the six town classes (TOWN_CAR_TYPES), the four
// club cars (VIP_CAR_TYPES) and the six restorable classics (CLASSICS). Four wheels that spin, per-problem damage, and
// the town states: paint sweep, stripes, masking, dirt, foam, wet, gloss per side, hazards, towing, restore stages.
//
// Cost model: one merged body mesh per (type, colour, variant) look, cached and shared; a separate hood (opens for
// battery trouble); 4 wheel meshes sharing one geometry per wheel size. Every overlay (damage, dirt, foam, masking,
// gloss, ...) is built once per type, then only toggled; all materials are shared. Nothing is allocated per frame.
// A car never edits a shared geometry: recolouring swaps in another cached geometry, so two cars that share a look
// stay independent.
import * as THREE from 'three';
import { CAR_TYPES, TOWN_CAR_TYPES, VIP_CAR_TYPES, CLASSICS } from '../config.js';
import { Builder, litMat, glowMat, memo, mesh, polygon, mulberry32 } from './voxel.js';
import { leakDrop, waterDrop } from './leak.js';

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
/** Club car paint: deep, rich colours (plus pearl and champagne). */
export const VIP_COLORS = [0x1d2026, 0xf4f1ea, 0x6e1f2c, 0x1f3a5f, 0xd9b26a, 0x2f4a3c, 0x8a8f96];
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
const FLAT_DROP = 0.38;       // a flat tyre's rim sinks this much of the radius towards the floor (bead at 0.6 r)
const FLAT_BULGE = 0.4;       // and its sidewalls bulge out up to this much of the tyre width at the contact patch
const FLAT_SPREAD = 0.16;
const LEAN_GIVE = 0.005;      // a corner may settle this much lower than its own wheel (the arch keeps 3 cm of air)     // the squashed tread spreads along the floor, fore and aft, by up to this much
const WORN = 0x56534d, WORN_L = 0x67635b, WORN_D = 0x3e3b37, CRACK = 0x25272b;   // bald, sun-dried rubber
const CORD = 0xbfc4c8, CORD_RUST = 0x9a6a44;                                       // the steel belt showing through
const PRIMER = 0xa3a8ad;
const PRIMER_D = 0x868c93;
const RUST = 0xa8552e;
const RUST_D = 0x7a3a1e;
const SCRATCH = 0xf7f3ea;
const WHITE = 0xf4f1ea;
const SEAT = 0x8a4b32;        // tan leather
const SEAT_L = 0xe8dcc4;      // cream leather
const WOOD = 0xc8935a, WOOD_D = 0x8a5a32;
const HAB = 0xf3eee4;         // camper box
const DULL_CHROME = 0x8f8a80;
/** Tyre-contact height of a towed car's front wheels at setTowed(1) (the tow truck's hitch uses the same number). */
export const TOW_LIFT = 0.42;

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _roll = new THREE.Vector3();
const shade = (hex, k) => _c.set(hex).multiplyScalar(k).getHex();
const lerpHex = (a, b, k) => _c.set(a).lerp(_c2.set(b), k).getHex();
const lum = (hex) => { _c.set(hex); return 0.3 * _c.r + 0.59 * _c.g + 0.11 * _c.b; };
/** Perceived brightness of a paint hex in sRGB (0..1). Every customer colour is > 0.4, club blacks / navy / wine < 0.3. */
const brightness = (hex) => (0.3 * ((hex >> 16) & 255) + 0.59 * ((hex >> 8) & 255) + 0.11 * (hex & 255)) / 255;

// ---------------------------------------------------------------- body specs
// z runs rear (-) to nose (+). y0 = body bottom, yb = belt line (top of the lower body / hood base).
// cab = cabin trapezoid: bottom rear/front z (r0, f0) at yb, top rear/front z (r1, f1) at yt, width w.
// pillars = z of the side window posts. Optional: rf / wrf (front wheel radius / width), wx (wheel centre x),
// open (no roof: windshield + cockpit), grille ('intake' | 'wide' | 'tall' | 'oval' | 'none'),
// lights ('round' | 'slim' | 'quad' | 'covered' | 'none'), hub (rim colour), rim ('std' | 'white' | 'wire'),
// cabColor / roofColor, top (override of the highest flat surface), deck (false: no open rear deck),
// hw (hood width, default W - 0.06; narrower between fenders), engine ('front' | 'mid' | 'rear': where smoke and oil come
// from), bayEngine (false: the battery bay shows no engine cover, e.g. a front trunk), batteryZ (battery along the hood),
// lift (raises the whole body: room for a fender over the arches), hump (false: never a fender hump; the type brings its own
// fenders).
const SPECS = {
  compact: {
    L: 2.3, W: 1.28, r: 0.27, wr: 0.25, ax: 0.74, axR: -0.74, y0: 0.2, yb: 0.64, noseCh: 0.13, tailCh: 0.05,
    cab: { r0: -1.09, f0: 0.34, r1: -1.0, f1: -0.08, yt: 1.24, w: 1.16 }, pillars: [-0.46],
    bumper: CHROME, roofColor: CREAM, roundLights: true,
  },
  sedan: {
    L: 2.7, W: 1.28, r: 0.27, wr: 0.25, ax: 0.86, axR: -0.86, y0: 0.2, yb: 0.6, noseCh: 0.1, tailCh: 0.08,
    cab: { r0: -0.8, f0: 0.4, r1: -0.52, f1: 0.06, yt: 1.1, w: 1.14 }, pillars: [-0.22],
    bumper: TRIM, chromeStrip: true, lift: 0.02,
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
    cab: { r0: -0.84, f0: 0.22, r1: -0.52, f1: -0.18, yt: 0.95, w: 0.88 }, pillars: [],
    bumper: DARK, stripes: true, spoiler: true, slimLights: true, grille: 'intake', hub: 0x9aa5ad,
  },

  // ---- town classes (TOWN_CAR_TYPES)
  hatch: {   // modern hatchback: sloped tailgate, blacked-out glasshouse, roof spoiler
    L: 2.46, W: 1.32, r: 0.27, wr: 0.25, ax: 0.8, axR: -0.8, y0: 0.2, yb: 0.62, noseCh: 0.17, tailCh: 0.04,
    cab: { r0: -1.15, f0: 0.3, r1: -0.84, f1: -0.12, yt: 1.2, w: 1.18 }, pillars: [-0.36],
    bumper: DARK, cabColor: DARK, roofColor: DARK, lights: 'slim',
  },
  suv: {     // tall 4x4: high ground clearance, cladding, roof rails, spare on the tailgate
    L: 2.74, W: 1.4, r: 0.33, wr: 0.28, ax: 0.9, axR: -0.9, y0: 0.38, yb: 0.9, noseCh: 0.13, tailCh: 0.03,
    cab: { r0: -1.28, f0: 0.5, r1: -1.24, f1: 0.2, yt: 1.52, w: 1.3 }, pillars: [-0.02, -0.66],
    bumper: DARK, hub: 0x9aa5ad,
  },
  muscle: {  // long hood, fastback, scoop, twin stripes, fat rear tyres, side pipes
    L: 2.8, W: 1.42, r: 0.3, wr: 0.28, rf: 0.28, wrf: 0.26, ax: 0.94, axR: -0.9, y0: 0.2, yb: 0.58, noseCh: 0.05,
    tailCh: 0.05, cab: { r0: -1.24, f0: 0.06, r1: -0.52, f1: -0.24, yt: 1.02, w: 0.86 }, pillars: [-0.5],
    bumper: CHROME, grille: 'wide', lights: 'quad', hub: 0x9aa5ad,
  },
  camper: {  // motorhome: small cab, tall living box with an alcove over the cab
    L: 2.78, W: 1.42, r: 0.27, wr: 0.25, ax: 0.96, axR: -0.82, y0: 0.24, yb: 0.72, noseCh: 0.16, tailCh: 0.02,
    cab: { r0: 0.34, f0: 0.86, r1: 0.36, f1: 0.64, yt: 1.3, w: 1.32 }, pillars: [],
    bumper: DARK, deck: false,
  },
  roadster: { // open two-seater: windshield, roll hoops, folded top
    L: 2.62, W: 1.34, r: 0.27, wr: 0.25, ax: 0.86, axR: -0.86, y0: 0.18, yb: 0.54, noseCh: 0.16, tailCh: 0.1,
    cab: { r0: -0.66, f0: 0.14, r1: -0.66, f1: -0.06, yt: 0.9, w: 1.18 }, pillars: [], open: true,
    bumper: DARK, lights: 'round', hub: 0x9aa5ad,
  },
  rally: {   // raised hatch with a wing, light pod, mud flaps and a livery
    L: 2.52, W: 1.38, r: 0.29, wr: 0.27, ax: 0.82, axR: -0.82, y0: 0.28, yb: 0.68, noseCh: 0.16, tailCh: 0.05,
    cab: { r0: -1.06, f0: 0.3, r1: -0.92, f1: -0.1, yt: 1.26, w: 1.2 }, pillars: [-0.4],
    bumper: DARK, hub: WHITE,
  },

  // ---- club cars (VIP_CAR_TYPES)
  supercar: { // mid-engine wedge: cab-forward canopy, huge wing, side intakes
    L: 2.8, W: 1.46, r: 0.29, wr: 0.3, ax: 0.92, axR: -0.9, y0: 0.14, yb: 0.44, noseCh: 0.2, tailCh: 0.06,
    cab: { r0: -0.62, f0: 0.46, r1: -0.34, f1: -0.02, yt: 0.86, w: 1.04 }, pillars: [],
    bumper: DARK, grille: 'intake', lights: 'slim', hub: 0x2f333a, hw: 0.74, engine: 'mid', bayEngine: false,
  },
  limo: {    // long luxury saloon: upright chrome grille, hood ornament, long rear doors
    L: 2.8, W: 1.36, r: 0.27, wr: 0.25, ax: 0.98, axR: -0.96, y0: 0.22, yb: 0.64, noseCh: 0.05, tailCh: 0.06,
    cab: { r0: -0.86, f0: 0.42, r1: -0.72, f1: 0.2, yt: 1.12, w: 1.2 }, pillars: [0.0, -0.42],
    bumper: CHROME, chromeStrip: true, grille: 'tall', roofColor: 0x2b2f36,
  },
  classic: { // open-top classic tourer: flowing fenders, chrome headlamps, boat tail, whitewalls
    L: 2.8, W: 1.28, r: 0.3, wr: 0.2, ax: 0.98, axR: -0.86, wx: 0.6, y0: 0.3, yb: 0.66, noseCh: 0.06, tailCh: 0.3,
    cab: { r0: -0.52, f0: 0.06, r1: -0.52, f1: -0.04, yt: 1.0, w: 1.12 }, pillars: [], open: true,
    bumper: CHROME, grille: 'tall', lights: 'none', rim: 'white', hump: false,
  },
  gsuv: {    // luxury 4x4: bolt-upright, chrome grille, running boards
    L: 2.78, W: 1.44, r: 0.34, wr: 0.3, ax: 0.9, axR: -0.92, y0: 0.38, yb: 0.92, noseCh: 0.06, tailCh: 0.03,
    cab: { r0: -1.3, f0: 0.6, r1: -1.29, f1: 0.48, yt: 1.6, w: 1.34 }, pillars: [0.0, -0.66],
    bumper: CHROME, grille: 'tall', lights: 'round',
  },

  // ---- classics (CLASSICS ids): restorable project cars
  bubble: {  // Bubble 58: tiny rounded rear-engined car, domed roof with a fold-back canvas top, lamp pods, rack on the tail
    L: 2.24, W: 1.28, r: 0.22, wr: 0.18, ax: 0.68, axR: -0.7, y0: 0.22, yb: 0.6, noseCh: 0.24, tailCh: 0.22,
    cab: { r0: -0.9, f0: 0.44, r1: -0.6, f1: 0.14, yt: 1.22, w: 1.12 }, pillars: [-0.22],
    bumper: CHROME, lights: 'none', grille: 'none', hub: CREAM, engine: 'rear', bayEngine: false,
  },
  woody: {   // Woody Wagon: estate with timber-framed sides and luggage on the roof
    L: 2.78, W: 1.36, r: 0.28, wr: 0.25, ax: 0.9, axR: -0.88, y0: 0.22, yb: 0.64, noseCh: 0.1, tailCh: 0.02,
    cab: { r0: -1.3, f0: 0.3, r1: -1.28, f1: 0.04, yt: 1.26, w: 1.24 }, pillars: [-0.3, -0.82],
    bumper: CHROME, grille: 'tall', lights: 'round', cabColor: WOOD, rim: 'white',
  },
  surfvan: { // Surf Bus: flat-faced bus with a V front, split windshield, surfboard
    L: 2.66, W: 1.38, r: 0.27, wr: 0.24, ax: 0.86, axR: -0.88, y0: 0.22, yb: 0.76, noseCh: 0.06, tailCh: 0.04,
    cab: { r0: -1.27, f0: 0.86, r1: -1.25, f1: 0.74, yt: 1.52, w: 1.32 }, pillars: [0.4, -0.12, -0.62],
    bumper: CHROME, cabColor: CREAM, roofColor: CREAM, lights: 'round', grille: 'none', hub: CREAM, engine: 'rear',
    bayEngine: false,
  },
  hotrod: {  // Flame Rod: narrow body, exposed big wheels, blower through the hood, chopped roof, flames
    L: 2.7, W: 0.9, r: 0.36, wr: 0.26, rf: 0.27, wrf: 0.2, wx: 0.62, wxf: 0.6, ax: 0.98, axR: -0.84, y0: 0.32,
    yb: 0.74, noseCh: 0.04, tailCh: 0.12, cab: { r0: -0.9, f0: -0.08, r1: -0.84, f1: -0.2, yt: 1.12, w: 0.86 },
    pillars: [], bumper: null, grille: 'none', lights: 'none', bayEngine: false, batteryZ: 0.86,
  },
  finback: { // Finback Eight: long fifties saloon with tail fins and a chrome spear
    L: 2.8, W: 1.42, r: 0.27, wr: 0.25, ax: 0.92, axR: -0.9, y0: 0.22, yb: 0.6, noseCh: 0.08, tailCh: 0.04,
    cab: { r0: -0.8, f0: 0.36, r1: -0.52, f1: 0.12, yt: 1.06, w: 1.24 }, pillars: [-0.2],
    bumper: CHROME, roofColor: CREAM, grille: 'wide', lights: 'quad', rim: 'white', lift: 0.02,
  },
  gt: {      // Gran Corsa: sixties grand tourer, long tapering nose, covered lamps, wire wheels, racing roundel
    L: 2.74, W: 1.36, r: 0.27, wr: 0.25, ax: 0.88, axR: -0.86, y0: 0.18, yb: 0.5, noseCh: 0.24, tailCh: 0.06,
    cab: { r0: -1.02, f0: 0.02, r1: -0.62, f1: -0.28, yt: 0.98, w: 0.92 }, pillars: [-0.5],
    bumper: CHROME, grille: 'oval', lights: 'covered', rim: 'wire',
  },
};
// ---------------------------------------------------------------- wheel arches
// Every tyre sits in an arch: a keep-out around its axle (radius r + TREAD + ARCH_GAP) that runs from ARCH_GAPX inside
// the tyre's inner face outwards, cut out of the lower body. The lower body is a core between the wheel wells plus an
// outer strip per side carrying the arches; a dark well wall stands behind each tyre. Nothing of the body or of an
// overlay may enter a keep-out (CarBuilder cuts side panels around it), so a tyre never runs through a panel, flat or
// not. Where the belt line is too low for a fender over the arch (sports cars, roadsters, the GT) the fender rises in
// a hump over the wheel, and the hood fits between the front humps.
const TREAD = 0.0135;        // tread blocks stand this far proud of the rubber
const ARCH_GAP = 0.03;       // air between the tread and the arch
const ARCH_GAPX = 0.03;      // air between the tyre's inner face and the wheel-well wall
const FENDER_MIN = 0.035;    // thinnest fender over an arch before it gets a hump
const HUMP_T = 0.06;         // fender thickness over a humped arch
const WELL = 0x1c2025;

/** y on a polyline of [z, y] points (ascending z), held flat past the ends. */
function polyAt(pts, z) {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (z > pts[i][0]) continue;
    const [za, ya] = pts[i - 1], [zb, yb] = pts[i];
    return zb - za < 1e-9 ? yb : ya + (yb - ya) * (z - za) / (zb - za);
  }
  return pts[pts.length - 1][1];
}
/** The plain lower-body side profile (chamfered box), its top edge and its bottom edge. */
const bodyProfile = (s) => [
  [s.zr + 0.06, s.y0], [s.zf - 0.06, s.y0], [s.zf, s.y0 + 0.06], [s.zf, s.yb - s.noseCh], [s.zf - s.noseCh, s.yb],
  [s.zr + s.tailCh, s.yb], [s.zr, s.yb - s.tailCh], [s.zr, s.y0 + 0.06],
];
const profTop = (s, z) => polyAt([[s.zr, s.yb - s.tailCh], [s.zr + s.tailCh, s.yb], [s.zf - s.noseCh, s.yb], [s.zf, s.yb - s.noseCh]], z);
const profBase = (s, z) => polyAt([[s.zr, s.y0 + 0.06], [s.zr + 0.06, s.y0], [s.zf - 0.06, s.y0], [s.zf, s.y0 + 0.06]], z);
/** Top of an arch's keep-out at z: a half circle over the axle with straight sides down to the floor. */
const archTop = (a, z) => { const dz = Math.abs(z - a.z); return dz <= a.R + 1e-9 ? a.cy + Math.sqrt(Math.max(0, a.R * a.R - dz * dz)) : -Infinity; };
/** A fender hump: flat over the middle of the arch, sloping down to the belt line, HUMP_T thick over the arch. */
const humpTop = (a, z) => (a.hump ? a.cy + a.R + HUMP_T - Math.max(0, Math.abs(z - a.z) - a.R * 0.55) * 1.25 : -Infinity);
const archSamples = (a, n = 10) => Array.from({ length: n + 1 }, (_, i) => a.z - a.R * Math.cos((i / n) * Math.PI));

/** Upper envelope of some functions of z, as a polyline: the given sample points plus every point where the
 *  topmost function changes (found by bisection), so arcs, ramps and chamfers meet exactly. */
function envelope(fns, zs, z0, z1) {
  zs = [...new Set(zs.filter((z) => z >= z0 && z <= z1).concat(z0, z1).map((z) => +z.toFixed(6)))].sort((a, b) => a - b);
  const top = (z) => { let m = -Infinity, k = -1; for (let i = 0; i < fns.length; i++) { const v = fns[i](z); if (v > m) { m = v; k = i; } } return [m, k]; };
  const out = [];
  const add = (z, y) => { const l = out[out.length - 1]; if (!l || Math.abs(l[0] - z) > 1e-5 || Math.abs(l[1] - y) > 1e-5) out.push([z, y]); };
  for (let i = 0; i < zs.length; i++) {
    const [y, k] = top(zs[i]);
    add(zs[i], y);
    if (i + 1 === zs.length || top(zs[i + 1])[1] === k) continue;
    let a = zs[i], b = zs[i + 1];
    for (let it = 0; it < 40; it++) { const m = (a + b) / 2; if (top(m)[1] === k) a = m; else b = m; }
    add(a, top(a)[0]);
    add(b, top(b)[0]);
  }
  return out;
}

function setupArches(s) {
  // keep-outs round every tyre (overlays are cut around them); arches: those that cut into the body (a wheel standing
  // clear of a narrow body, like the hot rod's, needs no arch but still no mud or foam inside it)
  s.keeps = [[s.ax, s.rf, s.wrf, s.wxf, true], [s.axR, s.r, s.wr, s.wx, false]]
    .map(([z, r, w, x, front]) => ({ z, cy: r, R: r + TREAD + ARCH_GAP, xin: x - w / 2 - ARCH_GAPX, front, hump: false }));
  s.xk = Math.min(...s.keeps.map((a) => a.xin));
  s.sagY = Math.max(...s.keeps.map((a) => a.cy + a.R)) + 0.01;   // foam sags towards this height while rinsed: never into an arch
  s.arches = s.keeps.filter((a) => a.xin < s.W / 2 - 0.01);
  if (!s.arches.length) { s.xi = s.W / 2; return; }
  s.xi = Math.min(...s.arches.map((a) => a.xin));
  for (const a of s.arches) {
    let thin = Infinity;
    for (const z of archSamples(a)) thin = Math.min(thin, profTop(s, z) - archTop(a, z));
    a.hump = s.hump !== false && thin < FENDER_MIN;
  }
  if (s.arches.some((a) => a.front && a.hump)) s.hw = Math.min(s.hw, 2 * s.xi - 0.02);
  for (const a of s.arches) {   // a cabin over a tyre that rises past the belt line keeps 4 cm clear of it (the body rolls on a flat)
    const ro = a.R - ARCH_GAP, up = s.yb - a.cy, half = up < ro ? Math.sqrt(ro * ro - up * up) : -1;
    if (!s.open && half > 0 && s.cab.w / 2 + 0.04 > a.xin + ARCH_GAPX && s.cab.r0 < a.z + half && s.cab.f0 > a.z - half) {
      console.warn(`cars: ${s.id}: the cabin stands over a tyre`);
    }
  }
  const zs = s.arches.flatMap((a) => archSamples(a));
  // the outer strip's profile: bottom edge raised over the arches, top edge over the humps
  const bottom = envelope([(z) => profBase(s, z), ...s.arches.map((a) => (z) => archTop(a, z))],
    [s.zr + 0.06, s.zf - 0.06, ...zs], s.zr, s.zf);
  const top = envelope([(z) => profTop(s, z), ...s.arches.map((a) => (z) => humpTop(a, z))],
    [s.zr + s.tailCh, s.zf - s.noseCh, ...s.arches.flatMap((a) => [a.z - a.R * 0.55, a.z + a.R * 0.55])], s.zr, s.zf);
  for (const [z, y] of bottom) {
    if (y > polyAt(top, z) + 0.001) console.warn(`cars: ${s.id}: arch cuts through the top at z=${z.toFixed(2)}`);
  }
  s.stripProfile = cleanLoop([...bottom, ...top.reverse()]);
  // the wheel-well wall behind each tyre: the arch opening, down to the bottom edge of the plain profile
  for (const a of s.arches) {
    const z0 = Math.max(s.zr, a.z - a.R), z1 = Math.min(s.zf, a.z + a.R);
    const arc = archSamples(a, 10).filter((z) => z > z0 && z < z1).map((z) => [z, archTop(a, z)]);
    a.well = cleanLoop([[z0, profBase(s, z0)], [z1, profBase(s, z1)], [z1, archTop(a, z1)], ...arc.reverse(), [z0, archTop(a, z0)]]);
    // under a hump the arch rises past the core's top: close the hump's inboard side there (the inner fender)
    if (a.hump) {
      const over = (z) => archTop(a, z) - profTop(s, z), zs2 = archSamples(a, 12).filter((z) => over(z) > 0);
      if (zs2.length > 1) {
        const edge = (zin, zout) => { for (let i = 0; i < 40; i++) { const m = (zin + zout) / 2; if (over(m) > 0) zin = m; else zout = m; } return zin; };
        const za = edge(zs2[0], Math.max(s.zr, a.z - a.R)), zb = edge(zs2[zs2.length - 1], Math.min(s.zf, a.z + a.R));
        const mid = zs2.filter((z) => z > za && z < zb);
        a.cap = cleanLoop([[za, profTop(s, za)], ...mid.map((z) => [z, profTop(s, z)]), [zb, profTop(s, zb)],
          ...[zb, ...mid.reverse(), za].map((z) => [z, archTop(a, z)])]);
      }
    }
  }
}
/** A polygon without repeated points (an extrusion turns a zero-length edge into NaNs). */
function cleanLoop(pts) {
  const out = [];
  for (const p of pts) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) { console.warn('cars: bad profile point', p); continue; }
    const l = out[out.length - 1];
    if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 1e-5) out.push(p);
  }
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-5) out.pop();
  return out;
}
/** A band following an arch's lip, from radius R + r0 to R + r1, down to `low` above the axle on both legs. */
function archBandPts(a, r0, r1, low = 0) {
  const n = 10, pts = [], e = Math.asin(Math.max(-1, Math.min(1, low / (a.R + r1))));
  for (let i = 0; i <= n; i++) {
    const t = e + (Math.PI - 2 * e) * (i / n);
    pts.push([a.z - (a.R + r1) * Math.cos(t), a.cy + (a.R + r1) * Math.sin(t)]);
  }
  for (let i = n; i >= 0; i--) {
    const t = e + (Math.PI - 2 * e) * (i / n);
    pts.push([a.z - (a.R + r0) * Math.cos(t), a.cy + (a.R + r0) * Math.sin(t)]);
  }
  return pts;
}

/** Builder for chassis-space car parts: any axis-aligned box that would reach into a wheel-arch keep-out is cut
 *  around it in a few steps (side panels, trims, mud, gloss streaks ... stop at the arch like the real thing). */
class CarBuilder extends Builder {
  constructor(s) { super(); this.s = s; }
  box(w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const s = this.s;
    if (rx || ry || rz) return super.box(w, h, d, color, x, y, z, rx, ry, rz);
    const pieces = cutArches(s, x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2);
    if (!pieces) return super.box(w, h, d, color, x, y, z);
    for (const [x0, x1, y0, y1, z0, z1] of pieces) super.box(x1 - x0, y1 - y0, z1 - z0, color, (x0 + x1) / 2, y0, (z0 + z1) / 2);
    return this;
  }
}
/** Pieces of the box [x0,x1]x[y0,y1]x[z0,z1] outside every arch keep-out, or null when it touches none. */
function cutArches(s, x0, x1, y0, y1, z0, z1) {
  const XI = s.xk - 0.004;
  const hit = s.keeps.filter((a) => z1 > a.z - a.R && z0 < a.z + a.R && y0 < archTop(a, Math.max(z0, Math.min(z1, a.z))));
  if (!hit.length || (x1 <= XI && x0 >= -XI)) return null;
  const out = [];
  const xs = [];
  if (x0 < -XI) xs.push([x0, Math.min(x1, -XI), true]);
  if (x1 > -XI && x0 < XI) xs.push([Math.max(x0, -XI), Math.min(x1, XI), false]);
  if (x1 > XI) xs.push([Math.max(x0, XI), x1, true]);
  for (const [xa, xb, cut] of xs) {
    if (!cut) { out.push([xa, xb, y0, y1, z0, z1]); continue; }
    const top = Math.max(...hit.map((a) => archTop(a, Math.max(z0, Math.min(z1, a.z)))));
    if (y1 > top) out.push([xa, xb, Math.max(y0, top), y1, z0, z1]);
    const yt = Math.min(y1, top);
    if (yt <= y0) continue;
    const n = Math.max(1, Math.min(3, Math.floor((yt - y0) / 0.025)));
    let prev = null;
    for (let k = 0; k < n; k++) {
      const ya = y0 + (yt - y0) * k / n, yb = y0 + (yt - y0) * (k + 1) / n;
      let free = [[z0, z1]];
      for (const a of hit) {   // the arch takes its widest chord in the band, at the band's bottom
        const hw = ya <= a.cy ? a.R : Math.sqrt(Math.max(0, a.R * a.R - (ya - a.cy) ** 2));
        free = free.flatMap(([p, q]) => [[p, Math.min(q, a.z - hw)], [Math.max(p, a.z + hw), q]]).filter(([p, q]) => q - p > 0.008);
      }
      const key = free.map((f) => f.join()).join('|');
      if (prev && prev.key === key) { for (const b of prev.boxes) b[3] = yb; continue; }
      const boxes = free.map(([p, q]) => [xa, xb, ya, yb, p, q]);
      out.push(...boxes);
      prev = { key, boxes };
    }
  }
  return out;
}

for (const [id, s] of Object.entries(SPECS)) s.id = id;
for (const s of Object.values(SPECS)) {
  if (s.lift) { s.y0 += s.lift; s.yb += s.lift; s.cab.yt += s.lift; }
  s.zf = s.L / 2 - 0.06;                         // body front face (bumper pokes out to L/2)
  s.zr = -s.L / 2 + 0.06;
  s.hz0 = s.cab.f0 + 0.01;                       // hood hinge
  s.hz1 = s.zf - s.noseCh;                       // hood front edge
  s.wx = s.wx ?? Math.min(0.75 - s.wr / 2, s.W / 2);   // rear wheel centre x
  s.rf = s.rf ?? s.r;
  s.wrf = s.wrf ?? s.wr;
  s.wxf = s.wxf ?? Math.min(0.75 - s.wrf / 2, s.W / 2);
  s.hw = s.hw ?? s.W - 0.06;
  setupArches(s);
  const c = s.cab;
  // highest flat surface (roof): foam, dirt, gloss, primer, crown, sparkles sit on it
  s.top = s.top ?? (s.open
    ? { y: s.yb + 0.01, z: (s.zr + s.tailCh + c.r0) / 2, l: c.r0 - s.zr - s.tailCh, w: s.W - 0.2 }
    : { y: c.yt + 0.09, z: (c.f1 + c.r1) / 2, l: c.f1 - c.r1, w: c.w });
  s.deck = s.deck ?? (c.r0 - s.zr > 0.3);
}
SPECS.camper.top = { y: 1.72, z: (SPECS.camper.zr + 1.0) / 2, l: 1.0 - SPECS.camper.zr, w: SPECS.camper.W - 0.04 };
// where an overheating engine smokes and where its sump drips: under the hood, or behind the cabin / at the tail
for (const s of Object.values(SPECS)) {
  const eng = s.engine ?? 'front';
  if (eng === 'mid') { s.smoke = { y: s.yb + 0.04, z: s.cab.r0 - 0.32 }; s.sump = s.axR + 0.36; }
  else if (eng === 'rear') { s.smoke = { y: s.yb - 0.16, z: s.zr - 0.02 }; s.sump = s.axR - 0.12; }
  else { s.smoke = { y: s.yb + 0.1, z: s.hz0 + (s.hz1 - s.hz0) * 0.6 }; s.sump = s.ax + 0.1; }
}

/** Every car type id createCar understands. */
export const CAR_TYPE_IDS = Object.keys(SPECS);
/** Default paint for each classic (the colour it had when new; a wreck shows a faded version of it). */
const CLASSIC_COLORS = { bubble: 0x8fd1b0, woody: 0x2f6b8f, surfvan: 0x5aa9e6, hotrod: 0x2b2f36, finback: 0xe98fb0, gt: 0xb8322f };

const geoCache = new Map();

// side-profile extrusion: pts are (z, y); extruded across x, centred on xc
function sideExtrude(b, pts, width, color, xc = 0, holes = null) {
  const shp = polygon(pts);
  if (holes) for (const h of holes) shp.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  b.shape(shp, width, color, xc + width / 2, 0, 0, 0, -Math.PI / 2, 0);
}
/** Thin slab lying on the line (za, ya) -> (zb, yb) in the side profile (za < zb), `t` thick, pushed `off` outwards. */
function slab(b, za, ya, zb, yb, w, t, color, x = 0, off = 0) {
  const dz = zb - za, dy = yb - ya, len = Math.hypot(dz, dy);
  const th = Math.atan2(-dy, dz), ny = Math.cos(th), nz = Math.sin(th);
  const cy = (ya + yb) / 2 + ny * (off + t / 2), cz = (za + zb) / 2 + nz * (off + t / 2);
  b.box(w, t, len, color, x, cy - t / 2, cz, th);
}
/** Disc facing +z (axis along z), centre (x, y, z). */
function discZ(b, r, h, color, x, y, z, seg = 10) { b.cyl(r, r, h, color, x, y - h / 2, z, seg, Math.PI / 2); }
/** Disc facing +x (axis along x), centre (x, y, z). */
function discX(b, r, h, color, x, y, z, seg = 10) { b.cyl(r, r, h, color, x, y - h / 2, z, seg, 0, 0, Math.PI / 2); }

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

// paint variants: a wreck is faded and sun-bleached, a patched car is dull; chrome goes dull with them
function variantColor(col, variant) {
  if (variant === 'wreck') return shade(lerpHex(col, 0x8d8273, 0.55), 0.82);
  if (variant === 'patched') return shade(lerpHex(col, 0x9a958c, 0.32), 0.9);
  return col;
}

// ---------------------------------------------------------------- type extras (lower body + roof, chassis space)
// o = { col, colD, colL, CH (chrome, dull on a wreck), variant, look }
const EXTRAS = {
  hatch(b, s, o) {
    const { cab, W } = s;
    b.box(cab.w + 0.02, 0.04, 0.24, DARK, 0, cab.yt + 0.05, cab.r1 - 0.04, -0.2);     // roof spoiler
    archTrims(b, s, DARK, 0.04);
    b.box(W - 0.3, 0.04, 0.02, DARK, 0, s.y0 + 0.2, s.zr - 0.01);                     // tailgate handle bar
  },
  suv(b, s, o) {
    const { cab, W, L, y0, yb, zr } = s;
    b.box(W + 0.02, 0.13, L - 0.46, DARK, 0, y0 - 0.01, 0);                           // cladding
    archTrims(b, s, DARK, 0.06);
    for (const z of [L / 2 - 0.04, -L / 2 + 0.04]) b.box(W * 0.56, 0.05, 0.08, 0xa9b0b6, 0, y0 - 0.04, z);   // skid plates
    roofRails(b, s, TRIM, 2);
    discZ(b, 0.25, 0.14, RUBBER, 0, yb - 0.02, zr - 0.08, 12);                        // spare wheel on the tailgate
    discZ(b, 0.18, 0.16, o.colD, 0, yb - 0.02, zr - 0.08, 10);
    discZ(b, 0.07, 0.18, 0xa9b0b6, 0, yb - 0.02, zr - 0.08, 8);
  },
  muscle(b, s, o) {
    const { cab, W, y0, yb, zr } = s;
    const st = stripeCol(o.col);
    for (const sx of [-1, 1]) {
      b.box(0.15, 0.012, cab.f1 - cab.r1 + 0.04, st, sx * 0.13, cab.yt + 0.09, (cab.f1 + cab.r1) / 2);   // roof stripes
      b.cyl(0.045, 0.045, 0.9, o.CH, sx * (W / 2 + 0.03), y0 - 0.0, -0.02, 8, Math.PI / 2);  // side pipes
    }
    b.box(W - 0.04, 0.05, 0.16, o.colD, 0, yb, zr + 0.09, 0.25);                     // ducktail
  },
  camper(b, s, o) {
    const { W, yb, zr } = s;
    const hab = variantColor(HAB, o.variant), habD = shade(hab, 0.9), z1 = 0.36, hz = (zr + z1) / 2, hl = z1 - zr;
    b.box(W, 0.98, hl, hab, 0, yb - 0.02, hz);                                        // living box
    b.box(W - 0.04, 0.38, 0.66, hab, 0, 1.3, z1 + 0.32);                              // alcove over the cab
    b.box(W - 0.06, 0.05, 0.1, habD, 0, 1.3, z1 + 0.6);
    b.box(W + 0.02, 0.04, hl + 0.66, habD, 0, 1.68, (zr + z1 + 0.66) / 2);           // roof cap
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.006);
      b.box(0.014, 0.1, hl, o.col, x, 1.0, hz);                                       // stripes
      b.box(0.014, 0.04, hl, o.colD, x, 0.92, hz);
      b.box(0.014, 0.07, 0.6, o.col, sx * (W / 2 - 0.014), 1.42, z1 + 0.33);
      b.box(0.016, 0.3, 0.52, TRIM, x, 1.12, -0.72);                                  // side window
      b.box(0.02, 0.24, 0.46, GLASS_D, sx * (W / 2 + 0.01), 1.15, -0.72);
    }
    b.box(0.016, 0.82, 0.42, habD, W / 2 + 0.008, yb + 0.02, -0.08);                 // entry door (right side)
    b.box(0.02, 0.22, 0.24, GLASS_D, W / 2 + 0.012, yb + 0.5, -0.08);
    b.box(0.22, 0.05, 0.4, TRIM, W / 2 - 0.06, s.y0 - 0.02, -0.08);                  // step
    b.box(0.08, 0.08, 1.5, 0x9aa5ad, W / 2 + 0.04, 1.56, -0.5);                       // rolled-up awning
    b.box(0.5, 0.2, 0.46, 0xe7e2d8, 0, 1.72, -0.75);                                  // roof AC unit
    b.box(0.42, 0.03, 0.36, 0x2f4a6b, 0, 1.72, 0.1);                                  // solar panel
    for (let i = 0; i < 3; i++) b.box(0.42, 0.034, 0.012, 0x9aa5ad, 0, 1.72, -0.04 + i * 0.12);
    b.box(0.6, 0.3, 0.02, TRIM, 0, 1.08, zr - 0.006);                                 // rear window
    b.box(0.54, 0.24, 0.022, GLASS_D, 0, 1.11, zr - 0.01);
    b.box(0.06, 0.9, 0.04, TRIM, -0.48, 0.74, zr - 0.03);                             // ladder
    for (let i = 0; i < 5; i++) b.box(0.18, 0.03, 0.04, TRIM, -0.4, 0.82 + i * 0.18, zr - 0.03);
    b.box(W - 0.2, 0.2, 0.02, GLASS_D, 0, 1.38, z1 + 0.66);                           // alcove window
  },
  roadster(b, s, o) {
    cockpit(b, s, o, SEAT, true);
    b.box(s.W - 0.24, 0.12, 0.26, DARK, 0, s.yb, s.cab.r0 - 0.14);                   // folded soft top
    b.box(s.W - 0.3, 0.05, 0.2, TRIM, 0, s.yb + 0.12, s.cab.r0 - 0.14);
  },
  rally(b, s, o) {
    const { cab, W, y0, yb } = s;
    for (const sx of [-1, 1]) b.box(0.06, 0.16, 0.06, DARK, sx * 0.42, cab.yt + 0.07, cab.r1 - 0.1);
    b.box(cab.w + 0.1, 0.04, 0.28, DARK, 0, cab.yt + 0.23, cab.r1 - 0.12, -0.08);    // rear wing
    b.box(0.3, 0.08, 0.22, DARK, 0, cab.yt + 0.09, cab.f1 - 0.14);                    // roof scoop
    b.box(0.02, 0.36, 0.02, DARK, -0.4, cab.yt + 0.09, cab.r1 + 0.2);                  // antenna
    for (const [sx, z, r] of [[-1, s.ax, s.rf], [1, s.ax, s.rf], [-1, s.axR, s.r], [1, s.axR, s.r]]) {
      b.box(0.26, 0.22, 0.02, 0x2b2f36, sx * s.wx, 0.04, z - r - 0.08);              // mud flaps
    }
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.007);
      b.box(0.014, 0.1, 0.94, WHITE, x, y0 + 0.1, 0, 0.2);                            // livery swoosh, between the arches
      b.box(0.014, 0.05, 0.84, 0xf6c453, x, y0 + 0.22, 0, 0.2);
      discX(b, 0.13, 0.016, WHITE, x * 1.004, (y0 + yb) / 2 + 0.04, 0.2, 12);         // door roundel + number
      b.box(0.02, 0.13, 0.035, DARK, x * 1.012, (y0 + yb) / 2 - 0.02, 0.2);
      b.box(0.02, 0.03, 0.07, DARK, x * 1.012, (y0 + yb) / 2 + 0.08, 0.18);
    }
    b.box(0.08, 0.06, 0.06, 0xd94848, 0.3, y0 + 0.02, s.L / 2 - 0.02);                // tow eye
  },
  supercar(b, s, o) {
    const { W, y0, yb, zr, zf, cab } = s;
    // a low wedge whose wheels rise into fender humps (the arches' own, see setupArches); the frunk lid sits
    // between the front pair, the engine deck between the rear pair
    for (const sx of [-1, 1]) {
      b.box(0.06, 0.32, 0.08, DARK, sx * 0.3, yb, zr + 0.16);                         // wing posts
      b.box(0.02, 0.2, 0.46, DARK, sx * (W / 2 + 0.004), y0 + 0.06, -0.36);           // side intakes
      b.box(0.03, 0.04, 0.5, o.colD, sx * (W / 2 + 0.01), y0 + 0.27, -0.33);
      b.box(0.03, 0.04, 1.5, DARK, sx * (W / 2 + 0.005), y0 - 0.02, 0.0);             // side skirts
    }
    b.box(W + 0.02, 0.05, 0.3, DARK, 0, yb + 0.32, zr + 0.13);                        // big wing
    for (const sx of [-1, 1]) b.box(0.04, 0.14, 0.34, DARK, sx * (W / 2 + 0.01), yb + 0.26, zr + 0.13);
    for (let i = 0; i < 5; i++) b.box(0.84, 0.014, 0.05, DARK, 0, yb + 0.002, cab.r0 - 0.1 - i * 0.1);   // louvres
    b.box(W, 0.03, 0.16, DARK, 0, y0 - 0.03, zf);                                     // splitter
    for (let i = -2; i <= 2; i++) b.box(0.02, 0.1, 0.16, DARK, i * 0.2, y0 - 0.03, zr + 0.02);   // diffuser
    b.box(0.26, 0.07, 0.44, DARK, 0, cab.yt + 0.08, (cab.r1 + cab.f1) / 2 - 0.08);   // roof scoop
  },
  limo(b, s, o) {
    const { cab, W, zr } = s;
    for (const sx of [-1, 1]) {
      b.box(0.014, 0.025, cab.f1 - cab.r1, o.CH, sx * (cab.w / 2 + 0.012), cab.yt - 0.03, (cab.f1 + cab.r1) / 2);
      b.box(0.02, 0.14, 0.05, o.CH, sx * (W / 2 - 0.12), s.y0 + 0.2, zr - 0.02);     // vertical tail lamps trim
    }
    b.cyl(0.035, 0.035, 0.14, o.CH, 0.32, s.y0 - 0.02, zr - 0.05, 8, Math.PI / 2);   // twin exhaust
    b.cyl(0.035, 0.035, 0.14, o.CH, -0.32, s.y0 - 0.02, zr - 0.05, 8, Math.PI / 2);
  },
  classic(b, s, o) {
    const { W, yb, zf, zr, y0 } = s;
    cockpit(b, s, o, SEAT_L, false);
    for (const sx of [-1, 1]) {
      const x = sx * 0.6;
      // flowing front fender: rises over the wheel, sweeps down into the running board
      const [fa, ra] = s.arches, fx = sx * s.wxf;
      sideExtrude(b, archBandPts(fa, 0.004, 0.084), 0.3, o.col, fx);
      b.box(0.3, 0.08, 0.36, o.col, fx, fa.cy + 0.005, fa.z + fa.R + 0.12, 0.75);
      b.box(0.3, 0.08, 0.5, o.col, fx, fa.cy - 0.02, fa.z - fa.R - 0.26, -0.5);
      b.box(0.26, 0.05, 0.9, DARK, sx * 0.62, y0 - 0.02, (s.ax + s.axR) / 2 + 0.02);  // running board
      sideExtrude(b, archBandPts(ra, 0.004, 0.084), 0.3, o.col, x);                   // rear fender
      b.box(0.3, 0.08, 0.34, o.col, x, ra.cy - 0.03, ra.z - ra.R - 0.15, -0.75);
      // chrome headlamps on a bar
      discZ(b, 0.11, 0.16, o.CH, sx * 0.4, yb + 0.02, zf - 0.02, 12);
      discZ(b, 0.085, 0.17, o.variant === 'wreck' && sx > 0 ? 0x15181c : HEAD, sx * 0.4, yb + 0.02, zf - 0.01, 12);
    }
    b.box(0.86, 0.03, 0.03, o.CH, 0, yb - 0.06, zf - 0.02);
    discZ(b, 0.26, 0.12, RUBBER, 0, yb - 0.04, zr - 0.02, 12);                         // spare on the boat tail
    discZ(b, 0.16, 0.14, o.CH, 0, yb - 0.04, zr - 0.02, 10);
  },
  gsuv(b, s, o) {
    const { cab, W, L, y0 } = s;
    b.box(W + 0.014, 0.16, L - 0.3, DARK, 0, y0, 0);                                  // dark lower band
    for (const sx of [-1, 1]) {
      b.box(0.16, 0.04, 1.1, o.CH, sx * (W / 2 + 0.03), y0 - 0.1, (s.ax + s.axR) / 2);   // running boards
      b.box(0.02, 0.05, 0.22, o.CH, sx * (W / 2 + 0.006), s.yb - 0.16, s.ax - 0.36);     // fender vents
    }
    roofRails(b, s, o.CH, 3);
    archTrims(b, s, DARK, 0.05);
  },
  bubble(b, s, o) {
    const { cab, W, y0, yb, zf, zr } = s;
    const rl = cab.f1 - cab.r1, rz = (cab.f1 + cab.r1) / 2, ry = cab.yt + 0.09;
    b.box(cab.w - 0.2, 0.06, rl - 0.1, o.col, 0, ry, rz);                               // domed roof
    b.box(cab.w - 0.4, 0.04, rl - 0.24, o.colL, 0, ry + 0.06, rz);
    b.box(0.5, 0.016, rl * 0.62, 0x3a3f47, 0, ry + 0.095, rz + rl * 0.12);              // canvas top, folded back
    b.box(0.54, 0.07, 0.1, 0x30353d, 0, ry + 0.09, rz - rl * 0.22);
    b.box(W + 0.012, 0.03, s.L - 0.5, o.CH, 0, yb - 0.1, 0);                           // chrome belt line
    // luggage rack on the engine lid at the tail, with a little case strapped to it
    const rkz = zr - 0.12;
    for (const sx of [-1, 1]) b.box(0.03, 0.03, 0.3, o.CH, sx * 0.3, yb - 0.02, rkz + 0.05);
    for (const z of [rkz - 0.08, rkz + 0.06]) b.box(0.64, 0.03, 0.03, o.CH, 0, yb - 0.02, z);
    b.box(0.46, 0.16, 0.22, 0xb5623b, 0, yb + 0.01, rkz - 0.01);
    b.box(0.47, 0.03, 0.04, 0x7a3a1e, 0, yb + 0.08, rkz - 0.01);
    for (const sx of [-1, 1]) {
      b.cyl(0.12, 0.14, 0.2, o.col, sx * 0.4, yb - 0.08, zf - 0.22, 10);             // fender lamp pods
      discZ(b, 0.1, 0.06, o.CH, sx * 0.4, yb + 0.03, zf - 0.11, 10);
      discZ(b, 0.08, 0.07, o.variant === 'wreck' && sx > 0 ? 0x15181c : HEAD, sx * 0.4, yb + 0.03, zf - 0.1, 10);
    }
    for (let i = 0; i < 4; i++) b.box(0.5, 0.025, 0.02, TRIM, 0, yb - 0.3 + i * 0.06, zr - 0.004);   // engine grille
    discZ(b, 0.07, 0.03, o.CH, 0, yb - 0.24, zf + 0.0, 10);                           // nose badge
  },
  woody(b, s, o) {
    const { cab, W, y0, yb, zr } = s;
    const wood = variantColor(WOOD, o.variant), woodD = variantColor(WOOD_D, o.variant);
    const z0 = zr + 0.06, z1 = cab.f0 - 0.14, h = yb - y0 - 0.14;
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.006);
      b.box(0.014, h, z1 - z0, wood, x, y0 + 0.08, (z0 + z1) / 2);
      for (const yy of [y0 + 0.08, y0 + 0.08 + h - 0.04]) b.box(0.018, 0.04, z1 - z0, woodD, x, yy, (z0 + z1) / 2);
      for (const z of [z0, -0.3, -0.82, z1]) b.box(0.018, h, 0.05, woodD, x, y0 + 0.08, z);
    }
    b.box(W - 0.2, h, 0.014, wood, 0, y0 + 0.08, zr - 0.004);                          // tailgate
    b.box(W - 0.2, 0.04, 0.018, woodD, 0, y0 + 0.08 + h - 0.04, zr - 0.006);
    roofRails(b, s, TRIM, 3);
    b.box(0.5, 0.18, 0.4, 0x9b5a3c, -0.2, cab.yt + 0.12, -0.6);                        // suitcases
    b.box(0.4, 0.14, 0.34, 0x3d6fb6, 0.28, cab.yt + 0.12, -0.3);
    b.box(0.3, 0.12, 0.3, 0xf6c453, -0.1, cab.yt + 0.3, -0.62);
  },
  surfvan(b, s, o) {
    const { cab, W, yb, zf } = s;
    const cr = variantColor(CREAM, o.variant);
    for (const sx of [-1, 1]) b.box(0.56, 0.1, 0.02, cr, sx * 0.21, yb - 0.32, zf + 0.004, 0, 0, sx * 0.62);   // V front
    discZ(b, 0.1, 0.03, o.CH, 0, yb - 0.24, zf + 0.012, 12);                         // badge
    b.box(0.05, cab.yt - yb, 0.04, cr, 0, yb, (cab.f0 + cab.f1) / 2 + 0.01, -0.0);    // split windshield
    roofRails(b, s, TRIM, 3);
    const by = cab.yt + 0.17;
    b.box(0.36, 0.05, 2.0, 0xf6c453, 0.12, by, -0.25);                                // surfboard
    b.box(0.26, 0.05, 0.16, 0xf6c453, 0.12, by, 0.82);
    b.box(0.08, 0.052, 1.8, 0xf26b5b, 0.12, by + 0.002, -0.25);
    for (let i = 0; i < 6; i++) b.box(0.02, 0.1, 0.2, TRIM, (W / 2 + 0.004) * (i < 3 ? 1 : -1), yb - 0.32 + (i % 3) * 0.08, -0.95);
  },
  hotrod(b, s, o) {
    const { W, y0, yb, zf, zr } = s;
    b.box(0.5, yb - y0 - 0.02, 0.1, o.CH, 0, y0 + 0.02, zf - 0.04);                   // grille shell
    b.box(0.4, yb - y0 - 0.12, 0.02, DARK, 0, y0 + 0.07, zf + 0.012);
    for (let i = -3; i <= 3; i++) b.box(0.02, yb - y0 - 0.14, 0.024, o.CH, i * 0.055, y0 + 0.08, zf + 0.014);
    b.box(2 * (s.wxf - s.wrf / 2) - 0.06, 0.06, 0.08, DARK, 0, s.rf - 0.03, s.ax);    // exposed front axle
    for (const sx of [-1, 1]) {
      b.box(0.06, 0.2, 0.06, DARK, sx * 0.34, yb - 0.24, zf - 0.08);                  // lamp stalks
      discZ(b, 0.12, 0.16, o.CH, sx * 0.38, yb - 0.02, zf - 0.04, 12);
      discZ(b, 0.09, 0.17, o.variant === 'wreck' && sx > 0 ? 0x15181c : HEAD, sx * 0.38, yb - 0.02, zf - 0.03, 12);
      // rear fenders over the big wheels
      b.box(0.3, 0.08, 0.86, o.col, sx * s.wx, s.r * 2 + TREAD + ARCH_GAP, s.axR);
      b.box(0.3, 0.08, 0.3, o.col, sx * s.wx, s.r * 1.62, s.axR + 0.52, 0.9);
      b.box(0.3, 0.08, 0.3, o.col, sx * s.wx, s.r * 1.62, s.axR - 0.52, -0.9);
      // exhaust headers out of the engine bay
      for (let i = 0; i < 3; i++) b.box(0.05, 0.05, 0.3, o.CH, sx * (W / 2 + 0.03), yb - 0.16 - i * 0.02, 0.25 + i * 0.17, 0.5);
      b.box(0.06, 0.06, 0.82, o.CH, sx * (W / 2 + 0.05), y0 - 0.02, -0.01);
      // flames along the nose
      const x = sx * (W / 2 + 0.006), fy = (y0 + yb) / 2 - 0.06;
      if (o.variant !== 'wreck') {
        b.box(0.014, 0.18, 0.7, 0xee5a24, x, fy, zf - 0.4);
        for (let i = 0; i < 4; i++) b.box(0.014, 0.06, 0.3 - i * 0.04, 0xee5a24, x, fy + (i % 2 ? -0.04 : 0.15), zf - 0.86 - i * 0.12);
        b.box(0.016, 0.08, 0.6, 0xf6c453, x * 1.002, fy + 0.05, zf - 0.38);
        b.box(0.016, 0.04, 0.24, 0xf6c453, x * 1.002, fy + 0.07, zf - 0.8);
      }
    }
    b.box(0.3, 0.08, 0.2, DARK, 0, yb - 0.06, zr + 0.2);                               // fuel tank cap area
    // engine poking through the hood, blower and scoop on top (chassis: it stays put when the hood opens)
    const ez = s.hz0 + (s.hz1 - s.hz0) * 0.42, ey = yb;
    b.box(0.5, 0.2, 0.5, 0x5c6670, 0, ey - 0.12, ez);
    for (const sx of [-1, 1]) b.box(0.08, 0.1, 0.42, 0x8a929a, sx * 0.2, ey + 0.06, ez);    // valve covers
    b.box(0.36, 0.2, 0.34, o.CH, 0, ey + 0.16, ez);                                     // blower
    for (let i = 0; i < 4; i++) b.box(0.37, 0.02, 0.02, 0x9aa5ad, 0, ey + 0.2 + i * 0.04, ez + 0.17);
    b.box(0.3, 0.1, 0.24, o.CH, 0, ey + 0.36, ez + 0.03);                               // scoop
    b.box(0.24, 0.07, 0.02, DARK, 0, ey + 0.38, ez + 0.155);
  },
  finback(b, s, o) {
    const { W, yb, zr } = s;
    for (const sx of [-1, 1]) {
      const fx = sx * (W / 2 - 0.06);
      sideExtrude(b, [[zr, yb - 0.02], [-0.25, yb - 0.02], [zr + 0.1, yb + 0.3], [zr, yb + 0.3]], 0.1, o.col, fx - 0.05);
      discZ(b, 0.045, 0.06, o.variant === 'wreck' ? 0x6a2a24 : TAIL, fx, yb + 0.2, zr - 0.02, 8);
      b.box(0.014, 0.03, 1.7, o.CH, sx * (W / 2 + 0.008), yb - 0.13, 0.22);           // chrome spear
      b.box(0.014, 0.03, 0.5, o.CH, sx * (W / 2 + 0.008), s.arches[1].cy + s.arches[1].R + 0.004, -0.8);   // kick over the rear arch
      b.box(0.08, 0.16, 0.08, o.CH, sx * 0.38, s.y0 - 0.02, s.L / 2 - 0.04);          // bumper overriders
    }
  },
  gt(b, s, o) {
    const { W, y0, yb, zf } = s;
    for (const sx of [-1, 1]) {
      // lamps under glass covers on the nose chamfer
      b.box(0.2, 0.09, 0.2, o.variant === 'wreck' && sx > 0 ? 0x15181c : HEAD, sx * 0.35, yb - s.noseCh + 0.02, zf - 0.13);
      slab(b, zf - 0.24, yb - 0.02, zf - 0.02, yb - s.noseCh + 0.06, 0.24, 0.02, GLASS, sx * 0.35, 0.0);
      const x = sx * (W / 2 + 0.008);
      if (o.variant !== 'wreck') {
        discX(b, 0.13, 0.016, WHITE, x, (y0 + yb) / 2 + 0.02, -0.15, 12);             // racing roundel
        b.box(0.02, 0.12, 0.03, DARK, x * 1.012, (y0 + yb) / 2 - 0.04, -0.15);
        b.box(0.02, 0.025, 0.06, DARK, x * 1.012, (y0 + yb) / 2 + 0.06, -0.165);
      }
      for (let i = 0; i < 3; i++) b.box(0.016, 0.02, 0.18, o.CH, x, yb - 0.2 + i * 0.05, s.ax - 0.42);   // fender vents
    }
  },
};

/** Two seats, dash and wheel in an open car; `hoops` adds roll hoops. */
function cockpit(b, s, o, seatCol, hoops) {
  const { cab, W, yb } = s;
  const seat = variantColor(seatCol, o.variant === 'wreck' ? 'wreck' : 'clean');
  b.box(W - 0.16, 0.012, cab.f0 - cab.r0 - 0.04, 0x30353d, 0, yb, (cab.f0 + cab.r0) / 2);   // footwell floor
  for (const sx of [-1, 1]) {
    b.box(0.08, 0.07, cab.f0 - cab.r0, o.colD, sx * (W / 2 - 0.04), yb, (cab.f0 + cab.r0) / 2);   // door tops
    b.box(0.4, 0.12, 0.38, seat, sx * 0.25, yb, cab.r0 + 0.32);
    b.box(0.4, 0.4, 0.1, seat, sx * 0.25, yb + 0.02, cab.r0 + 0.1, -0.18);
    b.box(0.22, 0.12, 0.08, shade(seat, 0.85), sx * 0.25, yb + 0.42, cab.r0 + 0.04, -0.18);
    if (hoops) {
      b.box(0.04, 0.5, 0.04, o.CH, sx * 0.25 - 0.17, yb, cab.r0 - 0.04);
      b.box(0.04, 0.5, 0.04, o.CH, sx * 0.25 + 0.17, yb, cab.r0 - 0.04);
      b.box(0.38, 0.04, 0.04, o.CH, sx * 0.25, yb + 0.48, cab.r0 - 0.04);
    }
  }
  b.box(W - 0.2, 0.1, 0.12, DARK, 0, yb, cab.f0 - 0.08);                              // dash
  b.cyl(0.1, 0.1, 0.03, DARK, -0.25, yb + 0.16, cab.f0 - 0.2, 10, -0.9);              // steering wheel
}
/** Trim (or a flare, when wide) around the lip of every arch, standing `t` proud of the body side. */
function archTrims(b, s, color, t, wide = 0.055) {
  for (const a of s.arches) for (const sx of [-1, 1]) sideExtrude(b, archBandPts(a, 0, wide), t, color, sx * (s.W / 2 + 0.002 + t / 2));
}
function roofRails(b, s, color, bars) {
  const c = s.cab, y = s.top.y, rl = c.f1 - c.r1, rz = (c.f1 + c.r1) / 2;
  for (const sx of [-1, 1]) {
    b.box(0.05, 0.05, rl - 0.12, color, sx * (c.w / 2 - 0.08), y + 0.03, rz);
    for (const z of [-1, 1]) b.box(0.05, 0.05, 0.05, color, sx * (c.w / 2 - 0.08), y, rz + z * (rl / 2 - 0.1));
  }
  for (let i = 0; i < bars; i++) {
    const z = rz + (bars === 1 ? 0 : (i / (bars - 1) - 0.5) * (rl - 0.3));
    b.box(c.w - 0.12, 0.03, 0.05, color, 0, y + 0.08, z);
  }
}
const stripeCol = (col) => (lum(col) > 0.55 ? DARK : WHITE);

// hood extras (hood space: hinge at the origin, hood top at y = 0.062, front edge at z = hl)
const HOOD_EXTRAS = {
  muscle(b, s, o, hl, hw) {
    const st = stripeCol(o.col);
    for (const sx of [-1, 1]) b.box(0.15, 0.014, hl, st, sx * 0.13, 0.05, hl / 2);
    b.box(0.46, 0.09, 0.56, o.col, 0, 0.05, hl * 0.42);                               // scoop: body colour, stripes run over it
    for (const sx of [-1, 1]) b.box(0.15, 0.012, 0.56, st, sx * 0.13, 0.14, hl * 0.42);
    b.box(0.36, 0.06, 0.03, DARK, 0, 0.065, hl * 0.42 + 0.28);
  },
  rally(b, s, o, hl) {
    b.box(0.92, 0.1, 0.08, DARK, 0, 0.05, hl - 0.07);                                 // light pod
    for (let i = 0; i < 4; i++) discZ(b, 0.06, 0.05, HEAD, -0.33 + i * 0.22, 0.11, hl - 0.03, 8);
    b.box(0.5, 0.014, hl * 0.5, WHITE, 0, 0.05, hl * 0.4);
  },
  limo(b, s, o, hl) {
    b.box(0.04, 0.08, 0.12, o.CH, 0, 0.05, hl - 0.06);                                // hood ornament
    b.box(0.14, 0.02, 0.05, o.CH, 0, 0.11, hl - 0.07);
    b.box(0.03, 0.014, hl - 0.1, o.CH, 0, 0.05, hl / 2);
  },
  classic(b, s, o, hl, hw) {
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) b.box(0.16, 0.014, 0.04, DARK, sx * (hw / 2 - 0.12), 0.05, hl * 0.3 + i * 0.09);
    b.box(0.03, 0.014, hl, o.CH, 0, 0.05, hl / 2);
  },
  gt(b, s, o, hl) {
    b.box(0.4, 0.04, hl * 0.6, shade(o.col, 1.05), 0, 0.05, hl * 0.45);              // bonnet bulge
  },
  supercar(b, s, o, hl) {
    for (const sx of [-1, 1]) b.box(0.2, 0.014, 0.18, DARK, sx * 0.24, 0.05, hl * 0.35);
  },
};

// ---------------------------------------------------------------- body geometry (per look + variant)
function bodyGeo(look, variant = 'clean') {
  const key = `body|${look.type}|${look.color}|${look.vip ? 1 : 0}${variant === 'clean' ? '' : '|' + variant}`;
  return memo(geoCache, key, () => {
    const s = SPECS[look.type];
    const col = variantColor(look.color, variant), colD = shade(col, 0.72), colL = lerpHex(col, 0xffffff, 0.25);
    const CH = variant === 'wreck' ? DULL_CHROME : CHROME;
    const o = { col, colD, colL, CH, variant, look };
    const { L, W, y0, yb, zf, zr, cab } = s;
    const b = new CarBuilder(s);

    // underbody (dark chassis between the wheels)
    b.box(W - 0.14, 0.08, L - 0.5, DARK, 0, y0 - 0.07, 0);

    // lower body: side profile with chamfered corners; the outer strips carry the wheel arches (and any fender humps)
    const yr = yb;  // rear deck height
    if (s.arches.length) {
      const xi = s.xi, sw = W / 2 - xi;
      sideExtrude(b, bodyProfile(s), 2 * xi, col);
      for (const sx of [-1, 1]) {
        sideExtrude(b, s.stripProfile, sw, col, sx * (xi + sw / 2));
        for (const a of s.arches) sideExtrude(b, a.well, 0.005, WELL, sx * (xi + 0.0055));   // wheel-well wall
        for (const a of s.arches) if (a.cap) sideExtrude(b, a.cap, 0.006, col, sx * (xi - 0.001));   // inner fender
      }
    } else sideExtrude(b, bodyProfile(s), W, col);
    // darker rocker band + belt crease
    b.box(W + 0.012, 0.07, L - 0.42, colD, 0, y0 + 0.02, 0);
    if (s.chromeStrip) b.box(W + 0.014, 0.03, L - 0.6, CH, 0, yb - 0.17, 0.02);

    // bumpers (a wreck has lost its front one)
    const bw = W + 0.04;
    if (s.bumper != null) {
      const bc = s.bumper === CHROME ? CH : s.bumper;
      if (variant !== 'wreck') b.box(bw, 0.14, 0.12, bc, 0, y0 + 0.02, L / 2 - 0.06);
      b.box(bw, 0.14, 0.12, bc, 0, y0 + 0.02, -L / 2 + 0.06);
    }
    b.box(0.3, 0.09, 0.02, CREAM, 0, y0 + 0.05, -L / 2 - 0.002);                // plate
    b.box(0.22, 0.02, 0.022, TRIM, 0, y0 + 0.085, -L / 2 - 0.003);

    // nose: grille + headlights
    const ly = yb - s.noseCh - 0.13;
    const grille = s.grille ?? 'default';
    if (grille === 'intake') {
      b.box(W * 0.6, 0.09, 0.02, DARK, 0, y0 + 0.17, zf + 0.002);              // low intake
    } else if (grille === 'wide') {
      b.box(W * 0.82, 0.2, 0.02, CH, 0, ly - 0.05, zf + 0.002);
      b.box(W * 0.78, 0.16, 0.024, DARK, 0, ly - 0.03, zf + 0.004);
      b.box(W * 0.78, 0.02, 0.028, CH, 0, ly + 0.04, zf + 0.006);
    } else if (grille === 'tall') {
      const gh = yb - s.noseCh - y0 - 0.1;
      b.box(W * 0.44, gh, 0.03, CH, 0, y0 + 0.1, zf + 0.002);
      b.box(W * 0.38, gh - 0.06, 0.034, DARK, 0, y0 + 0.13, zf + 0.004);
      for (let i = -3; i <= 3; i++) b.box(0.018, gh - 0.06, 0.04, CH, i * W * 0.05, y0 + 0.13, zf + 0.006);
    } else if (grille === 'oval') {
      b.box(0.5, 0.15, 0.02, CH, 0, y0 + 0.1, zf + 0.002);
      b.box(0.44, 0.11, 0.024, DARK, 0, y0 + 0.12, zf + 0.004);
      b.box(0.44, 0.02, 0.03, CH, 0, y0 + 0.165, zf + 0.006);
    } else if (grille === 'default') {
      b.box(W * 0.42, 0.16, 0.02, DARK, 0, ly - 0.02, zf + 0.002);
      for (let i = 0; i < 3; i++) b.box(W * 0.4, 0.018, 0.024, TRIM, 0, ly + 0.01 + i * 0.045, zf + 0.004);
    }
    const lights = s.lights ?? (s.roundLights ? 'round' : s.slimLights ? 'slim' : 'default');
    for (const sx of [-1, 1]) {
      const hc = variant === 'wreck' && sx > 0 ? 0x15181c : HEAD;   // a wreck lost a lamp
      if (lights === 'round') {
        b.cyl(0.11, 0.11, 0.04, CH, sx * 0.42, ly - 0.03 - 0.02, zf - 0.005, 10, Math.PI / 2);
        b.cyl(0.085, 0.085, 0.05, hc, sx * 0.42, ly - 0.03 - 0.025, zf + 0.0, 10, Math.PI / 2);
      } else if (lights === 'slim') {
        b.box(0.3, 0.07, 0.05, hc, sx * 0.44, yb - s.noseCh - 0.08, zf - 0.01);
      } else if (lights === 'quad') {
        for (const [lx, c] of [[0.3, sx > 0 ? hc : HEAD], [0.5, hc]]) {
          discZ(b, 0.08, 0.04, CH, sx * lx, ly - 0.0, zf + 0.012, 10);
          discZ(b, 0.062, 0.05, c, sx * lx, ly - 0.0, zf + 0.016, 10);
        }
      } else if (lights === 'default') {
        b.box(0.26, 0.14, 0.04, hc, sx * 0.44, ly - 0.03, zf);
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
      archTrims(b, s, DARK, 0.06, 0.08);                                         // fender flares
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

    const roofTop = cab.yt + 0.09, rz = (cab.f1 + cab.r1) / 2;
    if (s.open) {
      // ---- open car: raked windshield in a frame (the cockpit comes with the type extras)
      slab(b, cab.f1, cab.yt, cab.f0, yb, cab.w - 0.06, 0.03, GLASS);
      for (const sx of [-1, 1]) slab(b, cab.f1, cab.yt, cab.f0, yb, 0.04, 0.05, CH, sx * (cab.w / 2 - 0.02), -0.01);
      b.box(cab.w, 0.04, 0.06, CH, 0, cab.yt - 0.03, cab.f1);
      for (const sx of [-1, 1]) {
        b.box(0.1, 0.03, 0.04, colD, sx * (cab.w / 2 + 0.05), yb + 0.08, cab.f0 - 0.08);
        b.box(0.06, 0.08, 0.1, col, sx * (cab.w / 2 + 0.1), yb + 0.06, cab.f0 - 0.08);
      }
    } else {
      // ---- cabin: glass core, side frames with window holes, roof slab
      const cabPts = [[cab.r0, yb], [cab.f0, yb], [cab.f1, cab.yt], [cab.r1, cab.yt]];
      const cabCol = s.cabColor != null ? variantColor(s.cabColor, variant)
        : s.twoTone ? (col === 0xf2e8d5 ? 0x8fd1b0 : CREAM) : col;
      sideExtrude(b, cabPts, cab.w - 0.03, GLASS);
      const holes = windowHoles(s);
      for (const sx of [-1, 1]) sideExtrude(b, cabPts, 0.035, cabCol, sx * (cab.w / 2 - 0.0), holes);
      // windshield / rear glass tint bands (slightly darker lower edge)
      // a cream roof on a cream car would vanish: those get a teal roof (the compact's original rule)
      const roofCol = s.roofColor ? (look.color === 0xf2e8d5 && s.roofColor === CREAM ? 0x2a9d8f : variantColor(s.roofColor, variant)) : cabCol;
      const rl = cab.f1 - cab.r1 + 0.06;
      b.box(cab.w + 0.04, 0.07, rl, roofCol, 0, cab.yt, rz);
      b.box(cab.w - 0.06, 0.02, rl - 0.1, shade(roofCol, 0.9), 0, cab.yt + 0.07, rz);
      // dark glass bottom line where the cabin meets the body
      b.box(cab.w - 0.01, 0.03, cab.f0 - cab.r0, GLASS_D, 0, yb, (cab.f0 + cab.r0) / 2);
      // side mirrors
      for (const sx of [-1, 1]) {
        b.box(0.1, 0.03, 0.04, colD, sx * (cab.w / 2 + 0.05), yb + 0.08, cab.f0 - 0.08);
        b.box(0.06, 0.08, 0.1, cabCol, sx * (cab.w / 2 + 0.1), yb + 0.06, cab.f0 - 0.08);
      }

      // ---- roof extras
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
    }
    if (s.spoiler) {
      const sz = zr + 0.14, sy = yb + 0.24;
      for (const sx of [-1, 1]) b.box(0.06, sy - yb, 0.08, DARK, sx * 0.45, yb, sz);
      b.box(W - 0.02, 0.06, 0.24, look.vip ? DARK : colD, 0, sy, sz - 0.02);
      for (const sx of [-1, 1]) b.box(0.04, 0.12, 0.28, DARK, sx * (W / 2 - 0.02), sy - 0.04, sz - 0.02);
    }
    EXTRAS[look.type]?.(b, s, o);
    if (look.vip && !s.open) {
      // crown on the roof
      const cy = s.top.y - 0.01, cz = s.top.z;
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
function hoodGeo(look, variant = 'clean') {
  return memo(geoCache, `hood|${look.type}|${look.color}|${look.vip ? 1 : 0}${variant === 'clean' ? '' : '|' + variant}`, () => {
    const s = SPECS[look.type], hl = s.hz1 - s.hz0, hw = s.hw;
    const col = variantColor(look.color, variant);
    const b = new Builder();
    if (look.type === 'hotrod') {
      // a hood with a hole: the engine and its blower (chassis) stick through and stay put when it opens
      const ew = 0.54, sw = (hw - ew) / 2;
      for (const sx of [-1, 1]) b.box(sw, 0.05, hl, col, sx * (ew + sw) / 2, 0, hl / 2);
      b.box(ew, 0.05, hl * 0.22, col, 0, 0, hl * 0.89);
    } else {
      b.box(hw, 0.05, hl, col, 0, 0, hl / 2);
      // soft highlight (dark paint: matched to the roof, a lighter plate would read as grey primer)
      b.box(hw - 0.12, 0.012, hl - 0.12, brightness(col) < 0.3 ? shade(col, 0.9) : lerpHex(col, 0xffffff, 0.12), 0, 0.05, hl / 2);
    }
    if (s.stripes) {
      const stc = look.vip ? 0xffffff : CREAM;
      for (const sx of [-1, 1]) b.box(0.1, 0.014, hl, stc, sx * 0.12, 0.05, hl / 2);
      b.box(0.3, 0.05, 0.22, DARK, 0, 0.05, hl * 0.45);                             // scoop
    }
    if (look.type === 'pickup') b.box(0.5, 0.04, hl - 0.15, shade(col, 0.85), 0, 0.05, hl / 2);
    HOOD_EXTRAS[look.type]?.(b, s, { col, colD: shade(col, 0.72), CH: variant === 'wreck' ? DULL_CHROME : CHROME, variant }, hl, hw);
    return b.build();
  });
}

// A wheel is a tyre (rubber + tread, the whitewall on 'white') and a rim (disc, spokes, cap). A healthy or worn wheel is
// one merged mesh; a flat one is a rim that spins plus its own tyre, squashed against the floor every frame.
function tyreParts(b, r, w, style, worn) {
  const Z = Math.PI / 2;
  if (!worn) {
    b.cyl(r, r, w, RUBBER, 0, -w / 2, 0, 12, 0, 0, Z);
    treadBlocks(b, r, w);
  } else {
    // worn out: sun-dried grey rubber, the tread rubbed off to a smooth polished band with a few shallow stubs left on
    // the shoulders, the steel belt showing through in places, and the sidewalls crazed with cracks
    b.cyl(r, r, w, WORN, 0, -w / 2, 0, 16, 0, 0, Z);
    b.cyl(r + 0.003, r + 0.003, w * 0.66, WORN_L, 0, -w * 0.33, 0, 16, 0, 0, Z);
    const at = (a, rr, h) => [rr * Math.cos(a) - h / 2, rr * Math.sin(a)];
    for (const [a, sx] of [[0.4, 1], [1.1, -1], [2.5, 1], [3.3, -1], [4.6, 1], [5.6, -1]]) {
      const [y, z] = at(a, r + 0.002, 0.012);
      b.box(w * 0.18, 0.012, 0.06, WORN_D, sx * w * 0.4, y, z, a);
    }
    for (const [a, l] of [[1.5, 0.13], [3.9, 0.09], [5.2, 0.1]]) {
      const [y, z] = at(a, r + 0.003, 0.012), [y2, z2] = at(a + 0.04, r + 0.008, 0.012);
      b.box(w * 0.5, 0.012, l, CORD, 0, y, z, a);
      b.box(w * 0.22, 0.012, l * 0.5, CORD_RUST, w * 0.06, y2, z2, a + 0.04);
    }
    const rnd = mulberry32(Math.round(r * 1000 + w * 100));
    for (const sx of [-1, 1]) for (let i = 0; i < 9; i++) {
      const a = (i + rnd() * 0.7) * (Math.PI * 2 / 9), rr = r * (0.7 + rnd() * 0.18), l = 0.035 + rnd() * 0.045;
      const tw = (rnd() - 0.5) * 1.1, [y, z] = at(a, rr, l);
      b.box(0.008, l, 0.02, CRACK, sx * (w / 2 + 0.003), y, z, a + tw);
      if (rnd() < 0.5) { const [y2, z2] = at(a + 0.12, rr + l * 0.3, l * 0.6); b.box(0.008, l * 0.6, 0.018, CRACK, sx * (w / 2 + 0.003), y2, z2, a + tw + 0.9); }
    }
  }
  if (style === 'white') b.cyl(r * 0.82, r * 0.82, w + 0.012, worn ? 0xd6cdb8 : WHITE, 0, -(w + 0.012) / 2, 0, 12, 0, 0, Z);   // whitewall
}
function treadBlocks(b, r, w) {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    b.box(w * 0.8, 0.035, 0.08, 0x3a3f48, 0, (r - 0.004) * Math.cos(a) - 0.0175, (r - 0.004) * Math.sin(a), a);
  }
}
function rimParts(b, r, w, hub, style) {
  const Z = Math.PI / 2;
  b.cyl(r * 0.6, r * 0.6, w + 0.02, hub, 0, -(w + 0.02) / 2, 0, 10, 0, 0, Z);
  const hd = shade(hub, 0.62);
  if (style === 'wire') {
    for (let i = 0; i < 8; i++) b.box(w + 0.03, r * 1.0, 0.025, hd, 0, -r * 0.5, 0, i * Math.PI / 8);   // wire spokes
    b.cyl(r * 0.18, r * 0.18, w + 0.08, hub, 0, -(w + 0.08) / 2, 0, 6, 0, 0, Z);                     // knock-off
  } else {
    b.box(w + 0.03, r * 0.95, 0.06, hd, 0, -r * 0.475, 0);                          // spokes: a cross so spin reads
    b.box(w + 0.03, 0.06, r * 0.95, hd, 0, -0.03, 0);
  }
  b.cyl(r * 0.2, r * 0.2, w + 0.05, hub, 0, -(w + 0.05) / 2, 0, 8, 0, 0, Z);
}
function wheelGeo(r, w, hub, style = 'std', worn = false) {
  return memo(geoCache, `wheel|${r}|${w}|${hub}${style === 'std' ? '' : '|' + style}${worn ? '|worn' : ''}`, () => {
    const b = new Builder();
    tyreParts(b, r, w, style, worn);
    rimParts(b, r, w, hub, style);
    return b.build();
  });
}
function rimGeo(r, w, hub, style = 'std') {
  return memo(geoCache, `rim|${r}|${w}|${hub}|${style}`, () => {
    const b = new Builder();
    rimParts(b, r, w, hub, style);
    return b.build();
  });
}
/** The tyre of a flat wheel: a finer ring (rubber from the bead at 0.6 r out to the tread) whose vertices squashTyre
 *  moves; every car with a flat gets its own copy. */
function flatTyreGeo(r, w, style) {
  return memo(geoCache, `flattyre|${r}|${w}|${style}`, () => {
    const b = new Builder(), rb = r * 0.6, h = w / 2, V = (x, y) => new THREE.Vector2(x, y);
    const ring = (pts, col) => b._add(new THREE.LatheGeometry(pts, 24), col, 0, 0, 0, 0, 0, -Math.PI / 2);
    ring([V(rb, -h), V(r * 0.72, -h), V(r * 0.84, -h), V(r * 0.94, -h), V(r, -h), V(r, 0), V(r, h), V(r * 0.94, h), V(r * 0.84, h), V(r * 0.72, h), V(rb, h)], RUBBER);
    if (style === 'white') for (const sx of [-1, 1]) {
      const x = sx * (h + 0.004), pts = [V(r * 0.62, x), V(r * 0.72, x), V(r * 0.82, x)];
      ring(sx < 0 ? pts : pts.reverse(), WHITE);
    }
    treadBlocks(b, r, w);
    return b.build();
  });
}
/** Squash a flat tyre against the floor: along every spoke that would reach below the floor the rubber between the
 *  bead and the tread is compressed so the tread just meets it, and the squeezed sidewalls bulge out sideways. Done in
 *  the wheel's upright frame after turning the rest shape by the spin, so the flat patch stays down while it rolls. */
function squashTyre(w, d) {
  const { rest, g } = w.flat, arr = g.attributes.position.array;
  const a = w.spin.rotation.x, c = Math.cos(a), sn = Math.sin(a);
  const r = w.r, rb = r * 0.6, hc = r * (1 - FLAT_DROP * d), bulge = FLAT_BULGE * w.wr;
  for (let i = 0; i < arr.length; i += 3) {
    const x = rest[i], ry = rest[i + 1], rz = rest[i + 2];
    let y = ry * c - rz * sn, z = ry * sn + rz * c, nx = x;
    const rho = Math.hypot(y, z);
    if (y < 0 && rho > rb) {
      const reach = hc * rho / -y;   // distance from the axle to the floor along this spoke
      if (reach < r) {
        const k = (Math.max(reach, rb + 0.003) - rb) / (r - rb), f = (rb + (rho - rb) * k) / rho;
        const out = (1 - k) * Math.min(1, (rho - rb) / (r - rb));   // 0 at the bead and outside the patch
        y *= f;
        z *= f * (1 + FLAT_SPREAD * out);
        if (Math.sign(x) === w.sx) nx = x + Math.sign(x) * bulge * out;   // the outer wall (the inner one, under the car, stays clear of it)
      }
    }
    arr[i] = nx;
    arr[i + 1] = y;
    arr[i + 2] = z;
  }
  g.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------- overlays
// Anything lying on the hood must move with it (it opens for battery trouble), so overlays are built as a pair:
// chassis space + hood space. dual(s) collects both; .c / .h are Builders, .hb() takes chassis coordinates.
function dual(s) {
  const c = new CarBuilder(s), h = new Builder();
  let nc = 0, nh = 0;
  const d = {
    s, hl: s.hz1 - s.hz0, hw: s.hw, hoodTop: s.yb + 0.062,
    cb: (...a) => { c.box(...a); nc++; return d; },
    // box in chassis coordinates that rides on the hood
    hb: (w, hh, dd, col, x, y, z, rx = 0, ry = 0, rz = 0) => { h.box(w, hh, dd, col, x, y - s.yb, z - s.hz0, rx, ry, rz); nh++; return d; },
    cslab: (...a) => { slab(c, ...a); nc++; return d; },
    cext: (...a) => { sideExtrude(c, ...a); nc++; return d; },
    build: () => ({ c: nc ? c.build() : null, h: nh ? h.build() : null }),
  };
  return d;
}
const onHood = (s, z) => z > s.hz0 + 0.03 && z < s.hz1 - 0.03;

// --- primer patches + scratches ('paint' problem; also the patched look of a classic)
function paintGeo(type) {
  return memo(geoCache, `paint|${type}`, () => {
    const s = SPECS[type], { W, y0, yb, cab } = s;
    const b = new CarBuilder(s);
    const roofTop = s.top.y - 0.02, rz = s.top.z, rl = s.top.l, rw = s.open ? s.top.w * 0.5 : cab.w;
    // primer patches on the roof
    b.box(rw * 0.56, 0.014, rl * 0.6, PRIMER, -0.13, roofTop + 0.02, rz - rl * 0.12);
    b.box(rw * 0.28, 0.016, rl * 0.3, PRIMER_D, 0.2, roofTop + 0.02, rz + rl * 0.22);
    // rear deck patch
    const deckLen = cab.r0 - s.zr;
    if (deckLen > 0.3 && !s.bed && s.deck && !s.open) b.box(W * 0.5, 0.014, deckLen * 0.55, PRIMER, 0.15, yb + (s.stripes ? 0.014 : 0.002), (s.zr + cab.r0) / 2);
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
      if (!s.open) b.box(0.02, 0.05, 0.3, PRIMER, sx * (cab.w / 2 + 0.022), cab.yt - 0.05, (cab.f1 + cab.r1) / 2);
    }
    return b.build();
  });
}
function hoodPaintGeo(type) {
  return memo(geoCache, `hoodpaint|${type}`, () => {
    const s = SPECS[type], hl = s.hz1 - s.hz0, hw = s.hw;
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
    b.box(Math.min(s.W - 0.14, s.hw - 0.04), 0.02, hl - 0.06, 0x1f2329, 0, s.yb - 0.005, s.hz0 + hl / 2);   // engine bay
    if (s.bayEngine !== false) {
      b.box(0.34, 0.03, 0.3, 0x5c6670, -0.22, s.yb, s.hz0 + hl * 0.4);                        // engine cover
      b.box(0.08, 0.04, 0.24, 0xf26b5b, -0.22, s.yb + 0.03, s.hz0 + hl * 0.4);
    }
    const bz = s.hz0 + hl * (s.batteryZ ?? 0.55), bx = s.batteryZ ? 0 : Math.min(0.26, s.hw / 2 - 0.17);
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
    b.box(0.03, 0.5, 0.03, 0x9aa5ad, -Math.min(0.5, s.hw / 2 - 0.08), s.yb, s.hz0 + hl * 0.62, -0.45);
    return b.build();
  });
}
// --- the surfaces of a body, for overlays: each entry is a flat patch to cover
// kind: 'hood' (hood space) | 'top' | 'deck' | 'nose' | 'tail' | 'side' (sx) | 'cabside' (sx) | 'ws' | 'rw'
function surfaces(s) {
  const c = s.cab, out = [];
  out.push({ k: 'hood' });
  out.push({ k: 'top' });
  if (s.deck && !s.bed) out.push({ k: 'deck' });
  out.push({ k: 'nose' }, { k: 'tail' }, { k: 'side', sx: 1 }, { k: 'side', sx: -1 });
  if (!s.open) out.push({ k: 'cabside', sx: 1 }, { k: 'cabside', sx: -1 }, { k: 'ws' }, { k: 'rw' });
  else out.push({ k: 'ws' });
  return out;
}
// windshield / rear glass endpoints (rear -> front) in the side profile
const wsLine = (s) => [s.cab.f1, s.cab.yt, s.cab.f0, s.yb];
const rwLine = (s) => [s.cab.r0, s.yb, s.cab.r1, s.cab.yt];

// --- dirt: 3 cumulative levels. Mud is thrown up by the wheels (sills, arches, lower doors, tail): opaque splashes.
// From level 2 a dust film settles on the flat tops (see-through, the paint shows under it, blotchier where it is
// thick); heavy dirt reaches the windows. Stays put while driving (dirt does not fall off a moving car).
const MUD = 0x7d634a, MUD_D = 0x5c4835, DUST_D = 0x9a8b72;
const dustMats = [   // level 2, level 3
  new THREE.MeshLambertMaterial({ color: 0xb3a283, transparent: true, opacity: 0.38, depthWrite: false }),
  new THREE.MeshLambertMaterial({ color: 0xa69373, transparent: true, opacity: 0.55, depthWrite: false }),
];
function dirtGeo(type, level) {
  return memo(geoCache, `dirt|${type}|${level}`, () => {
    const s = SPECS[type], d = dual(s), rnd = mulberry32(level * 7 + type.length * 131);
    const { W, y0, yb, zr, zf, cab } = s;
    const h = yb - y0;
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.014);
      d.cb(0.02, 0.07 + level * 0.03, s.L - 0.5, MUD_D, x, y0 - 0.0, 0);              // sill band
      for (const [z, r] of [[s.ax, s.rf], [s.axR, s.r]]) {                             // spray behind each wheel
        for (let i = 0; i < 3 + level * 2; i++) {
          const zz = Math.max(zr + 0.06, z - r - 0.05 - rnd() * (0.3 + level * 0.12));   // on the body, never past the tail
          const hh = 0.06 + rnd() * h * (0.25 + level * 0.15);
          d.cb(0.022, hh, 0.05 + rnd() * 0.08, rnd() < 0.5 ? MUD : MUD_D, x, y0 + 0.02, zz);
        }
      }
      for (const a of s.arches) d.cext(archBandPts(a, 0.004, 0.05 + level * 0.012, 0.03), 0.022, MUD_D, x);   // arch lips
      if (level >= 2) {
        for (let i = 0; i < 6 + level * 3; i++) {
          const zz = zr + 0.15 + rnd() * (s.L - 0.4);
          d.cb(0.022, 0.05 + rnd() * h * 0.35 * (level - 1), 0.08 + rnd() * 0.16, rnd() < 0.6 ? MUD : DUST_D, x, y0 + 0.04, zz);
        }
      }
      if (level >= 3 && !s.open) d.cb(0.02, 0.1, 0.5, DUST_D, sx * (cab.w / 2 + 0.03), yb + 0.1, (cab.f0 + cab.r0) / 2);
    }
    d.cb(W - 0.2, 0.06 + level * 0.03, 0.02, MUD_D, 0, y0, zf + 0.014);              // nose + tail grime
    d.cb(W - 0.1, 0.08 + level * 0.06, 0.02, MUD, 0, y0, zr - 0.016);
    return d.build();
  });
}
/** The see-through dust film of dirt levels 2 and 3: tops, hood, deck; level 3 also the glass (wipers kept a fan clean). */
function dustGeo(type, level) {
  return memo(geoCache, `dust|${type}|${level}`, () => {
    const s = SPECS[type], d = dual(s), rnd = mulberry32(level * 31 + type.length * 17);
    const { W, yb, cab } = s, t = s.top;
    const blot = (put, w, l, x, y, z) => {   // the film, then thicker blotches over it
      put(w, 0.006, l, 0xffffff, x, y, z);
      for (let i = 0; i < level + 1; i++) put(w * (0.25 + rnd() * 0.3), 0.006, l * (0.2 + rnd() * 0.3), 0xffffff, x + (rnd() - 0.5) * w * 0.5, y + 0.004, z + (rnd() - 0.5) * l * 0.5);
    };
    blot(d.cb, t.w - 0.04, t.l - 0.04, 0, t.y + 0.003, t.z);
    blot(d.hb, d.hw - 0.04, d.hl - 0.04, 0, d.hoodTop + 0.003, s.hz0 + d.hl / 2);
    if (s.deck && !s.bed && !s.open) blot(d.cb, W - 0.12, cab.r0 - s.zr - s.tailCh - 0.04, 0, yb + 0.003, (cab.r0 + s.zr + s.tailCh) / 2);
    if (level >= 3) {
      if (!s.open) {
        const [za, ya, zb, yb2] = rwLine(s);
        d.cslab(za, ya, zb, yb2, cab.w * 0.8, 0.008, 0xffffff, 0, 0.02);
      }
      const [za, ya, zb, yb2] = wsLine(s);   // the wipers' reach stays clear: only the lower edge and corners
      d.cslab(za, ya, za + (zb - za) * 0.3, ya + (yb2 - ya) * 0.3, cab.w * 0.8, 0.008, 0xffffff, 0, 0.02);
    }
    return d.build();
  });
}

// --- foam: 3 cumulative levels of suds (white or tri-colour wax foam). Piles up on the tops, runs down the sides.
const FOAM = [0xffffff, 0xf1f7fb, 0xe3eef6];
const FOAM_TRI = [0xf7a8c8, 0x9fd3f5, 0xfde58a, 0xffffff];
function foamGeo(type, level, tri) {
  return memo(geoCache, `foam|${type}|${level}|${tri ? 1 : 0}`, () => {
    const s = SPECS[type], d = dual(s), rnd = mulberry32(991 + level * 13 + type.length * 7);
    const { W, y0, yb, cab } = s;
    const pal = tri ? FOAM_TRI : FOAM;
    const pick = () => pal[Math.floor(rnd() * pal.length)];
    const k = 0.7 + level * 0.15;
    const blob = (put, x, y, z, big = 1, lim = Infinity) => {
      const w = (0.12 + rnd() * 0.16) * k * big, h = (0.06 + rnd() * 0.1) * k * big;
      x = Math.max(-lim + w / 2, Math.min(lim - w / 2, x));
      put(w, h, w * (0.8 + rnd() * 0.4), pick(), x, y, z);
      if (rnd() < 0.6) put(w * 0.6, h * 0.8, w * 0.6, pick(), x + (rnd() - 0.5) * w * 0.4, y + h * 0.7, z + (rnd() - 0.5) * w * 0.4);
    };
    const t = s.top;
    for (let i = 0; i < 5 + level * 5; i++) blob(d.cb, (rnd() - 0.5) * t.w * 0.9, t.y - 0.02, t.z + (rnd() - 0.5) * t.l * 0.9, 1.2);
    for (let i = 0; i < 2 + level * 4; i++) blob(d.hb, (rnd() - 0.5) * d.hw * 0.85, d.hoodTop - 0.02, s.hz0 + d.hl * (0.1 + rnd() * 0.8), 1, d.hw / 2);
    if (s.deck && !s.bed && !s.open) for (let i = 0; i < 1 + level * 2; i++) blob(d.cb, (rnd() - 0.5) * W * 0.8, yb - 0.02, s.zr + 0.1 + rnd() * (cab.r0 - s.zr - 0.2));
    if (level >= 2) {
      const [za, ya, zb, yb2] = wsLine(s);
      for (let i = 0; i < level * 2; i++) {
        const f = rnd();
        blob(d.cb, (rnd() - 0.5) * cab.w * 0.8, ya + (yb2 - ya) * f, za + (zb - za) * f, 0.9);
      }
      // suds running down the sides from the belt line
      for (const sx of [-1, 1]) {
        for (let i = 0; i < level * 4; i++) {   // sheets of suds sliding down the doors, never below the sill
          const z = s.zr + 0.2 + rnd() * (s.L - 0.4), hh = Math.min(yb - y0 - 0.08, (0.1 + rnd() * 0.25) * (level - 0.5));
          d.cb(0.03, hh, 0.14 + rnd() * 0.2, pick(), sx * (W / 2 + 0.014), yb - hh, z);
          d.cb(0.07, 0.06, 0.16 + rnd() * 0.12, pick(), sx * (W / 2 - 0.01), yb - 0.04, z);
        }
        if (!s.open && level >= 3) for (let i = 0; i < 3; i++) blob(d.cb, sx * (cab.w / 2 + 0.03), yb + 0.05 + rnd() * 0.3, cab.r0 + rnd() * (cab.f0 - cab.r0), 0.7);
      }
    }
    if (level >= 3) for (const z of [s.zf + 0.02, s.zr - 0.02]) for (let i = 0; i < 3; i++) blob(d.cb, (rnd() - 0.5) * W * 0.7, y0 + 0.2 + rnd() * 0.2, z, 0.8);
    return d.build();
  });
}

// --- wet: a water sheen on the tops and beads of water; the drips themselves fall in world space (leak.js)
function wetGeo(type) {
  return memo(geoCache, `wet|${type}`, () => {
    const s = SPECS[type], d = dual(s), rnd = mulberry32(55 + type.length);
    const t = s.top;
    d.cb(t.w * 0.8, 0.008, t.l * 0.8, 0xffffff, 0, t.y + 0.004, t.z);
    d.hb(d.hw * 0.8, 0.008, d.hl * 0.75, 0xffffff, 0, d.hoodTop + 0.004, s.hz0 + d.hl / 2);
    for (let i = 0; i < 14; i++) d.cb(0.035, 0.02, 0.035, 0xffffff, (rnd() - 0.5) * t.w * 0.9, t.y + 0.012, t.z + (rnd() - 0.5) * t.l * 0.9);
    for (let i = 0; i < 8; i++) d.hb(0.035, 0.02, 0.035, 0xffffff, (rnd() - 0.5) * d.hw * 0.9, d.hoodTop + 0.012, s.hz0 + rnd() * d.hl);
    for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) {   // runs down the doors
      d.cb(0.014, 0.12 + rnd() * 0.15, 0.025, 0xffffff, sx * (s.W / 2 + 0.012), s.y0 + 0.06 + rnd() * 0.1, s.zr + 0.2 + rnd() * (s.L - 0.4));
    }
    return d.build();
  });
}

// --- masking (paint booth): paper + tape over every glass, the lamps; the wheels get their own covers
const PAPER = 0xeee3c6, PAPER_D = 0xd9c9a4, TAPE = 0x4f8fd6;
function maskGeo(type) {
  return memo(geoCache, `mask|${type}`, () => {
    const s = SPECS[type], d = dual(s);
    const { W, y0, yb, zf, zr, cab } = s;
    const ly = yb - s.noseCh - 0.13;
    // windshield + rear glass
    const ws = wsLine(s);
    d.cslab(...ws, cab.w - 0.02, 0.016, PAPER, 0, 0.02);
    d.cslab(ws[0], ws[1], ws[0] + (ws[2] - ws[0]) * 0.06, ws[1] + (ws[3] - ws[1]) * 0.06, cab.w, 0.02, TAPE, 0, 0.03);
    d.cslab(ws[2] - (ws[2] - ws[0]) * 0.06, ws[3] - (ws[3] - ws[1]) * 0.06, ws[2], ws[3], cab.w, 0.02, TAPE, 0, 0.03);
    if (!s.open) {
      const rw = rwLine(s);
      if (s.arches.some((a) => a.hump)) { rw[0] += (rw[2] - rw[0]) * 0.08; rw[1] += (rw[3] - rw[1]) * 0.08; }   // clear of the rear tyres
      d.cslab(...rw, cab.w - 0.02, 0.016, PAPER, 0, 0.02);
      d.cslab(rw[0], rw[1], rw[0] + (rw[2] - rw[0]) * 0.08, rw[1] + (rw[3] - rw[1]) * 0.08, cab.w, 0.02, TAPE, 0, 0.03);
      // side windows: paper over each hole, a tape line along the bottom
      for (const hole of windowHoles(s)) {
        const lo = s.arches.some((a) => a.hump) ? 0 : 0.03;   // a narrow cabin between fender humps: clear of the tyres
        const pts = hole.map(([z, y], i) => [z + (i === 0 || i === 3 ? -0.03 : 0.03), y + (i < 2 ? -lo : 0.03)]);
        for (const sx of [-1, 1]) {
          d.cext(pts, 0.016, PAPER, sx * (cab.w / 2 + 0.03));
          const zz0 = pts[0][0], zz1 = pts[1][0];
          d.cb(0.02, 0.035, zz1 - zz0, TAPE, sx * (cab.w / 2 + 0.042), pts[0][1] - 0.01, (zz0 + zz1) / 2);
        }
      }
    } else {
      // open car: paper tented over the seats (and roll hoops), a low sheet over the dash, taped down
      const z0 = cab.r0 - 0.06, z1 = cab.f0 - 0.02, fl = Math.max(0.04, z1 - z0 - 0.62);
      d.cb(W - 0.12, 0.6, 0.62, PAPER, 0, yb, z0 + 0.31);
      d.cb(W - 0.1, 0.03, 0.64, TAPE, 0, yb + 0.58, z0 + 0.31);
      d.cb(W - 0.12, 0.24, fl, PAPER_D, 0, yb, z0 + 0.62 + fl / 2);
      d.cb(W - 0.1, 0.03, 0.04, TAPE, 0, yb + 0.22, z1 - 0.02);
    }
    // lamps: paper caps + tape
    for (const sx of [-1, 1]) {
      d.cb(0.36, 0.22, 0.03, PAPER, sx * 0.44, Math.max(y0 + 0.04, ly - 0.1), zf + 0.03);
      d.cb(0.38, 0.03, 0.035, TAPE, sx * 0.44, Math.max(y0 + 0.04, ly - 0.1) + 0.2, zf + 0.032);
      d.cb(0.32, 0.2, 0.03, PAPER, sx * (W / 2 - 0.17), yb - s.tailCh - 0.22, zr - 0.03);
      d.cb(0.34, 0.03, 0.035, TAPE, sx * (W / 2 - 0.17), yb - s.tailCh - 0.04, zr - 0.032);
      if (!s.open) d.cb(0.1, 0.12, 0.14, PAPER, sx * (cab.w / 2 + 0.1), yb + 0.05, cab.f0 - 0.08);   // mirrors
    }
    if (type === 'camper') {
      for (const sx of [-1, 1]) d.cb(0.02, 0.32, 0.54, PAPER, sx * (W / 2 + 0.02), 1.11, -0.72);
      d.cb(0.58, 0.28, 0.02, PAPER, 0, 1.09, zr - 0.03);
      d.cb(W - 0.18, 0.24, 0.02, PAPER, 0, 1.36, 1.03);
    }
    return d.build();
  });
}
function wheelMaskGeo(r, w) {
  return memo(geoCache, `wmask|${r}|${w}`, () => {
    const b = new Builder();
    b.box(w + 0.06, r * 1.9, r * 1.9, PAPER, 0, -r * 0.95, 0);
    b.box(w + 0.08, 0.04, r * 1.95, TAPE, 0, -0.02, 0);
    b.box(w + 0.07, r * 1.2, 0.03, PAPER_D, 0, -r * 0.6, 0);
    return b.build();
  });
}

// --- hazard lamps: the four indicators + the repeaters on the mirrors (those read from the high camera)
function hazardGeo(type) {
  return memo(geoCache, `haz|${type}`, () => {
    const s = SPECS[type], b = new CarBuilder(s), A = 0xffb13b;
    for (const sx of [-1, 1]) {
      b.box(0.13, 0.08, 0.05, A, sx * (s.W / 2 - 0.08), s.y0 + 0.16, s.zf + 0.006);
      b.box(0.11, 0.07, 0.05, A, sx * (s.W / 2 - 0.08), s.yb - s.tailCh - 0.16, s.zr - 0.01);
      b.box(0.04, 0.05, 0.12, A, sx * (s.W / 2 + 0.012), s.yb - 0.16, s.ax - s.rf - 0.12);   // side repeaters
      if (!s.open) b.box(0.07, 0.025, 0.08, A, sx * (s.cab.w / 2 + 0.11), s.yb + 0.135, s.cab.f0 - 0.08);
    }
    return b.build();
  });
}

// --- racing stripes in a second colour (paint shop stripe kit)
function stripeGeo(type, hex) {
  return memo(geoCache, `stripe|${type}|${hex}`, () => {
    const s = SPECS[type], d = dual(s), sw = 0.13, sxs = [-0.13, 0.13];
    const t = s.top;
    for (const x of sxs) {
      d.hb(sw, 0.016, d.hl, hex, x, d.hoodTop + 0.004 + (s.stripes ? 0.002 : 0), s.hz0 + d.hl / 2);
      if (!s.open) d.cb(sw, 0.012, t.l + 0.04, hex, x, t.y + 0.003, t.z);
      if (s.deck && !s.bed) d.cb(sw, 0.012, s.cab.r0 - s.zr - s.tailCh, hex, x, s.yb + 0.016, (s.cab.r0 + s.zr + s.tailCh) / 2);
      d.cb(sw, s.yb - s.noseCh - s.y0 - 0.12, 0.016, hex, x, s.y0 + 0.16, s.zf + 0.012);
      d.cslab(s.zf - s.noseCh, s.yb, s.zf, s.yb - s.noseCh, sw, 0.012, hex, x, 0.004);
      if (type === 'muscle') d.hb(0.15, 0.014, 0.56, hex, x, s.yb + 0.15, s.hz0 + d.hl * 0.42);   // over the hood scoop
    }
    return d.build();
  });
}

// --- gloss per side (0 front, 1 right, 2 back, 3 left): dull haze when low, mirror streaks when high
function sideParts(s, side, put, hput, thick, col, off) {
  const { W, y0, yb, zf, zr, cab } = s, t = s.top;
  if (side === 0 || side === 2) {
    const front = side === 0;
    if (front) hput(s.hw - 0.1, thick, s.hz1 - s.hz0 - 0.1, col, 0, yb + 0.062 + off, (s.hz0 + s.hz1) / 2);
    else if (s.deck && !s.bed) put(W - 0.16, thick, cab.r0 - zr - s.tailCh - 0.06, col, 0, yb + off, (cab.r0 + zr + s.tailCh) / 2);
    put(t.w - 0.06, thick, t.l / 2 - 0.04, col, 0, t.y + off, t.z + (front ? 1 : -1) * t.l / 4);
    const z = front ? zf + off + 0.002 : zr - off - 0.002 - thick;
    put(W - 0.16, yb - y0 - (front ? s.noseCh : s.tailCh) - 0.1, thick, col, 0, y0 + 0.08, z + thick / 2);
  } else {
    const sx = side === 1 ? 1 : -1;
    put(thick, yb - y0 - 0.12, s.L - 0.36, col, sx * (W / 2 + off + 0.004), y0 + 0.08, 0);
    if (!s.open) put(thick, (cab.yt - yb) * 0.7, (cab.f0 - cab.r0) * 0.7, col, sx * (cab.w / 2 + off + 0.03), yb + 0.06, (cab.f0 + cab.r0) / 2);
  }
}
function hazeGeo(type, side) {
  return memo(geoCache, `haze|${type}|${side}`, () => {
    const s = SPECS[type], d = dual(s);
    sideParts(s, side, d.cb, d.hb, 0.012, 0xffffff, 0.012);
    return d.build();
  });
}
function streakGeo(type, side) {
  return memo(geoCache, `streak|${type}|${side}`, () => {
    const s = SPECS[type], d = dual(s), { W, y0, yb, zf, zr, cab } = s, t = s.top;
    const sk = (put, w, l, x, y, z, ry) => put(w, 0.01, l, 0xffffff, x, y, z, 0, ry);
    if (side === 0) {
      sk(d.hb, 0.07, d.hl * 0.7, -0.25, d.hoodTop + 0.01, s.hz0 + d.hl / 2, 0.5);
      sk(d.hb, 0.035, d.hl * 0.5, -0.08, d.hoodTop + 0.01, s.hz0 + d.hl / 2, 0.5);
      sk(d.cb, 0.06, t.l * 0.35, -0.18, t.y + 0.012, t.z + t.l * 0.22, 0.5);
    } else if (side === 2) {
      sk(d.cb, 0.06, t.l * 0.35, 0.18, t.y + 0.012, t.z - t.l * 0.22, 0.5);
      if (s.deck && !s.bed) sk(d.cb, 0.06, (cab.r0 - zr) * 0.6, 0.2, yb + 0.02, (cab.r0 + zr) / 2, 0.5);
      d.cb(W * 0.5, 0.025, 0.01, 0xffffff, 0, yb - s.tailCh - 0.06, zr - 0.03);
    } else {
      const sx = side === 1 ? 1 : -1, x = sx * (W / 2 + 0.03);
      d.cb(0.01, 0.03, s.L * 0.55, 0xffffff, x, yb - 0.1, 0.1);
      d.cb(0.01, 0.02, s.L * 0.3, 0xffffff, x, (y0 + yb) / 2, -0.2);
      d.cb(0.01, 0.07, 0.07, 0xffffff, x, yb - 0.2, zf - 0.5);
    }
    return d.build();
  });
}

// --- classics: rust, holes and cracked glass on a wreck
function wreckGeo(type) {
  return memo(geoCache, `wreck|${type}`, () => {
    const s = SPECS[type], d = dual(s), rnd = mulberry32(4242 + type.length * 17);
    const { W, y0, yb, cab } = s, t = s.top;
    const rust = () => (rnd() < 0.5 ? RUST : RUST_D);
    for (let i = 0; i < 6; i++) d.cb(t.w * (0.15 + rnd() * 0.25), 0.014, t.l * (0.15 + rnd() * 0.25), rust(), (rnd() - 0.5) * t.w * 0.6, t.y + 0.002, t.z + (rnd() - 0.5) * t.l * 0.6);
    for (let i = 0; i < 5; i++) d.hb(d.hw * (0.15 + rnd() * 0.25), 0.014, d.hl * (0.15 + rnd() * 0.25), rust(), (rnd() - 0.5) * d.hw * 0.6, d.hoodTop + 0.002, s.hz0 + d.hl * (0.15 + rnd() * 0.7));
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.012);
      d.cb(0.02, 0.1, s.L - 0.6, RUST_D, x, y0 + 0.02, 0);                               // rotten sills
      for (let i = 0; i < 7; i++) d.cb(0.02, 0.05 + rnd() * 0.14, 0.06 + rnd() * 0.18, rust(), x, y0 + 0.04 + rnd() * (yb - y0) * 0.6, s.zr + 0.2 + rnd() * (s.L - 0.4));
      for (let i = 0; i < 2; i++) d.cb(0.024, 0.06, 0.08, 0x15181c, x * 1.002, y0 + 0.05, s.zr + 0.4 + rnd() * (s.L - 0.8));   // holes
      for (const a of s.arches) d.cext(archBandPts(a, 0.004, 0.065, 0.05), 0.022, RUST_D, x);   // rotten arch lips
    }
    // cracked windshield: white crack lines in a star
    const [za, ya, zb, yb2] = wsLine(s);
    const cz = za + (zb - za) * 0.45, cy = ya + (yb2 - ya) * 0.45, ang = Math.atan2(-(yb2 - ya), zb - za);
    for (let i = 0; i < 5; i++) {
      d.cb(0.018, 0.012, 0.18 + rnd() * 0.2, 0xf4f6f8, 0.18 + (rnd() - 0.5) * 0.05, cy + Math.cos(ang) * 0.025, cz + Math.sin(ang) * 0.025, ang, i * 0.7 + rnd() * 0.4, 0);
    }
    if (!s.open) {
      for (const sx of [-1, 1]) d.cb(0.02, 0.012, 0.3, 0xf4f6f8, sx * (cab.w / 2 + 0.025), (yb + cab.yt) / 2, (cab.f0 + cab.r0) / 2, 0.6, 0, 0);
    }
    return d.build();
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
const hazeMats = [   // heavy, light: a dull, dusty film
  new THREE.MeshLambertMaterial({ color: 0xc9c0ae, transparent: true, opacity: 0.62, depthWrite: false }),
  new THREE.MeshLambertMaterial({ color: 0xc9c0ae, transparent: true, opacity: 0.34, depthWrite: false }),
];
const streakMats = [   // light, mirror
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }),
];
const wetMats = [   // fresh, drying
  new THREE.MeshBasicMaterial({ color: 0xd6f1ff, transparent: true, opacity: 0.55, depthWrite: false }),
  new THREE.MeshBasicMaterial({ color: 0xd6f1ff, transparent: true, opacity: 0.25, depthWrite: false }),
];
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

// Paint sweep: while a new colour goes on, the old body and the new body are both drawn, each cut by the same plane
// across the car (world space, so the hood is cut right too, open or shut). A narrow wet band glints at the edge.
function clipMaterial(keepFront) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const plane = { value: new THREE.Vector4(0, 0, 1, 0) };
  const edge = { value: keepFront ? 1 : 0 };
  m.userData.plane = plane.value;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uClip = plane;
    sh.uniforms.uEdge = edge;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClipW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvClipW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClipW;\nuniform vec4 uClip;\nuniform float uEdge;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tfloat clipD = dot(uClip.xyz, vClipW) + uClip.w;\n\tif (clipD < 0.0) discard;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.25 + 0.08, uEdge * (1.0 - smoothstep(0.0, 0.09, clipD)));');
  };
  m.customProgramCacheKey = () => 'car-paint-clip';
  return m;
}

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

/** A look for one given type with a fitting colour: club cars get club paint, classics their period colour. */
export function lookOf(type, { color } = {}) {
  if (color != null) return { type, color, vip: false };
  if (VIP_CAR_TYPES[type]) return { type, color: VIP_COLORS[Math.floor(Math.random() * VIP_COLORS.length)], vip: false };
  if (CLASSIC_COLORS[type] != null) return { type, color: CLASSIC_COLORS[type], vip: false };
  return { type, color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], vip: false };
}

export function createCar(look = randomCarLook()) {
  look = { ...look };
  if (!SPECS[look.type]) look.type = 'sedan';
  if (look.vip) look.color = look.color ?? VIP_GOLD;
  if (typeof look.color !== 'number') look.color = CLASSIC_COLORS[look.type] ?? CAR_COLORS[0];
  const s = SPECS[look.type];

  const group = new THREE.Group();
  const tow = new THREE.Group();       // pivots about the rear axle when the front is lifted onto a hook
  group.add(tow);
  const chassis = new THREE.Group();
  tow.add(chassis);
  let variant = 'clean';
  const body = mesh(bodyGeo(look), litMat, { cast: true, receive: true });
  chassis.add(body);

  // hood on a hinge
  const hood = new THREE.Group();
  hood.position.set(0, s.yb, s.hz0);
  const hoodMesh = mesh(hoodGeo(look));
  hood.add(hoodMesh);
  chassis.add(hood);

  // wheels: pivot (position; sinks when flat) > hold > spin (the wheel, or just its rim when flat), plus the flat tyre,
  // the space-saver spare and the paint-booth cover when they are in use
  const hubCol = look.vip ? 0xffd54d : s.hub ?? CHROME;
  const wheels = [];
  for (const [sx, front] of [[-1, true], [1, true], [-1, false], [1, false]]) {
    const r = front ? s.rf : s.r, wr = front ? s.wrf : s.wr;
    const pivot = new THREE.Group();
    pivot.position.set(sx * (front ? s.wxf : s.wx), r, front ? s.ax : s.axR);
    const hold = new THREE.Group();
    const w = { pivot, hold, spin: null, sx, x: pivot.position.x, z: front ? s.ax : s.axR, r, wr, front, def: 0, target: 0,
      style: s.rim ?? 'std', worn: false, flatOn: false, flat: null, spare: null, mask: null };
    w.spin = mesh(wheelGeo(r, wr, hubCol, w.style));
    hold.add(w.spin);
    pivot.add(hold);
    tow.add(pivot);
    wheels.push(w);
  }
  /** Put the right geometry on a wheel for its style, wear and flatness. */
  function applyLook(w) {
    const hub = w.style === 'rust' ? 0x8a5a3c : hubCol, st = w.style === 'rust' ? 'std' : w.style;
    if (w.flatOn) {
      if (!w.flat || w.flat.st !== st) {
        if (w.flat) { w.hold.remove(w.flat.m); w.flat.g.dispose(); }
        const g = flatTyreGeo(w.r, w.wr, st).clone();   // its own copy: squashTyre rewrites it
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), w.r * 1.4);
        w.flat = { st, g, rest: g.attributes.position.array.slice(), m: mesh(g), d: -1, a: 0 };
        w.hold.add(w.flat.m);
      }
      w.spin.geometry = rimGeo(w.r, w.wr, hub, st);
    } else w.spin.geometry = wheelGeo(w.r, w.wr, hub, st, w.worn);
    if (w.flat) w.flat.m.visible = w.flatOn && w.spin.visible;
  }
  // Tyre problems: one bad wheel per 'tire' job, so a car with two tyre jobs has two. Each car has one story for
  // them: flat tyres (the rim sinks, the tyre squashes and bulges at the floor, the body settles onto it and it thumps
  // once per turn while driving; a flat is still drivable), flats where the owner already put the little space-saver
  // spare on the first one (yellow rim, sits lower), or tyres worn bald (no tread, steel belt showing, cracked).
  // The rear wheel on local -x goes first: it faces the camera both in the lane and on a lift.
  const TIRE_ORDER = [2, 0, 3, 1];
  const rollY = (s.y0 + 2 * s.r) / 2;   // the lean pivots halfway up the wheel wells: they swing least past the tyres
  let tyreStory = Math.random() < 0.5 ? 'worn' : Math.random() < 0.35 ? 'spare' : 'flat';
  function setSpare(w, on) {
    if (on && !w.spare) {
      w.spare = mesh(wheelGeo(+(w.r * SPARE_K).toFixed(3), +(w.wr * 0.62).toFixed(3), SPARE_RIM));
      w.hold.add(w.spare);
    }
    if (w.spare) w.spare.visible = on;
    w.spin.visible = !on;
    if (w.flat) w.flat.m.visible = w.flatOn && !on;
  }

  // ---- overlays: built lazily, then only toggled
  function overlay(pair, mat = litMat, cast = false) {
    const o = { c: null, h: null };
    if (pair.c) { o.c = mesh(pair.c, mat, { cast }); chassis.add(o.c); }
    if (pair.h) { o.h = mesh(pair.h, mat, { cast }); hood.add(o.h); }
    return o;
  }
  function showOv(o, on, mat) {
    if (!o) return;
    if (o.c) { o.c.visible = on; if (mat) o.c.material = mat; }
    if (o.h) { o.h.visible = on; if (mat) o.h.material = mat; }
  }
  function swapOv(o, pair) {   // same overlay meshes, another cached geometry (dirt / foam level)
    if (o.c && pair.c) o.c.geometry = pair.c;
    if (o.h && pair.h) o.h.geometry = pair.h;
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
      const bz = s.hz0 + (s.hz1 - s.hz0) * (s.batteryZ ?? 0.55), bx = s.batteryZ ? 0 : Math.min(0.26, s.hw / 2 - 0.17);
      const warn = new THREE.Mesh(warnGeo, warnOn);
      warn.position.set(bx, s.yb + 0.24, bz);
      o.add(warn);
      o.userData.warn = warn;
      const rod = mesh(propRodGeo(look.type), litMat, { cast: false });
      o.add(rod);
      o.userData.rod = rod;
      o.userData.bz = bz;
      o.userData.bx = bx;
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
      o = new THREE.Group(); // 'tire': handled by the wheels (applyTyres) + the lean
      group.add(o);
    }
    dmg[type] = o;
    return o;
  }

  const active = new Set();
  let hoodA = 0;
  let nTireJobs = 0, flatAll = false;   // flatAll: a wreck stands on four flat tyres

  function applyTyres() {
    for (let k = 0; k < TIRE_ORDER.length; k++) {
      const w = wheels[TIRE_ORDER[k]], on = k < nTireJobs && !flatAll;
      const worn = on && tyreStory === 'worn';
      if (worn !== w.worn) { w.worn = worn; applyLook(w); }
      if (k === 0 && tyreStory === 'spare' && !flatAll) { setSpare(w, on); w.target = 0; }
      else { if (w.spare) setSpare(w, false); w.target = (on && tyreStory !== 'worn') || flatAll ? 1 : 0; }
    }
  }
  /** Force how this car's tyre jobs look: 'flat' | 'spare' | 'worn' (random per car otherwise). */
  function setTyreStory(story) {
    if (!['flat', 'spare', 'worn'].includes(story)) return;
    tyreStory = story;
    applyTyres();
  }
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
    nTireJobs = 0;
    for (const ty of types) if (ty === 'tire') nTireJobs++;
    applyTyres();
  }

  // ---- shine (just repaired)
  let shineT = 0;
  const SHINE_TIME = 3.2;
  const shinePts = [];
  {
    const c = s.cab, roofY = s.top.y + 0.03;
    shinePts.push([c.w / 2, roofY, c.f1], [-c.w / 2, roofY, c.r1], [0.2, roofY, s.top.z],
      [s.W / 2, s.yb + 0.06, s.hz1], [-s.W / 2, s.yb + 0.06, (s.hz0 + s.hz1) / 2], [s.W / 2, s.yb, s.zr + 0.1],
      [-s.W / 2 - 0.02, s.y0 + 0.25, 0.2], [s.W / 2 + 0.02, s.y0 + 0.3, -0.4], [0, s.yb + 0.05, s.zf], [-0.3, s.yb + 0.03, s.zr]);
  }
  function ensureSparkles() {
    if (fx.sparkles.length) return;
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(sparkleGeo, glowMat);
      m.visible = false;
      chassis.add(m);
      fx.sparkles.push({ m, age: i / 6 - 0.6, p: shinePts[i % shinePts.length] });
    }
  }
  function setShine(on) {
    shineT = on ? SHINE_TIME : 0;
    if (on) ensureSparkles();
    if (!on) for (const sp of fx.sparkles) sp.m.visible = false;
  }

  // ================================================================ town states
  // ---- colour: setColor(hex, k) sweeps the new colour over the body from nose to tail; k = share already painted
  let paintK = 1, paintHex = look.color, sweep = null;   // sweep: { body, hood, oldMat, newMat }
  const _n = new THREE.Vector3(), _p = new THREE.Vector3();
  function commitColor(hex) {
    look.color = hex;
    if (variant !== 'clean') variant = 'clean';
    body.geometry = bodyGeo(look, variant);
    hoodMesh.geometry = hoodGeo(look, variant);
    showOv(patchOv, false);   // a full respray covers the primer patches of a project car
  }
  // primer patches / scratches are painted over too: while the sweep runs they are cut by the old-paint plane
  function clipPatches(mat) {
    if (patchOv) { if (patchOv.c) patchOv.c.material = mat; if (patchOv.h) patchOv.h.material = mat; }
    if (dmg.paint) { dmg.paint.children[0].material = mat; dmg.paint.userData.hood.material = mat; }
  }
  function endSweep() {
    if (!sweep) return;
    body.material = litMat; hoodMesh.material = litMat;
    clipPatches(litMat);
    sweep.body.visible = false; sweep.hood.visible = false;
  }
  function setColor(hex, k = 1) {
    if (typeof hex !== 'number') return;
    k = Math.max(0, Math.min(1, k));
    if (k >= 1) { endSweep(); paintK = 1; if (hex !== look.color || variant !== 'clean') commitColor(hex); paintHex = hex; return; }
    if (k <= 0 && !sweep?.body.visible) { paintHex = hex; paintK = 0; return; }
    if (!sweep) {
      sweep = { oldMat: clipMaterial(false), newMat: clipMaterial(true) };
      sweep.body = mesh(bodyGeo({ ...look, color: hex }), sweep.newMat, { cast: false, receive: true });
      sweep.hood = mesh(hoodGeo({ ...look, color: hex }), sweep.newMat, { cast: false });
      chassis.add(sweep.body);
      hood.add(sweep.hood);
    }
    if (hex !== paintHex || !sweep.body.visible) {
      sweep.body.geometry = bodyGeo({ ...look, color: hex });
      sweep.hood.geometry = hoodGeo({ ...look, color: hex });
    }
    paintHex = hex; paintK = k;
    sweep.body.visible = true; sweep.hood.visible = true;
    body.material = sweep.oldMat; hoodMesh.material = sweep.oldMat;
    clipPatches(sweep.oldMat);
    updateSweepPlane();
  }
  function updateSweepPlane() {
    if (!sweep || !sweep.body.visible) return;
    chassis.updateWorldMatrix(true, false);
    const zc = s.L / 2 + 0.06 - paintK * (s.L + 0.12);
    const e = chassis.matrixWorld.elements;
    _n.set(e[8], e[9], e[10]).normalize();             // the car's +z axis in world space
    _p.set(0, s.yb, zc).applyMatrix4(chassis.matrixWorld);
    const w = -_n.dot(_p);
    sweep.newMat.userData.plane.set(_n.x, _n.y, _n.z, w);       // keep the nose side
    sweep.oldMat.userData.plane.set(-_n.x, -_n.y, -_n.z, -w);   // keep the tail side
  }

  // ---- stripes
  let stripeOv = null, stripeHex = null;
  function setStripe(hex = null) {
    if (hex === stripeHex) return;
    stripeHex = hex;
    if (hex == null) { showOv(stripeOv, false); return; }
    const pair = stripeGeo(look.type, hex);
    if (!stripeOv) stripeOv = overlay(pair);
    else swapOv(stripeOv, pair);
    showOv(stripeOv, true);
  }

  // ---- masking
  let maskOv = null, masked = false;
  function setMasked(on) {
    on = !!on;
    if (on === masked) return;
    masked = on;
    if (on && !maskOv) maskOv = overlay(maskGeo(look.type));
    showOv(maskOv, on);
    for (const w of wheels) {
      if (on && !w.mask) { w.mask = mesh(wheelMaskGeo(w.r, w.wr), litMat, { cast: false }); w.hold.add(w.mask); }
      if (w.mask) w.mask.visible = on;
    }
  }

  // ---- dirt (0..1, three looks): opaque mud + a see-through dust film from level 2
  let dirtOv = null, dustOv = null, dirtLv = 0;
  function setDirt(v = 0) {
    const lv = v > 0.7 ? 3 : v > 0.38 ? 2 : v > 0.05 ? 1 : 0;
    if (lv === dirtLv) return;
    dirtLv = lv;
    showOv(dirtOv, false); showOv(dustOv, false);
    if (!lv) return;
    const pair = dirtGeo(look.type, lv);
    if (!dirtOv) dirtOv = overlay(pair); else swapOv(dirtOv, pair);
    showOv(dirtOv, true);
    if (lv >= 2) {
      const film = dustGeo(look.type, lv);
      if (!dustOv) dustOv = overlay(film, dustMats[lv - 2]); else swapOv(dustOv, film);
      showOv(dustOv, true, dustMats[lv - 2]);
    }
  }

  // ---- foam (0..1). Builds up while the soap arch sprays; rinsed off it runs down the body and is gone.
  let foamOv = null, foamTarget = 0, foamShow = 0, foamLv = 0, foamTri = false;
  function setFoam(v = 0, opts) {
    foamTarget = Math.max(0, Math.min(1, v));
    if (opts && typeof opts === 'object' && 'tri' in opts) foamTri = !!opts.tri;
  }
  function updateFoam(dt) {
    if (foamShow === foamTarget && (foamLv > 0) === (foamShow > 0.02)) return;
    const up = foamTarget > foamShow;
    foamShow += Math.sign(foamTarget - foamShow) * Math.min(Math.abs(foamTarget - foamShow), dt * (up ? 1.6 : 1.4));
    const lv = foamShow > 0.66 ? 3 : foamShow > 0.33 ? 2 : foamShow > 0.02 ? 1 : 0;
    const key = lv * 2 + (foamTri ? 1 : 0);
    if (lv && key !== foamLv) {
      const pair = foamGeo(look.type, lv, foamTri);
      if (!foamOv) foamOv = overlay(pair); else swapOv(foamOv, pair);
    }
    foamLv = lv ? key : 0;
    showOv(foamOv, lv > 0);
    if (foamOv && lv) {
      // rinsing: the suds sag and slide down (squash towards the ground); building up: they swell in
      const f = up ? 0.85 + 0.15 * Math.min(1, (foamShow * 3) % 1 + 0.4) : 0.55 + 0.45 * Math.min(1, foamShow * 1.6);
      if (foamOv.c) { foamOv.c.scale.set(1, f, 1); foamOv.c.position.y = s.sagY * (1 - f); }
      if (foamOv.h) foamOv.h.scale.set(1, f, 1);
    }
  }

  // ---- wet: sheen + drips for a few seconds, then dry
  let wetOv = null, wetT = 0, dripT = 0;
  const WET_TIME = 4.5, DRY_FAST = 0.6;
  function setWet(on) {
    if (on) {
      wetT = WET_TIME;
      if (!wetOv) wetOv = overlay(wetGeo(look.type), wetMats[0]);
      showOv(wetOv, true, wetMats[0]);
    } else if (wetT > DRY_FAST) wetT = DRY_FAST;   // blown dry: last drops, then nothing
  }
  const dripKey = {};

  // ---- gloss per side [front, right, back, left]: 0 dull .. 0.5 neutral .. 1 mirror
  const gloss = [0.5, 0.5, 0.5, 0.5];
  const glossOv = [null, null, null, null];   // { haze, streak, lv }
  let twinkleT = 0;
  const twinkle = [];
  function glossLevel(v) { return v < 0.18 ? 0 : v < 0.38 ? 1 : v < 0.68 ? 2 : v < 0.92 ? 3 : 4; }
  function setGloss(arr) {
    if (!arr) return;
    for (let i = 0; i < 4; i++) {
      const v = Number.isFinite(arr[i]) ? Math.max(0, Math.min(1, arr[i])) : 0.5;
      gloss[i] = v;
      const lv = glossLevel(v);
      let g = glossOv[i];
      if (!g) {
        if (lv === 2) continue;
        g = glossOv[i] = { haze: null, streak: null, lv: 2 };
      }
      if (g.lv === lv) continue;
      g.lv = lv;
      if (lv <= 1 && !g.haze) g.haze = overlay(hazeGeo(look.type, i), hazeMats[0]);
      if (lv >= 3 && !g.streak) g.streak = overlay(streakGeo(look.type, i), streakMats[0]);
      showOv(g.haze, lv <= 1, hazeMats[lv]);
      showOv(g.streak, lv >= 3, streakMats[lv - 3]);
    }
  }
  const sidePts = [
    [[0.3, s.yb + 0.1, s.hz1 - 0.1], [-0.2, s.top.y + 0.05, s.top.z + s.top.l / 4], [0, s.yb - 0.1, s.zf + 0.05]],
    [[s.W / 2 + 0.04, s.yb - 0.1, 0.4], [s.W / 2 + 0.04, s.y0 + 0.15, -0.5], [s.W / 2 + 0.04, s.yb - 0.15, s.zf - 0.5]],
    [[0.2, s.top.y + 0.05, s.top.z - s.top.l / 4], [-0.3, s.yb + 0.04, s.zr + 0.15], [0.2, s.yb - 0.12, s.zr - 0.05]],
    [[-s.W / 2 - 0.04, s.yb - 0.1, -0.4], [-s.W / 2 - 0.04, s.y0 + 0.15, 0.5], [-s.W / 2 - 0.04, s.yb - 0.15, s.zr + 0.5]],
  ];

  // ---- hazards
  let hazOv = null, hazard = false, hazT = 0;
  function setHazard(on) {
    hazard = !!on;
    if (hazard && !hazOv) { hazOv = mesh(hazardGeo(look.type), glowMat, { cast: false }); chassis.add(hazOv); }
    if (hazOv) hazOv.visible = false;
    hazT = 0;
  }

  // ---- towing: the front tyres sit in the tow truck's wheel-lift cradles, TOW_LIFT * k above the floor, the rear
  // tyres stay on the floor. The front axle keeps its place (local z = ax, the point gameplay hangs on the hitch); the
  // body pitches nose-up and the rear axle comes forward a little (the wheelbase is now on a slope).
  let towK = 0;
  const towSpan = s.ax - s.axR, towC = s.rf - s.r, towA = Math.hypot(towC, towSpan), towPhi = Math.atan2(towSpan, towC);
  function setTowed(k = 0) {
    k = Math.max(0, Math.min(1, k));
    if (k === towK) return;
    towK = k;
    const lift = TOW_LIFT * k;
    // pitch a with (rf - r) cos a - span sin a = (rf - r) + lift: front axle lift above the rear one
    const a = Math.acos(Math.min(1, (towC + lift) / towA)) - towPhi;
    const c = Math.cos(a), sn = Math.sin(a);
    tow.rotation.x = a;
    // front axle centre F = (0, rf, ax) lands on (0, rf + lift, ax): position = F' - R * F
    tow.position.set(0, s.rf + lift - (s.rf * c - s.ax * sn), s.ax - (s.rf * sn + s.ax * c));
  }

  // ---- restore stages (classics): 0 wreck, 1 runs but dull + patched, 2 painted, 3 show condition
  let restore = -1, wreckOv = null, patchOv = null, showStage = false;
  function setWheelStyle(style) {
    for (const w of wheels) { w.style = style; applyLook(w); }
  }
  function setRestore(stage = 3) {
    stage = Math.max(0, Math.min(3, Math.round(stage)));
    if (stage === restore) return;
    restore = stage;
    endSweep();
    const v = stage === 0 ? 'wreck' : stage === 1 ? 'patched' : 'clean';
    if (v !== variant) {
      variant = v;
      body.geometry = bodyGeo(look, variant);
      hoodMesh.geometry = hoodGeo(look, variant);
    }
    if (stage === 0 && !wreckOv) wreckOv = overlay(wreckGeo(look.type));
    showOv(wreckOv, stage === 0);
    if (stage === 1 && !patchOv) patchOv = overlay({ c: paintGeo(look.type), h: hoodPaintGeo(look.type) });
    showOv(patchOv, stage === 1);
    flatAll = stage === 0;
    applyTyres();
    setWheelStyle(stage === 0 ? 'rust' : stage === 3 ? (s.rim && s.rim !== 'std' ? s.rim : 'white') : (s.rim ?? 'std'));
    showStage = stage === 3;
    setGloss(stage === 0 ? [0, 0, 0, 0] : stage === 1 ? [0.25, 0.25, 0.25, 0.25] : stage === 2 ? [0.5, 0.5, 0.5, 0.5] : [1, 1, 1, 1]);
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
    const towed = towK > 0.02;
    if (Math.abs(sp) < 0.05) parkedT += dt;
    else {
      if (parkedT > PARKED && active.has('battery') && !towed) crank();   // a towed car's engine stays off
      parkedT = 0;
    }
    const parked = parkedT > PARKED;
    const mv = Math.min(1, Math.abs(sp) / 4);
    const roll = (sp * dt) / s.r;

    // tyres: a flat one squashes against the floor and its rim sinks, the spare sits lower. The body settles onto the
    // low corners as a rigid lid (the least-squares plane through the corner drops, lifted until no corner sinks
    // further than its own wheel) and rolls about the middle of the wheel wells' height (rollY), so every tyre keeps
    // its air gap in its arch.
    let thump = 0, n = 0, Sx = 0, Sz = 0, Sxx = 0, Sxz = 0, Szz = 0, Sh = 0, Shx = 0, Shz = 0;
    for (const w of wheels) {
      let h;   // how far this corner sits below normal
      const lifted = w.front && towed;
      const wroll = lifted ? 0 : (sp * dt) / w.r;   // lifted wheels hang still
      if (w.spare && w.spare.visible) {
        w.def = 0;
        if (w.flatOn) { w.flatOn = false; applyLook(w); }
        w.pivot.position.y = w.r * SPARE_K;
        w.spare.rotation.x += wroll / SPARE_K;
        h = w.r * (1 - SPARE_K);
      } else {
        w.def += (w.target - w.def) * Math.min(1, dt * (w.target ? 6 : 10));
        if (w.def < 0.002) w.def = 0;
        const d = lifted ? w.def * (1 - towK) : w.def;   // off the ground a flat tyre rounds out
        if ((d > 0) !== w.flatOn) { w.flatOn = d > 0; applyLook(w); }
        w.pivot.position.y = w.r * (1 - FLAT_DROP * d);
        w.spin.rotation.x += wroll;
        if (w.flatOn && (d !== w.flat.d || w.spin.rotation.x !== w.flat.a)) {
          squashTyre(w, d);
          w.flat.d = d;
          w.flat.a = w.spin.rotation.x;
        }
        h = w.r * FLAT_DROP * d;
        thump += d * Math.pow(Math.abs(Math.sin(w.spin.rotation.x)), 12);   // the flat bit comes round
      }
      w.h = lifted ? 0 : h;   // a wheel hanging in the tow cradle holds its corner up
      n++; Sx += w.x; Sz += w.z; Sxx += w.x * w.x; Sxz += w.x * w.z; Szz += w.z * w.z;
      Sh += w.h; Shx += w.h * w.x; Shz += w.h * w.z;
    }
    // the plane a + b x + c z through the corner drops
    let la = 0, lb = 0, lc = 0;
    if (Sh > 1e-5) {
      const det = n * (Sxx * Szz - Sxz * Sxz) - Sx * (Sx * Szz - Sxz * Sz) + Sz * (Sx * Sxz - Sxx * Sz);
      if (Math.abs(det) > 1e-6) {
        la = (Sh * (Sxx * Szz - Sxz * Sxz) - Sx * (Shx * Szz - Sxz * Shz) + Sz * (Shx * Sxz - Sxx * Shz)) / det;
        lb = (n * (Shx * Szz - Sxz * Shz) - Sh * (Sx * Szz - Sxz * Sz) + Sz * (Sx * Shz - Shx * Sz)) / det;
        lc = (n * (Sxx * Shz - Shx * Sxz) - Sx * (Sx * Shz - Shx * Sz) + Sh * (Sx * Sxz - Sxx * Sz)) / det;
      }
      let over = 0;   // springs give a little (LEAN_GIVE), never more than the air over a tyre allows
      for (const w of wheels) over = Math.max(over, la + lb * w.x + lc * w.z - w.h - LEAN_GIVE);
      la -= over;
    }
    let shake = 0;
    if (crankT > 0) { crankT = Math.max(0, crankT - dt); shake = crankT / CRANK; }
    const dead = (parked && active.has('battery')) || towed || restore === 0;   // engine off: no idle vibration
    chassis.rotation.z = -lb + Math.sin(t * 63) * 0.03 * shake;
    chassis.rotation.x = lc + Math.sin(t * 9) * 0.004 * mv;
    _roll.set(0, rollY, 0).applyEuler(chassis.rotation);   // turn about (0, rollY, 0), not the floor
    chassis.position.set(-_roll.x, rollY - _roll.y + Math.sin(t * 17) * 0.012 * mv + (dead ? 0 : Math.sin(t * 43) * 0.004) - la
      + Math.min(1, thump) * 0.015 * mv + Math.abs(Math.sin(t * 41)) * 0.02 * shake, -_roll.z);   // the flat bit kicks it up

    // dead battery: the hood pops up once the car stands still (and shuts before it drives: nobody drives blind)
    const hoodTarget = parked && active.has('battery') && !towed ? 1 : 0;   // nobody opens the hood on the hook
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
        if (parked ? hoodA < 0.6 : (z !== B.zaps[0] || mv < 0.05 || towed)) { z.t = 0.15; continue; }
        z.m.visible = true;
        z.t = 0.05 + Math.random() * 0.08;
        if (parked) z.m.position.set(B.bx + (Math.random() < 0.5 ? -0.08 : 0.08), s.yb + 0.22, B.bz + 0.06);
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
      const zc = s.smoke.z;
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
        p.m.position.set(p.ox * (0.4 + a) + Math.sin(a * 6 + p.rot) * 0.06, s.smoke.y + a * 1.5, zc + p.oz - a * 0.35);
        p.m.rotation.set(a * 2 + p.rot, p.rot + a * 3, 0);
      }
    }
    const g = group.position, yaw = group.rotation.y, cy = Math.cos(yaw), sy = Math.sin(yaw);
    if (active.has('oil') && group.parent) {
      // A drop every ~0.6 s while parked (they pile up into a puddle), one every ~0.7 m while driving (a trail).
      leakT -= dt;
      leakD -= Math.abs(sp) * dt;
      if (leakT <= 0 || leakD <= 0) {
        leakT = 0.5 + Math.random() * 0.25;
        leakD = 0.55 + Math.random() * 0.25;
        const lx = (Math.random() - 0.5) * 0.28, lz = s.sump + (Math.random() - 0.5) * 0.18;   // under the sump
        leakDrop(group.parent, g.x + lx * cy + lz * sy, g.y + s.y0 + towK * TOW_LIFT * 0.8, g.z - lx * sy + lz * cy, leakKey);
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

    // ---- town states
    if (sweep && sweep.body.visible) updateSweepPlane();
    if (foamOv || foamTarget > 0) updateFoam(dt);
    if (hazard && hazOv) { hazT += dt; hazOv.visible = hazT % 0.8 < 0.42; }
    if (wetT > 0) {
      wetT -= dt;
      showOv(wetOv, wetT > 0, wetT > WET_TIME * 0.45 ? wetMats[0] : wetMats[1]);
      // water runs off the sills and drips to the floor (world space: a moving car leaves its drips behind)
      dripT -= dt;
      if (wetT > 0 && dripT <= 0 && group.parent) {
        dripT = (wetT > WET_TIME * 0.5 ? 0.05 : 0.14) + Math.random() * 0.06;
        const side = Math.random() < 0.5 ? -1 : 1, edge = Math.random() < 0.75;
        // off the outside of the doors / bumpers (where it runs off the paint), so the damp spots peek out
        const lx = edge ? side * (s.W / 2 + 0.03) : (Math.random() - 0.5) * s.W * 0.8;
        const lz = edge ? s.zr + 0.15 + Math.random() * (s.L - 0.3) : (Math.random() < 0.5 ? s.L / 2 + 0.03 : -s.L / 2 - 0.03);
        waterDrop(group.parent, g.x + lx * cy + lz * sy, g.y + s.y0, g.z - lx * sy + lz * cy, dripKey);
      }
    }
    // mirror-polished sides: a glint now and then (show cars twinkle all over)
    let mirror = false;
    for (let i = 0; i < 4; i++) if (gloss[i] >= 0.92) { mirror = true; break; }
    if (mirror || twinkle.length) {
      twinkleT -= dt;
      if (mirror && twinkleT <= 0) {
        twinkleT = showStage ? 0.45 + Math.random() * 0.4 : 0.8 + Math.random() * 0.8;
        let side = Math.floor(Math.random() * 4);
        for (let n = 0; n < 4 && gloss[side] < 0.92; n++) side = (side + 1) % 4;
        let tw = twinkle.find((x) => x.age >= 1);
        if (!tw && twinkle.length < 2) {
          tw = { m: new THREE.Mesh(sparkleGeo, glowMat), age: 1, p: null };
          tw.m.visible = false;
          chassis.add(tw.m);
          twinkle.push(tw);
        }
        if (tw) { tw.age = 0; const pts = sidePts[side]; tw.p = pts[Math.floor(Math.random() * pts.length)]; }
      }
      for (const tw of twinkle) {
        if (tw.age >= 1) { tw.m.visible = false; continue; }
        tw.age += dt * 2.2;
        const sc = Math.sin(Math.min(1, tw.age) * Math.PI) * 0.65;
        tw.m.visible = sc > 0.02;
        tw.m.scale.setScalar(Math.max(0.001, sc));
        tw.m.position.set(tw.p[0], tw.p[1], tw.p[2]);
        tw.m.rotation.set(0, tw.age * 2, tw.age);
      }
    }
  }

  setProblems([]);
  update(0, 0);
  return {
    group, look, setProblems, setTyreStory, setShine, update,
    setColor, setStripe, setMasked, setDirt, setFoam, setWet, setGloss, setHazard, setTowed, setRestore,
    /** Axle positions etc. for gameplay (towing: the front axle sits over the truck's hitch). */
    // setTowed(k): the front axle centre stays at local (0, wheelRF + TOW_LIFT * k, ax); its tyres' bottoms at TOW_LIFT * k.
    dims: { ax: s.ax, axR: s.axR, length: s.L, width: s.W, wheelR: s.r, wheelRF: s.rf, tyreW: s.wr, tyreWF: s.wrf, towLift: TOW_LIFT },
  };
}
