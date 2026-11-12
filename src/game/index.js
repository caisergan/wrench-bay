// Gameplay entry: one rebuildable world per garage (the static environment is built by main.js).
import { onUpdate } from '../core/engine.js';
import { events } from '../core/events.js';
import { state, addCash, isUnlocked, markUnlocked } from '../core/state.js';
import { UNLOCKS } from '../config.js';
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
    get timeScale() { return dbg.timeScale; },
    set timeScale(v) { dbg.timeScale = v; },
    state,
    start,
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
  };
}
