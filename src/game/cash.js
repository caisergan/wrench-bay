// Cash piles: bundles on the floor next to a lift, collected when the player walks close (on foot).
import * as THREE from 'three';
import { createCashStack, CASH_H } from '../models/index.js';
import { addCash } from '../core/state.js';
import { ui } from '../ui/index.js';
import { hop, popIn, tween } from './tween.js';
import { fmt, detach } from './util.js';

const _p = new THREE.Vector3();

export class CashPile {
  /** (x,y,z) world position of the pile centre. */
  /** make: optional factory for one bundle (default createCashStack; the wash uses coin stacks). */
  constructor(ctx, x, y, z, { scale = 1, cap = 24, radius = 1.2, make = null } = {}) {
    this.ctx = ctx; this.scale = scale; this.cap = cap; this.radius = radius;
    this.make = make || createCashStack;
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    ctx.root.add(this.group);
    this.trigger = new THREE.Vector3(x, 0, z);
    this.amount = 0;       // landed value
    this.incoming = 0;     // value still flying in
    this.bundles = [];
    this.flying = 0;
    ctx.piles.push(this);
  }

  slot(i, out) {
    const layer = Math.floor(i / 6), r = i % 6, col = r % 2, row = Math.floor(r / 2);
    return out.set((col - 0.5) * 0.46 * this.scale, layer * CASH_H * this.scale, (row - 1) * 0.3 * this.scale);
  }
  slotWorld(i, out) { this.slot(i, out); return out.add(this.group.position); }

  /** Add `value` to the pile; if `from` (world pos) is given a bundle hops in from there. */
  add(value, from, delay = 0) {
    if (!from) { this._land(value, null); return; }
    const b = this.make();
    b.scale.setScalar(this.scale);
    this.ctx.root.add(b);
    b.position.copy(from);
    if (delay > 0) b.visible = false;
    this.incoming += value;
    const idx = this.bundles.length + this.flying++;
    hop(b, from, (out) => this.slotWorld(Math.min(idx, this.cap - 1), out), {
      duration: 0.42, delay, height: 1.1,
      onComplete: () => { this.flying--; this.incoming -= value; this._land(value, b); this.ctx.sfxAt('coin', this.group.position); },
    });
    if (delay > 0) setTimeoutTween(b, delay);
  }

  _land(value, b) {
    this.amount += value;
    if (this.bundles.length >= this.cap) { detach(b); return; }
    if (!b) { b = this.make(); popIn(b, this.scale, 0.3); }
    b.visible = true;
    const i = this.bundles.length;
    this.group.add(b);
    this.slot(i, b.position);
    b.rotation.set(0, (Math.floor(i / 6) % 2) * 0.25, 0);
    b.scale.setScalar(this.scale);
    this.bundles.push(b);
  }

  /** Fly every bundle to `target` (Object3D), then pay out. */
  collect(target) {
    const total = Math.round(this.amount);
    if (total <= 0) return;
    this.amount = 0;
    const list = this.bundles; this.bundles = [];
    const root = this.ctx.root;
    const payout = () => {
      _p.copy(target.position); _p.y += 1.8;
      addCash(total, _p.clone());
      ui.floatText(_p, '+$' + fmt(total), 'cash');
      ui.sfx('cash');
    };
    if (!list.length) { payout(); return; }
    const to = (out) => { out.copy(target.position); out.y += 1.0; return out; };
    list.forEach((b, i) => {
      const wp = b.position.clone().add(this.group.position);
      root.add(b); b.position.copy(wp);
      const last = i === list.length - 1;
      hop(b, wp, to, {
        duration: 0.34, delay: i * 0.025, height: 0.9, scaleFrom: b.scale.x, scaleTo: 0.3 * this.scale,
        onComplete: () => { detach(b); if (last) payout(); },
      });
    });
  }
}

// Bundles with a launch delay stay hidden until they start flying.
function setTimeoutTween(obj, delay) {
  tween({ duration: 0.01, delay, onComplete: () => { obj.visible = true; } });
}

export function createCashSystem(ctx) {
  return {
    update() {
      const pl = ctx.player;
      if (!pl.onFoot) return;
      const p = pl.pos;
      for (const pile of ctx.piles) {
        if (pile.amount <= 0) continue;
        const dx = p.x - pile.trigger.x, dz = p.z - pile.trigger.z;
        if (dx * dx + dz * dz < pile.radius * pile.radius) pile.collect(pl.group);
      }
    },
    /** Total cash lying around (landed + in flight). */
    total() { let n = 0; for (const p of ctx.piles) n += p.amount + p.incoming; return n; },
    dispose() { ctx.piles.length = 0; },
  };
}
