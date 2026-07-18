"""Regenerates src/lib/save/item-icons.json from the installed game.

Ingredients, consumables and modules each carry a Sprite icon (the item art
shown in the vault/shop): `Ingredient.iconBig`/`iconSmall`, `Consumable.icon`,
`ModuleData.icon`. This resolves each to a PNG and writes an id -> data-URI map
the editor imports so it can show the real item picture next to every entry.

Sprites are inlined at their **native pixel size**. Do not resample them here:
the editor displays every icon at an exact integer multiple of its natural size
so the pixel grid stays intact, and a resize step upstream (the old long-edge
cap) silently scaled sprites by a non-integer factor and broke that.

**Module icons are tinted here.** A module's sprite on disk is a white/grey
stencil with black outlines — it is never that colour on screen. The game tints
it at runtime: `ModuleIconWidget.SetColor` assigns the module's `ColorAsset` to
`Image.color`, and Unity multiplies the sprite by it. So the colour is part of
what a module icon *is*, and the same multiply is baked in here (white pixels
become the colour, black outlines stay black, greys become shades of it). Doing
it at extraction rather than in CSS keeps the editor rendering plain `<img>`s
with nearest-neighbour scaling — a CSS blend/mask would have to filter the
scaled-up bitmap and would soften the pixel edges the rule above protects.

Usage:
    python -m venv venv
    venv/Scripts/pip install UnityPy TypeTreeGeneratorAPI
    venv/Scripts/python scripts/extract-item-icons.py [path-to-Punk_Data]
"""

import base64
import io
import json
import sys
from pathlib import Path

import UnityPy
from PIL import Image
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

GAME_DATA = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else r"C:/data/apps/Steam/steamapps/common/PUNK Playtest/Punk_Data"
)
OUT = Path(__file__).parent.parent / "src/lib/save/item-icons.json"
UNITY_VERSION = "6000.3.4f1"


def pick_icon(d: dict):
    """The sprite field for a module/consumable/ingredient asset, or None."""
    if "moduleType" in d:  # ModuleData
        return d.get("icon")
    if "maxCount" in d and "icon" in d and "lowTreshold" not in d:  # Consumable
        return d.get("icon")
    if "iconBig" in d or "iconSmall" in d:  # Ingredient
        return d.get("iconBig") or d.get("iconSmall")
    return None


def module_tint(d: dict) -> tuple[int, int, int] | None:
    """The module's ColorAsset as 0-255 RGB, or None for a non-module asset."""
    if "moduleType" not in d:
        return None
    pptr = d.get("color")
    if pptr is None or not getattr(pptr, "m_PathID", None):
        return None
    try:
        color = pptr.read().__dict__.get("color")
    except Exception:
        return None
    if color is None:
        return None
    return tuple(
        max(0, min(255, round((getattr(color, ch, 0.0) or 0.0) * 255))) for ch in ("r", "g", "b")
    )


def tinted(img: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """Unity's `Image.color`: multiply each channel, leave alpha alone."""
    img = img.convert("RGBA")
    r, g, b, a = img.split()
    channels = [
        channel.point(lambda v, m=multiplier: v * m // 255)
        for channel, multiplier in zip((r, g, b), rgb)
    ]
    return Image.merge("RGBA", (*channels, a))


gen = TypeTreeGenerator(UNITY_VERSION)
gen.load_local_dll_folder(str(GAME_DATA / "Managed"))

# Load the whole data folder into one environment so cross-file sprite PPtrs
# (the icon usually lives in a different .assets than the asset) resolve.
env = UnityPy.load(str(GAME_DATA))
env.typetree_generator = gen

data_uris: dict[str, str] = {}
tinted_count = 0

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
    icon = pick_icon(d)
    if icon is None:
        continue
    try:
        img = icon.read().image  # PIL.Image cropped to the sprite rect
    except Exception as e:
        print(f"  {ident}: could not read icon ({e})")
        continue
    rgb = module_tint(d)
    if rgb is not None and rgb != (255, 255, 255):
        img = tinted(img, rgb)
        tinted_count += 1
    buf = io.BytesIO()
    img.save(buf, "PNG")
    data_uris[ident] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

data_uris = dict(sorted(data_uris.items()))
OUT.write_text(json.dumps(data_uris, indent=1), encoding="utf-8")
print(f"wrote {len(data_uris)} item icons to {OUT} ({OUT.stat().st_size} bytes)")
print(f"  {tinted_count} module icons tinted by their ColorAsset")
