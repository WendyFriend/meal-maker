/**
 * The plan meal is gone, usually deleted on another device while this one
 * still showed it. Kept apart from journalService so mocks of the service
 * still share this class.
 */
export class MissingJournalEntryError extends Error {
    constructor() {
        super('This meal no longer exists.');
        this.name = 'MissingJournalEntryError';
    }
}
