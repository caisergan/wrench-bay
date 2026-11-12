// Environment kit: shared helpers for the static world (environment.js + env-*.js).
// Textures, a chunked merge builder (per-area meshes so the frustum culls what is off screen), the solid-scenery
// registry behind townSolids(), a text-sign atlas and the street furniture / building / tree factories.
import * as THREE from 'three';
import { PALETTE as P } from '../config.js';
import { Builder, litMat, glowMat, mesh, polygon, mulberry32 } from './voxel.js';

export const PI = Math.PI;
export const CREAM = 0xfff6e6;
export const PAINTW = 0xfbf6ea;           // road / floor paint white
export const CORAL = P.wallTrim;
export const NAVY = P.wall;
export const LEAF = [0x3f9d6a, 0x56b97a, 0x2f7f5a, 0x6ac48b];
export const FONT = '"Fredoka", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
export const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
export const mixHex = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
export const mix = (a, b, k) => mixHex(a, b, k).getHex();
export const pick = (rnd, arr) => arr[(rnd() * arr.length) | 0];

// Heights of the flat layers (keep >= 4 mm apart: no z-fighting from the high camera).
export const Y = {
  ground: -0.04, base: 0.0, road: 0.004, lot: 0.006, mark: 0.012, walk: 0.03, kerb: 0.045,
};

// ------------------------------------------------------------------ textures
export function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const texCache = new Map();
/** Shared texture per kind; `repeat` is applied per material via a clone that shares the image. */
function sharedTex(key, make) {
  let t = texCache.get(key);
  if (!t) { t = make(); t.wrapS = t.wrapT = THREE.RepeatWrapping; texCache.set(key, t); }
  return t;
}

export function asphaltTex(repeat) {
  return canvasTex(256, 256, (g, w, h) => {
    const rnd = mulberry32(3);
    g.fillStyle = css(P.street); g.fillRect(0, 0, w, h);
    for (let k = 0; k < 500; k++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)';
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3);
    }
  }, repeat);
}

// ------------------------------------------------------------------ ground textures at real scale (polish)
// One large tileable texture per ground kind, drawn at real scale (TEX_M metres per texture). surface() bakes UVs in
// WORLD space and cuts every rectangle along a CELL m grid; each cell gets its own offset (snapped to the joint grid
// where the kind has one) and mirror flip, so joints run on seamlessly between surfaces while the details never
// repeat in a visible rhythm. All pieces of a kind in one ~30 m chunk merge into one mesh with one shared material
// (flushSurfaces(root) builds them once every module has added its surfaces).
const TEX_M = { concrete: 16, asphalt: 16, alley: 16, gravel: 12, plaza: 6, lawn: 8, meadow: 12 };
// Per-cell offset + flip only where a joint grid hides the cell border: the cell is a multiple of the slab / paver
// bond and the offset snaps to it, so every cell border falls on a joint. Kinds without joints map continuously and
// get their large-scale variation from the macro term in groundMat's shader instead (no seams, no repeat).
const CELL = { concrete: 16, plaza: 12 };
const QUANT = { concrete: [1 / 8, 1 / 6], plaza: [1 / 10, 2 / 15] };
const NOFLIP_V = new Set(['plaza']);
// macro tone variation per kind: gain on the blurred two-scale sample (0 = off)
const MACRO = { concrete: 2.2, asphalt: 2.6, alley: 2.4, gravel: 3.0, plaza: 1.6, lawn: 2.4, meadow: 1.5 };
const rgba = (hex, a) => { const c = new THREE.Color(hex); return `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`; };

/** Soft round blotches, wrapped so the texture tiles. */
function blotches(g, rnd, w, h, n, r0, r1, hex, a0, a1) {
  for (let k = 0; k < n; k++) {
    const x = rnd() * w, y = rnd() * h, r = r0 + rnd() * (r1 - r0), a = a0 + rnd() * (a1 - a0);
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const cx = x + ox, cy = y + oy;
      if (cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) continue;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, rgba(hex, a)); gr.addColorStop(0.6, rgba(hex, a * 0.55)); gr.addColorStop(1, rgba(hex, 0));
      g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
}
/** Tiny square specks (grain, aggregate). */
function specks(g, rnd, x0, y0, w, h, n, cols, s0 = 1, s1 = 2) {
  for (let k = 0; k < n; k++) {
    g.fillStyle = cols[(rnd() * cols.length) | 0];
    const s = s0 + ((rnd() * (s1 - s0 + 1)) | 0);
    g.fillRect(x0 + ((rnd() * w) | 0), y0 + ((rnd() * h) | 0), s, s);
  }
}
/** Wrapped polyline crack from (x, y): hairline, jittered, sometimes with a short branch. */
function crack(g, rnd, w, h, x, y, len, ang, style, lw = 1) {
  const pts = [[x, y]];
  let cx = x, cy = y, a = ang;
  const steps = Math.max(3, Math.round(len / 9));
  for (let i = 0; i < steps; i++) { a += (rnd() - 0.5) * 0.9; cx += Math.cos(a) * len / steps; cy += Math.sin(a) * len / steps; pts.push([cx, cy]); }
  const br = rnd() < 0.45 ? (1 + ((rnd() * (pts.length - 2)) | 0)) : -1;
  const brA = a + (rnd() < 0.5 ? 1 : -1) * (0.7 + rnd() * 0.6), brL = len * (0.25 + rnd() * 0.25);
  g.strokeStyle = style; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
    g.beginPath(); g.moveTo(pts[0][0] + ox, pts[0][1] + oy);
    for (const [px, py] of pts) g.lineTo(px + ox, py + oy);
    if (br > 0) { const [bx, by] = pts[br]; g.moveTo(bx + ox, by + oy); g.lineTo(bx + ox + Math.cos(brA) * brL, by + oy + Math.sin(brA) * brL); }
    g.stroke();
  }
}
/** Little tufts of weed (2 px blades) around x, y. */
function weeds(g, rnd, x, y, n, spread = 5) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = pick(rnd, ['rgba(88,146,78,0.9)', 'rgba(118,172,88,0.85)', 'rgba(70,120,66,0.85)']);
    g.fillRect(x + (rnd() - 0.5) * spread * 2, y + (rnd() - 0.5) * spread * 2, 2, 2 + ((rnd() * 2) | 0));
  }
}

