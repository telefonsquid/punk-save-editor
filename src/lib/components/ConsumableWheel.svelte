<script lang="ts">
	import Button from './Button.svelte';
	import ItemIcon from './ItemIcon.svelte';
	import RichText from './RichText.svelte';
	import { numInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { assets, displayName } from '$lib/game/data';
	import type { ConsumableView } from '$lib/save/vault';
	import { getConsumables, removeConsumable, reorderConsumables } from '$lib/save/vault';

	let { editor }: { editor: EditorState } = $props();

	// The slot border is two nested diamonds, each a single stroked polygon. A
	// stroke on a true 45-degree line snaps to one clean pixel staircase when drawn
	// crisp, unlike a border painted cell by cell on a fractional grid, which
	// rounded neighbouring cells to different widths and read wonky.
	const BOX = 100;
	const C = BOX / 2;
	// A diamond of radius r: its four points on the axes through the centre.
	const diamondAt = (r: number) => `${C - r},${C} ${C},${C - r} ${C + r},${C} ${C},${C + r}`;
	// Outer edge, then the inner one set well inside it so the game's double border
	// reads as two clear lines with black between, not one thick rim.
	const diamondOuterPoints = diamondAt(47);
	const diamondInnerPoints = diamondAt(38);
	// The flat interior reaches just under the outer stroke, which paints over its edge.
	const diamondFillPoints = diamondAt(46);

	// The eight radial positions of the game's consumable wheel (consumable_circle.png),
	// starting at the top and going clockwise. Each entry is a percentage offset of
	// the slot's centre inside the square wheel. The radii are near-equal so the ring
	// reads as a round circle, not an oval.
	const SLOTS = 8;
	const RADIUS_X = 40;
	const RADIUS_Y = 39;
	const positions = Array.from({ length: SLOTS }, (_, k) => {
		const a = (-90 + k * 45) * (Math.PI / 180);
		return { x: 50 + RADIUS_X * Math.cos(a), y: 50 + RADIUS_Y * Math.sin(a) };
	});

	// One drawn slot: the live vault node to write through, plus a snapshot of the
	// scalars the ring renders. The snapshot is what makes edits show — a derived
	// that handed back the same node object each recompute would look unchanged to
	// Svelte (referential equality), so mutating `amount` in place would never
	// repaint (same reason `moduleRows` snapshots).
	interface Slot {
		node: ConsumableView;
		id: string;
		amount: number;
	}

	// Only consumables the player actually holds show on the ring: a slot that was
	// removed (null id) or dropped to zero is gone from the wheel, not drawn empty
	// with a 0 on it. The kept ones pack to the front and the ring is padded out to
	// eight so it always reads as a full circle.
	const slots = $derived.by(() => {
		if (editor.version < 0 || !editor.slot) return [];
		const arr = getConsumables(editor.slot.vault)
			.filter((c) => c.consumableId != null && c.amount > 0)
			.map((c) => ({ node: c, id: c.consumableId as string, amount: c.amount })) as (Slot | null)[];
		while (arr.length < SLOTS) arr.push(null);
		return arr;
	});

	// A consumable is selected only by clicking it; the selected one's name and
	// description (and its remove button) fill the centre. Nothing shows until a
	// slot is picked — hovering does nothing.
	let pinned = $state<string | null>(null);
	const centre = $derived(pinned);

	// Index into the vault's filled slots (id set), which is what reorder/remove
	// count — read from the raw vault, not the display list, so hiding a zeroed
	// slot never shifts the index a remove would act on.
	function filledIndexOf(id: string): number {
		if (!editor.slot) return -1;
		return getConsumables(editor.slot.vault)
			.filter((c) => c.consumableId != null)
			.findIndex((c) => c.consumableId === id);
	}

	let dragId = $state<string | null>(null);

	// The count field of each drawn slot, so a +/- nudge can push the new number
	// straight into the box the instant it is clicked, whatever the field's focus.
	let countInputs: (HTMLInputElement | null)[] = [];

	function drop(targetId: string | null) {
		if (editor.slot && dragId && targetId && dragId !== targetId) {
			const from = filledIndexOf(dragId);
			const to = filledIndexOf(targetId);
			if (from >= 0 && to >= 0) {
				reorderConsumables(editor.slot.vault, from, to);
				editor.markCurated();
				editor.refresh();
			}
		}
		dragId = null;
	}

	function remove(id: string) {
		if (!editor.slot) return;
		removeConsumable(editor.slot.vault, filledIndexOf(id));
		if (pinned === id) pinned = null;
		editor.markCurated();
		editor.refresh();
	}

	// The +/- keys beside the count. Nudge the live vault node one step, clamped to
	// the consumable's own max so a slot can't hold more than the game allows.
	function step(node: ConsumableView, delta: number, i: number) {
		if (!node.consumableId) return;
		const max = assets[node.consumableId]?.maxCount ?? Infinity;
		const next = Math.max(0, Math.min(max, (node.amount ?? 0) + delta));
		// Stepping to zero empties the slot, same as Remove — a 0-count consumable
		// is not something the vault should keep.
		if (next <= 0) {
			remove(node.consumableId);
			return;
		}
		node.amount = next;
		// Write the number into the field as well, so a nudge shows the instant you
		// click even if the caret is sitting in the box. The count is capped at the
		// consumable's own max, so + stops once the slot is full.
		const el = countInputs[i];
		if (el) el.value = String(next);
		editor.markCurated();
		editor.refresh();
	}
</script>

<div class="mx-auto aspect-square w-full max-w-[42rem]" role="group" aria-label="Consumables">
	<div class="relative h-full w-full">
		<!-- Centre: the selected consumable's name, description and remove button,
		     exactly where the game prints them inside the ring. -->
		<div class="absolute top-1/2 left-1/2 w-2/5 -translate-x-1/2 -translate-y-1/2 text-center">
			{#if centre}
				<h3 class="punk-title-shadow text-hud-md text-ink uppercase" style="font-family: var(--font-title)">
					{displayName(centre)}
				</h3>
				<p class="mt-1 text-ui-xs text-muted">
					<RichText text={assets[centre]?.description} />
				</p>
				<div class="mt-3 flex justify-center">
					<Button variant="primary" size="sm" onclick={() => remove(centre)}>Remove</Button>
				</div>
			{/if}
		</div>

		{#each positions as p, i (i)}
			{@const c = slots[i]}
			{@const id = c?.id ?? null}
			{@const active = id != null && centre === id}
			<div
				class="absolute flex flex-col items-center gap-2.5"
				style="left: {p.x}%; top: {p.y}%; transform: translate(-50%, -50%)"
			>
				{#if c}
					<button
						type="button"
						class="diamond {active ? 'is-active' : 'is-filled'}"
						draggable="true"
						aria-label={displayName(id)}
						title={displayName(id)}
						onclick={() => (pinned = pinned === id ? null : id)}
						ondragstart={() => (dragId = id)}
						ondragend={() => (dragId = null)}
						ondragover={(e) => e.preventDefault()}
						ondrop={() => drop(id)}
					>
						{@render frame()}
						<span class="diamond-icon"><ItemIcon {id} scale={2} /></span>
					</button>
					<!-- The amount / max badge under the diamond, in its own little box like
					     the game prints it; the amount edits in place. The brown +/- keys
					     sit outside the box and nudge it a step at a time. -->
					<span class="count-row">
						<button
							type="button"
							class="count-step"
							aria-label="Fewer {displayName(id)}"
							onclick={() => step(c.node, -1, i)}>-</button
						>
						<span class="count">
							<input
								type="number"
								min="0"
								class="count-num"
								bind:this={countInputs[i]}
								value={c.amount}
								oninput={numInput(c.node, 'amount')}
							/><span class="text-muted">/{assets[c.id]?.maxCount ?? '∞'}</span>
						</span>
						<button
							type="button"
							class="count-step"
							aria-label="More {displayName(id)}"
							onclick={() => step(c.node, 1, i)}>+</button
						>
					</span>
				{:else}
					<span class="diamond is-empty" aria-hidden="true">{@render frame()}</span>
				{/if}
			</div>
		{/each}
	</div>
</div>

<!-- The slot frame: a flat diamond interior with two thin stroked rings on top.
     shape-rendering: crispEdges keeps each stroke a hard pixel staircase. Outer and
     inner ring are the game's double border; the state class on the slot tints both
     and lights the selected one. -->
{#snippet frame()}
	<svg class="diamond-svg" viewBox="0 0 {BOX} {BOX}" aria-hidden="true">
		<polygon class="diamond-fill" points={diamondFillPoints} />
		<polygon class="diamond-inner" points={diamondInnerPoints} />
		<polygon class="diamond-outer" points={diamondOuterPoints} />
	</svg>
{/snippet}

<style>
	/* A wheel slot: a square box the SVG diamond is painted into. No rotation — the
	   diamond is drawn as a shape, so the icon sits upright without counter-rotating. */
	.diamond {
		position: relative;
		/* Half again as big as the icon it holds; the icon keeps its own fixed scale
		   below, so only the frame grows, not its contents. */
		width: 7.875rem;
		height: 7.875rem;
		display: grid;
		place-items: center;
		background: transparent;
		border: 0;
		padding: 0;
		transition: none;
	}

	.diamond-svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		/* Hard pixel edges on the diagonals instead of a smoothed line. */
		shape-rendering: crispEdges;
		overflow: visible;
	}

	.diamond-fill {
		fill: color-mix(in srgb, var(--color-surface) 80%, transparent);
	}

	/* Two nested diamond rings, each a thin stroked line. The outer carries the
	   state colour; the inner is kept faint so it just suggests the game's double
	   edge without competing. */
	.diamond-outer {
		fill: none;
		stroke: var(--color-edge-dim);
		stroke-width: 1.5;
	}

	.diamond-inner {
		fill: none;
		stroke: var(--color-edge-dim);
		stroke-width: 1.5;
		opacity: 0.3;
	}

	/* Icon rides a touch larger than its natural scale so it fills the roomier box. */
	.diamond-icon {
		position: relative;
		z-index: 1;
		transform: scale(1.3);
		display: grid;
		place-items: center;
	}

	.is-filled {
		cursor: pointer;
	}

	.is-filled .diamond-outer {
		stroke: var(--color-edge);
	}

	.is-filled .diamond-inner {
		stroke: var(--color-edge);
	}

	.is-filled:hover .diamond-outer {
		stroke: var(--color-accent);
	}

	/* A soft shadow the colour of the border, dropped straight down, so a filled
	   slot sits a little proud of the wheel like the game's does. */
	.is-filled .diamond-svg {
		filter: drop-shadow(0 3px 2px color-mix(in srgb, var(--color-edge) 55%, transparent));
	}

	/* The selected slot lights both borders in the accent and drops the same
	   downward shadow, only brighter — the game's highlighted pick. */
	.is-active {
		cursor: pointer;
	}

	.is-active .diamond-outer {
		stroke: var(--color-accent);
	}

	.is-active .diamond-inner {
		stroke: var(--color-accent);
	}

	.is-active .diamond-svg {
		filter: drop-shadow(0 3px 3px color-mix(in srgb, var(--color-accent) 60%, transparent));
	}

	.is-empty {
		opacity: 0.6;
	}

	/* The number box with its two step keys either side, kept on one line under
	   the slot. */
	.count-row {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	/* Brown +/- keys: bare glyphs, no box, so they read as quiet controls beside
	   the framed number rather than buttons in their own right. */
	.count-step {
		font-family: var(--font-title);
		font-size: 21px;
		line-height: 1;
		letter-spacing: normal;
		color: var(--color-muted);
		background: transparent;
		border: 0;
		padding: 0 4px;
		cursor: pointer;
	}

	.count-step:hover {
		color: var(--color-accent);
	}

	/* The count sits in its own bordered box, the way the game frames it under the
	   slot. */
	.count {
		display: inline-flex;
		align-items: baseline;
		gap: 1px;
		padding: 2px 7px;
		border: 2px solid var(--color-edge-dim);
		border-radius: 3px;
		background-color: var(--color-surface);
		font-family: var(--font-title);
		font-size: 13px;
		letter-spacing: normal;
		color: var(--color-ink);
	}

	.count-num {
		/* Hug the digits so the whole amount / max badge stays centred under the
		   slot no matter how many digits the amount has. */
		field-sizing: content;
		min-width: 1ch;
		background-color: transparent;
		border: 0;
		padding: 0;
		text-align: right;
		font: inherit;
		color: inherit;
	}

	.count-num:focus {
		outline: none;
		/* @tailwindcss/forms drops a blue focus ring on every number field; the
		   accent recolour is the only editing cue this box needs. */
		box-shadow: none;
		color: var(--color-accent);
	}

	.count-num::-webkit-outer-spin-button,
	.count-num::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.count-num {
		appearance: textfield;
		-moz-appearance: textfield;
	}
</style>
