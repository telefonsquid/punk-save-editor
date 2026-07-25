<script lang="ts">
	import type { Snippet } from 'svelte';

	/** The control an info note belongs to, with the note folded behind it:
	 * hovering or focusing anywhere in the wrapper unfolds the note below. The
	 * control keeps its own click behaviour — the note is purely a hover reveal. */
	let { children, note }: { children: Snippet; note?: Snippet } = $props();
</script>

<span class="punk-info-wrap">
	{@render children()}
	{#if note}
		<span class="text-muted text-ui-xs punk-info-pop">{@render note()}</span>
	{/if}
</span>

<style>
	.punk-info-wrap {
		position: relative;
		display: inline-flex;
	}

	.punk-info-pop {
		position: absolute;
		top: calc(100% + 0.5rem);
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		/* Wider than the trigger so the note reads as a few short lines, not a
		   narrow column. */
		width: 32rem;
		max-width: 90vw;
		padding: 0.5rem 0.75rem;
		border: 2px solid var(--color-edge-dim);
		background-color: var(--color-surface);
		text-align: left;
		opacity: 0;
		pointer-events: none;
		visibility: hidden;
	}

	.punk-info-wrap:hover .punk-info-pop,
	.punk-info-wrap:focus-within .punk-info-pop {
		opacity: 1;
		visibility: visible;
	}
</style>
