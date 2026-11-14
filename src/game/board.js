// Upgrade board (docs/central-upgrades): one per workshop. Wrench Bay: the teal pad in the middle of the floor
// (LAYOUT.upgradePad); Spray Bay: the same pad inside the colour lab (PAINT.board). The workshop's unlock chain is no
// longer paid on a pad by each thing: standing on the board pad opens the board sheet (ui/board.js) with the next
// VISIBLE_PADS chain entries for sale, the rest of the plan, and the shared boosts (UPGRADES).
//
// Buying an unlock (the player holds the key in the sheet) pays and saves at once, then the reveal runs here: the
// sheet dips, the camera glides to where the thing goes, it pops in (poof, confetti, toast, the chain event), the
// camera comes back and the sheet rises with the next entry. A tap anywhere skips the reveal (api.skip()).
//
// createChainBoard(ctx, fac, chain): stands in for createChainPads (pads.js) for a facility with a board. Same API
//   (list stays empty, hidden, refresh, update, dispose, complete(u)); complete(u) unlocks at once, without the
//   reveal (dev tools, legacy callers).
// createBoard(ctx, fac): the pad, its ground tag (arrow + how many things you can afford now; the name only within
//   NEAR, hidden while you stand on it), the sheet's open / close events and the reveal.
//
// Events: 'board:open' (api) and 'board:close' ({ id }) to the sheet; 'board:reveal' ({ id, phase: 'dip' | 'rise',
// u }) while an unlock is revealed; 'board:changed' ({ id }) when the chain changed outside the sheet. From the sheet:
// 'board:frame' ({ id, top }: the sheet's top edge as a fraction of the screen height, to lift the camera) and
// 'board:dismiss' ({ id }: the close button; the board stays shut until the player steps off and on again).
import * as THREE from 'three';
import { createUpgradePad } from '../models/index.js';
import { VISIBLE_PADS, UPGRADES } from '../config.js';
import { state, trySpend, buyUpgrade, upgradeCost } from '../core/state.js';
import { events } from '../core/events.js';
import { ui } from '../ui/index.js';
import { padPosition } from './pads.js';
import { unlockInfo } from './unlock-info.js';

const HALF = 0.7;          // standing within this of the pad centre (on foot) counts as on it
const DWELL = 0.4;         // the pad sits on a walkway: the sheet opens after a short pause on it, not when walking past
const NEAR = 3.5;          // the ground tag shows its name within this distance
const TAG_DZ = 0.95;       // the tag lies just south of the pad, so the pad's arrow stays visible
// reveal timeline (s after the purchase): stamp on the card -> sheet dips + camera glides -> pop -> camera back -> rise
const T_DIP = 0.55, T_POP = 1.3, T_BACK = 2.5, T_RISE = 3.0;

/** The world side of one unlock: the thing appears where it goes (popping in), poof, confetti, toast, events. */
export function revealUnlock(ctx, fac, chain, u) {
  const at = padPosition(u, fac);
  fac.applyUnlock(u, at);
  ctx.fx.poof(at, 0xf6c453);
  ctx.fx.confetti(at);
  ui.toast(u.label);
  ui.sfx('unlock');
  events.emit(chain.event || 'unlock', { id: u.id, label: u.label, facility: fac.id });
  ctx.onChainUnlock?.(fac, u);
}

/** Chain stand-in for a facility with a board: no pads on the floor. */
export function createChainBoard(ctx, fac, chain) {
  return {
    list: [],
    hidden: false,
    refresh() { events.emit('board:changed', { id: fac.id }); },
    update() {},
    dispose() {},
    /** Unlock u now (no payment, no reveal): dev tools and legacy callers. */
    complete(u) {
      if (chain.isUnlocked(u.id)) return;
      chain.markUnlocked(u.id);
      revealUnlock(ctx, fac, chain, u);
      events.emit('board:changed', { id: fac.id });
    },
  };
}

/** The board pad of a facility. fac.def.board = { at: { x, z }, name, icon (ICON key, the Build tab), and the words the
 *  boosts use there: carry ('parts'), staff ('mechanics'), job ('repair'), refill ('shelf refills') }. */
