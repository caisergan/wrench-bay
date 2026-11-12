// Guidance: edge-of-screen pointers, the hint pill, event banners and stackable status chips (TOWN.md 4.16 / 9).
//
// Pointers are how a player on a 17-unit-wide screen finds anything in a town 120 units wide, so they are built to
// stay out of the way: they sit on an inner rectangle that avoids the HUD (top card, fame / map buttons, the two side
// button columns, the hint / chip stack) and the lower part of the screen where the thumb rests, glide instead of
// jumping, never overlap each other, and vanish as soon as their target is on screen. At most 3 show at once.
import * as THREE from 'three';
import { onUpdate, worldToScreen, root } from '../core/engine.js';
import { ICON } from './icons.js';
import { html, mmss } from './format.js';

let layer = null;
const ensureLayer = () => {
  if (layer) return layer;
  layer = html('<div class="layer pointers"></div>');
  document.getElementById('ui').appendChild(layer);
  onUpdate(updatePointers);
  return layer;
};

// ------------------------------------------------------------------ pointers
const KINDS = {
  rescue: { icon: 'rescueTruck', prio: 0 },
  vehicle: { icon: 'tow', prio: 1 },
  sale: { icon: 'tag', prio: 2 },
  cash: { icon: 'coins', prio: 3 },
  alert: { icon: 'bell', prio: 4 },
  goal: { icon: 'flag', prio: 5 },
};
const MAX_SHOWN = 3;
const SIDE = 36;            // distance of a pointer chip from the left / right screen edge
const BOTTOM = 118;         // lowest y a pointer may sit at, measured from the bottom (thumb zone + safe area)
const MIN_GAP = 62;         // pointers closer than this are pushed apart along their edge

const all = [];
let seq = 0;
const zones = { t: 0, hudBottom: 118, stackBottom: 0, leftColBottom: 0, rightColBottom: 0, leftColRight: 84, rightColLeft: 0, dockTop: 0 };

function measure(W) {
  const rr = root.getBoundingClientRect();
  const q = (s) => { const e = root.querySelector(s); return e ? e.getBoundingClientRect() : null; };
  const card = q('.card'), fame = q('.fame-badge'), map = q('.map-btn'), top = q('.hud-top');
  let hb = 0;
  for (const r of [card, fame, map, top]) if (r && r.height) hb = Math.max(hb, r.bottom - rr.top);
  zones.hudBottom = hb || 118;
  const st = q('.stack');
  zones.stackBottom = st ? st.bottom - rr.top : 0;
  const lc = q('.col-left'), rc = q('.col-right');
  zones.leftColBottom = lc && lc.height ? lc.bottom - rr.top : 0;
  zones.rightColBottom = rc && rc.height ? rc.bottom - rr.top : 0;
  zones.leftColRight = lc && lc.width ? lc.right - rr.left : 84;
  zones.rightColLeft = rc && rc.width ? rc.left - rr.left : W - 84;
  // the pay dock (standing on a building pad) sits at the bottom: pointers move up above it meanwhile
  const dk = q('.paydock.in');
  zones.dockTop = dk && dk.height ? dk.top - rr.top : 0;
}

export function pointer(opts = {}) {
  ensureLayer();
  const kind = KINDS[opts.kind] ? opts.kind : 'goal';
  const el = html('<div class="pt"><div class="pt-arrow"><i></i></div><div class="pt-chip"><s></s></div><div class="pt-text"></div></div>');
  el.dataset.k = kind;
  const iconEl = el.querySelector('.pt-chip s'), textEl = el.querySelector('.pt-text');
  layer.appendChild(el);
  const P = {
    el, kind, prio: KINDS[kind].prio, seq: seq++,
    pos: new THREE.Vector3(), has: false, want: true, off: false, shown: false,
    x: 0, y: 0, tx: 0, ty: 0, sx: 0, sy: 0, edge: '', text: null, icon: null, init: false,
    setPos(v) { if (v) { P.pos.set(v.x, v.y, v.z); P.has = true; } return P; },
    setText(t) { t = t ? String(t) : ''; if (t !== P.text) { P.text = t; textEl.textContent = t; textEl.hidden = !t; } return P; },
    setIcon(name) { name = name || KINDS[kind].icon; if (name !== P.icon) { P.icon = name; iconEl.innerHTML = ICON[name] || ''; } return P; },
    setVisible(b) { P.want = !!b; return P; },
    remove() {
      const i = all.indexOf(P);
      if (i >= 0) all.splice(i, 1);
      el.remove();
    },
  };
  P.setIcon(opts.icon); P.setText(opts.text);
  if (opts.worldPos) P.setPos(opts.worldPos);
  all.push(P);
  return P;
}

