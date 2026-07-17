<script lang="ts">
	import icons from '$lib/save/resource-icons.json';

	// Ripped from the game (see scripts/extract-resource-icons.py): the little
	// HUD glyph per resource id, e.g. "Resource Health" -> a data-URI PNG.
	const iconMap = icons as Record<string, string>;

	let { id, class: className = '' }: { id: string; class?: string } = $props();

	const src = $derived(iconMap[id] ?? null);
</script>

{#if src}
	<!-- Tiny pixel-art sprites; keep them crisp when scaled up. -->
	<img {src} alt="" class={className} style="image-rendering: pixelated;" />
{/if}
