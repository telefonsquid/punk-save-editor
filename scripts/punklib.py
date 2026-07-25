"""Shared plumbing for the asset-extraction scripts.

Every extractor used to carry its own copy of the game path, the Unity version,
the TypeTreeGenerator setup and — worst — its own *field heuristics* for
recognising asset kinds ("has `isShared` and `lowTreshold`" meant Resource).
Field duck-typing is exactly what a game update silently breaks, so this module
centralises all of it:

- **One environment.** `PunkAssets` loads the whole `Punk_Data` folder into a
  single UnityPy environment (cross-file PPtrs — icons, colours, weapon data —
  only resolve that way) and scans it once; every script iterates the cached
  result, and `extract-all.py` shares one instance across all of them.
- **The Unity version is detected, not hardcoded.** It is read from the
  serialized files themselves, so a game update that bumps the engine needs no
  edit here.
- **Assets are classified by their C# class name, not by fields.** Each
  MonoBehaviour's `m_Script` points at a MonoScript whose `m_ClassName` says
  exactly what the asset is (`WeaponModuleData`, `Resource`, `Ingredient`, ...).
  A class this module doesn't know is *warned about loudly* instead of being
  silently mis-filed — the same new-things-must-surface rule as EFFECT_KINDS in
  extract-module-effects.ts.

The one wrinkle: with a TypeTreeGenerator attached, UnityPy misparses the
`m_Script` PPtr (the generated tree misses the 4-byte alignment after
`m_Enabled`, so the ids come back shifted by 24 bits). The MonoBehaviour
*header* layout has been stable across Unity versions for over a decade, so
`script_class` reads the pointer straight out of the raw bytes instead:

    offset  0: m_GameObject PPtr (int32 fileID + int64 pathID)
    offset 12: m_Enabled (u8) + 3 alignment bytes
    offset 16: m_Script PPtr (int32 fileID + int64 pathID)

Setup (venv lives at the repo root, gitignored):
    python -m venv .venv
    .venv/Scripts/pip install UnityPy TypeTreeGeneratorAPI Pillow
"""

from __future__ import annotations

import base64
import io
import json
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DEFAULT_GAME_DATA = Path(r"C:/data/apps/Steam/steamapps/common/PUNK Playtest/Punk_Data")
REPO = Path(__file__).parent.parent
# Where the generated JSON the app imports lives.
DATA_DIR = REPO / "src/lib/game"

# C# class -> the category the editor uses. A game update that adds e.g. a new
# ModuleData subclass shows up as an "unrecognised class" warning on the next
# extraction; add it to the right set and re-run.
MODULE_CLASSES = {
    "ModuleData",
    "WeaponModuleData",
    "WeaponBasedActiveModuleData",
    "SpawnMinionModuleData",
}
CONSUMABLE_CLASSES = {
    "Consumable",
    "WeaponBasedConsumable",
    "SpawnMinionConsumable",
    "SpawnPrefabConsumable",
}
WEAPON_DATA_CLASSES = {
    "ProjectileWeaponData",
    "HitscanWeaponData",
    "PhysicsWeaponData",
    "MinionSpawnerWeaponData",
}
SLOT_TYPE_CLASSES = {"ModuleSlotType", "LevelChangerSlotType"}

CATEGORY_BY_CLASS: dict[str, str] = {
    **{cls: "Module" for cls in MODULE_CLASSES},
    **{cls: "Consumable" for cls in CONSUMABLE_CLASSES},
    **{cls: "Weapon" for cls in WEAPON_DATA_CLASSES},
    **{cls: "SlotType" for cls in SLOT_TYPE_CLASSES},
    "Resource": "Resource",
    "Ingredient": "Ingredient",
}


def game_data_from_argv() -> Path:
    """The Punk_Data folder: first CLI argument, or the default install."""
    return Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_GAME_DATA


_warned: set[str] = set()


def warn(message: str) -> None:
    """Prints a warning once (scripts share one process under extract-all)."""
    if message not in _warned:
        _warned.add(message)
        print(f"WARNING: {message}", file=sys.stderr)


@dataclass
class Asset:
    """One PUNK ScriptableObject that carries a string `id` (a save-file key)."""

    obj: Any
    """UnityPy ObjectReader (for raw bytes / source file access)."""
    d: dict
    """The parsed MonoBehaviour's fields."""
    id: str
    cls: str | None
    """C# class name from the asset's MonoScript."""

    @property
    def name(self) -> str:
        return self.d.get("m_Name") or ""

    @property
    def category(self) -> str:
        """The editor category. Falls back to the asset name's first word for
        classes not in CATEGORY_BY_CLASS (which `assets()` already warned about)."""
        cat = CATEGORY_BY_CLASS.get(self.cls or "")
        if cat:
            return cat
        return self.name.split(" ")[0] if self.name else "Unknown"

    @property
    def is_module(self) -> bool:
        if self.cls in MODULE_CLASSES:
            return True
        # Fallback for a subclass added by a game update: modules are the only
        # assets pointing at a ModuleType. Surfaced, not silent.
        if "moduleType" in self.d:
            warn(f"{self.id}: class {self.cls} not in MODULE_CLASSES but has moduleType — treating as module")
            return True
        return False


