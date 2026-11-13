// Pay pads. PayPad = one yellow pad that drains cash into a price while the player stands on it (on foot).
// Used by every unlock chain (garage UNLOCKS, PAINT_UNLOCKS, VIP_UNLOCKS: createChainPads) and by the town's
// property / district pads (town.js). The garage also has the teal upgrade pad (createUpgradePad).
// Every pad uses the same three steps (docs/pad-redesign, docs/upgrade-pads): a ground tag on the pad (icon + price),
// within NEAR also its name, and the pay dock at the bottom of the screen while you stand on it. Chain pads add a
// picture of what you buy on the tag, a hop when you can pay it, a "before -> after" row in the dock, and a faded
// preview of the thing standing where it will go (unlock-info.js has the words, the facility's previewModel hook
// the model).
import * as THREE from 'three';
import { createUnlockPad, createUpgradePad as createUpgradePadModel } from '../models/index.js';
import { LAYOUT as L, VISIBLE_PADS, ECONOMY } from '../config.js';
import { state, trySpend } from '../core/state.js';
import { events } from '../core/events.js';
import { ui } from '../ui/index.js';
import { popIn, popOut } from './tween.js';
import { Tag, fmt } from './util.js';
import { unlockInfo } from './unlock-info.js';

const HALF = 0.85;
const GRACE = 0.35;
const NEAR = 3.5;          // ground tags show their name (+ level) within this distance (on foot)
const DOCK_DWELL = 0.2;    // seconds on a pad before its pay dock slides in (walking across does not flash it)
const PREVIEW_NEAR = 0.3;  // opacity of a chain pad's preview while you are within NEAR ...
const PREVIEW_ON = 0.55;   // ... and while you stand on the pad
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
 * animate, armOnLeave?,
 * ground?: the label is a building pad tag lying on the pad: setNear(b) within NEAR, hidden while driving and while
 *   the player stands on the pad,
 * dock?: () => ui.payDock info; while the player stands on the pad its details sit at the bottom of the screen,
 * doneText?: () => string for the dock's "Bought!" moment,
 * canHint?: the label's setCan shows whether the cash covers what is left (icon hops / price dimmed),
 * preview?: () => { obj: Object3D, x, z, yaw? } | null; a faded copy of what the pad buys, built the first time the
 *   player comes within NEAR, shown while near (PREVIEW_NEAR) or on the pad (PREVIEW_ON), removed with the pad }.
 * Call pad.update(dt) every frame (true = paid this frame); pad.remove() when done.
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
    this.onT = 0; this.payT = 0; this.docked = false; this.isNear = false; this.tagVis = null;
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
    if (this.locked !== this.wasLocked) {
      this.wasLocked = this.locked; this.shown = null; this.model.group.visible = true;
      if (this.docked) ui.payDock.show(this.id, this.opts.dock());   // e.g. a fame level-up while standing on it
    }
    const txt = '$' + fmt(this.remaining);
    if (txt !== this.shown) {
      this.shown = txt;
      if (this.ownTag) this.tag.setText(txt); else this.tag.setRemaining?.(this.remaining, this.price);
      const pr = this.paid / Math.max(1, this.price);
      this.model.setProgress(pr); this.tag.setProgress(pr);
    }
    const on = this.playerOn;
    if (this.opts.dock || this.opts.ground) this.present(dt, on);
    if (!on) { this.grace = GRACE; this.acc = 0; this.lockedT = 0; this.armed = true; return false; }
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
      this.payT = 0.25;
      this.tickT -= dt;
      if (this.tickT <= 0) { ui.sfx('pay'); this.tickT = 0.07; }
      if (this.remaining <= 0) {
        this.done = true;
        partial.delete(this.id);
        this.model.setProgress(1);
        if (this.docked) { this.docked = false; ui.payDock.done(this.id, this.opts.doneText?.()); }
        this.opts.onPaid(this);
        return true;
      }
    }
    return false;
  }
  /** Building pads: the tag's near state / visibility and the pay dock. */
  present(dt, on) {
    const pl = this.ctx.player;
    this.onT = on && this.armed ? this.onT + dt : 0;
    this.payT = Math.max(0, this.payT - dt);
    const dock = !!this.opts.dock && this.onT >= DOCK_DWELL;
    if (dock !== this.docked) {
      this.docked = dock;
      if (dock) ui.payDock.show(this.id, this.opts.dock()); else ui.payDock.hide(this.id);
    }
    if (dock) {
      const rem = this.remaining;
      ui.payDock.update(this.id, { price: this.price, remaining: rem, paying: this.payT > 0, broke: !this.locked && rem > 0 && state.cash < 1 });
    }
    if (this.opts.ground) {
      const p = pl.pos, foot = pl.onFoot;
      const near = foot && (p.x - this.pos.x) ** 2 + (p.z - this.pos.z) ** 2 < NEAR * NEAR;
      if (near !== this.isNear) { this.isNear = near; this.tag.setNear?.(near); }
      const vis = foot && !on;          // off while driving, and while you stand on it (the dock has the details)
      if (vis !== this.tagVis) { this.tagVis = vis; this.tag.setVisible?.(vis); }
    }
    if (this.opts.canHint) this.tag.setCan?.(this.locked ? null : state.cash >= this.remaining);
    if (this.opts.preview) this.updatePreview(dt, this.docked ? PREVIEW_ON : this.isNear ? PREVIEW_NEAR : 0);
  }
  /** Fade the preview towards `target` opacity (built on first use; hidden at 0). */
  updatePreview(dt, target) {
    if (!this.preview) {
      if (!target || this.preview === null) return;
      this.preview = makePreview(this.ctx, this.opts.preview()) || null;   // null: nothing to show, don't try again
      if (!this.preview) return;
    }
    this.preview.fade(target, dt);
  }
  remove() {
    if (this.docked) { this.docked = false; ui.payDock.hide(this.id); }
    this.preview?.dispose(); this.preview = null;
    if (this.ownTag || this.opts.ownsLabel) this.tag.remove();
    const g = this.model.group;
    popOut(g, 0.25, () => { if (g.parent) g.parent.remove(g); });
  }
}

