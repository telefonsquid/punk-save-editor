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
import {
	isMixedBackup,
	loadFile,
	loadSlot,
	saveSlot,
	type BackupReport,
	type SaveSlot
} from '$lib/save/slot';
import { holdWait, loadFonts, now, paintFrame } from './busy';

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

	/** Records a click-driven edit to `file` and repaints. Typed inputs mark
	 * their file in the input handler and repaint on change instead. */
	touch = (file: string): void => {
		this.dirtyFiles.add(file);
		this.version++;
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
			// Normally already done at startup (see loadFonts) and resolves at once.
			// Repeated here so no title or value can pop in a beat after the wait
			// lifts, whatever happened earlier.
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
			} catch (err) {
				// A save without the file is normal (the ship section shows its
				// notice). A file that exists but fails to decode is not — surface
				// that instead of pretending the ship doesn't exist.
				if (await this.slot.dir.exists('entities')) {
					this.error = `entities: ${(err as Error).message}`;
				}
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
			const backup = await saveSlot(this.slot, names);
			this.dirtyFiles.clear();
			if (isDownloadDir(this.slot.dir)) {
				this.slot.dir.exportChanges(); // the browser's own download prompt is confirmation enough
			} else {
				this.statusMessage = `Saved ${names.join(', ')}. ${backupNote(backup)}`;
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
 * The backup half of the save status. It says what actually happened rather
 * than "the whole folder was backed up": a folder that already carried some
 * *.bak files ends up with a set from two different moments, and restoring that
 * mix is the very thing whole-folder backups are meant to prevent.
 */
function backupNote(report: BackupReport): string {
	const parts: string[] = [];
	if (isMixedBackup(report)) {
		parts.push(
			`Backed up ${report.created.length} more file${report.created.length === 1 ? '' : 's'} as *.bak, ` +
				`but ${report.kept.join(', ')} already had a backup from an earlier session, so the *.bak set ` +
				`is not one moment. Delete the old backups and save again for a single snapshot.`
		);
	} else if (report.created.length > 0) {
		parts.push('The whole folder was backed up as *.bak.');
	} else {
		parts.push('The *.bak backups from the earlier save are unchanged.');
	}
	if (report.failed.length > 0) {
		parts.push(`Could not back up ${report.failed.join(', ')} — those have no *.bak.`);
	}
	return parts.join(' ');
}

/** Dev-only escape hatch so automated tests can inject an in-memory SaveDir. */
function devTestDir(): SaveDir | null {
	return (window as unknown as { __punkTestDir?: SaveDir }).__punkTestDir ?? null;
}
