// Blocky voxel people. Geometry is merged + vertex coloured and cached per look, so a character costs
// 5 meshes (body, 2 arms, 2 legs) + a hidden wrench, and no new materials.
// Outfits: plain tee (customers), 'overalls' (player + mechanics), 'vest' (valet).
import * as THREE from 'three';
import { PALETTE as P } from '../config.js';
import { Builder, litMat, memo, mulberry32 } from './voxel.js';

const SHOE = 0x3a2e2a;
const BOOT = 0x2b2522;
const EYE = 0x1d1a1a;
const CREAM = 0xf6ecd8;
const WHITE = 0xf7f4ee;
const MUSTARD = P.accent;
const CORAL = P.wallTrim;

const _c = new THREE.Color();
const shade = (hex, k) => _c.set(hex).multiplyScalar(k).getHex();

const bodyCache = new Map();
const armCache = new Map();
const legCache = new Map();

const DEFAULT_LOOK = {
  shirt: 0xf6c453, pants: P.wall, skin: 0xedb98a, hair: 0x4a3222, hairStyle: 'short',
  hat: 'none', hatColor: 0xffffff, hatBadge: MUSTARD, outfit: null, outfitColor: null, patch: null,
  stripe: null, longSleeves: false, shoe: SHOE, bowtie: null,
};

function addHair(b, style, c, hasHat) {
  if (style === 'bald') return;
  if (!hasHat) {
    b.box(0.49, 0.09, 0.49, c, 0, 1.4, 0);                 // top
    b.box(0.47, 0.05, 0.06, c, 0, 1.36, 0.225);            // fringe
  }
  b.box(0.49, 0.28, 0.09, c, 0, 1.17, -0.2);               // back
  b.box(0.05, 0.2, 0.4, c, -0.235, 1.25, -0.02);           // sideburns
  b.box(0.05, 0.2, 0.4, c, 0.235, 1.25, -0.02);
  if (style === 'long') {
    b.box(0.49, 0.5, 0.09, c, 0, 0.96, -0.2);
    b.box(0.06, 0.4, 0.2, c, -0.24, 1.05, -0.1);
    b.box(0.06, 0.4, 0.2, c, 0.24, 1.05, -0.1);
  } else if (style === 'bun' && !hasHat) {
    b.box(0.2, 0.2, 0.2, c, 0, 1.49, -0.06);
  } else if (style === 'pony') {
    b.box(0.14, 0.3, 0.1, c, 0, 1.0, -0.27);
  } else if (style === 'spiky' && !hasHat) {
    b.box(0.1, 0.13, 0.1, c, -0.15, 1.49, 0.02);
    b.box(0.1, 0.17, 0.1, c, 0.0, 1.49, 0.0);
    b.box(0.1, 0.13, 0.1, c, 0.15, 1.49, 0.02);
  } else if (style === 'curly' && !hasHat) {
    b.box(0.56, 0.16, 0.56, c, 0, 1.4, -0.02);
    b.box(0.08, 0.3, 0.46, c, -0.27, 1.2, -0.02);
    b.box(0.08, 0.3, 0.46, c, 0.27, 1.2, -0.02);
    b.box(0.5, 0.3, 0.1, c, 0, 1.15, -0.24);
  }
}

function addHat(b, l) {
  const c = l.hatColor;
  if (l.hat === 'cap') {
    b.box(0.5, 0.14, 0.5, c, 0, 1.4, 0);
    b.box(0.46, 0.04, 0.46, shade(c, 0.85), 0, 1.54, 0);           // crown top
    b.box(0.08, 0.04, 0.08, l.hatBadge, 0, 1.58, 0);                // button
    b.box(0.44, 0.035, 0.26, shade(c, 0.88), 0, 1.4, 0.33);        // brim
    b.box(0.14, 0.08, 0.02, l.hatBadge, 0, 1.44, 0.252);            // badge
  } else if (l.hat === 'valet') {
    b.box(0.5, 0.16, 0.5, c, 0, 1.4, 0);
    b.box(0.52, 0.05, 0.52, MUSTARD, 0, 1.42, 0);                   // gold band
    b.box(0.54, 0.05, 0.54, c, 0, 1.56, 0.02);                       // flat top
    b.box(0.44, 0.03, 0.18, 0x1d2228, 0, 1.4, 0.32);                // shiny visor
    b.box(0.1, 0.08, 0.02, MUSTARD, 0, 1.5, 0.272);
  } else if (l.hat === 'beanie') {
    b.box(0.5, 0.14, 0.5, c, 0, 1.38, 0);
    b.box(0.5, 0.04, 0.5, CREAM, 0, 1.38, 0);
    b.box(0.12, 0.1, 0.12, CREAM, 0, 1.52, 0);
  } else if (l.hat === 'headband') {
    b.box(0.5, 0.07, 0.5, c, 0, 1.3, 0);
    b.box(0.08, 0.12, 0.05, c, 0.12, 1.22, -0.27);
  }
}

