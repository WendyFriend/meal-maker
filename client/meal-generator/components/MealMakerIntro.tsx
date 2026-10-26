const homeSteps = [
    {
        title: '1. Choose ingredients',
        description: 'Use what you have.',
        icon: (
            <svg
                className="intro-carrot-icon"
                viewBox="0 0 64 64"
                aria-hidden="true"
                focusable="false"
            >
                <path
                    className="intro-carrot-leaves"
                    d="M37 21c-2-11 1-18 5-17 5 2-1 12-5 17Zm3 1c8-9 16-10 16-5-1 5-10 6-16 5Z"
                />
                <path
                    className="intro-carrot-leaves intro-carrot-leaf-light"
                    d="M39 21C42 9 50 3 53 7c3 5-6 11-14 14Z"
                />
                <path
                    className="intro-carrot-body"
                    d="M38 23c-7-5-13-1-17 8L11 56c-1 2 0 3 2 1l25-20c7-5 8-9 0-14Z"
                />
                <path d="m26 28 6 4m-11 5 5 3m4 1 5 3m-18 5 4 2" />
            </svg>
        ),
    },
    {
        title: '2. Set a calorie goal',
        description: 'Optional — make it yours.',
        icon: (
            <svg
                className="intro-target-icon"
                viewBox="0 0 64 64"
                aria-hidden="true"
                focusable="false"
            >
                <path d="M29 14a21 21 0 1 0 21 21" />
                <path d="M29 24a11 11 0 1 0 11 11" />
                <path d="m29 35 20-20M49 6v9h9" />
            </svg>
        ),
    },
    {
        title: '3. Create your meal',
        description: 'Recipe, cooking steps and nutrition.',
        icon: (
            <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                <path
                    className="intro-chef-hat"
                    d="M13 16a9 9 0 1 0-2 17v12h26V33a9 9 0 1 0-2-17 11 11 0 0 0-22 0Z"
                />
                <path d="M11 38h26M18 29v9m12-9v9" />
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
                    <span>
                        A <em className="intro-accent-word">delicious</em> meal.
                    </span>
                    <svg
                        className="intro-heading-strokes"
                        viewBox="0 0 28 38"
                        aria-hidden="true"
                    >
                        <path d="m9 17 6-14m-1 24 11-6" />
                    </svg>
                </h1>
                <p className="intro-description">
                    A personalised recipe that works for you. Healthy, simple, and delicious.
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
