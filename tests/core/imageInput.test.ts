import { describe, expect, it } from 'vitest';
import {
	API_MAX_BASE64_CHARS,
	base64Length,
	bytesToBase64,
	contentHash,
	detectImageFormat,
	encodeWithFallback,
	ENCODE_STEPS,
	importImageBytes,
	inspectImage,
	MAX_SOURCE_BYTES,
	planApiImage,
	readImageDimensions,
	validateApiImage,
	type EncodeStep,
} from '../../src/core/imageInput';
import { makeJpeg, makePng } from '../helpers/images';

describe('detectImageFormat', () => {
	it('recognizes PNG and JPEG by magic bytes', () => {
		expect(detectImageFormat(makePng(10, 10))).toBe('png');
		expect(detectImageFormat(makeJpeg(10, 10))).toBe('jpeg');
	});

	it('rejects other formats regardless of what the file claims to be', () => {
		const gif = new TextEncoder().encode('GIF89a......');
		const webp = new TextEncoder().encode('RIFF....WEBPVP8 ');
		const text = new TextEncoder().encode('just some text');
		for (const bytes of [gif, webp, text, new Uint8Array([0x89, 0x50]), new Uint8Array()]) {
			expect(detectImageFormat(bytes)).toBeNull();
		}
	});
});

describe('readImageDimensions', () => {
	it('reads PNG width and height from IHDR', () => {
		expect(readImageDimensions(makePng(1920, 1080), 'png')).toEqual({ width: 1920, height: 1080 });
	});

	it('reads JPEG dimensions from baseline and progressive frame headers, skipping other segments', () => {
		expect(readImageDimensions(makeJpeg(800, 600), 'jpeg')).toEqual({ width: 800, height: 600 });
		expect(readImageDimensions(makeJpeg(3000, 2000, { sofMarker: 0xc2, withExif: true }), 'jpeg')).toEqual({ width: 3000, height: 2000 });
	});

	it('returns null for truncated or corrupt headers', () => {
		expect(readImageDimensions(makePng(10, 10).subarray(0, 20), 'png')).toBeNull();
		const brokenPng = makePng(10, 10);
		brokenPng[12] = 0x00; // not an IHDR chunk
		expect(readImageDimensions(brokenPng, 'png')).toBeNull();
		expect(readImageDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 'jpeg')).toBeNull();
		expect(readImageDimensions(new Uint8Array([0xff, 0xd8, 0x12, 0x34, 0x56]), 'jpeg')).toBeNull();
		expect(readImageDimensions(makePng(0, 10), 'png')).toBeNull();
	});
});

describe('inspectImage', () => {
	it('accepts a normal screenshot', () => {
		expect(inspectImage(makePng(1280, 720))).toEqual({
			ok: true,
			info: { format: 'png', width: 1280, height: 720, byteLength: makePng(1280, 720).length },
		});
	});

	it.each([
		['empty input', new Uint8Array(), 'empty'],
		['an unsupported format', new TextEncoder().encode('GIF89a-not-supported'), 'unsupported_format'],
		['a corrupt header', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]), 'corrupt'],
		['a tiny image', makePng(8, 8), 'too_small'],
		['an oversized file', makePng(100, 100, MAX_SOURCE_BYTES), 'too_large'],
	])('rejects %s', (_label, bytes, problem) => {
		expect(inspectImage(bytes)).toEqual({ ok: false, problem });
	});
});

describe('planApiImage', () => {
	it('sends a normal screenshot unchanged', () => {
		expect(planApiImage({ format: 'png', width: 1920, height: 1080, byteLength: 400_000 })).toEqual({ action: 'send_original' });
	});

	it('downscales a long edge above 2576 px, keeping the aspect ratio', () => {
		expect(planApiImage({ format: 'png', width: 3840, height: 2160, byteLength: 2_000_000 })).toEqual({
			action: 'resize',
			width: 2576,
			height: 1449,
		});
		expect(planApiImage({ format: 'png', width: 1000, height: 5000, byteLength: 500_000 })).toEqual({
			action: 'resize',
			width: 515,
			height: 2576,
		});
	});

	it('re-encodes a small but heavy file whose base64 would exceed the limit', () => {
		expect(planApiImage({ format: 'png', width: 2000, height: 1500, byteLength: 8_000_000 })).toEqual({
			action: 'resize',
			width: 2000,
			height: 1500,
		});
	});
});

