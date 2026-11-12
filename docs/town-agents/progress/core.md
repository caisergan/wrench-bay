GAME BOOTS (18:45) — http://localhost:5190/?autoplay&save=<slot> loads, no console errors. Re-checked at wrap-up (all files node --check OK).

# core progress (resumed run 2, stopped by lead for usage limit)

## Done + VERIFIED in browser
- Step 0: game boots (town.js / vehicles.js / facilitytest.js written).
- Garage regression (fresh save, bot at timeScale 4): 12/13 unlocks, valet + 2 mechanics, 133 repairs, streak, piles, pads, no errors.
  Bot: /tmp/wb-core/bot.js, import in page: `const B = await import('/@fs/tmp/wb-core/bot.js?v=2'); B.start({speed:4})`, `B.report()`,
  `B.autodrive([{x,z}...])` (synthetic joystick). /@fs only works on my private server (below).
- Town opens on load for a save with valet+mechanic0 (toast, barriers drop, bounds + camera switch).
- Tow property: sale sign + 'sale' label + pad -> building site 3.5 s -> shed (bhome model) + truck spawns in shed.
- Truck: enter at front ring in the shed, drive Harbor St, park in 'garden' bay (saved), drive back to 'home' nose-in ->
  three-point turn -> reverses into shed (saved {bay:'shed'}). Hint pill shows while driving.
- ?facilitytest&autoplay: second facility on PAINT layout: cars arrive, valet/player drive into bays, repaired, paid, leave;
  its in-memory chain pads hired test mechanic + valet.

## Done but NOT verified in browser
- town.js: Main Street gate (hoarding, booms, noGo, pad, openGate animation), services (depot/academy buildings + teal
  townpad pads), every other property purchase (only 'tow' was bought), upgrades/levelBuilding, ferry default
  (ui.showFerry -> nextShop), sale/alert/guide pointers, ui:mapTarget, fame:levelup car-class toast + forcedType.
- vehicles.js: arc order changed to reverse/forward/reverse for the 3-point turn (last run used the old order; the
  final reverse-in was verified). Parking in bays other than 'garden'/'home'.
- cars.js reserveSlot/releaseSlot + spawn({reserved, at, path:[], bonusText}); jobView hook; Tag.setBonus/call (util.js);
  owners.unreserve; state.js buyManager/hasManager; PayPad armOnLeave (pads.js); guide.js town target; pointers.js
  rewritten as pass-through to ui.pointer; __game debug helpers (index.js: openTown, giveFame, buy, openDistrict,
  unlockTown, tp, drive, places).
- Code since the last browser run boots (checked on 5190) but the new APIs were not exercised.

## Left in the brief (in order)
1. Old-style save (no `town` key) load + play; shop:changed rebuild (nextShop) with town open; offline earnings.
2. Buy every PROPERTIES entry via its pad (__game.giveCash / giveFame / openDistrict) incl. Main St gate; reload; check
   buildings + solids (bmain/bhome models replace stubs; junkyard default fence in town.js defaultSolids does NOT
   match bmain's fence (x -44.5..-29.6, office outside) — prefer model userData.solids or fix defaults).
3. Walk all of TOWN.bounds (no escape, no stuck spots; Main St blocked before paying). Check M.townSolids() boxes.
4. Truck around the ring road + 3 different bays (needs Main St open for north bays).
5. Customer cars use tunnels once open (hooks exist: facility.js entryPath/exitPath) — watch it.
6. Perf: renderer.info + 10 s frame average before/after town open.
7. TOWN.md 6a: finish 6a.11 (differences/open points) and correct anything the checks above change.

## Decisions / notes
- Pointers: ONE path = ui.pointer (priority, cap 3, on-screen hide). ctx.pointers only tracks handles.
- Parking bays are painted by env (env-streets.js); gameplay does not spawn createParkingBay.
- Wash construction site = two scaffold towers beside the exit lane (lane stays open).
- Building sites have no solids (avoid pushing the player across big plots).
- Ferry terminal stands from the start (scenery); ticket pad locked until ownsAllProperties.
- Town pads use armOnLeave (a pad appearing under the player waits until they step off). Garage pads unchanged.
- Private no-HMR server for bot runs: `npx vite --config /tmp/wb-core/vite.nohmr.mjs` (port 5192; other agents'
  edits don't reload it; serves /tmp/wb-core via /@fs). Stopped at wrap-up; restart if needed.

## Known issues
- bmain's ferry-terminal stub (world coords) shows as a grey box at the origin until bmain writes it (their file).
- vehicle in 'auto' mode ignores collisions (only used for short scripted moves).
