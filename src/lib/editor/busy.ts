/**
 * Timing choreography for the busy overlay — how long it stays up and what
 * must have painted before it lifts. Presentation concerns, kept out of
 * EditorState so the state class stays about slot/version/dirty.
 */

/**
 * Waits for the browser to actually paint before returning. Decoding a save is
 * heavy synchronous work that blocks the main thread; without a real paint here
 * the wait overlay would mount and unmount inside one frozen frame and never
 * show. Two frames because the first fires before the pending paint, the second
 * after it has landed.
 */
export function paintFrame(): Promise<void> {
	if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
	return new Promise((resolve) => {
		// rAF never fires while the document is hidden, and this wait exists only
		// for the overlay's benefit — don't let a background tab hang the load.
		const bail = setTimeout(resolve, 250);
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				clearTimeout(bail);
				resolve();
			})
		);
	});
}

/**
 * A small file decodes in under a tenth of a second, so the wait overlay would
 * flash up and vanish before the eye caught it and the whole page would look
 * like it never loaded. Keep the overlay up for a beat so a fast open still
 * reads as a load. A slow one already runs past this and lifts the moment it is
 * done.
 */
const MIN_WAIT_MS = 500;

export function now(): number {
	return typeof performance !== 'undefined' ? performance.now() : 0;
}

/** Wait out whatever is left of the minimum window since the overlay appeared. */
export function holdWait(shown: number): Promise<void> {
	const left = MIN_WAIT_MS - (now() - shown);
	return left > 0 ? new Promise((resolve) => setTimeout(resolve, left)) : Promise.resolve();
}

/**
 * The three pixel faces are `font-display: block`, so text in a face the browser
 * has not fetched yet stays invisible and then pops in the moment it lands. The
 * title face and the DOS value face are not used on the landing screen, so
 * without this they arrive only once the editor is already showing. Pull all
 * three now. A face that fails to load just falls back, so a miss never blocks.
 *
 * The root layout calls this at startup, which is what actually keeps the wait
 * overlay's label readable — it is set in the title face, and fetching that only
 * once a load began left it blank until the load ended. Calling it again per
 * load is the guarantee, not the fetch: an already-loaded face resolves at once.
 */
export function loadFonts(): Promise<unknown> {
	if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
	return Promise.all([
		document.fonts.load("48px '000webfont'"),
		document.fonts.load("15px '8-bit HUD'"),
		document.fonts.load("16px 'Perfect DOS VGA 437'")
	]).catch(() => undefined);
}