describe('validateApiImage (final bytes sent to the API)', () => {
	it('accepts an image within every limit', () => {
		expect(validateApiImage(makePng(1456, 819))).toMatchObject({ ok: true, mediaType: 'image/png', width: 1456, height: 819 });
		expect(validateApiImage(makeJpeg(2576, 1449))).toMatchObject({ ok: true, mediaType: 'image/jpeg' });
	});

	it.each([
		['a non-image', new TextEncoder().encode('<svg></svg>'), 'format'],
		['an unreadable header', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 'unreadable'],
		['a long edge above 2576 px', makePng(2577, 100), 'dimensions'],
		['a side above the 8000 px API limit', makePng(9000, 100), 'dimensions'],
		['base64 above the size limit', makePng(1000, 1000, Math.ceil((API_MAX_BASE64_CHARS / 4) * 3) + 10), 'too_large'],
	])('rejects %s', (_label, bytes, reason) => {
		expect(validateApiImage(bytes)).toEqual({ ok: false, reason });
	});

	it('computes base64 length exactly', () => {
		expect(base64Length(0)).toBe(0);
		expect(base64Length(1)).toBe(4);
		expect(base64Length(3)).toBe(4);
		expect(base64Length(4)).toBe(8);
		expect(bytesToBase64(new Uint8Array([1, 2, 3, 4])).length).toBe(base64Length(4));
	});
});

describe('encodeWithFallback', () => {
	it('tries PNG first, then JPEG 0.9, then JPEG 0.8', () => {
		expect(ENCODE_STEPS.map((s) => [s.type, s.quality])).toEqual([
			['image/png', undefined],
			['image/jpeg', 0.9],
			['image/jpeg', 0.8],
		]);
	});

	it('returns the first encoding that passes validation', async () => {
		const tried: EncodeStep[] = [];
		const huge = makePng(2000, 1500, API_MAX_BASE64_CHARS); // too heavy
		const result = await encodeWithFallback((step) => {
			tried.push(step);
			return Promise.resolve(step.type === 'image/png' ? huge : makeJpeg(2000, 1500));
		});
		expect(tried.map((s) => s.type)).toEqual(['image/png', 'image/jpeg']);
		expect(result).toMatchObject({ ok: true, mediaType: 'image/jpeg' });
	});

	it('fails safely when no encoding fits, so nothing is sent', async () => {
		const result = await encodeWithFallback(() => Promise.resolve(makeJpeg(2000, 1500, { padding: API_MAX_BASE64_CHARS })));
		expect(result).toEqual({ ok: false, reason: 'too_large' });
	});
});

describe('bytesToBase64', () => {
	it('matches the platform encoder for small and chunked inputs', () => {
		const small = new Uint8Array([0, 1, 2, 250, 255]);
		const large = new Uint8Array(100_000).map((_, i) => (i * 31) % 256);
		for (const bytes of [small, large, new Uint8Array()]) {
			expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
		}
	});
});

describe('contentHash and importImageBytes', () => {
	it('gives the same 16-hex hash for the same bytes and a different one for different bytes', async () => {
		const a = await contentHash(makePng(100, 100));
		expect(a).toMatch(/^[0-9a-f]{16}$/);
		expect(await contentHash(makePng(100, 100))).toBe(a);
		expect(await contentHash(makePng(100, 101))).not.toBe(a);
	});

	it('returns everything the modal needs for a valid image', async () => {
		const bytes = makeJpeg(1024, 768);
		const result = await importImageBytes(bytes);
		expect(result).toMatchObject({ ok: true, image: { format: 'jpeg', width: 1024, height: 768, byteLength: bytes.length } });
		if (result.ok) expect(result.image.hash).toMatch(/^[0-9a-f]{16}$/);
	});

	it('passes through the problem for an invalid image', async () => {
		expect(await importImageBytes(new Uint8Array())).toEqual({ ok: false, problem: 'empty' });
	});
});
