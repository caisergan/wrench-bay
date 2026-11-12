// Tutorial arrow: car -> lift -> station -> work zone -> cash -> pad. Hidden after a few unlocks; later it shows the
// town's guide target (ctx.town.guideTarget: tow shed pad, the truck, a map target ...).
import * as THREE from 'three';
import { state } from '../core/state.js';
import { LAYOUT as L } from '../config.js';
import { damp, makeArrow } from './util.js';
import { camera } from '../core/engine.js';

const HIDE_AFTER = 3;

export function createGuide(ctx) {
  const group = makeArrow();
  group.visible = false;
  ctx.root.add(group);

  const target = new THREE.Vector3();
  const cur = new THREE.Vector3();
  let placed = false, lift0 = 0;

  /** Lifted car that still needs something. */
  function activeLift() {
    for (const l of ctx.lifts.list) if (l && l.car && (l.phase === 'raise' || l.phase === 'up') && !l.car.finished) return l;
    return null;
  }

  function pick() {
    const pl = ctx.player;
    // while driving, every free lift shows its own bouncing arrow (lifts.js)
    if (!pl.onFoot) return null;
    for (const p of ctx.piles) if (p.amount > 0) return target.copy(p.trigger);
    for (const pad of ctx.pads.list) if (pad.remaining > 0 && state.cash >= pad.remaining) return target.copy(pad.pos);
    const lift = activeLift();
    if (lift) {
      const car = lift.car;
      // carrying something this car needs, or it has a part waiting to be fitted -> work zone
      let carryMatch = false;
      for (const it of pl.stack.items) if (car.findNeed(it.userData.partType, null, true)) { carryMatch = true; break; }
      if (carryMatch || car.firstReady()) return target.copy(lift.workPos);
      // otherwise the station for the first part it still needs
      for (const j of car.jobs) {
        if (j.state !== 'need' || j.incoming) continue;
        const st = ctx.stations.get(j.type);
        if (st && pl.stack.count < pl.capacity()) return target.copy(st.zonePos);
      }
    }
    if (ctx.lifts.freeCount() > 0) {
      for (const car of ctx.cars.lane) {
        if (ctx.cars.isWaiting(car)) return target.set(car.pos.x, 0, car.pos.z + L.queuePickupOffsetZ);
      }
    }
    return null;
  }

  return {
    update(dt, t) {
      // tutorial targets for the first unlocks; after that the town's guide target (ctx.town.setGuide / map)
      const tut = state.stats.unlocks < HIDE_AFTER;
      const town = ctx.town?.guideTarget;
      const show = ctx.game.started && (tut || town);
      if (!show) { group.visible = false; placed = false; return; }
      const tp = (tut ? pick() : null) || (town ? target.set(town.x, 0, town.z) : null);
      if (!tp) { group.visible = false; placed = false; return; }
      group.visible = true;
      if (!placed) { cur.copy(tp); placed = true; }
      cur.lerp(tp, damp(7, dt));
      lift0 = tp.y;
      group.position.set(cur.x, 1.9 + lift0 + Math.sin(t * 5) * 0.18, cur.z);
      group.quaternion.copy(camera.quaternion);
    },
    dispose() {},
  };
}
