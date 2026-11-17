// Validates and cleans the model's JSON. Pure and fully testable with fixtures.

import { normalizePhrase } from '../core/duplicates';
import type { PhraseDraft } from '../core/types';
import { AnalysisResponseSchema, MAX_SUGGESTIONS, type AnalysisStatus } from './schema';

export interface Suggestion extends PhraseDraft {
	highlighted: boolean;
	/** The original wording could not be found in the quoted source sentence. */
	sourceMismatch: boolean;
}

export interface AnalysisResult {
	status: AnalysisStatus;
	suggestions: Suggestion[];
}

export class InvalidAnalysisError extends Error {
	constructor(detail: string) {
		super(detail);
		this.name = 'InvalidAnalysisError';
	}
}

function forMatching(text: string): string {
	return text
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[‘’‛′`´]/g, "'")
		.replace(/[“”„″]/g, '"')
		.replace(/\s+/g, ' ')
		.trim();
}

/** True when `original` cannot be found inside a non-empty `sentence`. */
export function isSourceMismatch(original: string, sentence: string): boolean {
	const needle = forMatching(original);
	const haystack = forMatching(sentence);
	if (needle === '' || haystack === '') return false;
	return !haystack.includes(needle);
}

const clean = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Parses the model's text output. Throws InvalidAnalysisError for anything malformed. */
export function parseAnalysisText(text: string): AnalysisResult {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new InvalidAnalysisError('Response is not valid JSON');
	}

	const parsed = AnalysisResponseSchema.safeParse(json);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		throw new InvalidAnalysisError(`Response does not match the schema${issue ? ` (${issue.path.join('.')}: ${issue.message})` : ''}`);
	}

	const seen = new Set<string>();
	const suggestions: Suggestion[] = [];
	for (const item of parsed.data.suggestions) {
		const phrase = clean(item.phrase);
		const turkishMeaning = clean(item.turkishMeaning);
		if (phrase === '' || turkishMeaning === '') continue;
		const key = normalizePhrase(phrase);
		if (key === '' || seen.has(key)) continue;
		seen.add(key);

		const originalText = clean(item.originalText);
		const sourceSentence = clean(item.sourceSentence);
		suggestions.push({
			phrase,
			originalText,
			category: item.category,
			turkishMeaning,
			explanation: clean(item.explanation),
			sourceSentence,
			highlighted: item.highlighted,
			sourceMismatch: isSourceMismatch(originalText, sourceSentence),
		});
	}

	// Highlighted expressions first; otherwise keep the model's order. Then cap.
	const ordered = [...suggestions.filter((s) => s.highlighted), ...suggestions.filter((s) => !s.highlighted)];
	return { status: parsed.data.status, suggestions: ordered.slice(0, MAX_SUGGESTIONS) };
}
