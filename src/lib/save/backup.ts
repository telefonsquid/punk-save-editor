/**
 * Full-folder backups: a save folder packed into one `.zip`, and the way back.
 *
 * A save is **one moment**. The game keeps rewriting `world`, `map` and `fow`
 * as a run continues, so a restore point that holds only the files the editor
 * touched puts an old ship into a map that has moved on — which is why this
 * archives the folder rather than the edit. Where the archives are kept is
 * `backup-folder.ts`; this module only knows how to make one and how to read it.
 */

import type { ReadableDir, SaveDir } from './io';
import { REQUIRED_FILES, decodesAsOdin } from './slot';
import { makeZip, readZip, type ZipEntry } from './zip';

/**
 * `.bak` is the previous editor's restore point — a different, older moment,
 * and half the folder again in size. `.zip` keeps an archive out of the next
 * archive, which matters because the backup folder is free to *be* the save
 * folder: without this, each backup would swallow the one before it.
 */
function belongsInArchive(name: string): boolean {
	return !name.endsWith('.bak') && !name.endsWith('.zip');
}

/**
 * Packs every file of the save folder into a zip, under a folder named after
 * the save — so extracting it by hand over `saves/` puts `save001` back where
 * it came from, rather than spilling ten nameless files wherever it was opened.
 */
export async function packSaveFolder(dir: ReadableDir, at = Date.now()): Promise<Uint8Array> {
	const names = (await dir.list()).filter(belongsInArchive).sort();
	if (names.length === 0) throw new Error(`'${dir.name}' has no files to back up`);
	const entries: ZipEntry[] = [];
	for (const name of names) entries.push({ name: `${dir.name}/${name}`, data: await dir.read(name) });
	return makeZip(entries, new Date(at));
}

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

/**
 * `save001_2026-07-29_14-30.zip` — the save, then the moment, in local time and
 * in an order that sorts. Minute precision reads better than seconds do and is
 * fine enough that a collision means two backups in the same minute, which
 * `taken` then settles.
 */
export function archiveName(saveName: string, taken: Iterable<string> = [], at = Date.now()): string {
	const d = new Date(at);
	const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
	const used = new Set(taken);
	const base = `${saveName}_${stamp}`;
	if (!used.has(`${base}.zip`)) return `${base}.zip`;
	// Bounded by `used`, which is a directory listing: one of the first
	// `used.size + 2` names is always free.
	for (let n = 2; n <= used.size + 2; n++) {
		if (!used.has(`${base}-${n}.zip`)) return `${base}-${n}.zip`;
	}
	throw new Error('could not find a free name for the archive');
}

/** An archive that has been read and checked, ready to be written back. */
export interface OpenArchive {
	/** The folder the files sat in, when the archive has one. */
	folder: string | null;
	/** The save files, by bare name — whatever folder they were stored under. */
	files: ZipEntry[];
}

/**
 * Reads an archive and checks it is a save folder before anyone acts on it.
 *
 * Paths are flattened to their file name on purpose: an archive made by hand
 * carries a `save001/` prefix, one made by this editor carries the name of
 * whichever save it came from, and a restore writes into the folder that is open
 * either way. What that flattening must not do is quietly merge two folders into
 * one, so an archive holding more than one is refused — a zip of the whole
 * `saves/` directory has no collision to catch it (`save001/vault` and
 * `save002/entities` flatten to different names) and would otherwise restore one
 * run's ship into another run's map.
 *
 * Names are not the check, though: the three files a save needs are decoded
 * here, because a file called `vault` proves nothing until it parses as one and
 * `unpackInto` commits to whatever it is handed.
 */
export async function openArchive(bytes: Uint8Array): Promise<OpenArchive> {
	const entries = await readZip(bytes);
	const files: ZipEntry[] = [];
	const seen = new Map<string, Uint8Array>();
	const folders = new Set<string>();

	for (const entry of entries) {
		const parts = entry.name.split('/').filter(Boolean);
		const name = parts[parts.length - 1];
		if (parts.length > 1) folders.add(parts.slice(0, -1).join('/'));
		if (seen.has(name)) throw new Error(`the archive holds more than one '${name}'`);
		seen.set(name, entry.data);
		files.push({ name, data: entry.data });
	}

	if (folders.size > 1) {
		throw new Error(
			`the archive holds ${folders.size} folders (${[...folders].sort().join(', ')}) — ` +
				'back up and restore one save at a time'
		);
	}

	const missing = REQUIRED_FILES.filter((name) => !seen.has(name));
	if (missing.length > 0) {
		throw new Error(`not a full save folder — no ${missing.join(', ')} in the archive`);
	}

	const unreadable = REQUIRED_FILES.filter((name) => !decodesAsOdin(seen.get(name)!));
	if (unreadable.length > 0) {
		throw new Error(`${unreadable.join(', ')} in the archive ${unreadable.length === 1 ? 'is' : 'are'} not a readable save file`);
	}

	return { folder: folders.size === 1 ? [...folders][0] : null, files };
}

/**
 * Writes an archive's files into the save folder, all or nothing.
 *
 * The folder is read before it is written, and a failure part way through puts
 * back what was there. Without that, a write that fails on file 7 of 10 leaves
 * six files from the archive beside four from the run — a folder that is two
 * moments at once, which is the exact thing whole-folder backups exist to
 * prevent, arrived at through the feature meant to prevent it.
 *
 * Files the folder has and the archive does not are left alone rather than
 * deleted — the save file set is fixed, so in practice that is only the old
 * `*.bak` files, and those are someone's other restore point.
 */
export async function unpackInto(dir: SaveDir, files: readonly ZipEntry[]): Promise<void> {
	const previous = new Map<string, Uint8Array | null>();
	for (const file of files) {
		previous.set(file.name, (await dir.exists(file.name)) ? await dir.read(file.name) : null);
	}

	const written: string[] = [];
	try {
		for (const file of files) {
			await dir.write(file.name, file.data);
			written.push(file.name);
		}
	} catch (err) {
		throw new Error(`${(err as Error).message}${await rollback(dir, previous, written)}`, {
			cause: err
		});
	}
}

/**
 * Puts the overwritten files back, and says so when it cannot.
 *
 * A rollback runs because a write just failed, so its own writes may fail for
 * the same reason. That case cannot be repaired from here and must not be
 * swallowed: the message names every file left holding the archive's bytes, so
 * the folder that needs attention is the one the user is told about.
 *
 * A file the archive created is left in place — `SaveDir` cannot delete, and an
 * extra file in a save folder is inert where a missing one is not.
 */
async function rollback(
	dir: SaveDir,
	previous: Map<string, Uint8Array | null>,
	written: readonly string[]
): Promise<string> {
	const stuck: string[] = [];
	for (const name of written) {
		const before = previous.get(name);
		if (!before) continue;
		try {
			await dir.write(name, before);
		} catch {
			stuck.push(name);
		}
	}
	if (stuck.length === 0) return '. The save folder was left as it was.';
	return `. ${stuck.join(', ')} could not be put back and now hold the backup's copy — the folder is part restored.`;
}
