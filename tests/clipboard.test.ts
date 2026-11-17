import { describe, expect, it } from 'vitest';
import { classifyPaste, readImageFromClipboard, type ClipboardReader, type PastedData } from '../src/clipboard';
import { makePng } from './helpers/images';

function item(types: string[], data: Record<string, Uint8Array<ArrayBuffer>> = {}) {
	return {
		types,
		getType: (type: string): Promise<Blob> => {
			const bytes = data[type];
			return bytes ? Promise.resolve(new Blob([bytes], { type })) : Promise.reject(new DOMException('missing', 'NotFoundError'));
		},
	};
}

function clipboardWith(items: ReturnType<typeof item>[]): ClipboardReader {
	return { read: () => Promise.resolve(items) };
}

describe('readImageFromClipboard', () => {
	it('returns the PNG a Snipping Tool screenshot puts on the clipboard', async () => {
		const png = makePng(800, 600);
		const result = await readImageFromClipboard(clipboardWith([item(['image/png'], { 'image/png': png })]));
		expect(result).toEqual({ ok: true, bytes: png });
	});

	it('accepts JPEG and prefers a supported image over other entries', async () => {
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
		const result = await readImageFromClipboard(clipboardWith([item(['text/plain']), item(['text/html', 'image/jpeg'], { 'image/jpeg': jpeg })]));
		expect(result).toEqual({ ok: true, bytes: jpeg });
	});

	it.each([
		['an empty clipboard', clipboardWith([]), 'empty'],
		['text only', clipboardWith([item(['text/plain', 'text/html'])]), 'text_only'],
		['an unsupported image type', clipboardWith([item(['image/gif'])]), 'unsupported'],
		['no Clipboard API', { read: undefined } as unknown as ClipboardReader, 'unavailable'],
		['a denied permission', { read: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) }, 'denied'],
		['a read failure', { read: () => Promise.reject(new Error('boom')) }, 'failed'],
		['a failing getType', clipboardWith([item(['image/png'])]), 'failed'],
	])('explains %s', async (_label, clipboard, problem) => {
		expect(await readImageFromClipboard(clipboard)).toEqual({ ok: false, problem });
	});

	it('reports unavailable when no clipboard is provided', async () => {
		expect(await readImageFromClipboard(undefined)).toEqual({ ok: false, problem: 'unavailable' });
	});
});

describe('classifyPaste', () => {
	function data(files: Array<{ type: string }>, types: string[] = []): PastedData {
		return { files: files.map((f) => new Blob([new Uint8Array([1])], { type: f.type })), types };
	}

	it('finds a pasted PNG or JPEG', () => {
		expect(classifyPaste(data([{ type: 'image/png' }])).kind).toBe('image');
		expect(classifyPaste(data([{ type: 'image/jpeg' }])).kind).toBe('image');
	});

	it('passes files without a type on for byte-level checks', () => {
		expect(classifyPaste(data([{ type: '' }])).kind).toBe('image');
	});

	it('distinguishes unsupported images from plain text pastes', () => {
		expect(classifyPaste(data([{ type: 'image/webp' }])).kind).toBe('unsupported_image');
		expect(classifyPaste(data([], ['text/plain'])).kind).toBe('other');
		expect(classifyPaste(null).kind).toBe('other');
	});
});
