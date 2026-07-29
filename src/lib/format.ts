/**
 * Number formatting shared across the editor. Only the *display* is ever
 * rounded — the save trees keep whatever precision the game wrote (and
 * whatever the user types), so saving never quietly truncates a value that
 * wasn't edited.
 */

/** A float with at most one decimal ("12", "3.5") — the default for editable values. */
export function fmt1(v: number): string {
	return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Recharge rates in the game's own "0.0#" format: one decimal, a second only
 * if it carries information. Tech regen is +0.06/s — at fmt1 that reads
 * "+0.1/s", which rounds away most of what the number says. */
export function fmtRate(v: number): string {
	const r = Math.round(v * 100) / 100;
	return r.toFixed(Math.round(r * 100) % 10 === 0 ? 1 : 2);
}

/** Compact stat number: no trailing `.0`, at most two decimals. */
export function fmtStat(v: number): string {
	const r = Math.round(v * 100) / 100;
	return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '');
}

/**
 * File sizes as "1.4 MB". Decimal units, because that is what every file
 * manager the user will compare this against shows — a backup archive sitting
 * next to its own folder should read as the same number in both places.
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1000) return `${bytes} B`;
	const units = ['kB', 'MB', 'GB'];
	let value = bytes / 1000;
	let unit = 0;
	// `>= 999.5` rather than `>= 1000`, because the step up has to happen before
	// the rounding below, not after it: 999_999 B is 999.999 kB, and rounding that
	// to a whole number prints "1000 kB" — a number wearing the wrong unit.
	while (value >= 999.5 && unit < units.length - 1) {
		value /= 1000;
		unit++;
	}
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** Seconds as "3h 07m" (run time display). */
export function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	return `${h}h ${String(m).padStart(2, '0')}m`;
}
