import { prefersReducedMotion } from 'svelte/motion';

// Rise-and-fade an element the first time it reaches the fold, matching the
// gentle lift the tabs play when a page arrives. One shared motion for the whole
// editor: sections and cards settle in the same way, whether reached by switching
// tabs or by scrolling down to them.
//
// The distance and the two eases are the `--reveal-*` tokens in layout.css, read
// straight out of the inline styles rather than repeated here, because a dialog
// plays the same arrival off the same tokens without a fold to cross.
//
// Anyone who asked the OS to reduce motion is left untouched, so the element is
// simply there.
//
// A position sweep on scroll drives this rather than an IntersectionObserver: an
// observer only reports when an element *crosses* the edge, so dragging the
// scrollbar straight to the bottom would jump clean over the middle rows and
// leave them stuck invisible. Checking every waiting element's position instead
// reveals everything now above the fold, however it got there.

interface Pending {
	node: HTMLElement;
	delay: number;
}

const waiting = new Set<Pending>();
let listening = false;
let queued = false;

// Reveal a touch before the element's top reaches the very bottom edge, so it is
// already settling by the time it reads as on-screen.
const FOLD = 0.92;

function play(it: Pending) {
	const { node, delay } = it;
	node.style.transition = `opacity var(--reveal-duration) var(--reveal-ease-fade), transform var(--reveal-duration) var(--reveal-ease)`;
	node.style.transitionDelay = `${delay}ms`;
	node.style.opacity = '1';
	node.style.transform = 'none';
	// Strip the inline styles once the lift is done so nothing lingers. A
	// left-behind transform makes a new containing block, which would quietly
	// trap any fixed-position child of a card.
	node.addEventListener(
		'transitionend',
		() => {
			node.style.transition = '';
			node.style.transitionDelay = '';
			node.style.willChange = '';
			node.style.opacity = '';
			node.style.transform = '';
		},
		{ once: true }
	);
}

function sweep() {
	queued = false;
	const fold = window.innerHeight * FOLD;
	for (const it of waiting) {
		if (it.node.getBoundingClientRect().top < fold) {
			play(it);
			waiting.delete(it);
		}
	}
	if (waiting.size === 0) {
		window.removeEventListener('scroll', schedule, true);
		window.removeEventListener('resize', schedule);
		listening = false;
	}
}

function schedule() {
	if (!queued) {
		queued = true;
		requestAnimationFrame(sweep);
	}
}

interface RevealOptions {
	/** Held-back start, for staggering a row of cards. */
	delay?: number;
}

export function reveal(node: HTMLElement, options: RevealOptions = {}) {
	if (prefersReducedMotion.current) return;

	const it: Pending = { node, delay: options.delay ?? 0 };
	node.style.opacity = '0';
	node.style.transform = `translateY(var(--reveal-rise))`;
	node.style.willChange = 'opacity, transform';
	waiting.add(it);

	if (!listening) {
		// Capture, so a scroll inside any nested scroller counts too.
		window.addEventListener('scroll', schedule, { capture: true, passive: true });
		window.addEventListener('resize', schedule);
		listening = true;
	}
	// Catch whatever is already on screen at mount.
	schedule();

	return {
		destroy() {
			waiting.delete(it);
		}
	};
}
