// Harbor Town expansion: layout, properties and economy. Design + contracts: TOWN.md.
// Same conventions as config.js: world units ~ metres, +x = screen right (east), +z = towards the camera (south),
// yaw = Math.atan2(dx, dz). Every number of the expansion lives here; never hard-code positions elsewhere.
// This file has no imports on purpose (config.js re-exports it).
//
// Map (not to scale; z grows downwards = south = towards the camera):
//
//   x: -61   -48        -16.5 -13.5        11.4  24.2 27.6        48    61
//  z=-37.5 +----+---------------------------------------------------+----+
//          |fill| junkyard | depot | diner | academy |   showroom   |fill|   north plots (face south)
//  z=-25.1 +----+---------------------------------------------------+----+
//  z=-22   ====================== MAIN STREET (one-way, west) ============    <- district 'main' (paid gate)
//  z=-18.9 +----+ . . . . . . . . . back lane . . . . . . . . . . . +----+
//          |fill| paint shop  |a| tow |  GARAGE  | lounge |a|  VIP  |fill|
//          |    |  (hall +    |l| shed|  (home   | annex  |l|  club |    |   home block (all face south)
//          | gas|  forecourt) |l|     |   lot)   |wash >>>|l|       |q.fit   wash: drive-through heading east,
//          |    |             |l|     |          |  park  |l|       |        out via the east alley (WASH)
//  z=11    +----+---------------------------------------------------+----+
//  z=13.6  ====================== HARBOR STREET (one-way, east) ==========    <- district 'harbor'
//  z=16.7  ~~~~~~~~~~~~~~~~~~~~~~~~ quay, water ~~~~~~~~~~~~~~~~~~~ [ferry]
//
// West Avenue (x = -48, one-way south) and East Avenue (x = 48, one-way north) close the traffic ring:
// Harbor St east -> East Ave north -> Main St west -> West Ave south.

// ---------------------------------------------------------------- town shell
export const TOWN = {
  // Player (on foot or in a vehicle) is clamped to this rectangle once the town is open.
  // Before that the legacy LAYOUT.bounds applies.
  bounds: { minX: -61, maxX: 61, minZ: -37.6, maxZ: 23.5 },
  // Camera target clamp while the town is open.
  camClamp: { minX: -57, maxX: 57, minZ: -33, maxZ: 15.5 },
  // AI cars spawn / despawn here, hidden inside the tunnel mouths at x = +/-64.
  edge: { westX: -72, eastX: 72, tunnelX: 64 },

  // One-way roads. `lanes` are the lane centre lines; dir = travel direction along the axis (+1 / -1).
  roads: {
    harbor: { axis: 'x', z: 13.6, halfWidth: 1.9, from: -72, to: 72, dir: 1, lanes: [12.8, 14.4] },
    main:   { axis: 'x', z: -22,  halfWidth: 1.9, from: -72, to: 72, dir: -1, lanes: [-21.2, -22.8] },
    west:   { axis: 'z', x: -48,  halfWidth: 1.9, from: -23.9, to: 11.7, dir: 1, lanes: [-47.2, -48.8] },
    east:   { axis: 'z', x: 48,   halfWidth: 1.9, from: -23.9, to: 11.7, dir: -1, lanes: [47.2, 48.8] },
  },
  sidewalkWidth: 1.2,           // Harbor St near sidewalk keeps its legacy 0.7 (z 11.0 .. 11.7)
  // Paved lanes the player may walk AND drive on (AI traffic never uses them).
  alleys: {
    west: { minX: -16.5, maxX: -13.5, minZ: -18.9, maxZ: 11.0 },
    east: { minX: 24.2, maxX: 27.2, minZ: -18.9, maxZ: 11.0 },
    back: { minX: -44.9, maxX: 44.9, minZ: -18.9, maxZ: -12.5 },   // service lane behind the home block
  },
  // Home block between the two streets and the two avenues.
  homeBlock: { minX: -44.9, maxX: 44.9, minZ: -18.9, maxZ: 11.0 },
  // Block east of the exit driveway: the car wash (WASH, north part) and a small park (south part, walkable).
  garden: { minX: 15.4, maxX: 23.6, minZ: 2.4, maxZ: 10.8 },
  // Extra paving between the forecourt and the west alley: the tow truck's way in and out of its shed (it reverses in
  // from here) and the west part of the tow drop zone (RESCUE.drop). Keep it empty.
  towApron: { minX: -13.5, maxX: -9.6, minZ: 1.0, maxZ: 6.4 },

  // Solid scenery blocks: filler buildings stand here, nobody walks here (one obstacle box each).
  fillers: [
    { minX: -61, maxX: -51.1, minZ: -18.9, maxZ: -7.0 },     // west of West Ave, north of the gas station
    { minX: 51.1, maxX: 61, minZ: -18.9, maxZ: -7.0 },       // east of East Ave, north of Quick-Fit
    { minX: -61, maxX: -45.5, minZ: -37.6, maxZ: -25.1 },    // north-west corner
    { minX: 45.5, maxX: 61, minZ: -37.6, maxZ: -25.1 },      // north-east corner
  ],
  // Harbor water inside the bounds rectangle (obstacle). The ferry plaza (x >= 50.5) is land.
  water: [{ minX: -61, maxX: 50.4, minZ: 17.0, maxZ: 23.5 }],
  ferryPlaza: { minX: 50.5, maxX: 61, minZ: 15.5, maxZ: 23.5 },

  // Player vehicles can only be left in a parking bay (3.6 x 2.0, painted blue "P"). yaw = rest heading.
  parking: [
    // in the west alley beside the tow shed (user's call 2026-11-13; it used to stand in front of the shed, where the
    // drop zone is now). Parking here: the truck drives round onto the apron and backs into its shed by itself.
    { id: 'home',     x: -14.6, z: -1.2,  yaw: 0 },
    { id: 'paint',    x: -38.5, z: 4.7,   yaw: Math.PI / 2 },
    { id: 'garden',   x: 19.5,  z: 9.6,   yaw: Math.PI / 2 },  // lounge, wash, VIP club
    { id: 'junkyard', x: -27.5, z: -26.4, yaw: -Math.PI / 2 },
    { id: 'depot',    x: -11.5, z: -26.4, yaw: -Math.PI / 2 },
    { id: 'diner',    x: 4.5,   z: -26.4, yaw: -Math.PI / 2 },
    { id: 'academy',  x: 19.5,  z: -26.4, yaw: -Math.PI / 2 },
    { id: 'showroom', x: 25.5,  z: -26.4, yaw: -Math.PI / 2 },
    { id: 'gas',      x: -56,   z: 8.8,   yaw: Math.PI / 2 },
    { id: 'quickfit', x: 56,    z: 8.8,   yaw: Math.PI / 2 },
    { id: 'ferry',    x: 54.5,  z: 17.4,  yaw: Math.PI / 2 },
  ],

  // Bus stops on the kerb on the right of the travel direction (shelter on the sidewalk, glass so the camera sees
  // through it). The bus (traffic) stops in the kerb lane next to it and opens its doors. Keep 3 m either side free.
  busStops: [
    { id: 'harbor', x: -6.0, z: 16.1, road: 'harbor', lane: 14.4 },   // quay side of Harbor St
    { id: 'main',   x: 9.5,  z: -24.5, road: 'main',  lane: -22.8 },  // north side of Main St
  ],
  // 16 golden wrenches hidden around town (collectibles). `d` = district that must be open.
  wrenches: [
    { id: 'w01', x: 2.0,   z: -15.6, d: 'harbor' }, { id: 'w02', x: -30.0, z: -15.2, d: 'harbor' },
    { id: 'w03', x: 38.0,  z: -15.6, d: 'harbor' }, { id: 'w04', x: -15.0, z: -8.0,  d: 'harbor' },
    { id: 'w05', x: 25.7,  z: -6.0,  d: 'harbor' }, { id: 'w06', x: 15.95, z: 10.2,  d: 'harbor' },
    { id: 'w07', x: -26.0, z: 16.1,  d: 'harbor' }, { id: 'w08', x: 8.0,   z: 16.1,  d: 'harbor' },
    { id: 'w09', x: 51.4,  z: 16.2,  d: 'harbor' }, { id: 'w10', x: -58.2, z: 9.6,   d: 'harbor' },
    { id: 'w11', x: 58.6,  z: -5.6,  d: 'harbor' }, { id: 'w12', x: 59.2,  z: 22.2,  d: 'harbor' },
    { id: 'w13', x: -43.0, z: -36.2, d: 'main' },   { id: 'w14', x: -8.5,  z: -35.0, d: 'main' },
    { id: 'w15', x: 7.5,   z: -34.0, d: 'main' },   { id: 'w16', x: 22.5,  z: -36.0, d: 'main' },
  ],
  wrenchGems: 3, wrenchFame: 5, wrenchSetGems: 30,
};

