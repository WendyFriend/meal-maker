alter table public.user_ingredients
    add column if not exists nutrition_source jsonb;

comment on column public.user_ingredients.nutrition_source is
    'Matched food ID and description used for Nutrition Lab thumbnails; saved nutrition values remain independent of later lookups.';

notify pgrst, 'reload schema';
