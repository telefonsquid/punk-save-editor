/**
 * The folders the app can find again next session, and where each runtime is
 * able to keep one.
 *
 * Two of them, for the same reason: coming back should not mean pointing at the
 * same folder a second time. The save folder that was last opened is one — it is
 * what the title screen restores an archive into without asking — and the folder
 * backups are kept in is the other. They are stored apart, so pointing backups
 * somewhere else never moves the save.
 *
 * How, per runtime:
 * - **Tauri** — an absolute path in `localStorage`; the fs scope that makes it
 *   readable again after a restart is persisted by `tauri-plugin-persisted-scope`.
 * - **Chromium** — a `FileSystemDirectoryHandle` in IndexedDB, which is the only
 *   store that can hold one (it survives `structuredClone`, JSON does not).
 * - **Firefox/Safari** — nothing. Neither can reopen a folder at all, so there
 *   is no way back to remember.
 *
 * Nothing here grants anything. A path or a handle is a way *back* to a folder,
 * never permission to read it: that is `DirOps.grant`, and on Chromium it has to
 * be asked for again on a live click every time the tab is new.
 */

import { runtime, type DirRef } from './platform';

/** Which of the two folders is being remembered. */
export type FolderKind = 'save' | 'backup';

/** Prerendering has no storage; the app itself always does (`ssr = false`). */
const hasStorage = typeof localStorage !== 'undefined';

/** Writes down the way back to a folder that was just picked. */
export async function rememberDir(kind: FolderKind, ref: DirRef): Promise<void> {
	if (ref.kind === 'tauri') {
		if (!hasStorage) return;
		try {
			localStorage.setItem(pathKey(kind), ref.path);
		} catch {
			// Costs the user a second pick next session, nothing more.
		}
		return;
	}
	try {
		await transact('readwrite', (store) => store.put(ref.handle, kind));
	} catch {
		// Private windows can refuse IndexedDB outright. The folder still works
		// for this session; it just won't be there next time.
	}
}

/** The way back written down last time, if there is one. */
export async function recallDir(kind: FolderKind): Promise<DirRef | null> {
	if (runtime() === 'tauri') {
		const path = hasStorage ? localStorage.getItem(pathKey(kind)) : null;
		return path ? { kind: 'tauri', path } : null;
	}
	try {
		const handle = await transact<FileSystemDirectoryHandle | undefined>('readonly', (store) =>
			store.get(kind)
		);
		return handle ? { kind: 'fs-access', handle } : null;
	} catch {
		return null;
	}
}

function pathKey(kind: FolderKind): string {
	return `punk-save-editor:${kind}-folder`;
}

// --- IndexedDB ----------------------------------------------------------------

const DB_NAME = 'punk-save-editor';
const DB_STORE = 'folders';

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
	return openDb().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				const req = run(db.transaction(DB_STORE, mode).objectStore(DB_STORE));
				req.onsuccess = () => {
					db.close();
					resolve(req.result);
				};
				req.onerror = () => {
					db.close();
					reject(req.error);
				};
			})
	);
}
