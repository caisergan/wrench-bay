# Final report: `cars` (Opus)

_2026-11-12, resume run (stopped early for usage limits). Verbatim last message of the subagent._

I stopped as asked, and the files are in a clean state. All four files parse, the preview page loads, and the five existing car types (plus the gold VIP) look and behave exactly as they did before this work. The handoff notes are in `/tmp/wb-progress/cars.md`.

**What I did**
- **Fixed a blocker:** the previous agent's `cars.js` imported a water-drip function that `leak.js` didn't have. That stops every page that loads the models, including the game. I added it to `leak.js`: water drips fall to the floor and the damp spots dry up in a few seconds. The oil code is unchanged.
- **Built the preview page** (`preview-cars.html` / `.js`). It shows every car type, every state, and colour sweeps at k = 0, 0.33, 0.66 and 1. It also has a stage 0–3 row per classic, a wash run, a tow run, and a side-by-side of the old and new versions of the existing cars. The `view=game` grids use the real portrait game camera.
- **Rewrote `setTowed` to match the tow truck.** The front axle now stays where it is along the car, and the front tyre bottoms sit exactly at the tow-lift height (0.42). The rear tyres stay on the floor, the lifted wheels don't spin, and the hood stays shut while the car is on the hook.
- **Fixed things that looked wrong or broke real-world logic:**
  - The supercar's wheels stuck up above its body, so it looked like a buggy; it now has fenders over each wheel and a narrower front lid.
  - The supercar (mid-engined), Bubble 58 and Surf Bus (rear-engined) now smoke and leak oil where their engine actually is.
  - The hot rod's engine and blower were attached to the hood and would have swung up with it; they are now part of the body, and the hood is a panel with a hole.
  - The limo looked like a wagon; it is now a saloon with a separate boot and a vinyl roof.
  - The Bubble 58 looked too much like the compact; it now has a domed roof, a canvas top and a luggage rack.
  - Smaller fixes: a cream hatch was getting a teal roof, black paint gave a grey hood, and the muscle car's hood scoop was a plain white block.
  - Dirt: mud no longer hangs in the air behind the car, and dust is now a see-through film instead of tan boxes.
  - Foam no longer runs below the sills into the floor, and water drips now land where the camera can see them.
  - Masking paper now covers the seats of open cars.
  - A classic's primer patches are painted over by the colour sweep instead of floating on the new paint.

**How I checked it**
- Node tests in `/tmp/wb-cars-test/` cover:
  - every one of the 21 types with every method;
  - the existing cars against the pre-task file: 256 of 256 combinations identical;
  - the tow geometry for all types;
  - towed wheels and hood, with a check that the hood does open when the car is not towed.
- In the browser I walked through the preview views in a 420 x 860 window and at a wider size for close-ups.
- In the real game (on core's no-reload server, port 5192, my own save slot), I spawned new muscle, camper and rally cars into the garage lane, and they render.

**For the `vehicles` agent, where to hang a towed car:** the front axle sits at x = 0 and at these z values, measured from the car's origin at floor level with the nose towards +z. At full tow the axle centre height is 0.42 plus the front wheel radius (available as `car.dims.wheelRF`).

| Type | Front axle z | Type | Front axle z | Type | Front axle z |
|---|---|---|---|---|---|
| compact | 0.74 | camper | 0.96 | gsuv | 0.90 |
| sedan | 0.86 | roadster | 0.86 | bubble | 0.68 |
| pickup | 0.90 | rally | 0.82 | woody | 0.90 |
| van | 0.92 | supercar | 0.92 | surfvan | 0.86 |
| sports | 0.88 | limo | 0.98 | hotrod | 0.98 |
| hatch | 0.80 | classic | 0.98 | finback | 0.92 |
| suv | 0.90 | gt | 0.88 | | |

The same value is in `car.dims.ax` at runtime.

**What is left**
- **Not looked at in the browser:**
  - Damage on the limo, luxury 4x4, open tourer, Woody Wagon, Finback and Gran Corsa (Node test only).
  - The hazard lights row.
  - The oil trail while driving.
  - The wash run and live tow run pages.
  - The `game: mix` and `game: states` views.
- **In the real game:** watch a whole repair of a new car type on a lift. The paint shop, VIP, rescue and wash sequences need the gameplay agents' code first.
- **Unexplained console errors:** the game showed three "Script error." exceptions with no source. I couldn't trace them, so they may or may not come from my files.
- **Optional polish:** the wrecks could show more missing parts; the supercar's fender tops don't get the dull/gloss film; the muscle car's factory stripes stay after a respray.
- **Temporary file:** delete `src/models/preview-cars-before.js` once the old-vs-new comparison isn't needed. It's a preview-only copy of the old `cars.js`.

**Changes I need from other owners:** none.

Files are in `src/models/`:
- `cars.js`
- `leak.js`
- `preview-cars.html`
- `preview-cars.js`
- `preview-cars-before.js` (temporary)
