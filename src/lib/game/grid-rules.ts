/**
 * The module-grid simulation, ported from the decompiled game — `ModuleGrid`,
 * `ModuleCluster`, `GridHelper` and `ModuleGridPreview` (docs/grid-editor.md
 * has the condensed model, docs/game-code.md how to get back into the source).
 *
 * Pure functions over a plain snapshot: no Odin nodes, no Svelte state. The
 * save layer builds snapshots (`$lib/save/grid`), the grid editor renders what
 * this computes, and the ship walk asks it which modules actually count.
 * Every algorithm here mirrors its game counterpart exactly — including
 * iteration order, which the power budget genuinely depends on — so that what
 * the editor shows is what the game will do with the save.
 */

import { moduleEffectsEntry, moduleInfo, slotTypeInfo, slotTypes, type EffectField } from './data';

/** One grid cell as a map key — `"x,y"` in the game's own coordinates (y up). */
export type CellKey = string;

export function cellKey(x: number, y: number): CellKey {
	return `${x},${y}`;
}

export function parseCell(key: CellKey): { x: number; y: number } {
	const comma = key.indexOf(',');
	return { x: Number(key.slice(0, comma)), y: Number(key.slice(comma + 1)) };
}

/**
 * A module as the grid sees it — the memento's fields with the effect-field
 * nodes already decoded. The save layer's `GridModuleRef` extends this with
 * the raw node it was read from.
 */
export interface GridModule {
	id: string | null;
	north: boolean;
	east: boolean;
	south: boolean;
	west: boolean;
	powerCore: EffectField | null;
	levelField: EffectField | null;
	powerLevel: number;
}

/** The whole grid as plain data: the save's two dictionaries, keyed by cell. */
export interface GridSnapshot {
	slotTypes: Map<CellKey, string>;
	modules: Map<CellKey, GridModule>;
}

export type ClusterName =
	| 'passive'
	| 'primaryWeapon'
	| 'secondaryWeapon'
	| 'active1'
	| 'active2'
	| 'active3';

/**
 * The six fixed cluster roots (`ModuleGrid.MainSlotPositions`), in the game's
 * order — validation reports overlap against *earlier* clusters, so the order
 * is part of the behaviour. The ship sits at (50,50); the gadget row's smaller
 * y renders *below* it once the y axis is flipped for the screen.
 */
export const MAIN_SLOTS: { name: ClusterName; x: number; y: number }[] = [
	{ name: 'passive', x: 50, y: 50 },
	{ name: 'primaryWeapon', x: 46, y: 50 },
	{ name: 'secondaryWeapon', x: 54, y: 50 },
	{ name: 'active1', x: 46, y: 46 },
	{ name: 'active2', x: 50, y: 46 },
	{ name: 'active3', x: 54, y: 46 }
];

/** The SHIP module's cell — the one module that can never be moved. */
export const SHIP_CELL: CellKey = cellKey(50, 50);

const MAIN_CELLS = new Set(MAIN_SLOTS.map((slot) => cellKey(slot.x, slot.y)));

/** Whether a cell is one of the six cluster roots. */
export function isMainCell(key: CellKey): boolean {
	return MAIN_CELLS.has(key);
}

export type ConnectionSide = 'north' | 'east' | 'south' | 'west';

/** The four neighbour directions in the game's DFS order (up, right, down,
 * left) — cluster membership order follows it, and the power budget follows
 * membership order. */
export const DIRECTIONS: {
	dx: number;
	dy: number;
	side: ConnectionSide;
	opposite: ConnectionSide;
}[] = [
	{ dx: 0, dy: 1, side: 'north', opposite: 'south' },
	{ dx: 1, dy: 0, side: 'east', opposite: 'west' },
	{ dx: 0, dy: -1, side: 'south', opposite: 'north' },
	{ dx: -1, dy: 0, side: 'west', opposite: 'east' }
];

/**
 * `GridHelper.CollectConnectedModulesRecursive`: depth-first from a cell,
 * crossing an edge only when *both* sides have their connection on. Insertion
 * order of `results` is the DFS pre-order the game gets from its recursion.
 */
