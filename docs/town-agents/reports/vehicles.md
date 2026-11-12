# Final report: `vehicles` (Sonnet)

_2026-11-12, resume run. Verbatim last message of the subagent._

All three deliverables are built in `src/models/vehicles.js` and checked in the browser at 420x860. That includes the real game camera (`view=game`) with the real environment. The full game page was never loaded, because core's boot flag was not set. No console errors appeared in the preview.

**Tow truck: `createTowTruck(level)`**
- Returns `{ group, hitch, setBoom, setBeacon, update, level }`. The footprint is 1.7 x 3.6 and it faces +z.
- Level 1 is a compact yellow/orange truck.
- Levels 2 and 3 are red/cream, taller, with dual rear wheels, a bull bar, an exhaust stack, three toolbox doors per side and a bigger boom. A second amber light bar sits on the boom head.
- Both have a headache rack, toolboxes, a recovery boom with winch drum, cable and hook, and work lights at the tail.
- The wheel-lift has a telescoping arm, a hydraulic cylinder that follows the arm, and a cross-bar with two L-shaped cradles. At `setBoom(0)` it folds up against the tail; at `setBoom(1)` it lies on the ground and extended.
- `setBeacon(true)` flashes the amber light bar alternately and spins a rotating beacon. It also switches the rear work lights on.
- `update(dt, speed)` spins the wheels.
- The module also exports `TOW_BOOM`, about 0.575. At that boom value the cradle trays sit exactly at `TOW_LIFT`, so a car with `setTowed(1)` is held level.
- **Hitch convention:** `hitch` is a direct child of `group`, and its position (truck-local) is the centre of the cradle trays' top surface. It moves with `setBoom`: about 0.065 high at boom 1 (on the ground), 0.42 at `TOW_BOOM`, and folded against the tail at boom 0.
- **Placing the car:** put the car's front axle over the hitch: `car.group.position = hitchWorld - forward * car.dims.ax`, with the same yaw as the truck.
- **Checked:** in the side view the compact car's front tyres sit in the cradles with nothing intersecting and its rear wheels on the ground. The other types were only seen from above or at an angle, with no clipping spotted: sedan, hatch, SUV, camper, pickup and van, on both truck levels.

**Traffic: `createTrafficVehicle(kind)`**
- All seven kinds are built at the config sizes and read clearly from the game camera. Each returns `{ group, update, setDoors, kind }`, with `setSiren` on the police car.
- **taxi:** yellow with a checker band and a lit roof sign.
- **delivery:** teal cab and cream box with a rear roller door.
- **bus:** destination boards front and rear, and a window band.
  - The doors are on local -x, the right-hand side in the travel direction, and are two leaves that swing outward. On the harbor road heading east, that side faces the camera and the quay.
  - `setDoors(true)` opens them over about 0.45 s.
- **police:** red/blue light bar that double-flashes in `update`. It flashes by default; `setSiren(false)` stops it.
- **icecream:** serving hatch with a striped awning on local -x, and a big cone on the roof.
- **garbage:** compactor body, rear bin-lift arms with a bin hanging on the comb bar, and a blinking amber beacon.
- **scooter:** a seated rider with hands on the bars, built from simple blocks rather than `createCharacter`.

**Ferry: `createFerry()`**
- Returns `{ group, setRamp, update, ramp, dock, deckY }`. The hull has a roll-on deck marked for four cars (slots at x ±0.95, z -3.4 and -0.4). At the bow end it has a lounge, wheelhouse, funnel, radar, life rings, rails, fenders, an anchor and "HARBOR HOPPER" on both sides.
- Local frame: bow +z, stern -z, deck top y 0.3, waterline y -0.4. The environment water is also at -0.4, so group y should be 0.
- The ramp hinges at the stern edge, local (0, 0.3, -5.5). `setRamp(1)` lowers its tip to y 0 at local z about -6.87; `setRamp(0)` stands it up.
- `update` bobs and rolls an inner group, so the outer `group` position stays under gameplay's control.
- **Dock the ferry at** `group.position.set(43.93, 0, 20.3)` with `rotation.y = -Math.PI / 2`. This is also exported as `FERRY_DOCK`. In that pose the lowered ramp tip lands at world x 50.8, on the plaza.
- **Checked:** in the game-camera view against the real environment the ramp meets the plaza and the four cars sit in their slots.

**Files touched:** `src/models/vehicles.js` and the new `src/models/preview-vehicles.html` and `.js`. The preview runs at `/src/models/preview-vehicles.html?focus=tow|towed|traffic|doors|ferry` or `?view=game&scene=tow|traffic|ferry`. `src/models/index.js` is untouched.

**Notes**
- **Door convention for core:** the bus kerb side is local -x. A bus on Main Street heading west has its kerb side facing north.
- **Ferry bob:** the ramp is part of the bobbing hull, so its tip moves about ±0.04 against the quay. I did not compensate.
- **Performance:** each vehicle is one merged mesh plus separate wheels, and nothing is allocated per frame. One truck is about 10 draw calls, a car-size traffic vehicle 6 to 10, a bus about 11. I did not profile on a phone.
- **No changes needed from other owners.**

Progress notes are in `/tmp/wb-progress/vehicles.md`.
