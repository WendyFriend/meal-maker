begin;

-- Fill missing reference nutrients without replacing recipe values or racing
-- another device's edits. The row lock makes each update use the latest recipe.
create or replace function public.fill_recipe_nutrition(
    p_recipe_id uuid,
    p_enrichments jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    recipe_ingredients jsonb;
    enrichment jsonb;
    ingredient_index integer;
    ingredient_value jsonb;
    updated_ingredient jsonb;
    nutrient_key text;
    nutrient_value jsonb;
    changed boolean := false;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in to update recipe nutrition';
    end if;
    if p_enrichments is null or jsonb_typeof(p_enrichments) <> 'array' then
        raise exception 'Invalid recipe nutrition updates';
    end if;

    select ingredients into recipe_ingredients
    from public.recipes
    where id = p_recipe_id and user_id = (select auth.uid())
    for update;

    if recipe_ingredients is null then
        raise exception 'Recipe not found';
    end if;

    for enrichment in select value from jsonb_array_elements(p_enrichments)
    loop
        if jsonb_typeof(enrichment) <> 'object'
           or coalesce(enrichment->>'index', '') !~ '^[0-9]+$'
           or jsonb_typeof(enrichment->'nutrients') <> 'object' then
            continue;
        end if;
        ingredient_index := (enrichment->>'index')::integer;
        if ingredient_index >= jsonb_array_length(recipe_ingredients) then
            continue;
        end if;
        ingredient_value := recipe_ingredients->ingredient_index;
        if ingredient_value->>'name' is distinct from enrichment->>'name' then
            continue;
        end if;

        updated_ingredient := ingredient_value;
        for nutrient_key, nutrient_value in
            select key, value from jsonb_each(enrichment->'nutrients')
        loop
            if nutrient_key not in (
                'ironPer100g', 'calciumPer100g', 'magnesiumPer100g',
                'zincPer100g', 'seleniumPer100g', 'folatePer100g',
                'vitaminCPer100g', 'vitaminB12Per100g', 'fiberPer100g'
            )
               or updated_ingredient ? nutrient_key
               or coalesce(updated_ingredient->'unavailableMicronutrients', '[]'::jsonb) ? nutrient_key
               or jsonb_typeof(nutrient_value) <> 'number' then
                continue;
            end if;
            if (nutrient_value #>> '{}')::numeric < 0 then
                continue;
            end if;
            updated_ingredient := jsonb_set(
                updated_ingredient,
                array[nutrient_key],
                nutrient_value,
                true
            );
        end loop;

        if updated_ingredient is distinct from ingredient_value then
            recipe_ingredients := jsonb_set(
                recipe_ingredients,
                array[ingredient_index::text],
                updated_ingredient
            );
            changed := true;
        end if;
    end loop;

    if changed then
        update public.recipes
        set ingredients = recipe_ingredients,
            updated_at = now()
        where id = p_recipe_id and user_id = (select auth.uid());
    end if;

    return recipe_ingredients;
end;
$$;

revoke all on function public.fill_recipe_nutrition(uuid, jsonb) from public;
grant execute on function public.fill_recipe_nutrition(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
