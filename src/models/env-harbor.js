// Harbor front dressing (owner: envdress agent).
// Contract (TOWN.md section 8, split of the env role): buildHarbor(env) pushes geometry into the shared chunk layers
// and returns { update(dt, t) } for the animated bits (boats, buoys, flags, wind vane).
//   env = { root, S, F, G, signs, rnd, geo }   S solid / F flat / G glow ChunkBuilders (env-kit.js), signs = SignAtlas,
//   rnd = seeded random, geo = streetGeo() from env-streets.js.
// Assumptions about what env builds (see /tmp/wb-progress/envdress.md): quay top at Y.walk up to z = TOWN.water.minZ
// (17.0), water plane at y = WATER_Y (-0.4), land east of x = TOWN.ferryPlaza.minX.
import * as THREE from 'three';
import { PALETTE as P } from '../config.js';
import { TOWN, RESCUE } from '../config.town.js';
import { Builder, litMat, mesh, polygon } from './voxel.js';
import {
  PI, Y, CREAM, CORAL, NAVY, PAINTW, mix, pick, crate, fishBox, bench, solidRect, drainGrate, lampPost,
} from './env-kit.js';

export const WATER_Y = -0.4;
const QZ = TOWN.water[0].minZ;                 // quay edge (17.0)
const QX0 = -63.5, QX1 = TOWN.water[0].maxX;   // rail runs from the west tunnel portal to the ferry plaza
const TOP = Y.walk;                            // quay top surface
const RUB = 0x2b2f36, ROPE = 0x8a6d3b, STEELL = 0xb9c3cb;

// ------------------------------------------------------------------ helpers
/** Thin straight bar between two points (works on Builder and ChunkBuilder). */
export function seg(b, ax, ay, az, bx, by, bz, t, col) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const hl = Math.hypot(dx, dz), len = Math.hypot(hl, dy);
  if (len < 1e-4) return;
  b.push((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, Math.atan2(dx, dz));
  b.box(t, t, len, col, 0, -t / 2, 0, -Math.asin(dy / len), 0, 0);
  b.pop();
}
/** True when x lies in any [a, b] range. */
const inAny = (x, ranges, pad = 0) => ranges.some(([a, b]) => x > a - pad && x < b + pad);

// x ranges along the quay where something else owns the ground (rescue cars, wrenches, bus stop, crossings, pier roots)
export const QUAY_KEEP = [];
for (const s of RESCUE.spots) if (s.z > 15) QUAY_KEEP.push([s.x - 2.0, s.x + 2.0, 'car']);
for (const w of TOWN.wrenches) if (w.z > 15) QUAY_KEEP.push([w.x - 1.25, w.x + 1.25, 'wrench']);
for (const b of TOWN.busStops) if (b.z > 15) QUAY_KEEP.push([b.x - 4.6, b.x + 4.6, 'bus']);
QUAY_KEEP.push([-32.0, -28.4, 'zebra'], [1.7, 5.3, 'zebra'], [33.5, 37.1, 'zebra']);       // zebra landings on the quay sidewalk

// ------------------------------------------------------------------ boats
// Local frame: bow +z, waterline y = 0, centre x = 0.
const hullPts = (L, W, k = 1) => [
  [-W * 0.42 * k, -L / 2], [W * 0.42 * k, -L / 2], [W / 2 * k, -L * 0.1], [W * 0.46 * k, L * 0.2], [0, L / 2], [-W * 0.46 * k, L * 0.2], [-W / 2 * k, -L * 0.1],
].map(([x, z]) => [x, -z]);     // shape y = -z (the extrusion is rotated -PI/2 about X)
function hullShape(L, W, k = 1, kz = 1) {
  const pts = hullPts(L * kz, W, k);
  return polygon(pts);
}
function ringShape(L, W, wall) {
  const s = hullShape(L, W);
  const inner = hullPts(L - wall * 2.4, W - wall * 2, 1).map(([x, y]) => [x, y]);
  const h = new THREE.Path();
  inner.forEach(([x, y], i) => (i ? h.lineTo(x, y) : h.moveTo(x, y)));
  h.closePath();
  s.holes.push(h);
  return s;
}
/** Hull: antifouling below the waterline, painted topsides, optional closed deck. */
function hull(b, L, W, o = {}) {
  const free = o.free ?? 0.55;
  b.shape(hullShape(L, W, 0.8, 0.96), 0.42, o.under ?? 0x8c2f2a, 0, -0.38, 0, -PI / 2);          // below water
  if (o.open) {
    b.shape(ringShape(L, W, o.wall ?? 0.07), free, o.top ?? CREAM, 0, 0, 0, -PI / 2);
    b.shape(hullShape(L, W, 0.9, 0.95), 0.03, o.deck ?? P.woodDark, 0, 0.12, 0, -PI / 2);        // floor boards
  } else {
    b.shape(hullShape(L, W), free, o.top ?? CREAM, 0, 0, 0, -PI / 2);
    b.shape(hullShape(L, W, 0.9, 0.95), 0.04, o.deck ?? P.wood, 0, free, 0, -PI / 2);             // deck
  }
  b.shape(hullShape(L, W, 1.02, 1.01), 0.05, o.stripe ?? CORAL, 0, free * 0.55, 0, -PI / 2);      // painted stripe / rubbing strake
  b.shape(hullShape(L, W, 1.15, 1.04), 0.03, 0xe8f6f8, 0, -0.03, 0, -PI / 2);                     // foam ring at the waterline
}
function fender(b, x, z, h = 0.3) { b.cyl(0.07, 0.07, h, RUB, x, 0.18, z, 6); }
function boatRail(b, L, W, y, from, to, col = P.steel) {
  const hw = W * 0.46;
  for (let z = from; z <= to + 0.01; z += 0.75) for (const s of [-1, 1]) b.box(0.035, 0.42, 0.035, col, s * hw, y, z);
  for (const s of [-1, 1]) seg(b, s * hw, y + 0.42, from, s * hw, y + 0.42, to, 0.03, col);
}

