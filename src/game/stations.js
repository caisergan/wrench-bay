// Part stations along the back wall: restock one part every restock * supply seconds up to stationMax,
// player pickup zone in front (parts fly one by one into the carry stack).
import * as THREE from 'three';
import { createPartStation, createZoneRing } from '../models/index.js';
import { LAYOUT as L, ECONOMY, PROBLEMS } from '../config.js';
import { upgradeValue } from '../core/state.js';
import { ui } from '../ui/index.js';
import { PartStack, makePart } from './stack.js';
import { popIn } from './tween.js';
import { Tag } from './util.js';

class Station {
  constructor(ctx, type, animate) {
    this.ctx = ctx; this.type = type;
    const cfg = L.stations[type];
    this.x = cfg.x; this.z = cfg.z;
    this.model = createPartStation(type);
    this.model.group.position.set(cfg.x, 0, cfg.z);
    ctx.root.add(this.model.group);
    if (animate) popIn(this.model.group, 1, 0.5);
    this.stack = new PartStack(this.model.partAnchor, ctx.root);
    this.zonePos = new THREE.Vector3(cfg.x, 0, cfg.z + L.stationPickupOffsetZ);
    this.zone = createZoneRing(L.stationZoneRadius);
    this.zone.position.x = this.zonePos.x; this.zone.position.z = this.zonePos.z;
    ctx.root.add(this.zone);
    const hw = L.stationSize.w / 2, hd = L.stationSize.d / 2;
    ctx.obstacles.push({ minX: cfg.x - hw, maxX: cfg.x + hw, minZ: L.bounds.minZ - 1, maxZ: cfg.z + hd });
    this.tag = new Tag({ text: '', kind: 'station', icon: type }, 2.25);
    this.tag.setIcon(type);
    this.tag.place(cfg.x, 0, cfg.z);
    this.restockT = 0; this.shown = -1;
    // start stocked so a fresh station (or a reloaded save) is useful right away
    const n = animate ? 2 : ECONOMY.stationMax;
    for (let i = 0; i < n; i++) this.stack.spawn(makePart(type));
  }

  get restockTime() { return PROBLEMS[this.type].restock * upgradeValue('supply'); }

  update(dt) {
    this.model.update(dt);
    const t = this.restockTime;
    if (this.stack.count < ECONOMY.stationMax) {
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
      this.tag.setText(n >= ECONOMY.stationMax ? 'MAX' : String(n));
    }
  }

  inZone(p, r = L.stationZoneRadius) { return Math.hypot(p.x - this.zonePos.x, p.z - this.zonePos.z) < r; }
}

export function createStations(ctx) {
  const map = {};
  const list = [];
  const sys = {
    map, list,
    add(type, animate) {
      if (!map[type]) { map[type] = new Station(ctx, type, animate); list.push(map[type]); }
      return map[type];
    },
    get(type) { return map[type] || null; },
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
