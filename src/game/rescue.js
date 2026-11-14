// Tow truck rescue calls (TOWN.md 4.5): a car breaks down somewhere in town, you drive the tow truck out, stop in
// front of it, it gets hooked, you tow it home and drop it in the tow zone at the garage, where it becomes a well-paid job.
//   - the call: one at a time (RESCUE.maxCalls), first at spot h3 RESCUE.firstDelay s after the truck exists, then
//     `interval` s after each delivery. The scene: the customer's car on the kerb (hazards, a visible breakdown, solid),
//     its owner on the pavement behind it (phone, then waving at the truck), a red warning triangle ~3 m behind it.
//     On screen the car rolls in along the kerb lane and coasts onto the kerb first; off screen it is just there;
//   - hook-up: stop with the truck's tail in the hook ring in front of the car's nose, heading the same way: the truck
//     lines up (reverses / shunts onto the stop pose), lowers the wheel-lift to the ground, backs the cradles under the
//     front tyres, raises them (the car's nose comes up) while the owner takes the triangle and hops into the cab;
//   - towing: trailer kinematics behind the truck's hitch for every attached tow, whoever drives (towing.js);
//     (the scene of a call, the owner, the triangle, curves and the line-up manoeuvre live in rescue-scene.js)
//   - drop: stop with the truck's centre in the painted tow zone (RESCUE.drop, in front of the shed and the garage's
//     west end) heading east (or north): lift down in place, the car becomes a garage car (same look, no swap), the
//     owner hops out and walks to the lounge, the truck pulls the cradles out and stows the lift; the car takes its own
//     way into the drop-off lane (never across the truck, waits for garage cars on the move). Payout x RESCUE.payMult
//     (x (1 + tipFast) when fast) and a gem for a fast rescue when the repair pays out.
// ctx.rescue (the contract with dispatcher.js, TOWN.md 4.5): calls, waitingCall(), claim(call, who), unclaim(call),
// hookPose(call), hookRing(call), hook(truck, call, { onDone }), towOf(truck), dropPose(), drop(truck, { onDone }),
// plus busy(truck), inDropZone(truck), hookFinalPose(call), guideTarget() (town.js guide) and syncTow(truck).
// Saved: state.town.rescue = { next, call, more, first, last } (call = { spot, look, problems, story, owner, fastLeft }).
// Debug: __game.rescue(spotId?) (a call now), __game.rescueState().
import * as THREE from 'three';
import * as M from '../models/index.js';
import { RESCUE } from '../config.js';
import { state, save, propLevel, districtOpen, townOpen, addFame, addGems } from '../core/state.js';
import { events } from '../core/events.js';
import { ui } from '../ui/index.js';
import { registerSystem } from './registry.js';
import { ease } from './tween.js';
import { Tag, clamp, angleDiff, detach, rand } from './util.js';
import { circleHitsBoxes } from './collision.js';
import { Tow, hitchLocal, setBoom } from './towing.js';
import {
  STAGE, TRI_BACK, TOW_BOOM, DROP_HOLD, fx, fz, rx, rz, pick, save_, rampSpeed, planManoeuvre, rollLook,
  rollProblems, laneOffset, makeCall, rollStep, disposeCall, ownerToTruck, boardTruck, knockTri, updateOwner, doorAt,
  doorSide,
} from './rescue-scene.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _p = { x: 0, z: 0, yaw: 0 };
const PULL = 0.8;                 // after the drop the truck pulls this far forward: the cradles come out from under the tyres

// ------------------------------------------------------------------ the system
registerSystem('rescue', (ctx) => createRescue(ctx));

let current = null;    // the live system (debug helpers)

