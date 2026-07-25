<script lang="ts">
	// The project links, shown under every page. The desktop download only
	// appears in a browser. Inside the desktop app it would point at what is
	// already running.
	import { isTauri } from '$lib/save/io';

	const REPO = 'https://github.com/telefonsquid/punk-save-editor';

	// The desktop webview swallows _blank links instead of opening a window.
	// Hand the URL to the system browser there. In a real browser the anchor
	// works as an anchor.
	async function external(e: MouseEvent) {
		if (!isTauri()) return;
		e.preventDefault();
		const { openUrl } = await import('@tauri-apps/plugin-opener');
		await openUrl((e.currentTarget as HTMLAnchorElement).href);
	}
</script>

<footer class="text-ui-xs uppercase punk-footer">
	<nav aria-label="Project links">
		<a href={REPO} target="_blank" rel="noopener noreferrer" onclick={external}>GitHub</a>
		<a href="/changelog">Changelog</a>
		{#if !isTauri()}
			<a href="{REPO}/releases/latest" target="_blank" rel="noopener noreferrer">
				Get the desktop app
			</a>
		{/if}
	</nav>
</footer>

<style>
	/* Quiet strip of links at the very bottom, pushed clear of the content. */
	.punk-footer {
		margin-top: 4rem;
		padding: 1.5rem 1.5rem 2rem;
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		column-gap: 3rem;
		row-gap: 0.75rem;
	}

	a {
		color: var(--color-muted);
	}

	a:hover,
	a:focus-visible {
		color: var(--color-accent);
	}
</style>
