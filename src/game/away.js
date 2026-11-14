// Away from a place you own (TOWN.md 4.16). Once you can't hear a place (the garage, the Spray Bay ...), it only
// speaks up when it needs you: a customer there below LOW patience is about to cost you the Speedy bonus.
//   - while that lasts and you can't hear the place: a chip "Garage: Speedy bonus 0:12" and a bell pointer to the car;
//   - the call: the `call` bell + one warning vibration, and the pointer goes first in line for PTR_BOOST s. Once
//     per customer, at most every CALL_GAP s per place, never within LEAVE_GRACE s of leaving, never while a panel
//     is open or you tow a rescue (it waits), and after MAX_UNANSWERED calls you didn't come back for only the chip
//     and the pointer remain until you are within earshot again (the shop doesn't nag);
//   - coming home: the first pile you collect at a place after TRIP s away plays the `homecoming` cascade.
// Nothing here shows what a place earned while you were away.
//   ctx.away.homecoming(pile) -> true once per trip for that place's piles (cash.js asks when a pile is collected)
import { registerSystem } from './registry.js';
import { ui } from '../ui/index.js';
import { ECONOMY } from '../config.js';

const NAMES = { garage: 'Garage', paint: 'Spray Bay', vip: 'VIP Club' };
const AUDIBLE = 0.02;      // ctx.hearing() below this plays nothing (ui/audio.js sfx): the place is out of earshot
const LOW = 0.25;          // patience share under which a customer needs you
const LEAVE_GRACE = 10;    // s out of earshot before a place may call (you just saw the line)
const CALL_GAP = 45;       // s between two calls of the same place
const MAX_UNANSWERED = 2;  // calls without you coming back; then chip + pointer only, until you are in earshot again
const PTR_BOOST = 8;       // s the pointer stays first in line after a call
const TRIP = 30;           // s out of earshot that make the next pile you collect there a homecoming

export function createAway(ctx) {
  const places = new Map();   // fac -> place state
  const called = new WeakSet(); // customers a place already called about
  let clock = 0;

  const place = (fac) => {
    let p = places.get(fac);
    if (!p) {
      p = { fac, name: NAMES[fac.id] || fac.id, chipId: 'away-' + fac.id, away: 0, lastCall: -Infinity,
        unanswered: 0, trip: false, ptr: null, boostT: 0, chipCar: null, chipUntil: 0 };
      places.set(fac, p);
    }
    return p;
  };
  const heard = (fac) => fac.bays.list.some((b) => ctx.hearing(b) >= AUDIBLE);
  /** The customer of this place closest to losing patience, if one is under LOW. */
  function lowCar(fac) {
    let best = null, bestK = LOW;
    for (const c of fac.cars.list) {
      if (!c.patienceOn || c.patienceGone) continue;
      const k = c.patience / c.patienceMax;
      if (k < bestK) { best = c; bestK = k; }
    }
    return best;
  }
  /** Seconds until this customer's patience runs out (cars further back in the lane drain slower). */
  function secondsLeft(car) {
    const behind = car.mode === 'queued' && car.sys?.lane?.indexOf(car) > 0;
    return car.patience / (behind ? ECONOMY.patienceQueueRate : 1);
  }
  /** Towing a rescue (hook-up, tow, drop): a call waits, a buzz mid-drive pulls you off the road. */
  const towing = () => { const v = ctx.player?.vehicle; return !!(v && ctx.rescue?.busy?.(v)); };

  function showNeed(p, car) {
    const until = Date.now() + secondsLeft(car) * 1000;
    if (p.chipCar !== car || Math.abs(until - p.chipUntil) > 1500) {
      p.chipCar = car; p.chipUntil = until;
      ui.chip(p.chipId, { icon: 'wait', text: `${p.name}: Speedy bonus`, until });
    }
    p.ptr ||= ctx.pointers?.add({ kind: 'alert', text: p.name + '!', worldPos: car.pos });
    p.ptr?.setPos(car.pos).setVisible(true);
  }
  function hideNeed(p) {
    if (p.chipCar) { ui.chip(p.chipId, null); p.chipCar = null; }
    p.ptr?.setVisible(false);
  }

  function call(p, car) {
    called.add(car);
    p.lastCall = clock;
    p.unanswered++;
    ui.sfx('call');
    p.boostT = PTR_BOOST;
    p.ptr?.setPriority(-1);
  }

  return {
    update(dt) {
      clock += dt;
      for (const fac of ctx.facilityList) {
        if (!fac.bays?.list.length || !fac.cars) continue;
        const p = place(fac);
        if (p.boostT > 0 && (p.boostT -= dt) <= 0) p.ptr?.setPriority(null);
        if (heard(fac)) {
          p.away = 0; p.unanswered = 0;
          hideNeed(p);
          continue;
        }
        p.away += dt;
        if (p.away >= TRIP) p.trip = true;
        const car = lowCar(fac);
        if (!car) { hideNeed(p); continue; }
        showNeed(p, car);
        if (!called.has(car) && p.away >= LEAVE_GRACE && clock - p.lastCall >= CALL_GAP && p.unanswered < MAX_UNANSWERED
          && !ui.anyModalOpen?.() && !towing()) call(p, car);
      }
    },
    /** A pile was collected: true the first time at that place after a trip (cash.js plays `homecoming`). */
    homecoming(pile) {
      for (const p of places.values()) {
        if (!p.fac.bays.list.some((b) => b.pile === pile)) continue;
        if (!p.trip) return false;
        p.trip = false;
        return true;
      }
      return false;
    },
    /** Dev / tests: the state of every place. */
    debugState() {
      return [...places.values()].map((p) => ({ id: p.fac.id, away: +p.away.toFixed(1), unanswered: p.unanswered, trip: p.trip,
        sinceCall: Number.isFinite(p.lastCall) ? +(clock - p.lastCall).toFixed(1) : null, need: !!p.chipCar, boost: +p.boostT.toFixed(1) }));
    },
    dispose() {
      for (const p of places.values()) { if (p.chipCar) ui.chip(p.chipId, null); p.ptr?.remove(); }
      places.clear();
    },
  };
}

registerSystem('away', (ctx) => createAway(ctx));
