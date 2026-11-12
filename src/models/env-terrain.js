// Terrain around the town (owner: env). The town sits in a cove: rock cliffs along x = +/-TOWN.edge.tunnelX with
// the four tunnel mouths set into them, headlands running out into the sea, and a green hill rising north of a row
// of backdrop houses. Also the quay's structural edge (coping + wall) and the ferry plaza slab.
// Everything derives from config.town.js; nothing here is taller than a kerb inside TOWN.bounds.
import * as THREE from 'three';
import { PALETTE as P } from '../config.js';
import { TOWN } from '../config.town.js';
import { litMat, mulberry32 } from './voxel.js';
import { PI, Y, mix, pick, tree, pine, bush, rock, LEAF } from './env-kit.js';

const R = TOWN.roads;
export const CLIFF_X = TOWN.edge.tunnelX;          // 64: cliff face / tunnel portals
const NORTH_Z = -50;                              // the north hill starts rising here (backdrop houses in front)
const QUAY_Z = TOWN.water[0].minZ;                // 17.0
const WATER_Y = -0.4;
const PLAZA = TOWN.ferryPlaza;

// ------------------------------------------------------------------ noise
function valueNoise(seed) {
  const rnd = mulberry32(seed), N = 64, g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = rnd() * 2 - 1;
  const at = (i, j) => g[((i % N + N) % N) + ((j % N + N) % N) * N];
  const s = (t) => t * t * (3 - 2 * t);
  return (x, z) => {
    const i = Math.floor(x), j = Math.floor(z), fx = s(x - i), fz = s(z - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}
const n1 = valueNoise(11), n2 = valueNoise(23);
const fbm = (x, z) => n1(x / 9, z / 9) * 0.65 + n2(x / 3.7, z / 3.7) * 0.35;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Height of the cliff top along the cliff face: tall around the two street tunnels, lower in between. */
export function cliffTop(z) {
  const k = Math.max(smooth(1 - (Math.abs(z - R.harbor.z) - 4.5) / 5), smooth(1 - (Math.abs(z - R.main.z) - 4.5) / 5));
  const south = z > QUAY_Z + 6 ? Math.max(0.35, 1 - (z - QUAY_Z - 6) / 26) : 1;   // the headland falls towards its tip
  return (4.2 + k * 2.8 + fbm(z * 0.7, 3.1) * 0.6) * south;
}

/**
 * Terrain height outside the town (y). Returns -Infinity where there is no terrain (town, harbor water).
 * Side hills behind the cliffs (|x| > CLIFF_X) and the north hill (z < NORTH_Z).
 */
export function terrainH(x, z) {
  const ax = Math.abs(x);
  let h = -Infinity;
  const d = ax - (CLIFF_X + 0.4);
  if (d >= 0 && z < 48) {
    const top = cliffTop(Math.min(z, 46));
    const southFade = z > QUAY_Z ? Math.max(0, 1 - (z - QUAY_Z) / 30) : 1;
    h = top + (9 + 6 * southFade) * (1 - Math.exp(-d / 11)) * southFade + fbm(x, z) * 1.6 * Math.min(1, d / 5);
    if (z > 36) h -= (z - 36) * 0.32;              // the headland tip runs down under the sea
  }
  const n = NORTH_Z - z;
  if (n >= 0) {
    const hn = 15 * (1 - Math.exp(-n / 13)) + fbm(x + 40, z) * 1.8 * Math.min(1, n / 6);
    h = Math.max(h, hn);
  }
  return h;
}

// grass by height, rock on steep faces, sand / wet rock near the water line
const GRASS = [0x6fbf86, 0x5fb27a, 0x7cc690, 0x58a874];
function terrainColor(h, slope, x, z) {
  const v = n2(x / 2.1, z / 2.1);
  if (slope > 1.25) return mix(0xa9b1ad, 0x8f9790, 0.5 + v * 0.5);
  if (h < 0.6 && z > QUAY_Z - 2) return h < 0 ? mix(0x8a8f84, 0x6f7a72, 0.5 + v * 0.5) : mix(0xd9cba8, 0xc9b994, 0.5 + v * 0.5);
  const g = GRASS[(Math.abs(Math.floor(v * 7 + h)) | 0) % GRASS.length];
  // the foot of a slope blends into the town's sea-glass ground; higher up it turns greener, then darker
  const foot = mix(P.outside, g, smooth(h / 3));
  return mix(foot, 0x3f8f63, Math.min(0.45, Math.max(0, (h - 6) / 20)));
}

/** Heightfield chunks (one mesh per ~30 m tile, flat-shaded vertex colours), skipping the town and open water. */
export function buildTerrain(root) {
  const STEP = 2.5, TILE = 30;
  const X0 = -125, X1 = 125, Z0 = -100, Z1 = 50;
  let tris = 0, meshes = 0;
  const pos = [], col = [];
  const c = new THREE.Color();
  for (let tx = X0; tx < X1; tx += TILE) for (let tz = Z0; tz < Z1; tz += TILE) {
    pos.length = 0; col.length = 0;
    for (let x = tx; x < Math.min(tx + TILE, X1) - 1e-6; x += STEP) for (let z = tz; z < Math.min(tz + TILE, Z1) - 1e-6; z += STEP) {
      const xa = x, xb = x + STEP, za = z, zb = z + STEP;
      const h00 = terrainH(xa, za), h10 = terrainH(xb, za), h01 = terrainH(xa, zb), h11 = terrainH(xb, zb);
      if (![h00, h10, h01, h11].every(Number.isFinite)) continue;
      const quad = [[xa, h00, za], [xb, h10, za], [xb, h11, zb], [xa, h01, zb]];
      for (const [p, q, r] of [[0, 2, 1], [0, 3, 2]]) {
        const A = quad[p], B = quad[q], C = quad[r];
        const hmax = Math.max(A[1], B[1], C[1]), hmin = Math.min(A[1], B[1], C[1]);
        const slope = (hmax - hmin) / STEP;
        c.set(terrainColor((A[1] + B[1] + C[1]) / 3, slope, (A[0] + B[0] + C[0]) / 3, (A[2] + B[2] + C[2]) / 3));
        for (const V of [A, B, C]) { pos.push(V[0], V[1], V[2]); col.push(c.r, c.g, c.b); }
      }
    }
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, litMat);
    m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false;
    root.add(m);
    tris += pos.length / 9; meshes++;
  }
  return { tris, meshes };
}

// ------------------------------------------------------------------ cliffs + tunnels
const TUNNEL = { halfW: 2.2, spring: 2.4, wallHalfW: 4.6, wallH: 7.6, wallD: 1.2, tubeLen: 36, shellHalfW: 3.1, shellH: 5.6 };
/** Arch outline points (z, y) of the tunnel opening: straight sides up to the spring line, then a round top. */
function archPts(hw, spring, seg = 12) {
  const pts = [[-hw, -0.06], [hw, -0.06], [hw, spring]];
  for (let i = 1; i < seg; i++) { const a = (i / seg) * PI; pts.push([Math.cos(a) * hw, spring + Math.sin(a) * hw]); }
  pts.push([-hw, spring]);
  return pts;
}
function shapeWithHole(outer, hole) {
  const s = new THREE.Shape();
  outer.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const h = new THREE.Path();
  [...hole].reverse().forEach(([x, y], i) => (i ? h.lineTo(x, y) : h.moveTo(x, y)));
  h.closePath();
  s.holes.push(h);
  return s;
}
/** Roads that run into the cliffs: z centre of each street. */
export const TUNNEL_ROADS = [R.harbor.z, R.main.z];
const inPortal = (z) => TUNNEL_ROADS.some((c) => Math.abs(z - c) < TUNNEL.wallHalfW + 0.2);

/**
 * Tunnel portal + tube at side s (+1 east, -1 west) for the street at z = c. The tube is a closed arch shell
 * (walls + vault) running TUNNEL.tubeLen into the hill, dark inside with lamps, so a car spawning at TOWN.edge.westX /
 * eastX is hidden until it rolls out of the mouth.
 */
function tunnel(S, F, G, s, c) {
  const T = TUNNEL, x0 = s * (CLIFF_X - T.wallD + 0.4);          // headwall front face (town side)
  const ry = s > 0 ? PI / 2 : -PI / 2;                             // shape X -> world z, extrusion -> world s * x
  const hole = archPts(T.halfW, T.spring);
  const CONC = 0xcfc9bc, CONC_D = 0xb5ae9f, INNER = 0x2a2e35;
  // headwall with the arch opening
  const wall = shapeWithHole([[-T.wallHalfW, -0.06], [T.wallHalfW, -0.06], [T.wallHalfW, T.wallH], [-T.wallHalfW, T.wallH]], hole);
  S.shape(wall, T.wallD, CONC, x0, 0, c, 0, ry, 0);
  // arch ring (voussoirs) standing proud of the headwall, slightly darker
  const ringOuter = archPts(T.halfW + 0.45, T.spring);
  const ring = shapeWithHole(ringOuter, hole);
  S.shape(ring, 0.16, CONC_D, x0 - s * 0.16, 0, c, 0, ry, 0);
  // keystone + coping band + guard rail on top
  S.box(0.3, 0.7, 0.62, mix(CONC_D, 0x000000, 0.08), x0 - s * 0.2, T.spring + T.halfW + 0.05, c);
  S.box(T.wallD + 0.3, 0.22, T.wallHalfW * 2 + 0.3, CONC_D, x0 + s * (T.wallD / 2 - 0.15), T.wallH, c);
  for (let z = c - T.wallHalfW + 0.2; z <= c + T.wallHalfW - 0.1; z += 1.05) S.box(0.07, 0.9, 0.07, P.steelDark, x0 + s * 0.05, T.wallH + 0.22, z);
  S.box(0.08, 0.08, T.wallHalfW * 2 - 0.2, P.steelDark, x0 + s * 0.05, T.wallH + 1.05, c);
  S.box(0.06, 0.06, T.wallHalfW * 2 - 0.2, P.steelDark, x0 + s * 0.05, T.wallH + 0.62, c);
  // reflective hazard chevrons on both sides of the mouth (low, where drivers see them)
  for (const side of [-1, 1]) {
    const z = c + side * (T.halfW + 0.75);
    S.box(0.06, 0.9, 0.5, 0xf6c453, x0 - s * 0.05, 0.5, z);
    for (let i = 0; i < 3; i++) S.box(0.07, 0.12, 0.52, 0x2b3640, x0 - s * 0.06, 0.6 + i * 0.28, z, 0.5 * side * s, 0, 0);
  }
  // the tube: arch shell running into the hill, open at the mouth
  const shell = shapeWithHole([[-T.shellHalfW, -0.06], [T.shellHalfW, -0.06], [T.shellHalfW, T.shellH], [-T.shellHalfW, T.shellH]], hole);
  const tx0 = s * (CLIFF_X + 0.4);
  S.shape(shell, T.tubeLen, INNER, tx0, 0, c, 0, ry, 0);
  // backfill between the headwall and the terrain grid (no slot to look down into): beside and above the tube
  const bx = s * (CLIFF_X + 1.15), bw = 1.6, topY = cliffTop(c) + 0.9;
  for (const side of [-1, 1]) S.box(bw, topY + 0.05, T.wallHalfW - T.shellHalfW + 0.1, 0x9a978f, bx, -0.05, c + side * (T.shellHalfW + T.wallHalfW) / 2);
  S.box(bw, topY - T.shellH, T.shellHalfW * 2 + 0.05, 0x9a978f, bx, T.shellH, c);
  S.box(bw, 0.14, T.wallHalfW * 2, GRASS[0], bx, topY, c);
  // dark road + kerb strips inside (the asphalt plane runs on underneath)
  F.box(T.tubeLen + 0.6, 0.006, T.halfW * 2 - 0.02, 0x30333a, s * (CLIFF_X + T.tubeLen / 2), Y.mark + 0.004, c);
  for (const side of [-1, 1]) F.box(T.tubeLen + 0.6, 0.006, 0.12, 0x8d8a7f, s * (CLIFF_X + T.tubeLen / 2), Y.mark + 0.008, c + side * (T.halfW - 0.15));
  // lamps: a warm row on both walls, fading into the dark
  for (let k = 0; k < 7; k++) {
    const x = s * (CLIFF_X + 1.6 + k * 4.6);
    for (const side of [-1, 1]) G.box(0.5, 0.12, 0.08, k < 2 ? 0xffd88a : 0xf5b85a, x, T.spring + 0.3, c + side * (T.halfW - 0.05));
  }
}

/** Rock cliff faces along both town ends with the tunnels set into them. */
export function buildCliffs(S, F, G, rnd) {
  const ROCK = [0xa9a49a, 0x9a978f, 0xb6b0a3, 0x8e8b84, 0xa39d8f];
  for (const s of [-1, 1]) {
    for (const c of TUNNEL_ROADS) tunnel(S, F, G, s, c);
    let z = -58;
    while (z < 46) {
      const w = 1.4 + rnd() * 1.4, zc = z + w / 2;
      z += w;
      if (inPortal(zc)) continue;
      const top = cliffTop(zc) + 0.7 + rnd() * 0.6;
      const wet = zc > QUAY_Z - 0.5;
      const y0 = wet ? -1.3 : -0.05;
      const front = CLIFF_X - 0.55 - rnd() * 0.55, back = CLIFF_X + 1.9;
      const col = pick(rnd, ROCK);
      // main block + a stepped upper block set back a little + a ledge, for a chunky layered face
      const bx = (front + back) / 2;
      S.box(back - front, top - y0, w + 0.08, col, s * bx, y0, zc, 0, 0, 0);
      const f2 = front + 0.3 + rnd() * 0.5;
      S.box(back - f2, 0.5 + rnd() * 0.6, w * (0.6 + rnd() * 0.35), mix(col, 0xffffff, 0.08), s * (f2 + back) / 2, top - 0.2, zc + (rnd() - 0.5) * 0.4);
      if (rnd() > 0.45) S.box(0.5, 0.18, w * 0.8, mix(col, 0x000000, 0.12), s * (front - 0.1), y0 + 0.6 + rnd() * (top - y0 - 1.6), zc);
      // grass lip on top and an occasional bush hanging over the edge
      S.box(back - front - 0.3, 0.14, w + 0.1, pick(rnd, GRASS), s * (bx + 0.15), top + (top > 2 ? 0.25 : 0.1), zc);
      if (rnd() > 0.55) bush(S, s * (front + 0.6), zc, 0.8 + rnd() * 0.4, rnd, null, top + 0.3);
      // seaweed / wet line where the cliff stands in the water
      if (wet) S.box(0.12, 0.35, w + 0.08, 0x4d6b5c, s * (front - 0.02), WATER_Y - 0.15, zc);
    }
  }
}

// ------------------------------------------------------------------ quay edge + ferry plaza (structure only)
const COPE = [0xd8d2c4, 0xcdc6b6, 0xd3ccbd];
const QWALL = 0xa49d8f, SLIME = 0x5e7468, WET = 0x8a877c;
/** Coping stones along a run (axis 'x' or 'z') with the wall face beneath on the water side (sgn = +1 / -1). */
function quayRun(S, rnd, axis, from, to, at, sgn) {
  const put = (a, b, c0, c1, y, h, col) => (axis === 'x'
    ? S.box(b - a, h, c1 - c0, col, (a + b) / 2, y, (c0 + c1) / 2)
    : S.box(c1 - c0, h, b - a, col, (c0 + c1) / 2, y, (a + b) / 2));
  const cIn = at - sgn * 0.35, cOut = at + sgn * 0.05;              // coping overhangs the wall face by 5 cm
  const c0 = Math.min(cIn, cOut), c1 = Math.max(cIn, cOut);
  let i = 0;
  for (let a = from; a < to - 0.01; a += 1.2, i++) {
    const b = Math.min(a + 1.2, to);
    put(a + 0.02, b - 0.02, c0, c1, -0.12, 0.18, COPE[i % 3]);
    // wall face: dressed stone above, wet band + weed at the waterline below
    const w0 = Math.min(at - sgn * 0.3, at), w1 = Math.max(at - sgn * 0.3, at);
    put(a, b, w0, w1, -1.4, 1.28, i % 2 ? QWALL : mix(QWALL, 0x000000, 0.05));
    const f0 = Math.min(at, at + sgn * 0.02), f1 = Math.max(at, at + sgn * 0.02);
    put(a, b, f0, f1, WATER_Y - 0.12, 0.2, WET);
    put(a, b, f0, f1, WATER_Y - 0.32, 0.2, SLIME);
    if (i % 2 === 0) put(a, b, f0, f1, -0.24, 0.025, mix(QWALL, 0x000000, 0.18));   // stone course joint
    if (i % 8 === 3) {                                                                // storm drain outlet
      const m = (a + b) / 2, g0 = Math.min(at, at + sgn * 0.06), g1 = Math.max(at, at + sgn * 0.06);
      put(m - 0.2, m + 0.2, g0, g1, -0.38, 0.26, 0x3a3f45);
      put(m - 0.14, m + 0.14, g0 - 0.01, g1 + 0.01, -0.34, 0.18, 0x1d2126);
    }
  }
}

/**
 * Quay along the whole of Harbor St (coping + wall where land meets water at TOWN.water), the ferry plaza slab with
 * its own walls (land from TOWN.ferryPlaza out to the east cliff), all flush with the sidewalk.
 */
export function buildQuay(root, S, F, rnd, surface) {
  const z = QUAY_Z, west = -(CLIFF_X - 0.75);
  const pX = PLAZA.minX - 0.35, pZ = PLAZA.maxZ + 0.35, east = CLIFF_X - 0.6;
  // main quay: from the west cliff to the plaza corner
  quayRun(S, rnd, 'x', west, pX, z, 1);
  // plaza: slab under the paving (inside its walls), coping + wall on its west and south edges
  S.box(east - pX - 0.1, 1.3, pZ - z + 0.2, 0x9c968a, (pX + east) / 2 + 0.05, -1.4, (z - 0.25 + pZ - 0.05) / 2);
  quayRun(S, rnd, 'z', z - 0.35, pZ - 0.35, pX, -1);
  quayRun(S, rnd, 'x', pX - 0.05, east, pZ, 1);
  // plaza paving beyond the ferry plot, up to the cliff foot (outside the bounds, seen from the plaza)
  root.add(surface('plaza', PLAZA.maxX, east, PLAZA.minZ + 1.2, PLAZA.maxZ, Y.lot));
}
