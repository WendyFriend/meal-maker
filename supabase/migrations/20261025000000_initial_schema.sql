-- MealMaker schema (inferred from client/services/*.ts and shared/types/*.ts)
-- Applied to a fresh Supabase project to make it match the app's expectations.

-- ============================================================
-- user_ingredients: nutrition data per 100g, saved by each user
-- ============================================================
create table if not exists public.user_ingredients (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    name text not null,
    calories_per_100g numeric not null,
    protein_per_100g numeric not null,
    carbohydrate_per_100g numeric not null,
    fat_per_100g numeric not null,
    sugar_per_100g numeric,
    saturated_fat_per_100g numeric,
    fiber_per_100g numeric,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================
-- recipes: saved generated meals
-- ============================================================
create table if not exists public.recipes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    recipe_name text not null,
    ingredients jsonb not null,
    instructions jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_user_ingredients_updated_at on public.user_ingredients;
create trigger set_user_ingredients_updated_at
    before update on public.user_ingredients
    for each row
    execute function public.set_updated_at();

drop trigger if exists set_recipes_updated_at on public.recipes;
create trigger set_recipes_updated_at
    before update on public.recipes
    for each row
    execute function public.set_updated_at();

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists user_ingredients_user_id_idx
    on public.user_ingredients (user_id);

create index if not exists user_ingredients_user_name_idx
    on public.user_ingredients (user_id, name);

create index if not exists recipes_user_id_idx
    on public.recipes (user_id);

create index if not exists recipes_user_created_idx
    on public.recipes (user_id, created_at desc);

-- ============================================================
-- Row Level Security: users can only see/modify their own rows
-- ============================================================
alter table public.user_ingredients enable row level security;
alter table public.recipes enable row level security;

drop policy if exists "user_ingredients_select_own" on public.user_ingredients;
create policy "user_ingredients_select_own" on public.user_ingredients
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists "user_ingredients_insert_own" on public.user_ingredients;
create policy "user_ingredients_insert_own" on public.user_ingredients
    for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "user_ingredients_update_own" on public.user_ingredients;
create policy "user_ingredients_update_own" on public.user_ingredients
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "user_ingredients_delete_own" on public.user_ingredients;
create policy "user_ingredients_delete_own" on public.user_ingredients
    for delete to authenticated
    using (auth.uid() = user_id);

drop policy if exists "recipes_select_own" on public.recipes;
create policy "recipes_select_own" on public.recipes
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists "recipes_insert_own" on public.recipes;
create policy "recipes_insert_own" on public.recipes
    for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "recipes_update_own" on public.recipes;
create policy "recipes_update_own" on public.recipes
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "recipes_delete_own" on public.recipes;
create policy "recipes_delete_own" on public.recipes
    for delete to authenticated
    using (auth.uid() = user_id);
