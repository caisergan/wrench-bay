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

Debug: `?autoplay` skips the title; `?nogame` boots only the environment + UI; `?cam=x,z` pins the camera;
`?uitest` spawns sample UI; `window.__game` has `teleport(x,z)`, `giveCash(n)`, `spawnCar()`, `unlockAll()`...;
`/src/models/preview.html` shows every model.
Layout, prices and balance all live in `src/config.js`. Game design and module contracts: `CONTRACTS.md`.
