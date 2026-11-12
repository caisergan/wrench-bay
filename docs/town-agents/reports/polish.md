# Final report: `polish` (Opus subagent, then the lead)

_2026-11-12. The subagent (Opus, high) did most of part B in its first 16 minutes and was cut off by the 5-hour rate
limit. The owner then asked the lead to continue without a subagent. The lead finished B's checks and did all of A.
Brief: `briefs/polish.txt`. Log: `progress/polish.md`._

## (B) Car wash: a drive-through of its own instead of arches on the exit

**Layout.** "Suds & Shine" stands on the north part of the garden block:
- **Plot:** `PROPERTIES.wash.plot`, x 15.0..23.6, z 1.8..5.6. The pad stays at (16.4, 7.3) in the park.
- **Structure:** an open steel gantry with a see-through polycarbonate roof and an open south side.
- **Tunnel:** axis z 3.7 (`WASH.laneZ`), x 17.7..22.9.
- **Stations, in drive order:** soap 18.6, brushes 19.85, rinse 20.95, blower 22.15 (`WASH.stations`).
- **Other parts:** pay kiosk on the driver's (north) side, entry sign with an arrow, guide rails, drain grate, exit sign,
  and two coin-op vacuum pillars beside the garden P bay. The vacuum pillars belong to the wash model, so they only
  exist once the wash is built.
- **Exit driveway:** back to a plain driveway, with no arches.
- **Park and wrench:** the garden south of the wash is a small park (fountain, benches, path, the P bay); envdress's
  garden was rebuilt for it. Golden wrench w06 moved to (15.95, 10.2).

**Route** (`src/game/wash.js`, registered in `features.js`, through the new `fac.hooks.leave` hook in `cars.js`):
1. The car leaves its lift and drives the exit lane to the pickup stop, where the owner gets in (as before).
2. It carries on east past the exit driveway (`WASH.approach`).
3. It stops at the kiosk (`payTime` 1.3 s).
4. It rolls through the tunnel at `slowSpeed` 1.15 m/s: foam after the soap arch, mud off at the brushes, foam and
   dust gone and the car wet after the rinse, dry after the blower, then a shine.
5. It leaves into the east alley and goes south to Harbor St (`WASH.exit`), then east like every car.

Cars that do not wash take the exit driveway exactly as before.

**Rule:** `WASH.cleanCarsFromLevel: 2`. At level 1 only dirty cars wash (`dirtyChance` 0.6; dirt is rolled only while
the wash exists). From level 2 every leaving garage car washes.

**Queue:**
- One car approaches or pays at a time.
- A paid car enters the tunnel only when the car ahead is `WASH.gap` (3.7 m) on. The entry light shows red while it
  waits.
- A car that wants a wash while the kiosk is taken waits at the pickup stop with its owner aboard. `car.holding`
  stops the cars behind from ghosting through it.

**Money:** `washFee(tier)` lands as coin stacks on `WASH.pile` (23.05, 6.35) with "+$X Wash". It also adds to
`state.town.stats.washes`, emits `wash:done { total }` and counts towards offline income. Tier 3 gives +1 fame per car.

**Verified in the browser (Search, 462 x 946, game camera):**
- **Subagent:** level 1 dirty car (whole sequence and effects); level 1 clean car (leaves by the driveway);
  level 2 clean car washes; two cars back to back queue (minimum gap 3.0 m); tri-colour foam.
- **Lead, tier 3:** at the tunnel, the car shows tri-colour foam, the brushes are in place, the slim turbo hood and
  roof blowers show, and the car stays visible.
- **Lead, real garage loop** (wash level 3, bot at speed 4, about 2 min): 49 washes, no stuck car. The pickup queue
  clears.
- **Lead, reload mid-tunnel** (car at x 20.7): the game comes back and the wash keeps running (washes 56 -> 57), no
  errors.
- **Lead, no-wash regression** (town open, no wash, bot at speed 4 with pads, about 2 min): every leaving car takes the
  exit driveway at x 13, no dirt is rolled, 3 unlocks were bought, no errors.

TOWN.md 4.6 and the map in config.town.js's header describe the new design.

## (A) Town polish

### Ground surfaces (`env-kit.js`)
- **New textures at real scale:**
  - concrete: 2.0 x 2.67 m slabs over 16 m, thin saw-cut joints with a light lip, about 9% replaced slabs, hairline
    corner cracks, rust marks, weeds in some joints;
  - asphalt: aggregate, worn tone, sealed "tar snake" cracks;
  - alley asphalt: older, with saw-cut repair patches, crack networks and weeds;
  - gravel: fine grain, pebbles, compacted and dusty patches;
  - pavers: 0.6 x 0.4 m in running bond, with bevels and odd replaced pavers;
  - lawn: soft mowing stripes, lush and dry patches, clover, daisies;
  - meadow (new): unmown grass and wildflower drifts, for vacant lots.
