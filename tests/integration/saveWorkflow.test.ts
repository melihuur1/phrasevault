// End-to-end workflow with a mocked AI and an in-memory vault:
// screenshot bytes → import checks → (mocked) analysis → review/edit → duplicate
// checks → save → notes, one attachment, appended INDEX.md lines.
// No network, no API key, no real vault.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APIConnectionError, APIUserAbortError } from '@anthropic-ai/sdk';
import type { Message } from '@anthropic-ai/sdk/resources/messages/messages';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnalyzeError, analyzeScreenshot, DEFAULT_MODEL, type SendMessage } from '../../src/ai/analyze';
import { bytesToBase64, extensionOf, importImageBytes, toArrayBuffer, type ImportedImage } from '../../src/core/imageInput';
import { createIndexContent } from '../../src/core/indexFile';
import { blankCard, cardsFromAnalysis, planSave, remainingCardsAfterSave, type CardState } from '../../src/ui/reviewModel';
import { PhraseStore, type SaveRequest } from '../../src/vault/vaultStore';
import { FakeVault, MemoryHighWater } from '../helpers/FakeVault';
import { makePng } from '../helpers/images';

const DATE = '2026-11-17';
const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', 'ai', name), 'utf8');

function respondWith(text: string): SendMessage {
	return () =>
		Promise.resolve({
			id: 'msg_test',
			type: 'message',
			role: 'assistant',
			model: DEFAULT_MODEL,
			content: [{ type: 'text', text, citations: null }],
			stop_reason: 'end_turn',
			stop_sequence: null,
			usage: { input_tokens: 1, output_tokens: 1 },
		} as unknown as Message);
}

function failWith(error: Error): SendMessage {
	return () => Promise.reject(error);
}

let vault: FakeVault;
let store: PhraseStore;
let ids: () => number;

beforeEach(() => {
	vault = new FakeVault();
	store = new PhraseStore(vault, new MemoryHighWater());
	let n = 0;
	ids = () => ++n;
});

async function importScreenshot(width = 1280, height = 720): Promise<ImportedImage> {
	const result = await importImageBytes(makePng(width, height));
	if (!result.ok) throw new Error(`import failed: ${result.problem}`);
	return result.image;
}

async function analyze(image: ImportedImage, send: SendMessage): Promise<CardState[]> {
	const result = await analyzeScreenshot(send, { base64: bytesToBase64(image.bytes), mediaType: 'image/png' }, { model: DEFAULT_MODEL });
	return cardsFromAnalysis(result, ids);
}

function request(image: ImportedImage | null, drafts: SaveRequest['drafts']): SaveRequest {
	return {
		image: image === null ? null : { bytes: toArrayBuffer(image.bytes), extension: extensionOf(image.format), hash: image.hash },
		drafts,
		createdDate: DATE,
	};
}

async function saveCards(image: ImportedImage | null, cards: CardState[]) {
	const plan = planSave(cards, await store.knownPhrases());
	if (!plan.ok) throw new Error(`save blocked: ${plan.reason}`);
	return { plan, report: await store.saveBatch(request(image, plan.drafts)) };
}

describe('screenshot → suggestions → numbered notes', () => {
	it('saves the selected, edited suggestions from one unmarked screenshot (Case B)', async () => {
		const image = await importScreenshot();
		const cards = await analyze(image, respondWith(fixture('unmarked.json')));
		expect(cards.map((c) => c.phrase)).toEqual(['run out of', 'call it a day', 'put off']);

		// The user deselects one suggestion and corrects a meaning.
		cards[1]!.selected = false;
		cards[0]!.turkishMeaning = 'tükenmek';

		const { report } = await saveCards(image, cards);

		expect(report.failure).toBeNull();
		expect(report.saved.map((e) => [e.number, e.path, e.phrase])).toEqual([
			[1, 'Phrases/0001.md', 'run out of'],
			[2, 'Phrases/0002.md', 'put off'],
		]);
		// The screenshot is stored once and embedded in both notes.
		const attachment = `Attachments/pv-${image.hash}.png`;
		expect(vault.listFileNames('Attachments')).toEqual([`pv-${image.hash}.png`]);
		expect(vault.text('Phrases/0001.md')).toContain(`![[${attachment}]]`);
		expect(vault.text('Phrases/0002.md')).toContain(`![[${attachment}]]`);
		// User edits and the original wording are in the note.
		expect(vault.text('Phrases/0001.md')).toContain('**Türkçe anlam:** tükenmek');
		expect(vault.text('Phrases/0002.md')).toContain('> Her colleagues had been **putting off** the task for weeks.');
		// INDEX.md grows by exactly the saved entries — no placeholders.
		expect(vault.text('INDEX.md')).toBe(`${createIndexContent()}0001 — [[Phrases/0001|run out of]]\n0002 — [[Phrases/0002|put off]]\n`);
	});

	it('requires explicit confirmation for an already saved phrase and gives it a new number (Case A)', async () => {
		const first = await importScreenshot();
		await saveCards(first, await analyze(first, respondWith(fixture('unmarked.json'))));
		const indexBefore = vault.text('INDEX.md') ?? '';
		const notesBefore = vault.listFileNames('Phrases').map((name) => [name, vault.text(`Phrases/${name}`)]);

		// A later highlighted screenshot suggests "come across" plus a repeat of "put off".
		const second = await importScreenshot(1600, 900);
		const cards = await analyze(second, respondWith(fixture('highlighted.json')));
		expect(cards[0]).toMatchObject({ phrase: 'come across', highlighted: true });
		cards.push({ ...blankCard(ids()), phrase: 'Put off', turkishMeaning: 'caydırmak, soğutmak' });

		const known = await store.knownPhrases();
		const blocked = planSave(cards, known);
		expect(blocked).toEqual({ ok: false, reason: 'blocked', blockedIds: [cards[2]!.id] });

		cards[2]!.overrideDuplicate = true;
		const { report } = await saveCards(second, cards);

		expect(report.saved.map((e) => [e.number, e.phrase])).toEqual([
			[4, 'come across'],
			[5, 'for weeks'],
			[6, 'Put off'],
		]);
		// Existing notes and every earlier byte of INDEX.md are untouched.
		const index = vault.text('INDEX.md') ?? '';
		expect(index.startsWith(indexBefore)).toBe(true);
		for (const [name, text] of notesBefore) expect(vault.text(`Phrases/${name}`)).toBe(text);
		expect(vault.text('Phrases/0006.md')).toContain('**Türkçe anlam:** caydırmak, soğutmak');
	});

	it('reuses the stored screenshot when the same image is imported again', async () => {
		const image = await importScreenshot();
		await saveCards(image, [{ ...blankCard(ids()), phrase: 'a', turkishMeaning: 'x' }]);
		const again = await importScreenshot();
		expect(again.hash).toBe(image.hash);
		await saveCards(again, [{ ...blankCard(ids()), phrase: 'b', turkishMeaning: 'y' }]);

		expect(vault.writes.filter((w) => w.startsWith('createBinary'))).toHaveLength(1);
		expect(vault.text('Phrases/0002.md')).toContain(`![[Attachments/pv-${image.hash}.png]]`);
	});
});

