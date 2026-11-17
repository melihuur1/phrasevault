// INDEX.md handling. The index is append-only: existing lines are never edited,
// reordered, or deleted. Entries look like:
//
//   0001 — [[Phrases/0001|come across]]
//
// "0001 — " is not Markdown list syntax, so Reading view keeps the leading zeros.

import { PHRASES_FOLDER } from '../constants';
import { formatNumber, highestNumberInIndex, leadingNumber, linkedNumbers, referencedNumbersInIndex } from './numbering';

export const INDEX_HEADING = '# PhraseVault İndeksi';

export function createIndexContent(): string {
	return `${INDEX_HEADING}\n\n`;
}

/** Makes text safe to use as a wikilink alias on a single line. */
export function sanitizeAlias(text: string): string {
	return text
		.replace(/\|/g, '/')
		.replace(/\[/g, '(')
		.replace(/\]/g, ')')
		.replace(/\s+/g, ' ')
		.trim();
}

export function notePathFor(n: number): string {
	return `${PHRASES_FOLDER}/${formatNumber(n)}.md`;
}

export function formatIndexEntry(n: number, alias: string): string {
	const id = formatNumber(n);
	const safeAlias = sanitizeAlias(alias) || id;
	return `${id} — [[${PHRASES_FOLDER}/${id}|${safeAlias}]]`;
}

export class IndexConflictError extends Error {
	constructor(
		readonly entryNumber: number,
		readonly highestInIndex: number,
	) {
		super(`INDEX.md already refers to entry ${highestInIndex}, so ${entryNumber} cannot be appended.`);
		this.name = 'IndexConflictError';
	}
}

function detectEol(text: string): string {
	return text.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Appends one entry for `n`. Called inside Vault.process, so `current` is the
 * file content at write time. Throws IndexConflictError if the index already
 * refers to `n` or any higher number (it changed after `n` was chosen).
 */
export function appendEntry(current: string, n: number, alias: string): string {
	const highest = highestNumberInIndex(current);
	if (highest >= n) throw new IndexConflictError(n, highest);

	const eol = detectEol(current);
	const separator = current.length === 0 || current.endsWith('\n') ? '' : eol;
	return current + separator + formatIndexEntry(n, alias) + eol;
}

export interface IndexEntry {
	number: number;
	alias: string;
}

const ENTRY_LINE = new RegExp(
	String.raw`^[ \t]*\d+[ \t]+[—–-][ \t]+\[\[\s*${PHRASES_FOLDER}\/(\d+)(?:\.md)?\s*(?:\|([^\]\r\n]*))?\]\]`,
	'gim',
);

/** Entries in the standard format (used for duplicate detection). */
export function parseIndexEntries(indexText: string): IndexEntry[] {
	const entries: IndexEntry[] = [];
	for (const match of indexText.matchAll(ENTRY_LINE)) {
		const n = Number(match[1]);
		if (!Number.isSafeInteger(n) || n < 1) continue;
		entries.push({ number: n, alias: (match[2] ?? '').trim() });
	}
	return entries;
}

export interface RepairResult {
	text: string;
	added: number[];
}

/** The entry number of a line: its leading "0005 —", or else its first link. */
function lineNumber(line: string): number | null {
	return leadingNumber(line) ?? linkedNumbers(line)[0] ?? null;
}

/**
 * Adds entries for numbered notes the index does not refer to. Called inside
 * Vault.process, so `current` is the content at write time and numbers added
 * meanwhile are skipped. Each line is inserted before the first entry with a
 * higher number, or appended. Existing lines keep every byte, line endings
 * included.
 */
export function repairIndex(current: string, notes: ReadonlyArray<IndexEntry>): RepairResult {
	const referenced = referencedNumbersInIndex(current);
	const missing = notes
		.filter((note) => !referenced.has(note.number))
		.sort((a, b) => a.number - b.number)
		.filter((note, i, all) => i === 0 || all[i - 1]?.number !== note.number);
	if (missing.length === 0) return { text: current, added: [] };

	const eol = detectEol(current);
	// Each piece keeps its own line ending; only a missing final newline is added.
	const lines = current.length === 0 ? [] : current.split(/(?<=\n)/);
	const last = lines.length - 1;
	if (last >= 0 && !(lines[last] ?? '').endsWith('\n')) lines[last] = `${lines[last] ?? ''}${eol}`;

	for (const note of missing) {
		const entry = formatIndexEntry(note.number, note.alias) + eol;
		const insertAt = lines.findIndex((line) => {
			const n = lineNumber(line);
			return n !== null && n > note.number;
		});
		if (insertAt === -1) lines.push(entry);
		else lines.splice(insertAt, 0, entry);
	}

	return { text: lines.join(''), added: missing.map((note) => note.number) };
}