export function createBoard(ctx, fac) {
  const B = fac.def.board, chain = fac.def.unlocks;
  const pos = new THREE.Vector3(B.at.x, 0, B.at.z);
  const model = createUpgradePad();
  model.group.position.copy(pos);
  ctx.root.add(model.group);
  const tag = ui.label({ kind: 'tag', worldPos: new THREE.Vector3(pos.x, 0.02, pos.z + TAG_DZ) });
  const TAG = { name: 'Upgrades', icon: 'arrowUp', up: true, board: true, count: 0 };
  tag.setInfo(TAG);

  let on = false, dwell = 0, open = false, near = null, vis = null, count = -1;
  let reveal = null;        // { u, t, at, dipped, popped, back }

  const forSale = () => {
    const out = [];
    for (const u of chain.list) { if (!chain.isUnlocked(u.id)) { out.push(u); if (out.length >= VISIBLE_PADS) break; } }
    return out;
  };
  const canBuild = () => { let n = 0; for (const u of forSale()) if (state.cash >= chain.price(u)) n++; return n; };
  const canBoost = () => { let n = 0; for (const k in UPGRADES) if (state.upgrades[k] < UPGRADES[k].max && state.cash >= upgradeCost(k)) n++; return n; };

  /** What the sheet reads and calls (ui/board.js). */
  const api = {
    id: fac.id, name: B.name, icon: B.icon, carry: B.carry, staff: B.staff, job: B.job, refill: B.refill,
    /** Every chain entry in buying order: { id, info (unlock-info.js), price, own, sale }. */
    plan() {
      const sale = forSale();
      return chain.list.map((u) => ({ id: u.id, label: u.label, info: unlockInfo(fac.id, u), price: chain.price(u), own: chain.isUnlocked(u.id), sale: sale.includes(u) }));
    },
    get revealing() { return !!reveal; },
    /** Pay for a chain entry that is for sale and start its reveal. False: not for sale / can't pay / busy. */
    buy(id) {
      if (reveal) return false;
      const u = forSale().find((x) => x.id === id);
      if (!u || !trySpend(chain.price(u))) return false;
      chain.markUnlocked(u.id);                       // saves
      reveal = { u, t: 0, at: padPosition(u, fac), dipped: false, popped: false, back: false };
      return true;
    },
    /** Buy one level of a boost; a sparkle on the player. */
    boost(key) {
      if (!buyUpgrade(key)) return false;
      const p = ctx.player.pos;
      ctx.fx.sparkle({ x: p.x, y: 1.3, z: p.z });
      return true;
    },
    /** Finish the reveal now (a tap during it). */
    skip() { if (reveal) step(99); },
  };

  function openSheet() { open = true; events.emit('board:open', api); }
  function closeSheet() {
    if (!open) return;
    open = false;
    ctx.cam.lift(null);
    events.emit('board:close', { id: fac.id });
  }
  const offs = [
    events.on('board:frame', (e) => { if (e?.id === fac.id && open && !reveal) ctx.cam.lift(Math.max(0.2, e.top - 0.06)); }),
    events.on('board:dismiss', (e) => { if (e?.id === fac.id) closeSheet(); }),
  ];

  /** Advance the reveal by dt (dt = 99: run it to the end now). */
  function step(dt) {
    const r = reveal;
    r.t += dt;
    if (!r.dipped && r.t >= T_DIP) {
      r.dipped = true;
      events.emit('board:reveal', { id: fac.id, phase: 'dip', u: r.u });
      if (dt < 99) ctx.cam.focus(r.at);
    }
    if (!r.popped && r.t >= T_POP) { r.popped = true; revealUnlock(ctx, fac, chain, r.u); }
    if (!r.back && r.t >= T_BACK) { r.back = true; ctx.cam.focus(null); }
    if (r.t >= T_RISE) {
      reveal = null;
      events.emit('board:reveal', { id: fac.id, phase: 'rise', u: r.u });
      if (!open) ctx.cam.lift(null);
    }
  }

  return {
    pos,
    /** Chain entries for sale you can pay right now (the tutorial arrow points here when > 0). */
    get buildable() { return canBuild(); },
    get isOpen() { return open; },
    api,
    update(dt) {
      const pl = ctx.player, p = pl.pos, foot = pl.onFoot;
      if (ctx.near(pos, 2)) model.update(dt);
      if (reveal) step(dt);
      const dx = p.x - pos.x, dz = p.z - pos.z;
      const inside = foot && Math.abs(dx) < HALF && Math.abs(dz) < HALF;
      dwell = inside ? dwell + dt : 0;
      const want = inside && (on || dwell >= DWELL);
      if (want !== on) { on = want; if (on) openSheet(); else closeSheet(); }
      // ground tag: arrow + how many things you can afford; the name close by; hidden while driving / on the pad
      const n = canBuild() + canBoost();
      if (n !== count) { count = n; TAG.count = n; tag.setInfo(TAG); tag.setCan(n > 0 ? true : null); }
      const nr = foot && dx * dx + (dz - TAG_DZ) * (dz - TAG_DZ) < NEAR * NEAR;
      if (nr !== near) { near = nr; tag.setNear(nr); }
      const v = foot && !inside;
      if (v !== vis) { vis = v; tag.setVisible(v); }
    },
    dispose() {
      for (const off of offs) off();
      // a reveal cut short by a rebuild: the unlock is saved already, and the next world builds it from the save
      if (reveal) { reveal = null; ctx.cam.focus(null); events.emit('board:reveal', { id: fac.id, phase: 'rise' }); }
      closeSheet();
      tag.remove();
      if (model.group.parent) model.group.parent.remove(model.group);
    },
  };
}
