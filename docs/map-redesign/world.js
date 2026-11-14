// Proposed Harbor Town map, to scale. Same conventions as the game: metres, +x = east (screen right),
// +z = south (towards the camera / screen bottom), the garage lot at the origin (LAYOUT does not move).
// This is a design sketch, not game config: it exists so the proposal page can draw the world and time the drives.

export const WORLD = { minX: -215, maxX: 215, minZ: -235, maxZ: 105 };
export const TODAY = { minX: -61, maxX: 61, minZ: -37.6, maxZ: 23.5 };     // today's whole town (TOWN.bounds)
export const PHONE = { w: 17, h: 27 };                                      // ground one portrait screen shows
export const CAR_SPEED = { base: 10, tuned: 14, walk: 4.8, highway: 1.4 }; // m/s (customer cars drive 7.5); x1.4 on Route 1

// ---------------------------------------------------------------- districts
// era = minutes into a new save when the district has something for you (the town opens at ~18 min).
export const DISTRICTS = {
  home:     { name: 'Harbor Front',      color: '#f26b5b', era: 0, flag: 'garage',   tag: 'Home',
    poly: [[-74, -20], [62, -20], [62, 17], [-74, 17]], label: [-40, 42],
    what: 'Your garage and everything that feeds it. All of it within a short walk.' },
  downtown: { name: 'Downtown',          color: '#f6c453', era: 18, flag: 'depot',  tag: 'Shops & services',
    poly: [[-50, -24], [50, -24], [50, -84], [-50, -84]], label: [-28, -50],
    what: 'Main Street and the square: upgrades, managers, the diner, the Town Hall contracts board.' },
  maple:    { name: 'Maple Hill',        color: '#5fbf6a', era: 35, flag: 'school',  tag: 'Homes',
    poly: [[-50, -84], [50, -84], [50, -196], [-50, -196]], label: [-26, -126],
    what: 'Where your customers live. House calls: bring the parts in your car, fix it in their driveway.' },
  yards:    { name: 'The Yards',         color: '#8f9aa3', era: 60, flag: 'junkyard',  tag: 'Industry & port',
    poly: [[-215, -158], [-96, -158], [-96, 80], [-215, 80]], label: [-176, -110],
    what: 'Salvage yard, container port, rail yard, bus depot. Wrecks to restore, long tows home.' },
  services: { name: 'Route 1 Services',  color: '#2a9d8f', era: 180, flag: 'gas', tag: 'Highway',
    poly: [[-190, -206], [-98, -206], [-98, -160], [-190, -160]], label: [-182, -222],
    what: 'At the highway exit: gas station and your second workshop. Traffic from the mainland stops here first.' },
  cove:     { name: 'Sandy Cove',        color: '#e8a86a', era: 18, flag: 'gelato',  tag: 'Beach',
    poly: [[52, -44], [118, -44], [118, 40], [52, 40]], label: [60, -50],
    what: 'Beach, ice-cream parlour, surf hut, cottages. The drive east to the money.' },
  marina:   { name: 'Marina Point',      color: '#9b8fd4', era: 100, flag: 'vip', tag: 'Luxury',
    poly: [[118, -84], [206, -84], [206, 62], [118, 62]], label: [128, -90],
    what: 'Yachts and villas. The VIP club and the classic-car showroom: big money, careful driving.' },
  cape:     { name: 'Lighthouse Cape',   color: '#5aa9e6', era: 330, flag: 'ferry', tag: 'The goal',
    poly: [[170, 62], [215, 62], [215, 105], [170, 105]], label: [98, 78],
    what: 'The far tip of the bay: the lighthouse and the ferry to the next town.' },
  lake:     { name: 'Pine Lake',         color: '#3f8f5a', era: 18, flag: 'lookout',  tag: 'Scenic drive',
    poly: [[56, -200], [196, -200], [196, -86], [56, -86]], label: [64, -192],
    what: 'Forest and lake on the scenic shortcut to the highway. Campsite breakdowns, a lookout, hidden wrenches.' },
};

