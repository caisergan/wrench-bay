// Street furniture, alleys / back lane, garden park (owner: envdress agent).
// Same contract as env-harbor.js: buildStreetLife(env) -> { update(dt, t) } | void.
//   env = { root, S, F, G, signs, rnd, geo }; solid things go through addSolid / solidRect (env-kit.js).
// Everything that stands on the ground checks the keep-clear list below (cars, wrenches, plots, pads, crossings,
// driveway cuts, bus stops) before it is placed, so a clash drops the item instead of blocking gameplay.
import * as THREE from 'three';
import { PALETTE as P, LAYOUT as L } from '../config.js';
import { TOWN, PROPERTIES, SERVICES, RESCUE, DISTRICTS, LOUNGE, WASH } from '../config.town.js';
import { Builder, litMat, mesh, polygon } from './voxel.js';
import {
  PI, Y, CREAM, CORAL, NAVY, PAINTW, FLOWERS, LEAF, mix, pick, tree, bush, rock, hedge, bench, hydrant, mailbox, trashCan, parkingMeter,
  bollard, crate, pallet, dumpster, recyclingBins, acUnit, meterBox, electricCabinet, bikeRack, planterBox, cone, drum, tireStack,
  lampPost, lanternPost, drainGrate, stain, addSolid, solidRect,
} from './env-kit.js';
import { createBusStop } from './props-town.js';
import { seg } from './env-harbor.js';

const R = TOWN.roads, SW = TOWN.sidewalkWidth, HB = TOWN.homeBlock, A = TOWN.alleys;
const STEEL = P.steelDark;

// ------------------------------------------------------------------ keep-clear registry
function makeKeep() {
  const K = [];
  const rect = (minX, maxX, minZ, maxZ) => K.push([minX, maxX, minZ, maxZ]);
  const box = (x, z, hw, hd) => rect(x - hw, x + hw, z - hd, z + hd);
  const car = (x, z, yaw) => { const alongX = Math.abs(Math.sin(yaw)) > 0.5; box(x, z, alongX ? 1.95 : 1.15, alongX ? 1.15 : 1.95); };
  return {
    K, rect, box, car,
    /** true when a footprint hw x hd (half sizes) centred at x,z is clear of every keep rect. */
    ok(x, z, hw = 0.2, hd = 0.2) { return !K.some(([a, b, c, d]) => x + hw > a && x - hw < b && z + hd > c && z - hd < d); },
  };
}
function baseKeep() {
  const k = makeKeep();
  for (const s of RESCUE.spots) k.car(s.x, s.z, s.yaw);
  for (const p of TOWN.parking) k.car(p.x, p.z, p.yaw);
  for (const w of TOWN.wrenches) k.box(w.x, w.z, 1.2, 1.2);
  for (const p of [...Object.values(PROPERTIES), ...Object.values(SERVICES)]) {
    k.rect(p.plot.minX, p.plot.maxX, p.plot.minZ, p.plot.maxZ);
    for (const pad of [p.pad, p.upgradePad, p.managerPad]) if (pad) k.box(pad.x, pad.z, 1.3, 1.3);
  }
  for (const f of TOWN.fillers) k.rect(f.minX, f.maxX, f.minZ, f.maxZ);
  k.box(DISTRICTS.main.pad.x, DISTRICTS.main.pad.z, 1.6, 1.6);
  for (const b of TOWN.busStops) k.box(b.x, b.z, 4.6, 1.5);
  return k;
}

// replicas of the sidewalk cuts / crossings env-streets.js draws (driveways, zebra landings): nothing stands on them
const eX = L.carEntry[1].x, xX = L.carExit[0].x;
const HARBOR_CUTS = [[-55.8, -51.6], [-43.5, -40.9], [-19.9, eX + 1.0], [xX - 1.0, xX + 1.0], [17.4, 21.6], [A.east.minX, 30.6], [42.4, 44.6], [52.0, 55.5], [57.6, 59.8]];
const MAIN_N_CUTS = ['junkyard', 'depot', 'diner', 'academy', 'showroom'].map((id) => { const p = TOWN.parking.find((q) => q.id === id); return [p.x - 1.9, p.x + 1.9]; }).concat([[-37, -33], [31, 37]]);
const ZEB_H = [[-31.5, -28.9], [2.2, 4.8], [34.0, 36.6]];                 // Harbor St crossings (x ranges)
const ZEB_M = [[A.west.minX + 0.2, A.west.maxX - 0.2], [A.east.minX + 0.2, A.east.maxX - 0.2]];
const ZEB_W = [[8.6, 10.6], [-17.6, -15.6]];                              // avenue crossings (z ranges)
function streetKeep() {
  const k = baseKeep();
  k.rect(HB.minX, HB.maxX, HB.minZ, HB.maxZ);                             // the whole home block: alleys, lot, forecourt, back lane
  for (const [a, b] of HARBOR_CUTS) k.rect(a, b, 10.9, 11.75);
  for (const [a, b] of MAIN_N_CUTS) k.rect(a, b, -25.2, -23.8);
  for (const [a, b] of ZEB_H) { k.rect(a - 0.6, b + 0.6, 11.0, 11.8); k.rect(a - 0.6, b + 0.6, 15.4, 17.0); }
  for (const [a, b] of ZEB_M) { k.rect(a - 0.6, b + 0.6, -25.2, -23.8); k.rect(a - 0.6, b + 0.6, -20.2, -18.8); }
  for (const [a, b] of ZEB_W) for (const x of [R.west.x, R.east.x]) { k.rect(x - 3.2, x + 3.2, a - 0.6, b + 0.6); }
  k.rect(-51.2, -49.8, -3.6, 0.7);                                         // gas station driveway across the west sidewalk
  return k;
}