/** Yard / lot concrete: 2.0 x 2.67 m slabs with thin saw-cut joints, a few replaced slabs, hairline cracks. */
function concreteCanvas() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rnd = mulberry32(5101), cols = 8, rows = 6, pw = w / cols, ph = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = i * pw, y = j * ph, replaced = rnd() < 0.09;
      const base = replaced ? mixHex(0xd9d5ca, 0xcfcabd, rnd()) : mixHex(0xcac4b6, 0xbcb5a6, rnd());
      g.fillStyle = '#' + base.getHexString(); g.fillRect(x, y, pw, ph);
      g.save(); g.beginPath(); g.rect(x, y, pw, ph); g.clip();
      // cure / wear mottling inside the slab
      for (let k = 0; k < (replaced ? 2 : 4); k++) {
        const bx = x + rnd() * pw, by = y + rnd() * ph, r = 20 + rnd() * 50, dark = rnd() < 0.55;
        const gr = g.createRadialGradient(bx, by, 0, bx, by, r);
        gr.addColorStop(0, dark ? 'rgba(96,86,66,0.07)' : 'rgba(255,255,250,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(bx - r, by - r, r * 2, r * 2);
      }
      specks(g, rnd, x, y, pw, ph, replaced ? 90 : 230, ['rgba(255,255,255,0.13)', 'rgba(90,80,62,0.11)', 'rgba(140,132,118,0.16)']);
      if (!replaced && rnd() < 0.3) {                      // hairline crack, often from a corner or an edge
        const fromCorner = rnd() < 0.5;
        const sx = fromCorner ? x + (rnd() < 0.5 ? 2 : pw - 2) : x + pw * (0.2 + rnd() * 0.6);
        const sy = fromCorner ? y + (rnd() < 0.5 ? 2 : ph - 2) : y + (rnd() < 0.5 ? 2 : ph - 2);
        const ang = Math.atan2(y + ph / 2 - sy, x + pw / 2 - sx) + (rnd() - 0.5) * 0.8;
        crack(g, rnd, w, h, sx, sy, 26 + rnd() * 50, ang, 'rgba(74,66,54,0.42)', 1);
      }
      if (rnd() < 0.08) {                                  // an old rust drip / bolt mark
        const gr = g.createRadialGradient(x + pw * rnd(), y + ph * rnd(), 0, x + pw / 2, y + ph / 2, 12);
        gr.addColorStop(0, 'rgba(150,92,52,0.22)'); gr.addColorStop(1, 'rgba(150,92,52,0)');
        g.fillStyle = gr; g.fillRect(x, y, pw, ph);
      }
      g.restore();
      if (replaced) { g.strokeStyle = 'rgba(120,112,98,0.35)'; g.lineWidth = 1; g.strokeRect(x + 2.5, y + 2.5, pw - 5, ph - 5); }
    }
    // saw-cut joints (about 3 cm) with a light lip
    g.fillStyle = 'rgba(78,70,56,0.55)';
    for (let i = 0; i <= cols; i++) g.fillRect(Math.round(i * pw) - 1, 0, 2, h);
    for (let j = 0; j <= rows; j++) g.fillRect(0, Math.round(j * ph) - 1, w, 2);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < cols; i++) g.fillRect(Math.round(i * pw) + 1, 0, 1, h);
    for (let j = 0; j < rows; j++) g.fillRect(0, Math.round(j * ph) + 1, w, 1);
    // weeds in a few joint stretches
    for (let k = 0; k < 14; k++) {
      const vert = rnd() < 0.5;
      const jx = vert ? Math.round(((rnd() * cols) | 0) * pw) : rnd() * w, jy = vert ? rnd() * h : Math.round(((rnd() * rows) | 0) * ph);
      for (let t = 0; t < 3; t++) weeds(g, rnd, jx + (vert ? 0 : t * 4), jy + (vert ? t * 4 : 0), 3, 1.5);
    }
    blotches(g, rnd, w, h, 3, 14, 26, 0x3c3a38, 0.08, 0.14);      // a couple of faint old stains
  });
}
/** Loose gravel / hardcore: fine grain, a few pebbles, compacted and dusty patches. */
function gravelCanvas() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rnd = mulberry32(4107);
    g.fillStyle = '#c2b8a3'; g.fillRect(0, 0, w, h);
    blotches(g, rnd, w, h, 26, 50, 140, 0x8c806a, 0.07, 0.15);     // compacted / damp
    blotches(g, rnd, w, h, 18, 40, 110, 0xfffaf0, 0.06, 0.12);     // dry dust
    specks(g, rnd, 0, 0, w, h, 26000, ['rgba(255,255,255,0.32)', 'rgba(112,100,82,0.32)', 'rgba(156,146,128,0.42)', 'rgba(92,86,78,0.3)', 'rgba(214,206,188,0.5)'], 1, 2);
    for (let k = 0; k < 420; k++) {                    // pebbles: light top-left, shade bottom-right
      const x = rnd() * w, y = rnd() * h, s = 3 + ((rnd() * 2) | 0);
      g.fillStyle = pick(rnd, ['#d8cfbd', '#b9ae99', '#a59a86', '#cfc6b3']); g.fillRect(x, y, s, s);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, y, s - 1, 1);
      g.fillStyle = 'rgba(70,60,48,0.35)'; g.fillRect(x + 1, y + s, s, 1);
    }
    for (let k = 0; k < 9; k++) weeds(g, rnd, rnd() * w, rnd() * h, 7, 4);
  });
}
/** Street asphalt: fine aggregate, worn and patched tone, sealed cracks ("tar snakes"). */
function asphaltCanvas() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rnd = mulberry32(3301);
    g.fillStyle = css(P.street); g.fillRect(0, 0, w, h);
    blotches(g, rnd, w, h, 22, 60, 170, 0xffffff, 0.025, 0.05);
    blotches(g, rnd, w, h, 18, 50, 140, 0x000000, 0.04, 0.07);
    specks(g, rnd, 0, 0, w, h, 30000, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.1)', 'rgba(210,212,218,0.14)'], 1, 1);
    specks(g, rnd, 0, 0, w, h, 1600, ['rgba(220,222,228,0.16)', 'rgba(30,32,38,0.18)'], 2, 2);
    for (let k = 0; k < 7; k++) crack(g, rnd, w, h, rnd() * w, rnd() * h, 70 + rnd() * 140, rnd() * PI * 2, 'rgba(28,30,36,0.5)', 2.5);
    for (let k = 0; k < 6; k++) crack(g, rnd, w, h, rnd() * w, rnd() * h, 30 + rnd() * 50, rnd() * PI * 2, 'rgba(36,38,44,0.32)', 1);
  });
}
/** Service-lane asphalt: older and lighter, rectangular repair patches, crack networks, weeds in the cracks. */
function alleyCanvas() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rnd = mulberry32(3907);
    g.fillStyle = '#6e727c'; g.fillRect(0, 0, w, h);
    blotches(g, rnd, w, h, 24, 50, 150, 0xffffff, 0.03, 0.06);
    blotches(g, rnd, w, h, 16, 40, 120, 0x000000, 0.04, 0.08);
    specks(g, rnd, 0, 0, w, h, 28000, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.1)', 'rgba(200,200,205,0.14)'], 1, 1);
    for (let k = 0; k < 9; k++) {                       // repair patches (newer, darker, crisp edges)
      const pw = 50 + rnd() * 120, ph = 30 + rnd() * 80, x = rnd() * (w - pw), y = rnd() * (h - ph);
      g.fillStyle = rnd() < 0.7 ? 'rgba(46,49,57,0.32)' : 'rgba(150,150,150,0.14)'; g.fillRect(x, y, pw, ph);
      specks(g, rnd, x, y, pw, ph, (pw * ph / 14) | 0, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.08)'], 1, 1);
      g.strokeStyle = 'rgba(30,32,38,0.4)'; g.lineWidth = 1.5; g.strokeRect(x, y, pw, ph);
    }
    for (let k = 0; k < 5; k++) {                       // crack networks with weeds
      const x = rnd() * w, y = rnd() * h;
      for (let t = 0; t < 4; t++) crack(g, rnd, w, h, x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 30, 24 + rnd() * 40, rnd() * PI * 2, 'rgba(32,34,40,0.45)', 1);
      if (rnd() < 0.7) weeds(g, rnd, x, y, 6, 6);
    }
    for (let k = 0; k < 5; k++) crack(g, rnd, w, h, rnd() * w, rnd() * h, 60 + rnd() * 120, rnd() * PI * 2, 'rgba(26,28,34,0.5)', 2.5);
  });
}
/** Concrete pavers 0.6 x 0.4 m in running bond: tone per paver, bevel, a few replaced ones, weeds in joints. */
function plazaCanvas() {
  return canvasTex(512, 512, (g, w, h) => {
    const rnd = mulberry32(6203), cols = 10, rows = 15, pw = w / cols, ph = h / rows;
    g.fillStyle = '#9c8a6c'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < rows; j++) {
      const off = (j % 2) * pw / 2;
      for (let i = -1; i < cols; i++) {
        const x = i * pw + off, y = j * ph;
        const odd = rnd() < 0.06;
        g.fillStyle = '#' + (odd ? mixHex(0xcfc2a6, 0xc4b597, rnd()) : mixHex(0xe6dac1, 0xd6c8ab, rnd())).getHexString();
        g.fillRect(x + 1, y + 1, pw - 1.5, ph - 1.5);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + 1, y + 1, pw - 1.5, 1);
        g.fillStyle = 'rgba(90,72,48,0.18)'; g.fillRect(x + 1, y + ph - 1.5, pw - 1.5, 1);
        specks(g, rnd, x + 1, y + 1, pw - 2, ph - 2, 14, ['rgba(255,255,255,0.12)', 'rgba(110,92,64,0.1)'], 1, 1);
      }
    }
    for (let k = 0; k < 10; k++) weeds(g, rnd, ((rnd() * cols) | 0) * pw, ((rnd() * rows) | 0) * ph, 3, 2);
    blotches(g, rnd, w, h, 3, 10, 20, 0x5a5048, 0.08, 0.13);
  });
}
/** Kept lawn: soft 1 m mowing stripes, lush and dry patches, clover, a few daisies. */
function lawnCanvas() {
  return canvasTex(512, 512, (g, w, h) => {
    const rnd = mulberry32(7109);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#78c27e' : '#70bb77'; g.fillRect(0, i * 64, w, 64); }
    blotches(g, rnd, w, h, 10, 30, 80, 0x3f8f52, 0.08, 0.16);
    blotches(g, rnd, w, h, 6, 25, 60, 0xc9c27a, 0.08, 0.14);
    for (let k = 0; k < 7000; k++) { g.fillStyle = pick(rnd, ['rgba(255,255,255,0.09)', 'rgba(30,90,40,0.14)', 'rgba(150,210,120,0.16)']); g.fillRect(rnd() * w, rnd() * h, 1, 2 + ((rnd() * 2) | 0)); }
    for (let k = 0; k < 14; k++) { const x = rnd() * w, y = rnd() * h; for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(70,140,72,0.5)'; g.fillRect(x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 10, 3, 2); } }
    for (let k = 0; k < 16; k++) { const x = rnd() * w, y = rnd() * h; g.fillStyle = '#fbf6ea'; g.fillRect(x, y, 2, 2); g.fillStyle = '#f2c94c'; g.fillRect(x + 0.5, y + 0.5, 1, 1); }
  });
}
/** Unmown grass for vacant lots: blotchy greens, dry patches, bare earth, drifts of wildflowers. */
function meadowCanvas() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rnd = mulberry32(8111);
    g.fillStyle = '#82bf74'; g.fillRect(0, 0, w, h);
    blotches(g, rnd, w, h, 26, 60, 160, 0x4f9a58, 0.08, 0.16);
    blotches(g, rnd, w, h, 18, 50, 130, 0xc8c676, 0.10, 0.2);
    blotches(g, rnd, w, h, 7, 16, 40, 0xa58a62, 0.22, 0.36);
    for (let k = 0; k < 30000; k++) {
      g.fillStyle = pick(rnd, ['rgba(52,112,58,0.35)', 'rgba(150,200,110,0.3)', 'rgba(96,160,84,0.35)', 'rgba(200,200,120,0.25)']);
      g.fillRect(rnd() * w, rnd() * h, 1, 2 + ((rnd() * 3) | 0));
    }
    for (let k = 0; k < 22; k++) {                      // wildflower drifts
      const x = rnd() * w, y = rnd() * h, col = pick(rnd, ['#fbf6ea', '#f6c453', '#f26b5b', '#b9a3e3', '#f2a0c4']);
      for (let i = 0; i < 18; i++) { g.fillStyle = col; g.fillRect(x + (rnd() - 0.5) * 46, y + (rnd() - 0.5) * 30, 2, 2); }
    }
  });
}