// ---------------------------------------------------------------- road graph
// Named nodes are junctions and shop doors (the route planner runs on them). Roads list nodes and shape points.
export const NODES = {
  // Dock Road / Harbor Street / Cove Road / Marina Boulevard (the coast road, z 13.6 = today's Harbor St)
  portGate: [-160, 13.6], salvageGate: [-147, 13.6], millS: [-104, 13.6], fishGate: [-62, 13.6], westAveS: [-48, 13.6],
  paintGate: [-30, 13.6], westAlleyS: [-15, 13.6], garage: [0, 13.6], eastAlleyS: [25.7, 13.6], carport: [36, 13.6],
  eastAveS: [48, 13.6], gelatoGate: [63, 13.6], surfGate: [82, 13.6], cove: [105, 13.6], villaS: [119, 13.6],
  clubGate: [138, 13.6], showGate: [173, 13.6], r1S: [200, 13.6], capeMid: [200, 50], ferry: [199, 74],
  // Main Street (z -22 = today's Main St)
  millMain: [-104, -22], westAveMain: [-48, -22], dinerGate: [-35, -22], westAlleyN: [-15, -22], hillMain: [0, -22],
  acadGate: [15, -22], eastAlleyN: [25.7, -22], cabsGate: [34, -22], eastAveMain: [48, -22], cottageGate: [72, -22], lakeS: [96, -22],
  // Mill Road (west bank of the river) and the Yards
  millYard: [-104, -46], millSvc: [-104, -165], millR1: [-104, -200],
  busGate: [-147, -46], railGate: [-205, -46], pumpGate: [-130, -165], fitGate: [-168, -165], svcW: [-188, -165],
  // Route 1 (highway)
  tunnel: [-215, -200], westR1: [-48, -200], hillR1: [0, -200], eastR1: [48, -200], r1NE: [186, -199],
  r1Mid: [201, -100], villaNE: [201, -38],
  // Downtown + Maple Hill grid
  westMarket: [-48, -62], cinemaGate: [-35, -62], townGate: [-14, -62], hillMarket: [0, -62], policeGate: [14, -62],
  hotelGate: [35, -62], eastMarket: [48, -62],
  westOak: [-48, -100], hillOak: [0, -100], eastOak: [48, -100],
  westMaple: [-48, -135], schoolGate: [-26, -135], hillMaple: [0, -135], eastMaple: [48, -135],
  westBirch: [-48, -170], hillBirch: [0, -170], eastBirch: [48, -170],
  // Lakeside Drive, Villa Lane
  lakeView: [89, -118], campN: [131, -178], villaNW: [119, -38], villaGate: [160, -38],
};

// kind: highway | avenue | street | lane | alley.  name shown along the road at `label` (index of the segment).
export const ROADS = [
  { id: 'dock',    name: 'Dock Road',        kind: 'street', pts: ['portGate', 'salvageGate', 'millS'] },
  { id: 'harbor',  name: 'Harbor Street',    kind: 'avenue', pts: ['millS', 'fishGate', 'westAveS', 'paintGate', 'westAlleyS', 'garage', 'eastAlleyS', 'carport', 'eastAveS'] },
  { id: 'coveRd',  name: 'Cove Road',        kind: 'avenue', pts: ['eastAveS', 'gelatoGate', 'surfGate', 'cove', 'villaS'] },
  { id: 'marina',  name: 'Marina Boulevard', kind: 'avenue', pts: ['villaS', 'clubGate', 'showGate', 'r1S'] },
  { id: 'cape',    name: 'Cape Road',        kind: 'street', pts: ['r1S', 'capeMid', 'ferry'] },
  { id: 'main',    name: 'Main Street',      kind: 'avenue', pts: ['millMain', 'westAveMain', 'dinerGate', 'westAlleyN', 'hillMain', 'acadGate', 'eastAlleyN', 'cabsGate', 'eastAveMain', 'cottageGate', 'lakeS'] },
  { id: 'lakeside', name: 'Lakeside Drive',  kind: 'street', pts: ['lakeS', [101, -46], [95, -78], 'lakeView', [91, -146], [104, -166], 'campN', [160, -184], 'r1NE'] },
  { id: 'mill',    name: 'Mill Road',        kind: 'street', pts: ['millS', 'millMain', 'millYard', 'millSvc', 'millR1'] },
  { id: 'yard',    name: 'Yard Street',      kind: 'street', pts: ['millYard', 'busGate', 'railGate'] },
  { id: 'svc',     name: 'Services Road',    kind: 'street', pts: ['millSvc', 'pumpGate', 'fitGate', 'svcW'] },
  { id: 'r1',      name: 'Route 1',          kind: 'highway', pts: ['tunnel', 'millR1', 'westR1', 'hillR1', 'eastR1', [110, -207], [156, -209], 'r1NE', [197, -178], [201, -146], 'r1Mid', 'villaNE', 'r1S'] },
  { id: 'westAve', name: 'West Avenue',      kind: 'avenue', pts: ['westAveS', 'westAveMain', 'westMarket', 'westOak', 'westMaple', 'westBirch', 'westR1'] },
  { id: 'hill',    name: 'Hill Road',        kind: 'avenue', pts: ['hillMain', 'hillMarket', 'hillOak', 'hillMaple', 'hillBirch', 'hillR1'] },
  { id: 'eastAve', name: 'East Avenue',      kind: 'avenue', pts: ['eastAveS', 'eastAveMain', 'eastMarket', 'eastOak', 'eastMaple', 'eastBirch', 'eastR1'] },
  { id: 'market',  name: 'Market Street',    kind: 'street', pts: ['westMarket', 'cinemaGate', 'townGate', 'hillMarket', 'policeGate', 'hotelGate', 'eastMarket'] },
  { id: 'oak',     name: 'Oak Street',       kind: 'lane',   pts: ['westOak', 'hillOak', 'eastOak'] },
  { id: 'maple',   name: 'Maple Street',     kind: 'lane',   pts: ['westMaple', 'schoolGate', 'hillMaple', 'eastMaple'] },
  { id: 'birch',   name: 'Birch Street',     kind: 'lane',   pts: ['westBirch', 'hillBirch', 'eastBirch'] },
  { id: 'villa',   name: 'Villa Lane',       kind: 'lane',   pts: ['villaS', 'villaNW', 'villaGate', 'villaNE'] },
  { id: 'wAlley',  name: '',                 kind: 'alley',  pts: ['westAlleyS', 'westAlleyN'] },
  { id: 'eAlley',  name: '',                 kind: 'alley',  pts: ['eastAlleyS', 'eastAlleyN'] },
];
export const ROAD_W = { highway: 11, avenue: 7.6, street: 6.6, lane: 6, alley: 3 };

