// Single source of truth for layout, palette and economy.
// World units ~ metres. +x = screen right, +z = towards the camera (screen bottom), +y = up.
// The parts wall is at the back (negative z), the lifts in the middle of the hall, the open garage front at
// z = 1.2, then the forecourt (exit lane, lounge, drop-off lane) and the street at the bottom.
// Yaw convention everywhere: yaw = Math.atan2(dx, dz)  (0 faces +z / the camera, +PI/2 faces +x).

export const PALETTE = {
  floorA: 0xd9e0e3,     // polished concrete light
  floorB: 0xc6d0d5,     // concrete dark tile
  bayLine: 0xf6c453,    // painted bay markings
  hazardA: 0xf6c453,    // hazard stripe yellow
  hazardB: 0x2b3640,    // hazard stripe dark
  wall: 0x2f4858,       // deep navy-teal walls
  wallTrim: 0xf26b5b,   // coral trim
  accent: 0xf6c453,     // mustard
  teal: 0x2a9d8f,
  cream: 0xfff6e6,
  outside: 0x7cc6b3,    // sea-glass green ground outside
  forecourt: 0xe6dcc8,  // warm light concrete in front of the garage
  forecourtB: 0xd9cdb5,
  street: 0x5b5f6b,
  streetLine: 0xf3ead8,
  sidewalk: 0xcfc8bd,
  wood: 0xb07a4f,
  woodDark: 0x7a4f32,
  steel: 0x8f9aa3,
  steelDark: 0x5c6670,
  rubber: 0x2b2f36,
  cash: 0x5fbf6a,
  cashDark: 0x3c8c46,
  padFill: 0xf6c453,
  padBase: 0x2f4858,
};

// ---------------------------------------------------------------- problems / parts
// Every problem needs ONE part of the same id, made by the station of the same id.
export const PART_TYPES = ['tire', 'oil', 'battery', 'engine', 'paint'];
export const PROBLEMS = {
  //         problem label              part name            $ per job  seconds of work   station restock s   accent colour
  tire:    { label: 'Flat tire',      part: 'Tire',        price: 10,  work: 1.6, restock: 2.4, color: 0x3a4250 },
  oil:     { label: 'Oil change',     part: 'Oil can',     price: 12,  work: 2.0, restock: 2.8, color: 0xf6c453 },
  battery: { label: 'Dead battery',   part: 'Battery',     price: 20,  work: 2.4, restock: 3.2, color: 0x5aa9e6 },
  engine:  { label: 'Engine trouble', part: 'Engine kit',  price: 34,  work: 3.0, restock: 4.0, color: 0xf26b5b },
  paint:   { label: 'Paint job',      part: 'Paint',       price: 55,  work: 3.8, restock: 4.8, color: 0x9b8fd4 },
};

// Car body types. tier multiplies the repair price. weight = spawn odds.
export const CAR_TYPES = {
  compact: { tier: 1.0,  weight: 30 },
  sedan:   { tier: 1.15, weight: 26 },
  pickup:  { tier: 1.3,  weight: 18 },
  van:     { tier: 1.45, weight: 14 },
  sports:  { tier: 1.8,  weight: 8 },
};
// Every car model fits inside this box (x across, z along). Use it for collision / parking maths.
export const CAR = { width: 1.5, length: 2.8, radius: 0.85 };

