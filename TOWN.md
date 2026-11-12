# Wrench Bay: Harbor Town expansion (mid + late game) — design and module contracts

This extends `CONTRACTS.md` (read that first: it is the base game, the art direction and the conventions).
Numbers and positions of everything below live in `src/config.town.js` (re-exported by `src/config.js`); this file
says what they mean. When this file and the config disagree on a number, the config wins.

## 0. Rules for every agent working on this
- Several agents edit this folder at the same time (one shared working tree, one dev server). Edit only the files
  your brief gives you. Need a change elsewhere? Describe it in your final report; do not make it.
- Do not commit, stash, reset or switch branches. Do not run `npm install`. The lead keeps `npm run dev` running at
  http://localhost:5190; if it is down, check `lsof -iTCP:5190 -sTCP:LISTEN` and only then start it.
- Other areas change under you and may be broken for a minute while their owner is mid-edit. Reload and carry on.
  If someone else's module breaks the page for long, work around it (`?nogame`, your own preview page) and say so.
- Test in the browser, in a portrait viewport (about 420 x 860), from the real game camera. A model that looks good
  in a close-up but reads as a blob from the game camera is not done.
- **Real-world logic.** The owner of this game rejects visuals that could not happen in real life, however readable
  (a puddle that rides along under a moving car was a bug to them). Stylised is fine, illogical is not. Before you
  add an effect, a pose or an object, ask "would it look / behave like that in real life in this state?". A car
  wash wets a car before it dries it. A tow truck backs into its shed. A building that is being built shows a
  building site first. Every object must read as the real thing, not as a coloured box.
- Everything is original: no real brands, logos, car designs or assets from other games.
- New art joins the existing family (`CONTRACTS.md` "Art direction", `PALETTE`): chunky low-poly blocks,
  flat-shaded vertex colours, merged geometry via `models/voxel.js` `Builder`, shared `litMat` / `glowMat`. It must
  be NEW geometry: do not dress up an existing model with another colour and call it a new asset.
- Final report (your last message): what you built, files touched, how you verified it (what you looked at, what
  you measured), what is not done or not verified, and requests for other owners.

## 1. What this expansion is
Today the game ends when the 13 garage unlocks are bought: the same lot is rebuilt at 3x. The expansion replaces
that wall with a town. The moment your crew can hold the shop without you (valet + one mechanic), the lot's
barriers lift and you can walk out onto Harbor Street. Along it and on Main Street behind your block are plots
with for-sale signs: buildings that enlarge your shop (car wash, an indoor waiting lounge, a paint shop, a VIP
club), a tow truck that sends you across town on rescue calls, a salvage yard where you buy wrecks to restore
and a showroom to sell them, side businesses that earn by themselves, and at the very end a ferry to the next
town (the old 3x reset, now earned).

### Pillars
1. **The garage stays home.** It keeps running live while you are away; cash piles up at the lifts and coming
   home to collect it should feel great. Nothing in town may make the base loop worse.
2. **Every new place adds a verb, not a menu.** Same one-thumb grammar (walk, stand in a ring, stand on a pad,
   drive with the joystick), but each place twists it:
   - tow truck: drive across town, find the car, tow it home (navigation, a trailer behind you);
   - paint shop: match the colour the customer wants, spray, and juggle cars while paint cures;
   - VIP club: drive a customer's supercar without a scratch, then walk a lap around it to polish it;
   - project cars: no timer at all, one car you take through every facility you own and then sell.
3. **Something to walk towards, always.** At any time at least one affordable or nearly affordable goal is
   visible, plus an edge-of-screen pointer to it. Money is never the only gate for long: fame gates the big
   things, so playing well (speedy repairs, rescues, perfect VIP service) matters as much as waiting.
4. **The town is alive.** Traffic on a ring road, people on the sidewalks, gulls on the quay, customers visibly
   using what you built. No dead screens.
5. **Automation is the reward, then the next place is the challenge.** Each facility starts hands-on and ends
   staffed; by then the next one is open.

### What would make it boring, and the rule against it
| Risk | Rule |
|---|---|
| Long empty walks | Home block is ~90 units wide; nothing you need often is more than ~8 s from the garage on foot. Vehicles for the far corners. Wrenches, tips and tills to grab on the way. |
| "Wait for money" stretches | Target: a new purchase every 2-5 min in the mid game, 5-10 min late. Rescue calls and VIPs are bursts of extra income you earn by playing. |
| New places that play the same | Each facility has its own twist (see pillar 2) and its own short unlock chain. |
| Leaving home feels like losing money | Shop runs live; a pointer shows when a customer at home is about to lose patience; no hard fail anywhere (late = less money, never a loss). |
| Late game fully automated, nothing to do | Project cars (hands-on by design), town events, the collection, the ferry goal. |
| Not knowing what a building does before paying | Every building pad shows its icon and price on the pad (its name and level when you walk up); standing on it opens the pay dock with what you get, the price and the fame needed. |

## 2. Progression
Fame levels (section 4.2) and cash gate things together. Prices are base prices (x `shopMult()` like the rest).

| When | New goal | What changes for the player |
|---|---|---|
| Garage unlock 7 (valet) + a mechanic | **Town opens** (free) | Barriers lift, camera follows you out, map button, fame badge. Arrow points at the tow shed. |
| $1.5K | Tow truck | First rescue call 5 s later, close to home. New income burst every ~70 s. |
| $3.5K | Car wash | Every leaving car pays a wash fee. Dirty cars leave clean. |
| $6K, fame 2 | Harbor Lounge | Customers sit indoors, wait longer, tip. A reason to walk through it. |
| garage unlocks 8-13 run in parallel ($1.2K .. $5.5K) | | "Garage complete" is now a celebration, not a reset. |
| $12K, fame 3 | Spray Bay paint shop | Second customer stream, colour matching, 11-step unlock chain ($1.5K .. $65K). |
| $20K, fame 5 | Main Street gate | Ring traffic, depot (Pro Gear), academy (managers), diner, salvage yard. |
| $18K, fame 6 | Salvage yard | Project cars: buy a wreck, restore it across your facilities, sell it. |
| $25K, fame 7 | Grand Lounge | Espresso bar, aquarium, bigger tips. |
| $30K, fame 7 | The Greasy Spoon | First side business; lunch run for a crew buff. |
| $60K, fame 8 | Platinum Club | VIPs get their own entrance; careful driving + polish lap; 6-step chain ($20K .. $120K). |
| $80K, fame 10 | Bay Classics showroom | Restored cars sell for 1.6x; collection wall. |
| $150K, fame 12 / $400K, fame 15 | Pump & Go / Quick-Fit Express | Side businesses with 5 levels each. |
| $2M, fame 20, everything owned | Ferry | Next town: `nextShop()` (3x), town resets, collection and gems stay. |

Balance targets (the balance pass verifies and tunes the config): town opens ~15-20 min into a new save; paint
shop ~25-35 min after that; Platinum Club at ~1.5-2 h; ferry at ~5-6 h of play. Income by source late game should
be roughly: garage 25%, paint 20%, VIP 20%, side businesses 20%, wash/tips/rescues/projects 15%.

## 3. The map
See the ASCII map at the top of `src/config.town.js`. Facts every area must respect:
- The portrait camera looks north from high up (offset 0, 29, 17.3) and shows only ~17 x 27 units. Tall things
  hide ~0.6 x their height of ground behind (north of) them. Therefore: **buildings stand on the north side of a
  street and face south**; anything on the south side of a walkable area is low (< 1 m) or see-through.
- Places you go inside (paint hall, lounge annex, VIP hall, showroom) are built like the garage: walls 2.6 high,
  **no roof**, open front on the south side, so the camera sees the floor. Places you only visit at the front
  (diner, depot, academy, gas kiosk, Quick-Fit, filler houses) are closed buildings with roofs, 3-7 m tall.
- Roads are one-way: Harbor St east, East Ave north, Main St west, West Ave south (a ring), and both streets also
  run through from tunnel to tunnel (`TOWN.edge`): AI cars appear from / vanish into tunnel mouths, never pop.
- Kept clear by everyone: roads, sidewalks, alleys, `TOWN.towApron`, every `plot`, every pad, every parking bay
  (`TOWN.parking`, 3.6 x 2.0), every rescue spot, facility lanes / paths in `PAINT`, `VIP`, `LOUNGE`, `WASH`.
- The legacy lot (`LAYOUT`) does not move. The garage's customers now arrive from the west tunnel and leave
  through the east one once the town is open.

## 4. Systems

