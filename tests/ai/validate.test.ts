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

	it('keeps every valid suggestion when there are fewer than eight', () => {
		expect(result.suggestions.map((s) => s.phrase)).toEqual(['put off', 'give up', 'a', 'b', 'c', 'd']);
	});

	it('caps the list at eight suggestions', () => {
		const many = Array.from({ length: 11 }, (_, i) => suggestion({ phrase: `phrase ${i + 1}`, originalText: `phrase ${i + 1}` }));
		const parsed = parseAnalysisText(JSON.stringify({ status: 'unmarked', suggestions: many }));
		expect(parsed.suggestions.map((s) => s.phrase)).toEqual(Array.from({ length: 8 }, (_, i) => `phrase ${i + 1}`));
	});

	it('treats learning details missing from an older-style answer as empty', () => {
		expect(result.suggestions[0]).toMatchObject({ usage: '', contextNote: '', sourceTranslation: '', exampleSentence: '', exampleTranslation: '', partOf: null });
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

function suggestion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		phrase: 'put off',
		originalText: 'putting off',
		category: 'phrasal_verb',
		turkishMeaning: 'ertelemek',
		explanation: 'Toplantıyı sürekli sonraya bıraktıklarını anlatıyor.',
		usage: 'put off + isim ya da -ing.',
		contextNote: '',
		sourceSentence: 'They kept putting off the meeting.',
		sourceTranslation: 'Toplantıyı sürekli erteleyip durdular.',
		exampleSentence: 'Do not put off your homework.',
		exampleTranslation: 'Ödevini erteleme.',
		highlighted: false,
		...overrides,
	};
}

function parseOne(overrides: Record<string, unknown>) {
	return parseAnalysisText(JSON.stringify({ status: 'unmarked', suggestions: [suggestion(overrides)] })).suggestions[0];
}

describe('regression: grammatical constructions are not missed', () => {
	const { suggestions } = parseAnalysisText(fixture('construction.json'));

	it('keeps both "be meant to" and "make it" from one sentence', () => {
		expect(suggestions.map((s) => [s.phrase, s.category])).toEqual([
			['be meant to', 'grammar_pattern'],
			['make it', 'expression'],
		]);
	});

	it('keeps the dictionary form and the exact original wording separate', () => {
		expect(suggestions[0]).toMatchObject({ phrase: 'be meant to', originalText: 'were meant to', sourceMismatch: false });
	});

	it('does not treat either expression as a fragment of the other', () => {
		expect(suggestions.map((s) => s.partOf)).toEqual([null, null]);
	});

	it('carries the usage explanation, the sentence translation and a generated example', () => {
		const first = suggestions[0];
		expect(first?.usage).toContain('be meant to + yalın fiil');
		expect(first).toMatchObject({
			sourceTranslation: 'Hiçbirinin başarması beklenmiyordu ama başardılar.',
			exampleSentence: 'This room was meant to be a library.',
			exampleTranslation: 'Bu odanın kütüphane olması planlanmıştı.',
		});
	});
});

