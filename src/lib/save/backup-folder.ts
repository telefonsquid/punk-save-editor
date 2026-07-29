/**
 * Where backups are kept: a folder picked once and remembered, in whichever way
 * the runtime can remember one.
 *
 * The editor does not put it inside the save folder, and does not stop you from
 * doing exactly that. Backups outliving the thing they protect is the point — a
 * folder deleted, a game reinstalled or a save wiped by the game itself takes
 * anything stored inside it along — so the picker never suggests the save folder
 * and the docs say why. But it is the user's disk: if they point it there
 * anyway, that works, and `backup.ts` keeps archives out of their own successors
 * so it keeps working.
 *
 * Being remembered at all is `remember.ts`, which the save folder uses too.
 * What differs here is Firefox/Safari: neither can write a folder, so "the
 * backup folder" is the download folder — archives go out through the browser's
 * own save dialog and cannot be listed or read back. Permission on a remembered
 * Chromium handle lapses when the tab closes; `grant()` is how a caller renews
 * it on the click that needs it.
 */

import { downloadBlob } from './io';
import { dirFrom, pickDirectory, runtime, type PickedDir } from './platform';
import { recallDir, rememberDir } from './remember';

export interface BackupArchive {
	name: string;
	size: number;
	/** Last-modified time in ms, when the platform reports one. */
	modified: number | null;
}

export interface BackupFolder {
	/** Where the archives go, in whatever detail the runtime knows. */
	readonly label: string;
	/** False when archives can only be handed out, never read back (downloads). */
	readonly restorable: boolean;
	/**
	 * Takes the access this folder needs, and throws if it cannot get it.
	 *
	 * Split out from the methods below because of *when* it has to run: a
	 * remembered Chromium handle has no permission until it is asked for, asking
	 * needs a live user gesture, and zipping 12 MB spends one. Every caller runs
	 * this on the click and does the work afterwards — never the other way round,
	 * which is a permission prompt behind a full-screen wait overlay and a
	 * refusal that arrives after all the work is done.
	 */
	grant(): Promise<void>;
	list(): Promise<BackupArchive[]>;
	read(name: string): Promise<Uint8Array>;
	write(name: string, data: Uint8Array): Promise<void>;
	/** Throws an archive away. Permanent — see `DirOps.remove`. */
	remove(name: string): Promise<void>;
}

/** Opens a picker for the backup folder and remembers what comes back. */
export async function pickBackupFolder(): Promise<BackupFolder | null> {
	// Nothing to pick: the browser decides where a download lands.
	if (runtime() === 'download') return downloadFolder();

	const picked = await pickDirectory('Choose a folder to keep save backups in', 'punk-backups');
	if (!picked) return null;
	await rememberDir('backup', picked.ref);
	return folderOver(picked);
}

/** The folder chosen in an earlier session, if it is still reachable. */
export async function rememberedBackupFolder(): Promise<BackupFolder | null> {
	if (runtime() === 'download') return downloadFolder();
	const ref = await recallDir('backup');
	return ref ? folderOver(dirFrom(ref)) : null;
}

/** A readable, writable backup folder over any in-place backend. */
function folderOver({ label, ops }: PickedDir): BackupFolder {
	return {
		label,
		restorable: true,
		grant: ops.grant,
		list: async () => {
			const out: BackupArchive[] = [];
			for (const name of (await ops.list()).filter(isArchive)) {
				// A file that will not stat is still a file that can be opened;
				// list it without the details rather than dropping it.
				try {
					const { size, modified } = await ops.stat(name);
					out.push({ name, size, modified });
				} catch {
					out.push({ name, size: 0, modified: null });
				}
			}
			return out;
		},
		read: ops.read,
		write: ops.write,
		remove: ops.remove
	};
}

// --- Firefox / Safari -------------------------------------------------------

function downloadFolder(): BackupFolder {
	return {
		label: 'your downloads',
		restorable: false,
		grant: async () => {},
		list: async () => [],
		read: async () => {
			throw new Error('this browser cannot read files back — extract the archive yourself');
		},
		write: async (name, data) => downloadBlob(name, data, 'application/zip'),
		remove: async () => {
			throw new Error('this browser cannot delete files — remove the archive yourself');
		}
	};
}

function isArchive(name: string): boolean {
	return name.toLowerCase().endsWith('.zip');
}
