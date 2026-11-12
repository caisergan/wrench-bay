# bhome progress (resumed run, agent 2) — STOPPED on lead's request (usage limit). Next agent resumes here.

## State of every factory (src/models/buildings-home.js, props-town.js)
REAL + VERIFIED in preview (game camera, no console errors):
- Town kit, all 13 (props-town.js). Verified at ?focus=kit&z=1.61 and ?focus=site&z=0.667 (&cam=x,z to pan).
  Fixed this run: bus stop roof (was a solid slab, now a frame + glass); construction-site dust (cubes -> soft
  icosahedron puffs along the walls); big site cores get a column grid, a partition stub, a skip, sand and rebar;
  parking bay P post REMOVED (it landed on the tow shed corner and inside the kept-clear tow apron).
- createTurntable() -> { group, platform, setAngle, setGlow, update }. platform = rotating Group at deck top (y 0.06).
  API stable for bmain.
- createTowShed(level 1..3): WORLD coords, userData.world + userData.centre + userData.solids. Returns a Group with
  .group === itself and .update (town.js asModel handles this). Steel carport, open west side so the truck door
  is reachable, clear roof. L2: beacons, gantry, reel, dollies. L3: dispatch desk, radio mast, dish.
  Checked with ?view=game&tx=-11.7&tz=-1.5&k=0.5&tow=1..3, with the vehicles agent's truck.
- createWashArches(tier 1..3) -> { group, setRunning, setCarZ, update }: WORLD, userData.zones
  { soap, brush, rinse, dryer }, userData.solids (arch posts, T2 drum tray). Order along +z: soap -> brushes ->
  rinse bar (brush+0.5) -> blower. Sprays only while a car is under them; brushes spin and close in only while a
  car is in reach. Checked with ?view=game&tx=13.5&tz=6.5&k=0.5&wash=1..3 (the preview drives a car through).
- createWashKiosk(tier 1..3): origin, front +z, returns a Group (+ .update noop). Seen only in the game view at
  the preview's guessed spot (15.9, 5.0, yaw -PI/2); gameplay decides where it really goes.
- createLoungeAnnex(tier 1..2) -> { group, update }: WORLD, userData.solids. Contents:
  - Glass front with 2 open doors: LOUNGE.door.x, plus one at the upgradePad x.
  - Sofas from LOUNGE.seats (seat top 0.44, matches setSitting hip 0.5).
  - Angled TV at LOUNGE.tv, reception counter beside LOUNGE.tipTray (the tray itself is the kit prop), vending
    machine at LOUNGE.vending (vendingPile kept clear).
  - T1 adds a coffee sideboard and armchairs. T2 adds the espresso bar at LOUNGE.bar, an aquarium with moving
    fish, the arcade (screen faces +x), a rug and a bigger TV.
  - Checked ?view=game&tx=17.4&tz=-4&k=0.75&lounge=1|2.

STILL STUBS (plain boxes with the documented return shape; replace one at a time):
- createPaintHall, createSprayBooth, createPaintTank(colorId)
- createVipHall, createVipBar, createGoldLift, createPremiumCabinet, createRedCarpet, createPaparazziWall,
  createHostStand
The stubs sit in the "STUBS" block at the end of buildings-home.js. To add a factory: append real code above the
`// ==== STUBS` marker, delete its stub line, run node --check, then look at it in the preview.

## Left in the brief (buildings.txt steps 4-5, bhome2.txt)
4. Paint hall (world, PAINT.walls inner faces, hallShell helper, "SPRAY BAY" sign, compressor, awning + bench at
   PAINT.loungeSpots); spray booth (origin; glass side walls at +/-PAINT.boothHalfW, floor grate, lamp frame;
   setLamp idle|spray|cure|done, setTimer); paint tank per PAINT_COLORS key (station API, footprint
   PAINT.stationSize, colour unmistakable incl. gold/purple; iterate config keys, 'lime' not 'yellow').
5. VIP set: hall (marble/dark floor, gold trim, lounge corner with sofas at VIP.loungeSpots, velvet ropes, sign),
   bar, gold lift (lift API like props.js createLift, posts at +/-VIP.bayPostOffsetX = 1.15), premium cabinet
   (station API), red carpet (VIP.redCarpet width 1.2, length zFrom-zTo), paparazzi wall, host stand.
- Final pass: full ?view=game overview at k=1 for every home building; check that nothing covers the gameplay
  positions; check in the real game with __game.buy(id) (core's town.js spawns via makeModel + userData.world /
  solids).

## Notes
- The `search` MCP was not listening, so I used chrome-devtools-axi with CHROME_DEVTOOLS_AXI_SESSION=bhome.
  Helper: /tmp/bhome-shot.sh "<query>" <name> [waitSec]. Screenshots go to /tmp/bhome-shots/. The preview needs
  about 5-7 s to load cars and characters.
- Preview add(): a world-built group with no x,z stays where it is; with x,z given, it is offset by
  userData.centre (row views).
- New helpers in buildings-home.js: geo2 / addGeo2 (lit + glow geometry from one build), hallSolids, corrugated,
  cone, jerryCan, chain, coil, LAMP materials. props-town.js shared-helper signatures are unchanged (bmain
  imports them).

## Known issues / for others
- Tow truck door ring (core/rescue): the truck's home is inside a 2.9 m-wide carport. Only the west side (alley)
  is open, so put the enter ring on the truck's west flank or at the shed front.
- Wash (comfort agent): use group.userData.zones for when foam goes on, when it rinses off and when the car is wet
  or dry. The rinse is at brush + 0.5, not at the dryer.
- Lounge solids: the glass front is solid except the 2 door gaps (1.8 m each).
