# env progress (resumed run, agent 2) — STOPPED by lead (usage limit). Everything parses, ?nogame loads, no console errors.

## envdress integration: DONE + verified in browser
- environment.js builds `env = { root, S, F, G, signs, rnd, geo: streetGeo() }` and calls `buildHarbor` then
  `buildStreetLife` via NAMESPACE imports (`import * as Harbor/Life`): a missing export logs a warning, no crash. Each in
  its own try/catch (console.error); each gets its own seeded rnd (mulberry32(7001)/(7002)). Layers + SignAtlas are built
  after both return; `.update?.(dt, t)` of their return value runs every frame. envdress content shows in ?nogame.
- Legacy harbor dressing (bollards, pier, boats, buoys) and the legacy far-sidewalk lamps/trees/bushes were REMOVED
  from environment.js (envdress owns them now). Water plane (y -0.4, z >= 16.6, 300 wide) + its animation stay here.
- Sign atlas (32 cells): env uses ~10 (BUS, SLOW, SERVICE LANE, 6 shop names); ~20 left for envdress.

## Done + verified (looked at from the game camera / overview)
- environment.js: legacy lot (hall, forecourt, patio, decor, sign, clock) now builds into chunk layers S/F/G (env-kit
  ChunkBuilder); calls env-streets, env-terrain, env-town, envdress; exports `townSolids()`; debug hook `?envdebug` ->
  window.__envDebug = { scene, root, townSolids }. Legacy lot looks as before from cam 0,2.
- Relocations: west forecourt hedge, cones, sandwich board, tire display -> "crew corner" behind the tow shed
  (x -13.5..-9.8, z -12.5..-5.6) with the old parasol table, tyre stacks, drums, a tree. Pillar planters: west removed
  (was on tow apron), east planter + bin moved to x 10.45, z -0.8 / 0.1 (between hall and lounge annex, off the crossing).
  Legacy trees/bushes/rocks around the hall (back lane, plots, alleys) removed. Driveway slabs now stop at z 11.0.
- index.js: `export { buildEnvironment, townSolids } from './environment.js';`
- env-kit.js: SignAtlas cell with `bg: null` = transparent (fixed BUS/SLOW ground text drawing an opaque black box).
- env-streets.js (predecessor): ground, roads, sidewalks, markings, zebras, bays, lots: renders correctly.
- env-terrain.js: buildTerrain (heightfield, 33 meshes, 7.7k tris, no shadow cast), buildCliffs (rock cliff faces at
  x=+/-64 + 4 tunnel portals/closed tubes with dark road + lamps, backfill), buildQuay (coping + wall along Harbor St,
  ferry plaza slab + coping/walls on its west and south edges, plaza paving x 61..63.4).
- env-town.js: buildFillers (NW/NE corner shops facing Main St; W/E filler terraced houses facing the avenues with
  picket-fenced front gardens), buildBackdrop (paved nooks between the north plots, brick garden wall at
  z -37.66..-37.92, Rope Walk lane, house row, houses + trees on the hill, cliff-foot verge). NW corner + north centre
  looked at: OK.

## Done but NOT verified in the browser
- NE corner shops, W/E avenue houses close-up, tunnel portals close-up (does a car at x=+/-72 stay hidden, can you see
  into the tube from the camera at tx=+/-57), cliff-foot verge, hill houses, the reduced tree strips (last edit).

## Numbers (game camera, 420x860, ?nogame, incl. envdress content at that time)
- whole env: ~155k tris in 193 meshes before the tree reduction; chunk meshes 68; townSolids 54 boxes (mostly envdress's).
- per view: calls 42-66, tris 80-115k with shadows / 27-62k without (shadow pass ~doubles). Measured at 0,2 / -10,-33 /
  +/-57,-33 / +/-57,15.5 / 0,15.5 / +/-30,-5. Since then hill trees were cut to the visible strips (re-measure).

## Left in the brief (next agent)
1. Full camera pass in steps of ~12 units over TOWN.camClamp (use gc() helper below), screenshots looked at; fix
   anything floating / z-fighting / any visible world edge (esp. south-east + south-west corners with the headlands,
   tunnel mouths at tx=+/-57).
2. Verify tunnels really hide a car at TOWN.edge.westX/eastX (place a box at x=+/-72 via __envDebug.scene and look).
3. townSolids(): check boxes match what is solid (env-kit dumpster/recyclingBins register; my fillers are covered by
   TOWN.fillers obstacles, nothing else of mine inside walkable areas). Consider registering nothing more.
4. Performance: re-measure; if needed, put hill trees/houses in a non-shadow-casting layer.
5. Optional polish: verge trees on the lawn strip west of the paint plot (x -44.9..-43.5); NE shop check.

## How to look (browser, search MCP; other agents sometimes navigate your tab: always open your own)
- URL: http://localhost:5190/?nogame&envdebug&cam=0,0 ; the page full-reloads whenever any agent saves a file.
- localStorage '__ovsetup' holds a helper: `eval(localStorage.getItem('__ovsetup'))` then `gc(x, z)` = exact game camera
  at target x,z; `ov(0,-8,200,{rot:true})` = whole-town overview (screen up = east); `stats()` = calls/tris; `ui(false)`.

## Known issues
- Corner-shop roofs are large/dark from the camera (realistic, could use lighter ROOFS).
- None blocking.
