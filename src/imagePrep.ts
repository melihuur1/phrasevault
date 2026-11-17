// Builds the exact image sent to the API: the original when it fits, otherwise a
// downscaled copy. Either way the final bytes are re-validated before sending.
// Uses the DOM (canvas), so the decision logic lives in core/imageInput.ts.

import type { ApiImage } from './ai/analyze';
import {
	bytesToBase64,
	encodeWithFallback,
	mediaTypeOf,
	planApiImage,
	validateApiImage,
	type ApiImageRejection,
	type EncodeStep,
	type ImportedImage,
} from './core/imageInput';

export type PrepareResult = { ok: true; image: ApiImage } | { ok: false; reason: ApiImageRejection | 'decode_failed' };

function canvasToBytes(canvas: HTMLCanvasElement, step: EncodeStep): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob === null) {
					reject(new Error('Canvas encoding failed'));
					return;
				}
				blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
			},
			step.type,
			step.quality,
		);
	});
}

export async function prepareApiImage(image: ImportedImage, doc: Document): Promise<PrepareResult> {
	const plan = planApiImage(image);

	if (plan.action === 'send_original') {
		const check = validateApiImage(image.bytes);
		if (!check.ok) return { ok: false, reason: check.reason };
		return { ok: true, image: { base64: bytesToBase64(image.bytes), mediaType: check.mediaType } };
	}

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(new Blob([image.bytes], { type: mediaTypeOf(image.format) }));
	} catch {
		return { ok: false, reason: 'decode_failed' };
	}

	try {
		const canvas = doc.createElement('canvas');
		canvas.width = plan.width;
		canvas.height = plan.height;
		const context = canvas.getContext('2d');
		if (context === null) return { ok: false, reason: 'decode_failed' };
		context.fillStyle = '#ffffff'; // screenshots are opaque; avoids black backgrounds in JPEG
		context.fillRect(0, 0, plan.width, plan.height);
		context.imageSmoothingQuality = 'high';
		context.drawImage(bitmap, 0, 0, plan.width, plan.height);

		const encoded = await encodeWithFallback((step) => canvasToBytes(canvas, step));
		if (!encoded.ok) return encoded;
		return { ok: true, image: { base64: bytesToBase64(encoded.bytes), mediaType: encoded.mediaType } };
	} catch {
		return { ok: false, reason: 'decode_failed' };
	} finally {
		bitmap.close();
	}
}