// ------------------------------------------------------------------ small street props of our own
function newsBox(S, x, z, ry = 0, col = 0xe5484d) {
  S.push(x, 0, z, ry);
  S.box(0.06, 0.5, 0.06, STEEL, -0.14, 0, 0); S.box(0.06, 0.5, 0.06, STEEL, 0.14, 0, 0);
  S.box(0.42, 0.55, 0.34, col, 0, 0.5, 0);
  S.box(0.46, 0.06, 0.38, mix(col, 0x000000, 0.3), 0, 1.05, 0);
  S.box(0.3, 0.26, 0.02, 0xd9e8ee, 0, 0.72, 0.175);
  S.box(0.12, 0.06, 0.02, 0x2b2f36, 0, 0.58, 0.175);
  S.pop();
}
function arrowPlate(S, x, y, z, rz) {
  S.box(0.3, 0.3, 0.04, 0x1f2329, x, y - 0.15, z);
  S.shape(polygon([[-0.11, -0.035], [0.02, -0.035], [0.02, -0.09], [0.12, 0], [0.02, 0.09], [0.02, 0.035], [-0.11, 0.035]]), 0.012, PAINTW, x, y, z + 0.04, 0, 0, rz);
}
const SIGN_ST = { bg: NAVY, fg: CREAM, border: CORAL };
/** Pole at a junction corner: two street-name blades (facing the camera) each with its one-way arrow. */
function cornerPole(S, signs, x, z, street, avenue, dirStreet, dirAve) {
  S.cyl(0.04, 0.05, 2.7, STEEL, x, 0, z, 6);
  S.cyl(0.07, 0.07, 0.06, CORAL, x, 2.7, z, 6);
  const rz = { '+x': 0, '-x': PI, '+z': -PI / 2, '-z': PI / 2 };
  for (const [name, dir, y] of [[street, dirStreet, 2.35], [avenue, dirAve, 1.97]]) {
    S.box(1.35, 0.3, 0.04, mix(NAVY, 0x000000, 0.2), x + 0.08, y - 0.15, z + 0.06);
    signs.quad(S, name, SIGN_ST, 1.0, 0.25, x - 0.1, y, z + 0.09);
    arrowPlate(S, x + 0.55, y, z + 0.05, rz[dir]);
  }
}

