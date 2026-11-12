// control: the same car NOT towed, parked with a dead battery, must open its hood (so the check above can fail)
const root = process.argv[2];
const C = await import(root + '/src/models/cars.js');
const car = C.createCar(C.lookOf('sedan')); car.setProblems(['battery']);
for (let i = 0; i < 40; i++) car.update(0.05, 0);
let open = false; car.group.traverse((o) => { if (o.isGroup && o.rotation.x < -0.3) open = true; });
console.log('parked dead battery, not towed: hood open =', open);
