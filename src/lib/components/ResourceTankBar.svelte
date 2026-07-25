<script lang="ts">
	import { resourceArt, resourceLabel } from '$lib/game/data';
	import { tintedIconStyle } from '$lib/game/pixel-icon';

	// One ship-resource tank drawn the way the game's HUD draws it (ship-resources.png):
	// a run of unit shapes, the full ones bright, the rest a hollow outline. The two
	// shapes and their three tints are ripped off the ResourceUnit prefab — a solid
	// `barFull`, a hollow `barEmpty`, both white-alpha masks the game colours with
	// `barColorFull` / `barColorEmpty`, and `barColorHi` for the hover flash.
	//
	// Hovering fills the bar up to the unit under the pointer in the highlight
	// colour, previewing the value a click would set — that click is the only way
	// this bar is edited, so there is no number field.
	let {
		id,
		value,
		max,
		scale = 3,
		onset
	}: {
		id: string;
		value: number;
		max: number | undefined;
		scale?: number;
		onset: (value: number) => void;
	} = $props();

	const art = $derived(resourceArt[id] ?? null);

	// How many units to draw. The tank's capacity when it has one, else enough to
	// show the current value; capped so a runaway max can't paint thousands of cells.
	const CELL_CAP = 300;
	const count = $derived(
		Math.min(CELL_CAP, Math.max(1, Math.round((max ?? 0) > 0 ? (max as number) : value)))
	);
	const filled = $derived(Math.max(0, Math.min(count, Math.round(value))));

	// Wrap into rows a touch tighter than the game packs — two units short of its
	// own width — so a wide tank like Health folds sooner and stops running off
	// the row.
	const perRow = $derived(
		art?.maxUnitPerRow && art.maxUnitPerRow > 0 ? Math.max(1, art.maxUnitPerRow - 2) : count
	);
	const rows = $derived.by(() => {
		const out: number[][] = [];
		for (let i = 0; i < count; i += perRow) {
			const row: number[] = [];
			for (let j = i; j < Math.min(i + perRow, count); j++) row.push(j);
			out.push(row);
		}
		return out;
	});

	// Unit under the pointer, or null when not hovering. Its index drives the
	// highlight preview and is what a click commits.
	let hover = $state<number | null>(null);

	function unitStyle(i: number): string {
		const full = art?.barFull ?? art?.icon ?? '';
		const empty = art?.barEmpty ?? full;
		const showFull = hover !== null ? i <= hover : i < filled;
		const src = showFull ? full : empty;
		// The hover preview fills in the resource's own colour, not the game's white
		// highlight sprite — that flash reads right only for Stamina and washes out
		// every other resource.
		const color = showFull
			? (art?.barColorFull ?? art?.color ?? '#ffffff')
			: (art?.barColorEmpty ?? art?.color ?? '#665c51');
		// Mask so the shared white-alpha shape takes the tint, exactly as the game
		// multiplies the unit colour over the sprite.
		return tintedIconStyle(src, scale, color);
	}

	function commit(i: number) {
		// Clicking the last full unit empties it, so the bar can be dragged down to
		// zero; otherwise the value becomes "up to and including this unit".
		onset(filled === i + 1 ? i : i + 1);
	}
</script>

<div
	class="flex flex-col gap-[3px]"
	role="group"
	aria-label={resourceLabel(id)}
	onmouseleave={() => (hover = null)}
>
	{#each rows as row, r (r)}
		<div class="flex items-end gap-[2px]">
			{#each row as i (i)}
				<button
					type="button"
					class="block cursor-pointer p-0"
					style={unitStyle(i)}
					aria-label="Set {resourceLabel(id)} to {i + 1}"
					onmouseenter={() => (hover = i)}
					onfocus={() => (hover = i)}
					onblur={() => (hover = null)}
					onclick={() => commit(i)}
				></button>
			{/each}
		</div>
	{/each}
</div>
