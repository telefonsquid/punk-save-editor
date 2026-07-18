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
			this.busy = true;
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
			this.statusMessage = `Loaded "${dir.name}"`;
		} catch (err) {
			this.error = (err as Error).message;
		} finally {
			this.busy = false;
		}
	};

	save = async (): Promise<void> => {
		if (!this.slot || this.dirtyFiles.size === 0) return;
		this.error = null;
		this.statusMessage = null;
		this.busy = true;
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

/** Dev-only escape hatch so automated tests can inject an in-memory SaveDir. */
function devTestDir(): SaveDir | null {
	return (window as unknown as { __punkTestDir?: SaveDir }).__punkTestDir ?? null;
}
