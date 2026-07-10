/**
 * High-level access to a PUNK save slot: loads the LZF+Odin files into
 * editable trees and writes them back. Only the files the editor changes
 * are rewritten; a one-time `.bak` backup of each is created beside it.
 */

import type { SaveDir } from './io';
import { lzfCompress, lzfDecompress } from './lzf';
import { EntryType, OdinBinaryReader, OdinBinaryWriter, isNode } from './odin';
import type { OdinNode, OdinValue, TypeInfo } from './odin';
import assetNames from './asset-names.json';

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

export interface AssetInfo {
	category: string;
	assetName: string;
	displayName: string | null;
	description?: string;
	maxCount?: number;
	level?: number;
}

export const assets = assetNames as Record<string, AssetInfo>;

/** Best human-readable name for a module/consumable/ingredient/resource id. */
export function displayName(id: string | null): string {
	if (!id) return '(none)';
	const a = assets[id];
	return a?.displayName || a?.assetName || id;
}

export function assetsByCategory(category: string): { id: string; info: AssetInfo }[] {
	return Object.entries(assets)
		.filter(([, info]) => info.category === category)
		.map(([id, info]) => ({ id, info }))
		.sort((a, b) => displayName(a.id).localeCompare(displayName(b.id)));
}

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

// ---------------------------------------------------------------------------
// Tree accessors — the Odin tree wraps every C# List<T> in a node whose
// single unnamed member ($0) is the actual array.
// ---------------------------------------------------------------------------

/** Returns the backing array of a serialized C# List<T> member. */
export function listItems(listNode: OdinValue): OdinValue[] {
	if (!isNode(listNode)) throw new Error('expected a List node');
	const arr = listNode.$0;
	if (!Array.isArray(arr)) throw new Error('List node has no array member');
	return arr;
}

/** Appends a scalar to a serialized List<T>, maintaining $types metadata. */
export function pushScalar(listNode: OdinValue, value: OdinValue, e: EntryType): void {
	if (!isNode(listNode)) throw new Error('expected a List node');
	const arr = listItems(listNode);
	const types = (listNode.$types ??= {});
	const info = (types['$0'] ??= { e: EntryType.StartOfArray, elem: [] });
	(info.elem ??= [])[arr.length] = { e } as TypeInfo;
	arr.push(value);
}

/** Typed views over the tree — mutations go straight into the parsed nodes. */

export interface RunStats {
	totalRunTime: number;
	killedBossCount: number;
	killedEnemyCount: number;
	unlockedShopCount: number;
}

export function runStats(rundata: OdinNode): RunStats {
	return rundata as unknown as RunStats;
}

export interface ResourcePair {
	$k: string;
	$v: number;
}

/** rundata.sharedResources is a Dictionary<string, float>; pairs are {$k, $v} nodes. */
export function getResources(rundata: OdinNode): ResourcePair[] {
	return listItems(rundata.sharedResources as OdinValue) as unknown as ResourcePair[];
}

export function ingredientIds(vault: OdinNode): string[] {
	return listItems(vault.ingredientIds as OdinValue) as string[];
}

export function ingredientCounts(vault: OdinNode): number[] {
	return listItems(vault.ingredientCounts as OdinValue) as number[];
}

export function addIngredient(vault: OdinNode, id: string, count: number): void {
	const i = ingredientIds(vault).indexOf(id);
	if (i >= 0) {
		ingredientCounts(vault)[i] = count;
	} else {
		pushScalar(vault.ingredientIds as OdinValue, id, EntryType.UnnamedString);
		pushScalar(vault.ingredientCounts as OdinValue, count, EntryType.UnnamedInt);
	}
}

export interface ConsumableView {
	consumableId: string | null;
	amount: number;
}

export function getConsumables(vault: OdinNode): ConsumableView[] {
	return listItems(vault.consumables as OdinValue) as unknown as ConsumableView[];
}

const CONSUMABLE_MENTO_TYPE = 'Vault+Memento+ConsumableMento, Punk.Main';

export function addConsumable(vault: OdinNode, id: string, amount: number): void {
	const existing = getConsumables(vault).find((c) => c.consumableId === id);
	if (existing) {
		existing.amount = amount;
		return;
	}
	const node: OdinNode = {
		$type: CONSUMABLE_MENTO_TYPE,
		consumableId: id,
		amount,
		$types: { amount: { e: EntryType.UnnamedInt } }
	};
	listItems(vault.consumables as OdinValue).push(node);
}

export interface ModuleView {
	moduleDataId: string | null;
	northConnection: boolean;
	eastConnection: boolean;
	southConnection: boolean;
	westConnection: boolean;
	powerLevel: number;
}

export function getModules(vault: OdinNode): ModuleView[] {
	return listItems(vault.modules as OdinValue) as unknown as ModuleView[];
}
