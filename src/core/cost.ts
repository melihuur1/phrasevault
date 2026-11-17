// Local cost estimate for one Messages API response, computed only from the
// token counts the API reports in `usage`. Nothing is estimated on the side:
// image tokens are already part of `input_tokens`, and thinking tokens are
// already part of `output_tokens`.
//
// Money is handled as integer picodollars (1 USD = 10^12 pUSD) so sums and
// rounding are exact. Every listed per-million-token price is a whole number
// of picodollars per token ($0.125/MTok = 125,000 pUSD per token).

/** Official source of the prices below. */
export const PRICING_SOURCE_URL = 'https://platform.claude.com/docs/en/about-claude/pricing';
/** Date the prices below were last checked against PRICING_SOURCE_URL. */
export const PRICING_VERIFIED_ON = '2026-11-18';

/** USD per million tokens. */
export interface PriceTier {
	input: number;
	cacheWrite5m: number;
	cacheWrite1h: number;
	cacheRead: number;
	output: number;
}

export interface ModelPricing {
	label: string;
	standard: PriceTier;
	/** Higher prices for a request whose prompt is over `thresholdTokens`. */
	longContext?: { thresholdTokens: number; tier: PriceTier };
}

// Standard (non-batch) Claude API prices, verified on PRICING_VERIFIED_ON.
const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
	'claude-haiku-5-5': {
		label: 'Claude Haiku 5.5',
		standard: { input: 0.1, cacheWrite5m: 0.125, cacheWrite1h: 0.2, cacheRead: 0.01, output: 0.5 },
		longContext: {
			thresholdTokens: 100_000,
			tier: { input: 0.5, cacheWrite5m: 0.625, cacheWrite1h: 1, cacheRead: 0.05, output: 2.5 },
		},
	},
	'claude-sonnet-5-5': {
		label: 'Claude Sonnet 5.5',
		standard: { input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.1, output: 10 },
	},
	'claude-opus-5-5': {
		label: 'Claude Opus 5.5',
		standard: { input: 4, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2, output: 20 },
	},
};

/** Web search server tool: $10 per 1,000 searches (PhraseVault never enables it). */
const WEB_SEARCH_PICO_USD = 10_000_000_000;
/** US-only inference (`inference_geo: "us"`) costs 1.1x on every token category for these models. */
const US_INFERENCE_NUMERATOR = 11;
const US_INFERENCE_DENOMINATOR = 10;

const PICO_PER_MICRO = 1_000_000;
const MICRO_PER_USD = 1_000_000;