// ---------------------------------------------------------------- layout
export const LAYOUT = {
  // Walkable rectangle (player on foot and while driving is clamped to this).
  bounds: { minX: -8.7, maxX: 8.7, minZ: -10.9, maxZ: 10.4 },
  // Garage hall shell: back wall + two side walls. The FRONT (z = maxZ) is fully open.
  walls: { minX: -9.4, maxX: 9.4, minZ: -11.4, maxZ: 1.2, height: 2.6, thickness: 0.4 },
  // Paved forecourt in front of the hall.
  forecourt: { minX: -11.5, maxX: 11.5, minZ: 1.2, maxZ: 11.0 },
  // Street along the bottom. Arriving and leaving cars both travel in +x.
  street: { z: 13.6, halfWidth: 1.9, sidewalkZ: 11.4 },

  // Part stations along the back wall (footprint up to 2.2 wide x 1.2 deep). 'tire' exists from the start.
  stations: {
    tire:    { x: 0.0,  z: -10.2 },
    oil:     { x: -3.2, z: -10.2 },
    battery: { x: 3.2,  z: -10.2 },
    engine:  { x: -6.4, z: -10.2 },
    paint:   { x: 6.4,  z: -10.2 },
  },
  stationSize: { w: 2.2, d: 1.2 },
  stationPickupOffsetZ: 1.5,   // pickup zone centre = station.z + this
  stationZoneRadius: 1.1,

  // Lifts. Index 0 exists from the start. A car on a lift is centred here, nose towards -z (yaw = PI).
  lifts: [
    { x: -2.1, z: -3.4 },
    { x: 2.1,  z: -3.4 },
    { x: -6.3, z: -3.4 },
    { x: 6.3,  z: -3.4 },
  ],
  liftPostOffsetX: 1.15,       // the two posts stand at lift.x -/+ this, same z as the lift
  // Player work zone in front of the car's nose: (lift.x, lift.z + liftWorkOffsetZ), radius liftWorkRadius.
  liftWorkOffsetZ: -2.5,
  liftWorkRadius: 1.15,
  // Where a hired mechanic stands to work on that lift (relative to the lift centre), facing +z.
  mechanicSpotOffset: { x: -0.7, z: -2.2 },
  // Cash for a finished repair lands here (relative to the lift centre).
  liftCashOffset: { x: 1.65, z: -2.3 },
  // A driven car is captured by a FREE lift when |car.x - lift.x| < captureHalfX and car.z < captureMaxZ.
  liftCapture: { halfX: 1.4, maxZ: -0.6 },
  // Walking lane used by staff between the parts wall and the lifts.
  staffLaneZ: -7.4,

  // Drop-off lane on the forecourt: cars wait here heading +x (yaw = PI/2). Slot 0 is the front.
  queueLaneZ: 7.6,
  queueSlots: [{ x: 3.6 }, { x: 0.2 }, { x: -3.2 }, { x: -6.6 }],
  // Player stands here (relative to a waiting car) to get in: north side of the car.
  queuePickupOffsetZ: -1.55,
  queuePickupRadius: 0.9,
  // Arriving cars: spawn -> along the street -> turn in -> along the drop-off lane to their slot.
  carSpawn: { x: -26, z: 14.4 },
  carEntry: [{ x: -12.0, z: 14.4 }, { x: -12.0, z: 7.6 }],
  // Leaving cars: reverse straight back from the lift to (lift.x, exitLaneZ), then drive forward along the exit lane
  // to the pickup stop (the owner hops in), then out along carExit.
  exitLaneZ: 3.0,
  pickupStop: { x: 8.3, z: 3.0 },
  ownerCurb: { x: 8.3, z: 4.2 },          // where the owner waits for the car to pull up
  carExit: [{ x: 13.5, z: 3.0 }, { x: 13.5, z: 12.8 }, { x: 28, z: 12.8 }],

  // Customer lounge (outdoor patio on the right of the forecourt). Owners wait at these spots, facing -z.
  lounge: { minX: 6.0, maxX: 9.2, minZ: 4.5, maxZ: 6.3 },
  loungeSpots: [
    { x: 6.5, z: 5.0 }, { x: 7.3, z: 5.0 }, { x: 8.1, z: 5.0 }, { x: 8.9, z: 5.0 },
    { x: 6.5, z: 5.9 }, { x: 7.3, z: 5.9 }, { x: 8.1, z: 5.9 }, { x: 8.9, z: 5.9 },
  ],
  ownerWalkZ: 6.25,            // owners walk from their car door along this z to the lounge
  coffeeCart: { x: 9.6, z: 7.2 },
  valetStand: { x: 5.2, z: 5.4 },     // valet idles here
  billboard: { x: -8.6, z: 10.9 },

  // Hall extras
  upgradePad: { x: 0, z: -0.9 },      // stepping on it (on foot) opens the upgrades sheet
  toolbox: { x: 0, z: 0.35 },         // decorative tool chest beside the upgrade pad (not an obstacle)
  scrapBin: { x: 8.0, z: -6.4 },      // standing next to it dumps all carried parts
  scrapBinRadius: 1.0,
  mechanicIdle: [{ x: -7.9, z: -7.6 }, { x: -7.9, z: -6.6 }, { x: -7.9, z: -5.6 }],

  playerStart: { x: 0, z: 2.4 },
};

