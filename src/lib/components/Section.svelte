<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	// The one place that defines what an editor section looks like — the card and
	// its heading. Modelled on the module tooltip (module_card.png): a rounded
	// warm-black slab with a hairline edge and a short uppercase label in the
	// accent colour, the same way the game labels UPGRADES or POWER.
	//
	// `accent` lets a section borrow a resource's or module's own colour for its
	// heading and edge, which is how the game distinguishes cards; left unset it
	// falls back to the UI orange.
	let {
		title,
		accent,
		children,
		class: klass = '',
		...rest
	}: {
		title: string;
		accent?: string | null;
		children: Snippet;
	} & HTMLAttributes<HTMLElement> = $props();
</script>

<section
	class="punk-section rounded-lg border-2 p-5 {klass}"
	style:--section-accent={accent ?? 'var(--color-accent)'}
	{...rest}
>
	<!-- Headings are the one place 8-bit HUD belongs: the game sets module titles
	     in it and everything else in 000webfont. -->
	<h2
		class="punk-section-title punk-title-shadow mb-4 text-hud-sm uppercase tracking-hud-wide"
		style:color="var(--section-accent)"
	>
		{title}
	</h2>
	{@render children()}
</section>

<style>
	.punk-section-title {
		font-family: var(--font-title);
	}

	.punk-section {
		background-color: var(--color-surface);
		/* The card edge is the accent at low strength — present enough to group
		   the card, quiet enough that a page of them doesn't turn into stripes. */
		border-color: color-mix(in srgb, var(--section-accent) 35%, transparent);
	}
</style>
