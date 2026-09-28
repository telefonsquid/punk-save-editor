<script lang="ts">
	import { appHistory } from '$lib/editor/history.svelte';
	import { windowChrome as chrome } from '$lib/window-chrome.svelte';

	// Back and Forward for the desktop app, in its title bar. A browser has these
	// in its own chrome; the webview has none, so the app's history
	// ($lib/editor/history.svelte.ts) would otherwise only answer the mouse's side
	// buttons and the keyboard. Drawn the way each OS draws them beside its
	// window buttons — Windows' flat arrows in the caption strip, the Mac
	// toolbar's chevrons, GNOME's flat header-bar arrows — and silent, like the
	// window buttons, because they are the window's rather than the game's.

	const mac = $derived(chrome.style === 'mac');
	const backHint = $derived(mac ? 'Back (⌘[)' : 'Back (Alt+Left)');
	const forwardHint = $derived(mac ? 'Forward (⌘])' : 'Forward (Alt+Right)');
</script>

<div class="nav is-{chrome.style}" class:is-blurred={!chrome.focused}>
	<button
		type="button"
		aria-label="Back"
		title={backHint}
		disabled={!appHistory.canGoBack}
		onclick={appHistory.back}
	>
		{#if mac}
			<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5L4 6l3.5 3.5" /></svg>
		{:else if chrome.style === 'windows'}
			<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M10 5H1M5 1L1 5l4 4" /></svg>
		{:else}
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12 8H4.5M8 4.5L4.5 8L8 11.5" /></svg>
		{/if}
	</button>
	<button
		type="button"
		aria-label="Forward"
		title={forwardHint}
		disabled={!appHistory.canGoForward}
		onclick={appHistory.forward}
	>
		{#if mac}
			<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" /></svg>
		{:else if chrome.style === 'windows'}
			<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h9M5 1l4 4-4 4" /></svg>
		{:else}
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8h7.5M8 4.5L11.5 8L8 11.5" /></svg>
		{/if}
	</button>
</div>

<style>
	.nav {
		display: flex;
		align-self: stretch;
		align-items: center;
	}

	.nav button {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--color-ink);
		cursor: default;
		transition: none;
	}

	.nav svg {
		fill: none;
		stroke: currentColor;
	}

	.nav.is-blurred button {
		color: var(--color-muted);
	}

	/* Nowhere to go: the arrow stays, dimmed, the way every OS leaves it. */
	.nav button:disabled {
		color: var(--color-edge-dim);
	}

	.nav button:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	/* ---- Windows: caption-strip buttons, narrower than the window's own. */
	.is-windows button {
		width: 40px;
		height: 100%;
	}
	.is-windows svg {
		width: 10px;
		height: 10px;
		stroke-width: 1;
	}
	.is-windows button:hover:not(:disabled) {
		background-color: color-mix(in srgb, var(--color-ink) 9%, transparent);
	}
	.is-windows button:active:not(:disabled) {
		background-color: color-mix(in srgb, var(--color-ink) 6%, transparent);
	}

	/* ---- macOS: toolbar chevrons, a step clear of the traffic lights. */
	.is-mac {
		gap: 2px;
		padding-inline: 12px 0;
	}
	.is-mac button {
		width: 26px;
		height: 22px;
		border-radius: 5px;
	}
	.is-mac svg {
		width: 12px;
		height: 12px;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.is-mac button:hover:not(:disabled) {
		background-color: color-mix(in srgb, var(--color-ink) 10%, transparent);
	}
	.is-mac button:active:not(:disabled) {
		background-color: color-mix(in srgb, var(--color-ink) 18%, transparent);
	}

	/* ---- GNOME: flat header-bar buttons with the go-previous/next symbols. */
	.is-linux {
		gap: 4px;
		padding-inline: 4px;
	}
	.is-linux button {
		width: 30px;
		height: 24px;
		border-radius: 6px;
	}
	.is-linux svg {
		width: 16px;
		height: 16px;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.is-linux button:hover:not(:disabled) {
		background-color: color-mix(in srgb, var(--color-ink) 10%, transparent);
	}
	.is-linux button:active:not(:disabled) {
		background-color: color-mix(in srgb, var(--color-ink) 20%, transparent);
	}
</style>
