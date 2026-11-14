// Suggestion B, compact: today's town plus one street. Same conventions as world.js and the game (metres, +x east,
// +z south, the garage lot at the origin). Harbor Street, Main Street, the ring, the tunnels and every place on
// them stay where they are today (TOWN in src/config.town.js). Behind Main Street one new street, Crown Street,
// takes the three late-game places that need room. Only car things: the additions are the pickup, its carport
// and Crown Street. Road widths are today's (3.8 m, one lane each way).

export const WORLD = { minX: -72, maxX: 72, minZ: -86, maxZ: 38 };
export const TODAY = { minX: -61, maxX: 61, minZ: -37.6, maxZ: 23.5 };
export const PLAYABLE = { minX: -61, maxX: 61, minZ: -76, maxZ: 23.5 };    // 122 x 99.5 m
export const PHONE = { w: 17, h: 27 };
export const CAR_SPEED = { base: 10, tuned: 14, walk: 4.8 };

// ---------------------------------------------------------------- districts (three rows, south to north)
export const DISTRICTS = {
  home:  { name: 'Harbor Front', color: '#f26b5b', era: 0, flag: 'garage', tag: 'Home · Harbor Street',
    poly: [[-61, -20], [61, -20], [61, 24], [-61, 24]], label: [-57, 28.5],
    what: 'Your garage and everything that feeds it, the whole length of Harbor Street. Every place stays where it is today; the VIP club\'s plot becomes your carport.' },
  main:  { name: 'Main Street', color: '#f6c453', era: 18, flag: 'depot', tag: 'Upgrades, managers, lunch',
    poly: [[-61, -20], [61, -20], [61, -39.4], [-61, -39.4]], label: [-42.6, -33.5],
    what: 'Parts Co., the Academy and the diner stay put. The two plots the salvage yard and Bay Classics leave are free for later.' },
  crown: { name: 'Crown Street', color: '#9b8fd4', era: 60, flag: 'vip', tag: 'Salvage, VIP club, showroom',
    poly: [[-61, -39.4], [61, -39.4], [61, -76], [-61, -76]], label: [-23, -77.5],
    what: 'The one new street, behind Main Street. Late-game places that were squeezed into small plots get room here. An alley between the diner and the Academy leads straight up to the club\'s door.' },
};

// ---------------------------------------------------------------- road graph
export const NODES = {
  // Harbor Street (z 13.6) and Main Street (z -22): today's, tunnel to tunnel
  tunW: [-72, 13.6], gasGate: [-56, 13.6], westAveS: [-48, 13.6], paintGate: [-30, 13.6], westAlleyS: [-15, 13.6],
  garage: [0, 13.6], eastAlleyS: [25.7, 13.6], carport: [36, 13.6], eastAveS: [48, 13.6], eastEnd: [56, 13.6], tunE: [72, 13.6],
  tunW2: [-72, -22], westAveMain: [-48, -22], westSpare: [-34.5, -22], westAlleyN: [-15, -22], dinerGate: [-0.5, -22],
  crownAlleyS: [7.5, -22], acadGate: [16, -22], eastAlleyN: [25.7, -22], eastSpare: [33.5, -22], eastAveMain: [48, -22], tunE2: [72, -22],
  // Crown Street (new, z -42.5) and the two avenue extensions that reach it
  westCrown: [-48, -42.5], salvageGate: [-40, -42.5], vipGate: [7.5, -42.5], showGate: [36, -42.5], eastCrown: [48, -42.5],
};
export const ROADS = [
  { id: 'harbor',  name: 'Harbor Street', kind: 'avenue', label: [-23, 13.6], pts: ['tunW', 'gasGate', 'westAveS', 'paintGate', 'westAlleyS', 'garage', 'eastAlleyS', 'carport', 'eastAveS', 'eastEnd', 'tunE'] },
  { id: 'main',    name: 'Main Street',   kind: 'avenue', label: [-41.5, -22], pts: ['tunW2', 'westAveMain', 'westSpare', 'westAlleyN', 'dinerGate', 'crownAlleyS', 'acadGate', 'eastAlleyN', 'eastSpare', 'eastAveMain', 'tunE2'] },
  { id: 'westAve', name: 'West Ave',      kind: 'avenue', pts: ['westAveS', 'westAveMain', 'westCrown'] },
  { id: 'eastAve', name: 'East Ave',      kind: 'avenue', pts: ['eastAveS', 'eastAveMain', 'eastCrown'] },
  { id: 'crown',   name: 'Crown Street',  kind: 'street', label: [-16, -42.5], pts: ['westCrown', 'salvageGate', 'vipGate', 'showGate', 'eastCrown'] },
  { id: 'wAlley',  name: '', kind: 'alley', pts: ['westAlleyS', 'westAlleyN'] },
  { id: 'eAlley',  name: '', kind: 'alley', pts: ['eastAlleyS', 'eastAlleyN'] },
  { id: 'cAlley',  name: '', kind: 'alley', pts: ['crownAlleyS', 'vipGate'] },     // new: Main Street up to the club's door
];
export const ROAD_W = { highway: 7.6, avenue: 3.8, street: 3.8, lane: 3.8, alley: 3 };
export const TUNNELS = [{ x: -64, z: 13.6, w: 3.8, side: 'w' }, { x: -64, z: -22, w: 3.8, side: 'w' },
  { x: 64, z: 13.6, w: 3.8, side: 'e' }, { x: 64, z: -22, w: 3.8, side: 'e' }];

