<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { reveal } from '$lib/actions/reveal';

	// The one place that defines what an editor section looks like — the card and
	// its heading. The card is `punk-slab`, the module tooltip's own frame
	// (module_card.png): square corners and the flat grey edge, with a short
	// uppercase label in the accent colour, the same way the game labels UPGRADES
	// or POWER. A section therefore sits among module cards as one of them.
	//
	// `plain` drops the card entirely — no slab, no edge — for surfaces that want
	// to read like the game's own HUD rather than an editor panel; its heading is
	// bigger and centred, with the optional `subtitle` sitting right under it.
	let {
		title,
		subtitle,
		plain = false,
		revealDelay = 0,
		children,
		class: klass = '',
		...rest
	}: {
		title: string;
		subtitle?: string;
		plain?: boolean;
		/** Holds back the section's lift, for staggering one behind another. */
		revealDelay?: number;
		children: Snippet;
	} & HTMLAttributes<HTMLElement> = $props();
</script>

<section
	class="{plain ? '' : 'punk-slab p-5'} {klass}"
	use:reveal={{ delay: revealDelay }}
	{...rest}
>
	<!-- Headings are the one place 8-bit HUD belongs: the game sets module titles
	     in it and everything else in 000webfont. `plain` speaks louder because it
	     has no card around it to say where the section starts. -->
	<div class={plain ? 'mb-7 text-center' : 'mb-4'}>
		<h2 class="punk-panel-title punk-title-shadow text-accent" class:is-plain={plain}>
			{title}
		</h2>
		{#if subtitle}
			<p class="mt-1 text-muted text-ui-xs">{subtitle}</p>
		{/if}
	</div>
	{@render children()}
</section>

<style>
	/* One size up from `punk-panel-title`, set here rather than as a `text-hud-md`
	   utility beside it: two utilities both declaring font-size would be settled
	   by their order in the generated sheet, which is not something a component
	   should be betting on. A scoped class outranks both. */
	.is-plain {
		font-size: var(--text-hud-md);
		line-height: var(--text-hud-md--line-height);
	}
</style>
