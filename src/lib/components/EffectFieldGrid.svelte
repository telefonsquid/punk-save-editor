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
	//
	// The same grid does three jobs: a static diagram, one option in a row of
	// shapes to pick from (`onselect`), and a canvas to paint (`oncell`). They
	// differ only in what wraps the cells, so the cells live in a snippet.
	let {
		field,
		color = '#22d3ee',
		label,
		selected = false,
		onselect,
		oncell
	}: {
		field: EffectField;
		color?: string | null;
		label?: string;
		/** Marks this shape as the module's current one. */
		selected?: boolean;
		/** Makes the whole grid a button that chooses this shape. */
		onselect?: () => void;
		/** Makes every cell a button that toggles it. */
		oncell?: (index: number) => void;
	} = $props();

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

	const fill = $derived(color ?? '#22d3ee');
	const describe = $derived(label ?? `Area of effect, ${field.width} by ${field.height} cells`);
</script>

{#snippet cellGrid(interactive: boolean)}
	{#each cells as cell, i (i)}
		{#if interactive}
			<button
				type="button"
				class="h-2.5 w-2.5 {cell.center ? 'ring-1 ring-zinc-400/70 ring-inset' : ''}"
				style:background-color={cell.on ? fill : '#18181b'}
				aria-pressed={cell.on}
				aria-label="Column {(i % field.width) + 1}, row {Math.floor(i / field.width) + 1}"
				onclick={() => oncell?.(i)}
			></button>
		{:else}
			<span
				class="h-2.5 w-2.5 {cell.center ? 'ring-1 ring-zinc-400/70 ring-inset' : ''}"
				style:background-color={cell.on ? fill : '#18181b'}
			></span>
		{/if}
	{/each}
{/snippet}

{#if onselect}
	<button
		type="button"
		class="inline-grid gap-px rounded-sm p-px {selected
			? 'ring-2 ring-offset-1 ring-offset-zinc-900'
			: 'opacity-60 hover:opacity-100'}"
		style:grid-template-columns="repeat({field.width}, 0.625rem)"
		style:background-color="rgb(0 0 0 / 0.6)"
		style:--tw-ring-color={fill}
		aria-pressed={selected}
		aria-label={describe}
		onclick={onselect}
	>
		{@render cellGrid(false)}
	</button>
{:else if oncell}
	<div
		class="inline-grid gap-px rounded-sm bg-black/60 p-px"
		style:grid-template-columns="repeat({field.width}, 0.625rem)"
		role="group"
		aria-label={describe}
	>
		{@render cellGrid(true)}
	</div>
{:else}
	<div
		class="inline-grid gap-px rounded-sm bg-black/60 p-px"
		style:grid-template-columns="repeat({field.width}, 0.625rem)"
		role="img"
		aria-label={describe}
	>
		{@render cellGrid(false)}
	</div>
{/if}
