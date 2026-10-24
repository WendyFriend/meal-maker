type PopoverPositionOptions = {
    width: number;
    maxHeight: number;
    gap: number;
    margin?: number;
};

/** Keep a fixed popover beside its trigger and within the viewport. */
export function positionPopover(
    panel: HTMLElement,
    trigger: HTMLElement,
    { width, maxHeight, gap, margin = 12 }: PopoverPositionOptions,
) {
    const anchor = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelWidth = Math.min(width, Math.max(0, viewportWidth - margin * 2));

    panel.style.width = `${panelWidth}px`;
    panel.style.maxHeight = `${Math.min(maxHeight, Math.max(0, viewportHeight - margin * 2))}px`;

    const desiredHeight = panel.getBoundingClientRect().height;
    const below = Math.max(0, viewportHeight - anchor.bottom - gap - margin);
    const above = Math.max(0, anchor.top - gap - margin);
    const openBelow = below >= desiredHeight || below >= above;

    panel.style.maxHeight = `${Math.min(maxHeight, openBelow ? below : above)}px`;
    const height = panel.getBoundingClientRect().height;
    const top = openBelow ? anchor.bottom + gap : anchor.top - height - gap;
    panel.style.left = `${Math.max(margin, Math.min(anchor.left, viewportWidth - panelWidth - margin))}px`;
    panel.style.top = `${Math.max(margin, Math.min(top, viewportHeight - height - margin))}px`;
}
