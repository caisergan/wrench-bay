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
  // Harbor Town extras. outfit also takes 'suit' | 'apron' | 'hiviz' | 'dress' | 'hoodie' | 'jacket'.
  tie: null, pocket: null, glasses: null, sunglasses: null, beard: null, beardStyle: 'full', mask: null, scarf: null,
  backpack: null, badge: null, necklace: null, splat: null, trim: null, glove: null, shorts: false, bootColor: null,
  goggles: null,    // true: clear safety goggles (paint suit)
  build: null,      // { h, w } body height / width scale (children, tall, stocky ...); the carry anchor is not scaled
};
const SLEEVED = ['suit', 'hoodie', 'jacket', 'paintsuit'];
const BODY_KEYS = ['shirt', 'stripe', 'skin', 'hair', 'hairStyle', 'hat', 'hatColor', 'hatBadge', 'outfit', 'outfitColor',
  'patch', 'bowtie', 'tie', 'pocket', 'glasses', 'sunglasses', 'beard', 'beardStyle', 'mask', 'scarf', 'backpack',
  'badge', 'necklace', 'splat', 'trim', 'goggles'];

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
  } else if (l.hat === 'visor') {
    b.box(0.5, 0.07, 0.5, c, 0, 1.33, 0);
    b.box(0.44, 0.03, 0.28, shade(c, 0.88), 0, 1.36, 0.34);
  } else if (l.hat === 'hardhat') {
    b.box(0.53, 0.13, 0.53, c, 0, 1.4, 0);
    b.box(0.41, 0.07, 0.41, c, 0, 1.53, 0);
    b.box(0.09, 0.05, 0.5, shade(c, 0.85), 0, 1.58, 0);              // centre ridge
    b.box(0.46, 0.035, 0.22, shade(c, 0.9), 0, 1.4, 0.35);           // front peak
    b.box(0.12, 0.07, 0.02, l.hatBadge, 0, 1.45, 0.268);
  } else if (l.hat === 'fedora') {
    b.box(0.68, 0.035, 0.68, shade(c, 0.9), 0, 1.4, 0);               // brim all round
    b.box(0.46, 0.17, 0.46, c, 0, 1.43, 0);
    b.box(0.4, 0.04, 0.4, shade(c, 0.9), 0, 1.6, 0);                  // pinched top
    b.box(0.47, 0.05, 0.47, l.hatBadge, 0, 1.45, 0);                  // band
  } else if (l.hat === 'sun') {
    b.box(0.86, 0.03, 0.86, c, 0, 1.4, 0);                           // wide straw brim
    b.box(0.44, 0.1, 0.44, shade(c, 1.06), 0, 1.43, 0);
    b.box(0.46, 0.04, 0.46, l.hatBadge, 0, 1.45, 0);                  // ribbon
  } else if (l.hat === 'beret') {
    b.box(0.56, 0.07, 0.56, c, 0.03, 1.4, -0.01);
    b.box(0.5, 0.05, 0.5, shade(c, 0.9), 0.05, 1.47, -0.02);
    b.box(0.05, 0.05, 0.05, shade(c, 0.7), 0.05, 1.52, -0.02);
  } else if (l.hat === 'peaked') {                                    // chauffeur / host cap: tall crown, gold band
    b.box(0.52, 0.2, 0.52, c, 0, 1.4, 0);
    b.box(0.6, 0.045, 0.6, c, 0, 1.58, 0.02);                         // flared top
    b.box(0.54, 0.05, 0.54, l.hatBadge, 0, 1.42, 0);
    b.box(0.46, 0.03, 0.2, 0x15181c, 0, 1.4, 0.34);                  // shiny visor
    b.box(0.12, 0.1, 0.02, l.hatBadge, 0, 1.5, 0.265);               // crest
  } else if (l.hat === 'paintcap') {                                  // paint shop cap: neck flap + colour band
    b.box(0.5, 0.15, 0.5, c, 0, 1.39, 0);
    b.box(0.46, 0.04, 0.46, shade(c, 0.93), 0, 1.54, 0);
    b.box(0.51, 0.04, 0.51, l.hatBadge, 0, 1.4, 0);                   // team colour band
    b.box(0.44, 0.03, 0.22, shade(c, 0.85), 0, 1.4, 0.32);
    b.box(0.5, 0.22, 0.05, c, 0, 1.2, -0.27);                         // neck flap
  } else if (l.hat === 'hood') {                                      // paint-suit hood, snug round the face
    const cD = shade(c, 0.86);
    b.box(0.52, 0.09, 0.5, c, 0, 1.42, -0.01);                         // crown
    b.box(0.06, 0.46, 0.5, c, -0.25, 0.98, -0.01);                     // sides, down to the shoulders
    b.box(0.06, 0.46, 0.5, c, 0.25, 0.98, -0.01);
    b.box(0.52, 0.5, 0.06, c, 0, 0.94, -0.25);                         // back, over the neck
    b.box(0.44, 0.05, 0.04, cD, 0, 1.36, 0.235);                       // elastic rim round the face: brow
    b.box(0.05, 0.36, 0.04, cD, -0.197, 1.0, 0.235);                   // cheeks (inside the head's side faces)
    b.box(0.05, 0.36, 0.04, cD, 0.197, 1.0, 0.235);
    b.box(0.34, 0.04, 0.03, cD, 0, 0.97, 0.232);                       // chin (behind the respirator's front)
  } else if (l.hat === 'goldcap') {                                   // the golden-wrench reward
    const G = 0xf2c230, GD = 0xc99a14, GL = 0xfff0a0;
    b.box(0.5, 0.15, 0.5, G, 0, 1.4, 0);
    b.box(0.46, 0.045, 0.46, GL, 0, 1.55, 0);                          // shiny crown
    b.box(0.1, 0.05, 0.1, CORAL, 0, 1.59, 0);                          // red gem button
    b.box(0.44, 0.04, 0.27, GD, 0, 1.4, 0.34);                        // brim
    b.box(0.2, 0.1, 0.02, GL, 0, 1.43, 0.252);                         // badge plate
    b.box(0.14, 0.03, 0.025, GD, 0, 1.465, 0.262);
    b.box(0.03, 0.14, 0.025, GD, 0, 1.43, 0.262);
    b.box(0.51, 0.025, 0.51, GD, 0, 1.4, 0);
  }
}


const SPLAT_POS = [[-0.09, 0.78, 0.152, 0.07, 0.06], [0.1, 0.62, 0.152, 0.05, 0.09], [0.14, 0.86, 0.15, 0.05, 0.04],
  [-0.14, 0.58, 0.152, 0.08, 0.04], [0.02, 0.9, -0.147, 0.09, 0.06], [-0.1, 0.7, -0.147, 0.06, 0.08]];
function splatters(b, cols) {
  SPLAT_POS.forEach(([x, y, z, w, h], i) => b.box(w, h, 0.012, cols[i % cols.length], x, y, z));
}

