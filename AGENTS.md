# Project map

Read the relevant entry points below first; avoid repeatedly reading the whole app for a focused change.

| Area                                           | Entry points                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Navigation, selected pages, browser back       | `client/App.tsx` for page state; `client/navigation/pages.ts`, `PageHeader.tsx`, and `NavigationPanel.tsx` for routes and navigation UI                                               |
| Theme tokens and typography                    | `client/index.css`                                                                                                   |
| Main meal form and intro layout                | `client/meal-generator/MealMaker.css`, `client/meal-generator/components/MealMakerIntro.tsx`                         |
| Ingredient search and quick add                | `client/meal-generator/components/IngredientInput.tsx`, `QuickAddIngredientPicker.tsx` in the same directory         |
| Meal result composition                        | `client/meal-generator/components/MealResult.tsx`                                                                 |
| Shared ingredient nutrition content            | `client/meal-generator/components/IngredientNutritionContent.tsx` and `.css`                                         |
| Sheet container and full detail page           | `client/meal-generator/components/IngredientNutritionSheet.tsx` and `.css`; `client/IngredientDetail.tsx`, `IngredientPage.tsx`, and `IngredientDetail.css` |
| Vitamins/minerals rows and meal totals         | `client/meal-generator/components/MicronutrientList.tsx`, `MealMicronutrients.tsx`                                   |
| Nutrient explanations and popovers             | `client/meal-generator/components/micronutrientInformation.ts`, `MicronutrientContributors.tsx`, `NutritionInfo.tsx` |
| Micronutrient fetching and cache               | `client/hooks/useMicronutrientLookup.ts`, `client/services/micronutrientService.ts`                                  |
| My Ingredients list                            | `client/MyIngredients.tsx`; shared selection logic in `client/hooks/useCollectionSelection.ts` and controls in `client/components/CollectionSelection.tsx`                                                                                |
| My Meals list                                 | `client/MyMeals.tsx`; collection styles shared with My Ingredients in `client/components/SavedCollection.css` |
| My Journal and meal logging                   | `client/MyJournal.tsx`, `client/journal/`, and `client/services/journalService.ts` |
| Login and auth loading                         | `client/auth/Login.tsx`, `AuthLoading.tsx`; provider in `AuthContext.tsx`, hook in `useAuth.ts`, shared context in `context.ts`                                                         |
| Shared logo                                    | `client/components/Brand.tsx`                                                                                        |
| Generation prompt and response enrichment      | `server/meal-generator/algorithms/generateMealOllama.ts`                                                             |
| USDA matching and nutrient mapping             | `server/nutrition/usda/selectFood.ts`, `mapper.ts`, `client.ts`                                                      |
| Nutrition contracts and preparation references | `shared/types/types.ts`, `shared/micronutrients.ts`, `shared/ingredientPreparation.ts`                               |
| API entry points                               | `api/` for Vercel; `server/server.ts` for local development                                                          |

# Working conventions

- My Journal uses `client/MyJournal.tsx`, `client/journal/`, and `client/services/journalService.ts`. Entries snapshot the displayed meal portions and use local-day boundaries, not UTC calendar days. The table and RLS live in `supabase/migrations/202610290001_food_journal.sql`.
- Saved meal edits are handled by `client/RecipeDetail.tsx`; `App.tsx` persists them with `updateRecipe` and passes saved overrides to the mounted My Meals list. Instructions editing lives in the shared `MealInstructions` component.
- My Ingredients and My Meals share `useCollectionSelection` and `CollectionSelection` controls for long press and bulk deletion. Keep both behaviours consistent.
- Add and Edit Ingredient share the form in `client/IngredientPage.tsx`; wrappers handle creating and updating saved records.
- Database schema changes live in `supabase/migrations/`. Custom ingredient preparation tips use the nullable `user_ingredients.preparation_tips` text array; existing rows fall back to shared suggestions.

- Keep header edit and save buttons keyed separately and prevent the edit click’s default action, so a trusted click cannot immediately submit the newly rendered save button.
- Use `client/utils/nutrition.ts` for portion-based macro totals and `useModalDialog` for native modal focus/scroll lifecycle. Date boundaries stay in `client/journal/nutrition.ts`.
- Detail-page edit pencils belong in the app header. Ingredient and meal pages expose `DetailEditorHandle` refs; Meal Details is read-only until header editing starts. Use `SelectIcon` for list selection, reserving the pencil for editing.
- Use `client/components/ActionFeedback.tsx` for brief centered action confirmations; My Day add/remove share this modal and `MyDayIcon` (+/−).
- Use `client/components/ResetIcon.tsx` for reset controls and give icon-only buttons an accessible name and tooltip.
- Use `client/components/LoadingSpinner.tsx` for loading indicators, with status text on the container. It shares styling and reduced-motion support across the app.
- Use `client/components/EditIcon.tsx` and the `edit-icon-button` class for edit controls, matching My Ingredients.
- Reuse existing shared components and tokens. Nutrition content styles belong in `IngredientNutritionContent.css`; sheet positioning belongs in `IngredientNutritionSheet.css`.
- The detail page uses an `h1` and the sheet an `h4`. Keep their shared title typography explicit, including letter spacing, so global heading rules do not make them diverge.
- Nutrition records are per 100g. Meal totals and ingredient contributions multiply by ingredient weight / 100. Missing data is different from a genuine zero.
- Keep ingredient identity and preparation form intact during food matching. Micronutrient lookups are shared and cached between meal and ingredient views.
- The Settings meal generator is sent as `X-Meal-Generator` for generation and ingredient-nutrition requests. Ollama uses USDA lookups; Nutrition Lab uses its API. API-key availability must not select the provider. Keep frontend lookup caches scoped to the selected provider. Nutrition Lab generation can reuse a complete, matching food record via its `match` input.
- Preserve unrelated working changes. The repository may contain substantial uncommitted UI work.

# Focused validation

- CSS/copy changes: targeted Prettier check and `git diff --check`; use a browser preview when layout needs confirmation.
- Client TypeScript: `npm run typecheck:client`.
- Server TypeScript: `npm run typecheck:server`.
- Shared types or cross-layer changes: `npm run typecheck`.
- Changed TS/TSX files: `npm run lint:files -- path/to/file.tsx` (pass explicit paths).
- Production bundling, asset, import or build-config changes: `npm run build:client` or `npm run build` as appropriate.
- `npm run test:client` runs the complete frontend suite; `npm run lint:client` checks all frontend files.
- Run relevant tests for behavior changes when needed. Reuse passing checks until another change or unresolved concern justifies repeating them.

Incremental TypeScript and ESLint caches live under ignored `node_modules/` paths. Development API startup uses `npm run server` without a frontend production build; run the frontend separately with `npm run dev`.
