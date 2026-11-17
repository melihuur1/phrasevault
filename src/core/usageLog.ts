// Local history of estimated API costs, stored in the plugin's data.json.
// Deliberately small: token counts, model, date and the estimate — never image
// content, prompts, responses, or API keys.

import { estimateCost, totalCacheWriteTokens, type CostUnavailableReason, type TokenUsage } from './cost';

/** Most recent records kept for display; totals always cover every recorded response. */
export const MAX_RECENT_RECORDS = 50;

export interface UsageRecord {
	/** API message ID; a response with an ID already in the log is never counted again. */
	id: string;
	/** ISO timestamp of when the response was received. */
	at: string;
	/** Model ID reported by the API response. */
	model: string;
	inputTokens: number;
	outputTokens: number;
	cacheWriteTokens: number;
	cacheReadTokens: number;
	/** Estimated cost in picodollars, or null when it could not be calculated. */
	costPicoUsd: number | null;
	unavailableReason: CostUnavailableReason | null;
}

export interface UsageLog {
	/** Sum of all estimated costs since the last reset, in picodollars. */
	totalPicoUsd: number;
	pricedCount: number;
	unpricedCount: number;
	/** ISO timestamp of the first response recorded since the last reset. */
	since: string | null;
	/** Newest last. */
	recent: UsageRecord[];
}

export function emptyUsageLog(): UsageLog {
	return { totalPicoUsd: 0, pricedCount: 0, unpricedCount: 0, since: null, recent: [] };
}

/** What a received API response reports about its own billing. */
export interface ResponseBilling {
	messageId: string;
	model: string;
	usage: TokenUsage | null;
	receivedAt: string;
}

/** Builds the record for one response; the estimate is fixed at the time of the request. */
export function createUsageRecord(billing: ResponseBilling): UsageRecord {
	const estimate = estimateCost(billing.model, billing.usage);
	const usage = billing.usage;
	return {
		id: billing.messageId,
		at: billing.receivedAt,
		model: billing.model,
		inputTokens: usage?.inputTokens ?? 0,
		outputTokens: usage?.outputTokens ?? 0,
		cacheWriteTokens: usage === null ? 0 : totalCacheWriteTokens(usage),
		cacheReadTokens: usage?.cacheReadTokens ?? 0,
		costPicoUsd: estimate.ok ? estimate.picoUsd : null,
		unavailableReason: estimate.ok ? null : estimate.reason,
	};
}

export function hasRecord(log: UsageLog, id: string): boolean {
	return log.recent.some((record) => record.id === id);
}

/**
 * Adds a record and updates the totals. Returns the same log (added: false)
 * when this response was already recorded, so nothing is counted twice.
 */
export function addUsageRecord(log: UsageLog, record: UsageRecord): { log: UsageLog; added: boolean } {
	if (hasRecord(log, record.id)) return { log, added: false };
	const priced = record.costPicoUsd !== null;
	return {
		added: true,
		log: {
			totalPicoUsd: log.totalPicoUsd + (record.costPicoUsd ?? 0),
			pricedCount: log.pricedCount + (priced ? 1 : 0),
			unpricedCount: log.unpricedCount + (priced ? 0 : 1),
			since: log.since ?? record.at,
			recent: [...log.recent, record].slice(-MAX_RECENT_RECORDS),
		},
	};
}

const REASONS: ReadonlySet<string> = new Set<CostUnavailableReason>([
	'no_usage',
	'unknown_model',
	'unsupported_tier',
	'unsupported_speed',
	'unsupported_region',
	'unknown_cache_ttl',
]);

function isCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function sanitizeRecord(raw: unknown): UsageRecord | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	const { id, at, model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, costPicoUsd, unavailableReason } = r;
	if (typeof id !== 'string' || id === '' || typeof at !== 'string' || typeof model !== 'string') return null;
	if (!isCount(inputTokens) || !isCount(outputTokens) || !isCount(cacheWriteTokens) || !isCount(cacheReadTokens)) return null;
	if (costPicoUsd !== null && !isCount(costPicoUsd)) return null;
	const reason = typeof unavailableReason === 'string' && REASONS.has(unavailableReason) ? (unavailableReason as CostUnavailableReason) : null;
	return { id, at, model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, costPicoUsd, unavailableReason: costPicoUsd === null ? (reason ?? 'no_usage') : null };
}

/** Accepts only well-formed data, so a damaged data.json cannot break the plugin. */
export function sanitizeUsageLog(raw: unknown): UsageLog {
	if (typeof raw !== 'object' || raw === null) return emptyUsageLog();
	const data = raw as Record<string, unknown>;
	const recent = Array.isArray(data['recent'])
		? data['recent'].flatMap((item) => {
				const record = sanitizeRecord(item);
				return record === null ? [] : [record];
			})
		: [];
	const since = data['since'];
	return {
		totalPicoUsd: isCount(data['totalPicoUsd']) ? data['totalPicoUsd'] : 0,
		pricedCount: isCount(data['pricedCount']) ? data['pricedCount'] : 0,
		unpricedCount: isCount(data['unpricedCount']) ? data['unpricedCount'] : 0,
		since: typeof since === 'string' && since !== '' ? since : null,
		recent: recent.slice(-MAX_RECENT_RECORDS),
	};
}
