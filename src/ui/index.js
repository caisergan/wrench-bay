// UI entry: HUD, labels, panels, title screen, audio. See CONTRACTS.md "UI API".
import { events } from '../core/events.js';
import { state } from '../core/state.js';
import { label, floatText, seeThrough } from './labels.js';
import { pointer, hint, banner, chip } from './guidance.js';
import { toast } from './toast.js';
import { payDock } from './paydock.js';
import { sfx, unlockAudio } from './audio.js';
import { buildHud } from './hud.js';
import { buildPanels } from './panels.js';
import { buildTitle } from './title.js';
import { fmt } from './format.js';
import { flags } from './uistate.js';
import { closeOpenModal } from './modal.js';
import { canChooseView, viewForced } from '../core/view.js';

let panels = null;

export const ui = {
  label,
  toast,
  floatText,
  /** Bubbles over cars / stations fade while they cover this Object3D (the player's character); null = off. */
  seeThrough,
  pointer,
  hint,
  banner,
  chip,
  sfx,
  fmt,
  /** Building pads: details at the bottom of the screen while the player stands on a pay pad (paydock.js). */
  payDock,
  openUpgrades() { panels && panels.openUpgrades(); },
  closeUpgrades() { panels && panels.closeUpgrades(); },
  showShopComplete(onNext) { panels && panels.showComplete(onNext); },
  // ---- Harbor Town ----
  openProGear() { panels && panels.openProGear(); },
  closeProGear() { panels && panels.closeProGear(); },
  openAcademy() { panels && panels.openAcademy(); },
  closeAcademy() { panels && panels.closeAcademy(); },
  openFame() { panels && panels.openFame(); },
  openMap() { panels && panels.openMap(); },
  /** Garage complete celebration (nothing resets; the town goes on). */
  showGarageComplete() { panels && panels.showGarageComplete(); },
  /** Ferry confirm modal; "Set sail!" calls onSail (core: nextShop) and emits ui:sail. */
  showFerry(onSail) { panels && panels.showFerry(onSail); },
  levelUp(level, unlocks) { panels && panels.levelUp(level, unlocks); },
  perfect(total) { panels && panels.perfect(total); },
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
    openFame: () => panels.openFame(),
    openMap: () => panels.openMap(),
  };
  const hud = buildHud(root, api);
  panels = buildPanels(root, hud);

  // In a browser the title also greets returning players, to pick Mobile or Browser view (core/view.js);
  // ?view=... or ?autoplay skip it. The iOS app is always the phone view.
  const params = new URLSearchParams(location.search);
  const askView = canChooseView && !viewForced && !params.has('autoplay');
  if (state.tutorialDone && !askView) {
    // returning player: skip the title. Deferred so gameplay (initialised right after us) can subscribe.
    setTimeout(() => events.emit('ui:play'), 0);
  } else {
    buildTitle(root, hud, { returning: state.tutorialDone });
  }

  // Esc: close the open panel, or pause (and Esc again resumes).
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat || flags.title) return;
    if (closeOpenModal()) return;
    if (!flags.complete && !flags.welcome) api.openPause();
  });

  if (new URLSearchParams(location.search).has('uitest')) {
    import('./devtest.js').then((m) => m.run(ui));
  }
  events.emit('ui:ready');
}
