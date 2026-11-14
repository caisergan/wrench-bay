// Edge-of-screen pointers (TOWN.md 4.16). ONE path: ui.pointer does the priority (rescue > vehicle > sale > cash >
// alert > goal), the cap (3 shown), and hides a pointer while its target is on screen. This wrapper only keeps the
// handles of the current world so they are removed on a world rebuild, and makes calls safe without ui.pointer.
//   ctx.pointers.add({ kind, icon?, text?, worldPos, priority? }) -> { setPos(v3), setText(s), setIcon(name),
//     setPriority(p | null), setVisible(bool), remove() }       kind: 'rescue' | 'vehicle' | 'sale' | 'cash' | 'alert' | 'goal'
// priority (optional) overrides the kind's rank: lower = more important (0 rescue ... 5 goal).
import * as THREE from 'three';
import { ui } from '../ui/index.js';

export function createPointers(ctx) {
  const list = [];
  const sys = {
    list,
    add({ kind = 'goal', icon, text, worldPos, priority } = {}) {
      const pos = new THREE.Vector3().copy(worldPos || new THREE.Vector3());
      const ptr = ui.pointer ? ui.pointer({ kind, icon, text, worldPos: pos }) : null;
      const basePrio = ptr?.prio;
      if (ptr && priority !== undefined) ptr.prio = priority;
      const h = {
        kind, pos, ptr,
        setPos(v) { pos.set(v.x, v.y || 0, v.z); ptr?.setPos?.(pos); return h; },
        setText(s) { ptr?.setText?.(s); return h; },
        setIcon(i) { ptr?.setIcon?.(i); return h; },
        /** Rank it as `p` (lower = more important); null = back to its kind's rank. */
        setPriority(p) { if (ptr) ptr.prio = p ?? (priority !== undefined ? priority : basePrio); return h; },
        setVisible(v) { ptr?.setVisible?.(!!v); return h; },
        remove() { ptr?.remove?.(); const i = list.indexOf(h); if (i >= 0) list.splice(i, 1); },
      };
      list.push(h);
      return h;
    },
    update() {},
    dispose() { for (const h of list.slice()) h.remove(); },
  };
  return sys;
}
