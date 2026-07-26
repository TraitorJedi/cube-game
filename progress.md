Original prompt: Ok so I have the cube-game directory that currently has my vite based game. I want to port this game into a fresh next.js using create-t3-app. I downloaded the create t3 source into the create-t3-app directory. you can also reference https://create.t3.gg/en/introduction. use the npm create t3-app@latest when ready @Computer-Use

## Progress

- Scaffolded `cube-game-next` with `npm create t3-app@latest` using App Router, Tailwind CSS, ESLint, npm, and no nested Git repository.
- Kept the original `cube-game` directory untouched as the working Vite reference.
- Ported the React/Three.js game into a client component at `/`.
- Converted the private editor into an App Router route at `/editor`.
- Renamed Vite public environment variables to their Next.js `NEXT_PUBLIC_` equivalents.

## Visual thesis

Cubesque-Ape remains a full-viewport charcoal isometric puzzle stage with bright physical cube stickers, a gold active-piece signal, and restrained teal UI chrome.

## Content plan

- `/`: the game stage itself, with settings, mode switch, tutorial, and victory states.
- `/editor`: the private Supabase-backed level workspace.

## Interaction thesis

- Preserve direct sticker slice dragging and snap/flick motion.
- Preserve continuous empty-space orbiting.
- Preserve mode transitions, tutorial focus, settings, touch movement, and victory feedback.

## Verification

- The Level Editor World canvas now swaps X and Y only in its isometric view projection; logical coordinates, labels, rotations, and saved level data remain unchanged.
- Focused Chrome verification on the signed-in `/editor` World tab confirmed `(1,0,0)` renders on the left diagonal, `(0,1,0)` on the right, Z stacking is unchanged, and the console has no errors. The capture is in `agent-files/output/world-axis-flip.png`.
- The Interior tab now mirrors the playable chamber as an isometric 4 × 4 × 4 stack. Only the selected Z floor is opaque and interactive; inactive floors remain visible at reduced alpha for spatial context.
- Placed play-mode items now render from the owning piece's rotated colour frame instead of the stale single-obstacle cache. The editor adapter preserves face-relative metadata for obstacles, bananas, spawns, and doors.
- Focused Chrome verification switched between Z floors 0 and 3 and placed a banana at `(1,1,3)` with no console errors. The exact rotation regression now asserts that an obstacle at 0 from Orange resolves to 3 from Red when Red is on the left wall; no manual slice choice is required. Captures are under `agent-files/output/interior-isometric-*.png`.
- `npm run check` passes; ESLint reports seven non-blocking warnings retained from the generated configs and preserved game/voxel code.
- `npm run build` passes on Next.js 16.2.11; `/` and `/editor` are statically generated App Router routes.
- `npm run test:engine` passes the signed U-turn attachment check for the cubelet, Ape, and obstacle.
- Windows Computer Use verification confirmed tutorial dismissal, pointer orbit, Interior mode, ArrowRight movement, Settings, and the private `/editor` sign-in boundary.
- The Next.js dev log remained free of application errors during the verified flows.
- After the migration was copied into the Git worktree and the Vite files were
  retired, `npm run check`, `npm run test:engine`, and `npm run build` passed
  again. The lint step retains seven warnings and no errors.

## Notes

- The public game is a dynamically loaded no-SSR client island because its Three.js renderer and tutorial initializer require browser APIs.
- The existing local Supabase values were migrated to `.env.local` with `NEXT_PUBLIC_` names; the file remains gitignored.
- `npm audit --omit=dev` currently reports three upstream high-severity findings through Next.js 16.2.11 (`postcss` and `sharp`). npm offers no safe current-version fix and incorrectly suggests downgrading Next.js to 9.3.3, so no forced audit mutation was applied.
- The original Vite implementation is preserved by the `vite-final` tag and
  baseline commit documented in `docs/migrations/2026-07-nextjs-t3.md`.
- The migration worktree retires the Vite HTML entries and duplicate source
  tree in a separate commit after the Next.js application lands.

## TODO

- Validate a deployment preview before merging the migration branch.
- Recheck the upstream Next.js/PostCSS/Sharp advisories when patched package releases are available.