// ---------------------------------------------------------------- districts
// 'lot' = the garage lot (legacy bounds). 'harbor' opens for free the moment the valet AND one mechanic are hired
// (the shop can run without you). `withTown: true` districts open at the same moment (2026-11-13: the whole map is
// open with the town, so the tow truck has the whole ring to answer calls on). Without `withTown` a district is
// bought at its gate pad (price, fame, noGo, hoarding and booms below; town.js builds the gate while it is locked).
export const DISTRICTS = {
  harbor: { label: 'Harbor Street' },
  main: {
    label: 'Main Street', withTown: true, price: 20000, fame: 5, icon: 'map',
    pad: { x: -15.0, z: -16.6 },                                // west alley, just before the hoarding
    // While locked the player cannot pass this box. Hoarding fence along its south edge, boom gates on the avenues.
    noGo: { minX: -61, maxX: 61, minZ: -37.6, maxZ: -18.3 },
    hoarding: { z: -18.6, minX: -44.9, maxX: 44.9 },
    booms: [{ x: -48, z: -18.6 }, { x: 48, z: -18.6 }],
  },
};

// ---------------------------------------------------------------- fame (town-wide reputation level)
export const FAME = {
  maxLevel: 25,
  // XP needed to go from level L to L + 1 (L starts at 0): round(base * (L + 1) ^ exp)
  base: 20, exp: 1.4,
  pricePerLevel: 0.03,          // every level: +3% on every payout (repairs, resprays, VIP, wash, tills)
  gemsPerLevel: 2,
  xp: { repair: 1, speedy: 2, vip: 10, vipPerfect: 16, rescue: 8, respray: 4, washT3: 1, loungeT3: 1, restore: 30, wrench: 5 },
};

// New customer car classes. They join the normal arrivals once the fame level is reached.
// (Kept out of CAR_TYPES so legacy code that iterates CAR_TYPES keeps working; gameplay merges both tables.)
export const TOWN_CAR_TYPES = {
  hatch:    { tier: 1.1,  weight: 22, fame: 2,  label: 'Hatchbacks' },
  suv:      { tier: 1.6,  weight: 14, fame: 4,  label: 'SUVs' },
  muscle:   { tier: 2.0,  weight: 8,  fame: 6,  label: 'Muscle cars' },
  camper:   { tier: 1.7,  weight: 9,  fame: 8,  label: 'Camper vans' },
  roadster: { tier: 2.3,  weight: 6,  fame: 10, label: 'Roadsters' },
  rally:    { tier: 2.6,  weight: 4,  fame: 13, label: 'Rally cars' },
};
// VIP club arrivals (all fit the CAR box 1.5 x 2.8).
export const VIP_CAR_TYPES = {
  supercar: { tier: 2.4, weight: 3 },
  limo:     { tier: 2.6, weight: 2 },   // long luxury saloon
  classic:  { tier: 2.2, weight: 2 },   // open-top classic
  gsuv:     { tier: 2.3, weight: 2 },   // luxury 4x4
};
// Ambient traffic only (never serviced). size = [width, length].
export const TRAFFIC_TYPES = {
  taxi:     { weight: 5, size: [1.5, 2.8] },
  delivery: { weight: 4, size: [1.6, 3.4] },
  bus:      { weight: 2, size: [1.8, 5.2] },
  police:   { weight: 1, size: [1.5, 2.8] },
  icecream: { weight: 1, size: [1.6, 3.2] },
  garbage:  { weight: 1, size: [1.8, 4.2] },
  scooter:  { weight: 3, size: [0.6, 1.5] },
};
export const TRAFFIC = { max: 9, maxBeforeMain: 4, speed: 7.0, spawnEvery: 5.5, activeRadius: 48 };
export const PEDESTRIANS = { max: 12, speed: 1.9, activeRadius: 40 };

