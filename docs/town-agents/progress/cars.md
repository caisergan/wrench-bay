# cars progress (resumed run) — STOPPED at lead's request (usage limit). State is clean: everything parses and tests pass.

## Files (mine)
- src/models/cars.js, src/models/leak.js, src/models/preview-cars.html + preview-cars.js
- src/models/preview-cars-before.js = PREVIEW-ONLY frozen copy of the pre-task cars.js (old|new compare + regression). Delete when no longer needed.
- Tests (node, run from repo root with `node /tmp/wb-cars-test/<x>.mjs "$PWD"`):
  smoke.mjs (all 21 types x all methods, no exceptions), regress.mjs (legacy 5 + gold VIP identical to pre-task: 256/256),
  tow.mjs (front axle stays at z=ax, tyre bottom = TOW_LIFT*k, rear on floor), tow2.mjs (towed: front wheels still, rear roll, hood shut), hood.mjs (control)

## Verified (browser preview + node)
- Legacy compact/sedan/pickup/van/sports + gold VIP: mesh-for-mesh identical to pre-task (geometry checksums + world matrices, all problem combos, parked + driving).
- All 21 types render with no console errors; game-camera lane view at 420x860: every class is a distinct silhouette.
- Damage tyre/battery/engine/paint on the new types (checked hatch, suv, muscle, supercar, bubble, surfvan, hotrod).
- setDirt, setFoam, setWet (drips + damp spots, then dry), setMasked, setStripe, setGloss (per side, polish lap), setColor sweep
  k = 0/.33/.66/1 + live (a control car with the same cached look is NOT recoloured), setRestore 0..3 for all 6 classics (game camera), setTowed.
- Real game (core's no-HMR server :5192, save slot `carscheck`): spawned muscle, camper and rally drive into the garage lane and render.

## Fixed this run
- BLOCKER: cars.js imported a missing `waterDrop` from leak.js (a link-time error for every page). Added a world-space water drip system to leak.js (oil code untouched).
- setTowed rewritten: front axle centre stays at local (0, wheelRF + TOW_LIFT*k, ax); rear tyres on the floor; no droop; hood stays shut on the hook. dims += wheelRF, towLift.
- Hatch got a teal roof on cream cars; muscle hood scoop was a white slab; stripes now cover the muscle scoop.
- Supercar: fender humps, frunk between them (new spec `hw` = hood width); spec `engine: mid|rear` (supercar mid, bubble + surfvan rear): smoke and oil sump come from the real engine; `bayEngine:false` = battery bay without an engine.
- Hot rod: engine and blower moved from the hood mesh to the chassis; the hood is a panel with a hole.
- Dark paint: hood plate matches the roof (legacy colours unaffected). Limo now three-box with a vinyl roof. Bubble 58 no longer a compact look-alike (domed body-colour roof, canvas top, chrome belt, rack + case).
- Dirt: mud flicks clamped to the body; dust = translucent film (2 shared mats). Foam side sheets flat, never below the sill. Wet drips fall outside the body line (spots were hidden under the sills). Open cars: masking paper tented over seats. Sweep clips primer patches; a full respray hides them.

## Front axle (setTowed contract), car-local, car origin at floor level, nose +z
ax (front axle z): compact 0.74, sedan 0.86, pickup 0.90, van 0.92, sports 0.88, hatch 0.80, suv 0.90, muscle 0.94, camper 0.96,
roadster 0.86, rally 0.82, supercar 0.92, limo 0.98, classic 0.98, gsuv 0.90, bubble 0.68, woody 0.90, surfvan 0.86, hotrod 0.98, finback 0.92, gt 0.88.
At setTowed(1): front tyre bottoms at y = TOW_LIFT = 0.42, axle centre y = 0.42 + dims.wheelRF; x = 0. Also in car.dims.ax at runtime.

## Unverified / left
- Not looked at: hazard row (code only), damage on vip `limo/gsuv/classic` and classics `woody/finback/gt` (only via the smoke test), oil trail with `drive=1`, wash run page, tow run `&live`, game `grid=mix` / `grid=states`.
- Real game: watch a full repair of a new class on a lift (lift height / damage clear). Paint / VIP / rescue / wash flows need their gameplay (wave 1).
- Game console showed 3 "Script error." exceptions without a source on :5192 (cross-origin, not attributed; may be other modules or the browser).
- Possible polish: wreck stage could use more missing parts; supercar fender tops are not covered by the gloss/haze overlay; muscle factory stripes survive a respray (by design).
- Delete src/models/preview-cars-before.js when the comparison is no longer needed.
