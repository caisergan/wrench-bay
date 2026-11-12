// Filler buildings (owner: env): the Main Street corner shop fronts and the avenue houses on TOWN.fillers, the
// paved nooks between the Main Street plots, and the residential backdrop north of the bounds (Rope Walk lane,
// houses, houses on the hill). All from config.town.js; the plots themselves stay empty.
import { PALETTE as P } from '../config.js';
import { TOWN, PROPERTIES, SERVICES } from '../config.town.js';
import {
  PI, CREAM, NAVY, CORAL, Y, mix, pick, building, SHOP_STYLES, WALLS, ROOFS, tree, pine, bush, hedge, FLOWERS,
  mailbox, trashCan, acUnit, meterBox,
} from './env-kit.js';
import { terrainH, CLIFF_X } from './env-terrain.js';

const F_ = TOWN.fillers;
const fillerAt = (pred) => F_.find(pred);
// the four filler blocks by position
const NW = fillerAt((f) => f.maxX < 0 && f.maxZ < -24), NE = fillerAt((f) => f.minX > 0 && f.maxZ < -24);
const WF = fillerAt((f) => f.maxX < 0 && f.minZ > -20), EF = fillerAt((f) => f.minX > 0 && f.minZ > -20);
const SHOP_DEPTH = 2.2;                              // env-streets paves this strip in front of the corner shops

/** Picket fence (low, see-through) along x or z with optional gate gaps [a, b]. */
export function picket(S, axis, c, from, to, gaps = [], col = CREAM) {
  const inGap = (t) => gaps.some(([a, b]) => t > a && t < b);
  for (let t = from; t <= to + 1e-6; t += 0.32) {
    if (inGap(t)) continue;
    if (axis === 'x') S.box(0.07, 0.62, 0.05, col, t, 0, c); else S.box(0.05, 0.62, 0.07, col, c, 0, t);
  }
  const runs = [];
  let a = from;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > a) runs.push([a, g0]); a = Math.max(a, g1); }
  if (to > a) runs.push([a, to]);
  for (const [u, v] of runs) for (const y of [0.18, 0.45]) {
    if (axis === 'x') S.box(v - u, 0.06, 0.04, col, (u + v) / 2, y, c - 0.03); else S.box(0.04, 0.06, v - u, col, c - 0.03, y, (u + v) / 2);
  }
}

// invented shop names for the corner blocks (west -> east)
const SHOPS_NW = [
  { name: 'Salt & Crumb', prop: 'board', awning: [0xe58bb5, CREAM] },
  { name: 'Seaside Grocer', prop: 'crates', awning: [0x3d7a5e, CREAM] },
  { name: 'Bay Blooms', prop: 'flowers', awning: [CORAL, CREAM] },
];
const SHOPS_NE = [
  { name: 'Tide Pool Cafe', prop: 'board', awning: [P.teal, CREAM] },
  { name: 'Pier Books', prop: null, awning: [NAVY, P.accent] },
  { name: 'Lucky Knot', prop: 'barber', awning: [0x3c6e9e, CREAM] },
];

