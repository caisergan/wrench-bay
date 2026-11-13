// Floating virtual joystick (touch + mouse) plus WASD/arrow keys.
// input.vector -> { x, z, mag } in world space (x = right, z = towards camera), mag 0..1.
import { root } from './engine.js';

const RADIUS = 52; // px the knob can travel
const base = document.createElement('div');
base.className = 'joy-base';
const knob = document.createElement('div');
knob.className = 'joy-knob';
base.appendChild(knob);
root.appendChild(base);

let active = false, pointerId = null, ox = 0, oy = 0, jx = 0, jy = 0;
const keys = new Set();
let enabled = true;

function rel(e) { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

root.addEventListener('pointerdown', (e) => {
  if (!enabled || active) return;
  // ignore presses on UI buttons/panels
  if (e.target.closest('[data-ui]')) return;
  active = true; pointerId = e.pointerId;
  [ox, oy] = rel(e); jx = jy = 0;
  base.style.left = ox + 'px'; base.style.top = oy + 'px';
  knob.style.transform = 'translate(-50%, -50%)';
  base.classList.add('active');
});
window.addEventListener('pointermove', (e) => {
  if (!active || e.pointerId !== pointerId) return;
  const [x, y] = rel(e);
  let dx = x - ox, dy = y - oy;
  const d = Math.hypot(dx, dy);
  if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
  jx = dx / RADIUS; jy = dy / RADIUS;
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
});
function end(e) {
  if (!active || (e && e.pointerId !== pointerId)) return;
  active = false; jx = jy = 0; base.classList.remove('active');
}
window.addEventListener('pointerup', end);
window.addEventListener('pointercancel', end);

window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); end(); });

export const input = {
  get vector() {
    if (!enabled) return { x: 0, z: 0, mag: 0 };   // title / pause / modal up: keys do not walk the player either
    let x = jx, z = jy;
    const kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const kz = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    if (kx || kz) { const l = Math.hypot(kx, kz); x = kx / l; z = kz / l; }
    let mag = Math.min(1, Math.hypot(x, z));
    if (mag < 0.12) return { x: 0, z: 0, mag: 0 };
    const l = Math.hypot(x, z);
    return { x: x / l, z: z / l, mag };
  },
  setEnabled(v) { enabled = v; if (!v) end(); },
};
