// Harbor Town (TOWN.md 4.1, 4.3, 4.11 gate): opening the town, bounds + static obstacles, properties (for sale ->
// building site -> building -> upgrade pads), the Main Street gate, and the hook points other features use:
// property systems + property facilities (registry.js) are created when a property's building exists.
//
// ctx.town (see TOWN.md 6a):
//   open                     town open (getter)
//   building(id)             model API of a property's building ({ group, update?, ... }) or null
//   prop(id)                 property record { id, def, level, building, group, systems[], facility, state }
//   plot(id)                 plot rect of a property / service
//   padPos(id)               world position of a property's (upgrade) pad
//   districtOpen(id)
//   setGuide(target|null)    guide arrow target ({x,z} or null) - also set from the map (ui:mapTarget)
//   checkOpen()              opens the town when valet + mechanic0 are hired (called on unlocks / load)
import * as THREE from 'three';
import * as M from '../models/index.js';
import { setCameraBounds } from '../core/engine.js';
import { events } from '../core/events.js';
import {
  LAYOUT, TOWN, DISTRICTS, PROPERTIES, SERVICES, BUILD_TIME, PROJECT, PAINT, VIP, LOUNGE, WASH, TOWN_CAR_TYPES, ECONOMY,
} from '../config.js';
import {
  state, isUnlocked, townOpen, openTown, districtOpen, openDistrict, propLevel, nextPropLevel, buyPropLevel, fameLevel,
  shopMult, save, nextShop,
} from '../core/state.js';
import { ui } from '../ui/index.js';
import { tween, ease, popIn } from './tween.js';
import { PayPad } from './pads.js';
import { detach } from './util.js';
import { propertySystems, facilityDefs } from './registry.js';

const _v = new THREE.Vector3();

