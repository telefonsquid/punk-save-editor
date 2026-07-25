/**
 * F11 fullscreen for the desktop app.
 *
 * A browser gives F11 for free; an embedded webview does not, because there is
 * no browser chrome to hide — the key arrives as an ordinary keydown and nothing
 * listens. So the desktop app listens, and asks the Tauri window to drop its
 * decorations itself.
 *
 * In a real browser this stays out of the way and lets the browser have the key.
 */

import { isTauri } from './save/io';

/** Binds F11 while the app is running in Tauri. Returns the teardown. */
export function bindFullscreenKey(): () => void {
	if (!isTauri()) return () => {};

	// setFullscreen round-trips to the window; holding the key would otherwise
	// queue a toggle per repeat and leave the state anyone's guess.
	let busy = false;

	async function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'F11' || event.repeat || busy) return;
		event.preventDefault();
		busy = true;
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const win = getCurrentWindow();
			await win.setFullscreen(!(await win.isFullscreen()));
		} finally {
			busy = false;
		}
	}

	window.addEventListener('keydown', onKeyDown);
	return () => window.removeEventListener('keydown', onKeyDown);
}
