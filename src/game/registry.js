// Feature registry: how town features plug into the world without editing world.js (TOWN.md section 6a).
// Feature modules register themselves at import time; src/game/features.js imports every feature module.
//
//   registerSystem(id, (ctx) => ({ update(dt, t), dispose() }), { after })   always-on system (traffic, rescue ...)
//   registerPropertySystem(propId, (ctx, prop) => ({ update(dt, t), dispose(), onLevel?(level) }))
//        created when that property's building exists (bought + built, or loaded), disposed on world rebuild
//   registerFacility(def)   def.property = property id that must be owned (built) for it to exist
//        (see facility.js createFacility for the def shape)

export const systems = [];          // { id, factory, after }
export const propertySystems = {};  // propId -> [factory]
export const facilityDefs = {};     // id -> def

export function registerSystem(id, factory, { after = null } = {}) {
  const i = systems.findIndex((s) => s.id === id);
  const entry = { id, factory, after };
  if (i >= 0) systems[i] = entry; else systems.push(entry);
}
export function registerPropertySystem(propId, factory) {
  (propertySystems[propId] ||= []).push(factory);
}
export function registerFacility(def) { facilityDefs[def.id] = def; }
