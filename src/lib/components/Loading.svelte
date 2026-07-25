<script lang="ts">
	// The full-screen wait shown while a save decodes or writes. Reading and
	// parsing the LZF+Odin files (the ship `entities` alone takes about half a
	// second) leaves a gap where the editor would otherwise pop in piece by piece;
	// this covers that gap with one steady animation, and the editor renders behind
	// it so it is already painted by the time this lifts.
	let { label = 'Loading save' }: { label?: string } = $props();

	// A short run of pixel cells that light in a wave, like a HUD bar filling.
	const cells = Array.from({ length: 7 }, (_, i) => i);
</script>

<div class="loading" role="status" aria-live="polite">
	<div class="cells" aria-hidden="true">
		{#each cells as i (i)}
			<span class="cell" style="animation-delay: {i * 0.1}s"></span>
		{/each}
	</div>
	<p class="label">{label}<span class="dots" aria-hidden="true">…</span></p>
</div>

<style>
	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
	}

	.cells {
		display: flex;
		gap: calc(2 * var(--u));
	}

	/* Each cell is a small square in the game's control frame, lit to the accent as
	   the wave passes and dimming back to the quiet edge colour. */
	.cell {
		width: calc(6 * var(--u));
		height: calc(6 * var(--u));
		background-color: var(--color-edge-dim);
		animation: cell-pulse 1s ease-in-out infinite;
	}

	@keyframes cell-pulse {
		0%,
		100% {
			background-color: var(--color-edge-dim);
			transform: translateY(0);
		}
		40% {
			background-color: var(--color-accent);
			transform: translateY(calc(-2 * var(--u)));
		}
	}

	.label {
		font-family: var(--font-title);
		font-size: var(--text-hud-sm);
		line-height: var(--text-hud-sm--line-height);
		letter-spacing: var(--tracking-hud-wide);
		text-transform: uppercase;
		color: var(--color-muted);
	}

	/* The trailing ellipsis blinks so the label reads as active even where the
	   cells are missed. */
	.dots {
		animation: dots-blink 1.2s steps(1) infinite;
	}
	@keyframes dots-blink {
		0% {
			opacity: 0.2;
		}
		50% {
			opacity: 1;
		}
		100% {
			opacity: 0.2;
		}
	}

	/* Hold still for anyone who asked the system to; the lit bar still reads as a
	   wait. */
	@media (prefers-reduced-motion: reduce) {
		.cell,
		.dots {
			animation: none;
		}
		.cell:nth-child(-n + 4) {
			background-color: var(--color-accent);
		}
	}
</style>
