// Sequential note numbering, derived only from what is in the vault.
//
// next = max(highest numbered note file, highest number INDEX.md refers to, last issued number) + 1
//
// Numbers only ever grow, so a number that belonged to a deleted or manually
// edited entry is never handed out again.

import { NUMBER_WIDTH, PHRASES_FOLDER } from '../constants';

export function formatNumber(n: number): string {
	if (!Number.isSafeInteger(n) || n < 1) {
		throw new RangeError(`Invalid entry number: ${n}`);
	}
	return String(n).padStart(NUMBER_WIDTH, '0');
}

function toEntryNumber(digits: string): number | null {
	const n = Number(digits);
	return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

const NUMBERED_NOTE_FILE = /^(\d+)\.md$/i;

/** "0001.md" → 1. Returns null for anything that is not an all-digit Markdown file name. */
export function numberFromNoteFileName(fileName: string): number | null {
	const match = NUMBERED_NOTE_FILE.exec(fileName);
	return match?.[1] === undefined ? null : toEntryNumber(match[1]);
}

/** Highest number among note file names; empty files count too. */
export function highestNumberInFileNames(fileNames: Iterable<string>): number {
	let highest = 0;
	for (const name of fileNames) {
		const n = numberFromNoteFileName(name);
		if (n !== null && n > highest) highest = n;
	}
	return highest;
}

const FOLDER = PHRASES_FOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// [[Phrases/0001|alias]], [[Phrases/0001]], [[Phrases/0001.md]], [[Phrases/0001#heading]]
const WIKILINK_REF = new RegExp(String.raw`\[\[\s*${FOLDER}\/(\d+)(?:\.md)?\s*(?=[|#\]])`, 'gi');
// [alias](Phrases/0001.md) or [alias](<Phrases/0001.md>)
const MARKDOWN_LINK_REF = new RegExp(String.raw`\]\(\s*<?${FOLDER}\/(\d+)(?:\.md)?\s*>?\s*\)`, 'gi');
// "0005 — put off" even after the link was removed by hand. Requires spaces around
// the dash so dates such as "2026-11-17" are not mistaken for entry numbers.
const LEADING_NUMBER = /^[ \t]*(\d+)[ \t]+[—–-][ \t]/gm;

/** Every entry number INDEX.md refers to, found leniently so manual edits still count. */
export function referencedNumbersInIndex(indexText: string): Set<number> {
	const numbers = new Set<number>();
	for (const pattern of [WIKILINK_REF, MARKDOWN_LINK_REF, LEADING_NUMBER]) {
		for (const match of indexText.matchAll(pattern)) {
			const n = match[1] === undefined ? null : toEntryNumber(match[1]);
			if (n !== null) numbers.add(n);
		}
	}
	return numbers;
}

export function highestNumberInIndex(indexText: string): number {
	let highest = 0;
	for (const n of referencedNumbersInIndex(indexText)) {
		if (n > highest) highest = n;
	}
	return highest;
}

export interface NumberingState {
	/** File names (not paths) directly inside the Phrases folder. */
	noteFileNames: Iterable<string>;
	/** Current INDEX.md content, or null when the file does not exist. */
	indexText: string | null;
	/** High-water mark persisted after each successful save. */
	lastIssuedNumber: number;
}

export function nextNumber(state: NumberingState): number {
	const lastIssued = Number.isSafeInteger(state.lastIssuedNumber) && state.lastIssuedNumber > 0 ? state.lastIssuedNumber : 0;
	const highest = Math.max(
		highestNumberInFileNames(state.noteFileNames),
		state.indexText === null ? 0 : highestNumberInIndex(state.indexText),
		lastIssued,
	);
	return highest + 1;
}