const TEX = { asphalt: asphaltCanvas, alley: alleyCanvas, gravel: gravelCanvas, concrete: concreteCanvas, plaza: plazaCanvas, lawn: lawnCanvas, meadow: meadowCanvas };
const surfMats = new Map();
/** Mean luminance of a canvas texture (reference for the macro term). */
function meanLum(t) {
  const c = t.image, n = 64, k = document.createElement('canvas');
  k.width = k.height = n;
  const g = k.getContext('2d'); g.drawImage(c, 0, 0, n, n);
  const d = g.getImageData(0, 0, n, n).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 765;
  return sum / (n * n);
}
/**
 * Shared ground material of a kind (world-space UVs; the texture repeats). Its shader multiplies in a macro tone
 * taken from two very blurred samples of the same texture at other scales / orientations, so large areas vary
 * softly over tens of metres instead of repeating every tile.
 */
export function groundMat(kind) {
  let m = surfMats.get(kind);
  if (!m) {
    const t = sharedTex('ground|' + kind, TEX[kind]);
    t.anisotropy = 8;
    m = new THREE.MeshLambertMaterial({ map: t });
    const gain = MACRO[kind] || 0;
    if (gain) {
      const ref = meanLum(t).toFixed(4);
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  vec3 macA = texture2D( map, vMapUv * 0.173 + vec2( 0.37, 0.61 ), 6.0 ).rgb;
  vec3 macB = texture2D( map, vMapUv.yx * 0.071 + vec2( 0.13, 0.29 ), 7.0 ).rgb;
  float macL = dot( macA + macB, vec3( 0.16667 ) );
  sampledDiffuseColor.rgb *= clamp( 1.0 + ( macL - ${ref} ) * ${gain.toFixed(2)}, 0.84, 1.16 );
  diffuseColor *= sampledDiffuseColor;
#endif`);
      };
      m.customProgramCacheKey = () => 'ground|' + kind;
    }
    surfMats.set(kind, m);
  }
  return m;
}
function hash3(a, b, c) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const KIND_SALT = { asphalt: 11, alley: 23, gravel: 37, concrete: 41, plaza: 53, lawn: 67, meadow: 79 };
/** Adds one ground quad x0..x1 / z0..z1 at height y to the geometry arrays, world-space UVs, cut into CELL cells. */
function pushGround(arr, kind, x0, x1, z0, z1, y) {
  const tm = TEX_M[kind], q = QUANT[kind] || [0, 0], salt = KIND_SALT[kind];
  const C = CELL[kind] || 1e5;
  const snap = (v, k) => (k ? Math.floor(v / k) * k : v);
  for (let cx = Math.floor(x0 / C); cx * C < x1 - 1e-6; cx++) {
    for (let cz = Math.floor(z0 / C); cz * C < z1 - 1e-6; cz++) {
      const xa = Math.max(x0, cx * C), xb = Math.min(x1, (cx + 1) * C);
      const za = Math.max(z0, cz * C), zb = Math.min(z1, (cz + 1) * C);
      if (xb - xa < 1e-4 || zb - za < 1e-4) continue;
      const cellular = !!CELL[kind];
      const fu = !cellular || hash3(cx, cz, salt) < 0.5 ? 1 : -1;
      const fv = !cellular || NOFLIP_V.has(kind) ? 1 : (hash3(cz, cx, salt + 1) < 0.5 ? 1 : -1);
      const ou = cellular ? snap(hash3(cx + 7, cz, salt + 2), q[0]) : 0, ov = cellular ? snap(hash3(cx, cz + 7, salt + 3), q[1]) : 0;
      const k = arr.pos.length / 3;
      for (const [x, z] of [[xa, za], [xb, za], [xb, zb], [xa, zb]]) {
        arr.pos.push(x, y, z); arr.nor.push(0, 1, 0);
        arr.uv.push(fu * x / tm + ou, -fv * z / tm + ov);
      }
      arr.idx.push(k, k + 3, k + 2, k, k + 2, k + 1);
    }
  }
}
function groundGeo(arr) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(arr.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(arr.uv, 2));
  geo.setIndex(arr.idx);
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}
const groundBatch = new Map();      // kind|60 m chunk -> arrays (ground is cheap per triangle: big chunks, few calls)
/**
 * Textured ground rectangle (receives shadows). Queued into the shared ground batch: the meshes appear when
 * flushSurfaces(root) runs (environment.js does that after every area). Returns an empty placeholder so callers can
 * keep doing root.add(surface(...)).
 */
