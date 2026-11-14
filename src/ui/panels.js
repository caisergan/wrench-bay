// Modal panels: missions, shop, upgrade board (board.js), pause menu, garage complete, welcome back.
import {
  state, save, resetSave, addCash, addGems, shopMult, progress, pendingOffline, claimOffline,
} from '../core/state.js';
import { events } from '../core/events.js';
import { BOOSTS, SHOP_NAMES, ECONOMY, BUSINESS as C_BUSINESS } from '../config.js';
import { ICON } from './icons.js';
import { fmt, html } from './format.js';
import { sfx, isMuted, setMuted, unlockAudio } from './audio.js';
import { toast } from './toast.js';
import { flags, pauseGame, refreshInput } from './uistate.js';
import { makeModal } from './modal.js';
import { buildTownPanels } from './panels-town.js';
import { buildBoard } from './board.js';
import { buildViewPick } from './title.js';
import { canChooseView } from '../core/view.js';
import { T } from './townstate.js';

export function buildPanels(root, hud) {
  // ================= MISSIONS =================
  const missions = makeModal({ title: 'Daily Missions', icon: ICON.clipboard });
  const MDEFS = [
    { id: 'repair', stat: 'repaired', icon: ICON.car, target: () => 15, text: () => 'Repair 15 cars' },
    { id: 'earn', stat: 'cashEarned', icon: ICON.cash, target: () => 500 * shopMult(), text: () => `Earn $${fmt(500 * shopMult())}` },
    { id: 'unlock', stat: 'unlocks', icon: ICON.arrowUp, target: () => 2, text: () => 'Unlock 2 things' },
    { id: 'vip', stat: 'vips', icon: ICON.crown, target: () => 2, text: () => 'Repair 2 VIP cars' },
    { id: 'streak', stat: 'dayStreak', icon: ICON.flame, target: () => 5, text: () => 'Reach a streak of 5' },
  ];
  const MISSION_GEMS = 10;
  // Town pool (only once the town is open): up to 3 a day, each only if the player owns what it needs.
  const anyBusiness = () => Object.keys(C_BUSINESS).some((id) => T.owns(id));
  const TDEFS = [
    { id: 't-rescue', stat: 'rescues', icon: ICON.tow, target: () => 3, text: () => 'Rescue 3 stranded cars', need: () => T.owns('tow') },
    { id: 't-respray', stat: 'resprays', icon: ICON.paintShop, target: () => 5, text: () => 'Respray 5 cars', need: () => T.owns('paint') },
    { id: 't-perfect', stat: 'vipPerfect', icon: ICON.starGold, target: () => 2, text: () => 'Give 2 VIPs a perfect service', need: () => T.owns('vip') },
    { id: 't-tills', stat: 'tillCollected', icon: ICON.coins, target: () => Math.round(1000 * shopMult()), text: () => `Collect $${fmt(Math.round(1000 * shopMult()))} from your tills`, need: anyBusiness },
    { id: 't-classic', stat: 'restored', icon: ICON.junk, target: () => 1, text: () => 'Restore a classic car', need: () => T.owns('junkyard') },
  ].map((d) => ({ ...d, town: true, gems: 15 }));
  const tillNow = (m) => m.tillSum || 0;
  const tStat = (d, m) => (d.stat === 'tillCollected' ? tillNow(m) : T.stat(d.stat));
  const hashDay = () => [...dayKey()].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  /** The town missions of today (picked once per day among those the player can do). */
  function townDefs() {
    if (!T.townOpen()) return [];
    const m = ensureDay();
    m.tpick = (m.tpick || []).filter((id) => TDEFS.some((d) => d.id === id));
    const avail = TDEFS.filter((d) => d.need());
    const rot = Math.abs(hashDay()) % Math.max(1, avail.length);
    const order = avail.slice(rot).concat(avail.slice(0, rot));
    let changed = false;
    for (const d of order) {
      if (m.tpick.length >= 3) break;
      if (!m.tpick.includes(d.id)) { m.tpick.push(d.id); (m.tbase ||= {})[d.id] = tStat(d, m); changed = true; }
    }
    if (changed) save();
    return m.tpick.map((id) => TDEFS.find((d) => d.id === id));
  }
  const allDefs = () => MDEFS.concat(townDefs());
  // coins taken from a till count for the "collect from your tills" mission
  const lastTill = {};
  for (const [id, v] of Object.entries(T.tills())) lastTill[id] = v;
  events.on('till:changed', (e) => {
    if (!e) return;
    const prev = lastTill[e.id] || 0;
    if (e.amount < prev) { const m = ensureDay(); m.tillSum = (m.tillSum || 0) + (prev - e.amount); kickMissions(); }
    lastTill[e.id] = e.amount;
  });

  const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  function ensureDay() {
    const m = state.missions;
    if (m.day !== dayKey() || !m.base || m.base.vips === undefined) {
      const fresh = m.day !== dayKey();
      m.day = dayKey(); if (fresh || !m.claimed) m.claimed = [];
      if (fresh) { m.dayStreak = 0; m.tpick = []; m.tbase = {}; m.tillSum = 0; }
      m.base = { repaired: state.stats.repaired, cashEarned: state.stats.cashEarned, unlocks: state.stats.unlocks, vips: state.stats.vips };
      save();
    }
    return m;
  }
  const prog = (d) => {
    const m = ensureDay();
    if (d.town) return Math.max(0, Math.min(d.target(), tStat(d, m) - ((m.tbase || {})[d.id] || 0)));
    const v = d.stat === 'dayStreak' ? (m.dayStreak || 0) : (state.stats[d.stat] || 0) - (m.base[d.stat] || 0);
    return Math.max(0, Math.min(d.target(), v));
  };
  events.on('streak:changed', (e) => {
    const m = ensureDay();
    if (e.streak > (m.dayStreak || 0)) { m.dayStreak = e.streak; kickMissions(); }
  });

  function renderMissions() {
    const m = ensureDay();
    const frag = document.createDocumentFragment();
    let claimable = false;
    for (const d of allDefs()) {
      const p = prog(d), t = d.target();
      const done = p >= t, claimed = m.claimed.includes(d.id);
      if (done && !claimed) claimable = true;
      const row = html(`
        <div class="mrow ${claimed ? 'claimed' : done ? 'done' : ''}">
          <span class="m-ico">${d.icon}</span>
          <div class="m-mid"><div class="m-text">${d.text()}</div>
            <div class="m-bar"><i style="transform:scaleX(${t ? p / t : 0})"></i><span>${fmt(p)}/${fmt(t)}</span></div></div>
          <button class="btn claim pressable" data-ui ${done && !claimed ? '' : 'disabled'}>
            ${claimed ? ICON.check : `${ICON.gem}<b>${d.gems || MISSION_GEMS}</b>`}</button>
        </div>`);
      row.querySelector('.claim').addEventListener('click', () => {
        const mm = ensureDay();
        if (mm.claimed.includes(d.id) || prog(d) < d.target()) return;
        mm.claimed.push(d.id);
        const g = d.gems || MISSION_GEMS;
        addGems(g); save(); sfx('unlock');
        toast(`+${g} gems!`);
        renderMissions(); updateBadge();
      });
      frag.appendChild(row);
    }
    missions.body.replaceChildren(frag, html('<p class="hint">Resets every day. Rewards: gems.</p>'));
    return claimable;
  }
  function updateBadge() {
    const m = ensureDay();
    hud.setBadge(allDefs().some((d) => !m.claimed.includes(d.id) && prog(d) >= d.target()));
  }
  missions.onOpen = renderMissions;
  let mTimer = 0;
  const kickMissions = () => {
    if (mTimer) return;
    mTimer = setTimeout(() => { mTimer = 0; updateBadge(); if (missions.isOpen) renderMissions(); }, 250);
  };
  ['car:repaired', 'cash:changed', 'unlock', 'progress:changed', 'shop:changed', 'rescue:delivered', 'respray:done', 'vip:done', 'property:changed', 'town:opened', 'project:changed'].forEach((e) => events.on(e, kickMissions));
  updateBadge();

  // ================= SHOP =================
  const shop = makeModal({ title: 'Shop', icon: ICON.bag });
  function giveBoost(kind) {
    const b = state.boosts, cfg = BOOSTS[kind], now = Date.now();
    const until = Math.max(now, b[kind + 'Until']) + cfg.duration * 1000;
    b[kind + 'Until'] = until;
    b[kind + 'ReadyAt'] = Math.max(b[kind + 'ReadyAt'], until);
    events.emit('boosts:changed', { ...b });
    save();
  }
  const SHOP = () => {
    const mult = shopMult();
    return [
      { icon: ICON.cash, name: `$${fmt(200 * mult)}`, sub: 'Pocket cash', cost: 10, give: () => addCash(200 * mult), msg: `+$${fmt(200 * mult)}` },
      { icon: ICON.cash, name: `$${fmt(800 * mult)}`, sub: 'Cash bundle', cost: 30, give: () => addCash(800 * mult), msg: `+$${fmt(800 * mult)}` },
      { icon: ICON.x2, name: '2x Income', sub: `Instant, ${Math.round(BOOSTS.income.duration / 60)} min`, cost: 15, give: () => giveBoost('income'), msg: '2x Income active!' },
      { icon: ICON.bolt, name: 'Speed boost', sub: `Instant, ${BOOSTS.speed.duration}s`, cost: 10, give: () => giveBoost('speed'), msg: 'Speed boost active!' },
    ];
  };
  function renderShop() {
    const frag = document.createDocumentFragment();
    frag.appendChild(html(`<div class="shop-gems">${ICON.gem}<b>${fmt(state.gems)}</b><span>gems</span></div>`));
    for (const it of SHOP()) {
      const can = state.gems >= it.cost;
      const row = html(`
        <div class="srow"><span class="m-ico">${it.icon}</span>
          <div class="m-mid"><div class="m-text">${it.name}</div><div class="m-sub">${it.sub}</div></div>
          <button class="btn buy pressable" data-ui ${can ? '' : 'disabled'}>${ICON.gem}<b>${it.cost}</b></button></div>`);
      row.querySelector('.buy').addEventListener('click', () => {
        if (state.gems < it.cost) { sfx('error'); return; }
        addGems(-it.cost); it.give(); sfx('cash'); toast(it.msg); save();
        renderShop();
      });
      frag.appendChild(row);
    }
    shop.body.replaceChildren(frag);
  }
  shop.onOpen = renderShop;
  events.on('gems:changed', () => { if (shop.isOpen) renderShop(); });

  // ================= UPGRADE BOARD (Wrench Bay's teal pad, the Spray Bay office: game/board.js) =================
  const board = buildBoard(root);

  // ================= PAUSE =================
  const pause = makeModal({ title: 'Paused', icon: ICON.pause, cls: 'pause' });
  pause.keep = true;
  let confirming = false;
  let viewPick = null;
  function renderPause() {
    const frag = document.createDocumentFragment();
    viewPick?.dispose(); viewPick = null;
    if (!confirming) {
      const resume = html(`<button class="btn big teal pressable" data-ui>${ICON.play}<span>Resume</span></button>`);
      resume.addEventListener('click', () => pause.close());
      const snd = html(`<button class="btn big cream pressable" data-ui>${isMuted() ? ICON.mute : ICON.sound}<span>Sound: ${isMuted() ? 'Off' : 'On'}</span></button>`);
      snd.addEventListener('click', () => { setMuted(!isMuted()); unlockAudio(); sfx('click'); renderPause(); });
      const reset = html(`<button class="btn big coral pressable" data-ui>${ICON.x}<span>Reset progress</span></button>`);
      reset.addEventListener('click', () => { confirming = true; renderPause(); });
      frag.append(resume, snd);
      // Mobile / Browser view (browser only; the iOS app is always the phone view)
      if (canChooseView) { viewPick = buildViewPick({ compact: true }); frag.append(viewPick.el); }
      frag.append(reset);
    } else {
      const q = html('<p class="confirm-q">Erase all progress and start over?</p>');
      const yes = html('<button class="btn big coral pressable" data-ui><span>Yes, reset</span></button>');
      yes.addEventListener('click', () => { resetSave(); save(); location.reload(); });
      const no = html('<button class="btn big cream pressable" data-ui><span>Keep playing</span></button>');
      no.addEventListener('click', () => { confirming = false; renderPause(); });
      frag.append(q, yes, no);
    }
    pause.body.replaceChildren(frag);
  }
  pause.onOpen = () => { confirming = false; renderPause(); pauseGame(true); };
  pause.onClose = () => pauseGame(false);

  // ================= GARAGE COMPLETE =================
  const done = makeModal({ title: 'Garage complete!', icon: ICON.star, cls: 'complete', sticky: true });
  done.keep = true;
  done.el.querySelector('.x-btn').remove();
  let onNextCb = null;
  function showComplete(onNext) {
    onNextCb = onNext;
    const p = progress();
    const nextName = SHOP_NAMES[(p.level + 1) % SHOP_NAMES.length];
    const ratio = ECONOMY.shopMultiplier;
    const confetti = Array.from({ length: 26 }, (_, i) => {
      const c = ['#f26b5b', '#f6c453', '#2a9d8f', '#fff6e6'][i % 4];
      return `<s style="left:${Math.random() * 100}%;background:${c};animation-delay:${(Math.random() * 1.2).toFixed(2)}s;animation-duration:${(2 + Math.random() * 1.5).toFixed(2)}s"></s>`;
    }).join('');
    const body = html(`
      <div class="celebrate"><div class="confetti">${confetti}</div>
        <div class="big-star">${ICON.star}</div>
        <p class="c-name">${p.name}</p>
        <p class="c-sub">Everything is unlocked. Next up:</p>
        <p class="c-next">${nextName}</p>
        <p class="c-mult">Prices and income x${ratio}</p>
      </div>`);
    const go = html('<button class="btn big teal pressable pulse" data-ui><span>Open next garage</span></button>');
    go.addEventListener('click', () => {
      done.close();
      const cb = onNextCb; onNextCb = null;
      sfx('unlock');
      try { cb && cb(); } finally { events.emit('ui:nextShop'); }
    });
    done.body.replaceChildren(body, go);
    done.open();
    sfx('unlock');
  }
  done.onOpen = () => { flags.complete = true; refreshInput(); };
  done.onClose = () => { flags.complete = false; refreshInput(); };
  // ================= WELCOME BACK (offline earnings) =================
  const welcome = makeModal({ title: 'Welcome back!', icon: ICON.wrench, cls: 'welcome', sticky: true });
  welcome.keep = true;
  welcome.el.querySelector('.x-btn').remove();
  const DOUBLE_GEMS = 10;
  const away = (sec) => {
    const h = Math.floor(sec / 3600), m = Math.max(1, Math.round((sec % 3600) / 60));
    return h ? `${h}h ${m}m` : `${m} min`;
  };
  /** info = { amount, seconds }; omit to use pendingOffline(). A passed-in info is a preview (pays cash directly). */
  function showWelcome(info) {
    const preview = !!info;
    info = info || pendingOffline();
    if (!info || welcome.isOpen) return false;
    const body = html(`
      <div class="wb">
        <p class="wb-sub">Your crew kept the garage running while you were away</p>
        <div class="wb-amt">${ICON.cash}<b>$${fmt(info.amount)}</b></div>
        <p class="wb-away">Away for ${away(info.seconds)}</p>
      </div>`);
    const take = html(`<button class="btn big teal pressable pulse" data-ui>${ICON.cash}<span>Collect</span></button>`);
    const dbl = html(`<button class="btn big coral pressable" data-ui><span>Double for</span>${ICON.gem}<b>${DOUBLE_GEMS}</b></button>`);
    dbl.disabled = state.gems < DOUBLE_GEMS;
    const pay = (mult) => {
      const amt = preview ? (addCash(Math.round(info.amount * mult)), Math.round(info.amount * mult)) : claimOffline(mult);
      welcome.close();
      sfx('cash'); toast(`+$${fmt(amt)}`);
    };
    take.addEventListener('click', () => pay(1));
    dbl.addEventListener('click', () => {
      if (state.gems < DOUBLE_GEMS) { sfx('error'); return; }
      addGems(-DOUBLE_GEMS); pay(2);
    });
    welcome.body.replaceChildren(body, take, dbl);
    welcome.open();
    sfx('unlock');
    return true;
  }
  welcome.onOpen = () => { flags.welcome = true; refreshInput(); };
  welcome.onClose = () => { flags.welcome = false; refreshInput(); };
  // shown once after the title is dismissed (or right away for returning players: index.js emits ui:play)
  let welcomeShown = false;
  events.on('ui:play', () => {
    if (welcomeShown) return;
    welcomeShown = true;
    if (pendingOffline()) setTimeout(() => showWelcome(), 350);
  });
  // back from the background with offline earnings (main.js). Before the first ui:play the handler above shows it.
  events.on('app:resume', () => { if (welcomeShown) setTimeout(() => showWelcome(), 350); });

  const town = buildTownPanels(hud);
  // Escape hatch for the pause menu: close town panels when the game is paused
  return {
    ...town,
    showWelcome,
    openMissions() { sfx('click'); missions.open(); },
    openShop() { sfx('click'); shop.open(); },
    openPause() { pause.open(); },
    /** The board opens itself while you stand on a board pad; there is nothing to open from elsewhere. */
    openUpgrades: () => {},
    closeUpgrades: () => board.close(),
    showComplete,
    isPauseOpen: () => pause.isOpen,
    closePause: () => pause.close(),
  };
}
