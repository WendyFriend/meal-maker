import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { IngredientInfo, UserIngredient } from '../../shared/types/types';
import {
    cachedNutritionLabFoods,
    foodSearchKey,
    ingredientFromFoodSearch,
    searchNutritionLabFoods,
    type FoodSearchResult,
} from '../services/foodSearchService';
import IngredientThumbnail from '../meal-generator/components/IngredientThumbnail';
import { commonQuickAddIngredients } from '../meal-generator/components/commonQuickAddIngredients';
import { normalizeIngredientName } from '../utils/Ingredient';
import SlidingSheet from './SlidingSheet';
import CheckIcon from './CheckIcon';
import ActionToast from './ActionToast';
import LoadingSpinner from './LoadingSpinner';
import {
    describeIngredientSaveError,
    type IngredientSaveFailure,
} from '../services/ingredientSaveError';
import './AddIngredientSheet.css';

type Option = 'search' | 'photo' | 'scan' | 'manual';

const options: { id: Option; label: string; symbol: string }[] = [
    { id: 'search', label: 'Search from database', symbol: 'search' },
    { id: 'photo', label: 'Take a photo', symbol: 'camera' },
    { id: 'scan', label: 'Scan nutrition label', symbol: 'scan' },
    { id: 'manual', label: 'Enter manually', symbol: 'edit' },
];

type SearchOption = {
    key: string;
    name: string;
    ingredient?: IngredientInfo;
    food?: FoodSearchResult;
};

const commonFoods: SearchOption[] = Object.values(commonQuickAddIngredients)
    .flat()
    .map((ingredient) => ({
        key: `common:${normalizeIngredientName(ingredient.name)}`,
        name: ingredient.name,
        ingredient,
    }));

function OptionIcon({ symbol }: { symbol: string }) {
    const path = {
        search: (
            <>
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.5 15.5 5 5" />
            </>
        ),
        camera: (
            <>
                <path d="M3 8h4l2-3h6l2 3h4v11H3z" />
                <circle cx="12" cy="13.5" r="3.2" />
            </>
        ),
        scan: (
            <>
                <path d="M4 8V5h4m8 0h4v3M4 16v3h4m8 0h4v-3M8 10h8m-8 4h8" />
            </>
        ),
        edit: (
            <>
                <path d="m4 20 4.4-1 11-11a2 2 0 0 0-2.8-2.8l-11 11L4 20Z" />
                <path d="m14.7 7.3 2.8 2.8" />
            </>
        ),
    }[symbol];
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {path}
        </svg>
    );
}

