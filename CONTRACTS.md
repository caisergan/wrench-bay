# Wrench Bay: game design + module contracts

> Mid and late game (the open town, paint shop, VIP club, tow truck, side businesses): see `TOWN.md`. It extends
> this file; ownership of new files and the agents working on them are listed there.

An original incremental / idle car repair shop game (three.js + Vite, portrait, mobile first). It is the sibling of
`../noodle-harbor` (an idle ramen bar): same engine, same chunky voxel art direction, same UI language. That project is
the style reference and a source of code to adapt; read it, do not edit it.

Run: the lead keeps `npm run dev` running at **http://localhost:5190** (do not start another server, do not run
`npm install`). `?autoplay` skips the title, `?nogame` boots only environment + UI, `?cam=x,z` pins the camera target.

## 1. The game

You run a harbor-side garage. Customers drop their broken cars in the drop-off lane and wait in the lounge. You
get into a car, drive it onto a free lift, fetch the parts its problems need from the part stations, bring them to
the lift and wrench until it is fixed. The car pays out a pile of cash, backs out, picks its owner up and leaves.
Cash buys lifts, new part stations (= new, pricier kinds of problems), staff who automate each step, and upgrades.
When everything is unlocked you move to a bigger garage where everything is worth 3x.

### Core loop (one-thumb: a floating joystick, no buttons)
1. **Arrive.** Every `spawnInterval` s (minus `spawnIntervalPerLift` per extra lift; if the drop-off lane has a free slot) a car spawns at `carSpawn`, drives
   `carEntry` and then along the drop-off lane (`queueLaneZ`, heading +x) to the first free slot of `queueSlots`
   (slot 0 = front). When a car leaves the lane the ones behind roll forward. Each car has 1..N **problems**
   (`PROBLEMS`: tire, oil, battery, engine, paint; only types whose station is unlocked; duplicates allowed) shown in a
   `job` bubble over the car and as visible damage on the model. Car body type (`CAR_TYPES`) sets a price tier.
   ~6% are gold **VIP** sports cars (never two on the lot at once): pay x3, drop a gem, less patient.
2. **Owner.** When the car first stops in the lane its owner pops out next to it, walks along `ownerWalkZ` to a free
   `loungeSpots` entry and waits there facing the garage. From that moment the car's **patience** counts down
   (`patience` s, x`coffeePatienceMult` with the coffee cart, x`vipPatienceMult` for VIPs; cars behind the front of
   the lane drain at only `patienceQueueRate`, so a full lane is not an automatic fail); the bubble shows it.
3. **Take it to a lift.** A zone ring sits on the north side of every waiting car (`queuePickupOffsetZ`). Standing
   in it for `enterCarDelay` s, while at least one lift is free, makes the player hop in: the character hides, the
   camera follows the car and the joystick now **drives the car** (`driveSpeed`, car turns to face its velocity,
   circle collider `CAR.radius` against obstacles and bounds). Free lifts show a bouncing arrow / highlighted ring
   while driving. When the car is inside a free lift's capture box (`liftCapture`) it snaps onto the lift (short
   tween to the lift centre, yaw = PI, nose to the back wall), the player pops out beside it, the lift raises the
   car (`liftTime`, `LIFT_RISE`) and its light turns busy. If no lift is free the ring shows an `info` label
   "No free lift!".
4. **Parts.** Each unlocked station restocks one part every `PROBLEMS[t].restock * upgradeValue('supply')` s up to
   `stationMax`, stacked on its `partAnchor`. The player picks up by standing on the station's floor mat
   (`stationMat`, centred at `stationPickupOffsetZ` in front of it) into their carry stack (mixed types, capacity
   `PLAYER.carryBase + upgradeValue('capacity')`, a `max` label when full). The mat hands over, one per
   `pickupInterval`, only the parts the cars on the lifts still wait for and nobody is bringing (mechanic claims and
   carried parts don't count), keeping a free hand for every other part type still needed (a needed part always
   gives one). More only while standing still: after `pickupExtraWait` a ring fills, one part per
   `pickupExtraInterval`. The mat glows while a lift needs its part and the player has a free hand. Parts fly in
   arcs, never teleport. The scrap bin (`scrapBin`) dumps everything carried (for wrong picks).
   Design: docs/pickup-redesign.
