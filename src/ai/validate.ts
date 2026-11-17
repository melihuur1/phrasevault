// Validates and cleans the model's JSON. Pure and fully testable with fixtures.

import { normalizePhrase } from '../core/duplicates';
import { isPhraseCategory, LEARNING_DETAIL_FIELDS, type LearningDetails, type PhraseDraft } from '../core/types';
import { ANALYSIS_STATUSES, MAX_SUGGESTIONS, type AnalysisStatus, type RawAnalysis, type RawSuggestion } from './schema';

export interface Suggestion extends PhraseDraft, LearningDetails {
	highlighted: boolean;
	/** The original wording could not be found in the quoted source sentence. */
	sourceMismatch: boolean;
	/**
	 * The longer suggestion from the same sentence that this one is only a part
	 * of ("pick up" inside "pick up the slack"), or null. Such cards start
	 * unselected; the user decides.
	 */
	partOf: string | null;
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
/** A meaning is a short gloss ("ertelemek"), so a single closing period is dropped; an ellipsis stays. */
const cleanMeaning = (text: string): string => clean(text).replace(/(?<!\.)\.$/, '').trim();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const STRING_FIELDS = ['phrase', 'originalText', 'turkishMeaning', 'explanation', 'sourceSentence'] as const;

function checkSuggestion(value: unknown, path: string): RawSuggestion {
	if (!isRecord(value)) throw new InvalidAnalysisError(`${path}: expected an object`);
	for (const field of STRING_FIELDS) {
		if (typeof value[field] !== 'string') throw new InvalidAnalysisError(`${path}.${field}: expected a string`);
	}
	// The schema requires the learning details too; an answer without them is
	// still usable, so a missing detail is treated as empty.
	for (const field of LEARNING_DETAIL_FIELDS) {
		if (value[field] !== undefined && typeof value[field] !== 'string') throw new InvalidAnalysisError(`${path}.${field}: expected a string`);
	}
	if (!isPhraseCategory(value['category'])) throw new InvalidAnalysisError(`${path}.category: invalid value`);
	if (typeof value['highlighted'] !== 'boolean') throw new InvalidAnalysisError(`${path}.highlighted: expected a boolean`);
	return value as unknown as RawSuggestion;
}

/** Placeholders a model may write instead of leaving a detail empty. */
const PLACEHOLDER = /^(?:[-–—]+|n\/?a|none|null|yok|bulunmuyor|gerek yok|belirsizlik yok|bağlam açık)\.?$/i;

function cleanDetail(text: string | undefined): string {
	const cleaned = clean(text ?? '');
	return PLACEHOLDER.test(cleaned) ? '' : cleaned;
}

/** Sentence identity for comparisons: case, quotes, spacing and final punctuation do not matter. */
function sameSentence(a: string, b: string): boolean {
	const key = (text: string) => forMatching(text).replace(/[.!?…]+$/, '').trim();
	return key(a) !== '' && key(a) === key(b);
}

function containsWords(longer: string, shorter: string): boolean {
	return longer !== shorter && ` ${longer} `.includes(` ${shorter} `);
}

/**
 * Marks suggestions that are only a part of a longer suggestion from the same
 * sentence: both the phrase and the wording sit inside the longer one ("pick up"
 * in "pick up the slack"). Overlapping but separate expressions ("be meant to"
 * and "make it") are not affected, and highlighted ones are never marked.
 */
function markFragments(suggestions: Suggestion[]): void {
	for (const item of suggestions) {
		if (item.highlighted || item.originalText === '') continue;
		const container = suggestions.find(
			(other) =>
				other !== item &&
				sameSentence(other.sourceSentence, item.sourceSentence) &&
				containsWords(normalizePhrase(other.phrase), normalizePhrase(item.phrase)) &&
				containsWords(forMatching(other.originalText), forMatching(item.originalText)),
		);
		item.partOf = container?.phrase ?? null;
	}
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
		const turkishMeaning = cleanMeaning(item.turkishMeaning);
		if (phrase === '' || turkishMeaning === '') continue;
		const key = normalizePhrase(phrase);
		if (key === '' || seen.has(key)) continue;
		seen.add(key);

		const originalText = clean(item.originalText);
		const sourceSentence = clean(item.sourceSentence);
		const exampleSentence = cleanDetail(item.exampleSentence);
		suggestions.push({
			phrase,
			originalText,
			category: item.category,
			turkishMeaning,
			explanation: clean(item.explanation),
			usage: cleanDetail(item.usage),
			contextNote: cleanDetail(item.contextNote),
			sourceSentence,
			// Text that is not visible cannot be translated.
			sourceTranslation: sourceSentence === '' ? '' : cleanDetail(item.sourceTranslation),
			exampleSentence,
			exampleTranslation: exampleSentence === '' ? '' : cleanDetail(item.exampleTranslation),
			highlighted: item.highlighted,
			sourceMismatch: isSourceMismatch(originalText, sourceSentence),
			partOf: null,
		});
	}

	// A generated example must never be text from the screenshot itself.
	const screenshotSentences = suggestions.map((s) => s.sourceSentence).filter((sentence) => sentence !== '');
	for (const item of suggestions) {
		if (screenshotSentences.some((sentence) => sameSentence(sentence, item.exampleSentence))) {
			item.exampleSentence = '';
			item.exampleTranslation = '';
		}
	}

	// Highlighted expressions first; otherwise keep the model's order. Then cap,
	// and mark fragments among what is shown.
	const ordered = [...suggestions.filter((s) => s.highlighted), ...suggestions.filter((s) => !s.highlighted)].slice(0, MAX_SUGGESTIONS);
	markFragments(ordered);
	return { status: parsed.status, suggestions: ordered };
}
