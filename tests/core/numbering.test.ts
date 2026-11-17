import { describe, expect, it } from 'vitest';
import {
	formatNumber,
	highestNumberInFileNames,
	highestNumberInIndex,
	nextNumber,
	numberFromNoteFileName,
	referencedNumbersInIndex,
} from '../../src/core/numbering';

describe('formatNumber', () => {
	it('pads to four digits', () => {
		expect(formatNumber(1)).toBe('0001');
		expect(formatNumber(42)).toBe('0042');
		expect(formatNumber(9999)).toBe('9999');
	});

	it('keeps growing past 9999 without truncation', () => {
		expect(formatNumber(10000)).toBe('10000');
		expect(formatNumber(123456)).toBe('123456');
	});

	it('rejects zero, negatives, fractions and unsafe integers', () => {
		for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
			expect(() => formatNumber(bad)).toThrow(RangeError);
		}
	});
});

describe('numberFromNoteFileName', () => {
	it('reads all-digit Markdown file names', () => {
		expect(numberFromNoteFileName('0001.md')).toBe(1);
		expect(numberFromNoteFileName('10000.md')).toBe(10000);
		expect(numberFromNoteFileName('0007.MD')).toBe(7);
	});

	it('ignores anything else', () => {
		for (const name of ['notes.md', '0001 copy.md', '0001.png', '0000.md', 'a0001.md', '0001.md.bak', '.md']) {
			expect(numberFromNoteFileName(name)).toBeNull();
		}
	});
});

describe('highestNumberInFileNames', () => {
	it('returns 0 for an empty folder', () => {
		expect(highestNumberInFileNames([])).toBe(0);
	});

	it('uses the highest numbered file and ignores other files', () => {
		expect(highestNumberInFileNames(['0001.md', '0003.md', 'my notes.md', '0002.md'])).toBe(3);
	});
});

describe('referencedNumbersInIndex', () => {
	it('finds standard entries', () => {
		const text = '# PhraseVault İndeksi\n\n0001 — [[Phrases/0001|come across]]\n0002 — [[Phrases/0002|put off]]\n';
		expect([...referencedNumbersInIndex(text)].sort()).toEqual([1, 2]);
	});

	it('still counts lines the user edited', () => {
		const text = [
			'0005 — put off (link removed by hand)',
			'- see [[Phrases/0009]] too',
			'[[Phrases/0011.md|renamed]]',
			'[[phrases/0012#Açıklama|heading link]]',
			'[markdown link](Phrases/0013.md)',
			'0014 - hyphen instead of em dash',
			'0015 – en dash',
		].join('\n');
		expect([...referencedNumbersInIndex(text)].sort((a, b) => a - b)).toEqual([5, 9, 11, 12, 13, 14, 15]);
	});

	it('does not treat dates or plain numbers as entry numbers', () => {
		const text = 'Started on 2026-11-17\n2026-11-17 review\nI saved 30 phrases\n';
		expect(referencedNumbersInIndex(text).size).toBe(0);
	});

	it('ignores links to other folders', () => {
		expect(referencedNumbersInIndex('[[Attachments/0099|x]] [[Other/0050]]').size).toBe(0);
	});
});

describe('nextNumber', () => {
	const emptyIndex = '# PhraseVault İndeksi\n\n';

	it('starts at 1 in a fresh vault', () => {
		expect(nextNumber({ noteFileNames: [], indexText: null, lastIssuedNumber: 0 })).toBe(1);
		expect(nextNumber({ noteFileNames: [], indexText: emptyIndex, lastIssuedNumber: 0 })).toBe(1);
	});

	it('follows the highest numbered file, even an empty one', () => {
		expect(nextNumber({ noteFileNames: ['0001.md', '0002.md', '0007.md'], indexText: emptyIndex, lastIssuedNumber: 0 })).toBe(8);
	});

	it('does not reuse a deleted note number that the index still refers to', () => {
		const index = `${emptyIndex}0001 — [[Phrases/0001|a]]\n0002 — [[Phrases/0002|b]]\n0003 — [[Phrases/0003|c]]\n`;
		// 0003.md was deleted by the user, but its index line remains.
		expect(nextNumber({ noteFileNames: ['0001.md', '0002.md'], indexText: index, lastIssuedNumber: 0 })).toBe(4);
	});

	it('does not reuse a number after both the note and its index line were deleted', () => {
		const index = `${emptyIndex}0001 — [[Phrases/0001|a]]\n`;
		expect(nextNumber({ noteFileNames: ['0001.md'], indexText: index, lastIssuedNumber: 2 })).toBe(3);
	});

	it('does not reuse the number of a manually edited entry', () => {
		const index = `${emptyIndex}0001 — [[Phrases/0001|a]]\n0002 — my own text, link removed\n`;
		expect(nextNumber({ noteFileNames: ['0001.md'], indexText: index, lastIssuedNumber: 0 })).toBe(3);
	});

	it('falls back to vault contents when the high-water mark is missing or invalid', () => {
		for (const lastIssuedNumber of [0, -3, Number.NaN, 2.5]) {
			expect(nextNumber({ noteFileNames: ['0004.md'], indexText: null, lastIssuedNumber })).toBe(5);
		}
	});

	it('continues from 9999 to 10000', () => {
		const index = `${emptyIndex}9999 — [[Phrases/9999|last four-digit]]\n`;
		const n = nextNumber({ noteFileNames: ['9999.md'], indexText: index, lastIssuedNumber: 9999 });
		expect(n).toBe(10000);
		expect(formatNumber(n)).toBe('10000');
	});

	it('is deterministic for the same vault state (restart safety)', () => {
		const state = { noteFileNames: ['0001.md', '0002.md'], indexText: `${emptyIndex}0001 — [[Phrases/0001|a]]\n`, lastIssuedNumber: 2 };
		expect(nextNumber(state)).toBe(nextNumber({ ...state }));
	});

	it('highestNumberInIndex is 0 for an index without entries', () => {
		expect(highestNumberInIndex(emptyIndex)).toBe(0);
	});
});
