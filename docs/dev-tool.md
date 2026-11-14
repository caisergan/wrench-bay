# Dev tools

An in-game panel for testing the game: change any stat of the save, tune any balance number live, jump to any stage
of the game, and hide the HUD for clean screenshots. It is a lazy chunk (`src/dev/`): players never download it unless
it is switched on.

## Turning it on

| How | What it does |
|---|---|
| `?dev` | Turns the tool on and remembers it (localStorage), so reloads keep it. |
| `?dev=0` | Turns it off again. Balance overrides stop applying (they are kept for next time). |
| `?nohud` | Loads the tool with the clean screen on (no HUD, no labels). |
| Hold the cash pill for 3 s | Turns it on where you cannot type a URL (the iOS app). |

Use `?save=name` as well to test on a separate save slot.

The **DEV** button sits on the left, under Missions / Shop. A coral badge on it counts the balance overrides that are
active, so a tuned game is never mistaken for the real balance. The panel is a bottom sheet that does not pause the
game: the change happens above it while you watch. The chevron makes it taller.

## Tabs

- **Money**: cash and gems (exact amount: `1.5k`, `2m`, `3b`; quick +/x10/0 chips), boosts without their cooldown,
  the speedy streak, and "Away 5 min / 30 min / 2 h", which opens the real welcome-back modal.
- **Garage**: garage number (keeps progress) or the real ferry, every unlock as a switch (switching on plays the real
  unlock; off rebuilds the world without it), upgrade levels, a customer spawner (class, jobs, VIP; one car or a full
  lane), daily missions (complete all, new day).
- **Town**: town open, Main Street, garage-complete flag; fame (set a level directly, add XP, or one real level-up with
  gems and the modal); every property's level (the building appears finished); Pro Gear; managers; restored classics;
  the paint shop and VIP unlock chains; fill / empty tills; golden wrenches; town stats.
- **Play**: pause the world, game speed 1-8x, cheats (fast feet, big hands, instant repairs, instant restock,
  endless patience, quick pay pads, rush of cars, fame x10), the player's position, teleport to any place, drive the
  tow truck.
- **Tune**: every number of the balance tables in `config.js` / `config.town.js` (about 450), grouped and searchable.
  Tuned rows are marked with the original value and a reset button. Layout numbers (positions, sizes) are left out on
  purpose. Most values apply at once; prices already on pads and built things need "Rebuild world".
- **View**: the clean screen, per layer (HUD, world labels, pointers and banners, toasts and float texts, pay dock,
  joystick), an invisible DEV button while the HUD is hidden (still tappable in the same spot), camera zoom
  0.5-3x (fog follows), a PNG of the 3D view, and a perf meter (drawn FPS, worst frame, CPU per frame, draw calls,
  triangles, pixel size, shadow redraws, memory, and the phone's thermal state in the iOS app).
- **Perf**: switches for testing heat and battery on a device. They are saved on the device and only apply while the
  tool is on; with `?dev=0` the game draws exactly as before.
  - **Heat**: the phone's thermal state (nominal / fair / serious / critical), Low Power Mode and battery, read from
    iOS every 2 s (`ios/App/App/DevThermal.swift`; a browser shows "only in the iOS app"). A log with a clock records
    every thermal change and every settings change. To compare presets: let the phone cool to nominal, unplug the
    charger, pick a preset, tap "Restart the clock", play, and note when it turns fair / serious.
  - **Presets**: Game default; Battery saver (60 fps cap, 30 fps when still, 5 fps under menus, 1.5x pixels, 1024
    shadow map); Lowest (30 fps, 1x pixels, no antialiasing, no shadows), the floor for how far heat can drop.
  - **Frame rate**: cap (screen rate / 60 / 30), 30 fps while neither the camera nor the player moves, 5 fps while a
    menu pauses the game.
  - **Resolution**: pixel ratio (auto / 2 / 1.5 / 1.25 / 1), dynamic resolution (steps down 0.125 a second while
    frames come late, back up after 3 s of keeping up), antialiasing (needs a reload).
  - **Shadows**: on / off, map size (auto / 2048 / 1024 / 512), redraw every frame / 2nd / 4th.
- **Save**: jump to a stage (brand new, early garage, garage complete, mid town, late game, everything maxed),
  named snapshots kept on the device, copy / download / import the save as JSON, lifetime stats, reset the save, turn
  the tool off.

Destructive buttons (the ferry, presets, loading a snapshot, import, reset) need a second tap.

## Keyboard (desktop, not while typing)

| Key | |
|---|---|
| `` ` `` | Open / close the panel |
| `H` | Clean screen on / off |
| `P` | Pause / resume the world |
| `[` `]` | Game speed down / up |

## How it works

- `src/dev/flag.js` (tiny, always loaded) decides whether to load the tool. `main.js` loads it before the game so the
  balance overrides are written into the config tables before anything reads them.
- `tuning.js`: override storage (`wrench-bay-dev:tuning`), paths like `PROBLEMS.oil.work` or `UNLOCKS.#lift1.price`
  (`#id` targets an array entry by id, so reordering a table keeps the override on the right entry). Cheats are named
  sets of overrides.
- `actions.js`: every change to the save. Small ones use the game's own helpers and events so the HUD follows live.
  Structural ones (taking unlocks or buildings away, setting a fame level) edit the save and call
  `__game.rebuild()`, the same world rebuild the ferry uses, debounced so several taps cost one rebuild.
- `view.js`: the clean-screen classes on `#game-root`, camera zoom, the perf meter and the snapshot.
- `perf.js`, `thermal.js`, `tabs-perf.js`: the Perf tab. The switches themselves live in `src/core/perf.js` (tiny,
  always loaded, reads `wrench-bay-dev:perf` only when the tool is on) and `src/core/engine.js` applies them.
- `panel.js`, `kit.js`, `tabs-*.js`, `dev.css`: the UI, built from the game's own tokens.

Nothing of the tool is saved into the game save; its own settings use `wrench-bay-dev:*` keys.
