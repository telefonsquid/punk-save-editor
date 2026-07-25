<script lang="ts">
	import Button from '../Button.svelte';
	import ConsumableWheel from '../ConsumableWheel.svelte';
	import ItemIcon from '../ItemIcon.svelte';
	import Section from '../Section.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { assetsByCategory, displayName } from '$lib/game/data';
	import { addConsumable, getConsumables } from '$lib/save/slot';

	let { editor }: { editor: EditorState } = $props();

	const allConsumables = assetsByCategory('Consumable');

	const consumables = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return [];
		return [...getConsumables(editor.slot.vault)];
	});

	// A consumable can be added only if the vault doesn't already hold a slot of it.
	const addableConsumables = $derived(
		allConsumables.filter(({ id }) => !consumables.some((c) => c.consumableId === id))
	);

	function add(id: string) {
		if (!editor.slot) return;
		addConsumable(editor.slot.vault, id, 1);
		editor.markCurated();
		editor.refresh();
	}
</script>

<Section title="Vault Consumables" subtitle="Drag to reorder | Click to select" plain>
	<ConsumableWheel {editor} />
	{#if addableConsumables.length > 0}
		<div class="flex flex-wrap justify-center gap-2 mt-4 pt-4 border-edge-dim border-t-2">
			{#each addableConsumables as { id } (id)}
				<Button size="sm" onclick={() => add(id)}>
					<ItemIcon {id} />
					Add {displayName(id)}
				</Button>
			{/each}
		</div>
	{/if}
</Section>
