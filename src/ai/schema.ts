import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { PHRASE_CATEGORIES } from '../core/types';

export const MAX_SUGGESTIONS = 5;

export const ANALYSIS_STATUSES = ['highlighted', 'unmarked', 'ambiguous', 'no_english_text'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const SuggestionSchema = z.object({
	phrase: z.string().describe('Dictionary/canonical form, e.g. "put off" for "putting off".'),
	originalText: z.string().describe('The expression exactly as it appears in the screenshot.'),
	category: z.enum(PHRASE_CATEGORIES),
	turkishMeaning: z.string().describe('Short Turkish meaning that fits this context.'),
	explanation: z.string().describe('One or two short Turkish sentences explaining usage in this context.'),
	sourceSentence: z
		.string()
		.describe('The full sentence containing the expression, copied verbatim from the screenshot; empty string if not readable.'),
	highlighted: z.boolean().describe('True only if the expression is visibly highlighted, underlined, or selected.'),
});

export const AnalysisSchema = z.object({
	status: z.enum(ANALYSIS_STATUSES),
	suggestions: z.array(SuggestionSchema).max(MAX_SUGGESTIONS),
});

/**
 * Schema used to validate responses. The API does not enforce `maxItems`
 * (the SDK turns it into a description hint), so extra items are trimmed
 * client-side instead of rejecting the whole response.
 */
export const AnalysisResponseSchema = AnalysisSchema.extend({
	suggestions: z.array(SuggestionSchema),
});

export type RawAnalysis = z.infer<typeof AnalysisResponseSchema>;

/** JSON schema for the Messages API `output_config.format` (constrained decoding). */
export const ANALYSIS_OUTPUT_FORMAT = (() => {
	const format = zodOutputFormat(AnalysisSchema);
	return { type: format.type, schema: format.schema };
})();
