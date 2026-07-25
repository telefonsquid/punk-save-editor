/**
 * Effect-field geometry: the mirror/rotation set the game can roll, blank
 * fields for the painter, and the validation gate every hand-painted or
 * stored custom shape passes before it may reach a save. The `EffectField`
 * shape itself is defined with the extracted data in `./data`.
 */

import type { EffectField } from './data';

/** Identity of a shape, for deduping and for keyed `{#each}` blocks. */
export function effectFieldKey(f: EffectField): string {
	return `${f.width}x${f.height}:${f.data.join('')}`;
}

/** The field mirrored left-to-right. */
function mirrorX(f: EffectField): EffectField {
	const data: number[] = [];
	for (let y = 0; y < f.height; y++) {
		for (let x = 0; x < f.width; x++) data.push(f.data[y * f.width + (f.width - 1 - x)]);
	}
	return { width: f.width, height: f.height, data };
}

/** The field turned a quarter turn clockwise (width and height swap). */
function rotate(f: EffectField): EffectField {
	const width = f.height;
	const height = f.width;
	const data: number[] = [];
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.push(f.data[(f.height - 1 - x) * f.width + y]);
	}
	return { width, height, data };
}

/**
 * Every distinct orientation of a shape — the set the game itself can produce.
 *
 * `ModuleEffectField.Parse` rolls a mirror on each axis *and* a quarter-turn
 * when it builds a module, so the shape stored in a save is rarely the sprite's
 * base orientation. Offering the same eight symmetries is therefore not a
 * liberty: every one of them is a field the player could legitimately have
 * rolled. Symmetric patterns collapse to fewer entries, which is why this
 * dedupes rather than always returning eight.
 */
function effectFieldVariants(field: EffectField): EffectField[] {
	const seen = new Map<string, EffectField>();
	let f = field;
	for (let turn = 0; turn < 4; turn++) {
		for (const v of [f, mirrorX(f)]) {
			const key = effectFieldKey(v);
			if (!seen.has(key)) seen.set(key, v);
		}
		f = rotate(f);
	}
	return [...seen.values()];
}

/** All orientations of all the shapes a module can roll, deduped across shapes. */
export function effectFieldChoices(fields: EffectField[]): EffectField[] {
	const seen = new Map<string, EffectField>();
	for (const field of fields) {
		for (const v of effectFieldVariants(field)) seen.set(effectFieldKey(v), v);
	}
	return [...seen.values()];
}

/** The sizes a hand-painted field may use (odd, and no larger than the grid). */
export const CUSTOM_FIELD_SIZES = [3, 5, 7, 9];

/** An all-empty square field of `size`, with only its centre cell lit. */
export function blankEffectField(size: number): EffectField {
	const data = new Array<number>(size * size).fill(0);
	data[(size * size - 1) / 2] = 1;
	return { width: size, height: size, data };
}

/**
 * Why a field would break the game, or null if it is safe to write.
 *
 * The game validates a field only when it builds one from a sprite; one restored
 * from a save is used exactly as deserialized, which is what makes hand-painted
 * fields possible at all. These invariants still have to hold:
 *
 * - **Square.** Every read goes through `GetPositionsRelative` /
 *   `GetValueRelative`, which index `fieldData[y * height + x]` — a bug the game
 *   never notices because all of its own fields are 5×5. When `height > width`
 *   that expression runs past the end of the array and throws.
 * - **Odd.** The module sits at `width / 2, height / 2` (integer division), so an
 *   even size puts it off-centre and the field acts on the wrong slots.
 * - **Lit centre.** The centre cell is the module itself, not part of the area
 *   it projects; no sprite the game ships can produce a dark one. The painter
 *   never offers the cell, but this is the only gate on the localStorage load
 *   path, so a hand-edited entry has to be caught here too.
 */
export function effectFieldProblem(f: EffectField): string | null {
	if (f.width !== f.height) return 'must be square — the game indexes non-square fields out of bounds';
	if (f.width % 2 === 0) return 'must be odd-sized so the module sits in the centre cell';
	if (f.data.length !== f.width * f.height) return 'cell count does not match its size';
	if (!f.data[(f.data.length - 1) / 2]) return 'centre cell must be lit — the module itself sits there';
	return null;
}
