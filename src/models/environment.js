// The whole static world of Wrench Bay + Harbor Town (TOWN.md section 8).
// This file: the legacy garage lot (hall, forecourt, patio; from LAYOUT), the water, and the assembly of every
// env-* module into per-area merged chunk meshes. Streets: env-streets.js. Terrain, quay, tunnels, backdrop:
// env-terrain.js. Filler buildings: env-town.js. Harbor dressing + street life: env-harbor.js / env-life.js (envdress).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE as P, LAYOUT as L } from '../config.js';
import { TOWN } from '../config.town.js';
import { Builder, litMat, glowMat, mesh, polygon, mulberry32 } from './voxel.js';
import {
  PI, CREAM, PAINTW as PAINT, CORAL, NAVY, FONT, css, mixHex, canvasTex, waterTex, plane, flat, arrow, stripes,
  tree, bush, tireStack, drum, layers, SignAtlas, solids, surface,
} from './env-kit.js';
import { buildStreets, streetGeo } from './env-streets.js';
import * as Terrain from './env-terrain.js';
import * as Town from './env-town.js';
// Namespace imports: a missing export (envdress mid-edit) must not break the module graph.
import * as Harbor from './env-harbor.js';
import * as Life from './env-life.js';

// ------------------------------------------------------------------ textures
function hallFloorTex(repeat) {
  return canvasTex(512, 512, (g, w, h) => {
    const rnd = mulberry32(11), n = 8, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = '#' + mixHex(P.floorA, P.floorB, ((i + j) % 2) * 0.45 + rnd() * 0.35).getHexString();
      g.fillRect(i * s, j * s, s, s);
      for (let k = 0; k < 5; k++) {
        g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(80,100,110,0.06)';
        g.fillRect(i * s + rnd() * s, j * s + rnd() * s, 6 + rnd() * 18, 2);
      }
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(i * s, j * s, s, 2); g.fillRect(i * s, j * s, 2, s);
      g.fillStyle = 'rgba(70,95,110,0.22)'; g.fillRect(i * s, j * s + s - 2, s, 2); g.fillRect(i * s + s - 2, j * s, 2, s);
    }
  }, repeat);
}

function forecourtTex(repeat) {
  return canvasTex(512, 512, (g, w, h) => {
    const rnd = mulberry32(5), n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = '#' + mixHex(P.forecourt, P.forecourtB, rnd() * 0.8).getHexString();
      g.fillRect(i * s, j * s, s, s);
      for (let k = 0; k < 30; k++) {
        g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(120,100,70,0.07)';
        g.fillRect(i * s + rnd() * s, j * s + rnd() * s, 2 + rnd() * 5, 2 + rnd() * 5);
      }
      g.fillStyle = 'rgba(110,90,60,0.28)'; g.fillRect(i * s, j * s, s, 3); g.fillRect(i * s, j * s, 3, s);
    }
  }, repeat);
}

function deckTex(repeat) {
  return canvasTex(256, 256, (g, w, h) => {
    const rnd = mulberry32(9), n = 8, s = h / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = '#' + mixHex(P.wood, 0xc58b5c, rnd()).getHexString();
      g.fillRect(0, i * s, w, s);
      g.fillStyle = 'rgba(80,45,20,0.45)'; g.fillRect(0, i * s + s - 2, w, 2);
      g.fillStyle = 'rgba(255,230,190,0.25)'; g.fillRect(0, i * s, w, 2);
      const j = rnd() * w; g.fillStyle = 'rgba(80,45,20,0.4)'; g.fillRect(j, i * s, 2, s);
      for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(90,55,30,0.12)'; g.fillRect(rnd() * w, i * s + 3 + rnd() * (s - 6), 20 + rnd() * 50, 1.5); }
    }
  }, repeat);
}

function signTex() {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = css(NAVY); g.fillRect(0, 0, w, h);
    g.strokeStyle = css(P.accent); g.lineWidth = 8; g.setLineDash([26, 16]);
    g.strokeRect(16, 16, w - 32, h - 32); g.setLineDash([]);
    g.font = `700 112px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = css(CORAL); g.fillText('WRENCH BAY', w / 2 + 6, h / 2 + 10);
    g.fillStyle = css(CREAM); g.fillText('WRENCH BAY', w / 2, h / 2 + 3);
    for (const sx of [1, -1]) {         // wrench icons on both sides
      g.save(); g.translate(w / 2 + sx * 440, h / 2); g.rotate(sx * 0.7);
      g.fillStyle = css(P.accent);
      g.fillRect(-9, -52, 18, 104);
      g.beginPath(); g.arc(0, -52, 24, 0, 7); g.fill();
      g.fillStyle = css(NAVY); g.fillRect(-9, -84, 18, 28);
      g.fillStyle = css(P.accent); g.beginPath(); g.arc(0, 56, 20, 0, 7); g.fill();
      g.fillStyle = css(NAVY); g.fillRect(-7, 56, 14, 24);
      g.restore();
    }
  });
}

function pickupTex() {
  return canvasTex(512, 128, (g, w, h) => {
    g.font = `700 86px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(80,60,30,0.25)'; g.fillText('PICK-UP', w / 2 + 3, h / 2 + 6);
    g.fillStyle = css(P.accent); g.fillText('PICK-UP', w / 2, h / 2 + 2);
  });
}

