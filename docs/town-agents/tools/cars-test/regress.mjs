const root = process.argv[2];
const THREE = await import(root + '/node_modules/three/build/three.module.js');
const A = await import(root + '/src/models/preview-cars-before.js');
const B = await import(root + '/src/models/cars.js');
function meshes(car) { const out = []; car.group.traverse((o) => { if (o.isMesh && o.visible) out.push(o); }); return out; }
function sig(m) { m.updateWorldMatrix(true, false); const g = m.geometry; const p = g.attributes.position.array, c = g.attributes.color?.array; let sp = 0, sc = 0; for (let i = 0; i < p.length; i++) sp += p[i] * ((i % 7) + 1); if (c) for (let i = 0; i < c.length; i++) sc += c[i] * ((i % 5) + 1); const e = m.matrixWorld.elements; return `${p.length}|${sp.toFixed(3)}|${sc.toFixed(3)}|${e.map(v=>v.toFixed(3)).join(',')}`; }
const looks = [];
for (const t of ['compact','sedan','pickup','van','sports']) for (const col of [0xf26b5b, 0xf2e8d5, 0x3d6fb6]) looks.push({ type: t, color: col, vip: false });
looks.push({ type: 'sports', color: 0xf0b429, vip: true });
const probs = [[], ['tire'], ['tire','tire'], ['oil'], ['battery'], ['engine'], ['paint'], ['tire','oil','battery','engine','paint']];
let bad = 0;
for (const look of looks) for (const pr of probs) for (const speed of [0, 3]) {
  // seed Math.random identically for both builds
  let seed = 1; const rnd = () => { if (new Error().stack.includes('generateUUID')) return 0.5; return (seed = (seed * 16807) % 2147483647) / 2147483647; };
  const orig = Math.random;
  Math.random = rnd; const a = A.createCar(look); a.setProblems(pr); for (let i = 0; i < 20; i++) a.update(0.05, speed);
  seed = 1; Math.random = rnd; const b = B.createCar(look); b.setProblems(pr); for (let i = 0; i < 20; i++) b.update(0.05, speed);
  Math.random = orig;
  const sa = meshes(a).map(sig), sb = meshes(b).map(sig);
  const same = sa.length === sb.length && sa.every((x, i) => x === sb[i]);
  if (!same) { bad++; if (bad < 12) { console.log('DIFF', look.type, look.color.toString(16), look.vip ? 'vip' : '', pr.join('+') || '-', 'speed', speed, 'meshes', sa.length, sb.length); for (let i = 0; i < Math.max(sa.length, sb.length); i++) if (sa[i] !== sb[i]) { console.log('   #', i, (sa[i]||'').slice(0,60), '\n   >', (sb[i]||'').slice(0,60)); break; } } }
}
console.log('combos with differences:', bad, 'of', looks.length * probs.length * 2);
