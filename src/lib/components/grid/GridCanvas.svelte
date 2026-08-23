<script lang="ts">
	import Button from '../Button.svelte';
	import EditChip from './EditChip.svelte';
	import GridHoverCard from './GridHoverCard.svelte';
	import GridModuleTile from './GridModuleTile.svelte';
	import PixelSprite from './PixelSprite.svelte';
	import {
		GRID_CELL,
		SLOT_BLOCKED,
		SLOT_BOOST,
		SLOT_EMPTY,
		SLOT_SPECIAL,
		centredIn
	} from '$lib/game/grid-icons';
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
		cursorX,
		cursorY,
		onedit
	}: {
		grid: GridEditorState;
		/** Where the pointer is on screen — a carried module hangs off it. */
		cursorX: number;
		cursorY: number;
		/** The hovered module's EDIT chip was clicked. */
		onedit?: (key: CellKey) => void;
	} = $props();

	// Zoom is a local game pixel: a cell is GRID_CELL of them, so stepping u
	// rescales the whole board. The 24px item sprites scale by the same step, so
	// they stay 24 game pixels inside a 34-pixel cell, as in the game.
	const U_LEVELS = [2, 3, 4];
	let zoom = $state(1);
	const u = $derived(U_LEVELS[zoom]);
	const cell = $derived(GRID_CELL * u);

	// The empty-cell ring, tiled as a mask over one colour rather than drawn per
	// cell — cheap at any pan distance, and the colour stays a palette token
	// because a mask only reads alpha.
	const dotMask = `url("data:image/svg+xml,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID_CELL} ${GRID_CELL}">` +
			`<g transform="translate(${centredIn(SLOT_EMPTY)} ${centredIn(SLOT_EMPTY)})">` +
			SLOT_EMPTY.layers.map((l) => `<path d="${l.d}"/>`).join('') +
			`</g></svg>`
	)}")`;

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

	// Where the game opens: two cells below the ship slot, so the weapon row and
	// the gadget row both sit on screen. The Center button goes back to it.
	const HOME = { x: 50, y: 48 };

	// Runs once the dialog has laid the canvas out (it mounts inside a closed
	// <dialog>, so the first measurable width arrives a beat after mount). The
	// flag is plain on purpose — nothing renders it, and the effect only touches
	// the pan state.
	let centered = false;
	$effect(() => {
		if (!centered && width > 0) {
			centerOn(HOME.x, HOME.y);
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

	function cellAt(e: PointerEvent): CellKey | null {
		if (!viewport) return null;
		const rect = viewport.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		return cellKey(Math.floor((mx - panX) / cell), Math.floor((panY - my) / cell));
	}

	function onpointerdown(e: PointerEvent) {
		// The zoom buttons sit on the viewport — capturing their pointer would
		// retarget the pointerup and eat their click.
		if ((e.target as Element).closest('button')) return;
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
		grid.hovered = cellAt(e);
	}

	function onpointerup(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		if (e.button !== 0 || dragMoved || !grid.hovered) return;
		// The game's click: an armed brush paints its one cell, carrying drops,
		// a module underneath picks up. Shift places a copy — the brush stays
		// armed, a dropped module leaves an identical one on the cursor.
		if (grid.slotBrush) grid.paintOnce(grid.hovered, e.shiftKey);
		else if (grid.carried) grid.drop(grid.hovered, e.shiftKey);
		else if (grid.view?.modules.has(grid.hovered)) grid.pickUp(grid.hovered);
	}

	function onpointerleave() {
		grid.hovered = null;
	}

	// Right-click, as in game: cancels a carry (or the armed brush), otherwise
	// unequips to the vault.
	function oncontextmenu(e: MouseEvent) {
		e.preventDefault();
		if (grid.slotBrush) grid.disarmBrush();
		else if (grid.carried) grid.cancelCarry();
		else if (grid.hovered && grid.view?.modules.has(grid.hovered)) grid.unequip(grid.hovered);
	}

	// Steps the zoom around the middle of the viewport — whatever was in front of
	// you stays in front of you, wheel or button. Anchoring on the cursor instead
	// walks the board off screen over a few steps.
	function setZoom(index: number) {
		const next = Math.max(0, Math.min(U_LEVELS.length - 1, index));
		if (next === zoom) return;
		const k = U_LEVELS[next] / u;
		panX = width / 2 - (width / 2 - panX) * k;
		panY = height / 2 - (height / 2 - panY) * k;
		zoom = next;
	}

	function onwheel(e: WheelEvent) {
		e.preventDefault();
		setZoom(zoom + (e.deltaY < 0 ? 1 : -1));
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

	// Cells a powered booster's field reaches. They mean what a level-up slot
	// means, so they wear the same marker in place of the empty-cell ring.
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

</script>

<div
	bind:this={viewport}
	bind:clientWidth={width}
	bind:clientHeight={height}
	class="viewport"
	class:is-dragging={dragging}
	style:--cell="{cell}px"
	style:--pan-x="{panX}px"
	style:--pan-y="{panY}px"
	style:--dot-mask={dotMask}
	role="application"
	aria-label="Module grid"
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	{onpointerleave}
	{onwheel}
	{oncontextmenu}
>
	<!-- The zoom's game pixel belongs to the board, not to the screen: everything
	     inside here is drawn in it, while the chrome around it (the controls, the
	     hover card, a flashed error) keeps the page's own and holds its size at
	     every zoom. The two cursor ghosts hang outside the plane and take it as a
	     prop instead. -->
	<div class="plane" style:--u="{u}px" style:transform="translate({panX}px, {panY}px)">
		{#each markers as marker (marker.key)}
			<div
				class="cell marker-{marker.kind}"
				style:left="{marker.x * cell}px"
				style:top="{-(marker.y + 1) * cell}px"
			>
				{#if marker.kind === 'invalid'}
					<PixelSprite sprite={SLOT_BLOCKED} class="glyph-invalid" />
				{:else if marker.kind === 'boost'}
					<PixelSprite sprite={SLOT_BOOST} class="glyph-boost" />
				{:else if marker.kind === 'main'}
					<span class="main-slot">
						<PixelSprite sprite={SLOT_SPECIAL} />
						<span class="main-label">{marker.label}</span>
					</span>
				{/if}
			</div>
		{/each}

		{#each boosted as spot (spot.key)}
			<div
				class="cell boost-cell"
				style:left="{spot.x * cell}px"
				style:top="{-(spot.y + 1) * cell}px"
			>
				<!-- A booster's reach means the same thing a level-up slot does, and
				     the game marks it with the same ring — over the pattern's dot,
				     not tinting it. -->
				<PixelSprite sprite={SLOT_BOOST} class="glyph-boost" />
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
					{u}
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
			<!-- The drop target marks itself only while something is on the cursor:
			     with nothing to place, a ring following the pointer around an idle
			     board is noise. -->
			{#if grid.carried || grid.slotBrush}
				<div
					class="cell hover-ring"
					class:is-invalid={!!grid.carried && !dropValid}
					style:left="{hover.x * cell}px"
					style:top="{-(hover.y + 1) * cell}px"
				></div>
			{/if}
		{/if}

		{#if hoveredTile && !grid.carried && !grid.slotBrush && onedit}
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

	{#if grid.carried}
		<!-- The module hangs off the cursor rather than snapping to the cell under
		     it — the ring below says where it would land. Fixed, so it keeps
		     following the pointer out over the vault dock. -->
		<div class="carry-ghost" style:left="{cursorX}px" style:top="{cursorY}px">
			<GridModuleTile module={grid.carried.module} {u} />
		</div>
	{:else if grid.slotBrush}
		<!-- An armed brush is carried like a module: the marker it would leave
		     rides the cursor, and the ring below says which cell gets it. -->
		<div
			class="carry-ghost brush-ghost"
			style:--u="{u}px"
			style:left="{cursorX}px"
			style:top="{cursorY}px"
		>
			{#if grid.slotBrush === 'LevelUp'}
				<PixelSprite sprite={SLOT_BOOST} class="glyph-boost" />
			{:else if grid.slotBrush === 'Invalid'}
				<PixelSprite sprite={SLOT_BLOCKED} class="glyph-invalid" />
			{:else}
				<PixelSprite sprite={SLOT_EMPTY} class="glyph-empty" />
			{/if}
		</div>
	{/if}

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
		<!-- Panning has no bounds, so this is the way back from wherever you ended
		     up: the view the screen opens on. -->
		<Button size="xs" variant="ghost" aria-label="Center on the ship"
			onclick={() => centerOn(HOME.x, HOME.y)}>Center</Button>
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
		touch-action: none;
	}
	/* The infinite dot field: the game's ring on every empty cell, tiled from
	   `--dot-mask` and panned with the board. */
	.viewport::before {
		content: '';
		position: absolute;
		inset: 0;
		background-color: var(--color-dot);
		-webkit-mask-image: var(--dot-mask);
		mask-image: var(--dot-mask);
		-webkit-mask-size: var(--cell) var(--cell);
		mask-size: var(--cell) var(--cell);
		-webkit-mask-position: var(--pan-x) var(--pan-y);
		mask-position: var(--pan-x) var(--pan-y);
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
		width: var(--cell);
		height: var(--cell);
		pointer-events: none;
	}

	/* A special cell replaces its dot rather than sitting on it — the game
	   draws the marker on bare ground, so these blank the pattern's ring. */
	.marker-invalid,
	.marker-boost,
	.marker-main,
	.boost-cell {
		background-color: var(--color-void);
	}

	/* The three markers the grid's shader draws, in the colours it draws them —
	   on the board and on the cursor alike. */
	.viewport :global(.glyph-invalid) {
		color: var(--color-slot-block);
	}
	.viewport :global(.glyph-boost) {
		color: var(--color-slot-boost);
	}
	.viewport :global(.glyph-empty) {
		color: var(--color-dot);
	}

	/* An empty special slot: the game's own octagon, with the three letters its
	   widget carries sitting on top. */
	.main-slot {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-edge-dim);
	}
	/* In the body face, not the HUD one the badges use — the game bakes its label
	   into the widget's sprite sheet and this is the closest face to it. Sizes on
	   000webfont's 16-brick em, so the letters stay crisp at every zoom, and dim
	   enough that an empty slot stays quieter than a filled one. */
	.main-label {
		position: absolute;
		top: 50%;
		left: 50%;
		/* The ink hangs below its own line box, so the box has to sit that much
		   above the cell's middle for the letters to land on it. */
		transform: translate(-50%, calc(-50% - var(--cap-drop)));
		font-family: var(--font-ui);
		font-size: round(calc(32 / 3 * var(--u)), 16px);
		line-height: 0.3125em;
		color: var(--color-edge);
	}

	/* Cluster coverage: dashed cell borders drawn only on boundary sides, so the
	   set reads as one outlined region. Core previews are the same shape dimmer. */
	.coverage {
		/* Thicker than an error's edge, and darker than any border in the chrome —
		   the outline is context, not a warning, so it stays behind the modules it
		   surrounds. */
		--edge-width: 4px;
		border: 0 dashed var(--color-field-edge);
	}
	.coverage.is-preview {
		border-color: color-mix(in srgb, var(--color-field-edge) 60%, var(--color-void));
	}
	.edge-n {
		border-top-width: var(--edge-width, 2px);
	}
	.edge-e {
		border-right-width: var(--edge-width, 2px);
	}
	.edge-s {
		border-bottom-width: var(--edge-width, 2px);
	}
	.edge-w {
		border-left-width: var(--edge-width, 2px);
	}

	/* The drop target, answering with the verdict the game's hover gives: accent
	   for a legal drop, red for a refused one. */
	.hover-ring {
		z-index: 3;
		border: 2px solid var(--color-accent);
	}
	.hover-ring.is-invalid {
		border-color: var(--color-danger);
	}

	/* The carried module's own field, previewed around the cursor. */
	.hint.is-power {
		background-color: color-mix(in srgb, var(--color-power) 16%, transparent);
	}
	.hint.is-boost {
		background-color: color-mix(in srgb, var(--color-boost) 16%, transparent);
	}

	/* Above the connections, which draw over the tiles — an error that marks a
	   cell edge must not end up under the notch sitting on it. */
	.error-ring {
		z-index: 3;
		border: 2px solid var(--color-danger);
	}
	/* One red edge per connection error, on the shared .edge-* width classes. */
	.error-edge {
		z-index: 3;
		border: 0 solid var(--color-danger);
	}

	/* The carried module, centred on the pointer. Outside the plane, so its
	   transform cannot pin the fixed position to the board. */
	.carry-ghost {
		position: fixed;
		z-index: 20;
		width: var(--cell);
		height: var(--cell);
		transform: translate(-50%, -50%);
		opacity: 0.85;
		pointer-events: none;
	}
	/* A marker has no frame to fill the cell with, so it centres in one. */
	.brush-ghost {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.edit-anchor {
		z-index: 5;
		align-items: flex-end;
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
