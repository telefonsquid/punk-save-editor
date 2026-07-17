<script lang="ts">
	import icons from '$lib/save/item-icons.json';

	// Ripped from the game (see scripts/extract-item-icons.py): the item art for
	// each ingredient / consumable / module id, e.g. a module GUID -> data-URI PNG.
	const iconMap = icons as Record<string, string>;

	let { id, class: className = '' }: { id: string | null; class?: string } = $props();

	const src = $derived(id ? (iconMap[id] ?? null) : null);
</script>

{#if src}
	<!-- Pixel-art item sprites; keep them crisp when scaled. -->
	<img {src} alt="" class={className} style="image-rendering: pixelated;" />
{/if}
