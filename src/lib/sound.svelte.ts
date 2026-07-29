/**
 * The game's own interface sounds, played by the editor's controls.
 *
 * The clips and the volume each is played at are ripped from the game's
 * `AudioDatabase` (`scripts/extract-ui-sounds.py` — see that file for what the
 * six names mean and why they were the ones borrowed). Nothing here decides how
 * anything *sounds*; it only decides when.
 *
 * Three things are worth knowing before editing this:
 *
 * 1. **Web Audio, not `<audio>`, and `atob`, not `fetch`.** The desktop app
 *    ships a strict CSP (`src-tauri/tauri.conf.json`) that allows `data:` for
 *    images only — no `media-src` at all, and no `data:` in `connect-src`. So an
 *    `<audio src="data:…">` element and a `fetch()` of the same URI are both
 *    refused there, while the bytes decoded by hand and handed to
 *    `decodeAudioData` are not subject to CSP in the first place. This is also
 *    what lets the same click overlap itself instead of restarting one element.
 *
 * 2. **A sound before the page's first click is dropped, not queued.** Browsers
 *    hand out a suspended AudioContext until a gesture has happened, and
 *    starting sources on it would bank them all up and fire them at once on the
 *    first click. Resuming is asked for and this one sound is let go; by the
 *    second interaction the context is running.
 *
 * 3. **The retrigger guard is ours, not the game's.** Every sfx borrowed here
 *    carries the untouched default `repeatMinDelay` of 10 ms, because the game
 *    never needs more: its hover sound is `ISelectHandler.OnSelect`, which fires
 *    on gamepad and keyboard *selection changes*. A mouse crossing a row of
 *    buttons is an input the game does not have, and 10 ms does not blunt it.
 */

import uiSounds from './game/ui-sounds.json';

/** The editor events that have a sound. Keys of the generated catalogue, so a
 *  sound the game dropped becomes a type error at the call site rather than
 *  silence nobody notices. */
export type SoundName = keyof typeof uiSounds;

interface Clip {
	uri: string;
	/** The game's draw weight; see `drawClip`. */
	weight: number;
}

interface Sound {
	/** The name the game files this under, e.g. `UI/OK`. For reading, not code. */
	sfx: string;
	volume: number;
	clips: Clip[];
}

const catalogue = uiSounds as Record<SoundName, Sound>;

const STORAGE_KEY = 'punk-save-editor:sounds';

/** Prerendering has no storage; the app itself always does (`ssr = false`). */
const hasStorage = typeof localStorage !== 'undefined';

/** How soon the same sound may play again. Long enough that dragging the
 *  pointer across a toolbar is one blip rather than five, short enough that
 *  deliberately clicking twice is heard twice. */
const RETRIGGER_MS = 60;

/**
 * The mixer the editor does not have.
 *
 * Every volume in the game's database is a level *within a mix* — sfx sit
 * between 0.05 and 0.5 and share the output with weapons, engines and a music
 * bed. (Checked, rather than assumed: the game's AudioMixer snapshot stores no
 * float values and its groups carry no effects, so every bus is at unity and
 * the number on the sfx really is the whole story.) Played bare in a silent
 * editor those levels are far too low — measured, the palette lands between
 * -22 and -34 dBFS peak, and the hover blip at the bottom of that is inaudible
 * over a room.
 *
 * So one gain lifts the whole palette and nothing else changes: the game's
 * relative balance is exactly preserved — hover stays the quietest thing here
 * because the game made it the quietest thing there — and the loudest sound
 * peaks near -13 dBFS, which is where a UI sound belongs.
 */
const MASTER_GAIN = 3;

let context: AudioContext | null = null;

/**
 * Decoded clips, and the decodes still in flight, keyed by data URI. One entry
 * per clip for the app's lifetime — the whole catalogue is 35 kB.
 *
 * These two must stay plain `Map`s. `SvelteMap` is the rule in a `.svelte.ts`
 * file and is right nearly everywhere, but `play()` is called from inside
 * Dialog's `$effect`, and `lastPlayed` is both read and written on that path: a
 * reactive map would make the effect depend on state it assigns itself, which
 * is an effect that re-runs forever. Neither map is rendered from, so there is
 * nothing on the other side of the reactivity to gain either.
 */
/* eslint-disable svelte/prefer-svelte-reactivity -- see above */
const buffers = new Map<string, Promise<AudioBuffer | null>>();

const lastPlayed = new Map<SoundName, number>();
/* eslint-enable svelte/prefer-svelte-reactivity */

/** The bytes of a base64 data URI, without going through `fetch` — see note 1. */
function bytesOf(uri: string): ArrayBuffer {
	const binary = atob(uri.slice(uri.indexOf(',') + 1));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes.buffer;
}

/**
 * One clip of an sfx, drawn the way the game's `Distribution.Draw` draws it:
 * weighted, and falling back to the first item when the weights are all zero —
 * which is what every UI sound in the game currently has, since each holds a
 * single clip and the weight is never consulted.
 */
function drawClip(clips: Clip[]): Clip {
	const total = clips.reduce((sum, clip) => sum + clip.weight, 0);
	if (total <= 0) return clips[0];
	let roll = Math.random() * total;
	for (const clip of clips) {
		roll -= clip.weight;
		if (roll <= 0) return clip;
	}
	return clips[clips.length - 1];
}

function decode(ctx: AudioContext, uri: string): Promise<AudioBuffer | null> {
	const started = buffers.get(uri);
	if (started) return started;
	// A clip that will not decode costs its sound, not the interaction that
	// asked for it — and the null is cached, so it is not retried on every click.
	const pending = ctx.decodeAudioData(bytesOf(uri)).catch(() => null);
	buffers.set(uri, pending);
	return pending;
}

class SoundBoard {
	/**
	 * Whether the controls make a noise. Defaults to on: the sounds are the
	 * game's, and an editor that wears its face should sound like it too — and
	 * the switch is one dialog away for anyone who disagrees.
	 */
	enabled = $state(!hasStorage || localStorage.getItem(STORAGE_KEY) !== 'off');

	setEnabled = (on: boolean): void => {
		this.enabled = on;
		if (!hasStorage) return;
		try {
			localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
		} catch {
			// A blocked storage costs the setting, not the sound.
		}
	};

	/** Plays one of the game's interface sounds, if sounds are on. */
	play = (name: SoundName): void => {
		if (!this.enabled) return;
		const at = performance.now();
		if (at - (lastPlayed.get(name) ?? -Infinity) < RETRIGGER_MS) return;
		lastPlayed.set(name, at);
		void this.#emit(catalogue[name]);
	};

	async #emit(sound: Sound): Promise<void> {
		if (typeof AudioContext === 'undefined') return;
		context ??= new AudioContext();
		if (context.state !== 'running') {
			// Refused when no gesture has happened yet; see note 2.
			context.resume().catch(() => {});
			return;
		}
		const buffer = await decode(context, drawClip(sound.clips).uri);
		if (!buffer) return;
		const source = context.createBufferSource();
		source.buffer = buffer;
		const gain = context.createGain();
		gain.gain.value = sound.volume * MASTER_GAIN;
		source.connect(gain).connect(context.destination);
		source.start();
	}
}

export const sound = new SoundBoard();
