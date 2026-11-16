import { screen, within } from '@testing-library/react';

/**
 * An option in the "Doesn't look right?" menu. jsdom never opens native
 * popovers, so the options are queried as hidden elements.
 */
export function fixMenuOption(
    name: string,
    trigger = 'Doesn’t look right?',
): HTMLElement {
    const button = screen.getByRole('button', { name: trigger });
    const menu = document.getElementById(button.getAttribute('popovertarget')!);
    return within(menu!).getByRole('button', { name, hidden: true });
}
