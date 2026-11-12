# Wrench Bay

An incremental car repair shop game in three.js (portrait / mobile-first), sibling of Noodle Harbor.
Customers drop off broken cars; you drive them onto a lift, fetch the right parts, wrench until they are fixed,
collect the cash, then buy lifts, part stations, staff and upgrades until the garage runs itself.

```bash
npm install
npm run dev        # http://localhost:5190 (also on your LAN, so you can open it on a phone)
npm run build      # static build in dist/
```

Controls: drag anywhere for the floating joystick (touch or mouse), or WASD / arrow keys. Stand in a ring to
interact: next to a waiting car to hop in and drive it, in front of a station to grab parts, in front of a lifted
car to deliver parts and repair, on a yellow pad to pay for an unlock, on the teal pad for upgrades.

Dev tools: `?dev` adds an in-game panel to edit every stat, tune the balance live, jump to any stage of the game and
hide the HUD (`?nohud` starts with a clean screen). See `docs/dev-tool.md`.

Debug: `?autoplay` skips the title; `?nogame` boots only the environment + UI; `?cam=x,z` pins the camera;
`?uitest` spawns sample UI; `window.__game` has `teleport(x,z)`, `giveCash(n)`, `spawnCar()`, `unlockAll()`...;
`/src/models/preview.html` shows every model.
Layout, prices and balance all live in `src/config.js`. Game design and module contracts: `CONTRACTS.md`.

## iOS app

The same game ships as a native iOS app through [Capacitor](https://capacitorjs.com): the Xcode project in `ios/`
loads the built `dist/` in a full-screen web view. The browser version is unchanged; native-only behaviour lives in
`src/core/platform.js` and is skipped on the web.

```bash
npm run ios          # build, copy into ios/, open Xcode (then pick a simulator or your iPhone and press Run)
npm run ios:sync     # build + copy only (after changing the game)
npm run ios:run      # build, copy and run on a simulator / device from the terminal
npm run ios:dev      # live reload: the app loads the Vite dev server (phone and Mac on the same network)
```

Needs Xcode. Running on a real iPhone needs your Apple ID selected under Signing & Capabilities; TestFlight and the
App Store need a paid Apple Developer account. App id: `com.caisergan.wrenchbay` (`capacitor.config.json`).

What the app adds: saves mirrored to native storage (iOS can clear a web view's localStorage), save + pause sound
when the app goes to the background and offline earnings when it comes back, haptics, portrait lock, no status bar,
bundled font (works offline), app icon and launch screen.

Icon and launch screen: `resources/icon.png` is rendered from the game's models by `src/models/icon.html` (run
`npm run dev`, screenshot that page at 1024x1024). `resources/splash.png` is the icon centred on a 2732x2732
background. After changing either: `npx capacitor-assets generate --ios`.

