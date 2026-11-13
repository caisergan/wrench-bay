# rescue: report (2026-11-13)

## What I built
The tow truck's rescue calls, levels 1 and 2, and the `ctx.rescue` API the dispatcher drives (TOWN.md 4.5).
- **Calls.** One at a time (`maxCalls`). First call at h3 `firstDelay` s after the truck exists (also on a save that
  owns the truck but never had one), then `interval` (x0.75 from level 2) after each delivery. Spot choice: open
  district, nothing within 5 m of the car or its hook pose, off screen preferred, not the last one.
- **The scene.** The customer's car (garage `rollLook`, never VIP, does not eat the "New in town" arrival), 3-4
  problems from the unlocked part types with at least one visible (engine smoke / hood up / a flat, the tyre story is
  carried over to the garage car), hazards, a solid capsule. Its owner stands on the pavement behind it looking at a
  phone and waves at a driven tow truck within `waveDist`. A red warning triangle stands behind the car on the road
  side, turned partly to the camera (edge-on it read as a red line); a vehicle driving over it knocks it flat. On
  screen the car rolls in along the kerb lane from off screen and coasts onto the kerb, then the owner hops out with
  the triangle and puts it down. HUD: radio sfx, chip with countdown (no timer after `callTime`), rescue pointer,
  "Truck" pointer while the truck is parked and you are on foot, `call` label with the fast-bonus bar,
  `rescue:call`, first-time hint, guide (truck -> car -> drop zone -> off after the first delivery).
- **Hook-up.** A zone ring in front of the car's nose. Truck slower than `hookMaxSpeed`, stowed hitch within
  `hookRadius` of the ring, heading within `hookAngle`: mode 'auto', beacon, the truck lines up on the stop pose
  (reverses onto it; if it is off to the side or past it, it pulls forward along the lane and reverses back onto the
  kerb with an S-bend, never nosing along the kerb), lowers the wheel-lift, backs the last 1.2 m so the cradles slide
  under the front tyres, lifts (car nose up). Meanwhile the owner fetches the triangle and hops into the cab (the
  passenger door, or the driver's door when the passenger side is water / a wall). Then `rescue:hooked`, "Fast
  rescue!" + perfect sfx, chip "Tow it to the garage", hint pill "Drop the car at the garage first" (no P pointer, no
  parking), lane slot reserved (retried every frame while towing; the garage spawner leaves the next free slot to it).
  Facing the car: info "Turn round: back up to its nose".
- **Towing** (towing.js): R pulled behind the hitch, articulation clamped to `maxArticulation` (also pivots / reverse),
  middle + rear circles pushed out of walls, bounds and other cars and the heading re-derived, no update while the
  hitch stands still, rear wheels roll with the car's own travel. Capsule (owner = truck) and a mover marked `ped`
  so AI cars wait behind it and never ghost through.
- **Drop (the lead's new zone).** Painted tow zone (yellow box, dashed inner line, TOW in block letters, pulsing fill
  while towing) built from RESCUE.drop. Truck centre inside, slower than `hookMaxSpeed`, heading east or north within
  `dropAngle`: lift down in place, the stand-in becomes a garage car in the same frame (same look and tyre story,
  `payMult` x2.5 / x3.75 (x1.5 fast), "Rescue x.." / "Fast rescue x.." bonus, `car.rescue`), the owner hops out of the
  truck's door and walks to the waiting area (no second owner), `stats.rescues`, fame, `rescue:delivered`, done sfx,
  first-time toast; the truck pulls 0.8 m forward (cradles out; waits if something is right ahead) and stows. The car
  takes its own way into the lane behind the truck (heading east: right turn south to the lane head, then east;
  heading north: straight back to the lane if needed, then east), waits for the truck or a garage car on the move,
  and is marked `holding` so arrivals wait for it. Gem when a fast rescue's repair pays out. Wrong heading in the
  zone: "Drive in heading east"; lane / lounge full: "Garage lane full: wait a moment" and it retries.
- **Saving.** `state.town.rescue = { next, call, more, first, last }` (created lazily). A reload or `shop:changed`
  while waiting / hooking / towing / before the hand-over brings the car back to its spot as an open call (fast time
  kept only if left); reservations are not saved.
- **Level 2** heavy wrecker: the hook pose follows the model's own hitch; payMult[1]; interval x0.75.
- **Dispatcher HUD** (their request): a call claimed by 'dispatcher' shows "Your tow driver is on it", no pointers,
  no guide. The car shuts its hood on the hook also off screen.
- **Debug:** `__game.rescue(spotId?)`, `__game.rescueState()`, `__game.rescueTruckTo(dl, dt, dyaw)`,
  `__game.rescueFootprints(on)` (car / truck stop + final pose / owner / triangle outlines at every spot).

## Files
Mine: `src/game/rescue.js` (865 lines: system, API, hook / drop, HUD, debug), `src/game/rescue-scene.js` (484: the
scene, owner, triangle, roll-in, curves, line-up planner), `src/game/towing.js` (128: trailer), `src/models/props-rescue.js`
(131: warning triangle, phone, tow zone). Test helpers: `docs/town-agents/tools/rescue/setup.js`, `autopilot.js`.
Progress: `docs/town-agents/progress/rescue.md`.

Shared-file changes (all additive):
1. `src/game/vehicles.js`: script step kind `'fn'` (`{ kind: 'fn', fn(dt, vehicle) -> done }`, used by the hook-up /
   drop and by the dispatcher); the P parking pointer only while `v.canLeave()`.
