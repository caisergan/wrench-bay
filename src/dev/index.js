// Dev tool entry (lazy chunk; main.js loads it only when src/dev/flag.js says it is on). See docs/dev-tool.md.
//   boot()   before the game exists: writes the saved balance overrides into the config tables
//   start()  after the UI and the game: the DEV button, the sheet, ?nohud
import { applySaved, tunedCount } from './tuning.js';
import { setClean } from './view.js';
import { buildPanel } from './panel.js';
import { ui } from '../ui/index.js';

let booted = false, panel = null;

export function boot() {
  if (booted) return;
  booted = true;
  applySaved();
}

/** announce: the tool was switched on mid-game (cash pill gesture): say so, and rebuild if overrides were applied late. */
export function start({ announce = false } = {}) {
  if (panel) return panel;
  panel = buildPanel(ui);
  if (new URLSearchParams(location.search).has('nohud')) setClean(true);
  if (announce) {
    panel.open();
    panel.flash('Dev tools on');
    if (tunedCount() && window.__game) window.__game.rebuild();
  }
  window.__dev = panel;
  return panel;
}
