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
dashboard, paste the contents of
`migrations/20261025000000_initial_schema.sql`, and run it.

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
  `http://localhost:5180` so dev OAuth doesn't bounce to the Vercel deploy.
- **Auth → Providers**: enable Email (and Google if used).
- **Auth → Providers → Email → Confirm email**: disable for frictionless dev
  login (re-enable for production).
