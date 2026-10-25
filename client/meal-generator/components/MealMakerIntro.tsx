const homeSteps = [
    {
        title: 'Choose ingredients',
        description: 'Use what you have.',
        icon: (
            <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                <path
                    className="intro-carrot-leaves"
                    d="M29 16c-1-9 2-13 5-12 3 2 0 8-5 12Zm1 1c6-8 11-9 12-5 0 4-6 6-12 5Zm-3-2c-5-5-6-10-3-11 4-1 5 5 3 11Z"
                />
                <path d="M27 15c-6-4-11 1-14 8L5 42l19-11c7-4 10-10 3-16Z" />
                <path d="m17 20 5 4m-10 4 4 3m5-1 3 2M8 36l3 2" />
            </svg>
        ),
    },
    {
        title: 'Set a calorie goal',
        description: 'Optional — make it yours.',
        icon: (
            <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                <circle cx="22" cy="26" r="17" />
                <circle cx="22" cy="26" r="10" />
                <path d="m22 26 20-21m-8 1 8-1-1 8" />
            </svg>
        ),
    },
    {
        title: 'Create your meal',
        description: 'Recipe, cooking steps and nutrition.',
        icon: (
            <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                <path d="M12 30a9 9 0 1 1 4-17 9 9 0 0 1 17-1 9 9 0 1 1 4 18v13H12Z" />
                <path d="M12 36h25M19 24v12m10-12v12" />
            </svg>
        ),
    },
] as const;

export function MealMakerIntro({ onGetStarted }: { onGetStarted: () => void }) {
    return (
        <section
            className="meal-maker-introduction"
            aria-labelledby="meal-maker-heading"
        >
            <div className="meal-maker-intro">
                <h1 id="meal-maker-heading">
                    <span>Your ingredients.</span>
                    <span>A delicious meal.</span>
                    <svg
                        className="intro-heading-strokes"
                        viewBox="0 0 28 38"
                        aria-hidden="true"
                    >
                        <path d="m9 17 6-14m-1 24 11-6" />
                    </svg>
                </h1>
                <p className="intro-description">
                    A personalised recipe that works for you, with simple
                    guidance.
                </p>
            </div>
            <ol className="intro-steps">
                {homeSteps.map(({ title, description, icon }) => (
                    <li className="intro-step" key={title}>
                        <span className="intro-step-icon">{icon}</span>
                        <div className="intro-step-copy">
                            <h2>{title}</h2>
                            <p>{description}</p>
                        </div>
                    </li>
                ))}
            </ol>
            <button
                className="meal-maker-get-started"
                type="button"
                onClick={onGetStarted}
            >
                Get started <span aria-hidden="true">↓</span>
            </button>
        </section>
    );
}
