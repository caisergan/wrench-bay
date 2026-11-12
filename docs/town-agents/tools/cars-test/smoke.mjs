const root = process.argv[2];
const THREE = await import(root + '/node_modules/three/build/three.module.js');
const C = await import(root + '/src/models/cars.js');
const L = await import(root + '/src/models/leak.js');
const scene = new THREE.Scene();
let errs = 0;
for (const type of C.CAR_TYPE_IDS) {
  try {
    const car = C.createCar(C.lookOf(type));
    scene.add(car.group);
    car.setProblems(['tire', 'oil', 'battery', 'engine', 'paint']);
    for (let i = 0; i < 30; i++) car.update(0.05, i < 15 ? 0 : 3);
    car.setProblems(['tire','tire']);
    car.setColor(0x3b82c4, 0.5); car.update(0.016, 0);
    car.setColor(0x3b82c4, 1);
    car.setStripe(0xffffff); car.setStripe(null);
    car.setMasked(true); car.setMasked(false);
    car.setDirt(1); car.setDirt(0.5); car.setDirt(0);
    car.setFoam(1); for (let i = 0; i < 40; i++) car.update(0.05, 0);
    car.setFoam(0); car.setWet(true); for (let i = 0; i < 120; i++) car.update(0.05, 0);
    car.setGloss([0, 0.3, 0.8, 1]); car.update(0.5, 0);
    car.setHazard(true); car.update(0.5, 0); car.setHazard(false);
    car.setTowed(1); car.update(0.05, 3); car.setTowed(0);
    if (['bubble','woody','surfvan','hotrod','finback','gt'].includes(type)) for (const st of [0,1,2,3]) { car.setRestore(st); car.update(0.05, 0); }
    car.setShine(true); for (let i = 0; i < 10; i++) car.update(0.1, 0);
    L.updateLeaks(0.1);
    const box = new THREE.Box3().setFromObject(car.group);
    const sz = box.getSize(new THREE.Vector3());
    console.log(type.padEnd(9), 'w', sz.x.toFixed(2), 'h', sz.y.toFixed(2), 'l', sz.z.toFixed(2), 'dims', JSON.stringify(car.dims));
  } catch (e) { errs++; console.log('ERR', type, e.stack.split('\n').slice(0, 4).join(' | ')); }
}
console.log('errors', errs);
// project-car flow: patched classic painted with a sweep
{
  const car = C.createCar(C.lookOf('woody'));
  scene.add(car.group);
  car.setRestore(1); car.setProblems(['paint']);
  for (const k of [0.2, 0.5, 0.9]) { car.setColor(0xe5484d, k); car.update(0.016, 0); }
  car.setColor(0xe5484d, 1); car.setRestore(2); car.update(0.016, 0); car.setRestore(3); car.update(0.5, 0);
  console.log('project flow ok');
}
