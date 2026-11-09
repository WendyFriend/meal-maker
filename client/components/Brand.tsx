import mealMakerLogo from '../assets/icons/meal-maker-logo.svg';

export default function Brand({ className }: { className: string }) {
    return (
        <div className={className}>
            <span className="brand-mark" aria-hidden="true">
                <img src={mealMakerLogo} alt="" />
            </span>
            <span className="brand-name">Meal Maker</span>
        </div>
    );
}
