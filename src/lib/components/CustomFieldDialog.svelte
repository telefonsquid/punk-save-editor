<script lang="ts">
	import Button from './Button.svelte';
	import EffectFieldGrid from './EffectFieldGrid.svelte';
	import type { EffectField } from '$lib/game/data';
	import { blankEffectField, CUSTOM_FIELD_SIZES, effectFieldProblem } from '$lib/game/effect-field';

	// Painting a shape by hand leaves behind the guarantee that every other shape
	// in the editor carries — that the game could have rolled it. That is worth a
	// deliberate step rather than a stray click, so it happens in its own modal,
	// on a canvas big enough to actually aim at.
	let {
		open = $bindable(false),
		color,
		onadd
	}: {
		open?: boolean;
		color?: string | null;
		onadd: (field: EffectField) => void;
	} = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let canvas = $state<EffectField>(blankEffectField(5));

	const problem = $derived(effectFieldProblem(canvas));

	// `showModal()` is what gives the native dialog its focus trap and Esc
	// handling, and there is no attribute equivalent — so the open state has to
	// drive the imperative call, and the element reference has to be bound. The
	// effect only touches the DOM; it assigns no state.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	// The grid says what a cell should become rather than asking for a toggle, so
	// that dragging a stroke over cells that are already lit leaves them lit.
	function paintCell(i: number, value: 0 | 1) {
		if (i === (canvas.data.length - 1) / 2) return; // the centre cell is the module; it stays lit
		if (canvas.data[i] === value) return;
		const data = [...canvas.data];
		data[i] = value;
		canvas = { ...canvas, data };
	}

	function save() {
		if (problem) return;
		onadd(canvas);
		open = false;
	}
</script>

<!-- `m-auto` is what centres the dialog: the UA centres a modal with its own
     `margin: auto`, which Tailwind's preflight reset zeroes out. Square warm slab
     like the module picker, but on an amber edge to mark it as the off-road tool. -->
<dialog
	bind:this={dialog}
	class="bg-surface backdrop:bg-black/80 m-auto p-0 border-2 w-[min(34rem,92vw)] text-ink"
	style:border-color="color-mix(in srgb, var(--color-amber) 60%, transparent)"
	onclose={() => {
		open = false;
		canvas = blankEffectField(5); // the next shape starts from scratch, not from a discarded one
	}}
	onclick={(e) => {
		// A click that lands on the dialog element itself is the backdrop (its
		// content fills the box, so anything else has a child as its target).
		if (e.target === dialog) open = false;
	}}
>
	<div class="flex items-center gap-3 px-5 py-3 border-edge-dim border-b-2">
		<h2 class="font-title text-accent text-hud-sm uppercase tracking-hud-wide whitespace-nowrap shrink-0">
			Add custom shape
		</h2>
		<label class="flex items-center gap-2 ml-auto text-muted text-ui-xs">
			Size
			<select
				class="text-ui-xs punk-select"
				value={canvas.width}
				onchange={(e) => (canvas = blankEffectField(Number(e.currentTarget.value)))}
			>
				{#each CUSTOM_FIELD_SIZES as size (size)}
					<option value={size}>{size}×{size}</option>
				{/each}
			</select>
		</label>
	</div>

	<div class="px-5 py-4">
		<p class="mb-3 text-amber text-ui-xs">
			<strong class="text-accent">Unsupported territory!</strong> Custom shapes do work, but have never been through the game's own code, so they might produce unexpected behaviour. Keep a backup.
		</p>
		<div class="flex justify-center py-2">
			<EffectFieldGrid
				field={canvas}
				{color}
				size="14rem"
				label="Paint the area of effect"
				oncell={paintCell}
			/>
		</div>
		{#if problem}
			<p class="mt-3 text-danger text-ui-xs">This shape {problem}.</p>
		{:else}
			<p class="mt-3 text-muted text-ui-xs">
				Drag to paint multiple cells at once.
			</p>
		{/if}
	</div>

	<div class="flex items-center gap-3 px-5 py-3 border-edge-dim border-t-2">
		<div class="flex items-center gap-2 ml-auto">
			<Button variant="outline" size="sm" onclick={() => (open = false)}>Cancel</Button>
			<Button variant="outline" size="sm" disabled={!!problem} onclick={save}>Add shape</Button>
		</div>
	</div>
</dialog>

<style>
	/* The size dropdown wears the game's quiet edge and clears @tailwindcss/forms'
	   white fill and blue focus ring. */
	.punk-select {
		/* No chevron at all — it overlapped the value and clashed with the pixel
		   chrome. `appearance: none` drops the native arrow, and `background-image:
		   none` drops the SVG one @tailwindcss/forms paints on every select. The
		   size list is tiny, so the framed box alone reads as a picker, and the
		   value sits centred in it. */
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
		background-image: none;
		border: 2px solid var(--color-edge-dim);
		background-color: var(--color-void);
		color: var(--color-ink);
		padding: 0.25rem 0.9rem;
		text-align: center;
		text-align-last: center;
	}
	.punk-select:focus {
		outline: none;
		box-shadow: none;
		border-color: var(--color-accent);
	}
</style>
