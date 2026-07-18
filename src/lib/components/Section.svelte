<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	// The one place that defines what an editor section looks like — the card
	// and its heading. The planned in-game-style redesign restyles this file,
	// not every panel.
	let {
		title,
		children,
		class: klass = '',
		...rest
	}: { title: string; children: Snippet } & HTMLAttributes<HTMLElement> = $props();
</script>

<section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 {klass}" {...rest}>
	<h2 class="mb-4 text-sm font-bold tracking-widest text-fuchsia-400 uppercase">{title}</h2>
	{@render children()}
</section>
