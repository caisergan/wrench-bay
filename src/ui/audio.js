// WebAudio synthesised SFX. No audio files.
import { haptic, persist } from '../core/platform.js';

const KEY = 'wrench-bay-sound';
let ctx = null, master = null, noiseBuf = null;
// where tone() / noise() connect while one sound plays: master, or that sound's own placement chain (see place())
let out = null;
// Read lazily: in the iOS app saved settings are restored into localStorage after this module loads.
let muted = null;
function readMuted() {
  if (muted === null) {
    try { muted = localStorage.getItem(KEY) === 'off'; } catch { muted = false; }
  }
  return muted;
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  // iOS: play as "ambient" audio – obeys the silent switch and mixes with the player's own music.
  try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* ignore */ }
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  const len = ctx.sampleRate * 0.5;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Call from a user gesture. */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state !== 'running') c.resume().catch(() => {});
}

/** Pause the audio clock while the game is in the background. */
export function suspendAudio() {
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
}
/** Resume after suspendAudio(). If iOS still blocks it, the next tap resumes it (unlockAudio). */
export function resumeAudio() {
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
}

export const isMuted = () => readMuted();
export function setMuted(m) {
  muted = !!m;
  const v = muted ? 'off' : 'on';
  try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
  persist(KEY, v);
}