const BOATS = {
  fishing(b) {
    const L = 5.4, W = 2.0;
    hull(b, L, W, { top: NAVY, stripe: CORAL, under: 0x6d2b26, deck: 0x5d8a86 });
    // wheelhouse aft, cabin roof, windows
    b.box(1.3, 0.95, 1.25, CREAM, 0, 0.59, -1.45);
    b.box(1.42, 0.08, 1.38, CORAL, 0, 1.54, -1.45);
    b.box(1.12, 0.3, 0.04, 0x7fc9e0, 0, 1.05, -0.8);
    for (const s of [-1, 1]) b.box(0.04, 0.3, 0.7, 0x7fc9e0, s * 0.66, 1.05, -1.45);
    b.box(0.5, 0.75, 0.04, P.woodDark, 0, 0.6, -0.81);
    b.cyl(0.07, 0.09, 0.5, P.steelDark, 0.38, 1.62, -1.9, 6);                                    // exhaust stack
    // mast + derrick boom + lantern
    b.cyl(0.05, 0.07, 3.0, P.steelDark, 0, 0.6, 0.55, 6);
    b.box(0.3, 0.05, 0.05, P.steelDark, 0, 3.0, 0.55);
    seg(b, 0, 3.4, 0.55, 0, 1.6, 2.1, 0.05, P.steelDark);                                       // forestay
    seg(b, 0, 2.0, 0.55, 0.15, 1.0, 2.35, 0.06, P.woodDark);                                    // derrick
    b.box(0.14, 0.16, 0.14, 0xfff1b8, 0, 3.5, 0.55);
    // deck cargo: net pile with floats, fish boxes, crates, coiled rope
    for (const [x, z, w, d, h] of [[0.45, -0.25, 0.95, 0.9, 0.35], [-0.35, 0.1, 0.8, 0.7, 0.3], [0.2, 0.15, 0.6, 0.6, 0.5]]) b.box(w, h, d, 0x6f8f7a, x, 0.6, z, 0, 0.3);
    for (let i = 0; i < 6; i++) b.cyl(0.07, 0.07, 0.1, i % 2 ? 0xf2813a : CREAM, -0.5 + i * 0.22, 0.98 - (i % 3) * 0.05, -0.1 + (i % 2) * 0.35, 6, PI / 2);
    for (let i = 0; i < 3; i++) fishBox(b, -0.55, 1.35 - i * 0.2, 0.0, 0.59 + i * 0.25, i === 1 ? 0xf2813a : 0x4fa3c7);
    crate(b, 0.55, 1.1, 0.4, 0.42, P.wood, 0.6);
    b.cyl(0.26, 0.26, 0.1, ROPE, 0.5, 0.6, -0.9, 10);
    // buoys + fenders hanging on the hull, rails at the bow
    for (const s of [-1, 1]) { for (const z of [-1.6, -0.2, 1.1]) fender(b, s * 1.0, z); b.cyl(0.14, 0.14, 0.28, 0xf2813a, s * 0.9, 0.62, 1.7, 8); }
    boatRail(b, L, W, 0.62, 0.7, 2.0, STEELL);
    b.box(0.5, 0.18, 0.04, CREAM, 0.0, 0.34, 2.45);                                              // name board on the bow
  },
  sail(b) {
    const L = 4.6, W = 1.6;
    hull(b, L, W, { top: CREAM, stripe: P.teal, under: 0x2a6e68, free: 0.5, deck: 0xd2b27d });
    b.box(0.95, 0.38, 1.7, CREAM, 0, 0.54, -0.3);                                                // cabin
    b.box(0.97, 0.05, 1.72, P.woodDark, 0, 0.92, -0.3);
    for (const s of [-1, 1]) b.box(0.04, 0.16, 0.9, 0x6fb5cc, s * 0.48, 0.64, -0.3);
    b.cyl(0.04, 0.055, 4.2, STEELL, 0, 0.9, 0.35, 6);                                            // mast
    b.box(0.07, 0.07, 2.05, STEELL, 0, 1.2, -0.7);                                               // boom
    b.shape(polygon([[0.33, 0], [-1.7, 0], [0.33, 3.5]]), 0.03, CREAM, -0.015, 1.25, 0, 0, -PI / 2);   // mainsail
    b.shape(polygon([[2.2, 0], [0.45, 0], [0.62, 3.8]]), 0.03, CORAL, -0.015, 0.6, 0, 0, -PI / 2);       // jib
    seg(b, 0, 5.0, 0.35, 0, 0.55, 2.25, 0.025, STEELL);                                          // forestay
    seg(b, 0, 5.0, 0.35, 0, 0.55, -2.1, 0.025, STEELL);                                          // backstay
    b.box(0.1, 0.1, 0.1, 0xfff1b8, 0, 5.1, 0.35);
    boatRail(b, L, W, 0.5, 0.5, 1.9, STEELL);
    for (const s of [-1, 1]) fender(b, s * 0.78, 0.1, 0.28);
  },
  launch(b, c = { top: CREAM, stripe: P.teal, roof: CORAL }) {
    const L = 3.7, W = 1.5;
    hull(b, L, W, { top: c.top, stripe: c.stripe, under: 0x5a2f2a, free: 0.5, deck: 0x9db8b5 });
    b.box(0.9, 0.5, 0.6, c.top, 0, 0.54, -0.2);                                                  // console / cabin
    b.box(0.95, 0.06, 0.8, c.roof, 0, 1.5, -0.28);
    for (const s of [-0.4, 0.4]) b.box(0.05, 0.5, 0.05, P.steelDark, s, 1.0, 0.0);
    b.box(0.8, 0.5, 0.04, 0xbfe8f5, 0, 1.0, 0.12, -0.2);                                         // windscreen
    b.box(1.0, 0.1, 0.4, P.woodDark, 0, 0.54, -1.2);                                             // aft bench
    b.box(0.34, 0.55, 0.3, P.steelDark, 0, 0.1, -1.95);                                          // outboard
    b.cyl(0.025, 0.025, 0.6, P.steelDark, 0, 0.0, -1.95, 5);
    b.box(0.25, 0.15, 0.25, 0xe5484d, 0, 0.55, -1.95);
    for (const s of [-1, 1]) fender(b, s * 0.78, 0.3, 0.26);
  },
  row(b) {
    const L = 2.7, W = 1.1;
    hull(b, L, W, { open: true, top: P.wood, stripe: P.teal, under: 0x5b3a26, free: 0.34, wall: 0.07, deck: 0xc9a06a });
    for (const z of [-0.5, 0.35]) b.box(W * 0.8, 0.05, 0.2, P.woodDark, 0, 0.26, z);              // thwarts
    for (const s of [-1, 1]) seg(b, s * 0.5, 0.45, -0.3, s * 0.78, 0.36, 0.75, 0.04, P.woodDark);   // oars shipped
    b.box(0.2, 0.04, 0.5, P.woodDark, 0, 0.14, 1.0);
  },
};