// Bridges over the river. draw = a drawbridge: it lifts for boats heading up river (wait ~8 s or take Mill Bridge).
export const BRIDGES = [
  { name: 'Harbor drawbridge', kind: 'draw',    x0: -89, x1: -71, z: 13.6, w: 7.6 },
  { name: 'Mill Bridge',       kind: 'fixed',   x0: -89, x1: -71, z: -22,  w: 7.6 },
  { name: 'Route 1 viaduct',   kind: 'fixed',   x0: -97, x1: -79, z: -200, w: 11 },
];

// ---------------------------------------------------------------- water and land
export const SEA = [[-215, 80], [-104, 80], [-104, 20], [-92, 17], [66, 17], [80, 21], [96, 29], [112, 35], [122, 40],
  [122, 62], [170, 62], [170, 105], [215, 105], [215, 115], [-215, 115]];
export const RIVER = { w: 12, pts: [[-86, -240], [-88, -200], [-82, -160], [-86, -110], [-81, -60], [-80, -22], [-80, 19]] };
export const LAKE = { cx: 130, cz: -122, rx: 28, rz: 23 };
export const MARINA_BASIN = { minX: 132, maxX: 166, minZ: 22, maxZ: 64 };
export const BEACH = [[62, 15.6], [122, 15.6], [122, 40], [112, 35], [96, 29], [80, 21], [66, 17]];
export const QUAY = { minX: -100, maxX: 62, minZ: 15.5, maxZ: 17.2 };
export const PIERS = [[-30, 17, 3, 16], [8, 17, 3, 22], [38, 17, 3, 14], [-55, 17, 3, 12]];          // x, z, w, length
export const RAIL = [[-196, -240], [-196, 30], [-190, 44], [-178, 52], [-140, 52]];
export const LEVEL_CROSSINGS = [[-196, -46]];

