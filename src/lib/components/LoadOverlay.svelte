<script lang="ts">
	import Loading from './Loading.svelte';
	import { fade } from 'svelte/transition';

	let { label, motion = 1 }: { label: string; motion?: number } = $props();
</script>

<!-- One steady wait over everything while a save decodes or writes. The editor
     renders behind it, so lifting this reveals a page that is already painted
     rather than one that pops in a panel at a time. Dissolving it out is the
     load-finished reveal: the drawn editor fades up as the cover clears. -->
<div class="load-anchor" transition:fade={{ duration: 220 * motion }}>
	<div class="load-overlay">
		<Loading {label} />
	</div>
</div>

<style>
	/* `.crt-screen`'s filter makes it the containing block for fixed positioning,
	   so a position:fixed overlay would anchor at the scroll origin and paint
	   off-screen once the page is scrolled. A zero-height sticky anchor rides
	   the visible top of the scroller instead, and the overlay hangs from it —
	   mount this as an early child of the scroll content. */
	.load-anchor {
		position: sticky;
		top: 0;
		height: 0;
		z-index: 50;
	}

	/* Solid over the void so the editor painting itself behind this never shows
	   through — it is fully drawn by the time the overlay lifts, instead of
	   popping in panel by panel. */
	.load-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 100dvh;
		display: grid;
		place-items: center;
		background-color: var(--color-void);
	}
</style>
