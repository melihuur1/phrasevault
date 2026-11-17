import { beforeEach, describe, expect, it } from 'vitest';
import { createIndexContent } from '../../src/core/indexFile';
import type { PhraseDraft } from '../../src/core/types';
import { attachmentPathFor, PhraseStore, type AttachmentInput } from '../../src/vault/vaultStore';
import { FakeVault, MemoryHighWater } from '../helpers/FakeVault';

const DATE = '2026-11-17';
const HEADER = createIndexContent();

function draft(phrase: string, overrides: Partial<PhraseDraft> = {}): PhraseDraft {
	return {
		phrase,
		originalText: phrase,
		category: 'phrasal_verb',
		turkishMeaning: `${phrase} (tr)`,
		explanation: '',
		sourceSentence: '',
		usage: '',
		contextNote: '',
		sourceTranslation: '',
		exampleSentence: '',
		exampleTranslation: '',
		...overrides,
	};
}

function image(hash = '0123456789abcdef'): AttachmentInput {
	return { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).buffer, extension: 'png', hash };
}

function entryLine(n: string, alias: string): string {
	return `${n} — [[Phrases/${n}|${alias}]]`;
}

let vault: FakeVault;
let highWater: MemoryHighWater;
let store: PhraseStore;

beforeEach(() => {
	vault = new FakeVault();
	highWater = new MemoryHighWater();
	store = new PhraseStore(vault, highWater);
});

describe('ensureStructure', () => {
	it('creates the folders and an INDEX.md with no placeholder entries', async () => {
		expect(await store.ensureStructure()).toEqual({ indexCreated: true });
		expect(vault.kind('Phrases')).toBe('folder');
		expect(vault.kind('Attachments')).toBe('folder');
		expect(vault.text('INDEX.md')).toBe(HEADER);
		expect(vault.listFileNames('Phrases')).toEqual([]);
	});

	it('is idempotent and never overwrites an existing INDEX.md', async () => {
		vault.seedFile('INDEX.md', 'my own index\n');
		vault.seedFolder('Phrases');
		vault.seedFolder('Attachments');
		expect(await store.ensureStructure()).toEqual({ indexCreated: false });
		expect(vault.text('INDEX.md')).toBe('my own index\n');
		expect(vault.writes).toEqual([]);
	});

	it('reports a conflict when a required folder is a file, and writes nothing else', async () => {
		vault.seedFile('Phrases', 'not a folder');
		const report = await store.saveBatch({ image: image(), drafts: [draft('put off')], createdDate: DATE });
		expect(report.failure?.reason).toBe('structure_conflict');
		expect(report.notAttempted).toBe(1);
		expect(vault.text('Phrases')).toBe('not a folder');
		expect(vault.kind('INDEX.md')).toBeNull();
	});
});

describe('saveAttachment', () => {
	it('stores a screenshot once and reuses it for the same content hash', async () => {
		await store.ensureStructure();
		const first = await store.saveAttachment(image());
		const second = await store.saveAttachment(image());
		expect(first).toEqual({ path: 'Attachments/pv-0123456789abcdef.png', reused: false });
		expect(second).toEqual({ path: 'Attachments/pv-0123456789abcdef.png', reused: true });
		expect(vault.writes.filter((w) => w.startsWith('createBinary'))).toHaveLength(1);
		expect(new Uint8Array(vault.binary(first.path) ?? new ArrayBuffer(0))).toEqual(new Uint8Array(image().bytes));
	});

	it('rejects malformed hashes so file names stay predictable', () => {
		expect(() => attachmentPathFor({ hash: '../evil', extension: 'png' })).toThrow();
		expect(attachmentPathFor({ hash: 'ffffffffffffffff', extension: 'jpg' })).toBe('Attachments/pv-ffffffffffffffff.jpg');
	});
});

