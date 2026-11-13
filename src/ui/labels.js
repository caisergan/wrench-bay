// Pooled world-anchored HTML labels + floating texts. All positions are updated in ONE onUpdate callback.
import * as THREE from 'three';
import { onUpdate, worldToScreen } from '../core/engine.js';
import { ICON } from './icons.js';
import { fmt, html } from './format.js';

let layer = null, floatLayer = null;
const active = new Set();
const pools = {};   // kind -> [label]
const _p = new THREE.Vector3();

function ensureLayers() {
  if (layer) return;
  const ui = document.getElementById('ui');
  layer = html('<div class="layer labels"></div>');
  floatLayer = html('<div class="layer floats"></div>');
  ui.append(layer, floatLayer);
  onUpdate(update);
}

const ANCHOR = {
  price: 'translate(-50%,-50%)',
  job: 'translate(-50%,-100%)',
  max: 'translate(-50%,-100%)',
  info: 'translate(-50%,-100%)',
  station: 'translate(-50%,-100%)',
  emote: 'translate(-50%,-100%)',
  tag: 'translate(-50%,-50%)',
  till: 'translate(-50%,-100%)',
  timer: 'translate(-50%,-50%)',
  stars: 'translate(-50%,-100%)',
  call: 'translate(-50%,-100%)',
};
const BAR_KINDS = new Set(['price', 'till', 'tag', 'call']);
// Bubbles that float over cars and stations go see-through while they cover the player's character on screen (see
// seeThrough). Not the player's own tags (max, info) and not the pad / till labels the player stands on to pay.
const SEE_KINDS = new Set(['job', 'stars', 'call', 'emote', 'station', 'timer']);
const MAX_JOBS = 4;
const JOB_STATES = ['need', 'ready', 'done'];
const EMOTES = { happy: ICON.happy, angry: ICON.angry, wait: ICON.wait, star: ICON.star };
const MOODS = { hi: ICON.moodHi, mid: ICON.moodMid, low: ICON.moodLow, zero: ICON.moodZero };

function build(kind) {
  switch (kind) {
    case 'price':
      return html(`<div class="wl wl-price"><div class="pill">${ICON.cash}<b></b></div><div class="bar"><i></i></div></div>`);
    case 'job': {
      // tile = work-fill (rises while the job is worked on) + part icon + done check
      const chips = Array.from({ length: MAX_JOBS }, () =>
        `<span class="jb" data-s="need"><span class="jb-w"><i></i></span><span class="jb-i"></span><u>${ICON.check}</u></span>`).join('');
      return html(`<div class="wl wl-job"><div class="bubble"><s class="vstar">${ICON.star}</s><s class="ribbon" hidden></s><div class="jobs">${chips}</div>` +
        `<div class="mood"><span class="face"></span><div class="pat"><i></i></div></div></div></div>`);
    }
    case 'max':
      return html('<div class="wl wl-max"><b>MAX</b></div>');
    case 'station':
      return html('<div class="wl wl-station"><div class="pill"><span class="st-i"></span><b></b></div></div>');
    case 'emote':
      return html('<div class="wl wl-emote"><div class="bubble"></div></div>');
    case 'tag':
      // building pad tag: lies ON the pay pad (never above it, where the building is). Icon + price; close by it also
      // shows the name (+ level). The details are in the pay dock (paydock.js) while the player stands on the pad.
      return html('<div class="wl wl-tag" data-k="buy"><div class="gt"><span class="gt-i"><span class="gt-ic"></span><span class="gt-badge"></span></span>' +
        '<span class="gt-name"><b></b><span class="gt-lv"></span></span><span class="gt-sep"></span><span class="gt-p"><em></em></span>' +
        `<span class="gt-fame">${ICON.star}<em></em></span><span class="bar"><i></i></span></div></div>`);
    case 'till':
      return html(`<div class="wl wl-till"><div class="pill"><s class="tl-i">${ICON.coins}</s><b></b></div><div class="bar"><i></i></div></div>`);
    case 'timer':
      return html('<div class="wl wl-timer"><div class="ring"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="tr-bg" cx="20" cy="20" r="16"/>' +
        '<circle class="tr-fg" cx="20" cy="20" r="16" pathLength="100"/></svg><s class="tr-i"></s><b></b></div></div>');
    case 'stars':
      return html('<div class="wl wl-stars"><div class="bubble"><i></i><i></i><i></i></div></div>');
    case 'call':
      return html(`<div class="wl wl-call"><div class="bubble"><s class="ci">${ICON.phone}</s><div class="cm"><b>Rescue call</b><div class="bar"><i></i></div></div></div></div>`);
    default:
      return html('<div class="wl wl-info"><b></b></div>');
  }
}

