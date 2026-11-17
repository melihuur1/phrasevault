import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT, USER_INSTRUCTION } from '../../src/ai/prompt';
import { ANALYSIS_JSON_SCHEMA, MAX_SUGGESTIONS } from '../../src/ai/schema';
import { PHRASE_CATEGORIES } from '../../src/core/types';

// The prompt cannot be judged offline: whether the model really finds every
// construction or writes natural Turkish is checked by hand in Obsidian. These
// tests only make sure the rules the quality depends on stay in the prompt and
// match the schema.

describe('SYSTEM_PROMPT — contract with the schema', () => {
	it('describes every field of the structured output', () => {
		for (const field of Object.keys(ANALYSIS_JSON_SCHEMA.properties.suggestions.items.properties)) {
			expect(SYSTEM_PROMPT).toContain(`"${field}"`);
		}
		for (const category of PHRASE_CATEGORIES) expect(SYSTEM_PROMPT).toContain(category);
		for (const status of ANALYSIS_JSON_SCHEMA.properties.status.enum) expect(SYSTEM_PROMPT).toContain(`"${status}"`);
	});

	it('states the same upper limit as the schema and the validator', () => {
		expect(MAX_SUGGESTIONS).toBe(8);
		expect(SYSTEM_PROMPT).toContain('return at most 8');
	});

	it('never includes anything from the vault', () => {
		expect(SYSTEM_PROMPT).not.toMatch(/\[\[|INDEX\.md|Phrases\//);
		expect(USER_INSTRUCTION).not.toMatch(/\[\[|INDEX\.md|Phrases\//);
	});
});

describe('SYSTEM_PROMPT — what to extract (regression: "be meant to" was missed)', () => {
	it('asks for grammatical constructions, with "be meant to" as a named example', () => {
		expect(SYSTEM_PROMPT).toMatch(/grammatical constructions worth learning \(such as "be meant to"/);
		expect(SYSTEM_PROMPT).toContain('grammar_pattern (a grammatical construction');
		expect(SYSTEM_PROMPT).toContain('"were meant to" → "be meant to"');
	});

	it('asks for every expression in a sentence, including adjacent or overlapping ones', () => {
		expect(SYSTEM_PROMPT).toMatch(/even when they are adjacent or overlap/);
		expect(SYSTEM_PROMPT).toMatch(/Do not stop at the most obvious idiom/);
	});

	it('rules out meaningless fragments of larger expressions', () => {
		expect(SYSTEM_PROMPT).toMatch(/Never return a fragment of a larger expression/);
		expect(SYSTEM_PROMPT).toContain('for "pick up the slack" return only the idiom');
		expect(SYSTEM_PROMPT).toContain('"looking forward to hearing from you" contains "look forward to" and "hear from"');
	});

	it('puts quality over quantity and forbids filler', () => {
		expect(SYSTEM_PROMPT).toMatch(/Quality over quantity/);
		expect(SYSTEM_PROMPT).toMatch(/Never add filler to reach a number/);
	});

	it('keeps the user regression sentence out of the prompt, so manual testing stays honest', () => {
		expect(SYSTEM_PROMPT).not.toContain('None of them were meant to make it');
	});
});

describe('SYSTEM_PROMPT — explanations, ambiguity and translations', () => {
	it('asks for the meaning in this sentence instead of a dictionary definition', () => {
		expect(SYSTEM_PROMPT).toMatch(/"turkishMeaning" is what the expression means in this sentence/);
		expect(SYSTEM_PROMPT).toMatch(/no generic dictionary definition/);
		expect(SYSTEM_PROMPT).toContain('"paydos etmek" (not "ona bir gün demek")');
	});

	it('asks for a short usage note that adds something new', () => {
		expect(SYSTEM_PROMPT).toMatch(/"usage" is one or two sentences on how the expression works/);
		expect(SYSTEM_PROMPT).toMatch(/Teach something the explanation did not/);
		expect(SYSTEM_PROMPT).toMatch(/Do not say the same thing in two fields/);
	});

	it('requires ambiguity to be stated instead of guessed', () => {
		expect(SYSTEM_PROMPT).toMatch(/"contextNote" is an empty string when the meaning is clear/);
		expect(SYSTEM_PROMPT).toMatch(/name the possible readings instead of choosing one/);
		expect(SYSTEM_PROMPT).toMatch(/Never present a guess as certain/);
	});

	it('asks for natural, not word-by-word, translations only of visible text', () => {
		expect(SYSTEM_PROMPT).toMatch(/"sourceTranslation" is a natural Turkish translation of the whole source sentence, not word by word/);
		expect(SYSTEM_PROMPT).toMatch(/Use an empty string when "sourceSentence" is empty/);
	});

	it('keeps generated examples apart from screenshot text', () => {
		expect(SYSTEM_PROMPT).toMatch(/one new, realistic English sentence/);
		expect(SYSTEM_PROMPT).toMatch(/Never copy or reword the source sentence/);
		expect(SYSTEM_PROMPT).toMatch(/only when it shows something the source sentence does not/);
	});

	it('keeps the dictionary form and the original wording separate, and the sentence verbatim', () => {
		expect(SYSTEM_PROMPT).toMatch(/"phrase" is the dictionary form/);
		expect(SYSTEM_PROMPT).toMatch(/never replace one with the other/);
		expect(SYSTEM_PROMPT).toMatch(/copied character-for-character/);
	});

	it('marks the worked example as an example only', () => {
		expect(SYSTEM_PROMPT).toMatch(/style only; never return it unless it is in the image/);
	});
});
