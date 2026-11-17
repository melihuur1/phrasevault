import { describe, expect, it } from 'vitest';
import { estimateCost, findModelPricing, formatUsd, promptTokens, readUsage, type TokenUsage } from '../../src/core/cost';

const PICO_PER_USD = 1_000_000_000_000;

function usage(overrides: Partial<TokenUsage> = {}): TokenUsage {
	return {
		inputTokens: 0,
		outputTokens: 0,
		cacheWrite5mTokens: 0,
		cacheWrite1hTokens: 0,
		cacheWriteUnknownTtlTokens: 0,
		cacheReadTokens: 0,
		webSearchRequests: 0,
		serviceTier: 'standard',
		speed: null,
		inferenceGeo: null,
		...overrides,
	};
}

function pico(model: string, u: TokenUsage): number {
	const estimate = estimateCost(model, u);
	if (!estimate.ok) throw new Error(`no estimate: ${estimate.reason}`);
	return estimate.picoUsd;
}

describe('readUsage', () => {
	it('reads a full usage object from the API', () => {
		const read = readUsage({
			input_tokens: 2912,
			output_tokens: 1044,
			cache_creation_input_tokens: 300,
			cache_read_input_tokens: 700,
			cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 },
			server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 },
			service_tier: 'standard',
			speed: 'standard',
			inference_geo: 'global',
			output_tokens_details: { thinking_tokens: 600 },
		});
		expect(read).toEqual({
			inputTokens: 2912,
			outputTokens: 1044,
			cacheWrite5mTokens: 100,
			cacheWrite1hTokens: 200,
			cacheWriteUnknownTtlTokens: 0,
			cacheReadTokens: 700,
			webSearchRequests: 1,
			serviceTier: 'standard',
			speed: 'standard',
			inferenceGeo: 'global',
		});
	});

	it('treats absent or null optional counts as "not used"', () => {
		expect(
			readUsage({ input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: null, cache_read_input_tokens: null, cache_creation: null }),
		).toMatchObject({ cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheWriteUnknownTtlTokens: 0, cacheReadTokens: 0, serviceTier: null });
	});

	it('keeps cache writes without a TTL breakdown separate instead of guessing their price', () => {
		expect(readUsage({ input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 400 })?.cacheWriteUnknownTtlTokens).toBe(400);
		expect(
			readUsage({
				input_tokens: 10,
				output_tokens: 5,
				cache_creation_input_tokens: 400,
				cache_creation: { ephemeral_5m_input_tokens: 400, ephemeral_1h_input_tokens: 0 },
			})?.cacheWriteUnknownTtlTokens,
		).toBe(0);
	});

	it.each([
		['no usage at all', undefined],
		['null usage', null],
		['missing input tokens', { output_tokens: 5 }],
		['missing output tokens', { input_tokens: 5 }],
		['null input tokens', { input_tokens: null, output_tokens: 5 }],
		['negative counts', { input_tokens: -1, output_tokens: 5 }],
		['fractional counts', { input_tokens: 1.5, output_tokens: 5 }],
		['counts as strings', { input_tokens: '10', output_tokens: 5 }],
		['a malformed cache count', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 'lots' }],
	])('returns null for %s, so no cost is computed from made-up numbers', (_label, raw) => {
		expect(readUsage(raw)).toBeNull();
	});
});

