// Dev-only: ?uitest spawns samples of every label kind in every state, toasts, float texts, streak, driving hint and sfx
// once PLAY is pressed. Use with ?nogame&uitest. Console: window.__ui = { ui, events, state, addCash, addGems }.
import * as THREE from 'three';
import { events } from '../core/events.js';
import { addCash, addGems, state } from '../core/state.js';
import { onUpdate } from '../core/engine.js';

export function run(ui) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  window.__ui = { ui, events, state, addCash, addGems };
  events.on('ui:play', () => {
    // ---- job bubbles: 1..4 jobs, mixed states, VIP, patience bands ----
    const J = (type, s) => ({ type, state: s });
    const jobs = [
      { pos: V(-4.3, 2.4, -3), jobs: [J('tire', 'need')], pat: 0.9 },
      { pos: V(-1.4, 2.4, -3), jobs: [J('tire', 'ready'), J('oil', 'need')], pat: 0.7, prog: 0.5, live: true },
      { pos: V(1.6, 2.4, -3), jobs: [J('battery', 'done'), J('engine', 'ready'), J('paint', 'need')], pat: 0.4, prog: 0.3, live: true },
      { pos: V(4.4, 2.4, -3), jobs: [J('tire', 'done'), J('oil', 'done'), J('battery', 'ready'), J('engine', 'need')], pat: 0.2, prog: 0.8 },
      { pos: V(-4.3, 2.4, 0), jobs: [J('paint', 'need'), J('engine', 'need')], pat: 0.55, vip: true },
      { pos: V(-1.4, 2.4, 0), jobs: [J('engine', 'ready'), J('oil', 'done'), J('tire', 'need')], pat: 0.15, vip: true, prog: 0.6 },
      { pos: V(1.6, 2.4, 0), jobs: [J('oil', 'need'), J('oil', 'need')], pat: 0 },
      { pos: V(4.4, 2.4, 0), jobs: [J('tire', 'done'), J('battery', 'done')], pat: 1, noPat: true },
    ];
    const live = [];
    for (const j of jobs) {
      const l = ui.label({ kind: 'job', worldPos: j.pos });
      l.setJobs(j.jobs).setVip(!!j.vip);
      if (!j.noPat) l.setPatience(j.pat);
      if (j.prog) l.setProgress(j.prog);
      if (j.live) live.push({ l, j });
    }
    // a pooled-label reset check: this one is removed and reused by the next
    const tmp = ui.label({ kind: 'job', worldPos: V(0, 2.4, 6) });
    tmp.setJobs([{ type: 'paint', state: 'ready' }]).setVip(true).setPatience(0.1).setProgress(0.5);
    tmp.remove();
    const reused = ui.label({ kind: 'job', worldPos: V(-4.3, 2.4, 3) });
    reused.setJobs([J('engine', 'need'), J('battery', 'need')]);   // must look plain: no vip, no bars

    // ---- other kinds ----
    const price = ui.label({ kind: 'price', text: '$1.3K', worldPos: V(-1.5, 0.3, 3) });
    const price2 = ui.label({ kind: 'price', text: 950, worldPos: V(1.8, 0.3, 3.5) });
    ui.label({ kind: 'max', text: 'MAX', worldPos: V(3.4, 2.4, 3) });
    ui.label({ kind: 'info', text: 'No free lift!', worldPos: V(-3.5, 2.4, 5) });
    const stations = ['tire', 'oil', 'battery', 'engine', 'paint'].map((t, i) =>
      ui.label({ kind: 'station', icon: t, text: String(i % 4 + 1), worldPos: V(-3.8 + i * 1.9, 1.6, 7) }));
    stations[4].setText('MAX');
    ['happy', 'angry', 'wait', 'star'].forEach((e, i) => ui.label({ kind: 'emote', text: e, worldPos: V(-3.5 + i * 2.4, 2.2, 9) }));
    const hidden = ui.label({ kind: 'info', text: 'hidden', worldPos: V(3, 2, 0) });
    hidden.setVisible(false);

    let t = 0;
    onUpdate((dt) => {
      t += dt;
      const p = (t * 0.25) % 1;
      price.setProgress(p); price2.setProgress(1 - p);
      live.forEach(({ l, j }, i) => {
        l.setProgress((t * 0.4 + i * 0.37) % 1);
        l.setPatience(Math.max(0, j.pat - (t % 20) * 0.03));
      });
    });

    // ---- toasts ----
    ui.toast('New lift!');
    ui.toast('Battery swaps unlocked!');
    ui.toast('Mechanic hired!');

    // ---- float texts, streak chip, driving hint, sfx ----
    const sfxList = ['pickup', 'drop', 'cash', 'coin', 'pay', 'click', 'upgrade', 'error', 'unlock',
      'engine', 'honk', 'lift', 'wrench', 'fix', 'done', 'vip', 'trash'];
    let n = 0, streak = 0;
    setInterval(() => {
      ui.floatText(V(-0.5, 1, 4.5), '+$24', 'cash');
      ui.floatText(V(0.8, 1, 4.9), '+1', 'gem');
      ui.floatText(V(-2, 1, 4.9), '-$30', 'neg');
      ui.floatText(V(2.2, 1, 4.5), 'Speedy!', 'good');
      ui.sfx(sfxList[n++ % sfxList.length]);
    }, 1800);
    setInterval(() => {
      streak = streak >= 6 ? 0 : streak + 1;
      events.emit('streak:changed', { streak, mult: 1 + Math.min(streak, 10) * 0.05 });
    }, 2200);
    let driving = false;
    setInterval(() => { driving = !driving; events.emit(driving ? 'drive:start' : 'drive:end'); }, 4500);
  });
}
