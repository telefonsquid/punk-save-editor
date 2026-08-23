<script lang="ts">
	import Button from '../Button.svelte';
	import EditChip from './EditChip.svelte';
	import GridHoverCard from './GridHoverCard.svelte';
	import GridModuleTile from './GridModuleTile.svelte';
	import { SLOT_MARKERS, type SlotMarker } from './slot-markers';
	import type { GridEditorState } from '$lib/editor/grid.svelte';
	import { displayName } from '$lib/game/data';
	import {
		DIRECTIONS,
		cellKey,
		fieldCells,
		parseCell,
		type CellKey,
		type ConnectionSide
	} from '$lib/game/grid-rules';

	let {
		grid,
		onedit
	}: {
		grid: GridEditorState;
		/** The hovered module's EDIT chip was clicked. */
		onedit?: (key: CellKey) => void;
	} = $props();

	// Zoom is a local game pixel: cells are 28u, so stepping u rescales the whole
	// board, and the item art rides one integer behind it (24px sprites at 1x/2x/3x
	// in a 56/84/112px cell) so it never leaves the pixel grid.
	const U_LEVELS = [2, 3, 4];
	let zoom = $state(1);
	const u = $derived(U_LEVELS[zoom]);
	const cell = $derived(28 * u);
	const iconScale = $derived(u - 1);

	let viewport = $state<HTMLElement | null>(null);
	let width = $state(0);
	let height = $state(0);
	// The screen position of the grid's world origin. A cell (x, y) draws its
	// top-left corner at (panX + x*cell, panY - (y+1)*cell) — the flip is the
	// grid's y axis pointing up while the screen's points down.
	let panX = $state(0);
	let panY = $state(0);

	/** Puts a cell's centre in the middle of the viewport. */
	function centerOn(x: number, y: number) {
		panX = width / 2 - (x + 0.5) * cell;
		panY = height / 2 + (y + 0.5) * cell;
	}

	// Open where the game opens: two cells below the ship slot. Runs once the
	// dialog has laid the canvas out (it mounts inside a closed <dialog>, so the
	// first measurable width arrives a beat after mount). The flag is plain on
	// purpose — nothing renders it, and the effect only touches the pan state.
	let centered = false;
	$effect(() => {
		if (!centered && width > 0) {
			centerOn(50, 48);
			centered = true;
		}
	});

	// --- pan (drag), hover, zoom ------------------------------------------------

	let dragging = $state(false);
	let lastX = 0;
	let lastY = 0;
	// A press that barely moves is a click — the game's pick-up/drop — while a
	// real drag pans. 5px of total travel is the line between the two.
	let downX = 0;
	let downY = 0;
	let dragMoved = false;

	// A paint stroke: left lays the brush down, right erases; both drag.
	let painting = $state(false);
	let paintErase = false;

	function cellAt(e: PointerEvent): CellKey | null {
		if (!viewport) return null;
		const rect = viewport.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		return cellKey(Math.floor((mx - panX) / cell), Math.floor((panY - my) / cell));
	}

	function onpointerdown(e: PointerEvent) {
		if (grid.mode === 'paint' && (e.button === 0 || e.button === 2)) {
			painting = true;
			paintErase = e.button === 2;
			grid.beginStroke();
			const key = cellAt(e);
			if (key) grid.paint(key, paintErase);
			viewport?.setPointerCapture(e.pointerId);
			return;
		}
		if (e.button !== 0 && e.button !== 1) return;
		dragging = true;
		dragMoved = false;
		downX = lastX = e.clientX;
		downY = lastY = e.clientY;
		viewport?.setPointerCapture(e.pointerId);
	}

	function onpointermove(e: PointerEvent) {
		if (dragging) {
			panX += e.clientX - lastX;
			panY += e.clientY - lastY;
			lastX = e.clientX;
			lastY = e.clientY;
			if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 5) dragMoved = true;
		}
		const key = cellAt(e);
		grid.hovered = key;
		if (painting && key) grid.paint(key, paintErase);
	}

	function onpointerup(e: PointerEvent) {
		if (painting) {
			painting = false;
			grid.endStroke();
			return;
		}
		if (!dragging) return;
		dragging = false;
		if (e.button !== 0 || dragMoved || !grid.hovered || grid.mode !== 'modules') return;
		// The game's click: carrying drops, a module underneath picks up.
		if (grid.carried) grid.drop(grid.hovered);
		else if (grid.view?.modules.has(grid.hovered)) grid.pickUp(grid.hovered);
	}

	function onpointerleave() {
		grid.hovered = null;
	}

	// Right-click, as in game: cancels a carry, otherwise unequips to the vault.
	// In paint mode the right button is the eraser stroke handled above.
	function oncontextmenu(e: MouseEvent) {
		e.preventDefault();
		if (grid.mode === 'paint') return;
		if (grid.carried) grid.cancelCarry();
		else if (grid.hovered && grid.view?.modules.has(grid.hovered)) grid.unequip(grid.hovered);
	}

	/** Steps the zoom, keeping the point under the cursor (or the centre) fixed. */
	function setZoom(index: number, e?: WheelEvent) {
		const next = Math.max(0, Math.min(U_LEVELS.length - 1, index));
		if (next === zoom || !viewport) return;
		const rect = viewport.getBoundingClientRect();
		const mx = e ? e.clientX - rect.left : width / 2;
		const my = e ? e.clientY - rect.top : height / 2;
		const k = (28 * U_LEVELS[next]) / cell;
		panX = mx - (mx - panX) * k;
		panY = my - (my - panY) * k;
		zoom = next;
	}

	function onwheel(e: WheelEvent) {
		e.preventDefault();
		setZoom(zoom + (e.deltaY < 0 ? 1 : -1), e);
	}

	// --- render lists, all rebuilt from the snapshot on every edit ---------------

	type Marker = { key: CellKey; x: number; y: number } & SlotMarker;

	// Special cells without a module on them (a placed module covers its own
	// marker); which glyph a slot type wears is `SLOT_MARKERS`'s call.
	const markers = $derived.by(() => {
		const view = grid.view;
		if (!view) return [];
		const out: Marker[] = [];
		for (const [key, typeId] of view.slotTypes) {
			if (view.modules.has(key)) continue;
			const marker = SLOT_MARKERS[typeId];
			if (marker) out.push({ key, ...parseCell(key), ...marker });
		}
		return out;
	});

	// Cells a powered booster's field reaches — the game tints their dots green.
	const boosted = $derived.by(() => {
		const view = grid.view;
		const sim = grid.sim;
		if (!view || !sim) return [];
		const out: { key: CellKey; x: number; y: number }[] = [];
		for (const [key, delta] of sim.levelDeltas) {
			if (delta <= 0 || view.modules.has(key)) continue;
			const marker = SLOT_MARKERS[view.slotTypes.get(key) ?? ''];
			if (marker && marker.kind !== 'main') continue; // the glyph owns the cell
			out.push({ key, ...parseCell(key) });
		}
		return out;
	});

	type Edges = { x: number; y: number; n: boolean; e: boolean; s: boolean; w: boolean };

	/** The boundary of a cell set, as per-cell "which sides are open" flags. */
	function boundary(cells: Set<CellKey>): Edges[] {
		const out: Edges[] = [];
		for (const key of cells) {
			const { x, y } = parseCell(key);
			const edges = {
				x,
				y,
				n: !cells.has(cellKey(x, y + 1)),
				e: !cells.has(cellKey(x + 1, y)),
				s: !cells.has(cellKey(x, y - 1)),
				w: !cells.has(cellKey(x - 1, y))
			};
			if (edges.n || edges.e || edges.s || edges.w) out.push(edges);
		}
		return out;
	}

	// The dashed outline around each cluster's core coverage.
	const clusterOutlines = $derived.by(() =>
		(grid.sim?.clusters ?? [])
			.filter((c) => c.reserved.size > 0)
			.map((c) => ({ name: c.name, edges: boundary(c.reserved) }))
	);

	// An unpowered core module previews where its field would reach.
	const corePreviews = $derived.by(() => {
		const view = grid.view;
		const sim = grid.sim;
		if (!view || !sim) return [];
		const out: { key: CellKey; edges: Edges[] }[] = [];
		for (const [key, module] of view.modules) {
			if (!module.powerCore || sim.poweredAndConnected.has(key)) continue;
			const { x, y } = parseCell(key);
			out.push({ key, edges: boundary(fieldCells(module.powerCore, x, y)) });
		}
		return out;
	});

	const tiles = $derived.by(() => {
		const view = grid.view;
		const sim = grid.sim;
		if (!view || !sim) return [];
		const badges = new Map(
			sim.clusters
				.filter((c) => c.main)
				.map((c) => [c.rootKey, { cores: c.attachedCores, budget: c.coreBudget }])
		);
		return [...view.modules]
			// A module carried off the grid leaves its cell visually empty; the
			// tree still holds it until the drop commits, exactly like the game.
			.filter(([key]) => !(grid.carried?.source === 'grid' && key === grid.carried.originKey))
			.map(([key, module]) => {
			const { x, y } = parseCell(key);
			const links = {} as Record<ConnectionSide, boolean>;
			for (const dir of DIRECTIONS) {
				const neighbour = view.modules.get(cellKey(x + dir.dx, y + dir.dy));
				links[dir.side] = !!neighbour && module[dir.side] && neighbour[dir.opposite];
			}
			return {
				key,
				x,
				y,
				module,
				links,
				level: sim.levels.get(key) ?? 1,
				dimmed: !sim.poweredAndConnected.has(key),
				badge: badges.get(key) ?? null
			};
		});
	});

	const hoveredTile = $derived(
		grid.hovered ? (tiles.find((t) => t.key === grid.hovered) ?? null) : null
	);
	// The card sits beside the hovered cell, flipping to whichever half of the
	// viewport has the room.
	const cardLeft = $derived(
		hoveredTile ? panX + (hoveredTile.x + 0.5) * cell < width / 2 : false
	);

	// Errors on show: a refused drop's flash, else whatever rules the live
	// layout breaks — free-mode drops and painted-over slots produce them, and
	// hiding them in strict mode would just hide the truth.
	const shownErrors = $derived(grid.flash?.errors ?? grid.errors);

	// While carrying: whether the hovered cell is a legal drop, and the cells
	// the module's own field would reach from there (the game's carry hint).
	const dropValid = $derived(
		!grid.carried || !grid.hovered ? true : grid.validateDrop(grid.hovered).length === 0
	);
	const carryHint = $derived.by(() => {
		const carried = grid.carried;
		if (!carried || !grid.hovered) return null;
		const field = carried.module.powerCore ?? carried.module.levelField;
		if (!field) return null;
		const { x, y } = parseCell(grid.hovered);
		return {
			kind: carried.module.powerCore ? 'power' : 'boost',
			cells: [...fieldCells(field, x, y)].map((k) => parseCell(k))
		};
	});

	const NO_LINKS: Record<ConnectionSide, boolean> = {
		north: false,
		east: false,
		south: false,
		west: false
	};
