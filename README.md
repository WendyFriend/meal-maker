# Meal Maker

## Development

Install dependencies with `npm install` and configure the local `.env` file.
Run the frontend and API in separate terminals:

```sh
npm run dev
npm run server
```

The API watches server changes on port 3001. Starting it does not build the frontend. Stop an existing API process before starting another on the same port.

Both listen on every network interface, so other computers on the local network can open the app at `http://<this computer's LAN address>:5173` (Vite prints it as "Network"). Browsers send `/api` calls to the same address, and Vite forwards them to the API, so only 5173 needs to be reachable. Sign-in redirects use the address in the browser, so add it to the allowed redirect URLs in Supabase.

## Fast checks

```sh
npm run typecheck:client
npm run test:client
npm run lint:client
npm run typecheck:server
npm run typecheck
npm run lint:files -- client/auth/Login.tsx
```

Use `npm run test:client` for the complete frontend suite; server tests remain separate. Choose the check for the part of the app being changed. TypeScript checks and ESLint reuse local caches; type checks do not bundle assets or generate the service worker.

Use `npm run build:client` for a frontend production build, or `npm run build` to check both TypeScript projects and build the frontend. `npm run lint` checks the full repository.

See [AGENTS.md](AGENTS.md) for the component map and shared styling conventions.

## Database migrations

Apply SQL files from `supabase/migrations/` in the Supabase SQL editor before using features that need new columns. In particular, [ingredient preparation tips](supabase/migrations/202610280001_ingredient_preparation_tips.sql) adds the optional `user_ingredients.preparation_tips` column for custom tips. [Ingredient micronutrients](supabase/migrations/202610280002_ingredient_micronutrients.sql) adds `user_ingredients.micronutrients` to preserve edited vitamin and mineral values.

Food journal entries require [the journal migration](supabase/migrations/202610290001_food_journal.sql). It creates private, per-user food snapshots with the time eaten and a date-range index. Apply it in the Supabase SQL editor before logging meals.
