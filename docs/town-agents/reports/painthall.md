# painthall report (2026-11-13)

## Summary
The Spray Bay paint shop is built: the hall, the spray booth and the paint tanks, as designed in `briefs/painthall.txt`.
I checked it in the preview, from the game camera, in the real game and with `?facilitytest`. One problem is left that
my files can't fix: the default valet route drives through the prep desk (see "Changes needed from other owners").

## What I built
- **`createPaintHall()`**: built in world coordinates, with `userData.world`, `centre` and 23 `solids`. It has:
  - **Shell:** cream walls over a slate wainscot, navy caps. The spectrum band of the eight colours runs as one
    continuous band over all three caps, and each pillar cap carries a ring of the eight colours.
  - **Floor:** light grey epoxy (new `paintfloor` kind), with the colour lab cut out. One overlay holds the walkway
    lines, a hatched drip-tray outline under all eight station spots, the "BOOTH 1 / 2" stencils and the booth
    lead-in lines. A trench drain and steel nosing run across the open front.
  - **Back wall:** the eight colour plates on one face (premium ones have a star). A paint manifold with brackets, and
    at every station spot a valve stub with a red hand-wheel, so unbought spots read as plumbing that is ready.
  - **Compressed-air line:** comes over the west wall from the plant yard, runs along the west wall, the back wall and
    half the east wall. It has a filter-regulator drop and a coiled hose.
  - **Sign:** "SPRAY BAY / PAINT & BODY" with a spray gun firing an eight-colour fan.
  - **Exhaust stacks:** two of them, each with a fan housing, motor, wall clamps and an open top with a spinning fan.
  - **Plant yard:** on a plinth. A compressor that runs about 7 s and rests about 12 s (fan spins and a small 1 mm
    shudder only while running, plus a run lamp). An air receiver with gauge, safety valve and drain; a white dryer;
    a yellow flammables cabinet with a flame diamond. Pipework runs from the receiver to the dryer, up the wall, over
    the cap and into the air line.
  - **Painters' corner:** three lockers (one with a respirator sticker), a suit rack with three suits and two
    half-masks, a gun washer with its lid propped open and a gun inside, a masking-paper trolley with three rolls and
    tape, an eye-wash station, and three fire extinguishers.
  - **Colour lab:** slate base with aluminium and glass walls, a closed glass door, a "COLOUR LAB" window decal with
    the eight swatches. Inside: a mixing bank (36 tins with spectrum and pastel lids, agitator bars), a counter with
    scale and tin, monitor, spectrophotometer and fan deck, a glowing daylight matching box, a stool, a white floor.
  - **Waste drum:** a red drum on a yellow spill pallet, funnel lid, hazard label.
  - **Forecourt overlay:** "PAINT IN" with an arrow, a turn arrow, dashed queue slots with numbers and arrows, the exit
    lane, a hatched "PICK-UP" box and "EXIT". The paint parking bay is left free.
  - **Forecourt furniture:** a waiting shelter (timber deck, posts at the two ends only, clear roof in a coral frame,
    sloped "WAITING · PICK-UP" fascia, a bench facing west), the prep desk (key cabinet with tags in the paint colours,
    clipboard) and five planters.
  - **East wall and drainpipes:** a mural on the east outer wall and four drainpipes.
  - **Cost:** 17 meshes, about 22.6K triangles. `update()` runs only the stack fans and the compressor.
- **`createSprayBooth(index)`**: 11 meshes in its heaviest state (cure with IR and haze on), about 4K triangles.
  - **Floor and walls:** a downdraft grate deck with faint overspray along the walls and hazard strips at both mouths.
    Kick plates with extraction filter slots, white posts and rails, glass walls (one mesh).
  - **Lights and curtain:** tilted light boxes whose lens material changes with the state. A roller box and a clear
    PVC curtain that rolls down in 0.8 s for 'spray' and 'cure' and back up for 'idle' and 'done'.
  - **Control column:** a 12-segment timer ring (13 shared textures; one mesh whose material is swapped), a "BOOTH n"
    plate, a beacon (grey / amber / orange-red / green with three blinks), a hose reel and an empty holster.
  - **IR arrays and haze:** IR arrays (gold reflector panels with three tubes) that glow and pulse only during
    'cure'. A light coloured haze inside the glass that fades over about 0.5 s. `userData.obstacles` = the two glass
    walls and the column.
