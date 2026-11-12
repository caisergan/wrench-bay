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
};
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
      return html(`<div class="wl wl-job"><div class="bubble"><s class="vstar">${ICON.star}</s><div class="jobs">${chips}</div>` +
        `<div class="mood"><span class="face"></span><div class="pat"><i></i></div></div></div></div>`);
    }
    case 'max':
      return html('<div class="wl wl-max"><b>MAX</b></div>');
    case 'station':
      return html('<div class="wl wl-station"><div class="pill"><span class="st-i"></span><b></b></div></div>');
    case 'emote':
      return html('<div class="wl wl-emote"><div class="bubble"></div></div>');
    default:
      return html('<div class="wl wl-info"><b></b></div>');
  }
}

function makeLabel(kind) {
  const el = build(kind);
  const txt = kind === 'emote' ? null : el.querySelector('b');
  // price: fill bar (job bubbles show work progress inside the active part tile, see addJobApi)
  const bar = kind === 'price' ? el.querySelector('.bar i') : null;
  const L = {
    kind, el, txt, bar, anchor: ANCHOR[kind] || ANCHOR.info,
    pos: new THREE.Vector3(), has: false, wantVisible: true, shown: false,
    lx: NaN, ly: NaN, text: null, prog: -1, icon: null,
    setText(s) {
      if (typeof s === 'number') s = kind === 'price' ? '$' + fmt(s) : String(s);
      s = String(s ?? '');
      if (s === L.text) return L;
      L.text = s;
      if (kind === 'max' || kind === 'job') return L;
      if (kind === 'emote') { bubbleEl.innerHTML = EMOTES[s] || EMOTES.happy; bubbleEl.dataset.e = EMOTES[s] ? s : 'happy'; return L; }
      txt.textContent = s;
      if (kind === 'station') el.classList.toggle('full', s.toUpperCase() === 'MAX');
      return L;
    },
    setIcon(name) {
      if (kind !== 'station' || name === L.icon) return L;
      L.icon = name;
      stIcon.innerHTML = ICON[name] || '';
      return L;
    },
    setPos(v) { if (v) { L.pos.set(v.x, v.y, v.z); L.has = true; } return L; },
    setVisible(b) { L.wantVisible = !!b; if (!b) L.hide(); return L; },
    setProgress(p) {
      if (kind === 'job') return L.setWork(p);
      if (!bar) return L;
      p = Math.max(0, Math.min(1, p || 0));
      if (Math.abs(p - L.prog) < 0.002 && !(p === 0 && L.prog !== 0)) return L;
      L.prog = p;
      bar.style.transform = `scaleX(${p})`;
      return L;
    },
    hide() { if (L.shown) { L.shown = false; el.classList.remove('on'); } },
    remove() {
      if (!active.delete(L)) return;
      L.hide();
      L.lx = L.ly = NaN; L.has = false; L.text = null; L.prog = -1; L.icon = null;
      if (bar) bar.style.transform = 'scaleX(0)';
      if (kind === 'job') L.resetJob();
      if (kind === 'station') { el.classList.remove('full'); stIcon.innerHTML = ''; }
      pools[kind].push(L);
    },
  };
  const bubbleEl = kind === 'emote' ? el.querySelector('.bubble') : null;
  const stIcon = kind === 'station' ? el.querySelector('.st-i') : null;
  if (kind === 'job') addJobApi(L, el);
  layer.appendChild(el);
  return L;
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
  const cur = chips.map(() => ({ type: null, state: null }));
  let count = 0, patV = -2, patBand = '', vip = false, act = -1, work = 0;

  const setFill = (i, p) => {
    fills[i].style.transform = `scaleY(${p})`;
    chips[i].classList.toggle('working', p > 0);
  };
  L.setJobs = (jobs) => {
    jobs = jobs || [];
    const n = Math.min(jobs.length, MAX_JOBS);
    if (n !== count) { count = n; el.dataset.n = n; }
    let first = -1;
    for (let i = 0; i < MAX_JOBS; i++) {
      const c = cur[i], j = i < n ? jobs[i] : null;
      const type = j ? j.type : null;
      let st = j ? (j.state || 'need') : null;
      if (st && !JOB_STATES.includes(st)) st = 'need';
      if (type !== c.type) { c.type = type; icons[i].innerHTML = type ? ICON[type] || '' : ''; chips[i].hidden = !type; }
      if (st !== c.state) { c.state = st; if (st) chips[i].dataset.s = st; }
      if (st === 'ready' && first < 0) first = i;
    }
    if (first !== act) {   // the worked-on tile moved: the new one starts empty, the next setProgress fills it
      if (act >= 0) setFill(act, 0);
      act = first; work = 0;
    }
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
    L.setJobs([]); L.setVip(false);
    for (let i = 0; i < MAX_JOBS; i++) setFill(i, 0);
    act = -1; work = 0;
    patV = -2; patBand = ''; mood.hidden = true; delete mood.dataset.b; face.innerHTML = ''; bubble.classList.remove('urgent');
    patI.style.transform = 'scaleX(1)';
  };
  chips.forEach((c) => { c.hidden = true; });
  mood.hidden = true;
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
