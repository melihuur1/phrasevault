import { describe, expect, it } from 'vitest';
import { parseAnalysisText } from '../../src/ai/validate';
import type { KnownPhrase } from '../../src/core/types';
import { blankCard, cardsFromAnalysis, describeNumberRange, evaluateCards, planSave, remainingCardsAfterSave, type CardState } from '../../src/ui/reviewModel';
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

describe('describeNumberRange', () => {
	it('formats single numbers, consecutive runs and gaps', () => {
		expect(describeNumberRange([])).toBe('');
		expect(describeNumberRange([4])).toBe('0004');
		expect(describeNumberRange([6, 4, 5])).toBe('0004–0006');
		expect(describeNumberRange([4, 7])).toBe('0004, 0007');
		expect(describeNumberRange([9999, 10000])).toBe('9999–10000');
	});
});
