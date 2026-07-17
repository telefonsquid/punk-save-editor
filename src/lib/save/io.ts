/**
 * Save-folder IO that works in every runtime:
 * - Tauri desktop app: @tauri-apps/plugin-dialog + @tauri-apps/plugin-fs (in-place)
 * - Chromium browsers: File System Access API (in-place)
 * - Firefox/Safari: upload the folder, edit in memory, download the changes (fallback)
 */

import { makeZip, type ZipEntry } from './zip';

export interface SaveDir {
	/** Folder name, e.g. "save001". */
	name: string;
	read(file: string): Promise<Uint8Array>;
	write(file: string, data: Uint8Array): Promise<void>;
	exists(file: string): Promise<boolean>;
}

/**
 * A SaveDir whose writes accumulate in memory instead of hitting the disk,
 * because the browser can't write folders in place. Changes are handed back to
 * the user as a downloadable zip they extract over their save folder.
 */
export interface DownloadSaveDir extends SaveDir {
	readonly downloadable: true;
	/** Real files (excluding *.bak) written since the folder was opened. */
	changedFiles(): string[];
	/** Downloads a zip of the changed files and their *.bak originals. */
	exportChanges(): void;
}

export function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isDownloadDir(dir: SaveDir): dir is DownloadSaveDir {
	return (dir as DownloadSaveDir).downloadable === true;
}

/** True when the runtime can read AND write the save folder in place. */
export function supportsInPlaceSave(): boolean {
	return isTauri() || (typeof window !== 'undefined' && 'showDirectoryPicker' in window);
}

/**
 * Opens a folder picker. Chromium/Tauri get in-place editing; other browsers
 * fall back to an upload + download flow. Resolves to null if the user
 * cancelled.
 */
export async function pickSaveDir(): Promise<SaveDir | null> {
	if (isTauri()) return pickTauri();
	if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) return pickWeb();
	return pickWebUpload();
}

async function pickTauri(): Promise<SaveDir | null> {
	const { open } = await import('@tauri-apps/plugin-dialog');
	const fs = await import('@tauri-apps/plugin-fs');
	const dir = await open({
		directory: true,
		title: 'Select a PUNK save folder (e.g. save001)'
	});
	if (dir === null) return null;
	const name = dir.replaceAll('\\', '/').split('/').filter(Boolean).pop() ?? dir;
	return {
		name,
		read: (file) => fs.readFile(`${dir}/${file}`),
		write: (file, data) => fs.writeFile(`${dir}/${file}`, data),
		exists: (file) => fs.exists(`${dir}/${file}`)
	};
}

async function pickWeb(): Promise<SaveDir | null> {
	let handle: FileSystemDirectoryHandle;
	try {
		handle = await (
			window as unknown as {
				showDirectoryPicker(o: { mode: string }): Promise<FileSystemDirectoryHandle>;
			}
		).showDirectoryPicker({ mode: 'readwrite' });
	} catch (err) {
		if ((err as Error).name === 'AbortError') return null;
		throw err;
	}
	return {
		name: handle.name,
		read: async (file) => {
			const f = await (await handle.getFileHandle(file)).getFile();
			return new Uint8Array(await f.arrayBuffer());
		},
		write: async (file, data) => {
			const writable = await (await handle.getFileHandle(file, { create: true })).createWritable();
			await writable.write(data as unknown as ArrayBuffer);
			await writable.close();
		},
		exists: async (file) => {
			try {
				await handle.getFileHandle(file);
				return true;
			} catch {
				return false;
			}
		}
	};
}

/**
 * Firefox/Safari fallback: the user picks the folder via a directory <input>,
 * every file is read into memory, and edits are written to the in-memory store.
 * `exportChanges()` zips the changed files back for the user to copy in.
 */
async function pickWebUpload(): Promise<DownloadSaveDir | null> {
	const picked = await promptDirectoryUpload();
	if (!picked) return null;

	const store = new Map<string, Uint8Array>();
	let folderName = 'save';
	for (const file of picked) {
		const parts = file.webkitRelativePath.split('/');
		if (parts.length > 1) folderName = parts[0];
		const base = parts[parts.length - 1];
		store.set(base, new Uint8Array(await file.arrayBuffer()));
	}

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
			if (!file.endsWith('.bak')) changed.add(file);
		},
		exists: async (file) => store.has(file),
		changedFiles: () => [...changed],
		exportChanges: () => {
			const entries: ZipEntry[] = [];
			for (const name of changed) {
				const data = store.get(name);
				if (data) entries.push({ name, data });
				const bak = store.get(`${name}.bak`);
				if (bak) entries.push({ name: `${name}.bak`, data: bak });
			}
			downloadBlob(`${folderName}-edited.zip`, makeZip(entries), 'application/zip');
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

function downloadBlob(filename: string, data: Uint8Array, type: string): void {
	const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
