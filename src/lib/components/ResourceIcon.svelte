<script lang="ts">
	import icons from '$lib/game/resource-icons.json';
	import { iconStyle } from '$lib/game/pixel-icon';

	// Ripped from the game (see scripts/extract-resource-icons.py): the little
	// HUD glyph per resource id, e.g. "Resource Health" -> a data-URI PNG.
	const iconMap = icons as Record<string, string>;

	// `scale` is an integer multiple of the glyph's natural size — never a CSS
	// box. See the rule in $lib/game/pixel-icon.ts.
	let { id, scale = 2 }: { id: string; scale?: number } = $props();

	const src = $derived(iconMap[id] ?? null);
</script>

{#if src}
	<img {src} alt="" style={iconStyle(src, scale)} />
{/if}
