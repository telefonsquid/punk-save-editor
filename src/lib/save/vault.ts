/**
 * Typed views and mutations over the vault tree — ingredients, consumables
 * and modules. Mutations go straight into the parsed nodes and mirror what
 * the game itself stores, which is why this module (alone under save/) may
 * consult `$lib/game/data` for asset defaults.
 */

import { moduleInfo, type EffectField } from '$lib/game/data';
import { EntryType, isNode } from './odin';
import type { OdinNode, OdinPrimitiveArray, OdinValue } from './odin';
import { isPrimitiveArray, listItems, maxOdinId, pushScalar, reidNode } from './tree';

// ---------------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------------

export function ingredientIds(vault: OdinNode): string[] {
	return listItems(vault.ingredientIds as OdinValue) as string[];
}

export function ingredientCounts(vault: OdinNode): number[] {
	return listItems(vault.ingredientCounts as OdinValue) as number[];
}

/** Sets an ingredient's owned count, inserting the ingredient if the player
 * didn't own it yet. */
export function setIngredientCount(vault: OdinNode, id: string, count: number): void {
	const i = ingredientIds(vault).indexOf(id);
	if (i >= 0) {
		ingredientCounts(vault)[i] = count;
	} else {
		pushScalar(vault.ingredientIds as OdinValue, id, EntryType.UnnamedString);
		pushScalar(vault.ingredientCounts as OdinValue, count, EntryType.UnnamedInt);
	}
}

// ---------------------------------------------------------------------------
// Consumables
// ---------------------------------------------------------------------------

export interface ConsumableView {
	consumableId: string | null;
	amount: number;
}

export function getConsumables(vault: OdinNode): ConsumableView[] {
	return listItems(vault.consumables as OdinValue) as unknown as ConsumableView[];
}

/** The vault's consumable slots split into filled and empty. Both arrays alias
 * the live slot nodes, so edits to their entries land in the tree. */
function partitionConsumables(vault: OdinNode) {
	const arr = listItems(vault.consumables as OdinValue);
	const view = arr as unknown as ConsumableView[];
	return {
		arr,
		filled: view.filter((c) => c.consumableId != null),
		empty: view.filter((c) => c.consumableId == null)
	};
}

/** Rebuilds the slot list as filled-then-empty, preserving the fixed slot
 * count the game restores from its memento. */
function rebuildConsumables(
	arr: OdinValue[],
	filled: ConsumableView[],
	empty: ConsumableView[]
): void {
	arr.length = 0;
	arr.push(...(filled as unknown as OdinValue[]), ...(empty as unknown as OdinValue[]));
}

/**
 * Sets a consumable's amount, occupying a slot if the player didn't hold it.
 * Returns false when every slot is taken and this one isn't among them.
 *
 * The vault keeps a fixed run of consumable slots (8), empty ones having a null
 * id. This mirrors the game's `Vault.Add`: fill the first empty slot rather than
 * growing the list, so the restored inventory keeps its slot count — which means
 * a full vault has nowhere to put a ninth, and says so instead of appending a
 * slot the game would never have written (and the wheel would never draw).
 */
export function setConsumable(vault: OdinNode, id: string, amount: number): boolean {
	const slots = getConsumables(vault);
	const existing = slots.find((c) => c.consumableId === id);
	if (existing) {
		existing.amount = amount;
		return true;
	}
	const empty = slots.find((c) => c.consumableId == null);
	if (!empty) return false;
	empty.consumableId = id;
	empty.amount = amount;
	return true;
}

/** Whether the vault has room for a consumable it doesn't already hold. */
export function hasFreeConsumableSlot(vault: OdinNode): boolean {
	return getConsumables(vault).some((c) => c.consumableId == null);
}

/**
 * Sets a held consumable's amount, emptying its slot at zero.
 *
 * Zero is not a state a slot may sit in: the wheel only draws slots holding
 * something, while "is this consumable already held" reads the id — so a slot
 * left at 0 would vanish from the wheel *and* keep its consumable out of the add
 * row, stranding it in the save with no way back. Stepping past zero already
 * empties the slot; typing a zero has to mean the same thing.
 */
