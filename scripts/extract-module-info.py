"""Regenerates src/lib/save/module-info.json from the installed game.

Two things the editor needs about a module that aren't in the save file:

1. **Colour / resource.** Every `ModuleData` points at a `ColorAsset`, and so
   does every `Resource`. Modules share the *same* ColorAsset object as the
   resource they belong to (a tech/Caps weapon and `Resource Caps` both point at
   the orange one), so matching on the ColorAsset's path_id recovers which
   resource a module maps to — which is what gives modules their colour in the
   game's own UI.
2. **Defaults for a module the editor adds to the vault.** `Module.Memento`
   stores a `powerLevel` and a `powerCore` field grid, neither of which can be
   invented: the power level comes from the asset's `MinMaxInt powerLevel` and
   the power core is a *sprite* the game converts to a bool grid
   (`ModuleEffectField.Parse`: alpha > 0.5 per pixel).

`ModuleEffectField.Parse` also applies a random mirror/rotation when the game
draws a core, so there is no single canonical orientation; this writes the base
orientation, which is one of the orientations the game itself could have drawn.
In practice every core in the game is symmetric, so it makes no difference.

Usage:
    python -m venv .venv
    .venv/Scripts/pip install UnityPy TypeTreeGeneratorAPI Pillow
    .venv/Scripts/python scripts/extract-module-info.py [path-to-Punk_Data]
"""

import json
import sys
from pathlib import Path

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

GAME_DATA = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else r"C:/data/apps/Steam/steamapps/common/PUNK Playtest/Punk_Data"
)
OUT = Path(__file__).parent.parent / "src/lib/save/module-info.json"
UNITY_VERSION = "6000.3.4f1"

gen = TypeTreeGenerator(UNITY_VERSION)
gen.load_local_dll_folder(str(GAME_DATA / "Managed"))

# One environment for the whole folder so the cross-file ColorAsset/Sprite
# PPtrs resolve (they live in a different .assets than the ModuleData).
env = UnityPy.load(str(GAME_DATA))
env.typetree_generator = gen


def path_id(pptr) -> int | None:
    """The identity of a PPtr target, used to match modules to resources."""
    return None if pptr is None else getattr(pptr, "m_PathID", None)


def hex_color(pptr) -> str | None:
    """Resolves a ColorAsset PPtr to a #rrggbb string."""
    if pptr is None or not path_id(pptr):
        return None
    try:
        color = pptr.read().__dict__.get("color")
    except Exception:
        return None
    if color is None:
        return None
    channels = []
    for name in ("r", "g", "b"):
        v = getattr(color, name, 0.0) or 0.0
        channels.append(max(0, min(255, round(v * 255))))
    return "#%02x%02x%02x" % tuple(channels)


def power_core(distribution) -> dict | None:
    """First item of a SpriteDistribution as a bool grid, base orientation.

    Mirrors ModuleEffectField.Parse: a pixel with alpha > 0.5 is a filled cell.
    Unity's GetPixels is bottom-up while PIL is top-down, so the rows are
    flipped to match the indexing the game writes into the save.
    """
    items = getattr(distribution, "items", None)
    if not items:
        return None
    try:
        sprite = items[0].value.read()
        img = sprite.image.convert("RGBA")
    except Exception:
        return None
    w, h = img.size
    px = img.load()
    data = []
    for y in range(h):
        for x in range(w):
            data.append(1 if px[x, h - 1 - y][3] > 127 else 0)
    return {"width": w, "height": h, "data": data}


color_to_resource: dict[int, str] = {}
modules: dict[str, dict] = {}

for obj in env.objects:
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
    # Resource: claims its ColorAsset so modules sharing it can be matched.
    if "isShared" in d and "lowTreshold" in d:
        pid = path_id(d.get("color"))
        if pid:
            color_to_resource[pid] = ident
        continue
    if "moduleType" not in d:
        continue
    level = d.get("powerLevel")
    entry: dict = {
        "color": hex_color(d.get("color")),
        "colorAsset": path_id(d.get("color")),
        "powerLevel": [getattr(level, "Min", 1) or 1, getattr(level, "Max", 1) or 1],
        "powerCore": power_core(d.get("powerCore")),
    }
    modules[ident] = entry

# Resolve each module's ColorAsset to the resource that shares it.
matched = 0
for entry in modules.values():
    resource = color_to_resource.get(entry.pop("colorAsset"))
    entry["resource"] = resource
    if resource:
        matched += 1

modules = dict(sorted(modules.items()))
OUT.write_text(json.dumps(modules, indent=1), encoding="utf-8")
print(f"wrote {len(modules)} modules to {OUT} ({OUT.stat().st_size} bytes)")
print(f"  {matched} mapped to a resource, {len(modules) - matched} unmapped")
print(f"  {sum(1 for m in modules.values() if m['powerCore'])} with a power core")
