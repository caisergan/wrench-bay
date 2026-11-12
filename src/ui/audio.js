// WebAudio synthesised SFX. No audio files.
const KEY = 'wrench-bay-sound';
let ctx = null, master = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === 'off'; } catch { /* ignore */ }

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
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

export const isMuted = () => muted;
export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem(KEY, muted ? 'off' : 'on'); } catch { /* ignore */ }
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
  osc.connect(g); g.connect(master);
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
  src.connect(f); f.connect(g); g.connect(master);
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
};
const MIN_GAP = { pickup: 60, pay: 60, coin: 45, drop: 50, cash: 80, click: 40, wrench: 90, honk: 200, engine: 250, lift: 300, fix: 80 };
const last = {};

export function sfx(name) {
  if (muted) return;
  const fn = SOUNDS[name];
  if (!fn) return;
  const now = performance.now();
  if (now - (last[name] || 0) < (MIN_GAP[name] || 30)) return;
  last[name] = now;
  if (!ensure()) return;
  if (ctx.state !== 'running') { ctx.resume().catch(() => {}); if (ctx.state !== 'running') return; }
  try { fn(jit(name === 'pay' ? 0.1 : 0.05)); } catch { /* ignore */ }
}
