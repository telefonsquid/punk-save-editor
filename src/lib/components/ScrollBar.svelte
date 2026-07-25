<script lang="ts">
	/**
	 * The app's scrollbar, drawn over the scroller instead of beside it.
	 *
	 * WebView2 and WebKitGTK still hand out a classic 15px gutter, which is a
	 * permanent stripe of chrome down a screen that is meant to read as the game's
	 * own. So `.crt-screen` hides its native bar (see layout.css) and this draws
	 * one that costs no width, appears while you scroll and fades once you stop —
	 * the same behaviour macOS and modern browsers give for free, made to look
	 * like the rest of the app and to behave the same in all three webviews.
	 *
	 * It lives OUTSIDE `.crt-screen` on purpose: inside, the CRT filter would
	 * smear the one element that exists to be read at a glance.
	 */

	/** How long the bar stays up after the last scroll event. */
	const LINGER = 900;

	/** Short content would otherwise give a thumb a few pixels tall. */
	const MIN_THUMB = 32;

	let {
		/** The scrolling element. Assumed to fill the viewport, as `.crt-screen` does. */
		scroller
	}: { scroller: HTMLElement | null } = $props();

	let top = $state(0);
	let height = $state(0);
	let awake = $state(false);
	let dragging = $state(false);
	let hovered = $state(false);

	let timer: ReturnType<typeof setTimeout> | undefined;

	const shown = $derived(height > 0 && (awake || dragging || hovered));

	function measure() {
		if (!scroller) return;
		const { scrollTop, scrollHeight, clientHeight } = scroller;
		const overflow = scrollHeight - clientHeight;
		// A pixel of slack: sub-pixel layout leaves a hair of "overflow" on pages
		// that don't actually scroll, and a bar there would be a lie.
		if (overflow <= 1) {
			height = 0;
			return;
		}
		height = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * clientHeight);
		top = (scrollTop / overflow) * (clientHeight - height);
	}

	function wake() {
		awake = true;
		clearTimeout(timer);
		timer = setTimeout(() => (awake = false), LINGER);
	}

	$effect(() => {
		const el = scroller;
		if (!el) return;

		measure();
		const onScroll = () => {
			measure();
			wake();
		};
		el.addEventListener('scroll', onScroll, { passive: true });

		// The thumb's size depends on the content's height as much as the
		// viewport's, and tab switches change the content without any scrolling.
		const resize = new ResizeObserver(measure);
		resize.observe(el);
		if (el.firstElementChild) resize.observe(el.firstElementChild);

		return () => {
			el.removeEventListener('scroll', onScroll);
			resize.disconnect();
			clearTimeout(timer);
		};
	});

	function grab(event: PointerEvent) {
		if (!scroller || height === 0) return;
		// Otherwise the pointer picks up a text selection on the way down.
		event.preventDefault();

		const thumb = event.currentTarget as HTMLElement;
		const startY = event.clientY;
		const startTop = scroller.scrollTop;
		thumb.setPointerCapture(event.pointerId);
		dragging = true;

		const move = (e: PointerEvent) => {
			if (!scroller) return;
			// The thumb travels `clientHeight - height` for the whole scroll range,
			// so a pixel of pointer movement is worth that ratio of content.
			const travel = scroller.clientHeight - height;
			if (travel <= 0) return;
			const overflow = scroller.scrollHeight - scroller.clientHeight;
			scroller.scrollTop = startTop + ((e.clientY - startY) / travel) * overflow;
		};

		const drop = (e: PointerEvent) => {
			dragging = false;
			thumb.releasePointerCapture(e.pointerId);
			thumb.removeEventListener('pointermove', move);
			thumb.removeEventListener('pointerup', drop);
			thumb.removeEventListener('pointercancel', drop);
			wake();
		};

		thumb.addEventListener('pointermove', move);
		thumb.addEventListener('pointerup', drop);
		thumb.addEventListener('pointercancel', drop);
	}
</script>

<div class="scroll-track" aria-hidden="true">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="scroll-thumb"
		class:is-shown={shown}
		class:is-active={dragging}
		style:top="{top}px"
		style:height="{height}px"
		onpointerdown={grab}
		onpointerenter={() => (hovered = true)}
		onpointerleave={() => (hovered = false)}
	></div>
</div>

<style>
	.scroll-track {
		position: fixed;
		inset: 0 0 0 auto;
		width: 12px;
		/* Chrome, not content: the strip must never swallow a click meant for the
		   panel underneath, so only the thumb itself takes the pointer. */
		pointer-events: none;
		z-index: 60;
	}

	.scroll-thumb {
		position: absolute;
		right: 0;
		width: 6px;
		background-color: var(--color-edge);
		opacity: 0;
		pointer-events: auto;
		cursor: default;
		transition:
			opacity 220ms ease,
			background-color 120ms ease;
	}

	.scroll-thumb.is-shown {
		opacity: 1;
	}

	.scroll-thumb:hover,
	.scroll-thumb.is-active {
		background-color: var(--color-accent);
	}

	/* A thumb that slides while it fades reads as two things moving. */
	@media (prefers-reduced-motion: reduce) {
		.scroll-thumb {
			transition: none;
		}
	}
</style>
