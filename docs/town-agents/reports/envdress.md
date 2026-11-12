# Final report: `envdress` (Sonnet)

_2026-11-12, resume run (stopped early for usage limits). Verbatim last message of the subagent._

The Harbor Town dressing is built and both files parse, but it is untested on the real page. `environment.js` doesn't call `buildHarbor` / `buildStreetLife` yet, so `?nogame` can't show any of it. I only looked at it in my own preview page, `src/models/preview-dress.html` (game camera, portrait). The preview loads with no errors; its only console output is two warnings saying a life ring was skipped because its spot was taken.

**What's built** (`src/models/env-harbor.js` and `src/models/env-life.js`; `preview-dress.js` is the preview's script):
- **Harbor quay:**
  - Rail, mooring bollards and ladders, with rail gaps at ladders, the gangway, pier roots, rescue spots and wrenches.
  - A pontoon and gangway, two piers (one with the harbor-master hut, flag and wind vane), and 12 bobbing boats with mooring lines running to bollards or mooring balls.
  - Buoys, a bait stall, fish boxes, nets, crates, benches, life rings and quay lamps.
  - Breakwaters with a lighthouse and beacons, a far shore with cranes, and edge bollards on the ferry plaza.
- **Street life:**
  - Lamps, meters, hydrants, bins, benches and planters on Main St and the avenues.
  - Four corner poles with street-name signs and one-way arrows.
  - The two bus stops.
  - The back lane, with wrench nooks for w01–w03, a shed with a back door, step and lamp, and a bin store.
  - The west and east alleys (w04, w05) and the dead-end gaps between the Main St plots (w14–w16).
  - The garden park (fountain with an animated jet, anchor statue, beds, benches, hedges, trees, lanterns, paths) and the grass verge on West Ave.
- **Solids:** a script check found nothing solid within 1 m of a wrench, or inside the rescue spots, parking bays, plots, bus stops or tow apron. The one clash found was a w15 crate stack overlapping the academy plot; I fixed it in the last edit and did not re-run the check.

**Draw calls and triangles** (preview camera at 0,2, as reported by `renderer.info`, which counts the shadow pass too):

| | Calls | Triangles |
|---|---|---|
| Without my dressing | 22 | about 12k |
| With it | 54–66 | about 50–54k |

**Needs doing:**
- Wire `buildHarbor` and `buildStreetLife` into `environment.js` (env's job), then check the real page with `?nogame&cam=x,z` and compare draw calls there.
- Look at parts of the map I haven't viewed yet: Main St east of x=25, East Ave, the Harbor St north sidewalk, the east alley and the w16 gap.
- Place the quay trash cans and kerb parking meters; the code exists but I never placed them.
- Re-run the solids check after the w15 fix.

**What I assumed from env** (also in `/tmp/wb-progress/envdress.md`):
- The quay top sits at `Y.walk` up to z=17.0, and the water plane is at y=-0.4 (exported as `WATER_Y` from `env-harbor.js`). I add my own coping strip at z 16.86–17.0, so env should not build one there.
- The Harbor St north sidewalk is only 0.7 m wide, so it gets two hydrants and no other furniture.
- The camera can't see south of about z=29, so the far shore and breakwaters appear only as a thin band at the bottom edge.

`/tmp/wb-progress/envdress.md` has the full state and the list above, so the next agent can resume from it.
