// The player: walks with a mixed part carry stack, hops into waiting cars and drives them onto bays, and drives
// the player's own vehicles (tow truck ...) around town.
// Modes: foot | entering (hop into a car / vehicle) | driving (a customer car) | exiting (hop out) | vehicle
import * as THREE from 'three';
import { createCharacter, playerLook } from '../models/index.js';
import { follow } from '../core/engine.js';
import { input } from '../core/input.js';
import { events } from '../core/events.js';
import { LAYOUT as L, PLAYER, ECONOMY, CAR } from '../config.js';
import { upgradeValue, speedBoostActive, townOpen } from '../core/state.js';
import { ui } from '../ui/index.js';
import { PartStack } from './stack.js';
import { resolveCircle } from './collision.js';
import { hop } from './tween.js';
import { Tag, damp, lerpAngle, angleDiff, clamp } from './util.js';

/**
 * One step of joystick driving (customer cars and player vehicles share the handling).
 * st = { dSpeed, vYaw } (persistent), body = { pos, yaw } (yaw is written back), collide(pos) resolves the
 * position. Returns the real speed moved.
 */
export function joystickDrive(dt, st, maxS, body, collide) {
  const inp = input.vector;
  let target = 0;
  if (inp.mag > 0) {
    const tYaw = Math.atan2(inp.x, inp.z);
    if (st.dSpeed < 0.8) st.vYaw = lerpAngle(st.vYaw, tYaw, damp(12, dt));       // nearly stopped: pivot
    else {
      const turn = (3.6 + 2.2 * Math.min(1, 2.5 / st.dSpeed)) * dt;
      st.vYaw += clamp(angleDiff(st.vYaw, tYaw), -turn, turn);
    }
    const diff = Math.abs(angleDiff(st.vYaw, tYaw));
    target = maxS * inp.mag * (diff > 1.9 ? 0.3 : 1 - 0.45 * (diff / 1.9));
  }
  st.dSpeed += (target - st.dSpeed) * damp(target > st.dSpeed ? 2.8 : 4.8, dt);
  if (st.dSpeed < 0.01) st.dSpeed = 0;
  const px = body.pos.x, pz = body.pos.z;
  body.pos.x += Math.sin(st.vYaw) * st.dSpeed * dt;
  body.pos.z += Math.cos(st.vYaw) * st.dSpeed * dt;
  collide(body.pos);
  const real = Math.hypot(body.pos.x - px, body.pos.z - pz) / dt;
  if (real < st.dSpeed) st.dSpeed = Math.max(real, st.dSpeed - 14 * dt);   // walls eat speed instead of storing it
  if (st.dSpeed > 0.15) body.yaw = lerpAngle(body.yaw, st.vYaw, damp(11, dt));
  return real;
}

