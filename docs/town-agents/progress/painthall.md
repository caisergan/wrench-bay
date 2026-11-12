# painthall progress

Started 2026-11-13. Brief: docs/town-agents/briefs/painthall.txt

## Done + verified
- createPaintTank(colorId): checked in preview (?focus=paint&show=tanks), all 8 colours x progress 0 / .5 / 1 / cycling.
- createSprayBooth(index): checked in preview (?focus=paint&show=booths), 4 states x IR off/on, timer, haze, curtain.
  North end starts 0.1 south of boothZ[0] (glass posts stayed 5 cm inside the staff lane otherwise).
- createPaintHall(): shell + spectrum band, floor + markings overlay, back wall (plates, manifold + valve stubs, air
  line), sign, stacks (spinning fans), plant yard (compressor cycle + shudder, receiver, dryer, flammables, pipe over
  the wall), painters' corner, colour lab (+ window decal), waste drum, forecourt overlay, shelter, prep desk,
  planters, east mural, drainpipes. 17 meshes. Solids: 23 boxes.
- preview-town: &show=hall|tanks|booths|all, &paint=0|1|2 in the game view, &nav=0; game view clears the
  paint / tow / wash / lounge plot dressing.
- Real game (?autoplay&save=painthall, openTown / giveFame(5) / buy('paint') / tp): hall stands, no dressing under
  it, no page errors. Draw calls near the paint shop 113-129 (garage 202).
- ?facilitytest&save=painthall2: cars arrive, queue in the painted slots, valet, lift, reverse, pick-up, exit.

## Known issues
- Prep desk (PAINT.decor.prepDesk) is crossed by the default valet route from queue slot 1 (staff.js pathToBay,
  first waypoint sx + 0.4). No free spot near the valet stand; needs a route change (report).
- I navigated the agent tab 4b7cb9e6 once by mistake and restored its URL (?facilitytest&save=design1).

## Next
- DONE. Report: docs/town-agents/reports/painthall.md
