import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from '@anthropic-ai/sdk';
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages/messages';
import { describe, expect, it, vi } from 'vitest';
import {
	AnalyzeError,
	analyzeScreenshot,
	buildAnalysisRequest,
	createAnthropicSender,
	DEFAULT_MODEL,
	redactSecrets,
	toAnalyzeError,
	type ApiImage,
	type SendMessage,
} from '../../src/ai/analyze';
import { NETWORK_DISABLED_MESSAGE } from '../setup';

const IMAGE: ApiImage = { base64: 'iVBORw0KGgo=', mediaType: 'image/png' };
const FAKE_KEY = 'sk-ant-api03-FAKEKEYFORTESTS_only-1234567890';

function fixture(name: string): string {
	return readFileSync(join(__dirname, '..', 'fixtures', 'ai', name), 'utf8');
}

function message(content: Message['content'], stopReason: Message['stop_reason'] = 'end_turn'): Message {
	return {
		id: 'msg_test',
		type: 'message',
		role: 'assistant',
		model: DEFAULT_MODEL,
		content,
		stop_reason: stopReason,
		stop_sequence: null,
		usage: { input_tokens: 10, output_tokens: 10 },
	} as unknown as Message;
}

function textMessage(text: string, stopReason: Message['stop_reason'] = 'end_turn'): Message {
	return message([{ type: 'text', text, citations: null }], stopReason);
}

function sender(response: Message | Error): SendMessage & ReturnType<typeof vi.fn> {
	return vi.fn((_params: MessageCreateParamsNonStreaming) =>
		response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
	) as SendMessage & ReturnType<typeof vi.fn>;
}

function apiError(status: number, type: string, msg: string): APIError {
	return APIError.generate(status, { type: 'error', error: { type, message: msg } }, undefined, new Headers());
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		return error instanceof AnalyzeError ? error.code : `not an AnalyzeError: ${String(error)}`;
	}
	return 'resolved';
}

describe('buildAnalysisRequest', () => {
	const request = buildAnalysisRequest(DEFAULT_MODEL, IMAGE);

	it('sends only the image and the fixed instruction, image first', () => {
		expect(request.messages).toHaveLength(1);
		const content = request.messages[0]?.content;
		expect(Array.isArray(content)).toBe(true);
		const blocks = content as Array<{ type: string }>;
		expect(blocks.map((b) => b.type)).toEqual(['image', 'text']);
		expect(blocks[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMAGE.base64 } });
	});

	it('uses structured JSON output, low effort, and no sampling parameters', () => {
		expect(request.model).toBe('claude-haiku-5-5');
		expect(request.output_config?.effort).toBe('low');
		expect(request.output_config?.format?.type).toBe('json_schema');
		expect(request.output_config?.format?.schema).toMatchObject({ type: 'object', additionalProperties: false });
		expect(request).not.toHaveProperty('temperature');
		expect(request).not.toHaveProperty('top_p');
	});
});

describe('analyzeScreenshot — responses', () => {
	it('returns validated suggestions from a mocked response', async () => {
		const send = sender(textMessage(fixture('unmarked.json')));
		const result = await analyzeScreenshot(send, IMAGE, { model: DEFAULT_MODEL });
		expect(result.suggestions.map((s) => s.phrase)).toEqual(['run out of', 'call it a day', 'put off']);
		expect(send).toHaveBeenCalledTimes(1);
	});

	it('reads text blocks by type when thinking blocks come first', async () => {
		const send = sender(
			message([
				{ type: 'thinking', thinking: '', signature: 'sig' } as unknown as Message['content'][number],
				{ type: 'text', text: fixture('highlighted.json'), citations: null },
			]),
		);
		const result = await analyzeScreenshot(send, IMAGE, { model: DEFAULT_MODEL });
		expect(result.suggestions[0]?.phrase).toBe('come across');
	});

	it('returns an empty result for screenshots without English text', async () => {
		const result = await analyzeScreenshot(sender(textMessage(fixture('empty.json'))), IMAGE, { model: DEFAULT_MODEL });
		expect(result).toEqual({ status: 'no_english_text', suggestions: [] });
	});

	it.each([
		['invalid JSON', textMessage('not json'), 'invalid_response'],
		['schema mismatch', textMessage(fixture('invalid-category.json')), 'invalid_response'],
		['no text block', message([]), 'invalid_response'],
		['a refusal', textMessage('', 'refusal'), 'refusal'],
		['max_tokens truncation', textMessage('{"status":"unm', 'max_tokens'), 'truncated'],
	])('maps %s to a clear error', async (_label, response, code) => {
		expect(await codeOf(analyzeScreenshot(sender(response), IMAGE, { model: DEFAULT_MODEL }))).toBe(code);
	});
});

