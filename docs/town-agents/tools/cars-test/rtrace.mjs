const root = process.argv[2];
const A = await import(root + '/src/models/preview-cars-before.js');
const B = await import(root + '/src/models/cars.js');
for (const [name, M] of [['old', A], ['new', B]]) {
  const orig = Math.random; let n = 0;
  Math.random = () => { n++; if (n <= 3) console.log(name, 'call', n, new Error().stack.split('\n')[2].trim()); return 0.5; };
  M.createCar({ type: 'compact', color: 0xf26b5b });
  Math.random = orig;
  console.log(name, 'total random calls in createCar', n);
}