// ---------------------------------------------------------------- places
// look: hall (open roof, you go in) | roof (closed building) | yard | port | canopy | lot | plaza | rail | sheds | landmark
// status: kept (same spot as today) | moved (from) | new.  kind: shop (you run it) | business (earns by itself)
// | service (sells you things) | fleet (a company whose vehicles you can service) | life (atmosphere) | goal
export const PLACES = [
  // Harbor Front
  { id: 'garage', name: 'Wrench Bay', sub: 'your garage', badge: [0, -6], d: 'home', kind: 'shop', icon: 'wrench', status: 'kept', look: 'hall',
    rect: [-9.4, -11.4, 9.4, 1.2], node: 'garage', era: 0, unlock: 'Start',
    verb: 'The core loop: drive cars onto lifts, fetch parts, wrench, collect. The lot does not move at all.' },
  { id: 'tow', name: 'Tow & Rescue', short: 'Tow shed', badge: [-11.7, -1], d: 'home', kind: 'shop', icon: 'tow', status: 'kept', look: 'roof', roof: '#f6c453',
    rect: [-13.4, -5.6, -10, 1], node: 'westAlleyS', era: 20, unlock: '$1.5K',
    verb: 'Rescue calls now come from the whole bay. The further out, the better they pay (x2.5 near, x3 in town, x4 far).' },
  { id: 'lounge', name: 'Harbor Lounge', short: 'Lounge', badge: [19, -5], d: 'home', kind: 'shop', icon: 'lounge', status: 'kept', look: 'hall', wall: '#2a9d8f',
    rect: [11.4, -9.8, 23.4, 0.6], node: 'eastAlleyS', era: 40, unlock: '$6K · fame 2',
    verb: 'Customers wait indoors, longer, and tip.' },
  { id: 'wash', name: 'Suds & Shine', sub: 'car wash', short: 'Car wash', badge: [19.5, 4.6], d: 'home', kind: 'shop', icon: 'wash', status: 'kept', look: 'roof', roof: '#5aa9e6',
    rect: [15, 1.8, 23.6, 5.6], node: 'eastAlleyS', era: 30, unlock: '$3.5K',
    verb: 'Leaving cars pay for a wash.' },
  { id: 'paint', name: 'Spray Bay', sub: 'paint shop', badge: [-30, -3], d: 'home', kind: 'shop', icon: 'paintShop', status: 'kept', look: 'hall', wall: '#9b8fd4',
    rect: [-43.5, -12.5, -17.5, 11], node: 'paintGate', era: 55, unlock: '$12K · fame 3',
    verb: 'Stays next door: it is the second shop you learn to juggle, so it stays a walk away.' },
  { id: 'carport', name: 'Your Carport', short: 'Carport', badge: [36, -3], d: 'home', kind: 'shop', icon: 'car', status: 'new', look: 'carport',
    rect: [27.6, -12.5, 44.6, 11], node: 'carport', era: 18, unlock: 'Free when the town opens',
    verb: 'Where your own cars live (the VIP club used to stand here). Tune-up pad for your car, swap to any classic you restored.' },
  { id: 'fish', name: 'Fish Market', d: 'home', kind: 'life', icon: 'boat', status: 'new', look: 'roof', roof: '#2a9d8f',
    rect: [-72, -6, -53, 10], node: 'fishGate', era: null,
    verb: 'Life on the quay (where Pump & Go stands today): crates, gulls, a morning crowd. A rescue spot outside.' },
  // Downtown
  { id: 'diner', name: 'The Greasy Spoon', sub: 'diner', short: 'Greasy Spoon', d: 'downtown', kind: 'business', icon: 'diner', status: 'moved', from: 'one plot west (Hill Road takes the middle)', look: 'roof', roof: '#f26b5b',
    rect: [-44.5, -37.5, -25.5, -25.1], node: 'dinerGate', era: 75, unlock: '$30K · fame 7',
    verb: 'Earns by itself. Lunch boxes go in your car\'s bed: every crew you feed works faster.' },
  { id: 'depot', name: 'Harbor Parts Co.', short: 'Parts Co.', d: 'downtown', kind: 'service', icon: 'depot', status: 'kept', look: 'roof', roof: '#2f4858',
    rect: [-23.5, -37.5, -9.5, -25.1], node: 'westAlleyN', era: 20, unlock: 'Open with the town',
    verb: 'Pro Gear. New here: car gear (engine, bigger bed, the Autopilot).' },
  { id: 'academy', name: 'Wrench Academy', short: 'Academy', d: 'downtown', kind: 'service', icon: 'academy', status: 'kept', look: 'roof', roof: '#e9e1d2',
    rect: [8.5, -37.5, 21.5, -25.1], node: 'acadGate', era: 25, unlock: 'Open with the town',
    verb: 'Hire floor managers. With a bigger map they matter more: a managed shop runs while you are across town.' },
  { id: 'cabs', name: 'Bay Cabs', sub: 'taxi rank', d: 'downtown', kind: 'fleet', icon: 'car', status: 'new', look: 'roof', roof: '#f6c453',
    rect: [23.5, -37.5, 44.5, -25.1], node: 'cabsGate', era: 45,
    verb: 'Where the town\'s taxis live (the showroom used to be here). Sends fleet contracts to your garage.' },
  { id: 'square', name: 'Town Square', d: 'downtown', kind: 'life', icon: 'flag', status: 'new', look: 'plaza',
    rect: [-46, -58, 46, -41], node: 'hillMarket', era: null,
    verb: 'Fountain, market stalls, a bandstand. Market-day events happen here.' },
  { id: 'townhall', name: 'Town Hall', d: 'downtown', kind: 'service', icon: 'clipboard', status: 'new', look: 'roof', roof: '#5c6670',
    rect: [-24, -84, -6, -65], node: 'townGate', era: 25, unlock: 'Open with the town',
    verb: 'Contracts board (fleet jobs, town events) and the Fame hall.' },
  { id: 'cinema', name: 'Bayview Cinema', d: 'downtown', kind: 'life', icon: 'camera', status: 'new', look: 'roof', roof: '#c4483a',
    rect: [-46, -82, -28, -65], node: 'cinemaGate', era: null, verb: 'Atmosphere; evening crowds on the square.' },
  { id: 'police', name: 'Police Station', d: 'downtown', kind: 'fleet', icon: 'bell', status: 'new', look: 'roof', roof: '#2f4858',
    rect: [6, -82, 22, -65], node: 'policeGate', era: 45, verb: 'Patrol cars: a fleet contract now and then.' },
  { id: 'hotel', name: 'Grand Hotel', d: 'downtown', kind: 'life', icon: 'star', status: 'new', look: 'roof', roof: '#7a4f32',
    rect: [26, -82, 46, -65], node: 'hotelGate', era: null, verb: 'Tourists off the ferry; some of them are VIPs.' },
  // Maple Hill
  { id: 'school', name: 'Maple Hill School', d: 'maple', kind: 'fleet', icon: 'bell', status: 'new', look: 'roof', roof: '#e4664f',
    rect: [-44, -159, -8, -140], node: 'schoolGate', era: 45, verb: 'School buses: a fleet contract at term start.' },
  // The Yards
  { id: 'junkyard', name: 'Rust & Gold Salvage', short: 'Salvage yard', d: 'yards', kind: 'shop', icon: 'junk', status: 'moved', from: 'Main Street', look: 'yard',
    rect: [-180, -40, -114, 8], node: 'salvageGate', era: 60, unlock: '$18K · fame 6',
    verb: 'Buy a wreck, tow it home across the river. Its restoration is a road trip through every shop you own.' },
  { id: 'port', name: 'Container Port', d: 'yards', kind: 'life', icon: 'boat', status: 'new', look: 'port',
    rect: [-210, 22, -106, 78], node: 'portGate', era: null,
    verb: 'Cranes, stacks, a cargo ship. Port trucks break down on Dock Road: far rescues.' },
  { id: 'buses', name: 'Harbor Buses', sub: 'bus depot', d: 'yards', kind: 'fleet', icon: 'car', status: 'new', look: 'sheds', roof: '#2a9d8f',
    rect: [-180, -102, -114, -50], node: 'busGate', era: 45, verb: 'Where the buses on both lines sleep. Big fleet contracts.' },
  { id: 'railyard', name: 'Rail Yard', d: 'yards', kind: 'life', icon: 'clock', status: 'new', look: 'rail',
    rect: [-213, -156, -188, -54], node: 'railGate', era: null, verb: 'Freight trains to the port. The level crossing on Yard Street closes when one passes.' },
  { id: 'warehouses', name: 'Warehouses', d: 'yards', kind: 'life', icon: 'crate', status: 'new', look: 'sheds', roof: '#8f9aa3',
    rect: [-180, -152, -114, -112], node: 'millSvc', era: null, verb: 'Scenery between the depot and the highway.' },
  // Route 1 services
  { id: 'quickfit', name: 'Quick-Fit Express', short: 'Quick-Fit', d: 'services', kind: 'business', icon: 'quickfit', status: 'moved', from: 'east of East Avenue', look: 'roof', roof: '#f26b5b',
    rect: [-186, -194, -154, -170], node: 'fitGate', era: 240, unlock: '$400K · fame 15',
    verb: 'Your second workshop, run by its own crew, fed by highway traffic.' },
  { id: 'gas', name: 'Pump & Go', sub: 'gas station', d: 'services', kind: 'business', icon: 'pump', status: 'moved', from: 'west of West Avenue', look: 'canopy',
    rect: [-150, -194, -112, -170], node: 'pumpGate', era: 180, unlock: '$150K · fame 12',
    verb: 'Earns by itself at the highway exit; every level sends more customers down to your garage.' },
  // Sandy Cove
  { id: 'gelato', name: 'Gelato Bros', d: 'cove', kind: 'fleet', icon: 'heart', status: 'new', look: 'roof', roof: '#f7a8b8',
    rect: [54, -10, 72, 8], node: 'gelatoGate', era: 45, verb: 'Ice-cream vans (they already drive in traffic). A summer fleet contract.' },
  { id: 'surf', name: 'Surf Hut', d: 'cove', kind: 'life', icon: 'sparkle', status: 'new', look: 'roof', roof: '#5aa9e6',
    rect: [76, -6, 88, 8], node: 'surfGate', era: null, verb: 'Beach life. A wrench hides at the end of the beach.' },
  { id: 'beachlot', name: 'Beach car park', d: 'cove', kind: 'life', icon: 'car', status: 'new', look: 'lot',
    rect: [93, -4, 116, 9], node: 'cove', era: null, verb: 'Beach-goers\' cars. Flat batteries in the sun: house-call-style jobs.' },
  // Marina Point
  { id: 'vip', name: 'Platinum Club', sub: 'VIP club', d: 'marina', kind: 'shop', icon: 'crown', status: 'moved', from: 'the home block', look: 'hall', wall: '#c9a227',
    rect: [124, -30, 152, 9], node: 'clubGate', era: 100, unlock: '$60K · fame 8',
    verb: 'VIPs arrive from the villas and the ferry. Careful driving, the polish lap.' },
  { id: 'showroom', name: 'Bay Classics', sub: 'showroom', d: 'marina', kind: 'shop', icon: 'showroom', status: 'moved', from: 'Main Street', look: 'hall', wall: '#2f4858',
    rect: [158, -30, 190, 9], node: 'showGate', era: 150, unlock: '$80K · fame 10',
    verb: 'Sell restored classics for 1.6x. The collection wall lives here.' },
  { id: 'marinaBasin', name: 'Yacht marina', d: 'marina', kind: 'life', icon: 'boat', status: 'new', look: 'none',
    rect: [132, 22, 166, 62], node: 'clubGate', era: null, verb: 'Pontoons and yachts. A wrench on the last pontoon.' },
  // Cape
  { id: 'ferry', name: 'Ferry Terminal', d: 'cape', kind: 'goal', icon: 'ferry', status: 'moved', from: 'the east quay', look: 'roof', roof: '#2f4858',
    rect: [172, 64, 191, 82], node: 'ferry', era: 330, unlock: '$2M · fame 20 · everything owned',
    verb: 'The finish line sits at the far tip of the bay: the last drive of the town is the longest.' },
  { id: 'lighthouse', name: 'Lighthouse', d: 'cape', kind: 'life', icon: 'star', status: 'new', look: 'landmark',
    rect: [200, 92, 208, 100], node: 'ferry', era: null, verb: 'Landmark you can see on the map from anywhere.' },
  // Pine Lake
  { id: 'camp', name: 'Pine Lake campsite', d: 'lake', kind: 'life', icon: 'flag', status: 'new', look: 'camp',
    rect: [114, -172, 148, -152], node: 'campN', era: null, verb: 'Camper vans that won\'t start: far rescues.' },
  { id: 'lookout', name: 'Lake lookout', d: 'lake', kind: 'life', icon: 'camera', status: 'new', look: 'lot',
    rect: [93, -126, 101, -110], node: 'lakeView', era: null, verb: 'A P bay with a view, and a golden wrench.' },
];

