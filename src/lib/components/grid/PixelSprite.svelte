<script lang="ts">
	import type { GridSprite } from '$lib/game/grid-icons';

	// One of the grid's extracted sprites, drawn at an exact multiple of its
	// native pixel size: the SVG counts in game pixels and the box counts in
	// `--u`, so the art only ever scales by whole pixels (docs/design.md).
	// Every layer is painted in `currentColor` at its own brightness, which is
	// how one sprite serves every module colour; the sprite's black is the void
	// underneath it, so a notch blanks the frame edge it sits on.
	let {
		sprite,
		quarterTurn = false,
		class: className = ''
	}: {
		sprite: GridSprite;
		/** Stands the sprite on its side — the seam capsule runs both ways. */
		quarterTurn?: boolean;
		class?: string;
	} = $props();

	const w = $derived(quarterTurn ? sprite.h : sprite.w);
	const h = $derived(quarterTurn ? sprite.w : sprite.h);
</script>

<svg
	class={className}
	viewBox="0 0 {w} {h}"
	shape-rendering="crispEdges"
	style:--sprite-w={w}
	style:--sprite-h={h}
	aria-hidden="true"
>
	<g transform={quarterTurn ? `translate(${sprite.h} 0) rotate(90)` : undefined}>
		{#each sprite.layers as layer, i (i)}
			<path
				d={layer.d}
				class:is-void={layer.shade === 0}
				fill-opacity={layer.shade === 0 ? null : layer.shade}
			/>
		{/each}
	</g>
</svg>

<style>
	svg {
		display: block;
		width: calc(var(--sprite-w) * var(--u));
		height: calc(var(--sprite-h) * var(--u));
	}
	path {
		fill: currentColor;
	}
	.is-void {
		fill: var(--color-void);
	}
</style>
