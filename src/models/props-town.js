// Town kit (TOWN.md section 7 "Town kit") + the small shared helpers used by buildings-home.js / buildings-main.js.
// Same way of working as props.js: every rigid piece is one merged vertex-coloured mesh (voxel.js Builder) cached
// per look; moving bits are separate small meshes sharing materials. Everything faces +z, origin at floor level.
import * as THREE from 'three';
import { PALETTE as P } from '../config.js';
import { Builder, litMat, glowMat, memo, mesh, polygon } from './voxel.js';

// ---------------------------------------------------------------- shared palette + helpers (also used by buildings-*)
export const TC = {
  NAVY: P.wall, NAVY_D: 0x22384a, NAVY_L: 0x3c5a6a, CORAL: P.wallTrim, CORAL_D: 0xc9503f, MUSTARD: P.accent,
  MUSTARD_D: 0xd9a23a, TEAL: P.teal, TEAL_D: 0x1f7a6f, CREAM: 0xf6ecd8, CREAM_L: 0xfff6e6, STEEL: 0xb9c4cc,
  STEEL_D: 0x8a98a2, STEEL_DD: 0x5c6670, RUBBER: 0x2b2f36, DARK: 0x1f2329, CHROME: 0xdfe4e6, WOOD: P.wood,
  WOOD_D: P.woodDark, WOOD_L: 0xc89a6a, GOLD: 0xd9a521, GOLD_L: 0xf3cf6a, GOLD_D: 0xa87a14, GLASS: 0xa6dbec,
  GLASS_L: 0xcdeef7, LAMP: 0xfff1b8, LEAF: 0x3f9d6a, LEAF_L: 0x56b97a, BRICK: 0xb8614a, BRICK_D: 0x96493a,
  CONCRETE: 0xc9c4ba, CONCRETE_D: 0xa9a399, ASPHALT: 0x5b5f6b, RED: 0xd94848, WHITE: 0xf4f1ea, BLUE: 0x3b7dd8,
  PLUM: 0x3a2a3f, BLACK: 0x24262b,
};
export const PI = Math.PI;
export const R90 = Math.PI / 2;
export const FONT = '"Fredoka", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
export const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

const geoCache = new Map();
/** Cached merged geometry built by fn(builder). */
export function geo(key, fn) {
  return memo(geoCache, key, () => { const b = new Builder(); fn(b); return b.build(); });
}
/** Group holding one cached merged mesh. */
export function solidGroup(g, opts = { cast: true, receive: true }) {
  const grp = new THREE.Group();
  grp.add(mesh(g, litMat, opts));
  return grp;
}

const texCache = new Map();
/** Canvas texture, cached by key, redrawn once the Fredoka font is ready. */
export function canvasTex(key, w, h, draw, { repeat = null } = {}) {
  return memo(texCache, key, () => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; });
    return t;
  });
}
const faceMats = new Map();
/** Flat sign face (plane facing +z). lit = false: unlit like the garage sign (always readable). */
export function faceMat(tex, { lit = false, transparent = false } = {}) {
  const key = tex.uuid + (lit ? 'L' : 'B') + (transparent ? 'T' : '');
  return memo(faceMats, key, () => lit
    ? new THREE.MeshLambertMaterial({ map: tex, transparent, depthWrite: !transparent })
    : new THREE.MeshBasicMaterial({ map: tex, transparent, depthWrite: !transparent, toneMapped: false }));
}
export function face(tex, w, h, { lit = false, transparent = false } = {}) {
  const pm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat(tex, { lit, transparent }));
  pm.receiveShadow = lit;
  return pm;
}
/** Flat decal lying on the floor (texture top = -z). */
export function decal(tex, w, d, y = 0.02) {
  const m = face(tex, w, d, { lit: true, transparent: true });
  m.rotation.x = -R90;
  m.position.y = y;
  m.renderOrder = 1;
  return m;
}
/** Big lettering sign texture: rounded board, outline, text with a drop shadow. */
export function signTex(text, { bg = TC.NAVY, fg = TC.CREAM_L, shadow = TC.CORAL, border = TC.MUSTARD, w = 1024, h = 256,
  size = 0.5, sub = null, subColor = null, dashed = true, icon = null } = {}) {
  return canvasTex(`sign|${text}|${bg}|${fg}|${shadow}|${border}|${w}|${h}|${sub}|${icon}`, w, h, (g) => {
    g.fillStyle = css(bg); g.fillRect(0, 0, w, h);
    if (border !== null) {
      g.strokeStyle = css(border); g.lineWidth = h * 0.035;
      if (dashed) g.setLineDash([h * 0.1, h * 0.065]);
      g.strokeRect(h * 0.07, h * 0.07, w - h * 0.14, h - h * 0.14); g.setLineDash([]);
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.round(h * size);
    g.font = `700 ${fs}px ${FONT}`;
    let tw = g.measureText(text).width;
    const maxW = w - h * (icon ? 0.9 : 0.4);
    if (tw > maxW) { g.font = `700 ${Math.round(fs * maxW / tw)}px ${FONT}`; tw = maxW; }
    const ty = sub ? h * 0.42 : h * 0.53;
    const cx = w / 2 + (icon ? h * 0.18 : 0);
    if (shadow !== null) { g.fillStyle = css(shadow); g.fillText(text, cx + h * 0.025, ty + h * 0.03); }
    g.fillStyle = css(fg); g.fillText(text, cx, ty);
    if (sub) {
      g.font = `600 ${Math.round(h * 0.17)}px ${FONT}`;
      g.fillStyle = css(subColor ?? border ?? fg); g.fillText(sub, cx, h * 0.78);
    }
    if (icon) icon(g, cx - tw / 2 - h * 0.32, h * 0.5, h * 0.3);
  });
}
/** Raised sign board for the top of a back wall (like the garage's): board + bulbs + face, tilted to the camera. */
export function roofSign(tex, w, h, { board = TC.CORAL, bulbs = true, tilt = -0.2, legs = true } = {}) {
  const grp = new THREE.Group();
  const g = geo(`roofSign|${w}|${h}|${board}|${bulbs}|${legs}`, (b) => {
    b.box(w + 0.2, h + 0.2, 0.2, board, 0, 0.25, 0);
    if (legs) for (const s of [-1, 1]) b.box(0.24, 0.5, 0.24, TC.STEEL_DD, s * w * 0.36, -0.2, -0.02);
  });
  grp.add(mesh(g, litMat, { cast: true, receive: false }));
  if (bulbs) {
    const gg = geo(`roofSignBulbs|${w}|${h}`, (b) => {
      const n = Math.round(w / 0.45);
      for (let i = 0; i <= n; i++) {
        const x = -w / 2 - 0.02 + i * ((w + 0.04) / n);
        b.box(0.1, 0.1, 0.06, TC.LAMP, x, 0.2, 0.11); b.box(0.1, 0.1, 0.06, TC.LAMP, x, 0.25 + h + 0.0, 0.11);
      }
    });
    grp.add(mesh(gg, glowMat, { cast: false }));
  }
  const f = face(tex, w, h);
  f.position.set(0, 0.35 + h / 2, 0.105);
  grp.add(f);
  grp.rotation.x = tilt;
  return grp;
}
export const glassMat = new THREE.MeshLambertMaterial({ color: 0xbfe8f5, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
export const glassTintMat = new THREE.MeshLambertMaterial({ color: 0x9fd0e6, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
/** A transparent glass pane (box) in world/local coordinates. */
export function glassPane(w, h, d, x, y, z, mat = glassMat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.renderOrder = 3;
  return m;
}
/** Animate an object without an update() call: fn(timeSeconds) runs right before it renders (only when visible). */
export function onRender(obj, fn) {
  const target = obj.isMesh ? obj : (() => { let m = null; obj.traverse((o) => { if (!m && o.isMesh) m = o; }); return m; })();
  if (!target) return;
  let last = -1;
  target.onBeforeRender = () => {
    const t = performance.now() / 1000;
    if (t === last) return;
    last = t;
    fn(t);
  };
}
export const flat = (b, x0, x1, z0, z1, y, h, c) => b.box(x1 - x0, h, z1 - z0, c, (x0 + x1) / 2, y, (z0 + z1) / 2);
export function mixHex(a, b, k) { return new THREE.Color(a).lerp(new THREE.Color(b), k).getHex(); }

/** Floor texture tiles: 'epoxy' | 'marble' | 'wood' | 'carpet' | 'gravel' | 'paving' | 'darkstone' | 'checker'. */
export function floorTex(kind, repeat) {
  const t = canvasTex(`floor|${kind}`, 256, 256, (g, w, h) => {
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    if (kind === 'epoxy') {
      g.fillStyle = '#dfe3e6'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 400; k++) { g.fillStyle = ['rgba(155,143,212,0.25)', 'rgba(242,107,91,0.2)', 'rgba(42,157,143,0.2)', 'rgba(255,255,255,0.4)'][(rnd() * 4) | 0]; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
      g.fillStyle = 'rgba(90,100,110,0.25)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
    } else if (kind === 'marble') {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const dark = (i + j) % 2;
        g.fillStyle = dark ? '#2a2d34' : '#ece8e1'; g.fillRect(i * 128, j * 128, 128, 128);
        g.strokeStyle = dark ? 'rgba(217,165,33,0.35)' : 'rgba(150,140,130,0.35)'; g.lineWidth = 2;
        for (let k = 0; k < 3; k++) { g.beginPath(); let x = i * 128 + rnd() * 128, y = j * 128; g.moveTo(x, y); for (let q = 0; q < 5; q++) { x += (rnd() - 0.5) * 50; y += 26; g.lineTo(Math.max(i * 128, Math.min(i * 128 + 128, x)), y); } g.stroke(); }
      }
      g.fillStyle = 'rgba(217,165,33,0.9)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(0, 127, w, 2); g.fillRect(127, 0, 2, h);
    } else if (kind === 'darkstone') {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        g.fillStyle = `rgb(${52 + rnd() * 14},${54 + rnd() * 12},${62 + rnd() * 12})`; g.fillRect(i * 64, j * 64, 64, 64);
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(i * 64 + rnd() * 40, j * 64 + rnd() * 40, 20, 3);
      }
      g.fillStyle = 'rgba(217,165,33,0.55)'; for (let i = 0; i < 4; i++) { g.fillRect(i * 64, 0, 2, h); g.fillRect(0, i * 64, w, 2); }
    } else if (kind === 'wood') {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = `rgb(${176 + rnd() * 26},${124 + rnd() * 20},${82 + rnd() * 16})`; g.fillRect(0, i * 32, w, 32);
        g.fillStyle = 'rgba(80,45,20,0.45)'; g.fillRect(0, i * 32 + 30, w, 2);
        const j = rnd() * w; g.fillRect(j, i * 32, 2, 32);
        for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(90,55,30,0.15)'; g.fillRect(rnd() * w, i * 32 + 4 + rnd() * 24, 30 + rnd() * 60, 1.5); }
      }
    } else if (kind === 'carpet') {
      g.fillStyle = '#3f6f7a'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 900; k++) { g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)'; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
      g.strokeStyle = 'rgba(246,196,83,0.35)'; g.lineWidth = 3;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(i * 64 + 32, j * 64 + 32, 12, 0, 7); g.stroke(); }
    } else if (kind === 'gravel') {
      g.fillStyle = '#a89a86'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 1500; k++) { g.fillStyle = ['rgba(90,80,70,0.25)', 'rgba(255,255,255,0.18)', 'rgba(140,110,80,0.25)'][(rnd() * 3) | 0]; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 2); }
    } else if (kind === 'paving') {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) {
        const off = (j % 2) * 32;
        g.fillStyle = `rgb(${210 + rnd() * 16},${200 + rnd() * 14},${180 + rnd() * 14})`; g.fillRect(i * 64 + off - 64, j * 32, 64, 32); g.fillRect(i * 64 + off, j * 32, 64, 32);
        g.fillStyle = 'rgba(110,90,60,0.3)'; g.fillRect(i * 64 + off, j * 32, 2, 32); g.fillRect(0, j * 32, w, 2);
      }
    } else if (kind === 'checker') {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#2f4858' : '#f6ecd8'; g.fillRect(i * 64, j * 64, 64, 64); }
    } else {
      g.fillStyle = '#cccccc'; g.fillRect(0, 0, w, h);
    }
  });
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(repeat[0], repeat[1]);
  c.needsUpdate = true;
  return c;
}
/** Textured floor slab top (plane) over [minX,maxX] x [minZ,maxZ] at height y. tile = metres per texture repeat. */
export function floorPlane(minX, maxX, minZ, maxZ, y, kind, tile = 4) {
  const w = maxX - minX, d = maxZ - minZ;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: floorTex(kind, [w / tile, d / tile]) }));
  m.rotation.x = -R90; m.position.set((minX + maxX) / 2, y, (minZ + maxZ) / 2); m.receiveShadow = true;
  return m;
}

