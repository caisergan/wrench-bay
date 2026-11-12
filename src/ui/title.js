import { events } from '../core/events.js';
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

export function buildTitle(root, hud) {
  const el = html(`
    <div class="title" data-ui>
      <div class="title-inner">
        ${LOGO}
        <h1 class="logo"><span class="l1">WRENCH</span><span class="l2">BAY</span></h1>
        <p class="tagline">Fix cars, grow your garage, run the busiest bay on the harbor!</p>
        <button class="btn play pressable pulse" data-ui>${ICON.play}<span>PLAY</span></button>
        <p class="how">Drag to move. Hop in a car, drive it onto a lift, bring the parts.</p>
      </div>
    </div>`);
  root.appendChild(el);
  flags.title = true; refreshInput();
  hud.setHidden(true);

  function play() {
    if (!flags.title) return;
    flags.title = false; refreshInput();
    unlockAudio(); sfx('unlock');
    el.classList.add('leaving');
    hud.setHidden(false);
    setTimeout(() => el.remove(), 600);
    events.emit('ui:play');
  }
  el.querySelector('.play').addEventListener('click', play);
  return {
    skip() {
      flags.title = false; refreshInput(); el.remove(); hud.setHidden(false);
    },
  };
}
