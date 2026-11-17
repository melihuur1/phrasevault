export const PHRASE_CATEGORIES = ['phrasal_verb', 'idiom', 'collocation', 'expression', 'grammar_pattern'] as const;
export type PhraseCategory = (typeof PHRASE_CATEGORIES)[number];

export function isPhraseCategory(value: unknown): value is PhraseCategory {
	return typeof value === 'string' && (PHRASE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * The educational details of a phrase: shown under "Ayrıntılar" on the review
 * card and saved in the note body. An empty string means "not applicable".
 */
export interface LearningDetails {
	/** How the expression works: pattern, what follows it, register (Turkish). */
	usage: string;
	/** Empty when the meaning is clear; otherwise why the context is ambiguous (Turkish). */
	contextNote: string;
	/** Natural Turkish translation of the source sentence. */
	sourceTranslation: string;
	/** A generated English example (never text from the screenshot). */
	exampleSentence: string;
	exampleTranslation: string;
}

export const LEARNING_DETAIL_FIELDS = ['usage', 'contextNote', 'sourceTranslation', 'exampleSentence', 'exampleTranslation'] as const satisfies ReadonlyArray<
	keyof LearningDetails
>;

/** The fields a user reviews and edits before saving one phrase. */
export interface PhraseDraft extends LearningDetails {
	/** Dictionary/canonical form, e.g. "put off". */
	phrase: string;
	/** Exact wording in the screenshot, e.g. "putting off". */
	originalText: string;
	category: PhraseCategory;
	turkishMeaning: string;
	/** What the expression means in this sentence (Turkish). */
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
