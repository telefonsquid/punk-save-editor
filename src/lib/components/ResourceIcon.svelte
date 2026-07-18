<script lang="ts">
	import { resourceLabel } from '$lib/game/data';
	import { iconStyle } from '$lib/game/pixel-icon';
	import icons from '$lib/game/resource-icons.json';

	// Ripped from the game (see scripts/extract-resource-icons.py): the little
	// HUD glyph per resource id, e.g. "Resource Health" -> a data-URI PNG.
	const iconMap = icons as Record<string, string>;

	// `scale` is an integer multiple of the glyph's natural size — never a CSS
	// box. See the rule in $lib/game/pixel-icon.ts.
	//
	// `labeled` sets the resource name as alt text — pass it when the icon
	// *replaces* the written name (stat lines); leave it off when the name is
	// printed right next to the icon, so screen readers don't hear it twice.
	let { id, scale = 2, labeled = false }: { id: string; scale?: number; labeled?: boolean } =
		$props();

	const src = $derived(iconMap[id] ?? null);
</script>

{#if src}
	<img {src} alt={labeled ? resourceLabel(id) : ''} style={iconStyle(src, scale)} />
{/if}
