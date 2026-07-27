<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	// A dropdown on the shared `punk-field` chrome (layout.css). Options are the
	// caller's, so it stays a plain `<select>` underneath and keeps the platform's
	// own list behaviour on every device.
	let { class: klass = '', children, ...rest }: HTMLSelectAttributes & { children: Snippet } =
		$props();
</script>

<select class="punk-field punk-select {klass}" {...rest}>{@render children()}</select>

<style>
	.punk-select {
		/* No chevron at all — it overlapped the value and clashed with the pixel
		   chrome. `appearance: none` drops the native arrow, and `background-image:
		   none` drops the SVG one @tailwindcss/forms paints on every select. The
		   framed box alone reads as a picker, and the value sits centred in it. */
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
		background-image: none;
		padding: 0.25rem 0.9rem;
		text-align: center;
		text-align-last: center;
	}
</style>
