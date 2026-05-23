# Top of playlist rules

Entry point: **Top of playlist** on the home hub → `src/playlist/`.

## Purpose

Show the **top of the party playlist** — the character currently at the top of the ordered list (initiative order or manual sort). GMs use this during play to see who acts first and to open sheets quickly.

## Layout

- Tailwind per [ui.md](ui.md).
- Back link to home hub only on sub-pages; hub itself has no extra links.
- **Highlight** the first row (playlist top): larger type, accent border, `aria-label="Playlist top"`.

## Data

- Load exports from `src/party/` via `party-loader.js` (same as GM console).
- Sort order (default): descending **initiative misc** on sheet if present, else character name.
- Empty state: short message + hint to run `npm run party:index` after copying JSON into `src/party/`.

## Actions per row

- **Open sheet** — stash character, navigate to `src/sheet/index.html`.
- Rows below the top use the standard readable button styles from [ui.md](ui.md).

## Future

- Drag-to-reorder playlist (persist order in `localStorage` or campaign file).
- Sync with combat tracker / encounter tool.
