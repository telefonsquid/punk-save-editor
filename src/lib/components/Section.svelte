<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { reveal } from '$lib/actions/reveal';

	// The one place that defines what an editor section looks like — the card and
	// its heading. Modelled on the module tooltip (module_card.png): a rounded
	// warm-black slab with a hairline edge and a short uppercase label in the
	// accent colour, the same way the game labels UPGRADES or POWER.
	//
	// `accent` lets a section borrow a resource's or module's own colour for its
	// heading and edge, which is how the game distinguishes cards; left unset it
	// falls back to the UI orange.
	// `plain` drops the card entirely — no slab, no edge — for surfaces that want
	// to read like the game's own HUD rather than an editor panel; its heading is
	// bigger and centred, with the optional `subtitle` sitting right under it.
	// `square` swaps the rounded accent card for the module tooltip's own frame:
	// square corners and the flat grey edge, so a panel sits among module cards
	// as one of them.
	let {
		title,
		subtitle,
		accent,
		plain = false,
		square = false,
		children,
		class: klass = '',
		...rest
	}: {
		title: string;
		subtitle?: string;
		accent?: string | null;
		plain?: boolean;
		square?: boolean;
		children: Snippet;
	} & HTMLAttributes<HTMLElement> = $props();

	const shell = $derived(
		plain ? 'punk-section-plain' : square ? 'punk-section-square p-5' : 'punk-section rounded-lg border-2 p-5'
	);
</script>

<section
	class="{shell} {klass}"
	style:--section-accent={accent ?? 'var(--color-accent)'}
	use:reveal
	{...rest}
>
	<!-- Headings are the one place 8-bit HUD belongs: the game sets module titles
	     in it and everything else in 000webfont. -->
	<div class="{plain ? 'mb-7 text-center' : 'mb-4'}">
		<h2
			class="punk-section-title punk-title-shadow uppercase tracking-hud-wide {plain
				? 'text-hud-md'
				: 'text-hud-sm'}"
			style:color="var(--section-accent)"
		>
			{title}
		</h2>
		{#if subtitle}
			<p class="mt-1 text-muted text-ui-xs">{subtitle}</p>
		{/if}
	</div>
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

	/* The module tooltip's own shell: warm near-black a shade below the surface,
	   square corners, the flat grey edge sampled off module_card.png. Matches the
	   cards this panel sits beside. */
	.punk-section-square {
		background-color: #120f0c;
		border: 2px solid rgb(48, 40, 34);
	}
</style>
