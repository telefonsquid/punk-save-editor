<script lang="ts">
	// The main-menu title effect, rebuilt in CSS from
	// static/design-references/main_title_logo_animation.mp4.
	//
	// What the video actually shows, once you step through it: there is only ever
	// ONE wordmark. Everything else is the same shape drawn larger and larger
	// about its own centre — a feedback zoom, the look you get by repeatedly
	// re-drawing a frame slightly bigger. Because the wordmark is wide and short,
	// blowing it up pushes the P's stem off to the left as a stack of bars and
	// the K's diagonal off to the right as a stack of chevrons, which is where
	// the "wings" come from. Nothing is per-letter.
	//
	// The tunnel itself is *static*: the copies sit at fixed sizes with fixed
	// colours, hot white at the centre cooling through amber and orange to red
	// and out. What moves is brightness — a pulse travelling from the middle
	// outward. Building it that way is also the only way it stays cheap, and the
	// first version taught me why the hard way: scaling twenty masked layers to
	// 9× while animating their background-colour repaints roughly 150 megapixels
	// a frame and wedges the renderer outright. Here every layer is exactly the
	// size of the (clipped) band, painted once, and only `opacity` animates —
	// which the compositor handles without repainting anything.
	//
	// Two assets, both from the game's own `MainMenu_placeholders_0` sprite via
	// scripts/extract-logo.py. `punk-wordmark.png` is the sprite as shipped —
	// 153×39, black fill with a white outline — which drawn onto black simply is
	// the logo, so the crisp centre copy is a plain <img>.
	//
	// The echoes mask against `punk-wordmark-outline.png` (the white pixels
	// only), and that distinction is the whole effect. Masking with the sprite's
	// own alpha gives solid letter shapes, and since each copy is only ~12%
	// bigger than the last, a stack of solids merges into one orange blob. The
	// game echoes the *outline*, so the copies come out as thin nested strokes
	// with black between them — which is the tunnel you actually see.

	import type { Snippet } from 'svelte';

	let {
		/** Integer multiple of the sprite's native 153×39. Non-integers blur it. */
		scale = 4,
		/** How many copies make up the tunnel. */
		echoes = 12,
		/**
		 * Rendered just below the wordmark. It belongs to this component rather
		 * than the page because the band is deliberately three times the
		 * wordmark's height — the echoes need that room — so a sibling in a
		 * normal column would be pushed a whole wordmark's worth of empty band
		 * away. Positioning it here measures from the wordmark itself, and
		 * leaves the wordmark centred on the tunnel it belongs to.
		 */
		subtitle
	}: { scale?: number; echoes?: number; subtitle?: Snippet } = $props();

	const WIDTH = 153;
	const HEIGHT = 39;
	// How many times the mark's own width the last copy spans. Every copy's mask
	// is rasterised at its used size, so this is the single number that decides
	// what this component costs — and past ~4 the copies are wider than the band
	// and entirely clipped, so raising it buys nothing but bitmap.
	const FURTHEST = 4;
	const DURATION = 2600; // ms for one pulse to travel centre → edge

	// Each copy is a constant *ratio* larger than the one before it. Even steps
	// would read as a flat stack of outlines; a geometric series is what makes it
	// look like distance.
	const ratio = $derived(FURTHEST ** (1 / echoes));

	// Colour as a function of distance, sampled off the video: white-hot core,
	// amber, the UI orange, then red and gone.
	const RAMP = [
		[0, '#fffbe6'],
		[0.12, '#ffe9a0'],
		[0.28, '#ffd257'],
		[0.45, '#fe9e20'],
		[0.62, '#f24d0a'],
		[0.82, '#8e1503'],
		[1, '#240300']
	] as const;

	function rampColor(t: number): string {
		for (let i = 1; i < RAMP.length; i++) {
			const [stop, color] = RAMP[i];
			if (t <= stop) return color;
		}
		return RAMP[RAMP.length - 1][1];
	}

	const layers = $derived(
		Array.from({ length: echoes }, (_, i) => {
			// Divided by `echoes`, not `echoes - 1`, so the last copy stops just
			// short of the end of the ramp — at t exactly 1 its peak opacity works
			// out to zero and the layer is pure cost for nothing.
			const t = i / echoes;
			return {
				width: WIDTH * scale * ratio ** i,
				color: rampColor(t),
				// The far copies are nearly lost in the black, as in the video.
				peak: 0.95 * (1 - t) ** 1.6,
				// Phase runs outward: the middle brightens first, the rim last.
				delay: -DURATION * (1 - t)
			};
		})
	);

	// The band is clipped, so the outer copies are cropped rather than forcing a
	// 1400px-tall element. This is what bounds the paint cost.
	const bandHeight = $derived(Math.round(HEIGHT * scale * 3));
	/** Past the furthest copy there is nothing to draw, so don't reserve width. */
	const bandWidth = $derived(WIDTH * scale * FURTHEST);
