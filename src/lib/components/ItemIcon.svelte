<script lang="ts">
	import icons from '$lib/game/item-icons.json';
	import { iconStyle } from '$lib/game/pixel-icon';

	// Ripped from the game (see scripts/extract-item-icons.py): the item art for
	// each ingredient / consumable / module id, e.g. a module GUID -> data-URI PNG.
	const iconMap = icons as Record<string, string>;

	// `scale` is an integer multiple of the sprite's natural size — never a CSS
	// box. See the rule in $lib/game/pixel-icon.ts.
	let { id, scale = 2 }: { id: string | null; scale?: number } = $props();

	const src = $derived(id ? (iconMap[id] ?? null) : null);
</script>

<!-- Undraggable: images drag themselves by default, so an icon sitting inside a
     draggable control becomes the drag source instead of the control — the
     consumable wheel's slots reorder by dragging, and the sprite was being torn
     out to the desktop rather than moved around the ring. The art is chrome
     here, never something to drag anywhere. -->
{#if src}
	<img {src} alt="" draggable="false" style={iconStyle(src, scale)} />
{/if}
