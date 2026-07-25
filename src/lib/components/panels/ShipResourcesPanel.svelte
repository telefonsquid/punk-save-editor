<script lang="ts">
	import Button from '../Button.svelte';
	import ResourceTankBar from '../ResourceTankBar.svelte';
	import Section from '../Section.svelte';
	import Skeleton from '../Skeleton.svelte';
	import { setShipResource } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { fmtRate } from '$lib/format';
	import { resourceArt } from '$lib/game/data';
	import { shipResourceCaps, shipResourceRegen, shipResources } from '$lib/save/ship';

	let { editor }: { editor: EditorState } = $props();

	// Ship resources live in the (lazily loaded) entities file. Both the maximum
	// and the recharge rate are derived from the installed grid modules — the game
	// never stores either — so they recompute on every edit.
	const rows = $derived.by(() => {
		if (editor.version < 0 || !editor.slot || !editor.loadedFiles.has('entities')) return null;
		const entities = editor.slot.files.entities;
		const caps = shipResourceCaps(entities);
		const regen = shipResourceRegen(entities);
		return shipResources(entities)
			.map((pair) => ({
				pair,
				id: pair.$k,
				value: pair.$v,
				max: caps.get(pair.$k),
				regen: regen.get(pair.$k) ?? 0
			}))
			// Stack them in the game's HUD order (Caps at the top, Health at the
			// bottom) so the wall of bars matches the ship screen.
			.sort((a, b) => (resourceArt[a.id]?.orderInHud ?? 99) - (resourceArt[b.id]?.orderInHud ?? 99));
	});

	// The entities file is still decoding. Tell that apart from a save that simply
	// has no entities: the first shows a loading pulse, the second the notice below.
	const loading = $derived(editor.busy || editor.rawLoading === 'entities');

	// Rough tank widths so the placeholder reads as a stack of bars, not a blank.
	const SKELETON_WIDTHS = ['70%', '55%', '85%', '40%'];
</script>

<Section
	title="Ship resources"
	subtitle="Click a bar to set its value. Maximums and recharge come from the installed grid modules."
	plain
>
	{#if !rows && loading}
		<!-- Ship tanks are still decoding; pulse in their place until they arrive. -->
		<div class="flex flex-col gap-3">
			{#each SKELETON_WIDTHS as w (w)}
				<Skeleton width={w} height="1.25rem" />
			{/each}
		</div>
	{:else if !rows}
		<p class="mb-3 text-ui-xs text-muted">
			Current fuel, health, ammo etc. are stored with the ship in the
			<code class="text-ui-xs">entities</code> file, which isn't present in this save.
		</p>
		<Button disabled={editor.rawLoading !== null} onclick={() => editor.openRawFile('entities', true)}>
			{editor.rawLoading === 'entities' ? 'Decoding…' : 'Retry loading ship resources'}
		</Button>
	{:else if rows.length === 0}
		<p class="text-ui-xs text-muted">No ship with resource tanks found in this save.</p>
	{:else}
		<!-- The bars carry no labels, exactly like the HUD: the shape and colour name
		     the resource. -->
		<div class="flex flex-col gap-3">
			{#each rows as row (row.id)}
				<div class="flex items-center gap-4">
					<div class="min-w-0">
						<ResourceTankBar
							id={row.id}
							value={row.value}
							max={row.max}
							onset={(n) => setShipResource(editor, row.pair, row.max, n)}
						/>
					</div>
					<!-- Only the recharge rate rides along, always on, pinned to the far
					     right so a wide tank (Health) can't shove it around. -->
					{#if row.regen > 0}
						<span class="punk-regen ml-auto shrink-0 text-hud-xs">
							+{fmtRate(row.regen)}/s
						</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</Section>

<style>
	/* Recharge rate is set in the HUD title face, like the number at the right of
	   the game's own resource rows. Green marks it as a gain, apart from the amber
	   the rest of the editor spends on things you click. */
	.punk-regen {
		font-family: var(--font-title);
		letter-spacing: var(--tracking-hud);
		color: #5fc24e;
	}
</style>
