// Dev tool tabs about the tool itself and the save: Tune (balance numbers), View (clean screen), Save.
import { html } from '../ui/format.js';
import * as A from './actions.js';
import * as TU from './tuning.js';
import * as V from './view.js';
import { setDevFlag } from './flag.js';
import { state } from '../core/state.js';
import {
  card, row, withIcon, btn, confirmBtn, chips, toggle, stepper, numInput, text, note, plain, icon, syncAll, track, DICON,
} from './kit.js';

// ================================================================ TUNE
const tuneUI = { open: new Set(['economy']), query: '' };
const LIMIT = 150;

function tuneRow(r, showTable = false) {
  const el = html(`<div class="dv-trow"><div class="dv-tl"><small></small><b></b></div><span class="dv-def"></span><button class="dv-rst pressable" data-ui aria-label="Reset">${DICON.reset}</button></div>`);
  const sm = el.querySelector('small');
  const where = showTable ? [r.table, r.where].filter(Boolean).join(' · ') : r.where;
  if (where) sm.textContent = where; else sm.remove();
  el.querySelector('b').textContent = r.key;
  const def = el.querySelector('.dv-def'), rst = el.querySelector('.dv-rst');
  const inp = numInput(() => TU.valueOf(r.path), (v) => TU.setValue(r.path, r.int ? Math.round(v) : v), { width: 92 });
  el.insertBefore(inp, def);
  rst.addEventListener('click', (e) => { e.stopPropagation(); TU.resetValue(r.path); syncAll(); });
  track(() => {
    const on = TU.isTuned(r.path);
    el.classList.toggle('tuned', on);
    def.textContent = on ? 'was ' + plain(TU.defaultOf(r.path)) : '';
    rst.hidden = !on;
  });
  el.title = r.path;
  return el;
}

export function tabTune(body, { flash }) {
  const top = card('Balance tuning', 'gauge', 'Every number of the economy, live');
  top.right.append(text(() => `${TU.tunedCount()} tuned`, 'dv-val'));
  const search = html(`<label class="dv-search">${DICON.search}<input class="dv-in" type="search" placeholder="Search: price, patience, tow …" autocomplete="off" spellcheck="false" data-ui></label>`);
  const q = search.querySelector('input');
  q.value = tuneUI.query;
  top.body.append(search, chips([
    { label: 'Reset all', icon: 'x', onClick: () => { TU.resetAll(); flash('All tuning back to the config'); syncAll(); } },
    { label: 'Rebuild world', onClick: () => { A.rebuild(0); } },
  ]), note('Most numbers apply at once. Prices already on pads, built things and staff need "Rebuild world". Overrides stay on this device until reset.'));
  body.append(top.el);

  const list = html('<div class="dv-tlist"></div>');
  body.append(list);
  const render = () => {
    list.textContent = '';
    const query = tuneUI.query.trim().toLowerCase();
    if (query) {
      const terms = query.split(/\s+/);
      const hits = TU.allRows().filter((r) => { const s = `${r.path} ${r.where} ${r.key}`.toLowerCase(); return terms.every((t) => s.includes(t)); });
      const c = card(`${hits.length} match${hits.length === 1 ? '' : 'es'}`, 'search');
      hits.slice(0, LIMIT).forEach((r) => c.body.append(tuneRow(r, true)));
      if (hits.length > LIMIT) c.body.append(note(`Showing the first ${LIMIT}: narrow the search.`));
      if (!hits.length) c.body.append(note('Nothing matches.'));
      list.append(c.el);
      return;
    }
    for (const g of TU.GROUPS) {
      const rows = TU.groupRows(g.id);
      const open = tuneUI.open.has(g.id);
      const sec = html(`<section class="dv-card dv-acc ${open ? 'open' : ''}"><button class="dv-acch pressable" data-ui><span class="dv-ci">${icon(g.icon)}</span><h3></h3><em></em><span class="dv-chev">${DICON.chevron}</span></button><div class="dv-cb"></div></section>`);
      sec.querySelector('h3').textContent = g.label;
      const em = sec.querySelector('em');
      track(() => { const n = rows.filter((r) => TU.isTuned(r.path)).length; em.textContent = n ? `${n} tuned` : `${rows.length}`; em.classList.toggle('on', n > 0); });
      sec.querySelector('.dv-acch').addEventListener('click', (e) => {
        e.stopPropagation();
        if (tuneUI.open.has(g.id)) tuneUI.open.delete(g.id); else tuneUI.open.add(g.id);
        render();
      });
      if (open) {
        const b = sec.querySelector('.dv-cb');
        let table = null;
        for (const r of rows) {
          if (g.tables.length > 1 && r.table !== table) { table = r.table; b.append(html(`<h4 class="dv-th">${table}</h4>`)); }
          b.append(tuneRow(r));
        }
      }
      list.append(sec);
    }
  };
  let t = 0;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { tuneUI.query = q.value; render(); }, 160); });
  render();
}

