# The module-grid editor

The visual recreation of PUNK's module-grid screen: the ship's grid drawn as the
game draws it, modules picked up and dropped as the game moves them, with the
game's own validation and power simulation running underneath. This doc is the
architecture and the milestone plan; the game mechanics it encodes were all
read out of the decompiled code (`ModuleGrid`, `ModuleCluster`,
`ModuleGridPreview`, `GridHelper`, `ModuleSlotType`, `ModuleGridScreen`,
`ModuleGridInput` — see [game-code.md](game-code.md) for how to get back in).
Look to emulate: `static/design-references/infinite-grid-empty.png` /
`infinite-grid-full.png`.

## The game model, condensed

Everything below was verified in the decompiled game, not inferred.

**Geometry.** The grid is an unbounded `Dictionary<Vector2Int, …>`; special
content generates only in `[0,100)²`. Grid **y is up** (Unity), so the editor
flips y for CSS. Six fixed main slots, each the root of a cluster:

| slot | cell | slot type | takes |
| --- | --- | --- | --- |
| Ship | (50,50) | `Embedded` | the SHIP module, immovable |
| Primary weapon | (46,50) | `Weapon` | weapons only |
| Secondary weapon | (54,50) | `Weapon` | weapons only |
| Gadget 1–3 | (46,46) (50,46) (54,46) | `Active` | gadgets only |

`Normal` (the default — `GetSlotType` returns it for any cell not in the dict)
and `LevelUp` cells accept Passive, WeaponAugmentation, PowerCore and Booster.
A spare weapon or gadget therefore cannot be parked on the grid at all — vault
only.

**Special slots are persisted, not procedural.** `ModuleGrid.RandomizeSlots`
rolls them once per run (unseeded `UnityEngine.Random`): for each slot type
with `countInPlacementRect > 0` — that is `LevelUp` (booster, +1 level) and
`Invalid` (nothing placeable, not powerable), 2 each per 5×5 rect tiling
`[0,100)²` — then clears the 3×3 around each main slot except the root cell.
The result lands in the save's `slotTypes` dict, which is all the editor reads;
the algorithm matters only for the reroll button.

**Clusters and power** (`ModuleCluster.RefreshPoweredSlots`). Connectivity is a
flood fill from each root where **both** sides of a shared edge have their
connection bool set (`GridHelper.IsConnectedWithNeighbour`), DFS order up,
right, down, left. Power: iterate the cluster's modules in DFS insertion order;
each module carrying a `powerCore` field covers its cells (reserved always,
powered where the slot type `canBePowered`) — but only while the count of
*attached* cores is below the main module's `PowerLevel`. The root's own core
is free; core application is all-or-nothing per module. The badge reads
`attached/PowerLevel`, red when over. Booster (`levelModificationField`)
modules grant +1 to covered cells **only while themselves powered and
connected**; `LevelUp` slots grant +1 unconditionally; only `canBeBoosted`
modules receive deltas, and `Level = asset level + deltas` (levels are never
saved).

**Validation** (`ModuleGridPreview.IsValid`) runs five checks over the *whole*
grid after a hypothetical move, and any error rejects the drop:

1. **Slot type** — the slot's `compatibleModuleTypes` must contain the
   module's `ModuleType` ("Incompatible slot").
2. **Connections** — where two modules are adjacent, `GetConnection(dir)` must
   equal the neighbour's `GetConnection(-dir)` — both on or both off
   ("Incompatible connections").
3. **Main modules connected** — a flood fill from one main slot must not reach
   another ("Clusters cannot be connected").
4. **Clusters overlap** — power-core coverage from different clusters must not
   overlap; within one cluster it may ("Clusters cannot overlap").
5. **Augmentation** — every non-root module in a cluster must be of a type in
   the root module's `supportedAugmentationTypes` ("Incompatible
   augmentation").

The game validates **only on player moves** — `RestoreFromMemento` installs
whatever the save holds, unchecked. That is what makes the editor's free mode
safe: an invalid layout loads fine (it just won't simulate the way the player
hoped), so free mode flags errors visually instead of blocking.

**Interaction** (game parity): click picks a module up, click drops it;
dropping on an occupied cell sends the displaced module to the vault and
immediately hands it to the cursor; right-click cancels a carry or unequips to
the vault; a failed drop keeps the module carried, plays the fail sound and
marks the offending edges red. The SHIP module never moves.

