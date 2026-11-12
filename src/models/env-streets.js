// Town ground layer: grass, paving bases, roads, sidewalks + kerbs, lane markings, zebra crossings, parking bays,
// kerb-side rescue bays, alleys + back lane surfaces, empty-lot bases on every plot. Everything is flat (nothing
// taller than a kerb), derived from config.town.js.
import { PALETTE as P, LAYOUT as L } from '../config.js';
import { TOWN, PROPERTIES, SERVICES, RESCUE, LOUNGE, DISTRICTS } from '../config.town.js';
import * as THREE from 'three';
import {
  PI, PAINTW, Y, flat, arrow, plane, surface, mix, manhole, drainGrate, stain, GROUND_TEXT,
} from './env-kit.js';

const R = TOWN.roads;
const SW = TOWN.sidewalkWidth;
const KERB = 0xe9e3d8, SLAB_A = P.sidewalk, SLAB_B = 0xd6cfc4, CUT = 0x9d9a92, DRIVE = 0x6c7080;
const BLUE = 0x3b82c4, YEL = P.accent;
export const EDGE = TOWN.edge.tunnelX - 0.5;          // sidewalks / markings stop at the tunnel portals

// Derived street geometry every env module shares.
export function streetGeo() {
  const h = R.harbor, m = R.main, w = R.west, e = R.east;
  return {
    hz0: h.z - h.halfWidth, hz1: h.z + h.halfWidth,               // 11.7 .. 15.5
    mz0: m.z - m.halfWidth, mz1: m.z + m.halfWidth,               // -23.9 .. -20.1
    wx0: w.x - w.halfWidth, wx1: w.x + w.halfWidth,               // -49.9 .. -46.1
    ex0: e.x - e.halfWidth, ex1: e.x + e.halfWidth,               // 46.1 .. 49.9
    quayZ: TOWN.water[0].minZ,                                     // 17.0: quay edge / water starts
    hbN: TOWN.homeBlock.maxZ,                                      // 11.0: harbor north sidewalk starts
  };
}

/**
 * One sidewalk run along x (axis 'x': z0..z1 fixed, from..to along x) or along z. kerbAt: coordinate of the road
 * edge (gets the kerb stone). cuts: [a, b] ranges along the run where vehicles cross (flush, no kerb).
 */
function sidewalk(F, axis, c0, c1, from, to, kerbAt, cuts = [], cutTone = CUT) {
  const inCut = (a, b) => cuts.find(([u, v]) => a < v - 0.01 && b > u + 0.01);
  const pts = new Set([from, to]);
  for (const [u, v] of cuts) { if (u > from && u < to) pts.add(u); if (v > from && v < to) pts.add(v); }
  const sorted = [...pts].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const cut = inCut(a, b);
    if (cut) {
      put(F, axis, a, b, c0, c1, Y.ground, Y.walk - Y.ground - 0.004, cutTone);
      continue;
    }
    for (let s = a; s < b - 0.01; s += 1.5) {
      const e = Math.min(s + 1.5, b);
      const tone = (Math.round(s / 1.5) & 1) ? SLAB_B : SLAB_A;
      put(F, axis, s, e, c0, c1, Y.ground, Y.walk - Y.ground, tone);
    }
    // kerb stone along the road edge
    const k0 = kerbAt < (c0 + c1) / 2 ? kerbAt : kerbAt - 0.16, k1 = k0 + 0.16;
    put(F, axis, a, b, k0, k1, Y.ground, Y.kerb - Y.ground, KERB);
  }
}
function put(F, axis, a, b, c0, c1, y, h, col) {
  if (axis === 'x') flat(F, a, b, c0, c1, y, h, col); else flat(F, c0, c1, a, b, y, h, col);
}

