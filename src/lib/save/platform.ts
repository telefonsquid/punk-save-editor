/**
 * Which of the three runtimes we are on, and the folder plumbing all of them
 * share. Nothing here knows what a save is — it reads and writes files in a
 * directory the user pointed at.
 *
 * The editor picks two different directories (the save folder in `io.ts`, the
 * backup folder in `backup-folder.ts`) and both had to answer the same three
 * questions: is this Tauri, can this browser write a folder in place, and if
 * neither, what then. Asking once here is what keeps the answers the same.
 *
 * - **Tauri** — absolute paths through `@tauri-apps/plugin-fs`.
 * - **Chromium** — the File System Access API, in place.
 * - **Everything else** (Firefox, Safari) — no writable folder at all. There is
 *   no `DirOps` for it; the two callers each have their own answer, an in-memory
 *   store for the save folder and a download for the backup folder.
 */

export type Runtime = 'tauri' | 'fs-access' | 'download';

export function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function runtime(): Runtime {
	if (isTauri()) return 'tauri';
	if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) return 'fs-access';
	return 'download';
}

/** True when the runtime can read AND write a folder in place. */
export function supportsInPlaceSave(): boolean {
	return runtime() !== 'download';
}

export interface FileInfo {
	size: number;
	/** Last-modified in ms, when the platform reports one. */
	modified: number | null;
}

/** Reading and writing files by name in one directory. */
export interface DirOps {
	read(name: string): Promise<Uint8Array>;
	write(name: string, data: Uint8Array): Promise<void>;
	/**
	 * Deletes a file, for good. Neither backend has a recycle bin behind it —
	 * the fs plugin unlinks and the File System Access API removes the entry —
	 * so whoever calls this is the one who has to ask first.
	 */
	remove(name: string): Promise<void>;
	exists(name: string): Promise<boolean>;
	/** File names only. Subfolders are ignored. */
	list(): Promise<string[]>;
	stat(name: string): Promise<FileInfo>;
	/**
	 * Takes whatever grant the backend needs to do any of the above.
	 *
	 * It is separate from the methods because of *when* it has to happen: on
	 * Chromium the grant on a remembered handle lapses with the tab and asking
	 * again needs a live user gesture, which zipping 12 MB spends. Callers run
	 * this while the click that started them is still fresh, and then work.
	 */
	grant(): Promise<void>;
}

/**
 * Everything that has to be kept to reopen a directory in a later session.
 * Tauri can name a folder; Chromium can only hand back an opaque handle, so
 * whoever remembers one has to store the two differently — see `backup-folder.ts`.
 */
export type DirRef =
	| { kind: 'tauri'; path: string }
	| { kind: 'fs-access'; handle: FileSystemDirectoryHandle };

/** A directory that has been chosen, or reopened from a `DirRef`. */
export interface PickedDir {
	/** The folder itself, e.g. "save001" — what the editor calls it. */
	name: string;
	/** The fullest description of where it is that the runtime can give. */
	label: string;
	/** How to get back here next session. */
	ref: DirRef;
	ops: DirOps;
}

/**
 * Opens the runtime's folder picker. Null when the user dismissed it; throws
 * only when the picker itself failed.
 *
 * `id` lets a browser remember a starting directory per purpose, so picking a
 * backup folder doesn't reopen wherever the save folder was found.
 */
export async function pickDirectory(title: string, id?: string): Promise<PickedDir | null> {
	if (isTauri()) {
		const { open } = await import('@tauri-apps/plugin-dialog');
		const path = await open({ directory: true, title });
		return path === null ? null : dirFrom({ kind: 'tauri', path });
	}

	let handle: FileSystemDirectoryHandle;
	try {
		handle = await picker().showDirectoryPicker({ mode: 'readwrite', id });
	} catch (err) {
		if ((err as Error).name === 'AbortError') return null;
		throw err;
	}
	return dirFrom({ kind: 'fs-access', handle });
}

