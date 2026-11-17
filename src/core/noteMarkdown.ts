// Renders the Markdown for one phrase note. Pure: no Obsidian imports.

import { CATEGORY_LABELS, NOTE_LABELS } from '../i18n/tr';
import type { PhraseDraft } from './types';

export interface NoteInput extends PhraseDraft {
	number: number;
	/** Vault-relative path of the screenshot, or null when there is none. */
	screenshotPath: string | null;
	/** Local date as YYYY-MM-DD. */
	createdDate: string;
}

/** Collapses text to one clean line (no control characters or Unicode line separators). */
export function singleLine(text: string): string {
	return text
		// eslint-disable-next-line no-control-regex -- deliberately stripping control characters
		.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * A YAML double-quoted scalar. JSON string syntax is valid YAML, and singleLine()
 * removes the characters (control codes, U+2028/2029) where the two differ.
 */
export function yamlString(value: string): string {
	return JSON.stringify(singleLine(value));
}

export function formatLocalDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * Bolds the first case-insensitive occurrence of `original` inside `sentence`.
 * Returns the sentence unchanged when it is not found, so nothing is invented.
 */
export function highlightInSentence(sentence: string, original: string): string {
	const needle = original.trim();
	if (needle === '' || needle.includes('*')) return sentence;
	const at = sentence.toLowerCase().indexOf(needle.toLowerCase());
	if (at === -1) return sentence;
	const end = at + needle.length;
	return `${sentence.slice(0, at)}**${sentence.slice(at, end)}**${sentence.slice(end)}`;
}

/**
 * The complete note: frontmatter with the stable keys (used for duplicate
 * detection and "İndeksi onar"), then every educational detail in the body.
 * Text from the screenshot and generated text are labelled separately.
 */
export function renderNote(input: NoteInput): string {
	const phrase = singleLine(input.phrase);
	const original = singleLine(input.originalText);
	const meaning = singleLine(input.turkishMeaning);
	const explanation = singleLine(input.explanation);
	const sentence = singleLine(input.sourceSentence);
	const usage = singleLine(input.usage);
	const contextNote = singleLine(input.contextNote);
	const sentenceTranslation = singleLine(input.sourceTranslation);
	const example = singleLine(input.exampleSentence);
	const exampleTranslation = singleLine(input.exampleTranslation);
	const screenshotLink = input.screenshotPath === null ? '' : `[[${input.screenshotPath}]]`;

	const frontmatter = [
		'---',
		`phrase: ${yamlString(phrase)}`,
		`original_text: ${yamlString(original)}`,
		`category: ${yamlString(input.category)}`,
		`meaning_tr: ${yamlString(meaning)}`,
		`source_sentence: ${yamlString(sentence)}`,
		`screenshot: ${yamlString(screenshotLink)}`,
		`created: ${yamlString(input.createdDate)}`,
		`number: ${input.number}`,
		'tags:',
		'  - phrasevault',
		'---',
	];

	const line = (label: string, text: string): string[] => (text === '' ? [] : [`**${label}:** ${text}`]);

	const details = [
		...line(NOTE_LABELS.category, CATEGORY_LABELS[input.category]),
		...line(NOTE_LABELS.meaning, meaning),
		...line(NOTE_LABELS.explanation, explanation),
		...line(NOTE_LABELS.usage, usage),
		...line(NOTE_LABELS.contextNote, contextNote),
	];

	const sections: string[] = [`# ${phrase}`, details.join('\n')];
	if (sentence !== '') sections.push(`**${NOTE_LABELS.sourceSentence}:**\n> ${highlightInSentence(sentence, original)}`);
	sections.push(...line(NOTE_LABELS.sourceTranslation, sentenceTranslation));
	if (example !== '') {
		sections.push([...line(NOTE_LABELS.example, example), ...line(NOTE_LABELS.exampleTranslation, exampleTranslation)].join('\n'));
	}
	if (input.screenshotPath !== null) sections.push(`!${screenshotLink}`);
	sections.push(`*${NOTE_LABELS.createdOn}: ${input.createdDate}*`);

	return `${frontmatter.join('\n')}\n${sections.join('\n\n')}\n`;
}
