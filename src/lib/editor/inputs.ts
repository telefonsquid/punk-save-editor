/**
 * `oninput` handler factories that write straight into the raw save trees —
 * never `bind:value` into a proxied path (see the $state.raw rule in
 * state.svelte.ts). The version bump happens separately on `change`, via the
 * panels' event delegation, so in-progress decimal typing isn't clobbered.
 */

import type { ResourcePair } from '$lib/save/tree';
import { setIngredientCount } from '$lib/save/vault';
import type { EditorState } from './state.svelte';

/** Writes a finite number straight into the raw tree. */
export function numInput(target: object, prop: string | number) {
	return (e: Event) => {
		const el = e.currentTarget as HTMLInputElement;
		const n = Number(el.value);
		if (el.value !== '' && Number.isFinite(n)) {
			(target as Record<string | number, unknown>)[prop] = n;
		}
	};
}

/** For an ingredient row: writes the count into the vault by id, inserting the
 * ingredient if the player didn't own it yet (0 stays 0). */
export function ingredientInput(editor: EditorState, id: string) {
	return (e: Event) => {
		if (!editor.slot) return;
		const el = e.currentTarget as HTMLInputElement;
		const n = Number(el.value);
		if (el.value === '' || !Number.isFinite(n)) return;
		const v = Math.max(0, Math.round(n));
		if (v !== n) el.value = String(v);
		setIngredientCount(editor.slot.vault, id, v);
		editor.dirtyFiles.add('vault');
	};
}

/** Like numInput for a ship resource, clamped to [0, max]. Negative values
 * are known to crash the game on load, over-max gets clamped in play. */
export function shipResInput(editor: EditorState, pair: ResourcePair, max: number | undefined) {
	return (e: Event) => {
		const el = e.currentTarget as HTMLInputElement;
		const n = Number(el.value);
		if (el.value === '' || !Number.isFinite(n)) return;
		let v = Math.max(0, n);
		if (max !== undefined) v = Math.min(v, max);
		if (v !== n) el.value = String(v);
		pair.$v = v;
		editor.dirtyFiles.add('entities');
	};
}
