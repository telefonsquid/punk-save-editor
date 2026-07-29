<script lang="ts">
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import DownloadOnlyNote from './DownloadOnlyNote.svelte';
	import { settings } from '$lib/editor/settings.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';

	// Asked once, right after a save is opened, because that is the only moment
	// the folder on disk is known to be exactly what the game last wrote. Every
	// later offer is a backup of something the editor has already touched.
	//
	// Three answers rather than two plus a checkbox: "don't ask again" attached
	// to a checkbox never says whether it remembers the box or the button that
	// was pressed with it. Here each button is its own whole answer.
	let { editor }: { editor: EditorState } = $props();

	const backups = $derived(editor.backups);
</script>

<Dialog bind:open={backups.asking} title="Back up current save?" width="32rem">
	<p class="text-muted text-ui-xs">
		One <code>.zip</code> per backup.
	</p>
	<!-- Three states, because "where does it go" has three different answers: a
	     folder that is already chosen, a folder about to be asked for, and — on a
	     browser with no filesystem access — no folder at all. That last one is not
	     a location worth printing; it is a limitation worth explaining, because it
	     is also the reason there is no Restore button on the bar behind this. -->
	<div class="mt-3">
		{#if !settings.folder}
			<p class="text-muted text-ui-xs">
				You'll be asked for a folder where all of your backups will be stored from now on.
			</p>
		{:else if settings.folder.restorable}
			<p class="text-muted text-ui-xs">
				Goes to <code class="text-stone">{settings.folder.label}</code>.
			</p>
		{:else}
			<DownloadOnlyNote />
		{/if}
	</div>

	{#if backups.error}
		<p class="mt-3 text-danger text-ui-xs">{backups.error}</p>
	{/if}

	{#snippet footer()}
		<!-- Turning the question off is the quietest control on the row: it is the
		     answer with a consequence beyond this load, and the one nobody should
		     hit by aiming for Skip. -->
		<Button
			variant="ghost"
			size="sm"
			onclick={() => {
				settings.setAskOnLoad(false);
				backups.dismissPrompt();
			}}
		>
			Never ask
		</Button>
		<div class="flex items-center gap-2 ml-auto">
			<Button variant="outline" size="sm" onclick={backups.dismissPrompt}>Skip</Button>
			<Button variant="primary" size="sm" onclick={backups.take}>Back up</Button>
		</div>
	{/snippet}
</Dialog>