// dashed line along x at z (or along z at x), skipping [a, b] gaps
function dashes(F, axis, c, from, to, gaps, col = PAINTW, len = 1.3, period = 2.6, w = 0.14) {
  for (let s = from; s < to - len; s += period) {
    const e = s + len;
    if (gaps.some(([u, v]) => s < v && e > u)) continue;
    put(F, axis, s, e, c - w / 2, c + w / 2, Y.mark, 0.006, col);
  }
}
function solidLine(F, axis, c, from, to, gaps, col = PAINTW, w = 0.1) {
  const pts = [from];
  const gs = gaps.filter(([u, v]) => v > from && u < to).sort((p, q) => p[0] - q[0]);
  let s = from;
  for (const [u, v] of gs) { if (u > s) put(F, axis, s, u, c - w / 2, c + w / 2, Y.mark, 0.006, col); s = Math.max(s, v); }
  if (to > s) put(F, axis, s, to, c - w / 2, c + w / 2, Y.mark, 0.006, col);
  return pts;
}
/** Zebra across a road. along = axis of traffic. Bars are long along the traffic axis. */
function zebra(F, along, c0, c1, a0, a1) {
  // c0..c1 = extent across the road (bars repeat across), a0..a1 = bar length along traffic
  for (let c = c0 + 0.25; c < c1 - 0.3; c += 0.7) put(F, along, a0, a1, c, c + 0.4, Y.mark, 0.006, PAINTW);
}
function giveWay(F, axis, c, a0, a1) {          // dashed give-way line + triangles
  for (let s = a0 + 0.15; s < a1 - 0.3; s += 0.6) put(F, axis, s, s + 0.35, c - 0.07, c + 0.07, Y.mark, 0.006, PAINTW);
}
function bayOutline(F, x, z, yaw, len, wid, col, y, t = 0.09) {
  F.push(x, 0, z, yaw);
  // local: length along z (car heading at yaw 0 is +z)
  F.box(wid, 0.006, t, col, 0, y, -len / 2 + t / 2);
  F.box(wid, 0.006, t, col, 0, y, len / 2 - t / 2);
  F.box(t, 0.006, len, col, -wid / 2 + t / 2, y, 0);
  F.box(t, 0.006, len, col, wid / 2 - t / 2, y, 0);
  F.pop();
}
function cornerMarks(F, x, z, yaw, len, wid, col, y, cl = 0.5, t = 0.08) {
  F.push(x, 0, z, yaw);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * wid / 2, cz = sz * len / 2;
    F.box(cl, 0.006, t, col, cx - sx * cl / 2, y, cz - sz * t / 2);
    F.box(t, 0.006, cl, col, cx - sx * t / 2, y, cz - sz * cl / 2);
  }
  F.pop();
}
/** Blocky painted "P" (reads from above), centred at x,z, letter up = local -z. */
function letterP(F, x, z, yaw, s, col, y) {
  F.push(x, 0, z, yaw);
  F.box(0.14 * s, 0.006, 1.0 * s, col, -0.25 * s, y, 0);
  F.box(0.5 * s, 0.006, 0.14 * s, col, 0, y, -0.43 * s);
  F.box(0.5 * s, 0.006, 0.14 * s, col, 0, y, -0.02 * s);
  F.box(0.14 * s, 0.006, 0.55 * s, col, 0.2 * s, y, -0.22 * s);
  F.pop();
}

