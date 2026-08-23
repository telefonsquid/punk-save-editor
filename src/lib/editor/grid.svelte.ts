/**
 * The grid editor's state: which ship's grid is shown, the derived snapshot +
 * simulation everything renders from, the carried module, and the undo stack.
 * One instance lives in the grid editor overlay; it borrows the open save and
 * the version counter from `EditorState`.
 *
 * Two rules anchor the design, both the game's own:
 *
 * - **Carrying never touches the tree.** The game moves a widget around and
 *   only mutates the grid when a drop is confirmed (`ModuleGridInput`), so a
 *   cancelled carry needs no rollback and dirties nothing. The one exception
 *   the game also makes: a module displaced by a drop goes to the vault first
 *   and is *then* handed to the cursor, so cancelling that carry leaves it
 *   vaulted.
 * - **A drop validates the whole hypothetical layout first** (`CanMoveTo`),
 *   and in strict mode any error refuses it, exactly as the game does. Free
 *   mode places anyway — safe because the game never validates a loaded save —
 *   and the canvas marks the live errors instead.
 *
 * Undo is a stack of self-inverting operations over the raw trees. Nodes keep
 * their identity through every move; crossing between the vault and entities
 * files renumbers `$id`s against the target tree (see `reidNode`), because the
 * two files are separate, densely used id spaces.
 */

import {
	GRID_ERROR_MESSAGES,
	SHIP_CELL,
	isMainCell,
	parseCell,
	simulateGrid,
	validateGrid,
	validateMove,
	type CellKey,
	type GridError
} from '$lib/game/grid-rules';
import type { OdinNode } from '$lib/save/odin';
import {
	gridOwners,
	insertModuleAt,
	moduleFromVault,
	moduleNodeAt,
	moduleToVault,
	readModule,
	removeModuleAt,
	rerollSlotTypes,
	setSlotTypeAt,
	snapshotGrid,
	type GridModuleRef
} from '$lib/save/grid';
import { dictPairs } from '$lib/save/tree';
import { moduleInfo } from '$lib/game/data';
import {
	copyModuleNode,
	getModuleNodes,
	newModuleNode,
	type NewModuleFields
} from '$lib/save/vault';
import { sound, soundForSfx } from '$lib/sound.svelte';
import type { EditorState } from './state.svelte';

export interface Carried {
	/** The raw memento node — in its source container (or nowhere for 'new'). */
	node: OdinNode;
	/** Decoded view of it, for the cursor tile and drop validation. */
	module: GridModuleRef;
	source: 'grid' | 'vault' | 'new';
	/** Where a grid pickup started — that tile hides while carried. */
	originKey?: CellKey;
}

interface GridOp {
	redo(): void;
	undo(): void;
}

export class GridEditorState {
	readonly #editor: EditorState;

	/** entityId of the grid being shown — 'Ship' outside co-op. */
	shipId = $state('Ship');
	/** The cell under the cursor, or null when it left the canvas. */
	hovered = $state<CellKey | null>(null);
	/** Game-parity validation: a drop breaking any rule is refused. Off, the
	 * drop lands anyway and the errors stay marked on the canvas. */
	strict = $state(true);
	/** An armed slot brush: the next canvas click paints this type onto one
	 * cell, the way an added module rides the cursor until dropped. */
	slotBrush = $state<'LevelUp' | 'Invalid' | 'Normal' | null>(null);
	carried = $state.raw<Carried | null>(null);
	/** A refused drop's errors, shown briefly the way the game flashes them. */
	flash = $state.raw<{ errors: GridError[]; message: string } | null>(null);

	undoDepth = $state(0);
	redoDepth = $state(0);

	#undoStack: GridOp[] = [];
	#redoStack: GridOp[] = [];
	/** The slot the stacks belong to — a reload strands their tree references. */
	#historySlot: unknown = null;
	#flashToken = 0;

	/**
	 * The player ships in the save. Enemies carry module grids too, so this
	 * filters `gridOwners` to ship entities; a co-op save is expected to hold a
	 * second `Ship*` entity (unverified against a real co-op save — see
	 * docs/grid-editor.md).
	 */
	readonly ships = $derived.by(() => {
		const editor = this.#editor;
		if (editor.version < 0 || !editor.slot || !editor.loadedFiles.has('entities')) return [];
		return gridOwners(editor.slot.files.entities).filter((o) => o.entityId.startsWith('Ship'));
	});

