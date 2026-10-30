alter table public.user_ingredients
    add column if not exists micronutrients jsonb;

comment on column public.user_ingredients.micronutrients is
    'User-saved vitamin and mineral amounts per 100g. Keys and units follow shared/micronutrients.ts; missing values use reference lookups.';

notify pgrst, 'reload schema';
