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
		expect(SYSTEM_PROMPT).toMatch(/Never return a fragment that has no meaning of its own/);
		expect(SYSTEM_PROMPT).toContain('for "pick up the slack" return only the idiom');
	});

	it('puts quality over quantity and forbids filler', () => {
		expect(SYSTEM_PROMPT).toMatch(/Quality over quantity/);
		expect(SYSTEM_PROMPT).toMatch(/Never add filler to reach a number/);
		expect(SYSTEM_PROMPT).not.toMatch(/exactly (?:8|eight)/i);
	});

	it('keeps the user regression sentences out of the prompt, so manual testing stays honest', () => {
		expect(SYSTEM_PROMPT).not.toContain('None of them were meant to make it');
		// Both Haiku and Sonnet missed "hear from" here; the prompt must teach the
		// rule with other sentences, not with the answer.
		expect(SYSTEM_PROMPT).not.toMatch(/hear(?:ing)? from|looking forward to/i);
	});
});

describe('SYSTEM_PROMPT — nested expressions and priority (regression: "hear from" was missed)', () => {
	it('asks to look inside every construction for an expression with its own meaning', () => {
		expect(SYSTEM_PROMPT).toMatch(/Look inside every construction you find/);
		expect(SYSTEM_PROMPT).toMatch(/The words that fill its slots/);
		expect(SYSTEM_PROMPT).toContain(`"She's used to putting up with the noise" contains "be used to" and "put up with"`);
		expect(SYSTEM_PROMPT).toContain('"You\'d better get rid of it" contains "had better" and "get rid of"');
		expect(SYSTEM_PROMPT).toMatch(/A nested expression is just as worth learning as the construction around it/);
	});

	it('separates a nested expression from a fragment with one question', () => {
		expect(SYSTEM_PROMPT).toMatch(/ask whether a learner would use the shorter expression, in this sense, in other sentences/);
		expect(SYSTEM_PROMPT).toMatch(/if yes, it is a nested expression \(rule 8\); if not, it is a fragment/);
		// The cross-reference must point at the nested-expression rule.
		expect(SYSTEM_PROMPT).toMatch(/\n8\. Look inside every construction/);
	});

	it('drops generic structures first at the limit and keeps nested expressions', () => {
		expect(SYSTEM_PROMPT).toMatch(/If a text has more candidates than that, drop the most generic, everyday structures first/);
		expect(SYSTEM_PROMPT).toContain('("have to", "want to", "be able to", "there is")');
		expect(SYSTEM_PROMPT).toMatch(/keep phrasal verbs, idioms and collocations, including nested ones/);
	});

	it('asks for complete canonical forms instead of cut-down ones', () => {
		expect(SYSTEM_PROMPT).toMatch(/Give the complete form, never a cut-down one/);
		expect(SYSTEM_PROMPT).toContain('("put something behind you", not "put behind"');
		expect(SYSTEM_PROMPT).toContain('Do not add objects the expression does not need ("put off", "give up", "run out of")');
		expect(SYSTEM_PROMPT).toContain('include the words that stand in for it ("put it all behind her")');
		expect(ANALYSIS_JSON_SCHEMA.properties.suggestions.items.properties.phrase.description).toContain('not "put behind"');
	});

	it('numbers the rules without gaps', () => {
		const numbers = [...SYSTEM_PROMPT.split('Example of the expected depth')[0]!.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
		expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1));
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
