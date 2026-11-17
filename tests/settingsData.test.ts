import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/settingsData';

describe('sanitizeSettings', () => {
	it('returns defaults for missing or corrupted data', () => {
		for (const raw of [null, undefined, 'garbage', 42, []]) {
			expect(sanitizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
		}
	});

	it('defaults to Claude Haiku 5.5', () => {
		expect(DEFAULT_SETTINGS.model).toBe('claude-haiku-5-5');
	});

	it('keeps valid values and drops unknown fields', () => {
		expect(sanitizeSettings({ apiKeySecretName: 'anthropic', model: ' claude-x ', lastIssuedNumber: 12, extra: 'x' })).toEqual({
			apiKeySecretName: 'anthropic',
			model: 'claude-x',
			lastIssuedNumber: 12,
		});
	});

	it('rejects invalid high-water marks instead of trusting them', () => {
		for (const lastIssuedNumber of [-1, 1.5, '7', Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
			expect(sanitizeSettings({ lastIssuedNumber }).lastIssuedNumber).toBe(0);
		}
	});

	it('never has a field for the API key itself', () => {
		expect(Object.keys(sanitizeSettings({ apiKey: 'sk-ant-should-not-be-kept' }))).not.toContain('apiKey');
	});
});
