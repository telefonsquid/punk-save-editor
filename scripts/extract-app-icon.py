"""Build the editor's own app icon from the game's player-ship sprite.

The game's own window icon is a soft, upscaled version of this same little ship.
Here it is rebuilt crisp and given the editor's own accent: the ship as the game
draws it (white outline, black hull) with its headlight band lit in PUNK orange,
sitting on a warm near-black tile. Two outputs, both page art rather than game
data, so they follow extract-logo.py and land outside src/lib/game:

- `src/lib/assets/favicon.svg` — one <rect> per pixel run, so the browser tab
  icon stays sharp at every size. The layout imports this file directly.
- `static/app-icon.png` — a 1024px master with an anti-aliased rounded tile and
  crisp ship pixels, the source `bun tauri icon` slices into every desktop size.

Page art like the wordmark, so it runs on its own rather than through
extract-all.py. After it, regenerate the desktop set: `bun tauri icon
static/app-icon.png`.

    .venv/Scripts/python.exe scripts/extract-app-icon.py
"""

from __future__ import annotations

from PIL import Image, ImageDraw

import punklib

# The player ship the game flies. Its body sprite is the whole readable shape;
# the separate "highlight" sprite is an in-game lighting overlay that swamps the
# outline when composited, so it is left out.
SPRITE_NAME = "Sprite Ship Body"

# Editor palette (src/routes/layout.css), so the icon matches the app it opens.
TILE = (25, 21, 18)  # --color-surface #191512
OUTLINE = (254, 254, 254)  # --color-ink #fefefe
ACCENT = (254, 158, 32)  # --color-accent #fe9e20
HULL = (0, 0, 0)  # the ship's own black fill

# The bright bar across the ship's middle: the central white run on these two
# rows. Lighting it in the accent is the one liberty that makes the mark ours.
BAND_ROWS = (8, 9)
BAND_COLS = range(7, 17)

REPO = punklib.REPO
STATIC_DIR = REPO / "static"
FAVICON = REPO / "src" / "lib" / "assets" / "favicon.svg"

# Favicon canvas kept tight to the 24x20 ship — just 1px of margin — so at a
# 16px browser tab the ship still fills the space and reads. A roomier tile shrank
# it to an unrecognisable smudge.
TILE_PX = 26
MASTER = 1024  # tauri source size


def load_ship() -> Image.Image:
	assets = punklib.PunkAssets(punklib.game_data_from_argv())
	for obj in assets.env.objects:
		if obj.type.name != "Sprite":
			continue
		try:
			data = obj.read()
		except Exception:
			continue
		if (data.m_Name or "") == SPRITE_NAME:
			return data.image.convert("RGBA")
	punklib.warn(f"sprite {SPRITE_NAME!r} not found — did the ship art get renamed?")
	raise SystemExit(1)


def classify(ship: Image.Image):
	"""Pixel grid -> colour per cell, or None where transparent."""
	px = ship.load()
	grid: list[list[tuple[int, int, int] | None]] = []
	for y in range(ship.height):
		row = []
		for x in range(ship.width):
			r, g, b, a = px[x, y]
			if a < 40:
				row.append(None)
			elif (r + g + b) / 3 > 140:
				lit = y in BAND_ROWS and x in BAND_COLS
				row.append(ACCENT if lit else OUTLINE)
			else:
				row.append(HULL)
		grid.append(row)
	return grid


def hexc(c: tuple[int, int, int]) -> str:
	return "#%02x%02x%02x" % c


def write_favicon(grid, w: int, h: int) -> None:
	dx = (TILE_PX - w) // 2
	dy = (TILE_PX - h) // 2
	rects = [
		f'<rect width="{TILE_PX}" height="{TILE_PX}" rx="3" fill="{hexc(TILE)}"/>'
	]
	# Merge each run of same-colour cells in a row into one rect: fewer, and the
	# shared edges never hairline-crack the way abutting rects can when scaled.
	for y in range(h):
		x = 0
		while x < w:
			c = grid[y][x]
			if c is None:
				x += 1
				continue
			run = 1
			while x + run < w and grid[y][x + run] == c:
				run += 1
			rects.append(
				f'<rect x="{dx + x}" y="{dy + y}" width="{run}" height="1" fill="{hexc(c)}"/>'
			)
			x += run
	svg = (
		f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TILE_PX} {TILE_PX}" '
		f'shape-rendering="crispEdges">\n\t' + "\n\t".join(rects) + "\n</svg>\n"
	)
	FAVICON.parent.mkdir(parents=True, exist_ok=True)
	FAVICON.write_text(svg, encoding="utf-8")
	print(f"  favicon.svg: {len(rects)} rects, {len(svg)} bytes")


def write_master(grid, w: int, h: int) -> None:
	# Rounded tile with smooth corners: draw big, shrink the mask so the curve is
	# anti-aliased while the ship pixels stay hard-edged.
	scale = 4
	mask = Image.new("L", (MASTER * scale, MASTER * scale), 0)
	ImageDraw.Draw(mask).rounded_rectangle(
		[0, 0, MASTER * scale - 1, MASTER * scale - 1],
		radius=int(MASTER * scale * 0.14),
		fill=255,
	)
	mask = mask.resize((MASTER, MASTER), Image.LANCZOS)
	img = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
	img.paste(Image.new("RGBA", (MASTER, MASTER), (*TILE, 255)), (0, 0), mask)

	block = 37  # 24*37 = 888 wide, ~87% of the tile
	ox = (MASTER - w * block) // 2
	oy = (MASTER - h * block) // 2
	draw = ImageDraw.Draw(img)
	for y in range(h):
		for x in range(w):
			c = grid[y][x]
			if c is None:
				continue
			gx, gy = ox + x * block, oy + y * block
			draw.rectangle([gx, gy, gx + block - 1, gy + block - 1], fill=(*c, 255))

	STATIC_DIR.mkdir(parents=True, exist_ok=True)
	img.save(STATIC_DIR / "app-icon.png")
	print(f"  app-icon.png: {MASTER}x{MASTER}")


def main() -> None:
	ship = load_ship()
	grid = classify(ship)
	write_favicon(grid, ship.width, ship.height)
	write_master(grid, ship.width, ship.height)


if __name__ == "__main__":
	main()
