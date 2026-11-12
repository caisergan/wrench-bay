// Tiny tween helper. Driven by updateTweens(dt) (called from the game's onUpdate). No external libs.
import * as THREE from 'three';

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t, s = 1.70158) => { const c = t - 1; return 1 + (s + 1) * c * c * c + s * c * c; },
};

let active = [];

/** Generic tween. onUpdate(easedK, rawK). Returns a handle with cancel(). */
export function tween({ duration = 0.3, delay = 0, ease: e = ease.outQuad, onUpdate, onComplete }) {
  const tw = { t: -delay, duration: Math.max(1e-4, duration), ease: e, onUpdate, onComplete, done: false, cancel() { this.done = true; } };
  active.push(tw);
  return tw;
}

export function updateTweens(dt) {
  const n = active.length;
  for (let i = 0; i < n; i++) {
    const tw = active[i];
    if (tw.done) continue;
    tw.t += dt;
    if (tw.t < 0) continue;
    const k = Math.min(1, tw.t / tw.duration);
    if (tw.onUpdate) tw.onUpdate(tw.ease(k), k);
    if (k >= 1) { tw.done = true; if (tw.onComplete) tw.onComplete(); }
  }
  let j = 0;
  for (let i = 0; i < active.length; i++) if (!active[i].done) active[j++] = active[i];
  active.length = j;
}

/** Drop every running tween WITHOUT firing completions (used when tearing the world down). */
export function clearTweens() { active = []; }

const _start = new THREE.Vector3();
const _end = new THREE.Vector3();
/**
 * Parabolic hop of obj (parented to the world root) from `from` to `to` (Vector3 or fn(out) for a moving target).
 * Optionally lerps uniform scale.
 */
export function hop(obj, from, to, { duration = 0.35, delay = 0, height = 0.8, scaleFrom, scaleTo, onComplete } = {}) {
  const start = from.clone();
  const target = new THREE.Vector3();
  const isFn = typeof to === 'function';
  return tween({
    duration, delay, ease: ease.inOutQuad,
    onUpdate(e, k) {
      if (isFn) to(target); else target.copy(to);
      obj.position.lerpVectors(start, target, e);
      obj.position.y += height * 4 * k * (1 - k);
      if (scaleFrom !== undefined && scaleTo !== undefined) obj.scale.setScalar(scaleFrom + (scaleTo - scaleFrom) * e);
    },
    onComplete,
  });
}

/** Scale 0 -> target with overshoot. */
export function popIn(obj, target = 1, duration = 0.4, delay = 0) {
  obj.scale.setScalar(0.0001);
  return tween({ duration, delay, ease: (t) => ease.outBack(t, 2.2), onUpdate: (e) => obj.scale.setScalar(Math.max(0.0001, target * e)) });
}

/** Scale current -> 0 then callback. */
export function popOut(obj, duration = 0.25, onComplete) {
  const s0 = obj.scale.x;
  return tween({ duration, ease: ease.inQuad, onUpdate: (e) => obj.scale.setScalar(Math.max(0.0001, s0 * (1 - e))), onComplete });
}
