<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	// A text or search box on the shared `punk-field` chrome (layout.css). The
	// game draws no such control — every field it has is a number in a frame — so
	// this is the editor's own, and it exists as a component so the filter box,
	// the raw tree and anything added later cannot drift apart.
	//
	// `value` is bindable because these are the editor's own controls rather than
	// a save-tree field: nothing here writes into an Odin node, so the deep-proxy
	// rule that bans `bind:value` elsewhere does not apply.
	let {
		value = $bindable(''),
		class: klass = '',
		...rest
	}: HTMLInputAttributes & { value?: string } = $props();
</script>

<input bind:value class="punk-field punk-text {klass}" {...rest} />

<style>
	.punk-text {
		font-family: var(--font-ui);
		padding: 0.35rem 0.6rem;
	}
</style>