/** Clothes beyond overalls / vest. */
function outfitExtra(b, l) {
  const o = l.outfitColor, oD = shade(o, 0.78), oL = shade(o, 1.12);
  if (l.outfit === 'suit') {
    b.box(0.49, 0.48, 0.3, o, 0, 0.51, 0);                                      // jacket
    b.box(0.5, 0.08, 0.31, oD, 0, 0.44, 0);                                     // hem
    b.box(0.15, 0.32, 0.02, l.shirt, 0, 0.66, 0.152);                           // shirt front
    for (const sx of [-1, 1]) b.box(0.09, 0.3, 0.024, oD, sx * 0.1, 0.66, 0.158, 0, 0, sx * -0.12);   // lapels
    if (l.tie != null) { b.box(0.045, 0.3, 0.026, l.tie, 0, 0.62, 0.166); b.box(0.06, 0.05, 0.03, shade(l.tie, 0.8), 0, 0.92, 0.166); }
    if (l.bowtie != null) {
      b.box(0.06, 0.06, 0.03, l.bowtie, -0.05, 0.9, 0.162); b.box(0.06, 0.06, 0.03, l.bowtie, 0.05, 0.9, 0.162);
      b.box(0.035, 0.035, 0.034, shade(l.bowtie, 0.8), 0, 0.91, 0.165);
    }
    b.box(0.3, 0.05, 0.3, l.shirt, 0, 0.96, 0);                                 // shirt collar
    b.box(0.07, 0.04, 0.026, l.pocket ?? WHITE, -0.14, 0.78, 0.154);            // pocket square
    for (let i = 0; i < 2; i++) b.box(0.035, 0.035, 0.03, l.trim ?? shade(o, 0.6), 0.04, 0.54 + i * 0.1, 0.17);
    if (l.trim != null) {                                                       // gold piping on lapel + cuffs of the jacket
      for (const sx of [-1, 1]) b.box(0.012, 0.3, 0.028, l.trim, sx * 0.055, 0.66, 0.16);
    }
  } else if (l.outfit === 'apron') {
    b.box(0.31, 0.36, 0.02, o, 0, 0.58, 0.15);                                  // bib
    b.box(0.4, 0.24, 0.024, o, 0, 0.44, 0.15);                                  // skirt of the apron
    b.box(0.49, 0.04, 0.3, oD, 0, 0.62, 0);                                     // waist tie
    for (const sx of [-1, 1]) b.box(0.04, 0.22, 0.02, oD, sx * 0.1, 0.84, 0.145);   // neck straps
    b.box(0.3, 0.04, 0.2, oD, 0, 0.93, -0.0);
    b.box(0.2, 0.09, 0.026, oD, 0, 0.5, 0.162);                                 // pocket
    if (l.patch != null) b.box(0.1, 0.07, 0.03, l.patch, 0, 0.74, 0.16);
  } else if (l.outfit === 'hiviz') {
    b.box(0.34, 0.46, 0.02, o, 0, 0.52, 0.148);                                 // front panel
    b.box(0.34, 0.46, 0.02, o, 0, 0.52, -0.148);                                // back panel
    for (const sx of [-1, 1]) b.box(0.07, 0.1, 0.3, o, sx * 0.14, 0.9, 0);      // shoulders
    for (const y of [0.58, 0.72]) {
      b.box(0.35, 0.045, 0.026, 0xe9eef0, 0, y, 0.15);                          // reflective bands
      b.box(0.35, 0.045, 0.026, 0xe9eef0, 0, y, -0.15);
    }
    b.box(0.045, 0.44, 0.03, 0xe9eef0, 0.1, 0.52, 0.152);
    b.box(0.045, 0.44, 0.03, 0xe9eef0, -0.1, 0.52, 0.152);
    if (l.patch != null) b.box(0.08, 0.06, 0.03, l.patch, 0.08, 0.84, 0.158);
  } else if (l.outfit === 'dress') {
    b.box(0.48, 0.5, 0.29, o, 0, 0.5, 0);                                       // bodice
    b.box(0.52, 0.2, 0.34, o, 0, 0.3, 0);                                       // skirt, two flared steps
    b.box(0.58, 0.16, 0.38, o, 0, 0.14, 0);
    b.box(0.59, 0.03, 0.39, oD, 0, 0.14, 0);                                    // hem band
    b.box(0.5, 0.035, 0.3, l.trim ?? oD, 0, 0.61, 0);                           // belt
    b.box(0.3, 0.04, 0.3, l.shirt, 0, 0.96, 0);                                 // collar
  } else if (l.outfit === 'hoodie') {
    b.box(0.49, 0.5, 0.3, o, 0, 0.5, 0);
    b.box(0.5, 0.08, 0.31, oD, 0, 0.44, 0);                                     // rib hem
    b.box(0.34, 0.1, 0.17, oL, 0, 0.9, -0.17);                                   // hood bunched behind the neck
    b.box(0.3, 0.12, 0.026, oD, 0, 0.52, 0.156);                                 // kangaroo pocket
    b.box(0.03, 0.12, 0.02, CREAM, -0.06, 0.8, 0.152);                           // drawstrings
    b.box(0.03, 0.12, 0.02, CREAM, 0.06, 0.8, 0.152);
    if (l.patch != null) b.box(0.1, 0.07, 0.03, l.patch, 0, 0.7, 0.152);
  } else if (l.outfit === 'paintsuit') {                                         // hooded paint coverall, zipped to the chin
    b.box(0.49, 0.535, 0.31, o, 0, 0.47, 0);                                    // a size up: covers the clothes under it
    b.box(0.5, 0.045, 0.32, oD, 0, 0.6, 0);                                     // elastic waist
    b.box(0.03, 0.34, 0.012, 0xc4ccd2, 0, 0.55, 0.161);                         // zip (the pull sits above it)
    b.box(0.05, 0.05, 0.02, 0x9aa5ad, 0, 0.9, 0.165);                           // zip pull under the chin
    if (l.patch != null) b.box(0.1, 0.06, 0.02, l.patch, -0.12, 0.78, 0.163);   // name patch
  } else if (l.outfit === 'jacket') {
    b.box(0.49, 0.48, 0.3, o, 0, 0.5, 0);
    b.box(0.5, 0.07, 0.31, oD, 0, 0.44, 0);                                     // rib hem
    b.box(0.5, 0.08, 0.31, oL, 0, 0.9, 0);                                      // collar
    b.box(0.03, 0.4, 0.03, CREAM, 0, 0.5, 0.154);                               // zip
    b.box(0.1, 0.08, 0.026, oD, -0.14, 0.58, 0.156);
    b.box(0.1, 0.08, 0.026, oD, 0.14, 0.58, 0.156);
  }
}