const _s = { x: 0, y: 0 };
let tMeasure = 0;
function updatePointers(dt) {
  if (!all.length) return;
  const W = root.clientWidth, H = root.clientHeight;
  tMeasure -= dt;
  if (tMeasure <= 0) { tMeasure = 0.25; measure(W); }
  const hud = root.querySelector('.hud');
  const hudAway = !hud || hud.classList.contains('away');
  const L = SIDE, R = W - SIDE, B = zones.dockTop ? Math.min(H - BOTTOM, zones.dockTop - 34) : H - BOTTOM;
  const T = Math.max(zones.hudBottom + 18, zones.stackBottom + 12);
  const topX0 = Math.max(zones.leftColRight, 0) + 30, topX1 = Math.min(zones.rightColLeft, W) - 30;
  const cx = W / 2, cy = H * 0.5;

  const cands = [];
  for (const P of all) {
    if (!P.want || !P.has || hudAway) { P.cand = false; continue; }
    const s = worldToScreen(P.pos);
    _s.x = s.x; _s.y = s.y;
    if (!s.visible) { _s.x = W - s.x; _s.y = H - s.y; }
    P.sx = _s.x; P.sy = _s.y;
    // on screen = inside the screen below the HUD; a little hysteresis so a target on the border does not flicker
    const m = P.off ? 28 : -4;
    const inside = s.visible && P.sx >= m && P.sx <= W - m && P.sy >= zones.hudBottom + m && P.sy <= H - m;
    P.off = !inside;
    P.cand = P.off;
    if (P.off) cands.push(P);
  }
  cands.sort((a, b) => a.prio - b.prio || a.seq - b.seq);
  const shownSet = new Set(cands.slice(0, MAX_SHOWN));

  // 1. where each pointer wants to sit: the ray from the screen centre to the target, cut by the inner rectangle
  for (const P of shownSet) {
    const dx = P.sx - cx, dy = P.sy - cy;
    let t = Infinity;
    if (dx > 0.001) t = Math.min(t, (R - cx) / dx); else if (dx < -0.001) t = Math.min(t, (L - cx) / dx);
    if (dy > 0.001) t = Math.min(t, (B - cy) / dy); else if (dy < -0.001) t = Math.min(t, (T - cy) / dy);
    if (!Number.isFinite(t)) t = 0;
    let x = cx + dx * t, y = cy + dy * t;
    // keep clear of the HUD: the top edge only between the two side columns, the side edges only below them
    let edge = 'b';
    const dl = x - L, dr = R - x, dt2 = y - T, db = B - y;
    const mn = Math.min(dl, dr, dt2, db);
    if (mn === dt2) { edge = 't'; x = Math.min(Math.max(x, topX0), Math.max(topX0, topX1)); y = T; }
    else if (mn === dl) { edge = 'l'; x = L; y = Math.min(Math.max(y, Math.max(T, zones.leftColBottom + 34)), B); }
    else if (mn === dr) { edge = 'r'; x = R; y = Math.min(Math.max(y, Math.max(T, zones.rightColBottom + 34)), B); }
    else { edge = 'b'; y = B; x = Math.min(Math.max(x, L + 6), R - 6); }
    P.tx = x; P.ty = y; P.edge = edge;
  }
  // 2. calm: pointers on the same edge never sit on top of each other
  const list = [...shownSet];
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const ddx = b.tx - a.tx, ddy = b.ty - a.ty, d = Math.hypot(ddx, ddy);
        if (d >= MIN_GAP) continue;
        // slide along whichever axis the edge runs on (vertical edges: y, horizontal edges: x)
        const vert = a.edge === 'l' || a.edge === 'r' || (b.edge === 'l' || b.edge === 'r');
        const push = (MIN_GAP - d) / 2 + 0.5;
        if (vert) { const s = ddy >= 0 ? 1 : -1; a.ty -= s * push; b.ty += s * push; }
        else { const s = ddx >= 0 ? 1 : -1; a.tx -= s * push; b.tx += s * push; }
        moved = true;
      }
    }
    for (const P of list) {   // back into the allowed range of their edge
      P.tx = Math.min(Math.max(P.tx, P.edge === 't' ? topX0 : L), P.edge === 't' ? Math.max(topX0, topX1) : R);
      const yMin = P.edge === 'l' ? Math.max(T, zones.leftColBottom + 34) : P.edge === 'r' ? Math.max(T, zones.rightColBottom + 34) : T;
      P.ty = Math.min(Math.max(P.ty, yMin), B);
    }
    if (!moved) break;
  }
  // 3. glide there and draw
  const k = 1 - Math.exp(-14 * Math.min(dt, 0.1));
  for (const P of all) {
    const show = shownSet.has(P);
    if (show !== P.shown) {
      P.shown = show;
      P.el.classList.toggle('on', show);
      if (show && !P.init) { P.x = P.tx; P.y = P.ty; P.init = true; }
      if (!show) P.init = false;
    }
    if (!show) continue;
    P.x += (P.tx - P.x) * k; P.y += (P.ty - P.y) * k;
    const ang = Math.atan2(P.sy - P.y, P.sx - P.x) * 57.2958;
    P.el.style.transform = `translate3d(${P.x.toFixed(1)}px,${P.y.toFixed(1)}px,0)`;
    P.el.style.setProperty('--a', ang.toFixed(1) + 'deg');
    if (P.el.dataset.e !== P.edge) P.el.dataset.e = P.edge;
  }
}

