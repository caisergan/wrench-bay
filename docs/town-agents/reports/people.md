# Final report: `people` (Sonnet)

_2026-11-12, first run. Verbatim last message of the subagent._

All five parts of the `people` brief are built and exported. In the base game, `initGame` fails with `SyntaxError: Importing binding name 'createLifts' is not found`. That is an import in someone else's `src/game` code and nothing in my files, so I could not test any of this in the real game, only on my preview page.

**Files touched**
- `src/models/props.js`: your oil-jug rebuild is untouched.
- `src/models/characters.js`
- `src/models/fx.js`
- `src/models/critters.js`
- `src/models/preview-people.html` and `src/models/preview-people.js`
- `src/models/index.js`: the stubs already exported every name I needed, so I made no further edits.

**Parts**
- **Spray cans:** `createPart('spray:<id>')` is a canister lying on its side, so the whole body and cap are the paint colour. In a carried stack from the game camera, red, white, teal, black, blue and purple are each unmistakable.
- **Gold vs yellow:** `PAINT_COLORS` gives gold (`0xd9a521`) and yellow (`0xf6c453`) nearly the same hue, so those two cans look almost alike. That needs a config change, not a model change.
- **Premium case and lunch box:** `createPart('premium')` is the gold service case and `createPart('lunch')` is the red tin lunch box. Both fit the part box.

**Characters**
- **Poses:** `setSpraying`, `setPolishing`, `setWaving` and `setEating` all work. They combine with carrying, working, sitting and cheering, and I only eyeballed those combinations on the preview page, not exhaustively.
- **Extras you can use:**
  - `char.sprayTip` is an Object3D whose +z is the barrel direction.
  - `char.polishTip` marks the cloth.
  - `char.setSprayColor(hex)` colours the paint cup.
  - `char.spraying` and `char.polishing` are readable flags.
- **Looks:**
  - Painters have white overalls, splatters, a respirator and a purple-banded cap.
  - The prep tech has a purple waistcoat.
  - The VIP staff (host, master tech, detailer) are black and gold.
  - Managers wear a suit in their facility's colours (`managerLook('garage' | 'paint' | 'vip')`).
  - The tow driver has an orange hi-vis vest and a hard hat.
  - The barista wears an apron and beret, and the buyer a suit and fedora.
  - VIP customers come from a pool of 14.
  - `pedestrianLook(i?)` draws from 96 looks: kids, seniors, builds, dresses, hoodies, hats, glasses, beards and backpacks.
  - `playerLook({ goldCap: true })` gives the golden cap.
  - Existing looks are unchanged.

**Seagull**
`createSeagull({ autoLand })` perches, takes off, flies a loop and lands back on its perch. I saw it perch, take off and fly, but did not catch it landing.
- Place `group` at the perch; the bird moves in a child.
- `takeOff({ x, z })` takes an optional "away from the scary thing" direction.
- With `autoLand` (the default) it lands by itself after 6-11 s; `land()` is optional.
- `flying` and `state` are readable.
- The folded wings on the perched gull look a bit clumsy.

**fx**
- **Calls:** `mist`, `foam`, `sparkle`, `dust`, `splash` and `rain` all use fixed pools (a 72-slot soft pool plus the existing 220), with nothing allocated per frame.
- **Mist:** call `mist(scene, nozzlePos, hex, dirVec3)` about 28 times a second only while `char.spraying` is true. Take the position and direction from `sprayTip`. It flies roughly 1.1 m and is gone about 0.4 s after you stop.
- **Rain:** `rain(true, { intensity })` fades in over a pooled set of 220 streaks and `rain(false)` fades out. The default intensity is 0.7 and it is deliberately light. Pass `{ scene, camera }` only on a page that doesn't use the engine's own.

**How to use rain**
It falls on the ground point the camera is looking at, on a fixed world grid, so it never slides with the camera. Roofless halls get rain, as in real life. Closed buildings with roofs hide the drops under the roof automatically. Don't turn rain off per room.

**How I checked it**
- I used my preview page, `http://localhost:5190/src/models/preview-people.html`, at phone and wide sizes.
- Its `?view=game&scene=stack|work|town` modes use the real portrait game camera, with `&rain=0.8` for rain. The row views (`?focus=parts|teams|poses|peds|gull|fx`) are best at about 1300 x 700.
- I checked the parts and a carried stack of every colour, the teams side by side, the poses and spray mist, the polish sparkles and a 30-person town crowd. I also checked all 96 pedestrians, the gull cycle, the fx emitters and rain. There were no console errors on the preview page.

**Not verified**
- The base game could not be tested, as described at the top.
- Performance on a phone is untested.

**Requests for other owners**
- The gameplay owners need to wire `mist` and `rain` to the real events.
- The config owner could make gold and yellow paint more distinct.
