"""Runs every Python extractor against one shared game scan.

Loading and scanning Punk_Data is the expensive part (~a minute); each
extractor's own work is seconds. So this loads the environment once and hands
the same `PunkAssets` to every script. `bun run extract` wraps this plus the
TypeScript steps (module-effects decode, data consistency check).

Usage:
    .venv/Scripts/python scripts/extract-all.py [path-to-Punk_Data]
"""

import importlib.util
from pathlib import Path

import punklib

HERE = Path(__file__).parent

# In dependency-free order; file names are kebab-case, hence importlib.
SCRIPTS = [
    "extract-asset-names",
    "extract-resource-icons",
    "extract-item-icons",
    "extract-module-info",
    "extract-module-effects",
]


def load_module(name: str):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    assets = punklib.PunkAssets(punklib.game_data_from_argv())
    for name in SCRIPTS:
        print(f"\n=== {name} ===")
        load_module(name).run(assets)


if __name__ == "__main__":
    main()
