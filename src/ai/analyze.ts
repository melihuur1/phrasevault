// The single AI integration: Anthropic Messages API with a vision model.
// Only the screenshot and the fixed prompt are sent.

import Anthropic, {
	APIConnectionError,
	APIConnectionTimeoutError,
	APIError,
	APIUserAbortError,
	AuthenticationError,
	BadRequestError,
	InternalServerError,
	NotFoundError,
	PermissionDeniedError,
	RateLimitError,
} from '@anthropic-ai/sdk';
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages/messages';
import { SYSTEM_PROMPT, USER_INSTRUCTION } from './prompt';
import { ANALYSIS_OUTPUT_FORMAT } from './schema';
import { InvalidAnalysisError, parseAnalysisText, type AnalysisResult } from './validate';

export const DEFAULT_MODEL = 'claude-haiku-5-5';
const MAX_TOKENS = 8000;
const REQUEST_TIMEOUT_MS = 60_000;

export type ApiImageMediaType = 'image/png' | 'image/jpeg';

export interface ApiImage {
	/** Base64 without a data: prefix. Must already pass validateApiImage(). */
	base64: string;
	mediaType: ApiImageMediaType;
}

/** Sends one non-streaming Messages request. Injected so tests never touch the network. */
export type SendMessage = (params: MessageCreateParamsNonStreaming, signal?: AbortSignal) => Promise<Message>;

export function createAnthropicSender(apiKey: string): SendMessage {
	// dangerouslyAllowBrowser: Obsidian is a browser-like runtime. The key is the
	// user's own, entered on their own machine (bring-your-own-key).
	const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: REQUEST_TIMEOUT_MS });
	return (params, signal) => client.messages.create(params, { signal });
}

export type AnalyzeErrorCode =
	| 'invalid_key'
	| 'permission'
	| 'billing'
	| 'rate_limited'
	| 'overloaded'
	| 'server_error'
	| 'network'
	| 'timeout'
	| 'aborted'
	| 'image_rejected'
	| 'model_not_found'
	| 'bad_request'
	| 'refusal'
	| 'truncated'
	| 'invalid_response'
	| 'unknown';

export class AnalyzeError extends Error {
	constructor(
		readonly code: AnalyzeErrorCode,
		detail: string,
	) {
		super(redactSecrets(detail));
		this.name = 'AnalyzeError';
	}
}

/** Removes anything that looks like an Anthropic API key from diagnostic text. */
export function redactSecrets(text: string): string {
	return text.replace(/sk-ant-[A-Za-z0-9_-]+/g, '[redacted]');
}

function errorDetail(error: unknown): string {
	if (error instanceof APIError) {
		return `${error.status ?? 'no status'} ${error.type ?? ''} ${error.apiMessage ?? ''}`.trim();
	}
	return error instanceof Error ? error.message : String(error);
}

/** Maps SDK and network errors to stable codes. Order matters: subclasses before parents. */
export function toAnalyzeError(error: unknown): AnalyzeError {
	if (error instanceof AnalyzeError) return error;
	const detail = errorDetail(error);

	if (error instanceof APIUserAbortError) return new AnalyzeError('aborted', detail);
	if (error instanceof DOMException && error.name === 'AbortError') return new AnalyzeError('aborted', detail);
	if (error instanceof APIConnectionTimeoutError) return new AnalyzeError('timeout', detail);
	if (error instanceof APIConnectionError) return new AnalyzeError('network', detail);
	if (error instanceof AuthenticationError) return new AnalyzeError('invalid_key', detail);
	if (error instanceof APIError && (error.type === 'billing_error' || /credit balance/i.test(error.apiMessage ?? ''))) {
		return new AnalyzeError('billing', detail);
	}
	if (error instanceof PermissionDeniedError) return new AnalyzeError('permission', detail);
	if (error instanceof RateLimitError) return new AnalyzeError('rate_limited', detail);
	if (error instanceof NotFoundError) return new AnalyzeError('model_not_found', detail);
	if (error instanceof APIError && (error.status === 529 || error.type === 'overloaded_error')) {
		return new AnalyzeError('overloaded', detail);
	}
	if (error instanceof InternalServerError) return new AnalyzeError('server_error', detail);
	if (error instanceof APIError && error.status === 413) return new AnalyzeError('image_rejected', detail);
	if (error instanceof BadRequestError) {
		return new AnalyzeError(/image/i.test(error.apiMessage ?? '') ? 'image_rejected' : 'bad_request', detail);
	}
	return new AnalyzeError('unknown', detail);
}

export function buildAnalysisRequest(model: string, image: ApiImage): MessageCreateParamsNonStreaming {
	return {
		model,
		max_tokens: MAX_TOKENS,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: 'user',
				content: [
					{ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
					{ type: 'text', text: USER_INSTRUCTION },
				],
			},
		],
		output_config: { effort: 'low', format: ANALYSIS_OUTPUT_FORMAT },
	};
}

export interface AnalyzeOptions {
	model: string;
	signal?: AbortSignal;
}

/** Sends the screenshot for analysis and returns validated suggestions. Throws AnalyzeError. */
export async function analyzeScreenshot(send: SendMessage, image: ApiImage, options: AnalyzeOptions): Promise<AnalysisResult> {
	let message: Message;
	try {
		message = await send(buildAnalysisRequest(options.model, image), options.signal);
	} catch (error) {
		throw toAnalyzeError(error);
	}

	if (message.stop_reason === 'refusal') throw new AnalyzeError('refusal', 'The model declined to analyze this image');
	if (message.stop_reason === 'max_tokens' || message.stop_reason === 'model_context_window_exceeded') {
		throw new AnalyzeError('truncated', `Response stopped early (${message.stop_reason})`);
	}

	// Read text blocks by type: thinking blocks may come first.
	const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
	try {
		return parseAnalysisText(text);
	} catch (error) {
		if (error instanceof InvalidAnalysisError) throw new AnalyzeError('invalid_response', error.message);
		throw toAnalyzeError(error);
	}
}
