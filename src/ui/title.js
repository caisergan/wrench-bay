import { events } from '../core/events.js';
import { canChooseView, viewForced, viewMode, setViewMode, keepViewMode, onViewMode } from '../core/view.js';
import { html } from './format.js';
import { ICON } from './icons.js';
import { unlockAudio, sfx } from './audio.js';
import { flags, refreshInput } from './uistate.js';

const LOGO = `
<svg class="title-art" viewBox="0 -24 220 144" aria-hidden="true">
  <g class="wr">
    <g transform="translate(0 -8) rotate(-38 110 52)">
      <path d="M30 52h110" stroke="#1f3340" stroke-width="20" stroke-linecap="round"/>
      <path d="M161 44H146v16h15A17 17 0 1 1 161 44z" fill="#c9d3d8" stroke="#1f3340" stroke-width="5" stroke-linejoin="round"/>
      <path d="M30 52h112" stroke="#c9d3d8" stroke-width="11" stroke-linecap="round"/>
      <circle cx="40" cy="52" r="3.500" fill="#1f3340"/>
    </g>
  </g>
  <g class="car">
    <ellipse cx="110" cy="108" rx="78" ry="6" fill="rgba(0,0,0,.25)"/>
    <path d="M30 94V78c0-6 3-10 9-12l20-6 14-18c3-4 7-6 12-6h34c5 0 9 2 12 6l14 18 18 4c6 2 9 6 9 12v18z" transform="translate(0 4)" fill="#f26b5b" stroke="#1f3340" stroke-width="5" stroke-linejoin="round"/>
    <path d="M78 44h26v18H64zM112 44h20l16 18h-36z" transform="translate(0 4)" fill="#bfe9f2" stroke="#1f3340" stroke-width="4" stroke-linejoin="round"/>
    <path d="M34 82h14" stroke="#f6c453" stroke-width="7" stroke-linecap="round" transform="translate(0 4)"/>
    <path d="M178 82h-10" stroke="#fff6e6" stroke-width="7" stroke-linecap="round" transform="translate(0 4)"/>
    <g class="wh"><circle cx="64" cy="100" r="13" fill="#3a4250" stroke="#1f3340" stroke-width="5"/><circle cx="64" cy="100" r="5" fill="#c9d3d8"/></g>
    <g class="wh"><circle cx="156" cy="100" r="13" fill="#3a4250" stroke="#1f3340" stroke-width="5"/><circle cx="156" cy="100" r="5" fill="#c9d3d8"/></g>
  </g>
  <g fill="#f6c453" class="spark"><path d="M176 20l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/><path d="M36 28l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></g>
</svg>`;

const HOW = {
  mobile: 'Drag to move. Hop in a car, drive it onto a lift, bring the parts.',
  browser: 'WASD or arrow keys to move (or drag). Hop in a car, drive it onto a lift, bring the parts.',
};

/**
 * Mobile / Browser picker (title screen and pause menu). Picking one switches the view at once, so the player sees
 * it behind the menu. Returns { el, dispose }.
 */
export function buildViewPick({ compact = false } = {}) {
  const el = html(`
    <div class="view-pick${compact ? ' compact' : ''}" role="radiogroup" aria-label="Screen size" data-ui>
      <button class="vp-opt pressable" data-ui data-view="mobile" role="radio">${ICON.viewPhone}<b>Mobile</b><small>Phone-sized screen</small></button>
      <button class="vp-opt pressable" data-ui data-view="browser" role="radio">${ICON.viewBrowser}<b>Browser</b><small>Wide, full window</small></button>
    </div>`);
  const sync = (m) => {
    for (const b of el.querySelectorAll('[data-view]')) {
      const on = b.dataset.view === m;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
  };
  sync(viewMode());
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) setViewMode(b.dataset.view);
  });
  const off = onViewMode(sync);
  return { el, dispose: off };
}

/** returning: the save already played the tutorial (the browser still shows the title, to pick the view). */
export function buildTitle(root, hud, { returning = false } = {}) {
  const pickView = canChooseView && !viewForced;
  const el = html(`
    <div class="title" data-ui>
      <div class="title-inner">
        ${LOGO}
        <h1 class="logo"><span class="l1">WRENCH</span><span class="l2">BAY</span></h1>
        <p class="tagline">Fix cars, grow your garage, run the busiest bay on the harbor!</p>
        <button class="btn play pressable pulse" data-ui>${ICON.play}<span>${returning ? 'CONTINUE' : 'PLAY'}</span></button>
        <p class="how"></p>
      </div>
    </div>`);
  const how = el.querySelector('.how');
  const showHow = (m) => { how.textContent = HOW[m] || HOW.mobile; };
  showHow(viewMode());
  const offHow = onViewMode(showHow);
  let pick = null;
  if (pickView) {
    pick = buildViewPick();
    el.classList.add('picking');
    el.querySelector('.play').before(html('<p class="vp-label">Play on</p>'), pick.el);
  }
  root.appendChild(el);
  flags.title = true; refreshInput();
  hud.setHidden(true);

  // keyboard: Enter / Space plays, left / right (or 1 / 2) switches the view
  function onKey(e) {
    if (!flags.title || e.repeat) return;
    const k = e.key;
    if (k === 'Enter' || k === ' ') { e.preventDefault(); play(); }
    else if (pickView && (k === 'ArrowLeft' || k === '1')) setViewMode('mobile');
    else if (pickView && (k === 'ArrowRight' || k === '2')) setViewMode('browser');
  }
  window.addEventListener('keydown', onKey);
  const cleanup = () => { window.removeEventListener('keydown', onKey); offHow(); pick?.dispose(); };

  function play() {
    if (!flags.title) return;
    flags.title = false; refreshInput();
    cleanup();
    if (pickView) keepViewMode();
    unlockAudio(); sfx('unlock');
    el.classList.add('leaving');
    hud.setHidden(false);
    setTimeout(() => el.remove(), 600);
    events.emit('ui:play');
  }
  el.querySelector('.play').addEventListener('click', play);
  return {
    skip() {
      flags.title = false; refreshInput(); cleanup(); el.remove(); hud.setHidden(false);
    },
  };
}
