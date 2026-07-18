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

/** Seconds as "3h 07m" (run time display). */
export function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	return `${h}h ${String(m).padStart(2, '0')}m`;
}