// atlas: pegboards, posters, clock. cells are 256 x 384 (clock 256 x 256 at col 3 row 1)
const ATLAS = 1024;
const CELL = { pegA: [0, 0], pegB: [256, 0], p1: [512, 0], p2: [768, 0], p3: [0, 384], p4: [256, 384], clock: [768, 384] };
function atlasTex() {
  return canvasTex(ATLAS, ATLAS, (g) => {
    const cell = (key, fn) => { const [x, y] = CELL[key]; g.save(); g.translate(x, y); fn(g); g.restore(); };
    const bg = '#d9c9a5';
    const tool = (g, col, fn) => {
      g.save(); g.translate(5, 6); g.fillStyle = 'rgba(70,50,20,0.22)'; fn('rgba(70,50,20,0.22)'); g.restore();
      g.fillStyle = col; fn(col);
    };
    const wrench = (g, x, y, len, rot, col) => tool(g, col, (c) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = c;
      g.fillRect(-8, -len / 2, 16, len);
      g.beginPath(); g.arc(0, -len / 2, 19, 0, 7); g.fill();
      g.beginPath(); g.arc(0, len / 2, 17, 0, 7); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.fillRect(-7, -len / 2 - 26, 14, 18); g.fillRect(-6, len / 2 + 6, 12, 16);
      g.restore();
    });
    const hammer = (g, x, y, len, rot, col, head) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = 'rgba(70,50,20,0.22)'; g.fillRect(-4, -len / 2 + 6, 16, len); g.fillRect(-30, -len / 2 + 6, 62, 24);
      g.fillStyle = css(P.woodDark); g.fillRect(-7, -len / 2, 14, len);
      g.fillStyle = head; g.fillRect(-34, -len / 2 - 6, 64, 24); g.fillRect(-34, -len / 2 + 2, 14, 12);
      g.fillStyle = col; g.fillRect(-7, len / 2 - 40, 14, 40);
      g.restore();
    };
    const driver = (g, x, y, len, col) => {
      g.fillStyle = 'rgba(70,50,20,0.22)'; g.fillRect(x - 3, y + 6, 8, len); g.fillRect(x - 9, y + 6, 20, 46);
      g.fillStyle = css(P.steel); g.fillRect(x - 4, y, 8, len);
      g.fillStyle = col; g.fillRect(x - 10, y - 4, 20, 46);
    };
    const pliers = (g, x, y, rot) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = 'rgba(70,50,20,0.22)'; g.fillRect(-14, 6, 34, 92);
      g.fillStyle = css(P.steelDark);
      g.fillRect(-12, -30, 24, 56);
      g.fillStyle = css(CORAL); g.save(); g.rotate(0.18); g.fillRect(-12, 20, 11, 70); g.restore(); g.save(); g.rotate(-0.18); g.fillRect(1, 20, 11, 70); g.restore();
      g.restore();
    };
    for (const k of ['pegA', 'pegB']) cell(k, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, 256, 384);
      g.fillStyle = 'rgba(100,80,45,0.35)';
      for (let i = 0; i < 12; i++) for (let j = 0; j < 18; j++) { g.beginPath(); g.arc(11 + i * 21.5, 11 + j * 21.5, 2.6, 0, 7); g.fill(); }
      g.strokeStyle = css(P.woodDark); g.lineWidth = 8; g.strokeRect(4, 4, 248, 376);
      if (k === 'pegA') {
        wrench(g, 62, 120, 130, 0.0, css(NAVY)); wrench(g, 130, 130, 110, 0.0, css(P.steelDark));
        hammer(g, 200, 130, 150, 0.0, css(CORAL), css(P.steelDark));
        pliers(g, 70, 270, 0); driver(g, 140, 250, 90, css(P.accent)); driver(g, 180, 250, 90, css(P.teal)); driver(g, 215, 250, 90, css(CORAL));
      } else {
        hammer(g, 70, 110, 150, 0.0, css(P.teal), css(NAVY));
        wrench(g, 140, 120, 120, 0.0, css(CORAL)); wrench(g, 195, 110, 100, 0.0, css(NAVY));
        g.fillStyle = 'rgba(70,50,20,0.22)'; g.beginPath(); g.arc(75, 285, 44, 0, 7); g.fill(); // tape
        g.fillStyle = css(P.accent); g.beginPath(); g.arc(70, 280, 44, 0, 7); g.fill();
        g.fillStyle = bg; g.beginPath(); g.arc(70, 280, 20, 0, 7); g.fill();
        pliers(g, 160, 250, 0.1); driver(g, 215, 250, 90, css(P.accent));
      }
    });
    const poster = (g, bgc, draw) => {
      g.fillStyle = css(CREAM); g.fillRect(0, 0, 256, 384);
      g.fillStyle = css(bgc); g.fillRect(12, 12, 232, 360);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      draw(g);
    };
    cell('p1', (g) => poster(g, CORAL, (g) => {
      g.fillStyle = css(CREAM); g.font = `700 54px ${FONT}`; g.fillText('TIRE', 128, 62); g.fillText('SALE', 128, 116);
      g.fillStyle = '#2b2f36'; g.beginPath(); g.arc(128, 232, 70, 0, 7); g.fill();
      g.fillStyle = css(P.steel); g.beginPath(); g.arc(128, 232, 34, 0, 7); g.fill();
      g.fillStyle = '#2b2f36'; g.beginPath(); g.arc(128, 232, 10, 0, 7); g.fill();
      g.fillStyle = css(P.accent); g.font = `700 48px ${FONT}`; g.fillText('-30%', 128, 335);
    }));
    cell('p2', (g) => poster(g, P.accent, (g) => {
      g.fillStyle = css(NAVY); g.font = `700 50px ${FONT}`; g.fillText('OIL', 128, 62); g.fillText('CHANGE', 128, 118);
      g.fillStyle = css(NAVY); g.beginPath(); g.moveTo(128, 150); g.quadraticCurveTo(200, 250, 128, 296); g.quadraticCurveTo(56, 250, 128, 150); g.fill();
      g.fillStyle = css(P.accent); g.font = `700 38px ${FONT}`; g.fillText('$$', 128, 327);
    }));
    cell('p3', (g) => poster(g, P.teal, (g) => {
      g.fillStyle = css(CREAM); g.font = `700 44px ${FONT}`; g.fillText('FAST &', 128, 60); g.fillText('FIXED', 128, 112);
      g.fillStyle = css(CORAL); g.fillRect(40, 240, 176, 46); g.fillRect(70, 200, 112, 46);
      g.fillStyle = '#bfe6f2'; g.fillRect(82, 208, 40, 30); g.fillRect(130, 208, 40, 30);
      g.fillStyle = '#2b2f36'; g.beginPath(); g.arc(80, 290, 20, 0, 7); g.arc(176, 290, 20, 0, 7); g.fill();
      g.fillStyle = css(CREAM); g.font = `700 30px ${FONT}`; g.fillText('SINCE TODAY', 128, 345);
    }));
    cell('p4', (g) => poster(g, 0xf3e6c8, (g) => {
      g.fillStyle = css(NAVY); g.font = `700 36px ${FONT}`; g.fillText('SHOP', 128, 56); g.fillText('RULES', 128, 98);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = css(P.teal); g.fillRect(40, 150 + i * 52, 22, 22);
        g.fillStyle = 'rgba(47,72,88,0.6)'; g.fillRect(76, 158 + i * 52, 120 - (i % 2) * 30, 8);
      }
    }));
    cell('clock', (g) => {
      g.fillStyle = css(CREAM); g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill();
      g.strokeStyle = css(CORAL); g.lineWidth = 14; g.beginPath(); g.arc(128, 128, 116, 0, 7); g.stroke();
      g.fillStyle = css(NAVY);
      for (let i = 0; i < 12; i++) { const a = i * PI / 6; g.fillRect(128 + Math.sin(a) * 90 - 5, 128 - Math.cos(a) * 90 - 5, 10, 10); }
    });
  });
}

