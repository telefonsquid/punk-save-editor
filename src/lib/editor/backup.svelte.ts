/**
 * The backup and restore subsystem: the load-time question, the Backup action,
 * the restore browser and the confirm in front of it.
 *
 * Split from `EditorState` because it changes for its own reasons — where
 * archives live, what a restore has to warn about — none of which are "which
 * save is open and what is dirty". What it borrows from the editor is exactly
 * that: the open folder (or the last one, when nothing is open), the wait
 * overlay, and `reload()` for the moment the folder changes underneath it.
 *
 * One error line, not two. Everything here reports into `error`, which the
 * restore dialog shows; a folder that will not open and an archive that will not
 * read are the same kind of news to the person who clicked.
 */

import { archiveName, openArchive, packSaveFolder, unpackInto } from '$lib/save/backup';
import type { BackupArchive, BackupFolder } from '$lib/save/backup-folder';
import { isDownloadDir, pickSaveDir, type ReadableDir, type SaveDir } from '$lib/save/io';
import type { ZipEntry } from '$lib/save/zip';
import { settings } from './settings.svelte';
import type { EditorState } from './state.svelte';

/** An archive that has been read and checked, waiting on the go-ahead. */
export interface PendingRestore {
	/** The archive as the folder listed it. */
	file: BackupArchive;
	/** The folder its files were stored under, when it had one. */
	folder: string | null;
	files: ZipEntry[];
	/**
	 * The save folder it would be written into — settled before the question is
	 * asked, because the question names it.
	 */
	dir: SaveDir;
}

export class BackupState {
	/** The "back this up first?" question, open just after a save was opened. */
	asking = $state(false);
	/** The restore browser. */
	browsing = $state(false);
	/**
	 * Whether the title screen has a restore to offer. Not cleared by `reset()`
	 * along with the rest: it is a fact about the backup folder rather than about
	 * the save that just closed, and the screen that reads it re-asks on the way
	 * in anyway.
	 */
	offerRestore = $state(false);
	archives = $state.raw<BackupArchive[]>([]);
	pending = $state.raw<PendingRestore | null>(null);
	/**
	 * The archive the delete question is about — marked for it, not being
	 * deleted. Restoring and deleting each put a question in front of the list,
	 * and never both: the question replaces the list it was asked from.
	 */
	doomed = $state.raw<BackupArchive | null>(null);
	/** Why the last thing asked for did not happen. */
	error = $state<string | null>(null);

	readonly #editor: EditorState;

	constructor(editor: EditorState) {
		this.#editor = editor;
	}

	/**
	 * A backup can be handed out anywhere — as a download if nothing else. Putting
	 * one *back* needs a runtime that can write the save folder, which is the same
	 * capability saving in place needs.
	 */
	get canRestore(): boolean {
		return !!this.#editor.slot && !this.#editor.downloadMode;
	}

	reset = (): void => {
		this.asking = false;
		this.browsing = false;
		this.pending = null;
		this.doomed = null;
		this.archives = [];
		this.error = null;
	};

	/** Points backups somewhere else, from the restore browser or Options. */
	chooseFolder = async (): Promise<void> => {
		this.error = null;
		try {
			if (!(await settings.repick())) return;
			// Both questions named a file in the folder that just stopped being
			// the folder.
			this.pending = null;
			this.doomed = null;
		} catch (err) {
			this.error = (err as Error).message;
			return;
		}
		if (this.browsing) await this.list();
	};