// ---------------------------------------------------------------- properties
// Everything the player can buy in town. levels[0] = buying it, later entries = upgrades (pay pad reappears).
// plot = land reserved for it (environment keeps it clear; gameplay spawns the building from models).
// pad = for-sale / upgrade pay pad. kind: 'vehicle' | 'addon' | 'facility' | 'project' | 'business' | 'goal'.
// icon = ui ICON key for the pad's ground tag and pay dock (src/ui/icons.js).
// NPC-run places (no price): see SERVICES.
export const PROPERTIES = {
  tow: {
    name: 'Tow Truck', kind: 'vehicle', district: 'harbor', icon: 'tow',
    blurb: 'Answer rescue calls around town',
    plot: { minX: -13.4, maxX: -10.0, minZ: -5.6, maxZ: 1.0 }, pad: { x: -12.5, z: 5.4 },   // pad x -11.7 -> -12.5 (2026-11-13): clear of the drop zone
    levels: [
      { price: 1500, fame: 0, label: 'Tow truck bought! Rescue calls incoming' },
      { price: 15000, fame: 6, label: 'Heavy wrecker! Faster, better paid rescues' },
      { price: 60000, fame: 11, label: 'Dispatcher hired! Calls get answered for you' },
    ],
  },
  wash: {
    name: 'Car Wash', kind: 'addon', district: 'harbor', icon: 'wash',
    blurb: 'Every car leaving the garage pays for a wash',
    // drive-through on the north part of the garden block (WASH); the rest of the garden stays a park
    plot: { minX: 15.0, maxX: 23.6, minZ: 1.8, maxZ: 5.6 }, pad: { x: 16.4, z: 7.3 },
    levels: [
      { price: 3500, fame: 0, label: 'Car wash open!' },
      { price: 9000, fame: 4, label: 'Wax & polish! Wash pays double' },
      { price: 30000, fame: 9, label: 'Turbo dry! Sparkling cars, more fame' },
    ],
  },
  lounge: {
    name: 'Harbor Lounge', kind: 'addon', district: 'harbor', icon: 'lounge',
    blurb: 'Indoor waiting room: patient customers who tip',
    plot: { minX: 11.4, maxX: 23.4, minZ: -9.8, maxZ: 0.6 }, pad: { x: 15.0, z: -1.6 }, upgradePad: { x: 21.6, z: -1.2 },
    levels: [
      { price: 6000, fame: 2, label: 'Harbor Lounge open! Customers wait longer and tip' },
      { price: 25000, fame: 7, label: 'Grand Lounge! Espresso bar, aquarium, bigger tips' },
    ],
  },
  paint: {
    name: 'Spray Bay', kind: 'facility', district: 'harbor', icon: 'paintShop',
    blurb: 'Paint shop: respray cars in the colour they ask for',
    plot: { minX: -43.5, maxX: -17.5, minZ: -12.5, maxZ: 11.0 }, pad: { x: -30.5, z: 5.0 },
    levels: [{ price: 12000, fame: 3, label: 'Spray Bay paint shop open!' }],
  },
  vip: {
    name: 'Platinum Club', kind: 'facility', district: 'harbor', icon: 'crown',
    blurb: 'VIP area: luxury cars, white-glove service, big money',
    plot: { minX: 27.6, maxX: 44.6, minZ: -12.5, maxZ: 11.0 }, pad: { x: 36.0, z: 5.0 },
    levels: [{ price: 60000, fame: 8, label: 'Platinum Club open! VIPs have their own entrance' }],
  },
  junkyard: {
    name: 'Rust & Gold Salvage', kind: 'project', district: 'main', icon: 'junk',
    blurb: 'Buy wrecks, restore them, sell them for a fortune',
    plot: { minX: -44.5, maxX: -25.5, minZ: -37.5, maxZ: -25.1 }, pad: { x: -35.0, z: -26.4 },
    levels: [{ price: 18000, fame: 6, label: 'Salvage yard is yours! Pick a wreck to restore' }],
  },
  diner: {
    name: 'The Greasy Spoon', kind: 'business', district: 'main', icon: 'diner',
    blurb: 'Diner: earns by itself. Bring lunch to your crew',
    plot: { minX: -7.5, maxX: 6.5, minZ: -37.5, maxZ: -25.1 }, pad: { x: 3.4, z: -26.4 },
    levels: [
      { price: 30000, fame: 7, label: 'The Greasy Spoon is yours!' },
      { price: 60000, fame: 8 }, { price: 120000, fame: 10 }, { price: 240000, fame: 13 }, { price: 480000, fame: 16 },
    ],
  },
  showroom: {
    name: 'Bay Classics', kind: 'project', district: 'main', icon: 'showroom',
    blurb: 'Showroom: restored classics sell for much more',
    plot: { minX: 23.5, maxX: 44.5, minZ: -37.5, maxZ: -25.1 }, pad: { x: 34.0, z: -26.4 },
    levels: [{ price: 80000, fame: 10, label: 'Bay Classics showroom open!' }],
  },
  gas: {
    name: 'Pump & Go', kind: 'business', district: 'harbor', icon: 'pump',
    blurb: 'Gas station: earns by itself, sends you customers',
    plot: { minX: -61, maxX: -51.1, minZ: -7.0, maxZ: 11.0 }, pad: { x: -52.6, z: 9.4 },
    levels: [
      { price: 150000, fame: 12, label: 'Pump & Go is yours!' },
      { price: 280000, fame: 13 }, { price: 520000, fame: 15 }, { price: 950000, fame: 17 }, { price: 1700000, fame: 19 },
    ],
  },
  quickfit: {
    name: 'Quick-Fit Express', kind: 'business', district: 'harbor', icon: 'quickfit',
    blurb: 'Your second workshop, run by its own crew',
    plot: { minX: 51.1, maxX: 61, minZ: -7.0, maxZ: 11.0 }, pad: { x: 52.6, z: 9.4 },
    levels: [
      { price: 400000, fame: 15, label: 'Quick-Fit Express open!' },
      { price: 700000, fame: 16 }, { price: 1200000, fame: 18 }, { price: 2000000, fame: 20 }, { price: 3400000, fame: 22 },
    ],
  },
  ferry: {
    name: 'Ferry Ticket', kind: 'goal', district: 'harbor', icon: 'ferry',
    blurb: 'Sail to the next town: everything there is worth 3x',
    plot: { minX: 50.5, maxX: 61, minZ: 15.5, maxZ: 23.5 }, pad: { x: 56.0, z: 20.0 },
    requiresAll: true,          // every other property at level >= 1 and the garage complete
    levels: [{ price: 2000000, fame: 20, label: 'All aboard!' }],
  },
};
// NPC-run places on Main Street (open with the district, nothing to buy; they sell upgrades).
export const SERVICES = {
  depot:   { name: 'Harbor Parts Co.', plot: { minX: -23.5, maxX: -9.5, minZ: -37.5, maxZ: -25.1 }, pad: { x: -16.5, z: -26.4 } },
  academy: { name: 'Wrench Academy',   plot: { minX: 8.5, maxX: 21.5, minZ: -37.5, maxZ: -25.1 }, pad: { x: 13.0, z: -26.4 }, managerPad: { x: 16.4, z: -26.4 } },
};
export const BUILD_TIME = 3.5;   // seconds a construction site stays up before the building pops in

