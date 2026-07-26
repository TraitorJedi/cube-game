# Cubesque-Ape — Next.js port

This is the Create T3 App / Next.js App Router version of Cubesque-Ape. The
pre-migration Vite application remains recoverable from the `vite-final` tag.

## Stack

- Next.js App Router
- React + Three.js
- TypeScript for route/editor code, with the established deterministic game engine retained in JavaScript during the framework migration
- Tailwind CSS plus the preserved game stylesheet
- Supabase for immutable level versions, creator ownership, and the published
  Default level

## Local development

```bash
npm run dev
```

Open `http://localhost:3000` for the game, `http://localhost:3000/editor` for
the private editor, and `http://localhost:3000/admin` for Default-level
publishing.

Copy `.env.example` to `.env.local` and populate these values when the editor should use Supabase:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Without Supabase configuration, the public game uses the bundled Tutorial
fallback and the editor displays a configuration-required state.

## Level engine

Level versions are complete JSON documents. World Pieces use integer
coordinates with this fixed logical frame:

- `x`: Orange (-) to Red (+)
- `y`: Green (-) to Blue (+)
- `z`: Yellow (-) to White (+); gravity is always `-z`

Interior cells are `[x,y,z]` tuples from `0` through `3`, measured from the
Orange, Green, and Yellow faces. Doors additionally name their face and connect
only when a manually placed door on the touching neighbor aligns in world
space.

Rotation behavior is authored with the visual rule builder or the safe Cube
DSL in `/editor`. Explicit **Save Version** actions create immutable revisions.
Incomplete drafts can be saved with diagnostics, but only an admin can select
a valid revision as the public Default.

Admin authorization uses `app_metadata.role = "admin"` in Supabase Auth. After
changing that metadata, refresh the user's session by signing out and back in.
Enable leaked-password protection in the Supabase Auth dashboard before
production use.

## Verification

```bash
npm run check
npm run test:engine
npm run build
```