/** A row of shops with flats above along the south edge of a corner filler, facing Main Street (south). */
function cornerShops(S, F, G, signs, rnd, f, shops) {
  const z1 = f.maxZ - SHOP_DEPTH, z0 = f.minZ + 1.6, d = z1 - z0;
  const W = f.maxX - f.minX, ws = [0.32, 0.36, 0.32].map((k) => k * W);
  let x = f.minX;
  shops.forEach((sh, i) => {
    const w = ws[i] - 0.12, cx = x + ws[i] / 2, h = 5.3 + rnd() * 1.6;
    const style = SHOP_STYLES[(i * 2 + (f.minX > 0 ? 1 : 0)) % SHOP_STYLES.length];
    building(S, G, signs, cx, z0 + d / 2, 0, w, d, h, {
      rnd, shop: { name: sh.name, style, awning: sh.awning, prop: sh.prop === 'barber' ? null : sh.prop },
      roofType: i === 1 ? 'flat' : pick(rnd, ['gable', 'gableFront']), wall: WALLS[(i * 3 + (f.minX > 0 ? 2 : 0)) % WALLS.length],
      balcony: i === 1, sideWindows: i === 0 || i === 2,
    });
    if (sh.prop === 'barber') {                                        // barber pole beside the door
      const px = cx + 0.75, pz = z1 + 0.18;
      S.cyl(0.1, 0.1, 0.1, P.steel, px, 1.0, pz, 8);
      for (let k = 0; k < 5; k++) S.cyl(0.085, 0.085, 0.14, k % 2 ? CREAM : (k % 4 ? 0x3c6e9e : 0xe5484d), px, 1.1 + k * 0.14, pz, 8);
      S.cyl(0.11, 0.1, 0.08, P.steel, px, 1.8, pz, 8);
    }
    // cafe tables on the forecourt strip
    if (sh.name.includes('Cafe')) for (const tx of [cx - w / 2 + 0.8, cx + w / 2 - 0.8]) {
      S.cyl(0.03, 0.03, 0.72, P.steelDark, tx, 0, z1 + 1.35, 6); S.cyl(0.32, 0.32, 0.04, CREAM, tx, 0.72, z1 + 1.35, 10);
      for (const s of [-1, 1]) { S.box(0.34, 0.04, 0.34, P.teal, tx + s * 0.5, 0.42, z1 + 1.35); S.box(0.34, 0.4, 0.04, P.teal, tx + s * 0.5, 0.44, z1 + 1.35 - 0.17); for (const t of [-0.14, 0.14]) S.box(0.03, 0.42, 0.03, P.steelDark, tx + s * 0.5 + t, 0, z1 + 1.35 + 0.12); }
    }
    x += ws[i];
  });
  // back yards (behind, mostly hidden): bins and a shed against the rear wall
  for (let i = 0; i < 3; i++) trashCan(S, f.minX + 1.5 + i * (W - 3) / 2, f.minZ + 0.6, pick(rnd, [0x3d7a5e, 0x2f6fb5, P.steelDark]));
}

/** Two terraced houses on an avenue filler, fronts towards the avenue, a front garden behind a picket fence. */
function avenueHouses(S, F, G, signs, rnd, f, side) {
  // side = +1: avenue on the east (west filler); -1: avenue on the west (east filler)
  const front = side > 0 ? f.maxX - 2.5 : f.minX + 2.5;          // facade line, 2.5 m front garden
  const back = side > 0 ? f.minX + 0.4 : f.maxX - 0.4;
  const d = Math.abs(front - back), cx = (front + back) / 2, ry = side > 0 ? PI / 2 : -PI / 2;
  const houses = [{ z0: f.minZ + 0.5, z1: -13.0 }, { z0: -12.8, z1: f.maxZ - 0.6 }];
  const fenceX = side > 0 ? f.maxX - 0.15 : f.minX + 0.15;
  const gates = [];
  houses.forEach((hs, i) => {
    const w = hs.z1 - hs.z0, cz = (hs.z0 + hs.z1) / 2;
    building(S, G, signs, cx, cz, ry, w, d, 5.2 + i * 0.9 + rnd() * 0.5, {
      rnd, door: 'center', roofType: 'gable', wall: [0xf2cf7a, 0xa9c8e8, 0xe9a28e, 0xd9e4c4][(i + (side > 0 ? 0 : 2)) % 4],
      chimney: true, shutters: i ? P.teal : null,
    });
    gates.push([cz - 0.55, cz + 0.55]);
    // garden path, a bush either side, a mailbox at the gate
    const gx0 = Math.min(front, fenceX), gx1 = Math.max(front, fenceX);
    F.box(gx1 - gx0, 0.012, 0.9, 0xd2c3a6, (gx0 + gx1) / 2, Y.lot, cz);
    for (const s of [-1, 1]) bush(S, (gx0 + gx1) / 2, cz + s * (0.9 + rnd() * 0.6), 0.75, rnd, pick(rnd, FLOWERS));
    mailbox(S, fenceX - side * 0.25, cz + 0.85, side > 0 ? PI / 2 : -PI / 2);
  });
  // garden lawn strip + the fence along the sidewalk + a tree in the larger garden end
  picket(S, 'z', fenceX, f.minZ + 0.2, f.maxZ - 0.2, gates);
  tree(S, side > 0 ? f.maxX - 1.3 : f.minX + 1.3, f.maxZ - 1.0, 0.9, rnd);
  // side fence towards the gas station / quick-fit plot (south end) and the Main St sidewalk (north end)
  picket(S, 'x', f.maxZ - 0.1, f.minX + 0.2, f.maxX - 0.2, [], 0xe9e3d8);
}

