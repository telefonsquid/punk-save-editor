<script lang="ts">
	import Button from '../Button.svelte';
	import NumberInput from '../NumberInput.svelte';
	import ResourceIcon from '../ResourceIcon.svelte';
	import Section from '../Section.svelte';
	import { shipResInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { fmt1 } from '$lib/format';
	import { resourceLabel } from '$lib/game/data';
	import { shipResourceCaps, shipResources } from '$lib/save/ship';

	let { editor }: { editor: EditorState } = $props();

	// Ship resources live in the (lazily loaded) entities file; max values are
	// derived from the installed grid modules, so recompute on every edit.
	// The rows snapshot $k/$v into fresh objects: the pairs themselves keep
	// their identity across recomputes, so expressions reading them directly
	// would not re-render inside the keyed each.
	const rows = $derived.by(() => {
		if (editor.version < 0 || !editor.slot || !editor.loadedFiles.has('entities')) return null;
		const entities = editor.slot.files.entities;
		const caps = shipResourceCaps(entities);
		return shipResources(entities).map((pair) => ({
			pair,
			id: pair.$k,
			value: pair.$v,
			max: caps.get(pair.$k)
		}));
	});
</script>

<Section title="Ship resources" onchange={editor.refresh}>
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
					</span>
				</label>
			{/each}
		</div>
		<p class="mt-2 text-xs text-zinc-600">
			Max values are derived from the modules installed on the ship grid and update as you edit
			them; edits are clamped to the max.
		</p>
	{/if}
</Section>
