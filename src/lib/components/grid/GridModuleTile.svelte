<script lang="ts">
	import ItemIcon from '../ItemIcon.svelte';
	import PixelSprite from './PixelSprite.svelte';
	import {
		BOOST_PIP,
		GRID_CELL,
		NOTCH,
		NOTCH_LINKED,
		centredIn,
		moduleFrame
	} from '$lib/game/grid-icons';
	import { moduleCategory, moduleEffectsEntry, moduleInfo } from '$lib/game/data';
	import { DIRECTIONS, type ConnectionSide, type GridModule } from '$lib/game/grid-rules';

	// One module on the grid canvas, drawn the way the game's ModuleIconWidget
	// draws it: the frame its shop category ships, in the module's colour; the
	// item art; a notch per enabled connection edge, merging into one capsule
	// across the seam when the neighbour connects back; a chevron per level
	// above the base; and the power badge under a main module. A module that is
	// not both connected and powered draws at half opacity, exactly as the game
	// fades it. Every sprite here is the game's own (see grid-icons.ts).
	// Nothing off the board touches anything, so a tile with no neighbours to
	// speak of draws every enabled side as an open stub.
	const NO_LINKS: Record<ConnectionSide, boolean> = {
		north: false,
		east: false,
		south: false,
		west: false
	};

	let {
		module,
		level = 1,
		dimmed = false,
		links = NO_LINKS,
		badge = null,
		u
	}: {
		module: GridModule;
		level?: number;
		/** Not connected-and-powered — the game's half-alpha state. */
		dimmed?: boolean;
		/** Per side: the neighbour connects back (draws the merged capsule). */
		links?: Record<ConnectionSide, boolean>;
		/** Main modules: attached cores vs the module's power level. */
		badge?: { cores: number; budget: number } | null;
		/** One game pixel, in screen pixels. The whole tile is drawn in it — the
		 * item art included, so no caller can scale the frame and the icon apart. */
		u: number;
	} = $props();

	// White is the game's "no colour of its own" — those modules wear the same
	// neutral their notches do, rather than a frame brighter than their own art.
	const color = $derived(moduleInfo(module.id)?.color ?? null);
	const tint = $derived(color && color.toLowerCase() !== '#ffffff' ? color : null); // palette-ok: compared against module-info's own value, never painted
	const frame = $derived(moduleFrame(moduleCategory(module.id)));
	const boostable = $derived(moduleEffectsEntry(module.id)?.canBeBoosted !== false);

	// A notch sits against the cell edge it belongs to and centres on the other
	// axis; the capsule is the same, twice as long, sitting astride the seam.
	// Only the east and south sides draw one — the neighbour's copy would land
	// on the identical pixels, and two half-transparent copies read brighter
	// than a single one.
	const across = Math.floor((GRID_CELL - NOTCH.w) / 2);
	const far = GRID_CELL - NOTCH.h;
	const seam = GRID_CELL - Math.floor(NOTCH_LINKED.h / 2);
	const OWNS_LINK: Record<ConnectionSide, boolean> = {
		north: false,
		east: true,
		south: true,
		west: false
	};
</script>

<div
	class="tile"
	class:is-dimmed={dimmed}
	style:--u="{u}px"
	style:--module-color={tint}
	style:--frame-inset={centredIn(frame)}
	style:--across={across}
	style:--far={far}
	style:--seam={seam}
