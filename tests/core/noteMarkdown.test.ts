import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { formatLocalDate, highlightInSentence, renderNote, singleLine, yamlString, type NoteInput } from '../../src/core/noteMarkdown';

const putOff: NoteInput = {
	number: 2,
	phrase: 'put off',
	originalText: 'putting off',
	category: 'phrasal_verb',
	turkishMeaning: 'ertelemek',
	explanation: 'Bir işi daha sonraya bırakmak.',
	sourceSentence: 'Her colleagues had been putting off the task for weeks.',
	screenshotPath: 'Attachments/pv-3f9a1c2b7d10e4a5.png',
	createdDate: '2026-11-17',
};

function frontmatterOf(note: string): Record<string, unknown> {
	const match = /^---\n([\s\S]*?)\n---\n/.exec(note);
	if (!match?.[1]) throw new Error('no frontmatter');
	return parseYaml(match[1]) as Record<string, unknown>;
}

describe('renderNote', () => {
	it('renders the full note format', () => {
		expect(renderNote(putOff)).toBe(
			[
				'---',
				'phrase: "put off"',
				'original_text: "putting off"',
				'category: "phrasal_verb"',
				'meaning_tr: "ertelemek"',
				'source_sentence: "Her colleagues had been putting off the task for weeks."',
				'screenshot: "[[Attachments/pv-3f9a1c2b7d10e4a5.png]]"',
				'created: "2026-11-17"',
				'number: 2',
				'tags:',
				'  - phrasevault',
				'---',
				'# put off',
				'',
				'**Kategori:** Phrasal verb',
				'**Türkçe anlam:** ertelemek',
				'**Açıklama:** Bir işi daha sonraya bırakmak.',
				'',
				'> Her colleagues had been **putting off** the task for weeks.',
				'',
				'![[Attachments/pv-3f9a1c2b7d10e4a5.png]]',
				'',
				'*Eklenme tarihi: 2026-11-17*',
				'',
			].join('\n'),
		);
	});

	it('produces frontmatter that a YAML parser reads back exactly', () => {
		const tricky: NoteInput = {
			...putOff,
			phrase: 'say "no": #1 rule',
			originalText: "it's a 'deal'",
			turkishMeaning: 'anlaşma: tamam mı? \\ evet',
			sourceSentence: 'Line one\nline two\ttabbed\u2028sep — "quoted" & [[link]] {braces}',
		};
		const fm = frontmatterOf(renderNote(tricky));
		expect(fm).toEqual({
			phrase: 'say "no": #1 rule',
			original_text: "it's a 'deal'",
			category: 'phrasal_verb',
			meaning_tr: 'anlaşma: tamam mı? \\ evet',
			source_sentence: 'Line one line two tabbed sep — "quoted" & [[link]] {braces}',
			screenshot: '[[Attachments/pv-3f9a1c2b7d10e4a5.png]]',
			created: '2026-11-17',
			number: 2,
			tags: ['phrasevault'],
		});
	});

	it('keeps Turkish characters intact', () => {
		const note = renderNote({ ...putOff, turkishMeaning: 'çekingenlik, ığdır, şöyle, ÜĞİ' });
		expect(frontmatterOf(note)['meaning_tr']).toBe('çekingenlik, ığdır, şöyle, ÜĞİ');
	});

	it('quotes the sentence unchanged when the original text is not in it', () => {
		const note = renderNote({ ...putOff, originalText: 'postpone' });
		expect(note).toContain('> Her colleagues had been putting off the task for weeks.');
		expect(note).not.toContain('**postpone**');
	});

	it('omits empty optional sections instead of inventing content', () => {
		const note = renderNote({ ...putOff, explanation: '  ', sourceSentence: '', screenshotPath: null });
		expect(note).not.toContain('Açıklama');
		expect(note).not.toContain('> ');
		expect(note).not.toContain('![[');
		expect(frontmatterOf(note)['screenshot']).toBe('');
	});

	it('keeps the heading on a single line', () => {
		const note = renderNote({ ...putOff, phrase: 'call it\na day' });
		expect(note).toContain('\n# call it a day\n');
	});

	it('uses the Turkish category label in the body and the stable key in frontmatter', () => {
		const note = renderNote({ ...putOff, category: 'idiom' });
		expect(note).toContain('**Kategori:** Deyim');
		expect(frontmatterOf(note)['category']).toBe('idiom');
	});
});

describe('highlightInSentence', () => {
	it('bolds the first case-insensitive match', () => {
		expect(highlightInSentence('She Ran Out Of patience.', 'ran out of')).toBe('She **Ran Out Of** patience.');
	});

	it('leaves the sentence unchanged when there is no match or the text is empty', () => {
		expect(highlightInSentence('Nothing here.', 'call it a day')).toBe('Nothing here.');
		expect(highlightInSentence('Nothing here.', '  ')).toBe('Nothing here.');
	});

	it('does not nest bold markers', () => {
		expect(highlightInSentence('a **b** c', '**b**')).toBe('a **b** c');
	});
});

describe('helpers', () => {
	it('singleLine removes control characters and line separators', () => {
		expect(singleLine(' a\r\nb\u0007c\u2029d  ')).toBe('a b c d');
	});

	it('yamlString produces a double-quoted scalar', () => {
		expect(yamlString('a "b"')).toBe('"a \\"b\\""');
	});

	it('formatLocalDate uses the local calendar date', () => {
		expect(formatLocalDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
	});
});
