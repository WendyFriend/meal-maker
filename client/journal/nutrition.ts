export function localDateValue(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function localDayBounds(day: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
        throw new Error('Choose a valid date.');
    const [year, month, date] = day.split('-').map(Number);
    const start = new Date(year, month - 1, date);
    if (localDateValue(start) !== day) throw new Error('Choose a valid date.');
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
}
