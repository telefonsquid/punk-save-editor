/**
 * How the canvas draws each special slot type on an empty cell — the game
 * gives every `ModuleSlotType` its own widget sprite, so the mapping is data,
 * not a cascade in the renderer. A type absent here draws nothing (normal
 * cells), and a placed module always covers its cell's marker.
 */

export type SlotMarker =
	/** The two rings the grid's shader draws on a cell. Both replace the empty
	 * ring rather than sitting on it, and both suppress a booster's marker,
	 * which would fight them for the same middle of the same cell. */
	| { kind: 'invalid' | 'boost' }
	/** An empty special slot: the game's octagon placeholder, over three letters
	 * naming what belongs in it. */
	| { kind: 'main'; label: string };

// Weapon, Active and Embedded share one octagon and differ only in the three
// letters on it — the game's own gadget slots read GDT in
// static/design-references/infinite-grid-full.png. Embedded's never shows: the
// ship module sits on that cell for the whole run.
export const SLOT_MARKERS: Record<string, SlotMarker> = {
	Invalid: { kind: 'invalid' },
	LevelUp: { kind: 'boost' },
	Weapon: { kind: 'main', label: 'WPN' },
	Active: { kind: 'main', label: 'GDT' },
	Embedded: { kind: 'main', label: 'SHP' }
};
