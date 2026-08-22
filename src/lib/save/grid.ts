/**
 * The module grid in the `entities` file: finding the entities that carry one,
 * reading a grid's two dictionaries into the plain snapshot the simulation
 * (`$lib/game/grid-rules`) runs on, and the mutations the grid editor commits.
 *
 * A grid memento is two `Dictionary<Vector2Int, …>`s — `slotTypes` (slot-type
 * id per special cell) and `modules` (`Module.Memento` per occupied cell). The
 * snapshot keeps a reference to each module's raw node, because edits go into
 * the live tree, never into the snapshot. A dict pair is an anonymous node
 * `{$type: null, $k, $v}` whose key is a Vector2Int struct node without an
 * `$id` (verified against a real save), so pairs can be built and appended
 * freely — the pairs array carries no `$types` metadata to maintain.
 */

import { savedEffectField, type ModuleView } from './vault';
import { EntryType, isNode } from './odin';
import type { OdinNode, OdinValue } from './odin';
import { dictPairs } from './tree';
import {
	cellKey,
	parseCell,
	randomizeSlots,
	type CellKey,
	type GridModule
} from '$lib/game/grid-rules';

/** One entity holding a module grid — the ship, and in co-op every player ship. */
export interface GridOwner {
	entityId: string;
	/** The `ModuleGrid.Memento` node (`gridMemento`), holding the two dicts. */
	grid: OdinNode;
}

/** Every entity in the file that carries a module grid, in file order. */
export function gridOwners(entities: OdinNode): GridOwner[] {
	const ents = entities.$0;
	if (!Array.isArray(ents)) return [];
	const owners: GridOwner[] = [];
	for (const e of ents) {
		if (!isNode(e)) continue;
		const mementos = (e.componentMementos as OdinNode)?.$0;
		if (!Array.isArray(mementos)) continue;
		const m = mementos.find(
			(c) => isNode(c) && (c.$type as string)?.startsWith('ModuleGridOwner')
		);
		const grid = isNode(m) ? (m.gridMemento as OdinValue) : null;
		if (isNode(grid)) owners.push({ entityId: String(e.entityId ?? ''), grid });
	}
	return owners;
}

/** A grid module plus the raw memento node its fields were read from. */
export interface GridModuleRef extends GridModule {
	node: OdinNode;
}

/** A snapshot whose modules still point at their tree nodes — assignable
 * wherever the sim wants a `GridSnapshot`. */
export interface GridView {
	slotTypes: Map<CellKey, string>;
	modules: Map<CellKey, GridModuleRef>;
}

function vec(node: OdinValue): { x: number; y: number } {
	const n = node as OdinNode;
	return { x: n.$0 as number, y: n.$1 as number };
}

/** Decodes one `Module.Memento` node into the sim's view of it. */
export function readModule(node: OdinNode): GridModuleRef {
	const m = node as unknown as ModuleView;
	return {
		node,
		id: m.moduleDataId,
		north: !!m.northConnection,
		east: !!m.eastConnection,
		south: !!m.southConnection,
		west: !!m.westConnection,
		powerCore: savedEffectField(m.powerCore),
		levelField: savedEffectField(m.levelModificationField),
		powerLevel: typeof m.powerLevel === 'number' ? m.powerLevel : 0
	};
}

/** Reads a grid memento's dictionaries into cell-keyed maps. */
export function snapshotGrid(grid: OdinNode): GridView {
	const slotTypes = new Map<CellKey, string>();
	for (const pair of dictPairs(grid.slotTypes)) {
		const { x, y } = vec(pair.$k as OdinValue);
		slotTypes.set(cellKey(x, y), pair.$v as string);
	}
	const modules = new Map<CellKey, GridModuleRef>();
	for (const pair of dictPairs(grid.modules)) {
		const { x, y } = vec(pair.$k as OdinValue);
		modules.set(cellKey(x, y), readModule(pair.$v as OdinNode));
	}
	return { slotTypes, modules };
}