### 4.1 Opening the town, camera, boundaries
- `harbor` opens when `valet` and `mechanic0` are unlocked (checked on unlock and on load). One-time moment:
  chain barriers at the lot edges drop, `gate` sfx, toast "The town is open!", fame badge + map button appear,
  the guide arrow points to the tow shed pad.
- Until then nothing changes: legacy bounds, legacy camera clamp, legacy spawn points.
- After: the player is clamped to `TOWN.bounds`; static obstacles are the hall walls and pillars (they used to be
  the bounds), every built building's walls, `TOWN.fillers`, `TOWN.water`, locked district `noGo` boxes, plus
  whatever the environment reports as solid (`townSolids()`).
- Camera: follows the player 1:1 inside `TOWN.camClamp`. In a player vehicle it leads ~4 units ahead of the
  velocity and pulls back ~15% so you can see where you are driving (east-west driving on a portrait screen needs
  this). Smooth, never snaps.
- A customer's car driven by the player stays inside its facility's `driveArea` (garage: the lot). Touching the
  edge shows the info label "Customer cars stay on the lot".

### 4.2 Fame
A town-wide level shown as a star badge in the HUD. XP comes from playing well (`FAME.xp`): every repair, more
for speedy ones, rescues, resprays, VIPs (more when perfect), restored classics, golden wrenches. Each level:
+3% on every payout, +2 gems, a level-up moment (fanfare, confetti on the player, toast). Specific levels add
new customer car classes to the normal arrivals (`TOWN_CAR_TYPES`, toast "New in town: Muscle cars!" and the next
arrival is one) and open for-sale plots. Fame counts from the first repair of a save, also before the town opens.

### 4.3 Properties: for sale -> building site -> built -> upgrades
- Every `PROPERTIES` entry whose district is open shows its plot. Not owned: an empty lot (environment) with a
  **for-sale sign** and a pay pad at `pad`; a `tag` label lying on the pad (icon + price; within 3.5 m also name +
  level) and, while the player stands on it, the pay dock at the bottom of the screen (name, level dots, what you
  get, price bar, fame). Nothing is drawn above the pad: on screen that is the building. Fame too low: the sign
  shows a padlock + star level, the tag and dock turn grey with the fame needed, the pad does not take money.
- Paying works exactly like garage pads (stand on it, cash drains, partial payments kept for the session).
- Paid: a **building site** appears on the plot for `BUILD_TIME` (scaffold, tarps, dust, hammering sfx), then the
  building pops in with poof + confetti, `unlock` sfx, toast (`levels[i].label`). Loading a save shows the
  finished building immediately.
- More levels: the pad returns as an upgrade pad (same grammar) at `upgradePad ?? pad`.
- Facilities (`paint`, `vip`) then run their own unlock chains (`PAINT_UNLOCKS`, `VIP_UNLOCKS`) with their own
  pads, next `VISIBLE_PADS` shown, exactly like the garage.
- The HUD top card: garage progress until 13/13, then town progress (`townProgress()`: owned levels / all levels,
  plus the cheapest next goal).

### 4.4 Player vehicles and parking
- A vehicle the player owns (tow truck; later a project car that runs) has an enter ring at its door when parked.
  Standing in it `PLAYER.enterCarDelay` s hops the player in (same hop as customer cars).
- Driving: same joystick handling as customer cars, own top speed / radius. Collides with buildings, cars, the
  bounds. AI traffic brakes for it and honks; pedestrians step aside (nobody is ever run over).
- Getting out: only in a parking bay (`TOWN.parking`, blue "P"). Stop inside one for 0.6 s: the vehicle straightens
  into the bay, the player hops out. At `home` the tow truck then **reverses into its shed by itself**.
- While driving the HUD shows a hint pill ("Park in a P bay to get out") and a pointer to the nearest bay when
  none is on screen. A vehicle left in town stays there; a pointer leads back to it when it is needed.

### 4.5 Tow truck and rescue calls
1. Calls: with the truck owned, a stranded car appears at a free `RESCUE.spots` entry of an open district every
   `interval` s after the last one was delivered (first call: spot `h3`, `firstDelay` s after buying). Hazard
   lights blink, hood up with smoke, owner beside it waving. HUD: radio chirp, a "Rescue call" chip with a
   countdown bar (`callTime`), an edge pointer to the car. One call at a time (storm event: up to 3).
2. Drive there. Stop (speed < `hookMaxSpeed`) with the truck within `hookRadius` of the car's nose: the boom
   lowers, winch sfx, the car's front lifts onto the hook, the owner hops into the cab. Hooked inside `callTime`:
   "Fast rescue!" (tip + gem at payout).
3. Tow it home. The car follows on its rear wheels with trailer kinematics (it swings behind the truck in turns,
   never jack-knifes through it). A lane slot of the garage is reserved from the moment of the hook.
