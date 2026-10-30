export default function Brand({ className }: { className: string }) {
    return (
        <div className={className}>
            <span className="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 36 36" focusable="false">
                    <path
                        fill="#628f64"
                        d="M17 13C8 13 7 8 8 5c6-1 10 2 9 8Z"
                    />
                    <path
                        fill="#eea66f"
                        d="M18 13C17 5 22 2 28 3c0 7-4 11-10 10Z"
                    />
                    <path
                        fill="#ff6552"
                        d="M2 15h32c-1 10-8 18-16 18S3 25 2 15Z"
                    />
                    <path
                        fill="#ff8c6f"
                        d="M3 15h9c-1 8 2 14 7 18C10 33 4 25 3 15Z"
                    />
                </svg>
            </span>
            <span className="brand-name">Meal Maker</span>
        </div>
    );
}
