/**
 * Loading and saving a PUNK save slot: decodes the LZF+Odin files into
 * editable trees and writes them back. Only the files the editor changes are
 * rewritten, but the first write backs up the whole folder to `*.bak`.
 *
 * The typed views over the decoded trees live beside this module:
 * `./tree` (generic Odin shapes), `./vault`, `./rundata`, `./ship`.
 */

import type { SaveDir } from './io';
import { lzfCompress, lzfDecompress } from './lzf';
import { OdinBinaryReader, OdinBinaryWriter, isNode } from './odin';
import type { OdinNode } from './odin';

export interface SaveSlot {
	dir: SaveDir;
	levelinfo: OdinNode;
	vault: OdinNode;
	rundata: OdinNode;
	/** Every loaded Odin file by name, including the three above. */
	files: Record<string, OdinNode>;
}

/** All Odin-serialized files a save folder can contain. `world` is a raw
 * struct dump and `fow`/`map`/`scanner` are PNGs, so they are not listed. */
export const ODIN_FILES = [
	'levelinfo',
	'vault',
	'rundata',
	'entities',
	'graph',
	'mapicons'
] as const;

/** Save files that exist but cannot be edited as an Odin tree. */
export const OPAQUE_FILES = ['world', 'fow', 'map', 'scanner'] as const;

async function loadOdin(dir: SaveDir, file: string): Promise<OdinNode> {
	const value = OdinBinaryReader.parse(lzfDecompress(await dir.read(file)));
	if (!isNode(value)) throw new Error(`${file}: unexpected root value`);
	return value;
}

export async function loadSlot(dir: SaveDir): Promise<SaveSlot> {
	for (const required of ['levelinfo', 'vault', 'rundata']) {
		if (!(await dir.exists(required))) {
			throw new Error(`Not a PUNK save folder: missing '${required}' file`);
		}
	}
	const files: Record<string, OdinNode> = {
		levelinfo: await loadOdin(dir, 'levelinfo'),
		vault: await loadOdin(dir, 'vault'),
		rundata: await loadOdin(dir, 'rundata')
	};
	return { dir, levelinfo: files.levelinfo, vault: files.vault, rundata: files.rundata, files };
}

/** Loads (and caches) one of the optional ODIN_FILES, e.g. 'entities'. */
export async function loadFile(slot: SaveSlot, name: string): Promise<OdinNode> {
	if (slot.files[name]) return slot.files[name];
	if (!(await slot.dir.exists(name))) throw new Error(`Save has no '${name}' file`);
	return (slot.files[name] = await loadOdin(slot.dir, name));
}

/** What a save did about backups, so the UI can say so honestly. */
export interface BackupReport {
	/** Files copied to `<name>.bak` by this save. */
	created: string[];
	/** Files left alone because they already had a `.bak`. */
	kept: string[];
	/** Files that could not be backed up. Never includes an edited file. */
	failed: string[];
}

/** True when the backups are of two different moments — see `backupFolder`. */
export function isMixedBackup(report: BackupReport): boolean {
	return report.created.length > 0 && report.kept.length > 0;
}

/**
 * Copies every file in the save folder to `<name>.bak`, skipping the ones that
 * already have a backup — so the *.bak set is the folder as it stood the first
 * time the editor wrote to it.
 *
 * The whole folder, not just the edited files: a save is one state. `world`,
 * `map` and `fow` are rewritten by the game as the run continues, so backing up
 * only `vault` and `rundata` would restore a ship into a map that has moved on.
 *
 * Two things the report exists for, because neither may be papered over:
 * - A folder that already carries some backups (from an editor version that
 *   only backed up what it wrote) gets the rest snapshotted *now*, hours of
 *   play later. `created` and `kept` both non-empty means exactly that, and the
 *   old backups are never overwritten — they are someone's restore point.
 * - A file that cannot be read is no reason to drop the user's edits, so it is
 *   reported rather than thrown. The files being overwritten are the exception:
 *   those are backed up first and a failure there aborts the save, since
 *   overwriting a file whose original we failed to keep is the one unrecoverable
 *   move.
 */
async function backupFolder(dir: SaveDir, edited: readonly string[]): Promise<BackupReport> {
	let listed: string[] = [];
	try {
		listed = await dir.list();
	} catch {
		// A folder that won't enumerate still gets its edited files backed up.
	}
	const report: BackupReport = { created: [], kept: [], failed: [] };
	// `edited` first, so the backups that must not fail happen before the rest.
	for (const name of new Set([...edited, ...listed])) {
		if (name.endsWith('.bak')) continue;
		if (await dir.exists(`${name}.bak`)) {
			report.kept.push(name);
			continue;
		}
		try {
			await dir.write(`${name}.bak`, await dir.read(name));
			report.created.push(name);
		} catch (err) {
			if (edited.includes(name)) throw err;
			report.failed.push(name);
		}
	}
	return report;
}

/** Writes the given loaded files back, after a one-time *.bak of the folder. */
export async function saveSlot(
	slot: SaveSlot,
	names: readonly string[] = ['vault', 'rundata']
): Promise<BackupReport> {
	for (const name of names) {
		if (!slot.files[name]) throw new Error(`'${name}' is not loaded`);
	}
	const report = await backupFolder(slot.dir, names);
	for (const name of names) {
		await slot.dir.write(name, lzfCompress(OdinBinaryWriter.write(slot.files[name])));
	}
	return report;
}
