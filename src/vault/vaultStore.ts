// Writes phrase notes, the screenshot attachment, and INDEX.md entries.
//
// Safety rules:
// - Notes and attachments are only ever *created*; an existing file is never written.
// - INDEX.md is only appended to, and the append re-checks the file content at write time.
// - A note is created before its index line, so a failure can leave at most a note
//   without an index entry (fixable with "İndeksi onar"), never a lost note.
// - All saves are serialized so two batches can never pick the same number.

import { ATTACHMENTS_FOLDER, INDEX_PATH, MAX_CREATE_ATTEMPTS, PHRASES_FOLDER } from '../constants';
import { mergeKnownPhrases } from '../core/duplicates';
import { appendEntry, createIndexContent, IndexConflictError, notePathFor, parseIndexEntries } from '../core/indexFile';
import { renderNote } from '../core/noteMarkdown';
import { nextNumber, numberFromNoteFileName } from '../core/numbering';
import type { KnownPhrase, PhraseDraft } from '../core/types';
import type { HighWaterMark, VaultPort } from './vaultPort';

export type ImageExtension = 'png' | 'jpg';

export interface AttachmentInput {
	bytes: ArrayBuffer;
	extension: ImageExtension;
	/** Content hash (16 lowercase hex characters) used as a stable file name. */
	hash: string;
}

export interface SaveRequest {
	image: AttachmentInput | null;
	drafts: ReadonlyArray<PhraseDraft>;
	/** Local date as YYYY-MM-DD. */
	createdDate: string;
}

export interface SavedEntry {
	number: number;
	path: string;
	phrase: string;
}

export type SaveFailureReason =
	| 'structure_conflict'
	| 'structure_failed'
	| 'attachment_failed'
	| 'note_collision_limit'
	| 'note_write_failed'
	| 'index_conflict'
	| 'index_write_failed';

export interface SaveFailure {
	reason: SaveFailureReason;
	/** Index into `drafts` of the phrase that failed, or null for batch-level failures. */
	draftIndex: number | null;
	/** Technical detail for diagnostics (never contains secrets). */
	detail: string;
}

export interface SaveReport {
	/** Notes created and added to INDEX.md. */
	saved: SavedEntry[];
	/** Notes created whose index line could not be added. */
	notIndexed: SavedEntry[];
	failure: SaveFailure | null;
	/** Drafts after the failure that were not attempted. */
	notAttempted: number;
	attachmentPath: string | null;
	/** INDEX.md was missing and has been recreated during this save. */
	indexCreated: boolean;
}

export class StructureError extends Error {
	constructor(readonly path: string) {
		super(`Expected a folder or Markdown file at "${path}", but found something else.`);
		this.name = 'StructureError';
	}
}

const HASH_PATTERN = /^[0-9a-f]{16}$/;