// Generated house rows (north side of their street, facing south, as everything in the game).
export const HOUSE_ROWS = [
  { d: 'maple', z0: -122, z1: -105, xs: [[-46, -6], [6, 46]], w: 11 },        // Oak Street
  { d: 'maple', z0: -157, z1: -140, xs: [[6, 46]], w: 11 },                   // Maple Street (school on the west)
  { d: 'maple', z0: -192, z1: -175, xs: [[-46, -6], [6, 46]], w: 11 },        // Birch Street
  { d: 'cove', z0: -40, z1: -27, xs: [[54, 92]], w: 11 },                     // Cove cottages on Main St east
  { d: 'home', z0: -19, z1: -6, xs: [[-72, -54]], w: 9 },                     // riverside
];
export const VILLAS = [[124, -78, 140, -44], [146, -78, 162, -44], [168, -78, 184, -44], [188, -78, 199, -52]];

// ---------------------------------------------------------------- jobs on the road
export const RESCUES = {
  near: [[-38, 16.6], [17.5, 16.6], [-60, -24.8], [55, 16.6]],
  town: [[-25, -24.8], [30, -59.4], [-30, -97.4], [20, -132.4], [-20, -167.4], [76, 16.6], [-128, 16.6], [-138, -48.8], [99, -36]],
  far:  [[-107, -118], [-172, -162.2], [-62, -196.6], [124, -204.6], [204, -62], [92, -92], [150, 16.6], [203.4, 38], [146, -181]],
};
export const RESCUE_PAY = { near: 'x2.5', town: 'x3', far: 'x4' };
export const HOUSE_CALLS = [[-34, -106], [18, -106], [40, -141], [-22, -176], [30, -176], [64, -28], [154, -46], [176, -46]];
export const WRENCHES = [[-80, 9], [-205, -100], [-192, 72], [-118, -36], [-176, -104], [-186, -196], [-209, -206],
  [-70, -120], [-30, -161], [-20, -50], [-47, -85], [97, -118], [128, -168], [158, -142], [194, -74], [150, 60],
  [206, 101], [173, 88], [116, 31], [58, 21], [-62, 9], [2, -15.6], [199, -160], [46, -194]];

