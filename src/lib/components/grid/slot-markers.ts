/**
 * How the canvas draws each special slot type on an empty cell — the game
 * gives every `ModuleSlotType` its own widget sprite, so the mapping is data,
 * not a cascade in the renderer. A type absent here draws nothing (normal
 * cells), and a placed module always covers its cell's marker.
 */

export type SlotMarker =
	/** `invalid` is the danger ✕, `boost` the amber + — both suppress the green
	 * boost dot, which would fight the glyph for the same cell. */
	| { kind: 'invalid' | 'boost' }
	/** An empty main slot: the game's labelled octagon placeholder. */
	| { kind: 'main'; label: string };

export const SLOT_MARKERS: Record<string, SlotMarker> = {
	Invalid: { kind: 'invalid' },
	LevelUp: { kind: 'boost' },
	Weapon: { kind: 'main', label: 'WPN' },
	Active: { kind: 'main', label: 'GDT' }
};
