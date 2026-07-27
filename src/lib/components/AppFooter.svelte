<script lang="ts">
	// The project links, shown under every page. The desktop download only
	// appears in a browser. Inside the desktop app it would point at what is
	// already running.
	import { onMount } from 'svelte';
	import { isTauri } from '$lib/save/io';
	import { appVersion, checkForUpdate, type Update } from '$lib/update';

	const REPO = 'https://github.com/telefonsquid/punk-save-editor';

	let update = $state<Update | null>(null);

	// One quiet look at GitHub per launch, and only from the desktop app — see
	// lib/update.ts. Deliberately not awaited into the markup: the footer draws
	// straight away and the notice appears later if there is one.
	onMount(() => {
		let live = true;
		checkForUpdate().then((found) => {
			if (live) update = found;
		});
		return () => {
			live = false;
		};
	});

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
		{#if update}
			<a
				class="update"
				href={update.url}
				target="_blank"
				rel="noopener noreferrer"
				onclick={external}
			>
				Version {update.version} is out
			</a>
		{/if}
	</nav>
	<p class="version">v{appVersion}</p>
</footer>

<style>
	/* Quiet strip of links at the very bottom, pushed clear of the content. The
	   version sits in the same row as the links, so the footer and the nav inside
	   it are both flex with the same gap — one line until the width runs out. */
	.punk-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: center;
		column-gap: 3rem;
		row-gap: 0.75rem;
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

	/* The one thing down here worth spotting, so it wears the interaction colour
	   without being hovered. */
	.update {
		color: var(--color-accent);
	}

	.update:hover,
	.update:focus-visible {
		color: var(--color-ink);
	}

	/* Which build this is, for anyone reporting a bug. */
	.version {
		color: var(--color-muted);
	}
</style>
