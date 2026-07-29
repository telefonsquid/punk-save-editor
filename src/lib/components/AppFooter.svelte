<script lang="ts">
	// The project links, shown under every page. One of them swaps by build: a
	// browser is offered the desktop app, and the desktop app is offered the
	// website — each points at the copy you are not currently running.
	import { onMount } from 'svelte';
	import ChangelogDialog from './ChangelogDialog.svelte';
	import OptionsDialog from './OptionsDialog.svelte';
	import { settings } from '$lib/editor/settings.svelte';
	import { isTauri } from '$lib/save/platform';
	import { appVersion, checkForUpdate, type Update } from '$lib/update';

	const REPO = 'https://github.com/telefonsquid/punk-save-editor';
	const SITE = 'https://punk-editor.henkys.dev';

	let update = $state<Update | null>(null);
	let changelogOpen = $state(false);
	let optionsOpen = $state(false);
	let optionsError = $state<string | null>(null);

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
		// The href has to be read before the first await: `currentTarget` is only
		// set while the event is being dispatched and is null the moment the
		// handler yields, so reading it after the import throws and the link goes
		// nowhere — having already had its navigation prevented.
		const { href } = e.currentTarget as HTMLAnchorElement;
		const { openUrl } = await import('@tauri-apps/plugin-opener');
		await openUrl(href);
	}

	// The notes open over the page instead of navigating to it: the open save
	// lives in memory, so leaving the editor for the changelog and coming back
	// meant picking the save folder again. It stays a real link so the URL can
	// still be copied, opened in a tab, or followed on the page it belongs to.
	function showChangelog(e: MouseEvent) {
		const link = e.currentTarget as HTMLAnchorElement;
		if (e.metaKey || e.ctrlKey || e.shiftKey || link.pathname === location.pathname) return;
		e.preventDefault();
		changelogOpen = true;
	}

	// The folder is read back here rather than by an effect inside the dialog, so
	// the lookup belongs to the click that asked for it — the same reason the
	// restore browser reads its list from whatever opened it.
	async function showOptions() {
		optionsOpen = true;
		optionsError = null;
		await settings.recall();
	}

	// Options is the one place the backup folder is reached with no save open, so
	// there is no BackupState to report into — the footer outlives the editor.
	// The picker's own refusals (no gesture left, storage blocked) are worth
	// saying, because otherwise the click looks like it did nothing at all.
	async function chooseBackupFolder() {
		optionsError = null;
		try {
			await settings.repick();
		} catch (err) {
			optionsError = (err as Error).message;
		}
	}
</script>

<footer class="text-ui-xs uppercase punk-footer">
	<nav aria-label="Project links">
		<a href={REPO} target="_blank" rel="noopener noreferrer" onclick={external}>GitHub</a>
		<a href="/changelog" onclick={showChangelog}>Changelog</a>
		<!-- A button, not a link: there is no options page to fall back to, and a
		     link that goes nowhere is a link that cannot be middle-clicked, copied
		     or trusted. It wears the same quiet grey as its neighbours. -->
		<button type="button" onclick={showOptions}>Options</button>
		{#if isTauri()}
			<a href={SITE} target="_blank" rel="noopener noreferrer" onclick={external}>Web version</a>
		{:else}
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

<ChangelogDialog bind:open={changelogOpen} />
<OptionsDialog bind:open={optionsOpen} onchoose={chooseBackupFolder} error={optionsError} />

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

	/* The Options button is one of the links as far as the row is concerned, so it
	   is styled with them rather than beside them. Tailwind's reset strips a
	   button's chrome and hands it the footer's face and size — but it also sets
	   `text-transform: none`, which is not inherited back, so the row's `uppercase`
	   stops at the button unless it is said again here. 000webfont is caps-only, so
	   without this the label rides the lowercase code points' metrics. */
	a,
	button {
		color: var(--color-muted);
	}

	button {
		text-transform: inherit;
		cursor: pointer;
	}

	a:hover,
	a:focus-visible,
	button:hover,
	button:focus-visible {
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