describe('saveBatch — normal saves', () => {
	it('saves several phrases from one screenshot: one attachment, sequential notes, appended index lines', async () => {
		const report = await store.saveBatch({
			image: image(),
			drafts: [draft('run out of'), draft('call it a day', { category: 'idiom' }), draft('put off')],
			createdDate: DATE,
		});

		expect(report.failure).toBeNull();
		expect(report.saved.map((e) => e.path)).toEqual(['Phrases/0001.md', 'Phrases/0002.md', 'Phrases/0003.md']);
		expect(vault.listFileNames('Attachments')).toEqual(['pv-0123456789abcdef.png']);
		for (const entry of report.saved) {
			expect(vault.text(entry.path)).toContain('![[Attachments/pv-0123456789abcdef.png]]');
		}
		expect(vault.text('INDEX.md')).toBe(
			`${HEADER}${entryLine('0001', 'run out of')}\n${entryLine('0002', 'call it a day')}\n${entryLine('0003', 'put off')}\n`,
		);
		expect(highWater.value).toBe(3);
	});

	it('continues after existing entries and keeps every earlier byte of INDEX.md', async () => {
		const existingIndex = `# My English index\n\nNotes I wrote myself.\n\n${entryLine('0001', 'come across')}\n${entryLine('0002', 'put off')}\n`;
		vault.seedFile('INDEX.md', existingIndex);
		vault.seedFile('Phrases/0001.md', 'my edited note 1');
		vault.seedFile('Phrases/0002.md', 'my edited note 2');
		vault.seedFolder('Attachments');

		const report = await store.saveBatch({ image: null, drafts: [draft('call it a day')], createdDate: DATE });

		expect(report.saved.map((e) => e.number)).toEqual([3]);
		const index = vault.text('INDEX.md') ?? '';
		expect(index.startsWith(existingIndex)).toBe(true);
		expect(index.slice(existingIndex.length)).toBe(`${entryLine('0003', 'call it a day')}\n`);
		expect(vault.text('Phrases/0001.md')).toBe('my edited note 1');
		expect(vault.text('Phrases/0002.md')).toBe('my edited note 2');
	});

	it('never writes into existing notes, including manual and empty ones', async () => {
		vault.seedFile('INDEX.md', `${HEADER}${entryLine('0001', 'a')}\n`);
		vault.seedFile('Phrases/0001.md', 'note 1');
		vault.seedFile('Phrases/0003.md', 'a note I created by hand');
		vault.seedFile('Phrases/0004.md', ''); // created by clicking a stale link

		const report = await store.saveBatch({ image: null, drafts: [draft('x')], createdDate: DATE });

		expect(report.saved.map((e) => e.number)).toEqual([5]);
		expect(vault.text('Phrases/0003.md')).toBe('a note I created by hand');
		expect(vault.text('Phrases/0004.md')).toBe('');
	});

	it('does not reuse the number of a deleted note whose index line remains', async () => {
		vault.seedFile('INDEX.md', `${HEADER}${entryLine('0001', 'a')}\n${entryLine('0002', 'b')}\n`);
		vault.seedFile('Phrases/0001.md', 'note 1'); // 0002.md was deleted
		const report = await store.saveBatch({ image: null, drafts: [draft('c')], createdDate: DATE });
		expect(report.saved.map((e) => e.number)).toEqual([3]);
		expect(vault.kind('Phrases/0002.md')).toBeNull();
	});

	it('does not reuse a number after both the note and its index line were deleted', async () => {
		await store.saveBatch({ image: null, drafts: [draft('a'), draft('b')], createdDate: DATE });
		vault.delete('Phrases/0002.md');
		await vault.process('INDEX.md', (text) => text.replace(`${entryLine('0002', 'b')}\n`, ''));

		const report = await store.saveBatch({ image: null, drafts: [draft('c')], createdDate: DATE });
		expect(report.saved.map((e) => e.number)).toEqual([3]);
	});

	it('numbers past 9999 with a five-digit file name', async () => {
		vault.seedFile('INDEX.md', `${HEADER}${entryLine('9999', 'last')}\n`);
		vault.seedFile('Phrases/9999.md', 'note');
		const report = await store.saveBatch({ image: null, drafts: [draft('next')], createdDate: DATE });
		expect(report.saved).toEqual([{ number: 10000, path: 'Phrases/10000.md', phrase: 'next' }]);
		expect(vault.text('INDEX.md')).toContain('10000 — [[Phrases/10000|next]]');
	});

	it('recreates a missing INDEX.md and continues after the existing notes', async () => {
		vault.seedFile('Phrases/0001.md', 'note 1');
		vault.seedFile('Phrases/0002.md', 'note 2');
		const report = await store.saveBatch({ image: null, drafts: [draft('c')], createdDate: DATE });
		expect(report.indexCreated).toBe(true);
		expect(report.saved.map((e) => e.number)).toEqual([3]);
		expect(vault.text('INDEX.md')).toBe(`${HEADER}${entryLine('0003', 'c')}\n`);
	});

	it('serializes concurrent batches so numbers never collide', async () => {
		const [a, b] = await Promise.all([
			store.saveBatch({ image: null, drafts: [draft('a1'), draft('a2')], createdDate: DATE }),
			store.saveBatch({ image: null, drafts: [draft('b1')], createdDate: DATE }),
		]);
		expect(a.saved.map((e) => e.number)).toEqual([1, 2]);
		expect(b.saved.map((e) => e.number)).toEqual([3]);
	});

	it('treats a failed high-water write as non-fatal', async () => {
		highWater.failOnSet = true;
		const report = await store.saveBatch({ image: null, drafts: [draft('a'), draft('b')], createdDate: DATE });
		expect(report.failure).toBeNull();
		expect(report.saved.map((e) => e.number)).toEqual([1, 2]);
	});
});

