import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InvalidAnalysisError, isSourceMismatch, parseAnalysisText } from '../../src/ai/validate';

function fixture(name: string): string {
	return readFileSync(join(__dirname, '..', 'fixtures', 'ai', name), 'utf8');
}

describe('parseAnalysisText — valid responses', () => {
	it('extracts the expected expressions from unmarked text (Case B)', () => {
		const result = parseAnalysisText(fixture('unmarked.json'));
		expect(result.status).toBe('unmarked');
		expect(result.suggestions.map((s) => [s.phrase, s.originalText])).toEqual([
			['run out of', 'ran out of'],
			['call it a day', 'call it a day'],
			['put off', 'putting off'],
		]);
		expect(result.suggestions.every((s) => !s.sourceMismatch)).toBe(true);
	});

	it('puts highlighted expressions first (Case A)', () => {
		const result = parseAnalysisText(fixture('highlighted.json'));
		expect(result.status).toBe('highlighted');
		expect(result.suggestions.map((s) => s.phrase)).toEqual(['come across', 'for weeks']);
		expect(result.suggestions[0]?.highlighted).toBe(true);
	});

	it('keeps all candidates when the highlight is ambiguous', () => {
		const result = parseAnalysisText(fixture('ambiguous.json'));
		expect(result.status).toBe('ambiguous');
		expect(result.suggestions).toHaveLength(2);
	});

	it('returns an empty list when there is no English text', () => {
		expect(parseAnalysisText(fixture('empty.json'))).toEqual({ status: 'no_english_text', suggestions: [] });
	});
});

describe('parseAnalysisText — cleaning', () => {
	const result = parseAnalysisText(fixture('messy.json'));

	it('trims and collapses whitespace in every field', () => {
		expect(result.suggestions[0]).toMatchObject({
			phrase: 'put off',
			originalText: 'putting off',
			turkishMeaning: 'ertelemek',
			explanation: 'Sonraya bırakmak.',
			sourceSentence: 'They kept putting off the meeting.',
			sourceMismatch: false,
		});
	});

	it('drops duplicates, empty phrases and suggestions without a meaning', () => {
		const phrases = result.suggestions.map((s) => s.phrase);
		expect(phrases.filter((p) => p.toLowerCase() === 'put off')).toHaveLength(1);
		expect(phrases).not.toContain('');
		expect(phrases).not.toContain('no meaning');
	});

	it('caps the list at five suggestions', () => {
		expect(result.suggestions.map((s) => s.phrase)).toEqual(['put off', 'give up', 'a', 'b', 'c']);
	});

	it('flags an original text that is not in the quoted sentence', () => {
		const giveUp = result.suggestions.find((s) => s.phrase === 'give up');
		expect(giveUp?.sourceMismatch).toBe(true);
	});

	it('drops a closing period from the short Turkish meaning but keeps an ellipsis and the explanation as written', () => {
		const one = (turkishMeaning: string) =>
			parseAnalysisText(
				JSON.stringify({
					status: 'unmarked',
					suggestions: [
						{
							phrase: 'put off',
							originalText: 'putting off',
							category: 'phrasal_verb',
							turkishMeaning,
							explanation: 'Sonraya bırakmak.',
							sourceSentence: 'They kept putting off the meeting.',
							highlighted: false,
						},
					],
				}),
			).suggestions[0];
		expect(one('ertelemek.')?.turkishMeaning).toBe('ertelemek');
		expect(one('ertelemek')?.turkishMeaning).toBe('ertelemek');
		expect(one('bir şeyi …yapmak...')?.turkishMeaning).toBe('bir şeyi …yapmak...');
		expect(one('ertelemek.')?.explanation).toBe('Sonraya bırakmak.');
	});
});

describe('parseAnalysisText — invalid responses', () => {
	it.each([
		['not JSON at all', 'Sorry, I cannot help with that.'],
		['truncated JSON', '{"status":"unmarked","suggestions":[{"phrase":"put'],
		['an empty string', ''],
		['a JSON array', '[]'],
		['an unknown status', '{"status":"maybe","suggestions":[]}'],
	])('rejects %s', (_label, text) => {
		expect(() => parseAnalysisText(text)).toThrow(InvalidAnalysisError);
	});

	it('rejects an unknown category', () => {
		expect(() => parseAnalysisText(fixture('invalid-category.json'))).toThrow(/category/);
	});

	it('rejects suggestions with missing fields', () => {
		expect(() => parseAnalysisText(fixture('missing-fields.json'))).toThrow(InvalidAnalysisError);
	});
});

describe('isSourceMismatch', () => {
	it('matches case-, quote- and whitespace-insensitively', () => {
		expect(isSourceMismatch('It’s raining', "it's  raining cats and dogs")).toBe(false);
	});

	it('cannot verify (and does not flag) when either side is empty', () => {
		expect(isSourceMismatch('', 'sentence')).toBe(false);
		expect(isSourceMismatch('put off', '')).toBe(false);
	});
});
