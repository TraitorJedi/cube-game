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

- `npm run check` passes; ESLint reports seven non-blocking warnings retained from the generated configs and preserved game/voxel code.
- `npm run build` passes on Next.js 16.2.11; `/` and `/editor` are statically generated App Router routes.
- `npm run test:engine` passes the signed U-turn attachment check for the cubelet, Ape, and obstacle.
- Windows Computer Use verification confirmed tutorial dismissal, pointer orbit, Interior mode, ArrowRight movement, Settings, and the private `/editor` sign-in boundary.
- The Next.js dev log remained free of application errors during the verified flows.

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
