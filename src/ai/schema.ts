// Response schema for the Messages API structured output (constrained decoding),
// plus the matching TypeScript types. Hand-written JSON Schema keeps the bundle
// small; ai/validate.ts re-checks every response against the same rules.

import { PHRASE_CATEGORIES, type PhraseCategory } from '../core/types';

/** Upper limit only: the prompt asks for quality over quantity, never filler. */
export const MAX_SUGGESTIONS = 8;

export const ANALYSIS_STATUSES = ['highlighted', 'unmarked', 'ambiguous', 'no_english_text'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export interface RawSuggestion {
	phrase: string;
	originalText: string;
	category: PhraseCategory;
	turkishMeaning: string;
	explanation: string;
	usage: string;
	contextNote: string;
	sourceSentence: string;
	sourceTranslation: string;
	exampleSentence: string;
	exampleTranslation: string;
	highlighted: boolean;
}

export interface RawAnalysis {
	status: AnalysisStatus;
	suggestions: RawSuggestion[];
}

const SUGGESTION_JSON_SCHEMA = {
	type: 'object',
	properties: {
		phrase: { type: 'string', description: 'Dictionary form without inflection, e.g. "put off" for "putting off", "be meant to" for "were meant to".' },
		originalText: {
			type: 'string',
			description: 'The expression exactly as written in the screenshot, with its inflection; it appears in sourceSentence.',
		},
		category: { type: 'string', enum: [...PHRASE_CATEGORIES] },
		turkishMeaning: {
			type: 'string',
			description: 'Natural Turkish equivalent of the meaning in this sentence (usually 1-4 words, verbs in -mak/-mek form); not a word-by-word translation.',
		},
		explanation: {
			type: 'string',
			description: 'One or two Turkish sentences: what the expression means in this specific sentence and why. No generic dictionary definition.',
		},
		usage: {
			type: 'string',
			description: 'One or two Turkish sentences on how the expression works: its pattern, what follows it, tense or register.',
		},
		contextNote: {
			type: 'string',
			description: 'Empty string when the meaning is clear; otherwise one Turkish sentence saying why the visible context is ambiguous and naming the possible readings.',
		},
		sourceSentence: {
			type: 'string',
			description: 'The full sentence containing the expression, copied verbatim from the screenshot; empty string if not readable.',
		},
		sourceTranslation: {
			type: 'string',
			description: 'Natural Turkish translation of sourceSentence; empty string when sourceSentence is empty.',
		},
		exampleSentence: {
			type: 'string',
			description: 'One new, realistic English sentence using the expression in the same sense (never the screenshot text); empty string if it adds nothing.',
		},
		exampleTranslation: { type: 'string', description: 'Natural Turkish translation of exampleSentence; empty string when there is no example.' },
		highlighted: { type: 'boolean', description: 'True only if the expression is visibly highlighted, underlined, or selected.' },
	},
	required: [
		'phrase',
		'originalText',
		'category',
		'turkishMeaning',
		'explanation',
		'usage',
		'contextNote',
		'sourceSentence',
		'sourceTranslation',
		'exampleSentence',
		'exampleTranslation',
		'highlighted',
	],
	additionalProperties: false,
} as const;

export const ANALYSIS_JSON_SCHEMA = {
	type: 'object',
	properties: {
		status: { type: 'string', enum: [...ANALYSIS_STATUSES] },
		suggestions: {
			type: 'array',
			items: SUGGESTION_JSON_SCHEMA,
			description: `At most ${MAX_SUGGESTIONS} items, most useful first. Fewer is fine; never add filler.`,
		},
	},
	required: ['status', 'suggestions'],
	additionalProperties: false,
} as const;

/** `output_config.format` for the Messages API. */
export const ANALYSIS_OUTPUT_FORMAT = { type: 'json_schema' as const, schema: ANALYSIS_JSON_SCHEMA };
