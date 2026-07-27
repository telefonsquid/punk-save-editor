<script lang="ts">
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import EffectFieldGrid from './EffectFieldGrid.svelte';
	import Select from './Select.svelte';
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

	let canvas = $state<EffectField>(blankEffectField(5));

	const problem = $derived(effectFieldProblem(canvas));

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

<!-- The `warn` tone is the amber edge: this is the one dialog whose output the
     game's own code could never have produced. -->
<Dialog
	bind:open
	title="Add custom shape"
	tone="warn"
	onclose={() => (canvas = blankEffectField(5))}
>
	{#snippet header()}
		<label class="ml-auto flex items-center gap-2 text-muted text-ui-xs">
			Size
			<Select
				class="text-ui-xs"
				value={canvas.width}
				onchange={(e) => (canvas = blankEffectField(Number(e.currentTarget.value)))}
			>
				{#each CUSTOM_FIELD_SIZES as size (size)}
					<option value={size}>{size}×{size}</option>
				{/each}
			</Select>
		</label>
	{/snippet}

	<p class="mb-3 text-amber text-ui-xs">
		<strong class="text-accent">Unsupported territory!</strong> Custom shapes do work, but have never
		been through the game's own code, so they might produce unexpected behaviour. Keep a backup.
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
		<p class="mt-3 text-muted text-ui-xs">Drag to paint multiple cells at once.</p>
	{/if}

	{#snippet footer()}
		<div class="ml-auto flex items-center gap-2">
			<Button variant="ghost" size="sm" onclick={() => (open = false)}>Cancel</Button>
			<Button variant="primary" size="sm" disabled={!!problem} onclick={save}>Add shape</Button>
		</div>
	{/snippet}
</Dialog>