// ---------------------------------------------------------------- water and land (today's harbour)
export const SEA = [[-72, 17.2], [50.5, 17.2], [50.5, 23.5], [61, 23.5], [61, 17.2], [72, 17.2], [72, 40], [-72, 40]];
export const QUAY = { minX: -61, maxX: 50.5, minZ: 15.5, maxZ: 17.2 };
export const PIERS = [[-30, 17.2, 2.4, 8], [8, 17.2, 2.4, 11], [30, 17.2, 2.4, 7]];
export const BREAKWATERS = [[-61, 33, -34, 35]];
export const LIGHTHOUSES = [[-58.5, 34]];
export const BOATS = [[-22, 24.5, .3], [14, 27, -.2], [-24, 31, .1], [33, 26, 0]];
export const FERRY_BOAT = { pier: [54.5, 23.5, 3, 5], boat: [40, 28.6] };
export const FERRY_ROUTE = [[37, 32], [20, 35.5], [2, 37.5]];
export const PAVED = [[-44.9, -18.9, 44.9, 11], [-61, -20, -50, 11, '#ddd3be'], [50, -20, 61, 11, '#ddd3be'], [50.5, 15.5, 61, 23.5, '#ddd3be']];
export const HILLS = [[-38, -84, 40, 6], [30, -84, 46, 6], [-71, -30, 5, 44], [71, -30, 5, 44]];

