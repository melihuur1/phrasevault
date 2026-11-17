import { formatUsd, PRICING_VERIFIED_ON } from '../core/cost';
import type { UsageLog, UsageRecord } from '../core/usageLog';
import { COST, formatDateTime } from '../i18n/tr';

/** "Tahmini maliyet: $0.000813" or "Maliyet hesaplanamadı" — never "$0" for an unknown cost. */
export function costLabel(record: UsageRecord): string {
	return record.costPicoUsd === null ? COST.unavailable : COST.estimated(formatUsd(record.costPicoUsd));
}

/**
 * One quiet summary line under the review heading; the details (model, time,
 * token breakdown, running total, limitations) open on click.
 */
export function renderCostSummary(parent: HTMLElement, record: UsageRecord, options: { reused: boolean; log: UsageLog }): void {
	const hasUsage = record.unavailableReason !== 'no_usage';
	const details = parent.createEl('details', { cls: 'phrasevault-cost' });
	const summary = hasUsage ? `${costLabel(record)} · ${COST.tokens(record.inputTokens, record.outputTokens)}` : costLabel(record);
	details.createEl('summary', { text: summary });

	const body = details.createDiv({ cls: 'phrasevault-cost-body' });
	const line = (text: string) => body.createDiv({ text });
	if (options.reused) line(COST.reused);
	if (record.unavailableReason !== null) line(COST.reasons[record.unavailableReason]);
	line(COST.model(record.model));
	line(COST.requestedAt(formatDateTime(record.at)));
	if (hasUsage) {
		line(COST.inputTokens(record.inputTokens));
		line(COST.outputTokens(record.outputTokens));
		if (record.cacheWriteTokens > 0 || record.cacheReadTokens > 0) line(COST.cacheTokens(record.cacheWriteTokens, record.cacheReadTokens));
	}
	if (record.costPicoUsd !== null) line(COST.pricing(PRICING_VERIFIED_ON));
	line(COST.total(formatUsd(options.log.totalPicoUsd), options.log.pricedCount));
	body.createDiv({ cls: 'phrasevault-cost-disclaimer', text: COST.disclaimer });
}