	/** Zips the whole save folder into the backup folder. */
	take = async (): Promise<void> => {
		const slot = this.#editor.slot;
		if (!slot) return;
		this.error = null;
		// Outside the wait: this is the half that opens a picker and renews the
		// folder's permission, and both need the click that is still live. A
		// picker behind a full-screen overlay is a dialog nobody can see, and a
		// permission asked for after zipping 12 MB is one that gets refused.
		let folder: BackupFolder | null;
		try {
			folder = await settings.require();
		} catch (err) {
			this.error = (err as Error).message;
			return;
		}
		if (!folder) return;
		this.asking = false;

		try {
			await this.#editor.withWait('Backing up save', async () => {
				// One moment for both the file name and the stamp inside the archive.
				const at = Date.now();
				// Two backups in the same minute would otherwise land on the same
				// name. A folder that cannot be listed is no reason not to write one
				// — the access it needs was taken above, so this is a folder that
				// will not enumerate, not one we are locked out of.
				let taken: string[] = [];
				if (folder.restorable) {
					try {
						taken = (await folder.list()).map((a) => a.name);
					} catch {
						/* named blind */
					}
				}
				const name = archiveName(slot.dir.name, taken, at);
				await folder.write(name, await packSaveFolder(sourceFor(slot.dir), at));
				// The archive turning up in the restore list is the receipt.
				if (this.browsing) await this.list();
			});
		} catch (err) {
			this.error = (err as Error).message;
		}
	};

	/**
	 * Looks, without asking anyone anything, for archives to offer with no save
	 * open. Silent throughout: nothing here was clicked, so a folder that has
	 * moved costs the button and not an error line.
	 *
	 * Deliberately *not* `require()` — that picks a folder and renews a
	 * permission, and both belong to a click. A remembered Chromium handle whose
	 * grant lapsed with the last tab therefore throws here instead of listing,
	 * and no button is the right answer to that: the click behind one spends its
	 * user gesture on the save folder picker, leaving nothing to renew the
	 * archive folder with, and the browser it opened would say only that it has
	 * no permission. Tauri's scope survives a restart, so on the desktop app —
	 * where a remembered folder is the normal case — the count is always real.
	 */
	lookForArchives = async (): Promise<void> => {
		let found = false;
		try {
			await settings.recall();
			const folder = settings.folder;
			// `restorable` is false exactly where a restore could not happen at all:
			// the browsers that can only hand an archive out through a download.
			if (folder?.restorable) found = (await folder.list()).length > 0;
		} catch {
			// Unreachable, unasked-for, or empty are one answer here: no offer.
		}
		this.offerRestore = found;
	};

	/**
	 * Where a restore would land.
	 *
	 * An archive carries files and not the folder they belong in, so a restore has
	 * to be told where it goes — and it has to be told *before* the question,
	 * because the question names the folder it is about to write over.
	 *
	 * The open save when there is one. With nothing open — the title screen, where
	 * this list can be reached on its own — the folder this session opened, or the
	 * one the last session left behind and `rememberedSaveDir` could still read.
	 * Neither costs a picker; that is what remembering it is for. Only a restore on
	 * a machine that has never opened a save here has to ask, and it asks from
	 * here: this runs on the click that chose an archive, where the gesture a
	 * picker needs is still live.
	 */
	#destination = async (): Promise<SaveDir | null> => {
		const open = this.#editor.slot?.dir;
		if (open) return open;
		await this.#editor.recallLastSave();
		const known = this.#editor.lastSave;
		if (known) return known;
		const picked = await pickSaveDir();
		// Unreachable — restore is not offered at all in the browsers that can only
		// upload a folder — but an archive cannot be put back into a folder that
		// exists in this page's memory, so it is refused rather than written to.
		return !picked || isDownloadDir(picked) ? null : picked;
	};

	/**
	 * Opens the restore browser on a freshly read list — from the save strip, or
	 * from the title screen with nothing open at all. Nothing is loaded first in
	 * either case: this list is about the backup folder, and which save folder an
	 * archive would go back into is `#destination`'s question, asked once one has
	 * been chosen.
	 */
	browse = async (): Promise<void> => {
		this.pending = null;
		this.doomed = null;
		this.browsing = true;
		await this.list();
	};

	/** Reads the backup folder for the restore browser. */
	list = async (): Promise<void> => {
		this.error = null;
		try {
			const folder = await settings.require();
			// Newest first: the one you want back is almost always the last one made.
			this.archives = folder
				? (await folder.list()).sort(
						(a, b) => (b.modified ?? 0) - (a.modified ?? 0) || a.name.localeCompare(b.name)
					)
				: [];
		} catch (err) {
			this.archives = [];
			this.error = (err as Error).message;
		}
	};

	/**
	 * Reads an archive and checks it holds a save, so the question that follows
	 * can name what is actually about to be written rather than what a file name
	 * suggests.
	 */
	prepare = async (file: BackupArchive): Promise<void> => {
		this.error = null;
		// Before the wait, and before anything is read: settling where this would
		// land can open a folder picker, and a picker behind a full-screen overlay
		// is a dialog nobody can see. Nothing is written by asking — the question
		// this sets up is still in front of that.
		let dir: SaveDir | null;
		try {
			dir = await this.#destination();
		} catch (err) {
			this.error = (err as Error).message;
			return;
		}
		if (!dir) return;

		try {
			await this.#editor.withWait('Reading backup', async () => {
				// The folder is in hand and granted by now — the list came from it —
				// so nothing here can put a picker up behind the wait.
				const folder = await settings.require();
				if (!folder) return;
				const { files, folder: inside } = await openArchive(await folder.read(file.name));
				this.pending = { file, folder: inside, files, dir };
			});
		} catch (err) {
			this.pending = null;
			this.error = `${file.name}: ${(err as Error).message}`;
		}
	};

	/** Backs out of the confirm, back to the list. */
	cancel = (): void => {
		this.pending = null;
	};

	/**
	 * Puts the delete question up for one archive.
	 *
	 * Nothing is read first, unlike `prepare`: a restore has to say what it is
	 * about to write into the save folder, where a delete only has to name the
	 * file, and the list already knows its name, date and size. Reading an
	 * archive to check it is a save would also be the wrong gate — a corrupt one
	 * is exactly the archive somebody wants gone.
	 */
	askDelete = (file: BackupArchive): void => {
		this.error = null;
		this.doomed = file;
	};

	/** Backs out of the delete question, back to the list. */
	cancelDelete = (): void => {
		this.doomed = null;
	};

	/**
	 * Deletes the archive the question named, and reads the folder again.
	 *
	 * No wait overlay for this one: taking a backup is 12 MB through a
	 * compressor, this is an unlink. `settings.require()` still runs first and
	 * straight off the click for the usual reason — a Chromium grant lapses with
	 * the tab, and this dialog can have been sitting open across one.
	 */
	discard = async (): Promise<void> => {
		const file = this.doomed;
		if (!file) return;
		this.error = null;
		try {
			const folder = await settings.require();
			if (!folder) return;
			await folder.remove(file.name);
			// The row leaving the list is the receipt.
			this.doomed = null;
			await this.list();
		} catch (err) {
			// Back to the list either way. The error line lives there, and an
			// archive that would not delete is still one you can restore.
			this.doomed = null;
			this.error = `${file.name}: ${(err as Error).message}`;
		}
	};

	/**
	 * Shuts the restore browser and drops what it was showing, the error
	 * included: it belongs to the dialog that asked, and the page carries its own
	 * copy for the Backup button, which has no dialog behind it.
	 */
	closeBrowser = (): void => {
		this.browsing = false;
		this.pending = null;
		this.doomed = null;
		this.error = null;
	};

	/** Answers the load-time question with "not now". */
	dismissPrompt = (): void => {
		this.asking = false;
		this.error = null;
	};

	/** Writes the prepared archive over the save folder and reloads from disk. */
	confirm = async (): Promise<void> => {
		const pending = this.pending;
		if (!pending) return;
		this.error = null;
		try {
			await this.#editor.withWait('Restoring backup', async () => {
				await unpackInto(pending.dir, pending.files);
				// Read again from scratch, for two reasons that are the same line of
				// code. Where that folder was open, everything in memory is now a
				// version of files that no longer exist, unsaved edits included.
				// Where it was not — a restore off the title screen — this is the
				// only thing the person who clicked gets to see: the editor comes up
				// holding what the archive put on the disk. A failure past this point
				// drops to the title screen rather than leaving stale trees over a
				// folder that moved.
				await this.#editor.reload(pending.dir);
				// The editor now holding the archive's values is the receipt.
				this.pending = null;
				this.browsing = false;
			});
		} catch (err) {
			this.error = (err as Error).message;
		}
	};
}

/**
 * What to pack. In place that is simply the folder; in download mode the folder
 * only exists in memory and the editor has been writing to it, so the backup is
 * taken from the copy as uploaded — a restore point worth returning to is the
 * one the game left, not the one this session has been editing.
 */
function sourceFor(dir: SaveDir): ReadableDir {
	return isDownloadDir(dir) ? dir.asUploaded() : dir;
}
