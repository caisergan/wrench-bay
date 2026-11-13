// Part stations along the back wall: restock one part every restock * supply seconds up to stationMax. The player
// picks parts up by standing on the station's floor mat (docs/pickup-redesign):
//   - the mat hands over, fast (pickupInterval), the parts the cars on the bays are still waiting for and nobody is
//     bringing (no mechanic has claimed them, they are not already in the player's hands);
//   - it keeps a free hand for every other part type still needed (a needed part always gives at least one);
//   - anything more only while the player stands still: after pickupExtraWait a ring fills, one part per
//     pickupExtraInterval. So walking across a mat never takes parts nobody needs.
// The mat glows while a bay needs its part and the player has a free hand. One system per facility; a station is
// keyed by its layout key (garage: part type; paint: colour id) and hands out fac.h('partType', key).
import * as THREE from 'three';
import { createFloorMat } from '../models/index.js';
import { ECONOMY, PLAYER } from '../config.js';
import { ui } from '../ui/index.js';
import { PartStack, makePart } from './stack.js';
import { popIn } from './tween.js';
import { Tag, onMat } from './util.js';

export class Station {
  constructor(ctx, fac, key, animate) {
    const L = fac.L;
    this.ctx = ctx; this.fac = fac; this.L = L; this.key = key;
    this.type = fac.h('partType', key);     // part type handed out
    const type = this.type;
    const cfg = L.stations[key];
    this.x = cfg.x; this.z = cfg.z;
    this.model = fac.h('stationModel', key);
    this.model.group.position.set(cfg.x, 0, cfg.z);
    ctx.root.add(this.model.group);
    if (animate) popIn(this.model.group, 1, 0.5);
    this.stack = new PartStack(this.model.partAnchor, ctx.root);
    this.zonePos = new THREE.Vector3(cfg.x, 0, cfg.z + L.stationPickupOffsetZ);   // the mat's centre
    const hw = L.stationSize.w / 2, hd = L.stationSize.d / 2;
    // reaches back to the wall (garage: legacy bounds.minZ - 1)
    const back = L.bounds ? L.bounds.minZ - 1 : (L.walls ? L.walls.minZ - 0.5 : cfg.z - hd - 0.5);
    ctx.obstacles.push({ minX: cfg.x - hw, maxX: cfg.x + hw, minZ: back, maxZ: cfg.z + hd });
    const icon = fac.h('stationIcon', key);
    this.tag = new Tag({ text: '', kind: 'station', icon }, 2.25);
    this.tag.setIcon(icon);
    this.tag.place(cfg.x, 0, cfg.z);
    this.mat = createFloorMat(L.stationMat.w, L.stationMat.d, { icon, tint: this.matTint(), kind: 'station' });
    this.mat.group.position.copy(this.zonePos);
    ctx.root.add(this.mat.group);
    this.visit = null;       // { fast, still, ring } while the player is on the mat
    this.restockT = 0; this.shown = -1;
    // start stocked so a fresh station (or a reloaded save) is useful right away
    const n = animate ? 2 : this.max;
    for (let i = 0; i < n; i++) this.stack.spawn(makePart(type));
  }

  get restockTime() { return this.fac.h('restockTime', this.key); }
  get max() { return this.fac.h('stationMax', this.key); }
  /** CSS colour for the mat icon's var(--c) (paint tanks: the tank's colour). */
  matTint() { return null; }

  update(dt) {
    if (this.ctx.near(this.zonePos, 3)) this.model.update(dt);
    const t = this.restockTime, max = this.max;
    if (this.stack.count < max) {
      this.restockT += dt;
      if (this.restockT >= t) {
        this.restockT = 0;
        this.stack.spawn(makePart(this.type));
      }
      this.model.setProgress(Math.min(1, this.restockT / t));
    } else {
      this.restockT = 0;
      this.model.setProgress(1);
    }
    this.stack.settle(dt);
    const n = this.stack.ready;
    if (n !== this.shown) {
      this.shown = n;
      this.tag.setText(n >= max ? 'MAX' : String(n));
    }
  }

  /** Is the player (position p) standing on this station's mat? */
  onMat(p) { return onMat(p, this.zonePos, this.L.stationMat); }

