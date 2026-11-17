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
import { readUsage } from '../core/cost';
import type { ResponseBilling } from '../core/usageLog';
import { SYSTEM_PROMPT, USER_INSTRUCTION } from './prompt';
import { ANALYSIS_OUTPUT_FORMAT } from './schema';
import { InvalidAnalysisError, parseAnalysisText, type AnalysisResult } from './validate';

export const DEFAULT_MODEL = 'claude-haiku-5-5';
/** The only host PhraseVault ever sends anything to. */
export const ANTHROPIC_API_URL = 'https://api.anthropic.com';
/** Room for up to 8 detailed suggestions plus thinking; still well within non-streaming limits. */
const MAX_TOKENS = 12_000;
/** Generous, so a slow answer is not cut off and retried (a retried request can be billed twice). */
const REQUEST_TIMEOUT_MS = 120_000;
/** Medium effort for a more thorough scan of every sentence. */
const EFFORT = 'medium';

export type ApiImageMediaType = 'image/png' | 'image/jpeg';

export interface ApiImage {
	/** Base64 without a data: prefix. Must already pass validateApiImage(). */
	base64: string;
	mediaType: ApiImageMediaType;
}

/** Sends one non-streaming Messages request. Injected so tests never touch the network. */
export type SendMessage = (params: MessageCreateParamsNonStreaming, signal?: AbortSignal) => Promise<Message>;

export function createAnthropicSender(apiKey: string): SendMessage {
	const client = new Anthropic({
		apiKey,
		// Fixed endpoint and no SDK logging, so environment variables such as
		// ANTHROPIC_BASE_URL or ANTHROPIC_LOG can never redirect or log requests.
		baseURL: ANTHROPIC_API_URL,
		logLevel: 'off',
		// Obsidian is a browser-like runtime. The key is the user's own, entered
		// on their own machine (bring-your-own-key).
		dangerouslyAllowBrowser: true,
		maxRetries: 2,
		timeout: REQUEST_TIMEOUT_MS,
	});
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
		/** Set when the API did answer (and bill) but the answer was unusable. */
		readonly billing: ResponseBilling | null = null,
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
		output_config: { effort: EFFORT, format: ANALYSIS_OUTPUT_FORMAT },
	};
}

export interface AnalyzeOptions {
	model: string;
	signal?: AbortSignal;
	/** Clock for the billing timestamp (injectable for tests). */
	now?: () => Date;
}

export interface AnalyzeOutcome {
	analysis: AnalysisResult;
	billing: ResponseBilling;
}

function localMessageId(): string {
	return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** What the response reports about its own cost. Usage is never invented: missing counts give `usage: null`. */
export function billingFromMessage(message: Message, requestedModel: string, receivedAt: Date): ResponseBilling {
	const id: unknown = message.id;
	const model: unknown = message.model;
	return {
		messageId: typeof id === 'string' && id !== '' ? id : localMessageId(),
		model: typeof model === 'string' && model !== '' ? model : requestedModel,
		usage: readUsage(message.usage),
		receivedAt: receivedAt.toISOString(),
	};
}

/**
 * Sends the screenshot for analysis and returns validated suggestions plus the
 * response's billing information. Throws AnalyzeError; when the API answered but
 * the answer was unusable, the error still carries the billing information.
 */
export async function analyzeScreenshot(send: SendMessage, image: ApiImage, options: AnalyzeOptions): Promise<AnalyzeOutcome> {
	let message: Message;
	try {
		message = await send(buildAnalysisRequest(options.model, image), options.signal);
	} catch (error) {
		throw toAnalyzeError(error);
	}
	const billing = billingFromMessage(message, options.model, (options.now ?? (() => new Date()))());

	if (message.stop_reason === 'refusal') throw new AnalyzeError('refusal', 'The model declined to analyze this image', billing);
	if (message.stop_reason === 'max_tokens' || message.stop_reason === 'model_context_window_exceeded') {
		throw new AnalyzeError('truncated', `Response stopped early (${message.stop_reason})`, billing);
	}

	// Read text blocks by type: thinking blocks may come first.
	const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
	try {
		return { analysis: parseAnalysisText(text), billing };
	} catch (error) {
		const failure = error instanceof InvalidAnalysisError ? new AnalyzeError('invalid_response', error.message) : toAnalyzeError(error);
		throw new AnalyzeError(failure.code, failure.message, billing);
	}
}