/** Hall shell like the garage: back + two side walls (inner faces on W.minZ / W.minX / W.maxX), front (maxZ) open.
 *  Wainscot + upper wall in alternating panels, trim lines, cap, two front pillars. */
export function hallShell(b, glow, W, o) {
  const T = W.thickness ?? 0.4, H = W.height ?? 2.6, seg = o.seg ?? 1.1;
  const hallD = W.maxZ - W.minZ, backLen = (W.maxX - W.minX) + 2 * T, cx = (W.minX + W.maxX) / 2;
  const wainH = o.wainH ?? 0.95;
  for (let i = 0, x = W.minX - T; x < W.maxX + T - 0.01; i++, x += seg) {
    const e = Math.min(x + seg, W.maxX + T), w = e - x;
    b.box(w, wainH, T, i % 2 ? o.wainB : o.wainA, (x + e) / 2, 0, W.minZ - T / 2);
    b.box(w, H - wainH, T, i % 2 ? o.wallB : o.wallA, (x + e) / 2, wainH, W.minZ - T / 2);
  }
  for (const sx of [-1, 1]) {
    if (o.skipSide === sx) continue;
    const x = sx < 0 ? W.minX - T / 2 : W.maxX + T / 2;
    for (let i = 0, z = W.minZ; z < W.maxZ - 0.01; i++, z += seg) {
      const e = Math.min(z + seg, W.maxZ), d = e - z;
      b.box(T, wainH, d, i % 2 ? o.wainB : o.wainA, x, 0, (z + e) / 2);
      b.box(T, H - wainH, d, i % 2 ? o.wallB : o.wallA, x, wainH, (z + e) / 2);
    }
  }
  b.box(backLen, 0.1, 0.05, o.trim, cx, wainH, W.minZ + 0.02);
  b.box(backLen, 0.12, T + 0.14, o.cap ?? o.trim, cx, H, W.minZ - T / 2 - 0.02);
  b.box(backLen, 0.06, 0.04, o.trim, cx, H - 0.2, W.minZ + 0.01);
  b.box(backLen, 0.12, 0.06, o.base ?? 0x1b2a36, cx, 0, W.minZ + 0.03);
  for (const sx of [-1, 1]) {
    if (o.skipSide === sx) continue;
    const xi = sx < 0 ? W.minX : W.maxX, xc = sx < 0 ? W.minX - T / 2 : W.maxX + T / 2;
    b.box(0.05, 0.1, hallD, o.trim, xi - sx * 0.02, wainH, (W.minZ + W.maxZ) / 2);
    b.box(T + 0.14, 0.12, hallD + T, o.cap ?? o.trim, xc + sx * 0.02, H, (W.minZ + W.maxZ) / 2 - T / 2);
    b.box(0.04, 0.06, hallD, o.trim, xi - sx * 0.01, H - 0.2, (W.minZ + W.maxZ) / 2);
    b.box(0.06, 0.12, hallD, o.base ?? 0x1b2a36, xi - sx * 0.03, 0, (W.minZ + W.maxZ) / 2);
  }
  if (o.pillars !== false) for (const sx of [-1, 1]) {
    const px = sx < 0 ? W.minX - T / 2 : W.maxX + T / 2, pz = W.maxZ - 0.15;
    const pw = o.pillarW ?? 0.8;
    b.box(pw, H + 0.3, pw, o.pillar ?? o.wallB, px, 0, pz);
    b.box(pw + 0.12, 0.12, pw + 0.12, o.cap ?? o.trim, px, H + 0.3, pz);
    b.box(pw + 0.02, 0.4, pw + 0.02, o.pillarBase ?? o.wainA, px, 0, pz);
    if (glow && o.pillarLamp !== false) glow.box(pw * 0.5, 0.16, pw * 0.5, TC.LAMP, px, H + 0.42, pz);
  }
}
/** Window on a wall face: frame + two-tone glow glass. Builder must be in the wall's frame (local +z into the room). */
export function wallWindow(b, glow, lx, y, w, h, frame = TC.CREAM) {
  b.box(w + 0.18, h + 0.18, 0.08, frame, lx, y - 0.09, 0.04);
  glow.box(w, h / 2, 0.05, TC.GLASS_L, lx, y + h / 2, 0.09);
  glow.box(w, h / 2, 0.05, TC.GLASS, lx, y, 0.09);
  b.box(0.06, h, 0.07, frame, lx, y, 0.1);
  b.box(w, 0.06, 0.07, frame, lx, y + h / 2 - 0.03, 0.1);
  b.box(w + 0.3, 0.06, 0.2, frame, lx, y - 0.14, 0.1);
}
export function plant(b, x, z, s = 1, pot = 0xc0714f, leaf = TC.LEAF) {
  b.cyl(0.2 * s, 0.16 * s, 0.4 * s, pot, x, 0, z, 8);
  b.cyl(0.21 * s, 0.21 * s, 0.05 * s, mixHex(pot, 0x000000, 0.2), x, 0.38 * s, z, 8);
  b.box(0.42 * s, 0.4 * s, 0.42 * s, leaf, x, 0.42 * s, z, 0, 0.4);
  b.box(0.3 * s, 0.35 * s, 0.3 * s, mixHex(leaf, 0xffffff, 0.15), x + 0.04 * s, 0.75 * s, z, 0, 0.9);
  b.box(0.16 * s, 0.25 * s, 0.16 * s, mixHex(leaf, 0xffffff, 0.25), x - 0.03 * s, 1.0 * s, z, 0, 0.2);
}
export function tireFlat(b, x, y, z, r, h) {
  b.cyl(r, r, h, TC.RUBBER, x, y, z, 12);
  b.cyl(r * 0.88, r * 0.88, h + 0.012, 0x3d4450, x, y - 0.006, z, 12);
  b.cyl(r * 0.55, r * 0.55, h + 0.02, TC.CHROME, x, y - 0.01, z, 10);
}
export function tireUp(b, x, y, z, r, w, ry = 0) {
  b.push(x, y, z, ry);
  b.cyl(r, r, w, TC.RUBBER, 0, -w / 2, 0, 12, R90);
  b.cyl(r * 0.88, r * 0.88, w + 0.012, 0x3d4450, 0, -(w + 0.012) / 2, 0, 12, R90);
  b.cyl(r * 0.55, r * 0.55, w + 0.024, TC.CHROME, 0, -(w + 0.024) / 2, 0, 10, R90);
  b.pop();
}
/** Simple voxel worker / figure (hard hat), for building sites. Returns { group, arm }. */
function workerFigure(vest = 0xf2813a) {
  const g = geo(`worker|${vest}`, (b) => {
    for (const x of [-0.09, 0.09]) b.box(0.13, 0.5, 0.16, 0x3d5a80, x, 0, 0);
    b.box(0.36, 0.42, 0.24, vest, 0, 0.5, 0);
    b.box(0.37, 0.05, 0.25, 0xe8f06a, 0, 0.64, 0);
    b.box(0.37, 0.05, 0.25, 0xe8f06a, 0, 0.78, 0);
    b.box(0.1, 0.36, 0.12, vest, -0.23, 0.55, 0);
    b.box(0.24, 0.24, 0.22, 0xe0ac7e, 0, 0.92, 0);
    b.box(0.3, 0.1, 0.28, TC.MUSTARD, 0, 1.13, 0);
    b.box(0.2, 0.08, 0.2, TC.MUSTARD, 0, 1.2, 0);
    b.box(0.32, 0.03, 0.06, TC.MUSTARD, 0, 1.13, 0.14);
  });
  const ag = geo('workerArm', (b) => {
    b.box(0.1, 0.36, 0.12, 0xf2813a, 0, -0.36, 0);
    b.box(0.04, 0.3, 0.04, TC.WOOD_D, 0, -0.4, 0.12, R90);
    b.box(0.14, 0.08, 0.08, TC.STEEL_DD, 0, -0.4, 0.27);
  });
  const group = new THREE.Group();
  group.add(mesh(g));
  const arm = new THREE.Group();
  arm.position.set(0.23, 0.9, 0);
  arm.add(mesh(ag));
  group.add(arm);
  return { group, arm };
}

