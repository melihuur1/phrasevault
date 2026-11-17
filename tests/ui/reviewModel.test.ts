import { describe, expect, it } from 'vitest';
import { parseAnalysisText } from '../../src/ai/validate';
import type { KnownPhrase } from '../../src/core/types';
import {
	blankCard,
	cardsFromAnalysis,
	describeNumberRange,
	evaluateCards,
	hasUnsavedChanges,
	planSave,
	remainingCardsAfterSave,
	snapshotCards,
	type CardState,
} from '../../src/ui/reviewModel';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', 'ai', name), 'utf8');

function ids() {
	let n = 0;
	return () => ++n;
}

const known: KnownPhrase[] = [{ number: 2, phrase: 'put off', meaning: 'ertelemek' }];

describe('cardsFromAnalysis', () => {
	it('creates one selected, editable card per suggestion', () => {
		const cards = cardsFromAnalysis(parseAnalysisText(fixture('unmarked.json')), ids());
		expect(cards.map((c) => [c.id, c.phrase, c.selected, c.manual])).toEqual([
			[1, 'run out of', true, false],
			[2, 'call it a day', true, false],
			[3, 'put off', true, false],
		]);
	});

	it('creates no cards for an empty analysis', () => {
		expect(cardsFromAnalysis(parseAnalysisText(fixture('empty.json')), ids())).toEqual([]);
	});
});

describe('evaluateCards', () => {
	it('flags missing required fields only', () => {
		const card = { ...blankCard(1), phrase: 'come across' };
		const [issues] = evaluateCards([card], []);
		expect(issues).toMatchObject({ missingPhrase: false, missingMeaning: true, blocking: true });
	});

	it('flags an existing phrase and requires an explicit override', () => {
		const card: CardState = { ...blankCard(1), phrase: 'Put off', turkishMeaning: 'caydırmak' };
		const [issues] = evaluateCards([card], known);
		expect(issues?.existing.map((e) => e.number)).toEqual([2]);
		expect(issues?.blocking).toBe(true);

		const [confirmed] = evaluateCards([{ ...card, overrideDuplicate: true }], known);
		expect(confirmed?.blocking).toBe(false);
	});

	it('flags a repeated phrase within the batch, but only among selected cards', () => {
		const a: CardState = { ...blankCard(1), phrase: 'give up', turkishMeaning: 'pes etmek' };
		const b: CardState = { ...blankCard(2), phrase: 'Give up', turkishMeaning: 'bırakmak' };
		expect(evaluateCards([a, b], []).map((i) => i.batchDuplicate)).toEqual([false, true]);
		expect(evaluateCards([{ ...a, selected: false }, b], []).map((i) => i.batchDuplicate)).toEqual([false, false]);
	});

	it('does not block deselected cards, even when incomplete', () => {
		const [issues] = evaluateCards([{ ...blankCard(1), selected: false }], []);
		expect(issues?.blocking).toBe(false);
	});

	it('recomputes the source mismatch from the edited fields', () => {
		const card: CardState = { ...blankCard(1), phrase: 'give up', originalText: 'gave in', sourceSentence: 'She gave up.', turkishMeaning: 'x' };
		expect(evaluateCards([card], [])[0]?.sourceMismatch).toBe(true);
		expect(evaluateCards([{ ...card, originalText: 'gave up' }], [])[0]?.sourceMismatch).toBe(false);
	});
});

describe('planSave', () => {
	const cards = () => cardsFromAnalysis(parseAnalysisText(fixture('unmarked.json')), ids());

	it('saves only the selected cards, with trimmed user edits', () => {
		const list = cards();
		list[1]!.selected = false;
		list[0]!.turkishMeaning = '  tükenmek  ';
		const plan = planSave(list, []);
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		expect(plan.cardIds).toEqual([1, 3]);
		expect(plan.drafts.map((d) => [d.phrase, d.turkishMeaning])).toEqual([
			['run out of', 'tükenmek'],
			['put off', 'ertelemek'],
		]);
	});

	it('refuses to save when nothing is selected', () => {
		const list = cards().map((c) => ({ ...c, selected: false }));
		expect(planSave(list, [])).toEqual({ ok: false, reason: 'nothing_selected' });
	});

	it('blocks the whole save until a duplicate is confirmed', () => {
		const list = cards();
		expect(planSave(list, known)).toEqual({ ok: false, reason: 'blocked', blockedIds: [3] });
		list[2]!.overrideDuplicate = true;
		expect(planSave(list, known).ok).toBe(true);
	});

	it('lets a manual card be saved once it has a phrase and a meaning', () => {
		const manual = blankCard(9);
		expect(planSave([manual], [])).toEqual({ ok: false, reason: 'blocked', blockedIds: [9] });
		const plan = planSave([{ ...manual, phrase: 'take over', turkishMeaning: 'devralmak' }], []);
		expect(plan).toMatchObject({ ok: true, cardIds: [9] });
	});
});