export function buildEnvironment(scene) {
  const root = new THREE.Group();
  const rnd = mulberry32(2024);
  const W = L.walls, F = L.forecourt, ST = L.street;
  const H = W.height, T = W.thickness;
  const bounds = L.bounds;

  // Every area builds into the same three chunked layers (per ~30 m chunk one mesh each, so the frustum culls):
  // S solid lit (casts shadows), F flat ground paint (receives only), G glowing / unlit bits.
  const { S, F: FL, G } = layers();
  const solid = S, paint = FL, glow = G;
  const signs = new SignAtlas();
  solids.length = 0;                                   // townSolids registry (rebuilt with the world)
  const anim = { clockHands: null, water: null };

  // ---------------- town ground, roads, sidewalks, markings, lots (env-streets.js)
  const geo = buildStreets(root, { S, F: FL }, signs, rnd);
  // ---------------- terrain, cliffs, tunnels, quay edge (env-terrain.js)
  const terrainInfo = Terrain.buildTerrain(root);
  Terrain.buildCliffs(S, FL, G, mulberry32(31));
  Terrain.buildQuay(root, S, FL, mulberry32(32), surface);
  // ---------------- filler buildings + backdrop (env-town.js)
  Town.buildFillers(root, { S, F: FL, G }, signs, mulberry32(41));
  Town.buildBackdrop(root, { S, F: FL, G }, signs, mulberry32(42), surface);

  // ---------------- legacy lot floors (textured planes)
  const hallW = W.maxX - W.minX, hallD = W.maxZ - W.minZ;
  const hallTexRep = 1.3;
  const hallFloor = plane(hallW, hallD, 0, 0.012, (W.minZ + W.maxZ) / 2,
    new THREE.MeshLambertMaterial({ map: hallFloorTex([hallW / (8 * hallTexRep), hallD / (8 * hallTexRep)]) }));
  root.add(hallFloor);

  const fW = F.maxX - F.minX, fD = F.maxZ - F.minZ;
  root.add(plane(fW, fD, (F.minX + F.maxX) / 2, 0, (F.minZ + F.maxZ) / 2,
    new THREE.MeshLambertMaterial({ map: forecourtTex([fW / 9.2, fD / 9.2]) })));

  // driveways: entry (down the left) and exit (down the right), derived from the car polylines.
  // They stop at the sidewalk: env-streets paints the flush driveway cut through it.
  const laneHalf = 1.2;
  const dw = 1.0;                                    // half width of a driveway
  const eX = L.carEntry[1].x, xX = L.carExit[0].x;
  const swZ0 = F.maxZ;

  // driveway slabs (flat, at paint level)
  const dwTone = 0x6c7080;
  flat(paint, eX - dw, eX + dw, L.queueLaneZ + laneHalf + 0.05, swZ0, 0.0, 0.02, dwTone);
  flat(paint, xX - dw, xX + dw, L.exitLaneZ + 0.9, swZ0, 0.0, 0.02, dwTone);
  flat(paint, F.maxX - 0.01, xX + dw, L.exitLaneZ - 0.9, L.exitLaneZ + 0.9, 0.0, 0.02, dwTone);
  // driveway edge lines
  for (const sx of [-1, 1]) {
    flat(paint, eX + sx * dw - 0.04, eX + sx * dw + 0.04, L.queueLaneZ + laneHalf + 0.05, swZ0, 0.02, 0.012, PAINT);
    flat(paint, xX + sx * dw - 0.04, xX + sx * dw + 0.04, L.exitLaneZ + 0.9, swZ0, 0.02, 0.012, PAINT);
  }
  arrow(paint, eX, 10.4, '-z', 1.3, PAINT, 0.3, 0.8);
  arrow(paint, xX, 7.4, '+z', 1.3, PAINT, 0.3, 0.8);


  // ---------------- hall floor markings
  const hz = W.maxZ;
  // painted strip in front of the parts wall
  const stripZ0 = L.stations.tire.z + 0.7, stripZ1 = L.stations.tire.z + 2.4;
  flat(paint, -bounds.maxX + 0.0, bounds.maxX, stripZ0, stripZ1, 0.0, 0.025, 0xb4c3c8);
  flat(paint, -bounds.maxX, bounds.maxX, stripZ1 - 0.12, stripZ1, 0.025, 0.012, P.bayLine);
  for (const k of Object.values(L.stations)) {
    // little pickup mat in front of each station slot
    flat(paint, k.x - 0.95, k.x + 0.95, k.z + L.stationPickupOffsetZ - 0.55, k.z + L.stationPickupOffsetZ + 0.55, 0.025, 0.01, 0xa3b4ba);
  }
  // bay markings for every lift
  L.lifts.forEach((l) => {
    const hw = 1.72, hl = 2.05, t = 0.1, cl = 0.7;
    flat(paint, l.x - 1.3, l.x + 1.3, l.z - 1.55, l.z + 1.55, 0.0, 0.025, 0xb9c6cc);
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [cx, cz] of corners) {
      const x = l.x + cx * hw, z = l.z + cz * hl;
      flat(paint, Math.min(x, x - cx * cl), Math.max(x, x - cx * cl), z - t / 2, z + t / 2, 0.025, 0.012, P.bayLine);
      flat(paint, x - t / 2, x + t / 2, Math.min(z, z - cz * cl), Math.max(z, z - cz * cl), 0.025, 0.012, P.bayLine);
    }
    // dashed guide line towards the garage front
    for (let z = l.z + hl + 0.35; z < hz - 0.9; z += 0.7) flat(paint, l.x - 0.04, l.x + 0.04, z, z + 0.35, 0.025, 0.01, 0xe6e9ea);
  });
  // threshold / hazard line at the open front
  stripes(paint, W.minX, W.maxX, hz - 0.02, 0.4, P.hazardA, P.hazardB);
  flat(paint, W.minX, W.maxX, hz - 0.44, hz - 0.4, 0.03, 0.01, P.hazardB);
  // floor stains + tyre marks
  for (const [x, z, r] of [[-4.2, -1.2, 0.45], [3.6, -6.0, 0.35], [-0.8, -5.9, 0.28], [7.2, -0.6, 0.4], [-8.0, -2.0, 0.3]]) {
    paint.cyl(r, r, 0.012, 0xb5c0c6, x, 0.025, z, 12);
    paint.cyl(r * 0.5, r * 0.5, 0.012, 0xa4b1b8, x + 0.07, 0.036, z - 0.05, 10);
  }
  for (const z of [-0.2, 0.3]) for (const x of [-3.9, -0.3, 4.2]) flat(paint, x, x + 1.4, z, z + 0.06, 0.025, 0.008, 0xb3bfc5);
  // floor drain
  for (const x of [-4.2, 4.2]) { flat(paint, x - 0.3, x + 0.3, -7.0 - 0.3, -7.0 + 0.3, 0.025, 0.012, 0x7d8991); for (let i = -1; i <= 1; i++) flat(paint, x - 0.22, x + 0.22, -7.0 + i * 0.12 - 0.02, -7.0 + i * 0.12 + 0.02, 0.037, 0.006, 0x4b555d); }

  // ---------------- forecourt markings
  const qz = L.queueLaneZ;
  const laneTone = 0xc7baa0;
  const slots = L.queueSlots;
  const slotGap = Math.abs(slots[0].x - slots[1].x);
  const laneX0 = eX - dw, laneX1 = slots[0].x + slotGap / 2 + 0.2;
  flat(paint, laneX0, laneX1, qz - laneHalf - 0.05, qz + laneHalf + 0.05, 0.0, 0.02, laneTone);
  // slot lines
  const edges = slots.map((s) => s.x - slotGap / 2).concat([slots[0].x + slotGap / 2]);
  const lastEdge = Math.min(...edges);
  for (const ex of edges) flat(paint, ex - 0.05, ex + 0.05, qz - laneHalf, qz + laneHalf, 0.02, 0.012, PAINT);
  flat(paint, lastEdge, slots[0].x + slotGap / 2, qz - laneHalf - 0.05, qz - laneHalf + 0.05, 0.02, 0.012, PAINT);
  flat(paint, lastEdge, slots[0].x + slotGap / 2, qz + laneHalf - 0.05, qz + laneHalf + 0.05, 0.02, 0.012, PAINT);
  // slot numbers as small chevrons (front of the car, +x)
  slots.forEach((s, i) => {
    for (let k = 0; k <= 0; k++) arrow(paint, s.x + 1.18, qz, '+x', 0.4, P.bayLine, 0.1, 0.34);
  });
  arrow(paint, eX + 1.8, qz, '+x', 1.2, PAINT, 0.28, 0.7);
  arrow(paint, eX + 4.0, qz, '+x', 1.2, PAINT, 0.28, 0.7);

  // exit lane
  const ez = L.exitLaneZ;
  const exitX0 = Math.min(...L.lifts.map((l) => l.x)) - 1.2;
  flat(paint, exitX0, F.maxX, ez - 0.9, ez + 0.9, 0.0, 0.02, laneTone);
  for (let x = exitX0 + 1.6; x < xX - 1.2; x += 3.1) {
    if (Math.abs(x - L.pickupStop.x) < 2.3) continue;
    arrow(paint, x, ez, '+x', 1.2, PAINT, 0.3, 0.76);
  }
  // pick-up bay
  {
    const px = L.pickupStop.x, pz = L.pickupStop.z, hl = 1.7, hw = 1.0, t = 0.09, cl = 0.55;
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = px + cx * hl, z = pz + cz * hw;
      flat(paint, Math.min(x, x - cx * cl), Math.max(x, x - cx * cl), z - t / 2, z + t / 2, 0.02, 0.012, P.bayLine);
      flat(paint, x - t / 2, x + t / 2, Math.min(z, z - cz * 0.4), Math.max(z, z - cz * 0.4), 0.02, 0.012, P.bayLine);
    }
    // owner standing ring at the curb
    const c = L.ownerCurb, r = 0.5;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      paint.box(0.2, 0.012, 0.07, P.bayLine, c.x + Math.cos(a) * r, 0.02, c.z + Math.sin(a) * r, 0, -a);
    }
  }
  const pk = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.75), new THREE.MeshBasicMaterial({ map: pickupTex(), transparent: true, depthWrite: false }));
  pk.rotation.x = -PI / 2; pk.position.set(L.pickupStop.x, 0.03, L.pickupStop.z - 1.45); root.add(pk);

  // ---------------- hall shell: back + side walls (inner faces at W.minZ / W.minX / W.maxX)
  const wainA = 0x25394a, wainB = 0x2a3f50, wallA = NAVY, wallB = 0x34505f;
  const seg = 1.1;
  const backLen = (W.maxX - W.minX) + 2 * T;
  for (let i = 0, x = W.minX - T; x < W.maxX + T - 0.01; i++, x += seg) {
    const e = Math.min(x + seg, W.maxX + T), w = e - x;
    solid.box(w, 0.95, T, i % 2 ? wainB : wainA, (x + e) / 2, 0, W.minZ - T / 2);
    solid.box(w, H - 0.95, T, i % 2 ? wallB : wallA, (x + e) / 2, 0.95, W.minZ - T / 2);
  }
  for (const sx of [-1, 1]) {
    const x = sx < 0 ? W.minX - T / 2 : W.maxX + T / 2;
    for (let i = 0, z = W.minZ; z < W.maxZ - 0.01; i++, z += seg) {
      const e = Math.min(z + seg, W.maxZ), d = e - z;
      solid.box(T, 0.95, d, i % 2 ? wainB : wainA, x, 0, (z + e) / 2);
      solid.box(T, H - 0.95, d, i % 2 ? wallB : wallA, x, 0.95, (z + e) / 2);
    }
  }
  // coral trim lines (inner faces) + top cap
  solid.box(backLen, 0.1, 0.05, CORAL, 0, 0.95, W.minZ + 0.02);
  solid.box(backLen, 0.12, T + 0.14, CORAL, 0, H, W.minZ - T / 2 - 0.02);
  solid.box(backLen, 0.06, 0.04, CORAL, 0, H - 0.2, W.minZ + 0.01);
  for (const sx of [-1, 1]) {
    const xi = sx * W.maxX, xc = sx < 0 ? W.minX - T / 2 : W.maxX + T / 2;
    solid.box(0.05, 0.1, hallD, CORAL, xi - sx * 0.02, 0.95, (W.minZ + W.maxZ) / 2);
    solid.box(T + 0.14, 0.12, hallD + T, CORAL, xc + sx * 0.02, H, (W.minZ + W.maxZ) / 2 - T / 2);
    solid.box(0.04, 0.06, hallD, CORAL, xi - sx * 0.01, H - 0.2, (W.minZ + W.maxZ) / 2);
    // baseboard
    solid.box(0.06, 0.12, hallD, 0x1b2a36, xi - sx * 0.03, 0, (W.minZ + W.maxZ) / 2);
  }
  solid.box(backLen, 0.12, 0.06, 0x1b2a36, 0, 0, W.minZ + 0.03);

  // two chunky corner pillars at the open front
  for (const sx of [-1, 1]) {
    const px = sx * (W.maxX + T / 2), pz = W.maxZ - 0.15;
    solid.box(0.95, H + 0.35, 0.95, 0x3b5a6a, px, 0, pz);
    solid.box(1.08, 0.14, 1.08, CORAL, px, H + 0.35, pz);
    solid.box(0.97, 0.5, 0.97, P.hazardB, px, 0, pz);
    for (let i = 0; i < 2; i++) solid.box(0.99, 0.12, 0.99, P.hazardA, px, 0.08 + i * 0.22, pz);
    solid.box(1.0, 0.1, 1.0, CORAL, px, 1.05, pz);
    glow.box(0.5, 0.18, 0.5, 0xfff1b8, px, H + 0.5, pz);
  }

  // ---------------- wall decor
  const atlas = atlasTex();
  const atlasMat = new THREE.MeshLambertMaterial({ map: atlas });
  const atlasGeos = [];
  const quad = (key, w, h, frameM, lx, y, depth) => {
    const [cx, cy] = CELL[key];
    const ch = key === 'clock' ? 256 : 384;
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const ux = uv.getX(i), uy = uv.getY(i);
      uv.setXY(i, (cx + ux * 256) / ATLAS, 1 - (cy + ch - uy * ch) / ATLAS);
    }
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(lx, y + h / 2, depth));
    g.applyMatrix4(frameM);
    atlasGeos.push(g);
  };
  const frameMat = (x, z, ry) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
  // frames: back (local x = world x), left (local x = -z), right (local x = +z); local +z points into the room
  const frames = {
    back: { x: 0, z: W.minZ, ry: 0, toLocal: (x, z) => x },
    left: { x: W.minX, z: 0, ry: PI / 2, toLocal: (x, z) => -z },
    right: { x: W.maxX, z: 0, ry: -PI / 2, toLocal: (x, z) => z },
  };
  const inFrame = (name, fn) => {
    const f = frames[name];
    solid.push(f.x, 0, f.z, f.ry); glow.push(f.x, 0, f.z, f.ry);
    fn(f); solid.pop(); glow.pop();
  };
  const fm = (name) => frameMat(frames[name].x, frames[name].z, frames[name].ry);

  const pegboard = (name, lx, y, key) => {
    solid.box(0.9, 1.4, 0.06, P.woodDark, lx, y - 0.04, 0.03);
    quad(key, 0.8, 1.3, fm(name), lx, y + 0.01, 0.065);
    // hooks shelf under the board
    solid.box(0.9, 0.05, 0.16, P.steelDark, lx, y - 0.1, 0.1);
  };
  const poster = (name, lx, y, key) => {
    solid.box(0.84, 1.2, 0.03, P.woodDark, lx, y - 0.03, 0.015);
    quad(key, 0.76, 1.14, fm(name), lx, y, 0.035);
  };
  const windowAt = (lx, y, w, h) => {
    solid.box(w + 0.18, h + 0.18, 0.08, CREAM, lx, y - 0.09, 0.04);
    glow.box(w, h / 2, 0.05, 0xcdeef7, lx, y + h / 2, 0.09);
    glow.box(w, h / 2, 0.05, 0xa6dbec, lx, y, 0.09);
    solid.box(0.06, h, 0.07, CREAM, lx, y, 0.1);
    solid.box(w, 0.06, 0.07, CREAM, lx, y + h / 2 - 0.03, 0.1);
    solid.box(w + 0.3, 0.06, 0.2, CREAM, lx, y - 0.14, 0.1);
  };
  const lampFix = (lx, y) => {      // wall bracket with a hanging lamp
    solid.box(0.08, 0.08, 0.85, P.steelDark, lx, y + 0.28, 0.42);
    solid.box(0.04, 0.3, 0.04, P.steelDark, lx, y + 0.0, 0.85);
    solid.cyl(0.07, 0.34, 0.24, P.accent, lx, y - 0.14, 0.85, 8);
    glow.box(0.2, 0.05, 0.2, 0xfff1b8, lx, y - 0.17, 0.85);
  };

  // --- back wall
  const stX = Object.values(L.stations).map((s) => s.x).sort((a, b) => a - b);
  const stMid = stX.slice(1).map((x, i) => (x + stX[i]) / 2);
  const cxMid = stX[(stX.length / 2) | 0];
  const shelf = (lx) => {
    for (const s of [-1, 1]) solid.box(0.05, 1.6, 0.4, P.steelDark, lx + s * 0.62, 0, 0.2);
    [0.04, 0.58, 1.1, 1.6].forEach((y, li) => {
      solid.box(1.3, 0.05, 0.42, P.wood, lx, y, 0.21);
      if (li === 3) return;
      let x = lx - 0.55;
      while (x < lx + 0.5) {
        const w = 0.2 + rnd() * 0.18, h = 0.15 + rnd() * 0.25;
        solid.box(w, h, 0.26, [CORAL, P.accent, P.teal, 0xe9e0cc, 0x5aa9e6][(rnd() * 5) | 0], x + w / 2, y + 0.05, 0.22);
        x += w + 0.05;
      }
    });
  };
  inFrame('back', () => {
    stMid.forEach((m, i) => {
      if (i === 1 || i === 2) pegboard('back', m, 0.8, i === 1 ? 'pegA' : 'pegB');
      else poster('back', m, 0.85, i === 0 ? 'p1' : 'p2');
    });
    // clock above the middle station
    solid.cyl(0.26, 0.26, 0.06, CORAL, cxMid, 2.3 - 0.03, 0.03, 14, PI / 2);
    quad('clock', 0.44, 0.44, fm('back'), cxMid, 2.08, 0.07);
    // corner shelves with clerestory windows above
    for (const sx of [-1, 1]) {
      const lx = sx * (L.stations.tire.x + (stX[stX.length - 1] - stX[0]) / 2 + 2.0);
      shelf(lx);
      windowAt(lx, 1.85, 1.1, 0.45);
    }
    for (const lx of [stX[1], stX[3]]) lampFix(lx, 2.2);
    lampFix(stX[0], 2.2); lampFix(stX[4], 2.2);
  });

  // --- side walls
  for (const name of ['left', 'right']) {
    const f = frames[name];
    const lz = (z) => f.toLocal(0, z);
    inFrame(name, () => {
      for (const z of [-8.3, -5.0, -1.7]) windowAt(lz(z), 1.25, 1.5, 0.9);
      for (const z of [-6.65, -0.3]) solid.box(0.3, H - 0.12, 0.1, 0x3c5a6a, lz(z), 0, 0.05);
      for (const z of [-6.65, -3.35, -0.3]) lampFix(lz(z), 2.2);
      if (name === 'left') {
        poster('left', lz(-3.35), 1.25, 'p3');
        // tool chest
        solid.box(1.3, 1.0, 0.55, 0xd8584a, lz(-3.35), 0, 0.28);
        solid.box(1.34, 0.06, 0.58, P.steel, lz(-3.35), 1.0, 0.28);
        for (let i = 0; i < 4; i++) {
          solid.box(1.2, 0.18, 0.02, 0xb8453a, lz(-3.35), 0.1 + i * 0.22, 0.56);
          solid.box(0.4, 0.04, 0.03, P.steel, lz(-3.35), 0.17 + i * 0.22, 0.58);
        }
        // fire extinguisher
        solid.cyl(0.1, 0.1, 0.45, 0xd8403a, lz(-1.0), 0.25, 0.15, 8);
        solid.box(0.1, 0.1, 0.1, P.rubber, lz(-1.0), 0.7, 0.15);
      } else {
        pegboard('right', lz(-3.35), 1.0, 'pegB');
        // workbench
        solid.box(2.0, 0.08, 0.62, P.wood, lz(-3.35), 0.82, 0.32);
        for (const s of [-0.9, 0.9]) solid.box(0.08, 0.82, 0.5, P.steelDark, lz(-3.35) + s, 0, 0.32);
        solid.box(1.8, 0.05, 0.5, P.woodDark, lz(-3.35), 0.3, 0.32);
        solid.box(0.18, 0.2, 0.24, P.steelDark, lz(-3.35) + 0.7, 0.9, 0.3);
        solid.box(0.4, 0.25, 0.3, CORAL, lz(-3.35) - 0.5, 0.9, 0.32);
        solid.box(0.3, 0.12, 0.2, P.accent, lz(-3.35) - 0.1, 0.9, 0.4);
      }
    });
  }
  // corner stacks: tires + oil drums (world coordinates)
  const cxL = W.minX + 0.45, cxR = W.maxX - 0.45;
  tireStack(solid, cxL, W.minZ + 1.0, 4, rnd); tireStack(solid, cxL, W.minZ + 1.8, 3, rnd);
  drum(solid, cxL, W.minZ + 2.9, P.teal); drum(solid, cxL + 0.1, W.minZ + 3.55, CORAL);
  tireStack(solid, cxR, W.minZ + 1.0, 3, rnd); tireStack(solid, cxR, W.minZ + 1.75, 2, rnd);
  drum(solid, cxR, W.minZ + 2.7, CORAL); drum(solid, cxR - 0.05, W.minZ + 3.35, P.accent);
  solid.cyl(0.25, 0.25, 1.0, 0x3c9a6a, cxR, 0.0, W.maxZ - 0.7, 10, PI / 2);   // air compressor
  solid.box(0.1, 0.3, 0.1, P.steelDark, cxR, 0, W.maxZ - 0.35); solid.box(0.1, 0.3, 0.1, P.steelDark, cxR, 0, W.maxZ - 1.05);

  // ---------------- roof sign on the back wall (canvas texture)
  {
    const sb = new Builder(), sg = new Builder();
    const sw = 6.9, sh = 1.9;
    sb.box(sw, sh, 0.22, CORAL, 0, 0.35, 0);
    sb.box(0.3, 0.6, 0.3, P.steelDark, -2.6, -0.1, 0); sb.box(0.3, 0.6, 0.3, P.steelDark, 2.6, -0.1, 0);
    for (let i = 0; i <= 14; i++) {
      const x = -sw / 2 + 0.15 + i * ((sw - 0.3) / 14);
      sg.box(0.12, 0.12, 0.08, 0xfff1b8, x, 0.38, 0.14); sg.box(0.12, 0.12, 0.08, 0xfff1b8, x, 0.35 + sh - 0.2, 0.14);
    }
    const grp = new THREE.Group();
    grp.position.set(0, H + 0.1, W.minZ - T / 2);
    grp.rotation.x = -0.2;
    grp.add(mesh(sb.build(), litMat, { cast: true, receive: false }));
    grp.add(mesh(sg.build(), glowMat, { cast: false, receive: false }));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.62), new THREE.MeshBasicMaterial({ map: signTex() }));
    face.position.set(0, 0.35 + sh / 2, 0.115);
    grp.add(face);
    root.add(grp);
  }

  // ---------------- lounge patio
  {
    const lg = L.lounge;
    const x0 = lg.minX - 0.4, x1 = lg.maxX + 0.6, z0 = lg.minZ - 0.1, z1 = lg.maxZ + 0.2;
    solid.box(x1 - x0, 0.07, z1 - z0, P.woodDark, (x0 + x1) / 2, 0, (z0 + z1) / 2);
    const deck = plane(x1 - x0 - 0.1, z1 - z0 - 0.1, (x0 + x1) / 2, 0.075, (z0 + z1) / 2,
      new THREE.MeshLambertMaterial({ map: deckTex([(x1 - x0) / 1.8, (z1 - z0) / 1.8]) }));
    root.add(deck);
    // bench along the east edge, back rest outwards
    solid.push(x1 - 0.35, 0.07, (z0 + z1) / 2, -PI / 2);
    solid.box(1.6, 0.07, 0.42, P.wood, 0, 0.38, 0);
    solid.box(1.6, 0.4, 0.06, P.woodDark, 0, 0.45, -0.22);
    for (const s of [-0.65, 0.65]) solid.box(0.07, 0.38, 0.36, P.steelDark, s, 0, 0);
    solid.pop();
    // planters at the patio corners
    const planter = (x, z, c, flower) => {
      solid.box(0.55, 0.38, 0.55, c, x, 0, z);
      bush(solid, x, z, 0.8, rnd, flower, 0.0);
    };
    planter(x0 + 0.25, z0 + 0.2, P.teal, 0xfff6e6);
    planter(x1 - 0.25, z0 + 0.2, CORAL, P.accent);
    // Relocated (TOWN.md 8): the pillar planters stood on the tow apron (west) and the lounge crossing (east).
    // East: tucked between the hall and the lounge annex, north of the owners' walkway; the bin beside it.
    planter(W.maxX + 1.05, W.maxZ - 2.0, CORAL, P.accent);
    solid.cyl(0.25, 0.22, 0.6, P.teal, W.maxX + 1.05, 0, W.maxZ - 1.1, 8);
    solid.cyl(0.27, 0.27, 0.06, P.steelDark, W.maxX + 1.05, 0.6, W.maxZ - 1.1, 8);
  }

  // forecourt hedge + bushes (low, off the lanes). The west hedge, cones, sandwich board and tire display stood
  // on the tow apron: they moved to the crew corner behind the tow shed (below).
  {
    const hedge = (x0, x1, z0, z1) => { solid.box(x1 - x0, 0.5, z1 - z0, 0x3f9d6a, (x0 + x1) / 2, 0, (z0 + z1) / 2); solid.box(x1 - x0 - 0.1, 0.12, z1 - z0 - 0.1, 0x56b97a, (x0 + x1) / 2, 0.5, (z0 + z1) / 2); };
    hedge(F.maxX - 0.7, F.maxX - 0.25, 8.2, 10.3);
    for (const x of [-3.2, 2.0, 5.2, 9.8]) bush(solid, x, F.maxZ - 0.35, 1.0, rnd, [CORAL, P.accent, 0xfff6e6][(rnd() * 3) | 0]);
  }

  // ---------------- crew corner behind the tow shed (west of the hall, between the tow plot and the back lane):
  // a parasol table where the crew takes a break, old tyres and drums waiting for the scrap man, two trees.
  {
    const x0 = TOWN.alleys.west.maxX, x1 = W.minX - T;                // -13.5 .. -9.8
    const z0 = TOWN.alleys.back.maxZ, z1 = -5.6;                       // back lane .. tow plot
    const tx = (x0 + x1) / 2 + 0.1, tz = z0 + 3.4;
    solid.cyl(0.04, 0.04, 1.75, P.steel, tx, 0, tz, 6);
    solid.cyl(0.35, 0.3, 0.05, P.cream, tx, 0.62, tz, 10);
    solid.cyl(0.06, 0.1, 0.62, P.steelDark, tx, 0, tz, 6);
    solid.cyl(0.04, 1.05, 0.36, CORAL, tx, 1.55, tz, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2 + PI / 8;
      solid.box(0.42, 0.09, 0.2, i % 2 ? CREAM : CORAL, tx + Math.cos(a) * 0.92, 1.49, tz + Math.sin(a) * 0.92, 0, -a);
    }
    [0.6, 2.4, 4.2].forEach((a, i) => solid.cyl(0.19, 0.16, 0.45, [P.teal, P.accent, CORAL][i], tx + Math.cos(a) * 0.8, 0, tz + Math.sin(a) * 0.8, 8));
    // tyre stacks + drums against the hall wall, cones parked on top of a stack
    tireStack(solid, x1 - 0.45, z1 - 0.6, 4, rnd);
    tireStack(solid, x1 - 0.45, z1 - 1.4, 3, rnd);
    tireStack(solid, x1 - 1.2, z1 - 0.65, 2, rnd);
    drum(solid, x1 - 0.4, z0 + 1.0, P.teal); drum(solid, x1 - 1.05, z0 + 0.9, CORAL);
    for (const [x, z] of [[x0 + 0.5, z1 - 0.5], [x0 + 0.95, z1 - 0.35]]) {
      solid.box(0.4, 0.04, 0.4, P.rubber, x, 0, z);
      solid.cyl(0.04, 0.16, 0.5, 0xf2813a, x, 0.04, z, 8);
      solid.cyl(0.1, 0.12, 0.08, PAINT, x, 0.22, z, 8);
    }
    // the old sandwich board, folded and leaning on the wall
    solid.box(0.8, 0.9, 0.05, P.accent, x1 - 0.1, 0, tz + 1.6, 0.18, -PI / 2, 0);
    tree(solid, x0 + 0.9, z0 + 0.9, 1.05, rnd);
    bush(solid, x0 + 0.6, z1 - 1.5, 1.0, rnd, CORAL);
  }

  // ---------------- water (the quay wall, plaza and headlands are env-terrain.js)
  {
    const wTex = waterTex();
    const qz = geo.quayZ;
    const water = plane(300, 170, 0, -0.4, qz + 85 - 0.4, new THREE.MeshLambertMaterial({ map: wTex }));
    wTex.repeat.set(300 / 17, 170 / 17);
    root.add(water);
    anim.water = wTex;
  }

  // ---------------- clock hands (animated)
  const clock = new THREE.Group();
  clock.position.set(cxMid, 2.3, W.minZ + 0.085);
  {
    const mk = (len, w, col) => { const b2 = new Builder(); b2.box(w, len, 0.01, col, 0, 0, 0); return mesh(b2.build(), litMat, { cast: false }); };
    const hour = new THREE.Group(); hour.add(mk(0.11, 0.025, NAVY));
    const min = new THREE.Group(); min.add(mk(0.16, 0.018, NAVY));
    const sec = new THREE.Group(); sec.add(mk(0.17, 0.008, CORAL));
    min.position.z = 0.004; sec.position.z = 0.008;
    clock.add(hour, min, sec);
    anim.clockHands = { hour, min, sec };
  }
  root.add(clock);

  // ---------------- harbor front + street life (envdress: env-harbor.js / env-life.js). Each runs in its own
  // try/catch: a bug in either file must never take the world down. Each gets its own seeded random, so a change
  // in one module never reshuffles the others.
  const dressed = [];
  const env = { root, S, F: FL, G, signs, rnd: mulberry32(7001), geo: streetGeo() };
  for (const [name, mod, seed] of [['buildHarbor', Harbor, 7001], ['buildStreetLife', Life, 7002]]) {
    try {
      const fn = mod[name];
      if (typeof fn !== 'function') { console.warn(`[environment] ${name} not exported yet`); continue; }
      const r = fn({ ...env, rnd: mulberry32(seed) });
      if (r) dressed.push(r);
    } catch (err) {
      console.error(`[environment] ${name} failed`, err);
    }
  }

  // ---------------- assemble merged chunk meshes (only after every module has pushed its geometry)
  const n = solid.build(root, litMat, { cast: true, receive: true })
    + paint.build(root, litMat, { cast: false, receive: true })
    + glow.build(root, glowMat, { cast: false, receive: false });
  signs.build(root, mergeGeometries);
  const atlasGeo = mergeGeometries(atlasGeos, false);
  root.add(mesh(atlasGeo, atlasMat, { cast: false, receive: false }));
  root.userData.chunkMeshes = n;
  root.userData.terrain = terrainInfo;

  scene.add(root);
  // Debug (?envdebug): scene + solids for the console (renderer / camera via scene.onBeforeRender).
  if (typeof location !== 'undefined' && /[?&]envdebug/.test(location.search)) window.__envDebug = { scene, root, townSolids };

  function update(dt, t) {
    if (anim.water) { anim.water.offset.x += dt * 0.004; anim.water.offset.y += dt * 0.002; }
    if (anim.clockHands) {
      const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
      anim.clockHands.sec.rotation.z = -s / 60 * PI * 2;
      anim.clockHands.min.rotation.z = -m / 60 * PI * 2;
      anim.clockHands.hour.rotation.z = -h / 12 * PI * 2;
    }
    for (let i = 0; i < dressed.length; i++) dressed[i].update?.(dt, t);
  }
  return { update, group: root };
}

/** Boxes of solid scenery inside walkable areas (dumpsters, kiosks, big planters, fountain...). Valid after
 *  buildEnvironment(); a fresh array of fresh objects, so callers may keep or mutate it. */
export function townSolids() {
  return solids.map((b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ }));
}

