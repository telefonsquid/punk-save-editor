# Changelog

Every release of the PUNK Save Editor. This file is the only place release notes
are written: the app parses it for its [changelog page](https://punk-editor.henkys.dev/changelog)
and CI reads the matching section into the GitHub release, so the shape of the
headings matters.

- One `## <version> — <YYYY-MM-DD>` heading per release, newest first.
- Optional `### Added` / `### Changed` / `### Fixed` groups under it.
- Everything else is plain bullets or short paragraphs.

## 1.0.1 — 2026-07-27

### Added

- The desktop app's footer links to the web version, where the website links to
  the desktop app.

### Changed

- The changelog opens over the editor instead of replacing it, so reading it no
  longer costs you the save you have open.
- The open save's name and its two buttons now stick to the top of the screen
  once you scroll past them, so saving no longer means scrolling back up. The
  buttons slide into the top right corner as the strip pins.
- Dialogs like "Add a module" now arrive with the same rise-and-fade as the rest
  of the editor instead of appearing all at once.

### Fixed

- Dragging a consumable around the wheel works again in the desktop app. On
  Windows it dropped nothing and dragged the item's icon out to the desktop
  instead.

## 1.0.0 — 2026-07-27

The first public release. Compatible with PUNK v0.12.10.

### Added

- Ship resources on the game's own HUD tank bars, with maximums and recharge
  rates derived from the modules installed on the grid.
- Resources, ingredients and consumables, edited on the game's own item art.
- The consumable wheel: reorder by dragging, add and remove, edit counts.
- Vault modules with connections, power cores and area-of-effect fields,
  including hand-painted custom fields.
- A raw editor for every value in every Odin-serialized save file.
- Runs as a website and as a desktop app for Windows, macOS and Linux.
- Originals are backed up as `*.bak` the first time a file is written.
