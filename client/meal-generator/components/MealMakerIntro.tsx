import Brand from '../../components/Brand';
import spinachPhoto from '../../assets/ingredients/veggies-spinach.webp';
import chickpeasPhoto from '../../assets/ingredients/protein-chickpeas.webp';
import oatsPhoto from '../../assets/ingredients/grains-oats.webp';
import walnutsPhoto from '../../assets/ingredients/nuts-walnuts.png';

const introPhotos = [spinachPhoto, chickpeasPhoto, oatsPhoto, walnutsPhoto];

export function MealMakerIntro({
    onSignIn,
    onSignUp,
    onTryMealMaker,
}: {
    onSignIn: () => void;
    onSignUp: () => void;
    onTryMealMaker: () => void;
}) {
    return (
        <section
            className="meal-maker-introduction guest-landing"
            tabIndex={-1}
            aria-labelledby="meal-maker-heading"
        >
            <div className="guest-landing-content">
                <Brand className="guest-landing-logo" />
                <div className="meal-maker-intro">
                    <h1 id="meal-maker-heading">Meal Maker</h1>
                    <p className="intro-description">
                        Supporting a healthy, well-balanced plant-based journey.
                    </p>
                </div>

                <div className="guest-landing-photos" aria-hidden="true">
                    {introPhotos.map((photo) => (
                        <img key={photo} src={photo} alt="" />
                    ))}
                </div>

                <button
                    className="meal-maker-get-started"
                    type="button"
                    onClick={onTryMealMaker}
                >
                    Try it out <span aria-hidden="true">↓</span>
                </button>
                <p className="guest-landing-note">No account needed</p>

                <div className="guest-landing-account-actions">
                    <button
                        type="button"
                        className="guest-landing-secondary"
                        onClick={onSignIn}
                    >
                        Log in
                    </button>
                    <button
                        type="button"
                        className="guest-landing-secondary"
                        onClick={onSignUp}
                    >
                        Sign up
                    </button>
                </div>
            </div>
        </section>
    );
}
