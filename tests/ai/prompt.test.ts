import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT, USER_INSTRUCTION } from '../../src/ai/prompt';
import { ANALYSIS_JSON_SCHEMA } from '../../src/ai/schema';
import { PHRASE_CATEGORIES } from '../../src/core/types';

// The prompt cannot be judged offline; these tests only make sure the rules
// that the Turkish output quality depends on stay in it, and match the schema.

describe('SYSTEM_PROMPT', () => {
	it('describes every field of the structured output', () => {
		for (const field of Object.keys(ANALYSIS_JSON_SCHEMA.properties.suggestions.items.properties)) {
			expect(SYSTEM_PROMPT).toContain(`"${field}"`);
		}
		for (const category of PHRASE_CATEGORIES) expect(SYSTEM_PROMPT).toContain(category);
		for (const status of ANALYSIS_JSON_SCHEMA.properties.status.enum) expect(SYSTEM_PROMPT).toContain(`"${status}"`);
	});

	it('asks for contextual, natural Turkish instead of word-by-word translations', () => {
		expect(SYSTEM_PROMPT).toMatch(/means in this sentence/);
		expect(SYSTEM_PROMPT).toMatch(/never word by word/);
		expect(SYSTEM_PROMPT).toMatch(/native Turkish speaker/);
		expect(SYSTEM_PROMPT).toContain('"paydos etmek" (not "ona bir gün demek")');
	});

	it('keeps explanations short and non-repetitive', () => {
		expect(SYSTEM_PROMPT).toMatch(/one or two short Turkish sentences \(at most about 25 words\)/);
		expect(SYSTEM_PROMPT).toMatch(/Do not repeat "turkishMeaning"/);
	});

	it('keeps the dictionary form and the original wording separate, and the sentence verbatim', () => {
		expect(SYSTEM_PROMPT).toMatch(/"phrase" is the dictionary form/);
		expect(SYSTEM_PROMPT).toMatch(/never replace one with the other/);
		expect(SYSTEM_PROMPT).toMatch(/copied character-for-character/);
		expect(SYSTEM_PROMPT).toMatch(/even if the original has mistakes/);
	});

	it('marks the style example as an example only', () => {
		expect(SYSTEM_PROMPT).toMatch(/never return it unless it is in the image/);
	});

	it('never includes anything from the vault', () => {
		expect(SYSTEM_PROMPT).not.toMatch(/\[\[|INDEX\.md|Phrases\//);
		expect(USER_INSTRUCTION).not.toMatch(/\[\[|INDEX\.md|Phrases\//);
	});
});