2. `src/game/owners.js`: Owner constructor reads optional `car.ownerStart = { look, from, door }` (owner hops out of
   the truck instead of the car).
3. `src/game/town.js` `updateGuideDefault`: after the truck step, `ctx.rescue?.guideTarget?.()`.
4. `src/game/features.js`: `import './rescue.js';`.
5. `src/models/index.js`: exports `createWarningTriangle, createTowZone, createPhone`, `TOW_BOOM, TOW_LIFT`.
6. `src/config.town.js` RESCUE: h3 x 22 -> 18 (stop pose overlapped the quay FRESH BAIT stall), h6 x -50.6 -> -50.25 and
   h7 x 50.6 -> 50.25 (stop pose overlapped the gas station / Quick-Fit plots), new `keep: { back: 4.4, ahead: 7.2 }`
   for the environment. (My earlier drop ring z / noseZ change was superseded by your drop zone.)
Garage hook patched at runtime (restored on dispose): `garage.hooks.canSpawn` is false while a towed car waits for a
lane slot.

## How I verified (Browser view 1408x880 and Mobile 462x946, from the game camera, mostly at 1x with frame pauses)
- Fresh save: openTown, buy('tow'): call at h3 after the shed, toasts "A car broke down!...", chip 1:15 + countdown,
  rescue pointer, guide arrow on the truck, rescue:call event; then hook toast, "Rescued! It pays x2.5"; hints saved.
- Hook-up paused at every phase: line-up, lift down beside the nose, cradles under the tyres, nose up, owner with the
  triangle at the door, hop in. Off-pose stops (lateral 1.6 m, 0.4 rad): pull forward in the lane + reverse S-bend
  (logged path). Natural approach from the lane at speed. Head-on: info label. Level 2 red truck: same, correct pose.
- Towing: Harbor St both ways incl. a U-turn / pivot (articulation hit the 1.25 clamp, never folded), the west alley
  (truck stuck on its bins, car stayed clear), driveway turns; stopped: no movement of the car.
- Drop (new zone): east heading (car lowered, its route south then east, into its slot, the truck clear), north
  heading (car at the lane head, east into its slot), wrong heading label, lane full label + retry, payout x3.75 + gem
  logged at level 1 fast, "Fast rescue x5.63" bubble at level 2.
- Reload mid-hook, mid-tow and 3x `__game.rebuild()`: one call back at its spot, owner standing, triangle up, 1 call
  label / 1 chip / no reservation left. 60 fps throughout; no console errors from the game (see known issues).

## Not done / not verified
- **Spots vs scenery (point 7) needs an environment change.** Every spot's hook stop pose, owner or triangle stands
  in kerb props: the env keeps only +-2 m round a spot (env-harbor `QUAY_KEEP` line `[s.x - 2.0, s.x + 2.0]`, env-life
  `k.car(...)` box, env-plots `r(s.x, s.z, 1.8, 1.8)`, Main St parking meters placed at s.x +- 2.45). Quay: benches,
  bollards (z 16.7, under the truck's right side), lamp posts (z 15.84), the rail; Main St: lanterns, meters,
  mailboxes; avenues: lamps, hydrants. No config move can fix the quay (no 12 m gap between fixed props exists). Please
  have the env keep `[s.x - RESCUE.keep.back, s.x + RESCUE.keep.ahead]` along each spot's heading across the kerb
  (ahead = +x for h1-h5, -x for m1-m4, +z for h6, -z for h7) and drop the meters beside the m bays. The overlay
  `__game.rescueFootprints(true)` shows the footprints. h3 moved (above) so the first call is clear of the stall;
  it now blocks the env's fishboxes 16.5 and bench 18.4 slots (2 new "[envdress] quay slot blocked" warnings).
- **Dispatcher with the new drop zone**: not verified end to end. Their truck hooked h3 through my API, then stood at
  the hook pose (phase 'tow', no route yet to the new drop pose); they are reworking routing / backIntoShed for it.
- Drop pose x -9.4: after the 0.8 m cradle pull-out the nose is at x -6.8, 0.25 m into the lane cars reverse along
  off the west lift (x -6.3 +- 0.75). The pull-out waits for a car right there, but the truck may then stand in it
  until driven off. Suggest pose x -9.7 / zone maxX -7.7.
- The drop fires as soon as the truck is slow inside the zone, so after a sharp right turn off the driveway the car is
  lowered at an angle (up to ~65 deg to the truck); its route copes, but it looks less tidy than a straight stop.
- Chip countdown is real time (ui.chip): it keeps counting while a modal pauses the game and resyncs within 2 s.
- A reload after the hand-over loses the rescued garage car (garage cars are never saved).
- Not soaked for 10 minutes with towing (only a 3 min timeScale-6 run with a waiting call, and many single runs).

## Numbers to balance
`hookMaxSpeed` 2.0 makes the hook-up start while the truck is still rolling: it then stops dead and lines up (often
the lane pull-forward + reverse, ~5 s). A lower value (~1.0) would let players finish their own stop. `callTime` 75 s
is tight for far spots (h5, h6, m1) from the shed. Interval 50-90 s felt fine.

## Requests
- Lead / env: the keep zones above (the main open item).
- Dispatcher: API notes at the top of my progress file (dropPose = RESCUE.drop.pose, drop in place, `inDropZone`,
  `busy`, `syncTow`, tow mover `.truck`).
