// Map proposal renderer, shared by both suggestions: draws a proposed Harbor Town to scale (SVG in metres), times
// drives on its road graph, and fills the district cards and the timeline. render(W) takes a world module
// (./world.js = A, the bay; ./world-compact.js = B, compact). Icons: the game's own (src/ui/icons.js).
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import { ICON } from '/src/ui/icons.js';

export function render(W) {
const NS = 'http://www.w3.org/2000/svg';
const $ = (s) => document.querySelector(s);
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const icon = (name, x, y, s) => (ICON[name] || ICON.mapPin).replace(/class="ico[^"]*"/, '').replace('<svg ', `<svg x="${x}" y="${y}" width="${s}" height="${s}" `);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const P = (p) => (typeof p === 'string' ? W.NODES[p] : p);
const d2 = (pts) => 'M' + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L');
const len = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const inRect = (x, z, r, m = 0) => x >= r[0] - m && x <= r[2] + m && z >= r[1] - m && z <= r[3] + m;
function inPoly(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
const fmtS = (s) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} min`);
const eraTxt = (m) => (m == null ? '—' : m === 0 ? 'from the start' : `~${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} into a save`);
const ERA = [[0, '#f26b5b', 'Start'], [18, '#f6c453', '0:18 · town opens'], [35, '#9fd36b', '0:35 – 1:00'], [60, '#5fbf6a', '1:00 – 1:30'],
  [100, '#2a9d8f', '1:40 – 2:30'], [180, '#5aa9e6', '3:00 – 4:00'], [330, '#9b8fd4', '5:30 · the goal']];
const eraColor = (m) => { let c = ERA[0][1]; for (const [t, col] of ERA) if (m != null && m >= t) c = col; return m == null ? '#a9b8bf' : c; };
const STATUS = { kept: ['#a9b8bf', 'Kept'], moved: ['#5aa9e6', 'Moved'], new: ['#3fb36b', 'New'], free: ['#d9cdb5', 'Free plot'] };

// ---------------------------------------------------------------- road graph + routing
const roadPts = W.ROADS.map((r) => r.pts.map(P));
const graph = {};
for (const r of W.ROADS) {
  let from = null, poly = [];
  for (const p of r.pts) {
    const xy = P(p);
    poly.push(xy);
    if (typeof p === 'string') {
      if (from) {
        const L = len(poly), w = L / (r.kind === 'highway' ? W.CAR_SPEED.highway || 1 : 1);
        (graph[from] ||= []).push({ to: p, L, w, poly: poly.slice() });
        (graph[p] ||= []).push({ to: from, L, w, poly: poly.slice().reverse() });
      }
      from = p; poly = [xy];
    }
  }
}
function route(a, b) {
  const dist = { [a]: 0 }, prev = {}, done = new Set();
  while (true) {
    let u = null;
    for (const k in dist) if (!done.has(k) && (u === null || dist[k] < dist[u])) u = k;
    if (u === null || u === b) break;
    done.add(u);
    for (const e of graph[u] || []) {
      const nd = dist[u] + e.w;
      if (dist[e.to] == null || nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = { from: u, e }; }
    }
  }
  if (dist[b] == null) return null;
  const segs = [];
  let L = 0;
  for (let n = b; n !== a; n = prev[n].from) { segs.unshift(prev[n].e.poly); L += prev[n].e.L; }
  const pts = segs.flatMap((s, i) => (i ? s.slice(1) : s));
  return { pts, L, w: dist[b] };
}
const placeById = Object.fromEntries(W.PLACES.map((p) => [p.id, p]));
const front = (p) => [(p.rect[0] + p.rect[2]) / 2, p.rect[3]];
/** Door-to-door drive: road length, +12% for corners, +20 m to leave and enter the lots. */
function trip(fromId, toId) {
  const a = placeById[fromId], b = placeById[toId];
  if (a.node === b.node) return { pts: [front(a), P(a.node), front(b)], L: 15, t: 15 / W.CAR_SPEED.base, tt: 15 / W.CAR_SPEED.tuned, walk: 15 / W.CAR_SPEED.walk };
  const r = route(a.node, b.node);
  const L = r.L * 1.12 + 20, Wt = r.w * 1.12 + 20;   // Wt: highway metres count less (the car is faster there)
  return { pts: [front(a), ...r.pts, front(b)], L, t: Wt / W.CAR_SPEED.base, tt: Wt / W.CAR_SPEED.tuned, walk: L / W.CAR_SPEED.walk };
}

// ---------------------------------------------------------------- the map
const svg = $('#map');
const B = W.WORLD;
const VB0 = [B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ];
svg.setAttribute('viewBox', VB0.join(' '));
svg.style.aspectRatio = `${VB0[2]} / ${VB0[3]}`;
// marker scale: badges, pins and labels are drawn for the 430 m wide map; smaller worlds shrink them to the same
// size on screen. Kf: zoom widths and line widths, Kt: text that sits on roads.
const K = VB0[2] / 430, Kf = Math.max(K, .4), Kt = Math.max(K, .55);
const defs = el('defs', {}, svg);
defs.innerHTML = `
  <pattern id="waves" width="14" height="9" patternUnits="userSpaceOnUse"><path d="M1 5 q2.2 -2 4.4 0 t4.4 0" fill="none" stroke="#bfe9ee" stroke-width=".55" opacity=".7"/></pattern>
  <pattern id="sand" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.4" r=".35" fill="#e2c98f"/><circle cx="3.6" cy="3.8" r=".3" fill="#e9d6a6"/></pattern>
  <pattern id="gravel" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#bdb09c"/><circle cx="1" cy="1" r=".35" fill="#a69883"/></pattern>
  <pattern id="dirt" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#cdb892"/><circle cx="1.5" cy="2" r=".5" fill="#bba57c"/><circle cx="4.5" cy="4.6" r=".4" fill="#d9c7a4"/></pattern>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".9"/></filter>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

const txt = (x, z, s, size, cls, parent, attrs = {}) => {
  const t = el('text', { x, y: z, 'font-size': size, class: cls, ...attrs }, parent);
  t.textContent = s;
  return t;
};
const G = {};
const scaled = [];   // markers that keep their size on screen while the map zooms
const keep = (g, x, z, base = 1) => { scaled.push({ g, x, z, base }); g.setAttribute('transform', `translate(${x} ${z}) scale(${base * K})`); return g; };
for (const k of ['land', 'tint', 'water', 'paving', 'roads', 'marks', 'rail', 'trees', 'build', 'today', 'rlabels', 'life', 'route', 'jobs', 'badges', 'dlabels', 'phone'])
  G[k] = el('g', { class: `L-${k}` }, svg);

// land, hills, tunnel
el('rect', { x: B.minX - 20, y: B.minZ - 20, width: VB0[2] + 40, height: VB0[3] + 40, fill: '#a3d7a5' }, G.land);
for (const [cx, cz, rx, rz] of W.HILLS || []) el('ellipse', { cx, cy: cz, rx, ry: rz, fill: '#7fbf86', opacity: .55, filter: 'url(#soft)' }, G.land);

// district tints
const tintEls = {};
for (const [id, d] of Object.entries(W.DISTRICTS)) {
  tintEls[id] = el('path', { d: d2(d.poly) + 'Z', fill: d.color, 'fill-opacity': .16, stroke: d.color, 'stroke-width': .9, 'stroke-dasharray': '3 2.2', 'stroke-opacity': .9, class: 'tint', 'data-d': id }, G.tint);
}

// water: sea, beach, river, lake, marina basin
if (W.BEACH) {
  el('path', { d: d2(W.BEACH) + 'Z', fill: '#f1dfb0' }, G.water);
  el('path', { d: d2(W.BEACH) + 'Z', fill: 'url(#sand)' }, G.water);
}
const seaD = d2(W.SEA) + 'Z';
el('path', { d: seaD, fill: '#8fd3dc' }, G.water);
el('path', { d: seaD, fill: 'url(#waves)' }, G.water);
if (W.RIVER) {
  el('path', { d: d2(W.RIVER.pts), fill: 'none', stroke: '#cfe6d6', 'stroke-width': W.RIVER.w + 3, 'stroke-linejoin': 'round' }, G.water);
  el('path', { d: d2(W.RIVER.pts), fill: 'none', stroke: '#8fd3dc', 'stroke-width': W.RIVER.w, 'stroke-linejoin': 'round' }, G.water);
}
if (W.LAKE) {
  el('ellipse', { cx: W.LAKE.cx, cy: W.LAKE.cz, rx: W.LAKE.rx + 1.6, ry: W.LAKE.rz + 1.6, fill: '#cfe6d6' }, G.water);
  el('ellipse', { cx: W.LAKE.cx, cy: W.LAKE.cz, rx: W.LAKE.rx, ry: W.LAKE.rz, fill: '#8fd3dc' }, G.water);
  el('ellipse', { cx: W.LAKE.cx, cy: W.LAKE.cz, rx: W.LAKE.rx, ry: W.LAKE.rz, fill: 'url(#waves)' }, G.water);
}
const MB = W.MARINA_BASIN;
if (MB) {
  el('rect', { x: MB.minX, y: MB.minZ, width: MB.maxX - MB.minX, height: MB.maxZ - MB.minZ, fill: '#8fd3dc' }, G.water);
  el('rect', { x: MB.minX, y: MB.minZ, width: MB.maxX - MB.minX, height: MB.maxZ - MB.minZ, fill: 'url(#waves)' }, G.water);
  // pontoons + yachts
  for (let i = 0; i < 3; i++) {
    const x = MB.minX + 7 + i * 10;
    el('rect', { x: x - .6, y: MB.minZ + 3, width: 1.2, height: MB.maxZ - MB.minZ - 8, fill: '#b07a4f' }, G.water);
    for (let j = 0; j < 4; j++) {
      const side = j % 2 ? 1 : -1, z = MB.minZ + 7 + j * 7.5;
      el('path', { d: `M${x + side * 1.2} ${z} h${side * 3.4} l${side * 1.4} 1.2 l${-side * 1.4} 1.2 h${-side * 3.4}z`, fill: '#fff6e6', stroke: '#5c6670', 'stroke-width': .25 }, G.water);
    }
  }
}
// quay, piers, harbour boats
const Q = W.QUAY;
el('rect', { x: Q.minX, y: Q.minZ, width: Q.maxX - Q.minX, height: Q.maxZ - Q.minZ, fill: '#d9cdb5' }, G.paving);
for (const [x, z, w, l] of W.PIERS) el('rect', { x: x - w / 2, y: z, width: w, height: l, fill: '#b07a4f', stroke: '#7a4f32', 'stroke-width': .3 }, G.paving);
for (const [x0, z0, x1, z1] of W.BREAKWATERS || []) el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, rx: .8, fill: '#b9b0a3', stroke: '#8f9aa3', 'stroke-width': .3 }, G.paving);
for (const [x, z] of W.LIGHTHOUSES || []) {
  el('circle', { cx: x, cy: z, r: 2.2, fill: '#fff6e6', stroke: '#f26b5b', 'stroke-width': .9 }, G.paving);
  el('circle', { cx: x, cy: z, r: .8, fill: '#f6c453' }, G.paving);
}
for (const [x, z, r] of W.BOATS || [])
  el('path', { d: `M${x - 3} ${z - 1} h5 l1.6 1 l-1.6 1 h-5z`, fill: '#fff6e6', stroke: '#5c6670', 'stroke-width': .25, transform: `rotate(${r * 57} ${x} ${z})` }, G.water);
