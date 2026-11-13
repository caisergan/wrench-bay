// Small models for the tow truck's rescue calls (TOWN.md 4.5; gameplay: src/game/rescue.js).
//   createWarningTriangle()  red reflective warning triangle on its fold-out stand (faces +z, origin on the ground)
//   createTowZone(w, d)      the tow drop zone painted on the paving (yellow box + TOW), pulsing while towing
//   createPhone()            a phone for a character's right hand (attach to the arm: see rescue.js)
// Same way of working as props-town.js: one merged vertex-coloured mesh per rigid piece, cached geometry.
// Stacked faces are kept a few mm apart (no coplanar flicker).
import * as THREE from 'three';
import { Builder, litMat, glowMat, memo, mesh } from './voxel.js';

const cache = new Map();
const geo = (key, fn) => memo(cache, key, () => { const b = new Builder(); fn(b); return b.build(); });

const RED = 0xd8352f, RED_L = 0xf2603f, GREY = 0x3a3f47, GREY_L = 0x6d757e, WHITE = 0xf4f1ea, MUSTARD = 0xf6c453;

/**
 * Warning triangle, ~0.56 m a side (chunky, so it reads from the high camera). A hollow frame: a dark red outer
 * band with a brighter reflective strip on its front, standing on a dark stand with two splayed feet.
 * The front faces +z. userData.setDown(true) lays it flat on its back (knocked over).
 */
export function createWarningTriangle() {
  const side = 0.56, band = 0.09, depth = 0.05;
  const h = side * Math.sqrt(3) / 2;                // triangle height
  const y0 = 0.07;                                  // bottom edge above the ground (on the stand)
  const g = geo('warnTriangle', (b) => {
    // stand: a bar under the bottom edge and two feet splayed back and forth
    b.box(side * 0.55, 0.04, 0.05, GREY, 0, 0.03, 0);
    b.box(0.05, 0.03, 0.34, GREY, -side * 0.24, 0, 0);
    b.box(0.05, 0.03, 0.34, GREY, side * 0.24, 0, 0);
    b.box(0.06, 0.035, 0.05, GREY_L, -side * 0.24, 0.03, 0.15);
    b.box(0.06, 0.035, 0.05, GREY_L, side * 0.24, 0.03, 0.15);
    // three bars of the frame, each rotated about z in the x-y plane
    const bars = [
      { cx: 0, cy: y0 + band / 2, len: side, rz: 0 },
      { cx: -side / 4, cy: y0 + h / 2, len: side, rz: Math.PI / 3 },
      { cx: side / 4, cy: y0 + h / 2, len: side, rz: -Math.PI / 3 },
    ];
    for (const s of bars) {
      // outer band (box() puts the bottom at y: shift by half the height so the bar is centred on cy)
      b.push(s.cx, s.cy, 0, 0, 1, 0);
      b.box(s.len, band, depth, RED, 0, -band / 2, 0, 0, 0, s.rz);
      // reflective strip on the front face, 6 mm proud of it and a little narrower
      b.box(s.len * 0.86, band * 0.5, 0.012, RED_L, 0, -band * 0.25, depth / 2 + 0.008, 0, 0, s.rz);
      b.pop();
    }
    // hinge knob at the top
    b.box(0.07, 0.06, depth + 0.02, GREY, 0, y0 + h - 0.1, 0);
  });
  const group = new THREE.Group();
  const body = mesh(g, litMat, { cast: true, receive: false });
  group.add(body);
  group.userData.setDown = (on) => {
    // knocked over backwards: it lies on its back, feet in the air
    body.rotation.x = on ? -Math.PI / 2 + 0.06 : 0;
    body.position.set(0, on ? 0.03 : 0, on ? 0.02 : 0);
  };
  return group;
}

/**
 * Tow drop zone painted on the paving, like a real tow / loading bay: a yellow box (outer line + a thin inner line)
 * with "TOW" in block letters, readable from the camera (letter tops to -z). w = size along x, d = along z; origin
 * at the zone centre. Paint is 8 mm thick, 20 mm above the floor (clear of paving and other markings); the pulsing
 * highlight (setActive while a car is on the hook) is a translucent fill 16 mm up, under the paint.
 * Returns { group, setActive(on), update(dt) }.
 */
