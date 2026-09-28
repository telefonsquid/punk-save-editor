// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		/**
		 * One entry of the app's own history — see `$lib/editor/history.svelte.ts`.
		 * The editor is one route, so its screens are shallow entries on it rather
		 * than URLs: which save, which tab, whether the grid is over it.
		 */
		interface PageState {
			/** The entry's place in the stack, counted by the app from 0. */
			i?: number;
			/** The open save this entry belongs to; absent on the title screen. */
			save?: number;
			/** The title-screen entry this save was opened from. */
			from?: number;
			tab?: 'resources' | 'data';
			/** The module grid is open over the tab. */
			grid?: boolean;
		}
		// interface Platform {}
	}

	/** package.json's version, substituted at build time by vite.config.ts. */
	const __APP_VERSION__: string;
}

export {};
