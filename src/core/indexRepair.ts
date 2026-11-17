// "İndeksi onar": finds numbered notes that INDEX.md does not list and index
// lines that do not add up. Pure: it only plans. Lines are only ever added
// (by repairIndex in indexFile.ts), never changed, and anything ambiguous is
// reported for the user to check instead of being guessed.

import { PHRASES_FOLDER } from '../constants';
import type { IndexEntry } from './indexFile';
import { formatNumber, leadingNumber, linkedNumbers, numberFromNoteFileName, referencedNumbersInIndex } from './numbering';

export interface NumberedNote {
	/** File name inside the Phrases folder, e.g. "0005.md". */
	fileName: string;
	/** Current text, or null when it could not be read. */
	content: string | null;
	frontmatter: Record<string, unknown> | null;
}

export type RepairIssue =
	/** The note has no `phrase` in its frontmatter, so its entry cannot be named. */
	| { kind: 'no_phrase'; number: number; path: string }
	/** The frontmatter `number` disagrees with the file name. */
	| { kind: 'number_mismatch'; number: number; path: string; frontmatterNumber: string }
	/** Numbered, but not named like "0005.md", so a standard index link would not reach it. */
	| { kind: 'nonstandard_name'; number: number; path: string }
	/** Several files share one number (e.g. "5.md" and "0005.md"). */
	| { kind: 'duplicate_note'; number: number; paths: string[] }
	| { kind: 'empty_note'; number: number; path: string }
	| { kind: 'unreadable_note'; number: number; path: string }
	/** Several INDEX.md lines are entries for the same number. */
	| { kind: 'duplicate_entry'; number: number; lines: number[] }
	/** A line's number and its link point to different notes ("0005 — [[Phrases/0006|…]]"). */
	| { kind: 'mismatched_entry'; number: number; line: number; linkNumber: number }
	/** INDEX.md lists a number whose note does not exist (deleted or renamed). */
	| { kind: 'missing_note'; number: number; line: number };

export interface IndexRepairPlan {
	/** Entries that can be rebuilt safely, in number order. */
	additions: IndexEntry[];
	/** Things only the user can decide; nothing is changed for them. */
	issues: RepairIssue[];
	indexExists: boolean;
}

interface EntryLine {
	/** 1-based line number in INDEX.md. */
	line: number;
	number: number;
	linkNumber: number | null;
}

/** Lines that look like entries: "0005 — …" or a line starting with a link to Phrases/0005. */
function entryLines(indexText: string): EntryLine[] {
	return indexText.split(/\r?\n/).flatMap((text, i) => {
		const leading = leadingNumber(text);
		const links = linkedNumbers(text);
		const firstLink = links[0] ?? null;
		const number = leading ?? firstLink;
		return number === null ? [] : [{ line: i + 1, number, linkNumber: firstLink }];
	});
}

function frontmatterNumber(frontmatter: Record<string, unknown> | null): string | null {
	const value = frontmatter?.['number'];
	if (value === undefined || value === null) return null;
	return typeof value === 'number' || typeof value === 'string' ? String(value).trim() : JSON.stringify(value);
}

function phraseOf(frontmatter: Record<string, unknown> | null): string | null {
	const phrase = frontmatter?.['phrase'];
	return typeof phrase === 'string' && phrase.trim() !== '' ? phrase.trim() : null;
}

export function planIndexRepair(notes: ReadonlyArray<NumberedNote>, indexText: string | null): IndexRepairPlan {
	const issues: RepairIssue[] = [];
	const additions: IndexEntry[] = [];
	const text = indexText ?? '';
	const referenced = referencedNumbersInIndex(text);
	const lines = entryLines(text);

	// Index lines that do not add up.
	const linesByNumber = new Map<number, number[]>();
	for (const entry of lines) {
		linesByNumber.set(entry.number, [...(linesByNumber.get(entry.number) ?? []), entry.line]);
		if (entry.linkNumber !== null && entry.linkNumber !== entry.number) {
			issues.push({ kind: 'mismatched_entry', number: entry.number, line: entry.line, linkNumber: entry.linkNumber });
		}
	}
	for (const [number, numberLines] of linesByNumber) {
		if (numberLines.length > 1) issues.push({ kind: 'duplicate_entry', number, lines: numberLines });
	}

	// Notes grouped by number.
	const notesByNumber = new Map<number, NumberedNote[]>();
	for (const note of notes) {
		const n = numberFromNoteFileName(note.fileName);
		if (n !== null) notesByNumber.set(n, [...(notesByNumber.get(n) ?? []), note]);
	}

	for (const entry of lines) {
		const target = entry.linkNumber ?? entry.number;
		if (!notesByNumber.has(target) && !issues.some((issue) => issue.kind === 'missing_note' && issue.number === target)) {
			issues.push({ kind: 'missing_note', number: target, line: entry.line });
		}
	}

	for (const [n, group] of [...notesByNumber].sort(([a], [b]) => a - b)) {
		const paths = group.map((note) => `${PHRASES_FOLDER}/${note.fileName}`).sort();
		if (group.length > 1) {
			issues.push({ kind: 'duplicate_note', number: n, paths });
			continue;
		}
		const note = group[0];
		const path = paths[0];
		if (note === undefined || path === undefined || referenced.has(n)) continue; // already in the index

		if (note.fileName !== `${formatNumber(n)}.md`) {
			issues.push({ kind: 'nonstandard_name', number: n, path });
		} else if (note.content === null) {
			issues.push({ kind: 'unreadable_note', number: n, path });
		} else if (note.content.trim() === '') {
			issues.push({ kind: 'empty_note', number: n, path });
		} else {
			const declared = frontmatterNumber(note.frontmatter);
			const phrase = phraseOf(note.frontmatter);
			if (declared !== null && declared !== String(n) && Number(declared) !== n) {
				issues.push({ kind: 'number_mismatch', number: n, path, frontmatterNumber: declared });
			} else if (phrase === null) {
				issues.push({ kind: 'no_phrase', number: n, path });
			} else {
				additions.push({ number: n, alias: phrase });
			}
		}
	}

	issues.sort((a, b) => a.number - b.number);
	return { additions, issues, indexExists: indexText !== null };
}
