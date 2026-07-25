/**
 * The one grouping and ordering rule for every module list the editor shows —
 * the vault's card grid and the picker's row list — plus the field-kind table
 * both use to draw effect fields. Mirrors the game's own shop presentation.
 */

import { categoryRank, displayName, moduleInfo, resourceRank, type EffectField } from './data';

/** The two kinds of effect field, named as `ModuleInfo` holds them. */
export type FieldKind = 'powerCores' | 'levelFields';

export const FIELD_KINDS: { key: FieldKind; label: string }[] = [
	{ key: 'powerCores', label: 'POWERS' },
	{ key: 'levelFields', label: 'BOOSTS' }
];

/**
 * Grouped by the module's own `ModuleType` asset, in the game's shop order —
 * except for the two core categories, which `categoryRank` pins to the top —
 * so weapons/gadgets/ship modules/weapon mods stay separated the way the
 * player sees them in-game. A module whose type is missing lands in "OTHER".
 *
 * Inside a category the resource comes first and the name only breaks ties:
 * a player looking for a weapon is choosing which resource to spend long
 * before they care what it is called, and it keeps each resource's modules
 * adjacent and uniformly coloured.
 */
export function groupModules<T extends { id: string | null }>(
	items: T[]
): { name: string; items: T[] }[] {
	const by: Record<string, { name: string; rank: number; items: T[] }> = {};
	for (const item of items) {
		const type = moduleInfo(item.id)?.type;
		const name = type?.name ?? 'OTHER';
		(by[name] ??= { name, rank: categoryRank(name, type?.order ?? 99), items: [] }).items.push(
			item
		);
	}
	for (const group of Object.values(by)) {
		group.items.sort(
			(a, b) =>
				resourceRank(moduleInfo(a.id)?.resource) - resourceRank(moduleInfo(b.id)?.resource) ||
				displayName(a.id).localeCompare(displayName(b.id))
		);
	}
	return Object.values(by).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

/**
 * The effect fields to draw under a module, one entry per kind its asset
 * defines: `shapes` is what it projects now (its rolled shape when the caller
 * passed one, else the asset's candidates) and `candidates` is what it could
 * project, which is what a chooser offers.
 */
export function moduleFields(id: string | null, rolled?: Partial<Record<FieldKind, EffectField[]>>) {
	const info = moduleInfo(id);
	return FIELD_KINDS.map((kind) => {
		const candidates = info?.[kind.key] ?? [];
		return { ...kind, candidates, shapes: rolled?.[kind.key] ?? candidates };
	}).filter((kind) => kind.candidates.length > 0);
}
