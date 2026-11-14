// Gameplay entry: one rebuildable world per garage (the static environment is built by main.js).
import * as engine from '../core/engine.js';
import { onUpdate } from '../core/engine.js';
import { events } from '../core/events.js';
import { state, addCash, isUnlocked, markUnlocked, openTown, openDistrict, addFame, fameNeed, fameLevel } from '../core/state.js';
import { UNLOCKS, PROPERTIES, SERVICES, DISTRICTS, TOWN } from '../config.js';
import { createWorld } from './world.js';
import { updateTweens } from './tween.js';
import { resetPartialPayments, padPosition } from './pads.js';

export function initGame() {
  const game = { started: false };
  let world = createWorld(game);

  function start() {
    if (game.started) return;
    game.started = true;
    state.tutorialDone = true;
    events.emit('game:started');
  }
  events.on('ui:play', start);
  const params = new URLSearchParams(location.search);
  if (params.has('autoplay') || state.tutorialDone) start();

  events.on('shop:changed', () => {
    world.dispose();
    resetPartialPayments();
    world = createWorld(game);
    // nextShop() resets state.cash without an event: resync the HUD
    events.emit('cash:changed', { cash: state.cash, delta: 0 });
  });

  const dbg = { timeScale: 1 };
  onUpdate((dt, t) => {
    // debug: __game.timeScale = 4 runs 4 simulation steps per frame
    const n = Math.max(1, Math.min(8, dbg.timeScale | 0));
    for (let i = 0; i < n; i++) {
      updateTweens(dt);
      world.update(dt, t);
    }
  });

  function unlock(u, animate = true) {
    if (isUnlocked(u.id)) return;
    const ctx = world.ctx;
    markUnlocked(u.id);
    ctx.applyUnlock(u, animate ? padPosition(u) : null);
    events.emit('unlock', { id: u.id, label: u.label });
  }

  // debugging helpers
  window.__game = {
    get world() { return world.ctx; },
    get player() { return world.ctx.player; },
    get cars() { return world.ctx.cars.list; },
    get lane() { return world.ctx.cars.lane; },
    get lifts() { return world.ctx.lifts.list; },
    get stations() { return world.ctx.stations.list; },
    get staff() { return world.ctx.staff; },
    get owners() { return world.ctx.owners.list; },
    get pads() { return world.ctx.pads.list; },
    /** The live engine module (camera, renderer, scene, setPaused ...): importing it again from the console gives a copy. */
    engine,
    get timeScale() { return dbg.timeScale; },
    set timeScale(v) { dbg.timeScale = v; },
    state,
    start,
    /**
     * Rebuild the dynamic world from the save, as the ferry does (dev tool: after editing unlocks, properties, fame).
     * A player on foot keeps their spot.
     */
    rebuild() {
      const p = world.ctx.player;
      const at = p.mode === 'foot' ? { x: p.pos.x, z: p.pos.z } : null;
      events.emit('shop:changed');
      if (at) world.ctx.player.teleport(at.x, at.z);
    },
    teleport(x, z) { world.ctx.player.teleport(x, z); },
    giveCash(n) { addCash(n); },
    /** opts: { vip, type, problems: ['tire', ...] } */
    spawnCar(opts = {}) { return world.ctx.cars.spawn(opts, true); },
    /** Unlock the next n entries (default: all, which triggers "garage complete"). */
    unlockAll(n = UNLOCKS.length) {
      let k = 0;
      for (const u of UNLOCKS) { if (k >= n) break; if (!isUnlocked(u.id)) { unlock(u); k++; } }
      world.ctx.pads.refresh(true);
      world.ctx.checkComplete();
    },
    unlock(id) {
      const u = UNLOCKS.find((x) => x.id === id);
      if (u) { unlock(u); world.ctx.pads.refresh(true); world.ctx.checkComplete(); }
    },

    // ---- Harbor Town (TOWN.md 6a)
    get town() { return world.ctx.town; },
    get vehicles() { return world.ctx.vehicles.list; },
    get facilities() { return world.ctx.facilities; },
    /** Open the town now (no need for valet + mechanic). */
    openTown() { return openTown(); },
    /** Add n fame levels (default 1). giveFame(0, xp) adds raw XP. */
    giveFame(n = 1, xp = 0) {
      if (xp) addFame(xp);
      for (let i = 0; i < n; i++) {
        const lv = fameLevel();
        let need = 0, x = state.town.fameXp;
        for (let L = 0; L <= lv; L++) need += fameNeed(L);
        addFame(Math.max(1, need - x) / (1 + (state.town.pro.renown | 0) * 0.15));
      }
      return fameLevel();
    },
    /** Next level of a property for free (same path as paying: site, building, systems). */
    buy(id) { if (!state.town.open) openTown(); return world.ctx.town.buy(id); },
    openDistrict(id = 'main') { if (!state.town.open) openTown(); return openDistrict(id); },
    /** Facility chain unlock(s): an id ('paint_lime') or the next n entries of a facility (default 'paint'). */
    unlockTown(idOrN = 1, facilityId = 'paint') {
      const facs = world.ctx.facilityList;
      if (typeof idOrN === 'string') {
        for (const f of facs) { const u = f.def.unlocks?.list.find((x) => x.id === idOrN); if (u && f.pads) { if (!f.def.unlocks.isUnlocked(u.id)) f.pads.complete(u); return true; } }
        return false;
      }
      const f = world.ctx.facilities[facilityId];
      if (!f || !f.pads) return 0;
      let k = 0;
      for (const u of f.def.unlocks.list) { if (k >= idOrN) break; if (!f.def.unlocks.isUnlocked(u.id)) { f.pads.complete(u); k++; } }
      return k;
    },
    /** Teleport next to a place: property / service / district id, a parking bay id, 'garage', or {x, z}. */
    tp(place = 'garage') {
      const pl = world.ctx.player;
      if (pl.mode !== 'foot') return false;
      let p = null;
      if (typeof place === 'object') p = place;
      else if (place === 'garage') p = { x: 0, z: 2.4 };
      else p = world.ctx.town.padPos(place) || TOWN.parking.find((b) => b.id === place) || null;
      if (!p) return false;
      pl.teleport(p.x + 1.2, p.z + 1.2);
      return true;
    },
    /** Get into a player vehicle wherever it is (debug). */
    drive(id = 'tow') {
      const v = world.ctx.vehicles.get(id), pl = world.ctx.player;
      if (!v || pl.mode !== 'foot' || v.mode !== 'parked') return false;
      pl.teleport(v.pos.x, v.pos.z + 0.01);
      return pl.enterVehicle(v);
    },
    places: () => [...Object.keys(PROPERTIES), ...Object.keys(SERVICES), ...Object.keys(DISTRICTS), ...TOWN.parking.map((b) => b.id)],
  };
}
