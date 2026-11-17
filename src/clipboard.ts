// Explicit clipboard/file image input. Nothing here listens to global paste events.
// Uses the W3C async Clipboard API: Electron removed the renderer `clipboard`
// module in Electron 44, so require('electron').clipboard is not used.

export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const;

export type ClipboardProblem = 'empty' | 'text_only' | 'unsupported' | 'denied' | 'unavailable' | 'failed';

export type ClipboardImageResult = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; problem: ClipboardProblem };

/** The parts of the Clipboard API we use (injectable for tests). */
export interface ClipboardReader {
	read(): Promise<ReadonlyArray<{ readonly types: ReadonlyArray<string>; getType(type: string): Promise<Blob> }>>;
}

function isTextType(type: string): boolean {
	return type.startsWith('text/');
}

async function blobBytes(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
	return new Uint8Array(await blob.arrayBuffer());
}

/** Reads the first PNG/JPEG image on the clipboard and explains why when there is none. */
export async function readImageFromClipboard(clipboard: ClipboardReader | undefined): Promise<ClipboardImageResult> {
	if (clipboard === undefined || typeof clipboard.read !== 'function') return { ok: false, problem: 'unavailable' };

	let items: Awaited<ReturnType<ClipboardReader['read']>>;
	try {
		items = await clipboard.read();
	} catch (error) {
		const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
		return { ok: false, problem: denied ? 'denied' : 'failed' };
	}

	let sawText = false;
	let sawOtherImage = false;
	for (const item of items) {
		const type = SUPPORTED_IMAGE_TYPES.find((t) => item.types.includes(t));
		if (type !== undefined) {
			try {
				return { ok: true, bytes: await blobBytes(await item.getType(type)) };
			} catch {
				return { ok: false, problem: 'failed' };
			}
		}
		if (item.types.some((t) => t.startsWith('image/'))) sawOtherImage = true;
		if (item.types.some(isTextType)) sawText = true;
	}
	if (sawOtherImage) return { ok: false, problem: 'unsupported' };
	if (sawText) return { ok: false, problem: 'text_only' };
	return { ok: false, problem: 'empty' };
}

/** Minimal shape of DataTransfer used by paste events (injectable for tests). */
export interface PastedData {
	readonly files: ArrayLike<Blob & { readonly type: string }>;
	readonly types: ReadonlyArray<string>;
}

export type PasteContent = { kind: 'image'; blob: Blob } | { kind: 'unsupported_image' } | { kind: 'other' };

/** Classifies a paste event's data: a supported image, an unsupported image, or something else (text). */
export function classifyPaste(data: PastedData | null): PasteContent {
	if (data === null) return { kind: 'other' };
	let unsupported = false;
	for (let i = 0; i < data.files.length; i++) {
		const file = data.files[i];
		if (file === undefined) continue;
		if ((SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return { kind: 'image', blob: file };
		// Some sources leave the type empty; the bytes are checked later anyway.
		if (file.type === '') return { kind: 'image', blob: file };
		if (file.type.startsWith('image/')) unsupported = true;
	}
	return unsupported ? { kind: 'unsupported_image' } : { kind: 'other' };
}

export async function blobToBytes(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
	return blobBytes(blob);
}

/**
 * Opens the system file picker for PNG/JPEG files. Resolves null if the user
 * cancels. The input element is created on demand and removed afterwards.
 */
export function pickImageFile(doc: Document): Promise<File | null> {
	return new Promise((resolve) => {
		const input = doc.body.createEl('input', {
			type: 'file',
			attr: { accept: SUPPORTED_IMAGE_TYPES.join(','), 'aria-hidden': 'true' },
			cls: 'phrasevault-hidden-input',
		});
		let settled = false;
		const finish = (file: File | null) => {
			if (settled) return;
			settled = true;
			input.remove();
			resolve(file);
		};
		input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
		input.addEventListener('cancel', () => finish(null), { once: true });
		input.click();
	});
}
