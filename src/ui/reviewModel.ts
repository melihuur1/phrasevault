// Review logic behind the suggestion cards: selection, required fields, and
// duplicate warnings. Pure (no DOM), so the whole decision flow is unit tested.

import type { AnalysisResult } from '../ai/validate';
import { isSourceMismatch } from '../ai/validate';
import { findBatchDuplicates, findDuplicates } from '../core/duplicates';
import { formatNumber } from '../core/numbering';
import type { KnownPhrase, LearningDetails, PhraseDraft } from '../core/types';

export interface CardState extends PhraseDraft {
	id: number;
	selected: boolean;
	highlighted: boolean;
	/** Added by the user rather than suggested by the AI. */
	manual: boolean;
	/** The user explicitly confirmed saving although the phrase already exists. */
	overrideDuplicate: boolean;
	/** The longer suggestion this one is only a part of; such cards start unselected. */
	partOf: string | null;
}

export interface CardIssues {
	missingPhrase: boolean;
	missingMeaning: boolean;
	/** Matching entries already in the vault. */
	existing: KnownPhrase[];
	/** Same phrase as an earlier selected card in this batch. */
	batchDuplicate: boolean;
	sourceMismatch: boolean;
	/** The card says the visible context does not settle the meaning. */
	ambiguousContext: boolean;
	/** A duplicate that needs explicit confirmation before saving. */
	needsOverride: boolean;
	/** Prevents saving: selected and either incomplete or an unconfirmed duplicate. */
	blocking: boolean;
}

const EMPTY_DETAILS: LearningDetails = { usage: '', contextNote: '', sourceTranslation: '', exampleSentence: '', exampleTranslation: '' };

export function cardsFromAnalysis(result: AnalysisResult, nextId: () => number): CardState[] {
	return result.suggestions.map((s) => ({
		id: nextId(),
		phrase: s.phrase,
		originalText: s.originalText,
		category: s.category,
		turkishMeaning: s.turkishMeaning,
		explanation: s.explanation,
		sourceSentence: s.sourceSentence,
		usage: s.usage,
		contextNote: s.contextNote,
		sourceTranslation: s.sourceTranslation,
		exampleSentence: s.exampleSentence,
		exampleTranslation: s.exampleTranslation,
		// A fragment of a longer suggestion is shown but not saved unless the user wants it.
		selected: s.partOf === null,
		highlighted: s.highlighted,
		manual: false,
		overrideDuplicate: false,
		partOf: s.partOf,
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
		...EMPTY_DETAILS,
		selected: true,
		highlighted: false,
		manual: true,
		overrideDuplicate: false,
		partOf: null,
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
			ambiguousContext: card.contextNote.trim() !== '',
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
		usage: card.usage.trim(),
		contextNote: card.contextNote.trim(),
		sourceTranslation: card.sourceTranslation.trim(),
		exampleSentence: card.exampleSentence.trim(),
		exampleTranslation: card.exampleTranslation.trim(),
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

/**
 * After a save, drops the cards whose note was created (the first `createdCount`
 * saved cards, in order) and keeps the rest — failed, not attempted, or not
 * selected — so the user can fix and retry without creating duplicates.
 */
export function remainingCardsAfterSave(
	cards: ReadonlyArray<CardState>,
	savedCardIds: ReadonlyArray<number>,
	createdCount: number,
): CardState[] {
	const done = new Set(savedCardIds.slice(0, createdCount));
	return cards.filter((card) => !done.has(card.id)).map((card) => ({ ...card, overrideDuplicate: false }));
}

/** Everything the user can change on a card, as a comparable value. */
export function snapshotCard(card: CardState): string {
	return JSON.stringify([
		card.phrase,
		card.originalText,
		card.category,
		card.turkishMeaning,
		card.explanation,
		card.sourceSentence,
		card.usage,
		card.contextNote,
		card.sourceTranslation,
		card.exampleSentence,
		card.exampleTranslation,
		card.selected,
		card.overrideDuplicate,
	]);
}

export function snapshotCards(cards: ReadonlyArray<CardState>): Map<number, string> {
	return new Map(cards.map((card) => [card.id, snapshotCard(card)]));
}

function hasContent(card: CardState): boolean {
	return [
		card.phrase,
		card.originalText,
		card.turkishMeaning,
		card.explanation,
		card.sourceSentence,
		card.usage,
		card.contextNote,
		card.sourceTranslation,
		card.exampleSentence,
		card.exampleTranslation,
	].some((value) => value.trim() !== '');
}

/**
 * True when discarding the cards would lose something: an edited suggestion,
 * a manual card with content, or a card that was meant to be saved but was not
 * (cards missing from `baseline`). Untouched AI suggestions are not "unsaved":
 * the same analysis can be shown again from this session's cache for free.
 */
export function hasUnsavedChanges(cards: ReadonlyArray<CardState>, baseline: ReadonlyMap<number, string>): boolean {
	return cards.some((card) => {
		const saved = baseline.get(card.id);
		if (saved !== undefined) return saved !== snapshotCard(card);
		return card.manual ? hasContent(card) : true;
	});
}

/** "0004" for one number, "0004–0006" for a consecutive run, otherwise a list. */
export function describeNumberRange(numbers: ReadonlyArray<number>): string {
	const sorted = [...numbers].sort((a, b) => a - b);
	const first = sorted[0];
	const last = sorted[sorted.length - 1];
	if (first === undefined || last === undefined) return '';
	if (first === last) return formatNumber(first);
	const consecutive = sorted.every((n, i) => n === first + i);
	return consecutive ? `${formatNumber(first)}–${formatNumber(last)}` : sorted.map(formatNumber).join(', ');
}
