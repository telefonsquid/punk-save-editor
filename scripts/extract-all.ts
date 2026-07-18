/**
 * `bun run extract` — the one command to run after a game update.
 *
 * 1. scripts/extract-all.py   regenerates every JSON from the installed game
 *                             (one shared UnityPy scan for all five extractors)
 * 2. extract-module-effects.ts decodes the dumped Odin effect payloads
 * 3. check-data.ts            cross-checks the generated files for consistency
 *
 * Watch the output for WARNING lines: an unrecognised asset class or an
 * unknown effect type means the game update added something the tables in
 * punklib.py / extract-module-effects.ts need to learn about.
 * See docs/migration.md for the full runbook.
 *
 *     bun run extract [path-to-Punk_Data]
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const gameData = process.argv[2];

// The venv lives at the repo root (see punklib.py); Scripts/ on Windows, bin/ elsewhere.
const python = [`${here}/../.venv/Scripts/python.exe`, `${here}/../.venv/bin/python`].find(
	existsSync
);
if (!python) {
	console.error(
		'No .venv found. Create it first:\n' +
			'  python -m venv .venv\n' +
			'  .venv/Scripts/pip install UnityPy TypeTreeGeneratorAPI Pillow'
	);
	process.exit(1);
}

function run(cmd: string, args: string[]): void {
	console.log(`\n>>> ${[cmd, ...args].join(' ')}`);
	const result = spawnSync(cmd, args, { stdio: 'inherit' });
	if (result.status !== 0) {
		console.error(`step failed with exit code ${result.status}`);
		process.exit(result.status ?? 1);
	}
}

run(python, [`${here}/extract-all.py`, ...(gameData ? [gameData] : [])]);
run(process.execPath, [`${here}/extract-module-effects.ts`]);
run(process.execPath, [`${here}/check-data.ts`]);
