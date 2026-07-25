<script module lang="ts">
	// Exported from the module script so callers can type their tab list; an
	// instance script can't export types.
	export type Tab = { id: string; label: string };
</script>

<script lang="ts">
	// The settings-menu tab strip from tabs.png / tabs_hover.png. The shape is
	// the whole idea: a rule runs the full width of the strip, every tab is a
	// three-sided box standing on it, and the current tab punches a hole in the
	// rule so it reads as continuous with the panel below. Nothing is coloured to
	// say which tab is current — the break in the rule says it.
	//
	// Read straight off tabs.png (a 3x capture): the rule runs unbroken under the
	// inactive tabs, which float one game pixel above it. Every tab shares the same
	// top edge; the active one is two pixels taller so its bottom drops through the
	// rule and hides that stretch of it. Every box has its two TOP corners cut open
	// like the buttons do, but the active tab keeps its bottom corners square where
	// it meets the panel. The rule also runs a little past the first and last tab.
	//
	// (Worth noting because it looks like a bug in the reference: the labels are
	// #fefefe in every state. The cyan and yellow fringing on the screenshots is
	// the game's bloom, not a colour we should reproduce.)

	let {
		tabs,
		current = $bindable(),
		label = 'Sections'
	}: { tabs: Tab[]; current: string; label?: string } = $props();

	// Arrow keys move between tabs, which is what a tablist is expected to do and
	// what you reach for after clicking one. The handler sits on each tab rather
	// than on the strip: the tabs carry the roving tabindex, so they are what
	// actually holds focus, and a listener on the non-focusable strip would only
	// ever fire by bubbling.
	function onkeydown(e: KeyboardEvent) {
		const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
		if (!delta) return;
		e.preventDefault();
		const i = tabs.findIndex((t) => t.id === current);
		const next = tabs[(i + delta + tabs.length) % tabs.length];
		current = next.id;
		document.getElementById(`tab-${next.id}`)?.focus();
	}
</script>

<div class="flex items-end punk-tabs" role="tablist" aria-label={label}>
	{#each tabs as tab (tab.id)}
		{@const active = tab.id === current}
		<button
			type="button"
			id="tab-{tab.id}"
			class="px-16 text-ui-sm uppercase punk-tab punk-cap"
			class:punk-tab-active={active}
			role="tab"
			aria-selected={active}
			tabindex={active ? 0 : -1}
			onclick={() => (current = tab.id)}
			{onkeydown}
		>
			{tab.label}
		</button>
	{/each}
</div>

<style>
	.punk-tabs {
		/* The rule every tab stands on. One game pixel tall and drawn once, full
		   width so it runs on past the last tab, with a short lead-in on the left
		   so it also shows before the first tab. */
		width: 100%;
		border-bottom: var(--u, 3px) solid var(--color-edge);
		padding-inline-start: calc(4 * var(--u, 3px));
		gap: calc(6 * var(--u, 3px));
	}

	.punk-tab {
		--u: 3px;
		--tab-frame: var(--color-edge);
		position: relative;
		color: var(--color-ink);
		/* Roomy box with the small label floated in it — the reference tab is mostly
		   air. Bottom carries the cap-fix that centres 000webfont's low capital. One
		   game pixel of that padding is moved from the bottom to the top, nudging the
		   label down so it reads centred rather than riding high. */
		padding-block: calc(7 * var(--u)) calc(5 * var(--u) + var(--cap-fix));
		/* Float one pixel clear of the rule so it shows through underneath. */
		margin-bottom: var(--u);
		transition: none;

		/* Three bars — top, left, right — with the two top corners cut open, the
		   game's box language. No bottom bar: the box opens downward toward the
		   rule. Order is top / left / right and must stay in step across image,
		   size and position. */
		background-repeat: no-repeat;
		background-image: linear-gradient(var(--tab-frame), var(--tab-frame)),
			linear-gradient(var(--tab-frame), var(--tab-frame)),
			linear-gradient(var(--tab-frame), var(--tab-frame));
		background-size:
			calc(100% - 2 * var(--u)) var(--u),
			var(--u) calc(100% - var(--u)),
			var(--u) calc(100% - var(--u));
		background-position:
			var(--u) 0,
			0 var(--u),
			100% var(--u);
	}

	.punk-tab:hover:not(.punk-tab-active) {
		--tab-frame: var(--color-accent);
	}

	/* The current tab shares its top edge with the others but stands two pixels
	   taller, so it drops through the rule and hides the stretch under it while
	   its top stays level. A void fill painted down past the rule covers that
	   pixel of the strip; the negative margin carries it over. Its bottom corners
	   stay square — this is the one box that meets the panel. */
	.punk-tab-active {
		padding-block: calc(7 * var(--u)) calc(7 * var(--u) + var(--cap-fix));
		margin-bottom: calc(-1 * var(--u));
		background-image: linear-gradient(var(--tab-frame), var(--tab-frame)),
			linear-gradient(var(--tab-frame), var(--tab-frame)),
			linear-gradient(var(--tab-frame), var(--tab-frame)),
			linear-gradient(var(--color-void), var(--color-void));
		background-size:
			calc(100% - 2 * var(--u)) var(--u),
			var(--u) calc(100% - var(--u)),
			var(--u) calc(100% - var(--u)),
			calc(100% - 2 * var(--u)) calc(100% - var(--u));
		background-position:
			var(--u) 0,
			0 var(--u),
			100% var(--u),
			var(--u) var(--u);
	}

	.punk-tab:focus-visible {
		outline: var(--u) solid var(--color-accent);
		outline-offset: calc(-2 * var(--u));
	}
</style>
