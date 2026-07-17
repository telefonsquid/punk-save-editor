"""Regenerates src/lib/save/resource-icons.json from the installed game.

Each `Resource` ScriptableObject has a `Sprite icon` (the little HUD glyph for
health/fuel/etc.). This resolves every resource's icon to a PNG and writes an
id -> data-URI map the editor imports. These are tiny pixel-art sprites
(~8-13 px), so inlining them as base64 keeps the editor self-contained.

Usage:
    python -m venv venv
    venv/Scripts/pip install UnityPy TypeTreeGeneratorAPI
    venv/Scripts/python scripts/extract-resource-icons.py [path-to-Punk_Data]
"""

import base64
import io
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
OUT = Path(__file__).parent.parent / "src/lib/save/resource-icons.json"
UNITY_VERSION = "6000.3.4f1"

gen = TypeTreeGenerator(UNITY_VERSION)
gen.load_local_dll_folder(str(GAME_DATA / "Managed"))

# Load the whole data folder into one environment so cross-file sprite PPtrs
# (the icon lives in a different .assets than the Resource) resolve.
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
    # A Resource asset: string id plus the resource-only fields, and an icon.
    if not isinstance(ident, str) or "isShared" not in d or "lowTreshold" not in d:
        continue
    icon = d.get("icon")
    if icon is None:
        continue
    try:
        img = icon.read().image  # PIL.Image cropped to the sprite rect
    except Exception as e:
        print(f"  {ident}: could not read icon ({e})")
        continue
    buf = io.BytesIO()
    img.save(buf, "PNG")
    data_uris[ident] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    print(f"  {ident}: {img.width}x{img.height}")

data_uris = dict(sorted(data_uris.items()))
OUT.write_text(json.dumps(data_uris, indent=1), encoding="utf-8")
print(f"\nwrote {len(data_uris)} icons to {OUT}")
