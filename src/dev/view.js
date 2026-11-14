// Dev tool: what is on screen. Clean screen (no HUD) per layer, camera zoom, the perf meter and a PNG of the 3D view.
// Layer switches are classes on #game-root (the joystick lives there, outside #ui); dev.css does the hiding.
import * as THREE from 'three';
import { renderer, scene, camera, sun, setCameraZoom, setPaused, paused } from '../core/engine.js';
import { perfStats } from '../core/perf.js';
import { heat } from './thermal.js';

export const LAYERS = [
  { id: 'hud', icon: 'gauge', label: 'HUD', sub: 'Cash, gems, garage card, side buttons, streak, hints, chips' },
  { id: 'labels', icon: 'tag', label: 'World labels', sub: 'Job bubbles, price tags, station counts, emotes' },
  { id: 'guide', icon: 'flag', label: 'Pointers & banners', sub: 'Edge-of-screen arrows, event banners' },
  { id: 'floats', icon: 'cash', label: 'Toasts & float texts', sub: '"+$24", "New lift!" and the like' },
  { id: 'dock', icon: 'lock', label: 'Pay dock', sub: 'Building details while you stand on a pad' },
  { id: 'joy', icon: 'play', label: 'Joystick ring', sub: 'The floating stick under your thumb' },
];

const root = document.getElementById('game-root');
const hidden = new Set();
const listeners = new Set();
export function onView(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const notify = () => listeners.forEach((fn) => fn());

export const isHidden = (id) => hidden.has(id);
export function setHidden(id, on) {
  if (on) hidden.add(id); else hidden.delete(id);
  root.classList.toggle('dv-no-' + id, on);
  notify();
}
/** Clean screen = every layer hidden. */
export const isClean = () => LAYERS.every((l) => hidden.has(l.id));
export function setClean(on) { for (const l of LAYERS) setHidden(l.id, on); }
export const toggleClean = () => setClean(hidden.size === 0);

// ---------------------------------------------------------------- camera zoom (fog and far plane follow it)
const FOG = { near: scene.fog.near, far: scene.fog.far, cam: camera.far };
let zoom = 1;
export const getZoom = () => zoom;
export function setZoom(k) {
  zoom = Math.max(0.5, Math.min(3, Math.round(k * 100) / 100));
  setCameraZoom(zoom);
  const f = Math.max(1, zoom);
  scene.fog.near = FOG.near * f; scene.fog.far = FOG.far * f;
  camera.far = FOG.cam * f;
  camera.updateProjectionMatrix();
  notify();
}

// ---------------------------------------------------------------- simulation pause (does not open the pause menu)
export const isPaused = () => paused;
export function setSimPaused(on) { setPaused(!!on); notify(); }

// ---------------------------------------------------------------- perf meter
let meter = null, raf = 0;
export const meterOn = () => !!meter;
export function setMeter(on) {
  if (on === !!meter) return;
  if (!on) { cancelAnimationFrame(raf); meter.remove(); meter = null; notify(); return; }
  meter = document.createElement('div');
  meter.className = 'dv-meter';
  document.getElementById('ui').appendChild(meter);
  // counts frames the engine actually drew (the dev Perf tab can cap the loop), not animation frames
  let drawn = perfStats.drawn, shadows = perfStats.shadowDraws, last = performance.now();
  perfStats.maxGap = 0;
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (now - last < 500) return;
    const sec = (now - last) / 1000;
    const fps = (perfStats.drawn - drawn) / sec, shadowFps = (perfStats.shadowDraws - shadows) / sec;
    const worst = perfStats.maxGap;
    const r = renderer.info.render, m = renderer.info.memory;
    const g = window.__game;
    const cars = g ? g.world.allCars.filter((c) => c.mode !== 'gone').length : 0;
    const heap = performance.memory ? ` · ${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : '';
    const b = renderer.getDrawingBufferSize(_buf);
    const shadow = sun.castShadow ? `shadow ${sun.shadow.mapSize.x} · ${Math.round(shadowFps)}/s` : 'no shadows';
    const hot = heat.supported && heat.thermal ? `<br><i class="th-${heat.thermal}">${heat.thermal}</i>${heat.charging ? ' · charging' : ''}` : '';
    meter.innerHTML = `<b class="${fps < 30 ? 'bad' : fps < 50 ? 'meh' : ''}">${Math.round(fps)} fps</b> <span>worst ${Math.round(worst)} ms · cpu ${perfStats.cpuMs.toFixed(1)} ms</span>`
      + `<br>${r.calls} calls · ${fmtK(r.triangles)} tris<br>${perfStats.pixelRatio.toFixed(2)}x ${b.x}×${b.y} · ${shadow}`
      + `<br>${m.geometries} geo · ${m.textures} tex · ${cars} cars${heap}${hot}`;
    drawn = perfStats.drawn; shadows = perfStats.shadowDraws; last = now; perfStats.maxGap = 0;
  };
  raf = requestAnimationFrame(tick);
  notify();
}
const _buf = new THREE.Vector2();
const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n));

// ---------------------------------------------------------------- snapshot
/** Downloads a PNG of the 3D view (no DOM: HUD and labels are never in it). */
export function snapshot() {
  renderer.render(scene, camera);   // the drawing buffer is only valid right after a render
  const url = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `wrench-bay-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
