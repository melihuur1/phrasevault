// Image checks for imported screenshots and for the copy sent to the API.
// Pure (no DOM, no Obsidian): works on raw bytes so it can be unit tested.

export type ImageFormat = 'png' | 'jpeg';
/** Bytes backed by a plain ArrayBuffer (what Blob, Web Crypto and the Vault API accept). */
export type ImageBytes = Uint8Array<ArrayBuffer>;
export type ImageMediaType = 'image/png' | 'image/jpeg';

/** Imported files larger than this are rejected before the preview. */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
/** Images smaller than this on either side cannot contain readable text. */
export const MIN_DIMENSION = 16;
/** Our target long edge for the API copy (the model's native maximum). */
export const API_MAX_LONG_EDGE = 2576;
/** Hard API limit for each side. */
export const API_MAX_DIMENSION = 8000;
/** The API allows 10 MB of base64 per image; keep a safety margin. */
export const API_MAX_BASE64_CHARS = 9_500_000;

export function mediaTypeOf(format: ImageFormat): ImageMediaType {
	return format === 'png' ? 'image/png' : 'image/jpeg';
}

export function extensionOf(format: ImageFormat): 'png' | 'jpg' {
	return format === 'png' ? 'png' : 'jpg';
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Detects PNG/JPEG from the file's magic bytes (never from a name or MIME type). */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
	if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return 'png';
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
	return null;
}

export interface Dimensions {
	width: number;
	height: number;
}

function u16(bytes: Uint8Array, at: number): number {
	return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
}

function u32(bytes: Uint8Array, at: number): number {
	return (((bytes[at] ?? 0) << 24) >>> 0) + ((bytes[at + 1] ?? 0) << 16) + ((bytes[at + 2] ?? 0) << 8) + (bytes[at + 3] ?? 0);
}

function readPngDimensions(bytes: Uint8Array): Dimensions | null {
	// Signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4)
	if (bytes.length < 24) return null;
	const isIhdr = bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;
	if (!isIhdr) return null;
	return { width: u32(bytes, 16), height: u32(bytes, 20) };
}

// Start-of-frame markers that carry the image size (excludes DHT C4, JPG C8, DAC CC).
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function readJpegDimensions(bytes: Uint8Array): Dimensions | null {
	let i = 2; // after SOI
	while (i + 3 < bytes.length) {
		if (bytes[i] !== 0xff) return null;
		const marker = bytes[i + 1] ?? 0;
		if (marker === 0xff) {
			i += 1; // fill byte
			continue;
		}
		if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			i += 2; // markers without a length
			continue;
		}
		if (marker === 0xd9 || marker === 0xda) return null; // end of image / scan data before any frame header
		const length = u16(bytes, i + 2);
		if (length < 2) return null;
		if (SOF_MARKERS.has(marker)) {
			if (i + 8 >= bytes.length) return null;
			return { height: u16(bytes, i + 5), width: u16(bytes, i + 7) };
		}
		i += 2 + length;
	}
	return null;
}

export function readImageDimensions(bytes: Uint8Array, format: ImageFormat): Dimensions | null {
	const dims = format === 'png' ? readPngDimensions(bytes) : readJpegDimensions(bytes);
	if (dims === null || dims.width <= 0 || dims.height <= 0) return null;
	return dims;
}

export interface ImageInfo extends Dimensions {
	format: ImageFormat;
	byteLength: number;
}

export type ImageProblem = 'empty' | 'too_large' | 'unsupported_format' | 'corrupt' | 'too_small';

export type InspectResult = { ok: true; info: ImageInfo } | { ok: false; problem: ImageProblem };

/** Validates an imported screenshot before it is previewed. */
export function inspectImage(bytes: Uint8Array): InspectResult {
	if (bytes.length === 0) return { ok: false, problem: 'empty' };
	if (bytes.length > MAX_SOURCE_BYTES) return { ok: false, problem: 'too_large' };
	const format = detectImageFormat(bytes);
	if (format === null) return { ok: false, problem: 'unsupported_format' };
	const dims = readImageDimensions(bytes, format);
	if (dims === null) return { ok: false, problem: 'corrupt' };
	if (dims.width < MIN_DIMENSION || dims.height < MIN_DIMENSION) return { ok: false, problem: 'too_small' };
	return { ok: true, info: { format, byteLength: bytes.length, ...dims } };
}

export function base64Length(byteLength: number): number {
	return 4 * Math.ceil(byteLength / 3);
}

