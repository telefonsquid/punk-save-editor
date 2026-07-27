<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import InlineNumber from './InlineNumber.svelte';

	// One entry in the game's inventory strip (resources.png): a HUD number with
	// the thing's own art right after it, the whole pair clickable to edit the
	// number. Resources, ingredients and the run's money are all this shape — only
	// the sprite and the write path differ, so the sprite arrives as a snippet and
	// everything else passes straight through to the input.
	let {
		label,
		icon,
		...rest
	}: Omit<HTMLInputAttributes, 'size'> & {
		/** Names the item on hover and for screen readers. */
		label: string;
		icon: Snippet;
		/** InlineNumber's own size switch, not the input's numeric attribute. */
		size?: 'sm' | 'xs';
	} = $props();
</script>

<label class="flex items-center gap-2" title={label}>
	<span class="sr-only">{label}</span>
	<InlineNumber {...rest} />
	{@render icon()}
</label>
