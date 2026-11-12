// Pay pads (next VISIBLE_PADS unlocks) and the upgrade pad. Both only react to the player on foot.
import * as THREE from 'three';
import { createUnlockPad, createUpgradePad } from '../models/index.js';
import { LAYOUT as L, UNLOCKS, VISIBLE_PADS, ECONOMY } from '../config.js';
import { state, isUnlocked, unlockPrice, trySpend } from '../core/state.js';
import { events } from '../core/events.js';
import { ui } from '../ui/index.js';
import { popIn, popOut } from './tween.js';
import { Tag, fmt } from './util.js';

const HALF = 0.85;
const GRACE = 0.35;
// Partial payments persist for the session (cleared when moving to the next garage).
const partial = new Map();
export function resetPartialPayments() { partial.clear(); }

/** World position of the pay pad for an unlock entry. */
export function padPosition(u) {
  if (u.pad) return new THREE.Vector3(u.pad.x, 0, u.pad.z);
  if (u.type === 'station') { const s = L.stations[u.key]; return new THREE.Vector3(s.x, 0, s.z + L.stationPickupOffsetZ); }
  if (u.type === 'lift') { const l = L.lifts[u.index]; return new THREE.Vector3(l.x, 0, l.z); }
  return new THREE.Vector3();
}

class Pad {
  constructor(ctx, u, animate) {
    this.ctx = ctx; this.u = u;
    this.pos = padPosition(u);
    this.model = createUnlockPad();
    this.model.group.position.copy(this.pos);
    ctx.root.add(this.model.group);
    if (animate) popIn(this.model.group, 1, 0.45, 0.25);
    this.tag = new Tag({ text: '', kind: 'price' }, 1.2);
    this.tag.place(this.pos.x, 0, this.pos.z);
    this.grace = GRACE; this.acc = 0; this.tickT = 0; this.shown = null; this.done = false;
  }
  get price() { return unlockPrice(this.u); }
  get paid() { return partial.get(this.u.id) || 0; }
  get remaining() { return Math.max(0, this.price - this.paid); }
  remove() {
    this.tag.remove();
    const g = this.model.group;
    popOut(g, 0.25, () => { if (g.parent) g.parent.remove(g); });
  }
}

export function createPads(ctx) {
  const list = [];

  const up = createUpgradePad();
  up.group.position.set(L.upgradePad.x, 0, L.upgradePad.z);
  ctx.root.add(up.group);
  let onUpgrade = false, upDwell = 0;

  return {
    list,
    refresh(animate) {
      const want = UNLOCKS.filter((u) => !isUnlocked(u.id)).slice(0, VISIBLE_PADS);
      for (let i = list.length - 1; i >= 0; i--) {
        if (!want.includes(list[i].u)) { list[i].remove(); list.splice(i, 1); }
      }
      for (const u of want) if (!list.some((p) => p.u === u)) list.push(new Pad(ctx, u, animate));
    },
    update(dt) {
      const pl = ctx.player;
      const p = pl.pos;
      up.update(dt);
      const inU = pl.onFoot && Math.abs(p.x - L.upgradePad.x) < 0.7 && Math.abs(p.z - L.upgradePad.z) < 0.7;
      // the pad sits on the main walkway: only open the sheet after a short pause on it, not when walking across
      upDwell = inU ? upDwell + dt : 0;
      const onU = inU && (onUpgrade || upDwell >= 0.4);
      if (onU !== onUpgrade) { onUpgrade = onU; events.emit(onU ? 'upgradepad:enter' : 'upgradepad:exit'); }

      for (let i = 0; i < list.length; i++) {
        const pad = list[i];
        if (pad.done) continue;
        pad.model.update(dt);
        const txt = '$' + fmt(pad.remaining);
        if (txt !== pad.shown) { pad.shown = txt; pad.tag.setText(txt); const pr = pad.paid / pad.price; pad.model.setProgress(pr); pad.tag.setProgress(pr); }

        const inside = pl.onFoot && Math.abs(p.x - pad.pos.x) < HALF && Math.abs(p.z - pad.pos.z) < HALF;
        if (!inside) { pad.grace = GRACE; pad.acc = 0; continue; }
        if (pad.grace > 0) { pad.grace -= dt; continue; }
        if (state.cash < 1) { pad.acc = 0; continue; }

        const rate = Math.max(pad.price / ECONOMY.padDrainTime, 5);
        pad.acc += rate * dt;
        const amt = Math.floor(Math.min(pad.acc, pad.remaining, state.cash));
        if (amt >= 1 && trySpend(amt)) {
          pad.acc -= amt;
          partial.set(pad.u.id, pad.paid + amt);
          pad.tickT -= dt;
          if (pad.tickT <= 0) { ui.sfx('pay'); pad.tickT = 0.07; }
          if (pad.remaining <= 0) {
            pad.done = true;
            pad.model.setProgress(1);
            ctx.completePad(pad);     // mutates list via refresh()
            return;
          }
        }
      }
    },
    dispose() { for (const pad of list) pad.tag.remove(); if (onUpgrade) events.emit('upgradepad:exit'); },
  };
}
