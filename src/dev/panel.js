// Dev tool shell: the DEV button, the bottom sheet with its tabs, live refresh and the keyboard shortcuts.
// The sheet does not pause the game: it is meant to be used while you watch the change happen above it.
import './dev.css';
import { events } from '../core/events.js';
import { state, shopName, fameLevel, townOpen } from '../core/state.js';
import { html } from '../ui/format.js';
import { ICON } from '../ui/icons.js';
import { DICON, clearLive, syncAll, fmt } from './kit.js';
import { tabMoney, tabGarage, tabTown, tabPlay } from './tabs-game.js';
import { tabTune, tabView, tabSave } from './tabs-tools.js';
import { tabPerf } from './tabs-perf.js';
import { onTuning, tunedCount } from './tuning.js';
import { onRebuild } from './actions.js';
import * as V from './view.js';

const TABS = [
  { id: 'money', label: 'Money', icon: ICON.cash, render: tabMoney },
  { id: 'garage', label: 'Garage', icon: ICON.wrench, render: tabGarage },
  { id: 'town', label: 'Town', icon: ICON.map, render: tabTown },
  { id: 'play', label: 'Play', icon: ICON.play, render: tabPlay },
  { id: 'tune', label: 'Tune', icon: ICON.gauge, render: tabTune },
  { id: 'view', label: 'View', icon: DICON.eye, render: tabView },
  { id: 'perf', label: 'Perf', icon: ICON.flame, render: tabPerf },
  { id: 'save', label: 'Save', icon: DICON.disk, render: tabSave },
];
// events after which the open tab re-reads the save
const LIVE_EVENTS = [
  'cash:changed', 'gems:changed', 'boosts:changed', 'streak:changed', 'upgrades:changed', 'progress:changed', 'unlock',
  'fame:changed', 'fame:levelup', 'property:changed', 'town:opened', 'district:opened', 'manager:hired', 'till:changed',
  'townunlock', 'project:changed', 'garage:complete',
];
const PREFS_KEY = 'wrench-bay-dev:ui';

