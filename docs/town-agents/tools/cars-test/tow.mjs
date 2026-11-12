const root = process.argv[2];
const THREE = await import(root + '/node_modules/three/build/three.module.js');
const C = await import(root + '/src/models/cars.js');
const v = new THREE.Vector3(), box = new THREE.Box3();
let worst = 0;
for (const type of C.CAR_TYPE_IDS) {
  const car = C.createCar(C.lookOf(type));
  for (const k of [0, 0.5, 1]) {
    car.setTowed(k); car.update(0.016, 2);
    car.group.updateMatrixWorld(true);
    // wheels: [FL, FR, RL, RR] = first four pivots under tow
    const tow = car.group.children[0];
    const pivots = tow.children.filter((o) => o.isGroup && o.children[0]?.isGroup);
    const out = pivots.map((p) => { p.getWorldPosition(v); return [v.y, v.z]; });
    const fr = out.slice(0, 2), rr = out.slice(2, 4);
    const fBottom = fr[0][0] - car.dims.wheelRF, rBottom = rr[0][0] - car.dims.wheelR;
    const err = Math.max(Math.abs(fBottom - C.TOW_LIFT * k), Math.abs(fr[0][1] - car.dims.ax), Math.abs(rBottom));
    worst = Math.max(worst, err);
    if (k === 1) console.log(type.padEnd(9), 'front axle z', fr[0][1].toFixed(3), '(ax', car.dims.ax + ')', 'front tyre bottom', fBottom.toFixed(3), 'rear tyre bottom', rBottom.toFixed(3), 'rear axle z', rr[0][1].toFixed(3));
  }
}
console.log('worst error', worst.toExponential(2));
