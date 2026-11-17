// Validates and cleans the model's JSON. Pure and fully testable with fixtures.

import { normalizePhrase } from '../core/duplicates';
import { isPhraseCategory, type PhraseDraft } from '../core/types';
import { ANALYSIS_STATUSES, MAX_SUGGESTIONS, type AnalysisStatus, type RawAnalysis, type RawSuggestion } from './schema';

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const STRING_FIELDS = ['phrase', 'originalText', 'turkishMeaning', 'explanation', 'sourceSentence'] as const;

function checkSuggestion(value: unknown, path: string): RawSuggestion {
	if (!isRecord(value)) throw new InvalidAnalysisError(`${path}: expected an object`);
	for (const field of STRING_FIELDS) {
		if (typeof value[field] !== 'string') throw new InvalidAnalysisError(`${path}.${field}: expected a string`);
	}
	if (!isPhraseCategory(value['category'])) throw new InvalidAnalysisError(`${path}.category: invalid value`);
	if (typeof value['highlighted'] !== 'boolean') throw new InvalidAnalysisError(`${path}.highlighted: expected a boolean`);
	return value as unknown as RawSuggestion;
}

/** Structural check matching ANALYSIS_JSON_SCHEMA (extra suggestions are trimmed later, not rejected). */
function checkAnalysis(value: unknown): RawAnalysis {
	if (!isRecord(value)) throw new InvalidAnalysisError('Response does not match the schema (expected an object)');
	const status = value['status'];
	if (typeof status !== 'string' || !(ANALYSIS_STATUSES as readonly string[]).includes(status)) {
		throw new InvalidAnalysisError('Response does not match the schema (status: invalid value)');
	}
	const suggestions = value['suggestions'];
	if (!Array.isArray(suggestions)) throw new InvalidAnalysisError('Response does not match the schema (suggestions: expected an array)');
	return {
		status: status as AnalysisStatus,
		suggestions: suggestions.map((item, i) => checkSuggestion(item, `suggestions.${i}`)),
	};
}

/** Parses the model's text output. Throws InvalidAnalysisError for anything malformed. */
export function parseAnalysisText(text: string): AnalysisResult {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new InvalidAnalysisError('Response is not valid JSON');
	}

	const parsed = checkAnalysis(json);

	const seen = new Set<string>();
	const suggestions: Suggestion[] = [];
	for (const item of parsed.suggestions) {
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
	return { status: parsed.status, suggestions: ordered.slice(0, MAX_SUGGESTIONS) };
}
