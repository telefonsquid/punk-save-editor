/**
 * The one list of decoded `ModuleEffect` kinds. The extractor
 * (scripts/extract-module-effects.ts) maps each C# effect subclass onto one of
 * these, check-data validates the generated JSON against the same list, and
 * the stat lines (module-stats.ts) switch over the union exhaustively — so a
 * game update that adds a ninth subclass fails `bun run check` instead of
 * silently dropping its stat line.
 */

export const EFFECT_KIND_VALUES = [
	'capacity',
	'regen',
	'drain',
	'shield',
	'weaponProperty',
	'explosion',
	'burn',
	'discharge'
] as const;

export type EffectKind = (typeof EFFECT_KIND_VALUES)[number];
