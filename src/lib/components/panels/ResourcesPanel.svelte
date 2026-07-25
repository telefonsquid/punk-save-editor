<script lang="ts">
	import InlineNumber from '../InlineNumber.svelte';
	import ItemIcon from '../ItemIcon.svelte';
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

	// Money is the run's headline currency, so it sits on its own line above the
	// rest of the strip.
	const money = $derived(resources.find((p) => p.$k === 'Resource Money') ?? null);
	const otherResources = $derived(resources.filter((p) => p.$k !== 'Resource Money'));

	// The vault only stores ingredients the player actually owns, but the UI
	// shows every ingredient (owned or not) so counts can be raised from zero.
	const ingCountById = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return {};
		const ids = ingredientIds(editor.slot.vault);
		const counts = ingredientCounts(editor.slot.vault);
		const m: Record<string, number> = {};
		ids.forEach((id, i) => (m[id] = counts[i]));
		return m;
	});
</script>

<Section title="Resources" subtitle="Click to modify" plain>
	<!-- The game's inventory strip (resources.png): each amount is a big HUD number
	     with the resource's icon right after it. Money leads on its own line; the
	     rest wraps below, all centred. -->
	<div class="flex flex-col items-center gap-4">
		{#if money}
			<label class="flex items-center gap-2" title={displayName(money.$k)}>
				<InlineNumber
					size="sm"
					step="any"
					value={fmt1(money.$v)}
					oninput={numInput(money, '$v')}
				/>
				<ResourceIcon id={money.$k} scale={3} labeled />
			</label>
		{/if}
		<div class="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
			{#each otherResources as pair (pair.$k)}
				<label class="flex items-center gap-2" title={displayName(pair.$k)}>
					<InlineNumber size="sm" step="any" value={fmt1(pair.$v)} oninput={numInput(pair, '$v')} />
					<ResourceIcon id={pair.$k} scale={3} labeled />
				</label>
			{/each}
			<!-- Every ingredient is listed, even ones the player doesn't own yet
			     (shown as 0); raising a count from zero inserts it into the vault. -->
			{#each allIngredients as { id } (id)}
				<label class="flex items-center gap-2" title={displayName(id)}>
					<InlineNumber
						size="sm"
						min="0"
						value={ingCountById[id] ?? 0}
						oninput={ingredientInput(editor, id)}
					/>
					<ItemIcon {id} scale={3} />
				</label>
			{/each}
		</div>
	</div>
</Section>
