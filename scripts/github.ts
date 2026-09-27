/**
 * GitHub REST access shared by the release scripts.
 * Needs GH_TOKEN (or GITHUB_TOKEN) with contents write and GITHUB_REPOSITORY as owner/repo.
 */

export interface Asset {
	id: number;
	name: string;
}

export interface Release {
	id: number;
	tag_name: string;
	body: string | null;
	assets: Asset[];
}

/** Repo and token from the environment, null when one is missing */
export function repoAccess(): { repo: string; token: string } | null {
	const repo = process.env.GITHUB_REPOSITORY;
	const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
	return repo && token ? { repo, token } : null;
}

export async function api(token: string, path: string, init?: RequestInit): Promise<unknown> {
	const response = await fetch(`https://api.github.com${path}`, {
		...init,
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${token}`,
			'X-GitHub-Api-Version': '2022-11-28',
			...init?.headers
		}
	});
	if (!response.ok) {
		throw new Error(`${init?.method ?? 'GET'} ${path} — ${response.status} ${await response.text()}`);
	}
	return response.json();
}

/** Drafts are missing from the lookup by tag, only the list has them */
export async function findRelease(token: string, repo: string, tag: string): Promise<Release | undefined> {
	const releases = (await api(token, `/repos/${repo}/releases?per_page=100`)) as Release[];
	return releases.find((r) => r.tag_name === tag);
}