export function buildFillers(root, { S, F, G }, signs, rnd) {
  if (NW) cornerShops(S, F, G, signs, rnd, NW, SHOPS_NW);
  if (NE) cornerShops(S, F, G, signs, rnd, NE, SHOPS_NE);
  if (WF) avenueHouses(S, F, G, signs, rnd, WF, 1);
  if (EF) avenueHouses(S, F, G, signs, rnd, EF, -1);
}

// ------------------------------------------------------------------ north backdrop (outside the bounds)
const BRICK = [0xb8634a, 0xa95a43, 0xc0705a];
const NORTH_ROW = [ // plots + services + corner fillers along Main Street's north side, sorted west -> east
  ...Object.values(PROPERTIES).filter((p) => p.district === 'main').map((p) => p.plot),
  ...Object.values(SERVICES).map((s) => s.plot),
  ...[NW, NE].filter(Boolean),
].sort((a, b) => a.minX - b.minX);

/** Gaps between the buildings north of Main Street: paved nooks, closed at the back by the garden wall. */
export function northNooks() {
  const out = [];
  for (let i = 0; i < NORTH_ROW.length - 1; i++) {
    const a = NORTH_ROW[i].maxX, b = NORTH_ROW[i + 1].minX;
    if (b - a > 0.3) out.push({ minX: a, maxX: b, minZ: TOWN.bounds.minZ, maxZ: NORTH_ROW[i].maxZ });
  }
  return out;
}

/**
 * Rear garden wall just outside the bounds, the Rope Walk lane behind it, a row of houses facing the lane, houses and
 * trees on the hill, bushes and scree at the cliff feet. Visible over the Main Street rooftops from every camera.
 */
