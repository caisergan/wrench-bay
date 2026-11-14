// Renderer, scene, lights, follow camera and the main loop.
import * as THREE from 'three';
import { LAYOUT } from '../config.js';
import { isBrowserView, onViewMode } from './view.js';
import { perf, perfStats } from './perf.js';

export const root = document.getElementById('game-root');   // phone-shaped container (fills the window in the browser view)
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8cb);
scene.fog = new THREE.Fog(0x9fd8cb, 45, 90);

export const renderer = new THREE.WebGLRenderer({ antialias: perf.antialias });   // dev Perf tab can turn it off (reload)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.localClippingEnabled = true;   // per-material clipping planes (the player's suit-up wipe)
renderer.shadowMap.type = THREE.PCFShadowMap;   // three r18x dropped PCFSoftShadowMap (it fell back to this anyway)
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
sun.castShadow = perf.shadows;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
// Sun direction (from the ground towards the sun). The phone frame uses a fixed 40 x 40 m shadow box around the
// camera target; the browser view sees far more ground, so fitShadow() sizes the box to what is on screen.
const SUN_OFFSET = new THREE.Vector3(-8, 18, 10);
const SUN_DIR = SUN_OFFSET.clone().normalize();
const PHONE_SHADOW = { size: 2048, left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 };
const shadowCentre = new THREE.Vector2();   // shadow box centre, relative to camTarget (browser view)
// Light-space axes of the sun's shadow camera (three.js aims it from the sun at its target, up = +y).
const SUN_X = new THREE.Vector3(), SUN_Y = new THREE.Vector3();
new THREE.Matrix4().lookAt(SUN_DIR, new THREE.Vector3(), THREE.Object3D.DEFAULT_UP).extractBasis(SUN_X, SUN_Y, new THREE.Vector3());
const _sp = new THREE.Vector3();
/**
 * Aim the sun at ground point (x, z) from `dist` away, moving the shadow box in whole shadow-map texels only. A box
 * that follows the camera by fractions of a texel re-rasterises every shadow edge each frame, so all the shadows
 * crawl and flicker while the player walks; whole-texel steps keep every edge on the same texels.
 */
function placeSun(x, z, dist) {
  const sc = sun.shadow.camera, ms = sun.shadow.mapSize;
  const ux = (sc.right - sc.left) / ms.x, uy = (sc.top - sc.bottom) / ms.y;
  _sp.set(x, 0, z);
  const a = Math.round(_sp.dot(SUN_X) / ux) * ux, b = Math.round(_sp.dot(SUN_Y) / uy) * uy, c = _sp.dot(SUN_DIR);
  sun.target.position.set(0, 0, 0).addScaledVector(SUN_X, a).addScaledVector(SUN_Y, b).addScaledVector(SUN_DIR, c);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, dist);
}

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
/** Look ahead of the followed object by (x, z) world units (e.g. ahead of a vehicle's velocity, or south of the
 *  player so they stay above an open bottom sheet). Eased; applies in the town and on the lot alike. */
export function setCameraLead(x = 0, z = 0) { leadGoal.set(x, z); }
// Focus: look at a fixed ground point instead of the followed object (the upgrade board's "look what you bought").
let focus = null;
/** p = { x, z }: glide to that ground point and stay there; null: glide back to the followed object. */
export function setCameraFocus(p) { focus = p ? { x: p.x, z: p.z } : null; }
/** Pull the camera back (k > 1) or in. Eased; 1 = default framing. */
export function setCameraZoom(k = 1) { zoomGoal = k; }
/**
 * How far from camTarget the screen reaches on the ground (units): x = to each side, back = away from the camera
 * (north, -z), front = towards it. ctx.near() reads it to skip work off screen. Updated on resize / view switch.
 */
