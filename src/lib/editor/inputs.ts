/**
 * The one write path from input fields into the raw save trees — never
 * `bind:value` into a proxied path (see the $state.raw rule in
 * state.svelte.ts). Every handler owns the whole editing rule for its field:
 * the empty/NaN guard, the clamp, and marking the right file dirty. Panels
 * declare bounds here instead of implementing them.
 *
 * The version bump happens separately on `change`, via the panels' event
 * delegation, so in-progress decimal typing isn't clobbered.
 */

import type { ResourcePair } from '$lib/save/tree';
import { setIngredientCount } from '$lib/save/vault';
import type { EditorState } from './state.svelte';

export interface NumInputOpts {
	min?: number;
	max?: number;
	/** Round to an integer, for fields the game stores as ints. */
	round?: boolean;
	/** Save file this field belongs to, marked dirty on every write. */
	file: string;
}

/** The shared guard and clamp: the field's number, or null while the text
 * isn't an edit to apply (empty or not a number). A clamped value is written
 * back into the field so the input shows what the tree got. */
function readNum(el: HTMLInputElement, opts: NumInputOpts): number | null {
	if (el.value === '') return null; // cleared to retype | Number('') would be 0
	const n = Number(el.value);
	if (!Number.isFinite(n)) return null;
	let v = opts.round ? Math.round(n) : n;
	if (opts.min !== undefined) v = Math.max(opts.min, v);
	if (opts.max !== undefined) v = Math.min(opts.max, v);
	if (v !== n) el.value = String(v);
	return v;
}

/** `oninput` factory writing a number straight into the raw tree. */
export function numInput(
	editor: EditorState,
	target: object,
	prop: string | number,
	opts: NumInputOpts
) {
	return (e: Event) => {
		const v = readNum(e.currentTarget as HTMLInputElement, opts);
		if (v === null) return;
		(target as Record<string | number, unknown>)[prop] = v;
		editor.dirtyFiles.add(opts.file);
	};
}

/** For an ingredient row: writes the count into the vault by id, inserting the
 * ingredient if the player didn't own it yet (0 stays 0). */
export function ingredientInput(editor: EditorState, id: string) {
	return (e: Event) => {
		if (!editor.slot) return;
		const v = readNum(e.currentTarget as HTMLInputElement, { min: 0, round: true, file: 'vault' });
		if (v === null) return;
		setIngredientCount(editor.slot.vault, id, v);
		editor.dirtyFiles.add('vault');
	};
}

/** Sets a ship tank, clamped to [0, max] as the game does — a negative value
 * crashes the game on load, over-max gets clamped in play. Not an event
 * factory: the tank bars pass the clicked value as a number. */
export function setShipResource(
	editor: EditorState,
	pair: ResourcePair,
	max: number | undefined,
	next: number
): void {
	let v = Math.max(0, next);
	if (max !== undefined) v = Math.min(v, max);
	pair.$v = v;
	editor.touch('entities');
}