function createRescue(ctx) {
  const calls = [];
  const holds = [];        // dropped cars waiting for the truck to move on: { car, truck, t }
  const offs = [];
  let truck = null;        // the tow truck PlayerVehicle (re-found every frame: rebuilt on upgrade / world rebuild)
  let hookHold = 0, dropTry = 0, saveT = 0, uiT = 0, chipKey = '', chipUntil = 0, chipT = 0;
  let info = null, infoText = '', infoShown = false;
  let ptr = null, footLines = null;
  let hookRing = null, zone = null;
  const garage = () => ctx.facilities.garage || null;

  // ---------------------------------------------------------------- poses
  /** Hitch local z of the truck that would do the job (the tow truck's model, else a level 1 default). */
  const hz = (k, T = truck) => (T?.model ? hitchLocal(T.model, k).z : (k === 0 ? -1.86 : -2.82));
  /** Final hook pose: the hitch (at TOW_BOOM) right under the car's front axle, same heading as the car. */
  function finalPose(call, T = truck, out = {}) {
    const f0 = fx(call.yaw), f1 = fz(call.yaw), ax = call.model.dims.ax - hz(TOW_BOOM, T);
    out.x = call.carPos.x + f0 * ax; out.z = call.carPos.z + f1 * ax; out.yaw = call.yaw;
    return out;
  }
  /** Where the truck stops before the hook-up (STAGE ahead of the final pose: the lift goes down clear of the tyres). */
  function stagePose(call, T = truck, out = {}) {
    finalPose(call, T, out);
    out.x += fx(call.yaw) * STAGE; out.z += fz(call.yaw) * STAGE;
    return out;
  }
  /** Hook ring: where the truck's tail (stowed hitch) is when it stands at the stop pose. */
  function ringPos(call, T = truck, out = {}) {
    stagePose(call, T, out);
    const k = hz(0, T);
    out.x += fx(call.yaw) * k; out.z += fz(call.yaw) * k;
    out.r = RESCUE.hookRadius;
    return out;
  }
  // ---------------------------------------------------------------- hook-up
  /**
   * Plays the hook-up from wherever the truck stopped near the stop pose: line up (reverse onto it, or pull forward
   * and back when off), lower the wheel-lift, back the cradles under the front tyres, lift the nose; the owner takes
   * the triangle and gets into the cab. The truck is in mode 'auto' meanwhile; onDone(truck) at the end.
   */
  function hook(T, call, { onDone = null } = {}) {
    if (!T || !call || call.seq || call.tow || call.state !== 'waiting' || towOf(T) || busy(T)) return false;
    call.state = 'hooking';
    call.truck = T;
    call.claimedBy = T.driver === 'player' ? 'player' : (call.claimedBy || 'dispatcher');
    call.capsule.owner = T;              // the truck backs right up to it
    const S = stagePose(call, T), F = finalPose(call, T);
    const moves = planManoeuvre({ x: T.pos.x, z: T.pos.z, yaw: T.yaw }, S, laneOffset(call.spot));
    const seq = { kind: 'hook', call, truck: T, phase: 'align', moves, mi: 0, s: 0, t: 0, wait: 0, stage: S, final: F, onDone };
    call.seq = seq;
    T.mode = 'auto'; T.speed = 0; T.vx = T.vz = 0;
    T.script = [{ kind: 'fn', fn: (dt) => stepHook(seq, dt) }];
    T.model.setBeacon?.(true);
    setBoom(T.model, 0);
    call.label.setVisible(false);
    ownerToTruck(ctx, call, F);
    reserve(call);
    return true;
  }

  function stepHook(seq, dt) {
    const T = seq.truck, call = seq.call;
    switch (seq.phase) {
      case 'align': {
        const m = seq.moves[seq.mi];
        if (!m) {
          T.pos.x = seq.stage.x; T.pos.z = seq.stage.z; T.yaw = seq.stage.yaw;
          T.wheelSpeed = 0; T.speed = 0;
          seq.phase = 'lower'; seq.t = 0;
          ctx.sfxAt('winch', T.pos);
          break;
        }
        const v = rampSpeed(seq.s, m.curve.len, m.reverse ? 1.7 : 2.4, 2.6);
        seq.s = Math.min(m.curve.len, seq.s + v * dt);
        m.curve.at(seq.s, _p);
        T.pos.x = _p.x; T.pos.z = _p.z;
        if (m.yaw0 !== undefined) T.yaw = m.yaw0 + angleDiff(m.yaw0, m.yaw1) * (m.curve.len > 0 ? seq.s / m.curve.len : 1);
        else T.yaw = m.reverse ? _p.yaw + Math.PI : _p.yaw;
        T.wheelSpeed = m.reverse ? -v : v;
        T.speed = v;
        if (seq.s >= m.curve.len - 1e-4) { seq.mi++; seq.s = 0; }
        break;
      }
      case 'lower': {
        seq.t = Math.min(1, seq.t + dt / 0.8);
        setBoom(T.model, ease.inOutQuad(seq.t));
        if (seq.t >= 1) { seq.phase = 'back'; seq.t = 0; }
        break;
      }
      case 'back': {
        // the cradles slide under the front tyres: reverse the last STAGE straight onto the final pose
        const t0 = seq.t;
        seq.t = Math.min(1, seq.t + dt / 1.1);
        const e = ease.inOutQuad(seq.t), e0 = ease.inOutQuad(t0);
        const S = seq.stage, F = seq.final;
        T.pos.x = S.x + (F.x - S.x) * e; T.pos.z = S.z + (F.z - S.z) * e; T.yaw = F.yaw;
        T.wheelSpeed = dt > 0 ? -STAGE * (e - e0) / dt : 0;
        if (seq.t >= 1) {
          T.wheelSpeed = 0;
          seq.phase = 'raise'; seq.t = 0;
          ctx.sfxAt('winch', T.pos);
        }
        break;
      }
      case 'raise': {
        seq.t = Math.min(1, seq.t + dt / 1.2);
        const e = ease.inOutQuad(seq.t);
        setBoom(T.model, 1 + (TOW_BOOM - 1) * e);
        call.model.setTowed?.(e);
        if (seq.t >= 1) { seq.phase = 'wait'; seq.wait = 0; }
        break;
      }
      case 'wait': {
        // the owner gets in before the truck leaves
        seq.wait += dt;
        const o = call.owner;
        if (o.state === 'atDoor' || (seq.wait > 5 && o.state !== 'boarding' && o.state !== 'riding')) boardTruck(ctx, call);
        if (o.state === 'riding') finishHook(seq);
        break;
      }
    }
    return false;
  }

  function finishHook(seq) {
    const T = seq.truck, call = seq.call;
    call.seq = null;
    if (T.script && T.script[0]?.kind === 'fn') T.script = null;
    const tow = new Tow(ctx, T, call.model, TOW_BOOM);
    tow.place(call.carPos.x, call.carPos.z, call.yaw);
    tow.update(0);
    call.tow = tow;
    call.towModel = T.model;
    ctx.movers.push(tow.mover);
    tow.mover.tow = true; tow.mover.truck = T; tow.mover.ped = true;   // AI cars wait behind a towed car, never ghost through
    call.mover.hidden = true;
    call.state = 'towing';
    call.wasFast = call.fastLeft > 0;
    const D = save_();
    if (D.call && D.call === call.data) D.call.fastLeft = Math.max(0, call.fastLeft);
    events.emit('rescue:hooked', { spot: call.spot.id, fast: call.wasFast });
    if (call.wasFast && ctx.near(call.carPos, 2)) {
      ui.floatText(_v.set(call.carPos.x, 2.4, call.carPos.z), 'Fast rescue!', 'good');
      ui.sfx('perfect');
    }
    if (T.driver === 'player') {
      firstHint('rescueHook', 'Tow it to the garage drop-off');
      ui.hint?.('Drop the car at the garage first');
    }
    uiT = 0;
    save();
    const cb = seq.onDone;
    if (cb) cb(T);
  }

  // ---------------------------------------------------------------- drop
  /**
   * Plays the drop in the drop zone, in place: lift down (the car on its wheels), the car becomes a garage car and its owner
   * gets out, the truck pulls the cradles out, the lift stows. false = the garage lane cannot take it yet.
   */
  function drop(T, { onDone = null } = {}) {
    const call = towOf(T);
    if (!call || call.seq || call.state !== 'towing') return false;
    if (!reserve(call)) return false;
    call.state = 'dropping';
    call.tow.speed = 0;
    // in place: lower the car where the truck stands (in the drop zone)
    const seq = { kind: 'drop', call, truck: T, phase: 'lower', t: 0, x0: 0, z0: 0, onDone };
    call.seq = seq;
    T.mode = 'auto'; T.speed = 0; T.vx = T.vz = 0; T.wheelSpeed = 0;
    T.script = [{ kind: 'fn', fn: (dt) => stepDrop(seq, dt) }];
    ctx.sfxAt('winch', T.pos);
    return true;
  }
  /** Is the truck's centre in the drop zone, heading one of the zone's ways (RESCUE.drop.yaws) within dropAngle? */
  function inDropZone(T) {
    const D = RESCUE.drop;
    return T.pos.x > D.minX && T.pos.x < D.maxX && T.pos.z > D.minZ && T.pos.z < D.maxZ;
  }
  function dropHeadingOk(T) {
    for (const y of RESCUE.drop.yaws || [RESCUE.drop.yaw]) if (Math.abs(angleDiff(T.yaw, y)) < RESCUE.dropAngle) return true;
    return false;
  }
  /** Something just ahead of the truck (a car reversing off the west lift ...): the pull-out waits for it. */
  function pullBlocked(T) {
    const list = ctx.allCars, f0 = fx(T.yaw), f1 = fz(T.yaw), nose = RESCUE.truck.length / 2;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.mode === 'gone' || c.mode === 'lift' || c.mode === 'snap' || c.rescue) continue;
      const dx = c.pos.x - T.pos.x, dz = c.pos.z - T.pos.z;
      const ahead = dx * f0 + dz * f1, lat = Math.abs(dx * f1 - dz * f0);
      if (ahead > 0 && ahead < nose + PULL + 1.6 && lat < 2.0) return true;
    }
    const pl = ctx.player;
    if (pl.onFoot) {
      const dx = pl.pos.x - T.pos.x, dz = pl.pos.z - T.pos.z;
      const ahead = dx * f0 + dz * f1, lat = Math.abs(dx * f1 - dz * f0);
      if (ahead > 0 && ahead < nose + PULL + 0.5 && lat < 1.3) return true;
    }
    return false;
  }

  function stepDrop(seq, dt) {
    const T = seq.truck, call = seq.call;
    switch (seq.phase) {
      case 'lower': {
        seq.t = Math.min(1, seq.t + dt / 1.0);
        const e = ease.inOutQuad(seq.t);
        setBoom(T.model, TOW_BOOM + (1 - TOW_BOOM) * e);
        call.model.setTowed?.(1 - e);
        if (seq.t >= 1) {
          handOver(call, T);
          seq.phase = 'pull'; seq.t = 0; seq.x0 = T.pos.x; seq.z0 = T.pos.z;
        }
        break;
      }
      case 'pull': {
        // drive forward a little to pull the cradles out from under the tyres (waits while something is just ahead)
        if (seq.t === 0 && pullBlocked(T)) { T.wheelSpeed = 0; break; }
        const t0 = seq.t;
        seq.t = Math.min(1, seq.t + dt / 0.9);
        const e = ease.inOutQuad(seq.t), e0 = ease.inOutQuad(t0);
        T.pos.x = seq.x0 + fx(T.yaw) * PULL * e; T.pos.z = seq.z0 + fz(T.yaw) * PULL * e;
        T.wheelSpeed = dt > 0 ? PULL * (e - e0) / dt : 0;
        if (seq.t >= 1) { T.wheelSpeed = 0; seq.phase = 'stow'; seq.t = 0; ctx.sfxAt('winch', T.pos); }
        break;
      }
      case 'stow': {
        seq.t = Math.min(1, seq.t + dt / 0.7);
        setBoom(T.model, 1 - ease.inOutQuad(seq.t));
        if (seq.t >= 1) {
          T.model.setBeacon?.(false);
          call.seq = null;
          if (T.script && T.script[0]?.kind === 'fn') T.script = null;
          if (T.driver === 'player') ui.hint?.('Park in a P bay to get out');
          const cb = seq.onDone;
          if (cb) cb(T);
        }
        break;
      }
    }
    return false;
  }

  /** The stand-in car becomes a garage car in the same frame (same look, same place); its owner gets out of the cab. */
  function handOver(call, T) {
    const fac = garage();
    const tow = call.tow;
    const lvl = clamp(propLevel('tow'), 1, RESCUE.payMult.length);
    const fast = call.wasFast;
    const mult = RESCUE.payMult[lvl - 1] * (fast ? 1 + RESCUE.tipFast : 1);
    const bonusText = (fast ? 'Fast rescue x' : 'Rescue x') + (+mult.toFixed(2));
    const g = call.model.group;
    const way = releaseWay(g.position.x, g.position.z, tow.h, fac.L.queueLaneZ);
    const opts = { look: call.look, problems: call.problems, payMult: mult, bonusText, at: { x: g.position.x, z: g.position.z, yaw: tow.h }, path: way.path, reserved: true };
    let car = fac.cars.spawn(opts);
    if (!car) car = fac.cars.spawn({ ...opts, reserved: false }, true);
    call.reserved = false;
    // the stand-in goes, the garage car stands exactly where it stood
    detach(g);
    const k = ctx.movers.indexOf(tow.mover); if (k >= 0) ctx.movers.splice(k, 1);
    call.tow = null;
    if (car) {
      car.mode = 'rescueHold';
      car.holding = true;          // stopped on purpose: garage arrivals behind it wait, never ghost through
      car.speed = 0;
      if (call.story) car.model.setTyreStory?.(call.story);
      car.model.setHazard?.(true);
      car.model.update?.(0, 0);
      car.rescue = { fast, spot: call.spot.id };
      car.onFirstStop = rescueFirstStop;
      // the owner gets out of the truck's passenger door and walks to the waiting area as this car's owner
      const P = { x: T.pos.x, z: T.pos.z, yaw: T.yaw };
      const side = doorSide(ctx, P);
      const door = doorAt(P, side, {});
      car.ownerStart = {
        look: call.owner?.look,
        from: { x: T.pos.x + fx(T.yaw) * 0.55 + rx(T.yaw) * 0.3 * side, y: 0.9, z: T.pos.z + fz(T.yaw) * 0.55 + rz(T.yaw) * 0.3 * side },
        door,
      };
      fac.owners.spawnFor(car);
      // its own waypoints stay short of its lane slot (never past it and back)
      for (let i = 0; i < car.path.length - 1; i++) if (car.slotX != null) car.path[i].x = Math.min(car.path[i].x, car.slotX - 1.2);
      holds.push({ car, truck: T, t: 0, backTo: way.backTo });
    }
    if (call.owner) { detach(call.owner.ch.group); call.owner = null; }
    detach(call.tri?.group);
    // bookkeeping
    const st = state.town.stats;
    st.rescues = (st.rescues | 0) + 1;
    addFame('rescue', _v.set(g.position.x, 1.5, g.position.z));
    events.emit('rescue:delivered', { spot: call.spot.id, fast });
    ctx.sfxAt('done', g.position, T.driver === 'player');
    if (T.driver === 'player') firstHint('rescueDone', `Rescued! It pays x${+RESCUE.payMult[lvl - 1].toFixed(2)}`);
    else if (!state.town.hints.rescueDone) state.town.hints.rescueDone = true;
    removeCall(call);
    save_().next = null;
    persist();
    save();
  }

  /** Garage car (rescued): its owner is already on the way, so the first stop only starts the clock and the bubble. */
  function rescueFirstStop() {
    if (this.rescueStarted) return;
    this.rescueStarted = true;
    this.startPatience();
    this.fac.h('onArrived', this);
    this.tag.setVisible(true);
    this.jobsDirty = true;
  }

  /**
   * The dropped car's way into the drop-off lane (its slot is appended by the garage), never across the truck:
   * heading east (truck east of it): a right turn south to the lane, then east along it; heading north (truck north of
   * it): straight back to the lane first if it stands north of it (backTo = that z), then a right turn east.
   */
  function releaseWay(x, z, h, lz) {
    const east = Math.abs(angleDiff(h, Math.PI / 2)) <= Math.abs(angleDiff(h, Math.PI));
    if (east) {
      if (lz - z > 2.2) return { path: [{ x: x + 0.7, z: z + 1.7 }, { x: x + 1.1, z: lz }], backTo: null };
      return { path: [{ x: x + 1.6, z: lz }], backTo: null };
    }
    return { path: [{ x: x + 1.6, z: lz }], backTo: z < lz - 0.4 ? lz : null };
  }

  /** A dropped car waits a moment, rolls back to the lane if it has to, then drives to its slot when its way is clear. */
  function updateHolds(dt) {
    for (let i = holds.length - 1; i >= 0; i--) {
      const h = holds[i], car = h.car;
      if (car.mode !== 'rescueHold') { holds.splice(i, 1); continue; }
      h.t += dt;
      car.updateCapsule?.();
      if (h.t < DROP_HOLD || !wayClear(car, h)) { car.wheelSpeed = 0; continue; }
      if (h.backTo != null) {
        // straight back (it stands north of the lane, the truck in front of it)
        const d = h.backTo - car.pos.z, dir = Math.sign(d) || 1;
        h.v = Math.min(1.6, (h.v || 0) + 3 * dt, Math.sqrt(2 * 3 * Math.abs(d)) + 0.1);
        const step = Math.min(Math.abs(d), h.v * dt);
        car.pos.z += dir * step;
        car.wheelSpeed = -h.v;
        if (Math.abs(d) - step < 0.01) { car.pos.z = h.backTo; h.backTo = null; car.wheelSpeed = 0; }
        continue;
      }
      car.mode = 'arriving';
      car.holding = false;
      car.model.setHazard?.(false);
      ctx.sfxAt('engine', car.pos);
      holds.splice(i, 1);
    }
  }
  const MOVING = new Set(['arriving', 'reversing', 'valet', 'driven', 'boarding', 'toPickup', 'exiting']);
  /** Nothing in the dropped car's way: not the truck (any part of it), not a garage car on the move. */
  function wayClear(car, h) {
    const boxes = _boxes;
    let n = 0, px = car.pos.x, pz = car.pos.z;
    const pts = h.backTo != null ? [{ x: px, z: h.backTo }] : car.path;
    for (let i = 0; i < pts.length && n < boxes.length; i++) {
      const q = pts[i], b = boxes[n++];
      b.minX = Math.min(px, q.x) - 1.05; b.maxX = Math.max(px, q.x) + 1.05; b.minZ = Math.min(pz, q.z) - 1.05; b.maxZ = Math.max(pz, q.z) + 1.05;
      px = q.x; pz = q.z;
    }
    _boxList.length = 0;
    for (let i = 0; i < n; i++) _boxList.push(boxes[i]);
    const T = h.truck;
    if (T?.capsule) {
      const c = T.capsule;
      for (let k = 0; k <= 2; k++) {
        const x = c.ax + (c.bx - c.ax) * k / 2, z = c.az + (c.bz - c.az) * k / 2;
        if (circleHitsBoxes(x, z, c.r, _boxList)) return false;
      }
    }
    const list = ctx.allCars;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === car || !MOVING.has(o.mode)) continue;
      // a garage arrival stopped behind this car waits for it: let this one go first (else neither ever moves)
      if (o.blockedBy === car || (o.blockT > 1 && Math.abs(o.speed || 0) < 0.05)) continue;
      if (circleHitsBoxes(o.pos.x, o.pos.z, 0.9, _boxList)) return false;
    }
    return true;
  }
  const _boxes = [0, 1, 2, 3].map(() => ({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 }));
  const _boxList = [];

  /** Hold a lane slot + waiting spot of the garage for this car (from the hook on; retried while towing). */
  function reserve(call) {
    if (call.reserved) return true;
    const fac = garage();
    if (!fac || !fac.cars.reserveSlot()) return false;
    call.reserved = true;
    return true;
  }

  // ---------------------------------------------------------------- calls: open, save, remove
  function towOf(T) {
    for (let i = 0; i < calls.length; i++) { const c = calls[i]; if (c.truck === T && (c.state === 'towing' || c.state === 'dropping')) return c; }
    return null;
  }
  /** The truck is hooking / towing / dropping (it may not be left or used for another call). */
  function busy(T) {
    for (let i = 0; i < calls.length; i++) { const c = calls[i]; if (c.truck === T && (c.state === 'hooking' || c.state === 'towing' || c.state === 'dropping')) return true; }
    return false;
  }
  function removeCall(call) {
    const i = calls.indexOf(call);
    if (i >= 0) calls.splice(i, 1);
    disposeCall(ctx, call);
  }
  /** state.town.rescue.call / .more = the open calls (a call being towed is saved as open at its spot). */
  function persist() {
    const D = save_();
    D.call = calls[0]?.data || null;
    D.more = calls.slice(1).map((c) => c.data);
  }
  function firstHint(key, text) {
    const h = state.town.hints;
    if (h[key]) return;
    h[key] = true;
    ui.toast(text);
    save();
  }
  const interval = () => rand(RESCUE.interval[0], RESCUE.interval[1]) * (propLevel('tow') >= 2 ? RESCUE.intervalMultLv2 : 1);

  /** No vehicle, customer car or the player within 5 m of the car or of its hook pose. */
  function spotFree(s) {
    const hx = s.x + fx(s.yaw) * 4.2, hzz = s.z + fz(s.yaw) * 4.2;
    const near = (p) => Math.hypot(p.x - s.x, p.z - s.z) < 5 || Math.hypot(p.x - hx, p.z - hzz) < 5;
    if (near(ctx.player.pos)) return false;
    for (const v of ctx.vehicles?.list || []) if (near(v.pos)) return false;
    for (const c of ctx.allCars) if (c.mode !== 'gone' && near(c.pos)) return false;
    return true;
  }
  function chooseSpot() {
    const D = save_();
    const ok = RESCUE.spots.filter((s) => districtOpen(s.d) && !calls.some((c) => c.spot === s) && spotFree(s));
    const off = ok.filter((s) => s.id !== D.last && !ctx.near(s, 8));
    const notLast = ok.filter((s) => s.id !== D.last);
    const pool = off.length ? off : notLast.length ? notLast : ok;
    return pool.length ? pick(pool) : null;
  }
  function newCall(spotId = null) {
    const fac = garage();
    if (!fac) return null;
    const D = save_();
    let spot = spotId ? RESCUE.spots.find((s) => s.id === spotId) || null : null;
    if (!spot && !D.first) { spot = RESCUE.spots.find((s) => s.id === 'h3') || null; if (spot && !spotFree(spot)) spot = null; }
    if (!spot) spot = chooseSpot();
    if (!spot) return null;
    const problems = rollProblems();
    const data = {
      spot: spot.id, look: rollLook(fac), problems, story: problems.includes('tire') ? 'flat' : null,
      owner: M.randomCustomerLook(), fastLeft: RESCUE.callTime,
    };
    const call = makeCall(ctx, spot, data, ctx.near(spot, 5));
    calls.push(call);
    D.first = true; D.last = spot.id; D.next = null;
    persist();
    save();
    announce(call, true);
    return call;
  }
  function announce(call, fresh) {
    events.emit('rescue:call', { spot: call.spot.id, until: Date.now() + Math.max(0, call.fastLeft) * 1000 });
    uiT = 0; chipKey = '';
    if (!fresh) return;
    ui.sfx('radio');
    firstHint('rescueCall', 'A car broke down! Take the tow truck');
  }
  /** A saved open call comes back at its spot (also one that was being towed when the page closed). */
  function restore() {
    const D = save_();
    const list = [D.call, ...(Array.isArray(D.more) ? D.more : [])].filter(Boolean);
    for (const data of list) {
      const spot = RESCUE.spots.find((s) => s.id === data.spot);
      if (!spot || !districtOpen(spot.d) || !data.look || !Array.isArray(data.problems) || !data.problems.length) continue;
      const call = makeCall(ctx, spot, data, false);
      calls.push(call);
      announce(call, false);
    }
    persist();
  }
  function schedule(dt) {
    if (!truck || !townOpen() || !ctx.game.started || propLevel('tow') < 1) return;
    if (calls.length >= (RESCUE.maxCalls ?? 1)) return;
    const D = save_();
    if (D.next == null) D.next = D.first ? interval() : RESCUE.firstDelay;
    D.next -= dt;
    if (D.next <= 0) { D.next = null; if (!newCall()) D.next = 3; }
  }

  // ---------------------------------------------------------------- per call, per frame
  function updateCall(c, dt) {
    const g = c.model.group;
    const near = ctx.near(g.position, 4);
    switch (c.state) {
      case 'arriving': rollStep(ctx, c, dt); c.fastLeft -= dt; break;
      case 'waiting': c.fastLeft -= dt; if (c.tri.placed && !c.tri.down) knockTri(ctx, c); break;
      case 'towing': {
        const T = c.truck;
        if (T.model !== c.towModel) { c.towModel = T.model; setBoom(T.model, TOW_BOOM); T.model.setBeacon?.(true); }
        c.tow.update(dt);
        if (!c.reserved) reserve(c);
        break;
      }
      default: break;
    }
    if (near || c.state === 'hooking') c.model.update(dt, c.tow ? c.tow.speed : c.speed);   // (hooking: the hood shuts)
    updateOwner(ctx, c, dt, near);
  }

  // ---------------------------------------------------------------- the player's truck: hook ring, drop ring
  function setInfo(text, x, z) { infoText = text; _w.set(x, 0, z); }
  function updatePlayerTruck(dt) {
    infoText = '';
    const T = truck;
    if (T && T.mode === 'driven' && T.driver === 'player') {
      const slow = T.speed < RESCUE.hookMaxSpeed;
      const call = towOf(T);
      const f0 = fx(T.yaw), f1 = fz(T.yaw);
      if (!call && !busy(T)) {
        let hooked = false;
        for (let i = 0; i < calls.length && !hooked; i++) {
          const c = calls[i];
          if (c.state !== 'waiting') continue;
          const r = ringPos(c, T, _r);
          const tz = hz(0, T), tx = T.pos.x + f0 * tz, tzz = T.pos.z + f1 * tz;
          const inRing = Math.hypot(tx - r.x, tzz - r.z) < RESCUE.hookRadius;
          const aligned = Math.abs(angleDiff(T.yaw, c.yaw)) < RESCUE.hookAngle;
          if (inRing && aligned) {
            if (!slow) { hookHold = 0; continue; }
            hookHold += dt;
            if (hookHold >= 0.12) { hookHold = 0; hooked = hook(T, c, { onDone: backToPlayer }); }
            continue;
          }
          const nx = T.pos.x + f0 * T.length / 2, nz = T.pos.z + f1 * T.length / 2;
          if (slow && Math.hypot(nx - r.x, nz - r.z) < RESCUE.hookRadius + 0.6 && Math.abs(angleDiff(T.yaw, c.yaw + Math.PI)) < RESCUE.hookAngle) {
            setInfo('Turn round: back up to its nose', r.x, r.z);
          }
        }
      } else if (call && call.state === 'towing') {
        const D = RESCUE.drop;
        if (slow && inDropZone(T)) {
          if (dropHeadingOk(T)) {
            dropTry -= dt;
            if (dropTry <= 0) {
              if (!drop(T, { onDone: backToPlayer })) { dropTry = 1; setInfo('Garage lane full: wait a moment', D.x, D.z); }
            } else if (call.state === 'towing') setInfo('Garage lane full: wait a moment', D.x, D.z);
          } else setInfo('Drive in heading east', D.x, D.z);
        } else dropTry = 0;
        // trying to park with a car on the hook
        if (T.speed < 0.35 && T.bayAt?.()) ui.hint?.('Drop the car at the garage first');
      }
    } else hookHold = 0;
    if (infoText) {
      info ||= new Tag({ kind: 'info', text: '' }, 1.7);
      if (!infoShown) { infoShown = true; ui.sfx('error'); }
      info.setText(infoText);
      info.place(_w.x, 0, _w.z);
      info.setVisible(true);
    } else if (infoShown) { infoShown = false; info.setVisible(false); }
  }
  const _r = {};
  /** End of a hook-up / drop of the player's truck: back to the joystick, no leftover turn or speed. */
  function backToPlayer(T) {
    if (T.driver !== 'player') return;
    T.mode = 'driven';
    T.speed = 0; T.vx = T.vz = 0;
    const d = ctx.player.drive;
    if (d) { d.dSpeed = 0; d.vYaw = T.yaw; }
  }

  // ---------------------------------------------------------------- HUD: label, chip, pointers, rings
  function updateUI(dt) {
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      const show = c.state === 'waiting' && ctx.near(c.carPos, 2);
      c.label.setVisible(show);
      if (show) c.label.place(c.carPos.x, 0, c.carPos.z);
    }
    uiT -= dt;
    if (uiT > 0) return;
    uiT = 0.25;
    let wc = null, tc = null;
    for (const c of calls) {
      if (!tc && (c.state === 'towing' || c.state === 'dropping')) tc = c;
      if (!wc && (c.state === 'waiting' || c.state === 'arriving' || c.state === 'hooking')) wc = c;
      c.label.setProgress(clamp(c.fastLeft / RESCUE.callTime, 0, 1));
    }
    // a call the dispatcher (level 3 tow driver) has: just a chip, no pointers for the player
    const disp = (tc && tc.claimedBy === 'dispatcher') || (!tc && wc && wc.claimedBy === 'dispatcher');
    // chip
    let key = '', opts = null;
    if (disp) { key = 'disp'; opts = { icon: 'tow', text: 'Your tow driver is on it' }; }
    else if (tc) { key = 'tow'; opts = { icon: 'tow', text: 'Tow it to the garage' }; }
    else if (wc) {
      const fast = wc.fastLeft > 0 && wc.state !== 'hooking';   // (the clock stops at the hook-up)
      key = fast ? 'callT' : 'call';
      opts = { icon: 'phone', text: 'Rescue call', until: fast ? Date.now() + wc.fastLeft * 1000 : 0 };
    }
    chipT -= 0.25;
    if (key !== chipKey || chipT <= 0 || (opts?.until && Math.abs(opts.until - chipUntil) > 1500)) {
      chipKey = key; chipUntil = opts?.until || 0; chipT = 2;   // re-sent now and then (the HUD may not exist yet)
      ui.chip?.('rescue', opts);
    }
    // edge pointer: the car, or the drop zone while towing
    const target = disp ? null : tc ? RESCUE.drop : wc ? wc.carPos : null;
    if (target && ctx.pointers) {
      _w.set(target.x, 0, target.z);
      ptr ||= ctx.pointers.add({ kind: 'rescue', text: 'Rescue', worldPos: _w });
      ptr.setPos(_w).setText(tc ? 'Garage' : 'Rescue').setVisible(true);
    } else ptr?.setVisible(false);
    // "Truck" pointer while a call waits, the truck is parked and you are on foot
    if (truck) truck.setPointer(!!wc && truck.mode === 'parked' && ctx.player.onFoot && wc.claimedBy !== 'dispatcher', 'Truck');
    // hook ring: in front of the nearest waiting car while the player drives the truck
    const pl = truck && truck.driver === 'player' && truck.mode === 'driven' && !busy(truck);
    let ringCall = null, rd = Infinity;
    if (pl) for (const c of calls) {
      if (c.state !== 'waiting') continue;
      const d = Math.hypot(c.carPos.x - truck.pos.x, c.carPos.z - truck.pos.z);
      if (d < rd) { rd = d; ringCall = c; }
    }
    if (ringCall) {
      if (!hookRing && M.createZoneRing) { hookRing = M.createZoneRing(1.0); ctx.root.add(hookRing); }
      if (hookRing) {
        const r = ringPos(ringCall, truck, _r);
        hookRing.position.set(r.x, 0.035, r.z);
        hookRing.visible = true;
      }
    } else if (hookRing) hookRing.visible = false;
    // the drop zone is painted while the truck is owned; it pulses while a car is on the hook
    if (truck && !zone && M.createTowZone) {
      const D = RESCUE.drop;
      zone = M.createTowZone(D.maxX - D.minX, D.maxZ - D.minZ);
      zone.group.position.set((D.minX + D.maxX) / 2, 0, (D.minZ + D.maxZ) / 2);
      ctx.root.add(zone.group);
    } else if (!truck && zone) { detach(zone.group); zone = null; }
    zone?.setActive(!!tc && tc.state === 'towing');
  }

  // ---------------------------------------------------------------- the API (TOWN.md 4.5 contract)
  function findTruck() {
    const list = ctx.vehicles?.list;
    if (list) for (let i = 0; i < list.length; i++) if (list[i].id === 'tow') return list[i];
    return null;
  }
  function guideTarget() {
    if (state.town.hints.rescueDone) return null;
    for (const c of calls) if (c.state === 'towing' || c.state === 'dropping') return c.state === 'towing' && c.claimedBy !== 'dispatcher' ? RESCUE.drop : null;
    for (const c of calls) if ((c.state === 'waiting' || c.state === 'arriving') && c.claimedBy !== 'dispatcher') return c.carPos;
    return null;
  }

  const api = {
    calls,
    /** The oldest unclaimed call that is ready to be hooked, or null. */
    waitingCall() {
      let best = null;
      for (const c of calls) if (c.state === 'waiting' && !c.claimedBy && (!best || c.id < best.id)) best = c;
      return best;
    },
    claim(call, who) {
      if (!call || !calls.includes(call) || (call.claimedBy && call.claimedBy !== who)) return false;
      call.claimedBy = who;
      return true;
    },
    unclaim(call) { if (call && (call.state === 'waiting' || call.state === 'arriving')) call.claimedBy = null; },
    /** Where the truck stops for the hook-up (truck centre + heading); hook() then backs the last STAGE m itself. */
    hookPose: (call) => stagePose(call),
    /** The final pose after the hook-up (hitch under the car's front axle). */
    hookFinalPose: (call) => finalPose(call),
    hookRing: (call) => { const r = ringPos(call); return { x: r.x, z: r.z, r: r.r }; },
    hook, towOf, drop, busy,
    /** Truck centre + heading for the drop (RESCUE.drop.pose: in the drop zone, heading east). */
    dropPose() { const P = RESCUE.drop.pose; return { x: P.x, z: P.z, yaw: P.yaw }; },
    /** Is the truck where drop() works: centre in the zone, heading east or north (within dropAngle)? */
    inDropZone: (T) => inDropZone(T) && dropHeadingOk(T),
    /** Re-run the trailer of a truck now (call after moving the truck outside ctx.vehicles.update). */
    syncTow(T, dt = 1 / 60) { const c = towOf(T); if (c && c.state === 'towing') c.tow.update(dt); },
    guideTarget,
    update(dt) {
      truck = findTruck();
      if (truck && truck.rescueSys !== api) {
        const T = truck;
        T.rescueSys = api;
        T.canLeave = () => !busy(T);
      }
      schedule(dt);
      for (let i = 0; i < calls.length; i++) updateCall(calls[i], dt);
      updateHolds(dt);
      updatePlayerTruck(dt);
      updateUI(dt);
      if (zone && ctx.near(zone.group.position, 4)) zone.update(dt);
      saveT -= dt;
      if (saveT <= 0) {
        saveT = 5;
        for (const c of calls) if (c.state === 'waiting' || c.state === 'arriving') c.data.fastLeft = Math.max(0, Math.round(c.fastLeft * 10) / 10);
        if (calls.length) save();
      }
    },
    dispose() {
      for (const off of offs) off();
      for (const c of calls) disposeCall(ctx, c);
      calls.length = 0;
      info?.remove(); info = null;
      ptr?.remove(); ptr = null;
      detach(hookRing); if (zone) detach(zone.group);
      ui.chip?.('rescue', null);
      const i = ctx.capsuleSources.indexOf(pushCaps); if (i >= 0) ctx.capsuleSources.splice(i, 1);
      if (fac0 && canSpawn0) fac0.hooks.canSpawn = canSpawn0;
      if (current === api) current = null;
    },
    // ---- debug (window.__game.rescue / rescueState)
    debugCall(spotId) {
      while (calls.length >= (RESCUE.maxCalls ?? 1)) {
        const c = calls.find((k) => (k.state === 'waiting' || k.state === 'arriving') && !k.claimedBy);
        if (!c) return null;
        removeCall(c);
      }
      const c = newCall(spotId || null);
      return c ? c.spot.id : null;
    },
    /**
     * Debug overlay: footprints at every spot (car, truck at the stop and final poses, owner, triangle), drawn as
     * lines on top of everything. on = false removes it.
     */
    debugFootprints(on = true) {
      if (footLines) { detach(footLines); footLines.geometry.dispose(); footLines = null; }
      if (!on) return 0;
      const pts = [];
      const rect = (x, z, yaw, hw, hl) => {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const P = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([a, b]) => [x + a * c + b * s, z - a * s + b * c]);
        for (let i = 0; i < 4; i++) { const p = P[i], q = P[(i + 1) % 4]; pts.push(p[0], 0.08, p[1], q[0], 0.08, q[1]); }
      };
      const T = truck || { model: null };
      for (const spot of RESCUE.spots) {
        const tmp = { carPos: { x: spot.x, z: spot.z }, yaw: spot.yaw, model: { dims: { ax: 0.9, length: 2.8, width: 1.5 } } };
        const dm = tmp.model.dims, f0 = fx(spot.yaw), f1 = fz(spot.yaw), r0 = rx(spot.yaw), r1 = rz(spot.yaw);
        rect(spot.x, spot.z, spot.yaw, dm.width / 2, dm.length / 2);
        const S = stagePose(tmp, T), F = finalPose(tmp, T);
        rect(S.x, S.z, S.yaw, RESCUE.truck.width / 2, RESCUE.truck.length / 2);
        rect(F.x, F.z, F.yaw, RESCUE.truck.width / 2, RESCUE.truck.length / 2);
        rect(spot.x - f0 * (dm.length / 2 + 0.8) + r0 * 0.12, spot.z - f1 * (dm.length / 2 + 0.8) + r1 * 0.12, 0, 0.3, 0.3);
        rect(spot.x - f0 * (dm.length / 2 + TRI_BACK) - r0 * 0.45, spot.z - f1 * (dm.length / 2 + TRI_BACK) - r1 * 0.45, spot.yaw, 0.3, 0.2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      footLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff2bd6, depthTest: false }));
      footLines.renderOrder = 20;
      ctx.root.add(footLines);
      return RESCUE.spots.length;
    },
    /** Put the truck the player drives at the stop pose of the open call (+ dl ahead, dt to the right, dyaw). */
    debugTruckTo(dl = 0, dt = 0, dyaw = 0) {
      const c = calls.find((k) => k.state === 'waiting');
      if (!c || !truck || truck.mode !== 'driven') return false;
      const S = stagePose(c);
      truck.pos.x = S.x + fx(S.yaw) * dl + rx(S.yaw) * dt; truck.pos.z = S.z + fz(S.yaw) * dl + rz(S.yaw) * dt;
      truck.yaw = S.yaw + dyaw;
      const d = ctx.player.drive; if (d) { d.vYaw = truck.yaw; d.dSpeed = 0; }
      return true;
    },
    debugState() {
      const D = save_();
      const p2 = (v) => (v ? { x: +v.x.toFixed(2), z: +v.z.toFixed(2), yaw: v.yaw !== undefined ? +v.yaw.toFixed(3) : undefined } : null);
      return {
        next: D.next == null ? null : +D.next.toFixed(1), first: D.first, last: D.last, holds: holds.length,
        truck: truck ? { mode: truck.mode, driver: truck.driver === 'player' ? 'player' : truck.driver ? 'other' : null, bay: truck.bay, ...p2({ x: truck.pos.x, z: truck.pos.z, yaw: truck.yaw }), busy: busy(truck) } : null,
        calls: calls.map((c) => ({
          id: c.id, spot: c.spot.id, state: c.state, fastLeft: +c.fastLeft.toFixed(1), claimedBy: c.claimedBy, reserved: c.reserved,
          owner: c.owner?.state ?? null, tri: c.tri?.placed ? (c.tri.down ? 'down' : 'up') : 'held', seq: c.seq ? c.seq.phase : null,
          problems: c.problems, type: c.look.type, stop: p2(stagePose(c)), final: p2(finalPose(c)), ring: p2(ringPos(c)),
          tow: c.tow ? { h: +c.tow.h.toFixed(3), F: p2({ x: c.tow.Fx, z: c.tow.Fz }), R: p2({ x: c.tow.Rx, z: c.tow.Rz }), art: +angleDiff(c.truck.yaw, c.tow.h).toFixed(3) } : null,
        })),
      };
    },
  };

  // the garage spawner leaves the next free lane slot to a towed car that has none yet (else it races us for it)
  const fac0 = garage();
  const canSpawn0 = fac0?.hooks.canSpawn;
  const wantsSlot = () => { for (const c of calls) if ((c.state === 'towing' || c.state === 'dropping') && !c.reserved) return true; return false; };
  if (fac0 && canSpawn0) fac0.hooks.canSpawn = (f) => canSpawn0(f) && !wantsSlot();

  function pushCaps(out) {
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      if (c.tow) out.push(c.tow.capsule);
      else if (c.model.group.parent) out.push(c.capsule);
    }
  }
  ctx.capsuleSources.push(pushCaps);

  // a fast rescue pays a gem when its repair pays out
  offs.push(events.on('car:repaired', (e) => {
    const car = e?.car;
    if (!car?.rescue?.fast || car.rescue.paid) return;
    car.rescue.paid = true;
    addGems(RESCUE.gemFast);
    if (ctx.near(car.pos, 2)) ui.floatText(_v.set(car.pos.x + 0.9, (car.pos.y || 0) + 2.2, car.pos.z), '+' + RESCUE.gemFast, 'gem');
  }));

  restore();
  current = api;
  return api;
}

// ------------------------------------------------------------------ debug helpers on window.__game
function installDebug() {
  if (typeof window === 'undefined') return;
  const g = window.__game;
  if (!g) { setTimeout(installDebug, 250); return; }
  if (g.rescue) return;
  /** A rescue call now (at spotId, or a free spot); replaces an open unclaimed call when at maxCalls. */
  g.rescue = (spotId) => current?.debugCall(spotId) ?? null;
  g.rescueState = () => current?.debugState() ?? null;
  g.rescueTruckTo = (dl, dt, dyaw) => current?.debugTruckTo(dl, dt, dyaw) ?? false;
  g.rescueFootprints = (on) => current?.debugFootprints(on) ?? 0;
}
installDebug();
