<script lang="ts">
	import Button from '../Button.svelte';
	import ItemIcon from '../ItemIcon.svelte';
	import NumberInput from '../NumberInput.svelte';
	import Section from '../Section.svelte';
	import { numInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { assets, assetsByCategory, displayName } from '$lib/game/data';
	import { addConsumable, getConsumables, reorderConsumables } from '$lib/save/slot';

	let { editor }: { editor: EditorState } = $props();

	const allConsumables = assetsByCategory('Consumable');

	const consumables = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return [];
		return [...getConsumables(editor.slot.vault)];
	});

	// Only the filled slots are shown; empty ("(none)") slots are surfaced as
	// add buttons instead. Reordering acts on this filtered list.
	const filledConsumables = $derived(consumables.filter((c) => c.consumableId));
	const addableConsumables = $derived(
		allConsumables.filter(({ id }) => !consumables.some((c) => c.consumableId === id))
	);

	// Index (into filledConsumables) of the row currently being dragged.
	let dragIndex = $state<number | null>(null);

	/** Finish a consumable drag: move the dragged row to slot `to`. */
	function dropConsumable(to: number) {
		if (editor.slot && dragIndex !== null && dragIndex !== to) {
			reorderConsumables(editor.slot.vault, dragIndex, to);
			editor.markCurated();
			editor.refresh();
		}
		dragIndex = null;
	}

	function add(id: string) {
		if (!editor.slot) return;
		addConsumable(editor.slot.vault, id, 1);
		editor.markCurated();
		editor.refresh();
	}
</script>

<Section title="Vault · Consumables">
	<ul class="list-none">
		{#each filledConsumables as c, i (c.consumableId)}
			<!-- Drag a row onto another to reorder the inventory slots. -->
			<li
				role="listitem"
				class="mb-2 flex items-center justify-between gap-4 rounded {dragIndex === i
					? 'opacity-40'
					: ''}"
				ondragover={(e) => e.preventDefault()}
				ondrop={() => dropConsumable(i)}
			>
				<span class="flex items-center gap-2">
					<button
						type="button"
						class="cursor-move px-1 text-zinc-600 select-none hover:text-zinc-300"
						draggable="true"
						aria-label="Drag to reorder {displayName(c.consumableId)}"
						ondragstart={() => (dragIndex = i)}
						ondragend={() => (dragIndex = null)}
					>
						⠿
					</button>
					<ItemIcon id={c.consumableId} />
					{displayName(c.consumableId)}
					{#if c.consumableId && assets[c.consumableId]?.maxCount}
						<span class="text-xs text-zinc-500">max {assets[c.consumableId].maxCount}</span>
					{/if}
				</span>
				<NumberInput min="0" value={c.amount} oninput={numInput(c, 'amount')} />
			</li>
		{:else}
			<p class="text-sm text-zinc-500">Vault has no consumables.</p>
		{/each}
	</ul>
	{#if addableConsumables.length > 0}
		<div class="mt-4 flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
			{#each addableConsumables as { id } (id)}
				<Button size="sm" onclick={() => add(id)}>
					<ItemIcon {id} />
					Add {displayName(id)}
				</Button>
			{/each}
		</div>
	{/if}
</Section>