// ---------------------------------------------------------------- places (every one of them is about cars)
export const PLACES = [
  // Harbor Front: today's places, today's spots
  { id: 'garage', name: 'Wrench Bay', sub: 'your garage', badge: [0, -6], d: 'home', kind: 'shop', icon: 'wrench', status: 'kept', look: 'hall',
    rect: [-9.4, -11.4, 9.4, 1.2], node: 'garage', era: 0, unlock: 'Start', verb: 'The core loop. The lot does not move at all.' },
  { id: 'tow', name: 'Tow & Rescue', short: 'Tow shed', badge: [-11.7, -1], d: 'home', kind: 'shop', icon: 'tow', status: 'kept', look: 'roof', roof: '#f6c453',
    rect: [-13.4, -5.6, -10, 1], node: 'westAlleyS', era: 20, unlock: '$1.5K', verb: 'Rescue calls as today, plus two new spots on Crown Street.' },
  { id: 'lounge', name: 'Harbor Lounge', short: 'Lounge', badge: [19, -5], d: 'home', kind: 'shop', icon: 'lounge', status: 'kept', look: 'hall', wall: '#2a9d8f',
    rect: [11.4, -9.8, 23.4, 0.6], node: 'eastAlleyS', era: 40, unlock: '$6K · fame 2', verb: 'Unchanged.' },
  { id: 'wash', name: 'Suds & Shine', sub: 'car wash', short: 'Car wash', badge: [19.5, 4.6], d: 'home', kind: 'shop', icon: 'wash', status: 'kept', look: 'roof', roof: '#5aa9e6',
    rect: [15, 1.8, 23.6, 5.6], node: 'eastAlleyS', era: 30, unlock: '$3.5K', verb: 'Unchanged.' },
  { id: 'paint', name: 'Spray Bay', sub: 'paint shop', badge: [-30, -3], d: 'home', kind: 'shop', icon: 'paintShop', status: 'kept', look: 'hall', wall: '#9b8fd4',
    rect: [-43.5, -12.5, -17.5, 11], node: 'paintGate', era: 55, unlock: '$12K · fame 3', verb: 'Unchanged, next door to the garage.' },
  { id: 'carport', name: 'Your Carport', short: 'Carport', badge: [36, -3], d: 'home', kind: 'shop', icon: 'car', status: 'new', look: 'carport',
    rect: [27.6, -12.5, 44.6, 11], node: 'carport', era: 18, unlock: 'Free when the town opens',
    verb: 'On the Platinum Club\'s old plot: your pickup parks here, with its tune-up pad. One of the only two new things in B.' },
  { id: 'gas', name: 'Pump & Go', sub: 'gas station', badge: [-56, 2], d: 'home', kind: 'business', icon: 'pump', status: 'kept', look: 'canopy',
    rect: [-61, -7, -51.1, 11], node: 'gasGate', era: 180, unlock: '$150K · fame 12', verb: 'Where it is today, at the west end of Harbor Street where customers drive in.' },
  { id: 'quickfit', name: 'Quick-Fit Express', short: 'Quick-Fit', badge: [56, 2], d: 'home', kind: 'business', icon: 'quickfit', status: 'kept', look: 'roof', roof: '#f26b5b',
    rect: [51.1, -7, 61, 11], node: 'eastEnd', era: 240, unlock: '$400K · fame 15', verb: 'Where it is today, at the east end.' },
  { id: 'ferry', name: 'Ferry Terminal', badge: [55.8, 19.6], d: 'home', kind: 'goal', icon: 'ferry', status: 'kept', look: 'roof', roof: '#2f4858',
    rect: [52.5, 16, 59, 20.6], node: 'eastEnd', era: 330, unlock: '$2M · fame 20 · everything owned', verb: 'Where it is today, on the east quay.' },
  // Main Street: today's row
  { id: 'depot', name: 'Harbor Parts Co.', short: 'Parts Co.', d: 'main', kind: 'service', icon: 'depot', status: 'kept', look: 'roof', roof: '#2f4858',
    rect: [-23.5, -37.5, -9.5, -25.1], node: 'westAlleyN', era: 20, unlock: 'Open with the town', verb: 'Pro Gear, plus a few items for your pickup (engine, bigger bed).' },
  { id: 'diner', name: 'The Greasy Spoon', sub: 'diner', short: 'Greasy Spoon', d: 'main', kind: 'business', icon: 'diner', status: 'kept', look: 'roof', roof: '#f26b5b',
    rect: [-7.5, -37.5, 6.5, -25.1], node: 'dinerGate', era: 75, unlock: '$30K · fame 7', verb: 'Unchanged. Lunch boxes ride in your pickup\'s bed to the crews.' },
  { id: 'academy', name: 'Wrench Academy', short: 'Academy', d: 'main', kind: 'service', icon: 'academy', status: 'kept', look: 'roof', roof: '#e9e1d2',
    rect: [9.5, -37.5, 22.5, -25.1], node: 'acadGate', era: 25, unlock: 'Open with the town', verb: 'Unchanged, only 1 m further east to make room for the alley up to Crown Street.' },
  { id: 'spareW', name: 'Free plot', sub: 'was the salvage yard', badge: [-27.6, -27.4], d: 'main', kind: 'spare', icon: 'mapPin', status: 'free', look: 'spare',
    rect: [-43.5, -37.5, -25.5, -25.1], node: 'westSpare', era: null, verb: 'Left free on purpose: room for a later building, or for Pump & Go to move off its narrow side strip.' },
  { id: 'spareE', name: 'Free plot', sub: 'was Bay Classics', badge: [41.4, -27.4], d: 'main', kind: 'spare', icon: 'mapPin', status: 'free', look: 'spare',
    rect: [23.5, -37.5, 43.5, -25.1], node: 'eastSpare', era: null, verb: 'Left free on purpose: room for a later building, or for Quick-Fit to move off its narrow side strip.' },
  // Crown Street: the new row
  { id: 'junkyard', name: 'Rust & Gold Salvage', short: 'Salvage yard', d: 'crown', kind: 'shop', icon: 'junk', status: 'moved', from: 'Main Street', look: 'yard',
    rect: [-60, -72, -24, -46.5], node: 'salvageGate', era: 60, unlock: '$18K · fame 6',
    verb: 'Was squeezed into a 19 m plot; up here the yard has room for its stands, crane and crusher. Wrecks are towed down West Ave to the garage.' },
  { id: 'vip', name: 'Platinum Club', sub: 'VIP club', d: 'crown', kind: 'shop', icon: 'crown', status: 'moved', from: 'the home block', look: 'hall', wall: '#c9a227',
    rect: [-8, -72, 20, -46.5], node: 'vipGate', era: 100, unlock: '$60K · fame 8',
    verb: 'Off the home block, which frees the carport plot, and onto a bigger plot with its own red-carpet drop-off on Crown Street.' },
  { id: 'showroom', name: 'Bay Classics', sub: 'showroom', d: 'crown', kind: 'shop', icon: 'showroom', status: 'moved', from: 'Main Street', look: 'hall', wall: '#2f4858',
    rect: [24, -72, 58, -46.5], node: 'showGate', era: 150, unlock: '$80K · fame 10',
    verb: 'Next door to the club, so a restored car goes from the polish turntable to the showroom floor in a few seconds.' },
];