**Rendering notes** from the game's widgets: modules draw at 50% alpha unless
connected *and* powered; level text plus chevron pips when a boostable
module's level exceeds 1; main modules wear the `attached/PowerLevel` badge;
an unpowered core module previews its coverage outline; the background dot
grid tints red on `Invalid` and green on boosted cells; cluster areas carry
dashed outlines; the carried module shows its effect field around the cursor.

## Product decisions (Saskia, 2026-08-22)

- **Validation is a toggle**, strict (game-parity) by default; free mode marks
  invalid cells instead of refusing drops. Surfaced as "Ignore placement
  rules" in the vault dock's footer, off by default (revised 2026-08-23).
- **Full-screen overlay**, opened straight from the Modules tab — selecting
  the tab is the door, there is no in-between panel (revised 2026-08-23; the
  vault dock inside the editor absorbed the old card UI).
- **Hover shows the game-style info card**; an explicit affordance opens the
  existing card editor (connections, shapes, cores) as a dialog, for grid and
  vault modules alike.
- **Booster/invalid cells are paintable** as one-shot placements: three header
  buttons (booster plus, blocked cross, normal ring) arm a brush that paints
  the next clicked cell and disarms, the way an added module rides the cursor
  (revised 2026-08-23 from the original drag brushes). Plus a reroll button
  running the game's `RandomizeSlots` algorithm.
- **Pan + stepped integer-scale zoom** (the game has pan only).
- **The game's grid sounds** are extracted (per-module `gridPlacementSfx`,
  fail/pick-up/cancel/selection-move), falling back to the six existing UI
  sounds until then.
- **All player ships**: a toggle at the top left when a save holds more than
  one grid owner (co-op).
- **Ctrl+Z undo**, scoped to grid/vault module operations.
- **Adding modules**: the picker opens inside the editor and the chosen module
  lands on the cursor as a carried module.

## Architecture

The layer split follows the repo rule — `game/` knows the rules, `save/` knows
the trees, `editor/` holds UI state, components render:

```
scripts/extract-slot-types.py   slot-type assets + main-module augmentation data
src/lib/game/slot-types.json    generated: per slot type id — canBePowered,
                                compatibleModuleTypes, levelDelta, placement
                                rect size/count
src/lib/game/grid-rules.ts      the pure simulation. Operates on a plain
                                GridSnapshot (Maps keyed "x,y"), no Odin, no
                                Svelte: clusters (flood fill), power
                                (RefreshPoweredSlots), level deltas, the five
                                validation checks, randomizeSlots
src/lib/save/grid.ts            tree accessors and mutations: find the grid
                                owners in `entities`, snapshot a grid out of
                                the dicts, place/move/remove modules and set
                                slot types in the raw tree, move module nodes
                                between grid and vault
src/lib/editor/grid.svelte.ts   GridEditorState: open/close, active ship,
                                carried module, hover, pan/zoom, validation
                                mode, the undo stack
src/lib/components/grid/        GridEditor.svelte (the overlay), GridCanvas,
                                module tiles + slot markers, HoverCard,
                                VaultDock, ModuleEditDialog, plus small parts;
                                PixelSprite.svelte draws the game's art
src/lib/game/grid-icons.ts      the grid's sprites and the cell size, from
  + grid-icons.json             scripts/extract-grid-icons.py — see "The art
                                comes out of the game" below
```

**Data flow is the app's usual one.** The raw `entities`/`vault` trees stay
`$state.raw`; `save/grid.ts` mutations write into them and bump
`editor.version`; a `$derived` snapshot (scalars copied into fresh objects, per
the golden rule) feeds `grid-rules.ts`, whose results drive the render. The sim
is pure and synchronous — a full recompute per edit is a few thousand map
operations and beats incremental bookkeeping.

**Mutating the `Vector2Int` dictionaries.** New dict pairs are built by
cloning the shape of an existing pair in the same dict — `{$type: null, $k:
Vector2Int node without $id, $v}`, verified against a real save and recorded
in `save/grid.ts`, appendable without `$types` bookkeeping. Moving a module
between grid and vault moves the *same memento node* between containers — but
each crossing renumbers the subtree's `$id`s against the file it enters
(`reidNode` in `save/tree.ts`): the two files are separate, densely numbered
id spaces, so an id carried over verbatim would collide and silently repoint
existing `$ref`s. `reidNode` remaps only `$ref`s *inside* the moved subtree;
an outward `$ref` would re-resolve in the target file — unreachable today,
because a `Module.Memento` is self-contained, but worth knowing before ever
moving a node that isn't.