export function createPlayer(ctx) {
  const ch = createCharacter(playerLook(), { outfits: true });   // changes into the paint suit (paint.js)
  const group = ch.group;
  group.position.set(L.playerStart.x, 0, L.playerStart.z);
  ctx.root.add(group);
  follow(group);
  ui.seeThrough(group);   // bubbles go see-through while they cover the character

  const stack = new PartStack(ch.carryAnchor, ctx.root, { hopHeight: 0.8 });
  const maxTag = new Tag({ text: 'MAX', kind: 'max' }, 2.45);
  maxTag.setVisible(false);
  const stayTag = new Tag({ text: '', kind: 'info' }, 1.7);
  stayTag.setVisible(false);
  let stayT = 0;

  const vel = new THREE.Vector3();       // intended velocity (smoothed input)
  const prev = new THREE.Vector3();
  const sway = { x: 0, z: 0, vx: 0, vz: 0 };
  let yaw = Math.PI, carrying = false, maxShown = false, workingShown = false;
  let realX = 0, realZ = 0;
  // driving state
  const drv = { dSpeed: 0, vYaw: 0 };

  const player = {
    group, pos: group.position, stack, ch,
    mode: 'foot', car: null, vehicle: null,
    workLift: null, working: false,
    pickTimer: 0, dropTimer: 0,
    speed: 0,           // how fast the character really moved last frame on foot (m/s; 0 off foot)
    stillT: 0,          // seconds on foot below PLAYER.stillSpeed
    get onFoot() { return player.mode === 'foot'; },
    /** In or getting into a customer car (staff logic treats both as "the player is driving"). */
    get driving() { return (player.mode === 'entering' || player.mode === 'driving') && !!player.car; },
    /** In or getting into a player vehicle. */
    get inVehicle() { return !!player.vehicle; },
    capacity: () => Math.round(PLAYER.carryBase + upgradeValue('capacity')),

    teleport(x, z) {
      if (player.mode !== 'foot') return;
      group.position.set(x, 0, z); vel.set(0, 0, 0);
      resolveCircle(group.position, PLAYER.radius, ctx.obstacles, ctx.bounds, ctx.capsules);
    },

    /** Hop into a waiting customer car (cars.js decides when). */
    enterCar(car) {
      if (player.mode !== 'foot') return false;
      player.mode = 'entering';
      player.car = car;
      car.claim = 'player';
      car.sys.leaveLane(car);
      car.mode = 'boarding';
      vel.set(0, 0, 0);
      setWorking(false);
      ui.sfx('pickup');
      hop(group, group.position, (out) => out.set(car.pos.x, 0.5, car.pos.z), {
        duration: 0.3, height: 0.9, scaleFrom: 1, scaleTo: 0.3,
        onComplete: () => {
          group.visible = false;
          group.scale.setScalar(1);
          group.position.set(car.pos.x, 0, car.pos.z);
          player.mode = 'driving';
          car.mode = 'driven';
          drv.dSpeed = 0; drv.vYaw = car.yaw;
          follow(car.group);
          ui.sfx('engine');
          events.emit('drive:start', { facility: car.fac.id });
        },
      });
      return true;
    },

    /** The bay snapped our car: pop out beside it (inside the work zone). */
    exitCar(bay) {
      const car = player.car;
      player.car = null;
      player.mode = 'exiting';
      const from = new THREE.Vector3(car.pos.x, car.pos.y + 0.5, car.pos.z);
      const to = bay.exitSpot(new THREE.Vector3());
      resolveCircle(to, PLAYER.radius, ctx.obstacles, ctx.bounds, ctx.capsules);
      stayTag.setVisible(false);
      popOutTo(from, to, Math.PI, () => events.emit('drive:end', { facility: car.fac.id }));
    },

    /** Hop into a player vehicle (vehicles.js decides when). */
    enterVehicle(v) {
      if (player.mode !== 'foot') return false;
      player.mode = 'entering';
      player.vehicle = v;
      vel.set(0, 0, 0);
      setWorking(false);
      ui.sfx('pickup');
      hop(group, group.position, (out) => out.set(v.pos.x, 0.6, v.pos.z), {
        duration: 0.3, height: 0.9, scaleFrom: 1, scaleTo: 0.3,
        onComplete: () => {
          group.visible = false;
          group.scale.setScalar(1);
          group.position.set(v.pos.x, 0, v.pos.z);
          player.mode = 'vehicle';
          drv.dSpeed = 0; drv.vYaw = v.yaw;
          follow(v.group);
          ui.sfx('engine');
          v.onPlayerIn();
          events.emit('vehicle:enter', { id: v.id });
        },
      });
      return true;
    },

    /** Leave the vehicle (parked in a bay): pop out at `to` (Vector3). */
    exitVehicle(to) {
      const v = player.vehicle;
      player.vehicle = null;
      player.mode = 'exiting';
      resolveCircle(to, PLAYER.radius, ctx.obstacles, ctx.bounds, ctx.capsules, v);
      popOutTo(new THREE.Vector3(v.pos.x, 0.6, v.pos.z), to, Math.atan2(to.x - v.pos.x, to.z - v.pos.z), null);
      events.emit('vehicle:exit', { id: v.id });
    },

    /** Joystick driving state of the current car / vehicle ({ dSpeed, vYaw }). */
    drive: drv,

    update(dt) {
      if (!(dt > 0)) return;
      player.pickTimer -= dt; player.dropTimer -= dt;
      if (player.mode !== 'foot') { player.speed = 0; player.stillT = 0; }
      if (player.mode === 'driving') updateDriving(dt);
      else if (player.mode === 'vehicle') { player.vehicle.drivePlayer(dt, drv); group.position.set(player.vehicle.pos.x, 0, player.vehicle.pos.z); realX = realZ = 0; }
      else if (player.mode === 'foot') updateFoot(dt);
      else ch.update(dt, 0);

      const c = stack.count > 0;
      if (c !== carrying) { carrying = c; ch.setCarrying(c); }
      // spring-based sway of the carried stack, lagging behind movement (carry anchor's local frame)
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const lx = realX * cos - realZ * sin, lz = realX * sin + realZ * cos;
      const tgx = -lx * 0.0055, tgz = -lz * 0.0055;
      sway.vx += ((tgx - sway.x) * 140 - sway.vx * 13) * dt;
      sway.vz += ((tgz - sway.z) * 140 - sway.vz * 13) * dt;
      sway.x += sway.vx * dt; sway.z += sway.vz * dt;
      stack.settle(dt, sway.x, sway.z);

      const full = player.onFoot && stack.count >= player.capacity();
      if (full !== maxShown) { maxShown = full; maxTag.setVisible(full); }
      if (full) maxTag.place(group.position.x, group.position.y, group.position.z);
      if (stayT > 0) { stayT -= dt; if (stayT <= 0) stayTag.setVisible(false); }
    },
    dispose() {
      maxTag.remove(); stayTag.remove();
      ui.seeThrough(null);
      if (player.car && (player.mode === 'driving' || player.mode === 'entering')) events.emit('drive:end', {});
    },
  };

  function popOutTo(from, to, faceYaw, onStart) {
    group.position.copy(from);
    group.scale.setScalar(0.3);
    group.visible = true;
    yaw = faceYaw; group.rotation.y = yaw;
    follow(group);
    onStart?.();
    hop(group, from, to, {
      duration: 0.36, height: 1.1, scaleFrom: 0.3, scaleTo: 1,
      onComplete: () => {
        group.scale.setScalar(1);
        group.position.y = 0;
        player.mode = 'foot';
        ch.cheer?.();
      },
    });
  }

  function setWorking(on) {
    if (on === workingShown) return;
    workingShown = on;
    ch.setWorking(on);
  }

  function updateFoot(dt) {
    const inp = input.vector;
    const max = PLAYER.speed * upgradeValue('speed') * (speedBoostActive() ? 1.5 : 1);
    const tx = inp.x * inp.mag * max, tz = inp.z * inp.mag * max;
    const accelerating = tx * tx + tz * tz > vel.x * vel.x + vel.z * vel.z;
    const k = damp(accelerating ? 14 : 18, dt);
    vel.x += (tx - vel.x) * k; vel.z += (tz - vel.z) * k;

    prev.copy(group.position);
    group.position.x += vel.x * dt; group.position.z += vel.z * dt;
    group.position.y = 0;
    resolveCircle(group.position, PLAYER.radius, ctx.obstacles, ctx.bounds, ctx.capsules);
    realX = (group.position.x - prev.x) / dt; realZ = (group.position.z - prev.z) / dt;
    const speed = Math.hypot(realX, realZ);
    player.speed = speed;
    player.stillT = speed < PLAYER.stillSpeed ? player.stillT + dt : 0;

    const wl = player.workLift;
    if (inp.mag > 0) yaw = lerpAngle(yaw, Math.atan2(inp.x, inp.z), damp(16, dt));
    else if (wl && wl.car) yaw = lerpAngle(yaw, Math.atan2(wl.car.pos.x - group.position.x, wl.car.pos.z - group.position.z), damp(8, dt));
    group.rotation.y = yaw;

    setWorking(player.working);   // bays only let the player work after standing still for PLAYER.stillTime
    ch.update(dt, Math.min(1.2, speed / PLAYER.speed));
  }

  function updateDriving(dt) {
    const car = player.car;
    const area = car.fac.L.driveArea;
    const maxS = ECONOMY.driveSpeed * (1 + (upgradeValue('speed') - 1) * 0.5) * (speedBoostActive() ? 1.25 : 1);
    joystickDrive(dt, drv, maxS, car, (p) => resolveCircle(p, CAR.radius, ctx.carObstacles, area, ctx.capsules, car));
    car.wheelSpeed = drv.dSpeed;
    car.speed = drv.dSpeed;
    group.position.set(car.pos.x, 0, car.pos.z);
    realX = realZ = 0;
    // pushing against the edge of the facility's drive area once the town is open: explain why
    if (townOpen()) {
      const r = CAR.radius + 0.03, inp = input.vector;
      const atEdge = (car.pos.x <= area.minX + r && inp.x < -0.3) || (car.pos.x >= area.maxX - r && inp.x > 0.3)
        || (car.pos.z <= area.minZ + r && inp.z < -0.3) || (car.pos.z >= area.maxZ - r && inp.z > 0.3);
      if (atEdge) {
        if (stayT <= 0) { stayTag.setText(car.fac.stayText); stayTag.setVisible(true); ui.sfx('error'); }
        stayT = 1.6;
        stayTag.place(car.pos.x, 0, car.pos.z);
      }
    }
    car.fac.bays.tryCapture(car);
  }

  return player;
}
