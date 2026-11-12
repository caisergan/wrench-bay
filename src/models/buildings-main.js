// Main Street + corner buildings (TOWN.md section 7). Every factory builds in WORLD coordinates (reads its plot and
// positions from the config, sets group.userData.world = true); gameplay adds the group at 0,0,0.
// Same way of working as props.js / buildings-home.js: rigid parts are merged vertex-coloured meshes cached per look,
// animated parts are small separate meshes, signs are textured planes.
import * as THREE from 'three';
import { PROPERTIES, SERVICES, PROJECT, LUNCH, VISITS, TOWN, CLASSICS } from '../config.js';
import { Builder, litMat, glowMat, mesh, memo } from './voxel.js';
import {
  floorPlane, hallShell, TC, R90, PI, signTex, roofSign, face, canvasTex, css, geo, glassPane, glassMat, glassTintMat, plant, tireFlat, tireUp, mixHex,
} from './props-town.js';
import { createTurntable } from './buildings-home.js';

// ---------------------------------------------------------------- local helpers
const bakeCache = new Map();
/** Cached pair of merged geometries: lit (vertex colours) + glow (unlit). fn(b, g) fills both builders. */
function bake(key, fn) {
  return memo(bakeCache, key, () => {
    const b = new Builder(), g = new Builder();
    fn(b, g);
    return { lit: b.geos.length ? b.build() : null, glow: g.geos.length ? g.build() : null };
  });
}
/** Group with the cached lit + glow meshes. */
function baked(key, fn, { cast = true, receive = true } = {}) {
  const k = bake(key, fn);
  const grp = new THREE.Group();
  if (k.lit) grp.add(mesh(k.lit, litMat, { cast, receive }));
  if (k.glow) grp.add(mesh(k.glow, glowMat, { cast: false }));
  return grp;
}
/** Plain building factories return the Group itself (the stub shape); `.group` (self) and `.update(dt)` are also set so both
 *  `obj.group ?? obj` and `obj.update?.(dt)` work. */
function asBuilding(group, update = null) {
  group.group = group;
  if (update) { group.update = update; group.userData.u = update; }
  return group;
}
const worldGroup = () => { const g = new THREE.Group(); g.userData.world = true; return g; };
const mid = (a, b) => (a + b) / 2;
const plotOf = (p) => ({ ...p, cx: mid(p.minX, p.maxX), cz: mid(p.minZ, p.maxZ), w: p.maxX - p.minX, d: p.maxZ - p.minZ });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Corrugated sheet wall along x (z fixed). Alternating ribs give the corrugation without textures. */
function corrugX(b, x0, x1, z, y, h, c1, c2, t = 0.12, rib = 0.22) {
  b.box(x1 - x0, h, t * 0.6, mixHex(c1, 0x000000, 0.12), mid(x0, x1), y, z);
  for (let i = 0, x = x0; x < x1 - 0.01; i++, x += rib) {
    const e = Math.min(x + rib, x1);
    b.box(e - x, h, t, i % 2 ? c2 : c1, mid(x, e), y, z);
  }
}
/** Corrugated sheet wall along z (x fixed). */
function corrugZ(b, z0, z1, x, y, h, c1, c2, t = 0.12, rib = 0.22) {
  b.box(t * 0.6, h, z1 - z0, mixHex(c1, 0x000000, 0.12), x, y, mid(z0, z1));
  for (let i = 0, z = z0; z < z1 - 0.01; i++, z += rib) {
    const e = Math.min(z + rib, z1);
    b.box(t, h, e - z, i % 2 ? c2 : c1, x, y, mid(z, e));
  }
}
/** Rusty car body without wheels / glass (scrap). */
function carShell(b, x, y, z, ry, c = 0x9a5a3e, stripped = false) {
  b.push(x, y, z, ry);
  b.box(1.5, 0.5, 2.8, c, 0, 0.18, 0);
  b.box(1.36, 0.42, 1.4, mixHex(c, 0x000000, 0.12), 0, 0.68, -0.1);
  if (!stripped) b.box(1.2, 0.04, 1.1, mixHex(c, 0x000000, 0.25), 0, 1.1, -0.1);
  b.box(1.46, 0.1, 0.5, mixHex(c, 0x000000, 0.35), 0, 0.5, 0.95);
  b.pop();
}
/** Chain-link panel (transparent diamond mesh) between two points at height h. */
const chainMats = new Map();
function chainTexture() {
  return canvasTex('chainlink', 64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(205,214,220,0.95)'; g.lineWidth = 3.5;
    g.beginPath();
    for (let i = -2; i < 6; i++) { g.moveTo(i * 16, 0); g.lineTo(i * 16 + 64, 64); g.moveTo(i * 16 + 64, 0); g.lineTo(i * 16, 64); }
    g.stroke();
  }, { repeat: [1, 1] });
}
function chainPanel(len, h, x, y, z, ry = 0) {
  const key = `${len.toFixed(2)}|${h.toFixed(2)}`;
  const m = memo(chainMats, key, () => {
    const t = chainTexture().clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 0.55, h / 0.55); t.needsUpdate = true;
    return new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: false });
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h), m);
  p.position.set(x, y + h / 2, z); p.rotation.y = ry; p.renderOrder = 2;
  return p;
}

// ================================================================ 1. JUNKYARD
const JY = {
  x0: -44.5, x1: -29.6, zF: -25.4, zB: -37.5,       // fenced yard: west, east, front, back
  rust: 0xa8553a, rustD: 0x7c3c2b, sheetA: 0x7d8e97, sheetB: 0x6a7b84,
  pivot: { x: -43.1, z: -35.0 }, hopper: { x: -34.0, z: -36.3 }, heap: { x: -39.1, z: -36.3 },
};

function junkSolid(b, g) {
  const gate = PROJECT.junkGate;
  const { x0, x1, zF, zB } = JY;
  const gx0 = gate.minX, gx1 = gate.maxX;
  // ---- back wall (corrugated, the sign stands on it) and gravel apron already comes from the environment
  corrugX(b, x0, x1, zB + 0.1, 0, 2.5, JY.sheetA, JY.sheetB);
  b.box(x1 - x0 + 0.3, 0.14, 0.3, TC.STEEL_DD, mid(x0, x1), 2.5, zB + 0.1);
  for (let x = x0; x <= x1 + 0.01; x += 2.4) b.box(0.18, 2.6, 0.2, TC.STEEL_DD, x, 0, zB + 0.1);
  // ---- front + side fences: posts, rails (the chain-link plane is added as a separate see-through mesh)
  const post = (x, z, h) => { b.box(0.12, h, 0.12, TC.STEEL_D, x, 0, z); };
  const rail = (xa, za, xb, zb, h) => {
    const L = Math.hypot(xb - xa, zb - za), ang = Math.atan2(xb - xa, zb - za);
    b.box(0.07, 0.07, L, TC.STEEL_D, mid(xa, xb), h, mid(za, zb), 0, ang, 0);
  };
  const run = (xa, za, xb, zb, h) => {
    const L = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.round(L / 2.2));
    for (let i = 0; i <= n; i++) post(xa + (xb - xa) * i / n, za + (zb - za) * i / n, h + 0.1);
    rail(xa, za, xb, zb, h); rail(xa, za, xb, zb, 0.06);
  };
  run(x0, zF, gx0 - 0.15, zF, 1.5);              // front, west of the gate
  run(gx1 + 0.15, zF, x1, zF, 1.5);              // front, east of the gate
  run(x0, zF, x0, zB, 1.8);                      // west side
  run(x1, zF, x1, zB, 1.8);                      // east side
  // barbed-wire arms on the side posts
  // ---- gate posts + arch beam
  for (const gxp of [gx0 - 0.2, gx1 + 0.2]) {
    b.box(0.4, 2.9, 0.4, JY.rust, gxp, 0, zF);
    b.box(0.5, 0.12, 0.5, TC.STEEL_DD, gxp, 2.9, zF);
  }
  b.box(gx1 - gx0 + 0.8, 0.22, 0.3, JY.rustD, mid(gx0, gx1), 2.78, zF);
  // sliding gate parked open behind the west fence (leaf + rail + wheels)
  corrugX(b, gx0 - 3.7, gx0 - 0.2, zF - 0.28, 0.1, 1.55, JY.sheetA, JY.sheetB, 0.1);
  b.box(3.6, 0.08, 0.1, TC.STEEL_DD, gx0 - 1.95, 1.65, zF - 0.28);
  b.box(3.6, 0.08, 0.1, TC.STEEL_DD, gx0 - 1.95, 0.1, zF - 0.28);
  b.box(gx1 - gx0 + 4.4, 0.04, 0.1, TC.STEEL_DD, mid(gx0 - 3.9, gx1 + 0.5), 0.0, zF - 0.28);
  // hazard-striped kerb stub at the gate
  for (let i = 0; i < 8; i++) b.box(0.5, 0.04, 0.2, i % 2 ? TC.DARK : TC.MUSTARD, gx0 + 0.25 + i * 0.5, 0.0, zF + 0.2);

  // ---- the three stands: low plinth with painted corners + chalk board post
  for (const s of PROJECT.stands) {
    b.box(2.4, 0.1, 3.7, 0x8b8579, s.x, 0, s.z);
    b.box(2.5, 0.04, 3.8, TC.STEEL_DD, s.x, 0, s.z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(0.5, 0.02, 0.12, TC.MUSTARD, s.x + sx * 1.0, 0.1, s.z + sz * 1.68);
      b.box(0.12, 0.02, 0.5, TC.MUSTARD, s.x + sx * 1.14, 0.1, s.z + sz * 1.5);
    }
    // wheel chocks
    for (const sx of [-0.62, 0.62]) b.box(0.2, 0.14, 0.4, TC.DARK, s.x + sx, 0.1, s.z + 1.0);
    // price board: post + board leaning to the camera, to the right of the wreck and out of the pad
    b.box(0.08, 0.95, 0.08, TC.STEEL_DD, s.x + 1.45, 0, s.z + 1.05);
    b.box(0.08, 0.95, 0.08, TC.STEEL_DD, s.x + 2.05, 0, s.z + 1.05);
  }

  // ---- scrap: big heap under the crane, strewn parts, crushed stack, baler, barrels, tyres
  const h = JY.heap;
  b.push(h.x, 0, h.z, 0.3);
  b.box(3.6, 0.5, 2.8, 0x6e5546, 0, 0, 0);
  b.box(2.6, 0.5, 2.2, 0x8a6a56, 0.1, 0.5, 0);
  b.box(1.6, 0.4, 1.4, 0x9a7e68, -0.1, 1.0, 0.05);
  b.pop();
  carShell(b, h.x - 1.0, 0.7, h.z - 0.1, 0.5, 0x8c4a35, true);
  carShell(b, h.x + 0.8, 1.15, h.z + 0.1, -0.3, 0x5f7f8a, true);
  b.box(1.5, 0.12, 0.8, 0x8f98a0, h.x + 0.1, 1.5, h.z - 0.5, 0, 0.3, 0.1);
  b.box(0.9, 0.5, 0.9, 0x3d4450, h.x - 1.3, 0.5, h.z + 0.7, 0.2, 0.4, 0.2);          // engine block
  for (const [dx, dz, ry] of [[1.6, 0.9, 0.6], [-1.8, 0.8, -0.4], [2.0, -0.7, 1.0]]) tireFlat(b, h.x + dx, 0, h.z + dz, 0.38, 0.28);
  // crusher / baler (hopper box + press) the magnet drops into
  const hp = JY.hopper;
  b.box(2.6, 1.1, 1.8, 0x586a74, hp.x, 0, hp.z);
  b.box(2.8, 0.14, 2.0, TC.MUSTARD_D, hp.x, 1.1, hp.z);
  b.box(2.0, 0.5, 1.3, 0x20262c, hp.x, 1.1, hp.z);                                  // open hopper mouth (dark interior)
  b.box(0.1, 0.9, 0.1, TC.MUSTARD, hp.x - 1.4, 0, hp.z + 1.0); b.box(0.1, 0.9, 0.1, TC.MUSTARD, hp.x + 1.4, 0, hp.z + 1.0);
  b.box(0.7, 0.5, 0.06, TC.MUSTARD, hp.x + 0.0, 0.3, hp.z + 0.92);
  // crushed-car stack (flat cubes in car colours) east of the baler
  const cx = -31.3, cz = -36.4;
  [[0xb4452f, 0], [0x3b6f93, 1], [0xc79a2d, 2], [0x6e8a55, 3]].forEach(([c, i]) => {
    b.box(2.2, 0.42, 1.3, c, cx + (i % 2 ? 0.05 : -0.05), i * 0.42, cz, 0, (i - 1.5) * 0.06);
    b.box(2.0, 0.05, 1.1, mixHex(c, 0x000000, 0.3), cx, i * 0.42 + 0.42, cz);
  });
  // barrels + tyres on the west and east strips
  for (const [x, z, c] of [[-43.4, -31.2, 0xb4452f], [-42.8, -31.6, 0x3b6f93], [-43.5, -30.3, 0xc79a2d]]) {
    b.cyl(0.3, 0.3, 0.85, c, x, 0, z, 10); b.cyl(0.31, 0.31, 0.06, TC.STEEL_DD, x, 0.5, z, 10); b.cyl(0.31, 0.31, 0.06, TC.STEEL_DD, x, 0.2, z, 10);
  }
  const heapTyres = (x, z, n) => {
    for (let i = 0; i < n; i++) {
      const row = Math.floor(Math.sqrt(i * 2));
      tireFlat(b, x + (i % 3 - 1) * 0.62 + (row % 2) * 0.2, row * 0.26, z + (Math.floor(i / 3) - 0.5) * 0.7, 0.36, 0.26);
    }
  };
  heapTyres(-43.3, -28.2, 8);
  heapTyres(-30.7, -27.8, 5);
  // stripped chassis + engine on the west strip
  carShell(b, -43.0, 0, -33.6, R90 + 0.1, 0x6f7f87, true);
  // spare doors / hoods leaning on the back wall
  b.box(1.1, 0.8, 0.06, 0x9a4a35, -41.6, 0, zBack(0.35), -0.25, 0.1);
  b.box(1.2, 0.7, 0.06, 0x4d7a9a, -40.5, 0, zBack(0.4), -0.3, -0.1);
  // a worn-out forklift-style pallet stack of parts crates
  for (let i = 0; i < 3; i++) b.box(0.9, 0.3, 0.9, TC.WOOD_D, -37.4 - i * 0.0, i * 0.34, -34.9, 0, 0);
  void g;
}
function zBack(d) { return JY.zB + d; }

