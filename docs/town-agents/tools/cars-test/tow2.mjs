const root = process.argv[2];
const C = await import(root + '/src/models/cars.js');
let bad = 0;
for (const type of C.CAR_TYPE_IDS) {
  const car = C.createCar(C.lookOf(type));
  car.setProblems(['battery', 'tire']);
  car.setTowed(1);
  const tow = car.group.children[0];
  const pivots = tow.children.filter((o) => o.isGroup && o.children[0]?.isGroup);
  const spins = pivots.map((p) => p.children[0].children);  // squash children: spin (+spare)
  const rot0 = spins.map((ch) => ch.map((m) => m.rotation.x));
  for (let i = 0; i < 60; i++) car.update(0.05, i < 30 ? 3 : 0);   // drive, then stand 1.5 s (parked)
  const rot1 = spins.map((ch) => ch.map((m) => m.rotation.x));
  const frontMoved = [0, 1].some((w) => rot1[w].some((r, j) => Math.abs(r - rot0[w][j]) > 1e-9));
  const rearMoved = [2, 3].every((w) => rot1[w].some((r, j) => Math.abs(r - rot0[w][j]) > 1e-6));
  let hoodOpen = false; tow.traverse((o) => { if (o.isGroup && o.rotation.x < -0.3 && o !== tow) hoodOpen = true; });
  if (frontMoved || !rearMoved || hoodOpen) { bad++; console.log('BAD', type, { frontMoved, rearMoved, hoodOpen }); }
}
console.log('towed checks failed:', bad);