4. Stop in the drop ring (`RESCUE.drop`, the garage's entry driveway): the boom lowers the car, it rolls to its
   lane slot like any arriving car, its owner hops out of the cab and walks to the lounge. From here it is a
   normal garage job with `jobs` problems, full patience, and its payout x `payMult` (label "Rescue x2.5" in the
   float text). Fame on delivery.
5. Park the truck (4.4). Nothing fails: an unanswered call just waits (and loses its fast bonus).
- Level 2: faster truck, shorter interval, better pay. Level 3 (dispatcher): when you are not in the truck, a
  hired driver takes it out on calls along the road network and brings the car in; you can still take the truck
  yourself when it is parked.

### 4.6 Car wash "Suds & Shine" (drive-through on the garden block)
- Its own building on the north part of the garden block (`PROPERTIES.wash.plot`, x 15.0..23.6, z 1.8..5.6), east of
  the garage exit driveway. Open steel gantry with a see-through polycarbonate roof and an open south side, so the
  camera sees the whole wash side-on, left to right. The south part of the garden stays a small park (fountain,
  benches, the `garden` parking bay, two coin-op vacuum pillars `WASH.vacuums`). The exit driveway is a plain driveway.
- ~60% of the garage's arriving cars are dirty (`WASH.dirtyChance`, `setDirt`), rolled only while the wash exists.
- Who washes (`WASH.cleanCarsFromLevel`): level 1 only dirty cars, from level 2 every leaving garage car.
- Route (`src/game/wash.js`, through the facility hook `fac.hooks.leave`): lift -> exit lane -> pickupStop (owner
  gets in, as before) -> on east past the exit driveway along `WASH.approach` -> stop at the pay kiosk on the
  driver's side (`WASH.kioskStop`, `payTime`) -> through the tunnel at `slowSpeed`: soap (foam builds up from here),
  brushes (spin and lean in only at a car, mud comes off), rinse (foam and dust gone, car wet), blower (dry), then a
  clean shine -> out at the east end into the east alley -> south to Harbor St (`WASH.exit`) -> east like every car.
  Cars that do not wash leave down the exit driveway exactly as before.
- Queue: one car approaches / pays at a time; a paid car enters only when the one ahead is `WASH.gap` on (entry light
  red while held). A car that wants a wash while the kiosk is taken waits at the pickup stop with its owner aboard;
  cars behind it wait too (`car.holding`: nobody ghosts through a held car).
- Money: the fee (`washFee(tier)`) lands as coins on `WASH.pile` at the exit (float text "+$18 Wash"), collected by
  walking past; `state.town.stats.washes++`, event `wash:done { total }`; offline income counts washes.
- Tier 2: wax (fee x2.2, tri-colour foam, cars leave with a wax gloss). Tier 3: turbo dry (fee x4.4 total, +1 fame
  per car, big roof blowers, neon "TURBO DRY" sign).
- Debug: `__game.wash.state()`, `__game.wash.send({ dirty, x })` (a finished car appears on the exit lane at x).

### 4.7 Waiting lounge
- Tier 0 is the patio. Tier 1 "Harbor Lounge": a glass-fronted room east of the hall (`LOUNGE.walls`) with two
  rows of sofas, TV, reception desk, vending machine, plants. Owners now walk from their car along the walkway,
  over the **zebra crossing** on the exit lane (cars stop for them), in through the open front, and **sit**.
  When their car is done they walk back over the crossing to the legacy curb and get picked up as before.
- Effects (`LOUNGE.tiers`): patience multiplier (stacks with the coffee cart), a **tip** (share of the bill) that
  lands on the tip tray at reception when the customer leaves happy, and vending coins after `vendingAfter` s of
  sitting. Both are piles the player collects by walking past.
- Tier 2 "Grand Lounge": espresso bar with a barista, aquarium, arcade cabinet (a waiting owner sometimes plays),
  rug, bigger TV. Higher patience, tips, vending, +1 fame per happy customer.

### 4.8 Paint shop "Spray Bay"
Floor plan mirrors the garage (`PAINT`): paint tanks on the back wall, two glass spray booths in the middle, a
drop-off lane on its own forecourt, its own customers, waiting awning, exit.
1. A paint customer arrives (own spawner; any unlocked car class) and waits like a garage customer. The job
   bubble shows canister tiles in the colour they want (never the car's current colour); count from `PAINT.cans`.
2. Drive the car into a free booth (capture box, like a lift). It is **masked** automatically: paper and tape
   over glass, lights and wheels (`setMasked`), booth lamps on.
3. Fetch canisters of the right colour from the tanks (carry stack, capacity upgrade applies; a wrong colour is
   useless: scrap bin by the wall). Deliver them in the work zone in front of the nose.
4. Spray: stand in the work zone; each delivered canister is `work` seconds; the player holds a spray gun, a
   mist in that colour, and the new colour **sweeps over the body from nose to tail** as progress rises
   (`setColor(hex, k)`), one section per canister.
5. Cure: all canisters sprayed -> heat lamps glow, a timer ring counts `cure` s. You are free to leave; this is
   the juggling moment (start the next car, fetch paint).
6. Done: masking off, gloss, confetti, payout pile beside the booth (`resprayPayout`), the car backs out, picks
   up its owner at `PAINT.pickupStop` and leaves in its new colour.
- Speedy / streak rules as in the garage (one shared streak). Repair-speed, capacity, supply and price upgrades
  apply here too.
- Chain (`PAINT_UNLOCKS`): more colours (customers only ask for colours you stock; more colours = more
  customers and, with premium colours, x`premiumMult`), second booth, **painter** staff (mechanic logic: reads
  the car, fetches the right canisters, sprays), **prep tech** (valet logic: drives waiting cars into free
  booths), infra-red lamps (cure time halves), stripe kit (some customers want a second colour as racing
  stripes: one extra canister, `setStripe`, x`stripeMult`).

### 4.9 VIP area "Platinum Club"
Once built, gold VIPs stop coming to the normal lane; the club gets its own arrivals (`VIP_CAR_TYPES`, own
spawner) at a red-carpet drop-off. A VIP job is judged with **three stars**, shown over the car:
1. **Careful.** Hop in and drive the car onto a gold lift. Any impact faster than `bumpSpeed` (walls, posts,
   other cars) while you drive it loses the star (thud sfx, the owner winces).
2. **Fast.** Repair it: `jobs` problems, all served from the premium cabinet (one gold "premium kit" fits any
   VIP job; restocks like a station). Star kept if patience is left when the repair ends.
3. **Spotless.** The car backs out onto the **turntable** by itself. Walk a full lap around it inside
   `polishRing`: each of the 4 sides goes from dull to mirror gloss after `polishTime` s near it (cloth in hand,
   squeak sfx, sparkles). All four sides = star.
Then the owner walks the red carpet from the VIP lounge to the car, the turntable turns it to face the exit, it
leaves. Payout `vipPayout` (x`mult`, +`starBonus` per star), gems, fame; three stars = "Perfect!" moment.
No fail: a slow or scratched job simply pays less.
- VIP owners wait seated in the lounge corner inside the club (velvet rope, sofas).
- Chain (`VIP_UNLOCKS`): sparkling bar (patience), master tech (repairs), host (drives cars to the lift, always
  careful), second gold lift, detailer (walks the polish lap), paparazzi wall (more VIPs).

### 4.10 Town life
- **Traffic**: `TRAFFIC_TYPES` on the roads, at most `TRAFFIC.max` near the player (`maxBeforeMain` while Main
  Street is closed: through traffic on Harbor St only). They keep distance, brake for the player, for towed cars,
  for people on crossings, and for customer cars turning into driveways. The bus stops at bus stops.
- **Pedestrians**: stroll the sidewalks between doors, sit on benches, look at shop windows; step aside for
  vehicles. Some of them are the visible customers of your side businesses.
- **Gulls** on the quay rail and roofs; they take off when you come close and land again later.
- **Golden wrenches** (`TOWN.wrenches`): a slowly turning golden wrench in a hidden corner. Walk into it:
  gems + fame, counter toast "Golden wrench 3/16". All 16: bonus gems and the player wears a golden cap.

### 4.11 Main Street, salvage yard, project cars, showroom
- Gate: hoarding fence along the back lane and boom gates on both avenues. Pay pad in the west alley. Bought:
  panels fall away one after another, booms lift, ring traffic starts.
- **Salvage yard**: three stands, each with a wreck (`CLASSICS`, price tag, pay pad). Buying one makes it yours.
- **Project car** (one at a time, no timers, saved in the state):
  0. Wreck at the yard. Hook it with the tow truck, tow it home, drop it in the drop ring: instead of joining
     the customer lane it takes the first free garage lift (or waits on the apron for one).
  1. Mechanical: `PROJECT.mechJobs` on a garage lift, like a customer car but without patience. Mechanics help.
     Done: it runs. From now on it is a **player vehicle** (4.4).
  2. Paint (if Spray Bay is owned): drive it into a free booth. The first colour you deliver decides its
     colour; needs `paintCans` canisters of that colour. Cure, done.
  3. Polish (if Platinum Club is owned): park it on the free turntable, walk the lap.
  4. Sell: drive it to the yard office (base value), or onto a free showroom turntable (x`showroomMult`,
     a buyer NPC walks in after `sellTime` and drives it away; cash on the showroom desk).
  Each stage visibly changes the car (`setRestore`): rust and missing trim -> sound but dull -> painted ->
  gleaming. Stages for facilities you do not own are skipped.
- **Collection**: the first time each classic is restored it goes on the collection wall (showroom, and the
  Fame panel): +`collectionBonus` on every payout forever, also after the ferry.

### 4.12 Side businesses and the lunch run
- Diner, gas station, Quick-Fit (`BUSINESS`): once bought they earn `income` per minute into a till (a growing
  cash pile at `till`, label with amount and a bar towards the cap). Walk past to collect. Five levels each,
  every level visibly changes the building (bigger sign, terrace, more pumps, second bay).
- They must look busy: pedestrians eat at the diner, traffic cars pull in at the pumps and at Quick-Fit
  (`VISITS`), where a lift goes up and sparks fly.
- Gas station also raises the garage's customer rate (`spawnBonusPerLevel`).
- **Lunch run** (diner): lunch boxes restock at the diner window (`LUNCH`). Carry them to the crew table in the
  garage: the crew eats (sitting, short animation) and works x`buff` for `duration` s. HUD buff chip.

### 4.13 Depot and academy
- **Harbor Parts Co.**: teal pad in front opens the **Pro Gear** sheet (`PRO_UPGRADES`), same sheet UI as the
  garage upgrades.
- **Wrench Academy**: pads hire **floor managers** (`MANAGERS`): a manager walks their facility, carries every
  cash pile to one safe (one collection point for the player) and makes that facility count for offline income.

### 4.14 Town events
Once Main Street is open, every `TOWN_EVENTS.every` s one event the player qualifies for starts: banner, sfx,
timer chip. Rush hour (garage arrivals x2), VIP convoy, storm (three rescue calls in a row, rain), depot sale.

### 4.15 Ferry
Terminal on the east quay with a docked ferry. Needs every property owned, the garage complete, fame 20 and the
price. Paying: confirm modal (what you keep: gems, collection bonus; what resets), then the player drives or
walks aboard, the ferry sails, fade, `nextShop()`: new town name, everything x3, town state reset.

### 4.16 Guidance
- **Pointers** at the screen edge for off-screen targets: active rescue, your parked vehicle when a call waits,
  an affordable for-sale / upgrade pad (one, the cheapest), a full till, a customer at home under 25% patience
  (red, "Garage!"), the current guide target. At most 3 at once, priority in that order.
- **Town map** (HUD button): districts, roads, properties (owned / for sale with price / locked with fame),
  tills, the player, the truck, the active call. Tapping a place sets the guide target there.
- **Guide arrow** after the town opens: tow shed -> truck -> first call -> drop ring -> "explore" (then only
  when the player sets a map target).
- First-time hint toasts per system (saved in `state.town.hints`).
- Daily missions get a town pool once the town is open (3 rescues, 5 resprays, 2 perfect VIPs, collect $X from
  tills, sell a classic).

### 4.17 Offline income
`offlineRate()` adds: wash fee per garage car; paint shop if a painter and the prep tech are hired; VIP club if
tech, host and detailer are hired; a facility only counts in full with its manager, otherwise at 50%. Side
business tills fill up to their cap. Capped as before.

## 5. Core contract (state, events) — owner: `core` agent
`state.town = { open, districts[], props{id: level}, unlocked[], fameXp, wrenches[], classics[], tills{id: $},
pro{key: level}, managers[], project: null | { id, stage, color, at }, stats{ rescues, resprays, vipServed,
vipPerfect, washes, restored, tips }, hints{} }`. Old saves load with defaults. `state.unlocked` stays
garage-only.

`core/state.js` additions (names are the contract; signatures may gain optional params):
`townOpen()`, `openTown()`, `districtOpen(id)`, `openDistrict(id)`, `propLevel(id)`, `owns(id)`,
`nextPropLevel(id) -> { price, fame, label } | null`, `buyPropLevel(id)`, `townUnlocked(id)`,
`markTownUnlocked(id)`, `fameLevel()`, `fameProgress() -> { level, xp, need, frac }`, `addFame(kindOrAmount,
worldPos?)`, `fameMult()`, `collectionMult()`, `payoutMult()` (price upgrade x shopMult x fame x collection x
income boost), `resprayPayout(cans, { tier, premium, stripe, speedy })`, `vipPayout(types, { tier, stars })`,
`washFee(carTier)`, `proValue(key)`, `proCost(key)`, `buyPro(key)`, `addTill(id, amount)`, `takeTill(id)`,
`townProgress() -> { done, total, next }`, `carTypesAvailable()`. `repairPayout` gains `{ mult }` (rescue) and
uses fame + collection. `nextShop()` also resets the town (keeps gems, classics).

Events: `town:opened`, `district:opened { id }`, `property:changed { id, level }`, `townunlock { id, label }`,
`fame:changed { xp, level, frac, delta }`, `fame:levelup { level, unlocks[] }`, `vehicle:enter { id }`,
`vehicle:exit { id }`, `rescue:call { spot, until }`, `rescue:hooked { fast }`, `rescue:delivered`,
`respray:done { total, speedy }`, `vip:done { stars, total }`, `wash:done { total }`, `till:changed { id, amount,
cap }`, `wrench:found { count, total }`, `project:changed { id, stage }`, `townevent:start { id, until }`,
`townevent:end { id }`, `townpad:enter { kind }` / `townpad:exit { kind }` (`kind`: `'pro' | 'academy'`),
`garage:complete`.

`core/engine.js`: camera bounds / lead / zoom control as needed by 4.1 (`setCameraBounds`, `setCameraLead`).

## 6. Gameplay architecture — owner: `core` agent, then feature agents
The paint shop and the VIP club are structurally the garage again (lane, bays, stations, owners, staff, exit).
The garage systems must therefore be **parameterised by a facility layout** instead of reading `LAYOUT`
directly, so a facility is a layout + a few behaviour hooks, not a copy of five files:
- `LAYOUT` is the garage's layout; `PAINT` and `VIP` use the same key names where the meaning is the same.
- Hooks a facility supplies: how its customers and jobs are rolled, what a bay does between "captured" and
  "ready to leave" (garage: raise / work / lower; paint: mask / spray / cure; VIP: repair, then turntable),
  payout function, staff looks, where finished cars go.
- One global car list for collision, blockers and capsules; one player; one cash system; one streak.
- The garage must play exactly as before when no town feature is owned (regression check: fresh save, `?autoplay`).
`ctx` additions every feature may rely on: `ctx.facilities.{garage,paint,vip}`, `ctx.town` (districts, plots,
buildings: `ctx.town.building(id)`), `ctx.vehicles`, `ctx.solids` add / remove, `ctx.near(pos, radius)` (is this
close enough to the camera to animate / label), `ctx.pointers`.
**The `core` agent documents the real API in a new section "6a. Gameplay API (as built)" at the end of this file
when it is done; feature agents read that first.**

Until a model factory exists, gameplay reaches new factories through `import * as M from '../models/index.js'`
and `M.createX ?? fallback` (a named import of a missing export breaks the whole page).

Debug helpers on `window.__game` (extend the existing ones): `openTown()`, `giveFame(n)`, `buy(id)` (next level of
a property, no cost), `openDistrict(id)`, `unlockTown(id | n)`, `rescue(spotId?)`, `spawnPaintCar(opts?)`,
`spawnVip(opts?)`, `tp(placeId)` (teleport next to a property), `event(id)`.

## 7. Models API additions (`src/models/index.js`; implementation split across new files)
Unless noted: fresh object per call, origin at floor level, front faces +z, shadows on, geometry cached.
Buildings that have fixed interior positions in the config are built in **world coordinates** (they read the
config; gameplay adds them to the scene at 0,0,0); everything else is built at the origin and placed by gameplay.

**Cars (`cars.js`)** — `createCar(look)` also accepts the types in `TOWN_CAR_TYPES`, `VIP_CAR_TYPES` and
`CLASSICS` ids (`look.type = 'bubble'` ...), each a distinct silhouette inside the `CAR` box. New methods on
every car (all idempotent, callable any time, physically sensible while driving):
`setColor(hex, k = 1)` (k = share of the body already in the new colour, sweeping nose -> tail; the old colour
remains behind the front), `setStripe(hex | null)`, `setMasked(bool)`, `setDirt(0..1)`, `setFoam(0..1)`,
`setWet(bool)` (water sheen + drips for a few seconds), `setGloss([front, right, back, left])` (0 dull .. 1
mirror, per side; default 0.5 neutral), `setHazard(bool)`, `setTowed(0..1)` (front axle lifted onto a hook, body
pitched, front wheels off the ground and not spinning), `setRestore(stage 0..3)` for classics (0 wreck: rust,
flat tyres, missing bumper / lamp, cracked glass; 1 runs, body still dull and patched; 2 painted; 3 show
condition). `randomCarLook` unchanged.
**Vehicles (`vehicles.js`)** — `createTowTruck(level) -> { group, hitch, setBoom(0..1), setBeacon(bool),
update(dt, speed) }` (footprint 1.7 x 3.6; `hitch` = Object3D at the hook; level 2 is visibly heavier);
`createTrafficVehicle(kind) -> { group, update(dt, speed), setDoors?(bool) }` for every `TRAFFIC_TYPES` key
(sizes from the config); `createFerry() -> { group, setRamp(0..1), update(dt, t) }`.
**Home-block buildings (`buildings-home.js`)** —
`createTowShed(level)`; `createWashArches(tier) -> { group, setRunning(bool), setCarZ(z | null), update(dt) }`
(brushes spin and lean towards a car, soap / rinse nozzles spray only while a car is under them) and
`createWashKiosk(tier)`;
`createLoungeAnnex(tier) -> { group, update(dt) }` (walls, glass front, floor, sofas at `LOUNGE.seats`, TV
flicker, reception, vending machine; tier 2 adds bar, aquarium with moving fish, arcade, rug);
`createPaintHall() -> { group, update(dt) }` (shell, floor, sign "SPRAY BAY", wall decor, compressor, awning +
bench at `PAINT.loungeSpots`); `createSprayBooth() -> { group, setLamp('idle' | 'spray' | 'cure' | 'done'),
setTimer(0..1), update(dt) }` (glass side walls, floor grate, overhead lamp frame that leaves the car visible);
`createPaintTank(colorId) -> station API` (`{ group, partAnchor, setProgress, update }`, footprint
`PAINT.stationSize`, colour unmistakable from the camera);
`createVipHall() -> { group, update(dt) }` (shell, marble / dark floor, gold trim, lounge corner with sofas at
`VIP.loungeSpots`, velvet ropes, sign), `createVipBar()`, `createGoldLift() -> lift API`,
`createPremiumCabinet() -> station API`, `createTurntable() -> { group, platform, setAngle(rad), setGlow(bool),
update(dt) }`, `createRedCarpet()`, `createPaparazziWall()`, `createHostStand()`.
**Town kit (`props-town.js`)** — `createForSaleSign() -> { group, setState('sale' | 'locked'), update(dt) }`,
`createConstructionSite(w, d) -> { group, setProgress(0..1), update(dt) }`, `createHoardingPanel()` (3 m),
`createBoomGate() -> { group, setOpen(0..1) }`, `createChainBarrier(len)`, `createParkingBay()` (blue painted
bay + P post), `createDropRing()` , `createGoldenWrench() -> { group, update(dt) }`, `createTipTray()`,
`createCoinStack()` (wash / vending coins), `createSafe()`, `createCrewTable()`, `createBusStop()`.
**Main Street + corners (`buildings-main.js`)** — `createJunkyard() -> { group, update }` (fence with gate at
`PROJECT.junkGate`, office shack, crane, scrap piles, three stands at `PROJECT.stands`), `createDepot()`,
`createDiner(level)`, `createAcademy()`, `createShowroom() -> { group, turntables[], update }`,
`createGasStation(level)`, `createQuickFit(level) -> { group, setBusy(bayIndex, bool), update }`,
`createFerryTerminal()`.
**Small props / parts (`props.js`)** — `createPart('spray:<colorId>')` (spray canister, cap and band in the
colour), `createPart('premium')` (gold service case), `createPart('lunch')` (lunch box); all fit the part box.
**Characters (`characters.js`)** — looks: `painterLook(i)` (white overalls, respirator), `prepTechLook()`,
`hostLook()`, `masterTechLook()`, `detailerLook()`, `vipCustomerLook()`, `pedestrianLook()` (wide variety),
`baristaLook()`, `managerLook(kind)`, `buyerLook()`, `towDriverLook()`; `playerLook({ goldCap })`. New methods on
every character: `setSpraying(bool)` (spray gun, sweeping arm), `setPolishing(bool)` (cloth, circular rubbing),
`setWaving(bool)`, `setEating(bool)`.
**Critters / fx** — `createSeagull() -> { group, update(dt), takeOff(), land(), flying }`;
`mist(scene, pos, hex)`, `foam(scene, pos)`, `sparkle(scene, pos)`, `dust(scene, pos)`, `splash(scene, pos)`,
`rain(on)` (storm event; cheap, camera-attached).

## 8. Environment contract — owner: `env` agent (`environment.js`, `env-*.js`)
- `buildEnvironment(scene)` builds the whole static town once: both streets, both avenues, sidewalks, kerbs,
  lane markings, zebra crossings (incl. the one at `LOUNGE.crossing`), tunnel mouths at `TOWN.edge.tunnelX`,
  alleys, back lane, tow apron, garden, quay along the whole of Harbor St, ferry plaza, more harbor (boats,
  buoys, a lighthouse or cranes in the distance), filler buildings on `TOWN.fillers` and beyond the bounds so no
  edge of the world is ever visible from inside `TOWN.camClamp`, street furniture, trees.
- Every `plot` gets a neutral **empty-lot** base (gravel / grass / old paving) that still looks right under the
  finished building: the dynamic building brings its own floor. The plots themselves stay empty.
- Painted parking bays at `TOWN.parking` and kerb-side bays at `RESCUE.spots` may be painted flat.
- Legacy scenery that now sits on a plot, the tow apron, an alley or a new path moves away (west forecourt
  hedge, cones, tire display, trees east and west of the hall, the planter and bin by the east pillar...).
- Split into per-area merged meshes (chunks of ~30 units) so the frustum culls what is off screen.
- `townSolids() -> [{ minX, maxX, minZ, maxZ }]`: boxes for solid scenery inside walkable areas (dumpsters,
  kiosks, big planters, fountain). Thin things (lamp posts, trees on sidewalks) are not solid.
- Before the town opens the player never sees past the lot, but the town is simply there.

## 9. UI contract — owner: `ui` agent (`src/ui/*`)
- Labels (`ui.label`): `'tag'` (building pad tag lying on the pad: `setInfo({ name, icon, price, fame, locked, level,
  reason })`, `setNear(bool)` adds the name + level, part payment via `setProgress`), `'till'` (cash icon, amount text, bar towards the cap), `'timer'` (ring that empties,
  `setProgress`), `'stars'` (`setStars([careful, fast, spotless])`, each `true | false | null` = pending),
  `'call'` (phone icon + countdown bar). `'job'` gains: entries `{ type: 'spray', color: '#rrggbb', state }`
  (canister tile in that colour), `{ gold: true }` (gold tile), `setBonus(text | null)` (small ribbon: "Rescue
  x2.5").
- `ui.pointer({ kind, icon?, text?, worldPos }) -> { setPos, setText, setVisible, remove }`: arrow + chip at the
  screen edge pointing at an off-screen world position, hidden while that position is on screen. Kinds:
  `'rescue' | 'vehicle' | 'sale' | 'cash' | 'alert' | 'goal'`. Must not cover the HUD buttons or the joystick.
- `ui.payDock` (`paydock.js`): a building pad's details at the bottom of the screen while the player stands on it.
  `show(id, info)`, `update(id, { price, remaining, paying, broke })`, `nudge(id)` (locked buzz), `done(id, text)`
  ("Bought!" then away), `hide(id?)`. Display only: it never takes touches. Pointers move above it while it is up.
- `ui.hint(text | null)` (pill under the top card; replaces the fixed driving hint), `ui.banner(text, seconds)`
  (town events), `ui.chip(id, { icon, text, until? } | null)` (stackable small status chips: rescue countdown,
  crew buff, event timer).
- HUD: **fame badge** (star, level, ring = progress to the next level; bumps on `fame:changed`, tap opens the Fame
  panel), top card switches to town progress after `garage:complete`, **map button**. Both appear on
  `town:opened` (hidden before).
- Panels: Fame (level, bonus, what the next levels bring, collection wall), Town map (from `TOWN`, `PROPERTIES`,
  `SERVICES`; state via `core/state.js`; tap -> `events.emit('ui:mapTarget', { id })`), Pro Gear sheet
  (`ui.openProGear()` / `closeProGear()`), Academy sheet (`ui.openAcademy()` / `closeAcademy()`),
  `ui.showGarageComplete()` (celebration, no reset), `ui.showFerry(onSail)`, level-up moment, "Perfect!" moment.
- Missions: town pool (4.16). Icons for everything new. `?uitest` shows every new label, pointer, chip, panel.
- sfx (synthesised): `spray`, `cure`, `wash`, `polish`, `winch`, `radio`, `fame`, `build`, `gate`, `thud`,
  `horn`, `bell`, `gull`, `coins`, `perfect`, `ferry`.

## 10. Performance and quality bar
- 60 fps on a phone anywhere in town. Budget on screen: ~14 cars, ~25 characters. Off-screen entities keep their
  logic but skip model animation and labels (`ctx.near`). Traffic and pedestrians exist only near the player.
- Static geometry merged per chunk; no per-frame allocations in update loops; pooled fx.
- No console errors or warnings in a 10-minute session. Saves from before the expansion load and play.
- Each feature is done when: it works from a loaded save and from fresh; it survives `shop:changed` (world
  rebuild) and a page reload in the middle of any state; its staff automation finishes the loop alone; it has
  its first-time hint; it was watched end to end at 1x speed from the game camera.

## 11. Waves, owners, files
| Wave | Agent | Owns | Delivers |
|---|---|---|---|
| 0 | `core` | `src/core/*`, `src/config*.js`, all existing `src/game/*`, new `src/game/town.js`, `vehicles.js`, `facility*.js` | 4.1-4.4, section 5, section 6 (facility refactor, properties, districts, player vehicles), section 6a |
| 0 | `env` | `src/models/environment.js`, `src/models/env-*.js` | section 8 |
| 0 | `cars` | `src/models/cars.js`, `leak.js`, new `vehicles.js`, own preview page | section 7 cars + vehicles |
| 0 | `buildings` | new `src/models/buildings-home.js`, `props-town.js`, later `buildings-main.js`, own preview page | section 7 buildings + town kit |
| 0 | `people` | `src/models/characters.js`, `fx.js`, `props.js`, new `critters.js`, own preview page | section 7 parts, characters, critters, fx |
| 0 | `ui` | `src/ui/*` | section 9 |
| 1 | `rescue` | `src/game/rescue.js` | 4.5 |
| 1 | `paintshop` | `src/game/paint.js` | 4.8 |
| 1 | `comfort` | `src/game/wash.js`, `lounge.js` | 4.6, 4.7 |
| 1 | `vipclub` | `src/game/vip.js` | 4.9 |
| 1 | `townlife` | `src/game/traffic.js`, `pedestrians.js`, `wrenches.js` | 4.10 |
| 2 | `projects` | `src/game/project.js` | 4.11 |
| 2 | `business` | `src/game/business.js`, `services.js` | 4.12, 4.13 |
| 2 | `endgame` | `src/game/townevents.js`, `ferry.js`, guide / pointers / missions wiring | 4.14-4.17 |
| 3 | `balance` | config numbers only | section 2 targets, measured |
| 3 | `qa` | fixes anywhere, by agreement with the lead | full playthrough, performance, iOS build |
`src/models/index.js`: each models agent appends only its own export lines. `src/models/preview.js` / `.html` are
frozen; make your own preview page. Wave 1+ agents that need a hook in a `core`-owned file ask for it in their
report or, for a one-line registration (adding their system to the world), make it and say so.

## 6a. Gameplay API (as built) — written by `core`; read this before writing a feature
STATUS (core run stopped early): everything below EXISTS in code and the game boots with it. Verified in the browser:
6a.1 registry + facilities (`?facilitytest`), 6a.3 garage + second facility playing, town opening, the `tow` purchase
(sign, pad, site, shed), 6a.6 truck driving / parking / backing into the shed. NOT yet verified in the browser:
Main Street gate + services pads, buying the other properties and upgrades, ferry default, pointers / map target,
`reserveSlot` / `spawn({ reserved, at, path })`, `jobView`, `buyManager`, the debug helpers other than `buy('tow')`,
`tp`, `drive`. Treat those as written-to-spec; report anything that does not match. Files: `world.js` (the rebuildable world + `ctx`),
`facility.js` (the facility machine), `cars.js` / `lifts.js` (Bay) / `stations.js` / `owners.js` / `staff.js` (its
systems, one instance per facility), `pads.js` (`PayPad`, unlock-chain pads), `registry.js` (how features plug in),
`features.js` (one import line per feature), `town.js` (town opening, bounds, properties, Main Street gate),
`vehicles.js` (player vehicles, parking, the tow truck), `pointers.js`, `guide.js`, `facilitytest.js` (a working
second facility, the smallest complete example). Conventions of `CONTRACTS.md` hold (`+z` south, `yaw = atan2(dx, dz)`).

### 6a.1 Plugging a feature in (no edits to world.js needed)
1. Write `src/game/<yours>.js`. At module level call one or more of the `registry.js` functions below.
2. Add ONE line `import './<yours>.js';` to `src/game/features.js` (that file is the only shared edit).
3. Everything you create must live under `ctx.root` (or be removed in `dispose`): the world is disposed and rebuilt on
   `shop:changed` (ferry), and must also come back identical after a page reload from the save alone.

```js
import { registerSystem, registerPropertySystem, registerFacility } from './registry.js';
registerSystem('traffic', (ctx) => ({ update(dt, t) {}, dispose() {} }));        // always on, once per world
registerPropertySystem('wash', (ctx, prop) => ({                                  // exists while 'wash' is built
  update(dt, t) {}, dispose() {}, onLevel(level, animate) {},                      // onLevel: upgrades (2, 3 ...)
}));
registerFacility(PAINT_DEF);                                                       // see 6a.3
```
- `registerSystem(id, factory)`: `factory(ctx)` runs once per world, after the town and every built property exist.
  The returned object is also stored as `ctx[id]` (if that name is free), so `ctx.rescue`, `ctx.traffic` ... can find
  each other. Systems update after the town, in import order (`features.js` order), before the guide.
- `registerPropertySystem(propId, factory)`: `factory(ctx, prop)` runs when that property's building exists: right
  after its building site finishes (a fresh purchase), or at world creation when the save already owns it.
  Several factories per property are fine (`tow` has the truck from `vehicles.js`; `rescue` adds its own).
  `prop` = the property record: `{ id, def (PROPERTIES[id]), level, building, group, solids[], systems[], facility }`.
  `onLevel(level, animate)` is called after an upgrade is bought. Levelled models (`tow wash lounge diner gas
  quickfit`) are REPLACED on upgrade: re-read `ctx.town.building(id)` / `prop.building` in `onLevel`, never cache it.
- `registerFacility(def)` with `def.property = 'paint'` (or `'vip'`): the facility is created when that property's
  building exists (same moments as above) and lives in `ctx.facilities[def.id]`. `def.always = () => bool` creates it
  without a property (debug instances, `?facilitytest`).

### 6a.2 `ctx` (the shared world context every system gets)
| field | what |
|---|---|
| `ctx.root` | THREE.Group of this world; add your objects here |
| `ctx.player` | the player: `pos`, `mode` (`foot` / `entering` / `driving` / `exiting` / `vehicle`), `onFoot`, `car` (customer car driven), `vehicle` (player vehicle driven), `stack` (carry stack: `items`, `count`, `takeAt(i)`, `takeTop()`), `capacity()`, `teleport(x, z)`, `enterCar(car)`, `enterVehicle(v)`, `exitVehicle(toV3)`, `workLift` / `working` (set by bays each frame), `pickTimer` / `dropTimer` |
| `ctx.facilities.{garage, paint?, vip?, test?}`, `ctx.facilityList` | facility instances (6a.3) |
| `ctx.cars / lifts / stations / owners / staff / pads` | legacy aliases = the garage's systems |
| `ctx.allCars` | every customer car of every facility (collision, yielding) |
| `ctx.town` | 6a.5 |
| `ctx.vehicles` | 6a.6 |
| `ctx.bounds` | walk / drive rectangle: `LAYOUT.bounds` until the town opens, then `TOWN.bounds` (town.js switches it) |
| `ctx.obstacles` | static boxes `{minX,maxX,minZ,maxZ}`; use `ctx.solids.add(box) -> box` / `ctx.solids.remove(box)` |
| `ctx.capsules` | dynamic capsules rebuilt every frame (cars, player vehicles); push more from `ctx.capsuleSources.push(fn(out))` (towed cars, traffic). Capsule = `{ ax, az, bx, bz, r, owner }` |
| `ctx.movers` | `{ pos, radius, ignore?, hidden? }` things AI customer cars brake + honk for (player vehicles are in it while moving; add towed cars, traffic, pedestrians on crossings) |
| `ctx.near(pos, margin = 0)` | is it on / near the screen: skip model animation, labels, sfx when false |
| `ctx.fx.{poof, confetti, sparks, dust, sparkle}(pos)` | fx at a world position (missing model fx are skipped) |
| `ctx.cam.lead(x, z, zoom)` / `ctx.cam.reset()` | camera look-ahead (eased) and pull-back; vehicles use it while driving |
| `ctx.pointers.add({ kind, icon?, text?, worldPos, priority? })` | edge pointer, 6a.8 |
| `ctx.cash` | cash piles: `new CashPile(ctx, x, 0, z, { radius })` from `cash.js` (`pile.add(value, fromV3, delay)`); every pile in `ctx.piles` is collected by walking past |
| `ctx.extras` | garage props (scrap bin, coffee cart ...); `ctx.extras.dumpFrom(stack, from, bin)` flies parts into a bin |
| `ctx.guide` / `ctx.town.setGuide({x,z} \| null)` | the bouncing guide arrow (+ an off-screen `goal` pointer) |
| `ctx.addFacility(def)` / `ctx.removeFacility(id)` | normally done for you by `registerFacility` + the property |
| `ctx.checkComplete()`, `ctx.applyUnlock(u, from)` | garage chain (legacy) |
| `ctx.game.started` | false until PLAY (or `?autoplay` / a returning save) |

### 6a.3 Facilities: the garage machine, parameterised
A facility = layout + hooks + optional subclasses. `createFacility(ctx, def)` builds, per facility: `fac.cars`
(spawner, lane, exits), `fac.bays` (garage: lifts), `fac.stations`, `fac.owners`, `fac.staff` (mechanics + valet),
`fac.pads` (its unlock chain). The garage itself is `GARAGE_DEF` and plays exactly as before.

**def**: `{ id, property?, always?, layout, hooks?, classes?, initial?: { stations: [keys], bays: [indexes] },
unlocks?: chain, stayText?, setup?(fac), teardown?(fac) }`.
- `layout`: `PAINT` / `VIP` as in the config. Read through `fac.L` (normalised: `bays` = `lifts`, `workOffsetZ`,
  `workRadius`, `staffSpotOffset`, `cashOffset`, `capture`, `staffIdle`, `driveArea`, `bayPostOffsetX`, `laneYaw`
  (default PI/2), plus every original key). Needed keys: `bays, stations, stationSize, stationPickupOffsetZ,
  stationZoneRadius, queueLaneZ, queueSlots, queuePickupOffsetZ, queuePickupRadius, carEntry, exitLaneZ, pickupStop,
  ownerCurb, carExit, loungeSpots, ownerWalkZ, valetStand, staffIdle, staffLaneZ, driveArea, workOffsetZ,
  workRadius, staffSpotOffset, cashOffset, capture`. Optional: `scrapBin` (+ `scrapBinRadius`) -> `fac.scrap`.
- `unlocks` (chain): `{ list, isUnlocked(id), markUnlocked(id), price(u), event }`. For town facilities use
  `townChain(PAINT_UNLOCKS)` from `facility.js` (state.town.unlocked, x shopMult, emits `townunlock { id, label,
  facility }`). Pads: the next `VISIBLE_PADS` entries, same grammar as the garage; paying calls
  `hooks.applyUnlock(fac, u, padPosV3)` (on load: `from = null`, no animation).
- `fac.mods.patience[key] = mult` / `fac.mods.spawn[key] = mult`: multipliers add-ons can set (lounge, paparazzi,
  rush hour ...); `fac.patienceMult()` / `fac.spawnMult()` multiply them all.
- `fac.forcedType`: next arrival's car type (fame "New in town" uses it on the garage).
- `fac.h(name, ...args)` calls a hook; `fac.hooks` may be patched at runtime by add-ons.

**hooks** (each gets `fac` first; defaults = garage):
| hook | default (garage) | paint / VIP would |
|---|---|---|
| `rollLook(fac, opts)` | `randomCarLook`, VIP chance, `carTypesAvailable()` classes, `fac.forcedType` | any unlocked class / `VIP_CAR_TYPES` |
| `tier(fac, look)` | `carTier(look.type)` | |
| `rollJobs(fac, opts, look)` -> types[] | unlocked part types | `['spray:red', 'spray:red']` (one per canister) |
| `jobView(fac, job, car)` -> label entry | (absent: jobs as they are) | `{ type: 'spray', color: '#e5484d', state: job.state }` / `{ type, gold: true, state }` |
| `patience(fac, car)` | `ECONOMY.patience` x coffee x VIP x `fac.patienceMult()` | `PAINT.patience` ... |
| `onArrived(fac, car)` | emits `car:arrived { vip, facility }` | |
| `spawnInterval(fac)`, `canSpawn(fac)` | garage formula; `ctx.game.started` | own interval |
| `entryPath(fac)` -> `{ spawn, path }` | town open (or no `carSpawn` in the layout): from `TOWN.edge.westX` along `carEntry` | |
| `exitPath(fac, car)` -> points | `carExit`, then on to `TOWN.edge.eastX` | |
| `bayModel(fac, index)` | `createLift()` | `createSprayBooth()` / `createGoldLift()` |
| `bayObstacles(fac, cfg)` -> boxes | the two lift posts | booth glass walls |
| `workTime(fac, job)`, `playerRate(fac)`, `staffRate(fac, who)` | `PROBLEMS[t].work`, repair upgrade, mechanicRate | `PAINT.work` ... |
| `payout(fac, car)` -> `{ total, speedy, bonusText? ... }` | `repairPayout(car.types, { tier, vip, speedy, mult: car.payMult })` | `resprayPayout` / `vipPayout` |
| `onFinished(fac, car, pay)` | streak, stats, VIP gem, fame, `car:repaired` | `respray:done`, `vip:done` ... |
| `stationModel(fac, key)`, `partType(fac, key)`, `stationIcon(fac, key)`, `restockTime(fac, key)`, `stationMax(fac, key)` | part stations; part type = key | `createPaintTank(key)`; part `'spray:' + key` |
| `mechanicLook(fac, i)`, `valetLook(fac)`, `ownerLook?(fac, car)` | mechanic / valet / random customer | painter, prep tech, host, VIP customer |
| `padPosition(fac, u)` | `u.pad`, station/tank pickup zone, bay centre | |
| `applyUnlock(fac, u, from)` | `station`/`tank` -> station, `lift`/`bay` -> bay, `mechanic`, `valet` | + `painter`, `preptech`, `irlamps` ... (handle your own types, fall back to `DEFAULT_HOOKS.applyUnlock`) |
| `depart?(fac, car)` -> true if handled | (absent: reverse out of the bay to `exitLaneZ`, then `pickupStop`, owner, `carExit`) | VIP: back onto the turntable |

**classes** (subclass instead of copying; pass `classes: { Bay: SprayBooth, Mechanic: Painter }`):
- `Bay` (`lifts.js`): `capture(car, who, driver)` -> snap tween -> `onSnapped(car)` (garage: raise; phase `raise` ->
  `up`) -> each frame `updateActive(dt)` (garage: player delivers + works in the work zone, mechanics add
  `mechanicRate()`, a job is done at `progress >= 1` -> `car.jobDone(job)`) -> `finish()` (payout pile + float texts,
  owner told, `onFinished`) -> `lowerAndRelease(car)` -> `fac.cars.setReady(car)`; the car leaves on its `exitGap`
  slot. Override for paint: `onSnapped` (mask, lamps), `updateActive` (spray sweep, then cure timer), `finish` /
  `lowerAndRelease` (unmask, then `setReady`). Staff work while `bay.phase === 'up'` and `car.firstReady()`;
  `isWorkable()` decides whether mechanics fetch for it. Helpers: `deliverPart(part, job)`, `playerInZone()`,
  `deliverFromPlayer()`, `payOut(car, pay)`, `exitSpot(out)`, `workPos`, `workRing`, `pile` (its CashPile), `model`.
- `Car` (`cars.js`): `jobs[{ type, state: need|ready|done, progress, claim, incoming }]`, `types`, `remaining`,
  `tier`, `vip`, `payMult`, `bonusText`, `patience / patienceMax / patienceOn`, `owner`, `lift` (its bay), `model`
  (the car model API incl. `setColor`, `setDirt` ...), `tag` (job bubble; `tag.setBonus(text)`,
  `tag.call('setStars', [...])`), `mode` (see the header of `cars.js`; your own modes are allowed: the car only
  drives itself in its own modes), `setPath(points, { reverse, restYaw, maxSpeed })`, `nose(out, up)`,
  `findNeed(type)`, `firstReady()`, `jobDone(job)`, `markJobsDirty()`, `finished`.
- `Station`, `Owner` (routes: `loungePath(door, spot)`, `curbPath(i)`, `leavePath()`; owners sit when the spot has
  `sit`), `Mechanic` (override `setWorkAnim(on)` for spray / polish poses), `Valet` (override `pathToBay(car, bay, sx)`).

**`fac.cars`**: `spawn(opts, force)` with `opts = { vip, type, problems: [types], look, payMult, bonusText,
at: { x, z, yaw }, path: [{x, z}], reserved }` (null = lane full). `at` + `path: []` starts a car anywhere and
sends it straight to its lane slot (a towed car released at the drop ring). `reserveSlot()` / `releaseSlot()` hold a
lane slot + waiting spot for a car that comes later (rescue: reserve at hook time, `spawn({ ..., reserved: true })`
at the drop). `lane`, `list`, `isWaiting(car)`, `leaveLane(car)`, `remove(car)`, `paused` (stops the spawner).

**Minimal facility** (the whole of `facilitytest.js` is a running one):
```js
registerFacility({
  id: 'paint', property: 'paint', layout: PAINT, unlocks: townChain(PAINT_UNLOCKS),
  initial: { stations: ['red', 'blue', 'white'], bays: [0] },
  classes: { Bay: SprayBooth, Mechanic: Painter },
  hooks: { partType: (fac, key) => 'spray:' + key, stationModel: (fac, key) => M.createPaintTank(key), /* ... */ },
});
```

### 6a.4 Pay pads
`new PayPad(ctx, { id, pos: {x, z}, price: () => n, locked?: () => bool, onLocked?, label?, onPaid(pad), animate,
armOnLeave?, ground?, dock?: () => info, doneText?: () => text })` (`pads.js`): the yellow pad; drains cash while the
player stands on it; partial payments kept for the session under `id`. Building pads pass `ground` (the label is a
`tag`: near state within 3.5 m, hidden while driving or standing on the pad) and `dock` (the pay dock while standing
on it, after a 0.2 s pause). Call `pad.update(dt)` each frame (returns true the frame it is paid), `pad.remove()`.
`pad.remaining`, `pad.price`, `pad.locked`, `pad.pos`. For chains use `createChainPads` (done by the facility).

### 6a.5 Town: `ctx.town` (`town.js`)
- Opening: `checkOpen()` runs on every garage unlock and at world creation; valet + `mechanic0` -> `openTown()`.
  The moment: chain barriers on the lot edges drop, `gate` sfx, toast, confetti; `ctx.bounds` = `TOWN.bounds`,
  camera follows inside `TOWN.camClamp`, static solids added (hall walls + pillars, `TOWN.fillers`, `TOWN.water`,
  `M.townSolids()`, Main Street `noGo` while locked, every building's walls). Before that nothing changes.
- Properties: every `PROPERTIES` entry of an open district shows a for-sale sign + pay pad + `tag` label + pay dock
  (fame lock: padlock sign, grey tag + dock with the fame needed, pad buzzes, the dock shakes). Paid: `buyPropLevel` (emits `property:changed`),
  building site for `BUILD_TIME`, then the building pops in (poof, confetti, toast `levels[0].label`), then its
  facility + property systems are created. Later levels: the pad returns at `upgradePad ?? pad`; buying one calls
  `onLevel(level)` on the systems (and rebuilds levelled models). A loaded save shows finished buildings at once.
- Building placement: factories that set `group.userData.world = true` are added at 0,0,0; others are put at the
  plot centre facing +z. Solid boxes: `group.userData.solids` (world boxes) if the model sets it, else defaults from
  the config (hall walls with the open front for tow shed / lounge / paint / VIP / showroom, junkyard fence,
  closed Main Street buildings = plot minus a 3 m front strip, wash arch posts). Missing factory -> grey blocks.
- `ctx.town.building(id)` (model API of a property or service building, or null), `prop(id)` (record, 6a.1),
  `plot(id)`, `padPos(id)`, `open`, `districtOpen(id)`, `setGuide(target | null)`, `guideTarget`, `buy(id)` (debug:
  next level without paying, same path as a purchase), `root`.
- Main Street gate: hoarding panels, two boom gates, `noGo` obstacle, pay pad in the west alley (`tag` label + pay
  dock, fame lock). Paid -> `openDistrict('main')` -> panels fall away one after another, booms lift, Main Street plots show
  their signs, depot + academy appear with their teal pads (`townpad:enter / exit { kind: 'pro' | 'academy' }`
  after a 0.4 s pause on them; the UI opens / closes the Pro Gear / Academy sheets on those).
- The ferry: its terminal stands on the plot from the start (scenery); the ticket pad is locked until
  `ownsAllProperties()` + fame. Paid with no system registered for `ferry`: `ui.showFerry(() => nextShop())`. An
  endgame system with `onLevel` takes over instead.
- Guide: after opening, the arrow points at the tow pad, then at the truck until it was driven once
  (`state.town.hints.truckUsed`); a map tap (`ui:mapTarget { id }`) points at that place until you reach it.
- Pointers made here: one `sale` pointer (cheapest affordable unlocked pad), one `alert` "Garage!" pointer (a garage
  customer below 25% patience while you are > 14 m from the lot).
- Fame: on `fame:levelup` -> confetti on the player, `fame` sfx, toast "New in town: X!" for new car classes and the
  next garage arrival is one (`garage.forcedType`). The UI shows the level-up panel itself.

### 6a.6 Player vehicles: `ctx.vehicles` (`vehicles.js`)
- `ctx.vehicles.add({ id, model, width, length, speed: () => m/s, at: { x, z, yaw }, bay, home? })` ->
  `PlayerVehicle`; `get(id)`, `list`, `remove(v)`, `bays()` (parking bays of open districts), `nearestBay(pos)`.
- The tow truck: `ctx.vehicles.get('tow')`, created by a property system of `tow` (exists while the shed exists),
  model from `M.createTowTruck(level)` (rebuilt on upgrade), speed `RESCUE.truck.speed[level - 1]` x Pro Gear
  `truck`. Starts in its shed (`RESCUE.truck.home`); where it stands is saved in `state.town.vehicles.tow`
  (`{ bay: 'shed' }` or `{ bay, x, z, yaw }`).
- `PlayerVehicle` fields: `id, model, group, pos (= group.position), yaw, speed (>= 0 while the player drives), vx,
  vz, wheelSpeed, mode ('parked' | 'driven' | 'parking' | 'auto'), bay ('shed' | parking id | null), driver
  ('player' | null | yours), playerIn, parked, width, length, capsule, mover, hitch (model's hook Object3D)`.
  Methods: `hitchPos(out)` (world position of the hook), `forward(out)`, `on(event, fn) -> off` with events
  `'stopped'` (was moving, now < 0.6 m/s: the moment to try hooking), `'enter'`, `'exit' { bay }`, `'parked' { bay }`,
  `'arrived'`; `setPointer(on, text?)` (edge pointer back to it); `canLeave = () => bool` (override to forbid
  parking / getting out); `driveTo(path, { reverse, speed, restYaw, onArrive })` (AI driving without collision, for
  the dispatcher; sets `mode = 'auto'`); `setModel(model)`; `doorSpot(out)`.
- Player flow: enter ring at the driver door (or in front of the nose when the door side is blocked, e.g. in the
  shed); `PLAYER.enterCarDelay` s in it -> `player.enterVehicle(v)` -> `vehicle:enter { id }`, hint pill "Park in a
  P bay to get out", camera lead + 15% pull-back, `goal` pointer "P" to the nearest bay. Stopped (< 0.35 m/s) inside a
  bay (aligned either way within ~35 deg) for 0.6 s -> straightens in, player hops out at the door -> `vehicle:exit`,
  `ui.hint(null)`. At `home` the truck then backs into its shed by itself (three-point turn first if it arrived
  nose-in). A vehicle is in `ctx.movers` while it moves and in `ctx.capsules` always.

### 6a.7 Events emitted by core (as built)
State: `town:opened`, `district:opened { id }`, `property:changed { id, level }`, `fame:changed { xp, level, frac,
delta, worldPos }`, `fame:levelup { level, unlocks[] }`, `till:changed { id, amount, cap }`, `manager:hired { id }`,
`garage:complete`, plus the legacy ones. Gameplay: `car:arrived { vip, facility }`, `car:repaired { count, vip,
speedy, total, facility, car }`, `unlock { id, label, facility }`, `townunlock { id, label, facility }` (facility
chains), `drive:start / drive:end { facility }`, `vehicle:enter / vehicle:exit { id }`, `townpad:enter / exit
{ kind }`. NOT emitted by core (yours): `rescue:*`, `respray:done`, `vip:done`, `wash:done`, `wrench:found`,
`project:changed`, `townevent:*`. For the rescue agent (asked by `ui`): emit `rescue:call { spot, until }` with
`spot` = a `RESCUE.spots` id; the map shows it.

### 6a.8 Pointers
`ctx.pointers.add({ kind, icon?, text?, worldPos, priority? })` -> `{ setPos(v3), setText(s), setIcon(name),
setVisible(bool), remove() }`. One path: `ui.pointer` ranks (rescue > vehicle > sale > cash > alert > goal), caps at 3
and hides a pointer while its target is on screen; `ctx.pointers` only tracks the handles of the world (removed on
rebuild). Keep one handle and toggle it; do not create one per frame.

### 6a.9 State helpers (`core/state.js`) as built
Section 5 names exist with these extras: `ownsAllProperties()`, `fameNeed(L)`, `fameUnlocksAt(level)`,
`carTier(type)`, `tillCap(id)`, `proLevel(key)`, `classicIds()`, `hasManager(id)`, `buyManager(id)` (fame + cash,
emits `manager:hired`), `addOfflineSource(fn)` (+ `refreshOffline(true)`) for offline income of a facility.
`nextPropLevel(id)` -> `{ level, price, fame, label, locked, reason: 'fame' | 'all' | null }`.
`state.town` also has `vehicles {}` and `garageDone`. `repairPayout(types, { tier, vip, speedy, mult })`.

### 6a.10 Debug helpers (`window.__game`)
Legacy: `state, world (ctx), player, cars, lifts, stations, staff, owners, pads, timeScale, start(), teleport(x, z),
giveCash(n), spawnCar(opts), unlockAll(n), unlock(id)`. Town: `town, vehicles, facilities, openTown(),
giveFame(levels = 1, xp = 0)`, `buy(id)` (next level of a property / a district, free, full build sequence),
`openDistrict(id = 'main')`, `unlockTown(id | n, facilityId = 'paint')`, `tp(place)` (next to a property / service /
district pad or parking bay; `'garage'`; `{x, z}`), `drive(id = 'tow')` (into a parked vehicle), `places()`.
Feature agents add theirs (`rescue(spotId)`, `spawnPaintCar(opts)`, `spawnVip(opts)`, `event(id)`) in their own
module: `Object.assign(window.__game, { ... })` inside their system factory.
`?facilitytest` adds the test facility on the paint plot; `?autoplay&save=<slot>` gives a tab its own save.

### 6a.11 Differences from the contract, open points
- Parking bays are painted by the environment; gameplay does not spawn `createParkingBay()`.
- Building sites have no collision; the wash site is two scaffold towers beside the exit lane, so the lane stays open.
- Junkyard default solids (fence round the plot) do not match the `bmain` model (fence x -44.5..-29.6); the model
  should set `group.userData.solids`, or `defaultSolids('junkyard')` in `town.js` needs fixing.
- Still open in core: old-save and `shop:changed` checks with the town open, walking all of `TOWN.bounds`, all
  properties bought through their pads, the truck on the ring road, and a performance comparison.
