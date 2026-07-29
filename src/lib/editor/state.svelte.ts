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
 *
 * Backups and restores are their own subsystem and live in `./backup.svelte`,
 * reached as `editor.backups`. What they need from here is the open folder and
 * `reload()`.
 */

import { SvelteSet } from 'svelte/reactivity';
import { isDownloadDir, pickSaveDir, rememberedSaveDir, type SaveDir } from '$lib/save/io';
import { loadFile, loadSlot, saveSlot, type SaveSlot } from '$lib/save/slot';
import { BackupState } from './backup.svelte';
import { holdWait, loadFonts, now, paintFrame } from './busy';
import { settings } from './settings.svelte';

export class EditorState {
	slot = $state.raw<SaveSlot | null>(null);
	/**
	 * The save folder to come back to: the one open now, or the one the last
	 * session left behind — null until the probe has answered, and after it where
	 * there is nothing to come back to.
	 */
	lastSave = $state.raw<SaveDir | null>(null);
	/** Bumped on every edit; derived views read it to invalidate. */
	version = $state(0);
	busy = $state(false);
	/** What the `busy` spinner should say — set before each long task. */
	busyLabel = $state('Loading save');
	// Only failures are reported. A finished action shows its own result — the
	// save button goes quiet, the archive appears in the restore list, the editor
	// is holding the restored save — so a line announcing it is a second thing to
	// read that says nothing the screen did not already say.
	error = $state<string | null>(null);
	/** Name of the raw file currently being decoded, if any. */
	rawLoading = $state<string | null>(null);
	readonly dirtyFiles = new SvelteSet<string>();
	readonly loadedFiles = new SvelteSet<string>();

	readonly backups = new BackupState(this);

	/** The one look for a remembered folder, shared by everyone who asks. */
	#recalled: Promise<void> | null = null;

	get dirty(): boolean {
		return this.dirtyFiles.size > 0;
	}

	/** True when saving hands back a zip instead of writing the folder. */
	get downloadMode(): boolean {
		return !!this.slot && isDownloadDir(this.slot.dir);
	}

	refresh = (): void => {
		this.version++;
	};

	/**
	 * Records a click-driven edit to `file` and repaints. The bump is half the
	 * job, not an extra: the trees are `$state.raw`, so a mutation is invisible
	 * until `version` moves and the derived views recompute.
	 *
	 * Typed inputs are the exception — they mark their file in the input handler
	 * and repaint on `change`, so a half-typed decimal isn't clobbered mid-keystroke.
	 */
	touch = (file: string): void => {
		this.dirtyFiles.add(file);
		this.version++;
	};

	/**
	 * Runs a long task behind the full-screen wait, held for a minimum beat so a
	 * fast one doesn't flash. Whatever it throws is the caller's to place — the
	 * editor and the backup subsystem report into different lines on screen.
	 */
	withWait = async <T>(label: string, task: () => Promise<T>): Promise<T> => {
		this.busyLabel = label;
		this.busy = true;
		await paintFrame();
		const shown = now();
		try {
			return await task();
		} finally {
			await holdWait(shown);
			this.busy = false;
		}
	};

	/**
	 * Looks for the folder the last session left, once, quietly. Every caller
	 * shares the one answer: the title screen asks on the way in, so that a
	 * restore started from there already knows where it would land, and the click
	 * asks again in case it was faster.
	 */
	recallLastSave = (): Promise<void> => (this.#recalled ??= this.#findLastSave());

	#findLastSave = async (): Promise<void> => {
		try {
			// The same hook `#openFolder` honours, for the same reason: an automated
			// run has no picker and no folder from last session either.
			const test = import.meta.env.DEV ? devTestDir() : null;
			this.lastSave = test ?? (await rememberedSaveDir());
		} catch {
			// Nobody clicked, so nobody is told. No folder is the answer to every
			// way this can fail, and the picker is still there.
			this.lastSave = null;
		}
	};

