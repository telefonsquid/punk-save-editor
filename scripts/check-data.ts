/**
 * Cross-checks the generated game-data JSONs for consistency. Runs at the end
 * of `bun run extract`, and standalone as `bun run check:data`.
 *
 * The five files are extracted independently, so after a game update the real
 * risk is *drift between them*: a module that gained an effect but lost its
 * icon, a new resource referenced by an effect but missing from asset-names, a
 * renumbered enum leaking ordinals. Errors (exit 1) are relationships the app
 * relies on; warnings are known-lopsided game data worth eyeballing.
 */
import type { AssetInfo, ModuleEffectsEntry, ModuleInfo } from '../src/lib/game/data';
import { EFFECT_KIND_VALUES } from '../src/lib/game/effect-kinds';
import assetNames from '../src/lib/game/asset-names.json';
import itemIcons from '../src/lib/game/item-icons.json';
import moduleEffects from '../src/lib/game/module-effects.json';
import moduleInfo from '../src/lib/game/module-info.json';
import resourceIcons from '../src/lib/game/resource-icons.json';
import uiSounds from '../src/lib/game/ui-sounds.json';

const assets = assetNames as Record<string, AssetInfo>;
const icons = itemIcons as Record<string, string>;
const resIcons = resourceIcons as Record<string, { icon?: string; bar?: string }>;
const infos = moduleInfo as unknown as Record<string, ModuleInfo>;
const effects = moduleEffects.modules as unknown as Record<string, ModuleEffectsEntry>;

const errors: string[] = [];
const warnings: string[] = [];

const byCategory = (cat: string) =>
	Object.keys(assets).filter((id) => assets[id].category === cat);

const modules = byCategory('Module');
const resources = new Set(byCategory('Resource'));

// --- module-info, module-effects and asset-names must agree on the module set ---
for (const id of modules) {
	if (!(id in infos)) errors.push(`module ${id} (${assets[id].displayName}) missing from module-info.json`);
	if (!(id in effects)) errors.push(`module ${id} (${assets[id].displayName}) missing from module-effects.json`);
}
for (const id of Object.keys(infos)) {
	if (assets[id]?.category !== 'Module') errors.push(`module-info.json has ${id}, which asset-names does not list as a Module`);
}
for (const id of Object.keys(effects)) {
	if (assets[id]?.category !== 'Module') errors.push(`module-effects.json has ${id}, which asset-names does not list as a Module`);
}

// --- equippable modules (the picker's set) need a category ---
// The game's ModuleData.Equippable = displayName AND icon; a named module
// without an icon is an embedded enemy part, which is normal.
let unequippable = 0;
for (const id of modules) {
	const equippable = !!assets[id].displayName && id in icons;
	if (!equippable) {
		unequippable++;
		continue;
	}
	if (!infos[id]?.type) warnings.push(`equippable module ${assets[id].displayName} (${id}) has no category (ModuleType)`);
}

// --- every referenced resource must exist, and should have a HUD icon ---
function checkResource(ref: string | null | undefined, where: string) {
	if (!ref) return;
	if (!resources.has(ref)) errors.push(`${where} references unknown resource '${ref}'`);
	else if (!resIcons[ref]?.icon) warnings.push(`resource '${ref}' (${where}) has no HUD icon`);
}
for (const [id, info] of Object.entries(infos)) {
	checkResource(info.resource, `module-info ${id}`);
	checkResource(info.weapon?.damageType as string | undefined, `weapon of ${id}`);
	checkResource(info.weapon?.costResource as string | undefined, `weapon of ${id}`);
	// An effect field must be odd on both axes so the module sits in the middle
	// cell — the game itself logs "Power core has invalid size" otherwise — and
	// the bool grid has to match the dimensions it claims.
	for (const field of [...info.powerCores, ...info.levelFields]) {
		if (field.width % 2 === 0 || field.height % 2 === 0) {
			errors.push(`effect field of ${id} is ${field.width}x${field.height}, must be odd-sized`);
		}
		if (field.data.length !== field.width * field.height) {
			errors.push(`effect field of ${id} has ${field.data.length} cells, expected ${field.width * field.height}`);
		}
	}
}
const KNOWN_KINDS = new Set<string>(EFFECT_KIND_VALUES);
for (const [id, m] of Object.entries(effects)) {
	for (const e of m.effects) {
		checkResource(e.resource, `effect of ${id}`);
		checkResource(e.cost?.resource, `effect cost of ${id}`);
		if (!KNOWN_KINDS.has(e.kind)) errors.push(`module ${id} has unknown effect kind '${e.kind}'`);
		// The decode step writes '#N' when an enum ordinal is outside its name
		// table — that means TARGET_PROPERTY in extract-module-effects.ts is stale.
		const target = e.extra?.targetProperty;
		if (typeof target === 'string' && target.startsWith('#')) {
			errors.push(`module ${id} has unnamed weapon property ${target} — update TARGET_PROPERTY`);
		}
	}
}

// --- slot-type level deltas must point at real slot types ---
for (const id of Object.keys(moduleEffects.slotLevelDeltas)) {
	if (assets[id]?.category !== 'SlotType') {
		errors.push(`slotLevelDeltas has ${id}, which asset-names does not list as a SlotType`);
	}
}

// --- consumables/ingredients shown in the editor need icons ---
for (const id of [...byCategory('Consumable'), ...byCategory('Ingredient')]) {
	if (!(id in icons)) warnings.push(`${assets[id].category} ${id} has no item icon`);
}

// --- the borrowed UI sounds must stay small enough to inline ---
// Each is a trimmed blip of a couple of hundred milliseconds. If a game audio
// pass repoints one of these names at a music bed, the app would carry it in the
// bundle and play it over a click, so size is the thing worth watching. Whether
// a sound went *missing* is caught twice already — the extractor warns, and
// `bun run check` fails wherever the vanished key is played.
const MAX_CLIP_BYTES = 64 * 1024;
let soundBytes = 0;
for (const [key, sfx] of Object.entries(uiSounds as Record<string, { sfx: string; clips: { uri: string }[] }>)) {
	for (const clip of sfx.clips) {
		// A data URI's payload is base64, so three bytes per four characters.
		const bytes = Math.floor((clip.uri.length - clip.uri.indexOf(',') - 1) * 0.75);
		soundBytes += bytes;
		if (bytes > MAX_CLIP_BYTES) {
			warnings.push(`ui sound ${key} (${sfx.sfx}) is ${Math.round(bytes / 1024)} kB — too long for a UI blip?`);
		}
	}
}

const counts = Object.entries(
	Object.values(assets).reduce<Record<string, number>>((acc, a) => {
		acc[a.category] = (acc[a.category] ?? 0) + 1;
		return acc;
	}, {})
)
	.sort((a, b) => b[1] - a[1])
	.map(([category, n]) => `${category} ${n}`)
	.join(', ');
console.log(`check-data: ${Object.keys(assets).length} assets (${counts})`);
console.log(
	`  ${modules.length} modules (${modules.length - unequippable} equippable), ` +
		`${Object.keys(icons).length} item icons, ${Object.keys(resIcons).length} resource icon sets`
);
console.log(
	`  ${Object.keys(uiSounds).length} UI sounds, ${Math.round(soundBytes / 1024)} kB of audio`
);
for (const w of warnings) console.warn(`  warning: ${w}`);
for (const e of errors) console.error(`  ERROR: ${e}`);
console.log(`  ${errors.length} errors, ${warnings.length} warnings`);
if (errors.length > 0) process.exit(1);
