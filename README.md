# Cubesque-Ape

The live game at `/` is the React/Three implementation in `src/main.js`. The
preserved DOM/CSS implementation remains available at `/legacy` from
`legacy/app.js`.
An isometric cube-puzzle game whose player is a voxel ape. The ape is built
from cuboids and fits entirely inside one 1 × 1 × 1 cell of the active 4 × 4 × 4
interior grid.

It uses [iamthecu.be](https://iamthecu.be/) as a reference starting point for the concept, interaction style, and overall direction, but the source code in this repository was recreated independently for this project.

## Run locally

Run `npm run dev`, then open `/` for the current React game or `/legacy` for the
preserved implementation.

# Private level editor

The level editor is a separate, lazy-loaded module at `/editor`. The public game does not link to it or render editor controls. Visitors to `/editor` see only the sign-in screen until Supabase returns a valid session; the editor bundle is loaded after that check succeeds.

The editor supports existing-user email/password sign-in only. To provision the initial account:

1. In Supabase, open **Authentication → Providers → Email** and disable new-user sign-ups.
2. Open **Authentication → Users → Add user → Create new user**, then set the editor user's email and password.
3. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` configured for the deployment.

Do not put a Supabase secret or service-role key in Vite environment variables. The existing row-level security policies remain the server-side write boundary: only the owning authenticated user can modify the primary level.

The editor enables saving only after the shared level has loaded successfully; it never treats the public game's local fallback as an editable remote draft. Door placements require a target cube piece and a matching aligned door back from that piece before the level will validate and save.
