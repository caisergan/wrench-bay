# rescue progress

API READY (2026-11-13 15:20) — hook / towOf / drop work for the player path; ctx.rescue as in TOWN.md 4.5 with these notes:
- `hookPose(call)` = the STOP pose: truck centre + heading where the truck stands before the hook-up (in line with the
  car, ahead of its nose, same heading as the car, tail at the hook ring). hook() then lowers the wheel-lift and backs
  the last 1.2 m straight onto the final pose itself (`hookFinalPose(call)`). Drive to hookPose exactly and the
  manoeuvre part of hook() is a no-op. From anywhere near it (within ~2.4 m / ~70 deg) hook() lines up by itself
  (reverses onto it, or pulls forward past it and reverses back).
- `hook(truck, call, { onDone })` returns false if the call is not 'waiting' or the truck is busy. During it the
  truck is mode 'auto' with `truck.script = [{ kind: 'fn', ... }]` (new step kind in vehicles.js); at the end rescue
  sets `truck.script = null` and calls onDone(truck). Mode is left 'auto': install your own script / mode in onDone
  (runScript turns an 'auto' truck with no script into 'parked' on the next frame).
  hook() also sets `call.claimedBy` ('player' when truck.driver === 'player', else keeps your claim).
- DROP CHANGED (16:20, the lead's new drop zone, RESCUE.drop rectangle in front of the shed / garage west end):
  `dropPose()` = RESCUE.drop.pose = { x -9.4, z 4.0, yaw PI/2 } (heading east). `drop(truck, { onDone })` works when
  the truck's centre is inside the rectangle and it heads east or north within RESCUE.dropAngle
  (`ctx.rescue.inDropZone(truck)` tells you). It plays IN PLACE (no pull-on any more, noseZ is gone): lift down, car
  handed to the garage, owner out, then the truck pulls 0.8 m straight forward (cradles out; it waits while a car /
  the player is just ahead), stows, onDone(truck): mode 'auto', no script, truck 0.8 m ahead of where it stopped
  (from the pose: x -8.6, z 4.0, heading east). Returns false when the garage lane cannot take the car yet (retry).
  The released car finds its own way into the lane behind the truck (east: right turn south then east along the
  lane; north: straight back to the lane if needed, then east) and waits while the truck or a moving garage car is
  in that way: you can drive off at once.
- `towOf(truck)` -> the call while 'towing' or 'dropping'. `busy(truck)` -> true while hooking / towing / dropping.
  `inDropZone(truck)` -> true where drop() may be called (centre in RESCUE.drop, heading east / north).
- The trailer update runs in rescue's update (after ctx.vehicles.update). If you move the truck outside
  ctx.vehicles.update (e.g. in your own system's update), call `ctx.rescue.syncTow(truck, dt)` right after, or move it
  inside a `{ kind: 'fn' }` script step, so the towed car follows in the same frame.
- Towed car mover: `{ pos, radius, hidden: false, tow: true, truck }` in ctx.movers (skip the one whose `.truck` is
  yours). Stranded car (waiting): a capsule in ctx.capsules (owner = the call; owner = the truck from the hook on).
- calls entries also have: `fastLeft` (s), `owner.state`, `truck` (the truck doing it), `seq` (current sequence).
- `truck.canLeave` is set by rescue to `() => !busy(truck)` (parking / getting out is refused while busy).

## Answers to the dispatcher (15:45)
1. Spots: h3 moved x 22 -> 18 (stop pose now ends before the FRESH BAIT stall), h6 / h7 x +-50.6 -> +-50.25 (stop pose
   no longer overlaps the gas station / Quick-Fit plots). h2 at 0.15 m from the water: no overlap, kept. Your hook
   pose follows automatically (hookPose reads the spot). The props the environment draws on the kerbs (benches,
   bollards, lamp posts, meters) still stand in most hook poses: the env only keeps +-2 m round each spot; I am asking
   the lead for an env change (RESCUE.keep = { back: 4.4, ahead: 7.2 } added to the config for that).
2. Done: a call claimed by 'dispatcher' shows the chip "Your tow driver is on it", no rescue pointer, no "Truck"
   pointer, no guide arrow (also while it is towed).
3. The hood: the car model shuts it on the hook (setTowed > 0) but only when its update runs; rescue now updates the
   car every frame while 'hooking' (also off screen), so it is shut before the truck drives off.
4. Noted. Also: the hook-up's own line-up (if you stop off the pose) pulls forward along the lane and reverses back
   with an S-bend, like yours.

## Status (16:45)
- [x] rescue.js (system, API, hook / drop sequences, HUD) + rescue-scene.js (scene, owner, triangle, curves) +
      towing.js (trailer) + props-rescue.js (triangle, phone, painted tow zone)
- [x] call: first at h3 after firstDelay (fresh save verified: toast, radio, chip, pointer, guide, rescue:call)
- [x] hook-up: verified at 1x paused frame by frame (line-up, lift down, back under, lift up, owner + triangle board)
- [x] towing: Harbor St, U-turn / pivot (clamped at maxArticulation), west alley, driveway turn
- [x] NEW drop zone (lead's change 16:10): in place, east and north headings verified (player); car's way into the
      lane verified for both (never across the truck); wrong heading info label; lane full label; painted zone with
      TOW + pulse while towing
- [x] reload mid-hook / mid-tow, __game.rebuild() x3: call back at its spot, nothing duplicated, no reservation left
- [x] level 2 (red truck hook-up, x3.75 / x5.63 payout), payout x3.75 + gem verified at level 1 fast
- [x] mobile view (portrait) checked: chip, pointers, scene, hook-up
- [ ] dispatcher run with the new drop zone: their truck stalled after the hook at h3 (phase 'tow', no route to the
      new pose yet: they are reworking backIntoShed / routing for the zone) -> theirs to finish
- [ ] spots vs env props: needs env keep zones (RESCUE.keep) - lead

## Shared-file changes
- src/game/vehicles.js (for the dispatcher too):
  1. runScript: new script step kind `'fn'`: `{ kind: 'fn', fn(dt, vehicle) -> true when done }`. The fn moves pos / yaw /
     speed / wheelSpeed itself. rescue.js uses it for the hook-up and the drop (it sets `truck.script = [{ kind: 'fn', ... }]`
     and clears `truck.script = null` itself at the end, then calls onDone). Usable for AI driving too: moving the truck
     inside ctx.vehicles.update means the towed car (rescue update, later in the frame) follows in the same frame.
  2. the 'P' parking pointer is only shown while `v.canLeave()` (no P pointer while towing).
- src/game/owners.js: Owner constructor reads optional `car.ownerStart = { look, from: {x,y,z}, door: {x,z} }` (the
  rescued car's owner hops out of the tow truck's door instead of out of the car). Without it: unchanged.
- src/game/town.js updateGuideDefault: after the truck step, `ctx.rescue?.guideTarget?.()` (first call's car, then the
  drop zone, until the first delivery).
- src/game/features.js: `import './rescue.js';` (dispatcher's line is below it).
- src/config.town.js RESCUE: h3 x 22 -> 18, h6 x -50.6 -> -50.25, h7 x 50.6 -> 50.25, new `keep: { back, ahead }`
  (for the environment). (My earlier drop z 7.85 / noseZ were replaced by the lead's drop zone.)
- src/models/index.js: exports createWarningTriangle, createTowZone, createPhone (props-rescue.js) and TOW_BOOM, TOW_LIFT.
- state.js: NOT changed; rescue.js creates `state.town.rescue` lazily (`state.town.rescue ||= {...}`), the load merge
  keeps it (`...t`).

## Assumptions / known issues
- Kerb props in hook poses: the environment keeps only +-2 m round each spot clear (env-harbor QUAY_KEEP, env-life
  `car()` keep, env-plots `r(s.x, s.z, 1.8, 1.8)`, Main St parking meters at s.x +-2.45): quay benches / bollards /
  lamp posts / rail, Main St lanterns / meters / mailboxes, avenue lamps stand where the truck stops, the owner stands
  or the triangle goes. Needs: keep [s.x - keep.back, s.x + keep.ahead] along the spot heading, full kerb width.
- Drop zone pose x -9.4: after the 0.8 m cradle pull-out the truck's nose is at x -6.8, 0.25 m into the lane cars use
  when they reverse off the west lift (x -6.3 +- 0.75). The pull-out waits if a car is right there, but the truck then
  stands there until driven off. Pose x -9.7 (or zone maxX -7.7) would keep it clear.
- Chip countdown runs on real time (ui.chip): while a modal pauses the game it keeps counting, resyncs within 2 s.
- Garage cars are not saved: a reload after the drop loses the rescued car and its payout (same as any garage car).
- "Script error." lines in the console appear only when the page is driven with the javascript tool (none in 20 s
  of plain play, none after a 3-minute timeScale-6 run without it).
- Test helpers: docs/town-agents/tools/rescue/setup.js + autopilot.js (import in the console; see their headers).
