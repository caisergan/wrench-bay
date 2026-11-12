// Vacant-plot dressing (polish): every PROPERTIES / SERVICES plot that is not built yet gets its own believable
// vacant-lot character that hints at what will be built there. Everything taller than a painted line lives in a
// per-plot group, so it can disappear the moment the plot is bought (the construction site replaces it):
//   setPlotCleared(id, cleared)  show / hide a plot's dressing (town.js calls it on every refresh)
//   plotSolids(id)               walk-blocking boxes of that dressing (town.js adds them while the plot is vacant)
// Rules kept here: pads, for-sale signs, the walkway to each pad, parking bays, rescue spots and golden wrenches
// stay clear (checked by clearZones() at build time); things near the south edge of a walkable area stay low or
// see-through (the camera looks north). The ferry terminal stands from the start, so the ferry plot has none.
import * as THREE from 'three';
import { PALETTE as P } from '../config.js';
import { TOWN, PROPERTIES, SERVICES, RESCUE } from '../config.town.js';
import { Builder, litMat, mesh, mulberry32 } from './voxel.js';
import { PI, CREAM, CORAL, NAVY, FONT, css, mix, pick, Y, flat, flatTop, quad, disc, surfaceMesh, LEAF, tireStack, pallet } from './env-kit.js';
import { canvasTex } from './props-town.js';

const dress = new Map();            // id -> { group, solids }

/** Show (false) or hide (true) a plot's vacant-lot dressing. Unknown ids are ignored. */
export function setPlotCleared(id, cleared) {
  const d = dress.get(id);
  if (d) d.group.visible = !cleared;
}
/** Walk-blocking boxes of a plot's dressing (fresh objects). */
export function plotSolids(id) {
  return (dress.get(id)?.solids || []).map((b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ }));
}
/** Ids that have a dressing. */
export function plotIds() { return [...dress.keys()]; }

// ------------------------------------------------------------------ colours
const RUST = 0xa0573a, RUST_D = 0x74402f, GALV = 0x9aa3aa, CONC = 0xb0aaa0, CONC_D = 0x948e84;
const BRICK = 0xb5654a, BRICK_D = 0x8f4d3b, WOOD_G = [0x9b8a74, 0x8c7b66, 0xa8977f], SKIP = 0xe0a52a;
const FADED_Y = mix(P.accent, 0xc4beb0, 0.5), FADED_W = mix(0xfbf6ea, 0xc4beb0, 0.45);
const RUBBLE = [0x9a958c, 0xb0aba1, BRICK, BRICK_D, 0x7c8087, 0xc9c2b4];

