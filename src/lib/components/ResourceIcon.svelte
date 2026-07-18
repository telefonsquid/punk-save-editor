<script lang="ts">
	import { resourceArt, resourceLabel } from '$lib/game/data';
	import { iconStyle } from '$lib/game/pixel-icon';

	// One component for every size the game draws a resource at (ripped by
	// scripts/extract-resource-icons.py — see ResourceArt for what each is):
	//
	//   icon        the small HUD glyph, and the editor's default
	//   bar         one full-size bar unit — the large, per-resource art
	//   barCompact  \ the smaller bar units. Both sprites are *shared* by every
	//   barMicro    / resource, so they get tinted with the resource's colour,
	//               the same way the game does it.
	//
	// A variant the resource doesn't have falls back to the glyph (Money has no
	// large bar), and a resource with no art renders nothing at all.
	//
	// `scale` is an integer multiple of the sprite's natural size — never a CSS
	// box. See the rule in $lib/game/pixel-icon.ts.
	//
	// `labeled` names the resource for screen readers — pass it when the icon
	// *replaces* the written name (stat lines); leave it off when the name is
	// printed right next to the icon, so it isn't announced twice.
	type Variant = 'icon' | 'bar' | 'barCompact' | 'barMicro';

	let {
		id,
		variant = 'icon',
		scale = 2,
		labeled = false
	}: { id: string; variant?: Variant; scale?: number; labeled?: boolean } = $props();

	const art = $derived(resourceArt[id] ?? null);
	const src = $derived(art?.[variant] ?? art?.icon ?? null);
	const shared = $derived(variant === 'barCompact' || variant === 'barMicro');
</script>

{#if src}
	{#if shared && art?.color}
		<!-- Tinted through a mask: the shared bar sprite is grey artwork. -->
		<span
			role="img"
			aria-label={labeled ? resourceLabel(id) : undefined}
			aria-hidden={labeled ? undefined : 'true'}
			style="{iconStyle(src, scale)} background-color: {art.color}; mask: url({src}) center / 100% 100%;"
		></span>
	{:else}
		<img {src} alt={labeled ? resourceLabel(id) : ''} style={iconStyle(src, scale)} />
	{/if}
{/if}