describe('remainingCardsAfterSave', () => {
	it('keeps failed, not attempted and deselected cards, and resets duplicate confirmations', () => {
		const list: CardState[] = [1, 2, 3, 4].map((id) => ({ ...blankCard(id), phrase: `p${id}`, turkishMeaning: 'x', overrideDuplicate: true }));
		list[3]!.selected = false;
		// Cards 1, 2, 3 were saved in order; only the first note was created before a failure.
		const remaining = remainingCardsAfterSave(list, [1, 2, 3], 1);
		expect(remaining.map((c) => c.id)).toEqual([2, 3, 4]);
		expect(remaining.every((c) => !c.overrideDuplicate)).toBe(true);
	});
});

describe('hasUnsavedChanges', () => {
	const fresh = () => cardsFromAnalysis(parseAnalysisText(fixture('unmarked.json')), ids());

	it('is false for untouched AI suggestions (they can be shown again for free)', () => {
		const cards = fresh();
		expect(hasUnsavedChanges(cards, snapshotCards(cards))).toBe(false);
	});

	it('is false when there are no cards', () => {
		expect(hasUnsavedChanges([], new Map())).toBe(false);
	});

	it.each([
		['an edited meaning', (c: CardState) => ({ ...c, turkishMeaning: 'tükenmek' })],
		['an edited phrase', (c: CardState) => ({ ...c, phrase: 'run out' })],
		['a changed category', (c: CardState) => ({ ...c, category: 'idiom' as const })],
		['a deselected card', (c: CardState) => ({ ...c, selected: false })],
		['a confirmed duplicate', (c: CardState) => ({ ...c, overrideDuplicate: true })],
	])('is true after %s', (_label, edit) => {
		const cards = fresh();
		const baseline = snapshotCards(cards);
		const [first, ...rest] = cards;
		if (first === undefined) throw new Error('fixture');
		expect(hasUnsavedChanges([edit(first), ...rest], baseline)).toBe(true);
	});

	it('is false again when an edit is undone', () => {
		const cards = fresh();
		const baseline = snapshotCards(cards);
		const first = cards[0];
		if (first === undefined) throw new Error('fixture');
		const original = first.turkishMeaning;
		first.turkishMeaning = 'x';
		first.turkishMeaning = original;
		expect(hasUnsavedChanges(cards, baseline)).toBe(false);
	});

	it('ignores an empty manual card but not one with content', () => {
		const blank = blankCard(10);
		expect(hasUnsavedChanges([blank], new Map())).toBe(false);
		expect(hasUnsavedChanges([{ ...blank, category: 'idiom' }], new Map())).toBe(false);
		expect(hasUnsavedChanges([{ ...blank, phrase: 'come across' }], new Map())).toBe(true);
		expect(hasUnsavedChanges([{ ...blank, explanation: ' not empty ' }], new Map())).toBe(true);
	});

	it('treats cards that failed to save as unsaved, but not cards left unselected on purpose', () => {
		const cards = fresh(); // ids 1, 2, 3
		const deselected = cards.map((c) => (c.id === 2 ? { ...c, selected: false } : c));
		// Card 1 was saved, card 3 failed; card 2 was not part of the save.
		const remaining = remainingCardsAfterSave(deselected, [1, 3], 1);
		const attempted = new Set([1, 3]);
		const baseline = snapshotCards(remaining.filter((c) => !attempted.has(c.id)));
		expect(remaining.map((c) => c.id)).toEqual([2, 3]);
		expect(hasUnsavedChanges(remaining, baseline)).toBe(true);
		expect(hasUnsavedChanges(remaining.filter((c) => c.id === 2), baseline)).toBe(false);
	});
});

describe('describeNumberRange', () => {
	it('formats single numbers, consecutive runs and gaps', () => {
		expect(describeNumberRange([])).toBe('');
		expect(describeNumberRange([4])).toBe('0004');
		expect(describeNumberRange([6, 4, 5])).toBe('0004–0006');
		expect(describeNumberRange([4, 7])).toBe('0004, 0007');
		expect(describeNumberRange([9999, 10000])).toBe('9999–10000');
	});
});
