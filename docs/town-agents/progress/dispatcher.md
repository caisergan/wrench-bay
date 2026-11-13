# dispatcher progress

## Requests for the rescue agent
1. Spots whose hook poses hit scenery (measured: truck footprint at `hookPose` / `hookFinalPose` vs ctx.obstacles,
   compact and van): **h3** stop (26.87,16) and final (25.67,16) overlap the quay "FRESH BAIT" stall
   (box x 25..26.8, z 16.38..16.98) and the quay rail; **h7** stop (50.6,-7.87) / final (50.6,-6.67) overlap the filler
   block north of Quick-Fit (box x 51.1..61, z -18.9..-7.0) by ~0.35 m; **h2** 0.15 m from the water box (z 17).
   The dispatcher drives exactly onto hookPose, so a fix there fixes both of us.
2. HUD while the dispatcher has the call (`call.claimedBy === 'dispatcher'`, also while towing it): the chip still
   says "Tow it to the garage" and the guide / pointers still send the player to the car and the drop ring. Suggest
   a chip like "Your tow driver is on it" (no pointer to the car / drop ring, no "Truck" vehicle pointer) for calls
   the dispatcher has claimed.
3. (minor, real-world) the towed car keeps its hood up while towed (battery story): a driver would shut it first.
4. FYI how I use the API: claim -> drive to hookPose exactly (reverse S-curve onto the kerb) -> hook() (retried
   each second up to 8x if it returns false, then unclaim + home) -> onDone: my own 'fn' script -> route to
   dropPose() -> drop() (if false: I pull on up the driveway to noseZ and retry every second) -> onDone: drive to
   the home bay, backIntoShed(true). I skip your tow mover by `m.truck === truck` and the stranded car's capsule by
   owner === call.

## Design change 2026-11-13 (lead): new home bay (alley, x -14.6 z -1.2) + tow drop zone — DONE
- vehicles.js `backIntoShed()` rewritten (now mine): car-like moves only, played back exactly on precomputed paths
  (roads.js `manoeuvre` + `trackStep`): bay heading south = forward out of the bay, left arc R3 onto the apron
  heading east, on to the turn point, reverse arc (R 2.3, tail swinging north-west) into line, reverse straight
  in; bay heading north = reverse down the alley with the tail edging 0.34 m east (the nose swings away from the shed
  posts, the tail clears the barrels / pallets), straighten, forward right arc R2.8 onto the apron (z 5.6), same
  reverse; from the drop zone heading east (dispatcher, after drop()) = straight into the reverse arc (R 2.1-2.3).
  Waits while the player / a customer car stands in the way. Footprint sweeps (+0.35 m for the wheel-lift) vs
  ctx.obstacles: min 0.19 m (pallets, north case), 0.24 (barrels), shed posts >= 0.5. `park()` calls it without the
  old `flip` argument. Verified: player parking nose-south and nose-north in the bay (positions logged every 0.4 s),
  dispatcher from the drop zone (screens).
- roads.js: yard lanes now 'drive' (x -13.6 north from Harbor St, beside the customers' entry at x -12) and 'zone'
  (z 4.0 east, right turn R2.9 into it); the old x -12 driveway lane is gone. Drop routes from every spot end at
  RESCUE.drop.pose heading east; towed car clearance 0.45 m on the way in.
- Driver: idles inside the shed's open west side by the dispatch desk (-12.95, -3.9), walks 2 m along the truck to
  the cab's west side, hops in / out there.
- Dispatcher: after drop() (in place, truck 0.8 m on) straight to backIntoShed; no home-bay visit; lane full = wait
  in the zone and retry every second.

## Status
- [x] 1 roads.js (graph, route, PathFollower, debug draw + footprint check) — every spot routes; footprint sweep
      clear of ctx.obstacles except where the hook pose itself overlaps scenery (see requests)
- [x] 2 AI driving (pure pursuit through the 'fn' script step the rescue agent added to vehicles.js) — cross-track
      error <= 0.16 m, kerb reverse ends within ~6 cm / 1.3 deg of the hook pose
- [x] 3 kerb manoeuvres — stand-in runs (no call: `__game.dispatcher.go(spotId)`) from the shed to every spot, hook
      pose, drop pose, home bay, back into the shed: all 11 spots complete (timeScale 8 batch + h3/h1 at 1x)
- [x] 4 driver character (idles west of the shed, walks round the crate stack to the cab, hop in / out)
- [x] 5 dispatcher loop with the real ctx.rescue: full runs h3, h2 (drop route around the ring: the direct
      kerb->driveway turn is checked with the real tow geometry and refused when the truck tail / towed nose would
      swing over the quay edge), lane-full wait (pulls up the driveway, retries), reload mid-tow (call back to
      waiting, truck in the shed, taken again), __game.rebuild() mid-run (same)
- [x] 6 level 3 verification + soak (finished by the lead 2026-11-13 after this agent hit its usage limit mid-soak)

## Soak (lead, 2026-11-13)
- The agent's own soak (save dispatcher2) found a deadlock at game minute ~6: a dropped car in 'rescueHold' at the
  drop-off lane corner (-12.9, 7.2) waited for an 'arriving' garage car stopped behind it, which waited for the
  dropped car; the dispatcher truck going out for the next call waited for the dropped car too.
  Fix in rescue.js wayClear(): a moving-mode car that is blocked by the dropped car (or stopped for > 1 s) no longer
  holds it back; the dropped car goes first, the normal car-following takes over.
- Fresh save (disp3), buy('tow') x3: 1 run at 1x, then timeScale 4 / 8 for ~22 game minutes: 9 full runs
  (h3, h7 x3, h6 x3, h5 x2), no stuck truck, no stuck garage car, no page errors (only opaque "Script error." lines
  from the test harness's injected scripts; none in an untouched tab).
- 1x checks: h7 hook-up on the East Ave kerb (fence corner clear), drop with a customer arrival right behind the
  towed car (resolves: the rescued car queues first), Browser view and portrait (390 x 844).
- Console warnings removed: env-plots keep-clear check counted touching edges (tow shed vs the home bay, float noise),
  and the Quick-Fit north fence started inside h7's keep-clear rect (now starts 0.6 m in from the plot corner).

## Findings / plan
- Obstacles (ctx.obstacles) after town open: the west alley is a slalom of bins/crates (z -10.3 east side, -2 west,
  1.8 east, 5 west: corridor 1.85 m at z 1.8), the east alley is blocked for a 1.7 m truck at z -9 (gap 1.08 m),
  the back lane has clutter on both sides (corridor ~2.05 m). The back lane does not touch the avenues (their
  sidewalks have no cut there). => alley lanes are in the graph but gated by a truck-sized sweep against
  ctx.obstacles; today they all come out blocked, so the truck uses the ring roads + apron + driveway only.
- Ring turns are all left turns, kerb lane to kerb lane, radius 4 (clears the inner kerb corners).
- Way out of the shed: straight out of the door, S-curve to x -14 on the apron strip (beside, not against, the
  garage arrivals coming up the driveway at x -12), left turn into Harbor St kerb lane.
- Kerb manoeuvre (real tow-truck style): pass the car in the lane, stop ~6 m past the hook pose, reverse with an
  S-curve onto the kerb into the hook pose (the rear swings in), so the truck never noses into kerb scenery ahead.
  h5 (x -55, west of the West Ave junction): come down West Ave, turn onto Harbor St, stop past the junction and
  reverse along the kerb to it (no wrong-way driving).

## Shared-file changes
(none yet)

## Assumptions / known issues
