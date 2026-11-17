// Builds minimal PNG/JPEG byte sequences with valid headers for tests.
// (Header-only: enough for format/dimension checks, not real decodable images.)

function be32(n: number): number[] {
	return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function be16(n: number): number[] {
	return [(n >>> 8) & 0xff, n & 0xff];
}

export function makePng(width: number, height: number, padding = 0): Uint8Array<ArrayBuffer> {
	const header = [
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
		...be32(13), 0x49, 0x48, 0x44, 0x52, // IHDR chunk length + type
		...be32(width), ...be32(height),
		8, 6, 0, 0, 0, // bit depth, color type, compression, filter, interlace
		0, 0, 0, 0, // CRC (not checked)
	];
	const bytes = new Uint8Array(header.length + padding);
	bytes.set(header);
	return bytes;
}

export function makeJpeg(width: number, height: number, options: { sofMarker?: number; padding?: number; withExif?: boolean } = {}): Uint8Array<ArrayBuffer> {
	const app0 = [0xff, 0xe0, ...be16(16), 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0];
	const exif = options.withExif ? [0xff, 0xe1, ...be16(8), 0x45, 0x78, 0x69, 0x66, 0, 0] : [];
	const sof = [0xff, options.sofMarker ?? 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
	const header = [0xff, 0xd8, ...app0, ...exif, sof].flat();
	const end = [0xff, 0xd9];
	const bytes = new Uint8Array(header.length + (options.padding ?? 0) + end.length);
	bytes.set(header);
	bytes.set(end, bytes.length - 2);
	return bytes;
}
