// Car wash "Suds & Shine" (TOWN.md 4.6): a drive-through on the garden block, east of the garage exit driveway.
// Exists while the 'wash' property is built (registerPropertySystem). Behaviour:
//   - dirt: WASH.dirtyChance of the garage's arriving cars are dirty (setDirt), rolled while the car is still off
//     screen (in the tunnel mouth), only while the wash exists, so a garage without it looks exactly as before;
//   - who washes: level 1 only dirty cars, from WASH.cleanCarsFromLevel every leaving car (garage only);
//   - route: lift -> exit lane -> pickupStop (owner boards, as before) -> fac.hooks.leave hands the car to us ->
//     on along the exit lane past the exit driveway -> pay kiosk (stop) -> through the tunnel at slowSpeed
//     (soap -> brushes -> rinse -> blower) -> east alley -> Harbor St -> east tunnel ('exiting', like every car);
//   - queue: one car approaching / paying at a time; a paid car enters the tunnel only when the one ahead is
//     WASH.gap on (traffic light at the entry). A car that wants a wash while the kiosk is taken waits at the
//     pickup stop with its owner aboard; cars behind it wait too (car.holding: they never ghost through it);
//   - effects in the physically right order: foam builds after the soap arch, the mud comes off at the brushes,
//     the rinse washes foam and dust away and leaves the car wet, the blower dries it, then it shines (wax tier:
//     tri-colour foam + a gloss; turbo tier: the model's big blower and neon, +1 fame per car);
//   - money: washFee(tier) lands as coins on WASH.pile when the car leaves the blower ("+$18 Wash"),
//     state.town.stats.washes++, event wash:done { total }; offline income counts washes too.
// Car modes used here: 'washWait' (held at the pickup stop), 'washDrive' (driven by this system).
import * as THREE from 'three';
import * as M from '../models/index.js';
import { WASH, TOWN, ECONOMY } from '../config.js';
import {
  state, propLevel, washFee, addFame, isUnlocked, mechanicCount, liftCount, addOfflineSource,
} from '../core/state.js';
import { events } from '../core/events.js';
import { ui } from '../ui/index.js';
import { registerPropertySystem } from './registry.js';
import { CashPile } from './cash.js';

const HALF_LEN = 1.35;                      // car centre -> bumper (CAR.length 2.8)
const _v = new THREE.Vector3();

/** Who takes a wash: from cleanCarsFromLevel every car, before that only dirty ones. */
export function wantsWash(car, level = propLevel('wash')) {
  if (!level || !car || car.fac?.id !== 'garage') return false;
  return level >= WASH.cleanCarsFromLevel || (car.washDirt || 0) > 0.05;
}

// Offline: every garage car the crew finishes while you are away pays its wash too (same car rate as the garage's
// own offline estimate: one crew ~ one car per 14 s).
addOfflineSource(() => {
  const lvl = propLevel('wash');
  if (!lvl || !isUnlocked('valet')) return 0;
  const crews = Math.min(mechanicCount(), liftCount());
  if (!crews) return 0;
  const share = lvl >= WASH.cleanCarsFromLevel ? 1 : WASH.dirtyChance;
  return (crews / 14) * share * washFee(1.3) * ECONOMY.offlineEfficiency;
});