	open = async (): Promise<void> => {
		this.error = null;
		try {
			// The test hook stands in for the folder picker, and an automated run
			// must not be stopped by a modal — so a test open never asks.
			const test = import.meta.env.DEV ? devTestDir() : null;
			const dir = test ?? (await pickSaveDir());
			if (!dir) return;
			this.busyLabel = 'Loading save';
			this.busy = true;
			// One frame for the overlay to actually paint before the main thread
			// disappears into LZF + Odin decoding.
			await paintFrame();
			const shown = now();
			// Repeated here so no title or value can pop in a beat after the wait
			// lifts, whatever happened earlier.
			const fonts = loadFonts();
			try {
				await this.reload(dir);
			} finally {
				await fonts; // text has to be able to paint before the wait lifts
				// So the question can say where the archive would land.
				if (settings.askOnLoad) await settings.recall();
				await holdWait(shown);
				this.busy = false;
			}
			// Last, so the question arrives as the wait lifts rather than behind it.
			this.backups.asking = !test && settings.askOnLoad;
		} catch (err) {
			this.error = (err as Error).message;
		}
	};

	close = (): void => {
		this.slot = null;
		this.dirtyFiles.clear();
		this.loadedFiles.clear();
		this.error = null;
		this.rawLoading = null;
		this.backups.reset();
		this.version++;
	};

	save = async (): Promise<void> => {
		if (!this.slot || this.dirtyFiles.size === 0) return;
		this.error = null;
		const label = isDownloadDir(this.slot.dir) ? 'Preparing download' : 'Saving changes';
		try {
			await this.withWait(label, async () => {
				const slot = this.slot!;
				await saveSlot(slot, [...this.dirtyFiles]);
				this.dirtyFiles.clear();
				// The save button going quiet is the receipt; in download mode the
				// browser's own prompt is.
				if (isDownloadDir(slot.dir)) await slot.dir.exportChanges();
			});
		} catch (err) {
			this.error = (err as Error).message;
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

	/**
	 * Reads a save folder into the editor, from scratch. Shared by opening a
	 * folder and by restoring one out from under an open editor.
	 *
	 * The old slot is dropped *before* the decode rather than replaced after it,
	 * because the two callers fail differently. A restore has already rewritten
	 * the folder by the time this runs: if the decode then threw and the previous
	 * slot were still standing, the editor would hold trees — and dirty flags —
	 * belonging to files that no longer exist, and the next Save would write them
	 * back over the restored ones. Landing on the title screen with the error is
	 * the honest outcome; the folder on disk is whatever it is, and re-opening it
	 * is one click.
	 */
	reload = async (dir: SaveDir): Promise<void> => {
		this.slot = null;
		this.dirtyFiles.clear();
		this.loadedFiles.clear();
		this.version++;
		const slot = await loadSlot(dir);
		for (const name of Object.keys(slot.files)) this.loadedFiles.add(name);
		// Ship resources live in the heavier `entities` file; load it up front
		// so they show without a click. A save without it is still openable.
		try {
			await loadFile(slot, 'entities');
			this.loadedFiles.add('entities');
		} catch (err) {
			// A save without the file is normal (the ship section shows its
			// notice). A file that exists but fails to decode is not — surface
			// that instead of pretending the ship doesn't exist.
			if (await dir.exists('entities')) this.error = `entities: ${(err as Error).message}`;
		}
		this.slot = slot;
		this.version++;
		// A folder this editor has just read is the folder to come back to, however
		// it was reached: opened from the title screen, or restored into from the
		// browser with nothing open at all. Recorded here rather than by each
		// caller so it can never drift from what is actually on screen. Never in
		// download mode — that folder was uploaded, not opened, and there is no way
		// back to it.
		this.lastSave = isDownloadDir(dir) ? null : dir;
		this.#recalled = Promise.resolve();
	};
}

/** Dev-only escape hatch so automated tests can inject an in-memory SaveDir. */
function devTestDir(): SaveDir | null {
	return (window as unknown as { __punkTestDir?: SaveDir }).__punkTestDir ?? null;
}
