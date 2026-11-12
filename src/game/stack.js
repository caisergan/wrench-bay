// A vertical stack of parts parented to an anchor. Parts fly between stacks (and into cars) in arcs.
// Every part carries its type in part.userData.partType. Items can be taken from the middle (mixed carry
// stacks); the ones above settle down smoothly in settle().
import * as THREE from 'three';
import { PART_H, createPart } from '../models/index.js';
import { hop, popIn } from './tween.js';
import { clamp, damp } from './util.js';

const _l = new THREE.Vector3();
const _w = new THREE.Vector3();
const _s = new THREE.Vector3();

export function makePart(type) {
  const p = createPart(type);
  p.userData.partType = type;
  return p;
}

export class PartStack {
  /** anchor: Object3D the parts become children of. root: world root group used while flying. */
  constructor(anchor, root, { scale = 1, hopHeight = 0.7, spacing = PART_H } = {}) {
    this.anchor = anchor; this.root = root; this.scale = scale; this.hopHeight = hopHeight; this.spacing = spacing;
    this.items = [];     // parts that have arrived (index = slot)
    this.pending = 0;    // parts still in flight towards this stack
    this.incoming = {};  // type -> parts of that type in flight
  }
  get count() { return this.items.length + this.pending; }
  get ready() { return this.items.length; }

  slot(i, out) { return out.set(0, i * this.spacing, 0); }
  slotWorld(i, out) {
    this.slot(i, _l);
    this.anchor.updateWorldMatrix(true, false);
    return out.copy(_l).applyMatrix4(this.anchor.matrixWorld);
  }

  /** Number of arrived (+ optionally in-flight) parts of a type. */
  countOf(type, withPending = false) {
    let n = withPending ? this.incoming[type] || 0 : 0;
    for (let i = 0; i < this.items.length; i++) if (this.items[i].userData.partType === type) n++;
    return n;
  }
  /** Index of the top-most arrived part of `type`, or -1. */
  indexOf(type) {
    for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].userData.partType === type) return i;
    return -1;
  }

  /** Fly `part` from world position `from` into the next slot. */
  add(part, from, { delay = 0, height = this.hopHeight, onLand } = {}) {
    const idx = this.count;
    const type = part.userData.partType;
    this.pending++;
    this.incoming[type] = (this.incoming[type] || 0) + 1;
    this.root.add(part);
    part.position.copy(from);
    hop(part, from, (out) => this.slotWorld(Math.max(0, Math.min(idx, this.count - 1)), out), {
      duration: 0.3, delay, height, scaleFrom: part.scale.x, scaleTo: this.scale,
      onComplete: () => {
        this.pending--;
        this.incoming[type]--;
        part.rotation.set(0, 0, 0);
        // re-parent keeping the world position so settle() eases it into its slot
        this.anchor.updateWorldMatrix(true, false);
        part.getWorldPosition(_w);
        this.anchor.add(part);
        this.anchor.worldToLocal(part.position.copy(_w));
        part.scale.setScalar(this.scale);
        this.items.push(part);
        if (onLand) onLand(part);
      },
    });
  }

  /** Put a fresh part on top with a pop-in animation (restock). */
  spawn(part) {
    this.anchor.add(part);
    this.slot(this.items.length, part.position);
    this.items.push(part);
    popIn(part, this.scale, 0.35);
  }

  /** Detach item i into the world root (keeping its world transform). */
  takeAt(i) {
    if (i < 0 || i >= this.items.length) return null;
    const b = this.items.splice(i, 1)[0];
    b.updateWorldMatrix(true, false);
    b.getWorldPosition(_w); b.getWorldScale(_s);
    this.root.add(b);
    b.position.copy(_w);
    b.rotation.set(0, 0, 0);
    b.scale.setScalar(_s.x);
    return b;
  }
  takeTop() { return this.takeAt(this.items.length - 1); }
  take(type) { return this.takeAt(this.indexOf(type)); }

  transferTo(other, delay = 0) {
    const b = this.takeTop();
    if (!b) return false;
    other.add(b, b.position, { delay });
    return true;
  }

  /** Remove every part immediately (world teardown). */
  clear() {
    for (const b of this.items) if (b.parent) b.parent.remove(b);
    this.items.length = 0;
  }

  /**
   * Ease every item towards its slot. (ox, oz) = lagging sway in local metres per level^1.3 (carry stacks).
   */
  settle(dt, ox = 0, oz = 0) {
    const k = damp(18, dt);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      this.slot(i, _l);
      if (i > 0 && (ox || oz)) {
        const f = Math.pow(i, 1.3);
        _l.x += clamp(ox * f, -0.4, 0.4);
        _l.z += clamp(oz * f, -0.4, 0.4);
      }
      const p = it.position;
      // sway is applied directly (it is already spring-smoothed); vertical drop eases
      p.x = _l.x; p.z = _l.z;
      p.y += (_l.y - p.y) * k;
      if (Math.abs(_l.y - p.y) < 0.002) p.y = _l.y;
    }
  }
}
