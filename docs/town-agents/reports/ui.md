# Final report: `ui` (Sonnet)

_2026-11-12, first run. Verbatim last message of the subagent._

The `ui` role is built and checked in the browser. That includes the real core state helpers, which had landed by the time I tested. Everything is in `src/ui/*`.

**What it does**
- **Labels**
  - New kinds: `'sale'` (`setInfo({name, blurb, price, fame, locked, level})`, price fill via `setProgress`), `'till'`, `'timer'`, `'stars'` (`setStars`), `'call'`.
  - The `'job'` bubble now takes `{type:'spray', color}` canister tiles, `{gold:true}` and `{gold:true,type}` gold tiles, and `setBonus(text|null)` for the ribbon.
  - Every label answers every setter, and unknown kinds fall back to a plain info label, so nothing throws.
- **`ui.pointer`**
  - Sits on an inner rectangle that avoids the top card, fame and map buttons, the two side button columns, the hint/chip stack and the thumb zone.
  - Glides, hides once its target is on screen, and spreads apart when several share an edge.
  - Caps at 3 shown, in the priority order of 4.16.
- **`ui.hint`, `ui.banner`, `ui.chip`**
  - Hint and chips share a centred stack under the top card, below the streak chip.
  - The default "Drive to a free lift!" still shows on `drive:start`; an explicit `ui.hint()` overrides it.
- **HUD**
  - Fame badge (progress ring, bump on `fame:changed`, tap opens Fame) and map button sit either side of the top card.
  - Both stay hidden until `town:opened`, or `S.townOpen()` at boot.
  - The top card switches to town progress once the garage is complete.
- **Panels**
  - Fame (bonus, upcoming unlocks, classics wall, golden wrenches) and the town map (drawn from config rectangles, pins and a list showing owned / for sale / locked with the reason, tap emits `ui:mapTarget`).
  - Pro Gear and Academy sheets, wired to `townpad:enter` / `townpad:exit`.
  - `showGarageComplete()` (nothing resets), `showFerry(onSail)`, the fame level-up moment and the "Perfect!" moment (on `fame:levelup` and `vip:done` with 3 stars, or called directly).
  - `ui.openFame`, `ui.openMap`, `ui.levelUp` and `ui.perfect` are also exposed.
- **Town missions**: up to 3 a day, drawn from rescues, resprays, perfect VIPs, till collection and restoring a classic, each only if the player owns what it needs.
- **Icons and sfx**: about 30 new icons, and all 16 new sounds.

**Files**
- Edited: `icons.js`, `labels.js`, `hud.js`, `index.js`, `panels.js`, `audio.js`, `ui.css`, `devtest.js`.
- Added: `guidance.js`, `panels-town.js`, `modal.js`, `townstate.js`, `devtest-town.js`.

**Verified** at about 420 x 860 and the 360 x 740 emulation (which the tool reports as 396 x 814) with `?nogame&uitest`:
- All new label kinds, six pointer kinds (three shown at once, clear of the HUD), chips, hint, banner, and the Fame, map, Pro Gear, Academy, ferry, level-up and Perfect screens.
- Town missions and a mocked town (the "town" button in the dev bar).
- The real state with `state.town.open = true`: 14 map pins, fame badge visible.
- With the town closed, the HUD and title screen look as before.

**Not verified**
- The garage-complete modal, never screenshotted.
- 430 x 932, not run.
- The live game, only `?nogame`; I could not run with the game loaded. The page threw only "Script error" lines, all from other roles' mid-edit files: Vite kept raising a `./vehicles.js` import error from `src/game/world.js`. I hid that overlay in the page and saw nothing from my own code.
- The "You" marker on the map only shows with a live player.

**Changes I made that you might not expect**
- The old bottom driving hint is gone. Its text now shows in the stack under the top card, as the spec says.
- `ui.chip` takes `until` as a `Date.now()` timestamp in ms, or `seconds` from now.
- `sale` `setInfo.level` is the 1-based level being bought; from 2 on, the card shows "Upgrade Lv N".

**What others need to do**
- **core:** add `buyManager(id)` to `state.js`. Until it exists, Academy hiring falls back to spending cash and pushing the id onto `state.town.managers`, then emitting `manager:hired`.
- **gameplay:** call `ui.showGarageComplete()` and `ui.showFerry(onSail)` yourselves; neither listens for an event. Call `ui.hint(null)` when leaving a vehicle.
- **gameplay:** emit `rescue:call {spot}` with a `RESCUE.spots` id so the map shows the call. The tow truck's position is not shown on the map.
