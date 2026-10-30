export default function MyDayIcon({ remove = false }: { remove?: boolean }) {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
        >
            <path d="M5 12h14" />
            {!remove && <path d="M12 5v14" />}
        </svg>
    );
}
