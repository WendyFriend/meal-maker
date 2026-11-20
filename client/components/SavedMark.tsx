import './SavedMark.css';

/**
 * A filled star: this ingredient is in My Ingredients. The same yellow ★ the
 * sheets use for "saved", labelled for screen readers so the meaning never
 * rests on colour or shape alone.
 *
 * `trailing` puts it in a fixed slot at the end of a list row (as Apple
 * Music marks favourites), so stars line up down the list; `leading` puts
 * it before the name.
 */
export default function SavedMark({
    trailing = false,
    leading = false,
}: {
    trailing?: boolean;
    leading?: boolean;
}) {
    return (
        <svg
            className={`saved-mark${trailing ? ' saved-mark-trailing' : ''}${leading ? ' saved-mark-leading' : ''}`}
            viewBox="0 0 24 24"
            role="img"
            aria-label="Saved"
        >
            <path d="m12 2.5 2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55-4.76-4.64 6.58-.96L12 2.5Z" />
        </svg>
    );
}

/**
 * A name led by the ★ (Meal Maker chips): the leading slot, as chips put
 * icons there and keep the end for the remove ✕. Kept on the first word's
 * line when the name wraps.
 */
export function SavedName({ name, saved }: { name: string; saved: boolean }) {
    if (!saved) return <>{name}</>;
    const split = name.indexOf(' ') + 1 || name.length;
    return (
        <>
            <span className="saved-mark-nowrap">
                <SavedMark leading />
                {name.slice(0, split)}
            </span>
            {name.slice(split)}
        </>
    );
}