function makeLabel(kind) {
  const el = build(kind);
  const txt = kind === 'emote' || kind === 'stars' || kind === 'tag' ? null : el.querySelector('b');
  // price / till / tag / call: fill bar (job bubbles show work progress inside the active part tile, see addJobApi)
  const bar = BAR_KINDS.has(kind) ? el.querySelector('.bar i') : null;
  const L = {
    kind, el, txt, bar, anchor: ANCHOR[kind] || ANCHOR.info,
    pos: new THREE.Vector3(), has: false, wantVisible: true, shown: false,
    lx: NaN, ly: NaN, text: null, prog: -1, icon: null,
    setText(s) {
      if (typeof s === 'number') s = kind === 'price' || kind === 'till' ? '$' + fmt(s) : String(s);
      s = String(s ?? '');
      if (s === L.text) return L;
      L.text = s;
      if (kind === 'max' || kind === 'job' || kind === 'stars' || kind === 'tag') return L;
      if (kind === 'call') { txt.textContent = s || 'Rescue call'; return L; }
      if (kind === 'emote') { bubbleEl.innerHTML = EMOTES[s] || EMOTES.happy; bubbleEl.dataset.e = EMOTES[s] ? s : 'happy'; return L; }
      txt.textContent = s;
      if (kind === 'station') el.classList.toggle('full', s.toUpperCase() === 'MAX');
      return L;
    },
    setIcon(name) {
      if (name === L.icon) return L;
      if (kind === 'station') { L.icon = name; stIcon.innerHTML = ICON[name] || ''; }
      else if (kind === 'timer' || kind === 'till' || kind === 'call') {
        L.icon = name;
        const host = el.querySelector(kind === 'timer' ? '.tr-i' : kind === 'till' ? '.tl-i' : '.ci');
        host.innerHTML = ICON[name] || '';
        if (kind === 'timer') el.classList.toggle('has-i', !!ICON[name]);
      }
      return L;
    },
    setPos(v) { if (v) { L.pos.set(v.x, v.y, v.z); L.has = true; } return L; },
    setVisible(b) { L.wantVisible = !!b; if (!b) L.hide(); return L; },
    setProgress(p) {
      if (kind === 'job') return L.setWork(p);
      p = Math.max(0, Math.min(1, p || 0));
      if (Math.abs(p - L.prog) < 0.002 && !(p === 0 && L.prog !== 0)) return L;
      L.prog = p;
      if (kind === 'timer') { ringFg.style.strokeDashoffset = String(100 - p * 100); el.dataset.b = p < 0.2 ? 'low' : p < 0.5 ? 'mid' : 'hi'; return L; }
      if (!bar) return L;
      bar.style.transform = `scaleX(${p})`;
      if (kind === 'till') el.classList.toggle('full', p >= 0.999);
      else if (kind === 'tag') el.classList.toggle('part', p > 0.001 && p < 0.999);
      else if (kind === 'call') { el.dataset.b = p < 0.25 ? 'low' : p < 0.55 ? 'mid' : 'hi'; }
      return L;
    },
    hide() { if (L.shown) { L.shown = false; el.classList.remove('on'); } },
    remove() {
      if (!active.delete(L)) return;
      L.hide();
      if (L.see) { L.see = false; el.classList.remove('see'); }
      L.solid = false;
      L.lx = L.ly = NaN; L.has = false; L.text = null; L.prog = -1; L.icon = null;
      if (bar) bar.style.transform = 'scaleX(0)';
      if (kind === 'job') L.resetJob();
      if (L.resetKind) L.resetKind();
      if (kind === 'station') { el.classList.remove('full'); stIcon.innerHTML = ''; }
      if (kind === 'timer' || kind === 'till' || kind === 'call') {
        el.querySelector(kind === 'timer' ? '.tr-i' : kind === 'till' ? '.tl-i' : '.ci').innerHTML = kind === 'till' ? ICON.coins : kind === 'call' ? ICON.phone : '';
        el.classList.remove('has-i', 'full'); delete el.dataset.b;
      }
      pools[kind].push(L);
    },
  };
  const bubbleEl = kind === 'emote' ? el.querySelector('.bubble') : null;
  const ringFg = kind === 'timer' ? el.querySelector('.tr-fg') : null;
  const stIcon = kind === 'station' ? el.querySelector('.st-i') : null;
  if (kind === 'job') addJobApi(L, el);
  else if (kind === 'tag') addTagApi(L, el);
  else if (kind === 'stars') addStarsApi(L, el);
  // every label answers every setter, so a caller never has to know which kind it holds (unknown kinds must not throw)
  for (const m of ['setJobs', 'setPatience', 'setVip', 'setBonus', 'setStars', 'setInfo', 'setWork', 'setNear', 'setSolid']) if (!L[m]) L[m] = () => L;
  layer.appendChild(el);
  if (SEE_KINDS.has(kind)) {
    // box size for the see-through test: measured by a ResizeObserver, so the per-frame test never forces a layout
    L.w = 0; L.h = 0; L.see = false;
    // solid: stays opaque even over the player (a job bubble while that car is being repaired: watch the progress)
    L.solid = false;
    L.setSolid = (v) => { L.solid = !!v; return L; };
    L.ay = L.anchor.includes('-100%') ? 1 : 0.5;   // how much of the box sits above the anchor point
    byEl.set(el, L);
    sizes.observe(el);
  }
  return L;
}

