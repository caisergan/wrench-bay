# Final report: `core` (Opus)

_2026-11-12, resume run (stopped early for usage limits). Verbatim last message of the subagent._

I stopped early as you asked. The game boots, the garage plays as before in my test runs, the town opens, and the tow truck works end to end. Main Street, buying the other properties, and most of the new APIs are written but have not been run yet. Every core file passes `node --check`, and I reloaded the game on port 5190 after my last edit.

**What works, checked in the browser**
- **Boots:** "GAME BOOTS" with the time is at the top of `/tmp/wb-progress/core.md`.
- **Garage regression:** I ran an autoplay bot (it teleports the player through the loop) on a fresh save at 4x speed. It reached 12 of 13 unlocks with the valet and two mechanics working, 133 repairs, streak, cash piles and pads all behaving, and no errors.
- **Town opening:** a save with the valet and first mechanic opens the town on load. The toast plays, the chain barriers drop, and the walking area and camera switch to the town.
- **Tow truck property:** the for-sale sign, sale label and pay pad work. Paying shows a building site for 3.5 s, then the shed appears with the truck inside.
- **Tow truck driving:** you get in at a ring in front of the shed. I drove it along Harbor Street and parked in the garden bay, and the spot was saved. Driving back to the home bay nose-first, it did a three-point turn by itself and reversed into the shed.
- **`?facilitytest`:** a second facility on the paint-shop layout plays the plain garage loop. Its cars arrive, get repaired, pay and leave, and its pads hired a test mechanic and valet.

**Written but not checked in the browser**
- The Main Street gate, and the depot and academy pads that open the Pro Gear and Academy sheets.
- Buying every property other than the tow truck, property upgrades, and the ferry ticket.
- The edge pointers, map targets, and the "new car class" toast when fame levels up.
- Reserving a garage lane slot when a car is towed in, and spawning the towed car at the drop ring.
- How paint and VIP jobs show in the job bubble, and the bonus ribbon (e.g. "Rescue x2.5").
- Hiring floor managers through `buyManager`.
- Most debug helpers on `__game`.
- I changed the three-point turn to start by backing out, so the nose no longer goes into the shed corner. Only the old order was watched, so the new order has not been seen in motion yet.

**Files I changed:** `src/game/town.js`, `vehicles.js`, `facilitytest.js` and `pointers.js` (new or rewritten), plus small additions to `cars.js`, `owners.js`, `pads.js`, `guide.js`, `util.js`, `world.js` and `index.js`. In `src/core/state.js` I added `buyManager` and `hasManager`. I appended section 6a to `TOWN.md`; it says at the top which parts were checked in the browser and which were not.

**What is left in my brief** (in order, also in the progress file)
1. Load a save from before the expansion and play it, run the next-garage rebuild with the town open, and check offline earnings.
2. Buy every property through its pad, including the Main Street gate, then reload and check the buildings and walls.
3. Walk the whole town boundary to check you can't get out or get stuck, and that Main Street stays blocked until paid.
4. Drive the truck round the ring road and park it in three bays.
5. Watch customer cars come in and leave through the tunnels.
6. Compare frame time before and after the town opens.
7. Finish section 6a with whatever those checks change.

**Requests for other owners**
- `bmain`: their ferry-terminal placeholder sits at the map origin, so it shows as a grey box in the middle of the garage until they finish it. Their junkyard fence (x -44.5 to -29.6) doesn't match the default walls in `town.js`. The easiest fix is for the model to set `group.userData.solids`; otherwise core has to change the default.
- The pointer system now goes through `ui.pointer` only. UI does the priority order, the limit of three and hiding on-screen targets; nothing is needed from them.

The bot and my no-auto-reload test server config are in `/tmp/wb-core/`. I stopped that server (port 5192); the progress file says how to restart it.
