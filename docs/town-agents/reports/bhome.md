# Final report: `bhome` (Opus)

_2026-11-12, resume run (stopped early for usage limits). Verbatim last message of the subagent._

I stopped as you asked. Steps 1–3 of my brief are done and checked in the browser. The paint shop and the VIP set (steps 4–5) are still plain-box stubs. All three of my files parse, every export in index.js still exists with its documented return shape, and the preview page loads with no console errors. I did not test inside the real game; everything was checked in my own preview, mostly with the real game camera.

**Built and checked:**
- **Town kit (props-town.js):** I checked all 13 kit pieces from the game camera, including building sites from 3 x 6 up to 26 x 23. Fixes:
  - **Bus stop:** the roof was a solid slab hiding the bench; it is now a frame with glass.
  - **Building-site dust:** it was floating cubes that looked like cardboard boxes; now soft puffs rising from the walls.
  - **Big building sites:** they were empty walled yards; they now have a column frame going up, a skip, a sand heap and rebar.
  - **Parking bay:** I removed the "P" sign post. It landed on the tow shed's corner and inside the tow apron, which must stay empty. The painted P reads fine on its own.
- **`createTurntable`:** done first because `bmain` needs it, with the agreed API `{ group, platform, setAngle, setGlow, update }`.
- **`createTowShed(1..3)`:**
  - **Shape:** a steel carport with a clear roof, open on the alley side so the truck's door can be reached. I checked it with the vehicles agent's truck parked in it.
  - **Level 2:** adds beacons, a hoist and a cable reel.
  - **Level 3:** adds a dispatch desk and a radio mast.
- **`createWashArches(1..3)`:** in order of travel: soap, brushes, rinse, blower. Nozzles spray and brushes spin and close in only while a car is under them.
  - **Tier 2:** adds coloured wax foam and a top roller.
  - **Tier 3:** adds a big turbo-dryer hood with spinning fans and a neon sign.
  - I watched a car drive through all three tiers.
- **`createWashKiosk(1..3)`:** a pay terminal; later tiers add a canopy, then neon and a vacuum stand.
- **`createLoungeAnnex(1..2)`:** a glass front with two open doors, sofas at the configured seats with customers sitting correctly, a TV angled so the camera can see it, reception, a vending machine and decor. Tier 2 adds an espresso bar, an aquarium with swimming fish, an arcade cabinet, a rug and a bigger TV.

The tow shed, wash and lounge are built at their real map positions and report their own collision boxes, which core's town.js picks up.

**Files touched:** `src/models/buildings-home.js`, `src/models/props-town.js` (the shared helpers `bmain` imports are unchanged), `src/models/preview-town.js`. I did not touch index.js.

**Verification:** the `search` browser was not listening, so I used `chrome-devtools-axi` in its own session, at 500 x 860 with the game view clamped to portrait. Nearly every check was a screenshot at real game-camera distance or closer.

**What is left:**
1. Paint shop: `createPaintHall`, `createSprayBooth`, `createPaintTank` for all 8 colours.
2. VIP set: `createVipHall`, `createVipBar`, `createGoldLift`, `createPremiumCabinet`, `createRedCarpet`, `createPaparazziWall`, `createHostStand`.
3. A full overview pass of every home building at normal camera distance, then a check inside the real game with `__game.buy(id)`.

/tmp/wb-progress/bhome.md has the details and the steps for picking this up.

**Requests for other owners:**
- **`core` / `rescue`:** the truck's parking spot is inside a carport only 2.9 m wide that is open on the west (alley) side only. Put the truck's enter ring on its west side or at the shed front.
- **`comfort` (wash):** `group.userData.zones` gives the exact z of soap, brushes, rinse and dryer. The rinse is just after the brushes (0.5 m south), not at the dryer, so wet the car there and dry it at the dryer.
- **`core` / `comfort` (lounge):** the lounge's glass front is solid except its two 1.8 m door openings.
- **`comfort` (wash kiosk):** nothing places the wash kiosk yet. The preview guesses (15.9, 5.0), facing the lane.
