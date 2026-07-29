<script lang="ts">
	import Button from './Button.svelte';
	import InlineNumber from './InlineNumber.svelte';
	import ItemIcon from './ItemIcon.svelte';
	import RichText from './RichText.svelte';
	import { consumableInput } from '$lib/editor/inputs';
	import type { EditorState } from '$lib/editor/state.svelte';
	import { assets, displayName } from '$lib/game/data';
	import type { ConsumableView } from '$lib/save/vault';
	import {
		getConsumables,
		removeConsumable,
		reorderConsumables,
		setConsumableAmount
	} from '$lib/save/vault';
	import { sound } from '$lib/sound.svelte';

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

	// A slot is the game's own wheel diamond rather than a `Button`, so it plays
	// its click itself — same tick as the tank bars, the connection cells and the
	// number fields.
	function pick(id: string) {
		sound.play('close');
		pinned = pinned === id ? null : id;
	}

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
	let countInputs: (HTMLInputElement | null)[] = $state([]);

	/** Moves the consumable held in `from` to `to`, both counting filled slots. */
	function move(from: number, to: number): void {
		if (!editor.slot || from < 0 || to < 0 || from === to) return;
		const filled = getConsumables(editor.slot.vault).filter((c) => c.consumableId != null);
		if (to >= filled.length) return;
		reorderConsumables(editor.slot.vault, from, to);
		editor.touch('vault');
	}

	/**
	 * A slot drag carries the consumable's id as its payload. A drag with none of
	 * its own is not inert — the browser looks inside the control for something
	 * draggable and finds the icon, so the sprite becomes the drag source and
	 * Windows hands it to the shell as a file, dragging the picture out of the
	 * window instead of moving the slot. (ItemIcon's img is marked undraggable
	 * for the same reason; both halves are needed.) Firefox is the other end of
	 * it and won't begin a drag at all without a payload.
	 */
	function dragStart(event: DragEvent, id: string) {
		dragId = id;
		event.dataTransfer?.setData('text/plain', id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	// A drop target has to refuse the default to be one at all. `move` also swaps
	// the cursor off the copy badge, since nothing here is being duplicated.
	function dragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
	}

	function drop(event: DragEvent, targetId: string | null) {
		event.preventDefault();
		if (dragId && targetId) move(filledIndexOf(dragId), filledIndexOf(targetId));
		dragId = null;
	}

	/**
	 * Alt+Arrow walks a slot around the ring — the keyboard's way to do what
	 * dragging does. Focus follows the consumable rather than the position it
	 * left, since the thing being moved is what the user is tracking; the ring's
	 * boxes are keyed by position, so the element has to be looked up again after
	 * the reorder repaints.
	 */
	function reorderKeys(event: KeyboardEvent, id: string) {
		if (!event.altKey) return;
		const delta =
			event.key === 'ArrowRight' || event.key === 'ArrowDown'
				? 1
				: event.key === 'ArrowLeft' || event.key === 'ArrowUp'
					? -1
					: 0;
		if (!delta) return;
		event.preventDefault();
		move(filledIndexOf(id), filledIndexOf(id) + delta);
		requestAnimationFrame(() =>
			document.querySelector<HTMLElement>(`[data-slot="${CSS.escape(id)}"]`)?.focus()
		);
	}

	function remove(id: string) {
		if (!editor.slot) return;
		removeConsumable(editor.slot.vault, filledIndexOf(id));
		if (pinned === id) pinned = null;
		editor.touch('vault');
	}

	// The +/- keys beside the count. Nudge the live vault node one step, clamped to
	// the consumable's own max so a slot can't hold more than the game allows.
	// Zero empties the slot — the shared rule, same as typing a zero into the box.
	function step(node: ConsumableView, delta: number, i: number) {
		if (!node.consumableId || !editor.slot) return;
		const id = node.consumableId;
		const max = assets[id]?.maxCount ?? Infinity;
		const held = node.amount ?? 0;
		const next = Math.max(0, Math.min(max, held + delta));
		// A key at either end of the clamp has nothing to do, and neither ticking
		// nor dirtying the vault for it is honest — a full slot's + is a no-op.
		if (next === held) return;
		sound.play('close');
		setConsumableAmount(editor.slot.vault, id, next);
		if (next <= 0 && pinned === id) pinned = null;
		// Write the number into the field as well, so a nudge shows the instant you
		// click even if the caret is sitting in the box. The count is capped at the
		// consumable's own max, so + stops once the slot is full.
		const el = countInputs[i];
		if (el) el.value = String(next);
		editor.touch('vault');
	}
</script>

<div class="mx-auto aspect-square w-full max-w-[42rem]" role="group" aria-label="Consumables">
	<div class="relative h-full w-full">
		<!-- Centre: the selected consumable's name, description and remove button,
		     exactly where the game prints them inside the ring. -->
		<div class="absolute top-1/2 left-1/2 w-2/5 -translate-x-1/2 -translate-y-1/2 text-center">
			{#if centre}
				<h3 class="punk-title-shadow font-title text-hud-md text-ink uppercase">
					{displayName(centre)}
				</h3>
				<p class="mt-1 text-ui-xs text-muted">
					<RichText text={assets[centre]?.description} />
				</p>
				<div class="mt-3 flex justify-center">
					<!-- Taking a consumable out of the vault is a wheel edit, so it makes
					     the wheel's noise rather than the generic OK — same as the Add row
					     under it. -->
					<Button variant="danger" size="sm" sound="close" onclick={() => remove(centre)}>
						Remove
					</Button>
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
						data-slot={id}
						aria-label={displayName(id)}
						aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
						title={displayName(id)}
						onclick={() => pick(c.id)}
						onkeydown={(e) => reorderKeys(e, c.id)}
						ondragstart={(e) => dragStart(e, c.id)}
						ondragend={() => (dragId = null)}
						ondragover={dragOver}
						ondrop={(e) => drop(e, id)}
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
							<InlineNumber
								size="xs"
								min="0"
								bind:element={countInputs[i]}
								value={c.amount}
								{...consumableInput(editor, c.node, assets[c.id]?.maxCount)}
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
	   slot. Square-cornered like every other box in the app — the editable number
	   inside it is the shared InlineNumber, so it needs no chrome of its own. */
	.count {
		display: inline-flex;
		align-items: baseline;
		gap: 1px;
		padding: 2px 7px;
		border: 2px solid var(--color-edge-dim);
		background-color: var(--color-surface);
		font-family: var(--font-title);
		font-size: 13px;
		letter-spacing: normal;
		color: var(--color-ink);
	}
</style>