// ---------------------------------------------------------------- tow truck + rescue calls
export const RESCUE = {
  firstDelay: 5,                // first call after buying the truck (always spot 'h3', close to home)
  interval: [50, 90],           // seconds between calls (after the previous one is delivered)
  intervalMultLv2: 0.75,
  callTime: 75,                 // "fast rescue" window: hook the car within this time for the tip + gem
  jobs: [3, 4],                 // problems on a rescued car
  payMult: [2.5, 3.75, 3.75],   // by truck level: multiplies the whole repair payout of that car
  tipFast: 0.5,                 // +50% on top when hooked within callTime
  gemFast: 1,
  hookRadius: 2.4, hookMaxSpeed: 2.0,
  hookAngle: 1.2,               // rad: truck heading vs car heading allowed when stopping in the hook ring
  maxCalls: 1,                  // open calls at once (a storm event may raise it)
  maxArticulation: 1.25,        // rad: towed car heading vs truck heading, never more (no folding into the truck)
  waveDist: 18,                 // the stranded owner waves at the truck within this distance
  // Tow drop zone (user's call 2026-11-13, replaces the ring in the driveway): the paved patch in front of the tow
  // shed and the garage's west end, between the apron and the drop-off lane. The truck stops with its centre inside
  // the rectangle, heading east (yaws[0], the normal way in: up the driveway, right turn into the zone) or north
  // (yaws[1]) within dropAngle; the towed car is lowered there and drives into the drop-off lane (its path must not
  // cross the truck). maxX keeps clear of cars reversing off the west lift (x -6.3). x / z = the zone centre.
  // pose = where the dispatcher stops (truck centre + heading); from there the truck backs straight into its shed.
  drop: { minX: -11.6, maxX: -7.4, minZ: 1.7, maxZ: 6.4, x: -9.5, z: 4.05, yaw: Math.PI / 2, yaws: [Math.PI / 2, Math.PI],
    // (z 4.0 -> 5.3: after the drop the truck pulls ~1 m on to get its cradles out; further south its nose passes below
    // the cars reversing off the west lift, which stop at z 3.0 + half a car)
    pose: { x: -9.4, z: 5.3, yaw: Math.PI / 2 } },
  dropAngle: 0.8,
  // Level 3: the hired tow driver (dispatcher.js) takes the truck out when the player is not using it.
  dispatcher: { delay: 4, speed: 6.5, cornerSpeed: 3.2, kerbSpeed: 2.2, brakeDist: 4.5, honkAfter: 1.5 },
  truck: { speed: [8.6, 10.0, 10.0], radius: 1.0, length: 3.6, width: 1.7, home: { x: -11.7, z: -2.4, yaw: 0 } },
  // Stranded cars sit fully on the kerb. yaw = car heading. d = district that must be open.
  // keep: what a call needs clear along the kerb (m, measured along the car's heading from the spot): the warning
  // triangle and the owner behind the car (back), the tow truck at its hook-up stop pose ahead of it (ahead), across
  // the full kerb width. For the environment (props / lamp posts / meters must leave this clear; today they only leave
  // +-2 m). (rescue 2026-11-13: h3 x 22 -> 18 off the FRESH BAIT stall; h6 / h7 x +-50.6 -> +-50.25, the truck's
  // stop pose overlapped the gas station / Quick-Fit plots.)
  // (lead 2026-11-13: the environment now keeps exactly this clear, see rescueKeepRect; quay spots re-planned so each
  // stretch misses the zebra landings, the bus stop, the bait stall, piers and wrenches: h1 -36 -> -40, h3 18 -> 17.5,
  // h4 35 -> 41.5, h5 -55 -> -57.5, wrench w09 -> the ferry plaza; boats there moved to mooring balls)
  keep: { back: 4.4, ahead: 7.2 },
  spots: [
    { id: 'h1', x: -40, z: 16.0, yaw: Math.PI / 2, d: 'harbor' }, { id: 'h2', x: -20, z: 16.0, yaw: Math.PI / 2, d: 'harbor' },
    { id: 'h3', x: 17.5, z: 16.0, yaw: Math.PI / 2, d: 'harbor' },  { id: 'h4', x: 41.5, z: 16.0, yaw: Math.PI / 2, d: 'harbor' },
    { id: 'h5', x: -57.5, z: 16.0, yaw: Math.PI / 2, d: 'harbor' }, { id: 'h6', x: -50.25, z: 2.0, yaw: 0, d: 'harbor' },
    { id: 'h7', x: 50.25, z: -3.0, yaw: Math.PI, d: 'harbor' },
    { id: 'm1', x: -34, z: -24.6, yaw: -Math.PI / 2, d: 'main' }, { id: 'm2', x: -2, z: -24.6, yaw: -Math.PI / 2, d: 'main' },
    { id: 'm3', x: 20, z: -24.6, yaw: -Math.PI / 2, d: 'main' },  { id: 'm4', x: 34, z: -24.6, yaw: -Math.PI / 2, d: 'main' },
  ],
};
/**
 * The stretch of kerb a rescue call needs clear (RESCUE.keep along the spot's heading: the triangle and owner behind
 * the car, the tow truck at its stop pose ahead of it), halfW across. Spots are axis-aligned, so this is a box.
 */
export function rescueKeepRect(s, halfW = 0.95) {
  const fx = Math.round(Math.sin(s.yaw)), fz = Math.round(Math.cos(s.yaw)), K = RESCUE.keep;
  const ax = s.x - fx * K.back, bx = s.x + fx * K.ahead, az = s.z - fz * K.back, bz = s.z + fz * K.ahead;
  return { minX: Math.min(ax, bx) - Math.abs(fz) * halfW, maxX: Math.max(ax, bx) + Math.abs(fz) * halfW,
    minZ: Math.min(az, bz) - Math.abs(fx) * halfW, maxZ: Math.max(az, bz) + Math.abs(fx) * halfW };
}

