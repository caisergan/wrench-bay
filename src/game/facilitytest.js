// ?facilitytest: a second facility instance on the PAINT layout running plain garage behaviour (TOWN.md 6a).
// Proof that the facility framework is not garage-specific: its own customers arrive from the west tunnel, wait in
// the paint forecourt lane, can be driven into a bay (or parked by its valet), get repaired with parts from its own
// stations, pay a cash pile and leave. Garage models stand on the paint shop positions, so it looks wrong on
// purpose; nothing is saved (its unlock chain lives in memory). Opens the town if needed so you can walk there.
// Keep it: feature agents can use it as a minimal working example of registerFacility().
import { PAINT, PART_TYPES } from '../config.js';
import { townOpen, openTown } from '../core/state.js';
import { registerFacility } from './registry.js';

const params = new URLSearchParams(location.search);
const unlocked = new Set();

// garage part stations on the first five paint tank spots
const tanks = Object.values(PAINT.stations);
const stations = {};
PART_TYPES.forEach((t, i) => { stations[t] = tanks[i]; });

registerFacility({
  id: 'test',
  always: () => params.has('facilitytest'),          // exists without a property (real facilities use `property`)
  layout: { ...PAINT, stations },
  stayText: 'Test cars stay at the test shop',
  initial: { stations: PART_TYPES.slice(), bays: [0, 1] },
  unlocks: {
    list: [
      { id: 'test_mech0', type: 'mechanic', index: 0, price: 40, label: 'Test mechanic hired!', pad: { x: -39.8, z: -4.8 } },
      { id: 'test_valet', type: 'valet', price: 60, label: 'Test valet hired!', pad: { x: -25.2, z: 6.2 } },
    ],
    isUnlocked: (id) => unlocked.has(id),
    markUnlocked: (id) => unlocked.add(id),
    price: (u) => u.price,
    event: 'townunlock',
  },
  hooks: {
    // jobs only for part types this facility has a station for
    rollJobs(fac) {
      const types = Object.keys(fac.stations.map);
      const n = 1 + Math.floor(Math.random() * 3);
      return Array.from({ length: n }, () => types[Math.floor(Math.random() * types.length)]);
    },
    spawnInterval: () => 9,
  },
  setup() { if (!townOpen()) openTown(); },
});