// the ferry at its pier
if (W.FERRY_BOAT) {
  const { pier: [px, pz, pw, ph], boat: [bx, bz] } = W.FERRY_BOAT;
  el('rect', { x: px, y: pz, width: pw, height: ph, fill: '#b07a4f' }, G.paving);
  el('path', { d: `M${bx} ${bz} h24 l5 3.5 l-5 3.5 h-24 l-3 -3.5z`, fill: '#fff6e6', stroke: '#2f4858', 'stroke-width': .5 }, G.water);
  el('rect', { x: bx + 5, y: bz + 1.2, width: 13, height: 4.6, fill: '#f26b5b' }, G.water);
  el('rect', { x: bx + 10, y: bz + 2, width: 2.4, height: 3, fill: '#2f4858' }, G.water);
}
// paved zones (the home block, side plots)
for (const [x0, z0, x1, z1, c] of W.PAVED || []) el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, fill: c || '#e6dcc8' }, G.paving);

// ---------------------------------------------------------------- roads
const RW = W.ROAD_W;
const order = ['alley', 'lane', 'street', 'avenue', 'highway'];
const roads = W.ROADS.map((r, i) => ({ ...r, xy: roadPts[i] })).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
for (const r of roads) if (r.kind !== 'alley') el('path', { d: d2(r.xy), fill: 'none', stroke: '#d6cec0', 'stroke-width': RW[r.kind] + 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, G.roads);
for (const r of roads) el('path', { d: d2(r.xy), fill: 'none', stroke: r.kind === 'alley' ? '#c9bea9' : r.kind === 'highway' ? '#4f5460' : '#5b5f6b', 'stroke-width': RW[r.kind], 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'road', 'data-r': r.id }, G.roads);
for (const r of roads) {
  if (r.kind === 'alley') continue;
  if (r.kind === 'highway') {
    el('path', { d: d2(r.xy), fill: 'none', stroke: '#f6c453', 'stroke-width': .9, 'stroke-linejoin': 'round' }, G.marks);
    el('path', { d: d2(r.xy), fill: 'none', stroke: '#4f5460', 'stroke-width': .3, 'stroke-linejoin': 'round' }, G.marks);
  } else el('path', { d: d2(r.xy), fill: 'none', stroke: '#f3ead8', 'stroke-width': .35, 'stroke-dasharray': '2.4 2.4', 'stroke-linejoin': 'round' }, G.marks);
}
// bridges
for (const b of W.BRIDGES || []) {
  const h = b.w + 2.2;
  el('rect', { x: b.x0, y: b.z - h / 2, width: b.x1 - b.x0, height: h, fill: '#5b5f6b' }, G.marks);
  el('rect', { x: b.x0, y: b.z - h / 2, width: b.x1 - b.x0, height: .7, fill: '#2b3640' }, G.marks);
  el('rect', { x: b.x0, y: b.z + h / 2 - .7, width: b.x1 - b.x0, height: .7, fill: '#2b3640' }, G.marks);
  if (b.kind === 'draw') {
    const mx = (b.x0 + b.x1) / 2;
    el('line', { x1: mx, y1: b.z - h / 2, x2: mx, y2: b.z + h / 2, stroke: '#f6c453', 'stroke-width': .7, 'stroke-dasharray': '1 .8' }, G.marks);
    el('rect', { x: b.x0 - .6, y: b.z - h / 2 - 1.6, width: 2.2, height: 2.2, fill: '#f26b5b', stroke: '#2b3640', 'stroke-width': .3 }, G.marks);
    el('rect', { x: b.x1 - 1.6, y: b.z + h / 2 - .6, width: 2.2, height: 2.2, fill: '#f26b5b', stroke: '#2b3640', 'stroke-width': .3 }, G.marks);
  }
}
// tunnel portals: a hillside over the road's end, with the dark mouth facing into town
for (const t of W.TUNNELS || []) {
  const h = t.w + 6, dir = t.side === 'w' ? -1 : 1;
  el('rect', { x: dir < 0 ? t.x - 12 : t.x, y: t.z - h / 2 - 3, width: 12, height: h + 6, rx: 3, fill: '#7fbf86' }, G.marks);
  el('rect', { x: dir < 0 ? t.x - 2.2 : t.x, y: t.z - t.w / 2 - 1, width: 2.2, height: t.w + 2, fill: '#2b3640' }, G.marks);
  el('rect', { x: dir < 0 ? t.x - .5 : t.x, y: t.z - t.w / 2 - 1.8, width: .9, height: t.w + 3.6, fill: '#cfc8bd' }, G.marks);
}
// world-specific one-offs (rail, ship, signs)
W.decorate?.({ el, txt: (...a) => txt(...a), d2, G, K });

// ---------------------------------------------------------------- buildings
const R = rng(7);
const ROOFS = ['#2f4858', '#e4664f', '#2a7f78', '#c4483a', '#5c6670', '#f6c453', '#7a4f32', '#3d5b6d', '#e9e1d2'];
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (c) => Math.max(0, Math.min(255, Math.round(c * k))).toString(16).padStart(2, '0'); return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`; };
function shadow(x0, z0, x1, z1, g, k = 1.2) { el('rect', { x: x0 + k, y: z0 - k, width: x1 - x0, height: z1 - z0, fill: '#1f3340', opacity: .16 }, g); }
function roofBox(x0, z0, x1, z1, col, g, { facade = 1.6, ridge = true } = {}) {
  shadow(x0, z0, x1, z1, g);
  el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0 - facade, fill: col }, g);
  if (ridge) {
    const mz = z0 + (z1 - facade - z0) / 2;
    el('rect', { x: x0, y: z0, width: x1 - x0, height: mz - z0, fill: shade(col, 1.12) }, g);
    el('line', { x1: x0, y1: mz, x2: x1, y2: mz, stroke: shade(col, .75), 'stroke-width': .35 }, g);
  }
  el('rect', { x: x0, y: z1 - facade, width: x1 - x0, height: facade, fill: '#fff6e6' }, g);
  const n = Math.max(1, Math.floor((x1 - x0) / 3.2));
  for (let i = 0; i < n; i++) el('rect', { x: x0 + (i + .5) * (x1 - x0) / n - .5, y: z1 - facade + .35, width: 1, height: facade - .7, fill: i === Math.floor(n / 2) ? '#7a4f32' : '#5aa9e6' }, g);
}
function hall(p, g) {
  const [x0, z0, x1, z1] = p.rect, wc = p.wall || '#2f4858';
  shadow(x0, z0, x1, z1, g, .8);
  el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, fill: '#e3e8ea' }, g);
  el('path', { d: `M${x0} ${z1} V${z0} H${x1} V${z1}`, fill: 'none', stroke: wc, 'stroke-width': 1.1 }, g);
  el('path', { d: `M${x0 + .55} ${z1} V${z0 + .55} H${x1 - .55} V${z1}`, fill: 'none', stroke: '#f26b5b', 'stroke-width': .3 }, g);
  el('line', { x1: x0, y1: z1, x2: x1, y2: z1, stroke: '#f6c453', 'stroke-width': .5, 'stroke-dasharray': '.8 .8' }, g);
  const w = x1 - x0, h = z1 - z0;
  if (p.id === 'garage') {
    for (let i = 0; i < 5; i++) el('rect', { x: x0 + 1.6 + i * (w - 3.2) / 5 + .4, y: z0 + .9, width: (w - 3.2) / 5 - .8, height: 1.4, fill: ['#5c6670', '#f6c453', '#3a4250', '#5aa9e6', '#9b8fd4'][i] }, g);
    for (let i = 0; i < 4; i++) {
      const cx = x0 + 2.4 + i * (w - 4.8) / 3;
      el('rect', { x: cx - 1, y: z0 + 5.2, width: 2, height: 3.4, fill: 'none', stroke: '#f6c453', 'stroke-width': .3 }, g);
      el('rect', { x: cx - 1.2, y: z0 + 5.2, width: .45, height: .45, fill: '#f26b5b' }, g);
      el('rect', { x: cx + .75, y: z0 + 5.2, width: .45, height: .45, fill: '#f26b5b' }, g);
    }
    // forecourt: drop-off lane, exit lane, tow zone
    el('rect', { x: -11.5, y: 1.2, width: 23, height: 9.8, fill: '#e6dcc8' }, g);
    el('rect', { x: -6.8, y: 7.2, width: 13.4, height: 2.4, fill: 'none', stroke: '#fff6e6', 'stroke-width': .3 }, g);
    el('rect', { x: -11.2, y: 2, width: 3.8, height: 4.2, fill: 'none', stroke: '#f6c453', 'stroke-width': .35 }, g);
    el('rect', { x: 5, y: 6, width: 4.4, height: 2.2, fill: '#b07a4f' }, g);
  } else if (p.id === 'paint') {
    for (let i = 0; i < 2; i++) el('rect', { x: x0 + w * .32 + i * w * .2, y: z0 + 3, width: w * .13, height: h * .32, fill: '#cfe6ee', stroke: '#2f4858', 'stroke-width': .3 }, g);
    for (let i = 0; i < 7; i++) el('rect', { x: x0 + 2 + i * 2.2, y: z0 + .9, width: 1.6, height: 1.6, fill: ['#f26b5b', '#f6c453', '#5fbf6a', '#2a9d8f', '#5aa9e6', '#9b8fd4', '#2b3640'][i] }, g);
    el('rect', { x: x0, y: z0 + h * .5, width: w, height: h * .5, fill: '#e6dcc8' }, g);
  } else if (p.id === 'vip') {
    el('rect', { x: x0 + 3, y: z0 + 3, width: 3, height: 5, fill: 'none', stroke: '#c9a227', 'stroke-width': .4 }, g);
    el('rect', { x: x0 + 9, y: z0 + 3, width: 3, height: 5, fill: 'none', stroke: '#c9a227', 'stroke-width': .4 }, g);
    el('circle', { cx: x0 + w * .72, cy: z0 + h * .32, r: 3.4, fill: '#d8c58a', stroke: '#c9a227', 'stroke-width': .4 }, g);
    el('rect', { x: x0 + w * .45, y: z0 + h * .55, width: 2, height: h * .45, fill: '#c4483a' }, g);
  } else if (p.id === 'showroom') {
    for (let i = 0; i < 3; i++) {
      const cx = x0 + w * (.22 + i * .28);
      el('circle', { cx, cy: z0 + h * .38, r: 4, fill: '#2b3640' }, g);
      el('circle', { cx, cy: z0 + h * .38, r: 3.2, fill: 'none', stroke: '#fff6e6', 'stroke-width': .3, 'stroke-dasharray': '1 1' }, g);
      el('rect', { x: cx - .8, y: z0 + h * .38 - 1.5, width: 1.6, height: 3, fill: ['#f26b5b', '#5aa9e6', '#f6c453'][i] }, g);
    }
  } else if (p.id === 'lounge') {
    for (let i = 0; i < 2; i++) el('rect', { x: x0 + 2 + i * 4, y: z0 + 2, width: 1.2, height: h - 4, fill: '#c4483a' }, g);
    el('rect', { x: x0 + 2, y: z0 + 1, width: w - 4, height: h - 2, fill: '#2a9d8f', opacity: .25 }, g);
  }
}
function look(p, g) {
  const [x0, z0, x1, z1] = p.rect;
  switch (p.look) {
    case 'hall': return hall(p, g);
    case 'roof': return roofBox(x0, z0, x1, z1, p.roof || '#2f4858', g);
    case 'carport': {
      el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, fill: '#e6dcc8' }, g);
      shadow(x0 + 1, z0 + 1, x1 - 1, z0 + 9, g);
      el('rect', { x: x0 + 1, y: z0 + 1, width: x1 - x0 - 2, height: 8, fill: '#2a9d8f', opacity: .9 }, g);
      for (let i = 0; i < 4; i++) el('line', { x1: x0 + 1 + i * (x1 - x0 - 2) / 3, y1: z0 + 10, x2: x0 + 1 + i * (x1 - x0 - 2) / 3, y2: z0 + 16, stroke: '#fff6e6', 'stroke-width': .35 }, g);
      const cols = ['#f26b5b', '#5aa9e6', '#f6c453'];
      for (let i = 0; i < 3; i++) {
        const cx = x0 + 1 + (i + .5) * (x1 - x0 - 2) / 3;
        el('rect', { x: cx - .9, y: z0 + 10.4, width: 1.8, height: 3.6, rx: .5, fill: cols[i], stroke: '#2b3640', 'stroke-width': .2 }, g);
        if (!i) el('rect', { x: cx - .65, y: z0 + 12, width: 1.3, height: 1.7, fill: '#7a4f32' }, g);
      }
      el('rect', { x: x0 + 3, y: z1 - 6, width: 4, height: 4, fill: '#2a9d8f', rx: .6 }, g);
      return;
    }
    case 'yard': {
      el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, fill: 'url(#dirt)' }, g);
      el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, fill: 'none', stroke: '#7a4f32', 'stroke-width': .5, 'stroke-dasharray': '1.4 .6' }, g);
      const r2 = rng(3);
      for (let i = 0; i < 26; i++) {
        const x = x0 + 3 + r2() * (x1 - x0 - 6), z = z0 + 3 + r2() * (z1 - z0 - 16);
        el('rect', { x, y: z, width: 1.6, height: 3, rx: .3, fill: ['#8a6d55', '#9b8f86', '#a85c4a', '#6f7d6a', '#b49a6a'][i % 5], transform: `rotate(${r2() * 180} ${x + .8} ${z + 1.5})` }, g);
      }
      for (let i = 0; i < 3; i++) el('rect', { x: x0 + 8 + i * 18, y: z1 - 9, width: 5, height: 4, fill: '#e6dcc8', stroke: '#7a4f32', 'stroke-width': .3 }, g);
      el('path', { d: `M${x1 - 10} ${z0 + 6} l7 7 M${x1 - 3} ${z0 + 6} l-7 7`, stroke: '#f6c453', 'stroke-width': .9 }, g);
      roofBox(x1 - 14, z1 - 10, x1 - 2, z1 - 3, '#5c6670', g, { facade: 1.2 });
      return;
    }
    case 'port': {
      el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0 + 2, fill: '#cfc9bd' }, g);
      const r2 = rng(11);
      for (let row = 0; row < 5; row++) for (let i = 0; i < 9; i++) {
        if (r2() < .2) continue;
        el('rect', { x: x0 + 6 + i * 9.6, y: z0 + 6 + row * 9, width: 8.4, height: 2.8, fill: ['#f26b5b', '#f6c453', '#2a9d8f', '#5aa9e6', '#9b8fd4', '#c4483a'][Math.floor(r2() * 6)], stroke: '#2b3640', 'stroke-width': .15 }, g);
      }
      for (const cz of [32, 56]) {
        el('rect', { x: x1 - 9, y: cz - 7, width: 2, height: 14, fill: '#f26b5b' }, g);
        el('rect', { x: x1 - 12, y: cz - 1, width: 10, height: 2, fill: '#f6c453' }, g);
      }
      return;
    }
    case 'canopy': {
      el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, fill: '#e6dcc8' }, g);
      if (x1 - x0 < 20) {   // narrow plot: kiosk at the back, canopy over two pumps in front
        roofBox(x0 + 1, z0 + 1, x1 - 1, z0 + 6, '#2a9d8f', g, { facade: 1 });
        shadow(x0 + 1, z0 + 8, x1 - 1, z1 - 2, g);
        el('rect', { x: x0 + 1, y: z0 + 8, width: x1 - x0 - 2, height: z1 - z0 - 10, fill: '#fff6e6', stroke: '#f26b5b', 'stroke-width': .5 }, g);
        for (let i = 0; i < 2; i++) el('rect', { x: x0 + 2.5 + i * (x1 - x0 - 6), y: z0 + 11, width: 1.2, height: 2.4, fill: '#f26b5b' }, g);
        return;
      }
      roofBox(x0 + 1, z0 + 1, x0 + 11, z0 + 9, '#2a9d8f', g, { facade: 1.2 });
      shadow(x0 + 14, z0 + 6, x1 - 2, z1 - 5, g);
      el('rect', { x: x0 + 14, y: z0 + 6, width: x1 - x0 - 16, height: z1 - z0 - 11, fill: '#fff6e6', stroke: '#f26b5b', 'stroke-width': .5 }, g);
      for (let i = 0; i < 3; i++) el('rect', { x: x0 + 17 + i * 6.5, y: z0 + 11, width: 1.2, height: 2.4, fill: '#f26b5b' }, g);
      return;
    }
    case 'lot': {
      el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, fill: '#6b7080' }, g);
      for (let x = x0 + 2.6; x < x1; x += 2.6) el('line', { x1: x, y1: z0 + .6, x2: x, y2: z0 + 5, stroke: '#fff6e6', 'stroke-width': .2 }, g);
      return;
    }
    case 'plaza': {
      el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, fill: '#e6dcc8' }, g);
      el('circle', { cx: -22, cy: (z0 + z1) / 2, r: 4.2, fill: '#cfc8bd', stroke: '#b9b0a3', 'stroke-width': .4 }, g);
      el('circle', { cx: -22, cy: (z0 + z1) / 2, r: 2.8, fill: '#8fd3dc' }, g);
      for (let i = 0; i < 6; i++) el('rect', { x: 12 + i * 4.6, y: z0 + 5, width: 3.2, height: 2.4, fill: ['#f26b5b', '#fff6e6'][i % 2], stroke: '#c4483a', 'stroke-width': .2 }, g);
      el('circle', { cx: 30, cy: z1 - 5, r: 3, fill: '#fff6e6', stroke: '#2f4858', 'stroke-width': .4 }, g);
      return;
    }
    case 'rail': {
      el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, fill: 'url(#gravel)' }, g);
      for (const x of [x0 + 3, x0 + 7, x1 - 4]) el('line', { x1: x, y1: z0 + 2, x2: x, y2: z1 - 2, stroke: '#6d5d4b', 'stroke-width': .5 }, g);
      for (let i = 0; i < 9; i++) el('rect', { x: (i % 3 === 2 ? x1 - 5.2 : x0 + 1.8 + (i % 3) * 4) , y: z0 + 6 + Math.floor(i / 3) * 24 + (i % 3) * 5, width: 2.4, height: 9, fill: ['#a85c4a', '#3d5b6d', '#8a6d55'][i % 3] }, g);
      return;
    }
    case 'sheds': {
      const n = Math.max(2, Math.round((z1 - z0) / 18));
      for (let i = 0; i < n; i++) {
        const za = z0 + i * (z1 - z0) / n + 1.5, zb = z0 + (i + 1) * (z1 - z0) / n - 1.5;
        roofBox(x0 + 2, za, x1 - 2, zb, i % 2 ? shade(p.roof || '#8f9aa3', .9) : p.roof || '#8f9aa3', g, { facade: 1.4 });
      }
      return;
    }
    case 'landmark': {
      el('circle', { cx: (x0 + x1) / 2, cy: (z0 + z1) / 2, r: 4.6, fill: '#e6dcc8' }, g);
      el('circle', { cx: (x0 + x1) / 2, cy: (z0 + z1) / 2, r: 2.6, fill: '#fff6e6', stroke: '#f26b5b', 'stroke-width': 1 }, g);
      el('circle', { cx: (x0 + x1) / 2, cy: (z0 + z1) / 2, r: 1, fill: '#f6c453' }, g);
      return;
    }
    case 'camp': {
      el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, fill: '#c7dfa8' }, g);
      for (let i = 0; i < 5; i++) el('path', { d: `M${x0 + 4 + i * 6} ${z0 + 9} l2.2 -3.6 l2.2 3.6z`, fill: ['#f26b5b', '#f6c453', '#2a9d8f', '#5aa9e6', '#f26b5b'][i] }, g);
      el('rect', { x: x0 + 6, y: z0 + 12, width: 4.4, height: 2, rx: .5, fill: '#fff6e6', stroke: '#2f4858', 'stroke-width': .25 }, g);
      el('rect', { x: x0 + 18, y: z0 + 13, width: 4.4, height: 2, rx: .5, fill: '#e9e1d2', stroke: '#2f4858', 'stroke-width': .25 }, g);
      return;
    }
    case 'spare': {
      el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, fill: '#c9e2bd', stroke: '#fff6e6', 'stroke-width': .4, 'stroke-dasharray': '1.4 1' }, g);
      el('rect', { x: (x0 + x1) / 2 - .2, y: z1 - 4.4, width: .4, height: 3, fill: '#7a4f32' }, g);
      el('rect', { x: (x0 + x1) / 2 - 2, y: z1 - 5.4, width: 4, height: 2, rx: .3, fill: '#fff6e6', stroke: '#7a4f32', 'stroke-width': .25 }, g);
      return;
    }
    default: return;
  }
}
const placeEls = {};
for (const p of W.PLACES) {
  const g = el('g', { class: 'place', 'data-p': p.id }, G.build);
  look(p, g);
  placeEls[p.id] = g;
}
// houses, villas
const houseRects = [];
for (const row of W.HOUSE_ROWS) for (const [xa, xb] of row.xs) {
  const n = Math.floor((xb - xa) / row.w);
  const gap = (xb - xa - n * row.w) / n;
  for (let i = 0; i < n; i++) {
    const x0 = xa + i * (row.w + gap) + gap / 2 + .8, x1 = x0 + row.w - 1.6;
    const zf = row.z1 - R() * 2.2, zb = row.z0 + R() * 2;
    houseRects.push([x0, zb, x1, zf]);
    roofBox(x0, zb, x1, zf, ROOFS[Math.floor(R() * ROOFS.length)], G.build, { facade: 1.4 });
    el('rect', { x: x1 - 2.8, y: zf, width: 2.2, height: row.z1 - zf + 3, fill: '#d6cec0' }, G.build);
  }
}
for (const [x0, z0, x1, z1] of W.VILLAS) {
  houseRects.push([x0, z0, x1, z1]);
  el('rect', { x: x0 - 1, y: z0 - 1, width: x1 - x0 + 2, height: z1 - z0 + 2, fill: '#b9e0b0' }, G.build);
  roofBox(x0, z0, x1 - 4, z0 + 15, ['#fff6e6', '#e9e1d2', '#f7ede0', '#e6dcc8'][Math.floor(R() * 4)], G.build, { facade: 1.4 });
  el('rect', { x: x0 + 2, y: z0 + 18, width: x1 - x0 - 6, height: 6, rx: .8, fill: '#5ec7e6', stroke: '#fff6e6', 'stroke-width': .5 }, G.build);
  el('rect', { x: x1 - 3.6, y: z0 + 4, width: 2.6, height: z1 - z0 - 4, fill: '#d6cec0' }, G.build);
}
// P bays at every shop door
const pBay = (x, z) => {
  el('rect', { x: x - 1.8, y: z - 1, width: 3.6, height: 2, rx: .3, fill: '#2f6fb0' }, G.build);
  el('text', { x, y: z + .7, 'font-size': 1.9, 'font-weight': 700, fill: '#fff', 'text-anchor': 'middle', 'font-family': 'Fredoka' }, G.build).textContent = 'P';
};
for (const p of W.PLACES) if (['shop', 'business', 'service', 'goal'].includes(p.kind) && p.id !== 'garage') {
  const [x, z] = front(p);
  pBay(x + Math.min(6, (p.rect[2] - p.rect[0]) / 2 - 2), z + (p.id === 'paint' || p.id === 'carport' ? -2.5 : 1.6));
}

// ---------------------------------------------------------------- trees
const solid = [...W.PLACES.map((p) => p.rect), ...houseRects, ...(W.PAVED || []), ...(W.SOLID || [])];
const forestDensity = W.forest || function (x, z) {
  if (z < -207 && !(x < -205 && z > -212)) return .85;
  if (x > 205) return .8;
  if (x < -209) return .7;
  if (x > 56 && x < 198 && z < -84 && z > -200) return .75;
  if (x > 54 && x < 90 && z < -44 && z > -200) return .7;
  if (x > 168 && z > 18 && z < 62) return .22;
  if (x > -74 && x < -52 && z < -24 && z > -200) return .45;
  if (x > -100 && x < -93) return .4;
  if (x > -186 && x < -110 && z < -104 && z > -160) return 0;
  if (x > -50 && x < 50 && z < -84 && z > -196) return .2;
  if (x > 118 && x < 200 && z < -40 && z > -84) return .3;
  return .05;
};
const treeR = rng(42);
for (let x = B.minX; x < B.maxX; x += 5.2) for (let z = B.minZ; z < B.maxZ; z += 5.2) {
  const tx = x + treeR() * 4.4, tz = z + treeR() * 4.4;
  if (treeR() > forestDensity(tx, tz)) continue;
  if (inPoly(tx, tz, W.SEA) || (W.BEACH && inPoly(tx, tz, W.BEACH))) continue;
  if (W.LAKE && ((tx - W.LAKE.cx) / (W.LAKE.rx + 3)) ** 2 + ((tz - W.LAKE.cz) / (W.LAKE.rz + 3)) ** 2 < 1) continue;
  if (MB && inRect(tx, tz, [MB.minX, MB.minZ, MB.maxX, MB.maxZ], 2)) continue;
  if (solid.some((r) => inRect(tx, tz, r, 2))) continue;
  let near = false;
  for (let i = 0; W.RIVER && i < W.RIVER.pts.length - 1 && !near; i++) if (segDist(tx, tz, W.RIVER.pts[i], W.RIVER.pts[i + 1]) < W.RIVER.w / 2 + 2.5) near = true;
  for (let i = 0; W.RAIL && i < W.RAIL.length - 1 && !near; i++) if (segDist(tx, tz, W.RAIL[i], W.RAIL[i + 1]) < 3.5) near = true;
  for (const r of roads) {
    if (near) break;
    for (let i = 0; i < r.xy.length - 1; i++) if (segDist(tx, tz, r.xy[i], r.xy[i + 1]) < RW[r.kind] / 2 + 3.4) { near = true; break; }
  }
  if (near) continue;
  const rr = 1.5 + treeR() * 1.1;
  el('circle', { cx: tx + .5, cy: tz - .4, r: rr, fill: '#1f3340', opacity: .14 }, G.trees);
  el('circle', { cx: tx, cy: tz, r: rr, fill: treeR() < .5 ? '#3f8f5a' : '#4f9e62' }, G.trees);
  el('circle', { cx: tx - rr * .3, cy: tz - rr * .3, r: rr * .45, fill: '#6fbf7a', opacity: .7 }, G.trees);
}

// ---------------------------------------------------------------- labels
for (const r of W.ROADS) {
  if (!r.name) continue;
  const xy = roadPts[W.ROADS.indexOf(r)];
  let best = 0, bl = 0;
  for (let i = 0; i < xy.length - 1; i++) { const l = Math.hypot(xy[i + 1][0] - xy[i][0], xy[i + 1][1] - xy[i][1]); if (l > bl) { bl = l; best = i; } }
  const a = xy[best], b = xy[best + 1];
  const t = r.id === 'harbor' ? .2 : r.id === 'hill' ? .55 : .5;
  const mx = r.label ? r.label[0] : a[0] + (b[0] - a[0]) * t, mz = r.label ? r.label[1] : a[1] + (b[1] - a[1]) * t;
  let ang = r.label ? 0 : Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
  txt(mx, mz + .9 * Kt, r.name.toUpperCase(), (r.kind === 'highway' ? 3 : 2.3) * Kt, 'rname', G.rlabels, { transform: `rotate(${ang} ${mx} ${mz})` });
}
for (const b of W.BRIDGES || []) txt((b.x0 + b.x1) / 2, b.z - b.w / 2 - 2.6, b.name, 2.3, 'bname', G.rlabels);
for (const L of W.LABELS || []) txt(L.x, L.z, L.t, L.s, L.cls, G.rlabels, L.rot != null ? { transform: `rotate(${L.rot} ${L.x} ${L.z})` } : {});
const dLabels = {};
for (const [id, d] of Object.entries(W.DISTRICTS)) {
  const g = keep(el('g', { class: 'dl', 'data-d': id }, G.dlabels), d.label[0], d.label[1]);
  txt(0, 0, d.name.toUpperCase(), 6.2, 'dname', g, { fill: d.color });
  txt(0, 4.4, d.tag, 3.2, 'dtag', g);
  dLabels[id] = g;
}

// ---------------------------------------------------------------- place badges
const badges = {};
for (const p of W.PLACES) {
  if (p.look === 'none' && p.kind !== 'life') continue;
  const big = p.kind !== 'life' && p.kind !== 'spare';
  const r = big ? 3.7 : 2.7;
  const [cx, cz] = p.badge || [(p.rect[0] + p.rect[2]) / 2, (p.rect[1] + p.rect[3]) / 2];
  const g = keep(el('g', { class: `badge ${big ? 'big' : 'small'}`, 'data-p': p.id }, G.badges), cx, cz);
  el('circle', { r: r + .9, class: 'ring', fill: W.DISTRICTS[p.d].color }, g);
  el('circle', { r, fill: '#2f4858' }, g);
  g.insertAdjacentHTML('beforeend', icon(p.icon, -r * .72, -r * .72, r * 1.44));
  const lab = el('g', { class: 'blab' }, g);
  txt(0, r + 3.9, p.short || p.name, big ? 2.9 : 2.4, 'pname', lab);
  if (p.sub && big) txt(0, r + 6.6, p.sub, 2.1, 'psub', lab);
  const st = el('g', { class: 'stag', transform: `translate(${r * .75} ${-r * .95})` }, g);
  el('rect', { x: -.4, y: -1.7, width: 7.6, height: 3.2, rx: 1.6, class: 'strect' }, st);
  txt(3.4, .62, '', 2.1, 'sttxt', st);
  badges[p.id] = g;
}

// ---------------------------------------------------------------- jobs, life, today, phone
const pin = (x, z, col, sym, g, s = 1) => {
  const p = keep(el('g', {}, g), x, z, s);
  el('path', { d: 'M0 0 l-2 -3.2 a2.6 2.6 0 1 1 4 0z', fill: col, stroke: '#1f3340', 'stroke-width': .35 }, p);
  txt(0, -3.8, sym, 2.4, 'pinsym', p);
  return p;
};
const RCOL = { near: '#5fbf6a', town: '#f6c453', far: '#f26b5b' };
for (const [zone, list] of Object.entries(W.RESCUES)) for (const [x, z] of list) pin(x, z, RCOL[zone], '!', G.jobs);
for (const [x, z] of W.HOUSE_CALLS || []) {
  const g = keep(el('g', {}, G.jobs), x, z);
  el('circle', { r: 2.5, fill: '#fff6e6', stroke: '#2a9d8f', 'stroke-width': .6 }, g);
  el('path', { d: 'M-1.4 .9 v-1.4 l1.4 -1.2 l1.4 1.2 v1.4z', fill: '#2a9d8f' }, g);
}
for (const [x, z] of W.WRENCHES) {
  const g = keep(el('g', {}, G.jobs), x, z);
  el('circle', { r: 1.9, fill: '#f6c453', stroke: '#cf9c26', 'stroke-width': .4 }, g);
  el('path', { d: 'M-.9 .9 l1.6 -1.6 m-.2 -.5 a.7 .7 0 1 1 .9 .9', stroke: '#7a4f32', 'stroke-width': .45, fill: 'none', 'stroke-linecap': 'round' }, g);
}
for (const line of W.BUS_LINES || []) {
  const pts = [];
  for (let i = 0; i < line.route.length - 1; i++) {
    const r = route(line.route[i], line.route[i + 1]);
    if (r) pts.push(...(pts.length ? r.pts.slice(1) : r.pts));
  }
  const off = line.color === '#f6c453' ? -1.6 : 1.6;
  el('path', { d: d2(pts), fill: 'none', stroke: line.color, 'stroke-width': 1.1 * Kf, 'stroke-dasharray': `${3 * Kf} ${1.6 * Kf}`, 'stroke-linejoin': 'round', transform: `translate(${off * Kf} ${off * Kf})`, opacity: .95 }, G.life);
  for (const s of line.stops) {
    const [x, z] = P(s);
    const g = keep(el('g', {}, G.life), x + off * 2.4 * Kf, z + off * 2.4 * Kf);
    el('rect', { x: -2, y: -2, width: 4, height: 4, rx: 1, fill: line.color, stroke: '#1f3340', 'stroke-width': .35 }, g);
    txt(0, 1.05, 'B', 2.6, 'pinsym', g);
  }
}
if (W.FERRY_ROUTE) {
  el('path', { d: 'M' + W.FERRY_ROUTE.map((p) => p.join(' ')).join(' L'), fill: 'none', stroke: '#fff6e6', 'stroke-width': .9 * Kf, 'stroke-dasharray': `${2.4 * Kf} ${1.8 * Kf}` }, G.life);
  const [fx, fz] = W.FERRY_ROUTE[W.FERRY_ROUTE.length - 1];
  txt(fx + 18 * Kf, fz - 3 * Kf, 'ferry to the next town', 2.6 * Kt, 'lifetxt', G.life);
}
W.decorateLife?.({ el, txt: (...a) => txt(...a), G, K });

const T = W.TODAY;
el('rect', { x: T.minX, y: T.minZ, width: T.maxX - T.minX, height: T.maxZ - T.minZ, fill: 'none', stroke: '#fff', 'stroke-width': .8 * Kf, 'stroke-dasharray': `${2.6 * Kf} ${1.6 * Kf}` }, G.today);
el('rect', { x: T.minX, y: T.minZ, width: T.maxX - T.minX, height: T.maxZ - T.minZ, fill: 'none', stroke: '#1f3340', 'stroke-width': .3 * Kf, 'stroke-dasharray': `${2.6 * Kf} ${1.6 * Kf}`, transform: `translate(${.4 * Kf} ${.4 * Kf})` }, G.today);
const todayAt = W.TODAY_LABEL || [T.maxX - 1, T.maxZ + 3.6];
txt(todayAt[0], todayAt[1], "today's whole town · 122 × 61 m", 2.6 * Kt, 'todaytxt', G.today, { 'text-anchor': 'end' });

const phonePos0 = W.PHONE_AT || [0, -3];
const phone = el('g', { class: 'phone', transform: `translate(${phonePos0[0]} ${phonePos0[1]})` }, G.phone);
el('rect', { x: -W.PHONE.w / 2, y: -W.PHONE.h / 2, width: W.PHONE.w, height: W.PHONE.h, rx: 1.6, fill: 'rgba(255,255,255,.1)', stroke: '#fff', 'stroke-width': .7, 'pointer-events': 'none' }, phone);
el('rect', { x: -W.PHONE.w / 2, y: -W.PHONE.h / 2, width: W.PHONE.w, height: W.PHONE.h, rx: 1.6, fill: 'none', stroke: 'transparent', 'stroke-width': 3.5, 'pointer-events': 'stroke', class: 'grab' }, phone);
el('rect', { x: -W.PHONE.w / 2, y: -W.PHONE.h / 2, width: W.PHONE.w, height: W.PHONE.h, rx: 1.6, fill: 'none', stroke: '#1f3340', 'stroke-width': .25, transform: 'translate(.35 .35)', 'pointer-events': 'none' }, phone);
txt(0, -W.PHONE.h / 2 - 1.4 * Kt, 'one phone screen', 2.2 * Kt, 'todaytxt', phone);
el('rect', { x: -4.2, y: W.PHONE.h / 2 + .3, width: 8.4, height: 3, rx: 1.5, fill: '#fff', stroke: '#1f3340', 'stroke-width': .25, class: 'grab' }, phone);
txt(0, W.PHONE.h / 2 + 2.35, '⇕ drag', 1.9, 'pinsym', phone);
let phonePos = phonePos0.slice();

// compass + scale bar
const cmp = el('g', { transform: `translate(${B.maxX - 14 * K} ${B.minZ + 14 * K}) scale(${K})` }, svg);
el('circle', { r: 6, fill: 'rgba(31,51,64,.55)' }, cmp);
el('path', { d: 'M0 -4.6 l1.8 4.6 h-3.6z', fill: '#f26b5b' }, cmp);
el('path', { d: 'M0 4.6 l1.8 -4.6 h-3.6z', fill: '#fff6e6' }, cmp);
txt(0, -7.4, 'N', 2.8, 'pname', cmp);
const SB = W.SCALEBAR || { x: -40, z: 99, m: 50 };
const sb = el('g', { transform: `translate(${SB.x} ${SB.z}) scale(${K})` }, svg);
for (let i = 0; i < 5; i++) el('rect', { x: i * SB.m / 5 / K, y: 0, width: SB.m / 5 / K, height: 1.6, fill: i % 2 ? '#fff6e6' : '#2f4858', stroke: '#1f3340', 'stroke-width': .2 }, sb);
txt(0, -1.6, '0', 2.2, 'pname', sb, { 'text-anchor': 'start' });
txt(SB.m / K, -1.6, `${SB.m} m`, 2.2, 'pname', sb, { 'text-anchor': 'end' });

// ---------------------------------------------------------------- modes + layers
const legend = $('#legend');
function setMode(mode) {
  svg.dataset.mode = mode;
  for (const [id, path] of Object.entries(tintEls)) {
    const d = W.DISTRICTS[id];
    const c = mode === 'era' ? eraColor(d.era) : d.color;
    path.setAttribute('fill', c); path.setAttribute('stroke', c);
    path.setAttribute('fill-opacity', mode === 'changes' ? 0 : mode === 'era' ? .38 : .16);
    path.setAttribute('stroke-opacity', mode === 'changes' ? 0 : .9);
    dLabels[id].querySelector('.dname').setAttribute('fill', mode === 'era' ? eraColor(d.era) : d.color);
    dLabels[id].querySelector('.dtag').textContent = mode === 'era' ? (d.era ? `from ${Math.floor(d.era / 60)}:${String(d.era % 60).padStart(2, '0')}` : 'from the start') : d.tag;
  }
  for (const p of W.PLACES) {
    const b = badges[p.id];
    if (!b) continue;
    const ring = b.querySelector('.ring');
    const col = mode === 'era' ? eraColor(p.era) : mode === 'changes' ? STATUS[p.status][0] : W.DISTRICTS[p.d].color;
    ring.setAttribute('fill', col);
    const st = b.querySelector('.stag');
    st.style.display = mode === 'changes' && p.status !== 'kept' ? '' : 'none';
    st.querySelector('.strect').setAttribute('fill', STATUS[p.status][0]);
    st.querySelector('.sttxt').textContent = STATUS[p.status][1].toUpperCase();
  }
  legend.innerHTML = mode === 'districts'
    ? Object.values(W.DISTRICTS).map((d) => `<span class="lg"><i style="background:${d.color}"></i>${d.name}</span>`).join('')
    : mode === 'era'
      ? ERA.map(([, c, l]) => `<span class="lg"><i style="background:${c}"></i>${l}</span>`).join('') + '<span class="lg"><i style="background:#a9b8bf"></i>atmosphere</span>'
      : Object.entries(STATUS).filter(([k]) => W.PLACES.some((p) => p.status === k)).map(([, [c, l]]) => `<span class="lg"><i style="background:${c}"></i>${l === 'Kept' ? 'Kept where it is' : l === 'Moved' ? 'Moved here' : l}</span>`).join('');
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
}
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
const LAYERS = { jobs: G.jobs, life: G.life, today: G.today, phone: G.phone };
document.querySelectorAll('[data-layer]').forEach((b) => {
  const g = LAYERS[b.dataset.layer];
  const sync = () => { g.style.display = b.classList.contains('on') ? '' : 'none'; };
  b.addEventListener('click', () => { b.classList.toggle('on'); sync(); });
  sync();
});
setMode('districts');

// ---------------------------------------------------------------- pan + zoom
let vb = VB0.slice();
const applyVB = () => {
  svg.setAttribute('viewBox', vb.map((v) => v.toFixed(2)).join(' '));
  const z = VB0[2] / vb[2], k = Math.pow(z, -0.8);
  for (const s of scaled) s.g.setAttribute('transform', `translate(${s.x} ${s.z}) scale(${(k * s.base * K).toFixed(3)})`);
  svg.classList.toggle('zin', z > 1.7);
};
const toWorld = (ev) => { const r = svg.getBoundingClientRect(); const s = Math.max(vb[2] / r.width, vb[3] / r.height); const ox = (r.width * s - vb[2]) / 2, oy = (r.height * s - vb[3]) / 2; return [vb[0] + (ev.clientX - r.left) * s - ox, vb[1] + (ev.clientY - r.top) * s - oy]; };
function zoomAt(wx, wz, k) {
  const nw = Math.max(40 * Kf, Math.min(VB0[2], vb[2] * k)), kk = nw / vb[2];
  vb = [wx - (wx - vb[0]) * kk, wz - (wz - vb[1]) * kk, nw, vb[3] * kk];
  clampVB(); applyVB();
}
function clampVB() {
  vb[0] = Math.max(VB0[0], Math.min(VB0[0] + VB0[2] - vb[2], vb[0]));
  vb[1] = Math.max(VB0[1], Math.min(VB0[1] + VB0[3] - vb[3], vb[1]));
}
svg.addEventListener('wheel', (e) => { e.preventDefault(); const [x, z] = toWorld(e); zoomAt(x, z, Math.exp(e.deltaY * .0016)); }, { passive: false });
let drag = null;
svg.addEventListener('pointerdown', (e) => {
  const onPhone = e.target.closest('.phone .grab');
  drag = { x: e.clientX, y: e.clientY, vb: vb.slice(), phone: onPhone ? phonePos.slice() : null, target: e.target, moved: false };
  svg.setPointerCapture(e.pointerId);
});
svg.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const r = svg.getBoundingClientRect(), s = Math.max(vb[2] / r.width, vb[3] / r.height);
  const dx = (e.clientX - drag.x) * s, dz = (e.clientY - drag.y) * s;
  if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
  if (drag.phone) { phonePos = [drag.phone[0] + dx, drag.phone[1] + dz]; phone.setAttribute('transform', `translate(${phonePos[0]} ${phonePos[1]})`); return; }
  vb = [drag.vb[0] - dx, drag.vb[1] - dz, vb[2], vb[3]]; clampVB(); applyVB();
});
svg.addEventListener('pointerup', (e) => {
  const d = drag; drag = null;
  if (!d || d.moved) return;
  const hit = d.target.closest('[data-p]');
  if (hit) select(hit.dataset.p); else closeCard();
});
svg.addEventListener('dblclick', () => { vb = VB0.slice(); applyVB(); });
$('#zin').onclick = () => zoomAt(vb[0] + vb[2] / 2, vb[1] + vb[3] / 2, .7);
$('#zout').onclick = () => zoomAt(vb[0] + vb[2] / 2, vb[1] + vb[3] / 2, 1.43);
$('#zreset').onclick = () => { vb = VB0.slice(); applyVB(); };
function flyTo(x, z, w = 120 * Kf) {
  const from = vb.slice(), h = w * VB0[3] / VB0[2];
  const to = [x - w / 2, z - h / 2, w, h];
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 600), e = 1 - (1 - k) ** 3;
    vb = from.map((v, i) => v + (to[i] - v) * e); clampVB(); applyVB();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
applyVB();

// ---------------------------------------------------------------- place card
const card = $('#card');
const shopIds = W.PLACES.filter((p) => (p.kind !== 'life' && p.kind !== 'spare') || (W.ROUTE_EXTRA || []).includes(p.id)).map((p) => p.id);
function select(id) {
  const p = placeById[id], d = W.DISTRICTS[p.d];
  document.querySelectorAll('.badge.sel, .place.sel').forEach((n) => n.classList.remove('sel'));
  badges[id]?.classList.add('sel'); placeEls[id]?.classList.add('sel');
  const tr = id === 'garage' ? null : trip('garage', id);
  const [sc, sl] = STATUS[p.status];
  card.innerHTML = `
    <button class="cx" data-ui>×</button>
    <div class="ch"><span class="ci" style="--c:${d.color}">${ICON[p.icon] || ICON.mapPin}</span>
      <div><b>${p.name}</b>${p.sub ? `<small>${p.sub}</small>` : ''}</div></div>
    <div class="chips"><span class="chip" style="--c:${d.color}">${d.name}</span><span class="chip" style="--c:${sc}">${sl}${p.from ? ` · from ${p.from}` : ''}</span></div>
    <p>${p.verb}</p>
    <dl>
      ${p.unlock ? `<dt>Price</dt><dd>${p.unlock}</dd>` : ''}
      ${p.era != null ? `<dt>Comes up</dt><dd>${eraTxt(p.era)}</dd>` : ''}
      <dt>From the garage</dt><dd>${tr ? `${fmtS(tr.t)} by car · ${fmtS(tr.tt)} tuned · ${fmtS(tr.walk)} on foot` : 'you are here'}</dd>
    </dl>
    ${tr ? `<button class="go" data-ui>Drive there from the garage</button>` : ''}`;
  card.classList.add('on');
  card.querySelector('.cx').onclick = closeCard;
  const go = card.querySelector('.go');
  if (go) go.onclick = () => { $('#from').value = 'garage'; $('#to').value = id; drive(); };
}
function closeCard() {
  card.classList.remove('on');
  document.querySelectorAll('.badge.sel, .place.sel').forEach((n) => n.classList.remove('sel'));
}

// ---------------------------------------------------------------- route planner
const fromSel = $('#from'), toSel = $('#to');
const opts = shopIds.map((id) => `<option value="${id}">${placeById[id].name}</option>`).join('');
fromSel.innerHTML = opts; toSel.innerHTML = opts;
fromSel.value = 'garage'; toSel.value = 'vip';
let anim = 0;
function drive() {
  cancelAnimationFrame(anim);
  G.route.replaceChildren();
  const a = fromSel.value, b = toSel.value;
  if (a === b) { $('#rt').textContent = 'Pick two different places.'; return; }
  const tr = trip(a, b);
  el('path', { d: d2(tr.pts), fill: 'none', stroke: '#1f3340', 'stroke-width': 3.6 * Kf, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: .5 }, G.route);
  el('path', { d: d2(tr.pts), fill: 'none', stroke: '#fff6e6', 'stroke-width': 2.2 * Kf, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', filter: 'url(#glow)' }, G.route);
  const line = el('path', { d: d2(tr.pts), fill: 'none', stroke: '#f26b5b', 'stroke-width': 1.1 * Kf, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': `${3 * Kf} ${2 * Kf}` }, G.route);
  const car = el('g', {}, G.route);
  el('rect', { x: -1.1, y: -2, width: 2.2, height: 4, rx: .6, fill: '#f26b5b', stroke: '#1f3340', 'stroke-width': .35 }, car);
  el('rect', { x: -.8, y: -.2, width: 1.6, height: 1.7, fill: '#7a4f32' }, car);
  const total = len(tr.pts), speedup = 6, dur = tr.t / speedup * 1000;
  $('#rt').innerHTML = `<b>${fmtS(tr.t)}</b> in your car · <b>${fmtS(tr.tt)}</b> tuned · ${fmtS(tr.walk)} on foot <span class="dim">(${Math.round(tr.L)} m door to door; playing at 6× speed)</span>`;
  const xs = tr.pts.reduce((m, p) => [Math.min(m[0], p[0]), Math.max(m[1], p[0]), Math.min(m[2], p[1]), Math.max(m[3], p[1])], [1e9, -1e9, 1e9, -1e9]);
  const w = Math.max(110 * Kf, (xs[1] - xs[0]) * 1.3, (xs[3] - xs[2]) * 1.3 * VB0[2] / VB0[3]);
  flyTo((xs[0] + xs[1]) / 2, (xs[2] + xs[3]) / 2, Math.min(VB0[2], w));
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const p = line.getPointAtLength(k * total), q = line.getPointAtLength(Math.min(total, k * total + .5));
    const ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI - 90;
    car.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${ang})`);
    if (k < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}
