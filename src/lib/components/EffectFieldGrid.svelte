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
		size = '3.5rem',
		onselect,
		oncell
	}: {
		field: EffectField;
		color?: string | null;
		label?: string;
		/**
		 * Edge length of the whole grid, not of a cell: a 3×3 and a 7×7 take up
		 * the same footprint so a row of shapes stays a row of same-sized tiles
		 * and the odd sizes read as coarser or finer rather than as smaller or
		 * larger. The painting canvas passes a much bigger one.
		 */
		size?: string;
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
	// `1fr` rather than a fixed cell edge is what makes the footprint constant.
	const columns = $derived(`repeat(${field.width}, 1fr)`);
	const rows = $derived(`repeat(${field.height}, 1fr)`);
</script>

{#snippet cellGrid(interactive: boolean)}
	{#each cells as c, i (i)}
		{#if interactive}
			<button
				type="button"
				class="min-h-0 min-w-0 {c.center ? 'ring-1 ring-zinc-400/70 ring-inset' : ''}"
				style:background-color={c.on ? fill : '#18181b'}
				aria-pressed={c.on}
				aria-label="Column {(i % field.width) + 1}, row {Math.floor(i / field.width) + 1}"
				onclick={() => oncell?.(i)}
			></button>
		{:else}
			<span
				class="min-h-0 min-w-0 {c.center ? 'ring-1 ring-zinc-400/70 ring-inset' : ''}"
				style:background-color={c.on ? fill : '#18181b'}
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
		style:width={size}
		style:height={size}
		style:grid-template-columns={columns}
		style:grid-template-rows={rows}
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
		style:width={size}
		style:height={size}
		style:grid-template-columns={columns}
		style:grid-template-rows={rows}
		role="group"
		aria-label={describe}
	>
		{@render cellGrid(true)}
	</div>
{:else}
	<div
		class="inline-grid gap-px rounded-sm bg-black/60 p-px"
		style:width={size}
		style:height={size}
		style:grid-template-columns={columns}
		style:grid-template-rows={rows}
		role="img"
		aria-label={describe}
	>
		{@render cellGrid(false)}
	</div>
{/if}