// tone(freq, dur, {type, vol, to (end freq), at (delay s), a (attack s)})
function tone(freq, dur, o = {}) {
  const t0 = ctx.currentTime + (o.at || 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  const v = o.vol ?? 0.3, a = o.a ?? 0.006;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(out || master);
  osc.start(t0); osc.stop(t0 + dur + 0.03);
}
function noise(dur, o = {}) {
  const t0 = ctx.currentTime + (o.at || 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = o.filter || 'bandpass';
  f.frequency.value = o.freq || 2000;
  f.Q.value = o.q || 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.15, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(out || master);
  src.start(t0, Math.random() * 0.3); src.stop(t0 + dur + 0.02);
}

const jit = (amt = 0.06) => 1 + (Math.random() * 2 - 1) * amt;

const SOUNDS = {
  pickup(p) { tone(480 * p, 0.09, { to: 760 * p, vol: 0.22, type: 'triangle' }); },
  drop(p) { tone(260 * p, 0.12, { to: 150 * p, vol: 0.3, type: 'triangle' }); noise(0.05, { freq: 700, vol: 0.08 }); },
  cash(p) {
    tone(988 * p, 0.12, { vol: 0.2, type: 'triangle' });
    tone(1319 * p, 0.28, { vol: 0.22, type: 'triangle', at: 0.07 });
    noise(0.05, { freq: 5000, q: 2, vol: 0.06 });
  },
  coin(p) { tone(1250 * p, 0.07, { vol: 0.16, type: 'square' }); tone(1850 * p, 0.14, { vol: 0.14, type: 'square', at: 0.05 }); },
  unlock(p) {
    [523, 659, 784, 1047].forEach((f, i) => tone(f * p, 0.22, { vol: 0.22, type: 'triangle', at: i * 0.085 }));
    tone(1568 * p, 0.45, { vol: 0.12, at: 0.34 });
  },
  pay(p) { tone(760 * p, 0.035, { vol: 0.14, type: 'triangle' }); noise(0.025, { freq: 3500, q: 3, vol: 0.05 }); },
  click(p) { tone(620 * p, 0.05, { to: 480 * p, vol: 0.18 }); },
  upgrade(p) {
    tone(400 * p, 0.3, { to: 900 * p, vol: 0.18, type: 'triangle' });
    tone(1200 * p, 0.3, { vol: 0.16, at: 0.18 });
    tone(1600 * p, 0.4, { vol: 0.12, at: 0.26 });
  },
  error(p) { tone(210 * p, 0.14, { to: 150 * p, vol: 0.2, type: 'square' }); tone(180 * p, 0.18, { to: 120 * p, vol: 0.18, type: 'square', at: 0.11 }); },
  // ---- Wrench Bay ----
  engine(p) {
    // little starter cough, then a rising rev
    tone(70 * p, 0.22, { to: 120 * p, vol: 0.2, type: 'sawtooth', a: 0.02 });
    noise(0.2, { freq: 260, q: 0.8, vol: 0.1 });
    tone(110 * p, 0.34, { to: 230 * p, vol: 0.17, type: 'sawtooth', at: 0.2, a: 0.03 });
    tone(220 * p, 0.2, { to: 300 * p, vol: 0.06, type: 'triangle', at: 0.3 });
  },
  honk(p) {
    // cute double beep
    for (const at of [0, 0.15]) {
      tone(420 * p, 0.11, { vol: 0.13, type: 'square', at });
      tone(530 * p, 0.11, { vol: 0.1, type: 'square', at });
    }
  },
  lift(p) {
    // hydraulic whirr: filtered noise + a gliding hum
    noise(0.55, { freq: 700, q: 2.5, vol: 0.09 });
    tone(110 * p, 0.55, { to: 170 * p, vol: 0.12, type: 'sawtooth', a: 0.08 });
    tone(55 * p, 0.55, { to: 85 * p, vol: 0.14, type: 'sine', a: 0.08 });
    tone(520 * p, 0.07, { vol: 0.07, type: 'triangle', at: 0.5 });
  },
  wrench(p) { tone(1500 * p, 0.03, { to: 950 * p, vol: 0.05, type: 'square', a: 0.002 }); noise(0.022, { freq: 4200, q: 4, vol: 0.035 }); },
  fix(p) {
    tone(1047 * p, 0.12, { vol: 0.18, type: 'triangle' });
    tone(1568 * p, 0.32, { vol: 0.17, type: 'triangle', at: 0.07 });
    tone(2093 * p, 0.2, { vol: 0.05, at: 0.1 });
  },
  done(p) {
    [523, 659, 784].forEach((f, i) => tone(f * p, 0.16, { vol: 0.2, type: 'triangle', at: i * 0.09 }));
    tone(1047 * p, 0.42, { vol: 0.2, type: 'triangle', at: 0.28 });
    tone(1319 * p, 0.42, { vol: 0.1, type: 'sine', at: 0.28 });
    noise(0.06, { freq: 5500, q: 2, vol: 0.05, at: 0.28 });
  },
  vip(p) {
    [1319, 1568, 1976, 2349, 2637].forEach((f, i) => tone(f * p, 0.18, { vol: 0.1, type: 'sine', at: i * 0.055 }));
    tone(1047 * p, 0.5, { vol: 0.1, type: 'triangle', at: 0.05 });
    noise(0.12, { freq: 7000, q: 3, vol: 0.04, at: 0.1 });
  },
  trash(p) {
    noise(0.18, { freq: 1100, q: 0.7, vol: 0.12 });
    tone(300 * p, 0.2, { to: 110 * p, vol: 0.18, type: 'triangle' });
    tone(180 * p, 0.14, { to: 90 * p, vol: 0.14, type: 'triangle', at: 0.1 });
  },
  // ---- Harbor Town ----
  spray(p) { noise(0.34, { freq: 6200, q: 0.5, vol: 0.09 }); noise(0.34, { freq: 3000, q: 0.7, vol: 0.04, filter: 'highpass' }); },
  cure(p) {
    // warm lamps coming on: a soft rising hum and a few ticks of heating metal
    tone(180 * p, 0.55, { to: 260 * p, vol: 0.09, type: 'sine', a: 0.1 });
    tone(360 * p, 0.55, { to: 520 * p, vol: 0.04, type: 'triangle', a: 0.12 });
    [0.1, 0.27, 0.41].forEach((at) => noise(0.02, { freq: 4800, q: 4, vol: 0.04, at }));
  },
  wash(p) {
    noise(0.7, { freq: 1700, q: 0.4, vol: 0.1 });
    noise(0.7, { freq: 900, q: 0.8, vol: 0.05, at: 0.05 });
    [0, 0.13, 0.31, 0.46].forEach((at, i) => tone((700 + i * 160) * p, 0.07, { to: (1100 + i * 140) * p, vol: 0.05, at }));
  },
  polish(p) {
    for (const at of [0, 0.13]) {
      tone(1700 * p, 0.11, { to: 2500 * p, vol: 0.05, type: 'triangle', at, a: 0.01 });
      noise(0.1, { freq: 5200, q: 3, vol: 0.025, at });
    }
  },
  winch(p) {
    tone(80 * p, 0.55, { to: 105 * p, vol: 0.13, type: 'sawtooth', a: 0.05 });
    for (let i = 0; i < 6; i++) tone(520 * p, 0.025, { to: 380 * p, vol: 0.06, type: 'square', at: i * 0.085, a: 0.002 });
    noise(0.5, { freq: 450, q: 1.5, vol: 0.05 });
  },
  radio(p) {
    noise(0.1, { freq: 2600, q: 0.8, vol: 0.07 });
    tone(880 * p, 0.07, { vol: 0.08, type: 'square', at: 0.09 });
    tone(1180 * p, 0.09, { vol: 0.08, type: 'square', at: 0.17 });
    noise(0.08, { freq: 2200, q: 0.8, vol: 0.05, at: 0.27 });
  },
  fame(p) {
    [659, 880, 1175, 1568].forEach((f, i) => { tone(f * p, 0.26, { vol: 0.15, type: 'triangle', at: i * 0.075 }); tone(f * 2 * p, 0.3, { vol: 0.04, at: i * 0.075 + 0.02 }); });
    tone(2093 * p, 0.6, { vol: 0.07, at: 0.34 });
    noise(0.14, { freq: 7500, q: 3, vol: 0.035, at: 0.3 });
  },
  build(p) {
    for (const at of [0, 0.17]) {
      tone(200 * p, 0.09, { to: 85 * p, vol: 0.25, type: 'triangle', at });
      noise(0.04, { freq: 1500, q: 2, vol: 0.1, at });
    }
  },
  gate(p) {
    tone(150 * p, 0.35, { to: 95 * p, vol: 0.15, type: 'sawtooth', a: 0.02 });
    for (let i = 0; i < 5; i++) noise(0.05, { freq: 2400 + i * 300, q: 5, vol: 0.06, at: 0.05 + i * 0.06 });
    tone(330 * p, 0.2, { vol: 0.07, type: 'triangle', at: 0.38 });
  },
  thud(p) { tone(130 * p, 0.2, { to: 55 * p, vol: 0.35, type: 'sine', a: 0.003 }); noise(0.08, { freq: 300, q: 0.7, vol: 0.12, filter: 'lowpass' }); },
  // spray booth doors: bi-fold leaves rolling along the top track, meeting on their seals, the latch; opening: the
  // seal lets go with a breath of air, the latch, the rollers; the north sliding doors: a soft glide
  boothShut(p) {
    noise(1.0, { freq: 520, q: 1.2, vol: 0.05 });
    tone(92 * p, 0.95, { to: 70 * p, vol: 0.045, type: 'triangle', a: 0.12 });
    tone(118 * p, 0.18, { to: 58 * p, vol: 0.2, type: 'sine', at: 1.1, a: 0.004 });
    noise(0.06, { freq: 800, q: 0.8, vol: 0.08, at: 1.1, filter: 'lowpass' });
    tone(1400 * p, 0.035, { vol: 0.045, type: 'square', at: 1.2 });
  },
  boothOpen(p) {
    noise(0.2, { freq: 3800, q: 0.6, vol: 0.05 });
    tone(1250 * p, 0.035, { vol: 0.045, type: 'square', at: 0.03 });
    noise(0.75, { freq: 520, q: 1.2, vol: 0.05, at: 0.1 });
    tone(78 * p, 0.7, { to: 98 * p, vol: 0.045, type: 'triangle', at: 0.1, a: 0.12 });
  },
  // the player's paint suit: coverall rustling up the legs, the zip, the respirator strap; off: zip down, rustle
  suitUp(p) {
    noise(0.3, { freq: 2600, q: 0.7, vol: 0.06 });
    noise(0.24, { freq: 3400, q: 0.9, vol: 0.05, at: 0.36 });
    tone(900 * p, 0.16, { to: 2300 * p, vol: 0.035, type: 'sawtooth', at: 0.52, a: 0.01 });
    noise(0.16, { freq: 5200, q: 2, vol: 0.03, at: 0.52 });
    tone(520 * p, 0.05, { vol: 0.06, type: 'triangle', at: 0.84 });
  },
  suitOff(p) {
    tone(2100 * p, 0.14, { to: 900 * p, vol: 0.03, type: 'sawtooth', a: 0.01 });
    noise(0.14, { freq: 5000, q: 2, vol: 0.025 });
    noise(0.34, { freq: 2400, q: 0.7, vol: 0.05, at: 0.18 });
  },
  slideDoor(p) { noise(0.34, { freq: 1500, q: 0.6, vol: 0.03 }); tone(150 * p, 0.32, { to: 118 * p, vol: 0.03, type: 'sine', a: 0.05 }); },
  horn(p) {
    tone(330 * p, 0.42, { vol: 0.09, type: 'sawtooth', a: 0.02 });
    tone(415 * p, 0.42, { vol: 0.08, type: 'sawtooth', a: 0.02 });
  },
  bell(p) {
    tone(1568 * p, 0.7, { vol: 0.13, type: 'sine' });
    tone(2349 * p, 0.45, { vol: 0.06, type: 'sine' });
    tone(3136 * p, 0.25, { vol: 0.03, type: 'sine' });
  },
  gull(p) {
    tone(1500 * p, 0.28, { to: 2000 * p, vol: 0.06, type: 'triangle', a: 0.04 });
    tone(2000 * p, 0.3, { to: 1350 * p, vol: 0.06, type: 'triangle', at: 0.26, a: 0.02 });
    tone(1300 * p, 0.22, { to: 1700 * p, vol: 0.04, type: 'triangle', at: 0.52, a: 0.02 });
  },
  coins(p) { for (let i = 0; i < 6; i++) { const f = 1900 + Math.random() * 1500; tone(f * p, 0.08, { vol: 0.09, type: 'square', at: i * 0.05 }); tone(f * 1.5 * p, 0.12, { vol: 0.05, type: 'square', at: i * 0.05 + 0.03 }); } },
  perfect(p) {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f * p, 0.3, { vol: 0.17, type: 'triangle', at: i * 0.075 }));
    [1568, 1976, 2349].forEach((f, i) => tone(f * p, 0.5, { vol: 0.07, at: 0.38 + i * 0.07 }));
    tone(262 * p, 0.7, { vol: 0.12, type: 'sine', at: 0.38 });
    noise(0.2, { freq: 7200, q: 3, vol: 0.05, at: 0.4 });
  },
  ferry(p) {
    tone(112 * p, 1.0, { vol: 0.17, type: 'sawtooth', a: 0.08 });
    tone(141 * p, 1.0, { vol: 0.13, type: 'sawtooth', a: 0.08 });
    tone(56 * p, 1.0, { vol: 0.14, type: 'sine', a: 0.08 });
  },
};
const MIN_GAP = { pickup: 60, pay: 60, coin: 45, drop: 50, cash: 80, click: 40, wrench: 90, honk: 200, engine: 250, lift: 300, fix: 80, spray: 200, wash: 300, polish: 150, winch: 300, radio: 400, gull: 600, coins: 120, thud: 100, build: 160, bell: 200, horn: 250, boothShut: 400, boothOpen: 400, slideDoor: 250, suitUp: 500, suitOff: 500 };
const last = {}, lastHaptic = {};

