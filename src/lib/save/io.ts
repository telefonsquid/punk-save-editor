/**
 * Save-folder IO. Which runtime can do what, and the plumbing under each, is
 * `platform.ts`; this module is what a *save folder* is on top of it.
 *
 * Tauri and Chromium edit the folder in place. Firefox and Safari cannot write
 * a folder at all, so they upload one, edit it in memory, and download the
 * changes back — `DownloadSaveDir`.
 */

import { dirFrom, pickDirectory, runtime, type DirOps } from './platform';
import { recallDir, rememberDir } from './remember';
import { REQUIRED_FILES } from './slot';
import { makeZip, type ZipEntry } from './zip';

export interface SaveDir {
	/** Folder name, e.g. "save001". */
	name: string;
	read(file: string): Promise<Uint8Array>;
	write(file: string, data: Uint8Array): Promise<void>;
	exists(file: string): Promise<boolean>;
	/** Every file in the folder, backups included. Subfolders are ignored. */
	list(): Promise<string[]>;
}

/** The part of a save folder an archive can be packed from. */
export type ReadableDir = Pick<SaveDir, 'name' | 'read' | 'list'>;

/**
 * A SaveDir whose writes accumulate in memory instead of hitting the disk,
 * because the browser can't write folders in place. Changes are handed back to
 * the user as a downloadable zip they extract over their save folder.
 */
export interface DownloadSaveDir extends SaveDir {
	readonly downloadable: true;
	/** Real files written since the folder was opened. */
	changedFiles(): string[];
	/** Downloads a zip of the changed files to extract over the save folder. */
	exportChanges(): Promise<void>;
	/**
	 * The folder as it was uploaded, before the editor wrote anything.
	 *
	 * A backup is a restore point, and the point worth returning to is the one
	 * the game left — not the one this session has been editing. In place that
	 * distinction needs no code, because the edits aren't on disk until Save; in
	 * memory they are indistinguishable unless the original is kept aside.
	 */
	asUploaded(): ReadableDir;
}

export function isDownloadDir(dir: SaveDir): dir is DownloadSaveDir {
	return (dir as DownloadSaveDir).downloadable === true;
}

/**
 * Opens a folder picker. Chromium/Tauri get in-place editing; other browsers
 * fall back to an upload + download flow. Resolves to null if the user
 * cancelled.
 */
export async function pickSaveDir(): Promise<SaveDir | null> {
	if (runtime() === 'download') return pickWebUpload();
	const picked = await pickDirectory('Select a PUNK save folder (e.g. save001)');
	if (!picked) return null;
	// Written down here rather than by the caller, because this is the one place
	// a save folder is chosen and a folder that was chosen is exactly what is
	// worth coming back to. Nothing reopens it on its own — see below.
	await rememberDir('save', picked.ref);
	return saveDir(picked.name, picked.ops);
}

/**
 * The save folder from an earlier session, reopened — and only when it is still
 * there and readable *without asking anyone anything*.
 *
 * That last part is the whole contract. This runs on the way into the title
 * screen, where nothing has been clicked: it must not open a picker, and it must
 * not ask for a permission, so a Chromium handle whose grant lapsed with the
 * last tab reads as no folder rather than as a prompt. `exists` answers false
 * for a file it is not allowed to look at, which folds "no permission" into the
 * same answer as "not there any more" — and both mean the same thing to whoever
 * called: ask the user.
 *
 * The three files are `loadSlot`'s own gate, asked early. A folder the game has
 * since deleted, or one that was never a save, must not be quietly reopened and
 * then fail with an error nobody's click asked for.
 */
export async function rememberedSaveDir(): Promise<SaveDir | null> {
	// Nothing is remembered where the folder was uploaded rather than opened:
	// the files came through an `<input>` and live only in this page's memory.
	if (runtime() === 'download') return null;
	const ref = await recallDir('save');
	if (!ref) return null;
	const { name, ops } = dirFrom(ref);
	const dir = saveDir(name, ops);
	try {
		for (const required of REQUIRED_FILES) {
			if (!(await dir.exists(required))) return null;
		}
	} catch {
		// A folder that has moved, a drive that is not mounted, a scope the fs
		// plugin no longer holds: no folder, no error, nobody asked.
		return null;
	}
	return dir;
}

/**
 * A save folder over any in-place backend. No `grant()`: either it was just
 * picked, so its access is as live as the click that asked for it, or it came
 * from `rememberedSaveDir`, which hands back nothing it could not already read.
 * Only the *backup* folder — reached from a click, long after it was chosen —
 * has a grant to renew.
 */
function saveDir(name: string, ops: DirOps): SaveDir {
	return { name, read: ops.read, write: ops.write, exists: ops.exists, list: ops.list };
}

/**
 * Firefox/Safari fallback: the user picks the folder via a directory `<input>`,
 * every file is read into memory, and edits are written to the in-memory store.
 * `exportChanges()` zips the changed files back for the user to copy in.
 */
async function pickWebUpload(): Promise<DownloadSaveDir | null> {
	const picked = await promptDirectoryUpload();
	if (!picked) return null;

	const uploaded = new Map<string, Uint8Array>();
	let folderName = 'save';
	for (const file of picked) {
		const parts = file.webkitRelativePath.split('/');
		if (parts.length > 1) folderName = parts[0];
		const base = parts[parts.length - 1];
		uploaded.set(base, new Uint8Array(await file.arrayBuffer()));
	}

	// The live folder starts as a copy of the upload and diverges from it with
	// the first write; `uploaded` is never touched again.
	const store = new Map(uploaded);
	const changed = new Set<string>();
	return {
		name: folderName,
		downloadable: true,
		read: async (file) => {
			const bytes = store.get(file);
			if (!bytes) throw new Error(`'${file}' is not in the selected folder`);
			return bytes;
		},
		write: async (file, data) => {
			store.set(file, data);
			changed.add(file);
		},
		exists: async (file) => store.has(file),
		list: async () => [...store.keys()],
		changedFiles: () => [...changed],
		asUploaded: () => ({
			name: folderName,
			list: async () => [...uploaded.keys()],
			read: async (file) => {
				const bytes = uploaded.get(file);
				if (!bytes) throw new Error(`'${file}' is not in the selected folder`);
				return bytes;
			}
		}),
		exportChanges: async () => {
			// Only the files that changed. The rest of the folder is the user's own
			// copy, untouched — and a whole-folder restore point is what a backup
			// archive is for (backup.ts), not what saving is expected to hand out.
			const entries: ZipEntry[] = [];
			for (const [name, data] of store) {
				if (changed.has(name)) entries.push({ name, data });
			}
			downloadBlob(`${folderName}-edited.zip`, await makeZip(entries), 'application/zip');
		}
	};
}

/** Opens a directory <input> and resolves with the chosen files, or null. */
function promptDirectoryUpload(): Promise<File[] | null> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.webkitdirectory = true;
		input.multiple = true;
		input.style.display = 'none';
		const done = (files: File[] | null) => {
			input.remove();
			resolve(files);
		};
		input.addEventListener('change', () => done(input.files?.length ? [...input.files] : null));
		// Fired when the picker is dismissed without a selection (modern browsers).
		input.addEventListener('cancel', () => done(null));
		document.body.appendChild(input);
		input.click();
	});
}

/** Hands the user a file the only way a browser can. Also used by backup-folder.ts. */
export function downloadBlob(filename: string, data: Uint8Array, type: string): void {
	const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
