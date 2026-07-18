/**
 * The ship in the `entities` file: current resource values, and the grid walk
 * that recomputes what the game never saves — per-resource max capacity and
 * recharge rate, both derived from the modules installed on the ship grid.
 *
 * This is the seed of the module-grid recreation: it already reads the grid's
 * module positions, slot types and booster fields. What it does *not* yet
 * simulate is power/connectivity (`ModuleCluster.RefreshPoweredSlots`), so an
 * unpowered module parked on the grid still counts — an upper bound, exact for
 * valid layouts.
 */

import { moduleEffectsEntry, seriesAt, slotLevelDeltas } from '$lib/game/data';
import { isNode } from './odin';
import type { OdinNode, OdinPrimitiveArray, OdinValue } from './odin';
import { dictPairs, type ResourcePair } from './slot';

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

function isPrimitiveArray(v: OdinValue | null | undefined): v is OdinPrimitiveArray {
	return typeof v === 'object' && v !== null && '$primitiveArray' in v;
}

/**
 * Sums one kind of module effect across every module installed on the ship grid,
 * each evaluated at its effective level (asset level + LevelUp slots + neighbour
 * level-boost fields — this is what a booster module does).
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
		const info = moduleEffectsEntry(memento.moduleDataId as string);
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