5. **Repair.** Stepping on a lift's work mat (`liftWorkMat`, in front of the car's nose) delivers every carried part
   the car still needs, even while walking (one per `deliverInterval`, flies from the stack into the car, job state
   `need` -> `ready`). Standing still on it (below `PLAYER.stillSpeed` for `PLAYER.stillTime`) the player
   **works**, and the car's job bubble stays opaque over them (`setSolid`): the first `ready` job's progress fills
   at `upgradeValue('repair')` work-seconds per second
   (`PROBLEMS[t].work` seconds of work per job); the character plays its wrenching animation, sparks fly, ratchet
   sfx ticks. A hired mechanic at the same lift adds `mechanicRate` on top. A finished job turns `done`: the damage
   disappears from the model (`car.setProblems(remaining)`), ding, small float text.
6. **Done.** All jobs done: confetti, the lift lowers, light turns green, the car shines, `repairPayout()` lands as
   a cash pile next to the lift (`liftCashOffset`) with a float text ("+$48", plus "Speedy!" when patience was not
   exhausted). Speedy repairs build the **streak** (`setStreak(state.streak + 1)`, +5% each up to +50%); a car that ran
   out of patience still pays its base price but resets the streak to 0 and its owner shows an angry emote.
   VIP: `addGems(vipGems)` + gem float text. `state.stats.repaired++`, `jobsDone += n`, `vips++`, emit `car:repaired`.
7. **Leave.** At least `exitGap` s after the previous departure the car reverses straight back to
   `(lift.x, exitLaneZ)` (still facing -z), then drives forward along the exit lane to `pickupStop`. Its owner has
   meanwhile walked from the lounge to `ownerCurb`, hops in (pop-out) when the car arrives (the car waits for them,
   4 s at most), and the car drives `carExit` and despawns. The lift is free again as soon as the car starts
   reversing.
8. **Collect + spend.** Walking near a cash pile collects it (bundles fly to the player). Pausing on the teal
   upgrade pad (0.4 s, so walking across does not trigger it) opens the upgrade board (`game/board.js`,
   `ui/board.js`; design: `docs/central-upgrades/`): Build sells the unlocks (`UNLOCKS`, the next `VISIBLE_PADS` for
   sale, the rest shown as the plan), Boosts the `UPGRADES`. Buying is a hold on the key; an unlock is then revealed
   (the sheet dips, the camera glides to it, it pops in). The Spray Bay has the same board in its colour lab. After
   the last unlock: "garage complete".

### What makes it fun (keep all of it)
- Constant short goals: 13 unlocks, each changes how the shop looks or works; 5 upgrade tracks; daily missions.
- A real choice every trip: which parts to carry (read the bubbles), which car first (patience bars), drive or fix.
- Driving the cars yourself is the toy; the valet later automates it, mechanics automate fetching + fixing, until
  the shop runs itself and you just steer, collect and expand. Offline earnings once valet + a mechanic are hired.
- Streak multiplier rewards fast, tidy play; VIP cars are little events.
- Juice everywhere: lifts whirr up, sparks while wrenching, damage visibly disappears, confetti + shine when done,
  cash stacks that fly to you, pop-in on every unlock, synthesised sfx for all of it.

### Staff (unlocks)
- **Mechanic** (up to 3). Loop: pick a lift whose car has `need` jobs not claimed by another mechanic (or `ready`
  jobs nobody is working on) -> walk (via `staffLaneZ`) to the stations that have those parts in stock and take
  what the car needs (max `mechanicCarry`) -> walk to the lift's mechanic spot -> deliver -> work until its ready
  jobs are done -> repeat for that car until finished, then the next. Idles at `mechanicIdle[i]`. The player can
  deliver to / work on the same car at the same time.