export default function AddIngredientSheet({
    onClose,
    onManual,
    onPhoto,
    onScan,
    onSearch,
    searching = false,
    savedIngredients,
    onDatabaseAdd,
    onDatabaseRemove,
    onRefreshSavedIngredients,
}: {
    onClose: () => void;
    onManual: () => void;
    onPhoto: () => void;
    onScan: () => void;
    onSearch: () => void;
    searching?: boolean;
    savedIngredients: UserIngredient[];
    onDatabaseAdd: (ingredient: IngredientInfo) => Promise<UserIngredient>;
    onDatabaseRemove: (ingredientId: string) => Promise<void>;
    onRefreshSavedIngredients?: () => void;
}) {
    const [query, setQuery] = useState('');
    const [searchResult, setSearchResult] = useState<{
        key: string;
        foods: FoodSearchResult[];
        error?: string;
    }>();
    const [spinnerQuery, setSpinnerQuery] = useState('');
    const [retryCount, setRetryCount] = useState(0);
    const [pendingByName, setPendingByName] = useState<
        Record<string, 'add' | 'remove'>
    >({});
    const pendingNames = useRef(new Set<string>());
    const [recentlyAdded, setRecentlyAdded] = useState<
        Record<string, UserIngredient>
    >({});
    const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
    const [error, setError] = useState('');
    const [saveFailure, setSaveFailure] = useState<
        | (IngredientSaveFailure & {
              option: SearchOption;
              operation: 'add' | 'remove';
          })
        | undefined
    >();
    const [toast, setToast] = useState<{
        id: number;
        message: string;
        operation: 'add' | 'remove';
    }>();
    const nextToastId = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchKey = foodSearchKey(query);

    useEffect(() => {
        if (!searching || searchKey.length < 2) return;
        const cached = cachedNutritionLabFoods(searchKey);
        if (cached) {
            let active = true;
            queueMicrotask(() => {
                if (active) setSearchResult({ key: searchKey, foods: cached });
            });
            return () => {
                active = false;
            };
        }
        const controller = new AbortController();
        const hasLocalMatches = commonFoods.some(({ name }) =>
            normalizeIngredientName(name).includes(searchKey),
        );
        const spinnerTimer = window.setTimeout(
            () => setSpinnerQuery(searchKey),
            hasLocalMatches ? 500 : 280,
        );
        const timer = window.setTimeout(
            () => {
                void searchNutritionLabFoods(searchKey, controller.signal)
                    .then((foods) => {
                        window.clearTimeout(spinnerTimer);
                        if (!controller.signal.aborted)
                            setSearchResult({ key: searchKey, foods });
                    })
                    .catch(() => {
                        window.clearTimeout(spinnerTimer);
                        if (!controller.signal.aborted)
                            setSearchResult({
                                key: searchKey,
                                foods: [],
                                error: 'Could not load results.',
                            });
                    });
            },
            searchKey.length === 2 ? 420 : 260,
        );
        return () => {
            window.clearTimeout(timer);
            window.clearTimeout(spinnerTimer);
            controller.abort();
        };
    }, [searchKey, searching, retryCount]);
    useEffect(() => {
        if (!searching) return;
        const frame = window.requestAnimationFrame(() =>
            inputRef.current?.focus({ preventScroll: true }),
        );
        return () => window.cancelAnimationFrame(frame);
    }, [searching]);

    function savedRecord(name: string): UserIngredient | undefined {
        const key = normalizeIngredientName(name);
        const local = recentlyAdded[key];
        if (local && !removedIds.has(local.ingredientId)) return local;
        return savedIngredients.find(
            (ingredient) =>
                normalizeIngredientName(ingredient.name) === key &&
                !removedIds.has(ingredient.ingredientId),
        );
    }

    function beginPending(key: string, operation: 'add' | 'remove') {
        if (pendingNames.current.has(key)) return false;
        pendingNames.current.add(key);
        setPendingByName((current) => ({ ...current, [key]: operation }));
        return true;
    }

    function endPending(key: string) {
        pendingNames.current.delete(key);
        setPendingByName((current) => {
            const next = { ...current };
            delete next[key];
            return next;
        });
    }
    const matchingCommonFoods = commonFoods.filter(({ name }) =>
        normalizeIngredientName(name).includes(searchKey),
    );
    const previousMatches =
        searchResult && searchKey.startsWith(searchResult.key)
            ? searchResult.foods.filter(({ name, description }) =>
                  `${name} ${description}`.toLowerCase().includes(searchKey),
              )
            : [];
    const results: SearchOption[] =
        searchKey.length >= 2
            ? searchResult?.key === searchKey && !searchResult.error
                ? searchResult.foods.map((food) => ({
                      key: `food:${food.fdcId}`,
                      name: food.name,
                      food,
                  }))
                : previousMatches.length
                  ? previousMatches.map((food) => ({
                        key: `food:${food.fdcId}`,
                        name: food.name,
                        food,
                    }))
                  : matchingCommonFoods
            : matchingCommonFoods;
    const searchPending =
        searchKey.length >= 2 && searchResult?.key !== searchKey;
    const searchError =
        searchResult?.key === searchKey ? searchResult.error : undefined;

    async function add(option: SearchOption) {
        const { name } = option;
        const key = normalizeIngredientName(name);
        if (savedRecord(name) || !beginPending(key, 'add')) return;
        setError('');
        setSaveFailure(undefined);
        setToast(undefined);
        let ingredient: IngredientInfo;
        try {
            if (option.ingredient) ingredient = option.ingredient;
            else if (option.food)
                ingredient = ingredientFromFoodSearch(option.food);
            else throw new Error('No food selected.');
        } catch (cause) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : 'Nutrition data is unavailable for this food.',
            );
            endPending(key);
            return;
        }
        try {
            const created = await onDatabaseAdd({ ...ingredient, name });
            setRecentlyAdded((current) => ({ ...current, [key]: created }));
            setRemovedIds((current) => {
                const next = new Set(current);
                next.delete(created.ingredientId);
                return next;
            });
            setToast({
                id: ++nextToastId.current,
                message: `${name} added`,
                operation: 'add',
            });
        } catch (cause) {
            setSaveFailure({
                ...describeIngredientSaveError(cause, name),
                option,
                operation: 'add',
            });
        } finally {
            endPending(key);
        }
    }

    async function remove(option: SearchOption, ingredient: UserIngredient) {
        const { name } = option;
        const key = normalizeIngredientName(name);
        if (!beginPending(key, 'remove')) return;
        setError('');
        setSaveFailure(undefined);
        setToast(undefined);
        try {
            await onDatabaseRemove(ingredient.ingredientId);
            setRemovedIds((current) =>
                new Set(current).add(ingredient.ingredientId),
            );
            setRecentlyAdded((current) => {
                const next = { ...current };
                delete next[key];
                return next;
            });
            setToast({
                id: ++nextToastId.current,
                message: `${name} removed`,
                operation: 'remove',
            });
        } catch (cause) {
            setSaveFailure({
                ...describeIngredientSaveError(cause, name, 'remove'),
                option,
                operation: 'remove',
            });
        } finally {
            endPending(key);
        }
    }

    function retryFailure() {
        if (!saveFailure) return;
        if (saveFailure.operation === 'add') {
            void add(saveFailure.option);
            return;
        }
        const record = savedRecord(saveFailure.option.name);
        if (record) void remove(saveFailure.option, record);
    }

    function search(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        inputRef.current?.blur();
    }

    function choose(id: Option) {
        if (id === 'search') onSearch();
        if (id === 'photo') onPhoto();
        if (id === 'scan') onScan();
        if (id === 'manual') onManual();
    }

    return (
        <SlidingSheet
            className={`add-ingredient-sheet${searching ? ' add-ingredient-sheet-search' : ''}`}
            labelledBy="add-ingredient-sheet-title"
            onClose={onClose}
            header={
                <div className="add-ingredient-sheet-heading">
                    <h2 id="add-ingredient-sheet-title">
                        {searching ? 'Search ingredients' : 'Add Ingredient'}
                    </h2>
                    <button
                        type="button"
                        aria-label={
                            searching
                                ? 'Close ingredient search'
                                : 'Close add ingredient'
                        }
                        onClick={onClose}
                    >
                        ×
                    </button>
                </div>
            }
        >
            {searching ? (
                <div className="add-ingredient-database">
                    <form onSubmit={search}>
                        <div className="add-ingredient-database-field">
                            <span
                                className="add-ingredient-database-search-icon"
                                aria-hidden="true"
                            >
                                <OptionIcon symbol="search" />
                            </span>
                            <input
                                ref={inputRef}
                                id="add-ingredient-search"
                                type="search"
                                aria-label="Search ingredients"
                                value={query}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setSpinnerQuery('');
                                    setError('');
                                    setSaveFailure(undefined);
                                }}
                                placeholder="Search ingredients..."
                                autoComplete="off"
                                enterKeyHint="search"
                            />
                            {query && (
                                <button
                                    type="button"
                                    aria-label="Clear search"
                                    onClick={() => {
                                        setQuery('');
                                        setSpinnerQuery('');
                                        inputRef.current?.focus();
                                    }}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    </form>
                    <div
                        className="add-ingredient-database-results"
                        aria-label="Ingredient results"
                    >
                        {results.map((option) => {
                            const { name } = option;
                            const key = normalizeIngredientName(name);
                            const selectedRecord = savedRecord(name);
                            const operation = pendingByName[key];
                            const selected =
                                operation === 'add' ||
                                (operation !== 'remove' &&
                                    Boolean(selectedRecord));
                            const isPending = Boolean(operation);
                            return (
                                <div
                                    className="add-ingredient-database-row"
                                    key={option.key}
                                >
                                    <IngredientThumbnail
                                        name={name}
                                        size={64}
                                        fdcId={
                                            option.food?.fdcId ??
                                            option.ingredient?.nutritionSource
                                                ?.fdcId
                                        }
                                        source="nutrition-lab"
                                    />
                                    <span className="add-ingredient-database-name">
                                        {name}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={
                                            isPending
                                                ? `${operation === 'add' ? 'Adding' : 'Removing'} ${name}`
                                                : selected
                                                  ? `Remove ${name} from My Ingredients`
                                                  : `Add ${name}`
                                        }
                                        aria-pressed={selected}
                                        aria-busy={isPending}
                                        disabled={isPending}
                                        onClick={() => {
                                            if (selectedRecord)
                                                void remove(
                                                    option,
                                                    selectedRecord,
                                                );
                                            else void add(option);
                                        }}
                                        className={
                                            selected
                                                ? 'add-ingredient-database-added'
                                                : ''
                                        }
                                    >
                                        <span
                                            className="add-ingredient-row-symbol"
                                            key={selected ? 'saved' : 'add'}
                                        >
                                            {selected ? <CheckIcon /> : '+'}
                                        </span>
                                        {isPending && (
                                            <LoadingSpinner
                                                size="small"
                                                tone="inherit"
                                            />
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                        {searchPending && spinnerQuery === searchKey && (
                            <div
                                className="add-ingredient-search-loading"
                                role="status"
                                aria-label="Searching ingredients"
                            >
                                <LoadingSpinner size="medium" />
                            </div>
                        )}
                        {!searchPending && searchError && (
                            <div
                                className="add-ingredient-search-retry"
                                role="alert"
                            >
                                <span>{searchError}</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchResult(undefined);
                                        setSpinnerQuery('');
                                        setRetryCount((count) => count + 1);
                                    }}
                                >
                                    Retry
                                </button>
                            </div>
                        )}
                        {!searchPending &&
                            !searchError &&
                            results.length === 0 && (
                                <p className="add-ingredient-search-note">
                                    No foods found. Try another name.
                                </p>
                            )}
                    </div>
                    {error && (
                        <p className="add-ingredient-search-error" role="alert">
                            {error}
                        </p>
                    )}
                    {saveFailure && (
                        <div
                            className="add-ingredient-database-error"
                            role="alert"
                        >
                            <div className="add-ingredient-database-error-main">
                                <span>{saveFailure.message}</span>
                                {saveFailure.action === 'retry' && (
                                    <button
                                        type="button"
                                        onClick={retryFailure}
                                    >
                                        Try again
                                    </button>
                                )}
                                {saveFailure.action === 'refresh' &&
                                    onRefreshSavedIngredients && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onRefreshSavedIngredients();
                                                setSaveFailure(undefined);
                                            }}
                                        >
                                            Refresh list
                                        </button>
                                    )}
                            </div>
                            {saveFailure.diagnostic && (
                                <details>
                                    <summary>Details</summary>
                                    <code>{saveFailure.diagnostic}</code>
                                </details>
                            )}
                        </div>
                    )}
                    {toast && (
                        <ActionToast
                            key={toast.id}
                            message={toast.message}
                            icon={
                                toast.operation === 'add' ? <CheckIcon /> : '−'
                            }
                            onClose={() =>
                                setToast((current) =>
                                    current?.id === toast.id
                                        ? undefined
                                        : current,
                                )
                            }
                        />
                    )}
                </div>
            ) : (
                <div className="add-ingredient-options">
                    {options.map(({ id, label, symbol }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => choose(id)}
                        >
                            <span className="add-ingredient-option-icon">
                                <OptionIcon symbol={symbol} />
                            </span>
                            <span>{label}</span>
                            <span
                                className="add-ingredient-option-chevron"
                                aria-hidden="true"
                            >
                                ›
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </SlidingSheet>
    );
}
