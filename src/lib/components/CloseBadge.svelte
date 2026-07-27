<script lang="ts">
	// The small cross that removes the thing it sits on — a module from the vault,
	// a painted shape from the library. Two looks, one control: `bare` for a cross
	// floating in a card's corner, `boxed` for one that has to read as a badge on
	// top of artwork.
	//
	// The glyph is a drawn SVG rather than a `×` character: a glyph sits on the
	// text baseline and carries the font's side bearings, so at these sizes it can
	// be neither centred nor scaled against the box it fills.
	//
	// `class` takes the caller's positioning. It must be Tailwind utilities: a
	// class from the caller's own scoped style block does not reach in here,
	// since the scoping attribute is never applied to this element.
	let {
		label,
		onclick,
		boxed = false,
		class: klass = ''
	}: {
		/** Names the action, e.g. "Remove DANDELION from the vault". */
		label: string;
		onclick: () => void;
		boxed?: boolean;
		class?: string;
	} = $props();
</script>

<button
	type="button"
	class="close-badge {boxed ? 'is-boxed' : 'is-bare'} {klass}"
	aria-label={label}
	title={label}
	{onclick}
>
	<svg viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
		<path d="M1 1l6 6M7 1l-6 6" />
	</svg>
</button>

<style>
	.close-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-muted);
		background: transparent;
		border: 0;
		padding: 0;
		cursor: pointer;
		transition: none;
	}

	.close-badge:hover {
		color: var(--color-danger);
	}

	.is-bare {
		width: 1rem;
		height: 1rem;
	}
	.is-bare svg {
		width: 100%;
		height: 100%;
	}

	/* Boxed: a badge with its own body, so it stays readable sitting on a lit
	   effect-field cell. */
	.is-boxed {
		width: 0.75rem;
		height: 0.75rem;
		border: 1px solid var(--color-edge-dim);
		background-color: var(--color-card);
	}
	.is-boxed:hover {
		border-color: var(--color-danger);
	}
	.is-boxed svg {
		width: 0.375rem;
		height: 0.375rem;
		stroke-width: 1.75;
	}
</style>