// ---- see-through: a bubble covering the player's character fades, so you can always see yourself move ----
const SEE_H = 1.65;    // character height (top of the head, measured 1.63), world units
const SEE_R = 0.38;    // character half width / depth
const SEE_GAP = 6;     // px a faded bubble must clear the character by before it comes back (no flicker on the edge)
const byEl = new WeakMap();
const sizes = new ResizeObserver((entries) => {
  for (const e of entries) {
    const L = byEl.get(e.target);
    const b = e.borderBoxSize?.[0];
    if (L) { L.w = b ? b.inlineSize : e.contentRect.width; L.h = b ? b.blockSize : e.contentRect.height; }
  }
});
let seeObj = null;
const seeBox = { x0: 0, y0: 0, x1: 0, y1: 0, on: false };

/** Fade SEE_KINDS bubbles while they cover this Object3D (the player's character) on screen. null switches it off. */
export function seeThrough(obj) { seeObj = obj || null; }

// the character's screen box: feet at the front edge to the top of the head at the back edge, one radius each side
function updateSeeBox() {
  seeBox.on = false;
  if (!seeObj || !seeObj.visible) return;
  const p = seeObj.position;
  const feet = worldToScreen(_p.set(p.x, p.y, p.z + SEE_R));
  if (!feet.visible) return;
  const fy = feet.y;
  const head = worldToScreen(_p.set(p.x, p.y + SEE_H, p.z - SEE_R));
  const hy = head.y, cx = head.x;
  const side = worldToScreen(_p.set(p.x + SEE_R, p.y + SEE_H * 0.5, p.z));
  const hw = Math.abs(side.x - cx);
  seeBox.x0 = cx - hw; seeBox.x1 = cx + hw;
  seeBox.y0 = Math.min(hy, fy); seeBox.y1 = Math.max(hy, fy);
  seeBox.on = true;
}

function coversPlayer(L, x, y) {
  if (!seeBox.on || !L.w) return false;
  const g = L.see ? SEE_GAP : 0;
  const x0 = x - L.w * 0.5, y0 = y - L.h * L.ay;
  return x0 - g < seeBox.x1 && x0 + L.w + g > seeBox.x0 && y0 - g < seeBox.y1 && y0 + L.h + g > seeBox.y0;
}

