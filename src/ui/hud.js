// HUD: pause + cash pill, gems pill, garage card, streak chip, driving hint, boost buttons, mission/shop buttons.
import { state, activateBoost, progress, shopName } from '../core/state.js';
import { events } from '../core/events.js';
import { BOOSTS } from '../config.js';
import { ICON } from './icons.js';
import { fmt, mmss, html } from './format.js';
import { sfx } from './audio.js';
import { toast } from './toast.js';

function bump(el) {
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(.97)' }, { transform: 'scale(1)' }],
    { duration: 320, easing: 'ease-out' });
}

export function buildHud(root, api) {
  const hud = html(`
  <div class="hud">
    <div class="hud-top">
      <button class="icon-btn pressable" data-ui data-act="pause" aria-label="Pause">${ICON.pause}</button>
      <div class="pill-stat cash-pill" data-ui>${ICON.cash}<b>0</b></div>
      <span class="spacer"></span>
      <button class="pill-stat gem-pill pressable" data-ui data-act="gems" aria-label="Shop">${ICON.gem}<b>0</b><em>+</em></button>
    </div>
    <div class="card" data-ui>
      <div class="card-row"><span class="card-name"></span><span class="card-count"></span></div>
      <div class="card-bar"><i></i></div>
    </div>
    <div class="streak" data-ui>${ICON.flame}<b>x1</b><small></small></div>
    <div class="drive-hint">${ICON.arrowUp}<span>Drive to a free lift!</span></div>
    <div class="col col-left">
      <button class="side-btn pressable" data-ui data-act="missions">${ICON.clipboard}<span>Missions</span><u class="badge"></u></button>
      <button class="side-btn pressable" data-ui data-act="shop">${ICON.bag}<span>Shop</span></button>
    </div>
    <div class="col col-right">
      <button class="side-btn boost pressable" data-ui data-boost="income">${ICON.x2}<span>2x Income</span><em></em></button>
      <button class="side-btn boost pressable" data-ui data-boost="speed">${ICON.bolt}<span>Speed</span><em></em></button>
    </div>
  </div>`);
  root.appendChild(hud);

  const $ = (s) => hud.querySelector(s);
  const cashB = $('.cash-pill b'), cashPill = $('.cash-pill');
  const gemB = $('.gem-pill b'), gemPill = $('.gem-pill');
  const cardName = $('.card-name'), cardCount = $('.card-count'), cardBar = $('.card-bar i');

  const setCash = (c) => { cashB.textContent = fmt(c); };
  const setGems = (g) => { gemB.textContent = fmt(g); };
  setCash(state.cash); setGems(state.gems);

  events.on('cash:changed', (e) => { setCash(e.cash); if (e.delta) bump(cashPill); });
  events.on('gems:changed', (e) => { setGems(e.gems); if (e.delta) bump(gemPill); });

  function setProgress(p) {
    cardName.textContent = p.name || shopName();
    cardCount.textContent = `${p.done}/${p.total}`;
    cardBar.style.transform = `scaleX(${p.total ? Math.min(1, p.done / p.total) : 0})`;
  }
  setProgress(progress());
  events.on('progress:changed', setProgress);
  events.on('shop:changed', setProgress);

  // ---- streak chip: hidden at 0, bumps up, visibly breaks on reset ----
  const chip = $('.streak'), chipB = chip.querySelector('b'), chipS = chip.querySelector('small');
  let lastStreak = 0, lastMult = 1, breakAnim = null;
  const multTxt = (m) => 'x' + +m.toFixed(2);
  function onStreak(e) {
    const n = e.streak | 0, mult = e.mult || 1;
    if (breakAnim) { breakAnim.cancel(); breakAnim = null; chip.classList.remove('breaking'); }
    if (n <= 0) {
      if (lastStreak > 0) {
        // break: grey out, shake, drop away
        chipB.textContent = multTxt(lastMult);
        chip.classList.add('breaking', 'on');
        sfx('error');
        breakAnim = chip.animate([
          { transform: 'translateX(0) rotate(0)', opacity: 1, offset: 0 },
          { transform: 'translateX(-7px) rotate(-6deg)', offset: .1 },
          { transform: 'translateX(7px) rotate(6deg)', offset: .22 },
          { transform: 'translateX(-5px) rotate(-4deg)', offset: .34 },
          { transform: 'translateX(4px) rotate(3deg)', offset: .46 },
          { transform: 'translateY(0) rotate(0)', opacity: 1, offset: .55 },
          { transform: 'translateY(26px) rotate(14deg) scale(.7)', opacity: 0, offset: 1 },
        ], { duration: 900, easing: 'ease-in' });
        breakAnim.onfinish = () => { breakAnim = null; chip.classList.remove('breaking', 'on', 'hot'); };
      } else chip.classList.remove('on', 'hot');
      lastStreak = 0; lastMult = 1;
      return;
    }
    chipB.textContent = multTxt(mult);
    chipS.textContent = n >= 2 ? n + ' in a row' : '';
    chip.classList.add('on');
    chip.classList.toggle('hot', n >= 5);
    if (n > lastStreak) {
      chip.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3) rotate(-4deg)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }],
        { duration: 380, easing: 'ease-out' });
    }
    lastStreak = n; lastMult = mult;
  }
  events.on('streak:changed', onStreak);
  if (state.streak > 0) onStreak({ streak: state.streak, mult: 1 + state.streak * 0.05 });

  // ---- driving hint ----
  const hint = $('.drive-hint');
  events.on('drive:start', () => hint.classList.add('on'));
  events.on('drive:end', () => hint.classList.remove('on'));

  // ---- boosts ----
  const boostEls = {};
  hud.querySelectorAll('[data-boost]').forEach((b) => { boostEls[b.dataset.boost] = b; });
  function refreshBoosts() {
    const now = Date.now();
    for (const kind of ['income', 'speed']) {
      const el = boostEls[kind], em = el.querySelector('em');
      const until = state.boosts[kind + 'Until'], ready = state.boosts[kind + 'ReadyAt'];
      let st = 'ready', txt = '';
      if (now < until) { st = 'active'; txt = mmss((until - now) / 1000); }
      else if (now < ready) { st = 'cooldown'; txt = mmss((ready - now) / 1000); }
      if (el.dataset.state !== st) el.dataset.state = st;
      if (em.textContent !== txt) em.textContent = txt;
    }
  }
  refreshBoosts();
  setInterval(refreshBoosts, 500);
  events.on('boosts:changed', refreshBoosts);

  hud.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.boost) {
      const kind = t.dataset.boost;
      if (activateBoost(kind)) {
        sfx('upgrade');
        toast(kind === 'income' ? `2x Income for ${mmss(BOOSTS.income.duration)}!` : `Speed boost for ${mmss(BOOSTS.speed.duration)}!`);
      } else sfx('error');
      refreshBoosts();
      return;
    }
    const act = t.dataset.act;
    if (act === 'pause') api.openPause();
    else if (act === 'missions') api.openMissions();
    else if (act === 'shop' || act === 'gems') api.openShop();
  });

  return {
    el: hud,
    setBadge(on) { hud.querySelector('.badge').classList.toggle('on', !!on); },
    setHidden(h) { hud.classList.toggle('away', h); },
  };
}
