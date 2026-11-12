# bmain progress (resumed run)
Status: STARTED. buildings-main.js was a stub (no predecessor work). Plan: write one factory at a time, preview in src/models/preview-main.html/.js.
## Done
(none)
## In progress
1 junkyard
## Next
2 depot, 3 diner, 4 academy, 5 showroom, 6 gas, 7 quickfit, 8 ferry, preview page, game-cam check
## Notes / assumptions
- Junkyard fence encloses x -44.5..-29.6; office shack stands outside it (x -29.2..-26.8, z -37.5..-36.1) next to the parking bay; sell spot PROJECT.junkOffice in front of it.
- [x] junkyard built + looked at (preview-main.html?focus=junk&k=1.6). Crane picks from heap -> drops into baler, cable vertical.
- preview: src/models/preview-main.html (focus=junk|depot|diner|academy|show|gas|qf|ferry, view=game&tx=&tz=)
- [x] depot built + looked at (game cam)
- [x] diner L1-5 built + looked at (game cam, diner=5). Plain-building factories return the Group itself (stub shape) with .group (self), .update, userData.u
- [x] academy built + looked at
- [x] showroom built (setCollection(ids) extra). turntables use buildings-home createTurntable
- [x] gas L1-5 built + looked at (L3). Canopy = translucent roof. Note for core: parking bay 'quickfit' (56,8.8) lies on VISITS.quickfit path x=56 (and gas bay edge on its path x=-55)
- [x] quickfit L1-5 built (api: setBusy, update, liftHeight(i), bays[]); gameplay should add liftHeight(i) to the car's y while busy
- [x] ferry terminal built (group.setOpen(0..1) barrier, clock real time). Lane z18.4..22.2 kept free.
## STATUS: ALL 8 FACTORIES DONE + looked at from the game camera (no console errors). Final report written by the agent.
