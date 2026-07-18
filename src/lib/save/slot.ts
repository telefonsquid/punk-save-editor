/**
 * High-level access to a PUNK save slot: loads the LZF+Odin files into
 * editable trees and writes them back. Only the files the editor changes
 * are rewritten; a one-time `.bak` backup of each is created beside it.
 *
 * This module is about *save trees* — what the game wrote to disk. Static
 * game knowledge (asset names, module effects, colours) lives in
 * `$lib/game/data`; the ship-grid math over the `entities` file in `./ship`.
 */

import { moduleInfo } from '$lib/game/data';
import type { SaveDir } from './io';
import { lzfCompress, lzfDecompress } from './lzf';
import { EntryType, META_KEYS, OdinBinaryReader, OdinBinaryWriter, isNode } from './odin';
import type { OdinNode, OdinValue, TypeInfo } from './odin';

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

/** Returns the pairs array of a serialized Dictionary<K,V> node. Unlike
 * List<T> its position shifts by one when the comparer node precedes it, so
 * it is found as the first array-valued member instead of by name. */
export function dictPairs(dict: unknown): OdinNode[] {
	const dictNode = dict as OdinValue;
	if (!isNode(dictNode)) throw new Error('expected a Dictionary node');
	for (const [key, value] of Object.entries(dictNode)) {
		if (!META_KEYS.has(key) && Array.isArray(value)) return value as OdinNode[];
	}
	throw new Error('Dictionary node has no pairs array');
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
	const slots = getConsumables(vault);
	const existing = slots.find((c) => c.consumableId === id);
	if (existing) {
		existing.amount = amount;
		return;
	}
	// The vault keeps a fixed run of consumable slots (8), empty ones having a
	// null id. Mirror the game's Vault.Add: fill the first empty slot rather than
	// growing the list, so the restored inventory keeps its slot count.
	const empty = slots.find((c) => c.consumableId == null);
	if (empty) {
		empty.consumableId = id;
		empty.amount = amount;
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

/** Reorders the vault's non-empty consumables. `from`/`to` index into the
 * filled slots only (as shown in the UI); empty slots are kept trailing so the
 * fixed slot count the game restores from the memento is preserved. */
export function reorderConsumables(vault: OdinNode, from: number, to: number): void {
	const arr = listItems(vault.consumables as OdinValue);
	const filled = arr.filter((c) => (c as unknown as ConsumableView).consumableId != null);
	const empty = arr.filter((c) => (c as unknown as ConsumableView).consumableId == null);
	if (from < 0 || from >= filled.length || to < 0 || to >= filled.length) return;
	const [moved] = filled.splice(from, 1);
	filled.splice(to, 0, moved);
	arr.length = 0;
	arr.push(...filled, ...empty);
}

// ---------------------------------------------------------------------------
// Vault modules
// ---------------------------------------------------------------------------

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

/** The four grid edges a module can connect through, in the order the game's
 * memento stores them. */
export const CONNECTION_SIDES = [
	{ key: 'northConnection', label: 'N' },
	{ key: 'eastConnection', label: 'E' },
	{ key: 'southConnection', label: 'S' },
	{ key: 'westConnection', label: 'W' }
] as const;

export type ConnectionKey = (typeof CONNECTION_SIDES)[number]['key'];

const MODULE_MEMENTO_TYPE = 'Module+Memento, Punk.Main';
const EFFECT_FIELD_TYPE = 'ModuleEffectField, Punk.Main';
const BOOL_ARRAY_TYPE = 'System.Boolean[], mscorlib';

/**
 * Highest `$id` used anywhere in a tree. A node the editor adds must claim an
 * unused one: Odin resolves internal references (`$ref`) through these ids, so
 * reusing one would silently repoint an existing reference at the new node.
 */
function maxOdinId(root: OdinValue): number {
	let max = 0;
	const stack: OdinValue[] = [root];
	while (stack.length > 0) {
		const value = stack.pop();
		if (typeof value !== 'object' || value === null) continue;
		if (Array.isArray(value)) {
			stack.push(...value);
			continue;
		}
		if (!isNode(value)) continue; // $ref/$ext/primitive array carry no ids
		if (typeof value.$id === 'number' && value.$id > max) max = value.$id;
		for (const [key, child] of Object.entries(value)) {
			if (key === '$types') continue; // metadata, never holds nodes
			stack.push(child as OdinValue);
		}
	}
	return max;
}

/**
 * Appends a module to the vault, mirroring what the game stores for one the
 * player picked up (`Module.CreateMemento`). All four connections are enabled so
 * it can be attached anywhere on the grid, and the power level defaults to the
 * asset's maximum. The power core is rebuilt from the extracted sprite grid —
 * without it the module would provide no core at all when placed.
 */
export function addModule(vault: OdinNode, moduleDataId: string): void {
	const info = moduleInfo(moduleDataId);
	const core = info?.powerCore ?? null;
	// The memento and its two sub-nodes each need an id of their own.
	const baseId = maxOdinId(vault) + 1;
	const node: OdinNode = {
		$type: MODULE_MEMENTO_TYPE,
		$id: baseId,
		moduleDataId,
		northConnection: true,
		eastConnection: true,
		southConnection: true,
		westConnection: true,
		powerCore: core
			? ({
					$type: EFFECT_FIELD_TYPE,
					$id: baseId + 1,
					fieldData: {
						$type: BOOL_ARRAY_TYPE,
						$id: baseId + 2,
						$0: {
							$primitiveArray: true,
							bytesPerElement: 1,
							data: Uint8Array.from(core.data)
						}
					},
					width: core.width,
					height: core.height,
					$types: {
						width: { e: EntryType.UnnamedInt },
						height: { e: EntryType.UnnamedInt }
					}
				} satisfies OdinNode)
			: null,
		levelModificationField: null,
		powerLevel: info?.powerLevel?.[1] ?? 1,
		$types: { powerLevel: { e: EntryType.UnnamedInt } }
	};
	listItems(vault.modules as OdinValue).push(node);
}

/** Removes the module at `index` from the vault's module list. */
export function removeModule(vault: OdinNode, index: number): void {
	const arr = listItems(vault.modules as OdinValue);
	if (index >= 0 && index < arr.length) arr.splice(index, 1);
}
