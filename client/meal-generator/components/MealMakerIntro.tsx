import mealMakerImage from '../../assets/mealmaker3.jpg';

/*
 * Compact "how it works" steps shown in the homepage intro column.
 */
const homeSteps = [
    {
        title: 'Choose ingredients',
        icon: (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M18.5 4.5c-8.5 0-13 4-13 10a5 5 0 0 0 5 5c6 0 10-4.5 8-15Z" />
                <path d="M5.5 20c2-4.5 5-7.5 9.5-10" />
            </svg>
        ),
    },
    {
        title: 'Set a calorie goal',
        icon: (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="11" cy="13" r="8" />
                <circle cx="11" cy="13" r="4" />
                <path d="m11 13 9-10m-4 0h4v4" />
            </svg>
        ),
    },
    {
        title: 'Create a recipe',
        icon: (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 15a4 4 0 0 1 3-6 5 5 0 0 1 9-2 4 4 0 0 1 4 6 4 4 0 0 1-2 7H6a4 4 0 0 1-2-5Z" />
                <path d="M7 16v4m10-4v4" />
            </svg>
        ),
    },
    {
        title: 'Cook and enjoy',
        icon: (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 3v8m3-8v8m3-8v8M8 11v10m10-18v18" />
                <path d="M16 3c4 2 4 7 2 10" />
            </svg>
        ),
    },
] as const;

export function MealMakerIntro() {
    return (
        <div className="meal-maker-intro">
            <h2>
                <span>Turn your ingredients</span>{' '}
                <span>
                    into a <em className="intro-highlight">delicious meal.</em>
                </span>
            </h2>
            <p className="intro-description">
                <span className="intro-description-full">
                    Tell us what you have, set a calorie goal if you like, and
                    get a personalised recipe with ingredient amounts, cooking
                    instructions and nutrition breakdown.
                </span>
                <span className="intro-description-compact">
                    Use what you have. Set a calorie goal, and get a
                    personalised recipe with nutrition and cooking steps.
                </span>
            </p>
            <div className="intro-art" aria-hidden="true">
                <img
                    className="intro-art-produce"
                    src={mealMakerImage}
                    alt=""
                />
                <span className="intro-art-note">
                    <span className="intro-note-line">Good food.</span>
                    <span className="intro-note-line">Made easy.</span>
                    <svg
                        className="intro-note-doodles"
                        viewBox="0 0 150 76"
                        fill="none"
                        aria-hidden="true"
                    >
                        <path
                            className="intro-note-mobile-strokes"
                            d="M5 8 0 0M-1 18l-8-4"
                        />
                        <path
                            className="intro-note-top-right-stroke"
                            d="m124 12 5-8"
                        />
                        <path
                            className="intro-note-heart"
                            d="M137 32c-5-7-11 0-6 5l6 6 6-7c4-6-3-10-6-4Z"
                        />
                        <path
                            className="intro-note-right-strokes"
                            d="m134 58 8 6m-12 3 5 5"
                        />
                    </svg>
                </span>
            </div>
        </div>
    );
}

type MealMakerStepsProps = {
    hasIngredients?: boolean;
    hasCalorieGoal?: boolean;
    isGenerating?: boolean;
    hasMeal?: boolean;
};

type StepState = 'done' | 'active' | 'idle';

export function MealMakerSteps({
    hasIngredients = false,
    hasCalorieGoal = false,
    isGenerating = false,
    hasMeal = false,
}: MealMakerStepsProps) {
    // Step 2 is optional, so it is only ever done or neutral.
    const states: StepState[] = [
        hasIngredients ? 'done' : 'idle',
        hasCalorieGoal ? 'done' : 'idle',
        isGenerating ? 'active' : hasMeal ? 'done' : 'idle',
        hasMeal ? 'done' : 'idle',
    ];

    return (
        <ol className="intro-steps">
            {homeSteps.map((step, index) => {
                const state = states[index];
                return (
                    <li
                        className={`intro-step intro-step-${state}`}
                        key={step.title}
                        aria-current={state === 'active' ? 'step' : undefined}
                    >
                        <span className="intro-step-icon" aria-hidden="true">
                            {state === 'done' ? (
                                <svg
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                    focusable="false"
                                >
                                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                                </svg>
                            ) : (
                                step.icon
                            )}
                        </span>
                        <span className="intro-step-copy">
                            <strong>
                                {index + 1}. {step.title}
                                {state === 'done' && (
                                    <span className="visually-hidden">
                                        {' '}
                                        (done)
                                    </span>
                                )}
                            </strong>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}
