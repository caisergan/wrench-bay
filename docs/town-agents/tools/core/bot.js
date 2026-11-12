// Autoplay bot for regression runs. In the page: (await import('/@fs/tmp/wb-core/bot.js')).start({ speed: 4 })
// Garage: teleports the player around (on foot) and drops driven cars into a free lift's capture box.
export function start({ speed = 4, pads = true, facility = 'garage', interval = 100 } = {}) {
  const g = window.__game;
  if (window.__bot) clearInterval(window.__bot.id);
  const bot = { steps: 0, enabled: true, pads, errs: [], facility };
  function tick() {
    if (!bot.enabled) return;
    bot.steps++;
    const w = g.world, pl = w.player;
    const fac = w.facilities[bot.facility] || w.facilities.garage;
    if (pl.mode === 'driving' && pl.car) {
      const bays = pl.car.fac.bays;
      const lift = bays.list.find((l) => l && l.canCapture);
      if (lift) { pl.car.pos.x = lift.x; pl.car.pos.z = lift.z + 0.2; }
      return;
    }
    if (pl.mode !== 'foot') return;
    const pile = w.piles.find((p) => p.amount > 0 && p.flying === 0);
    if (pile) { pl.teleport(pile.trigger.x + 0.3, pile.trigger.z); return; }
    if (bot.pads) {
      for (const f of w.facilityList) for (const pad of f.pads?.list || []) {
        if (!pad.done && pad.remaining > 0 && g.state.cash >= pad.remaining) { pl.teleport(pad.pos.x, pad.pos.z); return; }
      }
    }
    for (const l of fac.bays.list) {
      if (!l || !l.isWorkable()) continue;
      const car = l.car;
      const carry = pl.stack.items.some((it) => car.findNeed(it.userData.partType, null, true));
      if (carry || (car.firstReady() && l.phase === 'up')) { pl.teleport(l.workPos.x, l.workPos.z); return; }
      for (const j of car.jobs) {
        if (j.state !== 'need' || j.incoming) continue;
        const st = fac.stations.get(j.type);
        if (st && st.stack.ready > 0 && pl.stack.count < pl.capacity()) { pl.teleport(st.zonePos.x, st.zonePos.z); return; }
      }
    }
    if (pl.stack.count >= pl.capacity() && fac.scrap) { pl.teleport(fac.scrap.x - 1.0, fac.scrap.z); return; }
    if (!fac.staff.valet && fac.bays.freeCount() > 0) {
      for (const car of fac.cars.lane) if (fac.cars.isWaiting(car)) { pl.teleport(car.pos.x, car.pos.z + fac.L.queuePickupOffsetZ); return; }
    }
    const home = fac.L.bays[0];
    pl.teleport(home.x, home.z + 5.5);
  }
  bot.id = setInterval(() => { try { tick(); } catch (e) { if (bot.errs.length < 20) bot.errs.push(String(e.stack).slice(0, 500)); } }, interval);
  window.__bot = bot;
  g.timeScale = speed;
  window.__errs = window.__errs || [];
  if (!window.__errHook) {
    window.__errHook = true;
    window.addEventListener('error', (e) => window.__errs.push(String(e.message) + ' @' + e.filename + ':' + e.lineno));
    window.addEventListener('unhandledrejection', (e) => window.__errs.push('rej ' + String(e.reason?.stack || e.reason).slice(0, 300)));
  }
  return 'bot on';
}
export function stop() { if (window.__bot) { clearInterval(window.__bot.id); window.__bot.enabled = false; } }
export function report() {
  const g = window.__game, s = g.state;
  return {
    steps: window.__bot?.steps, botErrs: window.__bot?.errs, errs: window.__errs,
    cash: s.cash, unlocked: s.unlocked.length, stats: s.stats, streak: s.streak, fameXp: s.town.fameXp, town: s.town.open,
    cars: g.cars.map((c) => c.mode), lifts: g.lifts.filter(Boolean).map((l) => l.phase),
    mech: g.staff.mechanics.map((m) => m.state), valet: g.staff.valet?.state || null,
  };
}

// ---- synthetic joystick (analog): joy(x, z) with x, z in -1..1 (world directions); joy(null) releases
const J = { on: false };
export function joy(x, z) {
  const root = document.getElementById('game-root');
  const r = root.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height * 0.72;
  if (x === null) { if (J.on) window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, clientX: cx, clientY: cy })); J.on = false; return; }
  if (!J.on) { root.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, clientX: cx, clientY: cy, bubbles: true })); J.on = true; }
  window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 77, clientX: cx + x * 52, clientY: cy + z * 52 }));
}
/** Steer the driven thing (vehicle or car or player) through points [{x,z}]; resolves when done or after timeout s. */
export function autodrive(points, { timeout = 40, tol = 1.2, slowLast = true } = {}) {
  const g = window.__game;
  return new Promise((resolve) => {
    const pts = points.map((p) => ({ ...p }));
    const t0 = performance.now();
    const id = setInterval(() => {
      const pl = g.world.player;
      const body = pl.vehicle || pl.car || pl;
      const p = body.pos;
      while (pts.length > 1 && Math.hypot(pts[0].x - p.x, pts[0].z - p.z) < tol) pts.shift();
      const wp = pts[0];
      const d = Math.hypot(wp.x - p.x, wp.z - p.z);
      const late = (performance.now() - t0) / 1000 > timeout;
      if ((pts.length === 1 && d < 0.35) || late) { clearInterval(id); joy(null); resolve({ x: p.x, z: p.z, late, left: pts.length }); return; }
      let m = 1;
      if (slowLast && pts.length === 1) m = Math.max(0.15, Math.min(1, d / 4));
      joy(((wp.x - p.x) / d) * m, ((wp.z - p.z) / d) * m);
    }, 40);
  });
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