// ---------------------------------------------------------------- for-sale sign
function saleTex() {
  return canvasTex('forsale', 512, 320, (g, w, h) => {
    g.fillStyle = css(TC.CREAM_L); g.fillRect(0, 0, w, h);
    g.fillStyle = css(TC.CORAL); g.fillRect(0, 0, w, 120);
    g.fillStyle = css(TC.CREAM_L); g.font = `700 80px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('FOR SALE', w / 2, 66, w - 40);
    // little house + key
    g.fillStyle = css(TC.NAVY);
    g.beginPath(); g.moveTo(80, 230); g.lineTo(150, 170); g.lineTo(220, 230); g.closePath(); g.fill();
    g.fillRect(96, 228, 108, 70);
    g.fillStyle = css(TC.MUSTARD); g.fillRect(138, 252, 26, 46);
    g.fillStyle = css(TC.TEAL); g.beginPath(); g.arc(330, 230, 34, 0, 7); g.fill();
    g.fillStyle = css(TC.CREAM_L); g.beginPath(); g.arc(330, 230, 13, 0, 7); g.fill();
    g.fillStyle = css(TC.TEAL); g.fillRect(360, 222, 110, 18); g.fillRect(430, 238, 14, 24); g.fillRect(454, 238, 14, 18);
    g.strokeStyle = css(TC.NAVY); g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  });
}
function plateTex(kind, level) {
  return canvasTex(`plate|${kind}|${level}`, 256, 128, (g, w, h) => {
    g.fillStyle = css(kind === 'locked' ? TC.NAVY : TC.TEAL); g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (kind === 'locked') {
      g.fillStyle = css(TC.MUSTARD);
      g.save(); g.translate(78, 64); g.beginPath();
      for (let i = 0; i < 10; i++) { const a = i * PI / 5 - PI / 2, r = i % 2 ? 20 : 46; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill(); g.restore();
      g.fillStyle = css(TC.CREAM_L); g.font = `700 70px ${FONT}`;
      g.fillText(level ? String(level) : '?', 172, 68);
    } else {
      g.fillStyle = css(TC.CREAM_L); g.font = `700 54px ${FONT}`; g.fillText('BUY', w / 2, 68);
    }
  });
}
export function createForSaleSign() {
  const g = geo('saleSign', (b) => {
    for (const x of [-0.72, 0.72]) {
      b.box(0.11, 1.95, 0.11, TC.WOOD_D, x, 0, 0);
      b.box(0.16, 0.06, 0.16, TC.WOOD, x, 1.95, 0);
      b.box(0.22, 0.1, 0.22, TC.STEEL_DD, x, 0, 0);
    }
    b.box(1.66, 1.04, 0.07, TC.NAVY, 0, 0.82, 0.07);               // board back (in front of the posts)
    b.box(1.56, 0.07, 0.07, TC.WOOD_D, 0, 0.62, 0.07);              // arm for the hanging plate
    for (const x of [-0.42, 0.42]) b.box(0.02, 0.18, 0.02, TC.STEEL_DD, x, 0.44, 0.09);
  });
  const group = solidGroup(g);
  const board = face(saleTex(), 1.56, 0.96, { lit: true });
  board.position.set(0, 1.34, 0.108);
  group.add(board);
  // locked overlay: chains crossing the board + padlock
  const lockG = geo('saleLock', (b) => {
    for (const s of [-1, 1]) for (let i = 0; i < 12; i++) {
      const k = (i + 0.5) / 12, x = -0.78 + k * 1.56, y = 0.92 + (s > 0 ? k : 1 - k) * 0.84;
      b.box(0.13, 0.05, 0.03, i % 2 ? TC.STEEL : TC.STEEL_D, x, y, 0.13, 0, 0, s * 0.5);
    }
    b.box(0.32, 0.28, 0.12, TC.MUSTARD, 0, 1.1, 0.17);
    b.box(0.33, 0.04, 0.13, TC.MUSTARD_D, 0, 1.36, 0.17);
    for (const x of [-0.1, 0.1]) b.box(0.05, 0.18, 0.06, TC.STEEL, x, 1.38, 0.17);
    b.box(0.25, 0.05, 0.06, TC.STEEL, 0, 1.53, 0.17);
    b.cyl(0.035, 0.035, 0.02, TC.DARK, 0, 1.22, 0.23, 8, R90);
    b.box(0.03, 0.07, 0.02, TC.DARK, 0, 1.15, 0.24);
  });
  const lock = mesh(lockG);
  lock.visible = false;
  group.add(lock);
  const plate = new THREE.Group();
  plate.position.set(0, 0.6, 0.09);
  const plateFace = face(plateTex('sale', 0), 0.84, 0.42, { lit: true });
  plateFace.position.set(0, -0.36, 0.022);
  plate.add(mesh(geo('salePlate', (b) => b.box(0.9, 0.48, 0.04, TC.WOOD, 0, -0.6, 0))), plateFace);
  group.add(plate);
  let state = 'sale', t = Math.random() * 5;
  function setState(s, fame = 0) {
    state = s === 'locked' ? 'locked' : 'sale';
    lock.visible = state === 'locked';
    plateFace.material = faceMat(plateTex(state, fame), { lit: true });
  }
  function update(dt = 0.016) {
    t += dt;
    plate.rotation.x = Math.sin(t * 1.7) * 0.06;
  }
  setState('sale');
  return { group, setState, update };
}

// ---------------------------------------------------------------- construction site (any footprint 3x6 .. 26x23)
const dustMat = new THREE.MeshLambertMaterial({ color: 0xe0d2b8, transparent: true, opacity: 0.42, depthWrite: false, flatShading: true });
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const puffGeo = new THREE.IcosahedronGeometry(0.5, 0);
export function createConstructionSite(w = 6, d = 6) {
  w = Math.max(2.5, w); d = Math.max(2.5, d);
  const key = `${w.toFixed(1)}x${d.toFixed(1)}`;
  const ix = w / 2 - 0.75, iz = d / 2 - 0.75;                  // scaffold line
  const bx = Math.max(0.5, ix - 0.6), bz = Math.max(0.5, iz - 0.6);   // building core half extents
  const big = w * d > 110;
  const ground = geo(`site|ground|${key}`, (b) => {
    b.box(w, 0.04, d, 0xa58c6c, 0, 0, 0);
    let s = Math.round(w * 13 + d * 7);
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < Math.round(w * d / 6); i++) b.box(0.4 + rnd() * 1.2, 0.012, 0.3 + rnd(), rnd() > 0.5 ? 0x8f7758 : 0xbba184, (rnd() - 0.5) * (w - 1.5), 0.04, (rnd() - 0.5) * (d - 1.5), 0, rnd() * 3);
    // tyre tracks into the site
    for (const x of [-0.55, 0.55]) b.box(0.28, 0.01, d * 0.45, 0x7d6649, x, 0.04, d * 0.27);
    // fence: tall mesh panels on the north, west and east, low orange barrier along the open south side
    const panel = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
      b.push((x0 + x1) / 2, 0, (z0 + z1) / 2, -ang);
      const n = Math.max(1, Math.round(len / 2.4));
      for (let i = 0; i < n; i++) {
        const cx = -len / 2 + (i + 0.5) * (len / n), pw = len / n - 0.06;
        b.box(0.34, 0.12, 0.5, 0x8b8f96, cx - pw / 2, 0, 0);               // concrete foot
        b.box(0.05, 1.8, 0.05, TC.STEEL, cx - pw / 2, 0.1, 0);
        b.box(pw, 0.05, 0.05, TC.STEEL, cx, 1.85, 0); b.box(pw, 0.05, 0.05, TC.STEEL, cx, 0.12, 0);
        for (let k = 1; k < 8; k++) b.box(0.015, 1.72, 0.015, TC.STEEL_D, cx - pw / 2 + k * pw / 8, 0.15, 0);
        b.box(pw, 0.9, 0.02, 0x2f7d4f, cx, 0.75, -0.03);                   // green privacy net, lower half
      }
      b.pop();
    };
    panel(-w / 2 + 0.15, -d / 2 + 0.15, w / 2 - 0.15, -d / 2 + 0.15);
    panel(-w / 2 + 0.15, -d / 2 + 0.15, -w / 2 + 0.15, d / 2 - 0.15);
    panel(w / 2 - 0.15, -d / 2 + 0.15, w / 2 - 0.15, d / 2 - 0.15);
    // south: red / white plastic barriers with a gap for the site entrance
    const zS = d / 2 - 0.2;
    for (let x = -w / 2 + 0.2; x < w / 2 - 0.4; x += 1.25) {
      if (Math.abs(x + 0.6) < 1.3) continue;
      b.box(1.15, 0.12, 0.4, TC.RED, x + 0.6, 0, zS);
      b.box(1.15, 0.5, 0.18, (Math.round(x) & 1) ? TC.RED : TC.WHITE, x + 0.6, 0.12, zS);
      b.box(1.15, 0.12, 0.2, TC.RED, x + 0.6, 0.62, zS);
    }
    // building core: footing slab + corner columns already standing
    b.box(bx * 2 + 0.3, 0.2, bz * 2 + 0.3, TC.CONCRETE_D, 0, 0, -0.2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(0.3, 0.6, 0.3, TC.CONCRETE, sx * bx, 0.2, sz * bz - 0.2);
      for (let k = 0; k < 4; k++) b.box(0.03, 0.7, 0.03, 0x8a4a2a, sx * bx + (k % 2 - 0.5) * 0.14, 0.8, sz * bz - 0.2 + ((k >> 1) - 0.5) * 0.14);   // rebar
    }
    // materials: brick pallets, plank stack, cement mixer base, wheelbarrow
    const pallet = (x, z, c, h) => {
      b.box(1.0, 0.12, 0.8, TC.WOOD, x, 0, z);
      for (let r = 0; r < h; r++) for (let q = 0; q < 3; q++) b.box(0.94, 0.12, 0.24, (r + q) % 2 ? c : mixHex(c, 0x000000, 0.12), x, 0.12 + r * 0.13, z - 0.27 + q * 0.27);
      b.box(1.02, h * 0.13, 0.82, 0xdbe7ee, x, 0.12, z);                  // shrink wrap (drawn under the bricks)
    };
    const ex = w / 2 - 1.2, ez = d / 2 - 1.3;
    pallet(-ex + 0.2, ez - 0.2, TC.BRICK, 3);
    if (w > 5) pallet(-ex + 1.35, ez - 0.2, TC.BRICK, 2);
    if (w > 7) { for (let i = 0; i < 4; i++) b.box(2.4, 0.06, 0.2, i % 2 ? TC.WOOD_L : TC.WOOD, ex - 1.2, 0.1 + i * 0.07, ez - 0.4 + (i % 2) * 0.05); b.box(0.12, 0.1, 0.4, TC.WOOD_D, ex - 2.1, 0, ez - 0.35); b.box(0.12, 0.1, 0.4, TC.WOOD_D, ex - 0.3, 0, ez - 0.35); }
    // wheelbarrow
    const wx = w > 7 ? 0.3 : ex - 0.1, wz = ez - (w > 7 ? 0.2 : 1.6);
    b.push(wx, 0, wz, 0.5);
    b.cyl(0.14, 0.14, 0.06, TC.RUBBER, 0, 0.0, 0.42, 8, 0, 0, R90);
    b.box(0.5, 0.25, 0.6, TC.TEAL, 0, 0.18, 0.05); b.box(0.42, 0.04, 0.5, 0x9a9384, 0, 0.42, 0.05);
    for (const x of [-0.2, 0.2]) { b.box(0.04, 0.04, 0.6, TC.STEEL_DD, x, 0.25, -0.4); b.box(0.04, 0.22, 0.04, TC.STEEL_DD, x, 0, -0.1); }
    b.pop();
    // site sign on the north fence (camera-readable board is a separate face)
    b.box(0.08, 1.4, 0.08, TC.WOOD_D, -1.0, 0, -d / 2 + 0.45); b.box(0.08, 1.4, 0.08, TC.WOOD_D, 1.0, 0, -d / 2 + 0.45);
    // bigger sites: a skip full of rubble, a sand heap and a rebar bundle inside the core
    if (bx > 2.6 && bz > 2.6) {
      const kx = -bx + 1.3, kz = bz - 1.7;
      b.box(1.7, 0.12, 1.0, TC.STEEL_DD, kx, 0, kz);
      b.box(1.7, 0.66, 1.0, TC.MUSTARD, kx, 0.1, kz);
      b.box(1.74, 0.08, 1.04, TC.MUSTARD_D, kx, 0.72, kz);
      b.box(1.5, 0.05, 0.84, 0x6f6a62, kx, 0.72, kz);
      for (const [x, z, c, s] of [[-0.4, -0.15, TC.BRICK, 0.3], [0.1, 0.2, TC.CONCRETE, 0.36], [0.45, -0.1, TC.WOOD, 0.26], [-0.1, -0.2, TC.CONCRETE_D, 0.24]]) {
        b.box(s, s * 0.6, s * 0.8, c, kx + x, 0.74, kz + z, 0, x * 2, 0);
      }
      const sx = bx - 1.4, sz = bz - 1.7;
      b.cyl(0.06, 0.95, 0.5, 0xd9bf86, sx, 0, sz, 7);
      b.cyl(0.05, 0.55, 0.72, 0xe2c994, sx + 0.2, 0, sz - 0.1, 7);
      b.box(0.08, 0.7, 0.04, TC.WOOD_D, sx - 0.4, 0.3, sz + 0.3, 0.5, 0, 0.6);       // shovel stuck in it
      if (bx > 4.5) {
        for (const x of [-0.9, 0.9]) b.box(0.14, 0.1, 0.8, TC.WOOD_D, x, 0, bz - 1.5);
        for (let i = 0; i < 7; i++) b.box(2.6, 0.035, 0.035, i % 2 ? 0x8a4a2a : 0x7a4026, 0, 0.1 + (i > 3 ? 0.035 : 0), bz - 1.68 + (i % 4) * 0.08);
      }
    }
  });
  const group = new THREE.Group();
  group.add(mesh(ground, litMat, { cast: true, receive: true }));
  const sf = face(signTex('BUILDING SITE', { bg: TC.MUSTARD, fg: TC.NAVY, shadow: null, border: TC.NAVY, w: 512, h: 128, size: 0.5 }), Math.min(2.6, w - 1), Math.min(2.6, w - 1) / 4, { lit: true });
  sf.position.set(0, 1.4, -d / 2 + 0.52); sf.rotation.x = -0.15;
  group.add(sf);

  // rising walls (brick + concrete band), scaled with progress
  const rise = new THREE.Group();
  rise.position.z = -0.2;
  rise.add(mesh(geo(`site|walls|${key}`, (b) => {
    const H = 2.4, t = 0.22;
    const wall = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
      b.push((x0 + x1) / 2, 0.2, (z0 + z1) / 2, -ang);
      for (let r = 0; r < 8; r++) b.box(len, H / 8, t, r % 2 ? TC.BRICK : TC.BRICK_D, (r % 2) * 0.06, r * H / 8, 0);
      b.pop();
    };
    wall(-bx, -bz, bx, -bz); wall(-bx, -bz, -bx, bz); wall(bx, -bz, bx, bz);
    if (bx > 1.2) { wall(-bx, bz, -bx * 0.35, bz); wall(bx * 0.35, bz, bx, bz); } else wall(-bx, bz, bx, bz);
    b.box(bx * 2 + 0.3, 0.14, 0.3, TC.CONCRETE, 0, 2.6, -bz);
    // bigger cores: a grid of reinforced concrete columns with rebar starters (the frame going up inside)
    if (bx > 2.2 && bz > 2.2) {
      const nx = Math.max(2, Math.round(bx * 2 / 3.8)), nz = Math.max(2, Math.round(bz * 2 / 3.8));
      for (let i = 1; i < nx; i++) for (let j = 1; j < nz; j++) {
        const x = -bx + i * (2 * bx / nx), z = -bz + j * (2 * bz / nz);
        b.box(0.34, 0.12, 0.34, TC.CONCRETE_D, x, 0.2, z);
        b.box(0.28, 2.1, 0.28, TC.CONCRETE, x, 0.3, z);
        for (let k = 0; k < 4; k++) b.box(0.03, 0.5, 0.03, 0x8a4a2a, x + ((k & 1) - 0.5) * 0.16, 2.4, z + ((k >> 1) - 0.5) * 0.16);
      }
      // half-built partition wall
      b.push(-bx * 0.55, 0.2, -bz + bz / nz, 0);                          // between the first two column rows
      for (let r = 0; r < 5; r++) b.box(bx * 0.9 - r * 0.25, 0.3, 0.2, r % 2 ? TC.BRICK : TC.BRICK_D, -r * 0.12, r * 0.3, 0);
      b.pop();
    }
  }), litMat, { cast: true, receive: true }));
  group.add(rise);

  // scaffolding in three lifts that appear one after another (pipes, planks, toe boards, green netting)
  const lifts = [];
  for (let L = 0; L < 3; L++) {
    const m = mesh(geo(`site|scaf|${key}|${L}`, (b) => {
      const y0 = L * 1.05, h = 1.05;
      const sides = [[-ix, -iz, ix, -iz, -1], [-ix, -iz, -ix, iz, 1], [ix, -iz, ix, iz, 1]];
      for (const [x0, z0, x1, z1] of sides) {
        const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
        b.push((x0 + x1) / 2, 0, (z0 + z1) / 2, -ang);
        const n = Math.max(1, Math.round(len / 2));
        for (let i = 0; i <= n; i++) {
          const x = -len / 2 + i * (len / n);
          for (const z of [-0.25, 0.25]) b.box(0.05, h, 0.05, TC.STEEL, x, y0, z);
        }
        for (const z of [-0.25, 0.25]) b.box(len, 0.05, 0.05, TC.STEEL, 0, y0 + h - 0.05, z);
        b.box(len, 0.04, 0.5, TC.WOOD_L, 0, y0 + h - 0.08, 0);             // planks
        b.box(len, 0.15, 0.03, TC.MUSTARD, 0, y0 + h - 0.05, -0.27);       // toe board
        for (let i = 0; i < n; i++) b.box(Math.hypot(len / n, h) - 0.05, 0.035, 0.035, TC.STEEL_D, -len / 2 + (i + 0.5) * (len / n), y0 + h / 2, -0.26, 0, 0, (i % 2 ? 1 : -1) * Math.atan2(h, len / n));
        if (L > 0) b.box(len, h * 0.8, 0.02, 0x2f8a55, 0, y0 + 0.08, -0.32);   // netting on the outside
        b.pop();
      }
    }), litMat, { cast: true, receive: true });
    m.visible = false;
    group.add(m); lifts.push(m);
  }
  // cement mixer with a turning drum
  const mixer = new THREE.Group();
  mixer.position.set(w / 2 - 1.2, 0, -d / 2 + 1.3 + (d > 6 ? 0.4 : 0));
  if (w < 4.5) mixer.position.set(0, 0, d / 2 - 1.0);
  mixer.add(mesh(geo('site|mixerBase', (b) => {
    b.box(0.08, 0.5, 0.6, TC.STEEL_DD, -0.25, 0, 0); b.box(0.08, 0.5, 0.6, TC.STEEL_DD, 0.25, 0, 0);
    b.cyl(0.14, 0.14, 0.06, TC.RUBBER, -0.32, 0.0, 0.25, 8, 0, 0, R90);
    b.box(0.3, 0.3, 0.3, TC.CORAL, 0, 0.3, -0.35);
  })));
  const drum = new THREE.Group();
  drum.position.set(0, 0.75, 0.05); drum.rotation.x = -0.6;
  drum.add(mesh(geo('site|drum', (b) => {
    b.cyl(0.3, 0.38, 0.4, TC.CORAL, 0, -0.2, 0, 10);
    b.cyl(0.16, 0.3, 0.25, TC.CORAL_D, 0, 0.2, 0, 10);
    b.cyl(0.39, 0.39, 0.06, TC.MUSTARD, 0, -0.05, 0, 10);
  })));
  mixer.add(drum);
  group.add(mixer);
  // tower crane on big sites, slewing slowly
  let jib = null;
  if (big) {
    const cx = -w / 2 + 1.4, cz = -d / 2 + 1.4, H = 7.5;
    group.add(mesh(geo(`site|crane|${H}`, (b) => {
      b.box(1.2, 0.3, 1.2, TC.CONCRETE_D, cx, 0, cz);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.07, H, 0.07, TC.MUSTARD, cx + sx * 0.3, 0.3, cz + sz * 0.3);
      for (let y = 0.3; y < H; y += 0.6) {
        b.box(0.66, 0.05, 0.05, TC.MUSTARD_D, cx, y, cz - 0.3); b.box(0.66, 0.05, 0.05, TC.MUSTARD_D, cx, y, cz + 0.3);
        b.box(0.05, 0.05, 0.66, TC.MUSTARD_D, cx - 0.3, y, cz); b.box(0.05, 0.05, 0.66, TC.MUSTARD_D, cx + 0.3, y, cz);
        b.box(0.05, 0.75, 0.05, TC.MUSTARD_D, cx, y + 0.02, cz - 0.3, 0, 0, 0.8);
      }
    }), litMat, { cast: true, receive: false }));
    jib = new THREE.Group();
    jib.position.set(cx, H + 0.3, cz);
    jib.add(mesh(geo('site|jib', (b) => {
      b.box(0.8, 0.5, 0.8, TC.MUSTARD, 0, 0, 0);
      b.box(0.5, 0.4, 0.5, TC.CREAM, 0.3, 0.1, 0.3);                       // cab
      b.box(0.4, 0.2, 0.05, TC.GLASS, 0.3, 0.2, 0.56);
      b.box(7.0, 0.3, 0.3, TC.MUSTARD, 3.3, 0.45, 0);                      // jib
      for (let x = 0.2; x < 6.8; x += 0.5) b.box(0.04, 0.3, 0.32, TC.MUSTARD_D, x, 0.45, 0, 0, 0, 0.6);
      b.box(2.4, 0.3, 0.3, TC.MUSTARD, -1.4, 0.45, 0);                     // counter jib
      b.box(0.8, 0.6, 0.6, TC.CONCRETE_D, -2.2, 0.1, 0);                   // counterweight
      b.box(0.15, 1.3, 0.15, TC.MUSTARD, 0, 0.5, 0);                       // apex
      b.box(5.0, 0.03, 0.03, TC.STEEL_DD, 2.4, 1.3, 0, 0, 0, -0.22);
      b.box(0.03, 2.6, 0.03, TC.STEEL_DD, 4.6, -2.1, 0);                   // hook cable
      b.box(0.2, 0.15, 0.2, TC.CORAL, 4.6, -2.2, 0);
      for (let i = 0; i < 3; i++) b.box(0.9, 0.12, 0.25, TC.WOOD_L, 4.6, -2.65 + i * 0.12, 0);   // load of planks
    }), litMat, { cast: true, receive: false }));
    group.add(jib);
  }
  // workers hammering on the scaffold / site
  const workers = [];
  const nW = big ? 3 : w * d > 30 ? 2 : 1;
  const spots = [[-ix + 0.6, -iz, 0], [ix, -iz + 1.0, -R90], [-ix, 0.2, R90]];
  for (let i = 0; i < nW; i++) {
    const wk = workerFigure([0xf2813a, 0xf6c453, 0xf2813a][i]);
    const [x, z, ry] = spots[i];
    wk.group.position.set(x, 0, z);
    wk.group.rotation.y = ry + PI;     // face the wall they build
    group.add(wk.group);
    workers.push({ ...wk, ph: i * 0.37, level: i === 0 ? 1 : 0 });
  }
  // dust puffs: soft low-poly clouds that rise from the foot of the walls being built and fade
  const puffs = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(puffGeo, dustMat);
    m.visible = false;
    m.castShadow = false;
    group.add(m);
    puffs.push({ m, t: -Math.random() * 2, x: 0, z: 0 });
  }
  let prog = 0, t = 0;
  function setProgress(p) {
    prog = Math.max(0, Math.min(1, p || 0));
    rise.scale.y = 0.08 + prog * 0.92;
    lifts.forEach((m, i) => { m.visible = prog >= i * 0.3; });
    for (const wk of workers) wk.group.position.y = wk.level ? Math.min(2, Math.floor(prog * 3)) * 1.05 * (prog > 0.3 ? 1 : 0) : 0;
  }
  function update(dt = 0.016) {
    t += dt;
    drum.rotation.y += dt * 3;
    if (jib) jib.rotation.y = Math.sin(t * 0.35) * 0.9;
    for (const wk of workers) {
      const k = (t * 2.6 + wk.ph) % 1;
      wk.arm.rotation.x = k < 0.25 ? -2.0 + k * 6 : -0.5 - (k - 0.25) * 2;
    }
    for (const p of puffs) {
      p.t += dt;
      if (p.t > 1.6) {
        p.t = -Math.random() * 0.9;
        // somewhere along the walls (north, west, east), where the bricklaying happens
        const side = (Math.random() * 3) | 0, u = Math.random() * 2 - 1;
        if (side === 0) { p.x = u * bx; p.z = -bz - 0.2 + 0.3; }
        else { p.x = (side === 1 ? -bx : bx) + (side === 1 ? 0.3 : -0.3); p.z = u * bz - 0.2; }
      }
      const k = p.t / 1.6;
      p.m.visible = k > 0;
      if (k > 0) {
        const s = 0.18 + Math.sin(Math.min(1, k * 1.3) * PI * 0.5) * 0.42 * (1 - k * 0.5);
        p.m.scale.set(s, s * 0.75, s);
        p.m.position.set(p.x + k * 0.35, 0.15 + k * 0.9 * (0.3 + prog), p.z);
        p.m.rotation.y = k * 2;
      }
    }
  }
  setProgress(0);
  update(0);
  return { group, setProgress, update };
}

// ---------------------------------------------------------------- hoarding panel (3 m), Main Street gate
function hoardTex(v) {
  return canvasTex(`hoard|${v}`, 512, 384, (g, w, h) => {
    g.fillStyle = css(TC.NAVY); g.fillRect(0, 0, w, h);
    for (let i = -2; i < 12; i++) { g.fillStyle = i % 2 ? css(TC.MUSTARD) : css(TC.NAVY_D); g.beginPath(); g.moveTo(i * 50, 0); g.lineTo(i * 50 + 25, 0); g.lineTo(i * 50 + 5, 34); g.lineTo(i * 50 - 20, 34); g.fill(); }
    g.fillStyle = css(TC.CORAL); g.fillRect(0, h - 40, w, 40);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (v === 0) {
      g.fillStyle = css(TC.CREAM_L); g.font = `700 76px ${FONT}`; g.fillText('MAIN STREET', w / 2, 140);
      g.fillStyle = css(TC.MUSTARD); g.font = `700 56px ${FONT}`; g.fillText('COMING SOON', w / 2, 230);
    } else if (v === 1) {
      // skyline mural: little shop fronts
      const shops = [[40, 120, TC.CORAL], [150, 90, TC.TEAL], [250, 140, TC.MUSTARD], [370, 110, TC.CREAM]];
      for (const [x, hh, c] of shops) {
        g.fillStyle = css(c); g.fillRect(x, 330 - hh - 60, 100, hh + 60);
        g.fillStyle = css(TC.NAVY_D); g.fillRect(x + 15, 330 - hh - 40, 30, 30); g.fillRect(x + 55, 330 - hh - 40, 30, 30); g.fillRect(x + 35, 280, 30, 50);
      }
      g.fillStyle = css(TC.CREAM_L); g.font = `700 46px ${FONT}`; g.fillText('SHOPS • DINER • PARTS', w / 2, 92);
    } else {
      g.fillStyle = css(TC.CREAM_L); g.font = `700 60px ${FONT}`; g.fillText('PARDON OUR', w / 2, 130); g.fillText('DUST!', w / 2, 200);
      g.fillStyle = css(TC.MUSTARD); g.beginPath(); g.moveTo(170, 280); g.lineTo(320, 280); g.lineTo(320, 255); g.lineTo(370, 295); g.lineTo(320, 335); g.lineTo(320, 310); g.lineTo(170, 310); g.fill();
    }
  });
}
let hoardN = 0;
export function createHoardingPanel() {
  const g = geo('hoarding', (b) => {
    b.box(3.0, 2.2, 0.06, TC.WOOD_L, 0, 0.05, -0.03);
    for (const x of [-1.45, 1.45]) {
      b.box(0.1, 2.3, 0.1, TC.WOOD_D, x, 0, -0.1);
      b.box(0.08, 0.08, 1.2, TC.WOOD_D, x, 0.05, -0.65);                   // foot
      b.box(0.08, 1.6, 0.08, TC.WOOD_D, x, 0.1, -0.55, -0.55);             // brace
      b.box(0.5, 0.18, 0.4, 0x8b8f96, x, 0, -1.05);                        // sandbag block
    }
    b.box(3.0, 0.08, 0.1, TC.WOOD_D, 0, 2.25, -0.06);
  });
  const group = solidGroup(g);
  const f = face(hoardTex(hoardN++ % 3), 2.92, 2.12, { lit: true });
  f.position.set(0, 1.15, 0.002);
  group.add(f);
  return group;
}

// ---------------------------------------------------------------- boom gate (origin = road centre, boom spans x)
const lampRed = new THREE.MeshBasicMaterial({ color: 0xff4a3a });
const lampGreen = new THREE.MeshBasicMaterial({ color: 0x6dff8a });
export function createBoomGate() {
  const g = geo('boomHousing', (b) => {
    b.box(0.7, 0.1, 0.7, TC.CONCRETE_D, -2.5, 0, 0);
    b.box(0.5, 1.05, 0.5, TC.CREAM, -2.5, 0.1, 0);
    b.box(0.54, 0.08, 0.54, TC.NAVY, -2.5, 1.15, 0);
    for (let i = 0; i < 3; i++) b.box(0.52, 0.1, 0.52, TC.CORAL, -2.5, 0.25 + i * 0.25, 0);
    b.box(0.3, 0.3, 0.3, TC.NAVY, -2.3, 0.85, 0);                          // pivot hub
    // rest fork on the far side
    b.box(0.4, 0.08, 0.4, TC.CONCRETE_D, 2.45, 0, 0);
    b.box(0.08, 0.9, 0.08, TC.STEEL_D, 2.45, 0.08, 0);
    b.box(0.08, 0.16, 0.2, TC.STEEL_D, 2.45, 0.92, 0);
  });
  const group = solidGroup(g);
  const boom = new THREE.Group();
  boom.position.set(-2.3, 1.0, 0.0);
  boom.add(mesh(geo('boomArm', (b) => {
    const L = 4.85, n = 9;
    for (let i = 0; i < n; i++) b.box(L / n, 0.12, 0.1, i % 2 ? TC.RED : TC.WHITE, 0.15 + (i + 0.5) * (L / n), -0.06, 0.18);
    b.box(0.5, 0.16, 0.14, TC.STEEL_DD, -0.3, -0.08, 0.18);                 // counterweight
  })));
  group.add(boom);
  const lamp = new THREE.Mesh(unitBox, lampRed);
  lamp.scale.set(0.14, 0.12, 0.14);
  lamp.position.set(-2.5, 1.3, 0);
  group.add(lamp);
  function setOpen(k) {
    const v = Math.max(0, Math.min(1, k || 0));
    boom.rotation.z = v * (R90 - 0.06);
    lamp.material = v > 0.95 ? lampGreen : lampRed;
  }
  setOpen(0);
  return { group, setOpen };
}

// ---------------------------------------------------------------- chain barrier (posts + sagging chain along x)
export function createChainBarrier(len = 4) {
  len = Math.max(1, len);
  const n = Math.max(1, Math.round(len / 2.4));
  const post = geo(`chainPosts|${len.toFixed(2)}`, (b) => {
    for (let i = 0; i <= n; i++) {
      const x = -len / 2 + i * (len / n);
      b.cyl(0.18, 0.2, 0.08, TC.RUBBER, x, 0, 0, 8);
      for (let k = 0; k < 4; k++) b.box(0.1, 0.2, 0.1, k % 2 ? TC.WHITE : TC.RED, x, 0.08 + k * 0.2, 0);
      b.cyl(0.07, 0.07, 0.06, TC.RED, x, 0.88, 0, 8);
    }
  });
  const mkChain = (sag) => geo(`chain|${len.toFixed(2)}|${sag}`, (b) => {
    for (let i = 0; i < n; i++) {
      const x0 = -len / 2 + i * (len / n), span = len / n, m = Math.max(3, Math.round(span / 0.11));
      for (let k = 0; k < m; k++) {
        const u = (k + 0.5) / m, x = x0 + u * span;
        const y = 0.78 - sag * 4 * u * (1 - u);
        const y2 = 0.78 - sag * 4 * (u + 0.01) * (1 - u - 0.01);
        b.box(span / m + 0.02, 0.04, k % 2 ? 0.02 : 0.05, k % 2 ? TC.RED : 0xe8e0d0, x, Math.max(0.01, y) - 0.02, 0, 0, 0, Math.atan2(y2 - y, span * 0.01));
      }
    }
  });
  const group = new THREE.Group();
  group.add(mesh(post));
  const chain = mesh(mkChain(0.2));
  group.add(chain);
  const down = mesh(mkChain(0.78));
  down.visible = false;
  group.add(down);
  // Not in the contract: gameplay may call group.userData.setDown(true) to drop the chain onto the ground.
  group.userData.setDown = (on) => { chain.visible = !on; down.visible = !!on; };
  return group;
}

// ---------------------------------------------------------------- parking bay (2.0 x 3.6 along the vehicle, nose +z)
export function createParkingBay() {
  const g = geo('parkingBay', (b) => {
    b.box(2.0, 0.012, 3.6, 0x4f86c6, 0, 0.012, 0);
    const L = 0xf4f1ea, t = 0.09;
    b.box(t, 0.014, 3.6, L, -1.0 + t / 2, 0.016, 0); b.box(t, 0.014, 3.6, L, 1.0 - t / 2, 0.016, 0);
    b.box(2.0, 0.014, t, L, 0, 0.016, -1.8 + t / 2);
    // big painted P (readable from the camera; top of the letter towards -z)
    b.box(0.18, 0.016, 1.3, L, -0.24, 0.018, 0.2);
    b.box(0.6, 0.016, 0.18, L, 0.0, 0.018, -0.36);
    b.box(0.6, 0.016, 0.18, L, 0.0, 0.018, 0.22);
    b.box(0.18, 0.016, 0.58, L, 0.3, 0.018, -0.07);
    // no sign post: bays sit against buildings / in kept-clear aprons; the painted P reads from the camera
  });
  return solidGroup(g, { cast: true, receive: true });
}

// ---------------------------------------------------------------- drop ring (tow drop-off, r 1.5)
export function createDropRing() {
  const g = geo('dropRing', (b) => {
    const r = 1.5, n = 20;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      b.box(0.36, 0.014, 0.16, i % 2 ? TC.MUSTARD : 0x2b3640, Math.cos(a) * r, 0.014, Math.sin(a) * r, 0, -a + R90);
    }
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * PI * 2;
      b.box(0.17, 0.012, 0.05, 0xf4f1ea, Math.cos(a) * (r - 0.3), 0.014, Math.sin(a) * (r - 0.3), 0, -a + R90);
    }
  });
  const group = solidGroup(g, { cast: false, receive: true });
  const tex = canvasTex('dropHook', 256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = css(TC.MUSTARD); c.fillStyle = css(TC.MUSTARD); c.lineCap = 'round'; c.lineWidth = 22;
    c.beginPath(); c.arc(128, 46, 20, 0, 7); c.stroke();                         // eye
    c.beginPath(); c.moveTo(128, 68); c.lineTo(128, 130); c.stroke();             // shank
    c.beginPath(); c.arc(104, 130, 24, 0, PI * 0.95); c.stroke();                 // hook bend
    c.beginPath(); c.moveTo(80, 132); c.lineTo(80, 112); c.stroke();
    c.font = `700 46px ${FONT}`; c.textAlign = 'center'; c.fillStyle = css(0xf4f1ea); c.fillText('TOW DROP', 128, 220);
  });
  const d = decal(tex, 1.9, 1.9, 0.022);
  group.add(d);
  return group;
}

// ---------------------------------------------------------------- golden wrench (collectible)
const goldMat = new THREE.MeshLambertMaterial({ color: 0xf3c64e, emissive: 0x7a5200, flatShading: true });
const glintMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
const haloMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.35, depthWrite: false });
export function createGoldenWrench() {
  const wg = memo(geoCache, 'goldWrench', () => {
    const b = new Builder();
    b.box(0.16, 0.62, 0.09, 0xffffff, 0, -0.34, 0);
    // open-end head (a C shape)
    b.box(0.42, 0.15, 0.09, 0xffffff, 0, -0.02, 0);
    b.box(0.13, 0.26, 0.09, 0xffffff, -0.145, 0.1, 0);
    b.box(0.13, 0.26, 0.09, 0xffffff, 0.145, 0.1, 0);
    // ring end
    for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; b.box(0.09, 0.07, 0.09, 0xffffff, Math.cos(a) * 0.14, -0.74 + Math.sin(a) * 0.14, 0, 0, 0, a + R90); }
    return b.build();
  });
  const group = new THREE.Group();
  const spin = new THREE.Group();
  spin.position.y = 0.75;
  const w = new THREE.Mesh(wg, goldMat);
  w.castShadow = true;
  w.rotation.z = 0.6;
  w.position.y = 0.3;
  spin.add(w);
  group.add(spin);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), haloMat);
  halo.rotation.x = -R90; halo.position.y = 0.025;
  group.add(halo);
  const glints = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group();
    s.add(new THREE.Mesh(unitBox, glintMat), new THREE.Mesh(unitBox, glintMat));
    s.children[0].scale.set(0.16, 0.035, 0.035); s.children[1].scale.set(0.035, 0.16, 0.035);
    group.add(s); glints.push(s);
  }
  let t = Math.random() * 6;
  function update(dt = 0.016) {
    t += dt;
    spin.rotation.y += dt * 1.6;
    spin.position.y = 0.8 + Math.sin(t * 2.2) * 0.1;
    halo.scale.setScalar(1 + Math.sin(t * 2.2) * 0.08);
    glints.forEach((s, i) => {
      const a = t * 1.3 + i * 2.1, k = (t * 0.9 + i * 0.33) % 1;
      s.position.set(Math.cos(a) * 0.38, 0.55 + i * 0.22, Math.sin(a) * 0.38);
      s.scale.setScalar(Math.sin(k * PI) + 0.01);
      s.rotation.z = t;
    });
  }
  update(0);
  return { group, update };
}

// ---------------------------------------------------------------- tip tray, coin stack, safe
/** Standing tip tray (brass tray on a small wooden pedestal). Tips stack on group.userData.anchor (y 0.86). */
export function createTipTray() {
  const g = geo('tipTray', (b) => {
    b.box(0.5, 0.06, 0.4, TC.WOOD_D, 0, 0, 0);
    b.box(0.36, 0.72, 0.28, TC.WOOD, 0, 0.06, 0);
    b.box(0.4, 0.04, 0.32, TC.WOOD_D, 0, 0.5, 0);
    b.box(0.62, 0.05, 0.48, TC.WOOD_D, 0, 0.78, 0);
    b.box(0.6, 0.04, 0.46, TC.GOLD, 0, 0.83, 0);                           // brass tray
    for (const s of [-1, 1]) { b.box(0.6, 0.05, 0.03, TC.GOLD_L, 0, 0.85, s * 0.225); b.box(0.03, 0.05, 0.46, TC.GOLD_L, s * 0.29, 0.85, 0); }
    b.cyl(0.08, 0.08, 0.2, 0xd8eef5, 0.2, 0.86, -0.13, 10);                 // tip jar
    b.cyl(0.07, 0.07, 0.06, TC.GOLD, 0.2, 0.87, -0.13, 8);
    b.box(0.26, 0.14, 0.02, TC.CREAM, -0.12, 0.88, -0.2, -0.3);            // "TIPS" card
    b.box(0.18, 0.04, 0.025, TC.CORAL, -0.12, 0.93, -0.19, -0.3);
  });
  const group = solidGroup(g);
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 0.86, 0.04);
  group.add(anchor);
  group.userData.anchor = anchor;
  return group;
}
/** One stack of gold coins; stacks like a cash bundle (height 0.09). */
export function createCoinStack() {
  const g = geo('coinStack', (b) => {
    const cols = [[-0.09, -0.05, 4], [0.08, -0.06, 3], [0.0, 0.08, 4], [-0.12, 0.09, 2]];
    for (const [x, z, n] of cols) for (let i = 0; i < n; i++) {
      b.cyl(0.075, 0.075, 0.02, i % 2 ? TC.GOLD : TC.GOLD_L, x + (i % 2) * 0.006, i * 0.022, z, 10);
    }
    b.cyl(0.03, 0.03, 0.004, TC.GOLD_D, 0.0, 0.088, 0.08, 6);
  });
  return mesh(g);
}
export function createSafe() {
  const g = geo('safe', (b) => {
    const S = 0x3f5a52, SD = 0x2c403a;
    b.box(0.95, 0.1, 0.8, TC.DARK, 0, 0, 0);
    b.box(0.85, 1.0, 0.72, S, 0, 0.1, 0);
    b.box(0.87, 0.06, 0.74, SD, 0, 1.08, 0);
    b.box(0.7, 0.82, 0.04, SD, 0, 0.19, 0.37);                             // door
    b.box(0.66, 0.78, 0.02, S, 0, 0.21, 0.395);
    for (const y of [0.32, 0.86]) b.box(0.05, 0.14, 0.06, TC.STEEL, -0.37, y, 0.37);   // hinges
    b.cyl(0.11, 0.11, 0.04, TC.CHROME, 0.06, 0.66, 0.41, 14, R90);           // dial
    b.cyl(0.05, 0.05, 0.05, TC.DARK, 0.06, 0.66, 0.43, 8, R90);
    b.box(0.02, 0.05, 0.02, TC.CORAL, 0.06, 0.75, 0.43);
    for (let i = 0; i < 3; i++) b.box(0.03, 0.18, 0.03, TC.CHROME, 0.2, 0.42, 0.43, 0, 0, i * PI / 3);   // spoke handle
    b.cyl(0.04, 0.04, 0.05, TC.GOLD, 0.2, 0.42, 0.43, 8, R90);
    b.box(0.3, 0.06, 0.02, TC.GOLD, 0, 0.98, 0.39);                          // brass name plate
  });
  const group = solidGroup(g);
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 1.14, 0);
  group.add(anchor);
  group.userData.anchor = anchor;
  return group;
}

// ---------------------------------------------------------------- crew table (lunch break table + two benches)
/** Break table 1.2 x 0.7 with a bench on each long side. Seats: group.userData.seats (local, sitting, facing the table). */
export function createCrewTable() {
  const g = geo('crewTable', (b) => {
    b.box(1.2, 0.05, 0.7, TC.WOOD_L, 0, 0.72, 0);
    b.box(1.22, 0.03, 0.72, TC.WOOD_D, 0, 0.69, 0);
    for (const sx of [-1, 1]) { b.box(0.06, 0.69, 0.06, TC.STEEL_DD, sx * 0.52, 0, -0.27); b.box(0.06, 0.69, 0.06, TC.STEEL_DD, sx * 0.52, 0, 0.27); }
    for (const sz of [-1, 1]) {
      b.box(1.2, 0.05, 0.3, TC.TEAL, 0, 0.42, sz * 0.62);
      for (const sx of [-1, 1]) b.box(0.05, 0.42, 0.24, TC.STEEL_DD, sx * 0.5, 0, sz * 0.62);
    }
    // lunch things: thermos, mugs, radio, an open lunch tin
    b.cyl(0.06, 0.06, 0.26, TC.CORAL, -0.42, 0.77, -0.15, 8);
    b.cyl(0.065, 0.065, 0.04, TC.STEEL, -0.42, 1.03, -0.15, 8);
    for (const [x, z, c] of [[-0.18, 0.18, TC.CREAM], [0.2, -0.2, TC.MUSTARD], [0.36, 0.16, TC.CREAM]]) b.cyl(0.05, 0.045, 0.1, c, x, 0.77, z, 8);
    b.box(0.3, 0.16, 0.12, TC.NAVY, 0.3, 0.77, -0.24); b.box(0.12, 0.12, 0.02, TC.STEEL_D, 0.24, 0.79, -0.18); b.box(0.02, 0.22, 0.02, TC.STEEL, 0.42, 0.93, -0.24);
    b.box(0.3, 0.07, 0.2, TC.TEAL, 0.0, 0.77, 0.02); b.box(0.3, 0.12, 0.02, TC.TEAL, 0.0, 0.84, -0.09, -0.6);
    b.box(0.12, 0.03, 0.08, 0xe3b26a, -0.05, 0.84, 0.04);
  });
  const group = solidGroup(g);
  group.userData.seats = [
    { x: -0.3, z: 0.62, yaw: PI }, { x: 0.3, z: 0.62, yaw: PI },
    { x: -0.3, z: -0.62, yaw: 0 }, { x: 0.3, z: -0.62, yaw: 0 },
  ];
  return group;
}

// ---------------------------------------------------------------- bus stop (glass shelter, faces +z = the road)
function busAdTex() {
  return canvasTex('busAd', 256, 384, (g, w, h) => {
    g.fillStyle = css(TC.TEAL); g.fillRect(0, 0, w, h);
    g.fillStyle = css(TC.CREAM_L); g.textAlign = 'center'; g.font = `700 40px ${FONT}`;
    g.fillText('VISIT THE', w / 2, 60); g.fillText('HARBOR', w / 2, 104);
    g.fillStyle = css(TC.MUSTARD); g.beginPath(); g.arc(w / 2, 220, 70, 0, 7); g.fill();
    g.fillStyle = css(TC.CORAL); g.beginPath(); g.moveTo(60, 300); g.quadraticCurveTo(w / 2, 250, 196, 300); g.lineTo(196, 330); g.lineTo(60, 330); g.fill();
    g.fillStyle = css(TC.CREAM_L); g.font = `600 28px ${FONT}`; g.fillText('ferry daily', w / 2, 368);
  });
}
function busSignTex() {
  return canvasTex('busSign', 128, 128, (g, w, h) => {
    g.fillStyle = css(TC.CREAM_L); g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.fillStyle = css(TC.TEAL); g.beginPath(); g.arc(64, 64, 52, 0, 7); g.fill();
    g.fillStyle = css(TC.CREAM_L); g.fillRect(34, 40, 60, 38); g.fillStyle = css(TC.TEAL); g.fillRect(40, 46, 22, 14); g.fillRect(66, 46, 22, 14);
    g.fillStyle = css(TC.CREAM_L); g.beginPath(); g.arc(46, 84, 8, 0, 7); g.arc(82, 84, 8, 0, 7); g.fill();
    g.font = `700 22px ${FONT}`; g.textAlign = 'center'; g.fillText('BUS', 64, 110);
  });
}
export function createBusStop() {
  const g = geo('busStop', (b) => {
    const F = TC.NAVY;
    for (const x of [-1.45, 1.45]) for (const z of [-0.55, 0.4]) b.box(0.07, 2.35, 0.07, F, x, 0, z);
    // roof: a thin frame only (rim + two cross bars), the glass infill is a separate transparent pane
    b.box(3.1, 0.08, 0.08, F, 0, 2.35, -0.68); b.box(3.1, 0.08, 0.08, F, 0, 2.35, 0.54);
    for (const x of [-1.51, -0.5, 0.5, 1.51]) b.box(0.08, 0.08, 1.3, F, x, 2.35, -0.07);
    b.box(3.1, 0.12, 0.06, TC.TEAL, 0, 2.3, 0.6);
    b.box(2.9, 0.06, 0.06, F, 0, 0.1, -0.55); b.box(2.9, 0.06, 0.06, F, 0, 2.05, -0.55);
    // bench
    b.box(2.0, 0.06, 0.38, TC.WOOD, 0, 0.45, -0.3);
    b.box(2.0, 0.3, 0.05, TC.WOOD, 0, 0.55, -0.5);
    for (const x of [-0.85, 0.85]) b.box(0.06, 0.45, 0.32, TC.STEEL_DD, x, 0, -0.3);
    // ad panel frame on the east side
    b.box(0.12, 1.6, 0.9, F, 1.45, 0.25, -0.07);
    // bin + sign pole
    b.cyl(0.18, 0.16, 0.6, TC.TEAL, -1.85, 0, 0.35, 8); b.cyl(0.19, 0.19, 0.05, TC.STEEL_DD, -1.85, 0.6, 0.35, 8);
    b.box(0.08, 2.6, 0.08, TC.STEEL_D, -1.85, 0, -0.35);
    b.box(0.5, 0.36, 0.05, TC.CREAM, -1.85, 1.6, -0.33);                    // timetable
    for (let i = 0; i < 4; i++) b.box(0.4, 0.03, 0.01, TC.NAVY_L, -1.85, 1.68 + i * 0.06, -0.3);
  });
  const group = solidGroup(g);
  group.add(glassPane(2.84, 1.9, 0.03, 0, 0.13, -0.56));
  group.add(glassPane(0.03, 1.9, 0.9, -1.45, 0.13, -0.07));
  const roof = glassPane(2.96, 0.03, 1.2, 0, 2.38, -0.07, glassTintMat);
  group.add(roof);
  const ad = face(busAdTex(), 0.74, 1.4, { lit: true });
  ad.position.set(1.37, 1.05, -0.07); ad.rotation.y = -R90;
  group.add(ad);
  const ad2 = face(busAdTex(), 0.74, 1.4, { lit: true });
  ad2.position.set(1.53, 1.05, -0.07); ad2.rotation.y = R90;
  group.add(ad2);
  const sign = face(busSignTex(), 0.6, 0.6, { lit: true });
  sign.position.set(-1.85, 2.45, -0.3);
  group.add(sign);
  return group;
}
