type PopoverPositionOptions = {
    width: number;
    maxHeight: number;
    gap: number;
    margin?: number;
    preferAbove?: boolean;
};

/** Keep a fixed popover beside its trigger and within the viewport. */
export function positionPopover(
    panel: HTMLElement,
    trigger: HTMLElement,
    {
        width,
        maxHeight,
        gap,
        margin = 12,
        preferAbove = false,
    }: PopoverPositionOptions,
) {
    const anchor = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const panelWidth = Math.min(width, Math.max(0, viewportWidth - margin * 2));

    panel.style.width = `${panelWidth}px`;
    panel.style.maxHeight = `${Math.min(maxHeight, Math.max(0, viewportHeight - margin * 2))}px`;

    const desiredHeight = panel.getBoundingClientRect().height;
    const below = Math.max(0, viewportBottom - anchor.bottom - gap - margin);
    const above = Math.max(0, anchor.top - viewportTop - gap - margin);
    const openBelow =
        preferAbove && above >= Math.min(desiredHeight, 120)
            ? false
            : below >= desiredHeight || below >= above;

    panel.style.maxHeight = `${Math.min(maxHeight, openBelow ? below : above)}px`;
    const height = panel.getBoundingClientRect().height;
    const top = openBelow ? anchor.bottom + gap : anchor.top - height - gap;
    panel.style.left = `${Math.max(viewportLeft + margin, Math.min(anchor.left, viewportRight - panelWidth - margin))}px`;
    panel.style.top = `${Math.max(viewportTop + margin, Math.min(top, viewportBottom - height - margin))}px`;
}