// ------------------------------------------------------------------ the per-plot kit
/** Builder's skip (open top, sloped ends), full of rubble. Local x = length. */
function skip(b, x, z, ry, rnd) {
  const cd = mix(SKIP, 0x000000, 0.3);
  b.push(x, 0, z, ry);
  b.box(2.3, 0.08, 1.3, 0x3a3f46, 0, 0, 0);
  b.box(2.0, 0.92, 1.5, SKIP, 0, 0.08, 0);
  for (const s of [-1, 1]) b.box(0.42, 0.95, 1.5, SKIP, s * 1.1, 0.1, 0, 0, 0, s * -0.38);
  b.box(2.75, 0.07, 1.58, cd, 0, 0.98, 0);
  for (const s of [-1, 1]) for (const t of [-1, 1]) b.box(0.16, 0.18, 0.08, cd, s * 0.72, 0.62, t * 0.79);
  b.box(2.3, 0.05, 1.3, 0x6d665c, 0, 0.86, 0);
  for (let i = 0; i < 16; i++) {
    const s = 0.16 + rnd() * 0.24;
    b.box(s * 1.5, s * 0.7, s, pick(rnd, RUBBLE), (rnd() - 0.5) * 2.1, 0.86 + rnd() * 0.16, (rnd() - 0.5) * 1.1, rnd() * 0.5, rnd() * 3, rnd() * 0.5);
  }
  b.pop();
}
/** Rusty flatbed trailer, drawbar resting on a block. Local x = length (4.0 + drawbar). */
function trailer(b, x, z, ry, rnd, load = 'none') {
  b.push(x, 0, z, ry);
  for (const ax of [-0.36, 0.36]) for (const s of [-1, 1]) {
    b.cyl(0.29, 0.29, 0.2, P.rubber, ax, 0.19, s * 0.98, 8, PI / 2);
    b.cyl(0.15, 0.15, 0.21, RUST_D, ax, 0.185, s * 0.98, 8, PI / 2);
  }
  for (const s of [-1, 1]) b.box(4.0, 0.14, 0.12, RUST_D, 0, 0.5, s * 0.7);
  for (const cx of [-1.7, -0.6, 0.6, 1.7]) b.box(0.1, 0.1, 1.5, RUST_D, cx, 0.52, 0);
  for (let k = 0; k < 5; k++) if (k !== 3 || load !== 'none') b.box(3.9, 0.05, 0.33, pick(rnd, WOOD_G), 0, 0.64, -0.72 + k * 0.36);
  for (const s of [-1, 1]) { b.box(3.9, 0.16, 0.05, RUST, 0, 0.69, s * 0.9); b.box(0.05, 0.16, 1.85, RUST, s * 1.95, 0.69, 0); }
  for (const s of [-1, 1]) b.box(1.35, 0.1, 0.1, RUST_D, 2.55, 0.42, s * 0.28, 0, -s * 0.36);
  b.box(0.28, 0.14, 0.16, RUST_D, 3.2, 0.36, 0);
  b.box(0.32, 0.36, 0.32, CONC, 3.2, 0, 0);
  b.box(0.4, 0.04, 0.06, 0xd04a3a, -2.0, 0.55, 0.62); b.box(0.4, 0.04, 0.06, 0xd04a3a, -2.0, 0.55, -0.62);
  if (load === 'tyres') for (let i = 0; i < 7; i++) b.cyl(0.32, 0.32, 0.2, i % 2 ? 0x2b2f36 : 0x363c45, -1.4 + (i % 4) * 0.9, 0.67 + Math.floor(i / 4) * 0.2, (rnd() - 0.5) * 0.4, 8);
  b.pop();
}
/** Heap of broken concrete and brick with a little rebar. */
function rubble(b, x, z, r, rnd) {
  b.cyl(r * 0.5, r, r * 0.42, 0x9d968b, x, 0, z, 9);
  for (let i = 0; i < 30; i++) {
    const a = rnd() * PI * 2, d = rnd() * r * 0.95, s = 0.12 + rnd() * 0.3;
    const h = Math.max(0, (1 - d / r) * r * 0.42 - s * 0.35);
    b.box(s * 1.4, s * 0.6, s, pick(rnd, RUBBLE), x + Math.cos(a) * d, h, z + Math.sin(a) * d * 0.85, rnd() * 0.6, rnd() * 3, rnd() * 0.6);
  }
  for (let i = 0; i < 3; i++) b.box(0.025, 0.9, 0.025, RUST, x + (rnd() - 0.5) * r * 0.8, r * 0.2, z + (rnd() - 0.5) * r * 0.6, rnd() - 0.5, 0, rnd() - 0.5);
}
/** Mound of earth. */
function soil(b, x, z, r, rnd, cols = [0x8a6a4a, 0x9a7a56, 0x7a5a3e, 0xa58462, 0x9d968b]) {
  b.cyl(r * 0.45, r, r * 0.5, cols[0], x, 0, z, 10);
  b.cyl(r * 0.2, r * 0.5, r * 0.22, cols[1], x + r * 0.1, r * 0.48, z, 8);
  for (let i = 0; i < 10; i++) { const a = rnd() * PI * 2, d = r * (0.3 + rnd() * 0.6); b.box(0.16, 0.1, 0.14, pick(rnd, cols.slice(2)), x + Math.cos(a) * d, (1 - d / r) * r * 0.5, z + Math.sin(a) * d, 0, rnd() * 3); }
}
/** Concrete foundation footing strip from (x0,z0) to (x1,z1) (axis aligned). */
function footing(b, x0, z0, x1, z1, w = 0.34, h = 0.14) {
  const len = Math.abs(x1 - x0) + Math.abs(z1 - z0) + w;
  const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (along) { b.box(len, h, w, CONC, cx, 0, cz); b.box(len, 0.012, 0.04, CONC_D, cx, h, cz); }
  else { b.box(w, h, len, CONC, cx, 0, cz); b.box(0.04, 0.012, len, CONC_D, cx, h, cz); }
}
/** Low broken brick wall along x or z, ragged top. */
function brickStub(b, x0, z0, x1, z1, h, rnd) {
  const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = along ? x1 - x0 : z1 - z0, n = Math.max(2, Math.round(Math.abs(len) / 0.45));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, hh = h * (0.45 + 0.55 * Math.abs(Math.sin(i * 1.7 + rnd()))), c = rnd() < 0.2 ? BRICK_D : BRICK;
    const px = along ? x0 + len * t : x0, pz = along ? z0 : z0 + len * t, seg = Math.abs(len) / n + 0.01;
    b.box(along ? seg : 0.24, hh, along ? 0.24 : seg, c, px, 0, pz);
    b.box(along ? seg * 0.9 : 0.26, 0.012, along ? 0.26 : seg * 0.9, 0xc9b9a4, px, hh * 0.5, pz);
  }
}
/** Checker tiles left of a demolished floor: some missing, ragged edges. */
function tiles(F, x0, z0, x1, z1, a, c, rnd, s = 0.32) {
  for (let x = x0; x < x1 - s * 0.5; x += s) for (let z = z0; z < z1 - s * 0.5; z += s) {
    const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z) / 1.2;
    if (rnd() < 0.18 + Math.max(0, 0.6 - edge)) continue;
    const k = (Math.round(x / s) + Math.round(z / s)) & 1;
    quad(F, s - 0.03, s - 0.03, mix(k ? a : c, 0xc9c2b4, rnd() * 0.25), x + s / 2, Y.lot + 0.007, z + s / 2);
  }
}
/** Faded painted rectangle outline (old parking / fitting bays); open: side left unpainted ('s' / 'n' / ''). */
function fadedBox(F, x0, z0, x1, z1, col, open = 's', w = 0.1) {
  const y = Y.lot + 0.006;
  if (open !== 'n') flatTop(F, x0, x1, z0, z0 + w, y, col);
  if (open !== 's') flatTop(F, x0, x1, z1 - w, z1, y, col);
  flatTop(F, x0, x0 + w, z0, z1, y, col);
  flatTop(F, x1 - w, x1, z0, z1, y, col);
}
/** Old oil stain (flat, irregular). */
function oil(F, x, z, r, rnd, col = 0x9c978d) {
  disc(F, r, col, x, Y.lot + 0.006, z, 10);
  disc(F, r * 0.6, mix(col, 0x000000, 0.12), x + r * 0.25 * (rnd() - 0.5), Y.lot + 0.0075, z + r * 0.2, 8);
}
/** One slab of the world-aligned yard grid (2 x 2.667 m) that was broken out and patched with asphalt. */
function slabPatch(F, i, j, rnd) {
  const x0 = i * 2, x1 = x0 + 2, z0 = j * 16 / 6, z1 = z0 + 16 / 6, y = Y.lot + 0.004;
  flatTop(F, x0 + 0.02, x1 - 0.02, z0 + 0.02, z1 - 0.02, y + 0.002, rnd() < 0.5 ? 0x6e717a : 0x7d7f86);
  for (let k = 0; k < 6; k++) quad(F, 0.05, 0.05, 0x5c5f66, x0 + 0.2 + rnd() * 1.6, y + 0.0035, z0 + 0.2 + rnd() * 2.2);
}
/** Grass tuft (3-4 blades). */
function tuft(F, x, z, s, rnd) {
  const c = pick(rnd, [0x5f9b55, 0x77b061, 0x4f8a4c, 0x8fb86a]);
  for (let i = 0; i < 3; i++) F.box(0.05 * s, (0.16 + rnd() * 0.16) * s, 0.05 * s, i % 2 ? c : mix(c, 0xffffff, 0.15), x + (rnd() - 0.5) * 0.18 * s, Y.lot, z + (rnd() - 0.5) * 0.18 * s, (rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.5);
}
/** Clump of wildflowers on stems. */
function flowers(F, x, z, rnd) {
  const col = pick(rnd, [0xfbf6ea, P.accent, CORAL, 0xb9a3e3, 0xf2a0c4]);
  for (let i = 0; i < 3; i++) {
    const px = x + (rnd() - 0.5) * 0.4, pz = z + (rnd() - 0.5) * 0.3, h = 0.18 + rnd() * 0.16;
    F.box(0.025, h, 0.025, 0x4f8a4c, px, Y.lot, pz);
    F.box(0.08, 0.05, 0.08, col, px, Y.lot + h, pz, 0, rnd());
  }
}
/** Bramble / scrub clump. */
function bramble(b, x, z, s, rnd) {
  for (let i = 0; i < 5; i++) b.box((0.5 + rnd() * 0.4) * s, (0.35 + rnd() * 0.35) * s, (0.45 + rnd() * 0.3) * s, pick(rnd, [0x2f7f5a, 0x3f8f52, 0x4c8a48]), x + (rnd() - 0.5) * 0.9 * s, 0, z + (rnd() - 0.5) * 0.6 * s, 0, rnd() * 3);
  for (let i = 0; i < 5; i++) b.box(0.06, 0.06, 0.06, pick(rnd, [0x5b2a4a, 0x8a2e3b]), x + (rnd() - 0.5) * 0.9 * s, (0.35 + rnd() * 0.3) * s, z + 0.25 * s);
}
/** Young tree on a stake with a tie (planted, a few years old). */
function sapling(b, x, z, s, rnd) {
  const c = pick(rnd, LEAF);
  b.box(0.05, 1.5 * s, 0.05, 0xc2a27a, x - 0.12, 0, z + 0.04);
  b.box(0.07, 1.6 * s, 0.07, P.woodDark, x, 0, z);
  b.box(0.16, 0.04, 0.05, 0x3d3d3d, x - 0.06, 1.0 * s, z + 0.02);
  b.box(0.9 * s, 0.7 * s, 0.85 * s, c, x, 1.35 * s, z, 0, rnd());
  b.box(0.6 * s, 0.5 * s, 0.6 * s, mix(c, 0xffffff, 0.15), x + 0.05, 1.9 * s, z, 0, rnd());
}
/** Self-seeded scrubby tree (birch / buddleia) for neglected corners. */
function scrubTree(b, x, z, s, rnd) {
  b.box(0.12 * s, 1.3 * s, 0.12 * s, 0xe8e4da, x, 0, z, 0, 0, 0.08);
  b.box(0.05, 0.05, 0.13, 0x3a3a3a, x, 0.5 * s, z + 0.03);
  const c = pick(rnd, [0x6ac48b, 0x56b97a, 0x8cc77a]);
  b.box(1.1 * s, 0.9 * s, 1.0 * s, c, x + 0.1, 1.1 * s, z, 0, rnd());
  b.box(0.7 * s, 0.6 * s, 0.7 * s, mix(c, 0xffffff, 0.18), x - 0.15 * s, 1.8 * s, z, 0, rnd());
}
/** Stack of loose tyres lying in a heap. */
function tyreHeap(b, x, z, rnd, n = 7) {
  for (let i = 0; i < n; i++) b.cyl(0.34, 0.34, 0.2, i % 2 ? 0x2b2f36 : 0x363c45, x + (rnd() - 0.5) * 0.9, (i % 3) * 0.12, z + (rnd() - 0.5) * 0.7, 8, (rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5);
}
/** Upright stack of n tyres (8-sided: cheap). */
function tyres(b, x, z, n, rnd) {
  for (let i = 0; i < n; i++) b.cyl(0.36, 0.36, 0.17, i % 2 ? 0x2b2f36 : 0x363c45, x + (rnd() - 0.5) * 0.05, i * 0.17, z + (rnd() - 0.5) * 0.05, 8);
  b.cyl(0.19, 0.19, 0.01, P.steel, x, n * 0.17, z, 8);
}
/** Stack of n pallets: the top one detailed, the ones below as two blocks (only their sides show). */
function palletStack(b, x, z, ry, n = 1) {
  b.push(x, 0, z, ry);
  for (let i = 0; i < n - 1; i++) { b.box(1.0, 0.08, 1.0, P.woodDark, 0, i * 0.15, 0); b.box(1.1, 0.07, 1.0, P.wood, 0, i * 0.15 + 0.08, 0); }
  b.pop();
  pallet(b, x, z, ry, 1, (n - 1) * 0.15);
}
/** Rusty oil drum, upright or lying. */
function drum(b, x, z, c, lying = false) {
  if (lying) { b.cyl(0.3, 0.3, 0.86, c, x, 0, z, 8, 0, 0, PI / 2); return; }
  b.cyl(0.3, 0.3, 0.86, c, x, 0, z, 8);
  b.cyl(0.315, 0.315, 0.05, mix(c, 0x000000, 0.28), x, 0.22, z, 8);
  b.cyl(0.315, 0.315, 0.05, mix(c, 0x000000, 0.28), x, 0.58, z, 8);
  b.cyl(0.22, 0.22, 0.02, RUST_D, x, 0.86, z, 8);
}
/** Old engine block on a pallet. */
function engineBlock(b, x, z, ry) {
  pallet(b, x, z, ry, 1);
  b.push(x, 0.12, z, ry);
  b.box(0.75, 0.42, 0.5, 0x5c6168, 0, 0, 0);
  b.box(0.7, 0.05, 0.45, RUST, 0, 0.42, 0);
  for (let i = 0; i < 4; i++) b.cyl(0.07, 0.07, 0.012, 0x2b2f36, -0.27 + i * 0.18, 0.47, 0, 6);
  b.box(0.2, 0.25, 0.3, 0x4a4f56, 0.45, 0.05, 0);
  b.pop();
}
/** Blue tarp pulled over a heap, roped down. */
function tarpHeap(b, x, z, w, d) {
  b.box(w, 0.55, d, 0x3a78b8, x, 0, z);
  b.box(w * 0.7, 0.25, d * 0.6, 0x4686c6, x - w * 0.08, 0.5, z + d * 0.05, 0, 0.2);
  for (const t of [-0.3, 0.3]) b.box(w + 0.04, 0.03, 0.03, 0xd8c79a, x, 0.56, z + t * d);
}
/** Pallet with a shrink-wrapped cube of bricks. */
function brickPallet(b, x, z, ry) {
  pallet(b, x, z, ry, 1);
  b.push(x, 0.12, z, ry);
  b.box(1.0, 0.75, 0.9, BRICK, 0, 0, 0);
  for (let i = 1; i < 5; i++) b.box(1.01, 0.012, 0.91, 0xc9b9a4, 0, i * 0.15, 0);
  for (const s of [-0.25, 0.25]) b.box(1.03, 0.77, 0.04, 0xeceae4, 0, 0, s);
  b.pop();
}
/** Stack of steel I-beams on timber bearers (local x = length). */
function beams(b, x, z, ry, n = 3, len = 4.5) {
  b.push(x, 0, z, ry);
  for (const s of [-1.6, 0, 1.6]) b.box(0.12, 0.12, 1.2, P.woodDark, s, 0, 0);
  for (let i = 0; i < n; i++) {
    const zz = -0.4 + i * 0.4, y = 0.12 + (i === n - 1 ? 0.24 : 0);
    b.box(len, 0.03, 0.22, 0x4f5a64, 0, y, zz); b.box(len, 0.18, 0.03, 0x4f5a64, 0, y + 0.03, zz); b.box(len, 0.03, 0.22, 0x4f5a64, 0, y + 0.21, zz);
  }
  b.pop();
}
/** Concrete kerb stones stacked on a pallet. */
function kerbStack(b, x, z, ry) {
  pallet(b, x, z, ry, 1);
  b.push(x, 0.12, z, ry);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) b.box(1.0, 0.22, 0.14, mix(CONC, 0xffffff, ((r + c) % 2) * 0.08), 0, r * 0.22, -0.3 + c * 0.2);
  b.pop();
}
/** Portable site office cabin facing +z (south). */
function siteCabin(b, x, z) {
  const w = 3.2, d = 2.3, h = 2.3, wall = 0xc9d3d9;
  for (const s of [-1, 1]) b.box(0.3, 0.25, d - 0.2, CONC, x + s * (w / 2 - 0.4), 0, z);
  b.box(w, h, d, wall, x, 0.25, z);
  for (let i = 0; i < 9; i++) b.box(0.05, h - 0.1, 0.03, mix(wall, 0x000000, 0.12), x - w / 2 + 0.2 + i * 0.35, 0.3, z + d / 2 + 0.01);
  b.box(w + 0.1, 0.1, d + 0.1, 0x8f9aa3, x, 0.25 + h, z);
  b.box(1.1, 0.7, 0.05, 0x2f4858, x - 0.55, 1.3, z + d / 2 + 0.02);
  b.box(1.16, 0.05, 0.06, CREAM, x - 0.55, 1.98, z + d / 2 + 0.03);
  b.box(0.8, 1.8, 0.05, 0x3c6e9e, x + 0.9, 0.3, z + d / 2 + 0.02);
  b.box(0.9, 0.08, 0.5, 0x6b747c, x + 0.9, 0.18, z + d / 2 + 0.28);
  b.box(0.9, 0.08, 0.3, 0x6b747c, x + 0.9, 0.0, z + d / 2 + 0.55);
}
/** Portable toilet facing +z. */
function portaloo(b, x, z) {
  b.box(1.1, 2.1, 1.1, 0x2f6fb5, x, 0, z);
  b.box(1.16, 0.12, 1.16, 0xeceae4, x, 2.1, z);
  b.box(0.75, 1.75, 0.04, 0x2a5f9c, x, 0.12, z + 0.57);
  b.box(0.3, 0.06, 0.05, 0xd04a3a, x + 0.2, 1.0, z + 0.6);
}
/** Survey stakes at the corners of a rect with orange tape between them. */
function staked(b, F, x0, z0, x1, z1) {
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (const [x, z] of corners) { b.box(0.06, 0.62, 0.06, 0xc2a27a, x, 0, z); b.box(0.07, 0.08, 0.07, 0xf2813a, x, 0.62, z); }
  const y = 0.5, t = 0.02;
  b.box(x1 - x0, 0.04, t, 0xf2813a, (x0 + x1) / 2, y, z0); b.box(x1 - x0, 0.04, t, 0xf2813a, (x0 + x1) / 2, y, z1);
  b.box(t, 0.04, z1 - z0, 0xf2813a, x0, y, (z0 + z1) / 2); b.box(t, 0.04, z1 - z0, 0xf2813a, x1, y, (z0 + z1) / 2);
  for (const [x, z] of corners) quad(F, 0.3, 0.3, 0xe85d8a, x, Y.lot + 0.006, z);   // marker paint at each peg
}
/** Capped fuel pump island (the pumps are gone): concrete kerb island, pipe stubs, hazard ends, guard posts. */
function pumpIsland(b, x, z0, z1) {
  const len = z1 - z0, cz = (z0 + z1) / 2;
  b.box(0.95, 0.16, len, CONC, x, 0, cz);
  for (const e of [z0, z1]) for (let i = 0; i < 4; i++) b.box(0.24, 0.012, 0.16, i % 2 ? 0x2b2f36 : FADED_Y, x - 0.36 + i * 0.24, 0.16, e + (e === z0 ? 0.1 : -0.1));
  for (const t of [-0.28, 0, 0.28]) { b.cyl(0.07, 0.07, 0.12, 0x4a4f56, x, 0.16, cz + t * len, 8); b.cyl(0.09, 0.09, 0.03, RUST, x, 0.28, cz + t * len, 8); }
  for (const e of [z0 - 0.25, z1 + 0.25]) { b.cyl(0.07, 0.07, 0.75, mix(P.accent, RUST, 0.35), x, 0, e, 8); b.cyl(0.075, 0.075, 0.1, 0x2b2f36, x, 0.5, e, 8); }
}
/** Bolted base plate where a canopy column used to stand. */
function columnPlate(F, b, x, z) {
  F.box(0.5, 0.02, 0.5, 0x5c6168, x, Y.lot, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.025, 0.025, 0.07, RUST_D, x + sx * 0.18, Y.lot + 0.02, z + sz * 0.18, 6);
  b.box(0.22, 0.06, 0.22, RUST, x, Y.lot + 0.02, z);
}
/** Lamp post of an old car park (lamp long dead). */
function deadLamp(b, x, z) {
  b.cyl(0.07, 0.09, 4.0, 0x6f6a62, x, 0, z, 8);
  b.box(0.9, 0.08, 0.12, 0x6f6a62, x + 0.4, 3.95, z);
  b.box(0.36, 0.12, 0.22, 0x555b62, x + 0.75, 3.84, z);
}
/** Concrete wheel stop. */
function wheelStop(b, x, z, ry = 0) { b.box(1.5, 0.12, 0.2, mix(CONC, 0xffffff, 0.1), x, Y.lot, z, 0, ry); }

// ------------------------------------------------------------------ fences and boards (need their own materials)
let chainMat = null;
function chainMaterial() {
  if (chainMat) return chainMat;
  const t = canvasTex('plotChainlink', 64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(196,204,210,1)'; g.lineWidth = 3;
    g.beginPath();
    for (let i = -2; i < 6; i++) { g.moveTo(i * 16, 0); g.lineTo(i * 16 + 64, 64); g.moveTo(i * 16 + 64, 0); g.lineTo(i * 16, 64); }
    g.stroke();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  chainMat = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide });
  return chainMat;
}
/** Collects chain-link quads of one plot into one geometry. */
class Mesh2 {
  constructor() { this.pos = []; this.uv = []; this.nor = []; this.idx = []; }
  quad(x0, z0, x1, z1, y0, y1, cell = 0.5) {
    const k = this.pos.length / 3, len = Math.hypot(x1 - x0, z1 - z0), nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
    this.pos.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0);
    this.uv.push(0, 0, len / cell, 0, len / cell, (y1 - y0) / cell, 0, (y1 - y0) / cell);
    for (let i = 0; i < 4; i++) this.nor.push(nx, 0, nz);
    this.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  build(mat) {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = true;
    return m;
  }
}
/**
 * Chain-link fence along a straight run (posts every ~2.5 m, top rail, mesh). gaps: [a, b] fractions of the run left
 * open (gateways). Adds solids along the closed parts.
 */