class PunkAssets:
    """The installed game's identifiable assets, scanned once, shared by all scripts."""

    def __init__(self, game_data: Path | None = None):
        self.game_data = game_data or DEFAULT_GAME_DATA
        if not self.game_data.is_dir():
            sys.exit(f"game data folder not found: {self.game_data}")
        print(f"loading {self.game_data} ...")
        self.env = UnityPy.load(str(self.game_data))
        self.unity_version = self._detect_unity_version()
        print(f"unity version {self.unity_version}")
        generator = TypeTreeGenerator(self.unity_version)
        generator.load_local_dll_folder(str(self.game_data / "Managed"))
        self.env.typetree_generator = generator
        self._scripts: dict[tuple[int, int], str] | None = None
        self._assets: list[Asset] | None = None

    def _detect_unity_version(self) -> str:
        versions = {
            sf.unity_version
            for sf in self.env.assets
            if getattr(sf, "unity_version", None)
        }
        if not versions:
            sys.exit("could not detect the Unity version from the game files")
        if len(versions) > 1:
            warn(f"multiple Unity versions in game data: {versions}")
        return sorted(versions)[-1]

    def _script_map(self) -> dict[tuple[int, int], str]:
        """(serialized file, path id) -> C# class name, for every MonoScript."""
        if self._scripts is None:
            self._scripts = {}
            for obj in self.env.objects:
                if obj.type.name != "MonoScript":
                    continue
                try:
                    self._scripts[(id(obj.assets_file), obj.path_id)] = obj.read().m_ClassName
                except Exception:
                    continue
        return self._scripts

    def script_class(self, obj) -> str | None:
        """The C# class of a MonoBehaviour, via the raw-header m_Script pointer
        (see the module docstring for why not `data.m_Script.read()`)."""
        raw = bytes(obj.get_raw_data())
        if len(raw) < 28:
            return None
        file_id, path_id = struct.unpack_from("<iq", raw, 16)
        sf = obj.assets_file
        if file_id > 0:
            try:
                external = sf.externals[file_id - 1].path.split("/")[-1].lower()
            except Exception:
                return None
            sf = next(
                (f for f in self.env.assets if getattr(f, "name", "").lower().split("/")[-1] == external),
                None,
            )
            if sf is None:
                return None
        return self._script_map().get((id(sf), path_id))

    def assets(self) -> list[Asset]:
        """Every MonoBehaviour with a string `id`, classified. Cached."""
        if self._assets is not None:
            return self._assets
        result: list[Asset] = []
        unrecognised: set[str] = set()
        for obj in self.env.objects:
            if obj.type.name != "MonoBehaviour":
                continue
            try:
                data = obj.read(check_read=False)
            except Exception:
                continue
            d = data.__dict__
            ident = d.get("id")
            if not isinstance(ident, str) or not ident:
                continue
            cls = self.script_class(obj)
            if (cls or "") not in CATEGORY_BY_CLASS:
                unrecognised.add(f"{cls} (e.g. {ident})")
            result.append(Asset(obj=obj, d=d, id=ident, cls=cls))
        for entry in sorted(unrecognised):
            warn(f"unrecognised asset class {entry} — add it to punklib.CATEGORY_BY_CLASS")
        self._assets = result
        return result

    def by_class(self, classes: set[str]) -> list[Asset]:
        return [a for a in self.assets() if a.cls in classes]

    def modules(self) -> list[Asset]:
        return [a for a in self.assets() if a.is_module]


# ---------------------------------------------------------------------------
# PPtr helpers (these act on generator-parsed *custom* fields, which resolve
# fine — only the standard-header m_Script is affected by the alignment bug)
# ---------------------------------------------------------------------------


def path_id(pptr) -> int | None:
    """The identity of a PPtr target (used e.g. to match modules to the
    resource sharing their ColorAsset), or None for a null pointer."""
    return getattr(pptr, "m_PathID", None) or None


def read_fields(pptr) -> dict | None:
    """The target object's fields, or None if the pointer is null/unresolvable."""
    if pptr is None or not path_id(pptr):
        return None
    try:
        return pptr.read().__dict__
    except Exception:
        return None


def resource_id(pptr) -> str | None:
    """Resolves a Resource PPtr to its string id (the save-file key)."""
    d = read_fields(pptr)
    ident = d.get("id") if d else None
    return ident if isinstance(ident, str) and ident else None


def unity_color_rgb(color) -> tuple[int, int, int] | None:
    """A UnityEngine.Color (0-1 floats) as 0-255 RGB; alpha is dropped."""
    if color is None:
        return None
    return tuple(
        max(0, min(255, round((getattr(color, ch, 0.0) or 0.0) * 255))) for ch in ("r", "g", "b")
    )


def color_rgb(pptr) -> tuple[int, int, int] | None:
    """Resolves a ColorAsset PPtr to 0-255 RGB."""
    d = read_fields(pptr)
    return unity_color_rgb(d.get("color") if d else None)


def rgb_hex(rgb: tuple[int, int, int] | None) -> str | None:
    return "#%02x%02x%02x" % rgb if rgb else None


def hex_color(pptr) -> str | None:
    return rgb_hex(color_rgb(pptr))


def find_sprite(assets, name: str):
    """The named Sprite in the scan as an RGBA PIL image, or None. Unreadable
    sprites are skipped the way the icon extractors always have."""
    for obj in assets.env.objects:
        if obj.type.name != "Sprite":
            continue
        try:
            data = obj.read()
        except Exception:
            continue
        if (data.m_Name or "") == name:
            return data.image.convert("RGBA")
    return None


def png_data_uri(img) -> str:
    """A PIL image as the data-URI PNG the app inlines. Never resample the
    image first: the editor scales sprites by exact integer factors from their
    native size (see src/lib/game/pixel-icon.ts)."""
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def write_json(path: Path, data: dict) -> None:
    """Sorted, indent=1 — the diff-friendly format all generated JSON uses."""
    path.write_text(json.dumps(dict(sorted(data.items())), indent=1), encoding="utf-8")
    print(f"wrote {len(data)} entries to {path} ({path.stat().st_size} bytes)")