export const viewReach = { x: 12, back: 22, front: 11 };
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
    const fx = focus ? focus.x : followObj.position.x, fz = focus ? focus.z : followObj.position.z;
    const lx = focus ? 0 : lead.x, lz = focus ? 0 : lead.y;
    if (townClamp) {
      tx = THREE.MathUtils.clamp(fx + lx, townClamp.minX, townClamp.maxX);
      tz = THREE.MathUtils.clamp(fz + lz, townClamp.minZ, townClamp.maxZ);
    } else {
      tx = THREE.MathUtils.clamp(fx * 0.85 + lx, CAM_CLAMP.minX, CAM_CLAMP.maxX);
      tz = THREE.MathUtils.clamp(fz + lz, CAM_CLAMP.minZ, CAM_CLAMP.maxZ);
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * (focus ? 3.4 : 5));
    camTarget.x += (tx - camTarget.x) * k;
    camTarget.z += (tz - camTarget.z) * k;
  }
  camera.position.copy(camTarget).add(_off.copy(CAMERA_OFFSET).multiplyScalar(zoom));
  camera.lookAt(camTarget.x, 0, camTarget.z - 1.2);
  // keep the shadow frustum centred on what we see
  if (isBrowserView()) {
    // Re-fit the box once per zoom change, not all through the ease: every re-fit changes the texel size and so moves
    // each shadow edge once. Pulling out (driving) fits the wider framing straight away; pushing back in waits until
    // the camera has settled.
    const fitK = zoomGoal > shadowZoom + 1e-3 || Math.abs(zoom - zoomGoal) < 0.01 ? zoomGoal : shadowZoom;
    if (Math.abs(fitK - shadowZoom) > 1e-3) fitShadow(fitK);
    placeSun(camTarget.x + shadowCentre.x, camTarget.z + shadowCentre.y, SUN_DIST);
  } else {
    placeSun(camTarget.x, camTarget.z, PHONE_SUN_DIST);
  }
}

// ---- browser view: what the camera sees on the ground, and a shadow box that covers it ----
const SUN_DIST = 70;          // sun distance from the shadow box centre (room for tall casters towards the sun)
const PHONE_SUN_DIST = SUN_OFFSET.length();   // phone frame: the sun sits at SUN_OFFSET from the camera target
const SEE_FAR = 92;           // fog is solid past ~90 m: ground further than this from the camera never shows
const ROOF = 9;               // receivers up to roof height also need shadows
const probe = new THREE.PerspectiveCamera();
const _p = new THREE.Vector3(), _dir = new THREE.Vector3();
let shadowZoom = -1;
/** Ground (y = h) points under the four screen corners for a camera at zoom k on target (0, 0, 0). */
function screenCorners(k, h, out) {
  probe.copy(camera);
  probe.position.copy(CAMERA_OFFSET).multiplyScalar(k);
  probe.lookAt(0, 0, -1.2);
  probe.updateMatrixWorld();
  for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    _dir.set(nx, ny, 0.5).unproject(probe).sub(probe.position).normalize();
    // distance along the ray to the plane y = h, capped where the fog has swallowed everything
    const t = _dir.y < -1e-4 ? Math.min((h - probe.position.y) / _dir.y, SEE_FAR) : SEE_FAR;
    _p.copy(probe.position).addScaledVector(_dir, t);
    out.push(_p.x, h, _p.z);
  }
  return out;
}
/** Size the sun's shadow box to the ground (and roofs) on screen at camera zoom k. Browser view only. */
function fitShadow(k) {
  shadowZoom = k;
  const pts = [];
  screenCorners(k, 0, pts);
  screenCorners(k, ROOF, pts);
  // box centre: middle of the ground footprint
  let cx = 0, cz = 0;
  for (let i = 0; i < 12; i += 3) { cx += pts[i] / 4; cz += pts[i + 2] / 4; }
  shadowCentre.set(cx, cz);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minD = Infinity, maxD = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    _p.set(pts[i] - cx, pts[i + 1], pts[i + 2] - cz);
    const x = _p.dot(SUN_X), y = _p.dot(SUN_Y), d = SUN_DIST - _p.dot(SUN_DIR);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minD = Math.min(minD, d); maxD = Math.max(maxD, d);
  }
  const M = 2, sc = sun.shadow.camera;
  sc.left = minX - M; sc.right = maxX + M; sc.bottom = minY - M; sc.top = maxY + M;
  sc.near = Math.max(0.5, minD - 40); sc.far = maxD + 5;
  sc.updateProjectionMatrix();
}
function setShadowSize(size) {
  if (sun.shadow.mapSize.x === size) return;
  sun.shadow.mapSize.set(size, size);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
}
/** Phone frame: the original fixed shadow box. Browser view: fitted to the screen, on a bigger map. */
function applyViewShadow() {
  const sc = sun.shadow.camera;
  const maxTex = renderer.capabilities.maxTextureSize || 4096;
  if (isBrowserView()) {
    setShadowSize(Math.min(perf.shadowSize || 4096, maxTex));   // perf.shadowSize: dev Perf tab
    fitShadow(Math.max(zoom, zoomGoal));
    // how far the screen reaches on the ground (driving zooms out to 1.15: measure there, plus a margin)
    const pts = screenCorners(1.15, 0, []);
    let x = 0, back = 0, front = 0;
    for (let i = 0; i < pts.length; i += 3) { x = Math.max(x, Math.abs(pts[i])); back = Math.max(back, -pts[i + 2]); front = Math.max(front, pts[i + 2]); }
    Object.assign(viewReach, { x: Math.ceil(x + 2), back: Math.ceil(back + 2), front: Math.ceil(front + 2) });
  } else {
    const P = PHONE_SHADOW;
    setShadowSize(Math.min(perf.shadowSize || P.size, maxTex));
    Object.assign(sc, { left: P.left, right: P.right, top: P.top, bottom: P.bottom, near: P.near, far: P.far });
    sc.updateProjectionMatrix();
    shadowZoom = -1;
    Object.assign(viewReach, { x: 12, back: 22, front: 11 });
  }
}

