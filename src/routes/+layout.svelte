<script lang="ts">
	import './layout.css';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import CrtFilter from '$lib/components/CrtFilter.svelte';
	import ScrollBar from '$lib/components/ScrollBar.svelte';
	import { bindFullscreenKey } from '$lib/fullscreen';

	let { children } = $props();

	/** The app's scroller, handed to ScrollBar so it can draw the bar it hides. */
	let screen = $state<HTMLElement | null>(null);

	$effect(bindFullscreenKey);
</script>

<!-- The whole app renders inside this wrapper so the CRT filter falls on every
     page uniformly. The filter itself is defined once by CrtFilter below. -->
<div class="crt-screen" bind:this={screen}>
	<!-- A flex column the height of the screen, so a page can grow to fill it
	     (pages mark their root flex-1) and the footer lands at the bottom even
	     when the content is short. -->
	<div class="app-shell">
		{@render children()}
		<AppFooter />
	</div>
</div>
<ScrollBar scroller={screen} />
<CrtFilter />

<style>
	.app-shell {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}
</style>
