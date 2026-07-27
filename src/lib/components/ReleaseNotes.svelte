<script lang="ts">
	// One release's body: the prose under the version heading, then its
	// Added/Changed/Fixed groups and their bullets. Every part of it comes from
	// CHANGELOG.md at build time — see lib/changelog.ts. Nothing here is written
	// twice.
	//
	// It sits apart from either surface that shows it because there are two: the
	// footer's overlay lists releases flat (ChangelogDialog), the /changelog page
	// gives each one a Section card. Only the heading above this differs.
	import type { Release } from '$lib/changelog';

	let { release }: { release: Release } = $props();
</script>

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

<style>
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
