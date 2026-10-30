-- NULL uses the app's suggested preparation guidance; [] explicitly clears it.
alter table public.user_ingredients
    add column if not exists preparation_tips text[];

comment on column public.user_ingredients.preparation_tips is
    'User-written preparation tips, one item per line. NULL uses suggested tips.';

notify pgrst, 'reload schema';
