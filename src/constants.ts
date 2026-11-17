// Vault layout. All paths are relative to the vault root — never absolute.
export const PHRASES_FOLDER = 'Phrases';
export const ATTACHMENTS_FOLDER = 'Attachments';
export const INDEX_PATH = 'INDEX.md';

/** Minimum digits in an entry number: 1 → "0001". Larger numbers simply grow (10000). */
export const NUMBER_WIDTH = 4;

/** How many times to try the next number when a note path unexpectedly exists. */
export const MAX_CREATE_ATTEMPTS = 5;
