import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModalDialog } from './useModalDialog';
import { mockPickerEnvironment } from '../test/pickerEnvironment';

function Fixture() {
    const ref = useModalDialog();
    return <dialog ref={ref} tabIndex={-1} aria-label="Details" />;
}
beforeEach(() => {
    mockPickerEnvironment();
});
afterEach(() => {
    document.body.style.overflow = '';
    vi.unstubAllGlobals();
});
describe('native modal lifecycle', () => {
    it('opens and focuses the dialog, locks page scrolling, then restores previous styles', () => {
        const trigger = document.createElement('button');
        document.body.append(trigger);
        trigger.focus();
        document.body.style.overflow = 'scroll';
        const scroller = document.createElement('div');
        scroller.className = 'page-transition';
        scroller.style.overflow = 'auto';
        document.body.append(scroller);
        const { unmount } = render(<Fixture />);
        expect(screen.getByRole('dialog', { name: 'Details' })).toHaveFocus();
        expect(document.body.style.overflow).toBe('hidden');
        expect(scroller.style.overflow).toBe('hidden');
        unmount();
        expect(document.body.style.overflow).toBe('scroll');
        expect(scroller.style.overflow).toBe('auto');
        expect(trigger).toHaveFocus();
        trigger.remove();
        scroller.remove();
    });
    it('balances setup and cleanup during Strict Mode remounts', () => {
        const { unmount } = render(
            <StrictMode>
                <Fixture />
            </StrictMode>,
        );
        const panel = screen.getByRole('dialog', { name: 'Details' });
        expect(panel).toHaveAttribute('open');
        expect(document.body.style.overflow).toBe('hidden');
        unmount();
        expect(document.body.style.overflow).toBe('');
        expect(panel).not.toHaveAttribute('open');
    });
});