// ------------------------------------------------------------------ hint pill, banner, chips
let stack = null;
const getStack = () => stack || (stack = root.querySelector('.stack'));

let hintEl = null, hintText = null, hintDefault = null;
function showHint() {
  const st = getStack();
  if (!st) return;
  const text = hintText ?? hintDefault;
  if (!hintEl) hintEl = st.querySelector('.hint-pill');
  if (!hintEl) return;
  if (text) hintEl.querySelector('span').textContent = text;
  hintEl.classList.toggle('on', !!text);
}
/** ui.hint(text | null): pill under the top card. null clears it (the built-in "Drive to a free lift!" comes back while driving). */
export function hint(text) { hintText = text ? String(text) : null; showHint(); }
/** Built-in default shown while no explicit hint is set (driving a customer's car). */
export function setDefaultHint(text) { hintDefault = text || null; showHint(); }

const bannerQueue = [];
let bannerBusy = false;
/** ui.banner(text, seconds = 3): big ribbon across the screen, for town events. */
export function banner(text, seconds = 3) {
  bannerQueue.push({ text: String(text), seconds: Math.max(1, seconds) });
  if (!bannerBusy) nextBanner();
}
function nextBanner() {
  const b = bannerQueue.shift();
  if (!b) { bannerBusy = false; return; }
  bannerBusy = true;
  const el = html('<div class="banner"><div class="bn-in"><i></i><span></span><i></i></div></div>');
  el.querySelector('span').textContent = b.text;
  document.getElementById('ui').appendChild(el);
  const a = el.animate([
    { opacity: 0, transform: 'translateX(-60%) scaleX(.6)', offset: 0 },
    { opacity: 1, transform: 'translateX(2%) scaleX(1.02)', offset: 0.1, easing: 'ease-out' },
    { opacity: 1, transform: 'translateX(0) scaleX(1)', offset: 0.14 },
    { opacity: 1, transform: 'translateX(0) scaleX(1)', offset: 0.88 },
    { opacity: 0, transform: 'translateX(60%) scaleX(.6)', offset: 1 },
  ], { duration: (b.seconds + 0.9) * 1000, easing: 'ease-in-out', fill: 'both' });
  a.onfinish = () => { el.remove(); nextBanner(); };
}

const chips = new Map();   // id -> { el, icon, text, until }
let chipTimer = 0;
function chipTick() {
  const now = Date.now();
  let any = false;
  for (const c of chips.values()) {
    if (!c.until) continue;
    any = true;
    const left = (c.until - now) / 1000;
    c.time.textContent = mmss(left);
    c.el.classList.toggle('urgent', left > 0 && left <= 10);
  }
  if (!any && chipTimer) { clearInterval(chipTimer); chipTimer = 0; }
}
/**
 * ui.chip(id, { icon, text, until?, seconds? } | null): small status chip under the top card (rescue countdown, crew
 * buff, event timer). `until` is a Date.now() timestamp in ms (or give `seconds` from now); a countdown m:ss is shown.
 * Calling again with the same id updates it; null removes it.
 */
export function chip(id, opts) {
  const st = getStack();
  if (!st) return;
  let c = chips.get(id);
  if (!opts) {
    if (!c) return;
    chips.delete(id);
    c.el.classList.add('out');
    setTimeout(() => c.el.remove(), 260);
    return;
  }
  if (!c) {
    const el = html('<div class="chip-s"><s></s><b></b><em></em></div>');
    const hp = st.querySelector('.hint-pill');
    st.insertBefore(el, hp);   // chips sit above the hint pill
    c = { el, icon: null, text: null, until: 0, time: el.querySelector('em') };
    c.ico = el.querySelector('s'); c.txt = el.querySelector('b');
    chips.set(id, c);
  }
  const icon = opts.icon || 'clock';
  if (icon !== c.icon) { c.icon = icon; c.ico.innerHTML = ICON[icon] || ICON.clock; }
  const text = opts.text || '';
  if (text !== c.text) { c.text = text; c.txt.textContent = text; c.txt.hidden = !text; }
  const until = opts.until || (opts.seconds ? Date.now() + opts.seconds * 1000 : 0);
  c.until = until;
  c.time.hidden = !until;
  if (until) { chipTick(); if (!chipTimer) chipTimer = setInterval(chipTick, 250); }
  else c.el.classList.remove('urgent');
}
