import { effectFieldKey, effectFieldProblem, type EffectField } from '$lib/game/data';

/**
 * The shapes the player has painted themselves, kept in `localStorage`.
 *
 * These belong to the person, not to a save: the point of painting one is to
 * reuse it, so it has to outlive the module it was first put on and be offered
 * everywhere a shape can be chosen. Nothing here ever touches a save file — a
 * custom shape only reaches a save when it is picked in a chooser, at which
 * point it goes through the same path as a rolled one.
 */

const STORAGE_KEY = 'punk-save-editor:custom-fields';

/**
 * The app runs with `ssr = false`, but this module is imported at build time by
 * the prerender pass, where there is no `localStorage` — hence the feature test
 * rather than an assumption.
 */
const browser = typeof localStorage !== 'undefined';

/**
 * Anything unreadable is dropped rather than repaired. This is a convenience
 * cache, not user data we owe a migration to — and a malformed field would go
 * straight into a save, so the same invariant that guards the painter guards
 * the way back in (`effectFieldProblem`).
 */
function load(): EffectField[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(f): f is EffectField =>
				!!f &&
				typeof f === 'object' &&
				typeof (f as EffectField).width === 'number' &&
				typeof (f as EffectField).height === 'number' &&
				Array.isArray((f as EffectField).data) &&
				(f as EffectField).data.every((v) => v === 0 || v === 1) &&
				!effectFieldProblem(f as EffectField)
		);
	} catch {
		return [];
	}
}

let fields = $state<EffectField[]>(load());

function save() {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
	} catch {
		// A full or blocked storage costs the player persistence, not their work.
	}
}

export const customFields = {
	get list(): EffectField[] {
		return fields;
	},
	/** Adds a shape unless it is malformed or already saved. Returns whether it stuck. */
	add(field: EffectField): boolean {
		if (effectFieldProblem(field)) return false;
		const key = effectFieldKey(field);
		if (fields.some((f) => effectFieldKey(f) === key)) return false;
		fields = [...fields, field];
		save();
		return true;
	},
	remove(key: string): void {
		fields = fields.filter((f) => effectFieldKey(f) !== key);
		save();
	}
};