- **Valet**. Idles at `valetStand`. When the front-most waiting car has waited `valetDelay` s and a lift is free
  (and, while the player is driving, at least 2 lifts are free), the valet walks to the car, hops in, the car drives
  itself onto the lift via a couple of waypoints, the valet pops out and walks back.
- **Coffee cart**: patience x1.5. **Billboard**: spawn interval x0.7, VIP chance x`billboardVipMult`.

### Art direction
Chunky voxel / low-poly blocks, flat-shaded vertex colours, soft shadows, friendly proportions. Same family as
Noodle Harbor: deep navy-teal walls with coral trim, mustard accents, teal, cream, sea-glass green outside.
The hall has a polished light concrete floor with painted bay markings and hazard stripes; the forecourt is warm
light concrete; a street with a sidewalk runs along the bottom; the harbor (water, pier, boats) can peek in at the
sides. Palette lives in `src/config.js` `PALETTE`. UI: rounded, chunky, playful (font "Fredoka"), navy + cream +
coral. Everything original: no real car brands, logos or designs lifted from an existing game.

## 2. Ownership: do NOT edit files you don't own
| Area | Files | Owner |
|---|---|---|
| Core | `src/core/*`, `src/config.js`, `src/main.js`, `index.html`, `CONTRACTS.md`, `package.json` | lead (ask; don't edit) |
| iOS app | `capacitor.config.json`, `ios/`, `resources/` | lead |
| 3D models: props, cars, characters, fx | `src/models/*` except `environment.js` / `env-*.js` | models agent |
| Static world | `src/models/environment.js` (+ optional `src/models/env-*.js`) | environment agent |
| HUD, panels, labels, audio | `src/ui/*` (incl. `ui.css`) | UI agent |
| Gameplay systems | `src/game/*` | gameplay agent |

Four agents work in this folder at the same time, on the same dev server. Other areas will change under you and
may be briefly broken while their owner is mid-edit; reload and carry on. If you need a change in a file you do not
own, do not edit it: describe it in your final report. `src/models/props.js`, `cars.js`, `environment.js` and parts
of `characters.js` / `fx.js` currently hold lead-written PLACEHOLDERS (plain boxes) with the final signatures, so
every area can run before the others are done.

## 3. Core API (written; read the files)
- `core/engine.js`: `scene`, `camera`, `renderer`, `root` (#game-root), `onUpdate(fn(dt, t)) -> off`,
  `follow(obj3d)` (camera target: the player, or the car being driven), `worldToScreen(vec3) -> {x,y,visible}`,
  `setPaused(bool)`, `paused`, `start()`, `viewReach` ({x, back, front}: how far the screen reaches on the ground
  from the camera target; `ctx.near` uses it).
- `core/view.js`: `viewMode()` -> `'mobile'` (portrait phone frame) or `'browser'` (fills the window: wider view,
  shadow box fitted to the screen, bigger `viewReach`), `setViewMode(mode)`, `onViewMode(fn) -> off`,
  `canChooseView` (false in the iOS app). `html.view-browser` is set in the browser view for CSS.
- `core/input.js`: `input.vector -> {x, z, mag}` (world-space direction, mag 0..1), `input.setEnabled(bool)`.
  Creates `.joy-base > .joy-knob`. Any element with / inside a `data-ui` attribute does not start the joystick.
- `core/events.js`: `events.on(name, fn) -> off`, `events.emit(name, payload)`.
- `core/state.js`: `state` (`cash, gems, shopLevel, unlocked[], upgrades{speed,capacity,repair,supply,price},
  boosts, stats{repaired,jobsDone,cashEarned,unlocks,vips,bestStreak}, streak, missions, tutorialDone`),
  `load/save/resetSave`, `addCash(n, worldPos?)`, `trySpend(n)`, `addGems(n)`, `isUnlocked(id)`, `markUnlocked(id)`,
  `unlockPrice(u)`, `progress() -> {done,total,name,level}`, `unlockedPartTypes()`, `mechanicCount()`, `liftCount()`,
  `upgradeValue(key)`, `upgradeCost(key)`, `buyUpgrade(key)`, `activateBoost('income'|'speed')`,
  `incomeBoostActive()`, `speedBoostActive()`, `shopMult()`, `shopName()`, `nextShop()`, `streakMult(n?)`,
  `setStreak(n)`, `repairPayout(types, {tier, vip, speedy}) -> {total, base, speedy, streakMult}`,
  `offlineRate()`, `pendingOffline() -> {amount, seconds} | null`, `claimOffline(multiplier = 1)`,
  `refreshOffline()` (re-checks offline earnings when the game comes back from the background).
- `core/platform.js` (iOS app via Capacitor; every export is a no-op in the browser): `isNative`,
  `initPlatform()` (awaited in `main.js` before `load()`: restores saves from native storage),
  `persist(key, value|null)` (mirror a localStorage write to native storage; any new localStorage key must be added
  to `MIRRORED_KEYS` and written through `persist`), `haptic(sfxName)` (called by `sfx()`), `onLifecycle({hidden,
  visible})`, `hideSplash()`. Never read localStorage at module load time: in the app it is restored afterwards.
- `config.js`: `PALETTE`, `PART_TYPES`, `PROBLEMS`, `CAR_TYPES`, `CAR`, `LAYOUT`, `UNLOCKS`, `VISIBLE_PADS`,
  `ECONOMY`, `PLAYER`, `UPGRADES`, `BOOSTS`, `SHOP_NAMES`. All positions come from `LAYOUT`; never hard-code them.
- Conventions: +x right, +z towards the camera, y up, `yaw = Math.atan2(dx, dz)`. Models have their origin at
  floor level and face +z (a car's nose points +z at yaw 0).

### Events
Core: `cash:changed {cash, delta, worldPos?}`, `gems:changed {gems, delta}`, `progress:changed {done,total,name,level}`,
`upgrades:changed`, `boosts:changed`, `shop:changed`, `streak:changed {streak, mult}`.
Gameplay: `game:started`, `car:arrived {vip}`, `car:repaired {count, vip, speedy, total}`, `unlock {id, label}`,
`board:open (api)`, `board:close {id}`, `board:reveal {id, phase: 'dip' | 'rise', u}`, `board:changed {id}`,
`board:frame {id, top}` / `board:dismiss {id}` (from the sheet), `drive:start`, `drive:end`, `shop:complete`.
App: `app:resume` (back from the background with offline earnings pending; the UI shows the welcome-back modal).
UI: `ui:ready`, `ui:play` (PLAY pressed on the title screen), `ui:nextShop`.

## 4. Models API: `src/models/index.js` (models agent; environment agent owns `buildEnvironment`)
All factories return fresh objects, origin at floor level, facing +z. Everything casts / receives shadows sensibly.
Build static geometry with `voxel.js` `Builder` (one merged vertex-coloured mesh per rigid piece, shared
`litMat`); cache geometry per look. Target 60 fps on a phone with ~10 cars and ~20 characters on screen.
- `PART_H`, `CASH_H`, `LIFT_RISE` (numbers).
- `createPart(type) -> Object3D`: tire (lying flat) / oil jug / battery / engine kit (piston, gear or small engine
  block) / paint can. Fits a 0.5 x `PART_H` x 0.5 box so mixed parts stack neatly; instantly readable from the
  game camera (high, tilted) at small size, each with its own dominant colour (see `PROBLEMS[t].color`).
- `createPartStation(type) -> { group, partAnchor, setProgress(0..1), update(dt) }`: footprint max
  `LAYOUT.stationSize` (2.2 wide x 1.2 deep), ~1.6-2.0 tall, back against the wall. Five clearly different
  silhouettes: tire rack, oil drums with a hand pump, battery charging bench with blinking lights, engine parts
  workbench with a small hoist, paint shelf / mixer with coloured cans. `partAnchor`: front ledge at hand height
  where finished parts stack upward (4 high). `setProgress` drives a progress bar or dial on the front;
  `update` animates idle details.
- `createCar(look) -> { group, look, setProblems(types[]), setTyreStory(story), setShine(bool), update(dt, speed) }` and
  `randomCarLook({ vip = false }) -> { type, color, vip }` (`type` in `CAR_TYPES`, weighted by `weight`).
  Five distinct chunky body types (compact, sedan, pickup, van, sports) in a curated palette; all fit inside
  `CAR` (1.5 wide x 2.8 long), ~1.1-1.5 tall, windows, lights, bumpers, 4 separate wheels that spin in `update`
  (`speed` in m/s, negative = reversing) plus a slight body bob. Every tyre sits in a wheel arch with a dark well
  and ~3 cm of air; nothing of the body or of an overlay ever enters it, flat tyre or not (low cars get fender
  humps over the wheels, the hood between them). VIP = gold sports car with a crown or star on the
  roof. `setProblems(types)` takes the list of problems still unfixed (may be called any time, idempotent) and
  shows damage for each type present. Every effect must make sense on a car that is still being driven:
  tire -> one bad wheel per `'tire'` entry (camera-side rear wheel first). Each car has one tyre story (random,
  `setTyreStory('flat' | 'spare' | 'worn')` forces it): flat (~30%: the round rim sinks towards the floor, the
  tyre squashes flat at the floor with bulging sidewalls, the body settles onto the low corner and kicks once per
  wheel turn while driving; a flat is still drivable), flat with the first one already swapped for a small
  yellow-rimmed space-saver spare (~20%), or worn out (~50%: bald grey rubber, steel belt showing, cracked sidewalls). oil -> drops fall from under the engine and stay
  on the floor in world space (`leak.js`): a moving car leaves a drip trail, a parked one grows a puddle that stays
  behind when it drives off; spots shrink away after ~10-16 s; nothing rides along with the car. battery -> only
  while parked (stopped > 0.6 s): hood pops up, blinking red warning light, electric zaps crackling at the
  terminals, no idle vibration (engine off); pulling away: the hood shuts and the car struggles to start (shudder +
  black puff from the exhaust); while driving an occasional zap from the hood seam. engine -> animated smoke puffs
  from the hood; paint -> primer-grey patches and scratches on the body. Empty list = pristine. `setShine(true)` =
  just repaired: clean glints / sparkles for a few seconds.
- `createLift() -> { group, platform, setHeight(0..1), setLight('idle'|'busy'|'done'), update(dt) }`: two-post
  lift, posts at local x = +/-`LAYOUT.liftPostOffsetX` (0.3 square, ~2.2 tall), carriage arms that slide up with
  `setHeight` (car floor rises by `h * LIFT_RISE`), a beacon lamp on a post (grey / amber blinking / green),
  hazard-striped floor marking ~1.9 x 3.2. `platform` = Object3D at the car floor height. Gameplay moves the car
  itself (`car.group.position.y = h * LIFT_RISE`).
- `createCharacter(look) -> { group, carryAnchor, update(dt, speed01), setCarrying(bool), setWorking(bool),
  setSitting(bool), cheer() }`: blocky person ~1.5 tall (exists; keep its proportions). `setWorking(true)`: a wrench
  in the right hand and a repeated tightening / hammering arm motion, body leaning in. `cheer()`: one happy hop
  with both arms up. `carryAnchor` in front of the chest for the parts stack.
- Looks: `playerLook()` (lead mechanic: coral overalls, mustard cap; must stand out), `mechanicLook(index)` (navy
  or teal overalls, 3 variants), `valetLook()` (waistcoat + cap), `randomCustomerLook()`.
- `createCashStack()`, `createUnlockPad() -> { group, setProgress(0..1), update(dt) }` (1.6 x 1.6),
  `createUpgradePad() -> { group, update(dt) }` (1.4 x 1.4, teal, arrow-up icon), `createZoneRing(radius) -> Mesh`,
  `createFloorMat(w, d, { icon, tint, kind }) -> { group, set(state, ring, tick), glow(k), dispose() }` (a 4 cm
  rubber mat with a printed icon chip; state idle | want | on | empty; face drawn by `mat-face.js`).
- `createScrapBin()`, `createCoffeeCart()`, `createBillboard()` (roadside billboard on posts, canvas-texture face,
  ~3.2 wide x 3 tall), `createValetStand()` (podium with a key board), `createToolbox()` (rolling tool chest): Groups.
- `updateLeaks(dt)`: advances the shared oil drops / spots (3 instanced meshes for every car). Called once per
  frame by gameplay's car system (and by the preview loop); models never import the engine.
- fx: `poof(scene, pos, color)`, `sparks(scene, pos)` (fast small orange / yellow / white bits, welding feel),
  `confetti(scene, pos)` (multi-colour burst, bigger and floatier). Pooled, self-updating.
- `buildEnvironment(scene) -> { update(dt, t) }` (environment agent): everything static, from `LAYOUT`.
  Hall floor with bay markings for all 4 lift positions and a painted parts-wall strip; back + side walls (front
  fully open: nothing taller than 0.3 between x = -9 and 9 at the hall front except the two corner pillars) with
  a big "WRENCH BAY" sign and wall decor (pegboards, posters, clock, windows, hanging lamps, shelves, tire
  stacks, oil drums in corners); forecourt paving with the drop-off lane (4 painted slots, arrows), the exit lane
  arrows, the lounge patio (deck, benches behind the 8 standing spots, parasol, planters), street with lane
  markings, sidewalk, lamp posts, trees / shrubs, harbor water + pier + a boat at one side. Must NOT block: hall
  interior, drop-off lane, exit lane, `carEntry` / `carExit` paths, lounge spots, owner walking line, pad
  positions in `UNLOCKS`, `upgradePad`, `scrapBin`, `mechanicIdle`, `coffeeCart`, `valetStand`, `billboard`
  (those props are spawned by gameplay). Called once from `main.js`.

## 5. UI API: `src/ui/index.js` (UI agent)
`initUI()` builds everything inside `#ui` (over the canvas, `pointer-events: none` except interactive elements,
which carry `data-ui`). Exports `ui`:
- `ui.label({ text, kind, worldPos, icon? }) -> { setText(str), setPos(vec3), setVisible(bool), setProgress(0..1), remove() }`
  World-anchored, pooled HTML label repositioned every frame. Kinds:
  - `'price'`: pay-pad price pill with cash icon + fill bar (`setProgress`).
  - `'job'`: bubble over a car listing its problems. Extra methods: `setJobs([{ type, state }])` with state
    `'need' | 'ready' | 'done'` (one part tile per job: need = cream slot, ready = "part delivered" mustard ring,
    done = green tile + check), `setProgress(0..1)` = work progress of the current job: the first `ready` tile
    fills up green from the bottom (green ring, icon wiggles), `setPatience(0..1)` = the owner's mood row: a face
    (happy / meh / sad / angry) + bar, green -> amber -> coral, grey and empty at 0; the bubble shakes when low,
    `setVip(bool)` (gold bubble + star). Must stay readable at ~10 on screen; compact.
  - `'station'`: small pill over a part station: part icon (`icon: 'tire'` etc.) + count text ("3", "FULL": coral when full).
  - `'max'`: "MAX" over the player when the carry stack is full.
  - `'info'`: small plain text ("No free lift!").
  - `'emote'`: little round bubble over a character; `text` is one of `'happy' | 'angry' | 'wait' | 'star'`.
- `ui.seeThrough(object3d | null)`: the player's character (player.js sets it, clears it on dispose). While a
  `job`, `stars`, `call`, `emote`, `station` or `timer` label covers that object's screen box it fades to see-through
  (`.wl.see`), so a bubble never hides the player. Off while the object is hidden (driving). The player's own tags
  (`max`, `info`) and the pad / till labels the player stands on never fade.
- `ui.toast(text)`, `ui.floatText(worldPos, text, kind)` (`kind`: `'cash' | 'gem' | 'neg' | 'good'`; 'good' is for
  "Speedy!", "Fixed!"), `ui.fmt(n)` (950, 1.2K, 3.4M).
- `ui.sfx(name)`: WebAudio-synthesised, no files, mute toggle respected: `pickup`, `drop`, `cash`, `coin`,
  `unlock`, `pay`, `click`, `upgrade`, `error` (existing) plus `engine` (short car start / rev), `honk` (cute
  double beep, a car arrived), `lift` (hydraulic whirr ~0.5 s), `wrench` (one ratchet click; called ~6x per second
  while working), `fix` (bright ding: one job done), `done` (little success jingle: car finished), `vip`
  (sparkle), `trash` (parts dumped).
- Upgrade board sheet (`ui/board.js`): opens on `board:open`, closes on `board:close`; tabs Build (the plan + a card
  per unlock for sale) and Boosts (one row per key of `UPGRADES`). Keys are held to buy (0.65 s).
  `ui.closeUpgrades()` closes it; `ui.openUpgrades()` does nothing (the board opens itself on its pad).
- `ui.showShopComplete(onNext)`: celebration modal; its button calls `onNext` and emits `ui:nextShop`.
- HUD: pause + cash pill, gems pill, top card with garage name + unlock progress bar, **streak chip** (flame +
  "x1.25", hidden at streak 0, bumps on `streak:changed`, breaks visibly when it resets), boost buttons ("2x
  Income", "Speed"), Missions + Shop buttons, a **driving hint** pill ("Drive to a free lift!") between
  `drive:start` and `drive:end`.
- Panels: daily missions (repair 15 cars, earn $500 x shopMult, unlock 2 things, serve 2 VIPs or reach a streak
  of 5 -> gems), gem shop (cash packs scaled by `shopMult()`, instant boosts), pause (resume, mute, reset save),
  garage complete, and a **welcome back** modal when `pendingOffline()` is non-null at boot ("Your crew earned
  $X while you were away", Collect -> `claimOffline()`, optional "Double for N gems" -> `claimOffline(2)`).
- Title screen: "WRENCH BAY" logo (CSS / inline SVG, a wrench or car motif), PLAY emits `ui:play`, tagline, a
  one-line how-to. Style `.joy-base` / `.joy-knob`. `?uitest` (see `devtest.js`) spawns samples of every label
  kind, toast, float text and sfx for visual checking: keep it working (use it with `?nogame&uitest`).

## 6. Gameplay: `src/game/*` (gameplay agent)
`initGame()` in `src/game/index.js` (the environment is already built by `main.js`; do not build it again):
create the rebuildable world (`createWorld`, disposed + rebuilt on `shop:changed`), register systems via
`onUpdate`. Cars only start arriving after `ui:play` (or immediately if `state.tutorialDone` / `?autoplay`).
Expose `window.__game` debug helpers: `state`, `world`, `player`, `cars`, `lifts`, `stations`, `staff`,
`teleport(x,z)`, `giveCash(n)`, `spawnCar(opts?)`, `unlockAll()`, `start()`.
One system per file, wired in `world.js`: `player.js` (walk + carry + drive), `stations.js`, `cars.js`
(entity, spawner, lane queue, exit), `lifts.js` (capture, deliver, work, payout), `owners.js` (customers on
foot), `staff.js` (mechanics, valet), `cash.js`, `pads.js`, `guide.js` (tutorial arrow: car -> lift -> station
-> work zone -> cash -> pad, hidden after a few unlocks), plus the generic `tween.js`, `walker.js`,
`collision.js`, `util.js`, `stack.js`. Section 1 is the behaviour spec; `config.js` holds every number.
Obstacles (circle vs AABB push-out): stations, lift posts, cars waiting in the lane, cars on lifts, scrap bin,
coffee cart, valet stand, the hall side walls (bounds are a simple rectangle, so add boxes for anything inside
it). The player must never get stuck: a car that parks or spawns on top of the player pushes them out.