// ---- job bubble: up to 4 part tiles + owner mood row + VIP. Every setter early-outs when unchanged. ----
// need = cream slot; ready = part delivered (mustard ring); the FIRST ready tile is the one being worked on: it fills
// up green from the bottom (setProgress) and its icon wiggles; done = green tile + check. The mood row is the owner's
// face + patience bar, both green -> amber -> coral, angry red face and a grey empty bar once patience runs out.
function addJobApi(L, el) {
  const bubble = el.querySelector('.bubble');
  const chips = [...el.querySelectorAll('.jb')];
  const icons = chips.map((c) => c.querySelector('.jb-i'));
  const fills = chips.map((c) => c.querySelector('.jb-w i'));
  const mood = el.querySelector('.mood'), face = mood.querySelector('.face');
  const patI = mood.querySelector('.pat i');
  const cur = chips.map(() => ({ key: null, state: null }));
  const ribbon = bubble.querySelector('.ribbon');
  let count = 0, patV = -2, patBand = '', vip = false, act = -1, work = 0, bonus = null;

  const setFill = (i, p) => {
    fills[i].style.transform = `scaleY(${p})`;
    chips[i].classList.toggle('working', p > 0);
  };
  // a tile is a part type, a paint canister in a given colour ({ type: 'spray', color }) or a gold premium kit ({ gold: true })
  const tileIcon = (j) => {
    if (!j) return '';
    if (j.type === 'spray') return ICON.spray;
    if (j.gold && !j.type) return ICON.premium;
    return ICON[j.type] || '';
  };
  L.setJobs = (jobs) => {
    jobs = jobs || [];
    const n = Math.min(jobs.length, MAX_JOBS);
    if (n !== count) { count = n; el.dataset.n = n; }
    let first = -1;
    for (let i = 0; i < MAX_JOBS; i++) {
      const c = cur[i], j = i < n ? jobs[i] : null;
      const has = !!(j && (j.type || j.gold));
      const key = has ? `${j.type || ''}|${j.color || ''}|${j.gold ? 1 : 0}` : null;
      let st = has ? (j.state || 'need') : null;
      if (st && !JOB_STATES.includes(st)) st = 'need';
      if (key !== c.key) {
        c.key = key;
        icons[i].innerHTML = has ? tileIcon(j) : '';
        chips[i].hidden = !has;
        chips[i].classList.toggle('gold', !!(has && j.gold));
        chips[i].dataset.k = has ? (j.type || 'kit') : '';
        if (has && j.color) chips[i].style.setProperty('--c', j.color); else chips[i].style.removeProperty('--c');
      }
      if (st !== c.state) { c.state = st; if (st) chips[i].dataset.s = st; }
      if (st === 'ready' && first < 0) first = i;
    }
    if (first !== act) {   // the worked-on tile moved: the new one starts empty, the next setProgress fills it
      if (act >= 0) setFill(act, 0);
      act = first; work = 0;
    }
    return L;
  };
  // small ribbon on top of the bubble ("Rescue x2.5"); null hides it
  L.setBonus = (text) => {
    text = text ? String(text) : null;
    if (text === bonus) return L;
    bonus = text;
    ribbon.hidden = !text;
    ribbon.textContent = text || '';
    if (text) { ribbon.style.animation = 'none'; void ribbon.offsetWidth; ribbon.style.animation = ''; }
    return L;
  };
  L.setWork = (p) => {
    p = Math.max(0, Math.min(1, p || 0));
    if (Math.abs(p - work) < 0.002 && !(p === 0 && work !== 0)) return L;
    work = p;
    if (act >= 0) setFill(act, p);
    return L;
  };
  L.setPatience = (p) => {
    if (p == null) p = -1;
    p = p < 0 ? -1 : Math.max(0, Math.min(1, p));
    if (Math.abs(p - patV) < 0.004 && (p > 0) === (patV > 0)) return L;
    if (mood.hidden !== (p === -1)) mood.hidden = p === -1;
    patV = p;
    if (p >= 0) patI.style.transform = `scaleX(${p})`;
    const band = p < 0 ? '' : p <= 0 ? 'zero' : p < 0.25 ? 'low' : p < 0.55 ? 'mid' : 'hi';
    if (band !== patBand) {
      patBand = band;
      if (band) { mood.dataset.b = band; face.innerHTML = MOODS[band]; } else { delete mood.dataset.b; face.innerHTML = ''; }
      bubble.classList.toggle('urgent', band === 'low');
    }
    return L;
  };
  L.setVip = (b) => {
    b = !!b;
    if (b === vip) return L;
    vip = b;
    bubble.classList.toggle('vip', b);
    return L;
  };
  L.resetJob = () => {
    L.setJobs([]); L.setVip(false); L.setBonus(null);
    for (let i = 0; i < MAX_JOBS; i++) setFill(i, 0);
    act = -1; work = 0;
    patV = -2; patBand = ''; mood.hidden = true; delete mood.dataset.b; face.innerHTML = ''; bubble.classList.remove('urgent');
    patI.style.transform = 'scaleX(1)';
  };
  chips.forEach((c) => { c.hidden = true; });
  mood.hidden = true;
}

