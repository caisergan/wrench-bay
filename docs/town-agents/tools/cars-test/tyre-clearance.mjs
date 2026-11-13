// No part of a car body (or of any overlay on it) may enter a tyre, in any tyre or body state.
//   node docs/town-agents/tools/cars-test/tyre-clearance.mjs "$PWD" [type ...]
// Samples every visible triangle of the chassis (body, hood, overlays) every ~1.2 cm and tests the points against
// each wheel's tyre (radius r + tread, its width; a flat one may bulge near the floor). Prints the offenders.
const root = process.argv[2];
const THREE = await import(root + '/node_modules/three/build/three.module.js');
const C = await import(root + '/src/models/cars.js');

const STATES = {
  ok: {},
  flat1: { problems: ['tire'], story: 'flat' },
  flat2: { problems: ['tire', 'tire'], story: 'flat' },
  flat3: { problems: ['tire', 'tire', 'tire'], story: 'flat' },
  flat4: { problems: ['tire', 'tire', 'tire', 'tire'], story: 'flat' },
  spare: { problems: ['tire', 'tire'], story: 'spare' },
  worn: { problems: ['tire', 'tire'], story: 'worn' },
  flat3drive: { problems: ['tire', 'tire', 'tire'], story: 'flat', speed: 3, frames: 137 },
  flat1reverse: { problems: ['tire'], story: 'flat', speed: -2, frames: 151 },
  wreck: { setup: (c) => c.setRestore(0) },
  wreckTowed: { setup: (c) => { c.setRestore(0); c.setTowed(1); } },
  towedFlat: { problems: ['tire', 'tire'], story: 'flat', setup: (c) => c.setTowed(1), speed: 3 },
  overlays: { problems: ['tire', 'paint', 'oil', 'battery', 'engine'], story: 'flat',
    setup: (c) => { c.setDirt(1); c.setWet(true); c.setHazard(true); c.setGloss([0.1, 0.9, 0.1, 0.9]); } },
  foam: { problems: ['tire'], story: 'flat', setup: (c) => c.setFoam(1) },
  rinse: { problems: ['tire'], story: 'flat', frames: 20,
    setup: (c) => { c.setFoam(1); for (let i = 0; i < 90; i++) c.update(1 / 60, 0); c.setFoam(0); } },
  masked: { problems: ['tire'], story: 'flat', setup: (c) => c.setMasked(true) },
  patched: { setup: (c) => c.setRestore(1) },
};

const A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3(), AB = new THREE.Vector3(), AD = new THREE.Vector3();
const P = new THREE.Vector3(), Lp = new THREE.Vector3();
function sample(geo, mw, test, step = 0.012) {
  const pos = geo.attributes.position.array, idx = geo.index ? geo.index.array : null;
  const nTri = idx ? idx.length / 3 : pos.length / 9;
  let hits = 0, first = null;
  for (let t = 0; t < nTri; t++) {
    const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
    A.fromArray(pos, ia * 3).applyMatrix4(mw); B.fromArray(pos, ib * 3).applyMatrix4(mw); D.fromArray(pos, ic * 3).applyMatrix4(mw);
    AB.subVectors(B, A); AD.subVectors(D, A);
    const n1 = Math.max(1, Math.ceil(AB.length() / step)), n2 = Math.max(1, Math.ceil(AD.length() / step));
    for (let u = 0; u <= n1; u++) for (let v = 0; v <= n2; v++) {
      const s = u / n1, tt = v / n2;
      if (s + tt > 1 + 1e-9) continue;
      P.copy(A).addScaledVector(AB, s).addScaledVector(AD, tt);
      if (test(P)) { hits++; first ??= P.toArray().map((x) => +x.toFixed(3)); }
    }
  }
  return { hits, first };
}

function check(type, { problems = [], story = null, setup = null, frames = 90, speed = 0 } = {}) {
  const car = C.createCar({ type, color: 0xf26b5b, vip: false });
  car.setProblems(problems);
  if (story) car.setTyreStory(story);
  setup?.(car);
  for (let i = 0; i < frames; i++) car.update(1 / 60, speed);
  car.group.updateMatrixWorld(true);
  const tow = car.group.children[0], chassis = tow.children[0];
  const tests = tow.children.filter((o) => o !== chassis).map((pv, i) => {
    const front = i < 2, r0 = front ? car.dims.wheelRF : car.dims.wheelR, w0 = front ? car.dims.tyreWF : car.dims.tyreW;
    const vis = pv.children[0].children.filter((m) => m.visible && m.geometry);
    for (const m of vis) m.geometry.computeBoundingBox();
    const spare = vis.length && Math.max(...vis.map((m) => m.geometry.boundingBox.max.y)) < r0 * 0.9;
    const r = spare ? r0 * 0.8 : r0, w = spare ? w0 * 0.62 : w0;
    const inv = pv.matrixWorld.clone().invert(), axle = pv.position.y, flat = !spare && axle < r0 - 0.005;
    return (p) => {
      Lp.copy(p).applyMatrix4(inv);
      if (Lp.y < -axle + 0.005) return false;                       // below the floor
      const rho = Math.hypot(Lp.y, Lp.z);
      // a flat tyre (cars.js squashTyre) is squeezed along the spokes that would reach below the floor; there it may
      // bulge sideways by up to FLAT_BULGE (0.4) of its width and spread fore and aft by up to FLAT_SPREAD (0.16)
      // (the outer sidewall only); inside the bead (0.6 r) is rim
      let squeeze = 0;
      if (flat && Lp.y < 0 && rho > r * 0.6) {
        const reach = axle * rho / -Lp.y;
        if (reach < r) squeeze = 1 - (Math.max(reach, r * 0.6) - r * 0.6) / (r * 0.4);
      }
      if (rho > r + 0.0135 + 0.16 * squeeze * r) return false;
      const outer = Math.sign(Lp.x) === Math.sign(pv.position.x);
      return outer ? Math.abs(Lp.x) < w / 2 + 0.4 * w * squeeze : Math.abs(Lp.x) < w / 2;
    };
  });
  const out = [];
  chassis.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    for (let p = o; p; p = p.parent) if (p.visible === false) return;
    const res = sample(o.geometry, o.matrixWorld, (p) => tests.some((t) => t(p)));
    if (res.hits) out.push(`${o === chassis.children[0] ? 'body' : 'part'} ${res.hits} pts, first at ${res.first.join(',')}`);
  });
  return out;
}

const types = process.argv.length > 3 ? process.argv.slice(3) : C.CAR_TYPE_IDS;
let bad = 0;
for (const type of types) {
  const fails = [];
  for (const [name, o] of Object.entries(STATES)) for (const f of check(type, o)) fails.push(`  ${name}: ${f}`);
  bad += fails.length;
  console.log(`${type.padEnd(9)} ${fails.length ? 'TOUCHES A TYRE' : 'clear'}`);
  for (const f of fails) console.log(f);
}
console.log(bad ? `${bad} offenders` : `all clear: ${types.length} types x ${Object.keys(STATES).length} states`);
process.exitCode = bad ? 1 : 0;
