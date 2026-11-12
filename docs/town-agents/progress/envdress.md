# envdress progress (resumed run)

## Status
- [started] Read briefs, TOWN.md, env-kit.js, env-streets.js, legacy harbor code. env-harbor.js / env-life.js were STUBS (no predecessor work).
- Plan: own preview page src/models/preview-dress.html + preview-dress.js (buildStreets + my functions + water + plot placeholders, game camera, ?cam=x,z&k=zoom&top=1).

## Done + verified
(none yet)

## Next
1. preview page  2. harbor quay (rail, bollards, ladders, boats, piers, buoys, props, huts, distant breakwater/lighthouse/cranes)
3. street life  4. alleys/back lane/wrench nooks  5. garden park  6. verify + stats

## Known issues

## UPDATE 1
- DONE+viewed: preview page src/models/preview-dress.{html,js} (?cam=x,z &k= &top=1 &nolife &noharbor &showsolids &marks &noplots).
- DONE+viewed: env-harbor.js buildHarbor: quay rail (gaps at cars/wrenches/ladders/gangway/pier roots/stall), coping + yellow edge line, mooring bollards,
  3 ladders, pontoon+gangway, 2 piers (hut, flag, lamp), 10 bobbing boats with mooring lines to bollards, buoys, stall, fish boxes, nets, benches, life rings,
  rubble moles + lighthouse + beacons + far shore with cranes, ferry plaza edge bollards/lines.
- ASSUMPTIONS for env: quay top at Y.walk up to z=17.0, water plane y=-0.4 (WATER_Y exported from env-harbor.js), I add a coping stone strip z 16.86..17.0 (+0.045 high) myself.
- NEXT: street life (env-life.js), alleys/nooks, garden.

## UPDATE 2
- DONE+viewed: env-life.js buildStreetLife: keep-clear registry; Main St lanterns/lamps/meters/hydrants/bins/benches/planters/mailbox/news box; Harbor lamps (in env-harbor), avenue lamps + bins + hydrants; 4 corner poles (street-name blades + one-way arrows);
  2 bus stops (createBusStop); back lane (3 wrench nooks w01-w03, shed with back door/step/lamp, bin store, cabinets, lamps, random dumpsters/pallets/drums); west+east alleys (w04, w05 nooks);
  Main St plot gaps w14-w16 dead ends; garden park (anchor statue, fountain with animated jet, beds, benches, hedges, trees, lanterns, paths); West Ave grass verge.
- Verified via solid-vs-keep script (wrench r1, rescue, parking, plots, tow apron): clean.
- NEXT: full-map sweep screenshots, stats (draw calls/tris), polish density, final report.

## FINAL STATE (wrapped up on lead's request)
Both files parse (node --check). Preview page src/models/preview-dress.html loads with no errors; only console output is 2 warn lines ("quay slot blocked: ring" = a life ring skipped on purpose).
NOT yet tested: the real page `?nogame` (env had not wired buildHarbor/buildStreetLife into environment.js when I stopped). Check /tmp/wb-progress/env.md.

### Done + viewed from the game camera in the preview
- env-harbor.js buildHarbor: quay rail with gaps, coping + yellow edge line, mooring bollards, 3 ladders, pontoon + gangway, 2 piers (harbor-master hut, flag, wind vane, lamps),
  12 bobbing boats with mooring lines to bollards, buoys, bait stall, fish boxes, nets, crates, benches, life rings, kerb lamps, rubble moles + lighthouse + beacons,
  far shore with cranes, ferry plaza edge bollards and lines.
- env-life.js buildStreetLife: keep-clear registry (baseKeep/streetKeep), Main St lanterns/lamps/meters/hydrants/bins/benches/planters, avenue lamps/bins/hydrants,
  4 corner poles (street-name blades + one-way arrows), 2 bus stops (createBusStop), back lane (nooks for w01-w03, shed with back door/step/lamp, bin store, cabinets, random clutter),
  west + east alleys (w04, w05), Main St plot gaps (w14-w16 dead ends), garden park (fountain with animated jet and droplets, anchor statue, beds, benches, hedges, trees, lanterns, paths), West Ave verge.
- Solid-vs-keep script: no solid touches wrench r=1, rescue spots, parking bays, plots, bus stops or tow apron. One clash (w15 crate stack vs academy plot) was fixed by the last edit and not re-run.

### Left / unverified
- Wire-up in environment.js (env's job) and a check on the real page; compare draw calls there.
- Stats in the preview (cam 0,2): baseline 22 calls / 12k tris; with dressing about 54-66 calls / 50-54k tris (counts include the shadow pass).
- Full portrait sweep of the whole map was not done: Main St east side (x>25), East Ave, Harbor north sidewalk, the east alley and w16 gap were not looked at closely.
- Not done: trash cans on the quay (code exists, not placed), parking meters on the quay kerb, no boat/ferry-water check against env's real water level (assumed y=-0.4).
- Assumptions for env: quay top at Y.walk up to z=17.0, water plane y=-0.4 (WATER_Y exported), I add a coping strip at z 16.86..17.0.
