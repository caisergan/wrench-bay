// Floor mats: the spots the player stands on (in front of a parts shelf / paint tank, at a car's nose on a lift).
// A 4 cm rubber slab with a printed face (mat-face.js) on a canvas texture. Redrawn only when its state changes.
import * as THREE from 'three';
import { memo, roundedRect } from './voxel.js';
import { iconImage, paintMatFace } from './mat-face.js';

const PX = 200;                        // texture pixels per metre
const THICK = 0.04;
const geos = new Map();
const sideMat = new THREE.MeshLambertMaterial({ color: 0x1f3340 });

/** Slab geometry: group 0 = caps (top UVs span the whole face 0..1), group 1 = the sides. */
function matGeo(w, d) {
  return memo(geos, w.toFixed(2) + 'x' + d.toFixed(2), () => {
    const uv = {
      generateTopUV(g, v, a, b, c) { return [a, b, c].map((i) => new THREE.Vector2((v[i * 3] + w / 2) / w, (v[i * 3 + 1] + d / 2) / d)); },
      generateSideWallUV() { return [0, 0, 0, 0].map(() => new THREE.Vector2(0, 0)); },
    };
    return new THREE.ExtrudeGeometry(roundedRect(w, d, Math.min(w, d) * 0.17), {
      depth: THICK, bevelEnabled: false, curveSegments: 6, UVGenerator: uv,
    });
  });
}

/**
 * A floor mat w x d metres (x across, z along), centred on its group's origin.
 * opts: { icon (ICON name), tint (CSS colour for var(--c) icons), kind: 'station' | 'lift' }.
 * Returns { group, set(state, ring, tick), glow(k), dispose() }.
 *   state: 'idle' | 'want' (pulse it with glow) | 'on' | 'empty';  ring: 0..1 "one more part";  tick: "got it".
 */
export function createFloorMat(w, d, { icon, tint, kind = 'station' } = {}) {
  const W = Math.round(w * PX), H = Math.round(d * PX);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const c2 = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const top = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: tex, emissive: 0x000000 });
  const slab = new THREE.Mesh(matGeo(w, d), [top, sideMat]);
  slab.rotation.x = -Math.PI / 2;       // the extrusion (local +z) becomes world +y, the shape's +y the far side
  slab.receiveShadow = true;
  const group = new THREE.Group();
  group.add(slab);

  let key = '', st = 'idle', rg = 0, tk = false, glowK = -1;
  const img = iconImage(icon, tint);
  function draw() {
    const k = st + '|' + Math.round(rg * 40) + '|' + (tk ? 1 : 0);
    if (k === key) return;
    key = k;
    paintMatFace(c2, W, H, { kind, icon, tint, state: st, prog: rg, check: tk });
    tex.needsUpdate = true;
  }
  if (!img.complete) img.addEventListener('load', () => { key = ''; draw(); }, { once: true });
  draw();

  return {
    group,
    get state() { return st; },
    set(state, ring = 0, tick = false) { st = state; rg = ring; tk = tick; draw(); return this; },
    /** 0..1 brightening (the "a lift needs this" pulse); 0 = off. */
    glow(k) {
      if (k === glowK) return;
      glowK = k;
      top.emissive.setRGB(k, k, k);
    },
    dispose() { group.removeFromParent(); top.dispose(); tex.dispose(); },
  };
}
