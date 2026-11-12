// Is the dev tool on? Tiny on purpose: main.js imports it in every build, the tool itself is a lazy chunk.
//   ?dev        turns it on and remembers it (localStorage), so reloads and the iOS app keep it
//   ?dev=0      turns it off again (tuning overrides stop applying; they are kept for next time)
//   ?nohud      loads it with the clean screen on (no HUD, no labels), for screenshots and recordings
//   holding the cash pill for 3 s turns it on where you cannot type a URL (the iOS app)
const KEY = 'wrench-bay-dev:on';

export function devFlag() {
  const q = new URLSearchParams(location.search);
  let on = false;
  try {
    if (q.has('dev')) {
      on = q.get('dev') !== '0';
      if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY);
    } else on = localStorage.getItem(KEY) === '1';
  } catch { /* storage blocked: URL only */ }
  return on || q.has('nohud');
}

export function setDevFlag(on) {
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Hold the cash pill for 3 s: calls onArm() once (main.js then loads the tool). */
export function armDevGesture(onArm) {
  let timer = 0;
  const cancel = () => { clearTimeout(timer); timer = 0; };
  const down = (e) => {
    if (!e.target.closest?.('.cash-pill')) return;
    cancel();
    timer = setTimeout(() => {
      window.removeEventListener('pointerdown', down, true);
      setDevFlag(true);
      onArm();
    }, 3000);
  };
  window.addEventListener('pointerdown', down, true);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) window.addEventListener(ev, cancel, true);
}
