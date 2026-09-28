/**
 * The showModal contract every `Dialog` shares: the open flag drives the
 * imperative call, with the arrival sound played over the same beat. The
 * closing half rides each dialog's own `close` event instead — Esc closes the
 * element itself and never flips the flag first. (The grid editor is not a
 * modal, so that the title bar stays live over it, and keeps its own.)
 */

import { sound } from '$lib/sound.svelte';

export function syncModal(dialog: HTMLDialogElement | null, open: boolean): void {
	if (!dialog) return;
	if (open && !dialog.open) {
		dialog.showModal();
		sound.play('open');
	} else if (!open && dialog.open) dialog.close();
}
