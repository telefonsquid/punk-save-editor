<script lang="ts">
	import Button from '../Button.svelte';
	import GridEditor from '../grid/GridEditor.svelte';
	import Section from '../Section.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { getModules } from '$lib/save/vault';

	// The whole Modules section is the door into the grid editor — the vault's
	// module cards were assimilated into its dock, so nothing is edited here.
	let { editor }: { editor: EditorState } = $props();

	let gridOpen = $state(false);

	// The grid lives in the entities file, which loads with the save; a save
	// without one has no ship and nothing to lay out.
	const hasGrid = $derived(editor.version < 0 || editor.loadedFiles.has('entities'));

	const vaultCount = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return 0;
		return getModules(editor.slot.vault).length;
	});
</script>

<Section title="Modules" plain>
	<div class="flex flex-col items-center gap-4">
		<Button variant="primary" disabled={!hasGrid} onclick={() => (gridOpen = true)}>
			Open grid editor
		</Button>
		<p class="text-center text-ui-xs text-muted">
			{#if hasGrid}
				The ship's grid and the vault's {vaultCount}
				{vaultCount === 1 ? 'module' : 'modules'} — moved, edited and added in one place.
			{:else}
				This save has no <code>entities</code> file, so there is no ship grid to edit.
			{/if}
		</p>
	</div>

	<GridEditor {editor} bind:open={gridOpen} />
</Section>