// ------------------------------------------------------------------ streets
function streetFurniture(env, k) {
  const { root, S, G, signs, rnd } = env;
  const put = (x, z, hw, hd, fn) => { if (!k.ok(x, z, hw, hd)) return false; fn(); k.box(x, z, hw, hd); return true; };
  const lamp = (x, z, ry) => put(x, z, 0.6, 0.6, () => lampPost(S, G, x, z, ry));
  const lantern = (x, z, ry) => put(x, z, 0.6, 0.4, () => lanternPost(S, G, x, z, ry));

  // ---- bus stops (glass shelters on the kerb, facing the road)
  for (const b of TOWN.busStops) {
    const g = createBusStop();
    g.position.set(b.x, 0, b.z); g.rotation.y = b.road === 'harbor' ? PI : 0;
    root.add(g);
  }

  // ---- Main Street: old-town lanterns on the north kerb, plain lamps on the south kerb, meters beside the kerb bays
  for (let x = -56.5; x < 58; x += 9.7) lantern(x, -24.12, 0);
  for (let x = -52.0; x < 58; x += 9.7) lamp(x, -19.88, 0);
  for (const s of RESCUE.spots.filter((r) => r.id[0] === 'm')) for (const d of [-2.45, 2.45]) put(s.x + d, -24.15, 0.25, 0.25, () => parkingMeter(S, s.x + d, -24.15, 0));
  for (const x of [-41.5, 21.2]) put(x, -24.15, 0.25, 0.25, () => hydrant(S, x, -24.15));
  for (const x of [-19.0, 12.5, 42.0, -48.0 + 0]) put(x, -24.2, 0.3, 0.3, () => trashCan(S, x, -24.2));
  put(-6.5, -24.2, 0.3, 0.3, () => mailbox(S, -6.5, -24.2, 0));
  put(40.0, -24.2, 0.3, 0.3, () => newsBox(S, 40.0, -24.2, 0));
  for (const x of [-30.0, -9.5, 3.0, 29.0]) put(x, -19.6, 0.4, 0.35, () => trashCan(S, x, -19.65, 0x2f6fb5));
  for (const x of [-37.5, -2.5, 47.5 - 4]) put(x, -19.5, 0.9, 0.3, () => bench(S, x, -19.35, PI));     // benches on the south walk, facing the road (north)
  for (const x of [-22.0, 18.0]) put(x, -19.5, 0.85, 0.3, () => hydrant(S, x, -19.9));
  for (const x of [-8.0, 33.0]) put(x, -19.5, 0.8, 0.28, () => { planterBox(S, x, -19.35, 1.4, 0.4, rnd); solidRect(x, -19.35, 1.4, 0.4); });
  for (const x of [-45.5, 45.5]) put(x, -19.5, 0.3, 0.3, () => newsBox(S, x + (x < 0 ? 0.0 : 0.0), -19.55, 0, 0x2f6fb5));

  // ---- Harbor Street north sidewalk is only 0.7 m wide: kerb-line hydrants only
  for (const x of [-34.5, 12.5]) put(x, 11.38, 0.2, 0.2, () => hydrant(S, x, 11.38));

  // ---- avenues: lamps on both kerbs (arms over the road), bins, hydrants, mailboxes, benches on the grass verge
  const AV = [
    { x: R.west.x + R.west.halfWidth + 0.25, ry: PI / 2 }, { x: R.west.x - R.west.halfWidth - 0.25, ry: -PI / 2 },
    { x: R.east.x - R.east.halfWidth - 0.25, ry: -PI / 2 }, { x: R.east.x + R.east.halfWidth + 0.25, ry: PI / 2 },
  ];
  AV.forEach((a, i) => { for (let z = -14.0 + (i % 2) * 4.7; z < 10.5; z += 9.4) lamp(a.x, z, a.ry); });
  const edge = (a) => a.x + (a.ry > 0 ? 0.05 : -0.05);
  AV.forEach((a, i) => {
    put(a.x, -11.5 + i * 0.0, 0.3, 0.3, () => trashCan(S, a.x + (a.ry > 0 ? 0.0 : 0.0), -11.5));
    put(a.x, 6.0 - (i % 2) * 2.0, 0.3, 0.3, () => hydrant(S, a.x, 6.0 - (i % 2) * 2.0));
  });
  put(AV[0].x, -2.5, 0.3, 0.3, () => mailbox(S, AV[0].x, -2.5, -PI / 2));
  put(AV[3].x, -2.5, 0.3, 0.3, () => newsBox(S, AV[3].x, -2.5, -PI / 2));
  put(AV[2].x, 3.0, 0.3, 0.3, () => mailbox(S, AV[2].x, 3.0, PI / 2));

  // ---- junction corners: street-name blades + one-way arrows (Harbor east, Main west, West Ave south, East Ave north)
  cornerPole(S, signs, -45.3, 11.3, 'HARBOR ST', 'WEST AVE', '+x', '+z');
  cornerPole(S, signs, -45.3, -19.7, 'MAIN ST', 'WEST AVE', '-x', '+z');
  cornerPole(S, signs, 45.4, 11.3, 'HARBOR ST', 'EAST AVE', '+x', '-z');
  cornerPole(S, signs, 45.4, -19.7, 'MAIN ST', 'EAST AVE', '-x', '-z');
}

