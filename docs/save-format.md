# PUNK Save File Format

Reverse-engineered from `Punk.Main.dll` (game install: `C:\data\apps\Steam\steamapps\common\PUNK Playtest`, Unity 6000.3.4f1, Mono backend — decompilable with `ilspycmd`). The relevant game classes are `Punk.SaveLoad.GameSaver`, `Punk.SaveLoad.SaveFolder`, `CLZF2`, and `LevelSnapshot`.

Saves live at `%LocalAppData%Low\DefaultCompany\Punk\saves\<slot>\` where `<slot>` is `save001` (normal) or `coop_save001` (co-op).

## Container: LZF compression

Every non-PNG file is a **raw LZF stream** produced by `CLZF2.Compress` (the common Unity C# port of LibLZF). There is **no header, no length prefix, no checksum** — the game decompresses by doubling an output buffer (starting at `2 × input length`) until the stream fits.

LZF stream grammar (per control byte `ctrl`):

- `ctrl < 0x20`: literal run of `ctrl + 1` bytes follows.
- `ctrl >= 0x20`: back-reference; `len = (ctrl >> 5) + 2`, if `ctrl >> 5 == 7` an extra byte extends the length (`len = 9 + extra`, max 266 output bytes). Offset is `((ctrl & 0x1F) << 8 | nextByte) + 1` (max 8192) back from the current output position.

Implemented in [src/lib/save/lzf.ts](../src/lib/save/lzf.ts). Any valid LZF stream is accepted by the game, so a re-encoder does not need to be byte-identical (ours is near-identical anyway).

## Files in a save slot

| File        | Payload after LZF                                     | Root type |
| ----------- | ----------------------------------------------------- | --------- |
| `levelinfo` | Odin binary | `Punk.SaveLoad.LevelInfo` — just `width`, `height` (e.g. 2000×2000) |
| `entities`  | Odin binary | `List<EntityData.Memento>` — all world entities (~7 MB decompressed) |
| `graph`     | Odin binary | `Punk.SaveLoad.GraphSnapshot` — pathfinding/level graph |
| `mapicons`  | Odin binary | `MapIconManager.Memento` |
| `rundata`   | Odin binary | `RunData.Memento` — run stats, shop state (see below) |
| `vault`     | Odin binary | `Vault.Memento` — player storage (see below) |
| `world`     | raw `LevelSnapshot` struct dump (see below), ~136 MB decompressed |
| `fow`       | plain PNG (fog-of-war render texture) — **not** LZF compressed |
| `map`       | plain PNG (map texture) |
| `scanner`   | plain PNG (area state lookup texture) |

## Odin binary serialization

The Odin-serialized files use `Sirenix.Serialization.SerializationUtility.SerializeValue(value, DataFormat.Binary)`. The format is a token stream; each entry starts with a `BinaryEntryType` byte (see `EntryType` in [src/lib/save/odin.ts](../src/lib/save/odin.ts)), optionally followed by a field-name string for the "Named" variants.

Key encodings:

- **String**: `charSizeFlag: u8` (0 = 8-bit chars, 1 = UTF-16LE), `length: i32` (chars), then the characters.
- **Type reference**: first occurrence is `TypeName (0x2F)` + `id: i32` + assembly-qualified name string (e.g. `Vault+Memento, Punk.Main`); later occurrences are `TypeID (0x30)` + `id: i32`.
- **Reference node** (classes): entry byte, type reference, `refId: i32`, then named field entries until `EndOfNode (0x05)`. `NamedInternalReference (0x09)` entries point back at a previous node's `refId`.
- **Struct node** (value types): same but without `refId`.
- **Array**: `StartOfArray (0x06)`, `length: i64`, elements as entries, `EndOfArray (0x07)`.
- **Primitive array** (blittable element types, e.g. `bool[]`): `PrimitiveArray (0x08)`, `length: i32`, `bytesPerElement: i32`, then raw little-endian data.
- Primitives are little-endian; booleans are 1 byte; GUIDs are 16 bytes in .NET `Guid` memory layout (mixed-endian).

All numeric/scalar fields observed in the saves parse cleanly with the reader in `src/lib/save/odin.ts` (verified byte-exact on all six Odin files of a real save).

### Interesting data for an editor

`vault` (`Vault+Memento`):

- `modules: List<Module.Memento>` — `moduleDataId` (GUID string), N/E/S/W connection booleans, `powerCore: ModuleEffectField` (bool grid), `powerLevel: int`.
- `ingredientIds: List<string>` + parallel `ingredientCounts: List<int>` (e.g. `"Gland" × 24`).
- `consumables: List<ConsumableMento>` — `consumableId` (GUID string), `amount: int`.

`rundata` (`RunData+Memento`):

- `sharedResources: Dictionary<string, float>` — currencies/resources.
- `shopItems: ShopItemList.Memento` — shop inventory with `price`/`priceIncrement` (amount + currency), `level`, embedded `moduleMemento`.
- `consumableShopItems`, `unlockedShopCount`, `ingredientsEverOwned`, `droppedModuleIds`, `moduleIdsAddedToShop`, `moduleIdsPickedUp`, `totalRunTime: float`, `killedBossCount: int`, `killedEnemyCount: int`.

Module/consumable GUIDs refer to Unity `ScriptableObject` asset ids; a lookup table can be extracted from the game's asset bundles if human-readable names are needed.

## `world` file (`LevelSnapshot`)

Not Odin — a straight concatenation of per-cell arrays, `size = width × height` cells (from `levelinfo`), little-endian, no padding between sections:

| Section | Element | Bytes |
| ------- | ------- | ----- |
| `mainBioms` | `u8` | size |
| `bioms` | `u8` | size |
| `cellTypes` | `u8` | size |
| `backGroundCellTypes` | `u8` | size |
| `heightMap` | `f32` | 4 × size |
| `fogLevels` | `u8` | size |
| `scannerAreas` | `u8` | size |
| `containingMergedCellRelativePosition` | `u8` (two packed nibbles) | size |
| `mergedCells` | `{ dataId: u8, rotation: u8, mirror: u8 }` | 3 × size |
| `plants` | `PlantCell` struct | 20 × size |

(2000×2000 save: 34 bytes/cell = 136,000,000 bytes decompressed, matches observed.)
