<script lang="ts">
	import EffectFieldGrid from './EffectFieldGrid.svelte';
	import {
		blankEffectField,
		CUSTOM_FIELD_SIZES,
		effectFieldChoices,
		effectFieldKey,
		effectFieldProblem,
		type EffectField
	} from '$lib/game/data';

	// Picks the shape a power core or booster projects. The options are every
	// orientation the game itself could roll (see `effectFieldChoices`), so
	// staying inside them keeps the module indistinguishable from a legitimately
	// rolled one. Painting a shape by hand leaves that guarantee behind, which is
	// why it sits behind its own toggle and a warning.
	let {
		candidates,
		value,
		color,
		label,
		onchange
	}: {
		/** The shapes the module's asset can roll — expanded to all orientations. */
		candidates: EffectField[];
		/** The shape in effect now, or null for a module that has none yet. */
		value: EffectField | null;
		color?: string | null;
		/** What this field does, e.g. "POWERS" or "BOOSTS". */
		label: string;
		onchange: (field: EffectField) => void;
	} = $props();

	let painting = $state(false);
	/** The hand-painted field, kept separate so toggling back and forth is lossless. */
	let custom = $state<EffectField | null>(null);

	const currentKey = $derived(value ? effectFieldKey(value) : null);

	/**
	 * The options offered: every orientation of every shape the asset can roll,
	 * plus the current one when it is not among them — which is exactly the case
	 * for a field painted by hand, and the only way back to it after clicking away.
	 */
	const options = $derived.by(() => {
		const list = effectFieldChoices(candidates);
		if (value && !list.some((f) => effectFieldKey(f) === currentKey)) list.unshift(value);
		return list;
	});

	const canvas = $derived(custom ?? value ?? blankEffectField(5));
	const problem = $derived(effectFieldProblem(canvas));

	function toggleCell(i: number) {
		const data = [...canvas.data];
		data[i] = data[i] ? 0 : 1;
		const next = { width: canvas.width, height: canvas.height, data };
		custom = next;
		if (!effectFieldProblem(next)) onchange(next);
	}

	function resize(size: number) {
		const next = blankEffectField(size);
		custom = next;
		onchange(next);
	}
</script>

<div class="mt-1.5">
	<div class="flex flex-wrap items-center gap-2">
		{#each options as shape (effectFieldKey(shape))}
			<EffectFieldGrid
				field={shape}
				{color}
				selected={effectFieldKey(shape) === currentKey}
				label="{label} this pattern of slots"
				onselect={() => {
					painting = false;
					onchange(shape);
				}}
			/>
		{/each}
		<span class="text-[0.65rem] tracking-wider text-zinc-500">
			{label}
			{#if options.length > 1}({options.length} shapes){/if}
		</span>
		<button
			type="button"
			class="rounded border px-1.5 py-0.5 text-[0.65rem] tracking-wider {painting
				? 'border-amber-500 text-amber-400'
				: 'border-zinc-700 text-zinc-500 hover:border-zinc-500'}"
			aria-pressed={painting}
			onclick={() => (painting = !painting)}
		>
			Custom…
		</button>
	</div>

	{#if painting}
		<div class="mt-2 rounded border border-amber-700/60 bg-amber-950/20 p-2">
			<p class="mb-2 text-[0.7rem] leading-snug text-amber-300/90">
				<strong>Unsupported territory.</strong> The game only checks a field's shape when it builds one
				from its sprite — a field loaded from a save is used exactly as written, so this works, but no
				shape here has ever been through the game's own code. Keep a backup.
			</p>
			<div class="flex flex-wrap items-start gap-3">
				<EffectFieldGrid
					field={canvas}
					{color}
					label="Paint the {label.toLowerCase()} area"
					oncell={toggleCell}
				/>
				<label class="flex items-center gap-1 text-[0.7rem] text-zinc-400">
					Size
					<select
						class="rounded border-zinc-700 bg-zinc-950 px-1 py-0.5 text-[0.7rem]"
						value={canvas.width}
						onchange={(e) => resize(Number(e.currentTarget.value))}
					>
						{#each CUSTOM_FIELD_SIZES as size (size)}
							<option value={size}>{size}×{size}</option>
						{/each}
					</select>
				</label>
			</div>
			{#if problem}
				<p class="mt-2 text-[0.7rem] text-red-400">This field {problem}, so it was not saved.</p>
			{:else}
				<p class="mt-2 text-[0.7rem] text-zinc-500">
					Square and odd-sized, so the game reads it safely. Cells are relative to the ringed centre,
					where the module sits.
				</p>
			{/if}
		</div>
	{/if}
</div>