	readonly owner = $derived(
		this.ships.find((o) => o.entityId === this.shipId) ?? this.ships[0] ?? null
	);

	// Recomputes whenever `ships` did — a fresh owners array per version bump —
	// so every edit lands in a fresh copy of the grid.
	readonly view = $derived.by(() => (this.owner ? snapshotGrid(this.owner.grid) : null));

	readonly sim = $derived.by(() => (this.view ? simulateGrid(this.view) : null));

	readonly errors = $derived.by(() => (this.view ? validateGrid(this.view) : []));

	constructor(editor: EditorState) {
		this.#editor = editor;
	}

	// --- carrying ------------------------------------------------------------

	/** Picks the module at a cell up (the SHIP module never moves). */
	pickUp = (key: CellKey): void => {
		if (this.carried || key === SHIP_CELL) return;
		const module = this.view?.modules.get(key);
		if (!module) return;
		this.slotBrush = null;
		this.carried = { node: module.node, module, source: 'grid', originKey: key };
		sound.play('select');
	};

	/** Picks a vault module up (the vault dock's click). */
	pickUpVault = (node: OdinNode): void => {
		if (this.carried) return;
		this.slotBrush = null;
		this.carried = { node, module: readModule(node), source: 'vault' };
		sound.play('select');
	};

	/** Builds a fresh module and hands it to the cursor (the picker's Add). */
	carryNew = (id: string, fields: NewModuleFields): void => {
		const entities = this.#editor.slot?.files.entities;
		if (this.carried || !entities) return;
		const node = newModuleNode(entities, id, fields);
		this.slotBrush = null; // the cursor carries one thing at a time
		this.carried = { node, module: readModule(node), source: 'new' };
		sound.play('select');
	};

	/** Drops the carry. Nothing was moved yet, so there is nothing to undo; a
	 * displaced module was already vaulted by the drop that displaced it, and a
	 * 'new' module simply never comes to exist. The sound is the game's own
	 * cancel, which it shares with picking up. */
	cancelCarry = (): void => {
		if (!this.carried) return;
		this.carried = null;
		sound.play('select');
	};