export function attachmentPathFor(image: Pick<AttachmentInput, 'hash' | 'extension'>): string {
	if (!HASH_PATTERN.test(image.hash)) throw new Error('Invalid attachment hash');
	return `${ATTACHMENTS_FOLDER}/pv-${image.hash}.${image.extension}`;
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export class PhraseStore {
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly vault: VaultPort,
		private readonly highWater: HighWaterMark,
	) {}

	/** Runs tasks one at a time, in call order. */
	private serialize<T>(task: () => Promise<T>): Promise<T> {
		const run = this.queue.then(task, task);
		this.queue = run.catch(() => undefined);
		return run;
	}

	/** Creates missing folders and INDEX.md. Never overwrites anything. */
	async ensureStructure(): Promise<{ indexCreated: boolean }> {
		for (const folder of [PHRASES_FOLDER, ATTACHMENTS_FOLDER]) {
			const kind = this.vault.kind(folder);
			if (kind === 'file') throw new StructureError(folder);
			if (kind === null) await this.vault.createFolder(folder);
		}
		const indexKind = this.vault.kind(INDEX_PATH);
		if (indexKind === 'folder') throw new StructureError(INDEX_PATH);
		if (indexKind === null) {
			await this.vault.create(INDEX_PATH, createIndexContent());
			return { indexCreated: true };
		}
		return { indexCreated: false };
	}

	/** Saves the screenshot once; an identical screenshot (same hash) reuses the existing file. */
	async saveAttachment(image: AttachmentInput): Promise<{ path: string; reused: boolean }> {
		const path = attachmentPathFor(image);
		const kind = this.vault.kind(path);
		if (kind === 'file') return { path, reused: true };
		if (kind === 'folder') throw new StructureError(path);
		await this.vault.createBinary(path, image.bytes);
		return { path, reused: false };
	}

	private async readIndexOrNull(): Promise<string | null> {
		return this.vault.kind(INDEX_PATH) === 'file' ? this.vault.read(INDEX_PATH) : null;
	}

	private async computeNextNumber(): Promise<number> {
		return nextNumber({
			noteFileNames: this.vault.listFileNames(PHRASES_FOLDER),
			indexText: await this.readIndexOrNull(),
			lastIssuedNumber: this.highWater.get(),
		});
	}

	/** ensureStructure(), serialized with saves (used by the "prepare structure" command). */
	prepare(): Promise<{ indexCreated: boolean }> {
		return this.serialize(() => this.ensureStructure());
	}

	/** The number the next saved phrase will most likely get (for display only). */
	peekNextNumber(): Promise<number> {
		return this.serialize(() => this.computeNextNumber());
	}

	/** Phrases already in the vault, for duplicate warnings. */
	async knownPhrases(): Promise<KnownPhrase[]> {
		const fromNotes: KnownPhrase[] = [];
		for (const name of this.vault.listFileNames(PHRASES_FOLDER)) {
			const number = numberFromNoteFileName(name);
			if (number === null) continue;
			const fm = this.vault.getFrontmatter(`${PHRASES_FOLDER}/${name}`);
			const phrase = fm?.['phrase'];
			if (typeof phrase !== 'string' || phrase.trim() === '') continue;
			const meaning = fm?.['meaning_tr'];
			fromNotes.push({ number, phrase, meaning: typeof meaning === 'string' && meaning.trim() !== '' ? meaning : null });
		}
		const indexText = await this.readIndexOrNull();
		const fromIndex: KnownPhrase[] = indexText === null
			? []
			: parseIndexEntries(indexText)
				.filter((entry) => entry.alias !== '')
				.map((entry) => ({ number: entry.number, phrase: entry.alias, meaning: null }));
		return mergeKnownPhrases(fromNotes, fromIndex);
	}

	/** Creates one note at the next free number, trying the following number on a collision. */
	private async createNote(
		draft: PhraseDraft,
		screenshotPath: string | null,
		createdDate: string,
	): Promise<{ entry: SavedEntry } | { failure: Omit<SaveFailure, 'draftIndex'> }> {
		let lastTried = 0;
		for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
			let n: number;
			let path: string;
			let markdown: string;
			try {
				// Recompute each time: the vault may have changed since the previous attempt.
				n = Math.max(await this.computeNextNumber(), lastTried + 1);
				path = notePathFor(n);
				markdown = renderNote({ ...draft, number: n, screenshotPath, createdDate });
			} catch (error) {
				return { failure: { reason: 'note_write_failed', detail: describe(error) } };
			}
			lastTried = n;
			if (this.vault.kind(path) !== null) continue; // never touch an existing file
			try {
				await this.vault.create(path, markdown);
				return { entry: { number: n, path, phrase: draft.phrase } };
			} catch (error) {
				// Someone created the same path in the meantime: move on to the next number.
				if (this.vault.kind(path) !== null) continue;
				return { failure: { reason: 'note_write_failed', detail: describe(error) } };
			}
		}
		return {
			failure: { reason: 'note_collision_limit', detail: `No free note path after ${MAX_CREATE_ATTEMPTS} attempts` },
		};
	}

	private async recordIssued(n: number): Promise<void> {
		if (n <= this.highWater.get()) return;
		try {
			await this.highWater.set(n);
		} catch {
			// Non-fatal: numbering still follows the notes and INDEX.md in the vault.
		}
	}

	/** Saves the given drafts in order. Stops at the first failure and reports exactly what happened. */
	saveBatch(request: SaveRequest): Promise<SaveReport> {
		return this.serialize(async () => {
			const report: SaveReport = {
				saved: [],
				notIndexed: [],
				failure: null,
				notAttempted: 0,
				attachmentPath: null,
				indexCreated: false,
			};
			const total = request.drafts.length;

			try {
				report.indexCreated = (await this.ensureStructure()).indexCreated;
			} catch (error) {
				report.failure = {
					reason: error instanceof StructureError ? 'structure_conflict' : 'structure_failed',
					draftIndex: null,
					detail: describe(error),
				};
				report.notAttempted = total;
				return report;
			}

			if (request.image !== null) {
				try {
					report.attachmentPath = (await this.saveAttachment(request.image)).path;
				} catch (error) {
					report.failure = { reason: 'attachment_failed', draftIndex: null, detail: describe(error) };
					report.notAttempted = total;
					return report;
				}
			}

			for (const [i, draft] of request.drafts.entries()) {
				const created = await this.createNote(draft, report.attachmentPath, request.createdDate);
				if ('failure' in created) {
					report.failure = { ...created.failure, draftIndex: i };
					report.notAttempted = total - i - 1;
					return report;
				}

				const { entry } = created;
				try {
					await this.vault.process(INDEX_PATH, (current) => appendEntry(current, entry.number, entry.phrase));
				} catch (error) {
					report.notIndexed.push(entry);
					await this.recordIssued(entry.number);
					report.failure = {
						reason: error instanceof IndexConflictError ? 'index_conflict' : 'index_write_failed',
						draftIndex: i,
						detail: describe(error),
					};
					report.notAttempted = total - i - 1;
					return report;
				}

				await this.recordIssued(entry.number);
				report.saved.push(entry);
			}
			return report;
		});
	}
}
