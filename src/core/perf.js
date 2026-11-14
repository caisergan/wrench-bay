// Performance switches for testing heat and battery on devices. Only the dev tool's Perf tab changes them; without
// the dev tool every value stays at its default and the engine draws exactly as before. Saved under
// wrench-bay-dev:perf on this device. See docs/dev-tool.md (Perf tab).
import { devFlag } from '../dev/flag.js';

const KEY = 'wrench-bay-dev:perf';

export const PERF_DEFAULTS = Object.freeze({
  fpsCap: 0,          // 0 = the screen's own rate (120 on ProMotion Macs in Chrome), else 60 or 30
  idle30: false,      // 30 fps while neither the camera nor the player moves
  menuFps: 0,         // 0 = full rate under menus; else this many frames a second while the game is paused
  pixelRatio: 0,      // 0 = auto (device ratio up to 2; the browser view has its own pixel budget), else fixed
  dynRes: false,      // lower the pixel ratio while frames run late, raise it again when they keep up
  antialias: true,    // a WebGL context setting: needs a reload
  shadows: true,
  shadowSize: 0,      // 0 = auto (2048 phone view, 4096 browser view), else this many texels square
  shadowEvery: 1,     // redraw the shadow map every Nth frame (moving things' shadows lag in between)
});

export const perf = { ...PERF_DEFAULTS };
if (devFlag()) Object.assign(perf, loadPerf());

/** The saved switches (defaults filled in). */
export function loadPerf() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    const out = { ...PERF_DEFAULTS };
    for (const k of Object.keys(PERF_DEFAULTS)) if (typeof saved[k] === typeof PERF_DEFAULTS[k]) out[k] = saved[k];
    return out;
  } catch { return { ...PERF_DEFAULTS }; }
}
export function savePerf() {
  try { localStorage.setItem(KEY, JSON.stringify(perf)); } catch { /* storage blocked */ }
}

/** Filled in by the engine every drawn frame; the dev perf meter reads (and resets) it. */
export const perfStats = {
  drawn: 0,         // frames actually drawn (a capped loop skips some animation frames)
  maxGap: 0,        // longest time between two drawn frames since the meter last reset it (ms)
  cpuMs: 0,         // game updates + render submission per drawn frame, smoothed (ms)
  shadowDraws: 0,   // shadow map redraws (count)
  pixelRatio: 1,
  dynScale: 0,      // dynamic resolution's current pixel ratio (0 = off)
  idle: false,      // the idle 30 fps cap is active right now
};