export function createTowZone(w = 4.2, d = 4.7) {
  const Y = 0.02, T = 0.008, Y2 = Y + 0.002;        // paint base, thickness; letters a hair higher than the lines
  const key = `towZone|${w.toFixed(2)}|${d.toFixed(2)}`;
  const g = geo(key, (b) => {
    const line = (x0, z0, x1, z1, wd, y = Y) => b.box(Math.abs(x1 - x0) || wd, T, Math.abs(z1 - z0) || wd, MUSTARD, (x0 + x1) / 2, y, (z0 + z1) / 2);
    // outer box (the side bars stop short of the end bars: no overlapping faces)
    const ow = 0.16, hx = w / 2, hz = d / 2;
    line(-hx, -hz + ow / 2, hx, -hz + ow / 2, ow); line(-hx, hz - ow / 2, hx, hz - ow / 2, ow);
    b.box(ow, T, d - ow * 2, MUSTARD, -hx + ow / 2, Y, 0); b.box(ow, T, d - ow * 2, MUSTARD, hx - ow / 2, Y, 0);
    // thin inner line, dashed
    const iw = 0.06, ix = hx - 0.42, iz = hz - 0.42, dash = 0.42, gap = 0.26;
    for (let x = -ix; x < ix - 0.05; x += dash + gap) {
      const x1 = Math.min(ix, x + dash);
      b.box(x1 - x, T, iw, MUSTARD, (x + x1) / 2, Y, -iz); b.box(x1 - x, T, iw, MUSTARD, (x + x1) / 2, Y, iz);
    }
    for (let z = -iz + 0.2; z < iz - 0.25; z += dash + gap) {
      const z1 = Math.min(iz - 0.2, z + dash);
      b.box(iw, T, z1 - z, MUSTARD, -ix, Y, (z + z1) / 2); b.box(iw, T, z1 - z, MUSTARD, ix, Y, (z + z1) / 2);
    }
    // T O W in block letters: height 1.0 (z), letter width 0.78, stroke 0.17
    const H = 1.0, LW = 0.78, S = 0.17, sp = 0.26, x0 = -(LW * 3 + sp * 2) / 2, zt = -H / 2, zb = H / 2;
    const bar = (xa, za, xb, zb2) => b.box(xb - xa, T, zb2 - za, MUSTARD, (xa + xb) / 2, Y2, (za + zb2) / 2);
    let x = x0;
    bar(x, zt, x + LW, zt + S); bar(x + LW / 2 - S / 2, zt + S, x + LW / 2 + S / 2, zb);                    // T
    x += LW + sp;
    bar(x, zt, x + LW, zt + S); bar(x, zb - S, x + LW, zb); bar(x, zt + S, x + S, zb - S); bar(x + LW - S, zt + S, x + LW, zb - S);  // O
    x += LW + sp;
    bar(x, zt, x + S, zb - S); bar(x + LW - S, zt, x + LW, zb - S); bar(x, zb - S, x + LW, zb);              // W: sides + base
    bar(x + LW / 2 - S / 2, zt + H * 0.4, x + LW / 2 + S / 2, zb - S);                                      //    middle stroke
  });
  const group = new THREE.Group();
  const paint = mesh(g, litMat, { cast: false, receive: true });
  paint.renderOrder = 1;
  group.add(paint);
  const fillMat = new THREE.MeshBasicMaterial({ color: MUSTARD, transparent: true, opacity: 0, depthWrite: false });
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.32, d - 0.32), fillMat);
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.016;
  fill.renderOrder = 1;
  fill.visible = false;
  group.add(fill);
  let active = false, t = 0;
  return {
    group,
    setActive(on) { active = !!on; fill.visible = active; if (!active) fillMat.opacity = 0; },
    update(dt) {
      if (!active) return;
      t += dt;
      fillMat.opacity = 0.16 + 0.14 * (0.5 + 0.5 * Math.sin(t * 4.2));
    },
  };
}

/** A phone (body + glowing screen on its +z face). Held in a character's right hand: see rescue.js. */
export function createPhone() {
  const body = geo('phoneBody', (b) => {
    b.box(0.1, 0.17, 0.025, 0x23262c, 0, -0.085, 0);
  });
  const screen = geo('phoneScreen', (b) => {
    b.box(0.078, 0.13, 0.006, 0x9fd8f0, 0, -0.077, 0.014);
  });
  const group = new THREE.Group();
  group.add(mesh(body, litMat, { cast: false }));
  group.add(mesh(screen, glowMat, { cast: false }));
  return group;
}