export function surface(kind, x0, x1, z0, z1, y) {
  const C = 60;
  for (let cx = Math.floor(x0 / C); cx * C < x1 - 1e-6; cx++) {
    for (let cz = Math.floor(z0 / C); cz * C < z1 - 1e-6; cz++) {
      const xa = Math.max(x0, cx * C), xb = Math.min(x1, (cx + 1) * C), za = Math.max(z0, cz * C), zb = Math.min(z1, (cz + 1) * C);
      if (xb - xa < 1e-4 || zb - za < 1e-4) continue;
      const key = kind + '|' + cx + ',' + cz;
      let arr = groundBatch.get(key);
      if (!arr) { arr = { kind, pos: [], nor: [], uv: [], idx: [] }; groundBatch.set(key, arr); }
      pushGround(arr, kind, xa, xb, za, zb, y);
    }
  }
  return new THREE.Object3D();
}
/** Builds the queued ground: one mesh per kind per 60 m chunk. Returns the number of meshes. */
export function flushSurfaces(root) {
  let n = 0;
  for (const arr of groundBatch.values()) {
    const m = new THREE.Mesh(groundGeo(arr), groundMat(arr.kind));
    m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false;
    root.add(m); n++;
  }
  groundBatch.clear();
  return n;
}
/** A standalone ground mesh (world-space UVs, shared material), e.g. for a plot dressing that can be hidden. */
export function surfaceMesh(kind, x0, x1, z0, z1, y) {
  const arr = { pos: [], nor: [], uv: [], idx: [] };
  pushGround(arr, kind, x0, x1, z0, z1, y);
  const m = new THREE.Mesh(groundGeo(arr), groundMat(kind));
  m.receiveShadow = true; m.castShadow = false;
  return m;
}
export function waterTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const rnd = mulberry32(21);
    g.fillStyle = '#5cb8c6'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 46; k++) {
      const x = rnd() * w, y = rnd() * h, l = 14 + rnd() * 36;
      g.strokeStyle = rnd() > 0.4 ? 'rgba(255,255,255,0.35)' : 'rgba(30,110,140,0.25)';
      g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke();
    }
  }, [14, 8]);
}

// ------------------------------------------------------------------ basic helpers
export function plane(w, d, x, y, z, mat, { cast = false } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -PI / 2; m.position.set(x, y, z); m.receiveShadow = true; m.castShadow = cast;
  return m;
}
/** Flat box from x0..x1 / z0..z1, bottom at y, height h. */
export const flat = (b, x0, x1, z0, z1, y, h, c) => b.box(x1 - x0, h, z1 - z0, c, (x0 + x1) / 2, y, (z0 + z1) / 2);

export function arrow(b, x, z, dir, len, c, w = 0.28, hw = 0.7, y = 0.002) {
  const a = len * 0.5;
  const shp = polygon([[-w / 2, 0], [w / 2, 0], [w / 2, a], [hw / 2, a], [0, len], [-hw / 2, a], [-w / 2, a]]);
  const ry = { '+x': -PI / 2, '-x': PI / 2, '+z': PI, '-z': 0 }[dir];
  b.push(x, 0, z, ry);
  b.shape(shp, 0.03, c, 0, y, len / 2, -PI / 2);
  b.pop();
}

export function stripes(b, x0, x1, zMax, width, c1, c2, step = 0.55) {
  let i = 0;
  for (let x = x0; x < x1 - 0.01; x += step, i++) {
    const s = Math.min(step, x1 - x);
    const shp = polygon([[0, 0], [s, 0], [s + width * 0.5, width], [width * 0.5, width]]);
    b.shape(shp, 0.025, i % 2 ? c2 : c1, x - width * 0.25, 0.003, zMax, -PI / 2);
  }
}

// ------------------------------------------------------------------ chunked builder
const _v = new THREE.Vector3();
/** Same API as voxel Builder, but routes every primitive into a ~size x size world chunk (one mesh each). */
export class ChunkBuilder {
  constructor(size = 30) { this.size = size; this.map = new Map(); this.mat = new THREE.Matrix4(); this.stack = []; }
  push(x = 0, y = 0, z = 0, ry = 0, s = 1, rx = 0) {
    this.stack.push(this.mat.clone());
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0));
    this.mat.multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)));
    return this;
  }
  pop() { this.mat = this.stack.pop(); return this; }
  _b(x, y, z) {
    _v.set(x, y, z).applyMatrix4(this.mat);
    const k = Math.floor(_v.x / this.size) + ',' + Math.floor(_v.z / this.size);
    let b = this.map.get(k);
    if (!b) { b = new Builder(); this.map.set(k, b); }
    b.mat.copy(this.mat);
    return b;
  }
  box(w, h, d, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { this._b(x, y, z).box(w, h, d, c, x, y, z, rx, ry, rz); return this; }
  cyl(rt, rb, h, c, x = 0, y = 0, z = 0, seg = 8, rx = 0, ry = 0, rz = 0) { this._b(x, y, z).cyl(rt, rb, h, c, x, y, z, seg, rx, ry, rz); return this; }
  shape(shp, depth, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { this._b(x, y, z).shape(shp, depth, c, x, y, z, rx, ry, rz); return this; }
  quad(w, d, c, x = 0, y = 0, z = 0, ry = 0) { quad(this._b(x, y, z), w, d, c, x, y, z, ry); return this; }
  disc(r, c, x = 0, y = 0, z = 0, seg = 10) { disc(this._b(x, y, z), r, c, x, y, z, seg); return this; }
  /** Adds one mesh per chunk to parent. Returns the number of meshes. */
  build(parent, mat = litMat, opts = {}) {
    let n = 0;
    for (const b of this.map.values()) {
      if (!b.geos.length) continue;
      const m = mesh(b.build(), mat, opts);
      m.matrixAutoUpdate = false;
      parent.add(m); n++;
    }
    this.map.clear();
    return n;
  }
}

/** Flat horizontal quad w x d facing up (2 triangles), centre x,z at height y, yaw ry. Builder or ChunkBuilder. */
export function quad(b, w, d, c, x, y, z, ry = 0) {
  if (b instanceof ChunkBuilder) return b.quad(w, d, c, x, y, z, ry);
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-PI / 2);
  b._add(g, c, x, y, z, 0, ry, 0);
  return b;
}
/** Flat disc facing up (seg triangles). Builder or ChunkBuilder. */
export function disc(b, r, c, x, y, z, seg = 10) {
  if (b instanceof ChunkBuilder) return b.disc(r, c, x, y, z, seg);
  const g = new THREE.CircleGeometry(r, seg);
  g.rotateX(-PI / 2);
  b._add(g, c, x, y, z, 0, 0, 0);
  return b;
}
/** Flat decal from x0..x1 / z0..z1 with its top at y (a quad: cheaper than a thin box). */
export const flatTop = (b, x0, x1, z0, z1, y, c) => quad(b, x1 - x0, z1 - z0, c, (x0 + x1) / 2, y, (z0 + z1) / 2);

/** The three standard layers every area builds into. */
export function layers() {
  return { S: new ChunkBuilder(), F: new ChunkBuilder(), G: new ChunkBuilder() };
}

// ------------------------------------------------------------------ solid scenery registry (townSolids)
export const solids = [];
export function addSolid(minX, maxX, minZ, maxZ) { solids.push({ minX, maxX, minZ, maxZ }); }
/** Axis-aligned solid box for a w x d footprint centred at x,z, rotated by ry (multiples of PI/2 assumed). */
export function solidRect(x, z, w, d, ry = 0) {
  const q = Math.abs(Math.round(ry / (PI / 2))) % 2;
  const hw = (q ? d : w) / 2, hd = (q ? w : d) / 2;
  addSolid(x - hw, x + hw, z - hd, z + hd);
}

