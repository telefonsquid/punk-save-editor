<script lang="ts">
	import ItemIcon from '../ItemIcon.svelte';
	import { moduleCategory, moduleEffectsEntry, moduleInfo } from '$lib/game/data';
	import { DIRECTIONS, type ConnectionSide, type GridModule } from '$lib/game/grid-rules';

	// One module on the grid canvas, drawn the way the game's ModuleIconWidget
	// draws it: a frame in the module's colour whose shape follows the category
	// (the game gives each ModuleType its own background sprite), the item art,
	// a stub per enabled connection edge — engaged when the neighbour connects
	// back — the level and its boost chevrons on boostable modules, and the
	// power badge under a main module. A module that is not both connected and
	// powered draws at half opacity, exactly as the game fades it.
	let {
		module,
		level,
		dimmed,
		links,
		badge,
		iconScale
	}: {
		module: GridModule;
		level: number;
		/** Not connected-and-powered — the game's half-alpha state. */
		dimmed: boolean;
		/** Per side: the neighbour connects back (draws the engaged link bar). */
		links: Record<ConnectionSide, boolean>;
		/** Main modules: attached cores vs the module's power level. */
		badge: { cores: number; budget: number } | null;
		iconScale: number;
	} = $props();

	const color = $derived(moduleInfo(module.id)?.color ?? null);
	const shape = $derived.by(() => {
		const category = moduleCategory(module.id);
		if (category === 'UPGRADES') return 'square';
		if (category === 'POWER' || category === 'BOOSTERS') return 'round';
		return 'octagon';
	});
	const boostable = $derived(moduleEffectsEntry(module.id)?.canBeBoosted !== false);
</script>

<div class="tile" class:is-dimmed={dimmed} style:--module-color={color}>
	<!-- A border cannot follow a clip-path (the diagonals would simply vanish),
	     so the frame is two layers: the outer painted in the module's colour and
	     an inset inner one painted back to void, both wearing the shape. -->
	<div class="frame is-{shape}">
		<div class="frame-fill is-{shape}">
			<ItemIcon id={module.id} scale={iconScale} />
		</div>
	</div>
	{#if boostable && level > 1}
		<span class="level punk-hud-num">{level}</span>
		<span class="pips" aria-hidden="true">
			<!-- One chevron per level above the base, the game's upgrade pips. -->
			{#each { length: level - 1 }, i (i)}
				<svg viewBox="0 0 8 5" class="pip"><path d="M0 5 4 0 8 5 6 5 4 2 2 5Z" /></svg>
			{/each}
		</span>
	{/if}
	{#each DIRECTIONS as dir (dir.side)}
		{#if module[dir.side]}
			<span class="stub stub-{dir.side}" class:is-linked={links[dir.side]}></span>
			{#if links[dir.side]}
				<span class="link link-{dir.side}"></span>
			{/if}
		{/if}
	{/each}
	{#if badge}
		<span class="badge punk-hud-num" class:is-over={badge.cores > badge.budget}>
			{badge.cores}/{badge.budget}
		</span>
	{/if}
</div>

<style>
	/* The cell is 28u, the tile sits 2u inside it. Everything here counts in the
	   canvas's --u so the whole thing rescales with the zoom level. */
	.tile {
		position: absolute;
		inset: calc(2 * var(--u));
		color: var(--module-color, var(--color-ink));
	}
	.is-dimmed {
		opacity: 0.5;
	}

	.frame {
		width: 100%;
		height: 100%;
		padding: var(--u);
		background-color: currentColor;
	}
	.frame-fill {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		background-color: var(--color-void);
	}
	.is-octagon {
		clip-path: polygon(
			25% 0,
			75% 0,
			100% 25%,
			100% 75%,
			75% 100%,
			25% 100%,
			0 75%,
			0 25%
		);
	}
	.is-round {
		clip-path: circle(50%);
	}
	.is-square {
		clip-path: none;
	}

	.level {
		position: absolute;
		bottom: calc(-1 * var(--u));
		left: 0;
		/* 10px at the default zoom, snapped to the HUD face's 5px grid elsewhere. */
		font-size: round(calc(10 / 3 * var(--u)), 5px);
		line-height: 1;
		color: currentColor;
		text-shadow: var(--u) var(--u) 0 var(--color-void);
	}

	.pips {
		position: absolute;
		right: calc(-1 * var(--u));
		bottom: calc(-1 * var(--u));
		display: flex;
		flex-direction: column-reverse;
	}
	.pip {
		width: calc(3 * var(--u));
		height: calc(2 * var(--u));
		fill: var(--color-regen);
	}

	/* A stub is the open ring the game puts on every enabled connection edge;
	   the engaged state fills it and adds the short bar reaching the neighbour. */
	.stub {
		position: absolute;
		width: calc(4 * var(--u));
		height: calc(4 * var(--u));
		background-color: var(--color-void);
		border: var(--u) solid currentColor;
		border-radius: 50%;
	}
	.is-linked {
		background-color: currentColor;
	}
	.stub-north {
		top: calc(-2 * var(--u));
		left: calc(50% - 2 * var(--u));
	}
	.stub-south {
		bottom: calc(-2 * var(--u));
		left: calc(50% - 2 * var(--u));
	}
	.stub-east {
		right: calc(-2 * var(--u));
		top: calc(50% - 2 * var(--u));
	}
	.stub-west {
		left: calc(-2 * var(--u));
		top: calc(50% - 2 * var(--u));
	}

	/* The engaged bar crosses the 2u gap to the cell edge; the neighbour's own
	   bar covers the other half of the gap between the two tiles. */
	.link {
		position: absolute;
		background-color: currentColor;
	}
	.link-north {
		top: calc(-4 * var(--u));
		left: calc(50% - var(--u));
		width: calc(2 * var(--u));
		height: calc(2 * var(--u));
	}
	.link-south {
		bottom: calc(-4 * var(--u));
		left: calc(50% - var(--u));
		width: calc(2 * var(--u));
		height: calc(2 * var(--u));
	}
	.link-east {
		right: calc(-4 * var(--u));
		top: calc(50% - var(--u));
		width: calc(2 * var(--u));
		height: calc(2 * var(--u));
	}
	.link-west {
		left: calc(-4 * var(--u));
		top: calc(50% - var(--u));
		width: calc(2 * var(--u));
		height: calc(2 * var(--u));
	}

	/* The n/max power badge under a main module, in the game's teal — red once
	   more cores are attached than the module can hold. */
	.badge {
		position: absolute;
		bottom: calc(-2 * var(--u));
		left: calc(-1 * var(--u));
		padding: var(--u) calc(1.5 * var(--u));
		/* 10px at the default zoom, snapped to the HUD face's 5px grid elsewhere. */
		font-size: round(calc(10 / 3 * var(--u)), 5px);
		line-height: 1;
		color: var(--color-power);
		background-color: var(--color-void);
		border: 1px solid var(--color-power);
	}
	.badge.is-over {
		color: var(--color-danger);
		border-color: var(--color-danger);
	}
</style>
