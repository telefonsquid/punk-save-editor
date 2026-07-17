"""Regenerates src/lib/save/item-icons.json from the installed game.

Ingredients, consumables and modules each carry a Sprite icon (the item art
shown in the vault/shop): `Ingredient.iconBig`/`iconSmall`, `Consumable.icon`,
`ModuleData.icon`. This resolves each to a PNG and writes an id -> data-URI map
the editor imports so it can show the real item picture next to every entry.

Item art is larger than the resource HUD glyphs, so each sprite is capped to
ITEM_MAX px on its long edge (nearest-neighbour, to keep the pixel-art crisp)
before it is inlined as base64 — keeps the JSON small enough to check in.

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
ITEM_MAX = 64  # cap the long edge; item art is bigger than the HUD glyphs


def pick_icon(d: dict):
    """The sprite field for a module/consumable/ingredient asset, or None."""
    if "moduleType" in d:  # ModuleData
        return d.get("icon")
    if "maxCount" in d and "icon" in d and "lowTreshold" not in d:  # Consumable
        return d.get("icon")
    if "iconBig" in d or "iconSmall" in d:  # Ingredient
        return d.get("iconBig") or d.get("iconSmall")
    return None


gen = TypeTreeGenerator(UNITY_VERSION)
gen.load_local_dll_folder(str(GAME_DATA / "Managed"))

# Load the whole data folder into one environment so cross-file sprite PPtrs
# (the icon usually lives in a different .assets than the asset) resolve.
env = UnityPy.load(str(GAME_DATA))
env.typetree_generator = gen

data_uris: dict[str, str] = {}

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
    if max(img.width, img.height) > ITEM_MAX:
        scale = ITEM_MAX / max(img.width, img.height)
        img = img.resize(
            (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
            Image.NEAREST,
        )
    buf = io.BytesIO()
    img.save(buf, "PNG")
    data_uris[ident] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

data_uris = dict(sorted(data_uris.items()))
OUT.write_text(json.dumps(data_uris, indent=1), encoding="utf-8")
print(f"wrote {len(data_uris)} item icons to {OUT} ({OUT.stat().st_size} bytes)")