describe('saveBatch — collisions and partial failures', () => {
	it('moves to the next number when a note path appears just before creation', async () => {
		vault.beforeCreate = (path) => {
			if (path === 'Phrases/0001.md') {
				vault.beforeCreate = null;
				vault.seedFile(path, 'created by another process');
			}
		};
		const report = await store.saveBatch({ image: null, drafts: [draft('a')], createdDate: DATE });
		expect(report.saved.map((e) => e.number)).toEqual([2]);
		expect(vault.text('Phrases/0001.md')).toBe('created by another process');
	});

	it('gives up after repeated collisions without overwriting anything', async () => {
		vault.beforeCreate = (path) => {
			if (path.startsWith('Phrases/')) vault.seedFile(path, 'taken');
		};
		const report = await store.saveBatch({ image: null, drafts: [draft('a'), draft('b')], createdDate: DATE });
		expect(report.failure).toMatchObject({ reason: 'note_collision_limit', draftIndex: 0 });
		expect(report.notAttempted).toBe(1);
		expect(report.saved).toEqual([]);
		for (const name of vault.listFileNames('Phrases')) expect(vault.text(`Phrases/${name}`)).toBe('taken');
	});

	it('stops at a failed note write and reports what was saved and what was not attempted', async () => {
		vault.beforeCreate = (path) => {
			if (path === 'Phrases/0002.md') throw new Error('disk full');
		};
		const report = await store.saveBatch({ image: null, drafts: [draft('a'), draft('b'), draft('c')], createdDate: DATE });
		expect(report.saved.map((e) => e.number)).toEqual([1]);
		expect(report.failure).toEqual({ reason: 'note_write_failed', draftIndex: 1, detail: 'disk full' });
		expect(report.notAttempted).toBe(1);
		expect(vault.text('INDEX.md')).toBe(`${HEADER}${entryLine('0001', 'a')}\n`);
	});

	it('detects an index edit made while saving, keeps the note, and leaves the edit intact', async () => {
		await store.ensureStructure();
		vault.beforeProcess = (path) => {
			if (path !== 'INDEX.md') return;
			vault.beforeProcess = null;
			vault.seedFile('INDEX.md', `${HEADER}0007 — added by hand while saving\n`);
		};
		const report = await store.saveBatch({ image: null, drafts: [draft('a'), draft('b')], createdDate: DATE });

		expect(report.failure?.reason).toBe('index_conflict');
		expect(report.notIndexed).toEqual([{ number: 1, path: 'Phrases/0001.md', phrase: 'a' }]);
		expect(report.notAttempted).toBe(1);
		expect(vault.kind('Phrases/0001.md')).toBe('file');
		expect(vault.text('INDEX.md')).toBe(`${HEADER}0007 — added by hand while saving\n`);

		// The next save continues above both the orphan note and the hand-added number.
		const next = await store.saveBatch({ image: null, drafts: [draft('c')], createdDate: DATE });
		expect(next.saved.map((e) => e.number)).toEqual([8]);
	});

	it('reports an index write failure and keeps the already created note', async () => {
		vault.beforeProcess = () => {
			throw new Error('INDEX.md is locked');
		};
		const report = await store.saveBatch({ image: null, drafts: [draft('a')], createdDate: DATE });
		expect(report.failure).toEqual({ reason: 'index_write_failed', draftIndex: 0, detail: 'INDEX.md is locked' });
		expect(report.notIndexed.map((e) => e.number)).toEqual([1]);
		expect(vault.kind('Phrases/0001.md')).toBe('file');
		expect(highWater.value).toBe(1);
	});

	it('reports (instead of throwing) when INDEX.md cannot be read while picking a number', async () => {
		await store.ensureStructure();
		const originalRead = vault.read.bind(vault);
		vault.read = (path: string) => (path === 'INDEX.md' ? Promise.reject(new Error('read failed')) : originalRead(path));
		const report = await store.saveBatch({ image: null, drafts: [draft('a')], createdDate: DATE });
		expect(report.failure).toEqual({ reason: 'note_write_failed', draftIndex: 0, detail: 'read failed' });
		expect(vault.listFileNames('Phrases')).toEqual([]);
	});

	it('writes no notes when the attachment cannot be saved', async () => {
		vault.beforeCreate = (path) => {
			if (path.startsWith('Attachments/')) throw new Error('permission denied');
		};
		const report = await store.saveBatch({ image: image(), drafts: [draft('a'), draft('b')], createdDate: DATE });
		expect(report.failure).toMatchObject({ reason: 'attachment_failed', draftIndex: null });
		expect(report.notAttempted).toBe(2);
		expect(vault.listFileNames('Phrases')).toEqual([]);
	});
});

