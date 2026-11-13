# dispatcher report

Built: src/game/roads.js (road graph, routes with arcs, PathFollower, footprint checks, `__game.roads` debug draw),
src/game/dispatcher.js (level 3 tow driver: driver character, claim -> kerb manoeuvre -> hook -> tow -> drop zone ->
back into the shed), vehicles.js `backIntoShed()` rewrite (car-like moves into the shed from the alley home bay and
from the drop zone).

The agent stopped mid-soak (usage limit). The lead finished step 6: see progress/dispatcher.md "Soak". One bug found
by the soak and fixed in rescue.js (dropped car vs garage arrival deadlock); two env-plots console warnings removed.

Known / left as is:
- The towed car is still articulated (~0.9 rad) when the truck stops in the drop zone (the zone is short after the
  turn in), so the dropped car stands at the drop-off lane corner for a moment before it drives into the lane.
- Garage cars follow each other close (3.15 m look-ahead, cars.js): in turns two cars can touch for a moment. Not
  new with towing.
