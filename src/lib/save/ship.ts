/**
 * The ship in the `entities` file: current resource values, and the grid walk
 * that recomputes what the game never saves — per-resource max capacity and
 * recharge rate, both derived from the modules installed on the ship grid.
 *
 * The walk runs the full grid simulation (`$lib/game/grid-rules`), so the
 * numbers are exact: only powered, connected modules count, and a booster only
 * boosts while it is powered itself — mirroring `ModuleGrid.OnRecalculateStats`
 * cluster by cluster.
 */

import { moduleEffectsEntry, moduleInfo, seriesAt } from '$lib/game/data';
import { simulateGrid } from '$lib/game/grid-rules';
import { componentMemento, entityNodes } from './entities';
import { gridOwners, snapshotGrid } from './grid';
import type { OdinNode } from './odin';
import { dictPairs, type ResourcePair } from './tree';

function shipMemento(entities: OdinNode, type: string): OdinNode | null {
	const ship = entityNodes(entities).find((e) => e.entityId === 'Ship');
	return ship ? componentMemento(ship, type) : null;
}

/** The ship's current resource values ({$k, $v} pairs, mutable in place). */
export function shipResources(entities: OdinNode): ResourcePair[] {
	const unit = shipMemento(entities, 'Unit+Data+Memento');
	if (!unit) return [];
	return dictPairs(unit.resourceValues) as unknown as ResourcePair[];
}

/**
 * Sums one kind of module effect the way `ModuleGrid.OnRecalculateStats` runs
 * them: per cluster, over its powered and connected members, each at its
 * simulated effective level — except a cluster whose main module spawns
 * minions, which the game recalculates from the main module alone.
 *
 * Iterating per cluster rather than a merged set is deliberate: a module
 * reached by two clusters (possible in a hand-edited layout) runs its effects
 * twice in the game, so it counts twice here.
 */
function sumGridEffects(entities: OdinNode, kind: string): Map<string, number> {
	const totals = new Map<string, number>();
	const owner = gridOwners(entities).find((o) => o.entityId === 'Ship');
	if (!owner) return totals;
	const view = snapshotGrid(owner.grid);
	const sim = simulateGrid(view);

	for (const cluster of sim.clusters) {
		const minionMain = cluster.main && moduleInfo(cluster.main.id)?.cls === 'SpawnMinionModuleData';
		const cells = minionMain ? [cluster.rootKey] : cluster.poweredMembers;
		for (const key of cells) {
			const module = view.modules.get(key);
			const info = moduleEffectsEntry(module?.id);
			if (!info) continue;
			const level = sim.levels.get(key) ?? info.level;
			const idx = Math.max(0, level - 1);
			for (const e of info.effects) {
				if (e.kind !== kind || !e.resource || !e.series) continue;
				totals.set(e.resource, (totals.get(e.resource) ?? 0) + seriesAt(e.series, idx));
			}
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
