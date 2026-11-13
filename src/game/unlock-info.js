// What an unlock-chain pad says (garage UNLOCKS, Spray Bay PAINT_UNLOCKS, Platinum Club VIP_UNLOCKS): the picture on
// its ground tag, its name, and in the pay dock what it does plus a "before -> after" row. One table per workshop;
// every number is worked out from the config, so the words follow balance changes. Design: docs/upgrade-pads/.
//
// unlockInfo(facId, u) -> {
//   icon (ui ICON key), color? (css colour for icons drawn in var(--c): the paint canister), kind: 'buy' | 'up',
//   rib (dock ribbon), name, what (one sentence), change: [{ icon?, color?, label, from?, to }], done (dock "Bought!" line)
// }
import { UNLOCKS, ECONOMY, PROBLEMS, PAINT, PAINT_COLORS, PAINT_UNLOCKS, VIP, VIP_UNLOCKS } from '../config.js';

const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
/** 6 -> "6 s", 82.5 -> "83 s", 2.5 -> "2.5 s". */
const sec = (s) => (s >= 10 ? Math.round(s) : Math.round(s * 10) / 10) + ' s';
const pct = (m) => '+' + Math.round((m - 1) * 100) + '%';
const ORD = ['', 'Second ', 'Third ', 'Fourth '];
const PART = { tire: 'Tyre', oil: 'Oil', battery: 'Battery', engine: 'Engine', paint: 'Paint' };
const JOB = { tire: 'flat tyres', oil: 'oil changes', battery: 'dead batteries', engine: 'engine trouble', paint: 'paint jobs' };

/** How many of a kind the workshop has before chain entry u: the ones it starts with + earlier entries. */
function before(list, u, test, initial) {
  let n = initial;
  for (const e of list) { if (e === u) break; if (test(e)) n++; }
  return n;
}

// ---------------------------------------------------------------- garage (UNLOCKS)
function garage(u) {
  switch (u.type) {
    case 'station': {
      const n = before(UNLOCKS, u, (e) => e.type === 'station', 1);
      return {
        icon: u.key, kind: 'buy', rib: 'NEW SHELF', name: `${PART[u.key] || u.key} shelf`,
        what: `Cars start coming in with ${JOB[u.key] || u.key} ($${PROBLEMS[u.key]?.price} a job).`,
        change: [{ icon: 'wrench', label: 'Job types', from: n, to: n + 1 }],
      };
    }
    case 'lift': {
      const n = before(UNLOCKS, u, (e) => e.type === 'lift', 1);
      return {
        icon: 'lift', kind: 'buy', rib: 'NEW LIFT', name: `Lift ${u.index + 1}`,
        what: 'One more car can be repaired at the same time.',
        change: [{ icon: 'car', label: 'Lifts', from: n, to: n + 1 }],
      };
    }
    case 'mechanic':
      return {
        icon: 'mechanic', kind: 'buy', rib: 'HIRE', name: u.index ? `${ORD[u.index]}mechanic` : 'Mechanic',
        what: u.index ? 'Takes another lift for you: fetches the parts and fixes the car.'
          : 'Takes a lift for you: fetches the parts and fixes the car.',
        change: [{ icon: 'mechanic', label: 'Mechanics', from: u.index, to: u.index + 1 }],
      };
    case 'valet':
      return {
        icon: 'valet', kind: 'buy', rib: 'HIRE', name: 'Valet',
        what: 'Drives the waiting cars onto free lifts, so you never have to.',
        change: [{ icon: 'car', label: 'Parks the cars', from: 'You', to: 'Valet' }],
      };
    case 'coffee':
      return {
        icon: 'coffee', kind: 'buy', rib: 'EXTRA', name: 'Coffee cart',
        what: 'Customers wait longer before they get angry.',
        change: [{ icon: 'clock', label: 'Patience', from: sec(ECONOMY.patience), to: sec(ECONOMY.patience * ECONOMY.coffeePatienceMult) }],
      };
    case 'billboard':
      return {
        icon: 'billboard', kind: 'buy', rib: 'EXTRA', name: 'Billboard',
        what: 'Draws more customers, and more of them are VIPs.',
        change: [
          { icon: 'car', label: 'Customers', to: pct(1 / ECONOMY.billboardSpawnMult) },
          { icon: 'star', label: 'VIPs', to: '×' + ECONOMY.billboardVipMult },
        ],
      };
  }
  return null;
}