// ------------------------------------------------------------------ alleys, back lane, plot gaps
function palletStack(S, x, z, ry, n, rnd) {
  pallet(S, x, z, ry, n);
  const top = n * 0.15 + 0.04;
  S.push(x, top, z, ry);
  crate(S, -0.25, 0.0, rnd() * 0.5, 0.45, P.wood, 0); crate(S, 0.25, 0.05, rnd() * 0.5, 0.4, P.woodDark, 0);
  if (rnd() > 0.5) crate(S, 0.0, 0.0, rnd(), 0.36, P.wood, 0.42);
  S.pop();
  solidRect(x, z, 1.2, 1.1, ry);
}
function drums(S, x, z, rnd, n = 3, cols = [P.teal, CORAL, P.accent, 0x3b82c4]) {
  for (let i = 0; i < n; i++) drum(S, x + (i % 2) * 0.62 - 0.3, z + ((i / 2) | 0) * 0.62 - 0.2, pick(rnd, cols));
  solidRect(x, z, 1.3, n > 2 ? 1.3 : 0.7);
}
function crateStack(S, x, z, ry, rnd, n = 3) {
  S.push(x, 0, z, ry);
  for (let i = 0; i < 2; i++) { const w = 0.5 + rnd() * 0.06; S.box(w, w, w, i ? P.wood : P.woodDark, 0, 0, -0.3 + i * 0.62, 0, (rnd() - 0.5) * 0.3); }
  if (n > 2) S.box(0.48, 0.48, 0.48, P.wood, 0.02, 0.5, -0.0, 0, 0.3);
  S.pop();
  solidRect(x, z, 0.7, 1.4, ry);
}
function shed(S, G, x, z, w, d, h, col) {
  const fz = d / 2;
  S.push(x, 0, z, 0); G.push(x, 0, z, 0);
  S.box(w, h, d, col, 0, 0, 0);
  S.box(w + 0.3, 0.12, d + 0.3, mix(col, 0x000000, 0.35), 0, h, 0);
  S.box(w + 0.3, 0.08, d + 0.3, 0x5c6670, 0, h + 0.12, 0, 0.0);
  S.box(0.95, 2.0, 0.06, mix(col, 0x000000, 0.4), -w / 2 + 0.9, 0, fz + 0.02);                 // back door
  S.box(1.2, 0.14, 0.5, 0xb8b0a2, -w / 2 + 0.9, 0, fz + 0.3);                                   // step
  S.box(0.06, 0.1, 0.06, STEEL, -w / 2 + 1.25, 1.0, fz + 0.07);
  G.box(0.26, 0.2, 0.1, 0xfff1b8, -w / 2 + 0.9, 2.12, fz + 0.1);                                // door lamp
  S.box(0.34, 0.06, 0.16, STEEL, -w / 2 + 0.9, 2.3, fz + 0.1);
  S.box(0.9, 0.5, 0.05, 0xd6dadc, w / 2 - 0.8, 1.1, fz + 0.02); G.box(0.7, 0.3, 0.03, 0x9fc8d6, w / 2 - 0.8, 1.2, fz + 0.06);
  S.cyl(0.05, 0.05, h + 0.3, STEEL, w / 2 - 0.12, 0, fz + 0.1, 6);                               // down pipe
  S.pop(); G.pop();
  solidRect(x, z, w + 0.2, d + 0.2);
}
function binStore(S, x, z, rnd) {
  const w = 3.0, d = 1.5, c = 0x8a6d4a;
  S.box(w, 1.3, 0.1, c, x, 0, z - d / 2);
  for (const s of [-1, 1]) S.box(0.1, 1.3, d, c, x + s * w / 2, 0, z);
  S.box(w + 0.2, 0.08, d + 0.2, 0x5c6670, x, 1.3, z - 0.05, -0.12);
  for (let i = 0; i < 3; i++) { const bx = x - 0.95 + i * 0.95; S.box(0.7, 0.95, 0.65, i === 1 ? 0x2f6fb5 : 0x3d7a5e, bx, 0, z - 0.1); S.box(0.74, 0.07, 0.68, 0x24262b, bx, 0.95, z - 0.1); }
  solidRect(x, z, w + 0.1, d);
}