>
	<div class="body">
		<PixelSprite sprite={frame} class="frame-art" />
		<span class="art"><ItemIcon id={module.id} scale={u} /></span>

		{#if boostable && level > 1}
			<span class="pips" aria-hidden="true">
				{#each { length: level - 1 }, i (i)}
					<PixelSprite sprite={BOOST_PIP} />
				{/each}
			</span>
		{/if}

		{#if badge}
			<span class="badge punk-hud-num" class:is-over={badge.cores > badge.budget}>
				{badge.cores}/{badge.budget}
			</span>
		{/if}
	</div>

	{#each DIRECTIONS as dir (dir.side)}
		{#if module[dir.side]}
			{#if !links[dir.side]}
				<PixelSprite sprite={NOTCH} class="joint stub-{dir.side}" />
			{:else if OWNS_LINK[dir.side]}
				<PixelSprite
					sprite={NOTCH_LINKED}
					quarterTurn={dir.side === 'east'}
					class="joint link-{dir.side}"
				/>
			{/if}
		{/if}
	{/each}
</div>

<style>
	/* The tile is the whole cell: the frame centres in it and every notch is
	   placed against the cell's edges, so all four shapes hang their connections
	   in the same places. Everything counts in the canvas's --u, so the tile
	   rescales with the zoom level. */
	.tile {
		position: absolute;
		inset: 0;
		color: var(--module-color, var(--color-joint));
	}

	/* Everything except the connections. They fade separately so the tile itself
	   never becomes a stacking context — one would trap the joints below the
	   neighbouring tiles they have to reach across. */
	.body {
		position: absolute;
		inset: 0;
	}
	.is-dimmed .body,
	.is-dimmed :global(.joint) {
		opacity: 0.5;
	}

	.tile :global(.frame-art) {
		position: absolute;
		top: calc(var(--frame-inset) * var(--u));
		left: calc(var(--frame-inset) * var(--u));
	}

	/* Over the frame's black interior, which the sprite paints itself. It rides a
	   pixel above centre, leaving the lower half of the frame to the chevrons and
	   the power badge. */
	.art {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transform: translateY(calc(-1 * var(--u)));
	}

	/* Connections draw over every tile, not only their own — a capsule reaches
	   half into the neighbour's cell and must not vanish under it. */
	.tile :global(.joint) {
		position: absolute;
		z-index: 1;
	}
	/* An open connection wears its module's colour; once the neighbour answers
	   it, the pair they share goes neutral. */
	.tile :global(.link-south),
	.tile :global(.link-east) {
		color: var(--color-joint);
	}
	.tile :global(.stub-north) {
		top: 0;
		left: calc(var(--across) * var(--u));
	}
	.tile :global(.stub-south) {
		top: calc(var(--far) * var(--u));
		left: calc(var(--across) * var(--u));
	}
	.tile :global(.stub-east) {
		top: calc(var(--across) * var(--u));
		left: calc(var(--far) * var(--u));
	}
	.tile :global(.stub-west) {
		top: calc(var(--across) * var(--u));
		left: 0;
	}
	.tile :global(.link-south) {
		top: calc(var(--seam) * var(--u));
		left: calc(var(--across) * var(--u));
	}
	.tile :global(.link-east) {
		top: calc(var(--across) * var(--u));
		left: calc(var(--seam) * var(--u));
	}

	/* The +1 chevrons stack up from the frame's bottom-right corner, in the
	   booster's own green — the module is boosted, and that is who did it. */
	.pips {
		position: absolute;
		right: calc(5 * var(--u));
		bottom: calc(6 * var(--u));
		display: flex;
		flex-direction: column-reverse;
		color: var(--color-boost);
	}

	/* The n/max power badge under a main module, in the game's teal — red once
	   more cores are attached than the module can hold.

	   The bottom edge of the cell belongs to the south notch, which sits from 13
	   game pixels in: the badge has to end before it, at every zoom. The game's
	   own runs from -1.5 to 12.9 across the cell and stops 1.7 above the floor
	   (infinite-grid-full.png), so this one hangs two pixels out on the left, two
	   above the floor, and carries no padding beside its numbers — the digits'
	   own bearings are the gap. */
	.badge {
		position: absolute;
		/* Over the connections rather than under them: they carry a z-index to
		   reach across the neighbouring tiles, and one of them was cutting the
		   badge's corner off. */
		z-index: 2;
		bottom: calc(2 * var(--u));
		left: calc(-2 * var(--u));
		padding: calc(0.5 * var(--u)) 0;
		/* 10px at the default zoom, snapped to the HUD face's 5px grid elsewhere. */
		font-size: round(calc(10 / 3 * var(--u)), 5px);
		line-height: 1;
		color: var(--color-power);
		background-color: var(--color-void);
		border: var(--u) solid var(--color-power); /* counts in --u like every other edge here */
	}
	.badge.is-over {
		color: var(--color-danger);
		border-color: var(--color-danger);
	}
</style>
