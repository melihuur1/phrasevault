import { describe, expect, it } from 'vitest';
import { formatUsd, readUsage } from '../../src/core/cost';
import {
	addUsageRecord,
	createUsageRecord,
	emptyUsageLog,
	MAX_RECENT_RECORDS,
	sanitizeUsageLog,
	type ResponseBilling,
	type UsageLog,
} from '../../src/core/usageLog';

function billing(id: string, inputTokens = 2912, outputTokens = 1044, model = 'claude-haiku-5-5'): ResponseBilling {
	return {
		messageId: id,
		model,
		usage: readUsage({ input_tokens: inputTokens, output_tokens: outputTokens, service_tier: 'standard' }),
		receivedAt: `2026-11-18T10:${String(Number(id.replace(/\D/g, '')) % 60).padStart(2, '0')}:00.000Z`,
	};
}

function addAll(log: UsageLog, ...items: ResponseBilling[]): UsageLog {
	return items.reduce((current, item) => addUsageRecord(current, createUsageRecord(item)).log, log);
}

describe('createUsageRecord', () => {
	it('stores the date, model, token counts and estimate, and nothing else', () => {
		const record = createUsageRecord(billing('msg_1'));
		expect(record).toEqual({
			id: 'msg_1',
			at: '2026-11-18T10:01:00.000Z',
			model: 'claude-haiku-5-5',
			inputTokens: 2912,
			outputTokens: 1044,
			cacheWriteTokens: 0,
			cacheReadTokens: 0,
			costPicoUsd: 813_200_000,
			unavailableReason: null,
		});
	});

	it('records an unknown cost as null with a reason, never as $0', () => {
		const unknownModel = createUsageRecord(billing('msg_2', 10, 10, 'claude-unknown'));
		expect(unknownModel).toMatchObject({ costPicoUsd: null, unavailableReason: 'unknown_model' });
		const noUsage = createUsageRecord({ ...billing('msg_3'), usage: null });
		expect(noUsage).toMatchObject({ costPicoUsd: null, unavailableReason: 'no_usage', inputTokens: 0, outputTokens: 0 });
	});
});

describe('addUsageRecord', () => {
	it('adds up a cumulative total across analyses', () => {
		const log = addAll(emptyUsageLog(), billing('msg_1'), billing('msg_2', 1000, 500), billing('msg_3', 4000, 2000));
		// 813,200,000 + (100,000,000 + 250,000,000) + (400,000,000 + 1,000,000,000)
		expect(log.totalPicoUsd).toBe(2_563_200_000);
		expect(formatUsd(log.totalPicoUsd)).toBe('$0.002563');
		expect(log.pricedCount).toBe(3);
		expect(log.unpricedCount).toBe(0);
		expect(log.since).toBe('2026-11-18T10:01:00.000Z');
		expect(log.recent.map((r) => r.id)).toEqual(['msg_1', 'msg_2', 'msg_3']);
	});

	it('never counts the same response twice (retried save, reopened result)', () => {
		const once = addAll(emptyUsageLog(), billing('msg_1'));
		const again = addUsageRecord(once, createUsageRecord(billing('msg_1')));
		expect(again.added).toBe(false);
		expect(again.log).toBe(once);
		expect(again.log.totalPicoUsd).toBe(813_200_000);
	});

	it('counts responses whose cost is unknown separately without changing the total', () => {
		const log = addAll(emptyUsageLog(), billing('msg_1'), billing('msg_2', 10, 10, 'claude-unknown'));
		expect(log.totalPicoUsd).toBe(813_200_000);
		expect(log.pricedCount).toBe(1);
		expect(log.unpricedCount).toBe(1);
	});

	it('keeps only the most recent records but totals cover every response', () => {
		const items = Array.from({ length: MAX_RECENT_RECORDS + 10 }, (_, i) => billing(`msg_${i + 1}`, 1000, 0));
		const log = addAll(emptyUsageLog(), ...items);
		expect(log.recent).toHaveLength(MAX_RECENT_RECORDS);
		expect(log.recent[0]?.id).toBe('msg_11');
		expect(log.pricedCount).toBe(MAX_RECENT_RECORDS + 10);
		expect(log.totalPicoUsd).toBe((MAX_RECENT_RECORDS + 10) * 100_000_000);
	});

	it('starts again from zero after a reset', () => {
		addAll(emptyUsageLog(), billing('msg_1'));
		expect(emptyUsageLog()).toEqual({ totalPicoUsd: 0, pricedCount: 0, unpricedCount: 0, since: null, recent: [] });
	});
});

describe('sanitizeUsageLog', () => {
	it('round-trips a saved log', () => {
		const log = addAll(emptyUsageLog(), billing('msg_1'), billing('msg_2', 10, 10, 'claude-unknown'));
		expect(sanitizeUsageLog(JSON.parse(JSON.stringify(log)))).toEqual(log);
	});

	it.each([undefined, null, 'text', 42, []])('falls back to an empty log for %j', (raw) => {
		expect(sanitizeUsageLog(raw)).toEqual(emptyUsageLog());
	});

	it('drops malformed records and totals instead of failing', () => {
		const good = createUsageRecord(billing('msg_1'));
		const log = sanitizeUsageLog({
			totalPicoUsd: -5,
			pricedCount: 'x',
			since: 7,
			recent: [good, { ...good, id: '' }, { ...good, inputTokens: -1 }, { ...good, costPicoUsd: 1.5 }, 'junk'],
		});
		expect(log.recent).toEqual([good]);
		expect(log.totalPicoUsd).toBe(0);
		expect(log.pricedCount).toBe(0);
		expect(log.since).toBeNull();
	});
});
