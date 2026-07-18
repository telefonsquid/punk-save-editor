<script lang="ts">
	import ResourceIcon from '../ResourceIcon.svelte';
	import Section from '../Section.svelte';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { fmtRate } from '$lib/format';
	import { resourceLabel } from '$lib/game/data';
	import { shipResourceRegen } from '$lib/save/ship';

	let { editor }: { editor: EditorState } = $props();

	// Read-only: regen comes entirely from the grid, so it changes when modules
	// do, not by typing a number here.
	const rows = $derived.by(() => {
		if (editor.version < 0 || !editor.slot || !editor.loadedFiles.has('entities')) return [];
		return [...shipResourceRegen(editor.slot.files.entities)]
			.filter(([, rate]) => rate > 0)
			.sort((a, b) => b[1] - a[1])
			.map(([id, rate]) => ({ id, rate }));
	});
</script>

{#if rows.length > 0}
	<Section title="Regeneration" class="mb-6">
		<div class="grid gap-x-8 md:grid-cols-2">
			{#each rows as row (row.id)}
				<div class="mb-2 flex items-center justify-between gap-4">
					<span class="flex items-center gap-2">
						<ResourceIcon id={row.id} />
						{resourceLabel(row.id)}
					</span>
					<span class="text-right tabular-nums text-lime-400">+{fmtRate(row.rate)}/s</span>
				</div>
			{/each}
		</div>
		<p class="mt-2 text-xs text-zinc-600">
			Read-only — recharge comes from the regen modules on the ship grid, each counted at its
			boosted level, so it changes when you change the grid. Stamina's baseline is the SHIP
			module's own +20/s. The game holds recharge for a short delay after a resource drops.
		</p>
	</Section>
{/if}
