<script lang="ts">
	// A placeholder block that shimmers while real content is still loading, so a
	// slow file (the ship entities take about half a second to decode) shows a
	// pulse instead of empty space that pops in. Purely decorative, hidden from
	// screen readers.
	let {
		width = '100%',
		height = '1.5rem',
		class: klass = ''
	}: { width?: string; height?: string; class?: string } = $props();
</script>

<span class="skeleton {klass}" style="width: {width}; height: {height}" aria-hidden="true"></span>

<style>
	.skeleton {
		display: block;
		/* A band of light sweeping across the card colour. Square corners to keep
		   the pixel look. */
		background: linear-gradient(
			90deg,
			var(--color-surface) 0%,
			color-mix(in srgb, var(--color-edge-dim) 70%, var(--color-surface)) 50%,
			var(--color-surface) 100%
		);
		background-size: 200% 100%;
		animation: skeleton-sweep 1.2s ease-in-out infinite;
	}

	@keyframes skeleton-sweep {
		from {
			background-position: 200% 0;
		}
		to {
			background-position: -200% 0;
		}
	}

	/* No motion for anyone who asked the system to keep still; a steady dim block
	   still reads as loading. */
	@media (prefers-reduced-motion: reduce) {
		.skeleton {
			animation: none;
			opacity: 0.6;
		}
	}
</style>
