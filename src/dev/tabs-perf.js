// Dev tool tab: Perf. Switches for frame rate, resolution and shadows, presets to compare, and the phone's heat
// (iOS app). Everything here is dev-only: without the dev tool the game keeps its defaults.
import { html } from '../ui/format.js';
import * as THREE from 'three';
import { perf, perfStats } from '../core/perf.js';
import { renderer, sun } from '../core/engine.js';
import * as P from './perf.js';
import * as V from './view.js';
import { heat, heatLog, fmtTime, sessionTime, resetHeatLog } from './thermal.js';
import { card, row, withIcon, btn, chips, seg, toggle, text, note, track } from './kit.js';

const opt = (key, options) => seg(options, () => perf[key], (v) => P.setPerf(key, v));
const tog = (key, label) => toggle(() => perf[key], (on) => P.setPerf(key, on), label);
const _buf = new THREE.Vector2();
const px = () => { renderer.getDrawingBufferSize(_buf); return `${_buf.x}×${_buf.y} px`; };

export function heatText() {
  if (!heat.supported) return 'Only in the iOS app (a build with DevThermal.swift)';
  if (!heat.thermal) return 'Reading…';
  const bat = heat.battery >= 0 ? ` · battery ${Math.round(heat.battery * 100)}%${heat.charging ? ' charging' : ''}` : '';
  return `${heat.thermal}${heat.lowPower ? ' · Low Power Mode' : ''}${bat}`;
}

export function tabPerf(body, { prefs, savePrefs, flash }) {
  // ---- heat
  const h = card('Heat', 'flame', 'Play a few minutes per preset; compare when the phone turns fair / serious');
  h.right.append(text(() => fmtTime(sessionTime()), 'dv-val'));
  const log = html('<div class="dv-heatlog"></div>');
  let shown = -1, shownFirst = null;
  track(() => {
    if (heatLog.length === shown && heatLog[0] === shownFirst) return;
    shown = heatLog.length; shownFirst = heatLog[0];
    log.textContent = '';
    for (const e of heatLog) {
      const r = html('<div class="dv-hl"><span class="dv-ht"></span><span class="dv-hx"></span></div>');
      r.querySelector('.dv-ht').textContent = fmtTime(e.t);
      r.querySelector('.dv-hx').textContent = e.text;
      if (e.level) r.classList.add('th-' + e.level);
      log.append(r);
    }
  });
  h.body.append(
    row(withIcon('flame', 'Thermal state'), heatText),
    row('Perf meter', 'Drawn fps, worst frame, CPU per frame, pixels, shadows, heat', toggle(V.meterOn, (on) => { V.setMeter(on); prefs.meter = on; savePrefs(); }, 'Perf meter')),
    log,
    chips([{ label: 'Restart the clock', icon: 'clock', onClick: () => { resetHeatLog(`Start: ${P.presetLabel()}`); flash('Clock restarted'); } }]),
    note('Let the phone cool down to nominal and restart the clock before each preset. Unplug the charger: charging heats the phone too.'),
  );

  // ---- presets
  const pr = card('Presets', 'star');
  pr.right.append(text(() => P.presetLabel(), 'dv-val'));
  for (const p of P.PRESETS) {
    pr.body.append(row(p.label, p.sub, btn(P.presetId() === p.id ? 'On' : 'Use', () => { P.applyPreset(p.id); flash(p.label); }, 'teal')));
  }
  // keep the buttons' text in step
  track(() => pr.body.querySelectorAll('.dv-btn').forEach((b, i) => { b.textContent = P.presetId() === P.PRESETS[i].id ? 'On' : 'Use'; }));

  // ---- frame rate
  const fr = card('Frame rate', 'speed');
  fr.body.append(
    row('Cap', () => `Drawing ${drawnFps()} fps now${perfStats.idle ? ' (idle)' : ''}`, opt('fpsCap', [{ value: 0, label: 'Screen' }, { value: 60, label: '60' }, { value: 30, label: '30' }])),
    row('30 fps when still', 'While neither the camera nor the player moves (staff and cars still animate, at 30)', tog('idle30', '30 fps when still')),
    row('5 fps under menus', 'While a menu pauses the game; the menu itself stays smooth', toggle(() => perf.menuFps > 0, (on) => P.setPerf('menuFps', on ? 5 : 0), '5 fps under menus')),
  );

  // ---- resolution
  const rs = card('Resolution', 'gauge');
  const reload = btn('Reload', () => location.reload(), 'teal');
  track(() => { reload.hidden = !P.needsReload(); });
  rs.body.append(
    row('Pixel ratio', () => `Now ${perfStats.pixelRatio.toFixed(2)}x · ${px()} · screen ${window.devicePixelRatio.toFixed(2)}x`,
      opt('pixelRatio', [{ value: 0, label: 'Auto' }, { value: 2, label: '2' }, { value: 1.5, label: '1.5' }, { value: 1.25, label: '1.25' }, { value: 1, label: '1' }])),
    row('Dynamic resolution', () => (perf.dynRes ? `Steps down while frames come late, up when they keep up${perfStats.dynScale ? ` · now ${perfStats.dynScale}x` : ''}` : 'Steps the pixel ratio down while frames come late'), tog('dynRes', 'Dynamic resolution')),
    row('Antialiasing', () => (P.needsReload() ? 'Reload to apply' : 'Smooth edges (4x MSAA)'), reload, tog('antialias', 'Antialiasing')),
  );

  // ---- shadows
  const sh = card('Shadows', 'flame');
  sh.body.append(
    row('Shadows', 'The sun\'s shadows', tog('shadows', 'Shadows')),
    row('Map size', () => `Now ${sun.shadow.mapSize.x} texels square`, opt('shadowSize', [{ value: 0, label: 'Auto' }, { value: 2048, label: '2048' }, { value: 1024, label: '1024' }, { value: 512, label: '512' }])),
    row('Redraw', 'Every Nth frame: moving things\' shadows lag in between', opt('shadowEvery', [{ value: 1, label: 'Every' }, { value: 2, label: '2nd' }, { value: 4, label: '4th' }])),
  );
  body.append(h.el, pr.el, fr.el, rs.el, sh.el, note('Saved on this device. Without the dev tool (?dev=0) the game uses its defaults.'));
}

// drawn frames a second, measured over the panel's 0.5 s refresh
let lastN = 0, lastT = 0, lastFps = 0;
function drawnFps() {
  const now = performance.now();
  if (now - lastT >= 400) {
    if (lastT) lastFps = Math.round(((perfStats.drawn - lastN) * 1000) / (now - lastT));
    lastN = perfStats.drawn; lastT = now;
  }
  return lastFps;
}
