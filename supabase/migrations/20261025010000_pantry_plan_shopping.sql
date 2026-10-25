-- Pantry details, recipe servings, weekly meal plan and shopping list.

-- ============================================================
-- user_id defaults: the client never sends user_id, so fill it from the
-- caller's session (RLS still checks it matches).
-- ============================================================
alter table public.user_ingredients alter column user_id set default auth.uid();
alter table public.recipes alter column user_id set default auth.uid();

-- ============================================================
-- user_ingredients: what the user has on hand
-- ============================================================
alter table public.user_ingredients
    add column if not exists quantity numeric,
    add column if not exists unit text,
    add column if not exists expires_on date;

-- ============================================================
-- recipes: nutrition and weights are per serving
-- ============================================================
alter table public.recipes
    add column if not exists servings integer not null default 1;

-- ============================================================
-- meal_plan_entries: a saved recipe placed on a day + slot
-- ============================================================
create table if not exists public.meal_plan_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    plan_date date not null,
    slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
    recipe_id uuid not null references public.recipes (id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================
-- shopping_list_items
-- ============================================================
create table if not exists public.shopping_list_items (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    name text not null,
    quantity text,
    checked boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists set_meal_plan_entries_updated_at on public.meal_plan_entries;
create trigger set_meal_plan_entries_updated_at
    before update on public.meal_plan_entries
    for each row
    execute function public.set_updated_at();

drop trigger if exists set_shopping_list_items_updated_at on public.shopping_list_items;
create trigger set_shopping_list_items_updated_at
    before update on public.shopping_list_items
    for each row
    execute function public.set_updated_at();

create index if not exists meal_plan_entries_user_date_idx
    on public.meal_plan_entries (user_id, plan_date);

create index if not exists shopping_list_items_user_id_idx
    on public.shopping_list_items (user_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.meal_plan_entries enable row level security;
alter table public.shopping_list_items enable row level security;

drop policy if exists "meal_plan_entries_select_own" on public.meal_plan_entries;
create policy "meal_plan_entries_select_own" on public.meal_plan_entries
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists "meal_plan_entries_insert_own" on public.meal_plan_entries;
create policy "meal_plan_entries_insert_own" on public.meal_plan_entries
    for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "meal_plan_entries_update_own" on public.meal_plan_entries;
create policy "meal_plan_entries_update_own" on public.meal_plan_entries
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "meal_plan_entries_delete_own" on public.meal_plan_entries;
create policy "meal_plan_entries_delete_own" on public.meal_plan_entries
    for delete to authenticated
    using (auth.uid() = user_id);

drop policy if exists "shopping_list_items_select_own" on public.shopping_list_items;
create policy "shopping_list_items_select_own" on public.shopping_list_items
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists "shopping_list_items_insert_own" on public.shopping_list_items;
create policy "shopping_list_items_insert_own" on public.shopping_list_items
    for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "shopping_list_items_update_own" on public.shopping_list_items;
create policy "shopping_list_items_update_own" on public.shopping_list_items
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "shopping_list_items_delete_own" on public.shopping_list_items;
create policy "shopping_list_items_delete_own" on public.shopping_list_items
    for delete to authenticated
    using (auth.uid() = user_id);
