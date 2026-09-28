/**
 * The desktop app's own window frame.
 *
 * The Tauri window is undecorated (`decorations: false` in tauri.conf.json):
 * the OS draws no title bar and no buttons, so the app draws both — a thin bar
 * to drag the window by (`WindowBar`), the three buttons in the style of the OS
 * it is running on (`WindowControls`), and on the platforms whose borderless
 * windows need it, the edges to resize by (`WindowEdges`). This is the one
 * place that knows which OS that is and what state the window is in.
 *
 * In a browser none of it exists: `style` is null and every surface that asks
 * draws nothing, because the browser already has a frame of its own.
 */

import { isTauri } from './save/platform';

/** Whose buttons to draw. Linux means GNOME's, the desktop most distros ship. */
export type ChromeStyle = 'windows' | 'mac' | 'linux';

/** The edges `startResizeDragging` accepts, in Tauri's own spelling. */
export type ResizeDirection =
	| 'North'
	| 'South'
	| 'East'
	| 'West'
	| 'NorthEast'
	| 'NorthWest'
	| 'SouthEast'
	| 'SouthWest';

/**
 * Read off the user agent rather than asked of the OS plugin: the three
 * webviews each name their platform plainly (WebView2 "Windows NT", WKWebView
 * "Macintosh", WebKitGTK "X11"/"Linux"), and it is known synchronously, so the
 * bar is the right shape on the very first paint.
 */
function detect(): ChromeStyle | null {
	if (!isTauri()) return null;
	const ua = navigator.userAgent;
	if (/Mac/.test(ua)) return 'mac';
	if (/Windows/.test(ua)) return 'windows';
	return 'linux';
}

type TauriWindow = import('@tauri-apps/api/window').Window;

class WindowChrome {
	readonly style = detect();

	maximized = $state(false);
	fullscreen = $state(false);
	/** The OS dims a window's buttons while another window has focus. */
	focused = $state(true);

	/**
	 * Whether the bar is drawn at all. Fullscreen is the one state with no title
	 * bar in any OS, so F11 takes the bar away with the rest of the frame.
	 */
	get shown(): boolean {
		return this.style !== null && !this.fullscreen;
	}

	/** A maximized or fullscreen window has no edge left to pull. */
	get resizable(): boolean {
		return this.shown && !this.maximized;
	}

	/**
	 * Mirrors `shown` onto `<html data-window-chrome>`, which is what sets
	 * `--titlebar-h` and so moves `.crt-screen` down to make room (layout.css).
	 * Meant to run inside an effect, so it follows fullscreen on and off.
	 */
	reflect = () => {
		const root = document.documentElement;
		if (this.shown && this.style) root.dataset.windowChrome = this.style;
		else delete root.dataset.windowChrome;
	};

	#win: Promise<TauriWindow> | null = null;

	#window(): Promise<TauriWindow> {
		this.#win ??= import('@tauri-apps/api/window').then((m) => m.getCurrentWindow());
		return this.#win;
	}

	minimize = async () => {
		await (await this.#window()).minimize();
	};

	toggleMaximize = async () => {
		await (await this.#window()).toggleMaximize();
	};

	close = async () => {
		await (await this.#window()).close();
	};

	startResize = async (direction: ResizeDirection) => {
		await (await this.#window()).startResizeDragging(direction);
	};

	/**
	 * Follows the window's state for as long as the app is up. Called once, by the
	 * layout; returns the teardown.
	 *
	 * Maximize, restore, fullscreen and snapping all arrive as a resize, so one
	 * listener covers them. A drag-resize fires that event per frame, and each
	 * answer is two round trips, so the reads are coalesced: one in flight at a
	 * time, and one more after it if anything happened meanwhile.
	 */
	bind = (): (() => void) => {
		if (!this.style) return () => {};

		let live = true;
		const unlisten: (() => void)[] = [];

		let reading = false;
		let again = false;
		const read = async (win: TauriWindow) => {
			if (reading) {
				again = true;
				return;
			}
			reading = true;
			try {
				do {
					again = false;
					const [maximized, fullscreen] = await Promise.all([
						win.isMaximized(),
						win.isFullscreen()
					]);
					if (!live) return;
					this.maximized = maximized;
					this.fullscreen = fullscreen;
				} while (again);
			} finally {
				reading = false;
			}
		};

		void (async () => {
			const win = await this.#window();
			const offs = await Promise.all([
				win.onResized(() => void read(win)),
				win.onFocusChanged(({ payload }) => (this.focused = payload))
			]);
			if (!live) {
				offs.forEach((off) => off());
				return;
			}
			unlisten.push(...offs);
			this.focused = await win.isFocused();
			await read(win);
		})();

		return () => {
			live = false;
			unlisten.forEach((off) => off());
		};
	};
}

export const windowChrome = new WindowChrome();
