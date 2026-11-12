// Part stations along the back wall: restock one part every restock * supply seconds up to stationMax,
// player pickup zone in front (parts fly one by one into the carry stack). One system per facility; a station is
// keyed by its layout key (garage: part type; paint: colour id) and hands out fac.h('partType', key).
import * as THREE from 'three';
import { createZoneRing } from '../models/index.js';
import { ECONOMY } from '../config.js';
import { ui } from '../ui/index.js';
import { PartStack, makePart } from './stack.js';
import { popIn } from './tween.js';
import { Tag } from './util.js';

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
    this.zonePos = new THREE.Vector3(cfg.x, 0, cfg.z + L.stationPickupOffsetZ);
    this.zone = createZoneRing(L.stationZoneRadius);
    this.zone.position.x = this.zonePos.x; this.zone.position.z = this.zonePos.z;
    ctx.root.add(this.zone);
    const hw = L.stationSize.w / 2, hd = L.stationSize.d / 2;
    // reaches back to the wall (garage: legacy bounds.minZ - 1)
    const back = L.bounds ? L.bounds.minZ - 1 : (L.walls ? L.walls.minZ - 0.5 : cfg.z - hd - 0.5);
    ctx.obstacles.push({ minX: cfg.x - hw, maxX: cfg.x + hw, minZ: back, maxZ: cfg.z + hd });
    const icon = fac.h('stationIcon', key);
    this.tag = new Tag({ text: '', kind: 'station', icon }, 2.25);
    this.tag.setIcon(icon);
    this.tag.place(cfg.x, 0, cfg.z);
    this.restockT = 0; this.shown = -1;
    // start stocked so a fresh station (or a reloaded save) is useful right away
    const n = animate ? 2 : this.max;
    for (let i = 0; i < n; i++) this.stack.spawn(makePart(type));
  }

  get restockTime() { return this.fac.h('restockTime', this.key); }
  get max() { return this.fac.h('stationMax', this.key); }

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

  inZone(p, r = this.L.stationZoneRadius) { return Math.hypot(p.x - this.zonePos.x, p.z - this.zonePos.z) < r; }
}

export function createStations(ctx, fac) {
  const map = {};        // layout key -> station
  const byPart = {};     // part type -> station
  const list = [];
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
      const pl = ctx.player;
      for (const s of list) {
        s.update(dt);
        if (pl.onFoot && pl.pickTimer <= 0 && s.stack.ready > 0 && pl.stack.count < pl.capacity() && s.inZone(pl.pos)) {
          s.stack.transferTo(pl.stack);
          pl.pickTimer = ECONOMY.pickupInterval;
          ui.sfx('pickup');
        }
      }
    },
    dispose() { for (const s of list) s.tag.remove(); },
  };
  return sys;
}