export function buildStreets(root, { S, F }, signs, rnd) {
  const g = streetGeo();
  const { hz0, hz1, mz0, mz1, wx0, wx1, ex0, ex1, quayZ, hbN } = g;
  const HB = TOWN.homeBlock, A = TOWN.alleys;

  // ---------------- ground + pavement bases
  root.add(plane(240, quayZ + 100, 0, Y.ground, (quayZ - 100) / 2, new THREE.MeshLambertMaterial({ color: P.outside })));
  // the home block is paved (old concrete); legacy forecourt / hall floors sit above this at y >= 0
  root.add(surface('concrete', HB.minX, HB.maxX, A.back.maxZ, HB.maxZ, -0.014));
  // asphalt roads (run on into the tunnels)
  const asph = (x0, x1, z0, z1) => root.add(surface('asphalt', x0, x1, z0, z1, Y.road));
  asph(-110, 110, hz0, hz1);
  asph(-110, 110, mz0, mz1);
  asph(wx0, wx1, mz1, hz0);
  asph(ex0, ex1, mz1, hz0);
  // service lanes
  root.add(surface('alley', A.back.minX, A.back.maxX, A.back.minZ, A.back.maxZ, Y.road));
  root.add(surface('alley', A.west.minX, A.west.maxX, A.back.maxZ, A.west.maxZ, Y.road));
  root.add(surface('alley', A.east.minX, A.east.maxX, A.back.maxZ, A.east.maxZ, Y.road));
  // tow apron + the paved strip between the west alley and the forecourt
  root.add(surface('alley', A.west.maxX, L.forecourt.minX, TOWN.towApron.minZ, HB.maxZ, Y.road));

  // ---------------- empty-lot bases on every plot (the dynamic building brings its own floor)
  const lot = (kind, b, z0 = b.minZ, z1 = b.maxZ) => root.add(surface(kind, b.minX, b.maxX, z0, z1, Y.lot));
  lot('concrete', PROPERTIES.tow.plot);
  lot('gravel', PROPERTIES.lounge.plot);
  const pp = PROPERTIES.paint.plot, vp = PROPERTIES.vip.plot;
  lot('gravel', pp, pp.minZ, 1.2); lot('concrete', pp, 1.2, pp.maxZ);
  lot('gravel', vp, vp.minZ, 1.2); lot('concrete', vp, 1.2, vp.maxZ);
  // the strip east of the forecourt is driveway concrete (exit driveway + the wash approach lane); the car wash has
  // its own plot on the north part of the garden block (the park is south of it)
  const wp = PROPERTIES.wash.plot;
  root.add(surface('concrete', L.forecourt.maxX, wp.minX, PROPERTIES.lounge.plot.maxZ, wp.maxZ, Y.lot));
  root.add(surface('concrete', L.forecourt.maxX, TOWN.garden.minX, wp.maxZ, HB.maxZ, Y.lot));
  lot('alley', wp);
  lot('concrete', PROPERTIES.gas.plot);
  lot('concrete', PROPERTIES.quickfit.plot);
  lot('plaza', PROPERTIES.ferry.plot, PROPERTIES.ferry.plot.minZ + 0, PROPERTIES.ferry.plot.maxZ);
  lot('gravel', PROPERTIES.junkyard.plot);
  lot('gravel', PROPERTIES.diner.plot);
  lot('gravel', PROPERTIES.showroom.plot);
  lot('concrete', SERVICES.depot.plot);
  lot('concrete', SERVICES.academy.plot);
  // garden lawn
  const GD = TOWN.garden;
  root.add(surface('lawn', GD.minX, GD.maxX, wp.maxZ, GD.maxZ, Y.lot));
  // grass verge west of the paint plot
  root.add(surface('lawn', HB.minX, pp.minX, A.back.maxZ, HB.maxZ, Y.lot));
  // forecourt paving of the Main Street corner shops
  for (const f of TOWN.fillers.filter((f) => f.maxZ < mz0)) root.add(surface('plaza', f.minX, f.maxX, f.maxZ - 2.2, f.maxZ, Y.lot));

  // ---------------- sidewalks (top Y.walk, kerb Y.kerb)
  const swN0 = hbN, swN1 = hz0;                         // harbor north: legacy 0.7 m
  const eX = L.carEntry[1].x, xX = L.carExit[0].x;
  const harborCuts = [
    [-55.8, -51.6], [-43.5, -40.9], [-19.9, eX + 1.0], [xX - 1.0, xX + 1.0], [17.4, 21.6], [A.east.minX, 30.6], [42.4, 44.6],
    [52.0, 55.5], [57.6, 59.8],
  ];
  for (const [a, b] of [[-EDGE, wx0], [wx1, ex0], [ex1, EDGE]]) sidewalk(F, 'x', swN0, swN1, a, b, hz0, harborCuts, DRIVE);
  sidewalk(F, 'x', hz1, hz1 + SW, -EDGE, PROPERTIES.ferry.plot.minX, hz1, []);
  sidewalk(F, 'x', hz1, hz1 + SW, PROPERTIES.ferry.plot.maxX, EDGE, hz1, []);
  // ferry plaza front kerb
  flat(F, PROPERTIES.ferry.plot.minX, PROPERTIES.ferry.plot.maxX, hz1, hz1 + 0.16, Y.ground, Y.kerb - Y.ground, 0xe9e3d8);
  const mainSCuts = [[A.west.minX, A.west.maxX], [A.east.minX, A.east.maxX]];
  for (const [a, b] of [[-EDGE, wx0], [wx1, ex0], [ex1, EDGE]]) sidewalk(F, 'x', mz1, mz1 + SW, a, b, mz1, mainSCuts);
  const pb = (id) => TOWN.parking.find((p) => p.id === id);
  const mainNCuts = ['junkyard', 'depot', 'diner', 'academy', 'showroom'].map((id) => [pb(id).x - 1.9, pb(id).x + 1.9]);
  const jg = DISTRICTS.main && { minX: -37, maxX: -33 };
  mainNCuts.push([jg.minX, jg.maxX], [31.0, 37.0]);
  sidewalk(F, 'x', mz0 - SW, mz0, -EDGE, EDGE, mz0, mainNCuts);
  sidewalk(F, 'z', wx1, wx1 + SW, mz1 + SW, hbN, wx1, []);
  sidewalk(F, 'z', wx0 - SW, wx0, mz1 + SW, hbN, wx0, [[-3.4, 0.5]]);
  sidewalk(F, 'z', ex0 - SW, ex0, mz1 + SW, hbN, ex0, []);
  sidewalk(F, 'z', ex1, ex1 + SW, mz1 + SW, hbN, ex1, []);
  // legacy garage driveways: white edge lines over the sidewalk cut
  for (const cx of [eX, xX]) for (const sx of [-1, 1]) flat(F, cx + sx * 1.0 - 0.04, cx + sx * 1.0 + 0.04, swN0, swN1, Y.walk - 0.004, 0.008, PAINTW);

  // ---------------- lane markings
  const jW = [wx0 - 0.2, wx1 + 0.2], jE = [ex0 - 0.2, ex1 + 0.2];
  const zebH = [[-31.5, -28.9], [2.2, 4.8], [34.0, 36.6]];            // harbor crossings (x ranges)
  const zebM = [[A.west.minX + 0.2, A.west.maxX - 0.2], [A.east.minX + 0.2, A.east.maxX - 0.2]];
  const zebW = [[8.6, 10.6], [-17.6, -15.6]];                          // avenue crossings (z ranges)
  const busH = { x: -6.0, z: R.harbor.lanes[1] }, busM = { x: 54.5, z: R.main.lanes[1] };
  // centre dashes
  dashes(F, 'x', R.harbor.z, -EDGE, EDGE, [jW, jE, ...zebH]);
  dashes(F, 'x', R.main.z, -EDGE, EDGE, [jW, jE, ...zebM]);
  dashes(F, 'z', R.west.x, mz1 + 0.6, hz0 - 0.4, zebW);
  dashes(F, 'z', R.east.x, mz1 + 0.6, hz0 - 0.4, zebW);
  // edge lines (broken at junctions, driveways, crossings and the bus bay)
  const busGapH = [busH.x - 2.9, busH.x + 2.9], busGapM = [busM.x - 2.9, busM.x + 2.9];
  solidLine(F, 'x', hz0 + 0.28, -EDGE, EDGE, [jW, jE, ...harborCuts, ...zebH]);
  solidLine(F, 'x', hz1 - 0.28, -EDGE, EDGE, [jE, ...zebH, busGapH]);
  solidLine(F, 'x', mz1 - 0.28, -EDGE, EDGE, [jW, jE, ...zebM, ...mainSCuts]);
  solidLine(F, 'x', mz0 + 0.28, -EDGE, EDGE, [...zebM, ...mainNCuts, busGapM]);
  for (const x of [wx0 + 0.28, wx1 - 0.28, ex0 + 0.28, ex1 - 0.28]) solidLine(F, 'z', x, mz1 + 0.3, hz0 - 0.3, [...zebW, [-3.4, 0.5]]);
  // one-way arrows in both lanes
  for (let x = -58; x <= 58; x += 15.5) {
    if (x > jW[0] - 3 && x < jW[1] + 3) continue;
    if (Math.abs(x - busH.x) < 4 || zebH.some(([u, v]) => x > u - 2 && x < v + 2)) continue;
    for (const z of R.harbor.lanes) arrow(F, x, z, '+x', 1.4, PAINTW, 0.26, 0.7, Y.mark);
  }
  for (let x = -54; x <= 58; x += 15.5) {
    if (Math.abs(x - busM.x) < 4 || zebM.some(([u, v]) => x > u - 2 && x < v + 2)) continue;
    for (const z of R.main.lanes) arrow(F, x, z, '-x', 1.4, PAINTW, 0.26, 0.7, Y.mark);
  }
  for (const z of [-11, 2]) {
    for (const x of R.west.lanes) arrow(F, x, z, '+z', 1.4, PAINTW, 0.26, 0.7, Y.mark);
    for (const x of R.east.lanes) arrow(F, x, z, '-z', 1.4, PAINTW, 0.26, 0.7, Y.mark);
  }
  // zebra crossings
  for (const [a, b] of zebH) zebra(F, 'x', hz0, hz1, a, b);
  for (const [a, b] of zebM) zebra(F, 'x', mz0, mz1, a, b);
  for (const [a, b] of zebW) { zebra(F, 'z', wx0, wx1, a, b); zebra(F, 'z', ex0, ex1, a, b); }
  // the lounge crossing over the garage exit lane (bars run along the lane = x)
  { const c = LOUNGE.crossing; for (let z = c.minZ + 0.12; z < c.maxZ - 0.2; z += 0.36) flat(F, c.minX, c.maxX, z, z + 0.2, 0.021, 0.008, PAINTW); }
  // give-way lines where an avenue joins a street (West Ave into Harbor St, East Ave into Main St)
  giveWay(F, 'x', hz0 - 0.35, wx0, wx1);
  giveWay(F, 'x', mz1 + 0.35, ex0, ex1);
  // stop lines before the crossings on the avenues
  for (const [a] of zebW) { flat(F, wx0 + 0.2, wx1 - 0.2, a - 0.55, a - 0.4, Y.mark, 0.006, PAINTW); }
  for (const [, b] of zebW) { flat(F, ex0 + 0.2, ex1 - 0.2, b + 0.4, b + 0.55, Y.mark, 0.006, PAINTW); }
  // bus bays: yellow box + BUS
  for (const [bs, dir] of [[busH, 1], [busM, -1]]) {
    bayOutline(F, bs.x, bs.z, PI / 2, 6.0, 1.5, YEL, Y.mark, 0.1);
    signs.ground('BUS', { bg: null, fg: YEL }, 2.2, 0.55, bs.x, Y.mark + 0.008, bs.z, dir > 0 ? PI / 2 : -PI / 2);
  }
  // SLOW at the alley mouths, painted on the alley floor (readable from the street)
  signs.ground('SLOW', GROUND_TEXT, 2.4, 0.6, (A.west.minX + A.west.maxX) / 2, Y.mark, 9.4, 0);
  signs.ground('SLOW', GROUND_TEXT, 2.4, 0.6, (A.east.minX + A.east.maxX) / 2, Y.mark, 9.4, 0);
  signs.ground('SERVICE LANE', GROUND_TEXT, 3.6, 0.7, 0, Y.mark, -13.6, 0);

  // ---------------- parking bays (blue) + rescue kerb bays (yellow corners)
  for (const p of TOWN.parking) {
    const y = p.id === 'home' ? 0.022 : Y.mark + 0.004;
    bayOutline(F, p.x, p.z, p.yaw, 3.6, 2.0, BLUE, y);
    // P letter readable from the camera: up = north
    letterP(F, p.x, p.z, 0, 0.75, BLUE, y);
  }
  // the garden bay is paved and reached from Harbor St
  { const p = pb('garden'); root.add(surface('concrete', p.x - 2.0, p.x + 2.0, p.z - 1.1, hbN, Y.lot + 0.005)); }
  for (const s of RESCUE.spots) {
    const onWalk = Math.abs(s.z - (hz1 + SW / 2)) < 1 || Math.abs(s.x - (wx0 - SW / 2)) < 1 || Math.abs(s.x - (ex1 + SW / 2)) < 1 || Math.abs(s.z - (mz0 - SW / 2)) < 1;
    if (onWalk) cornerMarks(F, s.x, s.z, s.yaw, 3.0, 0.9, YEL, Y.kerb + 0.002, 0.45);
    else cornerMarks(F, s.x, s.z, s.yaw, 3.0, 1.6, YEL, Y.mark + 0.004, 0.45);
  }

  // ---------------- service lanes: drains, manholes, stains, speed humps, yellow no-parking lines
  const B = A.back;
  for (let x = B.minX + 4; x < B.maxX - 2; x += 8) drainGrate(F, x, (B.minZ + B.maxZ) / 2 + 0.2, 0);
  // concrete gutter channel along the lane centre
  flat(F, B.minX + 0.5, B.maxX - 0.5, (B.minZ + B.maxZ) / 2 + 0.05, (B.minZ + B.maxZ) / 2 + 0.35, Y.road, 0.006, 0x8d9097);
  for (const x of [-38, -21, -6, 9, 21, 33]) manhole(F, x, B.minZ + 1.6 + (rnd() * 2.5));
  for (let i = 0; i < 26; i++) stain(F, B.minX + 2 + rnd() * (B.maxX - B.minX - 4), B.minZ + 0.8 + rnd() * (B.maxZ - B.minZ - 1.6), 0.18 + rnd() * 0.35, 0x50545c);
  // double yellow no-parking lines along both lane edges (broken at the alleys)
  for (const z of [B.maxZ - 0.25, B.maxZ - 0.42]) solidLine(F, 'x', z, B.minX + 0.3, B.maxX - 0.3, [[A.west.minX, A.west.maxX], [A.east.minX, A.east.maxX], [-9.8, 9.8]], YEL, 0.08);
  // speed humps (painted, flat)
  for (const x of [-27, 15]) for (let z = B.minZ + 0.6; z < B.maxZ - 0.6; z += 0.5) flat(F, x - 0.3, x + 0.3, z, z + 0.25, Y.mark, 0.006, (Math.round(z * 2) & 1) ? YEL : 0x2b3640);
  for (const al of [A.west, A.east]) {
    const cx = (al.minX + al.maxX) / 2;
    flat(F, cx - 0.15, cx + 0.15, B.maxZ, al.maxZ - 0.5, Y.road, 0.006, 0x8d9097);
    for (let z = B.maxZ + 3; z < al.maxZ - 2; z += 6) drainGrate(F, cx, z, PI / 2);
    for (let i = 0; i < 6; i++) stain(F, al.minX + 0.5 + rnd() * 2, B.maxZ + 1 + rnd() * (al.maxZ - B.maxZ - 2), 0.15 + rnd() * 0.3, 0x50545c);
    manhole(F, cx + 0.8, (B.maxZ + al.maxZ) / 2 + 2);
  }
  // road furniture on the asphalt: manholes and drains at the kerbs
  for (let x = -60; x < 60; x += 10) {
    if (zebH.some(([u, v]) => x > u - 1 && x < v + 1)) continue;
    drainGrate(F, x + 3, hz1 - 0.3, 0); drainGrate(F, x + 6, mz0 + 0.3, 0);
    if ((x / 10) & 1) manhole(F, x + 1, R.harbor.lanes[0]); else manhole(F, x + 7, R.main.lanes[0]);
  }
  for (let i = 0; i < 30; i++) {             // tyre-darkened lane centres
    stain(F, -60 + rnd() * 120, R.harbor.lanes[(rnd() * 2) | 0], 0.25 + rnd() * 0.3, 0x51555f, Y.road + 0.004);
    stain(F, -60 + rnd() * 120, R.main.lanes[(rnd() * 2) | 0], 0.25 + rnd() * 0.3, 0x51555f, Y.road + 0.004);
  }
  return g;
}
