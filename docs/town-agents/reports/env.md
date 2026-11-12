# Final report: `env` (Opus)

_2026-11-12, resume run (stopped early for usage limits). Verbatim last message of the subagent._

I stopped as you asked. Every file of mine parses with `node --check`, and `?nogame` loads with no console errors (68 chunk meshes, 54 boxes from `townSolids()`). What's left is listed below, and /tmp/wb-progress/env.md has everything the next agent needs to resume.

**envdress's modules are wired in and show in the game.** environment.js calls `buildHarbor` and then `buildStreetLife`, each in its own try/catch with its own seeded random, runs whatever `update` they return every frame, and builds the shared layers and sign atlas after both calls. I import their files as namespaces, because their half-written env-harbor.js briefly had no `buildHarbor` export and a named import broke the whole page. A missing export now logs a warning instead. I removed the old harbor pieces (bollards, pier, boats, buoys) and the old far-sidewalk lamps and trees from environment.js; envdress owns those now.

**Built and looked at in the browser:**
- **Garage lot:** looks as before from the home camera, now merged into ~30 m chunks.
- **Relocations:** the props that stood on the tow apron and on the lounge crossing (hedge, cones, sandwich board, tire display, parasol table) moved to a crew corner behind the tow shed. The east planter and bin now sit between the hall and the lounge annex. The old trees and bushes on the back lane, plots and alleys are gone.
- **Streets:** the previous agent's ground layer renders correctly. I fixed one bug: painted ground text (BUS, SLOW) showed as opaque black boxes; it is now transparent.
- **Terrain (env-terrain.js):** rock cliffs at x = ±64 with the four tunnel mouths set into them. Each tunnel is a closed tube with a dark road and lamps inside. There are also headlands running into the sea and a hill north of the town.
- **Quay:** stone edging and a quay wall along all of Harbor Street. The ferry plaza is now a solid stone pier with its own walls and paving out to the cliff.
- **Fillers and backdrop (env-town.js):** six Main Street corner shops with invented names, terraced houses on the two avenue filler blocks, and paved nooks between the north plots. A brick wall closes those nooks at the back. Behind it run a lane, a row of houses, houses and trees on the hill, and planted verges at the cliff feet.
- **`townSolids` export** added to src/models/index.js.

**Built but not yet checked by eye:**
- North-east corner shops and the avenue houses close up.
- Whether a car spawning at x = ±72 really stays hidden inside the tunnel. My sight-line check on paper says yes; it has not been looked at.
- Cliff-foot verges, hill houses, and the last edit, which cut hill trees down to the strips the camera can see.

**Performance:**

| | Draw calls | Triangles |
|---|---|---|
| Per view, with shadows | 42-66 | 80-115k |
| Per view, without shadows | 26-50 | 27-62k |
| Whole world (all meshes) | 193 meshes | ~155k |

These include envdress's content and were measured before the tree cut. The shadow pass roughly doubles the triangle count.

**What is left:**
1. A full pass over the camera area in ~12-unit steps with screenshots, fixing anything floating, z-fighting, or any visible world edge (the south-east and south-west headland corners matter most).
2. Confirm the tunnels hide a car spawned at x = ±72.
3. Check that the `townSolids()` boxes match what is actually solid.
4. Re-measure performance. If needed, stop the hill trees and houses from casting shadows.
5. Polish: the corner-shop roofs are large and dark from the camera, trees on the lawn strip west of the paint plot, and a look at the north-east shops.

**Files touched:** src/models/environment.js, src/models/env-kit.js (transparent sign background only), src/models/env-streets.js (the BUS text style), the new src/models/env-terrain.js and env-town.js, and the one export line in src/models/index.js.

**Notes for you and other owners:**
- Another agent navigated my browser tab to their own preview page, so agents should open their own tab and always pass its id.
- The dev server reloads the page whenever any agent saves a file, which wipes console setups. I saved a camera helper in localStorage (`__ovsetup`); how to use it is in the progress file.
- No changes are needed from other owners.