export type ApiImagePlan = { action: 'send_original' } | { action: 'resize'; width: number; height: number };

/** Decides whether the original can be sent or a downscaled copy is needed. */
export function planApiImage(info: ImageInfo): ApiImagePlan {
	const longEdge = Math.max(info.width, info.height);
	const fitsSize = longEdge <= API_MAX_LONG_EDGE && base64Length(info.byteLength) <= API_MAX_BASE64_CHARS;
	if (fitsSize) return { action: 'send_original' };
	const scale = Math.min(1, API_MAX_LONG_EDGE / longEdge);
	return {
		action: 'resize',
		width: Math.max(1, Math.round(info.width * scale)),
		height: Math.max(1, Math.round(info.height * scale)),
	};
}

export type ApiImageRejection = 'format' | 'unreadable' | 'dimensions' | 'too_large';

export type ApiImageCheck =
	| { ok: true; mediaType: ImageMediaType; width: number; height: number; base64Length: number }
	| { ok: false; reason: ApiImageRejection };

/** Final gate: checks the exact bytes that would be sent to the API. */
export function validateApiImage(bytes: Uint8Array): ApiImageCheck {
	const format = detectImageFormat(bytes);
	if (format === null) return { ok: false, reason: 'format' };
	const dims = readImageDimensions(bytes, format);
	if (dims === null) return { ok: false, reason: 'unreadable' };
	if (dims.width > API_MAX_DIMENSION || dims.height > API_MAX_DIMENSION) return { ok: false, reason: 'dimensions' };
	if (Math.max(dims.width, dims.height) > API_MAX_LONG_EDGE) return { ok: false, reason: 'dimensions' };
	const length = base64Length(bytes.length);
	if (length > API_MAX_BASE64_CHARS) return { ok: false, reason: 'too_large' };
	return { ok: true, mediaType: mediaTypeOf(format), ...dims, base64Length: length };
}

/** Encodings tried, in order, when a downscaled copy is needed. */
export const ENCODE_STEPS = [
	{ type: 'image/png', quality: undefined },
	{ type: 'image/jpeg', quality: 0.9 },
	{ type: 'image/jpeg', quality: 0.8 },
] as const satisfies ReadonlyArray<{ type: ImageMediaType; quality: number | undefined }>;

export type EncodeStep = (typeof ENCODE_STEPS)[number];

export type EncodeResult = { ok: true; bytes: Uint8Array; mediaType: ImageMediaType } | { ok: false; reason: ApiImageRejection };

/**
 * Tries each encoding in order and returns the first result that passes
 * validateApiImage(). The encoder is injected (canvas in the app, fakes in tests).
 */
export async function encodeWithFallback(encode: (step: EncodeStep) => Promise<Uint8Array>): Promise<EncodeResult> {
	let lastReason: ApiImageRejection = 'too_large';
	for (const step of ENCODE_STEPS) {
		const bytes = await encode(step);
		const check = validateApiImage(bytes);
		if (check.ok) return { ok: true, bytes, mediaType: check.mediaType };
		lastReason = check.reason;
	}
	return { ok: false, reason: lastReason };
}

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

function fnv1a32(bytes: Uint8Array, seed: number): number {
	let hash = seed >>> 0;
	for (const byte of bytes) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

/** Stable 16-hex-character content hash used for the attachment file name. */
export async function contentHash(bytes: ImageBytes): Promise<string> {
	const subtle = typeof crypto === 'undefined' ? undefined : crypto.subtle;
	if (subtle !== undefined) {
		const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
		return [...digest.subarray(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
	}
	// Fallback when Web Crypto is unavailable: two independent 32-bit FNV-1a hashes.
	const a = fnv1a32(bytes, 0x811c9dc5).toString(16).padStart(8, '0');
	const b = fnv1a32(bytes, 0x01000193).toString(16).padStart(8, '0');
	return a + b;
}

export interface ImportedImage extends ImageInfo {
	bytes: ImageBytes;
	hash: string;
}

export type ImportResult = { ok: true; image: ImportedImage } | { ok: false; problem: ImageProblem };

/** Validates raw bytes and prepares everything the modal needs. */
export async function importImageBytes(bytes: ImageBytes): Promise<ImportResult> {
	const inspected = inspectImage(bytes);
	if (!inspected.ok) return inspected;
	return { ok: true, image: { ...inspected.info, bytes, hash: await contentHash(bytes) } };
}
