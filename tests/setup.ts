// Global test setup: the automated suite must never reach the network.
// Any accidental real API call fails loudly instead of costing money.

export const NETWORK_DISABLED_MESSAGE = 'Network disabled in tests';

function blocked(): never {
	throw new Error(NETWORK_DISABLED_MESSAGE);
}

globalThis.fetch = (): Promise<Response> => Promise.reject(new Error(NETWORK_DISABLED_MESSAGE));

class BlockedXMLHttpRequest {
	constructor() {
		blocked();
	}
}
class BlockedWebSocket {
	constructor() {
		blocked();
	}
}

Object.defineProperty(globalThis, 'XMLHttpRequest', { value: BlockedXMLHttpRequest, configurable: true, writable: true });
Object.defineProperty(globalThis, 'WebSocket', { value: BlockedWebSocket, configurable: true, writable: true });
