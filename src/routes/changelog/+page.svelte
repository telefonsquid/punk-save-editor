<script lang="ts">
	// Every entry here comes from CHANGELOG.md at build time — see lib/changelog.ts.
	// Nothing on this page is written twice.
	import Section from '$lib/components/Section.svelte';
	import { releases } from '$lib/changelog';
</script>

<svelte:head><title>Changelog — PUNK Save Editor</title></svelte:head>

<main class="flex-1 px-6 py-16">
	<div class="flex flex-col gap-10 mx-auto max-w-3xl">
		<a href="/" class="text-ui-xs uppercase back-link">&lt; Back to the editor</a>

		<h1 class="punk-title-shadow font-title text-hud-lg uppercase tracking-hud-wide">Changelog</h1>

		{#each releases as release (release.version)}
			<Section title={release.version} subtitle={release.date ?? undefined}>
				{#each release.intro as paragraph, i (i)}
					<p class="log-text">
						{#each paragraph as part, j (j)}
							{#if part.code}<code class="log-code">{part.text}</code>{:else}{part.text}{/if}
						{/each}
					</p>
				{/each}

				{#each release.groups as group (group.title)}
					{#if group.title}
						<h3 class="mt-6 mb-2 font-title text-accent text-hud-xs uppercase tracking-hud">
							{group.title}
						</h3>
					{/if}
					<ul class="flex flex-col gap-2">
						{#each group.items as item, i (i)}
							<li class="log-item log-text">
								{#each item as part, j (j)}
									{#if part.code}<code class="log-code">{part.text}</code>{:else}{part.text}{/if}
								{/each}
							</li>
						{/each}
					</ul>
				{/each}
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

	/* Release notes are body copy, so they wear the DOS face the game sets its
	   module descriptions in rather than the caps-only UI face. */
	.log-text {
		font-family: var(--font-desc);
		font-size: 18px;
		line-height: 1.5;
		letter-spacing: normal;
		color: var(--color-stone);
	}

	/* The game's own bullet: a square, not a disc. */
	.log-item {
		position: relative;
		padding-left: 1.25rem;
	}
	.log-item::before {
		content: '';
		position: absolute;
		top: 0.55em;
		left: 0.25rem;
		width: 6px;
		height: 6px;
		background-color: var(--color-edge);
	}

	.log-code {
		font-family: var(--font-desc);
		color: var(--color-ink);
	}
</style>
