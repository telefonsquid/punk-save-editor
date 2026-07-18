<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	// The one place that defines what an editable number field looks like.
	// `class` sets the width (default w-32; the Cores field passes w-16).
	let { class: klass = 'w-32', ...rest }: HTMLInputAttributes = $props();
</script>

<input type="number" class="rounded border-zinc-700 bg-zinc-900 text-right {klass}" {...rest} />
