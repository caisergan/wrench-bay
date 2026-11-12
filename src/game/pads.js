// Pay pads. PayPad = one yellow pad that drains cash into a price while the player stands on it (on foot).
// Used by every unlock chain (garage UNLOCKS, PAINT_UNLOCKS, VIP_UNLOCKS: createChainPads) and by the town's
// property / district pads (town.js). The garage also has the teal upgrade pad (createUpgradePad).
import * as THREE from 'three';
import { createUnlockPad, createUpgradePad as createUpgradePadModel } from '../models/index.js';
import { LAYOUT as L, VISIBLE_PADS, ECONOMY } from '../config.js';
import { state, trySpend } from '../core/state.js';
import { events } from '../core/events.js';
import { ui } from '../ui/index.js';
import { popIn, popOut } from './tween.js';
import { Tag, fmt } from './util.js';

const HALF = 0.85;
const GRACE = 0.35;
// Partial payments persist for the session (keyed by pad id; cleared when moving to the next garage).
const partial = new Map();
export function resetPartialPayments() { partial.clear(); }

/** World position of the pay pad for a garage unlock entry. */
export function padPosition(u, fac = null) {
  if (fac) { const p = fac.h('padPosition', u); return new THREE.Vector3(p.x, 0, p.z); }
  if (u.pad) return new THREE.Vector3(u.pad.x, 0, u.pad.z);
  if (u.type === 'station') { const s = L.stations[u.key]; return new THREE.Vector3(s.x, 0, s.z + L.stationPickupOffsetZ); }
  if (u.type === 'lift') { const l = L.lifts[u.index]; return new THREE.Vector3(l.x, 0, l.z); }
  return new THREE.Vector3();
}

/**
 * opts: { id (partial-payment key), pos: {x,z}, price: () => n, locked?: () => bool, onLocked?: (pad) => void,
 * label?: Tag-like (default a 'price' label; needs setRemaining?(rem, price), setProgress(k)), onPaid: (pad) => void,
 * animate, armOnLeave? }. Call pad.update(dt) every frame (true = paid this frame); pad.remove() when done.
 */
export class PayPad {
  constructor(ctx, opts) {
    this.ctx = ctx; this.opts = opts; this.id = opts.id;
    this.pos = new THREE.Vector3(opts.pos.x, 0, opts.pos.z);
    this.model = createUnlockPad();
    this.model.group.position.copy(this.pos);
    ctx.root.add(this.model.group);
    if (opts.animate) popIn(this.model.group, 1, 0.45, 0.25);
    this.ownTag = !opts.label;
    this.tag = opts.label || new Tag({ text: '', kind: 'price' }, 1.2);
    if (this.ownTag) this.tag.place(this.pos.x, 0, this.pos.z);
    this.grace = GRACE; this.acc = 0; this.tickT = 0; this.shown = null; this.done = false;
    // opts.armOnLeave: a pad that appears under the player only reacts once they have stepped off it
    this.armed = !(opts.armOnLeave && this.playerOn);
  }
  get price() { return this.opts.price(); }
  get locked() { return !!this.opts.locked?.(); }
  get paid() { return partial.get(this.id) || 0; }
  get remaining() { return Math.max(0, this.price - this.paid); }
  get playerOn() {
    const p = this.ctx.player.pos;
    return this.ctx.player.onFoot && Math.abs(p.x - this.pos.x) < HALF && Math.abs(p.z - this.pos.z) < HALF;
  }
  /** Returns true when this frame completed the payment (onPaid already called). */
  update(dt) {
    if (this.done) return false;
    if (this.ctx.near(this.pos, 2)) this.model.update(dt);
    if (this.locked !== this.wasLocked) { this.wasLocked = this.locked; this.shown = null; this.model.group.visible = true; }
    const txt = '$' + fmt(this.remaining);
    if (txt !== this.shown) {
      this.shown = txt;
      if (this.ownTag) this.tag.setText(txt); else this.tag.setRemaining?.(this.remaining, this.price);
      const pr = this.paid / Math.max(1, this.price);
      this.model.setProgress(pr); this.tag.setProgress(pr);
    }
    if (!this.playerOn) { this.grace = GRACE; this.acc = 0; this.lockedT = 0; this.armed = true; return false; }
    if (!this.armed) return false;
    if (this.grace > 0) { this.grace -= dt; return false; }
    if (this.locked) {
      // fame too low: the pad does not take money (a short buzz once per visit)
      if (!this.lockedT) { this.lockedT = 1; ui.sfx('error'); this.opts.onLocked?.(this); }
      return false;
    }
    if (state.cash < 1) { this.acc = 0; return false; }
    const rate = Math.max(this.price / ECONOMY.padDrainTime, 5);
    this.acc += rate * dt;
    const amt = Math.floor(Math.min(this.acc, this.remaining, state.cash));
    if (amt >= 1 && trySpend(amt)) {
      this.acc -= amt;
      partial.set(this.id, this.paid + amt);
      this.tickT -= dt;
      if (this.tickT <= 0) { ui.sfx('pay'); this.tickT = 0.07; }
      if (this.remaining <= 0) {
        this.done = true;
        partial.delete(this.id);
        this.model.setProgress(1);
        this.opts.onPaid(this);
        return true;
      }
    }
    return false;
  }
  remove() {
    if (this.ownTag) this.tag.remove();
    const g = this.model.group;
    popOut(g, 0.25, () => { if (g.parent) g.parent.remove(g); });
  }
}

