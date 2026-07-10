/**
 * Save-folder IO that works in both runtimes:
 * - Tauri desktop app: @tauri-apps/plugin-dialog + @tauri-apps/plugin-fs
 * - Browser: File System Access API (Chromium only)
 */

export interface SaveDir {
	/** Folder name, e.g. "save001". */
	name: string;
	read(file: string): Promise<Uint8Array>;
	write(file: string, data: Uint8Array): Promise<void>;
	exists(file: string): Promise<boolean>;
}

export function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function canPickFolder(): boolean {
	return isTauri() || (typeof window !== 'undefined' && 'showDirectoryPicker' in window);
}

/** Opens a folder picker. Resolves to null if the user cancelled. */
export async function pickSaveDir(): Promise<SaveDir | null> {
	return isTauri() ? pickTauri() : pickWeb();
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
	if (!('showDirectoryPicker' in window)) {
		throw new Error(
			'This browser does not support opening folders (File System Access API). ' +
				'Use a Chromium-based browser or the desktop app.'
		);
	}
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