</script>

<div
	class="punk-logo relative grid w-full place-items-center overflow-hidden"
	style:height="{bandHeight}px"
	style:max-width="{bandWidth}px"
	role="img"
	aria-label="PUNK"
>
	<!-- The soft vertical flare sitting behind the centre of the mark. -->
	<div class="punk-flare" aria-hidden="true"></div>

	<!-- Painted furthest-first so the small hot copies land on top. In source
	     order the dim outer ones would cover the bright centre. -->
	{#each layers.toReversed() as layer, i (i)}
		<div
			class="punk-echo"
			aria-hidden="true"
			style:background-color={layer.color}
			style:-webkit-mask-size="{layer.width}px auto"
			style:mask-size="{layer.width}px auto"
			style:opacity={layer.peak}
			style:animation-delay="{layer.delay}ms"
			style:animation-duration="{DURATION}ms"
			style:--peak={layer.peak}
		></div>
	{/each}

	<img
		src="/punk-wordmark.png"
		alt=""
		width={WIDTH * scale}
		height={HEIGHT * scale}
		class="relative z-10"
	/>

	{#if subtitle}
		<!-- Half the band is above the wordmark's centre line, so clearing the
		     wordmark means half its height plus the gap we actually want. Two
		     sprite pixels of gap keeps it tucked under the mark at every scale. -->
		<div class="punk-logo-sub" style:top="calc(50% + {(HEIGHT * scale) / 2 + 2 * scale}px)">
			{@render subtitle()}
		</div>
	{/if}
</div>

<style>
	.punk-echo {
		position: absolute;
		inset: 0;
		/* The sprite's alpha is the silhouette — fill and outline are both opaque,
		   so masking with it gives solid letterforms rather than an outline. */
		-webkit-mask-image: url('/punk-wordmark-outline.png');
		mask-image: url('/punk-wordmark-outline.png');
		-webkit-mask-position: center;
		mask-position: center;
		-webkit-mask-repeat: no-repeat;
		mask-repeat: no-repeat;
		/* Deliberately no `will-change` here. Promoting a dozen band-sized layers
		   costs far more in texture memory than the repaint it saves; the spec
		   warns against exactly this, and it wedged the renderer when I tried. */
		animation-name: punk-pulse;
		animation-iteration-count: infinite;
		animation-timing-function: ease-in-out;
	}

	/* Only opacity moves. `--peak` carries each layer's ceiling so one keyframe
	   serves every layer without generating eighteen of them. */
	@keyframes punk-pulse {
		0%,
		100% {
			opacity: calc(var(--peak) * 0.35);
		}
		50% {
			opacity: var(--peak);
		}
	}

	/* Above the echoes so the keyline actually reads against them. */
	.punk-logo-sub {
		position: absolute;
		right: 0;
		left: 0;
		z-index: 10;
		text-align: center;
	}

	.punk-flare {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 18% 55% at 50% 50%,
			rgb(255 190 90 / 0.45),
			transparent 70%
		);
		animation: punk-flare 2600ms ease-in-out infinite;
	}

	@keyframes punk-flare {
		0%,
		100% {
			opacity: 0.5;
		}
		50% {
			opacity: 1;
		}
	}

	/* The motion is the whole point of this element, so there is nothing to keep
	   if it is unwanted — freeze the tunnel at its resting brightness. */
	@media (prefers-reduced-motion: reduce) {
		.punk-echo,
		.punk-flare {
			animation: none;
		}
	}
</style>