/** Reopens a directory remembered from an earlier session. */
export function dirFrom(ref: DirRef): PickedDir {
	if (ref.kind === 'tauri') {
		const name = ref.path.replaceAll('\\', '/').split('/').filter(Boolean).pop() ?? ref.path;
		return { name, label: ref.path, ref, ops: tauriOps(ref.path) };
	}
	return { name: ref.handle.name, label: ref.handle.name, ref, ops: fsAccessOps(ref.handle) };
}

// --- Tauri --------------------------------------------------------------------

function tauriOps(path: string): DirOps {
	const at = (name: string) => `${path}/${name}`;
	const fs = () => import('@tauri-apps/plugin-fs');
	return {
		read: async (name) => (await fs()).readFile(at(name)),
		write: async (name, data) => (await fs()).writeFile(at(name), data),
		remove: async (name) => (await fs()).remove(at(name)),
		exists: async (name) => (await fs()).exists(at(name)),
		list: async () => (await (await fs()).readDir(path)).filter((e) => e.isFile).map((e) => e.name),
		stat: async (name) => {
			const info = await (await fs()).stat(at(name));
			return { size: info.size, modified: info.mtime?.getTime() ?? null };
		},
		// The dialog's grant is persisted by `tauri-plugin-persisted-scope` and
		// restored at launch, so there is never anything to ask for.
		grant: async () => {}
	};
}

// --- Chromium -----------------------------------------------------------------

/**
 * `showDirectoryPicker` and the handle's permission methods are shipped by every
 * engine that has the API, and typed by none of them — the DOM lib has neither.
 * Both shims live here so no caller has to write one.
 */
function picker(): {
	showDirectoryPicker(o: { mode: string; id?: string }): Promise<FileSystemDirectoryHandle>;
} {
	return window as unknown as {
		showDirectoryPicker(o: { mode: string; id?: string }): Promise<FileSystemDirectoryHandle>;
	};
}

interface PermissionHandle {
	queryPermission?(o: { mode: string }): Promise<PermissionState>;
	requestPermission?(o: { mode: string }): Promise<PermissionState>;
}

function fsAccessOps(handle: FileSystemDirectoryHandle): DirOps {
	const file = async (name: string) => (await handle.getFileHandle(name)).getFile();
	return {
		read: async (name) => new Uint8Array(await (await file(name)).arrayBuffer()),
		write: async (name, data) => {
			const writable = await (await handle.getFileHandle(name, { create: true })).createWritable();
			// `Uint8Array` is `Uint8Array<ArrayBufferLike>`, which includes a view on
			// a SharedArrayBuffer, and `write` takes only the plain-ArrayBuffer kind.
			// Every array that reaches here came from `arrayBuffer()`, `new
			// Uint8Array(n)` or the LZF writer, so none of them is the shared kind.
			await writable.write(data as Uint8Array<ArrayBuffer>);
			await writable.close();
		},
		remove: (name) => handle.removeEntry(name),
		exists: async (name) => {
			try {
				await handle.getFileHandle(name);
				return true;
			} catch {
				return false;
			}
		},
		list: async () => {
			// `values()` ships with every engine that has showDirectoryPicker, but
			// it isn't in the DOM lib types yet.
			const dir = handle as unknown as {
				values(): AsyncIterable<{ kind: string; name: string }>;
			};
			const names: string[] = [];
			for await (const entry of dir.values()) {
				if (entry.kind === 'file') names.push(entry.name);
			}
			return names;
		},
		stat: async (name) => {
			const f = await file(name);
			return { size: f.size, modified: f.lastModified };
		},
		grant: async () => {
			const perm = handle as unknown as PermissionHandle;
			const mode = { mode: 'readwrite' };
			if ((await perm.queryPermission?.(mode)) === 'granted') return;
			if ((await perm.requestPermission?.(mode)) === 'granted') return;
			throw new Error(`no permission to use the folder '${handle.name}'`);
		}
	};
}
