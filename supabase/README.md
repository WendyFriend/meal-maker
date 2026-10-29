# Supabase (Kieran's dev project)

This directory holds the database schema as versioned SQL migrations, so the
schema can be evolved independently of the original project
(`fgiceoltfrerviphnxka` — Wendy's).

## Current state

- Branch: `kieran-dev`
- Migration: `migrations/20261025000000_initial_schema.sql`
  - Tables: `user_ingredients`, `recipes`
  - RLS enabled: users can only read/write their own rows
  - `updated_at` triggers + indexes
- Migration: `migrations/20261025010000_pantry_plan_shopping.sql`
  - `user_id` defaults to `auth.uid()` (the client never sends it)
  - `user_ingredients`: `quantity`, `unit`, `expires_on`
  - `recipes`: `servings`
  - New tables `meal_plan_entries`, `shopping_list_items` (RLS as above)
- Migration: `migrations/20261025020000_profiles_planner_tiers.sql`
  - New table `profiles` (one per user, auto-created on sign-up and
    backfilled): plan tier (`free` / `trial` / `pro`), trial end, daily
    calorie + macro targets, `meal_slots` (the user's meal periods)
  - Users can edit targets and meal periods; plan fields only change via
    `start_trial()` (one 14-day trial per account) or the service role
    (billing). Client inserts are forced to `free`.
  - New table `generation_usage` (one row per AI meal, for the daily cap)
  - `user_ingredients`: `is_favorite`, `usda_fdc_id`, `usda_description`,
    `micronutrients` (jsonb, per 100 g)
  - `recipes`: `source` (`manual` / `generated`), `meal_type`
  - `meal_plan_entries`: `slot` is any meal-period id now; `servings`

Plan limits are enforced in the app (see `shared/plans.ts`). The generation
API doesn't check them yet; server-side enforcement needs it to verify the
caller's Supabase JWT and read `profiles` / `generation_usage`.

The migration was **inferred from the app code** (`client/services/*.ts`,
`shared/types/*.ts`), not dumped from the original database. If the original
project has extra tables/columns/triggers not referenced by the code, they are
not captured here.

## To apply to your new Supabase project

```powershell
# 1. Log in (opens browser)
supabase login

# 2. Link the CLI to YOUR project (ref = the 20-char id in the project URL)
supabase link --project-ref <YOUR_PROJECT_REF>

# 3. Push the migration
supabase db push
```

Or, without the CLI: open your project's **SQL Editor** in the Supabase
dashboard, paste the contents of each file in `migrations/` (oldest first),
and run them.

## To diff against the original project (optional, needs access)

If you have access to the original project, you can generate an exact schema
dump instead of the inferred one:

```powershell
supabase login
supabase link --project-ref fgiceoltfrerviphnxka   # original project
supabase db dump --file schema_dump.sql            # schema only
supabase db dump --data-only --file data_dump.sql  # data (optional)
```

Then replace the inferred migration with the dump (or diff the two to see what
the code doesn't reference).

## Auth settings to check on the new project

- **Auth → URL Configuration → Site URL / Redirect URLs**: add
  `https://localhost:3010` so dev OAuth doesn't bounce to the Vercel deploy.
  The dev server is HTTPS-only for the microphone feature, so the redirect URL
  must use `https`, and the port is now 3010 (it used to be 5180).
- **Auth → Providers**: enable Email (and Google if used).
- **Auth → Providers → Email → Confirm email**: disable for frictionless dev
  login (re-enable for production).
