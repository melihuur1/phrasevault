// Review logic behind the suggestion cards: selection, required fields, and
// duplicate warnings. Pure (no DOM), so the whole decision flow is unit tested.

import type { AnalysisResult } from '../ai/validate';
import { isSourceMismatch } from '../ai/validate';
import { findBatchDuplicates, findDuplicates } from '../core/duplicates';
import type { KnownPhrase, PhraseDraft } from '../core/types';

export interface CardState extends PhraseDraft {
	id: number;
	selected: boolean;
	highlighted: boolean;
	/** Added by the user rather than suggested by the AI. */
	manual: boolean;
	/** The user explicitly confirmed saving although the phrase already exists. */
	overrideDuplicate: boolean;
}

export interface CardIssues {
	missingPhrase: boolean;
	missingMeaning: boolean;
	/** Matching entries already in the vault. */
	existing: KnownPhrase[];
	/** Same phrase as an earlier selected card in this batch. */
	batchDuplicate: boolean;
	sourceMismatch: boolean;
	/** A duplicate that needs explicit confirmation before saving. */
	needsOverride: boolean;
	/** Prevents saving: selected and either incomplete or an unconfirmed duplicate. */
	blocking: boolean;
}

export function cardsFromAnalysis(result: AnalysisResult, nextId: () => number): CardState[] {
	return result.suggestions.map((s) => ({
		id: nextId(),
		phrase: s.phrase,
		originalText: s.originalText,
		category: s.category,
		turkishMeaning: s.turkishMeaning,
		explanation: s.explanation,
		sourceSentence: s.sourceSentence,
		selected: true,
		highlighted: s.highlighted,
		manual: false,
		overrideDuplicate: false,
	}));
}

export function blankCard(id: number): CardState {
	return {
		id,
		phrase: '',
		originalText: '',
		category: 'expression',
		turkishMeaning: '',
		explanation: '',
		sourceSentence: '',
		selected: true,
		highlighted: false,
		manual: true,
		overrideDuplicate: false,
	};
}

/** Evaluates every card; the result is aligned with `cards` by index. */
export function evaluateCards(cards: ReadonlyArray<CardState>, known: ReadonlyArray<KnownPhrase>): CardIssues[] {
	const selectedIndexes = cards.flatMap((card, i) => (card.selected ? [i] : []));
	const batch = findBatchDuplicates(selectedIndexes.map((i) => cards[i]?.phrase ?? ''));
	const batchDuplicateIndexes = new Set(selectedIndexes.filter((_, j) => (batch[j]?.length ?? 0) > 0));

	return cards.map((card, i) => {
		const missingPhrase = card.phrase.trim() === '';
		const missingMeaning = card.turkishMeaning.trim() === '';
		const existing = missingPhrase ? [] : findDuplicates(card.phrase, known);
		const batchDuplicate = batchDuplicateIndexes.has(i);
		const needsOverride = existing.length > 0 || batchDuplicate;
		return {
			missingPhrase,
			missingMeaning,
			existing,
			batchDuplicate,
			sourceMismatch: isSourceMismatch(card.originalText, card.sourceSentence),
			needsOverride,
			blocking: card.selected && (missingPhrase || missingMeaning || (needsOverride && !card.overrideDuplicate)),
		};
	});
}

export type SavePlan =
	| { ok: true; drafts: PhraseDraft[]; cardIds: number[] }
	| { ok: false; reason: 'nothing_selected' }
	| { ok: false; reason: 'blocked'; blockedIds: number[] };

function toDraft(card: CardState): PhraseDraft {
	return {
		phrase: card.phrase.trim(),
		originalText: card.originalText.trim(),
		category: card.category,
		turkishMeaning: card.turkishMeaning.trim(),
		explanation: card.explanation.trim(),
		sourceSentence: card.sourceSentence.trim(),
	};
}

/** Decides what can be saved. Nothing is saved while any selected card has a blocking issue. */
export function planSave(cards: ReadonlyArray<CardState>, known: ReadonlyArray<KnownPhrase>): SavePlan {
	const selected = cards.filter((card) => card.selected);
	if (selected.length === 0) return { ok: false, reason: 'nothing_selected' };
	const issues = evaluateCards(cards, known);
	const blockedIds = cards.filter((_, i) => issues[i]?.blocking === true).map((card) => card.id);
	if (blockedIds.length > 0) return { ok: false, reason: 'blocked', blockedIds };
	return { ok: true, drafts: selected.map(toDraft), cardIds: selected.map((card) => card.id) };
}