export function buildBackdrop(root, { S, F, G }, signs, rnd, surface) {
  const zb = TOWN.bounds.minZ;                                   // -37.6
  const xw = -(CLIFF_X - 0.6), xe = CLIFF_X - 0.6;
  // paved nooks between the Main Street plots (wrench hiding spots; dressing is envdress's)
  for (const n of northNooks()) root.add(surface('alley', n.minX, n.maxX, n.minZ, n.maxZ - 0.01, Y.lot));
  // garden wall: brick with a stone cap, 1.3 m, in 2.4 m panels with piers
  const wz0 = zb - 0.32, wz1 = zb - 0.06;
  let i = 0;
  for (let x = xw; x < xe - 0.01; x += 2.4, i++) {
    const e = Math.min(x + 2.4, xe);
    S.box(e - x, 1.25, wz1 - wz0, BRICK[i % 3], (x + e) / 2, -0.04, (wz0 + wz1) / 2);
    S.box(e - x + 0.02, 0.08, wz1 - wz0 + 0.08, 0xd8d2c4, (x + e) / 2, 1.21, (wz0 + wz1) / 2);
    S.box(0.36, 1.42, 0.4, mix(BRICK[i % 3], 0x000000, 0.12), x, -0.04, (wz0 + wz1) / 2);
  }
  // Rope Walk: a narrow residential lane behind the wall
  const lz0 = zb - 3.0, lz1 = wz0;
  root.add(surface('asphalt', xw - 0.5, xe + 0.5, lz0, lz1, Y.road));
  F.box(xe - xw, 0.008, 0.08, 0xe9e3d8, 0, Y.mark, lz0 + 0.1);
  // row of houses on the north side of the lane, front gardens behind picket fences / hedges
  const hz1 = lz0 - 1.6;                                         // facades
  let x = xw + 0.4;
  let k = 0;
  while (x < xe - 4) {
    const w = Math.min(5.6 + rnd() * 3.2, xe - x - 0.2), d = 6.2 + rnd() * 1.6, h = 4.4 + rnd() * 2.6;
    if (w < 4) break;
    const cx = x + w / 2, cz = hz1 - d / 2;
    building(S, G, signs, cx, cz, 0, w, d, h, {
      rnd, roofType: pick(rnd, ['gable', 'gable', 'gableFront', 'flat']), wall: WALLS[(k * 7 + 3) % WALLS.length],
      roof: ROOFS[(k * 5 + 1) % ROOFS.length], balcony: h > 5.6 && rnd() > 0.5,
    });
    // front garden: path to the door, fence or hedge, a bush or a little tree
    if (k % 3 === 2) hedge(S, x + 0.1, x + w - 0.1, lz0 - 0.35, lz0 - 0.05, 0.6);
    else picket(S, 'x', lz0 - 0.2, x + 0.1, x + w - 0.1, [[cx - 0.6, cx + 0.6]], k % 2 ? CREAM : 0xd9e4c4);
    F.box(1.0, 0.012, lz0 - hz1, 0xd2c3a6, cx, Y.lot, (lz0 + hz1) / 2);
    if (rnd() > 0.45) bush(S, x + 0.8, lz0 - 0.9, 0.8, rnd, pick(rnd, FLOWERS));
    if (rnd() > 0.6) mailbox(S, cx + 0.95, lz0 - 0.45, 0);
    if (rnd() > 0.5) trashCan(S, x + w - 0.5, lz0 - 0.55, pick(rnd, [0x3d7a5e, 0x2f6fb5]));
    // side gap: a tree or a tall bush between neighbours
    const gap = 0.8 + rnd() * 1.4;
    if (gap > 1.2) tree(S, x + w + gap / 2, cz + 1.0, 0.8 + rnd() * 0.3, rnd);
    x += w + gap; k++;
  }
  // houses and trees on the hill (heights from the terrain; base at the lowest corner so nothing floats)
  const hill = [];
  for (let n = 0; n < 16; n++) {
    const hx = -60 + n * 8 + (rnd() - 0.5) * 3, hzz = -54 - rnd() * 7;
    const w = 5 + rnd() * 2.5, d = 5 + rnd() * 1.5, h = 4 + rnd() * 2;
    const ys = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].map(([a, b]) => terrainH(hx + a, hzz + b));
    const y0 = Math.min(...ys);
    if (!Number.isFinite(y0)) continue;
    hill.push({ x: hx, z: hzz, r: Math.max(w, d) / 2 + 0.8 });
    // plinth down into the slope + house
    S.box(w + 0.2, Math.max(...ys) - y0 + 0.6, d + 0.2, 0x8f8a80, hx, y0 - 0.5, hzz);
    building(S, G, signs, hx, hzz, 0, w, d, h, { rnd, y: Math.max(...ys) + 0.1, roofType: pick(rnd, ['gable', 'gableFront']), sideWindows: false });
  }
  const clear = (x, z) => !hill.some((hh) => Math.hypot(x - hh.x, z - hh.z) < hh.r);
  // trees: north slope (z -50 .. -68) and the cliff tops (|x| 64.5 .. 74)
  const plant = (x, z) => {
    const y = terrainH(x, z);
    if (!Number.isFinite(y) || y < 0.5 || !clear(x, z)) return;
    const r = rnd();
    if (r < 0.45) pine(S, x, z, 0.9 + rnd() * 0.6, rnd, y - 0.1);
    else if (r < 0.85) tree(S, x, z, 0.9 + rnd() * 0.5, rnd, P.woodDark, y - 0.1);
    else bush(S, x, z, 1.1, rnd, null, y - 0.05);
  };
  // (only where a game camera inside TOWN.camClamp can see: north to z ~ -64, cliff tops to |x| ~ 71)
  for (let z = -51; z > -65; z -= 2.6) for (let x = -72; x < 72; x += 2.8) if (rnd() > 0.35) plant(x + (rnd() - 0.5) * 2, z + (rnd() - 0.5) * 2);
  for (const s of [-1, 1]) for (let z = -50; z < 34; z += 2.4) for (let d = 65.5; d < 71; d += 2.7) if (rnd() > 0.3) plant(s * (d + rnd()), z + (rnd() - 0.5) * 1.6);
  // cliff feet: scree, rocks and bushes on the strip between the bounds and the rock face (dry land only)
  for (const s of [-1, 1]) for (let z = -48; z < TOWN.water[0].minZ - 0.5; z += 1.3) {
    if (Math.abs(z - TOWN.roads.harbor.z) < 3.5 || Math.abs(z - TOWN.roads.main.z) < 3.5) continue;   // roads + sidewalks
    const x0 = s * (TOWN.bounds.maxX + 0.2), x1 = s * (CLIFF_X - 0.7);
    const xx = x0 + (x1 - x0) * (0.35 + rnd() * 0.6);
    const r = rnd();
    if (r < 0.5) bush(S, xx, z, 0.8 + rnd() * 0.5, rnd, rnd() > 0.7 ? pick(rnd, FLOWERS) : null);
    else if (r < 0.75) S.box(0.5 + rnd() * 0.5, 0.3 + rnd() * 0.3, 0.5 + rnd() * 0.4, pick(rnd, [0xa9a49a, 0x9a978f, 0xb6b0a3]), xx, -0.05, z, 0, rnd(), 0);
  }
}
