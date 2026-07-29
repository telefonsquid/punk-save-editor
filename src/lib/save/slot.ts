/**
 * Loading and saving a PUNK save slot: decodes the LZF+Odin files into
 * editable trees and writes them back. Only the files the editor changed are
 * rewritten.
 *
 * Nothing here backs anything up. Restore points are whole-folder zip archives
 * taken deliberately (`./backup`), because a save is one moment and the game
 * keeps rewriting `world`/`map`/`fow` underneath it — the per-file `*.bak`
 * copies this used to leave behind were a restore point that put an old ship
 * into a map that had moved on.
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

/**
 * The files without which a folder is not a save. This is the gate `loadSlot`
 * applies on open, and `backup.ts` applies to an archive before restoring it —
 * one list, because an archive that would not open as a save must not be
 * written over one that does.
 */
export const REQUIRED_FILES = ['levelinfo', 'vault', 'rundata'] as const;

/**
 * Whether bytes are an LZF+Odin tree — the same decode `loadSlot` does, asked
 * as a question. A file name proves nothing about an archive's contents, so a
 * restore checks the bytes it is about to commit to.
 */
export function decodesAsOdin(bytes: Uint8Array): boolean {
	try {
		return isNode(OdinBinaryReader.parse(lzfDecompress(bytes)));
	} catch {
		return false;
	}
}

async function loadOdin(dir: SaveDir, file: string): Promise<OdinNode> {
	const value = OdinBinaryReader.parse(lzfDecompress(await dir.read(file)));
	if (!isNode(value)) throw new Error(`${file}: unexpected root value`);
	return value;
}

export async function loadSlot(dir: SaveDir): Promise<SaveSlot> {
	for (const required of REQUIRED_FILES) {
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

/** Writes the given loaded files back over the ones in the save folder. */
export async function saveSlot(
	slot: SaveSlot,
	names: readonly string[] = ['vault', 'rundata']
): Promise<void> {
	for (const name of names) {
		if (!slot.files[name]) throw new Error(`'${name}' is not loaded`);
	}
	for (const name of names) {
		await slot.dir.write(name, lzfCompress(OdinBinaryWriter.write(slot.files[name])));
	}
}
