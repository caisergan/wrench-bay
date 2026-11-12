# Open issues collected by the lead from wave-0 reports (assign to the owning later-wave agent)

## For `business` (wave 2: gas, Quick-Fit, diner, depot, academy)
- The `quickfit` parking bay (56, 8.8, yaw PI/2) lies on the VISITS.quickfit approach (x = 56).
- The `gas` parking bay (-56, 8.8) touches the gas visit path at x = -55.
- The `diner` parking bay (x 2.7..6.3, z -26.4) overlaps the diner pad (3.4, -26.4).
- Fix all three in the config (move bays or paths), then check them against the bmain models in the game.
- Quick-Fit `setBusy(i, true)` raises the lift but does not move the car. Gameplay adds `liftHeight(i)` to the car's y while it is busy.
- The gas station canopy roof is translucent so the cars under it stay visible from the camera. Judge in the game whether it reads as a canopy or as a glass box; if it reads as a box, make only the roof panel see-through and keep the fascia opaque, or fade it while the player is under it (ask bmain's file owner or do it in QA).
- Golden wrench w11 (58.6, -5.6) sits in a gap bmain left in the Quick-Fit block (the block ends at x 57.4). Colliders must not cover it.

## For `projects` (wave 2: salvage yard, project cars, showroom)
- The showroom desk (41.5, -29.4) grazes the third turntable's rim (39.5, -32.0). Move the desk in the config.
- `createShowroom().setCollection(ids)` lights the collection-wall niches; wire it to `state.town.classics`.
- The junkyard office shack is outside the fence at x -29..-27, next to the junkyard parking bay.

## For `endgame` (ferry)
- vehicles.js exports `FERRY_DOCK` (43.93, 0, 20.3, rotation.y = -PI/2); the ramp tip lands at world x 50.8.
- `createFerryTerminal().setOpen(0..1)` opens the gangway barrier.
- The ferry ramp bobs about ±0.04 against the quay; this is acceptable.

## For `rescue` (wave 1)
- vehicles.js: `hitch` is the centre of the cradle top in truck-local space. `TOW_BOOM` (≈0.575) is the boom value at which the cradles sit at TOW_LIFT.
- Place the towed car with `car.group.position = hitchWorld - forward * car.dims.ax`, using the same yaw as the truck.

## For `townlife` (wave 1)
- The bus kerb side is local -x (`setDoors(true)`). The police car has `setSiren(bool)`.

## For QA
- Seagull: the folded wings look clumsy when it is perched, and the landing was never seen (people report).
- Check the gas canopy and the diner L5 rooftop terrace from the game camera.

## From the `core` wrap-up report (2026-11-12)
- Core's ferry-terminal placeholder was a grey box at the map origin (inside the garage). bmain has since built the real `createFerryTerminal` in world coordinates. Check it no longer shows at 0,0,0.
- bmain's junkyard fence encloses x -44.5..-29.6, which does not match the default walls in `town.js`. Fix: the model sets `group.userData.solids` and town.js uses it, or core changes its default.
- Pointers now go through `ui.pointer` only. UI handles priority, the limit of three, and hiding on-screen targets.
- Core's unchecked items and remaining brief steps are in `progress/core.md` and `reports/core.md`.

## From the `bhome` wrap-up report (2026-11-12)
- Tow shed: a carport 2.9 m wide, open on the west (alley) side only. Put the truck's enter ring on its west side or at the shed front (core / rescue).
- Wash: `group.userData.zones` gives the exact z of soap, brushes, rinse and dryer. The rinse is 0.5 m south of the brushes, not at the dryer: the car gets wet there and dries at the dryer (comfort).
- Lounge: the glass front is solid except its two 1.8 m door openings. Owner walk paths must use the doors (core / comfort).
- Wash kiosk: nothing places it yet. The preview uses (15.9, 5.0), facing the lane. Add it to the config (comfort).
- The parking bay "P" sign post was removed because it stood in the tow apron. The painted P stays.
