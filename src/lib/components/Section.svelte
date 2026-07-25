<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { reveal } from '$lib/actions/reveal';

	// The one place that defines what an editor section looks like — the card and
	// its heading. The card is the module tooltip's own frame (module_card.png):
	// square corners, the flat grey edge, and a short uppercase label in the
	// accent colour, the same way the game labels UPGRADES or POWER. A section
	// therefore sits among module cards as one of them.
	//
	// `plain` drops the card entirely — no slab, no edge — for surfaces that want
	// to read like the game's own HUD rather than an editor panel; its heading is
	// bigger and centred, with the optional `subtitle` sitting right under it.
	let {
		title,
		subtitle,
		plain = false,
		children,
		class: klass = '',
		...rest
	}: {
		title: string;
		subtitle?: string;
		plain?: boolean;
		children: Snippet;
	} & HTMLAttributes<HTMLElement> = $props();

	const shell = $derived(plain ? 'punk-section-plain' : 'punk-section p-5');
</script>

<section class="{shell} {klass}" use:reveal {...rest}>
	<!-- Headings are the one place 8-bit HUD belongs: the game sets module titles
	     in it and everything else in 000webfont. -->
	<div class="{plain ? 'mb-7 text-center' : 'mb-4'}">
		<h2
			class="punk-section-title punk-title-shadow text-accent uppercase tracking-hud-wide {plain
				? 'text-hud-md'
				: 'text-hud-sm'}"
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

	/* The module tooltip's own shell: warm near-black a shade below the surface,
	   square corners, the flat grey edge sampled off module_card.png. Matches the
	   cards this panel sits beside. */
	.punk-section {
		background-color: #120f0c;
		border: 2px solid rgb(48, 40, 34);
	}
</style>