describe('estimateCost — Claude Haiku 5.5', () => {
	it('prices input and output at $0.10 / $0.50 per million tokens', () => {
		// 2912 × $0.10/M + 1044 × $0.50/M = $0.0002912 + $0.000522 = $0.0008132
		expect(pico('claude-haiku-5-5', usage({ inputTokens: 2912, outputTokens: 1044 }))).toBe(813_200_000);
	});

	it('uses only the reported input tokens: image tokens are not estimated or added again', () => {
		// A 2576 px screenshot is ~4,784 image tokens, already inside input_tokens.
		const withImage = usage({ inputTokens: 5_800, outputTokens: 0 });
		expect(pico('claude-haiku-5-5', withImage)).toBe(5_800 * 100_000);
	});

	it('prices cache writes (5 min / 1 h) and cache reads separately', () => {
		const u = usage({ cacheWrite5mTokens: 1_000, cacheWrite1hTokens: 2_000, cacheReadTokens: 3_000 });
		// $0.125/M, $0.20/M, $0.01/M
		expect(pico('claude-haiku-5-5', u)).toBe(1_000 * 125_000 + 2_000 * 200_000 + 3_000 * 10_000);
	});

	it('switches every category to the higher prices when the prompt is over 100,000 tokens', () => {
		const u = usage({ inputTokens: 100_001, outputTokens: 1_000 });
		const estimate = estimateCost('claude-haiku-5-5', u);
		expect(estimate).toMatchObject({ ok: true, longContext: true });
		expect(pico('claude-haiku-5-5', u)).toBe(100_001 * 500_000 + 1_000 * 2_500_000);
	});

	it('keeps standard prices at exactly 100,000 prompt tokens', () => {
		const estimate = estimateCost('claude-haiku-5-5', usage({ inputTokens: 100_000 }));
		expect(estimate).toMatchObject({ ok: true, longContext: false, picoUsd: 100_000 * 100_000 });
	});

	it('counts cache reads and writes towards the long-context threshold', () => {
		const u = usage({ inputTokens: 40_000, cacheReadTokens: 50_000, cacheWrite5mTokens: 10_001 });
		expect(promptTokens(u)).toBe(100_001);
		expect(estimateCost('claude-haiku-5-5', u)).toMatchObject({ ok: true, longContext: true });
	});

	it('applies the 1.1x multiplier for US-only inference', () => {
		const estimate = estimateCost('claude-haiku-5-5', usage({ inputTokens: 1_000, outputTokens: 1_000, inferenceGeo: 'us' }));
		expect(estimate).toMatchObject({ ok: true, usInference: true, picoUsd: 660_000_000 });
	});

	it('uses standard prices for global routing or when no region is reported', () => {
		for (const inferenceGeo of ['global', null]) {
			expect(estimateCost('claude-haiku-5-5', usage({ inputTokens: 1_000, inferenceGeo }))).toMatchObject({ ok: true, usInference: false });
		}
	});

	it('adds web searches reported by the response ($10 per 1,000)', () => {
		expect(pico('claude-haiku-5-5', usage({ webSearchRequests: 2 }))).toBe(0.02 * PICO_PER_USD);
	});

	it('accepts dated snapshot IDs and ignores case and surrounding spaces', () => {
		expect(findModelPricing('claude-haiku-5-5-20261015')?.label).toBe('Claude Haiku 5.5');
		expect(findModelPricing('  Claude-Haiku-5-5 ')?.label).toBe('Claude Haiku 5.5');
	});
});

describe('estimateCost — other models', () => {
	it('prices Claude Sonnet 5.5 and Claude Opus 5.5 from the same table', () => {
		const u = usage({ inputTokens: 1_000, outputTokens: 1_000, cacheReadTokens: 1_000 });
		expect(pico('claude-sonnet-5-5', u)).toBe(1_000 * 2_000_000 + 1_000 * 10_000_000 + 1_000 * 100_000);
		expect(pico('claude-opus-5-5', u)).toBe(1_000 * 4_000_000 + 1_000 * 20_000_000 + 1_000 * 200_000);
	});
});

describe('estimateCost — when no reliable estimate is possible', () => {
	it.each([
		['usage is missing', 'claude-haiku-5-5', null, 'no_usage'],
		['the model has no known price', 'claude-unknown-1', usage({ inputTokens: 10 }), 'unknown_model'],
		['the request ran on Priority Tier', 'claude-haiku-5-5', usage({ serviceTier: 'priority' }), 'unsupported_tier'],
		['the request ran as a batch', 'claude-haiku-5-5', usage({ serviceTier: 'batch' }), 'unsupported_tier'],
		['fast mode was used', 'claude-haiku-5-5', usage({ speed: 'fast' }), 'unsupported_speed'],
		['an unknown region is reported', 'claude-haiku-5-5', usage({ inferenceGeo: 'eu' }), 'unsupported_region'],
		['cache writes have no TTL breakdown', 'claude-haiku-5-5', usage({ cacheWriteUnknownTtlTokens: 5 }), 'unknown_cache_ttl'],
	] as const)('reports a reason instead of $0 when %s', (_label, model, u, reason) => {
		expect(estimateCost(model, u)).toEqual({ ok: false, reason });
	});

	it('treats a response without a service tier as the standard tier', () => {
		expect(estimateCost('claude-haiku-5-5', usage({ inputTokens: 10, serviceTier: null }))).toMatchObject({ ok: true });
	});
});

describe('formatUsd', () => {
	it.each([
		[0, '$0.000000'],
		[813_200_000, '$0.000813'],
		[813_500_000, '$0.000814'], // half rounds up
		[813_499_999, '$0.000813'],
		[500_000, '$0.000001'],
		[1_500_000_000_000, '$1.500000'],
		[1_234_567_890_123, '$1.234568'],
		[12 * PICO_PER_USD, '$12.000000'],
	])('formats %i picodollars as %s', (amount, text) => {
		expect(formatUsd(amount)).toBe(text);
	});

	it('never shows a positive amount as zero', () => {
		expect(formatUsd(1)).toBe('<$0.000001');
		expect(formatUsd(499_999)).toBe('<$0.000001');
	});
});