// ---------------------------------------------------------------- life
export const BUS_LINES = [
  { name: 'Line 1 · Town loop', color: '#f6c453',
    route: ['westAveS', 'paintGate', 'westAlleyS', 'garage', 'eastAlleyS', 'carport', 'eastAveS', 'eastAveMain', 'eastMarket', 'hotelGate', 'policeGate', 'hillMarket', 'hillOak', 'hillMaple', 'hillBirch', 'hillR1', 'westR1', 'westBirch', 'westMaple', 'westOak', 'westMarket', 'westAveMain', 'westAveS'],
    stops: ['garage', 'policeGate', 'hillMaple', 'westOak'] },
  { name: 'Line 2 · Coast line', color: '#2a9d8f',
    route: ['portGate', 'salvageGate', 'millS', 'fishGate', 'westAveS', 'paintGate', 'westAlleyS', 'garage', 'eastAlleyS', 'carport', 'eastAveS', 'gelatoGate', 'surfGate', 'cove', 'villaS', 'clubGate', 'showGate', 'r1S', 'capeMid', 'ferry'],
    stops: ['portGate', 'fishGate', 'cove', 'clubGate', 'ferry'] },
];
export const FERRY_ROUTE = [[160, 90], [120, 98], [60, 112]];

// ---------------------------------------------------------------- the six hours, on the map
export const TIMELINE = [
  { t: '0:00', title: 'The garage lot', place: 'garage', text: 'Unchanged tutorial and the first unlocks. The town is behind barriers.' },
  { t: '0:18', title: 'The town opens', place: 'carport', text: 'Valet + a mechanic hired: the barriers lift and your old shop pickup rolls out of the carport. Every road is open from now on.' },
  { t: '0:20', title: 'Tow truck', place: 'tow', text: 'First rescue call on Harbor Street. Later calls reach further out and pay more.' },
  { t: '0:25', title: 'Downtown', place: 'depot', text: 'A short drive up the alley: Pro Gear, managers, the Town Hall contracts board.' },
  { t: '0:30', title: 'Car wash, lounge', place: 'wash', text: 'The home block fills up.' },
  { t: '0:40', title: 'House calls', place: 'school', text: 'Maple Hill residents call: load parts in your bed, fix cars in driveways.' },
  { t: '0:55', title: 'Spray Bay', place: 'paint', text: 'Second shop, next door. You learn to juggle two.' },
  { t: '1:00', title: 'The Yards', place: 'junkyard', text: 'Across the river. Buy a wreck and start the project-car road trip.' },
  { t: '1:15', title: 'The Greasy Spoon', place: 'diner', text: 'First side business; lunch runs by car.' },
  { t: '1:40', title: 'Marina Point', place: 'vip', text: 'The Platinum Club opens down the coast; the money is east now.' },
  { t: '2:30', title: 'Bay Classics', place: 'showroom', text: 'Restored classics sell next door to the club. Keep one and drive it.' },
  { t: '3:00', title: 'Route 1 Services', place: 'gas', text: 'Pump & Go at the highway exit, the far north-west. Autopilot pays off here.' },
  { t: '4:00', title: 'Quick-Fit Express', place: 'quickfit', text: 'Your second workshop beside it.' },
  { t: '5:30', title: 'The ferry', place: 'ferry', text: 'The last drive: across the whole bay to Lighthouse Cape, and on to the next town.' },
];