  /**
   * Hand parts to the player standing on the mat. need = { type: count } still needed by the bays (see neededParts),
   * reserve = other part types still needed (one free hand kept for each).
   */
  pickup(dt, pl, need, reserve) {
    const v = this.visit || (this.visit = { fast: 0, still: 0, ring: 0 });
    const free = pl.capacity() - pl.stack.count;
    const stock = this.stack.ready > 0;
    const n = need[this.type] || 0;
    if (n > 0 && free > 0 && stock && (v.fast === 0 || free - reserve >= 1)) {
      v.still = 0; v.ring = 0;
      if (pl.pickTimer <= 0) {
        this.stack.transferTo(pl.stack);
        pl.pickTimer = ECONOMY.pickupInterval;
        v.fast++;
        ui.sfx('pickup');
      }
    } else if (n === 0 && free > 0 && stock) {
      // nothing (more) needed: extra parts only while standing still, one per filled ring
      if (pl.speed < PLAYER.stillSpeed) v.still += dt; else { v.still = 0; v.ring = 0; }
      if (v.still > ECONOMY.pickupExtraWait) {
        v.ring += dt / ECONOMY.pickupExtraInterval;
        if (v.ring >= 1) {
          v.ring = 0;
          this.stack.transferTo(pl.stack);
          ui.sfx('pickup');
        }
      }
    } else v.ring = 0;
  }

  /**
   * Mat look: empty shelf; the player on it (green, the extra ring, a tick once they hold what is needed); needed by a
   * bay while the player has a free hand (yellow, pulsing); idle. n = parts of this type still needed.
   */
  updateMat(t, here, n, room) {
    const m = this.mat;
    if (this.stack.ready === 0) { m.set('empty'); m.glow(0); return; }
    if (here) {
      const v = this.visit;
      m.set('on', v ? v.ring : 0, !!v && v.fast > 0 && n === 0);
      m.glow(0);
      return;
    }
    const want = room && n > 0;
    m.set(want ? 'want' : 'idle');
    m.glow(want ? 0.1 + 0.1 * Math.sin(t * 6.5) : 0);
  }

  dispose() { this.tag.remove(); this.mat.dispose(); }
}

const WORKING = new Set(['snap', 'raise', 'up']);
const _need = {};

/**
 * Parts the cars on this facility's bays still wait for and nobody is bringing (no mechanic claimed the job, it is
 * not in flight), minus what the player already carries. Reuses one object: { type: count }.
 */
export function neededParts(fac, pl, out = _need) {
  for (const k in out) delete out[k];
  for (const b of fac.bays.list) {
    if (!b || !b.car || !WORKING.has(b.phase)) continue;
    for (const j of b.car.jobs) if (j.state === 'need' && !j.incoming && j.claim === null) out[j.type] = (out[j.type] || 0) + 1;
  }
  for (const k in out) out[k] = Math.max(0, out[k] - pl.stack.countOf(k, true));
  return out;
}

export function createStations(ctx, fac) {
  const map = {};        // layout key -> station
  const byPart = {};     // part type -> station
  const list = [];
  let t = 0;
  const sys = {
    map, list, fac,
    add(key, animate) {
      if (!map[key]) {
        const st = new fac.classes.Station(ctx, fac, key, animate);
        map[key] = st; byPart[st.type] = st; list.push(st);
      }
      return map[key];
    },
    /** Station by part type (garage: same as its key). */
    get(type) { return byPart[type] || map[type] || null; },
    byKey(key) { return map[key] || null; },
    update(dt) {
      t += dt;
      const pl = ctx.player;
      for (const s of list) s.update(dt);
      const need = neededParts(fac, pl);
      for (const s of list) {
        const here = pl.onFoot && s.onMat(pl.pos);
        if (here) {
          let reserve = 0;
          for (const k in need) if (k !== s.type && need[k] > 0 && byPart[k]) reserve++;
          s.pickup(dt, pl, need, reserve);
          neededParts(fac, pl, need);        // the hands may have changed: every mat sees the new counts
        } else s.visit = null;
        s.updateMat(t, here, need[s.type] || 0, pl.onFoot && pl.stack.count < pl.capacity());
      }
    },
    dispose() { for (const s of list) s.dispose(); },
  };
  return sys;
}