// ------------------------------------------------------------------ text sign atlas (one mesh for every sign)
const SIGN_W = 512, SIGN_H = 128, SIGN_COLS = 2, SIGN_ROWS = 16;
export class SignAtlas {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIGN_W * SIGN_COLS; this.canvas.height = SIGN_H * SIGN_ROWS;
    this.g = this.canvas.getContext('2d');
    this.cells = new Map(); this.next = 0; this.geos = [];
  }
  _cell(text, st) {
    const key = text + '|' + st.bg + '|' + st.fg;
    if (this.cells.has(key)) return this.cells.get(key);
    const i = this.next++ % (SIGN_COLS * SIGN_ROWS);
    const cx = (i % SIGN_COLS) * SIGN_W, cy = ((i / SIGN_COLS) | 0) * SIGN_H;
    const g = this.g;
    g.save(); g.translate(cx, cy);
    // bg null = transparent cell (ground paint text); otherwise an opaque sign board
    g.clearRect(0, 0, SIGN_W, SIGN_H);
    if (st.bg != null) { g.fillStyle = css(st.bg); g.fillRect(0, 0, SIGN_W, SIGN_H); }
    if (st.border != null) { g.strokeStyle = css(st.border); g.lineWidth = 8; g.strokeRect(8, 8, SIGN_W - 16, SIGN_H - 16); }
    let size = 78;
    g.font = `700 ${size}px ${FONT}`;
    const maxW = SIGN_W - 60;
    const mw = g.measureText(text).width;
    if (mw > maxW) { size = Math.floor(size * maxW / mw); g.font = `700 ${size}px ${FONT}`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (st.shadow != null) { g.fillStyle = css(st.shadow); g.fillText(text, SIGN_W / 2 + 4, SIGN_H / 2 + 7); }
    g.fillStyle = css(st.fg); g.fillText(text, SIGN_W / 2, SIGN_H / 2 + 4);
    g.restore();
    const cell = { u0: cx / this.canvas.width, u1: (cx + SIGN_W) / this.canvas.width, v0: 1 - (cy + SIGN_H) / this.canvas.height, v1: 1 - cy / this.canvas.height };
    this.cells.set(key, cell);
    return cell;
  }
  /** Text quad of w x h (local, facing +z, centre at lx,ly,lz) under the builder's current transform. */
  quad(b, text, st, w, h, lx, ly, lz) {
    const c = this._cell(text, st);
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, c.u0 + uv.getX(i) * (c.u1 - c.u0), c.v0 + uv.getY(i) * (c.v1 - c.v0));
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(lx, ly, lz));
    geo.applyMatrix4(b.mat);
    this.geos.push(geo);
  }
  /** Flat text painted on the ground (reads from the camera: text bottom towards +z). */
  ground(text, st, w, h, x, y, z, ry = 0) {
    const geo = new THREE.PlaneGeometry(w, h);
    const c = this._cell(text, st);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, c.u0 + uv.getX(i) * (c.u1 - c.u0), c.v0 + uv.getY(i) * (c.v1 - c.v0));
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-PI / 2));
    geo.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
    (this.groundGeos ??= []).push(geo);
  }
  build(parent, mergeGeometries) {
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    if (this.geos.length) {
      const m = new THREE.Mesh(mergeGeometries(this.geos, false), new THREE.MeshLambertMaterial({ map: tex }));
      m.receiveShadow = true; parent.add(m);
    }
    if (this.groundGeos?.length) {
      const m = new THREE.Mesh(mergeGeometries(this.groundGeos, false), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.receiveShadow = true; m.renderOrder = 1; parent.add(m);
    }
  }
}
// ground-paint text style: transparent background, white letters
export const GROUND_TEXT = { bg: null, fg: PAINTW };

// ------------------------------------------------------------------ greenery
export function tree(b, x, z, s, rnd, trunk = P.woodDark, y = 0) {
  const c = pick(rnd, LEAF);
  b.box(0.3 * s, 0.9 * s, 0.3 * s, trunk, x, y, z);
  b.box(1.5 * s, 0.9 * s, 1.5 * s, c, x, y + 0.8 * s, z, 0, rnd() * 0.6);
  b.box(1.15 * s, 0.8 * s, 1.15 * s, mix(c, 0xffffff, 0.12), x, y + 1.55 * s, z, 0, rnd() * 0.6);
  b.box(0.7 * s, 0.6 * s, 0.7 * s, mix(c, 0xffffff, 0.22), x, y + 2.2 * s, z, 0, rnd() * 0.6);
}
export function pine(b, x, z, s, rnd, y = 0) {
  const c = pick(rnd, [0x2f7f5a, 0x2a6e52, 0x3b8a60]);
  b.box(0.28 * s, 0.7 * s, 0.28 * s, P.woodDark, x, y, z);
  b.cyl(0, 1.0 * s, 1.3 * s, c, x, y + 0.5 * s, z, 6, 0, rnd());
  b.cyl(0, 0.78 * s, 1.1 * s, mix(c, 0xffffff, 0.1), x, y + 1.25 * s, z, 6, 0, rnd());
  b.cyl(0, 0.52 * s, 0.9 * s, mix(c, 0xffffff, 0.18), x, y + 1.95 * s, z, 6, 0, rnd());
}
export function bush(b, x, z, s, rnd, flower = null, y = 0) {
  const c = pick(rnd, LEAF);
  b.box(0.9 * s, 0.5 * s, 0.8 * s, c, x, y, z, 0, rnd() * 0.5);
  b.box(0.6 * s, 0.4 * s, 0.55 * s, mix(c, 0xffffff, 0.15), x + 0.05 * s, y + 0.4 * s, z, 0, rnd());
  if (flower) for (let i = 0; i < 3; i++) b.box(0.12 * s, 0.12 * s, 0.12 * s, flower, x + (rnd() - 0.5) * 0.7 * s, y + 0.6 * s + rnd() * 0.15, z + (rnd() - 0.5) * 0.6 * s);
}
export function hedge(b, x0, x1, z0, z1, h = 0.55) {
  b.box(x1 - x0, h, z1 - z0, 0x3f9d6a, (x0 + x1) / 2, 0, (z0 + z1) / 2);
  b.box(x1 - x0 - 0.08, 0.1, z1 - z0 - 0.08, 0x56b97a, (x0 + x1) / 2, h, (z0 + z1) / 2);
}
export function rock(b, x, z, s, rnd, y = 0) {
  b.box(s * 1.2, s * 0.7, s, 0xa9b1ad, x, y, z, 0, rnd());
  b.box(s * 0.7, s * 0.5, s * 0.7, 0xbcc3bf, x + 0.1 * s, y + s * 0.6, z, 0, rnd());
}
export const FLOWERS = [CORAL, P.accent, CREAM, 0xe58bb5, 0x9b8fd4];