</script>

<div
	bind:this={viewport}
	bind:clientWidth={width}
	bind:clientHeight={height}
	class="viewport"
	class:is-dragging={dragging}
	style:--u="{u}px"
	style:background-size="{cell}px {cell}px"
	style:background-position="{panX}px {panY}px"
	role="application"
	aria-label="Module grid"
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	{onpointerleave}
	{onwheel}
	{oncontextmenu}
>
	<div class="plane" style:transform="translate({panX}px, {panY}px)">
		{#each markers as marker (marker.key)}
			<div
				class="cell marker-{marker.kind}"
				style:left="{marker.x * cell}px"
				style:top="{-(marker.y + 1) * cell}px"
			>
				{#if marker.kind === 'invalid'}
					<svg viewBox="0 0 10 10" class="glyph glyph-invalid" aria-hidden="true">
						<path d="M1 0 5 4 9 0 10 1 6 5 10 9 9 10 5 6 1 10 0 9 4 5 0 1Z" />
					</svg>
				{:else if marker.kind === 'boost'}
					<svg viewBox="0 0 10 10" class="glyph glyph-boost" aria-hidden="true">
						<path d="M4 0h2v4h4v2H6v4H4V6H0V4h4Z" />
					</svg>
				{:else if marker.kind === 'main'}
					<span class="main-slot">{marker.label}</span>
				{/if}
			</div>
		{/each}

		{#each boosted as spot (spot.key)}
			<div
				class="cell"
				style:left="{spot.x * cell}px"
				style:top="{-(spot.y + 1) * cell}px"
			>
				<span class="boost-dot"></span>
			</div>
		{/each}

		{#each clusterOutlines as outline (outline.name)}
			{#each outline.edges as edge (`${edge.x},${edge.y}`)}
				<div
					class="cell coverage"
					class:edge-n={edge.n}
					class:edge-e={edge.e}
					class:edge-s={edge.s}
					class:edge-w={edge.w}
					style:left="{edge.x * cell}px"
					style:top="{-(edge.y + 1) * cell}px"
				></div>
			{/each}
		{/each}

		{#each corePreviews as preview (preview.key)}
			{#each preview.edges as edge (`${edge.x},${edge.y}`)}
				<div
					class="cell coverage is-preview"
					class:edge-n={edge.n}
					class:edge-e={edge.e}
					class:edge-s={edge.s}
					class:edge-w={edge.w}
					style:left="{edge.x * cell}px"
					style:top="{-(edge.y + 1) * cell}px"
				></div>
			{/each}
		{/each}

		{#each tiles as tile (tile.key)}
			<div class="cell" style:left="{tile.x * cell}px" style:top="{-(tile.y + 1) * cell}px">
				<GridModuleTile
					module={tile.module}
					level={tile.level}
					dimmed={tile.dimmed}
					links={tile.links}
					badge={tile.badge}
					{iconScale}
				/>
			</div>
		{/each}

		{#if carryHint}
			{#each carryHint.cells as spot (`${spot.x},${spot.y}`)}
				<div
					class="cell hint is-{carryHint.kind}"
					style:left="{spot.x * cell}px"
					style:top="{-(spot.y + 1) * cell}px"
				></div>
			{/each}
		{/if}

		{#each shownErrors as error, i (i)}
			{#if error.dx !== undefined}
				<!-- A connection error marks the offending edge red, as the game does;
				     the mismatch errors both sides, so the neighbour marks its half of
				     the same boundary. -->
				<div
					class="cell error-edge"
					class:edge-n={error.dy === 1}
					class:edge-e={error.dx === 1}
					class:edge-s={error.dy === -1}
					class:edge-w={error.dx === -1}
					style:left="{error.x * cell}px"
					style:top="{-(error.y + 1) * cell}px"
				></div>
			{:else}
				<div
					class="cell error-ring"
					style:left="{error.x * cell}px"
					style:top="{-(error.y + 1) * cell}px"
				></div>
			{/if}
		{/each}

		{#if grid.hovered}
			{@const hover = parseCell(grid.hovered)}
			<div
				class="cell hover-ring"
				class:is-carrying={!!grid.carried}
				class:is-invalid={!!grid.carried && !dropValid}
				style:left="{hover.x * cell}px"
				style:top="{-(hover.y + 1) * cell}px"
			></div>
			{#if grid.carried}
				<div
					class="cell is-carried"
					style:left="{hover.x * cell}px"
					style:top="{-(hover.y + 1) * cell}px"
				>
					<GridModuleTile
						module={grid.carried.module}
						level={1}
						dimmed={false}
						links={NO_LINKS}
						badge={null}
						{iconScale}
					/>
				</div>
			{/if}
		{/if}

		{#if hoveredTile && !grid.carried && grid.mode === 'modules' && onedit}
			<div
				class="cell edit-anchor"
				style:left="{hoveredTile.x * cell}px"
				style:top="{-(hoveredTile.y + 1) * cell}px"
			>
				<EditChip
					class="canvas-chip"
					text="Edit"
					label="Edit {displayName(hoveredTile.module.id)}"
					onclick={() => onedit(hoveredTile.key)}
				/>
			</div>
		{/if}
	</div>

	{#if hoveredTile && !grid.carried}
		<div
			class="card-anchor"
			style:left="{panX + (hoveredTile.x + (cardLeft ? 1 : 0)) * cell + (cardLeft ? 16 : -16)}px"
			style:top="{panY - (hoveredTile.y + 1) * cell}px"
			class:is-left={!cardLeft}
		>
			<GridHoverCard module={hoveredTile.module} level={hoveredTile.level} badge={hoveredTile.badge} />
		</div>
	{/if}

	<div class="zoom-controls">
		<Button size="xs" variant="ghost" aria-label="Zoom out" disabled={zoom === 0}
			onclick={() => setZoom(zoom - 1)}>−</Button>
		<Button size="xs" variant="ghost" aria-label="Zoom in" disabled={zoom === U_LEVELS.length - 1}
			onclick={() => setZoom(zoom + 1)}>+</Button>
	</div>

	{#if grid.flash}
		<!-- The refused drop's reason, worded exactly as the game logs it. -->
		<p class="flash text-ui-xs">{grid.flash.message}</p>
	{/if}
</div>

<style>
	/* The infinite dot field is a repeating background, not DOM: one hollow ring
	   per cell, panned by offsetting the pattern. Cheap at any pan distance. */
	.viewport {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		cursor: grab;
		/* A pan is a drag, and a drag across unselectable text still starts a
		   selection — which paints every tile blue mid-pan. */
		user-select: none;
		background-color: var(--color-void);
		background-image: radial-gradient(
			circle,
			transparent calc(1.2 * var(--u)),
			var(--color-edge-dim) calc(1.2 * var(--u)),
			var(--color-edge-dim) calc(1.8 * var(--u)),
			transparent calc(1.8 * var(--u))
		);
		touch-action: none;
	}
	.viewport.is-dragging {
		cursor: grabbing;
	}

	.plane {
		position: absolute;
		top: 0;
		left: 0;
	}

	.cell {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		width: calc(28 * var(--u));
		height: calc(28 * var(--u));
		pointer-events: none;
	}

	.glyph {
		width: calc(7 * var(--u));
		height: calc(7 * var(--u));
	}
	.glyph-invalid {
		fill: var(--color-danger);
	}
	.glyph-boost {
		fill: var(--color-amber);
	}

	.boost-dot {
		width: calc(3 * var(--u));
		height: calc(3 * var(--u));
		border-radius: 50%;
		background-color: var(--color-regen);
		opacity: 0.5;
	}

	/* An empty main slot: the game's labelled octagon placeholder. */
	.main-slot {
		display: flex;
		align-items: center;
		justify-content: center;
		width: calc(24 * var(--u));
		height: calc(24 * var(--u));
		font-family: var(--font-title);
		font-size: round(calc(10 / 3 * var(--u)), 5px);
		letter-spacing: var(--tracking-hud);
		color: var(--color-edge);
		background-color: var(--color-surface);
		border: var(--u) solid var(--color-edge);
		clip-path: polygon(25% 0, 75% 0, 100% 25%, 100% 75%, 75% 100%, 25% 100%, 0 75%, 0 25%);
	}

	/* Cluster coverage: dashed cell borders drawn only on boundary sides, so the
	   set reads as one outlined region. Core previews are the same shape dimmer. */
	.coverage {
		border: 0 dashed var(--color-edge);
	}
	.coverage.is-preview {
		border-color: var(--color-edge-dim);
	}
	.edge-n {
		border-top-width: 2px;
	}
	.edge-e {
		border-right-width: 2px;
	}
	.edge-s {
		border-bottom-width: 2px;
	}
	.edge-w {
		border-left-width: 2px;
	}

	.hover-ring {
		border: 2px solid var(--color-edge);
	}
	/* Carrying, the ring is the drop target and answers with the verdict the
	   game's hover gives: accent for a legal drop, red for a refused one. */
	.hover-ring.is-carrying {
		border-color: var(--color-accent);
	}
	.hover-ring.is-invalid {
		border-color: var(--color-danger);
	}

	/* The carried module's own field, previewed around the cursor. */
	.hint.is-power {
		background-color: color-mix(in srgb, var(--color-power) 16%, transparent);
	}
	.hint.is-boost {
		background-color: color-mix(in srgb, var(--color-regen) 16%, transparent);
	}

	.error-ring {
		border: 2px solid var(--color-danger);
	}
	/* One red edge per connection error, on the shared .edge-* width classes. */
	.error-edge {
		border: 0 solid var(--color-danger);
	}

	.is-carried {
		opacity: 0.85;
	}

	.edit-anchor {
		z-index: 5;
	}
	/* The one clickable thing on the canvas besides the cells themselves — the
	   chip that opens the module's card editor, pinned to the tile's corner. */
	.edit-anchor :global(.canvas-chip) {
		position: absolute;
		top: calc(-1 * var(--u));
		right: calc(-1 * var(--u));
	}

	.card-anchor {
		position: absolute;
		z-index: 10;
		pointer-events: none;
	}
	.card-anchor.is-left {
		transform: translateX(-100%);
	}

	.zoom-controls {
		position: absolute;
		right: 1rem;
		bottom: 1rem;
		display: flex;
		gap: 0.5rem;
	}

	.flash {
		position: absolute;
		bottom: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.5rem 1rem;
		color: var(--color-danger);
		background-color: var(--color-void);
		border: 2px solid var(--color-danger);
		pointer-events: none;
	}
</style>