function alleys(env) {
  const { S, F, G, rnd } = env;
  const k = baseKeep();
  const B = A.back, bz0 = B.minZ, bz1 = B.maxZ;
  k.rect(A.west.minX - 0.3, A.west.maxX + 0.3, bz0, bz1);          // alley mouths into the lane
  k.rect(A.east.minX - 0.3, A.east.maxX + 0.3, bz0, bz1);
  k.rect(-2.2, 2.2, -14.4, -12.8);                                  // SERVICE LANE ground text
  k.rect(-44.9, 44.9, bz0, -18.0);                                  // hoarding / Main St side
  const put = (x, z, hw, hd, fn) => { if (!k.ok(x, z, hw, hd)) return false; fn(); k.box(x, z, hw, hd); return true; };

  // ---- wrench nooks in the back lane: two clusters leave a small opening around the exact position
  const W = (id) => TOWN.wrenches.find((w) => w.id === id);
  { const w = W('w01');   // loading corner: dumpster + recycling to the south, pallets + barrels to the north
    put(w.x - 5.3, -13.45, 0.9, 0.6, () => dumpster(S, w.x - 5.3, -13.45, 0));
    put(w.x + 3.4, -13.35, 1.0, 0.45, () => recyclingBins(S, w.x + 3.4, -13.35, 0));
    put(w.x - 2.4, -17.2, 0.7, 0.7, () => palletStack(S, w.x - 2.4, -17.2, 0.1, 2, rnd));
    put(w.x + 2.6, -17.1, 0.8, 0.8, () => drums(S, w.x + 2.6, -17.1, rnd, 3));
  }
  { const w = W('w02');   // paint shop corner: paint drums + tyres on one side, pallets and a tarp heap on the other
    put(w.x - 2.5, -13.4, 0.8, 0.8, () => drums(S, w.x - 2.5, -13.5, rnd, 4));
    put(w.x + 2.7, -13.4, 0.5, 0.5, () => { tireStack(S, w.x + 2.7, -13.4, 4, rnd); tireStack(S, w.x + 3.4, -13.5, 3, rnd); solidRect(w.x + 3.05, -13.45, 1.4, 0.8); });
    put(w.x + 2.6, -17.3, 0.9, 0.7, () => { S.box(1.5, 0.55, 0.9, 0x5b8fb5, w.x + 2.6, 0, -17.3, 0, 0.15); S.box(1.2, 0.3, 0.7, 0x6fa3c9, w.x + 2.65, 0.5, -17.3, 0, 0.35); solidRect(w.x + 2.6, -17.3, 1.6, 1.0); });
    put(w.x - 2.6, -17.3, 0.7, 0.7, () => palletStack(S, w.x - 2.6, -17.3, 0, 1, rnd));
  }
  { const w = W('w03');   // bin corner by the east end of the lane
    put(w.x - 2.6, -13.45, 0.9, 0.6, () => dumpster(S, w.x - 2.6, -13.45, 0, 0x3b6ea5));
    put(w.x + 2.6, -13.4, 0.6, 0.8, () => crateStack(S, w.x + 2.6, -13.5, 0, rnd));
    put(w.x - 2.4, -17.2, 1.0, 0.6, () => { bikeRack(S, w.x - 2.4, -17.2, 0, 3, rnd); });
    put(w.x + 2.7, -17.2, 0.7, 0.7, () => palletStack(S, w.x + 2.7, -17.2, 0.2, 3, rnd));
  }
  // ---- north edge of the lane: shed with a back door, bin store, electrical cabinets, lamps
  put(-38.5, -17.1, 1.7, 1.0, () => shed(S, G, -38.5, -17.1, 3.2, 1.6, 2.4, 0xa9b8a4));
  put(21.5, -17.0, 1.7, 1.0, () => binStore(S, 21.5, -17.0, rnd));
  for (const x of [-22.0, 8.6, 31.0]) put(x, -17.4, 0.5, 0.35, () => { electricCabinet(S, x, -17.5, 0); solidRect(x, -17.5, 0.85, 0.45); });
  for (const x of [-27.0, 14.0, 30.0]) put(x, -17.6, 0.5, 0.4, () => lampPost(S, G, x, -17.65, PI));
  // ---- south edge: whatever the shops threw out, in a believable rhythm
  for (let x = -43.2; x < 43.6; x += 3.1 + rnd() * 1.2) {
    const r = rnd();
    if (r < 0.2) put(x, -13.45, 0.9, 0.6, () => dumpster(S, x, -13.45, 0, pick(rnd, [0x2f7f5a, 0x3b6ea5, 0x7a4f32])));
    else if (r < 0.4) put(x, -13.35, 1.0, 0.45, () => recyclingBins(S, x, -13.35, 0));
    else if (r < 0.58) put(x, -13.4, 0.7, 0.7, () => palletStack(S, x, -13.4, (rnd() - 0.5) * 0.3, 1 + ((rnd() * 3) | 0), rnd));
    else if (r < 0.72) put(x, -13.45, 0.7, 0.6, () => drums(S, x, -13.45, rnd, 2));
    else if (r < 0.82) put(x, -13.3, 0.4, 0.4, () => { cone(S, x, -13.3); cone(S, x + 0.5, -13.4); });
    else if (r < 0.9) put(x, -13.4, 0.5, 0.4, () => { S.box(0.9, 0.5, 0.5, 0x6b8a7a, x, 0, -13.4, 0, 0.2); });
  }
  // ---- west alley (x -16.5..-13.5): dumpster / crates around w04, bins and pallets further along
  const wa = (A.west.minX + A.west.maxX) / 2;
  put(A.west.minX + 0.62, -5.9, 0.6, 0.95, () => dumpster(S, A.west.minX + 0.62, -5.9, PI / 2));
  put(A.west.maxX - 0.4, -10.2, 0.5, 0.75, () => crateStack(S, A.west.maxX - 0.4, -10.3, PI / 2, rnd));
  put(A.west.minX + 0.45, -2.0, 0.45, 0.95, () => recyclingBins(S, A.west.minX + 0.4, -2.0, PI / 2));
  put(A.west.maxX - 0.6, 1.8, 0.6, 0.65, () => palletStack(S, A.west.maxX - 0.6, 1.8, PI / 2, 2, rnd));
  put(A.west.minX + 0.5, 5.0, 0.5, 0.5, () => drums(S, A.west.minX + 0.5, 5.0, rnd, 2));
  put(A.west.minX + 0.5, -12.0, 0.4, 0.4, () => { electricCabinet(S, A.west.minX + 0.4, -12.0, PI / 2); });
  // ---- east alley (x 24.2..27.2): dumpster and crates around w05
  put(A.east.minX + 0.62, -8.6, 0.6, 0.95, () => dumpster(S, A.east.minX + 0.62, -8.6, PI / 2, 0x3b6ea5));
  put(A.east.maxX - 0.4, -3.7, 0.5, 0.75, () => crateStack(S, A.east.maxX - 0.4, -3.7, -PI / 2, rnd));
  put(A.east.maxX - 0.45, -9.8, 0.45, 0.95, () => recyclingBins(S, A.east.maxX - 0.4, -9.8, -PI / 2));
  put(A.east.minX + 0.6, 0.5, 0.6, 0.65, () => palletStack(S, A.east.minX + 0.6, 0.5, PI / 2, 1, rnd));
  put(A.east.maxX - 0.5, 1.4, 0.5, 0.5, () => drums(S, A.east.maxX - 0.5, 1.4, rnd, 2));   // north of the wash exit route (z 3.7 .. 5.4)

  // ---- Main Street plot gaps (2 m wide dead ends between the north buildings): wrenches w14, w15, w16
  const gap = (id, x0, x1, kit) => {
    const cx = (x0 + x1) / 2, zEnd = -37.2;
    S.box(x1 - x0, 0.9, 0.3, 0xb8614a, cx, 0, zEnd); S.box(x1 - x0 + 0.1, 0.1, 0.4, 0xd9cdb5, cx, 0.9, zEnd);       // dead-end wall with a coping
    for (let i = 0; i < 3; i++) bush(S, x0 + 0.35 + i * 0.65, zEnd + 0.4, 0.45, rnd, pick(rnd, FLOWERS), 0);
    kit();
    drainGrate(F, cx, -28.5, PI / 2);
  };
  gap('w14', -9.5, -7.5, () => {
    put(-8.9, -31.2, 0.55, 0.95, () => dumpster(S, -8.9, -31.2, PI / 2));
    put(-8.0, -28.3, 0.3, 0.3, () => trashCan(S, -8.0, -28.3));
  });
  gap('w15', 6.5, 8.5, () => {
    put(7.95, -30.3, 0.5, 0.8, () => crateStack(S, 7.95, -30.4, 0, rnd));
    put(7.65, -27.8, 0.4, 0.4, () => drums(S, 7.65, -27.8, rnd, 2));
  });
  gap('w16', 21.5, 23.5, () => {
    put(22.9, -31.4, 0.45, 0.95, () => recyclingBins(S, 22.9, -31.4, -PI / 2));
    put(22.1, -28.6, 0.4, 0.4, () => { crate(S, 22.1, -28.6, 0.2, 0.5, P.wood, 0); solidRect(22.1, -28.6, 0.5, 0.5); });
  });
}