// ---------------------------------------------------------------- drawing extras (render.js reads these)
export const HILLS = [[-150, -228, 90, 16], [-20, -230, 110, 14], [120, -232, 120, 16], [212, -150, 14, 80], [-215, -120, 12, 60]];
export const TUNNELS = [{ x: -209, z: -200, w: 11, side: 'w' }];
export const BOATS = [[-22, 30, .3], [14, 24, -.2], [-48, 38, .1], [30, 40, 0], [-70, 26, .5], [70, 60, .2], [-10, 70, -.1]];
export const FERRY_BOAT = { pier: [150, 84.5, 22, 3], boat: [150, 89] };
export const PAVED = [[-44.9, -18.9, 44.9, 11], [-61, -20, -48, 11, '#ddd3be'], [50, -20, 62, 11, '#ddd3be']];
export const SOLID = [[-215, 15, -96, 80]];
export const SCALEBAR = { x: -40, z: 99, m: 50 };
export const ROUTE_EXTRA = ['fish', 'lookout', 'camp', 'port'];
export const LABELS = [
  { x: -205, z: -191.6, t: 'to the mainland', s: 1.8, cls: 'rname dark' },
  { x: -40, z: 64, t: 'WRENCH BAY', s: 9, cls: 'sea' },
  { x: -84, z: -230, t: 'MILL RIVER', s: 2.6, cls: 'water', rot: -86 },
  { x: LAKE.cx, z: LAKE.cz + 1, t: 'PINE LAKE', s: 3.6, cls: 'water' },
  { x: -200.5, z: -10, t: 'FREIGHT RAIL', s: 2, cls: 'rname dark', rot: -90 },
];
export function forest(x, z) {
  if (z < -207 && !(x < -205 && z > -212)) return .85;
  if (x > 205) return .8;
  if (x < -209) return .7;
  if (x > 56 && x < 198 && z < -84 && z > -200) return .75;
  if (x > 54 && x < 90 && z < -44 && z > -200) return .7;
  if (x > 168 && z > 18 && z < 62) return .22;
  if (x > -74 && x < -52 && z < -24 && z > -200) return .45;
  if (x > -100 && x < -93) return .4;
  if (x > -186 && x < -110 && z < -104 && z > -160) return 0;
  if (x > -50 && x < 50 && z < -84 && z > -196) return .2;
  if (x > 118 && x < 200 && z < -40 && z > -84) return .3;
  return .05;
}
/** Rail line, level crossing, the rail tunnel and the cargo ship at the port. */
export function decorate({ el, d2, G }) {
  el('path', { d: d2(RAIL), fill: 'none', stroke: '#9b8669', 'stroke-width': 2.8, 'stroke-dasharray': '.5 1.1', 'stroke-linejoin': 'round' }, G.rail);
  el('path', { d: d2(RAIL), fill: 'none', stroke: '#6d5d4b', 'stroke-width': .5, transform: 'translate(-.7 0)', 'stroke-linejoin': 'round' }, G.rail);
  el('path', { d: d2(RAIL), fill: 'none', stroke: '#6d5d4b', 'stroke-width': .5, transform: 'translate(.7 0)', 'stroke-linejoin': 'round' }, G.rail);
  for (const [x, z] of LEVEL_CROSSINGS) {
    el('rect', { x: x - 3, y: z - 4.6, width: 6, height: .7, fill: '#f26b5b' }, G.rail);
    el('rect', { x: x - 3, y: z + 3.9, width: 6, height: .7, fill: '#f26b5b' }, G.rail);
  }
  el('rect', { x: -199.5, y: -203, width: 7, height: 6, fill: '#5b5f6b', stroke: '#2b3640', 'stroke-width': .5 }, G.rail);   // rail under Route 1
  el('path', { d: 'M-200 -238 h8 v4 h-8z', fill: '#2b3640' }, G.rail);
  el('path', { d: 'M-192 84 h56 l7 5 l-7 5 h-56z', fill: '#2f4858' }, G.water);
  for (let i = 0; i < 8; i++) el('rect', { x: -188 + i * 6.4, y: 85.2, width: 5.6, height: 7.6, fill: ['#f26b5b', '#f6c453', '#2a9d8f', '#5aa9e6'][i % 4] }, G.water);
  el('rect', { x: -142, y: 85, width: 5, height: 8, fill: '#fff6e6' }, G.water);
}
/** Life layer one-offs: the freight train, traffic from the tunnel, a boat waiting for the drawbridge. */
export function decorateLife({ el, txt, G }) {
  const train = el('g', { transform: 'translate(-196 -120)' }, G.life);
  for (let i = 0; i < 4; i++) el('rect', { x: -1.3, y: i * 5.4, width: 2.6, height: 5, rx: .4, fill: i ? '#a85c4a' : '#f6c453', stroke: '#1f3340', 'stroke-width': .25 }, train);
  el('path', { d: 'M-225 -197 h14 l-3 -2.4 m3 2.4 l-3 2.4', fill: 'none', stroke: '#fff6e6', 'stroke-width': .9 }, G.life);
  txt(-152, -207.6, 'traffic from the mainland', 2.2, 'lifetxt', G.life);
  el('path', { d: 'M-82.2 33 h4.4 l-2.2 3.2z', fill: '#fff6e6', stroke: '#2f4858', 'stroke-width': .3, transform: 'rotate(180 -80 34)' }, G.life);
  txt(-68, 36, 'boats raise the drawbridge', 2.1, 'lifetxt', G.life);
}
