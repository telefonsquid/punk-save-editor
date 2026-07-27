<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	// A number with no box around it — just the HUD digits the game prints beside
	// a resource icon (resources.png) or under a consumable slot. Editable in
	// place: click and type. Unlike NumberInput it wears no frame; the value is
	// the whole control, and it sizes itself to its digits so a row of these
	// reads like the HUD counter it mimics rather than a form.
	//
	// `size` is our own font-size switch, so it shadows the input's numeric `size`
	// attribute (which this control never needs). `element` exposes the input to a
	// caller that has to write into the box itself — the consumable stepper does,
	// so a nudge shows even while the caret is sitting in it.
	//
	// It carries no fallback on purpose. A bindable prop with one refuses to be
	// bound to an undefined value, and the stepper binds each slot into an array
	// that starts empty — every entry is undefined until the row has rendered.
	let {
		class: klass = '',
		size = 'sm',
		element = $bindable(),
		...rest
	}: Omit<HTMLInputAttributes, 'size'> & {
		size?: 'sm' | 'xs';
		element?: HTMLInputElement | null;
	} = $props();
</script>

<input
	bind:this={element}
	type="number"
	class="punk-inline-num punk-hud-num punk-inline-num-{size} {klass}"
	{...rest}
/>

<style>
	.punk-inline-num {
		padding: 0;
		text-align: right;
		color: inherit;
		/* Grow and shrink to the digits so the icon sits right up against the number. */
		field-sizing: content;
		min-width: 1ch;
	}

	/* Two HUD sizes: the inventory strip's counter, and a smaller one for the
	   amount badge under a consumable slot. */
	.punk-inline-num-sm {
		font-size: 20px;
	}
	.punk-inline-num-xs {
		font-size: 13px;
	}

	/* Editing is marked by the accent alone — no frame, and none of the forms
	   plugin's blue focus ring (it lands a box-shadow on every number field). */
	.punk-inline-num:focus {
		outline: none;
		box-shadow: none;
		color: var(--color-accent);
	}
</style>