// ------------------------------------------------------------------ helpers
/** Models return a Group or { group, ...api }: always hand out { group, ...api }. */
export function asModel(m) {
  if (!m) return null;
  if (m.isObject3D) {
    // some factories return the Group itself, optionally with .update / API methods on it
    if (m.group === m) return m;
    return { group: m, update: typeof m.update === 'function' ? m.update.bind(m) : undefined };
  }
  return m.group ? m : null;
}
/** Call a model factory defensively: M[name](...args) ?? a fallback box of size (w, h, d). */
export function makeModel(name, args = [], fallback = null) {
  const fn = M[name];
  let m = null;
  if (typeof fn === 'function') {
    try { m = asModel(fn(...args)); } catch (err) { console.warn('[wrench-bay] model', name, err); }
  }
  return m || (fallback ? { group: fallback() } : null);
}
const box = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
const centre = (r) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });
/** Walls of a hall with an open south front: back, west and east (rect = inner faces, t = thickness). */
function hallWalls(w, t = w.thickness ?? 0.3, frontGap = null) {
  const out = [
    box(w.minX - t, w.maxX + t, w.minZ - t, w.minZ),
    box(w.minX - t, w.minX, w.minZ - t, w.maxZ),
    box(w.maxX, w.maxX + t, w.minZ - t, w.maxZ),
  ];
  if (frontGap) {   // closed front with a door gap [minX, maxX]
    out.push(box(w.minX - t, frontGap.minX, w.maxZ - t, w.maxZ), box(frontGap.maxX, w.maxX + t, w.maxZ - t, w.maxZ));
  }
  return out;
}
let fbGeo = null;
const fbMats = new Map();
/** Plain fallback block (a model factory is missing). */
function fallbackBlock(w, h, d, color = 0x9aa7b0) {
  fbGeo ||= new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  let mat = fbMats.get(color);
  if (!mat) { mat = new THREE.MeshLambertMaterial({ color }); fbMats.set(color, mat); }
  const m = new THREE.Mesh(fbGeo, mat);
  m.scale.set(w, h, d);
  m.castShadow = true; m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** Static obstacles of the open town that do not depend on what is built. */
function townStaticSolids() {
  const W = LAYOUT.walls, T = W.thickness;
  const out = [
    // the garage hall: back + side walls (they used to be the legacy bounds) and the two corner pillars
    box(W.minX - T, W.maxX + T, W.minZ - T, W.minZ),
    box(W.minX - T, W.minX, W.minZ - T, W.maxZ - 0.6),
    box(W.maxX, W.maxX + T, W.minZ - T, W.maxZ - 0.6),
    box(W.minX - T / 2 - 0.48, W.minX - T / 2 + 0.48, W.maxZ - 0.63, W.maxZ + 0.33),
    box(W.maxX + T / 2 - 0.48, W.maxX + T / 2 + 0.48, W.maxZ - 0.63, W.maxZ + 0.33),
  ];
  for (const f of TOWN.fillers) out.push({ ...f });
  for (const w of TOWN.water) out.push({ ...w });
  return out;
}

/**
 * Solid boxes of a property's building when the model does not report its own (group.userData.solids, world
 * coordinates). Halls: walls with the open front; closed Main Street buildings: the plot minus a front strip.
 */
function defaultSolids(id) {
  const p = PROPERTIES[id] || SERVICES[id];
  const plot = p?.plot;
  switch (id) {
    case 'tow': return hallWalls({ minX: plot.minX + 0.3, maxX: plot.maxX - 0.3, minZ: plot.minZ + 0.3, maxZ: plot.maxZ }, 0.3);
    case 'lounge': return hallWalls(LOUNGE.walls, LOUNGE.walls.thickness);
    case 'paint': return hallWalls(PAINT.walls, PAINT.walls.thickness);
    case 'vip': return hallWalls(VIP.walls, VIP.walls.thickness);
    case 'wash': {   // arch posts either side of the exit driveway
      const out = [];
      for (const k in WASH.archZ) {
        const z = WASH.archZ[k];
        out.push(box(WASH.zone.minX - 0.45, WASH.zone.minX - 0.1, z - 0.2, z + 0.2), box(WASH.zone.maxX + 0.1, WASH.zone.maxX + 0.45, z - 0.2, z + 0.2));
      }
      return out;
    }
    case 'showroom': {
      const w = PROJECT.showroom.walls, d = PROJECT.showroom.door, t = 0.3;
      return hallWalls({ ...w, maxZ: w.maxZ }, t, { minX: d.minX, maxX: d.maxX });
    }
    case 'junkyard': {   // fence round the yard, gate gap on the south side
      const t = 0.2, g = PROJECT.junkGate;
      return [
        box(plot.minX, plot.minX + t, plot.minZ, g.z), box(plot.maxX - t, plot.maxX, plot.minZ, g.z),
        box(plot.minX, g.minX, g.z - t, g.z), box(g.maxX, plot.maxX, g.z - t, g.z),
      ];
    }
    case 'diner': case 'depot': case 'academy':
      return [box(plot.minX + 0.4, plot.maxX - 0.4, plot.minZ, plot.maxZ - 3.0)];
    default: return [];
  }
}

/** Building model of a property / service at a level (factory names: TOWN.md section 7). */
function buildingModel(id, level) {
  const fb = () => {
    const g = new THREE.Group();
    const solids = defaultSolids(id);
    const plot = (PROPERTIES[id] || SERVICES[id])?.plot;
    if (solids.length) for (const b of solids) {
      const blk = fallbackBlock(b.maxX - b.minX, id === 'wash' ? 3.2 : 2.6, b.maxZ - b.minZ, 0x8fa3ad);
      blk.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
      g.add(blk);
    } else if (plot) {
      const c = centre(plot), blk = fallbackBlock(3.5, 3, 3.5, 0x8fa3ad);
      blk.position.set(c.x, 0, Math.min(c.z, plot.maxZ - 3));
      g.add(blk);
    }
    g.userData.world = true;
    return g;
  };
  switch (id) {
    case 'tow': return makeModel('createTowShed', [level], fb);
    case 'wash': return makeModel('createWashArches', [level], fb);
    case 'lounge': return makeModel('createLoungeAnnex', [level], fb);
    case 'paint': return makeModel('createPaintHall', [], fb);
    case 'vip': return makeModel('createVipHall', [], fb);
    case 'junkyard': return makeModel('createJunkyard', [], fb);
    case 'diner': return makeModel('createDiner', [level], fb);
    case 'showroom': return makeModel('createShowroom', [], fb);
    case 'gas': return makeModel('createGasStation', [level], fb);
    case 'quickfit': return makeModel('createQuickFit', [level], fb);
    case 'ferry': return makeModel('createFerryTerminal', [], fb);
    case 'depot': return makeModel('createDepot', [], fb);
    case 'academy': return makeModel('createAcademy', [], fb);
    default: return { group: fb() };
  }
}
/** Models that change with the property level (rebuilt on upgrade). */
const LEVELED = new Set(['tow', 'wash', 'lounge', 'diner', 'gas', 'quickfit']);

/** For-sale sign next to the pad (wash: beside the driveway, tow: at the shed plot front). */
function signPos(id) {
  const p = PROPERTIES[id];
  if (id === 'tow') return { x: (p.plot.minX + p.plot.maxX) / 2, z: p.plot.maxZ - 0.9 };
  return { x: p.pad.x + 1.35, z: p.pad.z - 0.95 };
}

/**
 * 'sale' label (falls back to 'price' while the UI kind is missing). Exposes the PayPad label interface:
 * setRemaining(rem, price), setProgress(k), remove(), plus setInfo(info) and place(x, z).
 */
function saleLabel(info, x, z) {
  const pos = new THREE.Vector3(x, 1.25, z);
  let L = ui.label({ text: '', kind: 'sale', worldPos: pos });
  const rich = typeof L.setInfo === 'function';
  if (!rich) { L.remove(); L = ui.label({ text: '', kind: 'price', worldPos: pos }); }
  let cur = { ...info };
  const lab = {
    setInfo(i) { cur = { ...cur, ...i }; if (rich) L.setInfo(cur); else L.setText((cur.locked ? 'Fame ' + cur.fame + ' ' : '') + '$' + ui.fmt(cur.price || 0)); return lab; },
    setRemaining(rem) { return lab.setInfo({ price: rem }); },
    setProgress(k) { L.setProgress?.(k); return lab; },
    setVisible(v) { L.setVisible?.(v); return lab; },
    remove() { L.remove(); },
  };
  lab.setInfo(info);
  return lab;
}

export function createTown(ctx) {
  const root = new THREE.Group();
  root.name = 'town';
  ctx.root.add(root);
  const offs = [];
  const on = (name, fn) => offs.push(events.on(name, fn));

  const recs = {};          // property id -> record
  const services = {};      // service id -> { building, solids, pad }
  const staticSolids = [];  // town-mode boxes (walls, fillers, water, env solids)
  let townMode = false;
  let barriers = [];
  let gate = null;          // Main Street gate while locked: { noGo, panels[], booms[], pad, label }
  let guideTarget = null, guideId = null;
  let salePtr = null, alertPtr = null, guidePtr = null, ptrT = 0;
  let labelT = 0;

  for (const id in PROPERTIES) {
    recs[id] = {
      id, def: PROPERTIES[id], level: 0, building: null, group: null, solids: [], systems: [], facility: null,
      site: null, siteSolids: [], pad: null, label: null, sign: null, padLevel: 0, state: 'none',
    };
  }

  const town = {
    root,
    get open() { return townOpen(); },
    districtOpen,
    building: (id) => recs[id]?.building || services[id]?.building || null,
    prop: (id) => recs[id] || null,
    plot: (id) => (PROPERTIES[id] || SERVICES[id])?.plot || null,
    /** Where a property's next pad is / was (upgradePad ?? pad); districts: their gate pad. */
    padPos(id) {
      const p = PROPERTIES[id] || SERVICES[id] || DISTRICTS[id];
      if (!p) return null;
      const q = (propLevel(id) > 0 && p.upgradePad) || p.pad;
      return q ? { x: q.x, z: q.z } : null;
    },
    checkOpen,
    /** Debug / scripted purchase: the next level of a property (or a district) without paying. */
    buy(id) {
      if (DISTRICTS[id] && id !== 'harbor') return openDistrict(id);
      const rec = recs[id];
      if (!rec || !nextPropLevel(id)) return false;
      if (!districtOpen(rec.def.district)) openDistrict(rec.def.district);
      if (rec.site) return false;
      if (!rec.pad) refreshProps(false);
      if (!rec.pad) return false;
      bought(rec);
      return true;
    },
    setGuide(target, id = null) { guideTarget = target ? { x: target.x, z: target.z } : null; guideId = id; },
    get guideTarget() { return guideTarget; },
    build, update, dispose,
  };

  // ------------------------------------------------------------------ opening the town
  function checkOpen() {
    if (townOpen()) return false;
    if (!isUnlocked('valet') || !isUnlocked('mechanic0')) return false;
    openTown();               // emits town:opened -> enterTownMode(true)
    return true;
  }

  /** Chain barriers along the lot edges until the town opens (decor; the legacy bounds do the blocking). */
  function placeBarriers() {
    const segs = [
      { x: -9.6, z0: 1.75, z1: 6.4 }, { x: -9.6, z0: 8.85, z1: 10.75 },   // west, gap = drop-off lane driveway
      { x: 10.7, z0: 4.35, z1: 10.2 },                                      // east, south of the exit lane
      { z: 10.95, x0: -6.4, x1: 9.7 },                                      // south, along the sidewalk
    ];
    for (const s of segs) {
      const len = s.x0 !== undefined ? s.x1 - s.x0 : s.z1 - s.z0;
      const m = makeModel('createChainBarrier', [len]);
      if (!m) continue;
      const g = m.group;
      if (s.x0 !== undefined) g.position.set((s.x0 + s.x1) / 2, 0, s.z);
      else { g.position.set(s.x, 0, (s.z0 + s.z1) / 2); g.rotation.y = Math.PI / 2; }
      root.add(g);
      barriers.push(g);
    }
  }
  function dropBarriers(animate) {
    const list = barriers;
    barriers = [];
    list.forEach((g, i) => {
      if (!animate) { detach(g); return; }
      tween({ duration: 0.01, delay: 0.15 + i * 0.25, onComplete: () => { g.userData.setDown?.(true); ctx.fx.dust(g.position); } });
      const y0 = g.position.y;
      tween({ duration: 0.6, delay: 1.2 + i * 0.25, ease: ease.inQuad, onUpdate: (e) => { g.position.y = y0 - e * 1.1; }, onComplete: () => detach(g) });
    });
  }

  function enterTownMode(animate) {
    if (townMode) return;
    townMode = true;
    ctx.bounds = TOWN.bounds;
    setCameraBounds(TOWN.camClamp);
    for (const b of townStaticSolids()) staticSolids.push(ctx.solids.add(b));
    let env = [];
    try { env = M.townSolids?.() || []; } catch { env = []; }
    for (const b of env) staticSolids.push(ctx.solids.add({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ }));
    dropBarriers(animate);
    refreshGate(false);
    refreshProps(false);
    refreshServices(false);
    if (animate) {
      ui.sfx('gate');
      ui.toast('The town is open!');
      ctx.fx.confetti(ctx.player.pos);
    }
    updateGuideDefault();
  }

  // ------------------------------------------------------------------ properties
  function propInfo(id) {
    const p = PROPERTIES[id], n = nextPropLevel(id);
    if (!n) return null;
    const blurb = n.level > 1 ? (p.levels[n.level - 1].label || p.blurb) : p.blurb;
    return { name: p.name, blurb, price: n.price, fame: n.fame, locked: n.locked, level: n.level, reason: n.reason };
  }

  /** Make the sale state of every property match the save (signs, pads, buildings). */
  function refreshProps(animate) {
    for (const id in recs) {
      const rec = recs[id], p = rec.def;
      const visible = townOpen() && districtOpen(p.district);
      const lvl = propLevel(id);
      if (!visible) { clearSale(rec); continue; }
      // the building (loaded saves show it at once); the ferry terminal stands there from the start
      if ((lvl > 0 || p.kind === 'goal') && !rec.building && !rec.site) spawnBuilding(rec, lvl, animate && lvl > 0);
      else if (rec.building && rec.level !== lvl && lvl > 0) levelBuilding(rec, lvl, animate);
      rec.level = lvl;
      // the pad for the next level (not while the site is up)
      const n = nextPropLevel(id);
      const wantPad = !!n && !rec.site;
      if (!wantPad) { clearSale(rec); continue; }
      if (rec.pad && rec.padLevel !== n.level) clearSale(rec);
      if (!rec.pad) makeSale(rec, n, animate);
    }
  }

  function makeSale(rec, n, animate) {
    const id = rec.id, p = rec.def;
    const at = (n.level > 1 && p.upgradePad) || p.pad;
    rec.padLevel = n.level;
    rec.label = saleLabel(propInfo(id), at.x, at.z);
    rec.pad = new PayPad(ctx, {
      id: 'prop:' + id + ':' + n.level, pos: at, animate, armOnLeave: true,
      price: () => nextPropLevel(id)?.price ?? 0,
      locked: () => !!nextPropLevel(id)?.locked,
      label: rec.label,
      onLocked: () => {
        const nn = nextPropLevel(id);
        if (!nn) return;
        ui.toast(nn.reason === 'all' ? 'Own every property and finish the garage first' : `Needs fame level ${nn.fame}`);
      },
      onPaid: () => bought(rec),
    });
    if (n.level === 1 && p.kind !== 'goal') {
      const s = signPos(id);
      const sign = makeModel('createForSaleSign');
      if (sign) {
        sign.group.position.set(s.x, 0, s.z);
        root.add(sign.group);
        if (animate) popIn(sign.group, 1, 0.45, 0.2);
        rec.sign = sign;
        sign.setState?.(n.locked ? 'locked' : 'sale');
        rec.signLocked = n.locked;
      }
    }
  }

  function clearSale(rec) {
    if (rec.pad) { rec.pad.remove(); rec.pad = null; }
    if (rec.label) { rec.label.remove(); rec.label = null; }
    if (rec.sign) {
      const g = rec.sign.group;
      tween({ duration: 0.25, ease: ease.inQuad, onUpdate: (e) => g.scale.setScalar(Math.max(0.01, 1 - e)), onComplete: () => detach(g) });
      rec.sign = null;
    }
    rec.padLevel = 0;
  }

  /** The pad has taken the money. */
  function bought(rec) {
    const id = rec.id, p = rec.def;
    const at = { x: rec.pad.pos.x, z: rec.pad.pos.z };
    clearSale(rec);
    const level = buyPropLevel(id);          // saves, emits property:changed
    ui.sfx('unlock');
    ctx.fx.poof(at, 0xf6c453);
    if (p.kind === 'goal') {
      // the ferry: its own system (endgame) takes over; without one, the confirm modal + nextShop
      rec.level = level;
      let handled = false;
      for (const s of rec.systems) if (s.onLevel) { s.onLevel(level, true); handled = true; }
      if (!handled) {
        if (ui.showFerry) ui.showFerry(() => nextShop());
        else nextShop();
      }
      return;
    }
    if (level === 1) startSite(rec);
    else {
      levelBuilding(rec, level, true);
      ui.toast(p.levels[level - 1]?.label || `${p.name} upgraded!`);
      refreshProps(true);
    }
  }

  /** Building site on the plot for BUILD_TIME, then the building pops in. */
  function startSite(rec) {
    const id = rec.id, plot = rec.def.plot;
    const parts = id === 'wash'
      // the wash arches stand over the exit driveway: scaffold towers either side, the lane stays open
      ? [{ minX: plot.minX - 0.5, maxX: WASH.zone.minX - 0.05, minZ: plot.minZ, maxZ: plot.maxZ }, { minX: WASH.zone.maxX + 0.05, maxX: plot.maxX + 0.5, minZ: plot.minZ, maxZ: plot.maxZ }]
      : [plot];
    const sites = [];
    for (const r of parts) {
      const w = r.maxX - r.minX, d = r.maxZ - r.minZ, c = centre(r);
      const m = makeModel('createConstructionSite', [w, d], () => fallbackBlock(w, 0.6, d, 0xd9a521));
      if (!m.group.userData.world) m.group.position.set(c.x, 0, c.z);
      root.add(m.group);
      popIn(m.group, 1, 0.4);
      sites.push(m);
    }
    rec.site = { parts: sites, t: 0, sfxT: 0 };
    ctx.fx.dust(centre(plot));
    ui.sfx('build');
  }

  function updateSite(rec, dt) {
    const s = rec.site;
    s.t += dt;
    const k = Math.min(1, s.t / BUILD_TIME);
    const near = ctx.near(centre(rec.def.plot), 8);
    for (const m of s.parts) { m.setProgress?.(k); if (near) m.update?.(dt); }
    s.sfxT -= dt;
    if (near && s.sfxT <= 0 && k < 0.95) { s.sfxT = 0.9; ui.sfx('build'); }
    if (k < 1) return;
    for (const m of s.parts) detach(m.group);
    rec.site = null;
    const level = propLevel(rec.id);
    rec.level = level;
    spawnBuilding(rec, level, true);
    const c = centre(rec.def.plot);
    ctx.fx.poof(c, 0xe6dcc8);
    ctx.fx.confetti(c);
    ui.sfx('unlock');
    ui.toast(rec.def.levels[0]?.label || `${rec.def.name} is yours!`);
    refreshProps(true);
  }

  function placeBuilding(model, plot) {
    const g = model.group;
    if (!g.userData.world) { const c = centre(plot); g.position.set(c.x, 0, c.z); g.rotation.y = 0; }
    root.add(g);
  }
  function addSolidsFor(id, model) {
    const list = model.group.userData.solids || defaultSolids(id);
    return list.map((b) => ctx.solids.add({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ }));
  }

  /** The building exists (bought + built, or loaded): model, solids, facility, property systems. */
  function spawnBuilding(rec, level, animate) {
    const id = rec.id;
    rec.building = buildingModel(id, Math.max(1, level));
    rec.group = rec.building.group;
    placeBuilding(rec.building, rec.def.plot);
    if (animate) popIn(rec.group, 1, 0.5);
    rec.solids = addSolidsFor(id, rec.building);
    if (level < 1) return;              // ferry terminal before the ticket is bought: scenery only
    rec.level = level;
    for (const did in facilityDefs) {
      const def = facilityDefs[did];
      if (def.property === id && !ctx.facilities[did]) {
        try { rec.facility = ctx.addFacility(def); } catch (err) { console.error('[wrench-bay] facility', did, err); }
      }
    }
    for (const f of propertySystems[id] || []) {
      try { const s = f(ctx, rec); if (s) rec.systems.push(s); } catch (err) { console.error('[wrench-bay] property system', id, err); }
    }
  }

  /** Property went up a level: rebuild a levelled model, tell the systems. */
  function levelBuilding(rec, level, animate) {
    rec.level = level;
    if (LEVELED.has(rec.id) && rec.building) {
      for (const b of rec.solids) ctx.solids.remove(b);
      detach(rec.group);
      rec.building = buildingModel(rec.id, level);
      rec.group = rec.building.group;
      placeBuilding(rec.building, rec.def.plot);
      rec.solids = addSolidsFor(rec.id, rec.building);
      if (animate) { popIn(rec.group, 1, 0.45); ctx.fx.dust(centre(rec.def.plot)); }
    }
    if (animate) ctx.fx.confetti(centre(rec.def.plot));
    for (const s of rec.systems) { try { s.onLevel?.(level, animate); } catch (err) { console.error('[wrench-bay] onLevel', rec.id, err); } }
  }

  // ------------------------------------------------------------------ Main Street gate (district 'main')
  function gateInfo() {
    const D = DISTRICTS.main;
    const locked = fameLevel() < (D.fame || 0);
    return { name: D.label, blurb: 'Ring road, parts depot, academy, diner, salvage yard', price: Math.round(D.price * shopMult()), fame: D.fame, locked, level: 1 };
  }
  function refreshGate(animate) {
    const D = DISTRICTS.main;
    const locked = townOpen() && !districtOpen('main');
    if (locked && !gate) {
      gate = { noGo: ctx.solids.add({ ...D.noGo }), panels: [], booms: [], pad: null, label: null };
      const h = D.hoarding, n = Math.round((h.maxX - h.minX) / 3);
      const step = (h.maxX - h.minX) / n;
      for (let i = 0; i < n; i++) {
        const m = makeModel('createHoardingPanel', [], () => fallbackBlock(step, 2.2, 0.15, 0x2f4858));
        m.group.position.set(h.minX + step * (i + 0.5), 0, h.z);
        root.add(m.group);
        gate.panels.push(m);
      }
      for (const b of D.booms) {
        const m = makeModel('createBoomGate');
        if (!m) continue;
        m.group.position.set(b.x, 0, b.z);
        if (b.x > 0) m.group.rotation.y = Math.PI;      // housing on the outer sidewalk, boom across the avenue
        m.setOpen?.(0);
        root.add(m.group);
        gate.booms.push(m);
      }
      const info = gateInfo();
      gate.label = saleLabel(info, D.pad.x, D.pad.z);
      gate.pad = new PayPad(ctx, {
        id: 'district:main', pos: D.pad, animate, armOnLeave: true,
        price: () => gateInfo().price,
        locked: () => gateInfo().locked,
        label: gate.label,
        onLocked: () => ui.toast(`Needs fame level ${D.fame}`),
        onPaid: () => { const at = { x: D.pad.x, z: D.pad.z }; ctx.fx.poof(at, 0xf6c453); openDistrict('main'); },
      });
    } else if (!locked && gate) openGate(animate);
  }
  /** Bought: panels fall away one after another, booms lift, the noGo box goes. */
  function openGate(animate) {
    const g = gate;
    gate = null;
    ctx.solids.remove(g.noGo);
    if (g.pad) g.pad.remove();
    if (g.label) g.label.remove();
    g.panels.forEach((m, i) => {
      const grp = m.group;
      if (!animate) { detach(grp); return; }
      // from the west alley outwards: nearest panels first
      const d = Math.abs(grp.position.x - DISTRICTS.main.pad.x);
      const delay = 0.2 + d * 0.035;
      tween({
        duration: 0.55, delay, ease: ease.inQuad,
        onUpdate: (e) => { grp.rotation.x = -e * (Math.PI / 2 - 0.05); },
        onComplete: () => {
          if (ctx.near(grp.position, 4)) ctx.fx.dust(grp.position);
          tween({ duration: 0.5, delay: 0.6, onUpdate: (e) => { grp.position.y = -e * 0.4; }, onComplete: () => detach(grp) });
        },
      });
    });
    for (const m of g.booms) {
      if (!animate) { m.setOpen?.(1); continue; }
      tween({ duration: 1.1, delay: 0.4, ease: ease.inOutQuad, onUpdate: (e) => m.setOpen?.(e) });
    }
    // the booms stay (open) as scenery
    if (animate) { ui.sfx('gate'); ui.toast('Main Street is open!'); }
  }

  // ------------------------------------------------------------------ services on Main Street (depot, academy)
  function refreshServices(animate) {
    const want = townOpen() && districtOpen('main');
    for (const id in SERVICES) {
      const S = SERVICES[id];
      if (!want || services[id]) continue;
      const building = buildingModel(id, 1);
      placeBuilding(building, S.plot);
      if (animate) popIn(building.group, 1, 0.5);
      const solids = addSolidsFor(id, building);
      // teal pad in front: townpad:enter { kind } opens the Pro Gear / Academy sheet (after a short pause on it)
      const kind = id === 'depot' ? 'pro' : 'academy';
      const pm = makeModel('createUpgradePad');
      if (pm) { pm.group.position.set(S.pad.x, 0, S.pad.z); root.add(pm.group); }
      services[id] = { building, solids, padModel: pm, kind, pos: S.pad, dwell: 0, on: false };
    }
  }
  function updateServices(dt) {
    const pl = ctx.player;
    for (const id in services) {
      const s = services[id];
      if (ctx.near(s.pos, 6)) { s.padModel?.update?.(dt); s.building.update?.(dt); }
      const inP = pl.onFoot && Math.abs(pl.pos.x - s.pos.x) < 0.7 && Math.abs(pl.pos.z - s.pos.z) < 0.7;
      s.dwell = inP ? s.dwell + dt : 0;
      const onP = inP && (s.on || s.dwell >= 0.4);
      if (onP !== s.on) { s.on = onP; events.emit(onP ? 'townpad:enter' : 'townpad:exit', { kind: s.kind }); }
    }
  }

  // ------------------------------------------------------------------ guide target + pointers (TOWN.md 4.16)
  /** Default guide after the town opens: tow pad until the truck is bought, then the truck until first used. */
  function updateGuideDefault() {
    if (guideId && guideId !== '_auto') return;      // a map target wins
    let t = null;
    if (townOpen()) {
      if (propLevel('tow') === 0) t = PROPERTIES.tow.pad;
      else if (!state.town.hints.truckUsed) {
        const v = ctx.vehicles?.get?.('tow');
        if (v && v.mode === 'parked') t = v.pos;
      }
    }
    if (t) { guideTarget = { x: t.x, z: t.z }; guideId = '_auto'; } else if (guideId === '_auto') { guideTarget = null; guideId = null; }
  }
  function mapTarget(e) {
    const id = e && e.id;
    if (!id) { guideTarget = null; guideId = null; updateGuideDefault(); return; }
    const pos = town.padPos(id) || (TOWN.parking.find((p) => p.id === id));
    const plot = town.plot(id);
    const t = pos || (plot && centre(plot));
    if (t) { guideTarget = { x: t.x, z: t.z }; guideId = id; }
  }
  on('ui:mapTarget', mapTarget);

  function updatePointers() {
    if (!ctx.pointers) return;
    const pl = ctx.player;
    // one sale pointer: the cheapest affordable, unlocked pad in an open district
    let best = null, bestPrice = Infinity;
    if (townOpen()) {
      for (const id in recs) {
        const r = recs[id];
        if (!r.pad || r.pad.locked) continue;
        const rem = r.pad.remaining;
        if (rem <= state.cash && rem < bestPrice) { best = r.pad.pos; bestPrice = rem; }
      }
      if (gate?.pad && !gate.pad.locked && gate.pad.remaining <= state.cash && gate.pad.remaining < bestPrice) best = gate.pad.pos;
    }
    if (best) { salePtr ||= ctx.pointers.add({ kind: 'sale', worldPos: best }); salePtr.setPos(best).setVisible(true); } else salePtr?.setVisible(false);
    // a garage customer about to lose patience while you are out in town
    let alert = null;
    if (townOpen() && Math.hypot(pl.pos.x, pl.pos.z) > 14) {
      for (const car of ctx.facilities.garage?.cars.list || []) {
        if (car.patienceOn && !car.patienceGone && car.patience / car.patienceMax < 0.25) { alert = car.pos; break; }
      }
    }
    if (alert) { alertPtr ||= ctx.pointers.add({ kind: 'alert', text: 'Garage!', worldPos: alert }); alertPtr.setPos(alert).setVisible(true); } else alertPtr?.setVisible(false);
    // guide target
    if (guideTarget) {
      _v.set(guideTarget.x, 0, guideTarget.z);
      if (Math.hypot(pl.pos.x - guideTarget.x, pl.pos.z - guideTarget.z) < 1.4 && guideId && guideId !== '_auto') { guideTarget = null; guideId = null; }
      guidePtr ||= ctx.pointers.add({ kind: 'goal', worldPos: _v });
      guidePtr.setPos(_v).setVisible(!!guideTarget);
    } else guidePtr?.setVisible(false);
  }

  // ------------------------------------------------------------------ fame moments
  on('fame:levelup', (e) => {
    if (ctx.near(ctx.player.pos)) ctx.fx.confetti(ctx.player.pos);
    ui.sfx('fame');
    // new customer car classes: toast, and the next garage arrival is one of them
    for (const u of e?.unlocks || []) {
      if (u.kind !== 'car' || !TOWN_CAR_TYPES[u.id]) continue;
      ui.toast(`New in town: ${TOWN_CAR_TYPES[u.id].label}!`);
      if (ctx.facilities.garage) ctx.facilities.garage.forcedType = u.id;
    }
    // fame-locked pads may have opened
    for (const id in recs) if (recs[id].pad) recs[id].pad.shown = null;
  });

  // ------------------------------------------------------------------ events
  on('town:opened', () => enterTownMode(true));
  on('district:opened', (e) => {
    if (!e || e.id === 'harbor') return;
    refreshGate(true);
    refreshProps(true);
    refreshServices(true);
  });
  on('property:changed', () => updateGuideDefault());
  on('vehicle:enter', () => {
    if (!state.town.hints.truckUsed) { state.town.hints.truckUsed = true; save(); }
    updateGuideDefault();
  });
  on('vehicle:exit', () => updateGuideDefault());

  // ------------------------------------------------------------------ lifecycle
  function build() {
    if (townOpen()) enterTownMode(false);
    else {
      ctx.bounds = LAYOUT.bounds;
      setCameraBounds(null);
      placeBarriers();
      checkOpen();          // a save that qualifies (e.g. hired both before the expansion) opens now, with the moment
    }
  }

  function update(dt, t) {
    for (const id in recs) {
      const r = recs[id];
      if (r.site) updateSite(r, dt);
      if (r.building && ctx.near(centre(r.def.plot), 10)) r.building.update?.(dt, t);
      for (let i = 0; i < r.systems.length; i++) r.systems[i].update?.(dt, t);
      if (r.pad) r.pad.update(dt);
    }
    if (gate) gate.pad.update(dt);               // paying it opens the district (gate -> null)
    if (gate && ctx.near(gate.pad.pos, 6)) for (const m of gate.panels) m.update?.(dt);
    if (townMode) updateServices(dt);
    // sale labels / signs follow fame and cash
    labelT -= dt;
    if (labelT <= 0) {
      labelT = 0.3;
      for (const id in recs) {
        const r = recs[id];
        if (!r.label) continue;
        const info = propInfo(id);
        if (!info) continue;
        r.label.setInfo({ ...info, price: r.pad ? r.pad.remaining : info.price });
        if (r.sign && r.signLocked !== info.locked) { r.signLocked = info.locked; r.sign.setState?.(info.locked ? 'locked' : 'sale'); }
      }
      if (gate?.label) gate.label.setInfo({ ...gateInfo(), price: gate.pad.remaining });
    }
    for (const id in recs) if (recs[id].sign && ctx.near(recs[id].sign.group.position, 3)) recs[id].sign.update?.(dt);
    ptrT -= dt;
    if (ptrT <= 0) { ptrT = 0.25; updateGuideDefault(); updatePointers(); }
  }

  function dispose() {
    for (const off of offs) off();
    for (const id in recs) {
      const r = recs[id];
      for (const s of r.systems) { try { s.dispose?.(); } catch (err) { console.error(err); } }
      r.systems.length = 0;
      if (r.label) r.label.remove();
      if (r.pad && r.pad.ownTag) r.pad.tag.remove();
    }
    for (const id in services) if (services[id].on) events.emit('townpad:exit', { kind: services[id].kind });
    if (gate?.label) gate.label.remove();
    salePtr?.remove(); alertPtr?.remove(); guidePtr?.remove();
    // the world root (and our root inside it) is disposed by world.js; camera back to the legacy clamp
    setCameraBounds(null);
  }

  return town;
}
