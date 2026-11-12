// UI entry: HUD, labels, panels, title screen, audio. See CONTRACTS.md "UI API".
import { events } from '../core/events.js';
import { state } from '../core/state.js';
import { label, floatText } from './labels.js';
import { toast } from './toast.js';
import { sfx, unlockAudio } from './audio.js';
import { buildHud } from './hud.js';
import { buildPanels } from './panels.js';
import { buildTitle } from './title.js';
import { fmt } from './format.js';

let panels = null;

export const ui = {
  label,
  toast,
  floatText,
  sfx,
  fmt,
  openUpgrades() { panels && panels.openUpgrades(); },
  closeUpgrades() { panels && panels.closeUpgrades(); },
  showShopComplete(onNext) { panels && panels.showComplete(onNext); },
  /** Welcome-back modal. No argument: real pendingOffline(). With { amount, seconds }: a preview (dev). */
  showWelcomeBack(info) { return panels ? panels.showWelcome(info) : false; },
};

export function initUI() {
  const root = document.getElementById('ui');

  // audio unlock on first interaction
  const unlock = () => unlockAudio();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  // enables :active styles on iOS
  document.addEventListener('touchstart', () => {}, { passive: true });
  // button click sound
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button');
    if (b && !b.disabled && !b.dataset.nosfx && !b.classList.contains('play') && !b.dataset.boost) sfx('click');
  });

  const api = {
    openPause: () => panels.openPause(),
    openMissions: () => panels.openMissions(),
    openShop: () => panels.openShop(),
  };
  const hud = buildHud(root, api);
  panels = buildPanels(root, hud);

  if (state.tutorialDone) {
    // returning player: skip the title. Deferred so gameplay (initialised right after us) can subscribe.
    setTimeout(() => events.emit('ui:play'), 0);
  } else {
    buildTitle(root, hud);
  }

  if (new URLSearchParams(location.search).has('uitest')) {
    import('./devtest.js').then((m) => m.run(ui));
  }
  events.emit('ui:ready');
}