function junkOffice(b, g) {
  const x = -28.0, w = 3.0, zb = -37.5, d = 1.5, h = 2.4;
  b.box(w, h, d, 0x5e7581, x, 0, zb + d / 2);                       // body
  corrugX(b, x - w / 2, x + w / 2, zb + d + 0.02, 0, h, 0x6b8591, 0x5a717d, 0.1);
  b.box(w + 0.3, 0.14, d + 0.5, JY.rustD, x, h, zb + d / 2 + 0.2);  // roof slab
  b.box(w + 0.3, 0.1, 0.4, TC.STEEL_DD, x, h + 0.14, zb + 0.2);
  b.box(0.18, 0.6, 0.2, TC.STEEL_DD, x + 1.0, h + 0.14, zb + 0.5);    // flue
  // sell window with counter + shutter (open), door
  b.box(1.5, 0.9, 0.08, TC.DARK, x - 0.4, 1.0, zb + d + 0.06);
  g.box(1.3, 0.7, 0.05, TC.GLASS, x - 0.4, 1.1, zb + d + 0.1);
  b.box(1.7, 0.08, 0.35, TC.WOOD, x - 0.4, 0.92, zb + d + 0.25);
  b.box(1.7, 0.1, 0.5, TC.MUSTARD_D, x - 0.4, 2.0, zb + d + 0.3, 0.6);                // awning
  b.box(0.7, 1.75, 0.08, JY.rust, x + 0.95, 0, zb + d + 0.07);
  b.box(0.08, 0.1, 0.1, TC.CHROME, x + 0.7, 0.9, zb + d + 0.15);
  // price list board + stack of tyres by the door
  tireUp(b, x - 1.55, 0.36, zb + d + 0.35, 0.36, 0.24, R90);
  tireFlat(b, x - 1.55, 0, zb + d + 0.4, 0.36, 0.24); tireFlat(b, x - 1.55, 0.24, zb + d + 0.4, 0.36, 0.24);
}

