## Project Configuration

- **Language**: TypeScript
- **Package Manager**: bun
- **Add-ons**: eslint, tailwindcss, sveltekit-adapter (static), mcp

The reference atlas is [`docs/README.md`](docs/README.md); read the doc that
covers what you are touching before touching it. **Before any styling work,
read [`docs/design.md`](docs/design.md)** — `src/lib/components` is the most
edited area in the repo and the design system is what keeps it coherent.
`bun run lint` enforces the parts of it a checker can see
(`scripts/check-style.ts`).

---

## Releasing

`CHANGELOG.md` is the single source for release notes. The app parses it at
build time (`src/lib/changelog.ts`) for the `/changelog` page, and CI reads the
section matching the tag into the GitHub release body. Never write release notes
anywhere else — not in the workflow, not in the changelog page, not in the
release on GitHub.

To ship a version:

1. Write its section in `CHANGELOG.md`, newest first. The heading must read
   `## 1.1.0 — 2026-08-01` (version, em dash, ISO date); `### Added` /
   `### Changed` / `### Fixed` groups under it are optional.
2. `bun run version:set 1.1.0` — writes the version into `package.json`,
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and the `Cargo.lock`
   entry, and refuses to run if the changelog has no section for it.
3. `bun run check && bun run lint`.
4. Commit, then `git tag v1.1.0` and `git push origin master --tags`.
5. The `Release` workflow builds Windows (x64 + ARM64, MSI/NSIS installers plus
   a bare portable `.exe`), macOS (Apple Silicon + Intel, dmg only) and Linux
   (x64 + ARM64, AppImage/deb/rpm) and attaches them all to a **draft** release.
   It fails fast if the tag disagrees with `package.json`. Give it ~15 minutes —
   the assets appear as each platform finishes, so a half-empty release page
   part way through is the build still running, not a failure.
6. A final `rename` job then gives every asset the same name
   (`punk-save-editor_<version>_<os>_<arch>[_<variant>].<ext>`), because each
   bundler otherwise names its own output — `amd64` on the deb, `x86_64` on the
   rpm, `aarch64` on the dmg, a locale on the msi. `scripts/rename-release-assets.ts`
   owns that mapping and is safe to re-run by hand:
   `bun run rename-release-assets v1.1.0 [--dry-run]`.
7. Review the draft on GitHub and publish it. Publishing is the only manual
   step; the notes are already filled in from the changelog.

To re-run a failed release, delete the draft and the tag, fix, and push the tag
again.

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
