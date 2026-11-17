import { describe, expect, it } from 'vitest';
import { NETWORK_DISABLED_MESSAGE } from './setup';

describe('test environment', () => {
	it('blocks fetch so no real API call can be made', async () => {
		await expect(fetch('https://api.anthropic.com/v1/messages')).rejects.toThrow(NETWORK_DISABLED_MESSAGE);
	});

	it('blocks XMLHttpRequest and WebSocket', () => {
		expect(() => new XMLHttpRequest()).toThrow(NETWORK_DISABLED_MESSAGE);
		expect(() => new WebSocket('wss://example.com')).toThrow(NETWORK_DISABLED_MESSAGE);
	});
});
