/**
 * High-level access to a PUNK save slot: loads the LZF+Odin files into
 * editable trees and writes them back. Only the files the editor changes
 * are rewritten; a one-time `.bak` backup of each is created beside it.
 */

import type { SaveDir } from './io';
import { lzfCompress, lzfDecompress } from './lzf';
import { EntryType, META_KEYS, OdinBinaryReader, OdinBinaryWriter, isNode } from './odin';
import type { OdinNode, OdinValue, TypeInfo } from './odin';
import assetNames from './asset-names.json';
import itemIcons from './item-icons.json';
import moduleCaps from './module-effects.json';
import moduleInfoJson from './module-info.json';

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

/**
 * Player-facing names for resources whose asset id is an internal codename.
 *
 * `Resource` assets carry no `displayName`, so the fallback is the id with its
 * `Resource ` prefix stripped — which leaves three of them reading as the colour
 * the artist happened to pick rather than as the thing the player knows. These
 * are the names the game itself uses in the HUD. The **ids are save-file keys
 * and must never change**; this is display only.
 */
const RESOURCE_LABELS: Record<string, string> = {
	'Resource Money': 'Money',
	'Resource White': 'Stamina',
	'Resource Purple': 'Gel'
};

/** Player-facing name for a resource id (see RESOURCE_LABELS). */
export function resourceLabel(id: string): string {
	return RESOURCE_LABELS[id] ?? id.replace(/^Resource /, '');
}

/** Best human-readable name for a module/consumable/ingredient/resource id. */
export function displayName(id: string | null): string {
	if (!id) return '(none)';
	const a = assets[id];
	// Resources have no displayName of their own — route them through the
	// resource labels so every surface agrees on "Money"/"Stamina"/"Gel".
	if (a?.category === 'Resource') return resourceLabel(id);
	return a?.displayName || a?.assetName || id;
}

export function assetsByCategory(category: string): { id: string; info: AssetInfo }[] {
	return Object.entries(assets)
		.filter(([, info]) => info.category === category)
		.map(([id, info]) => ({ id, info }))
		.sort((a, b) => displayName(a.id).localeCompare(displayName(b.id)));
}

/**
 * The modules the player can actually equip — the game's `ModuleData.Equippable`
 * check is a displayName AND an icon. Named modules without an icon are
 * embedded enemy parts and never appear in the shop or the vault.
 */