/** Glasses, beard, respirator: drawn in front of the face. */
function addFace(b, l) {
  if (l.beard != null) {
    const c = l.beard;
    if (l.beardStyle === 'stache') b.box(0.2, 0.045, 0.04, c, 0, 1.115, 0.235);
    else if (l.beardStyle === 'goatee') { b.box(0.2, 0.045, 0.04, c, 0, 1.115, 0.235); b.box(0.1, 0.1, 0.04, c, 0, 1.0, 0.235); }
    else { b.box(0.46, 0.15, 0.06, c, 0, 1.0, 0.205); b.box(0.2, 0.04, 0.04, c, 0, 1.12, 0.235); b.box(0.07, 0.035, 0.03, 0xe08a7a, 0, 1.075, 0.255); }
  }
  if (l.glasses != null) {
    const c = l.glasses;
    for (const sx of [-1, 1]) {
      b.box(0.17, 0.02, 0.02, c, sx * 0.1, 1.27, 0.232); b.box(0.17, 0.02, 0.02, c, sx * 0.1, 1.15, 0.232);
      b.box(0.02, 0.12, 0.02, c, sx * 0.18, 1.15, 0.232); b.box(0.02, 0.12, 0.02, c, sx * 0.02, 1.15, 0.232);
      b.box(0.015, 0.02, 0.4, c, sx * 0.225, 1.25, 0.02);
    }
  }
  if (l.sunglasses != null) {
    const c = l.sunglasses;
    for (const sx of [-1, 1]) b.box(0.18, 0.11, 0.025, c, sx * 0.1, 1.15, 0.235);
    b.box(0.06, 0.025, 0.025, c, 0, 1.24, 0.235);
    b.box(0.46, 0.02, 0.025, c, 0, 1.25, 0.232);
  }
  if (l.mask === 'respirator') {                                                // half-mask with two filters + strap
    b.box(0.32, 0.22, 0.08, 0x58626b, 0, 0.98, 0.215);
    b.box(0.26, 0.05, 0.09, 0x3d454c, 0, 1.13, 0.215);                           // nose bridge
    for (const sx of [-1, 1]) {
      b.cyl(0.065, 0.065, 0.07, 0xe9a23b, sx * 0.13, 1.0 - 0.0, 0.265, 8, Math.PI / 2);   // filter cartridges
      b.cyl(0.04, 0.04, 0.02, 0x3d454c, sx * 0.13, 1.0, 0.31, 6, Math.PI / 2);
    }
    b.box(0.47, 0.03, 0.47, 0x30363c, 0, 1.18, 0);                               // head strap
    b.box(0.47, 0.03, 0.47, 0x30363c, 0, 1.0, 0.0);
  }
  if (l.goggles) {                                                              // clear goggles: frame, lens, eyes behind it
    b.box(0.42, 0.12, 0.05, 0x3d454c, 0, 1.18, 0.235);
    b.box(0.36, 0.08, 0.012, 0xa8dcef, 0, 1.2, 0.262);
    for (const sx of [-1, 1]) b.box(0.06, 0.07, 0.01, EYE, sx * 0.1, 1.205, 0.273);
  }
}

function bodyGeo(l) {
  const key = BODY_KEYS.map((k) => l[k]).join('|');
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
    else if (l.outfit) outfitExtra(b, l);
    if (l.splat) splatters(b, l.splat);
    if (l.backpack != null) {                                                    // backpack with straps
      b.box(0.34, 0.4, 0.16, l.backpack, 0, 0.5, -0.22);
      b.box(0.3, 0.12, 0.05, shade(l.backpack, 0.8), 0, 0.5, -0.31);
      for (const sx of [-1, 1]) b.box(0.06, 0.34, 0.02, shade(l.backpack, 0.6), sx * 0.13, 0.62, 0.148);
    }
    if (l.scarf != null) {
      b.box(0.5, 0.1, 0.5, l.scarf, 0, 0.9, 0);
      b.box(0.13, 0.32, 0.03, l.scarf, 0.1, 0.62, 0.155);
      b.box(0.13, 0.04, 0.032, shade(l.scarf, 0.75), 0.1, 0.66, 0.157);
    }
    if (l.necklace != null) {
      b.box(0.2, 0.025, 0.02, l.necklace, 0, 0.93, 0.15);
      b.box(0.06, 0.06, 0.03, l.necklace, 0, 0.86, 0.155);
    }
    if (l.badge != null) {                                                       // lanyard + id badge
      b.box(0.035, 0.3, 0.015, l.badge, -0.07, 0.68, 0.152);
      b.box(0.035, 0.3, 0.015, l.badge, 0.07, 0.68, 0.152);
      b.box(0.1, 0.12, 0.02, WHITE, 0, 0.6, 0.158);
      b.box(0.08, 0.03, 0.022, l.badge, 0, 0.67, 0.16);
    }
    // head
    b.box(0.45, 0.45, 0.45, l.skin, 0, 1.0, 0);
    b.box(0.06, 0.09, 0.02, EYE, -0.1, 1.2, 0.225);
    b.box(0.06, 0.09, 0.02, EYE, 0.1, 1.2, 0.225);
    b.box(0.07, 0.035, 0.02, 0xe08a7a, 0, 1.08, 0.225);                         // mouth
    b.box(0.07, 0.035, 0.015, 0xf0a090, -0.17, 1.12, 0.225);                    // cheeks
    b.box(0.07, 0.035, 0.015, 0xf0a090, 0.17, 1.12, 0.225);
    addHair(b, l.hairStyle, l.hair, l.hat !== 'none' && l.hat !== 'headband' && l.hat !== 'visor');
    addFace(b, l);
    addHat(b, l);
    b.pop();
    return b.build();
  });
}

const hatCache = new Map();
/** The hat alone, in upper-body space (the player's cap comes off as its own mesh while they suit up). */
function hatGeo(l) {
  const key = ['hat', 'hatColor', 'hatBadge'].map((k) => l[k]).join('|');
  return memo(hatCache, key, () => { const b = new Builder(); b.push(0, -0.5, 0); addHat(b, l); b.pop(); return b.build(); });
}

function armGeo(l) {
  const sleeved = SLEEVED.includes(l.outfit);
  const sleeve = sleeved ? l.outfitColor : l.shirt;
  const long = l.longSleeves || sleeved;
  const glove = l.outfit === 'overalls' ? (l.glove ?? 0x3a3f48) : l.glove;
  const key = [sleeve, l.skin, long, glove, sleeved ? l.trim : ''].join('|');
  return memo(armCache, key, () => {
    const b = new Builder();
    if (long) {
      b.box(0.15, 0.35, 0.15, sleeve, 0, -0.35, 0);
      b.box(0.125, 0.09, 0.125, l.skin, 0, -0.44, 0);
      if (sleeved && l.trim != null) b.box(0.158, 0.03, 0.158, l.trim, 0, -0.34, 0);   // cuff piping
    } else {
      b.box(0.15, 0.26, 0.15, sleeve, 0, -0.26, 0);
      b.box(0.125, 0.17, 0.125, l.skin, 0, -0.43, 0);
    }
    if (glove != null) b.box(0.14, 0.1, 0.14, glove, 0, -0.5, 0);                    // work gloves
    return b.build();
  });
}