// ---------------------------------------------------------------- car wash "Suds & Shine" (drive-through, garden block)
// Its own building on the north part of the garden block, east of the garage exit driveway. Cars drive through it
// heading east (+x), so the camera sees the whole sequence side-on, left to right. A washing car leaves its lift as
// usual, picks its owner up at LAYOUT.pickupStop, then carries on east past the exit driveway (x 13.5) to the pay
// kiosk, rolls slowly through soap -> brushes -> rinse -> blower, leaves at the east end into the east alley and
// turns south to Harbor St (then east like every leaving car). Cars that do not wash take the exit driveway as before.
export const WASH = {
  laneZ: 3.7,                                   // tunnel axis (car centre line, heading +x)
  // pickupStop -> kiosk: along the exit lane, past the exit driveway, a gentle shift north onto the tunnel axis
  approach: [{ x: 12.2, z: 3.0 }, { x: 14.6, z: 3.3 }, { x: 16.4, z: 3.7 }],
  kioskStop: { x: 16.4, z: 3.7 },               // car centre while the driver pays (window at the kiosk)
  kiosk: { x: 16.3, z: 2.32 },                  // pay terminal on the driver's side (north; front faces the car, +z)
  payTime: 1.3,                                 // seconds stopped at the kiosk
  // x of each stage along the lane, in drive order (the model and the car effects both read these)
  stations: { soap: 18.6, brush: 19.85, rinse: 20.95, dryer: 22.15 },
  tunnel: { minX: 17.7, maxX: 22.9, halfW: 1.55, height: 2.75 },   // open steel gantry, see-through roof
  slowSpeed: 1.15,                              // m/s through the tunnel
  gap: 3.7,                                     // a car enters the tunnel only when the one ahead is this far on
  // tunnel exit -> east alley -> Harbor St lane (then east along it to TOWN.edge.eastX)
  exit: [{ x: 23.8, z: 3.7 }, { x: 25.0, z: 4.1 }, { x: 25.7, z: 5.4 }, { x: 25.7, z: 10.4 }, { x: 26.7, z: 12.8 }],
  // walk-blocking parts are the model's own solids; this is the drive lane (kept clear by the environment)
  zone: { minX: 14.6, maxX: 23.6, minZ: 2.6, maxZ: 4.8 },
  fee: [18, 40, 80],            // by tier; x car tier x price upgrade x shopMult x fame
  dirtyChance: 0.6,             // share of arriving garage cars that are visibly dirty (setDirt 0.3 .. 1)
  cleanCarsFromLevel: 2,        // level 1: only dirty cars take a wash; from this level every leaving car does
  pile: { x: 23.05, z: 6.35 },  // coins land here (south of the tunnel exit, on the park side)
  vacuums: [{ x: 17.15, z: 9.0 }, { x: 21.85, z: 9.0 }],   // coin-op vacuum pillars either side of the garden P bay
};

// ---------------------------------------------------------------- waiting lounge (annex east of the hall)
// Tier 0 = the legacy patio (LAYOUT.loungeSpots). Tier 1 / 2 = property 'lounge' level 1 / 2.
export const LOUNGE = {
  walls: { minX: 11.4, maxX: 23.4, minZ: -9.8, maxZ: 0.6, height: 2.6, thickness: 0.3 },   // front (maxZ) open
  tiers: [
    { patience: 1.0, tip: 0, vending: 0 },
    { patience: 1.35, tip: 0.08, vending: 3 },
    { patience: 1.7, tip: 0.15, vending: 6 },
  ],
  vendingAfter: 10,             // seconds seated before a customer buys a snack ($vending x shopMult, once)
  // 12 sofa seats, sitting, facing west (yaw -PI/2) towards the TV on the west wall.
  seats: [
    { x: 15.2, z: -8.2 }, { x: 15.2, z: -7.0 }, { x: 15.2, z: -5.8 }, { x: 15.2, z: -4.6 }, { x: 15.2, z: -3.4 }, { x: 15.2, z: -2.2 },
    { x: 18.8, z: -8.2 }, { x: 18.8, z: -7.0 }, { x: 18.8, z: -5.8 }, { x: 18.8, z: -4.6 }, { x: 18.8, z: -3.4 }, { x: 18.8, z: -2.2 },
  ],
  seatYaw: -Math.PI / 2,
  aisleX: [13.9, 17.5],         // walk along this x to reach a seat of column 0 / 1
  door: { x: 13.6, z: 1.4 },    // owners enter / leave through the open front here
  // Zebra crossing over the exit lane. Cars stop while an owner is on it.
  crossing: { minX: 9.9, maxX: 11.3, minZ: 2.1, maxZ: 3.9, x: 10.6 },
  tipTray: { x: 13.0, z: -0.9 },                              // reception desk; tips pile up here
  vending: { x: 21.0, z: -9.2 }, vendingPile: { x: 21.0, z: -7.9 },
  tv: { x: 11.6, z: -5.2 },
  // tier 2 extras
  bar: { x: 22.6, z: -5.0 }, aquarium: { x: 15.0, z: -9.4 }, arcade: { x: 12.1, z: -8.6 },
};

