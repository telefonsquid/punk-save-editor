/**
 * Entity-level accessors over the `entities` file: one list of entity nodes,
 * each carrying its component mementos. Every subsystem (the module grid, the
 * ship's resources) finds its data by a memento's `$type` prefix, so the walk
 * lives here once instead of in each of them.
 */

import { isNode } from './odin';
import type { OdinNode } from './odin';

/** The entity nodes in the file, in file order. */
export function entityNodes(entities: OdinNode): OdinNode[] {
	const ents = entities.$0;
	return Array.isArray(ents) ? ents.filter(isNode) : [];
}

/** An entity's component memento whose `$type` starts with the prefix, or null. */
export function componentMemento(entity: OdinNode, typePrefix: string): OdinNode | null {
	const mementos = (entity.componentMementos as OdinNode)?.$0;
	if (!Array.isArray(mementos)) return null;
	const m = mementos.find((c) => isNode(c) && (c.$type as string)?.startsWith(typePrefix));
	return isNode(m) ? m : null;
}
