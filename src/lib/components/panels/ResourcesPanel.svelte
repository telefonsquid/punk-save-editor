<script lang="ts">
	import CounterCell from '../CounterCell.svelte';
	import ItemIcon from '../ItemIcon.svelte';
	import ResourceIcon from '../ResourceIcon.svelte';
	import Section from '../Section.svelte';
	import { ingredientInput, numInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { fmt1 } from '$lib/format';
	import { assetsByCategory, displayName } from '$lib/game/data';
	import type { ResourcePair } from '$lib/save/tree';
	import { getResources } from '$lib/save/rundata';
	import { ingredientCounts, ingredientIds } from '$lib/save/vault';

	let { editor }: { editor: EditorState } = $props();

	// Ingredients that exist in the game data but are unused in the current build
	// (never obtainable in a run) — hidden from the editor to avoid confusion,
	// but kept in the asset data so they reappear if a future build uses them.
	const DISABLED_INGREDIENTS = new Set(['Bond', 'Ex', 'Face', 'strange_ball']);
	const allIngredients = assetsByCategory('Ingredient').filter(
		({ id }) => !DISABLED_INGREDIENTS.has(id)
	);

	// Fresh row objects per recompute: a derived that handed back the same pair
	// nodes would look unchanged to Svelte, so in-place $v edits (e.g. from the
	// Raw tab) would never repaint here (see the snapshot rule in
	// docs/editor-internals.md).
	const resources = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return [];
		return getResources(editor.slot.rundata).map((pair) => ({
			pair,
			id: pair.$k,
			value: pair.$v
		}));
	});

	// Money is the run's headline currency, so it sits on its own line above the
	// rest of the strip.
	const money = $derived(resources.find((r) => r.id === 'Resource Money') ?? null);
	const otherResources = $derived(resources.filter((r) => r.id !== 'Resource Money'));

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

	// Run resources are floats the game may have written at any precision, so they
	// display rounded but accept anything typed — the same handler for money and
	// for the strip beside it.
	const resourceCell = (pair: ResourcePair) =>
		numInput(editor, pair, '$v', { min: 0, file: 'rundata' });
</script>

<Section title="Resources" subtitle="Click to modify" plain>
	<!-- The game's inventory strip (resources.png): each amount is a big HUD number
	     with the resource's icon right after it. Money leads on its own line; the
	     rest wraps below, all centred. -->
	<div class="flex flex-col items-center gap-4">
		{#if money}
			<CounterCell
				label={displayName(money.id)}
				step="any"
				min="0"
				value={fmt1(money.value)}
				oninput={resourceCell(money.pair)}
			>
				{#snippet icon()}<ResourceIcon id={money.id} scale={3} />{/snippet}
			</CounterCell>
		{/if}
		<div class="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
			{#each otherResources as row (row.id)}
				<CounterCell
					label={displayName(row.id)}
					step="any"
					min="0"
					value={fmt1(row.value)}
					oninput={resourceCell(row.pair)}
				>
					{#snippet icon()}<ResourceIcon id={row.id} scale={3} />{/snippet}
				</CounterCell>
			{/each}
			<!-- Every ingredient is listed, even ones the player doesn't own yet
			     (shown as 0); raising a count from zero inserts it into the vault. -->
			{#each allIngredients as { id } (id)}
				<CounterCell
					label={displayName(id)}
					min="0"
					value={ingCountById[id] ?? 0}
					oninput={ingredientInput(editor, id)}
				>
					{#snippet icon()}<ItemIcon {id} scale={3} />{/snippet}
				</CounterCell>
			{/each}
		</div>
	</div>
</Section>
