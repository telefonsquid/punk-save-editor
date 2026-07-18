<script lang="ts">
	import CustomFieldDialog from './CustomFieldDialog.svelte';
	import EffectFieldGrid from './EffectFieldGrid.svelte';
	import { effectFieldChoices, effectFieldKey, type EffectField } from '$lib/game/data';
	import { customFields } from '$lib/editor/custom-fields.svelte';

	// Picks the shape a power core or booster projects. The options come in two
	// bands: every orientation the game itself could roll (see
	// `effectFieldChoices`), and the shapes the player has painted. The split is
	// the point — staying in the first band keeps a module indistinguishable from
	// a legitimately rolled one, and the second says plainly that you have left
	// that behind.
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

	let adding = $state(false);

	const currentKey = $derived(value ? effectFieldKey(value) : null);
	const rolled = $derived(effectFieldChoices(candidates));
	const custom = $derived(customFields.list);

	/**
	 * A shape the module already has that is in neither band — a field painted on
	 * another machine, or one whose saved entry has since been deleted. Without
	 * this there would be no way back to it after clicking away.
	 */
	const orphan = $derived.by(() => {
		if (!value) return null;
		const known = [...rolled, ...custom].some((f) => effectFieldKey(f) === currentKey);
		return known ? null : value;
	});
</script>

<div class="mt-1.5">
	<div class="flex flex-wrap items-center gap-2">
		{#each rolled as shape (effectFieldKey(shape))}
			<EffectFieldGrid
				field={shape}
				{color}
				selected={effectFieldKey(shape) === currentKey}
				label="{label} this pattern of slots"
				onselect={() => onchange(shape)}
			/>
		{/each}
		{#if orphan}
			<EffectFieldGrid
				field={orphan}
				{color}
				selected
				label="{label} this pattern of slots (custom)"
				onselect={() => onchange(orphan)}
			/>
		{/if}
		<span class="text-[0.65rem] tracking-wider text-zinc-500">
			{label}
			{#if rolled.length > 1}({rolled.length} shapes){/if}
		</span>
	</div>

	<div class="mt-1.5 flex flex-wrap items-center gap-2">
		{#each custom as shape (effectFieldKey(shape))}
			{@const key = effectFieldKey(shape)}
			<!-- The remove button sits over its own shape rather than in a separate
			     list, so there is never a question which one it deletes. -->
			<span class="relative inline-block">
				<EffectFieldGrid
					field={shape}
					{color}
					selected={key === currentKey}
					label="{label} this custom pattern of slots"
					onselect={() => onchange(shape)}
				/>
				<button
					type="button"
					class="absolute -top-1.5 -right-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-1 text-[0.55rem] leading-none text-zinc-500 hover:border-red-500 hover:text-red-400"
					aria-label="Delete this custom shape"
					onclick={() => customFields.remove(key)}
				>
					×
				</button>
			</span>
		{/each}
		<button
			type="button"
			class="rounded border border-amber-800/70 px-1.5 py-0.5 text-[0.65rem] tracking-wider text-amber-500/80 hover:border-amber-500 hover:text-amber-400"
			onclick={() => (adding = true)}
		>
			+ Add custom shape
		</button>
		{#if custom.length > 0}
			<span class="text-[0.65rem] tracking-wider text-amber-700/80">CUSTOM</span>
		{/if}
	</div>
</div>

<!-- Mounted on demand: a chooser exists per field per module row, and every one
     of those keeping a closed <dialog> in the document costs a few dozen
     elements for nothing. -->
{#if adding}
	<CustomFieldDialog
		bind:open={adding}
		{color}
		onadd={(field) => {
			customFields.add(field);
			onchange(field); // painting one and not getting it would be a second click for nothing
		}}
	/>
{/if}
