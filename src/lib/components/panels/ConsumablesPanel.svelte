<script lang="ts">
	import Button from '../Button.svelte';
	import ConsumableWheel from '../ConsumableWheel.svelte';
	import ItemIcon from '../ItemIcon.svelte';
	import Section from '../Section.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { assetsByCategory, displayName } from '$lib/game/data';
	import { getConsumables, hasFreeConsumableSlot, setConsumable } from '$lib/save/vault';

	let { editor }: { editor: EditorState } = $props();

	const allConsumables = assetsByCategory('Consumable');

	const consumables = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return [];
		return [...getConsumables(editor.slot.vault)];
	});

	// A consumable can be added only if the vault doesn't already hold it and has
	// a slot left to put it in — the slot count is fixed at eight, so a full vault
	// offers nothing rather than a button that would quietly do nothing.
	const addableConsumables = $derived.by(() => {
		// Read the slots first: `consumables` carries this view's dependency on
		// editor.version, so an early return above it would freeze the add row.
		const held = consumables;
		if (!editor.slot || !hasFreeConsumableSlot(editor.slot.vault)) return [];
		return allConsumables.filter(({ id }) => !held.some((c) => c.consumableId === id));
	});

	function add(id: string) {
		if (!editor.slot) return;
		if (setConsumable(editor.slot.vault, id, 1)) editor.touch('vault');
	}
</script>

<Section
	title="Vault Consumables"
	subtitle="Drag or Alt+Arrow to reorder | Click to select"
	plain
>
	<ConsumableWheel {editor} />
	{#if addableConsumables.length > 0}
		<div class="flex flex-wrap justify-center gap-2 mt-4 pt-4 border-edge-dim border-t-2">
			{#each addableConsumables as { id } (id)}
				<!-- The wheel's own tick, not the generic OK: putting a consumable in
				     the vault is the same edit as taking one out. -->
				<Button size="sm" sound="close" onclick={() => add(id)}>
					<ItemIcon {id} />
					Add {displayName(id)}
				</Button>
			{/each}
		</div>
	{/if}
</Section>