// ================================================================ VIEW
export function tabView(body, { prefs, savePrefs, flash }) {
  const clean = card('No HUD', 'eye', 'A clean screen for screenshots and recordings');
  clean.body.append(
    row(withIcon('eye', 'Clean screen'), 'Hide everything below at once (hotkey H)', toggle(V.isClean, V.setClean, 'Clean screen')),
    ...V.LAYERS.map((l) => row(withIcon(l.icon, l.label), l.sub, toggle(() => V.isHidden(l.id), (on) => V.setHidden(l.id, on), l.label))),
    row('Invisible DEV button', 'With the HUD hidden, the DEV button turns invisible but still works in the same spot',
      toggle(() => prefs.ghost, (on) => { prefs.ghost = on; savePrefs(); }, 'Invisible DEV button')),
    note('Start clean with ?nohud in the URL.'),
  );
  const cam = card('Camera', 'camera');
  cam.body.append(
    row('Zoom', 'Pulls the follow camera back (vehicles reset it)', stepper(V.getZoom, V.setZoom, { min: 0.5, max: 3, step: 0.25, fmt: (v) => v.toFixed(2) + 'x' })),
    chips([0.75, 1, 1.5, 2, 3].map((z) => ({ label: z + 'x', on: () => V.getZoom() === z, onClick: () => V.setZoom(z) }))),
    row(withIcon('camera', 'Snapshot'), 'PNG of the 3D view only (never the HUD)', btn('Save PNG', () => { try { V.snapshot(); } catch { flash('Snapshot failed'); } })),
  );
  const perf = card('Performance', 'gauge');
  perf.body.append(row('Perf meter', 'FPS, worst frame, draw calls, triangles, memory, cars', toggle(V.meterOn, (on) => { V.setMeter(on); prefs.meter = on; savePrefs(); }, 'Perf meter')));
  const keys = card('Keyboard', 'gear', 'Desktop shortcuts (not while typing)');
  for (const [k, what] of [['`', 'Open / close the dev tools'], ['H', 'Clean screen on / off'], ['P', 'Pause / resume the world'], ['[  ]', 'Game speed down / up']]) {
    keys.body.append(row(`<kbd class="dv-kbd">${k}</kbd>`, null, text(() => what, 'dv-kd')));
  }
  body.append(clean.el, cam.el, perf.el, keys.el);
}

// ================================================================ SAVE
export function tabSave(body, { flash, rerender }) {
  const slot = new URLSearchParams(location.search).get('save');
  const cur = card('This save', 'disk');
  cur.body.append(
    row(slot ? `Slot "${slot}"` : 'Default slot', slot ? 'Separate save for this tab (?save=…)' : 'Add ?save=name to the URL for a separate one'),
    text(() => A.summary(), 'dv-note'),
  );
  // ---- presets
  const pre = card('Jump to a stage', 'flag', 'Replaces this save, then reloads');
  for (const p of A.PRESETS) pre.body.append(row(withIcon(p.icon, p.label), p.sub, confirmBtn('Load', () => A.applyPreset(p.id), 'teal')));
  // ---- snapshots
  const sn = card('Snapshots', 'camera', 'Saves kept on this device');
  const name = html('<input class="dv-in dv-grow" type="text" placeholder="Name (optional)" autocomplete="off" spellcheck="false" data-ui>');
  const add = html('<div class="dv-line"></div>');
  add.append(name, btn('Save', () => {
    const n = A.saveSnapshot(name.value);
    if (n) { flash(`Saved "${n}"`); name.value = ''; rerender(); } else flash('Storage is full');
  }));
  sn.body.append(add);
  const snaps = A.snapshots();
  if (!snaps.length) sn.body.append(note('None yet.'));
  for (const s of snaps) {
    const when = new Date(s.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    sn.body.append(row(s.name, `${when} · ${s.summary || ''}`,
      confirmBtn('Load', () => A.loadSnapshot(s.name), 'teal'),
      btn(icon('x'), () => { A.deleteSnapshot(s.name); rerender(); }, 'cream dv-sq')));
  }
  // ---- export / import
  const io = card('Export / import', 'clipboard');
  const ta = html('<textarea class="dv-in dv-ta" rows="3" placeholder="Paste a save (JSON) here" spellcheck="false" data-ui></textarea>');
  io.body.append(
    chips([
      { label: 'Copy save', icon: 'clipboard', onClick: async () => {
        try { await navigator.clipboard.writeText(A.exportSave()); flash('Save copied'); } catch { ta.value = A.exportSave(); flash('Copy blocked: it is in the box below'); }
      } },
      { label: 'Download', onClick: () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([A.exportSave()], { type: 'application/json' }));
        a.download = `wrench-bay-save-${Date.now()}.json`;
        document.body.appendChild(a); a.click(); a.remove();
      } },
    ]),
    ta,
    row('Import', 'Replaces this save, then reloads', confirmBtn('Import', () => { const err = A.importSave(ta.value); if (err) flash(err); }, 'teal')),
  );
  // ---- lifetime stats
  const st = card('Lifetime stats', 'trophy', 'Feed the missions');
  for (const k of A.GARAGE_STATS) st.body.append(row(k, null, numInput(() => state.stats[k] || 0, (v) => A.setStat('garage', k, v), { int: true, min: 0, width: 110 })));
  // ---- danger
  const dz = card('Danger zone', 'x');
  dz.el.classList.add('dv-danger');
  dz.body.append(
    row('Reset the save', 'Back to the title screen, everything gone', confirmBtn('Reset', () => A.wipeSave())),
    row('Turn the dev tools off', 'Hides this tool and stops the tuning overrides (kept for next time). ?dev brings it back',
      confirmBtn('Turn off', () => { setDevFlag(false); const u = new URL(location.href); u.searchParams.delete('dev'); u.searchParams.delete('nohud'); location.href = u.toString(); }, 'cream')),
  );
  body.append(cur.el, pre.el, sn.el, io.el, st.el, dz.el);
}
