/**
 * Static knowledge about the game, extracted from the installed game's assets
 * (`bun run extract` regenerates the JSON files here — see docs/migration.md).
 *
 * Nothing in this module touches a save file: it answers "what is asset X"
 * questions (names, categories, colours, module effects) for whoever asks —
 * the save editor UI today, the module-grid recreation later. Save-tree
 * loading and accessors live in `$lib/save/`.
 */

import assetNames from './asset-names.json';
import itemIcons from './item-icons.json';
import moduleEffectsJson from './module-effects.json';
import moduleInfoJson from './module-info.json';

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

// ---------------------------------------------------------------------------
// Module effects (module-effects.json, decoded from Odin serializationData)
// ---------------------------------------------------------------------------

/** A `FloatSeries` magnitude: `base (+|*) change` per level above the first. */
export interface Series {
	base: number;
	method: string;
	change: number;
}

/**
 * One decoded `ModuleEffect` (see scripts/extract-module-effects.ts, which
 * flattens all eight C# subclasses onto this shape). `kind` is `capacity`,
 * `regen`, `drain`, `shield`, `weaponProperty`, `explosion`, `burn` or
 * `discharge`.
 */
export interface ModuleEffectInfo {
	kind: string;
	resource: string | null;
	series: Series | null;
	cost?: { amount: number; resource: string | null };
	extra?: Record<string, number | boolean | string>;
}

export interface ModuleEffectsEntry {
	level: number;
	canBeBoosted: boolean;
	effects: ModuleEffectInfo[];
}

const effectsTable = moduleEffectsJson.modules as unknown as Record<string, ModuleEffectsEntry>;

/** Level delta a grid slot type applies to the module sitting on it (LevelUp slots). */
export const slotLevelDeltas = moduleEffectsJson.slotLevelDeltas as Record<string, number>;

/** The full effects entry of a module id, or null (used by the grid walk). */
export function moduleEffectsEntry(id: string | null | undefined): ModuleEffectsEntry | null {
	return (id ? effectsTable[id] : null) ?? null;
}

/** The effects of a module id, in the order the game declares them. */
export function moduleEffects(id: string | null | undefined): ModuleEffectInfo[] {
	return moduleEffectsEntry(id)?.effects ?? [];
}

/** The level a module's effects are evaluated at when nothing boosts it. */
export function moduleLevel(id: string | null | undefined): number {
	return moduleEffectsEntry(id)?.level ?? 1;
}

/** `FloatSeries.GetElement`: the effect's magnitude at a zero-based level index. */
export function seriesAt(e: Series, idx: number): number {
	return e.method === 'mul' ? e.base * Math.pow(e.change, idx) : e.base + e.change * idx;
}

// ---------------------------------------------------------------------------
// Module info (module-info.json, plain typetree data)
// ---------------------------------------------------------------------------

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
