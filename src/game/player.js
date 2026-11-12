// The player: walks with a mixed part carry stack, hops into waiting cars and drives them onto lifts.
// Modes: foot | entering (hop into a car) | driving | exiting (hop out beside the lift).
import * as THREE from 'three';
import { createCharacter, playerLook } from '../models/index.js';
import { follow } from '../core/engine.js';
import { input } from '../core/input.js';
import { events } from '../core/events.js';
import { LAYOUT as L, PLAYER, ECONOMY, CAR } from '../config.js';
import { upgradeValue, speedBoostActive } from '../core/state.js';
import { ui } from '../ui/index.js';
import { PartStack } from './stack.js';
import { resolveCircle } from './collision.js';
import { hop } from './tween.js';
import { Tag, damp, lerpAngle, angleDiff, clamp } from './util.js';

export function createPlayer(ctx) {
  const ch = createCharacter(playerLook());
  const group = ch.group;
  group.position.set(L.playerStart.x, 0, L.playerStart.z);
  ctx.root.add(group);
  follow(group);

  const stack = new PartStack(ch.carryAnchor, ctx.root, { hopHeight: 0.8 });
  const maxTag = new Tag({ text: 'MAX', kind: 'max' }, 2.45);
  maxTag.setVisible(false);

  const vel = new THREE.Vector3();       // intended velocity (smoothed input)
  const prev = new THREE.Vector3();
  const sway = { x: 0, z: 0, vx: 0, vz: 0 };
  let yaw = Math.PI, carrying = false, maxShown = false, workingShown = false;
  let realX = 0, realZ = 0;
  // driving state
  let dSpeed = 0, vYaw = 0;

  const player = {
    group, pos: group.position, stack, ch,
    mode: 'foot', car: null,
    workLift: null, working: false,
    pickTimer: 0, dropTimer: 0,
    get onFoot() { return player.mode === 'foot'; },
    /** In or getting into a car (staff logic treats both as "the player is driving"). */
    get driving() { return player.mode === 'entering' || player.mode === 'driving'; },
    capacity: () => Math.round(PLAYER.carryBase + upgradeValue('capacity')),

    teleport(x, z) {
      if (player.mode !== 'foot') return;
      group.position.set(x, 0, z); vel.set(0, 0, 0);
      resolveCircle(group.position, PLAYER.radius, ctx.obstacles, L.bounds, ctx.capsules);
    },

    /** Hop into a waiting car (cars.js decides when). */
    enterCar(car) {
      if (player.mode !== 'foot') return false;
      player.mode = 'entering';
      player.car = car;
      car.claim = 'player';
      ctx.cars.leaveLane(car);
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
          dSpeed = 0; vYaw = car.yaw;
          follow(car.group);
          ui.sfx('engine');
          events.emit('drive:start');
        },
      });
      return true;
    },

    /** The lift snapped our car: pop out beside it (inside the work zone). */
    exitCar(lift) {
      const car = player.car;
      player.car = null;
      player.mode = 'exiting';
      const from = new THREE.Vector3(car.pos.x, car.pos.y + 0.5, car.pos.z);
      const to = new THREE.Vector3(lift.x + 0.95, 0, lift.z + L.liftWorkOffsetZ + 0.45);
      resolveCircle(to, PLAYER.radius, ctx.obstacles, L.bounds, ctx.capsules);
      group.position.copy(from);
      group.scale.setScalar(0.3);
      group.visible = true;
      yaw = Math.PI; group.rotation.y = yaw;
      follow(group);
      events.emit('drive:end');
      hop(group, from, to, {
        duration: 0.36, height: 1.1, scaleFrom: 0.3, scaleTo: 1,
        onComplete: () => {
          group.scale.setScalar(1);
          group.position.y = 0;
          player.mode = 'foot';
          ch.cheer?.();
        },
      });
    },

    update(dt) {
      if (!(dt > 0)) return;
      player.pickTimer -= dt; player.dropTimer -= dt;
      if (player.mode === 'driving') updateDriving(dt);
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
    },
    dispose() {
      maxTag.remove();
      if (player.mode === 'driving' || player.mode === 'exiting') events.emit('drive:end');
    },
  };

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
    resolveCircle(group.position, PLAYER.radius, ctx.obstacles, L.bounds, ctx.capsules);
    realX = (group.position.x - prev.x) / dt; realZ = (group.position.z - prev.z) / dt;
    const speed = Math.hypot(realX, realZ);

    const wl = player.workLift;
    if (inp.mag > 0) yaw = lerpAngle(yaw, Math.atan2(inp.x, inp.z), damp(16, dt));
    else if (wl && wl.car) yaw = lerpAngle(yaw, Math.atan2(wl.car.pos.x - group.position.x, wl.car.pos.z - group.position.z), damp(8, dt));
    group.rotation.y = yaw;

    setWorking(player.working && speed < 1.2);
    ch.update(dt, Math.min(1.2, speed / PLAYER.speed));
  }

  function updateDriving(dt) {
    const car = player.car;
    const inp = input.vector;
    const maxS = ECONOMY.driveSpeed * (1 + (upgradeValue('speed') - 1) * 0.5) * (speedBoostActive() ? 1.25 : 1);
    let target = 0;
    if (inp.mag > 0) {
      const tYaw = Math.atan2(inp.x, inp.z);
      if (dSpeed < 0.8) vYaw = lerpAngle(vYaw, tYaw, damp(12, dt));       // nearly stopped: pivot
      else {
        const turn = (3.6 + 2.2 * Math.min(1, 2.5 / dSpeed)) * dt;
        vYaw += clamp(angleDiff(vYaw, tYaw), -turn, turn);
      }
      const diff = Math.abs(angleDiff(vYaw, tYaw));
      target = maxS * inp.mag * (diff > 1.9 ? 0.3 : 1 - 0.45 * (diff / 1.9));
    }
    dSpeed += (target - dSpeed) * damp(target > dSpeed ? 2.8 : 4.8, dt);
    if (dSpeed < 0.01) dSpeed = 0;
    prev.copy(car.pos);
    car.pos.x += Math.sin(vYaw) * dSpeed * dt;
    car.pos.z += Math.cos(vYaw) * dSpeed * dt;
    resolveCircle(car.pos, CAR.radius, ctx.carObstacles, L.bounds, ctx.capsules, car);
    realX = (car.pos.x - prev.x) / dt; realZ = (car.pos.z - prev.z) / dt;
    const real = Math.hypot(realX, realZ);
    if (real < dSpeed) dSpeed = Math.max(real, dSpeed - 14 * dt);   // walls eat speed instead of storing it
    if (dSpeed > 0.15) car.yaw = lerpAngle(car.yaw, vYaw, damp(11, dt));
    car.wheelSpeed = dSpeed;
    car.speed = dSpeed;
    group.position.set(car.pos.x, 0, car.pos.z);
    realX = realZ = 0;
    ctx.lifts.tryCapture(car);
  }

  return player;
}
