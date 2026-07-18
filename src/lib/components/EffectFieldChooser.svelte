<script lang="ts">
	import CustomFieldDialog from './CustomFieldDialog.svelte';
	import EffectFieldGrid from './EffectFieldGrid.svelte';
	import {
		effectFieldChoices,
		effectFieldKey,
		resourceColor,
		type EffectField
	} from '$lib/game/data';
	import { customFields } from '$lib/editor/custom-fields.svelte';

	// Picks the shape a power core or booster projects: every orientation the
	// game itself could roll (see `effectFieldChoices`), then the shapes the
	// player has painted, then the button to paint another. Hand-painted ones sit
	// in the same row as the rest but carry a marker, because the distinction
	// that matters — this one the game could not have rolled — belongs on the
	// shape itself, not on a heading a long way from it.
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
		/** What this field does, e.g. "POWERS" or "BOOSTS". Used for labelling only. */
		label: string;
		onchange: (field: EffectField) => void;
	} = $props();

	let adding = $state(false);

	// The game's own health red, taken from the resource rather than hard-coded,
	// so the badge stays in step if the extraction ever picks up a new palette.
	const markColor = resourceColor('Resource Health') ?? '#ff0000';

	const currentKey = $derived(value ? effectFieldKey(value) : null);
	const rolled = $derived(effectFieldChoices(candidates));
	const custom = $derived(customFields.list);

	/**
	 * A shape the module already has that is in neither list — a field painted on
	 * another machine, or one whose saved entry has since been deleted. Without
	 * this there would be no way back to it after clicking away.
	 */
	const orphan = $derived.by(() => {
		if (!value) return null;
		const known = [...rolled, ...custom].some((f) => effectFieldKey(f) === currentKey);
		return known ? null : value;
	});
</script>

<!-- Straddles the top border of its shape, where it can't be mistaken for a
     painted cell. The tooltip lives on the wrapper so hovering anywhere on the
     shape explains the mark. -->
{#snippet userMark()}
	<svg
		class="pointer-events-none absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-zinc-900 p-px"
		style:color={markColor}
		viewBox="0 0 16 16"
		fill="currentColor"
		aria-hidden="true"
	>
		<circle cx="8" cy="5" r="3" />
		<path d="M2 15a6 6 0 0 1 12 0z" />
	</svg>
{/snippet}

<div class="mt-1.5 flex flex-wrap items-center gap-2">
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
		<!-- `inline-flex`, not `inline-block`: an inline-block box carries the line's
		     descender space, which would push both badges off the grid's own edge. -->
		<span class="relative inline-flex" title="User-defined custom shape">
			<EffectFieldGrid
				field={orphan}
				{color}
				selected
				label="{label} this custom pattern of slots"
				onselect={() => onchange(orphan)}
			/>
			{@render userMark()}
		</span>
	{/if}

	{#each custom as shape (effectFieldKey(shape))}
		{@const key = effectFieldKey(shape)}
		<!-- The marker and the remove button both sit on the shape rather than in a
		     separate list, so there is never a question which one they belong to. -->
		<!-- `inline-flex`, not `inline-block`: an inline-block box carries the line's
		     descender space, which would push both badges off the grid's own edge. -->
		<span class="relative inline-flex" title="User-defined custom shape">
			<EffectFieldGrid
				field={shape}
				{color}
				selected={key === currentKey}
				label="{label} this custom pattern of slots"
				onselect={() => onchange(shape)}
			/>
			{@render userMark()}
			<button
				type="button"
				class="absolute -top-[0.375rem] -right-[0.375rem] flex size-3 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-red-500 hover:text-red-400"
				title="Delete this custom shape"
				aria-label="Delete this custom shape"
				onclick={() => customFields.remove(key)}
			>
				<!-- A drawn cross rather than the × glyph: a glyph sits on the text
				     baseline, which leaves it a pixel or two high in a box this small
				     however the line box is centred. -->
				<svg class="size-1.5" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.75">
					<path d="M1 1l6 6M7 1l-6 6" />
				</svg>
			</button>
		</span>
	{/each}

	<!-- Same footprint, square corners and 2px edge as a selected shape's ring, so
	     it reads as the next tile in the row rather than a control beside it; the
	     modal does the explaining. -->
	<button
		type="button"
		class="inline-flex size-14 items-center justify-center border-2 border-dashed border-zinc-700 text-zinc-600 hover:border-amber-500 hover:text-amber-400"
		title="Add custom shape"
		aria-label="Add custom shape"
		onclick={() => (adding = true)}
	>
		<!-- Drawn, like the delete cross: a `+` glyph sits on the text baseline and
		     carries the font's own side bearings, so it can be neither centred nor
		     sized against the tile it fills. -->
		<svg class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M12 5v14M5 12h14" />
		</svg>
	</button>
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