export function equippableModules(): { id: string; info: AssetInfo }[] {
	const icons = itemIcons as Record<string, string>;
	return assetsByCategory('Module').filter(({ id, info }) => info.displayName && icons[id]);
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
// Ship resources (entities file) — current values live in the ship entity's
// Unit memento; the max is not saved anywhere but recomputed by the game from
// the installed grid modules' ModifyResourceCapacity effects, which we mirror
// here from module-caps.json (extracted out of the game assets).
// ---------------------------------------------------------------------------

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

function shipMemento(entities: OdinNode, type: string): OdinNode | null {
	const ents = entities.$0;
	if (!Array.isArray(ents)) return null;
	const ship = ents.find((e) => isNode(e) && e.entityId === 'Ship');
	if (!isNode(ship)) return null;
	const mementos = (ship.componentMementos as OdinNode)?.$0;
	if (!Array.isArray(mementos)) return null;
	const m = mementos.find((c) => isNode(c) && (c.$type as string)?.startsWith(type));
	return isNode(m) ? m : null;
}

/** The ship's current resource values ({$k, $v} pairs, mutable in place). */
export function shipResources(entities: OdinNode): ResourcePair[] {
	const unit = shipMemento(entities, 'Unit+Data+Memento');
	if (!unit) return [];
	return dictPairs(unit.resourceValues) as unknown as ResourcePair[];
}

/** A `FloatSeries` magnitude: `base (+|*) change` per level above the first. */
export interface Series {
	base: number;
	method: string;
	change: number;
}

/**
 * One decoded `ModuleEffect` (see scripts/extract-module-caps.ts, which flattens
 * all eight C# subclasses onto this shape). `kind` is `capacity`, `regen`,
 * `drain`, `shield`, `weaponProperty`, `explosion`, `burn` or `discharge`.
 */
export interface ModuleEffectInfo {
	kind: string;
	resource: string | null;
	series: Series | null;
	cost?: { amount: number; resource: string | null };
	extra?: Record<string, number | boolean | string>;
}

interface ModuleCapsEntry {
	level: number;
	canBeBoosted: boolean;
	effects: ModuleEffectInfo[];
}
const capModules = moduleCaps.modules as unknown as Record<string, ModuleCapsEntry>;
const slotLevelDeltas = moduleCaps.slotLevelDeltas as Record<string, number>;

/** The effects of a module id, in the order the game declares them. */
export function moduleEffects(id: string | null | undefined): ModuleEffectInfo[] {
	return (id ? capModules[id]?.effects : null) ?? [];
}

/** The level a module's effects are evaluated at when nothing boosts it. */
export function moduleLevel(id: string | null | undefined): number {
	return (id ? capModules[id]?.level : null) ?? 1;
}

/** `FloatSeries.GetElement`: the effect's magnitude at a zero-based level index. */
export function seriesAt(e: Series, idx: number): number {
	return e.method === 'mul' ? e.base * Math.pow(e.change, idx) : e.base + e.change * idx;
}

/**
 * Sums one kind of module effect across every module installed on the ship grid,
 * each evaluated at its effective level (asset level + LevelUp slots + neighbour
 * level-boost fields — this is what a booster module does). Power/connectivity is
 * not simulated, so modules parked unpowered on the grid still count: an upper
 * bound, exact for valid layouts.
 */
function sumGridEffects(entities: OdinNode, kind: string): Map<string, number> {
	const totals = new Map<string, number>();
	const gridOwner = shipMemento(entities, 'ModuleGridOwner');
	const gridValue = (gridOwner?.gridMemento ?? null) as OdinValue;
	const grid = isNode(gridValue) ? gridValue : null;
	if (!grid) return totals;
	const modules = dictPairs(grid.modules);
	const vec = (v: unknown) => ({ x: (v as OdinNode).$0 as number, y: (v as OdinNode).$1 as number });
	const key = (x: number, y: number) => `${x},${y}`;

	const levelDeltas = new Map<string, number>();
	for (const pair of dictPairs(grid.slotTypes)) {
		const delta = slotLevelDeltas[pair.$v as string];
		if (!delta) continue;
		const { x, y } = vec(pair.$k);
		levelDeltas.set(key(x, y), (levelDeltas.get(key(x, y)) ?? 0) + delta);
	}
	for (const pair of modules) {
		const field = (pair.$v as OdinNode).levelModificationField as OdinValue;
		if (!isNode(field)) continue;
		const data = field.fieldData as OdinValue;
		const inner = isNode(data) ? (data.$0 as OdinValue) : null;
		const bools = isPrimitiveArray(inner) ? inner.data : null;
		if (!bools) continue;
		const { x, y } = vec(pair.$k);
		const w = field.width as number;
		const h = field.height as number;
		// mirrors ModuleEffectField.GetPositionsRelative (including its y*height indexing)
		for (let fx = 0; fx < w; fx++) {
			for (let fy = 0; fy < h; fy++) {
				if (!bools[fy * h + fx]) continue;
				const k = key(x + fx - Math.floor(w / 2), y + fy - Math.floor(h / 2));
				levelDeltas.set(k, (levelDeltas.get(k) ?? 0) + 1);
			}
		}
	}

	for (const pair of modules) {
		const memento = pair.$v as OdinNode;
		const info = capModules[memento.moduleDataId as string];
		if (!info) continue;
		const { x, y } = vec(pair.$k);
		let level = info.level;
		if (info.canBeBoosted) level += levelDeltas.get(key(x, y)) ?? 0;
		const idx = Math.max(0, level - 1);
		for (const e of info.effects) {
			if (e.kind !== kind || !e.resource || !e.series) continue;
			totals.set(e.resource, (totals.get(e.resource) ?? 0) + seriesAt(e.series, idx));
		}
	}
	return totals;
}

/** Max capacity per resource id, from the grid's ModifyResourceCapacity effects. */
export function shipResourceCaps(entities: OdinNode): Map<string, number> {
	return sumGridEffects(entities, 'capacity');
}

/**
 * Recharge rate per second per resource id, from the grid's
 * `ResourceAutoChargeEffect`s. Stamina looks like it has an intrinsic base rate,
 * but it doesn't: the always-installed `SHIP` module carries a flat
 * `Resource White +20/s` effect (and is the one module that can't be boosted).
 * Everything else comes from regen modules, which a neighbouring booster raises
 * by lifting their effective level — the same mechanism as capacities.
 *
 * This is the steady-state rate. The game also gates recharging behind
 * `Resource.rechargeDelay` after the last drain, so the observed rate right
 * after taking damage is zero for a moment.
 */
export function shipResourceRegen(entities: OdinNode): Map<string, number> {
	return sumGridEffects(entities, 'regen');
}

function isPrimitiveArray(v: OdinValue | null | undefined): v is import('./odin').OdinPrimitiveArray {
	return typeof v === 'object' && v !== null && '$primitiveArray' in v;
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

/** The four grid edges a module can connect through, in the order the game's
 * memento stores them. */
export const CONNECTION_SIDES = [
	{ key: 'northConnection', label: 'N' },
	{ key: 'eastConnection', label: 'E' },
	{ key: 'southConnection', label: 'S' },
	{ key: 'westConnection', label: 'W' }
] as const;

export type ConnectionKey = (typeof CONNECTION_SIDES)[number]['key'];

/**
 * Per-module data that isn't in the save file, extracted from the game assets
 * (scripts/extract-module-info.py):
 * - `color`/`resource`: every ModuleData shares its ColorAsset with the Resource
 *   it belongs to, which is what tints it in the game's own UI (a DANDELION is
 *   `#6a36ff` because it is a `Resource Tech` module).
 * - `powerLevel`: the asset's `[min, max]` range. It is the *maximum* number of
 *   power cores the module can accept when expanding its grid, so a higher value
 *   is strictly better for the player.
 * - `powerCore`: the bool grid the game derives from the module's power-core
 *   sprite. Needed to build a usable module from scratch.
 */
export interface ModuleInfo {
	color: string | null;
	type: { name: string; order: number; isMain: boolean } | null;
	description: string | null;
	powerLevel: [number, number];
	powerCore: { width: number; height: number; data: number[] } | null;
	weapon: WeaponStats | null;
	resource: string | null;
}

/** The numbers the game prints on a weapon card (`WeaponData`). */
export interface WeaponStats {
	damage?: number;
	damageType?: string;
	fireRate?: number;
	cost?: number;
	costResource?: string;
	burstSize?: number;
	projectileCount?: number;
	spread?: number;
	knockback?: number;
}

export const moduleInfos = moduleInfoJson as unknown as Record<string, ModuleInfo>;

export function moduleInfo(id: string | null | undefined): ModuleInfo | null {
	return id ? (moduleInfos[id] ?? null) : null;
}

/**
 * The module's shop category, straight from its `ModuleType` asset — the game's
 * own grouping, so a game update that adds or renames one carries through
 * without touching the editor. `POWER`/`BOOSTERS`/`Embedded` are single-module
 * categories the player never shops for; the rest are WEAPONS, GADGETS,
 * WEAPON MODS and UPGRADES (the ship modules).
 */
export function moduleCategory(id: string | null | undefined): string {
	return moduleInfo(id)?.type?.name ?? 'OTHER';
}

/**
 * Whether a module takes part in the power-core mechanic. Weapons and gadgets
 * carry a core sprite and a `powerLevel` range worth editing; ship modules
 * (UPGRADES) and weapon mods have neither, so the editor hides the field for
 * them rather than showing a number that can only ever be 1.
 */
export function usesPowerCore(id: string | null | undefined): boolean {
	return !!moduleInfo(id)?.powerCore;
}

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
