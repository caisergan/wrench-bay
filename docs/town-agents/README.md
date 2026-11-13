# Harbor Town expansion: agent work log

This folder is the work log of the subagents building the Harbor Town expansion. The design is in `TOWN.md` at the repo root (section 6a is core's gameplay API as built). The numbers are in `src/config.town.js`. The lead (main Claude session) does the design; the subagents build.

## Folder
- `briefs/`: what each role was told. Every agent reads `common.txt`, then `common2.txt` (the resume rules), then its role file, plus a `*2.txt` resume addendum where there is one. `open-issues.md` collects the problems found in the reports, sorted by the later agent who should fix them.
- `progress/`: each role's running progress file (done / verified / in progress / next). **Resume a role from here.**
- `reports/`: each role's final report, verbatim.
- `tools/`: test helpers the agents wrote: core's autoplay bot and no-reload Vite config, and cars' Node regression tests.
- The tree before the expansion started is commit `4509a8c` (`main` when the `dev` branch was created); the expansion is on branch `harbor-town`, PR into `dev`.

From now on, agents write their progress and reports here (`docs/town-agents/progress/<role>.md`, `reports/<role>.md`), not only in /tmp.

## Status (2026-11-12, after the second run, stopped early for usage limits)

| Role | Model | Files | Status |
|---|---|---|---|
| core | Opus | src/core, src/game, config, TOWN.md 6a | **Partial.** The game boots. The garage regression passed (bot to 12/13 unlocks). The town opens. Tow truck: buy, build, drive, park, back into the shed. `?facilitytest` works. Not run yet: the Main Street gate, buying the other properties, upgrades, pointers, most debug helpers. See `progress/core.md`. |
| env | Opus | environment.js, env-kit, env-streets, env-terrain, env-town | **Mostly done.** Streets, tunnels, cliffs, quay wall, fillers and backdrop are in, and envdress is wired in. Left: a full camera pass, the tunnel-hiding check, the townSolids check, performance. |
| envdress | Sonnet | env-harbor.js, env-life.js | **Mostly done.** Harbor, street furniture, alleys and the garden park are built. Left: checking the unviewed areas on the real page, the bins and meters, re-running the solids check. |
| cars | Opus | cars.js, leak.js, preview-cars.* | **Mostly done.** All 21 new types plus the methods; the existing cars are unchanged (256/256). Left: browser checks of some types and states, a full repair in the game. |
| vehicles | Sonnet | vehicles.js, preview-vehicles.* | **Done.** Tow truck (2 looks), 7 traffic vehicles, ferry. |
| bhome | Opus | buildings-home.js, props-town.js, preview-town.* | **Partial.** Done and checked: the town kit (13 pieces), turntable, tow shed (3 levels), wash arches and kiosk (3 tiers), lounge annex (2 tiers). Still stubs: the whole VIP set (the paint set moved to `painthall`). |
| painthall | Opus | the paint stubs in buildings-home.js, props-town.js (additions), preview-town.* | **Done** (2026-11-13), reviewed by the lead. Spray Bay hall, spray booth (4 states, IR, haze, curtain), paint tanks (8 colours, filler). Booths and tanks show in the game only once `paintshop` gameplay exists. Report `reports/painthall.md`. |
| paintshop | the lead, directly | `src/game/paint.js` (+ config numbers, the "no free booth" / drive-hint wording in `cars.js` / `hud.js`) | **Done** (2026-11-13). Spray Bay gameplay: paint customers with colour tiles, spray booths (mask, spray sweep, mist + haze, cure timer, curtain), paint tanks, waste drum, painters + prep tech, the 11-step chain, IR lamps, stripes, premium colours, payout, shared streak, offline income, `__game.spawnPaintCar` / `__game.paint.state()`. Played through by hand and automated in the browser; garage unchanged. |
| bmain | Sonnet | buildings-main.js, preview-main.* | **Done.** All 8 Main Street and corner buildings, with levels. |
| people | Sonnet | characters.js, fx.js, props.js, critters.js | **Done** (first run). |
| ui | Sonnet | src/ui/* | **Done** (first run). |
| polish | Opus (high), then the lead | surfaces, vacant plots, car wash move (`briefs/polish.txt`) | **Done.** Wash moved off the garage exit into its own drive-through (`wash.js`), real-scale ground textures without tiling, worn streets and edges, vacant-lot dressing for 12 plots (`env-plots.js`, `setPlotCleared`). Report: `reports/polish.md`. |

## Next
1. Finish wave 0 from the progress files: core first (it gates everything), then bhome, env, envdress and cars.
2. Wave 1, once core's 6a is complete: `rescue`, `paintshop`, `comfort` (wash + lounge), `vipclub`, `townlife`. The briefs are in `briefs/` (rescue.txt ...). Give each agent `common.txt`, `common1.txt` and its brief, plus the relevant parts of `open-issues.md`.
3. Wave 2: `projects`, `business`, `endgame`. Wave 3: `balance`, `qa`.

## Preview pages (dev server: `npm run dev`, http://localhost:5190)
- Game: `/?autoplay&save=<slot>`, `/?facilitytest`, `/?nogame&cam=x,z` (environment only), `/?nogame&uitest`.
- Models:
  - `/src/models/preview-cars.html`
  - `/src/models/preview-vehicles.html`
  - `/src/models/preview-town.html` (bhome)
  - `/src/models/preview-main.html`
  - `/src/models/preview-people.html`
  - `/src/models/preview-dress.html`

  Most of them take `?view=game` for the real portrait camera.