describe('numbering across restarts', () => {
	it('computes the same next number from a new store instance over the same vault', async () => {
		await store.saveBatch({ image: null, drafts: [draft('a'), draft('b')], createdDate: DATE });
		const before = await store.peekNextNumber();

		const restarted = new PhraseStore(vault, new MemoryHighWater(highWater.value));
		expect(await restarted.peekNextNumber()).toBe(before);

		// Even if data.json is lost, the vault contents prevent any collision.
		const withoutData = new PhraseStore(vault, new MemoryHighWater(0));
		expect(await withoutData.peekNextNumber()).toBe(before);
	});
});

describe('knownPhrases', () => {
	it('merges note frontmatter with index aliases (including hand-written notes)', async () => {
		await store.saveBatch({ image: null, drafts: [draft('put off', { turkishMeaning: 'ertelemek' })], createdDate: DATE });
		await vault.process('INDEX.md', (text) => `${text}0002 — [[Phrases/0002|come across]]\n`);
		vault.seedFile('Phrases/0002.md', 'hand-written note without frontmatter');
		vault.seedFile('Phrases/notes.md', '---\nphrase: "ignored"\n---\n');

		expect(await store.knownPhrases()).toEqual([
			{ number: 1, phrase: 'put off', meaning: 'ertelemek' },
			{ number: 2, phrase: 'come across', meaning: null },
		]);
	});
});