describe('analyzeScreenshot — API errors', () => {
	it.each([
		['401 invalid key', apiError(401, 'authentication_error', 'invalid x-api-key'), 'invalid_key'],
		['403 permission', apiError(403, 'permission_error', 'not allowed'), 'permission'],
		['400 credit balance', apiError(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'), 'billing'],
		['billing_error type', apiError(402, 'billing_error', 'billing problem'), 'billing'],
		['404 unknown model', apiError(404, 'not_found_error', 'model: claude-unknown'), 'model_not_found'],
		['429 rate limit', apiError(429, 'rate_limit_error', 'slow down'), 'rate_limited'],
		['529 overloaded', apiError(529, 'overloaded_error', 'Overloaded'), 'overloaded'],
		['500 server error', apiError(500, 'api_error', 'internal'), 'server_error'],
		['413 too large', apiError(413, 'request_too_large', 'too large'), 'image_rejected'],
		['400 bad image', apiError(400, 'invalid_request_error', 'image exceeds 10 MB maximum'), 'image_rejected'],
		['400 other', apiError(400, 'invalid_request_error', 'messages: field required'), 'bad_request'],
		['connection failure', new APIConnectionError({ message: 'fetch failed' }), 'network'],
		['timeout', new APIConnectionTimeoutError(), 'timeout'],
		['user abort', new APIUserAbortError(), 'aborted'],
		['DOM abort', new DOMException('The operation was aborted.', 'AbortError'), 'aborted'],
		['unexpected error', new TypeError('boom'), 'unknown'],
	])('maps %s', async (_label, error, code) => {
		expect(await codeOf(analyzeScreenshot(sender(error), IMAGE, { model: DEFAULT_MODEL }))).toBe(code);
	});

	it('passes the abort signal through to the sender', async () => {
		const send = sender(textMessage(fixture('empty.json')));
		const controller = new AbortController();
		await analyzeScreenshot(send, IMAGE, { model: DEFAULT_MODEL, signal: controller.signal });
		expect(send.mock.calls[0]?.[1]).toBe(controller.signal);
	});
});

describe('secret handling', () => {
	it('redacts anything that looks like an API key from error text', () => {
		expect(redactSecrets(`bad key ${FAKE_KEY} here`)).toBe('bad key [redacted] here');
		const error = toAnalyzeError(new Error(`request with ${FAKE_KEY} failed`));
		expect(error.message).not.toContain(FAKE_KEY);
		expect(error.message).toContain('[redacted]');
	});

	it('never exposes the key in mapped API error messages', () => {
		const mapped = toAnalyzeError(apiError(401, 'authentication_error', `invalid x-api-key ${FAKE_KEY}`));
		expect(mapped.code).toBe('invalid_key');
		expect(`${mapped.message} ${mapped.stack ?? ''}`).not.toContain(FAKE_KEY);
	});

	it('the real client cannot reach the network in tests', async () => {
		const send = createAnthropicSender(FAKE_KEY);
		const error = await analyzeScreenshot(send, IMAGE, { model: DEFAULT_MODEL }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AnalyzeError);
		expect((error as AnalyzeError).code).toBe('network');
		expect((error as AnalyzeError).message).not.toContain(FAKE_KEY);
		expect(NETWORK_DISABLED_MESSAGE).toBeTruthy();
	});
});
