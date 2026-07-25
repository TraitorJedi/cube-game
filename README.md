# Cubesque-Ape — Next.js port

This is the Create T3 App / Next.js App Router port of the Vite game in the sibling `cube-game` directory.

## Stack

- Next.js App Router
- React + Three.js
- TypeScript for route/editor code, with the established deterministic game engine retained in JavaScript during the framework migration
- Tailwind CSS plus the preserved game stylesheet
- Supabase for the optional private level editor

## Local development

```bash
npm run dev
```

Open `http://localhost:3000` for the game and `http://localhost:3000/editor` for the private editor.

Copy `.env.example` to `.env.local` and populate these values when the editor should use Supabase:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Without Supabase configuration, the public game uses its local primary level and the editor displays a configuration-required state.

## Verification

```bash
npm run check
npm run build
```