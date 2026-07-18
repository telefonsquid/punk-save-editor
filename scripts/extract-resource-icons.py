"""Regenerates src/lib/game/resource-icons.json from the installed game.

Each `Resource` ScriptableObject has a `Sprite icon` (the little HUD glyph for
health/fuel/etc.). This resolves every resource's icon to a PNG and writes an
id -> data-URI map the editor imports. These are tiny pixel-art sprites
(~8-13 px), inlined at native size (see the pixel-art rule in punklib.png_data_uri).

Usage (or `bun run extract` for everything):
    .venv/Scripts/python scripts/extract-resource-icons.py [path-to-Punk_Data]
"""

import punklib


def run(assets: punklib.PunkAssets) -> None:
    data_uris: dict[str, str] = {}
    for a in assets.by_class({"Resource"}):
        icon = a.d.get("icon")
        if icon is None:
            continue
        try:
            img = icon.read().image  # PIL.Image cropped to the sprite rect
        except Exception as e:
            print(f"  {a.id}: could not read icon ({e})")
            continue
        data_uris[a.id] = punklib.png_data_uri(img)
        print(f"  {a.id}: {img.width}x{img.height}")
    punklib.write_json(punklib.DATA_DIR / "resource-icons.json", data_uris)


if __name__ == "__main__":
    run(punklib.PunkAssets(punklib.game_data_from_argv()))
