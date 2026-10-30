import './LoadingSpinner.css';

/** Decorative spinner; its container supplies the loading text and status. */
export default function LoadingSpinner({
    size = 'medium',
    tone = 'accent',
}: {
    size?: 'small' | 'medium' | 'large';
    tone?: 'accent' | 'inherit';
}) {
    return (
        <span
            className={`loading-spinner loading-spinner-${size} loading-spinner-${tone}`}
            aria-hidden="true"
        />
    );
}