export function buildPanel(ui) {
  let prefs = { tab: 'money', tall: false, ghost: true, meter: false };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { /* ignore */ }
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

  const uiRoot = document.getElementById('ui');
  const launch = html(`<button class="dv-launch pressable" data-ui aria-label="Dev tools">${ICON.wrench}<span>DEV</span><i class="dv-badge"></i></button>`);
  const sheet = html(`
    <div class="dv-sheet" data-ui role="dialog" aria-label="Dev tools">
      <div class="dv-tape"></div>
      <div class="dv-head">
        <span class="ph-icon">${ICON.wrench}</span>
        <div class="dv-ttl"><h2>Dev Tools</h2><small></small></div>
        <span class="dv-busy">Rebuilding…</span>
        <button class="dv-size pressable" data-ui aria-label="Taller">${DICON.chevron}</button>
        <button class="x-btn pressable" data-ui aria-label="Close">${ICON.x}</button>
      </div>
      <nav class="dv-tabs">${TABS.map((t) => `<button class="dv-tab pressable" data-ui data-tab="${t.id}">${t.icon}<span>${t.label}</span></button>`).join('')}</nav>
      <div class="dv-body"></div>
      <div class="dv-flash"></div>
    </div>`);
  uiRoot.append(launch, sheet);
  const body = sheet.querySelector('.dv-body'), sum = sheet.querySelector('.dv-ttl small');
  const badge = launch.querySelector('.dv-badge'), busy = sheet.querySelector('.dv-busy'), flashEl = sheet.querySelector('.dv-flash');

  // ---- flash message (inside the sheet, so it works with toasts hidden)
  let flashT = 0;
  function flash(msg) {
    flashEl.textContent = msg;
    flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on');
    clearTimeout(flashT);
    flashT = setTimeout(() => flashEl.classList.remove('on'), 1800);
  }

  // ---- tabs
  let isOpen = false;
  function render() {
    clearLive();
    body.textContent = '';
    const tab = TABS.find((t) => t.id === prefs.tab) || TABS[0];
    sheet.querySelectorAll('.dv-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab.id));
    try { tab.render(body, { ui, flash, prefs, savePrefs, rerender: render }); } catch (err) { console.error('[dev] tab', tab.id, err); body.append(html(`<p class="dv-note warn">This tab failed: ${err.message}</p>`)); }
    refreshHeader();
  }
  sheet.querySelector('.dv-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === prefs.tab) return;
    prefs.tab = b.dataset.tab; savePrefs();
    body.scrollTop = 0;
    render();
  });

  // ---- header: live summary of the save
  function refreshHeader() {
    const parts = [`#${state.shopLevel + 1} ${shopName()}`, `$${fmt(state.cash)}`, `${fmt(state.gems)} gems`];
    if (townOpen()) parts.push(`fame ${fameLevel()}`);
    const t = parts.join(' · ');
    if (sum.textContent !== t) sum.textContent = t;
  }
  function refreshLauncher() {
    const n = tunedCount();
    badge.textContent = n ? String(n) : '';
    badge.classList.toggle('on', n > 0);
    launch.title = n ? `${n} tuned value${n > 1 ? 's' : ''} active` : 'Dev tools';
    launch.classList.toggle('ghost', prefs.ghost && V.isHidden('hud'));
    launch.classList.toggle('hidden', isOpen);
  }

  // ---- open / close / size
  function setOpen(on) {
    isOpen = on;
    sheet.classList.toggle('open', on);
    if (on) render(); else { clearLive(); body.textContent = ''; document.activeElement?.blur?.(); }
    refreshLauncher();
  }
  const setTall = (t) => { prefs.tall = t; savePrefs(); sheet.classList.toggle('tall', t); };
  setTall(!!prefs.tall);
  launch.addEventListener('click', () => setOpen(!isOpen));
  sheet.querySelector('.x-btn').addEventListener('click', () => setOpen(false));
  sheet.querySelector('.dv-size').addEventListener('click', () => setTall(!prefs.tall));

  // ---- live refresh
  let queued = false;
  const kick = () => {
    refreshLauncher();
    if (!isOpen || queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; syncAll(); refreshHeader(); });
  };
  LIVE_EVENTS.forEach((e) => events.on(e, kick));
  events.on('shop:changed', () => { if (isOpen) render(); });
  setInterval(() => { if (isOpen && !document.hidden) { syncAll(); refreshHeader(); } }, 500);
  onTuning(kick);
  V.onView(kick);
  onRebuild((pending) => { busy.classList.toggle('on', pending); if (!pending && isOpen) render(); });

  // ---- keyboard: shortcuts, and typing in the sheet never reaches the game (WASD moves the player)
  const typing = (e) => e.target.closest?.('input, textarea, select, [contenteditable]');
  for (const ev of ['keydown', 'keyup']) sheet.addEventListener(ev, (e) => { if (typing(e)) e.stopPropagation(); });
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
    const g = window.__game;
    if (e.key === '`') { setOpen(!isOpen); e.preventDefault(); }
    else if (e.key === 'h' || e.key === 'H') V.toggleClean();
    else if (e.key === 'p' || e.key === 'P') V.setSimPaused(!V.isPaused());
    else if ((e.key === ']' || e.key === '[') && g) {
      const steps = [1, 2, 4, 8], i = steps.indexOf(g.timeScale);
      g.timeScale = steps[Math.max(0, Math.min(steps.length - 1, (i < 0 ? 0 : i) + (e.key === ']' ? 1 : -1)))];
      flash(`Game speed ${g.timeScale}x`);
      kick();
    }
  });

  if (prefs.meter) V.setMeter(true);
  refreshLauncher();
  return { open: () => setOpen(true), close: () => setOpen(false), flash, get isOpen() { return isOpen; } };
}
