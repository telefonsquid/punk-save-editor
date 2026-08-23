/**
 * The showModal contract every modal shares (`Dialog.svelte` and the grid
 * editor's full-viewport dialog): the open flag drives the imperative call,
 * with the arrival sound played over the same beat. The closing half rides
 * each dialog's own `close` event instead — Esc closes the element itself and
 * never flips the flag first.
 */

import { sound } from '$lib/sound.svelte';

export function syncModal(dialog: HTMLDialogElement | null, open: boolean): void {
	if (!dialog) return;
	if (open && !dialog.open) {
		dialog.showModal();
		sound.play('open');
	} else if (!open && dialog.open) dialog.close();
}