// ---- building pad tag: icon + price on the pad; close by (setNear) also the name and the level ----
// info = { name, icon (ICON key), price, fame, locked, level, reason }. level > 1 = an upgrade (teal, arrow badge).
// locked: grey with a padlock badge; for reason 'fame' it shows the fame level it needs in a gold star (like the HUD
// badge) instead of the price. The bar under the price shows a part payment (setProgress), kept while you are away.
function addTagApi(L, el) {
  const ic = el.querySelector('.gt-ic'), badge = el.querySelector('.gt-badge'), name = el.querySelector('.gt-name b');
  const lv = el.querySelector('.gt-lv'), price = el.querySelector('.gt-p em'), fame = el.querySelector('.gt-fame em');
  let last = '', near = false;
  L.setInfo = (info) => {
    info = info || {};
    const key = JSON.stringify([info.name, info.icon, info.price, info.fame, !!info.locked, info.level, info.reason]);
    if (key === last) return L;
    last = key;
    const up = (info.level | 0) > 1, k = info.locked ? 'lock' : up ? 'up' : 'buy';
    if (el.dataset.k !== k) { el.dataset.k = k; badge.innerHTML = k === 'lock' ? ICON.lock : k === 'up' ? ICON.arrowUp : ''; }
    el.dataset.r = info.locked ? info.reason || 'fame' : '';
    ic.innerHTML = ICON[info.icon] || ICON.tag;
    name.textContent = info.name || '';
    lv.textContent = up ? 'Lv ' + info.level : '';
    lv.hidden = !up;
    price.textContent = '$' + fmt(info.price || 0);
    fame.textContent = info.fame ? String(info.fame) : '';
    return L;
  };
  L.setNear = (b) => { b = !!b; if (b !== near) { near = b; el.classList.toggle('near', b); } return L; };
  L.resetKind = () => { last = ''; near = false; el.classList.remove('near', 'part'); el.dataset.k = 'buy'; el.dataset.r = ''; badge.innerHTML = ''; name.textContent = ''; };
}

// ---- three-star judge for a VIP job: [careful, fast, spotless], each true (earned) | false (lost) | null (pending) ----
function addStarsApi(L, el) {
  const cells = [...el.querySelectorAll('.bubble i')];
  const NAMES = ['Careful', 'Fast', 'Spotless'];
  const cur = [undefined, undefined, undefined];
  cells.forEach((c, i) => { c.title = NAMES[i]; });
  L.setStars = (arr) => {
    arr = arr || [];
    for (let i = 0; i < 3; i++) {
      const v = arr[i] === true ? true : arr[i] === false ? false : null;
      if (v === cur[i]) continue;
      const was = cur[i];
      cur[i] = v;
      cells[i].innerHTML = v === true ? ICON.starGold : v === false ? ICON.starLost : ICON.starEmpty;
      cells[i].dataset.s = v === true ? 'yes' : v === false ? 'no' : 'wait';
      if (was !== undefined) { cells[i].classList.remove('pop', 'lose'); void cells[i].offsetWidth; cells[i].classList.add(v === true ? 'pop' : 'lose'); }
    }
    el.classList.toggle('perfect', cur[0] === true && cur[1] === true && cur[2] === true);
    return L;
  };
  L.resetKind = () => { cur[0] = cur[1] = cur[2] = undefined; L.setStars([]); cells.forEach((c) => c.classList.remove('pop', 'lose')); };
  L.setStars([]);
}

export function label(opts = {}) {
  ensureLayers();
  const kind = opts.kind || 'info';
  const pool = (pools[kind] ||= []);
  const L = pool.pop() || makeLabel(kind);
  L.wantVisible = true;
  L.setText(opts.text ?? '');
  if (opts.worldPos) L.setPos(opts.worldPos);
  if (opts.icon && L.setIcon) L.setIcon(opts.icon);
  L.setProgress(0);
  active.add(L);
  return L;
}

function update() {
  updateSeeBox();
  for (const L of active) {
    if (!L.wantVisible || !L.has) continue;
    const s = worldToScreen(L.pos);
    if (!s.visible) { L.hide(); continue; }
    const x = Math.round(s.x * 10) / 10, y = Math.round(s.y * 10) / 10;
    if (x !== L.lx || y !== L.ly) {
      L.lx = x; L.ly = y;
      L.el.style.transform = `translate3d(${x}px,${y}px,0) ${L.anchor}`;
    }
    if (!L.shown) { L.shown = true; L.el.classList.add('on'); }
    if (L.see !== undefined) {
      const see = !L.solid && coversPlayer(L, x, y);
      if (see !== L.see) { L.see = see; L.el.classList.toggle('see', see); }
    }
  }
}

// ---- floating texts ----
const floatPool = [];
export function floatText(worldPos, text, kind = 'cash') {
  ensureLayers();
  if (!worldPos) return;
  const s = worldToScreen(_p.set(worldPos.x, worldPos.y, worldPos.z));
  if (!s.visible) return;
  let el = floatPool.pop();
  if (!el) {
    el = html('<div class="ft"><span></span></div>');
    el.addEventListener('animationend', () => { el.classList.remove('go'); el.remove(); floatPool.push(el); });
  }
  const span = el.firstChild;
  span.className = 'ft-' + kind;
  span.textContent = text;
  el.style.transform = `translate3d(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px,0) translate(-50%,-50%)`;
  floatLayer.appendChild(el);
  el.classList.remove('go');
  void el.offsetWidth;   // restart animation (rare, once per spawn)
  el.classList.add('go');
}