/**
 * Size of #game-root in CSS pixels, kept up to date by resize(). Per-frame code reads this instead of
 * root.clientWidth: that read forces a full style + layout pass whenever a label moved earlier in the frame.
 */
export const viewSize = { w: 1, h: 1 };

// ---- resize: phone frame = keep a portrait phone aspect on desktop; browser view = fill the window ----
// The browser view draws up to this many device pixels (a 4K-ish budget), so a big retina window stays smooth.
const BROWSER_MAX_PIXELS = 4.2e6;
let maxRatio = 1;   // pixel ratio before dynamic resolution
let dynScale = 0;   // dynamic resolution's pixel ratio (0 = not started)
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const wide = isBrowserView();
  let w = vw, h = vh;
  const maxAspect = 0.62; // width / height
  if (!wide && w / h > maxAspect) w = Math.round(h * maxAspect);
  root.style.width = w + 'px';
  root.style.height = h + 'px';
  viewSize.w = w; viewSize.h = h;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let ratio = wide ? Math.max(1, Math.min(dpr, Math.sqrt(BROWSER_MAX_PIXELS / (w * h)))) : dpr;
  if (perf.pixelRatio) ratio = Math.min(perf.pixelRatio, window.devicePixelRatio || 1);   // dev Perf tab
  maxRatio = ratio;
  if (perf.dynRes && dynScale) ratio = Math.min(ratio, dynScale);
  perfStats.pixelRatio = ratio;
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // widen FOV a bit on very tall phones so the lot width still fits
  camera.fov = w / h < 0.5 ? 47 : 44;
  camera.updateProjectionMatrix();
  applyViewShadow();
}
window.addEventListener('resize', resize);
onViewMode(() => { resize(); updateCamera(0, true); });
resize();

// ---- loop ----
const updaters = [];
/** Register fn(dt, time) to run every frame. Returns an unsubscribe function. */
export function onUpdate(fn) { updaters.push(fn); return () => { const i = updaters.indexOf(fn); if (i >= 0) updaters.splice(i, 1); }; }
export let paused = false;
export function setPaused(p) { paused = p; }

