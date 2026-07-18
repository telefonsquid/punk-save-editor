<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	// The one place that defines what editor buttons look like (the grid
	// connection toggles are the deliberate exception — they're stateful
	// pressed/unpressed cells, not buttons in this sense).
	const VARIANTS = {
		/** The main call to action (Save). */
		primary: 'bg-lime-500 font-bold text-zinc-950 hover:bg-lime-400',
		/** The default: outlined, lights up lime. */
		outline: 'border border-zinc-700 font-semibold hover:border-lime-400 hover:text-lime-400',
		/** Neutral chrome (Close) — no accent on hover. */
		ghost: 'border border-zinc-700 hover:border-zinc-500',
		/** Destructive (Remove) — lights up red instead. */
		danger: 'border border-zinc-700 text-zinc-500 hover:border-red-500 hover:text-red-400'
	};
	const SIZES = {
		md: 'px-3 py-1.5 text-sm',
		sm: 'px-2.5 py-1 text-sm',
		xs: 'px-2 py-1 text-xs'
	};

	let {
		variant = 'outline',
		size = 'md',
		children,
		...rest
	}: {
		variant?: keyof typeof VARIANTS;
		size?: keyof typeof SIZES;
		children: Snippet;
	} & HTMLButtonAttributes = $props();
</script>

<button
	type="button"
	class="inline-flex items-center justify-center gap-1.5 rounded disabled:opacity-40 {VARIANTS[
		variant
	]} {SIZES[size]}"
	{...rest}
>
	{@render children()}
</button>
