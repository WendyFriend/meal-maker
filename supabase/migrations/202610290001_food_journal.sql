begin;

create table if not exists public.journal_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    eaten_at timestamptz not null,
    meal_name text not null check (length(trim(meal_name)) > 0),
    ingredients jsonb not null check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) > 0),
    created_at timestamptz not null default now()
);

create index if not exists journal_entries_user_eaten_at_idx
    on public.journal_entries (user_id, eaten_at);

alter table public.journal_entries enable row level security;
revoke all on public.journal_entries from anon;
grant select, insert, update, delete on public.journal_entries to authenticated;

create policy "Read own journal entries" on public.journal_entries
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own journal entries" on public.journal_entries
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own journal entries" on public.journal_entries
    for update to authenticated using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
create policy "Delete own journal entries" on public.journal_entries
    for delete to authenticated using ((select auth.uid()) = user_id);

comment on column public.journal_entries.ingredients is
    'Snapshot of food nutrition per 100g and actual grams eaten; saved meal changes do not alter history.';
notify pgrst, 'reload schema';

commit;