**The overlay is a `<dialog>`.** `showModal()` puts it in the top layer, which
escapes `.crt-screen`'s filter-made containing block — the same reason the
existing dialogs work. `Dialog.svelte`'s title-band/scroll-body shape is wrong
for a canvas, so `GridEditor.svelte` owns its own full-viewport `<dialog>`
(reusing the slab tokens and the open/close sounds).

**The canvas is DOM, not `<canvas>`.** Cells, tiles and markers are absolutely
positioned elements inside one transformed plane (`translate` for pan, integer
`scale` for zoom — the pixel-art rule extends to the grid). A visible-range
cull keeps the dot grid finite; modules and special slots are sparse and render
in full.

**Undo is an op stack**, not snapshots: each operation records enough to invert
itself (the module node it removed, the position it came from, the slot type it
overwrote). Node references stay valid because nothing clones — an undone
removal re-inserts the very node it took out. Each entry also knows which files
it dirtied (`entities`, `vault`).

**`ship.ts` gets exact.** Its caps/regen walk currently counts every module on
the grid — an upper bound. Once `grid-rules.ts` exists, the walk asks the sim
which modules are powered and connected, and which boosters actually boost, and
the numbers become exact for invalid layouts too. That is a side effect of
milestone 1, not a separate feature.

## Milestones

Each lands as its own commit(s), keeps `bun run check` + `bun run lint` green,
and updates this doc's status line. Order: sim first — everything else renders
what it computes.

1. **Sim core** — ✅ shipped. `extract-slot-types.py` + `slot-types.json`
   (slot-type properties; `module-info.json` gained `augments`, `placeSfx`,
   `cls`, wired into `extract-all` and `check-data`); `grid-rules.ts`
   (snapshot model, clusters, power, level deltas, validation, randomize);
   `save/grid.ts` read side (find grid owners, snapshot a grid); `ship.ts`
   upgraded to exact caps/regen. Verified against the real save: badges,
   powered sets and slot-type counts all as expected, validation clean.
   Learned on the way: **enemy entities carry module grids too** — `gridOwners`
   lists every carrier, so player-ship pickers must filter (the ship's
   `entityId` is `Ship`); and `ModuleData.gridPlacementSfx` stores an sfx
   *GUID*, not a name, so milestone 6's extractor must resolve ids.
2. **Canvas render** — ✅ shipped. The overlay (`components/grid/`), launcher
   button in the Modules section, pan + stepped zoom (`--u` ∈ {2,3,4}, item
   art at 1x/2x/3x), dot-grid background, slot markers, module tiles (icons,
   stubs, links, alpha, badges, pips), cluster outlines, core previews, hover
   card, ship toggle when a save holds several `Ship*` grid owners.
3. **Interactions** — ✅ shipped. Carry/drop/displace with game semantics
   (carrying never touches the tree; a displaced module vaults and rides the
   cursor), right-click cancel/unequip, strict/free validation with flash +
   live error rings, the op-based undo stack (Ctrl+Z/Y), the module edit
   dialog behind an EDIT chip, the picker dropping onto the cursor. Verified
   by a scripted browser walk asserting the written bytes. Still owed: a
   layout built here loaded in the running game.
4. **Vault dock** — ✅ shipped. The vault as a dock beside the canvas (click
   to carry out, click to file a carry away, hover card + edit + remove), and
   `ModulesPanel` reduced to the launcher.
5. **Slot painting** — ✅ shipped. Booster/blocked brushes with a right-button
   eraser, per-stroke undo, and reroll via the `randomizeSlots` port (whole
   dict swap, undoable).
6. **Sounds** — ✅ shipped. The palette grew to eight: `fail`
   (`UI/Grid/PlacementFailed`) and `placeCore` (`UI/Grid/PowerCorePlacement`)
   joined the six, which already covered the rest — the grid screen's
   pick-up *and* cancel are both `UI/Grid/ModuleSelected`, its selection-move
   is `UI/Step`, and every module but POWER CORE places with
   `UI/Grid/ModulePlaced`. `module-info.json`'s `placeSfx` resolves the
   per-module guid to the sfx name at extraction, and `soundForSfx` maps it
   onto the palette at play time.

## Revisions (2026-08-23)

The milestone entries above record what shipped then; this is what changed
after:

- **Entry**: the Modules tab opens the overlay directly — `ModulesPanel` (the
  launcher page) is gone, and `+page.svelte` routes the tab strip's write so
  closing the overlay lands back on the tab that was showing.