/** A sound away from the screen centre: quieter, duller (the highs die first with distance) and from its side. */
function place(vol, pan) {
  const g = ctx.createGain();
  g.gain.value = vol;
  let tail = g;
  if (vol < 0.999) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900 + 15000 * vol * vol; f.Q.value = 0.5;
    tail.connect(f); tail = f;
  }
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    tail.connect(p); tail = p;
  }
  tail.connect(master);
  setTimeout(() => g.disconnect(), 3000);   // the longest sound is ~1.3 s
  return g;
}

/**
 * Play a sound effect and its haptic. In the world use ctx.sfxAt(name, pos, mine), which fills `o` in:
 * o.vol 0..1 (fades past the screen edge), o.pan -1..1 (left / right), o.haptic false = sound only.
 * Only what the player does may buzz the phone: staff, customers, traffic and piles filling pass haptic: false.
 */
export function sfx(name, o) {
  const fn = SOUNDS[name];
  if (!fn) return;
  const now = performance.now(), gap = MIN_GAP[name] || 30;
  // iOS app only; independent of the sound setting. Its own throttle, so a far-off mechanic's sound can't eat it.
  if (o?.haptic !== false && now - (lastHaptic[name] || 0) >= gap) { lastHaptic[name] = now; haptic(name); }
  const vol = o?.vol ?? 1;
  if (vol < 0.02 || now - (last[name] || 0) < gap) return;
  last[name] = now;
  if (readMuted()) return;
  if (!ensure()) return;
  if (ctx.state !== 'running') { ctx.resume().catch(() => {}); if (ctx.state !== 'running') return; }
  try {
    out = vol < 0.999 || o?.pan ? place(vol, o?.pan || 0) : master;
    fn(jit(name === 'pay' ? 0.1 : 0.05));
  } catch { /* ignore */ } finally { out = master; }
}
