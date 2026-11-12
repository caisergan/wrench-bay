import * as THREE from 'three';
import { ui } from '../ui/index.js';

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** Frame-rate independent smoothing factor. */
export const damp = (k, dt) => 1 - Math.exp(-k * dt);

/** Signed shortest difference b - a in (-PI, PI]. */
export function angleDiff(a, b) {
  return ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}
export function lerpAngle(a, b, k) { return a + angleDiff(a, b) * k; }

/** 950, 1.2K, 34K, 3.4M ... */
export function fmt(n) { return ui.fmt ? ui.fmt(n) : String(Math.round(n)); }

export function disposeTree(obj) {
  obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}

/** Remove an Object3D from whatever it is parented to. */
export function detach(o) { if (o && o.parent) o.parent.remove(o); }

/**
 * A UI label with its own world position vector, placed above an anchor point by dy.
 * Newer label methods (setJobs / setPatience / setVip / setIcon) are forwarded defensively.
 */
export class Tag {
  constructor(opts, dy = 2) {
    this.dy = dy;
    this.pos = new THREE.Vector3(0, -100, 0);
    this.label = ui.label({ ...opts, worldPos: this.pos });
    this.visible = true;
  }
  place(x, y, z) { this.pos.set(x, y + this.dy, z); this.label.setPos(this.pos); return this; }
  setText(t) { this.label.setText(t); return this; }
  setVisible(v) { v = !!v; if (v !== this.visible) { this.visible = v; this.label.setVisible(v); } return this; }
  setProgress(p) { this.label.setProgress?.(p); return this; }
  setJobs(j) { this.label.setJobs?.(j); return this; }
  setPatience(p) { this.label.setPatience?.(p); return this; }
  setVip(v) { this.label.setVip?.(v); return this; }
  setIcon(i) { this.label.setIcon?.(i); return this; }
  setBonus(t) { this.label.setBonus?.(t); return this; }
  /** Any other label method, called only if the label kind has it: tag.call('setStars', [true, null, null]). */
  call(name, ...args) { this.label[name]?.(...args); return this; }
  remove() { this.label.remove(); }
}

/** Short-lived emote bubble that follows an Object3D for `duration` seconds. */
export class Emote {
  constructor() { this.tag = null; this.t = 0; }
  show(kind, duration = 2.2) {
    if (!this.tag) this.tag = new Tag({ text: kind, kind: 'emote' }, 1.95);
    this.tag.setText(kind);
    this.tag.setVisible(true);
    this.t = duration;
  }
  update(dt, obj) {
    if (!this.tag) return;
    this.t -= dt;
    if (this.t <= 0) { this.tag.remove(); this.tag = null; return; }
    const p = obj.position;
    this.tag.place(p.x, p.y, p.z);
  }
  remove() { if (this.tag) { this.tag.remove(); this.tag = null; } }
}

// Chunky down-pointing arrow (billboard it with obj.quaternion.copy(camera.quaternion)). Geometry is shared.
const arrowGeo = new THREE.BoxGeometry(1, 1, 1);
const arrowMats = new Map();
function arrowMat(c) {
  let m = arrowMats.get(c);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: c, depthTest: false }); arrowMats.set(c, m); }
  return m;
}
export function makeArrow(color = 0xf6c453, outlineColor = 0x2f4858, size = 1.25) {
  const arrow = new THREE.Group();
  const fill = arrowMat(color), line = arrowMat(outlineColor);
  const part = (w, h, x, y, rz) => {
    const o = new THREE.Mesh(arrowGeo, line); o.scale.set(w + 0.14, h + 0.14, 0.05); o.position.set(x, y, -0.03); o.rotation.z = rz; o.renderOrder = 9; arrow.add(o);
    const f = new THREE.Mesh(arrowGeo, fill); f.scale.set(w, h, 0.06); f.position.set(x, y, 0); f.rotation.z = rz; f.renderOrder = 10; arrow.add(f);
  };
  part(0.34, 0.7, 0, 0.75, 0);
  part(0.8, 0.3, -0.24, 0.32, -Math.PI / 4);
  part(0.8, 0.3, 0.24, 0.32, Math.PI / 4);
  arrow.scale.setScalar(size);
  const g = new THREE.Group();
  g.add(arrow);
  return g;
}
