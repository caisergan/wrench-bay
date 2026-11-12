// Renderer, scene, lights, follow camera and the main loop.
import * as THREE from 'three';
import { LAYOUT } from '../config.js';

export const root = document.getElementById('game-root');   // phone-shaped container
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8cb);
scene.fog = new THREE.Fog(0x9fd8cb, 45, 90);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
root.prepend(renderer.domElement);
renderer.domElement.id = 'game-canvas';

export const camera = new THREE.PerspectiveCamera(44, 9 / 16, 0.5, 140);
// Camera looks down at the target from this offset (high, tilted, slightly steep – portrait mobile framing).
export const CAMERA_OFFSET = new THREE.Vector3(0, 29, 17.3);

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0xb9a88f, 1.4);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
sun.position.set(-8, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// ---- follow camera ----
let followObj = null;
/** Current camera target on the ground (read-only for callers; ctx.near uses it). */
export const camTarget = new THREE.Vector3(0, 0, 0);
/** Camera follows this Object3D (the player, or the car being driven). */
export function follow(obj) { followObj = obj; }
// Clamp how far the camera can roam so we never look too far outside the lot.
const CAM_CLAMP = { minX: -2.6, maxX: 2.6, minZ: LAYOUT.bounds.minZ + 6.5, maxZ: LAYOUT.bounds.maxZ - 1.2 };
// Town mode (setCameraBounds(rect)): follows 1:1 inside rect. null = the legacy lot framing above.
let townClamp = null;
const lead = new THREE.Vector2(), leadGoal = new THREE.Vector2();
let zoom = 1, zoomGoal = 1;
/** rect {minX,maxX,minZ,maxZ}: follow the target 1:1 inside it (the open town). null: legacy lot clamp. */
export function setCameraBounds(rect) { townClamp = rect ? { ...rect } : null; }
/** Look ahead of the followed object by (x, z) world units (e.g. ahead of a vehicle's velocity). Eased. */
export function setCameraLead(x = 0, z = 0) { leadGoal.set(x, z); }
/** Pull the camera back (k > 1) or in. Eased; 1 = default framing. */
export function setCameraZoom(k = 1) { zoomGoal = k; }
// Debug: ?cam=x,z pins the camera target (no follow). Handy for looking at the environment.
const camParam = new URLSearchParams(location.search).get('cam');
const camPinned = camParam ? camParam.split(',').map(Number) : null;
if (camPinned) camTarget.set(camPinned[0] || 0, 0, camPinned[1] || 0);

const _off = new THREE.Vector3();
function updateCamera(dt, snap = false) {
  const kl = snap ? 1 : 1 - Math.exp(-dt * 2.2);
  lead.lerp(leadGoal, kl);
  zoom += (zoomGoal - zoom) * kl;
  if (followObj && !camPinned) {
    let tx, tz;
    if (townClamp) {
      tx = THREE.MathUtils.clamp(followObj.position.x + lead.x, townClamp.minX, townClamp.maxX);
      tz = THREE.MathUtils.clamp(followObj.position.z + lead.y, townClamp.minZ, townClamp.maxZ);
    } else {
      tx = THREE.MathUtils.clamp(followObj.position.x * 0.85, CAM_CLAMP.minX, CAM_CLAMP.maxX);
      tz = THREE.MathUtils.clamp(followObj.position.z, CAM_CLAMP.minZ, CAM_CLAMP.maxZ);
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    camTarget.x += (tx - camTarget.x) * k;
    camTarget.z += (tz - camTarget.z) * k;
  }
  camera.position.copy(camTarget).add(_off.copy(CAMERA_OFFSET).multiplyScalar(zoom));
  camera.lookAt(camTarget.x, 0, camTarget.z - 1.2);
  // keep the shadow frustum centred on what we see
  sun.position.set(camTarget.x - 8, 18, camTarget.z + 10);
  sun.target.position.set(camTarget.x, 0, camTarget.z);
}

// ---- resize: keep a portrait phone aspect on desktop ----
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const maxAspect = 0.62; // width / height
  let w = vw, h = vh;
  if (w / h > maxAspect) w = Math.round(h * maxAspect);
  root.style.width = w + 'px';
  root.style.height = h + 'px';
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // widen FOV a bit on very tall phones so the lot width still fits
  camera.fov = w / h < 0.5 ? 47 : 44;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- loop ----
const updaters = [];
/** Register fn(dt, time) to run every frame. Returns an unsubscribe function. */
export function onUpdate(fn) { updaters.push(fn); return () => { const i = updaters.indexOf(fn); if (i >= 0) updaters.splice(i, 1); }; }
export let paused = false;
export function setPaused(p) { paused = p; }

const clock = new THREE.Clock();
let elapsed = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!paused && dt > 0) {
    elapsed += dt;
    for (const fn of updaters) fn(dt, elapsed);
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}
export function start() { updateCamera(0, true); frame(); }

// Project a world position to CSS pixels relative to #game-root. Returns {x, y, visible}.
const _v = new THREE.Vector3();
export function worldToScreen(pos) {
  _v.copy(pos).project(camera);
  const w = root.clientWidth, h = root.clientHeight;
  return { x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h, visible: _v.z < 1 };
}
