// Test autopilot for the rescue agent (browser console): drives the player / their vehicle along waypoints with a
// simulated joystick. import('/docs/town-agents/tools/rescue/autopilot.js') then __auto.go([{x, z}, ...], { speed }).
(() => {
  const root = document.getElementById('game-root') || document.body;
  const R = 52;
  let st = null;
  function setStick(dx, dz) {
    const r = root.getBoundingClientRect();
    const ox = r.left + r.width * 0.5, oy = r.top + r.height * 0.8;
    if (!st.down) {
      st.down = true;
      root.dispatchEvent(new PointerEvent('pointerdown', { clientX: ox, clientY: oy, pointerId: 77, bubbles: true }));
    }
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: ox + dx * R, clientY: oy + dz * R, pointerId: 77, bubbles: true }));
  }
  function release() {
    if (st && st.down) { window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, bubbles: true })); st.down = false; }
  }
  function body() { const p = __game.player; return p.vehicle ? p.vehicle : p.car ? p.car : { pos: p.pos }; }
  function tick() {
    if (!st) return;
    const b = body(), wp = st.path[st.i];
    if (!wp) { release(); const r = st.resolve; st = null; r && r(true); return; }
    const dx = wp.x - b.pos.x, dz = wp.z - b.pos.z, d = Math.hypot(dx, dz);
    const last = st.i === st.path.length - 1;
    if (d < (last ? 0.35 : (wp.r ?? 1.6))) { st.i++; if (last) { release(); } requestAnimationFrame(tick); return; }
    let mag = st.speed;
    if (last && st.slow) mag = Math.min(mag, Math.max(0.18, d / 6));
    if (wp.mag) mag = wp.mag;
    setStick((dx / d) * mag, (dz / d) * mag);
    if (performance.now() - st.t0 > (st.timeout || 60000)) { release(); const r = st.resolve; st = null; r && r(false); return; }
    requestAnimationFrame(tick);
  }
  window.__auto = {
    go(path, { speed = 1, slow = true, timeout = 60000 } = {}) {
      if (st) release();
      return new Promise((resolve) => { st = { path, i: 0, speed, slow, resolve, down: false, t0: performance.now(), timeout }; requestAnimationFrame(tick); });
    },
    stop() { release(); st = null; },
  };
})();
