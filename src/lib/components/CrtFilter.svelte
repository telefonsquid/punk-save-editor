<script lang="ts">
	// The CRT look, done as an SVG filter on the whole app rather than a WebGL
	// overlay. The reason is blunt: a shader painted on top can't read the pixels
	// underneath it, so it can never actually bend or bloom them — it can only add
	// colour. An SVG filter runs ON the real rendered page, so the aberration and
	// bloom here are the true thing, and the same everywhere on screen (no
	// vignette). The layout wraps the app in `.crt-screen`, which points its
	// `filter` at the `#crt` defined below.

	// One knob. It scales the channel split, the glow spread and the warm cast
	// together, so turning it up makes the whole look stronger in step.
	let { intensity = 1 }: { intensity?: number } = $props();

	// Red goes one way, blue the other, by this many pixels — the split you read as
	// chromatic aberration. Kept small: only features about this thin tint, so a
	// larger split fringes every letter of body text. Big high-contrast shapes (the
	// logo, the diamonds) still read the split plainly at this size.
	const shift = $derived(0.9 * intensity);
	// How far the bright bits bleed. Kept tight so the glow stays a rim, not a haze.
	const bloom = $derived(1.6 * intensity);
	// How much of that glow is added back. Low, so bloom is a whisper of light on
	// the brightest edges rather than a wash over everything.
	const bloomStrength = $derived(Math.min(0.6, 0.3 * intensity));
	// The warm cast, applied as a gain on the channels rather than a flat wash: red
	// lifted a touch, blue pulled back. Scaling each pixel by its own value keeps
	// black at black, so solid dark fills (button and tab interiors) stay pure and
	// don't pick up a brown tint the open page doesn't have.
	const warmth = $derived(Math.min(0.2, 0.09 * intensity));
	const warmR = $derived(1 + 0.6 * warmth);
	const warmB = $derived(1 - warmth);
	const warmMatrix = $derived(
		`${warmR} 0 0 0 0  0 1 0 0 0  0 0 ${warmB} 0 0  0 0 0 1 0`
	);
</script>

<!-- Off-screen holder; it only carries the filter definition, draws nothing itself. -->
<svg class="crt-defs" aria-hidden="true" focusable="false">
	<filter id="crt" color-interpolation-filters="sRGB">
		<!-- Aberration: pull the red channel one way and the blue the other, leave
		     green put, then screen the three back together. Wide neutrals stay
		     neutral; only features as thin as the shift tint, so the shift is kept
		     small enough that body text barely catches it. -->
		<feColorMatrix
			in="SourceGraphic"
			type="matrix"
			values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
			result="red"
		/>
		<feOffset in="red" dx={shift} dy="0" result="redShift" />
		<feColorMatrix
			in="SourceGraphic"
			type="matrix"
			values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
			result="green"
		/>
		<feColorMatrix
			in="SourceGraphic"
			type="matrix"
			values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
			result="blue"
		/>
		<feOffset in="blue" dx={-shift} dy="0" result="blueShift" />
		<feBlend in="redShift" in2="green" mode="screen" result="rg" />
		<feBlend in="rg" in2="blueShift" mode="screen" result="aberrated" />

		<!-- Bloom: keep only the bright pixels (steep gain minus a floor kills the
		     mids), blur them, dim the result, then screen that faint glow back over
		     the sharp image so the brightest edges just catch light. -->
		<feColorMatrix
			in="aberrated"
			type="matrix"
			values="2.6 0 0 0 -1  0 2.6 0 0 -1  0 0 2.6 0 -1  0 0 0 1 0"
			result="bright"
		/>
		<feGaussianBlur in="bright" stdDeviation={bloom} result="glow" />
		<feComponentTransfer in="glow" result="glowSoft">
			<feFuncR type="linear" slope={bloomStrength} intercept="0" />
			<feFuncG type="linear" slope={bloomStrength} intercept="0" />
			<feFuncB type="linear" slope={bloomStrength} intercept="0" />
		</feComponentTransfer>
		<feBlend in="aberrated" in2="glowSoft" mode="screen" result="bloomed" />

		<!-- A warm cast that rides the content's own brightness, so it warms the lit
		     pixels without lifting flat black off the page. -->
		<feColorMatrix in="bloomed" type="matrix" values={warmMatrix} result="warmed" />

		<!-- Clip back to the page's own shape so the offsets don't leave a fringe
		     hanging past the edges. -->
		<feComposite in="warmed" in2="SourceGraphic" operator="atop" />
	</filter>
</svg>

<style>
	.crt-defs {
		position: absolute;
		width: 0;
		height: 0;
		pointer-events: none;
	}
</style>
