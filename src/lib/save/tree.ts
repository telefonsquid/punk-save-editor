/**
 * Generic accessors over decoded Odin trees — the shapes Odin serialization
 * gives every C# collection, independent of which save file the tree came
 * from. Anything that knows what the game *stores* (vault, rundata, ship)
 * lives in its own module beside this one.
 */

import { EntryType, META_KEYS, isNode } from './odin';
import type { OdinNode, OdinPrimitiveArray, OdinValue, TypeInfo } from './odin';

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

/** One `{$k, $v}` pair of a serialized Dictionary<string, number>. */
export interface ResourcePair {
	$k: string;
	$v: number;
}

export function isPrimitiveArray(v: OdinValue | null | undefined): v is OdinPrimitiveArray {
	return typeof v === 'object' && v !== null && '$primitiveArray' in v;
}

/**
 * Highest `$id` used anywhere in a tree. A node the editor adds must claim an
 * unused one: Odin resolves internal references (`$ref`) through these ids, so
 * reusing one would silently repoint an existing reference at the new node.
 */
export function maxOdinId(root: OdinValue): number {
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
