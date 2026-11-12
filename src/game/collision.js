// Circle push-out against static boxes {minX,maxX,minZ,maxZ}, dynamic capsules (cars) and the bounds rectangle.
import { clamp } from './util.js';

function pushOutBox(pos, r, b) {
  const cx = clamp(pos.x, b.minX, b.maxX), cz = clamp(pos.z, b.minZ, b.maxZ);
  const dx = pos.x - cx, dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2), k = (r - d) / d;
    pos.x += dx * k; pos.z += dz * k;
  } else {
    // centre is inside the box: leave through the nearest face
    const l = pos.x - b.minX, rr = b.maxX - pos.x, t = pos.z - b.minZ, bt = b.maxZ - pos.z;
    const m = Math.min(l, rr, t, bt);
    if (m === l) pos.x = b.minX - r; else if (m === rr) pos.x = b.maxX + r;
    else if (m === t) pos.z = b.minZ - r; else pos.z = b.maxZ + r;
  }
  return true;
}

/**
 * Capsule = segment (ax,az)-(bx,bz) with radius cr. Pushes the circle (pos, r) out of it.
 * When the centre sits exactly on the segment it leaves sideways (perpendicular to the segment).
 */
function pushOutCapsule(pos, r, c) {
  const sx = c.bx - c.ax, sz = c.bz - c.az;
  const l2 = sx * sx + sz * sz || 1e-6;
  const t = clamp(((pos.x - c.ax) * sx + (pos.z - c.az) * sz) / l2, 0, 1);
  const px = c.ax + sx * t, pz = c.az + sz * t;
  let dx = pos.x - px, dz = pos.z - pz;
  const R = r + c.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= R * R) return false;
  let d = Math.sqrt(d2);
  if (d < 1e-5) { const l = Math.sqrt(l2); dx = -sz / l; dz = sx / l; d = 1; }
  const k = R / d;
  pos.x = px + dx * k; pos.z = pz + dz * k;
  return true;
}

/** Resolve a circle against boxes, capsules (may be null) and the bounds rectangle. skip = capsule owner to ignore. */
export function resolveCircle(pos, r, boxes, bounds, capsules = null, skip = null) {
  for (let pass = 0; pass < 3; pass++) {
    let hit = false;
    if (capsules) {
      for (let i = 0; i < capsules.length; i++) {
        const c = capsules[i];
        if (c.owner !== skip && pushOutCapsule(pos, r, c)) hit = true;
      }
    }
    for (let i = 0; i < boxes.length; i++) if (pushOutBox(pos, r, boxes[i])) hit = true;
    pos.x = clamp(pos.x, bounds.minX + r, bounds.maxX - r);
    pos.z = clamp(pos.z, bounds.minZ + r, bounds.maxZ - r);
    if (!hit) break;
  }
}

/** True if the circle overlaps any box. */
export function circleHitsBoxes(x, z, r, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const cx = clamp(x, b.minX, b.maxX), cz = clamp(z, b.minZ, b.maxZ);
    if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) return true;
  }
  return false;
}
