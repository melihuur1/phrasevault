// Duplicate phrase detection. Pure: no Obsidian imports.

import type { KnownPhrase } from './types';

const EDGE_PUNCTUATION = /^[\s"'.,;:!?()[\]{}\-–—…]+|[\s"'.,;:!?()[\]{}\-–—…]+$/g;

/** Normalizes a phrase for comparison: "To Put  Off!" and "put off" are equal. */
export function normalizePhrase(text: string): string {
	return text
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[‘’‛′`´]/g, "'")
		.replace(/[“”„″]/g, '"')
		.replace(/\s+/g, ' ')
		.replace(EDGE_PUNCTUATION, '')
		.replace(/^to /, '')
		.trim();
}

/**
 * Combines phrases from note frontmatter and from index entries. When both know
 * the same number, the note wins because it also has the meaning.
 */
export function mergeKnownPhrases(fromNotes: ReadonlyArray<KnownPhrase>, fromIndex: ReadonlyArray<KnownPhrase>): KnownPhrase[] {
	const byNumber = new Map<number, KnownPhrase>();
	for (const entry of fromIndex) byNumber.set(entry.number, entry);
	for (const entry of fromNotes) byNumber.set(entry.number, entry);
	return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

/** Existing entries whose phrase matches `phrase` after normalization. */
export function findDuplicates(phrase: string, known: ReadonlyArray<KnownPhrase>): KnownPhrase[] {
	const target = normalizePhrase(phrase);
	if (target === '') return [];
	return known.filter((entry) => normalizePhrase(entry.phrase) === target);
}

/**
 * For each phrase in a batch, the indices of earlier phrases in the same batch
 * that are duplicates of it. An empty array means no duplicate in the batch.
 */
export function findBatchDuplicates(phrases: ReadonlyArray<string>): number[][] {
	const seen = new Map<string, number[]>();
	return phrases.map((phrase, index) => {
		const key = normalizePhrase(phrase);
		if (key === '') return [];
		const earlier = seen.get(key) ?? [];
		seen.set(key, [...earlier, index]);
		return earlier;
	});
}