/**
 * Ground tag: a 'tag' label lying on the pad itself (icon + price; close by also the name and the level). It is never
 * drawn above the pad: the camera looks down from the south, so "above the pad" on screen is the building or the slot.
 * Exposes the PayPad label interface (setRemaining, setProgress, setVisible, setNear, setCan, remove) plus setInfo(info).
 * info: see labels.js addTagApi ({ name, icon, price, fame, locked, level, reason, up, pic, color }).
 */
export function groundTag(info, x, z) {
  const L = ui.label({ text: '', kind: 'tag', worldPos: new THREE.Vector3(x, 0.02, z) });
  let cur = { ...info };
  const lab = {
    setInfo(i) { cur = { ...cur, ...i }; L.setInfo(cur); return lab; },
    setRemaining(rem) { return lab.setInfo({ price: rem }); },
    setProgress(k) { L.setProgress?.(k); return lab; },
    setVisible(v) { L.setVisible?.(v); return lab; },
    setNear(b) { L.setNear?.(b); return lab; },
    setCan(b) { L.setCan?.(b); return lab; },
    remove() { L.remove(); },
  };
  lab.setInfo(info);
  return lab;
}

/**
 * Faded copy of what a chain pad buys, where it will stand. spec = { obj, x, z, yaw? } (facility previewModel hook).
 * Every material is cloned see-through (no depth writes, no shadows), so the real model keeps its own; the shared
 * geometry is left alone on dispose. Returns { fade(target, dt), dispose() } or null.
 */
function makePreview(ctx, spec) {
  if (!spec?.obj) return null;
  const g = spec.obj;
  g.position.set(spec.x, 0, spec.z);
  g.rotation.y = spec.yaw || 0;
  const mats = [];
  const ghost = (m) => {
    const c = m.clone();
    c.transparent = true; c.depthWrite = false; c.opacity = 0;
    mats.push({ m: c, k: m.transparent ? m.opacity : 1 });
    return c;
  };
  g.traverse((o) => {
    if (!o.material) return;
    o.castShadow = false; o.receiveShadow = false;
    o.material = Array.isArray(o.material) ? o.material.map(ghost) : ghost(o.material);
    o.renderOrder = 4;
  });
  g.visible = false;
  ctx.root.add(g);
  let a = 0;
  return {
    fade(target, dt) {
      if (a === target && g.visible === a > 0) return;
      a += (target - a) * Math.min(1, dt * 8);
      if (Math.abs(target - a) < 0.005) a = target;
      g.visible = a > 0;
      if (g.visible) for (const e of mats) e.m.opacity = a * e.k;
    },
    dispose() {
      if (g.parent) g.parent.remove(g);
      for (const e of mats) e.m.dispose();
    },
  };
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
        const pos = fac.h('padPosition', u), info = unlockInfo(fac.id, u);
        const tag = groundTag({ name: info.name, icon: info.icon, color: info.color, up: info.kind === 'up', pic: true, price: chain.price(u) }, pos.x, pos.z);
        const pad = new PayPad(ctx, {
          id: fac.id + ':' + u.id, pos, animate,
          price: () => chain.price(u),
          label: tag, ownsLabel: true, ground: true, canHint: true,
          dock: () => ({
            kind: info.kind, icon: info.icon, iconColor: info.color, pic: true, name: info.name, rib: info.rib,
            what: info.what, change: info.change, levels: 0, owned: 0, price: pad.price, fame: 0, fameOk: true,
          }),
          doneText: () => info.done,
          preview: () => fac.h('previewModel', u),
          onPaid: () => complete(u),
        });
        pad.u = u;
        list.push(pad);
      }
    },
    update(dt) {
      for (let i = 0; i < list.length; i++) if (list[i].update(dt)) return;   // completing mutates the list
    },
    dispose() {
      for (const pad of list) {
        if (pad.docked) ui.payDock.hide(pad.id);
        pad.preview?.dispose();
        pad.tag.remove();
      }
    },
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
