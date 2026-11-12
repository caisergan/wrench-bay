// One garage's dynamic world: everything lives under a root group that is disposed on rebuild.
import * as THREE from 'three';
import { scene } from '../core/engine.js';
import { poof } from '../models/index.js';
import { UNLOCKS, PALETTE, LAYOUT as L } from '../config.js';
import { isUnlocked, markUnlocked, nextShop, progress } from '../core/state.js';
import { events } from '../core/events.js';
import { ui } from '../ui/index.js';
import { clearTweens, tween } from './tween.js';
import { disposeTree } from './util.js';
import { createStations } from './stations.js';
import { createLifts } from './lifts.js';
import { createCars } from './cars.js';
import { createOwners } from './owners.js';
import { createStaff } from './staff.js';
import { createCashSystem } from './cash.js';
import { createPlayer } from './player.js';
import { createPads, padPosition } from './pads.js';
import { createExtras } from './extras.js';
import { createGuide } from './guide.js';

export function createWorld(game) {
  const ctx = { game, root: new THREE.Group(), obstacles: [], capsules: [], piles: [], completeShown: false };
  ctx.root.name = 'game-world';
  scene.add(ctx.root);

  ctx.cash = createCashSystem(ctx);
  ctx.extras = createExtras(ctx);
  ctx.stations = createStations(ctx);
  ctx.lifts = createLifts(ctx);
  ctx.owners = createOwners(ctx);
  ctx.cars = createCars(ctx);
  ctx.player = createPlayer(ctx);
  ctx.staff = createStaff(ctx);
  ctx.pads = createPads(ctx);
  ctx.guide = createGuide(ctx);
  // order matters: cars move first, lifts flag the player's work zone, then the player moves / works
  const systems = [ctx.cars, ctx.lifts, ctx.player, ctx.stations, ctx.owners, ctx.staff, ctx.extras, ctx.cash, ctx.pads, ctx.guide];

  /** Create the object an unlock entry stands for. `from` = pad position when it was just bought. */
  function applyUnlock(u, from) {
    const animate = !!from;
    switch (u.type) {
      case 'station': ctx.stations.add(u.key, animate); break;
      case 'lift': ctx.lifts.add(u.index, animate); break;
      case 'mechanic': ctx.staff.addMechanic(u.index, from); break;
      case 'valet': ctx.extras.addValetStand(animate); ctx.staff.addValet(from); break;
      case 'coffee': ctx.extras.addCoffee(animate); break;
      case 'billboard': ctx.extras.addBillboard(animate); break;
    }
  }
  ctx.applyUnlock = applyUnlock;

  ctx.completePad = (pad) => {
    const u = pad.u;
    const at = padPosition(u);
    markUnlocked(u.id);
    ctx.pads.refresh(true);          // removes this pad and pops in the next one
    applyUnlock(u, at);
    poof(scene, at.clone().setY(0.5), PALETTE.padFill);
    ui.toast(u.label);
    ui.sfx('unlock');
    events.emit('unlock', { id: u.id, label: u.label });
    checkComplete();
  };

  function checkComplete() {
    if (ctx.completeShown || !UNLOCKS.every((u) => isUnlocked(u.id))) return;
    ctx.completeShown = true;
    tween({
      duration: 0.01, delay: 3.0,
      onComplete: () => {
        events.emit('shop:complete', progress());
        ui.showShopComplete(() => nextShop());   // emits shop:changed -> index.js rebuilds
      },
    });
  }
  ctx.checkComplete = checkComplete;

  // driven cars additionally stay off the lounge deck (owners stand there); shares the static boxes array
  const lg = L.lounge;
  ctx.carObstacles = [{ minX: lg.minX, maxX: lg.maxX + 2, minZ: lg.minZ, maxZ: lg.maxZ }];
  const syncCarObstacles = () => { ctx.carObstacles.length = 1; for (const b of ctx.obstacles) ctx.carObstacles.push(b); };
  ctx.syncCarObstacles = syncCarObstacles;

  // initial world from the save
  ctx.stations.add('tire', false);
  ctx.lifts.add(0, false);
  for (const u of UNLOCKS) if (isUnlocked(u.id)) applyUnlock(u, null);
  ctx.pads.refresh(false);
  checkComplete();

  return {
    ctx,
    update(dt, t) {
      if (ctx.carObstacles.length !== ctx.obstacles.length + 1) syncCarObstacles();
      for (const s of systems) s.update(dt, t);
    },
    dispose() {
      clearTweens();
      for (const s of systems) s.dispose();
      scene.remove(ctx.root);
      disposeTree(ctx.root);
    },
  };
}
