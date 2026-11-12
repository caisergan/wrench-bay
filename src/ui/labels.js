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

function build(kind) {
  switch (kind) {
    case 'price':
      return html(`<div class="wl wl-price"><div class="pill">${ICON.cash}<b></b></div><div class="bar"><i></i></div></div>`);
    case 'job': {
      const chips = Array.from({ length: MAX_JOBS }, () => `<span class="jb" data-s="need"><span class="jb-i"></span><u>${ICON.check}</u></span>`).join('');
      return html(`<div class="wl wl-job"><div class="bubble"><s class="vstar">${ICON.star}</s><div class="jobs">${chips}</div>` +
        `<div class="work"><i></i></div><div class="pat"><i></i></div></div></div>`);
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
  // price: fill bar; job: work-progress bar
  const bar = kind === 'job' ? el.querySelector('.work i') : el.querySelector('.bar i');
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
      if (!bar) return L;
      p = Math.max(0, Math.min(1, p || 0));
      if (Math.abs(p - L.prog) < 0.002 && !(p === 0 && L.prog !== 0)) return L;
      L.prog = p;
      bar.style.transform = `scaleX(${p})`;
      if (kind === 'job') workEl.classList.toggle('on', p > 0);
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
  const workEl = kind === 'job' ? el.querySelector('.work') : null;
  if (kind === 'job') addJobApi(L, el);
  layer.appendChild(el);
  return L;
}

// ---- job bubble: up to 4 part chips + work bar + patience bar + VIP. Every setter early-outs when unchanged. ----
function addJobApi(L, el) {
  const bubble = el.querySelector('.bubble');
  const chips = [...el.querySelectorAll('.jb')];
  const icons = chips.map((c) => c.firstChild);
  const pat = el.querySelector('.pat'), patI = pat.firstChild;
  const cur = chips.map(() => ({ type: null, state: null }));
  let count = 0, patV = -2, patBand = '', vip = false;

  L.setJobs = (jobs) => {
    jobs = jobs || [];
    const n = Math.min(jobs.length, MAX_JOBS);
    if (n !== count) { count = n; el.dataset.n = n; }
    for (let i = 0; i < MAX_JOBS; i++) {
      const c = cur[i], j = i < n ? jobs[i] : null;
      const type = j ? j.type : null;
      let st = j ? (j.state || 'need') : null;
      if (st && !JOB_STATES.includes(st)) st = 'need';
      if (type !== c.type) { c.type = type; icons[i].innerHTML = type ? ICON[type] || '' : ''; chips[i].hidden = !type; }
      if (st !== c.state) { c.state = st; if (st) chips[i].dataset.s = st; }
    }
    return L;
  };
  L.setPatience = (p) => {
    if (p == null) p = -1;
    p = p < 0 ? -1 : Math.max(0, Math.min(1, p));
    if (Math.abs(p - patV) < 0.004 && (p > 0) === (patV > 0)) return L;
    if (pat.hidden !== (p === -1)) pat.hidden = p === -1;
    patV = p;
    if (p >= 0) patI.style.transform = `scaleX(${p})`;
    const band = p < 0 ? '' : p <= 0 ? 'zero' : p < 0.25 ? 'low' : p < 0.55 ? 'mid' : 'hi';
    if (band !== patBand) {
      patBand = band;
      if (band) pat.dataset.b = band; else delete pat.dataset.b;
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
    patV = -2; patBand = ''; pat.hidden = true; delete pat.dataset.b; bubble.classList.remove('urgent');
    patI.style.transform = 'scaleX(1)';
  };
  chips.forEach((c) => { c.hidden = true; });
  pat.hidden = true;
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
