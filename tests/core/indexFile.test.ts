import { describe, expect, it } from 'vitest';
import {
	appendEntry,
	createIndexContent,
	formatIndexEntry,
	IndexConflictError,
	notePathFor,
	parseIndexEntries,
	repairIndex,
	sanitizeAlias,
} from '../../src/core/indexFile';

describe('createIndexContent', () => {
	it('contains only a heading — no placeholder entries', () => {
		const text = createIndexContent();
		expect(text).toBe('# PhraseVault İndeksi\n\n');
		expect(parseIndexEntries(text)).toEqual([]);
	});
});

describe('formatIndexEntry', () => {
	it('uses the "0001 — [[Phrases/0001|alias]]" format', () => {
		expect(formatIndexEntry(1, 'come across')).toBe('0001 — [[Phrases/0001|come across]]');
		expect(formatIndexEntry(10000, 'put off')).toBe('10000 — [[Phrases/10000|put off]]');
	});

	it('is not Markdown list syntax, so Reading view keeps leading zeros', () => {
		const line = formatIndexEntry(7, 'x');
		expect(line).not.toMatch(/^\d+[.)]\s/);
		expect(line.startsWith('0007 ')).toBe(true);
	});

	it('falls back to the number when the alias is empty', () => {
		expect(formatIndexEntry(3, '  ')).toBe('0003 — [[Phrases/0003|0003]]');
	});

	it('notePathFor matches the link target', () => {
		expect(notePathFor(12)).toBe('Phrases/0012.md');
	});
});

describe('sanitizeAlias', () => {
	it('removes characters that would break the wikilink', () => {
		expect(sanitizeAlias('either|or')).toBe('either/or');
		expect(sanitizeAlias('put [sb] off')).toBe('put (sb) off');
		expect(sanitizeAlias('end]] [[evil')).toBe('end)) ((evil');
	});

	it('collapses whitespace and newlines onto one line', () => {
		expect(sanitizeAlias('  call it\n a   day\t')).toBe('call it a day');
	});
});

describe('appendEntry', () => {
	const base = createIndexContent();

	it('appends the first entry to a fresh index', () => {
		expect(appendEntry(base, 1, 'come across')).toBe('# PhraseVault İndeksi\n\n0001 — [[Phrases/0001|come across]]\n');
	});

	it('keeps every existing byte and only adds one line at the end', () => {
		const current = '# My index\n\nSome personal notes **here**.\n0001 — [[Phrases/0001|come across]]\n';
		const result = appendEntry(current, 2, 'put off');
		expect(result.startsWith(current)).toBe(true);
		expect(result.slice(current.length)).toBe('0002 — [[Phrases/0002|put off]]\n');
	});

	it('adds a newline first when the file does not end with one', () => {
		const current = '0001 — [[Phrases/0001|a]]';
		expect(appendEntry(current, 2, 'b')).toBe('0001 — [[Phrases/0001|a]]\n0002 — [[Phrases/0002|b]]\n');
	});

	it('keeps CRLF line endings consistent', () => {
		const current = '# Index\r\n\r\n0001 — [[Phrases/0001|a]]\r\n';
		expect(appendEntry(current, 2, 'b')).toBe(`${current}0002 — [[Phrases/0002|b]]\r\n`);
	});

	it('works on an empty file', () => {
		expect(appendEntry('', 1, 'a')).toBe('0001 — [[Phrases/0001|a]]\n');
	});

	it('throws IndexConflictError when the number is already referenced', () => {
		const current = `${base}0001 — [[Phrases/0001|a]]\n0002 — [[Phrases/0002|b]]\n`;
		expect(() => appendEntry(current, 2, 'c')).toThrow(IndexConflictError);
	});

	it('throws IndexConflictError when a higher number appeared in the meantime', () => {
		const current = `${base}0005 — [[Phrases/0005|added elsewhere]]\n`;
		try {
			appendEntry(current, 3, 'c');
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(IndexConflictError);
			expect((error as IndexConflictError).highestInIndex).toBe(5);
		}
	});
});

describe('parseIndexEntries', () => {
	it('reads standard entries and skips other lines', () => {
		const text = '# Index\n\n0001 — [[Phrases/0001|come across]]\nfree text\n0002 — [[Phrases/0002|put off]]\n0003 — [[Phrases/0003]]\n';
		expect(parseIndexEntries(text)).toEqual([
			{ number: 1, alias: 'come across' },
			{ number: 2, alias: 'put off' },
			{ number: 3, alias: '' },
		]);
	});
});

describe('repairIndex', () => {
	it('returns the text unchanged when nothing is missing', () => {
		const current = `${createIndexContent()}0001 — [[Phrases/0001|a]]\n`;
		expect(repairIndex(current, [{ number: 1, alias: 'a' }])).toEqual({ text: current, added: [] });
	});

	it('inserts missing entries in numeric order without changing existing lines', () => {
		const current = '# Index\n\n0001 — [[Phrases/0001|a]]\n0004 — my edited line\n';
		const result = repairIndex(current, [
			{ number: 3, alias: 'c' },
			{ number: 1, alias: 'a' },
			{ number: 2, alias: 'b' },
			{ number: 6, alias: 'f' },
		]);
		expect(result.added).toEqual([2, 3, 6]);
		expect(result.text).toBe(
			'# Index\n\n0001 — [[Phrases/0001|a]]\n0002 — [[Phrases/0002|b]]\n0003 — [[Phrases/0003|c]]\n0004 — my edited line\n0006 — [[Phrases/0006|f]]\n',
		);
		// Every original line survives unchanged and in order.
		const kept = result.text.split('\n').filter((line) => !/^000[236] — \[\[/.test(line));
		expect(kept.join('\n')).toBe(current);
	});

	it('rebuilds entries into a freshly recreated index', () => {
		const result = repairIndex(createIndexContent(), [
			{ number: 2, alias: 'put off' },
			{ number: 1, alias: 'come across' },
		]);
		expect(result.text).toBe('# PhraseVault İndeksi\n\n0001 — [[Phrases/0001|come across]]\n0002 — [[Phrases/0002|put off]]\n');
	});

	it('ignores duplicate note numbers', () => {
		const result = repairIndex('', [
			{ number: 1, alias: 'a' },
			{ number: 1, alias: 'a again' },
		]);
		expect(result.added).toEqual([1]);
		expect(result.text).toBe('0001 — [[Phrases/0001|a]]\n');
	});
});