describe('when the AI cannot help', () => {
	it('falls back to manual entry after a network error', async () => {
		const image = await importScreenshot();
		const error = await analyze(image, failWith(new APIConnectionError({ message: 'offline' }))).catch((e: unknown) => e);
		expect((error as AnalyzeError).code).toBe('network');
		expect(vault.writes).toEqual([]);

		const manual = { ...blankCard(ids()), phrase: 'take over', turkishMeaning: 'devralmak', category: 'phrasal_verb' as const };
		const { report } = await saveCards(image, [manual]);
		expect(report.saved.map((e) => e.path)).toEqual(['Phrases/0001.md']);
	});

	it('creates no cards for an empty response, and nothing can be saved until the user adds one', async () => {
		const image = await importScreenshot();
		const cards = await analyze(image, respondWith(fixture('empty.json')));
		expect(cards).toEqual([]);
		expect(planSave(cards, [])).toEqual({ ok: false, reason: 'nothing_selected' });
	});

	it('writes nothing to the vault when the analysis is cancelled or invalid', async () => {
		const image = await importScreenshot();
		for (const send of [failWith(new APIUserAbortError()), respondWith('not json')]) {
			await analyze(image, send).catch(() => undefined);
		}
		expect(vault.writes).toEqual([]);
	});
});

describe('partial save failures', () => {
	it('reports exactly what was saved and lets the remaining cards be retried without duplicates', async () => {
		const image = await importScreenshot();
		const cards = await analyze(image, respondWith(fixture('unmarked.json')));

		vault.beforeCreate = (path) => {
			if (path === 'Phrases/0002.md') throw new Error('disk full');
		};
		const { plan, report } = await saveCards(image, cards);
		expect(report.saved.map((e) => e.number)).toEqual([1]);
		expect(report.failure).toMatchObject({ reason: 'note_write_failed', draftIndex: 1 });
		expect(report.notAttempted).toBe(1);

		// Retry the remaining two cards after the problem is fixed.
		vault.beforeCreate = null;
		const remaining = remainingCardsAfterSave(cards, plan.cardIds, report.saved.length + report.notIndexed.length);
		expect(remaining.map((c) => c.phrase)).toEqual(['call it a day', 'put off']);
		const retry = await saveCards(image, remaining);

		expect(retry.report.saved.map((e) => e.number)).toEqual([2, 3]);
		expect(vault.listFileNames('Phrases').sort()).toEqual(['0001.md', '0002.md', '0003.md']);
		expect(vault.text('INDEX.md')).toBe(
			`${createIndexContent()}0001 — [[Phrases/0001|run out of]]\n0002 — [[Phrases/0002|call it a day]]\n0003 — [[Phrases/0003|put off]]\n`,
		);
	});

	it('never re-creates a note whose index line failed, so a retry cannot duplicate it', async () => {
		const image = await importScreenshot();
		const cards = await analyze(image, respondWith(fixture('unmarked.json')));
		let failed = false;
		vault.beforeProcess = () => {
			if (!failed) {
				failed = true;
				throw new Error('INDEX.md locked');
			}
		};
		const { plan, report } = await saveCards(image, cards);
		expect(report.notIndexed.map((e) => e.number)).toEqual([1]);

		const remaining = remainingCardsAfterSave(cards, plan.cardIds, report.saved.length + report.notIndexed.length);
		expect(remaining.map((c) => c.phrase)).toEqual(['call it a day', 'put off']);
		const retry = await saveCards(image, remaining);
		expect(retry.report.saved.map((e) => e.number)).toEqual([2, 3]);
		expect(vault.text('Phrases/0001.md')).toContain('# run out of');
	});
});