function bodyGeo(l) {
  const key = [l.shirt, l.stripe, l.skin, l.hair, l.hairStyle, l.hat, l.hatColor, l.hatBadge, l.outfit, l.outfitColor, l.patch, l.bowtie].join('|');
  return memo(bodyCache, key, () => {
    const b = new Builder();
    b.push(0, -0.5, 0); // upper-body local space: hip pivot at y=0
    // torso
    b.box(0.46, 0.5, 0.28, l.shirt, 0, 0.5, 0);
    if (l.stripe != null) b.box(0.47, 0.07, 0.29, l.stripe, 0, 0.74, 0);
    if (l.outfit === 'overalls') {
      const o = l.outfitColor, oD = shade(o, 0.78);
      b.box(0.47, 0.2, 0.29, o, 0, 0.5, 0);                                  // waist
      b.box(0.3, 0.22, 0.02, o, 0, 0.68, 0.145);                             // bib
      b.box(0.3, 0.16, 0.02, o, 0, 0.68, -0.145);                            // back panel
      b.box(0.15, 0.08, 0.025, oD, 0, 0.74, 0.15);                           // bib pocket
      for (const sx of [-1, 1]) {
        b.box(0.065, 0.12, 0.02, o, sx * 0.115, 0.88, 0.145);               // straps
        b.box(0.065, 0.32, 0.02, o, sx * 0.115, 0.68, -0.147);
        b.box(0.065, 0.02, 0.28, o, sx * 0.115, 0.99, 0);
        b.box(0.045, 0.045, 0.03, MUSTARD, sx * 0.115, 0.87, 0.15);         // buttons
        b.box(0.015, 0.16, 0.2, oD, sx * 0.236, 0.52, 0.0);                  // side seam
      }
      if (l.patch != null) b.box(0.09, 0.06, 0.03, l.patch, -0.08, 0.76, 0.152);
      b.box(0.47, 0.03, 0.295, oD, 0, 0.62, 0);                              // belt line
    } else if (l.outfit === 'vest') {
      const v = l.outfitColor;
      b.box(0.475, 0.42, 0.29, v, 0, 0.54, 0);
      b.box(0.16, 0.13, 0.02, l.shirt, 0, 0.83, 0.146);                      // V opening
      b.box(0.08, 0.1, 0.02, l.shirt, 0, 0.73, 0.146);
      for (let i = 0; i < 3; i++) b.box(0.035, 0.035, 0.025, MUSTARD, 0.05, 0.6 + i * 0.07, 0.15);
      b.box(0.1, 0.04, 0.025, shade(v, 0.75), -0.12, 0.66, 0.15);             // pocket
      b.box(0.04, 0.05, 0.02, WHITE, -0.12, 0.69, 0.153);                     // pocket square
      b.box(0.3, 0.05, 0.3, l.shirt, 0, 0.96, 0);                             // collar
      if (l.bowtie != null) {
        b.box(0.07, 0.07, 0.03, l.bowtie, -0.05, 0.92, 0.155);
        b.box(0.07, 0.07, 0.03, l.bowtie, 0.05, 0.92, 0.155);
        b.box(0.04, 0.04, 0.035, shade(l.bowtie, 0.8), 0, 0.935, 0.158);
      }
    }
    // head
    b.box(0.45, 0.45, 0.45, l.skin, 0, 1.0, 0);
    b.box(0.06, 0.09, 0.02, EYE, -0.1, 1.2, 0.225);
    b.box(0.06, 0.09, 0.02, EYE, 0.1, 1.2, 0.225);
    b.box(0.07, 0.035, 0.02, 0xe08a7a, 0, 1.08, 0.225);                         // mouth
    b.box(0.07, 0.035, 0.015, 0xf0a090, -0.17, 1.12, 0.225);                    // cheeks
    b.box(0.07, 0.035, 0.015, 0xf0a090, 0.17, 1.12, 0.225);
    addHair(b, l.hairStyle, l.hair, l.hat !== 'none' && l.hat !== 'headband');
    addHat(b, l);
    b.pop();
    return b.build();
  });
}

