/**
 * Pixel-perfect sizing for the ripped game art.
 *
 * **The rule: a pixel icon is only ever displayed at an integer multiple of its
 * natural size, with nearest-neighbour scaling.** The sprites are hand-drawn
 * pixel art (mostly 24x24, the HUD glyphs ~8-13px); at any fractional scale a
 * source pixel lands on a non-integer number of screen pixels and the renderer
 * has to pick winners, so edges shimmer and single-pixel details vanish. Fixed
 * CSS boxes (`h-8 w-8`) do exactly that, and also squash non-square art.
 *
 * So the icon components take a `scale` (default 2x) and derive the rendered
 * width/height from the PNG itself rather than from a class. The extraction
 * scripts must therefore emit sprites at their **native** size — see the note in
 * scripts/extract-item-icons.py.
 */

/**
 * Reads the natural pixel size out of a base64 PNG data URI.
 *
 * A PNG always opens with an 8-byte signature then the IHDR chunk, whose width
 * and height are big-endian u32s at byte offsets 16 and 20 — so decoding the
 * first 24 bytes is enough, no image loading or layout pass required.
 */
export function pngSize(dataUri: string): { width: number; height: number } | null {
	const comma = dataUri.indexOf(',');
	if (comma < 0) return null;
	try {
		// 32 base64 chars decode to 24 bytes, which covers the IHDR dimensions.
		const bin = atob(dataUri.slice(comma + 1, comma + 33));
		if (bin.length < 24) return null;
		const at = (o: number) =>
			((bin.charCodeAt(o) << 24) |
				(bin.charCodeAt(o + 1) << 16) |
				(bin.charCodeAt(o + 2) << 8) |
				bin.charCodeAt(o + 3)) >>>
			0;
		return { width: at(16), height: at(20) };
	} catch {
		return null;
	}
}

/** Rendered size for a sprite: natural dimensions times an integer scale. */
export function iconStyle(dataUri: string, scale: number): string {
	const size = pngSize(dataUri);
	const s = Math.max(1, Math.round(scale));
	// image-rendering:pixelated is what makes the integer scale actually crisp.
	const base = 'image-rendering: pixelated; flex: none;';
	if (!size) return base;
	return `${base} width: ${size.width * s}px; height: ${size.height * s}px;`;
}