/** One boat: a mesh in a group, bobbing. lines = [{ c: [lx, ly, lz] cleat on the boat, to: [wx, wy, wz] world point }]. */
function makeBoat(kind, x, z, yaw, lines = [], opts = {}) {
  const b = new Builder();
  BOATS[kind](b, opts);
  const g = new THREE.Group();
  g.position.set(x, WATER_Y + 0.03, z); g.rotation.order = 'YXZ'; g.rotation.y = yaw;
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), v = new THREE.Vector3();
  for (const ln of lines) {                                   // mooring lines run from the cleat to the bollard
    v.set(ln.to[0], ln.to[1], ln.to[2]).applyMatrix4(inv);
    const [cx, cy, cz] = ln.c;
    const sag = ln.slack ?? 0.12;
    const mx = (cx + v.x) / 2, my = (cy + v.y) / 2 - sag, mz = (cz + v.z) / 2;
    seg(b, cx, cy, cz, mx, my, mz, 0.055, ROPE);
    seg(b, mx, my, mz, v.x, v.y, v.z, 0.055, ROPE);
  }
  g.add(mesh(b.build(), litMat, { cast: true, receive: false }));
  return g;
}

// ------------------------------------------------------------------ small quay props (build into a ChunkBuilder)
function lifeRing(S, x, z, ry = 0) {
  S.push(x, 0, z, ry);
  S.box(0.06, 1.2, 0.06, P.steelDark, 0, TOP, 0);
  S.box(0.5, 0.05, 0.05, P.steelDark, 0, TOP + 1.15, 0.0);
  for (let i = 0; i < 8; i++) {                                    // ring: 8 blocks around a circle, red / white
    const a = i * PI / 4, cx = Math.cos(a) * 0.2, cy = TOP + 0.9 + Math.sin(a) * 0.2;
    S.box(0.1, 0.1, 0.08, i % 2 ? PAINTW : 0xe5484d, cx, cy - 0.05, 0.08, 0, 0, a);
  }
  S.pop();
}
function coil(S, x, z, r, col, rnd) {
  S.cyl(r, r, 0.22, col, x, TOP, z, 10);
  S.cyl(r * 0.45, r * 0.45, 0.24, mix(col, 0x000000, 0.35), x, TOP, z, 8);
  for (let i = 0; i < 4; i++) S.cyl(0.05, 0.05, 0.09, i % 2 ? 0xf2813a : CREAM, x + (rnd() - 0.5) * r * 1.5, TOP + 0.2, z + (rnd() - 0.5) * r * 1.5, 6);
}
function netHeap(S, x, z, rnd) {
  S.box(0.8, 0.22, 0.6, 0x6f8f7a, x, TOP, z, 0, rnd() * 0.5);
  S.box(0.55, 0.2, 0.42, 0x7ea48b, x + 0.05, TOP + 0.18, z, 0, rnd());
  for (let i = 0; i < 3; i++) S.cyl(0.06, 0.06, 0.1, i % 2 ? 0xf2813a : CREAM, x + (rnd() - 0.5) * 0.7, TOP + 0.3, z + (rnd() - 0.5) * 0.4, 6, PI / 2);
}
function ironCleat(S, x, y, z, ry = 0) {
  S.push(x, y, z, ry);
  S.box(0.34, 0.05, 0.1, 0x3a4048, 0, 0, 0);
  S.box(0.06, 0.1, 0.08, 0x3a4048, -0.12, 0.05, 0); S.box(0.06, 0.1, 0.08, 0x3a4048, 0.12, 0.05, 0);
  S.box(0.34, 0.04, 0.06, 0x3a4048, 0, 0.13, 0);
  S.pop();
}
function ladder(S, x) {
  const z = QZ + 0.03;
  for (const s of [-0.2, 0.2]) {
    S.box(0.04, 0.78, 0.04, STEELL, x + s, -0.62, z);                            // rails down the wall
    S.box(0.04, 0.04, 0.3, STEELL, x + s, TOP + 0.4, QZ - 0.2);                    // bent over the coping
    S.box(0.04, 0.45, 0.04, STEELL, x + s, TOP, QZ - 0.3);                         // handrail stubs
  }
  S.box(0.44, 0.04, 0.04, STEELL, x, TOP + 0.45, QZ - 0.3);
  for (let y = -0.55; y < 0.1; y += 0.2) S.box(0.4, 0.035, 0.035, STEELL, x, y, z + 0.0);
}
function flagMesh(col1, col2) {
  const b = new Builder();
  for (let i = 0; i < 3; i++) b.box(0.22, 0.34, 0.015, i === 1 ? col2 : col1, 0.11 + i * 0.22, -0.17, 0);
  return mesh(b.build(), litMat, { cast: false });
}

