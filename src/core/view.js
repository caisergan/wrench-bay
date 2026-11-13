// View mode: how the game sits in the window.
//   'mobile'   the original portrait phone frame, centred in the window (always used in the iOS app)
//   'browser'  fills the whole browser window: landscape, a much wider view of the world, keyboard-first
// The player picks one on the title screen (or in the pause menu); the choice is remembered in localStorage.
// ?view=mobile / ?view=browser forces a mode for this load (and skips the choice on the title screen).
import { isNative } from './platform.js';

const KEY = 'wrench-bay-view';
const MODES = ['mobile', 'browser'];
const params = new URLSearchParams(location.search);
const forced = MODES.includes(params.get('view')) ? params.get('view') : null;

function stored() {
  try { const v = localStorage.getItem(KEY); return MODES.includes(v) ? v : null; } catch { return null; }
}
/** First visit: a landscape window with a mouse gets the browser view, a phone or a narrow window the phone frame. */
function guess() {
  const landscape = window.innerWidth > window.innerHeight * 1.05;
  const mouse = window.matchMedia?.('(pointer: fine)').matches;
  return landscape && mouse ? 'browser' : 'mobile';
}

let mode = isNative ? 'mobile' : forced || stored() || guess();
const subs = [];
document.documentElement.classList.toggle('view-browser', mode === 'browser');

/** 'mobile' or 'browser'. */
export function viewMode() { return mode; }
export const isBrowserView = () => mode === 'browser';
/** Can the player switch views here? Not in the iOS app (always phone). */
export const canChooseView = !isNative;
/** True when the URL already picked the view, so the title screen does not have to ask. */
export const viewForced = !!forced;

/** Switch the view (remembered for next time). fn(mode) subscribers re-layout: engine resize, HUD, title. */
export function setViewMode(next) {
  if (!canChooseView || !MODES.includes(next) || next === mode) return;
  mode = next;
  try { localStorage.setItem(KEY, mode); } catch { /* storage blocked: this load only */ }
  document.documentElement.classList.toggle('view-browser', mode === 'browser');
  for (const fn of subs.slice()) fn(mode);
}
/** Remember the current mode (the title screen calls this on PLAY, so a first-visit guess becomes the choice). */
export function keepViewMode() {
  try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
}
/** fn(mode) after every switch. Returns an unsubscribe function. */
export function onViewMode(fn) {
  subs.push(fn);
  return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
}
