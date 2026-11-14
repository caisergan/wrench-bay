// Dev tool: the phone's own heat reading (iOS app only, ios/App/App/DevThermal.swift) and a session log of thermal
// changes and setting changes, so presets can be compared by "how long until the phone turned fair / serious".
import { Capacitor, registerPlugin } from '@capacitor/core';

const native = Capacitor.isNativePlatform();
const DevThermal = native ? registerPlugin('DevThermal') : null;

/** Latest reading. supported = false in a browser, or in an app build without the plugin. */
export const heat = { supported: native, thermal: '', lowPower: false, battery: -1, charging: false };
/** [{ t: seconds since the log started, text, level? }] */
export const heatLog = [];
let t0 = performance.now(), timer = 0;
export const sessionTime = () => (performance.now() - t0) / 1000;
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function logEvent(text, level = '') {
  heatLog.push({ t: sessionTime(), text, level });
  if (heatLog.length > 60) heatLog.shift();
}
/** Start the clock again (e.g. after the phone has cooled down, before testing the next preset). */
export function resetHeatLog(text) {
  heatLog.length = 0;
  t0 = performance.now();
  logEvent(text);
  if (heat.thermal) logEvent(`Thermal ${heat.thermal}`, heat.thermal);
}

async function poll() {
  try {
    const r = await DevThermal.read();
    if (r.thermal !== heat.thermal) logEvent(`Thermal ${r.thermal}`, r.thermal);
    if (heat.thermal && r.lowPower !== heat.lowPower) logEvent(`Low Power Mode ${r.lowPower ? 'on' : 'off'}`);
    if (heat.thermal && r.charging !== heat.charging) logEvent(r.charging ? 'Charger plugged in' : 'Charger unplugged');
    Object.assign(heat, r);
  } catch {
    heat.supported = false;   // an app build from before the plugin: rebuild the iOS app
    clearInterval(timer);
  }
}
/** Read the heat every 2 s while the dev tool is on (one small native call). */
export function startHeat() {
  if (!native || timer) return;
  poll();
  timer = setInterval(poll, 2000);
}