- **No visible tiling:**
  - UVs are baked in world space.
  - Jointed kinds (concrete, plaza) get a per-cell offset and mirror flip on a 16 / 12 m grid aligned to the joints,
    so every cell border falls on a joint.
  - Every kind gets a seamless macro tone term in its shader (two heavily blurred samples of the same texture at
    other scales), so large areas vary softly instead of repeating.
- **Cheap:** one shared material per kind. `surface()` keeps its call signature but queues into a batch, and
  `flushSurfaces(root)` builds one mesh per kind per 60 m chunk.
- **New API** (env-kit): `surfaceMesh` for hideable overlays, `quad`, `disc` and `flatTop` (2-triangle decals instead
  of 12-triangle thin boxes). `stain()` now uses discs.

### Streets and edges (`env-streets.js`)
- **Sidewalks:** real 1.2 m flags with 3 cm sunken joints, a narrow range of tones (no A/B stripes), about 5% newer
  flags, cracked flags, weeds in joints. Kerb stones are jointed every metre, with a concrete gutter channel along
  every kerb.
- **Road paint:** worn (a little of the road shows through the dashes, zebras and arrows).
- **Wear:**
  - asphalt repair patches with sealed rims on all four roads;
  - five trench repairs straight across the streets;
  - faint oil-drip bands down the lane centres (they replace the old round "tyre" dots, which read as hatches);
  - oil under every parking bay;
  - faint curved tyre marks where cars turn out of the garage exit and into its entry (a first try with straight
    crossing streaks read as a drawn X and was replaced);
  - weeds along the back lane wall and the alley edges.
- **Edges:** concrete edging around every gravel lot, with a little gravel kicked over it; lawn kerbs around the
  garden and the west verge; a dark channel round the wash plot's old asphalt; edging round the gas, Quick-Fit, depot
  and academy lots.

### Vacant plots (`env-plots.js`, new)
One hideable group per plot. Each gets its own character:

| Plot | Vacant-lot character |
|---|---|
| Spray Bay (paint) | Old truck yard behind chain-link: the low front fence has a gateway in front of the pad and leaves the paint P bay's driveway open; faded truck bays, oil, broken-out slabs patched with asphalt, a rusty flatbed trailer, a skip of rubble, pallet stacks, tyres, an engine block, drums, a hardcore heap, wheel ruts in the gravel, scrub trees, brambles, a "Coming soon" board |
| Platinum Club (vip) | Meadow gone wild, a path trodden across it (sidewalk -> pad -> back lane), staked saplings, brambles, a low post-and-rail fence with gaps for the path and the pad, wildflowers |
| Harbor Lounge | Demolished building: concrete footings with room walls, teal/cream floor tiles, a screed patch, a broken brick wall stub, a rubble heap, a skip |
| Suds & Shine (wash) | Small disused car park, fenced and padlocked (chained double gate), faded bays, pallets, a drum |
| Tow Truck | Corner by the hall wall: tyre stacks, an engine block, a tarp-covered heap, drums |
| Pump & Go (gas) | A station long gone: capped pump islands with hazard ends and guard posts, bolted column plates, tank fill covers, faded arrows |
| Quick-Fit | Old tyre yard: chain-link, tyre stacks and a heap round the hidden wrench w11, a trailer loaded with tyres, faded fitting bays |
| Rust & Gold Salvage | Overgrown field: rusty trailer, tyre heap, scrap sheets, scrub trees, a sagging back fence with a gap |
| The Greasy Spoon | A demolished diner: footings, black-and-white floor tiles, rubble, a skip, a brick stub |
| Bay Classics | Old car park grassing over: cracked tarmac with grass in the cracks, faded bays, wheel stops, dead lamp posts, survey stakes with tape, saplings |
| Harbor Parts Co. (depot) | Builders' yard: shrink-wrapped brick pallets, steel beams, kerb stacks, a site cabin |
| Wrench Academy | Surveyed lot: stakes with tape, a soil heap, a site cabin and a portable toilet |

Every board says "COMING SOON" with the property name. The ferry plot has no dressing: the terminal stands there from
the start.

- **API:** `setPlotCleared(id, cleared)` and `plotSolids(id)` (env-plots -> environment.js -> models/index.js).
  `town.js setVacant()` drives them:
  - every plot starts vacant in each new world;
  - `refreshProps` clears built and owned plots;
  - `startSite` clears a plot the moment it is bought;
  - `refreshServices` clears the depot and academy when Main Street opens;
  - the dressing's solids are added to `ctx.solids` while the plot is vacant (in town mode) and removed with it.
