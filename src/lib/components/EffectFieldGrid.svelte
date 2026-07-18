<script lang="ts">
	import type { EffectField } from '$lib/game/data';

	// The area-of-effect diagram the game draws on a power core / booster card
	// (ModuleEffectFieldWidget: a grid of `width` columns, one cell per bool,
	// filled cells lit and the rest dark). The module itself sits in the centre
	// cell, which is ringed here so the shape reads as "relative to me" — the
	// game can afford to leave that implicit because the card sits next to the
	// grid it applies to.
	//
	// `color` is the module's own colour, so a core reads as belonging to its
	// resource the way every other module row does.
	let {
		field,
		color = '#22d3ee',
		label
	}: { field: EffectField; color?: string | null; label?: string } = $props();

	const cells = $derived(
		field.data.map((on, i) => ({
			on: !!on,
			// Odd-sized fields only (the game logs an error otherwise), so the
			// centre is exactly one cell.
			center:
				i % field.width === (field.width - 1) / 2 &&
				Math.floor(i / field.width) === (field.height - 1) / 2
		}))
	);
</script>

<div
	class="inline-grid gap-px rounded-sm bg-black/60 p-px"
	style:grid-template-columns="repeat({field.width}, 0.625rem)"
	role="img"
	aria-label={label ?? `Area of effect, ${field.width} by ${field.height} cells`}
>
	{#each cells as cell, i (i)}
		<span
			class="h-2.5 w-2.5 {cell.center ? 'ring-1 ring-zinc-400/70 ring-inset' : ''}"
			style:background-color={cell.on ? (color ?? '#22d3ee') : '#18181b'}
		></span>
	{/each}
</div>