// ---------------------------------------------------------------- paint shop "Spray Bay"
// Same floor plan grammar as the garage (LAYOUT): stations on the back wall, bays in the middle, work zone in
// front of the car's nose, drop-off lane on the forecourt heading +x, exit lane at z = 3.
export const PAINT_COLORS = {
  red:    { hex: 0xe5484d, label: 'Signal red' },
  blue:   { hex: 0x3b82c4, label: 'Harbor blue' },
  white:  { hex: 0xf4f1ea, label: 'Pearl white' },
  lime:   { hex: 0x9bcf3a, label: 'Lime' },
  teal:   { hex: 0x2a9d8f, label: 'Sea teal' },
  black:  { hex: 0x2b2f36, label: 'Midnight' },
  gold:   { hex: 0xd9a521, label: 'Metallic gold', premium: true },
  purple: { hex: 0x8e5bd1, label: 'Candy purple', premium: true },
};
export const PAINT = {
  walls: { minX: -41.2, maxX: -19.8, minZ: -11.4, maxZ: 1.2, height: 2.6, thickness: 0.4 },
  forecourt: { minX: -43.5, maxX: -17.5, minZ: 1.2, maxZ: 11.0 },
  // Spray booths (index 0 from the start). Car centred here, nose towards -z (yaw = PI).
  // A booth is 3.6 x 6.1: the car drives in at the south end (a clear roll-down curtain closes it while spraying
  // and curing); the north end is the open personnel end where the painter stands, so the work mat in front of
  // the nose (bay.z + workOffsetZ) is inside the glass. Design: docs/town-agents/briefs/painthall.txt.
  bays: [{ x: -34.6, z: -3.4 }, { x: -27.4, z: -3.4 }],
  boothHalfW: 1.8, boothZ: [-6.9, -0.8],                        // glass side walls (obstacles); north end clear of the staff lane
  bayPostOffsetX: 1.8,
  workOffsetZ: -2.25, workMat: { w: 1.5, d: 1.0 },
  staffSpotOffset: { x: -0.7, z: -2.2 },
  cashOffset: { x: 2.6, z: -2.3 },
  capture: { halfX: 1.4, maxZ: -0.6 },
  staffLaneZ: -7.4,
  // Paint feed rack against the outside of each booth's west glass wall, just south of its control column (offsets
  // from the bay = car centre). Canisters are loaded into it from its mat (outside the booth); then the painter goes in
  // through the north end and sprays from the work mat: the rack feeds the gun through the wall.
  feed: { x: -2.1, z: -1.95 }, feedMat: { x: -2.87, z: -1.95, w: 0.95, d: 1.3 },
  chip: { y: 0.3, dz: 0.75 },                                   // booth status chip: height, metres in front of the booth's mouth
  // Paint tanks along the back wall, keyed by colour id. red / blue / white exist from the start.
  stations: {
    red: { x: -39.2, z: -10.2 }, blue: { x: -36.7, z: -10.2 }, white: { x: -34.2, z: -10.2 }, lime: { x: -31.7, z: -10.2 },
    teal: { x: -29.2, z: -10.2 }, black: { x: -26.7, z: -10.2 }, gold: { x: -24.2, z: -10.2 }, purple: { x: -21.7, z: -10.2 },
  },
  stationSize: { w: 1.9, d: 1.2 }, stationPickupOffsetZ: 1.2, stationMat: { w: 1.3, d: 0.95 },
  // Slots sit west of the prep desk and the shelter (as the garage's do), so the prep tech's route to a booth
  // clears them: slot -> (x + 0.4, laneZ - 2.4) -> booth.
  queueLaneZ: 7.6, queueSlots: [{ x: -28.0 }, { x: -31.6 }, { x: -35.2 }],
  queuePickupOffsetZ: -1.55, queuePickupRadius: 0.9,
  carEntry: [{ x: -42.2, z: 14.4 }, { x: -42.2, z: 7.6 }],
  exitLaneZ: 3.0, pickupStop: { x: -21.6, z: 3.0 }, ownerCurb: { x: -21.6, z: 4.2 },
  carExit: [{ x: -18.7, z: 3.0 }, { x: -18.7, z: 12.8 }],       // then east along Harbor St to TOWN.edge.eastX
  // Customers wait under the awning in front of the hall.
  loungeSpots: [
    { x: -23.6, z: 5.0 }, { x: -22.8, z: 5.0 }, { x: -22.0, z: 5.0 }, { x: -21.2, z: 5.0 }, { x: -23.6, z: 5.9 }, { x: -22.8, z: 5.9 },
  ],
  ownerWalkZ: 6.25,
  valetStand: { x: -25.0, z: 5.4 },                             // prep tech idles here
  staffIdle: [{ x: -39.8, z: -3.0 }, { x: -39.8, z: -2.0 }],    // painters wait by their lockers (the drum has the corner)
  // Player may drive a customer's car anywhere inside this rectangle (not out into town).
  driveArea: { minX: -43.5, maxX: -17.5, minZ: -10.9, maxZ: 11.0 },
  // Waste-paint drum against the west wall at the end of the walkway, next to the first tank: walking up to it with
  // canisters dumps them (wrong colours). Trigger = radius + player radius + 0.15, kept clear of the red tank's ring.
  scrapBin: { x: -40.7, z: -7.3 }, scrapBinRadius: 0.55,

  // Fixed fittings of the hall (createPaintHall reads these; gameplay keeps its own positions above clear of them).
  decor: {
    sign: { x: -30.5, w: 5.4, h: 1.35 },                        // "SPRAY BAY" board on top of the back wall
    stacks: [{ x: -36.9, z: -12.15 }, { x: -24.1, z: -12.15 }], // booth exhaust stacks behind the back wall
    stackH: 4.4, stackR: 0.28,
    // plant yard outside the west wall (front +x, towards the wall): compressor, air receiver, dryer, flammables
    compressor: { x: -42.55, z: -9.0 }, receiver: { x: -42.55, z: -6.3 }, dryer: { x: -42.55, z: -4.2 },
    flammables: { x: -42.55, z: -2.0 },
    airLineY: 2.3, manifoldY: 1.72,                             // blue air line / paint supply manifold on the walls
    // glass-walled mixing room in the front-east corner, door in its west wall, shop window onto the forecourt
    colourLab: { minX: -23.4, maxX: -19.8, minZ: -2.8, maxZ: 1.2, doorZ: -1.0, doorW: 0.9 },
    // painters' corner along the west wall
    lockers: { x: -40.95, z0: -3.4, z1: -1.6 },                 // three PPE lockers against the wall
    suitRack: { x: -41.05, z0: -1.3, z1: -0.3 },                // wall hooks: overalls + respirators
    gunWash: { x: -40.3, z: 0.45 },                             // spray-gun washer cabinet
    maskTrolley: { x: -38.3, z: -0.9 },                         // masking-paper trolley beside booth 1
    // waiting shelter on the forecourt island (cantilevered clear roof, posts at the two ends only)
    shelter: { minX: -24.3, maxX: -20.2, minZ: 4.55, maxZ: 6.3, roofY: 2.35, postZ: 5.45 },
    prepDesk: { x: -25.0, z: 4.6 },                             // prep tech's key podium (the prep tech idles at valetStand)
    planters: [{ x: -38.0 }, { x: -33.5 }, { x: -29.0 }, { x: -24.5 }, { x: -21.0 }], planterZ: 10.6,
  },

  // economy
  spawnInterval: 11, spawnIntervalPerBay: 3,                    // seconds between paint customers
  spawnPerColor: 0.03,                                          // each colour stocked beyond 3: 3% shorter interval
  sameColorDist: 70,                                            // RGB distance under which a colour counts as the car's own
  patience: 75,
  cans: { default: 2, pickup: 3, van: 3, suv: 3, camper: 3, limo: 3 },   // canisters per car type
  pricePerCan: 55, work: 2.4, restock: 3.4, stationMax: 4,
  cure: 6.0, cureIR: 3.0,                                       // seconds under the lamps after spraying
  curtainUp: 1.0,                                               // seconds after curing before the car may back out
  premiumMult: 1.6,                                             // gold / purple jobs
  stripeChance: 0.3, stripeMult: 1.5,                           // two-tone: +1 canister of a second colour
  offlineCarTime: 24,                                           // offline: seconds one painter + booth needs per car
};
// Unlock chain inside the paint shop (pay pads, the next VISIBLE_PADS shown; same grammar as UNLOCKS).
// type: 'tank' (key = colour) | 'bay' (index) | 'painter' (index) | 'preptech' | 'irlamps' | 'stripes'
export const PAINT_UNLOCKS = [
  { id: 'paint_lime',    type: 'tank', key: 'lime',    price: 1500,  label: 'Lime paint in stock!' },
  { id: 'painter0',      type: 'painter', index: 0,    price: 4000,  label: 'Painter hired!', pad: { x: -39.8, z: -4.8 } },
  { id: 'paint_teal',    type: 'tank', key: 'teal',    price: 5000,  label: 'Sea teal paint in stock!' },
  { id: 'paint_bay1',    type: 'bay', index: 1,        price: 8000,  label: 'Second spray booth!' },
  { id: 'paint_black',   type: 'tank', key: 'black',   price: 7000,  label: 'Midnight paint in stock!' },
  { id: 'preptech',      type: 'preptech',             price: 12000, label: 'Prep tech hired! Cars roll into the booths', pad: { x: -25.0, z: 6.2 } },
  { id: 'irlamps',       type: 'irlamps',              price: 16000, label: 'Infra-red lamps! Paint cures twice as fast', pad: { x: -31.0, z: -0.4 } },
  { id: 'painter1',      type: 'painter', index: 1,    price: 24000, label: 'Second painter hired!', pad: { x: -39.8, z: -4.8 } },
  { id: 'paint_gold',    type: 'tank', key: 'gold',    price: 36000, label: 'Metallic gold! Premium resprays' },
  { id: 'paint_purple',  type: 'tank', key: 'purple',  price: 48000, label: 'Candy purple! Premium resprays' },
  { id: 'stripes',       type: 'stripes',              price: 65000, label: 'Stripe kit! Two-tone jobs pay more', pad: { x: -31.0, z: -0.4 } },
];