- **`createPaintTank(colorId)`**: 3 meshes at rest, 5 while filling, 6 for gold and purple with their glint.
  - **Vessel:** in the paint colour, with the white / Midnight / premium variants as specified, a domed lid with a
    highlight crescent, a sight glass and a label.
  - **Agitator:** with a spinning fan cap.
  - **Fill station:** a pump and fill head. While 0 < k < 1 a canister of the colour (`createPart('spray:..')`, upright)
    stands on the fill plate, the nozzle is lowered onto it, the fill bar grows and the head shudders slightly.
  - **Shelf and supply pipe:** the shelf holds `partAnchor` at (-0.66, 0.47, 0.28). The supply pipe ends in a flange
    that meets the hall's valve stub.
- **`props-town.js`**: one new `floorTex` kind, `paintfloor`. No existing export changed.
- **Preview (`preview-town`)**:
  - `?focus=paint&show=hall|tanks|booths|all`. The tanks view has rows at progress 0 / 0.5 / 1 / cycling; the booths
    view has the 4 states with IR off and on.
  - The game view now clears the paint, tow, wash and lounge plot dressing. It places booths and tanks with
    `&paint=0|1|2` (hall alone / starting state / everything).
  - `&nav=0` hides the menu.

## Files touched
- `src/models/buildings-home.js`: the three stubs replaced, plus the paint section above the STUBS marker.
- `src/models/props-town.js`: the `paintfloor` kind.
- `src/models/preview-town.js` and `src/models/preview-town.html`.
- `docs/town-agents/progress/painthall.md` and this report.
- `src/models/index.js` did not need a change.

## What I saw when verifying
- **Preview, game camera (390 x 844):** I looked at tx -41 / -36 / -30.5 / -24 / -15 / -12 and tz 2 / -4 / -5.
  - From the camera the tanks read as coloured paint vessels. The black one reads as black paint, gold and purple are
    faceted with a star.
  - The booths read as booths: dark grate, glass, light strips that are white when spraying and amber when curing,
    and an orange glow on the grate under the IR lamps.
  - The sign, the plates and the spectrum band read at a glance.
  - The plant yard units are each recognisable.
  - The lab reads as a glass mixing room.
- **Real game (`?autoplay&save=painthall`, then openTown / giveFame(5) / buy('paint') / tp(-30.5, 2)):**
  - The hall stands with no vacant dressing under it.
  - No booths or tanks yet, because there is no paint gameplay. The empty hall still looks finished: drip-tray outlines,
    valve stubs, plates, booth stencils.
  - No page errors; a window error listener caught nothing. The console does show one opaque "Script error. @ :0:0".
    The page's own listener never sees it, it also appears on a save without the paint shop and in the preview, so it
    does not come from page code.
- **Draw calls in the game near the paint shop** (hall only, no booths or tanks):

  | Where | Draw calls |
  |---|---|
  | tx -30.5, tz 2 | 121 |
  | tx -36, tz -4 | 114 |
  | tx -24, tz -4 | 129 |
  | tx -41, tz -5 (plant yard) | 113 |
  | tx -12, tz -1 (tow shed) | 149 |
  | Garage, for reference | 202 |

  With both booths and all eight tanks, expect roughly 22 + 40 more calls. That last figure is computed from the mesh
  counts; I did not measure it in the game.
- **`?facilitytest&save=painthall2` with the paint shop bought:** about 9,400 car samples with car footprints tested
  against all 23 solids.
  - Cars arrive, wait inside my painted slot outlines, are valeted to the bays, repaired, reverse out, stop at the
    pick-up and exit.
  - The only hits are the prep desk, crossed in "valet" mode (41 samples).
- **Numeric keep-clear check** (all zones from brief section 4):
  - None of the 23 solids touches a zone, and the scrap-drum trigger covers none.
  - The booth glass from config `boothZ[0] = -7.0` reached 5 cm into the staff lane. I moved the booth's north end
    0.1 m south (the column stays at world z -6.4).
  - Remaining, config only: the booth-0 cash collect radius (bay.x + 2.6, r 0.8) reaches 8 cm past the east glass
    line. The pile model itself is clear.

## Interpretations and small deviations
- **Valve stub:** each stub comes forward out of the manifold, with the hand-wheel on top so it reads from above. The
  tank's pipe rises to the manifold height and its flange butts against the stub's flange. The brief's "down-stub" and
  "up to the manifold height" could not both meet.
