// All user-facing Turkish text lives here. Code and identifiers stay in English.

import type { PhraseCategory } from '../core/types';

export const CATEGORY_LABELS: Record<PhraseCategory, string> = {
	phrasal_verb: 'Phrasal verb',
	idiom: 'Deyim',
	collocation: 'Eşdizim (collocation)',
	expression: 'Kalıp ifade',
};

export const NOTE_LABELS = {
	category: 'Kategori',
	meaning: 'Türkçe anlam',
	explanation: 'Açıklama',
	createdOn: 'Eklenme tarihi',
} as const;
