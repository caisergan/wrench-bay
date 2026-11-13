// Test helpers for the rescue agent (browser console):
//   const T = await import('/docs/town-agents/tools/rescue/setup.js');
//   await T.ready(); await T.callAt('h3'); await T.inTruck(); await T.hookFrom(dl, dt, dyaw);
//   await T.drive([{x, z}, ...]); T.log() ...
import './autopilot.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };
export async function ready() { for (let i = 0; i < 50 && !(window.__game && window.__game.rescueState); i++) await sleep(100); return !!window.__game?.rescueState; }
export const st = () => window.__game.rescueState();
export const call = () => st().calls[0] || null;
/** A call at spot (waits until the owner stands, i.e. after a roll-in). */
export async function callAt(spot, waitStand = true) {
  await ready();
  const c = call();
  if (!c || c.spot !== spot) __game.rescue(spot);
  if (waitStand) for (let i = 0; i < 120; i++) { const k = call(); if (k && k.state === 'waiting' && k.owner === 'stand') break; await sleep(250); }
  return call();
}
export async function inTruck() {
  if (__game.player.mode !== 'vehicle') { __game.drive('tow'); for (let i = 0; i < 20 && __game.player.mode !== 'vehicle'; i++) await sleep(100); }
  return __game.player.mode === 'vehicle';
}
/** Put the truck near the stop pose (dl ahead, dt right, dyaw) and wait until it is towing. */
export async function hookFrom(dl = 0.8, dt = 0, dyaw = 0, wait = true) {
  __game.rescueTruckTo(dl, dt, dyaw);
  if (!wait) return call();
  for (let i = 0; i < 80; i++) { await sleep(150); const c = call(); if (!c || c.state === 'towing') break; }
  return call();
}
export function drive(path, opts) { return window.__auto.go(path, opts); }
let iv = null; const L = [];
export function logStart(ms = 200) {
  L.length = 0; clearInterval(iv);
  iv = setInterval(() => { const s = st(), c = s.calls[0]; L.push([+s.truck.x, +s.truck.z, s.truck.yaw, c?.tow?.art ?? null, c?.state ?? null]); }, ms);
}
export function logStop() { clearInterval(iv); return L.slice(); }
/** Pause the game the first frame pred() is true (resolves true), or after timeout ms (false). resume() goes on. */
export async function pauseWhen(pred, timeout = 20000) {
  const E = await import('/src/core/engine.js');
  return new Promise((resolve) => {
    const t0 = performance.now();
    const f = () => {
      let ok = false;
      try { ok = pred(); } catch { ok = false; }
      if (ok) { E.setPaused(true); resolve(true); return; }
      if (performance.now() - t0 > timeout) { resolve(false); return; }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
}
export async function resume() { const E = await import('/src/core/engine.js'); E.setPaused(false); }
export async function pause() { const E = await import('/src/core/engine.js'); E.setPaused(true); }
/** This tab ignores Vite's reload / HMR messages (other agents edit files all the time); reload by hand. */
export function noReload() {
  if (JSON.parse.__rescue) return;
  const op = JSON.parse;
  const f = function (s, r) {
    if (typeof s === 'string' && s.length < 4000 && (s.includes('"full-reload"') || s.includes('"type":"update"'))) return { type: 'custom', event: 'rescue:ignored' };
    return op.call(this, s, r);
  };
  f.__rescue = true;
  JSON.parse = f;
}
noReload();
// reload diagnostics: was the last page unload a normal one (beforeunload fired) or a crash?
if (!window.__rescueDiag) {
  window.__rescueDiag = true;
  const prev = sessionStorage.getItem('rescueUnload');
  window.__rescueLastUnload = prev;
  sessionStorage.removeItem('rescueUnload');
  window.addEventListener('beforeunload', () => sessionStorage.setItem('rescueUnload', new Date().toISOString()));
}
export const lastUnload = () => window.__rescueLastUnload;