- **Keep-clear check:** `clearZones()` (pads and the walk to them, sale signs, parking bays, rescue spots, wrenches)
  warns at build time. It is silent now; one fence/sign overlap was found and fixed.
- **Verified in the game:**
  - all 12 plots are visible while vacant;
  - `buy('paint')` hides it at once (before the site) and removes its solids;
  - after a reload it stays hidden;
  - after `shop:changed` with paint unowned, the dressing and its solids come back;
  - walking: the front fence gateway lets you through to the pad, the fence stops you at z 10.29, the skip at
    x -21.35, the VIP rail at z 10.38, and the VIP path gap lets you through.

### Town pass (camera over TOWN.camClamp at phone size)
Fixed while walking:
- the crossing scuffs at the west alley / entry mouth (they read as a drawn X);
- Bay Classics' bay lines painted on grass (the bays are cracked tarmac now; real paint does not survive on grass);
- meadow mottling too strong (softened);
- Spray Bay's north gravel too empty (added wheel ruts and the hardcore heap);
- no permanent puddle (it would never dry in this sunny town).

Looked at and left alone: the garage lot (unchanged), the harbor and quay (envdress), the corners (cliffs and headland
hide the edge), the ferry plaza with its terminal.

### Performance (`?nogame`, 462 x 946, renderer.info incl. the shadow pass; calls / triangles)

| Spot | Before | After |
|---|---|---|
| 0, 2 | 66 / 107k | 78 / 119k |
| -30, 2 | 53 / 108k | 62 / 128k |
| 20, 4 | 51 / 93k | 66 / 116k |
| 36, 0 | 51 / 108k | 61 / 120k |
| -55, 4 | 49 / 86k | 63 / 105k |
| 55, 14 | 50 / 79k | 64 / 97k |
| 0, -28 | 53 / 107k | 65 / 120k |
| -35, -30 | 44 / 103k | 55 / 124k |

- **Ground:** the new ground costs almost nothing (about 0.1k triangles in view).
- **Where the increase comes from:** the vacant-plot dressing (measured by hiding it: -21 to -23k and -14 to -20
  calls at -30,2 and 20,4), including its shadow pass. Part of it is Main Street plots just past the top of the
  screen: three.js culls them by a bounding sphere that is too big for a flat lot.
- **It shrinks as the game goes on:** each plot's dressing disappears as it is bought.
- **Cuts already made:** decals as quads and discs, 8-sided tyres and drums, simplified pallet stacks, box fence
  posts every 3 m, and low pieces (footings, wheel stops, tiles, tufts) do not cast shadows.
- **If it is still too much:** split each plot's two meshes into ~12 m chunks for tighter culling, or stop the
  clutter casting shadows.

## Files touched
- **(B)** src/config.town.js, src/game/wash.js (new), src/game/features.js, src/game/cars.js, src/game/cash.js,
  src/game/town.js, src/models/buildings-home.js, src/models/env-life.js, src/models/env-streets.js, TOWN.md (4.6).
- **(A)** src/models/env-kit.js, src/models/env-streets.js, src/models/env-plots.js (new), src/models/environment.js,
  src/models/index.js, src/game/town.js, src/models/preview-dress.js (flushes the ground batch).
- **Logs:** docs/town-agents/progress/polish.md, this report, README row.

## Not done / not verified
- I did not walk every plot's whole perimeter on foot. Solids were checked by `clearZones()`, by obstacle queries and
  by five walk tests.
- Main Street plots were looked at in `?nogame` and through the obstacle list only. The district was not opened and
  played with them.
- No long 10-minute console soak run. The runs I did (about 2 min each) showed no game errors. The
  "Script error. @ :0:0" lines only appear after the browser tool's own JavaScript calls; a clean load has none.
- The performance increase above is reported, not fully removed.

## For later agents (lounge, paint shop, VIP)
- Their plots now have vacant dressing that `town.js` hides the moment the plot is bought. Do not build vacant-lot
  scenery into the environment. If you add a property or a service, give it a dressing in `env-plots.js` (one
  `plot(root, id, fill, seed)` call) or it simply has none.
- The ground base under each plot is unchanged (gravel / concrete / old asphalt). Your building brings its own floor
  as before.
- `surface()` is batched now. Code that builds its own world (a preview page) must call `flushSurfaces(root)`.
- The wash's leave hook (`garage.hooks.leave`) chains to a previous hook. Keep chaining if you add another.
- Open issue left as found: the diner pad (3.4, -26.4) sits inside the diner parking bay (see `briefs/open-issues.md`).
