/**
 * The one definition of a CHANGELOG.md version heading — `## 1.2.0 — 2026-08-01`
 * (a leading `v` and the date tolerated as optional). Three places parse it:
 * the /changelog page (changelog.ts), the release-notes script CI reads the
 * GitHub release body from, and version:set's "section exists" gate. They must
 * agree, or a release ships with its notes folded into a neighbour's — so they
 * all call this.
 */
export function versionHeading(line: string): { version: string; date: string | null } | null {
	const m = line.match(/^##\s+v?(\S+)\s*(?:[—–-]\s*(.*))?$/);
	return m ? { version: m[1], date: m[2]?.trim() || null } : null;
}