export function setConsumableAmount(vault: OdinNode, id: string, amount: number): void {
	const filled = getConsumables(vault).filter((c) => c.consumableId != null);
	const index = filled.findIndex((c) => c.consumableId === id);
	if (index < 0) return;
	if (amount <= 0) {
		removeConsumable(vault, index);
		return;
	}
	filled[index].amount = amount;
}

/** Reorders the vault's non-empty consumables. `from`/`to` index into the
 * filled slots only, as the UI shows them. */
export function reorderConsumables(vault: OdinNode, from: number, to: number): void {
	const { arr, filled, empty } = partitionConsumables(vault);
	if (from < 0 || from >= filled.length || to < 0 || to >= filled.length) return;
	const [moved] = filled.splice(from, 1);
	filled.splice(to, 0, moved);
	rebuildConsumables(arr, filled, empty);
}

/** Empties a filled consumable slot (`filledIndex` counts only filled slots, as
 * the UI shows them). The now-empty slot is kept trailing. */
export function removeConsumable(vault: OdinNode, filledIndex: number): void {
	const { arr, filled, empty } = partitionConsumables(vault);
	if (filledIndex < 0 || filledIndex >= filled.length) return;
	const [gone] = filled.splice(filledIndex, 1);
	gone.consumableId = null;
	gone.amount = 0;
	rebuildConsumables(arr, filled, [gone, ...empty]);
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export interface ModuleView {
	moduleDataId: string | null;
	northConnection: boolean;
	eastConnection: boolean;
	southConnection: boolean;
	westConnection: boolean;
	powerLevel: number;
	/** `ModuleEffectField` nodes — read with `savedEffectField`. */
	powerCore: OdinValue;
	levelModificationField: OdinValue;
}

/** The bool array inside a `ModuleEffectField` node's fieldData wrapper, or
 * null when the node doesn't have that shape. */
function fieldBoolArray(value: OdinValue): OdinPrimitiveArray | null {
	if (!isNode(value)) return null;
	const array = value.fieldData as OdinValue;
	const inner = isNode(array) ? (array.$0 as OdinValue) : null;
	return isPrimitiveArray(inner) ? inner : null;
}

/**
 * The concrete effect field a module rolled, as stored in its memento.
 *
 * The game picks the shape *and* a random mirror/rotation per module instance
 * (`ModuleEffectField.Parse`) and saves the result, so this — not the asset's
 * candidate list — is what an owned module actually projects onto the grid.
 */
export function savedEffectField(value: OdinValue): EffectField | null {
	const bools = fieldBoolArray(value);
	if (!bools || !isNode(value)) return null;
	return {
		width: value.width as number,
		height: value.height as number,
		data: [...bools.data]
	};
}

export function getModules(vault: OdinNode): (ModuleView & OdinNode)[] {
	return listItems(vault.modules as OdinValue) as unknown as (ModuleView & OdinNode)[];
}

/** The same list as raw nodes — the view the grid editor's moves splice on. */
export function getModuleNodes(vault: OdinNode): OdinNode[] {
	return listItems(vault.modules as OdinValue) as OdinNode[];
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

/** The two `ModuleEffectField` members of a module memento. */
export const EFFECT_FIELD_KEYS = ['powerCore', 'levelModificationField'] as const;
export type EffectFieldKey = (typeof EFFECT_FIELD_KEYS)[number];

/** One `ModuleEffectField` node, or null when the module projects none. */
function effectFieldNode(field: EffectField | null | undefined, allocId: () => number): OdinValue {
	if (!field) return null;
	const fieldId = allocId();
	const arrayId = allocId();
	return {
		$type: EFFECT_FIELD_TYPE,
		$id: fieldId,
		fieldData: {
			$type: BOOL_ARRAY_TYPE,
			$id: arrayId,
			$0: {
				$primitiveArray: true,
				bytesPerElement: 1,
				data: Uint8Array.from(field.data)
			}
		},
		width: field.width,
		height: field.height,
		$types: {
			width: { e: EntryType.UnnamedInt },
			height: { e: EntryType.UnnamedInt }
		}
	} satisfies OdinNode;
}

/**
 * Replaces the shape a module projects — in the vault or on a grid.
 *
 * An existing field node is rewritten **in place** rather than swapped out: its
 * `$id` is what any `$ref` elsewhere in the tree resolves through, so replacing
 * the node would leave those references pointing at nothing. `tree` is the
 * whole file the module lives in (`vault`, or `entities` for a grid module);
 * it only matters when the module has no field yet and a node must be built
 * with fresh ids.
 */
export function setSavedEffectField(
	tree: OdinNode,
	module: ModuleView,
	key: EffectFieldKey,
	field: EffectField
): void {
	const existing = module[key];
	if (isNode(existing)) {
		const bools = fieldBoolArray(existing);
		if (!bools) throw new Error(`${key} has no bool array`);
		bools.data = Uint8Array.from(field.data);
		existing.width = field.width;
		existing.height = field.height;
		return;
	}
	let nextId = maxOdinId(tree) + 1;
	module[key] = effectFieldNode(field, () => nextId++);
}

/** The shapes a module is created with — its rolled fields, or the asset's first. */
export type NewModuleFields = Partial<Record<EffectFieldKey, EffectField | null>>;

/**
 * Builds a fresh `Module+Memento` node, mirroring what the game stores for one
 * the player picked up (`Module.CreateMemento`). All four connections are
 * enabled so it can be attached anywhere on the grid, and the power level
 * defaults to the asset's maximum. Both effect fields are rebuilt from the
 * extracted sprite grids — without its power core the module would provide
 * none at all when placed, and a BOOSTER CORE without its level field would
 * boost nothing.
 *
 * `tree` is whichever tree the node is destined for — its `$id`s are allocated
 * past that tree's highest, so hand the *whole* file's root, not a subtree.
 * `fields` overrides either shape, which is how the picker applies the
 * orientation the user chose before pressing Add.
 */
export function newModuleNode(
	tree: OdinNode,
	moduleDataId: string,
	fields: NewModuleFields = {}
): OdinNode {
	const info = moduleInfo(moduleDataId);
	// Each field costs two ids (the ModuleEffectField and its bool array).
	let nextId = maxOdinId(tree) + 1;
	const allocId = () => nextId++;
	// The game draws a random shape out of each distribution; absent a choice the
	// editor takes the first, which is one of the draws the game could make.
	const chosen = (key: EffectFieldKey, fallback: EffectField | undefined) =>
		key in fields ? fields[key] : fallback;

	return {
		$type: MODULE_MEMENTO_TYPE,
		$id: allocId(),
		moduleDataId,
		northConnection: true,
		eastConnection: true,
		southConnection: true,
		westConnection: true,
		powerCore: effectFieldNode(chosen('powerCore', info?.powerCores[0]), allocId),
		levelModificationField: effectFieldNode(
			chosen('levelModificationField', info?.levelFields[0]),
			allocId
		),
		powerLevel: info?.powerLevel?.[1] ?? 1,
		$types: { powerLevel: { e: EntryType.UnnamedInt } }
	};
}

/**
 * A duplicate of a module memento, its `$id`s allocated past `tree`'s highest
 * so the copy can sit beside the original in the same file. Everything the
 * original carries comes along — the rolled fields, the connections, the power
 * level — which is the difference between copying a module and building the
 * same one again.
 */
export function copyModuleNode(node: OdinNode, tree: OdinNode): OdinNode {
	const copy = structuredClone(node);
	reidNode(copy, tree);
	return copy;
}

/** Appends a freshly built module to the vault (see `newModuleNode`). */
export function addModule(vault: OdinNode, moduleDataId: string, fields: NewModuleFields = {}): void {
	listItems(vault.modules as OdinValue).push(newModuleNode(vault, moduleDataId, fields));
}

/** Removes the module at `index` from the vault's module list. */
export function removeModule(vault: OdinNode, index: number): void {
	const arr = listItems(vault.modules as OdinValue);
	if (index >= 0 && index < arr.length) arr.splice(index, 1);
}
