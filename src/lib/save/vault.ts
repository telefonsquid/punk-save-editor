/**
 * Typed views and mutations over the vault tree — ingredients, consumables
 * and modules. Mutations go straight into the parsed nodes and mirror what
 * the game itself stores, which is why this module (alone under save/) may
 * consult `$lib/game/data` for asset defaults.
 */

import { moduleInfo, type EffectField } from '$lib/game/data';
import { EntryType, isNode } from './odin';
import type { OdinNode, OdinPrimitiveArray, OdinValue } from './odin';
import { isPrimitiveArray, listItems, maxOdinId, pushScalar } from './tree';

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

const CONSUMABLE_MENTO_TYPE = 'Vault+Memento+ConsumableMento, Punk.Main';

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

/** Sets a consumable's amount, occupying a slot if the player didn't hold it. */
export function setConsumable(vault: OdinNode, id: string, amount: number): void {
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
 * Replaces the shape a module in the vault projects.
 *
 * An existing field node is rewritten **in place** rather than swapped out: its
 * `$id` is what any `$ref` elsewhere in the tree resolves through, so replacing
 * the node would leave those references pointing at nothing.
 */
export function setSavedEffectField(
	vault: OdinNode,
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
	let nextId = maxOdinId(vault) + 1;
	module[key] = effectFieldNode(field, () => nextId++);
}

/** The shapes a module is created with — its rolled fields, or the asset's first. */
export type NewModuleFields = Partial<Record<EffectFieldKey, EffectField | null>>;

/**
 * Appends a module to the vault, mirroring what the game stores for one the
 * player picked up (`Module.CreateMemento`). All four connections are enabled so
 * it can be attached anywhere on the grid, and the power level defaults to the
 * asset's maximum. Both effect fields are rebuilt from the extracted sprite
 * grids — without its power core the module would provide none at all when
 * placed, and a BOOSTER CORE without its level field would boost nothing.
 *
 * `fields` overrides either shape, which is how the picker applies the
 * orientation the user chose before pressing Add.
 */
export function addModule(vault: OdinNode, moduleDataId: string, fields: NewModuleFields = {}): void {
	const info = moduleInfo(moduleDataId);
	// Every node the editor adds claims ids after the highest one in the tree;
	// each field costs two (the ModuleEffectField and its bool array).
	let nextId = maxOdinId(vault) + 1;
	const allocId = () => nextId++;
	// The game draws a random shape out of each distribution; absent a choice the
	// editor takes the first, which is one of the draws the game could make.
	const chosen = (key: EffectFieldKey, fallback: EffectField | undefined) =>
		key in fields ? fields[key] : fallback;

	const node: OdinNode = {
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
	listItems(vault.modules as OdinValue).push(node);
}

/** Removes the module at `index` from the vault's module list. */
export function removeModule(vault: OdinNode, index: number): void {
	const arr = listItems(vault.modules as OdinValue);
	if (index >= 0 && index < arr.length) arr.splice(index, 1);
}
