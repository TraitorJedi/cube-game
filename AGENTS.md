# Cube Game - Agent Guide

## Product direction

Evolve this repository into a browser-first isometric puzzle-game engine, initially built around a playable Rubik's Cube level and later extended into a level editor. Preserve the existing cube explorer as useful reference/interaction code until its behavior has been intentionally replaced.

The production stack is **React + Three.js** (prefer `@react-three/fiber` and `@react-three/drei` when they reduce custom glue code). The app must be compatible with a standard Vercel deployment: static/client rendering by default, no required long-running server, no Node-only browser paths, and environment variables only when genuinely needed.

## Definitions

- **World Cube:** The whole world cube, including all World Cube Pieces.
- **World Cube Piece:** A section of the World Cube with an interior in which the Ape can move.
- **Active Cube Piece:** The World Cube Piece containing the Player Ape.
- **Player Ape / Ape:** The player avatar that moves within a World Cube Piece.
- **Door:** An opening on a face that lets the Ape pass between touching World Cube Pieces.
- **Interior Grid:** The 4 × 4 × 4 grid of possible Ape positions. Its `X`, `Y`, and `Z` coordinates are distances from the named colour faces used for that grid frame.
- **Opposite Faces:** Blue/Green, Red/Orange, and White/Yellow are opposite-face pairs. Either face may describe the same coordinate; for example, `(0,0,0)` from Blue/Red/White equals `(3,3,3)` from Green/Orange/Yellow.
- **Obstacle:** A solid assigned to an Interior Grid position that the Ape cannot pass through.
- **Golden Banana:** A collectible rendered as a voxel model within one Interior Grid cell. Collecting it puts the game into the **Victory / Level Complete** state; Continue resets the current level to its default state.
- **Voxel resolution:** Every `1 × 1 × 1` Interior Grid cell supports voxel models at up to `64 × 64 × 64` resolution. The Ape and Golden Banana use `1/64`-cell voxels.

## Live entry point

`index.html` currently loads `app.js`; it is the production game source of truth. `src/main.js` and `src/engine.js` are an unfinished migration and must not receive gameplay fixes unless the migration is intentionally completed and `index.html` is switched in the same change. The pre-build entry-point check enforces this boundary.

## Core world rules

- The level is a 3 x 3 x 3 Rubik's Cube: 27 independently addressable cube pieces.
- Every cube piece is hollow and exposes an internal 4 x 4 grid on each side. Its bottom interior face is the walkable base for the initial puzzle.
- A player is one internal grid cell in size (1 x 1 x 1) and moves with the arrow keys across the bottom face of the active cube piece.
- Spawn the player in the interior of the initial Red/White/Blue corner piece.
- Support two clear interaction modes:
  - **Interior mode:** zoom into the active cube piece, reveal its 4 × 4 interior, and move the player.
  - **Cube mode:** zoom out and rotate/manipulate the whole Rubik's Cube using the established controls.
- After a whole-cube rotation finishes, settle the player onto the active piece's bottom interior face.
- Gravity is world-constant, not camera-relative: "down" always points to the Yellow face from the cube's initial orientation. Do not redefine down after a view or cube rotation.

## Architecture expectations

- Keep game state deterministic and model-first. Separate pure puzzle/world state (piece coordinates, orientation, active piece, player cell, gravity) from React and Three.js rendering.
- Use discrete logical coordinates and quarter-turn rotations; derive meshes, camera poses, and animations from that state. Avoid using floating-point scene positions as the source of truth.
- Represent faces and directions with named constants/enums. Explicitly document the initial color-to-world-axis mapping, including Yellow gravity.
- Keep rendering components small: scene/camera, cube-piece mesh, interior grid, player, controls/HUD. Prefer composition over a large monolithic scene component.
- Use `requestAnimationFrame`/R3F frame updates only for interpolation and visual effects. Commit gameplay state at deliberate input/animation boundaries.
- Load heavy editor-only code lazily when the editor arrives. Avoid large textures, unnecessary post-processing, and per-frame allocations.
- Design engine APIs so future editor tools can select, inspect, transform, serialize, and validate pieces without depending on UI components.

## Input and camera

- Arrow keys are reserved for interior-grid movement while Interior mode is active; prevent browser scrolling for handled keys.
- Keep cube-mode rotation separate from player movement and provide an obvious mode/focus transition.
- The isometric camera should make the cube's spatial structure legible, while interior mode prioritizes a stable, readable grid.
- Camera/view rotation never changes the meaning of gravity or the player's logical movement axes.
- Maintain keyboard accessibility and avoid controls that require a precision pointer to perform essential actions.

## Implementation conventions

- Use TypeScript for all new React/game-engine code and keep strict typing enabled.
- Prefer a feature-oriented structure, e.g. `src/engine`, `src/game`, `src/components`, and `src/editor` when needed.
- No new dependency unless it removes meaningful complexity or enables a stated requirement. Prefer the existing platform/browser APIs for simple needs.
- Do not silently rewrite unrelated legacy files or remove working interactions. Make focused changes and explain any migration boundary.
- Keep public game data serializable so levels can later be saved and edited.

## Verification and token discipline

Optimize for evidence, not exhaustive ceremony. Run the smallest relevant check after a change:

- Pure engine/state change: targeted unit test or a focused deterministic script.
- UI/input change: one focused browser verification of the changed flow, including console errors.
- Build/config/deployment change: production build once.

Do not run full test suites, repeated screenshots, broad refactors, dependency audits, or production deployments unless the change makes them relevant or the user requests them. Reuse existing checks and test helpers. Report what was verified and what was intentionally not run.

## Before completing work

- Confirm the altered behavior against the world rules above, especially Yellow-relative gravity after rotations.
- Keep the diff scoped and update developer documentation only when architecture, controls, or workflow changes.
- State any remaining limitation plainly; do not claim editor functionality until it exists.
