<script lang="ts">
	// Every entry here comes from CHANGELOG.md at build time — see lib/changelog.ts.
	// Nothing on this page is written twice.
	//
	// The footer no longer sends anyone here: it opens the same notes over the
	// page (ChangelogDialog), because leaving the editor drops the open save. This
	// stays for the link that CHANGELOG.md itself points at, and for anyone who
	// arrives with the URL.
	import Section from '$lib/components/Section.svelte';
	import ReleaseNotes from '$lib/components/ReleaseNotes.svelte';
	import { releases } from '$lib/changelog';
</script>

<svelte:head><title>Changelog — PUNK Save Editor</title></svelte:head>

<main class="flex-1 px-6 py-16">
	<div class="flex flex-col gap-10 mx-auto max-w-3xl">
		<a href="/" class="text-ui-xs uppercase back-link">&lt; Back to the editor</a>

		<h1 class="punk-title-shadow font-title text-hud-lg uppercase tracking-hud-wide">Changelog</h1>

		{#each releases as release (release.version)}
			<Section title={release.version} subtitle={release.date ?? undefined}>
				<ReleaseNotes {release} />
			</Section>
		{/each}
	</div>
</main>

<style>
	.back-link {
		color: var(--color-muted);
	}

	.back-link:hover,
	.back-link:focus-visible {
		color: var(--color-accent);
	}
</style>