function legGeo(l) {
  const ov = l.outfit === 'overalls', suit = l.outfit === 'paintsuit';
  const pants = ov || suit ? l.outfitColor : l.pants;
  const shoe = l.bootColor ?? (ov ? BOOT : l.shoe);
  const key = [pants, shoe, ov ? 'cuff' : suit ? 'suit' : '', l.shorts ? l.skin : ''].join('|');
  return memo(legCache, key, () => {
    const b = new Builder();
    if (l.shorts) {
      b.box(0.19, 0.2, 0.19, pants, 0, -0.2, 0);
      b.box(0.15, 0.22, 0.15, l.skin, 0, -0.42, 0);
      b.box(0.17, 0.05, 0.17, 0xf2e8d5, 0, -0.45, 0);                           // sock
    } else if (suit) {
      b.box(0.205, 0.42, 0.205, pants, 0, -0.42, 0);                      // baggy suit leg
      b.box(0.215, 0.045, 0.215, shade(pants, 0.86), 0, -0.42, 0);        // elastic ankle over the shoe cover
    } else {
      b.box(0.19, 0.42, 0.19, pants, 0, -0.42, 0);
      if (ov) b.box(0.2, 0.05, 0.2, shade(pants, 0.78), 0, -0.42, 0);   // rolled cuff
    }
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

let gunGeo = null;
/** Spray gun held in the right fist; the barrel runs along the arm (local -y), the paint cup sits on top (local +z
 *  while the arm points forward) and is a separate mesh so it can take the paint colour. */
function getGunGeo() {
  if (gunGeo) return gunGeo;
  const b = new Builder();
  const G = 0x6b7580, GD = 0x3d454c, S = 0xdfe4e6;
  b.box(0.075, 0.3, 0.09, G, 0, -0.78, -0.01);                  // body
  b.box(0.06, 0.12, 0.07, GD, 0, -0.5, -0.045);                 // grip behind the fist
  b.box(0.05, 0.07, 0.15, GD, 0, -0.56, -0.115);                // handle running down
  b.box(0.04, 0.1, 0.04, S, 0, -0.9, 0.0);                       // nozzle
  b.box(0.065, 0.025, 0.065, GD, 0, -0.95, 0.0);                 // air cap
  b.box(0.025, 0.07, 0.03, S, 0, -0.7, -0.065);                  // trigger
  b.box(0.04, 0.05, 0.05, GD, 0, -0.62, 0.05);                   // cup connector
  gunGeo = b.build();
  return gunGeo;
}
const cupGeo = new THREE.CylinderGeometry(0.058, 0.05, 0.13, 10).rotateX(Math.PI / 2);
const cupMats = new Map();
const cupMat = (hex) => {
  let m = cupMats.get(hex);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true }); cupMats.set(hex, m); }
  return m;
};
let clothGeo = null;
/** A folded microfibre polishing cloth, a thick pad over the palm. */
function getClothGeo() {
  if (clothGeo) return clothGeo;
  const b = new Builder();
  b.box(0.26, 0.05, 0.22, 0xf6c453, 0, -0.56, 0);
  b.box(0.24, 0.05, 0.2, 0xfbe08a, 0, -0.6, 0);
  b.box(0.2, 0.03, 0.17, 0xf6c453, 0, -0.63, 0);
  b.box(0.04, 0.12, 0.08, 0xf6c453, 0.1, -0.54, 0.1);            // loose corner
  clothGeo = b.build();
  return clothGeo;
}
let foodGeo = null;
/** A fat sandwich: bun, lettuce, tomato, patty. Held in the right hand. */
function getFoodGeo() {
  if (foodGeo) return foodGeo;
  const b = new Builder();
  // layers stacked along local z (up while the arm points forward), 0.2 x 0.17 each
  const L = [[0xe3b26a, 0.05, -0.085], [0x7bbf5a, 0.025, -0.045], [0xe5484d, 0.03, -0.025], [0x7a4f32, 0.04, 0.005], [0xe3b26a, 0.06, 0.045]];
  for (const [c, t, z] of L) b.box(0.2, 0.17, t, c, 0, -0.65, z + t / 2 - 0.02);
  foodGeo = b.build();
  return foodGeo;
}

const mk = (geo) => { const m = new THREE.Mesh(geo, litMat); m.castShadow = true; return m; };
const smooth = (k) => k * k * (3 - 2 * k);

// ---- outfit change (the player's paint suit): a second body / arm / leg set on the same joints, swapped with a wipe.
// A level plane climbs the body: below it the new clothes show, above it the old ones (two clipping materials, one
// plane each, so they share one shader). Coverage per progress k: legs up to the waist, then the body and sleeves,
// then the hood over the head. Off = the same, backwards.
const SUIT_H = 1.62;                       // hood crown 1.51 + margin
const SUIT_ON = 0.9, SUIT_OFF = 0.65;      // seconds
const suitCover = (k) => (k < 0.4 ? 0.37 * smooth(k / 0.4) : k < 0.7 ? 0.37 + 0.27 * smooth((k - 0.4) / 0.3) : 0.64 + 0.36 * smooth((k - 0.7) / 0.3));
const _wp = new THREE.Vector3();

