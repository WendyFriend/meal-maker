begin;

alter table public.journal_entries
    add column if not exists plan_position integer
    check (plan_position > 0);

create or replace function public.reorder_journal_entries(
    p_day_start timestamptz,
    p_day_end timestamptz,
    p_entry_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
    entry_count integer;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in to reorder meals';
    end if;

    if p_day_start is null or p_day_end is null or p_day_start >= p_day_end
       or p_entry_ids is null then
        raise exception 'Invalid plan day or meal order';
    end if;

    select count(*) into entry_count
    from public.journal_entries
    where user_id = (select auth.uid())
      and eaten_at >= p_day_start
      and eaten_at < p_day_end;

    if entry_count <> cardinality(p_entry_ids)
       or entry_count <> (select count(distinct id) from unnest(p_entry_ids) as ids(id))
       or exists (
           select 1
           from unnest(p_entry_ids) as ordered(id)
           where not exists (
               select 1
               from public.journal_entries as entry
               where entry.id = ordered.id
                 and entry.user_id = (select auth.uid())
                 and entry.eaten_at >= p_day_start
                 and entry.eaten_at < p_day_end
           )
       ) then
        raise exception 'Plan changed. Refresh and try again';
    end if;

    update public.journal_entries as entry
    set plan_position = ordered.position::integer
    from unnest(p_entry_ids) with ordinality as ordered(id, position)
    where entry.id = ordered.id
      and entry.user_id = (select auth.uid())
      and entry.eaten_at >= p_day_start
      and entry.eaten_at < p_day_end;
end;
$$;

revoke all on function public.reorder_journal_entries(timestamptz, timestamptz, uuid[]) from public;
grant execute on function public.reorder_journal_entries(timestamptz, timestamptz, uuid[]) to authenticated;

comment on column public.journal_entries.plan_position is
    'Display order within the user local day; eating time remains unchanged.';

notify pgrst, 'reload schema';

commit;
