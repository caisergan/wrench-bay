# polish progress

> 2026-11-12 ~19:55: the polish subagent (Opus, high) was cut off by the 5-hour rate limit right after slimming the
> turbo dryer hood and starting a bot run (save=polish2). From here the LEAD continues the role directly (owner asked:
> no subagent). Same brief, same log.

## Done and verified
- Read brief, TOWN.md, CONTRACTS.md, config.town.js, env/envdress/bhome/core reports.
- Baseline perf (?nogame, 462x946 viewport, renderer.info incl. shadow pass), BEFORE any change:
  0,2: 66 calls / 107k tris; -30,2: 53 / 108k; 20,4: 51 / 93k; 36,0: 51 / 108k; -55,4: 49 / 86k;
  55,14: 50 / 79k; 0,-28: 53 / 107k; -35,-30: 44 / 103k.

- (B) WASH reshaped in config.town.js (laneZ 3.7, approach, kioskStop, kiosk, stations, tunnel, exit, gap,
  cleanCarsFromLevel 2, pile, vacuums); PROPERTIES.wash.plot = x 15.0..23.6, z 1.8..5.6 (pad unchanged 16.4,7.3);
  w06 moved to (15.95, 10.2). Map comment updated.
- (B) createWashArches(tier) rebuilt as a drive-through gantry (buildings-home.js), kiosk inside the group;
  createWashKiosk tier 3 lost its vacuum stand (vacuum pillars are in the park now).
- (B) src/game/wash.js (registered in features.js): dirt roll, leave hook, queue, effects, coins, stats, event,
  offline source, debug __game.wash.{state(), send({dirty, x})}.
- (B) cars.js: fac.hooks.leave hook in waitOwner; car.holding (never ghost through a held car).
- (B) cash.js: CashPile { make } option (coin stacks).
- (B) town.js: wash default solids + one building site on the plot.
- (B) env-life.js garden rebuilt (park south of the wash, small fountain, benches, bed, path to the coin pile);
  env-streets.js lawn only south of the wash plot, driveway concrete strip trimmed, wash plot base = old asphalt.
- VERIFIED in browser: level 1 dirty car: approach, kiosk stop, foam after soap, mud off at brushes, rinse wet,
  blower dry, shine, coins + stats; clean car at level 1 leaves by the driveway; level 2: clean car washes, two cars
  back to back queue (second waits at the pickup stop, min distance 3.0 m), tri-colour foam, roller.

- (B, lead) tier 3 at the tunnel from the game camera: tri-colour foam on the car, brushes, slim turbo hood, roof blowers.
- (B, lead) real garage loop, wash level 3, bot speed 4, ~2 min: 49 washes, cars flow lift -> wash -> east alley ->
  Harbor St, the queue at the pickup stop clears, no stuck car.
- (B, lead) reload with a car mid-tunnel (x 20.7): the game comes back, the wash keeps running (washes 56 -> 57), no errors.
- (B, lead) no-wash regression (save polishnowash, town open, no wash, bot speed 4 with pads, ~2 min): every leaving car
  takes the exit driveway (x 13), no dirt rolled, 3 unlocks bought, no errors.
- (B, lead) TOWN.md 4.6 rewritten for the drive-through.

- (A, lead) ground: env-kit.js new real-scale textures (concrete 2 x 2.67 m slabs / 16 m, asphalt + tar snakes,
  alley with repair patches + crack networks, gravel grain + pebbles, pavers 0.6 x 0.4 running bond, lawn, meadow);
  world-space UVs; jointed kinds (concrete, plaza) get a per-cell offset + flip on a joint-aligned 16 / 12 m grid;
  every kind gets a seamless macro tone term in the shader (two very blurred samples); one mesh per kind per 30 m
  chunk (flushSurfaces). Looked at from the game camera: no seams, no visible tiling.
- (A, lead) env-streets.js: real sidewalk flags with sunken joints, cracked / replaced flags, weeds in joints, jointed
  kerb stones, gutter channel, worn road paint, asphalt + trench patches, lane oil bands, oil under bays, tyre scuffs,
  weeds along lane edges; concrete edging around gravel lots, lawn kerbs, channel round the wash plot.
- (A, lead) env-plots.js: vacant-lot dressing for 12 plots (paint, vip, lounge, wash, tow, gas, quickfit, junkyard,
  diner, showroom, depot, academy), API setPlotCleared / plotSolids (environment.js, models/index.js), town.js
  setVacant(): verified hide on buy, hidden after reload, back after shop:changed for an unowned plot, solids added /
  removed with it; build-time keep-clear check is silent.

- (A, lead) town pass over camClamp at phone size: fixed the X-shaped scuffs (now curved turn marks at the garage
  driveways), Bay Classics bay lines on grass (now cracked tarmac), meadow contrast, Spray Bay's empty gravel (ruts,
  hardcore heap). Corners: no visible world edge.
- (A, lead) perf after (calls / tris): 0,2 78/119k; -30,2 62/128k; 20,4 66/116k; 36,0 61/120k; -55,4 63/105k;
  55,14 64/97k; 0,-28 65/120k; -35,-30 55/124k. The increase is the vacant-plot dressing (incl. its shadow pass).
- `vite build` passes. Final report: docs/town-agents/reports/polish.md.

## In progress
- (none)

## Next
- (optional) tighter culling for plot dressing (12 m chunks) if the triangle count matters on device.

## Browser helper
- localStorage '__polish': `await eval(localStorage.getItem('__polish'))` -> go(x,z) moves the pinned camera
  (works with ?cam=..), stats(), measure([[x,z],...]). Finds the live engine module (Vite ?t= URL).

## Known issues / assumptions
- "Script error. @ :0:0" in the console only appears after javascript_tool calls (tool artifact); a clean load has none.
