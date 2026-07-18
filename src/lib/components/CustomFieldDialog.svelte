<script lang="ts">
	import EffectFieldGrid from './EffectFieldGrid.svelte';
	import {
		blankEffectField,
		CUSTOM_FIELD_SIZES,
		effectFieldProblem,
		type EffectField
	} from '$lib/game/data';

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
	const lit = $derived(canvas.data.filter((v) => v).length);

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
     `margin: auto`, which Tailwind's preflight reset zeroes out. -->
<dialog
	bind:this={dialog}
	class="m-auto w-[min(34rem,92vw)] rounded-lg border border-amber-700/60 bg-zinc-900 p-0 text-zinc-200 backdrop:bg-black/70"
	onclose={() => {
		open = false;
		canvas = blankEffectField(5); // the next shape starts from scratch, not from a discarded one
	}}
>
	<div class="flex items-center gap-3 border-b border-zinc-800 px-5 py-3">
		<h2 class="text-sm font-bold tracking-widest text-amber-400 uppercase">Add custom shape</h2>
		<label class="ml-auto flex items-center gap-1 text-xs text-zinc-400">
			Size
			<select
				class="rounded border-zinc-700 bg-zinc-950 px-1 py-0.5 text-xs"
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
		<p class="mb-3 text-xs leading-snug text-amber-300/90">
			<strong>Unsupported territory.</strong> The game only checks a field's shape when it builds one
			from its sprite — a field loaded from a save is used exactly as written, so this works, but no
			shape you paint here has ever been through the game's own code. Keep a backup.
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
			<p class="mt-3 text-xs text-red-400">This shape {problem}.</p>
		{:else}
			<p class="mt-3 text-xs text-zinc-500">
				Cells are relative to the centre, where the module sits. Drag to paint a run at once. {lit}
				{lit === 1 ? 'cell' : 'cells'} lit.
			</p>
		{/if}
	</div>

	<div class="flex items-center gap-2 border-t border-zinc-800 px-5 py-3">
		<span class="text-xs text-zinc-600">Saved in this browser and offered on every module.</span>
		<button
			type="button"
			class="ml-auto rounded border border-zinc-700 px-3 py-1 text-xs hover:border-zinc-500"
			onclick={() => (open = false)}
		>
			Cancel
		</button>
		<button
			type="button"
			class="rounded border border-zinc-700 px-3 py-1 text-xs font-semibold hover:border-lime-400 hover:text-lime-400 disabled:opacity-40 disabled:hover:border-zinc-700 disabled:hover:text-zinc-200"
			disabled={!!problem}
			onclick={save}
		>
			Add shape
		</button>
	</div>
</dialog>