// ---------------------------------------------------------------- Spray Bay (PAINT_UNLOCKS)
function paint(u) {
  switch (u.type) {
    case 'tank': {
      const c = PAINT_COLORS[u.key], col = hex(c.hex), name = c.label.toLowerCase();
      const n = before(PAINT_UNLOCKS, u, (e) => e.type === 'tank', 3);
      const info = {
        icon: 'spray', color: col, kind: 'buy', rib: c.premium ? 'PREMIUM COLOUR' : 'NEW COLOUR', name: `${c.label} paint`,
        what: `Customers who want ${name} start coming.`,
        change: [{ icon: 'spray', color: col, label: 'Colours', from: n, to: n + 1 }],
      };
      if (c.premium) {
        info.what = `Customers who want ${name} start coming. Premium jobs pay more.`;
        info.change.push({ icon: 'cash', label: 'Their jobs pay', to: '×' + PAINT.premiumMult });
      }
      return info;
    }
    case 'bay':
      return {
        icon: 'booth', kind: 'buy', rib: 'NEW BOOTH', name: `Booth ${u.index + 1}`,
        what: 'Paint two cars at the same time.',
        change: [{ icon: 'booth', label: 'Booths', from: u.index, to: u.index + 1 }],
      };
    case 'painter':
      return {
        icon: 'painter', kind: 'buy', rib: 'HIRE', name: u.index ? 'Second painter' : 'Painter',
        what: u.index ? 'Takes the second booth, so both booths paint without you.'
          : 'Takes a booth for you: fetches the paint and sprays the car.',
        change: [{ icon: 'painter', label: 'Painters', from: u.index, to: u.index + 1 }],
      };
    case 'preptech':
      return {
        icon: 'valet', kind: 'buy', rib: 'HIRE', name: 'Prep tech',
        what: 'Drives the waiting cars into free booths, so you never have to.',
        change: [{ icon: 'car', label: 'Parks the cars', from: 'You', to: 'Prep tech' }],
      };
    case 'irlamps':
      return {
        icon: 'irlamp', kind: 'up', rib: 'UPGRADE', name: 'Infra-red lamps',
        what: 'Every booth bakes the paint twice as fast.',
        change: [{ icon: 'clock', label: 'Curing', from: sec(PAINT.cure), to: sec(PAINT.cureIR) }],
      };
    case 'stripes':
      return {
        icon: 'stripes', kind: 'buy', rib: 'NEW JOB', name: 'Stripe kit',
        what: `About ${Math.round(PAINT.stripeChance * 10)} in 10 customers also want a stripe in a second colour.`,
        change: [{ icon: 'cash', label: 'Stripe jobs pay', to: '×' + PAINT.stripeMult }],
      };
  }
  return null;
}

// ---------------------------------------------------------------- Platinum Club (VIP_UNLOCKS; the club is not built yet)
function vip(u) {
  switch (u.type) {
    case 'bar':
      return {
        icon: 'glass', kind: 'buy', rib: 'EXTRA', name: 'Sparkling bar',
        what: 'VIP owners wait longer at the bar.',
        change: [{ icon: 'clock', label: 'VIP patience', from: sec(VIP.patience), to: sec(VIP.patience * VIP.barPatienceMult) }],
      };
    case 'tech':
      return {
        icon: 'tech', kind: 'buy', rib: 'HIRE', name: 'Master tech',
        what: 'Takes a gold lift for you: fetches the premium kit and fixes the car.',
        change: [{ icon: 'tech', label: 'Master techs', from: 0, to: 1 }],
      };
    case 'host':
      return {
        icon: 'bell', kind: 'buy', rib: 'HIRE', name: 'Host',
        what: 'Parks the VIP cars on free gold lifts, without a scratch.',
        change: [{ icon: 'car', label: 'Parks the cars', from: 'You', to: 'Host' }],
      };
    case 'bay':
      return {
        icon: 'lift', color: '#f6c453', kind: 'buy', rib: 'NEW LIFT', name: `Gold lift ${u.index + 1}`,
        what: 'One more VIP car can be serviced at the same time.',
        change: [{ icon: 'crown', label: 'Gold lifts', from: u.index, to: u.index + 1 }],
      };
    case 'detailer':
      return {
        icon: 'sparkle', kind: 'buy', rib: 'HIRE', name: 'Detailer',
        what: 'Polishes the cars on the turntable for you.',
        change: [{ icon: 'sparkle', label: 'Polishing', from: 'You', to: 'Detailer' }],
      };
    case 'paparazzi':
      return {
        icon: 'camera', kind: 'buy', rib: 'EXTRA', name: 'Paparazzi wall',
        what: 'Fame draws more VIPs to the club.',
        change: [{ icon: 'crown', label: 'A VIP every', from: sec(VIP.spawnInterval), to: sec(VIP.spawnInterval * VIP.paparazziMult) }],
      };
  }
  return null;
}

const TABLES = { garage, paint, vip };

/** What chain entry u of facility facId says (a plain fallback built from its label for anything not in a table). */
export function unlockInfo(facId, u) {
  const info = TABLES[facId]?.(u) || {
    icon: 'tag', kind: 'buy', rib: 'FOR SALE', name: u.label.split('!')[0], what: u.label.split('!')[1]?.trim() || '', change: [],
  };
  info.done = u.label;
  return info;
}

/** Every chain, in buying order (the proposal page lists them). */
export const UNLOCK_CHAINS = [
  { id: 'garage', name: 'Garage', list: UNLOCKS },
  { id: 'paint', name: 'Spray Bay', list: PAINT_UNLOCKS },
  { id: 'vip', name: 'Platinum Club', list: VIP_UNLOCKS },
];
