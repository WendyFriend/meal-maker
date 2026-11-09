import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mockPickerEnvironment } from '../../test/pickerEnvironment';
import MealMakerPreferencesSheet from './MealMakerPreferencesSheet';

beforeEach(() => mockPickerEnvironment());
afterEach(() => vi.unstubAllGlobals());

it('starts with optional goals and saves the no-preference values', async () => {
    const user = userEvent.setup();
    const onCaloriesChange = vi.fn();
    const onProteinChange = vi.fn();
    render(
        <MealMakerPreferencesSheet
            calories={undefined}
            proteinGrams={undefined}
            preferences={[]}
            onCaloriesChange={onCaloriesChange}
            onProteinChange={onProteinChange}
            onPreferencesChange={vi.fn()}
            onClose={vi.fn()}
        />,
    );

    expect(screen.queryByText('Per meal')).not.toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: /Calories\s*No preference/ }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: /Protein\s*No preference/ }),
    ).toBeInTheDocument();

    await user.click(
        screen.getByRole('button', { name: /Calories\s*No preference/ }),
    );
    const calories = screen.getByRole('listbox', { name: 'Calories' });
    expect(
        within(calories).getByRole('option', { name: 'No preference' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
        within(calories).getByRole('option', { name: '0' }),
    ).toBeInTheDocument();
    expect(
        within(calories).getByRole('option', { name: '500' }),
    ).toBeInTheDocument();

    fireEvent.scroll(calories, { target: { scrollTop: 11 * 44 } });
    expect(
        screen.getByRole('button', { name: /Calories\s*500\s*kcal/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onCaloriesChange).toHaveBeenCalledWith(500);
    expect(onProteinChange).toHaveBeenCalledWith(undefined);
});

it('keeps zero calories distinct from no preference and clears a protein goal', async () => {
    const user = userEvent.setup();
    const onCaloriesChange = vi.fn();
    const onProteinChange = vi.fn();
    render(
        <MealMakerPreferencesSheet
            calories={500}
            proteinGrams={100}
            preferences={[]}
            onCaloriesChange={onCaloriesChange}
            onProteinChange={onProteinChange}
            onPreferencesChange={vi.fn()}
            onClose={vi.fn()}
        />,
    );

    await user.click(
        screen.getByRole('button', { name: /Calories\s*500\s*kcal/ }),
    );
    fireEvent.scroll(screen.getByRole('listbox', { name: 'Calories' }), {
        target: { scrollTop: 44 },
    });
    expect(
        screen.getByRole('button', { name: /Calories\s*0\s*kcal/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Protein\s*100\s*g/ }));
    fireEvent.scroll(screen.getByRole('listbox', { name: 'Protein' }), {
        target: { scrollTop: 0 },
    });
    expect(
        screen.getByRole('button', { name: /Protein\s*No preference/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onCaloriesChange).toHaveBeenCalledWith(0);
    expect(onProteinChange).toHaveBeenCalledWith(undefined);
});
