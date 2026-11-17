export const PHRASE_CATEGORIES = ['phrasal_verb', 'idiom', 'collocation', 'expression'] as const;
export type PhraseCategory = (typeof PHRASE_CATEGORIES)[number];

export function isPhraseCategory(value: unknown): value is PhraseCategory {
	return typeof value === 'string' && (PHRASE_CATEGORIES as readonly string[]).includes(value);
}

/** The fields a user reviews and edits before saving one phrase. */
export interface PhraseDraft {
	/** Dictionary/canonical form, e.g. "put off". */
	phrase: string;
	/** Exact wording in the screenshot, e.g. "putting off". */
	originalText: string;
	category: PhraseCategory;
	turkishMeaning: string;
	explanation: string;
	/** Verbatim sentence from the screenshot; empty when unreadable. */
	sourceSentence: string;
}

/** A known phrase already stored in the vault (from a note's frontmatter or an index entry). */
export interface KnownPhrase {
	number: number;
	phrase: string;
	/** Turkish meaning when it is known (index-only entries have none). */
	meaning: string | null;
}