// ------------------------------------------------------------------ piers, hut
function pier(S, x, w, z0, z1, top = 0.09) {
  const len = z1 - z0, zc = (z0 + z1) / 2;
  S.box(w, 0.1, len, P.wood, x, top - 0.1, zc);
  for (let z = z0 + 0.5; z < z1 - 0.2; z += 0.5) S.box(w + 0.01, 0.012, 0.03, P.woodDark, x, top, z);
  for (const s of [-1, 1]) S.box(0.1, 0.16, len, P.woodDark, x + s * (w / 2 + 0.03), top - 0.12, zc);       // side beams
  for (let z = z0 + 1.2; z <= z1 - 0.1; z += 2.4) for (const s of [-1, 1]) {
    S.cyl(0.1, 0.11, 1.4, P.woodDark, x + s * (w / 2 + 0.03), -0.7, z, 6);
    S.cyl(0.115, 0.115, 0.06, 0x3a4048, x + s * (w / 2 + 0.03), top + 0.28, z, 6);
    S.cyl(0.1, 0.11, 0.3, P.woodDark, x + s * (w / 2 + 0.03), top - 0.02, z, 6);
  }
  for (let z = z0 + 0.6; z < z1 - 0.3; z += 1.8) for (const s of [-1, 1]) ironCleat(S, x + s * (w / 2 - 0.12), top, z, PI / 2);
}
function harborHut(S, G, signs, x, z) {
  const w = 1.5, d = 1.4, h = 1.9, fz = d / 2;
  S.push(x, 0.09, z, 0); G.push(x, 0.09, z, 0);
  S.box(w + 0.1, 0.12, d + 0.1, 0xb8b0a2, 0, 0, 0);
  S.box(w, h, d, P.teal, 0, 0.12, 0);
  S.box(w + 0.1, 0.1, d + 0.1, CREAM, 0, h, 0);
  S.cyl(0.02, 1.2, 0.75, CORAL, 0, h + 0.1, 0, 4, 0, PI / 4);
  S.box(0.3, 0.55, 0.3, P.steelDark, -0.4, h + 0.55, -0.2);                                     // chimney pot
  G.box(0.9, 0.55, 0.04, 0xcdeef7, 0, 0.9, fz + 0.03);                                           // south window
  S.box(1.05, 0.08, 0.1, CREAM, 0, 0.84, fz + 0.06);
  S.box(0.08, 0.6, 0.05, CREAM, 0, 0.9, fz + 0.06);
  for (const s of [-1, 1]) S.box(0.22, 0.6, 0.04, NAVY, s * 0.62, 0.9, fz + 0.03);
  S.box(0.04, 1.55, 0.7, mix(P.teal, 0x000000, 0.25), w / 2 + 0.01, 0.12, 0.0);                  // door on the east side
  G.box(0.03, 0.3, 0.3, 0xcdeef7, w / 2 + 0.03, 1.1, 0.0);
  S.box(0.5, 0.3, 0.5, P.wood, w / 2 + 0.3, 0.12, 0.45);                                         // crate by the door
  signs.quad(S, 'HARBOR MASTER', { bg: NAVY, fg: CREAM, border: P.accent }, 1.35, 0.34, 0, 1.55, fz + 0.04);
  S.pop(); G.pop();
}

// ------------------------------------------------------------------ distance: breakwaters, lighthouse, far shore, cranes
function rubbleMole(S, rnd, x0, x1, z, w, hMax = 0.9) {
  S.box(x1 - x0, 1.2, w * 0.7, 0x9a9f9c, (x0 + x1) / 2, -0.7, z);
  for (let x = x0; x < x1; x += 0.7) for (let k = 0; k < Math.ceil(w / 0.9); k++) {
    const s = 0.6 + rnd() * 0.6, c = pick(rnd, [0x9aa09c, 0xa9b1ad, 0x8a908c, 0xb7bdb8]);
    const zz = z + (k - (Math.ceil(w / 0.9) - 1) / 2) * 0.9 + (rnd() - 0.5) * 0.3, xx = x + rnd() * 0.4;
    S.box(s, 0.3 + rnd() * hMax, s * 0.9, c, xx, -0.4, zz, 0, rnd() * 3, (rnd() - 0.5) * 0.3);
  }
  S.box(x1 - x0, 0.14, w * 0.4, 0xc9c3b6, (x0 + x1) / 2, 0.6, z);                                 // concrete cap
}
function lighthouse(S, G, x, z) {
  S.push(x, 0.6, z, 0); G.push(x, 0.6, z, 0);
  S.cyl(1.35, 1.5, 0.5, 0x8a908c, 0, 0, 0, 10);
  const bands = [[1.05, 0.9, 0xf7f1e6], [0.95, 0.82, 0xe5484d], [0.88, 0.76, 0xf7f1e6], [0.82, 0.7, 0xe5484d]];
  let y = 0.5;
  for (const [rb, rt, c] of bands) { S.cyl(rt, rb, 1.9, c, 0, y, 0, 10); y += 1.9; }
  S.cyl(1.1, 1.1, 0.12, P.steelDark, 0, y, 0, 10);                                                // gallery
  for (let i = 0; i < 10; i++) { const a = i * PI / 5; S.box(0.05, 0.4, 0.05, P.steelDark, Math.cos(a) * 1.05, y + 0.12, Math.sin(a) * 1.05); }
  G.cyl(0.5, 0.5, 0.7, 0xfff1b8, 0, y + 0.12, 0, 8);                                              // lantern
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; S.box(0.06, 0.7, 0.06, P.steelDark, Math.cos(a) * 0.52, y + 0.12, Math.sin(a) * 0.52); }
  S.cyl(0.05, 0.7, 0.45, P.steelDark, 0, y + 0.82, 0, 8);
  S.cyl(0.04, 0.04, 0.35, P.steelDark, 0, y + 1.27, 0, 5);
  S.pop(); G.pop();
}
function beacon(S, G, x, z, col) {
  S.box(0.9, 0.5, 0.9, 0x8a908c, x, 0.6, z);
  S.box(0.4, 2.4, 0.4, 0xf7f1e6, x, 1.1, z);
  S.box(0.5, 0.5, 0.5, col, x, 3.5, z);
  G.box(0.34, 0.34, 0.34, col === 0xe5484d ? 0xff8a80 : 0x9fe8a8, x, 3.58, z);
}
function crane(S, x, z, col = 0xd9534f) {
  const W = 0xe8eef0;
  for (const s of [-1, 1]) for (const t of [-1, 1]) S.box(0.18, 7.4, 0.18, col, x + s * 1.8, 0.2, z + t * 0.8);
  for (const t of [-1, 1]) S.box(3.9, 0.22, 0.22, col, x, 6.3, z + t * 0.8);
  S.box(3.9, 0.3, 1.9, W, x, 7.5, z);
  S.box(0.22, 0.22, 5.0, W, x + 1.0, 7.6, z - 2.6);                                               // boom over the water
  S.box(0.5, 0.45, 0.7, 0xcfd6da, x + 1.0, 7.1, z - 1.6);                                         // trolley
  seg(S, x + 1.0, 7.1, z - 1.6, x + 1.0, 3.6, z - 1.6, 0.03, P.steelDark);
  S.box(0.4, 0.3, 0.4, P.steelDark, x + 1.0, 3.3, z - 1.6);
}
function farShore(S, G, rnd) {
  const z0 = 28.6;
  S.box(110, 1.0, 3.6, 0xb9b0a2, -5, -1.0, z0 + 1.8);                                              // wharf
  S.box(110, 0.05, 3.6, 0xc9c3b6, -5, 0.0, z0 + 1.8);
  S.box(110, 0.12, 0.2, 0x8e8577, -5, 0.05, z0 + 0.15);
  for (const x of [-28, 8, 36]) crane(S, x, z0 + 1.6);
  const cols = [0xe5484d, 0x2f6fb5, 0x2a9d8f, 0xf6c453, 0xf2813a, 0x9b8fd4, 0xf7f1e6];
  for (const [x, n] of [[-20, 3], [-14, 2], [14, 3], [20, 2], [-40, 2], [45, 3]]) for (let i = 0; i < n; i++) for (let j = 0; j < (i % 2 ? 1 : 2); j++)
    S.box(2.4, 1.0, 1.0, pick(rnd, cols), x + i * 2.55, 0.05 + j * 1.02, z0 + 2.9);
  S.box(9, 3.2, 3, 0xc9b79a, -2, 0.05, z0 + 2.4); S.box(9.4, 0.3, 3.4, 0x5c6670, -2, 3.25, z0 + 2.4);
  G.box(1.6, 0.8, 0.05, 0xcdeef7, -4, 1.4, z0 + 0.88); G.box(1.6, 0.8, 0.05, 0xcdeef7, 0, 1.4, z0 + 0.88);
}