describe('index repair', () => {
	async function noteWithoutIndexLine(): Promise<void> {
		vault.beforeProcess = () => {
			vault.beforeProcess = null;
			throw new Error('INDEX.md is locked');
		};
		await store.saveBatch({ image: null, drafts: [draft('put off')], createdDate: DATE });
	}

	it('restores the entry of a note whose index line failed, without touching the note or other lines', async () => {
		await store.saveBatch({ image: null, drafts: [draft('come across')], createdDate: DATE });
		await noteWithoutIndexLine(); // 0002 has no index line
		await store.saveBatch({ image: null, drafts: [draft('give up')], createdDate: DATE });
		const noteBefore = vault.text('Phrases/0002.md');
		const writesBefore = vault.writes.length;

		const plan = await store.planIndexRepair();
		expect(plan.additions).toEqual([{ number: 2, alias: 'put off' }]);
		expect(plan.issues).toEqual([]);

		const result = await store.applyIndexRepair(plan.additions);
		expect(result).toEqual({ added: [2], indexCreated: false });
		expect(vault.text('INDEX.md')).toBe(`${HEADER}${entryLine('0001', 'come across')}\n${entryLine('0002', 'put off')}\n${entryLine('0003', 'give up')}\n`);
		expect(vault.text('Phrases/0002.md')).toBe(noteBefore);
		expect(vault.writes.slice(writesBefore)).toEqual(['process INDEX.md']);
	});

	it('keeps numbering going after a repair', async () => {
		await noteWithoutIndexLine();
		await store.applyIndexRepair((await store.planIndexRepair()).additions);
		const next = await store.saveBatch({ image: null, drafts: [draft('b')], createdDate: DATE });
		expect(next.saved.map((e) => e.number)).toEqual([2]);
	});

	it('re-checks INDEX.md at write time and never adds an entry twice', async () => {
		await noteWithoutIndexLine();
		const plan = await store.planIndexRepair();
		// The user adds the line by hand between the check and the repair.
		vault.beforeProcess = () => {
			vault.beforeProcess = null;
			vault.seedFile('INDEX.md', `${HEADER}0001 — put off (by hand)\n`);
		};
		const result = await store.applyIndexRepair(plan.additions);
		expect(result.added).toEqual([]);
		expect(vault.text('INDEX.md')).toBe(`${HEADER}0001 — put off (by hand)\n`);
	});

	it('skips an entry whose note was deleted after the check', async () => {
		await noteWithoutIndexLine();
		const plan = await store.planIndexRepair();
		vault.delete('Phrases/0001.md');
		expect((await store.applyIndexRepair(plan.additions)).added).toEqual([]);
		expect(vault.text('INDEX.md')).toBe(HEADER);
	});

	it('recreates a missing INDEX.md and lists every note again', async () => {
		await store.saveBatch({ image: null, drafts: [draft('a'), draft('b')], createdDate: DATE });
		vault.delete('INDEX.md');
		const plan = await store.planIndexRepair();
		expect(plan.indexExists).toBe(false);
		const result = await store.applyIndexRepair(plan.additions);
		expect(result).toEqual({ added: [1, 2], indexCreated: true });
		expect(vault.text('INDEX.md')).toBe(`${HEADER}${entryLine('0001', 'a')}\n${entryLine('0002', 'b')}\n`);
	});

	it('reports a hand-made note without frontmatter instead of guessing its name', async () => {
		await store.ensureStructure();
		vault.seedFile('Phrases/0004.md', 'my own note');
		const plan = await store.planIndexRepair();
		expect(plan.additions).toEqual([]);
		expect(plan.issues).toEqual([{ kind: 'no_phrase', number: 4, path: 'Phrases/0004.md' }]);
	});

	it('reports an unreadable note instead of failing', async () => {
		await store.ensureStructure();
		vault.seedFile('Phrases/0001.md', 'x');
		const originalRead = vault.read.bind(vault);
		vault.read = (path: string) => (path === 'Phrases/0001.md' ? Promise.reject(new Error('locked')) : originalRead(path));
		const plan = await store.planIndexRepair();
		expect(plan.issues).toEqual([{ kind: 'unreadable_note', number: 1, path: 'Phrases/0001.md' }]);
	});
});
