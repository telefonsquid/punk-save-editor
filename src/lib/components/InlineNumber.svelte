<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	// A number with no box around it — just the big HUD digits the game prints
	// beside a resource icon (resources.png). Editable in place: click and type.
	// Unlike NumberInput it wears no frame; the value is the whole control, and it
	// sizes itself to its digits so a row of these reads like the HUD counter it
	// mimics rather than a form.
	// `size` is our own font-size switch, so it shadows the input's numeric `size`
	// attribute (which this control never needs).
	let {
		class: klass = '',
		size = 'md',
		...rest
	}: Omit<HTMLInputAttributes, 'size'> & { size?: 'md' | 'sm' } = $props();
</script>

<input type="number" class="punk-inline-num punk-inline-num-{size} {klass}" {...rest} />

<style>
	.punk-inline-num {
		background-color: transparent;
		border: 0;
		padding: 0;
		font-family: var(--font-title);
		/* 8-bit HUD carries its own spacing; the body's negative tracking would blur it. */
		letter-spacing: normal;
		text-align: right;
		color: var(--color-ink);
		/* Grow and shrink to the digits so the icon sits right up against the number. */
		field-sizing: content;
		min-width: 1ch;
		transition: none;
	}

	/* Two HUD sizes: the big counter, and a quieter one for the inventory strip. */
	.punk-inline-num-md {
		font-size: 25px;
	}
	.punk-inline-num-sm {
		font-size: 20px;
	}

	/* Editing is marked by the accent alone — no frame, and none of the forms
	   plugin's blue focus ring (it lands a box-shadow on every number field). */
	.punk-inline-num:focus {
		outline: none;
		box-shadow: none;
		color: var(--color-accent);
	}

	.punk-inline-num::-webkit-outer-spin-button,
	.punk-inline-num::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.punk-inline-num {
		appearance: textfield;
		-moz-appearance: textfield;
	}
</style>