// ------------------------------------------------------------------ props (props facing local +z)
export function tireStack(b, x, z, n, rnd) {
  for (let i = 0; i < n; i++) b.cyl(0.36, 0.36, 0.17, i % 2 ? 0x2b2f36 : 0x363c45, x + (rnd() - 0.5) * 0.05, i * 0.17, z + (rnd() - 0.5) * 0.05, 10);
  b.cyl(0.19, 0.19, 0.012, P.steel, x, n * 0.17, z, 10);
}
export function drum(b, x, z, c) {
  b.cyl(0.3, 0.3, 0.82, c, x, 0, z, 10);
  b.cyl(0.315, 0.315, 0.05, mix(c, 0x000000, 0.25), x, 0.2, z, 10);
  b.cyl(0.315, 0.315, 0.05, mix(c, 0x000000, 0.25), x, 0.55, z, 10);
  b.cyl(0.22, 0.22, 0.03, P.steelDark, x, 0.82, z, 10);
}
export function lampPost(b, g, x, z, rotY) {
  b.push(x, 0, z, rotY);
  b.cyl(0.14, 0.18, 0.25, P.steelDark, 0, 0, 0, 8);
  b.cyl(0.07, 0.09, 2.6, P.steelDark, 0, 0.25, 0, 8);
  b.box(0.1, 0.1, 0.75, P.steelDark, 0, 2.8, -0.3);
  b.box(0.32, 0.12, 0.42, P.steelDark, 0, 2.8, -0.65);
  b.pop();
  g.push(x, 0, z, rotY);
  g.box(0.26, 0.05, 0.34, 0xfff1b8, 0, 2.76, -0.65);
  g.pop();
}
/** Old-town lantern post (Main Street, garden): two lanterns on a crossbar. */
export function lanternPost(b, g, x, z, rotY = 0, col = NAVY) {
  b.push(x, 0, z, rotY);
  b.cyl(0.16, 0.2, 0.3, col, 0, 0, 0, 8);
  b.cyl(0.06, 0.08, 2.5, col, 0, 0.3, 0, 8);
  b.box(0.9, 0.07, 0.07, col, 0, 2.6, 0);
  for (const s of [-0.42, 0.42]) {
    b.box(0.05, 0.16, 0.05, col, s, 2.45, 0);
    b.box(0.26, 0.06, 0.26, col, s, 2.2, 0);
    b.cyl(0.02, 0.17, 0.12, col, s, 2.5, 0, 4, 0, PI / 4);
  }
  b.pop();
  g.push(x, 0, z, rotY);
  for (const s of [-0.42, 0.42]) g.box(0.18, 0.22, 0.18, 0xfff1b8, s, 2.26, 0);
  g.pop();
}
export function bench(b, x, z, ry, len = 1.5) {
  b.push(x, 0, z, ry);
  b.box(len, 0.07, 0.42, P.wood, 0, 0.4, 0.02);
  b.box(len, 0.32, 0.06, P.woodDark, 0, 0.5, -0.2, -0.12);
  for (const s of [-len / 2 + 0.12, len / 2 - 0.12]) { b.box(0.07, 0.4, 0.38, P.steelDark, s, 0, 0); b.box(0.07, 0.42, 0.06, P.steelDark, s, 0.4, -0.2); }
  b.pop();
}
export function hydrant(b, x, z) {
  b.cyl(0.13, 0.15, 0.08, 0xc23b32, x, 0.03, z, 8);
  b.cyl(0.1, 0.11, 0.42, 0xe5484d, x, 0.1, z, 8);
  b.cyl(0.12, 0.12, 0.06, 0xc23b32, x, 0.5, z, 8);
  b.cyl(0.03, 0.08, 0.1, 0xe5484d, x, 0.56, z, 8);
  b.box(0.32, 0.07, 0.07, P.accent, x, 0.32, z);
}
export function mailbox(b, x, z, ry = 0) {
  b.push(x, 0, z, ry);
  b.box(0.1, 0.7, 0.1, P.steelDark, 0, 0.03, 0);
  b.box(0.42, 0.5, 0.36, 0x2f6fb5, 0, 0.7, 0);
  b.cyl(0.21, 0.21, 0.42, 0x2f6fb5, 0, 1.2, 0, 10, 0, 0, PI / 2);
  b.box(0.26, 0.04, 0.02, 0x1d2a36, 0, 1.08, 0.19);
  b.box(0.2, 0.14, 0.02, CREAM, 0, 0.85, 0.19);
  b.pop();
}
export function trashCan(b, x, z, c = 0x3d7a5e) {
  b.cyl(0.22, 0.19, 0.62, c, x, 0.03, z, 8);
  b.cyl(0.24, 0.24, 0.05, mix(c, 0x000000, 0.3), x, 0.65, z, 8);
  b.cyl(0.16, 0.16, 0.03, 0x1d2228, x, 0.69, z, 8);
}
export function parkingMeter(b, x, z, ry = 0) {
  b.push(x, 0, z, ry);
  b.box(0.07, 0.95, 0.07, P.steelDark, 0, 0.03, 0);
  b.box(0.2, 0.28, 0.16, 0x9aa5ad, 0, 0.98, 0);
  b.box(0.14, 0.1, 0.02, 0x2a9d8f, 0, 1.1, 0.085);
  b.cyl(0.1, 0.1, 0.06, 0x9aa5ad, 0, 1.26, 0, 8, PI / 2);
  b.pop();
}
export function bollard(b, x, z, c = P.steelDark, h = 0.55) {
  b.cyl(0.09, 0.1, h, c, x, 0.03, z, 8);
  b.cyl(0.1, 0.1, 0.06, P.accent, x, h - 0.12, z, 8);
}
export function mooringBollard(b, x, z, y = 0) {
  b.cyl(0.13, 0.16, 0.3, 0x3a4048, x, y, z, 8);
  b.cyl(0.19, 0.19, 0.07, 0x3a4048, x, y + 0.3, z, 8);
}
export function crate(b, x, z, ry, s = 0.5, c = P.wood, y = 0) {
  b.box(s, s, s, c, x, y, z, 0, ry);
  b.box(s * 1.02, s * 0.12, s * 1.02, mix(c, 0x000000, 0.25), x, y + s * 0.44, z, 0, ry);
}
export function fishBox(b, x, z, ry, y = 0, c = 0x4fa3c7) {
  b.push(x, y, z, ry);
  b.box(0.7, 0.24, 0.45, c, 0, 0, 0);
  b.box(0.6, 0.02, 0.35, 0xd9e8ee, 0, 0.23, 0);
  for (let i = 0; i < 3; i++) b.box(0.14, 0.06, 0.32, 0xb8c6cf, -0.2 + i * 0.2, 0.24, 0, 0, 0.2);
  b.pop();
}
export function pallet(b, x, z, ry, n = 1, y = 0) {
  b.push(x, y, z, ry);
  for (let i = 0; i < n; i++) {
    const yy = i * 0.15;
    for (const s of [-0.45, 0, 0.45]) b.box(0.1, 0.08, 1.0, P.woodDark, s, yy, 0);
    for (let k = 0; k < 5; k++) b.box(1.1, 0.04, 0.16, P.wood, 0, yy + 0.08, -0.4 + k * 0.2);
  }
  b.pop();
}
/** Wheelie dumpster 1.6 x 1.0 (solid). Lid hinged at the back. */
export function dumpster(b, x, z, ry, c = 0x2f7f5a) {
  b.push(x, 0, z, ry);
  b.box(1.6, 0.95, 1.0, c, 0, 0.12, 0);
  b.box(1.66, 0.08, 1.06, mix(c, 0x000000, 0.25), 0, 1.0, 0);
  b.box(1.66, 0.06, 1.06, mix(c, 0x000000, 0.4), 0, 1.08, -0.02, -0.05);
  b.box(1.5, 0.08, 0.06, P.steelDark, 0, 0.8, 0.52);
  for (const s of [-0.65, 0.65]) for (const t of [-0.38, 0.38]) b.cyl(0.07, 0.07, 0.06, P.rubber, s, 0.03, t, 8, 0, 0, PI / 2);
  b.box(0.5, 0.25, 0.02, CREAM, 0, 0.45, 0.51);
  b.pop();
  solidRect(x, z, 1.7, 1.1, ry);
}
export function recyclingBins(b, x, z, ry) {
  b.push(x, 0, z, ry);
  [0x2f6fb5, P.accent, 0x3d7a5e].forEach((c, i) => {
    const sx = -0.62 + i * 0.62;
    b.box(0.56, 0.9, 0.6, c, sx, 0, 0);
    b.box(0.6, 0.06, 0.64, mix(c, 0x000000, 0.3), sx, 0.9, -0.01);
    b.box(0.22, 0.12, 0.02, CREAM, sx, 0.62, 0.31);
  });
  b.pop();
  solidRect(x, z, 1.9, 0.7, ry);
}
export function acUnit(b, x, z, ry, y = 0) {
  b.push(x, y, z, ry);
  b.box(0.9, 0.7, 0.45, 0xd6dadc, 0, 0, 0);
  b.cyl(0.26, 0.26, 0.02, 0x5c6670, 0, 0.35, 0.23, 12, PI / 2);
  b.box(0.04, 0.5, 0.02, 0x8f9aa3, 0, 0.1, 0.24);
  b.pop();
}
export function meterBox(b, x, z, ry, y = 0.6) {
  b.push(x, y, z, ry);
  b.box(0.45, 0.55, 0.16, 0xc8ccc8, 0, 0, 0.08);
  b.box(0.3, 0.16, 0.02, 0x2b3640, 0, 0.3, 0.17);
  b.box(0.06, 0.6, 0.06, P.steelDark, 0.15, -0.6, 0.06);
  b.pop();
}
export function electricCabinet(b, x, z, ry) {
  b.push(x, 0, z, ry);
  b.box(0.8, 1.15, 0.4, 0x8fa39a, 0, 0.03, 0);
  b.box(0.84, 0.05, 0.44, 0x6f8178, 0, 1.18, 0);
  b.box(0.2, 0.2, 0.02, P.accent, 0.18, 0.8, 0.205);
  b.pop();
}
export function utilityPole(b, x, z, h = 5.2) {
  b.cyl(0.11, 0.13, h, P.woodDark, x, 0, z, 6);
  b.box(1.1, 0.09, 0.09, P.woodDark, x, h - 0.5, z);
  for (const s of [-0.45, 0, 0.45]) b.cyl(0.04, 0.04, 0.1, 0xd9e8ee, x + s, h - 0.41, z, 5);
}
export function bikeRack(b, x, z, ry, n = 3, rnd = Math.random) {
  b.push(x, 0, z, ry);
  for (let i = 0; i < n; i++) {
    const sx = (i - (n - 1) / 2) * 0.5;
    b.box(0.05, 0.55, 0.05, P.steel, sx, 0.03, -0.25); b.box(0.05, 0.55, 0.05, P.steel, sx, 0.03, 0.25); b.box(0.05, 0.05, 0.55, P.steel, sx, 0.55, 0);
  }
  for (let i = 0; i < n - 1; i++) {          // bikes
    const sx = (i - (n - 1) / 2) * 0.5 + 0.25, c = pick(rnd, [CORAL, P.teal, P.accent, 0x5aa9e6]);
    for (const t of [-0.42, 0.42]) b.cyl(0.26, 0.26, 0.05, P.rubber, sx, 0.28, t, 10, 0, 0, PI / 2);
    b.box(0.05, 0.05, 0.75, c, sx, 0.38, 0, -0.25); b.box(0.05, 0.3, 0.05, c, sx, 0.4, -0.05); b.box(0.06, 0.04, 0.2, P.rubber, sx, 0.72, -0.05);
    b.box(0.3, 0.04, 0.04, P.steelDark, sx, 0.7, 0.36);
  }
  b.pop();
}
export function planterBox(b, x, z, w, d, rnd, c = 0xc9b79a) {
  b.box(w, 0.42, d, c, x, 0.03, z);
  b.box(w + 0.06, 0.06, d + 0.06, mix(c, 0xffffff, 0.2), x, 0.45, z);
  b.box(w - 0.1, 0.06, d - 0.1, 0x6b4a32, x, 0.42, z);
  const n = Math.max(1, Math.round((w * d) / 0.5));
  for (let i = 0; i < n; i++) bush(b, x + (rnd() - 0.5) * (w - 0.45), z + (rnd() - 0.5) * (d - 0.4), 0.6, rnd, pick(rnd, FLOWERS), 0.42);
}
export function cone(b, x, z) {
  b.box(0.4, 0.04, 0.4, P.rubber, x, 0, z);
  b.cyl(0.04, 0.16, 0.5, 0xf2813a, x, 0.04, z, 8);
  b.cyl(0.1, 0.12, 0.08, PAINTW, x, 0.22, z, 8);
}
export function manhole(F, x, z, r = 0.38) {
  F.cyl(r, r, 0.012, 0x4b5059, x, Y.mark, z, 12);
  F.cyl(r * 0.8, r * 0.8, 0.008, 0x5f6570, x, Y.mark + 0.01, z, 12);
}
export function drainGrate(F, x, z, ry = 0) {
  F.push(x, 0, z, ry);
  F.box(0.6, 0.012, 0.32, 0x3b4048, 0, Y.mark, 0);
  for (let i = -2; i <= 2; i++) F.box(0.05, 0.008, 0.26, 0x23272d, i * 0.1, Y.mark + 0.012, 0);
  F.pop();
}
export function stain(F, x, z, r, c = 0x4c5058, y = Y.mark) {
  disc(F, r, c, x, y + 0.006, z, 10);
  disc(F, r * 0.55, mix(c, 0x000000, 0.15), x + r * 0.2, y + 0.008, z - r * 0.1, 8);
}