function junkSignTex() {
  return signTex('RUST & GOLD', { bg: 0x7c3c2b, fg: TC.CREAM_L, shadow: 0x4a2418, border: TC.MUSTARD, sub: 'SALVAGE YARD', subColor: TC.MUSTARD, w: 1024, h: 256, size: 0.46 });
}
function priceBoardTex() {
  return canvasTex('priceBoard', 128, 128, (g, w, h) => {
    g.fillStyle = css(0x2d3a3f); g.fillRect(0, 0, w, h);
    g.strokeStyle = css(TC.MUSTARD); g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = css(TC.MUSTARD); g.font = `700 30px ${'"Fredoka", "Arial Rounded MT Bold", system-ui, sans-serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('AS IS', w / 2, 38); g.fillStyle = css(TC.CREAM_L); g.font = `700 54px "Fredoka", system-ui, sans-serif`; g.fillText('$', w / 2, 86);
  });
}

export function createJunkyard() {
  const group = worldGroup();
  group.add(baked('jy|solid', junkSolid));
  group.add(baked('jy|office', junkOffice));
  const { x0, x1, zF, zB } = JY, gate = PROJECT.junkGate;
  // see-through chain link
  group.add(chainPanel(gate.minX - 0.35 - x0 - 0.0, 1.4, mid(x0, gate.minX - 0.35), 0.1, zF, 0));
  group.add(chainPanel(x1 - gate.maxX - 0.35, 1.4, mid(gate.maxX + 0.35, x1), 0.1, zF, 0));
  group.add(chainPanel(zF - zB, 1.7, x0, 0.1, mid(zF, zB), R90));
  group.add(chainPanel(zF - zB, 1.7, x1, 0.1, mid(zF, zB), R90));
  // signs: big board on the back wall, small one on the gate beam, boards at the stands
  const sign = roofSign(junkSignTex(), 6.4, 1.6, { board: JY.rustD, legs: true });
  sign.position.set(-37.0, 2.62, JY.zB + 0.3); group.add(sign);
  const arch = face(signTex('SALVAGE', { bg: 0x7c3c2b, fg: TC.CREAM_L, shadow: null, border: null, w: 512, h: 128, size: 0.6 }), 3.6, 0.5);
  arch.position.set(mid(gate.minX, gate.maxX), 2.77 + 0.11, JY.zF + 0.17); group.add(arch);
  const tex = priceBoardTex();
  for (const s of PROJECT.stands) {
    const pb = face(tex, 0.5, 0.5, { lit: true });
    pb.position.set(s.x + 1.75, 0.95 + 0.25, s.z + 1.1); pb.rotation.x = -0.35; group.add(pb);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.05), litMat.clone());
    bk.material.vertexColors = false; bk.material.color.set(TC.STEEL_DD);
    bk.position.set(s.x + 1.75, 1.2, s.z + 1.07); bk.rotation.x = -0.35; group.add(bk);
  }
  // ---- the crane: mast fixed, boom swings, trolley runs out along the boom, cable hangs vertical, magnet carries scrap
  const crane = buildCrane();
  group.add(crane.group);
  return { group, update: crane.update };
}

function buildCrane() {
  const P = JY.pivot;
  const group = new THREE.Group(); group.position.set(P.x, 0, P.z);
  group.add(baked('jy|craneMast', (b) => {
    b.box(1.5, 0.3, 1.5, TC.CONCRETE_D, 0, 0, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.14, 5.4, 0.14, TC.MUSTARD_D, sx * 0.4, 0.3, sz * 0.4);
    for (let y = 0.5; y < 5.4; y += 0.9) for (const [a, c] of [[0, 1], [1, 0]]) {
      b.box(0.8, 0.07, 0.07, TC.MUSTARD_D, 0, y, a ? -0.4 : 0.4); b.box(0.07, 0.07, 0.8, TC.MUSTARD_D, a ? 0.4 : -0.4, y + 0.45, 0);
      void c;
    }
    b.box(1.0, 0.35, 1.0, TC.STEEL_DD, 0, 5.4, 0);                  // slew ring
    b.box(0.9, 0.9, 1.0, TC.MUSTARD, -0.1, 5.75, 0);                // cab
    b.box(0.5, 0.45, 0.04, TC.GLASS, -0.1, 6.0, 0.52);
  }));
  const boom = new THREE.Group(); boom.position.y = 5.95; group.add(boom);
  const L = 10.2;
  boom.add(mesh(bake('jy|boom', (b) => {
    b.box(L + 1.6, 0.14, 0.14, TC.MUSTARD, L / 2 - 0.8, 0.0, 0.3); b.box(L + 1.6, 0.14, 0.14, TC.MUSTARD, L / 2 - 0.8, 0.0, -0.3);
    b.box(L + 1.6, 0.14, 0.14, TC.MUSTARD_D, L / 2 - 0.8, 0.42, 0);
    for (let x = 0.2; x < L; x += 0.9) { b.box(0.07, 0.07, 0.62, TC.MUSTARD_D, x, 0.0, 0); b.box(0.07, 0.5, 0.07, TC.MUSTARD_D, x, 0.0, 0.3); b.box(0.07, 0.5, 0.07, TC.MUSTARD_D, x, 0.0, -0.3); }
    b.box(1.3, 0.8, 0.8, TC.CONCRETE_D, -1.5, -0.3, 0);               // counterweight
    b.box(0.2, 0.2, 0.2, TC.RED, L + 0.7, 0.0, 0);                    // tip lamp
  }).lit, litMat, { cast: true }));
  // trolley + cable + magnet (cable is a unit-height cylinder scaled in y)
  const trolley = new THREE.Group(); boom.add(trolley);
  trolley.add(mesh(bake('jy|trolley', (b) => { b.box(0.7, 0.28, 0.9, TC.STEEL_DD, 0, -0.3, 0); }).lit, litMat, { cast: true }));
  const cableGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5); cableGeo.translate(0, -0.5, 0);
  const cable = new THREE.Mesh(cableGeo, new THREE.MeshLambertMaterial({ color: 0x20262c }));
  cable.position.y = -0.4; trolley.add(cable);
  const magnet = new THREE.Group(); trolley.add(magnet);
  magnet.add(mesh(bake('jy|magnet', (b) => {
    b.cyl(0.62, 0.62, 0.34, TC.STEEL_DD, 0, -0.34, 0, 12);
    b.cyl(0.66, 0.66, 0.08, TC.MUSTARD, 0, -0.42, 0, 12);
    b.cyl(0.12, 0.12, 0.3, TC.DARK, 0, 0.0, 0, 6);
  }).lit, litMat, { cast: true }));
  // carried scrap: a crushed-car cube hanging under the magnet while it is loaded
  const load = new THREE.Group(); load.visible = false; magnet.add(load);
  load.add(mesh(bake('jy|load', (b) => { b.box(1.3, 0.55, 0.9, 0x8c4a35, 0, -1.1, 0); b.box(0.9, 0.3, 0.7, 0x4d7a9a, 0.05, -0.86, 0.05, 0, 0.3); }).lit, litMat, { cast: true }));
  // targets in the boom frame: heap (pick up) and baler hopper (drop)
  const tgt = (p) => { const dx = p.x - P.x, dz = p.z - P.z; return { phi: Math.atan2(-dz, dx), r: Math.hypot(dx, dz) }; };
  const heap = tgt({ x: JY.heap.x + 0.2, z: JY.heap.z }), hop = tgt({ x: JY.hopper.x, z: JY.hopper.z });
  const hHeap = 5.95 - 1.9 - 0.4, hHopper = 5.95 - 2.1;          // magnet disc height above the ground when down
  const HI = 5.95 - 3.7;                                          // travelling height (clear of the heap / baler / wrecks)
  // phases: 0 over heap, lower; 1 pick up (load on); 2 raise; 3 swing + trolley to the baler; 4 lower; 5 release; 6 raise; 7 swing back
  let ph = 0, k = 0, phi = heap.phi, r = heap.r, hh = HI;
  const dur = [0.6, 3.2, 0.9, 3.0, 4.2, 1.0, 3.2, 4.0];
  const ease = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  function update(dt) {
    k += dt;
    if (k >= dur[ph]) { k -= dur[ph]; ph = (ph + 1) % dur.length; if (ph === 2) load.visible = true; if (ph === 6) load.visible = false; }
    const t = ease(clamp(k / dur[ph], 0, 1));
    switch (ph) {
      case 0: phi = heap.phi; r = heap.r; hh = HI; break;
      case 1: hh = lerp(HI, hHeap, t); break;
      case 2: hh = lerp(hHeap, HI, t); break;
      case 3: phi = lerp(heap.phi, hop.phi, t); r = lerp(heap.r, hop.r, t); hh = HI; break;
      case 4: hh = lerp(HI, hHopper, t); break;
      case 5: hh = hHopper; break;
      case 6: hh = lerp(hHopper, HI, t); break;
      case 7: phi = lerp(hop.phi, heap.phi, t); r = lerp(hop.r, heap.r, t); hh = HI; break;
    }
    boom.rotation.y = phi;
    trolley.position.x = r;
    const len = Math.max(0.5, 5.95 - hh - 0.4);
    cable.scale.y = len;
    magnet.position.y = -0.4 - len;
  }
  update(0);
  return { group, update };
}

// ================================================================ shared building helpers
/** Closed building body between x0..x1, zB..zF (zF = front face, facing +z): plinth, walls, cornice, parapet roof. */
function body(b, o) {
  const { x0, x1, zB, zF, h } = o, w = x1 - x0, d = zF - zB, cx = mid(x0, x1), cz = mid(zB, zF);
  b.box(w, h, d, o.wall, cx, 0, cz);
  b.box(w + 0.1, o.baseH ?? 0.5, d + 0.1, o.base ?? TC.NAVY_D, cx, 0, cz);
  if (o.band) b.box(w + 0.06, o.band[1], d + 0.06, o.band[2], cx, o.band[0], cz);
  b.box(w + 0.4, 0.22, d + 0.4, o.roof ?? TC.STEEL_DD, cx, h, cz);                         // roof slab + overhang
  b.box(w + 0.5, 0.12, 0.14, o.trim ?? TC.CORAL, cx, h + 0.22, zF + 0.2);                  // front parapet lip
  b.box(0.14, 0.12, d + 0.4, o.trim ?? TC.CORAL, x0 - 0.2, h + 0.22, cz);
  b.box(0.14, 0.12, d + 0.4, o.trim ?? TC.CORAL, x1 + 0.2, h + 0.22, cz);
  b.box(w + 0.5, 0.12, 0.14, o.trim ?? TC.CORAL, cx, h + 0.22, zB - 0.2);
}
/** Window on the south face: frame, glowing two-tone glass, mullions, sill. */
function win(b, g, zF, x, y, w, h, frame = TC.CREAM, glass = TC.GLASS, mull = 1) {
  b.box(w + 0.2, h + 0.2, 0.1, frame, x, y - 0.1, zF + 0.05);
  g.box(w, h, 0.05, glass, x, y, zF + 0.11);
  g.box(w, h * 0.35, 0.052, mixHex(glass, 0xffffff, 0.5), x, y + h * 0.65, zF + 0.115);
  for (let i = 1; i <= mull; i++) b.box(0.06, h, 0.08, frame, x - w / 2 + i * w / (mull + 1), y, zF + 0.14);
  b.box(w + 0.34, 0.07, 0.24, frame, x, y - 0.14, zF + 0.12);
}
/** Roller shutter door on the south face; open (0..1) leaves a dark gap with a lit interior behind. */
function roller(b, g, zF, x, w, h, c = TC.STEEL, open = 0) {
  b.box(w + 0.3, h + 0.15, 0.12, TC.STEEL_DD, x, 0, zF + 0.06);
  const gap = h * open;
  g.box(w, gap + 0.01, 0.04, 0x2a3138, x, h - gap, zF + 0.12);
  const ribs = Math.floor((h - gap) / 0.18);
  for (let i = 0; i < ribs; i++) b.box(w, 0.14, 0.07, i % 2 ? c : mixHex(c, 0x000000, 0.1), x, i * 0.18, zF + 0.12);
  b.box(w + 0.1, 0.1, 0.12, TC.STEEL_DD, x, h, zF + 0.1);
}
function acUnit(b, x, y, z, c = TC.STEEL) {
  b.box(1.0, 0.55, 0.7, c, x, y, z); b.cyl(0.26, 0.26, 0.05, TC.DARK, x - 0.2, y + 0.55, z, 10); b.cyl(0.26, 0.26, 0.05, TC.DARK, x + 0.2, y + 0.55, z, 10);
}
function crate(b, x, y, z, s, c, ry = 0) {
  b.box(s, s * 0.8, s, c, x, y, z, 0, ry); b.box(s + 0.02, 0.05, s * 0.3, mixHex(c, 0x000000, 0.25), x, y + s * 0.4, z, 0, ry);
}
function pallet(b, x, z, w = 1.0, d = 1.0, ry = 0) {
  b.push(x, 0, z, ry); b.box(w, 0.08, d, TC.WOOD_L, 0, 0.12, 0); for (const px of [-1, 0, 1]) b.box(0.14, 0.12, d, TC.WOOD_D, px * (w / 2 - 0.1), 0, 0); b.pop();
}
function forklift(b, x, z, ry, c = TC.MUSTARD) {
  b.push(x, 0, z, ry);
  b.box(1.0, 0.5, 1.5, c, 0, 0.2, -0.1);                                       // body
  b.box(0.9, 0.2, 0.7, TC.DARK, 0, 0.7, -0.45);                                // seat
  for (const sx of [-1, 1]) { b.box(0.06, 1.2, 0.06, TC.STEEL_DD, sx * 0.42, 0.7, -0.05); b.box(0.06, 0.05, 0.5, TC.STEEL_DD, sx * 0.42, 1.9, -0.28); }
  b.box(1.0, 0.07, 0.6, TC.STEEL_DD, 0, 1.9, -0.28);                           // overhead guard
  b.box(0.12, 1.9, 0.12, TC.STEEL_D, -0.35, 0.1, 0.78); b.box(0.12, 1.9, 0.12, TC.STEEL_D, 0.35, 0.1, 0.78);   // mast
  for (const sx of [-1, 1]) b.box(0.1, 0.06, 0.9, TC.STEEL_DD, sx * 0.28, 0.12, 1.25);                          // forks
  for (const sx of [-1, 1]) for (const sz of [0.35, -0.55]) b.cyl(0.22, 0.22, 0.2, TC.RUBBER, sx * 0.5, 0, sz, 10, 0, 0, R90);
  b.box(0.5, 0.1, 0.1, TC.RED, 0, 0.8, -0.9);                                  // beacon
  b.pop();
}

// ================================================================ 2. DEPOT "Harbor Parts Co."
function depotSolid(b, g) {
  const pl = plotOf(SERVICES.depot.plot), x0 = pl.minX + 0.2, x1 = pl.maxX - 0.2, zB = pl.minZ + 0.2, zF = -27.8, h = 4.3;
  body(b, { x0, x1, zB, zF, h, wall: 0xc9d6dc, base: 0x35525f, band: [3.2, 0.3, TC.TEAL], trim: TC.TEAL, roof: 0x8d9aa2 });
  for (const sx of [-20.5, -17, -13.5]) g.box(2.0, 0.08, 2.6, TC.GLASS_L, sx, h + 0.22, zB + 9);    // skylights
  // warehouse hump at the back (taller, hidden behind the front part but gives a silhouette)
  b.box(x1 - x0 - 3, 1.4, 5, 0xb5c5cd, mid(x0, x1), h + 0.22, zB + 2.8);
  b.box(x1 - x0 - 2.8, 0.14, 5.2, TC.STEEL_DD, mid(x0, x1), h + 1.62, zB + 2.8);
  for (let x = x0 + 2.2; x < x1 - 2; x += 1.4) b.box(0.16, 1.1, 0.04, 0x9db0ba, x, h + 0.3, zB + 5.33);
  // front: shop window (shelves inside), counter, roller door
  const wx = -20.5;
  b.box(4.4, 0.08, 0.5, TC.STEEL_DD, wx, 0.5, zF + 0.28);
  win(b, g, zF, wx, 0.9, 3.8, 1.9, TC.TEAL_D, 0x2b3a44, 3);
  // shelves + goods seen through the glass (unlit, so they read from far)
  for (const sy of [1.1, 1.65, 2.2]) g.box(3.6, 0.05, 0.04, TC.STEEL, wx, sy, zF + 0.13);
  const cols = [TC.CORAL, TC.MUSTARD, TC.TEAL, TC.CREAM, TC.BLUE, TC.RED];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) g.box(0.4, 0.36, 0.04, cols[(i + r * 2) % 6], wx - 1.5 + i * 0.6, 1.15 + r * 0.55, zF + 0.14);
  // counter window at the teal pad
  const cx = SERVICES.depot.pad.x;
  win(b, g, zF, cx, 1.25, 2.4, 1.1, TC.TEAL_D, TC.GLASS_L, 1);
  b.box(2.8, 0.14, 0.6, TC.TEAL, cx, 0.95, zF + 0.34);                          // teal counter sill
  b.box(2.8, 0.6, 0.5, TC.TEAL_D, cx, 0.3, zF + 0.3);                           // counter front
  for (let i = 0; i < 6; i++) b.box(0.42, 0.18, 0.62, i % 2 ? TC.CREAM : TC.TEAL, cx - 1.1 + i * 0.44, 2.45, zF + 0.5, -0.5);   // awning stripes
  b.box(0.08, 1.3, 0.08, TC.TEAL_D, cx - 1.4, 1.2, zF + 0.7); b.box(0.08, 1.3, 0.08, TC.TEAL_D, cx + 1.4, 1.2, zF + 0.7);
  // roller door, a third open on the east side, parts on pallets inside
  roller(b, g, zF, -12.5, 3.4, 2.9, TC.STEEL, 0.35);
  b.box(3.0, 0.06, 0.04, TC.GOLD, -12.5, 3.05, zF + 0.14);
  // person door
  b.box(1.0, 2.1, 0.1, TC.TEAL_D, -17.9 + 0.0, 0, zF + 0.06 - 0.0);
  // rooftop: AC units, vent stack
  acUnit(b, -21.5, h + 0.22, -33, TC.STEEL); acUnit(b, -19.7, h + 0.22, -33, TC.STEEL);
  b.cyl(0.35, 0.35, 0.9, TC.STEEL_D, -11, h + 0.22, -34, 10); b.cyl(0.4, 0.4, 0.1, TC.STEEL_DD, -11, h + 1.12, -34, 10);
  // outside stock: pallets with crates (west of the pad), tyre stack, oil drums
  pallet(b, -22.4, -28.7, 1.1, 0.9); crate(b, -22.4, 0.2, -28.7, 0.7, TC.CORAL); crate(b, -22.4, 0.9, -28.7, 0.55, TC.MUSTARD);
  pallet(b, -21.2, -28.6, 0.9, 0.9); crate(b, -21.2, 0.2, -28.6, 0.65, TC.TEAL);
  for (let i = 0; i < 4; i++) tireFlat(b, -10.5, i * 0.26, -28.5, 0.36, 0.26);
  for (const [x, z, c] of [[-10.4, -29.6, TC.BLUE], [-10.0, -30.2, TC.RED]]) { b.cyl(0.3, 0.3, 0.85, c, x, 0, z, 10); b.cyl(0.31, 0.31, 0.06, TC.STEEL_DD, x, 0.7, z, 10); }
  // west side yard: a forklift parked in the gap, pallets stacked beside the building
  forklift(b, -24.4, -31.2, 0.15);
  pallet(b, -24.4, -34.3, 1.1, 1.0); crate(b, -24.4, 0.2, -34.3, 0.8, TC.CREAM); crate(b, -24.4, 1.0, -34.3, 0.6, TC.CORAL);
  pallet(b, -24.4, -35.6, 1.1, 1.0); crate(b, -24.4, 0.2, -35.6, 0.8, TC.MUSTARD_D);
}
export function createDepot() {
  const group = worldGroup();
  group.add(baked('depot|solid', depotSolid));
  const zF = -27.8;
  const sign = roofSign(signTex('HARBOR PARTS CO.', { bg: TC.TEAL_D, fg: TC.CREAM_L, shadow: 0x0f4a43, border: TC.MUSTARD, w: 1024, h: 256, size: 0.4, sub: 'TYRES - OIL - PARTS', subColor: TC.MUSTARD }), 7.4, 1.5, { board: TC.NAVY, legs: false });
  sign.position.set(-16.5, 4.55, zF - 1.0); group.add(sign);
  const wall = face(signTex('HARBOR PARTS', { bg: TC.TEAL, fg: TC.CREAM_L, shadow: null, border: null, w: 512, h: 96, size: 0.62 }), 4.2, 0.5);
  wall.position.set(-12.5, 3.55, zF + 0.1); group.add(wall);
  return group;
}

// ================================================================ 3. DINER "The Greasy Spoon"
const DN = { x0: -6.4, x1: 2.2, zB: -34.5, zF: -27.8, h: 3.7, mint: 0xa9e2cf, mintD: 0x7cc4ae, pink: 0xf5a9b8, chrome: 0xdfe4e6 };
function umbrellaSet(b, x, z, c, y = 0.12) {
  b.cyl(0.4, 0.4, 0.05, TC.STEEL_D, x, y + 0.7, z, 10); b.cyl(0.05, 0.05, 0.7, TC.STEEL_DD, x, y, z, 6);                         // table
  b.cyl(0.04, 0.04, 2.0, TC.STEEL_DD, x, y, z, 6);
  b.cyl(0.04, 0.9, 0.3, c, x, y + 1.85, z, 8); b.cyl(0.0, 0.04, 0.12, TC.CHROME, x, y + 2.15, z, 6);                             // parasol
  for (const [dx, dz] of [[0.7, 0], [-0.7, 0], [0, 0.7]]) { b.box(0.34, 0.06, 0.34, TC.WOOD_L, x + dx, y + 0.42, z + dz); b.box(0.34, 0.4, 0.05, TC.WOOD_L, x + dx, y + 0.42, z + dz * 1.15 - (dz ? 0 : 0)); }
}
function dinerSolid(b, g, lvl) {
  const { x0, x1, zB, zF, h } = DN;
  body(b, { x0, x1, zB, zF, h, wall: DN.mint, base: TC.CREAM, baseH: 0.9, trim: TC.CORAL, roof: TC.CREAM, band: [1.1, 0.12, TC.CORAL] });
  // checker skirt + chrome band
  for (let x = x0, i = 0; x < x1 - 0.01; x += 0.4, i++) b.box(0.4, 0.3, 0.06, i % 2 ? TC.DARK : TC.CREAM_L, x + 0.2, 0.2, zF + 0.04);
  b.box(x1 - x0 + 0.1, 0.1, 0.1, DN.chrome, mid(x0, x1), 2.35, zF + 0.04);
  b.box(x1 - x0 + 0.1, 0.1, 0.1, DN.chrome, mid(x0, x1), h - 0.1, zF + 0.04);
  // barrel roof: stacked boxes
  const cx = mid(x0, x1), w = x1 - x0;
  b.box(w - 0.3, 0.3, 6.2, TC.CREAM, cx, h + 0.22, mid(zB, zF)); b.box(w - 1.0, 0.3, 6.1, TC.CREAM_L, cx, h + 0.52, mid(zB, zF)); b.box(w - 2.2, 0.24, 6.0, DN.chrome, cx, h + 0.82, mid(zB, zF));
  for (let z = zB + 0.6; z < zF - 0.3; z += 1.2) b.box(w - 2.2, 0.03, 0.2, TC.CORAL, cx, h + 1.06, z);
  // front: windows with stools, hatch, door
  win(b, g, zF, -4.9, 1.15, 1.8, 1.35, DN.chrome, 0xffe9c2, 1);
  win(b, g, zF, -0.5, 1.15, 1.8, 1.35, DN.chrome, 0xffe9c2, 1);
  for (const x of [-5.4, -4.9, -4.4, -0.9, -0.4, 0.1]) { g.box(0.14, 0.3, 0.05, TC.CORAL, x, 1.2, zF + 0.13); }
  const hx = LUNCH.pickup.x;
  b.box(1.7, 1.2, 0.1, DN.chrome, hx, 0.95, zF + 0.05); g.box(1.4, 0.9, 0.05, 0xffe9c2, hx, 1.1, zF + 0.11);
  b.box(1.9, 0.1, 0.5, TC.CORAL_D, hx, 0.92, zF + 0.3);                                     // serving shelf
  for (let i = 0; i < 4; i++) b.box(0.48, 0.12, 0.7, i % 2 ? TC.CREAM_L : TC.CORAL, hx - 0.72 + i * 0.48, 2.18, zF + 0.42, -0.45);   // awning
  b.box(0.06, 0.06, 0.1, DN.chrome, hx - 0.85, 2.15, zF + 0.1);
  b.box(1.1, 2.1, 0.1, DN.chrome, 1.4, 0, zF + 0.06); g.box(0.8, 1.2, 0.05, 0xffe9c2, 1.4, 0.7, zF + 0.12); b.box(0.08, 0.1, 0.1, TC.CORAL, 1.05, 1.0, zF + 0.16);
  b.box(0.7, 0.6, 0.6, TC.CORAL, -6.0 + 0.0, 0, zF + 0.5 - 0.0, 0, 0);                         // menu board stand
  b.box(0.6, 0.05, 0.05, TC.WOOD_D, -6.0, 0.6, zF + 0.8);
  // roof: chrome vent + AC
  acUnit(b, -1.5, h + 1.05, -32.0, TC.STEEL); b.cyl(0.25, 0.25, 0.6, DN.chrome, 1.0, h + 1.05, -31, 8);
  // terrace (L2+): deck, rail, tables under parasols
  if (lvl >= 2) {
    b.box(3.8, 0.12, 6.0, TC.WOOD_L, 4.4, 0, -31.4);
    for (let z = -34.3; z < -28.4; z += 0.5) b.box(3.8, 0.02, 0.04, TC.WOOD_D, 4.4, 0.12, z);
    const rail = (xa, za, xb, zb) => { const L = Math.hypot(xb - xa, zb - za); b.box(0.05, 0.05, L, TC.CHROME, mid(xa, xb), 0.7, mid(za, zb), 0, Math.atan2(xb - xa, zb - za)); };
    rail(2.55, -28.45, 6.25, -28.45); rail(6.25, -28.45, 6.25, -34.3);
    for (const [px, pz] of [[2.55, -28.45], [4.4, -28.45], [6.25, -28.45], [6.25, -31.4], [6.25, -34.3]]) b.box(0.07, 0.75, 0.07, DN.chrome, px, 0.12, pz);
    umbrellaSet(b, 4.1, -29.9, TC.CORAL); umbrellaSet(b, 5.2, -32.6, 0x8fd0c0); if (lvl >= 3) umbrellaSet(b, 3.4, -32.8, TC.MUSTARD);
    for (const x of [2.7, 5.9]) plant(b, x, -28.7, 0.8);
  }
  // wing (L4+): taller rear block behind the terrace with its own windows and roof
  if (lvl >= 4) {
    b.box(6.6, 4.3, 3.0, DN.mint, 3.1, 0, -35.9);
    b.box(6.8, 0.5, 3.2, TC.CREAM, 3.1, 0, -35.9);
    b.box(7.0, 0.2, 3.3, TC.CREAM, 3.1, 4.3, -35.9);
    b.box(6.9, 0.12, 0.14, TC.CORAL, 3.1, 4.5, -34.3);
    win(b, g, -34.4, 1.6, 1.8, 1.8, 1.4, DN.chrome, 0xffe9c2, 1); win(b, g, -34.4, 4.6, 1.8, 1.8, 1.4, DN.chrome, 0xffe9c2, 1);
    b.box(1.0, 2.0, 0.1, DN.chrome, 6.0, 0, -34.34);
    b.box(6.6, 0.1, 0.1, DN.chrome, 3.1, 3.0, -34.37);
  }
  // rooftop seating (L5): rail round the roof of the main block, tables, stair along the terrace edge
  if (lvl >= 5) {
    const ry = h + 0.22 + 0.0, zf = zF + 0.0 - 0.1, zb = zB + 0.3;
    for (const [xa, za, xb, zb2] of [[x0 + 0.1, zf, x1 - 0.1, zf], [x0 + 0.1, zb, x1 - 0.1, zb], [x0 + 0.1, zf, x0 + 0.1, zb], [x1 - 0.1, zf, x1 - 0.1, zb]]) {
      const L = Math.hypot(xb - xa, zb2 - za); b.box(0.05, 0.05, L, DN.chrome, mid(xa, xb), ry + 0.95, mid(za, zb2), 0, Math.atan2(xb - xa, zb2 - za));
    }
    for (let x = x0 + 0.1; x <= x1; x += 1.4) for (const z of [zf, zb]) b.box(0.05, 1.0, 0.05, DN.chrome, x, ry, z);
    for (const [ux, uz, c] of [[-4.6, -30.2, TC.CORAL], [-1.2, -31.2, 0x8fd0c0], [-2.8, -32.6, TC.MUSTARD]]) umbrellaSet(b, ux, uz, c, ry);
    // stair on the terrace side: steps rising to the north, then a landing on the roof edge
    for (let i = 0; i < 9; i++) b.box(0.9, 0.12 + i * 0.37, 0.4, TC.WOOD_L, 2.75 + 0.0, 0, -29.0 - i * 0.4 - 0.0 + 0.0);
    b.box(0.06, 1.2, 3.8, DN.chrome, 3.25, 0.4, -30.8, -0.5, 0, 0);
  }
  void g;
}
function dinerSignTex() { return signTex('THE GREASY SPOON', { bg: DN.pink, fg: TC.CORAL_D, shadow: TC.CREAM_L, border: TC.CORAL, w: 1024, h: 256, size: 0.44, sub: 'DINER - OPEN', subColor: TC.NAVY }); }
export function createDiner(level = 1) {
  const lvl = clamp(Math.round(level) || 1, 1, 5);
  const group = worldGroup();
  group.add(baked(`diner|${lvl}`, (b, g) => dinerSolid(b, g, lvl)));
  const { zF, h } = DN;
  // facade sign: board above the windows
  const fs = face(dinerSignTex(), 3.4, 0.85);
  fs.position.set(-2.1, 3.15, zF + 0.1); group.add(fs);
  const nm = roofSign(dinerSignTex(), lvl >= 3 ? 5.6 : 4.4, lvl >= 3 ? 1.4 : 1.1, { board: TC.CORAL, legs: false });
  nm.position.set(-2.1, h + 1.15, -29.0); group.add(nm);
  const blink = [];
  if (lvl >= 3) {
    // big roof sign + pole sign
    const rs = roofSign(signTex('DINER', { bg: TC.CORAL, fg: TC.CREAM_L, shadow: TC.CORAL_D, border: TC.MUSTARD, w: 768, h: 256, size: 0.62, sub: 'EAT HERE', subColor: TC.CREAM }), 4.4, 1.5, { board: TC.NAVY, legs: false });
    rs.position.set(0.6, h + 1.1, -32.4); rs.scale.setScalar(0.8); group.add(rs);
    const pole = baked('diner|pole', (b) => { b.box(0.14, 5.0, 0.14, TC.STEEL_DD, 0, 0, 0); b.box(1.7, 0.12, 0.5, DN.chrome, 0, 5.0, 0); }, { receive: false });
    pole.position.set(-7.0, 0, -28.6); group.add(pole);
    const on = face(signTex('OPEN', { bg: 0x2a1b2e, fg: 0xffe27a, shadow: 0xf26b5b, border: 0xf26b5b, w: 512, h: 256, size: 0.55, dashed: false }), 1.6, 0.8);
    const off = face(signTex('EAT', { bg: 0x2a1b2e, fg: 0x8fe0d0, shadow: 0x1f7a6f, border: 0x8fe0d0, w: 512, h: 256, size: 0.55, dashed: false }), 1.6, 0.8);
    for (const f of [on, off]) { f.position.set(-7.0, 5.15, -28.34); group.add(f); }
    blink.push(on, off);
    // spoon-and-star motif (round blade)
    on.visible = true; off.visible = false;
  }
  let t = 0;
  const update = (dt) => { t += dt; if (blink.length) { const a = Math.floor(t / 0.8) % 2 === 0; blink[0].visible = a; blink[1].visible = !a; } };
  group.userData.level = lvl;
  return asBuilding(group, update);
}

// ================================================================ 4. ACADEMY "Wrench Academy"
const AC = { x0: 8.7, x1: 21.3, zB: -37.3, zF: -27.8, h: 5.2, brick: 0xb8614a, brickD: 0x96493a };
function academySolid(b, g) {
  const { x0, x1, zB, zF, h } = AC;
  body(b, { x0, x1, zB, zF, h, wall: AC.brick, base: TC.NAVY_D, baseH: 0.6, trim: TC.CREAM, roof: TC.CREAM, band: [2.55, 0.14, TC.CREAM] });
  // brick courses (thin darker lines) + corner quoins
  for (let y = 0.9; y < h - 0.3; y += 0.45) b.box(x1 - x0 + 0.03, 0.04, 0.03, AC.brickD, mid(x0, x1), y, zF + 0.01);
  for (let y = 0.6; y < h - 0.2; y += 0.8) for (const x of [x0 + 0.2, x1 - 0.2]) b.box(0.4, 0.38, 0.1, TC.CREAM, x, y, zF + 0.04);
  b.box(x1 - x0 + 0.1, 0.16, 0.12, TC.CREAM, mid(x0, x1), h - 0.3, zF + 0.05);
  // practice bay: open arch, dark floor, lit back, car on jack stands just inside
  const ax = 10.9, aw = 3.2, ah = 2.6;
  b.box(aw + 0.5, ah + 0.4, 0.14, TC.CREAM, ax, 0, zF + 0.05);
  g.box(aw, ah, 0.06, 0x3a434b, ax, 0.0, zF + 0.13);                            // the dark opening (unlit so it reads as a hole)
  g.box(aw, ah * 0.2, 0.07, 0x4a555e, ax, ah * 0.8, zF + 0.14);
    b.push(ax, 0.0, zF + 0.85, 0);
  b.box(1.4, 0.4, 2.7, TC.BLUE, 0, 0.55, 0); b.box(1.2, 0.4, 1.3, mixHex(TC.BLUE, 0xffffff, 0.2), 0, 0.95, 0.1); g.box(1.0, 0.25, 0.04, TC.GLASS, 0, 1.0, 0.77);
  b.box(1.4, 0.08, 0.5, TC.CHROME, 0, 0.6, 1.3);
  for (const sx of [-0.6, 0.6]) for (const sz of [-0.9, 0.9]) { b.cyl(0.07, 0.1, 0.5, TC.CORAL, sx, 0, sz, 6); b.box(0.2, 0.05, 0.2, TC.STEEL_DD, sx, 0.5, sz); }
  b.box(1.3, 0.05, 0.9, TC.DARK, 0, 0.95, -0.6, -0.5);                           // hood propped open
  b.pop();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.5, 0.012, 0.1, TC.MUSTARD, ax + sx * 0.95, 0.0, zF + 0.85 + sz * 1.55);                      // hazard marks on the threshold
  for (let i = 0; i < 6; i++) b.box(0.5, 0.03, 0.18, i % 2 ? TC.DARK : TC.MUSTARD, ax - 1.25 + i * 0.5, 0, zF + 0.28);
  // classroom windows
  for (const x of [10.2, 12.7, 15.2, 17.7, 20.2]) win(b, g, zF, x, 3.25, 1.4, 1.45, TC.CREAM, TC.GLASS_L, 1);
  for (const x of [17.2, 19.7]) win(b, g, zF, x, 1.0, 1.5, 1.4, TC.CREAM, TC.GLASS, 1);
  // desks glimpsed through the lower windows
  for (const x of [17.2, 19.7]) { g.box(1.0, 0.06, 0.04, TC.WOOD, x, 0.9, zF + 0.13); g.box(0.9, 0.3, 0.04, TC.NAVY_L, x, 1.5, zF + 0.13); }
  // entrance: door + steps + small porch roof
  const dx = 14.7;
  b.box(1.5, 2.2, 0.12, TC.NAVY, dx, 0, zF + 0.07); g.box(0.5, 0.9, 0.05, TC.GLASS_L, dx - 0.35, 1.0, zF + 0.14); g.box(0.5, 0.9, 0.05, TC.GLASS_L, dx + 0.35, 1.0, zF + 0.14);
  b.box(1.9, 0.12, 0.8, TC.CREAM, dx, 2.3, zF + 0.4); b.box(0.12, 2.3, 0.12, TC.CREAM, dx - 0.9, 0, zF + 0.75); b.box(0.12, 2.3, 0.12, TC.CREAM, dx + 0.9, 0, zF + 0.75);
  b.box(1.9, 0.1, 0.4, TC.CREAM_L, dx, 0, zF + 0.5); b.box(1.9, 0.1, 0.3, TC.CREAM_L, dx, 0.1, zF + 0.4);
  // horizontal banner between the floors
  // roof: cupola with a bell, AC units, a skylight over the classroom
  b.box(1.8, 1.0, 1.8, TC.CREAM, 15.0, h + 0.22, -33.0); b.box(2.1, 0.14, 2.1, AC.brickD, 15.0, h + 1.22, -33.0);
  b.box(0.9, 0.5, 0.9, TC.CREAM_L, 15.0, h + 1.36, -33.0); b.box(0.15, 0.4, 0.15, TC.GOLD, 15.0, h + 1.86, -33.0);
  g.box(0.5, 0.45, 0.04, TC.GLASS_L, 15.0, h + 0.5, -32.08);
  acUnit(b, 19.0, h + 0.22, -34.5); acUnit(b, 11.0, h + 0.22, -34.5);
  g.box(2.6, 0.08, 2.0, TC.GLASS_L, 18.8, h + 0.22, -31.0);
  // flagpole at the west corner (outside the plot edge, in the 2 m gap), chalkboard A-frame by the door
  b.box(0.18, 0.18, 0.18, TC.STEEL_DD, 8.15, 0, -28.6); b.cyl(0.05, 0.07, 7.4, TC.CHROME, 8.15, 0.18, -28.6, 6); b.cyl(0.1, 0.1, 0.1, TC.GOLD, 8.15, 7.55, -28.6, 6);
  for (const s of [-1, 1]) b.box(0.06, 0.9, 0.5, TC.WOOD_D, 16.0, 0, -28.3 + s * 0.0, s * 0.25);
  b.box(0.6, 0.55, 0.04, 0x2f3a3f, 16.0, 0.35, -28.3);
  plant(b, 13.1, -28.2, 0.9); plant(b, 12.5 + 2.9, -28.2, 0.9);
  // bike rack
  for (let i = 0; i < 3; i++) b.box(0.05, 0.5, 0.5, TC.STEEL_D, 20.2 + 0.0, 0, -29.6 + i * 0.0 - 0.0);
}
function flagTex() {
  return canvasTex('academyFlag', 128, 80, (g, w, h) => {
    g.fillStyle = css(TC.TEAL); g.fillRect(0, 0, w, h);
    g.fillStyle = css(TC.MUSTARD); g.fillRect(0, h * 0.4, w, h * 0.2);
    g.fillStyle = css(TC.CREAM_L); g.beginPath(); g.arc(w * 0.3, h * 0.5, 17, 0, 7); g.fill();
    g.fillStyle = css(TC.TEAL); g.beginPath(); g.arc(w * 0.3, h * 0.5, 7, 0, 7); g.fill();
  });
}
function bannerTex() {
  return canvasTex('academyBanner', 512, 96, (g, w, h) => {
    g.fillStyle = css(TC.NAVY); g.fillRect(0, 0, w, h);
    g.fillStyle = css(TC.MUSTARD); g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
    g.fillStyle = css(TC.CREAM_L); g.font = '700 54px "Fredoka", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ENROLL NOW - LEARN TO WRENCH', w / 2, h / 2 + 2, w - 24);
  });
}
export function createAcademy() {
  const group = worldGroup();
  group.add(baked('academy|solid', academySolid));
  const { zF, h } = AC;
  const sign = roofSign(signTex('WRENCH ACADEMY', { bg: TC.NAVY, fg: TC.CREAM_L, shadow: TC.CORAL, border: TC.MUSTARD, w: 1024, h: 256, size: 0.42, sub: 'EST. 1998 - LEARN BY DOING', subColor: TC.MUSTARD }), 6.4, 1.6, { board: TC.TEAL_D, legs: false });
  sign.position.set(16.6, h + 0.6, -29.6); group.add(sign);
  const ban = face(bannerTex(), 6.2, 0.46); ban.position.set(16.6, 2.82, zF + 0.1); group.add(ban);
  // flag (animated slightly)
  const flag = new THREE.Group(); flag.position.set(8.15, 7.0, -28.6); group.add(flag);
  const cloth = face(flagTex(), 1.5, 0.9); cloth.material = cloth.material.clone(); cloth.material.side = THREE.DoubleSide; cloth.position.set(0.8, 0, 0); cloth.rotation.y = R90; cloth.rotation.y = 0;
  flag.add(cloth);
  let t = 0;
  const update = (dt) => { t += dt; flag.rotation.y = Math.sin(t * 1.6) * 0.18; };
  return asBuilding(group, update);
}

// ================================================================ 5. SHOWROOM "Bay Classics"
const SR = PROJECT.showroom;
const SRW = { minX: SR.walls.minX, maxX: SR.walls.maxX, minZ: SR.walls.minZ, maxZ: SR.walls.maxZ, height: SR.walls.height, thickness: 0.4 };
const NICHE_X = (i) => 26.5 + i * 3.0;
function showroomSolid(b, g) {
  hallShell(b, g, SRW, { wainA: TC.NAVY, wainB: TC.NAVY_L, wallA: 0xf1e9d8, wallB: 0xe9dfca, trim: TC.GOLD, cap: TC.NAVY_D, base: 0x1b2a36, pillar: TC.NAVY, pillarBase: TC.NAVY_D, wainH: 0.9 });
  const { minX, maxX, maxZ, minZ } = SRW, d0 = SR.door.minX, d1 = SR.door.maxX;
  // low glass front: knee wall + posts + head rail (glass panes added separately), with the door gap in the middle
  const run = (xa, xb) => {
    b.box(xb - xa, 0.55, 0.3, TC.NAVY_D, mid(xa, xb), 0, maxZ);
    b.box(xb - xa, 0.07, 0.34, TC.GOLD, mid(xa, xb), 0.55, maxZ);
    b.box(xb - xa, 0.1, 0.3, TC.NAVY, mid(xa, xb), 2.5, maxZ);
    for (let x = xa; x <= xb + 0.01; x += (xb - xa) / Math.max(1, Math.round((xb - xa) / 2.0))) b.box(0.1, 2.5, 0.12, TC.NAVY, x, 0, maxZ);
  };
  run(minX + 0.5, d0); run(d1, maxX - 0.5);
  for (const x of [d0, d1]) { b.box(0.3, 2.9, 0.34, TC.NAVY, x, 0, maxZ); b.box(0.36, 0.1, 0.4, TC.GOLD, x, 2.9, maxZ); }
  b.box(d1 - d0 + 0.6, 0.12, 0.34, TC.NAVY, mid(d0, d1), 2.9, maxZ);          // door header
  b.box(d1 - d0 - 0.4, 0.02, 1.0, TC.CREAM, mid(d0, d1), 0.0, maxZ + 0.6);    // threshold mat (cream)
  b.box(d1 - d0 - 0.6, 0.025, 0.9, TC.RED, mid(d0, d1), 0.0, maxZ + 0.6);
  // spotlight cans on the back wall above each niche, aimed at the floor (small bracket + can)
  for (let i = 0; i < 6; i++) { const x = NICHE_X(i); b.box(0.08, 0.5, 0.3, TC.STEEL_DD, x, 2.0, minZ + 0.18); b.box(0.28, 0.28, 0.35, TC.DARK, x, 1.95, minZ + 0.42, 0.5); g.box(0.2, 0.05, 0.2, TC.LAMP, x, 1.88, minZ + 0.5); }
  // niches on the back wall: dark recess frame + plinth
  for (let i = 0; i < 6; i++) {
    const x = NICHE_X(i);
    b.box(2.5, 1.55, 0.06, TC.NAVY_D, x, 0.75, minZ + 0.04); b.box(2.65, 0.07, 0.1, TC.GOLD, x, 2.3, minZ + 0.05); b.box(2.65, 0.07, 0.1, TC.GOLD, x, 0.68, minZ + 0.05);
    b.box(0.07, 1.7, 0.1, TC.GOLD, x - 1.3, 0.68, minZ + 0.05); b.box(0.07, 1.7, 0.1, TC.GOLD, x + 1.3, 0.68, minZ + 0.05);
    b.box(0.9, 0.05, 0.22, TC.GOLD_D, x, 0.45, minZ + 0.12);
  }
  // reception desk at the config position, with a till + a lamp
  const dk = SR.desk;
  b.box(2.2, 1.0, 0.8, TC.NAVY, dk.x, 0, dk.z); b.box(2.4, 0.08, 1.0, TC.WOOD_L, dk.x, 1.0, dk.z); b.box(2.2, 0.15, 0.82, TC.GOLD, dk.x, 0.72, dk.z);
  b.box(0.4, 0.3, 0.3, TC.CREAM, dk.x - 0.6, 1.08, dk.z); b.box(0.3, 0.2, 0.04, TC.NAVY_D, dk.x - 0.6, 1.4, dk.z - 0.1);
  b.box(0.12, 0.3, 0.12, TC.GOLD, dk.x + 0.7, 1.08, dk.z); b.box(0.3, 0.1, 0.3, TC.CORAL, dk.x + 0.7, 1.35, dk.z);
  // chairs, plants, bench
  plant(b, 25.7, -28.4, 1.1); plant(b, 42.3, -36.3, 1.1); plant(b, 25.7, -36.3, 1.1);
  b.box(2.0, 0.1, 0.5, TC.WOOD, 31.0, 0.4, -36.5); b.box(0.1, 0.4, 0.4, TC.STEEL_DD, 30.2, 0, -36.5); b.box(0.1, 0.4, 0.4, TC.STEEL_DD, 31.8, 0, -36.5);
  // velvet-rope stanchions around each turntable's south side (low, see-through)
  for (const t of SR.turntables) {
    for (const sx of [-2.6, 2.6]) { b.cyl(0.06, 0.08, 0.8, TC.GOLD, t.x + sx, 0, t.z + 2.5, 6); }
    b.box(5.2, 0.04, 0.04, TC.RED, t.x, 0.65, t.z + 2.5);
    // price plaque on the floor in front of the plate
    b.box(0.8, 0.04, 0.4, TC.GOLD, t.x, 0.0, t.z + 2.9);
  }
  void maxX;
}
function silTex(i, lit) {
  return canvasTex(`silhouette|${i}|${lit}`, 256, 128, (g, w, h) => {
    g.fillStyle = css(lit ? 0x2b3a46 : 0x1f2a33); g.fillRect(0, 0, w, h);
    const col = lit ? [0xe5484d, 0xb88a50, 0x4fb3c8, 0xf26b2b, 0x3b6f93, 0xf6c453][i % 6] : 0x4a5864;
    g.fillStyle = css(col);
    g.beginPath(); g.roundRect(30, 66, 196, 30, 10); g.fill();                                           // body
    g.beginPath(); g.moveTo(66, 66); g.lineTo(90 + (i % 3) * 6, 40); g.lineTo(158 - (i % 2) * 14, 40); g.lineTo(190, 66); g.closePath(); g.fill();   // cabin
    g.fillStyle = css(lit ? 0x2b3a46 : 0x1f2a33); g.beginPath(); g.arc(70, 98, 17, 0, 7); g.arc(188, 98, 17, 0, 7); g.fill();
    g.fillStyle = css(lit ? TC.CREAM : 0x5c6670); g.beginPath(); g.arc(70, 98, 9, 0, 7); g.arc(188, 98, 9, 0, 7); g.fill();
    if (!lit) { g.fillStyle = css(0x8a98a2); g.font = '700 28px system-ui'; g.textAlign = 'center'; g.fillText('?', w / 2 + 2, 62); }
    g.strokeStyle = css(lit ? TC.GOLD : 0x3c4650); g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  });
}
export function createShowroom() {
  const group = worldGroup();
  group.add(floorPlane(SRW.minX, SRW.maxX, SRW.minZ, SRW.maxZ, 0.03, 'checker', 6));
  group.add(baked('showroom|solid', showroomSolid));
  const { minX, maxX, maxZ, minZ } = SRW, d0 = SR.door.minX, d1 = SR.door.maxX;
  // glass panes of the low front (see-through)
  const gp = (xa, xb) => { const n = Math.max(1, Math.round((xb - xa) / 2.0)), w = (xb - xa) / n; for (let i = 0; i < n; i++) group.add(glassPane(w - 0.1, 1.9, 0.04, xa + w * (i + 0.5), 0.6, maxZ)); };
  gp(minX + 0.5, d0); gp(d1, maxX - 0.5);
  // name: sign at the top of the back wall facing the street
  const sign = roofSign(signTex('BAY CLASSICS', { bg: TC.NAVY, fg: TC.GOLD_L, shadow: TC.NAVY_D, border: TC.GOLD, w: 1024, h: 256, size: 0.44, sub: 'RESTORED - POLISHED - SOLD', subColor: TC.CREAM }), 6.6, 1.5, { board: TC.GOLD_D, legs: true });
  sign.position.set(34, SRW.height + 0.1, minZ - 0.3); group.add(sign);
  // collection wall niches (silhouettes: dark until that classic was restored once)
  const niches = [];
  for (let i = 0; i < 6; i++) {
    const f = face(silTex(i, false), 2.3, 1.15, { lit: false });
    f.position.set(NICHE_X(i), 1.55, minZ + 0.08); group.add(f); niches.push(f);
  }
  const setCollection = (ids = []) => {
    const set = new Set(ids);
    niches.forEach((f, i) => { const on = set.has(CLASSICS[i]?.id); f.material = face(silTex(i, on), 1, 1).material; });
  };
  // turntables at the config positions
  const turntables = SR.turntables.map((t) => { const tt = createTurntable(); tt.group.position.set(t.x, 0.03, t.z); group.add(tt.group); return tt; });
  const update = (dt) => { for (const t of turntables) t.update(dt); };
  return { group, turntables, update, setCollection };
}

// ================================================================ 6. GAS STATION "Pump & Go"
// Plot x -61..-51.1, z -7..11. The traffic car enters from West Ave at (-48.8,-2), stops at VISITS.gas.path[2] = (-55,4)
// (heading south) and leaves to Harbor St. The pump island stands on the car's right (west) side; the parking bay
// (-56,8.8) and the pay pad (-52.6,9.4) stay free, so everything built here lies north of z = 7.
const GS = { isl: -57.0, lane: VISITS.gas.path[VISITS.gas.stop].x, stopZ: VISITS.gas.path[VISITS.gas.stop].z, teal: TC.TEAL, cream: 0xf6f0e2 };
function pump(b, g, x, z) {
  b.box(0.7, 0.16, 0.9, TC.STEEL_DD, x, 0.16, z);                         // pump foot
  b.box(0.46, 1.5, 0.78, GS.teal, x, 0.3, z);                              // body
  b.box(0.5, 0.2, 0.82, GS.cream, x, 1.55, z);                              // head
  b.box(0.52, 0.06, 0.84, TC.MUSTARD, x, 1.75, z);
  for (const sx of [-1, 1]) {
    g.box(0.04, 0.3, 0.5, 0x8fe8c8, x + sx * 0.25, 1.15, z);                // price display
    b.box(0.1, 0.4, 0.3, TC.DARK, x + sx * 0.3, 0.7, z - 0.02);              // nozzle holster
    b.box(0.04, 0.5, 0.04, TC.DARK, x + sx * 0.3, 0.8, z + 0.2);             // hose
    b.box(0.5, 0.05, 0.06, TC.MUSTARD, x + sx * 0.0, 0.9, z + 0.4);
  }
}
function evCharger(b, g, x, z, lit) {
  b.box(0.5, 0.1, 0.4, TC.STEEL_DD, x, 0, z);
  b.box(0.3, 1.2, 0.26, TC.CREAM_L, x, 0.1, z); b.box(0.32, 0.5, 0.28, TC.TEAL, x, 0.7, z);
  g.box.call(g, 0.18, 0.18, 0.02, lit ? 0x7dffb0 : 0x6dc0ff, x + 0.17, 1.0, z);
  b.box(0.05, 0.4, 0.05, TC.DARK, x + 0.17, 0.5, z + 0.18);
}
function priceTex() {
  return canvasTex('gasPrice', 256, 320, (g, w, h) => {
    g.fillStyle = css(GS.teal); g.fillRect(0, 0, w, h);
    g.fillStyle = css(TC.CREAM_L); g.fillRect(10, 10, w - 20, 74);
    g.fillStyle = css(TC.TEAL_D); g.font = '700 46px "Fredoka", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PUMP&GO', w / 2, 48, w - 30);
    g.fillStyle = css(0x20262c); g.fillRect(10, 96, w - 20, h - 106);
    [['REG', '1.89', 0x8fe8c8], ['PLUS', '2.09', 0xffe27a], ['DSL', '2.15', 0xff9a7a]].forEach(([n, pr, c], i) => {
      g.fillStyle = css(TC.CREAM); g.font = '600 30px "Fredoka", system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(n, 24, 142 + i * 70);
      g.fillStyle = css(c); g.font = '700 48px "Fredoka", system-ui, sans-serif'; g.textAlign = 'right'; g.fillText(pr, w - 26, 142 + i * 70);
    });
  });
}
function gasSolid(b, g, lvl) {
  const isl = GS.isl, z0 = lvl >= 3 ? 1.2 : lvl >= 2 ? 1.6 : 2.2, z1 = lvl >= 3 ? 6.6 : lvl >= 2 ? 6.2 : 5.6;
  // island + bollards + pumps
  b.box(1.2, 0.18, z1 - z0, 0xb9b4a8, isl, 0, mid(z0, z1)); b.box(1.28, 0.04, z1 - z0 + 0.08, TC.MUSTARD, isl, 0.18, mid(z0, z1));
  for (const z of [z0 + 0.1, z1 - 0.1]) for (const sx of [-0.5, 0.5]) b.cyl(0.08, 0.08, 0.7, TC.MUSTARD, isl + sx, 0.18, z, 6);
  const pumpZ = lvl >= 3 ? [2.2, 4.0, 5.8] : lvl >= 2 ? [4.0, 5.6] : [4.0];
  for (const z of pumpZ) pump(b, g, isl, z);
  // canopy: columns, fascia ring, translucent roof (panels added separately), underside lamps
  const cx0 = -58.4, cx1 = -53.6, cz0 = z0 - 0.5, cz1 = z1 + 0.2, ch = lvl >= 4 ? 4.0 : 3.5;
  for (const [x, z] of [[cx0 + 0.2, cz0 + 0.2], [cx0 + 0.2, cz1 - 0.2], [cx1 - 0.2, cz0 + 0.2], [cx1 - 0.2, cz1 - 0.2]]) {
    b.box(0.34, ch, 0.34, GS.cream, x, 0, z); b.box(0.44, 0.5, 0.44, GS.teal, x, 0, z);
  }
  const fh = lvl >= 4 ? 0.7 : 0.5;
  b.box(cx1 - cx0, fh, 0.14, GS.teal, mid(cx0, cx1), ch, cz1); b.box(cx1 - cx0, fh, 0.14, GS.teal, mid(cx0, cx1), ch, cz0);
  b.box(0.14, fh, cz1 - cz0, GS.teal, cx0, ch, mid(cz0, cz1)); b.box(0.14, fh, cz1 - cz0, GS.teal, cx1, ch, mid(cz0, cz1));
  b.box(cx1 - cx0 + 0.06, 0.1, 0.16, TC.MUSTARD, mid(cx0, cx1), ch + fh * 0.5 - 0.05, cz1 + 0.01);
  b.box(cx1 - cx0 + 0.06, 0.1, 0.16, TC.MUSTARD, mid(cx0, cx1), ch + fh * 0.5 - 0.05, cz0 - 0.01);
  b.box(cx1 - cx0, 0.07, 0.07, GS.cream, mid(cx0, cx1), ch - 0.02, mid(cz0, cz1));                       // roof beam (panels sit on it)
  b.box(0.07, 0.07, cz1 - cz0, GS.cream, mid(cx0, cx1), ch - 0.02, mid(cz0, cz1));
  for (const z of pumpZ) g.box(0.5, 0.05, 0.5, TC.LAMP, isl, ch - 0.05, z);
  // price pylon at the east edge of the plot
  b.box(0.22, 5.0 + (lvl >= 3 ? 1.0 : 0), 0.22, TC.STEEL_DD, -51.7, 0, 5.4);
  b.box(1.5, 0.12, 0.34, TC.MUSTARD, -51.7, (lvl >= 3 ? 6.0 : 5.0), 5.4);
  // kiosk (south face = front; window with pump-view, door, cashier hatch)
  const kx0 = -60.6, kx1 = lvl >= 2 ? -55.6 : -56.6, kzB = -6.6, kzF = lvl >= 5 ? -1.8 : -2.4, kh = lvl >= 5 ? 3.9 : 3.1;
  body(b, { x0: kx0, x1: kx1, zB: kzB, zF: kzF, h: kh, wall: GS.cream, base: TC.TEAL_D, baseH: 0.5, trim: GS.teal, roof: 0x8d9aa2, band: [kh - 0.7, 0.5, GS.teal] });
  win(b, g, kzF, mid(kx0, kx1) - 0.7, 0.95, kx1 - kx0 - 2.4, 1.5, TC.TEAL_D, TC.GLASS_L, Math.max(1, Math.round((kx1 - kx0 - 2.4) / 1.4)));
  b.box(1.0, 2.1, 0.1, TC.TEAL_D, kx1 - 0.7, 0, kzF + 0.06); g.box(0.6, 1.0, 0.05, TC.GLASS_L, kx1 - 0.7, 0.9, kzF + 0.12);
  for (let i = 0; i < 6; i++) b.box(0.5, 0.1, 0.8, i % 2 ? GS.cream : GS.teal, kx0 + 0.3 + i * 0.5, 2.3, kzF + 0.45, -0.5);                         // little awning
  b.box(2.6, 0.45, 0.6, TC.DARK, kx0 + 1.4, 0, kzF + 0.7); for (let i = 0; i < 3; i++) b.box(0.7, 0.3, 0.5, [TC.CORAL, TC.MUSTARD, TC.BLUE][i], kx0 + 0.6 + i * 0.8, 0.45, kzF + 0.7);   // tyre/oil display + cans
  acUnit(b, kx0 + 1.2, kh + 0.22, kzB + 1.4);
  // car wash bay (L3+): a drive-through bay east of the kiosk, brushes visible in the opening
  if (lvl >= 3) {
    const wx0 = -55.0, wx1 = -51.6, wzB = -6.6, wzF = -3.0, wh = 3.0;
    body(b, { x0: wx0, x1: wx1, zB: wzB, zF: wzF, h: wh, wall: TC.CREAM, base: TC.NAVY_D, baseH: 0.5, trim: TC.BLUE, roof: TC.STEEL_DD });
    b.box(2.4, 2.1, 0.16, TC.NAVY_D, mid(wx0, wx1), 0, wzF + 0.06);
    g.box(2.0, 1.9, 0.05, 0x2d78c0, mid(wx0, wx1), 0.0, wzF + 0.15);
    for (const sx of [-0.7, 0.7]) { b.cyl(0.18, 0.18, 1.7, TC.BLUE, mid(wx0, wx1) + sx, 0.2, wzF + 0.3, 8); b.cyl(0.22, 0.22, 0.06, TC.WHITE, mid(wx0, wx1) + sx, 1.9, wzF + 0.3, 8); }
    b.box(2.6, 0.2, 0.3, TC.BLUE, mid(wx0, wx1), 2.1, wzF + 0.28);
    b.box(0.08, 0.6, 0.08, TC.RED, wx1 - 0.2, 0, wzF + 0.5); b.box(0.4, 0.24, 0.05, TC.CREAM, wx1 - 0.2, 0.9, wzF + 0.5);
  }
  // EV chargers on the west strip (L4+) with painted stalls
  if (lvl >= 4) {
    for (let i = 0; i < 3; i++) { const z = 1.2 + i * 2.2; evCharger(b, g, -60.6, z, i === 1); b.box(1.8, 0.012, 0.08, 0x44c27d, -59.5, 0.0, z - 1.0); b.box(1.8, 0.012, 0.08, 0x44c27d, -59.5, 0.0, z + 1.1); }
    b.box(0.08, 0.012, 2.2 * 3, 0x44c27d, -58.65, 0, 3.4);
  }
  // mini-mart details (L5): rooftop sign frame, outdoor shelf with water / air station, bench
  if (lvl >= 5) {
    b.box(0.9, 0.6, 0.5, TC.BLUE, -61.0 + 1.0, 0, kzF + 0.9);
    b.box(1.6, 0.08, 0.5, TC.WOOD, -57.2, 0.45, kzF + 0.8); b.box(0.08, 0.45, 0.4, TC.STEEL_DD, -57.9, 0, kzF + 0.8); b.box(0.08, 0.45, 0.4, TC.STEEL_DD, -56.5, 0, kzF + 0.8);
    for (const x of [-59.8, -59.0]) crate(b, x, 0, kzF + 1.0, 0.5, TC.MUSTARD_D);
    plant(b, -56.0, kzF + 0.6, 0.9);
  }
  // tyre / air hose corner marker and bin on the lot edge
  b.cyl(0.25, 0.22, 0.7, TC.TEAL_D, -51.9, 0, -1.0, 8);
}
export function createGasStation(level = 1) {
  const lvl = clamp(Math.round(level) || 1, 1, 5);
  const group = worldGroup();
  group.add(baked(`gas|${lvl}`, (b, g) => gasSolid(b, g, lvl)));
  // translucent canopy roof panels
  const z0 = lvl >= 3 ? 1.2 : lvl >= 2 ? 1.6 : 2.2, z1 = lvl >= 3 ? 6.6 : lvl >= 2 ? 6.2 : 5.6, ch = lvl >= 4 ? 4.0 : 3.5;
  const roof = glassPane(4.5, 0.05, z1 - z0 + 0.5, mid(-58.4, -53.6), ch + 0.0, mid(z0 - 0.5, z1 + 0.2) + 0.0, glassTintMat);
  group.add(roof);
  // signs: canopy fascia lettering + pylon price board + kiosk roof sign
  const fasciaTex = signTex('PUMP & GO', { bg: GS.teal, fg: TC.CREAM_L, shadow: null, border: null, w: 768, h: 128, size: 0.62 });
  const ff = face(fasciaTex, 3.4, 0.5); ff.position.set(mid(-58.4, -53.6), ch + 0.25, z1 + 0.2 + 0.08); group.add(ff);
  const roofCanopySign = roofSign(signTex('PUMP & GO', { bg: GS.teal, fg: TC.CREAM_L, shadow: TC.TEAL_D, border: TC.MUSTARD, w: 1024, h: 256, size: 0.46, sub: 'FUEL - SNACKS - AIR', subColor: TC.MUSTARD }), lvl >= 5 ? 5.0 : 4.0, lvl >= 5 ? 1.3 : 1.0, { board: TC.TEAL_D, legs: false });
  const kh = lvl >= 5 ? 3.9 : 3.1;
  roofCanopySign.position.set(-58.4, kh + 0.55, -4.4); group.add(roofCanopySign);
  const top = lvl >= 3 ? 6.0 : 5.0;
  const pb = face(priceTex(), 1.4, 1.75); pb.position.set(-51.7, top - 1.0, 5.4 + 0.2); group.add(pb);
  return asBuilding(group, null);
}

// ================================================================ 7. QUICK-FIT EXPRESS
// Plot x 51.1..61, z -7..11. Main block (office + back wall) z -6.8..-0.4; open service stalls on its south side.
// Bay 0 is centred on the VISITS.quickfit stop (56, 3): traffic cars drive in heading north and stop on its lift.
const QF = { x0: 51.4, x1: 57.4, zB: -6.8, zF: -0.4, h: 3.2, lift: 0.9, coral: TC.CORAL, navy: TC.NAVY };
const QF_STOP = VISITS.quickfit.path[VISITS.quickfit.stop];
const qfBays = (lvl) => (lvl >= 2 ? [{ x: QF_STOP.x, z: QF_STOP.z }, { x: QF_STOP.x + 3.2, z: QF_STOP.z }] : [{ x: QF_STOP.x, z: QF_STOP.z }]);
function qfSolid(b, g, lvl) {
  const { x0, x1, zB, zF } = QF, h = lvl >= 5 ? 3.2 : 3.2;
  const bays = qfBays(lvl);
  body(b, { x0, x1, zB, zF, h, wall: 0xe9e4d8, base: TC.NAVY_D, baseH: 0.6, trim: QF.coral, roof: 0x8d9aa2, band: [h - 0.6, 0.45, QF.coral] });
  // stall floor (grey epoxy slab with yellow guide lines) from the block to z = 5.4 over the bays
  const fx0 = bays[0].x - 1.6, fx1 = bays.at(-1).x + 1.6;
  b.box(fx1 - fx0, 0.05, 5.8, 0xb7bec3, mid(fx0, fx1), 0.0, mid(zF, 5.4));
  for (const bay of bays) {
    for (const sx of [-1, 1]) b.box(0.08, 0.012, 5.4, TC.MUSTARD, bay.x + sx * 1.45, 0.05, mid(zF, 5.4));
    for (let i = 0; i < 5; i++) b.box(0.5, 0.012, 0.18, i % 2 ? TC.DARK : TC.MUSTARD, bay.x - 1.0 + i * 0.5, 0.05, 5.3);
    if (bay.x < 57) {
    // tool wall on the back: pegboard, bench and cart
    b.box(2.6, 0.1, 0.5, TC.STEEL_DD, bay.x, 0.9, zF + 0.3); b.box(2.6, 0.9, 0.5, TC.NAVY, bay.x, 0, zF + 0.3); b.box(2.5, 0.04, 0.55, TC.WOOD_L, bay.x, 1.0, zF + 0.3);
    g.box(2.4, 0.9, 0.04, 0x39454f, bay.x, 1.5, zF + 0.1);
    for (let i = 0; i < 7; i++) b.box(0.06, 0.4, 0.04, [TC.RED, TC.MUSTARD, TC.STEEL, TC.BLUE][i % 4], bay.x - 1.0 + i * 0.33, 1.6, zF + 0.14);
    tireUp(b, bay.x + 1.0, 0.36, zF + 1.0, 0.36, 0.26, R90);
    } else {
      // east stall: only a low workbench (the north lot behind it stays reachable: golden wrench w11 at 58.6, -5.6)
      b.box(1.3, 0.9, 0.5, TC.NAVY, bay.x - 0.8, 0, zF + 0.3); b.box(1.4, 0.04, 0.55, TC.WOOD_L, bay.x - 0.8, 0.9, zF + 0.3);
      b.box(0.5, 0.5, 0.5, TC.CORAL, bay.x - 1.0, 0.94, zF + 0.3);
    }
    // stub partition on the south side of the back wall
    if (bay.x < 57) b.box(0.2, 1.4, 1.2, QF.navy, bay.x - 1.6, 0, zF + 0.7);
  }
  // office (west part of the block): pay window at the till, door, bay doors' counter
  win(b, g, zF, 52.9, 1.1, 1.8, 1.3, TC.NAVY, TC.GLASS_L, 1);
  b.box(2.2, 0.1, 0.5, TC.WOOD_L, 52.9, 0.95, zF + 0.3); b.box(0.9, 2.0, 0.1, TC.NAVY, 51.95 - 0.0, 0, zF + 0.06 - 0.0);
  // L3: tyre tower (a rack column), waiting bench + plants
  if (lvl >= 3) {
    b.box(1.2, 0.2, 1.2, TC.STEEL_DD, 52.1, 0, 4.9);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, 3.6, 0.08, TC.STEEL_DD, 52.1 + sx * 0.55, 0.2, 4.9 + sz * 0.55);
    for (let i = 0; i < 6; i++) tireUp(b, 52.1, 0.7 + i * 0.58, 4.9, 0.33, 0.22, i % 2 ? R90 : 0);
    b.box(1.2, 0.1, 1.2, QF.coral, 52.1, 3.8, 4.9);
    b.box(1.6, 0.1, 0.5, TC.WOOD, 52.0, 0.45, 1.6); b.box(0.1, 0.45, 0.4, TC.STEEL_DD, 51.3, 0, 1.6); b.box(0.1, 0.45, 0.4, TC.STEEL_DD, 52.7, 0, 1.6);
    b.box(1.6, 0.4, 0.06, TC.WOOD, 52.0, 0.5, 1.4); plant(b, 51.7, 2.6, 0.8);
  }
  // L4: translucent-roofed canopy frame over the stalls (posts + fascia; roof panels separately)
  if (lvl >= 4) {
    const cz1 = 5.7;
    for (const x of [fx0 + 0.1, mid(fx0, fx1), fx1 - 0.1]) b.box(0.3, 3.4, 0.3, TC.NAVY, x, 0, cz1);
    b.box(fx1 - fx0 + 0.3, 0.6, 0.16, QF.coral, mid(fx0, fx1), 3.2, cz1 + 0.05);
    b.box(fx1 - fx0 + 0.3, 0.07, 0.07, TC.NAVY, mid(fx0, fx1), 3.4, mid(zF, cz1));
    for (const x of [fx0, fx1]) b.box(0.07, 0.07, cz1 - zF, TC.NAVY, x, 3.4, mid(zF, cz1));
  }
  // L5: second-storey office block over the west part + rooftop sign frame
  if (lvl >= 5) {
    const ux0 = x0 + 0.1, ux1 = 54.5, uzB = -6.5, uzF = zF - 0.2;
    b.box(ux1 - ux0, 2.6, uzF - uzB, 0xf3eee3, mid(ux0, ux1), h + 0.22, mid(uzB, uzF));
    b.box(ux1 - ux0 + 0.3, 0.2, uzF - uzB + 0.3, 0x8d9aa2, mid(ux0, ux1), h + 2.82, mid(uzB, uzF));
    b.box(ux1 - ux0 + 0.36, 0.1, 0.16, QF.coral, mid(ux0, ux1), h + 3.02, uzF + 0.1);
    win(b, g, uzF, 52.1, h + 0.9, 1.3, 1.1, TC.NAVY, TC.GLASS_L, 1); win(b, g, uzF, 53.7, h + 0.9, 1.0, 1.1, TC.NAVY, TC.GLASS_L, 1);
    acUnit(b, 52.4, h + 3.02, -4.4);
  }
  // lot clutter: oil drums + a tyre stack by the east wall, bollards by the stalls
  for (const [x, z, c] of [[60.4, -3.0, TC.RED], [60.4, -2.3, TC.BLUE]]) { b.cyl(0.3, 0.3, 0.85, c, x, 0, z, 10); b.cyl(0.31, 0.31, 0.06, TC.STEEL_DD, x, 0.6, z, 10); }
  for (let i = 0; i < 4; i++) tireFlat(b, 60.3, i * 0.26, -5.8, 0.36, 0.26);
  void zB;
}
function qfLiftGeo() {
  return bake('qf|lift', (b) => {
    for (const sx of [-1, 1]) {
      b.box(0.5, 0.14, 2.7, TC.STEEL_DD, sx * 0.55, 0, 0);
      b.box(0.5, 0.03, 2.7, TC.MUSTARD, sx * 0.55, 0.14, 0, 0);
      b.box(0.5, 0.18, 0.4, TC.STEEL_D, sx * 0.55, 0.14, 1.4, -0.3);                         // approach ramp
    }
    b.box(1.5, 0.08, 0.2, TC.STEEL_DD, 0, 0, -1.0); b.box(1.5, 0.08, 0.2, TC.STEEL_DD, 0, 0, 1.0);
  }).lit;
}
export function createQuickFit(level = 1) {
  const lvl = clamp(Math.round(level) || 1, 1, 5);
  const group = worldGroup();
  group.add(baked(`qf|${lvl}`, (b, g) => qfSolid(b, g, lvl)));
  const { zF } = QF, bays = qfBays(lvl);
  // signs
  const sign = roofSign(signTex('QUICK-FIT EXPRESS', { bg: QF.navy, fg: TC.CREAM_L, shadow: QF.coral, border: TC.MUSTARD, w: 1024, h: 256, size: lvl >= 4 ? 0.4 : 0.36, sub: 'TYRES - OIL - BRAKES - FAST', subColor: TC.MUSTARD }), lvl >= 4 ? 8.0 : 6.4, lvl >= 4 ? 1.8 : 1.5, { board: QF.coral, legs: false });
  sign.position.set(mid(QF.x0, QF.x1), QF.h + 0.55 + (lvl >= 5 ? 0.0 : 0), -3.4); group.add(sign);
  if (lvl >= 4) {
    const fx0 = bays[0].x - 1.6, fx1 = bays.at(-1).x + 1.6;
    group.add(glassPane(fx1 - fx0, 0.05, 5.7 - zF, mid(fx0, fx1), 3.4, mid(zF, 5.7), glassTintMat));
  }
  const fascia = lvl >= 4 ? face(signTex('QUICK-FIT', { bg: QF.coral, fg: TC.CREAM_L, shadow: null, border: null, w: 512, h: 96, size: 0.7 }), 3.4, 0.5) : null;
  if (fascia) { const fx0 = bays[0].x - 1.6, fx1 = bays.at(-1).x + 1.6; fascia.position.set(mid(fx0, fx1), 3.5, 5.7 + 0.15); group.add(fascia); }
  // lifts (one per bay), work lamps, spark meshes
  const lg = qfLiftGeo();
  const colMat = new THREE.MeshLambertMaterial({ color: TC.STEEL_D });
  const lampOn = new THREE.MeshBasicMaterial({ color: 0xfff1b8 }), lampOff = new THREE.MeshLambertMaterial({ color: 0x4a5560 });
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc04a });
  const colGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 8); colGeo.translate(0, 0.5, 0);
  const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  const state = bays.map((bay) => {
    const lift = new THREE.Group(); lift.position.set(bay.x, 0.05, bay.z); group.add(lift);
    const deck = mesh(lg, litMat, { cast: true, receive: true }); lift.add(deck);
    const col = new THREE.Mesh(colGeo, colMat); col.position.y = 0.0; col.castShadow = true; col.scale.y = 0.01; lift.add(col);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.22), lampOff); lamp.position.set(bay.x + 1.0, 2.4, zF + 0.3); group.add(lamp);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.9), new THREE.MeshLambertMaterial({ color: TC.STEEL_DD })); arm.position.set(bay.x + 1.0, 2.5, zF + 0.5); group.add(arm);
    const sparks = [0, 1, 2, 3, 4].map(() => { const m = new THREE.Mesh(sparkGeo, sparkMat); m.visible = false; group.add(m); return m; });
    return { bay, lift, deck, col, lamp, sparks, h: 0, target: 0, busy: false, t: Math.random() * 9 };
  });
  function setBusy(i, on) { const s = state[i]; if (!s) return; s.busy = !!on; s.target = on ? QF.lift : 0; s.lamp.material = on ? lampOn : lampOff; if (!on) for (const m of s.sparks) m.visible = false; }
  const liftHeight = (i) => state[i]?.h ?? 0;
  function update(dt) {
    for (const s of state) {
      const d = s.target - s.h;
      if (Math.abs(d) > 0.001) { s.h += Math.sign(d) * Math.min(Math.abs(d), dt * 0.9); s.lift.position.y = 0.05 + s.h; s.col.scale.y = Math.max(0.01, s.h); }
      if (s.busy && Math.abs(s.target - s.h) < 0.02) {
        s.t += dt;
        for (let k = 0; k < s.sparks.length; k++) {
          const m = s.sparks[k], ph = (s.t * 6 + k * 0.7) % 1;
          m.visible = ph < 0.55 && Math.sin(s.t * 3 + k) > -0.3;
          const a = k * 1.7 + Math.floor(s.t * 6 + k * 0.7) * 2.3;
          m.position.set(s.bay.x + (k % 2 ? 0.95 : -0.95) + Math.cos(a) * 0.2 * ph, 0.05 + s.h + 0.35 + ph * 0.25 - ph * ph * 0.35, s.bay.z + 0.5 * (k % 3 - 1) * 0.6 + Math.sin(a) * 0.2 * ph);
        }
      }
    }
  }
  group.userData.bays = bays;
  return { group, setBusy, update, liftHeight, bays, level: lvl };
}

// ================================================================ 8. FERRY TERMINAL
// Plaza x 50.5..61, z 15.5..23.5. The ferry's ramp lands at x = 50.8, z 18.55..22.05 and the lane to it (z 18.4..22.2,
// x 50.5..61, with the pay pad at (56,20)) stays free; the 'ferry' parking bay is x 53.5..55.5, z 15.6..19.2.
// Everything stands in the 2.9 m strip north of that lane (z 15.7..18.2).
const FT = { x0: 57.4, x1: 60.8, zB: 15.75, zF: 18.05, h: 3.3, navy: TC.NAVY, white: 0xf4f1ea };
function clockTex() {
  return canvasTex('ferryClock', 256, 256, (g, w, h) => {
    g.fillStyle = css(TC.NAVY_D); g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
    g.fillStyle = css(TC.CREAM_L); g.beginPath(); g.arc(128, 128, 110, 0, 7); g.fill();
    g.fillStyle = css(TC.NAVY);
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.save(); g.translate(128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92); g.rotate(a); g.fillRect(-4, -(i % 3 ? 8 : 14), 8, i % 3 ? 16 : 28); g.restore(); }
  });
}
function boardTex() {
  return canvasTex('ferryBoard', 512, 320, (g, w, h) => {
    g.fillStyle = css(TC.NAVY); g.fillRect(0, 0, w, h);
    g.fillStyle = css(TC.MUSTARD); g.fillRect(0, 0, w, 60);
    g.fillStyle = css(TC.NAVY); g.font = '700 40px "Fredoka", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FERRY TIMES', w / 2, 32);
    g.textAlign = 'left';
    [['08:30', 'NEW HARBOR', 0x8fe8c8], ['12:00', 'NEW HARBOR', 0x8fe8c8], ['17:45', 'LAST BOAT', 0xffb08a]].forEach(([t, n, c], i) => {
      g.fillStyle = css(TC.CREAM_L); g.font = '700 44px "Fredoka", system-ui, sans-serif'; g.fillText(t, 26, 108 + i * 70);
      g.fillStyle = css(c); g.font = '600 36px "Fredoka", system-ui, sans-serif'; g.fillText(n, 200, 108 + i * 70);
    });
  });
}
function ferrySolid(b, g) {
  const { x0, x1, zB, zF, h } = FT, cx = mid(x0, x1);
  body(b, { x0, x1, zB, zF, h, wall: FT.white, base: TC.NAVY_D, baseH: 0.5, trim: FT.navy, roof: 0x8d9aa2, band: [h - 0.7, 0.35, FT.navy] });
  for (let x = x0 + 0.2; x < x1 - 0.2; x += 0.5) b.box(0.25, 0.3, 0.05, TC.CORAL, x, 1.9 - 0.0, zF + 0.03);          // nautical stripe dashes
  // ticket window with a counter, door
  win(b, g, zF, x0 + 1.1, 1.05, 1.5, 1.1, FT.navy, TC.GLASS_L, 1);
  b.box(1.9, 0.1, 0.45, TC.WOOD_L, x0 + 1.1, 0.9, zF + 0.28); b.box(1.9, 0.9, 0.4, FT.navy, x0 + 1.1, 0, zF + 0.25);
  b.box(0.95, 2.0, 0.1, FT.navy, x1 - 0.8, 0, zF + 0.06); g.box(0.5, 0.8, 0.05, TC.GLASS_L, x1 - 0.8, 0.95, zF + 0.12);
  for (let i = 0; i < 5; i++) b.box(0.4, 0.1, 0.7, i % 2 ? FT.white : TC.CORAL, x0 + 0.4 + i * 0.4, 2.35, zF + 0.4, -0.5);   // awning
  // clock tower on the roof (the clock face is a separate plane)
  b.box(1.3, 1.6, 1.3, FT.white, cx, h + 0.22, mid(zB, zF) + 0.2); b.box(1.5, 0.14, 1.5, FT.navy, cx, h + 1.82, mid(zB, zF) + 0.2);
  b.box(0.8, 0.5, 0.8, FT.navy, cx, h + 1.96, mid(zB, zF) + 0.2); b.box(0.12, 0.5, 0.12, TC.GOLD, cx, h + 2.46, mid(zB, zF) + 0.2);
  // lifebuoy rack + bollard + crates on the quay side
  b.cyl(0.3, 0.3, 0.05, TC.RED, x1 + 0.0 - 0.0, 1.2, zF + 0.04, 12, R90);
  // waiting canopy with a bench (x 55.8..57.2): posts + roof (translucent panel separately) + bench
  const cx0 = 55.7, cx1 = 57.3, cz0 = 15.8, cz1 = 17.9;
  for (const [x, z] of [[cx0 + 0.1, cz1 - 0.1], [cx1 - 0.1, cz1 - 0.1], [cx0 + 0.1, cz0 + 0.1]]) b.box(0.12, 2.5, 0.12, FT.navy, x, 0, z);
  b.box(cx1 - cx0, 0.1, cz1 - cz0, FT.navy, mid(cx0, cx1), 2.5, mid(cz0, cz1));
  b.box(1.3, 0.08, 0.42, TC.WOOD, mid(cx0, cx1), 0.45, cz0 + 0.45); b.box(1.3, 0.35, 0.06, TC.WOOD, mid(cx0, cx1), 0.55, cz0 + 0.22);
  b.box(0.08, 0.45, 0.4, TC.STEEL_DD, cx0 + 0.2, 0, cz0 + 0.45); b.box(0.08, 0.45, 0.4, TC.STEEL_DD, cx1 - 0.2, 0, cz0 + 0.45);
  // timetable board on two posts, west of the canopy (clear of the parking bay x 53.5..55.5)
  // gangway barrier posts (the swinging arm is separate)
  for (const z of [18.55, 22.1]) { b.box(0.3, 1.1, 0.3, FT.navy, 52.3, 0, z); b.box(0.34, 0.08, 0.34, TC.MUSTARD, 52.3, 1.1, z); }
  b.box(0.08, 0.7, 0.08, TC.STEEL_D, 52.3, 0.0, 22.1 + 0.2);
  // quay mooring ring + crate stack by the corner
  for (let i = 0; i < 3; i++) crate(b, 60.3, i * 0.52 * 0.8, 22.7, 0.6, [TC.MUSTARD_D, TC.CORAL, TC.TEAL][i]);
  plant(b, 57.0, 18.3, 0.8); plant(b, 60.8, 18.4, 0.8);
  void g;
}
export function createFerryTerminal() {
  const group = worldGroup();
  group.add(baked('ferry|solid', ferrySolid));
  const { x0, x1, zF, h } = FT, cx = mid(x0, x1), tz = mid(FT.zB, zF) + 0.2;
  // translucent roof of the waiting canopy
  group.add(glassPane(1.6, 0.04, 2.1, 56.5, 2.62, 16.85, glassTintMat));
  // clock face + hands (real time)
  const ck = face(clockTex(), 1.0, 1.0, { lit: false }); ck.position.set(cx, h + 0.95, tz + 0.66); group.add(ck);
  const mkHand = (len, w, c) => { const p = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.02), new THREE.MeshBasicMaterial({ color: c })); m.position.y = len / 2 - 0.04; p.add(m); p.position.set(cx, h + 0.95, tz + 0.675); group.add(p); return p; };
  const hh = mkHand(0.24, 0.045, TC.NAVY_D), mh = mkHand(0.36, 0.03, TC.NAVY_D);
  // names / signs: roof sign facing the camera, timetable board
  const sign = face(signTex('FERRY TICKETS', { bg: TC.NAVY, fg: TC.CREAM_L, shadow: null, border: TC.MUSTARD, w: 768, h: 160, size: 0.5 }), 3.0, 0.52);
  sign.position.set(cx, 2.85, zF + 0.1); group.add(sign);
  const board = face(boardTex(), 1.5, 0.94, { lit: true }); board.position.set(53.3 - 0.0, 1.5, 16.2); group.add(board);
  group.add(mesh(bake('ferry|boardPosts', (b) => { b.box(0.08, 1.7, 0.08, TC.STEEL_DD, 52.5, 0, 16.15); b.box(0.08, 1.7, 0.08, TC.STEEL_DD, 54.1, 0, 16.15); b.box(1.8, 0.08, 0.14, TC.NAVY, 53.3, 2.0, 16.15); }).lit, litMat, { cast: true }));
  board.position.set(53.3, 1.45, 16.25);
  // gangway barrier arm: hinged at the south post, closed = lying across the lane, open = standing up
  const arm = new THREE.Group(); arm.position.set(52.3, 1.0, 22.1);
  arm.add(mesh(bake('ferry|arm', (b) => { for (let i = 0; i < 8; i++) b.box(0.1, 0.1, 0.46, i % 2 ? TC.RED : TC.WHITE, 0, 0, -0.23 - i * 0.46); b.box(0.2, 0.2, 0.2, TC.STEEL_DD, 0, -0.05, 0.0); }).lit, litMat, { cast: true }));
  group.add(arm);
  let open = 0;
  const setOpen = (k) => { open = clamp(+k || 0, 0, 1); arm.rotation.x = -open * (Math.PI / 2 - 0.05); };
  setOpen(0);
  const update = () => {
    const d = new Date(), m = d.getMinutes() + d.getSeconds() / 60, hr = (d.getHours() % 12) + m / 60;
    mh.rotation.z = -m / 60 * Math.PI * 2; hh.rotation.z = -hr / 12 * Math.PI * 2;
  };
  update();
  const g = asBuilding(group, update);
  g.setOpen = setOpen; g.userData.setOpen = setOpen;
  return g;
}

void [PROPERTIES, TOWN, PI, glassMat, plant, LUNCH];
