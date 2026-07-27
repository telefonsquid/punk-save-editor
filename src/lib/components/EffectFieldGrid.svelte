<script module lang="ts">
	/**
	 * The edge length every shape tile takes. Exported so the "add custom shape"
	 * button can size itself to it and stay part of the row rather than drifting
	 * out of step with a number written twice.
	 */
	export const DEFAULT_FIELD_SIZE = '3.5rem';
</script>

<script lang="ts">
	import type { EffectField } from '$lib/game/data';

	// The area-of-effect diagram the game draws on a power core / booster card
	// (ModuleEffectFieldWidget: a grid of `width` columns, one cell per bool,
	// filled cells lit and the rest dark). The centre cell is the module's own
	// square; it is drawn exactly like every other cell, since the game marks it
	// no differently and a ring around it only made the shape harder to read.
	//
	// `color` is the module's own colour, so a core reads as belonging to its
	// resource the way every other module row does.
	//
	// The same grid does three jobs: a static diagram, one option in a row of
	// shapes to pick from (`onselect`), and a canvas to paint (`oncell`). They
	// differ only in what wraps the cells, so the cells live in a snippet.
	let {
		field,
		color = null,
		label,
		selected = false,
		size = DEFAULT_FIELD_SIZE,
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
		/**
		 * Makes every cell paintable. Called with the value the cell should end up
		 * at rather than a plain "toggle", so that dragging across a run of cells
		 * sets all of them the same way and re-entering one is a no-op.
		 */
		oncell?: (index: number, value: 0 | 1) => void;
	} = $props();

	// Drag-painting: the first cell you press decides the mode for the whole
	// stroke — start on a dark cell and you draw, start on a lit one and you
	// erase — which is what makes a stroke predictable when it crosses cells
	// that are already in the target state.
	let painting = $state<0 | 1 | null>(null);

	function paint(i: number, value: 0 | 1) {
		oncell?.(i, value);
	}

	function startPaint(i: number, on: boolean) {
		const value = on ? 0 : 1;
		painting = value;
		paint(i, value);
	}


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

	// A module with no colour of its own falls back to the interaction colour —
	// the diagram is still something you click, and the palette has no neutral
	// "lit" shade that would not read as an unlit cell.
	const fill = $derived(color ?? 'var(--color-accent)');
	const describe = $derived(label ?? `Area of effect, ${field.width} by ${field.height} cells`);
	// `1fr` rather than a fixed cell edge is what makes the footprint constant.
	const columns = $derived(`repeat(${field.width}, 1fr)`);
	const rows = $derived(`repeat(${field.height}, 1fr)`);
</script>

<svelte:window onpointerup={() => (painting = null)} onpointercancel={() => (painting = null)} />

{#snippet cellGrid(interactive: boolean)}
	{#each cells as c, i (i)}
		<!-- The centre is the module itself, not part of the area it projects, so
		     it is never a button: a field whose centre is dark would place the
		     module outside its own effect, which nothing in the game can produce.
		     It still looks like any other cell — only the handlers differ. -->
		{#if interactive && !c.center}
			<button
				type="button"
				class="min-h-0 min-w-0"
				style:background-color={c.on ? fill : 'var(--color-cell-off)'}
				aria-pressed={c.on}
				aria-label="Column {(i % field.width) + 1}, row {Math.floor(i / field.width) + 1}"
				onpointerdown={() => startPaint(i, c.on)}
				onpointerenter={() => painting !== null && paint(i, painting)}
				onclick={(e) => {
					// Pointer presses are already handled above; a click with no
					// pointer behind it (detail 0) is Enter or Space on a focused
					// cell, which is the only path left that has to toggle.
					if (e.detail === 0) paint(i, c.on ? 0 : 1);
				}}
			></button>
		{:else}
			<span
				class="min-h-0 min-w-0"
				style:background-color={c.on ? fill : 'var(--color-cell-off)'}
				title={interactive && c.center ? 'The module sits here' : undefined}
			></span>
		{/if}
	{/each}
{/snippet}

{#if onselect}
	<button
		type="button"
		class="field-grid inline-grid gap-px p-px"
		class:is-selected={selected}
		style:width={size}
		style:height={size}
		style:grid-template-columns={columns}
		style:grid-template-rows={rows}
		style:--ring={fill}
		aria-pressed={selected}
		aria-label={describe}
		onclick={onselect}
	>
		{@render cellGrid(false)}
	</button>
{:else if oncell}
	<!-- `touch-none` keeps a finger stroke painting instead of scrolling the
	     dialog, and `select-none` stops a mouse drag from selecting the grid. -->
	<div
		class="field-grid inline-grid touch-none gap-px p-px select-none"
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
		class="field-grid inline-grid gap-px p-px"
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

<style>
	/* The dark the cells sit on, showing through the one-pixel gaps between them.
	   Below `--color-cell-off` so an unlit cell still reads as a cell rather than
	   as a hole in the grid. */
	.field-grid {
		background-color: var(--color-grid-gap);
		border: 0;
		cursor: inherit;
	}

	/* Only a selectable grid is a button, and only a button dims when it is not
	   the current pick. */
	button.field-grid {
		cursor: pointer;
		opacity: 0.6;
		transition: none;
	}
	button.field-grid:hover {
		opacity: 1;
	}

	/* The current shape wears a keyline in its module's own colour, held one pixel
	   clear of the cells by a ring of the slab behind it so the two do not touch. */
	.is-selected {
		opacity: 1;
		box-shadow:
			0 0 0 1px var(--color-card),
			0 0 0 3px var(--ring);
	}
</style>
