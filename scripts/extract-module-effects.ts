/**
 * Step 2 of regenerating src/lib/game/module-effects.json: decodes the Odin
 * binary payloads dumped by extract-module-effects.py into every effect a
 * module carries.
 *
 * The eight `ModuleEffect` subclasses in the game are all the same shape: one
 * `FloatSeries` magnitude (baseValue / increaseMethod / change, evaluated at the
 * module's level - 1), usually a `Resource` reference, and a handful of flat
 * scalars. They differ only in what those fields are *called*, so EFFECT_KINDS
 * maps each C# type onto the common shape and everything downstream — the
 * capacity/regen grid walk and the stat lines the UI prints — reads that shape.
 *
 * A new effect type in a game update shows up as an "unknown effect" warning
 * rather than silently vanishing; add it to EFFECT_KINDS, with its `kind`
 * registered in src/lib/game/effect-kinds.ts (the type check then demands a
 * stat line for it in module-stats.ts).
 *
 *     bun scripts/extract-module-effects.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ModuleEffectInfo, Series } from '../src/lib/game/data';
import type { EffectKind } from '../src/lib/game/effect-kinds';
import { OdinBinaryReader, isNode } from '../src/lib/save/odin';
import type { OdinValue } from '../src/lib/save/odin';

const here = fileURLToPath(new URL('.', import.meta.url));
const raw = JSON.parse(readFileSync(`${here}/module-effects-raw.json`, 'utf8'));

interface RawModule {
	name: string;
	level: number;
	canBeBoosted: boolean;
	bytes: string;
	refs: { name: string | null; id: string | null }[];
}

/**
 * C# effect type -> which field holds the magnitude and which holds the
 * resource. `cost` names the per-projectile cost field when the effect has one.
 * The `kind`s come from the shared union in src/lib/game/effect-kinds.ts, so a
 * new subclass added here without a stat line fails `bun run check`.
 */
const EFFECT_KINDS: Record<
	string,
	{ kind: EffectKind; series: string; resource?: string; cost?: string; extra?: string[] }
> = {
	ModifyResourceCapacity: { kind: 'capacity', series: 'delta', resource: 'resource' },
	ResourceAutoChargeEffect: { kind: 'regen', series: 'rechargeRate', resource: 'resource' },
	DrainResourceEffect: { kind: 'drain', series: 'drainRate', resource: 'resource' },
	AddShieldEffect: { kind: 'shield', series: 'effectiveness', resource: 'resource' },
	ModifyWeaponProperty: {
		kind: 'weaponProperty',
		series: 'value',
		extra: ['targetProperty', 'operation', 'deltaCalculationMode']
	},
	AddExplosionEffect: {
		kind: 'explosion',
		series: 'damageAmount',
		resource: 'damageType',
		cost: 'costPerProjectile',
		extra: ['explosionRadiusIncrement', 'addImpactExplosion', 'addTimeoutExplosion']
	},
	AddBurnEffect: { kind: 'burn', series: 'amount', cost: 'costPerProjectile' },
	AddDischargeEffect: {
		kind: 'discharge',
		series: 'damageIncrement',
		cost: 'costPerProjectile',
		extra: ['chainLengthIncrement', 'impact', 'timeout']
	}
};

/** ModifyWeaponProperty's enums, so the UI can name what a mod changes. */
const TARGET_PROPERTY = [
	'Fire rate',
	'Burst size',
	'Burst delay',
	'Projectiles',
	'Spread',
	'Angle variance',
	'Angle offset',
	'Knockback',
	'Cost',
	'Range',
	'Speed',
	'Damage'
];
const OPERATION = ['add', 'mul'];

const modules: Record<
	string,
	{ level: number; canBeBoosted: boolean; effects: ModuleEffectInfo[] }
> = {};
const unknown = new Set<string>();

/** Resolves an Odin external reference (`$ext` index) to a resource id. */
function extRef(value: unknown, mod: RawModule): string | null {
	if (!value || typeof value !== 'object' || !('$ext' in value)) return null;
	const idx = (value as { $ext: unknown }).$ext;
	if (typeof idx !== 'number') return null;
	return mod.refs[idx]?.id ?? mod.refs[idx]?.name ?? null;
}

function series(node: unknown): Series | null {
	if (!isNode(node)) return null;
	return {
		base: (node.baseValue as number) ?? 0,
		method: node.increaseMethod === 1 || node.increaseMethod === 'Multiply' ? 'mul' : 'add',
		change: (node.change as number) ?? 0
	};
}

for (const [guid, mod] of Object.entries(raw.modules as Record<string, RawModule>)) {
	const bytes = Uint8Array.from(atob(mod.bytes), (c) => c.charCodeAt(0));
	const root = OdinBinaryReader.parseMembers(bytes);
	const effectsList = root.effects;
	const items: OdinValue[] =
		isNode(effectsList) && Array.isArray(effectsList.$0) ? effectsList.$0 : [];
	const effects: ModuleEffectInfo[] = [];
	for (const eff of items) {
		if (!isNode(eff)) continue;
		const type = eff.$type?.split(',')[0] ?? '';
		const spec = EFFECT_KINDS[type];
		if (!spec) {
			unknown.add(type);
			continue;
		}
		const info: ModuleEffectInfo = {
			kind: spec.kind,
			resource: spec.resource ? extRef(eff[spec.resource], mod) : null,
			series: series(eff[spec.series])
		};
		if (spec.cost) {
			info.cost = {
				amount: (eff[spec.cost] as number) ?? 0,
				resource: extRef(eff.costResource, mod)
			};
		}
		if (spec.extra) {
			const extra: Record<string, number | boolean | string> = {};
			for (const key of spec.extra) {
				const v = eff[key];
				if (typeof v === 'bigint') extra[key] = Number(v);
				else if (typeof v === 'number' || typeof v === 'boolean') extra[key] = v;
			}
			// Name the two enums rather than leaking their ordinals to the UI.
			if (typeof extra.targetProperty === 'number') {
				extra.targetProperty = TARGET_PROPERTY[extra.targetProperty] ?? `#${extra.targetProperty}`;
			}
			if (typeof extra.operation === 'number') {
				extra.operation = OPERATION[extra.operation] ?? 'add';
			}
			if (Object.keys(extra).length) info.extra = extra;
		}
		if ((spec.resource || spec.kind === 'capacity') && !info.resource) {
			throw new Error(`${mod.name}: unresolvable ${type} resource`);
		}
		effects.push(info);
	}
	modules[guid] = { level: mod.level, canBeBoosted: mod.canBeBoosted, effects };
}

const slotLevelDeltas: Record<string, number> = {};
for (const [id, st] of Object.entries(raw.slotTypes as Record<string, { levelDelta: number }>)) {
	if (st.levelDelta) slotLevelDeltas[id] = st.levelDelta;
}

writeFileSync(
	`${here}/../src/lib/game/module-effects.json`,
	JSON.stringify({ modules, slotLevelDeltas }, null, 1)
);

const counts = new Map<string, number>();
for (const m of Object.values(modules)) {
	for (const e of m.effects) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
}
console.log(`wrote module-effects.json: ${Object.keys(modules).length} modules`);
for (const [kind, n] of [...counts].sort((a, b) => b[1] - a[1])) {
	console.log(`  ${String(n).padStart(4)} ${kind}`);
}
if (unknown.size) console.warn(`  UNKNOWN effect types (add to EFFECT_KINDS): ${[...unknown]}`);