const clock = new THREE.Clock();
let elapsed = 0;
// Dev Perf tab state (all idle at the defaults: every animation frame is drawn, as before).
let lastDraw = 0, stillFor = 0, shadowTick = 0, dynT = 0, dynEma = 0, dynGood = 0;
const lastCam = new THREE.Vector3(), lastFollow = new THREE.Vector3();
const DYN = { min: 1, step: 0.125, slow: 1.15, fast: 1.04 };
/** Frames a second this frame aims for (0 = every animation frame). */
function targetFps() {
  let fps = perf.fpsCap || Infinity;
  if (paused && perf.menuFps) fps = Math.min(fps, perf.menuFps);
  perfStats.idle = !paused && perf.idle30 && stillFor > 0.5 && fps > 30;
  if (perfStats.idle) fps = 30;
  return fps === Infinity ? 0 : fps;
}
function frame(now = performance.now()) {
  requestAnimationFrame(frame);
  const fps = targetFps();
  // a capped loop skips animation frames; 2 ms of slack absorbs the jitter of the screen's refresh
  if (fps && lastDraw && now - lastDraw < 1000 / fps - 2) return;
  const gap = lastDraw ? now - lastDraw : 0;
  lastDraw = now;
  const t0 = performance.now();
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!paused && dt > 0) {
    elapsed += dt;
    for (const fn of updaters) fn(dt, elapsed);
  }
  updateCamera(dt);
  if (perf.shadowEvery > 1) {
    renderer.shadowMap.autoUpdate = false;
    if (++shadowTick >= perf.shadowEvery) { shadowTick = 0; renderer.shadowMap.needsUpdate = true; }
  } else renderer.shadowMap.autoUpdate = true;
  if (sun.castShadow && (renderer.shadowMap.autoUpdate || renderer.shadowMap.needsUpdate)) perfStats.shadowDraws++;
  renderer.render(scene, camera);
  perfStats.cpuMs += (performance.now() - t0 - perfStats.cpuMs) * 0.1;
  perfStats.drawn++;
  perfStats.maxGap = Math.max(perfStats.maxGap, gap);
  if (perf.idle30) trackStill(dt);
  if (perf.dynRes && gap) dynamicResolution(gap, fps || 60, dt);
}
/** Idle 30 fps: how long neither the camera nor the followed object has moved. */
function trackStill(dt) {
  const moved = camera.position.distanceToSquared(lastCam) > 1e-6 || (followObj && followObj.position.distanceToSquared(lastFollow) > 1e-6);
  stillFor = moved ? 0 : stillFor + dt;
  lastCam.copy(camera.position);
  if (followObj) lastFollow.copy(followObj.position);
}
/** Dynamic resolution: step the pixel ratio down while drawn frames come late, back up once they keep up. */
function dynamicResolution(gap, fps, dt) {
  const want = 1000 / fps;
  dynEma = dynEma ? dynEma + (gap - dynEma) * 0.1 : gap;
  dynT += dt;
  if (dynT < 1) return;
  dynT = 0;
  const cur = dynScale || maxRatio;
  let next = cur;
  if (dynEma > want * DYN.slow) { next = Math.max(DYN.min, cur - DYN.step); dynGood = 0; }
  else if (dynEma < want * DYN.fast) { if (++dynGood >= 3) { next = Math.min(maxRatio, cur + DYN.step); dynGood = 0; } }
  else dynGood = 0;
  if (next !== cur) { dynScale = next; resize(); }
  perfStats.dynScale = dynScale;
}
/** Re-apply the dev Perf tab's switches (pixel ratio, shadows). Antialiasing needs a reload. */
export function applyPerf() {
  if (!perf.dynRes) { dynScale = 0; perfStats.dynScale = 0; }
  if (sun.castShadow !== perf.shadows) sun.castShadow = perf.shadows;   // three recompiles the lit materials
  stillFor = 0;
  resize();
  updateCamera(0);
  renderer.shadowMap.needsUpdate = true;   // a resized map is empty until its next redraw
}
export function start() { updateCamera(0, true); frame(); }

// Project a world position to CSS pixels relative to #game-root. Returns {x, y, visible}.
const _v = new THREE.Vector3();
/**
 * Camera lead (world z, south positive) that puts the followed ground point at fraction fy of the screen height
 * (0 = top, 1 = bottom) once the camera has settled at the zoom it is easing to. The upgrade board uses it to keep the
 * player above its sheet.
 */
export function leadForScreenY(fy) {
  probe.copy(camera);
  probe.position.copy(CAMERA_OFFSET).multiplyScalar(zoomGoal);
  probe.lookAt(0, 0, -1.2);
  probe.updateMatrixWorld();
  const want = 1 - 2 * fy;
  let lo = -12, hi = 24;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    _p.set(0, 0, -mid).project(probe);
    if (_p.y > want) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export function worldToScreen(pos) {
  _v.copy(pos).project(camera);
  const w = viewSize.w, h = viewSize.h;
  return { x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h, visible: _v.z < 1 };
}
