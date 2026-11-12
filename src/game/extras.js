// Static gameplay props: scrap bin (dumps carried parts), toolbox, and the unlockable coffee cart, billboard and
// valet stand. Unlock effects themselves (patience, spawn rate, VIP odds) are read from state where they apply.
import * as THREE from 'three';
import { scene } from '../core/engine.js';
import {
  createScrapBin, createToolbox, createCoffeeCart, createBillboard, createValetStand, poof,
} from '../models/index.js';
import { LAYOUT as L, PLAYER } from '../config.js';
import { ui } from '../ui/index.js';
import { hop, popIn, tween } from './tween.js';
import { detach } from './util.js';

const _v = new THREE.Vector3();

export function createExtras(ctx) {
  const items = {};
  function place(obj, x, z, yaw = 0, animate = false, box = null) {
    obj.position.set(x, 0, z);
    obj.rotation.y = yaw;
    ctx.root.add(obj);
    if (animate) popIn(obj, 1, 0.5);
    if (box) ctx.obstacles.push({ minX: x - box[0], maxX: x + box[0], minZ: z - box[1], maxZ: z + box[1] });
    return obj;
  }

  const bin = L.scrapBin;
  items.scrap = place(createScrapBin(), bin.x, bin.z, -Math.PI / 2, false, [0.5, 0.5]);
  items.toolbox = place(createToolbox(), L.toolbox.x, L.toolbox.z, 0, false, null);
  const binTop = new THREE.Vector3(bin.x, 1.0, bin.z);
  let dumpT = 0;

  const sys = {
    items,
    addCoffee(animate) {
      if (items.coffee) return;
      const c = L.coffeeCart;
      items.coffee = place(createCoffeeCart(), c.x, c.z, -Math.PI / 2, animate, [0.5, 0.75]);
    },
    addBillboard(animate) {
      if (items.billboard) return;
      const b = L.billboard;
      items.billboard = place(createBillboard(), b.x, b.z, 0, animate, null);
    },
    addValetStand(animate) {
      if (items.valetStand) return;
      const s = L.valetStand;
      items.valetStand = place(createValetStand(), s.x, s.z, 0, animate, [0.35, 0.3]);
    },

    /** Fly every part of `stack` into a bin (top first). bin = { x, z } (default: the garage's scrap bin). */
    dumpFrom(stack, from, b = bin) {
      const n = stack.items.length;
      if (!n) return 0;
      const top = b === bin ? binTop : new THREE.Vector3(b.x, 1.0, b.z);
      for (let i = 0; i < n; i++) {
        const part = stack.takeTop();
        hop(part, part.position, top, {
          duration: 0.3, delay: i * 0.05, height: 1.0, scaleFrom: part.scale.x, scaleTo: 0.4,
          onComplete: () => detach(part),
        });
      }
      tween({ duration: 0.01, delay: 0.3 + n * 0.05, onComplete: () => poof(scene, _v.set(b.x, 0.6, b.z), 0x8f9aa3) });
      ui.sfx('trash');
      return n;
    },

    update(dt) {
      dumpT -= dt;
      const pl = ctx.player;
      if (!pl.onFoot || dumpT > 0 || !pl.stack.items.length) return;
      // every facility's scrap bin (garage: L.scrapBin; others: fac.scrap = { x, z, radius })
      for (const fac of ctx.facilityList) {
        const b = fac.scrap;
        if (!b) continue;
        const r = b.radius + PLAYER.radius + 0.15;
        if (Math.hypot(pl.pos.x - b.x, pl.pos.z - b.z) < r) { sys.dumpFrom(pl.stack, null, fac.id === 'garage' ? bin : b); dumpT = 0.6; return; }
      }
    },
    dispose() {},
  };
  return sys;
}