- **Manifold ends:** the west end drops into the floor (paint supply from below); the east end is capped.
- **Booth lenses:** both sides' lenses are one mesh (they always share a state), to save a draw call.
- **IR glow:** the IR tubes face down at the car, so the camera can never see them. I added a pulsing orange light
  pool on the grate under the lamps during 'cure' so the bake shows. This is what real IR lamps do to everything
  under them.
- **Booth catches up off screen:** gameplay only updates a bay model while it is on screen. A booth that hasn't been
  updated for more than 0.3 s now jumps to its current curtain and haze state, so it never rolls its curtain late.
  Likewise, `setProgress` places the tank's fill head by itself.
- **Fascia:** sloped back 0.6 rad so it can be read from the camera. It hides a 0.24 m strip at about waist height of
  the second-row lounge spots.
- **Shelter planter:** skipped. No corner clears the lounge spots by 0.4.
- **"WASTE PAINT ONLY" plate:** faces north, towards the drum, so the camera never sees it. The drum's own hazard label
  faces the camera.
- **East-pillar extinguisher:** on the pillar's south face, because its inner face is inside the colour lab.
- **Mural:** cream background with navy lettering; a navy panel made the outer wall read as a dark slab. From the
  alley it is seen at a grazing angle, so there the spectrum band on the cap carries the identity.

## Unfinished or unverified
- **Booths and tanks in the real game:** not seen, because `src/game/paint.js` does not exist. They were only checked
  in the preview, and the facility test shows garage lifts and stations on those spots.
- **Booth draw calls in the game:** not measured.
- **Compressor cycle and stack fans:** I checked these by reading the logic and looking at stills. The premium glint
  timing was checked by script (3 flashes in 10 s).

## Changes needed from other owners
1. **Valet route (core `staff.js` `pathToBay` or `paintshop`).** The default route goes from the slot to (sx + 0.4,
   queueLaneZ - 2.4) and then to the bay. For queue slot 1 (x -24.6) it drives through the prep desk at
   `PAINT.decor.prepDesk` (-25.2, 4.7). Its body also brushes the lounge spot (-23.6, 5.9).
   - I searched x -27.6..-22.4, z 3.9..6.7 for a desk spot clear of the recorded valet sweeps, the preptech pad, the
     owner walk and the lounge spots. There is none.
   - Proposal: a layout key for the first waypoint's x offset (e.g. `PAINT.valetTurnX = -1.8`, so the first waypoint is
     (sx - 1.8, queueLaneZ - 2.4)). Geometrically that clears the desk by about 0.9 m and stays west of the shelter.
     Alternatively the lead moves the desk.
2. **paintshop:**
   - Call `booth.setIR(true)` on every booth once 'irlamps' is bought; the booth has no state of its own for that.
   - `bayObstacles` can map `booth.group.userData.obstacles` (local, add bay.x / bay.z).
   - The booth's glass runs from z -6.9 to -0.8 (0.1 shorter at the north end than `boothZ`).
3. **Lead (config, optional):** `cashOffset.x` 2.6 puts the booth-0 cash collect radius 8 cm past the glass.
   `boothZ[0]` -7.0 touches the staff lane, which I worked around as described above.

## Browser incident
Once I navigated the agent-opened tab 4b7cb9e6 (`?facilitytest&save=design1`) by mistake: a call without a tabId
defaulted to it. I put it straight back on its original URL, and its save was not touched. Its in-memory facility-test
state was reset by the reload.

## Lead review (2026-11-13)
- Valet route conflict (item 1 above) fixed in the layout, not in the route: PAINT.queueSlots -> x -28.0 / -31.6 / -35.2
  (west of the desk and shelter, as the garage's slots sit west of its valet stand), valetStand + decor.prepDesk -> x
  -25.0, prep tech pad -> (-25.0, 6.2). Checked with ?facilitytest + a test valet: cars queue inside the painted
  outlines and the closest any car came to the desk was 2.76 m (shelter post 2.65 m). No pathToBay override needed.
- Booth north end moved into the config (PAINT.boothZ [-6.9, -0.8]) instead of a +0.1 offset in the model.
- Haze: the single box showed its flat top to the camera as a hard pale slab past the booth's north end. Replaced
  with three soft-edged fog layers (hazeTex) at y 0.35 / 0.8 / 1.25, opacity 0.12 each.
- The "Script error." console lines are opaque cross-origin errors with no source; they appear without the paint
  shop too. Not investigated further.
