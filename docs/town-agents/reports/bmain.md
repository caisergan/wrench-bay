# Final report: `bmain` (Sonnet)

_2026-11-12, resume run. Verbatim last message of the subagent._

All eight factories in `src/models/buildings-main.js` are built, in world coordinates with `userData.world = true`. I looked at each from the game-camera preview at phone size, and the console showed no errors. I did not check the full game page. I also did not check the diner at levels 1, 2 and 4 individually, the gas station at levels 1, 2, 4 and 5, Quick-Fit at levels 1, 3 and 5, or the junkyard with people and cars placed.

**Files touched:** `src/models/buildings-main.js`, `src/models/preview-main.html`, `src/models/preview-main.js`. The progress file is `/tmp/wb-progress/bmain.md`.

**Preview page:** `/src/models/preview-main.html` has `?focus=junk|depot|diner|academy|show|gas|qf|ferry` (levels side by side) and `?view=game&tx=&tz=` (real game camera, with the environment unless `&noenv`). Levels are set with `&diner=` `&gas=` `&qf=`. Open it with `?view=game`; the row view is cramped, so I judged the levels from the game view.

## Return shapes
- `createJunkyard()` returns `{ group, update }`.
- `createDepot()`, `createAcademy()`, `createDiner(level)`, `createGasStation(level)` and `createFerryTerminal()` return the Group itself, as the stubs did. The Group also carries `.group` (itself) and `.update(dt)` / `userData.u` where it animates, so `obj.group ?? obj` and `obj.update?.(dt)` both work.
- `createShowroom()` returns `{ group, turntables, update, setCollection(ids) }`.
  - Turntables use bhome's real `createTurntable` at `PROJECT.showroom.turntables`.
  - `setCollection(ids)` is an extra I added; it lights the collection-wall niches for restored classics.
- `createQuickFit(level)` returns `{ group, setBusy(i, bool), update, liftHeight(i), bays, level }`.
  - `setBusy(i, true)` raises the lift and starts sparks and the tool lamp.
  - **Gameplay must add `liftHeight(i)` to the car's y while it is busy; the lift does not move the car.**
- `createFerryTerminal()` has an extra `setOpen(0..1)` for the gangway barrier arm. It starts closed. The clock hands show real time.

## Building decisions
- **Junkyard:**
  - The fence encloses x -44.5 to -29.6 with the sliding gate parked open at `junkGate`.
  - The office shack stands outside the fence at x -29 to -27, next to the junkyard parking bay, so the bay stays reachable.
  - The crane's trolley runs along the boom, the cable hangs vertical, and the magnet picks from the heap and drops into a baler.
  - There are no wreck cars in it; gameplay puts them on the stands.
- **Gas station:** the canopy roof is translucent, so the car and pumps stay visible from above. The pump island is on the car's west side. Levels add pumps, a bigger canopy, a car wash bay, EV chargers and the mini-mart.
- **Quick-Fit:** the bays are open to the south with no roof, like the garage. From level 2 a second bay sits at x 59.2. Level 3 adds a tyre tower and bench, level 4 a translucent canopy and bigger sign, level 5 a second storey.
- **Ferry terminal:** everything stands in the strip north of the ferry lane. The ramp landing, the lane (z 18.4 to 22.2) and the `ferry` parking bay are clear.

## Changes needed from other owners
- **Golden wrench `w11` (58.6, -5.6):** it would sit inside Quick-Fit, so I left the building out of that area. The block ends at x 57.4 and the east stall has only a low workbench, so the wrench is reachable. Core's colliders for Quick-Fit must not cover that corner.
- **Parking bays on visit paths:** the `quickfit` bay (56, 8.8) lies on `VISITS.quickfit`'s approach (x = 56). The `gas` bay (-56, 8.8) touches the gas path at x = -55. Core and env may want to move them or ignore that overlap.
- **Parking bay and pad overlap:** the `diner` parking bay (x 2.7 to 6.3) overlaps the diner pad at (3.4, -26.4). This comes from the config, not from my models.
- **Showroom desk:** the desk at (41.5, -29.4) grazes the third turntable's rim. This is also fixed by the config.
- **Roof signs:** they stand on the roof or the back wall, not on the facade, because from the camera you mostly see roofs.
