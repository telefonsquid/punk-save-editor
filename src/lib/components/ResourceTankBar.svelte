<script lang="ts">
	import { resourceArt, resourceLabel } from '$lib/game/data';
	import { tintedIconStyle } from '$lib/game/pixel-icon';
	import { sound } from '$lib/sound.svelte';

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
			? (art?.barColorFull ?? art?.color ?? 'var(--color-ink)')
			: (art?.barColorEmpty ?? art?.color ?? 'var(--color-edge)');
		// Mask so the shared white-alpha shape takes the tint, exactly as the game
		// multiplies the unit colour over the sprite.
		return tintedIconStyle(src, scale, color);
	}

	/**
	 * The one way out of this component, whichever input asked. Both callers can
	 * name a value the bar is already at — the arrows at either end, a click on
	 * the unit past the last one — and a bar that ticks without moving reads as
	 * an edit that didn't take, so the sound follows the change rather than the
	 * press. The tick is the vault screen's own, the sound every editing control
	 * in the app makes.
	 */
	function set(next: number) {
		const v = Math.max(0, Math.min(count, next));
		if (v === filled) return;
		sound.play('close');
		onset(v);
	}

	function commit(i: number) {
		// Clicking the last full unit empties it, so the bar can be dragged down to
		// zero; otherwise the value becomes "up to and including this unit".
		set(filled === i + 1 ? i : i + 1);
	}

	/**
	 * The bar is ONE control, not one per unit.
	 *
	 * Every unit used to be its own button, which put a tank between the previous
	 * control and the next one by up to `CELL_CAP` tab stops, and made "set this
	 * to 40" a matter of tabbing forty times. So the row carries the slider role
	 * and the value, the units are left as pointer targets, and the keyboard gets
	 * the arrows it would expect from a slider anywhere else.
	 */
	function onkeydown(event: KeyboardEvent) {
		const step = event.shiftKey ? 10 : 1;
		const next =
			{
				ArrowRight: filled + step,
				ArrowUp: filled + step,
				ArrowLeft: filled - step,
				ArrowDown: filled - step,
				PageUp: filled + 10,
				PageDown: filled - 10,
				Home: 0,
				End: count
			}[event.key] ?? null;
		if (next === null) return;
		event.preventDefault();
		set(next);
	}
</script>

<div
	class="tank flex flex-col gap-[3px]"
	role="slider"
	tabindex="0"
	aria-label={resourceLabel(id)}
	aria-valuenow={filled}
	aria-valuemin={0}
	aria-valuemax={count}
	aria-valuetext="{filled} of {count}"
	{onkeydown}
	onmouseleave={() => (hover = null)}
	onblur={() => (hover = null)}
>
	{#each rows as row, r (r)}
		<div class="flex items-end gap-[2px]">
			{#each row as i (i)}
				<!-- Pointer targets only: the row above is what the keyboard and a
				     screen reader see, so a unit is neither focusable nor announced. -->
				<button
					type="button"
					class="block cursor-pointer p-0"
					style={unitStyle(i)}
					tabindex="-1"
					aria-hidden="true"
					onmouseenter={() => (hover = i)}
					onclick={() => commit(i)}
				></button>
			{/each}
		</div>
	{/each}
</div>

<style>
	/* The focus ring belongs to the whole bar now that the bar is the control. */
	.tank:focus-visible {
		outline: var(--u) solid var(--color-accent);
		outline-offset: var(--u);
	}
</style>