/** opts.outfits: this character changes clothes (setSuit); its meshes get their clipping material up front. */
export function createCharacter(look = {}, opts = {}) {
  const l = { ...DEFAULT_LOOK, ...look };
  if (typeof l.shirt !== 'number') l.shirt = DEFAULT_LOOK.shirt;
  if (l.outfit && typeof l.outfitColor !== 'number') l.outfitColor = P.wall;
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const body = new THREE.Group();                       // holds everything but the carry anchor, so builds scale it
  rig.add(body);
  if (l.build) body.scale.set(l.build.w ?? 1, l.build.h ?? 1, l.build.w ?? 1);

  const upper = new THREE.Group();
  upper.position.y = 0.5;
  body.add(upper);
  const bodyBase = bodyGeo(l);
  const bodyMesh = mk(bodyBase);
  upper.add(bodyMesh);

  const armG = armGeo(l);
  const armLM = mk(armG), armRM = mk(armG);
  const armL = new THREE.Group(); armL.position.set(-0.3, 0.45, 0); armL.add(armLM);
  const armR = new THREE.Group(); armR.position.set(0.3, 0.45, 0); armR.add(armRM);
  upper.add(armL, armR);

  const wrench = mk(getWrenchGeo());
  wrench.position.set(0, -0.5, 0.02);
  wrench.visible = false;
  armR.add(wrench);

  // spray gun + cup (cup takes the paint colour), polishing cloth, sandwich: right-hand tools, hidden until used
  const gun = new THREE.Group();
  gun.position.set(0, -0.0, 0.0);
  gun.add(mk(getGunGeo()));
  const cup = new THREE.Mesh(cupGeo, cupMat(0xcccccc));
  cup.castShadow = true;
  cup.position.set(0, -0.66, 0.1);
  gun.add(cup);
  gun.visible = false;
  armR.add(gun);
  const sprayTip = new THREE.Object3D();               // +z of this object = the direction the gun points
  sprayTip.position.set(0, -0.98, 0);
  sprayTip.rotation.x = Math.PI / 2;
  armR.add(sprayTip);
  const cloth = mk(getClothGeo());
  cloth.visible = false;
  armR.add(cloth);
  const polishTip = new THREE.Object3D();             // the cloth: where polish sparkles belong
  polishTip.position.set(0, -0.62, 0);
  armR.add(polishTip);
  const food = mk(getFoodGeo());
  food.visible = false;
  armR.add(food);

  const legG = legGeo(l);
  const legLM = mk(legG), legRM = mk(legG);
  const legL = new THREE.Group(); legL.position.set(-0.12, 0.5, 0); legL.add(legLM);
  const legR = new THREE.Group(); legR.position.set(0.12, 0.5, 0); legR.add(legRM);
  body.add(legL, legR);
  const baseMeshes = [bodyMesh, armLM, armRM, legLM, legRM];

  let clip = null, alt = null, altKey = '', suitK = 0, suitTarget = 0, suitShown = -1;
  // the hat never shows with the suit: it lifts off and vanishes when suiting up starts (the body switches to a bare
  // head and the hat is its own mesh for that moment) and comes back once the suit is fully off
  let capAnim = 0, capOffGeo = null, capPivot = null;
  const CAP_Y = 0.93;                                   // upper-body space: the top of the head
  function capParts() {
    if (capPivot || l.hat === 'none') return;
    capOffGeo = bodyGeo({ ...l, hat: 'none' });
    capPivot = new THREE.Group();
    capPivot.position.y = CAP_Y;
    const m = mk(hatGeo(l));
    m.position.y = -CAP_Y;
    capPivot.add(m);
    capPivot.visible = false;
    upper.add(capPivot);
  }
  function applyCap() {
    if (!capPivot) return;
    bodyMesh.geometry = capAnim > 0 ? capOffGeo : bodyBase;
    capPivot.visible = capAnim > 0 && capAnim < 1;
    const e = smooth(capAnim);
    capPivot.position.y = CAP_Y + 0.18 * Math.sin(e * Math.PI * 0.5);
    capPivot.scale.setScalar(Math.max(0.001, 1 - e * e));
    capPivot.rotation.y = e * 1.4;
  }
  /** above: keeps the part of a mesh over the wipe line (old clothes), below: under it (new clothes). */
  function clipMats() {
    if (clip) return clip;
    const above = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4), below = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
    const mat = (plane) => { const m = litMat.clone(); m.clippingPlanes = [plane]; return m; };
    clip = { above, below, base: mat(above), alt: mat(below) };
    for (const m of baseMeshes) m.material = clip.base;
    return clip;
  }
  if (opts.outfits) clipMats();
  /** The second set of clothes, built for `sl` (rebuilt only when the look changes). */
  function ensureAlt(sl) {
    const al = { ...DEFAULT_LOOK, ...sl };
    const key = [...BODY_KEYS, 'longSleeves', 'glove', 'bootColor', 'pants', 'shoe'].map((k) => al[k]).join('|');
    if (alt && key === altKey) return;
    if (alt) for (const m of alt) m.removeFromParent();
    altKey = key;
    const c = clipMats(), ag = armGeo(al), lg = legGeo(al);
    alt = [bodyGeo(al), ag, ag, lg, lg].map((g) => { const m = new THREE.Mesh(g, c.alt); m.castShadow = true; m.visible = false; return m; });
    upper.add(alt[0]); armL.add(alt[1]); armR.add(alt[2]); legL.add(alt[3]); legR.add(alt[4]);
    suitShown = -1;
  }
  /** Show the clothes for suitK: old set, new set, or both cut at the wipe line. */
  function applySuit() {
    if (!alt) return;
    const k = suitK;
    if (k === suitShown && (k === 0 || k === 1)) return;
    suitShown = k;
    for (const m of baseMeshes) m.visible = k < 1;
    for (const m of alt) m.visible = k > 0;
    if (k > 0 && k < 1) {
      group.getWorldPosition(_wp);
      const h = _wp.y + rig.position.y + suitCover(k) * SUIT_H * (l.build?.h ?? 1);
      clip.above.constant = -h; clip.below.constant = h;
    } else { clip.above.constant = 1e4; clip.below.constant = 1e4; }
  }

  const carryAnchor = new THREE.Object3D();
  carryAnchor.position.set(0, 0.95, 0.4);
  rig.add(carryAnchor);

  let phase = Math.random() * 6.28, t = Math.random() * 10;
  let amp = 0, carry = 0, carryTarget = 0, sit = 0, sitTarget = 0;
  let work = 0, workTarget = 0, workT = 0, cheerT = -1;
  let spray = 0, sprayTarget = 0, sprayT = 0, polish = 0, polishTarget = 0, polishT = 0;
  let wave = 0, waveTarget = 0, waveT = 0, eat = 0, eatTarget = 0, eatT = 0, bites = 0, lastBite = -1;
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
    spray += (sprayTarget - spray) * Math.min(1, dt * 9);
    polish += (polishTarget - polish) * Math.min(1, dt * 9);
    wave += (waveTarget - wave) * Math.min(1, dt * 9);
    eat += (eatTarget - eat) * Math.min(1, dt * 8);
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
    wrench.visible = work > 0.3 && spray < 0.3 && polish < 0.3;

    // spraying: gun in the right hand held out in front, the body swings it slowly left and right (a stroke
    // across the panel), left arm tucked back. The gun always points where the character faces.
    let yawSweep = 0;
    if (spray > 0.01) {
      sprayT += dt;
      yawSweep = Math.sin(sprayT * 2.1) * 0.4 * spray;
      aRx += (-1.5 + Math.sin(sprayT * 4.2) * 0.05 - aRx) * spray;
      aRz += (-0.04 - aRz) * spray;
      aLx += (0.3 - aLx) * spray; aLz += (0.22 - aLz) * spray;
      lean += 0.14 * spray;
    }
    gun.visible = spray > 0.3;

    // polishing: cloth in the right hand on the car's side, circles of ~25 cm; the left hand braces on the panel
    if (polish > 0.01) {
      polishT += dt * 5.2;
      aRx += (-1.28 + Math.sin(polishT) * 0.36 - aRx) * polish;
      aRz += (-0.22 + Math.cos(polishT) * 0.42 - aRz) * polish;
      aLx += (-1.0 + Math.sin(polishT + 1.6) * 0.1 - aLx) * polish;
      aLz += (0.2 - aLz) * polish;
      lean += (0.3 + Math.sin(polishT * 0.5) * 0.04) * polish;
      yawSweep += Math.sin(polishT) * 0.1 * polish;
    }
    cloth.visible = polish > 0.3;

    // waving: right arm up and out, hand swinging side to side, a little lean back
    if (wave > 0.01) {
      waveT += dt;
      aRx += (-2.7 - aRx) * wave;
      aRz += (0.3 + Math.sin(waveT * 9) * 0.38 - aRz) * wave;
      lean -= 0.07 * wave;
      yawSweep += Math.sin(waveT * 4.5) * 0.06 * wave;
    }

    // eating (usually seated): a sandwich in the right hand goes up to the mouth, a bite, down again, chew
    if (eat > 0.01) {
      eatT += dt;
      const ph = (eatT % 1.6) / 1.6;
      const up = smooth(Math.min(1, Math.max(0, (ph - 0.05) / 0.3))) * (1 - smooth(Math.min(1, Math.max(0, (ph - 0.55) / 0.25))));
      const bite = Math.floor(eatT / 1.6);
      if (bite !== lastBite) { lastBite = bite; bites++; food.scale.setScalar(1 - 0.13 * (bites % 6)); if (bites % 6 === 0) food.scale.setScalar(1); }
      aRx += (-1.05 - 1.3 * up - aRx) * eat;
      aRz += (-0.1 - aRz) * eat;
      aLx += (-0.95 - aLx) * eat; aLz += (0.14 - aLz) * eat;
      const chew = ph > 0.3 && ph < 0.9 ? Math.abs(Math.sin(eatT * 14)) * 0.05 : 0;
      lean += (0.08 + chew) * eat;
    }
    food.visible = eat > 0.3;

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
    // dressing (paint suit): bent over pulling the legs up, arms into the sleeves with a shrug, both hands up to pull
    // the hood over the head, arms back down. Taking it off plays the same moves backwards.
    if (suitK !== suitTarget) suitK = suitTarget > suitK ? Math.min(1, suitK + dt / SUIT_ON) : Math.max(0, suitK - dt / SUIT_OFF);
    const capGoal = suitTarget > 0 || suitK > 0 ? 1 : 0;
    if (capPivot && capAnim !== capGoal) {
      capAnim = capGoal > capAnim ? Math.min(1, capAnim + dt / 0.28) : Math.max(0, capAnim - dt / 0.28);
      applyCap();
    }
    if (suitK > 0 && suitK < 1) {
      const p = suitK, w = smooth(Math.min(1, p / 0.08));
      let ax, az, ln;
      if (p < 0.4) { const q = p / 0.4; ax = -0.3 - 0.45 * q; az = 0.22; ln = 0.34 - 0.12 * q; }
      else if (p < 0.7) { const q = (p - 0.4) / 0.3; ax = -0.75 - 0.25 * smooth(q); az = 0.22 - 0.1 * q; ln = 0.22 - 0.17 * q; }
      else { const q = (p - 0.7) / 0.3; ax = -1.0 * (1 - q) - 1.9 * Math.sin(q * Math.PI); az = 0.12 + 0.22 * Math.sin(q * Math.PI) - 0.06 * q; ln = 0.05 * (1 - q) - 0.08 * Math.sin(q * Math.PI); }
      aLx += (ax - aLx) * w; aRx += (ax - aRx) * w;
      aLz += (az - aLz) * w; aRz += (-az - aRz) * w;
      lean += (ln - lean) * w;
    }
    applySuit();

    armL.rotation.x = aLx; armR.rotation.x = aRx;
    armL.rotation.z = aLz; armR.rotation.z = aRz;

    rig.position.y = Math.abs(Math.sin(phase)) * 0.07 * amp + hop;
    const idle = 1 - Math.min(1, amp * 3);
    upper.scale.y = 1 + Math.sin(t * 2.4) * 0.018 * idle * (1 - work);
    upper.rotation.x = lean;
    upper.rotation.y = yawSweep;
  }
  function setCarrying(on) { carryTarget = on ? 1 : 0; }
  function setSitting(on) { sitTarget = on ? 1 : 0; }
  function setWorking(on) {
    if (on && !workTarget) workT = 0;
    workTarget = on ? 1 : 0;
  }
  function cheer() { cheerT = 0; }
  function setSpraying(on) { if (on && !sprayTarget) sprayT = 0; sprayTarget = on ? 1 : 0; }
  function setPolishing(on) { if (on && !polishTarget) polishT = 0; polishTarget = on ? 1 : 0; }
  function setWaving(on) { if (on && !waveTarget) waveT = 0; waveTarget = on ? 1 : 0; }
  function setEating(on) { if (on && !eatTarget) { eatT = 0; lastBite = -1; bites = 0; food.scale.setScalar(1); } eatTarget = on ? 1 : 0; }
  /** Colour of the paint in the gun's cup (hex number). */
  function setSprayColor(hex) { cup.material = cupMat(hex); }
  /** Put the paint suit (look `suitLook`) on / take it off; animate false = at once (e.g. while hidden in a car). */
  function setSuit(on, suitLook, animate = true) {
    if (on && suitLook) { ensureAlt(suitLook); capParts(); }
    if (!alt) return;
    suitTarget = on ? 1 : 0;
    if (!animate) { suitK = suitTarget; capAnim = suitTarget; applySuit(); applyCap(); }
  }

  update(0, 0);
  return {
    group, carryAnchor, update, setCarrying, setSitting, setWorking, cheer, setSpraying, setPolishing, setWaving, setEating,
    setSprayColor, setSuit, sprayTip, polishTip, look: l,
    get spraying() { return sprayTarget > 0; }, get polishing() { return polishTarget > 0; },
    /** Fully in the suit (dressing done). */ get suited() { return suitK >= 1; },
  };
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
export function playerLook({ goldCap = false } = {}) {
  return {
    role: 'player', shirt: CREAM, outfit: 'overalls', outfitColor: CORAL, patch: CREAM,
    skin: 0xedb98a, hair: 0x4a3222, hairStyle: 'short',
    ...(goldCap ? { hat: 'goldcap', hatColor: 0xf2c230, hatBadge: 0xfff0a0 } : { hat: 'cap', hatColor: MUSTARD, hatBadge: CORAL }),
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

// ---------------------------------------------------------------- Harbor Town looks
// Teams are told apart from the high game camera by torso colour first:
//   garage mechanics   navy / teal overalls            (existing)
//   Spray Bay (paint)  WHITE overalls or purple vest, paint splatters, respirator, white caps with a purple band
//   Platinum Club      BLACK with GOLD: black overalls / waistcoat / tuxedo, gold trim, peaked caps
//   tow driver         orange hi-vis vest, yellow hard hat
//   managers           a suit in the colour of their facility, glasses, lanyard
const PURPLE = 0x8e5bd1, BLACK = 0x23272e, GOLD = 0xe8b923, GOLD_L = 0xfbe27a;
const PAINTERS = [
  { skin: 0xedb98a, hair: 0x4a3222, hairStyle: 'short', splat: [0xe5484d, 0x3b82c4, 0xf6c453], glove: PURPLE },
  { skin: 0x8d5a3b, hair: 0x2b2118, hairStyle: 'curly', splat: [0x2a9d8f, 0xf6c453, 0x8e5bd1], glove: PURPLE },
  { skin: 0xf6d3b3, hair: 0xb5482f, hairStyle: 'pony', splat: [0x8e5bd1, 0xd9a521, 0xe5484d], glove: PURPLE },
  { skin: 0xb97a4f, hair: 0x2b2118, hairStyle: 'short', splat: [0x3b82c4, 0x2b2f36, 0x2a9d8f], glove: PURPLE },
];
/** Spray Bay painter: white overalls with paint splatters, respirator, purple-banded white cap. */
export function painterLook(i = 0) {
  const p = PAINTERS[((i % 4) + 4) % 4];
  return {
    role: 'painter', shirt: WHITE, longSleeves: true, outfit: 'overalls', outfitColor: 0xf4f1ea, patch: PURPLE,
    mask: 'respirator', hat: 'paintcap', hatColor: 0xf4f1ea, hatBadge: PURPLE, bootColor: 0xd7dde0, ...p,
  };
}
/** The player's paint suit (put on at a spray booth's work mat): white hooded coverall zipped to the chin,
 *  respirator, goggles, shoe covers; coral gloves and name patch keep them the player from the high camera. */
export function paintSuitLook(base = {}) {
  const W = 0xf2f4f5;
  return {
    role: 'player', skin: base.skin ?? 0xedb98a, hair: base.hair ?? 0x4a3222, hairStyle: 'bald',
    shirt: W, outfit: 'paintsuit', outfitColor: W, patch: CORAL, glove: CORAL, longSleeves: true,
    hat: 'hood', hatColor: W, mask: 'respirator', goggles: true, bootColor: 0xd7dde0,
  };
}
/** Prep tech: white shirt, purple waistcoat, purple-banded cap: same team colours as the painters. */
export function prepTechLook() {
  return {
    role: 'preptech', shirt: WHITE, outfit: 'vest', outfitColor: PURPLE, longSleeves: false, pants: 0x4a4f5a,
    skin: 0xd99a6c, hair: 0x2b2118, hairStyle: 'spiky', hat: 'visor', hatColor: PURPLE, shoe: 0xf4f1ea, glove: 0xf4f1ea,
  };
}
/** Platinum Club host: black tuxedo, gold bow tie, chauffeur cap with a gold band, white gloves. */
export function hostLook() {
  return {
    role: 'host', shirt: WHITE, outfit: 'suit', outfitColor: BLACK, trim: GOLD, bowtie: GOLD, pocket: GOLD_L, pants: BLACK,
    shoe: 0x0f1114, skin: 0xedb98a, hair: 0x2b2118, hairStyle: 'short', hat: 'peaked', hatColor: BLACK, hatBadge: GOLD, glove: WHITE,
  };
}
/** Platinum Club master tech: black overalls, gold patch and cap badge. */
export function masterTechLook() {
  return {
    role: 'mastertech', shirt: BLACK, outfit: 'overalls', outfitColor: 0x2f343c, patch: GOLD, glove: GOLD, bootColor: 0x14161a,
    skin: 0xb97a4f, hair: 0x2b2118, hairStyle: 'short', beard: 0x2b2118, beardStyle: 'stache', hat: 'cap', hatColor: BLACK, hatBadge: GOLD,
  };
}
/** Platinum Club detailer: black waistcoat over a white shirt, gold apron-front, gold visor, a cloth is her tool. */
export function detailerLook() {
  return {
    role: 'detailer', shirt: WHITE, longSleeves: true, outfit: 'vest', outfitColor: BLACK, pants: BLACK, shoe: 0x0f1114,
    skin: 0xf6d3b3, hair: 0x7a4f32, hairStyle: 'bun', hat: 'visor', hatColor: GOLD, glove: GOLD, necklace: GOLD, bowtie: GOLD,
  };
}
const VIP_JACKETS = [0x7a1f3b, 0x1d6f5e, 0x1e3f8a, 0xede4cf, 0x4a2a6a, 0x9a6a2a];
const VIP_SKIN = [0xf6d3b3, 0xedb98a, 0xd99a6c, 0x8d5a3b, 0xb97a4f];
let vipPool = null;
function buildVipPool() {
  const rnd = mulberry32(777), pick = (a) => a[Math.floor(rnd() * a.length)];
  const out = [];
  for (let i = 0; i < 14; i++) {
    const c = VIP_JACKETS[i % VIP_JACKETS.length];
    const woman = i % 2 === 1;
    out.push(woman ? {
      role: 'vip', shirt: WHITE, outfit: 'dress', outfitColor: c, trim: GOLD, pants: shade(c, 0.5), shoe: 0x2b2118, skin: pick(VIP_SKIN),
      hair: pick([0x2b2118, 0xc9a35a, 0x8a8f99, 0x4a3222]), hairStyle: pick(['long', 'bun', 'pony', 'curly']), necklace: GOLD_L,
      sunglasses: rnd() < 0.5 ? 0x15181c : null, hat: rnd() < 0.4 ? 'sun' : 'none', hatColor: 0xf2e8d5, hatBadge: c,
    } : {
      role: 'vip', shirt: WHITE, outfit: 'suit', outfitColor: c, trim: GOLD, tie: rnd() < 0.5 ? GOLD : null, pocket: GOLD_L,
      pants: shade(c, 0.7), shoe: 0x15181c, skin: pick(VIP_SKIN), hair: pick([0x2b2118, 0x8a8f99, 0xc9a35a, 0x4a3222]),
      hairStyle: pick(['short', 'short', 'bald', 'curly']), sunglasses: rnd() < 0.6 ? 0x15181c : null,
      beard: rnd() < 0.3 ? 0x2b2118 : null, beardStyle: pick(['goatee', 'stache']), hat: rnd() < 0.3 ? 'fedora' : 'none',
      hatColor: 0xede4cf, hatBadge: c,
    });
  }
  return out;
}
/** Gold-card customer of the Platinum Club: jewel-coloured suit or dress, gold trim, sunglasses. */
export function vipCustomerLook() {
  if (!vipPool) vipPool = buildVipPool();
  return { ...vipPool[Math.floor(Math.random() * vipPool.length)] };
}
/** Espresso bar: cream shirt with rolled sleeves, brown apron, beret, hair in a bun. */
export function baristaLook() {
  return {
    role: 'barista', shirt: CREAM, outfit: 'apron', outfitColor: 0x7a4f32, patch: CREAM, pants: 0x2f4858, shoe: 0x2b2118,
    skin: 0xd99a6c, hair: 0x2b2118, hairStyle: 'bun', hat: 'beret', hatColor: CORAL, glasses: 0x2b2f36,
  };
}
const MANAGER_TEAMS = {
  garage: { outfitColor: 0x2f4858, tie: CORAL, skin: 0xedb98a, hair: 0x4a3222, hairStyle: 'short' },
  paint: { outfitColor: 0xf4f1ea, tie: PURPLE, skin: 0xb97a4f, hair: 0x2b2118, hairStyle: 'curly', pocket: PURPLE },
  vip: { outfitColor: BLACK, tie: GOLD, trim: GOLD, skin: 0xf6d3b3, hair: 0x8a8f99, hairStyle: 'short', pocket: GOLD_L },
};
/** Floor manager of a facility ('garage' | 'paint' | 'vip'): a suit in the facility's colours, glasses, lanyard. */
export function managerLook(kind = 'garage') {
  const m = MANAGER_TEAMS[kind] ?? MANAGER_TEAMS.garage;
  return {
    role: 'manager', shirt: kind === 'garage' ? 0x5aa9e6 : WHITE, outfit: 'suit', pants: shade(m.outfitColor, kind === 'paint' ? 0.55 : 0.85),
    shoe: 0x15181c, glasses: 0x2b2f36, badge: kind === 'vip' ? GOLD : CORAL, ...m,
  };
}
/** Showroom buyer: grey suit, red tie, fedora, sunglasses and a goatee (a serious collector). */
export function buyerLook() {
  return {
    role: 'buyer', shirt: WHITE, outfit: 'suit', outfitColor: 0x5c6670, pants: 0x4a525c, tie: 0xe5484d, pocket: 0xf6c453, shoe: 0x2b2118,
    skin: 0xd99a6c, hair: 0x2b2118, hairStyle: 'short', hat: 'fedora', hatColor: 0x3b3f48, hatBadge: 0xc9a35a,
    glasses: 0x15181c, beard: 0x2b2118, beardStyle: 'goatee',
  };
}
/** Tow truck driver: orange hi-vis vest over a navy shirt, yellow hard hat, stubble. */
export function towDriverLook() {
  return {
    role: 'towdriver', shirt: 0x34557a, longSleeves: true, outfit: 'hiviz', outfitColor: 0xff8a2b, patch: 0xffffff,
    pants: 0x3a3f48, shoe: BOOT, bootColor: BOOT, skin: 0xedb98a, hair: 0x7a4f32, hairStyle: 'short', beard: 0x6a4a34, beardStyle: 'full',
    hat: 'hardhat', hatColor: 0xf6c453, hatBadge: 0xff8a2b, glove: 0x3a3f48,
  };
}

// ---- pedestrians: a wide, curated pool (ages, builds, clothes) ----
const P_SHIRTS = [0xf26b5b, 0xf6c453, 0x2a9d8f, 0x5aa9e6, 0x9b8fd4, 0xf4a582, 0x8fd1b0, 0xf2e8d5, 0xe07a9a, 0xee8c3a, 0xc9d46a, 0x6c8ebf];
const P_MUTED = [0x7a8450, 0x6b4f6a, 0x8a6a4a, 0x4a6a7a, 0x9a4a4a, 0x5a7a62, 0xb0a48a, 0x3f4a5a];
const P_PANTS = [0x2f4858, 0x4a6fa5, 0xc2a878, 0x4a4f5a, 0x7a8450, 0x7a4f32, 0x3b3f48, 0xa8b0b8, 0x6b4f6a];
const P_HAIR = [0x2b2118, 0x4a3222, 0x7a4f32, 0xc9a35a, 0xb5482f, 0x3b4a6b, 0xe3cf9a];
const P_HAIR_STYLES = ['short', 'short', 'long', 'bun', 'spiky', 'curly', 'bald', 'pony'];
let pedPool = null;
function buildPedPool() {
  const rnd = mulberry32(90210);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const out = [];
  for (let i = 0; i < 96; i++) {
    const age = rnd() < 0.14 ? 'kid' : rnd() < 0.18 ? 'senior' : 'adult';
    const kind = rnd();
    const l = {
      role: 'pedestrian', skin: pick(SKINS), pants: pick(P_PANTS), hair: pick(P_HAIR), hairStyle: pick(P_HAIR_STYLES),
      shirt: pick(P_SHIRTS), hat: 'none', hatColor: pick(P_SHIRTS), hatBadge: CREAM, shoe: pick([SHOE, 0xf2e8d5, 0x7a4f32, 0x2b2f36]),
    };
    // build: height and width scale
    if (age === 'kid') l.build = { h: 0.66 + rnd() * 0.12, w: 0.8 + rnd() * 0.08 };
    else l.build = { h: 0.92 + rnd() * 0.2, w: rnd() < 0.2 ? 1.12 + rnd() * 0.1 : rnd() < 0.3 ? 0.88 : 0.98 + rnd() * 0.06 };
    // clothes
    if (kind < 0.18) { l.outfit = 'hoodie'; l.outfitColor = pick(P_SHIRTS); l.patch = rnd() < 0.4 ? CREAM : null; }
    else if (kind < 0.34) { l.outfit = 'jacket'; l.outfitColor = pick(P_MUTED.concat(P_SHIRTS)); }
    else if (kind < 0.50) { l.outfit = 'dress'; l.outfitColor = pick(P_SHIRTS.concat(P_MUTED)); l.pants = pick([0xedb98a, 0x2b2f36, 0x4a4f5a]); l.trim = rnd() < 0.5 ? CREAM : null; if (l.pants === 0xedb98a) l.pants = l.skin; }
    else if (kind < 0.58) { l.outfit = 'suit'; l.outfitColor = pick([0x3b3f48, 0x2f4858, 0x5c6670, 0x6b4f6a, 0x7a6a4a]); l.pants = shade(l.outfitColor, 0.85); l.shirt = pick([WHITE, 0xa8c8e8, 0xf4cfd0]); l.tie = rnd() < 0.6 ? pick(P_SHIRTS) : null; }
    else if (kind < 0.68) { l.shorts = true; l.longSleeves = false; }
    else { l.longSleeves = rnd() < 0.4; l.stripe = rnd() < 0.25 ? pick(P_SHIRTS) : null; if (l.stripe === l.shirt) l.stripe = null; }
    if (l.outfit && l.outfit !== 'dress') l.longSleeves = false;
    // hats and accessories
    const h = rnd();
    if (h < 0.1) { l.hat = 'cap'; } else if (h < 0.18) { l.hat = 'beanie'; l.hatColor = pick(P_MUTED); } else if (h < 0.24) { l.hat = 'sun'; l.hatColor = 0xe3cf9a; l.hatBadge = pick(P_SHIRTS); }
    else if (h < 0.28 && age === 'adult') { l.hat = 'fedora'; l.hatColor = pick([0x7a4f32, 0x3b3f48, 0xc2a878]); l.hatBadge = CREAM; }
    else if (h < 0.32) { l.hat = 'visor'; }
    if (age !== 'kid' && rnd() < 0.2) l.glasses = pick([0x2b2f36, 0xb5482f, 0x2a9d8f]);
    else if (age !== 'kid' && rnd() < 0.08) l.sunglasses = 0x15181c;
    if (age === 'adult' && l.hairStyle !== 'long' && l.skin !== SKINS[0] || age === 'senior') {
      if (rnd() < 0.2) { l.beard = l.hair; l.beardStyle = pick(['full', 'stache', 'goatee']); }
    }
    if (rnd() < 0.18 && l.outfit !== 'dress') l.scarf = pick(P_SHIRTS);
    if (rnd() < 0.2) l.backpack = pick([0x2a9d8f, 0xe5484d, 0x3b82c4, 0x7a4f32, 0xf6c453]);
    if (age === 'senior') { l.hair = pick([0x8a8f99, 0xd8d8d8, 0xb7bcc4]); l.hairStyle = pick(['short', 'bald', 'bun', 'short']); l.build.h *= 0.96; if (l.beard) l.beard = l.hair; if (l.hat === 'visor') l.hat = 'none'; l.hat = rnd() < 0.5 ? 'fedora' : l.hat; if (l.hat === 'fedora') { l.hatColor = pick([0x7a4f32, 0x3b3f48]); } l.glasses = l.glasses ?? 0x2b2f36; }
    if (age === 'kid') { l.hat = rnd() < 0.3 ? 'cap' : 'none'; l.hairStyle = pick(['short', 'pony', 'spiky', 'curly']); l.backpack = rnd() < 0.5 ? pick([0xe5484d, 0x2a9d8f, 0xf6c453]) : null; l.scarf = null; }
    out.push(l);
  }
  return out;
}
/** A random townsperson from a 96-strong pool; pass an index for a repeatable one. */
export function pedestrianLook(i) {
  if (!pedPool) pedPool = buildPedPool();
  const k = Number.isFinite(i) ? ((Math.floor(i) % pedPool.length) + pedPool.length) % pedPool.length : Math.floor(Math.random() * pedPool.length);
  const src = pedPool[k];
  return { ...src, build: src.build ? { ...src.build } : null };
}