function chainFence(ctx, x0, z0, x1, z1, h = 1.2, gaps = []) {
  const { b, links, sol } = ctx;
  const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  const parts = [];
  let s = 0;
  for (const [ga, gb] of [...gaps].sort((p, q) => p[0] - q[0])) { if (ga > s) parts.push([s, ga]); s = gb; }
  if (s < len) parts.push([s, len]);
  for (const [a, c] of parts) {
    const ax = x0 + ux * a, az = z0 + uz * a, cx = x0 + ux * c, cz = z0 + uz * c;
    const n = Math.max(1, Math.round((c - a) / 3.0));
    for (let i = 0; i <= n; i++) b.box(0.07, h + 0.05, 0.07, GALV, ax + (cx - ax) * i / n, 0, az + (cz - az) * i / n);
    const mx = (ax + cx) / 2, mz = (az + cz) / 2, ry = Math.atan2(-(cz - az), cx - ax);
    b.box(c - a, 0.04, 0.04, GALV, mx, h - 0.02, mz, 0, ry);
    links.quad(ax, az, cx, cz, 0.04, h - 0.02);
    sol.push({ minX: Math.min(ax, cx) - 0.08, maxX: Math.max(ax, cx) + 0.08, minZ: Math.min(az, cz) - 0.08, maxZ: Math.max(az, cz) + 0.08 });
  }
}
/** Low timber post-and-rail fence (see-through), with gaps like chainFence. */
function railFence(ctx, x0, z0, x1, z1, gaps = []) {
  const { b, sol } = ctx, h = 0.8, wood = 0x9b7a56;
  const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  const parts = [];
  let s = 0;
  for (const [ga, gb] of [...gaps].sort((p, q) => p[0] - q[0])) { if (ga > s) parts.push([s, ga]); s = gb; }
  if (s < len) parts.push([s, len]);
  for (const [a, c] of parts) {
    const ax = x0 + ux * a, az = z0 + uz * a, cx = x0 + ux * c, cz = z0 + uz * c;
    const n = Math.max(1, Math.round((c - a) / 2.0));
    for (let i = 0; i <= n; i++) b.box(0.11, h, 0.11, mix(wood, 0x000000, 0.12), ax + (cx - ax) * i / n, 0, az + (cz - az) * i / n);
    const mx = (ax + cx) / 2, mz = (az + cz) / 2, ry = Math.atan2(-(cz - az), cx - ax);
    for (const y of [0.32, 0.66]) b.box(c - a, 0.08, 0.05, wood, mx, y, mz, 0, ry);
    sol.push({ minX: Math.min(ax, cx) - 0.07, maxX: Math.max(ax, cx) + 0.07, minZ: Math.min(az, cz) - 0.07, maxZ: Math.max(az, cz) + 0.07 });
  }
}
/** Weathered "Coming soon" board on two posts facing south (+z). */
function board(ctx, x, z, title, sub) {
  const { b, group } = ctx, W = 2.4, H = 1.2, y0 = 0.85;
  for (const s of [-1, 1]) b.box(0.12, y0 + H + 0.08, 0.12, 0x7a5c40, x + s * (W / 2 - 0.3), 0, z - 0.1);
  b.box(W + 0.1, H + 0.1, 0.05, 0x6d5338, x, y0 - 0.05, z - 0.04);
  const tex = canvasTex('comingSoon|' + title, 512, 256, (g, w, h) => {
    const rnd = mulberry32(title.length * 977 + 13);
    g.fillStyle = '#efe5cf'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 9; k++) {                      // weather stains
      const gx = rnd() * w, gy = rnd() * h, r = 30 + rnd() * 70, gr = g.createRadialGradient(gx, gy, 0, gx, gy, r);
      gr.addColorStop(0, 'rgba(150,130,96,0.16)'); gr.addColorStop(1, 'rgba(150,130,96,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    g.fillStyle = css(CORAL); g.fillRect(0, 0, w, 66);
    g.fillStyle = '#fbf6ea'; g.font = `700 44px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('COMING SOON', w / 2, 36);
    g.fillStyle = css(NAVY);
    let fs = 64; g.font = `700 ${fs}px ${FONT}`;
    while (g.measureText(title).width > w - 40 && fs > 30) { fs -= 2; g.font = `700 ${fs}px ${FONT}`; }
    g.fillText(title, w / 2, 128);
    g.fillStyle = 'rgba(47,72,88,0.8)'; g.font = `500 30px ${FONT}`; g.fillText(sub, w / 2, 196);
    g.strokeStyle = css(NAVY); g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    for (let k = 0; k < 4; k++) {                      // rust runs from the fixings
      const rx = k < 2 ? 22 + k * (w - 44) : 22 + (k - 2) * (w - 44), ry = k < 2 ? 18 : h - 18;
      g.fillStyle = 'rgba(140,80,40,0.5)'; g.fillRect(rx - 3, ry - 3, 6, 6);
      g.fillStyle = 'rgba(140,80,40,0.18)'; g.fillRect(rx - 1, ry, 2, 20 + rnd() * 30);
    }
    g.fillStyle = 'rgba(239,229,207,1)'; g.beginPath(); g.moveTo(w, h); g.lineTo(w - 46, h); g.lineTo(w, h - 30); g.fill();
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: tex }));
  face.position.set(x, y0 + H / 2, z);
  face.castShadow = false;
  group.add(face);
}

// ------------------------------------------------------------------ keep-clear zones
/** Rects nothing solid or tall may cover: pads (+ walkway to the street), sale signs, bays, rescue spots, wrenches. */
function clearZones() {
  const z = [];
  const r = (x, zz, hw, hd) => z.push({ minX: x - hw, maxX: x + hw, minZ: zz - hd, maxZ: zz + hd });
  for (const id in PROPERTIES) {
    const p = PROPERTIES[id];
    r(p.pad.x, p.pad.z, 1.2, 1.2);
    if (p.upgradePad) r(p.upgradePad.x, p.upgradePad.z, 1.2, 1.2);
    if (id === 'tow') r((p.plot.minX + p.plot.maxX) / 2, p.plot.maxZ - 0.9, 0.7, 0.7);
    else r(p.pad.x + 1.35, p.pad.z - 0.95, 0.7, 0.7);
    // the walk from the pad to the street in front of the plot (south for the harbor plots, north edge on Main St)
    const toZ = p.plot.maxZ;
    z.push({ minX: p.pad.x - 0.9, maxX: p.pad.x + 0.9, minZ: Math.min(p.pad.z, toZ), maxZ: Math.max(p.pad.z, toZ) });
  }
  for (const id in SERVICES) { const s = SERVICES[id]; r(s.pad.x, s.pad.z, 1.2, 1.2); if (s.managerPad) r(s.managerPad.x, s.managerPad.z, 1.2, 1.2); }
  for (const p of TOWN.parking) { const along = Math.abs(Math.sin(p.yaw)) > 0.5; r(p.x, p.z, along ? 2.1 : 1.3, along ? 1.3 : 2.1); }
  for (const s of RESCUE.spots) r(s.x, s.z, 1.8, 1.8);
  for (const w of TOWN.wrenches) r(w.x, w.z, 0.9, 0.9);
  return z;
}
const hit = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

// ------------------------------------------------------------------ the plots
/**
 * One plot = one group: S (lit, casts shadows), F (flat bits, no shadow), chain-link mesh, board faces, ground
 * overlays. `fill(ctx)` places the things; boxes it pushes to ctx.sol block walking while the plot is vacant.
 */
function plot(root, id, fill, seed) {
  const group = new THREE.Group();
  group.name = 'plot:' + id;
  const ctx = { b: new Builder(), F: new Builder(), links: new Mesh2(), sol: [], group, rnd: mulberry32(seed) };
  fill(ctx);
  if (ctx.b.geos.length) group.add(mesh(ctx.b.build(), litMat, { cast: true, receive: true }));
  if (ctx.F.geos.length) group.add(mesh(ctx.F.build(), litMat, { cast: false, receive: true }));
  const lm = ctx.links.build(chainMaterial());
  if (lm) group.add(lm);
  root.add(group);
  dress.set(id, { group, solids: ctx.sol });
}
const meadow = (ctx, x0, x1, z0, z1) => ctx.group.add(surfaceMesh('meadow', x0, x1, z0, z1, Y.lot + 0.003));
/** Scatter n grass tufts / flower clumps in a rect, skipping keep-clear zones. */
function scatter(ctx, x0, x1, z0, z1, n, what, zones) {
  const { F, rnd } = ctx;
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
    if (zones.some((q) => x > q.minX && x < q.maxX && z > q.minZ && z < q.maxZ)) continue;
    if (what === 'flowers') flowers(F, x, z, rnd); else tuft(F, x, z, 0.8 + rnd() * 0.6, rnd);
  }
}
/** Trodden dirt path through grass along a polyline (flat). */
function trodden(ctx, pts, w = 0.75) {
  const { F, rnd } = ctx;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax);
    quad(F, len + w * 0.6, w, 0xb59a74, (ax + bx) / 2, Y.lot + 0.01, (az + bz) / 2, ry);
    quad(F, len + w * 0.3, w * 0.45, 0xc4ab84, (ax + bx) / 2, Y.lot + 0.012, (az + bz) / 2, ry);
    for (let k = 0; k < 4; k++) {                    // ragged worn edges
      const t = rnd(), side = rnd() < 0.5 ? -1 : 1, px = ax + (bx - ax) * t + Math.sin(ry) * side * w * 0.5, pz = az + (bz - az) * t + Math.cos(ry) * side * w * 0.5;
      quad(F, 0.25 + rnd() * 0.3, 0.16, 0xa8916e, px, Y.lot + 0.009, pz, ry + (rnd() - 0.5));
    }
  }
}

/** Pair of compacted wheel ruts along a polyline (gauge = track width). */
function ruts(ctx, pts, gauge = 1.7, col = 0xa89d86) {
  const { F } = ctx;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax);
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (const s of [-0.5, 0.5]) quad(F, len + 0.3, 0.34, col, (ax + bx) / 2 + nx * s * gauge, Y.lot + 0.006, (az + bz) / 2 + nz * s * gauge, ry);
  }
}

export function buildPlots(root) {
  dress.clear();
  const zones = clearZones();
  const PL = (id) => (PROPERTIES[id] || SERVICES[id]).plot;

  // ---- Spray Bay: an old truck yard behind chain-link: faded bays, patched slabs, a trailer, a skip, pallets
  plot(root, 'paint', (c) => {
    const { b, F, rnd } = c, p = PL('paint');
    chainFence(c, p.minX + 2.9, 10.72, p.minX + 10.8, 10.72, 1.1);
    chainFence(c, p.minX + 15.2, 10.72, -20.3, 10.72, 1.1);
    chainFence(c, p.minX + 0.15, p.minZ + 0.15, p.minX + 0.15, 10.72, 1.3);
    chainFence(c, p.minX + 0.15, p.minZ + 0.15, p.maxX - 0.15, p.minZ + 0.15, 1.6);
    chainFence(c, p.maxX - 0.15, p.minZ + 0.15, p.maxX - 0.15, 9.6, 1.3);
    for (const gx of [p.minX + 2.9, p.minX + 10.8, p.minX + 15.2]) b.box(0.14, 1.25, 0.14, GALV, gx, 0, 10.72);
    for (let i = 0; i < 4; i++) {                      // the old truck bays (faded), east of the pad
      const x0 = -27.4 + i * 2.45;
      fadedBox(F, x0, 1.55, x0 + 2.45, 6.6, FADED_Y, 's');
      if (rnd() < 0.7) oil(F, x0 + 1.2 + (rnd() - 0.5) * 0.4, 3.0 + rnd() * 1.6, 0.35 + rnd() * 0.2, rnd);
    }
    for (const [i, j] of [[-11, 3], [-19, 3], [-16, 3]]) slabPatch(F, i, j, rnd);
    trailer(b, -37.6, -6.4, 0.12, rnd); c.sol.push({ minX: -40.0, maxX: -34.0, minZ: -7.6, maxZ: -5.2 });
    skip(b, -23.2, -3.4, -0.08, rnd); c.sol.push({ minX: -24.7, maxX: -21.7, minZ: -4.3, maxZ: -2.5 });
    for (const [x, z, n] of [[-27.6, -10.6, 6], [-26.2, -10.7, 4], [-26.9, -9.3, 2]]) palletStack(b, x, z, rnd() * 0.2, n);
    c.sol.push({ minX: -28.3, maxX: -25.5, minZ: -11.4, maxZ: -8.6 });
    tyres(b, -41.6, -10.6, 5, rnd); tyres(b, -40.8, -10.9, 3, rnd); tyreHeap(b, -40.9, -9.7, rnd, 6);
    c.sol.push({ minX: -42.1, maxX: -40.1, minZ: -11.3, maxZ: -9.1 });
    engineBlock(b, -33.2, -10.7, 0.3); c.sol.push({ minX: -33.9, maxX: -32.5, minZ: -11.4, maxZ: -10.0 });
    drum(b, -19.9, -10.8, 0x3c6e9e); drum(b, -19.2, -10.5, RUST); drum(b, -19.6, -9.8, 0x2f7f5a, true);
    c.sol.push({ minX: -20.4, maxX: -18.7, minZ: -11.3, maxZ: -9.4 });
    scrubTree(b, -42.4, -0.8, 1.0, rnd); scrubTree(b, -18.9, -11.4, 0.9, rnd);
    bramble(b, -42.6, -3.2, 1.1, rnd); bramble(b, -36.0, -11.6, 0.9, rnd);
    board(c, -30.5, 0.3, 'SPRAY BAY', 'paint shop');
    ruts(c, [[-33.6, 1.1], [-34.4, -1.6], [-35.8, -3.6], [-36.6, -4.9]]);           // trucks backing up to the trailer
    ruts(c, [[-25.0, 1.1], [-24.2, -0.8], [-23.6, -2.0]]);                         // ... and to the skip
    soil(b, -31.4, -9.7, 1.5, rnd, [0xb3a993, 0xc2b8a3, 0xa59a86, 0xcfc6b3, 0x9d968b]);   // a heap of hardcore
    c.sol.push({ minX: -32.9, maxX: -29.9, minZ: -11.2, maxZ: -8.2 });
    scatter(c, p.minX + 0.3, p.maxX - 0.3, p.minZ + 0.3, 1.0, 34, 'grass', zones);
    for (let x = p.minX + 1; x < p.maxX - 1; x += 1.4 + rnd() * 2) tuft(F, x, 10.55, 0.8, rnd);
  }, 501);

  // ---- Platinum Club: a grassy lot gone wild, young trees, a path trodden across it, post-and-rail fence
  plot(root, 'vip', (c) => {
    const { b, F, rnd } = c, p = PL('vip');
    meadow(c, p.minX + 0.1, p.maxX - 0.1, p.minZ + 0.1, p.maxZ - 0.05);
    railFence(c, p.minX + 0.15, 10.8, p.maxX - 0.15, 10.8, [[2.0, 4.2], [7.0, 9.6]]);
    railFence(c, p.maxX - 0.15, p.minZ + 0.2, p.maxX - 0.15, 10.8);
    railFence(c, p.minX + 0.15, p.minZ + 0.2, p.maxX - 0.15, p.minZ + 0.2, [[13.6, 15.6]]);
    trodden(c, [[30.7, 11.0], [32.6, 8.6], [35.2, 6.4], [36.6, 4.0], [38.6, 0.0], [40.6, -5.0], [42.2, -9.6], [42.6, -12.5]]);
    for (const [x, z, s] of [[30.0, -2.0, 1.0], [33.2, -8.6, 1.1], [40.9, 3.4, 0.95], [43.2, -1.2, 1.0], [29.6, 5.6, 0.9], [37.4, -10.2, 1.05]]) sapling(b, x, z, s, rnd);
    bramble(b, 28.4, -11.2, 1.2, rnd); bramble(b, 44.0, -8.6, 1.0, rnd); bramble(b, 34.6, -11.5, 0.9, rnd);
    board(c, 40.4, 2.4, 'PLATINUM CLUB', 'VIP lounge & service');
    scatter(c, p.minX + 0.3, p.maxX - 0.3, p.minZ + 0.3, p.maxZ - 0.3, 50, 'grass', zones);
    scatter(c, p.minX + 0.3, p.maxX - 0.3, p.minZ + 0.3, p.maxZ - 0.3, 20, 'flowers', zones);
  }, 502);

  // ---- Harbor Lounge: footprint of a demolished building: footings, old tiles, a brick stub, rubble, a skip
  plot(root, 'lounge', (c) => {
    const { b, F, rnd } = c;
    const x0 = 12.0, x1 = 22.8, z0 = -9.3, z1 = -3.0;
    footing(F, x0, z0, x1, z0); footing(F, x0, z1, x1, z1); footing(F, x0, z0, x0, z1); footing(F, x1, z0, x1, z1);
    footing(F, 16.6, z0, 16.6, -5.5, 0.26); footing(F, 16.6, -4.4, 16.6, z1, 0.26);
    footing(F, 16.6, -6.2, 19.0, -6.2, 0.26); footing(F, 20.0, -6.2, x1, -6.2, 0.26);
    tiles(F, 12.35, -8.95, 16.3, -3.35, 0xf3e6c8, 0x2a9d8f, rnd);
    flatTop(F, 16.95, 22.45, -8.95, -6.55, Y.lot + 0.007, 0xa7a297);
    brickStub(b, x0 + 0.05, z0, x0 + 2.8, z0, 0.95, rnd); brickStub(b, x0, z0 + 0.1, x0, z0 + 1.8, 0.6, rnd);
    c.sol.push({ minX: x0 - 0.15, maxX: x0 + 2.85, minZ: z0 - 0.15, maxZ: z0 + 0.15 }, { minX: x0 - 0.15, maxX: x0 + 0.15, minZ: z0, maxZ: z0 + 1.9 });
    rubble(b, 20.5, -8.0, 1.3, rnd); c.sol.push({ minX: 19.3, maxX: 21.7, minZ: -9.1, maxZ: -6.9 });
    skip(b, 20.6, -4.5, 0, rnd); c.sol.push({ minX: 19.2, maxX: 22.0, minZ: -5.3, maxZ: -3.7 });
    bramble(b, 22.8, -9.5, 0.8, rnd);
    board(c, 19.6, -2.2, 'HARBOR LOUNGE', 'waiting room & cafe');
    scatter(c, 11.6, 23.2, -9.6, 0.4, 40, 'grass', zones);
  }, 503);

  // ---- Suds & Shine: a small disused car park, fenced off and padlocked
  plot(root, 'wash', (c) => {
    const { b, F, rnd } = c, p = PL('wash');
    chainFence(c, p.minX + 0.1, p.maxZ - 0.1, p.maxX - 0.1, p.maxZ - 0.1, 1.0);
    chainFence(c, p.minX + 0.1, p.minZ + 0.1, p.maxX - 0.1, p.minZ + 0.1, 1.2);
    chainFence(c, p.maxX - 0.1, p.minZ + 0.1, p.maxX - 0.1, p.maxZ - 0.1, 1.2);
    chainFence(c, p.minX + 0.1, p.minZ + 0.1, p.minX + 0.1, p.maxZ - 0.1, 1.0, [[0.9, 2.9]]);
    // closed double gate on the west side, chained
    for (const [z0, z1] of [[p.minZ + 1.0, p.minZ + 1.98], [p.minZ + 2.02, p.minZ + 3.0]]) {
      b.box(0.05, 0.9, z1 - z0, GALV, p.minX + 0.1, 0.06, (z0 + z1) / 2);
      c.links.quad(p.minX + 0.1, z0, p.minX + 0.1, z1, 0.08, 0.92);
    }
    b.box(0.08, 0.14, 0.12, 0xb8a040, p.minX + 0.14, 0.5, p.minZ + 2.0);
    c.sol.push({ minX: p.minX, maxX: p.minX + 0.2, minZ: p.minZ + 0.9, maxZ: p.minZ + 3.1 });
    for (const x of [16.3, 18.7, 21.1]) fadedBox(F, x, 2.0, x + 2.4, 5.2, FADED_W, 's', 0.09);
    oil(F, 17.5, 3.4, 0.4, rnd); oil(F, 22.2, 3.0, 0.3, rnd);
    palletStack(b, 22.7, 2.5, 0.1, 3); drum(b, 15.7, 2.4, RUST);
    board(c, 19.4, 2.25, 'SUDS & SHINE', 'drive-through car wash');
    for (let x = p.minX + 0.5; x < p.maxX - 0.5; x += 1.0 + rnd() * 1.5) tuft(F, x, p.maxZ - 0.3, 0.8, rnd);
    for (let z = p.minZ + 0.5; z < p.maxZ - 0.5; z += 1.0 + rnd()) tuft(F, p.maxX - 0.3, z, 0.8, rnd);
  }, 504);

  // ---- Tow Truck: the corner by the hall wall collects old tyres, an engine block, drums and a tarp
  plot(root, 'tow', (c) => {
    const { b, F, rnd } = c;
    tyres(b, -12.85, -4.95, 5, rnd); tyres(b, -12.15, -5.15, 3, rnd);
    engineBlock(b, -10.85, -4.7, 1.4);
    tarpHeap(b, -12.3, -2.7, 1.5, 1.2);
    drum(b, -10.6, -2.4, 0x3c6e9e); drum(b, -10.65, -1.75, RUST);
    c.sol.push({ minX: -13.3, maxX: -10.15, minZ: -5.55, maxZ: -1.35 });
    for (let z = -5.2; z < 0.4; z += 0.9 + rnd()) tuft(F, -10.2, z, 0.8, rnd);
  }, 505);

  // ---- Pump & Go: a fuel station long gone: capped pump islands, bolted column plates, tank fill covers
  plot(root, 'gas', (c) => {
    const { b, F, rnd } = c, p = PL('gas');
    pumpIsland(b, -57.6, -2.4, 1.8); pumpIsland(b, -54.4, -2.4, 1.8);
    for (const x of [-58.9, -53.1]) for (const z of [-3.8, 3.2]) columnPlate(F, b, x, z);
    for (const [i, col] of [[0, 0x3d7a5e], [1, 0xc0503f], [2, P.accent]]) {
      disc(F, 0.32, mix(col, 0xc4beb0, 0.5), -60.0, Y.lot + 0.006, 3.6 + i * 0.8, 12);
      disc(F, 0.22, 0x5c6168, -60.0, Y.lot + 0.009, 3.6 + i * 0.8, 12);
    }
    for (const x of [-56.0]) for (const z of [-5.0, 4.6]) quad(F, 0.18, 1.4, FADED_W, x, Y.lot + 0.006, z);
    oil(F, -56.0, 0.0, 0.5, rnd); oil(F, -55.6, -1.2, 0.3, rnd); oil(F, -58.6, 1.0, 0.35, rnd);
    drum(b, -60.3, -6.2, RUST); drum(b, -59.6, -6.4, 0x3c6e9e); drum(b, -60.0, -5.5, RUST, true);
    c.sol.push({ minX: -60.7, maxX: -59.2, minZ: -6.8, maxZ: -5.1 });
    for (const [x, z] of [[-57.6, -2.65], [-57.6, 2.05], [-54.4, -2.65], [-54.4, 2.05]]) c.sol.push({ minX: x - 0.12, maxX: x + 0.12, minZ: z - 0.12, maxZ: z + 0.12 });
    bramble(b, -52.0, -6.4, 0.9, rnd); scrubTree(b, -60.4, 5.6, 0.9, rnd);
    board(c, -56.0, -6.0, 'PUMP & GO', 'gas station');
    scatter(c, p.minX + 0.3, p.maxX - 0.3, p.minZ + 0.3, 6.4, 22, 'grass', zones);
  }, 506);

  // ---- Quick-Fit Express: an old tyre yard behind chain-link, faded fitting bays
  plot(root, 'quickfit', (c) => {
    const { b, F, rnd } = c, p = PL('quickfit');
    chainFence(c, p.minX + 0.2, p.minZ + 0.15, p.maxX - 0.15, p.minZ + 0.15, 1.8);
    chainFence(c, p.maxX - 0.15, p.minZ + 0.15, p.maxX - 0.15, 5.6, 1.8);
    for (const [x, z, n] of [[52.4, -6.0, 6], [53.2, -6.1, 5], [54.0, -5.9, 7], [53.1, -5.25, 4], [55.6, -6.0, 5], [56.4, -5.9, 6], [60.0, -3.6, 5], [60.1, -2.7, 6], [59.9, -1.8, 4]]) tyres(b, x, z, n, rnd);
    tyreHeap(b, 57.6, -3.4, rnd, 9);
    c.sol.push({ minX: 51.9, maxX: 54.5, minZ: -6.6, maxZ: -4.85 }, { minX: 55.1, maxX: 56.9, minZ: -6.5, maxZ: -5.4 }, { minX: 59.4, maxX: 60.6, minZ: -4.1, maxZ: -1.4 }, { minX: 56.9, maxX: 58.3, minZ: -4.0, maxZ: -2.8 });
    trailer(b, 55.6, 1.0, PI + 0.05, rnd, 'tyres'); c.sol.push({ minX: 51.7, maxX: 57.8, minZ: -0.2, maxZ: 2.2 });
    for (const x of [52.0, 55.0, 58.0]) fadedBox(F, x, 2.8, x + 3.0, 6.4, FADED_Y, 's');
    oil(F, 53.4, 4.4, 0.45, rnd); oil(F, 59.4, 4.8, 0.4, rnd);
    board(c, 54.4, -4.0, 'QUICK-FIT', 'express tyres & service');
    scatter(c, p.minX + 0.3, p.maxX - 0.3, p.minZ + 0.3, 6.4, 18, 'grass', zones);
  }, 507);

  // ---- Rust & Gold Salvage (Main St): an overgrown field, a rusty trailer, tyre heaps, scrap, a sagging fence
  plot(root, 'junkyard', (c) => {
    const { b, rnd } = c, p = PL('junkyard');
    meadow(c, p.minX + 0.14, p.maxX - 0.14, p.minZ + 0.14, p.maxZ - 0.14);
    chainFence(c, p.minX + 0.3, p.minZ + 0.3, p.maxX - 0.3, p.minZ + 0.3, 1.6, [[6.0, 8.4]]);
    trailer(b, -39.2, -33.2, 0.32, rnd); c.sol.push({ minX: -41.6, maxX: -35.9, minZ: -34.9, maxZ: -31.4 });
    tyreHeap(b, -30.6, -35.6, rnd, 9); tyres(b, -29.6, -36.2, 5, rnd); c.sol.push({ minX: -31.4, maxX: -29.0, minZ: -36.8, maxZ: -34.9 });
    for (let i = 0; i < 4; i++) b.box(1.4, 0.04, 0.9, mix(0x7d8e97, RUST, rnd() * 0.6), -34.6 + (rnd() - 0.5) * 0.5, i * 0.05, -36.3, 0.05, rnd() * 0.5, 0.05);
    c.sol.push({ minX: -35.5, maxX: -33.7, minZ: -36.9, maxZ: -35.7 });
    for (const [x, z, s] of [[-42.4, -30.4, 1.0], [-27.8, -31.6, 1.1], [-36.6, -36.6, 0.9]]) scrubTree(b, x, z, s, rnd);
    bramble(b, -44.0, -33.0, 1.1, rnd); bramble(b, -26.4, -36.6, 1.0, rnd);
    board(c, -37.2, -29.4, 'RUST & GOLD', 'salvage yard');
    scatter(c, p.minX + 0.3, p.maxX - 0.3, p.minZ + 0.3, p.maxZ - 0.3, 45, 'grass', zones);
    scatter(c, p.minX + 0.3, p.maxX - 0.3, p.minZ + 0.3, p.maxZ - 0.3, 14, 'flowers', zones);
  }, 508);

  // ---- The Greasy Spoon (Main St): a demolished diner: footings, black-and-white floor tiles, rubble, a skip
  plot(root, 'diner', (c) => {
    const { b, F, rnd } = c;
    const x0 = -6.6, x1 = 5.6, z0 = -36.6, z1 = -29.4;
    footing(F, x0, z0, x1, z0); footing(F, x0, z1, x1, z1); footing(F, x0, z0, x0, z1); footing(F, x1, z0, x1, z1);
    footing(F, -0.6, z0, -0.6, -33.4, 0.26); footing(F, -0.6, -32.4, -0.6, z1, 0.26);
    tiles(F, -6.25, -36.25, -0.95, -29.75, 0xf3eee4, 0x2b2f36, rnd, 0.36);
    flatTop(F, -0.25, 5.25, -36.25, -29.75, Y.lot + 0.007, 0xa7a297);
    brickStub(b, 2.6, z0, x1, z0, 1.0, rnd); brickStub(b, x1, z0 + 0.1, x1, z0 + 2.6, 0.7, rnd);
    c.sol.push({ minX: 2.45, maxX: x1 + 0.15, minZ: z0 - 0.15, maxZ: z0 + 0.15 }, { minX: x1 - 0.15, maxX: x1 + 0.15, minZ: z0, maxZ: z0 + 2.7 });
    rubble(b, 2.8, -33.0, 1.5, rnd); c.sol.push({ minX: 1.4, maxX: 4.2, minZ: -34.3, maxZ: -31.7 });
    skip(b, -3.4, -35.0, 0.04, rnd); c.sol.push({ minX: -4.9, maxX: -1.9, minZ: -35.9, maxZ: -34.1 });
    board(c, -3.6, -28.2, 'THE GREASY SPOON', 'diner');
    scatter(c, -7.3, 6.3, -37.3, -25.4, 30, 'grass', zones);
  }, 509);

  // ---- Bay Classics (Main St): an old car park grassing over: cracked tarmac, wheel stops, dead lamps, stakes
  plot(root, 'showroom', (c) => {
    const { b, F, rnd } = c, p = PL('showroom');
    // the old tarmac (bays + aisle) with grass breaking through; meadow around it (no overlap: no z-fighting)
    const t0 = 24.6, t1 = 43.4, tz0 = -35.8, tz1 = -29.8;
    meadow(c, p.minX + 0.14, p.maxX - 0.14, p.minZ + 0.14, tz0);
    meadow(c, p.minX + 0.14, p.maxX - 0.14, tz1, p.maxZ - 0.14);
    meadow(c, p.minX + 0.14, t0, tz0, tz1); meadow(c, t1, p.maxX - 0.14, tz0, tz1);
    c.group.add(surfaceMesh('alley', t0, t1, tz0, tz1, Y.lot + 0.003));
    for (let i = 0; i < 46; i++) {                     // grass and moss pushing through the cracks
      const x = t0 + 0.3 + rnd() * (t1 - t0 - 0.6), z = tz0 + 0.2 + rnd() * (tz1 - tz0 - 0.4);
      quad(F, 0.12 + rnd() * 0.35, 0.08 + rnd() * 0.18, pick(rnd, [0x6f9a58, 0x7fa862, 0x5f8a4e]), x, Y.lot + 0.01, z, rnd() * 3);
      if (rnd() < 0.5) tuft(F, x, z, 0.7 + rnd() * 0.4, rnd);
    }
    for (let x = 25.0; x < 43.0; x += 2.5) {
      flatTop(F, x - 0.05, x + 0.05, -35.5, -32.7, Y.lot + 0.009, FADED_W);
      if (rnd() < 0.75) wheelStop(F, x + 1.25, -35.0, (rnd() - 0.5) * 0.25);
    }
    deadLamp(b, 28.2, -36.4); deadLamp(b, 39.8, -36.4);
    staked(b, F, 26.6, -35.8, 41.6, -29.6);
    for (const [x, z, s] of [[24.6, -36.6, 1.0], [43.4, -28.8, 1.0], [37.0, -36.9, 0.9]]) sapling(b, x, z, s, rnd);
    board(c, 37.8, -28.7, 'BAY CLASSICS', 'classic car showroom');
    scatter(c, p.minX + 0.3, p.maxX - 0.3, p.minZ + 0.3, p.maxZ - 0.3, 60, 'grass', zones);
    scatter(c, p.minX + 0.3, p.maxX - 0.3, p.minZ + 0.3, p.maxZ - 0.3, 16, 'flowers', zones);
  }, 510);

  // ---- Harbor Parts Co. (Main St, opens with the district): a builders' yard: brick pallets, beams, kerbs, a cabin
  plot(root, 'depot', (c) => {
    const { b, F, rnd } = c;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) brickPallet(b, -22.2 + i * 1.35, -36.4 + j * 1.25, (rnd() - 0.5) * 0.1);
    c.sol.push({ minX: -22.9, maxX: -17.6, minZ: -37.1, maxZ: -34.5 });
    beams(b, -12.8, -35.9, 0.02); c.sol.push({ minX: -15.2, maxX: -10.4, minZ: -36.6, maxZ: -35.2 });
    kerbStack(b, -15.8, -33.6, 0.1); kerbStack(b, -14.4, -33.5, -0.05); c.sol.push({ minX: -16.5, maxX: -13.7, minZ: -34.2, maxZ: -32.9 });
    siteCabin(b, -20.6, -31.4); c.sol.push({ minX: -22.25, maxX: -18.95, minZ: -32.6, maxZ: -30.2 });
    for (let i = 0; i < 6; i++) oil(F, -22 + rnd() * 12, -36 + rnd() * 7, 0.2 + rnd() * 0.25, rnd);
    board(c, -16.4, -29.2, 'HARBOR PARTS CO.', 'parts depot');
    scatter(c, -23.2, -9.8, -37.2, -28.5, 16, 'grass', zones);
  }, 511);

  // ---- Wrench Academy (Main St, opens with the district): surveyed and staked out, a soil heap, cabin + loo
  plot(root, 'academy', (c) => {
    const { b, F, rnd } = c;
    staked(b, F, 10.2, -35.6, 19.6, -29.6);
    soil(b, 11.2, -36.2, 1.4, rnd); c.sol.push({ minX: 9.8, maxX: 12.6, minZ: -37.4, maxZ: -35.0 });
    siteCabin(b, 17.0, -36.2); c.sol.push({ minX: 15.35, maxX: 18.65, minZ: -37.4, maxZ: -35.0 });
    portaloo(b, 19.6, -36.4); c.sol.push({ minX: 19.0, maxX: 20.2, minZ: -37.0, maxZ: -35.8 });
    kerbStack(b, 13.6, -32.6, 0.05); c.sol.push({ minX: 12.9, maxX: 14.3, minZ: -33.2, maxZ: -32.0 });
    board(c, 15.0, -29.0, 'WRENCH ACADEMY', 'mechanics school');
    scatter(c, 8.8, 21.2, -37.2, -28.6, 24, 'grass', zones);
  }, 512);

  // dev check: nothing solid on a pad, a sign, a bay, a rescue spot, a wrench or a walkway
  for (const [id, d] of dress) {
    for (const s of d.solids) {
      const z = zones.find((q) => hit(s, q));
      if (z) console.warn(`[env-plots] ${id}: solid ${JSON.stringify(s)} overlaps a keep-clear zone ${JSON.stringify(z)}`);
    }
  }
  return dress;
}