	/** The sound a module landing on the grid makes — its own placement sfx
	 * where the palette holds it (POWER CORE has one of its own). */
	#placeSound(id: string | null): void {
		sound.play(soundForSfx(moduleInfo(id)?.placeSfx, 'place'));
	}

	/** The full-layout errors a drop on `target` would produce. */
	validateDrop = (target: CellKey): GridError[] => {
		const carried = this.carried;
		const view = this.view;
		if (!carried || !view) return [];
		return validateMove(view, carried.module, carried.originKey ?? null, target);
	};

	/**
	 * Commits the carry onto a grid cell — the game's `OnModuleDropped` +
	 * `MoveToGrid`. A module already at the target is vaulted and immediately
	 * becomes the new carry. `keep` is the shift key: the module lands and a
	 * copy of it takes its place on the cursor, so one pick-up fills a whole row.
	 */
	drop = (target: CellKey, keep = false): void => {
		const carried = this.carried;
		const slot = this.#editor.slot;
		const owner = this.owner;
		if (!carried || !slot || !owner) return;

		// Dropping back where it was picked up ends the carry, nothing moves —
		// shift still gets its copy, since the module did land on that cell.
		if (carried.source === 'grid' && target === carried.originKey) {
			this.carried = null;
			this.#placeSound(carried.module.id);
			if (keep) this.#carryCopy(carried.node);
			return;
		}

		const errors = this.validateDrop(target);
		if (errors.length > 0 && this.strict) {
			this.#flashErrors(errors);
			return;
		}

		const { x, y } = parseCell(target);
		const grid = owner.grid;
		const vault = slot.vault;
		const entities = slot.files.entities;
		const node = carried.node;
		const { source, originKey } = carried;
		const displaced = moduleNodeAt(grid, x, y);
		const vaultIndex = source === 'vault' ? getModuleNodes(vault).indexOf(node) : -1;

		this.#perform({
			redo: () => {
				if (displaced) {
					removeModuleAt(grid, x, y);
					moduleToVault(vault, displaced);
					this.#editor.dirtyFiles.add('vault');
				}
				if (source === 'grid') {
					const o = parseCell(originKey!);
					removeModuleAt(grid, o.x, o.y);
				} else if (source === 'vault') {
					moduleFromVault(vault, node, entities);
					this.#editor.dirtyFiles.add('vault');
				}
				insertModuleAt(grid, x, y, node);
				this.#editor.touch('entities');
			},
			undo: () => {
				removeModuleAt(grid, x, y);
				if (source === 'grid') {
					const o = parseCell(originKey!);
					insertModuleAt(grid, o.x, o.y, node);
				} else if (source === 'vault') {
					moduleToVault(vault, node, vaultIndex);
					this.#editor.dirtyFiles.add('vault');
				}
				if (displaced) {
					moduleFromVault(vault, displaced, entities);
					insertModuleAt(grid, x, y, displaced);
					this.#editor.dirtyFiles.add('vault');
				}
				this.#editor.touch('entities');
			}
		});

		// The displaced module lands on the cursor, vaulted behind it — so a
		// cancel leaves it in the vault, exactly like the game.
		this.carried = displaced
			? { node: displaced, module: readModule(displaced), source: 'vault' }
			: null;
		this.#placeSound(carried.module.id);
		// A displaced module owns the cursor now — shift does not get to jump it.
		if (keep && !displaced) this.#carryCopy(node);
	};

	/** Hands the cursor a copy of a module that has just landed. Copied after
	 * the drop, so the copy's ids are allocated past the placed original's. */
	#carryCopy(node: OdinNode): void {
		const entities = this.#editor.slot?.files.entities;
		if (!entities) return;
		const copy = copyModuleNode(node, entities);
		this.carried = { node: copy, module: readModule(copy), source: 'new' };
	}

	/**
	 * Commits the carry into the vault — the dock as a drop target. A module
	 * that came *from* the vault just stops being carried (it never left), and
	 * a grid module unequips exactly like the game's drop-on-vault.
	 */
	dropToVault = (): void => {
		const carried = this.carried;
		const slot = this.#editor.slot;
		if (!carried || !slot) return;
		// A vault module dropped back on the vault never left it — a cancel.
		if (carried.source === 'vault') {
			this.cancelCarry();
			return;
		}
		const vault = slot.vault;
		const entities = slot.files.entities;
		const grid = this.owner?.grid;
		const node = carried.node;
		const { source, originKey } = carried;
		if (source === 'grid' && (!grid || !originKey)) return;

		this.#perform({
			redo: () => {
				if (source === 'grid') {
					const o = parseCell(originKey!);
					removeModuleAt(grid!, o.x, o.y);
					this.#editor.dirtyFiles.add('entities');
				}
				moduleToVault(vault, node);
				this.#editor.touch('vault');
			},
			undo: () => {
				if (source === 'grid') {
					moduleFromVault(vault, node, entities);
					const o = parseCell(originKey!);
					insertModuleAt(grid!, o.x, o.y, node);
					this.#editor.dirtyFiles.add('entities');
				} else {
					// 'new': the node leaves the save entirely, no id space to enter.
					const nodes = getModuleNodes(vault);
					nodes.splice(nodes.indexOf(node), 1);
				}
				this.#editor.touch('vault');
			}
		});
		this.carried = null;
		sound.play('close');
	};

	/** Deletes a vault module outright (the dock's remove cross). */
	deleteVaultModule = (node: OdinNode): void => {
		const slot = this.#editor.slot;
		if (!slot || this.carried?.node === node) return;
		const vault = slot.vault;
		const index = getModuleNodes(vault).indexOf(node);
		if (index < 0) return;

		this.#perform({
			redo: () => {
				getModuleNodes(vault).splice(index, 1);
				this.#editor.touch('vault');
			},
			undo: () => {
				getModuleNodes(vault).splice(index, 0, node);
				this.#editor.touch('vault');
			}
		});
		sound.play('close');
	};

	/** Sends the module at a cell to the vault — the game's right-click. */
	unequip = (key: CellKey): void => {
		const slot = this.#editor.slot;
		const owner = this.owner;
		if (this.carried || !slot || !owner || key === SHIP_CELL) return;
		const { x, y } = parseCell(key);
		const grid = owner.grid;
		const vault = slot.vault;
		const entities = slot.files.entities;
		const node = moduleNodeAt(grid, x, y);
		if (!node) return;

		this.#perform({
			redo: () => {
				removeModuleAt(grid, x, y);
				moduleToVault(vault, node);
				this.#editor.dirtyFiles.add('vault');
				this.#editor.touch('entities');
			},
			undo: () => {
				moduleFromVault(vault, node, entities);
				insertModuleAt(grid, x, y, node);
				this.#editor.dirtyFiles.add('vault');
				this.#editor.touch('entities');
			}
		});
		sound.play('close');
	};

	// --- slot painting -------------------------------------------------------

	/** Arms the brush, or disarms it when its button is clicked again; a live
	 * carry yields — the cursor holds one thing at a time. */
	armBrush = (type: 'LevelUp' | 'Invalid' | 'Normal'): void => {
		if (this.carried) this.cancelCarry();
		this.slotBrush = this.slotBrush === type ? null : type;
	};

	disarmBrush = (): void => {
		this.slotBrush = null;
	};

	/**
	 * Paints the armed slot type onto one cell and disarms — a placement like
	 * an added module's, not a drag stroke. `keep` is the shift key: the brush
	 * stays armed for the next cell. The six main slots are the grid's skeleton
	 * and refuse the brush (it stays armed for another try), exactly as
	 * `RandomizeSlots` clears around them.
	 */
	paintOnce = (key: CellKey, keep = false): void => {
		const owner = this.owner;
		const type = this.slotBrush;
		if (!owner || !type || isMainCell(key)) return;
		const after = type === 'Normal' ? null : type;
		const before = this.view?.slotTypes.get(key) ?? null;
		if (!keep) this.slotBrush = null;
		if (before === after) return;
		const { x, y } = parseCell(key);
		const grid = owner.grid;
		this.#perform({
			redo: () => {
				setSlotTypeAt(grid, x, y, after);
				this.#editor.touch('entities');
			},
			undo: () => {
				setSlotTypeAt(grid, x, y, before);
				this.#editor.touch('entities');
			}
		});
		sound.play('close');
	};

	/** Rerolls the generated cells with the game's own algorithm. */
	reroll = (): void => {
		const owner = this.owner;
		if (!owner) return;
		const grid = owner.grid;
		const before = [...dictPairs(grid.slotTypes)];
		rerollSlotTypes(grid);
		const after = [...dictPairs(grid.slotTypes)];
		const apply = (pairs: OdinNode[]) => {
			const arr = dictPairs(grid.slotTypes);
			arr.length = 0;
			arr.push(...pairs);
			this.#editor.touch('entities');
		};
		this.#record({ redo: () => apply(after), undo: () => apply(before) });
		this.#editor.touch('entities');
		sound.play('close');
	};

	// --- undo ----------------------------------------------------------------

	#perform(op: GridOp): void {
		op.redo();
		this.#record(op);
	}

	/** Pushes an already-applied operation onto the history. */
	#record(op: GridOp): void {
		this.#guardHistory();
		this.#undoStack.push(op);
		this.#redoStack.length = 0;
		this.#syncDepths();
	}

	undo = (): void => {
		this.#guardHistory();
		// A live carry references a node the operation may move — settle it first.
		if (this.carried) this.cancelCarry();
		const op = this.#undoStack.pop();
		if (!op) return;
		op.undo();
		this.#redoStack.push(op);
		this.#syncDepths();
	};

	redo = (): void => {
		this.#guardHistory();
		if (this.carried) this.cancelCarry();
		const op = this.#redoStack.pop();
		if (!op) return;
		op.redo();
		this.#undoStack.push(op);
		this.#syncDepths();
	};

	/** Ops hold references into the open save's trees — a reload replaces the
	 * trees, so a stack built against the old ones must not replay. */
	#guardHistory(): void {
		if (this.#historySlot !== this.#editor.slot) {
			this.#undoStack.length = 0;
			this.#redoStack.length = 0;
			this.#historySlot = this.#editor.slot;
			this.#syncDepths();
		}
	}

	#syncDepths(): void {
		this.undoDepth = this.#undoStack.length;
		this.redoDepth = this.#redoStack.length;
	}

	#flashErrors(errors: GridError[]): void {
		const token = ++this.#flashToken;
		this.flash = { errors, message: GRID_ERROR_MESSAGES[errors[0].kind] };
		sound.play('fail');
		setTimeout(() => {
			if (this.#flashToken === token) this.flash = null;
		}, 2500);
	}
}