- **Slot painting**: the drag brushes and right-button eraser became one-shot
  brush buttons (plus / cross / ring in the header) — arm, click one cell,
  disarmed. Esc or right-click puts an armed brush down; one undo entry per
  placement.
- **Validation toggle**: moved to the vault dock's footer as "Ignore placement
  rules", unchecked by default (same strict default, inverted face).
- **Pixel sprites**: the dot grid, connection notches, linked capsules, module
  frames and the boost chevron draw the game's own pixel art — first as hand
  traces, then straight out of Punk_Data (below). The empty-cell ring is a
  repeating CSS mask over one palette-token layer, so it recolours with the
  theme and stays cheap at any pan distance.
- **Zoom buttons fixed**: the viewport's pointer capture was eating their
  clicks; pointerdowns that start on a button now stay with the button.
- **Shift copies a placement**: holding it while dropping any module puts an
  identical one on the cursor, and holding it while painting a slot leaves the
  brush armed. The copy is `copyModuleNode` — a clone of the node with its
  `$id`s allocated past the tree's highest, taken *after* the drop so the
  placed original's own ids are already counted. It carries the rolled fields
  and the connections, which rebuilding the same module from the asset would
  not. Dropping a picked-up module back on its own cell copies too, even though
  nothing moves in the tree — the module did land there. A displaced module
  still takes the cursor — it has the better claim.
- **The frame follows the module's category**, not a three-way guess at its
  shape: `ModuleType.background` ships a rect, an octagon, a round, a notched
  octagon and a rounded diamond, and each is drawn as itself instead of as a
  CSS `clip-path`. A module whose colour is white wears the neutral its notches
  do, which is what the game shows.
- **One capsule per link.** Both neighbours used to draw the seam capsule on
  the same pixels, so on a dimmed pair the two half-transparent copies stacked
  brighter than the stubs. The east/south side draws it; the other draws
  nothing.
- **Connections draw over every tile.** A capsule reaches half into the
  neighbour's cell, and in tree order the neighbour's frame painted over it.
  The joints carry a `z-index` inside the plane, which also means a dimmed
  module must not fade as one layer — an `opacity` on the tile would make it a
  stacking context and trap them again. The tile's body and its joints fade
  separately for that reason.
- **A connection wears its module's colour until it is answered**; the capsule
  a connected pair shares is the neutral.
- **The hover ring only marks a drop target.** With nothing on the cursor it
  followed the pointer around an idle board for no reason.
- **The icon is 24 game pixels**, its native size in a 34-pixel cell, and rides
  one pixel high — the chevrons and the power badge own the space below it.
- **A carried module hangs off the cursor**, not off the cell under it: a
  `position: fixed` tile outside the plane (whose transform would otherwise pin
  it back to the board), so it keeps following the pointer out over the vault
  dock, which lights up as the place it can be filed away. The hover ring still
  marks the cell the drop would land in.
- **An empty special slot is the game's own octagon.** Weapon, Active and
  Embedded point their `gridVisualPrefab` at one shared `SpecialSlotWidget` —
  the editor's hand-built labelled boxes were the wrong shape. The three letters
  on it change per slot type: `static/design-references/infinite-grid-full.png`
  shows the game's gadget row reading GDT, so `slot-markers.ts` names one per
  type — WPN, GDT, SHP — in the body face rather than the HUD one, dim enough
  that an empty slot stays quieter than a filled one. SHP never shows; the ship
  module holds that cell for the whole run.
- **The vault dock draws canvas tiles**, at the canvas's own default zoom and
  three across — same frame, same colour, same connection stubs, so a module is
  the same object on both sides of the screen. `GridModuleTile` takes the game
  pixel itself (`u`) and sets `--u` from it, so no caller can scale the frame
  and the item art apart — which is exactly what the dock did while it passed
  its own icon scale.
- **The band is one gap wide**, and carries the page's save controls whenever
  the row is wide enough for them (below ~1500px they drop out). The overlay
  covers the page's own strip, so `SaveActions.svelte` is the one component both
  rows render. A rule marks where they end and the grid's own tools resume; it
  belongs to the save group, so it leaves with them.
- **Zoom holds the middle of the viewport.** The step used to rescale the pan
  against a hardcoded 28 rather than the cell's own 34 game pixels, which walked
  the board toward a corner over a few steps. Alongside it, **Center** puts the
  view back where the screen opens.
- **The zoom's game pixel is the plane's, not the viewport's.** `--u` sits on
  the panned board, so the chrome over it — zoom controls, hover card, flashed
  error — keeps the page's own 3px and holds its size at every zoom. It used to
  sit on the viewport, and the buttons grew and shrank with the board. The two
  cursor ghosts hang outside the plane and take the game pixel as a prop.
