// One garage's dynamic world: everything lives under a root group that is disposed on rebuild (shop:changed).
// ctx is the shared gameplay context every system receives (TOWN.md section 6a documents its fields).
import * as THREE from 'three';
import { scene, camTarget, viewReach, setCameraLead, setCameraZoom } from '../core/engine.js';
import * as M from '../models/index.js';
import { UNLOCKS, LAYOUT as L, TOWN } from '../config.js';
import { state, isUnlocked, save, townOpen } from '../core/state.js';
import { events } from '../core/events.js';
import { ui } from '../ui/index.js';
import { clearTweens, tween } from './tween.js';
import { disposeTree } from './util.js';
import { createCashSystem } from './cash.js';
import { createPlayer } from './player.js';
import { createUpgradePad } from './pads.js';
import { createExtras } from './extras.js';
import { createGuide } from './guide.js';
import { createFacility, GARAGE_DEF } from './facility.js';
import { createVehicles } from './vehicles.js';
import { createTown } from './town.js';
import { createPointers } from './pointers.js';
import { systems as featureSystems, facilityDefs } from './registry.js';
import './features.js';

export function createWorld(game) {
  const ctx = {
    game, root: new THREE.Group(),
    obstacles: [],         // static boxes { minX, maxX, minZ, maxZ } (player, driven cars, vehicles collide)
    capsules: [],          // dynamic capsules, rebuilt every frame (cars, vehicles, capsuleSources)
    capsuleSources: [],    // fn(out) pushing extra capsules every frame (towed cars, traffic ...)
    movers: [],            // { pos, radius, hidden? } AI customer cars brake / honk for (vehicles, traffic ...)
    piles: [],             // cash piles the player collects by walking past
    allCars: [],           // every customer car of every facility
    facilities: {},        // id -> facility (garage always; paint / vip / test when they exist)
    facilityList: [],
    completeShown: false,
    obstaclesVersion: 0,   // bump after removing obstacles (ctx.solids.remove does)
  };
  ctx.root.name = 'game-world';
  scene.add(ctx.root);

  // ---- helpers every system may use
  /** Walk / drive bounds: the lot until the town opens, then TOWN.bounds (town.js switches it). */
  ctx.bounds = L.bounds;
  /** Is pos (x, z) on or close to the screen? r = extra margin (units). Use to skip animation / labels / sfx.
   *  The reach comes from the engine: 12 / 22 / 11 in the phone frame, much wider in the browser view. */
  ctx.near = (pos, r = 0) => Math.abs(pos.x - camTarget.x) < viewReach.x + r
    && pos.z > camTarget.z - viewReach.back - r && pos.z < camTarget.z + viewReach.front + r;
  ctx.solids = {
    /** Add a static obstacle box; returns it (keep it to remove it later). */
    add(box) { ctx.obstacles.push(box); return box; },
    remove(box) { const i = ctx.obstacles.indexOf(box); if (i >= 0) { ctx.obstacles.splice(i, 1); ctx.obstaclesVersion++; } },
  };
  /** Camera helpers: lead(x, z, zoom) looks ahead of a vehicle (eased); lead(0, 0, 1) = back to normal. */
  ctx.cam = {
    lead(x = 0, z = 0, zoom = 1) { setCameraLead(x, z); setCameraZoom(zoom); },
    reset() { setCameraLead(0, 0); setCameraZoom(1); },
  };
  const _fx = new THREE.Vector3();
  /** fx helpers bound to the scene; every one is optional in models (missing ones are skipped). */
  ctx.fx = {
    poof: (p, color) => M.poof(scene, _fx.set(p.x, (p.y || 0) + 0.5, p.z), color),
    confetti: (p) => M.confetti(scene, _fx.set(p.x, (p.y || 0) + 1.2, p.z)),
    sparks: (p) => M.sparks(scene, _fx.set(p.x, p.y || 0.8, p.z)),
    dust: (p) => (M.dust ? M.dust(scene, _fx.set(p.x, p.y || 0.3, p.z)) : M.poof(scene, _fx.set(p.x, 0.4, p.z), 0xcdbf9f)),
    sparkle: (p) => M.sparkle?.(scene, _fx.set(p.x, p.y || 1, p.z)),
  };

  ctx.cash = createCashSystem(ctx);
  ctx.extras = createExtras(ctx);

  // ---- facilities
  ctx.addFacility = (def) => {
    if (ctx.facilities[def.id]) return ctx.facilities[def.id];
    const fac = createFacility(ctx, def);
    ctx.facilities[def.id] = fac;
    ctx.facilityList.push(fac);
    return fac;
  };
  ctx.removeFacility = (id) => {
    const fac = ctx.facilities[id];
    if (!fac) return;
    fac.dispose();
    delete ctx.facilities[id];
    ctx.facilityList.splice(ctx.facilityList.indexOf(fac), 1);
  };
  const garage = ctx.addFacility(GARAGE_DEF);
  // legacy aliases: the garage's systems
  ctx.cars = garage.cars; ctx.lifts = garage.bays; ctx.stations = garage.stations;
  ctx.owners = garage.owners; ctx.staff = garage.staff; ctx.pads = garage.pads;

  ctx.player = createPlayer(ctx);
  ctx.upgradePad = createUpgradePad(ctx);
  ctx.pointers = createPointers(ctx);
  ctx.vehicles = createVehicles(ctx);
  ctx.town = createTown(ctx);
  ctx.guide = createGuide(ctx);

  /** Legacy: create what a garage unlock entry stands for. */
  ctx.applyUnlock = (u, from) => garage.applyUnlock(u, from);

  function checkComplete() {
    if (ctx.completeShown || !UNLOCKS.every((u) => isUnlocked(u.id))) return;
    ctx.completeShown = true;
    if (state.town.garageDone) return;     // celebrated once per save; no reset any more (the ferry does that)
    tween({
      duration: 0.01, delay: 3.0,
      onComplete: () => {
        state.town.garageDone = true;
        save();
        events.emit('garage:complete');
        if (ui.showGarageComplete) ui.showGarageComplete();
        else ui.toast('Garage complete! The town is yours to explore');
      },
    });
  }
  ctx.checkComplete = checkComplete;
  ctx.onChainUnlock = (fac, u) => {
    if (fac.id !== 'garage') return;
    checkComplete();
    ctx.town.checkOpen();
  };
  /** Legacy pad completion entry point (kept for callers of the old API). */
  ctx.completePad = (pad) => garage.pads.complete(pad.u);

  // driven cars additionally stay off the lounge deck (owners stand there); shares the static boxes array
  const lg = L.lounge;
  ctx.carObstacles = [{ minX: lg.minX, maxX: lg.maxX + 2, minZ: lg.minZ, maxZ: lg.maxZ }];
  let carObsVersion = -1;
  const syncCarObstacles = () => {
    ctx.carObstacles.length = 1;
    for (const b of ctx.obstacles) ctx.carObstacles.push(b);
    carObsVersion = ctx.obstaclesVersion;
  };
  ctx.syncCarObstacles = syncCarObstacles;

  // facilities that exist from the start without a property (debug / test instances registered with `always`)
  for (const id in facilityDefs) if (facilityDefs[id].always?.()) ctx.addFacility(facilityDefs[id]);
  ctx.town.build();         // properties, buildings, property systems, facilities with a property, town bounds
  checkComplete();

  // feature systems (registry.js)
  const features = [];
  for (const s of featureSystems) {
    try { const sys = s.factory(ctx); if (sys) { features.push(sys); ctx[s.id] ??= sys; } } catch (err) { console.error('[wrench-bay] feature', s.id, err); }
  }

  const caps = ctx.capsules;
  function rebuildCapsules() {
    caps.length = 0;
    const cars = ctx.allCars;
    for (let i = 0; i < cars.length; i++) if (cars[i].mode !== 'gone') caps.push(cars[i].capsule);
    ctx.vehicles.pushCapsules(caps);
    for (const fn of ctx.capsuleSources) fn(caps);
  }

  const facs = ctx.facilityList;
  return {
    ctx,
    update(dt, t) {
      if (ctx.carObstacles.length !== ctx.obstacles.length + 1 || carObsVersion !== ctx.obstaclesVersion) syncCarObstacles();
      for (let i = 0; i < facs.length; i++) facs[i].cars.update(dt, t);
      rebuildCapsules();
      M.updateLeaks(dt);   // oil drops + spots on the floor (they outlive the car that left them)
      // order matters: cars move first, bays flag the player's work zone, then the player moves / works
      ctx.player.workLift = null;
      ctx.player.working = false;
      for (let i = 0; i < facs.length; i++) facs[i].bays.update(dt, t);
      ctx.player.update(dt, t);
      ctx.vehicles.update(dt, t);
      for (let i = 0; i < facs.length; i++) facs[i].stations.update(dt, t);
      for (let i = 0; i < facs.length; i++) facs[i].owners.update(dt, t);
      for (let i = 0; i < facs.length; i++) facs[i].staff.update(dt, t);
      ctx.extras.update(dt, t);
      ctx.cash.update(dt, t);
      for (let i = 0; i < facs.length; i++) facs[i].pads?.update(dt, t);
      ctx.upgradePad.update(dt, t);
      ctx.town.update(dt, t);
      for (let i = 0; i < features.length; i++) features[i].update?.(dt, t);
      ctx.guide.update(dt, t);
      ctx.pointers.update(dt, t);
    },
    dispose() {
      clearTweens();
      for (const f of features) f.dispose?.();
      ctx.guide.dispose();
      ctx.town.dispose();
      ctx.vehicles.dispose();
      for (const fac of facs.slice()) fac.dispose();
      ctx.player.dispose();
      ctx.upgradePad.dispose();
      ctx.extras.dispose();
      ctx.cash.dispose();
      ctx.pointers.dispose();
      ctx.cam.reset();
      scene.remove(ctx.root);
      disposeTree(ctx.root);
    },
  };
}

export { TOWN, townOpen };
