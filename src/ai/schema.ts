// Response schema for the Messages API structured output (constrained decoding),
// plus the matching TypeScript types. Hand-written JSON Schema keeps the bundle
// small; ai/validate.ts re-checks every response against the same rules.

import { PHRASE_CATEGORIES, type PhraseCategory } from '../core/types';

export const MAX_SUGGESTIONS = 5;

export const ANALYSIS_STATUSES = ['highlighted', 'unmarked', 'ambiguous', 'no_english_text'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export interface RawSuggestion {
	phrase: string;
	originalText: string;
	category: PhraseCategory;
	turkishMeaning: string;
	explanation: string;
	sourceSentence: string;
	highlighted: boolean;
}

export interface RawAnalysis {
	status: AnalysisStatus;
	suggestions: RawSuggestion[];
}

const SUGGESTION_JSON_SCHEMA = {
	type: 'object',
	properties: {
		phrase: { type: 'string', description: 'Dictionary/canonical form, e.g. "put off" for "putting off".' },
		originalText: { type: 'string', description: 'The expression exactly as it appears in the screenshot.' },
		category: { type: 'string', enum: [...PHRASE_CATEGORIES] },
		turkishMeaning: { type: 'string', description: 'Short Turkish meaning that fits this context.' },
		explanation: { type: 'string', description: 'One or two short Turkish sentences explaining usage in this context.' },
		sourceSentence: {
			type: 'string',
			description: 'The full sentence containing the expression, copied verbatim from the screenshot; empty string if not readable.',
		},
		highlighted: { type: 'boolean', description: 'True only if the expression is visibly highlighted, underlined, or selected.' },
	},
	required: ['phrase', 'originalText', 'category', 'turkishMeaning', 'explanation', 'sourceSentence', 'highlighted'],
	additionalProperties: false,
} as const;

export const ANALYSIS_JSON_SCHEMA = {
	type: 'object',
	properties: {
		status: { type: 'string', enum: [...ANALYSIS_STATUSES] },
		suggestions: {
			type: 'array',
			items: SUGGESTION_JSON_SCHEMA,
			description: `At most ${MAX_SUGGESTIONS} items.`,
		},
	},
	required: ['status', 'suggestions'],
	additionalProperties: false,
} as const;

/** `output_config.format` for the Messages API. */
export const ANALYSIS_OUTPUT_FORMAT = { type: 'json_schema' as const, schema: ANALYSIS_JSON_SCHEMA };