$('#drive').onclick = drive;
$('#swap').onclick = () => { const a = fromSel.value; fromSel.value = toSel.value; toSel.value = a; drive(); };

// ---------------------------------------------------------------- districts section
const dlist = $('#districts');
if (dlist) dlist.innerHTML = Object.entries(W.DISTRICTS).map(([id, d]) => {
  const places = W.PLACES.filter((p) => p.d === id);
  const tr = d.flag === 'garage' ? null : trip('garage', d.flag);
  return `<article class="dc" style="--c:${d.color}" data-d="${id}">
    <header><i></i><b>${d.name}</b><span>${d.tag}</span></header>
    <p>${d.what}</p>
    <div class="dm"><span>${ICON.clock}${d.era ? eraTxt(d.era).replace(' into a save', '') : 'start'}</span><span>${ICON.car}${tr ? `${fmtS(tr.t)} from the garage` : 'home'}</span></div>
    <ul>${places.filter((p) => p.kind !== 'life').map((p) => `<li data-p="${p.id}"${p.kind === 'spare' ? ' class="life"' : ''}>${p.kind === 'spare' ? '' : ICON[p.icon] || ''}<span>${p.name}</span>${p.status !== 'kept' && p.kind !== 'spare' ? `<em class="${p.status}">${p.status}</em>` : ''}</li>`).join('')}
    ${places.filter((p) => p.kind === 'life').map((p) => `<li class="life" data-p="${p.id}"><span>${p.name}</span></li>`).join('')}</ul>
  </article>`;
}).join('');
dlist?.addEventListener('click', (e) => {
  const li = e.target.closest('[data-p]');
  const art = e.target.closest('[data-d]');
  if (li) { focusPlace(li.dataset.p); return; }
  if (art) { const d = W.DISTRICTS[art.dataset.d]; const xs = d.poly.map((p) => p[0]), zs = d.poly.map((p) => p[1]); $('#mapsec').scrollIntoView({ behavior: 'smooth' }); flyTo((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2, Math.max(120 * Kf, (Math.max(...xs) - Math.min(...xs)) * 1.5)); }
});
function focusPlace(id) {
  const p = placeById[id];
  $('#mapsec').scrollIntoView({ behavior: 'smooth' });
  flyTo((p.rect[0] + p.rect[2]) / 2, (p.rect[1] + p.rect[3]) / 2, 110 * Kf);
  select(id);
}

// ---------------------------------------------------------------- timeline
if ($('#timeline')) $('#timeline').innerHTML = W.TIMELINE.map((s) => {
  const p = placeById[s.place], tr = s.place === 'garage' ? null : trip('garage', s.place);
  return `<li data-p="${s.place}" style="--c:${eraColor(p.era ?? 0)}"><span class="tt">${s.t}</span><div><b>${s.title}</b><p>${s.text}</p>
    <small>${ICON[p.icon] || ''}${p.name} · ${tr ? `${fmtS(tr.t)} from the garage` : 'home'}</small></div></li>`;
}).join('');
$('#timeline')?.addEventListener('click', (e) => { const li = e.target.closest('[data-p]'); if (li) focusPlace(li.dataset.p); });

// numbers in the copy: data-n="far|farT|ferry|vip" (A), "max|maxT|maxW|maxName", or "t:id" / "tt:id" / "w:id"
const far = trip('garage', 'quickfit'), ferryT = trip('garage', 'ferry'), vipT = trip('garage', 'vip');
const all = shopIds.filter((id) => id !== 'garage').map((id) => ({ id, ...trip('garage', id) }));
const mx = all.reduce((a, b) => (b.t > a.t ? b : a)), mxW = all.reduce((a, b) => (b.walk > a.walk ? b : a));
document.querySelectorAll('[data-n]').forEach((n) => {
  const k = n.dataset.n, [f, id] = k.split(':');
  if (id) { const t = trip('garage', id); n.textContent = fmtS(f === 'tt' ? t.tt : f === 'w' ? t.walk : t.t); return; }
  n.textContent = k === 'far' ? fmtS(far.t) : k === 'farT' ? fmtS(far.tt) : k === 'ferry' ? fmtS(ferryT.t) : k === 'vip' ? fmtS(vipT.t)
    : k === 'max' ? fmtS(mx.t) : k === 'maxT' ? fmtS(mx.tt) : k === 'maxW' ? fmtS(mxW.walk) : k === 'maxName' ? placeById[mx.id].name : n.textContent;
});
window.__map = { trip, route, select, flyTo };
}