registerPropertySystem('wash', (ctx, prop) => {
  const garage = ctx.facilities.garage;
  if (!garage) return null;
  const ST = WASH.stations, T = WASH.tunnel, K = WASH.kioskStop, Z = WASH.laneZ;
  const list = [];            // cars we handle, in arrival order
  const xs = [];              // car x positions for the model (reused, no per-frame allocation)
  const pile = new CashPile(ctx, WASH.pile.x, 0, WASH.pile.z, {
    radius: 1.05, scale: 1.6, cap: 30, make: M.createCoinStack ? () => M.createCoinStack() : undefined,
  });

  // ---- the leave hook: a leaving garage car that wants a wash is ours from the pickup stop on
  const prevLeave = garage.hooks.leave;
  const leave = (fac, car) => {
    if (!wantsWash(car)) return prevLeave ? prevLeave(fac, car) : false;
    car.mode = 'washWait';
    car.holding = true;
    car.wash = { phase: 'wait', t: 0, foam: false, scrub: false, rinse: false, dry: false };
    list.push(car);
    return true;
  };
  garage.hooks.leave = leave;

  const tier = () => Math.max(1, propLevel('wash'));
  const inPhase = (p) => list.some((c) => c.wash.phase === p);
  /** Is anything still in the first `len` m of the tunnel (measured from the kiosk stop)? */
  const tunnelBusy = (len) => list.some((c) => c.wash.phase === 'tunnel' && c.pos.x < K.x + len);

  function startApproach(car) {
    car.wash.phase = 'approach';
    car.mode = 'washDrive';
    car.setPath(WASH.approach.map((p) => ({ x: p.x, z: p.z })), { restYaw: Math.PI / 2, maxSpeed: 3.6 });
    if (ctx.near(car.pos)) ui.sfx('engine');
  }
  function startTunnel(car) {
    car.wash.phase = 'tunnel';
    car.setPath([{ x: T.maxX + 0.9, z: Z }, { x: T.maxX + 1.8, z: Z }], { restYaw: Math.PI / 2, maxSpeed: WASH.slowSpeed });
  }
  function leaveWash(car) {
    car.wash.phase = 'out';
    car.holding = false;
    car.mode = 'exiting';
    const pts = WASH.exit.map((p) => ({ x: p.x, z: p.z }));
    const last = pts[pts.length - 1];
    pts.push({ x: TOWN.edge.eastX, z: last.z });
    car.setPath(pts);
  }

  /** Car effects by where its body is (front / centre / rear against each station). */
  function effects(car) {
    const w = car.wash, m = car.model, x = car.pos.x, front = x + HALF_LEN, rear = x - HALF_LEN;
    const near = ctx.near(car.pos, 2);
    if (!w.foam && front >= ST.soap) {
      w.foam = true;
      m.setFoam?.(1, { tri: tier() >= 2 });
      if (near) ui.sfx('wash');
    }
    if (!w.scrub && front >= ST.brush + 0.2) {
      w.scrub = true;                                   // the brushes take the mud off; the dust film waits for the rinse
      if ((car.washDirt || 0) > 0.38) m.setDirt?.(0.2);
    }
    if (!w.rinse && x >= ST.rinse) {
      w.rinse = true;
      m.setFoam?.(0);
      m.setDirt?.(0);
      m.setWet?.(true);
      car.washDirt = 0;
      if (near) ui.sfx('wash');
    }
    if (!w.dry && x >= ST.dryer) {
      w.dry = true;
      m.setWet?.(false);
    }
    if (w.phase === 'tunnel' && rear >= ST.dryer + 0.25) finish(car);
  }

  /** Out of the blower: clean, shine (wax: gloss), coins on the pile, stats + event. */
  function finish(car) {
    const lvl = tier();
    car.model.setShine?.(true);
    if (lvl >= 2) car.model.setGloss?.([0.95, 0.95, 0.95, 0.95]);
    const total = washFee(car.tier || 1);
    if (total > 0) {
      _v.set(car.pos.x, 1.0, car.pos.z + 0.4);
      const n = Math.max(1, Math.min(4, Math.round(total / 15)));
      for (let i = 0; i < n; i++) pile.add(total / n, _v, i * 0.08);
      if (ctx.near(_v, 2)) {
        ui.floatText(_v.set(WASH.pile.x, 1.6, WASH.pile.z), '+$' + ui.fmt(total) + ' Wash', 'cash');
        ui.sfx('coins');
      }
    }
    state.town.stats.washes = (state.town.stats.washes || 0) + 1;
    if (lvl >= 3) addFame('washT3', car.pos);
    events.emit('wash:done', { total });
    leaveWash(car);
  }

  // ---- dirt on arriving garage cars (rolled while they are still off screen)
  function rollDirt() {
    const cars = garage.cars.list;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (c.washDirt !== undefined) continue;
      c.washDirt = 0;
      if (ctx.near(c.pos, 3) || Math.random() >= WASH.dirtyChance) continue;
      c.washDirt = 0.3 + Math.random() * 0.7;
      c.model.setDirt?.(c.washDirt);
    }
  }

  function update(dt) {
    if (typeof window !== 'undefined' && window.__game && window.__game.wash !== api) window.__game.wash = api;
    rollDirt();
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      if (c.mode === 'gone' || !c.wash || c.wash.phase === 'out') list.splice(i, 1);
    }
    // the kiosk is free when nobody approaches / pays and the last car into the tunnel has started rolling
    if (!inPhase('approach') && !inPhase('pay') && !tunnelBusy(1.2)) {
      const next = list.find((c) => c.wash.phase === 'wait');
      if (next) startApproach(next);
    }
    let held = false;
    for (let i = 0; i < list.length; i++) {
      const c = list[i], w = c.wash;
      switch (w.phase) {
        case 'wait': c.coast(dt); break;
        case 'approach':
          if (c.drive(dt)) { w.phase = 'pay'; w.t = 0; c.speed = 0; if (ctx.near(c.pos)) ui.sfx('coin'); }
          break;
        case 'pay':
          c.coast(dt);
          w.t += dt;
          if (w.t >= WASH.payTime) {
            if (tunnelBusy(WASH.gap)) held = true;
            else startTunnel(c);
          }
          break;
        case 'tunnel':
          c.drive(dt);
          effects(c);
          break;
        default: break;
      }
    }
    // the model: sprays / brushes react to every car body in the lane, the entry light shows red while held
    const b = prop.building;
    if (b) {
      xs.length = 0;
      for (let i = 0; i < list.length; i++) if (list[i].wash.phase === 'tunnel' || list[i].wash.phase === 'pay') xs.push(list[i].pos.x);
      b.setCars?.(xs);
      b.setSignal?.(!held);
    }
  }

  // debug: __game.wash.state() / __game.washCar() (spawns a dirty car that will take the wash)
  const api = {
    get list() { return list; },
    state: () => list.map((c) => ({ id: c.id, phase: c.wash.phase, x: +c.pos.x.toFixed(2), z: +c.pos.z.toFixed(2) })),
    /** Debug: a finished garage car (no owner) appears on the exit lane at x and leaves like any other. */
    send({ dirty = true, x = 2.0 } = {}) {
      const fac = garage, car = fac.cars.spawn({}, true);
      if (!car) return null;
      fac.cars.leaveLane(car);
      fac.owners.unreserve?.();
      for (const j of car.jobs) car.jobDone(j);
      car.tag.setVisible(false);
      car.pos.set(x, 0, fac.L.exitLaneZ); car.yaw = Math.PI / 2;
      car.washDirt = dirty ? 0.9 : 0;
      car.model.setDirt?.(car.washDirt);
      car.mode = 'toPickup';
      car.setPath([{ x: fac.L.pickupStop.x, z: fac.L.pickupStop.z }], { restYaw: Math.PI / 2 });
      return car.id;
    },
  };

  return {
    update,
    onLevel() { /* the model is rebuilt by town.js; the next car picks up the new tier */ },
    dispose() {
      if (garage.hooks.leave === leave) garage.hooks.leave = prevLeave;
      for (const c of list) c.holding = false;
      list.length = 0;
      if (typeof window !== 'undefined' && window.__game?.wash === api) delete window.__game.wash;
    },
  };
});
