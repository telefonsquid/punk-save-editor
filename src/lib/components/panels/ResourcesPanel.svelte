<script lang="ts">
	import ItemIcon from '../ItemIcon.svelte';
	import NumberInput from '../NumberInput.svelte';
	import ResourceIcon from '../ResourceIcon.svelte';
	import Section from '../Section.svelte';
	import { ingredientInput, numInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { fmt1 } from '$lib/format';
	import { assetsByCategory, displayName } from '$lib/game/data';
	import { getResources, ingredientCounts, ingredientIds } from '$lib/save/slot';

	let { editor }: { editor: EditorState } = $props();

	// Ingredients that exist in the game data but are unused in the current build
	// (never obtainable in a run) — hidden from the editor to avoid confusion,
	// but kept in the asset data so they reappear if a future build uses them.
	const DISABLED_INGREDIENTS = new Set(['Bond', 'Ex', 'Face', 'strange_ball']);
	const allIngredients = assetsByCategory('Ingredient').filter(
		({ id }) => !DISABLED_INGREDIENTS.has(id)
	);

	const resources = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return [];
		return [...getResources(editor.slot.rundata)];
	});

	// The vault only stores ingredients the player actually owns, but the UI
	// shows every ingredient (owned or not) so counts can be raised from zero.
	// This maps id -> owned count for the display; missing ids read as 0.
	const ingCountById = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return {};
		const ids = ingredientIds(editor.slot.vault);
		const counts = ingredientCounts(editor.slot.vault);
		const m: Record<string, number> = {};
		ids.forEach((id, i) => (m[id] = counts[i]));
		return m;
	});
</script>

<Section title="Resources">
	{#each resources as pair (pair.$k)}
		<label class="mb-2 flex items-center justify-between gap-4">
			<span class="flex items-center gap-2">
				<ResourceIcon id={pair.$k} />
				{displayName(pair.$k)}
			</span>
			<NumberInput step="any" value={fmt1(pair.$v)} oninput={numInput(pair, '$v')} />
		</label>
	{/each}
	<!-- Every ingredient is listed, even ones the player doesn't own yet
	     (shown as 0); raising a count from zero inserts it into the vault. -->
	{#each allIngredients as { id } (id)}
		<label class="mb-2 flex items-center justify-between gap-4">
			<span class="flex items-center gap-2">
				<ItemIcon {id} />
				{displayName(id)}
			</span>
			<NumberInput min="0" value={ingCountById[id] ?? 0} oninput={ingredientInput(editor, id)} />
		</label>
	{/each}
</Section>
