import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const { version } = JSON.parse(
	readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string };

export default defineConfig({
	// The app needs its own version to tell whether the newest GitHub release is
	// ahead of it (see lib/update.ts). package.json is the one to read: it is
	// what `version:set` writes first and what CI checks the release tag against.
	define: {
		__APP_VERSION__: JSON.stringify(version)
	},
	// Tauri expects the dev server on a fixed port (see src-tauri/tauri.conf.json devUrl);
	// PORT overrides it so a second dev server can run beside the default one.
	server: {
		port: Number(process.env.PORT) || 5173,
		strictPort: true
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true }
			},
			adapter: adapter({
				fallback: 'index.html'
			}),
			vitePlugin: {
				// Press Alt+X (or hold it) in dev to inspect a component and jump to
				// its source in the editor. Alt+X is the plugin default, spelled out
				// here so it is obvious. The always-on toggle button makes it findable.
				inspector: {
					toggleKeyCombo: 'alt-x',
					holdMode: true,
				}
			}
		})
	]
});
