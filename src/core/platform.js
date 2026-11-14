// Native app integration (Capacitor, iOS). In a normal browser every export here is a no-op or falls back to
// plain web APIs, so the web build behaves exactly as before.
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

// ---- storage ----
// The game reads and writes localStorage synchronously. iOS may wipe a web view's localStorage when the device is
// low on space, so in the app every key below is mirrored to native storage (Preferences = UserDefaults) and
// restored into localStorage on launch, before anything reads it.
const MIRRORED_KEYS = ['wrench-bay-save-v1', 'wrench-bay-sound'];
let prefs = null;

async function restoreStorage() {
  ({ Preferences: prefs } = await import('@capacitor/preferences'));
  for (const key of MIRRORED_KEYS) {
    const { value } = await prefs.get({ key });
    if (value !== null) {
      try { localStorage.setItem(key, value); } catch { /* ignore */ }
    } else {
      // first launch after an update that added mirroring: copy the existing web value over
      let local = null;
      try { local = localStorage.getItem(key); } catch { /* ignore */ }
      if (local !== null) await prefs.set({ key, value: local });
    }
  }
}

/** Mirror a localStorage write to native storage (value null = removed). No-op in the browser. */
export function persist(key, value) {
  if (!prefs) return;
  (value === null ? prefs.remove({ key }) : prefs.set({ key, value })).catch(() => {});
}

// ---- haptics ----
// Only for what the player does (see sfx() in ui/audio.js). Piles filling ('coin') never buzz; collecting them
// ('cash') does.
const HAPTICS = {
  click: 'selection', pickup: 'light', drop: 'light', cash: 'light', trash: 'light',
  lift: 'medium', fix: 'medium', upgrade: 'medium',
  unlock: 'success', done: 'success', vip: 'success',
  error: 'error',
};
const RANK = { selection: 0, light: 1, medium: 2, success: 3, error: 3 };
const HAPTIC_GAP = 80;   // ms: taps closer than this blur into one buzz
let haptics = null, lastTapAt = -1e9, lastTapRank = -1;

/** Tap feedback for a sound effect name (see ui/audio.js). Native only. */
export function haptic(name) {
  const kind = haptics && HAPTICS[name];
  if (!kind) return;
  // one tap at a time: inside the gap only a stronger one gets through (the "done" right after the last "fix")
  const now = performance.now(), rank = RANK[kind];
  if (now - lastTapAt < HAPTIC_GAP && rank <= lastTapRank) return;
  lastTapAt = now; lastTapRank = rank;
  const { Haptics, ImpactStyle, NotificationType } = haptics;
  const p = kind === 'selection' ? Haptics.selectionChanged()
    : kind === 'light' ? Haptics.impact({ style: ImpactStyle.Light })
    : kind === 'medium' ? Haptics.impact({ style: ImpactStyle.Medium })
    : Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Error });
  p.catch(() => {});
}

// ---- app lifecycle ----
/**
 * fns.hidden() runs when the app goes to the background (or the browser tab is hidden / closed),
 * fns.visible() when it comes back. Each fires once per transition.
 */
export function onLifecycle({ hidden, visible }) {
  let isHidden = document.hidden;
  const set = (h) => {
    if (h === isHidden) return;
    isHidden = h;
    (h ? hidden : visible)?.();
  };
  document.addEventListener('visibilitychange', () => set(document.hidden));
  window.addEventListener('pagehide', () => set(true));
  window.addEventListener('pageshow', () => set(document.hidden));
  if (isNative) {
    import('@capacitor/app').then(({ App }) => {
      App.addListener('pause', () => set(true));
      App.addListener('resume', () => set(false));
    });
  }
}

// ---- splash screen ----
let splashHidden = false;
/** Fade out the native launch screen once the first frame is on screen. No-op in the browser. */
export function hideSplash() {
  if (!isNative || splashHidden) return;
  splashHidden = true;
  import('@capacitor/splash-screen').then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 250 }));
}

/** Call (and await) before anything reads saved data. */
export async function initPlatform() {
  if (!isNative) return;
  document.documentElement.classList.add('native');
  setTimeout(hideSplash, 5000); // never leave the splash up if booting fails
  try { await restoreStorage(); } catch (err) { console.error('[wrench-bay] restoring saves failed', err); }
  try { haptics = await import('@capacitor/haptics'); } catch { /* ignore */ }
}
