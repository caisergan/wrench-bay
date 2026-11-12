import { scene, start, onUpdate } from './core/engine.js';
import { load } from './core/state.js';
import { buildEnvironment } from './models/index.js';
import { initUI } from './ui/index.js';

const params = new URLSearchParams(location.search);
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