// Ordered unlocks for one garage. Only the next VISIBLE_PADS not-yet-unlocked entries show their pad.
// type: 'station' (key = part type) | 'lift' (index) | 'mechanic' (index) | 'valet' | 'coffee' | 'billboard'
// pad: where the pay pad appears. Defaults: station -> its pickup zone, lift -> the lift centre.
export const UNLOCKS = [
  { id: 'station_oil',     type: 'station', key: 'oil',     price: 25,   label: 'Oil changes unlocked!' },
  { id: 'lift1',           type: 'lift', index: 1,          price: 70,   label: 'New lift!' },
  { id: 'station_battery', type: 'station', key: 'battery', price: 150,  label: 'Battery swaps unlocked!' },
  { id: 'mechanic0',       type: 'mechanic', index: 0,      price: 260,  label: 'Mechanic hired!', pad: { x: -7.0, z: -7.4 } },
  { id: 'lift2',           type: 'lift', index: 2,          price: 420,  label: 'New lift!' },
  { id: 'station_engine',  type: 'station', key: 'engine',  price: 650,  label: 'Engine repairs unlocked!' },
  { id: 'valet',           type: 'valet',                   price: 900,  label: 'Valet hired! Cars park themselves', pad: { x: 5.2, z: 6.2 } },
  { id: 'coffee',          type: 'coffee',                  price: 1200, label: 'Coffee cart! Customers wait longer', pad: { x: 8.2, z: 7.4 } },
  { id: 'lift3',           type: 'lift', index: 3,          price: 1600, label: 'New lift!' },
  { id: 'mechanic1',       type: 'mechanic', index: 1,      price: 2200, label: 'Second mechanic hired!', pad: { x: -7.0, z: -7.4 } },
  { id: 'station_paint',   type: 'station', key: 'paint',   price: 3000, label: 'Paint jobs unlocked!' },
  { id: 'billboard',       type: 'billboard',               price: 4200, label: 'Billboard! More customers and VIPs', pad: { x: -6.8, z: 9.6 } },
  { id: 'mechanic2',       type: 'mechanic', index: 2,      price: 5500, label: 'Third mechanic hired!', pad: { x: -7.0, z: -7.4 } },
];
export const VISIBLE_PADS = 2;

export const ECONOMY = {
  startCash: 0,
  // jobs per car: random in problemsMin..max where max = min(problemsCap, problemsMaxBase + floor(unlockCount / problemsPerUnlocks))
  problemsMin: 1,
  problemsMaxBase: 2,
  problemsCap: 4,
  problemsPerUnlocks: 5,
  stationMax: 4,           // parts a station can hold
  pickupInterval: 0.14,    // seconds between single-part transfers (station -> hands)
  deliverInterval: 0.16,   // seconds between single-part transfers (hands -> car)
  spawnInterval: 6.5,      // seconds between car arrivals with one lift (when the drop-off lane has room)
  spawnIntervalPerLift: 1.0, // ... minus this for every extra lift (floor 2.5 s)
  billboardSpawnMult: 0.7, // spawn interval multiplier once the billboard is unlocked
  patience: 55,            // seconds from parking in the drop-off lane until the owner stops being impressed
  patienceQueueRate: 0.35, // cars waiting behind the front of the lane lose patience at this fraction of the normal rate
  coffeePatienceMult: 1.5,
  speedyBonus: 0.5,        // +50% if the car is finished before patience runs out
  streakStep: 0.05,        // each consecutive speedy repair adds +5% ...
  streakMax: 10,           // ... up to +50%
  vipChance: 0.06,         // gold VIP sports car (never two on the lot at once)
  billboardVipMult: 1.6,   // VIP odds multiplier once the billboard is unlocked
  vipMult: 3,              // VIP pays x3 and drops vipGems gems
  vipGems: 1,
  vipPatienceMult: 0.75,
  mechanicRate: 0.8,       // a mechanic works at this fraction of the player's repair speed
  mechanicCarry: 4,
  mechanicSpeed: 3.1,
  valetDelay: 1.2,         // seconds a car waits in the lane before the valet takes it
  carSpeed: 6.5,           // AI cars
  driveSpeed: 7.5,         // player-driven car
  liftTime: 0.55,          // seconds to raise / lower
  exitGap: 1.3,            // minimum seconds between two cars starting to leave their lifts
  padDrainTime: 1.4,       // seconds to fully pay a pad if you have enough cash
  shopMultiplier: 3,       // prices and income x3 per completed garage
  offlineCapHours: 2,
  offlineEfficiency: 0.4,
};

export const PLAYER = {
  speed: 4.8,
  radius: 0.35,
  carryBase: 3,
  enterCarDelay: 0.3,      // seconds standing in a car's pickup zone before hopping in
};

export const UPGRADES = {
  // level 0 is the base. cost(level) = base * growth^level
  speed:    { label: 'Move speed',     base: 50,  growth: 1.9, max: 8, per: 0.08 },  // +8% per level
  capacity: { label: 'Carry capacity', base: 70,  growth: 2.0, max: 8, per: 1 },     // +1 part per level
  repair:   { label: 'Repair speed',   base: 90,  growth: 1.9, max: 8, per: 0.15 },  // +15% work rate per level (you + mechanics)
  supply:   { label: 'Parts supply',   base: 80,  growth: 1.9, max: 8, per: 0.12 },  // -12% restock time (multiplicative)
  price:    { label: 'Repair price',   base: 140, growth: 2.1, max: 8, per: 0.2 },   // +20% price per level
};

export const BOOSTS = {
  income: { label: '2× Income', duration: 180, cooldown: 300 },
  speed: { label: 'Speed', duration: 90, cooldown: 240 },
};

export const SHOP_NAMES = ['Wrench Bay', 'Piston Pier', 'Gearbox Grove', 'Turbo Terrace'];