/** Token counts as reported by the API response. */
export interface TokenUsage {
	/** Uncached input tokens, image tokens included. */
	inputTokens: number;
	/** Output tokens, thinking tokens included. */
	outputTokens: number;
	cacheWrite5mTokens: number;
	cacheWrite1hTokens: number;
	/** Cache-write tokens the API did not break down by TTL (cannot be priced). */
	cacheWriteUnknownTtlTokens: number;
	cacheReadTokens: number;
	webSearchRequests: number;
	serviceTier: string | null;
	speed: string | null;
	inferenceGeo: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

const INVALID = Symbol('invalid');

/** A token count: absent or null means "not used" (0); anything else must be a non-negative integer. */
function count(value: unknown): number | typeof INVALID {
	if (value === undefined || value === null) return 0;
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : INVALID;
}

function label(value: unknown): string | null {
	return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Reads the API's `usage` object. Returns null when the required counts are
 * missing or malformed, so no cost is ever computed from made-up numbers.
 */
export function readUsage(raw: unknown): TokenUsage | null {
	if (!isRecord(raw)) return null;
	if (typeof raw['input_tokens'] !== 'number' || typeof raw['output_tokens'] !== 'number') return null;

	const input = count(raw['input_tokens']);
	const output = count(raw['output_tokens']);
	const cacheRead = count(raw['cache_read_input_tokens']);
	const cacheWriteTotal = count(raw['cache_creation_input_tokens']);
	const breakdown = raw['cache_creation'];
	const write5m = isRecord(breakdown) ? count(breakdown['ephemeral_5m_input_tokens']) : 0;
	const write1h = isRecord(breakdown) ? count(breakdown['ephemeral_1h_input_tokens']) : 0;
	const serverTools = raw['server_tool_use'];
	const webSearch = isRecord(serverTools) ? count(serverTools['web_search_requests']) : 0;

	if (
		input === INVALID ||
		output === INVALID ||
		cacheRead === INVALID ||
		cacheWriteTotal === INVALID ||
		write5m === INVALID ||
		write1h === INVALID ||
		webSearch === INVALID
	) {
		return null;
	}

	return {
		inputTokens: input,
		outputTokens: output,
		cacheWrite5mTokens: write5m,
		cacheWrite1hTokens: write1h,
		cacheWriteUnknownTtlTokens: Math.max(0, cacheWriteTotal - write5m - write1h),
		cacheReadTokens: cacheRead,
		webSearchRequests: webSearch,
		serviceTier: label(raw['service_tier']),
		speed: label(raw['speed']),
		inferenceGeo: label(raw['inference_geo']),
	};
}

export function totalCacheWriteTokens(usage: TokenUsage): number {
	return usage.cacheWrite5mTokens + usage.cacheWrite1hTokens + usage.cacheWriteUnknownTtlTokens;
}

/** Prompt length used for long-context pricing: all input tokens, cache reads and writes included. */
export function promptTokens(usage: TokenUsage): number {
	return usage.inputTokens + usage.cacheReadTokens + totalCacheWriteTokens(usage);
}

/** Finds prices for a model ID, also accepting dated snapshot IDs such as "claude-haiku-5-5-20261015". */
export function findModelPricing(model: string): ModelPricing | null {
	const id = model.trim().toLowerCase();
	const exact = MODEL_PRICING[id];
	if (exact !== undefined) return exact;
	const snapshot = /^(.+)-\d{8}$/.exec(id);
	return snapshot?.[1] !== undefined ? (MODEL_PRICING[snapshot[1]] ?? null) : null;
}

export type CostUnavailableReason =
	| 'no_usage'
	| 'unknown_model'
	| 'unsupported_tier'
	| 'unsupported_speed'
	| 'unsupported_region'
	| 'unknown_cache_ttl';

export type CostEstimate =
	| {
			ok: true;
			picoUsd: number;
			pricingLabel: string;
			/** The prompt was over the long-context threshold, so the higher prices applied. */
			longContext: boolean;
			/** US-only inference (1.1x) applied. */
			usInference: boolean;
	  }
	| { ok: false; reason: CostUnavailableReason };

/** pUSD per token for a price in USD per million tokens. */
function picoPerToken(usdPerMillion: number): number {
	return Math.round(usdPerMillion * 1_000_000);
}

/**
 * Estimated cost of one response. Returns `ok: false` instead of guessing when
 * the usage is missing or something in it cannot be priced.
 */
export function estimateCost(model: string, usage: TokenUsage | null): CostEstimate {
	if (usage === null) return { ok: false, reason: 'no_usage' };
	const pricing = findModelPricing(model);
	if (pricing === null) return { ok: false, reason: 'unknown_model' };
	// Priority Tier and Batch prices differ from the standard prices listed here.
	if (usage.serviceTier !== null && usage.serviceTier !== 'standard') return { ok: false, reason: 'unsupported_tier' };
	if (usage.speed !== null && usage.speed !== 'standard') return { ok: false, reason: 'unsupported_speed' };
	if (usage.inferenceGeo !== null && usage.inferenceGeo !== 'global' && usage.inferenceGeo !== 'us') {
		return { ok: false, reason: 'unsupported_region' };
	}
	if (usage.cacheWriteUnknownTtlTokens > 0) return { ok: false, reason: 'unknown_cache_ttl' };

	const long = pricing.longContext;
	const longContext = long !== undefined && promptTokens(usage) > long.thresholdTokens;
	const tier = longContext && long !== undefined ? long.tier : pricing.standard;

	let tokenPico =
		usage.inputTokens * picoPerToken(tier.input) +
		usage.cacheWrite5mTokens * picoPerToken(tier.cacheWrite5m) +
		usage.cacheWrite1hTokens * picoPerToken(tier.cacheWrite1h) +
		usage.cacheReadTokens * picoPerToken(tier.cacheRead) +
		usage.outputTokens * picoPerToken(tier.output);

	const usInference = usage.inferenceGeo === 'us';
	if (usInference) tokenPico = Math.round((tokenPico * US_INFERENCE_NUMERATOR) / US_INFERENCE_DENOMINATOR);

	return {
		ok: true,
		picoUsd: tokenPico + usage.webSearchRequests * WEB_SEARCH_PICO_USD,
		pricingLabel: pricing.label,
		longContext,
		usInference,
	};
}

/**
 * "$0.000813": always six decimals (rounded half up), so small costs never
 * show as $0.00. A positive amount below half a millionth shows as "<$0.000001".
 */
export function formatUsd(picoUsd: number): string {
	const pico = Math.max(0, Math.round(picoUsd));
	const micro = Math.floor((pico + PICO_PER_MICRO / 2) / PICO_PER_MICRO);
	if (micro === 0 && pico > 0) return '<$0.000001';
	const dollars = Math.floor(micro / MICRO_PER_USD);
	const fraction = String(micro % MICRO_PER_USD).padStart(6, '0');
	return `$${dollars}.${fraction}`;
}