function armGeo(l) {
  const key = [l.shirt, l.skin, l.longSleeves, l.outfit === 'overalls' ? 'gl' : ''].join('|');
  return memo(armCache, key, () => {
    const b = new Builder();
    if (l.longSleeves) {
      b.box(0.15, 0.35, 0.15, l.shirt, 0, -0.35, 0);
      b.box(0.125, 0.09, 0.125, l.skin, 0, -0.44, 0);
    } else {
      b.box(0.15, 0.26, 0.15, l.shirt, 0, -0.26, 0);
      b.box(0.125, 0.17, 0.125, l.skin, 0, -0.43, 0);
    }
    if (l.outfit === 'overalls') b.box(0.14, 0.1, 0.14, 0x3a3f48, 0, -0.5, 0);  // work gloves
    return b.build();
  });
}

function legGeo(l) {
  const pants = l.outfit === 'overalls' ? l.outfitColor : l.pants;
  const shoe = l.outfit === 'overalls' ? BOOT : l.shoe;
  const key = [pants, shoe, l.outfit === 'overalls' ? 'cuff' : ''].join('|');
  return memo(legCache, key, () => {
    const b = new Builder();
    b.box(0.19, 0.42, 0.19, pants, 0, -0.42, 0);
    if (l.outfit === 'overalls') b.box(0.2, 0.05, 0.2, shade(pants, 0.78), 0, -0.42, 0);   // rolled cuff
    b.box(0.2, 0.08, 0.27, shoe, 0, -0.5, 0.035);
    return b.build();
  });
}

let wrenchGeo = null;
function getWrenchGeo() {
  if (wrenchGeo) return wrenchGeo;
  const b = new Builder();
  const S = 0xdfe4e6, SD = 0xaab4bb;
  // held in the fist, handle runs along the arm (local -y) past the hand
  b.box(0.06, 0.12, 0.06, CORAL, 0, -0.06, 0);                 // grip
  b.box(0.045, 0.3, 0.035, S, 0, -0.3, 0);                      // shaft
  b.box(0.16, 0.06, 0.045, S, 0, -0.36, 0);                     // open jaw
  b.box(0.04, 0.08, 0.045, SD, -0.06, -0.42, 0);
  b.box(0.04, 0.08, 0.045, SD, 0.06, -0.42, 0);
  wrenchGeo = b.build();
  return wrenchGeo;
}

const mk = (geo) => { const m = new THREE.Mesh(geo, litMat); m.castShadow = true; return m; };
const smooth = (k) => k * k * (3 - 2 * k);