// ---------------------------------------------------------------- VIP area "Platinum Club"
export const VIP = {
  walls: { minX: 28.4, maxX: 43.8, minZ: -11.4, maxZ: 1.2, height: 2.6, thickness: 0.4 },
  forecourt: { minX: 27.6, maxX: 44.6, minZ: 1.2, maxZ: 11.0 },
  bays: [{ x: 32.2, z: -3.4 }, { x: 36.6, z: -3.4 }],           // gold lifts (index 0 from the start)
  bayPostOffsetX: 1.15,
  workOffsetZ: -2.25, workMat: { w: 1.5, d: 1.0 },
  staffSpotOffset: { x: -0.7, z: -2.2 },
  cashOffset: { x: 1.65, z: -2.3 },
  capture: { halfX: 1.4, maxZ: -0.6 },
  staffLaneZ: -7.4,
  stations: { premium: { x: 34.4, z: -10.2 } },                 // premium parts cabinet: one "premium kit" fits any VIP job
  stationSize: { w: 2.2, d: 1.2 }, stationPickupOffsetZ: 1.2, stationMat: { w: 1.3, d: 0.95 },
  queueLaneZ: 7.6, queueSlots: [{ x: 39.6 }, { x: 36.0 }],      // red-carpet drop-off
  queuePickupOffsetZ: -1.55, queuePickupRadius: 0.9,
  carEntry: [{ x: 29.4, z: 14.4 }, { x: 29.4, z: 7.6 }],
  // After the repair the car backs out of the lift onto the detailing turntable.
  turntable: { x: 35.0, z: 4.1, r: 2.0 },
  polishRing: { inner: 2.1, outer: 3.3 },                       // walk a lap in this ring to polish the 4 sides
  carExit: [{ x: 43.6, z: 4.1 }, { x: 43.6, z: 12.8 }],         // then east along Harbor St
  redCarpet: { x: 40.8, zFrom: 6.6, zTo: 1.2, width: 1.2 },
  // VIP lounge inside the hall (sitting, facing west towards the lifts).
  loungeSpots: [{ x: 40.3, z: -8.0 }, { x: 41.9, z: -8.0 }, { x: 40.3, z: -5.6 }, { x: 41.9, z: -5.6 }],
  bar: { x: 43.0, z: -6.8 },
  ownerWalkZ: 6.25,
  valetStand: { x: 41.9, z: 6.3 },                              // host
  staffIdle: [{ x: 29.3, z: -7.6 }, { x: 29.3, z: -6.4 }],      // master tech, detailer
  driveArea: { minX: 27.6, maxX: 44.6, minZ: -10.9, maxZ: 11.0 },

  // economy
  spawnInterval: 45, paparazziMult: 0.6,
  patience: 60, barPatienceMult: 1.5,
  jobs: [2, 4],                 // jobs per VIP car, any garage problem type (shown with gold icons)
  mult: 5,                      // VIP pays x5 (replaces ECONOMY.vipMult for club cars)
  kitRestock: 3.2, kitMax: 4, work: 2.6,
  // 3 stars: careful (no bump while you drive it), fast (patience left), spotless (all 4 sides polished).
  starBonus: 0.2,               // each star: +20%
  bumpSpeed: 1.5,               // an impact faster than this while driving a VIP car costs the "careful" star
  polishTime: 0.9,              // seconds near one side to polish it
  gems: 1, gemsPerfect: 2,
};
// type: 'bar' | 'tech' | 'host' | 'bay' (index) | 'detailer' | 'paparazzi'
export const VIP_UNLOCKS = [
  { id: 'vip_bar',      type: 'bar',          price: 20000,  label: 'Sparkling bar! VIPs wait longer', pad: { x: 42.4, z: -3.4 } },
  { id: 'vip_tech',     type: 'tech',         price: 35000,  label: 'Master tech hired!', pad: { x: 30.0, z: -7.2 } },
  { id: 'vip_host',     type: 'host',         price: 45000,  label: 'Host hired! VIP cars are parked with care', pad: { x: 41.9, z: 8.9 } },
  { id: 'vip_bay1',     type: 'bay', index: 1, price: 70000, label: 'Second gold lift!' },
  { id: 'vip_detailer', type: 'detailer',     price: 90000,  label: 'Detailer hired! Cars get polished for you', pad: { x: 30.6, z: 2.2 } },
  { id: 'vip_paparazzi', type: 'paparazzi',   price: 120000, label: 'Paparazzi wall! More VIPs arrive', pad: { x: 31.0, z: 9.4 } },
];

