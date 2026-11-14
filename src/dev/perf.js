// Dev tool: the Perf tab's switches (src/core/perf.js) and presets to compare on a device. Changes apply at once,
// except antialiasing (a WebGL context setting: reload).
import { perf, PERF_DEFAULTS, loadPerf, savePerf } from '../core/perf.js';
import { applyPerf, renderer } from '../core/engine.js';
import { logEvent, resetHeatLog, startHeat } from './thermal.js';

export const PRESETS = [
  { id: 'default', label: 'Game default', sub: 'What players get today', set: {} },
  {
    id: 'saver', label: 'Battery saver',
    sub: '60 fps cap, 30 fps when still, 5 fps under menus, 1.5x pixels, 1024 shadow map',
    set: { fpsCap: 60, idle30: true, menuFps: 5, pixelRatio: 1.5, shadowSize: 1024 },
  },
  {
    id: 'lowest', label: 'Lowest', sub: 'The floor, to see how far heat can drop: 30 fps, 1x pixels, no antialiasing, no shadows',
    set: { fpsCap: 30, menuFps: 5, pixelRatio: 1, antialias: false, shadows: false },
  },
];
const presetValues = (p) => ({ ...PERF_DEFAULTS, ...p.set });

/** Id of the preset the switches match, or null (custom). */
export function presetId() {
  const p = PRESETS.find((q) => { const v = presetValues(q); return Object.keys(v).every((k) => v[k] === perf[k]); });
  return p ? p.id : null;
}
export const presetLabel = () => PRESETS.find((p) => p.id === presetId())?.label || 'Custom';

/** The WebGL context was made with this; changing antialias needs a reload. */
const bootAntialias = !!renderer.getContext().getContextAttributes()?.antialias;
export const needsReload = () => perf.antialias !== bootAntialias;

let logT = 0;
function changed(what) {
  savePerf();
  applyPerf();
  // one log line per burst of taps
  clearTimeout(logT);
  logT = setTimeout(() => logEvent(`Settings: ${presetLabel()}${what ? ` (${what})` : ''}`), 1200);
}
export function setPerf(key, value) {
  if (perf[key] === value) return;
  perf[key] = value;
  changed(presetId() ? '' : `${key} ${value}`);
}
export function applyPreset(id) {
  const p = PRESETS.find((q) => q.id === id);
  if (!p) return;
  Object.assign(perf, presetValues(p));
  changed('');
}

/** Dev tool start: load the saved switches (the tool may have been turned on mid-game) and start the heat log. */
export function initPerf() {
  Object.assign(perf, loadPerf());
  applyPerf();
  startHeat();
  resetHeatLog(`Start: ${presetLabel()}`);
}
