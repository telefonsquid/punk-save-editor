/**
 * The editor's shared state: which save is open, what's dirty, and the
 * version counter that drives every derived view. Panels receive one
 * instance of this as a prop from +page.svelte.
 *
 * The decoded save trees are huge plain-object graphs and deliberately NOT
 * deep-reactive: a deep $state proxy stores mutations in its own signal
 * storage and never writes them back to the underlying objects, so the
 * serializer would save stale data. So `slot` is `$state.raw`, the UI mutates
 * the raw trees directly, and `refresh()` bumps `version` — which every
 * derived view reads — to invalidate them.
 */

import { SvelteSet } from 'svelte/reactivity';
import { isDownloadDir, pickSaveDir, type SaveDir } from '$lib/save/io';
import { loadFile, loadSlot, saveSlot, type SaveSlot } from '$lib/save/slot';

export class EditorState {
	slot = $state.raw<SaveSlot | null>(null);
	/** Bumped after every edit; derived views read it to recompute. */
	version = $state(0);
	busy = $state(false);
	/** What the `busy` spinner should say — set before each long task. */
	busyLabel = $state('Loading save');
	error = $state<string | null>(null);
	statusMessage = $state<string | null>(null);
	/** Name of the raw file currently being decoded, if any. */
	rawLoading = $state<string | null>(null);
	readonly dirtyFiles = new SvelteSet<string>();
	readonly loadedFiles = new SvelteSet<string>();

	get dirty(): boolean {
		return this.dirtyFiles.size > 0;
	}

	/** Firefox/Safari can't write in place; saving downloads a zip instead. */
	get downloadMode(): boolean {
		return !!this.slot && isDownloadDir(this.slot.dir);
	}

	refresh = (): void => {
		this.version++;
	};

	/** Marks the curated-section files dirty (vault + rundata are edited together). */
	markCurated = (): void => {
		this.dirtyFiles.add('vault');
		this.dirtyFiles.add('rundata');
	};

	open = async (): Promise<void> => {
		this.error = null;
		this.statusMessage = null;
		try {
			const dir = (import.meta.env.DEV && devTestDir()) || (await pickSaveDir());
			if (!dir) return;
			this.busyLabel = 'Loading save';
			this.busy = true;
			await paintFrame();
			const shown = now();
			// Fetch the pixel faces while the save decodes, so no title or value
			// pops in a beat after the wait lifts (see loadFonts).
			const fonts = loadFonts();
			this.slot = await loadSlot(dir);
			this.dirtyFiles.clear();
			this.loadedFiles.clear();
			for (const name of Object.keys(this.slot.files)) this.loadedFiles.add(name);
			// Ship resources live in the heavier `entities` file; load it up front
			// so they show without a click. A save without it is still openable.
			try {
				await loadFile(this.slot, 'entities');
				this.loadedFiles.add('entities');
			} catch {
				/* no entities file — the ship section falls back to its notice */
			}
			this.version++;
			await fonts; // text has to be able to paint before the wait lifts
			await holdWait(shown);
		} catch (err) {
			this.error = (err as Error).message;
		} finally {
			this.busy = false;
		}
	};

	/**
	 * Drops the open save and returns to the title screen. Edits that were never
	 * written are gone with it, so the caller is expected to have asked first.
	 */
	close = (): void => {
		this.slot = null;
		this.dirtyFiles.clear();
		this.loadedFiles.clear();
		this.error = null;
		this.statusMessage = null;
		this.rawLoading = null;
		this.version++;
	};

	save = async (): Promise<void> => {
		if (!this.slot || this.dirtyFiles.size === 0) return;
		this.error = null;
		this.statusMessage = null;
		this.busyLabel = isDownloadDir(this.slot.dir) ? 'Preparing download' : 'Saving changes';
		this.busy = true;
		await paintFrame();
		const shown = now();
		try {
			const names = [...this.dirtyFiles];
			await saveSlot(this.slot, names);
			this.dirtyFiles.clear();
			if (isDownloadDir(this.slot.dir)) {
				this.slot.dir.exportChanges();
				this.statusMessage =
					`Downloaded "${this.slot.dir.name}-edited.zip" (${names.join(', ')} + *.bak backups). ` +
					`Extract it into your save folder to apply the changes.`;
			} else {
				this.statusMessage = `Saved ${names.join(', ')}. Originals were backed up as *.bak.`;
			}
		} catch (err) {
			this.error = (err as Error).message;
		} finally {
			await holdWait(shown);
			this.busy = false;
		}
	};

	/** Lazily decodes one of the optional raw files when its section opens. */
	openRawFile = async (name: string, opened: boolean): Promise<void> => {
		if (!opened || !this.slot || this.loadedFiles.has(name) || this.rawLoading) return;
		this.rawLoading = name;
		this.error = null;
		try {
			await loadFile(this.slot, name);
			this.loadedFiles.add(name);
		} catch (err) {
			this.error = (err as Error).message;
		} finally {
			this.rawLoading = null;
		}
	};
}

/**
 * Waits for the browser to actually paint before returning. Decoding a save is
 * heavy synchronous work that blocks the main thread; without a real paint here
 * the wait overlay would mount and unmount inside one frozen frame and never
 * show. Two frames because the first fires before the pending paint, the second
 * after it has landed.
 */
function paintFrame(): Promise<void> {
	if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
	return new Promise((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	);
}

/**
 * A small file decodes in under a tenth of a second, so the wait overlay would
 * flash up and vanish before the eye caught it and the whole page would look
 * like it never loaded. Keep the overlay up for a beat so a fast open still
 * reads as a load. A slow one already runs past this and lifts the moment it is
 * done.
 */
const MIN_WAIT_MS = 500;

function now(): number {
	return typeof performance !== 'undefined' ? performance.now() : 0;
}

/** Wait out whatever is left of the minimum window since the overlay appeared. */
function holdWait(shown: number): Promise<void> {
	const left = MIN_WAIT_MS - (now() - shown);
	return left > 0 ? new Promise((resolve) => setTimeout(resolve, left)) : Promise.resolve();
}

/**
 * The three pixel faces are `font-display: block`, so text in a face the browser
 * has not fetched yet stays invisible and then pops in the moment it lands. The
 * title face and the DOS value face are not used on the landing screen, so
 * without this they arrive only once the editor is already showing. Pull all
 * three now. A face that fails to load just falls back, so a miss never blocks.
 */
function loadFonts(): Promise<unknown> {
	if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
	return Promise.all([
		document.fonts.load("48px '000webfont'"),
		document.fonts.load("15px '8-bit HUD'"),
		document.fonts.load("16px 'Perfect DOS VGA 437'")
	]).catch(() => undefined);
}

/** Dev-only escape hatch so automated tests can inject an in-memory SaveDir. */
function devTestDir(): SaveDir | null {
	return (window as unknown as { __punkTestDir?: SaveDir }).__punkTestDir ?? null;
}