// ---------------------------------------------------------------------------
// Mutations (the editor's commits — carrying a module never touches the tree)
// ---------------------------------------------------------------------------

/** A Vector2Int struct node, exactly as the game serializes a dict key. */
function vecNode(x: number, y: number): OdinNode {
	return {
		$type: 'UnityEngine.Vector2Int, UnityEngine.CoreModule',
		$0: x,
		$1: y,
		$types: { $0: { e: EntryType.UnnamedInt }, $1: { e: EntryType.UnnamedInt } }
	};
}

function pairAt(dict: unknown, x: number, y: number): OdinNode | undefined {
	return dictPairs(dict).find((pair) => {
		const k = vec(pair.$k as OdinValue);
		return k.x === x && k.y === y;
	});
}

/** The raw memento node installed at a cell, or null. */
export function moduleNodeAt(grid: OdinNode, x: number, y: number): OdinNode | null {
	const pair = pairAt(grid.modules, x, y);
	return pair && isNode(pair.$v) ? pair.$v : null;
}

/** Installs a memento node at an empty cell. The caller resolves displacement
 * first — overwriting silently would leak the old node's `$id` references. */
export function insertModuleAt(grid: OdinNode, x: number, y: number, memento: OdinNode): void {
	if (pairAt(grid.modules, x, y)) throw new Error(`cell ${x},${y} is already occupied`);
	dictPairs(grid.modules).push({ $type: null, $k: vecNode(x, y), $v: memento } as OdinNode);
}

/** Removes and returns the memento at a cell, or null when it was empty. The
 * node keeps its `$id`, so it can move into the vault list or back unharmed. */
export function removeModuleAt(grid: OdinNode, x: number, y: number): OdinNode | null {
	const pairs = dictPairs(grid.modules);
	const index = pairs.findIndex((pair) => {
		const k = vec(pair.$k as OdinValue);
		return k.x === x && k.y === y;
	});
	if (index < 0) return null;
	const [pair] = pairs.splice(index, 1);
	return isNode(pair.$v) ? pair.$v : null;
}

/**
 * Rerolls the generated special cells the way a fresh run does: reads the
 * dict, runs the game's `RandomizeSlots` port over it, and rebuilds the pairs.
 * Wholesale reconstruction is safe for this dict alone — its pairs carry no
 * `$id`s anywhere (struct keys, string values), so nothing references them.
 */
export function rerollSlotTypes(grid: OdinNode): void {
	const slots = new Map<CellKey, string>();
	for (const pair of dictPairs(grid.slotTypes)) {
		const { x, y } = vec(pair.$k as OdinValue);
		slots.set(cellKey(x, y), pair.$v as string);
	}
	randomizeSlots(slots);
	const pairs = dictPairs(grid.slotTypes);
	pairs.length = 0;
	for (const [key, typeId] of slots) {
		const { x, y } = parseCell(key);
		pairs.push({ $type: null, $k: vecNode(x, y), $v: typeId } as OdinNode);
	}
}

/**
 * Sets a cell's slot type, returning what it held before (null = no entry).
 * `Normal` and null both remove the entry — the game's `GetSlotType` treats
 * every absent cell as normal and never stores the id.
 */
export function setSlotTypeAt(
	grid: OdinNode,
	x: number,
	y: number,
	typeId: string | null
): string | null {
	const pairs = dictPairs(grid.slotTypes);
	const index = pairs.findIndex((pair) => {
		const k = vec(pair.$k as OdinValue);
		return k.x === x && k.y === y;
	});
	const previous = index >= 0 ? (pairs[index].$v as string) : null;
	if (typeId && typeId !== 'Normal') {
		if (index >= 0) pairs[index].$v = typeId;
		else pairs.push({ $type: null, $k: vecNode(x, y), $v: typeId } as OdinNode);
	} else if (index >= 0) {
		pairs.splice(index, 1);
	}
	return previous;
}