// ------------------------------------------------------------------ buildings
export const WALLS = [0xf3e6c8, 0xe9a28e, 0x9fd3c7, 0xf2cf7a, 0xa9c8e8, 0xd9e4c4, 0xf7f1e6, 0xe7c2a4, 0xc7b8e0, 0x8fc3b4];
export const ROOFS = [0x2f4858, 0xb8573e, 0x5c6670, 0x245a5a, 0x8a4a3a, 0x3c4f73];
const DOORS = [0x2f4858, CORAL, P.teal, 0x8a4a3a, 0x3c6e9e, 0xf6c453];
const SHOP_STYLES = [
  { bg: NAVY, fg: CREAM, border: P.accent },
  { bg: CREAM, fg: NAVY, border: CORAL },
  { bg: CORAL, fg: CREAM, border: null, shadow: 0x9c3f35 },
  { bg: P.teal, fg: CREAM, border: CREAM },
  { bg: 0x2b2f36, fg: P.accent, border: null },
  { bg: P.accent, fg: NAVY, border: null },
];
export { SHOP_STYLES };

function windowAt(S, G, lx, ly, fz, trim, rnd, opts = {}) {
  const w = opts.w ?? 0.72, h = opts.h ?? 0.95;
  S.box(w + 0.16, h + 0.16, 0.06, trim, lx, ly - 0.08, fz + 0.02);
  G.box(w, h, 0.04, rnd() > 0.82 ? 0xfff1c4 : pick(rnd, [0xcdeef7, 0xb7e1ef, 0xa6dbec]), lx, ly, fz + 0.04);
  S.box(0.05, h, 0.05, trim, lx, ly, fz + 0.06);
  S.box(w + 0.24, 0.06, 0.14, trim, lx, ly - 0.12, fz + 0.08);
  if (opts.shutters) for (const s of [-1, 1]) S.box(0.24, h, 0.04, opts.shutters, lx + s * (w / 2 + 0.2), ly, fz + 0.03);
  if (opts.flowers) {
    S.box(w + 0.1, 0.16, 0.18, P.woodDark, lx, ly - 0.3, fz + 0.12);
    for (let i = 0; i < 4; i++) S.box(0.13, 0.13, 0.13, i % 2 ? 0x56b97a : opts.flowers, lx - w / 2 + 0.12 + i * (w - 0.24) / 3, ly - 0.15, fz + 0.12);
  }
}

/**
 * Closed building facing local +z, centred at (x, z), rotated ry. Footprint w x d, wall height h.
 * opts: wall, roof, roofType 'gable' | 'gableFront' | 'flat', shop: { name, style, awning: [c1, c2] }, rnd, y (base),
 * chimney, floors, door ('center' | 'left' | 'right' | false), signs (SignAtlas), sideWindows.
 */