describe('regression: overlapping and nested expressions', () => {
	const { suggestions } = parseAnalysisText(fixture('nested.json'));
	const byPhrase = (phrase: string) => suggestions.find((s) => s.phrase === phrase);

	it('keeps separate overlapping expressions from the same sentence', () => {
		expect(byPhrase('look forward to')?.partOf).toBeNull();
		expect(byPhrase('hear from')?.partOf).toBeNull();
	});

	it('marks a redundant fragment of a longer expression instead of treating it as its own', () => {
		expect(byPhrase('pick up the slack')?.partOf).toBeNull();
		expect(byPhrase('pick up')?.partOf).toBe('pick up the slack');
	});

	it('only compares expressions from the same sentence', () => {
		const parsed = parseAnalysisText(
			JSON.stringify({
				status: 'unmarked',
				suggestions: [
					suggestion({ phrase: 'give up on', originalText: 'gave up on', sourceSentence: 'She gave up on him.' }),
					suggestion({ phrase: 'give up', originalText: 'gave up', sourceSentence: 'He gave up smoking.' }),
				],
			}),
		);
		expect(parsed.suggestions.map((s) => [s.phrase, s.partOf])).toEqual([
			['give up on', null],
			['give up', null],
		]);
	});

	it('marks "give up" inside "give up on" in the same sentence', () => {
		const parsed = parseAnalysisText(
			JSON.stringify({
				status: 'unmarked',
				suggestions: [
					suggestion({ phrase: 'give up on', originalText: 'gave up on', sourceSentence: 'She gave up on him.' }),
					suggestion({ phrase: 'give up', originalText: 'gave up', sourceSentence: 'She gave up on him.' }),
				],
			}),
		);
		expect(parsed.suggestions.map((s) => s.partOf)).toEqual([null, 'give up on']);
	});

	it('never marks a highlighted expression as a fragment', () => {
		const parsed = parseAnalysisText(
			JSON.stringify({
				status: 'highlighted',
				suggestions: [
					suggestion({ phrase: 'pick up', originalText: 'pick up', sourceSentence: 'Pick up the slack.', highlighted: true }),
					suggestion({ phrase: 'pick up the slack', originalText: 'pick up the slack', sourceSentence: 'Pick up the slack.' }),
				],
			}),
		);
		expect(parsed.suggestions.map((s) => s.partOf)).toEqual([null, null]);
	});
});

describe('regression: ambiguous context is acknowledged, not hidden', () => {
	it('keeps the context note so the card can show it', () => {
		const [item] = parseAnalysisText(fixture('context-ambiguous.json')).suggestions;
		expect(item?.contextNote).toContain("'yetişmek', 'başarmak' ya da 'hayatta kalmak'");
	});

	it.each(['Yok.', '-', 'N/A', 'none', '  —  ', 'Bağlam açık.'])('treats the placeholder %j as "no note"', (contextNote) => {
		expect(parseOne({ contextNote })?.contextNote).toBe('');
	});

	it('keeps a real note even when it starts like a placeholder', () => {
		expect(parseOne({ contextNote: 'Yok sayılabilecek bir ayrıntı eksik.' })?.contextNote).toBe('Yok sayılabilecek bir ayrıntı eksik.');
	});
});

describe('regression: translations and generated examples', () => {
	it('keeps natural sentence translations exactly as written, final punctuation included', () => {
		const [item] = parseAnalysisText(fixture('construction.json')).suggestions;
		expect(item?.sourceTranslation).toBe('Hiçbirinin başarması beklenmiyordu ama başardılar.');
	});

	it('drops a sentence translation when the source sentence is not visible', () => {
		expect(parseOne({ sourceSentence: '', sourceTranslation: 'Uydurulmuş bir çeviri.' })?.sourceTranslation).toBe('');
	});

	it('drops an "example" that is really the screenshot sentence, so generated text is never mistaken for it', () => {
		const item = parseOne({ exampleSentence: 'they kept putting off the meeting', exampleTranslation: 'Toplantıyı ertelediler.' });
		expect(item).toMatchObject({ exampleSentence: '', exampleTranslation: '' });
	});

	it("drops an example that copies another card's screenshot sentence", () => {
		const parsed = parseAnalysisText(
			JSON.stringify({
				status: 'unmarked',
				suggestions: [suggestion(), suggestion({ phrase: 'keep', originalText: 'kept', exampleSentence: 'They kept putting off the meeting.' })],
			}),
		);
		expect(parsed.suggestions[1]?.exampleSentence).toBe('');
	});

	it('drops an example translation that has no example', () => {
		expect(parseOne({ exampleSentence: '', exampleTranslation: 'Ödevini erteleme.' })?.exampleTranslation).toBe('');
	});

	it('rejects a learning detail of the wrong type', () => {
		expect(() => parseAnalysisText(JSON.stringify({ status: 'unmarked', suggestions: [suggestion({ usage: 42 })] }))).toThrow(InvalidAnalysisError);
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