// ------------------------------------------------------------------ garden park (TOWN.garden) + the grass verge on West Ave
function anchorStatue(S, x, z, c = 0x5a9b8a) {
  S.box(0.9, 0.2, 0.9, 0xcfc7b8, x, 0, z); S.box(0.7, 0.8, 0.7, 0xd9d2c4, x, 0.2, z); S.box(0.8, 0.1, 0.8, 0xcfc7b8, x, 1.0, z);
  S.box(0.1, 1.1, 0.1, c, x, 1.1, z); S.box(0.7, 0.09, 0.09, c, x, 2.0, z); S.box(0.22, 0.22, 0.09, c, x, 2.2, z);       // shaft, stock, ring
  S.box(0.3, 0.1, 0.1, c, x - 0.2, 1.15, z, 0, 0, 0.6); S.box(0.3, 0.1, 0.1, c, x + 0.2, 1.15, z, 0, 0, -0.6);          // flukes
  S.box(0.55, 0.08, 0.1, c, x, 1.3, z); S.box(0.1, 0.34, 0.1, c, x - 0.5, 1.3, z); S.box(0.1, 0.34, 0.1, c, x + 0.5, 1.3, z);
  solidRect(x, z, 0.95, 0.95);
}
function bed(S, x, z, w, d, rnd, c = 0xc9b79a) {
  S.box(w, 0.22, d, c, x, 0, z); S.box(w - 0.14, 0.06, d - 0.14, 0x6b4a32, x, 0.2, z);
  const nx = Math.max(2, Math.round(w / 0.4)), nz = Math.max(2, Math.round(d / 0.4));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const col = pick(rnd, FLOWERS);
    S.box(0.14, 0.12 + rnd() * 0.1, 0.14, 0x56b97a, x - w / 2 + 0.22 + i * (w - 0.44) / (nx - 1), 0.24, z - d / 2 + 0.2 + j * (d - 0.4) / (nz - 1));
    S.box(0.17, 0.1, 0.17, col, x - w / 2 + 0.22 + i * (w - 0.44) / (nx - 1) + (rnd() - 0.5) * 0.06, 0.34 + rnd() * 0.06, z - d / 2 + 0.2 + j * (d - 0.4) / (nz - 1));
  }
  solidRect(x, z, w, d);
}
function garden(env) {
  const { root, S, F, G, rnd } = env;
  const WP = PROPERTIES.wash.plot, GD = TOWN.garden;
  const k = baseKeep();
  k.rect(13.8, WP.minX + 0.2, 2.0, 5.0);                           // wash approach lane (exit lane -> kiosk)
  k.box(WASH.pile.x, WASH.pile.z, 0.9, 0.85);                      // wash coin pile
  for (const v of WASH.vacuums) k.box(v.x, v.z, 0.45, 0.45);
  const pb = TOWN.parking.find((p) => p.id === 'garden');
  k.rect(pb.x - 2.1, pb.x + 2.1, pb.z - 1.2, 11.0);                // P bay + its paved apron off Harbor St
  const sp = { x: PROPERTIES.wash.pad.x + 1.35, z: PROPERTIES.wash.pad.z - 0.95 };
  k.box(sp.x, sp.z, 0.7, 0.5);                                     // for-sale sign of the wash
  const put = (x, z, hw, hd, fn) => { if (!k.ok(x, z, hw, hd)) return false; fn(); k.box(x, z, hw, hd); return true; };
  const PAVE = 0xd9cdb5, PAVE2 = 0xcabda2;
  const pave = (x0, x1, z0, z1) => { F.box(x1 - x0, 0.006, z1 - z0, PAVE, (x0 + x1) / 2, Y.lot, (z0 + z1) / 2); F.box(x1 - x0 - 0.12, 0.004, z1 - z0 - 0.12, PAVE2, (x0 + x1) / 2, Y.lot + 0.006, (z0 + z1) / 2); };
  // ---- the park south of the car wash: a path up from Harbor St to the wash exit (coin pile), a small fountain
  // plaza, a low planted strip along the wash kerb, benches, trees
  const fx = 19.9, fz = 7.15;
  pave(22.0, 22.8, 7.0, GD.maxZ + 0.2);                            // east path from the sidewalk
  F.cyl(1.0, 1.0, 0.006, PAVE, WASH.pile.x - 0.2, Y.lot, WASH.pile.z + 0.1, 12); F.cyl(0.85, 0.85, 0.004, PAVE2, WASH.pile.x - 0.2, Y.lot + 0.006, WASH.pile.z + 0.1, 12);
  F.cyl(1.3, 1.3, 0.006, PAVE, fx, Y.lot, fz, 16); F.cyl(1.16, 1.16, 0.004, PAVE2, fx, Y.lot + 0.006, fz, 16);
  pave(21.1, 22.1, fz - 0.4, fz + 0.4);                            // plaza -> east path
  pave(16.9, 18.7, fz - 0.4, fz + 0.4);                            // plaza -> wash pad
  // ---- fountain (solid basin, jet + droplets animated)
  const WATERC = 0x6fc4d6, STONE = 0xd9d2c4;
  S.cyl(0.85, 0.85, 0.38, STONE, fx, 0, fz, 8); S.cyl(0.92, 0.92, 0.07, 0xcfc7b8, fx, 0.38, fz, 8);
  G.cyl(0.72, 0.72, 0.02, WATERC, fx, 0.36, fz, 8);
  S.cyl(0.18, 0.22, 0.7, STONE, fx, 0.36, fz, 8); S.cyl(0.42, 0.24, 0.12, STONE, fx, 0.92, fz, 8); S.cyl(0.38, 0.38, 0.02, WATERC, fx, 1.03, fz, 8);
  solidRect(fx, fz, 1.8, 1.8);
  k.box(fx, fz, 1.3, 1.3);
  const jetB = new Builder(); jetB.cyl(0.03, 0.06, 0.7, 0xdff4fa, 0, 0, 0, 5);
  const jet = mesh(jetB.build(), litMat, { cast: false }); jet.position.set(fx, 1.05, fz); root.add(jet);
  const dropB = new Builder();
  for (let i = 0; i < 8; i++) dropB.box(0.06, 0.06, 0.06, 0xdff4fa, 0, 0, 0);
  const dropGeo = dropB.build(), dropPos = dropGeo.attributes.position, dropBase = Float32Array.from(dropPos.array), per = dropPos.count / 8;
  const drops = Array.from({ length: 8 }, (_, i) => ({ a: (i / 8) * PI * 2, ph: i * 0.7 }));
  const dropMesh = mesh(dropGeo, litMat, { cast: false }); dropMesh.frustumCulled = false; root.add(dropMesh);
  // ---- planted strip along the wash kerb, benches round the fountain, trees + bushes on the east edge
  put(19.6, 5.86, 1.7, 0.2, () => bed(S, 19.6, 5.86, 3.3, 0.42, rnd));
  put(21.4, fz, 0.25, 0.8, () => bench(S, 21.4, fz, -PI / 2));
  put(18.5, fz + 0.75, 0.25, 0.8, () => bench(S, 18.45, fz + 0.75, PI / 2));
  put(23.15, 8.3, 0.4, 0.5, () => tree(S, 23.15, 8.3, 0.8, rnd));
  put(23.2, 10.15, 0.35, 0.5, () => { hedge(S, 23.0, 23.5, 9.6, 10.75, 0.5); solidRect(23.25, 10.17, 0.5, 1.15); });
  put(21.0, 5.95, 0.3, 0.2, () => bush(S, 21.6, 5.95, 0.55, rnd, CORAL));
  put(15.75, 5.95, 0.3, 0.25, () => bush(S, 15.75, 5.95, 0.6, rnd, P.accent));
  put(22.4, 10.6, 0.3, 0.3, () => lanternPost(S, G, 22.45, 10.55, 0));
  put(17.3, 10.75, 0.3, 0.2, () => bush(S, 17.25, 10.75, 0.5, rnd, pick(rnd, FLOWERS)));

  return (dt, t) => {
    jet.scale.y = 0.85 + Math.sin(t * 3.2) * 0.12;
    for (let i = 0; i < 8; i++) {
      const d = drops[i], ph = (t * 1.1 + d.ph) % 1, r = 0.15 + ph * 0.5;
      const ox = fx + Math.cos(d.a) * r, oy = 1.05 + 3.0 * ph * (1 - ph) * 0.62 - 0.7 * ph * ph, oz = fz + Math.sin(d.a) * r, sc = ph < 0.97 ? 1 : 0;
      for (let v = i * per; v < (i + 1) * per; v++) {
        dropPos.array[v * 3] = ox + dropBase[v * 3] * sc; dropPos.array[v * 3 + 1] = oy + dropBase[v * 3 + 1] * sc; dropPos.array[v * 3 + 2] = oz + dropBase[v * 3 + 2] * sc;
      }
    }
    dropPos.needsUpdate = true;
  };
}
function verge(env) {
  const { S, rnd } = env;
  const k = baseKeep();
  for (const [a, b] of ZEB_W) k.rect(-45.5, -43.4, a - 0.9, b + 0.9);
  k.rect(-45.5, -43.4, 9.0, 11.2);
  k.rect(-45.5, -43.4, -19.4, -16.8);
  const x = -44.2;
  const put = (z, hw, hd, fn) => { if (!k.ok(x, z, hw, hd)) return false; fn(); k.box(x, z, hw, hd); return true; };
  let benches = 0;
  for (let z = -16.0; z < 8.4; z += 5.2 + rnd() * 1.4) {
    const r = rnd();
    if (r < 0.4) put(z, 0.7, 0.7, () => tree(S, x, z, 0.8 + rnd() * 0.2, rnd));
    else if (r < 0.65) put(z, 0.6, 0.6, () => bush(S, x, z, 0.9, rnd, pick(rnd, FLOWERS)));
    else if (r < 0.8 && benches < 2) { if (put(z, 0.3, 0.8, () => bench(S, x - 0.1, z, -PI / 2))) benches++; }
    else if (r < 0.9) put(z, 0.4, 0.4, () => rock(S, x, z, 0.6, rnd));
    else put(z, 0.3, 0.3, () => trashCan(S, x - 0.2, z));
  }
  put(-6.4, 0.55, 0.6, () => bikeRack(S, x, -6.4, PI / 2, 3, rnd));
}

// ------------------------------------------------------------------ the build
export function buildStreetLife(env) {
  const sk = streetKeep();
  streetFurniture(env, sk);
  alleys(env);
  const gu = garden(env);
  verge(env);
  return { update: gu };
}
