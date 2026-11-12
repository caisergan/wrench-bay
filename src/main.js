// Fredoka (latin subset) is bundled rather than loaded from Google Fonts, so the iOS app looks right offline.
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import { scene, start, onUpdate } from './core/engine.js';
import { load, save, refreshOffline } from './core/state.js';
import { events } from './core/events.js';
import { initPlatform, onLifecycle, hideSplash } from './core/platform.js';
import { suspendAudio, resumeAudio } from './ui/audio.js';
import { buildEnvironment } from './models/index.js';
import { initUI } from './ui/index.js';

const params = new URLSearchParams(location.search);
await initPlatform();   // iOS app: restores saves from native storage. No-op in the browser.
load();
// Static world (owned by the environment agent). Built here so it shows even if gameplay fails to boot.
const env = buildEnvironment(scene);
onUpdate((dt, t) => env.update(dt, t));
initUI();       // HUD, labels, panels, title screen, audio
// ?nogame boots only the environment + UI (useful while working on those in isolation).
if (!params.has('nogame')) {
  try {
    const { initGame } = await import('./game/index.js');
    initGame();   // dynamic world + gameplay systems
  } catch (err) {
    console.error('[wrench-bay] initGame failed', err);
  }
}
start();
requestAnimationFrame(() => requestAnimationFrame(hideSplash));

// Leaving the game (iOS app to the background, browser tab hidden or closed): save now and pause the sound.
// Coming back: resume the sound and offer offline earnings if the crew was running the shop meanwhile.
onLifecycle({
  hidden() { save(); suspendAudio(); },
  visible() { resumeAudio(); if (refreshOffline()) events.emit('app:resume'); },
});
