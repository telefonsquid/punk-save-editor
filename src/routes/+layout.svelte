<script lang="ts">
	import './layout.css';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import CrtFilter from '$lib/components/CrtFilter.svelte';
	import ScrollBar from '$lib/components/ScrollBar.svelte';
	import WindowBar from '$lib/components/WindowBar.svelte';
	import WindowEdges from '$lib/components/WindowEdges.svelte';
	import { bindFullscreenKey } from '$lib/fullscreen';
	import { loadFonts } from '$lib/editor/busy';
	import { afterNavigate } from '$app/navigation';
	import { windowChrome } from '$lib/window-chrome.svelte';

	let { children } = $props();

	/** The app's scroller, handed to ScrollBar so it can draw the bar it hides. */
	let screen = $state<HTMLElement | null>(null);

	$effect(bindFullscreenKey);

	// The desktop app draws its own title bar (the window is undecorated): follow
	// the window's maximized/fullscreen/focus state, and make room for the bar.
	$effect(windowChrome.bind);
	$effect(windowChrome.reflect);

	// Pull the pixel faces the moment the app is up, not when something needs
	// them. They are font-display: block, so text in a face still in flight is
	// invisible rather than fallback-shaped — and the wait overlay's own label is
	// set in the title face, which nothing before it uses. Fetching only once a
	// load starts left that label blank for the whole load and popped it in as the
	// overlay lifted. The landing screen has nothing to wait on, so it pays here.
	$effect(() => {
		loadFonts();
	});

	// SvelteKit resets window scroll on navigation, but the app scrolls inside
	// .crt-screen — without this, /changelog opens wherever the editor was
	// scrolled to, heading off-screen.
	afterNavigate(() => screen?.scrollTo(0, 0));
</script>

<!-- The desktop app's title bar, above the screen rather than in it: the page
     scrolls under nothing, and `.crt-screen` simply starts below the bar. It
     takes its own copy of the CRT filter, like the grid editor does, so the
     strip is part of the same screen as the panels under it. Nothing renders
     here in a browser. -->
<div class="window-bar-screen">
	<WindowBar />
</div>

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
<WindowEdges />
<CrtFilter />

<style>
	.window-bar-screen {
		filter: url(#crt);
	}

	.app-shell {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}
</style>