/**
 * Unlock-chain pads of a facility: the next VISIBLE_PADS entries of chain.list not yet unlocked.
 * chain = { list, isUnlocked(id), markUnlocked(id), price(u), event } (GARAGE_DEF.unlocks / townChain(list)).
 * Paying one: markUnlocked, fac.applyUnlock(u, padPos), poof + toast + sfx, emit chain.event { id, label, facility }.
 */
export function createChainPads(ctx, fac, chain) {
  const list = [];
  const sys = {
    list,
    /** Paused chains show no pads (e.g. a facility whose building is not done yet). */
    hidden: false,
    refresh(animate) {
      const want = sys.hidden ? [] : chain.list.filter((u) => !chain.isUnlocked(u.id)).slice(0, VISIBLE_PADS);
      for (let i = list.length - 1; i >= 0; i--) {
        if (!want.includes(list[i].u)) { list[i].remove(); list.splice(i, 1); }
      }
      for (const u of want) {
        if (list.some((p) => p.u === u)) continue;
        const pad = new PayPad(ctx, {
          id: fac.id + ':' + u.id, pos: fac.h('padPosition', u), animate,
          price: () => chain.price(u),
          onPaid: () => complete(u),
        });
        pad.u = u;
        list.push(pad);
      }
    },
    update(dt) {
      for (let i = 0; i < list.length; i++) if (list[i].update(dt)) return;   // completing mutates the list
    },
    dispose() { for (const pad of list) if (pad.ownTag) pad.tag.remove(); },
  };
  function complete(u) {
    const at = padPosition(u, fac);
    chain.markUnlocked(u.id);
    sys.refresh(true);          // removes this pad and pops in the next one
    fac.applyUnlock(u, at);
    ctx.fx.poof(at, 0xf6c453);
    ui.toast(u.label);
    ui.sfx('unlock');
    events.emit(chain.event || 'unlock', { id: u.id, label: u.label, facility: fac.id });
    ctx.onChainUnlock?.(fac, u);
  }
  sys.complete = complete;
  return sys;
}

/** The garage's teal upgrade pad (opens the upgrades sheet after 0.4 s on it). */
export function createUpgradePad(ctx) {
  const up = createUpgradePadModel();
  up.group.position.set(L.upgradePad.x, 0, L.upgradePad.z);
  ctx.root.add(up.group);
  let onUpgrade = false, upDwell = 0;
  return {
    update(dt) {
      const pl = ctx.player, p = pl.pos;
      up.update(dt);
      const inU = pl.onFoot && Math.abs(p.x - L.upgradePad.x) < 0.7 && Math.abs(p.z - L.upgradePad.z) < 0.7;
      // the pad sits on the main walkway: only open the sheet after a short pause on it, not when walking across
      upDwell = inU ? upDwell + dt : 0;
      const onU = inU && (onUpgrade || upDwell >= 0.4);
      if (onU !== onUpgrade) { onUpgrade = onU; events.emit(onU ? 'upgradepad:enter' : 'upgradepad:exit'); }
    },
    dispose() { if (onUpgrade) events.emit('upgradepad:exit'); },
  };
}
