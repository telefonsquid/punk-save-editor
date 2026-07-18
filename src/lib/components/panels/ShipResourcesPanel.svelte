<script lang="ts">
	import Button from '../Button.svelte';
	import NumberInput from '../NumberInput.svelte';
	import ResourceIcon from '../ResourceIcon.svelte';
	import Section from '../Section.svelte';
	import { shipResInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { fmt1, fmtRate } from '$lib/format';
	import { resourceLabel } from '$lib/game/data';
	import { shipResourceCaps, shipResourceRegen, shipResources } from '$lib/save/ship';

	let { editor }: { editor: EditorState } = $props();

	// Ship resources live in the (lazily loaded) entities file. Both the maximum
	// and the recharge rate are derived from the installed grid modules — the
	// game never stores either — so they recompute on every edit and belong on
	// the same row as the value they bound.
	// The rows snapshot $k/$v into fresh objects: the pairs themselves keep
	// their identity across recomputes, so expressions reading them directly
	// would not re-render inside the keyed each.
	const rows = $derived.by(() => {
		if (editor.version < 0 || !editor.slot || !editor.loadedFiles.has('entities')) return null;
		const entities = editor.slot.files.entities;
		const caps = shipResourceCaps(entities);
		const regen = shipResourceRegen(entities);
		return shipResources(entities).map((pair) => ({
			pair,
			id: pair.$k,
			value: pair.$v,
			max: caps.get(pair.$k),
			regen: regen.get(pair.$k) ?? 0
		}));
	});
</script>

<Section title="Ship resources" class="mb-6" onchange={editor.refresh}>
	{#if !rows}
		<p class="mb-3 text-sm text-zinc-400">
			Current fuel, health, ammo etc. are stored with the ship in the
			<code class="text-xs">entities</code> file, which isn't present in this save.
		</p>
		<Button disabled={editor.rawLoading !== null} onclick={() => editor.openRawFile('entities', true)}>
			{editor.rawLoading === 'entities' ? 'Decoding…' : 'Retry loading ship resources'}
		</Button>
	{:else if rows.length === 0}
		<p class="text-sm text-zinc-500">No ship with resource tanks found in this save.</p>
	{:else}
		<div class="grid gap-x-8 md:grid-cols-2">
			{#each rows as row (row.id)}
				{@const outOfRange = row.value < 0 || (row.max !== undefined && row.value > row.max)}
				<label class="mb-2 flex items-center justify-between gap-4">
					<span class="flex items-center gap-2">
						<ResourceIcon id={row.id} />
						{resourceLabel(row.id)}
						{#if outOfRange}
							<span class="text-xs text-red-400">out of range — may crash the game</span>
						{/if}
					</span>
					<span class="flex items-baseline gap-2">
						<NumberInput
							step="any"
							min="0"
							max={row.max !== undefined ? row.max : undefined}
							value={fmt1(row.value)}
							oninput={shipResInput(editor, row.pair, row.max)}
						/>
						<span class="w-14 text-sm text-zinc-500">
							/ {row.max !== undefined ? fmt1(row.max) : '?'}
						</span>
						<!-- Read-only: recharge is a property of the grid, not of the
						     number in the tank, so it is shown beside it, not edited. -->
						<span class="w-16 text-right text-sm tabular-nums text-lime-400">
							{#if row.regen > 0}+{fmtRate(row.regen)}/s{/if}
						</span>
					</span>
				</label>
			{/each}
		</div>
		<p class="mt-2 text-xs text-zinc-600">
			Maximums and recharge rates both come from the modules installed on the ship grid, each
			counted at its boosted level, and update as you edit them; values are clamped to the max.
			Stamina's baseline recharge is the SHIP module's own +20/s. The game holds recharge for a
			short delay after a resource drops.
		</p>
	{/if}
</Section>
