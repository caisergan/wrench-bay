// The printed face of a floor mat (mats.js), drawn on a 2D canvas: rubber body, a rim in the state colour, the icon
// chip, the "one more part" ring and the "got it" tick. No three.js, so docs/pickup-redesign can draw it flat too.
import { ICON } from '../ui/icons.js';

export const COL = {
  body: '#33505f', rib: 'rgba(255,255,255,.06)',
  idle: '#6f8c9b', want: '#f6c453', on: '#5fd38d', empty: '#4f6573',
  chip: '#fff6e6', navy: '#2f4858', tick: '#3fb36b',
};

const imgs = {};
/** The game's SVG icon as an <img> (cached). tint: CSS colour for icons painted with var(--c) (the spray can). */
export function iconImage(name, tint) {
  const key = name + '|' + (tint || '');
  if (imgs[key]) return imgs[key];
  let svg = (ICON[name] || '').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" ');
  if (tint) svg = svg.replace(/var\(--c,[^)]*\)/g, tint);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  imgs[key] = img;
  return img;
}

function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/**
 * Paint a mat face filling the canvas (W x H px; the mesh's rounded corners trim the outside).
 * kind: 'station' | 'lift'. icon: ICON name (tint: its var(--c) colour). state: idle | want | on | empty.
 * prog: 0..1 extra-part ring. check: green tick. round: also clip to the mat's rounded outline (the flat gallery
 * has no mesh to do it). Returns false while the icon image is still loading (draw again on its load event).
 */
export function paintMatFace(c, W, H, { kind = 'station', icon, tint, state = 'idle', prog = 0, check = false, round = false }) {
  const img = iconImage(icon, tint);
  c.clearRect(0, 0, W, H);
  c.save();
  if (round) { rrect(c, 0, 0, W, H, 32); c.clip(); }
  // body + faint ribs (an anti-fatigue rubber mat)
  c.fillStyle = COL.body; c.fillRect(0, 0, W, H);
  c.strokeStyle = COL.rib; c.lineWidth = 3;
  for (let x = 18; x < W; x += 18) { c.beginPath(); c.moveTo(x, 10); c.lineTo(x, H - 10); c.stroke(); }
  // rim in the state colour
  const rim = COL[state] || COL.idle;
  c.lineWidth = 11; c.strokeStyle = rim;
  rrect(c, 9, 9, W - 18, H - 18, 22); c.stroke();
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.31;
  // lift mat: chevrons pointing at the car (up the screen)
  if (kind === 'lift') {
    c.strokeStyle = rim; c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const sx of [-1, 1]) for (const dy of [-12, 12]) {
      const x = cx + sx * (R + 42);
      c.beginPath(); c.moveTo(x - 16, cy + dy + 9); c.lineTo(x, cy + dy - 7); c.lineTo(x + 16, cy + dy + 9); c.stroke();
    }
  }
  // icon chip
  c.globalAlpha = state === 'empty' ? 0.5 : 1;
  c.fillStyle = COL.chip; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.lineWidth = 5; c.strokeStyle = COL.navy; c.stroke();
  if (img.complete && img.naturalWidth) c.drawImage(img, cx - R * 0.72, cy - R * 0.72, R * 1.44, R * 1.44);
  c.globalAlpha = 1;
  // extra-part ring: "stand still to take one more"
  if (prog > 0.01) {
    c.lineWidth = 12; c.lineCap = 'round'; c.strokeStyle = COL.want;
    c.beginPath(); c.arc(cx, cy, R + 13, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); c.stroke();
  }
  // tick: "you now hold what the lifts need from this shelf"
  if (check) {
    const bx = cx + R * 0.78, by = cy - R * 0.78;
    c.fillStyle = COL.tick; c.beginPath(); c.arc(bx, by, 21, 0, Math.PI * 2); c.fill();
    c.lineWidth = 4; c.strokeStyle = COL.navy; c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(bx - 9, by + 1); c.lineTo(bx - 2, by + 8); c.lineTo(bx + 10, by - 7); c.stroke();
  }
  c.restore();
  return img.complete;
}
