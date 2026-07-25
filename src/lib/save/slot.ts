/**
 * Loading and saving a PUNK save slot: decodes the LZF+Odin files into
 * editable trees and writes them back. Only the files the editor changes
 * are rewritten; a one-time `.bak` backup of each is created beside it.
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

/** Writes the given loaded files back, backing up each original to *.bak once. */
export async function saveSlot(
	slot: SaveSlot,
	names: readonly string[] = ['vault', 'rundata']
): Promise<void> {
	for (const name of names) {
		const tree = slot.files[name];
		if (!tree) throw new Error(`'${name}' is not loaded`);
		if (!(await slot.dir.exists(`${name}.bak`))) {
			await slot.dir.write(`${name}.bak`, await slot.dir.read(name));
		}
		await slot.dir.write(name, lzfCompress(OdinBinaryWriter.write(tree)));
	}
}
