import { describe, expect, it } from 'vitest';
import { findBatchDuplicates, findDuplicates, mergeKnownPhrases, normalizePhrase } from '../../src/core/duplicates';
import type { KnownPhrase } from '../../src/core/types';

describe('normalizePhrase', () => {
	it.each([
		['Put Off', 'put off'],
		['  put   off  ', 'put off'],
		['to put off', 'put off'],
		['To put off.', 'put off'],
		['"call it a day!"', 'call it a day'],
		['it’s raining cats and dogs', "it's raining cats and dogs"],
		['ｐｕｔ ｏｆｆ', 'put off'], // full-width characters (NFKC)
		['well-known', 'well-known'],
		['…run out of…', 'run out of'],
	])('%s → %s', (input, expected) => {
		expect(normalizePhrase(input)).toBe(expected);
	});

	it('does not merge different phrases', () => {
		expect(normalizePhrase('put off')).not.toBe(normalizePhrase('put on'));
		expect(normalizePhrase('run out')).not.toBe(normalizePhrase('run out of'));
	});
});

describe('findDuplicates', () => {
	const known: KnownPhrase[] = [
		{ number: 1, phrase: 'come across', meaning: 'rastlamak' },
		{ number: 2, phrase: 'put off', meaning: 'ertelemek' },
		{ number: 7, phrase: 'Put off', meaning: 'soğutmak, caydırmak' },
	];

	it('returns every existing entry with the same phrase', () => {
		expect(findDuplicates('to put off', known).map((d) => d.number)).toEqual([2, 7]);
	});

	it('returns nothing for a new phrase or an empty one', () => {
		expect(findDuplicates('call it a day', known)).toEqual([]);
		expect(findDuplicates('  ', known)).toEqual([]);
	});
});

describe('mergeKnownPhrases', () => {
	it('prefers note frontmatter over index aliases and keeps index-only entries', () => {
		const merged = mergeKnownPhrases(
			[{ number: 2, phrase: 'put off', meaning: 'ertelemek' }],
			[
				{ number: 1, phrase: 'come across', meaning: null },
				{ number: 2, phrase: 'put off (old alias)', meaning: null },
			],
		);
		expect(merged).toEqual([
			{ number: 1, phrase: 'come across', meaning: null },
			{ number: 2, phrase: 'put off', meaning: 'ertelemek' },
		]);
	});
});

describe('findBatchDuplicates', () => {
	it('points each repeated phrase at its earlier occurrences', () => {
		expect(findBatchDuplicates(['run out of', 'put off', 'Run out of', 'call it a day', 'to run out of'])).toEqual([
			[],
			[],
			[0],
			[],
			[0, 2],
		]);
	});

	it('ignores empty phrases', () => {
		expect(findBatchDuplicates(['', ' '])).toEqual([[], []]);
	});
});
