// Voxel helpers: a Builder that collects coloured boxes / cylinders / extrusions into ONE merged,
// vertex-coloured BufferGeometry. All static models are built this way so they cost a draw call each.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _one = new THREE.Vector3(1, 1, 1);

/** Shared lit material (flat look). Colour comes from vertex colours. */
export const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
/** Shared unlit material for emissive things (lanterns, glass, lamp bulbs). */
export const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });

function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  _c.set(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g !== geo) geo.dispose();
  return g;
}

export class Builder {
  constructor() { this.geos = []; this.mat = new THREE.Matrix4(); this.stack = []; }

  /** Push a local transform (position, rotation about Y, uniform scale, optional X rotation). */
  push(x = 0, y = 0, z = 0, ry = 0, s = 1, rx = 0) {
    this.stack.push(this.mat.clone());
    _q.setFromEuler(_e.set(rx, ry, 0));
    this.mat.multiply(new THREE.Matrix4().compose(_v.set(x, y, z), _q, new THREE.Vector3(s, s, s)));
    return this;
  }
  pop() { this.mat = this.stack.pop(); return this; }

  _add(geo, color, x, y, z, rx, ry, rz) {
    _q.setFromEuler(_e.set(rx, ry, rz));
    geo.applyMatrix4(new THREE.Matrix4().compose(_v.set(x, y, z), _q, _one));
    geo.applyMatrix4(this.mat);
    this.geos.push(paint(geo, color));
    return this;
  }

  /** Box of size w,h,d whose BOTTOM centre is at (x,y,z). Rotation about its centre. */
  box(w, h, d, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this._add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, rx, ry, rz);
  }
  /** Cylinder with BOTTOM centre at (x,y,z). */
  cyl(rTop, rBot, h, color, x = 0, y = 0, z = 0, seg = 8, rx = 0, ry = 0, rz = 0) {
    return this._add(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, x, y + h / 2, z, rx, ry, rz);
  }
  /** Extruded 2D shape (shape in XY, extruded along +Z by depth). Origin is the shape origin. */
  shape(shp, depth, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.ExtrudeGeometry(shp, { depth, bevelEnabled: false, curveSegments: 4 });
    return this._add(g, color, x, y, z, rx, ry, rz);
  }

  build() {
    const g = mergeGeometries(this.geos, false);
    for (const x of this.geos) x.dispose();
    this.geos = [];
    g.computeBoundingSphere();
    return g;
  }
}

export function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function polygon(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

export function mesh(geo, mat = litMat, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Cache helper for shared geometries. */
export function memo(map, key, fn) {
  let v = map.get(key);
  if (!v) { v = fn(); map.set(key, v); }
  return v;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
