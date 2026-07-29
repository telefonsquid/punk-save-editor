/**
 * The two things the app remembers between sessions: where backup archives go,
 * and whether opening a save offers to take one first.
 *
 * A module-level singleton rather than fields on EditorState, because the
 * footer outlives the editor. The options dialog hangs off the layout and is
 * reachable with no save open at all, while the same two settings are also
 * reached from inside the editor — the load-time prompt can switch the question
 * off, the restore browser can point backups somewhere else. Two copies of that
 * state would disagree the moment either side wrote one.
 *
 * Finding and opening the folder is `save/backup-folder.ts`. Whether a dialog
 * appears is not a save-layer question, so it is answered here.
 */

import {
	pickBackupFolder,
	rememberedBackupFolder,
	type BackupFolder
} from '$lib/save/backup-folder';

const ASK_KEY = 'punk-save-editor:ask-backup';

/** Prerendering has no storage; the app itself always does (`ssr = false`). */
const hasStorage = typeof localStorage !== 'undefined';

class Settings {
	/** Where backups go, once it has been picked or read back from storage. */
	folder = $state.raw<BackupFolder | null>(null);

	/**
	 * Whether opening a save offers to back it up first. Defaults to on: the one
	 * moment a restore point is certainly worth taking is before the editor has
	 * touched anything, and someone who disagrees says so once.
	 */
	askOnLoad = $state(!hasStorage || localStorage.getItem(ASK_KEY) !== 'off');

	setAskOnLoad = (on: boolean): void => {
		this.askOnLoad = on;
		if (!hasStorage) return;
		try {
			localStorage.setItem(ASK_KEY, on ? 'on' : 'off');
		} catch {
			// A blocked storage costs the setting, not the backup.
		}
	};

	/**
	 * Reads back the folder chosen in an earlier session — and only that. No
	 * picker and, deliberately, no permission request: this runs to *name* where
	 * a backup would go, on screens that are not asking for one yet. Prompting
	 * there would put a permission dialog in front of everyone who opens a save.
	 */
	recall = async (): Promise<void> => {
		if (!this.folder) this.folder = await rememberedBackupFolder();
	};

	/**
	 * The backup folder, ready to use — picked if this is the first time, and
	 * with its access renewed either way.
	 *
	 * Every caller runs this *first*, straight off the click. Opening a picker
	 * and renewing a remembered handle's permission both need the user gesture,
	 * and zipping 12 MB spends it: ask afterwards and the prompt arrives behind
	 * a full-screen wait, or is refused outright once the gesture has expired.
	 */
	require = async (): Promise<BackupFolder | null> => {
		await this.recall();
		if (!this.folder) this.folder = await pickBackupFolder();
		if (!this.folder) return null;
		await this.folder.grant();
		return this.folder;
	};

	/** Points backups somewhere else. False when the picker was dismissed. */
	repick = async (): Promise<boolean> => {
		const picked = await pickBackupFolder();
		if (!picked) return false;
		this.folder = picked;
		return true;
	};
}

export const settings = new Settings();