function collectConnected(
	modules: Map<CellKey, GridModule>,
	x: number,
	y: number,
	results: Map<CellKey, GridModule>
): void {
	const key = cellKey(x, y);
	const module = modules.get(key);
	if (!module || results.has(key)) return;
	results.set(key, module);
	for (const dir of DIRECTIONS) {
		const neighbour = modules.get(cellKey(x + dir.dx, y + dir.dy));
		if (neighbour && module[dir.side] && neighbour[dir.opposite]) {
			collectConnected(modules, x + dir.dx, y + dir.dy, results);
		}
	}
}

/**
 * `ModuleEffectField.GetPositionsRelative`: the cells a field covers, relative
 * to the module's own cell — **including the game's `y * height + x` indexing**,
 * which only reads correctly for square fields and is why `effectFieldProblem`
 * refuses anything else. +y is up, exactly as the grid stores cells.
 */
export function fieldOffsets(field: EffectField): { dx: number; dy: number }[] {
	const offsets: { dx: number; dy: number }[] = [];
	for (let x = 0; x < field.width; x++) {
		for (let y = 0; y < field.height; y++) {
			if (field.data[y * field.height + x]) {
				offsets.push({ dx: x - (field.width >> 1), dy: y - (field.height >> 1) });
			}
		}
	}
	return offsets;
}

/** The absolute cells a field covers when its module sits at (x, y). */
export function fieldCells(field: EffectField, x: number, y: number): Set<CellKey> {
	const cells = new Set<CellKey>();
	for (const { dx, dy } of fieldOffsets(field)) cells.add(cellKey(x + dx, y + dy));
	return cells;
}

// ---------------------------------------------------------------------------
// Clusters & power
// ---------------------------------------------------------------------------

export interface ClusterSim {
	name: ClusterName;
	root: { x: number; y: number };
	rootKey: CellKey;
	/** Connected cells in DFS order — the order the power budget is spent in. */
	members: CellKey[];
	/** The main module, when one sits on the root cell. */
	main: GridModule | null;
	/** Members whose own cell this cluster powers — the modules whose effects
	 * run (`ConnectedAndPoweredModules`), in member order. */
	poweredMembers: CellKey[];
	/** Power cores attached beyond the main's own — the badge's left number. */
	attachedCores: number;
	/** The main module's power level — the badge's right number, and the cap
	 * on how many attached cores actually project their field. */
	coreBudget: number;
	/** Cells covered by the cluster's active cores, powerable or not. */
	reserved: Set<CellKey>;
	/** Covered cells whose slot type can be powered. */
	powered: Set<CellKey>;
}

export interface GridSim {
	clusters: ClusterSim[];
	/** Union of every cluster's powered cells. */
	poweredSlots: Set<CellKey>;
	/** Module cells passing `ModuleGrid.IsPoweredAndConnected` — powered by any
	 * cluster and a member of any cluster, not necessarily the same one. Gates
	 * whether a booster's field grants its +1. */
	poweredAndConnected: Set<CellKey>;
	/** Level bonus per cell: LevelUp slots plus powered boosters' fields. */
	levelDeltas: Map<CellKey, number>;
	/** Effective level per module cell — base level plus its cell's delta for
	 * boostable modules, base level alone for the rest. */
	levels: Map<CellKey, number>;
}

/**
 * The full simulation pass the game runs in `OnModulesChanged`: connectivity
 * per cluster, then power, then level deltas — deltas last because a booster
 * only grants its +1 while itself powered and connected.
 */
