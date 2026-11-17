import { describe, expect, it } from 'vitest';
import { createIndexContent } from '../../src/core/indexFile';
import { planIndexRepair, type NumberedNote } from '../../src/core/indexRepair';

const HEADER = createIndexContent();

function note(fileName: string, frontmatter: Record<string, unknown> | null, content?: string | null): NumberedNote {
	const body = frontmatter === null ? '# A note written by hand\n' : `---\nphrase: ${JSON.stringify(frontmatter['phrase'] ?? '')}\n---\n# x\n`;
	return { fileName, frontmatter, content: content === undefined ? body : content };
}

const phraseNote = (n: number, phrase: string) => note(`${String(n).padStart(4, '0')}.md`, { phrase, number: n });

function entry(n: number, alias: string): string {
	const id = String(n).padStart(4, '0');
	return `${id} — [[Phrases/${id}|${alias}]]`;
}

describe('planIndexRepair — rebuilding missing entries', () => {
	it('finds nothing to do when every note is listed', () => {
		const index = `${HEADER}${entry(1, 'come across')}\n${entry(2, 'put off')}\n`;
		expect(planIndexRepair([phraseNote(1, 'come across'), phraseNote(2, 'put off')], index)).toEqual({
			additions: [],
			issues: [],
			indexExists: true,
		});
	});

	it('plans entries for notes the index does not list, named from their frontmatter, in number order', () => {
		const index = `${HEADER}${entry(1, 'come across')}\n`;
		const plan = planIndexRepair([phraseNote(4, 'call it a day'), phraseNote(1, 'come across'), phraseNote(2, 'put off')], index);
		expect(plan.additions).toEqual([
			{ number: 2, alias: 'put off' },
			{ number: 4, alias: 'call it a day' },
		]);
		expect(plan.issues).toEqual([]);
	});

	it('rebuilds every entry when INDEX.md is missing', () => {
		const plan = planIndexRepair([phraseNote(2, 'put off'), phraseNote(1, 'come across')], null);
		expect(plan.indexExists).toBe(false);
		expect(plan.additions.map((a) => a.number)).toEqual([1, 2]);
	});

	it('treats hand-edited lines as listed, so they are never duplicated', () => {
		const index = `${HEADER}0001 — my own wording\n[[Phrases/0002]] (link only)\n- [put off](Phrases/0003.md)\n`;
		const plan = planIndexRepair([phraseNote(1, 'a'), phraseNote(2, 'b'), phraseNote(3, 'c')], index);
		expect(plan.additions).toEqual([]);
	});

	it('accepts a frontmatter number written with leading zeros', () => {
		const plan = planIndexRepair([note('0005.md', { phrase: 'give up', number: '0005' })], HEADER);
		expect(plan.additions).toEqual([{ number: 5, alias: 'give up' }]);
	});

	it('ignores files that are not numbered notes', () => {
		const plan = planIndexRepair([note('my notes.md', { phrase: 'x' }), note('0007-draft.md', { phrase: 'y' })], HEADER);
		expect(plan).toEqual({ additions: [], issues: [], indexExists: true });
	});
});

describe('planIndexRepair — ambiguous notes are reported, not guessed', () => {
	it.each([
		['no phrase in the frontmatter', note('0003.md', { meaning_tr: 'x' }), { kind: 'no_phrase', number: 3, path: 'Phrases/0003.md' }],
		['no frontmatter at all', note('0003.md', null), { kind: 'no_phrase', number: 3, path: 'Phrases/0003.md' }],
		[
			'a frontmatter number that disagrees with the file name',
			note('0005.md', { phrase: 'put off', number: 7 }),
			{ kind: 'number_mismatch', number: 5, path: 'Phrases/0005.md', frontmatterNumber: '7' },
		],
		['a non-standard file name', note('5.md', { phrase: 'put off', number: 5 }), { kind: 'nonstandard_name', number: 5, path: 'Phrases/5.md' }],
		['an empty note', note('0006.md', null, '  \n'), { kind: 'empty_note', number: 6, path: 'Phrases/0006.md' }],
		['an unreadable note', note('0006.md', null, null), { kind: 'unreadable_note', number: 6, path: 'Phrases/0006.md' }],
	])('%s', (_label, input, issue) => {
		const plan = planIndexRepair([input], HEADER);
		expect(plan.additions).toEqual([]);
		expect(plan.issues).toEqual([issue]);
	});

	it('reports two files with the same number instead of picking one', () => {
		const plan = planIndexRepair([note('0005.md', { phrase: 'a' }), note('5.md', { phrase: 'b' })], HEADER);
		expect(plan.additions).toEqual([]);
		expect(plan.issues).toEqual([{ kind: 'duplicate_note', number: 5, paths: ['Phrases/0005.md', 'Phrases/5.md'] }]);
	});
});

describe('planIndexRepair — inconsistent index lines', () => {
	it('reports a number listed on several lines', () => {
		const index = `${HEADER}${entry(1, 'a')}\n${entry(2, 'b')}\n0002 — b again\n`;
		const plan = planIndexRepair([phraseNote(1, 'a'), phraseNote(2, 'b')], index);
		expect(plan.issues).toEqual([{ kind: 'duplicate_entry', number: 2, lines: [4, 5] }]);
	});

	it('reports a line whose number and link point to different notes', () => {
		const index = `${HEADER}0005 — [[Phrases/0006|put off]]\n`;
		const plan = planIndexRepair([phraseNote(5, 'x'), phraseNote(6, 'put off')], index);
		expect(plan.issues).toEqual([{ kind: 'mismatched_entry', number: 5, line: 3, linkNumber: 6 }]);
		expect(plan.additions).toEqual([]);
	});

	it('reports entries whose note no longer exists, and leaves the line alone', () => {
		const index = `${HEADER}${entry(1, 'a')}\n${entry(9, 'deleted')}\n`;
		expect(planIndexRepair([phraseNote(1, 'a')], index).issues).toEqual([{ kind: 'missing_note', number: 9, line: 4 }]);
	});

	it('does not mistake cross-references or dates for duplicate entries', () => {
		const index = `${HEADER}${entry(1, 'a')} (see also [[Phrases/0002]])\n${entry(2, 'b')}\n2026-11-18 — reviewed\n`;
		expect(planIndexRepair([phraseNote(1, 'a'), phraseNote(2, 'b')], index).issues).toEqual([]);
	});

	it('lists issues in number order', () => {
		const index = `${HEADER}${entry(8, 'gone')}\n`;
		const plan = planIndexRepair([note('0003.md', null), phraseNote(8, 'x'), note('0002.md', null, '')], index);
		expect(plan.issues.map((issue) => issue.number)).toEqual([2, 3]);
	});
});