// ------------------------------------------------------------------ the build
export function buildHarbor(env) {
  const { root, S, F, G, signs, rnd } = env;
  const taken = QUAY_KEEP.map((r) => r.slice());
  const free = (x, hw) => !taken.some(([a, b]) => x + hw > a && x - hw < b);
  const take = (x, hw) => { taken.push([x - hw, x + hw]); return true; };
  const slot = (x, hw, what) => { if (!free(x, hw)) { console.warn('[envdress] quay slot blocked:', what, x); return false; } return take(x, hw); };
  const gaps = QUAY_KEEP.filter((r) => r[2] === 'car' || r[2] === 'wrench').map((r) => [r[0], r[1]]);   // rail gaps: cars + wrenches
  const gap = (x, hw) => gaps.push([x - hw, x + hw]);
  const bobbers = [], flags = [];
  const BZ = 16.7, BY = TOP + 0.37;                                    // bollard line and top

  // ---- quay edge: coping stone + yellow edge line
  S.box(QX1 - QX0, 0.045, 0.14, 0xd6cfc4, (QX0 + QX1) / 2, TOP, QZ - 0.14);
  for (let x = QX0; x < QX1; x += 1.5) F.box(Math.min(1.1, QX1 - x), 0.004, 0.06, 0xf6c453, x + 0.55, TOP + 0.045, QZ - 0.14);

  // ---- piers: root gaps first so nothing else lands there
  const PIERS = [{ x: 0.0, w: 1.7, z1: 26.6 }, { x: 29.0, w: 2.4, z1: 24.8 }];
  for (const p of PIERS) { slot(p.x, p.w / 2 + 0.4, 'pier'); gap(p.x, p.w / 2 + 0.25); pier(S, p.x, p.w, QZ - 0.02, p.z1); }
  // pier 1 details: lamp at the end, crates, net draped over the rail, life ring
  {
    const px = PIERS[0].x, ez = PIERS[0].z1;
    S.cyl(0.07, 0.09, 2.4, P.steelDark, px, 0.09, ez - 0.25, 8);
    S.box(0.34, 0.12, 0.34, P.steelDark, px, 2.5, ez - 0.25); G.box(0.24, 0.05, 0.24, 0xfff1b8, px, 2.46, ez - 0.25);
    crate(S, px + 0.45, ez - 1.9, 0.3, 0.32, P.wood, 0.09); crate(S, px + 0.45, ez - 1.9, 0.9, 0.3, P.wood, 0.41);
    fishBox(S, px - 0.4, ez - 3.4, 0.2, 0.09);
    lifeRing(S, px - 0.55, 20.0, 0);
  }
  // pier 2 details: harbor master hut, flag pole, bollards at the end
  {
    const p = PIERS[1];
    harborHut(S, G, signs, p.x - 0.5, 18.75);
    S.cyl(0.04, 0.05, 3.4, P.steelDark, p.x + 0.9, 0.09, 18.4, 6);
    S.cyl(0.07, 0.07, 0.06, P.accent, p.x + 0.9, 3.45, 18.4, 6);
    const fl = flagMesh(CORAL, CREAM); fl.position.set(p.x + 0.92, 3.4, 18.4); root.add(fl); flags.push({ m: fl, ph: 0 });
    for (const s of [-1, 1]) fishBox(S, p.x + s * 0.5, 21.4, 0.1 * s, 0.09, s > 0 ? 0xf2813a : 0x4fa3c7);
    S.box(0.5, 0.5, 0.5, P.wood, p.x + 0.7, 0.09, 23.2, 0, 0.4);
    S.cyl(0.07, 0.09, 2.4, P.steelDark, p.x, 0.09, p.z1 - 0.2, 8);
    S.box(0.34, 0.12, 0.34, P.steelDark, p.x, 2.5, p.z1 - 0.2); G.box(0.24, 0.05, 0.24, 0xfff1b8, p.x, 2.46, p.z1 - 0.2);
  }
  // wind vane on the hut roof (turns slowly with the breeze)
  const vane = new THREE.Group();
  { const b = new Builder(); b.cyl(0.015, 0.015, 0.5, P.steelDark, 0, 0, 0, 4); b.box(0.5, 0.03, 0.03, P.steelDark, 0, 0.42, 0); b.shape(polygon([[0, 0], [0.16, 0.08], [0, 0.16]]), 0.02, CORAL, 0.25, 0.34, -0.01, 0, 0, 0);
    vane.add(mesh(b.build(), litMat, { cast: false })); vane.position.set(PIERS[1].x - 0.5, 0.09 + 1.9 + 0.85, 18.75); root.add(vane); }

  // ---- floating pontoon with a gangway (rail gap), small boats tied up
  const PON = { x0: -48.4, x1: -40.4, z0: 18.3, z1: 19.1, top: -0.1 }, GX = -46.2;
  slot(GX, 0.8, 'gangway'); gap(GX, 0.7);
  {
    const cx = (PON.x0 + PON.x1) / 2, len = PON.x1 - PON.x0;
    S.box(len, 0.1, PON.z1 - PON.z0, P.wood, cx, PON.top - 0.1, (PON.z0 + PON.z1) / 2);
    for (let x = PON.x0 + 0.4; x < PON.x1 - 0.2; x += 0.4) S.box(0.02, 0.012, PON.z1 - PON.z0, P.woodDark, x, PON.top, (PON.z0 + PON.z1) / 2);
    for (let x = PON.x0 + 1; x < PON.x1; x += 2) S.box(0.8, 0.28, PON.z1 - PON.z0 - 0.1, 0x3b82c4, x, PON.top - 0.38, (PON.z0 + PON.z1) / 2);   // floats
    for (const x of [PON.x0 + 0.5, PON.x1 - 0.5]) {                                                                        // guide piles
      S.cyl(0.1, 0.11, 1.5, P.woodDark, x, -0.7, PON.z0 - 0.05, 6); S.cyl(0.115, 0.115, 0.05, 0x3a4048, x, 0.78, PON.z0 - 0.05, 6);
    }
    for (let x = PON.x0 + 1.2; x < PON.x1; x += 2.0) ironCleat(S, x, PON.top, PON.z1 - 0.1);
    // gangway: planks sloping from the quay coping to the pontoon, rails both sides
    const gz0 = QZ - 0.1, gz1 = PON.z0 + 0.1, g0 = TOP + 0.045, g1 = PON.top;
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6, zz = gz0 + (gz1 - gz0) * t, yy = g0 + (g1 - g0) * t;
      S.box(0.95, 0.04, (gz1 - gz0) / 6 - 0.01, P.wood, GX, yy - 0.04, zz);
    }
    for (const s of [-1, 1]) { seg(S, GX + s * 0.5, g0 + 0.85, gz0, GX + s * 0.5, g1 + 0.85, gz1, 0.04, STEELL); seg(S, GX + s * 0.5, g0, gz0, GX + s * 0.5, g1, gz1, 0.05, P.steelDark);
      S.box(0.04, 0.85, 0.04, STEELL, GX + s * 0.5, g0, gz0); S.box(0.04, 0.85, 0.04, STEELL, GX + s * 0.5, g1, gz1); }
  }
  // ---- ladders
  for (const x of [-51.0, 11.4, 48.9]) { if (slot(x, 0.4, 'ladder')) { gap(x, 0.5); ladder(S, x); F.box(0.9, 0.004, 0.5, 0xf6c453, x, TOP, QZ - 0.5); } }

  // ---- boats and their lines.  bollard(x) places a mooring bollard on the quay edge and returns its world point.
  const bollards = [];
  const bollard = (x) => {
    if (!bollards.includes(x)) { if (!slot(x, 0.3, 'bollard')) return null; bollards.push(x); }
    return [x, BY, BZ];
  };
  const add = (g, ph, amp = 0.04) => { root.add(g); bobbers.push({ g, base: g.position.y, ph, amp }); };
  // fishing boat A alongside the quay (breast + spring lines)
  { const cx = -30.4, z = QZ + 1.2;
    const bw = bollard(cx - 2.6), sw = bollard(cx + 2.5);
    const lines = [];
    if (sw) lines.push({ c: [1.0, 0.62, 2.0], to: sw }); if (bw) lines.push({ c: [1.0, 0.62, -2.1], to: bw });
    add(makeBoat('fishing', cx, z, PI / 2, lines), 0.3, 0.045); }
  // sailboat alongside the quay
  { const cx = -14.0, z = QZ + 1.0, bs = bollard(cx - 2.6), bb = bollard(cx + 2.2), lines = [];
    if (bb) lines.push({ c: [0.62, 0.55, 1.7], to: bb }); if (bs) lines.push({ c: [0.62, 0.55, -1.9], to: bs });
    add(makeBoat('sail', cx, z, PI / 2, lines), 1.7, 0.05); }
  // launch + rowing boat at the pontoon (dock is north of them: local +x for yaw PI/2)
  { const pz = PON.z1 - 0.1, lines = [];
    const cx = -44.4, z = PON.z1 + 0.15 + 0.75;
    lines.push({ c: [0.65, 0.5, 1.4], to: [cx + 1.8, PON.top + 0.12, pz], slack: 0.05 }, { c: [0.65, 0.5, -1.4], to: [cx - 1.6, PON.top + 0.12, pz], slack: 0.05 });
    add(makeBoat('launch', cx, z, PI / 2, lines), 2.1, 0.035);
    const rx = -41.6, rz = PON.z1 + 0.15 + 0.5;
    add(makeBoat('row', rx, rz, PI / 2, [{ c: [0.52, 0.34, 1.1], to: [rx + 1.1, PON.top + 0.12, pz], slack: 0.04 }]), 2.9, 0.03); }
  // pier 1: launch on the west side, rowing boat on the east side
  { const px = PIERS[0].x, hw = PIERS[0].w / 2;
    const lx = px - hw - 0.2 - 0.75, lz = 21.8;
    add(makeBoat('launch', lx, lz, 0, [{ c: [0.7, 0.5, 1.3], to: [px - hw, 0.15, lz + 1.5], slack: 0.05 }, { c: [0.7, 0.5, -1.3], to: [px - hw, 0.15, lz - 1.4], slack: 0.05 }],
      { top: 0xf2f0e6, stripe: 0xe5484d, roof: P.teal }), 0.8, 0.04);
    const rx = px + hw + 0.2 + 0.5, rz = 20.9;
    add(makeBoat('row', rx, rz, PI, [{ c: [0.5, 0.34, 1.0], to: [px + hw, 0.15, rz - 1.1], slack: 0.04 }]), 3.6, 0.03); }
  // sailboat on a mooring ball
  { const bx = 8.4, bz = 24.6;
    add(makeBoat('sail', bx, bz - 2.9, 0.06, [{ c: [0, 0.5, 2.2], to: [bx, WATER_Y + 0.3, bz], slack: 0.02 }]), 4.2, 0.05);
    const b = new Builder();
    b.cyl(0.22, 0.26, 0.3, 0xf2813a, 0, -0.1, 0, 8); b.cyl(0.22, 0.22, 0.12, CREAM, 0, 0.2, 0, 8); b.cyl(0.03, 0.03, 0.25, P.steelDark, 0, 0.32, 0, 4);
    const g = new THREE.Group(); g.add(mesh(b.build(), litMat, { cast: false })); g.position.set(bx, WATER_Y + 0.12, bz); add(g, 0.9, 0.05); }
  // pier 2: fishing boat on the east side, launch on the west side
  { const p = PIERS[1], hw = p.w / 2;
    const fx = p.x + hw + 0.2 + 1.15, fz = 21.6;
    add(makeBoat('fishing', fx, fz, PI, [{ c: [-1.0, 0.62, 2.0], to: [p.x + hw, 0.15, fz - 2.4], slack: 0.05 }, { c: [-1.0, 0.62, -2.0], to: [p.x + hw, 0.15, fz + 2.3], slack: 0.05 }]), 5.1, 0.045);
    const lx = p.x - hw - 0.25 - 0.75, lz = 22.8;
    add(makeBoat('launch', lx, lz, 0, [{ c: [0.65, 0.5, 1.3], to: [p.x - hw, 0.15, lz + 1.4], slack: 0.05 }, { c: [0.65, 0.5, -1.3], to: [p.x - hw, 0.15, lz - 1.4], slack: 0.05 }],
      { top: 0xd9e8ee, stripe: 0x2f6fb5, roof: 0x2f6fb5 }), 1.3, 0.04); }
  // launch alongside the quay near the ferry
  { const cx = 45.0, bs = bollard(cx - 2.2), bb = bollard(cx + 2.0), lines = [];
    if (bb) lines.push({ c: [0.62, 0.5, 1.5], to: bb }); if (bs) lines.push({ c: [0.62, 0.5, -1.5], to: bs });
    add(makeBoat('launch', cx, QZ + 0.95, PI / 2, lines, { top: P.accent, stripe: NAVY, roof: NAVY }), 3.3, 0.04); }
  // fishing boat on a mooring ball at the west end, rowing boat tied to the ladder
  { const bx = -57.2, bz = 24.6;
    add(makeBoat('fishing', bx + 0.35, bz - 3.15, 0.12, [{ c: [0, 0.5, 2.5], to: [bx, WATER_Y + 0.3, bz], slack: 0.02 }]), 0.6, 0.045);
    const b = new Builder();
    b.cyl(0.22, 0.26, 0.3, 0xf2813a, 0, -0.1, 0, 8); b.cyl(0.22, 0.22, 0.12, CREAM, 0, 0.2, 0, 8); b.cyl(0.03, 0.03, 0.25, P.steelDark, 0, 0.32, 0, 4);
    const g = new THREE.Group(); g.add(mesh(b.build(), litMat, { cast: false })); g.position.set(bx, WATER_Y + 0.12, bz); add(g, 2.4, 0.05);
    add(makeBoat('row', -51.9, QZ + 0.85, PI / 2, [{ c: [0.52, 0.34, 1.2], to: [-51.0, TOP + 0.1, QZ - 0.3], slack: 0.05 }]), 4.8, 0.03); }
  // channel buoys out in the water (red to the west, green to the east)
  for (const [x, z, c, ph] of [[-38, 24.0, 0xe5484d, 0.5], [22.5, 26.0, 0x56b97a, 2.2], [-8.5, 23.5, 0xe5484d, 4.0], [41, 24.0, 0x56b97a, 5.4]]) {
    const b = new Builder();
    b.cyl(0.22, 0.28, 0.5, c, 0, -0.2, 0, 8); b.cyl(0.18, 0.2, 0.16, CREAM, 0, 0.3, 0, 8); b.cyl(0.03, 0.03, 0.55, P.steelDark, 0, 0.46, 0, 4); b.box(0.16, 0.16, 0.16, c, 0, 1.0, 0);
    const g = new THREE.Group(); g.add(mesh(b.build(), litMat, { cast: false })); g.position.set(x, WATER_Y + 0.14, z); add(g, ph, 0.05);
  }

  // ---- quay furniture, in the free slots
  // bait / fish stall
  if (slot(25.9, 1.1, 'stall')) {
    gap(25.9, 1.0);
    const sx = 25.9, sz = 16.68;
    S.box(1.7, 0.78, 0.5, P.wood, sx, TOP, sz); S.box(1.8, 0.07, 0.6, P.woodDark, sx, TOP + 0.78, sz);
    S.box(1.7, 0.05, 0.04, CORAL, sx, TOP + 0.5, sz + 0.26);
    fishBox(S, sx - 0.5, sz, 0.1, TOP + 0.85, 0x4fa3c7); fishBox(S, sx + 0.35, sz + 0.02, -0.1, TOP + 0.85, 0xf2813a);
    S.box(0.4, 0.14, 0.32, 0xd9e8ee, sx + 0.72, TOP + 0.85, sz - 0.04);                                // bait tubs
    S.cyl(0.14, 0.12, 0.2, 0x2f6fb5, sx - 0.05, TOP + 0.85, sz - 0.1, 8);
    for (const s of [-0.78, 0.78]) S.box(0.05, 0.62, 0.05, P.woodDark, sx + s, TOP + 0.85, sz - 0.02);  // sign posts
    S.box(1.64, 0.06, 0.05, P.woodDark, sx, TOP + 1.43, sz - 0.02);
    for (const ry of [0, PI]) { S.push(sx, 0, sz - 0.02, ry); signs.quad(S, 'FRESH BAIT', { bg: CREAM, fg: NAVY, border: CORAL }, 1.5, 0.38, 0, TOP + 1.2, 0.045); S.pop(); }
    solidRect(sx, sz, 1.8, 0.6);
    for (let i = 0; i < 3; i++) { S.cyl(0.05, 0.05, 0.12, i % 2 ? 0xf2813a : CREAM, sx - 0.7 + i * 0.1, TOP + 0.92, sz + 0.2, 6, PI / 2); }
  }
  // stacked fish boxes + crates + nets
  if (slot(16.5, 0.55, 'fishboxes')) {
    for (let i = 0; i < 3; i++) fishBox(S, 16.3, 16.72, 0.05 * i, TOP + i * 0.25, i === 1 ? 0xf2813a : 0x4fa3c7);
    fishBox(S, 16.95, 16.72, -0.1, TOP, 0x4fa3c7); fishBox(S, 16.95, 16.72, 0.05, TOP + 0.25, 0x4fa3c7);
    solidRect(16.6, 16.72, 1.3, 0.5);
  }
  if (slot(13.6, 0.6, 'crates')) { crate(S, 13.35, 16.72, 0.2, 0.5, P.wood, TOP); crate(S, 13.95, 16.7, 0.7, 0.42, P.wood, TOP); crate(S, 13.65, 16.72, 0.4, 0.4, P.wood, TOP + 0.5); solidRect(13.65, 16.7, 1.3, 0.55); }
  if (slot(10.2, 0.5, 'net')) coil(S, 10.2, 16.7, 0.42, 0x6f8f7a, rnd);
  if (slot(-39.0, 0.6, 'net2')) netHeap(S, -39.0, 16.7, rnd);
  if (slot(-54.0 - 4.5, 0.6, 'net3')) coil(S, -58.5, 16.7, 0.42, 0x7ea48b, rnd);
  if (slot(44.9, 0.9, 'crates2')) { crate(S, 44.5, 16.72, 0.3, 0.45, P.wood, TOP); fishBox(S, 45.3, 16.72, 0.2, TOP, 0x4fa3c7); solidRect(44.9, 16.72, 1.3, 0.5); }
  // benches facing the water
  for (const x of [-42.0, -23.4, 18.4, 31.9]) if (slot(x, 0.9, 'bench')) bench(S, x, 16.64, 0);
  // life rings
  for (const x of [-24.0 + 1.5, 6.0, 31.0 - 3.0]) if (slot(x, 0.35, 'ring')) lifeRing(S, x, 16.78, 0);
  // stand-alone mooring bollards in free slots (every ~7 m)
  for (let x = QX0 + 2; x < QX1; x += 7.3) if (free(x, 0.4) && !bollards.includes(x)) { take(x, 0.4); bollards.push(x); }
  for (const x of bollards) { S.cyl(0.13, 0.16, 0.3, 0x3a4048, x, TOP, BZ, 8); S.cyl(0.19, 0.19, 0.07, 0x3a4048, x, TOP + 0.3, BZ, 8); S.cyl(0.19, 0.19, 0.02, P.accent, x, TOP + 0.37, BZ, 8); }

  // ---- lamp posts on the kerb of the quay side (arm over the road), in whatever x slots are still free
  for (let x = -58.0; x < QX1 - 0.5; x += 9.6) {
    const lx = x + ((x * 7.13) % 1) * 0.0;
    if (!free(lx, 0.7)) continue;
    take(lx, 0.7); lampPost(S, G, lx, 15.84, 0);
  }
  // ---- quay rail (gaps at cars, wrenches, ladders, gangway, pier roots, stall)
  {
    gaps.sort((a, b) => a[0] - b[0]);
    const runs = []; let s = QX0;
    for (const [a, b] of gaps) { if (a > s) runs.push([s, a]); s = Math.max(s, b); }
    if (s < QX1) runs.push([s, QX1]);
    const RZ = QZ - 0.07, RC = 0x4d6a82;
    for (const [a, b] of runs) {
      if (b - a < 0.2) continue;
      const n = Math.max(1, Math.ceil((b - a) / 1.6));
      for (let i = 0; i <= n; i++) {
        const x = a + ((b - a) * i) / n, end = i === 0 || i === n;
        S.box(end ? 0.09 : 0.06, 0.95, end ? 0.09 : 0.06, RC, x, TOP, RZ);
      }
      S.box(b - a, 0.05, 0.05, CREAM, (a + b) / 2, TOP + 0.9, RZ);
      S.box(b - a, 0.03, 0.03, RC, (a + b) / 2, TOP + 0.5, RZ);
    }
  }
  // ---- ferry plaza: bollards on the two water edges, safety edge lines, drains (the centre stays free for the terminal)
  {
    const FP = TOWN.ferryPlaza, wr = TOWN.wrenches.filter((w) => w.x > FP.minX && w.z > FP.minZ);
    const okPt = (x, z) => !wr.some((w) => Math.hypot(w.x - x, w.z - z) < 1.6);
    const bol = (x, z) => {
      S.cyl(0.14, 0.18, 0.34, 0x3a4048, x, TOP, z, 8); S.cyl(0.21, 0.21, 0.08, 0x3a4048, x, TOP + 0.34, z, 8); S.cyl(0.21, 0.21, 0.02, P.accent, x, TOP + 0.42, z, 8);
    };
    for (let z = FP.minZ + 2.4; z < FP.maxZ - 0.5; z += 2.5) if (okPt(FP.minX + 0.35, z)) bol(FP.minX + 0.35, z);
    for (let x = FP.minX + 1.6; x < FP.maxX - 0.3; x += 2.5) if (okPt(x, FP.maxZ - 0.35)) bol(x, FP.maxZ - 0.35);
    F.box(0.08, 0.004, FP.maxZ - FP.minZ - 2.0, 0xf6c453, FP.minX + 0.12, TOP, (FP.minZ + FP.maxZ) / 2 + 1.0);
    F.box(FP.maxX - FP.minX - 0.4, 0.004, 0.08, 0xf6c453, (FP.minX + FP.maxX) / 2 + 0.2, TOP, FP.maxZ - 0.12);
    for (const [x, z] of [[FP.minX + 1.4, 19.5], [58.0, FP.maxZ - 1.2], [FP.maxX - 0.8, 17.2]]) drainGrate(F, x, z, 0);
  }
  // ---- distance
  rubbleMole(S, rnd, -72, -45, 27.2, 3.0); lighthouse(S, G, -44, 27.2);
  rubbleMole(S, rnd, 52, 78, 27.6, 3.0); beacon(S, G, 51.4, 27.6, 0xe5484d);
  rubbleMole(S, rnd, 10, 20, 26.8, 1.6); beacon(S, G, 21.0, 26.8, 0x56b97a);
  farShore(S, G, rnd);

  function update(dt, t) {
    for (const b of bobbers) {
      b.g.position.y = b.base + Math.sin(t * 1.4 + b.ph) * b.amp;
      b.g.rotation.z = Math.sin(t * 1.1 + b.ph) * 0.045;
      b.g.rotation.x = Math.sin(t * 0.9 + b.ph * 1.3) * 0.028;
    }
    for (const f of flags) { f.m.rotation.y = Math.sin(t * 3.1 + f.ph) * 0.3 - 0.2; f.m.scale.x = 0.9 + Math.sin(t * 5.3 + f.ph) * 0.08; }
    vane.rotation.y = Math.sin(t * 0.35) * 0.9 + 0.6;
  }
  return { update };
}