export function createCharacter(look = {}) {
  const l = { ...DEFAULT_LOOK, ...look };
  if (typeof l.shirt !== 'number') l.shirt = DEFAULT_LOOK.shirt;
  if (l.outfit && typeof l.outfitColor !== 'number') l.outfitColor = P.wall;
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  const upper = new THREE.Group();
  upper.position.y = 0.5;
  rig.add(upper);
  upper.add(mk(bodyGeo(l)));

  const armG = armGeo(l);
  const armL = new THREE.Group(); armL.position.set(-0.3, 0.45, 0); armL.add(mk(armG));
  const armR = new THREE.Group(); armR.position.set(0.3, 0.45, 0); armR.add(mk(armG));
  upper.add(armL, armR);

  const wrench = mk(getWrenchGeo());
  wrench.position.set(0, -0.5, 0.02);
  wrench.visible = false;
  armR.add(wrench);

  const legG = legGeo(l);
  const legL = new THREE.Group(); legL.position.set(-0.12, 0.5, 0); legL.add(mk(legG));
  const legR = new THREE.Group(); legR.position.set(0.12, 0.5, 0); legR.add(mk(legG));
  rig.add(legL, legR);

  const carryAnchor = new THREE.Object3D();
  carryAnchor.position.set(0, 0.95, 0.4);
  rig.add(carryAnchor);

  let phase = Math.random() * 6.28, t = Math.random() * 10;
  let amp = 0, carry = 0, carryTarget = 0, sit = 0, sitTarget = 0;
  let work = 0, workTarget = 0, workT = 0, cheerT = -1;
  const CHEER = 0.75;

  function update(dt, speed01 = 0) {
    if (!Number.isFinite(dt)) dt = 0;
    t += dt;
    const s = Number.isFinite(speed01) ? Math.max(0, Math.min(1.3, speed01)) : 0;
    if (!Number.isFinite(amp)) amp = 0;
    amp += (s - amp) * Math.min(1, dt * 10);
    carry += (carryTarget - carry) * Math.min(1, dt * 12);
    sit += (sitTarget - sit) * Math.min(1, dt * 12);
    work += (workTarget - work) * Math.min(1, dt * 10);
    phase += dt * (7 + 6 * amp);

    const sw = Math.sin(phase) * 0.85 * amp;
    legL.rotation.x = sw * (1 - sit) - 1.45 * sit;
    legR.rotation.x = -sw * (1 - sit) - 1.45 * sit;
    const aw = Math.sin(phase) * 0.75 * amp * (1 - carry);
    let aLx = -aw * (1 - carry) + (-1.55 * carry);
    let aRx = aw * (1 - carry) + (-1.55 * carry);
    let aLz = 0.06 - carry * 0.04;
    let aRz = -0.06 + carry * 0.04;
    let lean = 0.09 * amp;
    let hop = 0;

    // wrenching: right arm cranks the wrench in short strokes, left arm braces, body leans in
    if (work > 0.01) {
      workT += dt;
      const stroke = Math.sin(workT * 11);            // ~1.75 strokes / s ... sharp ratchet feel below
      const ratchet = stroke > 0 ? stroke : stroke * 0.35;
      aRx += (-1.25 + ratchet * 0.38 - aRx) * work;
      aRz += (-0.12 + Math.sin(workT * 11 + 1) * 0.08 - aRz) * work;
      if (carry < 0.5) { aLx += (-0.85 + Math.sin(workT * 5.5) * 0.05 - aLx) * work; aLz += (0.25 - aLz) * work; }
      lean += 0.22 * work + Math.max(0, ratchet) * 0.03 * work;
      wrench.rotation.x = -0.2 + ratchet * 0.25;
    }
    wrench.visible = work > 0.3;

    // cheer: one happy hop with both arms up
    if (cheerT >= 0) {
      cheerT += dt;
      const k = Math.min(1, cheerT / CHEER);
      const w = Math.sin(k * Math.PI);                 // arms up in, out
      const up = smooth(Math.min(1, k * 3)) * (1 - smooth(Math.max(0, (k - 0.75) / 0.25)));
      hop = Math.max(0, Math.sin(Math.min(1, k * 1.25) * Math.PI)) * 0.34;
      aLx += (-2.85 - aLx) * up; aRx += (-2.85 - aRx) * up;
      aLz += (0.35 + Math.sin(cheerT * 26) * 0.12 * w - aLz) * up;
      aRz += (-0.35 - Math.sin(cheerT * 26) * 0.12 * w - aRz) * up;
      legL.rotation.x += -0.35 * w * (1 - sit);
      legR.rotation.x += 0.2 * w * (1 - sit);
      lean -= 0.12 * w;
      if (k >= 1) cheerT = -1;
    }
    armL.rotation.x = aLx; armR.rotation.x = aRx;
    armL.rotation.z = aLz; armR.rotation.z = aRz;

    rig.position.y = Math.abs(Math.sin(phase)) * 0.07 * amp + hop;
    const idle = 1 - Math.min(1, amp * 3);
    upper.scale.y = 1 + Math.sin(t * 2.4) * 0.018 * idle * (1 - work);
    upper.rotation.x = lean;
  }
  function setCarrying(on) { carryTarget = on ? 1 : 0; }
  function setSitting(on) { sitTarget = on ? 1 : 0; }
  function setWorking(on) {
    if (on && !workTarget) workT = 0;
    workTarget = on ? 1 : 0;
  }
  function cheer() { cheerT = 0; }

  update(0, 0);
  return { group, carryAnchor, update, setCarrying, setSitting, setWorking, cheer, look: l };
}