// ---------------------------------------------------------------- side businesses (earn by themselves)
// income = $ per minute at level 1..5 (x shopMult x fame). The till holds at most capMinutes of income.
export const BUSINESS = {
  diner:    { income: [40, 90, 180, 330, 560],        capMinutes: 10, till: { x: -0.5, z: -27.0 } },
  gas:      { income: [220, 420, 780, 1400, 2500],    capMinutes: 10, till: { x: -53.0, z: -1.6 }, spawnBonusPerLevel: 0.04 },
  quickfit: { income: [650, 1150, 2000, 3400, 5600],  capMinutes: 10, till: { x: 53.0, z: 0.6 } },
};
// Diner lunch run: carry lunch boxes from the diner to the crew table in the garage -> crew buff.
export const LUNCH = { pickup: { x: -2.6, z: -27.0 }, table: { x: -7.9, z: -8.9 }, boxes: 3, restock: 30, buff: 1.25, duration: 180 };

// AI visits (traffic cars that pull in). Paths in world coordinates; `stop` = index of the waypoint they wait at.
export const VISITS = {
  gas:      { from: 'west', path: [{ x: -48.8, z: -2.0 }, { x: -53.0, z: 1.5 }, { x: -55.0, z: 4.0 }, { x: -55.0, z: 9.2 }, { x: -53.0, z: 12.8 }], stop: 2, wait: 6 },
  quickfit: { from: 'harbor', path: [{ x: 53.0, z: 12.8 }, { x: 56.0, z: 9.0 }, { x: 56.0, z: 3.0 }, { x: 58.6, z: 6.0 }, { x: 58.6, z: 12.8 }], stop: 2, wait: 8 },
};

// ---------------------------------------------------------------- project cars (junkyard -> restore -> showroom)
// price = wreck at the junkyard, value = sale price when restored (x shopMult x fame; x showroomMult if you own
// the showroom; +polishBonus if it was polished on the VIP turntable).
export const CLASSICS = [
  { id: 'bubble',  name: 'Bubble 58',     price: 2000,   value: 9000 },
  { id: 'woody',   name: 'Woody Wagon',   price: 6000,   value: 26000 },
  { id: 'surfvan', name: 'Surf Bus',      price: 15000,  value: 62000 },
  { id: 'hotrod',  name: 'Flame Rod',     price: 40000,  value: 160000 },
  { id: 'finback', name: 'Finback Eight', price: 100000, value: 390000 },
  { id: 'gt',      name: 'Gran Corsa',    price: 250000, value: 950000 },
];
export const PROJECT = {
  stands: [{ x: -41.0, z: -33.0 }, { x: -36.0, z: -33.0 }, { x: -31.0, z: -33.0 }],   // wrecks on offer (yaw PI: nose north)
  standPadOffsetZ: 3.0,         // pay pad in front of each stand
  refresh: 300,                 // seconds until an unsold stand rolls a new wreck
  mechJobs: ['tire', 'tire', 'oil', 'battery', 'engine', 'engine'],   // stage 1 on any garage lift (needs all 5 stations)
  paintCans: 3,                 // stage 2 in a spray booth: first colour you deliver decides the colour
  showroomMult: 1.6, polishBonus: 0.25,
  collectionBonus: 0.02,        // each different classic restored once: +2% on every payout, forever
  collectionGems: 50,           // all six
  sellTime: [30, 90],           // seconds on a showroom turntable until a buyer takes it
  // showroom interior
  showroom: { walls: { minX: 25.0, maxX: 43.0, minZ: -37.0, maxZ: -27.6, height: 2.6 }, door: { minX: 31.0, maxX: 37.0 },
    turntables: [{ x: 28.5, z: -32.0 }, { x: 34.0, z: -32.0 }, { x: 39.5, z: -32.0 }], desk: { x: 41.5, z: -29.4 } },
  junkOffice: { x: -28.0, z: -35.0 }, junkGate: { minX: -37.0, maxX: -33.0, z: -25.3 },
};

// ---------------------------------------------------------------- services: Pro Gear (depot) + Academy
// Second upgrade sheet, same rules as UPGRADES (cost = base * growth^level * shopMult).
export const PRO_UPGRADES = {
  stock:  { label: 'Deep shelves',   base: 4000,  growth: 2.0, max: 6, per: 1 },     // +1 part / canister / kit per station
  crew:   { label: 'Crew training',  base: 6000,  growth: 2.0, max: 6, per: 0.1 },   // +10% staff work + walk speed
  tips:   { label: 'Service charm',  base: 5000,  growth: 2.1, max: 6, per: 0.03 },  // +3% tips on every payout
  truck:  { label: 'Truck tuning',   base: 8000,  growth: 2.0, max: 5, per: 0.06 },  // +6% vehicle speed
  renown: { label: 'Word of mouth',  base: 7000,  growth: 2.2, max: 5, per: 0.15 },  // +15% fame XP
};
// Floor managers collect every cash pile of their facility into one safe and keep it running offline.
export const MANAGERS = {
  garage: { price: 25000, fame: 6,  safe: { x: 7.9, z: -8.8 },    label: 'Garage manager hired!' },
  paint:  { price: 40000, fame: 8,  safe: { x: -20.4, z: -6.4 },  label: 'Paint shop manager hired!' },   // was inside the purple tank's pickup zone
  vip:    { price: 90000, fame: 11, safe: { x: 29.6, z: -9.4 },   label: 'Club manager hired!' },
};

// ---------------------------------------------------------------- town events (late game pulse)
export const TOWN_EVENTS = {
  every: [360, 480],            // seconds between events (only once 'main' is open)
  rush:   { label: 'Rush hour!', duration: 45, spawnMult: 0.5 },
  convoy: { label: 'VIP convoy!', duration: 60, vipSpawnMult: 0.33, needs: 'vip' },
  storm:  { label: 'Storm! Breakdowns everywhere', duration: 90, rescues: 3, needs: 'tow' },
  sale:   { label: 'Parts sale at the depot!', duration: 60, discount: 0.25 },
};
