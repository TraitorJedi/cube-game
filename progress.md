Original prompt: I'm missing the ability to move the center rings, also some of the motions should be relative to the face, each face should have 2 rotation based on vertical or horizantal

## Progress

- Replaced per-face gesture conditionals with face-local right/up coordinate frames.
- Added M, E, and S middle-slice moves to animation, command parsing, and controls.
- Center sticker horizontal/vertical drags now choose different middle slices.
- Added `render_game_to_text`, `advanceTime`, and a gesture inspection hook for automated testing.
- Initial browser capture rendered correctly; added an inline favicon to remove the only console 404.
- Verified all six faces' center horizontal/vertical mappings and their inverse drags.
- Verified corrected relative directions for back vertical (`R`), left vertical (`F`), and top horizontal (`F'`).
- Exercised real pointer drags on front, right, and top centers; results were E, M, and S slice turns as expected.
- Verified `M E S S' E' M'` restores every cubelet position and that all six middle-slice buttons exist.
- Browser console is clean; inspected baseline and center-ring turn screenshots.
- Follow-up: reversed both horizontal and vertical middle-ring turns when dragging the white center sticker; other white stickers retain their face-relative directions.
- Verified real white-center pointer drags: right produces `S`, down produces `M'`, reverse directions produce `S'`/`M`, and the outer white row still produces `F'`.
- Inspected horizontal and vertical white-center screenshots; browser console remained clean.
- Follow-up request: match iamthecu.be's continuous drag controls and release snapping.
- Inspected the public Cuber interaction source: it locks an axis after a small movement, rotates the selected slice continuously with pointer distance, rounds to the nearest 90 degrees on release, and lets fast flicks advance in their direction.
- Replaced threshold-triggered turns with a live slice preview, nearest-quarter snap/snap-back, distance-based release animation, and flick completion.
- Matched Cuber's release-speed calculation to total drag distance over gesture duration rather than the last pointer event.
- Removed the scene transform easing while empty-space dragging so cube view rotation stays directly under the pointer.
- Browser-tested real pointer gestures: a 27.7-degree slow drag snapped back; a 55.5-degree slow drag committed `E`; a 35.7-degree fast flick also committed `E`; reverse committed `E'`; vertical center committed `M`; and an outer-row drag committed `U'`.
- Verified empty-space dragging updates both view axes continuously, all completed gestures clear their preview/active state, final visuals render correctly, and the browser console remains clean.
- Follow-up request: center and optimize the cube-only mobile layout from a supplied portrait screenshot.
- Reproduced the issue at 393x737: the inherited desktop two-column stage grid placed the 393px hero inside a 93px first column, shifting the hero and cube 150px left.
- Reset the mobile stage to a single-column/single-row grid and explicitly placed the hero in that cell.
- Added a stylesheet cache key so the corrected responsive rules replace previously cached mobile CSS immediately.
- Verified portrait layouts at 393x737 and 360x640: hero left edge is 0, visual cube centers are 194.9/196.5px and 180.1/180px respectively, screenshots are centered, and console errors are empty.
- Ran the standard web-game regression capture at desktop size; layout, cube state, and desktop presentation remain unchanged.

## TODO

- None for this request.

## Engine foundation (current)

- Replaced the legacy static explorer entry point with a Vite React + Three.js project.
- Added a model-first `src/engine.js` with a 4 x 4 interior grid, R/W/B active-piece definition, bounded arrow-key movement, and immutable Yellow/world-down gravity.
- Added a Three.js isometric scene with all 27 cube pieces, a zoomed R/W/B hollow chamber view, internal floor grid/walls, player cube, and pointer orbit in Cube mode.
- Added Vercel-safe static configuration and package scripts for `npm run dev` / `npm run build`.
- Focused browser verification: entering the chamber then pressing ArrowRight moves player `(1,0,1)` to `(2,0,1)` while reported gravity remains `Yellow (world -Y)`.
- Restored the original explorer's charcoal/teal UI and sticker palette. Corrected the player render coordinate to `gridStart + (cellIndex + 0.5) * cellSize`, centering it within each tile rather than on a grid intersection.
- Visual-reference follow-up: inspected `origin/main` and copied its exact sticker mapping: Front Red, Back Orange, Right Blue, Left Green, Up White, Down Yellow. The default view shows its Green / Orange / White back-left-top corner. Sticker materials are brightened slightly so their original hues survive scene lighting.
- Added original Rubik's Cube outer-face turns in Cube mode: U/D/L/R/F/B plus inverse controls. Logical cubelets now carry both integer positions and sticker orientation, so turns update game state deterministically. Verified a face control records `R` and four `R` turns restore the solved state exactly.
- Cube-mode parity pass against `origin/main`: added its `cube.twist(...)` command workflow, all middle-slice M/E/S moves and inverses, grid/glass material control, undo, shuffle, and reset. Browser checks confirm the 18 face/center controls and default command sequence execute; engine checks confirm command parsing and undo.

## TODO

- Add real Rubik's whole-cube quarter-turn logic and use it to re-settle the player after a physical rotation.
- Convert new engine files to TypeScript when the next gameplay feature warrants the migration.
- Complete remaining original Cube Explorer parity: direct sticker drag with continuous preview/snap, labels, cubelet filters, and auto-orbit/realign camera actions.
