-- Profile › Delete account: a signed-in user deletes their own account and
-- everything they saved. App Store and Google Play require apps with sign-up
-- to offer this in the app.
--
-- Runs as the function owner so it can remove the auth user, but only ever
-- for auth.uid(): callers cannot name another account.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
begin
    if uid is null then
        raise exception 'Not signed in' using errcode = '42501';
    end if;

    -- Explicit, in case a table's foreign key does not cascade.
    delete from public.journal_entries where user_id = uid;
    delete from public.recipes where user_id = uid;
    delete from public.user_ingredients where user_id = uid;
    delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
