/**
 * Notices that a newer release exists, and stops there.
 *
 * Tauri ships an updater that would install one in place, and this deliberately
 * does not use it: it replaces the app it is running from, which neither the
 * portable exe nor the deb/rpm bundles can honour, and it signs every build with
 * a key whose loss would break updates for every copy already installed. A link
 * to the release page costs none of that and covers every way the app is
 * distributed.
 *
 * Nothing here ever reports a failure. No network, a rate limit and a repo with
 * no releases all mean the same thing to the reader — there is nothing to say.
 */

import { isTauri } from './save/io';

const REPO = 'telefonsquid/punk-save-editor';

/** GitHub's "latest" skips drafts and prereleases, so this only sees published ones. */
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

const CACHE_KEY = 'punk-save-editor:latest-release';

/**
 * Six hours. Long enough that a reloading browser tab stays well clear of the
 * 60-requests-an-hour GitHub allows without a token, short enough that a release
 * is noticed the same day.
 */
const MAX_AGE = 6 * 60 * 60 * 1000;

/** Set from package.json at build time — see `define` in vite.config.ts. */
export const appVersion: string = __APP_VERSION__;

export interface Update {
	/** Bare version, no leading `v`. */
	version: string;
	url: string;
}

interface Cached extends Update {
	at: number;
}

/** The three numbers and the optional prerelease tail, which is all `version:set` accepts. */
function split(version: string): { numbers: number[]; pre: string } {
	const [core, ...tail] = version.replace(/^v/, '').split('-');
	return { numbers: core.split('.').map((n) => Number(n) || 0), pre: tail.join('-') };
}

/**
 * True when `candidate` is a later release than `installed`.
 *
 * Two different prerelease tails on the same three numbers is the one pair this
 * cannot order, and it answers "no" — a nag that should not be there is worse
 * than a missed one, and GitHub never reports a prerelease as the latest anyway.
 */
function isNewer(candidate: string, installed: string): boolean {
	const a = split(candidate);
	const b = split(installed);

	for (let i = 0; i < 3; i++) {
		const mine = a.numbers[i] ?? 0;
		const theirs = b.numbers[i] ?? 0;
		if (mine !== theirs) return mine > theirs;
	}

	// Same numbers: a prerelease loses to the release it leads up to.
	return a.pre === '' && b.pre !== '';
}

const browser = typeof localStorage !== 'undefined';

function readCache(): Update | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const cached = JSON.parse(raw) as Cached;
		if (typeof cached?.version !== 'string' || typeof cached?.url !== 'string') return null;
		return Date.now() - cached.at > MAX_AGE ? null : { version: cached.version, url: cached.url };
	} catch {
		return null;
	}
}

function writeCache(update: Update) {
	if (!browser) return;
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify({ ...update, at: Date.now() } satisfies Cached));
	} catch {
		// A full or blocked storage costs one extra request next launch, nothing else.
	}
}

async function fetchLatest(): Promise<Update | null> {
	const response = await fetch(LATEST, { headers: { Accept: 'application/vnd.github+json' } });
	if (!response.ok) return null;

	const release = (await response.json()) as { tag_name?: string; html_url?: string };
	if (!release.tag_name || !release.html_url) return null;

	return { version: release.tag_name.replace(/^v/, ''), url: release.html_url };
}

/**
 * The newest release, if it is newer than this build. Null otherwise.
 *
 * Only the desktop app asks. A browser is already running whatever is deployed,
 * so an update notice there would point at a download it does not need.
 */
export async function checkForUpdate(): Promise<Update | null> {
	if (!isTauri()) return null;

	let latest = readCache();
	if (!latest) {
		try {
			latest = await fetchLatest();
		} catch {
			return null;
		}
		if (!latest) return null;
		writeCache(latest);
	}

	return isNewer(latest.version, appVersion) ? latest : null;
}