// Today's filler houses at the corners (scenery, as today).
export const HOUSE_ROWS = [
  { d: 'home', z0: -18.6, z1: -8, xs: [[-61, -51]], w: 10 },
  { d: 'home', z0: -18.6, z1: -8, xs: [[51, 61]], w: 10 },
  { d: 'main', z0: -37.5, z1: -26.5, xs: [[-61, -52]], w: 9 },
  { d: 'main', z0: -37.5, z1: -26.5, xs: [[52, 61]], w: 9 },
];
export const VILLAS = [];

// ---------------------------------------------------------------- jobs: today's, plus two rescue spots
// near = the two new Crown Street spots (drawn green), town = today's eleven (drawn amber).
export const RESCUES = {
  town: [[-40, 16.2], [-20, 16.2], [17.5, 16.2], [41.5, 16.2], [-57.5, 16.2], [-50.25, 2], [50.25, -3],
    [-34, -24.6], [-2, -24.6], [20, -24.6], [34, -24.6]],
  near: [[-30, -40.2], [28, -40.2]],
};
export const WRENCHES = [[2, -15.6], [-30, -15.2], [38, -15.6], [-15, -8], [25.7, -6], [15.95, 10.2], [-26, 16.1], [8, 16.1],
  [51.4, 16.2], [-58.2, 9.6], [58.6, -5.6], [59.2, 22.2], [-58, -74], [-16, -60], [-24.5, -36], [57, -74]];
export const BUS_LINES = [
  { name: 'Bus · the ring, as today', color: '#f6c453',
    route: ['westAveS', 'paintGate', 'westAlleyS', 'garage', 'eastAlleyS', 'carport', 'eastAveS', 'eastAveMain', 'eastSpare', 'eastAlleyN', 'acadGate', 'crownAlleyS', 'dinerGate', 'westAlleyN', 'westSpare', 'westAveMain', 'westAveS'],
    stops: ['garage', 'acadGate'] },
];

// ---------------------------------------------------------------- drawing extras
export const LABELS = [{ x: -8, z: 31.5, t: 'WRENCH BAY', s: 3.2, cls: 'sea' }];
export const TODAY_LABEL = [52, 26];
export const PHONE_AT = [0, -3];
export const SCALEBAR = { x: -10, z: 37, m: 20 };
export const SOLID = [];
export function forest(x, z) {
  if (z < -75) return .85;
  if (x < -62 || x > 62) return .7;
  if (x > -23 && x < -9 && z < -46 && z > -74) return .6;     // trees between the salvage yard and the club
  if (z < -40 && z > -76 && (x < -61 || x > 59)) return .5;
  return .03;
}

// ---------------------------------------------------------------- the six hours, on the map
export const TIMELINE = [
  { t: '0:00', title: 'The garage lot', place: 'garage', text: 'Unchanged tutorial and the first unlocks.' },
  { t: '0:18', title: 'The town opens', place: 'carport', text: 'Valet + a mechanic: the barriers lift and your pickup rolls out of the carport. Walking still works everywhere.' },
  { t: '0:20', title: 'Tow truck', place: 'tow', text: 'Rescue calls on Harbor Street and Main Street, as today.' },
  { t: '0:25', title: 'Main Street', place: 'depot', text: 'Pro Gear and managers: a short walk or a few seconds by car.' },
  { t: '0:30', title: 'Car wash, lounge', place: 'wash', text: 'The home block fills up, as today.' },
  { t: '0:55', title: 'Spray Bay', place: 'paint', text: 'Second shop, next door.' },
  { t: '1:00', title: 'Crown Street', place: 'junkyard', text: 'The first drive up: buy a wreck and tow it down to the garage.' },
  { t: '1:15', title: 'The Greasy Spoon', place: 'diner', text: 'Lunch boxes go in the pickup\'s bed to feed your crews.' },
  { t: '1:40', title: 'Platinum Club', place: 'vip', text: 'Up on Crown Street, with room for its red carpet.' },
  { t: '2:30', title: 'Bay Classics', place: 'showroom', text: 'Next door to the club, at the end of the project car\'s trip.' },
  { t: '3:00', title: 'Pump & Go', place: 'gas', text: 'Where it is today, at the west end of Harbor Street.' },
  { t: '4:00', title: 'Quick-Fit Express', place: 'quickfit', text: 'Where it is today, at the east end.' },
  { t: '5:30', title: 'The ferry', place: 'ferry', text: 'Where it is today, on the east quay.' },
];