export function building(S, G, signs, x, z, ry, w, d, h, o = {}) {
  const rnd = o.rnd ?? Math.random;
  const wall = o.wall ?? pick(rnd, WALLS);
  const roof = o.roof ?? pick(rnd, ROOFS);
  const trim = o.trim ?? (wall === 0xf7f1e6 ? 0xd9cdb5 : CREAM);
  const y0 = o.y ?? 0;
  const fz = d / 2;
  S.push(x, y0, z, ry); G.push(x, y0, z, ry);
  // plinth, walls, cornice
  S.box(w + 0.1, 0.3, d + 0.1, mix(wall, 0x5a5048, 0.45), 0, -0.1, 0);
  S.box(w, h - 0.2, d, wall, 0, 0.2, 0);
  S.box(w + 0.16, 0.16, d + 0.16, trim, 0, h - 0.16, 0);
  const shop = o.shop;
  const groundH = shop ? 2.9 : 0;
  // roof
  const rt = o.roofType ?? 'gable';
  if (rt === 'flat') {
    S.box(w - 0.1, 0.1, d - 0.1, 0x8e8a82, 0, h - 0.05, 0);
    for (const s of [-1, 1]) { S.box(w + 0.2, 0.42, 0.18, trim, 0, h, s * (d / 2 + 0.01)); S.box(0.18, 0.42, d + 0.2, trim, s * (w / 2 + 0.01), h, 0); }
    if (rnd() > 0.4) acUnit(S, (rnd() - 0.5) * (w - 1.4), -d / 4, 0, h + 0.05);
    if (rnd() > 0.6) { S.cyl(0.45, 0.45, 0.9, 0x9a7b5a, w / 4, h + 0.4, -d / 5, 8); S.cyl(0, 0.5, 0.35, 0x6b5440, w / 4, h + 1.3, -d / 5, 8); for (const t of [-0.3, 0.3]) S.box(0.06, 0.4, 0.06, P.steelDark, w / 4 + t, h, -d / 5); }
  } else if (rt === 'gable') {
    const rh = Math.min(2.2, d * 0.42);
    S.shape(polygon([[-d / 2 - 0.35, 0], [d / 2 + 0.35, 0], [0, rh]]), w + 0.4, roof, -w / 2 - 0.2, h, 0, 0, PI / 2, 0);
    S.box(w + 0.5, 0.14, 0.2, mix(roof, 0x000000, 0.25), 0, h + rh - 0.08, 0);
    S.shape(polygon([[-d / 2 + 0.05, 0], [d / 2 - 0.05, 0], [0, rh - 0.15]]), w + 0.02, mix(wall, 0xffffff, 0.08), -w / 2 - 0.01, h, 0, 0, PI / 2, 0);
    // eave fascia on the front
    S.box(w + 0.42, 0.1, 0.06, trim, 0, h - 0.04, d / 2 + 0.34);
  } else {   // gableFront: ridge runs front-back, triangular gable faces the street
    const rh = Math.min(2.2, w * 0.42);
    S.shape(polygon([[-w / 2 - 0.35, 0], [w / 2 + 0.35, 0], [0, rh]]), d + 0.4, roof, 0, h, -d / 2 - 0.2);
    S.shape(polygon([[-w / 2 + 0.02, 0], [w / 2 - 0.02, 0], [0, rh - 0.12]]), d - 0.02, mix(wall, 0xffffff, 0.06), 0, h, -d / 2 + 0.01);
    S.box(0.2, 0.14, d + 0.5, mix(roof, 0x000000, 0.25), 0, h + rh - 0.08, 0);
    windowAt(S, G, 0, h + rh * 0.32, fz, trim, rnd, { w: 0.5, h: 0.5 });
  }
  if (o.chimney ?? (rt !== 'flat' && rnd() > 0.45)) {
    const cx = (rnd() - 0.5) * (w - 1.2);
    S.box(0.45, 1.8, 0.45, mix(wall, 0x6b4a3a, 0.5), cx, h, -d * 0.15);
    S.box(0.55, 0.12, 0.55, 0x5c6670, cx, h + 1.8, -d * 0.15);
  }
  // front: shop ground floor or door + windows
  const floors = o.floors ?? Math.max(1, Math.floor((h - groundH + 0.4) / 2.5));
  const nWin = Math.max(1, Math.floor((w - 0.5) / 1.35));
  const shutters = o.shutters ?? (rnd() > 0.55 ? pick(rnd, [P.teal, NAVY, CORAL, 0x5aa9e6, 0x8a4a3a]) : null);
  const flowers = rnd() > 0.5 ? pick(rnd, FLOWERS) : null;
  const doorSide = o.door ?? (shop ? 'center' : pick(rnd, ['left', 'center', 'right']));
  const doorX = doorSide === 'left' ? -w / 2 + 0.8 : doorSide === 'right' ? w / 2 - 0.8 : 0;
  if (shop) {
    const st = shop.style ?? pick(rnd, SHOP_STYLES);
    // shop front frame + big display windows either side of the door
    S.box(w - 0.2, 2.5, 0.08, st.bg, 0, 0.2, fz + 0.01);
    const dw = 0.9;
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -w / 2 + 0.35 : dw / 2 + 0.15, x1 = s < 0 ? -dw / 2 - 0.15 : w / 2 - 0.35;
      if (x1 - x0 > 0.3) {
        G.box(x1 - x0, 1.45, 0.05, 0xd6f0f5, (x0 + x1) / 2, 0.75, fz + 0.06);
        S.box(x1 - x0 + 0.1, 0.12, 0.2, CREAM, (x0 + x1) / 2, 0.62, fz + 0.1);
        // goods in the window
        for (let i = 0; i < Math.floor((x1 - x0) / 0.45); i++) S.box(0.22, 0.18 + rnd() * 0.25, 0.02, pick(rnd, FLOWERS.concat([P.teal, 0x5aa9e6])), x0 + 0.25 + i * 0.45, 0.76, fz + 0.095);
      }
    }
    S.box(dw, 2.0, 0.06, mix(st.bg, 0x000000, 0.25), 0, 0.2, fz + 0.04);
    G.box(dw - 0.3, 0.9, 0.04, 0xd6f0f5, 0, 1.05, fz + 0.08);
    S.box(1.2, 0.12, 0.5, 0xb8b0a2, 0, 0.0, fz + 0.25);
    // awning
    const [a1, a2] = shop.awning ?? [st.bg === CREAM ? CORAL : st.bg, CREAM];
    const aw = w - 0.3, n = Math.max(3, Math.round(aw / 0.42)), sw = aw / n, ad = 1.05;
    for (let i = 0; i < n; i++) S.box(sw, 0.06, ad, i % 2 ? a2 : a1, -aw / 2 + sw / 2 + i * sw, 2.42, fz + ad / 2 - 0.02, 0.36);
    for (let i = 0; i < n; i++) S.box(sw, 0.2, 0.04, i % 2 ? a2 : a1, -aw / 2 + sw / 2 + i * sw, 2.02, fz + ad * 0.94);
    // sign board
    const sbw = Math.min(w - 0.4, 3.6);
    S.box(sbw + 0.12, 0.62, 0.1, st.border ?? mix(st.bg, 0x000000, 0.3), 0, 2.72, fz + 0.04);
    if (signs) signs.quad(S, shop.name, st, sbw, 0.5, 0, 3.03, fz + 0.1);
    // shop-specific street prop beside the door (sandwich board / crates / flower buckets)
    if (shop.prop === 'board') { S.box(0.55, 0.75, 0.05, NAVY, -w / 2 + 0.55, 0.03, fz + 0.55, -0.15); S.box(0.45, 0.55, 0.02, CREAM, -w / 2 + 0.55, 0.12, fz + 0.59, -0.15); }
    if (shop.prop === 'crates') for (let i = 0; i < 3; i++) { S.box(0.5, 0.3, 0.38, P.wood, -w / 2 + 0.45 + i * 0.55, 0.03, fz + 0.32); S.box(0.42, 0.08, 0.3, pick(rnd, [CORAL, P.accent, 0x56b97a, 0xe58bb5]), -w / 2 + 0.45 + i * 0.55, 0.33, fz + 0.32); }
    if (shop.prop === 'flowers') for (let i = 0; i < 3; i++) { S.cyl(0.17, 0.14, 0.3, 0x5c6670, w / 2 - 0.45 - i * 0.42, 0.03, fz + 0.3, 8); bush(S, w / 2 - 0.45 - i * 0.42, fz + 0.3, 0.45, rnd, pick(rnd, FLOWERS), 0.3); }
  } else {
    const dc = pick(rnd, DOORS);
    S.box(1.0, 2.0, 0.08, trim, doorX, 0.2, fz + 0.02);
    S.box(0.8, 1.85, 0.06, dc, doorX, 0.2, fz + 0.05);
    G.box(0.36, 0.3, 0.03, 0xfff1c4, doorX, 1.6, fz + 0.09);
    S.box(1.2, 0.12, 0.45, 0xb8b0a2, doorX, 0.0, fz + 0.22);
    S.box(1.25, 0.08, 0.5, mix(dc, 0x000000, 0.2), doorX, 2.3, fz + 0.25, 0.25);
    G.box(0.14, 0.18, 0.1, 0xfff1b8, doorX + 0.7, 1.75, fz + 0.08);
  }
  for (let f = 0; f < floors; f++) {
    const ly = groundH + 0.95 + f * 2.5;
    if (ly + 0.6 > h) break;
    for (let i = 0; i < nWin; i++) {
      const lx = -((nWin - 1) * 1.35) / 2 + i * 1.35;
      if (!shop && f === 0 && Math.abs(lx - doorX) < 0.9) continue;
      windowAt(S, G, lx, ly, fz, trim, rnd, { shutters, flowers: f > 0 || shop ? flowers : null });
    }
    if (o.sideWindows !== false) for (const s of [-1, 1]) {   // one window per floor on each side wall
      S.push(s * w / 2, 0, 0, s * PI / 2);
      G.push(s * w / 2, 0, 0, s * PI / 2);
      windowAt(S, G, 0, ly, 0, trim, rnd, { w: 0.6 });
      S.pop(); G.pop();
    }
  }
  if (o.balcony && h > 4.5) {
    S.box(w * 0.5, 0.1, 0.6, trim, 0, groundH + 2.45, fz + 0.3);
    for (let i = 0; i <= 6; i++) S.box(0.04, 0.6, 0.04, NAVY, -w * 0.25 + i * w * 0.5 / 6, groundH + 2.55, fz + 0.58);
    S.box(w * 0.5, 0.05, 0.05, NAVY, 0, groundH + 3.12, fz + 0.58);
  }
  S.pop(); G.pop();
}
