<script lang="ts">
	import icons from '$lib/save/item-icons.json';
	import { iconStyle } from '$lib/save/pixel-icon';

	// Ripped from the game (see scripts/extract-item-icons.py): the item art for
	// each ingredient / consumable / module id, e.g. a module GUID -> data-URI PNG.
	const iconMap = icons as Record<string, string>;

	// `scale` is an integer multiple of the sprite's natural size — never a CSS
	// box. See the rule in $lib/save/pixel-icon.ts.
	let { id, scale = 2 }: { id: string | null; scale?: number } = $props();

	const src = $derived(id ? (iconMap[id] ?? null) : null);
</script>

{#if src}
	<img {src} alt="" style={iconStyle(src, scale)} />
{/if}
