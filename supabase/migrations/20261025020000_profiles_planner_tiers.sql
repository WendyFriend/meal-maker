-- Profiles (plan tier, daily targets, meal periods), generation usage,
-- USDA-matched ingredient data, saved-meal metadata and flexible planner slots.

-- ============================================================
-- profiles: one row per user
-- ============================================================
create table if not exists public.profiles (
    user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
    plan text not null default 'free' check (plan in ('free', 'trial', 'pro')),
    trial_ends_at timestamptz,
    trial_used boolean not null default false,
    daily_calories integer not null default 2000 check (daily_calories between 800 and 8000),
    protein_g integer not null default 120 check (protein_g between 0 and 600),
    carbs_g integer not null default 225 check (carbs_g between 0 and 1200),
    fat_g integer not null default 67 check (fat_g between 0 and 600),
    fiber_g integer not null default 30 check (fiber_g between 0 and 150),
    -- [{ id, label, time, calorieShare }]
    meal_slots jsonb not null default '[
        {"id": "breakfast", "label": "Breakfast", "time": "07:30", "calorieShare": 25},
        {"id": "lunch", "label": "Lunch", "time": "12:30", "calorieShare": 30},
        {"id": "snack", "label": "Snack", "time": "15:30", "calorieShare": 10},
        {"id": "dinner", "label": "Dinner", "time": "18:30", "calorieShare": 35}
    ]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
    before update on public.profiles
    for each row
    execute function public.set_updated_at();

-- Users may edit their targets and meal periods, but plan fields only
-- change through start_trial() or the service role (billing).
create or replace function public.protect_profile_plan()
returns trigger
language plpgsql
as $$
begin
    if (new.plan is distinct from old.plan
        or new.trial_ends_at is distinct from old.trial_ends_at
        or new.trial_used is distinct from old.trial_used)
        and coalesce(current_setting('mealmaker.allow_plan_change', true), '') <> 'on'
        and coalesce(auth.role(), '') <> 'service_role'
    then
        raise exception 'plan fields can only be changed by billing';
    end if;

    return new;
end;
$$;

drop trigger if exists protect_profiles_plan on public.profiles;
create trigger protect_profiles_plan
    before update on public.profiles
    for each row
    execute function public.protect_profile_plan();

-- Inserts from the client always start on the free plan.
create or replace function public.force_free_plan_on_insert()
returns trigger
language plpgsql
as $$
begin
    if coalesce(auth.role(), '') <> 'service_role' then
        new.plan := 'free';
        new.trial_ends_at := null;
        new.trial_used := false;
    end if;

    return new;
end;
$$;

drop trigger if exists force_profiles_free_plan on public.profiles;
create trigger force_profiles_free_plan
    before insert on public.profiles
    for each row
    execute function public.force_free_plan_on_insert();

-- New sign-ups get a profile automatically.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (user_id) values (new.id)
    on conflict (user_id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
    after insert on auth.users
    for each row
    execute function public.handle_new_user_profile();

-- Backfill existing users.
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- One 14-day Pro trial per account.
create or replace function public.start_trial()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
    result public.profiles;
begin
    if auth.uid() is null then
        raise exception 'not signed in';
    end if;

    perform set_config('mealmaker.allow_plan_change', 'on', true);

    update public.profiles
    set plan = 'trial',
        trial_ends_at = now() + interval '14 days',
        trial_used = true
    where user_id = auth.uid()
        and plan = 'free'
        and trial_used = false
    returning * into result;

    if result is null then
        raise exception 'trial already used or plan is not free';
    end if;

    return result;
end;
$$;

revoke all on function public.start_trial() from public;
grant execute on function public.start_trial() to authenticated;

-- ============================================================
-- generation_usage: one row per AI meal generation (daily quota)
-- ============================================================
create table if not exists public.generation_usage (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
);

create index if not exists generation_usage_user_created_idx
    on public.generation_usage (user_id, created_at desc);

-- ============================================================
-- user_ingredients: favourites and the USDA food the data came from
-- ============================================================
alter table public.user_ingredients
    add column if not exists is_favorite boolean not null default false,
    add column if not exists usda_fdc_id integer,
    add column if not exists usda_description text,
    -- { fiber, sodium, vitaminC, ... } per 100 g (shared/nutrition/nutrients.ts)
    add column if not exists micronutrients jsonb;

-- ============================================================
-- recipes (saved meals): where they came from and what meal they suit
-- ============================================================
alter table public.recipes
    add column if not exists source text not null default 'manual',
    add column if not exists meal_type text;

alter table public.recipes drop constraint if exists recipes_source_check;
alter table public.recipes
    add constraint recipes_source_check check (source in ('manual', 'generated'));

alter table public.recipes drop constraint if exists recipes_meal_type_check;
alter table public.recipes
    add constraint recipes_meal_type_check
    check (meal_type is null or meal_type in ('breakfast', 'lunch', 'dinner', 'snack'));

-- ============================================================
-- meal_plan_entries: slots are the user's own meal periods now
-- ============================================================
alter table public.meal_plan_entries drop constraint if exists meal_plan_entries_slot_check;
alter table public.meal_plan_entries
    add constraint meal_plan_entries_slot_check check (char_length(slot) between 1 and 40);

alter table public.meal_plan_entries
    add column if not exists servings numeric not null default 1 check (servings > 0 and servings <= 10);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.generation_usage enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
    for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "generation_usage_select_own" on public.generation_usage;
create policy "generation_usage_select_own" on public.generation_usage
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists "generation_usage_insert_own" on public.generation_usage;
create policy "generation_usage_insert_own" on public.generation_usage
    for insert to authenticated
    with check (auth.uid() = user_id);
