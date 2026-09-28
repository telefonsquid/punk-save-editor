<script lang="ts">
	import WindowControls from './WindowControls.svelte';
	import { windowChrome as chrome } from '$lib/window-chrome.svelte';

	// The desktop app's title bar: a thin strip across the top of the window to
	// drag it by, with the window's buttons in whichever corner the OS keeps them.
	// Nothing else lives in it — the mark under it already says what this is — so
	// it reads as a hairline of chrome rather than a toolbar.
	//
	// Two copies are drawn: the page's, above `.crt-screen`, and the grid editor's,
	// inside its full-screen dialog. A modal makes everything outside it inert, so
	// a screen that covers the page has to bring the bar along or the window could
	// not be moved or closed while it is open. Both read one `windowChrome`, so the
	// two can never disagree about the window's state.
	//
	// `data-tauri-drag-region="deep"`: a press anywhere in the strip drags the
	// window and a double-click maximizes it, except on the buttons, which Tauri's
	// drag script leaves alone because they are buttons.
</script>

{#if chrome.shown}
	<div class="window-bar is-{chrome.style}" data-tauri-drag-region="deep">
		{#if chrome.style === 'mac'}
			<WindowControls />
			<span class="flex-1"></span>
		{:else}
			<span class="flex-1"></span>
			<WindowControls />
		{/if}
	</div>
{/if}

<style>
	/* Its height is `--titlebar-h`, the same token `.crt-screen` starts below, so
	   the bar and the page meet without a seam or an overlap. A shade above the
	   void, on the card's own colour: enough to find the edge of the window by,
	   not enough to read as a panel. */
	.window-bar {
		display: flex;
		flex: none;
		align-items: center;
		height: var(--titlebar-h);
		background-color: var(--color-card);
		user-select: none;
		-webkit-user-select: none;
	}
</style>
