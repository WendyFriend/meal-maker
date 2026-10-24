import { useSyncExternalStore } from 'react';

// Match the meal form's phone and short landscape layouts.
const query = '(max-width: 640px), (max-width: 1000px) and (max-height: 500px)';

function subscribe(onChange: () => void) {
    const media = window.matchMedia(query);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
}

function getSnapshot() {
    return window.matchMedia(query).matches;
}

export function useMobilePicker() {
    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
