"""Regenerates src/lib/game/resource-icons.json from the installed game.

A `Resource` carries *four* pieces of art, not one, and the game uses each in a
different place — so they are grouped under the resource id instead of the old
one-icon-per-id map:

| key         | field                        | where the game uses it |
| ----------- | ---------------------------- | ---------------------- |
| `icon`      | `Sprite icon`                | the HUD glyph / label icon (8-13 px) |
| `bar`       | `resourceBarTexture`         | one full-size unit of the HUD bar; the only *large* art that differs per resource |
| `barCompact`| `resourceBarTextureCompact`  | the compact bar unit |
| `barMicro`  | `resourceBarTextureMicro`    | the micro bar unit |

The compact and micro textures are *shared* by every resource (the same grey
sprite) — the game tells them apart by tinting with the resource's colour, which
is why `color` is written alongside. `Resource Money` has no large bar at all
(money isn't a tank), so `bar` is simply absent for it; the app falls back.

`orderInHud` is the order the game lists resources in, and is what the editor
sorts resource rows by.

Usage (or `bun run extract` for everything):
    .venv/Scripts/python scripts/extract-resource-icons.py [path-to-Punk_Data]
"""

import punklib

# json key -> the Resource field it comes from.
ART = {
    "icon": "icon",
    "bar": "resourceBarTexture",
    "barCompact": "resourceBarTextureCompact",
    "barMicro": "resourceBarTextureMicro",
}


def art_uri(pptr) -> str | None:
    """A Sprite/Texture2D pointer as a native-size PNG data URI, or None."""
    if pptr is None or not punklib.path_id(pptr):
        return None
    try:
        return punklib.png_data_uri(pptr.read().image)
    except Exception:
        return None


def run(assets: punklib.PunkAssets) -> None:
    resources: dict[str, dict] = {}
    for a in assets.by_class({"Resource"}):
        entry: dict = {
            "color": punklib.hex_color(a.d.get("color")),
            "orderInHud": a.d.get("orderInHud", 0),
        }
        for key, field in ART.items():
            uri = art_uri(a.d.get(field))
            if uri:
                entry[key] = uri
        missing = [k for k in ART if k not in entry]
        if missing:
            print(f"  {a.id}: no {', '.join(missing)}")
        resources[a.id] = entry
    punklib.write_json(punklib.DATA_DIR / "resource-icons.json", resources)
    for key in ART:
        print(f"  {sum(1 for r in resources.values() if key in r)} with {key}")


if __name__ == "__main__":
    run(punklib.PunkAssets(punklib.game_data_from_argv()))