- **The grid screen paints its own CRT.** A `<dialog>` renders in the top
  layer, which is outside `.crt-screen` and so outside its filter — the grid
  was the one surface in the app with no aberration or bloom on it. The screen
  carries `filter: url(#crt)` itself. It is viewport-sized like the wrapper is,
  which is what keeps the filter buffer under the browser's size cap, and the
  cursor ghosts still land on the pointer because the new containing block the
  filter creates starts at (0, 0) and is the viewport.
- **An armed slot brush rides the cursor**, exactly like a carried module: the
  marker it would leave follows the pointer and the hover ring says which cell
  gets it. Drawing the preview into the cell instead put the answer in two
  places and neither of them was where the eye was.
- **The power badge clears the south notch.** The notch owns the bottom edge
  from 13 game pixels in, so the badge hangs two pixels out of its cell on the
  left, two above the floor, and carries no padding beside its numbers — the
  digits' own bearings are the gap. It has to clear 13 at *every* zoom, and the
  HUD face snaps to a 5px grid, so the badge is proportionally widest at the
  biggest one: at `--u: 4px` it ran to 14 game pixels and overlapped. It now
  ends at 12, against the game's own badge running −1.5 to 12.9 across the cell
  and stopping 1.7 above the floor (measured off `infinite-grid-full.png`).
- **A glyph on a label's line needs `--cap-drop`.** 000webfont hangs its capital
  below its own collapsed line box, so a sprite centred in that box sits high by
  a fixed fraction of the font size, and a line of text centred in a cell sits
  low by the same amount. The token is measured, like `--cap-fix`.

## The art comes out of the game

`scripts/extract-grid-icons.py` (in `bun run extract`) writes
`src/lib/game/grid-icons.json`. Two mechanisms feed it, because the game has
two:

- **The cell markers are a shader, not sprites.** `ModuleGridWidget` paints the
  whole backdrop with one `Unlit/GridBackground` RawImage over a runtime
  `Texture2D(100, 100)` LUT — one pixel per cell, black for normal, red for
  `Invalid`, green where `GetLevelDelta > 0` — and the shader picks a quadrant
  of the 64×64 `Sprites UI GridSlotTypes` sheet from that pixel. Which is why
  `ModuleSlotType.gridVisualPrefab` is null for exactly those three.
- **Everything else is a plain sprite** on a prefab: `ModuleType.background`,
  `ConnectionWidget`'s two Images, `ModuleIconWidget.upgradesPrefab`, and the
  octagon on the one `SpecialSlotWidget` all three special slot types share.

Each is stored as **SVG path data at native pixel size, one path per distinct
colour**, with `shade` = that colour's brightness against the sprite's
brightest. `PixelSprite.svelte` paints every layer in `currentColor` at
`fill-opacity: shade`, so one sprite serves every module colour and keeps its
own internal shading; shade 0 is the sprite's black — its outline and interior
fill — and paints as the void. A bitmap could not be recoloured that way
without filtering the scaled-up pixels, which the integer-scaling rule forbids.

**The cell is 34 game pixels**, taken from the widest frame the game ships.
The rect frame is 32 and centres in it; what is left over is the gap between
two neighbours. Notches sit against the cell's edges rather than the frame's,
so all five shapes hang their connections in the same places.

## Verification

- **Round-trip**: opening and saving a slot without touching the grid must
  stay byte-identical (golden rule #4).
- **Against the game**: the power badges, alpha states and computed
  caps/regen are checked against the running game on the real save
  (`C:\Users\alya\AppData\LocalLow\DefaultCompany\Punk\saves\save001`), and a
  layout built in the editor is loaded in-game.
- **In-browser e2e** (the `window.__punkTestDir` hook): drive a place + a
  move + an unequip, save, decode the written bytes, assert the dicts —
  Node tests cannot see proxy-layer bugs.

## Open items

- The second ship's `entityId` in a co-op save (`coop_save001`) — the ship
  toggle shows every `Ship*`-prefixed grid owner, but the labelling is
  unverified against a real co-op save.
- Load a layout built in the editor in the running game (the milestone 3
  cross-check that no automated walk can give).
- The dict-pair shape and the sfx names were open items here; both are
  settled and recorded above (pair: `{$type: null, $k: Vector2Int node
  without $id, $v}`, appended without `$types` bookkeeping — see
  `save/grid.ts`).
