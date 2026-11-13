# Performance and flicker: what was done, what is left

Started on 2026-11-13 after the report "it flickers when I move around". All numbers below come from the Search browser
(WebKit) on an Apple M5, with a late-game save (13 garage unlocks, wash, lounge, tow and paint shop in town).

## Done

### 1. Shadow flicker while moving (the reported flicker)
- **Cause:** the sun's shadow box followed the camera smoothly, so every frame it moved by a fraction of a shadow-map
  texel. Each shadow edge was then drawn onto slightly different texels, and all the shadows crawled and shimmered
  while the player walked. They stood still once the player stopped.
- **Fix:** `placeSun()` in `src/core/engine.js` moves the box in whole texels of light space, so every edge stays on
  the same texels. This applies to both the phone view and the Browser view.
- **Measured:** the scene was frozen and only the shadow box moved.

  | Shift of the shadow box | Pixels that changed before | After |
  |---|---|---|
  | 3 mm to 2 cm | about 6,700 to 9,200, some at near full brightness | 0 to 2 |
  | 30 cm | not measured | 2 (Browser view) and 15 (phone view) |

### 2. Labels forced a page layout per label, every frame
- **Cause:** `worldToScreen()` read `root.clientWidth` and `clientHeight`. The labels loop moves one label, then reads
  that size for the next one, so the browser redid style and layout once per label on every frame.
- **Fix:** `resize()` stores the size in `viewSize`. `worldToScreen()` and the off-screen pointers
  (`src/ui/guidance.js`) read it from there.
- **Measured:** the old and new code were switched in the same page, so both ran under the same conditions.

  | Per frame | Before | After |
  |---|---|---|
  | Labels update | 1.6 to 1.7 ms (4.4 ms while the Mac was busy) | 0.03 to 0.05 ms |
  | Pointers update | 0.21 to 0.26 ms | 0.06 to 0.09 ms |
  | All game updates, median | about 2 ms | under 1 ms |

### 3. Shadows jumped several times during the driving zoom (Browser view)
- **Cause:** the shadow box was re-fitted every time the zoom changed by 0.02. During the ease to the driving zoom of
  1.15 and back, that happened about 7 times each way, and each re-fit changes the texel size, so every shadow jumped.
- **Fix:** the box now re-fits once per zoom change. Pulling out fits the wider framing straight away; pushing back
  in waits until the camera has settled.
- **Measured:** one re-fit when getting into the tow truck and one about 1.2 s after the zoom back in.

### 4. Shadow map type
`PCFSoftShadowMap` no longer exists in three r18x, and three already fell back to `PCFShadowMap` with a console
warning. The engine now asks for `PCFShadowMap` directly. The shadows look the same and the warning is gone.

### How the game runs now
On the M5 with nothing else busy, the game runs at a steady 60 fps both before and after these changes, with about 3 ms
of JavaScript per frame. Early readings of 33 to 52 fps were caused by other load on the machine (another game tab,
a video stream, a second browser), not by the game. On this Mac the visible change is the flicker. The label fix
matters most on slower CPUs (iPhone), where a forced layout costs more.

## Left, not implemented

### Draw calls (the main remaining cost)
Each frame makes about 450 to 1,050 draw calls, depending on what is on screen. Roughly 40% of them are in the
shadow pass. Lowering the pixel ratio from 1.64 to 1 did not change the frame rate, so the GPU's pixel work is not
the limit. The remaining cost is the CPU work of submitting each draw call, which is high in WebKit. In view from
the garage (Browser view):

| What | Meshes | Idea | Expected saving |
|---|---|---|---|
| Cash piles at the lifts (`CashPile` in `src/game/cash.js`, `createCashStack`) | about 100 bundles, up to 24 per lift; one geometry, one material, all casting shadows | Draw every bundle in one `InstancedMesh` that copies the bundles' world matrices each frame. The bundles stay as `Object3D`s, so the code that flies and collects them doesn't change. | about 200 draw calls (main + shadow pass) |
| Coin pile at the car wash (same `CashPile`, `createCoinStack`) | up to 30 coin stacks | Same `InstancedMesh` as the cash piles | about 60 |
| Parts on the station shelves (`PartStack` in `src/game/stack.js`, `createPart`) | about 30, one geometry per part type, one shared material | Same idea, one `InstancedMesh` per part type | about 60 |
| Main Street hoarding fence (`createHoardingPanel`, `refreshGate` in `src/game/town.js`) | 30 panels: 30 frames (120 triangles each, casting shadows) + 30 posters over 3 textures | While the gate is locked, show one merged frame mesh and one poster mesh per texture. Swap back to separate panels only for the gate-opening animation. | about 85 draw calls while the district is locked |
| Car wheels | about 62 wheel meshes (9 geometries, 1 material) | Same instancing idea; wheels spin and steer, so update their matrices each frame. | about 120 |
| Characters | about 5 meshes each | Merge per character, or skin them. A bigger change. | depends on the crowd |

The cash and coin piles are the best first target. They save the most draw calls, the change stays within
`CashPile`, and the piles fill up whenever cash isn't collected straight away. One shared helper ("draw these look-alike meshes as one instanced mesh") would then also cover the shelf
parts and the wheels.

### Not checked
- **iPhone:** not profiled on a device. The Capacitor build should be checked with Safari Web Inspector's timeline.
- **`THREE.Clock`:** deprecated in favour of `THREE.Timer`, so the console warns about it. No performance effect.
- **"Script error."** appears once in the console after load, with no file or line. It looks like an injected
  cross-origin script, not the game, but this wasn't confirmed.

## How to measure (gotchas)
- **Save slot:** open test tabs with `?save=<slot>`. Any tab on the same port shares localStorage with your own game
  tab and autosaves over it every 5 s.
- **Machine load:** compare A and B inside one page, under the same conditions, with a temporary switch in the code.
  Runs taken minutes apart differed by up to 2× on the same build.
- **Engine handle:** don't `import('/src/core/engine.js')` from the page after Vite has hot-updated that file. The app
  loads it with `?t=`, so you get a second, idle engine. Expose the real objects with a temporary `window` handle.
- **Reading pixels:** in WebKit, `gl.readPixels` on the canvas returned stale data. Render into a `WebGLRenderTarget`
  and use `readRenderTargetPixels` instead.
