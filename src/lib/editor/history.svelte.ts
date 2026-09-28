/**
 * Back and forward for an app that is one page.
 *
 * The editor is a single route, so moving between its screens — the title
 * screen, a save's tabs, the module grid over them — never changed the URL and
 * never made a history entry: the browser's Back left the site. Each of those
 * moves is now a shallow entry (SvelteKit's `pushState`), and the screen is read
 * back off `page.state` (typed in app.d.ts), so Back and Forward replay them.
 *
 * Two things a URL router gets for free have to be kept here by hand:
 *
 * - **Where we are.** Every entry carries its own index `i`, counted from 0, and
 *   `top` is the furthest one ahead. That is what the desktop app's own Back and
 *   Forward buttons ask — WebKit has no `navigation.canGoBack` to ask instead.
 * - **Entries that point at nothing.** An entry names the save that was open
 *   when it was made. Once that save is gone — closed from the mark, or replaced
 *   by a restore — its entries still sit in the browser's stack, and landing on
 *   one would show a screen that no longer exists. Those are stepped over, in
 *   whichever direction the step was going (`stale`, set by the page).
 *
 * The open save itself is never dropped by Back: stepping back to the title
 * screen leaves it in memory, unsaved edits and all, and Forward goes straight
 * back into it. Only the mark (`leave`) or opening another folder lets it go.
 */

import { page } from '$app/state';
import { pushState, replaceState } from '$app/navigation';
import { untrack } from 'svelte';
import { isTauri } from '$lib/save/platform';

type Entry = Omit<App.PageState, 'i'>;

/** One number per loaded save, so an entry can say which save it belongs to. */
const ids = new WeakMap<object, number>();
let nextId = 1;

export function saveId(slot: object): number {
	let id = ids.get(slot);
	if (id === undefined) ids.set(slot, (id = nextId++));
	return id;
}

/** The shortcuts each OS's browsers use for Back (-1) and Forward (+1). */
const KEYS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
const MAC_KEYS: Record<string, number> = { '[': -1, ']': 1 };
/** The dedicated keys some keyboards and mice carry, whatever the OS. */
const HARDWARE_KEYS: Record<string, number> = { BrowserBack: -1, BrowserForward: 1 };

class AppHistory {
	/** The furthest entry ahead that Forward can still reach. */
	#top = $state(0);
	/** Where the last move left us — how a Back is told from a Forward. */
	#last = 0;

	/** The page's answer to "does this entry's save still exist". */
	stale: (state: App.PageState) => boolean = () => false;

	get index(): number {
		return page.state.i ?? 0;
	}

	get canGoBack(): boolean {
		return this.index > 0;
	}

	get canGoForward(): boolean {
		return this.index < this.#top;
	}

	/** A new screen: an entry on top of this one, cutting off everything ahead. */
	push = (entry: Entry): void => {
		const i = this.index + 1;
		pushState('', { ...entry, i });
		this.#last = i;
		this.#top = i;
	};

	back = (): void => {
		if (this.canGoBack) history.back();
	};

	forward = (): void => {
		if (this.canGoForward) history.forward();
	};

	/**
	 * Closing the save from the mark: straight back to the title-screen entry it
	 * was opened from, rather than a new title entry on top — so Back from there
	 * goes where it went before the save was opened. Everything ahead now points
	 * at the save being closed, so Forward stops here.
	 */
	leave = (): void => {
		const to = page.state.from ?? 0;
		this.#top = to;
		if (to < this.index) history.go(to - this.index);
	};

	/**
	 * Wherever a step landed, by Back, Forward or a real navigation. Keeps
	 * `#last` honest, and keeps stepping over an entry whose save is gone.
	 *
	 * Run from an effect on `page.state` (`track`) rather than a popstate
	 * listener: SvelteKit sets `page.state` after the event has been through
	 * every listener, so a listener only ever sees the entry it left.
	 */
	#settle = (): void => {
		const i = this.index;
		if (i === this.#last) return;
		const dir = i > this.#last ? 1 : -1;
		this.#last = i;
		if (i > this.#top) this.#top = i;
		if (this.stale(page.state)) history.go(dir);
	};

	/** For an effect in the layout: settles every entry as it lands. */
	track = (): void => {
		void page.state;
		untrack(this.#settle);
	};

	/**
	 * For the layout's `afterNavigate`. Shallow entries never pass through it,
	 * but a real navigation (to /changelog and back) does, and has to be counted
	 * too or Back would read as unavailable on the page it just opened.
	 */
	arrived = (type: string): void => {
		// A step through the stack, settled by `track` like any other.
		if (type === 'popstate') return;
		if (type === 'enter') {
			// A reload keeps the entry's state; a fresh start has none. Either way
			// the entry is stamped again here: the one SvelteKit wrote before its
			// router started carries a different navigation index from every entry
			// pushed after, and a step back onto it would be a full navigation —
			// `page.state` arriving late, after `#settle` has already judged it.
			const i = this.index;
			replaceState('', { ...page.state, i });
			this.#last = i;
			this.#top = Math.max(this.#top, i);
			return;
		}
		// A link or goto made a new entry that SvelteKit knows about and we don't.
		const i = this.#last + 1;
		replaceState('', { ...page.state, i });
		this.#last = i;
		this.#top = i;
	};

	/**
	 * In the desktop app, the inputs a browser would give Back and Forward: the
	 * mouse's side buttons, Alt+Left/Right (Cmd+[ and Cmd+] on a Mac) and a
	 * keyboard's own Back and Forward keys. Called once, by the layout; returns
	 * the teardown.
	 */
	bind = (): (() => void) => {
		if (!isTauri()) return () => {};

		const mac = /Mac/.test(navigator.userAgent);

		// WebView2 and wry's WebKitGTK shim both turn the side buttons into a
		// history step on mouseup unless the page cancels it — cancelled here and
		// done once, the same way in all three webviews, rather than natively in
		// two and not at all in the third.
		const onMouse = (e: MouseEvent) => {
			if (e.button !== 3 && e.button !== 4) return;
			e.preventDefault();
			if (e.type === 'mouseup') {
				if (e.button === 3) this.back();
				else this.forward();
			}
		};

		const onKey = (e: KeyboardEvent) => {
			// A control that already used the key keeps it.
			if (e.defaultPrevented || e.repeat) return;
			const plain = mac
				? e.metaKey && !e.altKey && !e.ctrlKey
				: e.altKey && !e.ctrlKey && !e.metaKey;
			const dir = (plain ? (mac ? MAC_KEYS : KEYS)[e.key] : undefined) ?? HARDWARE_KEYS[e.key];
			if (!dir) return;
			e.preventDefault();
			if (dir < 0) this.back();
			else this.forward();
		};

		window.addEventListener('mousedown', onMouse);
		window.addEventListener('mouseup', onMouse);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onMouse);
			window.removeEventListener('mouseup', onMouse);
			window.removeEventListener('keydown', onKey);
		};
	};
}

export const appHistory = new AppHistory();