export function simulateGrid(snapshot: GridSnapshot): GridSim {
	const clusters = MAIN_SLOTS.map((slot) => {
		const membersMap = new Map<CellKey, GridModule>();
		collectConnected(snapshot.modules, slot.x, slot.y, membersMap);
		const rootKey = cellKey(slot.x, slot.y);
		const main = snapshot.modules.get(rootKey) ?? null;

		// ModuleCluster.RefreshPoweredSlots: each member's core projects its
		// field while attached cores are under the main's budget. Only modules
		// carrying a core count against the budget, the main's own is free, and
		// a core is all or nothing — the count moves between modules, not cells.
		const reserved = new Set<CellKey>();
		const powered = new Set<CellKey>();
		let attached = 0;
		const coreBudget = main?.powerLevel ?? 0;
		for (const [key, module] of membersMap) {
			if (!module.powerCore) continue;
			const { x, y } = parseCell(key);
			for (const { dx, dy } of fieldOffsets(module.powerCore)) {
				const cell = cellKey(x + dx, y + dy);
				if (attached < coreBudget) {
					reserved.add(cell);
					if (slotTypeInfo(snapshot.slotTypes.get(cell)).canBePowered) powered.add(cell);
				}
			}
			if (key !== rootKey) attached++;
		}

		const members = [...membersMap.keys()];
		return {
			name: slot.name,
			root: { x: slot.x, y: slot.y },
			rootKey,
			members,
			main,
			poweredMembers: members.filter((key) => powered.has(key)),
			attachedCores: attached,
			coreBudget,
			reserved,
			powered
		} satisfies ClusterSim;
	});

	const poweredSlots = new Set<CellKey>();
	for (const cluster of clusters) for (const cell of cluster.powered) poweredSlots.add(cell);

	// ModuleGrid.IsPoweredAndConnected asks all clusters for each half, so a
	// module powered by one cluster while connected to another still passes —
	// a layout validation would refuse, but free mode has to simulate honestly.
	const memberCells = new Set<CellKey>();
	for (const cluster of clusters) for (const cell of cluster.members) memberCells.add(cell);
	const poweredAndConnected = new Set<CellKey>();
	for (const key of snapshot.modules.keys()) {
		if (poweredSlots.has(key) && memberCells.has(key)) poweredAndConnected.add(key);
	}

	// The level-delta pass of OnModulesChanged: LevelUp slots unconditionally,
	// booster fields only from powered-and-connected boosters.
	const levelDeltas = new Map<CellKey, number>();
	for (const [key, typeId] of snapshot.slotTypes) {
		const delta = slotTypeInfo(typeId).levelDelta ?? 0;
		if (delta) levelDeltas.set(key, (levelDeltas.get(key) ?? 0) + delta);
	}
	for (const [key, module] of snapshot.modules) {
		if (!module.levelField || !poweredAndConnected.has(key)) continue;
		const { x, y } = parseCell(key);
		for (const { dx, dy } of fieldOffsets(module.levelField)) {
			const cell = cellKey(x + dx, y + dy);
			levelDeltas.set(cell, (levelDeltas.get(cell) ?? 0) + 1);
		}
	}

	const levels = new Map<CellKey, number>();
	for (const [key, module] of snapshot.modules) {
		const entry = moduleEffectsEntry(module.id);
		const base = entry?.level ?? 1;
		levels.set(key, entry?.canBeBoosted !== false ? base + (levelDeltas.get(key) ?? 0) : base);
	}

	return { clusters, poweredSlots, poweredAndConnected, levelDeltas, levels };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type GridErrorKind =
	| 'slotType'
	| 'connection'
	| 'mainConnected'
	| 'clustersOverlap'
	| 'augmentation';

export interface GridError {
	kind: GridErrorKind;
	x: number;
	y: number;
	/** Connection errors: the offending edge's direction. */
	dx?: number;
	dy?: number;
}

/** The game's own log line per error kind (`ModuleGridScreen`). */
export const GRID_ERROR_MESSAGES: Record<GridErrorKind, string> = {
	slotType: 'Incompatible slot',
	connection: 'Incompatible connections',
	mainConnected: 'Clusters cannot be connected',
	clustersOverlap: 'Clusters cannot overlap',
	augmentation: 'Incompatible augmentation'
};

/**
 * `ModuleGridPreview.ValidateMove`: the errors the whole layout would have
 * after a hypothetical move — origin emptied, target overwritten (a module
 * already there is displaced, not swapped), every module re-checked.
 */
export function validateMove(
	snapshot: GridSnapshot,
	module: GridModule,
	from: CellKey | null,
	to: CellKey
): GridError[] {
	const modules = new Map(snapshot.modules);
	if (from) modules.delete(from);
	modules.set(to, module);
	return validateGrid({ slotTypes: snapshot.slotTypes, modules });
}

/**
 * `ModuleGridPreview.IsValid`: the five checks the game runs over the whole
 * grid after a hypothetical move. The caller builds the moved snapshot; the
 * game refuses the drop on any error, the editor's free mode just shows them.
 */
export function validateGrid(snapshot: GridSnapshot): GridError[] {
	const errors: GridError[] = [];

	// Per module: its slot must accept its type, and every edge shared with a
	// neighbour must agree — both connected or both not.
	for (const [key, module] of snapshot.modules) {
		const { x, y } = parseCell(key);
		const slot = slotTypeInfo(snapshot.slotTypes.get(key));
		const typeName = moduleInfo(module.id)?.type?.name;
		if (!typeName || !slot.compatibleModuleTypes.includes(typeName)) {
			errors.push({ kind: 'slotType', x, y });
		}
		for (const dir of DIRECTIONS) {
			const neighbour = snapshot.modules.get(cellKey(x + dir.dx, y + dir.dy));
			if (neighbour && module[dir.side] !== neighbour[dir.opposite]) {
				errors.push({ kind: 'connection', x, y, dx: dir.dx, dy: dir.dy });
			}
		}
	}

	// Per cluster, in main-slot order: no second main module in the flood fill,
	// core coverage must not touch *earlier* clusters' coverage (within one
	// cluster overlap is fine), and every member must be a type the main module
	// supports as an augmentation.
	const covered = new Set<CellKey>();
	for (const slot of MAIN_SLOTS) {
		const rootKey = cellKey(slot.x, slot.y);
		const members = new Map<CellKey, GridModule>();
		collectConnected(snapshot.modules, slot.x, slot.y, members);
		const root = snapshot.modules.get(rootKey);
		const clusterCovered = new Set<CellKey>();
		for (const [key, module] of members) {
			const { x, y } = parseCell(key);
			if (key !== rootKey && MAIN_CELLS.has(key)) {
				errors.push({ kind: 'mainConnected', x, y });
			}
			if (module.powerCore) {
				for (const { dx, dy } of fieldOffsets(module.powerCore)) {
					const cell = cellKey(x + dx, y + dy);
					if (covered.has(cell)) {
						errors.push({ kind: 'clustersOverlap', ...parseCell(cell) });
					}
					clusterCovered.add(cell);
				}
			}
			if (key !== rootKey && root) {
				const memberType = moduleInfo(module.id)?.type?.name;
				if (!memberType || !(moduleInfo(root.id)?.augments ?? []).includes(memberType)) {
					errors.push({ kind: 'augmentation', x, y });
				}
			}
		}
		for (const cell of clusterCovered) covered.add(cell);
	}

	return errors;
}

// ---------------------------------------------------------------------------
// Slot generation
// ---------------------------------------------------------------------------

/** `UnityEngine.Random.Range` for ints: uniform in [min, max). */
function randomRange(min: number, max: number): number {
	return min + Math.floor(Math.random() * (max - min));
}

/**
 * `ModuleGrid.RandomizeSlots` — rerolls the generated special cells in place.
 * The game only ever runs this on a fresh grid, so existing cells of the
 * generated types are cleared first; the fixed main-slot entries stay and make
 * rolls onto them retry, exactly as the game's seeded dictionary does. Per
 * generated type: `countInPlacementRect` cells into each
 * `gridPlacementRectSize` rect tiling [0,100)², up to 100 collision retries
 * per rect, then the 3×3 around each main slot is cleared (root cell kept).
 */
export function randomizeSlots(
	slots: Map<CellKey, string>,
	random: (min: number, max: number) => number = randomRange
): void {
	const generated = Object.entries(slotTypes).filter(
		([, info]) => info.countInPlacementRect > 0 && info.gridPlacementRectSize > 0
	);
	const generatedIds = new Set(generated.map(([id]) => id));
	for (const [key, typeId] of [...slots]) {
		if (generatedIds.has(typeId)) slots.delete(key);
	}

	for (const [typeId, info] of generated) {
		const size = info.gridPlacementRectSize;
		for (let i = 0; i < 100; i += size) {
			for (let j = 0; j < 100; j += size) {
				let placed = 0;
				let misses = 0;
				while (placed < info.countInPlacementRect && misses < 100) {
					const key = cellKey(random(i, i + size), random(j, j + size));
					if (slots.has(key)) {
						misses++;
						continue;
					}
					slots.set(key, typeId);
					placed++;
				}
			}
		}
		// The game clears the root neighbourhoods inside the per-type loop too.
		for (const slot of MAIN_SLOTS) {
			for (let dx = -1; dx <= 1; dx++) {
				for (let dy = -1; dy <= 1; dy++) {
					if (dx !== 0 || dy !== 0) slots.delete(cellKey(slot.x + dx, slot.y + dy));
				}
			}
		}
	}
}