// ---------- looks ----------
const SHIRTS = [0xf26b5b, 0xf6c453, 0x2a9d8f, 0x5aa9e6, 0x9b8fd4, 0xf4a582, 0x8fd1b0, 0xf2e8d5, 0xe07a9a, 0xee8c3a];
const PANTS = [0x2f4858, 0x4a6fa5, 0xc2a878, 0x4a4f5a, 0x7a8450, 0x7a4f32];
const SKINS = [0xf6d3b3, 0xedb98a, 0xd99a6c, 0xb97a4f, 0x8d5a3b, 0x6b4228];
const HAIRS = [0x2b2118, 0x4a3222, 0x7a4f32, 0xc9a35a, 0xb5482f, 0x8a8f99, 0x3b4a6b];
const STYLES = ['short', 'short', 'long', 'bun', 'spiky', 'curly', 'bald', 'pony'];
const HATS = ['none', 'none', 'none', 'none', 'none', 'beanie', 'cap'];

let pool = null;
function buildPool() {
  const rnd = mulberry32(20240607);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const out = [];
  for (let i = 0; i < 56; i++) {
    const shirt = pick(SHIRTS);
    const hat = pick(HATS);
    out.push({
      shirt, pants: pick(PANTS), skin: pick(SKINS), hair: pick(HAIRS), hairStyle: pick(STYLES),
      hat, hatColor: pick(SHIRTS), hatBadge: CREAM, role: 'customer', longSleeves: rnd() < 0.3,
      stripe: rnd() < 0.3 ? pick(SHIRTS) : null,
    });
    if (out[i].stripe === shirt) out[i].stripe = null;
  }
  return out;
}

/** Varied but curated; drawn from a fixed pool so geometry stays shared. */
export function randomCustomerLook() {
  if (!pool) pool = buildPool();
  return { ...pool[Math.floor(Math.random() * pool.length)] };
}
/** Lead mechanic: coral overalls + mustard cap (the brightest thing in the garage). */
export function playerLook() {
  return {
    role: 'player', shirt: CREAM, outfit: 'overalls', outfitColor: CORAL, patch: CREAM,
    skin: 0xedb98a, hair: 0x4a3222, hairStyle: 'short', hat: 'cap', hatColor: MUSTARD, hatBadge: CORAL,
  };
}
const MECHANICS = [
  { outfitColor: 0x34557a, shirt: WHITE, skin: 0xd99a6c, hair: 0x2b2118, hairStyle: 'short', hat: 'cap', hatColor: 0x2a9d8f, hatBadge: CREAM },
  { outfitColor: 0x2a9d8f, shirt: 0xf2e8d5, skin: 0x8d5a3b, hair: 0x2b2118, hairStyle: 'curly', hat: 'beanie', hatColor: 0x34557a },
  { outfitColor: 0x2f4858, shirt: 0x5aa9e6, skin: 0xf6d3b3, hair: 0xb5482f, hairStyle: 'pony', hat: 'headband', hatColor: 0x8fd1b0 },
];
/** Hired mechanics: navy / teal overalls, three distinct variants. */
export function mechanicLook(index = 0) {
  const m = MECHANICS[((index % 3) + 3) % 3];
  return { role: 'mechanic', outfit: 'overalls', patch: MUSTARD, ...m };
}
/** Valet: teal waistcoat over a white shirt, coral bow tie, navy peaked cap. */
export function valetLook() {
  return {
    role: 'valet', shirt: WHITE, outfit: 'vest', outfitColor: 0x2a9d8f, bowtie: CORAL, longSleeves: true,
    pants: 0x2f4858, shoe: 0x1d1a1a, skin: 0xb97a4f, hair: 0x2b2118, hairStyle: 'short', hat: 'valet', hatColor: 0x2f4858,
  };
}
